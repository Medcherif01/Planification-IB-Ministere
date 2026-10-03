import { AssessmentExercise, AssessmentSubQuestion } from '../types';

export interface GenerateQuestionOptions {
  subject: string;
  gradeLevel: string;
  unitTitle?: string;
  statementOfInquiry?: string;
  chapters?: string;
  keyConcept?: string;
  relatedConcepts?: string[];
  globalContext?: string;
  criterion: string; // e.g. "A", "B", "C", "D"
  criterionName?: string; // e.g. "Connaissances et compréhension"
  strandIndex: string; // "i", "ii", "iii", "iv", "v" or "all"
  strandText?: string; // e.g. "Sélectionner les mathématiques appropriées..."
  questionType: 'multiple_choice' | 'true_false' | 'open' | 'subquestions' | 'fill_in_blanks' | 'geometry' | 'art';
  difficulty?: 'facile' | 'moyen' | 'difficile' | 'approfondi';
  customGuidance?: string; // Consigne libre optionnelle de l'enseignant
  taskNumber?: number; // e.g. 1, 2, 3...
}

export interface QuestionTypeOption {
  id: GenerateQuestionOptions['questionType'];
  labelFr: string;
  labelEn: string;
  icon: string;
  descFr: string;
  descEn: string;
}

export const QUESTION_TYPES: QuestionTypeOption[] = [
  {
    id: 'multiple_choice',
    labelFr: 'QCM (Choix multiples)',
    labelEn: 'Multiple Choice (MCQ)',
    icon: '☑️',
    descFr: '4 propositions (A, B, C, D) avec une seule bonne réponse et justification',
    descEn: '4 options (A, B, C, D) with one correct answer and explanation',
  },
  {
    id: 'true_false',
    labelFr: 'Vrai ou Faux',
    labelEn: 'True or False',
    icon: '⚖️',
    descFr: 'Affirmation ciblée à évaluer avec justification obligatoire',
    descEn: 'Targeted statement to evaluate with mandatory justification',
  },
  {
    id: 'subquestions',
    labelFr: 'Problème à sous-questions 1), 2), 3)...',
    labelEn: 'Multi-part Problem 1), 2), 3)...',
    icon: '🔢',
    descFr: 'Mise en situation découpée en étapes progressives (idéal pour les strands i, ii, iii)',
    descEn: 'Scenario broken down into progressive sub-questions addressing specific strands',
  },
  {
    id: 'open',
    labelFr: 'Rédaction libre / Développement',
    labelEn: 'Open-ended / Essay Response',
    icon: '📝',
    descFr: 'Question ouverte exigeant analyse, explication ou démarche détaillée',
    descEn: 'Open-ended prompt requiring in-depth reasoning, analysis or problem-solving steps',
  },
  {
    id: 'fill_in_blanks',
    labelFr: 'Texte à trous / Compléter',
    labelEn: 'Fill in the Blanks',
    icon: '🔤',
    descFr: 'Texte ou formule avec des termes clés manquants à compléter',
    descEn: 'Text or formula with key terms to be filled in by the student',
  },
  {
    id: 'geometry',
    labelFr: 'Géométrie & Construction',
    labelEn: 'Geometry & Construction',
    icon: '📐',
    descFr: 'Consigne de tracé ou construction aux instruments (équerre, compas, rapporteur)',
    descEn: 'Geometric construction task using ruler, compass, protractor or coordinate grid',
  },
  {
    id: 'art',
    labelFr: 'Analyse Visuelle & Artistique',
    labelEn: 'Visual Arts & Image Analysis',
    icon: '🎨',
    descFr: 'Étude d\'une oeuvre d\'art ou d\'un support visuel avec consigne créative/critique',
    descEn: 'Visual analysis of an artwork or document with creative and critical prompts',
  },
];

export const isEnglishSubject = (subject?: string): boolean => {
  if (!subject) return false;
  const normalized = subject.toLowerCase().trim();
  return (
    normalized.includes('anglais') ||
    normalized === 'english' ||
    normalized.includes('language acquisition') ||
    (normalized.includes('acquisition') && normalized.includes('langue')) ||
    normalized.includes('english language')
  );
};

// Nettoyer le JSON retourné par le LLM
const cleanJson = (text: string): string => {
  if (!text) return '{}';
  let clean = text.replace(/```json/gi, '').replace(/```/gi, '').trim();
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start !== -1 && end !== -1 && end > start) {
    return clean.substring(start, end + 1);
  }
  return clean;
};

