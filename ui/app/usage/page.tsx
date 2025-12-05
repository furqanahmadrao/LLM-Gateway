'use client';

import { useState, useMemo } from 'react';
import LineChart, { LineChartSeries } from '../../components/LineChart';
import { isDemoMode } from '../../lib/demoMode';

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
  createdAt: Date;
}

// Filter state interface
interface UsageFilters {
  startDate: string;
  endDate: string;
  projectId: string;
  providerId: string;
  modelId: string;
}

// Mock data for demonstration (only used when DEMO_MODE is enabled)
const mockUsageLogs: UsageLogEntry[] = [
  {
    id: 1,
    apiKeyId: 'key-1',
    projectId: 'proj-1',
    providerId: 'openai',
    modelId: 'gpt-4',
    tokensIn: 1250,
    tokensOut: 450,
    cost: 0.0425,
    latencyMs: 1234,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-04T14:30:00'),
  },
  {
    id: 2,
    apiKeyId: 'key-1',
    projectId: 'proj-1',
    providerId: 'anthropic',
    modelId: 'claude-3-sonnet',
    tokensIn: 2100,
    tokensOut: 890,
    cost: 0.0312,
    latencyMs: 2456,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-04T13:15:00'),
  },
  {
    id: 3,
    apiKeyId: 'key-2',
    projectId: 'proj-2',
    providerId: 'openai',
    modelId: 'gpt-3.5-turbo',
    tokensIn: 500,
    tokensOut: 200,
    cost: 0.0014,
    latencyMs: 567,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-04T12:00:00'),
  },
  {
    id: 4,
    apiKeyId: 'key-1',
    projectId: 'proj-1',
    providerId: 'openai',
    modelId: 'gpt-4',
    tokensIn: 3200,
    tokensOut: 1100,
    cost: 0.1075,
    latencyMs: 3890,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-04T10:45:00'),
  },
  {
    id: 5,
    apiKeyId: 'key-3',
    projectId: 'proj-1',
    providerId: 'anthropic',
    modelId: 'claude-3-opus',
    tokensIn: 1800,
    tokensOut: 2200,
    cost: 0.1800,
    latencyMs: 5678,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-03T16:30:00'),
  },
  {
    id: 6,
    apiKeyId: 'key-1',
    projectId: 'proj-1',
    providerId: 'openai',
    modelId: 'gpt-4',
    tokensIn: 890,
    tokensOut: 340,
    cost: 0.0308,
    latencyMs: 1123,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-03T14:20:00'),
  },
  {
    id: 7,
    apiKeyId: 'key-2',
    projectId: 'proj-2',
    providerId: 'azure',
    modelId: 'gpt-4-deployment',
    tokensIn: 1500,
    tokensOut: 600,
    cost: 0.0525,
    latencyMs: 1890,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-03T11:00:00'),
  },
  {
    id: 8,
    apiKeyId: 'key-1',
    projectId: 'proj-1',
    providerId: 'openai',
    modelId: 'gpt-3.5-turbo',
    tokensIn: 2500,
    tokensOut: 1200,
    cost: 0.0074,
    latencyMs: 890,
    statusCode: 200,
    errorMessage: null,
    createdAt: new Date('2024-12-02T09:30:00'),
  },
];

const mockProjects = [
  { id: 'proj-1', name: 'Production' },
  { id: 'proj-2', name: 'Development' },
];

const mockProviders = [
  { id: 'openai', name: 'OpenAI' },
  { id: 'anthropic', name: 'Anthropic' },
  { id: 'azure', name: 'Azure OpenAI' },
];

const mockModels = [
  { id: 'gpt-4', name: 'GPT-4' },
  { id: 'gpt-3.5-turbo', name: 'GPT-3.5 Turbo' },
  { id: 'claude-3-sonnet', name: 'Claude 3 Sonnet' },
  { id: 'claude-3-opus', name: 'Claude 3 Opus' },
  { id: 'gpt-4-deployment', name: 'GPT-4 (Azure)' },
];


