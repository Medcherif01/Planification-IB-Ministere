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

// ===== NOUVELLES INTERFACES POUR LE PLAN D'UNITÉ DÉTAILLÉ =====

export interface UnitSession {
  numero: number;
  date?: string;
  duree: string;
  objectifApprentissage: string;
  contenu: string;
  concepts: string;
  questionsRecherche: string;
  atl: string;
  activite: string;
  roleEnseignant: string;
  roleEleves: string;
  strategie: string;
  ressources: string;
  technologie: string;
  evaluationFormative: string;
  differenciation: string;
  extensionAvances: string;
  soutienDifficultes: string;
  preuveApprentissage: string;
  reflexion: string;
}

export interface FormativeAssessmentDetail {
  titre: string;
  moment: string;
  objectifEvalue: string;
  activite: string;
  criteres: string;
  methodeEvaluation: string;
  feedbackEnseignant: string;
  autoevaluation: string;
  evaluationPairs: string;
  actionApres: string;
}

export interface SummativeAssessmentDetail {
  titre: string;
  contexte: string;
  situation: string;
  consigne: string;
  productionAttendue: string;
  objectifsEvalues: string[];
  criteresPEI: string[];
  aspectsEvalues: string;
  niveauAttendu: string;
  ressourcesAutorisees: string;
  duree: string;
  modalites: string;
  grilleCriteres: string;
  feedback: string;
  possibiliteRevision: boolean;
}

export interface ATLDetail {
  categorie: string; // Communication, Recherche, Pensée, Autogestion, Social
  competence: string;
  sousCompetence: string;
  objectifDeveloppement: string;
  activite: string;
  methodeEnseignement: string;
  observation: string;
  reflexionEleve: string;
}

export interface UnitPlan {
  id: string;
  teacherName: string;
  title: string;
  subject: string;
  gradeLevel: string;
  duration: string;
  // Informations générales supplémentaires
  schoolYear?: string; // Année scolaire
  numberOfPeriods?: string; // Nombre de périodes
  numberOfHours?: string; // Nombre d'heures
  startDate?: string;
  endDate?: string;
  prerequisites?: string; // Prérequis
  
  chapters?: string; // Liste des chapitres/leçons de cette unité

  // === SECTION: CONTEXTE DES ÉLÈVES ===
  studentContext?: {
    priorKnowledge: string;       // Connaissances antérieures
    acquiredSkills: string;        // Compétences déjà acquises
    linksPreviousUnits: string;    // Liens avec unités précédentes
    specificNeeds: string;         // Besoins spécifiques
    profileDiversity: string;      // Diversité des profils
    culturalContexts: string;      // Contextes culturels et locaux
    anticipatedDifficulties: string; // Difficultés anticipées
  };

  // === INQUIRY SECTION ===
  keyConcept: string;
  keyConceptDefinition?: string;   // Définition du concept clé
  keyConceptJustification?: string; // Justification du choix
  keyConceptDevelopment?: string;  // Comment il sera développé
  relatedConcepts: string[];
  relatedConceptsDetails?: {       // Détails pour chaque concept connexe
    name: string;
    definition: string;
    link: string;
    exploration: string;
  }[];
  globalContext: string;
  globalContextJustification?: string; // Justification du choix
  globalContextAspects?: string;   // Aspects explorés
  globalContextLinks?: string;     // Liens avec concepts et contenu
  statementOfInquiry: string;
  statementExplanation?: string;   // Explication de l'énoncé
  statementTransfer?: string;      // Possibilité de transfert
  inquiryQuestions: {
    factual: string[];
    conceptual: string[];
    debatable: string[];
  };

  // === ACTION SECTION ===
  objectives: string[]; // e.g., A, B, C, D
  objectivesDetails?: {            // Détails pour chaque objectif
    criterion: string;
    criterionName?: string;
    title?: string;
    aspects: string;
    expectedLevel: string;
    activities: string;
    formativeAssessment: string;
    summativeAssessment?: string;
  }[];
  atlSkills: string[];
  atlDetails?: ATLDetail[];        // Détails ATL

  // Contenu
  content: string;
  contentDetails?: {               // Contenu détaillé
    knowledges: string;            // Connaissances
    notions: string;               // Notions
    vocabulary: string;            // Vocabulaire
    methods: string;               // Méthodes
    techniques: string;            // Techniques
    disciplinarySkills: string;    // Compétences disciplinaires
    mandatoryContent: string;      // Contenu obligatoire
    selectedContent: string;       // Contenu sélectionné
    nationalLinks: string;         // Liens programme national
  };

  lessons?: string[];

  // === PROCESSUS D'APPRENTISSAGE ===
  learningProcess?: {
    phase1_activation: string;    // Activation des connaissances
    phase2_acquisition: string;   // Acquisition
    phase3_practice: string;      // Mise en pratique
    phase4_transfer: string;      // Application et transfert
    phase5_reflection: string;    // Réflexion
  };

  // Expériences d'apprentissage et stratégies
  learningExperiences: string;
  teachingStrategies?: string;    // Ce que fait l'enseignant
  studentActivities?: string;     // Ce que font les élèves

  // === SÉANCES DÉTAILLÉES ===
  sessions?: UnitSession[];

  // === ÉVALUATION ===
  summativeAssessment: string;
  summativeDetails?: SummativeAssessmentDetail; // Détails éval sommative
  formativeAssessment: string;
  formativeDetails?: FormativeAssessmentDetail[]; // Liste évals formatives

