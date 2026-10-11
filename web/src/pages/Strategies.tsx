import React, { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  ShieldCheck,
  TrendingUp,
  Award,
  Layers,
  Sparkles,
  Info,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  Scale,
} from "lucide-react";
import { Link } from "react-router-dom";
import { usePortfolio } from "../state/PortfolioContext";
import { compareStrategies } from "../api/client";
import { PageTitle } from "../components/PageTitle";
import { RiskBadge } from "../components/RiskBadge";
import { ErrorToast } from "../components/ErrorToast";
import { CardSkeleton } from "../components/Skeleton";
import { ShieldPanel } from "../components/ShieldPanel";
import { formatCurrency, formatPercent, formatRatio } from "../utils/format";

export const StrategiesPage: React.FC = () => {
  const { holdings, risk_level, benchmark, period, currency, amount } = usePortfolio();

  const [shieldFloor, setShieldFloor] = useState<number>(-0.15); // Default -15%

  const total = holdings.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
  const weights: Record<string, number> = {};
  holdings.forEach((h) => {
    weights[h.ticker] = total > 0 ? h.amount / total : 0;
  });

  const {
    data: compareData,
    isLoading: isComparing,
    error: compareError,
    refetch: refetchCompare,
  } = useQuery({
    queryKey: ["compare", holdings, risk_level, benchmark, period, shieldFloor, currency],
    queryFn: () =>
      compareStrategies({
        holdings,
        risk_level,
        benchmark,
        period,
        shield_floor: shieldFloor,
        currency,
      }),
    enabled: holdings.length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  const chartData =
    compareData?.dates?.map((date, idx) => ({
      date,
      original: compareData.series.original[idx],
      recommended: compareData.series.recommended[idx],
      equal_weight: compareData.series.equal_weight[idx],
      insured: compareData.series.insured[idx],
      benchmark: compareData.series.benchmark[idx],
    })) || [];

  const strategiesList = [
    { key: "original", name: "Original Portfolio", color: "#EF4444" },
    { key: "recommended", name: "ML Recommended", color: "#0ea5e9" },
    { key: "equal_weight", name: "Equal Weight (1/N)", color: "#F59E0B" },
    { key: "insured", name: "Drawdown Shield (CPPI)", color: "#10B981" },
    { key: "benchmark", name: `Benchmark (${benchmark})`, color: "#64748B" },
  ] as const;

  // Extract unique tickers across original, recommended, equal_weight
  const tickers = Array.from(
    new Set([
      ...Object.keys(compareData?.weights?.original || {}),
      ...Object.keys(compareData?.weights?.recommended || {}),
      ...Object.keys(compareData?.weights?.equal_weight || {}),
    ])
  );

  if (holdings.length < 2) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Strategy Comparison & Drawdown Shield"
          description="Comprehensive 5-way backtest benchmarking Original vs Recommended vs Equal-Weight vs Drawdown Shield vs Market Index."
        />
        <div className="p-12 rounded-2xl border border-[#1F293D] bg-[#111827] text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Insufficient Portfolio Positions</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You need at least 2 assets configured to benchmark multiple strategy asset allocations.
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

  if (isComparing && !compareData) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageTitle
          title="Strategy Comparison & Drawdown Shield"
          description="Comprehensive 5-way backtest benchmarking Original vs Recommended vs Equal-Weight vs Drawdown Shield vs Market Index."
        />
        <div className="p-8 rounded-xl border border-[#1F293D] bg-[#111827]">
          <CardSkeleton rows={5} />
        </div>
        <div className="p-8 rounded-xl border border-[#1F293D] bg-[#111827]">
          <CardSkeleton rows={5} />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <PageTitle
        title="Strategy Comparison & Drawdown Shield"
        description="Comprehensive 5-way backtest benchmarking Original vs Recommended vs Equal-Weight vs Drawdown Shield vs Market Index."
      />

      {compareError && (
        <ErrorToast error={compareError as Error} onRetry={refetchCompare} />
      )}

      {/* Optimized Only on Data Before Period Start Note */}
      {compareData?.note && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-sky-500/30 bg-sky-950/20 text-sky-200 shadow-md">
          <Info className="w-5 h-5 text-sky-400 flex-shrink-0 mt-0.5" />
          <div className="space-y-0.5">
            <h4 className="text-xs font-bold uppercase tracking-wider text-sky-300">
              Institutional Rigor Notice (No Look-Ahead Leakage)
            </h4>
            <p className="text-xs text-sky-100 font-sans leading-relaxed">
              {compareData.note}
            </p>
          </div>
        </div>
      )}

      {/* 1. One Chart with Five Lines */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              5-Strategy Comparative Growth Trajectory
            </h2>
            <p className="text-xs text-slate-400">
              Indexed to starting capital ({currency === "INR" ? "₹" : "$"}{amount.toLocaleString()}) across the lookback horizon.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            {strategiesList.map((s) => (
              <span key={s.key} className="flex items-center gap-1.5 text-slate-300">
                <span
                  className="w-3 h-0.5 inline-block"
                  style={{ backgroundColor: s.color }}
                />
                {s.name}
              </span>
            ))}
          </div>
        </div>

        <div className="h-84 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 15 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                tickFormatter={(v) =>
                  currency === "INR"
                    ? `₹${(v / 100000).toFixed(1)}L`
                    : `$${(v / 1000).toFixed(0)}k`
                }
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900 border border-slate-750 p-3 rounded-lg text-xs font-mono shadow-xl space-y-1.5 min-w-48">
                      <div className="text-slate-400 font-bold border-b border-slate-800 pb-1">
                        {item.date}
                      </div>
                      <div className="text-rose-400">
                        Original: {formatCurrency(item.original, currency)}
                      </div>
                      <div className="text-sky-400">
                        Recommended: {formatCurrency(item.recommended, currency)}
                      </div>
                      <div className="text-amber-400">
                        Equal-Weight: {formatCurrency(item.equal_weight, currency)}
                      </div>
                      <div className="text-emerald-400 font-bold">
                        Insured (CPPI): {formatCurrency(item.insured, currency)}
                      </div>
                      <div className="text-slate-400">
                        Benchmark: {formatCurrency(item.benchmark, currency)}
                      </div>
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="original"
                stroke="#EF4444"
                strokeWidth={2}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="recommended"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="equal_weight"
                stroke="#F59E0B"
                strokeWidth={1.8}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="insured"
                stroke="#10B981"
                strokeWidth={2.5}
                dot={false}
              />
              <Line
                type="monotone"
                dataKey="benchmark"
                stroke="#64748B"
                strokeWidth={1.5}
                strokeDasharray="4 4"
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2. Metrics Table with Best Value per Column Highlighted using best_by & Risk Label Badge */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Award className="w-4 h-4 text-amber-400" />
            <h2 className="text-base font-bold text-white">
              Strategy Performance Metrics (Best-in-Column Highlighted via best_by)
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">Green chip indicates optimal metric</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3.5">Strategy</th>
                <th className="p-3.5">Risk Label</th>
                <th className="p-3.5 text-right">Total Return</th>
                <th className="p-3.5 text-right">Volatility</th>
                <th className="p-3.5 text-right">Max Drawdown</th>
                <th className="p-3.5 text-right">Sharpe Ratio</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {strategiesList.map((strat) => {
                const metric = compareData?.metrics?.[strat.key];
                const riskLabel = compareData?.risk_labels?.[strat.key];
                const isBestReturn = compareData?.best_by?.total_return === strat.key;
                const isBestVol = compareData?.best_by?.volatility === strat.key;
                const isBestDD = compareData?.best_by?.max_drawdown === strat.key;
                const isBestSharpe = compareData?.best_by?.sharpe === strat.key;

                return (
                  <tr
                    key={strat.key}
                    className="hover:bg-slate-800/30 transition-colors"
                  >
                    <td className="p-3.5 font-bold text-white flex items-center gap-2.5">
                      <span
                        className="w-2.5 h-2.5 rounded-full"
                        style={{ backgroundColor: strat.color }}
                      />
                      <span>{strat.name}</span>
                    </td>
                    <td className="p-3.5">
                      {riskLabel ? <RiskBadge label={riskLabel} size="sm" /> : "--"}
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`px-2.5 py-1 rounded-md font-bold ${
                          isBestReturn
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                            : "text-slate-300"
                        }`}
                      >
                        {metric ? formatPercent(metric.total_return, 1, true) : "--"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`px-2.5 py-1 rounded-md font-bold ${
                          isBestVol
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                            : "text-slate-300"
                        }`}
                      >
                        {metric ? formatPercent(metric.volatility, 1) : "--"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`px-2.5 py-1 rounded-md font-bold ${
                          isBestDD
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                            : "text-slate-300"
                        }`}
                      >
                        {metric ? formatPercent(metric.max_drawdown, 1, true) : "--"}
                      </span>
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`px-2.5 py-1 rounded-md font-bold ${
                          isBestSharpe
                            ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm"
                            : "text-slate-300"
                        }`}
                      >
                        {metric ? formatRatio(metric.sharpe, 2) : "--"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. Weights Comparison Table for First Three (Original, Recommended, Equal Weight) */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Scale className="w-4 h-4 text-sky-400" />
            <h3 className="text-base font-bold text-white">
              Weights Comparison: Original vs Recommended vs Equal-Weight
            </h3>
          </div>
          <span className="text-xs font-mono text-slate-500">Asset allocation % distribution</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3.5">Asset Ticker</th>
                <th className="p-3.5 text-right text-rose-400">Original Weight</th>
                <th className="p-3.5 text-right text-sky-400">Recommended Weight</th>
                <th className="p-3.5 text-right text-amber-400">Equal Weight (1/N)</th>
                <th className="p-3.5 text-right">Recommended Delta</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {tickers.map((ticker) => {
                const origW = (compareData?.weights?.original?.[ticker] || 0) * 100;
                const recW = (compareData?.weights?.recommended?.[ticker] || 0) * 100;
                const eqW = (compareData?.weights?.equal_weight?.[ticker] || 0) * 100;
                const diff = recW - origW;

                return (
                  <tr key={ticker} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-bold text-white flex items-center gap-2">
                      <span>{ticker}</span>
                    </td>
                    <td className="p-3.5 text-right text-slate-300">
                      {origW.toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-sky-400 font-bold">
                      {recW.toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-amber-300">
                      {eqW.toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right">
                      <span
                        className={`px-2 py-0.5 rounded font-bold ${
                          diff > 0
                            ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                            : diff < 0
                            ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                            : "bg-slate-800 text-slate-400"
                        }`}
                      >
                        {diff > 0 ? `+${diff.toFixed(1)}%` : `${diff.toFixed(1)}%`}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Verbatim Explanations List */}
      {compareData?.explanations && (
        <div className="p-5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-sky-400" />
            Strategy Comparison Explanations
          </h3>
          <ul className="space-y-2 text-xs text-slate-300">
            {compareData.explanations.map((exp, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-sky-400 font-bold mt-0.5">•</span>
                <span className="leading-relaxed select-text">{exp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 5. ShieldPanel Component (Drawdown Shield simulated) */}
      <ShieldPanel
        weights={weights}
        amount={amount}
        period={period}
        currency={currency}
      />
    </div>
  );
};
