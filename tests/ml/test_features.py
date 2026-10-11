"""
tests/ml/test_features.py — Tests for engine/features.py.

(a) No-leakage: features at t unchanged when prices after t are garbage.
(b) hhi and top_weight on known weight vector.
(c) NaN-free output on synthetic prices.
"""

from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from engine.features import FEATURE_NAMES, portfolio_features
from engine.ml.synthetic import make_synthetic_prices


@pytest.fixture()
def synth_prices():
    """Synthetic prices with 252+ days before the test date."""
    return make_synthetic_prices(
        ["A", "B", "C", "D", "E"], "2018-01-01", "2023-12-31", seed=99
    )


@pytest.fixture()
def weights_5():
    return {"A": 0.30, "B": 0.25, "C": 0.20, "D": 0.15, "E": 0.10}


@pytest.fixture()
def t_date(synth_prices):
    """Pick a date with at least 252 days of history."""
    return synth_prices.index[300]


# ── (a) No-leakage test ────────────────────────────────────────────────────


class TestNoLeakage:
    def test_features_unchanged_when_future_is_garbage(
        self, synth_prices, weights_5, t_date
    ):
        feats_clean = portfolio_features(weights_5, synth_prices, t_date)

        # Overwrite everything after t with random garbage
        corrupted = synth_prices.copy()
        future_mask = corrupted.index > t_date
        rng = np.random.default_rng(777)
        corrupted.loc[future_mask] = rng.uniform(1, 9999, size=(future_mask.sum(), corrupted.shape[1]))

        feats_dirty = portfolio_features(weights_5, corrupted, t_date)

        for key in FEATURE_NAMES:
            assert feats_clean[key] == pytest.approx(
                feats_dirty[key], nan_ok=True
            ), f"Leakage detected in feature '{key}'"


# ── (b) Known weight vector checks ─────────────────────────────────────────


class TestKnownWeights:
    def test_hhi_known(self, synth_prices, t_date):
        w = {"A": 0.5, "B": 0.3, "C": 0.2}
        feats = portfolio_features(w, synth_prices, t_date)
        expected_hhi = 0.5**2 + 0.3**2 + 0.2**2  # 0.38
        assert feats["hhi"] == pytest.approx(expected_hhi, abs=1e-10)

    def test_top_weight_known(self, synth_prices, t_date):
        w = {"A": 0.5, "B": 0.3, "C": 0.2}
        feats = portfolio_features(w, synth_prices, t_date)
        assert feats["top_weight"] == pytest.approx(0.5, abs=1e-10)

    def test_n_assets(self, synth_prices, t_date):
        w = {"A": 0.5, "B": 0.3, "C": 0.2}
        feats = portfolio_features(w, synth_prices, t_date)
        assert feats["n_assets"] == 3.0

    def test_hhi_single_asset(self, synth_prices, t_date):
        w = {"A": 1.0}
        feats = portfolio_features(w, synth_prices, t_date)
        assert feats["hhi"] == pytest.approx(1.0)
        assert feats["top_weight"] == pytest.approx(1.0)


# ── (c) NaN-free output ────────────────────────────────────────────────────


class TestNaNFree:
    def test_no_nans_without_bench(self, synth_prices, weights_5, t_date):
        """All features except beta_blend and bench_vol_63 should be non-NaN."""
        feats = portfolio_features(weights_5, synth_prices, t_date)
        for key in FEATURE_NAMES:
            if key in ("beta_blend", "bench_vol_63"):
                continue  # NaN expected when no benchmark passed
            assert not np.isnan(feats[key]), f"NaN in feature '{key}'"

    def test_no_nans_with_bench(self, synth_prices, weights_5, t_date):
        """All features including beta/bench should be non-NaN when bench is provided."""
        bench = synth_prices["A"] * 0.5 + synth_prices["B"] * 0.5
        feats = portfolio_features(weights_5, synth_prices, t_date, bench=bench)
        for key in FEATURE_NAMES:
            assert not np.isnan(feats[key]), f"NaN in feature '{key}'"

    def test_returns_all_keys(self, synth_prices, weights_5, t_date):
        feats = portfolio_features(weights_5, synth_prices, t_date)
        assert sorted(feats.keys()) == sorted(FEATURE_NAMES)


# ── Edge cases ──────────────────────────────────────────────────────────────


class TestEdgeCases:
    def test_insufficient_history_raises(self):
        dates = pd.bdate_range("2023-01-01", periods=100)
        prices = pd.DataFrame({"A": np.linspace(100, 110, 100)}, index=dates)
        with pytest.raises(ValueError, match="Need 252"):
            portfolio_features({"A": 1.0}, prices, dates[-1])

    def test_equity_share(self, synth_prices, t_date):
        w = {"A": 0.6, "B": 0.4}
        ac = {"A": "equity", "B": "gold"}
        feats = portfolio_features(w, synth_prices, t_date, asset_classes=ac)
        assert feats["equity_share"] == pytest.approx(0.6)
