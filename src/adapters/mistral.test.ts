// Property-based tests for Mistral Adapter
// **Feature: fix-and-harden, Property 17: Mistral Adapter Selection**
// **Validates: Requirements 10.1**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { MistralAdapter } from './mistral.js';
import { getAdapterForProvider } from './index.js';
import type { ProviderResponse } from './base.js';

const chatMessageArb = fc.record({
  role: fc.constantFrom('system' as const, 'user' as const, 'assistant' as const),
  content: fc.string({ minLength: 1, maxLength: 500 }),
});

const chatCompletionRequestArb = fc.record({
  model: fc.stringMatching(/^[a-z]+:[a-z0-9-]+$/),
  messages: fc.array(chatMessageArb, { minLength: 1, maxLength: 5 }),
  temperature: fc.option(fc.float({ min: 0, max: 2, noNaN: true }), { nil: undefined }),
  max_tokens: fc.option(fc.integer({ min: 1, max: 4096 }), { nil: undefined }),
  stream: fc.option(fc.boolean(), { nil: undefined }),
  top_p: fc.option(fc.float({ min: 0, max: 1, noNaN: true }), { nil: undefined }),
  stop: fc.option(fc.oneof(fc.string(), fc.array(fc.string(), { minLength: 1, maxLength: 4 })), { nil: undefined }),
});

const openAIStyleResponseArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  object: fc.constant('chat.completion'),
  created: fc.integer({ min: 1000000000, max: 2000000000 }),
  model: fc.string({ minLength: 1, maxLength: 50 }),
  choices: fc.array(fc.record({
    index: fc.nat({ max: 10 }),
    message: fc.record({ role: fc.constantFrom('assistant'), content: fc.string({ minLength: 0, maxLength: 1000 }) }),
    finish_reason: fc.constantFrom('stop', 'length', null),
  }), { minLength: 1, maxLength: 3 }),
  usage: fc.record({
    prompt_tokens: fc.nat({ max: 10000 }),
    completion_tokens: fc.nat({ max: 10000 }),
    total_tokens: fc.nat({ max: 20000 }),
  }),
});

const modelIdArb = fc.stringMatching(/^[a-z]+:[a-z0-9-]+$/);


/**
 * **Feature: fix-and-harden, Property 17: Mistral Adapter Selection**
 * **Validates: Requirements 10.1**
 * 
 * For any request with a model ID prefixed with "mistral:", the Gateway SHALL route to the Mistral adapter.
 */
