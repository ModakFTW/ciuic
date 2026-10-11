import React from "react";
import { AlertCircle, X, RefreshCw } from "lucide-react";

interface ErrorToastProps {
  error: Error | string | null;
  onDismiss?: () => void;
  onRetry?: () => void;
  className?: string;
}

export const ErrorToast: React.FC<ErrorToastProps> = ({
  error,
  onDismiss,
  onRetry,
  className = "",
}) => {
  if (!error) return null;

  // Verbatim error message extraction
  const message = typeof error === "string" ? error : error.message || "An unexpected error occurred.";

  return (
    <div
      role="alert"
      className={`flex items-start justify-between gap-3 p-4 rounded-lg border border-negative/30 bg-negative/10 backdrop-blur-md text-main shadow-glass-sm shadow-[inset_0_1px_0_0_rgba(255,255,255,0.08)] ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="p-1 rounded-sm bg-negative/20 text-negative mt-0.5 flex-shrink-0">
          <AlertCircle className="w-4 h-4 stroke-[2]" />
        </div>
        <div className="space-y-1">
          <p className="text-[11px] font-mono font-semibold uppercase tracking-wider text-negative">
            Connection Error
          </p>
          <p className="text-xs font-mono text-secondary break-words select-text">
            {message}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 inline-flex items-center gap-1.5 text-xs font-mono font-medium text-main hover:text-white px-2.5 py-1 rounded-md bg-white/[0.06] hover:bg-white/[0.12] border border-[rgba(226,235,244,0.18)] transition-colors duration-150 min-h-[32px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal"
            >
              <RefreshCw className="w-3 h-3 text-secondary" />
              <span>Retry Request</span>
            </button>
          )}
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-secondary hover:text-main p-1.5 rounded-md hover:bg-white/[0.06] transition-colors duration-150 min-h-[32px] min-w-[32px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-teal"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4 stroke-[1.75]" />
        </button>
      )}
    </div>
  );
};

