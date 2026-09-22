/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: AI Gateway Configuration
 *
 * Reads server environment settings for the AI Gateway and bridges to quota governance.
 */

import { quotaService } from '../governance/quota.service.js';

export interface AIConfig {
  providerId: string;
  modelName: string;
  requestTimeoutMs: number;
  maxInputChars: number;
  maxOutputTokens: number;
  maxConcurrentPerStudent: number;
  maxGlobalConcurrent: number;
  maxDailyRequests: number;
}

export function loadAIConfig(): AIConfig {
  const provider = (process.env.AI_PROVIDER || 'none').trim().toLowerCase();
  let model = (process.env.AI_MODEL || '').trim();
  if (!model && provider === 'groq') {
    model = (process.env.GROQ_MODEL || 'llama-3.3-70b-versatile').trim();
  }
  const quotaConfig = quotaService.getConfig();

  return {
    providerId: provider || 'none',
    modelName: model,
    requestTimeoutMs: quotaConfig.aiRequestTimeoutMs,
    maxInputChars: quotaConfig.maxInputCharsPerRequest,
    maxOutputTokens: quotaConfig.maxOutputTokensPerRequest,
    maxConcurrentPerStudent: quotaConfig.maxConcurrentAiRequestsPerStudent,
    maxGlobalConcurrent: quotaConfig.maxGlobalConcurrentAiRequests,
    maxDailyRequests: quotaConfig.maxDailyAiRequestsPerStudent,
  };
}

let currentConfig: AIConfig = loadAIConfig();

export function getAIConfig(): AIConfig {
  return currentConfig;
}

export function reloadAIConfig(): AIConfig {
  quotaService.reloadConfig();
  currentConfig = loadAIConfig();
  return currentConfig;
}
