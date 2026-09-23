/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: Model-Agnostic AI Gateway Service
 *
 * Sits strictly between EDUMATE application logic and model inference providers.
 *
 * Core Responsibilities:
 * 1. Enforces mandatory session-authenticated student identity
 * 2. Enforces input size validation (max 20,000 characters)
 * 3. Enforces output token governance bounds (max 1,500 tokens)
 * 4. Enforces student and global concurrency limits via QuotaService
 * 5. Enforces daily per-student AI request quotas via QuotaService
 * 6. Dispatches to active provider from ProviderRegistry with strict timeouts
 * 7. Normalizes responses and errors without leaking secrets or stack traces
 * 8. Records privacy-preserving operational telemetry
 */

import crypto from 'crypto';
import type {
  AIRequest,
  AIResponse,
  AIMessage,
  AIRequestPurpose,
  RetrievedContext,
  AIDiagnostics,
  AIJsonSchemaSpec,
} from './types.js';
import {
  AIGatewayError,
  AIAuthenticationRequiredError,
  AIRequestInvalidError,
  AIQuotaExceededError,
  AIConcurrencyLimitExceededError,
  AIProviderTimeoutError,
  normalizeAIGatewayError,
} from './errors.js';
import { providerRegistry } from './provider.registry.js';
import { quotaService } from '../governance/quota.service.js';
import { getAIConfig } from './config.js';
import { aiTelemetryService } from './telemetry.service.js';
import { validateStructuredOutput } from './schemas.js';
import type { z } from 'zod';

export interface ExecuteAIInput {
  /** Authenticated student ID (strictly from session, NEVER from client body) */
  studentId: string;
  purpose?: AIRequestPurpose;
  prompt?: string;
  messages?: AIMessage[];
  retrievedContext?: RetrievedContext[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: 'text' | 'json_object' | 'json_schema';
  jsonSchema?: AIJsonSchemaSpec;
  metadata?: Record<string, any>;
}

export class AIGatewayService {
  /**
   * Executes an AI request through the gateway with comprehensive governance.
   */
  public async execute(input: ExecuteAIInput): Promise<AIResponse> {
    const startTime = Date.now();
    const requestId = crypto.randomUUID();

    // 1. Enforce strict authentication requirement
    if (!input.studentId || typeof input.studentId !== 'string' || !input.studentId.trim()) {
      throw new AIAuthenticationRequiredError();
    }

    const studentId = input.studentId.trim();
    const purpose = input.purpose || 'general';

    // 2. Validate request payload (prompt or messages)
    const promptText = typeof input.prompt === 'string' ? input.prompt : '';
    const messages = Array.isArray(input.messages) ? input.messages : [];
    const contextItems = Array.isArray(input.retrievedContext) ? input.retrievedContext : [];

    // Calculate total input character length across prompt, messages, and context
    let totalInputChars = promptText.length;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        totalInputChars += msg.content.length;
      }
    }
    for (const ctx of contextItems) {
      if (typeof ctx.text === 'string') {
        totalInputChars += ctx.text.length;
      }
    }

    if (totalInputChars === 0) {
      throw new AIRequestInvalidError('AI request must provide a non-empty prompt or messages.');
    }

    // 3. Validate input character bounds & sanitize requested output tokens
    const inputValidation = quotaService.validateAiInput(totalInputChars, input.maxTokens);
    if (!inputValidation.allowed) {
      throw new AIRequestInvalidError(inputValidation.message || 'Input character limit exceeded.');
    }

    const sanitizedMaxTokens = inputValidation.sanitizedOutputTokens;

    // 4. Enforce daily per-student quota
    const quotaCheck = await quotaService.checkAndIncrementAiQuota(studentId);
    if (!quotaCheck.allowed) {
      aiTelemetryService.record({
        requestId,
        studentId,
        purpose,
        provider: 'governance',
        model: 'quota_limiter',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        success: false,
        inputChars: totalInputChars,
        errorCode: 'AI_QUOTA_EXCEEDED',
      });
      throw new AIQuotaExceededError(quotaCheck.message);
    }

    // 5. Enforce concurrency limits (student + global)
    const slotAcquired = quotaService.acquireAiConcurrencySlot(studentId);
    if (!slotAcquired.allowed) {
      aiTelemetryService.record({
        requestId,
        studentId,
        purpose,
        provider: 'governance',
        model: 'concurrency_limiter',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        success: false,
        inputChars: totalInputChars,
        errorCode: slotAcquired.error || 'AI_CONCURRENCY_LIMIT_EXCEEDED',
      });
      throw new AIConcurrencyLimitExceededError(
        slotAcquired.message || 'AI request concurrency limit reached.'
      );
    }

    // 6. Resolve active provider and construct normalized AIRequest
    const config = getAIConfig();
    let provider: ReturnType<typeof providerRegistry.getActiveProvider>;

    try {
      provider = providerRegistry.getActiveProvider();
    } catch (err: any) {
      quotaService.releaseAiConcurrencySlot(studentId);
      const normalized = normalizeAIGatewayError(err);
      aiTelemetryService.record({
        requestId,
        studentId,
        purpose,
        provider: config.providerId,
        model: 'unresolved',
        timestamp: new Date().toISOString(),
        latencyMs: Date.now() - startTime,
        success: false,
        inputChars: totalInputChars,
        errorCode: normalized.code,
      });
      throw normalized;
    }

