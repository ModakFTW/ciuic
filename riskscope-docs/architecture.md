# architecture.md

## 1. System overview
```
React (Vite, TS, Tailwind, Recharts)  --HTTP/JSON-->  FastAPI (api/)
                                                         |
                                          engine/  (pure functions, no I/O)
                                                         |
                                          data/  (cache-first loader, FX, align)
                                                         |
                          data/cache/prices.parquet (committed)  <-- yfinance (refresh / live prices only)
```
- Run locally: `uvicorn api.main:app --port 8000` and `npm run dev` (port 5173). No deployment.
- `engine/` takes DataFrames and returns dicts. `data/` does I/O. `api/` validates and glues.

## 2. Folder structure and ownership
```
riskscope/
  README.md  AGENTS.md  contract.md (= section 6 below)
  api/                      # Hardik (glue), JJ (analyze/allocate/scenario routers)
    main.py  schemas.py  errors.py
    routers/{meta,analyze,allocate,simulate,benchmark,track,compare,shield,scenario,brief}.py
  data/                     # Hardik
    loader.py   (load_prices, latest_prices, to_currency)
    universe.json (ticker,name,sector,market,currency,asset_class)
    presets.json  cache/prices.parquet  cache/meta.json
    scripts/fetch_data.py  scripts/validate_tickers.py
  engine/
    metrics.py  simulate.py  cppi.py  compare.py  track.py   # Hardik
    features.py  optimize.py  scenario.py                    # JJ
    ml/{build_dataset,train,predict,explain}.py              # JJ
    ml/models/risk_clf.joblib  ml/models/eval.json           # JJ
  web/                      # Harsh
    src/api/{client.ts,types.ts}  src/state/PortfolioContext.tsx
    src/pages/{Build,Risk,Recommend,Simulate,Track,Strategies,Stress}.tsx
    src/components/{MetricCard,GrowthChart,RiskBars,Heatmap,Scatter,ShieldPanel,Disclaimer,DataBadge}.tsx
    public/mocks/*.json
  tests/                    # Hardik
```
Rule: nobody edits another person's folder. Ask in chat.

## 3. Data plan
**Universe (36 assets, validate in first 15 min):**
- India stocks (16, `.NS`): RELIANCE, TCS, HDFCBANK, INFY, ICICIBANK, ITC, SBIN, BHARTIARTL, LT, HINDUNILVR, SUNPHARMA, MARUTI, BAJFINANCE, KOTAKBANK, ASIANPAINT, TITAN.
- India ETFs (2): GOLDBEES.NS, NIFTYBEES.NS.
- US stocks (14): AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA, JPM, JNJ, XOM, KO, WMT, PG, V.
- US ETFs (4): QQQ, SPY, TLT, GLD.
- Benchmarks and helpers: `^NSEI`, `^NDX`, `^GSPC`, `USDINR=X`, `^VIX`, `^INDIAVIX`.

**Loader rules:** daily adjusted close from 2012-01-01. USD assets convert with the daily `USDINR=X` series when currency is INR (and the reverse for USD). Union dates, forward-fill up to 3 days, drop remaining NaN rows. Every result carries `data_source` and `as_of`.
**Offline:** `load_prices` reads parquet. `latest_prices` tries live (5s timeout) and falls back to the last cached close. The cache is committed to git, so a fresh clone works offline.
**Presets** (`presets.json`): `tech_heavy` (NVDA, TSLA, RELIANCE, TCS, HDFCBANK, GOLDBEES, Rs 10L, High), `balanced_india`, `global_mix`.

## 4. ML design (JJ)
**Task:** predict forward 126-trading-day risk class of a fixed-weight portfolio.

**Features** (past 252 trading days ending at t): vol_252, vol_63, vol_ratio, ann_return, max_dd, current_dd, sharpe, sortino, cvar95, avg_corr, diversification_ratio, hhi, top_weight, top_rc_share, beta_blend (vs 0.5 NSEI + 0.5 NDX in INR), equity_share, n_assets, bench_vol_63.

**Label:** `score = 0.5*fwd_vol/0.18 + 0.5*abs(fwd_mdd)/0.18` over the next 126 days; cut-points at train terciles; classes Low/Medium/High.

**Dataset:** start dates every 21 trading days from 2013, 30 random portfolios per date (5-10 assets, Dirichlet alpha 1.0 and 0.5, some gold/bond-forced mixes). About 6-7k rows.

**Split:** train starts < 2022-06-30, purge 126 days, test starts >= 2023-01-01.

**Models:** HistGradientBoosting + calibration (primary), logistic regression, majority-class, persistence baseline. Metrics: macro-F1, accuracy, confusion matrix, off-by-two rate, median fwd vol per class. Saved to `ml/models/eval.json`, served by `/api/model/info`.

**Explain:** SHAP TreeExplainer top 5, rendered into templates such as "Average correlation 0.71 pushes the risk toward High." Fallback: permutation importance.

