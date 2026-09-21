/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: Local AI Provider Adapter Boundary
 *
 * Prepares the architectural boundary for future self-hosted local model inference
 * (e.g. Ollama, vLLM, llama.cpp HTTP server).
 *
 * Does not download models or assume pre-installed binaries.
 * Fails safely with normalized AIProviderUnavailableError if unconfigured or unreachable.
 */

import type { IAIProvider } from '../provider.interface.js';
import type { AIRequest, AIResponse, AIProviderHealth } from '../types.js';
import { AIProviderUnavailableError, AIProviderTimeoutError } from '../errors.js';

export class LocalAIProvider implements IAIProvider {
  public readonly id = 'local';
  public readonly name = 'Local Self-Hosted Inference Provider';
  public readonly modelName: string;
  public readonly isDevelopment = false;

  private readonly baseUrl: string;
  private readonly timeoutMs: number;

  constructor(options?: { baseUrl?: string; modelName?: string; timeoutMs?: number }) {
    this.baseUrl = options?.baseUrl || process.env.LOCAL_AI_BASE_URL || 'http://127.0.0.1:11434';
    this.modelName = options?.modelName || process.env.AI_MODEL || 'mistral-7b-instruct';
    this.timeoutMs = options?.timeoutMs || 30_000;
  }

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const promptText = request.prompt || '';

    // Check if local endpoint is reachable via standard HTTP POST /api/generate
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/api/generate`;
      let res: globalThis.Response;

      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.modelName,
            prompt: promptText,
            stream: false,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens ?? 1500,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        throw new AIProviderUnavailableError(
          `Local AI inference server responded with status HTTP ${res.status}`
        );
      }

      const data = (await res.json()) as any;
      const text = data.response || data.text || '';

      return {
        requestId: request.requestId,
        provider: this.id,
        model: this.modelName,
        text,
        usage: {
          inputTokens: data.prompt_eval_count ?? Math.ceil(promptText.length / 4),
          outputTokens: data.eval_count ?? Math.ceil(text.length / 4),
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          inputChars: promptText.length,
        },
        finishReason: data.done ? 'stop' : 'length',
        latencyMs: Date.now() - startTime,
        metadata: {
          backend: 'local_http',
        },
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new AIProviderTimeoutError('Local AI inference timed out.');
      }
      if (err instanceof AIProviderUnavailableError) {
        throw err;
      }
      throw new AIProviderUnavailableError(
        `Unable to reach local AI inference server at ${this.baseUrl}: ${err.message}`
      );
    }
  }

  public async chat(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const messages = request.messages || (request.prompt ? [{ role: 'user' as const, content: request.prompt }] : []);
    const inputChars = messages.reduce((acc, m) => acc + m.content.length, 0);

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      const endpoint = `${this.baseUrl.replace(/\/+$/, '')}/api/chat`;
      let res: globalThis.Response;

      try {
        res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: this.modelName,
            messages,
            stream: false,
            options: {
              temperature: request.temperature ?? 0.7,
              num_predict: request.maxTokens ?? 1500,
            },
          }),
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }

      if (!res.ok) {
        throw new AIProviderUnavailableError(
          `Local AI inference server responded with status HTTP ${res.status}`
        );
      }

      const data = (await res.json()) as any;
      const text = data.message?.content || data.response || '';

      return {
        requestId: request.requestId,
        provider: this.id,
        model: this.modelName,
        text,
        usage: {
          inputTokens: data.prompt_eval_count ?? Math.ceil(inputChars / 4),
          outputTokens: data.eval_count ?? Math.ceil(text.length / 4),
          totalTokens: (data.prompt_eval_count || 0) + (data.eval_count || 0),
          inputChars,
        },
        finishReason: data.done ? 'stop' : 'length',
        latencyMs: Date.now() - startTime,
        metadata: {
          backend: 'local_http',
        },
      };
    } catch (err: any) {
      if (err.name === 'AbortError') {
        throw new AIProviderTimeoutError('Local AI chat inference timed out.');
      }
      if (err instanceof AIProviderUnavailableError) {
        throw err;
      }
      throw new AIProviderUnavailableError(
        `Unable to reach local AI inference server at ${this.baseUrl}: ${err.message}`
      );
    }
  }

  public async checkHealth(): Promise<AIProviderHealth> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 2000);

      const res = await fetch(`${this.baseUrl.replace(/\/+$/, '')}/api/tags`, {
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (res.ok) {
        return {
          available: true,
          status: 'READY',
          provider: this.id,
          model: this.modelName,
          isDevelopment: false,
        };
      }

      return {
        available: false,
        status: 'DEGRADED',
        provider: this.id,
        model: this.modelName,
        isDevelopment: false,
        error: `Local server returned HTTP ${res.status}`,
      };
    } catch (err: any) {
      return {
        available: false,
        status: 'NOT_CONFIGURED',
        provider: this.id,
        model: this.modelName,
        isDevelopment: false,
        error: `Local AI inference endpoint offline or not running at ${this.baseUrl}`,
      };
    }
  }
}
