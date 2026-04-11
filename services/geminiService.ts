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

// Helper function to detect if subject is ART or EPS (need Arabic version)
const isArtOrEPS = (subject: string): boolean => {
  const normalized = subject.toLowerCase().trim();
  return normalized.includes('arts') || 
         normalized.includes('art') || 
         normalized.includes('éducation physique') || 
         normalized.includes('eps') ||
         normalized.includes('santé');
};

// Get language code based on subject
const getGenerationLanguage = (subject: string): 'fr' | 'en' | 'bilingual' => {
  if (isLanguageAcquisition(subject)) return 'en';
  if (isArtOrEPS(subject)) return 'bilingual'; // Français + Arabe
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

// Robust JSON extractor with better error handling
const cleanJsonText = (text: string): string => {
  if (!text) return "{}";
  
  try {
    // Remove markdown blocks first to clean up obvious noise
    let clean = text.replace(/```json/g, "").replace(/```/g, "").trim();
    
    // Remove any leading/trailing text that's not JSON
    clean = clean.replace(/^[^{\[]*/, '').replace(/[^}\]]*$/, '');
    
    // Find the index of the first '{' or '['
    const firstCurly = clean.indexOf('{');
    const firstSquare = clean.indexOf('[');
    
    let start = -1;
    let end = -1;

    // Determine if it's an Object or Array based on which comes first
    if (firstCurly !== -1 && (firstSquare === -1 || firstCurly < firstSquare)) {
        start = firstCurly;
        end = clean.lastIndexOf('}');
    } else if (firstSquare !== -1) {
        start = firstSquare;
        end = clean.lastIndexOf(']');
    }

    if (start !== -1 && end !== -1 && end > start) {
        let extracted = clean.substring(start, end + 1);
        
        // Apply aggressive JSON string fixing
        extracted = fixJsonString(extracted);
        
        // Remove trailing commas before closing brackets
        extracted = extracted.replace(/,(\s*[}\]])/g, '$1');
        
        // Try to parse
        try {
          JSON.parse(extracted);
          return extracted;
        } catch (parseError: any) {
          console.warn("First parse attempt failed, trying additional fixes...");
          
          // Additional fallback: try to fix common issues
          // Remove any remaining control characters
          extracted = extracted.replace(/[\x00-\x1F\x7F]/g, '');
          
          // Validate it's parseable
          JSON.parse(extracted);
          return extracted;
        }
    }
  } catch (e) {
    console.warn("JSON cleaning failed:", e);
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

const getDefaultCriteria = (subject: string) => {
  const norm = subject.toLowerCase();
  if (norm.includes('math')) return DEFAULT_CRITERIA_BY_SUBJECT['mathématiques'];
  if (norm.includes('science')) return DEFAULT_CRITERIA_BY_SUBJECT['sciences'];
  if (norm.includes('individu') || norm.includes('société')) return DEFAULT_CRITERIA_BY_SUBJECT['individus et sociétés'];
  return DEFAULT_CRITERIA_BY_SUBJECT['default'];
};

// ─────────────────────────────────────────────────────────────────────────────
// RÈGLE OBLIGATOIRE IB : Au minimum 2 critères avec au moins 3 sous-aspects chacun
// Cette fonction corrige automatiquement ce que l'IA aurait pu oublier.
// ─────────────────────────────────────────────────────────────────────────────
const enforceAssessmentsRules = (assessments: AssessmentData[], subject: string): AssessmentData[] => {
  const defaults = getDefaultCriteria(subject);
  let result = [...assessments];

  // ── Règle 1 : chaque critère doit avoir ≥ 3 sous-aspects (strands) ─────────
  result = result.map(a => {
    if (a.strands.length >= 3) return a;
    // Compléter avec les sous-aspects par défaut pour ce critère
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

  // ── Règle 3 : il faut OBLIGATOIREMENT au minimum 2 critères ───────────────
  if (result.length < 2) {
    const existingLetters = result.map(a => a.criterion);
    // Choisir parmi les critères par défaut ceux qui ne sont pas déjà présents
    const toAdd = defaults.filter(d => !existingLetters.includes(d.criterion));
    const needed = 2 - result.length;
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

  // ── Règle 4 : pas plus de 3 critères par unité (règle IB) ─────────────────
  if (result.length > 3) {
    console.warn(`⚠️ ${result.length} critères → tronqué à 3 (règle IB)`);
    result = result.slice(0, 3);
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
  subject?: string
): Promise<string[]> => {
  const lang = subject ? getGenerationLanguage(subject) : 'fr';
  try {
    const relatedStr = relatedConcepts.join(", ");
    
    const prompt = lang === 'en'
      ? `
        Act as an expert IB MYP coordinator.
        Create 3 distinct options for a "Statement of Inquiry" based on the following elements:
        
        Key Concept: ${keyConcept}
        Related Concepts: ${relatedStr}
        Global Context: ${globalContext}
        
        The statement of inquiry should be a meaningful and transferable statement that combines these elements without directly mentioning the specific content of the subject.
        Return ONLY the 3 statements as plain text list, separated by line breaks. Do not number or add introductory text.
      `
      : `
        Agis comme un coordonnateur expert du PEI de l'IB.
        Crée 3 options distinctes pour un "Énoncé de recherche" (Statement of Inquiry) basé sur les éléments suivants :
        
        Concept clé : ${keyConcept}
        Concepts connexes : ${relatedStr}
        Contexte mondial : ${globalContext}
        
        L'énoncé de recherche doit être une déclaration significative et transférable qui combine ces éléments sans mentionner directement le contenu spécifique de la matière.
        Retourne UNIQUEMENT les 3 énoncés sous forme de liste de texte brut, séparés par des retours à la ligne. Ne pas numéroter ni ajouter de texte d'introduction.
      `;

    const text = await callGeminiViaProxy(prompt);
    return text.split('\n').filter(line => line.trim().length > 0).map(l => l.replace(/^- /, '').trim());
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
  subject?: string
): Promise<{ factual: string[], conceptual: string[], debatable: string[] }> => {
  try {
    const lang = subject ? getGenerationLanguage(subject) : 'fr';
    
    const prompt = lang === 'en'
      ? `
        Based on this MYP Statement of Inquiry: "${soi}",
        generate inquiry questions in English:
        - 2 Factual Questions (What/Who... ?)
        - 2 Conceptual Questions (How... ? Why... ?)
        - 2 Debatable Questions (To what extent... ?)
        
        Return the result in valid JSON format with these EXACT KEYS (in English):
        {
          "factual": ["q1", "q2"],
          "conceptual": ["q1", "q2"],
          "debatable": ["q1", "q2"]
        }
        Return ONLY the JSON.
      `
      : `
        Basé sur cet Énoncé de recherche du PEI : "${soi}",
        génère des questions de recherche en Français :
        - 2 Questions Factuelles (Quoi/Qui... ?)
        - 2 Questions Conceptuelles (Comment... ? Pourquoi... ?)
        - 2 Questions Invitant au débat (Dans quelle mesure... ?)
        
        Retourne le résultat au format JSON valide avec ces CLÉS EXACTES (en anglais) :
        {
          "factual": ["q1", "q2"],
          "conceptual": ["q1", "q2"],
          "debatable": ["q1", "q2"]
        }
        Retourne UNIQUEMENT le JSON.
      `;

    const rawText = await callGeminiViaProxy(prompt, undefined, { responseMimeType: 'application/json' });
    const jsonText = cleanJsonText(rawText);
    const parsed = JSON.parse(jsonText);
    return parsed;
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

// Shared System Prompt for consistent generation (French)
const SYSTEM_INSTRUCTION_FULL_PLAN_FR = `
Tu es un expert pédagogique du Programme d'Éducation Intermédiaire (PEI) de l'IB.
Tu dois générer un Plan d'Unité complet ET une série d'Évaluations Critériées détaillées en Français.

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

// Shared System Prompt for Bilingual generation (ART and EPS - French + Arabic)
const SYSTEM_INSTRUCTION_FULL_PLAN_BILINGUAL = `
Tu es un expert coordinateur pédagogique du Programme d'Éducation Intermédiaire (PEI) de l'IB, spécialisé en Arts visuels et en Éducation Physique.
Tu dois générer un plan d'unité complet BILINGUE (FRANÇAIS + ARABE) ET une série d'évaluations détaillées basées sur les critères.

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

⚠️ RÈGLE CRUCIALE POUR ART ET EPS : GÉNÉRATION BILINGUE
Pour les matières Arts et Éducation Physique et à la santé, TOUTES les sections doivent être générées en DEUX VERSIONS:
1. VERSION FRANÇAISE (originale)
2. VERSION ARABE (traduction complète et fidèle)

FORMAT BILINGUE POUR CHAQUE SECTION:
- Champ français: "nomChamp": "Contenu en français..."
- Champ arabe: "nomChamp_ar": "المحتوى بالعربية..."

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
1. Utilise UNIQUEMENT les CLÉS JSON EN FRANÇAIS ci-dessous. NE PAS LES TRADUIRE.
2. Le CONTENU (valeurs) doit être en FRANÇAIS ET EN ARABE (deux champs séparés).
3. Ne laisse AUCUN champ vide. Remplis TOUTES les sections en français ET en arabe.
4. La traduction arabe doit être précise, naturelle et pédagogiquement appropriée.
5. ⚠️ CRITIQUE - VALIDITÉ JSON :
   - Assure-toi que le JSON est PARFAITEMENT VALIDE
   - Pas de virgules trainantes avant les accolades fermantes
   - Échappe correctement les guillemets dans les chaînes avec \"
   - Échappe correctement les retours à la ligne avec \n
   - N'utilise PAS de sauts de ligne réels dans les chaînes JSON
   - Teste mentalement la validité du JSON avant de répondre

CHAMPS OBLIGATOIRES ET DÉTAILLÉS (avec versions arabes):
- "learningExperiences": Détailler les ACTIVITÉS PRATIQUES D'APPRENTISSAGE et STRATÉGIES PÉDAGOGIQUES (ateliers pratiques, démonstration de techniques, observation d'artistes...).
- "learningExperiences_ar": النسخة العربية الكاملة للأنشطة التعليمية العملية والاستراتيجيات
- "formativeAssessment": Préciser les méthodes d'ÉVALUATION FORMATIVE pratique (portfolio, observation directe, esquisse préparatoire, carnet de croquis...).
- "formativeAssessment_ar": النسخة العربية الكاملة لطرق التقييم التكويني
- "differentiation": Préciser les stratégies de DIFFÉRENCIATION (modèles simplifiés pour élèves en difficulté, contraintes supplémentaires pour élèves avancés, choix des matériaux...).
- "differentiation_ar": النسخة العربية الكاملة لاستراتيجيات التمايز

RÈGLES SPÉCIFIQUES POUR LES TÂCHES PRATIQUES ARTS (CRUCIAL):
1. CHAQUE CRITÈRE doit évaluer AU MINIMUM 3 sous-aspects différents (i, ii, iii, iv, ou v)
2. Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v est valide)
3. Une tâche pratique PEUT évaluer 2-3 sous-aspects simultanément si pertinent
   - Exemple: "Critère A: i. et iii." (une tâche évalue 2 aspects)
4. VARIER les types de travaux pratiques pour couvrir différentes compétences artistiques
5. La clé "criterionReference" doit indiquer TOUS les aspects évalués et les compétences pratiques observées
6. CHAQUE tâche doit avoir une version arabe complète (title_ar, content_ar, criterionReference_ar)
7. LAISSER suffisamment d'espace de création (ne pas surcharger la feuille d'instructions)

GESTION DES RESSOURCES DANS LES TÂCHES PRATIQUES:
- Si la tâche nécessite l'analyse d'une œuvre d'art, écrire EXPLICITEMENT: "[Insérer reproduction de l'œuvre ici : Nom de l'artiste, Titre de l'œuvre, Date, Technique, Dimensions]".
- Si la tâche nécessite un modèle de référence, écrire EXPLICITEMENT: "[Insérer image de référence ici : description détaillée du sujet à observer/reproduire]".
- AJOUTER des zones dédiées à la création :
  * Pour les tâches de dessin/peinture : "\n\n[ZONE DE CRÉATION - Laisser suffisamment d'espace pour la réalisation pratique]\n"
  * Pour les analyses : ajouter des lignes de réponse "\n\nObservations :\n................................................................................................................................................................................................\n................................................................................................................................................................................................"
  * Adapter l'espace selon le type de tâche pratique

Structure JSON attendue (avec champs arabes):
{
  "title": "Titre en français",
  "title_ar": "العنوان بالعربية",
  "duration": "XX heures",
  "duration_ar": "XX ساعة",
  "chapters": "- Chapitre 1: ...\n- Chapitre 2: ...\n- Chapitre 3: ...",
  "chapters_ar": "- الفصل الأول: ...\n- الفصل الثاني: ...\n- الفصل الثالث: ...",
  "keyConcept": "Un concept clé",
  "keyConcept_ar": "مفهوم رئيسي",
  "relatedConcepts": ["Concept 1", "Concept 2"],
  "relatedConcepts_ar": ["المفهوم الأول", "المفهوم الثاني"],
  "globalContext": "Un contexte mondial",
  "globalContext_ar": "سياق عالمي",
  "statementOfInquiry": "Phrase complète...",
  "statementOfInquiry_ar": "جملة كاملة...",
  "inquiryQuestions": {
    "factual": ["Q1", "Q2"],
    "factual_ar": ["س1", "س2"],
    "conceptual": ["Q1", "Q2"],
    "conceptual_ar": ["س1", "س2"],
    "debatable": ["Q1", "Q2"],
    "debatable_ar": ["س1", "س2"]
  },
  "objectives": ["Critère A: ...", "Critère B: ..."],
  "objectives_ar": ["المعيار أ: ...", "المعيار ب: ..."],
  "atlSkills": ["Compétence 1...", "Compétence 2..."],
  "atlSkills_ar": ["المهارة الأولى...", "المهارة الثانية..."],
  "content": "Contenu détaillé...",
  "content_ar": "المحتوى المفصل...",
  "learningExperiences": "Activités ET stratégies pédagogiques détaillées...",
  "learningExperiences_ar": "الأنشطة والاستراتيجيات التعليمية المفصلة...",
  "summativeAssessment": "Description de la tâche finale...",
  "summativeAssessment_ar": "وصف المهمة النهائية...",
  "formativeAssessment": "Description des évaluations formatives...",
  "formativeAssessment_ar": "وصف التقييمات التكوينية...",
  "differentiation": "Stratégies de différenciation...",
  "differentiation_ar": "استراتيجيات التمايز...",
  "resources": "Livres, liens...",
  "resources_ar": "الكتب، الروابط...",
  "reflection": {
     "prior": "Connaissances préalables...",
     "prior_ar": "المعرفة المسبقة...",
     "during": "Engagement...",
     "during_ar": "المشاركة...",
     "after": "Résultats...",
     "after_ar": "النتائج..."
  },
  "assessments": [
    {
       "criterion": "A",
       "criterionName": "Connaissance",
       "criterionName_ar": "المعرفة",
       "maxPoints": 8,
       "strands": ["i. sélectionner...", "ii. appliquer...", "iii. résoudre..."],
       "strands_ar": ["١. اختيار...", "٢. تطبيق...", "٣. حل..."],
       "rubricRows": [
          { "level": "1-2", "descriptor": "...", "descriptor_ar": "..." },
          { "level": "3-4", "descriptor": "...", "descriptor_ar": "..." },
          { "level": "5-6", "descriptor": "...", "descriptor_ar": "..." },
          { "level": "7-8", "descriptor": "...", "descriptor_ar": "..." }
       ],
       "exercises": [
          {
             "title": "Exercice 1 (Aspect i)",
             "title_ar": "التمرين ١ (الجانب الأول)",
             "content": "Question...",
             "content_ar": "السؤال...",
             "criterionReference": "Critère A: i. sélectionner...",
             "criterionReference_ar": "المعيار أ: ١. اختيار..."
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

// Get appropriate system instruction based on subject
const getSystemInstruction = (subject: string): string => {
  const lang = getGenerationLanguage(subject);
  if (lang === 'en') return SYSTEM_INSTRUCTION_FULL_PLAN_EN;
  if (lang === 'bilingual') return SYSTEM_INSTRUCTION_FULL_PLAN_BILINGUAL;
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
    
    if (lang === 'en') {
      userPrompt = `
        Subject: ${subject}
        Grade Level: ${gradeLevel}
        Topics to cover: ${topics}
        
        ⚠️ CRITICAL: This is a LANGUAGE ACQUISITION subject - generate EVERYTHING in ENGLISH.
        All assessment exercises, questions, texts, titles, instructions, and rubric descriptors MUST be in ENGLISH.
        
        Generate the complete plan and criterion-based assessments.
        
        ❗ MANDATORY — STRICT IB RULE:
        1. The "assessments" field must contain EXACTLY 2 criteria (not 1, not 3, not 4)
        2. Each criterion must have AT LEAST 3 sub-aspects in "strands" (e.g., i, iii, iv)
        3. Sub-aspects can be non-consecutive — choose the most relevant ones
        4. Over 2 units (semester), all 4 criteria A, B, C, D must be covered
        
        Make sure to:
        1. Fill in ALL sections including 'Activities/Strategies', 'Formative Assessment' and 'Differentiation'
        2. Include a "chapters" field listing the chapters/lessons covered in this unit (bullet points format)
        3. Generate EXACTLY 2 criteria in "assessments", each with ≥ 3 sub-aspects in "strands"
        4. Adapt sub-aspects to unit content (can combine multiple in one exercise)
        5. Design assessments for 30-minute duration
        6. Generate ALL content in ENGLISH (this is a language acquisition subject)
        7. Return ONLY a valid, complete JSON structure - no additional text before or after
        8. Ensure JSON is perfectly valid: no trailing commas, properly escaped quotes and newlines
      `;
    } else if (lang === 'bilingual') {
      const isArt = subject.toLowerCase().includes('art');
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ⚠️ ATTENTION: Cette matière (ART ou EPS) nécessite une GÉNÉRATION BILINGUE (FRANÇAIS + ARABE).
        
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
        
        Génère le plan complet et les évaluations critériées EN DEUX VERSIONS:
        1. VERSION FRANÇAISE (tous les champs standards)
        2. VERSION ARABE (tous les champs avec suffixe _ar)
        
        Assure-toi de:
        1. Générer TOUTES les sections en français ET en arabe (ex: "title" ET "title_ar")
        2. Bien remplir 'Activités/Stratégies', 'Évaluation formative' et 'Différenciation' (versions française et arabe)
        3. Inclure un champ "chapters" et "chapters_ar" listant les chapitres/leçons en français et en arabe
        4. Sélectionner STANDARD: 2 critères (les plus convenables), EXCEPTIONNEL: 3 critères (si vraiment nécessaire)
        5. Adapter les sous-aspects au contenu (possibilité de combiner plusieurs dans une tâche)
        6. ${isArt ? 'Concevoir chaque évaluation comme un TRAVAIL PRATIQUE pour une durée de 45 à 60 minutes' : 'Concevoir chaque évaluation pour une durée de 30 minutes'}
        7. Pour chaque tâche pratique, fournir: title, title_ar, content, content_ar, criterionReference, criterionReference_ar
        8. Retourner UNIQUEMENT une structure JSON valide et complète avec TOUS les champs bilingues - pas de texte avant ou après
        9. S'assurer que le JSON est parfaitement valide: pas de virgules trainantes, guillemets et retours à la ligne échappés correctement
        
        La traduction arabe doit être pédagogiquement appropriée et naturelle.
      `;
    } else {
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ❗ OBLIGATOIRE — RÈGLE IB STRICTE :
        1. Le champ "assessments" doit contenir EXACTEMENT 2 critères (ni 1, ni 3, ni 4)
        2. Chaque critère doit avoir AU MINIMUM 3 sous-aspects dans "strands" (ex: i, iii, iv)
        3. Les sous-aspects peuvent être non-consécutifs — choisis les plus pertinents
        4. Sur 2 unités (semestre), les 4 critères A, B, C, D doivent être couverts
        
        Génère le plan complet et les évaluations critériées.
        Assure-toi de:
        1. Bien remplir TOUTES les sections incluant 'Activités/Stratégies', 'Évaluation formative' et 'Différenciation'
        2. Inclure un champ "chapters" listant les chapitres/leçons couverts dans cette unité (format tirets)
        3. Générer EXACTEMENT 2 critères dans "assessments" avec chacun ≥ 3 sous-aspects dans "strands"
        4. Adapter les sous-aspects au contenu (possibilité de combiner plusieurs dans un exercice)
        5. Concevoir chaque évaluation pour une durée de 30 minutes
        6. Retourner UNIQUEMENT une structure JSON valide et complète - pas de texte avant ou après
        7. S'assurer que le JSON est parfaitement valide: pas de virgules trainantes, guillemets et retours à la ligne échappés correctement
      `;
    }

    const text = await callGeminiViaProxy(
      userPrompt,
      getSystemInstruction(subject),
      { responseMimeType: 'application/json', temperature: 0.7 }
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
      
      let taskInstruction = '';
      
      if (lang === 'en') {
        taskInstruction = `
        TASK: Divide the provided curriculum into 4 to 6 logical units.
        Return a JSON LIST (Array) of UnitPlan objects.
        `;
      } else if (lang === 'bilingual') {
        taskInstruction = `
        TACHE : Divise le programme fourni en 4 à 6 unités logiques.
        Retourne une LISTE JSON (Array) d'objets UnitPlan BILINGUES (français + arabe).
        ⚠️ CHAQUE unité doit avoir TOUS les champs en version française ET arabe (suffixe _ar).
        `;
      } else {
        taskInstruction = `
        TACHE : Divise le programme fourni en 4 à 6 unités logiques.
        Retourne une LISTE JSON (Array) d'objets UnitPlan.
        `;
      }
      
      const systemInstruction = `
      ${getSystemInstruction(subject)}
      ${taskInstruction}
      `;
  
      let userPrompt = '';
      
      if (lang === 'en') {
        userPrompt = `
          Subject: ${subject}
          Grade Level: ${gradeLevel}
          Complete Curriculum:
          ${allChapters}
          
          ⚠️ CRITICAL: This is a LANGUAGE ACQUISITION subject - generate ALL CONTENT in ENGLISH.
          All plans, assessments, exercises, questions, titles, and instructions MUST be in ENGLISH only.
        `;
      } else if (lang === 'bilingual') {
        const isArtCourse = subject.toLowerCase().includes('art');
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
          
          ⚠️ RAPPEL: Génération BILINGUE requise (français + arabe avec suffixe _ar pour tous les champs).
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
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
        `;
      }
  
      const text = await callGeminiViaProxy(
        userPrompt,
        systemInstruction,
        { responseMimeType: 'application/json', temperature: 0.7 }
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