**Outputs of `predict_risk`:** label, probs, `risk_score = round(100*(0.5*p_med + p_high))`, confidence = max prob.

**Time-box:** ML pipeline done by T+2:30. If the model does not beat persistence by T+2:45, ship it anyway and present the comparison honestly.

## 5. Engine algorithms
- **Metrics (Hardik):** log or simple daily returns (use simple), `ann_return = (1+total)^(252/n)-1`, `vol = std*sqrt(252)`, `mdd` from cumulative max, `sharpe = (ann_return - rf)/vol`, `sortino` with downside deviation, `cvar95`, `risk_contribution_i = w_i*(Sigma w)_i / sigma_p^2` (sums to 1), `diversification_ratio = sum(w_i*sigma_i)/sigma_p`, `hhi = sum(w^2)`.
- **Simulate (Hardik):** growth indexed to `amount`; rebalance none/monthly/quarterly; no look-ahead; drawdown series returned.
- **Optimize (JJ):** Ledoit-Wolf covariance, shrunk mu, SLSQP, constraints sum(w)=1, 0<=w<=cap. Low = min-variance cap 30%. Medium = max Sharpe with vol <= 18%, cap 35%. High = max Sharpe, cap 50%. 25 frontier candidates, each classified by the model; choose max-Sharpe among those whose predicted class <= requested level (High unrestricted). Fallback: nearest candidate plus a note. Rationale per asset is a template using correlation to portfolio, vol and risk contribution.
- **Counterfactual "Make it Medium" (JJ):** among frontier candidates labelled one level lower, pick the one with the smallest L1 distance to current weights.
- **CPPI shield (Hardik):** `F0 = A*(1+floor)`, floor grows at rf. `cushion = V - F_t`, `risky_share = min(1, m*cushion/V)`, daily update; the risky sleeve returns the original portfolio's (monthly-rebalanced) return, the safe sleeve earns rf. Outputs: series (unprotected, insured, floor), risky_share, cost (`return_drag_ann`, `premium_equivalent_pct` = return_drag_ann), benefit (mdd both, `loss_avoided = A*(|mdd_unprot| - |mdd_ins|)`), `floor_breached`. Default multiplier by ML label: Low 4, Medium 3, High 2.
- **Compare (Hardik):** five strategies through the same metrics. Recommended uses JJ's optimizer on the 3 years *before* `period.start`. Equal-weight over the same tickers. Insured = CPPI(original). Benchmark per `benchmark` or auto.
- **Track (Hardik):** positions from quantity and buy price, latest price (live or cache), value, P&L, weights, risk label via `predict_risk`, benchmark overlay over the chosen lookback.
- **Scenario (JJ):** shocks per decision D53; replay windows covid_2020 and bear_2022 use actual returns; assets lacking data in the window are renormalized and flagged.

## 6. API contract v2 (FROZEN at T+0:30)
Conventions (from v1, kept): base `/api`, JSON, `snake_case`, ratios as decimals, ISO dates, parallel-array series `{dates, series{name:[...]}}`, `explanations: string[]` ready to render, growth series indexed to the start amount.

**New in v2:** every success response includes
```jsonc
"meta": { "data_source": "live" | "cache", "as_of": "2026-10-09" }
```
Errors unchanged: `{error:{code,message,tickers?}}` with codes `UNKNOWN_TICKER, INSUFFICIENT_HISTORY, INVALID_WEIGHTS, INVALID_PERIOD, DATA_UNAVAILABLE, INTERNAL`.

**Shared types**
```jsonc
RiskLevel = "low"|"medium"|"high"      RiskLabel = "Low"|"Medium"|"High"
Benchmark = "NIFTY50"|"NASDAQ100"|"auto"   Currency = "INR"|"USD"
Scenario  = "market_crash"|"market_recovery"|"high_volatility"|"sector_downturn"
Holding   = {ticker, amount}           PositionIn = {ticker, quantity, buy_price}
Period    = {start,end} | {preset:"1y"|"3y"|"5y"|"max"}     // default {preset:"3y"}
Metrics   = {total_return, ann_return, volatility, max_drawdown, sharpe, sortino,
             diversification_ratio, cvar_95, avg_correlation, hhi}
```

