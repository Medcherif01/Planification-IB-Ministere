import { UnitPlan, AssessmentData } from "../types";

// ─────────────────────────────────────────────────────────────────────────────
// Proxy API helper — tous les appels Gemini passent par /api/generate (Vercel
// serverless function forcée en région US iad1) pour contourner le blocage
// de l'API Gemini depuis les régions EU (Paris).
// Utilise gemini-2.0-flash via streaming SSE pour éviter les timeouts.
// ─────────────────────────────────────────────────────────────────────────────
const callGeminiViaProxy = async (
  contents: string,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> => {
  // AbortController pour un timeout côté client de 270s (légèrement inférieur au maxDuration serveur)
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 270_000);

  try {
    const response = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents, systemInstruction, generationConfig }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));

      // Handle quota / rate-limit errors (from both OpenAI and Gemini)
      if (response.status === 429) {
        throw new Error("Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.");
      }

      const msg = errData?.message
        ? errData.message
        : errData?.details
        ? (() => {
            try { return JSON.parse(errData.details)?.error?.message || 'Erreur API'; }
            catch { return errData.details || 'Erreur API'; }
          })()
        : `HTTP ${response.status}`;
      throw new Error(msg);
    }

    const data = await response.json();
    return data.text || '';
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error("La génération a pris trop de temps. Essayez avec moins de chapitres ou réessayez.");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
};

// Helper function to detect if subject should use English generation
const isLanguageAcquisition = (subject: string): boolean => {
  const normalized = subject.toLowerCase().trim();
  // Détecte "acquisition de langue" ou "acquisition de langues" en français
  // Ou "language acquisition" en anglais
  return (normalized.includes('acquisition') && (normalized.includes('langue') || normalized.includes('language'))) ||
         normalized.includes('anglais') ||
         normalized.includes('english');
};

// Helper function to detect if subject is ART or EPS (special practical-arts mode)
const isArtOrEPS = (subject: string): boolean => {
  const normalized = subject.toLowerCase().trim();
  return (normalized.includes('arts') || 
         normalized.includes('art') || 
         normalized.includes('éducation physique') || 
         normalized.includes('eps') ||
         normalized.includes('santé')) &&
         !normalized.includes('design'); // Design a son propre mode
};

// Helper function to detect if subject is Design
const isDesignSubject = (subject: string): boolean => {
  const normalized = subject.toLowerCase().trim();
  return normalized === 'design' || normalized.startsWith('design');
};

// Get language code based on subject
// Arts/EPS use 'arts' mode (French only with practical-tasks rules)
const getGenerationLanguage = (subject: string): 'fr' | 'en' | 'arts' | 'design' => {
  if (isLanguageAcquisition(subject)) return 'en';
  if (isDesignSubject(subject)) return 'design'; // Design : 4 critères + dossier de conception
  if (isArtOrEPS(subject)) return 'arts';        // Arts/EPS : Français + tâches pratiques
  return 'fr';
};

