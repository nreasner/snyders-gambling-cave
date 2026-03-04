import { useState, useEffect, useRef, useCallback } from "react";

// ============================================================
// CONFIG
// ============================================================
const ODDS_API_KEY = "7fec6f19b1eb6838a13fa733bee6d610";
const ODDS_API_BASE = "https://api.the-odds-api.com/v4";
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
    headers: { "Content-Type": "application/json" },
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
function RazzBanner({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 5000); return () => clearTimeout(t); }, [onClose]);
  return (
    <div onClick={onClose} style={{position:"fixed",top:0,left:0,right:0,zIndex:250,background:"linear-gradient(135deg,#ff1744,#b71c1c)",padding:"14px 20px",textAlign:"center",cursor:"pointer",boxShadow:"0 4px 30px rgba(255,23,68,0.5)"}}>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1.8rem",letterSpacing:6,color:"#fff",textShadow:"0 0 20px rgba(255,255,255,0.5)"}}>{msg}</div>
      <div style={{fontSize:"0.7rem",color:"rgba(255,255,255,0.6)",marginTop:2}}>tap to dismiss</div>
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

function loadSavedPhotos() {
  try {
    const saved = localStorage.getItem("cave_photos");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.length) return parsed;
    }
  } catch {}
  return PHOTO_DEFAULTS;
}

function savePhotos(photos) {
  try {
    // Only save user-uploaded photos (ones with base64 data), not the emoji defaults
    const toSave = photos.filter(p => p.base64 || p.emoji);
    localStorage.setItem("cave_photos", JSON.stringify(toSave));
  } catch(e) {
    // localStorage quota exceeded — too many/large photos
    console.warn("Could not save photos to localStorage:", e);
  }
}

