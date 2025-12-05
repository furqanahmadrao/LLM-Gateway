/**
 * API Routes
 * 
 * OpenAI-compatible API endpoints for the LLM Gateway.
 * Handles chat completions, completions, embeddings, and model listing.
 * 
 * Requirements: 3.1, 3.2, 3.3, 4.1
 */

import { Router, Request, Response, IRouter } from 'express';
import { authMiddleware } from '../middleware/auth.js';
import { resolveModelForRouting, ModelResolutionError } from '../services/router.js';
import { checkRateLimit } from '../services/rateLimiter.js';
import { incrementRequestCount, recordLatency, recordTokenUsage } from '../services/realMetrics.js';
import { extractUsageFromResponse, estimateUsage } from '../services/usage.js';
import { recordRequest } from '../services/metrics.js';
import type { ChatCompletionRequest, ChatCompletionResponse, ChatCompletionChunk, ErrorResponse } from '../types/chat.js';

const router: IRouter = Router();

/**
 * Create an error response in OpenAI format
 * 
 * @param message - Error message
 * @param type - Error type (e.g., 'invalid_request_error', 'provider_error')
 * @param code - Error code
 * @param param - Optional parameter that caused the error
 * @param provider - Optional provider ID for provider-related errors
 * 
 * Requirements: 6.3 - Include provider ID in error responses
 */
function createErrorResponse(
  message: string,
  type: string,
  code: string,
  param?: string,
  provider?: string
): ErrorResponse {
  return {
    error: {
      message,
      type,
      code,
      ...(param && { param }),
      ...(provider && { provider }),
    },
  };
}

/**
 * Validate chat completion request
 */
function validateChatCompletionRequest(body: unknown): { valid: true; request: ChatCompletionRequest } | { valid: false; error: ErrorResponse } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: createErrorResponse('Request body is required', 'invalid_request_error', 'invalid_request'),
    };
  }

  const req = body as Record<string, unknown>;

  if (!req.model || typeof req.model !== 'string') {
    return {
      valid: false,
      error: createErrorResponse('model is required and must be a string', 'invalid_request_error', 'invalid_request', 'model'),
    };
  }

  if (!req.messages || !Array.isArray(req.messages) || req.messages.length === 0) {
    return {
      valid: false,
      error: createErrorResponse('messages is required and must be a non-empty array', 'invalid_request_error', 'invalid_request', 'messages'),
    };
  }

  // Validate each message
  for (let i = 0; i < req.messages.length; i++) {
    const msg = req.messages[i] as Record<string, unknown>;
    if (!msg.role || typeof msg.role !== 'string') {
      return {
        valid: false,
        error: createErrorResponse(`messages[${i}].role is required and must be a string`, 'invalid_request_error', 'invalid_request', `messages[${i}].role`),
      };
    }
    if (!['system', 'user', 'assistant'].includes(msg.role)) {
      return {
        valid: false,
        error: createErrorResponse(`messages[${i}].role must be one of: system, user, assistant`, 'invalid_request_error', 'invalid_request', `messages[${i}].role`),
      };
    }
    if (typeof msg.content !== 'string') {
      return {
        valid: false,
        error: createErrorResponse(`messages[${i}].content must be a string`, 'invalid_request_error', 'invalid_request', `messages[${i}].content`),
      };
    }
  }

  // Validate optional parameters
  if (req.temperature !== undefined && (typeof req.temperature !== 'number' || req.temperature < 0 || req.temperature > 2)) {
    return {
      valid: false,
      error: createErrorResponse('temperature must be a number between 0 and 2', 'invalid_request_error', 'invalid_request', 'temperature'),
    };
  }

  if (req.max_tokens !== undefined && (typeof req.max_tokens !== 'number' || req.max_tokens < 1)) {
    return {
      valid: false,
      error: createErrorResponse('max_tokens must be a positive integer', 'invalid_request_error', 'invalid_request', 'max_tokens'),
    };
  }

  return {
    valid: true,
    request: body as ChatCompletionRequest,
  };
}

