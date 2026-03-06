import { useState, useEffect, useRef, useCallback } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref as dbRef, push, set, onValue, update, remove } from "firebase/database";

// ============================================================
// FIREBASE CONFIG
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyCh7W6BMXLiBNZL9rXKCRLZtijrjh2GaQE",
  authDomain: "snyders-gambling-cave.firebaseapp.com",
  databaseURL: "https://snyders-gambling-cave-default-rtdb.firebaseio.com",
  projectId: "snyders-gambling-cave",
  storageBucket: "snyders-gambling-cave.firebasestorage.app",
  messagingSenderId: "582048025157",
  appId: "1:582048025157:web:99c18d74b9fca6c54f712c",
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getDatabase(firebaseApp);

// ============================================================
// CONFIG
// ============================================================
const ODDS_API_KEY = "7fec6f19b1eb6838a13fa733bee6d610";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
const ANTHROPIC_KEY = "PASTE_YOUR_ANTHROPIC_KEY_HERE"; // get from console.anthropic.com
const ANTHROPIC_HDR = {
  "Content-Type": "application/json",
  "x-api-key": ANTHROPIC_KEY,
  "anthropic-version": "2023-06-01",
  "anthropic-dangerous-direct-browser-access": "true",
};
const PARTY_DATE = new Date("2026-03-19T12:00:00-05:00");

const INDIANA_IMG = "https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Indiana_Hoosiers_logo.svg/800px-Indiana_Hoosiers_logo.svg.png";
const RANDY_GIF = "https://media1.tenor.com/m/NN89l8Ln8iIAAAAd/randy-marsh-south-park.gif";

const SPORTSBOOK_URLS = {
  "DraftKings": "https://www.draftkings.com",
  "FanDuel": "https://www.fanduel.com",
  "BetMGM": "https://www.betmgm.com",
  "Caesars": "https://www.caesars.com/sportsbook-and-casino",
  "ESPN BET": "https://espnbet.com",
};

const RAZZ = [
  "CHECK YOUR SQUARES DADCHELOR!","YOUR BRACKET IS DEAD",
  "SHOULDVE LISTENED TO THE CAVE","WHO PICKED THAT TEAM???",
  "PORTFOLIO LOOKING ROUGH BRO","DADDY NEEDS A TIMEOUT",
  "BIG YIKES FROM THE CAVE","WRONG PICK!",
  "DRINK EVERY TIME YOURE WRONG","BOW DOWN TO THE CAVE ORACLE",
];
const HYPE = [
  "LETS GOOOOO!","WERE PRINTING MONEY!","CAVE PREDICTS AGAIN!",
  "CASH THAT TICKET!","WE RIDE TOGETHER!","BRACKET KING!",
];

// ============================================================
// COST TRACKER
// Cost: Sonnet input ~$3/M tokens, output ~$15/M tokens
// Odds API: 500 free calls/month
// ============================================================
const costTracker = {
  oracleCalls: 0,
  inputTokens: 0,
  outputTokens: 0,
  oddsApiCalls: 0,
  listeners: [],
  notify() { this.listeners.forEach(fn => fn({ ...this })); },
  addOracle(inputTok, outputTok) {
    this.oracleCalls++;
    this.inputTokens += inputTok;
    this.outputTokens += outputTok;
    this.notify();
  },
  addOddsCall() {
    this.oddsApiCalls++;
    this.notify();
  },
  getCost() {
    const oracle = (this.inputTokens / 1_000_000) * 3 + (this.outputTokens / 1_000_000) * 15;
    return oracle.toFixed(4);
  },
  subscribe(fn) {
    this.listeners.push(fn);
    return () => { this.listeners = this.listeners.filter(l => l !== fn); };
  },
};

function useCostTracker() {
  const [state, setState] = useState({
    oracleCalls: 0, inputTokens: 0, outputTokens: 0, oddsApiCalls: 0,
  });
  useEffect(() => costTracker.subscribe(setState), []);
  return { ...state, cost: costTracker.getCost() };
}

async function callOracle(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: ANTHROPIC_HDR,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: 'You are the Cave Oracle, a sharp funny sports betting analyst for a March Madness dadchelor party at Snyders Gambling Cave. Return ONLY valid JSON: {"picks":[{"pick":"Team or Bet name","reasoning":"Short punchy reason","value":"HIGH","confidence":75,"site":"DraftKings"}],"usage":{"input_tokens":500,"output_tokens":300}}',
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  // Track real token usage from API response
  const inputTok = data.usage?.input_tokens || 600;
  const outputTok = data.usage?.output_tokens || 400;
  costTracker.addOracle(inputTok, outputTok);
  const raw = data.content?.[0]?.text || '{"picks":[]}';
  try { return JSON.parse(raw.replace(/```json|```/g,"")); } catch { return { picks: [] }; }
}

// ============================================================
// PARLAY ODDS CALCULATOR
// ============================================================
function calcParlayOdds(legs) {
  const valid = legs.filter(l => l.odds && !isNaN(parseFloat(l.odds)));
  if (!valid.length) return null;
  const dec = valid.map(l => {
    const o = parseFloat(l.odds);
    return o > 0 ? (o / 100) + 1 : (100 / Math.abs(o)) + 1;
  });
  const combined = dec.reduce((a, b) => a * b, 1);
  const american = combined >= 2
    ? Math.round((combined - 1) * 100)
    : Math.round(-100 / (combined - 1));
  return american > 0 ? `+${american}` : `${american}`;
}

// ============================================================
// COUNTDOWN
// ============================================================
function useCountdown(target) {
  const [diff, setDiff] = useState(target - Date.now());
  useEffect(() => {
    const t = setInterval(() => setDiff(target - Date.now()), 1000);
    return () => clearInterval(t);
  }, [target]);
  if (diff <= 0) return null;
  return {
    d: Math.floor(diff / 86400000),
    h: Math.floor((diff % 86400000) / 3600000),
    m: Math.floor((diff % 3600000) / 60000),
    s: Math.floor((diff % 60000) / 1000),
  };
}

// ============================================================
// TOAST
// ============================================================
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div style={{position:"fixed",top:80,right:16,zIndex:200,background:"#161624",border:"1px solid #f5c842",borderRadius:8,padding:"12px 18px",maxWidth:300,fontFamily:"Oswald,sans-serif",fontSize:"0.9rem",color:"#e8e8f0",boxShadow:"0 4px 20px rgba(0,0,0,0.5)"}}>
      {msg}
    </div>
  );
}

// ============================================================
// OVERLAYS
// ============================================================
function WinOverlay({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 4000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.9)",zIndex:300,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",cursor:"pointer"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"4rem",letterSpacing:8,background:"linear-gradient(135deg,#f5c842,#00e676,#f5c842)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent",textAlign:"center"}}>LETS GOOO</div>
      <div style={{fontFamily:"Oswald,sans-serif",fontSize:"1.5rem",color:"#e8e8f0",marginTop:12,textAlign:"center"}}>{msg}</div>
      <div style={{color:"#6a6a8a",marginTop:16,fontSize:"0.85rem"}}>tap to close</div>
    </div>
  );
}

function RandyOverlay({ onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 6000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:400,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",background:"rgba(0,0,0,0.95)",cursor:"pointer"}}>
      <img src={RANDY_GIF} alt="Randy" style={{maxWidth:"80vw",maxHeight:"70vh",borderRadius:12,border:"4px solid #ff1744",boxShadow:"0 0 60px rgba(255,23,68,0.8)"}} />
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"3rem",letterSpacing:6,color:"#ff1744",marginTop:20,textAlign:"center",textShadow:"0 0 30px rgba(255,23,68,0.8)"}}>PURDUE LOSES LOL</div>
      <div style={{color:"#6a6a8a",marginTop:10,fontSize:"0.85rem"}}>tap to close</div>
    </div>
  );
}

function IndianaFlash({ onDone }) {
  useEffect(() => { const t = setTimeout(onDone, 2500); return () => clearTimeout(t); }, [onDone]);
  return (
    <div style={{position:"fixed",inset:0,zIndex:350,background:"rgba(153,0,0,0.93)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",pointerEvents:"none"}}>
      <img src={INDIANA_IMG} alt="Indiana" style={{width:280,filter:"drop-shadow(0 0 40px rgba(255,255,255,0.9))"}} />
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"3.5rem",letterSpacing:6,color:"#fff",marginTop:20,textAlign:"center",textShadow:"0 0 30px white"}}>INDIANA NATIONAL CHAMPIONS</div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.5rem",letterSpacing:4,color:"#ffcc00",marginTop:8}}>IT IS WRITTEN</div>
    </div>
  );
}

// ============================================================
// RAZZ BANNER — big visible banner across the top when triggered
// ============================================================
function RazzBanner({ banner, onClose }) {
  const { msg, type } = banner;
  const isHype = type === "hype";
  const bg = isHype ? "linear-gradient(135deg,#00c853,#1b5e20)" : "linear-gradient(135deg,#ff1744,#b71c1c)";
  const glow = isHype ? "rgba(0,200,83,0.5)" : "rgba(255,23,68,0.5)";
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",top:0,left:0,right:0,zIndex:250,background:bg,padding:"16px 20px",textAlign:"center",cursor:"pointer",boxShadow:`0 4px 30px ${glow}`}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2rem",letterSpacing:6,color:"#fff",textShadow:`0 0 20px rgba(255,255,255,0.6)`}}>{msg}</div>
    </div>
  );
}

