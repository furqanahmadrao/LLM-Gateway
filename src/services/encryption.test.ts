/**
 * Property-based tests for Credential Encryption Service
 * 
 * Uses fast-check for property-based testing with minimum 100 iterations.
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { encrypt, decrypt, maskCredential } from './encryption.js';

// Generate a valid 32-byte encryption key for testing
const TEST_KEY = 'abcdefghijklmnopqrstuvwxyz123456'; // Exactly 32 bytes

describe('Credential Encryption Service', () => {
  /**
   * **Feature: llm-gateway, Property 1: Credential Encryption Round-Trip**
   * 
   * *For any* valid provider credentials, encrypting then decrypting 
   * the credentials SHALL produce the original credentials unchanged.
   * 
   * **Validates: Requirements 14.1**
   */
  describe('Property 1: Credential Encryption Round-Trip', () => {
    it('should return original plaintext after encrypt then decrypt for any string', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 10000 }),
          (plaintext) => {
            const encrypted = encrypt(plaintext, TEST_KEY);
            const decrypted = decrypt(encrypted, TEST_KEY);
            
            return decrypted === plaintext;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should handle unicode characters in credentials', () => {
      fc.assert(
        fc.property(
          fc.unicodeString({ minLength: 1, maxLength: 1000 }),
          (plaintext) => {
            const encrypted = encrypt(plaintext, TEST_KEY);
            const decrypted = decrypt(encrypted, TEST_KEY);
            
            return decrypted === plaintext;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 1000 }),
          (plaintext) => {
            const encrypted1 = encrypt(plaintext, TEST_KEY);
            const encrypted2 = encrypt(plaintext, TEST_KEY);
            
            // Ciphertexts should be different due to random IV
            // But both should decrypt to the same plaintext
            const decrypted1 = decrypt(encrypted1, TEST_KEY);
            const decrypted2 = decrypt(encrypted2, TEST_KEY);
            
            return encrypted1 !== encrypted2 && 
                   decrypted1 === plaintext && 
                   decrypted2 === plaintext;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  /**
   * **Feature: llm-gateway, Property 24: Credential Masking**
   * 
   * *For any* credential string, the masked version SHALL show only 
   * the last 4 characters with the rest replaced by asterisks.
   * 
   * **Validates: Requirements 14.3**
   */
  describe('Property 24: Credential Masking', () => {
    it('should mask all but last 4 characters for strings longer than 4 chars', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 1000 }),
          (credential) => {
            const masked = maskCredential(credential);
            
            // Check length is preserved
            if (masked.length !== credential.length) return false;
            
            // Check last 4 characters are visible
            const last4 = credential.slice(-4);
            if (!masked.endsWith(last4)) return false;
            
            // Check all other characters are asterisks
            const maskedPart = masked.slice(0, -4);
            const allAsterisks = maskedPart.split('').every(c => c === '*');
            
            return allAsterisks;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should fully mask strings of 4 or fewer characters', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 1, maxLength: 4 }),
          (credential) => {
            const masked = maskCredential(credential);
            
            // Check length is preserved
            if (masked.length !== credential.length) return false;
            
            // Check all characters are asterisks
            return masked.split('').every(c => c === '*');
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should preserve the exact last 4 characters for any credential', () => {
      fc.assert(
        fc.property(
          fc.string({ minLength: 5, maxLength: 500 }),
          (credential) => {
            const masked = maskCredential(credential);
            const originalLast4 = credential.slice(-4);
            const maskedLast4 = masked.slice(-4);
            
            return originalLast4 === maskedLast4;
          }
        ),
        { numRuns: 100 }
      );
    });
  });
});
