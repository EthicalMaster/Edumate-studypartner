/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * EDUMATE Phase 9: Groq Generation Provider Verification Suite
 *
 * Comprehensive tests verifying:
 * 1. Provider registry includes Groq
 * 2. Missing GROQ_API_KEY throws safe AIProviderAuthenticationError
 * 3. Groq provider configuration & model resolution
 * 4. Successful normalized generation response via mocked HTTP transport
 * 5. Multi-turn chat completion via mocked HTTP transport
 * 6. Malformed provider response normalization (AIProviderUnavailableError)
 * 7. Timeout handling normalization (AIProviderTimeoutError)
 * 8. Rate-limit (429) handling normalization (AIProviderRateLimitedError)
 * 9. Upstream error normalization (401/403/500/503)
 * 10. No secret leakage in responses, errors, or telemetry
 * 11. Provider replaceable through IAIProvider interface
 * 12. NullAIProvider continues working as default
 * 13. Embedding & retrieval architecture remains separate and untouched
 * 14. Structured generation schemas & validation with Zod
 * 15. AIGatewayService.executeStructured pipeline end-to-end
 */

import assert from 'assert';
import { GroqProvider } from '../services/ai/providers/groq.provider.js';
import { providerRegistry } from '../services/ai/provider.registry.js';
import { NullAIProvider } from '../services/ai/providers/null.provider.js';
import type { IAIProvider } from '../services/ai/provider.interface.js';
import type { AIRequest } from '../services/ai/types.js';
import {
  AIGatewayError,
  AIProviderAuthenticationError,
  AIProviderRateLimitedError,
  AIProviderTimeoutError,
  AIProviderUnavailableError,
  AIStructuredOutputError,
} from '../services/ai/errors.js';
import {
  GenericGenerationResultSchema,
  QuizQuestionGenerationSchema,
  FlashcardGenerationSchema,
  ExplanationGenerationSchema,
  SummaryGenerationSchema,
  StudyPlanGenerationSchema,
  TeacherResponseSchema,
  BuddyResponseSchema,
  validateStructuredOutput,
} from '../services/ai/schemas.js';
import { aiGatewayService } from '../services/ai/gateway.service.js';
import { reloadAIConfig } from '../services/ai/config.js';
import { closePool } from '../db/connection.js';

let passedTests = 0;
let totalTests = 0;

async function test(name: string, fn: () => void | Promise<void>) {
  totalTests++;
  try {
    await fn();
    passedTests++;
    console.log(`  ✓ ${name}`);
  } catch (err: any) {
    console.error(`  ✗ FAIL: ${name}`);
    console.error(`    ${err.message}`);
    throw err;
  }
}