// ============================================================
// COUNTDOWN BAR
// ============================================================
function Countdown({ target }) {
  const cd = useCountdown(target.getTime());
  if (!cd) return <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.1rem",letterSpacing:3,color:"#ff1744"}}>TIPPING OFF NOW 🏀</div>;
  return (
    <div style={{display:"flex",gap:8,alignItems:"center"}}>
      {[["d",cd.d],["h",cd.h],["m",cd.m],["s",cd.s]].map(([l,v])=>(
        <div key={l} style={{textAlign:"center",background:"#0f0f1a",border:"1px solid #252538",borderRadius:6,padding:"3px 10px",minWidth:44}}>
          <div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1.3rem",fontWeight:700,color:"#f5c842"}}>{String(v).padStart(2,"0")}</div>
          <div style={{fontSize:"0.58rem",color:"#6a6a8a",letterSpacing:2}}>{l.toUpperCase()}</div>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// COST METER — top right header widget
// ============================================================
function CostMeter() {
  const { oracleCalls, oddsApiCalls, cost } = useCostTracker();
  const costNum = parseFloat(cost);
  const costColor = costNum < 0.10 ? "#00e676" : costNum < 0.50 ? "#f5c842" : "#ff1744";
  return (
    <div style={{background:"#0a0a14",border:"1px solid #252538",borderRadius:8,padding:"6px 12px",display:"flex",gap:12,alignItems:"center",fontFamily:"'Source Code Pro',monospace",fontSize:"0.72rem"}}>
      <div style={{textAlign:"center"}}>
        <div style={{color:"#6a6a8a",fontSize:"0.58rem",letterSpacing:1,marginBottom:1}}>ORACLE</div>
        <div style={{color:"#d500f9",fontWeight:700}}>{oracleCalls}</div>
      </div>
      <div style={{width:1,height:28,background:"#252538"}} />
      <div style={{textAlign:"center"}}>
        <div style={{color:"#6a6a8a",fontSize:"0.58rem",letterSpacing:1,marginBottom:1}}>ODDS API</div>
        <div style={{color:"#2979ff",fontWeight:700}}>{oddsApiCalls}<span style={{color:"#6a6a8a",fontSize:"0.6rem"}}>/500</span></div>
      </div>
      <div style={{width:1,height:28,background:"#252538"}} />
      <div style={{textAlign:"center"}}>
        <div style={{color:"#6a6a8a",fontSize:"0.58rem",letterSpacing:1,marginBottom:1}}>EST COST</div>
        <div style={{color:costColor,fontWeight:700}}>${cost}</div>
      </div>
    </div>
  );
}

// ============================================================
// PHOTO STRIP
// ============================================================
const THUMB_WINDOW = 5;

// Load photos from localStorage, falling back to defaults
const PHOTO_DEFAULTS = [
  { id:"p1", emoji:"🤵", label:"THE DADCHELOR", caption:"Last day of freedom", color:"#1a0e05" },
  { id:"p2", emoji:"😅", label:"ROOKIE MOVE", caption:"His last good decision", color:"#05101a" },
  { id:"p3", emoji:"🎰", label:"CAVE CREW", caption:"March Madness 2026", color:"#10051a" },
];

// ── shared image resizer ──────────────────────────────────────
async function resizeToBase64(file, maxPx=500, quality=0.75) {
  return new Promise(res => {
    const reader = new FileReader();
    reader.onload = ev => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(maxPx / img.width, maxPx / img.height, 1);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        res(canvas.toDataURL("image/jpeg", quality).split(",")[1]);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ── Firebase-backed photo strip ───────────────────────────────
function PhotoStrip({ toast }) {
  const [fbPhotos, setFbPhotos] = useState([]); // from Firebase
  const [slideIdx, setSlideIdx] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const [uploading, setUploading] = useState(false);
  const ref = useRef();

  // Subscribe to Firebase photos in real-time
  useEffect(() => {
    const r = dbRef(db, "photos");
    const unsub = onValue(r, snap => {
      const val = snap.val();
      if (!val) { setFbPhotos([]); return; }
      const arr = Object.entries(val)
        .map(([fbKey, p]) => ({ ...p, fbKey }))
        .sort((a, b) => (b.ts || 0) - (a.ts || 0));
      setFbPhotos(arr);
    });
    return () => unsub();
  }, []);

  const photos = fbPhotos.length ? fbPhotos : PHOTO_DEFAULTS;
  const total = photos.length;

  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % total), 4000);
    return () => clearInterval(t);
  }, [total]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    setUploading(true);
    toast(`Uploading ${files.length} photo${files.length > 1 ? "s" : ""}...`);
    for (const file of files) {
      try {
        const base64 = await resizeToBase64(file, 500, 0.75);
        await push(dbRef(db, "photos"), {
          base64, label: "NEW DROP", caption: "Fresh from the cave", ts: Date.now()
        });
      } catch(err) { toast("Upload failed — " + err.message); }
    }
    setUploading(false);
    setSlideIdx(0);
    toast(`${files.length} photo${files.length > 1 ? "s" : ""} live on the wall! 📸`);
  };

  const clearPhotos = async () => {
    if (!window.confirm("Clear all uploaded photos from the wall?")) return;
    await remove(dbRef(db, "photos"));
  };

  const thumbIndices = (() => {
    if (total <= THUMB_WINDOW) return Array.from({length: total}, (_, i) => i);
    const half = Math.floor(THUMB_WINDOW / 2);
    const start = Math.max(0, Math.min(slideIdx - half, total - THUMB_WINDOW));
    return Array.from({length: THUMB_WINDOW}, (_, i) => start + i);
  })();

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent("https://www.snydersgamblingcave.com")}&bgcolor=07070f&color=f5c842&margin=10`;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:6,flex:1}}>
          DADCHELOR WALL OF SHAME
          {total > 3 && <span style={{fontSize:"0.68rem",color:"#6a6a8a",marginLeft:8}}>{slideIdx+1}/{total}</span>}
          {uploading && <span style={{fontSize:"0.65rem",color:"#2979ff",marginLeft:8,animation:"pulse 1s infinite"}}>uploading...</span>}
        </div>
        <div style={{display:"flex",gap:6,marginLeft:10}}>
          <button onClick={()=>setShowQR(!showQR)} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"4px 10px",background:"transparent",color:"#2979ff",border:"1px solid #2979ff",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>QR</button>
          <button onClick={()=>ref.current?.click()} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"4px 10px",background:"transparent",color:"#f5c842",border:"1px solid #f5c842",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>+ PHOTOS</button>
          <button onClick={clearPhotos} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"4px 8px",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>✕</button>
          <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles} />
        </div>
      </div>
      {showQR && (
        <div style={{display:"flex",alignItems:"center",gap:14,padding:12,background:"#0f0f1a",borderRadius:8,border:"1px solid #252538",marginBottom:10}}>
          <img src={qrUrl} alt="QR" style={{width:72,height:72,borderRadius:6}} />
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:"#f5c842",fontSize:"0.95rem"}}>SCAN TO JOIN THE CAVE</div>
            <div style={{fontSize:"0.72rem",color:"#6a6a8a",marginTop:3}}>Point phone camera here to upload photos</div>
            <div style={{fontSize:"0.7rem",color:"#2979ff",marginTop:2}}>snydersgamblingcave.com</div>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6}}>
        {thumbIndices.map(idx => {
          const p = photos[idx];
          if (!p) return null;
          return (
            <div key={p.fbKey||p.id} onClick={()=>setSlideIdx(idx)} style={{flexShrink:0,borderRadius:6,overflow:"hidden",border:`2px solid ${idx===slideIdx?"#f5c842":"#252538"}`,width:130,cursor:"pointer",transition:"border-color 0.3s",position:"relative"}}>
              {p.base64
                ? <img src={`data:image/jpeg;base64,${p.base64}`} alt={p.label} style={{width:130,height:130,objectFit:"cover"}} loading="lazy" />
                : <div style={{width:130,height:130,background:p.color||"#1a1a2e",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"3rem"}}>{p.emoji}</div>
              }
              <div style={{padding:"4px 6px",background:"#0f0f1a"}}>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.72rem",color:"#f5c842",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.label}</div>
                <div style={{fontSize:"0.6rem",color:"#6a6a8a",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{p.caption}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// LIVE ODDS API
// ============================================================
function useOddsAPI(isLive) {
  const [games, setGames] = useState([]);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);
  const intervalRef = useRef(null);

  const fetchOdds = useCallback(async () => {
    try {
      costTracker.addOddsCall();
      const res = await fetch(
        `${ODDS_API_BASE}/sports/basketball_ncaab/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&bookmakers=draftkings,fanduel,betmgm,caesars&oddsFormat=american`
      );
      if (!res.ok) throw new Error(`API ${res.status}`);
      const data = await res.json();
      const now = Date.now();
      const mapped = data
        .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
        .slice(0, 14)
        .map(g => {
          const dk = g.bookmakers?.find(b => b.key==="draftkings") || g.bookmakers?.[0];
          const h2h = dk?.markets?.find(m => m.key==="h2h");
          const spread = dk?.markets?.find(m => m.key==="spreads");
          const total = dk?.markets?.find(m => m.key==="totals");
          const ml1 = h2h?.outcomes?.find(o => o.name===g.home_team)?.price;
          const ml2 = h2h?.outcomes?.find(o => o.name===g.away_team)?.price;
          const sp = spread?.outcomes?.find(o => o.name===g.home_team);
          const ou = total?.outcomes?.find(o => o.name==="Over")?.point;
          const start = new Date(g.commence_time).getTime();
          const isLiveGame = now > start && now < start + 3*3600000;
          const isFinal = now > start + 3*3600000;
          return {
            id: g.id,
            team1: g.home_team.replace(/University( of)?/gi,"").replace("State","St").trim(),
            team2: g.away_team.replace(/University( of)?/gi,"").replace("State","St").trim(),
            ml1: ml1 ?? null, ml2: ml2 ?? null,
            spread: sp ? `${sp.point > 0 ? "+" : ""}${sp.point}` : "N/A",
            ou: ou?.toString() ?? "N/A",
            live: isLiveGame, final: isFinal,
            time: new Date(g.commence_time).toLocaleTimeString([],{hour:"2-digit",minute:"2-digit"}),
            date: new Date(g.commence_time).toLocaleDateString([],{month:"short",day:"numeric"}),
            s1: 0, s2: 0,
          };
        });
      setGames(mapped);
      setLastUpdate(new Date().toLocaleTimeString());
      setError(null);
    } catch(e) { setError(e.message); }
  }, []);

  useEffect(() => {
    if (isLive) { fetchOdds(); intervalRef.current = setInterval(fetchOdds, 3*60*1000); }
    else clearInterval(intervalRef.current);
    return () => clearInterval(intervalRef.current);
  }, [isLive, fetchOdds]);

  return { games, lastUpdate, error, refresh: fetchOdds };
}

// ============================================================
// ESPN LIVE SCORES — polls every 60s, free no-key API
// ============================================================
function useESPNScores(isLive) {
  const [scores, setScores] = useState([]);
  const [scoresUpdate, setScoresUpdate] = useState(null);
  const [scoresError, setScoresError] = useState(null);
  const prevScoresRef = useRef([]);
  const intervalRef = useRef(null);

  const fetchScores = useCallback(async (onPurdueLost) => {
    try {
      const res = await fetch(
        "https://site.api.espn.com/apis/site/v2/sports/basketball/mens-college-basketball/scoreboard"
      );
      if (!res.ok) throw new Error(`ESPN ${res.status}`);
      const data = await res.json();

      const mapped = (data.events || []).map(e => {
        const comp = e.competitions?.[0];
        const home = comp?.competitors?.find(c => c.homeAway === "home");
        const away = comp?.competitors?.find(c => c.homeAway === "away");
        const status = comp?.status?.type;
        return {
          id: e.id,
          home: home?.team?.shortDisplayName || home?.team?.displayName || "?",
          away: away?.team?.shortDisplayName || away?.team?.displayName || "?",
          homeScore: parseInt(home?.score || "0"),
          awayScore: parseInt(away?.score || "0"),
          homeLogo: home?.team?.logo || "",
          awayLogo: away?.team?.logo || "",
          homeRank: home?.curatedRank?.current,
          awayRank: away?.curatedRank?.current,
          state: status?.state || "pre",   // pre | in | post
          period: comp?.status?.period || 0,
          clock: comp?.status?.displayClock || "",
          statusText: status?.shortDetail || status?.description || "",
          isFinal: status?.completed || false,
          isLive: status?.state === "in",
        };
      });

      // Purdue loss detection — compare to previous fetch
      mapped.forEach(g => {
        const prev = prevScoresRef.current.find(p => p.id === g.id);
        if (!prev) return;
        const homePurdue = g.home.toLowerCase().includes("purdue");
        const awayPurdue = g.away.toLowerCase().includes("purdue");
        if (!homePurdue && !awayPurdue) return;
        const purdueJustLost =
          g.isFinal && !prev.isFinal &&
          ((homePurdue && g.homeScore < g.awayScore) ||
           (awayPurdue && g.awayScore < g.homeScore));
        if (purdueJustLost && onPurdueLost) onPurdueLost();
      });

      prevScoresRef.current = mapped;
      setScores(mapped);
      setScoresUpdate(new Date().toLocaleTimeString());
      setScoresError(null);
    } catch(e) {
      setScoresError(e.message);
    }
  }, []);

  // Store callback ref so interval always has latest version
  const callbackRef = useRef(null);

  const start = useCallback((onPurdueLost) => {
    callbackRef.current = onPurdueLost;
    fetchScores(onPurdueLost);
    intervalRef.current = setInterval(() => fetchScores(callbackRef.current), 60 * 1000);
  }, [fetchScores]);

  const stop = useCallback(() => {
    clearInterval(intervalRef.current);
  }, []);

  return { scores, scoresUpdate, scoresError, start, stop, refetch: fetchScores };
}


// ============================================================
// GAME CARD
// ============================================================
function GameCard({ g, selected, onSelect }) {
  const fmtML = v => v == null ? "N/A" : (v > 0 ? "+" : "") + v;
  return (
    <div onClick={() => onSelect(g)} style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",alignItems:"center",gap:6,padding:10,borderRadius:6,background:"#0f0f1a",border:`1px solid ${selected?"#f5c842":"#252538"}`,marginBottom:6,cursor:"pointer",transition:"border-color 0.2s"}}>
      <div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.95rem"}}>{g.team1}</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.95rem",color:"#6a6a8a"}}>{g.team2}</div>
      </div>
      <div style={{textAlign:"center",minWidth:80}}>
        {g.live && !g.final && <>
          <div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center",marginBottom:2}}>
            <span style={{width:6,height:6,borderRadius:"50%",background:"#ff1744",display:"inline-block",animation:"pulse 1s infinite"}} />
            <span style={{fontSize:"0.62rem",color:"#ff1744"}}>LIVE</span>
          </div>
          <div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1.1rem",fontWeight:700}}>{g.s1}-{g.s2}</div>
        </>}
        {g.final && <div style={{fontFamily:"'Source Code Pro',monospace",color:"#6a6a8a",fontSize:"0.82rem"}}>FINAL<br/>{g.s1}-{g.s2}</div>}
        {!g.live && !g.final && <div><div style={{fontSize:"0.8rem",color:"#f5c842"}}>{g.time}</div><div style={{fontSize:"0.62rem",color:"#6a6a8a"}}>{g.date}</div></div>}
      </div>
      <div style={{textAlign:"right",fontSize:"0.7rem"}}>
        <div style={{marginBottom:2}}><span style={{color:"#f5c842"}}>SPR</span> {g.spread}</div>
        <div style={{marginBottom:2}}><span style={{color:"#2979ff"}}>O/U</span> {g.ou}</div>
        <div>
          <span style={{background:g.ml1<0?"rgba(255,23,68,0.12)":"rgba(0,230,118,0.12)",color:g.ml1<0?"#ff1744":"#00e676",padding:"1px 5px",borderRadius:3,fontFamily:"'Source Code Pro',monospace",fontSize:"0.7rem"}}>{fmtML(g.ml1)}</span>
          {" "}
          <span style={{background:g.ml2<0?"rgba(255,23,68,0.12)":"rgba(0,230,118,0.12)",color:g.ml2<0?"#ff1744":"#00e676",padding:"1px 5px",borderRadius:3,fontFamily:"'Source Code Pro',monospace",fontSize:"0.7rem"}}>{fmtML(g.ml2)}</span>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// VOTE PANEL WITH PARLAYS
// ============================================================
function VotePanel({ toast, onAddVote }) {
  const DEFAULT_VOTES = [
    { id:"v1", type:"single", pick:"Duke ML", odds:"-150", yes:5, no:2, myVote:null },
    { id:"v2", type:"single", pick:"Purdue -1.5", odds:"-110", yes:3, no:4, myVote:null },
    { id:"v3", type:"parlay", pick:"Cave Parlay", legs:[{pick:"UConn ML",odds:"-130"},{pick:"Kansas -5.5",odds:"-110"},{pick:"Over 142",odds:"-108"}], yes:7, no:1, myVote:null },
  ];
  const [votes, setVotes] = useState(DEFAULT_VOTES);
  const [mode, setMode] = useState("single");
  const [newPick, setNewPick] = useState("");
  const [newOdds, setNewOdds] = useState("");
  const [parlayLegs, setParlayLegs] = useState([{pick:"",odds:""}]);
  const [parlayName, setParlayName] = useState("");

  // Expose addVote so parent can call it when "PUT TO VOTE" is clicked on a game
  useEffect(() => { if (onAddVote) onAddVote.current = addSingle; }, []);

  const castVote = (id, yn) => {
    setVotes(v => v.map(x => x.id!==id||x.myVote ? x : {...x,[yn]:x[yn]+1,myVote:yn}));
    toast(yn==="yes" ? "You are IN! 🤑" : "You folded. 😤");
  };

  const addSingle = (pick, odds) => {
    if (!pick?.trim()) return;
    setVotes(v => [...v, {id:"v"+Date.now(),type:"single",pick:pick.trim(),odds:odds||"N/A",yes:0,no:0,myVote:null}]);
  };

  const handleAddSingle = () => { addSingle(newPick, newOdds); setNewPick(""); setNewOdds(""); toast("Added to vote!"); };

  const addParlay = () => {
    const legs = parlayLegs.filter(l => l.pick.trim());
    if (!legs.length) return;
    setVotes(v => [...v, {id:"v"+Date.now(),type:"parlay",pick:parlayName.trim()||`${legs.length}-Leg Parlay`,legs,yes:0,no:0,myVote:null}]);
    setParlayLegs([{pick:"",odds:""}]); setParlayName("");
    toast("Parlay added! 🎰");
  };

  const inp = {background:"#0f0f1a",border:"1px solid #252538",borderRadius:4,padding:"5px 8px",color:"#e8e8f0",fontFamily:"Oswald,sans-serif",fontSize:"0.82rem"};
  const btn = {fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,padding:"5px 12px",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"};

  return (
    <div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>RIDE TOGETHER?</div>
      {votes.map(v => {
        const total = v.yes+v.no||1;
        const pct = Math.round((v.yes/total)*100);
        const po = v.type==="parlay" ? calcParlayOdds(v.legs||[]) : null;
        return (
          <div key={v.id} style={{background:"#0f0f1a",border:"1px solid rgba(245,200,66,0.3)",borderRadius:8,padding:12,marginBottom:10}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:4}}>
              <div>
                {v.type==="parlay" && <span style={{background:"rgba(213,0,249,0.2)",color:"#d500f9",fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.62rem",letterSpacing:2,padding:"1px 6px",borderRadius:3,marginRight:6}}>PARLAY</span>}
                <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.9rem"}}>{v.pick}</span>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:6}}>
                {po && <span style={{fontFamily:"'Source Code Pro',monospace",fontSize:"0.82rem",color:"#d500f9",fontWeight:700}}>{po}</span>}
                {v.type==="single" && v.odds && <span style={{fontFamily:"'Source Code Pro',monospace",fontSize:"0.82rem",color:"#00e676",fontWeight:700}}>{v.odds}</span>}
                <button onClick={()=>setVotes(x=>x.filter(y=>y.id!==v.id))} style={{background:"none",border:"none",color:"#6a6a8a",cursor:"pointer"}}>×</button>
              </div>
            </div>
            {v.type==="parlay" && v.legs && (
              <div style={{marginBottom:8}}>
                {v.legs.map((l,i) => (
                  <div key={i} style={{fontSize:"0.72rem",color:"#6a6a8a",display:"flex",justifyContent:"space-between",padding:"2px 0",borderBottom:"1px solid rgba(255,255,255,0.05)"}}>
                    <span>{l.pick}</span><span style={{color:"#00e676"}}>{l.odds}</span>
                  </div>
                ))}
              </div>
            )}
            <div style={{height:16,background:"#252538",borderRadius:8,overflow:"hidden",margin:"6px 0"}}>
              <div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#00e676,#f5c842)",transition:"width 0.5s"}} />
            </div>
            <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.7rem",color:"#6a6a8a",marginBottom:8}}>
              <span style={{color:"#00e676"}}>RIDE {v.yes}</span><span>{pct}% IN</span><span style={{color:"#ff1744"}}>SKIP {v.no}</span>
            </div>
            {!v.myVote
              ? <div style={{display:"flex",gap:6}}>
                  <button style={{...btn,background:"#00e676",color:"#000",flex:1}} onClick={()=>castVote(v.id,"yes")}>RIDE 🤑</button>
                  <button style={{...btn,background:"#ff1744",color:"#fff",flex:1}} onClick={()=>castVote(v.id,"no")}>SKIP 🚫</button>
                </div>
              : <div style={{textAlign:"center",fontSize:"0.8rem",color:v.myVote==="yes"?"#00e676":"#ff1744"}}>{v.myVote==="yes"?"You are IN":"You folded"} — {pct}% riding</div>
            }
          </div>
        );
      })}
      <div style={{background:"#0f0f1a",border:"1px solid #252538",borderRadius:8,padding:10,marginTop:8}}>
        <div style={{display:"flex",gap:4,marginBottom:8}}>
          {["single","parlay"].map(m => (
            <button key={m} onClick={()=>setMode(m)} style={{...btn,flex:1,background:mode===m?"#161624":"transparent",color:mode===m?(m==="parlay"?"#d500f9":"#f5c842"):"#6a6a8a",border:"none",fontSize:"0.8rem"}}>
              {m==="single"?"SINGLE BET":"PARLAY"}
            </button>
          ))}
        </div>
        {mode==="single" && (
          <div style={{display:"flex",gap:4,flexWrap:"wrap"}}>
            <input value={newPick} onChange={e=>setNewPick(e.target.value)} onKeyDown={e=>e.key==="Enter"&&handleAddSingle()} placeholder="Pick (e.g. Duke ML)" style={{...inp,flex:2,minWidth:100}} />
            <input value={newOdds} onChange={e=>setNewOdds(e.target.value)} placeholder="Odds" style={{...inp,width:75}} />
            <button style={{...btn,background:"#f5c842",color:"#000"}} onClick={handleAddSingle}>ADD</button>
          </div>
        )}
        {mode==="parlay" && (
          <div>
            <input value={parlayName} onChange={e=>setParlayName(e.target.value)} placeholder="Parlay name (optional)" style={{...inp,width:"100%",marginBottom:6}} />
            {parlayLegs.map((leg,i) => (
              <div key={i} style={{display:"flex",gap:4,marginBottom:4}}>
                <input value={leg.pick} onChange={e=>{const n=[...parlayLegs];n[i]={...n[i],pick:e.target.value};setParlayLegs(n);}} placeholder={`Leg ${i+1}`} style={{...inp,flex:2}} />
                <input value={leg.odds} onChange={e=>{const n=[...parlayLegs];n[i]={...n[i],odds:e.target.value};setParlayLegs(n);}} placeholder="Odds" style={{...inp,width:70}} />
                {parlayLegs.length>1 && <button onClick={()=>setParlayLegs(parlayLegs.filter((_,j)=>j!==i))} style={{background:"none",border:"none",color:"#ff1744",cursor:"pointer"}}>×</button>}
              </div>
            ))}
            {calcParlayOdds(parlayLegs.filter(l=>l.odds)) && (
              <div style={{fontSize:"0.75rem",color:"#d500f9",marginBottom:6,fontFamily:"'Source Code Pro',monospace"}}>Combined: {calcParlayOdds(parlayLegs.filter(l=>l.odds))}</div>
            )}
            <div style={{display:"flex",gap:4}}>
              <button onClick={()=>setParlayLegs([...parlayLegs,{pick:"",odds:""}])} style={{...btn,background:"transparent",color:"#6a6a8a",border:"1px solid #252538",flex:1,fontSize:"0.75rem"}}>+ LEG</button>
              <button onClick={addParlay} style={{...btn,background:"#d500f9",color:"#fff",flex:1}}>ADD PARLAY</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================================
// ORACLE
// ============================================================
function OraclePanel({ isLive, toast, games }) {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchPicks = async () => {
    if (!isLive || loading) return;
    setLoading(true);
    const gameList = games.length
      ? games.slice(0,4).map(g=>`${g.team1} vs ${g.team2} (spread: ${g.spread}, O/U: ${g.ou})`).join(", ")
      : "March Madness tournament games tonight";
    try {
      const result = await callOracle(`Analyze: ${gameList}. Find the 4 best bets including parlay opportunities for our dadchelor party cave crew.`);
      setPicks(result.picks || []);
      setLastFetch(new Date().toLocaleTimeString());
      toast("Oracle has spoken! 🔮");
    } catch(e) { toast("Oracle failed — check console"); console.error(e); }
    setLoading(false);
  };

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842"}}>CAVE ORACLE</div>
        <button onClick={fetchPicks} disabled={!isLive||loading} style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,padding:"4px 12px",background:isLive&&!loading?"#f5c842":"transparent",color:isLive&&!loading?"#000":"#6a6a8a",border:`1px solid ${isLive&&!loading?"#f5c842":"#252538"}`,borderRadius:4,cursor:"pointer",fontSize:"0.78rem"}}>
          {loading?"READING...":"GET PICKS"}
        </button>
      </div>
      {!isLive && <div style={{textAlign:"center",padding:30,color:"#6a6a8a",fontSize:"0.85rem"}}>Turn on GO LIVE to use the Oracle</div>}
      {isLive && loading && <div style={{padding:14,color:"#f5c842",fontFamily:"'Source Code Pro',monospace",fontSize:"0.85rem"}}>Cave Oracle analyzing the lines...</div>}
      {isLive && !loading && !picks.length && <div style={{textAlign:"center",padding:20,color:"#6a6a8a",fontSize:"0.85rem"}}>Hit GET PICKS to consult the Oracle 🔮</div>}
      {picks.map((p,i) => (
        <div key={i} onClick={()=>setExpanded(expanded===i?null:i)} style={{background:"#0f0f1a",border:`1px solid ${p.value==="HIGH"?"rgba(245,200,66,0.5)":"#252538"}`,borderRadius:6,padding:10,marginBottom:8,cursor:"pointer"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.95rem",color:p.value==="HIGH"?"#f5c842":"#e8e8f0",flex:1,marginRight:8}}>{p.pick}</div>
            <div style={{textAlign:"right",flexShrink:0}}>
              <div style={{fontSize:"0.68rem",color:p.value==="HIGH"?"#f5c842":"#6a6a8a"}}>{p.value}</div>
              <div style={{color:"#00e676",fontFamily:"'Source Code Pro',monospace"}}>{p.confidence}%</div>
            </div>
          </div>
          <div style={{height:4,background:"#252538",borderRadius:2,marginTop:6}}><div style={{height:"100%",width:`${p.confidence}%`,background:"linear-gradient(90deg,#2979ff,#00e676)",borderRadius:2}} /></div>
          {expanded===i && <div style={{marginTop:8,fontSize:"0.78rem",color:"#6a6a8a",lineHeight:1.55,borderTop:"1px solid #252538",paddingTop:8}}>{p.reasoning}<div style={{color:"#2979ff",fontSize:"0.72rem",marginTop:4}}>{p.site}</div></div>}
        </div>
      ))}
      {lastFetch && <div style={{fontSize:"0.68rem",color:"#6a6a8a",textAlign:"right",marginTop:4}}>Updated {lastFetch}</div>}
    </div>
  );
}

// ============================================================
// LEDGER
// ============================================================
function Ledger() {
  const [ledger, setLedger] = useState({bets:0,wins:0,losses:0,push:0,net:0});
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({...ledger});
  const save = () => { const b={}; Object.keys(draft).forEach(k=>{b[k]=parseFloat(draft[k])||0;}); setLedger(b); setEditing(false); };
  const inp = {background:"#252538",border:"none",borderRadius:3,padding:"2px 6px",color:"#e8e8f0",fontFamily:"'Source Code Pro',monospace",fontWeight:700,width:70,fontSize:"0.82rem",textAlign:"right"};
  const netStr = `${ledger.net>=0?"+":""}$${Math.abs(ledger.net)}`;
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,flex:1}}>CAVE LEDGER</div>
        <button onClick={()=>editing?save():setEditing(true)} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"3px 8px",background:editing?"#00e676":"transparent",color:editing?"#000":"#f5c842",border:`1px solid ${editing?"#00e676":"#f5c842"}`,borderRadius:4,cursor:"pointer",fontSize:"0.72rem",marginLeft:8}}>
          {editing?"SAVE":"EDIT"}
        </button>
      </div>
      {[
        ["BETS TODAY", editing?<input style={inp} value={draft.bets} onChange={e=>setDraft({...draft,bets:e.target.value})}/>:ledger.bets, "#e8e8f0"],
        ["WINS",       editing?<input style={inp} value={draft.wins} onChange={e=>setDraft({...draft,wins:e.target.value})}/>:ledger.wins, "#00e676"],
        ["LOSSES",     editing?<input style={inp} value={draft.losses} onChange={e=>setDraft({...draft,losses:e.target.value})}/>:ledger.losses, "#ff1744"],
        ["PUSH",       editing?<input style={inp} value={draft.push} onChange={e=>setDraft({...draft,push:e.target.value})}/>:ledger.push, "#6a6a8a"],
        ["NET P/L",    editing?<input style={inp} value={draft.net} onChange={e=>setDraft({...draft,net:e.target.value})}/>:netStr, ledger.net>=0?"#00e676":"#ff1744"],
        ["CAVE RECORD",`${ledger.wins}-${ledger.losses}-${ledger.push}`,"#e8e8f0"],
      ].map(([l,v,c])=>(
        <div key={l} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 0",borderBottom:"1px solid #252538",fontSize:"0.8rem"}}>
          <span style={{color:"#6a6a8a"}}>{l}</span>
          <span style={{fontFamily:"'Source Code Pro',monospace",fontWeight:700,color:c}}>{v}</span>
        </div>
      ))}
    </div>
  );
}

// ============================================================
// AI SLIP READER — reads bet details from photo using Claude vision
// ============================================================
async function readSlipWithAI(base64Image) {
  costTracker.addOracle(800, 300); // estimate tokens for vision call
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: ANTHROPIC_HDR,
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 400,
      system: 'You are reading a sports betting slip image. Extract the bet details and return ONLY valid JSON with no extra text: {"pick":"team or bet description","odds":"e.g. -110 or +150","amount":"dollar amount wagered e.g. 25","payout":"potential payout e.g. 47.50","book":"sportsbook name"}. If you cannot read a field clearly use "?".',
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64Image } },
          { type: "text", text: "Read this betting slip and extract the details as JSON." }
        ]
      }]
    }),
  });
  const data = await res.json();
  const raw = data.content?.[0]?.text || "{}";
  try { return JSON.parse(raw.replace(/```json|```/g, "").trim()); }
  catch { return { pick: "Unreadable slip", odds: "?", amount: "?", payout: "?", book: "?" }; }
}


// ============================================================
// SLIP PANEL + BET TRACKER
// ============================================================
// ── Shared slip upload logic (used by SlipPanel + MobileUpload) ──
async function uploadSlipToFirebase(file, name, toast) {
  const b64 = await resizeToBase64(file, 600, 0.8);
  const slipRef = push(dbRef(db, "slips"));
  const tempData = { fbKey: slipRef.key, name, base64: b64, pick: "Reading slip...", odds:"?", amount:"?", payout:"?", book:"?", status:"pending", ts: Date.now() };
  await set(slipRef, tempData);
  try {
    const details = await readSlipWithAI(b64);
    await update(slipRef, { ...details, status: "open" });
    toast && toast(`Slip read! ${details.pick||"Bet"} added 🎰`);
  } catch {
    await update(slipRef, { pick:"Unreadable — fill in manually", status:"open" });
    toast && toast("Slip saved — AI couldn't read it");
  }
}

function SlipPanel({ toast, onWin }) {
  const [slips, setSlips] = useState([]);
  const [pendingName, setPendingName] = useState("");
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const ref = useRef();

  // Subscribe to Firebase slips
  useEffect(() => {
    const r = dbRef(db, "slips");
    const unsub = onValue(r, snap => {
      const val = snap.val();
      if (!val) { setSlips([]); return; }
      const arr = Object.entries(val)
        .map(([fbKey, s]) => ({ ...s, fbKey }))
        .sort((a, b) => (b.ts||0) - (a.ts||0));
      setSlips(arr);
    });
    return () => unsub();
  }, []);

  const handleFiles = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    setPendingFiles(files);
    setShowNamePrompt(true);
    e.target.value = "";
  };

  const confirmUpload = async () => {
    const name = pendingName.trim() || "Anonymous";
    setShowNamePrompt(false);
    setPendingName("");
    for (const file of pendingFiles) {
      await uploadSlipToFirebase(file, name, toast);
    }
    setPendingFiles([]);
  };

  const setStatus = async (fbKey, status) => {
    await update(dbRef(db, `slips/${fbKey}`), { status });
    if (status === "won") { toast("CASH IT! 🤑💰"); onWin && onWin(); }
    if (status === "lost") toast("Tough break. Next one. 💸");
  };

  const statusColor = { open:"#f5c842", won:"#00e676", lost:"#ff1744", push:"#6a6a8a", pending:"#252538" };
  const statusLabel = { open:"PENDING", won:"WON ✓", lost:"LOST ✗", push:"PUSH", pending:"⏳" };

  return (
    <div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>BET SLIP TRACKER</div>

      {showNamePrompt && (
        <div style={{background:"#0f0f1a",border:"1px solid #f5c842",borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:"#f5c842",marginBottom:8}}>WHO'S SLIP IS THIS?</div>
          <input value={pendingName} onChange={e=>setPendingName(e.target.value)} onKeyDown={e=>e.key==="Enter"&&confirmUpload()} placeholder="Enter your name..." autoFocus
            style={{width:"100%",background:"#161624",border:"1px solid #252538",borderRadius:4,padding:"7px 10px",color:"#e8e8f0",fontFamily:"Oswald,sans-serif",fontSize:"0.9rem",marginBottom:8}} />
          <div style={{display:"flex",gap:6}}>
            <button onClick={confirmUpload} style={{flex:1,padding:"7px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#f5c842",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>READ MY SLIP 🔮</button>
            <button onClick={()=>{setShowNamePrompt(false);setPendingFiles([]);}} style={{padding:"7px 12px",fontFamily:"'Bebas Neue',sans-serif",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>CANCEL</button>
          </div>
        </div>
      )}

      <div onClick={()=>ref.current?.click()} style={{border:"2px dashed #252538",borderRadius:8,padding:14,textAlign:"center",cursor:"pointer",marginBottom:10}}>
        <div style={{fontSize:"1.6rem",marginBottom:3}}>📸</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",letterSpacing:2,color:"#f5c842"}}>UPLOAD YOUR SLIP</div>
        <div style={{fontSize:"0.7rem",color:"#6a6a8a"}}>AI reads bet details • syncs to all screens</div>
        <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles} />
      </div>

      <div style={{maxHeight:480,overflowY:"auto"}}>
        {!slips.length && <div style={{textAlign:"center",padding:16,color:"#6a6a8a",fontSize:"0.82rem"}}>No slips yet — anyone can upload from their phone</div>}
        {slips.map(s => (
          <div key={s.fbKey} style={{background:"#0f0f1a",border:`1px solid ${statusColor[s.status]||"#252538"}`,borderRadius:8,padding:10,marginBottom:10}}>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              {s.base64 && <img src={`data:image/jpeg;base64,${s.base64}`} alt="slip" style={{width:64,height:64,objectFit:"cover",borderRadius:4,flexShrink:0}} />}
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.85rem",color:"#f5c842",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"60%"}}>{s.name}</div>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.7rem",color:statusColor[s.status],letterSpacing:1,flexShrink:0}}>{statusLabel[s.status]}</span>
                </div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.82rem",color:s.status==="pending"?"#6a6a8a":"#e8e8f0",marginBottom:2}}>{s.pick}</div>
                <div style={{display:"flex",gap:8,fontSize:"0.7rem",color:"#6a6a8a",flexWrap:"wrap"}}>
                  <span>Odds: <span style={{color:"#00e676",fontFamily:"'Source Code Pro',monospace"}}>{s.odds}</span></span>
                  <span>Bet: <span style={{color:"#f5c842",fontFamily:"'Source Code Pro',monospace"}}>${s.amount}</span></span>
                  <span>Win: <span style={{color:"#00e676",fontFamily:"'Source Code Pro',monospace"}}>${s.payout}</span></span>
                </div>
              </div>
            </div>
            {s.status === "open" && (
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>setStatus(s.fbKey,"won")} style={{flex:2,padding:"7px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#00e676",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>WIN 🤑</button>
                <button onClick={()=>setStatus(s.fbKey,"lost")} style={{flex:2,padding:"7px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#ff1744",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>LOSS 💸</button>
                <button onClick={()=>setStatus(s.fbKey,"push")} style={{flex:1,padding:"7px",fontFamily:"'Bebas Neue',sans-serif",background:"#252538",color:"#6a6a8a",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>PUSH</button>
              </div>
            )}
            {(s.status==="won"||s.status==="lost"||s.status==="push") && (
              <button onClick={()=>setStatus(s.fbKey,"open")} style={{width:"100%",padding:"4px",fontFamily:"'Bebas Neue',sans-serif",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.72rem",letterSpacing:1}}>UNDO</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// LEADERBOARD — reads live from Firebase slips
// ============================================================
function Leaderboard() {
  const [slips, setSlips] = useState([]);

  useEffect(() => {
    const r = dbRef(db, "slips");
    const unsub = onValue(r, snap => {
      const val = snap.val();
      if (!val) { setSlips([]); return; }
      setSlips(Object.values(val));
    });
    return () => unsub();
  }, []);

  const players = {};
  slips.forEach(b => {
    if (!b.name || b.status === "pending") return;
    if (!players[b.name]) players[b.name] = { name:b.name, bets:0, wins:0, losses:0, push:0, net:0 };
    const p = players[b.name];
    p.bets++;
    const amt = parseFloat(b.amount) || 0;
    const payout = parseFloat(b.payout) || 0;
    if (b.status === "won")  { p.wins++;   p.net += payout; }
    if (b.status === "lost") { p.losses++; p.net -= amt; }
    if (b.status === "push") { p.push++; }
  });

  const sorted = Object.values(players).sort((a,b) => b.net - a.net);
  const medals = ["🥇","🥈","🥉"];

  if (!sorted.length) return (
    <div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>CREW LEADERBOARD</div>
      <div style={{textAlign:"center",padding:20,color:"#6a6a8a",fontSize:"0.82rem"}}>Upload slips to start the leaderboard 🏆</div>
    </div>
  );

  const best = sorted[0];
  const worst = sorted[sorted.length-1];

  return (
    <div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>CREW LEADERBOARD</div>
      {sorted.map((p, i) => {
        const netColor = p.net > 0 ? "#00e676" : p.net < 0 ? "#ff1744" : "#6a6a8a";
        const netStr = `${p.net >= 0 ? "+" : ""}$${Math.abs(p.net).toFixed(2)}`;
        const isLeader = i === 0 && p.net > 0;
        const isDonkey = i === sorted.length - 1 && sorted.length > 1 && p.net < 0;
        return (
          <div key={p.name} style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px",borderRadius:6,marginBottom:6,background:isLeader?"rgba(245,200,66,0.08)":"#0f0f1a",border:`1px solid ${isLeader?"rgba(245,200,66,0.4)":isDonkey?"rgba(255,23,68,0.3)":"#252538"}`}}>
            <div style={{fontSize:"1.1rem",width:24,textAlign:"center"}}>{medals[i] || (isDonkey ? "🫏" : "")}</div>
            <div style={{flex:1}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.9rem",color:isLeader?"#f5c842":"#e8e8f0"}}>{p.name}{isLeader?" 👑":""}{isDonkey?" 💀":""}</div>
              <div style={{fontSize:"0.65rem",color:"#6a6a8a"}}>{p.bets} bets • {p.wins}W-{p.losses}L{p.push?`-${p.push}P`:""}</div>
            </div>
            <div style={{fontFamily:"'Source Code Pro',monospace",fontWeight:700,fontSize:"0.95rem",color:netColor}}>{netStr}</div>
          </div>
        );
      })}
      {sorted.length > 1 && (
        <div style={{marginTop:8,padding:"6px 10px",background:"#0a0a14",borderRadius:6,fontSize:"0.7rem",color:"#6a6a8a",display:"flex",justifyContent:"space-between"}}>
          <span>🔥 Leading: <span style={{color:"#f5c842"}}>{best.name}</span></span>
          <span>💀 Bleeding: <span style={{color:"#ff1744"}}>{worst.name}</span></span>
        </div>
      )}
    </div>
  );
}

// ============================================================
// HALFTIME ENTERTAINMENT — video player with fullscreen
// ============================================================
// Extract YouTube video ID from any YouTube URL format
function getYouTubeId(url) {
  const patterns = [
    /youtu\.be\/([^?&]+)/,
    /youtube\.com\/watch\?v=([^&]+)/,
    /youtube\.com\/embed\/([^?&]+)/,
    /youtube\.com\/shorts\/([^?&]+)/,
  ];
  for (const p of patterns) {
    const m = url.match(p);
    if (m) return m[1];
  }
  return null;
}

// PLACEHOLDER YouTube ID — replace with real video when ready
const PLACEHOLDER_YT_ID = "dQw4w9WgXcQ"; // classic placeholder

function HalftimePlayer({ toast }) {
  const SAVED_URL = (() => { try { return localStorage.getItem("cave_yt_url") || ""; } catch { return ""; } })();
  const [ytUrl, setYtUrl] = useState(SAVED_URL);
  const [inputVal, setInputVal] = useState(SAVED_URL);
  const [editing, setEditing] = useState(!SAVED_URL);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef();

  const videoId = getYouTubeId(ytUrl) || PLACEHOLDER_YT_ID;
  const isPlaceholder = !getYouTubeId(ytUrl);

  const saveUrl = () => {
    const id = getYouTubeId(inputVal);
    if (!inputVal.trim()) {
      // clear back to placeholder
      setYtUrl("");
      setEditing(false);
      try { localStorage.removeItem("cave_yt_url"); } catch {}
      return;
    }
    if (!id) { toast("Invalid YouTube URL — paste the full link"); return; }
    setYtUrl(inputVal);
    setEditing(false);
    try { localStorage.setItem("cave_yt_url", inputVal); } catch {}
    toast("Power Hour loaded! 🎉");
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().then(() => setIsFullscreen(true)).catch(()=>{});
    } else {
      document.exitFullscreen().then(() => setIsFullscreen(false));
    }
  };

  useEffect(() => {
    const fn = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", fn);
    return () => document.removeEventListener("fullscreenchange", fn);
  }, []);

  const embedUrl = `https://www.youtube.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1`;

  return (
    <div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:12}}>
        🎉 HALFTIME ENTERTAINMENT
      </div>

      {/* PLACEHOLDER BANNER */}
      {isPlaceholder && (
        <div style={{background:"rgba(245,200,66,0.08)",border:"1px solid rgba(245,200,66,0.3)",borderRadius:6,padding:"8px 12px",marginBottom:10,fontSize:"0.75rem",color:"#f5c842",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>
          ⚠ PLACEHOLDER VIDEO — Paste your Power Hour YouTube link below when ready
        </div>
      )}

      {/* YOUTUBE EMBED */}
      <div ref={containerRef} style={{position:"relative",background:"#000",borderRadius:8,overflow:"hidden",border:"1px solid #252538",marginBottom:10}}>
        <div style={{position:"relative",paddingBottom:"56.25%",height:0}}>
          <iframe
            key={videoId}
            src={embedUrl}
            title="Power Hour"
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            allowFullScreen
            style={{position:"absolute",top:0,left:0,width:"100%",height:"100%"}}
          />
        </div>
        <button onClick={toggleFullscreen} style={{position:"absolute",top:8,right:8,background:"rgba(0,0,0,0.7)",border:"1px solid #f5c842",color:"#f5c842",borderRadius:4,cursor:"pointer",fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.72rem",letterSpacing:1,padding:"3px 8px",zIndex:10}}>
          {isFullscreen ? "EXIT ⊠" : "FULLSCREEN ⛶"}
        </button>
      </div>

      {/* URL INPUT */}
      {editing ? (
        <div style={{display:"flex",gap:6,marginBottom:8}}>
          <input
            value={inputVal}
            onChange={e=>setInputVal(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&saveUrl()}
            placeholder="Paste YouTube URL here..."
            autoFocus
            style={{flex:1,background:"#0f0f1a",border:"1px solid #f5c842",borderRadius:4,padding:"7px 10px",color:"#e8e8f0",fontFamily:"Oswald,sans-serif",fontSize:"0.85rem"}}
          />
          <button onClick={saveUrl} style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,padding:"7px 14px",background:"#f5c842",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>SAVE</button>
          {ytUrl && <button onClick={()=>setEditing(false)} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"7px 10px",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>CANCEL</button>}
        </div>
      ) : (
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"6px 10px",background:"#0f0f1a",borderRadius:6,border:"1px solid #252538",marginBottom:8}}>
          <span style={{fontSize:"0.72rem",color:"#6a6a8a",fontFamily:"'Source Code Pro',monospace",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"75%"}}>
            {ytUrl || "No video set"}
          </span>
          <button onClick={()=>{setInputVal(ytUrl);setEditing(true);}} style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,padding:"3px 8px",background:"transparent",color:"#f5c842",border:"1px solid #f5c842",borderRadius:3,cursor:"pointer",fontSize:"0.72rem",flexShrink:0}}>
            {ytUrl ? "SWAP" : "ADD LINK"}
          </button>
        </div>
      )}

      <div style={{padding:"7px 10px",background:"#0f0f1a",borderRadius:6,border:"1px solid #252538",fontSize:"0.7rem",color:"#6a6a8a"}}>
        <span style={{color:"#f5c842",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>HOW TO: </span>
        Friend uploads video to YouTube as <span style={{color:"#e8e8f0"}}>Unlisted</span> → pastes the link here → hit FULLSCREEN and share screen to TV
      </div>
    </div>
  );
}

// ============================================================
// AIRHORN — real MP3 embedded as base64
// ============================================================
const AIRHORN_B64 = "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B6NccOoFBmYQLhAMkM+bCi2yPRhYMKB5jhuZiXGEg5my6bg3muIIOOQSLAI6AgqYiMAIeb9yC2z9CAXMyPTODExMKSHMGDzFBcOGQaGGNkxmZwZ2iGaHZkwalYYOCKDGAhxjJAZWYGZlCNBhY8LF5lSqb5OnUTZwjOZ0AgEKL4o7InmID5lhqZL/8+Bk0zkGCxgA7ewAAAADSAHAAAADpKGGhxEBmAihjYgCgZlZf0tDAlPJhAAmFDpmh6ZkUgoxLdGAgwVATFB0wsCLrAYGLhKjLugAFAQKXxXyXBLMtMVNB4UBTDBEwwDTmLLGBgicSWphwyYoJmNDZhwSXGdpty2Jd0uyy16qNlLCkxgKAAEABwEkUwZymQo+wWj7QP9NJfLqiDXnpRVZa8q5l3KmikimGtKmi7somlkWnKZSOVM+V80RAEDQBXLk8kD9Oyl6019EJLa105Vc0TpJfMmiSmSun+h6PPMoCxFoqKpbFHF8Hms8VucldsOwmRUrorta7T2YzAUjqacJhzu1Ial2M7LsaqpMQU1FMy4xMDCqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqiEC4ClakFRMkCAjAHEZRKGKGihgcmGGt+lyYZBAGVRElF5qHP+5QIDUcQEmCwQtGSSNYgpoxhwKYIkREYCQ0V0+C7QoGDAAxs5DzbsAGYi1NB43QRKwWyN5MyWAsmAaiCoDhi2JohGxaFbjDhDQDZEbGZCosQnWkQAksFhnTedhgKKABZUKLNiSBslGc2YUogaMMkBKFsxgoEhoUAgUzrRiYBPijRsihKJzuGhSYOxJQAXmYA+IDNRObi3/8+JkuzY2CuIIZxniAAADSAAAAAApRVKsaYfZGK4r4wxA3A9RqKFBouEoRxQOWTRDjGAqBSLg8JiMcZ+rQBjAwIBgDcCuwkg9MeQEeODTNkHJR1kADF40dEe0TEs2rNOh6OMeMY8cOJngwUtkFBVgQKYWDQoQYoIKtMMIvqm8MhJFpeDwSVpdZladgGOWkp2m4lktV3y3oXAXWn+iIUDGYCZsAJFEAiFZAAqQdFNQcRgEg4MEDJjEBAJxKYNHoUuivAukmi1xxoZfViKtrHFrmUGYKgqGIGwhwHLIYubVfZuZfEKBsVYiBTC7YcDAMsh0LAq4bZkTAy6KApv3+C4Sm6sLwsgDAgoGrhk1TEFNRTMuMTAwVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVV";

function playAirhornSound() {
  try {
    const audio = new Audio("data:audio/mpeg;base64," + AIRHORN_B64);
    audio.volume = 1.0;
    audio.play();
  } catch(e) { console.warn("Airhorn failed:", e); }
}

// ============================================================
// MOBILE UPLOAD SCREEN — shown on phones visiting the site
// ============================================================
function MobileUpload() {
  const [name, setName] = useState(() => { try { return localStorage.getItem("cave_mobile_name") || ""; } catch { return ""; } });
  const [editingName, setEditingName] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [flashMsg, setFlashMsg] = useState(null);
  const [showMediaChoice, setShowMediaChoice] = useState(null); // "photo" | "slip"
  const cameraRef = useRef();
  const galleryRef = useRef();
  const cameraSlipRef = useRef();
  const gallerySlipRef = useRef();

  const flash = (msg, color="#00e676") => {
    setFlashMsg({ msg, color });
    setTimeout(() => setFlashMsg(null), 3000);
  };

  const saveName = (n) => {
    setName(n);
    try { localStorage.setItem("cave_mobile_name", n); } catch {}
  };

  // ── Photo upload ──
  const handlePhotos = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    setShowMediaChoice(null);
    setUploading(true);
    for (const file of files) {
      const base64 = await resizeToBase64(file, 500, 0.75);
      await push(dbRef(db, "photos"), {
        base64, label: name || "CAVE CREW", caption: "From the party 🎉", ts: Date.now()
      });
    }
    setUploading(false);
    flash(`${files.length} photo${files.length > 1 ? "s" : ""} on the wall! 📸`);
  };

  // ── Slip upload ──
  const handleSlip = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    setShowMediaChoice(null);
    setUploading(true);
    for (const file of files) {
      await uploadSlipToFirebase(file, name || "Anonymous");
    }
    setUploading(false);
    flash("Slip submitted! Oracle is reading it 🔮", "#f5c842");
  };

  const displayName = name.trim() || "Anonymous";
  const isSaved = !!name.trim();

  return (
    <div style={{background:"#07070f",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",padding:"20px 16px 40px",fontFamily:"Oswald,sans-serif",color:"#e8e8f0",maxWidth:480,margin:"0 auto"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;600&family=Source+Code+Pro:wght@400;600&display=swap');*{box-sizing:border-box;margin:0;padding:0;}`}</style>

      {/* HEADER */}
      <div style={{textAlign:"center",marginBottom:22,width:"100%"}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"2rem",letterSpacing:4,background:"linear-gradient(135deg,#f5c842,#ff9800)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>SNYDERS GAMBLING CAVE</div>
        <div style={{fontSize:"0.68rem",color:"#6a6a8a",letterSpacing:2,marginTop:2}}>DADCHELOR COMMAND CENTER</div>
      </div>

      {/* NAME BADGE */}
      <div style={{width:"100%",marginBottom:18}}>
        {!editingName ? (
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",background:"#161624",border:`1px solid ${isSaved?"#f5c842":"#252538"}`,borderRadius:10,padding:"10px 14px"}} onClick={()=>setEditingName(true)}>
            <div>
              <div style={{fontSize:"0.62rem",color:"#6a6a8a",letterSpacing:2,marginBottom:2}}>PLAYING AS</div>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.2rem",letterSpacing:2,color:isSaved?"#f5c842":"#6a6a8a"}}>{isSaved ? displayName : "TAP TO SET YOUR NAME"}</div>
            </div>
            <div style={{color:"#6a6a8a",fontSize:"0.75rem"}}>✎</div>
          </div>
        ) : (
          <div style={{background:"#161624",border:"1px solid #f5c842",borderRadius:10,padding:"12px 14px"}}>
            <div style={{fontSize:"0.62rem",color:"#f5c842",letterSpacing:2,marginBottom:8}}>YOUR NAME</div>
            <input
              value={name} onChange={e=>saveName(e.target.value)}
              onKeyDown={e=>e.key==="Enter"&&setEditingName(false)}
              placeholder="Enter your name..."
              autoFocus
              style={{width:"100%",background:"#0f0f1a",border:"1px solid #252538",borderRadius:6,padding:"10px 12px",color:"#e8e8f0",fontFamily:"Oswald,sans-serif",fontSize:"1rem",marginBottom:8}}
            />
            <button onClick={()=>setEditingName(false)} style={{width:"100%",padding:"9px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#f5c842",color:"#000",border:"none",borderRadius:6,cursor:"pointer",fontSize:"1rem"}}>
              LOCKED IN ✓
            </button>
          </div>
        )}
      </div>

      {/* FLASH MESSAGE */}
      {flashMsg && (
        <div style={{width:"100%",background:flashMsg.color==="red"?"#b71c1c":`${flashMsg.color}22`,border:`1px solid ${flashMsg.color}`,borderRadius:10,padding:"12px 16px",textAlign:"center",marginBottom:14,fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.1rem",letterSpacing:2,color:flashMsg.color}}>
          {flashMsg.msg}
        </div>
      )}

      {/* UPLOADING */}
      {uploading && (
        <div style={{width:"100%",background:"rgba(245,200,66,0.08)",border:"1px solid #f5c842",borderRadius:10,padding:"12px 16px",textAlign:"center",marginBottom:14,fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",letterSpacing:2,color:"#f5c842"}}>
          ⏳ UPLOADING TO THE CAVE...
        </div>
      )}

      {/* MEDIA CHOICE SHEET */}
      {showMediaChoice && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:200,display:"flex",alignItems:"flex-end",justifyContent:"center"}} onClick={()=>setShowMediaChoice(null)}>
          <div style={{background:"#161624",border:"1px solid #252538",borderRadius:"16px 16px 0 0",padding:"20px 20px 36px",width:"100%",maxWidth:480}} onClick={e=>e.stopPropagation()}>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",textAlign:"center",marginBottom:16}}>
              {showMediaChoice === "photo" ? "ADD TO WALL OF SHAME" : "UPLOAD BET SLIP"}
            </div>
            <button onClick={()=>{ showMediaChoice==="photo" ? cameraRef.current?.click() : cameraSlipRef.current?.click(); }} style={{width:"100%",padding:"16px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"1.1rem",background:"#0f0f1a",color:"#e8e8f0",border:"1px solid #252538",borderRadius:10,cursor:"pointer",marginBottom:10,display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{fontSize:"1.5rem"}}>📷</span> TAKE PHOTO
            </button>
            <button onClick={()=>{ showMediaChoice==="photo" ? galleryRef.current?.click() : gallerySlipRef.current?.click(); }} style={{width:"100%",padding:"16px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"1.1rem",background:"#0f0f1a",color:"#e8e8f0",border:"1px solid #252538",borderRadius:10,cursor:"pointer",display:"flex",alignItems:"center",gap:12,justifyContent:"center"}}>
              <span style={{fontSize:"1.5rem"}}>🖼️</span> CHOOSE FROM GALLERY
            </button>
          </div>
        </div>
      )}

      {/* HIDDEN FILE INPUTS — camera vs gallery, photo vs slip */}
      <input ref={cameraRef}   type="file" accept="image/*" capture="environment" multiple style={{display:"none"}} onChange={handlePhotos} />
      <input ref={galleryRef}  type="file" accept="image/*" multiple            style={{display:"none"}} onChange={handlePhotos} />
      <input ref={cameraSlipRef}  type="file" accept="image/*" capture="environment" style={{display:"none"}} onChange={handleSlip} />
      <input ref={gallerySlipRef} type="file" accept="image/*"                       style={{display:"none"}} onChange={handleSlip} />

      {/* ACTION BUTTONS */}
      <div style={{width:"100%",display:"flex",flexDirection:"column",gap:10}}>

        {/* AIRHORN */}
        <button onClick={playAirhornSound} style={{width:"100%",padding:"20px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:4,fontSize:"1.8rem",background:"linear-gradient(135deg,#ff6f00,#ff1744)",color:"#fff",border:"none",borderRadius:12,cursor:"pointer",boxShadow:"0 4px 24px rgba(255,23,68,0.4)"}}>
          📣 AIR HORN
        </button>

        {/* RAZZ */}
        <button onClick={()=>{
          const msgs = ["CHECK YOUR SQUARES DADCHELOR!","YOUR BRACKET IS DEAD","SHOULDVE LISTENED TO THE CAVE","WHO PICKED THAT TEAM???","PORTFOLIO LOOKING ROUGH BRO","DADDY NEEDS A TIMEOUT","BIG YIKES FROM THE CAVE","WRONG PICK!","DRINK EVERY TIME YOURE WRONG","BOW DOWN TO THE CAVE ORACLE"];
          const msg = msgs[Math.floor(Math.random()*msgs.length)];
          push(dbRef(db, "banners"), { msg, type:"razz", ts: Date.now() });
          flash("RAZZ SENT! 😈", "#ff1744");
        }} style={{width:"100%",padding:"18px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.4rem",background:"linear-gradient(135deg,#1a0505,#3a0a0a)",color:"#ff1744",border:"2px solid #ff1744",borderRadius:12,cursor:"pointer",boxShadow:"0 4px 20px rgba(255,23,68,0.2)"}}>
          😈 RAZZ THE DADCHELOR
        </button>

        {/* CELEBRATE */}
        <button onClick={()=>{
          const msgs = ["LETS GOOOOO!","WERE PRINTING MONEY!","CAVE PREDICTS AGAIN!","CASH THAT TICKET!","WE RIDE TOGETHER!","BRACKET KING!"];
          const msg = msgs[Math.floor(Math.random()*msgs.length)];
          push(dbRef(db, "banners"), { msg, type:"hype", ts: Date.now() });
          flash("HYPE SENT! 🎉", "#00e676");
        }} style={{width:"100%",padding:"18px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.4rem",background:"linear-gradient(135deg,#051a05,#0a3a0a)",color:"#00e676",border:"2px solid #00e676",borderRadius:12,cursor:"pointer",boxShadow:"0 4px 20px rgba(0,230,118,0.2)"}}>
          🎉 CELEBRATE
        </button>

        {/* BET SLIP */}
        <button onClick={()=>setShowMediaChoice("slip")} style={{width:"100%",padding:"18px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.4rem",background:"linear-gradient(135deg,#0a1a0a,#0d2e0d)",color:"#00e676",border:"2px solid rgba(0,230,118,0.5)",borderRadius:12,cursor:"pointer"}}>
          🎰 SUBMIT BET SLIP
          <div style={{fontSize:"0.65rem",color:"#6a6a8a",letterSpacing:1,marginTop:3,fontFamily:"Oswald,sans-serif",fontWeight:400}}>AI reads your slip automatically</div>
        </button>

        {/* WALL OF SHAME */}
        <button onClick={()=>setShowMediaChoice("photo")} style={{width:"100%",padding:"18px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.4rem",background:"linear-gradient(135deg,#1a0e2e,#2a1050)",color:"#f5c842",border:"2px solid rgba(245,200,66,0.5)",borderRadius:12,cursor:"pointer"}}>
          📸 ADD TO WALL OF SHAME
          <div style={{fontSize:"0.65rem",color:"#6a6a8a",letterSpacing:1,marginTop:3,fontFamily:"Oswald,sans-serif",fontWeight:400}}>Goes live on the main screen instantly</div>
        </button>

        {/* VIEW FULL CAVE */}
        <a href="https://www.snydersgamblingcave.com" style={{display:"block",width:"100%",padding:"13px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.95rem",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:10,cursor:"pointer",textAlign:"center",textDecoration:"none",marginTop:2}}>
          VIEW FULL CAVE →
        </a>
      </div>
    </div>
  );
}


// ============================================================
// MAIN APP
// ============================================================
export default function App() {
  const [isLive, setIsLive] = useState(false);
  const [tab, setTab] = useState("scores");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [cmdTab, setCmdTab] = useState("razz");
  const [toast, setToast] = useState(null);
  const [winMsg, setWinMsg] = useState(null);
  const [razzBanner, setRazzBanner] = useState(null);
  const [showRandy, setShowRandy] = useState(false);
  const [showIndiana, setShowIndiana] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const { games, lastUpdate, error, refresh } = useOddsAPI(isLive);
  const { scores, scoresUpdate, scoresError, start: startScores, stop: stopScores } = useESPNScores(isLive);
  const indianaTimerRef = useRef(null);
  const addVoteRef = useRef(null);
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Listen for banners pushed from mobile devices
  useEffect(() => {
    const r = dbRef(db, "banners");
    const unsub = onValue(r, snap => {
      const val = snap.val();
      if (!val) return;
      const entries = Object.entries(val).sort((a,b) => (b[1].ts||0) - (a[1].ts||0));
      if (!entries.length) return;
      const [fbKey, banner] = entries[0];
      // Only show if within last 5 seconds (avoids replaying old banners on reconnect)
      if (Date.now() - (banner.ts||0) < 5000) {
        setRazzBanner({ msg: banner.msg, type: banner.type });
        // Clean up after showing
        setTimeout(() => remove(dbRef(db, `banners/${fbKey}`)), 4000);
      }
    });
    return () => unsub();
  }, []);

  // Start/stop ESPN scores with GO LIVE — Purdue loss fires Randy automatically
  useEffect(() => {
    if (isLive) {
      startScores(() => setShowRandy(true));
    } else {
      stopScores();
    }
    return () => stopScores();
  }, [isLive, startScores, stopScores]);

  // Indiana subliminal flash
  useEffect(() => {
    if (isLive) {
      const schedule = () => {
        indianaTimerRef.current = setTimeout(() => { setShowIndiana(true); schedule(); }, (Math.random()*20+50)*60*1000);
      };
      schedule();
    } else clearTimeout(indianaTimerRef.current);
    return () => clearTimeout(indianaTimerRef.current);
  }, [isLive]);

  const showToast = (msg) => setToast(msg);

  const fireRazz = (msg, type="razz") => {
    setRazzBanner({ msg, type });
  };

  const playAirhorn = () => playAirhornSound();

  const putToVote = (g) => {
    if (addVoteRef.current) {
      addVoteRef.current(`${g.team1} ML`, g.ml1 ? (g.ml1>0?"+":"")+g.ml1 : "");
      showToast(`${g.team1} added to RIDE TOGETHER vote!`);
    }
  };

  const card = {background:"#161624",border:"1px solid #252538",borderRadius:8,padding:14,marginBottom:14};

  if (isMobile) return <MobileUpload />;

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;600&family=Source+Code+Pro:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#c49a1a;border-radius:2px;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
        .ticker{white-space:nowrap;animation:tick 40s linear infinite;padding-left:100%;font-family:'Source Code Pro',monospace;font-size:0.75rem;color:#6a6a8a;}
        @keyframes tick{from{transform:translateX(0);}to{transform:translateX(-200%);}}
        .fab{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#f5c842,#ff9800);border:none;font-size:1.5rem;cursor:pointer;z-index:101;box-shadow:0 4px 20px rgba(245,200,66,0.4);}
        .commander{position:fixed;bottom:0;right:0;width:300px;background:#0f0f1a;border:1px solid #f5c842;border-radius:12px 0 0 0;z-index:100;}
        .razz-btn{width:100%;padding:10px;margin-bottom:5px;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;font-size:0.95rem;border:none;border-radius:5px;cursor:pointer;color:#fff;}
        @media(max-width:1200px){.right-col{display:none!important;}.mgrid{grid-template-columns:1fr 300px!important;}}
        @media(max-width:800px){.mgrid{grid-template-columns:1fr!important;}}
      `}</style>

      <div style={{background:"#07070f",minHeight:"100vh",fontFamily:"Oswald,sans-serif",color:"#e8e8f0"}}>

        {/* HEADER */}
        <div style={{background:"linear-gradient(135deg,#0f0f1a,#1a102a)",borderBottom:"2px solid #f5c842",padding:"10px 20px",display:"flex",alignItems:"center",justifyContent:"space-between",position:"sticky",top:0,zIndex:60}}>
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.8rem",letterSpacing:4,background:"linear-gradient(135deg,#f5c842,#ff9800)",WebkitBackgroundClip:"text",WebkitTextFillColor:"transparent"}}>SNYDERS GAMBLING CAVE</div>
            <div style={{fontSize:"0.65rem",color:"#6a6a8a",letterSpacing:2}}>DADCHELOR COMMAND CENTER • MARCH MADNESS 2026</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            {/* COST METER */}
            <CostMeter />
            {/* GO LIVE */}
            <div onClick={()=>{const n=!isLive;setIsLive(n);showToast(n?"Stream ON — loading odds...":"Stream paused");}}
              style={{display:"flex",alignItems:"center",gap:8,background:"#161624",border:`1px solid ${isLive?"#00e676":"#252538"}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",userSelect:"none"}}>
              <div style={{width:40,height:20,borderRadius:10,background:isLive?"#00e676":"#252538",position:"relative",transition:"background 0.25s"}}>
                <div style={{position:"absolute",top:3,left:isLive?23:3,width:14,height:14,borderRadius:"50%",background:"white",transition:"left 0.25s"}} />
              </div>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.95rem",color:isLive?"#00e676":"#6a6a8a"}}>GO LIVE</span>
            </div>
            {isLive && <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,23,68,0.1)",border:"1px solid #ff1744",borderRadius:20,padding:"3px 10px",fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.85rem",color:"#ff1744"}}><span style={{width:6,height:6,borderRadius:"50%",background:"#ff1744",display:"inline-block",animation:"pulse 1s infinite"}} /> LIVE</div>}
            <div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1rem",color:"#00e676"}}>{time}</div>
          </div>
        </div>

        {/* TICKER */}
        <div style={{background:"#09090f",borderBottom:"1px solid #252538",height:30,display:"flex",alignItems:"center",overflow:"hidden"}}>
          <div style={{background:"#f5c842",color:"#000",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.78rem",padding:"0 12px",flexShrink:0,height:"100%",display:"flex",alignItems:"center"}}>LIVE FEED</div>
          <div style={{overflow:"hidden",flex:1}}>
            {isLive
              ? <div className="ticker">{games.length ? games.map(g=>`${g.team1} vs ${g.team2} | SPR: ${g.spread} | O/U: ${g.ou}`).join("   •   ") : "Loading live odds..."}</div>
              : <div style={{padding:"0 16px",color:"#6a6a8a",fontFamily:"'Source Code Pro',monospace",fontSize:"0.75rem"}}>STREAM PAUSED — Toggle GO LIVE to activate</div>
            }
          </div>
        </div>

        {/* COUNTDOWN BAR */}
        <div style={{background:"#0d0d1a",borderBottom:"1px solid #252538",padding:"6px 20px",display:"flex",alignItems:"center",gap:16,flexWrap:"wrap"}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.85rem",color:"#f5c842"}}>FIRST TIPOFF</div>
          <Countdown target={PARTY_DATE} />
          <div style={{marginLeft:"auto",display:"flex",gap:12,alignItems:"center"}}>
            {lastUpdate && <div style={{fontSize:"0.65rem",color:"#6a6a8a"}}>Odds: {lastUpdate} {isLive && <button onClick={refresh} style={{background:"none",border:"none",color:"#2979ff",cursor:"pointer",fontSize:"0.65rem",fontFamily:"Oswald,sans-serif",marginLeft:4}}>↺</button>}</div>}
            {scoresUpdate && <div style={{fontSize:"0.65rem",color:"#6a6a8a"}}>Scores: {scoresUpdate}</div>}
            {(error || scoresError) && <div style={{fontSize:"0.65rem",color:"#ff1744"}}>⚠ {error || scoresError}</div>}
          </div>
        </div>

        {/* MAIN GRID */}
        <div className="mgrid" style={{display:"grid",gridTemplateColumns:"1fr 300px 260px",gap:14,padding:14,maxWidth:1800,margin:"0 auto"}}>

          {/* LEFT */}
          <div>
            <div style={card}><PhotoStrip toast={showToast} /></div>
            <div style={card}>
              <div style={{display:"flex",gap:3,background:"#0f0f1a",padding:3,borderRadius:7,border:"1px solid #252538",marginBottom:12}}>
                {["scores","boosts","slips","halftime"].map(t=>(
                  <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"6px 4px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,fontSize:"0.85rem",background:tab===t?"#161624":"transparent",border:"none",color:tab===t?"#f5c842":"#6a6a8a",cursor:"pointer",borderRadius:5}}>{{scores:"SCORES",boosts:"BOOSTS",slips:"SLIPS",halftime:"🎉 HALFTIME"}[t]||t.toUpperCase()}</button>
                ))}
              </div>

              {tab==="scores" && (
                <>
                  {!isLive && (
                    <div style={{textAlign:"center",padding:40,color:"#6a6a8a"}}>
                      <div style={{fontSize:"2rem",marginBottom:8}}>📡</div>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3}}>STREAM OFFLINE</div>
                      <div style={{fontSize:"0.82rem",marginTop:4}}>Turn on GO LIVE to load live scores + odds</div>
                    </div>
                  )}

                  {isLive && (
                    <>
                      {/* LIVE SCORES from ESPN */}
                      {scores.filter(g => g.isLive || g.isFinal).length > 0 && (
                        <div style={{marginBottom:14}}>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1rem",color:"#ff1744",borderBottom:"1px solid #252538",paddingBottom:6,marginBottom:8,display:"flex",alignItems:"center",gap:8}}>
                            <span style={{width:7,height:7,borderRadius:"50%",background:"#ff1744",display:"inline-block",animation:"pulse 1s infinite"}} />
                            LIVE SCORES
                            {scoresUpdate && <span style={{fontSize:"0.6rem",color:"#6a6a8a",fontFamily:"'Source Code Pro',monospace",marginLeft:"auto"}}>ESPN {scoresUpdate}</span>}
                          </div>
                          {scores.filter(g => g.isLive || g.isFinal).map(g => {
                            const homePurdue = g.home.toLowerCase().includes("purdue");
                            const awayPurdue = g.away.toLowerCase().includes("purdue");
                            const purdueWinning = (homePurdue && g.homeScore > g.awayScore) || (awayPurdue && g.awayScore > g.homeScore);
                            const purdueLosing = (homePurdue && g.homeScore < g.awayScore) || (awayPurdue && g.awayScore < g.homeScore);
                            return (
                              <div key={g.id} style={{background:"#0f0f1a",border:`1px solid ${g.isLive?"rgba(255,23,68,0.4)":"#252538"}`,borderRadius:6,padding:"8px 10px",marginBottom:6}}>
                                <div style={{display:"grid",gridTemplateColumns:"1fr auto 1fr",gap:6,alignItems:"center"}}>
                                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                                    {g.homeLogo && <img src={g.homeLogo} style={{width:20,height:20,objectFit:"contain"}} />}
                                    <div>
                                      {g.homeRank && <span style={{fontSize:"0.6rem",color:"#6a6a8a",marginRight:3}}>#{g.homeRank}</span>}
                                      <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.9rem",color:homePurdue?purdueLosing?"#ff1744":"#f5c842":"#e8e8f0"}}>{g.home}</span>
                                    </div>
                                  </div>
                                  <div style={{textAlign:"center"}}>
                                    <div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1.1rem",fontWeight:700,color:"#e8e8f0"}}>{g.homeScore} - {g.awayScore}</div>
                                    <div style={{fontSize:"0.6rem",color:g.isLive?"#ff1744":"#6a6a8a"}}>{g.isLive ? `${g.clock} • Q${g.period}` : "FINAL"}</div>
                                  </div>
                                  <div style={{display:"flex",alignItems:"center",gap:6,justifyContent:"flex-end"}}>
                                    <div style={{textAlign:"right"}}>
                                      {g.awayRank && <span style={{fontSize:"0.6rem",color:"#6a6a8a",marginRight:3}}>#{g.awayRank}</span>}
                                      <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.9rem",color:awayPurdue?purdueLosing?"#ff1744":"#f5c842":"#e8e8f0"}}>{g.away}</span>
                                    </div>
                                    {g.awayLogo && <img src={g.awayLogo} style={{width:20,height:20,objectFit:"contain"}} />}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* UPCOMING with ODDS from The Odds API */}
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:6,marginBottom:8}}>
                        UPCOMING — LIVE ODDS
                      </div>
                      {!games.length && !error && <div style={{textAlign:"center",padding:20,color:"#6a6a8a",fontSize:"0.85rem"}}>Loading odds...</div>}
                      {!games.length && error && <div style={{textAlign:"center",padding:14,color:"#ff1744",fontSize:"0.82rem"}}>Odds API: {error}</div>}
                      {games.map(g => <GameCard key={g.id} g={g} selected={selectedGame?.id===g.id} onSelect={setSelectedGame} />)}
                      {selectedGame && (
                        <div style={{background:"rgba(245,200,66,0.05)",border:"1px solid #f5c842",borderRadius:8,padding:12,marginTop:10}}>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",color:"#f5c842",marginBottom:8}}>{selectedGame.team1} vs {selectedGame.team2}</div>
                          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10,fontSize:"0.8rem"}}>
                            <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>SPREAD</div><div style={{color:"#f5c842",fontFamily:"'Source Code Pro',monospace"}}>{selectedGame.spread}</div></div>
                            <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>O/U</div><div style={{color:"#2979ff",fontFamily:"'Source Code Pro',monospace"}}>{selectedGame.ou}</div></div>
                            <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>ML</div><div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"0.78rem"}}>{selectedGame.ml1>0?"+":""}{selectedGame.ml1} / {selectedGame.ml2>0?"+":""}{selectedGame.ml2}</div></div>
                          </div>
                          <button style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,padding:"5px 12px",background:"#f5c842",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.82rem"}} onClick={()=>putToVote(selectedGame)}>PUT TO VOTE</button>
                        </div>
                      )}

                      {/* Upcoming games not yet live from ESPN */}
                      {scores.filter(g => g.state === "pre").length > 0 && (
                        <div style={{marginTop:10}}>
                          <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.85rem",color:"#6a6a8a",borderBottom:"1px solid #252538",paddingBottom:4,marginBottom:8}}>UPCOMING TODAY</div>
                          {scores.filter(g => g.state === "pre").slice(0,6).map(g => (
                            <div key={g.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"5px 8px",borderRadius:4,marginBottom:4,background:"#0f0f1a",border:"1px solid #252538",fontSize:"0.78rem"}}>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                {g.awayRank && <span style={{color:"#6a6a8a",fontSize:"0.62rem"}}>#{g.awayRank}</span>}
                                <span style={{fontFamily:"'Bebas Neue',sans-serif"}}>{g.away}</span>
                                <span style={{color:"#6a6a8a"}}>@</span>
                                {g.homeRank && <span style={{color:"#6a6a8a",fontSize:"0.62rem"}}>#{g.homeRank}</span>}
                                <span style={{fontFamily:"'Bebas Neue',sans-serif"}}>{g.home}</span>
                              </div>
                              <span style={{color:"#f5c842",fontFamily:"'Source Code Pro',monospace",fontSize:"0.7rem"}}>{g.statusText}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {tab==="boosts" && (
                <div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>ODDS BOOSTS</div>
                  {!isLive && <div style={{textAlign:"center",padding:30,color:"#6a6a8a"}}>Turn on GO LIVE to see boosts</div>}
                  {isLive && [
                    {sport:"⚾",name:"Yankees vs Red Sox",bet:"Yankees ML",odds:"+140",site:"DraftKings",hot:true},
                    {sport:"🏒",name:"Avalanche vs Stars",bet:"Over 5.5",odds:"-108",site:"FanDuel",hot:false},
                    {sport:"🥊",name:"UFC Main Event",bet:"Fight 3+ rds",odds:"+180",site:"BetMGM",hot:true},
                    {sport:"⚽",name:"Man City vs Arsenal",bet:"Both teams score",odds:"+110",site:"Caesars",hot:false},
                  ].map((b,i)=>(
                    <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,marginBottom:6,background:"#0f0f1a",border:`1px solid ${b.hot?"rgba(245,200,66,0.4)":"#252538"}`}}>
                      <span>{b.sport}</span>
                      <div style={{flex:1}}><div style={{fontSize:"0.68rem",color:"#6a6a8a"}}>{b.name}</div><div style={{fontSize:"0.82rem"}}>{b.bet}</div></div>
                      <div style={{textAlign:"right"}}><div style={{fontFamily:"'Source Code Pro',monospace",fontWeight:700,color:b.odds.startsWith("+")?"#00e676":"#6a6a8a"}}>{b.odds}</div>{b.hot&&<div style={{fontSize:"0.6rem",color:"#f5c842"}}>BOOST</div>}<div style={{fontSize:"0.62rem",color:"#6a6a8a"}}>{b.site}</div></div>
                    </div>
                  ))}
                </div>
              )}

              {tab==="slips" && <SlipPanel toast={showToast} onWin={()=>setWinMsg("BET CASHED! 💰🎉")} />}
              {tab==="halftime" && <HalftimePlayer toast={showToast} />}
            </div>
          </div>

          {/* CENTER */}
          <div>
            <div style={card}><VotePanel toast={showToast} onAddVote={addVoteRef} /></div>
            <div style={card}><OraclePanel isLive={isLive} toast={showToast} games={games} /></div>
            <div style={{...card, display:"none"}} className="leaderboard-mobile"><Leaderboard /></div>
          </div>

          {/* RIGHT */}
          <div className="right-col">
            <div style={card}><Leaderboard /></div>
            <div style={card}><Ledger /></div>
            <div style={{...card,marginTop:14}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>QUICK LINKS</div>
              {Object.entries(SPORTSBOOK_URLS).map(([name,url])=>(
                <a key={name} href={url} target="_blank" rel="noopener noreferrer" style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"7px 10px",marginBottom:5,background:"#0f0f1a",border:"1px solid #252538",borderRadius:6,cursor:"pointer",fontSize:"0.85rem",textDecoration:"none",color:"#e8e8f0",transition:"border-color 0.2s"}}
                  onMouseOver={e=>e.currentTarget.style.borderColor="#f5c842"}
                  onMouseOut={e=>e.currentTarget.style.borderColor="#252538"}>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1}}>{name}</span>
                  <span style={{color:"#f5c842"}}>→</span>
                </a>
              ))}
            </div>
            <div style={{...card,marginTop:14}}>
              <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>CAVE RULES</div>
              <div style={{fontSize:"0.76rem",color:"#6a6a8a",lineHeight:2}}>
                {["Oracle picks are LAW","Majority vote = we ride","Upload slips to claim wins","Airhorn on every W","Razz the dadchelor liberally","What happens in the cave stays"].map((r,i)=>(
                  <div key={i}><span style={{color:"#f5c842"}}>{i+1}.</span> {r}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* MOBILE COMMANDER */}
        {cmdOpen && (
          <div className="commander">
            <div style={{padding:"10px 14px",borderBottom:"1px solid #252538",display:"flex",justifyContent:"space-between",alignItems:"center",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:"#f5c842"}}>
              <span>MOBILE COMMANDER</span>
              <button onClick={()=>setCmdOpen(false)} style={{background:"none",border:"none",color:"#6a6a8a",cursor:"pointer",fontSize:"1.1rem"}}>×</button>
            </div>
            <div style={{padding:"10px 12px"}}>
              <button onClick={playAirhorn} style={{width:"100%",padding:16,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:4,fontSize:"1.6rem",background:"linear-gradient(135deg,#ff6f00,#ff1744)",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",marginBottom:8}}>AIR HORN</button>

              <div style={{display:"flex",gap:4,marginBottom:8}}>
                {["razz","hype"].map(t=>(
                  <button key={t} onClick={()=>setCmdTab(t)} style={{flex:1,padding:6,fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.85rem",background:cmdTab===t?"#161624":"transparent",border:"none",color:cmdTab===t?"#f5c842":"#6a6a8a",cursor:"pointer",borderRadius:5}}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div style={{maxHeight:260,overflowY:"auto"}}>
                {(cmdTab==="razz"?RAZZ:HYPE).map((msg,i)=>(
                  <button key={i} className="razz-btn" style={{background:`hsl(${i*36+(cmdTab==="hype"?120:0)},55%,20%)`}}
                    onClick={()=>fireRazz(msg, cmdTab)}>
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {!cmdOpen && <button className="fab" onClick={()=>setCmdOpen(true)}>📱</button>}

        {/* OVERLAYS */}
        {razzBanner && <RazzBanner banner={razzBanner} onClose={()=>setRazzBanner(null)} />}
        {toast && <Toast msg={toast} onClose={()=>setToast(null)} />}
        {winMsg && <WinOverlay msg={winMsg} onClose={()=>setWinMsg(null)} />}
        {showRandy && <RandyOverlay onClose={()=>setShowRandy(false)} />}
        {showIndiana && <IndianaFlash onDone={()=>setShowIndiana(false)} />}
      </div>
    </>
  );
}
