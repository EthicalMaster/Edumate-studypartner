# EDUMATE Phase 8: Model-Agnostic AI Gateway Architecture

## 1. Executive Summary & Purpose

The **EDUMATE AI Gateway** (`server/services/ai/`) provides a secure, vendor-neutral, server-authoritative abstraction layer between EDUMATE application features and model inference backends. 

### Core Architectural Guarantees:
- **Vendor-Neutrality:** No proprietary AI provider SDKs (Gemini, OpenAI, Anthropic) are coupled into application code.
- **Model-Agnostic:** Application features interact exclusively with strongly typed, provider-neutral requests (`AIRequest`) and normalized responses (`AIResponse`).
- **Server-Authoritative Governance:** Concurrency limits, daily request quotas, input character validation, and output token clamping are enforced centrally before any provider invocation.
- **Strict Student Tenant Isolation:** AI requests require authenticated HTTP-only sessions; student identity is strictly resolved from the session context (`req.user.profile.id`), never trusted from client payloads.
- **Zero Secret Leakage:** Diagnostics and error handlers never expose API keys, internal endpoints, raw prompts, or stack traces.

---

## 2. Architectural Overview

```
                     ┌──────────────────────────────────────────────┐
                     │          Frontend / Client Layer             │
                     └──────────────────────┬───────────────────────┘
                                            │ HTTP (POST /api/ai/test)
                                            │ Cookie: edumate_session
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │         Express Router & Middleware          │
                     │  - requireAuth (Session Verification)        │
                     │  - getAuthenticatedStudentId (IDOR Guard)    │
                     │  - Zod Request Schema Validation             │
                     └──────────────────────┬───────────────────────┘
                                            │ Authenticated Request Context
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │            AIGatewayService                  │
                     │  1. Validate input size (<= 20,000 chars)    │
                     │  2. Clamp output tokens (<= 1,500 tokens)    │
                     │  3. Daily Quota Check (QuotaService)         │
                     │  4. Acquire Concurrency Slot (QuotaService)  │
                     │  5. Enforce Request Timeout (30,000ms)       │
                     │  6. Dispatch to Active Provider              │
                     │  7. Normalize Response / Errors              │
                     │  8. Guaranteed Concurrency Slot Release      │
                     │  9. Privacy-Preserving Telemetry Logging     │
                     └───────┬──────────────────────────────┬───────┘
                             │                              │
                ┌────────────┴─────────────┐   ┌────────────┴─────────────┐
                │    AIProviderRegistry    │   │       QuotaService       │
                │  - Resolves active       │   │  - Student concurrency   │
                │    provider from config  │   │  - Global concurrency    │
                │  - Explicit failures for │   │  - Daily AI request limit│
                │    unknown providers     │   │  - Token/char boundaries │
                └────────────┬─────────────┘   └──────────────────────────┘
                             │
            ┌────────────────┴────────────────────────┬─────────────────────────┐
            ▼                                         ▼                         ▼
┌─────────────────────────┐               ┌─────────────────────────┐  ┌─────────────────────────┐
│     NullAIProvider      │               │     LocalAIProvider     │  │      GroqProvider       │
│  (Development / Null)   │               │   (Self-Hosted HTTP)    │  │ (Cloud High-Speed LLM)  │
│  - provider="development"               │  - provider="local"     │  │  - provider="groq"      │
│  - model="null"         │               │  - Boundary for Ollama/ │  │  - model="llama-3.3-   │
│  - Deterministic status │               │    vLLM HTTP server     │  │    70b-versatile"       │
└─────────────────────────┘               └─────────────────────────┘  └─────────────────────────┘
```

### Retrieval Layer vs. Generation Layer Architecture

A strict boundary is maintained between vector retrieval and text generation:

```
EDUMATE Architecture
 └── AI Gateway
      ├── Retrieval Layer (UNCHANGED)
      │    ├── Document Intelligence (PDF extraction, hierarchical sectioning, chunking)
      │    ├── IEmbeddingService (BAAI/bge-small-en-v1.5, 384 dimensions)
      │    └── Vector Database (Qdrant collection edumate_documents)
      │
      └── Generation Layer (Phase 9)
           └── GroqProvider (/chat/completions, Llama 3.3 70B Versatile)
```

**Key Architectural Invariants:**
- Groq is **strictly an inference / generation provider**.
- Groq **never** replaces, touches, or mimics BGE embeddings, Qdrant vector retrieval, or Document Intelligence.
- Groq API keys reside exclusively on the server (`GROQ_API_KEY`). The browser client never communicates with Groq directly.
- The AI Gateway remains completely model-agnostic, enabling future drop-in replacement with local models (Ollama, vLLM, RTX 3050 CUDA) without modifying EDUMATE feature logic.

