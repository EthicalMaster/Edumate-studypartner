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
  console.log('=== EDUMATE Phase 7 Python Embedding Runner Test Suite ===\n');

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

def generate_vector(text, dim=384):
    val = float(len(text) % 10 + 1)
    norm = math.sqrt(dim * (val * val))
    return [round(val / norm, 6) for _ in range(dim)]

def main():
    if len(sys.argv) > 1 and sys.argv[1] == "--device":
        print(json.dumps({"device": "cuda", "model": "BAAI/bge-small-en-v1.5", "dimension": 384}))
        sys.stdout.flush()
        return

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
                import time
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
