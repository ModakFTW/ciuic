import React from "react";
import { ShieldCheck } from "lucide-react";

interface DisclaimerProps {
  className?: string;
}

export const Disclaimer: React.FC<DisclaimerProps> = ({ className = "" }) => {
  return (
    <footer
      className={`mt-12 pt-6 pb-8 border-t border-border text-xs text-text-muted flex flex-col md:flex-row items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-center gap-2 text-text-secondary">
        <ShieldCheck className="w-4 h-4 text-accent flex-shrink-0" strokeWidth={1.75} />
        <span className="font-semibold text-text-primary">RiskScope</span>
        <span className="text-border">|</span>
        <span className="text-text-muted">Portfolio Risk Engine</span>
      </div>

      <div className="text-center md:text-right max-w-2xl leading-relaxed text-text-muted font-mono text-[11px]">
        Educational simulation. Not financial advice. Past performance does not predict future results. The Drawdown Shield is a simulated strategy, not an insurance policy.
      </div>
    </footer>
  );
};
