# tasks.md

Clock is relative to kickoff (T+0:00), 6 hours total. Owners: **H** = Harsh, **J** = JJ, **K** = Hardik. Tick boxes as you go.

## Gates
| Gate | Time | Condition |
|---|---|---|
| G0 | T+0:30 | Contract frozen, mocks live, repo skeleton pushed |
| G1 | T+1:00 | `load_prices` and `engine/metrics.py` available to JJ |
| G2 | T+3:00 | **Integration checkpoint:** demo portfolio flows through every endpoint and page |
| G3 | T+4:30 | **Feature freeze.** Bug fixes only |
| G4 | T+5:30 | Full dry run done, backup video recorded |

## Phase 0: T+0:00 to T+0:30 (parallel kickoff)
- [x] K-01 Repo, folders, `requirements.txt`, FastAPI skeleton, CORS, pydantic schemas, mock JSON for every endpoint, copy script to `web/public/mocks/`. *Done when:* `GET /api/presets` returns mock data.
- [x] K-02 `fetch_data.py` run once and cache committed; `validate_tickers.py` run, `universe.json` trimmed. *Done when:* parquet is in git.
- [ ] J-01 Skeleton for `engine/features.py`, `engine/ml/*` with function signatures and docstrings; synthetic price generator for early testing.
- [ ] H-01 Vite + Tailwind + TanStack Query, `types.ts` from the contract, `client.ts` with `VITE_MOCK`, app shell, Disclaimer, DataBadge.
- [x] ALL-01 Read `decisions.md` together (5 min). Confirm roles. G0 check.

## Phase 1: T+0:30 to T+1:30
- [x] K-03 `data/loader.py` (cache-first, daily FX, ffill, `latest_prices` fallback). **G1.**
- [x] K-04 `engine/metrics.py` with tests on a toy 2-asset case. *Done when:* risk contributions sum to 1.
- [x] K-05 `engine/simulate.py` + `/simulate`, `/regimes`, `/assets/search`, `/health`.
- [ ] J-02 `features.py` complete with a test that proves no data after t is used.
- [ ] J-03 `build_dataset.py` produces the training table (about 6-7k rows).
- [ ] H-02 `PortfolioContext` with localStorage and debounce. Build page (R1) on mocks.
- [ ] H-03 Risk page (R2) on mocks.

## Phase 2: T+1:30 to T+3:00
- [ ] J-04 `train.py` with walk-forward split, baselines, `eval.json`. *Time-box: done by T+2:30.*
- [ ] J-05 `predict.py` + `explain.py` (SHAP, fallback permutation). `/api/model/info`.
- [ ] J-06 `optimize.py` with ML gate, rationale strings, counterfactual. `/api/analyze`, `/api/allocate`.
- [x] K-06 `/benchmark`, `/prices/live`, `/track`.
- [x] K-07 `cppi.py` + `/shield`.
- [x] K-08 `compare.py` + `/compare` (recommended optimized only on pre-period data). Needs J-06; use equal-weight as a stand-in until it lands.
- [ ] H-04 Recommend page (table, heatmap, bars, scatter).
- [ ] H-05 Simulate page with regime chips.
- [ ] H-06 Track page.

## G2: T+3:00 Integration checkpoint (all three, 20 min)
- [ ] Run the demo portfolio through Build, Risk, Recommend, Simulate, Track, Strategies on real endpoints (`VITE_MOCK` off).
- [ ] List every break. Fix, mock, or cut using the cut order below. Decide on the spot.
- [ ] Confirm the offline path: disconnect wifi, restart backend, demo still works.

## Phase 3: T+3:00 to T+4:30
- [ ] H-07 Strategies page with five lines and Shield slider panel.
- [ ] H-08 Stress page. Polish pass: skeletons, error toasts, empty states, colors.
- [ ] J-07 `scenario.py` + `/scenario` (D52, D53).
- [ ] J-08 "Make it Medium" end to end (counterfactual response verified with Harsh).
- [ ] J-09 Eval screenshots, confusion matrix image, baseline table for the slide.
- [x] K-09 Error codes, input validation, ticker whitelist; contract test and offline test passing.
- [x] K-10 Run three test portfolios (concentrated, diversified, mixed INR/USD). Log bugs, fix or hand off.
- [ ] (COULD) J-10 `/brief` GenAI call. Skip unless everything above is green.

## G3: T+4:30 Feature freeze
Tag the repo `v-freeze`. Anything not finished is cut or shown as a mock with a "preview" tag. No new endpoints.

## Phase 4: T+4:30 to T+6:00 (PPT and demo prep)
- [ ] H-09 PPT (10 slides in `prd.md` section 11). T+4:30 to T+5:15.
- [ ] J-11 Fill ML slide numbers from `eval.json`. Prepare answers to judge Qs on ML validity, leakage, label. T+4:30 to T+5:00.
- [ ] K-11 Regenerate cache, final `git pull` on the demo laptop, run from a fresh clone to confirm offline works. T+4:30 to T+5:00.
- [ ] ALL-02 Full demo rehearsal x2 with a timer (4-5 min). T+5:15 to T+5:45. **G4.**
- [ ] K-12 Record a backup screen recording of the full demo. T+5:30.
- [ ] ALL-03 T+5:45 to T+6:00: buffer, charge laptops, second laptop with the repo, open tabs ready.

## Cut order (apply top to bottom when behind; never cut R1-R6 or CPPI Shield)
1. `/brief` GenAI (B4)
2. Efficient-frontier scatter (B2 part)
3. `sector_downturn` scenario
4. "Make it Medium" counterfactual
5. Live auto-refresh on Track
6. Historical replay (keep regime chips)
7. Stress page entirely (last resort)

## Definition of done per requirement
| Req | Done when |
|---|---|
| R1 | Build page lets you add 6 assets, set amounts or %, pick risk level, load the demo |
| R2 | Risk badge, probabilities, SHAP-based explanations and risk-contribution bars render from `/analyze` |
| R3 | Asset table, heatmap, recommended allocation with rationale and trade-off render from `/analyze` + `/allocate` |
| R4 | Simulate shows return, volatility, max drawdown, Sharpe, growth and drawdown charts across selectable periods and regime presets |
| R5 | Track shows live price, value, P&L, allocation, risk, and a benchmark overlay with same-period metrics |
| R6 | Strategies shows five lines and a metrics table with best-in-column highlight |
| B1 | Changing risk level or amount refreshes risk and recommendation without a button click |
| B2 | Scatter plus regime chips work |
| B3 | At least crash, recovery and high_volatility run with before/after cards |
| B5 | Every recommended asset has a rationale and the trade-off sentence appears |
| Shield | `/shield` and the `insured` line show floor, cost and benefit |
| ML | `eval.json` exists and the slide shows macro-F1, confusion matrix, persistence baseline |

## Demo-day checklist
- [ ] Backend and frontend start from a fresh clone with two commands each.
- [ ] Wifi off: all pages still load, the badge says "cached as of ...".
- [ ] Demo preset loads in one click and shows High, then Medium after the counterfactual.
- [ ] Backup video is on the desktop and on a phone.
- [ ] Disclaimer visible on every page and on the last slide.
