# agents.md: instructions for the Cursor agents

Put the "Shared rules" block into the repo root as `AGENTS.md` (or `.cursor/rules/riskscope.mdc`). Each person pastes their own role prompt into Cursor. Read `decisions.md`, `architecture.md` (contract in section 6) and `tasks.md` first; they are the source of truth.

## Shared rules (every agent, every session)
1. The contract in `architecture.md` section 6 is frozen after T+0:30. Follow it exactly. If a field cannot be produced or is missing, **stop and tell the human**; never invent fields.
2. Stay in your own folder. Never edit another person's folder. Ask in chat.
3. `engine/` is pure functions: no network, no files, no global state. Only `data/` does I/O.
4. No leakage: features use only data up to t; labels use only data after t; never random-split time series.
5. The frontend never computes finance numbers and never writes explanation text.
6. Every response includes `meta{data_source,as_of}` and `explanations[]`.
7. Keep functions small with docstrings that include one example input and output, so teammates can call them.
8. Small commits, pull before push, message format `area: what`. Do not commit `.env`.
9. Each feature ships with a test or a mock JSON. Run `pytest` (backend) or `npm run build` (frontend) before pushing.
10. Feature freeze at T+4:30: bug fixes only after that.
11. Disclaimer text from `prd.md` section 12 appears on every page.

## Agent: Harsh (frontend + pitch)
```
You are building the frontend of RiskScope for a 6-hour hackathon.
Stack: Vite + React + TypeScript + Tailwind + Recharts + TanStack Query. Folder: web/ only.
Read: decisions.md, architecture.md (section 6 contract, section 7 frontend), tasks.md, prd.md.

SCAFFOLD FIRST (about 20 min):
- Vite app, Tailwind, TanStack Query, sidebar layout, Disclaimer footer, DataBadge in header (shows meta.data_source and meta.as_of).
- src/api/types.ts from the contract. src/api/client.ts with one function per endpoint; if VITE_MOCK=1 return public/mocks/*.json, else call http://localhost:8000/api.
- src/state/PortfolioContext.tsx (holdings, risk_level, amount, currency, period, benchmark), persisted in localStorage, debounced 400ms refetch of /analyze and /allocate.
- Write your own mock JSON in public/mocks/ from the contract until Hardik's mocks land.

PAGES IN PRIORITY ORDER:
1. Build (R1): search /assets/search, amount or % toggle, Low/Medium/High selector, period, "Load demo portfolio" from /presets.
2. Risk (R2, the money screen): badge, risk_score, confidence, probability bars, metric cards, explanations[], risk-contribution bars per asset, risk_drivers, "Make it Medium" button using counterfactual.weights (before/after allocation).
3. Recommend (R3, B5, B2): asset table (asset_stats), correlation heatmap (CSS grid), current vs recommended bars, rationale per asset, tradeoff text, scatter (efficient_frontier points coloured by label).
4. Simulate (R4): date range, regime chips from /regimes, rebalance select, growth chart, drawdown chart, metrics table.
5. Track (R5): positions table, allocation donut, risk badge, benchmark overlay, metrics comparison, verdict.
6. Strategies (R6): five-line chart (original, recommended, equal_weight, insured, benchmark), metrics table with best_by highlighted, risk_labels, Shield slider (floor -5% to -30%, multiplier 1-5) calling /shield.
7. Stress (B3): scenario buttons, magnitude slider, before/after cards, per-asset impact bars, replay buttons.
Every chart has title and axes. Every number has a unit. Skeleton loaders and error toasts (error.message verbatim). No lorem ipsum.

ALSO OWN: PPT (10 slides in prd.md section 11) and the demo script (prd.md section 8).
```

