import { AssessmentData, AssessmentExercise, AssessmentSubQuestion, UnitPlan } from '../types';
import { stripHtmlTags, detectAndAttachEducationalDiagram } from './educationalDiagramService';

interface OptimizeEvaluationParams {
  subject: string;
  gradeLevel: string;
  unitTitle: string;
  statementOfInquiry?: string;
  keyConcept?: string;
  relatedConcepts?: string[];
  globalContext?: string;
  chapters?: string;
  existingAssessments: AssessmentData[];
  targetCriteria?: string[]; // e.g. ['A', 'B'] or all
  customInstructions?: string;
  insertVisualDiagrams?: boolean;
}

// Nettoyage sécurisé du JSON retourné par Gemini
function cleanJsonText(raw: string): string {
  if (!raw) return '[]';
  let s = raw.trim();
  // Retirer les balises markdown ```json ... ```
  s = s.replace(/^```(?:json)?\s*/i, '');
  s = s.replace(/\s*```$/i, '');
  
  // Extraire le tableau JSON [...] s'il est entouré de texte
  const firstBracket = s.indexOf('[');
  const lastBracket = s.lastIndexOf(']');
  if (firstBracket !== -1 && lastBracket !== -1 && lastBracket > firstBracket) {
    return s.substring(firstBracket, lastBracket + 1);
  }
  return s;
}

/**
 * Optimise, restructure et convertit une évaluation critériée existante avec l'IA Gemini :
 * 1. Conserve le fond pédagogique de l'unité et les critères choisis.
 * 2. Élimine impérativement les questions doublons, redondantes ou répétées.
 * 3. Corrige ou supprime les questions illogiques, imprécises ou confuses.
 * 4. Ordonne les questions de façon logique et progressive (du simple au complexe, strand par strand).
 * 5. Formate chaque énoncé en HTML professionnel, clair et aéré (<p>, <strong>, <ul>, <table>, <code>, etc.).
 * 6. Assure une passation en ligne claire, pratique et motivante pour l'élève.
 */
