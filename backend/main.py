"""
주식 멀티에이전트 분석 백엔드
FastAPI + yfinance + Claude API (8개 전문 에이전트)
"""

import asyncio
import json
import os
import re
from datetime import datetime

import httpx
import yfinance as yf
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

app = FastAPI(title="Stock Multi-Agent Analyzer")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
MODEL = "claude-sonnet-4-6"
BASE_URL = "https://api.anthropic.com/v1/messages"


# ─── Claude API 헬퍼 ──────────────────────────────────────────────────────────

async def call_claude(
    system: str,
    user: str,
    use_search: bool = False,
    max_tokens: int = 1000,
) -> str:
    messages = [{"role": "user", "content": user}]
    body: dict = {
        "model": MODEL,
        "max_tokens": max_tokens,
        "system": system,
        "messages": messages,
    }
    if use_search:
        body["tools"] = [{"type": "web_search_20250305", "name": "web_search"}]

    headers = {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
    }

    for retry in range(3):
        try:
            async with httpx.AsyncClient(timeout=120.0) as client:
                for _ in range(8):
                    resp = await client.post(BASE_URL, json=body, headers=headers)

                    if resp.status_code == 429:
                        wait = 30 * (retry + 1)
                        print(f"Rate limit 429 — {wait}초 대기 후 재시도 ({retry+1}/3)")
                        await asyncio.sleep(wait)
                        break  # inner loop 탈출 → retry

                    resp.raise_for_status()
                    data = resp.json()

                    if data["stop_reason"] == "tool_use":
                        messages.append({"role": "assistant", "content": data["content"]})
                        tool_results = [
                            {"type": "tool_result", "tool_use_id": b["id"], "content": ""}
                            for b in data["content"]
                            if b["type"] == "tool_use"
                        ]
                        messages.append({"role": "user", "content": tool_results})
                        body["messages"] = messages
                        continue

                    return "\n".join(
                        b["text"] for b in data["content"] if b["type"] == "text"
                    )
                else:
                    continue  # inner for 정상 종료 시 retry 불필요
                continue  # 429로 break한 경우 retry

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429 and retry < 2:
                await asyncio.sleep(30 * (retry + 1))
                continue
            raise

    raise RuntimeError("재시도 한도(3회) 초과")


def parse_json(text: str) -> dict:
    match = re.search(r"\{[\s\S]*\}", text)
    if match:
        try:
            return json.loads(match.group())
        except json.JSONDecodeError:
            pass
    return {"error": "파싱 실패", "raw": text[:300]}


def fmt_pct(v):
    return f"{v * 100:.1f}%" if v is not None else "N/A"

def fmt_mult(v):
    return f"{v:.1f}x" if v is not None else "N/A"

def fmt_num(v):
    return f"{v:,.0f}" if v is not None else "N/A"


# ─── 데이터 수집 (yfinance) ───────────────────────────────────────────────────

