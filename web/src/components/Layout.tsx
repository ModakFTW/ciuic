import React from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import {
  Sliders,
  ShieldAlert,
  Sparkles,
  LineChart,
  Activity,
  Layers,
  Flame,
  ShieldCheck,
  User,
} from "lucide-react";
import { usePortfolio } from "../state/PortfolioContext";
import { DataBadge } from "./DataBadge";
import { Disclaimer } from "./Disclaimer";
import { RiskBadge } from "./RiskBadge";
import { formatCurrency } from "../utils/format";

const NAV_ITEMS = [
  { path: "/", label: "Build", icon: Sliders, badge: "R1" },
  { path: "/risk", label: "Risk", icon: ShieldAlert, badge: "R2" },
  { path: "/recommend", label: "Recommend", icon: Sparkles, badge: "R3" },
  { path: "/simulate", label: "Simulate", icon: LineChart, badge: "R4" },
  { path: "/track", label: "Track", icon: Activity, badge: "R5" },
  { path: "/strategies", label: "Strategies", icon: Layers, badge: "R6" },
  { path: "/stress", label: "Stress", icon: Flame, badge: "B3" },
];

export const Layout: React.FC = () => {
  const { meta, analyzeData, amount, currency, loadDemoPortfolio } = usePortfolio();
  const location = useLocation();

  return (
    <div className="min-h-screen flex bg-canvas text-text-primary font-sans antialiased">
      {/* Sidebar Navigation */}
      <aside className="w-56 lg:w-60 border-r border-border bg-surface flex flex-col justify-between flex-shrink-0 sticky top-0 h-screen z-30">
        <div>
          {/* Logo & Terminal Brand */}
          <div className="px-5 py-4 border-b border-border flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-accent flex items-center justify-center text-white shadow-sm">
                <ShieldCheck className="w-4 h-4" strokeWidth={2} />
              </div>
              <div>
                <span className="font-semibold text-sm tracking-tight text-text-primary flex items-center gap-1">
                  Risk<span className="text-accent-light">Scope</span>
                </span>
                <span className="text-[10px] text-text-muted font-mono block">
                  Terminal v1.2
                </span>
              </div>
            </div>
          </div>

          {/* Nav List */}
          <nav className="p-2 space-y-1">
            <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-text-muted">
              Workspace
            </div>
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive =
                item.path === "/"
                  ? location.pathname === "/"
                  : location.pathname.startsWith(item.path);

              return (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={`flex items-center justify-between px-3 py-2 rounded-md text-xs font-medium transition-colors min-h-[40px] ${
                    isActive
                      ? "bg-accent-subtle text-accent-light border border-accent-border font-medium shadow-sm"
                      : "text-text-secondary hover:text-text-primary hover:bg-surface-hover"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 ${
                        isActive ? "text-accent-light" : "text-text-muted"
                      }`}
                      strokeWidth={1.75}
                    />
                    <span>{item.label}</span>
                  </div>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${
                      isActive
                        ? "bg-accent/20 text-accent-light border border-accent-border/50"
                        : "bg-surface-elevated text-text-muted border border-border-subtle"
                    }`}
                  >
                    {item.badge}
                  </span>
                </NavLink>
              );
            })}
          </nav>
        </div>

        {/* User Persona & Demo State Footer in Sidebar */}
        <div className="p-3 border-t border-border bg-surface-elevated">
          <div className="flex items-center justify-between gap-2 mb-2.5">
            <div className="flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-surface-hover border border-border flex items-center justify-center text-text-secondary">
                <User className="w-3.5 h-3.5" strokeWidth={1.75} />
              </div>
              <div className="text-xs">
                <div className="font-medium text-text-primary">Aman (Demo)</div>
                <div className="text-[10px] text-text-muted">Tech-Heavy</div>
              </div>
            </div>
            {analyzeData?.risk_label && (
              <RiskBadge label={analyzeData.risk_label} size="sm" showIcon={false} />
            )}
          </div>
          <button
            onClick={loadDemoPortfolio}
            className="w-full text-center text-xs font-mono text-text-secondary hover:text-text-primary py-2 rounded-md bg-surface hover:bg-surface-hover border border-border transition-colors cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent active:scale-[0.98]"
          >
            Reset Demo Portfolio
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header */}
        <header className="h-14 border-b border-border bg-surface/90 backdrop-blur-sm px-4 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-3 sm:gap-4">
            <span className="text-xs font-mono text-text-muted flex items-center gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-accent" />
              <span>Capital:</span>
              <strong className="text-text-primary font-semibold tabular-nums">
                {formatCurrency(amount, currency)}
              </strong>
            </span>
            <span className="text-border">|</span>
            {analyzeData?.risk_label && (
              <RiskBadge label={analyzeData.risk_label} size="sm" />
            )}
          </div>

          <div className="flex items-center gap-3">
            <DataBadge meta={meta} />
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto w-full">
          <Outlet />
          <Disclaimer />
        </main>
      </div>
    </div>
  );
};
