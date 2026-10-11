"""
engine/optimize.py — Portfolio optimisation (Ledoit-Wolf, SLSQP, ML gate).

Pure function. No network, no files, no global state.

Profiles (architecture.md §5, decision D39):
    Low:    min-variance, cap 30%
    Medium: max Sharpe with vol <= 18%, cap 35%
    High:   max Sharpe, cap 50%

Generates ~25 frontier candidates, classifies each via the ML model,
picks max-Sharpe among those whose predicted class <= requested level.
Also produces per-asset rationale, tradeoff dict, and counterfactual.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd
from scipy.optimize import minimize
from sklearn.covariance import LedoitWolf

from engine.ml._metrics_shim import (
    ann_return as _ann_return,
    cvar95 as _cvar95,
    diversification_ratio as _div_ratio,
    hhi as _hhi,
    max_drawdown as _max_dd,
    risk_contribution as _risk_contrib,
    sharpe as _sharpe,
    sortino as _sortino,
    volatility as _volatility,
)
from engine.ml.predict import predict_risk, predict_risk_batch

RISK_LEVEL_ORDER: dict[str, int] = {
    "Low": 1,
    "Medium": 2,
    "High": 3,
}

CAP_LIMITS: dict[str, float] = {
    "Low": 0.30,
    "Medium": 0.35,
    "High": 0.50,
}


def _compute_metrics(
    weights_dict: dict[str, float],
    prices: pd.DataFrame,
    rf: float = 0.065,
) -> dict[str, float]:
    """Compute standard portfolio metrics over the available prices window."""
    tickers = [t for t in weights_dict if t in prices.columns]
    w_arr = np.array([weights_dict[t] for t in tickers], dtype=float)
    if len(tickers) == 0 or np.sum(w_arr) <= 0:
        return {
            "total_return": 0.0,
            "ann_return": 0.0,
            "volatility": 0.0,
            "max_drawdown": 0.0,
            "sharpe": 0.0,
            "sortino": 0.0,
            "diversification_ratio": 1.0,
            "cvar_95": 0.0,
            "avg_correlation": 1.0,
            "hhi": 1.0,
        }

    sub_px = prices[tickers].iloc[-252:] if len(prices) >= 252 else prices[tickers]
    asset_rets = sub_px.pct_change().dropna()
    port_rets = (asset_rets * w_arr).sum(axis=1).values

    ar = _ann_return(port_rets)
    n = len(port_rets)
    tot = float(np.prod(1.0 + port_rets) - 1.0) if n > 0 else 0.0
    vol = _volatility(port_rets)
    mdd = _max_dd(port_rets)
    sh = _sharpe(port_rets, rf)
    so = _sortino(port_rets, rf)
    cv = _cvar95(port_rets)
    h = _hhi(w_arr)

    # Correlation & diversification
    corr_mat = asset_rets.corr().values
    n_t = len(tickers)
    if n_t > 1:
        tri_mask = np.triu(np.ones((n_t, n_t), dtype=bool), k=1)
        avg_corr = float(np.mean(corr_mat[tri_mask]))
    else:
        avg_corr = 1.0

    cov_mat = asset_rets.cov().values * 252.0
    dr = _div_ratio(w_arr, cov_mat)

    return {
        "total_return": tot,
        "ann_return": ar,
        "volatility": vol,
        "max_drawdown": mdd,
        "sharpe": sh,
        "sortino": so,
        "diversification_ratio": dr,
        "cvar_95": cv,
        "avg_correlation": avg_corr,
        "hhi": h,
    }


def counterfactual_weights(
    current_weights: dict[str, float],
    frontier_candidates: list[dict[str, Any]],
    target_level: str,
) -> dict[str, Any] | None:
    """Pick the frontier candidate one risk level lower, closest by L1 distance.

    Parameters
    ----------
    current_weights : dict[str, float]
        Current portfolio weights keyed by ticker.
    frontier_candidates : list[dict]
        Each dict has keys ``weights``, ``label`` (or ``predicted_label``), ``sharpe``, etc.
    target_level : str
        The desired lower risk level (e.g. ``"medium"`` when current is ``"high"``).

    Returns
    -------
    dict | None
        ``{target_label, weights, predicted_label}`` or ``None`` if no candidate qualifies.

    Example
    -------
    >>> counterfactual_weights({"A": 0.8, "B": 0.2}, [], "low") is None
    True
    """
    target_cap = target_level.strip().capitalize()
    qualifying = [
        c for c in frontier_candidates
        if (c.get("label") == target_cap or c.get("predicted_label") == target_cap)
    ]
    if not qualifying:
        return None

    all_keys = set(current_weights.keys())
    for c in qualifying:
        all_keys.update(c.get("weights", {}).keys())

    def l1_dist(cand: dict[str, Any]) -> float:
        w_cand = cand.get("weights", {})
        return sum(abs(w_cand.get(k, 0.0) - current_weights.get(k, 0.0)) for k in all_keys)

    best = min(qualifying, key=l1_dist)
    return {
        "target_label": target_cap,
        "weights": best["weights"],
        "predicted_label": best.get("label", best.get("predicted_label", target_cap)),
    }


def optimize_portfolio(
    tickers: list[str],
    prices: pd.DataFrame,
    risk_level: str,
    *,
    current_weights: dict[str, float] | None = None,
    amount: float = 1_000_000.0,
    currency: str = "INR",
    rf: float | None = None,
    n_frontier: int = 25,
) -> dict[str, Any]:
    """Find an optimal allocation for *tickers* at the requested *risk_level*.

    Implements Ledoit-Wolf covariance shrinkage, SLSQP optimization,
    25 frontier candidate generations, and ML gate classification per D39.

    Parameters
    ----------
    tickers : list[str]
        Universe of tickers available for allocation.
    prices : pd.DataFrame
        Historical daily adjusted-close prices (DatetimeIndex, columns = tickers).
    risk_level : str
        ``"low"`` | ``"medium"`` | ``"high"``.
    current_weights : dict[str, float] | None
        Existing weights (for current-vs-recommended comparison).
    amount : float
        Total investment amount (for per-ticker amount calculation).
    currency : str
        ``"INR"`` | ``"USD"`` (determines risk-free rate default).
    rf : float | None
        Annualised risk-free rate (defaults to 0.065 for INR, 0.04 for USD).
    n_frontier : int
        Number of frontier candidates to evaluate (default 25).

    Returns
    -------
    dict[str, Any]
        Contract fields: ``method``, ``recommended``, ``current_vs_recommended``,
        ``before`` (Metrics), ``after`` (Metrics), ``predicted_risk_after``,
        ``tradeoff``, ``efficient_frontier``, ``capacity_note``, ``explanations``,
        ``counterfactual``.

    Example
    -------
    >>> import pandas as pd, numpy as np
    >>> dates = pd.bdate_range("2023-01-01", periods=260)
    >>> px = pd.DataFrame({"A": np.linspace(100, 120, 260), "B": np.linspace(50, 60, 260)}, index=dates)
    >>> res = optimize_portfolio(["A", "B"], px, "low")
    >>> abs(sum(r["weight"] for r in res["recommended"]) - 1.0) < 1e-4
    True
    """
    # ── 1. Validate inputs & parameters ────────────────────────────────
    valid_tickers = [t for t in tickers if t in prices.columns]
    if len(valid_tickers) < 2:
        raise ValueError(f"Need at least 2 valid tickers in prices, found {len(valid_tickers)}.")

    n = len(valid_tickers)
    req_level = risk_level.strip().capitalize()
    if req_level not in RISK_LEVEL_ORDER:
        req_level = "Medium"

    # Risk-free rate per currency (D21)
    if rf is None:
        rf_val = 0.04 if currency.upper() == "USD" else 0.065
    else:
        rf_val = float(rf)

    # ── 2. Calculate returns, expected return mu, Ledoit-Wolf cov ──────
    sub_px = prices[valid_tickers].iloc[-252:] if len(prices) >= 252 else prices[valid_tickers]
    asset_rets = sub_px.pct_change().dropna()
    if len(asset_rets) < 20:
        raise ValueError("Insufficient price history for covariance estimation.")

    # Ledoit-Wolf covariance shrinkage on daily returns, annualised (D39)
    lw = LedoitWolf().fit(asset_rets.values)
    cov = lw.covariance_ * 252.0

    # mu = 0.5 * historical ann return + 0.5 * universe mean (D39)
    mu_hist = np.array([
        _ann_return(asset_rets[t].values) for t in valid_tickers
    ], dtype=float)
    universe_mean = float(np.mean(mu_hist))
    mu = 0.5 * mu_hist + 0.5 * universe_mean

    # ── 3. Optimize profile-specific portfolio (SLSQP) ─────────────────
    raw_cap = CAP_LIMITS.get(req_level, 0.35)
    # Ensure feasibility when n is small (e.g. n=2 requires cap >= 0.50)
    eff_cap = max(raw_cap, float(1.0 / n) + 1e-5)
    bounds = [(0.0, eff_cap) for _ in range(n)]
    sum_con = {"type": "eq", "fun": lambda w: np.sum(w) - 1.0}

    w0 = np.ones(n) / float(n)

    if req_level == "Low":
        # Min-variance
        res_opt = minimize(
            lambda w: 0.5 * (w @ cov @ w),
            w0,
            bounds=bounds,
            constraints=[sum_con],
            method="SLSQP",
        )
    elif req_level == "Medium":
        # Max Sharpe with vol <= 18% (if feasible)
        vol_limit = 0.18
        # Check min feasible vol
        min_var_res = minimize(
            lambda w: 0.5 * (w @ cov @ w),
            w0,
            bounds=bounds,
            constraints=[sum_con],
            method="SLSQP",
        )
        min_vol = float(np.sqrt(min_var_res.x @ cov @ min_var_res.x)) if min_var_res.success else 0.15

        constraints = [sum_con]
        if min_vol <= vol_limit:
            constraints.append({"type": "ineq", "fun": lambda w: vol_limit**2 - (w @ cov @ w)})

        res_opt = minimize(
            lambda w: -(w @ mu - rf_val) / (np.sqrt(w @ cov @ w) + 1e-8),
            w0,
            bounds=bounds,
            constraints=constraints,
            method="SLSQP",
        )
    else:  # High
        # Max Sharpe unrestricted by vol
        res_opt = minimize(
            lambda w: -(w @ mu - rf_val) / (np.sqrt(w @ cov @ w) + 1e-8),
            w0,
            bounds=bounds,
            constraints=[sum_con],
            method="SLSQP",
        )

    w_profile = res_opt.x if res_opt.success else w0
    w_profile = np.clip(w_profile, 0.0, eff_cap)
    w_profile = w_profile / np.sum(w_profile)

    # ── 4. Generate ~25 frontier candidates ────────────────────────────
    frontier_candidates: list[dict[str, Any]] = []
    lambdas = np.linspace(0.01, 0.99, n_frontier)
    cand_weights_list: list[dict[str, float]] = []
    cand_metrics: list[tuple[float, float, float]] = []

    for lam in lambdas:
        sol = minimize(
            lambda w: lam * (w @ cov @ w) - (1.0 - lam) * (w @ mu),
            w0,
            bounds=bounds,
            constraints=[sum_con],
            method="SLSQP",
        )
        if sol.success:
            w_c = np.clip(sol.x, 0.0, eff_cap)
            w_c = w_c / np.sum(w_c)
        else:
            w_c = w_profile

        v_c = float(np.sqrt(w_c @ cov @ w_c))
        r_c = float(w_c @ mu)
        s_c = float((r_c - rf_val) / (v_c + 1e-8))
        cand_weights = {valid_tickers[i]: float(w_c[i]) for i in range(n)}

        cand_weights_list.append(cand_weights)
        cand_metrics.append((v_c, r_c, s_c))

    # Classify with ML model in batch (ML gate)
    preds = predict_risk_batch(cand_weights_list, prices, rf=rf_val)

    for cand_weights, (v_c, r_c, s_c), pred in zip(cand_weights_list, cand_metrics, preds):
        frontier_candidates.append({
            "weights": cand_weights,
            "volatility": v_c,
            "ann_return": r_c,
            "sharpe": s_c,
            "label": pred["label"],
            "probs": pred["probs"],
            "risk_score": pred["risk_score"],
            "confidence": pred["confidence"],
        })

    # Sort frontier candidates by volatility ascending
    frontier_candidates.sort(key=lambda c: c["volatility"])

    # ── 5. Apply ML Gate ───────────────────────────────────────────────
    req_rank = RISK_LEVEL_ORDER[req_level]
    capacity_note: str | None = None

    if req_level == "High":
        # High is unrestricted (D39)
        qualifying = frontier_candidates
    else:
        qualifying = [
            c for c in frontier_candidates
            if RISK_LEVEL_ORDER.get(c["label"], 2) <= req_rank
        ]

    if qualifying:
        # Choose max-Sharpe candidate among qualifying
        selected_cand = max(qualifying, key=lambda c: c["sharpe"])
    else:
        # None qualifies: take the nearest candidate and set capacity_note (D39)
        selected_cand = min(
            frontier_candidates,
            key=lambda c: (RISK_LEVEL_ORDER.get(c["label"], 3), c["volatility"])
        )
        capacity_note = (
            f"Requested {req_level} risk, but all available portfolio combinations are "
            f"classified as {selected_cand['label']} due to market volatility. "
            f"Selected lowest available risk profile."
        )

    rec_weights = selected_cand["weights"]

    # ── 6. Rationales, Metrics & Tradeoff ──────────────────────────────
    # Clean current weights
    if current_weights is not None:
        cur_w_clean = {t: float(current_weights.get(t, 0.0)) for t in valid_tickers}
        tot_cur = sum(cur_w_clean.values())
        if tot_cur > 0:
            cur_w_clean = {k: v / tot_cur for k, v in cur_w_clean.items()}
        else:
            cur_w_clean = {t: 1.0 / n for t in valid_tickers}
    else:
        cur_w_clean = {t: 1.0 / n for t in valid_tickers}

    before_metrics = _compute_metrics(cur_w_clean, prices, rf=rf_val)
    after_metrics = _compute_metrics(rec_weights, prices, rf=rf_val)

    tradeoff = {
        "return_change": round(after_metrics["ann_return"] - before_metrics["ann_return"], 4),
        "volatility_change": round(after_metrics["volatility"] - before_metrics["volatility"], 4),
        "drawdown_change": round(after_metrics["max_drawdown"] - before_metrics["max_drawdown"], 4),
    }

    # Per-asset rationales
    w_rec_arr = np.array([rec_weights[t] for t in valid_tickers], dtype=float)
    sigma_w = cov @ w_rec_arr
    port_var = float(w_rec_arr @ sigma_w)
    rc_arr = (w_rec_arr * sigma_w) / port_var if port_var > 1e-12 else np.ones(n) / n
    asset_vols = np.sqrt(np.diag(cov))

    # Correlation to portfolio
    port_rets_after = (asset_rets[valid_tickers] * w_rec_arr).sum(axis=1).values
    corrs_to_port: dict[str, float] = {}
    for i, t in enumerate(valid_tickers):
        a_rets = asset_rets[t].values
        c_val = np.corrcoef(a_rets, port_rets_after)[0, 1] if np.std(a_rets) > 1e-8 else 1.0
        corrs_to_port[t] = float(c_val)

    recommended_list: list[dict[str, Any]] = []
    current_vs_rec: list[dict[str, Any]] = []

    for i, t in enumerate(valid_tickers):
        w_i = float(rec_weights[t])
        amt_i = float(round(w_i * amount, 2))
        vol_i = float(asset_vols[i])
        rc_i = float(rc_arr[i])
        corr_i = corrs_to_port[t]

        if w_i > 0.005:
            if rc_i > w_i:
                rationale = (
                    f"{t}: {w_i:.1%} allocation. Annual volatility of {vol_i:.1%} and {corr_i:.2f} "
                    f"correlation to portfolio drives {rc_i:.1%} of portfolio risk."
                )
            else:
                rationale = (
                    f"{t}: {w_i:.1%} allocation. Annual vol of {vol_i:.1%} with {corr_i:.2f} "
                    f"correlation provides diversification, contributing {rc_i:.1%} to total risk."
                )
        else:
            rationale = f"{t}: 0.0% allocation constrained by risk cap or suboptimal risk-adjusted return."

        recommended_list.append({
            "ticker": t,
            "weight": round(w_i, 4),
            "amount": amt_i,
            "rationale": rationale,
        })
        current_vs_rec.append({
            "ticker": t,
            "current": round(float(cur_w_clean.get(t, 0.0)), 4),
            "recommended": round(w_i, 4),
        })

    # Sort recommended by weight descending
    recommended_list.sort(key=lambda r: r["weight"], reverse=True)

    # ── 7. Counterfactual ("Make it Medium") ───────────────────────────
    pred_risk_after = {
        "label": selected_cand["label"],
        "probs": selected_cand["probs"],
        "risk_score": selected_cand["risk_score"],
        "confidence": selected_cand["confidence"],
    }

    cf_target = None
    if selected_cand["label"] == "High":
        cf_target = "Medium"
    elif selected_cand["label"] == "Medium":
        cf_target = "Low"

    cf_result = None
    if cf_target is not None:
        cf_result = counterfactual_weights(cur_w_clean, frontier_candidates, cf_target)

    # ── 8. Explanations ────────────────────────────────────────────────
    explanations = [
        f"Portfolio optimized for {req_level} risk using Ledoit-Wolf covariance shrinkage and SLSQP quadratic programming.",
        f"Expected annual return changes by {tradeoff['return_change']:+.1%} while volatility changes by {tradeoff['volatility_change']:+.1%}.",
        f"ML gate verified recommended allocation as {pred_risk_after['label']} risk with {pred_risk_after['confidence']:.0%} confidence.",
    ]
    if capacity_note:
        explanations.append(capacity_note)

    # Efficient frontier representation
    eff_frontier = [
        {
            "volatility": round(c["volatility"], 4),
            "ann_return": round(c["ann_return"], 4),
            "label": c["label"],
        }
        for c in frontier_candidates
    ]

    result: dict[str, Any] = {
        "method": "slsqp_ledoit_wolf",
        "recommended": recommended_list,
        "current_vs_recommended": current_vs_rec,
        "before": before_metrics,
        "after": after_metrics,
        "predicted_risk_after": pred_risk_after,
        "tradeoff": tradeoff,
        "efficient_frontier": eff_frontier,
        "explanations": explanations,
        "counterfactual": cf_result,
    }
    if capacity_note:
        result["capacity_note"] = capacity_note

    return result
