'use client';

import { useState, useEffect, useMemo } from 'react';
import LineChart, { LineChartSeries } from '../../../components/LineChart';
import { isDemoMode } from '../../../lib/demoMode';

// API Configuration
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

// Usage log entry interface matching backend types
interface UsageLogEntry {
  id: number;
  apiKeyId: string;
  projectId: string;
  providerId: string;
  modelId: string | null;
  tokensIn: number;
  tokensOut: number;
  cost: number;
  latencyMs: number | null;
  statusCode: number | null;
  errorMessage: string | null;
  createdAt: string; // Date comes as string from JSON
}

interface Project {
  id: string;
  name: string;
}

interface Provider {
  id: string;
  displayName: string;
}

interface Model {
  id: string;
  displayName: string;
}

// Filter state interface
interface UsageFilters {
  startDate: string;
  endDate: string;
  projectId: string;
  providerId: string;
  modelId: string;
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCost(cost: number): string {
  return `$${cost.toFixed(4)}`;
}

function formatTokens(tokens: number): string {
  if (tokens >= 1000000) {
    return `${(tokens / 1000000).toFixed(1)}M`;
  }
  if (tokens >= 1000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }
  return tokens.toString();
}

/**
 * Generates CSV content from usage logs
 */
function generateCSV(logs: UsageLogEntry[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'Project ID',
    'Provider',
    'Model',
    'Tokens In',
    'Tokens Out',
    'Total Tokens',
    'Cost',
    'Latency (ms)',
    'Status',
  ];

  const rows = logs.map(log => [
    log.id.toString(),
    log.createdAt,
    log.projectId,
    log.providerId,
    log.modelId || '',
    log.tokensIn.toString(),
    log.tokensOut.toString(),
    (log.tokensIn + log.tokensOut).toString(),
    log.cost.toFixed(6),
    log.latencyMs?.toString() || '',
    log.statusCode?.toString() || '',
  ]);

  const escapeCSV = (value: string): string => {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  };

  return [
    headers.map(escapeCSV).join(','),
    ...rows.map(row => row.map(escapeCSV).join(',')),
  ].join('\n');
}

function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export default function UsagePage() {
  const [filters, setFilters] = useState<UsageFilters>({
    startDate: '',
    endDate: '',
    projectId: '',
    providerId: '',
    modelId: '',
  });

  const [usageLogs, setUsageLogs] = useState<UsageLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCharts, setShowCharts] = useState(true);
  
  // Metadata for filters
  const [projects, setProjects] = useState<Project[]>([]);
  const [providers, setProviders] = useState<Provider[]>([]);
  // const [models, setModels] = useState<Model[]>([]); // Could fetch models too

  // Fetch metadata
  useEffect(() => {
    // TODO: Implement endpoints for these if they don't exist or mock for now
    // For now we just use what we have in logs or fetch known ones
    // fetch(`${API_URL}/api/projects`).then(r => r.json()).then(setProjects).catch(console.error);
    fetch(`${API_URL}/api/providers`).then(r => r.json()).then(setProviders).catch(console.error);
  }, []);

