/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { IEmbeddingService, EmbeddingDiagnostics } from './types.js';
import { PythonEmbeddingRunner, pythonEmbeddingRunner } from './python-embedding-runner.js';

/**
 * Local self-hosted embedding service for BAAI/bge-small-en-v1.5.
 * Powered by Python sentence-transformers subprocess runner.
 * Generates bounded 384-dimensional cosine-normalized embeddings.
 * Fully abstracted behind IEmbeddingService.
 */
export class LocalBgeEmbeddingService implements IEmbeddingService {
  public readonly dimension = 384;
  public readonly version = '1.5';

  private static instance: LocalBgeEmbeddingService | null = null;
  private customAllowFallback: boolean | null = null;
  private warnedFallback = false;
  private runner: PythonEmbeddingRunner;

  constructor(runner?: PythonEmbeddingRunner) {
    this.runner = runner || pythonEmbeddingRunner;
  }

  public static getInstance(): LocalBgeEmbeddingService {
    if (!LocalBgeEmbeddingService.instance) {
      LocalBgeEmbeddingService.instance = new LocalBgeEmbeddingService();
    }
    return LocalBgeEmbeddingService.instance;
  }

  public get device(): 'cuda' | 'cpu' {
    return this.runner.getDevice();
  }

  public get isRealEngineReady(): boolean {
    return this.runner.isAvailable();
  }

  public get fallbackAllowed(): boolean {
    if (this.customAllowFallback !== null) {
      return this.customAllowFallback;
    }
    return process.env.EMBEDDING_ALLOW_TEST_FALLBACK === 'true';
  }

  public setAllowTestFallback(allow: boolean | null): void {
    this.customAllowFallback = allow;
  }

  public get isFallback(): boolean {
    return !this.isRealEngineReady && this.fallbackAllowed;
  }

  public get isReady(): boolean {
    return this.isRealEngineReady || this.fallbackAllowed;
  }

  public get modelName(): string {
    if (this.isRealEngineReady) {
      return 'BAAI/bge-small-en-v1.5';
    }
    if (this.fallbackAllowed) {
      return 'TEST FALLBACK';
    }
    return 'UNAVAILABLE';
  }

  public getDiagnostics(): EmbeddingDiagnostics {
    return {
      modelName: this.modelName,
      dimension: this.dimension,
      version: this.version,
      device: this.device,
      isReady: this.isReady,
      isFallback: this.isFallback,
      fallbackAllowed: this.fallbackAllowed,
    };
  }

  public getRunner(): PythonEmbeddingRunner {
    return this.runner;
  }

  /**
   * Ensures the embedding engine is ready for inference.
   * If fallback is allowed, returns true immediately.
   * Otherwise waits for the real Python BGE runner to complete startup and readiness handshake.
   */
  public async waitUntilReady(): Promise<boolean> {
    if (this.fallbackAllowed) {
      return true;
    }
    if (this.isRealEngineReady) {
      return true;
    }
    await this.runner.waitUntilReady();
    return this.isRealEngineReady;
  }

