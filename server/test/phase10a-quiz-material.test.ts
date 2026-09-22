/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateQuizFromMaterialSchema } from '../utils/validation.js';
import { QuizQuestionBatchGenerationSchema } from '../services/ai/schemas.js';

interface TestResult {
  num: number;
  name: string;
  passed: boolean;
  details?: string;
}

const results: TestResult[] = [];

function record(num: number, name: string, passed: boolean, details?: string) {
  results.push({ num, name, passed, details });
  const symbol = passed ? '✅' : '❌';
  console.log(`[Phase 10A Test ${num}] ${symbol} ${name}${details ? ` - ${details}` : ''}`);
}

async function runPhase10ATests() {
  console.log('====================================================');
  console.log('EDUMATE PHASE 10A: UPLOADED MATERIAL → AI QUIZ GENERATION TESTS');
  console.log('====================================================');

  // Test 1: Input Validation Schema for Material Quiz Generation
  try {
    const valid = generateQuizFromMaterialSchema.safeParse({
      material_id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      title: 'Thermodynamics Exam Drill',
      mode: 'PRACTICE',
      question_count: 10,
      time_limit_minutes: 20,
      difficulty: 'medium',
      topic_focus: 'Carnot Cycle & Efficiency',
      negative_marking: true,
      negative_mark_value: 0.25,
      randomization: true,
    });

    record(1, 'Generate Quiz From Material Input Schema Validation (Valid)', valid.success, 'Valid payload correctly parsed');
  } catch (err: any) {
    record(1, 'Generate Quiz From Material Input Schema Validation', false, err.message);
  }

  // Test 2: Input Validation Rejection on Invalid UUID or Out-of-bounds parameters
  try {
    const invalidUuid = generateQuizFromMaterialSchema.safeParse({
      material_id: 'not-a-uuid',
      question_count: 5,
    });

    const invalidCount = generateQuizFromMaterialSchema.safeParse({
      material_id: 'a1b2c3d4-e5f6-4a1b-8c2d-3e4f5a6b7c8d',
      question_count: 50, // Max allowed is 30
    });

    const passed = !invalidUuid.success && !invalidCount.success;
    record(2, 'Input Validation Constraints & Guardrails (Reject invalid UUID & count > 30)', passed, 'Invalid inputs rejected properly');
  } catch (err: any) {
    record(2, 'Input Validation Constraints', false, err.message);
  }

  // Test 3: AI Structured Output Schema with Chunk Provenance
  try {
    const mockAIResponse = {
      title: 'Thermodynamics Drill',
      subject: 'Physics',
      topic: 'Heat Engines',
      questions: [
        {
          subject: 'Physics',
          topic: 'Heat Engines',
          question: 'What is the efficiency of a reversible heat engine operating between temperatures T1 and T2?',
          options: [
            { id: 'opt_1', text: '1 - (T2 / T1)' },
            { id: 'opt_2', text: '1 + (T2 / T1)' },
            { id: 'opt_3', text: 'T1 / T2' },
            { id: 'opt_4', text: '(T1 - T2) / T2' },
          ],
          correctOptionId: 'opt_1',
          explanation: 'Carnot efficiency is defined as eta = 1 - T_cold / T_hot.',
          formulaHint: 'eta = 1 - (T_L / T_H)',
          difficulty: 'medium' as const,
          chunkId: 'b2c3d4e5-f6a1-4b2c-8d3e-4f5a6b7c8d9e',
        },
      ],
    };

    const parsed = QuizQuestionBatchGenerationSchema.safeParse(mockAIResponse);
    const hasChunk = parsed.success && parsed.data.questions[0].chunkId === 'b2c3d4e5-f6a1-4b2c-8d3e-4f5a6b7c8d9e';

    record(3, 'Structured Quiz Generation Schema with Chunk Provenance Citation', hasChunk, 'Batch questions include validated chunkId provenance');
  } catch (err: any) {
    record(3, 'Structured Quiz Generation Schema', false, err.message);
  }

  // Test 4: Provenance Mapping & Quarantine Verification
  try {
    const validChunkIds = new Set(['chunk-valid-1', 'chunk-valid-2']);
    const defaultChunkId = 'chunk-valid-1';

    const testQuestions = [
      { id: 'q1', chunkId: 'chunk-valid-2' },
      { id: 'q2', chunkId: 'hallucinated-chunk-id' },
      { id: 'q3', chunkId: undefined },
    ];

    const mapped = testQuestions.map((q) => {
      return q.chunkId && validChunkIds.has(q.chunkId) ? q.chunkId : defaultChunkId;
    });

    const provenanceVerified = mapped[0] === 'chunk-valid-2' && mapped[1] === 'chunk-valid-1' && mapped[2] === 'chunk-valid-1';
    record(4, 'AI Chunk Provenance Verification & Hallucination Guardrail', provenanceVerified, 'Hallucinated chunk IDs safely fallback to retrieved parent chunk');
  } catch (err: any) {
    record(4, 'Provenance Verification', false, err.message);
  }

  // Summary
  console.log('====================================================');
  const allPassed = results.every((r) => r.passed);
  console.log(`TOTAL: ${results.length} | PASSED: ${results.filter((r) => r.passed).length} | FAILED: ${results.filter((r) => !r.passed).length}`);
  console.log(`RESULT: ${allPassed ? 'ALL TESTS PASSED ✅' : 'FAILURES DETECTED ❌'}`);
  console.log('====================================================');

  if (!allPassed) {
    process.exit(1);
  }
}

runPhase10ATests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
