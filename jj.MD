# JJ's Antigravity Instructions & Role Guidelines (ML, Optimizer, Scenarios)

## 1. Operating Instructions & Workflow
- **Prompt Sequence**: 
  - Paste Prompt 0 once at the start of the workspace.
  - Send one prompt at a time.
  - **Pytest Gate**: Do NOT send or proceed to the next prompt until `pytest` passes on the current one.
- **Rules File**: 
  - Ensure the repo's `AGENTS.md` (shared rules) is present in the workspace root so Antigravity reads it every session.
- **Code Standards**:
  - Small functions with descriptive docstrings containing at least **one example input and output**.
  - Pure functions in `engine/`: zero network calls, zero file access (except loading the saved model artifact in `ml/predict.py`).
  - Strict zero data leakage: features use only data up to $t$; labels use only data after $t$; walk-forward temporal splits only (never random-split time series).
  - Frozen contract compliance (`architecture.md` Section 6): follow schema types and fields exactly. If a contract field cannot be produced, **STOP and notify JJ/human immediately**; never invent fields.
  - Every API response must include `meta { data_source, as_of }` and `explanations[]` in plain English templates.
  - Each module ships with comprehensive `pytest` tests.

---

## 2. Ownership & Boundaries
### JJ's Scope ONLY:
- `engine/features.py`
- `engine/optimize.py`
- `engine/scenario.py`
- `engine/ml/` (`build_dataset.py`, `train.py`, `predict.py`, `explain.py`, `models/`, `eval.json`)
- `api/routers/analyze.py`
- `api/routers/allocate.py`
- `api/routers/scenario.py`
- `GET /api/model/info` (serves `eval.json`)

### FORBIDDEN Files & Directories (NEVER EDIT DIRECTLY):
- `data/` (owned by Hardik)
- `engine/metrics.py`, `simulate.py`, `cppi.py`, `compare.py`, `track.py` (owned by Hardik)
- `web/` (owned by Harsh)
- **Thin Adapter Rule**: If JJ needs anything from Hardik's or Harsh's modules before they land (or for decoupling), **write a thin local adapter inside JJ's own folders** and explicitly flag it.

---

## 3. Implementation Priority Order

1. **`engine/features.py`** (✅ Complete):
   - `portfolio_features(weights, prices, t)` using ONLY the 252 trading days up to $t$ (features listed in `architecture.md` Section 4).
   - Unit tests to prove zero look-ahead bias (no data after $t$ is used).

2. **`engine/ml/build_dataset.py`** (✅ Complete):
   - Sample every 21 trading days from 2013, 30 random portfolios per date (5-10 assets, Dirichlet $\alpha \in \{1.0, 0.5\}$, forced gold/bond mixes).
   - Features strictly from past 252 days; label computed from the next 126 trading days with fixed weights.
   - Score formula: $0.5 \times \frac{\text{fwd\_vol}}{0.18} + 0.5 \times \frac{|\text{fwd\_mdd}|}{0.18}$.
   - Cut-points: 33rd and 66th percentiles computed from the **train** split only.

3. **`engine/ml/train.py`** (✅ Complete):
   - Walk-forward split: train starts $< \text{2022-06-30}$, 126-day purge period, test starts $\ge \text{2023-01-01}$.
   - Models: `HistGradientBoostingClassifier` + `CalibratedClassifierCV`.
   - Baselines: Logistic Regression, majority class, persistence baseline (score on lookback).
   - Artifacts: Save model to `engine/ml/models/risk_clf.joblib` and metrics to `engine/ml/eval.json` (macro_f1, accuracy, confusion_matrix, off_by_two, median_fwd_vol per class, cutpoints).
   - Print summary table for presentation slide.

4. **`engine/ml/predict.py` + `explain.py`** (✅ Complete):
   - `predict_risk(weights, prices)` $\to$ `{label, probs, risk_score, confidence}` where $\text{risk\_score} = \text{round}(100 \times (0.5 \times p_{\text{med}} + p_{\text{high}}))$, $\text{confidence} = \max(\text{probs})$.
   - SHAP explanation via `shap.TreeExplainer` (fallback: permutation importance) $\to$ top 5 factors + English explanation templates.
   - Helpers: `asset_risk_contribution` ($\sum \text{RC}_i = 1.0$), `return_contribution`.