async def fetch_stock_data(ticker: str) -> dict:
    """yfinance로 데이터 수집. 실패 시 빈 구조 반환 (Claude 웹서치로 보완)."""
    def _sync():
        base = {
            "ticker": ticker, "ticker_yf": ticker, "name": ticker,
            "exchange": "", "sector": "", "industry": "",
            "currency": "KRW" if ticker.isdigit() else "USD",
            "current_price": None, "market_cap": None,
            "week52_high": None, "week52_low": None,
            "momentum_pct": None, "price_change_1m": None,
            "ma50": None, "ma200": None, "ma_signal": "N/A", "beta": None,
            "per": None, "per_forward": None, "pbr": None,
            "psr": None, "ev_ebitda": None,
            "revenue": None, "revenue_growth": None,
            "gross_margin": None, "op_margin": None, "net_margin": None,
            "roe": None, "roa": None, "debt_equity": None,
            "current_ratio": None, "free_cashflow": None,
            "analyst_target": None, "analyst_low": None,
            "analyst_high": None, "analyst_recommendation": None,
            "analyst_count": None,
        }
        try:
            import requests as req_session
            session = req_session.Session()
            session.headers["User-Agent"] = (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            )
            t_str = ticker + ".KS" if ticker.isdigit() else ticker
            t = yf.Ticker(t_str, session=session)
            info = t.info or {}
            if not info.get("regularMarketPrice") and not info.get("currentPrice"):
                raise ValueError("빈 응답")

            hist = t.history(period="1y")
            current = info.get("currentPrice") or info.get("regularMarketPrice") or 0
            w52h = info.get("fiftyTwoWeekHigh") or 0
            w52l = info.get("fiftyTwoWeekLow") or 0
            rng = w52h - w52l
            momentum_pct = round((current - w52l) / rng * 100, 1) if rng > 0 else 50
            price_change_1m = 0.0
            if len(hist) >= 20:
                p1m = float(hist["Close"].iloc[-20])
                price_change_1m = round((current - p1m) / p1m * 100, 2) if p1m else 0
            ma50  = info.get("fiftyDayAverage")
            ma200 = info.get("twoHundredDayAverage")
            ma_signal = ("골든크로스" if ma50 and ma200 and ma50 > ma200
                         else "데드크로스" if ma50 and ma200 and ma50 < ma200
                         else "중립")
            base.update({
                "name": info.get("longName") or info.get("shortName", ticker),
                "exchange": info.get("exchange", ""),
                "sector": info.get("sector", ""),
                "industry": info.get("industry", ""),
                "currency": info.get("currency", base["currency"]),
                "current_price": current, "market_cap": info.get("marketCap"),
                "week52_high": w52h, "week52_low": w52l,
                "momentum_pct": momentum_pct, "price_change_1m": price_change_1m,
                "ma50": ma50, "ma200": ma200, "ma_signal": ma_signal,
                "beta": info.get("beta"),
                "per": info.get("trailingPE"), "per_forward": info.get("forwardPE"),
                "pbr": info.get("priceToBook"),
                "psr": info.get("priceToSalesTrailing12Months"),
                "ev_ebitda": info.get("enterpriseToEbitda"),
                "revenue": info.get("totalRevenue"),
                "revenue_growth": info.get("revenueGrowth"),
                "gross_margin": info.get("grossMargins"),
                "op_margin": info.get("operatingMargins"),
                "net_margin": info.get("profitMargins"),
                "roe": info.get("returnOnEquity"), "roa": info.get("returnOnAssets"),
                "debt_equity": info.get("debtToEquity"),
                "current_ratio": info.get("currentRatio"),
                "free_cashflow": info.get("freeCashflow"),
                "analyst_target": info.get("targetMeanPrice"),
                "analyst_low": info.get("targetLowPrice"),
                "analyst_high": info.get("targetHighPrice"),
                "analyst_recommendation": info.get("recommendationMean"),
                "analyst_count": info.get("numberOfAnalystOpinions"),
            })
        except Exception as e:
            print(f"yfinance 실패 ({ticker}): {e} → 웹서치로 대체")
        return base

    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, _sync)


# ─── 5개 전문 분석 에이전트 ──────────────────────────────────────────────────

