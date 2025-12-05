/**
 * Model Refresh Service
 * 
 * Background service that periodically refreshes model lists from providers.
 * Implements exponential backoff for failed refreshes and sequential processing.
 * 
 * Requirements: 5.1, 5.2, 5.3, 5.4, 5.5
 */

import { fetchModelsForCredential } from './modelFetch.js';
import { 
  getProviderCredentialsByTeamId,
  getProviderByStringId,
  getProviderById,
  updateProviderCredentialSyncTime
} from '../db/repositories/providers.js';
import { createLogger, Logger } from './logger.js';
import type { ProviderCredential } from '../types/providers.js';

/**
 * Configuration for the refresh service
 */
export interface ModelRefreshConfig {
  /** Default TTL in milliseconds (default: 1 hour) */
  defaultTtlMs: number;
  /** Per-provider TTL overrides in milliseconds */
  providerTtls: Map<string, number>;
  /** Initial retry delay in milliseconds (default: 1000) */
  initialRetryDelayMs: number;
  /** Maximum retry delay in milliseconds (default: 60000) */
  maxRetryDelayMs: number;
  /** Backoff multiplier (default: 2) */
  backoffMultiplier: number;
  /** Maximum retry attempts before giving up (default: 5) */
  maxRetries: number;
  /** Interval for checking which providers need refresh (default: 60000ms) */
  checkIntervalMs: number;
}

/**
 * Status of a provider refresh operation
 */
export interface RefreshStatus {
  lastSyncAt: Date | null;
  nextSyncAt: Date | null;
  status: 'idle' | 'refreshing' | 'error';
  lastError?: string;
  modelCount: number;
  retryCount: number;
}

/**
 * Internal state for tracking provider refresh
 */
interface ProviderRefreshState {
  retryCount: number;
  lastAttemptAt: Date | null;
  nextRetryAt: Date | null;
  lastError: string | null;
}


/**
 * Default configuration values
 */
const DEFAULT_CONFIG: ModelRefreshConfig = {
  defaultTtlMs: 60 * 60 * 1000, // 1 hour
  providerTtls: new Map(),
  initialRetryDelayMs: 1000,
  maxRetryDelayMs: 60000,
  backoffMultiplier: 2,
  maxRetries: 5,
  checkIntervalMs: 60 * 1000, // Check every minute
};

/**
 * Model Refresh Service
 * 
 * Manages background refresh of model lists from all configured providers.
 * 
 * Requirements:
 * - 5.1: Initialize background job on start
 * - 5.2: Configurable TTL per provider
 * - 5.3: Exponential backoff on failure
 * - 5.4: Update last_sync_at on success
 * - 5.5: Sequential provider processing
 */
export class ModelRefreshService {
  private config: ModelRefreshConfig;
  private intervalId: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private isProcessing: boolean = false;
  private providerStates: Map<string, ProviderRefreshState> = new Map();
  private logger: Logger;

  constructor(config: Partial<ModelRefreshConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.logger = createLogger('model-refresh-service');
  }

  /**
   * Start the background refresh job
   * Requirements: 5.1 - Initialize background job on Gateway start
   */
  start(): void {
    if (this.isRunning) {
      this.logger.warn('ModelRefreshService is already running');
      return;
    }

    this.isRunning = true;
    this.logger.info('Starting ModelRefreshService', {
      checkIntervalMs: this.config.checkIntervalMs,
      defaultTtlMs: this.config.defaultTtlMs,
    });

    // Start the interval job
    this.intervalId = setInterval(() => {
      this.processRefreshCycle().catch(err => {
        this.logger.error('Error in refresh cycle', { error: String(err) });
      });
    }, this.config.checkIntervalMs);

    // Run immediately on start
    this.processRefreshCycle().catch(err => {
      this.logger.error('Error in initial refresh cycle', { error: String(err) });
    });
  }

  /**
   * Stop the background refresh job
   */
  stop(): void {
    if (!this.isRunning) {
      this.logger.warn('ModelRefreshService is not running');
      return;
    }

    this.isRunning = false;
    
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    this.logger.info('Stopped ModelRefreshService');
  }

