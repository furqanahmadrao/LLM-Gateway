/**
 * Audit Logging Service Tests
 * 
 * Property-based tests for audit logging credential safety.
 * 
 * **Feature: llm-gateway, Property 25: Audit Log Credential Safety**
 * **Validates: Requirements 14.4**
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import {
  maskSensitiveData,
  sanitizeForAudit,
  logAuditEvent,
  logCredentialAccess,
  logCredentialModification,
  enableAuditCapture,
  disableAuditCapture,
  getCapturedAuditEvents,
  clearCapturedAuditEvents,
  auditEventContainsCredentials,
} from './audit.js';

describe('Audit Logging Service', () => {
  beforeEach(() => {
    enableAuditCapture();
    clearCapturedAuditEvents();
  });

  afterEach(() => {
    disableAuditCapture();
  });

  describe('maskSensitiveData', () => {
    it('should mask all but last 4 characters', () => {
      // 'sk-1234567890abcdef' has 18 chars, so 14 should be masked (18-4=14)
      // But implementation caps at 20 asterisks max
      const masked = maskSensitiveData('sk-1234567890abcdef');
      expect(masked.endsWith('cdef')).toBe(true);
      expect(masked.includes('*')).toBe(true);
      expect(maskSensitiveData('short')).toBe('*hort');
      expect(maskSensitiveData('abc')).toBe('****');
      expect(maskSensitiveData('')).toBe('****');
    });

    it('should handle various lengths', () => {
      expect(maskSensitiveData('12345678')).toBe('****5678');
      expect(maskSensitiveData('1234')).toBe('****');
      expect(maskSensitiveData('12345')).toBe('*2345');
    });
  });

  describe('sanitizeForAudit', () => {
    it('should mask sensitive keys', () => {
      const input = {
        apiKey: 'sk-1234567890abcdef',
        name: 'test',
        password: 'secret123',
      };
      const result = sanitizeForAudit(input);
      
      expect(result.apiKey).toContain('*');
      expect(result.apiKey).not.toBe('sk-1234567890abcdef');
      expect(result.name).toBe('test');
      expect(result.password).toContain('*');
    });

    it('should handle nested objects', () => {
      const input = {
        credentials: {
          apiKey: 'sk-test123456789',
          region: 'us-east-1',
        },
      };
      const result = sanitizeForAudit(input);
      
      expect((result.credentials as Record<string, unknown>).apiKey).toContain('*');
      expect((result.credentials as Record<string, unknown>).region).toBe('us-east-1');
    });

    it('should detect credential-like values even without sensitive keys', () => {
      const input = {
        value: 'sk-abcdefghijklmnopqrstuvwxyz123456',
      };
      const result = sanitizeForAudit(input);
      
      expect(result.value).toContain('*');
    });
  });


  describe('logAuditEvent', () => {
    it('should capture audit events', () => {
      logAuditEvent({
        eventType: 'credential_access',
        actor: { teamId: 'team-123' },
        resource: { type: 'provider_credential', providerId: 'openai' },
        action: 'read',
        outcome: 'success',
      });

      const events = getCapturedAuditEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('credential_access');
      expect(events[0].timestamp).toBeTruthy();
      expect(events[0].correlationId).toBeTruthy();
    });

    it('should sanitize metadata', () => {
      logAuditEvent({
        eventType: 'credential_access',
        actor: { teamId: 'team-123' },
        resource: { type: 'provider_credential', providerId: 'openai' },
        action: 'read',
        outcome: 'success',
        metadata: {
          apiKey: 'sk-1234567890abcdef',
          provider: 'openai',
        },
      });

      const events = getCapturedAuditEvents();
      expect(events[0].metadata?.apiKey).toContain('*');
      expect(events[0].metadata?.provider).toBe('openai');
    });
  });

  describe('logCredentialAccess', () => {
    it('should log credential access events', () => {
      logCredentialAccess('openai', 'team-123', 'read', 'success');

      const events = getCapturedAuditEvents();
      expect(events).toHaveLength(1);
      expect(events[0].eventType).toBe('credential_access');
      expect(events[0].resource.providerId).toBe('openai');
    });

    it('should log decrypt events with correct type', () => {
      logCredentialAccess('anthropic', 'team-456', 'decrypt', 'success');

      const events = getCapturedAuditEvents();
      expect(events[0].eventType).toBe('credential_decrypt');
    });
  });

  /**
   * **Feature: llm-gateway, Property 25: Audit Log Credential Safety**
   * **Validates: Requirements 14.4**
   * 
   * For any audit log entry related to credential access, the log SHALL NOT
   * contain the raw credential value.
   */
  describe('Property 25: Audit Log Credential Safety', () => {
    // Generator for API key-like strings
    const apiKeyArb = fc.oneof(
      fc.stringMatching(/^sk-[a-zA-Z0-9]{32}$/),
      fc.stringMatching(/^[a-zA-Z0-9]{40}$/),
      fc.stringMatching(/^[a-f0-9]{64}$/),
      fc.string({ minLength: 32, maxLength: 64 }).map(s => s.replace(/[^a-zA-Z0-9]/g, 'x'))
    );

    it('should never expose raw credentials in audit logs', () => {
      fc.assert(
        fc.property(
          fc.record({
            providerId: fc.stringMatching(/^[a-z]+$/),
            teamId: fc.uuid(),
            apiKey: apiKeyArb,
            secretToken: apiKeyArb,
          }),
          ({ providerId, teamId, apiKey, secretToken }) => {
            clearCapturedAuditEvents();

            // Log credential access with raw credentials in metadata
            logCredentialAccess(providerId, teamId, 'decrypt', 'success', undefined, {
              apiKey,
              secretToken,
              provider: providerId,
            });

            const events = getCapturedAuditEvents();
            expect(events).toHaveLength(1);

            const event = events[0];
            
            // The raw credentials should NOT appear in the audit event
            expect(auditEventContainsCredentials(event)).toBe(false);
            
            // Verify the metadata was sanitized
            if (event.metadata) {
              const metadataStr = JSON.stringify(event.metadata);
              expect(metadataStr).not.toContain(apiKey);
              expect(metadataStr).not.toContain(secretToken);
            }
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mask credentials in nested metadata objects', () => {
      fc.assert(
        fc.property(
          fc.record({
            providerId: fc.stringMatching(/^[a-z]+$/),
            teamId: fc.uuid(),
            credentials: fc.record({
              apiKey: apiKeyArb,
              secret: apiKeyArb,
            }),
          }),
          ({ providerId, teamId, credentials }) => {
            clearCapturedAuditEvents();

            logAuditEvent({
              eventType: 'credential_update',
              actor: { teamId },
              resource: { type: 'provider_credential', providerId },
              action: 'update',
              outcome: 'success',
              metadata: {
                credentials,
                operation: 'rotate',
              },
            });

            const events = getCapturedAuditEvents();
            const event = events[0];

            // Raw credentials should not appear
            expect(auditEventContainsCredentials(event)).toBe(false);
            
            // Verify nested credentials are masked
            const metadataStr = JSON.stringify(event.metadata);
            expect(metadataStr).not.toContain(credentials.apiKey);
            expect(metadataStr).not.toContain(credentials.secret);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve non-sensitive data while masking credentials', () => {
      fc.assert(
        fc.property(
          fc.record({
            providerId: fc.stringMatching(/^[a-z]+$/),
            teamId: fc.uuid(),
            apiKey: apiKeyArb,
            region: fc.constantFrom('us-east-1', 'eu-west-1', 'ap-southeast-1'),
            modelId: fc.stringMatching(/^[a-z]+-[0-9]+$/),
          }),
          ({ providerId, teamId, apiKey, region, modelId }) => {
            clearCapturedAuditEvents();

            logCredentialAccess(providerId, teamId, 'use', 'success', undefined, {
              apiKey,
              region,
              modelId,
            });

            const events = getCapturedAuditEvents();
            const event = events[0];

            // Non-sensitive data should be preserved
            expect(event.metadata?.region).toBe(region);
            expect(event.metadata?.modelId).toBe(modelId);
            
            // Credentials should be masked
            expect(event.metadata?.apiKey).toContain('*');
            expect(event.metadata?.apiKey).not.toBe(apiKey);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle credential modification events safely', () => {
      fc.assert(
        fc.property(
          fc.record({
            providerId: fc.stringMatching(/^[a-z]+$/),
            teamId: fc.uuid(),
            oldKey: apiKeyArb,
            newKey: apiKeyArb,
            action: fc.constantFrom('create', 'update', 'delete') as fc.Arbitrary<'create' | 'update' | 'delete'>,
          }),
          ({ providerId, teamId, oldKey, newKey, action }) => {
            clearCapturedAuditEvents();

            logCredentialModification(providerId, teamId, action, 'success', undefined, {
              oldCredential: oldKey,
              newCredential: newKey,
            });

            const events = getCapturedAuditEvents();
            const event = events[0];

            // Neither old nor new credentials should appear in raw form
            const metadataStr = JSON.stringify(event.metadata);
            expect(metadataStr).not.toContain(oldKey);
            expect(metadataStr).not.toContain(newKey);
            expect(auditEventContainsCredentials(event)).toBe(false);
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should mask all credential-like values regardless of key name', () => {
      fc.assert(
        fc.property(
          fc.record({
            randomKey: fc.stringMatching(/^[a-z]+$/),
            credentialValue: apiKeyArb,
          }),
          ({ randomKey, credentialValue }) => {
            clearCapturedAuditEvents();

            // Use a non-standard key name that doesn't hint at credentials
            const metadata: Record<string, unknown> = {
              [randomKey]: credentialValue,
              normalValue: 'test',
            };

            logAuditEvent({
              eventType: 'credential_access',
              actor: { teamId: 'team-123' },
              resource: { type: 'provider_credential', providerId: 'test' },
              action: 'read',
              outcome: 'success',
              metadata,
            });

            const events = getCapturedAuditEvents();
            const event = events[0];

            // The credential-like value should be masked even with random key
            const metadataStr = JSON.stringify(event.metadata);
            expect(metadataStr).not.toContain(credentialValue);
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
