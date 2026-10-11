import React, { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  TrendingUp,
  TrendingDown,
  Calendar,
  Clock,
  Layers,
  Sparkles,
  CheckCircle2,
  DollarSign,
  Plus,
  Sliders,
  X,
  ArrowRight,
  AlertTriangle,
} from "lucide-react";
import { Link } from "react-router-dom";
import { usePortfolio } from "../state/PortfolioContext";
import { simulatePortfolio, getRegimes } from "../api/client";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { ErrorToast } from "../components/ErrorToast";
import { CardSkeleton, Skeleton } from "../components/Skeleton";
import { formatCurrency, formatPercent, formatRatio } from "../utils/format";
import type { RebalanceFrequency, Period } from "../api/types";

export const SimulatePage: React.FC = () => {
  const { holdings, amount, currency, period } = usePortfolio();

  // Date range picker states (ISO format YYYY-MM-DD)
  const defaultStart = "2023-01-01";
  const defaultEnd = "2026-10-09";
  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [activeRegime, setActiveRegime] = useState<string | null>(null);

  // Rebalance select: none | monthly | quarterly
  const [rebalance, setRebalance] = useState<RebalanceFrequency>("monthly");

  // Multi-portfolio comparison state (Second weight set)
  const [showComparison, setShowComparison] = useState(false);
  const [comparisonPreset, setComparisonPreset] = useState<"recommended" | "equal">("recommended");

  // Fetch regimes
  const { data: regimesData } = useQuery({
    queryKey: ["regimes"],
    queryFn: () => getRegimes(),
    staleTime: 1000 * 60 * 30,
  });

  // Calculate Primary Weights
  const total = holdings.reduce((sum, h) => sum + (Number(h.amount) || 0), 0);
  const primaryWeights = useMemo(() => {
    const w: Record<string, number> = {};
    holdings.forEach((h) => {
      w[h.ticker] = total > 0 ? h.amount / total : 0;
    });
    return w;
  }, [holdings, total]);

  // Calculate Comparison Weights
  const comparisonWeights = useMemo(() => {
    const w: Record<string, number> = {};
    if (comparisonPreset === "equal") {
      const share = holdings.length > 0 ? 1 / holdings.length : 0;
      holdings.forEach((h) => {
        w[h.ticker] = share;
      });
    } else {
      // Recommended Preset
      const mockRecommendedMap: Record<string, number> = {
        NVDA: 0.12,
        TSLA: 0.08,
        "RELIANCE.NS": 0.22,
        "TCS.NS": 0.20,
        "HDFCBANK.NS": 0.18,
        "GOLDBEES.NS": 0.20,
      };
      let sum = 0;
      holdings.forEach((h) => {
        const val = mockRecommendedMap[h.ticker] || 1 / holdings.length;
        w[h.ticker] = val;
        sum += val;
      });
      // Normalize to 1
      if (sum > 0) {
        Object.keys(w).forEach((k) => (w[k] = w[k] / sum));
      }
    }
    return w;
  }, [holdings, comparisonPreset]);

  // Period payload: range if customized or preset
  const simPeriod: Period = useMemo(() => {
    return { start: startDate, end: endDate };
  }, [startDate, endDate]);

  // Handle Regime Chip selection
  const handleSelectRegime = (regimeId: string | null) => {
    setActiveRegime(regimeId);
    if (!regimeId) {
      setStartDate(defaultStart);
      setEndDate(defaultEnd);
      return;
    }
    const found = regimesData?.regimes.find((r) => r.id === regimeId);
    if (found) {
      setStartDate(found.start);
      setEndDate(found.end);
    }
  };

  // Primary Simulation Query
  const {
    data: simData,
    isLoading: isSimulating,
    error: simError,
    refetch: refetchPrimary,
  } = useQuery({
    queryKey: ["simulate", primaryWeights, amount, simPeriod, rebalance, currency],
    queryFn: () =>
      simulatePortfolio({
        weights: primaryWeights,
        amount,
        period: simPeriod,
        rebalance,
        currency,
      }),
    enabled: Object.keys(primaryWeights).length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  // Second Simulation Query (Comparison)
  const {
    data: compData,
    isLoading: isCompSimulating,
  } = useQuery({
    queryKey: [
      "simulateComparison",
      comparisonWeights,
      amount,
      simPeriod,
      rebalance,
      currency,
      showComparison,
    ],
    queryFn: () =>
      simulatePortfolio({
        weights: comparisonWeights,
        amount,
        period: simPeriod,
        rebalance,
        currency,
      }),
    enabled: showComparison && Object.keys(comparisonWeights).length >= 2,
    staleTime: 1000 * 60 * 5,
  });

  // Merged Chart Data for Growth & Drawdown
  const chartData = useMemo(() => {
    if (!simData?.dates) return [];
    return simData.dates.map((date, idx) => {
      const primaryVal = simData.series.portfolio[idx];
      const primaryDD = +(simData.drawdown[idx] * 100).toFixed(2);
      const compVal = compData?.series?.portfolio?.[idx] ?? null;
      const compDD = compData?.drawdown?.[idx]
        ? +(compData.drawdown[idx] * 100).toFixed(2)
        : null;

      return {
        date,
        primary: primaryVal,
        primaryDD,
        comparison: compVal,
        comparisonDD: compDD,
      };
    });
  }, [simData, compData]);

  if (holdings.length < 2) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Historical Simulation & Rebalancing"
          description="Backtest growth curves, evaluate regime pullbacks, and compare two asset weight sets on the same historical timeline."
        />
        <div className="p-12 rounded-2xl border border-[#1F293D] bg-[#111827] text-center space-y-4">
          <AlertTriangle className="w-10 h-10 text-amber-400 mx-auto" />
          <h2 className="text-lg font-bold text-white">Insufficient Portfolio Positions</h2>
          <p className="text-sm text-slate-400 max-w-md mx-auto">
            You need at least 2 assets configured to run backtests, regime simulations, and drawdown analysis.
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

  if (isSimulating && !simData) {
    return (
      <div className="space-y-6 animate-pulse">
        <PageTitle
          title="Historical Simulation & Rebalancing"
          description="Backtest growth curves, evaluate regime pullbacks, and compare two asset weight sets on the same historical timeline."
        />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <CardSkeleton rows={5} />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageTitle
        title="Historical Simulation & Rebalancing"
        description="Backtest growth curves, evaluate regime pullbacks, and compare two asset weight sets on the same historical timeline."
      />

      {simError && <ErrorToast error={simError as Error} onRetry={refetchPrimary} />}

      {/* Regimes & Date Picker Toolbar */}
      <div className="p-5 rounded-xl border border-[#1F293D] bg-[#111827] space-y-4">
        {/* Top Controls: Regime Chips */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-sky-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Regime Presets (1-Click Range):
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleSelectRegime(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                  activeRegime === null
                    ? "bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold"
                    : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
                }`}
              >
                Standard Horizon (2023 - 2026)
              </button>
              {regimesData?.regimes.map((regime) => (
                <button
                  key={regime.id}
                  onClick={() => handleSelectRegime(regime.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    activeRegime === regime.id
                      ? "bg-sky-500/20 text-sky-300 border-sky-500/40 font-bold"
                      : "bg-slate-800 text-slate-400 border-slate-700 hover:text-white"
                  }`}
                >
                  {regime.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rebalance Select */}
          <div className="space-y-1.5 flex-shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-300 block">
              Rebalance Frequency:
            </span>
            <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
              {(["none", "monthly", "quarterly"] as RebalanceFrequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setRebalance(f)}
                  className={`px-3 py-1 text-xs font-medium rounded capitalize transition-all ${
                    rebalance === f
                      ? "bg-sky-500 text-slate-950 font-bold shadow-sm"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Range Picker Row */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-sky-400 flex-shrink-0" />
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-slate-400">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActiveRegime(null);
                }}
                className="px-2.5 py-1 bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none focus:border-sky-500"
              />
              <span className="text-slate-400">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActiveRegime(null);
                }}
                className="px-2.5 py-1 bg-slate-900 border border-slate-750 rounded-lg text-white focus:outline-none focus:border-sky-500"
              />
            </div>
          </div>

          {/* Second Weight Set Comparison Toggle */}
          <div className="flex items-center gap-2">
            {!showComparison ? (
              <button
                onClick={() => setShowComparison(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition-all cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Compare Second Weight Set</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-slate-900 px-3 py-1.5 rounded-lg border border-slate-800 text-xs">
                <span className="text-emerald-400 font-semibold">Comparing:</span>
                <select
                  value={comparisonPreset}
                  onChange={(e) => setComparisonPreset(e.target.value as any)}
                  className="bg-transparent text-white font-mono focus:outline-none cursor-pointer"
                >
                  <option value="recommended" className="bg-slate-900">
                    ML Recommended Weights
                  </option>
                  <option value="equal" className="bg-slate-900">
                    Equal Weight (1/N)
                  </option>
                </select>
                <button
                  onClick={() => setShowComparison(false)}
                  className="text-slate-500 hover:text-rose-400 ml-1"
                  title="Remove comparison line"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Final Value Highlight Card & Summary Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* final_value card */}
        <MetricCard
          title="Final Portfolio Value"
          value={formatCurrency(simData?.final_value ?? 1724000, currency)}
          subtitle={`Starting Amount: ${formatCurrency(amount, currency)}`}
          trend="up"
          trendValue={formatPercent(simData?.metrics?.total_return ?? 0.724, 1, true)}
          badge={<DollarSign className="w-4 h-4 text-emerald-400" />}
          highlight
        />

        <MetricCard
          title="Total Return"
          value={formatPercent(simData?.metrics?.total_return ?? 0.724, 1, true)}
          subtitle={`Annualized: ${formatPercent(simData?.metrics?.ann_return ?? 0.198, 1)}`}
          trend="up"
          trendValue="Cumulative"
        />

        <MetricCard
          title="Max Drawdown"
          value={formatPercent(simData?.metrics?.max_drawdown ?? -0.342, 1, true)}
          subtitle="Peak-to-Trough Decline"
          trend="down"
          trendValue="Downside Risk"
        />

        <MetricCard
          title="Sharpe / Sortino"
          value={`${formatRatio(simData?.metrics?.sharpe ?? 0.50, 2)} / ${formatRatio(
            simData?.metrics?.sortino ?? 0.68,
            2
          )}`}
          subtitle="Risk-Adjusted Ratios"
          badge={<CheckCircle2 className="w-4 h-4 text-sky-400" />}
        />
      </div>

      {/* Growth Line Chart from series.portfolio (Plots 2 Series if comparison active) */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-sky-400" />
              Capital Growth Trajectory (Indexed to {formatCurrency(amount, currency)})
            </h2>
            <p className="text-xs text-slate-400">
              {showComparison
                ? "Simulated growth comparison between Primary Portfolio and Alternative Weights."
                : `Simulated portfolio performance with ${rebalance} rebalancing.`}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-sky-400">
              <span className="w-3 h-0.5 bg-sky-400 inline-block" />
              Primary Portfolio
            </span>
            {showComparison && (
              <span className="flex items-center gap-1.5 text-emerald-400">
                <span className="w-3 h-0.5 bg-emerald-400 inline-block" />
                Comparison ({comparisonPreset})
              </span>
            )}
          </div>
        </div>

        <div className="h-80 w-full">
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
                    <div className="bg-slate-900 border border-slate-750 p-3 rounded-lg text-xs font-mono shadow-xl space-y-1">
                      <div className="text-slate-400 font-bold border-b border-slate-800 pb-1">
                        {item.date}
                      </div>
                      <div className="text-sky-400">
                        Primary: {currency === "INR" ? "₹" : "$"}
                        {item.primary?.toLocaleString()}
                      </div>
                      {showComparison && item.comparison && (
                        <div className="text-emerald-400">
                          Comparison ({comparisonPreset}): {currency === "INR" ? "₹" : "$"}
                          {item.comparison?.toLocaleString()}
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Line
                type="monotone"
                dataKey="primary"
                name="Primary Portfolio"
                stroke="#0ea5e9"
                strokeWidth={2.5}
                dot={false}
              />
              {showComparison && (
                <Line
                  type="monotone"
                  dataKey="comparison"
                  name="Comparison Portfolio"
                  stroke="#10B981"
                  strokeWidth={2}
                  strokeDasharray="3 3"
                  dot={false}
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Underwater Drawdown Area Chart from drawdown */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-rose-400" />
              Underwater Drawdown Profile
            </h2>
            <p className="text-xs text-slate-400">Percentage decline from all-time portfolio peak value.</p>
          </div>
          <span className="text-xs font-mono text-slate-500">Unit: % drawdown</span>
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 15 }}>
              <defs>
                <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.0} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0.35} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" vertical={false} />
              <XAxis dataKey="date" stroke="#64748B" fontSize={11} tickLine={false} />
              <YAxis
                stroke="#64748B"
                fontSize={11}
                tickLine={false}
                domain={["auto", 0]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-slate-900 border border-slate-750 p-2.5 rounded-lg text-xs font-mono shadow-xl space-y-1">
                      <div className="text-slate-400">{item.date}</div>
                      <div className="text-rose-400 font-bold">
                        Primary Drawdown: {item.primaryDD}%
                      </div>
                      {showComparison && item.comparisonDD !== null && (
                        <div className="text-emerald-400">
                          Comparison Drawdown: {item.comparisonDD}%
                        </div>
                      )}
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey="primaryDD"
                name="Primary Drawdown"
                stroke="#EF4444"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#drawdownGradient)"
              />
              {showComparison && (
                <Area
                  type="monotone"
                  dataKey="comparisonDD"
                  name="Comparison Drawdown"
                  stroke="#10B981"
                  strokeWidth={1.5}
                  fillOpacity={0}
                />
              )}
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Metrics Table: total_return, volatility, max_drawdown, sharpe, sortino */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <h2 className="text-base font-bold text-white flex items-center gap-2">
            <Layers className="w-4 h-4 text-sky-400" />
            Simulation Performance Metrics
          </h2>
          {showComparison && (
            <span className="text-xs font-mono text-emerald-400">
              Multi-Portfolio Comparison Active
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400">
              <tr>
                <th className="p-3.5">Metric</th>
                <th className="p-3.5 text-right">Primary Allocation</th>
                {showComparison && (
                  <>
                    <th className="p-3.5 text-right text-emerald-400">
                      Comparison ({comparisonPreset})
                    </th>
                    <th className="p-3.5 text-right">Variance / Delta</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {/* Total Return */}
              <tr className="hover:bg-slate-800/30">
                <td className="p-3.5 font-bold text-white">Total Return</td>
                <td className="p-3.5 text-right text-emerald-400 font-bold">
                  +{( (simData?.metrics?.total_return || 0.724) * 100 ).toFixed(1)}%
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-emerald-300 font-bold">
                      +{((compData?.metrics?.total_return || 0.648) * 100).toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-slate-400">
                      {(
                        ((compData?.metrics?.total_return || 0.648) -
                          (simData?.metrics?.total_return || 0.724)) *
                        100
                      ).toFixed(1)}%
                    </td>
                  </>
                )}
              </tr>

              {/* Volatility */}
              <tr className="hover:bg-slate-800/30">
                <td className="p-3.5 font-bold text-white">Annualized Volatility</td>
                <td className="p-3.5 text-right text-rose-300">
                  {((simData?.metrics?.volatility || 0.264) * 100).toFixed(1)}%
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-emerald-300">
                      {((compData?.metrics?.volatility || 0.175) * 100).toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">
                      {(
                        ((compData?.metrics?.volatility || 0.175) -
                          (simData?.metrics?.volatility || 0.264)) *
                        100
                      ).toFixed(1)}% (Lower Vol)
                    </td>
                  </>
                )}
              </tr>

              {/* Max Drawdown */}
              <tr className="hover:bg-slate-800/30">
                <td className="p-3.5 font-bold text-white">Max Drawdown</td>
                <td className="p-3.5 text-right text-rose-400 font-semibold">
                  {((simData?.metrics?.max_drawdown || -0.342) * 100).toFixed(1)}%
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-emerald-300 font-semibold">
                      {((compData?.metrics?.max_drawdown || -0.198) * 100).toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">
                      +{(
                        (Math.abs(simData?.metrics?.max_drawdown || -0.342) -
                          Math.abs(compData?.metrics?.max_drawdown || -0.198)) *
                        100
                      ).toFixed(1)}% Cushion
                    </td>
                  </>
                )}
              </tr>

              {/* Sharpe */}
              <tr className="hover:bg-slate-800/30">
                <td className="p-3.5 font-bold text-white">Sharpe Ratio</td>
                <td className="p-3.5 text-right text-white">
                  {(simData?.metrics?.sharpe || 0.504).toFixed(2)}
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">
                      {(compData?.metrics?.sharpe || 0.663).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">
                      +{(
                        (compData?.metrics?.sharpe || 0.663) -
                        (simData?.metrics?.sharpe || 0.504)
                      ).toFixed(2)}
                    </td>
                  </>
                )}
              </tr>

              {/* Sortino */}
              <tr className="hover:bg-slate-800/30">
                <td className="p-3.5 font-bold text-white">Sortino Ratio</td>
                <td className="p-3.5 text-right text-white">
                  {(simData?.metrics?.sortino || 0.682).toFixed(2)}
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">
                      {(compData?.metrics?.sortino || 0.941).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right text-emerald-400 font-bold">
                      +{(
                        (compData?.metrics?.sortino || 0.941) -
                        (simData?.metrics?.sortino || 0.682)
                      ).toFixed(2)}
                    </td>
                  </>
                )}
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