async def fundamental_agent(ticker: str, d: dict) -> dict:
    system = (
        "당신은 기업 펀더멘털 전문 애널리스트입니다. "
        "제공된 재무 데이터만으로 분석하고 반드시 JSON으로만 응답하세요.\n"
        '{"score":0-100,"grade":"우수|양호|보통|취약",'
        '"summary":"2-3문장 한국어","strengths":["강점1","강점2"],'
        '"weaknesses":["약점1","약점2"]}'
    )
    user = f"""
종목: {d['name']} ({ticker}) | 섹터: {d.get('sector','N/A')} / {d.get('industry','N/A')}

▶ 재무 지표 (yfinance 실측값)
- 매출 성장률  : {fmt_pct(d.get('revenue_growth'))}
- 영업이익률   : {fmt_pct(d.get('op_margin'))}
- 순이익률     : {fmt_pct(d.get('net_margin'))}
- 매출총이익률 : {fmt_pct(d.get('gross_margin'))}
- ROE          : {fmt_pct(d.get('roe'))}
- ROA          : {fmt_pct(d.get('roa'))}
- 부채비율(D/E): {fmt_mult(d.get('debt_equity'))}
- 유동비율     : {fmt_mult(d.get('current_ratio'))}
- 잉여현금흐름 : {fmt_num(d.get('free_cashflow'))}

이 기업의 재무 건전성과 수익성을 평가하세요.
"""
    r = parse_json(await call_claude(system, user))
    r["agent"] = "fundamental"
    return r


async def valuation_agent(ticker: str, d: dict) -> dict:
    system = (
        "당신은 주식 밸류에이션 전문 애널리스트입니다. "
        "제공된 멀티플을 분석하고 반드시 JSON으로만 응답하세요.\n"
        '{"score":0-100,"grade":"저평가|적정|고평가",'
        '"summary":"2-3문장 한국어","fair_value_comment":"적정가 코멘트",'
        '"vs_analyst":"애널리스트 목표 대비 평가",'
        '"multiples_comment":{"per":"","pbr":"","psr":""}}'
    )
    cur = d.get("currency", "USD")
    sym = "₩" if cur == "KRW" else "$"
    user = f"""
종목: {d['name']} ({ticker})
현재가: {sym}{fmt_num(d.get('current_price'))} | 섹터: {d.get('sector','N/A')}

▶ 밸류에이션 멀티플 (yfinance 실측값)
- PER (Trailing) : {fmt_mult(d.get('per'))}
- PER (Forward)  : {fmt_mult(d.get('per_forward'))}
- PBR            : {fmt_mult(d.get('pbr'))}
- PSR            : {fmt_mult(d.get('psr'))}
- EV/EBITDA      : {fmt_mult(d.get('ev_ebitda'))}

▶ 애널리스트 컨센서스 ({d.get('analyst_count','N/A')}명)
- 평균 목표가: {sym}{d.get('analyst_target','N/A')}
  (저: {sym}{d.get('analyst_low','N/A')} ~ 고: {sym}{d.get('analyst_high','N/A')})
- 평균 의견: {d.get('analyst_recommendation','N/A')} (1=강매수, 5=강매도)

섹터 일반 수준과 비교해 현재 밸류에이션을 평가하세요.
"""
    r = parse_json(await call_claude(system, user))
    r["agent"] = "valuation"
    return r


async def sentiment_agent(ticker: str, d: dict) -> dict:
    system = (
        "당신은 시장 감성 분석 전문가입니다. "
        "웹 검색으로 최신 뉴스·애널리스트 코멘트를 수집해 분석하세요. "
        "반드시 JSON으로만 응답하세요.\n"
        '{"score":0-100,"sentiment":"매우긍정|긍정|중립|부정|매우부정",'
        '"summary":"2-3문장 한국어","key_news":["뉴스1","뉴스2","뉴스3"],'
        '"catalysts":["촉매1","촉매2"],"risks_mentioned":["언급리스크1","언급리스크2"]}'
    )
    user = f"""
종목: {d['name']} ({ticker}) | 섹터: {d.get('sector','N/A')}
최근 1-3개월 뉴스, 애널리스트 코멘트, 시장 감성을 웹에서 검색해 분석하세요.
"""
    r = parse_json(await call_claude(system, user, use_search=True))
    r["agent"] = "sentiment"
    return r