function PhotoStrip({ toast }) {
  const [photos, setPhotos] = useState(loadSavedPhotos);
  const [slideIdx, setSlideIdx] = useState(0);
  const [showQR, setShowQR] = useState(false);
  const ref = useRef();
  const total = photos.length;

  // Persist to localStorage whenever photos change
  useEffect(() => { savePhotos(photos); }, [photos]);

  useEffect(() => {
    if (total <= 1) return;
    const t = setInterval(() => setSlideIdx(i => (i + 1) % total), 4000);
    return () => clearInterval(t);
  }, [total]);

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    e.target.value = "";
    toast(`Reading ${files.length} photo${files.length > 1 ? "s" : ""}...`);
    const newPhotos = await Promise.all(files.map(async f => {
      const base64 = await new Promise(res => {
        const reader = new FileReader();
        // Resize to max 400px to keep localStorage usage low
        reader.onload = ev => {
          const img = new Image();
          img.onload = () => {
            const MAX = 400;
            const scale = Math.min(MAX / img.width, MAX / img.height, 1);
            const canvas = document.createElement("canvas");
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
            res(canvas.toDataURL("image/jpeg", 0.7).split(",")[1]);
          };
          img.src = ev.target.result;
        };
        reader.readAsDataURL(f);
      });
      return { id:"u"+Date.now()+Math.random(), base64, label:"NEW DROP", caption:"Fresh from the cave" };
    }));
    setPhotos(prev => [...newPhotos, ...prev]);
    setSlideIdx(0);
    toast(`${files.length} photo${files.length > 1 ? "s" : ""} saved! ✓`);
  };

  const thumbIndices = (() => {
    if (total <= THUMB_WINDOW) return Array.from({length: total}, (_, i) => i);
    const half = Math.floor(THUMB_WINDOW / 2);
    let start = Math.max(0, Math.min(slideIdx - half, total - THUMB_WINDOW));
    return Array.from({length: THUMB_WINDOW}, (_, i) => start + i);
  })();

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent("https://www.snydersgamblingcave.com")}&bgcolor=07070f&color=f5c842&margin=10`;

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:6,flex:1}}>
          DADCHELOR WALL OF SHAME
          {total > 3 && <span style={{fontSize:"0.68rem",color:"#6a6a8a",marginLeft:8}}>{slideIdx+1}/{total}</span>}
        </div>
        <div style={{display:"flex",gap:6,marginLeft:10}}>
          <button onClick={()=>setShowQR(!showQR)} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"4px 10px",background:"transparent",color:"#2979ff",border:"1px solid #2979ff",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>QR</button>
          <button onClick={()=>ref.current?.click()} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"4px 10px",background:"transparent",color:"#f5c842",border:"1px solid #f5c842",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>+ PHOTOS</button>
          <button onClick={()=>{if(window.confirm("Clear all uploaded photos?")){ setPhotos(PHOTO_DEFAULTS); localStorage.removeItem("cave_photos"); }}} style={{fontFamily:"'Bebas Neue',sans-serif",padding:"4px 8px",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>✕</button>
          <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles} />
        </div>
      </div>
      {showQR && (
        <div style={{display:"flex",alignItems:"center",gap:14,padding:12,background:"#0f0f1a",borderRadius:8,border:"1px solid #252538",marginBottom:10}}>
          <img src={qrUrl} alt="QR" style={{width:72,height:72,borderRadius:6}} />
          <div>
            <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:"#f5c842",fontSize:"0.95rem"}}>SCAN TO JOIN THE CAVE</div>
            <div style={{fontSize:"0.72rem",color:"#6a6a8a",marginTop:3}}>Point your phone camera here</div>
            <div style={{fontSize:"0.7rem",color:"#2979ff",marginTop:2}}>snydersgamblingcave.com</div>
          </div>
        </div>
      )}
      <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6}}>
        {thumbIndices.map(idx => {
          const p = photos[idx];
          if (!p) return null;
          return (
            <div key={p.id} onClick={()=>setSlideIdx(idx)} style={{flexShrink:0,borderRadius:6,overflow:"hidden",border:`2px solid ${idx===slideIdx?"#f5c842":"#252538"}`,width:130,cursor:"pointer",transition:"border-color 0.3s"}}>
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
    headers: { "Content-Type": "application/json" },
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

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================
// SLIP PANEL + BET TRACKER
// ============================================================
function SlipPanel({ toast, onBetAdded }) {
  const [slips, setSlips] = useState([]);
  const [nameInput, setNameInput] = useState("");
  const [pendingName, setPendingName] = useState(""); // name being entered for current upload
  const [showNamePrompt, setShowNamePrompt] = useState(false);
  const [pendingFiles, setPendingFiles] = useState([]);
  const ref = useRef();

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
      const tempId = "s" + Date.now() + Math.random();
      // Add placeholder immediately
      setSlips(prev => [{
        id: tempId, url: URL.createObjectURL(file),
        name, pick: "Reading slip...", odds: "...", amount: "...",
        payout: "...", book: "...", status: "pending", time: new Date().toLocaleTimeString()
      }, ...prev]);

      try {
        const b64 = await fileToBase64(file);
        const details = await readSlipWithAI(b64);
        setSlips(prev => prev.map(s => s.id === tempId
          ? { ...s, ...details, status: "open" }
          : s
        ));
        if (onBetAdded) onBetAdded({ id: tempId, name, ...details, status: "open" });
        toast(`Slip read! ${details.pick || "Bet"} added to tracker`);
      } catch {
        setSlips(prev => prev.map(s => s.id === tempId
          ? { ...s, pick: "Could not read slip", status: "open" }
          : s
        ));
        toast("Slip uploaded — could not auto-read, fill in manually");
      }
    }
    setPendingFiles([]);
  };

  const setStatus = (id, status) => {
    setSlips(prev => prev.map(s => s.id === id ? { ...s, status } : s));
    if (onBetAdded) onBetAdded(null, id, status); // signal leaderboard update
    if (status === "won") toast("CASH IT! 🤑💰");
    if (status === "lost") toast("Tough break. Next one. 💸");
  };

  const statusColor = { open:"#f5c842", won:"#00e676", lost:"#ff1744", push:"#6a6a8a" };
  const statusLabel = { open:"PENDING", won:"WON ✓", lost:"LOST ✗", push:"PUSH" };

  return (
    <div>
      <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>BET SLIP TRACKER</div>

      {/* NAME PROMPT MODAL */}
      {showNamePrompt && (
        <div style={{background:"#0f0f1a",border:"1px solid #f5c842",borderRadius:8,padding:14,marginBottom:12}}>
          <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:"#f5c842",marginBottom:8}}>WHO'S SLIP IS THIS?</div>
          <input
            value={pendingName} onChange={e=>setPendingName(e.target.value)}
            onKeyDown={e=>e.key==="Enter"&&confirmUpload()}
            placeholder="Enter your name..."
            autoFocus
            style={{width:"100%",background:"#161624",border:"1px solid #252538",borderRadius:4,padding:"7px 10px",color:"#e8e8f0",fontFamily:"Oswald,sans-serif",fontSize:"0.9rem",marginBottom:8}}
          />
          <div style={{display:"flex",gap:6}}>
            <button onClick={confirmUpload} style={{flex:1,padding:"7px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#f5c842",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>READ MY SLIP 🔮</button>
            <button onClick={()=>{setShowNamePrompt(false);setPendingFiles([]);}} style={{padding:"7px 12px",fontFamily:"'Bebas Neue',sans-serif",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.85rem"}}>CANCEL</button>
          </div>
        </div>
      )}

      <div onClick={()=>ref.current?.click()} style={{border:"2px dashed #252538",borderRadius:8,padding:14,textAlign:"center",cursor:"pointer",marginBottom:10}}>
        <div style={{fontSize:"1.6rem",marginBottom:3}}>📸</div>
        <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",letterSpacing:2,color:"#f5c842"}}>UPLOAD YOUR SLIP</div>
        <div style={{fontSize:"0.7rem",color:"#6a6a8a"}}>AI reads bet details automatically</div>
        <input ref={ref} type="file" accept="image/*" multiple style={{display:"none"}} onChange={handleFiles} />
      </div>

      <div style={{maxHeight:480,overflowY:"auto"}}>
        {!slips.length && <div style={{textAlign:"center",padding:16,color:"#6a6a8a",fontSize:"0.82rem"}}>No slips yet — upload one above</div>}
        {slips.map(s => (
          <div key={s.id} style={{background:"#0f0f1a",border:`1px solid ${statusColor[s.status]||"#252538"}`,borderRadius:8,padding:10,marginBottom:10}}>
            <div style={{display:"flex",gap:8,marginBottom:8}}>
              <img src={s.url} alt="slip" style={{width:64,height:64,objectFit:"cover",borderRadius:4,flexShrink:0}} />
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:2}}>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.85rem",color:"#f5c842",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis",maxWidth:"60%"}}>{s.name}</div>
                  <span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.7rem",color:statusColor[s.status],letterSpacing:1,flexShrink:0}}>{statusLabel[s.status]}</span>
                </div>
                <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.82rem",color:s.pick==="Reading slip..."?"#6a6a8a":"#e8e8f0",marginBottom:2}}>{s.pick}</div>
                <div style={{display:"flex",gap:10,fontSize:"0.7rem",color:"#6a6a8a"}}>
                  <span>Odds: <span style={{color:"#00e676",fontFamily:"'Source Code Pro',monospace"}}>{s.odds}</span></span>
                  <span>Bet: <span style={{color:"#f5c842",fontFamily:"'Source Code Pro',monospace"}}>${s.amount}</span></span>
                  <span>To win: <span style={{color:"#00e676",fontFamily:"'Source Code Pro',monospace"}}>${s.payout}</span></span>
                </div>
              </div>
            </div>
            {s.status === "open" && s.pick !== "Reading slip..." && (
              <div style={{display:"flex",gap:5}}>
                <button onClick={()=>setStatus(s.id,"won")} style={{flex:2,padding:"6px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#00e676",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.82rem"}}>WIN 🤑</button>
                <button onClick={()=>setStatus(s.id,"lost")} style={{flex:2,padding:"6px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,background:"#ff1744",color:"#fff",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.82rem"}}>LOSS 💸</button>
                <button onClick={()=>setStatus(s.id,"push")} style={{flex:1,padding:"6px",fontFamily:"'Bebas Neue',sans-serif",background:"#252538",color:"#6a6a8a",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.75rem"}}>PUSH</button>
              </div>
            )}
            {s.status !== "open" && (
              <button onClick={()=>setStatus(s.id,"open")} style={{width:"100%",padding:"4px",fontFamily:"'Bebas Neue',sans-serif",background:"transparent",color:"#6a6a8a",border:"1px solid #252538",borderRadius:4,cursor:"pointer",fontSize:"0.72rem",letterSpacing:1}}>UNDO</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================
// LEADERBOARD — live crew standings
// ============================================================
function Leaderboard({ bets }) {
  // Roll up bets by person
  const players = {};
  bets.forEach(b => {
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
            <div style={{fontSize:"1.1rem",width:24,textAlign:"center"}}>{medals[i] || (isDonkey?"🫏":"")}</div>
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
  const [bets, setBets] = useState([]); // all uploaded bets across crew
  const { games, lastUpdate, error, refresh } = useOddsAPI(isLive);
  const prevGamesRef = useRef([]);
  const indianaTimerRef = useRef(null);
  const addVoteRef = useRef(null); // ref so GameDetail can call VotePanel.addSingle

  // Called by SlipPanel when a bet is added or status changes
  const handleBetUpdate = (newBet, updateId, newStatus) => {
    if (newBet) {
      setBets(prev => [newBet, ...prev.filter(b => b.id !== newBet.id)]);
    } else if (updateId && newStatus) {
      setBets(prev => prev.map(b => b.id === updateId ? { ...b, status: newStatus } : b));
      // fire airhorn on win
      if (newStatus === "won") setWinMsg("BET CASHED! 💰🎉");
    }
  };

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  // Watch for Purdue losing
  useEffect(() => {
    if (!isLive || !games.length) return;
    games.forEach(g => {
      const prev = prevGamesRef.current.find(p => p.id===g.id);
      if (!prev) return;
      const isHome = g.team1.toLowerCase().includes("purdue");
      const isAway = g.team2.toLowerCase().includes("purdue");
      if (!isHome && !isAway) return;
      const lost = (isHome && g.final && g.s1<g.s2) || (isAway && g.final && g.s2<g.s1);
      if (lost && !prev.final) setShowRandy(true);
    });
    prevGamesRef.current = games;
  }, [games, isLive]);

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

  const fireRazz = (msg) => {
    setRazzBanner(msg);
    // also play a quick buzz sound
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "square"; osc.frequency.value = 80;
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime+0.4);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime+0.4);
    } catch {}
  };

  const playAirhorn = () => {
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.type = "sawtooth";
      osc.frequency.setValueAtTime(300, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime+0.08);
      osc.frequency.exponentialRampToValueAtTime(200, ctx.currentTime+0.6);
      gain.gain.setValueAtTime(0.6, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime+1.2);
      osc.start(ctx.currentTime); osc.stop(ctx.currentTime+1.2);
      setWinMsg("AIRHORN DEPLOYED 🔊");
    } catch { showToast("AIRHORN FIRED 🔊"); }
  };

  const putToVote = (g) => {
    if (addVoteRef.current) {
      addVoteRef.current(`${g.team1} ML`, g.ml1 ? (g.ml1>0?"+":"")+g.ml1 : "");
      showToast(`${g.team1} added to RIDE TOGETHER vote!`);
    }
  };

  const card = {background:"#161624",border:"1px solid #252538",borderRadius:8,padding:14,marginBottom:14};

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
            {lastUpdate && <div style={{fontSize:"0.65rem",color:"#6a6a8a"}}>Odds: {lastUpdate} {isLive && <button onClick={refresh} style={{background:"none",border:"none",color:"#2979ff",cursor:"pointer",fontSize:"0.65rem",fontFamily:"Oswald,sans-serif",marginLeft:4}}>REFRESH</button>}</div>}
            {error && <div style={{fontSize:"0.65rem",color:"#ff1744"}}>⚠ {error}</div>}
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
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3,fontSize:"1.1rem",color:"#f5c842",borderBottom:"1px solid #252538",paddingBottom:8,marginBottom:10}}>MARCH MADNESS 2026 — LIVE ODDS</div>
                  {!isLive && <div style={{textAlign:"center",padding:40,color:"#6a6a8a"}}><div style={{fontSize:"2rem",marginBottom:8}}>📡</div><div style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:3}}>STREAM OFFLINE</div><div style={{fontSize:"0.82rem",marginTop:4}}>Turn on GO LIVE to load live matchups</div></div>}
                  {isLive && !games.length && !error && <div style={{textAlign:"center",padding:30,color:"#6a6a8a",fontSize:"0.85rem"}}>Loading matchups...</div>}
                  {isLive && !games.length && error && <div style={{textAlign:"center",padding:20,color:"#ff1744",fontSize:"0.82rem"}}>Could not load odds: {error}</div>}
                  {isLive && games.map(g => <GameCard key={g.id} g={g} selected={selectedGame?.id===g.id} onSelect={setSelectedGame} />)}
                  {selectedGame && isLive && (
                    <div style={{background:"rgba(245,200,66,0.05)",border:"1px solid #f5c842",borderRadius:8,padding:12,marginTop:10}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",color:"#f5c842",marginBottom:8}}>{selectedGame.team1} vs {selectedGame.team2}</div>
                      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10,fontSize:"0.8rem"}}>
                        <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>SPREAD</div><div style={{color:"#f5c842",fontFamily:"'Source Code Pro',monospace"}}>{selectedGame.spread}</div></div>
                        <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>O/U</div><div style={{color:"#2979ff",fontFamily:"'Source Code Pro',monospace"}}>{selectedGame.ou}</div></div>
                        <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>ML</div><div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"0.78rem"}}>{selectedGame.ml1>0?"+":""}{selectedGame.ml1} / {selectedGame.ml2>0?"+":""}{selectedGame.ml2}</div></div>
                      </div>
                      {/* FIXED: actually adds to vote panel */}
                      <button style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,padding:"5px 12px",background:"#f5c842",color:"#000",border:"none",borderRadius:4,cursor:"pointer",fontSize:"0.82rem"}} onClick={()=>putToVote(selectedGame)}>PUT TO VOTE</button>
                    </div>
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

              {tab==="slips" && <SlipPanel toast={showToast} onBetAdded={handleBetUpdate} />}
              {tab==="halftime" && <HalftimePlayer toast={showToast} />}
            </div>
          </div>

          {/* CENTER */}
          <div>
            <div style={card}><VotePanel toast={showToast} onAddVote={addVoteRef} /></div>
            <div style={card}><OraclePanel isLive={isLive} toast={showToast} games={games} /></div>
            <div style={{...card, display:"none"}} className="leaderboard-mobile"><Leaderboard bets={bets} /></div>
          </div>

          {/* RIGHT */}
          <div className="right-col">
            <div style={card}><Leaderboard bets={bets} /></div>
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
              <button onClick={()=>setShowRandy(true)} style={{width:"100%",padding:8,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.9rem",background:"#1a0a0a",color:"#ff1744",border:"1px solid #ff1744",borderRadius:6,cursor:"pointer",marginBottom:10}}>PURDUE LOSES (TRIGGER)</button>
              <div style={{display:"flex",gap:4,marginBottom:8}}>
                {["razz","hype"].map(t=>(
                  <button key={t} onClick={()=>setCmdTab(t)} style={{flex:1,padding:6,fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.85rem",background:cmdTab===t?"#161624":"transparent",border:"none",color:cmdTab===t?"#f5c842":"#6a6a8a",cursor:"pointer",borderRadius:5}}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div style={{maxHeight:260,overflowY:"auto"}}>
                {(cmdTab==="razz"?RAZZ:HYPE).map((msg,i)=>(
                  <button key={i} className="razz-btn" style={{background:`hsl(${i*36+(cmdTab==="hype"?120:0)},55%,20%)`}}
                    onClick={()=>{ cmdTab==="razz" ? fireRazz(msg) : showToast(msg); }}>
                    {msg}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
        {!cmdOpen && <button className="fab" onClick={()=>setCmdOpen(true)}>📱</button>}

        {/* OVERLAYS */}
        {razzBanner && <RazzBanner msg={razzBanner} onClose={()=>setRazzBanner(null)} />}
        {toast && <Toast msg={toast} onClose={()=>setToast(null)} />}
        {winMsg && <WinOverlay msg={winMsg} onClose={()=>setWinMsg(null)} />}
        {showRandy && <RandyOverlay onClose={()=>setShowRandy(false)} />}
        {showIndiana && <IndianaFlash onDone={()=>setShowIndiana(false)} />}
      </div>
    </>
  );
}
