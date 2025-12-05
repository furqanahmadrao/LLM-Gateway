// Provider template loader
import { ProviderTemplate } from '../../types/index.js';

// Import built-in templates
import openaiTemplate from './openai.json' with { type: 'json' };
import anthropicTemplate from './anthropic.json' with { type: 'json' };
import azureTemplate from './azure.json' with { type: 'json' };
import mistralTemplate from './mistral.json' with { type: 'json' };
import groqTemplate from './groq.json' with { type: 'json' };
import cohereTemplate from './cohere.json' with { type: 'json' };

// Built-in provider templates
const builtInTemplates: Map<string, ProviderTemplate> = new Map([
  ['openai', openaiTemplate as ProviderTemplate],
  ['anthropic', anthropicTemplate as ProviderTemplate],
  ['azure', azureTemplate as ProviderTemplate],
  ['mistral', mistralTemplate as ProviderTemplate],
  ['groq', groqTemplate as ProviderTemplate],
  ['cohere', cohereTemplate as ProviderTemplate],
]);

/**
 * Get all available provider templates
 */
export function getAllTemplates(): ProviderTemplate[] {
  return Array.from(builtInTemplates.values());
}

/**
 * Get a provider template by ID
 */
export function getTemplateById(id: string): ProviderTemplate | undefined {
  return builtInTemplates.get(id);
}

/**
 * Check if a provider template exists
 */
export function hasTemplate(id: string): boolean {
  return builtInTemplates.has(id);
}

/**
 * Get all provider IDs
 */
export function getProviderIds(): string[] {
  return Array.from(builtInTemplates.keys());
}

export { builtInTemplates };
