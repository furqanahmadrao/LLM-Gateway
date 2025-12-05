/**
 * Logging Middleware
 * 
 * Adds correlation IDs to requests and provides structured JSON logging.
 * 
 * Requirements: 16.2
 */

import { Request, Response, NextFunction } from 'express';
import { createLogger, Logger, generateCorrelationId } from '../services/logger.js';

// Extend Express Request to include logger
declare global {
  namespace Express {
    interface Request {
      logger?: Logger;
      correlationId?: string;
    }
  }
}

/**
 * Correlation ID header name
 */
export const CORRELATION_ID_HEADER = 'X-Correlation-ID';

/**
 * Logging middleware that adds correlation IDs and structured logging to requests
 * 
 * - Extracts or generates correlation ID
 * - Creates request-scoped logger
 * - Logs request start and completion
 * - Adds correlation ID to response headers
 * 
 * Requirements: 16.2
 */
export function loggingMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const startTime = Date.now();

  // Extract or generate correlation ID
  const correlationId = 
    (req.headers[CORRELATION_ID_HEADER.toLowerCase()] as string) ||
    generateCorrelationId();

  // Create request-scoped logger
  const logger = createLogger(correlationId, {
    method: req.method,
    path: req.path,
    userAgent: req.headers['user-agent'],
    ip: req.ip || req.socket.remoteAddress,
  });

  // Attach to request
  req.logger = logger;
  req.correlationId = correlationId;

  // Add correlation ID to response headers
  res.setHeader(CORRELATION_ID_HEADER, correlationId);

  // Log request start
  logger.logRequestStart(req.method, req.path, {
    query: Object.keys(req.query).length > 0 ? req.query : undefined,
  });

  // Capture response finish
  res.on('finish', () => {
    const durationMs = Date.now() - startTime;
    logger.logRequestEnd(req.method, req.path, res.statusCode, durationMs, {
      contentLength: res.get('Content-Length'),
    });
  });

  next();
}

/**
 * Get logger from request or create a default one
 */
export function getRequestLogger(req: Request): Logger {
  return req.logger || createLogger();
}
