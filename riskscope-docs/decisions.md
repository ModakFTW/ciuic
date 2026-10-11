# decisions.md: LOCKED. Do not reopen without all 3 agreeing in chat.

Project: **RiskScope** (FinTech: Investment Risk Prediction). Team: Harsh, JJ, Hardik. Budget: 6h total.
Anything marked LOCKED is final. Changes get a line in the changelog at the bottom.

## A. Team and process
| ID | Decision | Why |
|---|---|---|
| D01 | **Harsh** = `web/` + pitch + PPT. **JJ** = `engine/ml/`, `engine/optimize.py`, `/analyze`, `/allocate`, `/scenario`. **Hardik** = `data/`, `engine/metrics.py`, `simulate.py`, `cppi.py`, `compare.py`, `/track`, `/simulate`, `/benchmark`, `/compare`, `/shield`, tests, security, integration. | The other team's plan makes one "Engine lead" own metrics, ML, allocation, CPPI, compare, scenarios, integration and pitch. That is a bottleneck. Harsh owns UI and pitch. |
| D02 | Contract freeze at **T+0:30**. Integration checkpoint **T+3:00**. Feature freeze **T+4:30**. PPT + rehearsal **T+4:30 to T+6:00**. | Gives 90 min for PPT and demo practice. |
| D03 | Pure-function core: `engine/` does no I/O (no yfinance, no HTTP, no files). `data/` does all I/O. `api/` is a thin glue layer. | Parallel work from minute 20 using CSV or synthetic prices. |
| D04 | Frontend never computes finance numbers and never writes explanation text. It renders `explanations[]` verbatim. | One source of truth, fewer bugs. |
| D05 | Cut order if behind: (1) `/brief` GenAI, (2) efficient-frontier scatter, (3) sector_downturn scenario, (4) counterfactual "Make it Medium", (5) live auto-refresh, (6) historical replay. **Never cut R1-R6 or CPPI shield.** | Protects the judge's checklist. |

## B. Product scope
| ID | Decision | Why |
|---|---|---|
| D10 | **"Insurance" = Drawdown Shield (CPPI floor)**, a simulated product, shown as the 5th strategy line `insured`. | The PS has no insurance section, so this is our reading. CPPI is backtestable on real data and fits R6. |
| D11 | Insured strategy = **CPPI applied to the original portfolio**, floor default **-15%**, multiplier default by ML label: **Low 4, Medium 3, High 2** (slider overrides, range 1-5). Safe asset = cash at the risk-free rate. No leverage (risky share capped at 100%). | Same holdings with and without a floor makes a clean story. Higher-risk portfolios get a lower multiplier to limit gap risk. |
| D12 | **CUT:** Black-Scholes protective put and personal "risk-capacity" questionnaire. | Theoretical or off-PS. Fewer surfaces to break. |
| D13 | Auth, accounts, database: **CUT**. Holdings live in browser `localStorage` only. | Privacy story plus zero setup. |
| D14 | Brownie points targeted: **B1, B2, B3, B5 = SHOULD** (built), **B4 = COULD** (cut first). | B1/B3/B5 reuse the optimizer and classifier. |
| D15 | Disclaimer on every page and one slide: "Educational simulation. Not financial advice. CPPI shield is simulated, not a real insurance policy." | FinTech judges check this. |

## C. Data
| ID | Decision | Why |
|---|---|---|
| D20 | Base currency **INR** by default, toggle to **USD**. USD assets are converted using the **daily USDINR=X series** (not one fixed rate). | Prevents the classic wrong-returns mistake. |
| D21 | Risk-free rate: **6.5% INR, 4% USD**. | Matches the teammates' doc and is configurable. |
| D22 | Calendars: union of dates, forward-fill up to 3 days, then drop rows with any NaN. | NSE and NASDAQ holidays differ. |
| D23 | Universe is **36 assets** plus indices (list in `architecture.md`). Fetched once from **2012-01-01**, committed as `data/cache/prices.parquet`. | Enough for ML training, small enough to fetch fast. |
| D24 | **Cache-first.** Live yfinance is used only for `/prices/live` (5s timeout) and an optional refresh. Every response carries `meta.data_source` ("live"/"cache") and `meta.as_of`. | Demo survives dead wifi. |
| D25 | Benchmarks: `NIFTY50` to `^NSEI`, `NASDAQ100` to `^NDX`. `"auto"` picks by India-vs-US weight share. Benchmarks are converted to the display currency like assets. | Same-period, same-currency comparison. |
| D26 | Defaults: period `3y`, rebalance `monthly`, min 2 and max 15 assets, weights normalized to sum 1. | Their v1 contract, kept. |
| D27 | Run `scripts/validate_tickers.py` in the first 15 minutes. Any ticker with empty data or under 3 years of history is dropped from `universe.json`. Symbols in the docs were written from memory. | Avoids a late surprise. |

