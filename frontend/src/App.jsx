import { useState, useRef, useCallback } from "react";
import { RadarChart, Radar, PolarGrid, PolarAngleAxis, ResponsiveContainer } from "recharts";

/* ─── 설정 ────────────────────────────────────────────────────────────────── */
const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:8000";

/* ─── 에이전트 메타 ──────────────────────────────────────────────────────── */
const AGENT_META = {
  data:        { icon: "📊", label: "데이터 수집",    color: "#60a5fa" },
  fundamental: { icon: "🏦", label: "펀더멘털",       color: "#34d399" },
  valuation:   { icon: "📐", label: "밸류에이션",     color: "#2dd4bf" },
  sentiment:   { icon: "📰", label: "뉴스 감성",      color: "#fbbf24" },
  technical:   { icon: "📈", label: "기술 분석",      color: "#a78bfa" },
  peer:        { icon: "🔍", label: "피어 비교",      color: "#fb923c" },
  bull:        { icon: "🐂", label: "Bull 리서처",    color: "#4ade80" },
  bear:        { icon: "🐻", label: "Bear 리서처",    color: "#f87171" },
  risk:        { icon: "🛡️", label: "리스크 매니저", color: "#fbbf24" },
  final:       { icon: "🎯", label: "최종 결정",      color: "#c084fc" },
};

const AGENT_ORDER = ["data", "fundamental", "valuation", "sentiment", "technical", "peer", "bull", "bear", "risk", "final"];

const REC_STYLE = {
  BUY:  { bg: "#071a0f", border: "#1a6b3c", text: "#4ade80", label: "매수" },
  SELL: { bg: "#1a0707", border: "#7a1a1a", text: "#f87171", label: "매도" },
  HOLD: { bg: "#171100", border: "#6b5500", text: "#fbbf24", label: "관망" },
};

/* ─── 헬퍼 컴포넌트 ──────────────────────────────────────────────────────── */
function AnimBar({ value, color, height = 4 }) {
  return (
    <div style={{ background: "#0a0e18", borderRadius: 3, height, overflow: "hidden" }}>
      <div style={{ width: `${value}%`, height: "100%", background: color, borderRadius: 3, transition: "width 1.2s cubic-bezier(.4,0,.2,1)" }} />
    </div>
  );
}

function ScoreChip({ score, small }) {
  const c = score >= 65 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
  return (
    <span style={{ color: c, fontFamily: "monospace", fontSize: small ? 11 : 13, fontWeight: 700 }}>
      {score}
    </span>
  );
}

/* ─── 에이전트 타임라인 ─────────────────────────────────────────────────── */
function AgentTimeline({ statuses }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {AGENT_ORDER.map((key) => {
        const meta = AGENT_META[key];
        const st = statuses[key] || "idle";
        const isDone = st === "done";
        const isRunning = st === "running";
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, padding: "5px 10px", borderRadius: 8, background: isRunning ? "#0d1829" : "transparent", transition: "background .3s" }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
              background: isDone ? meta.color : isRunning ? meta.color : "#1e2738",
              boxShadow: isRunning ? `0 0 8px ${meta.color}` : "none",
              transition: "all .3s"
            }} />
            <span style={{ fontSize: 11, fontFamily: "monospace", color: isDone ? meta.color : isRunning ? "#d1d5db" : "#374151" }}>
              {meta.icon} {meta.label}
            </span>
            {isDone && <span style={{ marginLeft: "auto", color: meta.color, fontSize: 10 }}>✓</span>}
          </div>
        );
      })}
    </div>
  );
}

