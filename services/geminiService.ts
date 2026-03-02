import { GoogleGenAI } from "@google/genai";
import { UnitPlan, AssessmentData } from "../types";

const getClient = () => {
  // Get API key from environment variable only
  const apiKey = import.meta.env.VITE_GEMINI_API_KEY || 
                  process.env.GEMINI_API_KEY || 
                  process.env.API_KEY;
  
  if (!apiKey) {
    const errorMsg = `
⚠️ ERREUR DE CONFIGURATION API

La clé API Gemini n'est pas configurée.

POUR RÉSOUDRE CE PROBLÈME:

1. Si vous êtes en développement local:
   - Créez un fichier .env.local à la racine du projet
   - Ajoutez: VITE_GEMINI_API_KEY=votre_clé_api_ici
   - Obtenez une clé gratuite sur: https://aistudio.google.com/app/apikey
   - Redémarrez le serveur de développement

2. Si vous êtes sur Vercel (production):
   - Allez dans Settings > Environment Variables
   - Ajoutez: GEMINI_API_KEY=votre_clé_api_ici
   - Redéployez l'application

La génération IA ne fonctionnera pas sans cette clé.
    `.trim();
    
    throw new Error(errorMsg);
  }
  
  return new GoogleGenAI({ apiKey });
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
    const ai = getClient();
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });

    const text = response.text || "";
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
    const ai = getClient();
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

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { responseMimeType: "application/json" }
    });
    
    const jsonText = cleanJsonText(response.text || "");
    const parsed = JSON.parse(jsonText);
    return parsed;
  } catch (error) {
    console.error("Error generating questions:", error);
    return { factual: [], conceptual: [], debatable: [] };
  }
};

export const generateLearningExperiences = async (plan: UnitPlan): Promise<string> => {
  try {
    const ai = getClient();
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
    
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
    });
    return response.text || "";
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

⚠️ RÈGLE CRITIQUE - SÉLECTION INTELLIGENTE DES CRITÈRES :
- NE GÉNÈRE PAS AUTOMATIQUEMENT LES 4 CRITÈRES (A, B, C, D) pour une seule unité
- Le choix des critères est ÉTROITEMENT LIÉ au contenu de l'unité et aux exigences de l'IB

⚠️ PRINCIPE FONDAMENTAL IB :
- À LA FIN DU SEMESTRE (après 2 unités), les 4 critères (A, B, C, D) doivent être couverts
- CHAQUE UNITÉ évalue UNIQUEMENT les critères les plus pertinents pour son contenu

⚠️ NOMBRE DE CRITÈRES PAR UNITÉ :
- STANDARD : 2 critères par unité (le plus courant et RECOMMANDÉ)
  * Choisis les 2 critères les PLUS CONVENABLES selon le contenu de l'unité
  * Exemple : Unité sur algèbre → Critères A + C
  * Exemple : Unité sur recherche → Critères B + D
- EXCEPTIONNEL : 3 critères par unité (SEULEMENT si vraiment nécessaire)
  * Uniquement si l'unité DOIT OBLIGATOIREMENT être évaluée par ces 3 critères
  * C'est le PIRE DES CAS, à éviter si possible
- JAMAIS : 4 critères dans une seule unité (interdit)

⚠️ SÉLECTION DES CRITÈRES :
- Choisis les critères les PLUS CONVENABLES selon :
  * Le contenu spécifique de l'unité
  * Les objectifs d'apprentissage visés
  * Les compétences à développer
  * La cohérence pédagogique
- Assure-toi que les critères choisis sont VRAIMENT pertinents pour cette unité
- Pense à la complémentarité avec d'autres unités du semestre

⚠️ SOUS-ASPECTS FLEXIBLES ET OBLIGATOIRES :
- CHAQUE CRITÈRE doit évaluer AU MINIMUM 3 sous-aspects (i, ii, iii, iv, ou v)
- Les sous-aspects ne doivent PAS nécessairement être consécutifs (ex: i, iii, v est acceptable)
- Choisis les sous-aspects les PLUS PERTINENTS selon le contenu de l'unité
- Un MÊME exercice PEUT évaluer 2 ou 3 sous-aspects simultanément si approprié
- Exemple: "Critère A: i. et iii." ou "Critère B: ii., iv. et v."
- L'ordre et la sélection doivent refléter les exigences IB pour cette matière

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
Tu es un expert coordinateur pédagogique du Programme d'Éducation Intermédiaire (PEI) de l'IB.
Tu dois générer un plan d'unité complet BILINGUE (FRANÇAIS + ARABE) ET une série d'évaluations détaillées basées sur les critères.

