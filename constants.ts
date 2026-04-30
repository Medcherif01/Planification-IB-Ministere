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
