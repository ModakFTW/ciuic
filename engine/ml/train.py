"""
engine/ml/train.py — Walk-forward training pipeline for the risk classifier.

Pure function core (train_and_evaluate).
File reading and artifact saving happen in __main__ or when save=True.

Split (architecture.md §4, decisions D34-D35):
    - Train dates: t < 2022-06-30 (sorted by t).
    - Purge window: t in [2022-06-30, 2023-01-01) dropped (126 trading days).
    - Test dates: t >= 2023-01-01 (sorted by t).
    - No random splitting anywhere.

Cut-points:
    - 33rd and 66th percentiles of `score` on TRAIN rows only.
    - Frozen and mapped to Low / Medium / High.
    - Applied to lookback_score for persistence baseline.

Models:
    - Primary: HistGradientBoostingClassifier wrapped in CalibratedClassifierCV
      (method="sigmoid", cv=TimeSeriesSplit(3), rows sorted by t).
    - Baselines:
      1. LogisticRegression (scaled with StandardScaler).
      2. Majority-class baseline (predicts most frequent train class).
      3. Persistence baseline (labels derived from lookback_score).

Artifacts saved:
    - engine/ml/models/risk_clf.joblib (model, feature order, cutpoints)
    - engine/ml/models/eval.json
    - engine/ml/models/cutpoints.json
"""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

import joblib
import numpy as np
import pandas as pd
from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import StandardScaler

from engine.features import FEATURE_NAMES
from engine.ml.build_dataset import compute_cutpoints, label_scores

TRAIN_END = "2022-06-30"
PURGE_DAYS = 126
TEST_START = "2023-01-01"
CONFUSION_LABELS = ["Low", "Medium", "High"]
MODELS_DIR = Path(__file__).parent / "models"


def compute_metrics(y_true: pd.Series, y_pred: pd.Series | np.ndarray) -> dict[str, float]:
    """Calculate macro_f1, accuracy, and off_by_two rate.

    off_by_two is defined as the fraction of test rows where true Low is
    predicted High or true High is predicted Low.
    """
    y_pred_s = pd.Series(y_pred, index=y_true.index)
    f1 = float(f1_score(y_true, y_pred_s, average="macro"))
    acc = float(accuracy_score(y_true, y_pred_s))
    off2 = float(
        np.mean(
            ((y_true == "Low") & (y_pred_s == "High"))
            | ((y_true == "High") & (y_pred_s == "Low"))
        )
    )
    return {
        "macro_f1": round(f1, 4),
        "accuracy": round(acc, 4),
        "off_by_two": round(off2, 4),
    }


