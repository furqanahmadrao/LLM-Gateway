// Property-based tests for Custom OpenAI-Compatible Provider Adapter
// **Feature: fix-and-harden, Property 4: Custom Provider Auth Header Construction**
// **Feature: fix-and-harden, Property 5: Custom Provider Models Path**

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import { CustomOpenAIAdapter, buildAuthHeaderValue, buildModelsEndpoint } from './custom.js';
import type { CustomProviderConfig } from '../types/providers.js';

// Generators for custom provider testing
// Use hexaString directly instead of filtering - more efficient
const apiKeyArb = fc.hexaString({ minLength: 32, maxLength: 64 });

const authValueTemplateArb = fc.constantFrom(
  'Bearer ${API_KEY}',
  '${API_KEY}',
  'ApiKey ${API_KEY}',
  'Token ${API_KEY}',
  'Basic ${API_KEY}'
);

const authHeaderNameArb = fc.constantFrom(
  'Authorization',
  'X-API-Key',
  'api-key',
  'X-Auth-Token'
);

const baseUrlArb = fc.constantFrom(
  'https://api.custom.com',
  'https://llm.example.org',
  'https://ai.company.io',
  'http://localhost:8080'
);

const modelsPathArb = fc.constantFrom(
  '/v1/models',
  '/models',
  '/api/models',
  '/api/v1/models',
  '/openai/v1/models'
);

const apiVersionArb = fc.option(
  fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
  { nil: undefined }
);

const customProviderConfigArb = fc.record({
  baseUrl: baseUrlArb,
  authHeaderName: fc.option(authHeaderNameArb, { nil: undefined }),
  authValueTemplate: fc.option(authValueTemplateArb, { nil: undefined }),
  apiVersion: apiVersionArb,
  modelsPath: fc.option(modelsPathArb, { nil: undefined }),
});


// **Feature: fix-and-harden, Property 4: Custom Provider Auth Header Construction**
// **Validates: Requirements 2.3, 2.6**
describe('Property 4: Custom Provider Auth Header Construction', () => {
  it('should replace ${API_KEY} placeholder with actual API key in auth header value', () => {
    fc.assert(fc.property(authValueTemplateArb, apiKeyArb, (template, apiKey) => {
      const result = buildAuthHeaderValue(template, apiKey);
      // The result should contain the API key
      expect(result).toContain(apiKey);
      // The result should NOT contain the placeholder
      expect(result).not.toContain('${API_KEY}');
      // The result should match the template with API key substituted
      const expected = template.replace('${API_KEY}', apiKey);
      expect(result).toBe(expected);
    }), { numRuns: 100 });
  });

  it('should use configured auth header name in buildHeaders', () => {
    fc.assert(fc.property(customProviderConfigArb, apiKeyArb, (config) => {
      const adapter = new CustomOpenAIAdapter('test-provider', 'Test Provider', config);
      const storedConfig = adapter.getConfig();
      expect(storedConfig.authHeaderName).toBe(config.authHeaderName);
      expect(storedConfig.authValueTemplate).toBe(config.authValueTemplate);
    }), { numRuns: 100 });
  });

  it('should default to Authorization header when authHeaderName is not provided', () => {
    fc.assert(fc.property(baseUrlArb, (baseUrl) => {
      const config: CustomProviderConfig = { baseUrl };
      const adapter = new CustomOpenAIAdapter('test-provider', 'Test Provider', config);
      const storedConfig = adapter.getConfig();
      // When not provided, authHeaderName should be undefined (defaults applied at runtime)
      expect(storedConfig.authHeaderName).toBeUndefined();
    }), { numRuns: 100 });
  });

  it('should default to Bearer ${API_KEY} template when authValueTemplate is not provided', () => {
    fc.assert(fc.property(baseUrlArb, (baseUrl) => {
      const config: CustomProviderConfig = { baseUrl };
      const adapter = new CustomOpenAIAdapter('test-provider', 'Test Provider', config);
      const storedConfig = adapter.getConfig();
      // When not provided, authValueTemplate should be undefined (defaults applied at runtime)
      expect(storedConfig.authValueTemplate).toBeUndefined();
    }), { numRuns: 100 });
  });
});


// **Feature: fix-and-harden, Property 5: Custom Provider Models Path**
// **Validates: Requirements 2.7**
describe('Property 5: Custom Provider Models Path', () => {
  it('should use configured modelsPath when provided', () => {
    fc.assert(fc.property(customProviderConfigArb, (config) => {
      const url = buildModelsEndpoint(config);
      const expectedPath = config.modelsPath || '/v1/models';
      // URL should start with baseUrl
      expect(url.startsWith(config.baseUrl)).toBe(true);
      // URL should contain the models path
      expect(url).toContain(expectedPath);
    }), { numRuns: 100 });
  });

  it('should default to /v1/models when modelsPath is not provided', () => {
    fc.assert(fc.property(baseUrlArb, (baseUrl) => {
      const config: CustomProviderConfig = { baseUrl };
      const url = buildModelsEndpoint(config);
      expect(url).toBe(`${baseUrl}/v1/models`);
    }), { numRuns: 100 });
  });

  it('should append api-version query parameter when apiVersion is provided', () => {
    fc.assert(fc.property(
      baseUrlArb,
      modelsPathArb,
      fc.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      (baseUrl, modelsPath, apiVersion) => {
        const config: CustomProviderConfig = { baseUrl, modelsPath, apiVersion };
        const url = buildModelsEndpoint(config);
        // URL should contain the api-version query parameter
        expect(url).toContain(`?api-version=${apiVersion}`);
        // URL should be properly formatted
        const expectedUrl = `${baseUrl}${modelsPath}?api-version=${apiVersion}`;
        expect(url).toBe(expectedUrl);
      }
    ), { numRuns: 100 });
  });

  it('should not append api-version when apiVersion is not provided', () => {
    fc.assert(fc.property(baseUrlArb, modelsPathArb, (baseUrl, modelsPath) => {
      const config: CustomProviderConfig = { baseUrl, modelsPath };
      const url = buildModelsEndpoint(config);
      // URL should NOT contain api-version
      expect(url).not.toContain('api-version');
      expect(url).not.toContain('?');
      // URL should be just baseUrl + modelsPath
      expect(url).toBe(`${baseUrl}${modelsPath}`);
    }), { numRuns: 100 });
  });

  it('should return correct models endpoint from adapter', () => {
    fc.assert(fc.property(customProviderConfigArb, (config) => {
      const adapter = new CustomOpenAIAdapter('test-provider', 'Test Provider', config);
      const url = adapter.getModelsEndpoint();
      const expectedPath = config.modelsPath || '/v1/models';
      // URL should start with baseUrl
      expect(url.startsWith(config.baseUrl)).toBe(true);
      // URL should contain the models path
      expect(url).toContain(expectedPath);
      // If apiVersion is provided, URL should contain it
      if (config.apiVersion) {
        expect(url).toContain(`api-version=${config.apiVersion}`);
      }
    }), { numRuns: 100 });
  });
});