  /**
   * Check if the service is running
   */
  isServiceRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get the TTL for a specific provider
   * Requirements: 5.2 - Configurable TTL per provider
   */
  getTtlForProvider(providerStringId: string): number {
    return this.config.providerTtls.get(providerStringId) ?? this.config.defaultTtlMs;
  }

  /**
   * Set TTL for a specific provider
   * Requirements: 5.2 - Configurable TTL per provider
   */
  setProviderTtl(providerStringId: string, ttlMs: number): void {
    this.config.providerTtls.set(providerStringId, ttlMs);
    this.logger.info('Updated provider TTL', { providerStringId, ttlMs });
  }

  /**
   * Calculate the next retry delay using exponential backoff
   * Requirements: 5.3 - Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 60s
   */
  calculateBackoffDelay(retryCount: number): number {
    const delay = this.config.initialRetryDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }


  /**
   * Check if a credential needs refresh based on TTL
   */
  needsRefresh(credential: ProviderCredential, providerStringId: string): boolean {
    const ttl = this.getTtlForProvider(providerStringId);
    
    if (!credential.lastSyncAt) {
      return true; // Never synced
    }

    const timeSinceSync = Date.now() - credential.lastSyncAt.getTime();
    return timeSinceSync >= ttl;
  }

  /**
   * Check if a provider is in backoff period
   */
  isInBackoff(credentialId: string): boolean {
    const state = this.providerStates.get(credentialId);
    if (!state || !state.nextRetryAt) {
      return false;
    }
    return Date.now() < state.nextRetryAt.getTime();
  }

  /**
   * Get the refresh state for a credential
   */
  getProviderState(credentialId: string): ProviderRefreshState {
    let state = this.providerStates.get(credentialId);
    if (!state) {
      state = {
        retryCount: 0,
        lastAttemptAt: null,
        nextRetryAt: null,
        lastError: null,
      };
      this.providerStates.set(credentialId, state);
    }
    return state;
  }

  /**
   * Reset the retry state for a credential after successful refresh
   */
  resetRetryState(credentialId: string): void {
    this.providerStates.set(credentialId, {
      retryCount: 0,
      lastAttemptAt: new Date(),
      nextRetryAt: null,
      lastError: null,
    });
  }

  /**
   * Update retry state after a failed refresh
   * Requirements: 5.3 - Track retry count and implement backoff
   */
  updateRetryState(credentialId: string, error: string): void {
    const state = this.getProviderState(credentialId);
    state.retryCount++;
    state.lastAttemptAt = new Date();
    state.lastError = error;

    if (state.retryCount < this.config.maxRetries) {
      const backoffDelay = this.calculateBackoffDelay(state.retryCount);
      state.nextRetryAt = new Date(Date.now() + backoffDelay);
      this.logger.warn('Scheduling retry with backoff', {
        credentialId,
        retryCount: state.retryCount,
        backoffDelayMs: backoffDelay,
        nextRetryAt: state.nextRetryAt.toISOString(),
      });
    } else {
      this.logger.error('Max retries exceeded', {
        credentialId,
        retryCount: state.retryCount,
        lastError: error,
      });
    }

    this.providerStates.set(credentialId, state);
  }

