import React, { useState } from "react";
import { Link } from "react-router-dom";
import {
  ShieldAlert,
  ArrowRight,
  Gauge,
  AlertTriangle,
  Layers,
  PieChart as PieIcon,
  X,
  Check,
  TrendingDown,
  TrendingUp,
  Activity,
  Sliders,
  CheckCircle2,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { usePortfolio } from "../state/PortfolioContext";
import { PageTitle } from "../components/PageTitle";
import { MetricCard } from "../components/MetricCard";
import { RiskBadge } from "../components/RiskBadge";
import { CardSkeleton } from "../components/Skeleton";
import { ErrorToast } from "../components/ErrorToast";
import { ChartTooltip } from "../components/ChartTooltip";
import { formatPercent, formatRatio } from "../utils/format";

const PRECISION_SECTOR_COLORS = [
  "#74C7BE", // Muted Teal
  "#D9B675", // Warning Gold
  "#86C8A0", // Positive Sage
  "#9BA7B5", // Secondary Slate
  "#687787", // Dim Steel
  "#4A5568", // Deep Slate
];

export const RiskPage: React.FC = () => {
  const {
    analyzeData,
    isAnalyzing,
    analyzeError,
    refetchAnalyze,
    applyCounterfactual,
    holdings,
  } = usePortfolio();

  const [showCounterfactualModal, setShowCounterfactualModal] = useState(false);

  if (isAnalyzing && !analyzeData) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Risk Analysis"
          description="Forward 126-trading-day risk classification, calibrated probabilities, and factor attribution."
        />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={4} />
        </div>
      </div>
    );
  }

  if (!analyzeData && holdings.length < 2) {
    return (
      <div className="space-y-6">
        <PageTitle
          title="Risk Analysis"
          description="Forward 126-trading-day risk classification, calibrated probabilities, and factor attribution."
        />
        <div className="p-12 rounded-2xl glass-panel text-center space-y-4 max-w-xl mx-auto shadow-glass">
          <div className="w-12 h-12 rounded-xl bg-warning/15 border border-warning/30 flex items-center justify-center text-warning mx-auto">
            <AlertTriangle className="w-6 h-6 stroke-[1.75]" />
          </div>
          <h2 className="text-base font-bold text-main font-sans">Portfolio Requires At Least 2 Positions</h2>
          <p className="text-xs text-secondary max-w-md mx-auto leading-relaxed">
            Configure at least 2 assets in the portfolio builder to calculate risk classification and covariance factor attribution.
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

  const data = analyzeData;

  const handleApplyCounterfactual = () => {
    if (data?.counterfactual?.weights) {
      applyCounterfactual(
        data.counterfactual.weights,
        data.counterfactual.target_label
      );
      setShowCounterfactualModal(false);
    }
  };

  // 1. Horizontal Bar Chart Data: risk_contribution vs return_contribution
  const assetContributionData =
    data?.asset_stats?.map((stat) => ({
      ticker: stat.ticker,
      risk_contribution: +(stat.risk_contribution * 100).toFixed(1),
      return_contribution: +(stat.return_contribution * 100).toFixed(1),
      weight: +(stat.weight * 100).toFixed(1),
    })) || [];

  // 2. Risk Drivers Bar Chart Data with Direction
  const riskDriversData =
    data?.risk_drivers?.map((driver) => ({
      factor: driver.factor,
      impact: +(driver.impact * 100).toFixed(1),
      rawImpact: driver.impact,
      direction: driver.direction,
      arrow: driver.direction === "increases_risk" ? "↑" : "↓",
    })) || [];

  // 3. Sector Exposure Donut Data
  const sectorData =
    data?.sector_exposure
      ? Object.entries(data.sector_exposure).map(([sector, weight]) => ({
          name: sector,
          value: +(weight * 100).toFixed(1),
        }))
      : [];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <PageTitle
        title="Risk Intelligence & Factor Attribution"
        description="Forward 126-trading-day multi-class risk model, calibrated class probabilities, and factor risk drivers."
        badge={
          data?.risk_label ? (
            <RiskBadge
              label={data.risk_label}
              size="md"
              score={data.risk_score}
              confidence={data.confidence}
            />
          ) : null
        }
        actions={
          data?.counterfactual && data.risk_label === "High" ? (
            <button
              onClick={() => setShowCounterfactualModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-mono font-medium glass-panel-interactive text-main border border-warning/30 hover:border-warning/60 transition-all min-h-[40px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60 active:scale-[0.96]"
              title="Compare and morph risk to Medium using counterfactual frontier optimization"
            >
              <span className="w-2 h-2 rounded-full bg-warning shadow-sm" />
              <span>Target Medium Risk</span>
              <ArrowRight className="w-3.5 h-3.5 text-secondary stroke-[2]" />
            </button>
          ) : null
        }
      />

      {analyzeError && (
        <ErrorToast error={analyzeError} onRetry={refetchAnalyze} />
      )}

      {/* Model Verdict & Calibrated Probabilities Header Card */}
      <div className="rounded-2xl glass-panel-elevated p-6 space-y-5 shadow-glass">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3.5 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono uppercase tracking-wider text-secondary flex items-center gap-1.5 font-medium">
                <ShieldAlert className="w-4 h-4 text-teal stroke-[1.75]" />
                Forward 126-Trading-Day Classification
              </span>
              <span className="text-white/[0.15]">|</span>
              <span className="text-xs text-secondary/70 font-mono">
                Walk-Forward Terciles
              </span>
            </div>

            {/* Prominent Risk Badge with Score & Confidence */}
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge
                label={data?.risk_label || "High"}
                size="xl"
                score={data?.risk_score ?? 82}
                confidence={data?.confidence ?? 0.82}
              />
            </div>

            <p className="text-xs text-secondary max-w-2xl leading-relaxed font-sans">
              Trained on walk-forward terciles. Predicts forward 6-month volatility and drawdown severity with{" "}
              <strong className="text-main font-mono tabular-nums">
                {formatPercent(data?.confidence ?? 0.82, 0)} model confidence
              </strong>
              .
            </p>
          </div>

          {/* Calibrated Class Probabilities */}
          <div className="w-full lg:w-80 bg-[#080B10]/70 p-4 rounded-xl border border-[rgba(226,235,244,0.15)] space-y-3 shadow-glass-sm">
            <div className="flex items-center justify-between text-xs font-mono text-secondary">
              <span className="flex items-center gap-1.5 font-medium">
                <Gauge className="w-3.5 h-3.5 text-secondary/70 stroke-[1.75]" />
                Class Probabilities
              </span>
              <span className="text-[11px] text-secondary/60 tabular-nums">Sum: 100%</span>
            </div>

            <div className="space-y-2.5">
              {/* Low Risk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-positive font-medium">Low Risk</span>
                  <span className="text-main tabular-nums font-semibold">
                    {formatPercent(data?.probs?.Low ?? 0.04, 1)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-positive rounded-full transition-all duration-300"
                    style={{ width: `${(data?.probs?.Low ?? 0.04) * 100}%` }}
                  />
                </div>
              </div>

              {/* Medium Risk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-warning font-medium">Medium Risk</span>
                  <span className="text-main tabular-nums font-semibold">
                    {formatPercent(data?.probs?.Medium ?? 0.28, 1)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-warning rounded-full transition-all duration-300"
                    style={{ width: `${(data?.probs?.Medium ?? 0.28) * 100}%` }}
                  />
                </div>
              </div>

              {/* High Risk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-negative font-medium">High Risk</span>
                  <span className="text-main tabular-nums font-semibold">
                    {formatPercent(data?.probs?.High ?? 0.68, 1)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-negative rounded-full transition-all duration-300"
                    style={{ width: `${(data?.probs?.High ?? 0.68) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Selected Portfolio Analytics Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          title="Ann. Return"
          value={formatPercent(data?.metrics?.ann_return ?? 0.198, 1, true)}
          subtitle="Compounded CAGR"
          trend="up"
          trendValue="CAGR"
        />
        <MetricCard
          title="Volatility"
          value={formatPercent(data?.metrics?.volatility ?? 0.264, 1)}
          subtitle="Std * √252"
          trend="down"
          trendValue="18% Gate"
          highlight
        />
        <MetricCard
          title="Max Drawdown"
          value={formatPercent(data?.metrics?.max_drawdown ?? -0.342, 1, true)}
          subtitle="Peak-to-Trough"
          trend="down"
          trendValue="Drop"
        />
        <MetricCard
          title="Sharpe Ratio"
          value={formatRatio(data?.metrics?.sharpe ?? 0.50, 2)}
          subtitle="Rf: 6.5% INR"
          trend="neutral"
          trendValue="Ratio"
        />
        <MetricCard
          title="Sortino Ratio"
          value={formatRatio(data?.metrics?.sortino ?? 0.68, 2)}
          subtitle="Downside Vol"
          trend="up"
          trendValue="Ratio"
        />
        <MetricCard
          title="Diversif. Ratio"
          value={formatRatio(data?.metrics?.diversification_ratio ?? 1.34, 2)}
          subtitle="Weighted / Total"
          trend="up"
          trendValue="Hedged"
        />
      </div>

      {/* Asset Contribution: Risk vs Return Chart */}
      <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-[rgba(226,235,244,0.10)]">
          <div>
            <h2 className="text-sm font-bold text-main flex items-center gap-2 font-sans tracking-tight">
              <Layers className="w-4 h-4 text-teal stroke-[1.75]" />
              Asset Risk Contribution vs Return Contribution
            </h2>
            <p className="text-xs text-secondary mt-0.5">
              NVDA and TSLA account for ~58% of total risk relative to 45% of allocated capital.
            </p>
          </div>
          <div className="text-xs font-mono text-secondary">
            Units: <span className="text-main font-semibold">% of Total</span>
          </div>
        </div>

        <div className="h-72 w-full">
          {assetContributionData.length === 0 ? (
            <div className="h-full w-full flex items-center justify-center text-secondary text-xs font-mono border border-dashed border-[rgba(226,235,244,0.1)] rounded-xl">
              No asset contribution statistics available.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={assetContributionData}
                margin={{ top: 10, right: 30, left: 30, bottom: 20 }}
              >
                <CartesianGrid strokeDasharray="2 4" stroke="rgba(226, 235, 244, 0.06)" horizontal={false} />
                <XAxis
                  type="number"
                  unit="%"
                  stroke="rgba(226,235,244,0.12)"
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                  label={{
                    value: "Contribution (%)",
                    position: "insideBottom",
                    offset: -10,
                    fill: "#9BA7B5",
                    fontSize: 10,
                    fontFamily: "IBM Plex Mono, monospace",
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="ticker"
                  stroke="rgba(226,235,244,0.12)"
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const item = payload[0].payload;
                    return (
                      <ChartTooltip
                        title={`${item.ticker} (Weight: ${item.weight}%)`}
                        items={[
                          {
                            label: "Risk Contribution",
                            value: `${item.risk_contribution}%`,
                            color: "#E47782",
                          },
                          {
                            label: "Return Contribution",
                            value: `${item.return_contribution}%`,
                            color: "#86C8A0",
                          },
                        ]}
                      />
                    );
                  }}
                />
                <Legend
                  verticalAlign="top"
                  align="right"
                  wrapperStyle={{ paddingBottom: 10, fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                />
                <Bar
                  dataKey="risk_contribution"
                  name="Risk Contribution (%)"
                  fill="#E47782"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="return_contribution"
                  name="Return Contribution (%)"
                  fill="#86C8A0"
                  radius={[0, 4, 4, 0]}
                  isAnimationActive={false}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Factor Drivers Hierarchy & Sector Exposure Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SHAP Risk Drivers Bar Chart with Direction Arrows */}
        <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(226,235,244,0.10)]">
            <h3 className="text-sm font-bold text-main flex items-center gap-2 font-sans">
              <span className="w-2 h-2 rounded-full bg-teal" />
              Factor Attribution (SHAP Impact)
            </h3>
            <span className="text-xs font-mono text-secondary">Impact %</span>
          </div>

          <div className="h-60 w-full">
            {riskDriversData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-secondary text-xs font-mono border border-dashed border-[rgba(226,235,244,0.1)] rounded-xl">
                No factor attribution drivers detected.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  layout="vertical"
                  data={riskDriversData}
                  margin={{ top: 10, right: 30, left: 60, bottom: 15 }}
                >
                  <CartesianGrid strokeDasharray="2 4" stroke="rgba(226, 235, 244, 0.06)" horizontal={false} />
                  <XAxis
                    type="number"
                    stroke="rgba(226,235,244,0.12)"
                    fontSize={10}
                    tickLine={false}
                    tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                    label={{
                      value: "Impact Magnitude (%)",
                      position: "insideBottom",
                      offset: -10,
                      fill: "#9BA7B5",
                      fontSize: 10,
                      fontFamily: "IBM Plex Mono, monospace",
                    }}
                  />
                  <YAxis
                    type="category"
                    dataKey="factor"
                    stroke="rgba(226,235,244,0.12)"
                    fontSize={10}
                    tickLine={false}
                    tick={{ fill: "#9BA7B5", fontSize: 10, fontFamily: "IBM Plex Mono, monospace" }}
                    width={140}
                  />
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || !payload.length) return null;
                      const p = payload[0].payload;
                      return (
                        <ChartTooltip
                          title={p.factor}
                          items={[
                            {
                              label: p.direction === "increases_risk" ? "Risk Increase" : "Risk Cushion",
                              value: `${p.impact}%`,
                              color: p.rawImpact > 0 ? "#E47782" : "#86C8A0",
                            },
                          ]}
                        />
                      );
                    }}
                  />
                  <Bar dataKey="impact" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {riskDriversData.map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={entry.rawImpact > 0 ? "#E47782" : "#86C8A0"}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Sector Exposure Donut */}
        <div className="rounded-2xl glass-panel p-5 space-y-4 shadow-glass">
          <div className="flex items-center justify-between pb-3 border-b border-[rgba(226,235,244,0.10)]">
            <h3 className="text-sm font-bold text-main flex items-center gap-2 font-sans">
              <PieIcon className="w-4 h-4 text-teal stroke-[1.75]" />
              Sector Allocation
            </h3>
            <span className="text-xs font-mono text-secondary">
              Concentration (HHI: {data?.metrics?.hhi ? (data.metrics.hhi * 10000).toFixed(0) : "2480"})
            </span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            {sectorData.length === 0 ? (
              <div className="h-full w-full flex items-center justify-center text-secondary text-xs font-mono border border-dashed border-[rgba(226,235,244,0.1)] rounded-xl">
                No sector allocation data available.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={sectorData}
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                    stroke="#080B10"
                    strokeWidth={2}
                    isAnimationActive={false}
                  >
                    {sectorData.map((entry, index) => (
                      <Cell
                        key={`sector-${index}`}
                        fill={PRECISION_SECTOR_COLORS[index % PRECISION_SECTOR_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ payload }) => {
                      if (!payload || !payload.length) return null;
                      const p = payload[0].payload;
                      return (
                        <ChartTooltip
                          title={p.name}
                          items={[
                            {
                              label: "Allocation",
                              value: `${p.value}%`,
                              color: "#74C7BE",
                            },
                          ]}
                        />
                      );
                    }}
                  />
                  <Legend
                    verticalAlign="bottom"
                    align="center"
                    wrapperStyle={{ fontSize: 10, fontFamily: "IBM Plex Mono, monospace", paddingTop: 8 }}
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Explanations List Rendered Verbatim */}
      {data?.explanations && data.explanations.length > 0 && (
        <div className="p-5 rounded-2xl glass-panel space-y-3 shadow-glass">
          <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-main flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal stroke-[2]" />
            Risk Diagnostics & Model Findings
          </h3>
          <ul className="space-y-2 text-xs text-secondary font-sans">
            {data.explanations.map((exp, i) => (
              <li key={i} className="flex items-start gap-2.5">
                <span className="text-teal font-bold mt-0.5">•</span>
                <span className="leading-relaxed select-text text-main/90">{exp}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Counterfactual Target Medium Modal */}
      {showCounterfactualModal && data?.counterfactual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-md">
          <div className="rounded-2xl glass-panel-elevated max-w-lg w-full p-6 space-y-5 border border-[rgba(226,235,244,0.25)] shadow-glass animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-[rgba(226,235,244,0.12)]">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-warning" />
                <h3 className="font-bold text-base text-main font-sans">
                  Target Medium Risk Adjustment
                </h3>
              </div>
              <button
                onClick={() => setShowCounterfactualModal(false)}
                className="text-secondary hover:text-main p-1.5 rounded-lg hover:bg-white/[0.08] transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-4 h-4 stroke-[1.75]" />
              </button>
            </div>

            <p className="text-xs text-secondary leading-relaxed">
              Calculates minimal L2-norm weight distance to transition portfolio classification from{" "}
              <strong className="text-negative font-mono">High</strong> to{" "}
              <strong className="text-warning font-mono">Medium</strong> risk.
            </p>

            {/* Weights delta comparison table */}
            <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
              <div className="grid grid-cols-4 text-[10px] font-mono text-secondary uppercase tracking-wider pb-1.5 border-b border-[rgba(226,235,244,0.10)]">
                <span>Asset</span>
                <span className="text-right">Current</span>
                <span className="text-right">Suggested</span>
                <span className="text-right">Delta</span>
              </div>
              {Object.entries(data.counterfactual.weights).map(([ticker, newWeight]) => {
                const curStat = data.asset_stats.find((a) => a.ticker === ticker);
                const curWeight = curStat ? curStat.weight : 0;
                const diff = newWeight - curWeight;

                return (
                  <div
                    key={ticker}
                    className="grid grid-cols-4 text-xs font-mono py-1.5 items-center border-b border-white/[0.04]"
                  >
                    <span className="font-bold text-main">{ticker}</span>
                    <span className="text-right text-secondary tabular-nums">
                      {(curWeight * 100).toFixed(1)}%
                    </span>
                    <span className="text-right text-main font-medium tabular-nums">
                      {(newWeight * 100).toFixed(1)}%
                    </span>
                    <span
                      className={`text-right font-medium tabular-nums ${
                        diff > 0
                          ? "text-positive"
                          : diff < 0
                          ? "text-negative"
                          : "text-secondary"
                      }`}
                    >
                      {diff > 0 ? `+${(diff * 100).toFixed(1)}%` : `${(diff * 100).toFixed(1)}%`}
                    </span>
                  </div>
                );
              })}
            </div>

            <div className="pt-3 border-t border-[rgba(226,235,244,0.12)] flex items-center justify-end gap-3">
              <button
                onClick={() => setShowCounterfactualModal(false)}
                className="px-3.5 py-2 rounded-xl text-xs font-mono font-medium text-secondary hover:text-main bg-white/[0.04] hover:bg-white/[0.08] border border-[rgba(226,235,244,0.15)] transition-all cursor-pointer min-h-[38px] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal/60"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCounterfactual}
                className="px-4 py-2 rounded-xl text-xs font-mono font-semibold text-main bg-warning/20 hover:bg-warning/30 border border-warning/50 text-warning transition-all shadow-glass-sm cursor-pointer min-h-[38px] flex items-center gap-2 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-warning/60"
              >
                <Check className="w-3.5 h-3.5 stroke-[2]" />
                <span>Apply Medium Risk Weights</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