## Agent: JJ (ML + optimizer)
```
You are building the ML and optimization core of RiskScope in Python 3.11
(pandas, numpy, scipy, scikit-learn, shap, FastAPI, pydantic). Folders: engine/features.py, engine/optimize.py, engine/scenario.py, engine/ml/, and routers api/routers/{analyze,allocate,scenario}.py.
Read: decisions.md (section D), architecture.md sections 4-6, tasks.md.
Prices come from data/loader.py (Hardik): load_prices(tickers, start, end, currency) -> aligned DataFrame. Until it lands use data/cache snapshot or synthetic prices.
metrics functions come from engine/metrics.py (Hardik). Until they land write minimal local versions behind the same names.

PRIORITY ORDER:
1. engine/features.py: portfolio_features(weights, prices, t) using ONLY the 252 trading days up to t (list in architecture.md section 4).
2. engine/ml/build_dataset.py: every 21 trading days from 2013, 30 random portfolios per date; features from the past, label from the NEXT 126 days with fixed weights; score = 0.5*fwd_vol/0.18 + 0.5*abs(fwd_mdd)/0.18; cut-points from the TRAIN percentiles (33rd, 66th) only.
3. engine/ml/train.py: walk-forward split (train starts < 2022-06-30, 126-day purge, test starts >= 2023-01-01). HistGradientBoostingClassifier + CalibratedClassifierCV; baselines: logistic regression, majority, persistence. Save engine/ml/models/risk_clf.joblib and eval.json (macro_f1, accuracy, confusion_matrix, off_by_two, median_fwd_vol per class, cutpoints). Print a table for the slide.
4. engine/ml/predict.py + explain.py: predict_risk(weights, prices) -> {label, probs, risk_score, confidence}; explain via shap.TreeExplainer (fallback permutation importance) -> top 5 factors + English templates.
5. engine/optimize.py: Ledoit-Wolf covariance, mu = 0.5*hist + 0.5*universe mean, SLSQP; Low = min-variance cap 30%; Medium = max Sharpe vol<=18% cap 35%; High = max Sharpe cap 50%; 25 frontier candidates classified by the model; ML gate per decision D39; per-asset rationale strings; tradeoff dict; counterfactual (nearest candidate one level lower by L1 distance).
6. Routers: POST /api/analyze, POST /api/allocate; GET /api/model/info (serve eval.json).
7. engine/scenario.py + POST /api/scenario per decision D53 and D52.
8. Only if time remains: /api/brief (LLM call over cached headlines, labelled supplementary).
Rules: no leakage, no random train/test split, return pydantic-valid output, explanations[] in plain English, tell me immediately if a contract field cannot be produced. Add pytest tests for features (no future data used) and the optimizer (weights sum to 1, caps respected).
```

## Agent: Hardik (data, simulation, CPPI, integration, tests)
```
You are building the data layer, simulation, shield, tracking, API glue and tests of RiskScope (Python 3.11, FastAPI, pandas, yfinance, pyarrow, pytest). Folders: data/, api/ (main, schemas, errors, routers meta/simulate/benchmark/track/compare/shield), engine/metrics.py, simulate.py, cppi.py, compare.py, track.py, tests/.
Read: decisions.md, architecture.md (sections 3, 5, 6, 8, 9), tasks.md.

SCAFFOLD FIRST (first 20 min, this unblocks everyone):
- FastAPI app, CORS only http://localhost:5173, pydantic schemas from the contract, and hardcoded mock JSON returned by EVERY endpoint so Harsh can start. Also write the same files to web/public/mocks/ via a copy script (do not edit web/ by hand).
- data/scripts/fetch_data.py: download adjusted closes since 2012 for universe.json + ^NSEI ^NDX ^GSPC USDINR=X ^VIX ^INDIAVIX; save data/cache/prices.parquet and meta.json (as_of). Commit the cache.
- data/scripts/validate_tickers.py: drop tickers with empty data or under 3 years of history, print what was dropped.

PRIORITY ORDER:
1. data/loader.py: load_prices(tickers, start, end, currency) cache-first, daily FX conversion, forward-fill limit 3, drop NaN rows; latest_prices(tickers) with a 5s live timeout and cache fallback. Always return data_source and as_of.
2. engine/metrics.py (everything in architecture.md section 5, JJ depends on it, ship by T+1:00) and engine/simulate.py (none/monthly/quarterly rebalance, no look-ahead, drawdown series).
3. Routers: /health, /assets/search, /presets, /regimes, /prices/live, /simulate, /benchmark (alpha, beta, verdict by Sharpe comparison).
4. engine/cppi.py + /shield per decision D11 and architecture.md section 5.
5. engine/track.py + /track (quantity and buy price based P&L, auto benchmark by India/US share).
6. engine/compare.py + /compare: recommended optimized only on the 3 years BEFORE period.start using JJ's optimizer; equal-weight; insured = CPPI(original); best_by; risk_labels via JJ's predict_risk.
7. Error handling: UNKNOWN_TICKER, INSUFFICIENT_HISTORY, INVALID_WEIGHTS, INVALID_PERIOD, DATA_UNAVAILABLE; never return a stack trace.
8. Tests: metrics toy case, simulate no look-ahead, cppi rules (risky share <= 1, floor logic), contract test over every endpoint with the preset portfolios, offline test (network blocked).
9. INTEGRATION LEAD: at T+3:00 run the demo portfolio through every endpoint, list breakages, and cut or mock per the cut order in decisions.md D05.
Rules: keep engine/ I/O-free, tell me if any contract field cannot be produced, no server-side persistence of holdings.
```