    const aiRequest: AIRequest = {
      requestId,
      studentId,
      purpose,
      prompt: promptText || undefined,
      messages: messages.length > 0 ? messages : undefined,
      retrievedContext: contextItems.length > 0 ? contextItems : undefined,
      temperature: typeof input.temperature === 'number' ? Math.max(0, Math.min(1, input.temperature)) : 0.7,
      maxTokens: sanitizedMaxTokens,
      responseFormat: input.responseFormat,
      jsonSchema: input.jsonSchema,
      metadata: input.metadata,
    };

    // 7. Execute request with strict timeout handling and guaranteed concurrency slot release
    try {
      let timeoutId: NodeJS.Timeout | null = null;

      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(
            new AIProviderTimeoutError(
              `AI generation timed out after ${config.requestTimeoutMs}ms.`
            )
          );
        }, config.requestTimeoutMs);
      });

      const providerPromise = messages.length > 0
        ? provider.chat(aiRequest)
        : provider.generate(aiRequest);

      const response = await Promise.race([providerPromise, timeoutPromise]);
      if (timeoutId) clearTimeout(timeoutId);

      const latencyMs = Date.now() - startTime;
      const normalizedResponse: AIResponse = {
        requestId,
        provider: response.provider || provider.id,
        model: response.model || provider.modelName,
        text: response.text || '',
        parsedJson: response.parsedJson,
        usage: {
          inputChars: totalInputChars,
          inputTokens: response.usage?.inputTokens ?? Math.ceil(totalInputChars / 4),
          outputTokens: response.usage?.outputTokens ?? Math.ceil((response.text?.length || 0) / 4),
          totalTokens:
            response.usage?.totalTokens ??
            (Math.ceil(totalInputChars / 4) + Math.ceil((response.text?.length || 0) / 4)),
        },
        finishReason: response.finishReason || 'stop',
        latencyMs,
        metadata: response.metadata,
      };

      // Record successful telemetry
      aiTelemetryService.record({
        requestId,
        studentId,
        purpose,
        provider: normalizedResponse.provider,
        model: normalizedResponse.model,
        timestamp: new Date().toISOString(),
        latencyMs,
        success: true,
        inputChars: totalInputChars,
        inputTokens: normalizedResponse.usage?.inputTokens,
        outputTokens: normalizedResponse.usage?.outputTokens,
        finishReason: normalizedResponse.finishReason,
      });

      return normalizedResponse;
    } catch (err: unknown) {
      const normalized = normalizeAIGatewayError(err);
      const latencyMs = Date.now() - startTime;

      // Record failure telemetry
      aiTelemetryService.record({
        requestId,
        studentId,
        purpose,
        provider: provider.id,
        model: provider.modelName,
        timestamp: new Date().toISOString(),
        latencyMs,
        success: false,
        inputChars: totalInputChars,
        errorCode: normalized.code,
      });

      throw normalized;
    } finally {
      // GUARANTEED: Release concurrency slot
      quotaService.releaseAiConcurrencySlot(studentId);
    }
  }

  /**
   * Executes structured generation and validates against a Zod schema.
   * Prevents arbitrary or unvalidated outputs in downstream educational features.
   */
  public async executeStructured<T>(
    input: Omit<ExecuteAIInput, 'responseFormat'>,
    schema: z.ZodType<T>,
    jsonSchemaSpec?: AIJsonSchemaSpec
  ): Promise<{ response: AIResponse; data: T }> {
    const response = await this.execute({
      ...input,
      responseFormat: jsonSchemaSpec ? 'json_schema' : 'json_object',
      jsonSchema: jsonSchemaSpec,
    });

    const data = validateStructuredOutput(schema, response.text);
    return { response, data };
  }

  /**
   * Retrieves server-side diagnostics for health checks.
   * STRICT SECURITY: Never exposes secrets, API keys, internal URLs, or passwords.
   */
  public async getDiagnostics(): Promise<AIDiagnostics> {
    const config = getAIConfig();
    let health;

    try {
      const provider = providerRegistry.getActiveProvider();
      health = await provider.checkHealth();
    } catch (err: any) {
      health = {
        available: false,
        status: 'ERROR' as const,
        provider: config.providerId,
        model: config.modelName || 'unconfigured',
        isDevelopment: false,
        error: err.message || 'Provider resolution failed.',
      };
    }

    const concurrency = quotaService.getActiveAiConcurrency();

    return {
      configured: health.status === 'READY',
      configuredProvider: config.providerId,
      configuredModel: config.modelName || health.model,
      providerHealth: health,
      limits: {
        maxInputChars: config.maxInputChars,
        maxOutputTokens: config.maxOutputTokens,
        maxConcurrentPerStudent: config.maxConcurrentPerStudent,
        maxGlobalConcurrent: config.maxGlobalConcurrent,
        maxRequestsPerDay: config.maxDailyRequests,
        requestTimeoutMs: config.requestTimeoutMs,
      },
      activeConcurrentRequests: {
        global: concurrency.global,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const aiGatewayService = new AIGatewayService();
