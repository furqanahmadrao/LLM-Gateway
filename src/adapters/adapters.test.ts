// Property-based tests for Provider Adapters
// **Feature: llm-gateway, Property 7: Request Transformation Validity**
// **Feature: llm-gateway, Property 8: Response Transformation to OpenAI Format**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { OpenAIAdapter } from './openai.js';
import { AnthropicAdapter } from './anthropic.js';
import { AzureAdapter } from './azure.js';
import type { ChatMessage } from '../types/chat.js';
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
  frequency_penalty: fc.option(fc.float({ min: -2, max: 2, noNaN: true }), { nil: undefined }),
  presence_penalty: fc.option(fc.float({ min: -2, max: 2, noNaN: true }), { nil: undefined }),
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

const anthropicResponseArb = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  type: fc.constant('message'),
  role: fc.constant('assistant'),
  content: fc.array(fc.record({ type: fc.constant('text'), text: fc.string({ minLength: 0, maxLength: 1000 }) }), { minLength: 1, maxLength: 3 }),
  model: fc.string({ minLength: 1, maxLength: 50 }),
  stop_reason: fc.constantFrom('end_turn', 'max_tokens', null),
  stop_sequence: fc.option(fc.string(), { nil: null }),
  usage: fc.record({ input_tokens: fc.nat({ max: 10000 }), output_tokens: fc.nat({ max: 10000 }) }),
});

const modelIdArb = fc.stringMatching(/^[a-z]+:[a-z0-9-]+$/);

describe('Property 7: Request Transformation Validity', () => {
  describe('OpenAI Adapter', () => {
    const adapter = new OpenAIAdapter();
    it('should produce valid OpenAI request for any valid input', () => {
      fc.assert(fc.property(chatCompletionRequestArb, (request) => {
        const transformed = adapter.transformRequest(request);
        expect(transformed).toHaveProperty('model');
        expect(typeof transformed.model).toBe('string');
        expect(transformed).toHaveProperty('messages');
        expect(Array.isArray(transformed.messages)).toBe(true);
        const messages = transformed.messages as ChatMessage[];
        expect(messages.length).toBe(request.messages.length);
      }), { numRuns: 100 });
    });
  });
  describe('Anthropic Adapter', () => {
    const adapter = new AnthropicAdapter();
    it('should produce valid Anthropic request for any valid input', () => {
      fc.assert(fc.property(chatCompletionRequestArb, (request) => {
        const transformed = adapter.transformRequest(request);
        expect(transformed).toHaveProperty('model');
        expect(typeof transformed.model).toBe('string');
        expect(transformed).toHaveProperty('messages');
        expect(Array.isArray(transformed.messages)).toBe(true);
      }), { numRuns: 100 });
    });
  });
  describe('Azure Adapter', () => {
    const adapter = new AzureAdapter();
    it('should produce valid Azure OpenAI request for any valid input', () => {
      fc.assert(fc.property(chatCompletionRequestArb, (request) => {
        const transformed = adapter.transformRequest(request);
        expect(transformed).toHaveProperty('model');
        expect(typeof transformed.model).toBe('string');
        expect(transformed).toHaveProperty('messages');
        expect(Array.isArray(transformed.messages)).toBe(true);
      }), { numRuns: 100 });
    });
  });
});

describe('Property 8: Response Transformation to OpenAI Format', () => {
  describe('OpenAI Adapter', () => {
    const adapter = new OpenAIAdapter();
    it('should produce valid OpenAI ChatCompletionResponse for any valid provider response', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed).toHaveProperty('id');
        expect(transformed).toHaveProperty('object');
        expect(transformed.object).toBe('chat.completion');
        expect(transformed).toHaveProperty('model');
        expect(transformed.model).toBe(model);
      }), { numRuns: 100 });
    });
  });
  describe('Anthropic Adapter', () => {
    const adapter = new AnthropicAdapter();
    it('should produce valid OpenAI ChatCompletionResponse for any valid Anthropic response', () => {
      fc.assert(fc.property(anthropicResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed).toHaveProperty('id');
        expect(transformed).toHaveProperty('object');
        expect(transformed.object).toBe('chat.completion');
        expect(transformed).toHaveProperty('model');
        expect(transformed.model).toBe(model);
      }), { numRuns: 100 });
    });
  });
  describe('Azure Adapter', () => {
    const adapter = new AzureAdapter();
    it('should produce valid OpenAI ChatCompletionResponse for any valid Azure response', () => {
      fc.assert(fc.property(openAIStyleResponseArb, modelIdArb, (response, model) => {
        const transformed = adapter.transformResponse(response as unknown as ProviderResponse, model);
        expect(transformed).toHaveProperty('id');
        expect(transformed).toHaveProperty('object');
        expect(transformed.object).toBe('chat.completion');
        expect(transformed).toHaveProperty('model');
        expect(transformed.model).toBe(model);
      }), { numRuns: 100 });
    });
  });
});
