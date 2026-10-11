"""
api/routers/analyze.py — POST /api/analyze

Implements portfolio risk analysis, metrics, asset stats, correlation matrix,
sector exposure, risk drivers, English explanations, and counterfactuals.
Exact compliance with architecture.md §6 and decision D36/D37.
"""

from __future__ import annotations

from typing import Any, Callable

import numpy as np
import pandas as pd
from fastapi import APIRouter

from api.errors import (
    DATA_UNAVAILABLE,
    INSUFFICIENT_HISTORY,
    INTERNAL,
    INVALID_WEIGHTS,
    RiskScopeError,
)
from api.helpers import (
    get_meta,
    load_and_validate,
    resolve_period,
    sector_map_from_tickers,
    validate_tickers,
)
from api.schemas import AnalyzeRequest
from data.loader import load_prices
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
from engine.ml.explain import (
    asset_risk_contribution,
    explain_risk,
    return_contribution,
)
from engine.ml.predict import predict_risk
from engine.optimize import optimize_portfolio

router = APIRouter()

# Dependency injection hook for price loader
_price_loader: Callable[..., pd.DataFrame] = load_prices


def set_price_loader(loader_fn: Callable[..., pd.DataFrame]) -> None:
    """Override the default price loader (for testing or synthetic feeds)."""
    global _price_loader
    _price_loader = loader_fn


def reset_price_loader() -> None:
    """Reset the price loader to the default data.loader.load_prices."""
    global _price_loader
    _price_loader = load_prices


