/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: Normalized AI Gateway Errors
 *
 * Prevents leaking raw internal stack traces, DB strings, or provider secrets to clients.
 */

export class AIGatewayError extends Error {
  public readonly code: string;
  public readonly statusCode: number;
  public readonly safeMessage: string;
  public readonly details?: Record<string, any>;

  constructor(
    code: string,
    statusCode: number,
    safeMessage: string,
    details?: Record<string, any>
  ) {
    super(safeMessage);
    this.name = this.constructor.name;
    this.code = code;
    this.statusCode = statusCode;
    this.safeMessage = safeMessage;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
  }

  public toResponse(): { error: string; code: string; message: string; details?: Record<string, any> } {
    return {
      error: this.code,
      code: this.code,
      message: this.safeMessage,
      ...(this.details ? { details: this.details } : {}),
    };
  }
}

export class AIAuthenticationRequiredError extends AIGatewayError {
  constructor(message = 'Authentication required. Active student session is required.') {
    super('AI_AUTHENTICATION_REQUIRED', 401, message);
  }
}

export class AIRequestInvalidError extends AIGatewayError {
  constructor(message: string, details?: Record<string, any>) {
    super('AI_REQUEST_INVALID', 400, message, details);
  }
}

export class AIQuotaExceededError extends AIGatewayError {
  constructor(message = 'Daily AI request quota exceeded. Quota resets tomorrow.', details?: Record<string, any>) {
    super('AI_QUOTA_EXCEEDED', 429, message, details);
  }
}

export class AIConcurrencyLimitExceededError extends AIGatewayError {
  constructor(message: string, details?: Record<string, any>) {
    super('AI_CONCURRENCY_LIMIT_EXCEEDED', 429, message, details);
  }
}

export class AIConfigurationError extends AIGatewayError {
  constructor(message = 'AI Gateway configuration error. Please contact system administrator.', details?: Record<string, any>) {
    super('AI_CONFIGURATION_ERROR', 503, message, details);
  }
}

export class AIProviderUnavailableError extends AIGatewayError {
  constructor(message = 'The configured AI provider is currently unavailable.', details?: Record<string, any>) {
    super('AI_PROVIDER_UNAVAILABLE', 503, message, details);
  }
}

export class AIProviderTimeoutError extends AIGatewayError {
  constructor(message = 'AI generation request timed out.', details?: Record<string, any>) {
    super('AI_PROVIDER_TIMEOUT', 504, message, details);
  }
}

export class AIProviderRateLimitedError extends AIGatewayError {
  constructor(message = 'Upstream AI provider rate limit encountered.', details?: Record<string, any>) {
    super('AI_PROVIDER_RATE_LIMITED', 429, message, details);
  }
}

export class AIProviderAuthenticationError extends AIGatewayError {
  constructor(message = 'AI provider authentication failed or API key is unconfigured.', details?: Record<string, any>) {
    super('AI_PROVIDER_AUTHENTICATION_ERROR', 503, message, details);
  }
}

export class AIStructuredOutputError extends AIGatewayError {
  constructor(message = 'AI provider returned invalid or unparsable structured output.', details?: Record<string, any>) {
    super('AI_STRUCTURED_OUTPUT_INVALID', 502, message, details);
  }
}

/**
 * Normalizes any caught error into a safe AIGatewayError instance.
 */
export function normalizeAIGatewayError(err: unknown): AIGatewayError {
  if (err instanceof AIGatewayError) {
    return err;
  }

  const message = err instanceof Error ? err.message : String(err);

  // Check for common error signatures
  if (message.includes('timeout') || message.includes('TIMED_OUT') || message.includes('AbortError')) {
    return new AIProviderTimeoutError();
  }
  if (message.includes('rate limit') || message.includes('RATE_LIMIT') || message.includes('429')) {
    return new AIProviderRateLimitedError();
  }
  if (message.includes('API key') || message.includes('authentication') || message.includes('unauthorized') || message.includes('401') || message.includes('403')) {
    return new AIProviderAuthenticationError('AI provider authentication failed or API key is invalid/unconfigured.');
  }
  if (message.includes('structured output') || message.includes('JSON') || message.includes('schema validation')) {
    return new AIStructuredOutputError();
  }
  if (message.includes('quota') || message.includes('QUOTA_EXCEEDED')) {
    return new AIQuotaExceededError(message);
  }
  if (message.includes('concurrency') || message.includes('CONCURRENCY')) {
    return new AIConcurrencyLimitExceededError(message);
  }
  if (message.includes('unavailable') || message.includes('UNAVAILABLE') || message.includes('503') || message.includes('502')) {
    return new AIProviderUnavailableError();
  }

  // Generic sanitized fallback
  return new AIGatewayError('AI_GATEWAY_ERROR', 500, 'An unexpected error occurred in the AI gateway.');
}
