# prd.md: RiskScope

**One-line pitch:** RiskScope doesn't just score your portfolio. It predicts its *forward* risk with a validated ML model, shows which assets drive that risk, fixes the allocation for your risk level, and shows what a drawdown floor would have saved you.

## 1. Problem
Investors think "diversified" means "safe". Two or three assets often drive most of the risk. Existing risk scores are formulas on past data and are never checked against what happened next. The PS asks for an ML-based system that analyses a portfolio, explains its risk, recommends a better allocation, simulates history, tracks live holdings against a benchmark, and compares strategies.

## 2. Users
- **Primary:** Indian retail investor holding a mix of NSE stocks, US stocks and gold/ETFs, with INR as the home currency.
- **Demo persona:** "Aman", Rs 10,00,000 split across NVDA, TSLA, RELIANCE, TCS, HDFCBANK and GOLDBEES, tech-heavy and unaware of it.

## 3. Goals and non-goals
**Goals**
1. Cover R1-R6 fully, minimal but working and polished.
2. Real ML with an honest evaluation (walk-forward, baselines).
3. Every number comes with a plain-English explanation.
4. Demo works offline.

**Non-goals:** accounts or login, persistence of holdings, real trading, real insurance products, mobile layout, deployment.

## 4. Inferred judging criteria (weights used for scoring)
| Criterion | Weight |
|---|---|
| PS coverage (R1-R6 all working) | 25 |
| ML soundness and honesty | 20 |
| UI and demo impact | 20 |
| Explainability | 15 |
| Brownie points and innovation | 10 |
| Feasibility and robustness | 10 |

## 5. Requirements and acceptance criteria
| ID | Requirement | Screen / endpoint | Acceptance test |
|---|---|---|---|
| R1 | Select multiple assets, enter amounts or %, choose Low/Medium/High | Build page, `/assets/search`, `/presets` | Can build a 6-asset portfolio in under 60s, toggle Rs vs %, load demo in 1 click |
| R2 | Risk class (Low/Medium/High) + why + top contributing assets | Risk page, `/analyze` | Badge, probabilities, SHAP-based English reasons, per-asset risk and return contribution bars |
| R3 | Asset comparison + recommended allocation with reasoning and trade-offs | Compare/Recommend pages, `/analyze` (asset_stats, correlation), `/allocate` | Metrics table for each asset, correlation heatmap, allocation with per-asset rationale, before/after metrics, trade-off text |
| R4 | Historical simulation over chosen periods, test combinations and market conditions | Simulate page, `/simulate`, `/regimes` | Total return, volatility, max drawdown, Sharpe, growth chart, drawdown chart, regime preset chips |
| R5 | Live tracking + benchmark comparison | Track page, `/track`, `/prices/live`, `/benchmark` | Prices, value, per-asset P&L, allocation donut, portfolio risk label, overlay vs NIFTY or NASDAQ-100 with the same-period metrics and a verdict |
| R6 | Strategy comparison: original vs recommended vs equal-weight vs benchmark | Strategies page, `/compare` | One chart, one metrics table with best-in-column highlighting, risk label per strategy. Also has `insured` as a 5th line |

## 6. Brownie points and extras
| ID | Item | Tier | Where |
|---|---|---|---|
| B1 | Dynamic adjustment (change risk level, amount or assets and everything refreshes) | SHOULD | Global portfolio context with 400ms debounce, refetches `/analyze` and `/allocate` |
| B2 | Risk-return visualization + bull/bear/volatile regimes | SHOULD | Scatter on Recommend page (assets, portfolios, benchmark), regime chips on Simulate |
| B3 | Market scenarios (crash, recovery, high volatility, sector downturn) | SHOULD | Stress page, `/scenario` |
| B4 | GenAI market brief | COULD (cut first) | `/brief`, labelled "supplementary" |
| B5 | Explainable recommendations | SHOULD | Per-asset rationale, trade-off text, risk-contribution before/after |
| Insurance | **Drawdown Shield (CPPI floor)** | SHOULD (core differentiator) | Shield panel, `/shield`, `insured` line in `/compare` |
| Extra | "Make it Medium" counterfactual button | SHOULD | Risk page, from `/analyze.counterfactual` |

