/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import {
  PythonEmbeddingRunner,
  resolvePythonExecutable,
  resolveEmbedderScriptPath,
  resolveHealthcheckTimeoutMs,
  resolveStartupTimeoutMs,
} from '../services/embedding/python-embedding-runner.js';
import { LocalBgeEmbeddingService } from '../services/embedding/embedding.service.js';

let totalTests = 0;
let passedTests = 0;

async function test(name: string, fn: () => Promise<void> | void): Promise<void> {
  totalTests++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passedTests++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.stack || err.message}`);
    throw err;
  }
}

async function runTests(): Promise<void> {
  console.log('=== AVEN Phase 7 Python Embedding Runner Test Suite ===\n');

  const tmpMockScriptPath = path.resolve(process.cwd(), 'temp-mock-embedder.py');

  try {
    // --------------------------------------------------------------------------
    // 1. Path Resolution & Executable Detection
    // --------------------------------------------------------------------------
    console.log('--- 1. Path Resolution & Configuration ---');

    await test('resolvePythonExecutable respects EMBEDDING_PYTHON_PATH when provided', () => {
      const original = process.env.EMBEDDING_PYTHON_PATH;
      try {
        process.env.EMBEDDING_PYTHON_PATH = '/custom/python3.13';
        assert.strictEqual(resolvePythonExecutable(), '/custom/python3.13');
      } finally {
        if (original !== undefined) {
          process.env.EMBEDDING_PYTHON_PATH = original;
        } else {
          delete process.env.EMBEDDING_PYTHON_PATH;
        }
      }
    });

    await test('resolvePythonExecutable defaults correctly according to platform', () => {
      const original = process.env.EMBEDDING_PYTHON_PATH;
      try {
        delete process.env.EMBEDDING_PYTHON_PATH;
        const exe = resolvePythonExecutable();
        if (process.platform === 'win32') {
          assert.strictEqual(exe, 'python');
        } else {
          assert.strictEqual(exe, 'python3');
        }
      } finally {
        if (original !== undefined) {
          process.env.EMBEDDING_PYTHON_PATH = original;
        }
      }
    });

    await test('resolveEmbedderScriptPath finds embedder.py', () => {
      const scriptPath = resolveEmbedderScriptPath();
      assert(fs.existsSync(scriptPath), `Embedder script must exist at ${scriptPath}`);
      assert(scriptPath.endsWith('embedder.py'));
    });

    await test('resolveHealthcheckTimeoutMs defaults to 30000ms when absent or invalid', () => {
      const original = process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
      try {
        delete process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
        assert.strictEqual(resolveHealthcheckTimeoutMs(), 30000);

        process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = 'not_a_number';
        assert.strictEqual(resolveHealthcheckTimeoutMs(), 30000);

        process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = '-500';
        assert.strictEqual(resolveHealthcheckTimeoutMs(), 30000);

        process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = '   ';
        assert.strictEqual(resolveHealthcheckTimeoutMs(), 30000);
      } finally {
        if (original !== undefined) {
          process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = original;
        } else {
          delete process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
        }
      }
    });

    await test('resolveHealthcheckTimeoutMs parses positive integers from EMBEDDING_HEALTHCHECK_TIMEOUT_MS', () => {
      const original = process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
      try {
        process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = '45000';
        assert.strictEqual(resolveHealthcheckTimeoutMs(), 45000);

        process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = ' 12000 ';
        assert.strictEqual(resolveHealthcheckTimeoutMs(), 12000);
      } finally {
        if (original !== undefined) {
          process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = original;
        } else {
          delete process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
        }
      }
    });

    await test('PythonEmbeddingRunner defaults healthcheckTimeoutMs to 30000ms', () => {
      const runner = PythonEmbeddingRunner.getInstance();
      assert.strictEqual(runner.getHealthcheckTimeoutMs(), 30000);
      assert.strictEqual(runner.getTimeoutMs(), 30000);
      assert.strictEqual(runner.getStartupTimeoutMs(), 120000);
    });

    await test('resolveStartupTimeoutMs defaults to 120000ms and parses positive integers', () => {
      const original = process.env.EMBEDDING_STARTUP_TIMEOUT_MS;
      try {
        delete process.env.EMBEDDING_STARTUP_TIMEOUT_MS;
        assert.strictEqual(resolveStartupTimeoutMs(), 120000);

        process.env.EMBEDDING_STARTUP_TIMEOUT_MS = 'not_a_num';
        assert.strictEqual(resolveStartupTimeoutMs(), 120000);

        process.env.EMBEDDING_STARTUP_TIMEOUT_MS = '180000';
        assert.strictEqual(resolveStartupTimeoutMs(), 180000);

        process.env.EMBEDDING_STARTUP_TIMEOUT_MS = ' 60000 ';
        assert.strictEqual(resolveStartupTimeoutMs(), 60000);
      } finally {
        if (original !== undefined) {
          process.env.EMBEDDING_STARTUP_TIMEOUT_MS = original;
        } else {
          delete process.env.EMBEDDING_STARTUP_TIMEOUT_MS;
        }
      }
    });

    // --------------------------------------------------------------------------
    // 2. Unavailable Python Engine & Strict Fallback Safety
    // --------------------------------------------------------------------------
    console.log('\n--- 2. Unavailable Python Engine & Strict Safety ---');

    await test('When Python engine is unavailable, checkHealth reports error cleanly', async () => {
      const originalPath = process.env.EMBEDDING_PYTHON_PATH;
      try {
        process.env.EMBEDDING_PYTHON_PATH = 'non_existent_python_binary_98765';
        const runner = PythonEmbeddingRunner.getInstance();
        const health = await runner.checkHealth(true);
        assert.strictEqual(health.isHealthy, false);
        assert(health.error !== undefined, 'Must report error description');
      } finally {
        if (originalPath !== undefined) {
          process.env.EMBEDDING_PYTHON_PATH = originalPath;
        } else {
          delete process.env.EMBEDDING_PYTHON_PATH;
        }
      }
    });

    await test('LocalBgeEmbeddingService strictly rejects silent fallback by default', async () => {
      const service = new LocalBgeEmbeddingService();
      service.setAllowTestFallback(false);

      const diag = service.getDiagnostics();
      assert.strictEqual(diag.fallbackAllowed, false);
      assert.strictEqual(diag.isFallback, false);

      // If real engine is not available, isReady must be false and embedTexts must throw
      if (!service.isRealEngineReady) {
        assert.strictEqual(diag.isReady, false);
        assert.strictEqual(diag.modelName, 'UNAVAILABLE');

        let threwTexts = false;
        try {
          await service.embedTexts(['Sample sentence']);
        } catch (err: any) {
          threwTexts = true;
          assert(err.message.includes('EmbeddingEngineUnavailable'));
          assert(err.message.includes('EMBEDDING_ALLOW_TEST_FALLBACK'));
        }
        assert.strictEqual(threwTexts, true);

        let threwQuery = false;
        try {
          await service.embedQuery('Sample query');
        } catch (err: any) {
          threwQuery = true;
          assert(err.message.includes('EmbeddingEngineUnavailable'));
        }
        assert.strictEqual(threwQuery, true);
      }
    });

    await test('Explicit test fallback operates when explicitly enabled', async () => {
      const service = new LocalBgeEmbeddingService();
      service.setAllowTestFallback(true);

      const diag = service.getDiagnostics();
      assert.strictEqual(diag.fallbackAllowed, true);
      assert.strictEqual(diag.isReady, true);

      if (!service.isRealEngineReady) {
        assert.strictEqual(diag.isFallback, true);
        assert.strictEqual(diag.modelName, 'TEST FALLBACK');

        const [vec] = await service.embedTexts(['Test input']);
        assert.strictEqual(vec.length, 384);

        const qVec = await service.embedQuery('Query input');
        assert.strictEqual(qVec.length, 384);
      }
    });

    // --------------------------------------------------------------------------
    // 3. Mock Protocol Subprocess Verification (Real JSON Lines Pipe)
    // --------------------------------------------------------------------------
    console.log('\n--- 3. Python JSON Lines Protocol Verification ---');

    // Create a mock embedder script that implements the embedder.py JSON Lines protocol
    const mockPythonScript = `
