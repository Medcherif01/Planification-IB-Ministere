import { AssessmentData, AssessmentExercise, AssessmentSubQuestion, UnitPlan } from '../types';
import { stripHtmlTags, detectAndAttachEducationalDiagram } from './educationalDiagramService';

/**
 * Convertit les tableaux au format Markdown (| entête 1 | entête 2 |) en balises HTML <table> propres.
 */
function convertMarkdownTablesToHtml(text: string): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let tableLines: string[] = [];

  const flushTable = () => {
    if (tableLines.length >= 2) {
      const sepIndex = tableLines.findIndex(l => /^\s*\|?\s*[-:]+[-|\s:]*\|\s*$/.test(l));
      let headerLines: string[] = [];
      let bodyLines: string[] = [];

      if (sepIndex > 0) {
        headerLines = tableLines.slice(0, sepIndex);
        bodyLines = tableLines.slice(sepIndex + 1);
      } else {
        headerLines = [tableLines[0]];
        bodyLines = tableLines.slice(1);
      }

      const parseCells = (row: string) => {
        return row
          .trim()
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map(c => c.trim());
      };

      let tableHtml = '<div class="table-container my-3 overflow-x-auto"><table class="eval-table w-full border-collapse rounded-xl overflow-hidden shadow-2xs">';
      if (headerLines.length > 0) {
        tableHtml += '<thead class="bg-slate-100 font-bold text-slate-900 border-b border-slate-300">';
        for (const hr of headerLines) {
          const cells = parseCells(hr);
          tableHtml += '<tr>' + cells.map(c => `<th class="p-2.5 border border-slate-300 text-left">${c}</th>`).join('') + '</tr>';
        }
        tableHtml += '</thead>';
      }

      tableHtml += '<tbody class="divide-y divide-slate-200">';
      for (const br of bodyLines) {
        const cells = parseCells(br);
        if (cells.length > 0 && cells.some(c => c.length > 0)) {
          tableHtml += '<tr>' + cells.map(c => `<td class="p-2.5 border border-slate-300 text-slate-800">${c}</td>`).join('') + '</tr>';
        }
      }
      tableHtml += '</tbody></table></div>';
      result.push(tableHtml);
    } else {
      result.push(...tableLines);
    }
    tableLines = [];
  };

  for (const line of lines) {
    if (/^\s*\|.*\|\s*$/.test(line)) {
      tableLines.push(line);
    } else {
      if (tableLines.length > 0) {
        flushTable();
      }
      result.push(line);
    }
  }
  if (tableLines.length > 0) {
    flushTable();
  }

  return result.join('\n');
}

/**
 * Nettoie, structure et sécurise le format HTML professionnel généré par l'IA ou saisi par l'enseignant.
 * Conserve et valorise les balises sémantiques valides (<p>, <strong>, <b>, <em>, <i>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <br>, <code>, <blockquote>).
 * Convertit le texte brut ou markdown sans balises en balisage HTML propre.
 */
export function formatProfessionalHtml(content?: string): string {
  if (!content) return '';
  let str = content.trim();

  // Si c'est du HTML encodé sous forme d'entités (&lt;p&gt;...), le décoder d'abord
  if (str.includes('&lt;') && str.includes('&gt;')) {
    str = str
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&');
  }

  // Sécurité : supprimer les balises de script ou dangereuses
  str = str
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '')
    .replace(/on\w+='[^']*'/gi, '');

  // Supprimer les classes polluantes résiduelles du type class="mb-2" pour un HTML propre et sémantique
  str = str
    .replace(/\sclass="[^"]*"/gi, '')
    .replace(/\sstyle="[^"]*"/gi, '');

  // Conversion des tableaux markdown éventuels en balises HTML
  if (str.includes('|') && str.includes('\n')) {
    str = convertMarkdownTablesToHtml(str);
  }

  // Vérifier si le contenu contient déjà des balises sémantiques HTML
  const hasSemanticTags = /<(?:p|ul|ol|li|table|div|blockquote|h[1-6])[\s>]/i.test(str);

  if (!hasSemanticTags) {
    // Si c'est du texte brut, le convertir en paragraphes HTML soignés
    const paragraphs = str.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length > 0) {
      str = paragraphs
        .map(p => {
          const lines = p.split('\n');
          if (lines.length > 1 && lines.every(l => l.trim().startsWith('•') || l.trim().startsWith('-'))) {
            const listItems = lines.map(l => `<li>${l.replace(/^[•\-]\s*/, '').trim()}</li>`).join('');
            return `<ul>${listItems}</ul>`;
          }
          return `<p>${lines.join('<br/>')}</p>`;
        })
        .join('');
    } else {
      str = `<p>${str}</p>`;
    }
  }

  return str.trim();
}


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

