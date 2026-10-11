"""
engine/scenario.py — Stress-test scenarios and historical replay.

Pure function. No network, no files, no global state.

Scenarios (decisions D52, D53):
    market_crash:     beta-scaled magnitude shock on all assets (default -0.30).
    market_recovery:  positive beta-scaled shock (default +0.20).
    high_volatility:  covariance × 2, 1,000 Monte Carlo 6-month paths (p5/p50/p95).
    sector_downturn:  sector assets take full magnitude, others 0.25 × beta × magnitude.

Replay windows:
    covid_2020:   2020-02-19 to 2020-03-23  (actual returns)
    bear_2022:    2022-01-03 to 2022-10-12  (actual returns)
    Assets lacking data in the window are dropped, weights renormalized, and flagged.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from engine.ml._metrics_shim import (
    ann_return as _ann_return,
    cvar95 as _cvar95,
    diversification_ratio as _div_ratio,
    hhi as _hhi,
    max_drawdown as _max_dd,
    sharpe as _sharpe,
    sortino as _sortino,
    volatility as _volatility,
)
from engine.ml.predict import predict_risk


# ── Replay window boundaries (D52) ─────────────────────────────────────────
REPLAY_WINDOWS: dict[str, tuple[str, str]] = {
    "covid_2020": ("2020-02-19", "2020-03-23"),
    "bear_2022": ("2022-01-03", "2022-10-12"),
}

# ── Default shock magnitudes ────────────────────────────────────────────────
DEFAULT_MAGNITUDES: dict[str, float] = {
    "market_crash": -0.30,
    "market_recovery": 0.20,
    "high_volatility": 0.0,  # level shift 0, vol doubled
    "sector_downturn": -0.25,
}


def apply_scenario(
    weights: dict[str, float],
    prices: pd.DataFrame,
    scenario: str,
    *,
    amount: float = 1_000_000.0,
    magnitude: float | None = None,
    sector: str | None = None,
    sector_map: dict[str, str] | None = None,
    replay: str | None = None,
    bench_prices: pd.DataFrame | pd.Series | None = None,
    rf: float = 0.065,
    n_mc: int = 1_000,
    seed: int = 42,
) -> dict[str, Any]:
    """Apply a stress scenario or historical replay to a portfolio.

    Parameters
    ----------
    weights : dict[str, float]
        Ticker -> weight (sums to ~1). The input dictionary is never mutated.
    prices : pd.DataFrame
        Historical daily prices (DatetimeIndex, columns include portfolio tickers).
    scenario : str
        ``"market_crash"`` | ``"market_recovery"`` | ``"high_volatility"``
        | ``"sector_downturn"``.
    amount : float
        Portfolio value before the shock.
    magnitude : float | None
        Shock magnitude (e.g. -0.30 for a 30% crash). Defaults per scenario.
    sector : str | None
        Target sector for ``sector_downturn``.
    sector_map : dict[str, str] | None
        Ticker -> sector mapping (e.g. from universe.json).
    replay : str | None
        ``"covid_2020"`` | ``"bear_2022"`` | ``None``.
        If set, uses actual historical returns from the window.
    bench_prices : pd.DataFrame | pd.Series | None
        Optional benchmark prices/returns for beta calculation.
    rf : float
        Annualised risk-free rate.
    n_mc : int
        Monte Carlo paths for ``high_volatility`` scenario.
    seed : int
        Random seed for Monte Carlo simulation reproducibility.

    Returns
    -------
    dict[str, Any]
        Contract fields: ``scenario``, ``value_before``, ``value_after``,
        ``impact_pct``, ``metrics_after``, ``risk_label_before``,
        ``risk_label_after``, ``asset_impacts``, ``mc`` (if high_volatility),
        ``explanations``.
    """
    if not weights:
        raise ValueError("Portfolio weights must not be empty.")
    if prices.empty:
        raise ValueError("Prices DataFrame must not be empty.")

    # ── 1. Copy & normalize weights (do NOT mutate input dict) ────────
    w_copy = {str(k): float(v) for k, v in weights.items()}
    tot_w = float(sum(w_copy.values()))
    if tot_w <= 0.0:
        raise ValueError(f"Sum of weights must be positive, got {tot_w}.")
    w_norm = {k: v / tot_w for k, v in w_copy.items()}
    tickers = list(w_norm.keys())

    # Ensure prices index is DatetimeIndex
    if not isinstance(prices.index, pd.DatetimeIndex):
        prices = prices.copy()
        prices.index = pd.to_datetime(prices.index)
    prices = prices.sort_index()

    missing_cols = [t for t in tickers if t not in prices.columns]
    if missing_cols:
        raise ValueError(f"Prices DataFrame missing tickers: {missing_cols}")

    # ── 2. Resolve blended benchmark series (0.5 NSEI + 0.5 NDX) ──────
    bench_series: pd.Series | None = None
    if bench_prices is not None:
        if isinstance(bench_prices, pd.DataFrame):
            if "^NSEI" in bench_prices.columns and "^NDX" in bench_prices.columns:
                r_n = bench_prices["^NSEI"].pct_change().fillna(0.0)
                r_x = bench_prices["^NDX"].pct_change().fillna(0.0)
                bench_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0
            else:
                bench_series = bench_prices.iloc[:, 0]
        elif isinstance(bench_prices, pd.Series):
            bench_series = bench_prices
    elif "^NSEI" in prices.columns and "^NDX" in prices.columns:
        r_n = prices["^NSEI"].pct_change().fillna(0.0)
        r_x = prices["^NDX"].pct_change().fillna(0.0)
        bench_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0

    # ── 3. Calculate asset betas against blended benchmark ────────────
    # Lookback window for beta (last 252 days)
    n_lookback = min(len(prices), 252)
    px_lookback = prices.iloc[-n_lookback:]
    asset_rets_lookback = px_lookback[tickers].pct_change().dropna()

    if bench_series is not None:
        bench_lookback = bench_series.loc[bench_series.index.isin(px_lookback.index)]
        bench_rets = bench_lookback.pct_change().dropna()
        # Align lengths
        common_idx = asset_rets_lookback.index.intersection(bench_rets.index)
        bench_var = float(np.var(bench_rets.loc[common_idx].values, ddof=1)) if len(common_idx) > 1 else 0.0
    else:
        common_idx = asset_rets_lookback.index
        bench_var = 0.0

    betas: dict[str, float] = {}
    clipped_betas: dict[str, float] = {}
    for t in tickers:
        if bench_var > 1e-12 and len(common_idx) > 10:
            cov_ib = float(np.cov(asset_rets_lookback.loc[common_idx, t].values, bench_rets.loc[common_idx].values, ddof=1)[0, 1])
            beta_i = cov_ib / bench_var
        else:
            beta_i = 1.0
        betas[t] = float(beta_i)
        clipped_betas[t] = float(np.clip(beta_i, 0.2, 2.0))

    # ── 4. Evaluate Scenario Shocks ────────────────────────────────────
    asset_shocks: dict[str, float] = {}
    explanations: list[str] = []
    mc_result: dict[str, float] | None = None
    effective_weights = dict(w_norm)

    if replay is not None and replay in REPLAY_WINDOWS:
        # ── Historical Replay (covid_2020, bear_2022) ──────────────────
        start_date, end_date = REPLAY_WINDOWS[replay]
        mask_win = (prices.index >= start_date) & (prices.index <= end_date)
        replay_df = prices.loc[mask_win]

        valid_assets: list[str] = []
        missing_assets: list[str] = []

        for t in tickers:
            s = replay_df[t].dropna() if t in replay_df.columns else pd.Series(dtype=float)
            if len(s) >= 2:
                r_act = float(s.iloc[-1] / s.iloc[0] - 1.0)
                asset_shocks[t] = r_act
                valid_assets.append(t)
            else:
                asset_shocks[t] = 0.0
                missing_assets.append(t)

        if missing_assets:
            if valid_assets:
                v_sum = sum(w_norm[k] for k in valid_assets)
                effective_weights = {k: (w_norm[k] / v_sum if v_sum > 0 else 0.0) for k in valid_assets}
            for ma in missing_assets:
                explanations.append(
                    f"Asset '{ma}' lacks price history during {replay} ({start_date} to {end_date}) and was excluded from replay; remaining weights renormalized."
                )

        explanations.insert(
            0,
            f"Historical replay of {replay} ({start_date} to {end_date}) using actual market returns."
        )

    elif scenario == "market_crash":
        # ── Market Crash (default -0.30) ──────────────────────────────
        mag = magnitude if magnitude is not None else DEFAULT_MAGNITUDES["market_crash"]
        for t in tickers:
            asset_shocks[t] = clipped_betas[t] * mag
        explanations.append(
            f"Simulated market crash: If the broader market drops by {abs(mag)*100:.1f}%, your holdings are stress-tested based on their historical sensitivity to market downturns."
        )

    elif scenario == "market_recovery":
        # ── Market Recovery (default +0.20) ───────────────────────────
        mag = magnitude if magnitude is not None else DEFAULT_MAGNITUDES["market_recovery"]
        for t in tickers:
            asset_shocks[t] = clipped_betas[t] * mag
        explanations.append(
            f"Simulated market recovery: If the broader market rebounds by +{mag*100:.1f}%, your holdings are projected to gain based on how strongly they participate in market rallies."
        )

    elif scenario == "sector_downturn":
        # ── Sector Downturn (default -0.25) ───────────────────────────
        mag = magnitude if magnitude is not None else DEFAULT_MAGNITUDES["sector_downturn"]
        sec_clean = (sector or "technology").strip().lower()
        sec_lookup = {k: (sector_map.get(k, "") if sector_map else "").strip().lower() for k in tickers}

        for t in tickers:
            if sec_lookup.get(t) == sec_clean:
                # Assets in the given sector take full magnitude
                asset_shocks[t] = mag
            else:
                # Other assets take 0.25 * beta * magnitude
                asset_shocks[t] = 0.25 * clipped_betas[t] * mag

        explanations.append(
            f"Simulated sector crash: A {abs(mag)*100:.1f}% drop in the '{sec_clean.capitalize()}' sector directly impacts exposed holdings, while other holdings experience a milder cushioned spillover."
        )

    elif scenario == "high_volatility":
        # ── High Volatility: covariance × 2 & 1,000 Monte Carlo paths ──
        mag = magnitude if magnitude is not None else 0.0
        for t in tickers:
            asset_shocks[t] = clipped_betas[t] * mag

        # Covariance doubled, Monte Carlo 1,000 6-month (126 days) paths
        cov_orig = asset_rets_lookback.cov().values * 252.0
        cov_stressed = cov_orig * 2.0
        w_vec = np.array([w_norm[t] for t in tickers], dtype=float)

        sigma_port = float(np.sqrt(w_vec @ cov_stressed @ w_vec))
        mu_hist = np.array([_ann_return(asset_rets_lookback[t].values) for t in tickers], dtype=float)
        mu_port = float(w_vec @ mu_hist)

        # 6-month simulation (126 trading days)
        n_days = 126
        dt_mu = mu_port / 252.0
        dt_sigma = sigma_port / np.sqrt(252.0)

        rng = np.random.default_rng(seed)
        sim_rets = rng.normal(loc=dt_mu, scale=dt_sigma, size=(n_mc, n_days))
        cum_sim = np.prod(1.0 + sim_rets, axis=1) - 1.0

        p5 = float(np.percentile(cum_sim, 5))
        p50 = float(np.percentile(cum_sim, 50))
        p95 = float(np.percentile(cum_sim, 95))

        mc_result = {
            "p5": round(p5, 4),
            "p50": round(p50, 4),
            "p95": round(p95, 4),
        }
        explanations.append(
            f"Simulated high market turbulence: Doubling volatility pushes expected annual price swings to {sigma_port*100:.1f}%. Across 1,000 statistical market projections over 6 months, 90% of outcomes range between {p5*100:+.1f}% and {p95*100:+.1f}%."
        )

    else:
        # Fallback generic shock
        mag = magnitude if magnitude is not None else -0.10
        for t in tickers:
            asset_shocks[t] = clipped_betas[t] * mag
        explanations.append(f"Scenario '{scenario}' applied with magnitude {mag*100:.1f}%.")

    # ── 5. Overall portfolio impact ───────────────────────────────────
    impact_pct = float(sum(effective_weights.get(t, 0.0) * asset_shocks.get(t, 0.0) for t in tickers))
    value_before = float(amount)
    value_after = float(amount * (1.0 + impact_pct))

    # Top impacted assets summary in explanations
    sorted_shocks = sorted(asset_shocks.items(), key=lambda kv: kv[1])
    if sorted_shocks:
        worst_t, worst_r = sorted_shocks[0]
        best_t, best_r = sorted_shocks[-1]
        explanations.append(
            f"Individual asset reactions range from hardest hit {worst_t} ({worst_r*100:+.1f}%, market sensitivity {clipped_betas.get(worst_t, 1.0):.2f}x) to most resilient {best_t} ({best_r*100:+.1f}%, market sensitivity {clipped_betas.get(best_t, 1.0):.2f}x)."
        )
    explanations.append(
        f"Estimated portfolio value moves from {value_before:,.0f} to {value_after:,.0f} ({impact_pct*100:+.1f}% net change)."
    )
    explanations.append("Educational stress-test simulation. Not financial advice.")

    # ── 6. Stressed Window & Risk Label After ──────────────────────────
    # Re-run predict_risk on a stressed window (shock applied to last 63 days)
    stressed_px = prices.copy()
    w_window = min(len(stressed_px), 63)
    if w_window > 0:
        for t in tickers:
            if t in stressed_px.columns:
                delta_t = asset_shocks.get(t, 0.0)
                if scenario == "high_volatility" and abs(delta_t) < 1e-6:
                    # Double volatility in the last 63 days
                    r_raw = stressed_px[t].iloc[-w_window:].pct_change().fillna(0.0).values
                    m_raw = float(np.mean(r_raw))
                    r_doubled = m_raw + np.sqrt(2.0) * (r_raw - m_raw)
                    base_p = float(stressed_px[t].iloc[-w_window - 1]) if len(stressed_px) > w_window else float(stressed_px[t].iloc[-w_window])
                    stressed_px.iloc[-w_window:, stressed_px.columns.get_loc(t)] = base_p * np.cumprod(1.0 + r_doubled)
                else:
                    daily_factor = (1.0 + float(np.clip(delta_t, -0.99, 10.0))) ** (1.0 / float(w_window))
                    orig_vals = stressed_px[t].iloc[-w_window:].values
                    factors = np.power(daily_factor, np.arange(1, w_window + 1))
                    stressed_px.iloc[-w_window:, stressed_px.columns.get_loc(t)] = orig_vals * factors

    pred_before = predict_risk(w_norm, prices, rf=rf)
    risk_label_before = pred_before["label"]
    pred_after = predict_risk(w_norm, stressed_px, rf=rf)
    risk_label_after = pred_after["label"]

    # ── 7. Stressed Metrics After ──────────────────────────────────────
    sub_stressed = stressed_px[tickers].iloc[-n_lookback:]
    st_asset_rets = sub_stressed.pct_change().dropna()
    w_arr = np.array([w_norm[t] for t in tickers], dtype=float)
    st_port_rets = (st_asset_rets * w_arr).sum(axis=1).values

    cov_m = st_asset_rets.cov().values * 252.0
    corr_m = st_asset_rets.corr().values
    n_t = len(tickers)
    if n_t > 1:
        tri_mask = np.triu(np.ones((n_t, n_t), dtype=bool), k=1)
        avg_corr = float(np.mean(corr_m[tri_mask]))
    else:
        avg_corr = 1.0

    metrics_after: dict[str, float] = {
        "total_return": round(impact_pct, 4),
        "ann_return": round(float(_ann_return(st_port_rets)), 4),
        "volatility": round(float(_volatility(st_port_rets)), 4),
        "max_drawdown": round(float(_max_dd(st_port_rets)), 4),
        "sharpe": round(float(_sharpe(st_port_rets, rf)), 2),
        "sortino": round(float(_sortino(st_port_rets, rf)), 2),
        "diversification_ratio": round(float(_div_ratio(w_arr, cov_m)), 2),
        "cvar_95": round(float(_cvar95(st_port_rets)), 4),
        "avg_correlation": round(avg_corr, 2),
        "hhi": round(float(_hhi(w_arr)), 3),
    }

    # ── 8. Assemble Output ─────────────────────────────────────────────
    asset_impacts = [
        {"ticker": t, "impact_pct": round(float(asset_shocks.get(t, 0.0)), 4)}
        for t in tickers
    ]

    out_scenario = scenario if replay is None else replay
    result: dict[str, Any] = {
        "scenario": out_scenario,
        "value_before": round(value_before, 2),
        "value_after": round(value_after, 2),
        "impact_pct": round(impact_pct, 4),
        "metrics_after": metrics_after,
        "risk_label_before": risk_label_before,
        "risk_label_after": risk_label_after,
        "asset_impacts": asset_impacts,
        "explanations": explanations,
    }
    if mc_result is not None:
        result["mc"] = mc_result

    return result

