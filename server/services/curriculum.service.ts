/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface AcademicProfileContext {
  education_level?: string | null;
  academic_stage?: string | null;
  program?: string | null;
  stream?: string | null;
  department?: string | null;
}

export interface SubjectCurriculumRule {
  allowedTopics?: string[]; // If specified, only these topics are allowed
  excludedTopics?: string[]; // If specified, these topics are forbidden
}

export interface CurriculumDefinition {
  id: string;
  name: string;
  education_level: string;
  allowedSubjects: Record<string, SubjectCurriculumRule | 'ALL'>;
  description: string;
}

export class CurriculumIneligibleError extends Error {
  public readonly code = 'CURRICULUM_INELIGIBLE';
  public readonly status = 403;

  constructor(message: string) {
    super(message);
    this.name = 'CurriculumIneligibleError';
  }
}

// ============================================================================
// Topic Classifications for Hierarchical Boundary Enforcement
// ============================================================================

export const COLLEGE_ONLY_CS_TOPICS = [
  'DBMS',
  'Operating Systems',
  'Computer Networks',
  'Computer Architecture',
  'Algorithms',
  'Data Structures',
];

export const COLLEGE_ONLY_DS_TOPICS = [
  'Machine Learning Fundamentals',
  'Model Evaluation',
  'Linear Regression',
  'Classification',
  'NumPy',
  'Pandas',
  'Data Visualization',
  'Python for Data Science',
];

export const HIGHER_SECONDARY_OR_COLLEGE_MATH_TOPICS = [
  'Limits',
  'Differentiation',
  'Integration',
  'Complex Numbers',
  'Coordinate Geometry',
];

export const HIGHER_SECONDARY_OR_COLLEGE_PHYSICS_TOPICS = [
  'Thermodynamics',
  'Oscillations',
  'Waves',
  'Electrostatics',
  'Current Electricity',
  'Magnetism',
  'Optics',
];

export const HIGHER_SECONDARY_OR_COLLEGE_CHEMISTRY_TOPICS = [
  'Equilibrium',
  'Redox Reactions',
  'Organic Chemistry',
  'Hydrocarbons',
  'Solutions',
  'Electrochemistry',
];

// Available Subjects in AVEN curriculum question bank
export const ALL_SYSTEM_SUBJECTS = [
  'Physics',
  'Chemistry',
  'Mathematics',
  'Biology',
  'Computer Science',
  'Data Science',
  'General Aptitude',
  'English',
] as const;

export type SystemSubject = (typeof ALL_SYSTEM_SUBJECTS)[number];

// Standard Academic Programs catalog for structured onboarding & profile selection
export interface AcademicProgramOption {
  id: string;
  name: string;
  level: string;
  suggestedStreams: string[];
}

