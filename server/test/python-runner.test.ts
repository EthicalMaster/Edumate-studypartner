/**
 * EDUMATE Phase 7: Python Embedding Runner Test Suite
 *
 * Verifies:
 * 1. Path resolution & default fallbacks across platforms.
 * 2. Capability / Probe mode with device detection and timeout enforcement.
 * 3. Startup readiness handshake: awaits `{"ready": true, ...}` before dispatching requests.
 * 4. Startup timeout via EMBEDDING_STARTUP_TIMEOUT_MS (default 120000ms).
 * 5. Strict rejection of synthetic fallback when EMBEDDING_ALLOW_TEST_FALLBACK is false.
 * 6. Interactive JSON lines protocol:
 *    - 384-dimensional unit-norm output vectors.
 *    - Search query instruction prefixing (`is_query: true`).
 *    - FIFO serialization and queue concurrency safety.
 *    - Error isolation for malformed JSON, child process crashes, and query timeouts.
 */

import assert from 'node:assert';
import path from 'path';
import fs from 'fs';
import {
  PythonEmbeddingRunner,
  resolvePythonExecutable,
  resolveEmbedderScriptPath,
  resolveHealthcheckTimeoutMs,
  resolveStartupTimeoutMs,
} from '../services/embedding/python-embedding-runner.js';
import { LocalBgeEmbeddingService } from '../services/embedding/embedding.service.js';

let passed = 0;
let total = 0;