  // === DIFFÉRENCIATION ===
  differentiation: string;
  differentiationDetails?: {
    supportStudents: {
      vocabulary: string;
      visualSupports: string;
      models: string;
      adaptedInstructions: string;
      intermediateSteps: string;
      smallGroups: string;
      individualSupport: string;
      extraTime: string;
      additionalResources: string;
    };
    advancedStudents: {
      deepening: string;
      autonomousResearch: string;
      complexProblems: string;
      challenges: string;
      transfer: string;
      advancedProduction: string;
    };
    contentDifferentiation: string;
    processDifferentiation: string;
    productDifferentiation: string;
  };
  
  // Resources & Reflection
  resources: string;
  reflection: {
    prior: string;
    during: string;
    after: string;
  };
  // Réflexion détaillée
  reflectionDetails?: {
    before: {
      priorKnowledge: string;
      studentNeeds: string;
      anticipatedDifficulties: string;
      relevance: string;
      previousLinks: string;
      plannedStrategies: string;
      plannedDifferentiation: string;
      expectedOutcomes: string;
    };
    during: {
      progressObserved: string;
      difficulties: string;
      effectiveStrategies: string;
      ineffectiveStrategies: string;
      studentParticipation: string;
      adjustmentsMade: string;
      planningChanges: string;
      emergingNeeds: string;
    };
    after: {
      achievedObjectives: string;
      partialObjectives: string;
      studentDifficulties: string;
      assessmentResults: string;
      activityEfficiency: string;
      teachingEfficiency: string;
      differentiationEfficiency: string;
      successes: string;
      improvements: string;
      modificationsNext: string;
      elementsToKeep: string;
      elementsToRemove: string;
      elementsToAdd: string;
    };
  };

  // === LIENS ===
  interdisciplinaryLinks?: {
    subject: string;
    commonConcept: string;
    commonSkill: string;
    commonContent: string;
    commonActivity: string;
    interdisciplinaryProject: string;
    eachDisciplineRole: string;
    noLinksReason?: string;
  }[];
  verticalCoherence?: {
    before: string;  // Ce qu'ils ont appris
    during: string;  // Ce qu'ils apprennent
    after: string;   // Ce qui sera développé après
    linkedPreviousUnits?: string;
    linkedNextUnits?: string;
  };
  horizontalCoherence?: {
    otherSubjectLinks: string;
    commonConcepts: string;
    commonATL: string;
    commonProjects: string;
    transversalSkills: string;
  };

  // === COHÉRENCE (champs texte simples générés par IA) ===
  verticalCoherenceText?: string;   // Texte cohérence verticale (généré IA)
  horizontalCoherenceText?: string; // Texte cohérence horizontale (généré IA)
  interdisciplinaryLinksText?: string; // Texte liens interdisciplinaires (généré IA)

  // Conformité IB
  ibComplianceScore?: number; // Score de complétude 0-100
  ibComplianceDetails?: Record<string, 'complete' | 'partial' | 'missing'>;

  // Full Document for Criterion Referenced Assessment
  generatedAssessmentDocument: string;
  assessmentData?: AssessmentData; // Legacy single assessment
  assessments: AssessmentData[];

  // Mise à jour des détails (sans toucher titre/objectifs/critères/ATL)
  lastDetailUpdate?: string; // Date dernière mise à jour des détails
  isDetailUpdate?: boolean;  // Flag indiquant si c'est une mise à jour de détails uniquement
}

export enum AppView {
  LOGIN = 'LOGIN',
  HOME = 'HOME',
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

// ===== SERVICE EN TANT QU'ACTION (SEA) =====

export type SEAActionType = 'Direct' | 'Indirect' | 'Défense d\'une cause' | 'Recherche';

export interface SEALearningOutcome {
  id: number; // 1-7 (IB official learning outcomes)
  text: string;
  selected: boolean;
}

export interface SEAReflectionPrompt {
  question: string;
}

export interface SEASuccessCriteria {
  description: string;
}

export interface SEAJournalEntry {
  date: string;
  description: string;
}

export interface ServiceActionPlan {
  id: string;
  grade: string;          // PEI 1..5
  subject: string;        // Matière source
  teacherName: string;
  sourceUnitTitle: string;  // Titre de l'unité dont ce SEA est dérivé
  sourceUnitId: string;

  // A. Identification
  title: string;
  actionTypes: SEAActionType[];

  // B. Cœur du projet
  projectDescription: string;    // Ce que l'élève va faire concrètement
  communityNeed: string;          // Pourquoi / qui aide-t-on
  linkToUnit: string;             // Lien avec la matière / l'unité

  // C. Objectifs d'apprentissage IB (2-3 parmi 7)
  learningOutcomes: SEALearningOutcome[];

  // D. Compétences ATL
  atlSkills: string[];

  // E. Module Évaluation / Réflexion
  journalEntries: SEAJournalEntry[];   // 3 rencontres minimum IB
  reflectionPrompts: SEAReflectionPrompt[];  // 3 questions spécifiques
  successCriteria: SEASuccessCriteria[];

  // Metadata
  globalContext: string;
  keyConcept: string;
  createdAt: string;
}

export interface UnitGroupingPreference {
  id?: string;
  unitTitle: string;
  chapters: string;
  targetCriteria?: ('A' | 'B' | 'C' | 'D')[];
}
