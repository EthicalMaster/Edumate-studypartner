import { StudyKit, Flashcard, QuizQuestion, WeakTopic, AudioSummaryTrack, NotificationItem } from '../types';

export const INITIAL_STUDY_KITS: StudyKit[] = [
  {
    id: 'kit-physics-electrostatics',
    title: 'Electrostatics',
    subject: 'Physics',
    unit: 'Unit 1',
    keyConceptsLearned: 18,
    totalKeyConcepts: 25,
    progressPercent: 72,
    lastStudied: 'Studied 2h ago',
    description: 'Fundamental electrostatics covering Coulomb’s Law, electric field intensity, Gauss Law, and electric potential inside dielectric mediums.',
    flashcardsCount: 24,
    quizzesCount: 15,
    audioDurationMin: 12,
    activeModule: "Coulomb's Law & Flux",
    tags: ['Gauss Law', 'Electric Field', 'Flux', 'Capacitance'],
    fileSource: 'Physics_Ch3_Lecture_Notes.pdf',
    accuracy: 82,
  },
  {
    id: 'kit-physics-magnetism',
    title: 'Magnetism & Matter',
    subject: 'Physics',
    unit: 'Unit 3',
    keyConceptsLearned: 11,
    totalKeyConcepts: 23,
    progressPercent: 48,
    lastStudied: 'Studied yesterday',
    description: 'Biot-Savart Law, Ampere’s Circuital Law, Earth’s magnetic field parameters, and magnetic dipole moments.',
    flashcardsCount: 22,
    quizzesCount: 12,
    audioDurationMin: 14,
    activeModule: 'Biot-Savart & Solenoids',
    tags: ['Lorentz Force', 'Torque', 'Magnetic Dipole'],
    fileSource: 'Magnetism_Comprehensive_Slides.pdf',
    accuracy: 48,
  },
  {
    id: 'kit-math-calculus',
    title: 'Calculus & Linear Algebra',
    subject: 'Mathematics',
    unit: 'Unit 2',
    keyConceptsLearned: 26,
    totalKeyConcepts: 35,
    progressPercent: 74,
    lastStudied: 'Studied 3d ago',
    description: 'Multivariable calculus, double integrals, Jacobian transformations, Eigenvalues, and matrix diagonalization.',
    flashcardsCount: 30,
    quizzesCount: 20,
    audioDurationMin: 16,
    activeModule: 'Jacobian & Change of Variables',
    tags: ['Eigenvectors', 'Double Integrals', 'Gradient Vector'],
    fileSource: 'Math201_Linear_Algebra_Notes.pdf',
    accuracy: 74,
  },
  {
    id: 'kit-chem-organic',
    title: 'Organic & Physical Chemistry',
    subject: 'Chemistry',
    unit: 'Unit 4',
    keyConceptsLearned: 17,
    totalKeyConcepts: 25,
    progressPercent: 68,
    lastStudied: 'Studied 4d ago',
    description: 'Electrophilic aromatic substitution, nucleophilic addition, reaction mechanisms, and thermodynamics of chemical equilibria.',
    flashcardsCount: 18,
    quizzesCount: 10,
    audioDurationMin: 10,
    activeModule: 'Reaction Kinetics & SN1/SN2',
    tags: ['Kinetics', 'SN1/SN2', 'Thermodynamics'],
    fileSource: 'Organic_Mechanisms_Summary.docx',
    accuracy: 68,
  },
  {
    id: 'kit-cs-architecture',
    title: 'Computer Architecture & RISC-V',
    subject: 'Computer Science',
    unit: 'Unit 5',
    keyConceptsLearned: 22,
    totalKeyConcepts: 25,
    progressPercent: 88,
    lastStudied: 'Studied 5d ago',
    description: 'Pipelining, branch hazards, cache hierarchies, virtual memory paging, and instruction set architecture encoding.',
    flashcardsCount: 28,
    quizzesCount: 16,
    audioDurationMin: 15,
    activeModule: 'Pipeline Hazard Mitigation',
    tags: ['Pipelining', 'RISC-V', 'Cache Coherence'],
    fileSource: 'CS_Arch_Pipelining_Slides.pdf',
    accuracy: 89,
  }
];

export const INITIAL_WEAK_TOPICS: WeakTopic[] = [
  {
    id: 'wt-1',
    subject: 'Physics',
    topicName: 'Magnetism & Matter',
    accuracy: 48,
    priority: 'High Priority',
    missedQuestionsCount: 7,
    recommendedAction: 'Practice',
    actionType: 'practice',
  },
  {
    id: 'wt-2',
    subject: 'Physics',
    topicName: 'Current Electricity',
    accuracy: 62,
    priority: 'Needs Revision',
    missedQuestionsCount: 5,
    recommendedAction: 'Review',
    actionType: 'review',
  },
  {
    id: 'wt-3',
    subject: 'Physics',
    topicName: 'Modern Physics • Dual Nature',
    accuracy: 66,
    priority: 'Review',
    missedQuestionsCount: 4,
    recommendedAction: 'Review',
    actionType: 'review',
  },
  {
    id: 'wt-4',
    subject: 'Physics',
    topicName: 'Electromagnetic Induction',
    accuracy: 71,
    priority: 'Improving',
    missedQuestionsCount: 2,
    recommendedAction: 'Drill',
    actionType: 'drill',
  }
];