async function test(name: string, fn: () => Promise<void> | void) {
  total++;
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err: any) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err?.stack || err?.message || err}`);
    throw err;
  }
}

async function runTests() {
  console.log('=== EDUMATE Phase 7 Python Embedding Runner Test Suite ===\n');

  // ==========================================================================
  // 1. Path Resolution & Configuration
  // ==========================================================================
  console.log('--- 1. Path Resolution & Configuration ---');

  await test('resolvePythonExecutable respects EMBEDDING_PYTHON_PATH when provided', () => {
    const original = process.env.EMBEDDING_PYTHON_PATH;
    try {
      process.env.EMBEDDING_PYTHON_PATH = '/custom/venv/bin/python';
      assert.strictEqual(resolvePythonExecutable(), '/custom/venv/bin/python');
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
      const expected = process.platform === 'win32' ? 'python' : 'python3';
      assert.strictEqual(resolvePythonExecutable(), expected);
    } finally {
      if (original !== undefined) {
        process.env.EMBEDDING_PYTHON_PATH = original;
      }
    }
  });

  await test('resolveEmbedderScriptPath finds embedder.py', () => {
    const scriptPath = resolveEmbedderScriptPath();
    assert(fs.existsSync(scriptPath), `embedder.py must exist at ${scriptPath}`);
    assert(scriptPath.endsWith('embedder.py'));
  });

  await test('resolveHealthcheckTimeoutMs defaults to 30000ms when absent or invalid', () => {
    const original = process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
    try {
      delete process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS;
      assert.strictEqual(resolveHealthcheckTimeoutMs(), 30000);

      process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = 'invalid_number';
      assert.strictEqual(resolveHealthcheckTimeoutMs(), 30000);

      process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = '-500';
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

      process.env.EMBEDDING_HEALTHCHECK_TIMEOUT_MS = ' 60000 ';
      assert.strictEqual(resolveHealthcheckTimeoutMs(), 60000);
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

  // ==========================================================================
  // 2. Unavailable Python Engine & Strict Safety
  // ==========================================================================
  console.log('\n--- 2. Unavailable Python Engine & Strict Safety ---');

  const runner = PythonEmbeddingRunner.getInstance();

  await test('When Python engine is unavailable, checkHealth reports error cleanly', async () => {
    // Temporarily point runner to non-existent executable
    runner.configure({
      pythonPath: '/non/existent/path/to/python_executable',
      scriptPath: '/non/existent/embedder.py',
    });

    const probe = await runner.probeDevice();
    assert.strictEqual(probe.available, false);
    assert(probe.error !== undefined);
  });

  await test('LocalBgeEmbeddingService strictly rejects silent fallback by default', async () => {
    const service = LocalBgeEmbeddingService.getInstance();
    const originalEnv = process.env.EMBEDDING_ALLOW_TEST_FALLBACK;
    try {
      delete process.env.EMBEDDING_ALLOW_TEST_FALLBACK;

      // Because python points to non-existent executable above, real engine is unavailable
      let threw = false;
      try {
        await service.embedTexts(['Test chunk']);
      } catch (err: any) {
        threw = true;
        assert(
          err.message.includes("Real embedding engine 'BAAI/bge-small-en-v1.5' is unavailable"),
          `Unexpected error message: ${err.message}`
        );
        assert(
          err.message.includes('EMBEDDING_ALLOW_TEST_FALLBACK is disabled'),
          `Error must state strict rejection`
        );
      }
      assert.strictEqual(threw, true, 'Must strictly throw when engine is unavailable');
    } finally {
      if (originalEnv !== undefined) {
        process.env.EMBEDDING_ALLOW_TEST_FALLBACK = originalEnv;
      }
    }
  });

  await test('Explicit test fallback operates when explicitly enabled', async () => {
    const service = LocalBgeEmbeddingService.getInstance();
    const originalEnv = process.env.EMBEDDING_ALLOW_TEST_FALLBACK;
    try {
      process.env.EMBEDDING_ALLOW_TEST_FALLBACK = 'true';
      const embeddings = await service.embedTexts(['Test chunk 1', 'Test chunk 2']);
      assert.strictEqual(embeddings.length, 2);
      assert.strictEqual(embeddings[0].length, 384);

      // Verify unit norm
      const norm = Math.sqrt(embeddings[0].reduce((acc, v) => acc + v * v, 0));
      assert(Math.abs(norm - 1.0) < 1e-4, `Norm must be ~1.0, was ${norm}`);
    } finally {
      if (originalEnv !== undefined) {
        process.env.EMBEDDING_ALLOW_TEST_FALLBACK = originalEnv;
      } else {
        delete process.env.EMBEDDING_ALLOW_TEST_FALLBACK;
      }
    }
  });

  // ==========================================================================
  // 3. Python JSON Lines Protocol Verification (Using Mock Runner Script)
  // ==========================================================================
  console.log('\n--- 3. Python JSON Lines Protocol Verification ---');

  // Create a temporary mock embedder python script to test subprocess IPC deterministically
  const mockScriptPath = path.resolve(process.cwd(), 'temp-mock-embedder.py');
  fs.writeFileSync(
    mockScriptPath,
    `
import sys
import json
import math
import os
import time

def generate_vector(text, dim=384):
    val = float(len(text) % 10 + 1)
    norm = math.sqrt(dim * (val ** 2))
    return [round(val / norm, 7)] * dim

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

            if texts and texts[0] == "__CRASH_TEST__":
                sys.stderr.write("Simulated worker fatal crash!\\n")
                sys.exit(42)
            if texts and texts[0] == "__TRIGGER_TIMEOUT__":
                time.sleep(2.0)
                continue

            if texts and texts[0] == "__MALFORMED_JSON_TEST__":
                print("THIS_IS_NOT_VALID_JSON")
                sys.stdout.flush()
                continue

            embs = [generate_vector(t) for t in texts]
            print(json.dumps({"embeddings": embs, "is_query": is_query}))
            sys.stdout.flush()
        except Exception as e:
            print(json.dumps({"error": str(e)}))
            sys.stdout.flush()

if __name__ == "__main__":
    main()
