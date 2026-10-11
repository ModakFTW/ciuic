"""RiskScope synthetic data generator (SYNTHETIC: not real market data).

Produces, in ./riskscope_synthetic/:
  universe.csv, presets.json, regime_calendar.csv, usdinr.csv, prices_inr.csv,
  dataset_full.csv, eval.json, demo_asset_stats.csv, shock_2025_daily_log.csv,
  pipeline_log.txt

Model: 3 global/regional factors + tech factor + idiosyncratic noise (fat tails),
with stylised regimes (covid_2020, bear_2022, shock_2025 ...). Regime windows are
calibrated so their cumulative factor move hits the design target.
"""
import json
import logging
import sys
from pathlib import Path

import numpy as np
import pandas as pd

SEED = 42
SQ = np.sqrt(252)
RF = 0.065
OUT = Path("riskscope_synthetic")
OUT.mkdir(exist_ok=True)

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s | %(levelname)s | %(message)s",
    handlers=[logging.FileHandler(OUT / "pipeline_log.txt", mode="w"), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("riskscope")
rng = np.random.default_rng(SEED)

# ticker, name, sector, market, currency, asset_class, beta, tech_load, idio_vol, alpha
U = [
    ("RELIANCE.NS", "Reliance Industries", "Energy", "IN", "INR", "equity", 1.0, 0.0, 0.24, 0.03),
    ("TCS.NS", "Tata Consultancy Services", "IT", "IN", "INR", "equity", 0.7, 0.5, 0.20, 0.04),
    ("HDFCBANK.NS", "HDFC Bank", "Financials", "IN", "INR", "equity", 1.0, 0.0, 0.20, 0.03),
    ("INFY.NS", "Infosys", "IT", "IN", "INR", "equity", 0.75, 0.5, 0.24, 0.03),
    ("ICICIBANK.NS", "ICICI Bank", "Financials", "IN", "INR", "equity", 1.1, 0.0, 0.24, 0.04),
    ("ITC.NS", "ITC", "Consumer Staples", "IN", "INR", "equity", 0.6, 0.0, 0.20, 0.04),
    ("SBIN.NS", "State Bank of India", "Financials", "IN", "INR", "equity", 1.3, 0.0, 0.32, 0.04),
    ("BHARTIARTL.NS", "Bharti Airtel", "Telecom", "IN", "INR", "equity", 0.8, 0.0, 0.26, 0.05),
    ("LT.NS", "Larsen & Toubro", "Industrials", "IN", "INR", "equity", 1.1, 0.0, 0.24, 0.04),
    ("HINDUNILVR.NS", "Hindustan Unilever", "Consumer Staples", "IN", "INR", "equity", 0.5, 0.0, 0.18, 0.02),
    ("SUNPHARMA.NS", "Sun Pharma", "Healthcare", "IN", "INR", "equity", 0.7, 0.0, 0.26, 0.03),
    ("MARUTI.NS", "Maruti Suzuki", "Consumer Discretionary", "IN", "INR", "equity", 0.9, 0.0, 0.25, 0.03),
    ("BAJFINANCE.NS", "Bajaj Finance", "Financials", "IN", "INR", "equity", 1.3, 0.0, 0.30, 0.06),
    ("KOTAKBANK.NS", "Kotak Mahindra Bank", "Financials", "IN", "INR", "equity", 1.0, 0.0, 0.22, 0.02),
    ("ASIANPAINT.NS", "Asian Paints", "Materials", "IN", "INR", "equity", 0.7, 0.0, 0.22, 0.03),
    ("TITAN.NS", "Titan Company", "Consumer Discretionary", "IN", "INR", "equity", 1.0, 0.0, 0.27, 0.05),
    ("GOLDBEES.NS", "Nippon Gold BeES", "Gold", "IN", "INR", "commodity", 0.0, 0.0, 0.02, 0.0),
    ("NIFTYBEES.NS", "Nippon Nifty BeES", "Index", "IN", "INR", "equity", 0.95, 0.0, 0.015, 0.0),
    ("AAPL", "Apple", "IT", "US", "USD", "equity", 1.0, 0.5, 0.22, 0.05),
    ("MSFT", "Microsoft", "IT", "US", "USD", "equity", 1.0, 0.5, 0.20, 0.05),
    ("NVDA", "NVIDIA", "IT", "US", "USD", "equity", 1.3, 1.3, 0.30, 0.20),
    ("GOOGL", "Alphabet", "Communication", "US", "USD", "equity", 1.0, 0.5, 0.22, 0.04),
    ("AMZN", "Amazon", "Consumer Discretionary", "US", "USD", "equity", 1.1, 0.6, 0.25, 0.05),
    ("META", "Meta Platforms", "Communication", "US", "USD", "equity", 1.2, 0.6, 0.30, 0.06),
    ("TSLA", "Tesla", "Consumer Discretionary", "US", "USD", "equity", 1.3, 0.8, 0.42, 0.10),
    ("JPM", "JPMorgan Chase", "Financials", "US", "USD", "equity", 1.0, 0.0, 0.20, 0.04),
    ("JNJ", "Johnson & Johnson", "Healthcare", "US", "USD", "equity", 0.5, 0.0, 0.15, 0.02),
    ("XOM", "Exxon Mobil", "Energy", "US", "USD", "equity", 0.9, 0.0, 0.24, 0.02),
    ("KO", "Coca-Cola", "Consumer Staples", "US", "USD", "equity", 0.5, 0.0, 0.14, 0.02),
    ("WMT", "Walmart", "Consumer Staples", "US", "USD", "equity", 0.5, 0.0, 0.16, 0.04),
    ("PG", "Procter & Gamble", "Consumer Staples", "US", "USD", "equity", 0.5, 0.0, 0.14, 0.02),
    ("V", "Visa", "Financials", "US", "USD", "equity", 1.0, 0.2, 0.18, 0.05),
    ("QQQ", "Invesco QQQ", "Index", "US", "USD", "equity", 1.1, 0.9, 0.03, 0.0),
    ("SPY", "SPDR S&P 500", "Index", "US", "USD", "equity", 1.0, 0.1, 0.02, 0.0),
    ("TLT", "iShares 20+Y Treasury", "Bonds", "US", "USD", "bond", -0.10, 0.0, 0.13, 0.0),
    ("GLD", "SPDR Gold Shares", "Gold", "US", "USD", "commodity", 0.0, 0.0, 0.02, 0.0),
]
BENCH = [("^NSEI", "IN", 0.95, 0.0), ("^NDX", "US", 1.10, 0.9)]
TICKERS = [u[0] for u in U]
A = len(TICKERS)
META = {u[0]: u for u in U}
SAFE = [TICKERS.index(t) for t in ("GOLDBEES.NS", "GLD", "TLT")]
EQ_MASK = np.array([1.0 if META[t][5] == "equity" else 0.0 for t in TICKERS])

dates = pd.bdate_range("2012-01-02", "2025-12-31")
n = len(dates)

# ---------------- regimes ----------------
BASE = dict(vm=1.0, mkt=0.00035, tech=0.0002, inr=0.0, usr=0.0, tlt=0.0, gold=0.0, fx=0.0)
REGIMES = [
    ("covid_2020", "2020-02-19", "2020-03-23", dict(vm=3.2, mkt=-0.0160, tech=-0.0020, tlt=0.0005, gold=0.0001, fx=0.0008)),
    ("recovery_2020", "2020-03-24", "2020-08-31", dict(vm=1.8, mkt=0.0035, tech=0.0015)),
    ("bull_2021", "2021-01-01", "2021-12-31", dict(vm=0.9, mkt=0.0008, tech=0.0006)),
    ("bear_2022", "2022-01-03", "2022-10-12", dict(vm=1.4, mkt=-0.0012, tech=-0.0015, inr=0.0006, tlt=-0.0007, fx=0.0003)),
    ("recovery_2023", "2023-01-01", "2023-12-31", dict(vm=1.0, mkt=0.0007, tech=0.0006)),
    ("shock_2025", "2025-02-19", "2025-04-08", dict(vm=1.9, mkt=-0.0056, tech=-0.0012, inr=0.0030, tlt=0.0003, gold=0.0006, fx=0.0004)),
    ("rebound_2025", "2025-04-09", "2025-06-30", dict(vm=1.8, mkt=0.0040, tech=0.0015, inr=-0.0005, gold=0.0002)),
]
par = {k: np.full(n, v, dtype=float) for k, v in BASE.items()}
regime_name = np.array(["normal"] * n, dtype=object)
windows = []
for name, s, e, over in REGIMES:
    m = (dates >= s) & (dates <= e)
    windows.append((name, m))
    regime_name[m] = name
    for k, v in over.items():
        par[k][m] = v

pd.DataFrame(
    [{"regime": r[0], "start": r[1], "end": r[2], **{k: r[3].get(k, BASE[k]) for k in BASE}} for r in REGIMES]
).to_csv(OUT / "regime_calendar.csv", index=False)


def t_noise(size):
    """Standardised Student-t (df=5): fat tails, unit variance."""
    return rng.standard_t(5, size=size) / np.sqrt(5 / 3)


def calibrated(eps, masks):
    """Within each regime window force sample mean 0 / std 1 so the drift target is hit exactly."""
    eps = eps.copy()
    for m in masks:
        if m.sum() > 5:
            seg = eps[m]
            eps[m] = (seg - seg.mean()) / seg.std()
    return eps


masks = [m for _, m in windows]
e_mkt = calibrated(t_noise(n), masks)
e_tech = calibrated(t_noise(n), masks)
e_in = calibrated(t_noise(n), masks)
e_us = calibrated(t_noise(n), masks)
e_fx, e_gold = t_noise(n), t_noise(n)

mkt = par["mkt"] + 0.14 / SQ * par["vm"] * e_mkt
tech = par["tech"] + 0.13 / SQ * par["vm"] * e_tech
reg_in = par["inr"] + 0.09 / SQ * e_in
reg_us = par["usr"] + 0.09 / SQ * e_us
fx_ret = 0.00010 + par["fx"] + 0.04 / SQ * e_fx
gold_usd = 0.08 / 252 + par["gold"] + 0.13 / SQ * e_gold - 0.05 * mkt
idio_scale = 1 + 0.5 * (par["vm"] - 1)

ret_local = pd.DataFrame(index=dates, columns=TICKERS + [b[0] for b in BENCH], dtype=float)
for t, name, sector, mk, cur, ac, beta, tl, iv, alpha in U:
    if t in ("GOLDBEES.NS", "GLD"):
        r = gold_usd + iv / SQ * t_noise(n)
    elif t == "TLT":
        r = beta * mkt + par["tlt"] + 0.02 / 252 + iv / SQ * t_noise(n)
    else:
        reg = reg_in if mk == "IN" else reg_us
        r = beta * mkt + tl * tech + reg + alpha / 252 + iv / SQ * idio_scale * t_noise(n)
    ret_local[t] = r
for t, mk, beta, tl in BENCH:
    reg = reg_in if mk == "IN" else reg_us
    ret_local[t] = beta * mkt + tl * tech + reg + 0.005 / SQ * t_noise(n)
ret_local = ret_local.clip(lower=-0.45, upper=0.45)
ret_local.iloc[0] = 0.0
fx_ret[0] = 0.0

# INR conversion: USD-denominated assets pick up the daily USDINR move; GOLDBEES is INR gold.
is_usd = [META[t][4] == "USD" for t in TICKERS] + [True if b[0] == "^NDX" else False for b in BENCH]
ret_inr = ret_local.copy()
for col, usd in zip(ret_inr.columns, is_usd):
    if usd:
        ret_inr[col] = (1 + ret_local[col]) * (1 + fx_ret) - 1
ret_inr["GOLDBEES.NS"] = (1 + ret_local["GOLDBEES.NS"]) * (1 + fx_ret) - 1

start_px = pd.Series(np.round(rng.uniform(80, 1500, size=ret_local.shape[1]), 2), index=ret_local.columns)
prices_inr = (1 + ret_inr).cumprod() * start_px
prices_inr.round(4).rename_axis("date").to_csv(OUT / "prices_inr.csv")
usdinr = (1 + pd.Series(fx_ret, index=dates)).cumprod() * 51.0
usdinr.round(4).rename("USDINR").rename_axis("date").to_csv(OUT / "usdinr.csv")
pd.DataFrame(
    [{"ticker": u[0], "name": u[1], "sector": u[2], "market": u[3], "currency": u[4], "asset_class": u[5]} for u in U]
).to_csv(OUT / "universe.csv", index=False)
log.info("prices: %d days x %d columns (%s to %s)", n, prices_inr.shape[1], dates[0].date(), dates[-1].date())

# window sanity for the 2025 shock
def window_move(col, s, e, local=True):
    p = (1 + (ret_local if local else ret_inr)[col]).cumprod()
    seg = p[(p.index >= s) & (p.index <= e)]
    return seg.iloc[-1] / seg.iloc[0] - 1, (seg / seg.cummax() - 1).min()

for col, loc in (("SPY", True), ("QQQ", True), ("^NDX", True), ("^NSEI", True), ("TLT", True), ("GLD", True)):
    tot, mdd = window_move(col, "2025-02-19", "2025-04-08", loc)
    log.info("shock_2025 window %-7s total %+6.1f%%  max_dd %+6.1f%%", col, 100 * tot, 100 * mdd)

# ---------------- feature + dataset code ----------------
R = ret_inr[TICKERS].to_numpy()
bench_all = (0.5 * ret_inr["^NSEI"] + 0.5 * ret_inr["^NDX"]).to_numpy()
FEATURES = ["vol_252", "vol_63", "vol_ratio", "ann_return", "max_dd", "current_dd", "sharpe", "sortino", "cvar95",
            "avg_corr", "diversification_ratio", "hhi", "top_weight", "top_rc_share", "beta_blend",
            "equity_share", "n_assets", "bench_vol_63"]


def path_stats(p):
    cum = np.cumprod(1 + p)
    peak = np.maximum.accumulate(np.concatenate(([1.0], cum)))[1:]
    return p.std(ddof=1) * SQ, (cum / peak - 1).min()


def score_fn(vol, mdd):
    return 0.5 * vol / 0.18 + 0.5 * abs(mdd) / 0.18


def features_at(t, idx, w, S_full, C_full):
    """Features from the 252 trading days ending at position t (inclusive). No data after t."""
    X = R[t - 251: t + 1][:, idx]
    bw = bench_all[t - 251: t + 1]
    p = X @ w
    cum = np.cumprod(1 + p)
    dd = cum / np.maximum.accumulate(cum) - 1
    vol252 = p.std(ddof=1) * SQ
    vol63 = p[-63:].std(ddof=1) * SQ
    ann = cum[-1] - 1
    dev = np.sqrt((np.minimum(p - RF / 252, 0) ** 2).mean()) * SQ
    q = np.quantile(p, 0.05)
    k = len(idx)
    S = S_full[np.ix_(idx, idx)]
    C = C_full[np.ix_(idx, idx)]
    pv = w @ S @ w
    rc = w * (S @ w) / pv
    return dict(
        vol_252=vol252, vol_63=vol63, vol_ratio=vol63 / vol252, ann_return=ann, max_dd=dd.min(),
        current_dd=dd[-1], sharpe=(ann - RF) / vol252, sortino=(ann - RF) / dev if dev > 1e-9 else 0.0,
        cvar95=p[p <= q].mean(), avg_corr=(C.sum() - k) / (k * (k - 1)),
        diversification_ratio=(w * np.sqrt(np.diag(S))).sum() / np.sqrt(pv), hhi=float((w ** 2).sum()),
        top_weight=float(w.max()), top_rc_share=float(rc.max()),
        beta_blend=np.cov(p, bw)[0, 1] / bw.var(ddof=1), equity_share=float((w * EQ_MASK[idx]).sum()),
        n_assets=k, bench_vol_63=bw[-63:].std(ddof=1) * SQ,
    ), p


def window_cov(t):
    W = R[t - 251: t + 1]
    return np.cov(W.T) * 252, np.corrcoef(W.T)


first = int(np.searchsorted(dates, pd.Timestamp("2013-01-01")))
positions = list(range(max(252, first), n - 126, 21))
rows = []
for t in positions:
    S_full, C_full = window_cov(t)
    for _ in range(30):
        k = int(rng.integers(5, 11))
        idx = rng.choice(A, size=k, replace=False)
        if rng.random() < 0.15 and not set(idx) & set(SAFE):
            idx[0] = rng.choice([s for s in SAFE if s not in idx])
        w = rng.dirichlet(np.full(k, rng.choice([1.0, 0.5])))
        w = np.maximum(w, 1e-4)
        w /= w.sum()
        f, p = features_at(t, idx, w, S_full, C_full)
        fp = R[t + 1: t + 127][:, idx] @ w                     # forward window: strictly AFTER t
        fv, fm = path_stats(fp)
        lv, lm = path_stats(p[-126:])                          # lookback window for persistence baseline
        f.update(t=dates[t], fwd_end=dates[t + 126], fwd_vol=fv, fwd_mdd=fm, score=score_fn(fv, fm),
                 lookback_score=score_fn(lv, lm),
                 weights_json=json.dumps({TICKERS[i]: round(float(x), 4) for i, x in zip(idx, w)}))
        rows.append(f)
df = pd.DataFrame(rows)
log.info("dataset rows: %d (%d dates x 30 portfolios), t from %s to %s", len(df), len(positions),
         df.t.min().date(), df.t.max().date())

# ---------------- split, labels, models ----------------
df["split"] = np.where(df.t < "2022-06-30", "train", np.where(df.t < "2023-01-01", "purged", "test"))
tr = df[df.split == "train"]
c1, c2 = np.percentile(tr.score, [33, 66])
lab = lambda s: np.where(s < c1, "Low", np.where(s < c2, "Medium", "High"))
df["label"] = lab(df.score)
df["lookback_label"] = lab(df.lookback_score)
log.info("cutpoints (TRAIN only): 33rd=%.4f 66th=%.4f", c1, c2)
log.info("rows per split: %s", df.split.value_counts().to_dict())
log.info("train class counts: %s", df[df.split == "train"].label.value_counts().to_dict())
log.info("test class counts: %s", df[df.split == "test"].label.value_counts().to_dict())

from sklearn.calibration import CalibratedClassifierCV
from sklearn.ensemble import HistGradientBoostingClassifier
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import accuracy_score, confusion_matrix, f1_score
from sklearn.model_selection import TimeSeriesSplit
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

LABELS = ["Low", "Medium", "High"]
tr = df[df.split == "train"].sort_values("t")
te = df[df.split == "test"].sort_values("t")
Xtr, ytr, Xte, yte = tr[FEATURES], tr.label, te[FEATURES], te.label

hgb = CalibratedClassifierCV(
    HistGradientBoostingClassifier(max_depth=4, learning_rate=0.05, max_iter=250, random_state=SEED),
    method="sigmoid", cv=TimeSeriesSplit(n_splits=3))
hgb.fit(Xtr, ytr)
logreg = make_pipeline(StandardScaler(), LogisticRegression(max_iter=2000)).fit(Xtr, ytr)
majority = ytr.value_counts().idxmax()
preds = {
    "model": hgb.predict(Xte),
    "logreg": logreg.predict(Xte),
    "persistence": te.lookback_label.to_numpy(),
    "majority": np.full(len(te), majority),
}


def off2(y, p):
    y, p = np.asarray(y), np.asarray(p)
    return float((((y == "Low") & (p == "High")) | ((y == "High") & (p == "Low"))).mean())


metrics = {k: dict(macro_f1=round(float(f1_score(yte, v, average="macro")), 4),
                   accuracy=round(float(accuracy_score(yte, v)), 4), off_by_two=round(off2(yte, v), 4))
           for k, v in preds.items()}
cm = confusion_matrix(yte, preds["model"], labels=LABELS).tolist()
med_vol = te.groupby("label").fwd_vol.median().round(4).to_dict()
eval_json = dict(
    data_note="SYNTHETIC data; numbers are for pipeline understanding only, not for the pitch",
    trained_on=f"{tr.t.min().date()} to {tr.t.max().date()}", n_samples=int(len(tr)),
    label_definition="score = 0.5*fwd_vol/0.18 + 0.5*abs(fwd_mdd)/0.18 over next 126 trading days; terciles on TRAIN only",
    cutpoints=dict(p33=round(float(c1), 4), p66=round(float(c2), 4)),
    test_period=f"{te.t.min().date()} to {te.t.max().date()}", n_test=int(len(te)),
    metrics=metrics, confusion_matrix=cm, confusion_labels=LABELS, median_fwd_vol=med_vol)
(OUT / "eval.json").write_text(json.dumps(eval_json, indent=2))
log.info("TEST metrics:\n%s", pd.DataFrame(metrics).T.to_string())
log.info("confusion matrix (rows=true, cols=pred, order %s): %s", LABELS, cm)
log.info("median fwd_vol by true class (test): %s", med_vol)
df.sort_values(["t"]).to_csv(OUT / "dataset_full.csv", index=False)

# ---------------- demo portfolio: asset stats + 2025 shock daily log ----------------
DEMO = {"NVDA": 0.25, "TSLA": 0.20, "RELIANCE.NS": 0.15, "TCS.NS": 0.15, "HDFCBANK.NS": 0.15, "GOLDBEES.NS": 0.10}
presets = {"presets": [
    {"id": "tech_heavy", "name": "Tech heavy (demo: Aman)", "risk_level": "high", "currency": "INR",
     "holdings": [{"ticker": k, "amount": int(v * 1_000_000)} for k, v in DEMO.items()]},
    {"id": "balanced_india", "name": "Balanced India", "risk_level": "medium", "currency": "INR",
     "holdings": [{"ticker": k, "amount": a} for k, a in [("RELIANCE.NS", 150000), ("TCS.NS", 150000),
                  ("HDFCBANK.NS", 150000), ("ITC.NS", 150000), ("HINDUNILVR.NS", 100000),
                  ("NIFTYBEES.NS", 150000), ("GOLDBEES.NS", 150000)]]},
    {"id": "global_mix", "name": "Global mix", "risk_level": "medium", "currency": "INR",
     "holdings": [{"ticker": k, "amount": a} for k, a in [("AAPL", 150000), ("MSFT", 150000), ("JNJ", 100000),
                  ("KO", 100000), ("SPY", 150000), ("TLT", 100000), ("GLD", 100000), ("HDFCBANK.NS", 150000)]]}]}
(OUT / "presets.json").write_text(json.dumps(presets, indent=2))

d_idx = np.array([TICKERS.index(k) for k in DEMO])
d_w = np.array(list(DEMO.values()))
last3 = R[-756:][:, d_idx]
S3 = np.cov(last3.T) * 252
pv = d_w @ S3 @ d_w
asset_rows = []
for j, k in enumerate(DEMO):
    cum = np.cumprod(1 + last3[:, j])
    ann = cum[-1] ** (252 / 756) - 1
    asset_rows.append(dict(ticker=k, weight=d_w[j], ann_return=ann, volatility=np.sqrt(S3[j, j]),
                           max_drawdown=(cum / np.maximum.accumulate(cum) - 1).min(),
                           risk_contribution=d_w[j] * (S3 @ d_w)[j] / pv, return_contribution=d_w[j] * ann))
pd.DataFrame(asset_rows).round(4).to_csv(OUT / "demo_asset_stats.csv", index=False)
log.info("demo asset risk contributions sum to %.4f", sum(r["risk_contribution"] for r in asset_rows))

pos_log = [t for t in range(252, n) if pd.Timestamp("2024-10-01") <= dates[t] <= pd.Timestamp("2025-07-04")]
port_ret_all = R[:, d_idx] @ d_w
value = 1_000_000 * np.cumprod(1 + port_ret_all)
value = value / value[pos_log[0]] * 1_000_000
log_rows = []
for t in pos_log:
    S_full, C_full = window_cov(t)
    f, _ = features_at(t, d_idx, d_w, S_full, C_full)
    pr = pd.Series(hgb.predict_proba(pd.DataFrame([f])[FEATURES])[0], index=hgb.classes_)
    row = dict(date=dates[t].date(), regime=regime_name[t], portfolio_value_inr=round(float(value[t]), 2),
               nsei=round(float(prices_inr["^NSEI"].iloc[t]), 2), ndx_inr=round(float(prices_inr["^NDX"].iloc[t]), 2),
               usdinr=round(float(usdinr.iloc[t]), 4),
               drawdown_from_peak=round(float(value[t] / value[pos_log[0]:t + 1].max() - 1), 4),
               predicted_label=pr.idxmax(), p_low=round(pr["Low"], 4), p_medium=round(pr["Medium"], 4),
               p_high=round(pr["High"], 4), risk_score=int(round(100 * (0.5 * pr["Medium"] + pr["High"]))),
               top_rc_share=round(f["top_rc_share"], 4), vol_63=round(f["vol_63"], 4))
    if t + 126 <= n - 1:
        fv, fm = path_stats(R[t + 1: t + 127][:, d_idx] @ d_w)
        row.update(realised_fwd_vol=round(fv, 4), realised_fwd_mdd=round(fm, 4),
                   realised_label=str(lab(np.array([score_fn(fv, fm)]))[0]))
    log_rows.append(row)
shock = pd.DataFrame(log_rows)
shock.to_csv(OUT / "shock_2025_daily_log.csv", index=False)
w_ = shock[(shock.date >= pd.Timestamp("2025-02-19").date()) & (shock.date <= pd.Timestamp("2025-04-08").date())]
log.info("demo portfolio in shock window: value %.0f -> %.0f, worst drawdown %+.1f%%",
         w_.portfolio_value_inr.iloc[0], w_.portfolio_value_inr.iloc[-1], 100 * w_.drawdown_from_peak.min())
log.info("demo predicted label counts across log: %s", shock.predicted_label.value_counts().to_dict())
log.info("DONE. Files in %s", OUT.resolve())