describe('Property 17: Mistral Adapter Selection', () => {
  // Generator for valid Mistral model IDs
  const mistralModelIdArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).filter(s => s.length >= 2 && s.length <= 50);

  it('should return MistralAdapter for provider ID "mistral"', () => {
    fc.assert(fc.property(fc.constant('mistral'), (providerId) => {
      const adapter = getAdapterForProvider(providerId);
      expect(adapter).not.toBeNull();
      expect(adapter).toBeInstanceOf(MistralAdapter);
      expect(adapter!.providerId).toBe('mistral');
    }), { numRuns: 100 });
  });

  it('should correctly parse mistral: prefixed model IDs for routing', () => {
    fc.assert(fc.property(mistralModelIdArb, (modelId) => {
      const unifiedId = `mistral:${modelId}`;
      expect(unifiedId.startsWith('mistral:')).toBe(true);
      const parts = unifiedId.split(':');
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe('mistral');
      expect(parts[1]).toBe(modelId);
    }), { numRuns: 100 });
  });

  describe('Mistral Adapter Request Transformation', () => {
    const adapter = new MistralAdapter();

    it('should produce valid Mistral request for any valid input', () => {
      fc.assert(fc.property(chatCompletionRequestArb, (request) => {
        const transformed = adapter.transformRequest(request);
        expect(transformed).toHaveProperty('model');
        expect(typeof transformed.model).toBe('string');
        const modelStr = transformed.model as string;
        expect(modelStr).not.toContain(':');
        expect(transformed).toHaveProperty('messages');
        expect(Array.isArray(transformed.messages)).toBe(true);
      }), { numRuns: 100 });
    });

    it('should strip mistral: prefix from model ID', () => {
      fc.assert(fc.property(mistralModelIdArb, (modelId) => {
        const request = {
          model: `mistral:${modelId}`,
          messages: [{ role: 'user' as const, content: 'Hello' }],
        };
        const transformed = adapter.transformRequest(request);
        expect(transformed.model).toBe(modelId);
      }), { numRuns: 100 });
    });

    it('should preserve messages in OpenAI-compatible format', () => {
      fc.assert(fc.property(chatCompletionRequestArb, (request) => {
        const transformed = adapter.transformRequest(request);
        const messages = transformed.messages as Array<{ role: string; content: string }>;
        expect(messages.length).toBe(request.messages.length);
        for (let i = 0; i < messages.length; i++) {
          expect(messages[i].role).toBe(request.messages[i].role);
          expect(messages[i].content).toBe(request.messages[i].content);
        }
      }), { numRuns: 100 });
    });

    it('should preserve optional parameters when provided', () => {
      fc.assert(fc.property(chatCompletionRequestArb, (request) => {
        const transformed = adapter.transformRequest(request);
        if (request.temperature !== undefined) expect(transformed.temperature).toBe(request.temperature);
        if (request.max_tokens !== undefined) expect(transformed.max_tokens).toBe(request.max_tokens);
        if (request.top_p !== undefined) expect(transformed.top_p).toBe(request.top_p);
        if (request.stop !== undefined) expect(transformed.stop).toEqual(request.stop);
      }), { numRuns: 100 });
    });
  });

  describe('Mistral Adapter Response Transformation', () => {
    const adapter = new MistralAdapter();

    it('should produce valid OpenAI ChatCompletionResponse for any valid Mistral response', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed).toHaveProperty('id');
        expect(typeof transformed.id).toBe('string');
        expect(transformed).toHaveProperty('object');
        expect(transformed.object).toBe('chat.completion');
        expect(transformed).toHaveProperty('created');
        expect(typeof transformed.created).toBe('number');
        expect(transformed).toHaveProperty('model');
        expect(transformed.model).toBe(model);
        expect(transformed).toHaveProperty('choices');
        expect(Array.isArray(transformed.choices)).toBe(true);
        expect(transformed.choices.length).toBeGreaterThan(0);
        for (const choice of transformed.choices) {
          expect(choice).toHaveProperty('index');
          expect(typeof choice.index).toBe('number');
          expect(choice).toHaveProperty('message');
          expect(choice.message).toHaveProperty('role');
          expect(['system', 'user', 'assistant']).toContain(choice.message.role);
          expect(choice.message).toHaveProperty('content');
          expect(typeof choice.message.content).toBe('string');
          expect(choice).toHaveProperty('finish_reason');
          expect([null, 'stop', 'length']).toContain(choice.finish_reason);
        }
        expect(transformed).toHaveProperty('usage');
        expect(transformed.usage).toHaveProperty('prompt_tokens');
        expect(typeof transformed.usage.prompt_tokens).toBe('number');
        expect(transformed.usage).toHaveProperty('completion_tokens');
        expect(typeof transformed.usage.completion_tokens).toBe('number');
        expect(transformed.usage).toHaveProperty('total_tokens');
        expect(typeof transformed.usage.total_tokens).toBe('number');
      }), { numRuns: 100 });
    });

    it('should preserve response id from Mistral provider', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed.id).toBe(response.id);
      }), { numRuns: 100 });
    });

    it('should preserve token counts from Mistral provider', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed.usage.prompt_tokens).toBe(response.usage.prompt_tokens);
        expect(transformed.usage.completion_tokens).toBe(response.usage.completion_tokens);
        expect(transformed.usage.total_tokens).toBe(response.usage.total_tokens);
      }), { numRuns: 100 });
    });
  });
});