export const ACADEMIC_PROGRAMS: AcademicProgramOption[] = [
  // Undergraduate Programs
  {
    id: 'btech_cse',
    name: 'B.Tech / B.E. (Computer Science & Engineering)',
    level: 'Undergraduate / College',
    suggestedStreams: ['Computer Science & Engineering', 'Software Engineering', 'Information Technology'],
  },
  {
    id: 'btech_ds_ai',
    name: 'B.Tech / B.E. (Data Science & AI)',
    level: 'Undergraduate / College',
    suggestedStreams: ['Data Science & AI', 'Machine Learning', 'Computational Intelligence'],
  },
  {
    id: 'btech_core',
    name: 'B.Tech / B.E. (Core Engineering)',
    level: 'Undergraduate / College',
    suggestedStreams: ['Mechanical Engineering', 'Civil Engineering', 'Electrical Engineering', 'Electronics'],
  },
  {
    id: 'bsc_cs',
    name: 'B.Sc / BCA (Computer Applications & IT)',
    level: 'Undergraduate / College',
    suggestedStreams: ['Computer Science', 'Data Analytics', 'Information Systems'],
  },
  {
    id: 'bsc_natural_sciences',
    name: 'B.Sc (Natural & Physical Sciences)',
    level: 'Undergraduate / College',
    suggestedStreams: ['Physics', 'Chemistry', 'Mathematics'],
  },
  {
    id: 'bsc_life_sciences',
    name: 'B.Sc / MBBS (Biological & Life Sciences)',
    level: 'Undergraduate / College',
    suggestedStreams: ['Biotechnology', 'Biochemistry', 'Microbiology', 'Life Sciences', 'Medicine'],
  },
  {
    id: 'bcom_business',
    name: 'B.Com / BBA / Economics',
    level: 'Undergraduate / College',
    suggestedStreams: ['Finance & Accounting', 'Business Analytics', 'Economics'],
  },
  {
    id: 'undergrad_general',
    name: 'General Undergraduate Program',
    level: 'Undergraduate / College',
    suggestedStreams: ['Interdisciplinary Studies', 'General'],
  },

  // School Programs
  {
    id: 'school_middle',
    name: 'Middle School (Grades 6 - 8)',
    level: 'School',
    suggestedStreams: ['General Curriculum', 'Foundation Science & Math'],
  },
  {
    id: 'school_secondary',
    name: 'Secondary School (Grades 9 - 10)',
    level: 'School',
    suggestedStreams: ['General Board Curriculum (CBSE / ICSE / State)'],
  },
  {
    id: 'school_senior_pcm',
    name: 'Senior Secondary - Science PCM (Grades 11 - 12)',
    level: 'School',
    suggestedStreams: ['Science (Physics, Chemistry, Mathematics, CS)'],
  },
  {
    id: 'school_senior_pcb',
    name: 'Senior Secondary - Science PCB (Grades 11 - 12)',
    level: 'School',
    suggestedStreams: ['Science (Physics, Chemistry, Biology)'],
  },
  {
    id: 'school_senior_pcmb',
    name: 'Senior Secondary - Science PCMB (Grades 11 - 12)',
    level: 'School',
    suggestedStreams: ['Science (Physics, Chemistry, Math, Biology)'],
  },
  {
    id: 'school_senior_commerce',
    name: 'Senior Secondary - Commerce / Humanities (Grades 11 - 12)',
    level: 'School',
    suggestedStreams: ['Commerce & Applied Mathematics', 'Humanities & Social Sciences'],
  },

  // Postgraduate Programs
  {
    id: 'mtech_cse',
    name: 'M.Tech / M.S. (Computer Science & Engineering)',
    level: 'Postgraduate',
    suggestedStreams: ['Computer Science', 'Artificial Intelligence', 'Data Engineering'],
  },
  {
    id: 'postgrad_general',
    name: 'General Postgraduate Program',
    level: 'Postgraduate',
    suggestedStreams: ['Advanced Technical Studies', 'Research'],
  },

  // Diploma / Vocational Programs
  {
    id: 'diploma_tech',
    name: 'Diploma in Polytechnic & Technology',
    level: 'Diploma / Vocational',
    suggestedStreams: ['Computer Engineering', 'Information Technology', 'Applied Sciences'],
  },

  // Other / Lifelong Learning
  {
    id: 'competitive_exams',
    name: 'Competitive Exam & Placement Prep',
    level: 'Other',
    suggestedStreams: ['GATE / Technical Placement', 'General Competitive Exams', 'Coding Bootcamps'],
  },
  {
    id: 'self_paced',
    name: 'Self-Paced / Lifelong Learning',
    level: 'Other',
    suggestedStreams: ['Self-Paced Learner', 'Professional Upskilling'],
  },
];

export interface ResolvedCurriculum {
  education_level: string;
  academic_stage: string;
  program: string;
  stream: string;
  eligibleSubjects: string[];
  ineligibleSubjects: string[];
  topicRestrictions: Record<string, { allowed?: string[]; excluded?: string[] }>;
  description: string;
}

