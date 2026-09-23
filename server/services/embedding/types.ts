/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface EmbeddingDiagnostics {
  modelName: string; // 'BAAI/bge-small-en-v1.5' or 'TEST FALLBACK'
  dimension: number;
  version: string;
  device: 'cuda' | 'cpu';
  isReady: boolean;
  isFallback: boolean;
  fallbackAllowed: boolean;
}

export interface IEmbeddingService {
  readonly modelName: string;
  readonly dimension: number;
  readonly version: string;
  readonly device: 'cuda' | 'cpu';
  readonly isFallback: boolean;
  readonly fallbackAllowed: boolean;
  readonly isReady: boolean;

  /**
   * Embeds an array of text documents/chunks into 384-dimensional normalized vectors.
   */
  embedTexts(texts: string[]): Promise<number[][]>;

  /**
   * Embeds a search query with BGE query instruction prefix into a 384-dimensional vector.
   */
  embedQuery(text: string): Promise<number[]>;

  /**
   * Returns diagnostic information about model, dimension, version, device, and fallback status.
   */
  getDiagnostics(): EmbeddingDiagnostics;

  /**
   * Explicitly sets test fallback permission (used in tests or administrative override).
   */
  setAllowTestFallback(allow: boolean | null): void;

  /**
   * Waits for the real BGE embedding engine to complete startup and readiness handshake.
   */
  waitUntilReady(): Promise<boolean>;
}