export async function optimizeEvaluationWithAI(params: OptimizeEvaluationParams): Promise<AssessmentData[]> {
  const {
    subject,
    gradeLevel,
    unitTitle,
    statementOfInquiry,
    keyConcept,
    relatedConcepts,
    globalContext,
    chapters,
    existingAssessments,
    targetCriteria,
    customInstructions
  } = params;

  // Filtrer les évaluations ciblées
  const filteredExisting = targetCriteria && targetCriteria.length > 0
    ? existingAssessments.filter(a => targetCriteria.includes(a.criterion))
    : existingAssessments;

  if (filteredExisting.length === 0) {
    return existingAssessments;
  }

  const isEn = /english|anglais|acquisition/i.test(subject);

  // Préparation du résumé des évaluations existantes à optimiser
  const existingSummary = filteredExisting.map(crit => {
    return {
      criterion: crit.criterion,
      criterionName: crit.criterionName,
      maxPoints: crit.maxPoints || 8,
      strands: crit.strands,
      exercises: (crit.exercises || []).map((ex, idx) => ({
        index: idx + 1,
        title: ex.title,
        content: ex.content,
        type: ex.type || 'open',
        strandIndex: ex.strandIndex,
        strandText: ex.strandText,
        options: ex.options,
        correctAnswer: ex.correctAnswer,
        subQuestions: ex.subQuestions?.map(sq => ({
          label: sq.label,
          content: sq.content,
          strandIndex: sq.strandIndex,
          type: sq.type
        }))
      }))
    };
  });

  const systemInstruction = `
Tu es un inspecteur et expert international du Programme d'Éducation Intermédiaire (PEI / MYP) de l'IB.
Ta mission est de RESTRUCTURER, PURIFIER, OPTIMISER et REFORMULER l'évaluation critériée existante pour une unité donnée.

DIRECTIVES CRITIQUES :
1. SUPPRESSION IMPÉRATIVE DES DOUBLONS ET RÉPÉTITIONS :
   - Analyse minutieusement toutes les questions fournies.
   - Si deux questions évaluent la même compétence ou notion de façon redondante, fusionne-les ou SUPPRIME la moins bonne.
   - AUCUNE répétition de question ou d'énoncé presque identique ne doit subsister.

2. CORRECTION DES QUESTIONS ILLOGIQUES OU IMPRÉCISES :
   - Si une question manque de données nécessaires à sa résolution, ajoute les données claires et cohérentes.
   - Si une question est illogique ou trop vague, réécris-la avec rigueur et clarté.
   - Les consignes doivent être explicites et utiliser des termes directifs IB précis (ex: Identifier, Déterminer, Calculer, Expliquer, Justifier, Évaluer, Comparer).

3. PROGRESSION PÉDAGOGIQUE PAR SOUS-ASPECT (STRANDS) :
   - Ordonne les questions de manière fluide et progressive (du niveau accessible au niveau approfondi).
   - Chaque question ou sous-question doit être expressément alignée avec un sous-aspect officiel du critère (aspect i, ii, iii...).
   - Pour un critère donné, prévois 2 à 4 tâches/exercices majeurs bien construits (ou 1 tâche progressive à 3-4 sous-questions).

4. TEXTE DIRECT ET LISIBLE SANS AUCUNE BALISE HTML (RÈGLE ABSOLUE) :
   - N'ÉCRIS JAMAIS DE BALISES HTML : il est FORMELLEMENT INTERDIT d'écrire des balises comme <p class="mb-2">, <strong>, <span>, <ul>, <table>, etc.
   - Rédige tout le contenu en TEXTE PUR, humain, aéré et soigné, avec des retours à la ligne clairs pour séparer les paragraphes et des puces textuelles (ex: "• ").
   - Les énoncés doivent être directement lisibles sans balisage.

5. DOCUMENTS VISUELS, SCHÉMAS & DIAGRAMMES À LÉGENDER :
   - Si l'évaluation nécessite un document visuel (Mathématiques, Sciences, Physique, SVT, Géographie, Statistiques), insère si approprié dans le champ "imageCaption" un titre descriptif (ex: "Document 1 : Schéma du circuit électrique à légender [A, B, C, D]", "Figure 1 : Triangle ABC rectangle en B", "Document 2 : Graphique comparatif des données").
   - Dans le texte de la consigne, fais expressément référence aux repères du schéma (ex: "Identifiez les éléments repérés [A, B, C, D]" ou "À l'aide du graphique ci-dessus...").

6. VARIÉTÉ ET PRATICITÉ DES QUESTIONS :
   - Utilise une alternance équilibrée de :
     * Sous-questions progressives 1), 2), 3) ciblant chacune un sous-aspect.
     * Questions à choix multiples (QCM) stimulantes avec 4 propositions bien distinctes (A, B, C, D) et une seule bonne réponse argumentée.
     * Questions vrai/faux avec justification obligatoire.
     * Questions de rédaction ou résolution méthodique avec espace de réponse structuré.

7. CONSERVATION DE LA MATIÈRE ET DE L'UNITÉ :
   - Conserve scrupuleusement la matière ("${subject}"), le niveau scolaire ("${gradeLevel}") et le thème de l'unité ("${unitTitle}").
   - Langue de rédaction : ${isEn ? 'English' : 'Français soigné et irréprochable'}.
`.trim();

  const userPrompt = `
Transforme et optimise l'évaluation critériée existante suivante pour l'unité :
- Matière : ${subject}
- Niveau : ${gradeLevel}
- Titre de l'unité : "${unitTitle}"
- Énoncé de recherche : "${statementOfInquiry || ''}"
- Concept clé : "${keyConcept || ''}"
- Concepts connexes : ${(relatedConcepts || []).join(', ')}
- Contexte mondial : "${globalContext || ''}"
- Chapitres / Notions : "${chapters || ''}"
${customInstructions ? `- Instruction particulière de l'enseignant : "${customInstructions}"` : ''}

Voici l'évaluation existante brute à restructurer, purger des doublons et réécrire en texte clair (ZÉRO BALISE HTML) :
${JSON.stringify(existingSummary, null, 2)}

FORMAT DE SORTIE ATTENDU :
Retourne UNIQUEMENT un tableau JSON valide [ { ... }, { ... } ] où chaque élément est un objet de critère respectant ce schéma strict :
[
  {
    "criterion": "A",
    "criterionName": "Connaissances et compréhension",
    "maxPoints": 8,
    "strands": [
      "i. Sélectionner les concepts et techniques appropriés",
      "ii. Appliquer les méthodes pour résoudre des problèmes",
      "iii. Justifier et expliquer la démarche de résolution"
    ],
    "rubricRows": [
      { "level": "1-2", "descriptor": "..." },
      { "level": "3-4", "descriptor": "..." },
      { "level": "5-6", "descriptor": "..." },
      { "level": "7-8", "descriptor": "..." }
    ],
    "exercises": [
      {
        "title": "Tâche 1 : [Titre explicite]",
        "content": "Mise en situation : [Contexte concret sans balise HTML]\n\nConsigne : [Consigne claire sans aucune balise HTML]",
        "criterionReference": "Critère A : i.",
        "strandIndex": "i",
        "strandText": "Sélectionner les concepts et techniques appropriés",
        "type": "open",
        "answer": "[Corrigé type détaillé pour le professeur en texte pur]",
        "imageUrl": "",
        "imageCaption": "",
        "subQuestions": [
          {
            "id": "sub_1",
            "label": "1)",
            "content": "[Consigne précise de la sous-question 1 en texte pur]",
            "strandIndex": "i",
            "strandText": "Identifier et sélectionner la méthode",
            "type": "open"
          },
          {
            "id": "sub_2",
            "label": "2)",
            "content": "[Consigne précise de la sous-question 2 en texte pur]",
            "strandIndex": "ii",
            "strandText": "Appliquer la formule et calculer",
            "type": "open"
          }
        ]
      }
    ]
  }
]
`.trim();

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000); // 2 minutes max

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: userPrompt,
        systemInstruction,
        generationConfig: {
          responseMimeType: 'application/json',
          temperature: 0.5,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur serveur (${res.status})`);
    }

    const data = await res.json();
    const rawText = data?.text || '';
    const cleaned = cleanJsonText(rawText);
    const parsed = JSON.parse(cleaned);

    if (Array.isArray(parsed) && parsed.length > 0) {
      // Nettoyage rigoureux de toute balise HTML accidentelle et attachement des schémas si nécessaire
      const validated: AssessmentData[] = parsed.map((item: any, idx: number) => {
        const original = filteredExisting.find(o => o.criterion === item.criterion) || filteredExisting[idx];
        return {
          criterion: item.criterion || original?.criterion || 'A',
          criterionName: item.criterionName || original?.criterionName || `Critère ${item.criterion || 'A'}`,
          maxPoints: typeof item.maxPoints === 'number' ? item.maxPoints : 8,
          strands: Array.isArray(item.strands) && item.strands.length > 0 ? item.strands : original?.strands || [],
          rubricRows: Array.isArray(item.rubricRows) && item.rubricRows.length > 0 ? item.rubricRows : original?.rubricRows || [],
          exercises: (Array.isArray(item.exercises) && item.exercises.length > 0 ? item.exercises : original?.exercises || []).map((ex: any, eIdx: number) => {
            const cleanTitle = stripHtmlTags(ex.title) || `Tâche ${eIdx + 1}`;
            const cleanContent = stripHtmlTags(ex.content) || '';
            const cleanAnswer = stripHtmlTags(ex.answer);

            // Détection automatique de schéma/diagramme si l'IA n'en a pas fourni
            let imageUrl = ex.imageUrl || '';
            let imageCaption = ex.imageCaption || '';
            if (!imageUrl) {
              const detected = detectAndAttachEducationalDiagram(subject, unitTitle, cleanTitle, cleanContent);
              if (detected) {
                imageUrl = detected.imageUrl;
                imageCaption = detected.imageCaption;
              }
            }

            return {
              title: cleanTitle,
              content: cleanContent,
              imageUrl: imageUrl || undefined,
              imageCaption: imageCaption || undefined,
              criterionReference: ex.criterionReference || `Critère ${item.criterion || 'A'} : i.`,
              strandIndex: ex.strandIndex || 'i',
              strandText: ex.strandText || '',
              type: ex.type || 'open',
              options: Array.isArray(ex.options) ? ex.options.map((o: any) => stripHtmlTags(String(o))) : undefined,
              correctAnswer: ex.correctAnswer ? stripHtmlTags(String(ex.correctAnswer)) : undefined,
              answer: cleanAnswer,
              subQuestions: Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0
                ? ex.subQuestions.map((sq: any, sIdx: number) => ({
                    id: sq.id || `sub_${sIdx + 1}`,
                    label: sq.label || `${sIdx + 1})`,
                    content: stripHtmlTags(sq.content) || '',
                    strandIndex: sq.strandIndex || 'i',
                    strandText: sq.strandText || '',
                    type: sq.type || 'open',
                    options: Array.isArray(sq.options) ? sq.options.map((o: any) => stripHtmlTags(String(o))) : undefined,
                    correctAnswer: sq.correctAnswer ? stripHtmlTags(String(sq.correctAnswer)) : undefined,
                  }))
                : undefined,
            };
          }),
        };
      });

      return validated;
    }
    return filteredExisting;
  } catch (error) {
    console.warn('optimizeEvaluationWithAI: Erreur lors de l\'appel API, utilisation du repli structuré local:', error);
    // En cas d'erreur réseau, fallback local de mise en forme propre sans balises HTML et sans doublons
    return sanitizeAndFormatLocalAssessments(filteredExisting, subject, unitTitle);
  }
}