## D. ML (the part judges grill)
| ID | Decision | Why |
|---|---|---|
| D30 | **What is ML:** a classifier predicting a portfolio's **forward 126-trading-day risk class** (Low/Medium/High). **What is classical:** covariance, optimizer, risk contribution, metrics, CPPI. We say this out loud. | Honesty is defensible. |
| D31 | Features use only the **past 252 trading days** ending at t. Label uses only the **next 126 days** with weights held fixed. | No leakage, and the label is not a formula of the features. |
| D32 | Label score = `0.5*fwd_vol/0.18 + 0.5*abs(fwd_max_drawdown)/0.18`. Cut-points are the **33rd and 66th percentiles on TRAIN only**, frozen. | Balanced classes, no test peeking. |
| D33 | Training samples: every 21 trading days from 2013, 30 random portfolios per date (5-10 assets, Dirichlet alpha mix of 1.0 and 0.5, some forced gold/bond mixes). Weights sampled in INR-converted prices. | About 6-7k rows. |
| D34 | Split: train windows starting **< 2022-06-30**, purge 126 days, test windows starting **>= 2023-01-01**. Walk-forward, never random. | Test includes the 2025 shock. |
| D35 | Model: `HistGradientBoostingClassifier` + `CalibratedClassifierCV`. Compare against logistic regression, majority-class and **persistence baseline** (score computed on the lookback window). Report macro-F1, accuracy, confusion matrix, off-by-two rate. If it only modestly beats persistence, we say so and pitch calibration plus explainability. | Honest evaluation beats a suspicious 99%. |
| D36 | Explanation: `shap.TreeExplainer` top-5 drivers turned into English templates. Fallback: permutation importance. Per-asset risk contribution `RC_i = w_i*(Sigma w)_i / sigma_p`. | Meets R2. |
| D37 | `risk_score` (0-100) = `round(100*(0.5*p_medium + 1.0*p_high))`. `confidence` = max class probability. | Smooth score from the calibrated probabilities. |
| D38 | Beta feature uses a fixed blended benchmark (0.5 NSEI + 0.5 NDX, INR-converted) in both training and inference. | Keeps train and inference consistent. |
| D39 | Optimizer: Ledoit-Wolf covariance, expected return = 0.5*historical + 0.5*universe mean, SLSQP. Low = min-variance cap 30%. Medium = max Sharpe with vol <= 18%, cap 35%. High = max Sharpe, cap 50%. ~25 frontier candidates are labelled by the classifier ("ML gate"); we pick max-Sharpe among those whose predicted class is <= the requested level (High: unrestricted). If none qualifies, fall back to the nearest and say so. | Ties ML to the recommendation. |
| D40 | `/compare` recommended allocation is optimized **only on data before `period.start`** (look-back 3y), then evaluated over the period. | No look-ahead. |

## E. Stack and contract
| ID | Decision | Why |
|---|---|---|
| D50 | Backend: Python 3.11, FastAPI, pandas, numpy, scipy, scikit-learn, shap, yfinance, pyarrow, pydantic, pytest. Frontend: Vite + React + TypeScript + Tailwind + Recharts + TanStack Query. Local only, no deployment. | Fast for AI-assisted coding. Deployment adds risk with no payoff. |
| D51 | Contract: the teammates' v1 conventions (decimals, parallel-array series, `explanations[]`, typed error codes) **plus** v2 changes: `meta{data_source,as_of}` on every response, `/api/track` with quantity and buy price, `/api/model/info`, `/api/health`, `/api/regimes`, `predicted_risk_after` on `/allocate`. Full text in `architecture.md`. | Fixes v1 gaps. |
| D52 | Historical replay windows: **covid_2020** (2020-02-19 to 2020-03-23) and **bear_2022** (2022-01-03 to 2022-10-12). **2008 dropped** because our data starts 2012. Regime presets also include bull_2021 and recovery_2023. | Data availability. |
| D53 | Scenario shocks: asset shock = clip(beta_i, 0.2, 2.0) * magnitude. `sector_downturn`: sector assets take the full magnitude, others take 0.25*beta*magnitude. `high_volatility`: covariance x2 plus 1,000 Monte Carlo 6-month paths (p5/p50/p95). "After" label = classifier re-run on a stressed window. | Simple and explainable. |
| D54 | Security: ticker whitelist from `universe.json`, pydantic validation, CORS locked to `http://localhost:5173`, nothing persisted server-side. | Answers the privacy question. |

## F. Reconciliation with the teammates' docs
| Item | Taken | Rejected |
|---|---|---|
| Contract conventions, `/presets`, `/assets/search`, `explanations[]`, error codes | Yes | |
| CPPI Drawdown Shield and 5-strategy compare | Yes | |
| Folder ownership table, pure-function engine | Yes | |
| "Label with composite score, train RF to predict it" | | **Rejected** (circular). Replaced by D31-D35. |
| 20-ticker cache | | Replaced by D23. |
| Single FX rate | | Replaced by D20. |
| Engine lead owns everything incl. pitch | | Replaced by D01. |
| Freeze at 5:00 | | Moved to 4:30 (D02). |
| 2008 replay | | Dropped (D52). |

## Changelog
- v1 (T+0:00): all decisions locked by Claude on request ("lock things out by yourself").
