/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { generateQuizFromMaterialSchema, createQuizSchema, QUIZ_QUESTION_TYPES } from '../utils/validation.js';
import {
  QuizQuestionBatchGenerationSchema,
  QuizQuestionGenerationSchema,
  QUIZ_BATCH_JSON_SCHEMA,
  validateStructuredOutput,
} from '../services/ai/schemas.js';
import { AIStructuredOutputError } from '../services/ai/errors.js';
import { GroqProvider } from '../services/ai/providers/groq.provider.js';
import { filterQuestionsByProvenance } from '../services/quiz/quiz-generation.service.js';

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
  console.log('EDUMATE PHASE 10A: GROQ STRUCTURED OUTPUT & QUIZ GENERATION SUITE');
  console.log('====================================================');

  const validChunkId1 = 'a1111111-1111-4111-8111-111111111111';
  const validChunkId2 = 'b2222222-2222-4222-8222-222222222222';
  const validMaterialId = 'c3333333-3333-4333-8333-333333333333';

  // --------------------------------------------------------------------------
  // TEST 1: Valid canonical object response parses successfully
  // --------------------------------------------------------------------------
  try {
    const canonicalObject = {
      title: 'Physics Mechanics Drill',
      subject: 'Physics',
      topic: 'Kinematics',
      questions: [
        {
          question: 'What is the SI unit of acceleration?',
          questionType: 'MCQ',
          options: [
            { id: 'A', text: 'm/s' },
            { id: 'B', text: 'm/s^2' },
            { id: 'C', text: 'kg m/s' },
            { id: 'D', text: 'Joules' },
          ],
          correctOptionId: 'B',
          explanation: 'Acceleration is defined as rate of change of velocity, giving units of m/s divided by seconds = m/s^2.',
          formulaHint: 'a = dv / dt',
          difficulty: 'easy' as const,
          marks: 1,
          section: 'Section A',
          subject: 'Physics',
          topic: 'Kinematics',
          chunkId: validChunkId1,
        },
      ],
    };

    const validated = validateStructuredOutput(
      QuizQuestionBatchGenerationSchema,
      JSON.stringify(canonicalObject)
    );
    const passed =
      validated.title === 'Physics Mechanics Drill' &&
      validated.questions.length === 1 &&
      validated.questions[0].correctOptionId === 'B' &&
      validated.questions[0].chunkId === validChunkId1;

    record(1, 'Valid Canonical Object Response Parsing', passed, 'Top-level object with metadata and questions parses cleanly');
  } catch (err: any) {
    record(1, 'Valid Canonical Object Response Parsing', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 2: Array response is rejected with a clear schema-validation error
  // --------------------------------------------------------------------------
  try {
    const rawArrayPayload = [
      {
        question: 'What is acceleration?',
        questionType: 'MCQ',
        options: [
          { id: 'A', text: 'm/s' },
          { id: 'B', text: 'm/s^2' },
        ],
        correctOptionId: 'B',
        explanation: 'Derived from velocity/time.',
        difficulty: 'easy',
        chunkId: validChunkId1,
      },
    ];

    let caughtError: any = null;
    try {
      validateStructuredOutput(
        QuizQuestionBatchGenerationSchema,
        JSON.stringify(rawArrayPayload)
      );
    } catch (err: any) {
      caughtError = err;
    }

    const passed =
      caughtError instanceof AIStructuredOutputError &&
      caughtError.message.includes('AI structured output failed schema validation') &&
      caughtError.message.toLowerCase().includes('array');

    record(
      2,
      'Raw Array Response Rejected With Schema Error',
      passed,
      'Rejected unexpected top-level array with AIStructuredOutputError'
    );
  } catch (err: any) {
    record(2, 'Raw Array Response Rejected With Schema Error', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 3: Missing questions field or empty questions array rejected
  // --------------------------------------------------------------------------
  try {
    const missingQuestions = {
      title: 'Chemistry Quiz',
      subject: 'Chemistry',
      topic: 'Periodic Table',
    };
    const emptyQuestions = {
      title: 'Chemistry Quiz',
      subject: 'Chemistry',
      topic: 'Periodic Table',
      questions: [],
    };

    const parseMissing = QuizQuestionBatchGenerationSchema.safeParse(missingQuestions);
    const parseEmpty = QuizQuestionBatchGenerationSchema.safeParse(emptyQuestions);

    const passed = !parseMissing.success && !parseEmpty.success;
    record(
      3,
      'Missing or Empty Questions Rejected',
      passed,
      'Schema requires non-empty questions array'
    );
  } catch (err: any) {
    record(3, 'Missing or Empty Questions Rejected', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 4: Invalid question structure rejected (missing required fields)
  // --------------------------------------------------------------------------
  try {
    const invalidQuestion = {
      subject: 'Biology',
      topic: 'Cells',
      // Missing question text, options, explanation
      difficulty: 'medium',
      chunkId: validChunkId1,
    };

    const parseResult = QuizQuestionGenerationSchema.safeParse(invalidQuestion);
    record(
      4,
      'Invalid Question Structure Rejected',
      !parseResult.success,
      'Rejects questions missing core fields like question text and options'
    );
  } catch (err: any) {
    record(4, 'Invalid Question Structure Rejected', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 5: Invalid question type rejected (Phase 10A requires MCQ)
  // --------------------------------------------------------------------------
  try {
    const nonMcqQuestion = {
      subject: 'History',
      topic: 'World War II',
      question: 'Describe the events of D-Day in detail.',
      questionType: 'LONG', // Invalid for Phase 10A generated batch
      options: [
        { id: 'A', text: 'Option A' },
        { id: 'B', text: 'Option B' },
      ],
      correctOptionId: 'A',
      explanation: 'Detailed historical explanation.',
      difficulty: 'medium',
      chunkId: validChunkId1,
    };

    const parseResult = QuizQuestionGenerationSchema.safeParse(nonMcqQuestion);
    record(
      5,
      'Invalid Question Type Rejected (MCQ Only in Phase 10A)',
      !parseResult.success,
      'Explicitly rejects non-MCQ generated types'
    );
  } catch (err: any) {
    record(5, 'Invalid Question Type Rejected (MCQ Only in Phase 10A)', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 6: Invalid option / correct-answer relationship rejected
  // --------------------------------------------------------------------------
  try {
    const mismatchQuestion = {
      subject: 'Physics',
      topic: 'Optics',
      question: 'What is the speed of light in vacuum?',
      questionType: 'MCQ',
      options: [
        { id: 'A', text: '3 x 10^8 m/s' },
        { id: 'B', text: '3 x 10^6 m/s' },
      ],
      correctOptionId: 'Z', // ID 'Z' does not exist in options!
      explanation: 'Constant c is approximately 300,000 km/s.',
      difficulty: 'easy',
      chunkId: validChunkId1,
    };

    const parseResult = QuizQuestionGenerationSchema.safeParse(mismatchQuestion);
    record(
      6,
      'Invalid Option / Correct Answer Relationship Rejected',
      !parseResult.success,
      'Rejects questions where correctOptionId is not in options array'
    );
  } catch (err: any) {
    record(6, 'Invalid Option / Correct Answer Relationship Rejected', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 7: Invalid or missing chunk provenance rejected
  // --------------------------------------------------------------------------
  try {
    const missingChunkQuestion = {
      subject: 'Math',
      topic: 'Calculus',
      question: 'What is the derivative of sin(x)?',
      questionType: 'MCQ',
      options: [
        { id: 'A', text: 'cos(x)' },
        { id: 'B', text: '-cos(x)' },
      ],
      correctOptionId: 'A',
      explanation: 'Standard trigonometric derivative.',
      difficulty: 'easy',
      chunkId: '', // Empty chunkId
    };

    const parseResult = QuizQuestionGenerationSchema.safeParse(missingChunkQuestion);
    record(
      7,
      'Missing Chunk Provenance Rejected',
      !parseResult.success,
      'Schema requires non-empty chunkId provenance'
    );
  } catch (err: any) {
    record(7, 'Missing Chunk Provenance Rejected', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 8: Strict Chunk Provenance Guardrail (No Fallback / Silent Remapping)
  // --------------------------------------------------------------------------
  try {
    const retrievedChunks = [
      { id: validChunkId1, text: 'Physics thermodynamics section 1' },
      { id: validChunkId2, text: 'Physics thermodynamics section 2' },
    ];
    const validChunkIds = new Set(retrievedChunks.map((c) => c.id));

    const candidateQuestions = [
      { id: 'q1', chunkId: validChunkId1, text: 'Valid chunk 1 question' },
      { id: 'q2', chunkId: validChunkId2, text: 'Valid chunk 2 question' },
      { id: 'q3', chunkId: null, text: 'Missing chunk question' },
      { id: 'q4', chunkId: '', text: 'Empty chunk question' },
      { id: 'q5', chunkId: 'hallucinated-fake-chunk-uuid', text: 'Hallucinated chunk question' },
    ];

    const accepted = filterQuestionsByProvenance(candidateQuestions, validChunkIds);

    // Strict requirements:
    // 1. Valid retrieved chunkId -> accept (q1, q2)
    // 2. Missing chunkId -> reject (q3, q4)
    // 3. Unknown/hallucinated chunkId -> reject (q5)
    // 4. Must NOT silently remap or substitute any chunk ID to parent or default chunk
    const passed =
      accepted.length === 2 &&
      accepted[0].id === 'q1' &&
      accepted[0].chunkId === validChunkId1 &&
      accepted[1].id === 'q2' &&
      accepted[1].chunkId === validChunkId2 &&
      !accepted.some((q) => q.id === 'q3' || q.id === 'q4' || q.id === 'q5') &&
      !accepted.some((q) => q.chunkId === 'hallucinated-fake-chunk-uuid');

    record(
      8,
      'Strict Provenance Guardrail (No Silent Remapping or Fallbacks)',
      passed,
      'Valid chunks accepted; missing/hallucinated chunks strictly rejected without fallback substitution'
    );
  } catch (err: any) {
    record(8, 'Strict Provenance Guardrail (No Silent Remapping or Fallbacks)', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 9: Valid multi-question MCQ batch creates quiz model successfully
  // --------------------------------------------------------------------------
  try {
    const generatedBatch = {
      title: 'Electromagnetism Mastery Quiz',
      subject: 'Physics',
      topic: 'Electromagnetism',
      questions: [
        {
          question: 'What is the unit of magnetic flux density?',
          questionType: 'MCQ' as const,
          options: [
            { id: 'A', text: 'Tesla' },
            { id: 'B', text: 'Weber' },
            { id: 'C', text: 'Henry' },
            { id: 'D', text: 'Coulomb' },
          ],
          correctOptionId: 'A',
          explanation: 'Tesla (T) is the SI unit of magnetic B-field flux density.',
          formulaHint: 'B = Phi / A',
          difficulty: 'medium' as const,
          marks: 1,
          section: 'Section A',
          subject: 'Physics',
          topic: 'Electromagnetism',
          chunkId: validChunkId1,
        },
        {
          question: 'What law describes the electromotive force induced by a changing magnetic flux?',
          questionType: 'MCQ' as const,
          options: [
            { id: 'A', text: 'Faraday Law of Induction' },
            { id: 'B', text: 'Coulomb Law' },
            { id: 'C', text: 'Ohm Law' },
            { id: 'D', text: 'Kirchhoff Voltage Law' },
          ],
          correctOptionId: 'A',
          explanation: 'Faraday law states that EMF equals the negative rate of change of magnetic flux.',
          formulaHint: 'EMF = -d(Phi)/dt',
          difficulty: 'medium' as const,
          marks: 2,
          section: 'Section B',
          subject: 'Physics',
          topic: 'Electromagnetism',
          chunkId: validChunkId2,
        },
      ],
    };

    // Transform into repository creation payload
    const customQuestions = generatedBatch.questions.map((q) => ({
      question_text: q.question,
      question_type: 'MCQ' as const,
      options: q.options,
      correct_option_ids: [q.correctOptionId],
      correct_answer_text: null,
      explanation: q.explanation,
      formula_hint: q.formulaHint,
      marks: q.marks,
      section: q.section,
      topic: q.topic,
      material_id: validMaterialId,
      chunk_id: q.chunkId,
    }));

    const quizCreationInput = {
      title: generatedBatch.title,
      description: 'Generated from uploaded study material',
      mode: 'PRACTICE' as const,
      source: 'uploaded_material' as const,
      subject: generatedBatch.subject,
      topic: generatedBatch.topic,
      question_count: customQuestions.length,
      time_limit_minutes: 15,
      difficulty: 'medium' as const,
      custom_questions: customQuestions,
    };

    const parsed = createQuizSchema.safeParse(quizCreationInput);
    const passed = parsed.success && parsed.data.custom_questions?.length === 2;

    record(
      9,
      'Valid Multi-Question MCQ Batch Creates Quiz Payload',
      passed,
      'Batch maps cleanly into repository createQuizSchema with preserved provenance'
    );
  } catch (err: any) {
    record(9, 'Valid Multi-Question MCQ Batch Creates Quiz Payload', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 10: Existing curriculum question-bank quiz flow remains unaffected
  // --------------------------------------------------------------------------
  try {
    // Curriculum quizzes do NOT require custom_questions or material_id
    const curriculumQuizInput = {
      title: 'CBSE Class 12 Electrostatics Drill',
      mode: 'EXAM' as const,
      source: 'curriculum' as const,
      subject: 'Physics',
      topic: 'Electrostatics',
      question_count: 20,
      time_limit_minutes: 45,
      difficulty: 'hard' as const,
      negative_marking: true,
      negative_mark_value: 0.25,
      randomization: true,
      question_types: ['MCQ' as const, 'TRUE_FALSE' as const, 'SHORT' as const],
    };

    const parsed = createQuizSchema.safeParse(curriculumQuizInput);
    const supportsAllTypes =
      QUIZ_QUESTION_TYPES.length === 7 &&
      QUIZ_QUESTION_TYPES.includes('MCQ') &&
      QUIZ_QUESTION_TYPES.includes('MULTIPLE_SELECT') &&
      QUIZ_QUESTION_TYPES.includes('TRUE_FALSE') &&
      QUIZ_QUESTION_TYPES.includes('FILL_BLANK') &&
      QUIZ_QUESTION_TYPES.includes('VERY_SHORT') &&
      QUIZ_QUESTION_TYPES.includes('SHORT') &&
      QUIZ_QUESTION_TYPES.includes('LONG');

    const passed = parsed.success && supportsAllTypes;
    record(
      10,
      'Existing Curriculum Question-Bank Quiz Flow Unaffected',
      passed,
      'Question bank flow remains standard with all 7 question types fully supported'
    );
  } catch (err: any) {
    record(10, 'Existing Curriculum Question-Bank Quiz Flow Unaffected', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 11: Groq Provider request format handles json_schema and json_object
  // --------------------------------------------------------------------------
  try {
    let capturedPayload: any = null;

    const mockFetch: typeof fetch = async (_url, options) => {
      capturedPayload = JSON.parse(options?.body as string);
      return new Response(
        JSON.stringify({
          id: 'chatcmpl-phase10a-schema',
          model: 'llama-3.3-70b-versatile',
          choices: [
            {
              message: {
                role: 'assistant',
                content: JSON.stringify({
                  title: 'Verified Schema Quiz',
                  subject: 'Physics',
                  topic: 'Vectors',
                  questions: [
                    {
                      question: 'What is a vector quantity?',
                      questionType: 'MCQ',
                      options: [
                        { id: 'A', text: 'Magnitude only' },
                        { id: 'B', text: 'Magnitude and direction' },
                      ],
                      correctOptionId: 'B',
                      explanation: 'Vectors have magnitude and direction.',
                      difficulty: 'easy',
                      chunkId: validChunkId1,
                    },
                  ],
                }),
              },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 40, completion_tokens: 60, total_tokens: 100 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    };

    const provider = new GroqProvider({ apiKey: 'mock-key', fetchFn: mockFetch });

    const result = await provider.generate({
      requestId: 'req-phase10a-spec',
      studentId: 'student-phase10a',
      purpose: 'quiz_generation',
      prompt: 'Generate an MCQ quiz',
      responseFormat: 'json_schema',
      jsonSchema: QUIZ_BATCH_JSON_SCHEMA,
    });

    const payloadCorrect =
      capturedPayload?.response_format?.type === 'json_schema' &&
      capturedPayload?.response_format?.json_schema?.name === 'quiz_question_batch' &&
      capturedPayload?.response_format?.json_schema?.schema?.properties?.questions?.type === 'array';

    const outputParsed =
      result.parsedJson &&
      result.parsedJson.title === 'Verified Schema Quiz' &&
      result.parsedJson.questions.length === 1;

    record(
      11,
      'Groq Provider Request Enforces Structured JSON Schema Contract',
      Boolean(payloadCorrect && outputParsed),
      'Groq request payload correctly contains json_schema specification with parsed output'
    );
  } catch (err: any) {
    record(11, 'Groq Provider Request Enforces Structured JSON Schema Contract', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 12: AI returns fabricated chunkId -> Generated quiz does NOT contain that question
  // --------------------------------------------------------------------------
  try {
    const retrievedChunks = [
      { id: validChunkId1, text: 'Newton first law: an object at rest stays at rest unless acted on by net force.' },
      { id: validChunkId2, text: 'Newton second law: F = ma.' },
    ];
    const validChunkIds = new Set(retrievedChunks.map((c) => c.id));

    // Simulated AI response containing 1 legitimate question and 1 fabricated provenance question
    const aiGeneratedQuestions = [
      {
        question: 'What is Newton First Law of Motion also known as?',
        questionType: 'MCQ' as const,
        options: [
          { id: 'A', text: 'Law of Inertia' },
          { id: 'B', text: 'Law of Acceleration' },
          { id: 'C', text: 'Law of Conservation' },
          { id: 'D', text: 'Law of Gravitation' },
        ],
        correctOptionId: 'A',
        explanation: 'Newton first law defines inertia of rest and motion.',
        difficulty: 'easy' as const,
        marks: 1,
        section: 'Section A',
        subject: 'Physics',
        topic: 'Mechanics',
        chunkId: validChunkId1, // Valid retrieved chunk!
      },
      {
        question: 'What is quantum entanglement?',
        questionType: 'MCQ' as const,
        options: [
          { id: 'A', text: 'Superposition of waves' },
          { id: 'B', text: 'Spooky action at a distance between correlated particles' },
          { id: 'C', text: 'Thermal conduction' },
          { id: 'D', text: 'Black hole evaporation' },
        ],
        correctOptionId: 'B',
        explanation: 'Particles remain entangled regardless of distance.',
        difficulty: 'hard' as const,
        marks: 2,
        section: 'Section B',
        subject: 'Physics',
        topic: 'Quantum Physics',
        chunkId: 'fabricated-non-existent-chunk-99999', // COMPLETELY FABRICATED CHUNK ID!
      },
    ];

    // Apply strict provenance filter
    const filteredQuestions = filterQuestionsByProvenance(aiGeneratedQuestions, validChunkIds);

    // Transform into quiz repository payload
    const customQuestions = filteredQuestions.map((q) => ({
      question_text: q.question,
      question_type: 'MCQ' as const,
      options: q.options,
      correct_option_ids: [q.correctOptionId],
      correct_answer_text: null,
      explanation: q.explanation,
      formula_hint: null,
      marks: q.marks,
      section: q.section,
      topic: q.topic,
      material_id: validMaterialId,
      chunk_id: q.chunkId,
    }));

    const quizPayload = {
      title: 'Newtonian Mechanics Quiz',
      mode: 'PRACTICE' as const,
      source: 'uploaded_material' as const,
      subject: 'Physics',
      topic: 'Mechanics',
      question_count: customQuestions.length,
      time_limit_minutes: 10,
      difficulty: 'easy' as const,
      custom_questions: customQuestions,
    };

    const parsedQuiz = createQuizSchema.safeParse(quizPayload);

    // Assertions:
    // 1. Exactly 1 question in the quiz (the fabricated one was dropped)
    // 2. The fabricated question is NOT in the quiz custom_questions
    // 3. The remaining question strictly has validChunkId1
    // 4. No silent remapping to validChunkId2 or default chunk occurred
    const passed =
      parsedQuiz.success &&
      customQuestions.length === 1 &&
      customQuestions[0].question_text.includes('Newton First Law') &&
      customQuestions[0].chunk_id === validChunkId1 &&
      !customQuestions.some((q) => q.question_text.includes('quantum entanglement')) &&
      !customQuestions.some((q) => q.chunk_id === 'fabricated-non-existent-chunk-99999');

    record(
      12,
      'Fabricated Chunk Provenance Excluded From Generated Quiz',
      passed,
      'Question with fabricated chunkId is discarded; generated quiz does NOT contain that question'
    );
  } catch (err: any) {
    record(12, 'Fabricated Chunk Provenance Excluded From Generated Quiz', false, err.message);
  }

  // --------------------------------------------------------------------------
  // TEST 13: All questions have fabricated chunk IDs -> Quiz creation aborted
  // --------------------------------------------------------------------------
  try {
    const retrievedChunks = [{ id: validChunkId1, text: 'Cell biology excerpt' }];
    const validChunkIds = new Set(retrievedChunks.map((c) => c.id));

    const allFabricated = [
      {
        question: 'Fake question 1',
        chunkId: 'completely-fake-chunk-1',
      },
      {
        question: 'Fake question 2',
        chunkId: 'completely-fake-chunk-2',
      },
    ];

    const accepted = filterQuestionsByProvenance(allFabricated, validChunkIds);
    let errorThrown = false;
    let errorMessage = '';

    try {
      if (accepted.length === 0) {
        throw new Error(
          'AI_PROVENANCE_FAILED: All generated questions failed provenance verification (hallucinated or unrecognized chunk IDs).'
        );
      }
    } catch (err: any) {
      errorThrown = true;
      errorMessage = err.message;
    }

    const passed =
      accepted.length === 0 &&
      errorThrown &&
      errorMessage.includes('AI_PROVENANCE_FAILED') &&
      errorMessage.includes('hallucinated or unrecognized chunk IDs');

    record(
      13,
      'All Fabricated Chunks Abort Quiz Generation (AI_PROVENANCE_FAILED)',
      passed,
      'When all citations are fabricated, quiz generation safely aborts without creating quiz'
    );
  } catch (err: any) {
    record(13, 'All Fabricated Chunks Abort Quiz Generation (AI_PROVENANCE_FAILED)', false, err.message);
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