  /**
   * Refresh a single credential
   * Requirements: 5.4 - Update last_sync_at on success
   */
  async refreshCredential(
    credential: ProviderCredential,
    providerStringId: string
  ): Promise<{ success: boolean; modelsCount: number; error?: string }> {
    this.logger.debug('Refreshing credential', {
      credentialId: credential.id,
      providerStringId,
      credentialName: credential.credentialName,
    });

    try {
      const result = await fetchModelsForCredential(credential, providerStringId);

      if (result.success) {
        // Requirements: 5.4 - Update last_sync_at timestamp on successful refresh
        await updateProviderCredentialSyncTime(credential.id, new Date());
        this.resetRetryState(credential.id);
        
        this.logger.info('Successfully refreshed models', {
          credentialId: credential.id,
          providerStringId,
          modelsCount: result.modelsCount,
        });

        return { success: true, modelsCount: result.modelsCount };
      } else {
        this.updateRetryState(credential.id, result.error || 'Unknown error');
        return { success: false, modelsCount: 0, error: result.error };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.updateRetryState(credential.id, errorMessage);
      
      this.logger.error('Error refreshing credential', {
        credentialId: credential.id,
        providerStringId,
        error: errorMessage,
      });

      return { success: false, modelsCount: 0, error: errorMessage };
    }
  }


  /**
   * Process a single refresh cycle
   * Requirements: 5.5 - Process providers sequentially to avoid rate limiting
   */
  async processRefreshCycle(): Promise<void> {
    if (this.isProcessing) {
      this.logger.debug('Refresh cycle already in progress, skipping');
      return;
    }

    this.isProcessing = true;

    try {
      // Get all teams with credentials (simplified - in production would iterate teams)
      // For now, we'll process all credentials we can find
      const credentials = await this.getAllCredentialsNeedingRefresh();

      this.logger.debug('Processing refresh cycle', {
        credentialsToRefresh: credentials.length,
      });

      // Requirements: 5.5 - Process one provider at a time sequentially
      for (const { credential, providerStringId } of credentials) {
        if (!this.isRunning) {
          this.logger.info('Service stopped, aborting refresh cycle');
          break;
        }

        // Skip if in backoff period
        if (this.isInBackoff(credential.id)) {
          this.logger.debug('Skipping credential in backoff', {
            credentialId: credential.id,
            providerStringId,
          });
          continue;
        }

        // Skip if max retries exceeded
        const state = this.getProviderState(credential.id);
        if (state.retryCount >= this.config.maxRetries) {
          this.logger.debug('Skipping credential with max retries exceeded', {
            credentialId: credential.id,
            providerStringId,
            retryCount: state.retryCount,
          });
          continue;
        }

        await this.refreshCredential(credential, providerStringId);
      }
    } catch (error) {
      this.logger.error('Error in refresh cycle', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get all credentials that need refresh
   */
  private async getAllCredentialsNeedingRefresh(): Promise<Array<{
    credential: ProviderCredential;
    providerStringId: string;
  }>> {
    const result: Array<{ credential: ProviderCredential; providerStringId: string }> = [];

    // Get all credentials from all teams
    // In a real implementation, this would be more efficient with a single query
    // For now, we'll use the existing repository methods
    
    // This is a simplified approach - in production, you'd want a dedicated query
    // that joins credentials with providers and filters by TTL
    const allCredentials = await this.getAllActiveCredentials();

    for (const { credential, providerStringId } of allCredentials) {
      if (this.needsRefresh(credential, providerStringId)) {
        result.push({ credential, providerStringId });
      }
    }

    return result;
  }

  /**
   * Get all active credentials with their provider string IDs
   */
  private async getAllActiveCredentials(): Promise<Array<{
    credential: ProviderCredential;
    providerStringId: string;
  }>> {
    // This would ideally be a single optimized query
    // For now, we'll use existing repository methods
    const { query } = await import('../db/pool.js');
    
    interface CredentialWithProvider {
      id: string;
      provider_id: string;
      team_id: string;
      credential_name: string;
      credentials_encrypted: Buffer;
      status: string;
      is_default: boolean;
      priority: number;
      last_sync_at: Date | null;
      last_error: string | null;
      created_at: Date;
      updated_at: Date;
      provider_string_id: string;
    }

    const result = await query<CredentialWithProvider>(
      `SELECT pc.*, p.provider_id as provider_string_id
       FROM provider_credentials pc
       JOIN providers p ON pc.provider_id = p.id
       WHERE pc.status = 'active'
       ORDER BY pc.team_id, pc.priority ASC`
    );

    return result.rows.map(row => ({
      credential: {
        id: row.id,
        providerId: row.provider_id,
        teamId: row.team_id,
        credentialName: row.credential_name,
        credentialsEncrypted: row.credentials_encrypted.toString('base64'),
        status: row.status as 'active' | 'error' | 'disabled',
        isDefault: row.is_default,
        priority: row.priority,
        lastSyncAt: row.last_sync_at,
        lastError: row.last_error,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
      providerStringId: row.provider_string_id,
    }));
  }


  /**
   * Manually trigger refresh for a specific provider
   */
  async refreshProvider(
    teamId: string,
    providerStringId: string
  ): Promise<{ success: boolean; modelsCount: number; error?: string }> {
    const { getDefaultCredential } = await import('../db/repositories/providers.js');
    
    const credential = await getDefaultCredential(teamId, providerStringId);
    if (!credential) {
      return {
        success: false,
        modelsCount: 0,
        error: `No credentials found for provider: ${providerStringId}`,
      };
    }

    // Reset retry state to allow immediate refresh
    this.resetRetryState(credential.id);
    
    return this.refreshCredential(credential, providerStringId);
  }

  /**
   * Refresh all providers for a team
   */
  async refreshAllProviders(
    teamId: string
  ): Promise<Map<string, { success: boolean; modelsCount: number; error?: string }>> {
    const results = new Map<string, { success: boolean; modelsCount: number; error?: string }>();
    
    const credentials = await getProviderCredentialsByTeamId(teamId);
    
    // Get provider string IDs for each credential
    for (const credential of credentials) {
      if (credential.status !== 'active') continue;
      
      const provider = await getProviderById(credential.providerId);
      if (!provider) continue;
      
      // Type assertion for provider_id field
      const providerStringId = (provider as unknown as { provider_id: string }).provider_id;
      
      // Reset retry state to allow immediate refresh
      this.resetRetryState(credential.id);
      
      const result = await this.refreshCredential(credential, providerStringId);
      results.set(providerStringId, result);
    }

    return results;
  }

  /**
   * Get refresh status for a provider
   */
  async getRefreshStatus(
    teamId: string,
    providerStringId: string
  ): Promise<RefreshStatus | null> {
    const { getDefaultCredential } = await import('../db/repositories/providers.js');
    const { getModelsByProviderId } = await import('../db/repositories/models.js');
    
    const credential = await getDefaultCredential(teamId, providerStringId);
    if (!credential) {
      return null;
    }

    const provider = await getProviderByStringId(providerStringId);
    if (!provider) {
      return null;
    }

    const models = await getModelsByProviderId(provider.id);
    const state = this.getProviderState(credential.id);
    const ttl = this.getTtlForProvider(providerStringId);

    let nextSyncAt: Date | null = null;
    if (credential.lastSyncAt) {
      nextSyncAt = new Date(credential.lastSyncAt.getTime() + ttl);
    }

    let status: 'idle' | 'refreshing' | 'error' = 'idle';
    if (credential.status === 'error' || state.retryCount > 0) {
      status = 'error';
    }

    return {
      lastSyncAt: credential.lastSyncAt,
      nextSyncAt,
      status,
      lastError: state.lastError || credential.lastError || undefined,
      modelCount: models.length,
      retryCount: state.retryCount,
    };
  }

  /**
   * Get the current configuration
   */
  getConfig(): ModelRefreshConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<ModelRefreshConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Updated ModelRefreshService configuration', {
      defaultTtlMs: this.config.defaultTtlMs,
      checkIntervalMs: this.config.checkIntervalMs,
    });
  }
}

/**
 * Singleton instance of the ModelRefreshService
 */
let serviceInstance: ModelRefreshService | null = null;

/**
 * Get or create the singleton ModelRefreshService instance
 */
export function getModelRefreshService(config?: Partial<ModelRefreshConfig>): ModelRefreshService {
  if (!serviceInstance) {
    serviceInstance = new ModelRefreshService(config);
  }
  return serviceInstance;
}

/**
 * Reset the singleton instance (for testing)
 */
export function resetModelRefreshService(): void {
  if (serviceInstance) {
    serviceInstance.stop();
    serviceInstance = null;
  }
}

export { DEFAULT_CONFIG };
