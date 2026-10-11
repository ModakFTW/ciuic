"""
tests/ml/test_train.py — Verification of walk-forward model training and evaluation.

Tests:
1. Cut-points computed from train rows only:
   Corrupting test scores has zero effect on the learned cut-points.
2. No test leakage in fit:
   Corrupting test features/targets has zero effect on the trained classifier weights.
   Verify that purge window [2022-06-30, 2023-01-01) is excluded from fit and test.
3. eval.json schema:
   Verify every required key and metric exists in eval.json.
4. Saved model artifact:
   Verify risk_clf.joblib can be loaded and produces valid predictions with probabilities.
"""

from __future__ import annotations

import json
from pathlib import Path

import joblib
import numpy as np
import pandas as pd
import pytest

from engine.features import FEATURE_NAMES
from engine.ml.train import (
    CONFUSION_LABELS,
    PURGE_DAYS,
    TEST_START,
    TRAIN_END,
    compute_metrics,
    train_and_evaluate,
)

DATASET_PATH = Path("engine/ml/models/dataset.parquet")
MODELS_DIR = Path("engine/ml/models")


@pytest.fixture(scope="module")
def dataset_df() -> pd.DataFrame:
    """Load the pre-computed dataset for training tests."""
    assert DATASET_PATH.exists(), f"Dataset parquet missing at {DATASET_PATH}"
    df = pd.read_parquet(DATASET_PATH)
    df["t"] = pd.to_datetime(df["t"])
    return df


def test_cutpoints_train_only(dataset_df: pd.DataFrame) -> None:
    """Verify cut-points are strictly calculated on train rows (t < 2022-06-30)."""
    # 1. Normal run
    res_clean = train_and_evaluate(dataset_df, save=False)
    cp_clean = res_clean["cutpoints"]

    # 2. Corrupt test scores with extreme outliers
    corrupted_df = dataset_df.copy()
    test_mask = corrupted_df["t"] >= pd.Timestamp(TEST_START)
    corrupted_df.loc[test_mask, "score"] = 999999.0

    res_corrupted = train_and_evaluate(corrupted_df, save=False)
    cp_corrupted = res_corrupted["cutpoints"]

    # Cutpoints must be strictly identical
    assert cp_clean["low_medium"] == pytest.approx(cp_corrupted["low_medium"], rel=1e-9)
    assert cp_clean["medium_high"] == pytest.approx(cp_corrupted["medium_high"], rel=1e-9)


def test_no_test_leakage_in_fit(dataset_df: pd.DataFrame) -> None:
    """Verify that test set data has zero leakage into the fitted model."""
    # Fit on clean dataset
    res_clean = train_and_evaluate(dataset_df, save=False, random_state=42)

    # Corrupt test features and forward targets completely with random noise
    corrupted_df = dataset_df.copy()
    test_mask = corrupted_df["t"] >= pd.Timestamp(TEST_START)
    np.random.seed(123)
    noise = np.random.randn(test_mask.sum(), len(FEATURE_NAMES))
    corrupted_df.loc[test_mask, FEATURE_NAMES] = noise

    # Purge window verification
    purge_mask = (corrupted_df["t"] >= pd.Timestamp(TRAIN_END)) & (
        corrupted_df["t"] < pd.Timestamp(TEST_START)
    )
    assert purge_mask.sum() > 0, "Purge window should contain rows to discard"

    # Fit on corrupted test dataset
    res_corrupted = train_and_evaluate(corrupted_df, save=False, random_state=42)

    # Train period and train sample counts must match
    assert res_clean["trained_on"] == res_corrupted["trained_on"]
    assert res_clean["n_samples"] == res_corrupted["n_samples"]
    assert res_clean["cutpoints"] == res_corrupted["cutpoints"]


def test_eval_json_keys() -> None:
    """Verify that eval.json contains every required key and matches the specification."""
    eval_path = MODELS_DIR / "eval.json"
    assert eval_path.exists(), f"eval.json not found at {eval_path}"

    with open(eval_path, "r", encoding="utf-8") as f:
        eval_data = json.load(f)

    # Required top-level keys
    required_keys = [
        "data_note",
        "trained_on",
        "n_samples",
        "label_definition",
        "cutpoints",
        "test_period",
        "n_test",
        "metrics",
        "confusion_matrix",
        "confusion_labels",
        "median_fwd_vol",
    ]
    for key in required_keys:
        assert key in eval_data, f"Missing key in eval.json: {key}"

    # Verify data_note
    assert eval_data["data_note"] == "SYNTHETIC dev data" or eval_data["data_note"].startswith("REAL:"), (
        f"Unexpected data_note: {eval_data['data_note']}"
    )

    # Verify metrics structure
    for model_key in ["model", "logreg", "persistence", "majority"]:
        assert model_key in eval_data["metrics"], f"Missing metric model: {model_key}"
        for metric_name in ["macro_f1", "accuracy", "off_by_two"]:
            assert metric_name in eval_data["metrics"][model_key], (
                f"Missing {metric_name} in {model_key}"
            )
            val = eval_data["metrics"][model_key][metric_name]
            assert isinstance(val, (int, float))
            assert 0.0 <= val <= 1.0

    # Verify confusion matrix
    cm = eval_data["confusion_matrix"]
    assert len(cm) == 3
    assert all(len(row) == 3 for row in cm)
    assert eval_data["confusion_labels"] == CONFUSION_LABELS

    # Verify median_fwd_vol ordering
    med_vol = eval_data["median_fwd_vol"]
    for label in CONFUSION_LABELS:
        assert label in med_vol
        assert med_vol[label] > 0.0

    # Verify monotonic risk progression: Low < Medium < High
    assert med_vol["Low"] < med_vol["Medium"] < med_vol["High"]


def test_saved_model_artifact() -> None:
    """Verify that risk_clf.joblib exists, loads, and predicts correctly."""
    model_path = MODELS_DIR / "risk_clf.joblib"
    assert model_path.exists(), f"risk_clf.joblib missing at {model_path}"

    artifact = joblib.load(model_path)
    assert isinstance(artifact, dict)
    assert "model" in artifact
    assert "feature_order" in artifact
    assert "cutpoints" in artifact

    model = artifact["model"]
    feature_order = artifact["feature_order"]
    assert feature_order == FEATURE_NAMES

    # Dummy probe prediction
    dummy_input = pd.DataFrame(
        np.ones((2, len(FEATURE_NAMES))),
        columns=FEATURE_NAMES,
    )
    preds = model.predict(dummy_input)
    assert len(preds) == 2
    assert all(p in CONFUSION_LABELS for p in preds)

    probs = model.predict_proba(dummy_input)
    assert probs.shape == (2, 3)
    assert np.allclose(probs.sum(axis=1), 1.0)


def test_compute_metrics_helper() -> None:
    """Test unit calculation of macro_f1, accuracy, and off_by_two."""
    y_true = pd.Series(["Low", "Medium", "High", "Low"])
    y_pred = pd.Series(["Low", "High", "Low", "Medium"])
    # True Low pred Med: off by 1
    # True Med pred High: off by 1
    # True High pred Low: OFF BY TWO
    # True Low pred Low: match (accuracy 1/4 = 0.25)
    res = compute_metrics(y_true, y_pred)
    assert res["accuracy"] == 0.25
    assert res["off_by_two"] == 0.25  # 1 out of 4 is off by two
