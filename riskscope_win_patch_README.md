# RiskScope win-plan patch pack

Built and tested WITHOUT the repo (only the 3 .md files were available). 13 standalone tests pass.
Anything marked UNVERIFIED must be run on your machine.

## Apply (in order, matches win.md timebox)
1. `scripts/integrate.ps1` once Hardik pushes (no-op if origin/main has nothing new).
2. Append the block in `engine/optimize_weights_patch.py` to the bottom of `engine/optimize.py`.
   Copy `api/runtime_log.py`, `engine/brief.py`, `api/routers/brief.py`, `tests/test_win_pack.py` into the repo.
3. `scripts/retrain_real.ps1`, then confirm eval.json no longer says SYNTHETIC.
   If train.py hard-codes `data_note: "SYNTHETIC"`, make it derive from the --prices path.
4. Metrics source of truth: in `api/routers/analyze.py` replace `engine.ml._metrics_shim`
   imports with `engine.metrics` (`compute_all_metrics`). Then re-run tests.
5. Check `engine/scenario.py` is the implemented version (not the stub) after merge; run tests/test_scenario.py.
6. Wire logs: call `log_event(...)` at the 5 events (live ok / fallback / model loaded /
   optimizer infeasible / replay requested). Live-price ones live in Hardik's loader/router: ask him.
7. Start API, run `python scripts/smoke_test.py` (covers acceptance items 2-5 + non-synthetic eval).
8. Give `web_for_harsh/RegretMeter.jsx` to Harsh. Ask Hardik to add `brief.router` in main.py (optional).

## UNVERIFIED
- Request-body shapes for compare/shield/allocate in smoke_test.py and RegretMeter.jsx (schemas.py not seen).
- `series` shape in compare response (component handles list of numbers or {date,value}).
- That optimize_portfolio()["recommended"] items carry `weight` (per jj.md they do).
- Wi-Fi-off test and per-page disclaimer: manual checks.

---
# Hybrid LLM layer (mentor spec, RandomForest REMOVED)
Status: 23 tests pass standalone (fake providers, no real keys, no real network).

| Mentor item | Delivered |
|---|---|
| 1. RF + ensemble | **RF dropped.** `engine/ml/ensemble_patch.py`: calibrated HGB, LogReg, soft-vote HGB+LR; pick by macro-F1; all metrics returned for eval.json. Wiring into train.py is yours (same split). If `ensemble_soft_vote` wins, keep saving the HGB for SHAP (explain.py). |
| 2. Provider chain | `engine/llm/router.py`: Gemini -> Groq -> OpenRouter from `.env` (see `.env.example`), 6s each, pydantic-strict JSON, disk cache keyed by hash of facts, template fallback, never raises. Returns provider_used, providers_tried, fallback, source (llm/cache/template). |
| 3. News | `engine/llm/news.py`: old+new yfinance shapes, Google RSS fallback, disk cache (stale served if offline), max 8/ticker, HTML/control chars stripped, wrapped in `<untrusted_headlines>` in the prompt. |
| 4. /api/brief | `api/routers/brief.py` (replaces earlier version). `watch_flag = (ml_margin < 0.15) and (reviewer.severity == "high")` in Python. label/probs/score copied from analyze; LLM text containing any number not in the facts, buy/sell wording, or a "live" claim on cached data is rejected. |
| 5. Pre-generate + offline test | `scripts/pregenerate_briefs.py` (needs API + keys); `test_network_killed_still_gets_brief_from_cache_or_template`. |

## Decisions you should know about
- Cache key hashes the FACTS only (incl. as_of), not headlines, so an offline demo hits the cache. Re-run pregenerate if the price cache is refreshed.
- `data/cache/llm` and `data/cache/news` sit inside Hardik's `data/` (forbidden for JJ per jj.md). Tell him / add to .gitignore decisions. Dirs are created at runtime.
- `engine/llm/` does network I/O, an exception to the "no I/O in engine/" rule, mandated by the mentor.
- Template brief sets reviewer severity "low", so watch_flag can never fire from the template.

## UNVERIFIED (needs your keys / the docs)
- Real Gemini/Groq/OpenRouter calls (endpoints and response paths written from memory; set model names in .env and run pregenerate).
- Mentor's "extended contract in docs": I haven't seen it. Request is `{analyze, allocate?, compare?, shield?, tickers?}` and response fields are my guess. Adjust `BriefRequest` / `make_brief` if the doc differs.
- Real yfinance `Ticker.news` and Google RSS responses.
- 45-minute rule: if keys/network fail at the 45 min mark, ship as is: the template path is complete and tested.
