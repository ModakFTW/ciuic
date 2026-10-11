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
  HelpCircle,
  TrendingDown,
  TrendingUp,
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
import { formatPercent, formatRatio } from "../utils/format";

const SECTOR_COLORS = ["#2563EB", "#FBBF24", "#34D399", "#8B5CF6", "#06B6D4", "#64748B"];

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
          description="Forward 126-trading-day risk classification and factor attribution."
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
          description="Forward 126-trading-day risk classification and factor attribution."
        />
        <div className="p-12 rounded-lg border border-border bg-surface text-center space-y-4">
          <AlertTriangle className="w-8 h-8 text-risk-med mx-auto" strokeWidth={1.75} />
          <h2 className="text-base font-semibold text-text-primary">Portfolio Requires At Least 2 Assets</h2>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Configure at least 2 assets to calculate risk classification and covariance attribution.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-md bg-accent hover:bg-accent-hover text-white font-medium text-xs transition-colors min-h-[40px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          >
            <span>Return to Portfolio Builder</span>
            <ArrowRight className="w-3.5 h-3.5" strokeWidth={1.75} />
          </Link>
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

  // 2. Risk Drivers Bar Chart Data with Direction Arrows
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
    <div className="space-y-6">
      <PageTitle
        title="Risk Analysis"
        description="Forward 126-trading-day risk classification, calibrated probabilities, and factor attribution."
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
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md text-xs font-medium bg-surface-elevated hover:bg-surface-hover text-text-primary border border-border transition-colors min-h-[40px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98]"
              title="Compare and morph risk to Medium using counterfactual frontier optimization"
            >
              <span className="w-2 h-2 rounded-full bg-risk-med" />
              <span>Target Medium Risk</span>
              <ArrowRight className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
            </button>
          ) : null
        }
      />

      {analyzeError && (
        <ErrorToast error={analyzeError} onRetry={refetchAnalyze} />
      )}

      {/* Model Verdict Card */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm">
        <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-text-secondary flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-accent-light" strokeWidth={1.75} />
                Forward 126-Day Model Verdict
              </span>
              <span className="text-border">|</span>
              <span className="text-xs text-text-muted font-mono">
                Walk-Forward Terciles
              </span>
            </div>

            {/* Big RiskBadge with risk_score and confidence */}
            <div className="flex flex-wrap items-center gap-3">
              <RiskBadge
                label={data?.risk_label || "High"}
                size="lg"
                score={data?.risk_score ?? 82}
                confidence={data?.confidence ?? 0.82}
              />
            </div>

            <p className="text-xs text-text-secondary max-w-2xl leading-relaxed">
              Trained on walk-forward terciles. Predicts forward 6-month volatility and drawdown severity with{" "}
              <strong className="text-text-primary font-mono tabular-nums">
                {formatPercent(data?.confidence ?? 0.82, 0)} confidence
              </strong>
              .
            </p>
          </div>

          {/* Calibrated Class Probabilities */}
          <div className="w-full lg:w-80 bg-surface-elevated p-4 rounded-md border border-border space-y-3">
            <div className="flex items-center justify-between text-xs font-medium text-text-secondary">
              <span className="flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-text-muted" strokeWidth={1.75} />
                Class Probabilities
              </span>
              <span className="font-mono text-text-muted tabular-nums">Sum: 100%</span>
            </div>

            <div className="space-y-2.5">
              {/* Low Risk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-risk-low font-medium">Low Risk</span>
                  <span className="text-text-primary tabular-nums">
                    {formatPercent(data?.probs?.Low ?? 0.04, 1)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-hover rounded overflow-hidden">
                  <div
                    className="h-full bg-risk-low rounded transition-all duration-300"
                    style={{ width: `${(data?.probs?.Low ?? 0.04) * 100}%` }}
                  />
                </div>
              </div>

              {/* Medium Risk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-risk-med font-medium">Medium Risk</span>
                  <span className="text-text-primary tabular-nums">
                    {formatPercent(data?.probs?.Medium ?? 0.28, 1)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-hover rounded overflow-hidden">
                  <div
                    className="h-full bg-risk-med rounded transition-all duration-300"
                    style={{ width: `${(data?.probs?.Medium ?? 0.28) * 100}%` }}
                  />
                </div>
              </div>

              {/* High Risk */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-risk-high font-medium">High Risk</span>
                  <span className="text-text-primary tabular-nums">
                    {formatPercent(data?.probs?.High ?? 0.68, 1)}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-surface-hover rounded overflow-hidden">
                  <div
                    className="h-full bg-risk-high rounded transition-all duration-300"
                    style={{ width: `${(data?.probs?.High ?? 0.68) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Metric Cards Row: ann_return, volatility, max_drawdown, sharpe, sortino, diversification_ratio */}
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

      {/* Horizontal Bar Chart: Risk Contribution vs Return Contribution */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <Layers className="w-4 h-4 text-accent-light" strokeWidth={1.75} />
              Asset Contribution: Risk vs Return
            </h2>
            <p className="text-xs text-text-secondary mt-0.5">
              NVDA and TSLA account for ~58% of total risk relative to 45% of allocated capital.
            </p>
          </div>
          <div className="text-xs font-mono text-text-muted">
            Units: <span className="text-text-primary font-medium">% of Total</span>
          </div>
        </div>

        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              layout="vertical"
              data={assetContributionData}
              margin={{ top: 10, right: 30, left: 30, bottom: 20 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#22252B" horizontal={false} />
              <XAxis
                type="number"
                unit="%"
                stroke="#5A6072"
                fontSize={11}
                label={{
                  value: "Contribution (%)",
                  position: "insideBottom",
                  offset: -10,
                  fill: "#8B93A7",
                  fontSize: 11,
                }}
              />
              <YAxis
                type="category"
                dataKey="ticker"
                stroke="#5A6072"
                fontSize={11}
                tickLine={false}
              />
              <Tooltip
                content={({ payload }) => {
                  if (!payload || !payload.length) return null;
                  const item = payload[0].payload;
                  return (
                    <div className="bg-surface border border-border p-2.5 rounded text-xs font-mono shadow-sm space-y-1">
                      <div className="font-semibold text-text-primary border-b border-border pb-1">
                        {item.ticker} (Weight: {item.weight}%)
                      </div>
                      <div className="text-risk-high">
                        Risk Contribution: {item.risk_contribution}%
                      </div>
                      <div className="text-risk-low">
                        Return Contribution: {item.return_contribution}%
                      </div>
                    </div>
                  );
                }}
              />
              <Legend
                verticalAlign="top"
                align="right"
                wrapperStyle={{ paddingBottom: 10, fontSize: 11 }}
              />
              <Bar
                dataKey="risk_contribution"
                name="Risk Contribution (%)"
                fill="#F87171"
                radius={[0, 3, 3, 0]}
              />
              <Bar
                dataKey="return_contribution"
                name="Return Contribution (%)"
                fill="#34D399"
                radius={[0, 3, 3, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* SHAP Drivers Bar Chart & Sector Exposure Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* SHAP Risk Drivers Bar Chart with Direction Arrows */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-accent" />
              Factor Attribution (SHAP Impact)
            </h3>
            <span className="text-xs font-mono text-text-muted">Magnitude</span>
          </div>

          <div className="h-60 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={riskDriversData}
                margin={{ top: 10, right: 30, left: 60, bottom: 15 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#22252B" horizontal={false} />
                <XAxis
                  type="number"
                  stroke="#5A6072"
                  fontSize={11}
                  label={{
                    value: "Impact Magnitude (%)",
                    position: "insideBottom",
                    offset: -10,
                    fill: "#8B93A7",
                    fontSize: 11,
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="factor"
                  stroke="#5A6072"
                  fontSize={10}
                  tickLine={false}
                  width={140}
                />
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-surface border border-border p-2.5 rounded text-xs font-mono shadow-sm space-y-1">
                        <div className="font-semibold text-text-primary">{p.factor}</div>
                        <div className={p.rawImpact > 0 ? "text-risk-high" : "text-risk-low"}>
                          {p.direction === "increases_risk"
                            ? "↑ Increases Risk"
                            : "↓ Dampens Risk"}
                          : {p.rawImpact > 0 ? `+${p.impact}` : p.impact}%
                        </div>
                      </div>
                    );
                  }}
                />
                <Bar dataKey="impact" name="Impact (%)" radius={[0, 3, 3, 0]}>
                  {riskDriversData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.rawImpact >= 0 ? "#F87171" : "#34D399"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Directional Summary Chips */}
          <div className="space-y-1.5 pt-2 border-t border-border">
            {riskDriversData.map((d, i) => (
              <div
                key={i}
                className="flex items-center justify-between text-xs p-2 rounded-md bg-surface-elevated border border-border"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`font-mono font-bold text-xs ${
                      d.direction === "increases_risk" ? "text-risk-high" : "text-risk-low"
                    }`}
                  >
                    {d.arrow}
                  </span>
                  <span className="text-text-secondary">{d.factor}</span>
                </div>
                <span
                  className={`font-mono text-xs px-1.5 py-0.5 rounded ${
                    d.direction === "increases_risk"
                      ? "text-risk-high bg-risk-high-subtle border border-risk-high-border"
                      : "text-risk-low bg-risk-low-subtle border border-risk-low-border"
                  }`}
                >
                  {d.rawImpact > 0 ? `+${d.impact}%` : `${d.impact}%`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sector Exposure Donut */}
        <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
              <PieIcon className="w-4 h-4 text-accent-light" strokeWidth={1.75} />
              Sector Exposure
            </h3>
            <span className="text-xs font-mono text-text-muted">% of Portfolio</span>
          </div>

          <div className="h-60 w-full flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={sectorData}
                  innerRadius={55}
                  outerRadius={80}
                  paddingAngle={3}
                  dataKey="value"
                >
                  {sectorData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={SECTOR_COLORS[index % SECTOR_COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip
                  content={({ payload }) => {
                    if (!payload || !payload.length) return null;
                    const p = payload[0].payload;
                    return (
                      <div className="bg-surface border border-border p-2 rounded text-xs font-mono shadow-sm">
                        <span className="text-text-muted">{p.name}: </span>
                        <span className="text-text-primary font-medium">{p.value}%</span>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-2 border-t border-border">
            {sectorData.map((item, idx) => (
              <div key={item.name} className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: SECTOR_COLORS[idx % SECTOR_COLORS.length] }}
                />
                <span className="text-text-secondary truncate">{item.name}</span>
                <span className="text-text-primary ml-auto tabular-nums">{item.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* "Why is this risky?" List Rendering explanations[] verbatim */}
      <div className="rounded-lg border border-border bg-surface p-5 space-y-4 shadow-sm">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-4 h-4 text-text-muted" strokeWidth={1.75} />
          <h2 className="text-sm font-semibold text-text-primary">
            Why is this portfolio labeled {data?.risk_label || "High"} Risk?
          </h2>
        </div>

        <div className="space-y-2">
          {data?.explanations && data.explanations.length > 0 ? (
            data.explanations.map((explanation, index) => (
              <div
                key={index}
                className="flex items-start gap-3 p-3 rounded-md border border-border bg-surface-elevated hover:bg-surface-hover transition-colors"
              >
                <span className="w-5 h-5 rounded bg-risk-high-subtle text-risk-high border border-risk-high-border flex items-center justify-center font-mono font-medium text-xs flex-shrink-0 mt-0.5">
                  {index + 1}
                </span>
                <p className="text-xs text-text-secondary leading-relaxed select-text font-mono">
                  {explanation}
                </p>
              </div>
            ))
          ) : (
            <p className="text-xs text-text-muted italic">No explanations available.</p>
          )}
        </div>
      </div>

      {/* Make it Medium Counterfactual Modal */}
      {showCounterfactualModal && data?.counterfactual && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-canvas/80 backdrop-blur-sm">
          <div className="bg-surface border border-border rounded-lg max-w-xl w-full p-5 shadow-xl space-y-5">
            <div className="flex items-start justify-between gap-4 border-b border-border pb-3">
              <div className="space-y-1">
                <h3 className="text-sm font-semibold text-text-primary">
                  Counterfactual Optimization: Target Medium Risk
                </h3>
                <p className="text-xs text-text-muted">
                  Minimum L1 distance shift from current allocation to target frontier candidates.
                </p>
              </div>
              <button
                onClick={() => setShowCounterfactualModal(false)}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-surface-hover transition-colors min-h-[32px] min-w-[32px] flex items-center justify-center"
                aria-label="Close modal"
              >
                <X className="w-4 h-4" strokeWidth={1.75} />
              </button>
            </div>

            {/* Target vs Current Label */}
            <div className="p-3.5 rounded-md bg-surface-elevated border border-border flex items-center justify-between">
              <div>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Current Risk</span>
                <RiskBadge label={data.risk_label} size="sm" />
              </div>

              <ArrowRight className="w-4 h-4 text-text-muted" strokeWidth={1.75} />

              <div>
                <span className="text-[10px] text-text-muted uppercase tracking-wider block mb-1">Target Risk</span>
                <RiskBadge label={data.counterfactual.predicted_label} size="sm" />
              </div>
            </div>

            {/* Weights Comparison Table */}
            <div className="space-y-2">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-text-muted">
                Allocation Shift
              </h4>
              <div className="divide-y divide-border border border-border rounded-md overflow-hidden text-xs font-mono">
                <div className="p-2.5 bg-surface-elevated grid grid-cols-4 font-medium text-text-muted">
                  <span>Ticker</span>
                  <span className="text-right">Current</span>
                  <span className="text-right">Target</span>
                  <span className="text-right">Delta</span>
                </div>
                {Object.entries(data.counterfactual.weights).map(([ticker, newWeight]) => {
                  const currentAsset = data.asset_stats.find((a) => a.ticker === ticker);
                  const currentWeight = currentAsset ? currentAsset.weight : 0;
                  const diff = newWeight - currentWeight;

                  return (
                    <div
                      key={ticker}
                      className="p-2.5 bg-surface grid grid-cols-4 items-center hover:bg-surface-hover"
                    >
                      <span className="font-medium text-text-primary">{ticker}</span>
                      <span className="text-right text-text-secondary tabular-nums">
                        {(currentWeight * 100).toFixed(1)}%
                      </span>
                      <span className="text-right text-text-primary font-medium tabular-nums">
                        {(newWeight * 100).toFixed(1)}%
                      </span>
                      <span
                        className={`text-right font-medium tabular-nums ${
                          diff > 0
                            ? "text-risk-low"
                            : diff < 0
                            ? "text-risk-high"
                            : "text-text-muted"
                        }`}
                      >
                        {diff > 0 ? `+${(diff * 100).toFixed(1)}%` : `${(diff * 100).toFixed(1)}%`}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Modal Actions */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setShowCounterfactualModal(false)}
                className="px-3 py-2 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-surface-hover transition-colors min-h-[40px] cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleApplyCounterfactual}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-xs font-medium bg-accent hover:bg-accent-hover text-white transition-colors min-h-[40px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98]"
              >
                <Check className="w-3.5 h-3.5" strokeWidth={1.75} />
                <span>Apply Target Allocation</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
