import React, { useState, useRef, useEffect, useCallback } from "react";

// ── racing constants ──
const ORDER = ["ORIGINAL", "B", "A", "AB"]; // tie-break order: least change first
const C = {
  ink: "#0E0E0E", panel: "#141414", cream: "#F2ECE1",
  red: "#C02020", dim: "#857F74", line: "#26241F", green: "#9FB87A",
};
const mono = "'IBM Plex Mono', ui-monospace, monospace";
const serif = "'Source Serif 4', Georgia, serif";

const Hd = ({ children, style }) => (
  <span style={{ fontFamily: mono, fontSize: 10, letterSpacing: 2, color: C.dim, ...style }}>{children}</span>
);

async function postDerby(payload) {
  const res = await fetch("/derbies", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || "derby failed");
  }
  return res.json();
}
async function listDerbies() {
  const res = await fetch("/derbies");
  return res.ok ? res.json() : [];
}

export default function App() {
  const [text, setText] = useState(
    "The quarterly numbers were, in our estimation, somewhat below where we had hoped they might land."
  );
  const [goal, setGoal] = useState("cut the hedging, keep the meaning");
  const [judges, setJudges] = useState(5);
  const [maxRounds, setMaxRounds] = useState(5);
  const [stopAfter, setStopAfter] = useState(2);
  const [mock, setMock] = useState(true);

  const [status, setStatus] = useState("idle"); // idle · running · racing · done
  const [error, setError] = useState("");
  const [derby, setDerby] = useState(null);
  const [shown, setShown] = useState(0);
  const [openCard, setOpenCard] = useState(null); // "roundIndex:candidateId"
  const [recent, setRecent] = useState([]);
  const [copied, setCopied] = useState(false);
  const timers = useRef([]);

  const clearTimers = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => () => clearTimers(), []);

  const refreshRecent = useCallback(() => { listDerbies().then(setRecent).catch(() => {}); }, []);
  useEffect(() => { refreshRecent(); }, [refreshRecent]);

  const reveal = useCallback((rounds) => {
    setShown(0); setStatus("racing");
    rounds.forEach((_, i) => {
      timers.current.push(setTimeout(() => {
        setShown(i + 1);
        if (i + 1 === rounds.length) setStatus("done");
      }, 1100 * (i + 1)));
    });
  }, []);

  const enter = async () => {
    clearTimers();
    setError(""); setDerby(null); setShown(0); setCopied(false); setOpenCard(null);
    setStatus("running");
    try {
      const d = await postDerby({
        original_text: text, goal,
        judges: Number(judges), max_rounds: Number(maxRounds),
        stop_after: Number(stopAfter), mock_mode: mock,
      });
      setDerby(d);
      reveal(d.report.rounds);
      refreshRecent();
    } catch (e) {
      setError(e.message); setStatus("idle");
    }
  };

  const copyFinal = () => {
    if (!derby) return;
    navigator.clipboard?.writeText(derby.final_text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const maxBorda = derby ? derby.judges * 3 : 15;
  const rounds = derby ? derby.report.rounds.slice(0, shown) : [];

  return (
    <div style={{ minHeight: "100vh", background: C.ink, color: C.cream, fontFamily: serif }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,opsz,wght@0,8..60,300;0,8..60,400;0,8..60,600;0,8..60,800;1,8..60,400&family=IBM+Plex+Mono:wght@400;500;600&display=swap');
        * { box-sizing: border-box; }
        body { margin: 0; background: #0E0E0E; }
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.25}}
        @keyframes flare{0%{box-shadow:0 0 0 0 rgba(192,32,32,.6)}100%{box-shadow:0 0 0 12px rgba(192,32,32,0)}}
        @keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
        .bar{transition:width .7s cubic-bezier(.4,0,.1,1)}
        .rise{animation:rise .3s ease both}
        textarea,input,select{font-family:${serif};background:${C.panel};color:${C.cream};border:1px solid ${C.line};padding:10px 12px;font-size:15px;width:100%}
        textarea:focus,input:focus{outline:none;border-color:${C.dim}}
        .enter{font-family:${mono};letter-spacing:2px;font-size:13px;background:${C.red};color:${C.cream};border:0;padding:13px 26px;cursor:pointer;font-weight:600}
        .enter:disabled{background:${C.line};color:${C.dim};cursor:default}
        .lk{font-family:${mono};font-size:11px;letter-spacing:1px;color:${C.cream};background:none;border:0;cursor:pointer;padding:0}
        .lk:hover{color:${C.red}}
      `}</style>

      <div style={{ maxWidth: 980, margin: "0 auto", padding: "34px 22px 80px" }}>
        {/* masthead */}
        <div style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
            <h1 style={{ margin: 0, fontSize: 38, fontWeight: 800, letterSpacing: -1 }}>Incumbent Derby</h1>
            <Hd style={{ fontSize: 11 }}>v0.2 · {mock ? "MOCK" : "LIVE"}</Hd>
          </div>
          <p style={{ margin: "8px 0 0", fontStyle: "italic", color: C.dim, fontSize: 16 }}>
            A market where every change must defeat doing nothing.
          </p>
        </div>

        {/* entry */}
        <div style={{ marginTop: 26 }}>
          <Hd>THE FIELD ENTRY</Hd>
          <div style={{ marginTop: 10, display: "grid", gap: 12 }}>
            <div>
              <label style={{ fontSize: 13, color: C.dim }}>Original text — the incumbent</label>
              <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} style={{ marginTop: 5 }} />
            </div>
            <div>
              <label style={{ fontSize: 13, color: C.dim }}>Revision goal</label>
              <input value={goal} onChange={(e) => setGoal(e.target.value)} style={{ marginTop: 5 }} />
            </div>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", alignItems: "flex-end" }}>
              {[["Judges", judges, setJudges, 1, 15], ["Max rounds", maxRounds, setMaxRounds, 1, 10], ["Stop after", stopAfter, setStopAfter, 1, 5]].map(
                ([label, val, set, min, max]) => (
                  <div key={label} style={{ width: 110 }}>
                    <label style={{ fontSize: 13, color: C.dim }}>{label}</label>
                    <input type="number" min={min} max={max} value={val} onChange={(e) => set(e.target.value)} style={{ marginTop: 5 }} />
                  </div>
                )
              )}
              <label style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 13, color: C.dim, paddingBottom: 10 }}>
                <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} style={{ width: "auto" }} />
                mock mode (no API key)
              </label>
              <span style={{ flex: 1 }} />
              <button className="enter" onClick={enter}
                disabled={status === "running" || status === "racing" || !text.trim() || !goal.trim()}>
                {status === "running" ? "RUNNING…" : "ENTER THE DERBY"}
              </button>
            </div>
            {error && <div style={{ color: C.red, fontFamily: mono, fontSize: 12 }}>error: {error}</div>}
          </div>
        </div>

        {/* race */}
        {derby && (
          <div style={{ marginTop: 34 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderBottom: `1px solid ${C.line}`, paddingBottom: 10 }}>
              <Hd>THE RACE · GOAL “{derby.goal}”</Hd>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 7, height: 7, borderRadius: "50%", background: C.red, display: "inline-block", animation: status === "racing" ? "pulse 1.1s infinite" : "none" }} />
                <Hd>{status === "racing" ? `ROUND ${shown}/${derby.report.rounds.length}` : "FINISHED"}</Hd>
              </div>
            </div>

            {rounds.map((rd) => {
              const incumbentWon = rd.winner === "ORIGINAL";
              return (
                <div key={rd.index} className="rise" style={{ marginTop: 20 }}>
                  <Hd>ROUND {rd.index} · BORDA SCOREBOARD</Hd>
                  <div style={{ marginTop: 10 }}>
                    {ORDER.map((id) => {
                      const cand = rd.candidates[id];
                      const v = rd.points[id];
                      const win = rd.winner === id;
                      const pct = (v / maxBorda) * 100;
                      const isOrig = id === "ORIGINAL";
                      const cardKey = `${rd.index}:${id}`;
                      const isOpen = openCard === cardKey;
                      return (
                        <div key={id} style={{ padding: "9px 0", borderBottom: `1px solid ${C.line}` }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                            <span style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                              <span style={{ fontSize: 18, fontWeight: 800, color: win ? C.red : C.cream }}>{cand.name}</span>
                              {isOrig && <Hd style={{ border: `1px solid ${C.line}`, padding: "1px 5px" }}>THE INCUMBENT</Hd>}
                              <button className="lk" style={{ fontSize: 10, color: C.dim }} onClick={() => setOpenCard(isOpen ? null : cardKey)}>
                                {isOpen ? "HIDE" : "TEXT"}
                              </button>
                            </span>
                            <span style={{ fontFamily: mono, fontSize: 16, fontWeight: 600, color: win ? C.red : C.cream }}>{v}</span>
                          </div>
                          <div style={{ height: 12, border: isOrig ? `1px dashed ${C.dim}` : `1px solid ${C.line}`, position: "relative" }}>
                            <div className="bar" style={{
                              position: "absolute", inset: 0, width: `${pct}%`,
                              background: win ? C.red : (isOrig ? "transparent" : C.cream),
                              backgroundImage: isOrig && !win ? `repeating-linear-gradient(45deg,${C.dim} 0 1px,transparent 1px 6px)` : "none",
                              animation: win ? "flare 1s ease 1" : "none",
                            }} />
                          </div>
                          {isOpen && (
                            <div className="rise" style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line}`, padding: "10px 12px", fontSize: 14, lineHeight: 1.5, color: C.cream }}>
                              {cand.text}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ marginTop: 9, fontFamily: serif, fontStyle: "italic", fontSize: 13.5, color: incumbentWon ? C.dim : C.cream }}>
                    {incumbentWon
                      ? "The original held — no change earned this round."
                      : `${rd.winner_name} earned the right to replace the incumbent.`}
                  </div>
                </div>
              );
            })}

            {/* verdict */}
            {status === "done" && (
              <div className="rise" style={{ marginTop: 38 }}>
                <Hd>FINAL DECISION</Hd>
                <div style={{ fontSize: 64, fontWeight: 800, lineHeight: 1.0, letterSpacing: -1, margin: "8px 0 6px", color: derby.report.changed ? C.cream : C.red }}>
                  {derby.final_decision}
                </div>
                <div style={{ fontSize: 15, fontStyle: "italic", color: C.dim, marginBottom: 22 }}>
                  {derby.report.stop_reason}.{" "}
                  {derby.report.changed
                    ? "A revision beat doing nothing, then the field converged."
                    : "No revision ever beat doing nothing."}
                </div>

                <Hd>FINAL TEXT</Hd>
                <div style={{ marginTop: 8, background: C.panel, border: `1px solid ${C.line}`, padding: "16px 18px", fontSize: 16, lineHeight: 1.5 }}>
                  {derby.final_text}
                </div>
                <div style={{ marginTop: 10 }}>
                  <button className="lk" onClick={copyFinal}>{copied ? "✓ COPIED" : "⧉ COPY FINAL TEXT"}</button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* recent */}
        {recent.length > 0 && (
          <div style={{ marginTop: 46, borderTop: `1px solid ${C.line}`, paddingTop: 16 }}>
            <Hd>RECENT DERBIES</Hd>
            <div style={{ marginTop: 8 }}>
              {recent.map((r) => (
                <div key={r.id} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${C.line}`, fontSize: 13 }}>
                  <span style={{ fontStyle: "italic", color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>“{r.goal}”</span>
                  <span style={{ fontFamily: mono, fontSize: 11, color: r.final_decision === "KEEP ORIGINAL" ? C.red : C.green }}>{r.final_decision}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ marginTop: 40, fontFamily: mono, fontSize: 10, letterSpacing: 1, color: C.dim }}>
          ties favor doing nothing · the incumbent holding twice ends the derby
        </div>
      </div>
    </div>
  );
}