@router.post("/analyze")
def analyze_portfolio(req: AnalyzeRequest) -> dict[str, Any]:
    """Analyze a portfolio's risk class, score, drivers, metrics, and counterfactuals."""
    try:
        # ── 1. Validate & normalize holdings ───────────────────────────
        tickers = [h.ticker for h in req.holdings]
        validate_tickers(tickers)

        amounts = [float(h.amount) for h in req.holdings]
        total_amount = sum(amounts)
        if total_amount <= 0:
            raise RiskScopeError(INVALID_WEIGHTS, "Holdings amounts must sum to > 0.")

        weights_dict = {h.ticker: float(h.amount) / total_amount for h in req.holdings}

        # ── 2. Resolve period & load prices ────────────────────────────
        start, end = resolve_period(req.period)

        try:
            if _price_loader is load_prices:
                prices = load_and_validate(tickers, start, end, req.currency, min_rows=63)
            else:
                validate_tickers(tickers)
                prices = _price_loader(tickers, start, end, req.currency)
                if prices.empty:
                    raise RiskScopeError(DATA_UNAVAILABLE, "No price data returned by loader.")
        except RiskScopeError:
            raise
        except Exception as e:
            raise RiskScopeError(DATA_UNAVAILABLE, f"Failed to load prices: {e}")

        if len(prices) < 63:
            raise RiskScopeError(
                INSUFFICIENT_HISTORY,
                f"Insufficient price history: got {len(prices)} rows, require at least 63.",
                tickers=tickers,
            )

        # Attach benchmark prices if available so predict_risk and features calculate blended benchmark metrics
        try:
            loader_fn = _price_loader if _price_loader is not None else load_prices
            bench_cols = [b for b in ["^NSEI", "^NDX"] if b not in prices.columns]
            if bench_cols:
                bench_df = loader_fn(bench_cols, start, end, req.currency)
                for b in bench_cols:
                    if b in bench_df.columns:
                        prices[b] = bench_df[b]
        except Exception:
            pass

        # ── 3. Currency-aware risk-free rate ───────────────────────────
        rf = 0.04 if req.currency.upper() == "USD" else 0.065

        # ── 4. Predict risk via ML model ───────────────────────────────
        pred = predict_risk(weights_dict, prices, rf=rf)
        risk_label = pred["label"]
        risk_score = pred["risk_score"]
        confidence = pred["confidence"]
        probs = pred["probs"]

        # ── 5. Portfolio metrics ───────────────────────────────────────
        sub_px = prices[tickers].iloc[-252:] if len(prices) >= 252 else prices[tickers]
        asset_rets = sub_px.pct_change().dropna()
        w_arr = np.array([weights_dict[t] for t in tickers], dtype=float)
        port_rets = (asset_rets * w_arr).sum(axis=1).values

        cov_matrix = asset_rets.cov().values * 252.0
        corr_matrix = asset_rets.corr().values
        n_t = len(tickers)
        if n_t > 1:
            tri_mask = np.triu(np.ones((n_t, n_t), dtype=bool), k=1)
            avg_corr = float(np.mean(corr_matrix[tri_mask]))
        else:
            avg_corr = 1.0

        metrics = {
            "total_return": round(float(np.prod(1.0 + port_rets) - 1.0), 3) if len(port_rets) > 0 else 0.0,
            "ann_return": round(_ann_return(port_rets), 3),
            "volatility": round(_volatility(port_rets), 3),
            "max_drawdown": round(_max_dd(port_rets), 3),
            "sharpe": round(_sharpe(port_rets, rf), 2),
            "sortino": round(_sortino(port_rets, rf), 2),
            "diversification_ratio": round(_div_ratio(w_arr, cov_matrix), 2),
            "cvar_95": round(_cvar95(port_rets), 3),
            "avg_correlation": round(avg_corr, 2),
            "hhi": round(_hhi(w_arr), 3),
        }

        # ── 6. Per-asset stats ─────────────────────────────────────────
        rc_dict = asset_risk_contribution(weights_dict, sub_px)
        ret_dict = {t: _ann_return(asset_rets[t].values) for t in tickers}
        ret_contrib_dict = return_contribution(weights_dict, ret_dict, relative=True)

        asset_stats: list[dict[str, Any]] = []
        for t in tickers:
            rets_t = asset_rets[t].values
            asset_stats.append({
                "ticker": t,
                "weight": round(weights_dict[t], 4),
                "ann_return": round(_ann_return(rets_t), 3),
                "volatility": round(_volatility(rets_t), 3),
                "max_drawdown": round(_max_dd(rets_t), 3),
                "risk_contribution": round(float(rc_dict.get(t, 0.0)), 4),
                "return_contribution": round(float(ret_contrib_dict.get(t, 0.0)), 4),
            })

        # ── 7. Correlation matrix ──────────────────────────────────────
        correlation = {
            "tickers": tickers,
            "matrix": [[round(float(val), 2) for val in row] for row in corr_matrix.tolist()],
        }

        # ── 8. Sector exposure ─────────────────────────────────────────
        sector_map = sector_map_from_tickers(tickers)
        sector_exposure: dict[str, float] = {}
        for t in tickers:
            sec = sector_map.get(t, "Other")
            sector_exposure[sec] = round(sector_exposure.get(sec, 0.0) + weights_dict[t], 4)

        # ── 9. Risk drivers & explanations ─────────────────────────────
        explain_res = explain_risk(weights_dict, prices, predicted_label=risk_label, rf=rf)
        risk_drivers = explain_res["risk_drivers"]
        explanations = explain_res["explanations"]

        # Plain-English explanation for dominant risk contributors (e.g. NVDA + TSLA)
        sorted_rc = sorted(rc_dict.items(), key=lambda x: x[1], reverse=True)
        if len(sorted_rc) >= 2:
            top1_t, top1_rc = sorted_rc[0]
            top2_t, top2_rc = sorted_rc[1]
            joint_share = top1_rc + top2_rc
            if joint_share >= 0.50:
                rc_exp = (
                    f"Top risk contributors {top1_t} ({top1_rc:.1%}) and {top2_t} ({top2_rc:.1%}) "
                    f"account for {joint_share:.1%} of total portfolio risk."
                )
                if rc_exp not in explanations:
                    explanations.append(rc_exp)

        # ── 10. Counterfactual ("Make it Medium" / "Make it Low") ──────
        counterfactual: dict[str, Any] | None = None
        if risk_label != "Low":
            target_level = "Medium" if risk_label == "High" else "Low"
            try:
                opt_res = optimize_portfolio(
                    tickers=tickers,
                    prices=prices,
                    risk_level=target_level.lower(),
                    current_weights=weights_dict,
                    rf=rf,
                )
                cf = opt_res.get("counterfactual")
                if (
                    cf is not None
                    and cf.get("target_label") == target_level
                    and cf.get("predicted_label") == target_level
                ):
                    counterfactual = cf
                else:
                    # Search for candidate along the L1 interpolation ray or recommended allocation
                    rec_weights = {r["ticker"]: r["weight"] for r in opt_res.get("recommended", [])}
                    best_cf_weights = None
                    for alpha in [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 1.0]:
                        w_cand = {
                            t: round((1.0 - alpha) * weights_dict.get(t, 0.0) + alpha * rec_weights.get(t, 0.0), 4)
                            for t in tickers
                        }
                        tot = sum(w_cand.values())
                        if tot > 0:
                            w_cand = {k: v / tot for k, v in w_cand.items()}
                        cand_pred = predict_risk(w_cand, prices, rf=rf)
                        if cand_pred["label"] == target_level:
                            best_cf_weights = {k: round(v, 4) for k, v in w_cand.items()}
                            break

                    if best_cf_weights is not None:
                        counterfactual = {
                            "target_label": target_level,
                            "weights": best_cf_weights,
                            "predicted_label": target_level,
                        }
                    else:
                        rec_label = opt_res.get("predicted_risk_after", {}).get("label")
                        if rec_label == target_level:
                            counterfactual = {
                                "target_label": target_level,
                                "weights": rec_weights,
                                "predicted_label": rec_label,
                            }
            except Exception:
                counterfactual = None

        # ── 11. Metadata ───────────────────────────────────────────────
        meta = get_meta()
        if hasattr(prices, "attrs") and prices.attrs:
            if "data_source" in prices.attrs:
                meta["data_source"] = prices.attrs["data_source"]
            if "as_of" in prices.attrs:
                meta["as_of"] = prices.attrs["as_of"]

        return {
            "risk_label": risk_label,
            "risk_score": risk_score,
            "confidence": confidence,
            "probs": probs,
            "metrics": metrics,
            "weights": {k: round(v, 4) for k, v in weights_dict.items()},
            "asset_stats": asset_stats,
            "correlation": correlation,
            "sector_exposure": sector_exposure,
            "risk_drivers": risk_drivers,
            "explanations": explanations,
            "counterfactual": counterfactual,
            "meta": meta,
        }

    except RiskScopeError:
        raise
    except Exception as exc:
        raise RiskScopeError(INTERNAL, f"Analysis failed: {exc}")