/**
 * Nettoyage et formatage local de sécurité :
 * Élimine les doublons exacts, supprime toute balise HTML résiduelle,
 * et associe si opportun un document/diagramme éducatif.
 */
export function sanitizeAndFormatLocalAssessments(
  assessments: AssessmentData[],
  subject: string = '',
  unitTitle: string = ''
): AssessmentData[] {
  return assessments.map(crit => {
    const seenTitles = new Set<string>();
    const seenContents = new Set<string>();
    const uniqueExercises: AssessmentExercise[] = [];

    (crit.exercises || []).forEach((ex, idx) => {
      const cleanContent = stripHtmlTags(ex.content);
      const cleanTitle = stripHtmlTags(ex.title) || `Tâche ${idx + 1}`;
      const simpleContentKey = cleanContent.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
      const simpleTitleKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Détection de doublons stricts
      if (simpleContentKey && seenContents.has(simpleContentKey)) {
        return; // Éliminer la question doublon
      }
      if (simpleTitleKey && seenTitles.has(simpleTitleKey) && simpleContentKey && seenContents.has(simpleContentKey)) {
        return;
      }

      if (simpleContentKey) seenContents.add(simpleContentKey);
      if (simpleTitleKey) seenTitles.add(simpleTitleKey);

      // Détection de schéma éducatif si pertinent
      let imageUrl = ex.imageUrl || '';
      let imageCaption = ex.imageCaption || '';
      if (!imageUrl && (subject || unitTitle)) {
        const detected = detectAndAttachEducationalDiagram(subject, unitTitle, cleanTitle, cleanContent);
        if (detected) {
          imageUrl = detected.imageUrl;
          imageCaption = detected.imageCaption;
        }
      }

      uniqueExercises.push({
        ...ex,
        title: cleanTitle,
        content: cleanContent,
        imageUrl: imageUrl || undefined,
        imageCaption: imageCaption || undefined,
        answer: ex.answer ? stripHtmlTags(ex.answer) : undefined,
        options: ex.options ? ex.options.map(o => stripHtmlTags(o)) : undefined,
        subQuestions: ex.subQuestions?.map(sq => ({
          ...sq,
          content: stripHtmlTags(sq.content),
          options: sq.options ? sq.options.map(o => stripHtmlTags(o)) : undefined,
        })),
      });
    });

    return {
      ...crit,
      exercises: uniqueExercises,
    };
  });
}