// Health check endpoint
// Requirements: 16.4
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const { getHealthStatus } = await import('../services/health.js');
    const health = await getHealthStatus();
    
    // Return appropriate status code based on health
    const statusCode = health.status === 'healthy' ? 200 : 
                       health.status === 'degraded' ? 200 : 503;
    
    res.status(statusCode).json(health);
  } catch (error) {
    console.error('Health check error:', error);
    res.status(503).json({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      error: 'Health check failed',
    });
  }
});

/**
 * GET /api/info
 * 
 * Returns API information including configured base URL and available endpoints.
 * Uses the configured base URL for self-referential links.
 * 
 * Requirements: 8.4, 8.5 - Display configured custom domain/path in API endpoints
 */
router.get('/api/info', async (_req: Request, res: Response) => {
  try {
    const { getBaseUrlConfig, buildApiUrl } = await import('../services/baseUrl.js');
    const config = getBaseUrlConfig();
    
    res.json({
      name: 'LLM Gateway',
      version: process.env.npm_package_version || '1.0.0',
      baseUrl: config.baseUrl,
      endpoints: {
        chatCompletions: buildApiUrl('/v1/chat/completions'),
        completions: buildApiUrl('/v1/completions'),
        embeddings: buildApiUrl('/v1/embeddings'),
        models: buildApiUrl('/v1/models'),
        health: buildApiUrl('/health'),
        metrics: buildApiUrl('/metrics'),
      },
      documentation: {
        openai: 'https://platform.openai.com/docs/api-reference',
        note: 'This gateway provides OpenAI-compatible endpoints',
      },
    });
  } catch (error) {
    console.error('Error getting API info:', error);
    res.status(500).json(createErrorResponse(
      'Failed to get API info',
      'internal_error',
      'info_error'
    ));
  }
});

/**
 * POST /v1/chat/completions
 * 
 * OpenAI-compatible chat completions endpoint.
 * Routes requests to the appropriate provider based on model ID.
 * Supports both streaming and non-streaming responses.
 * 
 * Requirements: 3.1, 4.1
 */
