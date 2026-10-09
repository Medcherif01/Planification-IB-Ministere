export const KEY_CONCEPTS = [
  "Esthétique", "Changement", "Communication", "Communautés", 
  "Connexions", "Créativité", "Culture", "Développement", 
  "Forme", "Interactions mondiales", "Identité", "Logique", 
  "Perspective", "Relations", "Systèmes", "Temps, lieu et espace"
];

export const RELATED_CONCEPTS_MATH = [
  "Approximation", "Changement", "Équivalence", "Généralisation", 
  "Modèles", "Modèles (Patterns)", "Quantité", "Représentation", 
  "Simplification", "Espace", "Système", "Validité"
];

// A simplified list of generic related concepts for demo purposes
export const RELATED_CONCEPTS_GENERIC = [
  "Adaptation", "Équilibre", "Causalité", "Caractère", "Choix", 
  "Conflit", "Coopération", "Cycle", "Énergie", "Environnement", 
  "Évolution", "Fonction", "Croissance", "Impact", "Innovation", 
  "Interaction", "Justice", "Gestion", "Sens", "Mouvement", 
  "Narration", "Réseau", "Origine", "Pouvoir", "Processus", 
  "Raffinement", "Ressources", "Échelle", "Structure", "Durabilité", 
  "Transformation", "Valeurs"
];

export const GLOBAL_CONTEXTS = [
  "Identités et relations",
  "Orientation dans l'espace et dans le temps",
  "Expression personnelle et culturelle",
  "Innovation scientifique et technique",
  "Mondialisation et durabilité",
  "Équité et développement"
];

// ─────────────────────────────────────────────────────────────────────────────
// ENGLISH VERSIONS — used for "Acquisition de langues" (Language Acquisition /
// English). For this subject the whole unit plan, assessments and overview are
// produced in ENGLISH (IB MYP official terminology).
// ─────────────────────────────────────────────────────────────────────────────
export const KEY_CONCEPTS_EN = [
  "Aesthetics", "Change", "Communication", "Communities",
  "Connections", "Creativity", "Culture", "Development",
  "Form", "Global interactions", "Identity", "Logic",
  "Perspective", "Relationships", "Systems", "Time, place and space"
];

// Official IB MYP Language Acquisition related concepts
export const RELATED_CONCEPTS_LANGUAGE_ACQUISITION_EN = [
  "Accent", "Argument", "Audience", "Bias", "Context", "Conventions",
  "Empathy", "Form", "Function", "Idiom", "Inference", "Meaning",
  "Message", "Patterns", "Point of view", "Purpose", "Structure",
  "Stylistic choices", "Theme", "Voice", "Word choice"
];

export const GLOBAL_CONTEXTS_EN = [
  "Identities and relationships",
  "Orientation in space and time",
  "Personal and cultural expression",
  "Scientific and technical innovation",
  "Globalization and sustainability",
  "Fairness and development"
];

// French ⇄ English mapping of global contexts (to normalise legacy data)
export const GLOBAL_CONTEXT_FR_TO_EN: Record<string, string> = {
  "Identités et relations": "Identities and relationships",
  "Orientation dans l'espace et dans le temps": "Orientation in space and time",
  "Expression personnelle et culturelle": "Personal and cultural expression",
  "Innovation scientifique et technique": "Scientific and technical innovation",
  "Mondialisation et durabilité": "Globalization and sustainability",
  "Équité et développement": "Fairness and development",
};

// French ⇄ English mapping of key concepts
export const KEY_CONCEPT_FR_TO_EN: Record<string, string> = {
  "Esthétique": "Aesthetics", "Changement": "Change", "Communication": "Communication",
  "Communautés": "Communities", "Connexions": "Connections", "Liens": "Connections",
  "Créativité": "Creativity", "Culture": "Culture", "Développement": "Development",
  "Forme": "Form", "Interactions mondiales": "Global interactions", "Identité": "Identity",
  "Logique": "Logic", "Perspective": "Perspective", "Relations": "Relationships",
  "Systèmes": "Systems", "Temps, lieu et espace": "Time, place and space",
};

/** Detects the Language Acquisition / English subject (content generated in English). */
export const isEnglishSubject = (subject?: string): boolean => {
  const n = (subject || '').toLowerCase().trim();
  return (n.includes('acquisition') && (n.includes('langue') || n.includes('language'))) ||
         n.includes('anglais') || n.includes('english');
};

/** Returns the concept / context option lists adapted to the subject language. */
export const getConceptListsForSubject = (subject?: string) => {
  if (isEnglishSubject(subject)) {
    return {
      keyConcepts: KEY_CONCEPTS_EN,
      relatedConcepts: RELATED_CONCEPTS_LANGUAGE_ACQUISITION_EN,
      globalContexts: GLOBAL_CONTEXTS_EN,
    };
  }
  return {
    keyConcepts: KEY_CONCEPTS,
    relatedConcepts: RELATED_CONCEPTS_GENERIC,
    globalContexts: GLOBAL_CONTEXTS,
  };
};