  /**
   * Embeds an array of document chunks into normalized 384-dimensional vectors.
   */
  public async embedTexts(texts: string[]): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error('Input to embedTexts must be an array of strings.');
    }
    if (texts.length === 0) {
      return [];
    }

    if (!this.isRealEngineReady && !this.fallbackAllowed && this.runner.isProcessStarting) {
      try {
        await this.runner.waitUntilReady();
      } catch (err: any) {
        console.error(`[EmbeddingService] Runner startup failed while waiting in embedTexts: ${err.message}`);
      }
    }

    if (this.isRealEngineReady) {
      try {
        return await this.runner.embed(texts, false);
      } catch (err: any) {
        console.error(`[EmbeddingService] Real Python embedding failed: ${err.message}`);
        if (!this.fallbackAllowed) {
          throw new Error(
            `EmbeddingEngineUnavailable: Real embedding engine 'BAAI/bge-small-en-v1.5' failed: ${err.message}`
          );
        }
      }
    }

    this.assertEngineReady();

    return texts.map((t) => this.computeVector(t, false));
  }

  /**
   * Embeds a retrieval query using the standard BGE query instruction prefix.
   */
  public async embedQuery(text: string): Promise<number[]> {
    if (typeof text !== 'string') {
      throw new Error('Query must be a string.');
    }

    if (!this.isRealEngineReady && !this.fallbackAllowed && this.runner.isProcessStarting) {
      try {
        await this.runner.waitUntilReady();
      } catch (err: any) {
        console.error(`[EmbeddingService] Runner startup failed while waiting in embedQuery: ${err.message}`);
      }
    }

    if (this.isRealEngineReady) {
      try {
        const results = await this.runner.embed([text], true);
        if (results && results.length > 0) {
          return results[0];
        }
        throw new Error('Empty vector array returned by Python engine');
      } catch (err: any) {
        console.error(`[EmbeddingService] Real Python query embedding failed: ${err.message}`);
        if (!this.fallbackAllowed) {
          throw new Error(
            `EmbeddingEngineUnavailable: Real embedding engine 'BAAI/bge-small-en-v1.5' failed: ${err.message}`
          );
        }
      }
    }

    this.assertEngineReady();

    return this.computeVector(text, true);
  }

  /**
   * Strictly verifies engine availability before calculating vectors.
   * Prevents silent replacement of the real BGE engine in non-test environments.
   */
  private assertEngineReady(): void {
    if (!this.isRealEngineReady) {
      if (!this.fallbackAllowed) {
        throw new Error(
          "EmbeddingEngineUnavailable: Real embedding engine 'BAAI/bge-small-en-v1.5' is unavailable and EMBEDDING_ALLOW_TEST_FALLBACK is disabled (default: false). Hash fallback will NOT silently replace neural embeddings in a standard development or production environment. Set EMBEDDING_ALLOW_TEST_FALLBACK=true to explicitly permit testing mode."
        );
      }
      if (!this.warnedFallback) {
        console.warn(
          '[EmbeddingService] EMBEDDING_ALLOW_TEST_FALLBACK=true: Operating in TEST FALLBACK mode with synthetic unit-norm hash vectors. These are NOT real BAAI/bge-small-en-v1.5 embeddings.'
        );
        this.warnedFallback = true;
      }
    }
  }

  /**
   * Computes a deterministic 384-dimensional unit-norm vector.
   */
  private computeVector(text: string, isQuery: boolean): number[] {
    const prefix = isQuery
      ? 'Represent this sentence for searching relevant passages: '
      : '';
    const fullText = (prefix + (text || '')).toLowerCase().trim();

    const vector = new Float64Array(this.dimension);

    // Tokenize words & subwords
    const tokens = fullText.split(/[\s,.;:!?()[\]{}"'`~@#$%^&*+=<>/-]+/).filter(Boolean);

    if (tokens.length === 0) {
      // Return normalized unit vector for empty text
      vector[0] = 1.0;
      return Array.from(vector);
    }

    // Dense projection with frequency & positional weighting
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      const posWeight = 1.0 / (1.0 + 0.05 * i);

      // 1. Whole word hash projection
      const h1 = this.fnv1a(token);
      const idx1 = Math.abs(h1) % this.dimension;
      const sign1 = (h1 & 1) === 0 ? 1 : -1;
      vector[idx1] += sign1 * 1.5 * posWeight;

      // 2. Character 3-gram subwords for morphological semantic capture
      for (let j = 0; j < token.length - 2; j++) {
        const sub = token.slice(j, j + 3);
        const hSub = this.fnv1a(sub);
        const idxSub = Math.abs(hSub) % this.dimension;
        const signSub = (hSub & 1) === 0 ? 1 : -1;
        vector[idxSub] += signSub * 0.8 * posWeight;
      }

      // 3. Distributed semantic dense harmonics (simulates dense transformer layer projections)
      const hGlobal = this.fnv1a(token + '_dense');
      for (let d = 0; d < 8; d++) {
        const targetDim = Math.abs(hGlobal + d * 47) % this.dimension;
        const angle = ((hGlobal % 360) + d * 45) * (Math.PI / 180);
        vector[targetDim] += Math.sin(angle) * posWeight * 0.4;
      }
    }

    // L2 Normalization (ensures ||vector|| = 1.0 for exact Cosine similarity)
    let sumSq = 0;
    for (let i = 0; i < this.dimension; i++) {
      sumSq += vector[i] * vector[i];
    }
    const norm = Math.sqrt(sumSq) || 1.0;

    const result = new Array<number>(this.dimension);
    for (let i = 0; i < this.dimension; i++) {
      result[i] = parseFloat((vector[i] / norm).toFixed(6));
    }

    return result;
  }

  /**
   * Fast, deterministic 32-bit FNV-1a hash function
   */
  private fnv1a(str: string): number {
    let hash = 2166136261;
    for (let i = 0; i < str.length; i++) {
      hash ^= str.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return hash;
  }
}

export const embeddingService: IEmbeddingService = LocalBgeEmbeddingService.getInstance();
