"""
tests/ml/test_predict.py — Unit tests for engine/ml/predict.py.
"""

from pathlib import Path
import numpy as np
import pandas as pd
import pytest

from engine.ml.predict import (
    clear_model_cache,
    load_model,
    predict_risk,
    _MODEL_CACHE,
)


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


def test_predict_risk_contract(sample_prices: pd.DataFrame) -> None:
    """Test frozen contract fields: label, probs, risk_score, confidence."""
    weights = {"ASSET_A": 0.3, "ASSET_B": 0.3, "ASSET_C": 0.2, "ASSET_D": 0.1, "ASSET_E": 0.1}
    res = predict_risk(weights, sample_prices)

    assert isinstance(res, dict)
    assert set(res.keys()) == {"label", "probs", "risk_score", "confidence"}
    assert res["label"] in ("Low", "Medium", "High")

    probs = res["probs"]
    assert set(probs.keys()) == {"Low", "Medium", "High"}
    for p in probs.values():
        assert isinstance(p, float)
        assert 0.0 <= p <= 1.0

    assert abs(sum(probs.values()) - 1.0) < 1e-4

    # Formula D37: risk_score = round(100 * (0.5 * p_medium + 1.0 * p_high))
    expected_score = int(round(100.0 * (0.5 * probs["Medium"] + 1.0 * probs["High"])))
    assert res["risk_score"] == expected_score
    assert 0 <= res["risk_score"] <= 100

    # Formula D37: confidence = max(probs)
    assert res["confidence"] == pytest.approx(max(probs.values()), rel=1e-5)


def test_predict_risk_class_order_mapping(sample_prices: pd.DataFrame) -> None:
    """Verify probs are read by class name, not naive position index."""
    artifact = load_model()
    model = artifact["model"]
    classes = list(getattr(model, "classes_", []))
    assert "High" in classes and "Low" in classes and "Medium" in classes

    weights = {"ASSET_A": 0.5, "ASSET_B": 0.5}
    res = predict_risk(weights, sample_prices)

    # Class with highest probability should match predicted label
    best_class = max(res["probs"], key=res["probs"].get)
    assert res["label"] == best_class


def test_predict_risk_lazy_model_cache(sample_prices: pd.DataFrame) -> None:
    """Verify model is cached at module level and re-used."""
    clear_model_cache()
    assert len(_MODEL_CACHE) == 0

    weights = {"ASSET_A": 0.5, "ASSET_B": 0.5}
    predict_risk(weights, sample_prices)
    assert len(_MODEL_CACHE) == 1

    # Second call should use existing cached model
    predict_risk(weights, sample_prices)
    assert len(_MODEL_CACHE) == 1


def test_predict_risk_on_dev_prices() -> None:
    """Test predict_risk on the actual dev_prices.csv artifact."""
    dev_path = Path(__file__).parent.parent.parent / "engine" / "ml" / "dev_prices.csv"
    if not dev_path.exists():
        pytest.skip("dev_prices.csv not present")

    df = pd.read_csv(dev_path, index_col=0, parse_dates=True)
    weights = {"RELIANCE.NS": 0.4, "TCS.NS": 0.3, "INFY.NS": 0.3}
    res = predict_risk(weights, df)

    assert res["label"] in ("Low", "Medium", "High")
    assert 0 <= res["risk_score"] <= 100
    assert abs(sum(res["probs"].values()) - 1.0) < 1e-4


def test_predict_risk_validation_errors(sample_prices: pd.DataFrame) -> None:
    """Verify clean exceptions for invalid inputs."""
    with pytest.raises(ValueError, match="must not be empty"):
        predict_risk({}, sample_prices)

    with pytest.raises(ValueError, match="must not be empty"):
        predict_risk({"ASSET_A": 1.0}, pd.DataFrame())

    with pytest.raises(ValueError, match="positive"):
        predict_risk({"ASSET_A": -0.5, "ASSET_B": 0.5}, sample_prices)
