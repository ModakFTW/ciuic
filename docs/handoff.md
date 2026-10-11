# docs/handoff.md  –  Requests between teammates. Append a dated line for each request.

## Format: `[DATE TIME] FROM -> TO: request`

---

[2026-10-11 11:00] K -> JJ:
  Hardik endpoints are live. JJ needs to merge the following before T+2:30:
  1. `engine/ml/predict.py` must export `predict_risk(weights: list[float], prices: pd.DataFrame) -> dict`
     with keys: `label` (str), `risk_score` (int 0-100), `confidence` (float), `probs` (dict Low/Medium/High).
     This is consumed by `/track`, `/compare`, `/shield` routers. A stub returning fixed values is fine
     temporarily — just export the function with the right signature.
  2. `engine/optimize.py` must export `optimize_weights(tickers: list[str], prices: pd.DataFrame, risk_level: str, currency: str) -> dict`
     with key: `weights` (list[float] in same order as tickers).
     Used by `/compare` for the recommended strategy.
  Until these land: /track returns risk="N/A", /compare uses equal-weight, /shield uses multiplier=3.0.

[2026-10-11 11:00] K -> Harsh:
  Mocks are in web/public/mocks/ (13 files). The real endpoints for your use:
  - GET /api/presets → load demo portfolio
  - GET /api/regimes → regime chips on Simulate
  - GET /api/assets/search?q= → asset search on Build
  - POST /api/simulate → growth + drawdown charts
  - POST /api/benchmark → benchmark overlay
  - POST /api/compare → 5-strategy Strategies page (5 lines + table)
  - POST /api/shield → Shield panel (floor, cost, benefit)
  - POST /api/track → Track page (P&L, allocation, benchmark)
  All return meta.data_source and meta.as_of. Cache is as of 2026-10-09.
  CORS is set to http://localhost:5173 only.
