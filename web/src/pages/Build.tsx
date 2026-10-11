import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Plus,
  Trash2,
  Search,
  DollarSign,
  Percent,
  Sliders,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  RefreshCw,
  Info,
  Layers,
  Sparkles,
} from "lucide-react";
import { usePortfolio, DEMO_AMOUNT } from "../state/PortfolioContext";
import { searchAssets, getPresets } from "../api/client";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { ErrorToast } from "../components/ErrorToast";
import { Skeleton } from "../components/Skeleton";
import { formatCurrency, formatPercent } from "../utils/format";
import type { RiskLevel, Benchmark, Currency } from "../api/types";

export const BuildPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    holdings,
    setHoldings,
    risk_level,
    setRiskLevel,
    amount,
    currency,
    setCurrency,
    period,
    setPeriod,
    benchmark,
    setBenchmark,
    loadPreset,
    analyzeData,
    isAnalyzing,
    analyzeError,
  } = usePortfolio();

  // Search state with 300ms debounce
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Mode: amount vs percentage
  const [mode, setMode] = useState<"amount" | "percent">("amount");

  const { data: searchData, isLoading: isSearching } = useQuery({
    queryKey: ["assetsSearch", debouncedSearch],
    queryFn: () => searchAssets(debouncedSearch),
    staleTime: 1000 * 60 * 10,
  });

  const { data: presetsData, isLoading: isLoadingPresets } = useQuery({
    queryKey: ["presets"],
    queryFn: () => getPresets(),
    staleTime: 1000 * 60 * 30,
  });

  const totalAmount = holdings.reduce((sum, h) => sum + (Number(h.amount) || 0), 0) || 1;
  const currentWeightSum = holdings.reduce(
    (sum, h) => sum + (totalAmount > 0 ? (h.amount / totalAmount) * 100 : 0),
    0
  );

  const isWeightValid = Math.abs(currentWeightSum - 100) < 0.1;
  const isAssetCountValid = holdings.length >= 2 && holdings.length <= 15;

  // Amount and % updates keeping both in sync
  const handleUpdateAmount = (ticker: string, val: number) => {
    const updated = holdings.map((h) =>
      h.ticker === ticker ? { ...h, amount: Math.max(0, val) } : h
    );
    setHoldings(updated);
  };

  const handleUpdatePercent = (ticker: string, pct: number) => {
    const targetAmt = Math.round((Math.max(0, pct) / 100) * totalAmount);
    handleUpdateAmount(ticker, targetAmt);
  };

  const handleNormalizeWeights = () => {
    if (totalAmount <= 0) return;
    const baseTotal = amount || DEMO_AMOUNT;
    const normalized = holdings.map((h) => ({
      ...h,
      amount: Math.round((h.amount / totalAmount) * baseTotal),
    }));
    setHoldings(normalized);
  };

  const handleRemoveAsset = (ticker: string) => {
    if (holdings.length <= 2) {
      alert("A portfolio must contain at least 2 assets for covariance calculation.");
      return;
    }
    setHoldings(holdings.filter((h) => h.ticker !== ticker));
  };

  const handleAddAsset = (ticker: string) => {
    if (holdings.some((h) => h.ticker === ticker)) return;
    if (holdings.length >= 15) {
      alert("Maximum 15 assets allowed per portfolio contract.");
      return;
    }
    const targetPerAsset = Math.round(totalAmount / (holdings.length + 1));
    setHoldings([...holdings, { ticker, amount: targetPerAsset }]);
    setSearchQuery("");
  };

  const handleLoadDemoPortfolio = () => {
    if (presetsData?.presets && presetsData.presets.length > 0) {
      loadPreset(presetsData.presets[0]);
    }
  };

  const periodPreset = "preset" in period ? period.preset : "custom";

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageTitle
        title="Portfolio Builder"
        description="Configure asset holdings, balance position weights, and set optimizer risk thresholds. Minimum 2, maximum 15 assets."
        badge={
          analyzeData?.risk_label ? (
            <RiskBadge label={analyzeData.risk_label} size="sm" />
          ) : null
        }
        actions={
          <div className="flex items-center gap-2.5">
            {/* Load Demo Portfolio Button */}
            <button
              onClick={handleLoadDemoPortfolio}
              disabled={isLoadingPresets}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium glass-panel-interactive text-secondary hover:text-main transition-all min-h-[40px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal active:scale-[0.98]"
              title="Loads demo portfolio: Tech-Heavy (₹10,00,000)"
            >
              <span>Load Demo Portfolio</span>
            </button>

            {/* Primary Analyse Button */}
            <button
              onClick={() => navigate("/risk")}
              disabled={!isAssetCountValid}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-mono font-semibold transition-all min-h-[40px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal active:scale-[0.98] ${
                isAssetCountValid
                  ? "bg-teal/20 hover:bg-teal/30 text-teal border border-teal/40 shadow-glass-sm cursor-pointer"
                  : "bg-white/[0.03] text-secondary/40 cursor-not-allowed border border-white/[0.06]"
              }`}
            >
              <span>Analyze Risk</span>
              <ArrowRight className="w-3.5 h-3.5 stroke-[2]" />
            </button>
          </div>
        }
      />

      {analyzeError && <ErrorToast error={analyzeError} />}

      {/* Validation Status Bar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Asset Count Validation */}
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-mono transition-all backdrop-blur-md ${
            holdings.length < 2
              ? "bg-negative/10 border-negative/30 text-negative"
              : holdings.length > 15
              ? "bg-warning/10 border-warning/30 text-warning"
              : "glass-panel text-secondary"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {holdings.length < 2 ? (
              <AlertTriangle className="w-4 h-4 text-negative stroke-[2]" />
            ) : holdings.length > 15 ? (
              <AlertTriangle className="w-4 h-4 text-warning stroke-[2]" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-positive stroke-[2]" />
            )}
            <span>
              Asset Count: <strong className="tabular-nums text-main">{holdings.length} / 15</strong> (Min 2)
            </span>
          </div>
          {holdings.length < 2 && (
            <span className="text-negative font-medium">Add at least 1 more position</span>
          )}
        </div>

        {/* Weight Sum Validation */}
        <div
          className={`px-4 py-3 rounded-xl border flex items-center justify-between text-xs font-mono transition-all backdrop-blur-md ${
            isWeightValid
              ? "glass-panel text-secondary"
              : "bg-warning/10 border-warning/30 text-warning"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isWeightValid ? (
              <CheckCircle2 className="w-4 h-4 text-positive stroke-[2]" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-warning stroke-[2]" />
            )}
            <span>
              Allocation Sum: <strong className="tabular-nums text-main">{currentWeightSum.toFixed(1)}%</strong>
            </span>
          </div>

          {!isWeightValid && (
            <button
              onClick={handleNormalizeWeights}
              className="px-2.5 py-1 rounded-lg bg-white/[0.08] hover:bg-white/[0.14] text-main border border-[rgba(226,235,244,0.20)] font-medium transition-all cursor-pointer min-h-[30px]"
            >
              Normalize to 100%
            </button>
          )}
        </div>
      </div>

      {/* Preset Selector Bar */}
      {presetsData?.presets && (
        <div className="p-4 rounded-xl glass-panel flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-glass-sm">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-teal stroke-[1.75]" />
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-secondary">
              Benchmark Presets:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {presetsData.presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => loadPreset(preset)}
                className="px-3 py-1.5 rounded-lg text-xs font-mono border border-[rgba(226,235,244,0.15)] bg-white/[0.035] hover:bg-white/[0.08] text-secondary hover:text-main transition-all flex items-center gap-2 min-h-[34px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal"
              >
                <span>{preset.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-secondary/70 border border-white/[0.08]">
                  {preset.risk_level}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Parameter Controls Bar: Risk Level, Currency, Benchmark, Lookback Period */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3.5 p-4 rounded-xl glass-panel shadow-glass-sm">
        {/* Risk Level Selector */}
        <div>
          <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-secondary mb-1.5">
            Target Risk Appetite
          </label>
          <div className="grid grid-cols-3 gap-1 bg-[#080B10]/60 p-1 rounded-xl border border-[rgba(226,235,244,0.12)]">
            {(["low", "medium", "high"] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setRiskLevel(level)}
                className={`py-1.5 text-xs font-mono font-medium rounded-lg capitalize transition-all min-h-[32px] cursor-pointer ${
                  risk_level === level
                    ? level === "low"
                      ? "bg-positive/15 text-positive border border-positive/30 shadow-glass-sm font-semibold"
                      : level === "medium"
                      ? "bg-warning/15 text-warning border border-warning/30 shadow-glass-sm font-semibold"
                      : "bg-negative/15 text-negative border border-negative/30 shadow-glass-sm font-semibold"
                    : "text-secondary hover:text-main"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Currency Toggle */}
        <div>
          <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-secondary mb-1.5">
            Base Currency
          </label>
          <div className="grid grid-cols-2 gap-1 bg-[#080B10]/60 p-1 rounded-xl border border-[rgba(226,235,244,0.12)]">
            {(["INR", "USD"] as Currency[]).map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`py-1.5 text-xs font-mono font-medium rounded-lg uppercase transition-all min-h-[32px] cursor-pointer ${
                  currency === curr
                    ? "bg-teal/20 text-teal border border-teal/40 shadow-glass-sm font-semibold"
                    : "text-secondary hover:text-main"
                }`}
              >
                {curr === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
        </div>

        {/* Benchmark Selector */}
        <div>
          <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-secondary mb-1.5">
            Market Benchmark
          </label>
          <div className="grid grid-cols-3 gap-1 bg-[#080B10]/60 p-1 rounded-xl border border-[rgba(226,235,244,0.12)]">
            {(["NIFTY50", "NASDAQ100", "auto"] as Benchmark[]).map((b) => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                className={`py-1.5 text-xs font-mono font-medium rounded-lg transition-all truncate px-1 min-h-[32px] cursor-pointer ${
                  benchmark === b
                    ? "bg-teal/20 text-teal border border-teal/40 shadow-glass-sm font-semibold"
                    : "text-secondary hover:text-main"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Period Selector */}
        <div>
          <label className="block text-[10px] font-mono font-medium uppercase tracking-wider text-secondary mb-1.5">
            Lookback Horizon
          </label>
          <div className="grid grid-cols-4 gap-1 bg-[#080B10]/60 p-1 rounded-xl border border-[rgba(226,235,244,0.12)]">
            {(["1y", "3y", "5y", "max"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod({ preset: p })}
                className={`py-1.5 text-xs font-mono font-medium rounded-lg transition-all min-h-[32px] cursor-pointer ${
                  periodPreset === p
                    ? "bg-teal/20 text-teal border border-teal/40 shadow-glass-sm font-semibold"
                    : "text-secondary hover:text-main"
                }`}
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Holdings & Asset Search Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings Table */}
        <div className="lg:col-span-2 rounded-2xl glass-panel overflow-hidden shadow-glass">
          <div className="p-4 border-b border-[rgba(226,235,244,0.10)] flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-main font-sans">Portfolio Positions</h2>
              <p className="text-xs text-secondary mt-0.5">
                Adjust position values in {currency} or % weight.
              </p>
            </div>

            {/* Value / Percent Toggle */}
            <div className="flex items-center gap-1 bg-[#080B10]/60 p-1 rounded-xl border border-[rgba(226,235,244,0.12)]">
              <button
                onClick={() => setMode("amount")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-all min-h-[30px] cursor-pointer ${
                  mode === "amount"
                    ? "bg-teal/20 text-teal border border-teal/40 font-semibold shadow-glass-sm"
                    : "text-secondary hover:text-main"
                }`}
              >
                <DollarSign className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>{currency === "INR" ? "₹ Amount" : "$ Amount"}</span>
              </button>
              <button
                onClick={() => setMode("percent")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-mono font-medium rounded-lg transition-all min-h-[30px] cursor-pointer ${
                  mode === "percent"
                    ? "bg-teal/20 text-teal border border-teal/40 font-semibold shadow-glass-sm"
                    : "text-secondary hover:text-main"
                }`}
              >
                <Percent className="w-3.5 h-3.5 stroke-[1.75]" />
                <span>% Weight</span>
              </button>
            </div>
          </div>

          {holdings.length === 0 ? (
            <div className="p-12 text-center text-secondary space-y-2">
              <Info className="w-6 h-6 mx-auto text-secondary/60 stroke-[1.75]" />
              <p className="text-xs font-sans">No assets configured. Use the asset search panel to add positions.</p>
            </div>
          ) : (
            <div className="divide-y divide-[rgba(226,235,244,0.08)]">
              {holdings.map((holding) => {
                const weightPct = totalAmount > 0 ? (holding.amount / totalAmount) * 100 : 0;
                return (
                  <div
                    key={holding.ticker}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-white/[0.03] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-white/[0.04] border border-[rgba(226,235,244,0.15)] flex items-center justify-center font-mono font-bold text-xs text-teal shadow-glass-sm">
                        {holding.ticker.slice(0, 3)}
                      </div>
                      <div>
                        <div className="font-bold text-main font-mono text-xs flex items-center gap-2">
                          <span>{holding.ticker}</span>
                          {holding.ticker.endsWith(".NS") ? (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-secondary border border-white/[0.08]">
                              NSE
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/[0.05] text-secondary border border-white/[0.08]">
                              US
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-secondary font-mono">
                          Weight: <strong className="text-main tabular-nums">{weightPct.toFixed(1)}%</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {mode === "amount" ? (
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary font-mono">
                            {currency === "INR" ? "₹" : "$"}
                          </span>
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={holding.amount}
                            onChange={(e) =>
                              handleUpdateAmount(holding.ticker, parseFloat(e.target.value) || 0)
                            }
                            className="w-32 pl-6 pr-2.5 py-1.5 bg-[#080B10] border border-[rgba(226,235,244,0.18)] rounded-xl text-xs font-mono text-main text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal min-h-[38px] tabular-nums"
                          />
                        </div>
                      ) : (
                        <div className="relative">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            value={weightPct.toFixed(1)}
                            onChange={(e) =>
                              handleUpdatePercent(holding.ticker, parseFloat(e.target.value) || 0)
                            }
                            className="w-24 pl-2.5 pr-6 py-1.5 bg-[#080B10] border border-[rgba(226,235,244,0.18)] rounded-xl text-xs font-mono text-main text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal min-h-[38px] tabular-nums"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-secondary font-mono">
                            %
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => handleRemoveAsset(holding.ticker)}
                        disabled={holdings.length <= 2}
                        className={`p-2 rounded-xl transition-all min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer ${
                          holdings.length <= 2
                            ? "text-secondary/30 opacity-40 cursor-not-allowed"
                            : "text-secondary hover:text-negative hover:bg-negative/10 hover:border-negative/30 border border-transparent"
                        }`}
                        title={
                          holdings.length <= 2
                            ? "Minimum 2 assets required"
                            : "Remove position"
                        }
                        aria-label="Remove asset"
                      >
                        <Trash2 className="w-4 h-4 stroke-[1.75]" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-3.5 bg-[#0A0E15] border-t border-[rgba(226,235,244,0.10)] flex items-center justify-between text-xs text-secondary font-mono">
            <span>
              Total Capital:{" "}
              <strong className="text-main font-mono tabular-nums">
                {formatCurrency(totalAmount, currency)}
              </strong>
            </span>
            <div className="flex items-center gap-2">
              {isAnalyzing && (
                <span className="flex items-center gap-1 text-teal font-mono text-xs">
                  <RefreshCw className="w-3 h-3 animate-spin" />
                  Calculating...
                </span>
              )}
              <span className="font-mono tabular-nums">
                Sum: {formatPercent(currentWeightSum / 100, 1)}
              </span>
            </div>
          </div>
        </div>

        {/* Add Asset Search Box with Debounce */}
        <div className="rounded-2xl glass-panel p-4 space-y-3.5 shadow-glass">
          <div>
            <h2 className="text-sm font-bold text-main font-sans">Asset Search</h2>
            <p className="text-xs text-secondary mt-0.5">
              Universe of 36 eligible equity and ETF assets.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-secondary absolute left-3 top-1/2 -translate-y-1/2 stroke-[1.75]" />
            <input
              type="text"
              placeholder="Search ticker or name (INFY, AAPL)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-[#080B10] border border-[rgba(226,235,244,0.18)] rounded-xl text-xs text-main placeholder-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal min-h-[40px]"
            />
          </div>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {isSearching && (
              <div className="py-3 space-y-2">
                <Skeleton className="h-9 w-full rounded-xl" />
                <Skeleton className="h-9 w-full rounded-xl" />
              </div>
            )}
            {!isSearching && searchData?.results?.length === 0 && (
              <div className="text-xs text-secondary text-center py-4 font-mono">
                No matching assets found.
              </div>
            )}
            {searchData?.results?.map((asset) => {
              const isAdded = holdings.some((h) => h.ticker === asset.ticker);
              return (
                <div
                  key={asset.ticker}
                  className="p-2.5 rounded-xl border border-[rgba(226,235,244,0.12)] bg-white/[0.025] hover:bg-white/[0.06] hover:border-[rgba(226,235,244,0.22)] flex items-center justify-between gap-3 transition-all"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-semibold text-main">
                      <span>{asset.ticker}</span>
                      <span className="text-[10px] text-secondary font-sans">
                        · {asset.market} ({asset.currency})
                      </span>
                    </div>
                    <div className="text-xs text-secondary truncate">{asset.name}</div>
                    <div className="text-[10px] text-secondary/70 font-mono">{asset.sector}</div>
                  </div>

                  <button
                    disabled={isAdded || holdings.length >= 15}
                    onClick={() => handleAddAsset(asset.ticker)}
                    className={`p-1.5 rounded-lg text-xs font-medium transition-all flex items-center justify-center min-h-[34px] min-w-[34px] ${
                      isAdded
                        ? "text-secondary/40 bg-white/[0.02] cursor-not-allowed opacity-50 border border-white/[0.05]"
                        : holdings.length >= 15
                        ? "text-secondary/40 bg-white/[0.02] cursor-not-allowed opacity-50 border border-white/[0.05]"
                        : "text-main hover:text-white bg-white/[0.05] hover:bg-teal hover:border-teal text-teal border border-[rgba(226,235,244,0.18)] cursor-pointer"
                    }`}
                    aria-label={`Add ${asset.ticker}`}
                  >
                    {isAdded ? "Added" : <Plus className="w-3.5 h-3.5 stroke-[2]" />}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
