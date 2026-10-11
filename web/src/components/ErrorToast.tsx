import React from "react";
import { AlertCircle, X } from "lucide-react";

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
      className={`flex items-start justify-between gap-3 p-4 rounded-lg border border-risk-high-border bg-surface-elevated text-text-primary shadow-sm ${className}`}
    >
      <div className="flex items-start gap-3">
        <AlertCircle className="w-5 h-5 text-risk-high mt-0.5 flex-shrink-0" strokeWidth={1.75} />
        <div className="space-y-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-risk-high">
            Error
          </p>
          <p className="text-xs font-mono text-text-secondary break-words select-text">
            {message}
          </p>
          {onRetry && (
            <button
              onClick={onRetry}
              className="mt-2 inline-flex items-center text-xs font-medium text-text-primary hover:text-white underline underline-offset-2 transition-colors min-h-[36px] cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
            >
              Retry request
            </button>
          )}
        </div>
      </div>

      {onDismiss && (
        <button
          onClick={onDismiss}
          className="text-text-muted hover:text-text-primary p-2 rounded-md hover:bg-surface-hover transition-colors min-h-[40px] min-w-[40px] flex items-center justify-center cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-accent"
          title="Dismiss notification"
          aria-label="Dismiss notification"
        >
          <X className="w-4 h-4" strokeWidth={1.75} />
        </button>
      )}
    </div>
  );
};