router.post('/v1/chat/completions', authMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Validate request
  const validation = validateChatCompletionRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }

  const chatRequest = validation.request;
  const teamId = req.auth!.teamId;
  const apiKeyId = req.auth!.keyId;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(apiKeyId);
  if (!rateLimitResult.allowed) {
    res.status(429)
      .set('Retry-After', String(rateLimitResult.retryAfter || 60))
      .set('X-RateLimit-Remaining', '0')
      .set('X-RateLimit-Reset', rateLimitResult.resetAt.toISOString())
      .json(createErrorResponse(
        'Rate limit exceeded. Please retry after the specified time.',
        'rate_limit_error',
        'rate_limit_exceeded'
      ));
    return;
  }

  // Resolve model to provider
  let routeResolution;
  try {
    routeResolution = await resolveModelForRouting(chatRequest.model, teamId);
  } catch (error) {
    if (error instanceof ModelResolutionError) {
      const statusCode = error.code === 'model_not_found' ? 404 : 
                         error.code === 'no_credentials' ? 401 : 500;
      res.status(statusCode).json(createErrorResponse(
        error.message,
        error.code === 'model_not_found' ? 'not_found_error' : 
        error.code === 'no_credentials' ? 'authentication_error' : 'internal_error',
        error.code
      ));
      return;
    }
    throw error;
  }

  const { adapter, credentials, model } = routeResolution;

  try {
    // Handle streaming vs non-streaming
    if (chatRequest.stream) {
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        // Stream response from provider
        const stream = adapter.chatCompletionStream(chatRequest, credentials);
        
        for await (const chunk of stream) {
          // Normalize chunk to OpenAI format
          const normalizedChunk: ChatCompletionChunk = {
            id: chunk.id,
            object: 'chat.completion.chunk',
            created: chunk.created,
            model: model.unifiedId,
            choices: chunk.choices,
          };
          
          res.write(`data: ${JSON.stringify(normalizedChunk)}\n\n`);
        }
        
        // Send done signal
        res.write('data: [DONE]\n\n');
        res.end();
        
        // Record streaming metrics after completion
        // For streaming, we estimate tokens since usage isn't always available
        const latencyMs = Date.now() - startTime;
        const estimatedUsage = estimateUsage(
          chatRequest.messages.map(m => ({ content: m.content })),
          '' // Response content not easily available in streaming
        );
        
        await Promise.all([
          incrementRequestCount(model.providerId, model.providerModelId),
          recordLatency(model.providerId, latencyMs),
          recordTokenUsage({
            apiKeyId,
            projectId: req.auth!.projectId,
            providerId: model.providerId,
            modelId: model.providerModelId,
            tokensIn: estimatedUsage.tokensIn,
            tokensOut: 0, // Streaming doesn't provide output token count easily
            cost: 0,
            latencyMs,
            statusCode: 200,
            errorMessage: null,
          }),
        ]);
        
        recordRequest(model.providerId, model.providerModelId, 200, latencyMs, estimatedUsage.tokensIn, 0);
      } catch (streamError) {
        // Handle streaming errors gracefully
        // Requirements: 6.3 - Include provider ID in error responses
        console.error('Streaming error:', streamError);
        const latencyMs = Date.now() - startTime;
        const errorMessage = streamError instanceof Error ? streamError.message : 'Streaming error';
        
        // Record error metrics for streaming
        await Promise.all([
          incrementRequestCount(model.providerId, model.providerModelId),
          recordLatency(model.providerId, latencyMs),
          recordTokenUsage({
            apiKeyId,
            projectId: req.auth!.projectId,
            providerId: model.providerId,
            modelId: model.providerModelId,
            tokensIn: 0,
            tokensOut: 0,
            cost: 0,
            latencyMs,
            statusCode: 502,
            errorMessage,
          }),
        ]);
        
        recordRequest(model.providerId, model.providerModelId, 502, latencyMs, 0, 0);
        
        // If headers already sent, just end the connection
        if (res.headersSent) {
          res.end();
        } else {
          res.status(502).json(createErrorResponse(
            'Provider streaming error',
            'provider_error',
            'streaming_error',
            undefined,
            model.providerId
          ));
        }
      }
    } else {
      // Non-streaming request
      const response = await adapter.chatCompletion(chatRequest, credentials);
      
      // Normalize response model to unified ID
      const normalizedResponse: ChatCompletionResponse = {
        ...response,
        model: model.unifiedId,
      };

      const latencyMs = Date.now() - startTime;
      
      // Extract actual token usage from provider response
      // Requirements: 6.5, 7.2 - Record actual token counts from provider response
      const usage = extractUsageFromResponse(response);
      const tokensIn = usage?.tokensIn ?? 0;
      const tokensOut = usage?.tokensOut ?? 0;
      
      // Record metrics in Redis and database
      await Promise.all([
        incrementRequestCount(model.providerId, model.providerModelId),
        recordLatency(model.providerId, latencyMs),
        recordTokenUsage({
          apiKeyId,
          projectId: req.auth!.projectId,
          providerId: model.providerId,
          modelId: model.providerModelId,
          tokensIn,
          tokensOut,
          cost: 0, // Cost calculation would require pricing config
          latencyMs,
          statusCode: 200,
          errorMessage: null,
        }),
      ]);
      
      // Also record to Prometheus metrics
      recordRequest(model.providerId, model.providerModelId, 200, latencyMs, tokensIn, tokensOut);
      
      res.setHeader('X-Request-Latency-Ms', String(latencyMs));
      res.json(normalizedResponse);
    }
  } catch (error) {
    // Requirements: 6.3 - Include provider ID in error responses
    console.error('Provider error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown provider error';
    const latencyMs = Date.now() - startTime;
    
    // Record error metrics
    await Promise.all([
      incrementRequestCount(model.providerId, model.providerModelId),
      recordLatency(model.providerId, latencyMs),
      recordTokenUsage({
        apiKeyId,
        projectId: req.auth!.projectId,
        providerId: model.providerId,
        modelId: model.providerModelId,
        tokensIn: 0,
        tokensOut: 0,
        cost: 0,
        latencyMs,
        statusCode: 502,
        errorMessage,
      }),
    ]);
    
    recordRequest(model.providerId, model.providerModelId, 502, latencyMs, 0, 0);
    
    res.status(502).json(createErrorResponse(
      `Provider error: ${errorMessage}`,
      'provider_error',
      'provider_error',
      undefined,
      model.providerId
    ));
  }
});