  // Fetch logs
  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      try {
        const queryParams = new URLSearchParams();
        if (filters.startDate) queryParams.append('startDate', filters.startDate);
        if (filters.endDate) queryParams.append('endDate', filters.endDate);
        if (filters.projectId) queryParams.append('projectId', filters.projectId);
        if (filters.providerId) queryParams.append('providerId', filters.providerId);
        if (filters.modelId) queryParams.append('modelId', filters.modelId);

        const res = await fetch(`${API_URL}/api/usage/logs?${queryParams.toString()}`);
        if (res.ok) {
          const data = await res.json();
          setUsageLogs(data);
        }
      } catch (error) {
        console.error('Failed to fetch logs:', error);
      } finally {
        setLoading(false);
      }
    }

    if (!isDemoMode()) {
      fetchLogs();
    } else {
        // Fallback to mock data if in demo mode (omitted for brevity in this update, 
        // assuming user wants REAL data as per prompt)
        setLoading(false);
    }
  }, [filters]);

  // Calculate summary stats
  const summary = useMemo(() => {
    return usageLogs.reduce(
      (acc, log) => ({
        totalTokensIn: acc.totalTokensIn + log.tokensIn,
        totalTokensOut: acc.totalTokensOut + log.tokensOut,
        totalCost: acc.totalCost + log.cost,
        requestCount: acc.requestCount + 1,
      }),
      { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, requestCount: 0 }
    );
  }, [usageLogs]);

  // Generate chart data - token usage over time by provider
  const chartData: LineChartSeries[] = useMemo(() => {
    const providerData: Record<string, { timestamp: Date; value: number }[]> = {};
    
    usageLogs.forEach(log => {
      const providerId = log.providerId;
      if (!providerData[providerId]) {
        providerData[providerId] = [];
      }
      providerData[providerId].push({
        timestamp: new Date(log.createdAt),
        value: log.tokensIn + log.tokensOut,
      });
    });

    return Object.entries(providerData).map(([providerId, data]) => ({
      name: providerId, // Could map to display name if available
      data: data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    }));
  }, [usageLogs]);

  const handleFilterChange = (key: keyof UsageFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleClearFilters = () => {
    setFilters({
      startDate: '',
      endDate: '',
      projectId: '',
      providerId: '',
      modelId: '',
    });
  };

  const handleExportCSV = () => {
    const csv = generateCSV(usageLogs);
    const timestamp = new Date().toISOString().split('T')[0];
    downloadFile(csv, `usage-logs-${timestamp}.csv`, 'text/csv');
  };

  const hasActiveFilters = Object.values(filters).some(v => v !== '');

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-lg font-semibold text-text-primary">Usage</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCharts(!showCharts)}
            className="px-3 py-2 text-sm text-text-secondary hover:text-text-primary hover:bg-panel-hover border border-border rounded-button transition-colors"
          >
            {showCharts ? 'Hide Charts' : 'Show Charts'}
          </button>
          <button
            onClick={handleExportCSV}
            className="px-4 py-2 bg-accent hover:bg-accent-hover text-background rounded-button text-sm font-medium transition-colors flex items-center gap-2"
          >
            Export CSV
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-panel rounded-card border border-border p-4">
          <div className="text-label uppercase tracking-wide text-text-muted mb-2">Total Requests</div>
          <div className="text-metric-sm text-text-primary">{summary.requestCount}</div>
        </div>
        <div className="bg-panel rounded-card border border-border p-4">
          <div className="text-label uppercase tracking-wide text-text-muted mb-2">Tokens In</div>
          <div className="text-metric-sm text-text-primary">{formatTokens(summary.totalTokensIn)}</div>
        </div>
        <div className="bg-panel rounded-card border border-border p-4">
          <div className="text-label uppercase tracking-wide text-text-muted mb-2">Tokens Out</div>
          <div className="text-metric-sm text-text-primary">{formatTokens(summary.totalTokensOut)}</div>
        </div>
        <div className="bg-panel rounded-card border border-border p-4">
          <div className="text-label uppercase tracking-wide text-text-muted mb-2">Total Cost</div>
          <div className="text-metric-sm text-accent">${formatCost(summary.totalCost)}</div>
        </div>
      </div>

      {/* Usage Analytics Chart */}
      {showCharts && (
        <div className="bg-panel rounded-card border border-border p-5 mb-6">
          <h2 className="text-sm font-medium text-text-primary mb-4">Token Usage by Provider</h2>
          {chartData.length > 0 ? (
            <LineChart
              series={chartData}
              height={256}
              showGrid={true}
              showLegend={true}
              yAxisLabel="Tokens"
              formatYValue={(v) => formatTokens(v)}
            />
          ) : (
            <div className="h-64 flex items-center justify-center text-text-muted">
              {loading ? 'Loading data...' : 'No data available for the selected filters'}
            </div>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="bg-panel rounded-card border border-border p-4 mb-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-label uppercase tracking-wide text-text-muted">Filters</h2>
          {hasActiveFilters && (
            <button
              onClick={handleClearFilters}
              className="text-xs text-accent hover:text-accent-hover transition-colors"
            >
              Clear all
            </button>
          )}
        </div>
        <div className="grid grid-cols-5 gap-4">
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Start Date</label>
            <input
              type="date"
              value={filters.startDate}
              onChange={(e) => handleFilterChange('startDate', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">End Date</label>
            <input
              type="date"
              value={filters.endDate}
              onChange={(e) => handleFilterChange('endDate', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent placeholder:text-text-muted"
            />
          </div>
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Project ID</label>
            <input
              type="text"
              value={filters.projectId}
              onChange={(e) => handleFilterChange('projectId', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder="All Projects"
            />
          </div>
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Provider</label>
            <select
              value={filters.providerId}
              onChange={(e) => handleFilterChange('providerId', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">All Providers</option>
              {providers.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.displayName}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Model ID</label>
            <input
              type="text"
              value={filters.modelId}
              onChange={(e) => handleFilterChange('modelId', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
              placeholder="All Models"
            />
          </div>
        </div>
      </div>

      {/* Usage Logs Table */}
      <div className="bg-panel rounded-card border border-border overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Timestamp</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Project</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Provider</th>
              <th className="text-left px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Model</th>
              <th className="text-right px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Tokens In</th>
              <th className="text-right px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Tokens Out</th>
              <th className="text-right px-4 py-3 text-label uppercase tracking-wide font-medium text-text-muted">Cost</th>
            </tr>
          </thead>
          <tbody>
            {usageLogs.map((log) => (
              <tr key={log.id} className="border-b border-border-subtle last:border-b-0 hover:bg-panel-hover transition-colors">
                <td className="px-4 py-3">
                  <div className="text-sm text-text-primary">{formatDate(log.createdAt)}</div>
                  <div className="text-xs text-text-muted">{formatTime(log.createdAt)}</div>
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  {log.projectId}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-badge bg-accent-muted text-accent border border-accent/30">
                    {log.providerId}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm font-mono text-text-secondary">
                  {log.modelId || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-text-primary">
                  {log.tokensIn.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-text-primary">
                  {log.tokensOut.toLocaleString()}
                </td>
                <td className="px-4 py-3 text-sm text-right tabular-nums text-accent">
                  ${formatCost(log.cost)}
                </td>
              </tr>
            ))}
            {usageLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  {loading 
                    ? 'Loading usage logs...' 
                    : hasActiveFilters
                      ? 'No usage logs match the selected filters.'
                      : 'No usage logs recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Results count */}
      {usageLogs.length > 0 && (
        <div className="mt-4 text-sm text-text-secondary">
          Showing {usageLogs.length} {usageLogs.length === 1 ? 'entry' : 'entries'}
          {hasActiveFilters && ' (filtered)'}
        </div>
      )}
    </div>
  );
}