// More aggressive JSON cleaning function that handles malformed responses
const fixJsonString = (str: string): string => {
  if (!str) return str;
  
  let result = '';
  let inString = false;
  let escape = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    const prevChar = i > 0 ? str[i - 1] : '';
    
    // Toggle string context when we hit unescaped quotes
    if (char === '"' && !escape) {
      inString = !inString;
      result += char;
      escape = false;
      continue;
    }
    
    // If we're in a string, we need to escape special characters
    if (inString) {
      if (char === '\\' && !escape) {
        // Check if this is already a valid escape sequence
        const nextChar = i < str.length - 1 ? str[i + 1] : '';
        if ('"\\/bfnrtu'.includes(nextChar)) {
          // Valid escape sequence, keep as is
          result += char;
          escape = true;
        } else {
          // Invalid escape, escape the backslash
          result += '\\\\';
          escape = false;
        }
      } else if (char === '\n' || char === '\r') {
        // Replace actual newlines with \n
        result += '\\n';
        escape = false;
      } else if (char === '\t') {
        // Replace tabs with \t
        result += '\\t';
        escape = false;
      } else if (char.charCodeAt(0) < 32) {
        // Skip other control characters
        escape = false;
      } else {
        result += char;
        escape = false;
      }
    } else {
      // Outside strings, just copy the character (unless it's a control char)
      if (char.charCodeAt(0) >= 32 || char === '\n' || char === '\r' || char === '\t') {
        result += char;
      }
      escape = false;
    }
  }
  
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// Robust JSON extractor — handles truncated, malformed and markdown-wrapped JSON
// Strategy:
//   1. Strip markdown fences and leading/trailing noise
//   2. Try to parse the raw extracted text directly (fastest path)
//   3. Apply fixJsonString (escaping fixes) and retry
//   4. If still failing (truncated response), attempt structural repair:
//      a. Remove trailing commas
//      b. Close every unclosed string with "
//      c. Close every unclosed bracket/brace in reverse order
//   5. Return "{}" only as absolute last resort
// ─────────────────────────────────────────────────────────────────────────────
const cleanJsonText = (text: string): string => {
  if (!text) return "{}";

  // ── Step 1: strip markdown fences and surrounding noise ──────────────────
  let clean = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();

  // Find the outermost JSON start
  const firstCurly  = clean.indexOf('{');
  const firstSquare = clean.indexOf('[');
  let start = -1;
  let isArray = false;

  if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
    start = firstCurly;
    isArray = false;
  } else if (firstSquare !== -1) {
    start = firstSquare;
    isArray = true;
  }

  if (start === -1) return "{}"; // no JSON structure found at all

  const closeChar = isArray ? ']' : '}';
  const end = clean.lastIndexOf(closeChar);

  let extracted = (end !== -1 && end > start)
    ? clean.substring(start, end + 1)
    : clean.substring(start); // truncated — take everything from start

  // ── Step 2: try raw parse first (happy path) ─────────────────────────────
  try {
    JSON.parse(extracted);
    return extracted;
  } catch { /* continue */ }

  // ── Step 3: apply string-level fixes and retry ───────────────────────────
  let fixed = fixJsonString(extracted);
  fixed = fixed.replace(/,(\s*[}\]])/g, '$1'); // trailing commas
  try {
    JSON.parse(fixed);
    return fixed;
  } catch { /* continue */ }

  // ── Step 4: structural repair for truncated responses ────────────────────
  // This handles the common case where Gemini's response was cut at maxOutputTokens
  try {
    let repaired = fixed;

    // Remove any trailing comma or incomplete token after the last full value
    repaired = repaired.replace(/,\s*$/, '');

    // Close any unclosed string (odd number of unescaped quotes at the end)
    const quoteCount = (repaired.match(/(?<!\\)"/g) || []).length;
    if (quoteCount % 2 !== 0) {
      repaired += '"';
    }

    // Walk through and track open brackets/braces to close them
    const stack: string[] = [];
    let inStr = false;
    let esc = false;
    for (const ch of repaired) {
      if (esc) { esc = false; continue; }
      if (ch === '\\') { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; continue; }
      if (!inStr) {
        if (ch === '{') stack.push('}');
        else if (ch === '[') stack.push(']');
        else if (ch === '}' || ch === ']') stack.pop();
      }
    }
    // Append missing closing brackets in reverse order
    while (stack.length > 0) {
      repaired += stack.pop();
    }

    // One final trailing-comma cleanup after the repairs
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

    JSON.parse(repaired);
    console.warn('⚠️ JSON was truncated — repaired successfully');
    return repaired;
  } catch (e) {
    console.warn('JSON cleaning failed after all repair attempts:', e);
  }

  return "{}";
};

// ─────────────────────────────────────────────────────────────────────────────
// Critères IB par défaut par matière (fallback si l'IA n'en génère pas assez)
// ─────────────────────────────────────────────────────────────────────────────
const DEFAULT_CRITERIA_BY_SUBJECT: Record<string, Array<{ criterion: string; criterionName: string; strands: string[] }>> = {
  'mathématiques': [
    { criterion: 'A', criterionName: 'Connaissances et compréhension', strands: ['i. Savoir des faits, concepts et techniques mathématiques', 'ii. Résoudre des problèmes mathématiques', 'iii. Appliquer des techniques et des règles mathématiques', 'iv. Décrire et expliquer des résultats mathématiques'] },
    { criterion: 'B', criterionName: 'Investigation de modèles', strands: ['i. Sélectionner et appliquer des stratégies', 'ii. Décrire des modèles comme des relations', 'iii. Vérifier et justifier des modèles', 'iv. Faire des prédictions fondées sur des modèles'] },
    { criterion: 'C', criterionName: 'Communication en mathématiques', strands: ['i. Utiliser des représentations mathématiques appropriées', 'ii. Rédiger des preuves mathématiques complètes', 'iii. Utiliser la terminologie et la notation mathématiques'] },
    { criterion: 'D', criterionName: 'Application des mathématiques dans des contextes réels', strands: ["i. Identifier les éléments mathématiques pertinents", "ii. Élaborer une stratégie de résolution", "iii. Appliquer des stratégies de résolution", "iv. Justifier le degré d'exactitude", "v. Réfléchir sur les solutions"] },
  ],
  'sciences': [
    { criterion: 'A', criterionName: 'Connaissances et compréhension', strands: ['i. Expliquer des connaissances scientifiques', 'ii. Appliquer des connaissances scientifiques', 'iii. Analyser et évaluer des informations'] },
    { criterion: 'B', criterionName: 'Recherche et conception', strands: ['i. Expliquer un problème ou une question', 'ii. Formuler une hypothèse testable', 'iii. Expliquer la méthode', 'iv. Décrire les contrôles des variables'] },
    { criterion: 'C', criterionName: 'Traitement et évaluation', strands: ['i. Présenter les données recueillies', 'ii. Analyser et interpréter les données', 'iii. Évaluer la validité des hypothèses', 'iv. Évaluer les faiblesses de la recherche'] },
    { criterion: 'D', criterionName: 'Réflexion sur les répercussions de la science', strands: ['i. Décrire une application de la science', 'ii. Analyser des répercussions de la science', 'iii. Proposer des solutions fondées sur des données scientifiques'] },
  ],
  'individus et sociétés': [
    { criterion: 'A', criterionName: 'Connaissances et compréhension', strands: ['i. Utiliser la terminologie propre à la matière', 'ii. Démontrer une connaissance et une compréhension des concepts', 'iii. Analyser des concepts dans des contextes variés'] },
    { criterion: 'B', criterionName: 'Recherche', strands: ['i. Formuler une question de recherche claire', 'ii. Sélectionner et recenser des sources', 'iii. Évaluer des sources', 'iv. Reconnaître les lacunes de la recherche'] },
    { criterion: 'C', criterionName: 'Communication', strands: ['i. Communiquer clairement ses idées', 'ii. Structurer les informations de façon cohérente', 'iii. Documenter ses sources'] },
    { criterion: 'D', criterionName: 'Réflexion critique', strands: ['i. Discuter des connaissances acquises', 'ii. Synthétiser des informations pour construire une argumentation', "iii. Réfléchir à l'impact des connaissances"] },
  ],
  'default': [
    { criterion: 'A', criterionName: 'Connaissances et compréhension', strands: ['i. Expliquer des connaissances', 'ii. Appliquer des connaissances dans des contextes variés', 'iii. Analyser et évaluer des informations'] },
    { criterion: 'B', criterionName: 'Développement des compétences', strands: ['i. Démontrer des compétences de base', 'ii. Appliquer des compétences dans des contextes variés', 'iii. Évaluer et améliorer ses compétences'] },
    { criterion: 'C', criterionName: 'Communication', strands: ['i. Communiquer de manière claire et organisée', "ii. Utiliser une terminologie appropriée", 'iii. Structurer et présenter ses idées'] },
    { criterion: 'D', criterionName: 'Réflexion et évaluation', strands: ['i. Réfléchir sur son apprentissage', "ii. Évaluer ses travaux par rapport aux critères", 'iii. Proposer des améliorations'] },
  ],
};

const DEFAULT_CRITERIA_DESIGN = [
  { criterion: 'A', criterionName: 'Rechercher et définir', strands: ['i. Expliquer et justifier la nécessité d\'une solution', 'ii. Construire un profil de client et identifier les besoins', 'iii. Analyser les produits similaires existants en utilisant les spécifications', 'iv. Développer un cahier des charges de conception'] },
  { criterion: 'B', criterionName: 'Idéer et concevoir', strands: ['i. Développer des idées de conception originales et créatives', 'ii. Présenter des esquisses et schémas annotés détaillés', 'iii. Présenter et justifier la solution de conception retenue', 'iv. Développer un planning de fabrication étape par étape'] },
  { criterion: 'C', criterionName: 'Créer la solution', strands: ['i. Construire la solution en utilisant les techniques demandées', 'ii. Démontrer les compétences techniques requises', 'iii. Suivre le planning de façon sécuritaire et organisée', 'iv. Démontrer l\'utilisation responsable des ressources'] },
  { criterion: 'D', criterionName: 'Évaluer', strands: ['i. Décrire des méthodes d\'évaluation pertinentes', 'ii. Tester et évaluer la solution selon le cahier des charges', 'iii. Évaluer l\'impact de la solution sur l\'utilisateur et l\'environnement', 'iv. Expliquer comment la solution pourrait être améliorée'] },
];

const getDefaultCriteria = (subject: string) => {
  const norm = subject.toLowerCase();
  if (norm === 'design' || norm.startsWith('design')) return DEFAULT_CRITERIA_DESIGN;
  if (norm.includes('math')) return DEFAULT_CRITERIA_BY_SUBJECT['mathématiques'];
  if (norm.includes('science')) return DEFAULT_CRITERIA_BY_SUBJECT['sciences'];
  if (norm.includes('individu') || norm.includes('société')) return DEFAULT_CRITERIA_BY_SUBJECT['individus et sociétés'];
  return DEFAULT_CRITERIA_BY_SUBJECT['default'];
};

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE OBLIGATOIRE IB : Critères avec au moins 3 sous-aspects chacun
// Modes :
//   • Design        → exactement 4 critères (A, B, C, D)
//   • Interdisciplinary → exactement 3 critères (A, B, C)
//   • Standard      → minimum 2, maximum 3 critères
// Cette fonction corrige automatiquement ce que l'IA aurait pu oublier.
// ─────────────────────────────────────────────────────────────────────────────

// Critères interdisciplinaires par défaut (A, B, C — chacun /8)
const DEFAULT_CRITERIA_INTERDISCIPLINARY = [
  {
    criterion: 'A',
    criterionName: 'Intégration disciplinaire',
    strands: [
      'i. Mobiliser les savoirs de plusieurs disciplines pour analyser le thème commun',
      'ii. Établir des liens explicites entre les concepts disciplinaires et le thème interdisciplinaire',
      'iii. Justifier la pertinence de chaque discipline dans l\'approche du problème',
    ],
  },
  {
    criterion: 'B',
    criterionName: 'Communication interdisciplinaire',
    strands: [
      'i. Communiquer de façon cohérente en intégrant les apports de toutes les disciplines',
      'ii. Utiliser un vocabulaire approprié à chaque discipline dans un contexte commun',
      'iii. Structurer et présenter la démarche interdisciplinaire de façon claire et argumentée',
    ],
  },
  {
    criterion: 'C',
    criterionName: 'Synthèse et transfert',
    strands: [
      'i. Synthétiser les apprentissages issus de toutes les disciplines en une vision cohérente',
      'ii. Évaluer l\'apport spécifique de chaque discipline à la compréhension du thème',
      'iii. Transférer la démarche interdisciplinaire à de nouveaux contextes ou problèmes',
    ],
  },
];

const enforceAssessmentsRules = (
  assessments: AssessmentData[],
  subject: string,
  isInterdisciplinary = false
): AssessmentData[] => {
  const defaults = isInterdisciplinary
    ? DEFAULT_CRITERIA_INTERDISCIPLINARY
    : getDefaultCriteria(subject);
  let result = [...assessments];

  // ── Règle 1 : chaque critère doit avoir ≥ 3 sous-aspects (strands) ─────────
  result = result.map(a => {
    if (a.strands.length >= 3) return a;
    const defCrit = defaults.find(d => d.criterion === a.criterion);
    const extraStrands = defCrit ? defCrit.strands : [
      `i. Comprendre les concepts fondamentaux de ${a.criterionName}`,
      `ii. Appliquer les connaissances dans des contextes variés`,
      `iii. Analyser et évaluer les résultats`,
      `iv. Justifier les démarches et les solutions`,
    ];
    const merged = [...a.strands];
    for (const s of extraStrands) {
      if (merged.length >= 3) break;
      if (!merged.includes(s)) merged.push(s);
    }
    console.warn(`⚠️ Critère ${a.criterion} avait ${a.strands.length} sous-aspect(s) → complété à ${merged.length}`);
    return { ...a, strands: merged };
  });

  // ── Règle 2 : chaque critère doit avoir au moins 1 exercice ───────────────
  result = result.map(a => {
    if (a.exercises.length > 0) return a;
    console.warn(`⚠️ Critère ${a.criterion} n'avait aucun exercice → ajout d'un exercice générique`);
    return {
      ...a,
      exercises: [{
        title: `Exercice — Critère ${a.criterion} (${a.strands.slice(0, 2).map(s => s.split('.')[0]).join(', ')})`,
        content: `Réponds aux questions suivantes en lien avec les aspects évalués :\n\n${a.strands.map((s, i) => `${i + 1}. En lien avec « ${s} », explique...\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n................................................................................................................................................................................................`).join('\n\n')}`,
        criterionReference: `Critère ${a.criterion} : ${a.strands.map(s => s.split('.')[0].trim()).join(', ')}`,
        workspaceNeeded: true,
      }]
    };
  });

  // ── Règle 3 : nombre de critères selon le mode ────────────────────────────
  // Design        → exactement 4 (A, B, C, D)
  // Interdisciplinary → exactement 3 (A, B, C)
  // Standard      → min 2, max 3
  const minCriteria = isDesignSubject(subject) ? 4 : isInterdisciplinary ? 3 : 2;
  const maxCriteria = isDesignSubject(subject) ? 4 : isInterdisciplinary ? 3 : 3;

  if (result.length < minCriteria) {
    const existingLetters = result.map(a => a.criterion);
    const toAdd = defaults.filter(d => !existingLetters.includes(d.criterion));
    const needed = minCriteria - result.length;
    console.warn(`⚠️ Seulement ${result.length} critère(s) → ajout de ${needed} critère(s) obligatoire(s)`);
    for (let i = 0; i < needed && i < toAdd.length; i++) {
      const d = toAdd[i];
      result.push({
        criterion: d.criterion,
        criterionName: d.criterionName,
        maxPoints: 8,
        strands: d.strands.slice(0, 4),
        rubricRows: [
          { level: '1-2', descriptor: `L'élève est capable de démontrer une compréhension limitée de ${d.criterionName.toLowerCase()}.` },
          { level: '3-4', descriptor: `L'élève est capable de démontrer une compréhension partielle de ${d.criterionName.toLowerCase()}.` },
          { level: '5-6', descriptor: `L'élève est capable de démontrer une bonne compréhension de ${d.criterionName.toLowerCase()}.` },
          { level: '7-8', descriptor: `L'élève est capable de démontrer une compréhension approfondie et nuancée de ${d.criterionName.toLowerCase()}.` },
        ],
        exercises: [{
          title: `Exercice — Critère ${d.criterion} : ${d.strands.slice(0, 3).map(s => s.split('.')[0]).join(', ')}`,
          content: `Réponds aux questions suivantes :\n\n${d.strands.slice(0, 3).map((s, idx) => `${idx + 1}. ${s}\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n................................................................................................................................................................................................`).join('\n\n')}`,
          criterionReference: `Critère ${d.criterion} : ${d.strands.slice(0, 3).map(s => s.split('.')[0].trim()).join(', ')}`,
          workspaceNeeded: true,
        }],
      });
    }
  }

  if (result.length > maxCriteria) {
    console.warn(`⚠️ ${result.length} critères → tronqué à ${maxCriteria} (règle IB)`);
    result = result.slice(0, maxCriteria);
  }

  return result;
};

const sanitizeAssessmentData = (data: any): AssessmentData | undefined => {
  // If data is missing or empty, return a safe default structure to prevent export crashes
  if (!data || typeof data !== 'object') return undefined;
  
  return {
    criterion: String(data.criterion || data.critere || "A"),
    criterionName: String(data.criterionName || data.nom_critere || "Connaissances"),
    maxPoints: Number(data.maxPoints || 8),
    // Handle potential key variations (strands vs aspects)
    strands: (Array.isArray(data.strands) ? data.strands : 
             Array.isArray(data.aspects) ? data.aspects : 
             ["i. Aspect 1", "ii. Aspect 2", "iii. Aspect 3"]).map(String),
    
    rubricRows: (Array.isArray(data.rubricRows) ? data.rubricRows : [
        { level: "1-2", descriptor: "L'élève est capable de..." },
        { level: "3-4", descriptor: "L'élève est capable de..." },
        { level: "5-6", descriptor: "L'élève est capable de..." },
        { level: "7-8", descriptor: "L'élève est capable de..." }
    ]).map((r: any) => ({
        level: String(r?.level || r?.niveau || ""),
        descriptor: String(r?.descriptor || r?.description || r?.descripteur || "")
    })),
    
    exercises: (Array.isArray(data.exercises) ? data.exercises : []).map((e: any) => ({
        title: String(e?.title || e?.titre || "Exercice"),
        content: String(e?.content || e?.contenu || "Énoncé..."),
        criterionReference: String(e?.criterionReference || e?.ref || "Critère A..."),
        workspaceNeeded: !!(e?.workspaceNeeded || true)
    }))
  };
};

// Helper to sanitize Plan data from AI
export const sanitizeUnitPlan = (plan: any, subject: string, gradeLevel: string): UnitPlan => {
  // Ensure inquiryQuestions is always an object with arrays
  const iq = plan.inquiryQuestions || plan.questions_recherche || {};
  
  // Handle assessments: could be in 'assessments' (array) or legacy 'assessmentData' (object)
  let assessments: AssessmentData[] = [];
  if (Array.isArray(plan.assessments)) {
      assessments = plan.assessments.map(sanitizeAssessmentData).filter((a: any): a is AssessmentData => !!a);
  } else if (plan.assessmentData) {
      const single = sanitizeAssessmentData(plan.assessmentData);
      if (single) assessments.push(single);
  }

  // ── RÈGLE IB OBLIGATOIRE : ≥ 2 critères, ≥ 3 sous-aspects par critère ────
  assessments = enforceAssessmentsRules(assessments, subject || plan.subject || '');
  console.log(`✅ Critères après validation IB : ${assessments.map(a => `${a.criterion}(${a.strands.length} sous-aspects)`).join(', ')}`);

  return {
    id: plan.id || Date.now().toString(),
    teacherName: plan.teacherName || "",
    title: plan.title || plan.titre || "Nouvelle Unité",
    subject: subject || plan.subject || plan.matiere || "",
    gradeLevel: gradeLevel || plan.gradeLevel || plan.niveau || "",
    duration: plan.duration || plan.duree || "10 heures",
    chapters: plan.chapters || plan.chapitres || "",
    
    keyConcept: plan.keyConcept || plan.concept_cle || "",
    relatedConcepts: Array.isArray(plan.relatedConcepts) ? plan.relatedConcepts : 
                     Array.isArray(plan.concepts_connexes) ? plan.concepts_connexes : [],
    
    globalContext: plan.globalContext || plan.contexte_mondial || "",
    statementOfInquiry: plan.statementOfInquiry || plan.enonce_recherche || "",
    
    inquiryQuestions: {
      factual: Array.isArray(iq.factual) ? iq.factual : Array.isArray(iq.factuelles) ? iq.factuelles : [],
      conceptual: Array.isArray(iq.conceptual) ? iq.conceptual : Array.isArray(iq.conceptuelles) ? iq.conceptuelles : [],
      debatable: Array.isArray(iq.debatable) ? iq.debatable : Array.isArray(iq.debat) ? iq.debat : []
    },
    
    objectives: Array.isArray(plan.objectives) ? plan.objectives : Array.isArray(plan.objectifs) ? plan.objectifs : [],
    atlSkills: Array.isArray(plan.atlSkills) ? plan.atlSkills : Array.isArray(plan.approches_apprentissage) ? plan.approches_apprentissage : [],
    
    // Check for content/contenu
    content: plan.content || plan.contenu || "",
    learningExperiences: plan.learningExperiences || plan.activites_apprentissage || plan.processus_apprentissage || "",
    
    summativeAssessment: plan.summativeAssessment || plan.evaluation_sommative || "",
    formativeAssessment: plan.formativeAssessment || plan.evaluation_formative || "",
    differentiation: plan.differentiation || plan.differenciation || "",
    resources: plan.resources || plan.ressources || "",
    
    reflection: {
      prior: plan.reflection?.prior || plan.reflexion?.avant || "",
      during: plan.reflection?.during || plan.reflexion?.pendant || "",
      after: plan.reflection?.after || plan.reflexion?.apres || ""
    },
    
    generatedAssessmentDocument: plan.generatedAssessmentDocument || "",
    assessmentData: sanitizeAssessmentData(plan.assessmentData || plan.donnees_evaluation),
    assessments: assessments
  };
};

export const generateStatementOfInquiry = async (
  keyConcept: string,
  relatedConcepts: string[],
  globalContext: string,
  subject?: string,
  gradeLevel?: string,
  unitTitle?: string
): Promise<string[]> => {
  const lang = subject ? getGenerationLanguage(subject) : 'fr';
  try {
    const relatedStr = relatedConcepts.join(", ");
    
    const prompt = lang === 'en'
      ? `
        You are an expert IB MYP (Middle Years Programme) curriculum coordinator with extensive experience writing Statements of Inquiry.

        Generate 3 DISTINCT and HIGH-QUALITY "Statements of Inquiry" for the following MYP unit:

        Subject: ${subject || 'Language Acquisition'}
        ${gradeLevel ? `Grade Level: ${gradeLevel}` : ''}
        ${unitTitle ? `Unit Title: ${unitTitle}` : ''}
        Key Concept: ${keyConcept}
        Related Concepts: ${relatedStr}
        Global Context: ${globalContext}

        ══════════════════════════════════════════════════════
        IB MYP RULES FOR A VALID STATEMENT OF INQUIRY:
        ══════════════════════════════════════════════════════
        1. STRUCTURE: A valid SOI MUST explicitly integrate ALL THREE elements:
           • The KEY CONCEPT (abstract, transferable idea)
           • At least ONE RELATED CONCEPT (more specific to the discipline)
           • The GLOBAL CONTEXT (real-world relevance lens)

        2. FORM: Write a COMPLETE, GRAMMATICALLY CORRECT SENTENCE (not a question, not a fragment).
           • Typically 15–30 words
           • Can use a subordinate clause to link the elements naturally
           • Avoid generic or vague language — be specific and thought-provoking

        3. TRANSFERABILITY: The statement must be transferable BEYOND the specific topic.
           • Do NOT mention specific chapter titles, textbook names, or narrow content
           • The statement should provoke genuine intellectual inquiry
           • A student should be able to explore it across different contexts

        4. GRAMMATICAL PATTERNS (choose from these proven IB structures):
           • "How [related concept] shapes/influences [key concept] within [global context]..."
           • "The [key concept] of [related concept] reflects/reveals [global context]..."
           • "[Key concept] expressed through [related concept] can transform our understanding of [global context]..."
           • "Understanding [key concept] through [related concept] enables us to [global context goal]..."

        5. QUALITY CHECKS (each SOI must pass ALL):
           ✓ Contains the key concept (or its clear synonym)
           ✓ References the related concept(s)
           ✓ Connects to the global context theme
           ✓ Is a declarative statement (not a question)
           ✓ Is meaningful and academically rigorous
           ✓ Is DIFFERENT from the other 2 options (vary structure and emphasis)

        ══════════════════════════════════════════════════════
        OUTPUT FORMAT:
        Return ONLY 3 statements, one per line, NO numbering, NO bullet points, NO extra text.
        Each statement on its own line. Nothing else.
        ══════════════════════════════════════════════════════
      `
      : `
        Tu es un coordonnateur expert du Programme d'Éducation Intermédiaire (PEI) de l'IB, spécialisé dans la rédaction d'Énoncés de recherche conformes aux exigences du PEI.

        Génère 3 ÉNONCÉS DE RECHERCHE DISTINCTS et DE HAUTE QUALITÉ pour l'unité PEI suivante :

        Matière : ${subject || 'Général'}
        ${gradeLevel ? `Niveau : ${gradeLevel}` : ''}
        ${unitTitle ? `Titre de l'unité : ${unitTitle}` : ''}
        Concept clé : ${keyConcept}
        Concepts connexes : ${relatedStr}
        Contexte mondial : ${globalContext}

        ══════════════════════════════════════════════════════
        RÈGLES IB PEI POUR UN ÉNONCÉ DE RECHERCHE VALIDE :
        ══════════════════════════════════════════════════════
        1. STRUCTURE OBLIGATOIRE : Chaque énoncé DOIT intégrer explicitement LES TROIS éléments :
           • Le CONCEPT CLÉ (idée abstraite et transférable)
           • Au moins UN CONCEPT CONNEXE (plus spécifique à la discipline)
           • Le CONTEXTE MONDIAL (ancrage dans la réalité contemporaine)

        2. FORME : Rédiger une PHRASE COMPLÈTE ET GRAMMATICALEMENT CORRECTE (pas une question, pas un fragment).
           • Typiquement 15 à 30 mots
           • Peut utiliser une proposition subordonnée pour relier naturellement les éléments
           • Éviter le langage générique — être spécifique et stimulant intellectuellement

        3. TRANSFÉRABILITÉ : L'énoncé doit être transférable AU-DELÀ du sujet spécifique.
           • NE PAS mentionner des titres de chapitres spécifiques, des noms de manuels ou du contenu étroit
           • L'énoncé doit provoquer une véritable réflexion intellectuelle
           • Un élève doit pouvoir l'explorer dans différents contextes

        4. STRUCTURES GRAMMATICALES RECOMMANDÉES (choisir parmi ces modèles IB éprouvés) :
           • "La [concept connexe] du/de la [concept clé] révèle/façonne [contexte mondial]..."
           • "Comprendre [concept clé] à travers [concept connexe] permet de [objectif contexte mondial]..."
           • "Le [concept clé], exprimé par [concept connexe], transforme notre rapport au [contexte mondial]..."
           • "La façon dont [concept connexe] influence [concept clé] détermine [contexte mondial]..."
           • "[Concept clé] et [concept connexe] se renforcent mutuellement pour [contexte mondial]..."

        5. VÉRIFICATIONS QUALITÉ (chaque énoncé doit satisfaire TOUTES ces conditions) :
           ✓ Contient le concept clé (ou son synonyme clair)
           ✓ Fait référence aux concepts connexes
           ✓ Est ancré dans le contexte mondial
           ✓ Est une phrase déclarative (pas une question)
           ✓ Est significatif et académiquement rigoureux
           ✓ Est DIFFÉRENT des 2 autres options (varier la structure et l'accentuation)
           ✓ EST FORMULÉ SPÉCIFIQUEMENT POUR CETTE UNITÉ (pas générique)

        ══════════════════════════════════════════════════════
        FORMAT DE SORTIE :
        Retourner UNIQUEMENT 3 énoncés, un par ligne, SANS numérotation, SANS puces, SANS texte supplémentaire.
        Chaque énoncé sur sa propre ligne. Rien d'autre.
        ══════════════════════════════════════════════════════
      `;

    const text = await callGeminiViaProxy(prompt);
    const lines = text.split('\n')
      .filter(line => line.trim().length > 0)
      .map(l => l.replace(/^[\d\.\-\*•]+\s*/, '').trim())
      .filter(l => l.length > 10); // Filtrer les lignes trop courtes
    
    // S'assurer qu'on a au moins 1 résultat
    if (lines.length === 0) {
      const defaultMsg = lang === 'en'
        ? "Understanding develops through inquiry and reflection within a global context."
        : "La compréhension se développe à travers la recherche et la réflexion dans un contexte mondial.";
      return [defaultMsg];
    }
    
    return lines.slice(0, 3); // Maximum 3 options
  } catch (error) {
    console.error("Error generating SOI:", error);
    const errorMsg = lang === 'en' 
      ? "Error generating suggestions."
      : "Erreur lors de la génération des suggestions.";
    return [errorMsg];
  }
};

export const generateInquiryQuestions = async (
  soi: string, 
  subject?: string,
  keyConcept?: string,
  relatedConcepts?: string[]
): Promise<{ factual: string[], conceptual: string[], debatable: string[] }> => {
  try {
    const lang = subject ? getGenerationLanguage(subject) : 'fr';
    const relatedStr = relatedConcepts ? relatedConcepts.join(", ") : '';
    
    const prompt = lang === 'en'
      ? `
        You are an expert IB MYP curriculum coordinator.

        Generate IB MYP INQUIRY QUESTIONS for the following unit:
        Statement of Inquiry: "${soi}"
        ${keyConcept ? `Key Concept: ${keyConcept}` : ''}
        ${relatedStr ? `Related Concepts: ${relatedStr}` : ''}
        ${subject ? `Subject: ${subject}` : ''}

        ══════════════════════════════════════════════════════
        IB MYP INQUIRY QUESTION REQUIREMENTS:
        ══════════════════════════════════════════════════════

        Generate EXACTLY:
        • 2 FACTUAL QUESTIONS — Questions with clear, definite answers based on facts or definitions
          Examples: "What is...?", "Who...?", "When did...?", "What are the characteristics of...?"
          These questions assess knowledge and understanding of specific content.

        • 2 CONCEPTUAL QUESTIONS — Questions that explore deeper understanding and relationships
          Examples: "How does...?", "Why does...?", "In what ways...?", "How are ... and ... related?"
          These questions connect concepts and promote analytical thinking.

        • 2 DEBATABLE QUESTIONS — Open-ended questions with no single correct answer
          Examples: "To what extent...?", "Is it ever justified to...?", "Should...?"
          These questions promote critical thinking, multiple perspectives, and argumentation.

        QUALITY RULES:
        ✓ Questions must directly relate to the Statement of Inquiry
        ✓ Each category must have questions of DIFFERENT difficulty levels
        ✓ Questions must be age-appropriate and academically rigorous
        ✓ Debatable questions must genuinely allow for MULTIPLE valid perspectives
        ✓ Questions should promote inquiry and deep thinking (not mere recall)

        Return ONLY valid JSON with these EXACT KEYS:
        {
          "factual": ["question 1?", "question 2?"],
          "conceptual": ["question 1?", "question 2?"],
          "debatable": ["question 1?", "question 2?"]
        }
        Return ONLY the JSON. No extra text.
      `
      : `
        Tu es un coordonnateur expert du PEI (Programme d'Éducation Intermédiaire) de l'IB.

        Génère des QUESTIONS DE RECHERCHE IB PEI pour l'unité suivante :
        Énoncé de recherche : "${soi}"
        ${keyConcept ? `Concept clé : ${keyConcept}` : ''}
        ${relatedStr ? `Concepts connexes : ${relatedStr}` : ''}
        ${subject ? `Matière : ${subject}` : ''}

        ══════════════════════════════════════════════════════
        EXIGENCES IB PEI POUR LES QUESTIONS DE RECHERCHE :
        ══════════════════════════════════════════════════════

        Génère EXACTEMENT :
        • 2 QUESTIONS FACTUELLES — Questions avec des réponses claires et définies, basées sur des faits ou des définitions
          Exemples : "Qu'est-ce que...?", "Qui...?", "Quand...?", "Quelles sont les caractéristiques de...?"
          Ces questions évaluent les connaissances et la compréhension du contenu spécifique.

        • 2 QUESTIONS CONCEPTUELLES — Questions qui explorent une compréhension plus profonde et les relations
          Exemples : "Comment...?", "Pourquoi...?", "De quelle manière...?", "Quel est le rapport entre... et...?"
          Ces questions relient les concepts et favorisent la réflexion analytique.

        • 2 QUESTIONS INVITANT AU DÉBAT — Questions ouvertes sans réponse unique correcte
          Exemples : "Dans quelle mesure...?", "Est-il jamais justifié de...?", "Devrait-on...?"
          Ces questions favorisent la pensée critique, les perspectives multiples et l'argumentation.

        RÈGLES DE QUALITÉ :
        ✓ Les questions doivent être directement liées à l'Énoncé de recherche
        ✓ Chaque catégorie doit avoir des questions de NIVEAUX DE DIFFICULTÉ DIFFÉRENTS
        ✓ Les questions doivent être adaptées à l'âge et académiquement rigoureuses
        ✓ Les questions invitant au débat doivent permettre PLUSIEURS perspectives valides
        ✓ Les questions doivent favoriser l'enquête et la réflexion profonde (pas la simple mémorisation)
        ✓ Formuler les questions EN LIEN DIRECT avec cette unité spécifique (pas des questions génériques)

        Retourne UNIQUEMENT un JSON valide avec ces CLÉS EXACTES (en anglais) :
        {
          "factual": ["question 1 ?", "question 2 ?"],
          "conceptual": ["question 1 ?", "question 2 ?"],
          "debatable": ["question 1 ?", "question 2 ?"]
        }
        Retourne UNIQUEMENT le JSON. Pas de texte supplémentaire.
      `;

    const rawText = await callGeminiViaProxy(prompt, undefined, { responseMimeType: 'application/json' });
    const jsonText = cleanJsonText(rawText);
    const parsed = JSON.parse(jsonText);
    
    // Validation: ensure all three arrays are present
    return {
      factual: Array.isArray(parsed.factual) ? parsed.factual : [],
      conceptual: Array.isArray(parsed.conceptual) ? parsed.conceptual : [],
      debatable: Array.isArray(parsed.debatable) ? parsed.debatable : []
    };
  } catch (error) {
    console.error("Error generating questions:", error);
    return { factual: [], conceptual: [], debatable: [] };
  }
};

export const generateLearningExperiences = async (plan: UnitPlan): Promise<string> => {
  try {
    const lang = getGenerationLanguage(plan.subject);
    
    const prompt = lang === 'en'
      ? `
        For an MYP unit titled "${plan.title}" with the statement of inquiry "${plan.statementOfInquiry}",
        suggest 3 specific and engaging learning activities.
        Include teaching strategies.
        Respond in English, bullet list format.
      `
      : `
        Pour une unité du PEI intitulée "${plan.title}" avec l'énoncé de recherche "${plan.statementOfInquiry}",
        suggère 3 activités d'apprentissage spécifiques et engageantes.
        Inclue les stratégies d'enseignement.
        Réponds en Français, format liste à puces.
      `;
    
    return await callGeminiViaProxy(prompt);
  } catch (error) {
    const errorMsg = getGenerationLanguage(plan.subject) === 'en'
      ? "Generation error."
      : "Erreur de génération.";
    return errorMsg;
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPTS IB PAR MATIÈRE — Référentiel officiel PEI
// ─────────────────────────────────────────────────────────────────────────────
const IB_CONCEPTS_BY_SUBJECT: Record<string, { keyConcepts: string[]; relatedConcepts: string[] }> = {
  'mathématiques': {
    keyConcepts: ['Forme', 'Logique', 'Relations'],
    relatedConcepts: ['Approximation', 'Changement', 'Équivalence', 'Espace', 'Généralisation', 'Modèles', 'Quantité', 'Représentation', 'Séries', 'Simplification', 'Systèmes', 'Validité']
  },
  'sciences': {
    keyConcepts: ['Changement', 'Relations', 'Systèmes'],
    relatedConcepts: ['Conséquences', 'Énergie', 'Environnement', 'Équilibre', 'Fonction', 'Forme', 'Interaction', 'Modèles', 'Mouvement', 'Preuves', 'Schémas', 'Transformation']
  },
  'individus et sociétés': {
    keyConcepts: ['Changement', 'Interactions mondiales', 'Systèmes', 'Temps, lieu et espace'],
    relatedConcepts: ['Causalité', 'Choix', 'Culture', 'Diversité', 'Durabilité', 'Équité', 'Échelle', 'Gestion', 'Mondialisation', 'Pouvoir', 'Processus', 'Réseaux', 'Schémas']
  },
  'langue et littérature': {
    keyConcepts: ['Communication', 'Créativité', 'Liens', 'Perspective'],
    relatedConcepts: ['But', 'Cadre', 'Contexte', 'Expression personnelle', 'Genre', 'Interpellation du destinataire', 'Intertextualité', 'Personnage', 'Point de vue', 'Structure', 'Style', 'Thème']
  },
  'acquisition de langues': {
    keyConcepts: ['Communication', 'Connexions', 'Créativité', 'Culture'],
    relatedConcepts: ['But', 'Contexte', 'Conventions', 'Forme', 'Fonction', 'Sens', 'Message', 'Schémas', 'Choix des mots', 'Public', 'Empathie', 'Idiome', 'Point de vue', 'Argument', 'Déduction', 'Biais', 'Thème', 'Voix']
  },
  'arts': {
    keyConcepts: ['Changement', 'Communication', 'Esthétique', 'Identité'],
    relatedConcepts: ['Composition', 'Culture visuelle', 'Expression', 'Genre', 'Innovation', 'Interprétation', 'Jeu', 'Limites', 'Narration', 'Présentation', 'Public', 'Représentation', 'Rôle', 'Structure', 'Style']
  },
  'design': {
    keyConcepts: ['Communautés', 'Communication', 'Développement', 'Systèmes'],
    relatedConcepts: ['Adaptation', 'Collaboration', 'Durabilité', 'Ergonomie', 'Évaluation', 'Fonction', 'Forme', 'Innovation', 'Invention', 'Marchés', 'Perspective', 'Ressources']
  },
  'éducation physique': {
    keyConcepts: ['Changement', 'Communication', 'Relations', 'Systèmes'],
    relatedConcepts: ['Adaptation', 'Équilibre', 'Énergie', 'Environnement', 'Fonction', 'Interaction', 'Mouvement', 'Schémas', 'Perspective', 'Réflexion', 'Stratégie', 'Technique']
  },
};

/**
 * Retourne les concepts IB autorisés pour une matière donnée
 */
const getIBConceptsForSubject = (subject: string): { keyConcepts: string[]; relatedConcepts: string[] } => {
  const norm = subject.toLowerCase().trim();
  if (norm.includes('math')) return IB_CONCEPTS_BY_SUBJECT['mathématiques'];
  if (norm.includes('science') || norm.includes('bio') || norm.includes('chimie') || norm.includes('physique')) return IB_CONCEPTS_BY_SUBJECT['sciences'];
  if (norm.includes('individu') || norm.includes('société') || norm.includes('histoire') || norm.includes('géo')) return IB_CONCEPTS_BY_SUBJECT['individus et sociétés'];
  if (norm.includes('langue et littérature') || norm.includes('français') && !norm.includes('acquisition')) return IB_CONCEPTS_BY_SUBJECT['langue et littérature'];
  if (norm.includes('acquisition') || norm.includes('anglais') || norm.includes('english')) return IB_CONCEPTS_BY_SUBJECT['acquisition de langues'];
  if (norm.includes('art') && !norm.includes('design')) return IB_CONCEPTS_BY_SUBJECT['arts'];
  if (norm === 'design' || norm.startsWith('design')) return IB_CONCEPTS_BY_SUBJECT['design'];
  if (norm.includes('physique') && norm.includes('santé') || norm.includes('eps')) return IB_CONCEPTS_BY_SUBJECT['éducation physique'];
  // Fallback: retourne les concepts les plus génériques
  return {
    keyConcepts: ['Changement', 'Relations', 'Systèmes', 'Communication'],
    relatedConcepts: ['Adaptation', 'Équilibre', 'Interaction', 'Modèles', 'Représentation', 'Transformation']
  };
};

/**
 * Génère la règle de concepts spécifique à inclure dans le prompt selon la matière
 */
const getConceptsRuleForSubject = (subject: string): string => {
  const concepts = getIBConceptsForSubject(subject);
  return `
⚠️ LOI ABSOLUE — CONCEPTS IB OFFICIELS POUR "${subject.toUpperCase()}" (NON NÉGOCIABLE) ⚠️
Tu DOIS choisir les concepts UNIQUEMENT parmi les listes officielles IB ci-dessous.
INTERDIT d'inventer d'autres concepts ou d'utiliser des concepts d'une autre matière.

CONCEPTS CLÉS autorisés pour cette matière (choix obligatoire parmi cette liste) :
${concepts.keyConcepts.map(c => `  • ${c}`).join('\n')}

CONCEPTS CONNEXES autorisés pour cette matière (choix obligatoire parmi cette liste) :
${concepts.relatedConcepts.map(c => `  • ${c}`).join('\n')}

RÈGLE DE L'ÉNONCÉ DE RECHERCHE :
• Formule : [Concept Clé] + [Concepts Connexes] + [Contexte Mondial]
• L'énoncé DOIT être une phrase déclarative mémorable qui NE CITE PAS le sujet spécifique
• Exemple valide pour Maths : "La logique appliquée à la simplification des quantités révèle comment les modèles mathématiques nous aident à comprendre les relations entre les êtres au sein des communautés."
• Exemple valide pour Sciences : "Les relations entre systèmes naturels, révélées par les modèles scientifiques, permettent de comprendre les conséquences des transformations environnementales."
• Exemple INVALIDE : "Les fractions sont des nombres importants en mathématiques." (trop spécifique, cite le sujet)
• Exemple INVALIDE : "Pourquoi les systèmes changent-ils ?" (c'est une question, pas une déclaration)
`;
};

// Shared System Prompt for consistent generation (French)
const SYSTEM_INSTRUCTION_FULL_PLAN_FR = `
Tu es un expert pédagogique du Programme d'Éducation Intermédiaire (PEI) de l'IB.
Tu dois générer un Plan d'Unité complet ET une série d'Évaluations Critériées détaillées en Français.

❗❗❗ LOI ABSOLUE N°0 — ÉNONCÉ DE RECHERCHE IB PEI (NON NÉGOCIABLE) ❗❗❗
Le champ "statementOfInquiry" est L'ÉLÉMENT LE PLUS IMPORTANT du plan d'unité PEI.
Il DOIT respecter TOUTES ces règles IB :

RÈGLES DE L'ÉNONCÉ DE RECHERCHE :
1. STRUCTURE OBLIGATOIRE : L'énoncé DOIT intégrer explicitement LES TROIS éléments suivants :
   • Le CONCEPT CLÉ choisi parmi la liste officielle de la matière
   • Au moins UN CONCEPT CONNEXE choisi parmi la liste officielle de la matière
   • Le CONTEXTE MONDIAL (ex: Identités et relations, Orientation dans l'espace et le temps, Expression personnelle et culturelle, Innovation scientifique et technique, Mondialisation et durabilité, Équité et développement)

2. FORMULE OBLIGATOIRE : [Concept Clé] + [Concepts Connexes] + [Piste d'exploration du Contexte Mondial]
   • Phrase déclarative COMPLÈTE (pas une question, pas un fragment) — 15 à 35 mots
   • Mémorable et transférable — NE CITE PAS le sujet spécifique (ex: ne pas mentionner "fractions", "équations", "cellules", etc.)
   • Exemple : "La structure influence la fonction" est valide — "Le squelette aide à bouger" ne l'est pas

3. TRANSFÉRABILITÉ : L'énoncé doit être transférable au-delà du contenu spécifique
   • Ne PAS mentionner des noms de chapitres spécifiques, de formules ou de notions trop précises
   • Doit pouvoir être exploré dans plusieurs contextes disciplinaires

4. STRUCTURES GRAMMATICALES RECOMMANDÉES (modèles IB) :
   • "La [concept connexe] du/de la [concept clé] révèle [contexte mondial]..."
   • "Comprendre [concept clé] à travers [concept connexe] permet de [objectif du contexte mondial]..."
   • "Le [concept clé], exprimé par [concept connexe], transforme notre rapport au [contexte mondial]..."
   • "La manière dont [concept connexe] façonne [concept clé] détermine [contexte mondial]..."

5. EXEMPLES VALIDES :
   ✅ "La représentation des systèmes naturels révèle comment les transformations façonnent notre compréhension de la durabilité mondiale."
   ✅ "La relation entre expression et contexte permet de comprendre comment les identités se construisent et évoluent dans le temps."
   ✅ "Comprendre les modèles de changement à travers leurs représentations aide à analyser les défis de la mondialisation."

6. EXEMPLES INVALIDES :
   ❌ "Les équations du premier degré sont importantes en mathématiques." (trop spécifique, cite le sujet)
   ❌ "La photosynthèse est un processus biologique." (pas d'intégration des trois éléments)
   ❌ "Pourquoi les systèmes changent-ils ?" (c'est une question, pas une déclaration)

❗❗❗ LOI ABSOLUE N°1 — CRITÈRES OBLIGATOIRES (NON NÉGOCIABLE) ❗❗❗
CHAQUE UNITÉ DOIT CONTENIR EXACTEMENT 2 CRITÈRES D'ÉVALUATION dans le tableau "assessments".
- Sélectionne les 2 critères les PLUS PERTINENTS pour le contenu de cette unité
- JAMAIS 1 seul critère — JAMAIS 3 ou 4 — TOUJOURS exactement 2
- Sur le semestre (2 unités), les 4 critères A, B, C, D doivent tous être couverts
- Exemple : unité algèbre → Critères A + C | unité géométrie → Critères A + D
- Si tu génères ≠ 2 critères dans "assessments", ta réponse est INVALIDE et rejetée

❗❗❗ LOI ABSOLUE N°2 — SOUS-ASPECTS OBLIGATOIRES (NON NÉGOCIABLE) ❗❗❗
CHAQUE CRITÈRE doit lister AU MINIMUM 3 sous-aspects dans le champ "strands".
- Les sous-aspects sont numérotés i., ii., iii., iv., v.
- Ils N'ONT PAS besoin d'être consécutifs : i, iii, v est valide
- Un exercice PEUT couvrir 2–3 sous-aspects simultanément
- Si tu génères < 3 sous-aspects pour un critère, ta réponse est INVALIDE
- Exemple VALIDE   : "strands": ["i. Sélectionner", "iii. Résoudre", "iv. Expliquer"]
- Exemple INVALIDE : "strands": ["i. Aspect", "ii. Aspect"]  ← seulement 2, refusé

⚠️ SÉLECTION DES CRITÈRES :
- Choisis les critères les PLUS CONVENABLES selon :
  * Le contenu spécifique de l'unité
  * Les objectifs d'apprentissage visés
  * Les compétences à développer
  * La cohérence pédagogique
- Assure-toi que les critères choisis sont VRAIMENT pertinents pour cette unité
- Pense à la complémentarité avec d'autres unités du semestre

⚠️ DURÉE DES ÉVALUATIONS IB :
- Chaque évaluation critériée doit être conçue pour UNE DURÉE DE 30 MINUTES
- Les exercices doivent être réalisables en 30 minutes maximum
- Adapte le nombre et la complexité des exercices à cette contrainte de temps

RÈGLES ABSOLUES - FORMAT JSON :
1. Utilise UNIQUEMENT les CLÉS JSON EN ANGLAIS ci-dessous. NE LES TRADUIS PAS.
2. Le CONTENU (les valeurs) doit être en FRANÇAIS.
3. Ne laisse AUCUN champ vide. Remplis TOUTES les sections.
4. ⚠️ CRITIQUE - VALIDITÉ JSON :
   - Assure-toi que le JSON est PARFAITEMENT VALIDE
   - Pas de virgules trainantes avant les accolades fermantes
   - Échappe correctement les guillemets dans les chaînes avec \"
   - Échappe correctement les retours à la ligne avec \n
   - N'utilise PAS de sauts de ligne réels dans les chaînes JSON
   - Teste mentalement la validité du JSON avant de répondre

CHAMPS OBLIGATOIRES ET DÉTAILLÉS :
- "learningExperiences": Détaille les ACTIVITÉS D'APPRENTISSAGE et les STRATÉGIES D'ENSEIGNEMENT (ex: Apprentissage par enquête, travail collaboratif...).
- "formativeAssessment": Précise les méthodes d'ÉVALUATION FORMATIVE (ex: tickets de sortie, quiz rapide, observation...).
- "differentiation": Précise les stratégies de DIFFÉRENCIATION (Contenu, Processus, Produit) pour les élèves en difficulté et avancés.

RÈGLES SPÉCIFIQUES POUR LES EXERCICES (CRUCIAL):
1. CHAQUE CRITÈRE doit évaluer AU MINIMUM 3 sous-aspects différents (i, ii, iii, iv, ou v)
2. Les sous-aspects ne doivent PAS être nécessairement consécutifs
   - ✅ VALIDE: i, iii, v (pas consécutifs mais pertinents)
   - ✅ VALIDE: ii, iv, v
   - ❌ INVALIDE: seulement i, ii (moins de 3)
3. Un exercice PEUT et DEVRAIT évaluer 2-3 sous-aspects simultanément si pertinent
   - Exemple: "Critère A : i. et iii." (un exercice évalue 2 sous-aspects)
   - Exemple: "Critère B : ii., iv. et v." (un exercice évalue 3 sous-aspects)
4. VARIE les types d'exercices pour couvrir différents niveaux cognitifs
5. La clé "criterionReference" DOIT indiquer TOUS les aspects évalués par l'exercice
6. CONÇOIS chaque évaluation pour être complétée en 30 MINUTES maximum
7. LAISSE SUFFISAMMENT D'ESPACE de réponse pour les élèves dans chaque exercice

GESTION DES RESSOURCES DANS LES EXERCICES :
- Si l'exercice nécessite l'analyse d'un texte, FOURNIS LE TEXTE complet dans le champ "content".
- Si l'exercice nécessite une image, écris EXPLICITEMENT : "[Insérer Image/Schéma ici : description détaillée]".
- AJOUTE TOUJOURS des lignes de réponse avec pointillés pour les élèves :
  * Après chaque question, ajoute : "\n\nRéponse :\n" suivi de 5-8 lignes de pointillés
  * Format des lignes : "................................................................................................................................................................................................"
  * Adapte le nombre de lignes selon la complexité de la question
  * Ceci garantit que les élèves ont suffisamment d'espace pour écrire leurs réponses

Structure JSON attendue :
{
  "title": "Titre en Français",
  "duration": "XX heures",
  "chapters": "- Chapitre 1: ...\n- Chapitre 2: ...\n- Chapitre 3: ...",
  "keyConcept": "Un concept clé",
  "relatedConcepts": ["Concept 1", "Concept 2"],
  "globalContext": "Un contexte mondial",
  "statementOfInquiry": "Phrase complète...",
  "inquiryQuestions": {
    "factual": ["Q1", "Q2"],
    "conceptual": ["Q1", "Q2"],
    "debatable": ["Q1", "Q2"]
  },
  "objectives": ["Critère A: ...", "Critère B: ..."],
  "atlSkills": ["Compétence 1...", "Compétence 2..."],
  "content": "Contenu détaillé...",
  "learningExperiences": "Activités ET stratégies d'enseignement détaillées...",
  "summativeAssessment": "Description de la tâche finale...",
  "formativeAssessment": "Description des évaluations formatives...",
  "differentiation": "Stratégies de différenciation...",
  "resources": "Livres, liens...",
  "reflection": {
     "prior": "Connaissances préalables...",
     "during": "Engagement...",
     "after": "Résultats..."
  },
  "assessments": [
    {
       "criterion": "A",
       "criterionName": "Connaissances",
       "maxPoints": 8,
       "strands": ["i. sélectionner...", "iii. résoudre...", "iv. expliquer..."],
       "rubricRows": [
          { "level": "1-2", "descriptor": "..." },
          { "level": "3-4", "descriptor": "..." },
          { "level": "5-6", "descriptor": "..." },
          { "level": "7-8", "descriptor": "..." }
       ],
       "exercises": [
          {
             "title": "Exercice 1 (Aspects i et iii)",
             "content": "Question qui évalue à la fois i. et iii...",
             "criterionReference": "Critère A : i. sélectionner et iii. résoudre",
             "workspaceNeeded": true
          },
          {
             "title": "Exercice 2 (Aspect iv)",
             "content": "Question qui évalue iv...",
             "criterionReference": "Critère A : iv. expliquer",
             "workspaceNeeded": true
          }
       ]
    }
  ]
}

⚠️ RAPPEL FINAL - RÈGLES DES CRITÈRES :
- STANDARD : 2 critères par unité (choisis les PLUS CONVENABLES selon le contenu)
- EXCEPTIONNEL : 3 critères (SEULEMENT si l'unité doit OBLIGATOIREMENT être évaluée par ces 3 critères - c'est le PIRE DES CAS)
- JAMAIS : 4 critères dans une seule unité
- IMPORTANT : Sur 2 unités (semestre), les 4 critères (A, B, C, D) doivent être couverts
- MINIMUM 3 sous-aspects par critère (ex: i, iii, v ou ii, iv, v)
- Les sous-aspects peuvent être NON-CONSÉCUTIFS selon les besoins
- Un exercice PEUT évaluer 2-3 sous-aspects simultanément
- Chaque évaluation doit être faisable en 30 MINUTES
`;

// Shared System Prompt for Arts/EPS generation (French only, practical tasks)
const SYSTEM_INSTRUCTION_FULL_PLAN_ARTS = `
Tu es un expert coordinateur pédagogique du Programme d'Éducation Intermédiaire (PEI) de l'IB, spécialisé en Arts visuels et en Éducation Physique et à la Santé.
Tu dois générer un plan d'unité complet EN FRANÇAIS ET une série d'évaluations détaillées basées sur les critères.

❗❗❗ LOI ABSOLUE N°0 — ÉNONCÉ DE RECHERCHE IB PEI (NON NÉGOCIABLE) ❗❗❗
Le champ "statementOfInquiry" est L'ÉLÉMENT LE PLUS IMPORTANT du plan d'unité PEI.
Il DOIT intégrer OBLIGATOIREMENT les trois éléments : CONCEPT CLÉ + CONCEPT CONNEXE + CONTEXTE MONDIAL.
Format : Phrase déclarative COMPLÈTE (15–35 mots), transférable, stimulante intellectuellement.
L'énoncé doit être une phrase déclarative mémorable, transférable, stimulante intellectuellement.

STRUCTURES RECOMMANDÉES :
• "La [concept connexe] du [concept clé] révèle comment [contexte mondial]..."
• "Comprendre [concept clé] à travers [concept connexe] permet de [objectif contexte mondial]..."
• "La façon dont [concept connexe] façonne [concept clé] détermine [contexte mondial]..."

❗❗❗ LOI ABSOLUE N°1 — CRITÈRES OBLIGATOIRES (NON NÉGOCIABLE) ❗❗❗
CHAQUE UNITÉ DOIT CONTENIR EXACTEMENT 2 CRITÈRES D'ÉVALUATION dans le tableau "assessments".
- Sélectionne les 2 critères les PLUS PERTINENTS pour le contenu de cette unité
- JAMAIS 1 seul critère — JAMAIS 3 ou 4 — TOUJOURS exactement 2
- Sur le semestre (2 unités), les 4 critères A, B, C, D doivent tous être couverts

❗❗❗ LOI ABSOLUE N°2 — SOUS-ASPECTS OBLIGATOIRES (NON NÉGOCIABLE) ❗❗❗
CHAQUE CRITÈRE doit lister AU MINIMUM 3 sous-aspects dans le champ "strands".
- Moins de 3 sous-aspects pour un critère = réponse INVALIDE
- Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v)
- Un exercice PEUT évaluer 2-3 sous-aspects simultanément
- Exemple valide : "strands": ["i. Sélectionner", "iii. Résoudre", "iv. Expliquer"]
- Exemple: "Critère A: i. et iii." ou "Critère B: ii., iv. et v."

⚠️ DURÉE DES ÉVALUATIONS IB :
- Chaque évaluation critériée doit être conçue pour UNE DURÉE DE 45 À 60 MINUTES (travaux pratiques)
- Les activités pratiques nécessitent plus de temps que les exercices théoriques
- Adapte le nombre et la complexité des tâches à cette contrainte de temps

⚠️ LANGUE : Tout le contenu doit être généré UNIQUEMENT EN FRANÇAIS.
Aucune traduction arabe n'est requise — une seule version française complète suffit.

⚠️ RÈGLE ABSOLUE POUR LA MATIÈRE ARTS : ÉVALUATIONS PRATIQUES UNIQUEMENT
Lorsque la matière est "Arts" ou "Arts visuels" ou similaire, les évaluations critériées doivent être EXCLUSIVEMENT des TRAVAUX PRATIQUES artistiques. 
INTERDIT : les exercices théoriques de type QCM, questions écrites classiques, exercices de mathématiques ou de texte.
OBLIGATOIRE : chaque exercice/tâche doit être une activité pratique concrète parmi les types suivants :
  - 🎨 DESSIN & ILLUSTRATION : dessiner un objet, une scène, un portrait, un motif décoratif, une composition...
  - 🖌️ PEINTURE & MÉLANGE DES COULEURS : réaliser une peinture, mélanger des couleurs primaires/secondaires, créer un dégradé, appliquer une technique (aquarelle, acrylique, gouache...)
  - 🏗️ MAQUETTE & SCULPTURE : construire une maquette, modeler une sculpture en argile, créer un objet en 3D, assemblage de matériaux...
  - 🔍 ANALYSE D'ŒUVRE D'ART : analyser une reproduction d'œuvre (composition, couleurs, style, artiste, époque, message), comparer deux œuvres...
  - ✂️ COLLAGE & TECHNIQUES MIXTES : créer un collage thématique, utiliser des techniques mixtes (papier, tissu, matières naturelles...)
  - 🖼️ CRÉATION LIBRE GUIDÉE : créer une œuvre originale en respectant des contraintes techniques données
  - 📐 DESIGN & COMPOSITION : concevoir une affiche, un logo, une mise en page en respectant les principes de composition (équilibre, rythme, contraste...)
  - 🎭 CALLIGRAPHIE & TYPOGRAPHIE : exercices de calligraphie arabe ou latine, création de lettrage artistique

FORMAT DES TÂCHES PRATIQUES :
- Le champ "title" doit nommer clairement le type de travail pratique (ex: "Peinture : dégradé de couleurs froides")
- Le champ "content" doit contenir :
  * La description claire de la tâche à réaliser
  * Les matériaux/outils nécessaires (ex: "Matériel : papier aquarelle A4, pinceaux n°4 et n°8, peinture aquarelle")
  * Les étapes guidées (étape 1, étape 2, étape 3...)
  * Les critères visuels d'évaluation (ex: "Critères observés : précision du tracé, harmonie des couleurs, créativité de la composition")
  * Pour les analyses d'œuvres : inclure "[Insérer reproduction de l'œuvre ici : Titre, Artiste, Date, Technique]" et les questions d'analyse guidées
  * Des pointillés pour les réponses écrites courtes (observations, justifications)

RÈGLES ABSOLUES - FORMAT JSON:
1. Utilise UNIQUEMENT les CLÉS JSON EN ANGLAIS ci-dessous. NE PAS LES TRADUIRE.
2. Le CONTENU (valeurs) doit être UNIQUEMENT EN FRANÇAIS — aucune traduction arabe n'est requise.
3. Ne laisse AUCUN champ vide. Remplis TOUTES les sections.
4. ⚠️ CRITIQUE - VALIDITÉ JSON :
   - Assure-toi que le JSON est PARFAITEMENT VALIDE
   - Pas de virgules trainantes avant les accolades fermantes
   - Échappe correctement les guillemets dans les chaînes avec \"
   - Échappe correctement les retours à la ligne avec \n
   - N'utilise PAS de sauts de ligne réels dans les chaînes JSON
   - Teste mentalement la validité du JSON avant de répondre

CHAMPS OBLIGATOIRES ET DÉTAILLÉS :
- "learningExperiences": Détailler les ACTIVITÉS PRATIQUES D'APPRENTISSAGE et STRATÉGIES PÉDAGOGIQUES (ateliers pratiques, démonstration de techniques, observation d'artistes...).
- "formativeAssessment": Préciser les méthodes d'ÉVALUATION FORMATIVE pratique (portfolio, observation directe, esquisse préparatoire, carnet de croquis...).
- "differentiation": Préciser les stratégies de DIFFÉRENCIATION (modèles simplifiés pour élèves en difficulté, contraintes supplémentaires pour élèves avancés, choix des matériaux...).

RÈGLES SPÉCIFIQUES POUR LES TÂCHES PRATIQUES ARTS (CRUCIAL):
1. CHAQUE CRITÈRE doit évaluer AU MINIMUM 3 sous-aspects différents (i, ii, iii, iv, ou v)
2. Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v est valide)
3. Une tâche pratique PEUT évaluer 2-3 sous-aspects simultanément si pertinent
   - Exemple: "Critère A: i. et iii." (une tâche évalue 2 aspects)
4. VARIER les types de travaux pratiques pour couvrir différentes compétences artistiques
5. La clé "criterionReference" doit indiquer TOUS les aspects évalués et les compétences pratiques observées
6. LAISSER suffisamment d'espace de création (ne pas surcharger la feuille d'instructions)

GESTION DES RESSOURCES DANS LES TÂCHES PRATIQUES:
- Si la tâche nécessite l'analyse d'une œuvre d'art, écrire EXPLICITEMENT: "[Insérer reproduction de l'œuvre ici : Nom de l'artiste, Titre de l'œuvre, Date, Technique, Dimensions]".
- Si la tâche nécessite un modèle de référence, écrire EXPLICITEMENT: "[Insérer image de référence ici : description détaillée du sujet à observer/reproduire]".
- AJOUTER des zones dédiées à la création :
  * Pour les tâches de dessin/peinture : "\n\n[ZONE DE CRÉATION - Laisser suffisamment d'espace pour la réalisation pratique]\n"
  * Pour les analyses : ajouter des lignes de réponse "\n\nObservations :\n................................................................................................................................................................................................\n................................................................................................................................................................................................"
  * Adapter l'espace selon le type de tâche pratique

Structure JSON attendue (FRANÇAIS uniquement, pas de champs _ar) :
{
  "title": "Titre en français",
  "duration": "XX heures",
  "chapters": "- Chapitre 1: ...\n- Chapitre 2: ...\n- Chapitre 3: ...",
  "keyConcept": "Un concept clé",
  "relatedConcepts": ["Concept 1", "Concept 2"],
  "globalContext": "Un contexte mondial",
  "statementOfInquiry": "Phrase complète...",
  "inquiryQuestions": {
    "factual": ["Q1", "Q2"],
    "conceptual": ["Q1", "Q2"],
    "debatable": ["Q1", "Q2"]
  },
  "objectives": ["Critère A: ...", "Critère B: ..."],
  "atlSkills": ["Compétence 1...", "Compétence 2..."],
  "content": "Contenu détaillé...",
  "learningExperiences": "Activités ET stratégies pédagogiques détaillées...",
  "summativeAssessment": "Description de la tâche finale...",
  "formativeAssessment": "Description des évaluations formatives...",
  "differentiation": "Stratégies de différenciation...",
  "resources": "Livres, liens...",
  "reflection": {
     "prior": "Connaissances préalables...",
     "during": "Engagement...",
     "after": "Résultats..."
  },
  "assessments": [
    {
       "criterion": "A",
       "criterionName": "Connaissance",
       "maxPoints": 8,
       "strands": ["i. sélectionner...", "ii. appliquer...", "iii. résoudre..."],
       "rubricRows": [
          { "level": "1-2", "descriptor": "..." },
          { "level": "3-4", "descriptor": "..." },
          { "level": "5-6", "descriptor": "..." },
          { "level": "7-8", "descriptor": "..." }
       ],
       "exercises": [
          {
             "title": "Exercice 1 (Aspect i)",
             "content": "Question...",
             "criterionReference": "Critère A: i. sélectionner..."
          }
       ]
    }
  ]
}
`;

// Shared System Prompt for English generation (Language Acquisition)
const SYSTEM_INSTRUCTION_FULL_PLAN_EN = `
You are an expert IB Middle Years Programme (MYP) pedagogical coordinator.
You must generate a complete Unit Plan AND a series of detailed Criterion-based Assessments in ENGLISH.

⚠️ CRITICAL - LANGUAGE ACQUISITION SUBJECT:
- This is a Language Acquisition subject (e.g., English, Spanish, French as second language)
- EVERYTHING must be generated in ENGLISH - no exceptions
- ALL assessment content, exercises, questions, titles, instructions must be in ENGLISH
- ALL rubric descriptors must be in ENGLISH
- ALL criterion references must be in ENGLISH
- This ensures students practice the target language throughout the assessment

‼️‼️‼️ ABSOLUTE LAW #0 — STATEMENT OF INQUIRY (NON-NEGOTIABLE) ‼️‼️‼️
The "statementOfInquiry" field is the MOST IMPORTANT element of any MYP Unit Plan.
It MUST follow ALL IB MYP rules:

STATEMENT OF INQUIRY RULES:
1. MANDATORY STRUCTURE: Must explicitly integrate ALL THREE elements:
   • The KEY CONCEPT (e.g., communication, connection, relationships, systems...)
   • At least ONE RELATED CONCEPT (e.g., message, purpose, audience, style...)
   • The GLOBAL CONTEXT (e.g., Identities and relationships, Globalization and sustainability...)

2. FORM: A complete DECLARATIVE SENTENCE (not a question, not a fragment)
   • Typically 15–35 words
   • Uses a structure that naturally connects the three elements

3. TRANSFERABILITY: Must be transferable beyond the specific unit content
   • Do NOT mention specific grammar rules, book titles, or narrow content terms
   • Must provoke genuine intellectual inquiry beyond the immediate topic

4. RECOMMENDED GRAMMATICAL PATTERNS (IB-proven models):
   • "How [related concept] shapes/reflects [key concept] within [global context]..."
   • "Understanding [key concept] through [related concept] helps us [global context goal]..."
   • "The [key concept] of [related concept] reveals how [global context]..."
   • "[Related concept] as an expression of [key concept] shapes our understanding of [global context]..."

5. VALID EXAMPLES:
   ✅ "The way communication styles reflect cultural identity shapes how we connect with others in a globalized world."
   ✅ "Understanding how purpose and audience influence language empowers individuals to navigate complex social contexts."
   ✅ "The relationship between personal narrative and cultural context reveals how identity is constructed through language."

6. INVALID EXAMPLES:
   ❌ "Present simple tense is used for habits and routines." (too specific, not transferable)
   ❌ "Grammar is important in English." (no integration of three elements)
   ❌ "Why do we communicate?" (a question, not a declarative statement)

‼️‼️‼️ ABSOLUTE LAW #1 — MANDATORY CRITERIA (NON-NEGOTIABLE) ‼️‼️‼️
EACH UNIT MUST CONTAIN EXACTLY 2 ASSESSMENT CRITERIA in the "assessments" array.
- Select the 2 MOST RELEVANT criteria based on unit content
- NEVER 1 criterion alone — NEVER 3 or 4 — ALWAYS exactly 2
- Over the semester (2 units), all 4 criteria A, B, C, D must be covered
- Generating ≠ 2 criteria in "assessments" = INVALID, rejected response

‼️‼️‼️ ABSOLUTE LAW #2 — MANDATORY SUB-ASPECTS (NON-NEGOTIABLE) ‼️‼️‼️
EACH CRITERION must list AT LEAST 3 sub-aspects in the "strands" field.
- Sub-aspects are numbered i., ii., iii., iv., v.
- They do NOT need to be consecutive: i, iii, v is valid
- Fewer than 3 sub-aspects for any criterion = INVALID response
- Valid example: "strands": ["i. Select", "iii. Solve", "iv. Explain"]
- Invalid example (rejected): "strands": ["i. Aspect", "ii. Aspect"] ← only 2
- One exercise CAN cover 2–3 sub-aspects simultaneously"

⚠️ IB ASSESSMENT DURATION:
- Each criterion-based assessment must be designed for a 30-MINUTE DURATION
- Exercises must be completable within 30 minutes maximum
- Adapt the number and complexity of exercises to this time constraint

ABSOLUTE RULES - JSON FORMAT:
1. Use ONLY the JSON KEYS IN ENGLISH below. DO NOT TRANSLATE THEM.
2. The CONTENT (values) must be in ENGLISH.
3. Do NOT leave ANY field empty. Fill ALL sections.
4. ⚠️ CRITICAL - JSON VALIDITY:
   - Ensure the JSON is PERFECTLY VALID
   - No trailing commas before closing braces
   - Properly escape quotes in strings with \"
   - Properly escape newlines with \n
   - Do NOT use real line breaks inside JSON strings
   - Mentally test JSON validity before responding

MANDATORY AND DETAILED FIELDS:
- "learningExperiences": Detail the LEARNING ACTIVITIES and TEACHING STRATEGIES (e.g., Inquiry-based learning, collaborative work...).
- "formativeAssessment": Specify FORMATIVE ASSESSMENT methods (e.g., exit tickets, quick quiz, observation...).
- "differentiation": Specify DIFFERENTIATION strategies (Content, Process, Product) for struggling and advanced students.

SPECIFIC RULES FOR EXERCISES (CRUCIAL):
1. EACH CRITERION must assess AT LEAST 3 different sub-aspects (i, ii, iii, iv, or v)
2. Sub-aspects do NOT need to be consecutive
   - ✅ VALID: i, iii, v (non-consecutive but relevant)
   - ✅ VALID: ii, iv, v
   - ❌ INVALID: only i, ii (less than 3)
3. One exercise CAN and SHOULD assess 2-3 sub-aspects simultaneously if relevant
   - Example: "Criterion A: i. and iii." (one exercise assesses 2 sub-aspects)
   - Example: "Criterion B: ii., iv., and v." (one exercise assesses 3 sub-aspects)
4. VARY the types of exercises to cover different cognitive levels
5. The "criterionReference" MUST indicate ALL aspects assessed by the exercise
6. DESIGN each assessment to be completed in 30 MINUTES maximum
7. LEAVE SUFFICIENT response space for students in each exercise

RESOURCE MANAGEMENT IN EXERCISES:
- If the exercise requires analysis of a text, PROVIDE THE COMPLETE TEXT in the "content" field.
- If the exercise requires an image, write EXPLICITLY: "[Insert Image/Diagram here: detailed description]".
- ALWAYS ADD response lines with dots for students:
  * After each question, add: "\n\nAnswer:\n" followed by 5-8 dotted lines
  * Line format: "................................................................................................................................................................................................"
  * Adapt the number of lines based on question complexity
  * This ensures students have sufficient space to write their answers

Expected JSON Structure:
{
  "title": "Title in English",
  "duration": "XX hours",
  "chapters": "- Chapter 1: ...\n- Chapter 2: ...\n- Chapter 3: ...",
  "keyConcept": "A key concept",
  "relatedConcepts": ["Concept 1", "Concept 2"],
  "globalContext": "A global context",
  "statementOfInquiry": "Complete sentence...",
  "inquiryQuestions": {
    "factual": ["Q1", "Q2"],
    "conceptual": ["Q1", "Q2"],
    "debatable": ["Q1", "Q2"]
  },
  "objectives": ["Criterion A: ...", "Criterion B: ..."],
  "atlSkills": ["Skill 1...", "Skill 2..."],
  "content": "Detailed content...",
  "learningExperiences": "Activities AND detailed teaching strategies...",
  "summativeAssessment": "Description of final task...",
  "formativeAssessment": "Description of formative assessments...",
  "differentiation": "Differentiation strategies...",
  "resources": "Books, links...",
  "reflection": {
     "prior": "Prior knowledge...",
     "during": "Engagement...",
     "after": "Results..."
  },
  "assessments": [
    {
       "criterion": "A",
       "criterionName": "Knowledge",
       "maxPoints": 8,
       "strands": ["i. select...", "ii. apply...", "iii. solve..."],
       "rubricRows": [
          { "level": "1-2", "descriptor": "..." },
          { "level": "3-4", "descriptor": "..." },
          { "level": "5-6", "descriptor": "..." },
          { "level": "7-8", "descriptor": "..." }
       ],
       "exercises": [
          {
             "title": "Exercise 1 (Aspect i)",
             "content": "Question...",
             "criterionReference": "Criterion A: i. select..."
          }
       ]
    }
  ]
}
`;

// ─────────────────────────────────────────────────────────────────────────────
// System Prompt DESIGN — Dossier de conception avec les 4 critères A, B, C, D
// Toutes les questions sont liées et forment un seul projet cohérent
// ─────────────────────────────────────────────────────────────────────────────
const SYSTEM_INSTRUCTION_FULL_PLAN_DESIGN = `
Tu es un expert pédagogique IB PEI spécialisé en Design.
Tu dois générer un Plan d'Unité complet ET un DOSSIER DE CONCEPTION détaillé en Français.

❗❗❗ LOI ABSOLUE N°0 — ÉNONCÉ DE RECHERCHE DESIGN IB PEI (NON NÉGOCIABLE) ❗❗❗
Le champ "statementOfInquiry" DOIT intégrer les trois éléments IB :
CONCEPT CLÉ (ex: systèmes, ingéniosité, développement...) +
CONCEPT CONNEXE (ex: évaluation, adaptation, ressources...) +
CONTEXTE MONDIAL (ex: Innovation scientifique et technique, Mondialisation et durabilité...)

Format : Phrase déclarative COMPLÈTE (15–35 mots), centrée sur le processus de design et l'innovation.
Exemple valide : "La façon dont l'ingéniosité humaine répond aux besoins à travers des processus de conception systématiques révèle comment l'innovation technique façonne les sociétés contemporaines."

❗❗❗ LOI ABSOLUE N°1 — DOSSIER DE CONCEPTION : LES 4 CRITÈRES (NON NÉGOCIABLE) ❗❗❗
En Design IB, CHAQUE UNITÉ doit être évaluée sur les 4 CRITÈRES A, B, C et D OBLIGATOIREMENT.
L'évaluation prend la forme d'un DOSSIER DE CONCEPTION cohérent (un seul projet fil conducteur).

CRITÈRES DESIGN IB (obligatoires) :
- Critère A — Rechercher et définir (max 8 pts) :
  i. Expliquer et justifier la nécessité d'une solution
  ii. Construire un profil de client et identifier les besoins
  iii. Analyser des produits similaires en utilisant les spécifications
  iv. Développer un cahier des charges de conception

- Critère B — Idéer et concevoir (max 8 pts) :
  i. Développer des idées de conception originales et créatives
  ii. Présenter des esquisses et schémas annotés détaillés
  iii. Présenter et justifier la solution de conception retenue
  iv. Développer un planning de fabrication étape par étape

- Critère C — Créer la solution (max 8 pts) :
  i. Construire la solution en utilisant les techniques demandées
  ii. Démontrer les compétences techniques requises
  iii. Suivre le planning de façon sécuritaire et organisée
  iv. Démontrer l'utilisation responsable des ressources

- Critère D — Évaluer (max 8 pts) :
  i. Décrire des méthodes d'évaluation pertinentes
  ii. Tester et évaluer la solution selon le cahier des charges
  iii. Évaluer l'impact de la solution sur l'utilisateur et l'environnement
  iv. Expliquer comment la solution pourrait être améliorée

❗❗❗ LOI ABSOLUE N°2 — DOSSIER COHÉRENT ET INTERDÉPENDANT (NON NÉGOCIABLE) ❗❗❗
L'évaluation doit former un SEUL PROJET DE CONCEPTION cohérent :
- UN seul contexte/problème de conception pour tous les critères
- Les questions des critères A, B, C et D doivent être TOUTES LIÉES au MÊME projet
- Le fil conducteur : identifier le problème (A) → concevoir (B) → créer (C) → évaluer (D)
- Exemple de projet : "Concevoir un objet utilitaire pour résoudre un problème de la vie quotidienne"
- Chaque partie du dossier doit faire référence au MÊME objet/solution conçu(e)

❗❗❗ LOI ABSOLUE N°3 — SOUS-ASPECTS OBLIGATOIRES (NON NÉGOCIABLE) ❗❗❗
CHAQUE CRITÈRE doit lister AU MINIMUM 3 sous-aspects dans le champ "strands".
- Si tu génères < 3 sous-aspects pour un critère → réponse INVALIDE

⚠️ DURÉE DU DOSSIER DE CONCEPTION :
- Le dossier complet (4 critères) peut être réalisé sur 2-3 séances (60-90 min chacune)
- Chaque section du dossier est clairement délimitée avec ses critères d'évaluation

RÈGLES ABSOLUES - FORMAT JSON :
1. Utilise UNIQUEMENT les CLÉS JSON EN ANGLAIS. NE LES TRADUIS PAS.
2. Le CONTENU (les valeurs) doit être en FRANÇAIS.
3. Ne laisse AUCUN champ vide.
4. Le JSON doit être PARFAITEMENT VALIDE — pas de virgules traînantes, guillemets échappés.

STRUCTURE DU DOSSIER DE CONCEPTION (exercices interdépendants) :
Le champ "assessments" contient les 4 critères dans l'ordre A → B → C → D.
Chaque critère a ses propres exercices qui font partie du MÊME projet.

Exemple de projet fil conducteur : "Concevoir un porte-stylos ergonomique pour les élèves"
- Critère A : Recherche — analyser le besoin, profil utilisateur, cahier des charges
- Critère B : Idéation — 3 esquisses, choix justifié, planning de fabrication
- Critère C : Réalisation — construction, techniques utilisées, gestion des ressources
- Critère D : Évaluation — tests, comparaison au cahier des charges, améliorations

Structure JSON attendue :
{
  "title": "Titre de l'unité Design en Français",
  "duration": "XX heures",
  "chapters": "- Chapitre 1: ...\n- Chapitre 2: ...",
  "keyConcept": "Un concept clé IB",
  "relatedConcepts": ["Concept 1", "Concept 2"],
  "globalContext": "Un contexte mondial",
  "statementOfInquiry": "Énoncé de recherche complet...",
  "inquiryQuestions": {
    "factual": ["Q1", "Q2"],
    "conceptual": ["Q1", "Q2"],
    "debatable": ["Q1", "Q2"]
  },
  "objectives": ["Critère A: Rechercher et définir", "Critère B: Idéer et concevoir", "Critère C: Créer la solution", "Critère D: Évaluer"],
  "atlSkills": ["Compétence de réflexion...", "Compétence de recherche..."],
  "content": "Contenu détaillé de l'unité...",
  "learningExperiences": "Activités d'apprentissage et stratégies d'enseignement Design...",
  "summativeAssessment": "Dossier de conception complet (Critères A+B+C+D) — projet: [description du projet fil conducteur]",
  "formativeAssessment": "Évaluations formatives progressives...",
  "differentiation": "Stratégies de différenciation...",
  "resources": "Matériaux, outils, ressources numériques...",
  "reflection": {
    "prior": "Connaissances préalables en design...",
    "during": "Engagement dans le processus de conception...",
    "after": "Résultats et apprentissages..."
  },
  "assessments": [
    {
      "criterion": "A",
      "criterionName": "Rechercher et définir",
      "maxPoints": 8,
      "strands": ["i. Expliquer et justifier la nécessité d'une solution", "ii. Construire un profil de client", "iii. Analyser des produits similaires", "iv. Développer un cahier des charges"],
      "rubricRows": [
        {"level": "1-2", "descriptor": "L'élève identifie le problème de façon limitée..."},
        {"level": "3-4", "descriptor": "L'élève identifie et décrit le problème..."},
        {"level": "5-6", "descriptor": "L'élève analyse le problème et formule des spécifications..."},
        {"level": "7-8", "descriptor": "L'élève développe un cahier des charges complet et justifié..."}
      ],
      "exercises": [
        {
          "title": "Partie A — Dossier de conception : Recherche et définition du problème",
          "content": "CONTEXTE DU PROJET : [Présenter le contexte du projet de conception commun à tout le dossier]\n\nA.i — Justification du besoin :\nExplique pourquoi il est nécessaire de concevoir une solution pour ce problème.\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n\nA.ii — Profil de l'utilisateur :\nDécris le client/utilisateur cible (âge, besoins, habitudes, contraintes).\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n\nA.iii — Analyse de produits existants :\nAnalyse deux produits similaires existants en utilisant les spécifications suivantes : [fonctionnalité, esthétique, durabilité, coût, impact environnemental].\n\n[Insérer images des deux produits analysés]\n\nProduit 1 : ...\nProduit 2 : ...\n\nA.iv — Cahier des charges :\nDéveloppe le cahier des charges de conception (min. 5 critères avec leurs niveaux de performance).",
          "criterionReference": "Critère A : i, ii, iii, iv",
          "workspaceNeeded": true
        }
      ]
    },
    {
      "criterion": "B",
      "criterionName": "Idéer et concevoir",
      "maxPoints": 8,
      "strands": ["i. Développer des idées de conception originales", "ii. Présenter des esquisses annotées", "iii. Justifier la solution retenue", "iv. Développer un planning de fabrication"],
      "rubricRows": [
        {"level": "1-2", "descriptor": "L'élève présente une seule idée peu développée..."},
        {"level": "3-4", "descriptor": "L'élève présente quelques idées avec esquisses basiques..."},
        {"level": "5-6", "descriptor": "L'élève développe plusieurs idées avec justification..."},
        {"level": "7-8", "descriptor": "L'élève présente des idées originales, esquisses détaillées, planning complet..."}
      ],
      "exercises": [
        {
          "title": "Partie B — Dossier de conception : Idéation et planification",
          "content": "En référence au cahier des charges défini en Partie A :\n\nB.i & B.ii — Esquisses de conception :\nDéveloppe 3 idées de conception différentes pour le projet. Pour chaque idée, réalise une esquisse annotée avec les dimensions, matériaux et techniques envisagés.\n\n[ZONE D'ESQUISSE 1 — Idée 1]\n................................................................................................................................................................................................\n\n[ZONE D'ESQUISSE 2 — Idée 2]\n................................................................................................................................................................................................\n\n[ZONE D'ESQUISSE 3 — Idée 3]\n................................................................................................................................................................................................\n\nB.iii — Justification du choix :\nExplique pourquoi tu as choisi cette idée en référence aux critères du cahier des charges.\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n\nB.iv — Planning de fabrication :\nDéveloppe un planning étape par étape (minimum 5 étapes avec matériaux, outils et durée).",
          "criterionReference": "Critère B : i, ii, iii, iv",
          "workspaceNeeded": true
        }
      ]
    },
    {
      "criterion": "C",
      "criterionName": "Créer la solution",
      "maxPoints": 8,
      "strands": ["i. Construire la solution selon les techniques demandées", "ii. Démontrer les compétences techniques", "iii. Suivre le planning de façon organisée", "iv. Utiliser les ressources de façon responsable"],
      "rubricRows": [
        {"level": "1-2", "descriptor": "L'élève réalise partiellement la solution avec peu de compétences..."},
        {"level": "3-4", "descriptor": "L'élève réalise la solution avec des compétences basiques..."},
        {"level": "5-6", "descriptor": "L'élève réalise la solution avec de bonnes compétences techniques..."},
        {"level": "7-8", "descriptor": "L'élève réalise une solution de haute qualité avec excellentes compétences..."}
      ],
      "exercises": [
        {
          "title": "Partie C — Dossier de conception : Journal de fabrication",
          "content": "Durant la fabrication de ta solution (en référence au planning Partie B) :\n\nC.i & C.ii — Journal de fabrication :\nDocumente chaque étape de ta fabrication (photos, croquis, notes techniques).\n\nÉtape 1 réalisée :\n................................................................................................................................................................................................\nÉtape 2 réalisée :\n................................................................................................................................................................................................\nÉtape 3 réalisée :\n................................................................................................................................................................................................\n\nC.iii — Suivi du planning :\nCompare ce que tu as réalisé avec ton planning initial. Y a-t-il eu des modifications ? Justifie.\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n\nC.iv — Gestion des ressources :\nComment as-tu géré les matériaux et les déchets de façon responsable ?\n\nRéponse :\n................................................................................................................................................................................................",
          "criterionReference": "Critère C : i, ii, iii, iv",
          "workspaceNeeded": true
        }
      ]
    },
    {
      "criterion": "D",
      "criterionName": "Évaluer",
      "maxPoints": 8,
      "strands": ["i. Décrire des méthodes d'évaluation pertinentes", "ii. Tester et évaluer selon le cahier des charges", "iii. Évaluer l'impact de la solution", "iv. Proposer des améliorations"],
      "rubricRows": [
        {"level": "1-2", "descriptor": "L'élève décrit l'évaluation de façon superficielle..."},
        {"level": "3-4", "descriptor": "L'élève teste la solution et formule quelques conclusions..."},
        {"level": "5-6", "descriptor": "L'élève évalue la solution selon le cahier des charges..."},
        {"level": "7-8", "descriptor": "L'élève mène une évaluation complète et propose des améliorations pertinentes..."}
      ],
      "exercises": [
        {
          "title": "Partie D — Dossier de conception : Évaluation finale",
          "content": "En référence à ta solution créée en Partie C :\n\nD.i — Méthodes d'évaluation :\nDécris comment tu vas tester ta solution (minimum 2 méthodes différentes).\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n\nD.ii — Tests selon le cahier des charges :\nPour chaque critère de ton cahier des charges (Partie A), indique si ta solution le respecte ou non, avec justification.\n\nCritère 1 : ...\nRéponse :\n................................................................................................................................................................................................\n\nCritère 2 : ...\nRéponse :\n................................................................................................................................................................................................\n\nD.iii — Impact de la solution :\nÉvalue l'impact de ta solution sur l'utilisateur et sur l'environnement.\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................\n\nD.iv — Améliorations possibles :\nSi tu devais améliorer ta solution, que changerais-tu ? Justifie.\n\nRéponse :\n................................................................................................................................................................................................\n................................................................................................................................................................................................",
          "criterionReference": "Critère D : i, ii, iii, iv",
          "workspaceNeeded": true
        }
      ]
    }
  ]
}

⚠️ RAPPEL FINAL DESIGN :
- TOUJOURS 4 critères A, B, C, D dans chaque unité Design
- Le dossier forme UN SEUL PROJET cohérent (questions interdépendantes)
- Critère A (Recherche) → B (Idéation) → C (Création) → D (Évaluation) : progression logique
- Chaque critère doit avoir ≥ 3 sous-aspects dans "strands"
- Le summativeAssessment DOIT décrire le projet de conception complet
`;

// Get appropriate system instruction based on subject
const getSystemInstruction = (subject: string): string => {
  const lang = getGenerationLanguage(subject);
  if (lang === 'design') return SYSTEM_INSTRUCTION_FULL_PLAN_DESIGN;
  if (lang === 'en') return SYSTEM_INSTRUCTION_FULL_PLAN_EN;
  if (lang === 'arts') return SYSTEM_INSTRUCTION_FULL_PLAN_ARTS;
  return SYSTEM_INSTRUCTION_FULL_PLAN_FR;
};

export const generateFullUnitPlan = async (
  topics: string, 
  subject: string, 
  gradeLevel: string
): Promise<Partial<UnitPlan>> => {
  try {
    const lang = getGenerationLanguage(subject);
    
    let userPrompt = '';
    
    if (lang === 'design') {
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ❗ OBLIGATOIRE — RÈGLE IB SUR L'ÉNONCÉ DE RECHERCHE DESIGN :
        Le "statementOfInquiry" DOIT intégrer CONCEPT CLÉ IB + CONCEPT CONNEXE + CONTEXTE MONDIAL.
        Format : Phrase déclarative 15–35 mots, centrée sur le processus de design et l'innovation.
        Exemple valide : "La façon dont l'ingéniosité humaine répond aux besoins à travers des processus de conception systématiques révèle comment l'innovation technique façonne les sociétés contemporaines."
        
        ❗❗❗ OBLIGATOIRE — RÈGLE DESIGN IB ❗❗❗
        1. Le champ "assessments" doit contenir EXACTEMENT 4 critères : A, B, C et D
        2. L'évaluation est un DOSSIER DE CONCEPTION cohérent (projet unique fil conducteur)
        3. Toutes les questions sont liées au MÊME projet de conception
        4. Chaque critère doit avoir AU MINIMUM 3 sous-aspects dans "strands"
        5. Le summativeAssessment doit décrire le projet de conception complet
        
        Génère le plan d'unité complet et le dossier de conception avec les 4 critères.
        Assure-toi de:
        1. Générer un "statementOfInquiry" IB PEI VALIDE (voir règle ci-dessus)
        2. Définir UN projet de conception clair comme fil conducteur (ex: concevoir un objet utilitaire)
        3. Relier toutes les questions des 4 critères au MÊME projet
        4. Respecter l'ordre logique A (Recherche) → B (Idéation) → C (Création) → D (Évaluation)
        5. Inclure un champ "chapters" listant les chapitres/leçons de design couverts
        6. Retourner UNIQUEMENT un JSON valide et complet - pas de texte avant ou après
        7. S'assurer que le JSON est parfaitement valide: pas de virgules traînantes
      `;
    } else if (lang === 'en') {
      userPrompt = `
        Subject: ${subject}
        Grade Level: ${gradeLevel}
        Topics to cover: ${topics}
        
        ⚠️ CRITICAL: This is a LANGUAGE ACQUISITION subject - generate EVERYTHING in ENGLISH.
        All assessment exercises, questions, texts, titles, instructions, and rubric descriptors MUST be in ENGLISH.
        
        Generate the complete plan and criterion-based assessments.
        
        ❗ MANDATORY — STRICT IB RULE ON STATEMENT OF INQUIRY:
        The "statementOfInquiry" MUST:
        • Integrate the KEY CONCEPT + at least one RELATED CONCEPT + the GLOBAL CONTEXT in one sentence
        • Be a declarative statement (15–35 words), transferable, intellectually stimulating
        • NOT mention grammar rules or narrow content topics directly
        Valid example: "The way communication styles reflect cultural identity shapes how we connect with others in a globalized world."
        
        ❗ MANDATORY — STRICT IB RULE ON CRITERIA:
        1. The "assessments" field must contain EXACTLY 2 criteria (not 1, not 3, not 4)
        2. Each criterion must have AT LEAST 3 sub-aspects in "strands" (e.g., i, iii, iv)
        3. Sub-aspects can be non-consecutive — choose the most relevant ones
        4. Over 2 units (semester), all 4 criteria A, B, C, D must be covered
        
        Make sure to:
        1. Generate a VALID IB MYP "statementOfInquiry" (see rule above)
        2. Fill in ALL sections including 'Activities/Strategies', 'Formative Assessment' and 'Differentiation'
        3. Include a "chapters" field listing the chapters/lessons covered in this unit (bullet points format)
        4. Generate EXACTLY 2 criteria in "assessments", each with ≥ 3 sub-aspects in "strands"
        5. Adapt sub-aspects to unit content (can combine multiple in one exercise)
        6. Design assessments for 30-minute duration
        7. Generate ALL content in ENGLISH (this is a language acquisition subject)
        8. Return ONLY a valid, complete JSON structure - no additional text before or after
        9. Ensure JSON is perfectly valid: no trailing commas, properly escaped quotes and newlines
      `;
    } else if (lang === 'arts') {
      const isArt = subject.toLowerCase().includes('art');
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ⚠️ LANGUE : Tout le contenu doit être généré UNIQUEMENT EN FRANÇAIS. Aucune traduction arabe n'est requise.
        
        ${isArt ? `⚠️⚠️ RÈGLE ABSOLUE ARTS : TRAVAUX PRATIQUES UNIQUEMENT ⚠️⚠️
        Cette matière est "Arts" — les évaluations critériées doivent être EXCLUSIVEMENT des TRAVAUX PRATIQUES artistiques.
        INTERDIT : Questions théoriques classiques, QCM, exercices de texte écrits ordinaires.
        OBLIGATOIRE : Chaque tâche d'évaluation doit être l'une de ces activités concrètes :
          🎨 Dessiner (composition, portrait, motif, nature morte, paysage...)
          🖌️ Peindre et mélanger les couleurs (aquarelle, gouache, acrylique, dégradés, harmonie chromatique...)
          🏗️ Réaliser une maquette ou une sculpture (argile, matériaux de récupération, papier mâché...)
          🔍 Analyser une œuvre d'art (reproduction fournie, avec questions guidées : composition, style, couleurs, message, artiste, époque...)
          ✂️ Créer un collage ou une technique mixte
          🖼️ Concevoir une affiche, un logo ou une composition graphique
          📐 Exercice de calligraphie ou de lettrage artistique
        Chaque tâche doit préciser les matériaux nécessaires, les étapes de réalisation et les critères d'observation visuels.
        ` : ''}
        
        ❗ OBLIGATOIRE — RÈGLE IB STRICTE SUR L'ÉNONCÉ DE RECHERCHE :
        Le "statementOfInquiry" DOIT intégrer CONCEPT CLÉ + CONCEPT CONNEXE + CONTEXTE MONDIAL en une phrase déclarative (15–35 mots).
        Exemple valide : "La façon dont l'expression artistique reflète l'identité culturelle révèle comment les sociétés transmettent leur patrimoine à travers le temps."
        
        ⚠️ CRITIQUE - SÉLECTION DES CRITÈRES: 
        - STANDARD : Sélectionne 2 critères LES PLUS CONVENABLES selon le contenu de l'unité
        - EXCEPTIONNEL : 3 critères SEULEMENT si l'unité DOIT OBLIGATOIREMENT être évaluée par ces 3 critères (pire des cas)
        - JAMAIS : 4 critères dans une seule unité
        - IMPORTANT : Sur 2 unités (semestre), les 4 critères (A, B, C, D) doivent être couverts
        
        ⚠️ CRITIQUE - SOUS-ASPECTS (MINIMUM 3 PAR CRITÈRE):
        - CHAQUE critère doit évaluer AU MINIMUM 3 sous-aspects (i, ii, iii, iv, ou v)
        - Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v ou ii, iv, v)
        - Choisis les sous-aspects les PLUS PERTINENTS selon le contenu et les exigences IB
        - Une tâche PEUT évaluer 2-3 sous-aspects simultanément (ex: "Critère A: i. et iii.")
        
        Assure-toi de:
        1. Générer un "statementOfInquiry" IB PEI VALIDE (voir règle ci-dessus)
        2. Bien remplir TOUTES les sections (Activités/Stratégies, Évaluation formative, Différenciation)
        3. Inclure un champ "chapters" listant les chapitres/leçons couverts dans cette unité
        4. Sélectionner STANDARD: 2 critères (les plus convenables), EXCEPTIONNEL: 3 critères (si vraiment nécessaire)
        5. Adapter les sous-aspects au contenu (possibilité de combiner plusieurs dans une tâche)
        6. ${isArt ? 'Concevoir chaque évaluation comme un TRAVAIL PRATIQUE pour une durée de 45 à 60 minutes' : 'Concevoir chaque évaluation pour une durée de 30 minutes'}
        7. Retourner UNIQUEMENT une structure JSON valide et complète EN FRANÇAIS — pas de texte avant ou après
        8. S'assurer que le JSON est parfaitement valide: pas de virgules trainantes, guillemets et retours à la ligne échappés correctement
      `;
    } else {
      // Français standard (toutes les matières sauf Design, EN, Bilingue)
      const subjectConceptsSingle = getIBConceptsForSubject(subject);
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ❗ CONCEPTS IB OFFICIELS OBLIGATOIRES pour ${subject} :
        ▶ Concepts clés autorisés (choisir parmi) : ${subjectConceptsSingle.keyConcepts.join(', ')}
        ▶ Concepts connexes autorisés (choisir parmi) : ${subjectConceptsSingle.relatedConcepts.join(', ')}
        INTERDIT d'utiliser un concept n'appartenant pas à ces listes officielles IB.
        
        ❗ OBLIGATOIRE — RÈGLE IB STRICTE SUR L'ÉNONCÉ DE RECHERCHE :
        Le "statementOfInquiry" DOIT :
        • Formule : [Concept Clé officiel] + [Concept Connexe officiel] + [Contexte Mondial]
        • Être une phrase déclarative mémorable (15–35 mots), NE PAS citer le sujet spécifique
        • Être transférable et stimulante intellectuellement
        Exemple valide : "La logique de la simplification des quantités révèle comment les relations entre les nombres modélisent les phénomènes du monde réel."
        
        ❗ OBLIGATOIRE — RÈGLE IB STRICTE SUR LES CRITÈRES :
        1. Le champ "assessments" doit contenir EXACTEMENT 2 critères (ni 1, ni 3, ni 4)
        2. Chaque critère doit avoir AU MINIMUM 3 sous-aspects dans "strands" (ex: i, iii, iv)
        3. Les sous-aspects peuvent être non-consécutifs — choisis les plus pertinents
        4. Sur 2 unités (semestre), les 4 critères A, B, C, D doivent être couverts
        
        Génère le plan complet et les évaluations critériées.
        Assure-toi de:
        1. Générer un "statementOfInquiry" IB PEI VALIDE avec les concepts officiels de la matière
        2. Bien remplir TOUTES les sections incluant 'Activités/Stratégies', 'Évaluation formative' et 'Différenciation'
        3. Inclure un champ "chapters" listant les chapitres/leçons couverts dans cette unité (format tirets)
        4. Générer EXACTEMENT 2 critères dans "assessments" avec chacun ≥ 3 sous-aspects dans "strands"
        5. Adapter les sous-aspects au contenu (possibilité de combiner plusieurs dans un exercice)
        6. Concevoir chaque évaluation pour une durée de 30 minutes
        7. Retourner UNIQUEMENT une structure JSON valide et complète - pas de texte avant ou après
        8. S'assurer que le JSON est parfaitement valide: pas de virgules traînantes, guillemets et retours à la ligne échappés correctement
      `;
    }

    const text = await callGeminiViaProxy(
      userPrompt,
      getSystemInstruction(subject),
      { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 65536 }
    );

    if (!text || text.trim() === "") {
      throw new Error("L'IA n'a retourné aucune réponse. Veuillez réessayer.");
    }
    
    console.log("✓ Réponse AI reçue, longueur:", text.length);
    console.log("✓ Premiers 500 caractères:", text.substring(0, 500));
    
    const cleanedJson = cleanJsonText(text);
    console.log("✓ JSON nettoyé, longueur:", cleanedJson.length);
    
    if (!cleanedJson || cleanedJson === "{}") {
      console.error("❌ Échec du nettoyage JSON. Texte brut (premiers 1000 chars):", text.substring(0, 1000));
      throw new Error("L'IA n'a pas retourné de plan valide. Le format JSON est invalide. Veuillez réessayer avec des chapitres plus simples et structurés.");
    }
    
    let parsed;
    try {
      parsed = JSON.parse(cleanedJson);
      console.log("✓ JSON parsé avec succès");
    } catch (parseError: any) {
      console.error("❌ Erreur de parsing JSON:", parseError);
      console.error("❌ Message d'erreur:", parseError.message);
      console.error("❌ JSON problématique (premiers 1000 chars):", cleanedJson.substring(0, 1000));
      
      // Try to identify the specific location of the error
      if (parseError.message && parseError.message.includes("position")) {
        const match = parseError.message.match(/position (\d+)/);
        if (match) {
          const pos = parseInt(match[1]);
          const contextStart = Math.max(0, pos - 100);
          const contextEnd = Math.min(cleanedJson.length, pos + 100);
          console.error("❌ Contexte autour de l'erreur:", cleanedJson.substring(contextStart, contextEnd));
        }
      }
      
      throw new Error("Le plan généré contient des erreurs de format JSON. Veuillez réessayer avec des chapitres plus clairs et structurés.");
    }
    
    // Vérifier que le plan contient des données essentielles
    if (!parsed || typeof parsed !== 'object') {
      throw new Error("Le plan généré est incomplet. Veuillez réessayer.");
    }
    
    const sanitized = sanitizeUnitPlan(parsed, subject, gradeLevel);
    console.log("✓ Plan sanitarisé avec succès");
    
    return sanitized;

  } catch (error: any) {
    console.error("❌ Erreur génération plan complet:", error);
    const errorMsg = error?.message || "Erreur inconnue lors de la génération";
    
    // Message d'erreur plus clair pour l'utilisateur
    if (errorMsg.toLowerCase().includes("limite") || errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("limit") || errorMsg.includes("429")) {
      throw new Error("❌ Limite d'utilisation de l'IA atteinte. Veuillez réessayer dans quelques minutes.");
    } else if (errorMsg.includes("OPENAI_API_KEY") || errorMsg.includes("GEMINI_API_KEY") || errorMsg.includes("No AI API key")) {
      throw new Error("❌ Erreur de connexion à l'IA. Vérifiez votre clé API dans les paramètres Vercel.");
    } else if (errorMsg.includes("JSON") || errorMsg.includes("format") || errorMsg.includes("parse")) {
      throw new Error("❌ L'IA n'a pas retourné de plan valide. Veuillez réessayer avec des sujets plus précis.\n\nConseils:\n- Soyez plus spécifique dans les chapitres\n- Essayez avec moins de sujets à la fois\n- Attendez quelques instants et réessayez");
    }
    
    throw new Error(`❌ Erreur: ${errorMsg}`);
  }
};