/**
 * Legacy completion request type
 */
interface CompletionRequest {
  model: string;
  prompt: string | string[];
  max_tokens?: number;
  temperature?: number;
  top_p?: number;
  n?: number;
  stream?: boolean;
  stop?: string | string[];
  presence_penalty?: number;
  frequency_penalty?: number;
}

/**
 * Legacy completion response type
 */
interface CompletionResponse {
  id: string;
  object: 'text_completion';
  created: number;
  model: string;
  choices: Array<{
    text: string;
    index: number;
    finish_reason: 'stop' | 'length' | null;
  }>;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Validate completion request
 */
function validateCompletionRequest(body: unknown): { valid: true; request: CompletionRequest } | { valid: false; error: ErrorResponse } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: createErrorResponse('Request body is required', 'invalid_request_error', 'invalid_request'),
    };
  }

  const req = body as Record<string, unknown>;

  if (!req.model || typeof req.model !== 'string') {
    return {
      valid: false,
      error: createErrorResponse('model is required and must be a string', 'invalid_request_error', 'invalid_request', 'model'),
    };
  }

  if (req.prompt === undefined || req.prompt === null) {
    return {
      valid: false,
      error: createErrorResponse('prompt is required', 'invalid_request_error', 'invalid_request', 'prompt'),
    };
  }

  if (typeof req.prompt !== 'string' && !Array.isArray(req.prompt)) {
    return {
      valid: false,
      error: createErrorResponse('prompt must be a string or array of strings', 'invalid_request_error', 'invalid_request', 'prompt'),
    };
  }

  if (Array.isArray(req.prompt)) {
    for (let i = 0; i < req.prompt.length; i++) {
      if (typeof req.prompt[i] !== 'string') {
        return {
          valid: false,
          error: createErrorResponse(`prompt[${i}] must be a string`, 'invalid_request_error', 'invalid_request', `prompt[${i}]`),
        };
      }
    }
  }

  return {
    valid: true,
    request: body as CompletionRequest,
  };
}

/**
 * Convert legacy completion request to chat completion request
 */
function completionToChatRequest(completionReq: CompletionRequest): ChatCompletionRequest {
  const prompt = Array.isArray(completionReq.prompt) 
    ? completionReq.prompt.join('\n') 
    : completionReq.prompt;

  return {
    model: completionReq.model,
    messages: [{ role: 'user', content: prompt }],
    max_tokens: completionReq.max_tokens,
    temperature: completionReq.temperature,
    top_p: completionReq.top_p,
    stream: completionReq.stream,
    stop: completionReq.stop,
    presence_penalty: completionReq.presence_penalty,
    frequency_penalty: completionReq.frequency_penalty,
  };
}

/**
 * Convert chat completion response to legacy completion response
 */
function chatToCompletionResponse(
  chatResponse: ChatCompletionResponse,
  unifiedModelId: string
): CompletionResponse {
  return {
    id: chatResponse.id,
    object: 'text_completion',
    created: chatResponse.created,
    model: unifiedModelId,
    choices: chatResponse.choices.map((choice, index) => ({
      text: choice.message.content,
      index,
      finish_reason: choice.finish_reason,
    })),
    usage: chatResponse.usage,
  };
}

/**
 * POST /v1/completions
 * 
 * Legacy completions endpoint (non-chat).
 * Converts to chat format and routes to providers.
 * 
 * Requirements: 3.2
 */
