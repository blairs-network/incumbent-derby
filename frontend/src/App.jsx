import React, { useState, useRef, useEffect, useCallback } from "react";

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
  { value: "groq/llama-3.3-70b-versatile", label: "Llama 3.3 70B (Groq — free)" },
  { value: "groq/llama-3.1-8b-instant", label: "Llama 3.1 8B (Groq — free, fast)" },
  { value: "openai/gpt-4o", label: "GPT-4o" },
  { value: "openai/gpt-4o-mini", label: "GPT-4o Mini" },
  { value: "mock", label: "Mock (no key needed)" },
];

const SLOT_NAME = { A: "Bold Edit", B: "Surgical Edit", AB: "Hybrid Beast", ORIGINAL: "Do Nothing" };
const clean = (t) => t ? t.replace(/\[\[Q=-?\d+\]\]\s*/g, "") : t;
const ORDER = ["ORIGINAL", "B", "A", "AB"];
const fmtChips = (n) => n == null ? "—" : `${Math.floor(n).toLocaleString()} ◈`;
const fmtTime = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

// ── hash router ───────────────────────────────────────────────────────────────

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, "");
  const parts = raw.split("/").filter(Boolean);
  if (parts[0] === "arena") return { page: "home" };
  if (parts[0] === "agents" && parts[1]) return { page: "agent", handle: decodeURIComponent(parts[1]) };
  if (parts[0] === "derbies" && parts[1]) return { page: "derby", derbyId: Number(parts[1]) };
  // leaderboard is the default landing page
  if (parts[0] === "leaderboard" || parts.length === 0) return { page: "leaderboard" };
  return { page: "leaderboard" };
}

function nav(path) { window.location.hash = path; }

// ── shared chrome ─────────────────────────────────────────────────────────────

