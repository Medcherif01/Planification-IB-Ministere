import { AssessmentData } from '../types';

// ─────────────────────────────────────────────────────────────────────────────
// ibCriteriaService.ts
// Gestion des objectifs spécifiques IB personnalisés par matière + niveau PEI.
//
// Structure stockée :
//   IbCriteriaConfig {
//     subject: string         // ex: "Mathématiques"
//     grade: string           // ex: "PEI 3"
//     criteria: IbCriterion[] // A, B, C, D (ou sous-ensemble) avec strands + grille
//     updatedAt: string       // ISO date
//   }
//
//   IbCriterion {
//     criterion: 'A'|'B'|'C'|'D'
//     criterionName: string
//     maxPoints: number           // toujours 8 en PEI
//     strands: string[]           // ["i. ...", "ii. ...", ...]  (jusqu'à 5)
//     rubricRows: IbRubricRow[]   // niveaux 0, 1-2, 3-4, 5-6, 7-8
//   }
//
//   IbRubricRow {
//     level: string     // "0" | "1-2" | "3-4" | "5-6" | "7-8"
//     descriptor: string
//   }
// ─────────────────────────────────────────────────────────────────────────────

export interface IbRubricRow {
  level: string;
  descriptor: string;
}

export interface IbCriterion {
  criterion: 'A' | 'B' | 'C' | 'D';
  criterionName: string;
  maxPoints: 8;
  strands: string[];      // min 3, max 5 strands
  rubricRows: IbRubricRow[];
}

export interface IbCriteriaConfig {
  subject: string;
  grade: string;
  criteria: IbCriterion[];
  updatedAt: string;
}

// ─── localStorage key helper ───────────────────────────────────────────────
const LS_PREFIX = 'ib_criteria_';

function lsKey(subject: string, grade: string): string {
  return `${LS_PREFIX}${subject.trim()}_${grade.trim()}`;
}

// ─── Default rubric rows used when building a fresh criterion ─────────────
export const DEFAULT_RUBRIC_ROWS: IbRubricRow[] = [
  { level: '0',   descriptor: "L'élève n'atteint pas le niveau décrit par les descripteurs suivants." },
  { level: '1–2', descriptor: "L'élève démontre une compréhension limitée des aspects évalués." },
  { level: '3–4', descriptor: "L'élève démontre une compréhension partielle des aspects évalués." },
  { level: '5–6', descriptor: "L'élève démontre une bonne compréhension des aspects évalués." },
  { level: '7–8', descriptor: "L'élève démontre une compréhension approfondie et nuancée de tous les aspects évalués." },
];

// ─── Standard IB rubric levels (labels only) ──────────────────────────────
export const RUBRIC_LEVELS = ['0', '1–2', '3–4', '5–6', '7–8'];

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL STORAGE — Read / Write
// ─────────────────────────────────────────────────────────────────────────────

export function loadCriteriaFromLocalStorage(
  subject: string,
  grade: string
): IbCriteriaConfig | null {
  try {
    const raw = localStorage.getItem(lsKey(subject, grade));
    if (!raw) return null;
    return JSON.parse(raw) as IbCriteriaConfig;
  } catch {
    return null;
  }
}

export function saveCriteriaToLocalStorage(config: IbCriteriaConfig): void {
  try {
    localStorage.setItem(lsKey(config.subject, config.grade), JSON.stringify(config));
  } catch (e) {
    console.error('Erreur écriture ib_criteria localStorage:', e);
  }
}