/**
 * Génère une question ciblée avec l'IA selon le type et le sous-aspect choisis
 */
export async function generateCriterialQuestion(options: GenerateQuestionOptions): Promise<AssessmentExercise> {
  const isEn = isEnglishSubject(options.subject);
  const taskNum = options.taskNumber || 1;
  const strandLabel = options.strandIndex === 'all'
    ? (isEn ? 'All strands / Synthesis' : 'Synthèse de tous les sous-aspects')
    : `strand ${options.strandIndex}`;

  const defaultTitle = isEn
    ? `Task ${taskNum}: Criterion ${options.criterion} (${strandLabel})`
    : `Tâche ${taskNum} : Critère ${options.criterion} (${strandLabel})`;

  // Construction du prompt
  let systemInstruction = '';
  let userPrompt = '';

  if (isEn) {
    systemInstruction = `
You are an expert International Baccalaureate (IB) Middle Years Programme (MYP) English and Language Acquisition educator.
CRITICAL MANDATORY RULES:
1. EVERYTHING MUST BE 100% IN ENGLISH. ABSOLUTELY NO FRENCH WORDS. All titles, stimulus texts, prompts, questions, options, True/False labels, explanations, and rubric connections must be purely in English.
2. The question must strictly align with IB MYP Criterion ${options.criterion} (${options.criterionName || ''}), specifically targeting ${strandLabel} (${options.strandText || ''}).
3. Return ONLY a valid JSON object matching the requested schema. Do NOT include markdown code fences if possible.
    `.trim();

    userPrompt = `
Generate a single high-quality criterion-referenced assessment question for:
- Subject: ${options.subject}
- Grade Level: ${options.gradeLevel}
- Unit Title: "${options.unitTitle || 'Language & Inquiry'}"
- Statement of Inquiry: "${options.statementOfInquiry || ''}"
- Chapters / Content: "${options.chapters || ''}"
- Key Concept: "${options.keyConcept || ''}"
- Related Concepts: ${(options.relatedConcepts || []).join(', ')}
- Targeted IB Criterion: Criterion ${options.criterion} — ${options.criterionName || ''}
- Targeted Strand / Aspect: ${strandLabel} — ${options.strandText || 'Demonstrate understanding'}
- Question Type / Nature: ${options.questionType}
- Desired Difficulty: ${options.difficulty || 'medium'}
${options.customGuidance ? `- Teacher's Specific Guidance: "${options.customGuidance}"` : ''}

Output JSON schema:
{
  "title": "Task ${taskNum}: [Concise English Title]",
  "content": "[Clear English question stimulus and instructions]",
  "type": "${options.questionType === 'multiple_choice' ? 'multiple_choice' : options.questionType === 'true_false' ? 'true_false' : 'open'}",
  "options": [${options.questionType === 'multiple_choice' ? '"Option A", "Option B", "Option C", "Option D"' : ''}],
  "correctAnswer": "${options.questionType === 'true_false' ? 'True (or False)' : options.questionType === 'multiple_choice' ? 'Option A' : ''}",
  "answer": "[Detailed model answer, correction points, and marking criteria in English]",
  "subQuestions": [
    ${options.questionType === 'subquestions' ? `
    {
      "id": "sub_1",
      "label": "1)",
      "content": "[First sub-question targeting aspect i]",
      "strandIndex": "i",
      "strandText": "${options.strandText || 'Identify and comprehend'}",
      "type": "open"
    },
    {
      "id": "sub_2",
      "label": "2)",
      "content": "[Second sub-question targeting aspect ii]",
      "strandIndex": "ii",
      "strandText": "Analyse and interpret",
      "type": "open"
    }
    ` : ''}
  ]
}
    `.trim();
  } else {
    // Mode Français
    systemInstruction = `
Tu es un expert pédagogique du Programme d'Éducation Intermédiaire (PEI) de l'IB (Baccalauréat International).
RÈGLES IMPÉRATIVES :
1. Rédige en français soigné, clair et pédagogiquement rigoureux.
2. La question doit cibler précisément le Critère ${options.criterion} (${options.criterionName || ''}) et spécifiquement le sous-aspect ${strandLabel} (${options.strandText || ''}).
3. La question doit être concrète, stimulante et adaptée au niveau scolaire (${options.gradeLevel}).
4. Retourne UNIQUEMENT un objet JSON valide conforme au schéma demandé.
    `.trim();

    userPrompt = `
Génère une question d'évaluation critériée pour :
- Matière : ${options.subject}
- Niveau / Classe : ${options.gradeLevel}
- Titre de l'unité : "${options.unitTitle || 'Unité d\'apprentissage'}"
- Énoncé de recherche : "${options.statementOfInquiry || ''}"
- Chapitres / Notions couvertes : "${options.chapters || ''}"
- Concept clé : "${options.keyConcept || ''}"
- Concepts connexes : ${(options.relatedConcepts || []).join(', ')}
- Critère IB ciblé : Critère ${options.criterion} — ${options.criterionName || ''}
- Sous-aspect ciblé (Strand) : ${strandLabel} — ${options.strandText || 'Maîtriser les notions'}
- Nature / Type de question : ${options.questionType}
- Niveau de difficulté souhaité : ${options.difficulty || 'moyen'}
${options.customGuidance ? `- Consigne spécifique de l'enseignant : "${options.customGuidance}"` : ''}

Schéma JSON attendu :
{
  "title": "Tâche ${taskNum} : [Titre concis et explicite]",
  "content": "[Énoncé détaillé, texte support ou consigne claire pour l'élève]",
  "type": "${options.questionType === 'multiple_choice' ? 'multiple_choice' : options.questionType === 'true_false' ? 'true_false' : 'open'}",
  "options": [${options.questionType === 'multiple_choice' ? '"Proposition A", "Proposition B", "Proposition C", "Proposition D"' : ''}],
  "correctAnswer": "${options.questionType === 'true_false' ? 'Vrai (ou Faux)' : options.questionType === 'multiple_choice' ? 'Proposition A' : ''}",
  "answer": "[Corrigé type détaillé avec éléments de réponse et justification pour l'enseignant]",
  "subQuestions": [
    ${options.questionType === 'subquestions' ? `
    {
      "id": "sub_1",
      "label": "1)",
      "content": "[Première sous-question]",
      "strandIndex": "i",
      "strandText": "${options.strandText || 'Identifier et appliquer'}",
      "type": "open"
    },
    {
      "id": "sub_2",
      "label": "2)",
      "content": "[Deuxième sous-question]",
      "strandIndex": "ii",
      "strandText": "Calculer ou approfondir",
      "type": "open"
    }
    ` : ''}
  ]
}
    `.trim();
  }

  // Appel au serveur via /api/generate
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: userPrompt,
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.6,
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur serveur (${res.status})`);
    }

    const data = await res.json();
    const rawText = data?.text || '';
    const cleaned = cleanJson(rawText);
    const parsed = JSON.parse(cleaned);

    const exercise: AssessmentExercise = {
      title: parsed.title || defaultTitle,
      content: parsed.content || (isEn ? 'Complete the task described above.' : 'Répondez à la consigne ci-dessus.'),
      criterionReference: isEn
        ? `Criterion ${options.criterion} : strand ${options.strandIndex}`
        : `Critère ${options.criterion} : ${options.strandIndex}.`,
      strandIndex: options.strandIndex === 'all' ? 'i' : options.strandIndex,
      strandText: options.strandText || (isEn ? `Criterion ${options.criterion} skill` : `Compétence ${options.criterion}`),
      type: parsed.type === 'multiple_choice' || parsed.type === 'true_false' ? parsed.type : 'open',
      options: Array.isArray(parsed.options) && parsed.options.length > 0 ? parsed.options : undefined,
      correctAnswer: parsed.correctAnswer || undefined,
      answer: parsed.answer || undefined,
      workspaceNeeded: options.questionType === 'geometry' || options.questionType === 'art',
    };

    if (options.questionType === 'subquestions' && Array.isArray(parsed.subQuestions) && parsed.subQuestions.length > 0) {
      exercise.subQuestions = parsed.subQuestions.map((sq: any, i: number) => ({
        id: sq.id || `sub_${i + 1}`,
        label: sq.label || `${i + 1})`,
        content: sq.content || '',
        strandIndex: sq.strandIndex || ['i', 'ii', 'iii', 'iv'][i % 4],
        strandText: sq.strandText || options.strandText || '',
        type: sq.type || 'open',
        options: sq.options,
        correctAnswer: sq.correctAnswer,
      }));
    }

    return exercise;
  } catch (err: any) {
    if (err.name === 'AbortError') {
      throw new Error(isEn ? 'Generation timed out. Please try again.' : 'Délai d\'attente dépassé. Veuillez réessayer.');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}
