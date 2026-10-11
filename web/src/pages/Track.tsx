import React, { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  TrendingUp,
  TrendingDown,
  Activity,
  PieChart as PieIcon,
  CheckCircle2,
  DollarSign,
  Radio,
  ArrowUpRight,
  ArrowDownRight,
  RefreshCw,
  Plus,
  Trash2,
  Sparkles,
  Award,
  Layers,
  Clock,
  AlertCircle,
} from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { usePortfolio } from "../state/PortfolioContext";
import { trackPortfolio } from "../api/client";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { ErrorToast } from "../components/ErrorToast";
import { CardSkeleton, Skeleton } from "../components/Skeleton";
import { formatCurrency, formatPercent, formatRatio } from "../utils/format";
import type { LookbackPeriod, PositionIn, Benchmark } from "../api/types";

const COLORS = ["#74C7BE", "#86C8A0", "#D9B675", "#A4B3C6", "#6A94C7", "#E47782"];

const DEMO_POSITIONS: PositionIn[] = [
  { ticker: "NVDA", quantity: 29, buy_price: 8620 },
  { ticker: "TSLA", quantity: 12, buy_price: 16666 },
  { ticker: "RELIANCE.NS", quantity: 70, buy_price: 2857 },
  { ticker: "TCS.NS", quantity: 36, buy_price: 4166 },
  { ticker: "HDFCBANK.NS", quantity: 60, buy_price: 1666 },
  { ticker: "GOLDBEES.NS", quantity: 1543, buy_price: 64.8 },
];