export function deleteCriteriaFromLocalStorage(subject: string, grade: string): void {
  try {
    localStorage.removeItem(lsKey(subject, grade));
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API — MongoDB via /api/ib-criteria
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL = '/api';

export async function loadCriteriaFromDatabase(
  subject: string,
  grade: string
): Promise<IbCriteriaConfig | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/ib-criteria?subject=${encodeURIComponent(subject)}&grade=${encodeURIComponent(grade)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.config ?? null;
  } catch (e) {
    console.warn('Fallback localStorage pour ib-criteria:', e);
    return loadCriteriaFromLocalStorage(subject, grade);
  }
}

export async function saveCriteriaToDatabase(config: IbCriteriaConfig): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/ib-criteria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Also persist locally as backup
    saveCriteriaToLocalStorage(config);
    return true;
  } catch (e) {
    console.error('Erreur sauvegarde ib-criteria vers MongoDB:', e);
    saveCriteriaToLocalStorage(config);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main public API — load with fallback chain: MongoDB → localStorage → null
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCriteria(
  subject: string,
  grade: string
): Promise<IbCriteriaConfig | null> {
  // 1. Try localStorage first (instant, no network cost)
  const local = loadCriteriaFromLocalStorage(subject, grade);
  if (local) return local;
  // 2. Try MongoDB
  return loadCriteriaFromDatabase(subject, grade);
}

export async function saveCriteria(config: IbCriteriaConfig): Promise<void> {
  const stamped: IbCriteriaConfig = { ...config, updatedAt: new Date().toISOString() };
  saveCriteriaToLocalStorage(stamped); // instant
  await saveCriteriaToDatabase(stamped); // async, best-effort
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous reader used inside geminiService (no async needed there since
// we cache to localStorage on save; generation always happens after the editor
// has been saved at least once).
// ─────────────────────────────────────────────────────────────────────────────

export function getCriteriaSync(subject: string, grade: string): IbCriteriaConfig | null {
  return loadCriteriaFromLocalStorage(subject, grade);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a compact textual summary of custom criteria for injection in prompts
// ─────────────────────────────────────────────────────────────────────────────
export function buildCriteriaSummaryForPrompt(config: IbCriteriaConfig): string {
  const lines: string[] = [
    `OBJECTIFS SPÉCIFIQUES IB OFFICIELS pour ${config.subject} — ${config.grade} (saisis par l'enseignant) :`,
    'Ces critères DOIVENT être utilisés EXACTEMENT dans la génération des évaluations critériées.',
    '',
  ];
  for (const c of config.criteria) {
    lines.push(`Critère ${c.criterion} — ${c.criterionName} (/${c.maxPoints}):`);
    c.strands.forEach(s => lines.push(`  ${s}`));
    if (c.rubricRows && c.rubricRows.length > 0) {
      lines.push('  Grille de notation :');
      c.rubricRows.forEach(r => lines.push(`    [${r.level}] : ${r.descriptor}`));
    }
    lines.push('');
  }
  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// Standard IB MYP Criteria & Aspects (Strands with Roman Numerals i, ii, iii, iv)
// ─────────────────────────────────────────────────────────────────────────────

export interface StandardIBCriterionInfo {
  name: string;
  strands: string[];
  aspectsFormatted: string;
  expectedLevel: string;
  activities: string;
  formativeAssessment: string;
  summativeAssessment: string;
}

export const STANDARD_IB_CRITERIA_BY_SUBJECT: Record<string, Record<'A'|'B'|'C'|'D', StandardIBCriterionInfo>> = {
  // Langue et littérature
  langue_litterature: {
    A: {
      name: 'Analyser',
      strands: [
        "i. Analyser les effets des choix de l'auteur sur le lecteur",
        "ii. Justifier des opinions et des idées à l'aide d'exemples et de citations",
        "iii. Évaluer les liens et interconnexions entre les textes"
      ],
      aspectsFormatted: "i. Analyser les effets des choix de l'auteur sur le lecteur ; ii. Justifier des opinions et des idées à l'aide d'exemples et de citations ; iii. Évaluer les liens et interconnexions entre les textes.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Lectures analytiques guidées, identification des figures de style et analyse critique d'extraits textuels.",
      formativeAssessment: "Questionnaires de repérage et bilans d'étape sur l'analyse littéraire.",
      summativeAssessment: "Commentaire littéraire structuré ou analyse comparative de textes."
    },
    B: {
      name: 'Organiser',
      strands: [
        "i. Employer des structures organisationnelles adaptées au contexte et à l'intention",
        "ii. Structurer les idées de manière logique et cohérente",
        "iii. Utiliser des outils de mise en page et de référencement appropriés"
      ],
      aspectsFormatted: "i. Employer des structures organisationnelles adaptées au contexte et à l'intention ; ii. Structurer les idées de manière logique et cohérente ; iii. Utiliser des outils de mise en page et de référencement appropriés.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Élaboration de plans de rédaction détaillés, structuration des paragraphes et usage des connecteurs logiques.",
      formativeAssessment: "Vérification formative du plan d'écriture et rétroaction entre pairs.",
      summativeAssessment: "Production écrite organisée selon une progression logique rigoureuse."
    },
    C: {
      name: 'Produire du texte',
      strands: [
        "i. Produire des textes qui démontrent réflexion, discernement et créativité",
        "ii. Choisir et employer des éléments stylistiques adaptés",
        "iii. Explorer des perspectives diverses à travers l'écriture"
      ],
      aspectsFormatted: "i. Produire des textes qui démontrent réflexion, discernement et créativité ; ii. Choisir et employer des éléments stylistiques adaptés ; iii. Explorer des perspectives diverses à travers l'écriture.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Ateliers d'écriture créative et argumentative, réécriture stylistique et diversification des points de vue.",
      formativeAssessment: "Co-évaluation de versions intermédiaires de brouillons avec grille de critères.",
      summativeAssessment: "Texte abouti (récit, discours, article ou essai) démontrant discernement et maîtrise stylistique."
    },
    D: {
      name: 'Utiliser la langue',
      strands: [
        "i. Utiliser un vocabulaire, une syntaxe et des structures variés et précis",
        "ii. Employer un registre et un ton adaptés",
        "iii. Appliquer correctement les règles d'orthographe, de ponctuation et de grammaire"
      ],
      aspectsFormatted: "i. Utiliser un vocabulaire, une syntaxe et des structures variés et précis ; ii. Employer un registre et un ton adaptés ; iii. Appliquer correctement les règles d'orthographe, de ponctuation et de grammaire.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Exercices d'enrichissement lexical, révision syntaxique et perfectionnement de la langue écrite et orale.",
      formativeAssessment: "Grille d'auto-correction ciblée et relecture guidée par fiches outils.",
      summativeAssessment: "Évaluation de la correction linguistique, de la richesse lexicale et de l'adaptation du registre."
    }
  },
  // Individus et sociétés
  individus_societes: {
    A: {
      name: 'Savoir et comprendre',
      strands: [
        "i. Utiliser la terminologie appropriée",
        "ii. Démontrer sa connaissance et compréhension du contenu et des concepts à travers des descriptions et des explications"
      ],
      aspectsFormatted: "i. Utiliser la terminologie appropriée ; ii. Démontrer sa connaissance et compréhension du contenu et des concepts à travers des descriptions et des explications.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Étude critique de documents historiques/géographiques, contextualisation spatio-temporelle et synthèses.",
      formativeAssessment: "Questionnaires diagnostiques et bilans d'étape sur les concepts clés.",
      summativeAssessment: "Épreuve d'analyse documentaire et de restitution de connaissances conceptuelles."
    },
    B: {
      name: 'Investiguer',
      strands: [
        "i. Formuler une question de recherche claire et ciblée",
        "ii. Formuler et suivre un plan d'action d'investigation",
        "iii. Recueillir et consigner des informations pertinentes auprès de sources variées",
        "iv. Évaluer le processus et les résultats de l'investigation"
      ],
      aspectsFormatted: "i. Formuler une question de recherche claire et ciblée ; ii. Formuler et suivre un plan d'action d'investigation ; iii. Recueillir et consigner des informations pertinentes auprès de sources variées ; iv. Évaluer le processus et les résultats de l'investigation.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Démarche d'investigation méthodique, collecte et tri de sources documentaires, tenue d'un carnet de recherche.",
      formativeAssessment: "Validation d'étape de la problématique et du plan d'action par l'enseignant.",
      summativeAssessment: "Dossier d'investigation complet avec carnet de recherche et évaluation méthodologique."
    },
    C: {
      name: 'Communiquer',
      strands: [
        "i. Communiquer des informations et des idées en utilisant un style et une structure adaptés",
        "ii. Structurer des informations et arguments de manière cohérente",
        "iii. Citer et référencer toutes les sources utilisées (bibliographie normalisée)"
      ],
      aspectsFormatted: "i. Communiquer des informations et des idées en utilisant un style et une structure adaptés ; ii. Structurer des informations et arguments de manière cohérente ; iii. Citer et référencer toutes les sources utilisées (bibliographie normalisée).",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Présentations orales, rédaction d'articles synthétiques et création de bibliographies normalisées.",
      formativeAssessment: "Rétroaction entre pairs sur la structuration des arguments et la rigueur des citations.",
      summativeAssessment: "Rapport de recherche ou exposé final intégrant une argumentation fluide et un appareil critique conforme."
    },
    D: {
      name: 'Penser de manière critique',
      strands: [
        "i. Analyser des concepts, questions, modèles et théories",
        "ii. Évaluer des informations et arguments en identifiant les perspectives et biais",
        "iii. Synthétiser des informations pour tirer des conclusions valides",
        "iv. Évaluer différentes perspectives et leurs implications"
      ],
      aspectsFormatted: "i. Analyser des concepts, questions, modèles et théories ; ii. Évaluer des informations et arguments en identifiant les perspectives et biais ; iii. Synthétiser des informations pour tirer des conclusions valides ; iv. Évaluer différentes perspectives et leurs implications.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Débats contradictoires, déconstruction des biais documentaires et confrontation de perspectives multiples.",
      formativeAssessment: "Tableaux d'analyse critique des sources et mini-dissertations d'étape.",
      summativeAssessment: "Essai critique ou résolution de situation-problème complexe évaluant les impacts sociétaux."
    }
  },
  // Sciences
  sciences: {
    A: {
      name: 'Savoir et comprendre',
      strands: [
        "i. Expliquer des connaissances scientifiques",
        "ii. Appliquer des connaissances et compétences scientifiques pour résoudre des problèmes",
        "iii. Analyser et évaluer des informations scientifiques pour formuler des jugements"
      ],
      aspectsFormatted: "i. Expliquer des connaissances scientifiques ; ii. Appliquer des connaissances et compétences scientifiques pour résoudre des problèmes ; iii. Analyser et évaluer des informations scientifiques pour formuler des jugements.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Résolution de problèmes scientifiques contextualisés, calculs et interprétation de données empiriques.",
      formativeAssessment: "Tests formatifs d'application et auto-évaluation sur exercices corrigés.",
      summativeAssessment: "Évaluation sommative écrite combinant questions de cours, calculs et analyse de données."
    },
    B: {
      name: 'Rechercher et concevoir',
      strands: [
        "i. Formuler un problème ou une question scientifique à tester",
        "ii. Formuler une hypothèse vérifiable et la justifier",
        "iii. Décrire comment manipuler et contrôler les variables",
        "iv. Concevoir une démarche expérimentale rigoureuse"
      ],
      aspectsFormatted: "i. Formuler un problème ou une question scientifique à tester ; ii. Formuler une hypothèse vérifiable et la justifier ; iii. Décrire comment manipuler et contrôler les variables ; iv. Concevoir une démarche expérimentale rigoureuse.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Élaboration de protocoles expérimentaux, identification des variables dépendantes/indépendantes et contrôlées.",
      formativeAssessment: "Validation formative du protocole avant manipulation au laboratoire.",
      summativeAssessment: "Protocole expérimental complet et justification de la démarche scientifique."
    },
    C: {
      name: 'Traiter et évaluer',
      strands: [
        "i. Présenter et transformer des données collectées",
        "ii. Interpréter des données et expliquer des résultats à l'aide d'un raisonnement scientifique",
        "iii. Évaluer la validité de l'hypothèse et de la méthode expérimentale",
        "iv. Suggérer des améliorations et prolongements"
      ],
      aspectsFormatted: "i. Présenter et transformer des données collectées ; ii. Interpréter des données et expliquer des résultats à l'aide d'un raisonnement scientifique ; iii. Évaluer la validité de l'hypothèse et de la méthode expérimentale ; iv. Suggérer des améliorations et prolongements.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Collecte de données, construction de graphiques, analyse des incertitudes et formulation de conclusions.",
      formativeAssessment: "Correction formative des graphiques et interprétations de données intermédiaires.",
      summativeAssessment: "Rapport de laboratoire complet avec analyse critique des résultats et conclusion."
    },
    D: {
      name: 'Réfléchir sur les impacts de la science',
      strands: [
        "i. Expliquer la façon dont la science est appliquée pour résoudre des problèmes",
        "ii. Discuter et évaluer les implications éthiques, sociales, économiques et environnementales",
        "iii. Utiliser un langage scientifique approprié",
        "iv. Documenter et référencer les sources"
      ],
      aspectsFormatted: "i. Expliquer la façon dont la science est appliquée pour résoudre des problèmes ; ii. Discuter et évaluer les implications éthiques, sociales, économiques et environnementales ; iii. Utiliser un langage scientifique approprié ; iv. Documenter et référencer les sources.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Études de cas contemporaines sur les applications scientifiques et leurs retombées sociétales/environnementales.",
      formativeAssessment: "Tableaux d'argumentation et débat structuré sur les enjeux éthiques.",
      summativeAssessment: "Essai réflexif documenté sur les impacts d'une application scientifique dans le monde réel."
    }
  },
  // Mathématiques
  mathematiques: {
    A: {
      name: 'Savoir et comprendre',
      strands: [
        "i. Sélectionner et appliquer les mathématiques appropriées pour résoudre des problèmes",
        "ii. Résoudre avec succès des problèmes dans divers contextes familiers et non familiers",
        "iii. Démontrer une compréhension rigoureuse des concepts"
      ],
      aspectsFormatted: "i. Sélectionner et appliquer les mathématiques appropriées pour résoudre des problèmes ; ii. Résoudre avec succès des problèmes dans divers contextes familiers et non familiers ; iii. Démontrer une compréhension rigoureuse des concepts.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Exercices d'application directe, calculs algébriques et géométriques, résolution de situations-problèmes.",
      formativeAssessment: "Mini-tests réguliers et fiches d'auto-positionnement avec corrigés détaillés.",
      summativeAssessment: "Contrôle écrit évaluant l'exactitude des calculs et la compréhension conceptuelle."
    },
    B: {
      name: 'Enquêter sur les régularités',
      strands: [
        "i. Sélectionner et appliquer des techniques mathématiques d'investigation pour déceler des régularités",
        "ii. Formuler une conjecture cohérente avec les observations",
        "iii. Démontrer ou justifier la règle générale ou conjecture mathématique"
      ],
      aspectsFormatted: "i. Sélectionner et appliquer des techniques mathématiques d'investigation pour déceler des régularités ; ii. Formuler une conjecture cohérente avec les observations ; iii. Démontrer ou justifier la règle générale ou conjecture mathématique.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Investigation sur des suites, motifs géométriques, exploration numérique et formulation de conjectures.",
      formativeAssessment: "Point d'étape sur la méthode d'investigation et validation de la conjecture préliminaire.",
      summativeAssessment: "Tâche d'investigation mathématique complète avec formalisation et justification de la règle générale."
    },
    C: {
      name: 'Communiquer',
      strands: [
        "i. Utiliser un langage, des notations et une terminologie mathématiques appropriés",
        "ii. Employer différentes formes de représentation mathématique (tableaux, graphiques, équations)",
        "iii. Structurer des arguments mathématiques complets et cohérents",
        "iv. Organiser le travail de manière logique et soignée"
      ],
      aspectsFormatted: "i. Utiliser un langage, des notations et une terminologie mathématiques appropriés ; ii. Employer différentes formes de représentation mathématique (tableaux, graphiques, équations) ; iii. Structurer des arguments mathématiques complets et cohérents ; iv. Organiser le travail de manière logique et soignée.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Rédaction rigoureuse de démonstrations, construction de graphiques précis et verbalisation des raisonnements.",
      formativeAssessment: "Co-évaluation de copies d'élèves sur la clarté et la rigueur de la communication mathématique.",
      summativeAssessment: "Production mathématique évaluée sur la cohérence de l'argumentation et la justesse des notations."
    },
    D: {
      name: 'Appliquer les mathématiques dans des contextes réels',
      strands: [
        "i. Identifier les éléments pertinents d'une situation de la vie réelle",
        "ii. Sélectionner et appliquer des stratégies mathématiques appropriées",
        "iii. Déterminer si le résultat mathématique est plausible dans le contexte réel",
        "iv. Expliquer le degré de précision du résultat et justifier la méthode"
      ],
      aspectsFormatted: "i. Identifier les éléments pertinents d'une situation de la vie réelle ; ii. Sélectionner et appliquer des stratégies mathématiques appropriées ; iii. Déterminer si le résultat mathématique est plausible dans le contexte réel ; iv. Expliquer le degré de précision du résultat et justifier la méthode.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Modélisation de contextes concrets (finances, architecture, statistiques environnementales, mesures).",
      formativeAssessment: "Analyse critique de la vraisemblance d'un résultat numérique dans une situation concrète.",
      summativeAssessment: "Projet de modélisation mathématique appliqué à un défi du monde réel."
    }
  },
  // Arts
  arts: {
    A: {
      name: 'Connaître et comprendre',
      strands: [
        "i. Démontrer une connaissance et compréhension de la forme d'art étudiée",
        "ii. Démontrer une compréhension du rôle de l'art dans des contextes variés",
        "iii. Utiliser la terminologie artistique appropriée"
      ],
      aspectsFormatted: "i. Démontrer une connaissance et compréhension de la forme d'art étudiée ; ii. Démontrer une compréhension du rôle de l'art dans des contextes variés ; iii. Utiliser la terminologie artistique appropriée.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Analyse d'œuvres artistiques, mise en perspective historique et acquisition du vocabulaire technique.",
      formativeAssessment: "Fiches de lecture critique d'œuvres et glossaire visuel/musical.",
      summativeAssessment: "Dossier d'analyse artistique ou exposé critique contextualisé."
    },
    B: {
      name: 'Développer des compétences',
      strands: [
        "i. Démontrer l'acquisition et le développement des compétences et techniques artistiques",
        "ii. Démontrer l'application des compétences et techniques pour créer une œuvre d'art"
      ],
      aspectsFormatted: "i. Démontrer l'acquisition et le développement des compétences et techniques artistiques ; ii. Démontrer l'application des compétences et techniques pour créer une œuvre d'art.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Pratique en atelier, expérimentation de techniques plastiques/musicales et exercices d'application.",
      formativeAssessment: "Observations directes en atelier et rétroactions techniques individualisées.",
      summativeAssessment: "Création artistique démontrant la maîtrise des techniques et savoir-faire travaillés."
    },
    C: {
      name: 'Penser de manière créative',
      strands: [
        "i. Développer une intention artistique claire et originale",
        "ii. Proposer des alternatives et explorer des idées innovantes",
        "iii. Démontrer une pensée créative tout au long du processus artistique"
      ],
      aspectsFormatted: "i. Développer une intention artistique claire et originale ; ii. Proposer des alternatives et explorer des idées innovantes ; iii. Démontrer une pensée créative tout au long du processus artistique.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Tenue d'un journal de recherche créative, exploration d'idées divergentes et esquisses préparatoires.",
      formativeAssessment: "Revue du carnet d'artiste et discussion autour de l'intention créative.",
      summativeAssessment: "Projet artistique original appuyé par un carnet de démarche créative."
    },
    D: {
      name: 'Répondre et réfléchir',
      strands: [
        "i. Présenter une critique de sa propre œuvre d'art",
        "ii. Évaluer sa propre progression en tant qu'artiste",
        "iii. Réfléchir sur la manière dont l'art influence le public et la société"
      ],
      aspectsFormatted: "i. Présenter une critique de sa propre œuvre d'art ; ii. Évaluer sa propre progression en tant qu'artiste ; iii. Réfléchir sur la manière dont l'art influence le public et la société.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Bilan réflexif personnel, participation à des critiques collectives bienveillantes.",
      formativeAssessment: "Échange réflexif d'étape lors d'un vernissage intermédiaire.",
      summativeAssessment: "Texte réflexif ou présentation orale évaluant sa propre création et sa portée émotionnelle."
    }
  },
  // Design
  design: {
    A: {
      name: 'Enquêter et analyser',
      strands: [
        "i. Expliquer et justifier le besoin d'une solution",
        "ii. Identifier et prioriser la recherche primaire et secondaire",
        "iii. Analyser des produits existants",
        "iv. Développer un cahier des charges de conception détaillé"
      ],
      aspectsFormatted: "i. Expliquer et justifier le besoin d'une solution ; ii. Identifier et prioriser la recherche primaire et secondaire ; iii. Analyser des produits existants ; iv. Développer un cahier des charges de conception détaillé.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Recherche sur les besoins d'utilisateurs réels, étude concurrentielle et rédaction du cahier des charges.",
      formativeAssessment: "Validation formative du cahier des charges avant la phase de conception.",
      summativeAssessment: "Dossier d'investigation et cahier des charges de conception exhaustif."
    },
    B: {
      name: 'Développer des idées',
      strands: [
        "i. Développer une spécification de conception",
        "ii. Générer une variété d'idées de conception faisables",
        "iii. Présenter l'idée finale retenue et justifier son choix",
        "iv. Développer des plans de fabrication/dessins précis"
      ],
      aspectsFormatted: "i. Développer une spécification de conception ; ii. Générer une variété d'idées de conception faisables ; iii. Présenter l'idée finale retenue et justifier son choix ; iv. Développer des plans de fabrication/dessins précis.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Idéation graphique, modélisation 2D/3D, sélection multicritère et plans côtés.",
      formativeAssessment: "Présentation des concepts d'idées et rétroaction critique des pairs.",
      summativeAssessment: "Dossier technique de conception complet avec justification du modèle retenu."
    },
    C: {
      name: 'Créer la solution',
      strands: [
        "i. Construire un plan de fabrication logique",
        "ii. Démontrer d'excellentes compétences techniques",
        "iii. Suivre le plan et justifier les modifications",
        "iv. Créer une solution complète fonctionnelle"
      ],
      aspectsFormatted: "i. Construire un plan de fabrication logique ; ii. Démontrer d'excellentes compétences techniques ; iii. Suivre le plan et justifier les modifications ; iv. Créer une solution complète fonctionnelle.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Fabrication en atelier ou programmation, respect des règles de sécurité et ajustement du plan.",
      formativeAssessment: "Point d'étape technique en cours de prototypage.",
      summativeAssessment: "Prototype fonctionnel achevé conforme au cahier des charges."
    },
    D: {
      name: 'Évaluer',
      strands: [
        "i. Concevoir des méthodes de test fiables",
        "ii. Évaluer le succès de la solution par rapport au cahier des charges",
        "iii. Expliquer comment la solution pourrait être améliorée",
        "iv. Évaluer l'impact de la solution sur le public et l'environnement"
      ],
      aspectsFormatted: "i. Concevoir des méthodes de test fiables ; ii. Évaluer le succès de la solution par rapport au cahier des charges ; iii. Expliquer comment la solution pourrait être améliorée ; iv. Évaluer l'impact de la solution sur le public et l'environnement.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Protocole de tests d'usage, recueil des retours d'utilisateurs et analyse d'impact.",
      formativeAssessment: "Grille d'évaluation des premiers essais et formulation des ajustements.",
      summativeAssessment: "Rapport d'évaluation critique de la solution et bilan d'impact environnemental et social."
    }
  },
  // Éducation physique et à la santé
  education_physique: {
    A: {
      name: 'Savoir et comprendre',
      strands: [
        "i. Expliquer les connaissances physiques et de santé",
        "ii. Appliquer les connaissances pour concevoir et analyser des plans d'action",
        "iii. Appliquer et justifier des stratégies et techniques"
      ],
      aspectsFormatted: "i. Expliquer les connaissances physiques et de santé ; ii. Appliquer les connaissances pour concevoir et analyser des plans d'action ; iii. Appliquer et justifier des stratégies et techniques.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Étude des règles, biomécanique, tactiques de jeu et principes d'échauffement/sécurité.",
      formativeAssessment: "Questionnaires sur les règles et analyse vidéo de gestes techniques.",
      summativeAssessment: "Épreuve théorique sur les connaissances motrices et la conception de stratégies sportives."
    },
    B: {
      name: 'Planifier la performance',
      strands: [
        "i. Concevoir, expliquer et justifier un plan d'amélioration de la performance",
        "ii. Développer des objectifs réalistes et mesurables"
      ],
      aspectsFormatted: "i. Concevoir, expliquer et justifier un plan d'amélioration de la performance ; ii. Développer des objectifs réalistes et mesurables.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Élaboration d'un programme d'entraînement personnalisé avec objectifs mesurables.",
      formativeAssessment: "Validation du carnet d'entraînement par l'enseignant.",
      summativeAssessment: "Dossier de planification de la performance sportive argumenté."
    },
    C: {
      name: 'Appliquer et performer',
      strands: [
        "i. Démontrer et appliquer une variété de compétences et techniques motrices",
        "ii. Appliquer des tactiques, stratégies et concepts de mouvement",
        "iii. Participer activement en respectant les règles et la sécurité"
      ],
      aspectsFormatted: "i. Démontrer et appliquer une variété de compétences et techniques motrices ; ii. Appliquer des tactiques, stratégies et concepts de mouvement ; iii. Participer activement en respectant les règles et la sécurité.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Situations de match, parcours d'habileté motrice et enchaînements gymniques.",
      formativeAssessment: "Observation critériée continue et rétroaction technique directe.",
      summativeAssessment: "Prestation sportive sommative évaluée en situation motrice authentique."
    },
    D: {
      name: 'Réfléchir et améliorer la performance',
      strands: [
        "i. Expliquer et démontrer des stratégies d'amélioration",
        "ii. Analyser et évaluer la performance",
        "iii. Réfléchir sur ses objectifs et son engagement personnel"
      ],
      aspectsFormatted: "i. Expliquer et démontrer des stratégies d'amélioration ; ii. Analyser et évaluer la performance ; iii. Réfléchir sur ses objectifs et son engagement personnel.",
      expectedLevel: 'Niveau 5-6 attendu /8',
      activities: "Analyse vidéo de ses prestations motrices et bilan d'auto-évaluation du cycle.",
      formativeAssessment: "Auto-positionnement sur carnet de bord après chaque séance.",
      summativeAssessment: "Bilan réflexif écrit ou oral sur la progression motrice et les perspectives d'amélioration."
    }
  }
};

/**
 * Trouver la catégorie de matière correspondante
 */
export function getSubjectCategory(subjectName?: string): string {
  const s = (subjectName || '').toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  // 1. Éducation physique et à la santé (avant sciences car contient souvent "physique" ou "sante")
  if (s.includes('sport') || s.includes('eps') || s.includes('sante') || s.includes('phe') || 
      (s.includes('physiq') && (s.includes('educ') || s.includes('sante') || s.includes('corpo')))) {
    return 'education_physique';
  }
  // 2. Design / Technologie / Informatique / STEM
  if (s.includes('design') || s.includes('techno') || s.includes('inform') || s.includes('conception') || s.includes('stem')) {
    return 'design';
  }
  // 3. Mathématiques
  if (s.includes('math')) return 'mathematiques';
  // 4. Sciences (SVT, physique-chimie, biologie, etc. - exclut éducation physique)
  if (s.includes('scien') || s.includes('physiq') || s.includes('chimie') || s.includes('biolog') || s.includes('svt') || s.includes('laborat')) {
    return 'sciences';
  }
  // 5. Arts (visuels, musique, théâtre, danse)
  if (s.includes('art') || s.includes('musiq') || s.includes('theatr') || s.includes('visuel') || s.includes('danse')) {
    return 'arts';
  }
  // 6. Individus et sociétés (Histoire, Géo, Éco, Philo)
  if (s.includes('hist') || s.includes('geo') || s.includes('individ') || s.includes('societ') || s.includes('humain') || s.includes('econom') || s.includes('citoyen')) {
    return 'individus_societes';
  }
  // 7. Acquisition de langues (Anglais, Espagnol, Langue seconde / B)
  if (s.includes('anglais') || s.includes('espagnol') || s.includes('allemand') || s.includes('acquisition') || s.includes('langue seconde') || s.includes('fle') || s.includes('langue b')) {
    return 'acquisition_langues';
  }
  // 8. Langue et littérature (Français, Langue A, Littérature)
  return 'langue_litterature';
}

/**
 * Obtenir les informations officielles d'un critère standard pour une matière donnée
 */
export function getStandardIBCriterion(subject: string, criterion: 'A' | 'B' | 'C' | 'D'): StandardIBCriterionInfo {
  const cat = getSubjectCategory(subject);
  const group = STANDARD_IB_CRITERIA_BY_SUBJECT[cat] || STANDARD_IB_CRITERIA_BY_SUBJECT.langue_litterature;
  return group[criterion] || STANDARD_IB_CRITERIA_BY_SUBJECT.langue_litterature[criterion];
}

/**
 * Normalise une chaîne ou un objet vers une lettre de critère IB ('A' | 'B' | 'C' | 'D')
 */
export function normalizeCriterionLetter(val: any): 'A' | 'B' | 'C' | 'D' | null {
  if (!val) return null;
  const s = String(val).trim();
  const match = s.match(/Crit[èe]re\s*([A-D])|Criterion\s*([A-D])|^([A-D])$/i);
  if (match) {
    const letter = (match[1] || match[2] || match[3]).toUpperCase();
    if (['A', 'B', 'C', 'D'].includes(letter)) return letter as 'A' | 'B' | 'C' | 'D';
  }
  return null;
}

/**
 * Extrait la liste ordonnée unique des lettres de critères ('A', 'B', 'C', 'D')
 * depuis un tableau hétérogène (ex: ["Critère A: ...", "C", "Critère B"])
 */
export function extractCriteriaLetters(objectives: any[]): ('A' | 'B' | 'C' | 'D')[] {
  if (!Array.isArray(objectives)) return [];
  const res: ('A' | 'B' | 'C' | 'D')[] = [];
  for (const o of objectives) {
    const letter = normalizeCriterionLetter(o);
    if (letter && !res.includes(letter)) res.push(letter);
  }
  return res.sort();
}

/**
 * Formate le nom complet officiel d'un critère (ex: "Critère A: Connaissances et compréhension")
 */
export function formatCriterionFullName(subject: string, letter: 'A' | 'B' | 'C' | 'D'): string {
  const std = getStandardIBCriterion(subject, letter);
  return `Critère ${letter}: ${std.name}`;
}

/**
 * Construit une évaluation critériée IB complète et conforme (avec sous-aspects, grille, et exercices)
 * pour un critère donné, avec titre officiel ou personnalisé.
 */
export function createFallbackAssessmentForCriterion(
  criterion: 'A' | 'B' | 'C' | 'D',
  subject: string = '',
  gradeLevel: string = '',
  unitTitle: string = '',
  unitChapters: string = '',
  customName?: string
): AssessmentData {
  const std = getStandardIBCriterion(subject, criterion);
  const title = customName?.trim() || std.name;
  const strands = std.strands && std.strands.length >= 3 ? std.strands : [
    `i. Identifier et expliciter les notions fondamentales de ${title}`,
    `ii. Appliquer les démarches et méthodes adaptées`,
    `iii. Analyser et interpréter les résultats avec rigueur`,
    `iv. Réfléchir sur la validité et la portée des conclusions`
  ];

  const rubricRows = [
    { level: '1-2', descriptor: `L'élève démontre une compréhension limitée de ${title} et applique les démarches avec une aide soutenue.` },
    { level: '3-4', descriptor: `L'élève démontre une compréhension de base de ${title} et applique les démarches requises dans des contextes simples.` },
    { level: '5-6', descriptor: `L'élève démontre une bonne compréhension de ${title} et applique les méthodes avec autonomie dans des situations variées.` },
    { level: '7-8', descriptor: `L'élève démontre une compréhension approfondie et critique de ${title}, applique les démarches avec rigueur et justifie ses résultats.` }
  ];

  const topicName = unitTitle ? `« ${unitTitle} »` : "cette unité";
  const dottedLines = "\n\nRéponse :\n.........................................................\n.........................................................\n.........................................................";

  const exercises = [
    {
      title: `Tâche 1 – Mobilisation et compréhension (Critère ${criterion})`,
      content: `Dans le cadre de l'unité ${topicName}, démontre ta maîtrise des concepts liés à : ${title}.\n\n1. En t'appuyant sur les notions vues en classe, analyse la situation proposée et explicite ta démarche étape par étape.${dottedLines}`,
      criterionReference: `Critère ${criterion} : ${strands[0] ? strands[0].split('.')[0].trim() : 'i'}, ${strands[1] ? strands[1].split('.')[0].trim() : 'ii'}`,
      workspaceNeeded: true,
    },
    {
      title: `Tâche 2 – Application et résolution de problème (Critère ${criterion})`,
      content: `Résous la tâche complexe suivante liée à ${topicName} en justifiant rigoureusement ton raisonnement.\n\n2. Développe ta démarche complète et formule une conclusion critique.${dottedLines}`,
      criterionReference: `Critère ${criterion} : ${strands[2] ? strands[2].split('.')[0].trim() : 'iii'}${strands[3] ? ', ' + strands[3].split('.')[0].trim() : ''}`,
      workspaceNeeded: true,
    }
  ];

  return {
    criterion,
    criterionName: title,
    maxPoints: 8,
    strands,
    rubricRows,
    exercises
  };
}

/**
 * Synchronise strictement la liste des évaluations avec la liste cible des critères (A, B, C, D) :
 * - Si un critère est ajouté (ex: C ou D), une évaluation complète pour ce critère est créée.
 * - Si un critère est supprimé, son évaluation est automatiquement retirée.
 * - Si le titre du critère est personnalisé, son nom dans l'évaluation est mis à jour.
 */
export function syncAssessmentsWithTargetCriteria(
  existingAssessments: AssessmentData[] = [],
  targetCriteria: string[] = [],
  subject: string = '',
  gradeLevel: string = '',
  customNames: Record<string, string> = {},
  unitTitle: string = '',
  unitChapters: string = ''
): AssessmentData[] {
  const normTargets = targetCriteria
    .map(normalizeCriterionLetter)
    .filter((c): c is 'A' | 'B' | 'C' | 'D' => c !== null);
  
  // Conserver l'ordre A, B, C, D sans doublon
  const uniqueTargets: ('A' | 'B' | 'C' | 'D')[] = [];
  for (const c of ['A', 'B', 'C', 'D'] as const) {
    if (normTargets.includes(c)) uniqueTargets.push(c);
  }

  return uniqueTargets.map(crit => {
    const existing = (existingAssessments || []).find(a => normalizeCriterionLetter(a.criterion) === crit);
    const customName = customNames[crit] || (existing?.criterionName && existing.criterionName !== getStandardIBCriterion(subject, crit).name ? existing.criterionName : undefined);
    
    if (existing) {
      return {
        ...existing,
        criterion: crit,
        criterionName: customName || existing.criterionName,
      };
    }
    return createFallbackAssessmentForCriterion(crit, subject, gradeLevel, unitTitle, unitChapters, customName);
  });
}