export const generateCourseFromChapters = async (
    allChapters: string, 
    subject: string, 
    gradeLevel: string
  ): Promise<UnitPlan[]> => {
    try {
      const lang = getGenerationLanguage(subject);
      const isDesign = isDesignSubject(subject);
      
      // ── Task instruction ajoutée au system prompt ────────────────────────
      let taskInstruction = '';
      
      if (isDesign) {
        taskInstruction = `
        TÂCHE : Divise le programme de Design fourni en MINIMUM 4 et MAXIMUM 6 unités logiques (idéalement 4 unités pour couvrir l'année entière).
        Retourne une LISTE JSON (Array) d'objets UnitPlan.
        ❗ CHAQUE unité Design DOIT avoir les 4 critères A, B, C, D dans "assessments" (DOSSIER DE CONCEPTION).
        ❗ MINIMUM 4 unités, MAXIMUM 6 unités.
        `;
      } else if (lang === 'en') {
        taskInstruction = `
        TASK: Divide the provided curriculum into MINIMUM 4 and MAXIMUM 6 logical units (aim for 4-5 units covering the full year).
        Return a JSON LIST (Array) of UnitPlan objects.
        ❗ MINIMUM 4 units, MAXIMUM 6 units.
        `;
      } else if (lang === 'arts') {
        taskInstruction = `
        TÂCHE : Divise le programme fourni en MINIMUM 4 et MAXIMUM 6 unités logiques (idéalement 4-5 unités pour l'année).
        Retourne une LISTE JSON (Array) d'objets UnitPlan EN FRANÇAIS UNIQUEMENT.
        ❗ MINIMUM 4 unités, MAXIMUM 6 unités.
        `;
      } else {
        taskInstruction = `
        TÂCHE : Divise le programme fourni en MINIMUM 4 et MAXIMUM 6 unités logiques (idéalement 4-5 unités pour l'année complète).
        Retourne une LISTE JSON (Array) d'objets UnitPlan.
        ❗ MINIMUM 4 unités, MAXIMUM 6 unités — jamais moins de 4.
        `;
      }
      
      const conceptsRule = (!isDesign && lang !== 'en') ? getConceptsRuleForSubject(subject) : '';
      
      const systemInstruction = `
      ${getSystemInstruction(subject)}
      ${conceptsRule}
      ${taskInstruction}
      `;
  
      // ── User prompt selon la langue / matière ────────────────────────────
      let userPrompt = '';
      
      if (isDesign) {
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
          
          ❗❗❗ RÈGLE ABSOLUE DESIGN ❗❗❗
          1. Génère MINIMUM 4 unités et MAXIMUM 6 unités (idéalement 4 unités)
          2. CHAQUE unité Design doit avoir les 4 critères A, B, C et D dans "assessments"
          3. L'évaluation de chaque unité est un DOSSIER DE CONCEPTION cohérent (projet fil conducteur unique)
          4. Les 4 critères de chaque unité doivent être liés au MÊME projet de conception
          5. Chaque unité a un projet de conception DIFFÉRENT adapté au contenu de l'unité
          6. Retourne UNIQUEMENT un JSON valide et complet
        `;
      } else if (lang === 'en') {
        userPrompt = `
          Subject: ${subject}
          Grade Level: ${gradeLevel}
          Complete Curriculum:
          ${allChapters}
          
          ⚠️ CRITICAL: This is a LANGUAGE ACQUISITION subject - generate ALL CONTENT in ENGLISH.
          All plans, assessments, exercises, questions, titles, and instructions MUST be in ENGLISH only.
          ❗ Generate MINIMUM 4 units and MAXIMUM 6 units (aim for 4-5).
        `;
      } else if (lang === 'arts') {
        const isArtCourse = subject.toLowerCase().includes('art');
        const artConcepts = getIBConceptsForSubject(subject);
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
          
          ⚠️ LANGUE : Tout le contenu doit être généré UNIQUEMENT EN FRANÇAIS. Aucune traduction arabe requise.
          ❗ Génère MINIMUM 4 unités et MAXIMUM 6 unités (idéalement 4-5).
          
          ⚠️ CONCEPTS IB OBLIGATOIRES pour ${subject} :
          Concepts clés autorisés : ${artConcepts.keyConcepts.join(', ')}
          Concepts connexes autorisés : ${artConcepts.relatedConcepts.join(', ')}
          Utilise UNIQUEMENT ces concepts — ne pas en inventer d'autres.
          
          ${isArtCourse ? `
          ⚠️⚠️ RÈGLE ABSOLUE ARTS : TRAVAUX PRATIQUES UNIQUEMENT ⚠️⚠️
          Les évaluations critériées doivent être EXCLUSIVEMENT des TRAVAUX PRATIQUES artistiques :
          🎨 Dessin, 🖌️ Peinture/mélange de couleurs, 🏗️ Maquette/sculpture, 🔍 Analyse d'œuvre d'art,
          ✂️ Collage/techniques mixtes, 🖼️ Design/composition graphique, 📐 Calligraphie.
          INTERDIT : Questions théoriques ordinaires, QCM, exercices écrits classiques.
          Chaque tâche doit indiquer les matériaux, les étapes et les critères visuels d'observation.
          ` : ''}
        `;
      } else {
        const subjectConcepts = getIBConceptsForSubject(subject);
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
          
          ❗ CONCEPTS IB OFFICIELS OBLIGATOIRES pour ${subject} :
          ▶ Concepts clés autorisés (choisir parmi) : ${subjectConcepts.keyConcepts.join(', ')}
          ▶ Concepts connexes autorisés (choisir parmi) : ${subjectConcepts.relatedConcepts.join(', ')}
          INTERDIT d'utiliser un concept n'appartenant pas à ces listes officielles IB.
          
          ❗ OBLIGATOIRE — ÉNONCÉ DE RECHERCHE IB PEI POUR CHAQUE UNITÉ :
          Le "statementOfInquiry" de CHAQUE unité DOIT :
          • Formule : [Concept Clé officiel] + [Concept Connexe officiel] + [Contexte Mondial]
          • Être une phrase déclarative mémorable (15–35 mots) qui NE CITE PAS le sujet spécifique
          • Être DIFFÉRENT pour chaque unité (adapté au contenu spécifique de l'unité)
          • Être transférable et stimulant intellectuellement
          Exemple valide pour Maths : "La logique de la simplification des quantités révèle comment les relations entre les nombres modélisent des phénomènes du monde réel."
          
          ❗ Génère MINIMUM 4 unités et MAXIMUM 6 unités (idéalement 4-5 unités pour couvrir l'année complète).
          ❗ JAMAIS moins de 4 unités.
        `;
      }
  
      const text = await callGeminiViaProxy(
        userPrompt,
        systemInstruction,
        { responseMimeType: 'application/json', temperature: 0.7, maxOutputTokens: 65536 }
      );
  
      if (!text || text.trim() === "") {
        console.error("❌ L'IA n'a retourné aucune réponse");
        throw new Error("L'IA n'a pas retourné de plan valide. Veuillez réessayer.");
      }
      
      console.log("✓ Réponse AI reçue pour planification, longueur:", text.length);
      
      const cleanedJson = cleanJsonText(text);
      
      if (!cleanedJson || cleanedJson === "{}" || cleanedJson === "[]") {
        console.error("❌ Échec du nettoyage JSON. Texte brut:", text.substring(0, 200));
        throw new Error("L'IA n'a pas retourné de plan valide. Le format JSON est invalide. Veuillez vérifier que les chapitres sont bien formatés et réessayer.");
      }
      
      console.log("✓ JSON nettoyé pour planification, longueur:", cleanedJson.length);
      
      let plans;
      try {
        const parsed = JSON.parse(cleanedJson);
        
        // Cas 1 : tableau direct  → [ {...}, {...} ]
        if (Array.isArray(parsed)) {
          plans = parsed;
        }
        // Cas 2 : objet wrapper (OpenAI/GROQ ne peut pas retourner un tableau à la racine)
        // Formes possibles : { units:[...] } | { plans:[...] } | { unitPlans:[...] }
        //                    { unit_plans:[...] } | { data:[...] } | { results:[...] }
        else if (parsed && typeof parsed === 'object') {
          const arrayKey = ['units','plans','unitPlans','unit_plans','data','results','planifications']
            .find(k => Array.isArray(parsed[k]));
          if (arrayKey) {
            console.log(`✓ Tableau trouvé dans la clé wrapper "${arrayKey}"`);
            plans = parsed[arrayKey];
          } else {
            // Dernier recours : si l'objet ressemble à un plan unique, l'envelopper dans un tableau
            if (parsed.title || parsed.keyConcept || parsed.subject) {
              console.log('✓ Objet unique détecté, enveloppé dans un tableau');
              plans = [parsed];
            } else {
              console.error("❌ L'IA n'a pas retourné un tableau de plans, clés reçues:", Object.keys(parsed).join(', '));
              throw new Error("L'IA n'a pas retourné de plan valide. Veuillez réessayer.");
            }
          }
        } else {
          throw new Error("Format JSON inattendu.");
        }
      } catch (parseError: any) {
        if (parseError.message && (parseError.message.includes('plan valide') || parseError.message.includes('inattendu'))) {
          throw parseError;
        }
        console.error("❌ Erreur de parsing JSON:", parseError);
        console.error("JSON problématique:", cleanedJson.substring(0, 500));
        throw new Error("Le format des plans générés est invalide. Veuillez réessayer avec des chapitres plus clairs.");
      }
      
      if (plans.length === 0) {
        console.error("❌ L'IA a retourné un tableau vide");
        throw new Error("Aucun plan n'a été généré. Veuillez vérifier que les chapitres sont bien renseignés et réessayer.");
      }
      
      // ── Validation : minimum 4 unités ────────────────────────────────────
      if (plans.length < 4) {
        console.warn(`⚠️ Seulement ${plans.length} unité(s) générée(s) — minimum requis : 4. Relance possible.`);
        // On ne bloque pas, on avertit. L'utilisateur peut relancer si besoin.
        // Note : l'IA peut parfois en générer moins si le contenu est court.
      }
      if (plans.length > 6) {
        console.warn(`⚠️ ${plans.length} unités générées — tronqué à 6 (maximum autorisé)`);
        plans = plans.slice(0, 6);
      }
      
      console.log(`✓ ${plans.length} plan(s) validé(s) avec succès`);

      return plans.map((p: any, index: number) => {
        const sanitized = sanitizeUnitPlan(p, subject, gradeLevel);
        return {
          ...sanitized,
          id: Date.now().toString() + "-" + index
        };
      });
  
    } catch (error: any) {
      console.error("❌ Erreur génération planification complète:", error);
      const errorMsg = error?.message || String(error);
      
      // Propager l'erreur pour la gestion au niveau du Dashboard
      if (errorMsg.toLowerCase().includes("limite") || errorMsg.toLowerCase().includes("quota") || errorMsg.toLowerCase().includes("limit") || errorMsg.includes("429")) {
        throw new Error("❌ Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.");
      } else if (errorMsg.includes("OPENAI_API_KEY") || errorMsg.includes("GEMINI_API_KEY") || errorMsg.includes("No AI API key")) {
        throw new Error("❌ Erreur de connexion à l'IA. Vérifiez votre clé API.");
      }
      
      throw new Error(`❌ Erreur lors de la génération de la planification: ${errorMsg}`);
    }
  };

// ─────────────────────────────────────────────────────────────────────────────
// generateOverviewForSubject — Génère un résumé enrichi de toutes les unités
// d'une matière sur les 5 années PEI pour l'export Overview Word
// ─────────────────────────────────────────────────────────────────────────────
export interface OverviewUnitRow {
  grade: string;           // PEI 1, PEI 2, ...
  unitTitle: string;       // Titre de l'unité
  hoursTotal: string;      // Durée totale
  keyConcept: string;      // Concept clé
  relatedConcepts: string; // Concepts connexes (joined)
  globalContext: string;   // Contexte mondial
  statementOfInquiry: string; // Énoncé de recherche
  objectives: string;      // Objectifs spécifiques (critères)
  atlSkills: string;       // Compétences ATL
  content: string;         // Contenu / chapitres
}

export const generateOverviewForSubject = async (
  subject: string,
  allPlansByGrade: Record<string, UnitPlan[]>
): Promise<OverviewUnitRow[]> => {
  const rows: OverviewUnitRow[] = [];
  const grades = ['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'];

  for (const grade of grades) {
    const plans = allPlansByGrade[grade] || [];
    for (const plan of plans) {
      // Objectifs spécifiques : liste des critères évalués
      let objectives = '';
      if (plan.assessments && plan.assessments.length > 0) {
        objectives = plan.assessments.map(a => `Critère ${a.criterion}: ${a.criterionName}`).join('\n');
      } else if (plan.objectives && plan.objectives.length > 0) {
        objectives = Array.isArray(plan.objectives) ? plan.objectives.join('\n') : plan.objectives;
      }

      // Compétences ATL
      const atlSkills = Array.isArray(plan.atlSkills) ? plan.atlSkills.join('\n') : (plan.atlSkills || '');

      // Contenu
      const content = plan.chapters || plan.content || '';

      rows.push({
        grade,
        unitTitle: plan.title || '',
        hoursTotal: plan.duration || '',
        keyConcept: plan.keyConcept || '',
        relatedConcepts: Array.isArray(plan.relatedConcepts)
          ? plan.relatedConcepts.join(', ')
          : (plan.relatedConcepts || ''),
        globalContext: plan.globalContext || '',
        statementOfInquiry: plan.statementOfInquiry || '',
        objectives,
        atlSkills,
        content,
      });
    }
  }

  return rows;
};

// ─────────────────────────────────────────────────────────────────────────────
// INTERDISCIPLINARY UNIT PLANS — IB MYP / PEI compliant
// Rules implemented:
//  ▸ ≥ 2 disciplines (≥ 3 recommended), each with named teacher
//  ▸ Shared learning objectives (different from discipline-specific ones)
//  ▸ Structure in 3 IB phases : Recherche / Action / Réflexion
//  ▸ Criteria A, B, C each /8 with ≥ 3 strands, aligned to interdisciplinary theme
//  ▸ Per-unit interdisciplinary criteria (not the same as individual subject criteria)
//  ▸ Declarative statement of inquiry 15-35 words, no subject names
//  ▸ Research questions: factual, conceptual, debatable
//  ▸ Minimum 2 units per class
//  ▸ Summative task integrates all participating disciplines
// ─────────────────────────────────────────────────────────────────────────────

export interface InterdisciplinaryDisciplineBase {
  discipline: string;      // Nom de la discipline
  teacher: string;         // Nom de l'enseignant
  ibObjective: string;     // Objectif spécifique IB de cette discipline dans l'unité
  relatedConcepts: string[]; // Concepts connexes propres à cette discipline
  content: string;         // Contenus couverts par cette discipline
  learningActivities: string; // Activités d'apprentissage spécifiques
  summativeAssessment: string; // Évaluation sommative disciplinaire
}

export interface InterdisciplinaryUnit {
  id: string;
  grade: string;                   // PEI 1 … PEI 5
  title: string;                   // Titre de l'unité interdisciplinaire
  duration: string;                // Ex: "30 heures"
  disciplines: string[];           // Noms des disciplines (≥ 2, ≥ 3 recommandé)
  teachers: string[];              // Noms des enseignants (un par discipline, même ordre)
  // ── SECTION RECHERCHE ────────────────────────────────────────────────────
  integrationPurpose: string;      // But de l'intégration interdisciplinaire
  keyConcept: string;              // Concept clé IB
  relatedConcepts: string[];       // Concepts connexes globaux (communs aux disciplines)
  globalContext: string;           // Contexte mondial IB
  statementOfInquiry: string;      // Déclaratif 15-35 mots, sans nom de matière
  inquiryQuestions: {
    factual: string[];             // ≥ 2 questions factuelles
    conceptual: string[];          // ≥ 2 questions conceptuelles
    debatable: string[];           // ≥ 1 question débattable
  };
  // Critères d'évaluation sommative interdisciplinaires (A, B, C — chacun /8)
  // Ces critères sont DIFFÉRENTS des critères spécifiques de chaque matière ;
  // ils évaluent l'intégration et la synthèse interdisciplinaire.
  summativeCriteria: {
    criterion: 'A' | 'B' | 'C';
    name: string;                  // Nom du critère en lien avec le thème interdisciplinaire
    maxPoints: 8;
    discipline: string;            // Discipline qui évalue ce critère
    strands: string[];             // ≥ 3 sous-aspects
    task: string;                  // Description de la tâche liée à ce critère
  }[];
  atlSkills: string[];             // Compétences ATL communes
  // ── SECTION ACTION ───────────────────────────────────────────────────────
  disciplineBases: InterdisciplinaryDisciplineBase[]; // Une entrée par discipline
  interdisciplinaryLearningProcess: string; // Processus d'apprentissage interdisciplinaire
  formativeStrategies: string;     // Stratégies d'évaluation formative
  summativeTask: string;           // Tâche sommative finale intégrant toutes les disciplines
  differentiation: string;         // Différenciation
  resources: string;               // Ressources communes
  // ── SECTION RÉFLEXION ────────────────────────────────────────────────────
  phases: {
    recherche: string;             // Phase Recherche
    action: string;                // Phase Action
    reflexion: string;             // Phase Réflexion
  };
  reflection: {
    before: string;                // Avant l'unité
    during: string;                // Pendant l'unité
    after: string;                 // Suite à l'unité
  };
  // ── MÉTADONNÉES ──────────────────────────────────────────────────────────
  sharedObjectives: string[];      // Objectifs COMMUNS entre disciplines (≥ 2)
  content: string;                 // Contenu global résumé
  createdAt: string;
}

/** Prompt système pour la génération interdisciplinaire (IB MYP / PEI conforme) */
const INTERDISCIPLINARY_SYSTEM_PROMPT = `Tu es un expert en conception pédagogique IB MYP (Programme d'Éducation Intermédiaire).
Tu dois générer des UNITÉS INTERDISCIPLINAIRES strictement conformes aux normes IB PEI.

════════════════════════════════════════════════════
RÈGLES ABSOLUES — IB PEI INTERDISCIPLINAIRE
════════════════════════════════════════════════════

1. DISCIPLINES : chaque unité implique OBLIGATOIREMENT ≥ 2 disciplines (≥ 3 REQUIS pour IB).
   - Chaque discipline a un enseignant nommé et des objectifs spécifiques IB DIFFÉRENTS des objectifs communs.
   - Les disciplines apportent des perspectives COMPLÉMENTAIRES au thème commun.
   - Si seulement 2 disciplines sont fournies, suggère une 3ème discipline cohérente dans le champ "disciplines" du JSON.
   - INTERDIT : que deux disciplines soient identiques.

2. OBJECTIFS COMMUNS (sharedObjectives) — LOI ABSOLUE :
   - Liste de 2 à 4 objectifs D'APPRENTISSAGE PARTAGÉS entre TOUTES les disciplines.
   - Ces objectifs DOIVENT être ENTIÈREMENT DIFFÉRENTS des objectifs spécifiques IB de chaque matière.
   - Ils portent sur des compétences TRANSVERSALES interdisciplinaires :
     * Pensée critique et analyse comparative entre disciplines
     * Communication de démarches complexes intégrant plusieurs angles
     * Collaboration et co-construction interdisciplinaire
     * Transfert de connaissances d'une discipline à l'autre
   - Exemple VALIDE : "Analyser un phénomène complexe en mobilisant simultanément des outils de plusieurs disciplines"
   - Exemple INVALIDE : "Maîtriser les fractions" (trop spécifique à une seule matière)

3. ÉNONCÉ DE RECHERCHE (statementOfInquiry) — LOI ABSOLUE :
   - Phrase déclarative MÉMORABLE de 15 à 35 mots.
   - NE NOMME JAMAIS les matières ("La structure influence la fonction" — PAS "En maths et sciences…").
   - DOIT relier : [Concept clé officiel IB] + [Concept connexe] + [Contexte mondial IB].
   - Doit être transférable AU-DELÀ du contenu spécifique de l'unité.
   - Doit être UNIQUE pour chaque unité générée (pas de copier-coller entre unités).

4. STRUCTURE EN 3 PHASES IB — OBLIGATOIRE :
   - RECHERCHE : les élèves s'interrogent, explorent, documentent — investigation conceptuelle COMMUNE aux disciplines.
   - ACTION    : les élèves créent, expérimentent, produisent — réalisation concrète INTÉGRANT les disciplines.
   - RÉFLEXION : les élèves évaluent leurs apprentissages, réfléchissent au TRANSFERT et à l'impact interdisciplinaire.
   - Chaque phase doit montrer EXPLICITEMENT comment les disciplines collaborent (pas de silo disciplinaire).

5. CRITÈRES D'ÉVALUATION INTERDISCIPLINAIRES (summativeCriteria) — LOI ABSOLUE :
   - EXACTEMENT 3 critères : A, B, C — chacun noté sur 8 points.
   - Ces critères évaluent l'INTÉGRATION INTERDISCIPLINAIRE — JAMAIS les compétences spécifiques à une seule matière.
   - Les noms des critères doivent être ALIGNÉS SUR LE THÈME de l'unité (pas des noms génériques).
   - Critère A → ancré dans la discipline 1 mais avec dimension intégrative interdisciplinaire.
   - Critère B → ancré dans la discipline 2 mais avec dimension intégrative interdisciplinaire.
   - Critère C → critère TRANSVERSAL évaluant la synthèse, l'intégration et le transfert entre disciplines.
   - Chaque critère a EXACTEMENT ≥ 3 sous-aspects (strands) numérotés i., ii., iii.…
   - Chaque critère a une tâche (task) décrivant CONCRÈTEMENT ce que l'élève fait pour INTÉGRER les disciplines.
   - LOI : ces critères sont DIFFÉRENTS des critères d'évaluation spécifiques à chaque matière (ex: Critère A des Maths ≠ Critère A interdisciplinaire).

6. BASES DISCIPLINAIRES (disciplineBases) — une entrée par discipline :
   - ibObjective : l'objectif SPÉCIFIQUE IB de cette discipline dans cette unité (DIFFÉRENT des sharedObjectives).
   - relatedConcepts : concepts connexes propres à cette discipline contribuant à l'unité.
   - content : contenus disciplinaires spécifiques couverts dans cette unité.
   - learningActivities : activités montrant comment cette discipline CONTRIBUE À L'INTÉGRATION.
   - summativeAssessment : évaluation disciplinaire propre à cette matière (DIFFÉRENTE du summativeCriteria interdisciplinaire).

7. RÉFLEXION ENSEIGNANTS (reflection) :
   - 3 colonnes : avant / pendant / suite à l'unité.
   - Contient les ajustements pédagogiques, observations collaboratives, et impacts observés.

8. BUT DE L'INTÉGRATION (integrationPurpose) :
   - Expliquer POURQUOI ces disciplines sont combinées et ce que l'intégration apporte de PLUS que chaque matière seule.
   - Doit être spécifique au thème de cette unité (pas de formule générique).

9. QUESTIONS DE RECHERCHE :
   - ≥ 2 questions FACTUELLES (réponses définies, vérifiables)
   - ≥ 2 questions CONCEPTUELLES (réponses larges, analytiques)
   - ≥ 1 question DÉBATTABLE (pas de réponse unique — stimule le débat)
   - Toutes les questions doivent refléter l'aspect INTERDISCIPLINAIRE de l'unité.

10. MINIMUM PAR CLASSE — LOI IB :
    - Génère EXACTEMENT le nombre d'unités demandé (MINIMUM 2 par classe).
    - Chaque unité a un THÈME DIFFÉRENT mais utilise les mêmes disciplines.
    - Les critères d'évaluation (summativeCriteria) de chaque unité doivent être ADAPTÉS AU THÈME de cette unité.
    - JSON uniquement, clés en anglais, valeurs en français, aucun texte avant/après.`;

/**
 * Génère des unités interdisciplinaires IB PEI pour une classe donnée.
 *
 * @param grade                  Niveau de classe (ex: "PEI 3")
 * @param discipline1            Première discipline (ex: "Mathématiques")
 * @param discipline2            Deuxième discipline (ex: "Sciences")
 * @param additionalDisciplines  Disciplines supplémentaires (≥ 3 recommandé IB)
 * @param theme                  Thème directeur optionnel
 * @param count                  Nombre d'unités à générer (min 2)
 * @param teachers               Noms des enseignants (même ordre que disciplines)
 * @param sharedObjectives       Objectifs communs suggérés (facultatif)
 */
export const generateInterdisciplinaryUnits = async (
  grade: string,
  discipline1: string,
  discipline2: string,
  additionalDisciplines: string[] = [],
  theme: string = '',
  count: number = 2,
  teachers: string[] = [],
  sharedObjectives: string[] = []
): Promise<InterdisciplinaryUnit[]> => {
  const allDisciplines = [discipline1, discipline2, ...additionalDisciplines].filter(Boolean);
  const numUnits = Math.max(2, count);

  const teachersList = allDisciplines.map((d, i) =>
    teachers[i] && teachers[i].trim() ? teachers[i].trim() : `Enseignant(e) de ${d}`
  );

  const sharedObjHint = sharedObjectives.length > 0
    ? `\nObjectifs communs suggérés : ${sharedObjectives.join(' | ')}`
    : '';

  const themeNote = theme
    ? `\n❗ THÈME DIRECTEUR OBLIGATOIRE pour TOUTES les unités : "${theme}"\n   Les critères d'évaluation (summativeCriteria) de CHAQUE unité DOIVENT être alignés sur ce thème.`
    : '';

  const userPrompt = `Génère ${numUnits} unités interdisciplinaires IB PEI pour la classe ${grade}.

Disciplines impliquées : ${allDisciplines.join(', ')} (≥ 3 disciplines fortement recommandé par IB)
Enseignants : ${teachersList.join(', ')}
${theme ? `Thème directeur : ${theme}` : 'Thème : laissé à l\'IA — chaque unité doit avoir un thème différent et cohérent'}${sharedObjHint}${themeNote}

❗❗❗ RÈGLES ABSOLUES À RESPECTER POUR CHAQUE UNITÉ ❗❗❗

RÈGLE 1 — OBJECTIFS COMMUNS (sharedObjectives) :
Ces objectifs DOIVENT être ENTIÈREMENT DIFFÉRENTS des objectifs spécifiques de chaque matière.
Exemple VALIDE : "Analyser un phénomène en mobilisant simultanément les outils de ${allDisciplines.join(' et ')}"
Exemple INVALIDE : Répéter un objectif propre à une seule matière.

RÈGLE 2 — CRITÈRES INTERDISCIPLINAIRES (summativeCriteria) :
• EXACTEMENT 3 critères A, B, C — chacun sur 8 points — ALIGNÉS SUR LE THÈME de l'unité.
• Ces critères évaluent l'INTÉGRATION — pas les compétences disciplinaires isolées.
• Critère A : ancré dans ${discipline1} mais dimension intégrative.
• Critère B : ancré dans ${discipline2} mais dimension intégrative.
• Critère C : TRANSVERSAL — synthèse et transfert interdisciplinaire.
• LOI : ces noms de critères DOIVENT refléter le thème de l'unité, pas des formules génériques.
• Chaque critère : ≥ 3 strands numérotés i., ii., iii. + une tâche (task) concrète.

RÈGLE 3 — BASES DISCIPLINAIRES (disciplineBases) :
• ibObjective de chaque discipline = objectif IB SPÉCIFIQUE à cette matière (DIFFÉRENT des sharedObjectives).
• summativeAssessment de chaque discipline = évaluation propre à la matière (DIFFÉRENTE du summativeCriteria interdisciplinaire).

Pour chaque unité, génère un objet JSON avec EXACTEMENT cette structure :
{
  "title": "Titre de l'unité interdisciplinaire — thème DIFFÉRENT pour chaque unité",
  "duration": "30 heures",
  "disciplines": ${JSON.stringify(allDisciplines)},
  "teachers": ${JSON.stringify(teachersList)},

  "integrationPurpose": "Explication spécifique du but de l'intégration pour CETTE unité — pourquoi ces disciplines ensemble apportent plus que séparément sur CE thème",

  "keyConcept": "Un seul concept clé IB officiel parmi : Esthétique, Changement, Communication, Communautés, Connexions, Créativité, Culture, Développement, Forme, Interactions mondiales, Identité, Logique, Perspective, Relations, Systèmes, Temps-lieu-espace",
  "relatedConcepts": ["concept connexe 1 cohérent avec le thème", "concept connexe 2"],
  "globalContext": "Un des 6 contextes mondiaux IB : Identités et relations | Orientation dans l'espace et dans le temps | Expression personnelle et culturelle | Innovation scientifique et technique | Mondialisation et durabilité | Équité et développement",
  "statementOfInquiry": "Phrase déclarative MÉMORABLE 15-35 mots — SANS nommer les matières — reliant concept clé + concept connexe + contexte mondial — UNIQUE pour cette unité",

  "inquiryQuestions": {
    "factual": ["Question factuelle 1 liée au thème ?", "Question factuelle 2 ?"],
    "conceptual": ["Question conceptuelle 1 liée à l'intégration des disciplines ?", "Question conceptuelle 2 ?"],
    "debatable": ["Question invitant au débat sans réponse unique — dimension interdisciplinaire ?"]
  },

  "sharedObjectives": [
    "Objectif commun 1 — compétence TRANSVERSALE entre ${allDisciplines.join(' et ')} (DIFFÉRENT des objectifs IB spécifiques à chaque matière)",
    "Objectif commun 2 — développement d'une perspective interdisciplinaire spécifique au thème"
  ],

  "summativeCriteria": [
    {
      "criterion": "A",
      "name": "Nom du critère A ALIGNÉ SUR LE THÈME — intégration ${discipline1}",
      "maxPoints": 8,
      "discipline": "${discipline1}",
      "strands": [
        "i. sous-aspect spécifique à ce critère et ce thème",
        "ii. sous-aspect intégratif liant ${discipline1} au thème commun",
        "iii. sous-aspect évaluant la dimension interdisciplinaire"
      ],
      "task": "Description concrète de la tâche que l'élève accomplit pour démontrer l'intégration — liée au thème"
    },
    {
      "criterion": "B",
      "name": "Nom du critère B ALIGNÉ SUR LE THÈME — intégration ${discipline2}",
      "maxPoints": 8,
      "discipline": "${discipline2}",
      "strands": [
        "i. sous-aspect spécifique à ce critère et ce thème",
        "ii. sous-aspect intégratif liant ${discipline2} au thème commun",
        "iii. sous-aspect évaluant la dimension interdisciplinaire"
      ],
      "task": "Description concrète de la tâche liée au critère B — dimension interdisciplinaire du thème"
    },
    {
      "criterion": "C",
      "name": "Synthèse et transfert — [intitulé lié au THÈME spécifique de cette unité]",
      "maxPoints": 8,
      "discipline": "Interdisciplinaire",
      "strands": [
        "i. Capacité à intégrer les perspectives de toutes les disciplines sur le thème",
        "ii. Communication argumentée de la démarche interdisciplinaire",
        "iii. Transfert des apprentissages à de nouveaux contextes liés au thème"
      ],
      "task": "Tâche transversale synthétisant l'apport de toutes les disciplines sur le thème de l'unité"
    }
  ],

  "atlSkills": ["Compétence ATL de pensée critique", "Compétence ATL de communication", "Compétence ATL de collaboration interdisciplinaire"],

  "disciplineBases": [
${allDisciplines.map((d, i) => `    {
      "discipline": "${d}",
      "teacher": "${teachersList[i]}",
      "ibObjective": "Objectif spécifique IB de ${d} dans cette unité — DIFFÉRENT des sharedObjectives",
      "relatedConcepts": ["concept connexe propre à ${d} pour cette unité"],
      "content": "Contenus disciplinaires spécifiques de ${d} couverts dans cette unité",
      "learningActivities": "Activités d'apprentissage de ${d} montrant sa CONTRIBUTION À L'INTÉGRATION interdisciplinaire",
      "summativeAssessment": "Évaluation sommative propre à ${d} — DIFFÉRENTE du summativeCriteria interdisciplinaire"
    }`).join(',\n')}
  ],

  "interdisciplinaryLearningProcess": "Description du processus d'apprentissage interdisciplinaire — comment les élèves naviguent entre les disciplines et construisent une compréhension COMMUNE du thème",
  "formativeStrategies": "Stratégies d'évaluation formative COMMUNES à toutes les disciplines — permettant de vérifier la progression de l'intégration",
  "summativeTask": "Description complète de la tâche sommative FINALE qui intègre TOUTES les disciplines — production concrète attendue et critères de réussite",
  "differentiation": "Stratégies de différenciation pour répondre aux besoins variés des élèves dans le cadre interdisciplinaire",
  "resources": "Ressources communes à toutes les disciplines pour cette unité",

  "phases": {
    "recherche": "Phase RECHERCHE (2-3 paragraphes) : investigation conceptuelle COMMUNE — questions posées, sources explorées, outils de chaque discipline mobilisés pour investiguer le thème",
    "action": "Phase ACTION (2-3 paragraphes) : production concrète INTÉGRANT les disciplines — ce que les élèves créent/réalisent ensemble, rôle de chaque discipline",
    "reflexion": "Phase RÉFLEXION (2-3 paragraphes) : évaluation des apprentissages, transfert interdisciplinaire, impact observé, auto-évaluation de la collaboration"
  },

  "reflection": {
    "before": "Avant l'unité : hypothèses, attentes des enseignants, planification collaborative",
    "during": "Pendant l'unité : observations, ajustements pédagogiques, difficultés rencontrées dans la collaboration interdisciplinaire",
    "after": "Suite à l'unité : évaluation de l'impact interdisciplinaire, apprentissages retenus, améliorations futures"
  },

  "content": "Résumé global du contenu couvert par TOUTES les disciplines dans cette unité"
}

Retourne un tableau JSON de ${numUnits} objets. Chaque unité a un THÈME DIFFÉRENT. Aucun texte avant ou après le JSON.`;

  try {
    const rawText = await callGeminiViaProxy(userPrompt, INTERDISCIPLINARY_SYSTEM_PROMPT, {
      temperature: 0.7,
      maxOutputTokens: 65536,
      responseMimeType: 'application/json',
    });

    if (!rawText || rawText.trim() === '') {
      throw new Error("L'IA n'a pas retourné de réponse. Réessayez.");
    }

    // Extraire le JSON
    let jsonText = rawText.trim();
    const startArr = jsonText.indexOf('[');
    const startObj = jsonText.indexOf('{');
    if (startArr !== -1 && (startObj === -1 || startArr < startObj)) {
      jsonText = jsonText.substring(startArr);
      const lastBracket = jsonText.lastIndexOf(']');
      if (lastBracket !== -1) jsonText = jsonText.substring(0, lastBracket + 1);
    } else if (startObj !== -1) {
      jsonText = '[' + jsonText.substring(startObj);
      const lastBrace = jsonText.lastIndexOf('}');
      if (lastBrace !== -1) jsonText = jsonText.substring(0, lastBrace + 1) + ']';
    }

    let parsed: any[];
    try {
      parsed = JSON.parse(jsonText);
    } catch {
      const fixed = fixJsonString(jsonText);
      parsed = JSON.parse(fixed);
    }

    if (!Array.isArray(parsed) || parsed.length === 0) {
      throw new Error("La réponse de l'IA ne contient pas d'unités valides.");
    }

    // Normaliser et ajouter les IDs
    return parsed.map((unit: any, idx: number) => {
      // Normaliser les bases disciplinaires
      const disciplineBases: InterdisciplinaryDisciplineBase[] = allDisciplines.map((d, di) => {
        const base = Array.isArray(unit.disciplineBases)
          ? unit.disciplineBases.find((b: any) => b.discipline === d) || unit.disciplineBases[di] || {}
          : {};
        return {
          discipline: d,
          teacher: teachersList[di],
          ibObjective: base.ibObjective || `Objectif spécifique IB de ${d}`,
          relatedConcepts: Array.isArray(base.relatedConcepts) ? base.relatedConcepts : [],
          content: base.content || '',
          learningActivities: base.learningActivities || '',
          summativeAssessment: base.summativeAssessment || '',
        };
      });

      // Normaliser les critères sommatives (garantir exactement A, B, C avec ≥ 3 strands)
      const rawCriteria = Array.isArray(unit.summativeCriteria) ? unit.summativeCriteria :
                          Array.isArray(unit.criteria) ? unit.criteria : [];
      const criteriaLetters: ('A' | 'B' | 'C')[] = ['A', 'B', 'C'];
      const summativeCriteria = criteriaLetters.map((letter, ci) => {
        const found = rawCriteria.find((c: any) => c.criterion === letter) || rawCriteria[ci] || {};
        const strands = Array.isArray(found.strands) && found.strands.length >= 3
          ? found.strands
          : [
              `i. Capacité à mobiliser les savoirs de ${allDisciplines[ci] || 'la discipline'} dans un contexte interdisciplinaire`,
              `ii. Qualité de l'intégration et de la mise en relation des disciplines`,
              `iii. Pertinence et rigueur de la démarche interdisciplinaire`,
            ];
        return {
          criterion: letter,
          name: found.name || (letter === 'C' ? 'Synthèse et transfert interdisciplinaire' : `Intégration — ${allDisciplines[ci] || ''}`),
          maxPoints: 8 as const,
          discipline: found.discipline || (letter === 'C' ? 'Interdisciplinaire' : (allDisciplines[ci] || '')),
          strands,
          task: found.task || found.description || `Tâche sommative — Critère ${letter}`,
        };
      });

      return {
        id: `interdisciplinary_${Date.now()}_${idx}`,
        grade,
        title: unit.title || `Unité interdisciplinaire ${idx + 1}`,
        duration: unit.duration || '30 heures',
        disciplines: allDisciplines,
        teachers: teachersList,
        integrationPurpose: unit.integrationPurpose || '',
        keyConcept: unit.keyConcept || '',
        relatedConcepts: Array.isArray(unit.relatedConcepts) ? unit.relatedConcepts : [],
        globalContext: unit.globalContext || '',
        statementOfInquiry: unit.statementOfInquiry || '',
        inquiryQuestions: {
          factual:    Array.isArray(unit.inquiryQuestions?.factual)    ? unit.inquiryQuestions.factual    : [],
          conceptual: Array.isArray(unit.inquiryQuestions?.conceptual) ? unit.inquiryQuestions.conceptual : [],
          debatable:  Array.isArray(unit.inquiryQuestions?.debatable)  ? unit.inquiryQuestions.debatable  : [],
        },
        sharedObjectives: Array.isArray(unit.sharedObjectives) ? unit.sharedObjectives : [],
        summativeCriteria,
        atlSkills: Array.isArray(unit.atlSkills) ? unit.atlSkills : [],
        disciplineBases,
        interdisciplinaryLearningProcess: unit.interdisciplinaryLearningProcess || '',
        formativeStrategies: unit.formativeStrategies || '',
        summativeTask: unit.summativeTask || '',
        differentiation: unit.differentiation || '',
        resources: unit.resources || '',
        phases: {
          recherche: unit.phases?.recherche || '',
          action:    unit.phases?.action    || '',
          reflexion: unit.phases?.reflexion || '',
        },
        reflection: {
          before: unit.reflection?.before || '',
          during: unit.reflection?.during || '',
          after:  unit.reflection?.after  || '',
        },
        content: unit.content || '',
        createdAt: new Date().toISOString(),
      };
    });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    if (errorMsg.includes('quota') || errorMsg.includes('429') || errorMsg.includes('Limite')) {
      throw new Error("Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.");
    }
    if (errorMsg.includes('API') || errorMsg.includes('connexion')) {
      throw new Error("Erreur de connexion à l'IA. Vérifiez votre clé API.");
    }
    throw new Error(`❌ Erreur lors de la génération interdisciplinaire: ${errorMsg}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// DRIVE-FORM TAG PARSER
// Convertit un texte balisé (type formulaire Google Drive) en configuration
// de génération d'unité. Tags requis et optionnels définis ci-dessous.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Tags reconnus dans le formulaire Drive :
 *
 * OBLIGATOIRES :
 *   [MATIERE]       Nom de la matière (ex: Mathématiques)
 *   [CLASSE]        Niveau de classe (ex: PEI 3)
 *   [CHAPITRES]     Liste des chapitres / thèmes du programme
 *
 * OPTIONNELS :
 *   [ENSEIGNANT]    Nom de l'enseignant
 *   [RESSOURCES]    Ressources disponibles
 *   [CONCEPT_CLE]   Concept clé imposé (ex: Changement)
 *   [CONTEXTE]      Contexte mondial imposé
 *   [DUREE]         Durée de l'unité (ex: 30h)
 *   [ENONCE]        Énoncé de recherche proposé (l'IA peut l'affiner)
 *   [DISCIPLINE2]   Deuxième discipline pour une unité interdisciplinaire
 *   [THEME]         Thème directeur libre
 *   [NOMBRE_UNITES] Nombre d'unités à générer (défaut: auto selon chapitres)
 */
export const DRIVE_FORM_TAGS = {
  required: ['[MATIERE]', '[CLASSE]', '[CHAPITRES]'],
  optional: [
    '[DISCIPLINE2]',
    '[DISCIPLINE3]',
    '[ENSEIGNANT]',
    '[RESSOURCES]',
    '[CONCEPT_CLE]',
    '[CONTEXTE]',
    '[DUREE]',
    '[ENONCE]',
    '[THEME]',
    '[NOMBRE_UNITES]',
    '[OBJECTIFS_COMMUNS]',
  ],
  all: [
    '[MATIERE]', '[CLASSE]', '[CHAPITRES]',
    '[DISCIPLINE2]', '[DISCIPLINE3]',
    '[ENSEIGNANT]', '[RESSOURCES]', '[CONCEPT_CLE]',
    '[CONTEXTE]', '[DUREE]', '[ENONCE]',
    '[THEME]', '[NOMBRE_UNITES]', '[OBJECTIFS_COMMUNS]',
  ],
};

export interface DriveFormConfig {
  subject: string;
  grade: string;
  chapters: string;
  teacherName?: string;
  resources?: string;
  keyConcept?: string;
  globalContext?: string;
  duration?: string;
  statementOfInquiry?: string;
  discipline2?: string;
  discipline3?: string;
  theme?: string;
  numberOfUnits?: number;
  sharedObjectives?: string[];
  isInterdisciplinary: boolean;
  missingRequired: string[];
  warnings: string[];
}

/**
 * Parse un texte balisé au format Drive-form et retourne une configuration
 * prête à être passée à generateCourseFromChapters ou generateInterdisciplinaryUnits.
 *
 * @param formText  Texte complet du formulaire avec balises [TAG] valeur
 * @returns DriveFormConfig avec les champs extraits et les erreurs détectées
 */
export const parseDriveFormTags = (formText: string): DriveFormConfig => {
  const warnings: string[] = [];

  /**
   * Extrait la valeur qui suit un tag jusqu'au prochain tag ou fin de texte.
   * Format attendu : "[TAG] valeur sur une ou plusieurs lignes"
   */
  const extractTag = (tag: string): string => {
    // Échapper les crochets pour la regex
    const escaped = tag.replace(/\[/g, '\\[').replace(/\]/g, '\\]');
    // Capturer tout ce qui suit le tag jusqu'au prochain tag ou fin
    const pattern = new RegExp(`${escaped}\\s*([\\s\\S]*?)(?=\\[[A-Z_]+\\]|$)`, 'i');
    const match = formText.match(pattern);
    if (!match) return '';
    return match[1].trim();
  };

  const subject       = extractTag('[MATIERE]');
  const grade         = extractTag('[CLASSE]');
  const chapters      = extractTag('[CHAPITRES]');
  const teacherName   = extractTag('[ENSEIGNANT]') || undefined;
  const resources     = extractTag('[RESSOURCES]') || undefined;
  const keyConcept    = extractTag('[CONCEPT_CLE]') || undefined;
  const globalContext = extractTag('[CONTEXTE]') || undefined;
  const duration      = extractTag('[DUREE]') || undefined;
  const statementOfInquiry = extractTag('[ENONCE]') || undefined;
  const discipline2   = extractTag('[DISCIPLINE2]') || undefined;
  const discipline3   = extractTag('[DISCIPLINE3]') || undefined;
  const theme         = extractTag('[THEME]') || undefined;
  const sharedObjRaw  = extractTag('[OBJECTIFS_COMMUNS]');
  const sharedObjectives = sharedObjRaw
    ? sharedObjRaw.split(/[|;\n]/).map(s => s.trim()).filter(Boolean)
    : undefined;

  const numUnitsRaw   = extractTag('[NOMBRE_UNITES]');
  const numberOfUnits = numUnitsRaw ? parseInt(numUnitsRaw, 10) || undefined : undefined;

  // Vérifier les tags obligatoires
  const missingRequired: string[] = [];
  if (!subject)   missingRequired.push('[MATIERE]');
  if (!grade)     missingRequired.push('[CLASSE]');
  // Pour le mode interdisciplinaire, [CHAPITRES] est facultatif (remplacé par thème)
  if (!chapters && !discipline2) missingRequired.push('[CHAPITRES]');

  // Vérifications supplémentaires
  if (statementOfInquiry && statementOfInquiry.split(' ').length < 10) {
    warnings.push("L'énoncé de recherche proposé semble trop court (moins de 10 mots). L'IA le reformulera.");
  }
  if (discipline2 && discipline2.trim().toLowerCase() === subject.toLowerCase()) {
    warnings.push("[DISCIPLINE2] est identique à [MATIERE]. Pour une unité interdisciplinaire, choisissez une discipline différente.");
  }
  if (discipline3 && (discipline3.trim().toLowerCase() === subject.toLowerCase() || discipline3.trim().toLowerCase() === discipline2?.toLowerCase())) {
    warnings.push("[DISCIPLINE3] est identique à une discipline déjà renseignée.");
  }
  const isInterdisciplinary = Boolean(discipline2 && discipline2.trim() !== '');
  if (isInterdisciplinary && (!numberOfUnits || numberOfUnits < 2)) {
    warnings.push("Minimum 2 unités interdisciplinaires par classe (norme IB PEI). [NOMBRE_UNITES] sera mis à 2 au minimum.");
  }

  return {
    subject,
    grade,
    chapters,
    teacherName,
    resources,
    keyConcept,
    globalContext,
    duration,
    statementOfInquiry,
    discipline2,
    discipline3,
    theme,
    numberOfUnits,
    sharedObjectives,
    isInterdisciplinary,
    missingRequired,
    warnings,
  };
};

/**
 * Génère des unités à partir d'une configuration Drive-form.
 * Détecte automatiquement si c'est interdisciplinaire et appelle la bonne fonction.
 */
export const generateFromDriveForm = async (config: DriveFormConfig): Promise<UnitPlan[] | InterdisciplinaryUnit[]> => {
  if (config.missingRequired.length > 0) {
    throw new Error(
      `Formulaire incomplet — tags obligatoires manquants : ${config.missingRequired.join(', ')}\n\n` +
      `Tags requis : [MATIERE], [CLASSE], [CHAPITRES] (ou [DISCIPLINE2] pour interdisciplinaire)`
    );
  }

  if (config.isInterdisciplinary && config.discipline2) {
    // Construire la liste des disciplines supplémentaires
    const additionalDisciplines: string[] = [];
    if (config.discipline3 && config.discipline3.trim()) additionalDisciplines.push(config.discipline3.trim());

    // Construire la liste des enseignants (séparés par | dans [ENSEIGNANT])
    const teacherNames = config.teacherName
      ? config.teacherName.split('|').map(t => t.trim()).filter(Boolean)
      : [];

    return generateInterdisciplinaryUnits(
      config.grade,
      config.subject,
      config.discipline2,
      additionalDisciplines,
      config.theme,
      Math.max(2, config.numberOfUnits ?? 2),
      teacherNames,
      config.sharedObjectives || [],
    );
  }

  // Construire le texte de chapitres enrichi avec les options du formulaire
  let enrichedChapters = config.chapters;
  if (config.keyConcept)          enrichedChapters += `\n\nConcept clé imposé: ${config.keyConcept}`;
  if (config.globalContext)       enrichedChapters += `\nContexte mondial imposé: ${config.globalContext}`;
  if (config.statementOfInquiry)  enrichedChapters += `\nÉnoncé de recherche suggéré: ${config.statementOfInquiry}`;
  if (config.theme)               enrichedChapters += `\nThème directeur: ${config.theme}`;

  const plans = await generateCourseFromChapters(enrichedChapters, config.subject, config.grade);

  // Enrichir avec les métadonnées du formulaire
  return plans.map(plan => ({
    ...plan,
    teacherName: config.teacherName || plan.teacherName,
    resources:   config.resources   || plan.resources,
    duration:    config.duration    || plan.duration,
  }));
};