5. **`engine/optimize.py`** (✅ Complete):
   - Ledoit-Wolf covariance shrinkage; expected returns: $\mu = 0.5 \times \mu_{\text{hist}} + 0.5 \times \mu_{\text{universe\_mean}}$.
   - SLSQP optimizer: $\sum w = 1$, $0 \le w_i \le \text{cap}$.
   - Profiles:
     - **Low**: min-variance, individual asset cap 30%.
     - **Medium**: max Sharpe, volatility $\le 18\%$, individual asset cap 35%.
     - **High**: max Sharpe, individual asset cap 50%.
   - Generate 25 frontier candidates classified by the trained ML model.
   - ML gate per decision D39; per-asset rationale strings; tradeoff dictionary.
   - Counterfactual generation (nearest candidate one risk level lower by $L_1$ weight distance) for "Make it Medium".

6. **FastAPI Routers** (✅ Complete):
   - `POST /api/analyze` (metrics, asset stats, correlation matrix, sector exposure, ML predictions, risk drivers, plain-English explanations, counterfactuals, meta)
   - `POST /api/allocate` (SLSQP optimization, 25 frontier candidates, ML gate, recommended amounts & rationales, tradeoff, before/after metrics, meta)
   - `GET /api/model/info` (serves `eval.json` with model evaluation metrics and cutpoints)

7. **`engine/scenario.py` + Router** (✅ Complete):
   - `POST /api/scenario` per decisions D52 and D53 (historical replay: `covid_2020`, `bear_2022`; shocks: `market_crash`, `market_recovery`, `high_volatility` with 1,000 MC paths, `sector_downturn`).

8. **Supplementary (Time Permitting / Optional)**:
   - `POST /api/brief` (LLM synthesis over cached market headlines, explicitly labeled supplementary).

---

## 4. Quality & Testing Checklist
- [ ] Every feature and calculation runs pure in `engine/` without network or disk I/O (only reading model joblib in `predict.py`).
- [ ] All inputs and outputs conform strictly to Pydantic schemas in the frozen contract.
- [ ] Functions have docstrings with example inputs and outputs.
- [ ] Unit tests (`pytest`) verify:
  - Feature calculations contain zero future leakage.
  - Optimizer portfolio weights sum to $1.0 \pm 10^{-5}$ and adhere to asset caps.
  - Predictions and explanations match expected contract structure.

---

## Data Rules (Active)
1. **Dev prices**: Use `riskscope_synthetic/prices_inr.csv` (SYNTHETIC; 36 assets plus `^NSEI` and `^NDX`, daily, INR-converted, no NaNs). Copied to `engine/ml/dev_prices.csv`. Leave `engine/ml/synthetic.py` alone and do NOT use it.
2. **No I/O in `engine/`**: Reading CSV or parquet happens ONLY in script entrypoints (`__main__` of `build_dataset.py` and `train.py`). Both accept a `--prices` path argument (default `engine/ml/dev_prices.csv`). Switching to Hardik's `data/cache/prices.parquet` later must be a one-argument change.
3. **SYNTHETIC Marking**: Anything produced from dev data must be marked `SYNTHETIC` (add `"data_note": "SYNTHETIC"` to `eval.json`) and must not go into final deliverables. Model, `eval.json`, and slide assets will be regenerated on real parquet later.
4. **features.py Freeze**: Do not change `engine/features.py` from Prompt 2 unless a test fails.

---

## 5. Communication Rule
- **After tests pass**: Do NOT recap or summarize what was created. Log it in the work log below and move on. Save tokens.

---

## 6. Work Log

