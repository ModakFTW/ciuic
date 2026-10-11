"""
tests/ml/test_build_dataset.py — Unit tests for engine.ml.build_dataset.

Tests:
1. No-leakage test: Feature columns use only data up to t. Overwriting all
   future prices (dates > t) with random garbage leaves feature columns unchanged.
2. Forward dependency: Forward columns (fwd_vol, fwd_mdd, score) genuinely
   depend on future data.
3. Shape and columns on dev_prices: ~4,700 rows (156 dates x 30 portfolios = 4,680),
   all 18 feature columns from architecture.md §4, no NaNs.
4. Cut-points and labels: compute_cutpoints and label_scores contract.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd
import pytest

from engine.features import FEATURE_NAMES
from engine.ml.build_dataset import (
    build_dataset,
    compute_cutpoints,
    label_scores,
)

DEV_PRICES_PATH = Path("engine/ml/dev_prices.csv")


@pytest.fixture(scope="module")
def dev_prices() -> pd.DataFrame:
    """Load dev_prices.csv if present."""
    if not DEV_PRICES_PATH.exists():
        pytest.skip(f"{DEV_PRICES_PATH} not found.")
    df = pd.read_csv(DEV_PRICES_PATH, index_col=0, parse_dates=True)
    return df.sort_index()


@pytest.fixture()
def small_prices() -> pd.DataFrame:
    """Small deterministic prices dataset for fast unit tests (400 trading days)."""
    rng = np.random.default_rng(42)
    dates = pd.bdate_range("2012-01-02", periods=400)
    cols = ["A", "B", "C", "D", "E", "GOLDBEES.NS", "^NSEI", "^NDX"]
    rets = rng.normal(0.0004, 0.012, size=(400, len(cols)))
    px = np.cumprod(1.0 + rets, axis=0) * 100.0
    return pd.DataFrame(px, index=dates, columns=cols)


# ── Leakage tests ──────────────────────────────────────────────────────────


class TestDatasetLeakage:
    """Feature columns must never use data after t."""

    def test_overwrite_future_prices_leaves_features_identical(self, small_prices):
        """Overwriting prices after t leaves feature columns unchanged."""
        df_clean = build_dataset(
            small_prices,
            seed=101,
            sample_interval=21,
            portfolios_per_date=3,
            min_assets=5,
            max_assets=5,
        )
        assert len(df_clean) > 0

        # Choose the first observation date t
        t_first = df_clean["t"].iloc[0]

        # Corrupt all prices strictly after t_first with massive random noise
        corrupted_prices = small_prices.copy()
        mask_future = corrupted_prices.index > t_first
        rng = np.random.default_rng(999)
        corrupted_prices.loc[mask_future, :] = rng.uniform(
            5000.0, 10000.0, size=(mask_future.sum(), corrupted_prices.shape[1])
        )

        df_corrupted = build_dataset(
            corrupted_prices,
            seed=101,
            sample_interval=21,
            portfolios_per_date=3,
            min_assets=5,
            max_assets=5,
        )

        # For rows at t_first: features MUST be bitwise/numerically identical
        rows_clean = df_clean[df_clean["t"] == t_first]
        rows_corrupt = df_corrupted[df_corrupted["t"] == t_first]

        for col in FEATURE_NAMES:
            np.testing.assert_allclose(
                rows_clean[col].values,
                rows_corrupt[col].values,
                rtol=1e-10,
                atol=1e-10,
                err_msg=f"Feature {col} leaked future data!",
            )

        # But forward targets MUST have changed due to corrupted future data
        assert not np.allclose(
            rows_clean["fwd_vol"].values,
            rows_corrupt["fwd_vol"].values,
        ), "fwd_vol should differ when future prices change!"
        assert not np.allclose(
            rows_clean["score"].values,
            rows_corrupt["score"].values,
        ), "score should differ when future prices change!"


# ── Dev prices dataset validation ──────────────────────────────────────────


class TestDevPricesDataset:
    """Verify characteristics of dataset generated from dev_prices.csv."""

    def test_dataset_columns_and_row_count(self, dev_prices):
        """Expect ~4,700 rows (4,680 exact on dev data, 4,830 on real data) with all 18 feature columns and no NaNs."""
        pq_path = Path("engine/ml/models/dataset.parquet")
        eval_path = Path("engine/ml/models/eval.json")
        is_real = False
        if eval_path.exists():
            try:
                with open(eval_path, "r", encoding="utf-8") as f:
                    eval_meta = json.load(f)
                is_real = eval_meta.get("data_note", "").startswith("REAL:")
            except Exception:
                pass

        if pq_path.exists():
            df = pd.read_parquet(pq_path)
        else:
            df = build_dataset(dev_prices, seed=42)

        if is_real:
            assert len(df) >= 4600, f"Expected >= 4,600 rows, got {len(df)}"
        else:
            assert 4600 <= len(df) <= 4800, f"Expected ~4,700 rows, got {len(df)}"
            assert len(df) == 4680

        # All 18 feature columns present
        for feat in FEATURE_NAMES:
            assert feat in df.columns, f"Missing feature {feat}"

        # Target and metadata columns present
        for meta in ["t", "fwd_end", "fwd_vol", "fwd_mdd", "score", "lookback_score", "weights_json"]:
            assert meta in df.columns, f"Missing column {meta}"

        # No NaNs anywhere in features or targets
        assert df[FEATURE_NAMES].isnull().sum().sum() == 0, "NaNs found in features!"
        assert df[["fwd_vol", "fwd_mdd", "score", "lookback_score"]].isnull().sum().sum() == 0

        # Date range
        assert df["t"].min() >= pd.Timestamp("2013-01-01")
        if is_real:
            assert df["t"].max() >= pd.Timestamp("2025-06-24")
        else:
            assert df["t"].max() == pd.Timestamp("2025-06-24")

        # Verify weights JSON format and sum ~1.0
        sample_w = json.loads(df["weights_json"].iloc[0])
        assert 5 <= len(sample_w) <= 10
        assert abs(sum(sample_w.values()) - 1.0) < 1e-3


# ── Cut-points and label helper tests ──────────────────────────────────────


class TestCutpointsAndLabels:
    """Tercile cut-points and labelling logic."""

    def test_cutpoints_terciles(self):
        scores = pd.Series(np.linspace(0.1, 1.0, 100))
        cp = compute_cutpoints(scores)
        assert "low_medium" in cp and "medium_high" in cp
        assert cp["low_medium"] < cp["medium_high"]

    def test_label_scores_distribution(self):
        scores = pd.Series([0.1, 0.2, 0.5, 0.6, 0.9, 1.0])
        cp = {"low_medium": 0.35, "medium_high": 0.75}
        labels = label_scores(scores, cp)
        assert labels.tolist() == ["Low", "Low", "Medium", "Medium", "High", "High"]
