/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: Model-Agnostic AI Gateway Application Types
 *
 * All types are strictly provider-neutral and application-level.
 * No provider SDKs (Gemini, OpenAI, Anthropic, etc.) are imported or exposed.
 */

export type AIMessageRole = 'system' | 'user' | 'assistant';

export interface AIMessage {
  role: AIMessageRole;
  content: string;
}

export type AIRequestPurpose =
  | 'general'
  | 'tutoring'
  | 'quiz_explanation'
  | 'retrieval_qa'
  | 'diagnostic'
  | 'test';

/**
 * Provider-neutral retrieved context representation.
 * Allows the AI Gateway to receive semantic chunks without coupling
 * to Qdrant or underlying vector database implementation details.
 */
export interface RetrievedContext {
  chunkId: string;
  materialId: string;
  sectionId: string | null;
  text: string;
  score: number;
  pageStart?: number;
  pageEnd?: number;
  sectionTitle?: string | null;
  sectionType?: string | null;
  materialTitle?: string;
  subject?: string;
  topic?: string;
  sourceMetadata?: Record<string, any>;
}

/**
 * Normalized application-level AI Request.
 */
export interface AIRequest {
  /** Unique request tracking identifier */
  requestId: string;
  /** Authenticated student identity (strictly derived from authenticated session) */
  studentId: string;
  /** High-level pedagogical or operational purpose of the request */
  purpose: AIRequestPurpose;
  /** Primary text prompt (if single-turn) */
  prompt?: string;
  /** Sequential chat messages (if multi-turn) */
  messages?: AIMessage[];
  /** Optional tenant-isolated retrieved semantic context */
  retrievedContext?: RetrievedContext[];
  /** Generation temperature (clamped between 0.0 and 1.0) */
  temperature?: number;
  /** Maximum generated tokens (clamped by server governance limits) */
  maxTokens?: number;
  /** Optional response format enforcement ('text' or 'json_object') */
  responseFormat?: 'text' | 'json_object';
  /** Optional caller metadata (no secrets allowed) */
  metadata?: Record<string, any>;
}

/**
 * Token and compute usage metrics.
 */
export interface TokenUsage {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  inputChars?: number;
}

/**
 * Normalized application-level AI Response.
 */
export interface AIResponse {
  requestId: string;
  provider: string;
  model: string;
  text: string;
  parsedJson?: any;
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'timeout' | 'null' | 'error';
  latencyMs: number;
  metadata?: Record<string, any>;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Health and availability status of an AI Provider.
 */
export interface AIProviderHealth {
  available: boolean;
  status: 'READY' | 'NOT_CONFIGURED' | 'DEGRADED' | 'ERROR';
  provider: string;
  model: string;
  isDevelopment: boolean;
  error?: string;
}

/**
 * Server-side AI diagnostics for developers and health monitoring.
 * Zero secrets (API keys, URLs, DB credentials) are exposed.
 */
export interface AIDiagnostics {
  configured: boolean;
  configuredProvider: string;
  configuredModel: string;
  providerHealth: AIProviderHealth;
  limits: {
    maxInputChars: number;
    maxOutputTokens: number;
    maxConcurrentPerStudent: number;
    maxGlobalConcurrent: number;
    maxRequestsPerDay: number;
    requestTimeoutMs: number;
  };
  activeConcurrentRequests: {
    global: number;
  };
  timestamp: string;
}
