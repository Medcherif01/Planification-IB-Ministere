export interface AssessmentData {
  criterion: string; // e.g. "A"
  criterionName: string; // e.g. "Connaissances et compréhension"
  maxPoints: number; // e.g. 8
  strands: string[]; // e.g. ["i. sélectionner...", "ii. appliquer..."]
  rubricRows: {
    level: string; // "1-2"
    descriptor: string; // "L'élève est capable de..."
  }[];
  exercises: {
    title: string;
    content: string;
    criterionReference: string; // "Critère A : i. ..."
    workspaceNeeded?: boolean;
  }[];
}

export interface UnitPlan {
  id: string;
  teacherName: string; // Added: Name of the teacher
  title: string;
  subject: string;
  gradeLevel: string;
  duration: string;
  chapters?: string; // Liste des chapitres/leçons de cette unité
  
  // Inquiry Section
  keyConcept: string;
  relatedConcepts: string[];
  globalContext: string;
  statementOfInquiry: string;
  inquiryQuestions: {
    factual: string[];
    conceptual: string[];
    debatable: string[];
  };

  // Action Section
  objectives: string[]; // e.g., A, B, C, D (minimum 2 critères requis)
  atlSkills: string[];
  content: string;
  learningExperiences: string;
  
  // NOUVEAU: Leçons/Chapitres de l'unité
  lessons?: string[]; // Liste des leçons/chapitres (affichés sous forme de tirets)

  // Assessment
  summativeAssessment: string; // Description of the task
  formativeAssessment: string;
  differentiation: string; // Added from PDF model
  
  // Resources & Reflection
  resources: string;
  reflection: {
    prior: string;
    during: string;
    after: string;
  };

  // Full Document for Criterion Referenced Assessment
  generatedAssessmentDocument: string; // Text view
  assessmentData?: AssessmentData; // Legacy single assessment
  assessments: AssessmentData[]; // Selected assessments (minimum 2, not necessarily all 4)
}

export enum AppView {
  LOGIN = 'LOGIN',
  DASHBOARD = 'DASHBOARD',
  EDITOR = 'EDITOR',
  EXAMS_DASHBOARD = 'EXAMS_DASHBOARD',
  EXAMS_WIZARD = 'EXAMS_WIZARD'
}

export enum GlobalContext {
  IDENTITIES_AND_RELATIONSHIPS = "Identities and relationships",
  ORIENTATION_IN_SPACE_AND_TIME = "Orientation in space and time",
  PERSONAL_AND_CULTURAL_EXPRESSION = "Personal and cultural expression",
  SCIENTIFIC_AND_TECHNICAL_INNOVATION = "Scientific and technical innovation",
  GLOBALIZATION_AND_SUSTAINABILITY = "Globalization and sustainability",
  FAIRNESS_AND_DEVELOPMENT = "Fairness and development"
}

export interface AIRequestConfig {
  temperature?: number;
}

// ===== EXAM SYSTEM TYPES =====

export enum AppMode {
  PEI_PLANNER = 'PEI_PLANNER',
  EXAMS = 'EXAMS'
}

export enum ExamGrade {
  SIXIEME = 'PEI1',
  CINQUIEME = 'PEI2',
  QUATRIEME = 'PEI3',
  TROISIEME = 'PEI4',
  SECONDE = 'PEI5',
  PREMIERE = '1ère',
  TERMINALE = 'Terminale'
}

export enum Semester {
  SEMESTER_1 = 'Semestre 1',
  SEMESTER_2 = 'Semestre 2'
}

// Type de question d'examen
export enum QuestionType {
  QCM = 'QCM',
  VRAI_FAUX = 'Vrai/Faux',
  TEXTE_A_TROUS = 'Textes à trous',
  LEGENDER = 'Légender',
  RELIER_FLECHE = 'Relier par flèche',
  DEFINITIONS = 'Définitions',
  ANALYSE_DOCUMENTS = 'Analyse de documents',
  REPONSE_LONGUE = 'Réponse longue',
  PROBLEME = 'Résolution de problème',
  COMPLETER_TABLEAU = 'Compléter un tableau'
}

// Ressource utilisée dans l'examen
export interface ExamResource {
  type: 'text' | 'image' | 'table' | 'graph';
  title: string;
  content: string; // Pour text/table, ou description pour image/graph
  imageDescription?: string; // Description détaillée pour les images à insérer
}

// Question individuelle dans l'examen
export interface ExamQuestion {
  id: string;
  type: QuestionType;
  title: string;
  content: string;
  points: number;
  hasResource?: boolean;
  resource?: ExamResource;
  
  // Pour QCM
  options?: string[];
  correctAnswer?: string; // Réponse correcte pour QCM (ex: "A", "B", "C")
  
  // Pour Vrai/Faux
  statements?: { statement: string; isTrue?: boolean }[];
  
  // Pour réponse longue/problème
  expectedLines?: number; // Nombre de lignes de réponse attendues
  answer?: string; // Réponse détaillée/corrigé pour la correction
  
  // Différenciation explicite
  isDifferentiation?: boolean;
  
  // Section pour organisation
  section?: string;
  pointsPerStatement?: number; // Pour Vrai/Faux
}

// Données complètes d'un examen
export interface Exam {
  id: string;
  subject: string;
  grade: ExamGrade;
  semester: Semester;
  teacherName: string;
  className: string;
  duration: string; // Ex: "2H"
  totalPoints: number; // Toujours 30
  date?: string;
  
  // Contenu de l'examen
  title: string;
  questions: ExamQuestion[];
  resources: ExamResource[]; // Ressources générales (textes, tableaux, etc.)
  
  // Métadonnées
  difficulty: 'Facile' | 'Moyen' | 'Difficile';
  style?: 'Brevet' | 'Bac' | 'Standard'; // Pour PEI4, DP1, DP2
  chapters?: string; // Chapitres/sujets couverts
  
  createdAt: Date;
  updatedAt: Date;
}

// Configuration pour la génération d'examen
export interface ExamGenerationConfig {
  subject: string;
  grade: ExamGrade;
  semester: Semester;
  chapters: string;
  teacherName?: string;
  className?: string;
  includeTextResource?: boolean; // Pour Français/Anglais
  includeGraphResource?: boolean; // Pour Sciences/Maths
  examType?: 'Examen' | 'Évaluation'; // Type: Examen (2H) ou Évaluation (40 min)
}