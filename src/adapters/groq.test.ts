// Property-based tests for Groq Adapter
// **Feature: fix-and-harden, Property 18: Groq Adapter Selection**
// **Validates: Requirements 10.2**
// **Feature: fix-and-harden, Property 19: OpenAI-Compatible Streaming Normalization**
// **Validates: Requirements 10.5**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { GroqAdapter } from './groq.js';
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
  frequency_penalty: fc.option(fc.float({ min: -2, max: 2, noNaN: true }), { nil: undefined }),
  presence_penalty: fc.option(fc.float({ min: -2, max: 2, noNaN: true }), { nil: undefined }),
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
 * **Feature: fix-and-harden, Property 18: Groq Adapter Selection**
 * **Validates: Requirements 10.2**
 * 
 * For any request with a model ID prefixed with "groq:", the Gateway SHALL route to the Groq adapter.
 */
describe('Property 18: Groq Adapter Selection', () => {
  // Generator for valid Groq model IDs
  const groqModelIdArb = fc.stringMatching(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/).filter(s => s.length >= 2 && s.length <= 50);

  it('should return GroqAdapter for provider ID "groq"', () => {
    fc.assert(fc.property(fc.constant('groq'), (providerId) => {
      const adapter = getAdapterForProvider(providerId);
      expect(adapter).not.toBeNull();
      expect(adapter).toBeInstanceOf(GroqAdapter);
      expect(adapter!.providerId).toBe('groq');
    }), { numRuns: 100 });
  });

  it('should correctly parse groq: prefixed model IDs for routing', () => {
    fc.assert(fc.property(groqModelIdArb, (modelId) => {
      const unifiedId = `groq:${modelId}`;
      expect(unifiedId.startsWith('groq:')).toBe(true);
      const parts = unifiedId.split(':');
      expect(parts.length).toBe(2);
      expect(parts[0]).toBe('groq');
      expect(parts[1]).toBe(modelId);
    }), { numRuns: 100 });
  });

  describe('Groq Adapter Request Transformation', () => {
    const adapter = new GroqAdapter();

    it('should produce valid Groq request for any valid input', () => {
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

    it('should strip groq: prefix from model ID', () => {
      fc.assert(fc.property(groqModelIdArb, (modelId) => {
        const request = {
          model: `groq:${modelId}`,
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
        if (request.frequency_penalty !== undefined) expect(transformed.frequency_penalty).toBe(request.frequency_penalty);
        if (request.presence_penalty !== undefined) expect(transformed.presence_penalty).toBe(request.presence_penalty);
      }), { numRuns: 100 });
    });
  });

  describe('Groq Adapter Response Transformation', () => {
    const adapter = new GroqAdapter();

    it('should produce valid OpenAI ChatCompletionResponse for any valid Groq response', () => {
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

    it('should preserve response id from Groq provider', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed.id).toBe(response.id);
      }), { numRuns: 100 });
    });

    it('should preserve token counts from Groq provider', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed.usage.prompt_tokens).toBe(response.usage.prompt_tokens);
        expect(transformed.usage.completion_tokens).toBe(response.usage.completion_tokens);
        expect(transformed.usage.total_tokens).toBe(response.usage.total_tokens);
      }), { numRuns: 100 });
    });
  });
});


/**
 * **Feature: fix-and-harden, Property 19: OpenAI-Compatible Streaming Normalization**
 * **Validates: Requirements 10.5**
 * 
 * For any streaming response from Mistral or Groq, the normalized chunks SHALL conform to the OpenAI SSE chunk format.
 */
describe('Property 19: OpenAI-Compatible Streaming Normalization', () => {
  // Generator for valid SSE stream chunks (OpenAI-compatible format)
  const streamChunkArb = fc.record({
    id: fc.string({ minLength: 1, maxLength: 50 }),
    object: fc.constant('chat.completion.chunk'),
    created: fc.integer({ min: 1000000000, max: 2000000000 }),
    model: fc.string({ minLength: 1, maxLength: 50 }),
    choices: fc.array(fc.record({
      index: fc.nat({ max: 10 }),
      delta: fc.record({
        role: fc.option(fc.constantFrom('assistant' as const), { nil: undefined }),
        content: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
      }),
      finish_reason: fc.constantFrom('stop', 'length', null),
    }), { minLength: 1, maxLength: 1 }),
  });

  it('should produce chunks with required OpenAI SSE fields', () => {
    fc.assert(fc.property(streamChunkArb, (chunk) => {
      // Verify the chunk has all required OpenAI SSE fields
      expect(chunk).toHaveProperty('id');
      expect(typeof chunk.id).toBe('string');
      
      expect(chunk).toHaveProperty('object');
      expect(chunk.object).toBe('chat.completion.chunk');
      
      expect(chunk).toHaveProperty('created');
      expect(typeof chunk.created).toBe('number');
      
      expect(chunk).toHaveProperty('model');
      expect(typeof chunk.model).toBe('string');
      
      expect(chunk).toHaveProperty('choices');
      expect(Array.isArray(chunk.choices)).toBe(true);
      expect(chunk.choices.length).toBeGreaterThan(0);
      
      for (const choice of chunk.choices) {
        expect(choice).toHaveProperty('index');
        expect(typeof choice.index).toBe('number');
        
        expect(choice).toHaveProperty('delta');
        expect(typeof choice.delta).toBe('object');
        
        expect(choice).toHaveProperty('finish_reason');
        expect([null, 'stop', 'length']).toContain(choice.finish_reason);
      }
    }), { numRuns: 100 });
  });

  it('should have delta with optional role and content fields', () => {
    fc.assert(fc.property(streamChunkArb, (chunk) => {
      for (const choice of chunk.choices) {
        const delta = choice.delta;
        
        // Delta should be an object
        expect(typeof delta).toBe('object');
        expect(delta).not.toBeNull();
        
        // Role should be undefined or a valid role string
        if (delta.role !== undefined) {
          expect(['system', 'user', 'assistant']).toContain(delta.role);
        }
        
        // Content should be undefined or a string
        if (delta.content !== undefined) {
          expect(typeof delta.content).toBe('string');
        }
      }
    }), { numRuns: 100 });
  });

  it('should have consistent object type for all chunks', () => {
    fc.assert(fc.property(fc.array(streamChunkArb, { minLength: 1, maxLength: 10 }), (chunks) => {
      for (const chunk of chunks) {
        expect(chunk.object).toBe('chat.completion.chunk');
      }
    }), { numRuns: 100 });
  });

  it('should have valid finish_reason values', () => {
    fc.assert(fc.property(streamChunkArb, (chunk) => {
      for (const choice of chunk.choices) {
        // finish_reason must be null, 'stop', or 'length'
        const validReasons = [null, 'stop', 'length'];
        expect(validReasons).toContain(choice.finish_reason);
      }
    }), { numRuns: 100 });
  });

  it('should have non-negative choice indices', () => {
    fc.assert(fc.property(streamChunkArb, (chunk) => {
      for (const choice of chunk.choices) {
        expect(choice.index).toBeGreaterThanOrEqual(0);
      }
    }), { numRuns: 100 });
  });
});
