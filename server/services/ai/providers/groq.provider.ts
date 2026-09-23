/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 9: Groq Cloud Inference Provider
 *
 * Implements IAIProvider for server-side generation using Groq's high-speed inference API.
 * Communicates exclusively over server-side HTTP (OpenAI-compatible /chat/completions endpoint).
 *
 * STRICT SECURITY MANDATE:
 * - GROQ_API_KEY is server-only and NEVER exposed to frontend code or client responses.
 * - Raw API keys, auth headers, and client secrets are NEVER logged or output in telemetry.
 * - Missing or invalid API keys fail safely with normalized AIProviderAuthenticationError.
 * - When Groq is offline or unavailable, fails safely with AIProviderUnavailableError.
 * - Does NOT replace BGE embeddings or Qdrant vector retrieval.
 */

import type { IAIProvider } from '../provider.interface.js';
import type { AIRequest, AIResponse, AIProviderHealth, AIMessage } from '../types.js';
import {
  AIProviderUnavailableError,
  AIProviderTimeoutError,
  AIProviderRateLimitedError,
  AIProviderAuthenticationError,
  AIStructuredOutputError,
} from '../errors.js';

export interface GroqProviderOptions {
  apiKey?: string;
  modelName?: string;
  baseUrl?: string;
  timeoutMs?: number;
  /** Injectable custom fetch for isolated unit testing */
  fetchFn?: typeof fetch;
}

export class GroqProvider implements IAIProvider {
  public readonly id = 'groq';
  public readonly name = 'Groq Cloud Inference Provider';
  public readonly modelName: string;
  public readonly isDevelopment = false;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchFn: typeof fetch;

  constructor(options?: GroqProviderOptions) {
    this.apiKey = (options?.apiKey ?? process.env.GROQ_API_KEY ?? '').trim();
    this.modelName = (
      options?.modelName ??
      process.env.GROQ_MODEL ??
      process.env.AI_MODEL ??
      'llama-3.3-70b-versatile'
    ).trim();
    this.baseUrl = (options?.baseUrl ?? 'https://api.groq.com/openai/v1').replace(/\/+$/, '');
    this.timeoutMs = options?.timeoutMs ?? 30_000;
    this.fetchFn = options?.fetchFn ?? fetch;
  }

  /**
   * Generates a single-turn completion for the given AI request.
   */
  public async generate(request: AIRequest): Promise<AIResponse> {
    const messages: AIMessage[] = [];

    // If tenant-isolated retrieval context is provided, attach as system context
    if (request.retrievedContext && request.retrievedContext.length > 0) {
      const contextBlocks = request.retrievedContext
        .map((ctx, idx) => `[Source ${idx + 1}: ${ctx.materialTitle || 'Material'} - ${ctx.sectionTitle || 'Section'}]\n${ctx.text}`)
        .join('\n\n');
      messages.push({
        role: 'system',
        content: `Relevant study materials:\n${contextBlocks}\n\nUse this information accurately to answer the student's request.`,
      });
    }

    if (request.prompt) {
      messages.push({
        role: 'user',
        content: request.prompt,
      });
    }

    return this.executeChatCompletion(request, messages);
  }

  /**
   * Generates a multi-turn completion for sequential messages in the AI request.
   */
  public async chat(request: AIRequest): Promise<AIResponse> {
    const messages: AIMessage[] = [];

    if (request.retrievedContext && request.retrievedContext.length > 0) {
      const contextBlocks = request.retrievedContext
        .map((ctx, idx) => `[Source ${idx + 1}: ${ctx.materialTitle || 'Material'} - ${ctx.sectionTitle || 'Section'}]\n${ctx.text}`)
        .join('\n\n');
      messages.push({
        role: 'system',
        content: `Relevant study materials:\n${contextBlocks}\n\nUse this information accurately to answer the student's request.`,
      });
    }

    if (request.messages && request.messages.length > 0) {
      messages.push(...request.messages);
    } else if (request.prompt) {
      messages.push({
        role: 'user',
        content: request.prompt,
      });
    }

    return this.executeChatCompletion(request, messages);
  }