router.post('/v1/completions', authMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Validate request
  const validation = validateCompletionRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }

  const completionRequest = validation.request;
  const teamId = req.auth!.teamId;
  const apiKeyId = req.auth!.keyId;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(apiKeyId);
  if (!rateLimitResult.allowed) {
    res.status(429)
      .set('Retry-After', String(rateLimitResult.retryAfter || 60))
      .set('X-RateLimit-Remaining', '0')
      .set('X-RateLimit-Reset', rateLimitResult.resetAt.toISOString())
      .json(createErrorResponse(
        'Rate limit exceeded. Please retry after the specified time.',
        'rate_limit_error',
        'rate_limit_exceeded'
      ));
    return;
  }

  // Resolve model to provider
  let routeResolution;
  try {
    routeResolution = await resolveModelForRouting(completionRequest.model, teamId);
  } catch (error) {
    if (error instanceof ModelResolutionError) {
      const statusCode = error.code === 'model_not_found' ? 404 : 
                         error.code === 'no_credentials' ? 401 : 500;
      res.status(statusCode).json(createErrorResponse(
        error.message,
        error.code === 'model_not_found' ? 'not_found_error' : 
        error.code === 'no_credentials' ? 'authentication_error' : 'internal_error',
        error.code
      ));
      return;
    }
    throw error;
  }

  const { adapter, credentials, model } = routeResolution;

  // Convert to chat format
  const chatRequest = completionToChatRequest(completionRequest);

  try {
    // Handle streaming vs non-streaming
    if (completionRequest.stream) {
      // Set up SSE headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders();

      try {
        const stream = adapter.chatCompletionStream(chatRequest, credentials);
        
        for await (const chunk of stream) {
          // Convert chat chunk to completion chunk format
          const completionChunk = {
            id: chunk.id,
            object: 'text_completion',
            created: chunk.created,
            model: model.unifiedId,
            choices: chunk.choices.map((choice, index) => ({
              text: choice.delta.content || '',
              index,
              finish_reason: choice.finish_reason,
            })),
          };
          
          res.write(`data: ${JSON.stringify(completionChunk)}\n\n`);
        }
        
        res.write('data: [DONE]\n\n');
        res.end();
      } catch (streamError) {
        // Requirements: 6.3 - Include provider ID in error responses
        console.error('Streaming error:', streamError);
        if (res.headersSent) {
          res.end();
        } else {
          res.status(502).json(createErrorResponse(
            'Provider streaming error',
            'provider_error',
            'streaming_error',
            undefined,
            model.providerId
          ));
        }
      }
    } else {
      // Non-streaming request
      const chatResponse = await adapter.chatCompletion(chatRequest, credentials);
      const completionResponse = chatToCompletionResponse(chatResponse, model.unifiedId);

      const latencyMs = Date.now() - startTime;
      res.setHeader('X-Request-Latency-Ms', String(latencyMs));
      res.json(completionResponse);
    }
  } catch (error) {
    // Requirements: 6.3 - Include provider ID in error responses
    console.error('Provider error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown provider error';
    res.status(502).json(createErrorResponse(
      `Provider error: ${errorMessage}`,
      'provider_error',
      'provider_error',
      undefined,
      model.providerId
    ));
  }
});

/**
 * Embeddings request type
 */
interface EmbeddingsRequest {
  model: string;
  input: string | string[];
  encoding_format?: 'float' | 'base64';
}

/**
 * Embeddings response type
 */
interface EmbeddingsResponse {
  object: 'list';
  data: Array<{
    object: 'embedding';
    embedding: number[];
    index: number;
  }>;
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;
  };
}

/**
 * Validate embeddings request
 */
