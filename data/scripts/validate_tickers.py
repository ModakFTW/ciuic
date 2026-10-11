"""
data/scripts/validate_tickers.py  –  Drop tickers with empty data or < 3 years of history.

Run after fetch_data.py: python data/scripts/validate_tickers.py
Updates universe.json in-place, printing what was dropped.

Example: Ticker "INVALID.NS" has 0 rows -> dropped.
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
CACHE_DIR = ROOT / "data" / "cache"
UNIVERSE_PATH = ROOT / "data" / "universe.json"
PRICES_PATH = CACHE_DIR / "prices.parquet"

MIN_YEARS = 3
MIN_ROWS = int(252 * MIN_YEARS)


def validate():
    if not PRICES_PATH.exists():
        print("ERROR: prices.parquet not found. Run fetch_data.py first.")
        sys.exit(1)

    df = pd.read_parquet(PRICES_PATH)
    with open(UNIVERSE_PATH) as f:
        universe = json.load(f)

    valid_assets = []
    dropped_assets = []
    for asset in universe["assets"]:
        ticker = asset["ticker"]
        if ticker not in df.columns:
            dropped_assets.append((ticker, "not in parquet"))
            continue
        n = df[ticker].dropna().shape[0]
        if n < MIN_ROWS:
            dropped_assets.append((ticker, f"only {n} rows < {MIN_ROWS}"))
        else:
            valid_assets.append(asset)

    universe["assets"] = valid_assets

    with open(UNIVERSE_PATH, "w") as f:
        json.dump(universe, f, indent=2)

    print(f"Kept: {len(valid_assets)} assets")
    if dropped_assets:
        print(f"Dropped ({len(dropped_assets)}):")
        for ticker, reason in dropped_assets:
            print(f"  {ticker}: {reason}")
    else:
        print("No assets dropped.")


if __name__ == "__main__":
    validate()