⚠️ RÈGLE CRITIQUE - SÉLECTION INTELLIGENTE DES CRITÈRES :
- NE GÉNÈRE PAS AUTOMATIQUEMENT LES 4 CRITÈRES (A, B, C, D) pour une seule unité
- PRINCIPE FONDAMENTAL : À la fin du semestre (2 unités), les 4 critères doivent être couverts
- STANDARD : 2 critères par unité (choisis les PLUS CONVENABLES selon le contenu)
- EXCEPTIONNEL : 3 critères (SEULEMENT si l'unité doit OBLIGATOIREMENT être évaluée par ces 3 critères)
- JAMAIS : 4 critères dans une seule unité
- CHAQUE CRITÈRE doit évaluer AU MINIMUM 3 sous-aspects (i, ii, iii, iv, ou v)
- Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v)
- Un exercice PEUT évaluer 2-3 sous-aspects simultanément
- Exemple: "Critère A: i. et iii." ou "Critère B: ii., iv. et v."

⚠️ DURÉE DES ÉVALUATIONS IB :
- Chaque évaluation critériée doit être conçue pour UNE DURÉE DE 30 MINUTES
- Les exercices doivent être réalisables en 30 minutes maximum
- Adapte le nombre et la complexité des exercices à cette contrainte de temps

⚠️ RÈGLE CRUCIALE POUR ART ET EPS : GÉNÉRATION BILINGUE
Pour les matières Arts et Éducation Physique et à la santé, TOUTES les sections doivent être générées en DEUX VERSIONS:
1. VERSION FRANÇAISE (originale)
2. VERSION ARABE (traduction complète et fidèle)

FORMAT BILINGUE POUR CHAQUE SECTION:
- Champ français: "nomChamp": "Contenu en français..."
- Champ arabe: "nomChamp_ar": "المحتوى بالعربية..."

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
- "learningExperiences": Détailler les ACTIVITÉS D'APPRENTISSAGE et STRATÉGIES PÉDAGOGIQUES (enquête, collaboration...).
- "learningExperiences_ar": النسخة العربية الكاملة للأنشطة التعليمية والاستراتيجيات
- "formativeAssessment": Préciser les méthodes d'ÉVALUATION FORMATIVE (tickets de sortie, quiz rapide, observation...).
- "formativeAssessment_ar": النسخة العربية الكاملة لطرق التقييم التكويني
- "differentiation": Préciser les stratégies de DIFFÉRENCIATION (Contenu, Processus, Produit) pour élèves en difficulté et avancés.
- "differentiation_ar": النسخة العربية الكاملة لاستراتيجيات التمايز

RÈGLES SPÉCIFIQUES POUR LES EXERCICES (CRUCIAL):
1. CHAQUE CRITÈRE doit évaluer AU MINIMUM 3 sous-aspects différents (i, ii, iii, iv, ou v)
2. Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v est valide)
3. Un exercice PEUT évaluer 2-3 sous-aspects simultanément si pertinent
   - Exemple: "Critère A: i. et iii." (un exercice évalue 2 aspects)
4. VARIER les types d'exercices pour couvrir différents niveaux cognitifs
5. La clé "criterionReference" doit indiquer TOUS les aspects évalués
6. CHAQUE exercice doit avoir une version arabe complète (title_ar, content_ar, criterionReference_ar)
7. LAISSER suffisamment d'espace de réponse pour les élèves

GESTION DES RESSOURCES DANS LES EXERCICES:
- Si l'exercice nécessite l'analyse d'un texte, FOURNIR LE TEXTE COMPLET dans le champ "content" (français) et "content_ar" (arabe).
- Si l'exercice nécessite une image, écrire EXPLICITEMENT: "[Insérer Image/Schéma ici: description détaillée]".
- AJOUTER TOUJOURS des lignes de réponse avec pointillés pour les élèves :
  * Après chaque question, ajouter : "\n\nRéponse / الإجابة :\n" suivi de 5-8 lignes de pointillés
  * Format des lignes : "................................................................................................................................................................................................"
  * Adapter le nombre de lignes selon la complexité de la question
  * Ceci garantit que les élèves ont suffisamment d'espace pour écrire leurs réponses

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