/* ─── 에이전트 리포트 카드 ──────────────────────────────────────────────── */
function ReportCard({ agentKey, report }) {
  const meta = AGENT_META[agentKey];
  if (!report || report.error) return (
    <div style={{ background: "#1a0707", border: "1px solid #7a1a1a", borderRadius: 10, padding: "12px 14px" }}>
      <div style={{ color: "#f87171", fontFamily: "monospace", fontSize: 11 }}>{meta?.icon} {meta?.label} — 에러</div>
      <div style={{ color: "#7a3030", fontSize: 11, marginTop: 4 }}>{report?.summary || "분석 실패"}</div>
    </div>
  );

  // Bull / Bear 전용 레이아웃
  if (agentKey === "bull" || agentKey === "bear") {
    const isBull = agentKey === "bull";
    const color = isBull ? "#4ade80" : "#f87171";
    const border = isBull ? "#1a6b3c" : "#7a1a1a";
    const bg = isBull ? "#071a0f" : "#1a0707";
    return (
      <div style={{ background: bg, border: `1px solid ${border}`, borderRadius: 10, padding: "12px 14px", animation: "fadein .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{meta.icon} {meta.label}</span>
          <span style={{ color: border, fontFamily: "monospace", fontSize: 11 }}>신뢰도 {report.confidence}%</span>
        </div>
        <p style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.65, marginBottom: 10 }}>{report.thesis}</p>
        {report.key_arguments?.map((a, i) => (
          <div key={i} style={{ color: "#6b7280", fontSize: 11, padding: "3px 0 3px 8px", borderLeft: `2px solid ${border}`, marginBottom: 4 }}>{a}</div>
        ))}
        {(isBull ? report.upside_scenario : report.downside_scenario) && (
          <div style={{ marginTop: 8, padding: "6px 8px", background: "#060a12", borderRadius: 6, color: "#6b7280", fontSize: 11 }}>
            📌 {isBull ? "상승" : "하락"} 시나리오: {isBull ? report.upside_scenario : report.downside_scenario}
          </div>
        )}
      </div>
    );
  }

  // 리스크 매니저 전용
  if (agentKey === "risk") {
    const score = report.risk_score ?? 50;
    const color = score >= 65 ? "#4ade80" : score >= 40 ? "#fbbf24" : "#f87171";
    return (
      <div style={{ background: "#0b0f1a", border: "1px solid #1a2030", borderRadius: 10, padding: "12px 14px", animation: "fadein .4s ease" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
          <span style={{ color: "#fbbf24", fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>🛡️ 리스크 매니저</span>
          <span style={{ color, fontFamily: "monospace", fontSize: 11 }}>리스크 점수 {score}</span>
        </div>
        <AnimBar value={score} color={color} />
        <p style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.65, margin: "10px 0 8px" }}>{report.summary}</p>
        {report.key_risks?.map((r, i) => (
          <div key={i} style={{ color: "#f87171", fontSize: 11, padding: "2px 0 2px 8px", borderLeft: "2px solid #7a1a1a", marginBottom: 3 }}>{r}</div>
        ))}
        {report.risk_reward && <div style={{ marginTop: 8, color: "#6b7280", fontSize: 11 }}>리스크/리워드: {report.risk_reward}</div>}
      </div>
    );
  }

  // 일반 분석 에이전트
  const score = report.score ?? 50;
  const color = meta.color;
  const grade = report.grade || report.sentiment || report.trend || report.relative_valuation || "";
  return (
    <div style={{ background: "#0b0f1a", border: "1px solid #1a2030", borderRadius: 10, padding: "12px 14px", animation: "fadein .4s ease" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
        <span style={{ color, fontFamily: "monospace", fontSize: 12, fontWeight: 600 }}>{meta.icon} {meta.label}</span>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          {grade && <span style={{ color: "#6b7280", fontSize: 10, fontFamily: "monospace" }}>{grade}</span>}
          <ScoreChip score={score} small />
        </div>
      </div>
      <AnimBar value={score} color={color} />
      <p style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.65, margin: "8px 0" }}>{report.summary}</p>
      {/* 강점/약점 */}
      {(report.strengths || report.weaknesses) && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            {report.strengths?.map((s, i) => <div key={i} style={{ color: "#6b7280", fontSize: 11, paddingLeft: 8, borderLeft: "2px solid #1a6b3c", marginBottom: 3 }}>{s}</div>)}
          </div>
          <div>
            {report.weaknesses?.map((w, i) => <div key={i} style={{ color: "#6b7280", fontSize: 11, paddingLeft: 8, borderLeft: "2px solid #7a1a1a", marginBottom: 3 }}>{w}</div>)}
          </div>
        </div>
      )}
      {/* 뉴스 */}
      {report.key_news && (
        <div style={{ marginTop: 6 }}>
          {report.key_news.slice(0, 3).map((n, i) => <div key={i} style={{ color: "#6b7280", fontSize: 11, marginBottom: 3 }}>• {n}</div>)}
        </div>
      )}
      {/* 피어 테이블 */}
      {report.peers && report.peers.length > 0 && (
        <div style={{ marginTop: 8, overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10, fontFamily: "monospace" }}>
            <thead>
              <tr>{["종목","PER","PBR","성장"].map(h => <th key={h} style={{ color: "#374151", padding: "3px 4px", textAlign: h === "종목" ? "left" : "right", borderBottom: "1px solid #141c28" }}>{h}</th>)}</tr>
            </thead>
            <tbody>
              {report.peers.slice(0, 5).map((p, i) => (
                <tr key={i}>
                  <td style={{ color: "#9ca3af", padding: "3px 4px" }}>{p.ticker || p.name}</td>
                  <td style={{ color: "#6b7280", padding: "3px 4px", textAlign: "right" }}>{p.per != null ? p.per.toFixed(1)+"x" : "—"}</td>
                  <td style={{ color: "#6b7280", padding: "3px 4px", textAlign: "right" }}>{p.pbr != null ? p.pbr.toFixed(1)+"x" : "—"}</td>
                  <td style={{ color: p.revenue_growth > 0 ? "#4ade80" : p.revenue_growth < 0 ? "#f87171" : "#6b7280", padding: "3px 4px", textAlign: "right" }}>
                    {p.revenue_growth != null ? (p.revenue_growth > 0 ? "+" : "") + (p.revenue_growth * 100).toFixed(1) + "%" : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ─── 최종 결정 카드 ─────────────────────────────────────────────────────── */
function FinalCard({ final, stockData, reports }) {
  const [tab, setTab] = useState("overview");
  const rec = REC_STYLE[final.recommendation] || REC_STYLE.HOLD;
  const scores = ["fundamental","valuation","sentiment","technical","peer"].map(k => ({
    axis: AGENT_META[k].label,
    v: reports[k]?.score ?? 50,
  }));
  const avgScore = Math.round(scores.reduce((a, s) => a + s.v, 0) / scores.length);
  const cur = stockData?.currency === "KRW" ? "₩" : "$";

  return (
    <div style={{ background: "#0b0f1a", border: `1px solid ${rec.border}`, borderRadius: 12, overflow: "hidden", boxShadow: `0 4px 24px ${rec.bg}`, animation: "fadein .5s ease" }}>
      <div style={{ height: 3, background: `linear-gradient(90deg, ${rec.border}, transparent)` }} />

      {/* 헤더 */}
      <div style={{ padding: "16px 18px 10px", display: "flex", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1px solid #141c28" }}>
        <div>
          <div style={{ fontFamily: "monospace", fontSize: 18, fontWeight: 700, color: "#f0f2f8", letterSpacing: 1 }}>{stockData?.ticker}</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>{stockData?.name}</div>
          <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
            {stockData?.sector && <span style={{ background: "#141c28", border: "1px solid #1e2738", borderRadius: 4, padding: "2px 7px", color: "#4b5e7a", fontSize: 10, fontFamily: "monospace" }}>{stockData.sector}</span>}
            {final.time_horizon && <span style={{ background: "#141c28", border: "1px solid #1e2738", borderRadius: 4, padding: "2px 7px", color: "#4b5e7a", fontSize: 10, fontFamily: "monospace" }}>{final.time_horizon}</span>}
          </div>
        </div>
        <div style={{ textAlign: "center", background: rec.bg, border: `1px solid ${rec.border}`, borderRadius: 12, padding: "10px 18px" }}>
          <div style={{ color: rec.text, fontFamily: "monospace", fontSize: 20, fontWeight: 700, letterSpacing: 3 }}>{rec.label}</div>
          <div style={{ color: rec.border, fontSize: 10, fontFamily: "monospace", marginTop: 2 }}>{final.recommendation}</div>
        </div>
      </div>

      {/* 가격·목표 스트립 */}
      <div style={{ padding: "10px 18px", borderBottom: "1px solid #141c28", display: "flex", flexWrap: "wrap", gap: 16 }}>
        <div>
          <div style={{ color: "#374151", fontSize: 9, fontFamily: "monospace", marginBottom: 2 }}>현재가</div>
          <div style={{ color: "#d1d5db", fontFamily: "monospace", fontSize: 14, fontWeight: 600 }}>{cur}{(stockData?.current_price || 0).toLocaleString()}</div>
        </div>
        <div>
          <div style={{ color: "#374151", fontSize: 9, fontFamily: "monospace", marginBottom: 2 }}>목표주가</div>
          <div style={{ color: rec.text, fontFamily: "monospace", fontSize: 14, fontWeight: 600 }}>{final.target_price}</div>
          {final.upside && <div style={{ color: rec.border, fontSize: 10, fontFamily: "monospace" }}>{final.upside}</div>}
        </div>
        <div style={{ marginLeft: "auto", minWidth: 140 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
            <span style={{ color: "#374151", fontSize: 9, fontFamily: "monospace" }}>신뢰도</span>
            <span style={{ color: rec.text, fontFamily: "monospace", fontSize: 11, fontWeight: 700 }}>{final.confidence}%</span>
          </div>
          <AnimBar value={final.confidence} color={rec.text} />
        </div>
      </div>

      {/* 탭 */}
      <div style={{ display: "flex", borderBottom: "1px solid #141c28" }}>
        {[["overview","종합의견"],["scores","스코어"],["strategy","진입전략"]].map(([k,l]) => (
          <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: "8px 4px", background: "none", border: "none", borderBottom: tab === k ? "2px solid #60a5fa" : "2px solid transparent", color: tab === k ? "#60a5fa" : "#374151", fontSize: 11, fontFamily: "monospace", cursor: "pointer" }}>{l}</button>
        ))}
      </div>

      {/* 탭: 종합의견 */}
      {tab === "overview" && (
        <div style={{ padding: "14px 18px" }}>
          <p style={{ color: "#9ca3af", fontSize: 12, lineHeight: 1.75, marginBottom: 12 }}>{final.summary}</p>
          <div style={{ color: "#374151", fontSize: 9, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>핵심 근거</div>
          {final.key_reasons?.map((r, i) => (
            <div key={i} style={{ color: "#6b7280", fontSize: 12, paddingLeft: 8, borderLeft: `2px solid ${rec.border}`, marginBottom: 6, lineHeight: 1.5 }}>{r}</div>
          ))}
        </div>
      )}

      {/* 탭: 스코어 */}
      {tab === "scores" && (
        <div style={{ padding: "14px 18px" }}>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={scores} margin={{ top: 8, right: 24, bottom: 8, left: 24 }}>
              <PolarGrid stroke="#1a2030" strokeDasharray="3 3" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: "#374151", fontSize: 11, fontFamily: "monospace" }} />
              <Radar dataKey="v" stroke={rec.text} fill={rec.text} fillOpacity={0.12} strokeWidth={1.5} dot={{ fill: rec.text, r: 3 }} />
            </RadarChart>
          </ResponsiveContainer>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
            {scores.map(s => {
              const c = s.v >= 65 ? "#4ade80" : s.v >= 40 ? "#fbbf24" : "#f87171";
              return (
                <div key={s.axis} style={{ background: "#060a12", borderRadius: 6, padding: "7px 8px", border: "1px solid #1a2030" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                    <span style={{ color: "#6b7280", fontSize: 10 }}>{s.axis}</span>
                    <span style={{ color: c, fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{s.v}</span>
                  </div>
                  <AnimBar value={s.v} color={c} />
                </div>
              );
            })}
            <div style={{ background: "#060a12", borderRadius: 6, padding: "7px 8px", border: `1px solid ${rec.border}55` }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ color: rec.text, fontSize: 10 }}>종합</span>
                <span style={{ color: rec.text, fontSize: 11, fontFamily: "monospace", fontWeight: 700 }}>{avgScore}</span>
              </div>
              <AnimBar value={avgScore} color={rec.text} />
            </div>
          </div>
        </div>
      )}

      {/* 탭: 진입전략 */}
      {tab === "strategy" && (
        <div style={{ padding: "14px 18px" }}>
          <div style={{ color: "#374151", fontSize: 9, fontFamily: "monospace", letterSpacing: 1, marginBottom: 8 }}>진입 전략 / 관망 조건</div>
          <div style={{ background: "#060a12", borderRadius: 8, padding: "12px 14px", border: "1px solid #1a2030", color: "#9ca3af", fontSize: 12, lineHeight: 1.7 }}>
            {final.entry_strategy || "—"}
          </div>
          {/* Bull vs Bear 요약 */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 }}>
            <div style={{ background: "#071a0f", borderRadius: 6, padding: "10px 12px", border: "1px solid #1a6b3c" }}>
              <div style={{ color: "#4ade80", fontSize: 10, fontFamily: "monospace", marginBottom: 6 }}>🐂 Bull (신뢰도 {reports.bull?.confidence}%)</div>
              <div style={{ color: "#6b7280", fontSize: 11, lineHeight: 1.5 }}>{reports.bull?.thesis?.slice(0, 120)}...</div>
            </div>
            <div style={{ background: "#1a0707", borderRadius: 6, padding: "10px 12px", border: "1px solid #7a1a1a" }}>
              <div style={{ color: "#f87171", fontSize: 10, fontFamily: "monospace", marginBottom: 6 }}>🐻 Bear (신뢰도 {reports.bear?.confidence}%)</div>
              <div style={{ color: "#6b7280", fontSize: 11, lineHeight: 1.5 }}>{reports.bear?.thesis?.slice(0, 120)}...</div>
            </div>
          </div>
        </div>
      )}

      <div style={{ padding: "7px 18px", background: "#07090f", borderTop: "1px solid #141c28" }}>
        <span style={{ color: "#1e2738", fontFamily: "monospace", fontSize: 9 }}>8개 에이전트 종합 분석 결과 · {new Date().toLocaleDateString("ko-KR")}</span>
      </div>
    </div>
  );
}

/* ─── 분석 패널 (한 종목) ────────────────────────────────────────────────── */
function AnalysisPanel({ ticker, state }) {
  const { statuses, reports, stockData, final, progressMsg, error } = state;

  return (
    <div style={{ background: "#0b0f1a", border: "1px solid #1a2030", borderRadius: 14, overflow: "hidden", marginBottom: 20 }}>
      {/* 패널 헤더 */}
      <div style={{ padding: "12px 18px", borderBottom: "1px solid #141c28", display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ width: 6, height: 6, borderRadius: "50%", background: final ? "#4ade80" : error ? "#f87171" : "#fbbf24", boxShadow: final || error ? "none" : "0 0 7px #fbbf24", animation: final || error ? "none" : "blink 1.5s infinite" }} />
        <span style={{ color: "#f0f2f8", fontFamily: "monospace", fontSize: 13, letterSpacing: 1 }}>{ticker}</span>
        {stockData?.name && <span style={{ color: "#6b7280", fontSize: 12 }}>— {stockData.name}</span>}
        {progressMsg && !final && <span style={{ marginLeft: "auto", color: "#374151", fontFamily: "monospace", fontSize: 10 }}>{progressMsg}</span>}
        {error && <span style={{ marginLeft: "auto", color: "#f87171", fontFamily: "monospace", fontSize: 10 }}>⚠ {error}</span>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "180px 1fr", gap: 0 }}>
        {/* 타임라인 */}
        <div style={{ padding: "14px 8px", borderRight: "1px solid #141c28" }}>
          <AgentTimeline statuses={statuses} />
        </div>

        {/* 리포트 영역 */}
        <div style={{ padding: "14px 16px", overflowY: "auto", maxHeight: 700 }}>
          {/* yfinance 데이터 요약 */}
          {stockData && (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 16, padding: "10px 12px", background: "#060a12", borderRadius: 8, border: "1px solid #1a2030" }}>
              {[
                ["현재가", `${stockData.currency === "KRW" ? "₩" : "$"}${(stockData.current_price||0).toLocaleString()}`],
                ["PER", stockData.per != null ? stockData.per.toFixed(1)+"x" : "—"],
                ["PBR", stockData.pbr != null ? stockData.pbr.toFixed(1)+"x" : "—"],
                ["52주 위치", stockData.momentum_pct != null ? stockData.momentum_pct+"%" : "—"],
                ["PSR", stockData.psr != null ? stockData.psr.toFixed(1)+"x" : "—"],
                ["ROE", stockData.roe != null ? (stockData.roe*100).toFixed(1)+"%" : "—"],
                ["1개월", stockData.price_change_1m != null ? (stockData.price_change_1m > 0 ? "+" : "")+stockData.price_change_1m+"%" : "—"],
                ["MA신호", stockData.ma_signal || "—"],
              ].map(([k, v]) => (
                <div key={k}>
                  <div style={{ color: "#374151", fontSize: 9, fontFamily: "monospace", marginBottom: 2 }}>{k}</div>
                  <div style={{ color: "#d1d5db", fontFamily: "monospace", fontSize: 11, fontWeight: 600 }}>{v}</div>
                </div>
              ))}
            </div>
          )}

          {/* 최종 결정 카드 (맨 위에 표시) */}
          {final && (
            <div style={{ marginBottom: 16 }}>
              <FinalCard final={final} stockData={stockData} reports={reports} />
            </div>
          )}

          {/* 에이전트 리포트 카드들 */}
          {["fundamental","valuation","sentiment","technical","peer","bull","bear","risk"].map(key =>
            reports[key] ? (
              <div key={key} style={{ marginBottom: 10 }}>
                <ReportCard agentKey={key} report={reports[key]} />
              </div>
            ) : null
          )}

          {/* 분석 대기 중 */}
          {!stockData && !error && (
            <div style={{ textAlign: "center", padding: "40px 0", color: "#374151", fontFamily: "monospace", fontSize: 11 }}>
              <div style={{ marginBottom: 12 }}>분석 준비 중...</div>
              <div style={{ display: "flex", justifyContent: "center", gap: 5 }}>
                {[0,1,2].map(i => <div key={i} style={{ width: 7, height: 7, borderRadius: "50%", background: "#60a5fa", animation: `dotpulse 1.4s ease-in-out ${i*.22}s infinite` }} />)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── 프리셋 ─────────────────────────────────────────────────────────────── */
const PRESETS = [
  { label: "삼성전자", v: "005930" }, { label: "SK하이닉스", v: "000660" },
  { label: "NVIDIA",   v: "NVDA"  }, { label: "APPLE",     v: "AAPL"  },
  { label: "TESLA",    v: "TSLA"  }, { label: "카카오",    v: "035720" },
];

/* ─── 메인 앱 ───────────────────────────────────────────────────────────── */
export default function App() {
  const [input, setInput] = useState("");
  const [queue, setQueue] = useState([]);     // 분석 대기 목록
  const [analyses, setAnalyses] = useState({}); // ticker → 분석 상태
  const [running, setRunning] = useState(false);
  const sourcesRef = useRef({});

  const updateAnalysis = useCallback((ticker, patch) => {
    setAnalyses(prev => ({
      ...prev,
      [ticker]: { ...prev[ticker], ...patch },
    }));
  }, []);

  const addTicker = (val) => {
    const t = (val || input).trim().toUpperCase().replace(/\s/g, "");
    if (t && !queue.includes(t) && queue.length < 3) setQueue(q => [...q, t]);
    if (!val) setInput("");
  };

  const removeTicker = (t) => {
    if (running) return;
    setQueue(q => q.filter(x => x !== t));
  };

  const startAnalysis = async () => {
    if (!queue.length || running) return;
    setRunning(true);

    // 각 종목을 순서대로 분석 (SSE)
    for (const ticker of queue) {
      // 초기화
      updateAnalysis(ticker, {
        statuses: Object.fromEntries(AGENT_ORDER.map(k => [k, "idle"])),
        reports: {}, stockData: null, final: null, progressMsg: "", error: null,
      });

      await new Promise((resolve) => {
        const url = `${API_BASE}/analyze/${encodeURIComponent(ticker)}`;
        const es = new EventSource(url);
        sourcesRef.current[ticker] = es;

        es.onmessage = (evt) => {
          try {
            const data = JSON.parse(evt.data);

            if (data.event === "progress") {
              const stepKey = data.step === "analysts" ? "fundamental" : data.step;
              updateAnalysis(ticker, prev => ({
                progressMsg: data.message,
                statuses: { ...prev.statuses, [stepKey]: "running" },
              }));
            }

            if (data.event === "data_ready") {
              updateAnalysis(ticker, prev => ({
                stockData: data.data,
                statuses: { ...prev.statuses, data: "done" },
              }));
            }

            if (data.event === "agent_done") {
              updateAnalysis(ticker, prev => ({
                reports: { ...prev.reports, [data.agent]: data.report },
                statuses: { ...prev.statuses, [data.agent]: "done" },
              }));
            }

            if (data.event === "complete") {
              updateAnalysis(ticker, prev => ({
                final: data.result.final,
                progressMsg: "",
                statuses: Object.fromEntries(AGENT_ORDER.map(k => [k, "done"])),
              }));
              es.close();
              resolve();
            }

            if (data.event === "error") {
              updateAnalysis(ticker, { error: data.message, progressMsg: "" });
              es.close();
              resolve();
            }
          } catch (e) {
            console.error("SSE parse error", e);
          }
        };

        es.onerror = () => {
          updateAnalysis(ticker, { error: "서버 연결 오류 (백엔드 실행 확인)", progressMsg: "" });
          es.close();
          resolve();
        };
      });
    }

    setRunning(false);
  };

  const T = { bg: "#060a12", t1: "#f0f2f8", t3: "#6b7280", t4: "#374151", t5: "#1e2738", border: "#1a2030" };

  return (
    <div style={{ background: T.bg, minHeight: "100vh", fontFamily: "system-ui,sans-serif", paddingBottom: 48 }}>
      <style>{`
        @keyframes fadein   { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink    { 0%,100%{opacity:1} 50%{opacity:.2} }
        @keyframes dotpulse { 0%,80%,100%{transform:scale(0);opacity:.3} 40%{transform:scale(1);opacity:1} }
        * { box-sizing:border-box; } input::placeholder{color:#2d3748;} input:focus{outline:none;} button{cursor:pointer;}
        ::-webkit-scrollbar{width:3px;} ::-webkit-scrollbar-thumb{background:#1a2030;border-radius:2px;}
      `}</style>

      {/* 헤더 */}
      <div style={{ padding: "18px 22px 14px", borderBottom: `1px solid ${T.border}`, marginBottom: 22 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 3 }}>
          <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#4ade80", boxShadow: "0 0 10px #4ade80", animation: "blink 2s ease-in-out infinite" }} />
          <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: 3, color: T.t1, fontFamily: "monospace" }}>STOCK ANALYZER</span>
          <span style={{ marginLeft: "auto", color: T.t5, fontSize: 9, fontFamily: "monospace", letterSpacing: 1 }}>8-AGENT · YFINANCE · CLAUDE</span>
        </div>
        <p style={{ color: T.t5, fontSize: 10, paddingLeft: 17, fontFamily: "monospace", margin: 0 }}>
          실측 재무 데이터 + 8개 전문 에이전트 · Bull/Bear 토론 · 리스크 매니저 · 최종 의사결정
        </p>
      </div>

      <div style={{ padding: "0 22px" }}>
        {/* 입력 패널 */}
        <div style={{ background: "#0b0f1a", border: `1px solid ${T.border}`, borderRadius: 12, padding: "15px 16px", marginBottom: 16 }}>
          <div style={{ color: T.t5, fontSize: 9, fontFamily: "monospace", letterSpacing: 2, marginBottom: 9 }}>종목 코드 입력 (최대 3개 · 종목당 약 60초 소요)</div>
          <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
            <input value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && addTicker()}
              placeholder="005930  /  NVDA  /  AAPL..." disabled={running}
              style={{ flex: 1, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 8, padding: "8px 12px", color: T.t1, fontFamily: "monospace", fontSize: 13 }}
              onFocus={e => e.target.style.borderColor="#2a3a5a"} onBlur={e => e.target.style.borderColor=T.border} />
            <button onClick={() => addTicker()} disabled={running || !input.trim() || queue.length >= 3}
              style={{ background: input.trim() && queue.length < 3 ? "#071a0f" : "#0b0f1a", border: `1px solid ${input.trim() && queue.length < 3 ? "#1a6b3c" : T.border}`, borderRadius: 8, padding: "8px 16px", color: input.trim() && queue.length < 3 ? "#4ade80" : T.t4, fontFamily: "monospace", fontSize: 12 }}>
              + 추가
            </button>
          </div>
          <div style={{ marginBottom: queue.length ? 12 : 0 }}>
            <div style={{ color: T.t5, fontSize: 9, fontFamily: "monospace", letterSpacing: 1, marginBottom: 6 }}>빠른 선택</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
              {PRESETS.map(p => (
                <button key={p.v} onClick={() => addTicker(p.v)} disabled={running || queue.includes(p.v) || queue.length >= 3}
                  style={{ background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 9px", color: queue.includes(p.v) ? T.t5 : "#4b5e7a", fontFamily: "monospace", fontSize: 10, opacity: queue.includes(p.v) || queue.length >= 3 ? 0.4 : 1 }}>
                  {p.label} {p.v}
                </button>
              ))}
            </div>
          </div>
          {queue.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {queue.map(t => (
                <div key={t} style={{ display: "flex", alignItems: "center", gap: 6, background: T.bg, border: `1px solid ${T.border}`, borderRadius: 6, padding: "3px 9px 3px 7px" }}>
                  <div style={{ width: 6, height: 6, borderRadius: "50%", background: analyses[t]?.final ? "#4ade80" : analyses[t]?.error ? "#f87171" : analyses[t]?.stockData ? "#fbbf24" : "#374151" }} />
                  <span style={{ color: "#c9d1d9", fontFamily: "monospace", fontSize: 11, letterSpacing: 1 }}>{t}</span>
                  {!running && <button onClick={() => removeTicker(t)} style={{ background: "none", border: "none", color: T.t5, fontSize: 14, lineHeight: 1, padding: "0 0 0 3px" }}>×</button>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 실행 버튼 */}
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={startAnalysis} disabled={!queue.length || running}
            style={{ background: queue.length && !running ? "#071a0f" : "#0b0f1a", border: `1px solid ${queue.length && !running ? "#1a6b3c" : T.border}`, borderRadius: 10, padding: "10px 26px", color: queue.length && !running ? "#4ade80" : T.t4, fontFamily: "monospace", fontSize: 12, letterSpacing: 2, boxShadow: queue.length && !running ? "0 0 18px rgba(74,222,128,.08)" : "none" }}>
            {running ? "▶ 분석 중..." : "▶ 분석 시작"}
          </button>
          {running && <span style={{ color: T.t5, fontFamily: "monospace", fontSize: 10 }}>8개 에이전트 순차 실행 중 · 종목당 약 60초</span>}
        </div>

        {/* 분석 패널 */}
        {queue.map(ticker => analyses[ticker] ? (
          <AnalysisPanel key={ticker} ticker={ticker} state={analyses[ticker]} />
        ) : null)}

        {/* 빈 상태 */}
        {queue.length === 0 && (
          <div style={{ textAlign: "center", padding: "48px 0" }}>
            <div style={{ color: T.border, fontFamily: "monospace", fontSize: 40, marginBottom: 14 }}>◈</div>
            <div style={{ color: T.t5, fontFamily: "monospace", fontSize: 11, letterSpacing: 2 }}>종목을 추가하고 멀티에이전트 분석을 시작하세요</div>
            <div style={{ color: T.border, fontFamily: "monospace", fontSize: 10, marginTop: 7 }}>한국: 6자리 종목코드 / 미국: 영문 티커</div>
          </div>
        )}

        <div style={{ marginTop: 20, paddingTop: 10, borderTop: `1px solid #0f151e`, color: T.t5, fontFamily: "monospace", fontSize: 9 }}>
          ⚠ AI 분석 결과는 참고용이며 투자 권유가 아닙니다. 투자 판단의 최종 책임은 투자자 본인에게 있습니다.
        </div>
      </div>
    </div>
  );
}