## 7. Screens
1. **Build:** search, amounts, risk selector, period, "Load demo".
2. **Risk (money screen):** badge, risk score, confidence, key metrics, explanations, risk-contribution bars, SHAP drivers.
3. **Compare + Recommend:** asset table, heatmap, allocation (current vs recommended), reasoning, scatter.
4. **Simulate:** period and regime presets, rebalance option, growth and drawdown charts.
5. **Track:** positions, P&L, donut, benchmark overlay.
6. **Strategies:** five-line chart, table, risk labels, shield slider.
7. **Stress:** scenario buttons, before/after cards, per-asset impact.
Header shows a data badge ("live" or "cached as of DATE"). Footer shows the disclaimer.

## 8. Demo script (4-5 minutes)
1. 0:00: one-sentence problem, click **Load demo portfolio**.
2. 0:30: Risk page says **High**. NVDA and TSLA drive about 58% of the risk. SHAP text explains why.
3. 1:15: click **Make it Medium**. Allocation morphs and the label flips. **(Wow moment.)**
4. 2:00: Recommend page: reasoning, trade-off, scatter.
5. 2:45: Simulate with the **bear 2022** preset, then Strategies: original vs recommended vs equal vs benchmark vs **insured**. Shield floor line visible.
6. 3:30: Track live P&L vs NIFTY. Stress "market crash -30%".
7. 4:15: ML slide: confusion matrix, honest baseline, disclaimer.

**Fallback:** the app is cache-first; if wifi dies it continues with an "as of" banner. If the laptop dies, play the pre-recorded video.

## 9. Success / definition of done
- A judge can build a portfolio, see the verdict with reasons, see a better allocation, compare strategies and track live P&L in under 3 minutes without narration.
- Every endpoint returns in under 3s for a 5-asset portfolio, from cache.
- `pytest` green, including the contract test and the offline test.
- Eval table (macro-F1, confusion matrix, baselines) is on a slide.

## 10. Likely judge questions and short answers
1. **Isn't this just Sharpe?** No. Sharpe looks backwards. The classifier predicts the next 6 months and we show the persistence baseline next to it.
2. **How is the label defined?** 50/50 blend of forward volatility and forward max drawdown, cut at train-set terciles. We show median forward vol per class.
3. **Leakage?** Features use only the past 252 days, label only the next 126, 126-day purge, cut-points from train only.
4. **Overfitting (model and optimizer)?** Walk-forward test on later years. Ledoit-Wolf covariance, shrunk returns, weight caps. Strategy comparison optimizes only on pre-period data.
5. **Why not volatility alone?** It is a feature and a baseline. We add drawdown, correlation, concentration and regime, and report the difference.
6. **Limitations?** Past is not future. Universe is 36 assets. Classes are relative to that universe. CPPI is simulated. Not advice.
7. **Scalability?** `engine/` is stateless. More assets means a database and cached covariances.
8. **Privacy?** Holdings stay in browser localStorage. Nothing stored server-side. Ticker whitelist, validated inputs, CORS locked.

## 11. PPT outline (10 slides)
1. Title and pitch. 2. Problem: "diversified" is not always diversified. 3. What we built (screens). 4. Architecture (React, FastAPI, engine, offline cache). 5. ML model: label, features, walk-forward split. 6. Results: confusion matrix and baseline table. 7. Explainability: SHAP plus risk contribution. 8. Recommendation engine with the ML gate. 9. Demo highlights: bear 2022, Drawdown Shield, stress. 10. Limitations, roadmap, disclaimer.

## 12. Disclaimer text (use verbatim)
"Educational simulation. Not financial advice. Past performance does not predict future results. The Drawdown Shield is a simulated strategy, not an insurance policy."
