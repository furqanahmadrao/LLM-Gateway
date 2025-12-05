/**
 * Usage Tracking Service
 * 
 * Provides usage logging, token extraction, estimation, aggregation, and cost calculation.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { query } from '../db/pool.js';
import type { UsageLogEntry, UsageSummary, ProviderUsage } from '../types/api.js';

interface UsageLogRow {
  id: number;
  api_key_id: string;
  project_id: string;
  provider_id: string;
  model_id: string | null;
  tokens_in: number;
  tokens_out: number;
  cost: string; // DECIMAL comes as string from pg
  latency_ms: number | null;
  status_code: number | null;
  error_message: string | null;
  created_at: Date;
}

interface UsageFilters {
  projectId?: string;
  providerId?: string;
  modelId?: string;
  startDate?: Date;
  endDate?: Date;
}

interface ProviderPricing {
  inputPricePerToken: number;
  outputPricePerToken: number;
}

// Average characters per token (approximation for estimation)
const CHARS_PER_TOKEN = 4;

/**
 * Logs a completed request to the usage_logs table
 * 
 * @param entry - The usage log entry to record
 * @returns The created log entry with ID
 * 
 * Requirements: 7.1 - Log tokens_in, tokens_out, provider, model, and timestamp
 */
export async function logUsage(entry: Omit<UsageLogEntry, 'id' | 'createdAt'>): Promise<UsageLogEntry> {
  const result = await query<UsageLogRow>(
    `INSERT INTO usage_logs (
      api_key_id, project_id, provider_id, model_id,
      tokens_in, tokens_out, cost, latency_ms, status_code, error_message
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    RETURNING *`,
    [
      entry.apiKeyId,
      entry.projectId,
      entry.providerId,
      entry.modelId,
      entry.tokensIn,
      entry.tokensOut,
      entry.cost,
      entry.latencyMs,
      entry.statusCode,
      entry.errorMessage,
    ]
  );

  const row = result.rows[0];
  return mapRowToEntry(row);
}


/**
 * Gets a usage log entry by ID
 */
export async function getUsageLogById(id: number): Promise<UsageLogEntry | null> {
  const result = await query<UsageLogRow>(
    'SELECT * FROM usage_logs WHERE id = $1',
    [id]
  );

  if (result.rows.length === 0) {
    return null;
  }

  return mapRowToEntry(result.rows[0]);
}

/**
 * Extracts token usage from a provider response
 * 
 * @param response - The provider response object
 * @returns Token counts if available, null otherwise
 * 
 * Requirements: 7.2 - Extract usage data when provider includes it
 */
export function extractUsageFromResponse(response: unknown): { tokensIn: number; tokensOut: number } | null {
  if (!response || typeof response !== 'object') {
    return null;
  }

  const resp = response as Record<string, unknown>;

  // OpenAI format: { usage: { prompt_tokens, completion_tokens } }
  if (resp.usage && typeof resp.usage === 'object') {
    const usage = resp.usage as Record<string, unknown>;
    const promptTokens = usage.prompt_tokens;
    const completionTokens = usage.completion_tokens;

    if (typeof promptTokens === 'number' && typeof completionTokens === 'number') {
      return {
        tokensIn: promptTokens,
        tokensOut: completionTokens,
      };
    }
  }

  // Anthropic format: { usage: { input_tokens, output_tokens } }
  if (resp.usage && typeof resp.usage === 'object') {
    const usage = resp.usage as Record<string, unknown>;
    const inputTokens = usage.input_tokens;
    const outputTokens = usage.output_tokens;

    if (typeof inputTokens === 'number' && typeof outputTokens === 'number') {
      return {
        tokensIn: inputTokens,
        tokensOut: outputTokens,
      };
    }
  }

  return null;
}

/**
 * Estimates token count based on text length
 * Uses approximation of ~4 characters per token
 * 
 * @param text - The text to estimate tokens for
 * @returns Estimated token count
 * 
 * Requirements: 7.3 - Estimate tokens based on text length
 */
