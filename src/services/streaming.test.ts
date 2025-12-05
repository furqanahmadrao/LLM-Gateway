/**
 * Property-based tests for Streaming Response Normalization
 * **Feature: llm-gateway, Property 9: Streaming Chunk Normalization**
 * **Validates: Requirements 4.2**
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  normalizeOpenAIChunk,
  normalizeAnthropicEvent,
  normalizeAzureChunk,
  normalizeProviderChunk,
  isValidOpenAIChunk,
  parseSSEData,
  formatSSEChunk,
  formatSSEDone,
  type OpenAIStreamChunk,
  type AnthropicStreamEvent,
} from './streaming.js';

// Arbitraries for generating test data
const unifiedModelIdArb = fc.tuple(
  fc.constantFrom('openai', 'anthropic', 'azure'),
  fc.stringMatching(/^[a-z0-9][a-z0-9._-]{0,20}$/)
).map(([provider, model]) => `${provider}:${model}`);

const messageIdArb = fc.stringMatching(/^chatcmpl-[a-z0-9]{10,20}$/);

const openAIStreamChunkArb: fc.Arbitrary<OpenAIStreamChunk> = fc.record({
  id: fc.string({ minLength: 1, maxLength: 50 }),
  object: fc.constant('chat.completion.chunk'),
  created: fc.integer({ min: 1000000000, max: 2000000000 }),
  model: fc.string({ minLength: 1, maxLength: 50 }),
  choices: fc.array(
    fc.record({
      index: fc.nat({ max: 10 }),
      delta: fc.record({
        role: fc.option(fc.constantFrom('assistant' as const), { nil: undefined }),
        content: fc.option(fc.string({ minLength: 0, maxLength: 100 }), { nil: undefined }),
      }),
      finish_reason: fc.constantFrom('stop', 'length', null),
    }),
    { minLength: 1, maxLength: 1 }
  ),
});

const anthropicContentDeltaEventArb: fc.Arbitrary<AnthropicStreamEvent> = fc.record({
  type: fc.constant('content_block_delta'),
  delta: fc.record({
    type: fc.constant('text_delta'),
    text: fc.string({ minLength: 1, maxLength: 100 }),
  }),
});

const anthropicMessageDeltaEventArb: fc.Arbitrary<AnthropicStreamEvent> = fc.record({
  type: fc.constant('message_delta'),
  delta: fc.record({
    type: fc.constant('message_delta'),
    stop_reason: fc.constantFrom('end_turn', 'max_tokens'),
  }),
});

const anthropicContentBlockStartEventArb: fc.Arbitrary<AnthropicStreamEvent> = fc.record({
  type: fc.constant('content_block_start'),
  index: fc.nat({ max: 10 }),
  content_block: fc.record({
    type: fc.constant('text'),
    text: fc.constant(''),
  }),
});

const anthropicStreamEventArb = fc.oneof(
  anthropicContentDeltaEventArb,
  anthropicMessageDeltaEventArb,
  anthropicContentBlockStartEventArb
);

describe('Property 9: Streaming Chunk Normalization', () => {
  describe('OpenAI chunk normalization', () => {
    it('should produce valid OpenAI SSE chunk format for any OpenAI stream chunk', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeOpenAIChunk(chunk, unifiedModelId);
          
          // Verify structure
          expect(normalized).toHaveProperty('id');
          expect(typeof normalized.id).toBe('string');
          
          expect(normalized).toHaveProperty('object');
          expect(normalized.object).toBe('chat.completion.chunk');
          
          expect(normalized).toHaveProperty('created');
          expect(typeof normalized.created).toBe('number');
          
          expect(normalized).toHaveProperty('model');
          expect(normalized.model).toBe(unifiedModelId);
          
          expect(normalized).toHaveProperty('choices');
          expect(Array.isArray(normalized.choices)).toBe(true);
          expect(normalized.choices.length).toBe(1);
          
          const choice = normalized.choices[0];
          expect(choice).toHaveProperty('index');
          expect(typeof choice.index).toBe('number');
          
          expect(choice).toHaveProperty('delta');
          expect(typeof choice.delta).toBe('object');
          
          expect(choice).toHaveProperty('finish_reason');
          expect([null, 'stop', 'length']).toContain(choice.finish_reason);
          
          // Verify it passes validation
          expect(isValidOpenAIChunk(normalized)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve original chunk ID', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeOpenAIChunk(chunk, unifiedModelId);
          expect(normalized.id).toBe(chunk.id);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should preserve created timestamp', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeOpenAIChunk(chunk, unifiedModelId);
          expect(normalized.created).toBe(chunk.created);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should use unified model ID instead of provider model', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeOpenAIChunk(chunk, unifiedModelId);
          expect(normalized.model).toBe(unifiedModelId);
          expect(normalized.model).not.toBe(chunk.model);
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Anthropic event normalization', () => {
    it('should produce valid OpenAI SSE chunk format for content_block_delta events', () => {
      fc.assert(
        fc.property(
          anthropicContentDeltaEventArb,
          messageIdArb,
          unifiedModelIdArb,
          (event, messageId, unifiedModelId) => {
            const normalized = normalizeAnthropicEvent(event, messageId, unifiedModelId);
            
            // Should produce a chunk for content delta
            expect(normalized).not.toBeNull();
            if (normalized) {
              expect(normalized.object).toBe('chat.completion.chunk');
              expect(normalized.model).toBe(unifiedModelId);
              expect(normalized.choices[0].delta.content).toBe(event.delta?.text);
              expect(isValidOpenAIChunk(normalized)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should correctly map Anthropic stop reasons to OpenAI format', () => {
      fc.assert(
        fc.property(
          anthropicMessageDeltaEventArb,
          messageIdArb,
          unifiedModelIdArb,
          (event, messageId, unifiedModelId) => {
            const normalized = normalizeAnthropicEvent(event, messageId, unifiedModelId);
            
            expect(normalized).not.toBeNull();
            if (normalized) {
              const stopReason = event.delta?.stop_reason;
              if (stopReason === 'end_turn') {
                expect(normalized.choices[0].finish_reason).toBe('stop');
              } else if (stopReason === 'max_tokens') {
                expect(normalized.choices[0].finish_reason).toBe('length');
              }
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should produce role delta for content_block_start events', () => {
      fc.assert(
        fc.property(
          anthropicContentBlockStartEventArb,
          messageIdArb,
          unifiedModelIdArb,
          (event, messageId, unifiedModelId) => {
            const normalized = normalizeAnthropicEvent(event, messageId, unifiedModelId);
            
            expect(normalized).not.toBeNull();
            if (normalized) {
              expect(normalized.choices[0].delta.role).toBe('assistant');
              expect(isValidOpenAIChunk(normalized)).toBe(true);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
  });

  describe('Azure chunk normalization', () => {
    it('should produce valid OpenAI SSE chunk format (same as OpenAI)', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeAzureChunk(chunk, unifiedModelId);
          
          expect(normalized.object).toBe('chat.completion.chunk');
          expect(normalized.model).toBe(unifiedModelId);
          expect(isValidOpenAIChunk(normalized)).toBe(true);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('Generic provider chunk normalization', () => {
    it('should normalize OpenAI provider chunks correctly', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeProviderChunk(chunk, 'openai', unifiedModelId);
          
          expect(normalized).not.toBeNull();
          if (normalized) {
            expect(isValidOpenAIChunk(normalized)).toBe(true);
            expect(normalized.model).toBe(unifiedModelId);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should normalize Anthropic provider events correctly', () => {
      fc.assert(
        fc.property(
          anthropicStreamEventArb,
          unifiedModelIdArb,
          messageIdArb,
          (event, unifiedModelId, messageId) => {
            const normalized = normalizeProviderChunk(event, 'anthropic', unifiedModelId, messageId);
            
            // Some events may not produce chunks
            if (normalized) {
              expect(isValidOpenAIChunk(normalized)).toBe(true);
              expect(normalized.model).toBe(unifiedModelId);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should normalize Azure provider chunks correctly', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeProviderChunk(chunk, 'azure', unifiedModelId);
          
          expect(normalized).not.toBeNull();
          if (normalized) {
            expect(isValidOpenAIChunk(normalized)).toBe(true);
            expect(normalized.model).toBe(unifiedModelId);
          }
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });

  describe('SSE formatting', () => {
    it('should format chunks as valid SSE data', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeOpenAIChunk(chunk, unifiedModelId);
          const formatted = formatSSEChunk(normalized);
          
          // Should start with 'data: '
          expect(formatted.startsWith('data: ')).toBe(true);
          
          // Should end with double newline
          expect(formatted.endsWith('\n\n')).toBe(true);
          
          // Should be parseable JSON after removing prefix
          const jsonStr = formatted.slice(6, -2);
          const parsed = JSON.parse(jsonStr);
          expect(parsed.id).toBe(normalized.id);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should format done signal correctly', () => {
      const done = formatSSEDone();
      expect(done).toBe('data: [DONE]\n\n');
    });
  });

  describe('SSE parsing', () => {
    it('should parse SSE data lines correctly', () => {
      // Generate non-empty, non-whitespace-only strings (since parseSSEData trims and filters empty)
      // Also ensure strings don't have leading/trailing whitespace since parseSSEData trims
      const nonEmptyTrimmedStringArb = fc.string({ minLength: 1, maxLength: 100 })
        .map(s => s.trim())
        .filter(s => s.length > 0);
      
      fc.assert(
        fc.property(
          fc.array(nonEmptyTrimmedStringArb, { minLength: 1, maxLength: 5 }),
          (dataStrings) => {
            // Create SSE formatted string
            const sseString = dataStrings.map(d => `data: ${d}`).join('\n');
            const parsed = parseSSEData(sseString);
            
            expect(parsed.length).toBe(dataStrings.length);
            for (let i = 0; i < dataStrings.length; i++) {
              expect(parsed[i]).toBe(dataStrings[i]);
            }
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });

    it('should filter out [DONE] signals', () => {
      const sseString = 'data: {"test": 1}\ndata: [DONE]\ndata: {"test": 2}';
      const parsed = parseSSEData(sseString);
      
      expect(parsed.length).toBe(2);
      expect(parsed).not.toContain('[DONE]');
    });

    it('should ignore non-data lines', () => {
      const sseString = 'event: message\ndata: {"test": 1}\nid: 123\ndata: {"test": 2}';
      const parsed = parseSSEData(sseString);
      
      expect(parsed.length).toBe(2);
    });
  });

  describe('Chunk validation', () => {
    it('should validate correct chunks as valid', () => {
      fc.assert(
        fc.property(openAIStreamChunkArb, unifiedModelIdArb, (chunk, unifiedModelId) => {
          const normalized = normalizeOpenAIChunk(chunk, unifiedModelId);
          expect(isValidOpenAIChunk(normalized)).toBe(true);
          return true;
        }),
        { numRuns: 100 }
      );
    });

    it('should reject invalid chunks', () => {
      const invalidChunks = [
        null,
        undefined,
        {},
        { id: 123 }, // id should be string
        { id: 'test', object: 'wrong' }, // wrong object type
        { id: 'test', object: 'chat.completion.chunk', created: 'not a number' },
        { id: 'test', object: 'chat.completion.chunk', created: 123, model: 456 },
        { id: 'test', object: 'chat.completion.chunk', created: 123, model: 'test', choices: 'not array' },
      ];

      for (const invalid of invalidChunks) {
        expect(isValidOpenAIChunk(invalid)).toBe(false);
      }
    });
  });
});
