# docs/integration-report.md

**Date:** 2026-10-11 (T+1:00 equivalent)  
**Author:** Hardik (K)  
**Cache:** data/cache/prices.parquet — 3857 rows × 42 tickers (2012-01-01 to 2026-10-09)  
**Test portfolio:** tech_heavy preset (NVDA 35%, TSLA 25%, RELIANCE.NS 20%, TCS.NS 10%, HDFCBANK.NS 10%), Rs 10,00,000, INR

---

## Endpoint Pass/Fail Table

| Endpoint | Status | HTTP | meta? | Notes |
|----------|--------|------|-------|-------|
| GET /api/health | ✅ PASS | 200 | ✅ | model_version, status=ok |
| GET /api/assets/search | ✅ PASS | 200 | ✅ | Fixed: meta was missing in first version |
| GET /api/presets | ✅ PASS | 200 | ✅ | Returns tech_heavy, balanced_india, global_mix |
| GET /api/regimes | ✅ PASS | 200 | ✅ | 4 regime records |
| GET /api/model/info | ✅ PASS | 200 | ✅ | Stub (eval.json not yet trained by JJ) |
| GET /api/prices/live | ✅ PASS | 200 | ✅ | Falls back to cache if yfinance offline |
| POST /api/simulate | ✅ PASS | 200 | ✅ | 3y, monthly rebalance, returns series |
| POST /api/benchmark | ✅ PASS | 200 | ✅ | alpha, beta, verdict computed |
| POST /api/shield | ✅ PASS | 200 | ✅ | CPPI floor, risky_share series |
| POST /api/compare | ✅ PASS | 200 | ✅ | 5 strategies, metrics, best_by |
| POST /api/track | ✅ PASS | 200 | ✅ | P&L, allocation, benchmark overlay |
| POST /api/analyze | ⏳ PENDING JJ | — | — | JJ's router not yet merged |
| POST /api/allocate | ⏳ PENDING JJ | — | — | JJ's router not yet merged |
| POST /api/scenario | ⏳ PENDING JJ | — | — | JJ's router not yet merged |

**Hardik endpoints: 11/11 PASS (100%)**  
**JJ endpoints: 3/3 PENDING (expected at T+2:30)**

---

## Offline Path Verification

1. Cache present: `data/cache/prices.parquet` (1.1 MB, 42 tickers)
2. `data/cache/meta.json` has `as_of: 2026-10-09`
3. Blocked yfinance: `load_prices()` reads parquet — ✅ verified in `test_offline.py`
4. All 33 unit tests pass with network patched out
5. Every response includes `meta.data_source: "cache"` when offline

---

## Issues Found and Resolved

| Issue | Fix | Status |
|-------|-----|--------|
| `GET /assets/search` missing `meta` field | Added `meta: get_meta()` to response | ✅ Fixed |
| `data/scripts/copy_mocks.py` wrong ROOT path | Changed `parent.parent` → `parents[2]` | ✅ Fixed |

---

## Handoff to JJ

The following items are needed from JJ's `engine/` work for full integration:
- `engine/ml/predict.py` → `predict_risk(weights, prices)` used by `/track`, `/compare`, `/shield`
- `engine/optimize.py` → `optimize_weights(tickers, prices, risk_level, currency)` used by `/compare`

Until these land, the code gracefully falls back:
- `/track` → risk label returns `"N/A"` with uniform probs
- `/compare` → recommended strategy uses equal-weight and notes it in `meta`
- `/shield` → multiplier defaults to 3.0 (Medium)

See `docs/handoff.md` for formal handoff requests.

---

## K-10 Test Portfolios

| Portfolio | Tickers | Verdict |
|-----------|---------|---------|
| Concentrated (tech heavy) | NVDA 35%, TSLA 25%, RELIANCE 20%, TCS 10%, HDFC 10% | ✅ All endpoints 200 |
| Diversified | RELIANCE 15%, TCS 15%, HDFC 15%, INFY 10%, GOLDBEES 20%, NIFTYBEES 25% | ✅ All endpoints 200 |
| Mixed INR/USD | AAPL 15%, MSFT 15%, RELIANCE 15%, TCS 15%, GLD 10%, SPY 30% | ✅ All endpoints 200 |

FX conversion (USDINR=X) working correctly for all mixed portfolios.
