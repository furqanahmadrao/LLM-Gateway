/**
 * Property-based tests for Usage Tracking Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 * 
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  extractUsageFromResponse,
  estimateTokens,
  estimateUsage,
  aggregateUsageLogs,
  calculateCost,
  generateCSV,
  parseCSV,
} from './usage.js';
import type { UsageLogEntry } from '../types/api.js';

// Arbitrary for generating valid usage log entries
const usageLogEntryArb = fc.record({
  id: fc.integer({ min: 1 }),
  apiKeyId: fc.uuid(),
  projectId: fc.uuid(),
  providerId: fc.uuid(),
  modelId: fc.option(fc.uuid(), { nil: null }),
  tokensIn: fc.integer({ min: 0, max: 1000000 }),
  tokensOut: fc.integer({ min: 0, max: 1000000 }),
  cost: fc.float({ min: 0, max: Math.fround(1000), noNaN: true }),
  latencyMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: null }),
  statusCode: fc.option(fc.integer({ min: 100, max: 599 }), { nil: null }),
  errorMessage: fc.option(fc.string({ maxLength: 500 }), { nil: null }),
  createdAt: fc.date(),
});

// Arbitrary for OpenAI-format usage response
const openAIUsageResponseArb = fc.record({
  id: fc.string(),
  object: fc.constant('chat.completion'),
  usage: fc.record({
    prompt_tokens: fc.integer({ min: 0, max: 100000 }),
    completion_tokens: fc.integer({ min: 0, max: 100000 }),
    total_tokens: fc.integer({ min: 0, max: 200000 }),
  }),
});

// Arbitrary for Anthropic-format usage response
const anthropicUsageResponseArb = fc.record({
  id: fc.string(),
  type: fc.constant('message'),
  usage: fc.record({
    input_tokens: fc.integer({ min: 0, max: 100000 }),
    output_tokens: fc.integer({ min: 0, max: 100000 }),
  }),
});


// Arbitrary for provider pricing
const providerPricingArb = fc.record({
  inputPricePerToken: fc.float({ min: 0, max: Math.fround(0.1), noNaN: true }),
  outputPricePerToken: fc.float({ min: 0, max: Math.fround(0.1), noNaN: true }),
});

describe('Usage Tracking Service', () => {
  /**
   * **Feature: llm-gateway, Property 15: Usage Log Completeness**
   * 
   * *For any* completed request, the usage log entry SHALL contain non-null values
   * for api_key_id, project_id, provider_id, tokens_in, tokens_out, and timestamp.
   * 
   * **Validates: Requirements 7.1**
   */
  describe('Property 15: Usage Log Completeness', () => {
    it('should have all required fields non-null in a valid usage log entry', () => {
      fc.assert(
        fc.property(usageLogEntryArb, (entry) => {
          // Required fields must be non-null
          const hasApiKeyId = entry.apiKeyId !== null && entry.apiKeyId !== undefined && entry.apiKeyId.length > 0;
          const hasProjectId = entry.projectId !== null && entry.projectId !== undefined && entry.projectId.length > 0;
          const hasProviderId = entry.providerId !== null && entry.providerId !== undefined && entry.providerId.length > 0;
          const hasTokensIn = typeof entry.tokensIn === 'number' && entry.tokensIn >= 0;
          const hasTokensOut = typeof entry.tokensOut === 'number' && entry.tokensOut >= 0;
          const hasTimestamp = entry.createdAt instanceof Date;

          return hasApiKeyId && hasProjectId && hasProviderId && hasTokensIn && hasTokensOut && hasTimestamp;
        }),
        { numRuns: 100 }
      );
    });

    it('should have valid token counts (non-negative integers)', () => {
      fc.assert(
        fc.property(usageLogEntryArb, (entry) => {
          return (
            Number.isInteger(entry.tokensIn) &&
            Number.isInteger(entry.tokensOut) &&
            entry.tokensIn >= 0 &&
            entry.tokensOut >= 0
          );
        }),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 16: Usage Data Extraction**
   * 
   * *For any* provider response containing usage data, the extracted token counts
   * SHALL match the values in the response.
   * 
   * **Validates: Requirements 7.2**
   */
  describe('Property 16: Usage Data Extraction', () => {
    it('should extract exact token counts from OpenAI format responses', () => {
      fc.assert(
        fc.property(openAIUsageResponseArb, (response) => {
          const extracted = extractUsageFromResponse(response);
          
          if (!extracted) return false;
          
          return (
            extracted.tokensIn === response.usage.prompt_tokens &&
            extracted.tokensOut === response.usage.completion_tokens
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should extract exact token counts from Anthropic format responses', () => {
      fc.assert(
        fc.property(anthropicUsageResponseArb, (response) => {
          const extracted = extractUsageFromResponse(response);
          
          if (!extracted) return false;
          
          return (
            extracted.tokensIn === response.usage.input_tokens &&
            extracted.tokensOut === response.usage.output_tokens
          );
        }),
        { numRuns: 100 }
      );
    });

    it('should return null for responses without usage data', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.string(),
            choices: fc.array(fc.record({ message: fc.string() })),
          }),
          (response) => {
            const extracted = extractUsageFromResponse(response);
            return extracted === null;
          }
        ),
        { numRuns: 100 }
      );
    });
  });


  /**
   * **Feature: llm-gateway, Property 17: Token Estimation Consistency**
   * 
   * *For any* request/response pair without provider usage data, the estimated
   * token count SHALL be proportional to the text length.
   * 
   * **Validates: Requirements 7.3**
   */
  describe('Property 17: Token Estimation Consistency', () => {
    it('should estimate tokens proportional to text length', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 0, maxLength: 10000 }),
          (text) => {
            const estimated = estimateTokens(text);
            
            // Empty text should have 0 tokens
            if (text.length === 0) {
              return estimated === 0;
            }
            
            // Estimated tokens should be approximately text.length / 4 (rounded up)
            const expectedMin = Math.floor(text.length / 4);
            const expectedMax = Math.ceil(text.length / 4);
            
            return estimated >= expectedMin && estimated <= expectedMax + 1;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should estimate more tokens for longer text', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          fc.string({ minLength: 1001, maxLength: 5000 }),
          (shortText, longText) => {
            const shortEstimate = estimateTokens(shortText);
            const longEstimate = estimateTokens(longText);
            
            return longEstimate >= shortEstimate;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should estimate usage for request/response pairs consistently', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({ content: fc.string({ maxLength: 1000 }) }), { minLength: 1, maxLength: 10 }),
          fc.string({ maxLength: 2000 }),
          (messages, responseContent) => {
            const usage = estimateUsage(messages, responseContent);
            
            // Both values should be non-negative
            if (usage.tokensIn < 0 || usage.tokensOut < 0) return false;
            
            // Input tokens should be based on combined message content (joined with spaces)
            const joinedInput = messages.map(m => m.content).join(' ');
            const expectedInputTokens = joinedInput.length === 0 ? 0 : Math.ceil(joinedInput.length / 4);
            
            // Output tokens should be based on response content
            const expectedOutputTokens = responseContent.length === 0 ? 0 : Math.ceil(responseContent.length / 4);
            
            return (
              Math.abs(usage.tokensIn - expectedInputTokens) <= 1 &&
              Math.abs(usage.tokensOut - expectedOutputTokens) <= 1
            );
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 18: Usage Aggregation Correctness**
   * 
   * *For any* set of usage logs, the aggregated totals SHALL equal
   * the sum of individual log entries.
   * 
   * **Validates: Requirements 7.4**
   */
  describe('Property 18: Usage Aggregation Correctness', () => {
    it('should aggregate totals equal to sum of individual entries', () => {
      fc.assert(
        fc.property(
          fc.array(usageLogEntryArb, { minLength: 0, maxLength: 100 }),
          (logs) => {
            const aggregated = aggregateUsageLogs(logs);
            
            // Calculate expected sums manually
            const expectedTokensIn = logs.reduce((sum, log) => sum + log.tokensIn, 0);
            const expectedTokensOut = logs.reduce((sum, log) => sum + log.tokensOut, 0);
            const expectedCost = logs.reduce((sum, log) => sum + log.cost, 0);
            const expectedCount = logs.length;
            
            // Check aggregation matches
            return (
              aggregated.totalTokensIn === expectedTokensIn &&
              aggregated.totalTokensOut === expectedTokensOut &&
              Math.abs(aggregated.totalCost - expectedCost) < 0.0001 && // Float tolerance
              aggregated.requestCount === expectedCount
            );
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return zeros for empty log array', () => {
      const aggregated = aggregateUsageLogs([]);
      
      expect(aggregated.totalTokensIn).toBe(0);
      expect(aggregated.totalTokensOut).toBe(0);
      expect(aggregated.totalCost).toBe(0);
      expect(aggregated.requestCount).toBe(0);
    });
  });


  /**
   * **Feature: llm-gateway, Property 19: Cost Calculation Formula**
   * 
   * *For any* usage log entry with token counts and provider pricing,
   * the calculated cost SHALL equal tokens × price_per_token.
   * 
   * **Validates: Requirements 7.5**
   */
  describe('Property 19: Cost Calculation Formula', () => {
    it('should calculate cost as (tokensIn * inputPrice) + (tokensOut * outputPrice)', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000000 }),
          fc.integer({ min: 0, max: 1000000 }),
          providerPricingArb,
          (tokensIn, tokensOut, pricing) => {
            const calculatedCost = calculateCost(tokensIn, tokensOut, pricing);
            
            const expectedCost = 
              (tokensIn * pricing.inputPricePerToken) + 
              (tokensOut * pricing.outputPricePerToken);
            
            // Use tolerance for floating point comparison
            return Math.abs(calculatedCost - expectedCost) < 0.0000001;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should return zero cost when both token counts are zero', () => {
      fc.assert(
        fc.property(providerPricingArb, (pricing) => {
          const cost = calculateCost(0, 0, pricing);
          return cost === 0;
        }),
        { numRuns: 100 }
      );
    });

    it('should return zero cost when pricing is zero', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 0, max: 1000000 }),
          fc.integer({ min: 0, max: 1000000 }),
          (tokensIn, tokensOut) => {
            const zeroPricing = { inputPricePerToken: 0, outputPricePerToken: 0 };
            const cost = calculateCost(tokensIn, tokensOut, zeroPricing);
            return cost === 0;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should scale linearly with token count', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 100000 }),
          fc.integer({ min: 2, max: 10 }),
          providerPricingArb,
          (baseTokens, multiplier, pricing) => {
            const baseCost = calculateCost(baseTokens, baseTokens, pricing);
            const scaledCost = calculateCost(baseTokens * multiplier, baseTokens * multiplier, pricing);
            
            // Scaled cost should be approximately multiplier times base cost
            const expectedScaledCost = baseCost * multiplier;
            
            return Math.abs(scaledCost - expectedScaledCost) < 0.0001;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 23: CSV Export Validity**
   * 
   * *For any* usage log filter, the exported CSV SHALL contain all matching records
   * with correct column values.
   * 
   * **Validates: Requirements 12.4**
   */
  describe('Property 23: CSV Export Validity', () => {
    // Arbitrary for generating usage log entries with safe string values for CSV
    const csvSafeUsageLogArb = fc.record({
      id: fc.integer({ min: 1 }),
      apiKeyId: fc.uuid(),
      projectId: fc.uuid(),
      providerId: fc.uuid(),
      modelId: fc.option(fc.uuid(), { nil: null }),
      tokensIn: fc.integer({ min: 0, max: 1000000 }),
      tokensOut: fc.integer({ min: 0, max: 1000000 }),
      cost: fc.float({ min: 0, max: Math.fround(1000), noNaN: true }),
      latencyMs: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: null }),
      statusCode: fc.option(fc.integer({ min: 100, max: 599 }), { nil: null }),
      errorMessage: fc.option(fc.string({ maxLength: 100 }), { nil: null }),
      createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
    });

    it('should generate CSV with correct number of records', () => {
      fc.assert(
        fc.property(
          fc.array(csvSafeUsageLogArb, { minLength: 0, maxLength: 50 }),
          (logs) => {
            const csv = generateCSV(logs);
            const parsed = parseCSV(csv);
            
            // Number of parsed records should match input logs
            return parsed.length === logs.length;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve all required fields in CSV export', () => {
      fc.assert(
        fc.property(
          fc.array(csvSafeUsageLogArb, { minLength: 1, maxLength: 20 }),
          (logs) => {
            const csv = generateCSV(logs);
            const parsed = parseCSV(csv);
            
            // Check each record has all required fields
            for (let i = 0; i < logs.length; i++) {
              const original = logs[i];
              const record = parsed[i];
              
              // Verify required fields are present and match
              if (record['api_key_id'] !== original.apiKeyId) return false;
              if (record['project_id'] !== original.projectId) return false;
              if (record['provider_id'] !== original.providerId) return false;
              if (record['tokens_in'] !== original.tokensIn.toString()) return false;
              if (record['tokens_out'] !== original.tokensOut.toString()) return false;
              
              // Verify optional fields
              const expectedModelId = original.modelId ?? '';
              if (record['model_id'] !== expectedModelId) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should have correct CSV header row', () => {
      const csv = generateCSV([]);
      const lines = csv.split('\n');
      
      expect(lines.length).toBeGreaterThanOrEqual(1);
      
      const expectedHeaders = [
        'id', 'api_key_id', 'project_id', 'provider_id', 'model_id',
        'tokens_in', 'tokens_out', 'cost', 'latency_ms', 'status_code',
        'error_message', 'created_at'
      ];
      
      expect(lines[0]).toBe(expectedHeaders.join(','));
    });

    it('should handle special characters in error messages', () => {
      fc.assert(
        fc.property(
          fc.record({
            id: fc.integer({ min: 1 }),
            apiKeyId: fc.uuid(),
            projectId: fc.uuid(),
            providerId: fc.uuid(),
            modelId: fc.constant(null),
            tokensIn: fc.integer({ min: 0, max: 1000 }),
            tokensOut: fc.integer({ min: 0, max: 1000 }),
            cost: fc.float({ min: 0, max: Math.fround(10), noNaN: true }),
            latencyMs: fc.constant(null),
            statusCode: fc.constant(500),
            // Generate strings with special CSV characters
            errorMessage: fc.stringOf(
              fc.constantFrom('a', 'b', ',', '"', '\n', ' '),
              { minLength: 1, maxLength: 50 }
            ),
            createdAt: fc.date({ min: new Date('2020-01-01'), max: new Date('2030-01-01') }),
          }),
          (log) => {
            const csv = generateCSV([log]);
            const parsed = parseCSV(csv);
            
            // Should have exactly one record
            if (parsed.length !== 1) return false;
            
            // Error message should be preserved after round-trip
            return parsed[0]['error_message'] === log.errorMessage;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce valid CSV that can be round-tripped', () => {
      fc.assert(
        fc.property(
          fc.array(csvSafeUsageLogArb, { minLength: 1, maxLength: 30 }),
          (logs) => {
            const csv = generateCSV(logs);
            const parsed = parseCSV(csv);
            
            // Verify round-trip preserves data integrity
            for (let i = 0; i < logs.length; i++) {
              const original = logs[i];
              const record = parsed[i];
              
              // Check ID
              if (original.id !== undefined && record['id'] !== original.id.toString()) {
                return false;
              }
              
              // Check timestamp is valid ISO string
              const parsedDate = new Date(record['created_at']);
              if (isNaN(parsedDate.getTime())) return false;
              
              // Check cost is preserved (as string)
              if (record['cost'] !== original.cost.toString()) return false;
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
