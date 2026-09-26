export type ActiveNavTab = 
  | 'home' 
  | 'study-kits' 
  | 'flashcards' 
  | 'quizzes' 
  | 'my-progress' 
  | 'adaptive-model'
  | 'weak-topics' 
  | 'peer-comparison' 
  | 'settings';

export interface StudyKit {
  id: string;
  title: string;
  subject: string;
  unit: string;
  keyConceptsLearned: number;
  totalKeyConcepts: number;
  progressPercent: number;
  lastStudied: string;
  description: string;
  flashcardsCount: number;
  quizzesCount: number;
  audioDurationMin: number;
  activeModule: string;
  tags: string[];
  fileSource?: string;
  accuracy: number;
}

export interface StudyMaterial {
  id: string;
  title: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  subject: string;
  topic: string;
  processingStatus: 'uploaded' | 'processing' | 'ready' | 'failed';
  processingError?: string | null;
  embeddingStatus?: 'pending' | 'processing' | 'completed' | 'failed';
  embeddingError?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RetrievedChunkResult {
  chunkId: string;
  materialId: string;
  score: number;
  text: string;
  materialTitle: string;
  subject: string;
  topic: string;
  pageStart: number;
  pageEnd: number;
  sectionId: string | null;
  sectionTitle: string | null;
  sectionType: string | null;
  headingLevel: number | null;
  chunkIndex: number;
}

export interface RetrievalSearchResponse {
  results: RetrievedChunkResult[];
  totalRetrieved: number;
  query: string;
  topK: number;
  remainingSearchesToday: number;
}

export interface StudentQuotaUsage {
  storage: {
    usedBytes: number;
    quotaBytes: number;
    usedFormatted: string;
    quotaFormatted: string;
    percentage: number;
  };
  materials: {
    currentCount: number;
    maxCount: number;
  };
  chunks: {
    currentCount: number;
    maxCount: number;
  };
  searches: {
    usedToday: number;
    maxDaily: number;
    remainingToday: number;
  };
}

export interface MaterialEmbeddingSummary {
  materialId: string;
  embeddingStatus: 'pending' | 'processing' | 'completed' | 'failed';
  embeddingError: string | null;
  totalChunks: number;
  completedChunks: number;
  failedChunks: number;
  model: string;
  dimension: number;
  isFallback?: boolean;
}

export interface DocumentPage {
  id: string;
  pageNumber: number;
  text: string;
  characterCount: number;
}

export interface DocumentSection {
  id: string;
  parentSectionId: string | null;
  sectionType: 'document' | 'chapter' | 'section' | 'topic' | 'subsection';
  title: string;
  sectionOrder: number;
  pageStart: number;
  pageEnd: number;
  headingLevel: number;
  summary?: string;
}

export interface DocumentChunk {
  id: string;
  sectionId: string | null;
  chunkIndex: number;
  text: string;
  pageStart: number;
  pageEnd: number;
  characterCount: number;
  tokenEstimate: number;
}

export interface DocumentProcessingDetails {
  materialId: string;
  status: 'uploaded' | 'processing' | 'ready' | 'failed';
  error: string | null;
  pageCount: number;
  sectionCount: number;
  chunkCount: number;
  totalCharacters: number;
  updatedAt: string;
}

export interface Flashcard {
  id: string;
  kitId: string;
  subject: string;
  topic: string;
  question: string;
  answer: string;
  keyConcept: string;
  formula?: string;
  difficulty: 'easy' | 'medium' | 'hard';
  masteryLevel: 'learning' | 'review' | 'mastered';
  lastReviewed?: string;
}

export interface QuizOption {
  id: string;
  text: string;
}

export interface QuizQuestion {
  id: string;
  kitId: string;
  subject: string;
  topic: string;
  question: string;
  options: QuizOption[];
  correctOptionId: string;
  explanation: string;
  formulaHint?: string;
  difficulty: 'easy' | 'medium' | 'hard';
}

export interface WeakTopic {
  id: string;
  subject: string;
  topicName: string;
  accuracy: number;
  priority: 'High Priority' | 'Needs Revision' | 'Review' | 'Improving';
  missedQuestionsCount: number;
  recommendedAction: 'Practice' | 'Review' | 'Drill';
  actionType: 'practice' | 'review' | 'drill';
}

export interface AudioSummaryTrack {
  id: string;
  title: string;
  subtitle: string;
  moduleName: string;
  durationSeconds: number;
  speed: number;
  transcript: Array<{
    speaker: 'Host Alex (AI)' | 'Host Sam (AI)' | 'Professor AI';
    text: string;
    timestamp: string;
  }>;
}

export interface NotificationItem {
  id: string;
  title: string;
  description?: string;
  message?: string;
  timeAgo: string;
  read?: boolean;
  isRead?: boolean;
  type: string;
  createdAt?: string;
  metadata?: Record<string, any>;
}

export interface StudentProfile {
  id: string;
  full_name: string;
  education_level?: string | null;
  academic_stage?: string | null;
  program?: string | null;
  stream?: string | null;
  target_exam?: string | null;
  institution: string | null;
  department: string | null;
  current_year: number | null;
  student_identifier: string | null;
  has_completed_onboarding?: boolean;
  onboarding_completed_at?: string | null;
}

export interface StudentUser {
  id: string;
  email: string;
  role: 'STUDENT';
  is_active: boolean;
  email_verified: boolean;
  auth_provider: string;
  profile: StudentProfile;
}

// ============================================================================
// Phase 4: Real Quiz Engine Types
// ============================================================================

export type QuizMode = 'PRACTICE' | 'EXAM';
export type QuizQuestionType =
  | 'MCQ'
  | 'MULTIPLE_SELECT'
  | 'TRUE_FALSE'
  | 'FILL_BLANK'
  | 'VERY_SHORT'
  | 'SHORT'
  | 'LONG';

export interface Quiz {
  id: string;
  student_id: string;
  study_kit_id: string | null;
  title: string;
  description: string | null;
  mode: QuizMode;
  source: string;
  subject: string;
  topic: string;
  question_count: number;
  total_marks: number;
  time_limit_minutes: number;
  difficulty: string;
  is_diagnostic: boolean;
  negative_marking: boolean;
  negative_mark_value: number;
  randomization: boolean;
  created_at: string;
  updated_at: string;
}

export interface SafeQuizQuestion {
  id: string;
  quiz_id: string;
  question_order: number;
  question_text: string;
  question_type: QuizQuestionType;
  options: { id: string; text: string }[];
  marks: number;
  section: string;
  topic: string | null;
}

export interface QuizSession {
  id: string;
  student_id: string;
  quiz_id: string;
  start_time: string;
  server_deadline: string;
  time_limit_seconds: number;
  status: 'created' | 'active' | 'submitted' | 'expired' | 'auto_submitted';
  submission_reason: string | null;
  mode: QuizMode;
  question_order: string[];
  scoring_config: {
    negative_marking: boolean;
    negative_mark_value: number;
    total_marks: number;
  };
  created_at: string;
  completed_at: string | null;
}

export interface QuestionReviewItem {
  id: string;
  question_order: number;
  question_text: string;
  question_type: string;
  section: string;
  topic: string | null;
  marks_possible: number;
  marks_earned: number;
  status: 'correct' | 'incorrect' | 'skipped' | 'manual_evaluation';
  student_selected_option_ids: string[];
  student_answer_text: string | null;
  correct_option_ids: string[];
  correct_answer_text: string | null;
  explanation: string;
  formula_hint: string | null;
  options: { id: string; text: string }[];
}

export interface QuizResult {
  id: string;
  session_id: string;
  student_id: string;
  quiz_id: string;
  total_questions: number;
  attempted_questions: number;
  correct_answers: number;
  incorrect_answers: number;
  skipped_questions: number;
  score_obtained: number;
  total_possible_score: number;
  percentage: number;
  negative_marks_deducted: number;
  time_taken_seconds: number;
  submission_reason: string;
  subject_breakdown: Record<string, any>;
  topic_breakdown: Record<string, any>;
  section_breakdown: Record<string, any>;
  submitted_at: string;
}

export interface DetailedQuizResult {
  result: QuizResult;
  review: QuestionReviewItem[];
  quiz: {
    id: string;
    title: string;
    subject: string;
    topic: string;
    mode: QuizMode;
    difficulty: string;
    total_marks: number;
    time_limit_minutes: number;
    negative_marking: boolean;
    negative_mark_value: number;
  };
}

export interface QuizHistoryItem {
  id: string;
  session_id: string;
  quiz_id: string;
  quiz_title: string;
  subject: string;
  topic: string;
  mode: QuizMode;
  difficulty: string;
  total_questions: number;
  attempted_questions: number;
  correct_answers: number;
  score_obtained: number;
  total_possible_score: number;
  percentage: number;
  negative_marks_deducted: number;
  time_taken_seconds: number;
  time_limit_minutes: number;
  submission_reason: string;
  status: string;
  submitted_at: string;
}

export interface QuestionBankMeta {
  subjects: {
    name: string;
    topics: string[];
    total_questions: number;
  }[];
  difficulties: string[];
  question_types: string[];
  curriculum_context?: {
    education_level: string;
    academic_stage: string;
    program: string;
    stream: string;
    description: string;
    total_eligible_subjects: number;
  };
}

export interface LeaderboardEntry {
  rank: number;
  displayName: string;
  totalScore: number;
  averagePercentage: number;
  quizzesCompleted: number;
  totalCorrect: number;
  isCurrentUser: boolean;
}

export interface LeaderboardResponse {
  top10: LeaderboardEntry[];
  currentUser: LeaderboardEntry | null;
  totalParticipants: number;
}


