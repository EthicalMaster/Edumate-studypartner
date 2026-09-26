/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * AVEN Phase 8: AI Provider Abstraction Interface
 *
 * All AI model providers (development, local HTTP, future inference servers)
 * must conform to this interface. No provider-specific SDK types are permitted.
 */

import type { AIRequest, AIResponse, AIProviderHealth } from './types.js';

export interface IAIProvider {
  /** Unique provider identifier (e.g., 'development', 'local') */
  readonly id: string;

  /** Human-readable provider name */
  readonly name: string;

  /** Model identifier reported by the provider */
  readonly modelName: string;

  /** Flag indicating whether this is a mock/development provider */
  readonly isDevelopment: boolean;

  /**
   * Generates a single-turn completion for the given AI request.
   */
  generate(request: AIRequest): Promise<AIResponse>;

  /**
   * Generates a multi-turn completion for sequential messages in the AI request.
   */
  chat(request: AIRequest): Promise<AIResponse>;

  /**
   * Performs an active health and readiness probe on the provider.
   */
  checkHealth(): Promise<AIProviderHealth>;
}