⚠️ CRITICAL RULE - INTELLIGENT CRITERIA SELECTION:
- DO NOT AUTOMATICALLY GENERATE ALL 4 CRITERIA (A, B, C, D) for a single unit
- FUNDAMENTAL PRINCIPLE: At the end of the semester (2 units), all 4 criteria must be covered
- STANDARD: 2 criteria per unit (choose the MOST SUITABLE based on content)
- EXCEPTIONAL: 3 criteria (ONLY if the unit MUST be assessed by these 3 criteria)
- NEVER: 4 criteria in a single unit
- EACH CRITERION must assess AT LEAST 3 sub-aspects (i, ii, iii, iv, or v)
- Sub-aspects do NOT need to be consecutive (e.g., i, iii, v is valid)
- Choose the MOST RELEVANT sub-aspects based on unit content
- A SINGLE exercise CAN assess 2-3 sub-aspects simultaneously if appropriate
- Example: "Criterion A: i. and iii." or "Criterion B: ii., iv., and v."

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
    const ai = getClient();
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
        
        ⚠️ CRITICAL CRITERIA SELECTION: 
        - STANDARD: Select 2 MOST SUITABLE criteria based on unit content
        - EXCEPTIONAL: 3 criteria ONLY if unit MUST be assessed by these 3 criteria (worst case)
        - NEVER: 4 criteria in one unit
        - REMEMBER: Over 2 units (semester), all 4 criteria (A, B, C, D) must be covered
        
        ⚠️ CRITICAL - SUB-ASPECTS (MINIMUM 3 PER CRITERION):
        - EACH criterion must assess AT LEAST 3 sub-aspects (i, ii, iii, iv, or v)
        - Sub-aspects can be NON-CONSECUTIVE (e.g., i, iii, v or ii, iv, v)
        - Choose the MOST RELEVANT sub-aspects based on content and IB requirements
        - One exercise CAN assess 2-3 sub-aspects simultaneously (e.g., "Criterion A: i. and iii.")
        
        Make sure to:
        1. Fill in ALL sections including 'Activities/Strategies', 'Formative Assessment' and 'Differentiation'
        2. Include a "chapters" field listing the chapters/lessons covered in this unit (bullet points format)
        3. Select STANDARD: 2 criteria (most suitable), EXCEPTIONAL: 3 criteria (if truly necessary)
        4. Adapt sub-aspects to unit content (can combine multiple in one exercise)
        5. Design assessments for 30-minute duration
        6. Generate ALL content in ENGLISH (this is a language acquisition subject)
        7. Return ONLY a valid, complete JSON structure - no additional text before or after
        8. Ensure JSON is perfectly valid: no trailing commas, properly escaped quotes and newlines
      `;
    } else if (lang === 'bilingual') {
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ⚠️ ATTENTION: Cette matière (ART ou EPS) nécessite une GÉNÉRATION BILINGUE (FRANÇAIS + ARABE).
        
        ⚠️ CRITIQUE - SÉLECTION DES CRITÈRES: 
        - STANDARD : Sélectionne 2 critères LES PLUS CONVENABLES selon le contenu de l'unité
        - EXCEPTIONNEL : 3 critères SEULEMENT si l'unité DOIT OBLIGATOIREMENT être évaluée par ces 3 critères (pire des cas)
        - JAMAIS : 4 critères dans une seule unité
        - IMPORTANT : Sur 2 unités (semestre), les 4 critères (A, B, C, D) doivent être couverts
        
        ⚠️ CRITIQUE - SOUS-ASPECTS (MINIMUM 3 PAR CRITÈRE):
        - CHAQUE critère doit évaluer AU MINIMUM 3 sous-aspects (i, ii, iii, iv, ou v)
        - Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v ou ii, iv, v)
        - Choisis les sous-aspects les PLUS PERTINENTS selon le contenu et les exigences IB
        - Un exercice PEUT évaluer 2-3 sous-aspects simultanément (ex: "Critère A: i. et iii.")
        
        Génère le plan complet et les évaluations critériées EN DEUX VERSIONS:
        1. VERSION FRANÇAISE (tous les champs standards)
        2. VERSION ARABE (tous les champs avec suffixe _ar)
        
        Assure-toi de:
        1. Générer TOUTES les sections en français ET en arabe (ex: "title" ET "title_ar")
        2. Bien remplir 'Activités/Stratégies', 'Évaluation formative' et 'Différenciation' (versions française et arabe)
        3. Inclure un champ "chapters" et "chapters_ar" listant les chapitres/leçons en français et en arabe
        4. Sélectionner STANDARD: 2 critères (les plus convenables), EXCEPTIONNEL: 3 critères (si vraiment nécessaire)
        5. Adapter les sous-aspects au contenu (possibilité de combiner plusieurs dans un exercice)
        6. Concevoir chaque évaluation pour une durée de 30 minutes
        7. Pour chaque exercice, fournir: title, title_ar, content, content_ar, criterionReference, criterionReference_ar
        8. Retourner UNIQUEMENT une structure JSON valide et complète avec TOUS les champs bilingues - pas de texte avant ou après
        9. S'assurer que le JSON est parfaitement valide: pas de virgules trainantes, guillemets et retours à la ligne échappés correctement
        
        La traduction arabe doit être pédagogiquement appropriée et naturelle.
      `;
    } else {
      userPrompt = `
        Matière: ${subject}
        Niveau: ${gradeLevel}
        Sujets à couvrir: ${topics}
        
        ⚠️ CRITIQUE - SÉLECTION DES CRITÈRES: 
        - STANDARD : Sélectionne 2 critères LES PLUS CONVENABLES selon le contenu de l'unité
        - EXCEPTIONNEL : 3 critères SEULEMENT si l'unité DOIT OBLIGATOIREMENT être évaluée par ces 3 critères (pire des cas)
        - JAMAIS : 4 critères dans une seule unité
        - IMPORTANT : Sur 2 unités (semestre), les 4 critères (A, B, C, D) doivent être couverts
        
        ⚠️ CRITIQUE - SOUS-ASPECTS (MINIMUM 3 PAR CRITÈRE):
        - CHAQUE critère doit évaluer AU MINIMUM 3 sous-aspects (i, ii, iii, iv, ou v)
        - Les sous-aspects peuvent être NON-CONSÉCUTIFS (ex: i, iii, v ou ii, iv, v)
        - Choisis les sous-aspects les PLUS PERTINENTS selon le contenu et les exigences IB
        - Un exercice PEUT évaluer 2-3 sous-aspects simultanément (ex: "Critère A: i. et iii.")
        
        Génère le plan complet et les évaluations critériées.
        Assure-toi de:
        1. Bien remplir TOUTES les sections incluant 'Activités/Stratégies', 'Évaluation formative' et 'Différenciation'
        2. Inclure un champ "chapters" listant les chapitres/leçons couverts dans cette unité (format tirets)
        3. Sélectionner STANDARD: 2 critères (les plus convenables), EXCEPTIONNEL: 3 critères (si vraiment nécessaire)
        4. Adapter les sous-aspects au contenu (possibilité de combiner plusieurs dans un exercice)
        5. Concevoir chaque évaluation pour une durée de 30 minutes
        6. Retourner UNIQUEMENT une structure JSON valide et complète - pas de texte avant ou après
        7. S'assurer que le JSON est parfaitement valide: pas de virgules trainantes, guillemets et retours à la ligne échappés correctement
      `;
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: userPrompt,
      config: {
        systemInstruction: getSystemInstruction(subject),
        responseMimeType: "application/json",
        temperature: 0.7
      }
    });

    const text = response.text;
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
    if (errorMsg.includes("API") || errorMsg.includes("key") || errorMsg.includes("GEMINI_API_KEY")) {
      throw new Error("❌ Erreur de connexion à l'IA. Vérifiez votre clé API dans les paramètres Vercel.");
    } else if (errorMsg.includes("JSON") || errorMsg.includes("format") || errorMsg.includes("parse")) {
      throw new Error("❌ L'IA n'a pas retourné de plan valide. Veuillez réessayer avec des sujets plus précis.\n\nConseils:\n- Soyez plus spécifique dans les chapitres\n- Essayez avec moins de sujets à la fois\n- Attendez quelques instants et réessayez");
    } else if (errorMsg.includes("quota") || errorMsg.includes("limit")) {
      throw new Error("❌ Limite d'utilisation de l'IA atteinte. Veuillez réessayer dans quelques minutes.");
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
      const ai = getClient();
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
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
          
          ⚠️ RAPPEL: Génération BILINGUE requise (français + arabe avec suffixe _ar pour tous les champs).
        `;
      } else {
        userPrompt = `
          Matière: ${subject}
          Niveau: ${gradeLevel}
          Programme complet:
          ${allChapters}
        `;
      }
  
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: userPrompt,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          temperature: 0.7
        }
      });
  
      const text = response.text;
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
        plans = JSON.parse(cleanedJson);
      } catch (parseError) {
        console.error("❌ Erreur de parsing JSON:", parseError);
        console.error("JSON problématique:", cleanedJson.substring(0, 500));
        throw new Error("Le format des plans générés est invalide. Veuillez réessayer avec des chapitres plus clairs.");
      }
      
      if (!Array.isArray(plans)) {
        console.error("❌ L'IA n'a pas retourné un tableau de plans");
        throw new Error("L'IA n'a pas retourné de plan valide. Veuillez réessayer.");
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
      if (errorMsg.includes("API") || errorMsg.includes("key") || errorMsg.includes("GEMINI_API_KEY")) {
        throw new Error("❌ Erreur de connexion à l'IA. Vérifiez votre clé API.");
      } else if (errorMsg.includes("quota") || errorMsg.includes("limit")) {
        throw new Error("❌ Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.");
      }
      
      throw new Error(`❌ Erreur lors de la génération de la planification: ${errorMsg}`);
    }
  };
