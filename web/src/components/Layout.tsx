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
    <div className="min-h-screen flex bg-app text-main font-sans antialiased selection:bg-teal-subtle selection:text-white">
      {/* Sidebar Navigation */}
      <aside className="w-14 md:w-56 lg:w-60 border-r border-[rgba(226,235,244,0.15)] bg-sidebar flex flex-col justify-between flex-shrink-0 sticky top-0 h-screen z-30 transition-[width] duration-150 ease-out">
        <div>
          {/* Logo & Terminal Brand */}
          <div className="px-3 md:px-5 py-4 border-b border-[rgba(226,235,244,0.12)] flex items-center justify-center md:justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-md bg-teal/15 border border-teal/30 flex items-center justify-center text-teal shadow-glass-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.15)] flex-shrink-0">
                <ShieldCheck className="w-4 h-4 stroke-[2]" />
              </div>
              <div className="hidden md:block">
                <span className="font-semibold text-sm tracking-tight text-main flex items-center gap-1">
                  Risk<span className="text-teal">Scope</span>
                </span>
                <span className="text-[10px] text-secondary font-mono tracking-wider block">
                  TERMINAL v1.2
                </span>
              </div>
            </div>
          </div>

          {/* Nav List */}
          <nav className="p-1.5 md:p-2.5 space-y-1">
            <div className="hidden md:block px-3 py-1.5 text-[10px] font-mono uppercase tracking-wider text-secondary/70">
              Workspace Modules
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
                  title={item.label}
                  className={`flex items-center justify-center md:justify-between px-2.5 md:px-3 py-2 rounded-md text-xs font-medium transition-colors duration-150 min-h-[40px] ${
                    isActive
                      ? "bg-white/[0.06] text-main border border-[rgba(226,235,244,0.30)] shadow-glass-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.12)] font-semibold"
                      : "text-secondary hover:text-main hover:bg-white/[0.03] border border-transparent"
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <Icon
                      className={`w-4 h-4 flex-shrink-0 ${
                        isActive ? "text-teal" : "text-secondary"
                      }`}
                      strokeWidth={1.75}
                    />
                    <span className="hidden md:inline">{item.label}</span>
                  </div>
                  <span
                    className={`hidden md:inline-block text-[10px] font-mono px-1.5 py-0.5 rounded-sm ${
                      isActive
                        ? "bg-teal/15 text-teal border border-teal/30"
                        : "bg-white/[0.04] text-secondary/70 border border-white/[0.06]"
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
        <div className="p-2 md:p-3 border-t border-[rgba(226,235,244,0.12)] bg-[#0A0E15]">
          <div className="flex items-center justify-center md:justify-between gap-2 mb-0 md:mb-2.5">
            <div className="flex items-center gap-2" title="Aman (Demo) Tech-Heavy">
              <div className="w-6 h-6 rounded-md bg-white/[0.05] border border-white/[0.10] flex items-center justify-center text-secondary flex-shrink-0">
                <User className="w-3.5 h-3.5" strokeWidth={1.75} />
              </div>
              <div className="text-xs hidden md:block">
                <div className="font-medium text-main">Aman (Demo)</div>
                <div className="text-[10px] text-secondary font-mono">Tech-Heavy</div>
              </div>
            </div>
            {analyzeData?.risk_label && (
              <div className="hidden md:block">
                <RiskBadge label={analyzeData.risk_label} size="sm" showIcon={false} />
              </div>
            )}
          </div>
          <button
            onClick={loadDemoPortfolio}
            title="Reset Demo Portfolio"
            className="hidden md:block w-full text-center text-xs font-mono text-secondary hover:text-main py-2 rounded-md bg-white/[0.035] hover:bg-white/[0.065] border border-[rgba(226,235,244,0.15)] hover:border-[rgba(226,235,244,0.28)] transition-colors duration-150 cursor-pointer min-h-[36px] focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal active:scale-[0.98]"
          >
            Reset Demo Portfolio
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Header - Opaque charcoal surface with thin border */}
        <header className="h-14 border-b border-[rgba(226,235,244,0.15)] bg-[#0C1118] px-3 sm:px-6 lg:px-8 flex items-center justify-between sticky top-0 z-20 gap-2">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <span className="text-xs font-mono text-secondary flex items-center gap-1.5 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-teal flex-shrink-0" />
              <span className="hidden sm:inline">Capital:</span>
              <strong className="text-main font-semibold tabular-nums">
                {formatCurrency(amount, currency)}
              </strong>
            </span>
            <span className="text-white/[0.15] hidden xs:inline">|</span>
            {analyzeData?.risk_label && (
              <div className="flex-shrink-0">
                <RiskBadge label={analyzeData.risk_label} size="sm" />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
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

