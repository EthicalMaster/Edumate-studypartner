/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 8: Lightweight AI Gateway Telemetry
 *
 * Tracks performance and operational metrics for AI requests.
 *
 * STRICT PRIVACY MANDATE:
 * Never logs raw student prompts, message text, generated AI outputs,
 * passwords, session cookies, or provider secrets.
 */

import type { AIRequestPurpose } from './types.js';

export interface AITelemetryEntry {
  requestId: string;
  studentId: string;
  purpose: AIRequestPurpose;
  provider: string;
  model: string;
  timestamp: string;
  latencyMs: number;
  success: boolean;
  inputChars: number;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
  errorCode?: string;
}

export class AITelemetryService {
  private readonly maxEntries = 100;
  private entries: AITelemetryEntry[] = [];
  private totalRequests = 0;
  private successCount = 0;
  private errorCount = 0;
  private totalLatencyMs = 0;

  public record(entry: AITelemetryEntry): void {
    this.totalRequests++;
    this.totalLatencyMs += entry.latencyMs;

    if (entry.success) {
      this.successCount++;
    } else {
      this.errorCount++;
    }

    this.entries.unshift(entry);
    if (this.entries.length > this.maxEntries) {
      this.entries.pop();
    }
  }

  public getRecent(limit = 20): AITelemetryEntry[] {
    return this.entries.slice(0, Math.min(limit, this.entries.length));
  }

  public getSummary(): {
    totalRequests: number;
    successCount: number;
    errorCount: number;
    avgLatencyMs: number;
  } {
    return {
      totalRequests: this.totalRequests,
      successCount: this.successCount,
      errorCount: this.errorCount,
      avgLatencyMs: this.totalRequests > 0 ? Math.round(this.totalLatencyMs / this.totalRequests) : 0,
    };
  }

  public clear(): void {
    this.entries = [];
    this.totalRequests = 0;
    this.successCount = 0;
    this.errorCount = 0;
    this.totalLatencyMs = 0;
  }
}

export const aiTelemetryService = new AITelemetryService();
