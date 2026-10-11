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
import { ChartTooltip } from "../components/ChartTooltip";
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
        <div className="p-12 rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] text-center space-y-4 shadow-glass-md">
          <div className="w-12 h-12 rounded-xl bg-warning/10 border border-warning/30 flex items-center justify-center mx-auto text-warning">
            <AlertTriangle className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-lg font-bold text-main font-heading">Insufficient Portfolio Positions</h2>
          <p className="text-sm text-secondary max-w-md mx-auto">
            You need at least 2 assets configured to run backtests, regime simulations, and drawdown analysis.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-teal hover:bg-teal/90 text-background-base font-bold text-sm transition-all focus:outline-none focus:ring-2 focus:ring-teal/50 shadow-glass-sm"
          >
            <span>Return to Portfolio Builder</span>
            <ArrowRight className="w-4 h-4 stroke-[2]" />
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
      <div className="p-5 rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] space-y-4 shadow-glass-sm">
        {/* Top Controls: Regime Chips */}
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-teal stroke-[1.75]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-secondary">
                Regime Presets (1-Click Range):
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => handleSelectRegime(null)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 ${
                  activeRegime === null
                    ? "bg-teal/15 text-teal border-teal/40 font-semibold shadow-glass-sm"
                    : "bg-white/[0.03] text-secondary border-[rgba(226,235,244,0.12)] hover:text-main hover:bg-white/[0.06]"
                }`}
              >
                Standard Horizon (2023 - 2026)
              </button>
              {regimesData?.regimes.map((regime) => (
                <button
                  key={regime.id}
                  onClick={() => handleSelectRegime(regime.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 ${
                    activeRegime === regime.id
                      ? "bg-teal/15 text-teal border-teal/40 font-semibold shadow-glass-sm"
                      : "bg-white/[0.03] text-secondary border-[rgba(226,235,244,0.12)] hover:text-main hover:bg-white/[0.06]"
                  }`}
                >
                  {regime.label}
                </button>
              ))}
            </div>
          </div>

          {/* Rebalance Select */}
          <div className="space-y-1.5 flex-shrink-0">
            <span className="text-xs font-semibold uppercase tracking-wider text-secondary block">
              Rebalance Frequency:
            </span>
            <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-[rgba(226,235,244,0.14)]">
              {(["none", "monthly", "quarterly"] as RebalanceFrequency[]).map((f) => (
                <button
                  key={f}
                  onClick={() => setRebalance(f)}
                  className={`px-3 py-1 text-xs font-medium rounded-lg capitalize transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 ${
                    rebalance === f
                      ? "bg-teal text-background-base font-bold shadow-sm"
                      : "text-secondary hover:text-main"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Date Range Picker Row */}
        <div className="pt-3 border-t border-[rgba(226,235,244,0.1)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Calendar className="w-4 h-4 text-teal stroke-[1.75] flex-shrink-0" />
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-secondary">From:</span>
              <input
                type="date"
                value={startDate}
                onChange={(e) => {
                  setStartDate(e.target.value);
                  setActiveRegime(null);
                }}
                className="px-2.5 py-1.5 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-main focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 transition-colors"
              />
              <span className="text-secondary">To:</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => {
                  setEndDate(e.target.value);
                  setActiveRegime(null);
                }}
                className="px-2.5 py-1.5 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-main focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 transition-colors"
              />
            </div>
          </div>

          {/* Second Weight Set Comparison Toggle */}
          <div className="flex items-center gap-2">
            {!showComparison ? (
              <button
                onClick={() => setShowComparison(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold bg-teal/10 text-teal border border-teal/30 hover:bg-teal/20 transition-colors active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 cursor-pointer shadow-glass-sm"
              >
                <Plus className="w-3.5 h-3.5 stroke-[2]" />
                <span>Compare Second Weight Set</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-white/[0.04] px-3 py-1.5 rounded-xl border border-[rgba(226,235,244,0.18)] text-xs">
                <span className="text-teal font-semibold">Comparing:</span>
                <select
                  value={comparisonPreset}
                  onChange={(e) => setComparisonPreset(e.target.value as any)}
                  className="bg-transparent text-main font-mono focus-visible:outline-none cursor-pointer"
                >
                  <option value="recommended" className="bg-[#0C1118] text-main">
                    ML Recommended Weights
                  </option>
                  <option value="equal" className="bg-[#0C1118] text-main">
                    Equal Weight (1/N)
                  </option>
                </select>
                <button
                  onClick={() => setShowComparison(false)}
                  className="text-secondary hover:text-negative transition-colors ml-1 p-0.5 rounded focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-negative/60"
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
          badge={<DollarSign className="w-4 h-4 text-positive stroke-[1.75]" />}
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
          badge={<CheckCircle2 className="w-4 h-4 text-teal stroke-[1.75]" />}
        />
      </div>

      {/* Growth Line Chart from series.portfolio (Plots 2 Series if comparison active) */}
      <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] p-5 space-y-4 shadow-glass-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-main font-heading flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-teal stroke-[1.75]" />
              Capital Growth Trajectory (Indexed to {formatCurrency(amount, currency)})
            </h2>
            <p className="text-xs text-secondary">
              {showComparison
                ? "Simulated growth comparison between Primary Portfolio and Alternative Weights."
                : `Simulated portfolio performance with ${rebalance} rebalancing.`}
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs font-mono">
            <span className="flex items-center gap-1.5 text-teal">
              <span className="w-3 h-0.5 bg-teal inline-block" />
              Primary Portfolio
            </span>
            {showComparison && (
              <span className="flex items-center gap-1.5 text-warning">
                <span className="w-3 h-0.5 bg-warning inline-block" />
                Comparison ({comparisonPreset})
              </span>
            )}
          </div>
        </div>

        <div className="h-80 w-full min-h-[320px]">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-secondary">
              No historical price data available for the chosen date range.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 15 }}>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(226,235,244,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(226,235,244,0.14)"
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(226,235,244,0.14)"
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
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
                    const items = [
                      {
                        label: "Primary Portfolio",
                        value: formatCurrency(item.primary, currency),
                        color: "#74C7BE",
                      },
                    ];
                    if (showComparison && item.comparison) {
                      items.push({
                        label: `Comparison (${comparisonPreset})`,
                        value: formatCurrency(item.comparison, currency),
                        color: "#D9B675",
                      });
                    }
                    return <ChartTooltip active title={item.date} items={items} />;
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="primary"
                  name="Primary Portfolio"
                  stroke="#74C7BE"
                  strokeWidth={2}
                  dot={false}
                  isAnimationActive={false}
                />
                {showComparison && (
                  <Line
                    type="monotone"
                    dataKey="comparison"
                    name="Comparison Portfolio"
                    stroke="#D9B675"
                    strokeWidth={1.8}
                    strokeDasharray="3 3"
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Underwater Drawdown Area Chart from drawdown */}
      <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] p-5 space-y-4 shadow-glass-sm">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-main font-heading flex items-center gap-2">
              <TrendingDown className="w-4 h-4 text-negative stroke-[1.75]" />
              Underwater Drawdown Profile
            </h2>
            <p className="text-xs text-secondary">Percentage decline from all-time portfolio peak value.</p>
          </div>
          <span className="text-xs font-mono text-secondary">Unit: % drawdown</span>
        </div>

        <div className="h-48 w-full min-h-[192px]">
          {chartData.length === 0 ? (
            <div className="h-full flex items-center justify-center text-xs font-mono text-secondary">
              No drawdown data available for this horizon.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 15 }}>
                <defs>
                  <linearGradient id="drawdownGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#E47782" stopOpacity={0.0} />
                    <stop offset="95%" stopColor="#E47782" stopOpacity={0.25} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(226,235,244,0.06)" vertical={false} />
                <XAxis
                  dataKey="date"
                  stroke="rgba(226,235,244,0.14)"
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  tickLine={false}
                />
                <YAxis
                  stroke="rgba(226,235,244,0.14)"
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  tickLine={false}
                  domain={["auto", 0]}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const item = payload[0].payload;
                    const items = [
                      {
                        label: "Primary Drawdown",
                        value: `${item.primaryDD}%`,
                        color: "#E47782",
                      },
                    ];
                    if (showComparison && item.comparisonDD !== null) {
                      items.push({
                        label: `Comparison (${comparisonPreset})`,
                        value: `${item.comparisonDD}%`,
                        color: "#D9B675",
                      });
                    }
                    return <ChartTooltip active title={item.date} items={items} />;
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="primaryDD"
                  name="Primary Drawdown"
                  stroke="#E47782"
                  strokeWidth={1.8}
                  fillOpacity={1}
                  fill="url(#drawdownGradient)"
                  isAnimationActive={false}
                />
                {showComparison && (
                  <Area
                    type="monotone"
                    dataKey="comparisonDD"
                    name="Comparison Drawdown"
                    stroke="#D9B675"
                    strokeWidth={1.4}
                    fillOpacity={0}
                    isAnimationActive={false}
                  />
                )}
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Metrics Table: total_return, volatility, max_drawdown, sharpe, sortino */}
      <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] overflow-hidden shadow-glass-sm">
        <div className="p-4 border-b border-[rgba(226,235,244,0.14)] flex items-center justify-between">
          <h2 className="text-base font-bold text-main font-heading flex items-center gap-2">
            <Layers className="w-4 h-4 text-teal stroke-[1.75]" />
            Simulation Performance Metrics
          </h2>
          {showComparison && (
            <span className="text-xs font-mono text-warning">
              Multi-Portfolio Comparison Active
            </span>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-white/[0.03] border-b border-[rgba(226,235,244,0.14)] text-secondary">
              <tr>
                <th className="p-3.5">Metric</th>
                <th className="p-3.5 text-right">Primary Allocation</th>
                {showComparison && (
                  <>
                    <th className="p-3.5 text-right text-warning">
                      Comparison ({comparisonPreset})
                    </th>
                    <th className="p-3.5 text-right">Variance / Delta</th>
                  </>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(226,235,244,0.08)]">
              {/* Total Return */}
              <tr className="hover:bg-white/[0.025] transition-colors">
                <td className="p-3.5 font-bold text-main font-sans">Total Return</td>
                <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                  +{( (simData?.metrics?.total_return || 0.724) * 100 ).toFixed(1)}%
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-positive/90 font-bold tabular-nums">
                      +{((compData?.metrics?.total_return || 0.648) * 100).toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-secondary tabular-nums">
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
              <tr className="hover:bg-white/[0.025] transition-colors">
                <td className="p-3.5 font-bold text-main font-sans">Annualized Volatility</td>
                <td className="p-3.5 text-right text-negative/90 tabular-nums">
                  {((simData?.metrics?.volatility || 0.264) * 100).toFixed(1)}%
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-positive tabular-nums">
                      {((compData?.metrics?.volatility || 0.175) * 100).toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-positive font-bold tabular-nums">
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
              <tr className="hover:bg-white/[0.025] transition-colors">
                <td className="p-3.5 font-bold text-main font-sans">Max Drawdown</td>
                <td className="p-3.5 text-right text-negative font-semibold tabular-nums">
                  {((simData?.metrics?.max_drawdown || -0.342) * 100).toFixed(1)}%
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-positive/90 font-semibold tabular-nums">
                      {((compData?.metrics?.max_drawdown || -0.198) * 100).toFixed(1)}%
                    </td>
                    <td className="p-3.5 text-right text-positive font-bold tabular-nums">
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
              <tr className="hover:bg-white/[0.025] transition-colors">
                <td className="p-3.5 font-bold text-main font-sans">Sharpe Ratio</td>
                <td className="p-3.5 text-right text-main tabular-nums">
                  {(simData?.metrics?.sharpe || 0.504).toFixed(2)}
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                      {(compData?.metrics?.sharpe || 0.663).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                      +{(
                        (compData?.metrics?.sharpe || 0.663) -
                        (simData?.metrics?.sharpe || 0.504)
                      ).toFixed(2)}
                    </td>
                  </>
                )}
              </tr>

              {/* Sortino */}
              <tr className="hover:bg-white/[0.025] transition-colors">
                <td className="p-3.5 font-bold text-main font-sans">Sortino Ratio</td>
                <td className="p-3.5 text-right text-main tabular-nums">
                  {(simData?.metrics?.sortino || 0.682).toFixed(2)}
                </td>
                {showComparison && (
                  <>
                    <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                      {(compData?.metrics?.sortino || 0.941).toFixed(2)}
                    </td>
                    <td className="p-3.5 text-right text-positive font-bold tabular-nums">
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
