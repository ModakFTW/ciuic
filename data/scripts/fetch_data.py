"""
data/scripts/fetch_data.py  –  Download adjusted closes and commit to cache.

Run once: python data/scripts/fetch_data.py
Downloads 2012-01-01 to today for all universe assets + benchmarks.
Saves: data/cache/prices.parquet  data/cache/meta.json
"""
from __future__ import annotations

import json
import sys
from datetime import date, datetime
from pathlib import Path

import pandas as pd
import yfinance as yf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))

CACHE_DIR = ROOT / "data" / "cache"
UNIVERSE_PATH = ROOT / "data" / "universe.json"
PRICES_PATH = CACHE_DIR / "prices.parquet"
META_PATH = CACHE_DIR / "meta.json"

START = "2012-01-01"


def load_all_tickers() -> list[str]:
    with open(UNIVERSE_PATH) as f:
        data = json.load(f)
    tickers = [a["ticker"] for a in data["assets"]]
    tickers += [b["ticker"] for b in data["benchmarks"]]
    return tickers


def fetch_and_save(tickers: list[str]) -> pd.DataFrame:
    print(f"Downloading {len(tickers)} tickers from {START} to today...")
    end = str(date.today())

    all_series: dict[str, pd.Series] = {}
    failed = []

    for ticker in tickers:
        try:
            print(f"  Fetching {ticker}...", end=" ", flush=True)
            t = yf.Ticker(ticker)
            hist = t.history(start=START, end=end, auto_adjust=True)
            if hist.empty or "Close" not in hist.columns:
                print("EMPTY")
                failed.append(ticker)
                continue
            close = hist["Close"].copy()
            # Remove timezone info for consistent parquet storage
            close.index = pd.DatetimeIndex(close.index).tz_localize(None)
            all_series[ticker] = close
            print(f"OK ({len(close)} rows)")
        except Exception as e:
            print(f"ERROR: {e}")
            failed.append(ticker)

    if not all_series:
        print("ERROR: No data downloaded. Check internet connection.")
        sys.exit(1)

    combined = pd.DataFrame(all_series)
    combined = combined.sort_index()
    combined.index = pd.DatetimeIndex(combined.index)

    CACHE_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_parquet(PRICES_PATH)

    as_of = str(combined.index[-1].date())
    meta = {
        "as_of": as_of,
        "data_source": "cache",
        "tickers_downloaded": list(combined.columns),
        "tickers_requested": tickers,
        "tickers_failed": failed,
        "start": START,
        "end": end,
        "downloaded_at": datetime.now().isoformat(),
    }
    with open(META_PATH, "w") as f:
        json.dump(meta, f, indent=2)

    print(f"\nSaved {combined.shape[0]} rows x {combined.shape[1]} cols to {PRICES_PATH}")
    if failed:
        print(f"Failed tickers ({len(failed)}): {failed}")
    print(f"as_of: {as_of}")
    return combined


if __name__ == "__main__":
    tickers = load_all_tickers()
    df = fetch_and_save(tickers)
    print("Done.")