4. FORMAT HTML SOIGNÉ ET PROFESSIONNEL AVEC TABLEAUX (<p>, <strong>, <ul>, <table>...) :
   - Rédige chaque énoncé, mise en situation et consigne dans un format HTML propre, moderne et structuré.
   - Utilise judicieusement les balises sémantiques :
     * <p> pour séparer chaque paragraphe de manière aérée.
     * <strong> pour mettre en relief les termes directifs IB (Identifier, Déterminer, Calculer, Justifier...) et données clés.
     * <ul> et <li> pour les listes de données chiffrées, hypothèses ou consignes par étapes.
     * <table> avec <thead>, <tbody>, <tr>, <th>, <td> pour les tableaux de données scientifiques, protocoles, relevés d'expériences ou tableaux comparatifs.
   - Le balisage doit être du HTML pur et propre (sans classes polluantes comme class="mb-2", sans styles inline).

5. SCHÉMAS SCIENTIFIQUES & DIAGRAMMES À LÉGENDER [A, B, C, D] OU [1, 2, 3, 4] :
   - En Sciences (SVT, Physique-Chimie, Biologie, Écologie), Mathématiques et Géographie : sois créatif et intègre des mises en situation concrètes accompagnées de schémas à légender.
   - Indique dans le champ "imageCaption" le titre explicite du document (ex: "Document 1 : Schéma du circuit électrique à légender [A, B, C, D]", "Document 2 : Structure cellulaire au microscope [1, 2, 3, 4]", "Document 5 : Appareil respiratoire à légender [1, 2, 3, 4]", "Document 6 : Photosynthèse foliaire [A, B, C, D]").
   - Rédige des questions demandant à l'élève d'identifier et nommer chaque élément repéré [1, 2, 3, 4] ou [A, B, C, D], d'expliquer son rôle biologique/physique, ou de compléter un tableau d'analyse.

6. VARIÉTÉ ET PRATICITÉ DES QUESTIONS :
   - Utilise une alternance équilibrée de :
     * Sous-questions progressives 1), 2), 3) ciblant chacune un sous-aspect (avec tableau de données ou schéma support).
     * Questions à choix multiples (QCM) stimulantes avec 4 propositions bien distinctes (A, B, C, D) et une seule bonne réponse argumentée.
     * Questions vrai/faux avec justification obligatoire.
     * Questions de rédaction ou résolution méthodique avec espace de réponse structuré.

7. CORRIGÉS DÉTAILLÉS POUR CHAQUE QUESTION :
   - Rédige pour chaque tâche le corrigé type complet ("answer") avec les éléments de réponse attendus et les critères de notation.

8. CONSERVATION DE LA MATIÈRE ET DE L'UNITÉ :
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

Voici l'évaluation existante brute à restructurer, purger des doublons et rédiger en format HTML professionnel (<p>, <strong>, <ul>, <table>...) :
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
        "content": "<p><strong>Mise en situation :</strong> [Contexte concret structuré]</p><p><strong>Consigne :</strong> [Consigne claire avec termes directifs IB]</p>",
        "criterionReference": "Critère A : i.",
        "strandIndex": "i",
        "strandText": "Sélectionner les concepts et techniques appropriés",
        "type": "open",
        "answer": "<p>[Corrigé type détaillé pour le professeur avec étapes et justification]</p>",
        "imageUrl": "",
        "imageCaption": "",
        "subQuestions": [
          {
            "id": "sub_1",
            "label": "1)",
            "content": "<p><strong>Calculer</strong> la valeur de...</p>",
            "strandIndex": "i",
            "strandText": "Identifier et sélectionner la méthode",
            "type": "open"
          },
          {
            "id": "sub_2",
            "label": "2)",
            "content": "<p><strong>Justifier</strong> le résultat obtenu...</p>",
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
      // Nettoyage et formatage HTML professionnel soigné, attachement des schémas si nécessaire
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
            const cleanContent = formatProfessionalHtml(ex.content) || `<p>${cleanTitle}</p>`;
            const cleanAnswer = ex.answer ? formatProfessionalHtml(ex.answer) : undefined;

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
                    content: formatProfessionalHtml(sq.content) || '',
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
    // En cas d'erreur réseau, fallback local de mise en forme propre sans doublons
    return sanitizeAndFormatLocalAssessments(filteredExisting, subject, unitTitle);
  }
}

/**
 * Nettoyage et formatage local de sécurité :
 * Élimine les doublons exacts, applique le format HTML soigné,
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
      const cleanContent = formatProfessionalHtml(ex.content);
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
        answer: ex.answer ? formatProfessionalHtml(ex.answer) : undefined,
        options: ex.options ? ex.options.map(o => stripHtmlTags(o)) : undefined,
        subQuestions: ex.subQuestions?.map(sq => ({
          ...sq,
          content: formatProfessionalHtml(sq.content),
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