export class CurriculumService {
  /**
   * Evaluates a student profile and resolves their authoritative academic curriculum eligibility.
   * Deterministic, rules-based, and server-authoritative.
   */
  resolveCurriculum(profile: AcademicProfileContext): ResolvedCurriculum {
    const level = (profile.education_level || 'Undergraduate / College').trim();
    const stage = (profile.academic_stage || '1st Year').trim();
    const program = (profile.program || '').trim();
    const stream = (profile.stream || profile.department || '').trim();

    const normalizedText = `${level} ${stage} ${program} ${stream}`.toLowerCase();

    // ------------------------------------------------------------------------
    // Rule Set 1: School Students (Middle School & Secondary: Grades 1 - 10)
    // ------------------------------------------------------------------------
    const isSchool = level.toLowerCase() === 'school';
    const gradeMatch = stage.match(/Grade\s+(\d+)/i);
    const gradeNum = gradeMatch ? parseInt(gradeMatch[1], 10) : null;

    if (isSchool && gradeNum !== null && gradeNum <= 8) {
      // Middle school students: Foundational subjects only.
      // Strict rule: NEVER expose undergraduate subjects like ML, DBMS, OS, Networks, Data Science.
      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'Middle School Curriculum',
        stream: stream || 'Foundation',
        eligibleSubjects: ['Mathematics', 'Physics', 'Biology', 'General Aptitude', 'English'],
        ineligibleSubjects: ['Computer Science', 'Data Science', 'Chemistry'],
        topicRestrictions: {
          Mathematics: {
            excluded: HIGHER_SECONDARY_OR_COLLEGE_MATH_TOPICS,
          },
          Physics: {
            allowed: ['Units & Measurements', 'Kinematics', 'Laws of Motion', 'Work, Energy & Power', 'Gravitation'],
          },
          Biology: {
            allowed: ['Cell Biology', 'Plant Physiology', 'Human Physiology'],
          },
        },
        description: 'Middle School Foundation Curriculum (Grades 1-8). Advanced college subjects and higher sciences restricted.',
      };
    }

