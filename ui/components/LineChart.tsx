'use client';

import { useMemo, useState } from 'react';

export interface DataPoint {
  timestamp: Date | string | number;
  value: number;
  label?: string;
}

export interface LineChartSeries {
  name: string;
  data: DataPoint[];
  color?: string;
}

export interface TimeRangeOption {
  label: string;
  value: string;
}

interface LineChartProps {
  series: LineChartSeries[];
  height?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  showLive?: boolean;
  title?: string;
  yAxisLabel?: string;
  xAxisLabel?: string;
  formatYValue?: (value: number) => string;
  formatXValue?: (timestamp: Date) => string;
  timeRangeOptions?: TimeRangeOption[];
  selectedRange?: string;
  onRangeChange?: (range: string) => void;
}

const DEFAULT_COLORS = [
  '#FFA348', // muted orange (primary)
  '#3B82F6', // blue
  '#32FF89', // green (live)
  '#F59E0B', // amber
  '#8B5CF6', // purple
  '#EC4899', // pink
];

const DEFAULT_TIME_RANGES: TimeRangeOption[] = [
  { label: 'Last 5 minutes', value: '5m' },
  { label: 'CUSTOM', value: 'custom' },
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '30D', value: '30d' },
];

/**
 * Utility function to determine if LIVE badge should be shown
 * Used for property-based testing
 * @param showLive - The showLive prop value
 * @returns boolean indicating if LIVE badge should be rendered
 */
export function shouldShowLiveBadge(showLive: boolean | undefined): boolean {
  return showLive === true;
}


// LIVE Badge component for LineChart
function LiveBadge() {
  return (
    <span 
      className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium uppercase"
      style={{
        backgroundColor: 'rgba(50, 255, 137, 0.2)',
        border: '1px solid rgba(50, 255, 137, 0.3)',
        color: '#32FF89',
      }}
      data-testid="linechart-live-badge"
    >
      <span 
        className="w-1.5 h-1.5 rounded-full animate-pulse-live"
        style={{
          backgroundColor: '#32FF89',
          boxShadow: '0 0 6px rgba(50, 255, 137, 0.6)',
        }}
      />
      LIVE
    </span>
  );
}

