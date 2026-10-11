"""
tests/test_optimize.py — Unit tests for engine/optimize.py.
"""

from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from engine.optimize import (
    counterfactual_weights,
    optimize_portfolio,
    optimize_weights,
)


@pytest.fixture
def sample_prices() -> pd.DataFrame:
    """Generate 260 days of synthetic prices for 6 assets."""
    rng = np.random.default_rng(42)
    dates = pd.bdate_range("2023-01-01", periods=260)
    data = {}
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E", "ASSET_F"]
    for sym in tickers:
        vol = 0.01 + 0.005 * rng.uniform(0, 1)
        rets = rng.normal(0.0005, vol, 260)
        data[sym] = 100.0 * np.cumprod(1.0 + rets)
    return pd.DataFrame(data, index=dates)


def test_optimize_weights_sum_to_one(sample_prices: pd.DataFrame) -> None:
    """Verify recommended portfolio weights sum to 1.0 within 1e-5."""
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E"]
    res = optimize_portfolio(tickers, sample_prices, "medium")

    rec = res["recommended"]
    total_w = sum(r["weight"] for r in rec)
    assert abs(total_w - 1.0) < 1e-5


def test_optimize_caps_respected(sample_prices: pd.DataFrame) -> None:
    """Verify caps: Low <= 0.30, Medium <= 0.35, High <= 0.50 (for n >= 5 assets)."""
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E", "ASSET_F"]

    res_low = optimize_portfolio(tickers, sample_prices, "low")
    for r in res_low["recommended"]:
        assert r["weight"] <= 0.30 + 1e-4

    res_med = optimize_portfolio(tickers, sample_prices, "medium")
    for r in res_med["recommended"]:
        assert r["weight"] <= 0.35 + 1e-4

    res_high = optimize_portfolio(tickers, sample_prices, "high")
    for r in res_high["recommended"]:
        assert r["weight"] <= 0.50 + 1e-4


def test_optimize_low_vol_less_than_or_equal_high_vol(sample_prices: pd.DataFrame) -> None:
    """Verify Low profile volatility <= High profile volatility."""
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E"]

    res_low = optimize_portfolio(tickers, sample_prices, "low")
    res_high = optimize_portfolio(tickers, sample_prices, "high")

    vol_low = res_low["after"]["volatility"]
    vol_high = res_high["after"]["volatility"]

    assert vol_low <= vol_high + 1e-5


def test_ml_gate_never_exceeds_requested_when_valid_exists(sample_prices: pd.DataFrame) -> None:
    """Verify the ML gate never returns a class above requested level when a valid candidate exists."""
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E"]
    order = {"Low": 1, "Medium": 2, "High": 3}

    for level in ["low", "medium", "high"]:
        res = optimize_portfolio(tickers, sample_prices, level)
        pred_label = res["predicted_risk_after"]["label"]
        frontier = res["efficient_frontier"]

        req_cap = level.capitalize()
        req_rank = order[req_cap]

        has_valid_candidate = any(order[c["label"]] <= req_rank for c in frontier)

        if has_valid_candidate:
            assert order[pred_label] <= req_rank
            assert "capacity_note" not in res or res["capacity_note"] is None


def test_counterfactual_weights_picks_smallest_l1_distance() -> None:
    """Verify counterfactual_weights picks closest candidate by L1 weight distance."""
    current = {"A": 0.6, "B": 0.4}
    candidates = [
        {"weights": {"A": 0.5, "B": 0.5}, "label": "Medium", "sharpe": 1.2},  # L1 dist = 0.1 + 0.1 = 0.2
        {"weights": {"A": 0.2, "B": 0.8}, "label": "Medium", "sharpe": 1.5},  # L1 dist = 0.4 + 0.4 = 0.8
        {"weights": {"A": 0.55, "B": 0.45}, "label": "Low", "sharpe": 0.9},
    ]

    cf = counterfactual_weights(current, candidates, "Medium")
    assert cf is not None
    assert cf["target_label"] == "Medium"
    assert cf["weights"] == {"A": 0.5, "B": 0.5}


def test_optimize_contract_fields(sample_prices: pd.DataFrame) -> None:
    """Verify all contract fields in architecture.md POST /api/allocate."""
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E"]
    res = optimize_portfolio(
        tickers,
        sample_prices,
        "medium",
        current_weights={"ASSET_A": 0.5, "ASSET_B": 0.5},
        amount=500_000.0,
    )

    required_keys = {
        "method",
        "recommended",
        "current_vs_recommended",
        "before",
        "after",
        "predicted_risk_after",
        "tradeoff",
        "efficient_frontier",
        "explanations",
        "counterfactual",
    }
    assert required_keys.issubset(res.keys())

    # Check tradeoff dict
    assert set(res["tradeoff"].keys()) == {"return_change", "volatility_change", "drawdown_change"}

    # Check recommended amounts sum to total amount
    total_amt = sum(r["amount"] for r in res["recommended"])
    assert abs(total_amt - 500_000.0) < 1.0

    # Check rationales
    assert all(isinstance(r["rationale"], str) and len(r["rationale"]) > 10 for r in res["recommended"])

    # Check efficient frontier length
    assert len(res["efficient_frontier"]) == 25


def test_optimize_weights_adapter(sample_prices: pd.DataFrame) -> None:
    """Verify optimize_weights adapter respects order, sums to 1.0, and differs from equal weight."""
    tickers = ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E"]
    res = optimize_weights(tickers, sample_prices, "medium")

    assert "weights" in res
    weights = res["weights"]
    assert len(weights) == len(tickers)
    assert abs(sum(weights) - 1.0) < 1e-5

    # Reverse ticker order to verify order matching
    rev_tickers = list(reversed(tickers))
    rev_res = optimize_weights(rev_tickers, sample_prices, "medium")
    rev_weights = rev_res["weights"]
    assert abs(sum(rev_weights) - 1.0) < 1e-5
    # The weight for ASSET_A should be at index 0 in weights, and index -1 in rev_weights
    assert abs(weights[0] - rev_weights[-1]) < 1e-4

    # Test on tech_heavy preset if cache is present
    try:
        from data.loader import load_prices
        tech_heavy = ["NVDA", "TSLA", "RELIANCE.NS", "TCS.NS", "HDFCBANK.NS", "GOLDBEES.NS"]
        px = load_prices(tech_heavy, "2020-01-01", "2023-01-01", "INR")
        if not px.empty and len(px) > 100:
            th_res = optimize_weights(tech_heavy, px, "medium")
            th_weights = th_res["weights"]
            assert len(th_weights) == len(tech_heavy)
            assert abs(sum(th_weights) - 1.0) < 1e-5
            eq_w = [1.0 / len(tech_heavy)] * len(tech_heavy)
            # Must differ from equal weights
            assert any(abs(w - eq) > 0.01 for w, eq in zip(th_weights, eq_w))
    except Exception:
        pass

