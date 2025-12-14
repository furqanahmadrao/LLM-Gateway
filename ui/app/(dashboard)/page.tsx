'use client';

import { useState, useEffect, useCallback } from 'react';
import { MetricCard, LineChart, DataPoint, LineChartSeries } from '../../components';
import { isDemoMode } from '../../lib/demoMode';

// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

type TimeRange = '5min' | '1h' | '6h' | '24h' | '30d';

interface TimeRangeOption {
  value: TimeRange;
  label: string;
  intervalMs: number;
  pointCount: number;
}

const TIME_RANGES: TimeRangeOption[] = [
  { value: '5min', label: '5 min', intervalMs: 10000, pointCount: 30 },
  { value: '1h', label: '1 hour', intervalMs: 60000, pointCount: 60 },
  { value: '6h', label: '6 hours', intervalMs: 360000, pointCount: 60 },
  { value: '24h', label: '24 hours', intervalMs: 1440000, pointCount: 60 },
  { value: '30d', label: '30 days', intervalMs: 86400000, pointCount: 30 },
];

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState({
    concurrentRequests: 0,
    requestsPerSec: 0,
    peakUsage: 0,
    totalTokens: 0,
    errorRate: 0,
    avgLatency: 0,
    activeKeys: 0,
  });
  
  // Chart data
  const [requestsData, setRequestsData] = useState<DataPoint[]>([]);
  const [tokensData, setTokensData] = useState<LineChartSeries[]>([]);

  const selectedRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[1];

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch Real-time and Aggregated metrics
      const res = await fetch(`${API_URL}/api/dashboard/metrics`);
      if (res.ok) {
        const data = await res.json();
        
        // Map API response to UI state
        // Assuming API returns { realTime: {...}, aggregated: {...} }
        const rt = data.realTime;
        const agg = data.aggregated;

        setMetrics({
          concurrentRequests: 0, // Not currently tracked by backend, would need active request counter
          requestsPerSec: rt.totalRequests > 0 ? (rt.totalRequests / 60) : 0, // Approx for last min/hour
          peakUsage: 0, // Need historical peak logic
          totalTokens: agg.totalTokensIn + agg.totalTokensOut,
          errorRate: agg.errorRate * 100,
          avgLatency: agg.averageLatencyMs,
          activeKeys: 0, // Need count of active keys
        });
      }

      // Fetch Time Series Data
      const hours = selectedRange.intervalMs * selectedRange.pointCount / 3600000;
      const granularity = hours > 48 ? 'day' : 'hour';
      const tsRes = await fetch(`${API_URL}/api/dashboard/metrics/timeseries?hours=${hours}&granularity=${granularity}`);
      
      if (tsRes.ok) {
        const tsData = await tsRes.json();
        // tsData.data is array of { timestamp, requests, tokensIn, tokensOut... }
        
        // Map to requests chart
        const reqPoints = tsData.data.map((d: any) => ({
          timestamp: new Date(d.timestamp),
          value: d.requests
        }));
        setRequestsData(reqPoints);

        // Map to tokens chart (we only have total tokens here, strictly breaking down by provider needs separate endpoint or grouping)
        // For now, show Total Tokens series
        setTokensData([{
          name: 'Total Tokens',
          color: '#3B82F6',
          data: tsData.data.map((d: any) => ({
            timestamp: new Date(d.timestamp),
            value: d.tokensIn + d.tokensOut
          }))
        }]);
      }

    } catch (error) {
      console.error('Failed to fetch dashboard data:', error);
    } finally {
      setLoading(false);
    }
  }, [selectedRange]);

  // Initial load and refresh
  useEffect(() => {
    if (!isDemoMode()) {
        fetchData();
    } else {
        // Fallback to mock logic if needed or just empty
        setLoading(false);
    }
  }, [fetchData]);

  // Auto-refresh for live view
  useEffect(() => {
    if (isDemoMode()) return;
    const interval = setInterval(fetchData, 10000); // 10s refresh
    return () => clearInterval(interval);
  }, [fetchData]);

  const formatXValue = (date: Date): string => {
    if (timeRange === '30d') {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
    if (timeRange === '24h' || timeRange === '6h') {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold text-text-primary">Dashboard</h1>
        
        {/* Time Range Selector */}
        <div className="flex items-center gap-1 bg-panel rounded-button p-1 border border-border">
          {TIME_RANGES.map((range) => (
            <button
              key={range.value}
              onClick={() => setTimeRange(range.value)}
              className={`px-3 py-1.5 text-label rounded transition-colors ${
                timeRange === range.value
                  ? 'bg-white/10 text-text-primary'
                  : 'text-text-muted hover:text-text-primary hover:bg-white/5'
              }`}
            >
              {range.label}
            </button>
          ))}
        </div>
      </div>

      {/* Metric Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          label="Concurrent Requests"
          value={metrics.concurrentRequests}
          limit={100}
          isLive
        />
        <MetricCard
          label="Requests / min" // changed unit label
          value={metrics.requestsPerSec} // showing approx req/min or similar
          isLive
          unit="req/min"
        />
        <MetricCard
          label="Total Tokens"
          value={metrics.totalTokens}
          unit="tokens"
        />
        <MetricCard
          label="Avg Latency"
          value={metrics.avgLatency}
          unit="ms"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <LineChart
          series={[
            {
              name: 'Requests',
              data: requestsData,
              color: '#FFA348',
            },
          ]}
          height={280}
          showLegend={false}
          showLive={false}
          title="Requests Over Time"
          yAxisLabel="Requests"
          formatXValue={formatXValue}
          timeRangeOptions={[]} 
        />

        <LineChart
          series={tokensData}
          height={280}
          showLegend
          showLive={false}
          title="Token Usage"
          yAxisLabel="Tokens"
          formatYValue={(v) => `${(v / 1000).toFixed(1)}K`}
          formatXValue={formatXValue}
          timeRangeOptions={[]} 
        />
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-panel rounded-card p-4 px-5 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label uppercase text-text-muted tracking-wide">Error Rate</span>
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-metric-sm text-text-primary">
              {metrics.errorRate.toFixed(2)}
            </span>
            <span className="text-sm text-text-muted">%</span>
          </div>
        </div>
      </div>
    </div>
  );
}