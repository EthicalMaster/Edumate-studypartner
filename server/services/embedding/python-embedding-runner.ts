/**
 * EDUMATE Phase 7: Real BAAI/bge-small-en-v1.5 Python Embedding Subprocess Runner
 *
 * Requirements addressed:
 * - Subprocess lifetime: Spawns and manages a single long-lived Python worker process (`embedder.py`).
 * - Inter-process communication: Standard input/output over JSON lines (ndjson protocol).
 * - Health check probe: Executes `python embedder.py --device` on startup to probe device and capability.
 *   - Device probe timeout is configurable via EMBEDDING_HEALTHCHECK_TIMEOUT_MS (default: 30000ms).
 * - Startup readiness handshake: Awaits the dedicated `{"ready": true, "device": "...", "model": "...", "dimension": 384}`
 *   handshake emitted by embedder.py after PyTorch/SentenceTransformers and weights have loaded into memory/CUDA.
 * - Startup timeout: Configurable via EMBEDDING_STARTUP_TIMEOUT_MS (default: 120000ms / 2 minutes).
 * - Queueing & Serialization: Strictly serializes JSON requests using an in-memory queue to guarantee FIFO ordering.
 * - Error isolation: Catches non-zero exit codes, stderr traces, JSON parsing failures, and request timeouts.
 * - Auto-restart: Transparently restarts the Python subprocess upon unexpected termination or fatal crash.
 */

import { spawn, type ChildProcess } from 'child_process';
import path from 'path';
import fs from 'fs';

/**
 * Resolves the Python executable to run.
 * Checks EMBEDDING_PYTHON_PATH first; falls back to 'python3' or 'python' based on platform.
 */
export function resolvePythonExecutable(): string {
  const custom = process.env.EMBEDDING_PYTHON_PATH?.trim();
  if (custom && custom.length > 0) {
    return custom;
  }
  return process.platform === 'win32' ? 'python' : 'python3';
}

