"""
tests/ml/test_explain.py — Unit tests for engine/ml/explain.py.
"""

from unittest.mock import patch
import numpy as np
import pandas as pd
import pytest

from engine.ml.explain import (
    asset_risk_contribution,
    explain_risk,
    return_contribution,
)
from engine.ml.predict import load_model


@pytest.fixture
def sample_prices() -> pd.DataFrame:
    """Generate 260 days of synthetic prices for 5 assets."""
    rng = np.random.default_rng(42)
    dates = pd.bdate_range("2023-01-01", periods=260)
    data = {}
    for sym in ["ASSET_A", "ASSET_B", "ASSET_C", "ASSET_D", "ASSET_E"]:
        daily_rets = rng.normal(0.0005, 0.015, 260)
        data[sym] = 100.0 * np.cumprod(1.0 + daily_rets)
    return pd.DataFrame(data, index=dates)


def test_explain_risk_shap_top5() -> None:
    """Verify explain_risk produces top 5 drivers sorted by absolute impact."""
    artifact = load_model()
    model = artifact["model"]

    # Typical feature vector
    feats = {
        "vol_252": 0.22,
        "vol_63": 0.18,
        "vol_ratio": 1.15,
        "ann_return": 0.12,
        "max_dd": -0.25,
        "current_dd": -0.05,
        "sharpe": 0.65,
        "sortino": 0.90,
        "cvar95": -0.035,
        "avg_corr": 0.65,
        "diversification_ratio": 1.35,
        "hhi": 0.25,
        "top_weight": 0.35,
        "top_rc_share": 0.40,
        "beta_blend": 1.10,
        "equity_share": 0.85,
        "n_assets": 6.0,
        "bench_vol_63": 0.15,
    }

    res = explain_risk(model, feats, "High", top_n=5)

    assert "risk_drivers" in res
    assert "explanations" in res

    drivers = res["risk_drivers"]
    exps = res["explanations"]

    assert len(drivers) == 5
    assert len(exps) == 5

    # Check drivers schema and sorting by |impact|
    prev_abs_impact = float("inf")
    for d in drivers:
        assert "factor" in d and "impact" in d and "direction" in d
        assert isinstance(d["factor"], str)
        assert isinstance(d["impact"], float)
        assert d["direction"] in ("increases", "decreases")

        abs_imp = abs(d["impact"])
        assert abs_imp <= prev_abs_impact + 1e-9
        prev_abs_impact = abs_imp

    # Check explanations are plain English strings
    for exp in exps:
        assert isinstance(exp, str)
        assert len(exp) > 10
        # No raw python code/dict syntax
        assert "{" not in exp and "}" not in exp


def test_explain_risk_polymorphic_signatures(sample_prices: pd.DataFrame) -> None:
    """Verify both (weights, prices) and (model, features, label) work."""
    weights = {"ASSET_A": 0.4, "ASSET_B": 0.3, "ASSET_C": 0.3}

    # Calling with weights, prices
    res1 = explain_risk(weights, sample_prices, top_n=5)
    assert len(res1["risk_drivers"]) == 5
    assert len(res1["explanations"]) == 5

    # Calling with model, features, predicted_label
    artifact = load_model()
    feats = {"vol_252": 0.15, "avg_corr": 0.35, "max_dd": -0.10}
    res2 = explain_risk(artifact["model"], feats, "Low", top_n=3)
    assert len(res2["risk_drivers"]) == 3
    assert len(res2["explanations"]) == 3


def test_explain_risk_fallback_on_shap_error() -> None:
    """Verify permutation sensitivity fallback triggers if SHAP fails."""
    artifact = load_model()
    model = artifact["model"]
    feats = {"vol_252": 0.20, "avg_corr": 0.50, "max_dd": -0.15}

    with patch("engine.ml.explain._compute_shap_impacts", side_effect=RuntimeError("SHAP failed")):
        res = explain_risk(model, feats, "Medium", top_n=3)
        assert len(res["risk_drivers"]) == 3
        assert len(res["explanations"]) == 3
        for d in res["risk_drivers"]:
            assert d["direction"] in ("increases", "decreases")


def test_asset_risk_contribution_sums_to_one() -> None:
    """Verify asset_risk_contribution sums to 1.0 by construction."""
    # Test with dict weights and numpy covariance matrix
    weights_dict = {"A": 0.5, "B": 0.3, "C": 0.2}
    cov_arr = np.array([
        [0.04, 0.01, 0.005],
        [0.01, 0.06, 0.02],
        [0.005, 0.02, 0.05],
    ])
    rc_dict = asset_risk_contribution(weights_dict, cov_arr)

    assert isinstance(rc_dict, dict)
    assert set(rc_dict.keys()) == {"A", "B", "C"}
    assert abs(sum(rc_dict.values()) - 1.0) < 1e-10

    # Test with array weights
    w_arr = np.array([0.5, 0.3, 0.2])
    rc_arr = asset_risk_contribution(w_arr, cov_arr)
    assert isinstance(rc_arr, np.ndarray)
    assert abs(np.sum(rc_arr) - 1.0) < 1e-10

    # Test with DataFrame of prices
    dates = pd.bdate_range("2023-01-01", periods=100)
    prices_df = pd.DataFrame({
        "A": np.linspace(100, 110, 100) + np.random.normal(0, 1, 100),
        "B": np.linspace(50, 55, 100) + np.random.normal(0, 1, 100),
        "C": np.linspace(200, 190, 100) + np.random.normal(0, 2, 100),
    }, index=dates)
    rc_px = asset_risk_contribution(weights_dict, prices_df)
    assert abs(sum(rc_px.values()) - 1.0) < 1e-10


def test_return_contribution() -> None:
    """Verify return_contribution relative sums to 1.0 and absolute equals w * r."""
    weights = {"A": 0.6, "B": 0.4}
    rets = {"A": 0.15, "B": 0.05}

    # Relative return contribution
    rel_rc = return_contribution(weights, rets, relative=True)
    assert isinstance(rel_rc, dict)
    assert abs(sum(rel_rc.values()) - 1.0) < 1e-10

    # Absolute return contribution: w_A * r_A = 0.6 * 0.15 = 0.09
    abs_rc = return_contribution(weights, rets, relative=False)
    assert abs(abs_rc["A"] - 0.09) < 1e-10
    assert abs(abs_rc["B"] - 0.02) < 1e-10