function formatDate(date: Date): string {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatTime(date: Date): string {
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

function getProviderName(providerId: string): string {
  const provider = mockProviders.find(p => p.id === providerId);
  return provider?.name || providerId;
}

function getProjectName(projectId: string): string {
  const project = mockProjects.find(p => p.id === projectId);
  return project?.name || projectId;
}

/**
 * Generates CSV content from usage logs
 * Requirements: 12.4 - Export filtered results to CSV file
 */
function generateCSV(logs: UsageLogEntry[]): string {
  const headers = [
    'ID',
    'Timestamp',
    'Project',
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
    log.createdAt.toISOString(),
    getProjectName(log.projectId),
    getProviderName(log.providerId),
    log.modelId || '',
    log.tokensIn.toString(),
    log.tokensOut.toString(),
    (log.tokensIn + log.tokensOut).toString(),
    log.cost.toFixed(6),
    log.latencyMs?.toString() || '',
    log.statusCode?.toString() || '',
  ]);

  // Escape CSV values that contain commas or quotes
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

/**
 * Downloads content as a file
 */
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

  const [showCharts, setShowCharts] = useState(true);

  // Get usage logs based on demo mode
  const usageLogs = isDemoMode() ? mockUsageLogs : [];

  // Filter logs based on current filters
  const filteredLogs = useMemo(() => {
    return usageLogs.filter(log => {
      if (filters.startDate) {
        const startDate = new Date(filters.startDate);
        startDate.setHours(0, 0, 0, 0);
        if (log.createdAt < startDate) return false;
      }
      if (filters.endDate) {
        const endDate = new Date(filters.endDate);
        endDate.setHours(23, 59, 59, 999);
        if (log.createdAt > endDate) return false;
      }
      if (filters.projectId && log.projectId !== filters.projectId) return false;
      if (filters.providerId && log.providerId !== filters.providerId) return false;
      if (filters.modelId && log.modelId !== filters.modelId) return false;
      return true;
    });
  }, [filters]);

  // Calculate summary stats
  const summary = useMemo(() => {
    return filteredLogs.reduce(
      (acc, log) => ({
        totalTokensIn: acc.totalTokensIn + log.tokensIn,
        totalTokensOut: acc.totalTokensOut + log.tokensOut,
        totalCost: acc.totalCost + log.cost,
        requestCount: acc.requestCount + 1,
      }),
      { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, requestCount: 0 }
    );
  }, [filteredLogs]);

  // Generate chart data - token usage over time by provider
  const chartData: LineChartSeries[] = useMemo(() => {
    const providerData: Record<string, { timestamp: Date; value: number }[]> = {};
    
    // Group logs by provider and aggregate by day
    filteredLogs.forEach(log => {
      const providerId = log.providerId;
      if (!providerData[providerId]) {
        providerData[providerId] = [];
      }
      providerData[providerId].push({
        timestamp: log.createdAt,
        value: log.tokensIn + log.tokensOut,
      });
    });

    // Convert to chart series
    return Object.entries(providerData).map(([providerId, data]) => ({
      name: getProviderName(providerId),
      data: data.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime()),
    }));
  }, [filteredLogs]);

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
    const csv = generateCSV(filteredLogs);
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
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
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
              No data available for the selected filters
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
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Project</label>
            <select
              value={filters.projectId}
              onChange={(e) => handleFilterChange('projectId', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">All Projects</option>
              {mockProjects.map(project => (
                <option key={project.id} value={project.id}>{project.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Provider</label>
            <select
              value={filters.providerId}
              onChange={(e) => handleFilterChange('providerId', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">All Providers</option>
              {mockProviders.map(provider => (
                <option key={provider.id} value={provider.id}>{provider.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-label uppercase tracking-wide text-text-muted mb-1.5">Model</label>
            <select
              value={filters.modelId}
              onChange={(e) => handleFilterChange('modelId', e.target.value)}
              className="w-full bg-background border border-border rounded-button px-3 py-2 text-sm text-text-primary focus:outline-none focus:border-accent"
            >
              <option value="">All Models</option>
              {mockModels.map(model => (
                <option key={model.id} value={model.id}>{model.name}</option>
              ))}
            </select>
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
            {filteredLogs.map((log) => (
              <tr key={log.id} className="border-b border-border-subtle last:border-b-0 hover:bg-panel-hover transition-colors">
                <td className="px-4 py-3">
                  <div className="text-sm text-text-primary">{formatDate(log.createdAt)}</div>
                  <div className="text-xs text-text-muted">{formatTime(log.createdAt)}</div>
                </td>
                <td className="px-4 py-3 text-sm text-text-primary">
                  {getProjectName(log.projectId)}
                </td>
                <td className="px-4 py-3">
                  <span className="inline-flex items-center gap-1.5 px-2 py-1 text-xs rounded-badge bg-accent-muted text-accent border border-accent/30">
                    {getProviderName(log.providerId)}
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
            {filteredLogs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-text-muted">
                  {hasActiveFilters
                    ? 'No usage logs match the selected filters.'
                    : 'No usage logs recorded yet.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Results count */}
      {filteredLogs.length > 0 && (
        <div className="mt-4 text-sm text-text-secondary">
          Showing {filteredLogs.length} {filteredLogs.length === 1 ? 'entry' : 'entries'}
          {hasActiveFilters && ' (filtered)'}
        </div>
      )}
    </div>
  );
}
