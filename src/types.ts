export type ActiveNavTab = 
  | 'home' 
  | 'study-kits' 
  | 'flashcards' 
  | 'quizzes' 
  | 'my-progress' 
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
  description: string;
  timeAgo: string;
  read: boolean;
  type: 'achievement' | 'reminder' | 'system';
}

export interface StudentProfile {
  id: string;
  full_name: string;
  education_level?: string | null;
  academic_stage?: string | null;
  institution: string | null;
  department: string | null;
  current_year: number | null;
  student_identifier: string | null;
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

