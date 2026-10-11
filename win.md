# RiskScope: Three-Hour Winning Integration Plan

## The non-negotiable outcome

Deliver one dependable story, not every possible feature:

> Build portfolio -> predict forward risk -> explain the drivers -> make it
> Medium -> replay bear 2022 -> show the Drawdown Shield and live/cached value.

The product promise is **decision support**, not a claim to predict markets or
provide financial advice.

## Pulling Hardik's work safely

Current local state (checked 2026-10-11): the active branch is `jj-feature`.
`origin/main` currently points to the initial shared scaffold commit, so there
is no newer Hardik commit available at this moment. Do not run a blind `git
pull` expecting new work until Hardik has pushed it.

When Hardik says the work is pushed to `main`, run:

```powershell
git fetch origin
git log --oneline HEAD..origin/main
```

If that command lists Hardik's commits, first protect any uncommitted work.
This workspace currently has an untracked `Yfinance.ipynb`; either leave it
outside Git or stash it before a merge:

```powershell
git stash push -u -m "WIP before integrating Hardik"
git switch jj-feature
git merge origin/main
```

Resolve only genuine conflicts, then run:

```powershell
pytest -q
git add <resolved-files>
git commit -m "integrate: merge data and simulation work"
```

If a merge is going wrong, safely cancel it with:

```powershell
git merge --abort
```

Afterwards, restore the notebook only if it was stashed:

```powershell
git stash pop
```

Do **not** use `git reset --hard` or overwrite teammates' changes.

## What exists now

### JJ side: mostly ready

- ML feature generation, dataset creation, temporal split, classifier,
  evaluation artifact, prediction, explanations, and optimizer are present.
- `/api/analyze` and `/api/allocate` exist.
- The current `eval.json` is explicitly marked `SYNTHETIC dev data`. Retrain
  against Hardik's `data/cache/prices.parquet` before presenting model scores.
- Add a compatibility function `optimize_weights()` to `engine/optimize.py`.
  Hardik's `/api/compare` imports that name, while JJ's implementation is named
  `optimize_portfolio()`.

### Hardik side: mostly ready

- Cache-first historical loader, daily FX conversion, live-price fallback,
  metrics, simulator, CPPI Shield, tracker, benchmark, and strategy comparison
  are present.
- `/api/prices/live` and `/api/track` already call `latest_prices()`.
- The Stress implementation must be checked after merging. The working tree
  previously contained a scenario stub, while the JJ branch history includes a
  scenario implementation; retain the implemented version and run its tests.

## Mandatory integration fixes

### 1. Make `/api/compare` use the real optimizer

`api/routers/compare.py` attempts to import `optimize_weights`; missing it
silently falls back to equal weight. That can make the recommended strategy
look legitimate when it is not.

Add this JJ-owned adapter in `engine/optimize.py`:

```python
def optimize_weights(tickers, prices, risk_level, currency="INR"):
    """Return compare-compatible recommended weights in ticker order."""
    result = optimize_portfolio(
        tickers=tickers,
        prices=prices,
        risk_level=risk_level,
        currency=currency,
    )
    return {"weights": [item["weight"] for item in result["recommended"]]}
```

Then run the bear-2022 compare request and verify that `weights.recommended`
is different from `weights.equal_weight` for the demo portfolio.

### 2. Use one source of truth for metrics

`/api/analyze` currently imports `engine.ml._metrics_shim`. Once merged, use
Hardik's `engine.metrics` functions or `compute_all_metrics` instead. This
prevents the Analyze page and the Compare/Shield pages from reporting subtly
different Sharpe, drawdown, or return values.

### 3. Retrain on real cached prices

The final model, `eval.json`, and slide values must not be based on synthetic
prices. Make a copy of the synthetic artifacts first if useful, then rerun the
existing dataset and training entry points with `data/cache/prices.parquet`.
Confirm:

- `eval.json` says cache/real market data, not `SYNTHETIC`.
- `n_samples`, test period, cut-points, and metrics are populated.
- one known preset works through `/api/analyze`.

If retraining is not complete and verified, do not show the synthetic scores
as real-market evidence.

## Regret Meter / Portfolio Time Machine

Do not add an endpoint or duplicate finance calculations. The frontend should
orchestrate already-contractual responses and render backend-provided values.

### Bear-2022 replay

Use this period for `/api/compare` and `/api/shield`:

```json
{"start":"2022-01-03","end":"2022-10-12"}
```

### Required requests

1. `POST /api/analyze`: risk label, risk drivers, counterfactual.
2. `POST /api/allocate`: recommended allocation and trade-offs.
3. `POST /api/compare`: original, recommended, equal-weight, insured, and
   benchmark series.
4. `POST /api/shield`: loss avoided, maximum drawdowns, floor, and return drag.

### Render only these backend facts

- `analyze.counterfactual`
- `allocate.tradeoff`
- `compare.series.original`, `.recommended`, `.insured`
- `compare.metrics`
- `shield.benefit.max_drawdown_unprotected`
- `shield.benefit.max_drawdown_insured`
- `shield.benefit.loss_avoided`
- `shield.cost.return_drag_ann`
- `explanations[]`

Suggested three-step visual:

1. **Before:** High-risk concentration and its drivers.
2. **Intervention:** "Make it Medium" allocation and stated trade-off.
3. **After:** animated bear-2022 comparison and Shield floor.

The frontend may display headings such as "Regret Meter", but must not
calculate finance values or invent explanatory claims. Show the server's
`explanations[]` verbatim.

## Live-data implementation

### Scope

Use live quotes for current price, P&L, allocation weight, and day change only.
Historical simulation and ML training remain cache-based/daily. Never call the
prediction itself an intraday market forecast.

### Flow

```text
Frontend manual refresh
        -> GET /api/prices/live?tickers=NVDA,TCS.NS,...
        -> latest_prices()
        -> yfinance succeeds: data_source=live
        -> failure/timeout: last cache close, data_source=cache
        -> frontend renders Live or Cached as-of badge
```

### Demo acceptance checks

- The endpoint returns a quote for `NVDA`, `TCS.NS`, and `GOLDBEES.NS`.
- `/api/track` returns P&L from the same quote source.
- Turn Wi-Fi off; all core pages still work and show cache provenance.
- Use manual refresh only. Do not spend time on polling.

## Minimal local runtime logs

Do not build a logging database. Emit structured terminal logs for:

```text
timestamp, endpoint, tickers, data_source, as_of,
fallback_used, latency_ms, error_type
```

Log these events:

- live quote succeeded;
- live quote failed and cache fallback was used;
- model artifact loaded;
- optimizer target was infeasible and used its documented fallback;
- Regret Meter replay was requested.

Do not log holdings, quantities, or buy prices in a shared/remote log. They
are sensitive portfolio data.

## Optional LLM briefing: strict, safe design

This is a polish feature only. Implement it **after** the core flow, model
retraining, and offline demo work. With three hours remaining it gets at most
30 minutes; otherwise cut it.

### What an LLM may do

- Turn validated response fields into a short, plain-English briefing.
- Explain trade-offs in language appropriate for a retail investor.
- Mention timestamp, data source, and market-closure context supplied by the
  server.

### What it must never do

- calculate returns, risk, drawdown, or prices;
- claim it fetched live data when `meta.data_source` is `cache`;
- invent news, ticker events, sources, or model performance;
- give buy/sell instructions or financial advice;
- replace the trained ML model.

### Architecture: provider adapter with deterministic fallback

```text
validated API payload + local time + data provenance
     -> primary LLM (short timeout)
     -> secondary LLM (only if primary fails)
     -> deterministic explanations[] fallback
```

Keep one internal function with a provider-neutral result shape:

```python
BriefResult = {
    "summary": str,
    "provider": "primary" | "fallback" | "deterministic",
    "generated_at": "ISO-8601 timestamp",
    "data_source": "live" | "cache",
    "as_of": "YYYY-MM-DD",
}
```

The deterministic fallback is always available: concatenate selected existing
`explanations[]` and add the required disclaimer. If both LLMs fail, the user
still gets a correct product result.

### Current-time understanding

An LLM does not reliably know your live time. The backend must pass it:

```python
from datetime import datetime
from zoneinfo import ZoneInfo

now_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
```

Pass `now_ist`, `meta.data_source`, and `meta.as_of` in the context. The
briefing can then state facts like: "Generated at 14:05 IST using cached
market data as of 2026-10-09." It must not infer whether a market is open
unless server-side calendar logic provides that fact.

### Agentic tasks: do not overbuild

For this hackathon, do not create autonomous agents that browse, trade, or
change allocations. If using the phrase “agentic”, keep it as a fixed,
auditable pipeline:

1. **Evidence packer:** selects only validated fields from Analyze, Allocate,
   Compare, Shield, and live-price metadata.
2. **Brief writer:** converts that packet to explanatory text.
3. **Safety checker:** validates the returned JSON, strips unsupported numeric
   claims, attaches disclaimer, and falls back deterministically on failure.

No agent has network access, trading authority, or permission to alter model
outputs.

## Timebox: three hours

| Time | Deliverable |
|---:|---|
| 0:00–0:25 | Fetch/merge Hardik commits; run tests; add `optimize_weights` adapter. |
| 0:25–1:00 | Retrain and verify artifacts against real cached parquet. |
| 1:00–1:50 | Build Regret Meter using Analyze + Allocate + Compare + Shield. |
| 1:50–2:15 | Verify live quotes, refresh button, data badge, and offline fallback. |
| 2:15–2:35 | Add local runtime logs and complete smoke test. |
| 2:35–3:00 | Only if all above is green: LLM briefing with deterministic fallback; otherwise rehearse and record backup demo. |

## Final acceptance test

1. Load `tech_heavy` preset.
2. Analyze returns High/Medium/Low plus explanations and provenance.
3. “Make it Medium” changes weights and shows a documented trade-off.
4. Bear-2022 Regret Meter shows original/recommended/insured lines and Shield
   loss avoided.
5. Track shows live quote if available, cached quote otherwise.
6. Wi-Fi off: app still works from cache and labels itself honestly.
7. `pytest -q` completes with a success summary.
8. Disclaimer is visible on every page:
   “Educational simulation. Not financial advice. Past performance does not
   predict future results. The Drawdown Shield is a simulated strategy, not an
   insurance policy.”
