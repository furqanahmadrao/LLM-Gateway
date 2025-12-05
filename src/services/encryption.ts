/**
 * Credential Encryption Service
 * 
 * Provides AES-256-GCM encryption/decryption for provider credentials.
 * Uses Node.js crypto module for secure encryption operations.
 * 
 * Requirements: 14.1 - Encrypt credentials using application-level encryption
 */

import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // 128 bits for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits
const KEY_LENGTH = 32; // 256 bits

/**
 * Validates that the encryption key is the correct length
 */
function validateKey(key: string): Buffer {
  const keyBuffer = Buffer.from(key, 'utf-8');
  if (keyBuffer.length !== KEY_LENGTH) {
    throw new Error(`Encryption key must be exactly ${KEY_LENGTH} bytes (256 bits)`);
  }
  return keyBuffer;
}

/**
 * Gets the encryption key from environment variable
 */
function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) {
    throw new Error('ENCRYPTION_KEY environment variable is not set');
  }
  return validateKey(key);
}

/**
 * Encrypts plaintext using AES-256-GCM
 * 
 * @param plaintext - The text to encrypt
 * @param keyOverride - Optional key override for testing
 * @returns Base64-encoded string containing IV + auth tag + ciphertext
 */
export function encrypt(plaintext: string, keyOverride?: string): string {
  const key = keyOverride ? validateKey(keyOverride) : getEncryptionKey();
  
  // Generate random IV for each encryption
  const iv = crypto.randomBytes(IV_LENGTH);
  
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  
  let encrypted = cipher.update(plaintext, 'utf-8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  
  const authTag = cipher.getAuthTag();
  
  // Combine IV + authTag + ciphertext into single buffer
  const combined = Buffer.concat([iv, authTag, encrypted]);
  
  return combined.toString('base64');
}

/**
 * Decrypts ciphertext that was encrypted with encrypt()
 * 
 * @param ciphertext - Base64-encoded string from encrypt()
 * @param keyOverride - Optional key override for testing
 * @returns Original plaintext
 */
export function decrypt(ciphertext: string, keyOverride?: string): string {
  const key = keyOverride ? validateKey(keyOverride) : getEncryptionKey();
  
  const combined = Buffer.from(ciphertext, 'base64');
  
  // Validate minimum length (IV + authTag + at least 1 byte of data)
  if (combined.length < IV_LENGTH + AUTH_TAG_LENGTH + 1) {
    throw new Error('Invalid ciphertext: too short');
  }
  
  // Extract IV, auth tag, and encrypted data
  const iv = combined.subarray(0, IV_LENGTH);
  const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  
  return decrypted.toString('utf-8');
}

/**
 * Masks a credential string, showing only the last 4 characters
 * 
 * @param credential - The credential to mask
 * @returns Masked string with asterisks and last 4 characters visible
 * 
 * Requirements: 14.3 - Mask all but the last 4 characters
 */
export function maskCredential(credential: string): string {
  if (credential.length <= 4) {
    return '*'.repeat(credential.length);
  }
  
  const visiblePart = credential.slice(-4);
  const maskedLength = credential.length - 4;
  
  return '*'.repeat(maskedLength) + visiblePart;
}

/**
 * Generates a cryptographically secure encryption key
 * Useful for initial setup
 * 
 * @returns A 32-byte key as a string
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH).toString('utf-8').slice(0, KEY_LENGTH);
}
