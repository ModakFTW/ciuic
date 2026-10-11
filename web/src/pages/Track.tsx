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

const COLORS = ["#0ea5e9", "#f59e0b", "#10b981", "#8b5cf6", "#ec4899", "#64748b"];

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
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300"
              title="Automatically pulls live market closes and daily FX series every 60 seconds"
            >
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span>Last updated: {lastUpdated}</span>
              <button
                onClick={() => refetch()}
                className="p-1 text-slate-400 hover:text-sky-400 rounded transition-colors"
                title="Refresh prices now"
              >
                <RefreshCw className="w-3 h-3" />
              </button>
            </div>
          </div>
        }
      />

      {trackError && <ErrorToast error={trackError as Error} onRetry={refetch} />}

      {/* 1. Holdings Entry Table with 'Use Demo Holdings' Button */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#1F293D] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Layers className="w-4 h-4 text-sky-400" />
              Holdings Entry & Cost Basis Editor
            </h2>
            <p className="text-xs text-slate-400">
              Input asset quantities and buy execution prices to compute live mark-to-market performance.
            </p>
          </div>

          <button
            onClick={handleUseDemoHoldings}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold bg-sky-500/10 text-sky-300 border border-sky-500/30 hover:bg-sky-500/20 transition-all cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 text-sky-400" />
            <span>Use Demo Holdings</span>
          </button>
        </div>

        {/* Positions Input Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400 uppercase tracking-wider text-[11px]">
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
            <tbody className="divide-y divide-slate-800/80">
              {positions.map((pos, idx) => {
                const rowCost = pos.quantity * pos.buy_price;
                return (
                  <tr key={pos.ticker} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-bold text-white flex items-center gap-2">
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
                        className="w-24 px-2 py-1 bg-slate-900 border border-slate-750 rounded text-right text-white focus:outline-none focus:border-sky-500"
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
                        className="w-28 px-2 py-1 bg-slate-900 border border-slate-750 rounded text-right text-white focus:outline-none focus:border-sky-500"
                      />
                    </td>
                    <td className="p-3.5 text-right text-slate-300 font-semibold">
                      {currency === "INR" ? "₹" : "$"}
                      {rowCost.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                    </td>
                    <td className="p-3.5 text-center">
                      <button
                        onClick={() => handleRemovePosition(idx)}
                        disabled={positions.length <= 1}
                        className={`p-1.5 rounded transition-colors ${
                          positions.length <= 1
                            ? "text-slate-600 cursor-not-allowed"
                            : "text-slate-400 hover:text-rose-400 hover:bg-slate-800"
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
          className="p-3 bg-slate-900/60 border-t border-[#1F293D] flex flex-wrap items-center gap-3 text-xs font-mono"
        >
          <span className="text-slate-400 font-semibold">Add Position:</span>
          <input
            type="text"
            placeholder="Ticker (e.g. INFY.NS)"
            value={newTicker}
            onChange={(e) => setNewTicker(e.target.value)}
            className="px-2.5 py-1 bg-slate-900 border border-slate-750 rounded text-white placeholder-slate-500 focus:outline-none focus:border-sky-500 uppercase"
          />
          <input
            type="number"
            min="1"
            placeholder="Qty"
            value={newQuantity}
            onChange={(e) => setNewQuantity(parseFloat(e.target.value) || 0)}
            className="w-20 px-2 py-1 bg-slate-900 border border-slate-750 rounded text-right text-white focus:outline-none focus:border-sky-500"
          />
          <input
            type="number"
            min="0.01"
            placeholder="Buy Price"
            value={newBuyPrice}
            onChange={(e) => setNewBuyPrice(parseFloat(e.target.value) || 0)}
            className="w-28 px-2 py-1 bg-slate-900 border border-slate-750 rounded text-right text-white focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            className="px-3 py-1 bg-sky-500/10 hover:bg-sky-500/20 text-sky-400 border border-sky-500/30 rounded font-bold transition-all flex items-center gap-1"
          >
            <Plus className="w-3.5 h-3.5" />
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
          badge={<DollarSign className="w-4 h-4 text-sky-400" />}
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
          badge={<CheckCircle2 className="w-4 h-4 text-emerald-400" />}
        />
      </div>

      {/* 3. Verdict Banner (outperforming / underperforming / in_line) with Explanation Text */}
      <div
        className={`p-5 rounded-2xl border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-lg ${
          verdict === "outperforming"
            ? "border-emerald-500/30 bg-gradient-to-r from-emerald-950/25 via-[#111827] to-[#111827] text-emerald-300"
            : verdict === "underperforming"
            ? "border-rose-500/30 bg-gradient-to-r from-rose-950/25 via-[#111827] to-[#111827] text-rose-300"
            : "border-amber-500/30 bg-gradient-to-r from-amber-950/25 via-[#111827] to-[#111827] text-amber-300"
        }`}
      >
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-xl bg-black/30 border border-current mt-0.5">
            {verdict === "outperforming" ? (
              <TrendingUp className="w-5 h-5 text-emerald-400" />
            ) : (
              <TrendingDown className="w-5 h-5 text-rose-400" />
            )}
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-sm uppercase tracking-wider">
                Benchmark Verdict: {verdict.toUpperCase()}
              </span>
              <span className="text-xs font-mono opacity-75">
                (vs {benchmark})
              </span>
            </div>
            <p className="text-xs text-slate-200 leading-relaxed font-sans max-w-3xl">
              {trackData?.explanations?.[0] ||
                `Portfolio is currently ${verdict} the ${benchmark} index over the chosen lookback window.`}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 flex-shrink-0">
          <span className="text-xs font-mono font-bold px-3 py-1 rounded-full bg-black/30 border border-current">
            {verdict === "outperforming" ? "+ Alpha Generated" : "Tracking Index"}
          </span>
        </div>
      </div>

      {/* 4. Positions Table (price, value, P&L Rs and %, weight, day change coloured green/red) */}
      <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden shadow-lg">
        <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Activity className="w-4 h-4 text-sky-400" />
              Live Positions Mark-to-Market Performance
            </h2>
            <p className="text-xs text-slate-400">
              Synchronized with real-time price feeds and daily currency adjustments.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400 uppercase tracking-wider text-[11px]">
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
            <tbody className="divide-y divide-slate-800/80">
              {trackData?.positions?.map((pos) => {
                const posProfit = pos.pnl >= 0;
                const dayProfit = pos.day_change >= 0;

                return (
                  <tr key={pos.ticker} className="hover:bg-slate-800/30 transition-colors">
                    <td className="p-3.5 font-bold text-white flex items-center gap-2">
                      <span>{pos.ticker}</span>
                    </td>
                    <td className="p-3.5 text-right text-slate-200">
                      {formatCurrency(pos.price, currency, 2)}
                    </td>
                    <td className="p-3.5 text-right font-bold">
                      <span
                        className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded ${
                          dayProfit
                            ? "text-emerald-400 bg-emerald-500/10 border border-emerald-500/20"
                            : "text-rose-400 bg-rose-500/10 border border-rose-500/20"
                        }`}
                      >
                        {dayProfit ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {formatPercent(pos.day_change, 1, true)}
                      </span>
                    </td>
                    <td className="p-3.5 text-right text-white font-semibold">
                      {formatCurrency(pos.value, currency)}
                    </td>
                    <td
                      className={`p-3.5 text-right font-semibold ${
                        posProfit ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatCurrency(pos.pnl, currency, 0, true)}
                    </td>
                    <td
                      className={`p-3.5 text-right font-bold ${
                        posProfit ? "text-emerald-400" : "text-rose-400"
                      }`}
                    >
                      {formatPercent(pos.pnl_pct, 1, true)}
                    </td>
                    <td className="p-3.5 text-right text-sky-400 font-semibold">
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
        <div className="lg:col-span-2 rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-sky-400" />
                Performance vs {benchmark}
              </h3>
              <p className="text-xs text-slate-400">
                Overlay comparison indexed to identical starting date.
              </p>
            </div>

            {/* Benchmark Selector & Lookback Chips */}
            <div className="flex flex-wrap items-center gap-2">
              {/* Benchmark Selector */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                {(["NIFTY50", "NASDAQ100", "auto"] as Benchmark[]).map((b) => (
                  <button
                    key={b}
                    onClick={() => setBenchmark(b)}
                    className={`px-2 py-0.5 rounded font-mono transition-all ${
                      benchmark === b
                        ? "bg-sky-500 text-slate-950 font-bold"
                        : "text-slate-400 hover:text-white"
                    }`}
                  >
                    {b}
                  </button>
                ))}
              </div>

              {/* Lookback Chips */}
              <div className="flex items-center gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800 text-xs">
                {(["1m", "6m", "1y", "3y"] as LookbackPeriod[]).map((lb) => (
                  <button
                    key={lb}
                    onClick={() => setLookback(lb)}
                    className={`px-2 py-0.5 rounded font-mono uppercase transition-all ${
                      lookback === lb
                        ? "bg-sky-500 text-slate-950 font-bold"
                        : "text-slate-400 hover:text-white"
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
                      <div className="bg-slate-900 border border-slate-750 p-2.5 rounded-lg text-xs font-mono shadow-xl space-y-1">
                        <div className="text-slate-400 font-bold border-b border-slate-800 pb-1">
                          {item.date}
                        </div>
                        <div className="text-sky-400">
                          Portfolio: {currency === "INR" ? "₹" : "$"}{item.portfolio?.toLocaleString()}
                        </div>
                        <div className="text-slate-400">
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
                  stroke="#0ea5e9"
                  strokeWidth={2.5}
                  dot={false}
                />
                <Line
                  type="monotone"
                  dataKey="benchmark"
                  name={benchmark}
                  stroke="#64748B"
                  strokeWidth={1.8}
                  strokeDasharray="4 4"
                  dot={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Allocation Donut */}
        <div className="rounded-xl border border-[#1F293D] bg-[#111827] p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-sky-400" />
              Capital Distribution Donut
            </h3>
            <span className="text-xs font-mono text-slate-500">% Share</span>
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
                      <div className="bg-slate-900 border border-slate-750 p-2 rounded text-xs font-mono">
                        <span className="font-bold text-white">{p.name}: </span>
                        <span className="text-sky-400">{p.value}%</span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-slate-800">
            {allocationPie.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-1.5">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                />
                <span className="text-slate-300 truncate">{item.name}</span>
                <span className="text-slate-500 ml-auto">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* 6. Metrics Comparison Table: Portfolio vs Benchmark */}
      {trackData?.benchmark?.portfolio && trackData?.benchmark?.benchmark_metrics && (
        <div className="rounded-xl border border-[#1F293D] bg-[#111827] overflow-hidden">
          <div className="p-4 border-b border-[#1F293D] flex items-center justify-between">
            <h3 className="text-sm font-bold text-white uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Award className="w-4 h-4 text-sky-400" />
              Risk & Return Metrics Comparison (Lookback: {lookback})
            </h3>
            <span className="text-xs font-mono text-slate-500">Same Period & FX Converted</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900/80 border-b border-[#1F293D] text-slate-400 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="p-3.5">Metric</th>
                  <th className="p-3.5 text-right text-sky-400">Portfolio</th>
                  <th className="p-3.5 text-right text-slate-400">{benchmark}</th>
                  <th className="p-3.5 text-right">Alpha / Variance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/80">
                <tr className="hover:bg-slate-800/30">
                  <td className="p-3.5 font-bold text-white">Total Return</td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold">
                    +{(trackData.benchmark.portfolio.total_return * 100).toFixed(2)}%
                  </td>
                  <td className="p-3.5 text-right text-slate-300">
                    +{(trackData.benchmark.benchmark_metrics.total_return * 100).toFixed(2)}%
                  </td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold">
                    +{(
                      (trackData.benchmark.portfolio.total_return -
                        trackData.benchmark.benchmark_metrics.total_return) *
                      100
                    ).toFixed(2)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-800/30">
                  <td className="p-3.5 font-bold text-white">Annualized Volatility</td>
                  <td className="p-3.5 text-right text-rose-300">
                    {(trackData.benchmark.portfolio.volatility * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-slate-300">
                    {(trackData.benchmark.benchmark_metrics.volatility * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-rose-400">
                    +{(
                      (trackData.benchmark.portfolio.volatility -
                        trackData.benchmark.benchmark_metrics.volatility) *
                      100
                    ).toFixed(1)}% (Higher Risk)
                  </td>
                </tr>

                <tr className="hover:bg-slate-800/30">
                  <td className="p-3.5 font-bold text-white">Max Drawdown</td>
                  <td className="p-3.5 text-right text-rose-400">
                    {(trackData.benchmark.portfolio.max_drawdown * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-slate-300">
                    {(trackData.benchmark.benchmark_metrics.max_drawdown * 100).toFixed(1)}%
                  </td>
                  <td className="p-3.5 text-right text-slate-400">
                    {(
                      (trackData.benchmark.portfolio.max_drawdown -
                        trackData.benchmark.benchmark_metrics.max_drawdown) *
                      100
                    ).toFixed(1)}%
                  </td>
                </tr>

                <tr className="hover:bg-slate-800/30">
                  <td className="p-3.5 font-bold text-white">Sharpe Ratio</td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold">
                    {trackData.benchmark.portfolio.sharpe.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-slate-300">
                    {trackData.benchmark.benchmark_metrics.sharpe.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold">
                    +{(
                      trackData.benchmark.portfolio.sharpe -
                      trackData.benchmark.benchmark_metrics.sharpe
                    ).toFixed(2)}
                  </td>
                </tr>

                <tr className="hover:bg-slate-800/30">
                  <td className="p-3.5 font-bold text-white">Sortino Ratio</td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold">
                    {trackData.benchmark.portfolio.sortino.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-slate-300">
                    {trackData.benchmark.benchmark_metrics.sortino.toFixed(2)}
                  </td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold">
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