**Endpoints**
```
GET  /api/health         -> {status, model_version, meta}
GET  /api/assets/search?q=  -> {results:[{ticker,name,sector,market,currency}]}
GET  /api/presets        -> {presets:[{id,name,risk_level,currency,holdings:[Holding]}]}
GET  /api/regimes        -> {regimes:[{id,label,start,end}]}   // bull_2021, bear_2022, covid_2020, recovery_2023
GET  /api/model/info     -> {trained_on, n_samples, label_definition, cutpoints, test_period,
                             metrics:{model,logreg,persistence,majority}, // each {macro_f1,accuracy,off_by_two}
                             confusion_matrix:[[...]], median_fwd_vol:{Low,Medium,High}}
GET  /api/prices/live?tickers=  -> {prices:[{ticker,price,day_change,currency}], meta}

POST /api/analyze   in : {holdings, risk_level, period, currency}
                    out: {risk_label, risk_score, confidence, probs:{Low,Medium,High}, metrics, weights,
                          asset_stats:[{ticker,weight,ann_return,volatility,max_drawdown,
                                        risk_contribution,return_contribution}],
                          correlation:{tickers,matrix}, sector_exposure,
                          risk_drivers:[{factor,impact,direction}], explanations,
                          counterfactual:{target_label,weights,predicted_label}|null, meta}

POST /api/allocate  in : {tickers, amount, risk_level, period, currency, current_weights?}
                    out: {method, recommended:[{ticker,weight,amount,rationale}],
                          current_vs_recommended:[{ticker,current,recommended}],
                          before:Metrics, after:Metrics,
                          predicted_risk_after:{label,probs},
                          tradeoff:{return_change,volatility_change,drawdown_change},
                          efficient_frontier:[{volatility,ann_return,label}],
                          capacity_note?:string, explanations, meta}

POST /api/simulate  in : {weights, amount, period, rebalance:"none"|"monthly"|"quarterly", currency}
                    out: {metrics, final_value, dates, series:{portfolio}, drawdown, explanations, meta}

POST /api/benchmark in : {weights, amount, benchmark, period, currency}
                    out: {portfolio:Metrics, benchmark:Metrics, dates, series:{portfolio,benchmark},
                          drawdown:{portfolio,benchmark}, alpha, beta, excess_return,
                          verdict:"outperforming"|"underperforming"|"in_line", explanations, meta}

POST /api/track     in : {positions:[PositionIn], benchmark, lookback:"1m"|"6m"|"1y"|"3y", currency}
                    out: {positions:[{ticker,price,value,pnl,pnl_pct,weight,day_change}],
                          total_value, total_cost, total_pnl, total_pnl_pct,
                          risk:{label,score,probs}, allocation:{ticker:weight}, sector_exposure,
                          benchmark:{ticker, dates, series:{portfolio,benchmark},
                                     portfolio:Metrics, benchmark_metrics:Metrics, verdict},
                          explanations, meta}

POST /api/compare   in : {holdings, risk_level, benchmark, period, shield_floor, currency}
                    out: {dates, series:{original,recommended,equal_weight,insured,benchmark},
                          metrics:{...same keys}, weights:{original,recommended,equal_weight},
                          risk_labels:{...same keys}, best_by:{total_return,volatility,max_drawdown,sharpe},
                          note:"Recommended allocation optimized only on data before period.start",
                          explanations, meta}

POST /api/shield    in : {weights, amount, floor, multiplier?, period}   // multiplier default from ML label
                    out: {method:"cppi", multiplier_used, floor_value_start, dates,
                          series:{unprotected,insured,floor}, risky_share,
                          cost:{return_drag_ann,premium_equivalent_pct},
                          benefit:{max_drawdown_unprotected,max_drawdown_insured,loss_avoided},
                          floor_breached, explanations, meta}

POST /api/scenario  in : {weights, amount, scenario, magnitude?, sector?, replay?:"covid_2020"|"bear_2022"|null}
                    out: {scenario, value_before, value_after, impact_pct, metrics_after,
                          risk_label_before, risk_label_after, asset_impacts:[{ticker,impact_pct}],
                          mc?:{p5,p50,p95}, explanations, meta}

POST /api/brief     in : {tickers, risk_label}            // COULD
                    out: {sentiment, sector_trends:[{sector,view,note}], risks, headlines_used,
                          disclaimer, meta}
```
Validation: 2-15 assets, tickers in whitelist, weights sum to 1 (backend normalizes amounts), amount > 0.

## 7. Frontend architecture (Harsh)
- `PortfolioContext`: holdings, risk_level, amount, currency, period, benchmark. Persisted in localStorage. Changes debounced 400ms, then refetch `/analyze` and `/allocate` (B1).
- `api/client.ts`: one function per endpoint. `VITE_MOCK=1` returns `public/mocks/*.json`.
- TanStack Query for loading and error states; error toast shows `error.message` verbatim.
- Palette: dark, one accent. Risk colors Low green, Medium amber, High red (also use labels and icons, not color alone).

## 8. Testing and robustness (Hardik)
- `tests/test_metrics.py` (toy 2-asset case), `test_simulate_no_lookahead.py`, `test_cppi.py` (never exceeds 100% risky, floor logic), `test_contract.py` (every endpoint validates against pydantic schemas using preset portfolios), `test_offline.py` (network blocked, endpoints still work).
- Demo checklist in `tasks.md`: three portfolios (concentrated, diversified, mixed INR/USD).

## 9. Security and privacy
Whitelist tickers, pydantic validation, CORS only `http://localhost:5173`, no server-side persistence of holdings, no secrets in repo (LLM key for `/brief` in `.env`, git-ignored).
