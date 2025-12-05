/**
 * Logger Service Tests
 * 
 * Property-based tests for structured JSON logging with correlation IDs.
 * 
 * **Feature: llm-gateway, Property 30: Structured Log Format**
 * **Validates: Requirements 16.2**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  Logger,
  createLogger,
  generateCorrelationId,
  enableLogCapture,
  disableLogCapture,
  getCapturedLogs,
  clearCapturedLogs,
  isValidLogEntry,
  parseLogLine,
  configureLogger,
  LogEntry,
} from './logger.js';

describe('Logger Service', () => {
  beforeEach(() => {
    enableLogCapture();
    clearCapturedLogs();
    configureLogger({ level: 'debug' });
  });

  afterEach(() => {
    disableLogCapture();
  });

  describe('generateCorrelationId', () => {
    it('should generate unique UUIDs', () => {
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateCorrelationId());
      }
      expect(ids.size).toBe(100);
    });

    it('should generate valid UUID format', () => {
      const id = generateCorrelationId();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
    });
  });

  describe('Logger class', () => {
    it('should create logger with correlation ID', () => {
      const logger = createLogger('test-correlation-id');
      expect(logger.getCorrelationId()).toBe('test-correlation-id');
    });

    it('should auto-generate correlation ID if not provided', () => {
      const logger = createLogger();
      expect(logger.getCorrelationId()).toBeTruthy();
      expect(logger.getCorrelationId().length).toBeGreaterThan(0);
    });

    it('should log at all levels', () => {
      const logger = createLogger('test-id');
      
      logger.debug('debug message');
      logger.info('info message');
      logger.warn('warn message');
      logger.error('error message');

      const logs = getCapturedLogs();
      expect(logs).toHaveLength(4);
      expect(logs.map(l => l.level)).toEqual(['debug', 'info', 'warn', 'error']);
    });

    it('should include extra fields in logs', () => {
      const logger = createLogger('test-id');
      logger.info('test message', { userId: '123', action: 'login' });

      const logs = getCapturedLogs();
      expect(logs[0].userId).toBe('123');
      expect(logs[0].action).toBe('login');
    });

    it('should create child logger with same correlation ID', () => {
      const parent = createLogger('parent-id');
      const child = parent.child({ component: 'child' });

      expect(child.getCorrelationId()).toBe('parent-id');
      
      child.info('child message');
      const logs = getCapturedLogs();
      expect(logs[0].correlationId).toBe('parent-id');
      expect(logs[0].component).toBe('child');
    });
  });


  describe('isValidLogEntry', () => {
    it('should validate correct log entries', () => {
      const validEntry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'test',
        correlationId: 'abc-123',
      };
      expect(isValidLogEntry(validEntry)).toBe(true);
    });

    it('should reject invalid entries', () => {
      expect(isValidLogEntry(null)).toBe(false);
      expect(isValidLogEntry({})).toBe(false);
      expect(isValidLogEntry({ timestamp: '2024-01-01' })).toBe(false);
      expect(isValidLogEntry({ timestamp: '2024-01-01', level: 'info' })).toBe(false);
    });
  });

  describe('parseLogLine', () => {
    it('should parse valid JSON log lines', () => {
      const entry: LogEntry = {
        timestamp: new Date().toISOString(),
        level: 'info',
        message: 'test',
        correlationId: 'abc-123',
      };
      const line = JSON.stringify(entry);
      const parsed = parseLogLine(line);
      expect(parsed).toEqual(entry);
    });

    it('should return null for invalid JSON', () => {
      expect(parseLogLine('not json')).toBeNull();
      expect(parseLogLine('{invalid}')).toBeNull();
    });

    it('should return null for valid JSON but invalid log entry', () => {
      expect(parseLogLine('{"foo": "bar"}')).toBeNull();
    });
  });

  /**
   * **Feature: llm-gateway, Property 30: Structured Log Format**
   * **Validates: Requirements 16.2**
   * 
   * For any processed request, the emitted log SHALL be valid JSON
   * containing a correlation_id field.
   */
  describe('Property 30: Structured Log Format', () => {
    it('should emit valid JSON logs with correlation ID for any message', () => {
      fc.assert(
        fc.property(
          fc.record({
            correlationId: fc.uuid(),
            message: fc.string({ minLength: 1, maxLength: 200 }),
            level: fc.constantFrom('debug', 'info', 'warn', 'error') as fc.Arbitrary<'debug' | 'info' | 'warn' | 'error'>,
          }),
          ({ correlationId, message, level }) => {
            clearCapturedLogs();

            const logger = createLogger(correlationId);
            logger[level](message);

            const logs = getCapturedLogs();
            expect(logs).toHaveLength(1);

            const log = logs[0];
            
            // Verify it's a valid log entry
            expect(isValidLogEntry(log)).toBe(true);
            
            // Verify correlation ID is present and correct
            expect(log.correlationId).toBe(correlationId);
            expect(log.correlationId.length).toBeGreaterThan(0);
            
            // Verify required fields
            expect(log.timestamp).toBeTruthy();
            expect(log.level).toBe(level);
            expect(log.message).toBe(message);
            
            // Verify timestamp is valid ISO format
            expect(() => new Date(log.timestamp)).not.toThrow();
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve correlation ID across all log calls in a request', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.array(
            fc.record({
              message: fc.string({ minLength: 1, maxLength: 100 }),
              level: fc.constantFrom('debug', 'info', 'warn', 'error') as fc.Arbitrary<'debug' | 'info' | 'warn' | 'error'>,
            }),
            { minLength: 1, maxLength: 10 }
          ),
          (correlationId, logCalls) => {
            clearCapturedLogs();

            const logger = createLogger(correlationId);
            
            for (const call of logCalls) {
              logger[call.level](call.message);
            }

            const logs = getCapturedLogs();
            expect(logs).toHaveLength(logCalls.length);

            // All logs should have the same correlation ID
            for (const log of logs) {
              expect(log.correlationId).toBe(correlationId);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should include extra context in all logs', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.record({
            method: fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
            path: fc.stringMatching(/^\/[a-z0-9\/]*$/),
            statusCode: fc.integer({ min: 200, max: 599 }),
          }),
          (correlationId, context) => {
            clearCapturedLogs();

            const logger = createLogger(correlationId, context);
            logger.info('Request processed');

            const logs = getCapturedLogs();
            expect(logs).toHaveLength(1);

            const log = logs[0];
            expect(log.correlationId).toBe(correlationId);
            expect(log.method).toBe(context.method);
            expect(log.path).toBe(context.path);
            expect(log.statusCode).toBe(context.statusCode);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce parseable JSON for any log entry', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.string({ minLength: 1, maxLength: 500 }),
          fc.dictionary(
            fc.stringMatching(/^[a-zA-Z][a-zA-Z0-9_]*$/),
            fc.oneof(
              fc.string(),
              fc.integer(),
              fc.boolean()
            ),
            { minKeys: 0, maxKeys: 5 }
          ),
          (correlationId, message, extra) => {
            clearCapturedLogs();

            const logger = createLogger(correlationId);
            logger.info(message, extra);

            const logs = getCapturedLogs();
            expect(logs).toHaveLength(1);

            // Verify the log can be serialized and parsed back
            const serialized = JSON.stringify(logs[0]);
            const parsed = JSON.parse(serialized);
            
            expect(parsed.correlationId).toBe(correlationId);
            expect(parsed.message).toBe(message);
            
            // Verify extra fields are preserved
            for (const [key, value] of Object.entries(extra)) {
              expect(parsed[key]).toBe(value);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should log request start and end with correlation ID', () => {
      fc.assert(
        fc.property(
          fc.uuid(),
          fc.constantFrom('GET', 'POST', 'PUT', 'DELETE'),
          fc.stringMatching(/^\/[a-z0-9\/]*$/),
          fc.integer({ min: 200, max: 599 }),
          fc.integer({ min: 1, max: 10000 }),
          (correlationId, method, path, statusCode, durationMs) => {
            clearCapturedLogs();

            const logger = createLogger(correlationId);
            logger.logRequestStart(method, path);
            logger.logRequestEnd(method, path, statusCode, durationMs);

            const logs = getCapturedLogs();
            expect(logs).toHaveLength(2);

            // Both logs should have correlation ID
            expect(logs[0].correlationId).toBe(correlationId);
            expect(logs[1].correlationId).toBe(correlationId);

            // Request start log
            expect(logs[0].message).toBe('Request started');
            expect(logs[0].method).toBe(method);
            expect(logs[0].path).toBe(path);

            // Request end log
            expect(logs[1].message).toBe('Request completed');
            expect(logs[1].method).toBe(method);
            expect(logs[1].path).toBe(path);
            expect(logs[1].statusCode).toBe(statusCode);
            expect(logs[1].durationMs).toBe(durationMs);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
