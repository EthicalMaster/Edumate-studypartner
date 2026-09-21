/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

export interface RunnerHealthInfo {
  isHealthy: boolean;
  device: 'cuda' | 'cpu';
  model: string;
  dimension: number;
  error?: string;
}

interface PendingRequest {
  texts: string[];
  isQuery: boolean;
  resolve: (embeddings: number[][]) => void;
  reject: (error: Error) => void;
  timer?: NodeJS.Timeout;
}

/**
 * Resolves the Python executable path.
 * Precedence:
 * 1. process.env.EMBEDDING_PYTHON_PATH
 * 2. Windows: 'python'
 * 3. Linux/macOS: 'python3'
 */
export function resolvePythonExecutable(): string {
  const custom = process.env.EMBEDDING_PYTHON_PATH?.trim();
  if (custom && custom.length > 0) {
    return custom;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Resolves the health-check timeout in milliseconds.
 * Uses EMBEDDING_HEALTHCHECK_TIMEOUT_MS if valid and positive.
 * Defaults to 30000ms (30s) to accommodate model/CUDA initialization on Windows.
 */
export function resolveHealthcheckTimeoutMs(): number {
  const raw = process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS?.trim();
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 30000;
}

/**
 * Resolves the startup and model loading timeout in milliseconds.
 * Uses EMBEDDING_STARTUP_TIMEOUT_MS if valid and positive.
 * Defaults to 120000ms (2 minutes) to allow first-time BGE model weights downloading and loading.
 */
export function resolveStartupTimeoutMs(): number {
  const raw = process.env.EMBEDDING_STARTUP_TIMEOUT_MS?.trim();
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return 120000;
}

/**
 * Resolves the absolute path to embedder.py.
 */
export function resolveEmbedderScriptPath(): string {
  let scriptDir = '';
  try {
    scriptDir = path.dirname(fileURLToPath(import.meta.url));
  } catch {
    scriptDir = __dirname;
  }

  const localCandidate = path.resolve(scriptDir, 'embedder.py');
  if (fs.existsSync(localCandidate)) {
    return localCandidate;
  }

  const projectCandidate = path.resolve(process.cwd(), 'server', 'services', 'embedding', 'embedder.py');
  if (fs.existsSync(projectCandidate)) {
    return projectCandidate;
  }

  return localCandidate;
}

/**
 * Long-lived Python subprocess bridge for BAAI/bge-small-en-v1.5 sentence-transformers.
 * Communicates over JSON Lines via stdin/stdout with serialized FIFO queueing.
 */
export class PythonEmbeddingRunner {
  private static instance: PythonEmbeddingRunner | null = null;

  private process: ChildProcess | null = null;
  private isStarting = false;
  private startupPromise: Promise<void> | null = null;

  private activeRequest: PendingRequest | null = null;
  private requestQueue: PendingRequest[] = [];
  private stdoutBuffer = '';
  private stderrHistory: string[] = [];
  private maxStderrLines = 30;

  private isHealthy = false;
  private healthCheckPromise: Promise<RunnerHealthInfo> | null = null;
  private lastHealthCheckTime = 0;

  private device: 'cuda' | 'cpu' = 'cpu';
  private modelName = 'BAAI/bge-small-en-v1.5';
  private dimension = 384;
  private timeoutMs = 30000;
  private healthcheckTimeoutMs: number = resolveHealthcheckTimeoutMs();
  private startupTimeoutMs: number = resolveStartupTimeoutMs();

  private constructor() {
    // Perform initial non-blocking health check
    this.checkHealth().catch((err) => {
      console.warn(`[PythonEmbeddingRunner] Initial health probe check: ${err.message}`);
    });
  }

  public static getInstance(): PythonEmbeddingRunner {
    if (!PythonEmbeddingRunner.instance) {
      PythonEmbeddingRunner.instance = new PythonEmbeddingRunner();
    }
    return PythonEmbeddingRunner.instance;
  }

  public getDevice(): 'cuda' | 'cpu' {
    return this.device;
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getDimension(): number {
    return this.dimension;
  }

  public isAvailable(): boolean {
    return this.isHealthy;
  }

  public getPythonPath(): string {
    return resolvePythonExecutable();
  }

  public getScriptPath(): string {
    return resolveEmbedderScriptPath();
  }

  public setTimeoutMs(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  public setHealthcheckTimeoutMs(timeoutMs: number): void {
    this.healthcheckTimeoutMs = timeoutMs;
  }

  public getHealthcheckTimeoutMs(): number {
    return this.healthcheckTimeoutMs;
  }

  public setStartupTimeoutMs(timeoutMs: number): void {
    this.startupTimeoutMs = timeoutMs;
  }

  public getStartupTimeoutMs(): number {
    return this.startupTimeoutMs;
  }

  /**
   * Health and capability probe: executes "python embedder.py --device".
   * Results are cached so it is NOT executed on every embedding request.
   */
  public async checkHealth(force = false): Promise<RunnerHealthInfo> {
    const now = Date.now();
    if (!force && this.healthCheckPromise && now - this.lastHealthCheckTime < 60000) {
      return this.healthCheckPromise;
    }

    this.lastHealthCheckTime = now;
    this.healthCheckPromise = this.executeDeviceProbe();
    return this.healthCheckPromise;
  }

  private executeDeviceProbe(): Promise<RunnerHealthInfo> {
    return new Promise((resolve) => {
      const pythonExe = this.getPythonPath();
      const scriptPath = this.getScriptPath();

      if (!fs.existsSync(scriptPath)) {
        this.isHealthy = false;
        return resolve({
          isHealthy: false,
          device: 'cpu',
          model: this.modelName,
          dimension: this.dimension,
          error: `Embedder script not found at ${scriptPath}`,
        });
      }

      let stdout = '';
      let stderr = '';
      let timer: NodeJS.Timeout | null = null;
      let settled = false;

      let child: ChildProcess;
      try {
        child = spawn(pythonExe, [scriptPath, '--device'], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
          stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        this.isHealthy = false;
        return resolve({
          isHealthy: false,
          device: 'cpu',
          model: this.modelName,
          dimension: this.dimension,
          error: `Failed to spawn Python executable "${pythonExe}": ${err.message}`,
        });
      }

      const timeoutMs = this.healthcheckTimeoutMs;
      timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          try {
            child.kill();
          } catch {
            // Ignore
          }
          this.isHealthy = false;
          resolve({
            isHealthy: false,
            device: 'cpu',
            model: this.modelName,
            dimension: this.dimension,
            error: `Health check probe timed out after ${timeoutMs}ms`,
          });
        }
      }, timeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        stdout += chunk.toString('utf8');
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        stderr += chunk.toString('utf8');
      });

      child.on('error', (err: Error) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);
          this.isHealthy = false;
          resolve({
            isHealthy: false,
            device: 'cpu',
            model: this.modelName,
            dimension: this.dimension,
            error: `Python spawn error: ${err.message}`,
          });
        }
      });

      child.on('exit', (code) => {
        if (!settled) {
          settled = true;
          if (timer) clearTimeout(timer);

          if (code === 0 && stdout.trim()) {
            try {
              const res = JSON.parse(stdout.trim());
              this.device = res.device === 'cuda' ? 'cuda' : 'cpu';
              this.modelName = res.model || this.modelName;
              this.dimension = res.dimension || this.dimension;
              this.isHealthy = true;

              console.log(
                `[PythonEmbeddingRunner] Real BGE engine verified: python="${pythonExe}", model="${this.modelName}", device="${this.device}"`
              );

              return resolve({
                isHealthy: true,
                device: this.device,
                model: this.modelName,
                dimension: this.dimension,
              });
            } catch (parseErr: any) {
              this.isHealthy = false;
              return resolve({
                isHealthy: false,
                device: 'cpu',
                model: this.modelName,
                dimension: this.dimension,
                error: `Failed to parse probe JSON: ${parseErr.message} (output: ${stdout})`,
              });
            }
          }

          this.isHealthy = false;
          const errMsg = (stderr || stdout).trim() || `Process exited with code ${code}`;
          return resolve({
            isHealthy: false,
            device: 'cpu',
            model: this.modelName,
            dimension: this.dimension,
            error: errMsg,
          });
        }
      });
    });
  }

  /**
   * Embeds an array of texts.
   * Serialized through the long-lived process FIFO queue.
   */
  public async embed(texts: string[], isQuery: boolean): Promise<number[][]> {
    if (!Array.isArray(texts)) {
      throw new Error('texts must be an array of strings');
    }
    if (texts.length === 0) {
      return [];
    }

    await this.ensureProcess();

    return new Promise<number[][]>((resolve, reject) => {
      this.requestQueue.push({
        texts,
        isQuery,
        resolve,
        reject,
      });

      this.processNext();
    });
  }

  /**
   * Ensures the long-lived Python subprocess is running and listening on stdin.
   */
  private async ensureProcess(): Promise<void> {
    if (this.process && !this.process.killed && this.process.stdin?.writable) {
      return;
    }

    if (this.isStarting && this.startupPromise) {
      return this.startupPromise;
    }

    this.isStarting = true;
    this.startupPromise = this.startSubprocess();

    try {
      await this.startupPromise;
    } finally {
      this.isStarting = false;
      this.startupPromise = null;
    }
  }

  private startSubprocess(): Promise<void> {
    return new Promise((resolve, reject) => {
      const pythonExe = this.getPythonPath();
      const scriptPath = this.getScriptPath();

      console.log(
        `[PythonEmbeddingRunner] Launching long-lived embedder process: python="${pythonExe}", script="${scriptPath}"`
      );

      let child: ChildProcess;
      try {
        child = spawn(pythonExe, ['-u', scriptPath], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err: any) {
        this.isHealthy = false;
        console.error(`[PythonEmbeddingRunner] Spawn error: ${err.message}`);
        return reject(new Error(`Failed to spawn Python process: ${err.message}`));
      }

      this.process = child;
      this.stdoutBuffer = '';
      this.stderrHistory = [];

      let hasStarted = false;
      let startupTimer: NodeJS.Timeout | null = null;

      const cleanupStartup = () => {
        if (startupTimer) {
          clearTimeout(startupTimer);
          startupTimer = null;
        }
      };

      startupTimer = setTimeout(() => {
        if (!hasStarted) {
          hasStarted = true;
          this.isHealthy = false;
          console.error(
            `[PythonEmbeddingRunner] Startup timed out after ${this.startupTimeoutMs}ms waiting for BGE model readiness.`
          );
          try {
            child.kill();
          } catch {
            // Ignore
          }
          const recent = this.getRecentStderr();
          reject(new Error(`Python embedder process startup timed out after ${this.startupTimeoutMs}ms: ${recent}`));
        }
      }, this.startupTimeoutMs);

      child.stdout?.on('data', (chunk: Buffer) => {
        this.stdoutBuffer += chunk.toString('utf8');
        let newlineIndex: number;
        while ((newlineIndex = this.stdoutBuffer.indexOf('\n')) !== -1) {
          const line = this.stdoutBuffer.slice(0, newlineIndex).trim();
          this.stdoutBuffer = this.stdoutBuffer.slice(newlineIndex + 1);
          if (line.length > 0) {
            if (!hasStarted) {
              try {
                const parsed = JSON.parse(line);
                if (parsed.ready === true) {
                  hasStarted = true;
                  cleanupStartup();

                  if (parsed.device === 'cuda' || parsed.device === 'cpu') {
                    this.device = parsed.device;
                  }
                  if (parsed.model) {
                    this.modelName = parsed.model;
                  }
                  if (parsed.dimension && typeof parsed.dimension === 'number') {
                    this.dimension = parsed.dimension;
                  }
                  this.isHealthy = true;

                  console.log(
                    `[PythonEmbeddingRunner] BGE model ready: model="${this.modelName}", device="${this.device}", dimension=${this.dimension}`
                  );
                  resolve();
                  continue;
                } else if (parsed.error) {
                  hasStarted = true;
                  cleanupStartup();
                  this.isHealthy = false;
                  reject(new Error(`Python embedder startup reported error: ${parsed.error}`));
                  continue;
                }
              } catch {
                // Non-JSON or preliminary log line during startup; continue waiting for readiness message
              }
            }
            this.handleStdoutLine(line);
          }
        }
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        const text = chunk.toString('utf8');
        this.recordStderr(text);
      });

      child.on('error', (err: Error) => {
        console.error(`[PythonEmbeddingRunner] Child process error: ${err.message}`);
        this.isHealthy = false;
        cleanupStartup();
        this.handleProcessTermination(child, null, err.message);
        if (!hasStarted) {
          hasStarted = true;
          reject(err);
        }
      });

      child.on('exit', (code, signal) => {
        console.warn(`[PythonEmbeddingRunner] Process exited (code: ${code}, signal: ${signal})`);
        this.isHealthy = false;
        cleanupStartup();
        this.handleProcessTermination(child, code, signal);
        if (!hasStarted) {
          hasStarted = true;
          const recent = this.getRecentStderr();
          reject(new Error(`Python embedder process failed to start (exit code ${code}): ${recent}`));
        }
      });
    });
  }

  private processNext(): void {
    if (this.activeRequest !== null || this.requestQueue.length === 0) {
      return;
    }

    if (!this.process || !this.process.stdin?.writable) {
      // Process died or not ready; attempt restart on next run
      const item = this.requestQueue.shift();
      if (item) {
        item.reject(new Error('Python embedder process is not writable or not running.'));
      }
      return;
    }

    const item = this.requestQueue.shift()!;
    this.activeRequest = item;

    // Set request timeout
    item.timer = setTimeout(() => {
      if (this.activeRequest === item) {
        console.error(`[PythonEmbeddingRunner] Embedding request timed out after ${this.timeoutMs}ms`);
        this.activeRequest = null;
        item.reject(new Error(`Embedding request timed out after ${this.timeoutMs}ms`));

        // Kill unresponsive process to avoid stream desynchronization
        if (this.process) {
          try {
            this.process.kill();
          } catch {
            // Ignore
          }
        }
        this.processNext();
      }
    }, this.timeoutMs);

    const payload = JSON.stringify({
      texts: item.texts,
      is_query: item.isQuery,
    }) + '\n';

    try {
      this.process.stdin.write(payload, 'utf8');
    } catch (err: any) {
      if (item.timer) clearTimeout(item.timer);
      this.activeRequest = null;
      item.reject(new Error(`Failed to write request to Python stdin: ${err.message}`));
      this.processNext();
    }
  }

  private handleStdoutLine(line: string): void {
    if (!this.activeRequest) {
      return;
    }

    const item = this.activeRequest;
    if (item.timer) {
      clearTimeout(item.timer);
    }
    this.activeRequest = null;

    try {
      const parsed = JSON.parse(line);
      if (parsed.error) {
        console.error(`[PythonEmbeddingRunner] Embedding engine error response: ${parsed.error}`);
        item.reject(new Error(parsed.error));
      } else if (Array.isArray(parsed.embeddings)) {
        item.resolve(parsed.embeddings);
      } else {
        item.reject(new Error(`Malformed Python response: expected 'embeddings' array or 'error', got ${line}`));
      }
    } catch (err: any) {
      console.error(`[PythonEmbeddingRunner] Failed to parse stdout line as JSON: ${line}`);
      item.reject(new Error(`Malformed JSON response from Python embedder: ${err.message}`));
    }

    // Process next queued request
    this.processNext();
  }

  private handleProcessTermination(
    terminatedChild: ChildProcess,
    code: number | null,
    signal: string | null
  ): void {
    if (this.process === terminatedChild) {
      this.process = null;

      if (this.activeRequest) {
        const item = this.activeRequest;
        if (item.timer) clearTimeout(item.timer);
        this.activeRequest = null;
        const recent = this.getRecentStderr();
        item.reject(new Error(`Python embedder process terminated unexpectedly (code ${code}): ${recent}`));
      }

      // Reject all queued requests
      while (this.requestQueue.length > 0) {
        const q = this.requestQueue.shift()!;
        if (q.timer) clearTimeout(q.timer);
        q.reject(new Error(`Python embedder process exited before processing request (code ${code})`));
      }
    }
  }

  private recordStderr(chunk: string): void {
    const lines = chunk.split('\n').map((l) => l.trim()).filter(Boolean);
    for (const l of lines) {
      this.stderrHistory.push(l);
      if (this.stderrHistory.length > this.maxStderrLines) {
        this.stderrHistory.shift();
      }
    }
  }

  public getRecentStderr(): string {
    return this.stderrHistory.slice(-5).join('; ') || 'No stderr available';
  }

  /**
   * Explicitly restarts the Python runner process.
   */
  public async restart(): Promise<void> {
    console.log('[PythonEmbeddingRunner] Restart requested.');
    this.shutdown();
    await this.checkHealth(true);
    if (this.isHealthy) {
      await this.ensureProcess();
    }
  }

  /**
   * Graceful shutdown of the Python runner process.
   */
  public shutdown(): void {
    if (this.process) {
      console.log('[PythonEmbeddingRunner] Shutting down Python embedder process...');
      const proc = this.process;
      this.process = null;

      try {
        if (proc.stdin?.writable) {
          proc.stdin.end();
        }
      } catch {
        // Ignore
      }

      try {
        if (!proc.killed) {
          proc.kill('SIGTERM');
        }
      } catch {
        // Ignore
      }
    }

    if (this.activeRequest) {
      if (this.activeRequest.timer) clearTimeout(this.activeRequest.timer);
      this.activeRequest.reject(new Error('PythonEmbeddingRunner shutdown'));
      this.activeRequest = null;
    }

    while (this.requestQueue.length > 0) {
      const q = this.requestQueue.shift()!;
      if (q.timer) clearTimeout(q.timer);
      q.reject(new Error('PythonEmbeddingRunner shutdown'));
    }

    this.isHealthy = false;
    console.log('[PythonEmbeddingRunner] Shutdown completed.');
  }
}

export const pythonEmbeddingRunner = PythonEmbeddingRunner.getInstance();