function validateEmbeddingsRequest(body: unknown): { valid: true; request: EmbeddingsRequest } | { valid: false; error: ErrorResponse } {
  if (!body || typeof body !== 'object') {
    return {
      valid: false,
      error: createErrorResponse('Request body is required', 'invalid_request_error', 'invalid_request'),
    };
  }

  const req = body as Record<string, unknown>;

  if (!req.model || typeof req.model !== 'string') {
    return {
      valid: false,
      error: createErrorResponse('model is required and must be a string', 'invalid_request_error', 'invalid_request', 'model'),
    };
  }

  if (req.input === undefined || req.input === null) {
    return {
      valid: false,
      error: createErrorResponse('input is required', 'invalid_request_error', 'invalid_request', 'input'),
    };
  }

  if (typeof req.input !== 'string' && !Array.isArray(req.input)) {
    return {
      valid: false,
      error: createErrorResponse('input must be a string or array of strings', 'invalid_request_error', 'invalid_request', 'input'),
    };
  }

  if (Array.isArray(req.input)) {
    for (let i = 0; i < req.input.length; i++) {
      if (typeof req.input[i] !== 'string') {
        return {
          valid: false,
          error: createErrorResponse(`input[${i}] must be a string`, 'invalid_request_error', 'invalid_request', `input[${i}]`),
        };
      }
    }
  }

  return {
    valid: true,
    request: body as EmbeddingsRequest,
  };
}

/**
 * POST /v1/embeddings
 * 
 * Embeddings endpoint for generating vector representations.
 * Routes to embedding-capable providers.
 * 
 * Requirements: 3.3
 */