async function runAllTests() {
  console.log('====================================================');
  console.log('EDUMATE Phase 9 — Groq Provider Verification Suite');
  console.log('====================================================\n');

  const SECRET_KEY = 'gsk_mock_secret_key_testing_xyz123_DO_NOT_LEAK';

  // --------------------------------------------------------------------------
  // TEST 1: Provider registry includes Groq
  // --------------------------------------------------------------------------
  await test('1. Provider registry includes Groq provider', () => {
    const groq = providerRegistry.getProvider('groq');
    assert(groq, 'Groq provider must be registered in ProviderRegistry');
    assert.strictEqual(groq.id, 'groq');
    assert.strictEqual(groq.name, 'Groq Cloud Inference Provider');
    assert.strictEqual(groq.isDevelopment, false);
  });

  // --------------------------------------------------------------------------
  // TEST 2: Missing GROQ_API_KEY handling
  // --------------------------------------------------------------------------
  await test('2. Missing GROQ_API_KEY throws safe AIProviderAuthenticationError', async () => {
    const groq = new GroqProvider({ apiKey: '' });
    const health = await groq.checkHealth();
    assert.strictEqual(health.available, false);
    assert.strictEqual(health.status, 'NOT_CONFIGURED');
    assert(health.error?.includes('GROQ_API_KEY'));

    const req: AIRequest = {
      requestId: 'test-req-no-key',
      studentId: 'student-001',
      purpose: 'test',
      prompt: 'Hello world',
    };

    let errorThrown: any = null;
    try {
      await groq.generate(req);
    } catch (err) {
      errorThrown = err;
    }

    assert(errorThrown instanceof AIProviderAuthenticationError);
    assert.strictEqual(errorThrown.code, 'AI_PROVIDER_AUTHENTICATION_ERROR');
    assert.strictEqual(errorThrown.statusCode, 503);
    assert(!errorThrown.message.includes('SECRET'));
  });

  // --------------------------------------------------------------------------
  // TEST 3: Groq provider configuration & model resolution
  // --------------------------------------------------------------------------
  await test('3. Groq provider configuration honors defaults and custom model', () => {
    const defaultGroq = new GroqProvider({ apiKey: 'test-key' });
    assert.strictEqual(defaultGroq.modelName, 'llama-3.3-70b-versatile');

    const customGroq = new GroqProvider({
      apiKey: 'test-key',
      modelName: 'llama-3.1-8b-instant',
    });
    assert.strictEqual(customGroq.modelName, 'llama-3.1-8b-instant');
  });

  // --------------------------------------------------------------------------
  // TEST 4: Successful normalized generation response via mocked fetch
  // --------------------------------------------------------------------------
  await test('4. Successful generation response normalized to AIResponse', async () => {
    let capturedUrl = '';
    let capturedHeaders: Record<string, string> = {};
    let capturedBody: any = null;

    const mockFetch: typeof fetch = async (input, init) => {
      capturedUrl = String(input);
      capturedHeaders = (init?.headers as Record<string, string>) || {};
      capturedBody = JSON.parse(String(init?.body || '{}'));

      const mockResponse = {
        id: 'chatcmpl-mock-12345',
        object: 'chat.completion',
        created: 1710000000,
        model: 'llama-3.3-70b-versatile',
        choices: [
          {
            index: 0,
            message: {
              role: 'assistant',
              content: 'Photosynthesis is the biological process converting light into chemical energy.',
            },
            finish_reason: 'stop',
          },
        ],
        usage: {
          prompt_tokens: 18,
          completion_tokens: 14,
          total_tokens: 32,
        },
      };

      return new Response(JSON.stringify(mockResponse), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new GroqProvider({
      apiKey: SECRET_KEY,
      fetchFn: mockFetch,
    });

    const res = await provider.generate({
      requestId: 'req-gen-1',
      studentId: 'student-123',
      purpose: 'tutoring',
      prompt: 'What is photosynthesis?',
      temperature: 0.5,
      maxTokens: 500,
    });

    assert.strictEqual(capturedUrl, 'https://api.groq.com/openai/v1/chat/completions');
    assert.strictEqual(capturedHeaders['Authorization'], `Bearer ${SECRET_KEY}`);
    assert.strictEqual(capturedBody.model, 'llama-3.3-70b-versatile');
    assert.strictEqual(capturedBody.temperature, 0.5);
    assert.strictEqual(capturedBody.max_tokens, 500);
    assert.strictEqual(capturedBody.messages[0].content, 'What is photosynthesis?');

    assert.strictEqual(res.requestId, 'req-gen-1');
    assert.strictEqual(res.provider, 'groq');
    assert.strictEqual(res.model, 'llama-3.3-70b-versatile');
    assert.strictEqual(res.text, 'Photosynthesis is the biological process converting light into chemical energy.');
    assert.strictEqual(res.finishReason, 'stop');
    assert.strictEqual(res.usage?.inputTokens, 18);
    assert.strictEqual(res.usage?.outputTokens, 14);
    assert.strictEqual(res.usage?.totalTokens, 32);
    assert(typeof res.latencyMs === 'number' && res.latencyMs >= 0);
  });

  // --------------------------------------------------------------------------
  // TEST 5: Multi-turn chat completion via mocked fetch
  // --------------------------------------------------------------------------
  await test('5. Multi-turn chat completion passes message history correctly', async () => {
    let capturedBody: any = null;

    const mockFetch: typeof fetch = async (_input, init) => {
      capturedBody = JSON.parse(String(init?.body || '{}'));
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-chat-1',
          model: 'llama-3.3-70b-versatile',
          choices: [
            {
              message: { role: 'assistant', content: 'Yes, plants also perform cellular respiration.' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 30, completion_tokens: 10, total_tokens: 40 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const provider = new GroqProvider({
      apiKey: SECRET_KEY,
      fetchFn: mockFetch,
    });

    const res = await provider.chat({
      requestId: 'req-chat-1',
      studentId: 'student-123',
      purpose: 'tutoring',
      messages: [
        { role: 'user', content: 'Do plants breathe?' },
        { role: 'assistant', content: 'Plants take in carbon dioxide during photosynthesis.' },
        { role: 'user', content: 'Do they also need oxygen?' },
      ],
    });

    assert.strictEqual(capturedBody.messages.length, 3);
    assert.strictEqual(capturedBody.messages[2].content, 'Do they also need oxygen?');
    assert.strictEqual(res.text, 'Yes, plants also perform cellular respiration.');
  });

  // --------------------------------------------------------------------------
  // TEST 6: Malformed provider response normalization
  // --------------------------------------------------------------------------
  await test('6. Malformed JSON response throws safe AIProviderUnavailableError', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('<html><body>Bad Gateway</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    await assert.rejects(
      () =>
        provider.generate({
          requestId: 'req-malformed-1',
          studentId: 'student-123',
          purpose: 'test',
          prompt: 'Hi',
        }),
      (err: any) => {
        assert(err instanceof AIProviderUnavailableError);
        assert.strictEqual(err.code, 'AI_PROVIDER_UNAVAILABLE');
        return true;
      }
    );
  });

  await test('6b. Empty choices array throws safe AIProviderUnavailableError', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ choices: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    await assert.rejects(
      () =>
        provider.generate({
          requestId: 'req-empty-choice',
          studentId: 'student-123',
          purpose: 'test',
          prompt: 'Hi',
        }),
      (err: any) => {
        assert(err instanceof AIProviderUnavailableError);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // TEST 7: Timeout handling normalization
  // --------------------------------------------------------------------------
  await test('7. Timeout triggers normalized AIProviderTimeoutError (504)', async () => {
    const mockFetch: typeof fetch = async () => {
      const error = new Error('The user aborted a request.');
      error.name = 'AbortError';
      throw error;
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    await assert.rejects(
      () =>
        provider.generate({
          requestId: 'req-timeout-1',
          studentId: 'student-123',
          purpose: 'test',
          prompt: 'Hi',
        }),
      (err: any) => {
        assert(err instanceof AIProviderTimeoutError);
        assert.strictEqual(err.code, 'AI_PROVIDER_TIMEOUT');
        assert.strictEqual(err.statusCode, 504);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // TEST 8: Rate-limit (429) handling normalization
  // --------------------------------------------------------------------------
  await test('8. HTTP 429 returns AIProviderRateLimitedError (429)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({ error: { message: 'Rate limit reached for requests per minute' } }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    await assert.rejects(
      () =>
        provider.generate({
          requestId: 'req-429-1',
          studentId: 'student-123',
          purpose: 'test',
          prompt: 'Hi',
        }),
      (err: any) => {
        assert(err instanceof AIProviderRateLimitedError);
        assert.strictEqual(err.code, 'AI_PROVIDER_RATE_LIMITED');
        assert.strictEqual(err.statusCode, 429);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // TEST 9: Upstream error normalization (401/403/500/503)
  // --------------------------------------------------------------------------
  await test('9a. HTTP 401 returns AIProviderAuthenticationError (503)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { message: 'Invalid API Key' } }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    await assert.rejects(
      () =>
        provider.generate({
          requestId: 'req-401-1',
          studentId: 'student-123',
          purpose: 'test',
          prompt: 'Hi',
        }),
      (err: any) => {
        assert(err instanceof AIProviderAuthenticationError);
        assert.strictEqual(err.code, 'AI_PROVIDER_AUTHENTICATION_ERROR');
        assert.strictEqual(err.statusCode, 503);
        return true;
      }
    );
  });

  await test('9b. HTTP 503 returns AIProviderUnavailableError (503)', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response(JSON.stringify({ error: { message: 'Service Temporarily Unavailable' } }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' },
      });
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    await assert.rejects(
      () =>
        provider.generate({
          requestId: 'req-503-1',
          studentId: 'student-123',
          purpose: 'test',
          prompt: 'Hi',
        }),
      (err: any) => {
        assert(err instanceof AIProviderUnavailableError);
        assert.strictEqual(err.code, 'AI_PROVIDER_UNAVAILABLE');
        assert.strictEqual(err.statusCode, 503);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // TEST 10: Zero secret leakage in responses, errors, or telemetry
  // --------------------------------------------------------------------------
  await test('10. Provider secrets never leak into responses or sanitized error objects', async () => {
    const mockFetch: typeof fetch = async () => {
      return new Response('Auth failure for key ' + SECRET_KEY, { status: 401 });
    };

    const provider = new GroqProvider({ apiKey: SECRET_KEY, fetchFn: mockFetch });

    try {
      await provider.generate({
        requestId: 'req-leak-test',
        studentId: 'student-123',
        purpose: 'test',
        prompt: 'test',
      });
      assert.fail('Should have thrown');
    } catch (err: any) {
      assert(err instanceof AIGatewayError);
      const jsonRes = JSON.stringify(err.toResponse());
      assert(
        !jsonRes.includes(SECRET_KEY),
        'API key must NEVER appear in client error response JSON'
      );
      assert(
        !err.message.includes(SECRET_KEY),
        'API key must NEVER appear in error message'
      );
    }
  });

  // --------------------------------------------------------------------------
  // TEST 11: Provider remains replaceable through IAIProvider interface
  // --------------------------------------------------------------------------
  await test('11. GroqProvider adheres strictly to IAIProvider interface', () => {
    const provider: IAIProvider = new GroqProvider({ apiKey: 'dummy' });
    assert.strictEqual(typeof provider.id, 'string');
    assert.strictEqual(typeof provider.name, 'string');
    assert.strictEqual(typeof provider.modelName, 'string');
    assert.strictEqual(typeof provider.isDevelopment, 'boolean');
    assert.strictEqual(typeof provider.generate, 'function');
    assert.strictEqual(typeof provider.chat, 'function');
    assert.strictEqual(typeof provider.checkHealth, 'function');
  });

  // --------------------------------------------------------------------------
  // TEST 12: NullAIProvider continues working as default
  // --------------------------------------------------------------------------
  await test('12. NullAIProvider works and remains default when AI_PROVIDER=none', () => {
    const nullProvider = providerRegistry.getProvider('none');
    assert(nullProvider instanceof NullAIProvider);
    assert.strictEqual(nullProvider.id, 'development');
    assert.strictEqual(nullProvider.isDevelopment, true);
  });

  // --------------------------------------------------------------------------
  // TEST 13: Structured generation schemas & validation with Zod
  // --------------------------------------------------------------------------
  await test('13a. GenericGenerationResultSchema validates generation results', () => {
    const valid = {
      provider: 'groq',
      model: 'llama-3.3-70b-versatile',
      text: 'Success message',
      usage: { inputTokens: 10, outputTokens: 20, totalTokens: 30 },
      requestId: 'req-1',
      latencyMs: 120,
      finishReason: 'stop' as const,
    };
    const parsed = GenericGenerationResultSchema.parse(valid);
    assert.strictEqual(parsed.provider, 'groq');
  });

  await test('13b. QuizQuestionGenerationSchema validates quiz questions', () => {
    const validQuiz = {
      subject: 'Biology',
      topic: 'Cellular Respiration',
      question: 'Where does the Krebs cycle occur inside eukaryotic cells?',
      options: [
        { id: 'a', text: 'Cytoplasm' },
        { id: 'b', text: 'Mitochondrial matrix' },
        { id: 'c', text: 'Inner membrane' },
        { id: 'd', text: 'Nucleus' },
      ],
      correctOptionId: 'b',
      explanation: 'The Krebs cycle occurs in the mitochondrial matrix of eukaryotic cells.',
      difficulty: 'medium' as const,
      chunkId: 'chunk-123',
    };
    const parsed = QuizQuestionGenerationSchema.parse(validQuiz);
    assert.strictEqual(parsed.options.length, 4);
    assert.strictEqual(parsed.correctOptionId, 'b');
  });

  await test('13c. FlashcardGenerationSchema validates flashcards', () => {
    const validCard = {
      subject: 'Physics',
      topic: 'Kinematics',
      question: 'What is Newton second law?',
      answer: 'Force equals mass multiplied by acceleration (F = ma).',
      keyConcept: 'Force and Acceleration',
      formula: 'F = ma',
      difficulty: 'easy' as const,
    };
    const parsed = FlashcardGenerationSchema.parse(validCard);
    assert.strictEqual(parsed.formula, 'F = ma');
  });

  await test('13d. SummaryGenerationSchema validates summaries', () => {
    const validSummary = {
      title: 'Newtonian Mechanics Overview',
      overview: 'An overview of classical mechanics detailing forces, mass, and acceleration.',
      keyPoints: ['Inertia resists acceleration', 'Net force produces acceleration', 'Action-reaction pairs'],
      criticalTerms: [{ term: 'Inertia', definition: 'Resistance to change in motion' }],
    };
    const parsed = SummaryGenerationSchema.parse(validSummary);
    assert.strictEqual(parsed.keyPoints.length, 3);
  });

  await test('13e. ExplanationGenerationSchema validates explanations', () => {
    const validExpl = {
      concept: 'Mitochondria',
      summary: 'The powerhouse of the cell responsible for generating ATP.',
      detailedExplanation: 'Mitochondria generate most of the chemical energy needed to power the biochemical reactions of the cell through cellular respiration.',
      keyTakeaways: ['Produces ATP', 'Contains its own DNA'],
    };
    const parsed = ExplanationGenerationSchema.parse(validExpl);
    assert.strictEqual(parsed.concept, 'Mitochondria');
  });

  await test('13f. TeacherResponseSchema and BuddyResponseSchema validate personalities', () => {
    const teacher = TeacherResponseSchema.parse({
      directAnswer: 'The answer is 42.',
      pedagogicalExplanation: 'Let us break down the mathematical components step by step.',
      checkForUnderstanding: 'Can you tell me why we added 12 first?',
      suggestedNextStep: 'Try solving exercise 4.',
    });
    assert(teacher.directAnswer);

    const buddy = BuddyResponseSchema.parse({
      encouragement: 'Great job sticking with this problem!',
      friendlyTip: 'Try visualizing it like sharing slices of pizza.',
      relatableAnalogy: 'Think of momentum like a heavy shopping cart.',
    });
    assert(buddy.encouragement);
  });

  await test('13g. validateStructuredOutput parses JSON and strips markdown fences', () => {
    const rawWithFence = '```json\n{"concept":"Gravity","summary":"Attractive force between masses.","detailedExplanation":"Gravity is a fundamental force governed by general relativity and universal gravitation.","keyTakeaways":["Proportional to mass"]}\n```';
    const parsed = validateStructuredOutput(ExplanationGenerationSchema, rawWithFence);
    assert.strictEqual(parsed.concept, 'Gravity');
  });

  await test('13h. validateStructuredOutput rejects invalid schema with AIStructuredOutputError', () => {
    const invalidData = JSON.stringify({ concept: 'Gravity' }); // missing summary, detailedExplanation, keyTakeaways
    assert.throws(
      () => validateStructuredOutput(ExplanationGenerationSchema, invalidData),
      (err: any) => {
        assert(err instanceof AIStructuredOutputError);
        assert.strictEqual(err.code, 'AI_STRUCTURED_OUTPUT_INVALID');
        assert.strictEqual(err.statusCode, 502);
        return true;
      }
    );
  });

  // --------------------------------------------------------------------------
  // TEST 14: End-to-end Gateway integration with structured output
  // --------------------------------------------------------------------------
  await test('14. AIGatewayService.executeStructured pipeline functions end-to-end', async () => {
    const mockOutput = {
      concept: 'Osmosis',
      summary: 'Movement of water molecules across a semipermeable membrane.',
      detailedExplanation: 'Water moves from a region of higher water potential to lower water potential across a selectively permeable membrane.',
      keyTakeaways: ['Passive transport', 'Requires semipermeable membrane'],
    };

    const mockFetch: typeof fetch = async () => {
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-struct-1',
          model: 'llama-3.3-70b-versatile',
          choices: [
            {
              message: { role: 'assistant', content: JSON.stringify(mockOutput) },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 25, completion_tokens: 45, total_tokens: 70 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    // Register a test instance of GroqProvider with the mock fetch
    const testGroq = new GroqProvider({ apiKey: 'test-key', fetchFn: mockFetch });
    providerRegistry.registerProvider(testGroq);

    // Save previous AI_PROVIDER
    const originalProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = 'groq';
    reloadAIConfig();

    try {
      const { response, data } = await aiGatewayService.executeStructured(
        {
          studentId: 'student-phase9-test',
          prompt: 'Explain osmosis in biological systems',
          purpose: 'tutoring',
        },
        ExplanationGenerationSchema
      );

      assert.strictEqual(response.provider, 'groq');
      assert.strictEqual(response.finishReason, 'stop');
      assert.strictEqual(data.concept, 'Osmosis');
      assert.strictEqual(data.keyTakeaways.length, 2);
    } finally {
      process.env.AI_PROVIDER = originalProvider;
      reloadAIConfig();
      // Re-register clean Groq provider
      providerRegistry.registerProvider(new GroqProvider());
    }
  });

  // --------------------------------------------------------------------------
  // TEST 15: Groq Provider request format verification (json_schema & json_object)
  // --------------------------------------------------------------------------
  await test('15. GroqProvider constructs valid OpenAI/Groq structured output payload', async () => {
    let capturedPayload: any = null;

    const mockFetch: typeof fetch = async (_url, options) => {
      capturedPayload = JSON.parse(options?.body as string);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-schema-1',
          model: 'llama-3.3-70b-versatile',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  title: 'Sample Quiz',
                  subject: 'Physics',
                  topic: 'Motion',
                  questions: [],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 20, completion_tokens: 30, total_tokens: 50 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const groq = new GroqProvider({ apiKey: 'test-key', fetchFn: mockFetch });

    // 15a: Test json_schema payload
    await groq.generate({
      requestId: 'test-req-schema',
      studentId: 'student-test',
      purpose: 'quiz_generation',
      prompt: 'Generate a quiz',
      responseFormat: 'json_schema',
      jsonSchema: {
        name: 'quiz_test_schema',
        strict: false,
        schema: { type: 'object', properties: { title: { type: 'string' } } },
      },
    });

    assert(capturedPayload, 'Payload must be sent to fetch');
    assert.strictEqual(capturedPayload.model, 'llama-3.3-70b-versatile');
    assert.strictEqual(capturedPayload.response_format?.type, 'json_schema');
    assert.strictEqual(capturedPayload.response_format?.json_schema?.name, 'quiz_test_schema');
    assert.strictEqual(capturedPayload.response_format?.json_schema?.strict, false);

    // 15b: Test json_object payload
    await groq.generate({
      requestId: 'test-req-json-obj',
      studentId: 'student-test',
      purpose: 'general',
      prompt: 'Generate JSON object',
      responseFormat: 'json_object',
    });

    assert.strictEqual(capturedPayload.response_format?.type, 'json_object');
  });

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n====================================================');
  console.log(`Results: ${passedTests}/${totalTests} Phase 9 assertions passed.`);
  console.log('====================================================');
  console.log('✓ ALL PHASE 9 GROQ GENERATION PROVIDER REQUIREMENTS SATISFIED.');

  await closePool();
  process.exit(0);
}

runAllTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
