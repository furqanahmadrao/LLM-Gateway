/**
 * Host Header Validation Middleware
 * 
 * Validates the Host header against the configured domain.
 * Supports strict and permissive modes.
 * 
 * Requirements: 8.2 - Validate Host header for incoming requests
 */

import { Request, Response, NextFunction } from 'express';
import { getConfiguredHostname, hasCustomDomain, getBaseUrlConfig } from '../services/baseUrl.js';

export type HostValidationMode = 'strict' | 'permissive';

/**
 * Gets the host validation mode from environment
 */
export function getHostValidationMode(): HostValidationMode {
  const mode = process.env.HOST_VALIDATION_MODE?.toLowerCase();
  if (mode === 'strict') {
    return 'strict';
  }
  return 'permissive'; // Default to permissive
}

/**
 * Extracts the hostname from a Host header value
 * Handles both "hostname" and "hostname:port" formats
 */
export function extractHostname(hostHeader: string): string {
  // Remove port if present
  const colonIndex = hostHeader.lastIndexOf(':');
  if (colonIndex > 0) {
    // Check if this is an IPv6 address (contains multiple colons)
    const beforeColon = hostHeader.substring(0, colonIndex);
    if (!beforeColon.includes(':')) {
      // Not IPv6, so this is hostname:port format
      return beforeColon;
    }
  }
  return hostHeader;
}

/**
 * Validates if the Host header matches the configured hostname
 * 
 * @param hostHeader - The Host header value from the request
 * @param configuredHostname - The configured hostname to validate against
 * @returns true if valid, false otherwise
 */
export function isValidHost(hostHeader: string | undefined, configuredHostname: string | null): boolean {
  // If no custom domain is configured, all hosts are valid
  if (!configuredHostname) {
    return true;
  }
  
  // If no Host header provided, invalid
  if (!hostHeader) {
    return false;
  }
  
  const requestHostname = extractHostname(hostHeader);
  
  // Case-insensitive comparison
  return requestHostname.toLowerCase() === configuredHostname.toLowerCase();
}

/**
 * Host header validation middleware
 * 
 * Compares the Host header against the configured domain.
 * In strict mode, rejects requests with mismatched Host headers.
 * In permissive mode, logs a warning but allows the request.
 * 
 * Requirements: 8.2 - Validate Host header for incoming requests
 */
export function hostValidationMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  // Skip validation if no custom domain is configured
  if (!hasCustomDomain()) {
    next();
    return;
  }
  
  const configuredHostname = getConfiguredHostname();
  const hostHeader = req.headers.host;
  
  if (!isValidHost(hostHeader, configuredHostname)) {
    const mode = getHostValidationMode();
    const config = getBaseUrlConfig();
    
    if (mode === 'strict') {
      res.status(421).json({
        error: {
          message: `Invalid Host header. Expected: ${configuredHostname}`,
          type: 'misdirected_request',
          code: 'invalid_host',
        },
      });
      return;
    }
    
    // Permissive mode - log warning and continue
    console.warn(
      `Host header mismatch: received "${hostHeader}", expected "${configuredHostname}". ` +
      `Request allowed in permissive mode. Set HOST_VALIDATION_MODE=strict to reject.`
    );
  }
  
  next();
}

/**
 * Creates a host validation middleware with custom configuration
 * Useful for testing or custom setups
 * 
 * @param options - Configuration options
 */
export function createHostValidationMiddleware(options: {
  hostname: string | null;
  mode: HostValidationMode;
}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!options.hostname) {
      next();
      return;
    }
    
    const hostHeader = req.headers.host;
    
    if (!isValidHost(hostHeader, options.hostname)) {
      if (options.mode === 'strict') {
        res.status(421).json({
          error: {
            message: `Invalid Host header. Expected: ${options.hostname}`,
            type: 'misdirected_request',
            code: 'invalid_host',
          },
        });
        return;
      }
      
      console.warn(
        `Host header mismatch: received "${hostHeader}", expected "${options.hostname}".`
      );
    }
    
    next();
  };
}