    if (isSchool && gradeNum !== null && (gradeNum === 9 || gradeNum === 10)) {
      // Secondary School (Grades 9 - 10): Foundational sciences, math, aptitude, english, basic programming.
      // Ineligible: College CS (DBMS, OS, Architecture) & Data Science (ML, Regression, etc.)
      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'Secondary School Curriculum (Grades 9-10)',
        stream: stream || 'General Board',
        eligibleSubjects: ['Physics', 'Chemistry', 'Mathematics', 'Biology', 'Computer Science', 'General Aptitude', 'English'],
        ineligibleSubjects: ['Data Science'],
        topicRestrictions: {
          'Computer Science': {
            allowed: ['Programming Fundamentals', 'Python'],
          },
          Mathematics: {
            excluded: ['Limits', 'Differentiation', 'Integration', 'Complex Numbers'],
          },
          Physics: {
            excluded: ['Electrostatics', 'Current Electricity', 'Magnetism', 'Optics', 'Thermodynamics'],
          },
          Chemistry: {
            allowed: ['Mole Concept', 'Atomic Structure', 'Periodic Classification', 'Chemical Bonding'],
          },
        },
        description: 'Secondary School Board Curriculum (Grades 9-10). College CS and advanced Data Science are restricted.',
      };
    }

    if (isSchool && (gradeNum === 11 || gradeNum === 12 || normalizedText.includes('senior') || normalizedText.includes('higher secondary'))) {
      // Senior Secondary (Grades 11 - 12):
      // Check stream: PCB (Medical), PCM (Engineering), PCMB (General Science), Commerce
      const isPCB = normalizedText.includes('pcb') || (normalizedText.includes('bio') && !normalizedText.includes('cs'));
      const isPCM = normalizedText.includes('pcm') || (normalizedText.includes('math') && !normalizedText.includes('bio'));
      const isCommerce = normalizedText.includes('commerce') || normalizedText.includes('humanities');

      if (isPCB) {
        return {
          education_level: level,
          academic_stage: stage,
          program: program || 'Senior Secondary - Science PCB',
          stream: stream || 'Medical Track (PCB)',
          eligibleSubjects: ['Physics', 'Chemistry', 'Biology', 'General Aptitude', 'English'],
          ineligibleSubjects: ['Mathematics', 'Computer Science', 'Data Science'],
          topicRestrictions: {},
          description: 'Senior Secondary Science (PCB Track). Focused on Physics, Chemistry, and Biology.',
        };
      }

      if (isCommerce) {
        return {
          education_level: level,
          academic_stage: stage,
          program: program || 'Senior Secondary - Commerce',
          stream: stream || 'Commerce',
          eligibleSubjects: ['Mathematics', 'General Aptitude', 'English'],
          ineligibleSubjects: ['Physics', 'Chemistry', 'Biology', 'Computer Science', 'Data Science'],
          topicRestrictions: {},
          description: 'Senior Secondary Commerce Track. Focused on Mathematics, Aptitude, and Language.',
        };
      }

      // Default Senior Secondary Science PCM / PCMB
      const includesBio = normalizedText.includes('pcmb') || normalizedText.includes('biology');
      const eligible = ['Physics', 'Chemistry', 'Mathematics', 'Computer Science', 'General Aptitude', 'English'];
      if (includesBio) {
        eligible.push('Biology');
      }

      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'Senior Secondary - Science PCM',
        stream: stream || 'Engineering Track (PCM)',
        eligibleSubjects: eligible,
        ineligibleSubjects: includesBio ? ['Data Science'] : ['Biology', 'Data Science'],
        topicRestrictions: {
          'Computer Science': {
            allowed: ['Programming Fundamentals', 'Python', 'Data Structures', 'Algorithms'],
          },
        },
        description: 'Senior Secondary Science (PCM Track). College-level Data Science and advanced OS/DBMS restricted.',
      };
    }

    // ------------------------------------------------------------------------
    // Rule Set 2: Undergraduate / College Students
    // ------------------------------------------------------------------------
    const isUndergrad = level.toLowerCase().includes('undergraduate') || level.toLowerCase().includes('college');
    const isPostgrad = level.toLowerCase().includes('postgraduate');
    const isDiploma = level.toLowerCase().includes('diploma') || level.toLowerCase().includes('vocational');

    const isCSE =
      normalizedText.includes('computer') ||
      normalizedText.includes('cse') ||
      normalizedText.includes('software') ||
      normalizedText.includes('information tech') ||
      normalizedText.includes('it') ||
      normalizedText.includes('bca') ||
      normalizedText.includes('mca');

    const isDataScience =
      normalizedText.includes('data science') ||
      normalizedText.includes('ai') ||
      normalizedText.includes('artificial intelligence') ||
      normalizedText.includes('machine learning');

    const isLifeSciences =
      normalizedText.includes('bio') ||
      normalizedText.includes('medical') ||
      normalizedText.includes('mbbs') ||
      normalizedText.includes('life science') ||
      normalizedText.includes('biotech');

    const isCommerceBusiness =
      normalizedText.includes('commerce') ||
      normalizedText.includes('b.com') ||
      normalizedText.includes('bba') ||
      normalizedText.includes('mba') ||
      normalizedText.includes('finance') ||
      normalizedText.includes('accounting');

    // Case 2A: Computer Science / Software Engineering
    if (isCSE && !isLifeSciences) {
      // Must expose CS, Data Science, Math, General Aptitude, English.
      // Strict rule from brief: MUST NOT expose unrelated subjects such as Biology!
      const isFirstYear = stage.toLowerCase().includes('1st') || stage.toLowerCase().includes('first') || stage === 'Year 1';
      const eligible = ['Computer Science', 'Data Science', 'Mathematics', 'General Aptitude', 'English'];
      if (isFirstYear) {
        // First year engineering includes basic Physics and Chemistry
        eligible.push('Physics', 'Chemistry');
      }

      const ineligibles = ['Biology'];
      if (!isFirstYear) {
        ineligibles.push('Chemistry', 'Physics');
      }

      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'B.Tech / B.E. (Computer Science & Engineering)',
        stream: stream || 'Computer Science & Engineering',
        eligibleSubjects: eligible,
        ineligibleSubjects: ineligibles,
        topicRestrictions: {},
        description: `Undergraduate Computer Science Curriculum (${stage}). Excludes unrelated subjects (Biology).`,
      };
    }

    // Case 2B: Data Science & AI Specialization
    if (isDataScience && !isLifeSciences) {
      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'B.Tech / B.E. (Data Science & AI)',
        stream: stream || 'Data Science & Artificial Intelligence',
        eligibleSubjects: ['Data Science', 'Computer Science', 'Mathematics', 'General Aptitude', 'English'],
        ineligibleSubjects: ['Biology', 'Chemistry', 'Physics'],
        topicRestrictions: {},
        description: `Undergraduate Data Science & AI Curriculum. Strict exclusion of biological sciences.`,
      };
    }

    // Case 2C: Biological Sciences / Medicine / Biotech
    if (isLifeSciences) {
      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'B.Sc / MBBS (Biological & Life Sciences)',
        stream: stream || 'Life Sciences',
        eligibleSubjects: ['Biology', 'Chemistry', 'Physics', 'General Aptitude', 'English'],
        ineligibleSubjects: ['Computer Science', 'Data Science'],
        topicRestrictions: {},
        description: 'Biological & Medical Sciences Curriculum. Advanced computer systems and data engineering excluded.',
      };
    }

    // Case 2D: Commerce / Business / Economics
    if (isCommerceBusiness) {
      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'B.Com / Business Studies',
        stream: stream || 'Business & Commerce',
        eligibleSubjects: ['Mathematics', 'General Aptitude', 'English'],
        ineligibleSubjects: ['Physics', 'Chemistry', 'Biology', 'Computer Science', 'Data Science'],
        topicRestrictions: {},
        description: 'Commerce & Business Curriculum. Natural sciences and engineering excluded.',
      };
    }

    // Case 2E: General Undergraduate / Diploma / Core Engineering
    if (isUndergrad || isPostgrad || isDiploma) {
      // Default technical/college curriculum: covers science, math, aptitude, english, cs
      return {
        education_level: level,
        academic_stage: stage,
        program: program || 'Undergraduate Curriculum',
        stream: stream || 'Applied Sciences & Engineering',
        eligibleSubjects: ['Computer Science', 'Data Science', 'Mathematics', 'Physics', 'Chemistry', 'General Aptitude', 'English'],
        ineligibleSubjects: ['Biology'],
        topicRestrictions: {},
        description: 'College Science & Engineering Curriculum. Excludes unrelated biological sciences by default.',
      };
    }

    // ------------------------------------------------------------------------
    // Rule Set 3: General / Self-Paced / Competitive Exam Learner
    // ------------------------------------------------------------------------
    return {
      education_level: level,
      academic_stage: stage,
      program: program || 'General Academic Curriculum',
      stream: stream || 'Interdisciplinary Studies',
      eligibleSubjects: [...ALL_SYSTEM_SUBJECTS],
      ineligibleSubjects: [],
      topicRestrictions: {},
      description: 'Comprehensive Multi-Disciplinary Curriculum.',
    };
  }

  /**
   * Asserts whether a given subject is strictly eligible for the student.
   * Case-insensitive subject comparison.
   */
  isSubjectEligible(profile: AcademicProfileContext, subject: string): boolean {
    if (!subject) return false;
    const curriculum = this.resolveCurriculum(profile);
    const normalizedSubject = subject.trim().toLowerCase();

    return curriculum.eligibleSubjects.some(
      (s) => s.trim().toLowerCase() === normalizedSubject
    );
  }

  /**
   * Asserts whether a given topic is strictly eligible for the student within a subject.
   */
  isTopicEligible(profile: AcademicProfileContext, subject: string, topic?: string): boolean {
    if (!this.isSubjectEligible(profile, subject)) {
      return false;
    }

    if (!topic || topic === 'all' || topic === 'All Topics') {
      return true;
    }

    const curriculum = this.resolveCurriculum(profile);
    const subjectKey = Object.keys(curriculum.topicRestrictions).find(
      (s) => s.toLowerCase() === subject.trim().toLowerCase()
    );

    if (!subjectKey) {
      return true;
    }

    const restriction = curriculum.topicRestrictions[subjectKey];
    const normalizedTopic = topic.trim().toLowerCase();

    if (restriction.allowed && restriction.allowed.length > 0) {
      return restriction.allowed.some((t) => t.toLowerCase() === normalizedTopic);
    }

    if (restriction.excluded && restriction.excluded.length > 0) {
      const isExcluded = restriction.excluded.some((t) => t.toLowerCase() === normalizedTopic);
      return !isExcluded;
    }

    return true;
  }

  /**
   * Server-authoritative barrier: Throws CurriculumIneligibleError if request attempts
   * to use an academically unauthorized subject or topic.
   */
  assertCurriculumEligibility(
    profile: AcademicProfileContext,
    subject: string,
    topic?: string
  ): void {
    if (!this.isSubjectEligible(profile, subject)) {
      const resolved = this.resolveCurriculum(profile);
      throw new CurriculumIneligibleError(
        `Subject '${subject}' is not permitted for your academic profile (${resolved.program} • ${resolved.stream}). Eligible subjects are: ${resolved.eligibleSubjects.join(', ')}.`
      );
    }

    if (topic && topic !== 'all' && topic !== 'All Topics' && !this.isTopicEligible(profile, subject, topic)) {
      const resolved = this.resolveCurriculum(profile);
      throw new CurriculumIneligibleError(
        `Topic '${topic}' in ${subject} is outside the syllabus for your academic stage (${resolved.academic_stage}).`
      );
    }
  }

  /**
   * Filters Question Bank metadata down to only the subjects and topics permitted for this student.
   */
  filterQuestionBankMeta(
    rawMeta: {
      subjects: Array<{ name: string; topics: string[]; total_questions: number }>;
      difficulties: string[];
      question_types: string[];
    },
    profile: AcademicProfileContext
  ): {
    subjects: Array<{ name: string; topics: string[]; total_questions: number }>;
    difficulties: string[];
    question_types: string[];
    curriculum_context: {
      education_level: string;
      academic_stage: string;
      program: string;
      stream: string;
      description: string;
      total_eligible_subjects: number;
    };
  } {
    const resolved = this.resolveCurriculum(profile);

    const filteredSubjects: Array<{ name: string; topics: string[]; total_questions: number }> = [];

    for (const sub of rawMeta.subjects) {
      if (!this.isSubjectEligible(profile, sub.name)) {
        continue;
      }

      // Filter topics within eligible subject
      const eligibleTopics = sub.topics.filter((topic) =>
        this.isTopicEligible(profile, sub.name, topic)
      );

      if (eligibleTopics.length > 0) {
        filteredSubjects.push({
          name: sub.name,
          topics: eligibleTopics,
          total_questions: sub.total_questions,
        });
      }
    }

    return {
      subjects: filteredSubjects,
      difficulties: rawMeta.difficulties,
      question_types: rawMeta.question_types,
      curriculum_context: {
        education_level: resolved.education_level,
        academic_stage: resolved.academic_stage,
        program: resolved.program,
        stream: resolved.stream,
        description: resolved.description,
        total_eligible_subjects: filteredSubjects.length,
      },
    };
  }
}

export const curriculumService = new CurriculumService();