async def technical_agent(ticker: str, d: dict) -> dict:
    system = (
        "당신은 기술적 분석 전문가입니다. "
        "제공된 가격 데이터를 분석하고 반드시 JSON으로만 응답하세요.\n"
        '{"score":0-100,"trend":"강한상승|상승|횡보|하락|강한하락",'
        '"summary":"2-3문장 한국어","signals":["시그널1","시그널2"],'
        '"key_levels":"지지·저항 레벨 코멘트"}'
    )
    user = f"""
종목: {d['name']} ({ticker})

▶ 기술적 지표 (yfinance 실측값)
- 현재가           : {d.get('current_price')}
- 52주 고가        : {d.get('week52_high')}
- 52주 저가        : {d.get('week52_low')}
- 52주 레인지 위치 : {d.get('momentum_pct')}% (0%=저가, 100%=고가)
- 1개월 수익률     : {d.get('price_change_1m')}%
- 50일 이동평균    : {d.get('ma50')}
- 200일 이동평균   : {d.get('ma200')}
- MA 크로스 신호   : {d.get('ma_signal')}
- 베타             : {d.get('beta')}

가격 모멘텀과 추세를 종합 평가하세요.
"""
    r = parse_json(await call_claude(system, user))
    r["agent"] = "technical"
    return r


async def peer_agent(ticker: str, d: dict) -> dict:
    system = (
        "당신은 동종업계 비교 분석 전문가입니다. "
        "웹 검색으로 경쟁사 데이터를 수집해 비교하세요. "
        "반드시 JSON으로만 응답하세요.\n"
        '{"score":0-100,"summary":"2-3문장 한국어",'
        '"sector_avg_per":숫자|null,"sector_avg_pbr":숫자|null,'
        '"relative_valuation":"저평가|적정|고평가",'
        '"peers":[{"name":"","ticker":"","per":null,"pbr":null,'
        '"revenue_growth":null,"roe":null,"market_cap":""}],'
        '"competitive_position":"경쟁 위치 평가"}'
    )
    user = f"""
종목: {d['name']} ({ticker})
섹터: {d.get('sector','N/A')} / 산업: {d.get('industry','N/A')}

현재 멀티플: PER {fmt_mult(d.get('per'))} | PBR {fmt_mult(d.get('pbr'))} | PSR {fmt_mult(d.get('psr'))}

이 종목과 같은 섹터·산업의 주요 경쟁사 5개를 웹에서 검색하고,
각사의 PER, PBR, 매출성장률, ROE를 수집해 비교 분석하세요.
섹터 평균 멀티플도 계산하세요.
"""
    r = parse_json(await call_claude(system, user, use_search=True, max_tokens=1500))
    r["agent"] = "peer"
    return r


# ─── Bull / Bear 리서처 ───────────────────────────────────────────────────────

async def bull_researcher(ticker: str, reports: list) -> dict:
    system = (
        "당신은 강세론 리서처입니다. 5개 에이전트 리포트를 보고 "
        "매수 논거를 구축하세요. 반드시 JSON으로만 응답하세요.\n"
        '{"thesis":"핵심 매수 논거 2-3문장","key_arguments":["논거1","논거2","논거3","논거4"],'
        '"upside_scenario":"상승 시나리오","confidence":0-100}'
    )
    summary = "\n\n".join(
        f"[{r.get('agent','').upper()} / 점수 {r.get('score','?')}]\n{r.get('summary','')}"
        for r in reports
    )
    user = f"""
종목: {ticker}
5개 에이전트 분석:
{summary}

이 종목을 매수해야 하는 가장 강력한 논거를 구축하세요.
약점은 최소화하고 기회·강점을 극대화하세요.
"""
    r = parse_json(await call_claude(system, user))
    r["agent"] = "bull"
    return r