router.post('/v1/embeddings', authMiddleware, async (req: Request, res: Response) => {
  const startTime = Date.now();

  // Validate request
  const validation = validateEmbeddingsRequest(req.body);
  if (!validation.valid) {
    res.status(400).json(validation.error);
    return;
  }

  const embeddingsRequest = validation.request;
  const teamId = req.auth!.teamId;
  const apiKeyId = req.auth!.keyId;

  // Check rate limit
  const rateLimitResult = await checkRateLimit(apiKeyId);
  if (!rateLimitResult.allowed) {
    res.status(429)
      .set('Retry-After', String(rateLimitResult.retryAfter || 60))
      .set('X-RateLimit-Remaining', '0')
      .set('X-RateLimit-Reset', rateLimitResult.resetAt.toISOString())
      .json(createErrorResponse(
        'Rate limit exceeded. Please retry after the specified time.',
        'rate_limit_error',
        'rate_limit_exceeded'
      ));
    return;
  }

  // Resolve model to provider
  let routeResolution;
  try {
    routeResolution = await resolveModelForRouting(embeddingsRequest.model, teamId);
  } catch (error) {
    if (error instanceof ModelResolutionError) {
      const statusCode = error.code === 'model_not_found' ? 404 : 
                         error.code === 'no_credentials' ? 401 : 500;
      res.status(statusCode).json(createErrorResponse(
        error.message,
        error.code === 'model_not_found' ? 'not_found_error' : 
        error.code === 'no_credentials' ? 'authentication_error' : 'internal_error',
        error.code
      ));
      return;
    }
    throw error;
  }

  const { credentials, model } = routeResolution;

  try {
    // Make embeddings request to provider
    // For now, we only support OpenAI-compatible embeddings endpoints
    const baseUrl = 'https://api.openai.com/v1';
    const inputs = Array.isArray(embeddingsRequest.input) 
      ? embeddingsRequest.input 
      : [embeddingsRequest.input];

    // Extract model ID without provider prefix
    const providerModelId = model.providerModelId;

    const response = await fetch(`${baseUrl}/embeddings`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${credentials.apiKey}`,
      },
      body: JSON.stringify({
        model: providerModelId,
        input: inputs,
        encoding_format: embeddingsRequest.encoding_format || 'float',
      }),
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`Embeddings request failed: ${response.status} - ${errorData}`);
    }

    const providerResponse = await response.json() as EmbeddingsResponse;

    // Normalize response with unified model ID
    const normalizedResponse: EmbeddingsResponse = {
      ...providerResponse,
      model: model.unifiedId,
    };

    const latencyMs = Date.now() - startTime;
    res.setHeader('X-Request-Latency-Ms', String(latencyMs));
    res.json(normalizedResponse);
  } catch (error) {
    // Requirements: 6.3 - Include provider ID in error responses
    console.error('Embeddings error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown embeddings error';
    res.status(502).json(createErrorResponse(
      `Provider error: ${errorMessage}`,
      'provider_error',
      'provider_error',
      undefined,
      model.providerId
    ));
  }
});

/**
 * Model list response type
 */
interface ModelListResponse {
  object: 'list';
  data: Array<{
    id: string;
    object: 'model';
    created: number;
    owned_by: string;
    permission?: unknown[];
    root?: string;
    parent?: string | null;
  }>;
}

/**
 * GET /v1/models
 * 
 * Returns combined list of all available models with unified IDs and aliases.
 * 
 * Requirements: 2.2, 15.3
 */
router.get('/v1/models', authMiddleware, async (req: Request, res: Response) => {
  const teamId = req.auth!.teamId;

  try {
    // Import model functions
    const { getModelsForTeam } = await import('../services/providerConfig.js');
    const { getAliasesByTeamId } = await import('../db/repositories/models.js');

    // Get all models for the team
    const models = await getModelsForTeam(teamId);
    
    // Get all aliases for the team
    const aliases = await getAliasesByTeamId(teamId);
    
    // Create a map of model ID to aliases
    const modelAliasMap = new Map<string, string[]>();
    for (const alias of aliases) {
      const existing = modelAliasMap.get(alias.modelId) || [];
      existing.push(alias.alias);
      modelAliasMap.set(alias.modelId, existing);
    }

    // Build response data
    const modelData: ModelListResponse['data'] = [];
    const now = Math.floor(Date.now() / 1000);

    // Add models with unified IDs
    for (const model of models) {
      modelData.push({
        id: model.unifiedId,
        object: 'model',
        created: now,
        owned_by: model.providerId,
        root: model.unifiedId,
        parent: null,
      });

      // Add aliases as separate entries pointing to the same model
      const modelAliases = modelAliasMap.get(model.id) || [];
      for (const alias of modelAliases) {
        modelData.push({
          id: alias,
          object: 'model',
          created: now,
          owned_by: model.providerId,
          root: model.unifiedId,
          parent: model.unifiedId,
        });
      }
    }

    const response: ModelListResponse = {
      object: 'list',
      data: modelData,
    };

    res.json(response);
  } catch (error) {
    console.error('Error fetching models:', error);
    res.status(500).json(createErrorResponse(
      'Failed to fetch models',
      'internal_error',
      'model_fetch_error'
    ));
  }
});

// Metrics endpoint for Prometheus
// Requirements: 16.1
router.get('/metrics', async (_req: Request, res: Response) => {
  try {
    const { getMetrics } = await import('../services/metrics.js');
    const metricsOutput = getMetrics();
    res.set('Content-Type', 'text/plain; version=0.0.4; charset=utf-8');
    res.send(metricsOutput);
  } catch (error) {
    console.error('Error generating metrics:', error);
    res.status(500).send('# Error generating metrics\n');
  }
});

/**
 * POST /api/providers/:providerId/refresh-models
 * 
 * Manually trigger a model refresh for a specific provider.
 * Fetches the latest model list from the provider and updates the database.
 * 
 * Requirements: 4.4 - Trigger immediate model fetch when refresh is requested
 */
router.post('/api/providers/:providerId/refresh-models', authMiddleware, async (req: Request, res: Response) => {
  const { providerId } = req.params;
  const teamId = req.auth!.teamId;

  if (!providerId) {
    res.status(400).json(createErrorResponse(
      'providerId is required',
      'invalid_request_error',
      'missing_provider_id'
    ));
    return;
  }

  try {
    const { refreshModelsByProviderId } = await import('../services/modelFetch.js');
    const result = await refreshModelsByProviderId(teamId, providerId);

    if (!result.success) {
      res.status(400).json(createErrorResponse(
        result.error || 'Failed to refresh models',
        'provider_error',
        'model_refresh_failed'
      ));
      return;
    }

    res.json({
      success: true,
      providerId,
      modelsCount: result.modelsCount,
      models: result.models.map(m => ({
        id: m.id,
        unifiedId: m.unifiedId,
        displayName: m.displayName,
        contextLength: m.contextLength,
      })),
    });
  } catch (error) {
    console.error('Error refreshing models:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json(createErrorResponse(
      `Failed to refresh models: ${errorMessage}`,
      'internal_error',
      'model_refresh_error'
    ));
  }
});

/**
 * GET /api/dashboard/metrics
 * 
 * Returns real-time and aggregated metrics for the dashboard.
 * Replaces any static/simulated data with real queries.
 * 
 * Requirements: 7.1, 7.4 - Dashboard reads from actual usage logs and Redis counters
 */
router.get('/api/dashboard/metrics', authMiddleware, async (req: Request, res: Response) => {
  const teamId = req.auth!.teamId;
  
  try {
    const { getRealTimeMetrics, getAggregatedMetrics } = await import('../services/realMetrics.js');
    
    // Get time range from query params (default to last 24 hours)
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000);
    
    // Fetch real metrics from Redis and database
    const [realTimeMetrics, aggregatedMetrics] = await Promise.all([
      getRealTimeMetrics(),
      getAggregatedMetrics(startDate, endDate, teamId),
    ]);
    
    res.json({
      realTime: realTimeMetrics,
      aggregated: aggregatedMetrics,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching dashboard metrics:', error);
    res.status(500).json(createErrorResponse(
      'Failed to fetch dashboard metrics',
      'internal_error',
      'metrics_fetch_error'
    ));
  }
});

/**
 * GET /api/dashboard/metrics/timeseries
 * 
 * Returns time series metrics for charts.
 * 
 * Requirements: 7.3 - Aggregate data from usage_logs table for charts
 */
router.get('/api/dashboard/metrics/timeseries', authMiddleware, async (req: Request, res: Response) => {
  const teamId = req.auth!.teamId;
  
  try {
    const { getMetricsTimeSeries } = await import('../services/realMetrics.js');
    
    // Parse query params
    const granularity = (req.query.granularity as 'hour' | 'day') || 'hour';
    const hours = parseInt(req.query.hours as string) || 24;
    
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - hours * 60 * 60 * 1000);
    
    const timeSeries = await getMetricsTimeSeries(startDate, endDate, granularity, teamId);
    
    res.json({
      data: timeSeries,
      granularity,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching metrics time series:', error);
    res.status(500).json(createErrorResponse(
      'Failed to fetch metrics time series',
      'internal_error',
      'timeseries_fetch_error'
    ));
  }
});

/**
 * GET /api/dashboard/usage
 * 
 * Returns usage summary for the team.
 * 
 * Requirements: 7.1 - Display real usage data
 */
router.get('/api/dashboard/usage', authMiddleware, async (req: Request, res: Response) => {
  const teamId = req.auth!.teamId;
  
  try {
    const { getUsageByProvider } = await import('../services/usage.js');
    
    // Parse query params for date range
    const endDate = req.query.endDate ? new Date(req.query.endDate as string) : new Date();
    const startDate = req.query.startDate 
      ? new Date(req.query.startDate as string) 
      : new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000); // Default 30 days
    
    const usageByProvider = await getUsageByProvider(teamId, startDate, endDate);
    
    // Calculate totals
    const totals = usageByProvider.reduce(
      (acc, provider) => ({
        totalTokensIn: acc.totalTokensIn + provider.tokensIn,
        totalTokensOut: acc.totalTokensOut + provider.tokensOut,
        totalCost: acc.totalCost + provider.cost,
        totalRequests: acc.totalRequests + provider.requestCount,
      }),
      { totalTokensIn: 0, totalTokensOut: 0, totalCost: 0, totalRequests: 0 }
    );
    
    res.json({
      byProvider: usageByProvider,
      totals,
      period: {
        start: startDate.toISOString(),
        end: endDate.toISOString(),
      },
    });
  } catch (error) {
    console.error('Error fetching usage data:', error);
    res.status(500).json(createErrorResponse(
      'Failed to fetch usage data',
      'internal_error',
      'usage_fetch_error'
    ));
  }
});

export default router;
