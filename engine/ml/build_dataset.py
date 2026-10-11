"""
engine/ml/build_dataset.py — Construct the training dataset for risk classification.

Pure function core (takes prices, returns dataset DataFrame).
No I/O inside the function; file reading and saving happens exclusively in __main__.

Sampling (architecture.md §4, decisions D31-D33):
    - Start dates every 21 trading days from 2013-01-01, requiring 252 days
      of history before t and 126 days after.
    - 30 random portfolios per date (5-10 assets, Dirichlet alpha in {1.0, 0.5},
      ~15% of portfolios forced to include one of GOLDBEES.NS, GLD, TLT).
    - Features: portfolio_features at t from engine.features.
    - Forward targets stored RAW: fwd_vol, fwd_mdd, score, lookback_score,
      fwd_end date, t, weights_json.
    - Cut-points and Low/Medium/High labels are NOT assigned here (computed in train.py).
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd

from engine.features import FEATURE_NAMES, portfolio_features

SAFE_TICKERS: list[str] = ["GOLDBEES.NS", "GLD", "TLT"]
DEFAULT_ASSET_CLASSES: dict[str, str] = {
    "GOLDBEES.NS": "commodity",
    "GLD": "commodity",
    "TLT": "bond",
}


def _path_stats(returns: np.ndarray) -> tuple[float, float]:
    """Compute annualised volatility and maximum drawdown over returns."""
    vol = float(np.std(returns, ddof=1) * np.sqrt(252.0))
    cum = np.cumprod(1.0 + returns)
    peak = np.maximum.accumulate(np.concatenate(([1.0], cum)))[1:]
    dd = cum / peak - 1.0
    mdd = float(np.min(dd))
    return vol, mdd


def _score_formula(vol: float, mdd: float) -> float:
    """Label score: 0.5 * vol / 0.18 + 0.5 * abs(mdd) / 0.18."""
    return float(0.5 * (vol / 0.18) + 0.5 * (abs(mdd) / 0.18))


def build_dataset(
    prices: pd.DataFrame,
    bench: pd.Series | pd.DataFrame | None = None,
    asset_class: dict[str, str] | None = None,
    seed: int = 42,
    *,
    sample_interval: int = 21,
    portfolios_per_date: int = 30,
    lookback: int = 252,
    forward: int = 126,
    min_assets: int = 5,
    max_assets: int = 10,
    rf: float = 0.065,
    start_date: str | pd.Timestamp = "2013-01-01",
) -> pd.DataFrame:
    """Build the ML dataset: 18 portfolio features + raw forward targets.

    Parameters
    ----------
    prices : pd.DataFrame
        Daily adjusted-close prices, columns = tickers, DatetimeIndex.
    bench : pd.Series | pd.DataFrame | None
        Blended benchmark (0.5 * NSEI + 0.5 * NDX). Can be returns or prices.
        If None, automatically computed if ^NSEI and ^NDX exist in prices.
    asset_class : dict[str, str] | None
        Ticker -> asset_class mapping. If None, defaults to equity except
        GOLDBEES.NS, GLD, TLT.
    seed : int
        Random seed for Dirichlet weights and asset selection (default 42).
    sample_interval : int
        Trading days between sample dates (default 21).
    portfolios_per_date : int
        Number of random portfolios sampled per date (default 30).
    lookback : int
        Trading days of history required before and including t (default 252).
    forward : int
        Trading days forward for label evaluation (default 126).
    min_assets, max_assets : int
        Asset count range per random portfolio (default 5 to 10).
    rf : float
        Annualised risk-free rate (default 0.065).
    start_date : str | pd.Timestamp
        Earliest eligible sample date t (default '2013-01-01').

    Returns
    -------
    pd.DataFrame
        Columns: 18 feature names + fwd_vol, fwd_mdd, score, lookback_score,
        fwd_end, t, weights_json.

    Example
    -------
    >>> import pandas as pd, numpy as np
    >>> dates = pd.bdate_range("2012-01-01", periods=450)
    >>> px = pd.DataFrame(
    ...     np.cumprod(1 + np.random.normal(0.0005, 0.01, (450, 6))),
    ...     index=dates, columns=["A", "B", "C", "D", "E", "F"]
    ... )
    >>> ds = build_dataset(px, seed=42, min_assets=5, max_assets=5, portfolios_per_date=2)
    >>> "vol_252" in ds.columns and "score" in ds.columns
    True
    """
    if not isinstance(prices.index, pd.DatetimeIndex):
        prices = prices.copy()
        prices.index = pd.to_datetime(prices.index)
    prices = prices.sort_index()
    dates = prices.index
    n_days = len(dates)

    if n_days < lookback + forward:
        raise ValueError(
            f"Need at least {lookback + forward} trading days, got {n_days}."
        )

    # ── Candidate portfolio assets (exclude benchmark indices) ─────────
    candidates = [c for c in prices.columns if not str(c).startswith("^")]
    if len(candidates) < min_assets:
        raise ValueError(
            f"Need at least {min_assets} candidate assets, got {len(candidates)}."
        )

    # ── Safe assets for forced inclusion ───────────────────────────────
    safe_available = [s for s in SAFE_TICKERS if s in candidates]

    # ── Asset class mapping ────────────────────────────────────────────
    if asset_class is None:
        asset_classes = {tk: DEFAULT_ASSET_CLASSES.get(tk, "equity") for tk in candidates}
    else:
        asset_classes = {tk: asset_class.get(tk, DEFAULT_ASSET_CLASSES.get(tk, "equity")) for tk in candidates}

    # ── Blended benchmark price series ─────────────────────────────────
    bench_price_series: pd.Series | None = None
    if bench is not None:
        if isinstance(bench, pd.DataFrame):
            if "^NSEI" in bench.columns and "^NDX" in bench.columns:
                r_n = bench["^NSEI"].pct_change().fillna(0.0)
                r_x = bench["^NDX"].pct_change().fillna(0.0)
                bench_price_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0
            else:
                bench_price_series = bench.iloc[:, 0]
        elif isinstance(bench, pd.Series):
            # If values look like returns, convert to cumulative price series
            if bench.std() < 0.2 and bench.abs().max() < 2.0:
                bench_price_series = (1.0 + bench.fillna(0.0)).cumprod() * 100.0
            else:
                bench_price_series = bench
    elif "^NSEI" in prices.columns and "^NDX" in prices.columns:
        r_n = prices["^NSEI"].pct_change().fillna(0.0)
        r_x = prices["^NDX"].pct_change().fillna(0.0)
        bench_price_series = (1.0 + (0.5 * r_n + 0.5 * r_x)).cumprod() * 100.0

    if bench_price_series is not None:
        bench_price_series.index = dates

    # ── Date sampling ──────────────────────────────────────────────────
    target_dt = pd.Timestamp(start_date)
    first_idx = int(np.searchsorted(dates, target_dt))
    start_pos = max(lookback - 1, first_idx)
    end_pos = n_days - forward

    if start_pos >= end_pos:
        positions = [start_pos] if start_pos < n_days else []
    else:
        positions = list(range(start_pos, end_pos, sample_interval))

    rng = np.random.default_rng(seed)
    rows: list[dict[str, Any]] = []

    for pos in positions:
        t = dates[pos]
        fwd_end = dates[pos + forward]

        # Slices for forward and lookback returns
        # Forward window: from t to t + forward (126 daily returns)
        fwd_price_slice = prices.iloc[pos: pos + forward + 1]
        # Lookback window: last forward+1 days up to t (126 daily returns)
        lookback_price_slice = prices.iloc[pos - forward: pos + 1]

        for _ in range(portfolios_per_date):
            k = int(rng.integers(min_assets, min(max_assets + 1, len(candidates) + 1)))
            chosen = list(rng.choice(candidates, size=k, replace=False))

            # ~15% forced inclusion of one safe asset if none already selected
            if safe_available and rng.random() < 0.15:
                if not set(chosen).intersection(safe_available):
                    chosen[0] = str(rng.choice(safe_available))

            # Dirichlet weights with alpha randomly 1.0 or 0.5
            alpha = float(rng.choice([1.0, 0.5]))
            w = rng.dirichlet(np.full(k, alpha))
            w = np.maximum(w, 1e-4)
            w /= w.sum()

            weights = {tk: float(val) for tk, val in zip(chosen, w)}
            weights_json = json.dumps({tk: round(float(val), 4) for tk, val in zip(chosen, w)})

            # 1. 18 Portfolio features at t (strictly lookback data <= t)
            feats = portfolio_features(
                weights=weights,
                prices=prices,
                t=t,
                bench=bench_price_series,
                asset_classes=asset_classes,
                rf=rf,
            )

            # 2. Forward targets (strictly forward data after t)
            fwd_asset_rets = fwd_price_slice[chosen].pct_change().iloc[1:].values
            w_arr = np.array([weights[tk] for tk in chosen])
            fwd_port_rets = (fwd_asset_rets * w_arr).sum(axis=1)
            fwd_v, fwd_m = _path_stats(fwd_port_rets)
            score = _score_formula(fwd_v, fwd_m)

            # 3. Lookback score (past 126 days up to t for persistence baseline)
            lookback_asset_rets = lookback_price_slice[chosen].pct_change().iloc[1:].values
            lookback_port_rets = (lookback_asset_rets * w_arr).sum(axis=1)
            lb_v, lb_m = _path_stats(lookback_port_rets)
            lookback_score = _score_formula(lb_v, lb_m)

            feats.update({
                "t": t,
                "fwd_end": fwd_end,
                "fwd_vol": fwd_v,
                "fwd_mdd": fwd_m,
                "score": score,
                "lookback_score": lookback_score,
                "weights_json": weights_json,
            })
            rows.append(feats)

    cols = FEATURE_NAMES + [
        "t", "fwd_end", "fwd_vol", "fwd_mdd", "score", "lookback_score", "weights_json"
    ]
    return pd.DataFrame(rows, columns=cols)


def compute_cutpoints(scores: pd.Series) -> dict[str, float]:
    """Compute tercile cut-points (33rd and 66th percentiles) from TRAIN scores only (D32).

    Parameters
    ----------
    scores : pd.Series
        Continuous scores from the training subset.

    Returns
    -------
    dict[str, float]
        {'low_medium': float, 'medium_high': float}.

    Example
    -------
    >>> import pandas as pd
    >>> compute_cutpoints(pd.Series([0.1, 0.3, 0.5, 0.7, 0.9, 1.1]))
    {'low_medium': 0.43..., 'medium_high': 0.76...}
    """
    clean = scores.dropna()
    c1, c2 = np.percentile(clean, [33.0, 66.0])
    return {"low_medium": float(c1), "medium_high": float(c2)}


def label_scores(
    scores: pd.Series,
    cutpoints: dict[str, float],
) -> pd.Series:
    """Assign Low / Medium / High labels based on cut-points.

    Parameters
    ----------
    scores : pd.Series
        Continuous risk scores.
    cutpoints : dict[str, float]
        {'low_medium': float, 'medium_high': float}.

    Returns
    -------
    pd.Series
        Categorical labels 'Low' / 'Medium' / 'High'.

    Example
    -------
    >>> import pandas as pd
    >>> cp = {"low_medium": 0.4, "medium_high": 0.8}
    >>> label_scores(pd.Series([0.2, 0.6, 1.0]), cp).tolist()
    ['Low', 'Medium', 'High']
    """
    c1 = cutpoints["low_medium"]
    c2 = cutpoints["medium_high"]
    labels = np.where(scores < c1, "Low", np.where(scores < c2, "Medium", "High"))
    return pd.Series(labels, index=scores.index, name="label")


def _load_prices(path: str | Path) -> pd.DataFrame:
    """Load prices from CSV or Parquet."""
    p = Path(path)
    if not p.exists():
        raise FileNotFoundError(f"Prices file not found: {p}")
    if p.suffix.lower() == ".parquet":
        df = pd.read_parquet(p)
    else:
        df = pd.read_csv(p, index_col=0, parse_dates=True)
    if not isinstance(df.index, pd.DatetimeIndex):
        df.index = pd.to_datetime(df.index)
    return df.sort_index()


def main() -> None:
    """CLI entrypoint for dataset construction."""
    parser = argparse.ArgumentParser(
        description="Construct training dataset for RiskScope risk classification."
    )
    parser.add_argument(
        "--prices",
        default="engine/ml/dev_prices.csv",
        help="Path to prices CSV or Parquet (default: engine/ml/dev_prices.csv)",
    )
    parser.add_argument(
        "--out",
        default="engine/ml/models/dataset.parquet",
        help="Output path for dataset (default: engine/ml/models/dataset.parquet)",
    )
    parser.add_argument(
        "--seed",
        type=int,
        default=42,
        help="Random seed for sampling (default: 42)",
    )
    args = parser.parse_args()

    prices = _load_prices(args.prices)
    df = build_dataset(prices, seed=args.seed)

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    if out_path.suffix.lower() == ".parquet":
        df.to_parquet(out_path, index=False)
    else:
        df.to_csv(out_path, index=False)

    print(
        f"Dataset generated: {len(df)} rows from {df['t'].min().date()} to {df['t'].max().date()} saved to {out_path}"
    )


if __name__ == "__main__":
    main()
