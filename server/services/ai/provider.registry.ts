/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: AI Provider Registry
 *
 * Manages available IAIProvider instances and resolves the active provider based
 * strictly on server-side configuration.
 *
 * Prevents silent substitution: if a specific provider is configured but unrecognized
 * or unavailable, fails explicitly with AIConfigurationError or AIProviderUnavailableError.
 */

import type { IAIProvider } from './provider.interface.js';
import { NullAIProvider } from './providers/null.provider.js';
import { LocalAIProvider } from './providers/local.provider.js';
import { GroqProvider } from './providers/groq.provider.js';
import { getAIConfig } from './config.js';
import { AIConfigurationError } from './errors.js';

export class AIProviderRegistry {
  private providers = new Map<string, IAIProvider>();
  private defaultNullProvider: NullAIProvider;

  constructor() {
    this.defaultNullProvider = new NullAIProvider();

    // Register built-in providers
    this.registerProvider(this.defaultNullProvider);
    // Aliases for development / null
    this.providers.set('null', this.defaultNullProvider);
    this.providers.set('none', this.defaultNullProvider);

    // Register local model adapter
    this.registerProvider(new LocalAIProvider());

    // Register Groq cloud inference provider
    this.registerProvider(new GroqProvider());
  }

  /**
   * Registers or updates an AI provider implementation.
   */
  public registerProvider(provider: IAIProvider): void {
    this.providers.set(provider.id.toLowerCase(), provider);
  }

  /**
   * Looks up a provider by exact identifier.
   */
  public getProvider(id: string): IAIProvider | undefined {
    return this.providers.get(id.toLowerCase());
  }

  /**
   * Resolves the active provider according to AI_PROVIDER in server configuration.
   *
   * Rules:
   * 1. If AI_PROVIDER is 'none', 'null', 'development', or unset: returns NullAIProvider.
   * 2. If AI_PROVIDER is recognized (e.g., 'local'): returns that provider.
   * 3. If AI_PROVIDER is configured to an unknown/unregistered provider: throws AIConfigurationError.
   *    (Strictly NO silent fallback to development provider when a real provider is requested!)
   */
  public getActiveProvider(): IAIProvider {
    const config = getAIConfig();
    const requestedId = (config.providerId || 'none').toLowerCase();

    if (requestedId === 'none' || requestedId === 'null' || requestedId === 'development') {
      return this.defaultNullProvider;
    }

    const provider = this.providers.get(requestedId);
    if (!provider) {
      throw new AIConfigurationError(
        `Configured AI provider "${config.providerId}" is not registered. Please check AI_PROVIDER.`
      );
    }

    return provider;
  }

  /**
   * Returns a list of all uniquely registered provider implementations.
   */
  public listProviders(): IAIProvider[] {
    const unique = new Set<IAIProvider>(this.providers.values());
    return Array.from(unique);
  }
}

export const providerRegistry = new AIProviderRegistry();