---

## 3. Directory & Component Structure

All Phase 8 infrastructure resides under `server/services/ai/` and integrates with existing governance and routing:

```
server/
├── services/
│   ├── ai/
│   │   ├── types.ts                # Application-level, provider-neutral types
│   │   ├── errors.ts               # Normalized error classes (AIGatewayError hierarchy)
│   │   ├── config.ts               # Configuration parsing and environment integration
│   │   ├── provider.interface.ts   # IAIProvider contract
│   │   ├── provider.registry.ts    # AIProviderRegistry provider lookup & selection
│   │   ├── telemetry.service.ts    # Privacy-preserving request telemetry
│   │   ├── gateway.service.ts      # Core AIGatewayService implementation
│   │   └── providers/
│   │       ├── null.provider.ts    # Deterministic development provider (provider='development')
│   │       └── local.provider.ts   # HTTP boundary for future self-hosted local inference
│   └── governance/
│       ├── quota.config.ts         # Centralized resource quotas (AI limits added)
│       └── quota.service.ts        # Concurrency semaphores & daily quota logic
├── routes/
│   └── ai.routes.ts                # /api/ai/test & /api/ai/diagnostics
└── db/
    └── migrations/
        ├── 010_ai_gateway_governance.sql       # student_ai_quotas table
        └── 010_ai_gateway_governance_down.sql  # Migration rollback
```

---

## 4. Provider Abstraction (`IAIProvider`)

Every model backend implements the clean `IAIProvider` interface:

```typescript
export interface IAIProvider {
  readonly id: string;
  readonly name: string;
  readonly modelName: string;
  readonly isDevelopment: boolean;

  generate(request: AIRequest): Promise<AIResponse>;
  chat(request: AIRequest): Promise<AIResponse>;
  checkHealth(): Promise<AIProviderHealth>;
}
```

### Deterministic Null Provider (`NullAIProvider`)
- Registered under `'development'`, `'null'`, and `'none'`.
- Returns deterministic response text: `"AI provider is not configured."`
- Does **not** pretend to be a real AI model.
- Health check returns `status: 'NOT_CONFIGURED'` and `isDevelopment: true`.

### Local Model Inference Boundary (`LocalAIProvider`)
- Prepares the boundary for future local self-hosted inference (e.g. Ollama, vLLM, llama.cpp HTTP endpoints).
- Configurable base URL via `LOCAL_AI_BASE_URL` (default: `http://127.0.0.1:11434`).
- Strictly isolates network failures: if the local server is offline, throws normalized `AIProviderUnavailableError` without crashing the Node application.

---

## 5. Application Request & Response Types (`types.ts`)

Requests and responses are normalized into application-level structures:

```typescript
export interface AIRequest {
  requestId: string;
  studentId: string;
  purpose: AIRequestPurpose; // 'general' | 'tutoring' | 'quiz_explanation' | 'retrieval_qa' | 'diagnostic' | 'test'
  prompt?: string;
  messages?: AIMessage[];
  retrievedContext?: RetrievedContext[];
  temperature?: number;
  maxTokens?: number;
  metadata?: Record<string, any>;
}

export interface AIResponse {
  requestId: string;
  provider: string;
  model: string;
  text: string;
  usage?: TokenUsage;
  finishReason?: 'stop' | 'length' | 'timeout' | 'null' | 'error';
  latencyMs: number;
  metadata?: Record<string, any>;
  error?: {
    code: string;
    message: string;
  };
}
```

### Retrieval Context Interface (`RetrievedContext`)
Allows vector search chunks from Phase 7 retrieval to be injected into AI prompts without coupling the gateway to Qdrant:
- `chunkId`, `materialId`, `sectionId`, `text`, `score`
- `sectionTitle`, `sectionType`, `materialTitle`, `subject`, `topic`

---

## 6. Centralized Resource Governance & Rate Limiting

The AI Gateway extends the established `QuotaService` (`server/services/governance/`) rather than introducing a disparate quota system:

| Parameter | Environment Variable | Default | Purpose |
| :--- | :--- | :--- | :--- |
| **Max Input Characters** | `AI_MAX_INPUT_CHARS` | `20,000` | Rejects oversized prompts/messages before processing |
| **Max Output Tokens** | `AI_MAX_OUTPUT_TOKENS` | `1,500` | Clamps generation tokens to prevent runaways |
| **Max Concurrent / Student**| `AI_MAX_CONCURRENT_PER_STUDENT` | `2` | Prevents a single student from spamming parallel requests |
| **Max Global Concurrent** | `AI_MAX_GLOBAL_CONCURRENT` | `4` | Protects server capacity and compute limits |
| **Daily AI Requests** | `AI_REQUESTS_PER_DAY` | `100` | Daily limit per student; resets daily via `student_ai_quotas` |
| **Request Timeout** | `AI_REQUEST_TIMEOUT_MS` | `30,000` (30s) | Prevents hung connections; aborts with HTTP 504 |