export const TrackPage: React.FC = () => {
  const { currency } = usePortfolio();

  // Holdings entry table state (ticker, quantity, buy price)
  const [positions, setPositions] = useState<PositionIn[]>(DEMO_POSITIONS);
  const [newTicker, setNewTicker] = useState("");
  const [newQuantity, setNewQuantity] = useState<number>(10);
  const [newBuyPrice, setNewBuyPrice] = useState<number>(1000);

  // Benchmark selector: NIFTY50, NASDAQ100, auto
  const [benchmark, setBenchmark] = useState<Benchmark>("NIFTY50");

  // Lookback chips: 1m, 6m, 1y, 3y
  const [lookback, setLookback] = useState<LookbackPeriod>("6m");

  // Last updated timestamp
  const [lastUpdated, setLastUpdated] = useState<string>(() =>
    new Date().toLocaleTimeString()
  );

  // Auto-refresh prices every 60 seconds
  const {
    data: trackData,
    isLoading: isTracking,
    error: trackError,
    refetch,
    dataUpdatedAt,
  } = useQuery({
    queryKey: ["track", positions, benchmark, lookback, currency],
    queryFn: () =>
      trackPortfolio({
        positions,
        benchmark,
        lookback,
        currency,
      }),
    enabled: positions.length >= 1,
    refetchInterval: 60000, // Auto-refresh every 60 seconds
    staleTime: 1000 * 30,
  });

  useEffect(() => {
    if (dataUpdatedAt) {
      setLastUpdated(new Date(dataUpdatedAt).toLocaleTimeString());
    }
  }, [dataUpdatedAt]);

  const handleUpdatePosition = (
    index: number,
    field: "quantity" | "buy_price",
    value: number
  ) => {
    const updated = [...positions];
    updated[index] = {
      ...updated[index],
      [field]: Math.max(0, value),
    };
    setPositions(updated);
  };

  const handleRemovePosition = (index: number) => {
    if (positions.length <= 1) {
      alert("At least 1 position is required to track portfolio value.");
      return;
    }
    setPositions(positions.filter((_, i) => i !== index));
  };

  const handleAddPosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTicker.trim()) return;
    const tickerUpper = newTicker.trim().toUpperCase();
    if (positions.some((p) => p.ticker === tickerUpper)) {
      alert("Ticker already exists in holdings table.");
      return;
    }
    setPositions([
      ...positions,
      {
        ticker: tickerUpper,
        quantity: Math.max(1, newQuantity),
        buy_price: Math.max(0.01, newBuyPrice),
      },
    ]);
    setNewTicker("");
  };

  const handleUseDemoHoldings = () => {
    setPositions(DEMO_POSITIONS);
  };

  const chartData =
    trackData?.benchmark?.dates?.map((date, idx) => ({
      date,
      portfolio: trackData.benchmark.series.portfolio[idx],
      benchmark: trackData.benchmark.series.benchmark[idx],
    })) || [];

  const allocationPie =
    trackData?.allocation
      ? Object.entries(trackData.allocation).map(([name, weight]) => ({
          name,
          value: +(weight * 100).toFixed(1),
        }))
      : [];

  const isProfit = (trackData?.total_pnl ?? 148500) >= 0;
  const verdict = trackData?.benchmark?.verdict || "outperforming";

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <PageTitle
        title="Live Portfolio Tracking"
        description="Monitor mark-to-market valuations, real-time P&L breakdown, and live benchmark comparisons with automated 60-second refreshes."
        badge={
          trackData?.risk?.label ? (
            <RiskBadge
              label={trackData.risk.label}
              size="md"
              score={trackData.risk.score}
            />
          ) : null
        }
        actions={
          <div className="flex items-center gap-3">
            {/* Auto-refresh timer badge */}
            <div
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl glass-panel-elevated border border-[rgba(226,235,244,0.18)] text-xs font-mono text-secondary shadow-glass-sm"
              title="Automatically pulls live market closes and daily FX series every 60 seconds"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-teal opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-teal" />
              </span>
              <span>Last updated: {lastUpdated}</span>
              <button
                onClick={() => refetch()}
                className="p-1 text-secondary hover:text-teal rounded transition-colors"
                title="Refresh prices now"
              >
                <RefreshCw className="w-3 h-3 stroke-[2]" />
              </button>
            </div>
          </div>
        }
      />

      {trackError && <ErrorToast error={trackError as Error} onRetry={refetch} />}

      {/* 1. Holdings Entry Table with 'Use Demo Holdings' Button */}
      <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] overflow-hidden shadow-glass-sm">
        <div className="p-4 border-b border-[rgba(226,235,244,0.14)] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-main font-heading flex items-center gap-2">
              <Layers className="w-4 h-4 text-teal stroke-[1.75]" />
              Holdings Entry & Cost Basis Editor
            </h2>
            <p className="text-xs text-secondary">
              Input asset quantities and buy execution prices to compute live mark-to-market performance.
            </p>
          </div>

          <button
            onClick={handleUseDemoHoldings}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-teal/10 text-teal border border-teal/30 hover:bg-teal/20 transition-all cursor-pointer shadow-glass-sm"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal stroke-[1.75]" />
            <span>Use Demo Holdings</span>
          </button>
        </div>

        {/* Positions Input Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-white/[0.03] border-b border-[rgba(226,235,244,0.14)] text-secondary uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3.5">Asset Ticker</th>
                <th className="p-3.5 text-right">Quantity</th>
                <th className="p-3.5 text-right">
                  Buy Price ({currency === "INR" ? "₹" : "$"})
                </th>
                <th className="p-3.5 text-right">
                  Total Cost ({currency === "INR" ? "₹" : "$"})
                </th>
                <th className="p-3.5 text-center w-16">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(226,235,244,0.08)]">
              {positions.map((pos, idx) => {
                const rowCost = pos.quantity * pos.buy_price;
                return (
                  <tr key={pos.ticker} className="hover:bg-white/[0.025] transition-colors">
                    <td className="p-3.5 font-bold text-main flex items-center gap-2">
                      <span>{pos.ticker}</span>
                    </td>
                    <td className="p-3.5 text-right">
                      <input
                        type="number"
                        min="1"
                        value={pos.quantity}
                        onChange={(e) =>
                          handleUpdatePosition(
                            idx,
                            "quantity",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-24 px-2 py-1 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-right text-main focus:outline-none focus:border-teal transition-colors tabular-nums"
                      />
                    </td>
                    <td className="p-3.5 text-right">
                      <input
                        type="number"
                        min="0.01"
                        step="0.01"
                        value={pos.buy_price}
                        onChange={(e) =>
                          handleUpdatePosition(
                            idx,
                            "buy_price",
                            parseFloat(e.target.value) || 0
                          )
                        }
                        className="w-28 px-2 py-1 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-right text-main focus:outline-none focus:border-teal transition-colors tabular-nums"
                      />
                    </td>
                    <td className="p-3.5 text-right text-secondary font-semibold tabular-nums">
                      {currency === "INR" ? "₹" : "$"}
                      {rowCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleRemovePosition(idx)}
                        disabled={positions.length <= 1}
                        className={`p-1.5 rounded-lg transition-colors ${
                          positions.length <= 1
                            ? "text-secondary/40 cursor-not-allowed"
                            : "text-secondary hover:text-negative hover:bg-white/[0.04]"
                        }`}
                        title="Remove position"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Quick Add Position Form */}
        <form
          onSubmit={handleAddPosition}
          className="p-3.5 bg-white/[0.02] border-t border-[rgba(226,235,244,0.1)] flex flex-wrap items-center gap-3 text-xs font-mono"
        >
          <span className="text-secondary font-semibold">Add Position:</span>
          <input
            type="text"
            placeholder="Ticker (e.g. INFY.NS)"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            className="px-2.5 py-1.5 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-main placeholder-secondary/50 focus:outline-none focus:border-teal uppercase transition-colors"
          />
          <input
            type="number"
            min="1"
            placeholder="Qty"
            value={newQuantity}
            onChange={(e) => setNewQuantity(parseFloat(e.target.value) || 0)}
            className="w-20 px-2 py-1.5 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-right text-main focus:outline-none focus:border-teal tabular-nums transition-colors"
          />
          <input
            type="number"
            min="0.01"
            placeholder="Buy Price"
            value={newBuyPrice}
            onChange={(e) => setNewBuyPrice(parseFloat(e.target.value) || 0)}
            className="w-28 px-2 py-1.5 bg-white/[0.04] border border-[rgba(226,235,244,0.18)] rounded-lg text-right text-main focus:outline-none focus:border-teal tabular-nums transition-colors"
          />
          <button
            type="submit"
            className="px-3 py-1.5 bg-teal/10 hover:bg-teal/20 text-teal border border-teal/30 rounded-xl font-semibold transition-all flex items-center gap-1 shadow-glass-sm"
          >
            <Plus className="w-3.5 h-3.5 stroke-[2]" />
            <span>Add Row</span>
          </button>
        </form>
      </div>

      {/* 2. Top Metric Cards: Total Value, Total Cost, Total P&L */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Market Value"
          value={formatCurrency(trackData?.total_value ?? 1148500, currency)}
          subtitle={`Cost Basis: ${formatCurrency(trackData?.total_cost ?? 1000000, currency)}`}
          badge={<DollarSign className="w-4 h-4 text-teal stroke-[1.75]" />}
          highlight
        />

        <MetricCard
          title="Total Unrealized P&L"
          value={formatCurrency(trackData?.total_pnl ?? 148500, currency, 0, true)}
          subtitle={`Net Gain: ${formatPercent(trackData?.total_pnl_pct ?? 0.1485, 2, true)}`}
          trend={isProfit ? "up" : "down"}
          trendValue={formatPercent(trackData?.total_pnl_pct ?? 0.1485, 1, true)}
        />

        <MetricCard
          title="Portfolio Risk Verdict"
          value={trackData?.risk?.label || "High"}
          subtitle={`Score: ${trackData?.risk?.score || 82}/100`}
          trend="down"
          trendValue="Forward ML Class"
          badge={
            trackData?.risk?.label ? (
              <RiskBadge label={trackData.risk.label} size="sm" showIcon={false} />
            ) : null
          }
        />

        <MetricCard
          title="Benchmark Comparison"
          value={verdict === "outperforming" ? "Outperforming" : "In Line"}
          subtitle={`Target: ${benchmark}`}
          trend="up"
          trendValue="Excess Alpha"
          badge={<CheckCircle2 className="w-4 h-4 text-teal stroke-[1.75]" />}
        />
      </div>

      {/* 3. Verdict Banner (outperforming / underperforming / in_line) with Explanation Text */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-glass-sm ${
          verdict === "outperforming"
            ? "border-positive/30 bg-positive/[0.04] text-positive"
            : verdict === "underperforming"
            ? "border-negative/30 bg-negative/[0.04] text-negative"
            : "border-warning/30 bg-warning/[0.04] text-warning"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-white/[0.04] border border-current/20 mt-0.5">
            {verdict === "outperforming" ? (
              <TrendingUp className="w-5 h-5 text-positive stroke-[1.75]" />
            ) : (
              <TrendingDown className="w-5 h-5 text-negative stroke-[1.75]" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm uppercase tracking-wider font-heading">
                Benchmark Verdict: {verdict.toUpperCase()}
              </span>
              <span className="text-xs font-mono opacity-80">
                (vs {benchmark})
              </span>
            </div>
            <p className="text-xs text-secondary leading-relaxed font-sans max-w-3xl">
              {trackData?.explanations?.[0] ||
                `Portfolio is currently ${verdict} the ${benchmark} index over the chosen lookback window.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-mono font-semibold px-3 py-1 rounded-full bg-white/[0.05] border border-current/30">
            {verdict === "outperforming" ? "+ Alpha Generated" : "Tracking Index"}
          </span>
        </div>
      </div>

      {/* 4. Positions Table (price, value, P&L Rs and %, weight, day change coloured green/red) */}
      <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] overflow-hidden shadow-glass-sm">
        <div className="p-4 border-b border-[rgba(226,235,244,0.14)] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-main font-heading flex items-center gap-2">
              <Activity className="w-4 h-4 text-teal stroke-[1.75]" />
              Live Positions Mark-to-Market Performance
            </h2>
            <p className="text-xs text-secondary">
              Synchronized with real-time price feeds and daily currency adjustments.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-white/[0.03] border-b border-[rgba(226,235,244,0.14)] text-secondary uppercase tracking-wider text-[11px]">
              <tr>
                <th className="p-3.5">Asset</th>
                <th className="p-3.5 text-right">Latest Price</th>
                <th className="p-3.5 text-right">Day Change</th>
                <th className="p-3.5 text-right">Market Value</th>
                <th className="p-3.5 text-right">
                  P&L ({currency === "INR" ? "₹" : "$"})
                </th>
                <th className="p-3.5 text-right">P&L (%)</th>
                <th className="p-3.5 text-right">Weight</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[rgba(226,235,244,0.08)]">
              {trackData?.positions?.map((pos) => {
                const posProfit = pos.pnl >= 0;
                const dayProfit = pos.day_change >= 0;

                return (
                  <tr key={pos.ticker} className="hover:bg-white/[0.025] transition-colors">
                    <td className="p-3.5 font-bold text-main flex items-center gap-2">
                      <span>{pos.ticker}</span>
                    </td>
                    <td className="p-3.5 text-right text-main tabular-nums">
                      {formatCurrency(pos.price, currency, 2)}
                    </td>
                    <td className="p-3.5 text-right font-bold tabular-nums">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md ${
                          dayProfit
                            ? "text-positive bg-positive/10 border border-positive/20"
                            : "text-negative bg-negative/10 border border-negative/20"
                        }`}
                      >
                        {dayProfit ? (
                          <ArrowUpRight className="w-3 h-3 stroke-[2]" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3 stroke-[2]" />
                        )}
                        {formatPercent(pos.day_change, 1, true)}
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-main font-semibold tabular-nums">
                      {formatCurrency(pos.value, currency)}
                    </td>
                    <td
                      className={`p-3.5 text-right font-semibold tabular-nums ${
                        posProfit ? "text-positive" : "text-negative"
                      }`}
                    >
                      {formatCurrency(pos.pnl, currency, 0, true)}
                    </td>
                    <td
                      className={`p-3.5 text-right font-bold tabular-nums ${
                        posProfit ? "text-positive" : "text-negative"
                      }`}
                    >
                      {formatPercent(pos.pnl_pct, 1, true)}
                    </td>
                    <td className="p-3.5 text-right text-teal font-semibold tabular-nums">
                      {formatPercent(pos.weight, 1)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Benchmark Controls, Growth Overlay Chart & Allocation Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Growth Overlay Chart */}
        <div className="lg:col-span-2 rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] p-5 space-y-4 shadow-glass-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-main uppercase tracking-wider font-heading flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-teal stroke-[1.75]" />
                Performance vs {benchmark}
              </h3>
              <p className="text-xs text-secondary">
                Overlay comparison indexed to identical starting date.
              </p>
            </div>

            {/* Benchmark Selector & Lookback Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Benchmark Selector */}
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-[rgba(226,235,244,0.14)] text-xs font-mono">
                {(["NIFTY50", "NASDAQ100", "auto"] as Benchmark[]).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBenchmark(b)}
                    className={`px-2.5 py-1 rounded-lg transition-all ${
                      benchmark === b
                        ? "bg-teal text-background-base font-bold shadow-sm"
                        : "text-secondary hover:text-main"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>

              {/* Lookback Chips */}
              <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-xl border border-[rgba(226,235,244,0.14)] text-xs font-mono">
                {(["1m", "6m", "1y", "3y"] as LookbackPeriod[]).map((lb) => (
                  <button
                    key={lb}
                    onClick={() => setLookback(lb)}
                    className={`px-2 py-1 rounded-lg uppercase transition-all ${
                      lookback === lb
                        ? "bg-teal text-background-base font-bold shadow-sm"
                        : "text-secondary hover:text-main"
                    }`}
                  >
                    {lb}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 20, bottom: 0, left: 15 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,235,244,0.08)" vertical={false} />
                <XAxis dataKey="date" stroke="#9BA7B5" fontSize={11} tickLine={false} />
                <YAxis
                  stroke="#9BA7B5"
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
                      <div className="bg-[#0C1118]/95 border border-[rgba(226,235,244,0.2)] p-2.5 rounded-xl text-xs font-mono shadow-glass-lg backdrop-blur-md space-y-1">
                        <div className="text-secondary font-bold border-b border-white/[0.08] pb-1">
                          {item.date}
                        </div>
                        <div className="text-teal">
                          Portfolio: {currency === "INR" ? "₹" : "$"}{item.portfolio?.toLocaleString()}
                        </div>
                        <div className="text-secondary">
                          {benchmark}: {currency === "INR" ? "₹" : "$"}{item.benchmark?.toLocaleString()}
                        </div>
                      </div>
                    );
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="portfolio"
                  name="Portfolio"
                  stroke="#74C7BE"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name={benchmark}
                  stroke="#9BA7B5"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Allocation Donut */}
        <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] p-5 space-y-4 shadow-glass-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-main uppercase tracking-wider font-heading flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-teal stroke-[1.75]" />
              Capital Distribution
            </h3>
            <span className="text-xs font-mono text-secondary">% Share</span>
          </div>

          <div className="h-44 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={allocationPie}
                  innerRadius={48}
                  outerRadius={72}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {allocationPie.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-[#0C1118]/95 border border-[rgba(226,235,244,0.2)] p-2 rounded-xl text-xs font-mono shadow-glass-lg backdrop-blur-md">
                        <span className="font-bold text-main">{p.name}: </span>
                        <span className="text-teal">{p.value}%</span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-3 border-t border-[rgba(226,235,244,0.1)]">
            {allocationPie.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="text-secondary truncate">{item.name}</span>
                <span className="text-main ml-auto tabular-nums">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Metrics Comparison Table: Portfolio vs Benchmark */}
      {trackData?.benchmark?.portfolio && trackData?.benchmark?.benchmark_metrics && (
        <div className="rounded-2xl glass-panel border border-[rgba(226,235,244,0.18)] overflow-hidden shadow-glass-sm">
          <div className="p-4 border-b border-[rgba(226,235,244,0.14)] flex items-center justify-between">
            <h3 className="text-sm font-bold text-main uppercase tracking-wider font-heading flex items-center gap-2">
              <Award className="w-4 h-4 text-teal stroke-[1.75]" />
              Risk & Return Metrics Comparison (Lookback: {lookback})
            </h3>
            <span className="text-xs font-mono text-secondary">Same Period & FX Converted</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-white/[0.03] border-b border-[rgba(226,235,244,0.14)] text-secondary uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3.5">Metric</th>
                  <th className="p-3.5 text-right text-teal">Portfolio</th>
                  <th className="p-3.5 text-right text-secondary">{benchmark}</th>
                  <th className="p-3.5 text-right">Alpha / Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[rgba(226,235,244,0.08)]">
                <tr className="hover:bg-white/[0.025] transition-colors">
                  <td className="p-3.5 font-bold text-main font-sans">Total Return</td>
                  <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                    +{(trackData.benchmark.portfolio.total_return * 100).toFixed(2)}%
                  </td>
                  <td className="p-3.5 text-right text-secondary tabular-nums">
                    +{(trackData.benchmark.benchmark_metrics.total_return * 100).toFixed(2)}%
                  </td>
                  <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                    +{(
                      (trackData.benchmark.portfolio.total_return -
                        trackData.benchmark.benchmark_metrics.total_return) *
                      100
                    ).toFixed(2)}%
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.025] transition-colors">
                  <td className="p-3.5 font-bold text-main font-sans">Annualized Volatility</td>
                  <td className="p-3.5 text-right text-negative/90 tabular-nums">
                    {(trackData.benchmark.portfolio.volatility * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-secondary tabular-nums">
                    {(trackData.benchmark.benchmark_metrics.volatility * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-negative font-medium tabular-nums">
                    +{(
                      (trackData.benchmark.portfolio.volatility -
                        trackData.benchmark.benchmark_metrics.volatility) *
                      100
                    ).toFixed(1)}% (Higher Risk)
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.025] transition-colors">
                  <td className="p-3.5 font-bold text-main font-sans">Max Drawdown</td>
                  <td className="p-3.5 text-right text-negative font-semibold tabular-nums">
                    {(trackData.benchmark.portfolio.max_drawdown * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-secondary tabular-nums">
                    {(trackData.benchmark.benchmark_metrics.max_drawdown * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-secondary tabular-nums">
                    {(
                      (trackData.benchmark.portfolio.max_drawdown -
                        trackData.benchmark.benchmark_metrics.max_drawdown) *
                      100
                    ).toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.025] transition-colors">
                  <td className="p-3.5 font-bold text-main font-sans">Sharpe Ratio</td>
                  <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                    {trackData.benchmark.portfolio.sharpe.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-secondary tabular-nums">
                    {trackData.benchmark.benchmark_metrics.sharpe.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                    +{(
                      trackData.benchmark.portfolio.sharpe -
                      trackData.benchmark.benchmark_metrics.sharpe
                    ).toFixed(2)}
                  </td>
                </tr>

                <tr className="hover:bg-white/[0.025] transition-colors">
                  <td className="p-3.5 font-bold text-main font-sans">Sortino Ratio</td>
                  <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                    {trackData.benchmark.portfolio.sortino.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-secondary tabular-nums">
                    {trackData.benchmark.benchmark_metrics.sortino.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-positive font-bold tabular-nums">
                    +{(
                      trackData.benchmark.portfolio.sortino -
                      trackData.benchmark.benchmark_metrics.sortino
                    ).toFixed(2)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
