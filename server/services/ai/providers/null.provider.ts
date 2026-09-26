/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AVEN Phase 8: Deterministic Null Development Provider
 *
 * Used for testing AVEN AI Gateway infrastructure without calling external models.
 * Strictly identifies itself as development/null and never pretends to be a real AI.
 */

import type { IAIProvider } from '../provider.interface.js';
import type { AIRequest, AIResponse, AIProviderHealth } from '../types.js';

export class NullAIProvider implements IAIProvider {
  public readonly id = 'development';
  public readonly name = 'Null Development Provider';
  public readonly modelName = 'null';
  public readonly isDevelopment = true;

  public async generate(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const promptText = request.prompt || '';
    const inputChars = promptText.length;

    return {
      requestId: request.requestId,
      provider: this.id,
      model: this.modelName,
      text: 'AI provider is not configured.',
      usage: {
        inputTokens: Math.ceil(inputChars / 4),
        outputTokens: 6,
        totalTokens: Math.ceil(inputChars / 4) + 6,
        inputChars,
      },
      finishReason: 'null',
      latencyMs: Date.now() - startTime,
      metadata: {
        isDevelopment: true,
        mode: 'null_provider',
      },
    };
  }

  public async chat(request: AIRequest): Promise<AIResponse> {
    const startTime = Date.now();
    const totalChars = (request.messages || []).reduce((acc, m) => acc + m.content.length, 0);

    return {
      requestId: request.requestId,
      provider: this.id,
      model: this.modelName,
      text: 'AI provider is not configured.',
      usage: {
        inputTokens: Math.ceil(totalChars / 4),
        outputTokens: 6,
        totalTokens: Math.ceil(totalChars / 4) + 6,
        inputChars: totalChars,
      },
      finishReason: 'null',
      latencyMs: Date.now() - startTime,
      metadata: {
        isDevelopment: true,
        mode: 'null_provider',
      },
    };
  }

  public async checkHealth(): Promise<AIProviderHealth> {
    return {
      available: false,
      status: 'NOT_CONFIGURED',
      provider: this.id,
      model: this.modelName,
      isDevelopment: true,
      error: 'AI provider is not configured. Defaulting to development null provider.',
    };
  }
}
