/**
 * Audit Logging Service
 * 
 * Logs credential access events without exposing raw credentials.
 * Provides secure audit trail for compliance and security monitoring.
 * 
 * Requirements: 14.4
 */

import { createLogger, Logger } from './logger.js';

/**
 * Audit event types
 */
export type AuditEventType =
  | 'credential_access'
  | 'credential_create'
  | 'credential_update'
  | 'credential_delete'
  | 'credential_decrypt'
  | 'api_key_create'
  | 'api_key_revoke'
  | 'api_key_validate'
  | 'team_member_add'
  | 'team_member_remove'
  | 'permission_denied';

/**
 * Audit event data
 */
export interface AuditEvent {
  eventType: AuditEventType;
  timestamp: string;
  correlationId: string;
  actor: {
    userId?: string;
    teamId?: string;
    projectId?: string;
    apiKeyId?: string;
  };
  resource: {
    type: string;
    id?: string;
    providerId?: string;
  };
  action: string;
  outcome: 'success' | 'failure';
  metadata?: Record<string, unknown>;
}

/**
 * Mask sensitive data for audit logs
 * Shows only the last 4 characters, replacing the rest with asterisks
 */
export function maskSensitiveData(value: string): string {
  if (!value || value.length <= 4) {
    return '****';
  }
  const visiblePart = value.slice(-4);
  const maskedPart = '*'.repeat(Math.min(value.length - 4, 20));
  return maskedPart + visiblePart;
}


/**
 * Check if a string looks like a credential (API key, token, etc.)
 */
function looksLikeCredential(value: string): boolean {
  // Common patterns for API keys and tokens
  const credentialPatterns = [
    /^sk-[a-zA-Z0-9]+$/,           // OpenAI style
    /^[a-zA-Z0-9]{32,}$/,          // Long alphanumeric strings
    /^Bearer\s+.+$/i,              // Bearer tokens
    /^[a-f0-9]{64}$/i,             // SHA-256 hashes
    /^[a-zA-Z0-9+/=]{40,}$/,       // Base64 encoded
  ];
  
  return credentialPatterns.some(pattern => pattern.test(value));
}

/**
 * Sanitize an object by masking any values that look like credentials
 */
export function sanitizeForAudit(obj: Record<string, unknown>): Record<string, unknown> {
  const sensitiveKeys = [
    'password', 'secret', 'token', 'key', 'apiKey', 'api_key',
    'credential', 'credentials', 'authorization', 'auth',
    'private', 'privateKey', 'private_key', 'accessToken', 'access_token',
    'refreshToken', 'refresh_token', 'bearer', 'apiSecret', 'api_secret',
  ];

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    const lowerKey = key.toLowerCase();
    
    // Check if key suggests sensitive data
    const isSensitiveKey = sensitiveKeys.some(sk => lowerKey.includes(sk.toLowerCase()));
    
    if (typeof value === 'string') {
      if (isSensitiveKey || looksLikeCredential(value)) {
        result[key] = maskSensitiveData(value);
      } else {
        result[key] = value;
      }
    } else if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      result[key] = sanitizeForAudit(value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result;
}

/**
 * Audit logger instance
 */
const auditLogger = createLogger('audit', { component: 'audit' });

/**
 * Storage for captured audit events (used in testing)
 */
let capturedAuditEvents: AuditEvent[] = [];
let captureEnabled = false;

/**
 * Enable audit event capture for testing
 */
export function enableAuditCapture(): void {
  captureEnabled = true;
  capturedAuditEvents = [];
}

/**
 * Disable audit event capture
 */
export function disableAuditCapture(): void {
  captureEnabled = false;
}

/**
 * Get captured audit events
 */
export function getCapturedAuditEvents(): AuditEvent[] {
  return [...capturedAuditEvents];
}

/**
 * Clear captured audit events
 */
export function clearCapturedAuditEvents(): void {
  capturedAuditEvents = [];
}

/**
 * Log an audit event
 */
export function logAuditEvent(event: Omit<AuditEvent, 'timestamp' | 'correlationId'>, correlationId?: string): void {
  const fullEvent: AuditEvent = {
    ...event,
    timestamp: new Date().toISOString(),
    correlationId: correlationId || auditLogger.getCorrelationId(),
  };

  // Sanitize any metadata to ensure no credentials are logged
  if (fullEvent.metadata) {
    fullEvent.metadata = sanitizeForAudit(fullEvent.metadata as Record<string, unknown>);
  }

  if (captureEnabled) {
    capturedAuditEvents.push(fullEvent);
  }

  // Log the audit event
  auditLogger.info(`Audit: ${event.eventType}`, {
    audit: true,
    ...fullEvent,
  });
}

/**
 * Log credential access event
 */
export function logCredentialAccess(
  providerId: string,
  teamId: string,
  action: 'read' | 'decrypt' | 'use',
  outcome: 'success' | 'failure',
  correlationId?: string,
  metadata?: Record<string, unknown>
): void {
  logAuditEvent({
    eventType: action === 'decrypt' ? 'credential_decrypt' : 'credential_access',
    actor: { teamId },
    resource: { type: 'provider_credential', providerId },
    action,
    outcome,
    metadata,
  }, correlationId);
}

/**
 * Log credential modification event
 */
export function logCredentialModification(
  providerId: string,
  teamId: string,
  action: 'create' | 'update' | 'delete',
  outcome: 'success' | 'failure',
  correlationId?: string,
  metadata?: Record<string, unknown>
): void {
  const eventType = action === 'create' ? 'credential_create' :
                    action === 'update' ? 'credential_update' : 'credential_delete';
  
  logAuditEvent({
    eventType,
    actor: { teamId },
    resource: { type: 'provider_credential', providerId },
    action,
    outcome,
    metadata,
  }, correlationId);
}

/**
 * Log API key event
 */
export function logApiKeyEvent(
  apiKeyId: string,
  projectId: string,
  action: 'create' | 'revoke' | 'validate',
  outcome: 'success' | 'failure',
  correlationId?: string,
  metadata?: Record<string, unknown>
): void {
  const eventType = action === 'create' ? 'api_key_create' :
                    action === 'revoke' ? 'api_key_revoke' : 'api_key_validate';
  
  logAuditEvent({
    eventType,
    actor: { projectId, apiKeyId: action !== 'create' ? apiKeyId : undefined },
    resource: { type: 'api_key', id: apiKeyId },
    action,
    outcome,
    metadata,
  }, correlationId);
}

/**
 * Check if an audit event contains raw credentials
 */
export function auditEventContainsCredentials(event: AuditEvent): boolean {
  const checkValue = (value: unknown): boolean => {
    if (typeof value === 'string') {
      return looksLikeCredential(value) && !value.includes('*');
    }
    if (typeof value === 'object' && value !== null) {
      return Object.values(value).some(checkValue);
    }
    return false;
  };

  return checkValue(event.metadata);
}
