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
    <div className="space-y-6">
      <PageTitle
        title="Portfolio Builder"
        description="Configure asset holdings and balance capital allocations. Minimum 2, maximum 15 assets."
        badge={
          analyzeData?.risk_label ? (
            <RiskBadge label={analyzeData.risk_label} size="sm" />
          ) : null
        }
        actions={
          <div className="flex items-center gap-3">
            {/* Load Demo Portfolio Button */}
            <button
              onClick={handleLoadDemoPortfolio}
              disabled={isLoadingPresets}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium bg-surface-elevated hover:bg-surface-hover text-text-primary border border-border transition-colors min-h-[40px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98]"
              title="Loads demo portfolio: Tech-Heavy (₹10,00,000)"
            >
              <span>Load Demo Portfolio</span>
            </button>

            {/* Primary Analyse Button */}
            <button
              onClick={() => navigate("/risk")}
              disabled={!isAssetCountValid}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98] ${
                isAssetCountValid
                  ? "bg-accent hover:bg-accent-hover text-white shadow-sm cursor-pointer"
                  : "bg-surface-hover text-text-muted cursor-not-allowed border border-border"
              }`}
            >
              <span>Analyze Risk</span>
              <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
            </button>
          </div>
        }
      />

      {analyzeError && <ErrorToast error={analyzeError} />}

      {/* Inline Validation Banner */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Asset Count Validation */}
        <div
          className={`px-3.5 py-2.5 rounded-md border flex items-center justify-between text-xs font-mono transition-colors ${
            holdings.length < 2
              ? "bg-risk-high-subtle border-risk-high-border text-risk-high"
              : holdings.length > 15
              ? "bg-risk-med-subtle border-risk-med-border text-risk-med"
              : "bg-surface-elevated border-border text-text-secondary"
          }`}
        >
          <div className="flex items-center gap-2">
            {holdings.length < 2 ? (
              <AlertTriangle className="w-4 h-4 text-risk-high" strokeWidth={1.75} />
            ) : holdings.length > 15 ? (
              <AlertTriangle className="w-4 h-4 text-risk-med" strokeWidth={1.75} />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-risk-low" strokeWidth={1.75} />
            )}
            <span>
              Asset Count: <strong className="tabular-nums text-text-primary">{holdings.length} / 15</strong> (Min 2)
            </span>
          </div>
          {holdings.length < 2 && (
            <span className="text-risk-high font-medium">Add at least 1 more asset</span>
          )}
        </div>

        {/* Weight Sum Validation */}
        <div
          className={`px-3.5 py-2.5 rounded-md border flex items-center justify-between text-xs font-mono transition-colors ${
            isWeightValid
              ? "bg-surface-elevated border-border text-text-secondary"
              : "bg-risk-med-subtle border-risk-med-border text-risk-med"
          }`}
        >
          <div className="flex items-center gap-2">
            {isWeightValid ? (
              <CheckCircle2 className="w-4 h-4 text-risk-low" strokeWidth={1.75} />
            ) : (
              <AlertTriangle className="w-4 h-4 text-risk-med" strokeWidth={1.75} />
            )}
            <span>
              Allocation Sum: <strong className="tabular-nums text-text-primary">{currentWeightSum.toFixed(1)}%</strong>
            </span>
          </div>

          {!isWeightValid && (
            <button
              onClick={handleNormalizeWeights}
              className="px-2 py-0.5 rounded bg-surface hover:bg-surface-hover text-text-primary border border-border font-medium transition-colors cursor-pointer min-h-[28px]"
            >
              Normalize to 100%
            </button>
          )}
        </div>
      </div>

      {/* Top Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          title="Total Capital"
          value={formatCurrency(totalAmount, currency)}
          subtitle={`${holdings.length} Active Positions`}
          helper={`Currency: ${currency}`}
          badge={<DollarSign className="w-4 h-4 text-accent-light" strokeWidth={1.75} />}
        />
        <MetricCard
          title="Risk Category"
          value={analyzeData?.risk_label || (isAnalyzing ? "Analyzing..." : "Pending")}
          subtitle={`Score: ${analyzeData?.risk_score ?? "--"}/100`}
          trend={analyzeData?.risk_label === "High" ? "down" : "up"}
          trendValue={analyzeData?.risk_label === "High" ? "High Risk" : "Controlled"}
          badge={
            analyzeData?.risk_label ? (
              <RiskBadge label={analyzeData.risk_label} size="sm" showIcon={false} />
            ) : null
          }
        />
        <MetricCard
          title="Target Appetite"
          value={risk_level.toUpperCase()}
          subtitle="Optimizer Threshold"
          trend="neutral"
          trendValue={`Target: ${risk_level}`}
        />
        <MetricCard
          title="Benchmark"
          value={benchmark}
          subtitle={`Horizon: ${periodPreset}`}
          badge={<CheckCircle2 className="w-4 h-4 text-risk-low" strokeWidth={1.75} />}
        />
      </div>

      {/* Preset Selector Bar */}
      {presetsData?.presets && (
        <div className="p-3.5 rounded-lg border border-border bg-surface flex flex-col md:flex-row items-start md:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-2">
            <Sliders className="w-4 h-4 text-accent-light" strokeWidth={1.75} />
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              Presets:
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {presetsData.presets.map((preset) => (
              <button
                key={preset.id}
                onClick={() => loadPreset(preset)}
                className="px-3 py-1.5 rounded-md text-xs font-medium border border-border bg-surface-elevated hover:bg-surface-hover text-text-secondary hover:text-text-primary transition-colors flex items-center gap-2 min-h-[36px] cursor-pointer"
              >
                <span>{preset.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.2 rounded bg-surface text-text-muted border border-border-subtle">
                  {preset.risk_level}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Controls Bar: Risk Level, Currency, Benchmark, Lookback Period */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-4 rounded-lg border border-border bg-surface shadow-sm">
        {/* Risk Level Selector */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Target Risk Level
          </label>
          <div className="grid grid-cols-3 gap-1 bg-surface-elevated p-1 rounded-md border border-border">
            {(["low", "medium", "high"] as RiskLevel[]).map((level) => (
              <button
                key={level}
                onClick={() => setRiskLevel(level)}
                className={`py-1.5 text-xs font-medium rounded capitalize transition-colors min-h-[34px] cursor-pointer ${
                  risk_level === level
                    ? level === "low"
                      ? "bg-risk-low-subtle text-risk-low border border-risk-low-border"
                      : level === "medium"
                      ? "bg-risk-med-subtle text-risk-med border border-risk-med-border"
                      : "bg-risk-high-subtle text-risk-high border border-risk-high-border"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
        </div>

        {/* Currency Toggle */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Currency
          </label>
          <div className="grid grid-cols-2 gap-1 bg-surface-elevated p-1 rounded-md border border-border">
            {(["INR", "USD"] as Currency[]).map((curr) => (
              <button
                key={curr}
                onClick={() => setCurrency(curr)}
                className={`py-1.5 text-xs font-mono font-medium rounded uppercase transition-colors min-h-[34px] cursor-pointer ${
                  currency === curr
                    ? "bg-accent-subtle text-accent-light border border-accent-border font-semibold"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {curr === "INR" ? "₹ INR" : "$ USD"}
              </button>
            ))}
          </div>
        </div>

        {/* Benchmark Selector */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Benchmark
          </label>
          <div className="grid grid-cols-3 gap-1 bg-surface-elevated p-1 rounded-md border border-border">
            {(["NIFTY50", "NASDAQ100", "auto"] as Benchmark[]).map((b) => (
              <button
                key={b}
                onClick={() => setBenchmark(b)}
                className={`py-1.5 text-xs font-medium rounded transition-colors truncate px-1 min-h-[34px] cursor-pointer ${
                  benchmark === b
                    ? "bg-accent-subtle text-accent-light border border-accent-border font-semibold"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                {b}
              </button>
            ))}
          </div>
        </div>

        {/* Period Selector */}
        <div>
          <label className="block text-[10px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            Lookback Horizon
          </label>
          <div className="grid grid-cols-4 gap-1 bg-surface-elevated p-1 rounded-md border border-border">
            {(["1y", "3y", "5y", "max"] as const).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod({ preset: p })}
                className={`py-1.5 text-xs font-mono font-medium rounded transition-colors min-h-[34px] cursor-pointer ${
                  periodPreset === p
                    ? "bg-accent-subtle text-accent-light border border-accent-border font-semibold"
                    : "text-text-secondary hover:text-text-primary"
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
        <div className="lg:col-span-2 rounded-lg border border-border bg-surface overflow-hidden shadow-sm">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <div>
              <h2 className="text-sm font-semibold text-text-primary">Portfolio Positions</h2>
              <p className="text-xs text-text-muted mt-0.5">
                Adjust position values in {currency} or % weight.
              </p>
            </div>

            {/* Value / Percent Toggle */}
            <div className="flex items-center gap-1 bg-surface-elevated p-1 rounded-md border border-border">
              <button
                onClick={() => setMode("amount")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors min-h-[32px] cursor-pointer ${
                  mode === "amount"
                    ? "bg-accent text-white font-medium shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <DollarSign className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>{currency === "INR" ? "₹ Amount" : "$ Amount"}</span>
              </button>
              <button
                onClick={() => setMode("percent")}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded transition-colors min-h-[32px] cursor-pointer ${
                  mode === "percent"
                    ? "bg-accent text-white font-medium shadow-sm"
                    : "text-text-secondary hover:text-text-primary"
                }`}
              >
                <Percent className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>% Weight</span>
              </button>
            </div>
          </div>

          {holdings.length === 0 ? (
            <div className="p-12 text-center text-text-muted space-y-2">
              <Info className="w-6 h-6 mx-auto text-text-muted" strokeWidth={1.75} />
              <p className="text-xs">No assets selected. Use search to add instruments or load demo portfolio.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {holdings.map((holding) => {
                const weightPct = totalAmount > 0 ? (holding.amount / totalAmount) * 100 : 0;
                return (
                  <div
                    key={holding.ticker}
                    className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-surface-hover transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded bg-surface-elevated border border-border flex items-center justify-center font-mono font-medium text-xs text-accent-light">
                        {holding.ticker.slice(0, 3)}
                      </div>
                      <div>
                        <div className="font-medium text-text-primary font-mono text-xs flex items-center gap-2">
                          <span>{holding.ticker}</span>
                          {holding.ticker.endsWith(".NS") ? (
                            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-surface-elevated text-text-muted border border-border-subtle">
                              NSE
                            </span>
                          ) : (
                            <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-surface-elevated text-text-muted border border-border-subtle">
                              US
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-text-muted font-mono">
                          Weight: <strong className="text-text-secondary tabular-nums">{weightPct.toFixed(1)}%</strong>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      {mode === "amount" ? (
                        <div className="relative">
                          <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted font-mono">
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
                            className="w-32 pl-6 pr-2.5 py-1.5 bg-surface-elevated border border-border rounded-md text-xs font-mono text-text-primary text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent min-h-[38px] tabular-nums"
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
                            className="w-24 pl-2.5 pr-6 py-1.5 bg-surface-elevated border border-border rounded-md text-xs font-mono text-text-primary text-right focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent min-h-[38px] tabular-nums"
                          />
                          <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-text-muted font-mono">
                            %
                          </span>
                        </div>
                      )}

                      <button
                        onClick={() => handleRemoveAsset(holding.ticker)}
                        disabled={holdings.length <= 2}
                        className={`p-2 rounded-md transition-colors min-h-[38px] min-w-[38px] flex items-center justify-center cursor-pointer ${
                          holdings.length <= 2
                            ? "text-text-muted opacity-40 cursor-not-allowed"
                            : "text-text-muted hover:text-risk-high hover:bg-surface-elevated"
                        }`}
                        title={
                          holdings.length <= 2
                            ? "Minimum 2 assets required"
                            : "Remove asset"
                        }
                        aria-label="Remove asset"
                      >
                        <Trash2 className="w-4 h-4" strokeWidth={1.75} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          <div className="p-3 bg-surface-elevated border-t border-border flex items-center justify-between text-xs text-text-muted font-mono">
            <span>
              Total Capital:{" "}
              <strong className="text-text-primary font-mono tabular-nums">
                {formatCurrency(totalAmount, currency)}
              </strong>
            </span>
            <div className="flex items-center gap-2">
              {isAnalyzing && (
                <span className="flex items-center gap-1 text-accent-light font-mono text-xs">
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
        <div className="rounded-lg border border-border bg-surface p-4 space-y-3.5 shadow-sm">
          <div>
            <h2 className="text-sm font-semibold text-text-primary">Asset Search</h2>
            <p className="text-xs text-text-muted mt-0.5">
              Universe of 36 eligible equity and ETF assets.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" strokeWidth={1.75} />
            <input
              type="text"
              placeholder="Search ticker or name (INFY, AAPL)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 bg-surface-elevated border border-border rounded-md text-xs text-text-primary placeholder-text-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent min-h-[40px]"
            />
          </div>

          <div className="space-y-1.5 max-h-[460px] overflow-y-auto pr-1">
            {isSearching && (
              <div className="py-3 space-y-2">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
              </div>
            )}
            {!isSearching && searchData?.results?.length === 0 && (
              <div className="text-xs text-text-muted text-center py-4 font-mono">
                No matching assets found.
              </div>
            )}
            {searchData?.results?.map((asset) => {
              const isAdded = holdings.some((h) => h.ticker === asset.ticker);
              return (
                <div
                  key={asset.ticker}
                  className="p-2.5 rounded-md border border-border bg-surface-elevated hover:bg-surface-hover flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 font-mono text-xs font-medium text-text-primary">
                      <span>{asset.ticker}</span>
                      <span className="text-[10px] text-text-muted font-sans">
                        · {asset.market} ({asset.currency})
                      </span>
                    </div>
                    <div className="text-xs text-text-secondary truncate">{asset.name}</div>
                    <div className="text-[10px] text-text-muted font-mono">{asset.sector}</div>
                  </div>

                  <button
                    disabled={isAdded || holdings.length >= 15}
                    onClick={() => handleAddAsset(asset.ticker)}
                    className={`p-1.5 rounded-md text-xs font-medium transition-colors flex items-center justify-center min-h-[34px] min-w-[34px] ${
                      isAdded
                        ? "text-text-muted bg-surface cursor-not-allowed opacity-50"
                        : holdings.length >= 15
                        ? "text-text-muted bg-surface cursor-not-allowed opacity-50"
                        : "text-text-primary hover:text-white bg-surface hover:bg-accent border border-border cursor-pointer"
                    }`}
                    aria-label={`Add ${asset.ticker}`}
                  >
                    {isAdded ? "Added" : <Plus className="w-3.5 h-3.5" strokeWidth={1.75} />}
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