async def bear_researcher(ticker: str, reports: list) -> dict:
    system = (
        "당신은 약세론 리서처입니다. 5개 에이전트 리포트를 보고 "
        "매도/회피 논거를 구축하세요. 반드시 JSON으로만 응답하세요.\n"
        '{"thesis":"핵심 매도 논거 2-3문장","key_arguments":["논거1","논거2","논거3","논거4"],'
        '"downside_scenario":"하락 시나리오","confidence":0-100}'
    )
    summary = "\n\n".join(
        f"[{r.get('agent','').upper()} / 점수 {r.get('score','?')}]\n{r.get('summary','')}"
        for r in reports
    )
    user = f"""
종목: {ticker}
5개 에이전트 분석:
{summary}

이 종목을 매수하면 안 되는 가장 강력한 논거를 구축하세요.
강점은 최소화하고 리스크·약점을 극대화하세요.
"""
    r = parse_json(await call_claude(system, user))
    r["agent"] = "bear"
    return r


# ─── 리스크 매니저 ────────────────────────────────────────────────────────────

async def risk_manager_agent(ticker: str, bull: dict, bear: dict) -> dict:
    system = (
        "당신은 리스크 매니저입니다. Bull·Bear 논거를 객관적으로 검토하고 "
        "리스크를 평가하세요. 반드시 JSON으로만 응답하세요.\n"
        '{"risk_score":0-100,"summary":"2-3문장 한국어",'
        '"bull_validity":"Bull 논거 유효성","bear_validity":"Bear 논거 유효성",'
        '"key_risks":["리스크1","리스크2","리스크3"],'
        '"risk_reward":"리스크/리워드 비율 평가"}'
    )
    user = f"""
종목: {ticker}

Bull 논거 (신뢰도 {bull.get('confidence','?')}):
{bull.get('thesis','')}
논거: {', '.join(bull.get('key_arguments', []))}

Bear 논거 (신뢰도 {bear.get('confidence','?')}):
{bear.get('thesis','')}
논거: {', '.join(bear.get('key_arguments', []))}

두 논거를 객관적으로 평가하세요.
과장된 부분은 걸러내고 실질적인 리스크에 집중하세요.
"""
    r = parse_json(await call_claude(system, user))
    r["agent"] = "risk"
    return r


# ─── 최종 결정 에이전트 ──────────────────────────────────────────────────────

async def final_decision_agent(
    ticker: str, data: dict, reports: dict
) -> dict:
    system = (
        "당신은 최종 투자 의사결정자입니다. 모든 에이전트 리포트를 종합해 "
        "최종 투자 의견을 내세요. 반드시 JSON으로만 응답하세요.\n"
        '{"recommendation":"BUY|SELL|HOLD","confidence":0-100,'
        '"target_price":"목표주가(숫자+통화)","upside":"+N.N% 또는 -N.N%",'
        '"time_horizon":"단기(1개월 이내)|중기(3-6개월)|장기(1년 이상)",'
        '"summary":"3-4문장 종합 의견","key_reasons":["이유1","이유2","이유3"],'
        '"entry_strategy":"매수 전략 또는 관망 조건"}'
    )

    cur = data.get("currency", "USD")
    sym = "₩" if cur == "KRW" else "$"
    price = data.get("current_price", 0)

    r = reports
    ctx = f"""
종목: {data.get('name','')} ({ticker})
현재가: {sym}{price:,.0f} | 섹터: {data.get('sector','')}

[펀더멘털 점수 {r['fundamental'].get('score','?')} / {r['fundamental'].get('grade','')}]
{r['fundamental'].get('summary','')}

[밸류에이션 점수 {r['valuation'].get('score','?')} / {r['valuation'].get('grade','')}]
{r['valuation'].get('summary','')}

[뉴스감성 점수 {r['sentiment'].get('score','?')} / {r['sentiment'].get('sentiment','')}]
{r['sentiment'].get('summary','')}

[기술분석 점수 {r['technical'].get('score','?')} / {r['technical'].get('trend','')}]
{r['technical'].get('summary','')}

[피어비교 점수 {r['peer'].get('score','?')} / {r['peer'].get('relative_valuation','')}]
{r['peer'].get('summary','')}

[Bull 논거 / 신뢰도 {r['bull'].get('confidence','?')}]
{r['bull'].get('thesis','')}

[Bear 논거 / 신뢰도 {r['bear'].get('confidence','?')}]
{r['bear'].get('thesis','')}

[리스크 점수 {r['risk'].get('risk_score','?')}]
{r['risk'].get('summary','')}
핵심 리스크: {', '.join(r['risk'].get('key_risks', []))}
"""

    result = parse_json(await call_claude(system, ctx, max_tokens=1500))
    result["agent"] = "final"
    return result