/**
 * Resolves the probe timeout in milliseconds.
 * Uses EMBEDDING_HEALTHCHECK_TIMEOUT_MS if valid and positive.
 * Defaults to 30000ms (30 seconds) to accommodate slow cold-starts on local development or low-resource hardware.
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
  const candidate = path.resolve(process.cwd(), 'server', 'services', 'embedding', 'embedder.py');
  if (fs.existsSync(candidate)) {
    return candidate;
  }
  // Alternate: if executed inside server/ or dist/
  const alternate = path.resolve(__dirname, 'embedder.py');
  if (fs.existsSync(alternate)) {
    return alternate;
  }
  return candidate;
}

export interface DeviceProbeResult {
  available: boolean;
  device: 'cuda' | 'cpu' | 'unknown';
  model: string;
  dimension: number;
  error?: string;
}

interface QueuedEmbeddingRequest {
  id: string;
  payload: string;
  resolve: (embeddings: number[][]) => void;
  reject: (err: Error) => void;
  timer?: NodeJS.Timeout;
}

export class PythonEmbeddingRunner {
  private static instance: PythonEmbeddingRunner | null = null;

  private pythonPath: string = resolvePythonExecutable();
  private scriptPath: string = resolveEmbedderScriptPath();
  private process: ChildProcess | null = null;
  private isHealthy = false;
  private isStarting = false;
  private startPromise: Promise<void> | null = null;
  private requestQueue: QueuedEmbeddingRequest[] = [];
  private activeRequest: QueuedEmbeddingRequest | null = null;
  private stdoutBuffer = '';
  private stderrHistory: string[] = [];
  private nextRequestId = 1;

  private device: 'cuda' | 'cpu' | 'unknown' = 'unknown';
  private modelName = 'BAAI/bge-small-en-v1.5';
  private dimension = 384;
  private timeoutMs = 30000;
  private healthcheckTimeoutMs: number = resolveHealthcheckTimeoutMs();
  private startupTimeoutMs: number = resolveStartupTimeoutMs();

  private constructor() {
    // Perform initial non-blocking health check
    this.probeDevice().catch((err) => {
      console.warn(`[PythonEmbeddingRunner] Background probe encountered: ${err.message}`);
    });
  }

  public static getInstance(): PythonEmbeddingRunner {
    if (!PythonEmbeddingRunner.instance) {
      PythonEmbeddingRunner.instance = new PythonEmbeddingRunner();
    }
    return PythonEmbeddingRunner.instance;
  }

  /**
   * Allows unit tests to point the runner to a mock python script or executable.
   */
  public configure(options: {
    pythonPath?: string;
    scriptPath?: string;
    timeoutMs?: number;
    healthcheckTimeoutMs?: number;
    startupTimeoutMs?: number;
  }): void {
    if (options.pythonPath) this.pythonPath = options.pythonPath;
    if (options.scriptPath) this.scriptPath = options.scriptPath;
    if (options.timeoutMs !== undefined) this.timeoutMs = options.timeoutMs;
    if (options.healthcheckTimeoutMs !== undefined) {
      this.healthcheckTimeoutMs = options.healthcheckTimeoutMs;
    }
    if (options.startupTimeoutMs !== undefined) {
      this.startupTimeoutMs = options.startupTimeoutMs;
    }
  }

  public isAvailable(): boolean {
    return this.isHealthy;
  }

  public getDevice(): string {
    return this.device;
  }

  public getModelName(): string {
    return this.modelName;
  }

  public getDimension(): number {
    return this.dimension;
  }

  public getTimeoutMs(): number {
    return this.timeoutMs;
  }

  public setTimeoutMs(timeoutMs: number): void {
    this.timeoutMs = timeoutMs;
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
  public async probeDevice(): Promise<DeviceProbeResult> {
    return new Promise<DeviceProbeResult>((resolve) => {
      const pythonExecutable = this.pythonPath;
      const script = this.scriptPath;

      if (!fs.existsSync(script)) {
        this.isHealthy = false;
        resolve({
          available: false,
          device: 'unknown',
          model: this.modelName,
          dimension: this.dimension,
          error: `Script not found at: ${script}`,
        });
        return;
      }

      let child: ChildProcess;
      try {
        child = spawn(pythonExecutable, [script, '--device'], {
          env: { ...process.env, PYTHONUNBUFFERED: '1' },
        });
      } catch (err: any) {
        this.isHealthy = false;
        resolve({
          available: false,
          device: 'unknown',
          model: this.modelName,
          dimension: this.dimension,
          error: `Failed to spawn ${pythonExecutable}: ${err.message}`,
        });
        return;
      }

      let stdout = '';
      let stderr = '';
      let hasFinished = false;

      const timeout = setTimeout(() => {
        if (!hasFinished) {
          hasFinished = true;
          this.isHealthy = false;
          try {
            child.kill();
          } catch {
            // Ignore
          }
          resolve({
            available: false,
            device: 'unknown',
            model: this.modelName,
            dimension: this.dimension,
            error: `Device probe timed out after ${this.healthcheckTimeoutMs}ms. Configure EMBEDDING_HEALTHCHECK_TIMEOUT_MS to adjust.`,
          });
        }
      }, this.healthcheckTimeoutMs);

      child.stdout?.on('data', (chunk) => {
        stdout += chunk.toString();
      });

      child.stderr?.on('data', (chunk) => {
        stderr += chunk.toString();
      });

      child.on('error', (err) => {
        if (!hasFinished) {
          hasFinished = true;
          clearTimeout(timeout);
          this.isHealthy = false;
          resolve({
            available: false,
            device: 'unknown',
            model: this.modelName,
            dimension: this.dimension,
            error: `Subprocess error: ${err.message}`,
          });
        }
      });

      child.on('close', (code) => {
        if (!hasFinished) {
          hasFinished = true;
          clearTimeout(timeout);

          if (code !== 0) {
            this.isHealthy = false;
            resolve({
              available: false,
              device: 'unknown',
              model: this.modelName,
              dimension: this.dimension,
              error: `Device probe exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
            });
            return;
          }

          try {
            const parsed = JSON.parse(stdout.trim());
            this.device = parsed.device || 'cpu';
            this.modelName = parsed.model || 'BAAI/bge-small-en-v1.5';
            this.dimension = parsed.dimension || 384;
            this.isHealthy = true;

            console.log(
              `[PythonEmbeddingRunner] Real BGE engine verified: python="${this.pythonPath}", model="${this.modelName}", device="${this.device}"`
            );

            resolve({
              available: true,
              device: this.device,
              model: this.modelName,
              dimension: this.dimension,
            });
          } catch (e: any) {
            this.isHealthy = false;
            resolve({
              available: false,
              device: 'unknown',
              model: this.modelName,
              dimension: this.dimension,
              error: `Invalid probe JSON: ${stdout.trim() || e.message}`,
            });
          }
        }
      });
    });
  }

  /**
   * Embeds an array of texts. Texts can be document chunks or queries.
   * @param texts An array of strings to embed.
   * @param isQuery Whether these texts represent search queries (prepends BGE query prompt in embedder.py).
   */
  public async embed(texts: string[], isQuery = false): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    // Ensure the subprocess is alive
    await this.ensureProcess();

    return new Promise<number[][]>((resolve, reject) => {
      const requestId = `req_${this.nextRequestId++}_${Date.now()}`;
      const payload = JSON.stringify({
        texts,
        is_query: isQuery,
      });

      const queueItem: QueuedEmbeddingRequest = {
        id: requestId,
        payload,
        resolve,
        reject,
      };

      // Set timeout per request to prevent permanent deadlocks
      queueItem.timer = setTimeout(() => {
        this.handleTimeout(queueItem);
      }, this.timeoutMs);

      this.requestQueue.push(queueItem);
      this.processNext();
    });
  }

  /**
   * Convenience wrapper for a single search query.
   */
  public async embedQuery(query: string): Promise<number[]> {
    const vectors = await this.embed([query], true);
    if (!vectors || vectors.length === 0) {
      throw new Error('[PythonEmbeddingRunner] Received empty embedding response for query.');
    }
    return vectors[0];
  }

  /**
   * Convenience wrapper for batch of document chunks.
   */
  public async embedDocuments(chunks: string[]): Promise<number[][]> {
    return this.embed(chunks, false);
  }

  /**
   * Ensures the long-lived Python subprocess is initialized, ready, and connected.
   */
  private async ensureProcess(): Promise<void> {
    if (this.process && !this.process.killed && this.process.exitCode === null) {
      return;
    }

    if (this.isStarting && this.startPromise) {
      return this.startPromise;
    }

    this.isStarting = true;
    this.startPromise = this.startSubprocess()
      .finally(() => {
        this.isStarting = false;
        this.startPromise = null;
      });

    return this.startPromise;
  }

  /**
   * Launches the persistent Python subprocess running embedder.py in interactive stdin/stdout mode.
   * Awaits the dedicated {"ready": true, "device": "...", "model": "...", "dimension": 384} handshake
   * emitted by embedder.py after PyTorch/SentenceTransformers have fully loaded into memory/CUDA.
   */
  private async startSubprocess(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (!fs.existsSync(this.scriptPath)) {
        this.isHealthy = false;
        return reject(
          new Error(`Python embedder script not found at ${this.scriptPath}. Please run python embedder.py.`)
        );
      }

      console.log(
        `[PythonEmbeddingRunner] Launching long-lived embedder process: python="${this.pythonPath}", script="${this.scriptPath}"`
      );

      const child = spawn(this.pythonPath, [this.scriptPath], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, PYTHONUNBUFFERED: '1' },
      });

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
        this.stderrHistory.push(text);
        if (this.stderrHistory.length > 50) {
          this.stderrHistory.shift();
        }
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

  /**
   * Dispatch the next queued request to the running Python process.
   */
  private processNext(): void {
    if (this.activeRequest !== null) {
      // Busy processing previous request (FIFO guarantee)
      return;
    }

    if (this.requestQueue.length === 0) {
      return;
    }

    if (!this.process || !this.process.stdin || !this.process.stdin.writable) {
      const pending = this.requestQueue.shift();
      if (pending) {
        if (pending.timer) clearTimeout(pending.timer);
        pending.reject(new Error('Python embedder process is not writable or not running.'));
      }
      return;
    }

    const next = this.requestQueue.shift()!;
    this.activeRequest = next;

    try {
      this.process.stdin.write(next.payload + '\n', 'utf8', (err) => {
        if (err) {
          console.error(`[PythonEmbeddingRunner] stdin write error for ${next.id}: ${err.message}`);
          if (next.timer) clearTimeout(next.timer);
          this.activeRequest = null;
          next.reject(new Error(`Failed to write to Python embedder stdin: ${err.message}`));
          this.processNext();
        }
      });
    } catch (err: any) {
      if (next.timer) clearTimeout(next.timer);
      this.activeRequest = null;
      next.reject(new Error(`Unexpected stdin write exception: ${err.message}`));
      this.processNext();
    }
  }

  /**
   * Handles complete lines received from embedder.py's stdout.
   */
  private handleStdoutLine(line: string): void {
    if (!this.activeRequest) {
      // Spurious log or banner line
      return;
    }

    const current = this.activeRequest;

    let parsed: any;
    try {
      parsed = JSON.parse(line);
    } catch (e: any) {
      console.error(`[PythonEmbeddingRunner] Failed to parse stdout line as JSON: ${line}`);
      if (current.timer) clearTimeout(current.timer);
      this.activeRequest = null;
      current.reject(
        new Error(`Python embedder returned malformed JSON response: ${line.substring(0, 100)}`)
      );
      this.processNext();
      return;
    }

    if (current.timer) {
      clearTimeout(current.timer);
    }
    this.activeRequest = null;

    if (parsed.error) {
      current.reject(new Error(`Python embedder error: ${parsed.error}`));
    } else if (Array.isArray(parsed.embeddings)) {
      current.resolve(parsed.embeddings);
    } else {
      current.reject(new Error('Python embedder returned payload missing "embeddings" array.'));
    }

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

  private handleTimeout(item: QueuedEmbeddingRequest): void {
    console.warn(`[PythonEmbeddingRunner] Embedding request timed out after ${this.timeoutMs}ms`);
    if (this.activeRequest === item) {
      this.activeRequest = null;
      // Restart process because Python might be stuck in heavy compute or deadlocked
      this.restart();
    } else {
      const idx = this.requestQueue.indexOf(item);
      if (idx !== -1) {
        this.requestQueue.splice(idx, 1);
      }
    }
    item.reject(new Error(`Embedding request timed out after ${this.timeoutMs}ms.`));
    this.processNext();
  }

  private getRecentStderr(): string {
    return this.stderrHistory.slice(-5).join('').trim();
  }

  /**
   * Transparently restarts the Python runner process.
   */
  public async restart(): Promise<void> {
    console.log('[PythonEmbeddingRunner] Restart requested.');
    this.shutdown();
    await this.probeDevice();
    await this.ensureProcess();
  }

  /**
   * Gracefully shuts down the Python process and cleans up.
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
      this.activeRequest.reject(new Error('Runner shutdown before embedding response arrived.'));
      this.activeRequest = null;
    }

    while (this.requestQueue.length > 0) {
      const q = this.requestQueue.shift()!;
      if (q.timer) clearTimeout(q.timer);
      q.reject(new Error('Runner shutdown.'));
    }

    console.log('[PythonEmbeddingRunner] Shutdown completed.');
  }
}
export const pythonEmbeddingRunner = PythonEmbeddingRunner.getInstance();
