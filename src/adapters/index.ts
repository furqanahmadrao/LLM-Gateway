/**
 * Provider Adapters Index
 * 
 * Exports all provider adapters and provides a factory function
 * to get the appropriate adapter for a given provider.
 */

import { ProviderAdapter } from './base.js';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { AzureAdapter } from './azure.js';
import { MistralAdapter } from './mistral.js';
import { GroqAdapter } from './groq.js';
import { CustomOpenAIAdapter } from './custom.js';
import { CustomProviderConfig } from '../types/providers.js';

// Adapter instances (lazy-loaded singletons)
const adapters: Map<string, ProviderAdapter> = new Map();

// Custom adapter instances (keyed by providerId)
const customAdapters: Map<string, CustomOpenAIAdapter> = new Map();

/**
 * Get the adapter for a specific provider
 * 
 * @param providerId - The provider string ID (e.g., 'openai', 'anthropic')
 * @returns The provider adapter instance, or null if not found
 */
export function getAdapterForProvider(providerId: string): ProviderAdapter | null {
  // Check if adapter already exists
  if (adapters.has(providerId)) {
    return adapters.get(providerId)!;
  }

  // Check if it's a custom adapter
  if (customAdapters.has(providerId)) {
    return customAdapters.get(providerId)!;
  }

  // Create adapter based on provider ID
  let adapter: ProviderAdapter | null = null;

  switch (providerId) {
    case 'openai':
      adapter = new OpenAIAdapter();
      break;
    case 'anthropic':
      adapter = new AnthropicAdapter();
      break;
    case 'azure':
      adapter = new AzureAdapter();
      break;
    case 'mistral':
      adapter = new MistralAdapter();
      break;
    case 'groq':
      adapter = new GroqAdapter();
      break;
    default:
      return null;
  }

  // Cache the adapter
  if (adapter) {
    adapters.set(providerId, adapter);
  }

  return adapter;
}

/**
 * Register a custom OpenAI-compatible provider adapter
 * 
 * @param providerId - Unique identifier for the custom provider
 * @param displayName - Human-readable name for the provider
 * @param config - Custom provider configuration
 * @returns The created adapter instance
 */
export function registerCustomAdapter(
  providerId: string,
  displayName: string,
  config: CustomProviderConfig
): CustomOpenAIAdapter {
  const adapter = new CustomOpenAIAdapter(providerId, displayName, config);
  customAdapters.set(providerId, adapter);
  return adapter;
}

/**
 * Get a custom adapter by provider ID
 * 
 * @param providerId - The custom provider ID
 * @returns The custom adapter instance, or null if not found
 */
export function getCustomAdapter(providerId: string): CustomOpenAIAdapter | null {
  return customAdapters.get(providerId) || null;
}

/**
 * Remove a custom adapter
 * 
 * @param providerId - The custom provider ID to remove
 * @returns true if removed, false if not found
 */
export function removeCustomAdapter(providerId: string): boolean {
  return customAdapters.delete(providerId);
}

/**
 * Check if a provider is a custom provider
 */
export function isCustomProvider(providerId: string): boolean {
  return customAdapters.has(providerId);
}

/**
 * Get all available provider IDs that have adapters
 */
export function getAvailableProviderIds(): string[] {
  const builtIn = ['openai', 'anthropic', 'azure', 'mistral', 'groq'];
  const custom = Array.from(customAdapters.keys());
  return [...builtIn, ...custom];
}

/**
 * Check if an adapter exists for a provider
 */
export function hasAdapterForProvider(providerId: string): boolean {
  return getAvailableProviderIds().includes(providerId) || customAdapters.has(providerId);
}

// Export adapter classes for direct use
export { ProviderAdapter } from './base.js';
export { OpenAIAdapter } from './openai.js';
export { AnthropicAdapter } from './anthropic.js';
export { AzureAdapter } from './azure.js';
export { MistralAdapter } from './mistral.js';
export { GroqAdapter } from './groq.js';
export { CustomOpenAIAdapter, buildAuthHeaderValue, buildModelsEndpoint } from './custom.js';
