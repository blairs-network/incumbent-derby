import React, { useState, useRef, useEffect } from "react";

const C = {
  ink: "#0E0E0E", panel: "#141414", cream: "#F2ECE1",
  red: "#C02020", dim: "#857F74", line: "#26241F", green: "#9FB87A",
};
const mono = "'IBM Plex Mono', ui-monospace, monospace";
const serif = "'Source Serif 4', Georgia, serif";

const Hd = ({ children, style }) => (
  <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, color: C.dim, ...style }}>
    {children}
  </span>
);

const MODELS = [
  { value: "anthropic/claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
  { value: "anthropic/claude-opus-4-8", label: "Claude Opus 4.8" },
  { value: "anthropic/claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "mock", label: "Mock (no key needed)" },
];

const ORDER = ["ORIGINAL", "B", "A", "AB"];

export default function App() {
  // Form
  const [text, setText] = useState(
    "The quarterly numbers were, in our estimation, somewhat below where we had hoped they might land."
  );
  const [goal, setGoal] = useState("cut the hedging, keep the meaning");
  const [judges, setJudges] = useState(5);
  const [maxRounds, setMaxRounds] = useState(5);
  const [stopAfter, setStopAfter] = useState(2);
  const [model, setModel] = useState("anthropic/claude-sonnet-4-6");
  const [bettingWindow, setBettingWindow] = useState(30);

  // View: form | queued | racing | done
  const [view, setView] = useState("form");
  const [error, setError] = useState("");

  // Race
  const [derbyId, setDerbyId] = useState(null);
  const [derby, setDerby] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [finalData, setFinalData] = useState(null);
  const [openCard, setOpenCard] = useState(null);

  // Betting
  const [countdown, setCountdown] = useState(0);
  const [betHandle, setBetHandle] = useState(() => localStorage.getItem("derby_handle") || "");
  const [betPrediction, setBetPrediction] = useState(null);
  const [betAmount, setBetAmount] = useState(100);
  const [walletBalance, setWalletBalance] = useState(null);
  const [myBet, setMyBet] = useState(null);
  const [betError, setBetError] = useState("");
  const [betResult, setBetResult] = useState(null);
  const [betPlacing, setBetPlacing] = useState(false);
  const [copied, setCopied] = useState(false);

  // Leaderboard / history
  const [agents, setAgents] = useState([]);
  const [recent, setRecent] = useState([]);

  const esRef = useRef(null);
  const cdRef = useRef(null);

  useEffect(() => {
    fetchAgents();
    fetchRecent();
    return () => {
      if (esRef.current) esRef.current.close();
      if (cdRef.current) clearInterval(cdRef.current);
    };
  }, []);

  useEffect(() => {
    if (!betHandle) return;
    localStorage.setItem("derby_handle", betHandle);
    fetch(`/wallets/${encodeURIComponent(betHandle)}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => d && setWalletBalance(d.balance))
      .catch(() => {});
  }, [betHandle]);

  // Fetch bet result when race ends
  useEffect(() => {
    if (view !== "done" || !myBet || !derbyId) return;
    const tid = setTimeout(() => {
      fetch(`/derbies/${derbyId}/bets`)
        .then(r => r.json())
        .then(bets => {
          const b = bets.find(x => x.id === myBet.id);
          if (b) setBetResult(b);
        })
        .catch(() => {});
    }, 600);
    return () => clearTimeout(tid);
  }, [view, myBet, derbyId]);

  const fetchAgents = () =>
    fetch("/agents").then(r => r.ok ? r.json() : []).then(setAgents).catch(() => {});

  const fetchRecent = () =>
    fetch("/derbies").then(r => r.ok ? r.json() : []).then(setRecent).catch(() => {});

  const startCountdown = (closesAtStr) => {
    if (cdRef.current) clearInterval(cdRef.current);
    const at = new Date(closesAtStr.replace(" ", "T") + (closesAtStr.includes("Z") ? "" : "Z")).getTime();
    const tick = () => {
      const rem = Math.max(0, Math.ceil((at - Date.now()) / 1000));
      setCountdown(rem);
      if (rem <= 0) clearInterval(cdRef.current);
    };
    tick();
    cdRef.current = setInterval(tick, 250);
  };

  const connectSSE = (id) => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/derbies/${id}/events`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "started") {
          if (cdRef.current) clearInterval(cdRef.current);
          setView("racing");
        } else if (ev.type === "round") {
          setRounds(prev => [...prev, ev.round]);
        } else if (ev.type === "done") {
          setFinalData(ev);
          setView("done");
          fetchAgents();
          fetchRecent();
        } else if (ev.type === "error") {
          setError(ev.message || "unknown error");
          setView("done");
        }
      } catch {}
    };
    es.onerror = () => {};
  };

  const submit = async () => {
    if (esRef.current) esRef.current.close();
    if (cdRef.current) clearInterval(cdRef.current);
    setError(""); setRounds([]); setFinalData(null);
    setMyBet(null); setBetResult(null); setBetPrediction(null);
    setOpenCard(null); setBetError(""); setCopied(false);

    const isMock = model === "mock";
    const payload = {
      original_text: text, goal,
      judges: Number(judges),
      max_rounds: Number(maxRounds),
      stop_after: Number(stopAfter),
      mock_mode: isMock,
      model: isMock ? "anthropic/claude-sonnet-4-6" : model,
      async_mode: true,
      betting_window: Number(bettingWindow),
    };

    setView("queued");
    try {
      const r = await fetch("/derbies", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const err = await r.json().catch(() => ({ detail: r.statusText }));
        throw new Error(err.detail || "failed");
      }
      const d = await r.json();
      setDerby(d);
      setDerbyId(d.id);
      if (d.betting_closes_at && Number(bettingWindow) > 0) {
        startCountdown(d.betting_closes_at);
      } else {
        setView("racing");
      }
      connectSSE(d.id);
    } catch (e) {
      setError(e.message);
      setView("form");
    }
  };

  const placeBet = async () => {
    if (!derbyId || !betPrediction || !betHandle.trim() || betAmount <= 0) return;
    setBetError(""); setBetPlacing(true);
    try {
      const r = await fetch(`/derbies/${derbyId}/bets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          bettor_handle: betHandle.trim(),
          prediction: betPrediction,
          amount: Number(betAmount),
        }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "bet failed");
      setMyBet(data);
      setWalletBalance(prev => prev !== null ? prev - Number(betAmount) : null);
    } catch (e) {
      setBetError(e.message);
    } finally {
      setBetPlacing(false);
    }
  };

  const reset = () => {
    if (esRef.current) esRef.current.close();
    if (cdRef.current) clearInterval(cdRef.current);
    setView("form");
    setDerbyId(null); setDerby(null); setRounds([]); setFinalData(null);
    setMyBet(null); setBetResult(null); setBetPrediction(null);
    setCountdown(0); setError(""); setBetError(""); setCopied(false);
  };

  const copyFinal = () => {
    const t = finalData?.final_text || derby?.final_text;
    if (t) navigator.clipboard?.writeText(t);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const maxBorda = derby ? derby.judges * 3 : 15;
  const fmtCountdown = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.cream, fontFamily: serif }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,800;1,8..60,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #0E0E0E; }
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes flare{0%{box-shadow:0 0 0 0 rgba(192,32,32,.6)}100%{box-shadow:0 0 0 14px rgba(192,32,32,0)}}
        @keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
        @keyframes glow{0%,100%{box-shadow:0 0 0 0 rgba(159,184,122,.35)}50%{box-shadow:0 0 12px 4px rgba(159,184,122,.35)}}
        @keyframes tick{from{transform:scale(1.08)}to{transform:scale(1)}}
        .bar{transition:width .7s cubic-bezier(.4,0,.1,1)}
        .rise{animation:rise .35s ease both}
        textarea,input,select{font-family:${serif};background:${C.panel};color:${C.cream};border:1px solid ${C.line};padding:10px 12px;font-size:15px;width:100%;border-radius:0}
        textarea:focus,input:focus,select:focus{outline:none;border-color:${C.dim}}
        .btn-enter{font-family:${mono};letter-spacing:2px;font-size:13px;background:${C.red};color:${C.cream};border:0;padding:13px 28px;cursor:pointer;font-weight:600}
        .btn-enter:disabled{background:${C.line};color:${C.dim};cursor:default}
        .lk{font-family:${mono};font-size:11px;letter-spacing:1px;color:${C.cream};background:none;border:0;cursor:pointer;padding:0}
        .lk:hover{color:${C.red}}
        .bet-btn{font-family:${mono};letter-spacing:1.5px;font-size:12px;border:2px solid;padding:18px 20px;cursor:pointer;transition:all .15s;flex:1;text-align:center;font-weight:600}
        .bet-btn:hover{filter:brightness(1.1)}
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "34px 22px 80px" }}>

        {/* ── masthead ── */}
        <div style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 10 }}>
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
              <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>Incumbent Derby</h1>
              {derby && <Hd style={{ fontSize: 11 }}>{derby.model || "live"} · #{derbyId}</Hd>}
            </div>
            <p style={{ margin: "6px 0 0", fontStyle: "italic", color: C.dim, fontSize: 15 }}>
              Every change must defeat doing nothing. The incumbent always runs.
            </p>
          </div>
          {view !== "form" && (
            <button className="lk" onClick={reset} style={{ fontSize: 11, letterSpacing: 1 }}>
              ← NEW DERBY
            </button>
          )}
        </div>

        {/* ── FORM VIEW ── */}
        {view === "form" && (
          <div style={{ marginTop: 26 }}>
            <Hd>ENTER THE FIELD</Hd>
            <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
              <div>
                <label style={{ fontSize: 13, color: C.dim }}>Text to defend — the incumbent</label>
                <textarea rows={4} value={text} onChange={e => setText(e.target.value)} style={{ marginTop: 5 }} />
              </div>
              <div>
                <label style={{ fontSize: 13, color: C.dim }}>Revision goal</label>
                <input value={goal} onChange={e => setGoal(e.target.value)} style={{ marginTop: 5 }} />
              </div>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
                {[
                  ["Judges", judges, setJudges, 1, 15],
                  ["Max rounds", maxRounds, setMaxRounds, 1, 10],
                  ["Stop after", stopAfter, setStopAfter, 1, 5],
                  ["Bet window (s)", bettingWindow, setBettingWindow, 0, 120],
                ].map(([label, val, set, min, max]) => (
                  <div key={label} style={{ width: 116 }}>
                    <label style={{ fontSize: 12, color: C.dim }}>{label}</label>
                    <input type="number" min={min} max={max} value={val}
                      onChange={e => set(e.target.value)} style={{ marginTop: 5 }} />
                  </div>
                ))}
                <div style={{ minWidth: 180, flex: "1 1 180px" }}>
                  <label style={{ fontSize: 12, color: C.dim }}>Model</label>
                  <select value={model} onChange={e => setModel(e.target.value)} style={{ marginTop: 5 }}>
                    {MODELS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <span style={{ flex: 1 }} />
                <button className="btn-enter" onClick={submit} disabled={!text.trim() || !goal.trim()}>
                  ENTER THE DERBY
                </button>
              </div>
              {error && <div style={{ color: C.red, fontFamily: mono, fontSize: 12 }}>error: {error}</div>}
            </div>
          </div>
        )}

        {/* ── QUEUED / BETTING VIEW ── */}
        {view === "queued" && (
          <div className="rise" style={{ marginTop: 32 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28 }}>
              <div>
                <Hd>RACE QUEUED</Hd>
                <div style={{ marginTop: 6, fontStyle: "italic", color: C.dim, fontSize: 15 }}>"{derby?.goal}"</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <Hd>BETTING CLOSES IN</Hd>
                <div style={{ fontFamily: mono, fontSize: 52, fontWeight: 600, color: countdown <= 5 ? C.red : C.cream,
                              animation: countdown <= 5 && countdown > 0 ? "tick .5s ease infinite alternate" : "none",
                              lineHeight: 1.1, marginTop: 4 }}>
                  {fmtCountdown(countdown)}
                </div>
              </div>
            </div>

            {!myBet ? (
              <div style={{ background: C.panel, border: `1px solid ${C.line}`, padding: 24 }}>
                <Hd style={{ fontSize: 11 }}>PLACE YOUR BET — PICK A SIDE</Hd>
                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <button
                    className="bet-btn"
                    disabled={countdown === 0}
                    style={{
                      borderColor: betPrediction === "CHANGE ADOPTED" ? C.green : C.line,
                      background: betPrediction === "CHANGE ADOPTED" ? C.green : "transparent",
                      color: betPrediction === "CHANGE ADOPTED" ? C.ink : C.cream,
                      animation: betPrediction === "CHANGE ADOPTED" ? "glow 1.8s ease infinite" : "none",
                    }}
                    onClick={() => setBetPrediction("CHANGE ADOPTED")}
                  >
                    CHANGE WINS
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: .75, letterSpacing: 0 }}>
                      a revision beats the original
                    </div>
                  </button>
                  <button
                    className="bet-btn"
                    disabled={countdown === 0}
                    style={{
                      borderColor: betPrediction === "KEEP ORIGINAL" ? C.red : C.line,
                      background: betPrediction === "KEEP ORIGINAL" ? C.red : "transparent",
                      color: betPrediction === "KEEP ORIGINAL" ? C.cream : C.cream,
                      animation: betPrediction === "KEEP ORIGINAL" ? "flare 1.8s ease infinite" : "none",
                    }}
                    onClick={() => setBetPrediction("KEEP ORIGINAL")}
                  >
                    DO NOTHING WINS
                    <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: .75, letterSpacing: 0 }}>
                      the original holds all rounds
                    </div>
                  </button>
                </div>

                <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
                  <div style={{ flex: "1 1 160px" }}>
                    <label style={{ fontSize: 12, color: C.dim }}>Your handle</label>
                    <input value={betHandle} onChange={e => setBetHandle(e.target.value)}
                      placeholder="spectator" style={{ marginTop: 5 }} />
                  </div>
                  <div style={{ width: 120 }}>
                    <label style={{ fontSize: 12, color: C.dim }}>
                      Chips {walletBalance !== null ? `(balance: ${Math.floor(walletBalance)})` : ""}
                    </label>
                    <input type="number" min={1} max={walletBalance ?? 10000} value={betAmount}
                      onChange={e => setBetAmount(e.target.value)} style={{ marginTop: 5 }} />
                  </div>
                  <button
                    className="btn-enter"
                    onClick={placeBet}
                    disabled={!betPrediction || !betHandle.trim() || betAmount <= 0 || betPlacing || countdown === 0}
                    style={{ background: betPrediction === "CHANGE ADOPTED" ? C.green : betPrediction === "KEEP ORIGINAL" ? C.red : C.line,
                             color: betPrediction === "CHANGE ADOPTED" ? C.ink : C.cream }}
                  >
                    {betPlacing ? "PLACING…" : "LOCK IT IN"}
                  </button>
                </div>
                {betError && <div style={{ marginTop: 8, color: C.red, fontFamily: mono, fontSize: 11 }}>{betError}</div>}
              </div>
            ) : (
              <div className="rise" style={{ background: C.panel, border: `1px solid ${C.line}`, padding: 22, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <Hd>BET LOCKED</Hd>
                  <div style={{ marginTop: 8, fontFamily: mono, fontSize: 20, fontWeight: 600,
                                color: myBet.prediction === "CHANGE ADOPTED" ? C.green : C.red }}>
                    {myBet.prediction}
                  </div>
                  <div style={{ marginTop: 4, fontFamily: mono, fontSize: 13, color: C.dim }}>
                    {myBet.amount} chips · {myBet.bettor_handle}
                  </div>
                </div>
                <div style={{ textAlign: "right", color: C.dim, fontSize: 13, fontStyle: "italic" }}>
                  Waiting for the gate to open…
                </div>
              </div>
            )}

            <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.dim, display: "inline-block", animation: "pulse 1.4s infinite" }} />
              <Hd>RACE WILL START AUTOMATICALLY WHEN BETTING CLOSES</Hd>
            </div>
          </div>
        )}

        {/* ── RACING VIEW ── */}
        {(view === "racing" || (view === "done" && rounds.length > 0)) && (
          <div style={{ marginTop: 30 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                          borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
              <div>
                <Hd>THE RACE</Hd>
                <span style={{ marginLeft: 10, fontStyle: "italic", color: C.dim, fontSize: 14 }}>"{derby?.goal}"</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.red, display: "inline-block",
                               animation: view === "racing" ? "pulse 1s infinite" : "none" }} />
                <Hd>{view === "racing" ? `ROUND ${rounds.length} · LIVE` : "FINISHED"}</Hd>
              </div>
            </div>

            {myBet && (
              <div style={{ marginTop: 14, padding: "10px 14px", background: C.panel, border: `1px solid ${C.line}`,
                            display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <span style={{ fontFamily: mono, fontSize: 11, color: C.dim, letterSpacing: 1 }}>
                  YOUR BET · {myBet.bettor_handle}
                </span>
                <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600,
                               color: myBet.prediction === "CHANGE ADOPTED" ? C.green : C.red }}>
                  {myBet.prediction} · {myBet.amount} chips
                </span>
              </div>
            )}

            {rounds.map((rd) => (
              <div key={rd.index} className="rise" style={{ marginTop: 22 }}>
                <Hd>ROUND {rd.index} · BORDA COUNT</Hd>
                <div style={{ marginTop: 10 }}>
                  {ORDER.map((id) => {
                    const cand = rd.candidates[id];
                    if (!cand) return null;
                    const pts = rd.points[id] ?? 0;
                    const win = rd.winner === id;
                    const isOrig = id === "ORIGINAL";
                    const pct = (pts / maxBorda) * 100;
                    const cardKey = `${rd.index}:${id}`;
                    const isOpen = openCard === cardKey;
                    return (
                      <div key={id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                            <span style={{ fontSize: 18, fontWeight: 800, color: win ? C.red : C.cream }}>
                              {cand.name}
                            </span>
                            {isOrig && <Hd style={{ border: `1px solid ${C.line}`, padding: "1px 5px" }}>INCUMBENT</Hd>}
                            {win && <Hd style={{ color: C.red }}>WINNER</Hd>}
                            <button className="lk" style={{ fontSize: 10, color: C.dim }}
                              onClick={() => setOpenCard(isOpen ? null : cardKey)}>
                              {isOpen ? "HIDE" : "TEXT"}
                            </button>
                          </span>
                          <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, color: win ? C.red : C.cream }}>
                            {pts}
                          </span>
                        </div>
                        <div style={{ height: 12, border: isOrig ? `1px dashed ${C.dim}` : `1px solid ${C.line}`, position: "relative" }}>
                          <div className="bar" style={{
                            position: "absolute", inset: 0, width: `${pct}%`,
                            background: win ? C.red : isOrig ? "transparent" : C.cream,
                            backgroundImage: isOrig && !win ? `repeating-linear-gradient(45deg,${C.dim} 0 1px,transparent 1px 6px)` : "none",
                            animation: win ? "flare 1s ease 1" : "none",
                          }} />
                        </div>
                        {isOpen && (
                          <div className="rise" style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line}`,
                                                         padding: "10px 12px", fontSize: 14, lineHeight: 1.55, color: C.cream }}>
                            {cand.text}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
                <div style={{ marginTop: 8, fontStyle: "italic", fontSize: 13.5, color: rd.winner === "ORIGINAL" ? C.dim : C.cream }}>
                  {rd.winner === "ORIGINAL"
                    ? "The original held — no change earned this round."
                    : `${rd.winner_name} earned the right to replace the incumbent.`}
                </div>
                {rd.rankings && rd.rankings.length > 0 && (
                  <div style={{ marginTop: 6, display: "flex", gap: 14, flexWrap: "wrap" }}>
                    {rd.rankings.map((j, i) => (
                      <div key={i} style={{ fontFamily: mono, fontSize: 10, color: C.dim }}>
                        J{j.judge} {j.lens && `[${j.lens}]`}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {view === "racing" && rounds.length === 0 && (
              <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red, display: "inline-block", animation: "pulse 1s infinite" }} />
                <span style={{ fontFamily: mono, fontSize: 12, color: C.dim, letterSpacing: 1 }}>FIRST ROUND RUNNING…</span>
              </div>
            )}
          </div>
        )}

        {/* ── DONE / VERDICT ── */}
        {view === "done" && finalData && (
          <div className="rise" style={{ marginTop: 38 }}>
            <Hd>FINAL DECISION</Hd>
            <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1, margin: "8px 0 6px",
                          color: finalData.changed ? C.cream : C.red }}>
              {finalData.final_decision}
            </div>
            <div style={{ fontSize: 15, fontStyle: "italic", color: C.dim, marginBottom: 24 }}>
              {finalData.stop_reason}.{" "}
              {finalData.changed
                ? "A revision beat doing nothing, then the field converged."
                : "No revision ever beat doing nothing."}
            </div>

            {betResult && (
              <div className="rise" style={{ marginBottom: 24, padding: "18px 20px",
                                             background: C.panel, border: `2px solid ${betResult.won ? C.green : C.red}` }}>
                <Hd style={{ color: betResult.won ? C.green : C.red }}>
                  {betResult.won ? "YOU WON" : "YOU LOST"}
                </Hd>
                <div style={{ marginTop: 8, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline" }}>
                  {betResult.won ? (
                    <>
                      <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.green }}>
                        +{Math.floor(betResult.payout - betResult.amount)} chips
                      </span>
                      <span style={{ fontFamily: mono, fontSize: 13, color: C.dim }}>
                        paid {Math.floor(betResult.payout)} · staked {betResult.amount}
                      </span>
                    </>
                  ) : (
                    <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 600, color: C.red }}>
                      -{betResult.amount} chips
                    </span>
                  )}
                </div>
              </div>
            )}

            {myBet && !betResult && (
              <div style={{ marginBottom: 20, padding: "14px 16px", background: C.panel, border: `1px solid ${C.line}`,
                            fontFamily: mono, fontSize: 12, color: C.dim }}>
                settling bet…
              </div>
            )}

            <Hd>FINAL TEXT</Hd>
            <div style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line}`,
                          padding: "16px 18px", fontSize: 16, lineHeight: 1.55 }}>
              {finalData.final_text}
            </div>
            <div style={{ marginTop: 10, display: "flex", gap: 16 }}>
              <button className="lk" onClick={copyFinal}>{copied ? "✓ COPIED" : "⧉ COPY FINAL TEXT"}</button>
              <button className="lk" onClick={reset}>← ENTER A NEW DERBY</button>
            </div>
          </div>
        )}

        {view === "done" && !finalData && error && (
          <div style={{ marginTop: 30, color: C.red, fontFamily: mono, fontSize: 13 }}>
            RACE ERROR: {error}
            <button className="lk" onClick={reset} style={{ marginLeft: 16 }}>← BACK</button>
          </div>
        )}

        {/* ── AGENT LEADERBOARD ── */}
        {agents.length > 0 && (
          <div style={{ marginTop: 46, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
            <Hd>AGENT LEADERBOARD</Hd>
            <div style={{ marginTop: 8 }}>
              {agents.slice(0, 8).map((a, i) => (
                <div key={a.handle} style={{ display: "flex", justifyContent: "space-between",
                                             padding: "7px 0", borderBottom: `1px solid ${C.line}`, alignItems: "baseline" }}>
                  <span style={{ display: "flex", gap: 10, alignItems: "baseline" }}>
                    <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, width: 16 }}>{i + 1}</span>
                    <span style={{ fontSize: 14 }}>{a.handle}</span>
                  </span>
                  <span style={{ display: "flex", gap: 16 }}>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.green }}>{a.wins}W</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{a.losses}L</span>
                    <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>
                      {a.entries > 0 ? `${Math.round(a.win_rate * 100)}%` : "—"}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── RECENT DERBIES ── */}
        {recent.length > 0 && (
          <div style={{ marginTop: 32, borderTop: agents.length > 0 ? "none" : `1px solid ${C.line}`, paddingTop: agents.length > 0 ? 0 : 16 }}>
            {agents.length === 0 && <Hd>RECENT DERBIES</Hd>}
            {agents.length > 0 && <Hd style={{ display: "block", marginBottom: 8 }}>RECENT DERBIES</Hd>}
            <div style={{ marginTop: agents.length > 0 ? 8 : 8 }}>
              {recent.slice(0, 8).map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                                         padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13, gap: 10 }}>
                  <span style={{ fontStyle: "italic", color: C.dim, overflow: "hidden",
                                 textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1, minWidth: 0 }}>
                    "{r.goal}"
                  </span>
                  <span style={{ fontFamily: mono, fontSize: 11, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                    {r.status === "running" || r.status === "queued" ? (
                      <>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red,
                                       display: "inline-block", animation: "pulse 1s infinite" }} />
                        <span style={{ color: C.red }}>LIVE</span>
                      </>
                    ) : (
                      <span style={{ color: r.final_decision === "KEEP ORIGINAL" ? C.red : C.green }}>
                        {r.final_decision || r.status.toUpperCase()}
                      </span>
                    )}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 40, fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.dim }}>
          ties favor doing nothing · the incumbent holding twice ends the derby · agents are the players · humans are the stadium
        </div>
      </div>
    </div>
  );
}