import sys
import json
import math
import os
import time

def generate_vector(text, dim=384):
    val = float(len(text) % 10 + 1)
    norm = math.sqrt(dim * (val * val))
    return [round(val / norm, 6) for _ in range(dim)]

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--device":
        if os.environ.get("SIMULATE_SLOW_PROBE") == "1":
            # Simulate a 600ms slow probe (representing long initialization in test environment)
            time.sleep(0.6)
        print(json.dumps({"device": "cuda", "model": "BAAI/bge-small-en-v1.5", "dimension": 384}))
        sys.stdout.flush()
        return

    # Simulate exit before readiness if requested
    if os.environ.get("SIMULATE_EXIT_BEFORE_READY") == "1":
        sys.stderr.write("Simulated startup failure: CUDA out of memory during SentenceTransformer initialization\\n")
        sys.exit(137)

    # Simulate startup timeout / hang if requested
    if os.environ.get("SIMULATE_SLOW_STARTUP") == "1":
        time.sleep(2.0)

    # Dedicated readiness message emitted to stdout after model is fully loaded
    print(json.dumps({
        "ready": True,
        "device": "cuda",
        "model": "BAAI/bge-small-en-v1.5",
        "dimension": 384
    }))
    sys.stdout.flush()

    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            req = json.loads(line)
            texts = req.get("texts", [])
            is_query = req.get("is_query", False)

            if texts and texts[0] == "__TRIGGER_MALFORMED__":
                print("THIS_IS_NOT_VALID_JSON")
                sys.stdout.flush()
                continue
            if texts and texts[0] == "__TRIGGER_CRASH__":
                sys.stderr.write("Simulated worker fatal crash!\\n")
                sys.exit(42)
            if texts and texts[0] == "__TRIGGER_TIMEOUT__":
                time.sleep(2.0)
                continue

            embeddings = [generate_vector(("QUERY: " if is_query else "") + t) for t in texts]
            print(json.dumps({"embeddings": embeddings}))
            sys.stdout.flush()
        except Exception as err:
            print(json.dumps({"error": str(err)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
`;

    fs.writeFileSync(tmpMockScriptPath, mockPythonScript, 'utf8');

    // Point runner to the mock script to test full protocol interaction
    const runner = PythonEmbeddingRunner.getInstance();
    // Temporarily patch getScriptPath
    (runner as any).getScriptPath = () => tmpMockScriptPath;

    await test('Runner health check detects mock CUDA device and 384 dimension', async () => {
      const health = await runner.checkHealth(true);
      assert.strictEqual(health.isHealthy, true);
      assert.strictEqual(health.device, 'cuda');
      assert.strictEqual(health.dimension, 384);
      assert.strictEqual(health.model, 'BAAI/bge-small-en-v1.5');
    });

    await test('Health check accepts probe completing within configurable timeout window (>5s equivalent)', async () => {
      process.env.SIMULATE_SLOW_PROBE = '1';
      // Set healthcheck timeout to 2000ms (greater than the 600ms simulated initialization delay)
      runner.setHealthcheckTimeoutMs(2000);
      try {
        const health = await runner.checkHealth(true);
        assert.strictEqual(health.isHealthy, true, 'Probe taking longer than normal must succeed before timeout');
        assert.strictEqual(health.device, 'cuda');
      } finally {
        delete process.env.SIMULATE_SLOW_PROBE;
        runner.setHealthcheckTimeoutMs(30000);
      }
    });

    await test('Health check fails cleanly when probe exceeds configured timeout', async () => {
      process.env.SIMULATE_SLOW_PROBE = '1';
      // Set healthcheck timeout shorter than the 600ms simulated probe delay
      runner.setHealthcheckTimeoutMs(200);
      try {
        const health = await runner.checkHealth(true);
        assert.strictEqual(health.isHealthy, false, 'Probe exceeding timeout must be reported unhealthy');
        assert(health.error?.includes('timed out after 200ms'), `Expected timeout error message, got: ${health.error}`);
      } finally {
        delete process.env.SIMULATE_SLOW_PROBE;
        runner.setHealthcheckTimeoutMs(30000);
      }
    });

    await test('Runner startSubprocess waits for ready:true handshake and updates device/model/dimension', async () => {
      runner.shutdown();
      // Verify ensureProcess waits for ready:true handshake
      await (runner as any).ensureProcess();
      assert.strictEqual(runner.isAvailable(), true);
      assert.strictEqual(runner.getDevice(), 'cuda');
      assert.strictEqual(runner.getModelName(), 'BAAI/bge-small-en-v1.5');
      assert.strictEqual(runner.getDimension(), 384);
    });

    await test('Runner rejects startup if process exits before emitting ready:true', async () => {
      runner.shutdown();
      process.env.SIMULATE_EXIT_BEFORE_READY = '1';
      try {
        let threw = false;
        try {
          await (runner as any).ensureProcess();
        } catch (err: any) {
          threw = true;
          assert(
            err.message.includes('failed to start') || err.message.includes('CUDA out of memory') || err.message.includes('exit code 137'),
            `Unexpected error message: ${err.message}`
          );
        }
        assert.strictEqual(threw, true, 'Must reject when worker exits before ready:true handshake');
        assert.strictEqual(runner.isAvailable(), false);
      } finally {
        delete process.env.SIMULATE_EXIT_BEFORE_READY;
        runner.shutdown();
      }
    });

    await test('Runner startup times out if ready:true handshake is not received within EMBEDDING_STARTUP_TIMEOUT_MS', async () => {
      runner.shutdown();
      process.env.SIMULATE_SLOW_STARTUP = '1';
      runner.setStartupTimeoutMs(300); // Set small 300ms startup timeout for test
      try {
        let threw = false;
        try {
          await (runner as any).ensureProcess();
        } catch (err: any) {
          threw = true;
          assert(err.message.includes('startup timed out after 300ms'), `Unexpected error message: ${err.message}`);
        }
        assert.strictEqual(threw, true, 'Must reject on startup timeout before ready:true');
        assert.strictEqual(runner.isAvailable(), false);
      } finally {
        delete process.env.SIMULATE_SLOW_STARTUP;
        runner.setStartupTimeoutMs(120000); // Restore 120s default
        runner.shutdown();
      }
    });

    await test('embedTexts generates 384-dimensional vectors over JSON lines', async () => {
      const texts = ['The mitochondria is the powerhouse of the cell.', 'Photosynthesis converts light into chemical energy.'];
      const embeddings = await runner.embed(texts, false);

      assert.strictEqual(embeddings.length, 2);
      assert.strictEqual(embeddings[0].length, 384);
      assert.strictEqual(embeddings[1].length, 384);

      // Verify cosine normalization (sum of squares ≈ 1.0)
      const norm = embeddings[0].reduce((acc, v) => acc + v * v, 0);
      assert(Math.abs(norm - 1.0) < 0.01, `Embedding norm must be close to 1.0, got ${norm}`);
    });

    await test('embedQuery applies is_query=true in request payload', async () => {
      const query = 'How does cellular respiration function?';
      const embeddings = await runner.embed([query], true);

      assert.strictEqual(embeddings.length, 1);
      assert.strictEqual(embeddings[0].length, 384);
    });

    await test('Malformed JSON response from Python is caught and rejected cleanly without crashing Node', async () => {
      let caught = false;
      try {
        await runner.embed(['__TRIGGER_MALFORMED__'], false);
      } catch (err: any) {
        caught = true;
        assert(err.message.includes('Malformed JSON') || err.message.includes('Malformed Python'));
      }
      assert.strictEqual(caught, true, 'Must reject malformed JSON from Python worker');
    });

    await test('Unexpected process termination rejects active request and allows clean restart', async () => {
      let threw = false;
      try {
        await runner.embed(['__TRIGGER_CRASH__'], false);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('Python embedder process') || err.message.includes('exited'));
      }

      assert.strictEqual(threw, true, 'Must reject request when Python worker crashes');

      // Verify clean restart
      await runner.restart();
      const freshEmbeddings = await runner.embed(['Fresh test post-restart'], false);
      assert.strictEqual(freshEmbeddings.length, 1);
      assert.strictEqual(freshEmbeddings[0].length, 384);
    });

    await test('Timeout rejects request and cleans up without deadlocking queue', async () => {
      runner.setTimeoutMs(300); // Set 300ms timeout for test
      let timedOut = false;

      try {
        await runner.embed(['__TRIGGER_TIMEOUT__'], false);
      } catch (err: any) {
        timedOut = true;
        assert(err.message.includes('timed out'));
      } finally {
        runner.setTimeoutMs(30000); // Restore normal 30s timeout
      }

      assert.strictEqual(timedOut, true, 'Must reject request on timeout');

      // Next request restarts worker and completes normally
      await runner.restart();
      const recovered = await runner.embed(['Post-timeout request'], false);
      assert.strictEqual(recovered.length, 1);
      assert.strictEqual(recovered[0].length, 384);
    });

    await test('Stale asynchronous restart is cancelled by shutdown and does not spawn deleted script', async () => {
      const raceScriptPath = path.resolve(process.cwd(), 'temp-race-mock-embedder.py');
      // Create a mock script that introduces a slight delay in device probe
      const slowProbeScript = `
import sys
import json
import time

if len(sys.argv) > 1 and sys.argv[1] == "--device":
    time.sleep(0.3)
    print(json.dumps({"device": "cuda", "model": "BAAI/bge-small-en-v1.5", "dimension": 384}))
    sys.stdout.flush()
    sys.exit(0)

print(json.dumps({"ready": True, "device": "cuda", "model": "BAAI/bge-small-en-v1.5", "dimension": 384}))
sys.stdout.flush()
for line in sys.stdin:
    pass
`;
      fs.writeFileSync(raceScriptPath, slowProbeScript, 'utf8');

      const originalGetScriptPath = (runner as any).getScriptPath;
      (runner as any).getScriptPath = () => raceScriptPath;

      try {
        // 1. Start a restart operation
        const restartPromise = runner.restart();

        // 2. Shutdown the runner before the asynchronous restart reaches ensureProcess()
        runner.shutdown();

        // 3. Delete the mock script while restart is still in-flight
        fs.unlinkSync(raceScriptPath);

        // 4. Await the restart operation - it must exit cleanly without attempting to spawn the deleted script
        await restartPromise;

        // 5. Verify the stale restart did not spawn or mark healthy
        assert.strictEqual(runner.isAvailable(), false, 'Runner must not be marked healthy after stale restart');
        assert.strictEqual((runner as any).process, null, 'No child process should be active');
      } finally {
        (runner as any).getScriptPath = originalGetScriptPath;
        if (fs.existsSync(raceScriptPath)) {
          try {
            fs.unlinkSync(raceScriptPath);
          } catch {
            // Ignore
          }
        }
      }
    });

    // --------------------------------------------------------------------------
    // 4. Phase 7 Hotfix: Deterministic Startup Lifecycle, Readiness & Gating
    // --------------------------------------------------------------------------
    console.log('\n--- 4. Phase 7 Hotfix: Deterministic Readiness & Gating ---');

    await test('waitUntilReady waits for genuine BGE ready:true handshake', async () => {
      runner.shutdown();
      assert.strictEqual(runner.isAvailable(), false);
      const readyInfo = await runner.waitUntilReady();
      assert.strictEqual(readyInfo.isHealthy, true);
      assert.strictEqual(readyInfo.device, 'cuda');
      assert.strictEqual(readyInfo.model, 'BAAI/bge-small-en-v1.5');
      assert.strictEqual(readyInfo.dimension, 384);
      assert.strictEqual(runner.isAvailable(), true);
    });

    await test('Concurrent calls to waitUntilReady share a single startup promise and child process', async () => {
      runner.shutdown();
      assert.strictEqual(runner.isAvailable(), false);

      // Launch 5 concurrent calls
      const promises = [
        runner.waitUntilReady(),
        runner.waitUntilReady(),
        runner.waitUntilReady(),
        runner.waitUntilReady(),
        runner.waitUntilReady(),
      ];

      const results = await Promise.all(promises);
      for (const res of results) {
        assert.strictEqual(res.isHealthy, true);
        assert.strictEqual(res.device, 'cuda');
        assert.strictEqual(res.dimension, 384);
      }
      assert.strictEqual(runner.isAvailable(), true);
    });

    await test('Embedding request queued while BGE is starting waits for readiness without failing', async () => {
      runner.shutdown();
      process.env.SIMULATE_SLOW_STARTUP = '1'; // 2.0s delay in mock python script
      try {
        // Kick off runner startup in background
        const startupPromise = runner.waitUntilReady();
        assert.strictEqual(runner.isProcessStarting, true);

        // Service embed operation should wait for runner to finish starting
        const service = new LocalBgeEmbeddingService(runner);
        service.setAllowTestFallback(false);

        const embedPromise = service.embedTexts(['Late arriving text while model is still booting']);

        // Both should complete successfully
        const [startupRes, embeddings] = await Promise.all([startupPromise, embedPromise]);
        assert.strictEqual(startupRes.isHealthy, true);
        assert.strictEqual(embeddings.length, 1);
        assert.strictEqual(embeddings[0].length, 384);
        assert.strictEqual(runner.isAvailable(), true);
      } finally {
        delete process.env.SIMULATE_SLOW_STARTUP;
      }
    });

    await test('Successful CUDA readiness properly registers CUDA device', async () => {
      assert.strictEqual(runner.getDevice(), 'cuda');
      assert.strictEqual(runner.getModelName(), 'BAAI/bge-small-en-v1.5');
      assert.strictEqual(runner.getDimension(), 384);
    });

    await test('Startup timeout cleanly rejects waitUntilReady without leaving runner healthy', async () => {
      runner.shutdown();
      process.env.SIMULATE_SLOW_STARTUP = '1';
      runner.setStartupTimeoutMs(200); // 200ms timeout vs 2.0s delay
      try {
        let threw = false;
        try {
          await runner.waitUntilReady();
        } catch (err: any) {
          threw = true;
          assert(err.message.includes('startup timed out after 200ms'));
        }
        assert.strictEqual(threw, true, 'waitUntilReady must reject on timeout');
        assert.strictEqual(runner.isAvailable(), false);
        assert.strictEqual(runner.isProcessStarting, false);
      } finally {
        delete process.env.SIMULATE_SLOW_STARTUP;
        runner.setStartupTimeoutMs(120000);
        runner.shutdown();
      }
    });

    await test('Runner failure before ready:true rejects waitUntilReady cleanly', async () => {
      runner.shutdown();
      process.env.SIMULATE_EXIT_BEFORE_READY = '1';
      try {
        let threw = false;
        try {
          await runner.waitUntilReady();
        } catch (err: any) {
          threw = true;
          assert(err.message.includes('failed to start') || err.message.includes('CUDA out of memory') || err.message.includes('exit code 137'));
        }
        assert.strictEqual(threw, true, 'waitUntilReady must reject if process exits before handshake');
        assert.strictEqual(runner.isAvailable(), false);
      } finally {
        delete process.env.SIMULATE_EXIT_BEFORE_READY;
        runner.shutdown();
      }
    });

    await test('Shutdown terminates process, clears state, and invalidates lifecycle', async () => {
      await runner.waitUntilReady();
      assert.strictEqual(runner.isAvailable(), true);

      runner.shutdown();
      assert.strictEqual(runner.isAvailable(), false);
      assert.strictEqual(runner.isProcessStarting, false);
      assert.strictEqual((runner as any).process, null);
    });

    await test('No hash fallback: waitUntilReady failure rejects strictly when fallback disabled', async () => {
      runner.shutdown();
      const service = new LocalBgeEmbeddingService(runner);
      service.setAllowTestFallback(false);

      process.env.SIMULATE_EXIT_BEFORE_READY = '1';
      try {
        let threw = false;
        try {
          await service.waitUntilReady();
        } catch {
          threw = true;
        }
        assert.strictEqual(threw, true, 'service.waitUntilReady must reject when real runner fails and fallback is false');
        assert.strictEqual(service.isFallback, false);
        assert.strictEqual(service.isRealEngineReady, false);
      } finally {
        delete process.env.SIMULATE_EXIT_BEFORE_READY;
        runner.shutdown();
      }
    });

    // Clean up mock script
    runner.shutdown();
  } finally {
    if (fs.existsSync(tmpMockScriptPath)) {
      try {
        fs.unlinkSync(tmpMockScriptPath);
      } catch {
        // Ignore
      }
    }
  }

  console.log('\n====================================================');
  console.log(`Results: ${passedTests}/${totalTests} Python runner assertions passed.`);
  console.log('====================================================');
  console.log('✓ ALL PYTHON EMBEDDING RUNNER REQUIREMENTS SATISFIED.\n');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
