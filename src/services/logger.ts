/**
 * Structured JSON Logger
 * 
 * Provides structured logging with correlation IDs for request tracing.
 * All logs are emitted as valid JSON for easy parsing and aggregation.
 * 
 * Requirements: 16.2
 */

import { randomUUID } from 'crypto';

/**
 * Log levels in order of severity
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/**
 * Structured log entry
 */
export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  correlationId: string;
  [key: string]: unknown;
}

/**
 * Logger configuration
 */
export interface LoggerConfig {
  level: LogLevel;
  pretty: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

/**
 * Default configuration
 */
let config: LoggerConfig = {
  level: (process.env.LOG_LEVEL as LogLevel) || 'info',
  pretty: process.env.NODE_ENV === 'development',
};

/**
 * Storage for captured logs (used in testing)
 */
let capturedLogs: LogEntry[] = [];
let captureEnabled = false;

/**
 * Configure the logger
 */
export function configureLogger(newConfig: Partial<LoggerConfig>): void {
  config = { ...config, ...newConfig };
}


/**
 * Generate a new correlation ID
 */
export function generateCorrelationId(): string {
  return randomUUID();
}

/**
 * Check if a log level should be output
 */
function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[config.level];
}

/**
 * Format and output a log entry
 */
function outputLog(entry: LogEntry): void {
  if (captureEnabled) {
    capturedLogs.push(entry);
  }

  const output = config.pretty
    ? JSON.stringify(entry, null, 2)
    : JSON.stringify(entry);

  switch (entry.level) {
    case 'error':
      console.error(output);
      break;
    case 'warn':
      console.warn(output);
      break;
    default:
      console.log(output);
  }
}

/**
 * Create a log entry with common fields
 */
function createLogEntry(
  level: LogLevel,
  message: string,
  correlationId: string,
  extra: Record<string, unknown> = {}
): LogEntry {
  return {
    timestamp: new Date().toISOString(),
    level,
    message,
    correlationId,
    ...extra,
  };
}

/**
 * Logger class for request-scoped logging
 */
export class Logger {
  private correlationId: string;
  private context: Record<string, unknown>;

  constructor(correlationId?: string, context: Record<string, unknown> = {}) {
    this.correlationId = correlationId || generateCorrelationId();
    this.context = context;
  }

  /**
   * Get the correlation ID
   */
  getCorrelationId(): string {
    return this.correlationId;
  }

  /**
   * Add context to all subsequent logs
   */
  withContext(context: Record<string, unknown>): Logger {
    return new Logger(this.correlationId, { ...this.context, ...context });
  }

  /**
   * Create a child logger with the same correlation ID
   */
  child(context: Record<string, unknown> = {}): Logger {
    return new Logger(this.correlationId, { ...this.context, ...context });
  }

  /**
   * Log at debug level
   */
  debug(message: string, extra: Record<string, unknown> = {}): void {
    if (shouldLog('debug')) {
      outputLog(createLogEntry('debug', message, this.correlationId, { ...this.context, ...extra }));
    }
  }

  /**
   * Log at info level
   */
  info(message: string, extra: Record<string, unknown> = {}): void {
    if (shouldLog('info')) {
      outputLog(createLogEntry('info', message, this.correlationId, { ...this.context, ...extra }));
    }
  }

  /**
   * Log at warn level
   */
  warn(message: string, extra: Record<string, unknown> = {}): void {
    if (shouldLog('warn')) {
      outputLog(createLogEntry('warn', message, this.correlationId, { ...this.context, ...extra }));
    }
  }

  /**
   * Log at error level
   */
  error(message: string, extra: Record<string, unknown> = {}): void {
    if (shouldLog('error')) {
      outputLog(createLogEntry('error', message, this.correlationId, { ...this.context, ...extra }));
    }
  }

  /**
   * Log a request start
   */
  logRequestStart(method: string, path: string, extra: Record<string, unknown> = {}): void {
    this.info('Request started', {
      method,
      path,
      ...extra,
    });
  }

  /**
   * Log a request completion
   */
  logRequestEnd(
    method: string,
    path: string,
    statusCode: number,
    durationMs: number,
    extra: Record<string, unknown> = {}
  ): void {
    const level: LogLevel = statusCode >= 500 ? 'error' : statusCode >= 400 ? 'warn' : 'info';
    
    if (shouldLog(level)) {
      outputLog(createLogEntry(level, 'Request completed', this.correlationId, {
        ...this.context,
        method,
        path,
        statusCode,
        durationMs,
        ...extra,
      }));
    }
  }
}

/**
 * Create a new logger instance
 */
export function createLogger(correlationId?: string, context: Record<string, unknown> = {}): Logger {
  return new Logger(correlationId, context);
}

/**
 * Default logger instance (for non-request-scoped logging)
 */
export const defaultLogger = new Logger('system');

/**
 * Enable log capture for testing
 */
export function enableLogCapture(): void {
  captureEnabled = true;
  capturedLogs = [];
}

/**
 * Disable log capture
 */
export function disableLogCapture(): void {
  captureEnabled = false;
}

/**
 * Get captured logs
 */
export function getCapturedLogs(): LogEntry[] {
  return [...capturedLogs];
}

/**
 * Clear captured logs
 */
export function clearCapturedLogs(): void {
  capturedLogs = [];
}

/**
 * Validate that a log entry is valid JSON with required fields
 */
export function isValidLogEntry(entry: unknown): entry is LogEntry {
  if (typeof entry !== 'object' || entry === null) {
    return false;
  }

  const obj = entry as Record<string, unknown>;
  
  return (
    typeof obj.timestamp === 'string' &&
    typeof obj.level === 'string' &&
    ['debug', 'info', 'warn', 'error'].includes(obj.level as string) &&
    typeof obj.message === 'string' &&
    typeof obj.correlationId === 'string' &&
    obj.correlationId.length > 0
  );
}

/**
 * Parse a JSON log line and validate it
 */
export function parseLogLine(line: string): LogEntry | null {
  try {
    const parsed = JSON.parse(line);
    if (isValidLogEntry(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}
