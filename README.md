# RiskScope

> **Educational simulation. Not financial advice. Past performance does not predict future results. The Drawdown Shield is a simulated strategy, not an insurance policy.**

RiskScope predicts a portfolio's **forward risk class** (Low / Medium / High) using a validated ML classifier trained on walk-forward data, explains *why* the risk is high, recommends a better allocation, and shows what a drawdown floor would have saved you.

## Quick Start (two commands each)

### Backend
```bash
# 1. Install dependencies
pip install -r requirements.txt

# 2. Start the API (cache is already committed — works offline)
uvicorn api.main:app --port 8000 --reload
```

The backend is now available at `http://localhost:8000`. The committed cache at `data/cache/prices.parquet` contains daily adjusted closes for 36 assets + 6 benchmarks from 2012-01-01 to 2026-10-09.

### Frontend
```bash
cd web
npm install
npm run dev        # starts at http://localhost:5173
```

Set `VITE_MOCK=1` in `web/.env.local` to use the committed mock JSON files without hitting the backend.

---

## Architecture

```
React (Vite, TS, Tailwind, Recharts)  ──HTTP/JSON──>  FastAPI (api/)
                                                          │
                                           engine/  (pure functions, no I/O)
                                                          │
                                           data/   (cache-first loader, FX, align)
                                                          │
                       data/cache/prices.parquet (committed)  <── yfinance (refresh only)
```

- **`engine/`** — pure Python functions; no network, no files, no global state.
- **`data/`** — all I/O: cache-first loader, daily FX conversion, live price fallback.
- **`api/`** — thin FastAPI glue layer; validates inputs, calls engine, returns JSON.

## Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/health` | Health check + model version |
| GET | `/api/assets/search?q=` | Search tradeable assets |
| GET | `/api/presets` | Demo portfolio presets |
| GET | `/api/regimes` | Market regime date ranges |
| GET | `/api/model/info` | ML model evaluation metrics |
| GET | `/api/prices/live?tickers=` | Live prices (5s timeout, cache fallback) |
| POST | `/api/analyze` | Risk classification + SHAP explanations *(JJ)* |
| POST | `/api/allocate` | Optimized allocation *(JJ)* |
| POST | `/api/simulate` | Historical portfolio simulation |
| POST | `/api/benchmark` | Alpha, beta, benchmark comparison |
| POST | `/api/track` | Live P&L tracking |
| POST | `/api/compare` | Five-strategy comparison |
| POST | `/api/shield` | CPPI Drawdown Shield simulation |
| POST | `/api/scenario` | Market scenario stress test *(JJ)* |

## Offline Mode

With no network:
- `load_prices()` reads `data/cache/prices.parquet` directly.
- `latest_prices()` falls back to last cached close.
- Every response carries `meta.data_source: "cache"` and `meta.as_of: "2026-10-09"`.

## Data Refresh

To re-download the cache (requires internet):
```bash
python data/scripts/fetch_data.py
python data/scripts/validate_tickers.py
```

## Running Tests

```bash
pytest -q          # runs all 33+ tests
```

Tests include:
- `test_metrics.py` — toy 2-asset case, risk contributions sum to 1
- `test_cppi.py` — risky share ≤ 100%, floor logic
- `test_simulate_no_lookahead.py` — no future data in simulation
- `test_contract.py` — every endpoint validates against schema
- `test_offline.py` — endpoints work with network blocked

## Demo Smoke Test

```bash
bash scripts/demo_smoke.sh     # hits every endpoint, prints OK/FAIL
```

## Copying Mocks to Frontend

```bash
python data/scripts/copy_mocks.py
```

## Team

- **Harsh** — `web/` (React frontend), PPT, pitch
- **JJ** — `engine/ml/`, `engine/optimize.py`, `/analyze`, `/allocate`, `/scenario`
- **Hardik** — `data/`, `engine/metrics.py`, `simulate.py`, `cppi.py`, `compare.py`, `/track`, `/simulate`, `/benchmark`, `/compare`, `/shield`, tests, security, integration