### Prompt 1 — Skeletons + Shim + Synthetic (✅ 22/22 tests passed)
- `engine/__init__.py`, `engine/ml/__init__.py`
- `engine/features.py` — skeleton, 18 features listed
- `engine/optimize.py` — skeleton, `optimize_portfolio` + `counterfactual_weights`
- `engine/scenario.py` — skeleton, replay windows + default magnitudes
- `engine/ml/build_dataset.py` — skeleton, `build_dataset` + `compute_cutpoints` + `label_scores`
- `engine/ml/train.py` — skeleton, `train_and_evaluate`
- `engine/ml/predict.py` — skeleton, `predict_risk`
- `engine/ml/explain.py` — skeleton, `explain_risk` + English templates
- `engine/ml/synthetic.py` — **working** correlated GBM with crash period
- `engine/ml/_metrics_shim.py` — **working** 9 metric functions (swap for Hardik's later)
- `tests/__init__.py`, `tests/ml/__init__.py`
- `tests/ml/test_shim.py` — 22 tests (RC sum-to-1, vol, return, mdd, sharpe, sortino, cvar, div ratio, hhi)

### Prompt 2 — features.py implementation (✅ 10/10 tests passed)
- `engine/features.py` — full impl, 18 features, 252-day window, bench/asset_classes optional args
- `tests/ml/test_features.py` — no-leakage, known weights (hhi/top_weight), NaN-free, insufficient history, equity_share

### Data Rules Setup
- Copied `riskscope_synthetic/prices_inr.csv` $\to$ `engine/ml/dev_prices.csv`.
- Documented data rules & requirements for entrypoints `--prices`.

### Prompt 3 — build_dataset.py implementation (✅ 36/36 tests passed)
- `engine/ml/build_dataset.py`:
  - `build_dataset(prices, bench, asset_class, seed=42, ...)` pure function.
  - Dates sampled every 21 trading days from `2013-01-01` (252 lookback, 126 forward).
  - 30 random portfolios per date (5-10 assets, Dirichlet $\alpha \in \{1.0, 0.5\}$, ~15% forced inclusion of safe assets `GOLDBEES.NS`, `GLD`, `TLT`).
  - 18 feature columns computed via `portfolio_features` at $t$ using only past data $\le t$.
  - RAW forward targets: `fwd_vol`, `fwd_mdd`, `score` ($0.5 \times \frac{\text{fwd\_vol}}{0.18} + 0.5 \times \frac{|\text{fwd\_mdd}|}{0.18}$), `fwd_end`.
  - Persistence baseline lookback score: `lookback_score` on last 126 days up to $t$.
  - Metadata: `t`, `weights_json`.
  - Pure functions `compute_cutpoints(scores)` and `label_scores(scores, cutpoints)` for use in `train.py`.
  - CLI entrypoint: `python -m engine.ml.build_dataset --prices engine/ml/dev_prices.csv --out engine/ml/models/dataset.parquet`.
  - Generated artifact: `engine/ml/models/dataset.parquet` (4,680 rows $\times$ 25 columns, 156 dates from 2013-01-01 to 2025-06-24, 0 NaNs).
- `tests/ml/test_build_dataset.py` (4 tests):
  - No future leakage: overwrote future prices with large noise, asserted feature columns are bitwise identical while forward targets change.
  - Validated dev_prices dataset row count (4,680) and 18 feature columns + raw targets.
  - Validated cut-points terciles and Low/Medium/High labelling.
- Total pytest suite: **36 passed in 1.23s**.

### Prompt 4 — train.py implementation (✅ 41/41 tests passed)
- `engine/ml/train.py`:
  - Temporal walk-forward split (no random splitting):
    - Train: $t < \text{2022-06-30}$ (3,540 rows, 2013-01-01 to 2022-06-02, sorted by $t$).
    - Purge window: $t \in [\text{2022-06-30}, \text{2023-01-01})$ dropped (210 rows, 126 trading days).
    - Test: $t \ge \text{2023-01-01}$ (930 rows, 2023-01-24 to 2025-06-24, sorted by $t$).
  - Frozen cut-points computed strictly on train terciles (33rd & 66th percentiles of train `score`):
    - `low_medium`: 0.7345, `medium_high`: 0.9479.
    - Zero future leakage into cutpoints.
  - Models & Baselines trained and evaluated:
    - Primary: `HistGradientBoostingClassifier` wrapped in `CalibratedClassifierCV(method="sigmoid", cv=TimeSeriesSplit(3))` on rows sorted by $t$.
    - Logistic Regression: `StandardScaler` + `LogisticRegression(max_iter=1000)`.
    - Persistence baseline: labels mapped from `lookback_score` using frozen cut-points.
    - Majority class baseline: predicts most frequent train label.
  - Metrics on Test Set ($N=930$):
    - Calibrated HistGB (Primary): Macro-F1 = 0.4827, Accuracy = 53.76%, Off-by-two = 11.83%.
    - Logistic Regression (Scaled): Macro-F1 = 0.5162, Accuracy = 52.26%, Off-by-two = 7.85%.
    - Persistence Baseline: Macro-F1 = 0.4459, Accuracy = 44.73%, Off-by-two = 12.26%.
    - Majority Baseline: Macro-F1 = 0.2067, Accuracy = 44.95%, Off-by-two = 23.01%.
  - Monotonic forward volatility ordering verified on Test:
    - Low: 14.79% | Medium: 18.43% | High: 23.22%.
  - Confusion Matrix (`["Low", "Medium", "High"]`):
    - `[[148, 23, 43], [93, 45, 160], [67, 44, 307]]`.
  - Artifacts persisted:
    - `engine/ml/models/risk_clf.joblib` (calibrated model, feature order, cutpoints, labels).
    - `engine/ml/models/eval.json` (data_note, trained_on, n_samples, label_definition, cutpoints, test_period, n_test, metrics, confusion_matrix, confusion_labels, median_fwd_vol).
    - `engine/ml/models/cutpoints.json`.
  - CLI entrypoint:
    `python -m engine.ml.train --prices engine/ml/dev_prices.csv --dataset engine/ml/models/dataset.parquet --out engine/ml/models`.
- `tests/ml/test_train.py` (5 tests):
  - `test_cutpoints_train_only`: corrupting test set scores has zero effect on cutpoints.
  - `test_no_test_leakage_in_fit`: corrupting test features/targets has zero effect on train split or cutpoints; purge window verified.
  - `test_eval_json_keys`: schema validation on `eval.json` for all keys and monotonicity of `median_fwd_vol`.
  - `test_saved_model_artifact`: `risk_clf.joblib` loads, contains model and feature order, produces valid predictions and probabilities.
  - `test_compute_metrics_helper`: unit test for `macro_f1`, `accuracy`, and `off_by_two`.
- Total pytest suite: **41 passed in 53.38s**.

### Prompt 5 — predict.py and explain.py implementation (✅ 51/51 tests passed)
- `engine/ml/predict.py`:
  - `load_model(model_path)`: lazy module-level caching `_MODEL_CACHE`, loads `risk_clf.joblib` once.
  - `predict_risk(weights, prices, bench=None, asset_class=None, ...)`:
    - Features computed at the LAST date $t = \text{prices.index}[-1]$.
    - Automatic blended benchmark construction if `^NSEI` and `^NDX` are present in `prices`.
    - Normalizes weights and evaluates calibrated classifier probabilities.
    - Class-name mapped probabilities (`classes_ = ['High', 'Low', 'Medium']`), never positional assumptions.
    - `risk_score = round(100 * (0.5 * p_medium + 1.0 * p_high))` in $[0, 100]$.
    - `confidence = max(probs)`.
    - Return structure: `{label, probs, risk_score, confidence}` conforming to frozen contract §6.
- `engine/ml/explain.py`:
  - `explain_risk(weights, prices, ...)` & `explain_risk(model, features, predicted_label, ...)` polymorphic support.
  - `shap.TreeExplainer` on the base `HistGradientBoostingClassifier` estimator for the predicted class.
  - Robust fallback: local perturbation sensitivity when SHAP fails.
  - Top 5 drivers selected by $|impact|$.
  - Clean English templates with natural phrasing (e.g. `"Average correlation of 0.71 pushes the risk toward High."`), no jargon.
  - Helpers:
    - `asset_risk_contribution(weights, cov_or_prices)`: $w_i (\Sigma w)_i / \sigma_p^2$, sums to $1.0$.
    - `return_contribution(weights, asset_returns, ...)`: relative ($w_i r_i / r_p$, sums to $1.0$) and absolute ($w_i r_i$).
- `tests/ml/test_predict.py` (5 tests):
  - Contract validation, class order mapping, lazy model caching, real dev_prices execution, input validation errors.
- `tests/ml/test_explain.py` (5 tests):
  - Top 5 SHAP drivers sorted by $|impact|$, plain English templates, polymorphic signatures, fallback under SHAP exception, asset risk contribution sum to 1.0, return contribution calculations.
- Total pytest suite: **51 passed in 10.47s**.

### Prompt 6 — optimize.py implementation (✅ 57/57 tests passed)
- `engine/optimize.py`:
  - `optimize_portfolio(tickers, prices, risk_level, ...)`:
    - Covariance estimation: `sklearn.covariance.LedoitWolf` on daily returns, annualised ($\times 252$).
    - Expected returns: $\mu = 0.5 \times \mu_{\text{hist}} + 0.5 \times \mu_{\text{universe\_mean}}$.
    - `rf` parameter: INR default $0.065$, USD default $0.040$.
    - Quadratic programming with SLSQP: $\sum w_i = 1$, $0 \le w_i \le \text{cap}$.
      - **Low**: min-variance, cap 30%.
      - **Medium**: max Sharpe, volatility $\le 18\%$, cap 35%.
      - **High**: max Sharpe, cap 50%.
      - Safe handling of small asset counts ($n < \lceil 1/\text{cap} \rceil$) via $\text{eff\_cap} = \max(\text{cap}, 1/n)$.
    - 25 frontier candidates generated across risk-aversion parameter grid $\lambda \in [0.01, 0.99]$.
    - ML gate: Each frontier candidate classified via `predict_risk`. Selects max-Sharpe candidate where predicted class $\le$ requested level (High unrestricted). If none qualifies, takes nearest candidate and sets `capacity_note`.
    - Per-asset plain-English rationales from portfolio correlation, volatility, and risk contribution.
    - Full contract compliance: `method`, `recommended`, `current_vs_recommended`, `before` (Metrics), `after` (Metrics), `predicted_risk_after`, `tradeoff`, `efficient_frontier`, `explanations`, `counterfactual`, `capacity_note`.
  - `counterfactual_weights(current_weights, frontier_candidates, target_level)`:
    - Finds nearest candidate one risk level lower by $L_1$ weight distance $\sum |w_i^{\text{cand}} - w_i^{\text{curr}}|$.
    - Returns `{target_label, weights, predicted_label}` or `None`.
- `tests/test_optimize.py` (6 tests):
  - `test_optimize_weights_sum_to_one`: verifies $\sum w_i = 1.0 \pm 10^{-5}$.
  - `test_optimize_caps_respected`: validates $30\%$ (Low), $35\%$ (Medium), $50\%$ (High) caps.
  - `test_optimize_low_vol_less_than_or_equal_high_vol`: proves Low portfolio vol $\le$ High portfolio vol.
  - `test_ml_gate_never_exceeds_requested_when_valid_exists`: verifies ML gate never exceeds requested level when valid candidate exists.
  - `test_counterfactual_weights_picks_smallest_l1_distance`: confirms minimum $L_1$ candidate selection.
  - `test_optimize_contract_fields`: validates all frozen contract fields and types.
- Total pytest suite: **57 passed in 20.62s**.

### Prompt 7 — FastAPI Routers analyze.py and allocate.py (✅ 94/94 tests passed)
- `api/routers/analyze.py`:
  - `POST /api/analyze` fully compliant with `architecture.md` Section 6 and `api/schemas.py`.
  - Normalizes holdings amounts to weights.
  - Loads historical prices using `load_and_validate(min_rows=63)`.
  - Computes portfolio metrics (volatility, ann_return, sharpe, sortino, max_drawdown, current_drawdown, cvar95).
  - Evaluates ML risk model (`predict_risk`), top-5 risk drivers, and plain-English explanations (`explain_risk`).
  - Computes asset statistics (annualized return, volatility, risk contribution, return contribution).
  - Computes full correlation matrix with tickers list and sector exposure breakdown from universe metadata.
  - Generates counterfactual allocation to lower risk level when applicable.
  - Error codes handled cleanly without stack traces: `UNKNOWN_TICKER`, `INSUFFICIENT_HISTORY`, `INVALID_WEIGHTS`, `DATA_UNAVAILABLE`.
  - Dependency injection hook `set_price_loader` for isolated unit testing.
- `api/routers/allocate.py`:
  - `POST /api/allocate` fully compliant with `architecture.md` Section 6 and `api/schemas.py`.
  - Runs Ledoit-Wolf covariance shrinkage + SLSQP optimizer via `engine.optimize.optimize_portfolio`.
  - Evaluates 25 frontier candidates with ML gate to guarantee target risk profile adherence.
  - Provides recommended weights, target amounts, per-asset plain-English rationales, and tradeoff metrics.
  - Returns efficient frontier points, before/after portfolio metrics, and meta.
  - Optimized frontier candidate prediction via `predict_risk_batch` in `engine/ml/predict.py`, reducing latency from ~3.5s to ~0.16s.
- `tests/test_routers_analyze_allocate.py`:
  - 4 end-to-end integration tests using FastAPI `TestClient`:
    - `test_analyze_tech_heavy_contract_and_latency`: Validates contract and response schema on `tech_heavy` preset. Latency: **~0.98s** (<3.0s target).
    - `test_allocate_tech_heavy_contract_and_latency`: Validates contract and response schema on `tech_heavy` preset. Latency: **~0.16s** (<3.0s target).
    - `test_analyze_typed_errors`: Confirms typed error handling for unknown tickers, invalid weights, and insufficient price history.
    - `test_allocate_dependency_injection`: Verifies dependency injection with custom price fixtures.
- Entire project test suite: **94 passed in 13.40s**.

### Prompt 8 — scenario.py & POST /api/scenario router (✅ 102/102 tests passed)
- `engine/scenario.py`:
  - `apply_scenario(weights, prices, scenario, ...)` pure function.
  - Weights safety: does not mutate input weights dictionary; normalizes working copy.
  - Blended benchmark (`0.5 * ^NSEI + 0.5 * ^NDX`) used to estimate asset betas over lookback window, clipped to $[0.2, 2.0]$.
  - Scenarios supported (D53):
    - `market_crash`: $\text{clip}(\beta_i, 0.2, 2.0) \times \text{magnitude}$ (default magnitude $-0.30$).
    - `market_recovery`: $\text{clip}(\beta_i, 0.2, 2.0) \times \text{magnitude}$ (default magnitude $+0.20$).
    - `sector_downturn`: assets in the target sector take full magnitude (default $-0.25$), others take $0.25 \times \beta_i \times \text{magnitude}$.
    - `high_volatility`: doubles covariance matrix ($2 \times \Sigma$), runs 1,000 seeded Monte Carlo 6-month (126-day) simulation paths, returns `mc: {p5, p50, p95}` percentiles.
  - Historical Replay (D52):
    - `covid_2020` (`2020-02-19` to `2020-03-23`) and `bear_2022` (`2022-01-03` to `2022-10-12`) using actual market returns.
    - Assets lacking data in the replay window are dropped, remaining weights renormalized, and missing assets explicitly flagged in `explanations`.
  - `risk_label_after`: re-runs `predict_risk` on a stressed 63-day window where the asset shock is compounded forward into price levels.
  - Outputs conforming to contract §6: `scenario`, `value_before`, `value_after`, `impact_pct`, `metrics_after`, `risk_label_before`, `risk_label_after`, `asset_impacts`, `mc` (if high_volatility), `explanations`.
- `api/routers/scenario.py`:
  - `POST /api/scenario` endpoint accepting `ScenarioRequest` from `api/schemas.py`.
  - Validates weights (1-15 assets, sum > 0) and whitelisted tickers (`UNKNOWN_TICKER`, `INVALID_WEIGHTS`).
  - Loads historical prices from `2019-01-01` to cover both historical replay windows and lookback history.
  - Connects sector lookup from `UNIVERSE_MAP`.
  - Pluggable `_price_loader` for testing dependency injection.
  - Attaches `meta: {data_source, as_of}`.
- `tests/test_scenario.py` (8 tests):
  - `test_crash_impact_negative_and_recovery_positive`: confirms crash drops portfolio value, recovery grows it.
  - `test_input_weights_are_not_mutated`: proves input weights dictionary is untouched in-place.
  - `test_replay_flags_missing_assets`: proves missing assets in replay window are dropped, remaining renormalized, and flagged in explanations.
  - `test_high_volatility_returns_mc_percentiles`: checks `mc: {p5, p50, p95}` monotonic ordering.
  - `test_sector_downturn_shocks_target_sector_fully`: confirms target sector takes full shock and others are dampened.
  - `test_api_post_scenario_contract_and_latency`: end-to-end integration test validating contract fields and types.
  - `test_api_post_scenario_replay`: verifies replay on `covid_2020`.
  - `test_api_post_scenario_errors`: verifies typed error handling for unknown tickers and invalid weights.
- Entire project test suite: **102 passed in 21.50s**.



