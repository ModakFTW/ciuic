import React from "react";
import {
  Sparkles,
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Sliders,
  CheckCircle,
  BarChart3,
  Layers,
  Info,
  ArrowDown,
  ArrowUp,
  Table,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  CartesianGrid,
} from "recharts";
import { usePortfolio } from "../state/PortfolioContext";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { ErrorToast } from "../components/ErrorToast";
import { CardSkeleton, Skeleton } from "../components/Skeleton";
import { formatPercent, formatRatio } from "../utils/format";

export const RecommendPage: React.FC = () => {
  const {
    analyzeData,
    allocateData,
    isAllocating,
    allocateError,
    refetchAllocate,
    currency,
    applyCounterfactual,
    amount,
    holdings,
  } = usePortfolio();

  if (holdings.length < 2) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Optimization & Recommendations"
          description="SLSQP Ledoit-Wolf optimizer with ML risk-class gate and per-asset rationales."
        />
        <div className="p-12 rounded-2xl border border-[#1F293D] bg-[#111827] text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Insufficient Portfolio Positions</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            At least 2 assets are required to calculate covariance matrices and run mean-variance optimization.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-sky-500"
          >
            <span>Return to Portfolio Builder</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>
    );
  }

  if (isAllocating && !allocateData) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageTitle
          title="Optimization & Recommendations"
          description="SLSQP Ledoit-Wolf optimizer with ML risk-class gate and per-asset rationales."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton rows={5} />
      </div>
    );
  }

  const alloc = allocateData;
  const analyze = analyzeData;

  const handleApplyAllocation = () => {
    if (alloc?.recommended) {
      const weights: Record<string, number> = {};
      alloc.recommended.forEach((r) => {
        weights[r.ticker] = r.weight;
      });
      applyCounterfactual(weights, alloc.predicted_risk_after.label);
    }
  };

  // Efficient Frontier Scatter Points colored by Label
  const getFrontierPointColor = (label: string) => {
    const l = label.toLowerCase();
    if (l.includes("current")) return "#EF4444"; // Red
    if (l.includes("recommended")) return "#0ea5e9"; // Electric Sky
    if (l.includes("min vol")) return "#10B981"; // Emerald
    if (l.includes("conservative")) return "#14B8A6"; // Teal
    if (l.includes("moderate")) return "#38BDF8"; // Sky
    if (l.includes("growth")) return "#8B5CF6"; // Violet
    if (l.includes("aggressive")) return "#F59E0B"; // Amber
    if (l.includes("max return")) return "#EC4899"; // Pink
    return "#94A3B8";
  };

  const frontierData =
    alloc?.efficient_frontier?.map((p) => ({
      volatility: +(p.volatility * 100).toFixed(1),
      ann_return: +(p.ann_return * 100).toFixed(1),
      label: p.label,
      fill: getFrontierPointColor(p.label),
      isCurrent: p.label.toLowerCase().includes("current"),
      isRecommended: p.label.toLowerCase().includes("recommended"),
    })) || [];

  // Correlation Matrix color helper (Blue-to-Red scale)
  const getCorrelationColor = (val: number) => {
    if (val === 1.0) return "bg-slate-700/80 text-white font-bold border border-slate-600";
    if (val < 0) return "bg-blue-600/40 text-blue-200 font-bold border border-blue-500/40"; // Blue (hedge)
    if (val <= 0.2) return "bg-slate-800 text-slate-300";
    if (val <= 0.4) return "bg-amber-600/30 text-amber-200 border border-amber-500/30";
    if (val <= 0.6) return "bg-rose-500/40 text-rose-200 font-medium border border-rose-500/40";
    return "bg-rose-600/60 text-white font-bold border border-rose-500/60"; // Red (high co-movement)
  };

  // Extract Tradeoff Sentence
  const tradeoffSentence =
    alloc?.explanations?.find((e) =>
      e.toLowerCase().includes("rebalancing reduces") ||
      e.toLowerCase().includes("volatility") ||
      e.toLowerCase().includes("drawdown")
    ) || alloc?.explanations?.[0] ||
    "Rebalancing eliminates excess concentration risk while preserving targeted upside.";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageTitle
        title="Optimization & Recommendations"
        description="Mean-variance optimization constrained by the forward ML risk gate. Compare asset metrics, co-movement, and optimal trade-offs."
        badge={
          alloc?.predicted_risk_after ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-mono">Predicted After:</span>
              <RiskBadge label={alloc.predicted_risk_after.label} size="md" />
            </div>
          ) : null
        }
        actions={
          <button
            onClick={handleApplyAllocation}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold bg-sky-500 hover:bg-sky-400 text-slate-950 transition-all shadow-lg shadow-sky-500/25 active:scale-95 cursor-pointer"
          >
            <Sparkles className="w-4 h-4 text-slate-950" />
            <span>Apply Recommended Weights</span>
          </button>
        }
      />

      {allocateError && (
        <ErrorToast error={allocateError} onRetry={refetchAllocate} />
      )}

      {/* 1. TOP: Asset Comparison Table from /analyze asset_stats */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Table className="w-4 h-4 text-sky-400" />
            <h2 className="text-base font-bold text-white">
              Asset Statistics & Risk Contribution Comparison
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">Source: /analyze asset_stats</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3.5">Asset Ticker</th>
                <th className="p-3.5 text-right">Weight</th>
                <th className="p-3.5 text-right">Ann. Return</th>
                <th className="p-3.5 text-right">Volatility</th>
                <th className="p-3.5 text-right">Max Drawdown</th>
                <th className="p-3.5 text-right">Risk Contribution</th>
                <th className="p-3.5 text-right">Return Contribution</th>
                <th className="p-3.5 text-right">Return / Vol Ratio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {analyze?.asset_stats?.map((stat) => {
                const isHighRisk = stat.risk_contribution > 0.20;
                const ratio = stat.volatility > 0 ? (stat.ann_return / stat.volatility).toFixed(2) : "--";

                return (
                  <tr
                    key={stat.ticker}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="p-3.5 font-bold text-white flex items-center gap-2">
                      <span>{stat.ticker}</span>
                      {stat.ticker.endsWith(".NS") ? (
                        <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          NSE
                        </span>
                      ) : (
                        <span className="text-[10px] font-sans px-1.5 py-0.2 rounded bg-sky-500/10 text-sky-400 border border-sky-500/20">
                          US
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 text-right text-slate-300">
                      {formatPercent(stat.weight, 1)}
                    </td>
                    <td className="p-3.5 text-right text-emerald-400 font-semibold">
                      {formatPercent(stat.ann_return, 1, true)}
                    </td>
                    <td className="p-3.5 text-right text-rose-300">
                      {formatPercent(stat.volatility, 1)}
                    </td>
                    <td className="p-3.5 text-right text-rose-400">
                      {formatPercent(stat.max_drawdown, 1, true)}
                    </td>
                    <td className="p-3.5 text-right font-bold">
                      <span
                        className={`px-2 py-0.5 rounded ${
                          isHighRisk
                            ? "bg-rose-500/15 text-rose-400 border border-rose-500/30"
                            : "bg-slate-800 text-slate-300"
                        }`}
                      >
                        {formatPercent(stat.risk_contribution, 1)}
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-sky-300">
                      {formatPercent(stat.return_contribution, 1, true)}
                    </td>
                    <td className="p-3.5 text-right text-white font-semibold">
                      {stat.volatility > 0 ? formatRatio(stat.ann_return / stat.volatility, 2) : "--"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 2. Correlation Heatmap from correlation.matrix as CSS Grid with Blue-to-Red Scale */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Correlation Matrix Heatmap (Blue-to-Red Scale)
            </h3>
            <p className="text-xs text-slate-400">
              Blue indicates negative/safe-haven correlation (diversification benefits); Red indicates high directional co-movement.
            </p>
          </div>
          {/* Legend */}
          <div className="flex items-center gap-2 text-xs font-mono">
            <span className="flex items-center gap-1 text-blue-300">
              <span className="w-3 h-3 rounded bg-blue-600/50 inline-block border border-blue-400" />
              &lt; 0.0 (Blue Hedge)
            </span>
            <span className="flex items-center gap-1 text-slate-400">
              <span className="w-3 h-3 rounded bg-slate-800 inline-block" />
              0.0 - 0.2
            </span>
            <span className="flex items-center gap-1 text-amber-300">
              <span className="w-3 h-3 rounded bg-amber-600/50 inline-block" />
              0.2 - 0.4
            </span>
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-3 h-3 rounded bg-rose-600/60 inline-block border border-rose-500" />
              &gt; 0.5 (Red Co-movement)
            </span>
          </div>
        </div>

        {analyze?.correlation && (
          <div className="overflow-x-auto">
            <div
              className="grid gap-1.5 min-w-[500px]"
              style={{
                gridTemplateColumns: `repeat(${analyze.correlation.tickers.length + 1}, minmax(0, 1fr))`,
              }}
            >
              {/* Header Row */}
              <div className="p-2 text-xs font-bold font-mono text-slate-500 text-center">
                Ticker
              </div>
              {analyze.correlation.tickers.map((t) => (
                <div
                  key={`header-${t}`}
                  className="p-2 text-xs font-bold font-mono text-slate-300 text-center bg-slate-900/60 rounded"
                >
                  {t.replace(".NS", "")}
                </div>
              ))}

              {/* Rows */}
              {analyze.correlation.tickers.map((rowTicker, rIdx) => (
                <React.Fragment key={`row-${rowTicker}`}>
                  <div className="p-2 text-xs font-bold font-mono text-slate-300 flex items-center justify-center bg-slate-900/60 rounded">
                    {rowTicker.replace(".NS", "")}
                  </div>
                  {analyze.correlation.matrix[rIdx].map((val, cIdx) => (
                    <div
                      key={`cell-${rIdx}-${cIdx}`}
                      className={`p-2.5 rounded text-xs font-mono text-center flex items-center justify-center transition-transform hover:scale-105 ${getCorrelationColor(
                        val
                      )}`}
                      title={`${rowTicker} ↔ ${analyze.correlation.tickers[cIdx]}: ${val.toFixed(2)}`}
                    >
                      {val.toFixed(2)}
                    </div>
                  ))}
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Capacity Note Info Banner if exists */}
      {alloc?.capacity_note && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 text-sky-200">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300">
              Capacity & Execution Notice
            </h4>
            <p className="text-xs text-sky-100 font-sans leading-relaxed">
              {alloc.capacity_note}
            </p>
          </div>
        </div>
      )}

      {/* 3. Tradeoff Sentence Callout from explanations[] */}
      <div className="p-5 rounded-xl border border-emerald-500/30 bg-gradient-to-r from-emerald-950/25 via-[#111827] to-[#111827] shadow-lg">
        <div className="flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-400 block mb-1">
              Optimization Trade-Off Analysis
            </span>
            <p className="text-sm font-semibold text-white leading-relaxed">
              {tradeoffSentence}
            </p>
          </div>
        </div>
      </div>

      {/* 4. Before/After Metrics Side by Side with Change Arrows */}
      {alloc?.before && alloc?.after && (
        <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-4 h-4 text-sky-400" />
              Before vs After Optimization Metrics
            </h3>
            <span className="text-xs font-mono text-slate-500">ML Gate: {alloc.predicted_risk_after.label}</span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Ann Return */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium uppercase text-slate-400 block">
                Ann. Return
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500">{formatPercent(alloc.before.ann_return, 1, true)}</span>
                <span className="text-sm font-bold text-white">{formatPercent(alloc.after.ann_return, 1, true)}</span>
              </div>
              <div className="text-[11px] font-mono text-amber-400 flex items-center gap-1">
                <ArrowDown className="w-3 h-3" />
                <span>{formatPercent(alloc.after.ann_return - alloc.before.ann_return, 1, true)}</span>
              </div>
            </div>

            {/* Volatility */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium uppercase text-slate-400 block">
                Volatility
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500">{formatPercent(alloc.before.volatility, 1)}</span>
                <span className="text-sm font-bold text-emerald-400">{formatPercent(alloc.after.volatility, 1)}</span>
              </div>
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                <ArrowDown className="w-3 h-3" />
                <span>{formatPercent(alloc.after.volatility - alloc.before.volatility, 1, true)}</span>
              </div>
            </div>

            {/* Max Drawdown */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium uppercase text-slate-400 block">
                Max Drawdown
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500">{formatPercent(alloc.before.max_drawdown, 1, true)}</span>
                <span className="text-sm font-bold text-emerald-400">{formatPercent(alloc.after.max_drawdown, 1, true)}</span>
              </div>
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3" />
                <span>+{formatPercent(Math.abs(alloc.before.max_drawdown) - Math.abs(alloc.after.max_drawdown), 1)} (Cushion)</span>
              </div>
            </div>

            {/* Sharpe Ratio */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium uppercase text-slate-400 block">
                Sharpe Ratio
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500">{formatRatio(alloc.before.sharpe, 2)}</span>
                <span className="text-sm font-bold text-emerald-400">{formatRatio(alloc.after.sharpe, 2)}</span>
              </div>
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3" />
                <span>+{(alloc.after.sharpe - alloc.before.sharpe).toFixed(2)}</span>
              </div>
            </div>

            {/* Sortino */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium uppercase text-slate-400 block">
                Sortino Ratio
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500">{formatRatio(alloc.before.sortino, 2)}</span>
                <span className="text-sm font-bold text-emerald-400">{formatRatio(alloc.after.sortino, 2)}</span>
              </div>
              <div className="text-[11px] font-mono text-emerald-400 flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3" />
                <span>+{(alloc.after.sortino - alloc.before.sortino).toFixed(2)}</span>
              </div>
            </div>

            {/* Diversification Ratio */}
            <div className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 space-y-1">
              <span className="text-[11px] font-medium uppercase text-slate-400 block">
                Diversif. Ratio
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-slate-500">{formatRatio(alloc.before.diversification_ratio, 2)}</span>
                <span className="text-sm font-bold text-sky-400">{formatRatio(alloc.after.diversification_ratio, 2)}</span>
              </div>
              <div className="text-[11px] font-mono text-sky-400 flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3" />
                <span>+{(alloc.after.diversification_ratio - alloc.before.diversification_ratio).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Recommended Allocation: Current vs Recommended Horizontal Bars + Rationale Lines */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-sky-400" />
              Current vs Recommended Allocations & Rationales
            </h3>
            <p className="text-xs text-slate-400">
              Each asset's weight adjustment includes an institutional explainability rationale.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-slate-400">
              <span className="w-3 h-2 rounded bg-slate-700 inline-block" />
              Current Weight
            </span>
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="w-3 h-2 rounded bg-sky-500 inline-block" />
              Recommended Weight
            </span>
          </div>
        </div>

        <div className="space-y-4">
          {alloc?.recommended?.map((rec) => {
            const currentItem = alloc.current_vs_recommended.find(
              (c) => c.ticker === rec.ticker
            );
            const currentWeight = currentItem ? currentItem.current * 100 : 0;
            const recWeight = rec.weight * 100;
            const diff = recWeight - currentWeight;

            return (
              <div
                key={rec.ticker}
                className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-2.5 hover:border-slate-700 transition-colors"
              >
                {/* Header row */}
                <div className="flex items-center justify-between font-mono">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-white text-sm">{rec.ticker}</span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded font-bold ${
                        diff > 0
                          ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                          : diff < 0
                          ? "bg-rose-500/10 text-rose-400 border border-rose-500/30"
                          : "bg-slate-800 text-slate-400"
                      }`}
                    >
                      {diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-xs">
                    <span className="text-slate-400">
                      Current: <strong className="text-slate-300">{currentWeight.toFixed(1)}%</strong>
                    </span>
                    <span className="text-sky-400 font-bold">
                      Target: {recWeight.toFixed(1)}% ({currency === "INR" ? "₹" : "$"}{rec.amount.toLocaleString()})
                    </span>
                  </div>
                </div>

                {/* Horizontal Comparison Bars */}
                <div className="space-y-1">
                  {/* Current Bar */}
                  <div className="flex items-center gap-2 text-[10px] font-mono text-slate-500">
                    <span className="w-12 text-right">Current</span>
                    <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-slate-600 rounded-full"
                        style={{ width: `${Math.min(100, currentWeight * 2)}%` }}
                      />
                    </div>
                  </div>
                  {/* Recommended Bar */}
                  <div className="flex items-center gap-2 text-[10px] font-mono text-sky-400">
                    <span className="w-12 text-right">Target</span>
                    <div className="h-2 flex-1 bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-sky-500 rounded-full transition-all duration-500"
                        style={{ width: `${Math.min(100, recWeight * 2)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Rationale Line Under Each Asset */}
                <p className="text-xs text-slate-300 leading-relaxed font-sans pt-1 border-t border-slate-800/80">
                  <strong className="text-sky-300">Rationale: </strong>
                  {rec.rationale}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 6. Efficient Frontier Risk-Return Scatter Coloured by Label */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-sky-400" />
              Efficient Frontier: Risk-Return Scatter
            </h3>
            <p className="text-xs text-slate-400">
              Frontier candidate portfolios plotted and colored by risk profile category.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1 text-rose-400">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block" />
              Current
            </span>
            <span className="flex items-center gap-1 text-sky-400">
              <span className="w-2.5 h-2.5 rounded-full bg-sky-400 inline-block" />
              Recommended
            </span>
            <span className="flex items-center gap-1 text-emerald-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              Min Vol
            </span>
            <span className="flex items-center gap-1 text-violet-400">
              <span className="w-2.5 h-2.5 rounded-full bg-violet-500 inline-block" />
              Growth
            </span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart margin={{ top: 20, right: 30, bottom: 25, left: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
              <XAxis
                type="number"
                dataKey="volatility"
                name="Volatility"
                unit="%"
                stroke="#64748B"
                fontSize={11}
                label={{
                  value: "Annualized Volatility (%)",
                  position: "insideBottom",
                  offset: -15,
                  fill: "#94A3B8",
                  fontSize: 11,
                }}
              />
              <YAxis
                type="number"
                dataKey="ann_return"
                name="Annual Return"
                unit="%"
                stroke="#64748B"
                fontSize={11}
                label={{
                  value: "Expected Annual Return (%)",
                  angle: -90,
                  position: "insideLeft",
                  offset: -5,
                  fill: "#94A3B8",
                  fontSize: 11,
                }}
              />
              <ZAxis type="category" dataKey="label" name="Label" />
              <Tooltip
                cursor={{ strokeDasharray: "3 3" }}
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const p = payload[0].payload;
                  return (
                    <div className="bg-slate-900 border border-slate-750 p-3 rounded-lg text-xs font-mono shadow-xl space-y-1">
                      <div className="font-bold text-white border-b border-slate-800 pb-1">
                        {p.label}
                      </div>
                      <div className="text-rose-400">Volatility: {p.volatility}%</div>
                      <div className="text-emerald-400">Annual Return: {p.ann_return}%</div>
                    </div>
                  );
                }}
              />
              <Scatter name="Frontier Candidates" data={frontierData}>
                {frontierData.map((entry, index) => (
                  <Cell
                    key={`cell-${index}`}
                    fill={entry.fill}
                    r={entry.isCurrent || entry.isRecommended ? 8 : 5}
                    stroke={entry.isCurrent || entry.isRecommended ? "#FFFFFF" : "none"}
                    strokeWidth={entry.isCurrent || entry.isRecommended ? 1.5 : 0}
                  />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
};