export function estimateTokens(text: string): number {
  if (!text || text.length === 0) {
    return 0;
  }
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/**
 * Estimates token usage for a request/response pair
 * 
 * @param requestMessages - Array of message objects with content
 * @param responseContent - The response content string
 * @returns Estimated token counts
 * 
 * Requirements: 7.3 - Estimate token counts based on request/response size
 */
export function estimateUsage(
  requestMessages: Array<{ content: string }>,
  responseContent: string
): { tokensIn: number; tokensOut: number } {
  const inputText = requestMessages.map(m => m.content).join(' ');
  return {
    tokensIn: estimateTokens(inputText),
    tokensOut: estimateTokens(responseContent),
  };
}


/**
 * Gets usage summary for a project within a date range
 * 
 * @param projectId - The project to get usage for
 * @param startDate - Start of the date range
 * @param endDate - End of the date range
 * @returns Aggregated usage summary
 * 
 * Requirements: 7.4 - Aggregate usage by project and time period
 */
export async function getProjectUsage(
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<UsageSummary> {
  const result = await query<{
    total_tokens_in: string;
    total_tokens_out: string;
    total_cost: string;
    request_count: string;
  }>(
    `SELECT 
      COALESCE(SUM(tokens_in), 0) as total_tokens_in,
      COALESCE(SUM(tokens_out), 0) as total_tokens_out,
      COALESCE(SUM(cost), 0) as total_cost,
      COUNT(*) as request_count
    FROM usage_logs
    WHERE project_id = $1 AND created_at >= $2 AND created_at <= $3`,
    [projectId, startDate, endDate]
  );

  const row = result.rows[0];
  return {
    totalTokensIn: parseInt(row.total_tokens_in, 10),
    totalTokensOut: parseInt(row.total_tokens_out, 10),
    totalCost: parseFloat(row.total_cost),
    requestCount: parseInt(row.request_count, 10),
  };
}

/**
 * Gets usage breakdown by provider for a team within a date range
 * 
 * @param teamId - The team to get usage for
 * @param startDate - Start of the date range
 * @param endDate - End of the date range
 * @returns Array of usage per provider
 * 
 * Requirements: 7.4 - Aggregate usage by provider and time period
 */
export async function getUsageByProvider(
  teamId: string,
  startDate: Date,
  endDate: Date
): Promise<ProviderUsage[]> {
  const result = await query<{
    provider_id: string;
    tokens_in: string;
    tokens_out: string;
    cost: string;
    request_count: string;
  }>(
    `SELECT 
      ul.provider_id,
      COALESCE(SUM(ul.tokens_in), 0) as tokens_in,
      COALESCE(SUM(ul.tokens_out), 0) as tokens_out,
      COALESCE(SUM(ul.cost), 0) as cost,
      COUNT(*) as request_count
    FROM usage_logs ul
    JOIN projects p ON ul.project_id = p.id
    WHERE p.team_id = $1 AND ul.created_at >= $2 AND ul.created_at <= $3
    GROUP BY ul.provider_id`,
    [teamId, startDate, endDate]
  );

  return result.rows.map(row => ({
    providerId: row.provider_id,
    tokensIn: parseInt(row.tokens_in, 10),
    tokensOut: parseInt(row.tokens_out, 10),
    cost: parseFloat(row.cost),
    requestCount: parseInt(row.request_count, 10),
  }));
}

/**
 * Aggregates usage logs by summing token counts and costs
 * 
 * @param logs - Array of usage log entries
 * @returns Aggregated totals
 * 
 * Requirements: 7.4 - Aggregate usage totals
 */
export function aggregateUsageLogs(logs: UsageLogEntry[]): UsageSummary {
  return logs.reduce(
    (acc, log) => ({
      totalTokensIn: acc.totalTokensIn + log.tokensIn,
      totalTokensOut: acc.totalTokensOut + log.tokensOut,
      totalCost: acc.totalCost + log.cost,
      requestCount: acc.requestCount + 1,
    }),
    { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, requestCount: 0 }
  );
}


/**
 * Calculates cost based on token counts and provider pricing
 * 
 * @param tokensIn - Number of input tokens
 * @param tokensOut - Number of output tokens
 * @param pricing - Provider pricing rates
 * @returns Calculated cost
 * 
 * Requirements: 7.5 - Multiply token counts by configured provider pricing rates
 */
export function calculateCost(
  tokensIn: number,
  tokensOut: number,
  pricing: ProviderPricing
): number {
  const inputCost = tokensIn * pricing.inputPricePerToken;
  const outputCost = tokensOut * pricing.outputPricePerToken;
  return inputCost + outputCost;
}

/**
 * Gets usage logs with optional filters
 * 
 * @param filters - Optional filters for the query
 * @returns Array of usage log entries
 */
export async function getUsageLogs(filters: UsageFilters = {}): Promise<UsageLogEntry[]> {
  const conditions: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (filters.projectId) {
    conditions.push(`project_id = $${paramIndex++}`);
    params.push(filters.projectId);
  }

  if (filters.providerId) {
    conditions.push(`provider_id = $${paramIndex++}`);
    params.push(filters.providerId);
  }

  if (filters.modelId) {
    conditions.push(`model_id = $${paramIndex++}`);
    params.push(filters.modelId);
  }

  if (filters.startDate) {
    conditions.push(`created_at >= $${paramIndex++}`);
    params.push(filters.startDate);
  }

  if (filters.endDate) {
    conditions.push(`created_at <= $${paramIndex++}`);
    params.push(filters.endDate);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

  const result = await query<UsageLogRow>(
    `SELECT * FROM usage_logs ${whereClause} ORDER BY created_at DESC`,
    params
  );

  return result.rows.map(mapRowToEntry);
}

/**
 * Escapes a CSV value by wrapping in quotes if it contains special characters
 * 
 * @param value - The value to escape
 * @returns Escaped CSV value
 */
function escapeCSVValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/**
 * Generates CSV content from usage log entries
 * 
 * This is a pure function that can be tested with property-based testing.
 * 
 * @param logs - Array of usage log entries
 * @returns CSV formatted string with headers and data rows
 * 
 * Requirements: 12.4 - Export filtered results to CSV file
 */
export function generateCSV(logs: UsageLogEntry[]): string {
  const headers = [
    'id', 'api_key_id', 'project_id', 'provider_id', 'model_id',
    'tokens_in', 'tokens_out', 'cost', 'latency_ms', 'status_code',
    'error_message', 'created_at'
  ];

  const rows = logs.map(log => [
    log.id?.toString() ?? '',
    log.apiKeyId,
    log.projectId,
    log.providerId,
    log.modelId ?? '',
    log.tokensIn.toString(),
    log.tokensOut.toString(),
    log.cost.toString(),
    log.latencyMs?.toString() ?? '',
    log.statusCode?.toString() ?? '',
    log.errorMessage ?? '',
    log.createdAt.toISOString(),
  ].map(escapeCSVValue));

  return [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
}

/**
 * Parses a CSV string back into an array of records
 * 
 * This is used for round-trip testing of CSV export.
 * Handles quoted values that may contain newlines.
 * 
 * @param csv - CSV formatted string
 * @returns Array of records with header keys
 */
export function parseCSV(csv: string): Record<string, string>[] {
  if (csv.length === 0) return [];
  
  // Parse all rows handling quoted values with embedded newlines
  const rows = parseCSVRows(csv);
  if (rows.length < 1) return [];
  
  const headers = rows[0];
  const records: Record<string, string>[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    const values = rows[i];
    const record: Record<string, string> = {};
    headers.forEach((header, index) => {
      record[header] = values[index] ?? '';
    });
    records.push(record);
  }
  
  return records;
}

/**
 * Parses entire CSV content into rows, handling quoted values with embedded newlines
 */
function parseCSVRows(csv: string): string[][] {
  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentValue = '';
  let inQuotes = false;
  
  for (let i = 0; i < csv.length; i++) {
    const char = csv[i];
    
    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < csv.length && csv[i + 1] === '"') {
          // Escaped quote
          currentValue += '"';
          i++;
        } else {
          // End of quoted value
          inQuotes = false;
        }
      } else {
        // Include any character (including newlines) inside quotes
        currentValue += char;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
      } else if (char === ',') {
        currentRow.push(currentValue);
        currentValue = '';
      } else if (char === '\n') {
        currentRow.push(currentValue);
        currentValue = '';
        rows.push(currentRow);
        currentRow = [];
      } else if (char === '\r') {
        // Skip carriage return (handle \r\n)
        continue;
      } else {
        currentValue += char;
      }
    }
  }
  
  // Don't forget the last value and row
  currentRow.push(currentValue);
  if (currentRow.length > 0 && currentRow.some(v => v !== '')) {
    rows.push(currentRow);
  }
  
  return rows;
}

/**
 * Exports usage logs as CSV string
 * 
 * @param filters - Filters for the export
 * @returns CSV formatted string
 */
export async function exportUsageLogs(filters: UsageFilters = {}): Promise<string> {
  const logs = await getUsageLogs(filters);
  return generateCSV(logs);
}

/**
 * Maps a database row to a UsageLogEntry
 */
function mapRowToEntry(row: UsageLogRow): UsageLogEntry {
  return {
    id: row.id,
    apiKeyId: row.api_key_id,
    projectId: row.project_id,
    providerId: row.provider_id,
    modelId: row.model_id,
    tokensIn: row.tokens_in,
    tokensOut: row.tokens_out,
    cost: parseFloat(row.cost),
    latencyMs: row.latency_ms,
    statusCode: row.status_code,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

export type { UsageFilters, ProviderPricing };
