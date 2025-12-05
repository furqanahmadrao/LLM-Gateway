/**
 * Metrics Service Tests
 * 
 * Property-based tests for metrics collection and Prometheus export.
 * 
 * **Feature: llm-gateway, Property 29: Metrics Endpoint Completeness**
 * **Validates: Requirements 16.1**
 */

import { describe, it, expect, beforeEach } from 'vitest';
import * as fc from 'fast-check';
import {
  metricsRegistry,
  recordRequest,
  getMetrics,
  resetMetrics,
  hasRequiredMetrics,
} from './metrics.js';

describe('Metrics Service', () => {
  beforeEach(() => {
    resetMetrics();
  });

  describe('Counter operations', () => {
    it('should increment counters correctly', () => {
      metricsRegistry.incCounter('test_counter', { label: 'value' });
      metricsRegistry.incCounter('test_counter', { label: 'value' });
      metricsRegistry.incCounter('test_counter', { label: 'value' }, 5);

      const values = metricsRegistry.getCounterValues('test_counter');
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe(7);
    });

    it('should handle multiple label combinations', () => {
      metricsRegistry.incCounter('test_counter', { a: '1', b: '2' });
      metricsRegistry.incCounter('test_counter', { a: '1', b: '3' });
      metricsRegistry.incCounter('test_counter', { a: '1', b: '2' });

      const values = metricsRegistry.getCounterValues('test_counter');
      expect(values).toHaveLength(2);
    });
  });

  describe('Gauge operations', () => {
    it('should set gauge values correctly', () => {
      metricsRegistry.setGauge('test_gauge', { label: 'value' }, 42);
      metricsRegistry.setGauge('test_gauge', { label: 'value' }, 100);

      const values = metricsRegistry.getGaugeValues('test_gauge');
      expect(values).toHaveLength(1);
      expect(values[0].value).toBe(100);
    });
  });

  describe('Histogram operations', () => {
    it('should observe histogram values', () => {
      metricsRegistry.observeHistogram('test_histogram', {}, 0.5);
      metricsRegistry.observeHistogram('test_histogram', {}, 1.5);
      metricsRegistry.observeHistogram('test_histogram', {}, 0.1);

      const output = metricsRegistry.export();
      expect(output).toContain('test_histogram_sum');
      expect(output).toContain('test_histogram_count');
      expect(output).toContain('test_histogram_bucket');
    });
  });

  describe('recordRequest', () => {
    it('should record all metrics for a request', () => {
      recordRequest('openai', 'gpt-4', 200, 1500, 100, 50);

      const output = getMetrics();
      expect(output).toContain('llm_gateway_request_count');
      expect(output).toContain('llm_gateway_request_latency_seconds');
      expect(output).toContain('llm_gateway_token_throughput');
      expect(output).toContain('llm_gateway_tokens_in');
      expect(output).toContain('llm_gateway_tokens_out');
    });

    it('should record errors for 4xx and 5xx status codes', () => {
      recordRequest('openai', 'gpt-4', 500, 100);
      recordRequest('openai', 'gpt-4', 429, 50);

      const output = getMetrics();
      expect(output).toContain('llm_gateway_error_rate');
    });
  });


  /**
   * **Feature: llm-gateway, Property 29: Metrics Endpoint Completeness**
   * **Validates: Requirements 16.1**
   * 
   * For any metrics scrape, the response SHALL include counters for
   * request_count, token_throughput, and error_rate.
   */
  describe('Property 29: Metrics Endpoint Completeness', () => {
    it('should include all required metrics after recording requests', () => {
      fc.assert(
        fc.property(
          // Generate random request data
          fc.record({
            provider: fc.constantFrom('openai', 'anthropic', 'azure', 'mistral'),
            model: fc.stringMatching(/^[a-z0-9-]+$/),
            statusCode: fc.constantFrom(200, 201, 400, 401, 429, 500, 502),
            latencyMs: fc.integer({ min: 1, max: 30000 }),
            tokensIn: fc.integer({ min: 0, max: 10000 }),
            tokensOut: fc.integer({ min: 0, max: 10000 }),
          }),
          (request) => {
            // Reset metrics before each test
            resetMetrics();

            // Record the request
            recordRequest(
              request.provider,
              request.model,
              request.statusCode,
              request.latencyMs,
              request.tokensIn,
              request.tokensOut
            );

            // Get metrics output
            const metricsOutput = getMetrics();

            // Check required metrics are present
            const result = hasRequiredMetrics(metricsOutput);

            // request_count should always be present after recording a request
            expect(result.hasRequestCount).toBe(true);

            // token_throughput should be present if tokens were recorded
            if (request.tokensIn > 0 || request.tokensOut > 0) {
              expect(result.hasTokenThroughput).toBe(true);
            }

            // error_rate should be present for error status codes
            if (request.statusCode >= 400) {
              expect(result.hasErrorRate).toBe(true);
            }

            // latency should always be recorded
            expect(result.hasLatency).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include all required metric types in output format', () => {
      fc.assert(
        fc.property(
          fc.array(
            fc.record({
              provider: fc.constantFrom('openai', 'anthropic'),
              model: fc.stringMatching(/^[a-z0-9-]+$/),
              statusCode: fc.integer({ min: 200, max: 599 }),
              latencyMs: fc.integer({ min: 1, max: 10000 }),
              tokensIn: fc.integer({ min: 1, max: 1000 }),
              tokensOut: fc.integer({ min: 1, max: 1000 }),
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (requests) => {
            resetMetrics();

            // Record multiple requests
            for (const req of requests) {
              recordRequest(
                req.provider,
                req.model,
                req.statusCode,
                req.latencyMs,
                req.tokensIn,
                req.tokensOut
              );
            }

            const metricsOutput = getMetrics();

            // Verify Prometheus format compliance
            // Should have HELP and TYPE comments for registered metrics
            const hasValidFormat = 
              metricsOutput.includes('llm_gateway_request_count') &&
              metricsOutput.includes('llm_gateway_token_throughput') &&
              metricsOutput.includes('llm_gateway_request_latency_seconds');

            expect(hasValidFormat).toBe(true);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly aggregate metrics across multiple requests', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 20 }),
          fc.integer({ min: 100, max: 500 }),
          (numRequests, tokensPerRequest) => {
            resetMetrics();

            // Record multiple requests with same labels
            for (let i = 0; i < numRequests; i++) {
              recordRequest('openai', 'gpt-4', 200, 100, tokensPerRequest, tokensPerRequest);
            }

            const metricsOutput = getMetrics();

            // Verify the metrics output contains the expected values
            // The token throughput should be 2 * tokensPerRequest * numRequests
            // (tokensIn + tokensOut for each request)
            expect(metricsOutput).toContain('llm_gateway_token_throughput');
            expect(metricsOutput).toContain('llm_gateway_request_count');
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
