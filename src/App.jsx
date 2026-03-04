import { useState, useEffect, useRef } from "react";

const GAMES = [
  { id:1, team1:"Duke", seed1:1, s1:72, team2:"Tennessee", seed2:4, s2:68, half:"2H", left:"4:23", spread:"Duke -4.5", ou:"141.5", ml1:-190, ml2:160, live:true, final:false },
  { id:2, team1:"Houston", seed1:2, s1:58, team2:"Purdue", seed2:3, s2:61, half:"2H", left:"11:02", spread:"Houston -1.5", ou:"132", ml1:-115, ml2:-105, live:true, final:false },
  { id:3, team1:"Kansas", seed1:1, s1:0, team2:"Michigan St", seed2:5, s2:0, half:"Pre", left:"7:30 PM", spread:"Kansas -6", ou:"138.5", ml1:-220, ml2:185, live:false, final:false },
  { id:4, team1:"Auburn", seed1:2, s1:0, team2:"Creighton", seed2:6, s2:0, half:"Pre", left:"9:55 PM", spread:"Auburn -3.5", ou:"145", ml1:-165, ml2:140, live:false, final:false },
  { id:5, team1:"UConn", seed1:1, s1:81, team2:"Illinois", seed2:3, s2:79, half:"F", left:"Final", spread:"UConn -2", ou:"144.5", ml1:-140, ml2:120, live:false, final:true },
];
const RAZZ = ["CHECK YOUR SQUARES DADCHELOR!","YOUR BRACKET IS DEAD","SHOULDVE LISTENED TO THE CAVE","WHO PICKED THAT TEAM???","PORTFOLIO LOOKING ROUGH BRO","DADDY NEEDS A TIMEOUT","BIG YIKES FROM THE CAVE","WRONG PICK!","DRINK EVERY TIME YOURE WRONG","BOW DOWN TO THE CAVE ORACLE"];
const HYPE = ["LETS GOOOOO!","WERE PRINTING MONEY!","CAVE PREDICTS AGAIN!","CASH THAT TICKET!","WE RIDE TOGETHER!","BRACKET KING!"];
const TICKERS = ["DUKE ML SHARP MONEY COMING IN","PURDUE LINE MOVED -2.5 ON FANDUEL","DK BOOST KANSAS 1H -3 to +105","ILLINOIS STAR PLAYER QUESTIONABLE","CAVE PICK HIT UCONN COVERS","AUBURN CREIGHTON OU UP TO 146.5"];
let apiCallCount = 0;
async function callOracle(prompt) {
  apiCallCount++;
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      system: 'You are the Cave Oracle, a sharp funny sports betting analyst for a March Madness dadchelor party at Snyders Gambling Cave. Return ONLY valid JSON in this exact format with no other text: {"picks":[{"pick":"Team or Bet name","reasoning":"Short punchy reason","value":"HIGH","confidence":75,"site":"DraftKings"}]}',
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  const raw = data.content?.[0]?.text || '{"picks":[]}';
  try { return JSON.parse(raw); } catch { return { picks: [] }; }
}
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
  return <div style={{position:"fixed",top:80,right:16,zIndex:200,background:"#161624",border:"1px solid #f5c842",borderRadius:8,padding:"12px 18px",maxWidth:280,fontFamily:"Oswald,sans-serif",fontSize:"0.9rem",color:"#e8e8f0"}}>{msg}</div>;
}
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
export default function App() {
  const [isLive, setIsLive] = useState(false);
  const [games, setGames] = useState(GAMES);
  const [selected, setSelected] = useState(null);
  const [tab, setTab] = useState("scores");
  const [cmdOpen, setCmdOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [winMsg, setWinMsg] = useState(null);
  const [time, setTime] = useState(new Date().toLocaleTimeString());
  const [picks, setPicks] = useState([]);
  const [loadingPicks, setLoadingPicks] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [votes, setVotes] = useState([
    { id:"v1", pick:"Duke ML (-190)", yes:5, no:2, myVote:null },
    { id:"v2", pick:"Purdue -1.5", yes:3, no:4, myVote:null },
    { id:"v3", pick:"Over 138.5 KC/MSU", yes:7, no:1, myVote:null },
  ]);
  const [newPick, setNewPick] = useState("");
  const [slips, setSlips] = useState([]);
  const [photos, setPhotos] = useState([
    { id:"p1", emoji:"🤵", label:"THE DADCHELOR", caption:"Last day of freedom", color:"#1a0e05" },
    { id:"p2", emoji:"😅", label:"ROOKIE MOVE", caption:"His last good decision", color:"#05101a" },
    { id:"p3", emoji:"🎰", label:"CAVE CREW", caption:"March Madness 2025", color:"#10051a" },
  ]);
  const [apiCalls, setApiCalls] = useState(0);
  const scoreRef = useRef(null);
  const slipRef = useRef(null);
  const photoRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setTime(new Date().toLocaleTimeString()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (isLive) {
      scoreRef.current = setInterval(() => {
        setGames(prev => prev.map(g => {
          if (!g.live || g.final) return g;
          return { ...g, s1: g.s1 + (Math.random()>0.6?(Math.random()>0.5?2:3):0), s2: g.s2 + (Math.random()>0.6?(Math.random()>0.5?2:3):0) };
        }));
      }, 7000);
    } else { clearInterval(scoreRef.current); }
    return () => clearInterval(scoreRef.current);
  }, [isLive]);

  const showToast = (msg) => setToast(msg);
  const fmtML = v => (v > 0 ? "+" : "") + v;

  const fetchPicks = async () => {
    if (!isLive || loadingPicks) return;
    setLoadingPicks(true);
    try {
      const result = await callOracle("Analyze tonight Elite 8 games Duke vs Tennessee, Houston vs Purdue, Kansas vs Michigan St, Auburn vs Creighton. Find the 4 best bets for our dadchelor party gambling cave crew.");
      setPicks(result.picks || []);
      setApiCalls(apiCallCount);
      showToast("Oracle has spoken!");
    } catch { showToast("Oracle connection failed"); }
    setLoadingPicks(false);
  };

  const castVote = (id, yn) => {
    setVotes(prev => prev.map(v => v.id !== id || v.myVote ? v : { ...v, [yn]: v[yn]+1, myVote:yn }));
    showToast(yn === "yes" ? "You are IN!" : "You folded.");
  };

  const addVote = () => {
    if (!newPick.trim()) return;
    setVotes(prev => [...prev, { id:"v"+Date.now(), pick:newPick.trim(), yes:0, no:0, myVote:null }]);
    setNewPick("");
  };

  const playAirhorn = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
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
      setWinMsg("AIRHORN DEPLOYED");
    } catch { showToast("AIRHORN FIRED"); }
  };

  const s = {
    bg: { background:"#07070f", minHeight:"100vh", fontFamily:"Oswald,sans-serif", color:"#e8e8f0" },
    header: { background:"linear-gradient(135deg,#0f0f1a,#1a102a)", borderBottom:"2px solid #f5c842", padding:"10px 20px", display:"flex", alignItems:"center", justifyContent:"space-between", position:"sticky", top:0, zIndex:60 },
    logo: { fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:4, background:"linear-gradient(135deg,#f5c842,#ff9800)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent" },
    card: { background:"#161624", border:"1px solid #252538", borderRadius:8, padding:14, marginBottom:14 },
    title: { fontFamily:"'Bebas Neue',sans-serif", letterSpacing:3, fontSize:"1.1rem", color:"#f5c842", borderBottom:"1px solid #252538", paddingBottom:8, marginBottom:10 },
    btn: { fontFamily:"'Bebas Neue',sans-serif", letterSpacing:2, padding:"7px 16px", border:"none", borderRadius:4, cursor:"pointer", fontSize:"0.95rem" },
    gameRow: (sel) => ({ display:"grid", gridTemplateColumns:"1fr auto 1fr", alignItems:"center", gap:6, padding:10, borderRadius:6, background:"#0f0f1a", border:`1px solid ${sel?"#f5c842":"#252538"}`, marginBottom:6, cursor:"pointer" }),
    voteCard: { background:"#0f0f1a", border:"1px solid rgba(245,200,66,0.3)", borderRadius:8, padding:12, marginBottom:10 },
  };

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Oswald:wght@400;600&family=Source+Code+Pro:wght@400;600&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        ::-webkit-scrollbar{width:4px;height:4px;}
        ::-webkit-scrollbar-thumb{background:#c49a1a;border-radius:2px;}
        .dot{width:8px;height:8px;border-radius:50%;background:#ff1744;animation:pulse 1s infinite;display:inline-block;}
        @keyframes pulse{0%,100%{opacity:1;}50%{opacity:0.4;}}
        .ticker{white-space:nowrap;animation:tick 40s linear infinite;padding-left:100%;font-family:'Source Code Pro',monospace;font-size:0.75rem;color:#6a6a8a;}
        @keyframes tick{from{transform:translateX(0);}to{transform:translateX(-200%);}}
        .fab{position:fixed;bottom:20px;right:20px;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#f5c842,#ff9800);border:none;font-size:1.5rem;cursor:pointer;z-index:101;}
        .commander{position:fixed;bottom:0;right:0;width:300px;background:#0f0f1a;border:1px solid #f5c842;border-radius:12px 0 0 0;z-index:100;}
        .razz{width:100%;padding:10px;margin-bottom:5px;font-family:'Bebas Neue',sans-serif;letter-spacing:1px;font-size:0.95rem;border:none;border-radius:5px;cursor:pointer;color:#fff;}
        @media(max-width:1200px){.right-col{display:none!important;}.mgrid{grid-template-columns:1fr 300px!important;}}
        @media(max-width:800px){.mgrid{grid-template-columns:1fr!important;}}
      `}</style>
      <div style={s.bg}>
        <div style={s.header}>
          <div>
            <div style={s.logo}>SNYDERS GAMBLING CAVE</div>
            <div style={{fontSize:"0.65rem",color:"#6a6a8a",letterSpacing:2}}>DADCHELOR COMMAND CENTER • MARCH MADNESS 2025</div>
          </div>
          <div style={{display:"flex",alignItems:"center",gap:10}}>
            <div style={{background:"#0f0f1a",border:"1px solid #252538",borderRadius:6,padding:"6px 12px",fontFamily:"'Source Code Pro',monospace",fontSize:"0.75rem"}}>
              <span style={{color:"#6a6a8a"}}>CALLS: </span><span>{apiCalls}</span>
            </div>
            <div onClick={()=>{const n=!isLive;setIsLive(n);showToast(n?"Stream ON":"Stream paused");}}
              style={{display:"flex",alignItems:"center",gap:8,background:"#161624",border:`1px solid ${isLive?"#00e676":"#252538"}`,borderRadius:8,padding:"7px 14px",cursor:"pointer",userSelect:"none"}}>
              <div style={{width:40,height:20,borderRadius:10,background:isLive?"#00e676":"#252538",position:"relative",transition:"background 0.25s"}}>
                <div style={{position:"absolute",top:3,left:isLive?23:3,width:14,height:14,borderRadius:"50%",background:"white",transition:"left 0.25s"}} />
              </div>
              <span style={{fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.95rem",color:isLive?"#00e676":"#6a6a8a"}}>GO LIVE</span>
            </div>
            {isLive && <div style={{display:"flex",alignItems:"center",gap:5,background:"rgba(255,23,68,0.1)",border:"1px solid #ff1744",borderRadius:20,padding:"3px 10px",fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.85rem",color:"#ff1744"}}><span className="dot" style={{width:6,height:6}} /> LIVE</div>}
            <div style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1rem",color:"#00e676"}}>{time}</div>
          </div>
        </div>

        <div style={{background:"#09090f",borderBottom:"1px solid #252538",height:30,display:"flex",alignItems:"center",overflow:"hidden"}}>
          <div style={{background:"#f5c842",color:"#000",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,fontSize:"0.78rem",padding:"0 12px",flexShrink:0,height:"100%",display:"flex",alignItems:"center"}}>LIVE FEED</div>
          <div style={{overflow:"hidden",flex:1}}>
            {isLive ? <div className="ticker">{TICKERS.join("   •   ")}</div>
              : <div style={{padding:"0 16px",color:"#6a6a8a",fontFamily:"'Source Code Pro',monospace",fontSize:"0.75rem"}}>STREAM PAUSED — Toggle GO LIVE to activate</div>}
          </div>
        </div>

        <div className="mgrid" style={{display:"grid",gridTemplateColumns:"1fr 300px 260px",gap:14,padding:14,maxWidth:1800,margin:"0 auto"}}>

          <div>
            <div style={s.card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:8}}>
                <div style={s.title}>DADCHELOR WALL OF SHAME</div>
                <button style={{...s.btn,background:"transparent",color:"#f5c842",border:"1px solid #f5c842",fontSize:"0.78rem",padding:"4px 10px"}} onClick={()=>photoRef.current?.click()}>+ PHOTO</button>
                <input ref={photoRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(!f)return;setPhotos(p=>[{id:"u"+Date.now(),url:URL.createObjectURL(f),label:"NEW DROP",caption:"Fresh from the cave"},...p]);showToast("Photo added!");}} />
              </div>
              <div style={{display:"flex",gap:8,overflowX:"auto",paddingBottom:6}}>
                {photos.map(p=>(
                  <div key={p.id} style={{flexShrink:0,borderRadius:6,overflow:"hidden",border:"2px solid #252538",width:120}}>
                    {p.url?<img src={p.url} alt={p.label} style={{width:120,height:120,objectFit:"cover"}} />
                      :<div style={{width:120,height:120,background:p.color,display:"flex",alignItems:"center",justifyContent:"center",fontSize:"2.5rem"}}>{p.emoji}</div>}
                    <div style={{padding:"4px 6px",background:"#0f0f1a"}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.75rem",color:"#f5c842"}}>{p.label}</div>
                      <div style={{fontSize:"0.65rem",color:"#6a6a8a"}}>{p.caption}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div style={s.card}>
              <div style={{display:"flex",gap:3,background:"#0f0f1a",padding:3,borderRadius:7,border:"1px solid #252538",marginBottom:12}}>
                {["scores","boosts","slips"].map(t=>(
                  <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"6px 4px",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,fontSize:"0.85rem",background:tab===t?"#161624":"transparent",border:"none",color:tab===t?"#f5c842":"#6a6a8a",cursor:"pointer",borderRadius:5}}>{t.toUpperCase()}</button>
                ))}
              </div>

              {tab==="scores" && <>
                <div style={s.title}>MARCH MADNESS — ELITE 8</div>
                {games.map(g=>(
                  <div key={g.id} style={s.gameRow(selected?.id===g.id)} onClick={()=>setSelected(g)}>
                    <div>
                      <div style={{display:"flex",gap:4,alignItems:"center",marginBottom:3}}><span style={{fontSize:"0.68rem",color:"#6a6a8a"}}>#{g.seed1}</span><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.95rem"}}>{g.team1}</span></div>
                      <div style={{display:"flex",gap:4,alignItems:"center"}}><span style={{fontSize:"0.68rem",color:"#6a6a8a"}}>#{g.seed2}</span><span style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.95rem",color:"#6a6a8a"}}>{g.team2}</span></div>
                    </div>
                    <div style={{textAlign:"center",minWidth:75}}>
                      {g.live&&!g.final&&<><div style={{display:"flex",gap:4,justifyContent:"center",alignItems:"center",marginBottom:2}}><span className="dot" style={{width:6,height:6}}/><span style={{fontSize:"0.62rem",color:"#ff1744"}}>LIVE</span></div><div><span style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1.2rem",fontWeight:700,color:g.s1>g.s2?"#00e676":"#e8e8f0"}}>{g.s1}</span><span style={{color:"#6a6a8a",margin:"0 3px"}}>-</span><span style={{fontFamily:"'Source Code Pro',monospace",fontSize:"1.2rem",fontWeight:700,color:g.s2>g.s1?"#00e676":"#e8e8f0"}}>{g.s2}</span></div><div style={{fontSize:"0.62rem",color:"#f5c842"}}>{g.half} {g.left}</div></>}
                      {g.final&&<div style={{fontFamily:"'Source Code Pro',monospace",color:"#6a6a8a"}}><div style={{fontSize:"0.62rem",marginBottom:2}}>FINAL</div>{g.s1}-{g.s2}</div>}
                      {!g.live&&!g.final&&<div><div style={{fontSize:"0.82rem",color:"#f5c842"}}>{g.left}</div><div style={{fontSize:"0.62rem",color:"#6a6a8a"}}>UPCOMING</div></div>}
                    </div>
                    <div style={{textAlign:"right",fontSize:"0.7rem"}}>
                      <div style={{marginBottom:3}}><span style={{color:"#f5c842"}}>SPR</span> {g.spread}</div>
                      <div style={{marginBottom:3}}><span style={{color:"#2979ff"}}>O/U</span> {g.ou}</div>
                      <div>
                        <span style={{background:g.ml1<0?"rgba(255,23,68,0.12)":"rgba(0,230,118,0.12)",color:g.ml1<0?"#ff1744":"#00e676",padding:"1px 5px",borderRadius:3,fontFamily:"'Source Code Pro',monospace",fontSize:"0.72rem"}}>{fmtML(g.ml1)}</span>
                        {" "}
                        <span style={{background:g.ml2<0?"rgba(255,23,68,0.12)":"rgba(0,230,118,0.12)",color:g.ml2<0?"#ff1744":"#00e676",padding:"1px 5px",borderRadius:3,fontFamily:"'Source Code Pro',monospace",fontSize:"0.72rem"}}>{fmtML(g.ml2)}</span>
                      </div>
                    </div>
                  </div>
                ))}
                {selected&&(
                  <div style={{background:"rgba(245,200,66,0.05)",border:"1px solid #f5c842",borderRadius:8,padding:12,marginTop:10}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",color:"#f5c842",marginBottom:8}}>{selected.team1} vs {selected.team2}</div>
                    <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:8,marginBottom:10,fontSize:"0.8rem"}}>
                      <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>SPREAD</div><div style={{color:"#f5c842",fontFamily:"'Source Code Pro',monospace"}}>{selected.spread}</div></div>
                      <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>O/U</div><div style={{color:"#2979ff",fontFamily:"'Source Code Pro',monospace"}}>{selected.ou}</div></div>
                      <div><div style={{color:"#6a6a8a",fontSize:"0.62rem"}}>ML</div><div style={{fontFamily:"'Source Code Pro',monospace"}}>{fmtML(selected.ml1)} / {fmtML(selected.ml2)}</div></div>
                    </div>
                    <button style={{...s.btn,background:"#f5c842",color:"#000",fontSize:"0.82rem",padding:"5px 12px"}} onClick={()=>{setVotes(p=>[...p,{id:"v"+Date.now(),pick:`${selected.team1} ML`,yes:0,no:0,myVote:null}]);showToast("Added to vote!");}}>PUT TO VOTE</button>
                  </div>
                )}
              </>}

              {tab==="boosts"&&<div>
                <div style={s.title}>ODDS BOOSTS AND BEST LINES</div>
                {!isLive&&<div style={{textAlign:"center",padding:30,color:"#6a6a8a"}}>Turn on GO LIVE to see boosts</div>}
                {isLive&&[{sport:"⚾",name:"Yankees vs Red Sox",bet:"Yankees ML",odds:"+140",site:"DraftKings",hot:true},{sport:"🏒",name:"Avalanche vs Stars",bet:"Over 5.5",odds:"-108",site:"FanDuel",hot:false},{sport:"🥊",name:"UFC Main Event",bet:"Fight 3+ rds",odds:"+180",site:"BetMGM",hot:true},{sport:"⚽",name:"Man City vs Arsenal",bet:"Both teams score",odds:"+110",site:"Caesars",hot:false}].map((b,i)=>(
                  <div key={i} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 10px",borderRadius:6,marginBottom:6,background:"#0f0f1a",border:`1px solid ${b.hot?"rgba(245,200,66,0.4)":"#252538"}`}}>
                    <span style={{fontSize:"1rem"}}>{b.sport}</span>
                    <div style={{flex:1}}><div style={{fontSize:"0.68rem",color:"#6a6a8a"}}>{b.name}</div><div style={{fontSize:"0.82rem",fontWeight:600}}>{b.bet}</div></div>
                    <div style={{textAlign:"right"}}><div style={{fontFamily:"'Source Code Pro',monospace",fontWeight:700,color:b.odds.startsWith("+")?"#00e676":"#6a6a8a"}}>{b.odds}</div>{b.hot&&<div style={{fontSize:"0.6rem",color:"#f5c842"}}>BOOST</div>}<div style={{fontSize:"0.62rem",color:"#6a6a8a"}}>{b.site}</div></div>
                  </div>
                ))}
              </div>}

              {tab==="slips"&&<div>
                <div style={s.title}>BET SLIP WALL</div>
                <div onClick={()=>slipRef.current?.click()} style={{border:"2px dashed #252538",borderRadius:8,padding:18,textAlign:"center",cursor:"pointer"}}>
                  <div style={{fontSize:"1.8rem",marginBottom:4}}>📸</div>
                  <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"1rem",letterSpacing:2,color:"#f5c842"}}>UPLOAD YOUR SLIP</div>
                  <div style={{fontSize:"0.72rem",color:"#6a6a8a"}}>Screenshot and show the crew</div>
                  <input ref={slipRef} type="file" accept="image/*" style={{display:"none"}} onChange={e=>{const f=e.target.files[0];if(!f)return;setSlips(p=>[{id:Date.now(),url:URL.createObjectURL(f),time:new Date().toLocaleTimeString()},...p]);showToast("Slip uploaded!");}} />
                </div>
                <div style={{marginTop:10,maxHeight:300,overflowY:"auto"}}>
                  {slips.length===0&&<div style={{textAlign:"center",padding:16,color:"#6a6a8a",fontSize:"0.82rem"}}>No slips yet</div>}
                  {slips.map(s=>(
                    <div key={s.id} style={{background:"#0f0f1a",border:"1px solid #252538",borderRadius:6,padding:10,marginBottom:8}}>
                      <img src={s.url} alt="slip" style={{width:"100%",borderRadius:4,maxHeight:200,objectFit:"cover"}} />
                      <div style={{marginTop:5,fontSize:"0.68rem",color:"#6a6a8a"}}>Uploaded {s.time}</div>
                    </div>
                  ))}
                </div>
              </div>}
            </div>
          </div>

          <div>
            <div style={s.card}>
              <div style={s.title}>RIDE TOGETHER?</div>
              {votes.map(v=>{
                const total=v.yes+v.no||1;
                const pct=Math.round((v.yes/total)*100);
                return(
                  <div key={v.id} style={s.voteCard}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:6}}>
                      <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.9rem"}}>{v.pick}</div>
                      <button onClick={()=>setVotes(p=>p.filter(x=>x.id!==v.id))} style={{background:"none",border:"none",color:"#6a6a8a",cursor:"pointer"}}>x</button>
                    </div>
                    <div style={{height:18,background:"#252538",borderRadius:9,overflow:"hidden",margin:"6px 0"}}><div style={{height:"100%",width:`${pct}%`,background:"linear-gradient(90deg,#00e676,#f5c842)",transition:"width 0.5s"}} /></div>
                    <div style={{display:"flex",justifyContent:"space-between",fontSize:"0.7rem",color:"#6a6a8a",marginBottom:8}}>
                      <span style={{color:"#00e676"}}>RIDE {v.yes}</span><span>{pct}% IN</span><span style={{color:"#ff1744"}}>SKIP {v.no}</span>
                    </div>
                    {!v.myVote
                      ?<div style={{display:"flex",gap:6}}>
                        <button style={{...s.btn,background:"#00e676",color:"#000",flex:1,fontSize:"0.85rem",padding:"5px 0"}} onClick={()=>castVote(v.id,"yes")}>RIDE</button>
                        <button style={{...s.btn,background:"#ff1744",color:"#fff",flex:1,fontSize:"0.85rem",padding:"5px 0"}} onClick={()=>castVote(v.id,"no")}>SKIP</button>
                      </div>
                      :<div style={{textAlign:"center",fontSize:"0.8rem",color:v.myVote==="yes"?"#00e676":"#ff1744"}}>{v.myVote==="yes"?"You are IN":"You folded"} — {pct}% riding</div>
                    }
                  </div>
                );
              })}
              <div style={{display:"flex",gap:6,marginTop:6}}>
                <input value={newPick} onChange={e=>setNewPick(e.target.value)} onKeyDown={e=>e.key==="Enter"&&addVote()} placeholder="Add a pick to vote on..." style={{flex:1,background:"#0f0f1a",border:"1px solid #252538",borderRadius:4,padding:"6px 10px",color:"#e8e8f0",fontFamily:"Oswald,sans-serif",fontSize:"0.85rem"}} />
                <button style={{...s.btn,background:"#f5c842",color:"#000",fontSize:"0.82rem",padding:"5px 12px"}} onClick={addVote}>ADD</button>
              </div>
            </div>

            <div style={s.card}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <div style={s.title}>CAVE ORACLE</div>
                <button style={{...s.btn,background:"transparent",color:"#f5c842",border:"1px solid #f5c842",fontSize:"0.78rem",padding:"4px 10px"}} onClick={fetchPicks} disabled={!isLive||loadingPicks}>{loadingPicks?"READING...":"GET PICKS"}</button>
              </div>
              {!isLive&&<div style={{textAlign:"center",padding:30,color:"#6a6a8a"}}>Turn on GO LIVE to use the Oracle</div>}
              {isLive&&loadingPicks&&<div style={{padding:14,color:"#f5c842",fontFamily:"'Source Code Pro',monospace",fontSize:"0.85rem"}}>Cave Oracle analyzing the lines...</div>}
              {isLive&&!loadingPicks&&picks.length===0&&<div style={{textAlign:"center",padding:20,color:"#6a6a8a",fontSize:"0.85rem"}}>Hit GET PICKS to consult the Oracle</div>}
              {picks.map((p,i)=>(
                <div key={i} onClick={()=>setExpanded(expanded===i?null:i)} style={{background:"#0f0f1a",border:`1px solid ${p.value==="HIGH"?"rgba(245,200,66,0.5)":"#252538"}`,borderRadius:6,padding:10,marginBottom:8,cursor:"pointer"}}>
                  <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                    <div style={{fontFamily:"'Bebas Neue',sans-serif",fontSize:"0.95rem",color:p.value==="HIGH"?"#f5c842":"#e8e8f0",flex:1,marginRight:8}}>{p.pick}</div>
                    <div style={{textAlign:"right",flexShrink:0}}><div style={{fontSize:"0.68rem",color:p.value==="HIGH"?"#f5c842":"#6a6a8a"}}>{p.value}</div><div style={{color:"#00e676",fontFamily:"'Source Code Pro',monospace"}}>{p.confidence}%</div></div>
                  </div>
                  <div style={{height:4,background:"#252538",borderRadius:2,marginTop:6}}><div style={{height:"100%",width:`${p.confidence}%`,background:"linear-gradient(90deg,#2979ff,#00e676)",borderRadius:2}} /></div>
                  {expanded===i&&<div style={{marginTop:8,fontSize:"0.78rem",color:"#6a6a8a",lineHeight:1.55,borderTop:"1px solid #252538",paddingTop:8}}>{p.reasoning}<div style={{color:"#2979ff",fontSize:"0.72rem",marginTop:4}}>{p.site}</div></div>}
                </div>
              ))}
            </div>
          </div>

          <div className="right-col">
            <div style={s.card}>
              <div style={s.title}>CAVE LEDGER</div>
              {[["BETS TODAY","7","#e8e8f0"],["WINS","4","#00e676"],["LOSSES","2","#ff1744"],["NET P/L","+$342","#00e676"],["CAVE RECORD","4-2-1","#e8e8f0"]].map(([l,v,c])=>(
                <div key={l} style={{display:"flex",justifyContent:"space-between",padding:"5px 0",borderBottom:"1px solid #252538",fontSize:"0.8rem"}}>
                  <span style={{color:"#6a6a8a"}}>{l}</span><span style={{fontFamily:"'Source Code Pro',monospace",fontWeight:700,color:c}}>{v}</span>
                </div>
              ))}
            </div>
            <div style={{...s.card,marginTop:14}}>
              <div style={s.title}>CAVE RULES</div>
              <div style={{fontSize:"0.76rem",color:"#6a6a8a",lineHeight:2}}>
                {["Oracle picks are LAW","Majority vote = we ride","Upload slips to claim wins","Airhorn on every W","Razz the dadchelor liberally","What happens in the cave stays"].map((r,i)=>(
                  <div key={i}><span style={{color:"#f5c842"}}>{i+1}.</span> {r}</div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {cmdOpen&&(
          <div className="commander">
            <div style={{padding:"10px 14px",borderBottom:"1px solid #252538",display:"flex",justifyContent:"space-between",alignItems:"center",fontFamily:"'Bebas Neue',sans-serif",letterSpacing:2,color:"#f5c842"}}>
              <span>MOBILE COMMANDER</span>
              <button onClick={()=>setCmdOpen(false)} style={{background:"none",border:"none",color:"#6a6a8a",cursor:"pointer",fontSize:"1rem"}}>x</button>
            </div>
            <div style={{padding:"10px 12px"}}>
              <button onClick={playAirhorn} style={{width:"100%",padding:16,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:4,fontSize:"1.6rem",background:"linear-gradient(135deg,#ff6f00,#ff1744)",color:"#fff",border:"none",borderRadius:8,cursor:"pointer",marginBottom:10}}>AIR HORN</button>
              <div style={{display:"flex",gap:4,marginBottom:10}}>
                {["razz","hype"].map(t=>(
                  <button key={t} onClick={()=>setTab("cmd_"+t)} style={{flex:1,padding:6,fontFamily:"'Bebas Neue',sans-serif",letterSpacing:1,fontSize:"0.85rem",background:tab==="cmd_"+t?"#161624":"transparent",border:"none",color:tab==="cmd_"+t?"#f5c842":"#6a6a8a",cursor:"pointer",borderRadius:5}}>{t.toUpperCase()}</button>
                ))}
              </div>
              <div style={{maxHeight:250,overflowY:"auto"}}>
                {(tab!=="cmd_hype"?RAZZ:HYPE).map((msg,i)=>(
                  <button key={i} className="razz" style={{background:`hsl(${i*36+(tab==="cmd_hype"?120:0)},55%,20%)`}} onClick={()=>showToast(msg)}>{msg}</button>
                ))}
              </div>
            </div>
          </div>
        )}
        {!cmdOpen&&<button className="fab" onClick={()=>setCmdOpen(true)}>📱</button>}
        {toast&&<Toast msg={toast} onClose={()=>setToast(null)} />}
        {winMsg&&<WinOverlay msg={winMsg} onClose={()=>setWinMsg(null)} />}
      </div>
    </>
  );
}