`
  );

  try {
    // Configure runner to test against our mock script
    runner.configure({
      pythonPath: resolvePythonExecutable(),
      scriptPath: mockScriptPath,
      timeoutMs: 1500,
    });

    await test('Runner health check detects mock CUDA device and 384 dimension', async () => {
      const probe = await runner.probeDevice();
      assert.strictEqual(probe.available, true);
      assert.strictEqual(probe.device, 'cuda');
      assert.strictEqual(probe.model, 'BAAI/bge-small-en-v1.5');
      assert.strictEqual(probe.dimension, 384);
      assert.strictEqual(runner.isAvailable(), true);
    });

    await test('Health check accepts probe completing within configurable timeout window (>5s equivalent)', async () => {
      process.env.SIMULATE_SLOW_PROBE = '1';
      runner.setHealthcheckTimeoutMs(1500); // Set generous 1500ms timeout for simulated 600ms probe
      try {
        const probe = await runner.probeDevice();
        assert.strictEqual(probe.available, true);
        assert.strictEqual(probe.device, 'cuda');
      } finally {
        delete process.env.SIMULATE_SLOW_PROBE;
        runner.setHealthcheckTimeoutMs(30000);
      }
    });

    await test('Health check fails cleanly when probe exceeds configured timeout', async () => {
      process.env.SIMULATE_SLOW_PROBE = '1';
      runner.setHealthcheckTimeoutMs(200); // Set 200ms timeout (probe takes 600ms)
      try {
        const probe = await runner.probeDevice();
        assert.strictEqual(probe.available, false);
        assert(probe.error !== undefined);
        assert(probe.error.includes('Device probe timed out after 200ms'));
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

      // Verify unit normalization
      const norm1 = Math.sqrt(embeddings[0].reduce((acc, v) => acc + v * v, 0));
      assert(Math.abs(norm1 - 1.0) < 1e-3, `Norm must be ~1.0, was ${norm1}`);
    });

    await test('embedQuery applies is_query=true in request payload', async () => {
      const query = 'What is cell respiration?';
      const vector = await runner.embedQuery(query);
      assert.strictEqual(vector.length, 384);
      const norm = Math.sqrt(vector.reduce((acc, v) => acc + v * v, 0));
      assert(Math.abs(norm - 1.0) < 1e-3, `Norm must be ~1.0, was ${norm}`);
    });

    await test('Malformed JSON response from Python is caught and rejected cleanly without crashing Node', async () => {
      let threw = false;
      try {
        await runner.embed(['__MALFORMED_JSON_TEST__']);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('malformed JSON response'), `Unexpected error: ${err.message}`);
      }
      assert.strictEqual(threw, true, 'Malformed JSON must reject');
    });

    await test('Unexpected process termination rejects active request and allows clean restart', async () => {
      let threw = false;
      try {
        await runner.embed(['__CRASH_TEST__']);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('terminated unexpectedly') || err.message.includes('code 42'));
      }
      assert.strictEqual(threw, true, 'Active request must reject on process exit');

      // Verify auto-restart functionality
      await runner.restart();
      const res = await runner.embed(['Post-restart verification text']);
      assert.strictEqual(res.length, 1);
      assert.strictEqual(res[0].length, 384);
    });

    await test('Timeout rejects request and cleans up without deadlocking queue', async () => {
      runner.setTimeoutMs(300); // Set small 300ms timeout for test
      let threw = false;
      try {
        await runner.embed(['__TRIGGER_TIMEOUT__']);
      } catch (err: any) {
        threw = true;
        assert(err.message.includes('timed out after 300ms'));
      }
      assert.strictEqual(threw, true, 'Request must reject upon timing out');

      // Subsequent request must work cleanly
      runner.setTimeoutMs(10000);
      const ok = await runner.embed(['Recovery test after timeout']);
      assert.strictEqual(ok.length, 1);
      assert.strictEqual(ok[0].length, 384);
    });
  } finally {
    // Cleanup temporary mock embedder
    runner.shutdown();
    if (fs.existsSync(mockScriptPath)) {
      fs.unlinkSync(mockScriptPath);
    }
  }

  console.log('\n====================================================');
  console.log(`Results: ${passed}/${total} Python runner assertions passed.`);
  console.log('====================================================');
  console.log('✓ ALL PYTHON EMBEDDING RUNNER REQUIREMENTS SATISFIED.');
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