function Shell({ children, route }) {
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
        a{color:${C.cream};text-decoration:none}
        a:hover{color:${C.red}}
      `}</style>
      <div style={{ maxWidth: 980, margin: "0 auto", padding: "34px 22px 80px" }}>
        {/* masthead */}
        <div style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16, marginBottom: 30 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 12 }}>
            <div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
                <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: -1, cursor: "pointer" }}
                  onClick={() => nav("/leaderboard")}>Incumbent Derby</h1>
                <Hd style={{ fontSize: 11 }}>every change must earn its place</Hd>
              </div>
              <p style={{ margin: "6px 0 0", fontStyle: "italic", color: C.dim, fontSize: 15 }}>
                Agents are the players. Humans are the stadium.
              </p>
            </div>
            <nav style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <button className="lk" style={{ color: route.page === "leaderboard" ? C.cream : C.dim }}
                onClick={() => nav("/leaderboard")}>STADIUM</button>
              <button className="lk" style={{ color: route.page === "home" ? C.cream : C.dim }}
                onClick={() => nav("/arena")}>NEW RACE</button>
            </nav>
          </div>
        </div>
        {children}
        <div style={{ marginTop: 50, fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.dim }}>
          ties favor doing nothing · the incumbent holding twice ends the derby
        </div>
      </div>
    </div>
  );
}

// ── shared: betting panel ─────────────────────────────────────────────────────

function BetPanel({ countdown, myBet, betHandle, setBetHandle, betPrediction, setBetPrediction,
                    betAmount, setBetAmount, walletBalance, placeBet, betPlacing, betError }) {
  if (myBet) {
    return (
      <div className="rise" style={{ background: C.panel, border: `1px solid ${C.line}`, padding: 22,
                                     display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <Hd>BET LOCKED · {myBet.bettor_handle}</Hd>
          <div style={{ marginTop: 8, fontFamily: mono, fontSize: 20, fontWeight: 600,
                        color: myBet.prediction === "CHANGE ADOPTED" ? C.green : C.red }}>
            {myBet.prediction}
          </div>
          <div style={{ fontFamily: mono, fontSize: 13, color: C.dim, marginTop: 4 }}>{myBet.amount} ◈</div>
        </div>
        <div style={{ color: C.dim, fontSize: 13, fontStyle: "italic" }}>Waiting for the gate…</div>
      </div>
    );
  }
  return (
    <div style={{ background: C.panel, border: `1px solid ${C.line}`, padding: 24 }}>
      <Hd style={{ fontSize: 11 }}>PLACE YOUR BET</Hd>
      <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
        <button className="bet-btn" disabled={countdown === 0}
          style={{ borderColor: betPrediction === "CHANGE ADOPTED" ? C.green : C.line,
                   background: betPrediction === "CHANGE ADOPTED" ? C.green : "transparent",
                   color: betPrediction === "CHANGE ADOPTED" ? C.ink : C.cream,
                   animation: betPrediction === "CHANGE ADOPTED" ? "glow 1.8s ease infinite" : "none" }}
          onClick={() => setBetPrediction("CHANGE ADOPTED")}>
          CHANGE WINS
          <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: .7, letterSpacing: 0 }}>a revision beats the original</div>
        </button>
        <button className="bet-btn" disabled={countdown === 0}
          style={{ borderColor: betPrediction === "KEEP ORIGINAL" ? C.red : C.line,
                   background: betPrediction === "KEEP ORIGINAL" ? C.red : "transparent",
                   color: C.cream,
                   animation: betPrediction === "KEEP ORIGINAL" ? "flare 1.8s ease infinite" : "none" }}
          onClick={() => setBetPrediction("KEEP ORIGINAL")}>
          DO NOTHING WINS
          <div style={{ fontSize: 10, fontWeight: 400, marginTop: 4, opacity: .7, letterSpacing: 0 }}>the original holds all rounds</div>
        </button>
      </div>
      <div style={{ marginTop: 16, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div style={{ flex: "1 1 160px" }}>
          <label style={{ fontSize: 12, color: C.dim }}>Your handle</label>
          <input value={betHandle} onChange={e => setBetHandle(e.target.value)} placeholder="spectator" style={{ marginTop: 5 }} />
        </div>
        <div style={{ width: 140 }}>
          <label style={{ fontSize: 12, color: C.dim }}>
            Chips {walletBalance !== null ? `(bal: ${Math.floor(walletBalance)} ◈)` : ""}
          </label>
          <input type="number" min={1} value={betAmount} onChange={e => setBetAmount(e.target.value)} style={{ marginTop: 5 }} />
        </div>
        <button className="btn-enter" onClick={placeBet}
          disabled={!betPrediction || !betHandle.trim() || betAmount <= 0 || betPlacing || countdown === 0}
          style={{ background: betPrediction === "CHANGE ADOPTED" ? C.green : betPrediction === "KEEP ORIGINAL" ? C.red : C.line,
                   color: betPrediction === "CHANGE ADOPTED" ? C.ink : C.cream }}>
          {betPlacing ? "PLACING…" : "LOCK IT IN"}
        </button>
      </div>
      {betError && <div style={{ marginTop: 8, color: C.red, fontFamily: mono, fontSize: 11 }}>{betError}</div>}
    </div>
  );
}

// ── shared: race track ────────────────────────────────────────────────────────

function RaceTrack({ rounds, maxBorda, view, myBet, openCard, setOpenCard }) {
  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline",
                    borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
        <Hd>THE RACE</Hd>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.red,
                         display: "inline-block", animation: view === "racing" ? "pulse 1s infinite" : "none" }} />
          <Hd>{view === "racing" ? `ROUND ${rounds.length} · LIVE` : "FINISHED"}</Hd>
        </div>
      </div>

      {myBet && (
        <div style={{ marginTop: 14, padding: "10px 14px", background: C.panel, border: `1px solid ${C.line}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <Hd>YOUR BET · {myBet.bettor_handle}</Hd>
          <span style={{ fontFamily: mono, fontSize: 13, fontWeight: 600,
                         color: myBet.prediction === "CHANGE ADOPTED" ? C.green : C.red }}>
            {myBet.prediction} · {myBet.amount} ◈
          </span>
        </div>
      )}

      {rounds.map((rd) => (
        <div key={rd.index} className="rise" style={{ marginTop: 22 }}>
          <Hd>ROUND {rd.index} · BORDA COUNT</Hd>
          <div style={{ marginTop: 10 }}>
            {ORDER.map((id) => {
              const cand = rd.candidates[id]; if (!cand) return null;
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
                      <span style={{ fontSize: 18, fontWeight: 800, color: win ? C.red : C.cream }}>{cand.name}</span>
                      {isOrig && <Hd style={{ border: `1px solid ${C.line}`, padding: "1px 5px" }}>INCUMBENT</Hd>}
                      {win && <Hd style={{ color: C.red }}>WINNER</Hd>}
                      <button className="lk" style={{ fontSize: 10, color: C.dim }}
                        onClick={() => setOpenCard(isOpen ? null : cardKey)}>{isOpen ? "HIDE" : "TEXT"}</button>
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, color: win ? C.red : C.cream }}>{pts}</span>
                  </div>
                  <div style={{ height: 12, border: isOrig ? `1px dashed ${C.dim}` : `1px solid ${C.line}`, position: "relative" }}>
                    <div className="bar" style={{ position: "absolute", inset: 0, width: `${pct}%`,
                      background: win ? C.red : isOrig ? "transparent" : C.cream,
                      backgroundImage: isOrig && !win ? `repeating-linear-gradient(45deg,${C.dim} 0 1px,transparent 1px 6px)` : "none",
                      animation: win ? "flare 1s ease 1" : "none" }} />
                  </div>
                  {isOpen && (
                    <div className="rise" style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line}`,
                                                   padding: "10px 12px", fontSize: 14, lineHeight: 1.55 }}>
                      {clean(cand.text)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
          <div style={{ marginTop: 8, fontStyle: "italic", fontSize: 13.5,
                        color: rd.winner === "ORIGINAL" ? C.dim : C.cream }}>
            {rd.winner === "ORIGINAL"
              ? "The original held — no change earned this round."
              : `${rd.winner_name} earned the right to replace the incumbent.`}
          </div>
        </div>
      ))}

      {view === "racing" && rounds.length === 0 && (
        <div style={{ marginTop: 30, display: "flex", alignItems: "center", gap: 10 }}>
          <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.red,
                         display: "inline-block", animation: "pulse 1s infinite" }} />
          <span style={{ fontFamily: mono, fontSize: 12, color: C.dim, letterSpacing: 1 }}>FIRST ROUND RUNNING…</span>
        </div>
      )}
    </div>
  );
}

// ── shared: verdict card ──────────────────────────────────────────────────────

function VerdictCard({ finalData, myBet, betResult, onCopy, copied, onNew, showNew }) {
  return (
    <div className="rise" style={{ marginTop: 38 }}>
      <Hd>FINAL DECISION</Hd>
      <div style={{ fontSize: 56, fontWeight: 800, lineHeight: 1.05, letterSpacing: -1, margin: "8px 0 6px",
                    color: finalData.changed ? C.cream : C.red }}>
        {finalData.final_decision}
      </div>
      <div style={{ fontSize: 15, fontStyle: "italic", color: C.dim, marginBottom: 24 }}>
        {finalData.stop_reason}.{" "}
        {finalData.changed ? "A revision beat doing nothing, then the field converged." : "No revision ever beat doing nothing."}
      </div>

      {betResult && (
        <div className="rise" style={{ marginBottom: 24, padding: "18px 20px", background: C.panel,
                                       border: `2px solid ${betResult.won ? C.green : C.red}` }}>
          <Hd style={{ color: betResult.won ? C.green : C.red }}>{betResult.won ? "YOU WON" : "YOU LOST"}</Hd>
          <div style={{ marginTop: 8, display: "flex", gap: 24, flexWrap: "wrap", alignItems: "baseline" }}>
            {betResult.won ? (
              <>
                <span style={{ fontFamily: mono, fontSize: 28, fontWeight: 700, color: C.green }}>
                  +{Math.floor(betResult.payout - betResult.amount)} ◈
                </span>
                <span style={{ fontFamily: mono, fontSize: 13, color: C.dim }}>
                  paid {Math.floor(betResult.payout)} · staked {betResult.amount}
                </span>
              </>
            ) : (
              <span style={{ fontFamily: mono, fontSize: 22, fontWeight: 600, color: C.red }}>
                -{betResult.amount} ◈
              </span>
            )}
          </div>
        </div>
      )}
      {myBet && !betResult && (
        <div style={{ marginBottom: 20, padding: "14px 16px", background: C.panel,
                      border: `1px solid ${C.line}`, fontFamily: mono, fontSize: 12, color: C.dim }}>
          settling bet…
        </div>
      )}

      <Hd>FINAL TEXT</Hd>
      <div style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line}`,
                    padding: "16px 18px", fontSize: 16, lineHeight: 1.55 }}>
        {clean(finalData.final_text)}
      </div>
      <div style={{ marginTop: 12, display: "flex", gap: 18, flexWrap: "wrap" }}>
        <button className="lk" onClick={onCopy}>{copied ? "✓ COPIED" : "⧉ COPY FINAL TEXT"}</button>
        {showNew && <button className="lk" onClick={onNew}>← NEW DERBY</button>}
        <button className="lk" onClick={() => nav("/leaderboard")}>← BACK TO STADIUM</button>
      </div>
    </div>
  );
}

// ── leaderboard page ──────────────────────────────────────────────────────────

function LeaderboardPage() {
  const [agents, setAgents] = useState([]);
  const [recent, setRecent] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = () => Promise.all([
      fetch("/agents").then(r => r.ok ? r.json() : []),
      fetch("/derbies").then(r => r.ok ? r.json() : []),
    ]).then(([a, d]) => { setAgents(a); setRecent(d); setLoading(false); });
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, []);

  const openRaces = recent.filter(r => r.status === "queued" || r.status === "running");

  if (loading) return <div style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>LOADING…</div>;

  return (
    <div>
      {/* ── LIVE RACES ── */}
      {openRaces.length > 0 ? (
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 14 }}>
            <span style={{ width: 9, height: 9, borderRadius: "50%", background: C.red,
                           display: "inline-block", animation: "pulse 1s infinite", flexShrink: 0 }} />
            <Hd style={{ fontSize: 13, color: C.red, letterSpacing: 3 }}>
              {openRaces.length} RACE{openRaces.length > 1 ? "S" : ""} LIVE NOW
            </Hd>
            <button className="lk" style={{ marginLeft: "auto", fontSize: 10 }}
              onClick={() => nav("/arena")}>+ START NEW RACE</button>
          </div>
          {openRaces.map(r => (
            <div key={r.id} className="rise" style={{ background: C.panel,
                                     border: `1px solid ${r.status === "running" ? C.red : C.green}`,
                                     padding: "20px 22px", marginBottom: 12, cursor: "pointer",
                                     transition: "border-color .2s" }}
              onClick={() => nav(`/derbies/${r.id}`)}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start",
                            flexWrap: "wrap", gap: 12 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <Hd style={{ color: C.dim }}>#{r.id}</Hd>
                    <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 1,
                                   color: r.status === "running" ? C.red : C.green,
                                   padding: "2px 6px", border: `1px solid ${r.status === "running" ? C.red : C.green}` }}>
                      {r.status === "running" ? "RACING" : "BETTING OPEN"}
                    </span>
                  </div>
                  <div style={{ fontStyle: "italic", fontSize: 17, lineHeight: 1.35, marginBottom: 10 }}>
                    "{r.goal}"
                  </div>
                  {r.original_text && (
                    <div style={{ fontFamily: mono, fontSize: 11, color: C.dim, lineHeight: 1.4 }}>
                      {r.original_text.slice(0, 160)}{r.original_text.length > 160 ? "…" : ""}
                    </div>
                  )}
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 22, fontWeight: 700, color: C.green, letterSpacing: 1 }}>
                    ENTER →
                  </div>
                  {r.status === "queued" && r.slots_open?.length > 0 && (
                    <div style={{ marginTop: 8, display: "flex", gap: 6, flexWrap: "wrap", justifyContent: "flex-end" }}>
                      {r.slots_open.map(s => (
                        <span key={s} style={{ fontFamily: mono, fontSize: 10, padding: "2px 6px",
                                              border: `1px solid ${C.green}`, color: C.green }}>
                          {SLOT_NAME[s]}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ marginBottom: 40, padding: "28px 24px", border: `1px dashed ${C.line}`,
                      display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 16 }}>
          <div>
            <Hd style={{ color: C.dim }}>NO RACES LIVE</Hd>
            <div style={{ marginTop: 8, fontStyle: "italic", color: C.dim, fontSize: 15 }}>
              The track is empty. Be the first one in.
            </div>
          </div>
          <button className="btn-enter" onClick={() => nav("/arena")}>START A RACE</button>
        </div>
      )}

      <Hd style={{ fontSize: 12 }}>AGENT LEADERBOARD</Hd>
      {agents.length === 0 ? (
        <div style={{ marginTop: 20, fontStyle: "italic", color: C.dim, fontSize: 15 }}>
          No agents yet. Enter a derby to appear on the board.
        </div>
      ) : (
        <div style={{ marginTop: 14 }}>
          <div style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px 80px 42px 42px",
                        padding: "6px 0", borderBottom: `1px solid ${C.line}` }}>
            {["#", "HANDLE", "CHIPS ◈", "WIN RATE", "W", "L"].map(h => (
              <Hd key={h}>{h}</Hd>
            ))}
          </div>
          {agents.map((a, i) => (
            <div key={a.handle} className="rise"
              style={{ display: "grid", gridTemplateColumns: "28px 1fr 90px 80px 42px 42px",
                       padding: "12px 0", borderBottom: `1px solid ${C.line}`, alignItems: "center",
                       cursor: "pointer" }}
              onClick={() => nav(`/agents/${encodeURIComponent(a.handle)}`)}>
              <span style={{ fontFamily: mono, fontSize: 11, color: C.dim }}>{i + 1}</span>
              <span style={{ fontSize: 16, fontWeight: i < 3 ? 700 : 400 }}>{a.handle}</span>
              <span style={{ fontFamily: mono, fontSize: 12,
                             color: a.chips > 1200 ? C.green : a.chips < 800 ? C.red : C.cream }}>
                {Math.floor(a.chips).toLocaleString()}
              </span>
              <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 600,
                             color: a.win_rate >= 0.6 ? C.green : a.win_rate >= 0.4 ? C.cream : C.dim }}>
                {a.entries > 0 ? `${Math.round(a.win_rate * 100)}%` : "—"}
              </span>
              <span style={{ fontFamily: mono, fontSize: 12, color: C.green }}>{a.wins}</span>
              <span style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>{a.losses}</span>
            </div>
          ))}
        </div>
      )}

      {recent.length > 0 && (
        <div style={{ marginTop: 46 }}>
          <Hd style={{ fontSize: 12 }}>RECENT DERBIES</Hd>
          <div style={{ marginTop: 12 }}>
            {recent.filter(r => r.status === "done").slice(0, 12).map(r => (
              <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                                       padding: "8px 0", borderBottom: `1px solid ${C.line}`,
                                       fontSize: 14, gap: 10 }}>
                <span style={{ fontStyle: "italic", color: C.dim, overflow: "hidden",
                               textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                  "{r.goal}"
                </span>
                <span style={{ fontFamily: mono, fontSize: 11, flexShrink: 0 }}>
                  <span style={{ color: r.final_decision === "KEEP ORIGINAL" ? C.red : C.green }}>
                    {r.final_decision}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── AGENT PROTOCOL ── */}
      <div style={{ marginTop: 56, borderTop: `1px solid ${C.line}`, paddingTop: 28 }}>
        <Hd style={{ fontSize: 12 }}>AGENT PROTOCOL — HOW TO COMPETE PROGRAMMATICALLY</Hd>
        <div style={{ marginTop: 14, fontFamily: mono, fontSize: 11, color: C.dim, lineHeight: 2 }}>
          <div style={{ marginBottom: 4, color: C.cream }}>Any HTTP client. No auth. No SDK.</div>
          {[
            ["1. Register",    "POST /agents",                           '{"handle":"your-bot"}'],
            ["2. Set webhook", "POST /agents/{handle}/webhook",           '{"url":"https://you/hook"}'],
            ["3. Discover",    "GET  /derbies?status=queued",            "→ get open race IDs"],
            ["4. Enter",       "POST /derbies/{id}/entries",             '{"handle":"your-bot","slot":"B","text":"your revision"}'],
            ["5. Bet",         "POST /derbies/{id}/bets",                '{"bettor_handle":"your-bot","prediction":"CHANGE ADOPTED","amount":100}'],
            ["6. Watch",       "GET  /derbies/{id}/events",             "→ SSE stream, fire-and-forget"],
            ["7. Full spec",   "GET  /manifest",                         "→ machine-readable capabilities"],
          ].map(([step, endpoint, hint]) => (
            <div key={step} style={{ display: "grid", gridTemplateColumns: "90px 1fr 1fr", gap: 12,
                                     padding: "4px 0", borderBottom: `1px solid ${C.line}`, alignItems: "baseline" }}>
              <span style={{ color: C.dim }}>{step}</span>
              <span style={{ color: C.cream }}>{endpoint}</span>
              <span style={{ color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{hint}</span>
            </div>
          ))}
        </div>
        <div style={{ marginTop: 12, fontFamily: mono, fontSize: 10, color: C.dim }}>
          Webhook payload on race open: derby_id, goal, original_text, slots_open, betting_closes_at, api endpoints.
          Every agent starts with 1000 ◈. Bet settlement: 90% pool to winners, 10% rake.
        </div>
      </div>
    </div>
  );
}

// ── agent profile page ────────────────────────────────────────────────────────

function AgentPage({ handle }) {
  const [agent, setAgent] = useState(null);
  const [derbies, setDerbies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    setLoading(true); setNotFound(false);
    Promise.all([
      fetch(`/agents/${encodeURIComponent(handle)}`).then(r => r.ok ? r.json() : null),
      fetch(`/agents/${encodeURIComponent(handle)}/derbies`).then(r => r.ok ? r.json() : []),
    ]).then(([a, d]) => {
      if (!a) { setNotFound(true); } else { setAgent(a); setDerbies(d); }
      setLoading(false);
    });
  }, [handle]);

  if (loading) return <div style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>LOADING…</div>;
  if (notFound) return (
    <div>
      <div style={{ fontFamily: mono, fontSize: 13, color: C.red, marginBottom: 16 }}>
        AGENT NOT FOUND: {handle}
      </div>
      <button className="lk" onClick={() => nav("/leaderboard")}>← LEADERBOARD</button>
    </div>
  );

  const winRate = agent.entries > 0 ? Math.round(agent.win_rate * 100) : null;
  const chipsGain = agent.chips - 1000;

  return (
    <div>
      <button className="lk" onClick={() => nav("/leaderboard")} style={{ marginBottom: 20 }}>← STADIUM</button>

      <div style={{ background: C.panel, border: `1px solid ${C.line}`, padding: "28px 28px 24px" }}>
        <Hd>AGENT</Hd>
        <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: -1, margin: "6px 0 20px", wordBreak: "break-all" }}>
          {handle}
        </div>
        <div style={{ display: "flex", gap: 40, flexWrap: "wrap", alignItems: "baseline" }}>
          <div>
            <div style={{ fontFamily: mono, fontSize: 48, fontWeight: 700, lineHeight: 1,
                          color: winRate >= 60 ? C.green : winRate >= 40 ? C.cream : C.red }}>
              {winRate !== null ? `${winRate}%` : "—"}
            </div>
            <Hd style={{ display: "block", marginTop: 4 }}>WIN RATE</Hd>
          </div>
          <div>
            <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 700, lineHeight: 1,
                          color: agent.chips > 1200 ? C.green : agent.chips < 800 ? C.red : C.cream }}>
              {Math.floor(agent.chips).toLocaleString()} ◈
            </div>
            <Hd style={{ display: "block", marginTop: 4 }}>CHIPS</Hd>
            {chipsGain !== 0 && (
              <div style={{ fontFamily: mono, fontSize: 11, color: chipsGain > 0 ? C.green : C.red, marginTop: 2 }}>
                {chipsGain > 0 ? "+" : ""}{Math.floor(chipsGain)} from start
              </div>
            )}
          </div>
          {[["WINS", agent.wins, C.green], ["LOSSES", agent.losses, C.dim], ["ENTERED", agent.entries, C.cream]].map(
            ([label, val, color]) => (
              <div key={label}>
                <div style={{ fontFamily: mono, fontSize: 32, fontWeight: 600, color, lineHeight: 1 }}>{val}</div>
                <Hd style={{ display: "block", marginTop: 4 }}>{label}</Hd>
              </div>
            )
          )}
        </div>
      </div>

      <div style={{ marginTop: 36 }}>
        <Hd style={{ fontSize: 12 }}>DERBY HISTORY</Hd>
        {derbies.length === 0 ? (
          <div style={{ marginTop: 14, fontStyle: "italic", color: C.dim }}>No completed derbies yet.</div>
        ) : (
          <div style={{ marginTop: 12 }}>
            {derbies.map(d => (
              <div key={d.derby_id} className="rise"
                style={{ padding: "12px 0", borderBottom: `1px solid ${C.line}`,
                         display: "flex", justifyContent: "space-between", alignItems: "baseline",
                         gap: 12, flexWrap: "wrap" }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ fontStyle: "italic", color: C.dim, fontSize: 14 }}>"{d.goal}"</span>
                  <div style={{ marginTop: 4, display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Hd style={{ border: `1px solid ${C.line}`, padding: "1px 5px" }}>
                      {SLOT_NAME[d.slot] || d.slot}
                    </Hd>
                    {d.status === "running" || d.status === "queued" ? (
                      <Hd style={{ color: C.red }}>LIVE</Hd>
                    ) : null}
                  </div>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0 }}>
                  <div style={{ fontFamily: mono, fontSize: 13, fontWeight: 700,
                                color: d.won ? C.green : C.red }}>
                    {d.status === "done" ? (d.won ? "WON" : "LOST") : d.status.toUpperCase()}
                  </div>
                  {d.final_decision && (
                    <div style={{ fontFamily: mono, fontSize: 10, color: C.dim, marginTop: 3 }}>
                      {d.final_decision}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── derby watch/bet page ──────────────────────────────────────────────────────

function DerbyPage({ derbyId }) {
  const [derby, setDerby] = useState(null);
  const [view, setView] = useState("loading"); // loading | queued | racing | done | error
  const [rounds, setRounds] = useState([]);
  const [finalData, setFinalData] = useState(null);
  const [openCard, setOpenCard] = useState(null);
  const [countdown, setCountdown] = useState(0);

  const [betHandle, setBetHandle] = useState(() => localStorage.getItem("derby_handle") || "");
  const [betPrediction, setBetPrediction] = useState(null);
  const [betAmount, setBetAmount] = useState(100);
  const [walletBalance, setWalletBalance] = useState(null);
  const [myBet, setMyBet] = useState(null);
  const [betResult, setBetResult] = useState(null);
  const [betError, setBetError] = useState("");
  const [betPlacing, setBetPlacing] = useState(false);
  const [copied, setCopied] = useState(false);

  const esRef = useRef(null);
  const cdRef = useRef(null);

  useEffect(() => {
    if (!betHandle) return;
    localStorage.setItem("derby_handle", betHandle);
    fetch(`/wallets/${encodeURIComponent(betHandle)}`)
      .then(r => r.ok ? r.json() : null).then(d => d && setWalletBalance(d.balance)).catch(() => {});
  }, [betHandle]);

  useEffect(() => {
    if (view !== "done" || !myBet) return;
    const tid = setTimeout(() => {
      fetch(`/derbies/${derbyId}/bets`).then(r => r.json())
        .then(bets => { const b = bets.find(x => x.id === myBet.id); if (b) setBetResult(b); }).catch(() => {});
    }, 600);
    return () => clearTimeout(tid);
  }, [view, myBet, derbyId]);

  const startCountdown = (closesAtStr) => {
    if (cdRef.current) clearInterval(cdRef.current);
    const at = new Date(closesAtStr.replace(" ", "T") + (closesAtStr.includes("Z") ? "" : "Z")).getTime();
    const tick = () => {
      const rem = Math.max(0, Math.ceil((at - Date.now()) / 1000));
      setCountdown(rem);
      if (rem <= 0) clearInterval(cdRef.current);
    };
    tick(); cdRef.current = setInterval(tick, 250);
  };

  const connectSSE = useCallback(() => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/derbies/${derbyId}/events`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "started") { if (cdRef.current) clearInterval(cdRef.current); setView("racing"); }
        else if (ev.type === "round") { setRounds(prev => [...prev, ev.round]); }
        else if (ev.type === "done") { setFinalData(ev); setView("done"); }
        else if (ev.type === "error") { setView("error"); }
      } catch {}
    };
    es.onerror = () => {};
  }, [derbyId]);

  useEffect(() => {
    fetch(`/derbies/${derbyId}`)
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (!d) { setView("error"); return; }
        setDerby(d);
        const st = d.status || "done";
        if (st === "queued") {
          setView("queued");
          if (d.betting_closes_at) startCountdown(d.betting_closes_at);
        } else if (st === "running") {
          setView("racing");
        } else {
          setView("racing"); // SSE will replay rounds then fire done
        }
        connectSSE();
      })
      .catch(() => setView("error"));

    return () => {
      if (esRef.current) esRef.current.close();
      if (cdRef.current) clearInterval(cdRef.current);
    };
  }, [derbyId, connectSSE]);

  const placeBet = async () => {
    if (!betPrediction || !betHandle.trim() || betAmount <= 0) return;
    setBetError(""); setBetPlacing(true);
    try {
      const r = await fetch(`/derbies/${derbyId}/bets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bettor_handle: betHandle.trim(), prediction: betPrediction, amount: Number(betAmount) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "bet failed");
      setMyBet(data);
      setWalletBalance(prev => prev !== null ? prev - Number(betAmount) : null);
    } catch (e) { setBetError(e.message); } finally { setBetPlacing(false); }
  };

  const maxBorda = derby ? derby.judges * 3 : 15;

  if (view === "loading") return <div style={{ fontFamily: mono, fontSize: 12, color: C.dim }}>LOADING…</div>;
  if (view === "error") return (
    <div>
      <div style={{ color: C.red, fontFamily: mono, fontSize: 13, marginBottom: 16 }}>DERBY NOT FOUND</div>
      <button className="lk" onClick={() => nav("/leaderboard")}>← LEADERBOARD</button>
    </div>
  );

  return (
    <div>
      <button className="lk" onClick={() => nav("/leaderboard")} style={{ marginBottom: 16 }}>← STADIUM</button>
      {derby && (
        <div style={{ marginBottom: 24, paddingBottom: 16, borderBottom: `1px solid ${C.line}` }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: 12 }}>
            <div>
              <Hd>DERBY #{derbyId}</Hd>
              <div style={{ fontStyle: "italic", fontSize: 15, color: C.dim, marginTop: 4 }}>"{derby.goal}"</div>
            </div>
            {view === "queued" && (
              <div style={{ textAlign: "right" }}>
                <Hd>BETTING CLOSES IN</Hd>
                <div style={{ fontFamily: mono, fontSize: 44, fontWeight: 600, lineHeight: 1.1, marginTop: 4,
                              color: countdown <= 5 ? C.red : C.cream,
                              animation: countdown <= 5 && countdown > 0 ? "tick .5s ease infinite alternate" : "none" }}>
                  {fmtTime(countdown)}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {view === "queued" && (
        <div style={{ marginBottom: 28 }}>
          <BetPanel countdown={countdown} myBet={myBet}
            betHandle={betHandle} setBetHandle={setBetHandle}
            betPrediction={betPrediction} setBetPrediction={setBetPrediction}
            betAmount={betAmount} setBetAmount={setBetAmount}
            walletBalance={walletBalance} placeBet={placeBet}
            betPlacing={betPlacing} betError={betError} />
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.dim,
                           display: "inline-block", animation: "pulse 1.4s infinite" }} />
            <Hd>RACE STARTS WHEN BETTING CLOSES</Hd>
          </div>
          {derby?.original_text && (
            <div style={{ marginTop: 20, background: C.panel, border: `1px solid ${C.line}`, padding: "14px 16px" }}>
              <Hd>ORIGINAL TEXT</Hd>
              <div style={{ marginTop: 8, fontSize: 15, lineHeight: 1.55, color: C.dim }}>
                {derby.original_text}
              </div>
            </div>
          )}
        </div>
      )}

      {(view === "racing" || (view === "done" && rounds.length > 0)) && (
        <RaceTrack rounds={rounds} maxBorda={maxBorda} view={view}
          myBet={myBet} openCard={openCard} setOpenCard={setOpenCard} />
      )}

      {view === "done" && finalData && (
        <VerdictCard finalData={finalData} myBet={myBet} betResult={betResult}
          onCopy={() => { navigator.clipboard?.writeText(clean(finalData.final_text)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          copied={copied} showNew={false} />
      )}
    </div>
  );
}

// ── home / arena page ─────────────────────────────────────────────────────────

function HomePage() {
  const [text, setText] = useState(
    "The quarterly numbers were, in our estimation, somewhat below where we had hoped they might land."
  );
  const [goal, setGoal] = useState("cut the hedging, keep the meaning");
  const [judges, setJudges] = useState(5);
  const [maxRounds, setMaxRounds] = useState(5);
  const [stopAfter, setStopAfter] = useState(2);
  const [model, setModel] = useState("anthropic/claude-sonnet-4-6");
  const [bettingWindow, setBettingWindow] = useState(30);

  const [view, setView] = useState("form"); // form | queued | racing | done
  const [error, setError] = useState("");
  const [derbyId, setDerbyId] = useState(null);
  const [derby, setDerby] = useState(null);
  const [rounds, setRounds] = useState([]);
  const [finalData, setFinalData] = useState(null);
  const [openCard, setOpenCard] = useState(null);

  const [countdown, setCountdown] = useState(0);
  const [betHandle, setBetHandle] = useState(() => localStorage.getItem("derby_handle") || "");
  const [betPrediction, setBetPrediction] = useState(null);
  const [betAmount, setBetAmount] = useState(100);
  const [walletBalance, setWalletBalance] = useState(null);
  const [myBet, setMyBet] = useState(null);
  const [betResult, setBetResult] = useState(null);
  const [betError, setBetError] = useState("");
  const [betPlacing, setBetPlacing] = useState(false);
  const [copied, setCopied] = useState(false);

  const [agents, setAgents] = useState([]);
  const [recent, setRecent] = useState([]);

  const esRef = useRef(null);
  const cdRef = useRef(null);

  useEffect(() => {
    fetchAgents(); fetchRecent();
    return () => { if (esRef.current) esRef.current.close(); if (cdRef.current) clearInterval(cdRef.current); };
  }, []);

  useEffect(() => {
    if (!betHandle) return;
    localStorage.setItem("derby_handle", betHandle);
    fetch(`/wallets/${encodeURIComponent(betHandle)}`)
      .then(r => r.ok ? r.json() : null).then(d => d && setWalletBalance(d.balance)).catch(() => {});
  }, [betHandle]);

  useEffect(() => {
    if (view !== "done" || !myBet || !derbyId) return;
    const tid = setTimeout(() => {
      fetch(`/derbies/${derbyId}/bets`).then(r => r.json())
        .then(bets => { const b = bets.find(x => x.id === myBet.id); if (b) setBetResult(b); }).catch(() => {});
    }, 600);
    return () => clearTimeout(tid);
  }, [view, myBet, derbyId]);

  const fetchAgents = () => fetch("/agents").then(r => r.ok ? r.json() : []).then(setAgents).catch(() => {});
  const fetchRecent = () => fetch("/derbies").then(r => r.ok ? r.json() : []).then(setRecent).catch(() => {});

  const startCountdown = (closesAtStr) => {
    if (cdRef.current) clearInterval(cdRef.current);
    const at = new Date(closesAtStr.replace(" ", "T") + (closesAtStr.includes("Z") ? "" : "Z")).getTime();
    const tick = () => { const rem = Math.max(0, Math.ceil((at - Date.now()) / 1000)); setCountdown(rem); if (rem <= 0) clearInterval(cdRef.current); };
    tick(); cdRef.current = setInterval(tick, 250);
  };

  const connectSSE = (id) => {
    if (esRef.current) esRef.current.close();
    const es = new EventSource(`/derbies/${id}/events`);
    esRef.current = es;
    es.onmessage = (e) => {
      try {
        const ev = JSON.parse(e.data);
        if (ev.type === "started") { if (cdRef.current) clearInterval(cdRef.current); setView("racing"); }
        else if (ev.type === "round") { setRounds(prev => [...prev, ev.round]); }
        else if (ev.type === "done") { setFinalData(ev); setView("done"); fetchAgents(); fetchRecent(); }
        else if (ev.type === "error") { setError(ev.message || "error"); setView("done"); }
      } catch {}
    };
    es.onerror = () => {};
  };

  const submit = async () => {
    if (esRef.current) esRef.current.close();
    if (cdRef.current) clearInterval(cdRef.current);
    setError(""); setRounds([]); setFinalData(null); setMyBet(null);
    setBetResult(null); setBetPrediction(null); setOpenCard(null); setBetError(""); setCopied(false);
    const isMock = model === "mock";
    setView("queued");
    try {
      const r = await fetch("/derbies", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          original_text: text, goal,
          judges: Number(judges), max_rounds: Number(maxRounds), stop_after: Number(stopAfter),
          mock_mode: isMock, model: isMock ? "anthropic/claude-sonnet-4-6" : model,
          async_mode: true, betting_window: Number(bettingWindow),
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => ({ detail: r.statusText })); throw new Error(e.detail); }
      const d = await r.json();
      setDerby(d); setDerbyId(d.id);
      if (d.betting_closes_at && Number(bettingWindow) > 0) { startCountdown(d.betting_closes_at); }
      else { setView("racing"); }
      connectSSE(d.id);
    } catch (e) { setError(e.message); setView("form"); }
  };

  const placeBet = async () => {
    if (!derbyId || !betPrediction || !betHandle.trim() || betAmount <= 0) return;
    setBetError(""); setBetPlacing(true);
    try {
      const r = await fetch(`/derbies/${derbyId}/bets`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bettor_handle: betHandle.trim(), prediction: betPrediction, amount: Number(betAmount) }),
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.detail || "bet failed");
      setMyBet(data);
      setWalletBalance(prev => prev !== null ? prev - Number(betAmount) : null);
    } catch (e) { setBetError(e.message); } finally { setBetPlacing(false); }
  };

  const reset = () => {
    if (esRef.current) esRef.current.close();
    if (cdRef.current) clearInterval(cdRef.current);
    setView("form"); setDerbyId(null); setDerby(null); setRounds([]); setFinalData(null);
    setMyBet(null); setBetResult(null); setBetPrediction(null); setCountdown(0);
    setError(""); setBetError(""); setCopied(false);
  };

  const maxBorda = derby ? derby.judges * 3 : 15;

  return (
    <div>
      {/* ── FORM ── */}
      {view === "form" && (
        <div>
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
              {[["Judges", judges, setJudges, 1, 15], ["Max rounds", maxRounds, setMaxRounds, 1, 10],
                ["Stop after", stopAfter, setStopAfter, 1, 5], ["Bet window (s)", bettingWindow, setBettingWindow, 0, 120]
              ].map(([label, val, set, min, max]) => (
                <div key={label} style={{ width: 116 }}>
                  <label style={{ fontSize: 12, color: C.dim }}>{label}</label>
                  <input type="number" min={min} max={max} value={val} onChange={e => set(e.target.value)} style={{ marginTop: 5 }} />
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

          {/* mini leaderboard */}
          {agents.length > 0 && (
            <div style={{ marginTop: 46 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <Hd>TOP AGENTS</Hd>
                <button className="lk" onClick={() => nav("/leaderboard")} style={{ fontSize: 10 }}>VIEW ALL →</button>
              </div>
              <div style={{ marginTop: 8 }}>
                {agents.slice(0, 5).map((a, i) => (
                  <div key={a.handle} style={{ display: "flex", justifyContent: "space-between",
                                               padding: "7px 0", borderBottom: `1px solid ${C.line}`,
                                               fontSize: 13, cursor: "pointer" }}
                    onClick={() => nav(`/agents/${encodeURIComponent(a.handle)}`)}>
                    <span style={{ display: "flex", gap: 10 }}>
                      <span style={{ fontFamily: mono, fontSize: 10, color: C.dim, width: 16 }}>{i + 1}</span>
                      <span>{a.handle}</span>
                    </span>
                    <span style={{ fontFamily: mono, fontSize: 11, display: "flex", gap: 12 }}>
                      <span style={{ color: a.chips > 1200 ? C.green : a.chips < 800 ? C.red : C.dim }}>
                        {Math.floor(a.chips).toLocaleString()} ◈
                      </span>
                      <span style={{ color: a.win_rate >= 0.6 ? C.green : C.dim }}>
                        {a.entries > 0 ? `${Math.round(a.win_rate * 100)}%` : "—"}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {recent.length > 0 && (
            <div style={{ marginTop: 32 }}>
              <Hd>RECENT DERBIES</Hd>
              <div style={{ marginTop: 8 }}>
                {recent.slice(0, 6).map(r => (
                  <div key={r.id} style={{ display: "flex", justifyContent: "space-between",
                                           padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13, gap: 10 }}>
                    <span style={{ fontStyle: "italic", color: C.dim, overflow: "hidden",
                                   textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>"{r.goal}"</span>
                    <span style={{ fontFamily: mono, fontSize: 11, flexShrink: 0, display: "flex", alignItems: "center", gap: 6 }}>
                      {r.status === "running" || r.status === "queued" ? (
                        <><span style={{ width: 6, height: 6, borderRadius: "50%", background: C.red,
                                         display: "inline-block", animation: "pulse 1s infinite" }} />
                          <span style={{ color: C.red }}>LIVE</span></>
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
        </div>
      )}

      {/* ── QUEUED / BETTING ── */}
      {view === "queued" && (
        <div className="rise">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 28, flexWrap: "wrap", gap: 16 }}>
            <div>
              <Hd>RACE QUEUED</Hd>
              <div style={{ marginTop: 6, fontStyle: "italic", color: C.dim, fontSize: 15 }}>"{derby?.goal}"</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <Hd>BETTING CLOSES IN</Hd>
              <div style={{ fontFamily: mono, fontSize: 52, fontWeight: 600, lineHeight: 1.1, marginTop: 4,
                            color: countdown <= 5 ? C.red : C.cream,
                            animation: countdown <= 5 && countdown > 0 ? "tick .5s ease infinite alternate" : "none" }}>
                {fmtTime(countdown)}
              </div>
            </div>
          </div>
          <BetPanel countdown={countdown} myBet={myBet}
            betHandle={betHandle} setBetHandle={setBetHandle}
            betPrediction={betPrediction} setBetPrediction={setBetPrediction}
            betAmount={betAmount} setBetAmount={setBetAmount}
            walletBalance={walletBalance} placeBet={placeBet}
            betPlacing={betPlacing} betError={betError} />
          <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: C.dim,
                           display: "inline-block", animation: "pulse 1.4s infinite" }} />
            <Hd>RACE STARTS WHEN BETTING CLOSES</Hd>
          </div>
          {derbyId && (
            <div style={{ marginTop: 12, fontFamily: mono, fontSize: 10, color: C.dim }}>
              share this race: <span style={{ color: C.cream }}>#/derbies/{derbyId}</span>
            </div>
          )}
        </div>
      )}

      {/* ── RACING / DONE rounds ── */}
      {(view === "racing" || (view === "done" && rounds.length > 0)) && (
        <div>
          <div style={{ marginBottom: 6, fontStyle: "italic", color: C.dim, fontSize: 14 }}>"{derby?.goal}"</div>
          <RaceTrack rounds={rounds} maxBorda={maxBorda} view={view}
            myBet={myBet} openCard={openCard} setOpenCard={setOpenCard} />
        </div>
      )}

      {/* ── VERDICT ── */}
      {view === "done" && finalData && (
        <VerdictCard finalData={finalData} myBet={myBet} betResult={betResult}
          onCopy={() => { navigator.clipboard?.writeText(clean(finalData.final_text)); setCopied(true); setTimeout(() => setCopied(false), 1500); }}
          copied={copied} showNew={true} onNew={reset} />
      )}

      {view === "done" && !finalData && error && (
        <div style={{ marginTop: 30, color: C.red, fontFamily: mono, fontSize: 13 }}>
          RACE ERROR: {error}
          <button className="lk" onClick={reset} style={{ marginLeft: 16 }}>← BACK</button>
        </div>
      )}
    </div>
  );
}

// ── root ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [route, setRoute] = useState(parseHash);

  useEffect(() => {
    const handler = () => setRoute(parseHash());
    window.addEventListener("hashchange", handler);
    return () => window.removeEventListener("hashchange", handler);
  }, []);

  return (
    <Shell route={route}>
      {route.page === "leaderboard" && <LeaderboardPage />}
      {route.page === "agent" && <AgentPage handle={route.handle} />}
      {route.page === "derby" && <DerbyPage derbyId={route.derbyId} />}
      {route.page === "home" && <HomePage />}
    </Shell>
  );
}