  /**
   * Executes HTTP request to Groq /chat/completions endpoint.
   */
  private async executeChatCompletion(request: AIRequest, messages: AIMessage[]): Promise<AIResponse> {
    const startTime = Date.now();

    // 1. Enforce server-side API key presence
    if (!this.apiKey) {
      throw new AIProviderAuthenticationError(
        'GROQ_API_KEY is not configured on the server. Please check server environment settings.'
      );
    }

    // 2. Prepare payload
    const payload: Record<string, any> = {
      model: this.modelName,
      messages,
      temperature: request.temperature ?? 0.7,
      max_tokens: request.maxTokens ?? 1500,
      stream: false,
    };

    if (request.responseFormat === 'json_schema' && request.jsonSchema) {
      payload.response_format = {
        type: 'json_schema',
        json_schema: {
          name: request.jsonSchema.name,
          ...(request.jsonSchema.description ? { description: request.jsonSchema.description } : {}),
          strict: request.jsonSchema.strict ?? false,
          schema: request.jsonSchema.schema,
        },
      };
    } else if (request.responseFormat === 'json_object' || request.responseFormat === 'json_schema') {
      payload.response_format = { type: 'json_object' };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: globalThis.Response;
    const endpoint = `${this.baseUrl}/chat/completions`;

    try {
      res = await this.fetchFn(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      // If json_schema is rejected by model/endpoint with HTTP 400, retry once with json_object mode
      if (res.status === 400 && payload.response_format?.type === 'json_schema') {
        const fallbackPayload = {
          ...payload,
          response_format: { type: 'json_object' },
        };
        try {
          const fallbackRes = await this.fetchFn(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(fallbackPayload),
            signal: controller.signal,
          });
          if (fallbackRes.ok) {
            res = fallbackRes;
          }
        } catch {
          // Ignore fallback network error and allow main error handling to run
        }
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || err.message?.includes('aborted')) {
        throw new AIProviderTimeoutError(`Groq generation request timed out after ${this.timeoutMs}ms.`);
      }
      throw new AIProviderUnavailableError(
        `Unable to reach Groq inference service: ${err.message || 'Network connection failed.'}`
      );
    } finally {
      clearTimeout(timer);
    }

    // 3. Handle HTTP status codes
    if (!res.ok) {
      let errorBody = '';
      try {
        errorBody = await res.text();
      } catch {
        // Ignore read failure
      }

      if (res.status === 401 || res.status === 403) {
        throw new AIProviderAuthenticationError('Invalid or unauthorized Groq API key.');
      }
      if (res.status === 429) {
        throw new AIProviderRateLimitedError('Groq API rate limit encountered. Please retry in a few moments.');
      }
      if (res.status === 504 || res.status === 408) {
        throw new AIProviderTimeoutError('Upstream Groq request timed out.');
      }
      if (res.status >= 500) {
        throw new AIProviderUnavailableError('Groq inference service is currently unavailable or returned an internal error.');
      }

      throw new AIProviderUnavailableError(
        `Groq API returned HTTP error ${res.status}: ${res.statusText || 'Unknown error'}`
      );
    }

    // 4. Parse response JSON
    let data: any;
    try {
      data = await res.json();
    } catch (err: any) {
      throw new AIProviderUnavailableError('Failed to parse response from Groq API as JSON.');
    }

    const choice = data?.choices?.[0];
    if (!choice || !choice.message) {
      throw new AIProviderUnavailableError('Malformed or empty choice returned by Groq API.');
    }

    const generatedText = choice.message.content ?? '';
    const finishReason = choice.finish_reason === 'length' ? 'length' : 'stop';

    // 5. Handle structured JSON if requested
    let parsedJson: any = undefined;
    if (request.responseFormat === 'json_object' || request.responseFormat === 'json_schema') {
      try {
        parsedJson = JSON.parse(generatedText);
      } catch (err: any) {
        throw new AIStructuredOutputError(
          `Groq returned invalid JSON for structured generation: ${err.message}`
        );
      }
    }

    const latencyMs = Date.now() - startTime;

    return {
      requestId: request.requestId,
      provider: this.id,
      model: data.model || this.modelName,
      text: generatedText,
      parsedJson,
      usage: {
        inputTokens: data.usage?.prompt_tokens,
        outputTokens: data.usage?.completion_tokens,
        totalTokens: data.usage?.total_tokens,
        inputChars: messages.reduce((acc, m) => acc + (m.content?.length || 0), 0),
      },
      finishReason,
      latencyMs,
      metadata: {
        id: data.id,
        created: data.created,
      },
    };
  }

  /**
   * Performs an active health and readiness probe on the provider.
   * Does NOT make an unnecessary completion call on every check to avoid token waste.
   */
  public async checkHealth(): Promise<AIProviderHealth> {
    if (!this.apiKey) {
      return {
        available: false,
        status: 'NOT_CONFIGURED',
        provider: this.id,
        model: this.modelName,
        isDevelopment: false,
        error: 'GROQ_API_KEY environment variable is not configured.',
      };
    }

    return {
      available: true,
      status: 'READY',
      provider: this.id,
      model: this.modelName,
      isDevelopment: false,
    };
  }
}