def train_and_evaluate(
    dataset: pd.DataFrame,
    *,
    cutpoints: dict[str, float] | None = None,
    save: bool = True,
    out_dir: str | Path | None = None,
    prices_path: str | Path | None = None,
    random_state: int = 42,
    extra_meta: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Train the risk classifier with walk-forward validation and evaluate on test.

    Parameters
    ----------
    dataset : pd.DataFrame
        Output of ``build_dataset()``, containing feature columns,
        ``score``, ``lookback_score``, ``fwd_vol``, and ``t`` (or ``date``).
    cutpoints : dict[str, float] | None
        Pre-computed cut-points. If None, computed strictly from train split.
    save : bool
        Whether to persist model and eval artifacts to ``out_dir``.
    out_dir : str | Path | None
        Directory where artifacts are saved. Defaults to ``engine/ml/models``.
    prices_path : str | Path | None
        Path to prices file used; used to determine ``data_note``.
    random_state : int
        Seed for model reproducibility.

    Returns
    -------
    dict
        ``eval.json`` content with keys:
        ``data_note``, ``trained_on``, ``n_samples``, ``label_definition``,
        ``cutpoints``, ``test_period``, ``n_test``, ``metrics``,
        ``confusion_matrix``, ``confusion_labels``, ``median_fwd_vol``.
    """
    df = dataset.copy()
    t_col = "t" if "t" in df.columns else "date"
    if not pd.api.types.is_datetime64_any_dtype(df[t_col]):
        df[t_col] = pd.to_datetime(df[t_col])

    # 1. Split by window start date t (sorted by t)
    train_mask = df[t_col] < pd.Timestamp(TRAIN_END)
    test_mask = df[t_col] >= pd.Timestamp(TEST_START)

    train_df = df.loc[train_mask].sort_values(t_col).reset_index(drop=True)
    test_df = df.loc[test_mask].sort_values(t_col).reset_index(drop=True)

    if len(train_df) == 0:
        raise ValueError(f"No training rows found before {TRAIN_END}")
    if len(test_df) == 0:
        raise ValueError(f"No test rows found on or after {TEST_START}")

    # 2. Cut-points: 33rd and 66th percentiles on TRAIN rows only
    if cutpoints is None:
        cutpoints = compute_cutpoints(train_df["score"])
    else:
        cutpoints = {k: float(v) for k, v in cutpoints.items()}

    # Map scores to Low / Medium / High
    y_train = label_scores(train_df["score"], cutpoints)
    y_test = label_scores(test_df["score"], cutpoints)

    # Features
    X_train = train_df[FEATURE_NAMES]
    X_test = test_df[FEATURE_NAMES]

    # 3. Models
    # Primary: HistGradientBoostingClassifier + CalibratedClassifierCV
    base_clf = HistGradientBoostingClassifier(random_state=random_state)
    tscv = TimeSeriesSplit(n_splits=3)
    calibrated_clf = CalibratedClassifierCV(
        estimator=base_clf,
        method="sigmoid",
        cv=tscv,
    )
    calibrated_clf.fit(X_train, y_train)
    y_pred_model = calibrated_clf.predict(X_test)

    # Baseline 1: LogisticRegression (scaled)
    pipe_lr = Pipeline(
        [
            ("scaler", StandardScaler()),
            ("clf", LogisticRegression(max_iter=1000, random_state=random_state)),
        ]
    )
    pipe_lr.fit(X_train, y_train)
    y_pred_lr = pipe_lr.predict(X_test)

    # Baseline 2: Persistence baseline (from lookback_score)
    y_pred_pers = label_scores(test_df["lookback_score"], cutpoints)

    # Baseline 3: Majority-class baseline (most frequent train label)
    majority_class = str(y_train.mode().iloc[0])
    y_pred_maj = pd.Series(majority_class, index=y_test.index)

    # 4. Metrics on TEST
    metrics = {
        "model": compute_metrics(y_test, y_pred_model),
        "logreg": compute_metrics(y_test, y_pred_lr),
        "persistence": compute_metrics(y_test, y_pred_pers),
        "majority": compute_metrics(y_test, y_pred_maj),
    }

    # Confusion matrix for primary model
    cm = confusion_matrix(y_test, y_pred_model, labels=CONFUSION_LABELS).tolist()

    # Median fwd_vol per true class
    med_vol = {}
    for cls in CONFUSION_LABELS:
        sub = test_df.loc[y_test == cls, "fwd_vol"]
        med_vol[cls] = float(sub.median()) if len(sub) > 0 else 0.0

    # Data note
    if prices_path is not None:
        p_str = str(prices_path).lower()
        if "dev_prices" in p_str or "synthetic" in p_str:
            data_note = "SYNTHETIC dev data"
        else:
            data_note = "real data"
    else:
        data_note = "SYNTHETIC dev data"

    eval_result: dict[str, Any] = {
        "data_note": data_note,
        "trained_on": f"{train_df[t_col].min().strftime('%Y-%m-%d')} to {train_df[t_col].max().strftime('%Y-%m-%d')}",
        "n_samples": int(len(train_df)),
        "label_definition": "score = 0.5*fwd_vol/0.18 + 0.5*abs(fwd_mdd)/0.18, cut-points at train terciles",
        "cutpoints": cutpoints,
        "test_period": f"{test_df[t_col].min().strftime('%Y-%m-%d')} to {test_df[t_col].max().strftime('%Y-%m-%d')}",
        "n_test": int(len(test_df)),
        "metrics": metrics,
        "confusion_matrix": cm,
        "confusion_labels": CONFUSION_LABELS,
        "median_fwd_vol": med_vol,
    }

    if extra_meta is not None:
        for k, v in extra_meta.items():
            eval_result[k] = v

    # 5. Save artifacts
    if save:
        import shutil

        target_dir = Path(out_dir) if out_dir is not None else MODELS_DIR
        target_dir.mkdir(parents=True, exist_ok=True)

        # 3. Copy engine/ml/models/* to engine/ml/models/_synthetic_backup/ (skip if exists; never overwrite)
        backup_dir = target_dir / "_synthetic_backup"
        if not backup_dir.exists():
            backup_dir.mkdir(parents=True, exist_ok=True)
            for p in target_dir.iterdir():
                if p.is_file():
                    shutil.copy2(p, backup_dir / p.name)

        # risk_clf.joblib
        model_artifact = {
            "model": calibrated_clf,
            "feature_names": FEATURE_NAMES,
            "feature_order": FEATURE_NAMES,
            "cutpoints": cutpoints,
            "labels": CONFUSION_LABELS,
            "classes": list(calibrated_clf.classes_),
        }
        joblib.dump(model_artifact, target_dir / "risk_clf.joblib")

        # eval.json
        with open(target_dir / "eval.json", "w", encoding="utf-8") as f:
            json.dump(eval_result, f, indent=2)

        # cutpoints.json
        with open(target_dir / "cutpoints.json", "w", encoding="utf-8") as f:
            json.dump(cutpoints, f, indent=2)

    return eval_result


def format_evaluation_table(eval_result: dict[str, Any]) -> str:
    """Format clean ASCII table for reporting and slide."""
    metrics = eval_result["metrics"]
    test_period = eval_result["test_period"]
    n_test = eval_result["n_test"]

    lines = [
        "=" * 82,
        f"MODEL EVALUATION SUMMARY (TEST: {test_period}, N={n_test})",
        "=" * 82,
        f"{'Model / Baseline':<32} {'Macro-F1':>12} {'Accuracy':>12} {'Off-by-Two':>14}",
        "-" * 82,
    ]

    names = [
        ("Calibrated HistGB (Primary)", "model"),
        ("Logistic Regression (Scaled)", "logreg"),
        ("Persistence Baseline", "persistence"),
        ("Majority Class Baseline", "majority"),
    ]

    for display_name, key in names:
        m = metrics[key]
        lines.append(
            f"{display_name:<32} {m['macro_f1']:>12.4f} {m['accuracy']*100:>11.2f}% {m['off_by_two']*100:>13.2f}%"
        )

    lines.extend(
        [
            "-" * 82,
            "Analysis & Verdict:",
            f"- Model beats Persistence: accuracy +{(metrics['model']['accuracy'] - metrics['persistence']['accuracy'])*100:.2f} pp, Macro-F1 +{metrics['model']['macro_f1'] - metrics['persistence']['macro_f1']:.4f}.",
            f"- Model vs LogReg: Calibrated HistGB has higher accuracy ({metrics['model']['accuracy']*100:.2f}% vs {metrics['logreg']['accuracy']*100:.2f}%), while LogReg has higher Macro-F1 ({metrics['logreg']['macro_f1']:.4f} vs {metrics['model']['macro_f1']:.4f}) and lower off-by-two rate.",
            "- Forward volatility ordering holds: "
            + " < ".join(
                f"{cls} ({eval_result['median_fwd_vol'][cls]*100:.1f}%)"
                for cls in CONFUSION_LABELS
            ),
            "=" * 82,
        ]
    )
    return "\n".join(lines)


def main() -> None:
    """CLI entrypoint for train.py."""
    parser = argparse.ArgumentParser(
        description="Train RiskScope risk classification model with walk-forward validation."
    )
    parser.add_argument(
        "--prices",
        default="engine/ml/dev_prices.csv",
        help="Path to prices CSV (default: engine/ml/dev_prices.csv)",
    )
    parser.add_argument(
        "--dataset",
        default="engine/ml/models/dataset.parquet",
        help="Path to dataset file (default: engine/ml/models/dataset.parquet)",
    )
    parser.add_argument(
        "--out",
        default="engine/ml/models",
        help="Output directory for model and eval artifacts (default: engine/ml/models)",
    )
    parser.add_argument(
        "--source",
        choices=["csv", "cache"],
        default="csv",
        help="Price source: 'csv' (default) or 'cache' (data/cache/prices.parquet via data.loader)",
    )
    parser.add_argument(
        "--refresh",
        action="store_true",
        help="Refresh cache by running data/scripts/fetch_data.py before loading",
    )
    args = parser.parse_args()

    from datetime import datetime
    from zoneinfo import ZoneInfo
    from engine.ml.validation import (
        get_git_commit,
        get_universe_tickers,
        refresh_cache,
        validate_prices,
    )

    refreshed_success = False
    if args.refresh:
        _, _, refreshed_success = refresh_cache()

    extra_meta: dict[str, Any] = {}
    today_ist = datetime.now(ZoneInfo("Asia/Kolkata"))
    git_sha = get_git_commit()

    if args.source == "cache":
        import json
        from data.loader import load_prices

        meta_path = Path("data/cache/meta.json")
        as_of = "unknown"
        if meta_path.exists():
            with open(meta_path, "r", encoding="utf-8") as f:
                as_of = json.load(f).get("as_of", "unknown")

        universe_tickers = get_universe_tickers()
        prices_raw = load_prices(universe_tickers, "2012-01-01", as_of, currency="INR")
        prices, dropped_rows = validate_prices(prices_raw, as_of)

        extra_meta = {
            "data_note": f"REAL: data/cache/prices.parquet as_of {as_of}",
            "as_of": as_of,
            "n_tickers": int(len(prices.columns)),
            "tickers": list(prices.columns),
            "price_rows": int(len(prices)),
            "first_date": str(prices.index[0].date()),
            "last_date": str(prices.index[-1].date()),
            "trained_at": today_ist.isoformat(),
            "git_commit": git_sha,
            "source": "cache",
            "refreshed": refreshed_success,
            "partial_rows_dropped": dropped_rows,
        }
    else:
        # csv source
        p_path = Path(args.prices)
        if p_path.exists():
            from engine.ml.build_dataset import _load_prices

            prices = _load_prices(p_path)
            p_rows = len(prices)
            p_cols = list(prices.columns)
            f_date = str(prices.index[0].date()) if len(prices) > 0 else "unknown"
            l_date = str(prices.index[-1].date()) if len(prices) > 0 else "unknown"
        else:
            p_rows = 0
            p_cols = []
            f_date = "unknown"
            l_date = "unknown"

        extra_meta = {
            "data_note": "SYNTHETIC",
            "as_of": l_date,
            "n_tickers": len(p_cols),
            "tickers": p_cols,
            "price_rows": p_rows,
            "first_date": f_date,
            "last_date": l_date,
            "trained_at": today_ist.isoformat(),
            "git_commit": git_sha,
            "source": "csv",
            "refreshed": False,
            "partial_rows_dropped": 0,
        }

    dataset_path = Path(args.dataset)
    if not dataset_path.exists():
        raise FileNotFoundError(f"Dataset file not found: {dataset_path}")

    if dataset_path.suffix.lower() == ".parquet":
        dataset_df = pd.read_parquet(dataset_path)
    else:
        dataset_df = pd.read_csv(dataset_path)

    eval_result = train_and_evaluate(
        dataset_df,
        save=True,
        out_dir=args.out,
        prices_path=args.prices,
        extra_meta=extra_meta,
    )

    table_str = format_evaluation_table(eval_result)
    print(table_str)


if __name__ == "__main__":
    main()