---

## 7. Error Handling & Normalization

All gateway failures are normalized into subclasses of `AIGatewayError` to ensure safe, sanitized HTTP responses:

| Error Class | HTTP Status | Code | Safe Behavior |
| :--- | :--- | :--- | :--- |
| `AIAuthenticationRequiredError` | `401` | `AI_AUTHENTICATION_REQUIRED` | Missing or invalid student session |
| `AIRequestInvalidError` | `400` | `AI_REQUEST_INVALID` | Empty input or characters exceeding 20,000 |
| `AIQuotaExceededError` | `429` | `AI_QUOTA_EXCEEDED` | Daily quota exceeded (100 reqs/day) |
| `AIConcurrencyLimitExceededError` | `429` | `AI_CONCURRENCY_LIMIT_EXCEEDED` | Student (2) or Global (4) concurrency exceeded |
| `AIConfigurationError` | `503` | `AI_CONFIGURATION_ERROR` | Configured provider missing in registry |
| `AIProviderUnavailableError` | `503` | `AI_PROVIDER_UNAVAILABLE` | Upstream provider offline or unreachable |
| `AIProviderTimeoutError` | `504` | `AI_PROVIDER_TIMEOUT` | Provider took longer than `AI_REQUEST_TIMEOUT_MS` |
| `AIProviderRateLimitedError` | `429` | `AI_PROVIDER_RATE_LIMITED` | Upstream provider rate limit encountered |
| `AIProviderAuthenticationError` | `503` | `AI_PROVIDER_AUTHENTICATION_ERROR` | Server-side API key unconfigured or invalid |
| `AIStructuredOutputError` | `502` | `AI_STRUCTURED_OUTPUT_INVALID` | Model response failed JSON or Zod schema validation |

---

## 8. Structured Educational Output Schemas (Phase 9)

To prevent brittle parsing of arbitrary natural language, EDUMATE utilizes typed Zod schemas (`server/services/ai/schemas.ts`) through `aiGatewayService.executeStructured`:

- `GenericGenerationResultSchema`: Provider, model, generated text, token usage metrics, latency, finish reason.
- `QuizQuestionGenerationSchema`: Pedagogically sound questions with distinct options, correct key, explanation, and difficulty.
- `FlashcardGenerationSchema`: Question, answer, key concept, optional formula, difficulty rating.
- `SummaryGenerationSchema`: Structured title, overview, key bullet points, and critical terms with definitions.
- `ExplanationGenerationSchema`: Core concept summary, detailed pedagogical breakdown, takeaways, follow-up questions.
- `StudyPlanGenerationSchema`: Timed multi-day study schedule with daily goals and estimated study minutes.
- `TeacherResponseSchema` / `BuddyResponseSchema`: Persona-specific responses (pedagogical explanation vs. friendly encouragement).

---

## 9. Diagnostics & Security Safeguards

- **Diagnostics Endpoint (`GET /api/ai/diagnostics`):**
  - Requires student authentication (`requireAuth`).
  - Reports provider status (`READY`, `NOT_CONFIGURED`, `DEGRADED`, `ERROR`), active model, and configured limits.
  - **Zero Secrets:** Never reports API keys, connection strings, or system paths.
  - **Zero Waste:** Does not send unnecessary full completion requests on health checks.
- **Privacy-Preserving Telemetry (`aiTelemetryService`):**
  - Logs operational metadata (`requestId`, `studentId`, `purpose`, `latencyMs`, `inputChars`, `success`).
  - **Strict Mandate:** Never stores raw prompt text, messages, generated answers, passwords, or session tokens.

---

## 10. Scope Discipline: What is in Phase 9 vs. Future Phases

Phase 9 is strictly **Provider Infrastructure Only**:
- **Included in Phase 9:**
  - `GroqProvider` implementing `IAIProvider` contract.
  - `AIProviderRegistry` registration and dynamic resolution.
  - Strongly typed Zod schemas for structured educational output.
  - Authenticated test routes (`POST /api/ai/test` and `POST /api/ai/test/structured`).
  - Normalized error handling, rate limiting, and timeout guards.
  - Full automated verification test suite (`npm run test:groq`).
- **Strictly Deferred to Subsequent Phases:**
  - Do NOT connect Groq to Quiz Builder, uploaded PDFs, question generation, flashcards, summaries, Teacher AI, or Buddy AI yet.
  - No end-user facing UI changes.

