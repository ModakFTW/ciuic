import React from "react";
import { ShieldCheck } from "lucide-react";

interface DisclaimerProps {
  className?: string;
}

export const Disclaimer: React.FC<DisclaimerProps> = ({ className = "" }) => {
  return (
    <footer
      className={`mt-14 pt-6 pb-10 border-t border-[rgba(226,235,244,0.12)] text-xs text-secondary flex flex-col md:flex-row items-center justify-between gap-4 ${className}`}
    >
      <div className="flex items-center gap-2.5 text-main">
        <div className="w-5 h-5 rounded-md bg-teal/15 border border-teal/30 flex items-center justify-center text-teal">
          <ShieldCheck className="w-3.5 h-3.5 stroke-[2]" />
        </div>
        <span className="font-semibold text-main tracking-tight">RiskScope</span>
        <span className="text-white/[0.15]">|</span>
        <span className="text-secondary/80 font-mono text-[11px]">Precision Financial Terminal</span>
      </div>

      <div className="text-center md:text-right max-w-2xl leading-relaxed text-secondary/80 font-mono text-[11px]">
        Educational simulation. Not financial advice. Past performance does not predict future results. The Drawdown Shield is a simulated strategy, not an insurance policy.
      </div>
    </footer>
  );
};