export const SUBJECTS = [
  "Langue et littérature",
  "Acquisition de langues",
  "Individus et sociétés",
  "Sciences",
  "Mathématiques",
  "Arts",
  "Éducation physique et à la santé",
  "Design"
];

// Thème interdisciplinaire — ajouté séparément pour être débloqué uniquement
// quand TOUTES les autres matières ont au moins une planification pour le niveau concerné.
export const INTERDISCIPLINARY_SUBJECT = "Thème interdisciplinaire";

// PEI grades available for planning
export const PEI_GRADES = ["PEI 1", "PEI 2", "PEI 3", "PEI 4", "PEI 5"];

// Sections scolaires Al Kawthar (Séparation stricte Garçons / Filles)
export type SchoolSection = 'Garçons' | 'Filles';

export interface SectionConfig {
  id: SchoolSection;
  label: string;
  shortLabel: string;
  emoji: string;
  color: string;
  badgeBg: string;
  border: string;
}

export const SCHOOL_SECTIONS: SectionConfig[] = [
  {
    id: 'Garçons',
    label: 'Section Garçons 👨',
    shortLabel: 'Garçons',
    emoji: '👨',
    color: 'from-blue-600 to-indigo-700',
    badgeBg: 'bg-blue-100 text-blue-800 border-blue-300',
    border: 'border-blue-400',
  },
  {
    id: 'Filles',
    label: 'Section Filles 👩',
    shortLabel: 'Filles',
    emoji: '👩',
    color: 'from-rose-500 to-pink-600',
    badgeBg: 'bg-rose-100 text-rose-800 border-rose-300',
    border: 'border-rose-400',
  },
];

/**
 * Détecte si un texte contient des caractères arabes
 */
export function isArabicText(text?: string | null): boolean {
  if (!text) return false;
  return /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/.test(text);
}

export const PLAN_TEMPLATE_URL = "https://docs.google.com/document/d/144_yUOythmkjTsP9PA4k5YLOpRFyV7Zv/export?format=docx";
export const EVAL_TEMPLATE_URL = "https://docs.google.com/document/d/15ASfn_LF-jsPh5CYn4FJvEBSpm31hPAA/export?format=docx";

// URL du template Word pour les examens (depuis variable d'environnement Vercel)
export const WORD_TEMPLATE_URL = "https://docs.google.com/document/d/1Gd7bZPsRNPbL5bpv_Pq6aAcSUgjF_FCR/export?format=docx";

// ─────────────────────────────────────────────────────────────────────────────
// BALISES / TAGS — Formulaire Drive pour génération de plans interdisciplinaires
// Ce dictionnaire sert de référence dans l'UI et dans parseDriveFormTags().
// ─────────────────────────────────────────────────────────────────────────────
export const DRIVE_FORM_TAG_GUIDE = {
  required: [
    { tag: "[MATIERE]",    description: "Nom de la matière principale (ex: Mathématiques)" },
    { tag: "[CLASSE]",     description: "Niveau de classe (ex: PEI 3)" },
    { tag: "[CHAPITRES]",  description: "Liste complète des chapitres / thèmes du programme" },
  ],
  optional: [
    { tag: "[DISCIPLINE2]",    description: "2ème discipline — active le mode interdisciplinaire" },
    { tag: "[DISCIPLINE3]",    description: "3ème discipline optionnelle (≥ 3 recommandé pour IB)" },
    { tag: "[ENSEIGNANT]",     description: "Nom(s) de l'enseignant, séparés par |" },
    { tag: "[RESSOURCES]",     description: "Ressources disponibles (manuels, vidéos…)" },
    { tag: "[CONCEPT_CLE]",    description: "Concept clé IB imposé (ex: Changement)" },
    { tag: "[CONTEXTE]",       description: "Contexte mondial IB imposé" },
    { tag: "[DUREE]",          description: "Durée de l'unité (ex: 30h)" },
    { tag: "[ENONCE]",         description: "Suggestion d'énoncé de recherche (l'IA l'affine)" },
    { tag: "[THEME]",          description: "Thème directeur libre pour l'interdisciplinaire" },
    { tag: "[NOMBRE_UNITES]",  description: "Nombre d'unités à générer (min 2, max 6)" },
    { tag: "[OBJECTIFS_COMMUNS]", description: "Objectifs partagés entre disciplines" },
  ],
  interdisciplinaryNote: [
    "Ajoutez [DISCIPLINE2] (et [DISCIPLINE3]) pour activer le mode interdisciplinaire.",
    "Minimum 2 unités interdisciplinaires par classe (norme IB PEI).",
    "Les critères A, B, C seront générés chacun sur 8 points.",
    "Structure obligatoire : Recherche → Action → Réflexion.",
    "L'énoncé de recherche ne doit PAS nommer les matières directement.",
    "Les objectifs communs doivent être différents des objectifs spécifiques de chaque unité.",
  ],
};