export default function LineChart({
  series,
  height = 256,
  showGrid = true,
  showLegend = true,
  showLive = false,
  title,
  yAxisLabel,
  formatYValue = (v) => v.toLocaleString(),
  formatXValue = (d) => d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
  timeRangeOptions = DEFAULT_TIME_RANGES,
  selectedRange,
  onRangeChange,
}: LineChartProps) {
  const [internalSelectedRange, setInternalSelectedRange] = useState(selectedRange || '5m');
  const activeRange = selectedRange ?? internalSelectedRange;

  const handleRangeChange = (range: string) => {
    if (onRangeChange) {
      onRangeChange(range);
    } else {
      setInternalSelectedRange(range);
    }
  };

  const { minY, maxY, minX, maxX, yTicks, xTicks } = useMemo(() => {
    const allValues = series.flatMap((s) => s.data.map((d) => d.value));
    const allTimestamps = series.flatMap((s) =>
      s.data.map((d) => new Date(d.timestamp).getTime())
    );

    const dataMinY = Math.min(...allValues, 0);
    const dataMaxY = Math.max(...allValues, 1);
    const padding = (dataMaxY - dataMinY) * 0.1 || 1;

    const minY = Math.max(0, dataMinY - padding);
    const maxY = dataMaxY + padding;

    const minX = Math.min(...allTimestamps);
    const maxX = Math.max(...allTimestamps);

    // Generate Y-axis ticks
    const yTickCount = 5;
    const yStep = (maxY - minY) / (yTickCount - 1);
    const yTicks = Array.from({ length: yTickCount }, (_, i) => minY + i * yStep);

    // Generate X-axis ticks
    const xTickCount = 5;
    const xStep = (maxX - minX) / (xTickCount - 1);
    const xTicks = Array.from({ length: xTickCount }, (_, i) => minX + i * xStep);

    return { minY, maxY, minX, maxX, yTicks, xTicks };
  }, [series]);

  const padding = { top: 20, right: 20, bottom: 40, left: 60 };
  const chartHeight = height - padding.top - padding.bottom;

  const getX = (timestamp: Date | string | number): number => {
    const t = new Date(timestamp).getTime();
    if (maxX === minX) return 50;
    return ((t - minX) / (maxX - minX)) * 100;
  };

  const getY = (value: number): number => {
    if (maxY === minY) return 50;
    return 100 - ((value - minY) / (maxY - minY)) * 100;
  };

  const generatePath = (data: DataPoint[]): string => {
    if (data.length === 0) return '';
    
    const sortedData = [...data].sort(
      (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
    );

    return sortedData
      .map((point, i) => {
        const x = getX(point.timestamp);
        const y = getY(point.value);
        return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
      })
      .join(' ');
  };

  const hasData = series.some((s) => s.data.length > 0);


  return (
    <div 
      className="w-full rounded-card"
      style={{
        backgroundColor: '#121212',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '16px 20px',
      }}
    >
      {/* Chart Header with title, LIVE badge, and time range selector */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {title && (
            <h3 
              className="font-medium"
              style={{ 
                fontSize: '14px', 
                color: 'rgba(255, 255, 255, 0.9)' 
              }}
            >
              {title}
            </h3>
          )}
          {showLive && <LiveBadge />}
        </div>
        
        {/* Time range selector */}
        <div className="flex items-center gap-1">
          {timeRangeOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => handleRangeChange(option.value)}
              className="transition-colors"
              style={{
                background: activeRange === option.value ? 'rgba(255, 255, 255, 0.1)' : 'transparent',
                border: 'none',
                padding: '4px 8px',
                fontSize: '11px',
                color: activeRange === option.value ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Legend */}
      {showLegend && series.length > 1 && (
        <div className="flex flex-wrap gap-4 mb-4">
          {series.map((s, i) => (
            <div key={s.name} className="flex items-center gap-2">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length] }}
              />
              <span 
                style={{ 
                  fontSize: '11px', 
                  color: 'rgba(255, 255, 255, 0.4)' 
                }}
              >
                {s.name}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="relative" style={{ height: height - 60 }}>
        {/* Y-axis label */}
        {yAxisLabel && (
          <div
            style={{ 
              position: 'absolute',
              left: 0, 
              top: '50%', 
              transform: 'rotate(-90deg) translateX(-50%)',
              fontSize: '10px',
              color: 'rgba(255, 255, 255, 0.4)',
            }}
          >
            {yAxisLabel}
          </div>
        )}

        {/* Y-axis ticks */}
        <div
          className="absolute flex flex-col justify-between"
          style={{
            left: 0,
            top: padding.top,
            bottom: padding.bottom,
            width: padding.left - 8,
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.4)',
          }}
        >
          {yTicks.reverse().map((tick, i) => (
            <div key={i} className="text-right pr-2">
              {formatYValue(tick)}
            </div>
          ))}
        </div>


        {/* Chart area */}
        <div
          className="absolute"
          style={{
            left: padding.left,
            top: padding.top,
            right: padding.right,
            bottom: padding.bottom,
            backgroundColor: '#121212',
            borderRadius: '4px',
          }}
        >
          <svg
            className="w-full h-full overflow-visible"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
          >
            {/* Grid lines - very subtle (5-8% opacity) */}
            {showGrid && (
              <g>
                {/* Horizontal grid lines */}
                {[0, 25, 50, 75, 100].map((y) => (
                  <line
                    key={`h-${y}`}
                    x1="0"
                    y1={y}
                    x2="100"
                    y2={y}
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
                {/* Vertical grid lines */}
                {[0, 25, 50, 75, 100].map((x) => (
                  <line
                    key={`v-${x}`}
                    x1={x}
                    y1="0"
                    x2={x}
                    y2="100"
                    stroke="rgba(255, 255, 255, 0.05)"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </g>
            )}

            {/* Data lines - thin (1.5-2px) with muted orange as primary */}
            {hasData &&
              series.map((s, i) => (
                <path
                  key={s.name}
                  d={generatePath(s.data)}
                  fill="none"
                  stroke={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                  strokeWidth="1.5"
                  vectorEffect="non-scaling-stroke"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ))}

            {/* Data points */}
            {hasData &&
              series.map((s, i) =>
                s.data.map((point, j) => (
                  <circle
                    key={`${s.name}-${j}`}
                    cx={getX(point.timestamp)}
                    cy={getY(point.value)}
                    r="1.5"
                    fill={s.color || DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
                    vectorEffect="non-scaling-stroke"
                  />
                ))
              )}
          </svg>

          {/* No data message */}
          {!hasData && (
            <div 
              className="absolute inset-0 flex items-center justify-center"
              style={{ 
                fontSize: '14px',
                color: 'rgba(255, 255, 255, 0.4)',
              }}
            >
              No data available
            </div>
          )}
        </div>

        {/* X-axis ticks */}
        <div
          className="absolute flex justify-between"
          style={{
            left: padding.left,
            right: padding.right,
            bottom: 8,
            fontSize: '10px',
            color: 'rgba(255, 255, 255, 0.4)',
          }}
        >
          {xTicks.map((tick, i) => (
            <div key={i}>{formatXValue(new Date(tick))}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