export const INITIAL_FLASHCARDS: Flashcard[] = [
  {
    id: 'fc-1',
    kitId: 'kit-physics-electrostatics',
    subject: 'Physics',
    topic: "Coulomb's Law & Flux",
    question: "What does Gauss's Law mathematically state regarding electric flux through a closed surface?",
    answer: "The total electric flux Φ through any closed Gaussian surface equals the net charge enclosed divided by the permittivity of free space ε₀.",
    formula: "∮ E · dA = Q_enclosed / ε₀",
    keyConcept: "Gauss's Flux Theorem",
    difficulty: 'medium',
    masteryLevel: 'learning',
  },
  {
    id: 'fc-2',
    kitId: 'kit-physics-electrostatics',
    subject: 'Physics',
    topic: "Coulomb's Law & Flux",
    question: "What is the electric field E inside a uniformly charged conducting spherical shell of radius R?",
    answer: "The electric field inside a charged conductor is exactly ZERO everywhere (E = 0), because all excess charge resides purely on the outer conductor surface.",
    formula: "E_inside = 0 (for r < R)",
    keyConcept: "Conducting Shell Electrostatic Shielding",
    difficulty: 'easy',
    masteryLevel: 'mastered',
  },
  {
    id: 'fc-3',
    kitId: 'kit-physics-electrostatics',
    subject: 'Physics',
    topic: 'Capacitance & Dielectrics',
    question: 'How does inserting a dielectric material with constant κ affect capacitance and stored energy at constant voltage?',
    answer: 'Capacitance multiplies by κ (C = κ·C₀). Because V is held constant by the source, the stored energy increases by factor κ (U = ½κ·C₀·V²).',
    formula: "C' = κ C₀,  U' = κ U₀",
    keyConcept: 'Dielectric Polarisation & Energy Density',
    difficulty: 'hard',
    masteryLevel: 'review',
  },
  {
    id: 'fc-4',
    kitId: 'kit-physics-magnetism',
    subject: 'Physics',
    topic: 'Biot-Savart Law',
    question: 'State the magnetic field B at the center of a circular loop carrying current I with radius R.',
    answer: 'The magnetic field at the center of a circular current-carrying loop is proportional to current I and inversely proportional to 2R.',
    formula: "B = (μ₀ · I) / (2R)",
    keyConcept: 'Circular Loop Magnetic Field',
    difficulty: 'medium',
    masteryLevel: 'learning',
  },
  {
    id: 'fc-5',
    kitId: 'kit-math-calculus',
    subject: 'Mathematics',
    topic: 'Jacobian Transformation',
    question: 'What is the role of the Jacobian determinant J in multiple integration coordinate substitutions?',
    answer: 'The Jacobian determinant measures how much a coordinate transformation expands or contracts local differential area or volume elements (dx dy = |J| du dv).',
    formula: "J = det [ ∂(x,y) / ∂(u,v) ]",
    keyConcept: 'Coordinate Transformation Scaling',
    difficulty: 'hard',
    masteryLevel: 'review',
  }
];

export const INITIAL_QUIZ_QUESTIONS: QuizQuestion[] = [
  {
    id: 'qq-1',
    kitId: 'kit-physics-electrostatics',
    subject: 'Physics',
    topic: 'Gauss Law & Spherical Shells',
    question: 'A spherical Gaussian surface encloses a point charge q. If the radius of the sphere is doubled, how does the total electric flux through the surface change?',
    options: [
      { id: 'a', text: 'It doubles' },
      { id: 'b', text: 'It quadruples' },
      { id: 'c', text: 'It remains unchanged' },
      { id: 'd', text: 'It halves' }
    ],
    correctOptionId: 'c',
    explanation: 'By Gauss’s Law (Φ = q / ε₀), total electric flux depends solely on the net enclosed charge, not on the dimensions or geometry of the Gaussian boundary.',
    formulaHint: 'Φ = Q_enclosed / ε₀',
    difficulty: 'medium',
  },
  {
    id: 'qq-2',
    kitId: 'kit-physics-electrostatics',
    subject: 'Physics',
    topic: 'Electric Potential',
    question: 'Two conducting plates separated by distance d have potential difference V. If a dielectric slab with κ = 4 fills the gap with battery disconnected, what happens to the electric field E?',
    options: [
      { id: 'a', text: 'E increases 4 times' },
      { id: 'b', text: 'E decreases to E₀ / 4' },
      { id: 'c', text: 'E remains constant' },
      { id: 'd', text: 'E drops to zero' }
    ],
    correctOptionId: 'b',
    explanation: 'When the battery is disconnected, the surface charge Q is conserved. The polarized dielectric induces bound charges that oppose the original field, attenuating E by factor κ: E = E₀ / κ.',
    formulaHint: 'E = E₀ / κ',
    difficulty: 'hard',
  },
  {
    id: 'qq-3',
    kitId: 'kit-physics-magnetism',
    subject: 'Physics',
    topic: 'Magnetic Force',
    question: 'A charged particle moves with velocity v parallel to a uniform magnetic field B. What is the magnetic Lorentz force acting on it?',
    options: [
      { id: 'a', text: 'F = q · v · B' },
      { id: 'b', text: 'F = 0' },
      { id: 'c', text: 'F = ½ q v B' },
      { id: 'd', text: 'F = q / (v · B)' }
    ],
    correctOptionId: 'b',
    explanation: 'The magnetic force is given by F = q(v × B) = q · v · B · sin(θ). Since the particle is moving parallel, θ = 0°, so sin(0°) = 0.',
    formulaHint: 'F = q (v × B) = q v B sin θ',
    difficulty: 'easy',
  },
  {
    id: 'qq-4',
    kitId: 'kit-physics-electrostatics',
    subject: 'Physics',
    topic: "Coulomb's Law",
    question: 'If the distance between two stationary point charges is halved, the electrostatic repulsive force between them:',
    options: [
      { id: 'a', text: 'Doubles' },
      { id: 'b', text: 'Remains unchanged' },
      { id: 'c', text: 'Increases by 4 times' },
      { id: 'd', text: 'Decreases by half' }
    ],
    correctOptionId: 'c',
    explanation: "Coulomb's law follows an inverse square relationship: F ∝ 1/r². When r is divided by 2, (1/2)² in denominator multiplies the force by 4.",
    formulaHint: 'F = k · q₁ q₂ / r²',
    difficulty: 'easy',
  }
];

