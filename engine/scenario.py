"""
engine/scenario.py — Stress-test scenarios and historical replay.

Pure function. No network, no files, no global state.

Scenarios (decisions D52, D53):
    market_crash:     beta-scaled magnitude shock on all assets.
    market_recovery:  positive beta-scaled shock.
    high_volatility:  covariance × 2, 1,000 Monte Carlo 6-month paths (p5/p50/p95).
    sector_downturn:  sector assets take full magnitude, others 0.25 × beta × magnitude.

Replay windows:
    covid_2020:   2020-02-19 to 2020-03-23  (actual returns)
    bear_2022:    2022-01-03 to 2022-10-12  (actual returns)
    Assets lacking data in the window are renormalized and flagged.
"""

from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


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
    rf: float = 0.065,
    n_mc: int = 1_000,
) -> dict[str, Any]:
    """Apply a stress scenario or historical replay to a portfolio.

    Parameters
    ----------
    weights : dict[str, float]
        Ticker -> weight (sums to 1).
    prices : pd.DataFrame
        Historical daily prices (DatetimeIndex, columns include all tickers).
    scenario : str
        ``"market_crash"`` | ``"market_recovery"`` | ``"high_volatility"``
        | ``"sector_downturn"``.
    amount : float
        Portfolio value before the shock.
    magnitude : float | None
        Shock magnitude (e.g. -0.30 for a 30% crash). Defaults per scenario.
    sector : str | None
        Target sector for ``sector_downturn``. Required for that scenario.
    sector_map : dict[str, str] | None
        Ticker -> sector mapping (from universe.json).
    replay : str | None
        ``"covid_2020"`` | ``"bear_2022"`` | ``None``.
        If set, uses actual historical returns from the window.
    rf : float
        Annualised risk-free rate.
    n_mc : int
        Monte Carlo paths for ``high_volatility`` scenario.

    Returns
    -------
    dict
        Contract fields: ``scenario``, ``value_before``, ``value_after``,
        ``impact_pct``, ``metrics_after``, ``risk_label_before``,
        ``risk_label_after``, ``asset_impacts``, ``mc`` (if applicable),
        ``explanations``.

    Example
    -------
    >>> result = apply_scenario({"A": 0.6, "B": 0.4}, prices, "market_crash",
    ...                         amount=1_000_000, magnitude=-0.30)
    >>> result["value_after"] < result["value_before"]
    True
    """
    raise NotImplementedError("Prompt 4 will implement this.")


# ── Replay window boundaries (D52) ─────────────────────────────────────────
REPLAY_WINDOWS: dict[str, tuple[str, str]] = {
    "covid_2020": ("2020-02-19", "2020-03-23"),
    "bear_2022": ("2022-01-03", "2022-10-12"),
}

# ── Default shock magnitudes ────────────────────────────────────────────────
DEFAULT_MAGNITUDES: dict[str, float] = {
    "market_crash": -0.30,
    "market_recovery": 0.20,
    "high_volatility": 0.0,  # no level shift, just vol scaling
    "sector_downturn": -0.25,
}
