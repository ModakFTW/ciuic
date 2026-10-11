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
  Check,
  CheckCircle2,
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
import { ChartTooltip } from "../components/ChartTooltip";
import { formatCurrency, formatPercent, formatRatio } from "../utils/format";

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
          description="SLSQP Ledoit-Wolf optimizer with forward ML risk gate and per-asset explainability rationales."
        />
        <div className="p-12 rounded-2xl glass-panel text-center space-y-4 max-w-xl mx-auto shadow-glass">
          <div className="w-12 h-12 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center text-warning mx-auto">
            <AlertTriangle className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-base font-bold text-main font-sans">Insufficient Portfolio Positions</h2>
          <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
            At least 2 assets are required to calculate cross-asset covariance matrices and execute mean-variance optimization.
          </p>
          <div className="pt-2">
            <Link
              to="/"
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] text-main border border-[rgba(226,235,244,0.25)] font-semibold text-xs transition-all focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 active:scale-[0.96]"
            >
              <span>Return to Portfolio Builder</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (isAllocating && !allocateData) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageTitle
          title="Optimization & Recommendations"
          description="SLSQP Ledoit-Wolf optimizer with forward ML risk gate and per-asset explainability rationales."
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
    if (l.includes("current")) return "#E47782"; // Negative Coral
    if (l.includes("recommended")) return "#74C7BE"; // Muted Teal
    if (l.includes("min vol")) return "#86C8A0"; // Positive Sage
    if (l.includes("conservative")) return "#74C7BE"; // Teal
    if (l.includes("moderate")) return "#D9B675"; // Gold
    if (l.includes("growth")) return "#9BA7B5"; // Slate
    if (l.includes("aggressive")) return "#E47782"; // Red
    return "#687787";
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

  // Correlation Matrix color helper (Institutional Hedge vs Co-movement scale)
  const getCorrelationColor = (val: number) => {
    if (val === 1.0) return "bg-white/[0.06] text-main font-bold border border-white/[0.12]";
    if (val < 0) return "bg-blue-500/20 text-blue-300 font-bold border border-blue-400/30"; // Hedge
    if (val <= 0.2) return "bg-[#080B10] text-secondary/80 border border-white/[0.04]";
    if (val <= 0.4) return "bg-warning/15 text-warning border border-warning/25 font-medium";
    if (val <= 0.6) return "bg-negative/20 text-negative border border-negative/30 font-medium";
    return "bg-negative/30 text-white font-bold border border-negative/45"; // High Co-movement
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
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageTitle
        title="Optimization & Recommendations"
        description="Constrained Ledoit-Wolf mean-variance optimization gated by the forward ML risk classifier. Compare current vs recommended allocations and optimal tradeoffs."
        badge={
          alloc?.predicted_risk_after ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-secondary font-mono">Predicted After:</span>
              <RiskBadge label={alloc.predicted_risk_after.label} size="sm" />
            </div>
          ) : null
        }
        actions={
          <button
            onClick={handleApplyAllocation}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-mono font-semibold bg-teal/20 hover:bg-teal/30 text-teal border border-teal/40 transition-all shadow-glass-sm active:scale-[0.96] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60"
          >
            <Check className="w-4 h-4 stroke-[2]" />
            <span>Apply Recommended Weights</span>
          </button>
        }
      />

      {allocateError && (
        <ErrorToast error={allocateError} onRetry={refetchAllocate} />
      )}

      {/* 1. Tradeoff Summary Callout Banner */}
      <div className="p-5 rounded-2xl glass-panel-elevated shadow-glass border-[rgba(226,235,244,0.22)]">
        <div className="flex items-start gap-3.5">
          <div className="p-2 rounded-xl bg-teal/15 text-teal flex-shrink-0">
            <Sparkles className="w-5 h-5 stroke-[1.75]" />
          </div>
          <div>
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-teal block mb-1">
              Optimization Trade-Off Analysis
            </span>
            <p className="text-sm font-semibold text-main leading-relaxed font-sans">
              {tradeoffSentence}
            </p>
          </div>
        </div>
      </div>

      {/* 2. Before/After Metrics Side by Side */}
      {alloc?.before && alloc?.after && (
        <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(226,235,244,0.10)]">
            <h3 className="text-sm font-bold text-main flex items-center gap-2 font-sans">
              <Sliders className="w-4 h-4 text-teal stroke-[1.75]" />
              Before vs After Optimization Performance Metrics
            </h3>
            <span className="text-xs font-mono text-secondary">
              ML Gate: <strong className="text-main">{alloc.predicted_risk_after.label} Risk</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            {/* Ann Return */}
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-[rgba(226,235,244,0.12)] space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondary block">
                Ann. Return
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-secondary/70">{formatPercent(alloc.before.ann_return, 1, true)}</span>
                <span className="text-sm font-bold text-main">{formatPercent(alloc.after.ann_return, 1, true)}</span>
              </div>
              <div className="text-[10px] font-mono text-warning flex items-center gap-1 font-medium">
                <ArrowDown className="w-3 h-3 stroke-[2]" />
                <span>{formatPercent(alloc.after.ann_return - alloc.before.ann_return, 1, true)}</span>
              </div>
            </div>

            {/* Volatility */}
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-[rgba(226,235,244,0.12)] space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondary block">
                Volatility
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-secondary/70">{formatPercent(alloc.before.volatility, 1)}</span>
                <span className="text-sm font-bold text-positive">{formatPercent(alloc.after.volatility, 1)}</span>
              </div>
              <div className="text-[10px] font-mono text-positive flex items-center gap-1 font-semibold">
                <ArrowDown className="w-3 h-3 stroke-[2]" />
                <span>{formatPercent(alloc.after.volatility - alloc.before.volatility, 1, true)}</span>
              </div>
            </div>

            {/* Max Drawdown */}
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-[rgba(226,235,244,0.12)] space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondary block">
                Max Drawdown
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-secondary/70">{formatPercent(alloc.before.max_drawdown, 1, true)}</span>
                <span className="text-sm font-bold text-positive">{formatPercent(alloc.after.max_drawdown, 1, true)}</span>
              </div>
              <div className="text-[10px] font-mono text-positive flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3 stroke-[2]" />
                <span>+{formatPercent(Math.abs(alloc.before.max_drawdown) - Math.abs(alloc.after.max_drawdown), 1)} (Cushion)</span>
              </div>
            </div>

            {/* Sharpe Ratio */}
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-[rgba(226,235,244,0.12)] space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondary block">
                Sharpe Ratio
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-secondary/70">{formatRatio(alloc.before.sharpe, 2)}</span>
                <span className="text-sm font-bold text-positive">{formatRatio(alloc.after.sharpe, 2)}</span>
              </div>
              <div className="text-[10px] font-mono text-positive flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3 stroke-[2]" />
                <span>+{(alloc.after.sharpe - alloc.before.sharpe).toFixed(2)}</span>
              </div>
            </div>

            {/* Sortino */}
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-[rgba(226,235,244,0.12)] space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondary block">
                Sortino Ratio
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-secondary/70">{formatRatio(alloc.before.sortino, 2)}</span>
                <span className="text-sm font-bold text-positive">{formatRatio(alloc.after.sortino, 2)}</span>
              </div>
              <div className="text-[10px] font-mono text-positive flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3 stroke-[2]" />
                <span>+{(alloc.after.sortino - alloc.before.sortino).toFixed(2)}</span>
              </div>
            </div>

            {/* Diversification Ratio */}
            <div className="p-3.5 rounded-xl bg-white/[0.025] border border-[rgba(226,235,244,0.12)] space-y-1">
              <span className="text-[10px] font-mono uppercase tracking-wider text-secondary block">
                Diversif. Ratio
              </span>
              <div className="flex items-baseline justify-between font-mono">
                <span className="text-xs text-secondary/70">{formatRatio(alloc.before.diversification_ratio, 2)}</span>
                <span className="text-sm font-bold text-teal">{formatRatio(alloc.after.diversification_ratio, 2)}</span>
              </div>
              <div className="text-[10px] font-mono text-teal flex items-center gap-1 font-semibold">
                <ArrowUp className="w-3 h-3 stroke-[2]" />
                <span>+{(alloc.after.diversification_ratio - alloc.before.diversification_ratio).toFixed(2)}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 3. Recommended Allocation: Current vs Recommended Delta & Rationale Cards */}
      <div className="rounded-2xl glass-panel p-5 space-y-5 shadow-glass">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[rgba(226,235,244,0.10)]">
          <div>
            <h3 className="text-sm font-bold text-main flex items-center gap-2 font-sans tracking-tight">
              <Sparkles className="w-4 h-4 text-teal stroke-[1.75]" />
              Current vs Recommended Allocations & Rationales
            </h3>
            <p className="text-xs text-secondary mt-0.5">
              SLSQP Ledoit-Wolf optimal weights with plain-language institutional factor rationales.
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-secondary">
              <span className="w-2.5 h-2.5 rounded bg-white/[0.15] inline-block" />
              Current Weight
            </span>
            <span className="flex items-center gap-1.5 text-teal">
              <span className="w-2.5 h-2.5 rounded bg-teal inline-block" />
              Recommended Weight
            </span>
          </div>
        </div>

        <div className="space-y-3.5">
          {alloc?.recommended?.map((rec) => {
            const currentItem = alloc?.current_vs_recommended?.find(
              (c) => c.ticker === rec.ticker
            );
            const curWeight = currentItem ? currentItem.current : 0;
            const recWeight = rec.weight;
            const delta = recWeight - curWeight;
            const deltaFormatted = (delta * 100).toFixed(1);

            return (
              <div
                key={rec.ticker}
                className="p-4 rounded-xl border border-[rgba(226,235,244,0.12)] bg-white/[0.025] hover:bg-white/[0.05] transition-all space-y-2.5 shadow-glass-sm"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-3">
                    <span className="font-mono font-bold text-main text-sm">
                      {rec.ticker}
                    </span>
                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white/[0.04] text-secondary border border-white/[0.08]">
                      Target Capital: {formatCurrency(rec.amount, currency)}
                    </span>
                  </div>

                  {/* Weight Delta Tag */}
                  <div className="flex items-center gap-3 font-mono text-xs">
                    <span className="text-secondary tabular-nums">
                      Current: {(curWeight * 100).toFixed(1)}%
                    </span>
                    <ArrowRight className="w-3 h-3 text-secondary/50" />
                    <span className="text-main font-bold tabular-nums">
                      Target: {(recWeight * 100).toFixed(1)}%
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-md border text-[11px] font-bold tabular-nums ${
                        delta > 0
                          ? "text-positive bg-positive/10 border-positive/30"
                          : delta < 0
                          ? "text-negative bg-negative/10 border-negative/30"
                          : "text-secondary bg-white/[0.04] border-white/[0.08]"
                      }`}
                    >
                      {delta > 0 ? `+${deltaFormatted}%` : `${deltaFormatted}%`}
                    </span>
                  </div>
                </div>

                {/* Horizontal Comparison Bar */}
                <div className="space-y-1">
                  <div className="relative h-2.5 bg-[#080B10] rounded-full overflow-hidden border border-[rgba(226,235,244,0.12)]">
                    {/* Current Weight Bar */}
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-white/[0.20] rounded-full"
                      style={{ width: `${Math.min(100, curWeight * 100)}%` }}
                    />
                    {/* Recommended Weight Bar */}
                    <div
                      className="absolute top-0 bottom-0 left-0 bg-teal/80 rounded-full transition-all duration-300"
                      style={{ width: `${Math.min(100, recWeight * 100)}%` }}
                    />
                  </div>
                </div>

                {/* Rationale Text */}
                <p className="text-xs text-secondary/90 font-sans leading-relaxed pt-1">
                  {rec.rationale}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* 4. Asset Statistics & Correlation Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Correlation Heatmap */}
        <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[rgba(226,235,244,0.10)]">
            <div>
              <h3 className="text-sm font-bold text-main flex items-center gap-2 font-sans">
                <Layers className="w-4 h-4 text-teal stroke-[1.75]" />
                Correlation Matrix Heatmap
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                Blue indicates negative hedge correlation; red indicates co-movement.
              </p>
            </div>
            {/* Legend */}
            <div className="flex items-center gap-2 text-[10px] font-mono">
              <span className="flex items-center gap-1 text-blue-300">
                <span className="w-2.5 h-2.5 rounded bg-blue-500/30 inline-block border border-blue-400/40" />
                &lt; 0 (Hedge)
              </span>
              <span className="flex items-center gap-1 text-secondary">
                <span className="w-2.5 h-2.5 rounded bg-white/[0.04] inline-block" />
                0.0–0.3
              </span>
              <span className="flex items-center gap-1 text-negative">
                <span className="w-2.5 h-2.5 rounded bg-negative/30 inline-block border border-negative/40" />
                &gt; 0.5 (Co-move)
              </span>
            </div>
          </div>

          {analyze?.correlation && (
            <div className="overflow-x-auto">
              <div
                className="grid gap-1.5 min-w-[420px]"
                style={{
                  gridTemplateColumns: `repeat(${analyze.correlation.tickers.length + 1}, minmax(0, 1fr))`,
                }}
              >
                {/* Header Row */}
                <div className="p-1.5 text-[10px] font-bold font-mono text-secondary/60 text-center">
                  Ticker
                </div>
                {analyze.correlation.tickers.map((t) => (
                  <div
                    key={`header-${t}`}
                    className="p-1.5 text-[10px] font-bold font-mono text-secondary text-center bg-[#080B10]/70 rounded-lg"
                  >
                    {t.replace(".NS", "")}
                  </div>
                ))}

                {/* Matrix Rows */}
                {analyze.correlation.tickers.map((rowTicker, rIdx) => (
                  <React.Fragment key={`row-${rowTicker}`}>
                    <div className="p-1.5 text-[10px] font-bold font-mono text-secondary flex items-center justify-center bg-[#080B10]/70 rounded-lg">
                      {rowTicker.replace(".NS", "")}
                    </div>
                    {analyze.correlation.matrix[rIdx].map((val, cIdx) => (
                      <div
                        key={`cell-${rIdx}-${cIdx}`}
                        className={`p-2 rounded-lg text-xs font-mono text-center flex items-center justify-center transition-transform hover:scale-105 ${getCorrelationColor(
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

        {/* Efficient Frontier Scatter Plot */}
        <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(226,235,244,0.10)]">
            <div>
              <h3 className="text-sm font-bold text-main flex items-center gap-2 font-sans">
                <BarChart3 className="w-4 h-4 text-teal stroke-[1.75]" />
                Efficient Frontier (Risk vs Return)
              </h3>
              <p className="text-xs text-secondary mt-0.5">
                SLSQP frontier curves across risk appetites.
              </p>
            </div>
            <div className="text-[10px] font-mono text-secondary">
              Ann. Volatility vs CAGR
            </div>
          </div>

          <div className="h-64 w-full">
            {frontierData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-secondary text-xs font-mono border border-dashed border-[rgba(226,235,244,0.1)] rounded-xl">
                No frontier simulation points available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 20, bottom: 20, left: 10 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(226, 235, 244, 0.06)" />
                  <XAxis
                    type="number"
                    dataKey="volatility"
                    name="Volatility"
                    unit="%"
                    stroke="rgba(226,235,244,0.12)"
                    fontSize={10}
                    tickLine={false}
                    tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                    label={{
                      value: "Annualized Volatility (%)",
                      position: "insideBottom",
                      offset: -10,
                      fill: "#9BA7B5",
                      fontSize: 10,
                      fontFamily: "IBM Plex Mono, monospace",
                    }}
                  />
                  <YAxis
                    type="number"
                    dataKey="ann_return"
                    name="Return"
                    unit="%"
                    stroke="rgba(226,235,244,0.12)"
                    fontSize={10}
                    tickLine={false}
                    tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                    label={{
                      value: "Expected CAGR (%)",
                      angle: -90,
                      position: "insideLeft",
                      fill: "#9BA7B5",
                      fontSize: 10,
                      fontFamily: "IBM Plex Mono, monospace",
                    }}
                  />
                  <Tooltip
                    cursor={{ strokeDasharray: "2 4", stroke: "rgba(226, 235, 244, 0.2)" }}
                    content={({ payload }) => {
                      if (!payload || !payload.length) return null;
                      const p = payload[0].payload;
                      return (
                        <ChartTooltip
                          title={p.label}
                          items={[
                            {
                              label: "Volatility",
                              value: `${p.volatility}%`,
                              color: p.fill,
                            },
                            {
                              label: "Expected CAGR",
                              value: `${p.ann_return}%`,
                              color: "#74C7BE",
                            },
                          ]}
                        />
                      );
                    }}
                  />
                  <Scatter data={frontierData} shape="circle" isAnimationActive={false}>
                    {frontierData.map((entry, index) => (
                      <Cell
                        key={`frontier-${index}`}
                        fill={entry.fill}
                        stroke={entry.isCurrent || entry.isRecommended ? "#FFFFFF" : "transparent"}
                        strokeWidth={entry.isCurrent || entry.isRecommended ? 2 : 0}
                      />
                    ))}
                  </Scatter>
                </ScatterChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