export const INITIAL_AUDIO_TRACK: AudioSummaryTrack = {
  id: 'audio-electrostatics-ep3',
  title: 'Electrostatics Summary • AI Voice Duo',
  subtitle: 'Module 3: Gauss Law & Spherical Shell Potentials',
  moduleName: "Coulomb's Law & Flux",
  durationSeconds: 340, // 05:40
  speed: 1.2,
  transcript: [
    {
      speaker: 'Host Alex (AI)',
      timestamp: '00:00',
      text: "Welcome back to EduMate Micro-Pods! Today, Sam and I are breaking down Gauss's Law and why students constantly trip over spherical shell potentials."
    },
    {
      speaker: 'Host Sam (AI)',
      timestamp: '00:28',
      text: "Right! Think of electric flux as water spraying out of a garden nozzle through a net. Gauss's Law simply counts how many 'water sources'—or positive charges—are trapped inside that net."
    },
    {
      speaker: 'Host Alex (AI)',
      timestamp: '01:15',
      text: "And here is the golden exam trap: what is the electric field inside a hollow conducting sphere with charge Q on the outside? Remember: E is ZERO inside!"
    },
    {
      speaker: 'Host Sam (AI)',
      timestamp: '02:14',
      text: "Because any symmetric Gaussian surface drawn inside encloses zero net charge! But beware: the potential inside is NOT zero; it stays constant and equals the potential at the surface: V = kQ/R."
    },
    {
      speaker: 'Host Alex (AI)',
      timestamp: '03:45',
      text: "That distinction between E-field (which is the derivative dV/dr) and Potential V is why 30% of cohort students lose marks on midterm question 4!"
    }
  ]
};

export const INITIAL_NOTIFICATIONS: NotificationItem[] = [
  {
    id: 'notif-1',
    title: '7 Day Streak Achieved! 🔥',
    description: 'You completed study sessions 7 days in a row. Top 15% consistency in your cohort.',
    timeAgo: '10m ago',
    read: false,
    type: 'achievement'
  },
  {
    id: 'notif-2',
    title: 'Adaptive Quiz Ready',
    description: 'AI synthesized 5 remedial questions for Magnetism & Matter based on missed tests.',
    timeAgo: '1h ago',
    read: false,
    type: 'reminder'
  },
  {
    id: 'notif-3',
    title: 'Study Kit Extracted',
    description: 'Physics Chapter 3 lecture notes were processed with 99.4% extraction accuracy.',
    timeAgo: '2h ago',
    read: true,
    type: 'system'
  }
];

export const SUBJECT_MASTERY_STATS = [
  {
    subject: 'Physics',
    detail: '4 Units Active',
    percentage: 82,
    color: '#0051d5',
    barClass: 'bg-[#0051d5]',
    dotClass: 'bg-[#0051d5]',
  },
  {
    subject: 'Mathematics',
    detail: 'Calculus & Linear Algebra',
    percentage: 74,
    color: '#6366f1',
    barClass: 'bg-indigo-500',
    dotClass: 'bg-indigo-500',
  },
  {
    subject: 'Chemistry',
    detail: 'Organic & Physical',
    percentage: 68,
    color: '#0891b2',
    barClass: 'bg-cyan-600',
    dotClass: 'bg-cyan-600',
  },
  {
    subject: 'English Literature',
    detail: 'Critical Analysis',
    percentage: 56,
    color: '#10b981',
    barClass: 'bg-emerald-500',
    dotClass: 'bg-emerald-500',
  }
];