# ─── 스트리밍 분석 엔드포인트 ─────────────────────────────────────────────────

@app.get("/analyze/{ticker}")
async def analyze_stock(ticker: str):
    """
    SSE 스트리밍 분석 엔드포인트.
    각 에이전트 완료 시마다 이벤트를 전송합니다.
    """
    async def stream():
        def evt(event: str, **kw) -> str:
            return f"data: {json.dumps({'event': event, **kw}, ensure_ascii=False)}\n\n"

        try:
            # ① 데이터 수집
            yield evt("progress", step="data", message="📊 yfinance 데이터 수집 중...")
            stock_data = await fetch_stock_data(ticker)
            yield evt("data_ready", data=stock_data)

            # ② 5개 에이전트 순차 실행 (rate limit 방지)
            yield evt("progress", step="analysts", message="🔬 5개 전문 에이전트 순차 분석 중...")

            agent_fns = [
                fundamental_agent,
                valuation_agent,
                sentiment_agent,
                technical_agent,
                peer_agent,
            ]
            raw_results = []
            for fn in agent_fns:
                try:
                    r = await fn(ticker, stock_data)
                except Exception as e:
                    r = {"agent": "unknown", "score": 50, "summary": str(e), "error": True}
                raw_results.append(r)
                await asyncio.sleep(8)

            analyst_reports: list[dict] = []
            for res in raw_results:
                if isinstance(res, Exception):
                    fallback = {"agent": "unknown", "score": 50, "summary": str(res), "error": True}
                    analyst_reports.append(fallback)
                    yield evt("agent_done", agent="unknown", report=fallback)
                else:
                    analyst_reports.append(res)
                    yield evt("agent_done", agent=res.get("agent", ""), report=res)

            # ③ Bull & Bear 토론
            yield evt("progress", step="debate", message="⚔️ Bull vs Bear 토론 중...")
            bull = await bull_researcher(ticker, analyst_reports)
            yield evt("agent_done", agent="bull", report=bull)
            await asyncio.sleep(8)

            bear = await bear_researcher(ticker, analyst_reports)
            yield evt("agent_done", agent="bear", report=bear)
            await asyncio.sleep(8)

            # ④ 리스크 매니저
            yield evt("progress", step="risk", message="🛡️ 리스크 매니저 검토 중...")
            risk = await risk_manager_agent(ticker, bull, bear)
            yield evt("agent_done", agent="risk", report=risk)
            await asyncio.sleep(8)

            # ⑤ 최종 결정
            yield evt("progress", step="final", message="🎯 최종 투자 의견 종합 중...")
            all_reports = {
                "fundamental": analyst_reports[0],
                "valuation":   analyst_reports[1],
                "sentiment":   analyst_reports[2],
                "technical":   analyst_reports[3],
                "peer":        analyst_reports[4],
                "bull":        bull,
                "bear":        bear,
                "risk":        risk,
            }
            final = await final_decision_agent(ticker, stock_data, all_reports)

            yield evt(
                "complete",
                result={
                    "ticker": ticker,
                    "stock_data": stock_data,
                    "reports": all_reports,
                    "final": final,
                },
            )

        except Exception as exc:
            yield evt("error", message=str(exc))

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@app.get("/health")
async def health():
    return {"status": "ok", "time": datetime.now().isoformat()}
