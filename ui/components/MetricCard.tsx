'use client';

interface MetricCardProps {
  label: string;
  value: number | string;
  subLabel?: string;
  limit?: number | string;
  isLive?: boolean;
  trend?: 'up' | 'down' | 'neutral';
  unit?: string;
}

export default function MetricCard({
  label,
  value,
  subLabel,
  limit,
  isLive = false,
  trend,
  unit,
}: MetricCardProps) {
  const formatValue = (val: number | string): string => {
    if (typeof val === 'string') return val;
    if (val >= 1000000) return `${(val / 1000000).toFixed(1)}M`;
    if (val >= 1000) return `${(val / 1000).toFixed(1)}K`;
    return val.toLocaleString();
  };

  const getTrendIcon = () => {
    if (!trend) return null;
    
    if (trend === 'up') {
      return (
        <svg className="w-4 h-4 text-status-success" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 10l7-7m0 0l7 7m-7-7v18" />
        </svg>
      );
    }
    
    if (trend === 'down') {
      return (
        <svg className="w-4 h-4 text-status-error" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
        </svg>
      );
    }
    
    return (
      <svg className="w-4 h-4 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 12h14" />
      </svg>
    );
  };

  return (
    <div className="bg-panel rounded-card p-4 px-5 border border-border">
      {/* Header with label and LIVE badge */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-label uppercase text-text-muted">{label}</span>
          {subLabel && (
            <span className="text-small text-text-muted">{subLabel}</span>
          )}
        </div>
        {isLive && (
          <span className="live-badge flex items-center gap-1.5 px-2 py-0.5 rounded-badge bg-live-bg border border-live-border">
            <span className="w-1.5 h-1.5 bg-live rounded-full shadow-live-glow animate-pulse-live" />
            <span className="text-live text-small uppercase font-medium">LIVE</span>
          </span>
        )}
      </div>
      
      {/* Main value */}
      <div className="flex items-baseline gap-2">
        <span className="text-metric text-text-primary">
          {formatValue(value)}
        </span>
        {unit && <span className="text-body text-text-muted">{unit}</span>}
        {trend && <span className="ml-1">{getTrendIcon()}</span>}
      </div>
      
      {/* Limit bar */}
      {limit !== undefined && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-label uppercase text-text-muted">
              LIMIT: {formatValue(limit)}
            </span>
          </div>
          <div className="h-1 bg-border rounded-full overflow-hidden">
            <div
              className="h-full bg-accent rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(
                  (typeof value === 'number' && typeof limit === 'number'
                    ? (value / limit) * 100
                    : 0),
                  100
                )}%`,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Export utility functions for testing
export function transformLabel(label: string): string {
  return label.toUpperCase();
}

export function shouldShowLiveBadge(isLive?: boolean): boolean {
  return isLive === true;
}

export function shouldShowLimit(limit?: number | string): boolean {
  return limit !== undefined;
}
