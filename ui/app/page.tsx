'use client';

import { useState, useEffect, useCallback } from 'react';
import { MetricCard, LineChart, DataPoint, LineChartSeries } from '../components';
import { isDemoMode } from '../lib/demoMode';

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

// Generate mock data for demonstration (only used when DEMO_MODE is enabled)
function generateMockData(range: TimeRangeOption): DataPoint[] {
  const now = Date.now();
  const data: DataPoint[] = [];
  
  for (let i = range.pointCount - 1; i >= 0; i--) {
    const timestamp = now - i * range.intervalMs;
    // Generate somewhat realistic looking data with some variance
    const baseValue = 50 + Math.sin(i / 5) * 20;
    const noise = Math.random() * 15 - 7.5;
    data.push({
      timestamp: new Date(timestamp),
      value: Math.max(0, Math.round(baseValue + noise)),
    });
  }
  
  return data;
}

function generateProviderData(range: TimeRangeOption): LineChartSeries[] {
  const now = Date.now();
  
  const providers = [
    { name: 'OpenAI', color: '#10B981' },
    { name: 'Anthropic', color: '#FF8800' },
    { name: 'Azure', color: '#3B82F6' },
  ];
  
  return providers.map((provider) => ({
    name: provider.name,
    color: provider.color,
    data: Array.from({ length: range.pointCount }, (_, i) => {
      const timestamp = now - (range.pointCount - 1 - i) * range.intervalMs;
      const baseValue = 30 + Math.random() * 40;
      return {
        timestamp: new Date(timestamp),
        value: Math.round(baseValue),
      };
    }),
  }));
}

export default function DashboardPage() {
  const [timeRange, setTimeRange] = useState<TimeRange>('1h');
  const [metrics, setMetrics] = useState({
    concurrentRequests: 0,
    requestsPerSec: 0,
    peakUsage: 0,
    totalTokens: 0,
  });
  const [requestsData, setRequestsData] = useState<DataPoint[]>([]);
  const [tokensData, setTokensData] = useState<LineChartSeries[]>([]);

  const selectedRange = TIME_RANGES.find((r) => r.value === timeRange) || TIME_RANGES[1];

  const refreshData = useCallback(() => {
    if (isDemoMode()) {
      // Demo mode: generate mock data for demonstration
      setMetrics({
        concurrentRequests: Math.floor(Math.random() * 50) + 10,
        requestsPerSec: Math.floor(Math.random() * 100) + 20,
        peakUsage: Math.floor(Math.random() * 200) + 100,
        totalTokens: Math.floor(Math.random() * 1000000) + 500000,
      });
      
      setRequestsData(generateMockData(selectedRange));
      setTokensData(generateProviderData(selectedRange));
    } else {
      // Production mode: show empty state (real API integration would go here)
      setMetrics({
        concurrentRequests: 0,
        requestsPerSec: 0,
        peakUsage: 0,
        totalTokens: 0,
      });
      
      setRequestsData([]);
      setTokensData([]);
    }
  }, [selectedRange]);

  // Initial data load and refresh on time range change
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // Auto-refresh every 5 seconds for live data (only in demo mode)
  useEffect(() => {
    if (!isDemoMode()) return;
    
    const interval = setInterval(() => {
      // Only auto-refresh for shorter time ranges
      if (timeRange === '5min' || timeRange === '1h') {
        setMetrics((prev) => ({
          ...prev,
          concurrentRequests: Math.max(0, prev.concurrentRequests + Math.floor(Math.random() * 5) - 2),
          requestsPerSec: Math.max(0, prev.requestsPerSec + Math.floor(Math.random() * 10) - 5),
        }));
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [timeRange]);

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

      {/* Metric Cards - 16-24px gaps per Requirements 6.3 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Real-time metrics with LIVE badges per Requirements 3.5 */}
        <MetricCard
          label="Concurrent Requests"
          value={metrics.concurrentRequests}
          limit={100}
          isLive
        />
        <MetricCard
          label="Requests / sec"
          value={metrics.requestsPerSec}
          isLive
          unit="req/s"
        />
        {/* Non-live metrics */}
        <MetricCard
          label="Peak Usage"
          value={metrics.peakUsage}
          limit={500}
        />
        <MetricCard
          label="Total Tokens"
          value={metrics.totalTokens}
          unit="tokens"
        />
      </div>

      {/* Charts - 24px gaps per Requirements 6.3 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Requests Over Time - with LIVE badge for real-time data */}
        <LineChart
          series={[
            {
              name: 'Requests',
              data: requestsData,
              color: '#FFA348', // muted orange per Requirements 4.4
            },
          ]}
          height={280}
          showLegend={false}
          showLive={timeRange === '5min' || timeRange === '1h'}
          title="Requests Over Time"
          yAxisLabel="Requests"
          formatXValue={formatXValue}
          timeRangeOptions={[]} // Hide internal time range selector - using page-level selector
        />

        {/* Token Usage by Provider */}
        <LineChart
          series={tokensData}
          height={280}
          showLegend
          showLive={timeRange === '5min' || timeRange === '1h'}
          title="Token Usage by Provider"
          yAxisLabel="Tokens (K)"
          formatYValue={(v) => `${(v / 1000).toFixed(0)}K`}
          formatXValue={formatXValue}
          timeRangeOptions={[]} // Hide internal time range selector - using page-level selector
        />
      </div>

      {/* Additional Stats Row - consistent card styling per Requirements 3.1, 3.2, 5.1-5.7 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Avg Latency Card */}
        <div className="bg-panel rounded-card p-4 px-5 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label uppercase text-text-muted tracking-wide">Avg Latency</span>
            <span className="text-[10px] text-text-muted">Last {selectedRange.label}</span>
          </div>
          <div className="flex items-baseline gap-1">
            {isDemoMode() ? (
              <>
                <span className="text-metric-sm text-text-primary">
                  {Math.floor(Math.random() * 200) + 100}
                </span>
                <span className="text-sm text-text-muted">ms</span>
              </>
            ) : (
              <span className="text-sm text-text-muted">No data</span>
            )}
          </div>
        </div>
        
        {/* Error Rate Card */}
        <div className="bg-panel rounded-card p-4 px-5 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label uppercase text-text-muted tracking-wide">Error Rate</span>
            <span className="text-[10px] text-text-muted">Last {selectedRange.label}</span>
          </div>
          <div className="flex items-baseline gap-1">
            {isDemoMode() ? (
              <>
                <span className="text-metric-sm text-text-primary">
                  {(Math.random() * 2).toFixed(2)}
                </span>
                <span className="text-sm text-text-muted">%</span>
              </>
            ) : (
              <span className="text-sm text-text-muted">No data</span>
            )}
          </div>
        </div>
        
        {/* Active API Keys Card */}
        <div className="bg-panel rounded-card p-4 px-5 border border-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-label uppercase text-text-muted tracking-wide">Active API Keys</span>
          </div>
          <div className="text-metric-sm text-text-primary">
            {isDemoMode() ? Math.floor(Math.random() * 20) + 5 : <span className="text-sm text-text-muted font-normal">No data</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
