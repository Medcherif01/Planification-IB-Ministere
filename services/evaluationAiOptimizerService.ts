import { AssessmentData, AssessmentExercise, AssessmentSubQuestion, InteractiveExerciseModule, UnitPlan } from '../types';
import {
  stripHtmlTags,
  detectAndAttachEducationalDiagram,
  generateDiagramOrMapWithGeminiAI,
  shouldExerciseHaveVisual,
  sanitizeExerciseVisualsForDisplay,
} from './educationalDiagramService';
import { resolveArtworkOrImage } from './artworkService';
import { getCriteriaSync, isLanguageAcquisitionSubject } from './ibCriteriaService';

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
 * Détecte et reconstruit automatiquement les tableaux dont les colonnes ou en-têtes ont été
 * comprimés ou écrasés par d'anciens nettoyages (ex: Screenshot AnnéeTempérature... 197027.5450)
 */
function reconstructSquishedAndRawTables(text: string): string {
  let str = text;

  // 1. Détection du cas spécifique de tableau météo/climat/sciences comprimé (ex: AnnéeTempérature...)
  const squishedClimateHeader = /Ann[eé]e\s*Temp[eé]rature(?:\s*moyenne(?:\s*annuelle)?)?\s*(?:\(°C\))?\s*Pr[eé]cipitations?(?:\s*annuelles?)?\s*(?:\(mm\))?/i;
  if (squishedClimateHeader.test(str)) {
    const lines = str.split('\n');
    const newLines: string[] = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      if (squishedClimateHeader.test(line)) {
        const rows: { year: string; temp: string; rain: string }[] = [];
        let j = i + 1;
        while (j < lines.length) {
          const rowLine = lines[j].trim();
          const squishedMatch = rowLine.match(/^((?:19|20)\d{2})\s*(\d{1,2}(?:\.\d+)?)\s*(\d{2,4})$/);
          const spacedMatch = rowLine.match(/^((?:19|20)\d{2})[\s\t]+(\d{1,2}(?:\.\d+)?(?:°C)?)[\s\t]+(\d{2,4}(?:mm)?)$/);
          
          if (squishedMatch) {
            rows.push({ year: squishedMatch[1], temp: squishedMatch[2], rain: squishedMatch[3] });
            j++;
          } else if (spacedMatch) {
            rows.push({ year: spacedMatch[1], temp: spacedMatch[2].replace('°C', ''), rain: spacedMatch[3].replace('mm', '') });
            j++;
          } else {
            break;
          }
        }

        if (rows.length >= 2) {
          const tableHtml = `<div class="table-container my-3 overflow-x-auto"><table class="eval-table w-full border-collapse rounded-xl overflow-hidden shadow-2xs border border-slate-300 bg-white text-xs sm:text-sm">
<thead class="bg-gradient-to-r from-slate-100 to-slate-50 font-bold text-slate-900 border-b border-slate-300">
  <tr>
    <th class="p-2.5 border border-slate-300 text-left font-bold text-slate-900 bg-slate-100">Année</th>
    <th class="p-2.5 border border-slate-300 text-left font-bold text-purple-900 bg-purple-50/50">Température moyenne annuelle (°C)</th>
    <th class="p-2.5 border border-slate-300 text-left font-bold text-blue-900 bg-blue-50/50">Précipitations annuelles (mm)</th>
  </tr>
</thead>
<tbody class="divide-y divide-slate-200">
  ${rows.map(r => `<tr class="hover:bg-purple-50/30">
    <td class="p-2.5 border border-slate-300 font-mono font-bold text-slate-900">${r.year}</td>
    <td class="p-2.5 border border-slate-300 font-mono text-purple-900 font-semibold">${r.temp} °C</td>
    <td class="p-2.5 border border-slate-300 font-mono text-blue-900 font-semibold">${r.rain} mm</td>
  </tr>`).join('\n  ')}
</tbody>
</table></div>`;
          newLines.push(tableHtml);
          i = j;
          continue;
        }
      }
      newLines.push(line);
      i++;
    }
    str = newLines.join('\n');
  }

  // 2. Détection des lignes tabulées ou séparées par 2+ espaces consécutifs formant un tableau
  if (!/<table[\s>]/i.test(str)) {
    const rawLines = str.split('\n');
    const processed: string[] = [];
    let tableBuffer: string[][] = [];

    const flushTableBuffer = () => {
      if (tableBuffer.length >= 2) {
        const header = tableBuffer[0];
        const body = tableBuffer.slice(1);
        let tableHtml = '<div class="table-container my-3 overflow-x-auto"><table class="eval-table w-full border-collapse rounded-xl overflow-hidden shadow-2xs border border-slate-300 bg-white text-xs sm:text-sm">';
        tableHtml += '<thead class="bg-slate-100 font-bold text-slate-900 border-b border-slate-300"><tr>';
        for (const col of header) {
          tableHtml += `<th class="p-2.5 border border-slate-300 text-left font-bold text-slate-900">${col}</th>`;
        }
        tableHtml += '</tr></thead><tbody class="divide-y divide-slate-200">';
        for (const row of body) {
          tableHtml += '<tr class="hover:bg-purple-50/30">';
          for (let c = 0; c < header.length; c++) {
            tableHtml += `<td class="p-2.5 border border-slate-300 text-slate-800">${row[c] || ''}</td>`;
          }
          tableHtml += '</tr>';
        }
        tableHtml += '</tbody></table></div>';
        processed.push(tableHtml);
      } else {
        for (const b of tableBuffer) {
          processed.push(b.join('  '));
        }
      }
      tableBuffer = [];
    };

    for (const l of rawLines) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith('<') || trimmed.startsWith('|')) {
        if (tableBuffer.length > 0) flushTableBuffer();
        processed.push(l);
        continue;
      }
      const cols = trimmed.split(/\t|\s{2,}/).map(s => s.trim()).filter(Boolean);
      if (cols.length >= 2 && cols.length <= 7) {
        if (tableBuffer.length === 0 || tableBuffer[0].length === cols.length) {
          tableBuffer.push(cols);
          continue;
        }
      }
      if (tableBuffer.length > 0) flushTableBuffer();
      processed.push(l);
    }
    if (tableBuffer.length > 0) flushTableBuffer();
    str = processed.join('\n');
  }

  return str;
}

/**
 * Convertit tous les symboles Markdown (**gras**, *italique*, __souligné__, ### titres, `code`)
 * en balises HTML sémantiques propres (<strong>, <em>, <code>) et élimine tout symbole résiduel.
 */
function convertMarkdownInlineToHtml(text: string): string {
  return text
    .replace(/```[a-z]*\n?([\s\S]*?)```/gi, '<pre><code>$1</code></pre>')
    .replace(/(?:^|<p>|<br\s*\/?>|\n)\s*#{1,6}\s+([^<\n]+)/gi, '<p><strong>$1</strong></p>')
    .replace(/\*\*\*([\s\S]+?)\*\*\*/g, '<strong><em>$1</em></strong>')
    .replace(/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__([\s\S]+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[\s(>])\*([^*\n]+)\*(?=[\s.,;:!?)<]|$)/g, '$1<em>$2</em>')
    .replace(/(^|\n|<br\s*\/?>|<p>)\s*\*\s+/gi, '$1• ')
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .replace(/#{2,6}\s*/g, '');
}

/**
 * Met automatiquement en gras (<strong>) tous les verbes d'action et mots-clés de consigne IB MYP
 * (français et anglais) lorsqu'ils ne sont pas déjà à l'intérieur d'une balise <strong> ou <b>.
 */
function highlightCommandTermsInHtml(html: string): string {
  if (!html) return '';
  const COMMAND_TERMS_PATTERN = new RegExp(
    '(^|[\\s(>«"\\\'•\\-:\\.;!?])(' +
      'En\\s+d[ée]duire|Vrai\\s+ou\\s+Faux|Vrai\\s*\\/\\s*Faux|True\\s+or\\s+False|True\\s*\\/\\s*False|' +
      'Calculer|Calculez|Calcule|D[ée]terminer|D[ée]terminez|D[ée]termine|Justifier|Justifiez|Justifie|' +
      'Expliquer|Expliquez|Explique|Analyser|Analysez|Analyse|Comparer|Comparez|Compare|' +
      'D[ée]crire|D[ée]crivez|D[ée]cris|Identifier|Identifiez|Identifie|D[ée]montrer|D[ée]montrez|D[ée]montre|' +
      'Montrer|Montrez|Montre|R[ée]soudre|R[ée]solvez|R[ée]sous|D[ée]duire|D[ée]duisez|D[ée]duis|' +
      'Interpr[ée]ter|Interpr[ée]tez|Interpr[èe]te|L[ée]gender|L[ée]gendez|L[ée]gende|Classer|Classez|Classe|' +
      'Nommer|Nommez|Nomme|[ÉE]valuer|[ÉE]valuez|[ÉE]value|Discuter|Discutez|Discute|' +
      'Formuler|Formulez|Formule|Tracer|Tracez|Trace|Repr[ée]senter|Repr[ée]sentez|Repr[ée]sente|' +
      'Indiquer|Indiquez|Indique|Citer|Citez|Cite|Synth[ée]tiser|Synth[ée]tisez|Synth[ée]tise|' +
      'Argumenter|Argumentez|Argumente|V[ée]rifier|V[ée]rifiez|V[ée]rifie|Compl[ée]ter|Compl[ée]tez|Compl[èe]te|' +
      'Associer|Associez|Associe|Cocher|Cochez|Coche|Relier|Reliez|Relie|Placer|Placez|Place|' +
      'D[ée]finir|D[ée]finissez|D[ée]finis|R[ée]diger|R[ée]digez|R[ée]dige|Proposer|Proposez|Propose|' +
      'Pr[ée]ciser|Pr[ée]cisez|Pr[ée]cise|Exprimer|Exprimez|Exprime|Construire|Construisez|Construis|' +
      'Simplifier|Simplifiez|Factoriser|Factorisez|D[ée]velopper|D[ée]veloppez|Mesurer|Mesurez|' +
      'Calculate|Determine|Justify|Explain|Analyze|Analyse|Compare|Contrast|Describe|Identify|' +
      'Demonstrate|Solve|Deduce|Interpret|Label|Classify|State|Evaluate|Discuss|Formulate|' +
      'Plot|Sketch|Draw|Outline|Summarize|Summarise|Argue|Verify|Complete|Match|Select|Define' +
    ')(?=[\\s.,;:!?)»"\\\'<]|$)',
    'gi'
  );

  const tokens = html.split(/(<[^>]+>)/g);
  let boldDepth = 0;

  return tokens
    .map(token => {
      if (token.startsWith('<')) {
        if (/^<(?:strong|b|th|code)\b/i.test(token) && !/\/>$/.test(token)) {
          boldDepth++;
        } else if (/^<\/(?:strong|b|th|code)\b/i.test(token)) {
          boldDepth = Math.max(0, boldDepth - 1);
        }
        return token;
      }
      if (boldDepth > 0 || !token.trim()) {
        return token;
      }
      return token.replace(COMMAND_TERMS_PATTERN, '$1<strong>$2</strong>');
    })
    .join('');
}

/**
 * Nettoie, structure et sécurise le format HTML professionnel généré par l'IA ou saisi par l'enseignant.
 * Conserve et valorise les balises sémantiques valides (<p>, <strong>, <b>, <em>, <i>, <ul>, <ol>, <li>, <table>, <thead>, <tbody>, <tr>, <th>, <td>, <br>, <code>, <blockquote>).
 * Convertit systématiquement le Markdown (**gras**, *italique*, ###, tableaux) en HTML propre sans aucun symbole brut,
 * et met automatiquement les mots-clés de consigne (verbes d'action IB) en gras.
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

  // Reconstruire les tableaux compressés ou textuels bruts (Screenshot climat & sciences)
  str = reconstructSquishedAndRawTables(str);

  // Conversion des tableaux markdown éventuels en balises HTML
  if (str.includes('|') && str.includes('\n')) {
    str = convertMarkdownTablesToHtml(str);
  }

  // Conversion systématique des symboles Markdown (**gras**, *italique*, ###) en balises HTML propres
  str = convertMarkdownInlineToHtml(str);

  // Mise en valeur automatique des intitulés structurants s'ils ne sont pas déjà en gras
  str = str.replace(
    /(^|<p>|<br\s*\/?>|\n)\s*(Mise en situation|Contexte|Consigne|Instructions?|Données|Document(?:\s+\d+)?|Hypothèse|Problématique|Rappel|Affirmation)\s*:/gi,
    '$1<strong>$2 :</strong>'
  );

  // Vérifier si le contenu contient déjà des balises de blocs HTML
  const hasSemanticTags = /<(?:p|ul|ol|li|table|div|blockquote|h[1-6])[\s>]/i.test(str);

  if (!hasSemanticTags) {
    // Si c'est du texte brut, le convertir en paragraphes et listes HTML soignés
    const paragraphs = str.split(/\n\s*\n/).filter(Boolean);
    if (paragraphs.length > 0) {
      str = paragraphs
        .map(p => {
          const lines = p.split('\n').map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) return '';
          if (lines.length > 1 && lines.every(l => l.startsWith('•') || l.startsWith('- ') || l.startsWith('* '))) {
            const listItems = lines.map(l => `<li>${l.replace(/^[•\-*]\s*/, '').trim()}</li>`).join('');
            return `<ul>${listItems}</ul>`;
          }
          return `<p>${lines.join('<br/>')}</p>`;
        })
        .join('');
    } else {
      str = `<p>${str}</p>`;
    }
  }

  // Mettre automatiquement en gras les mots-clés de consigne IB (Calculer, Justifier, Expliquer, Déterminer...)
  str = highlightCommandTermsInHtml(str);

  return str.trim();
}


interface OptimizeEvaluationParams {
  subject: string;
  gradeLevel: string;
  unitTitle: string;
  semester?: string;
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
    customInstructions,
    insertVisualDiagrams = true
  } = params;

  // Filtrer les évaluations ciblées
  const filteredExisting = targetCriteria && targetCriteria.length > 0
    ? existingAssessments.filter(a => targetCriteria.includes(a.criterion))
    : existingAssessments;

  if (filteredExisting.length === 0) {
    return existingAssessments;
  }

  const isEn = isLanguageAcquisitionSubject(subject) || /english|anglais|acquisition/i.test(subject);
  const savedCriteriaConfig = getCriteriaSync(subject, gradeLevel);

  // Préparation du résumé des évaluations existantes à optimiser en injectant les objectifs IB sauvegardés par les enseignants
  const existingSummary = filteredExisting.map(crit => {
    const savedCrit = savedCriteriaConfig?.criteria?.find(c => c.criterion === crit.criterion);
    const officialCriterionName = savedCrit?.criterionName || crit.criterionName || (isEn ? `Criterion ${crit.criterion}` : `Critère ${crit.criterion}`);
    const officialStrands = savedCrit?.strands?.length
      ? [...savedCrit.strands]
      : crit.strands;

    return {
      criterion: crit.criterion,
      criterionName: officialCriterionName,
      maxPoints: crit.maxPoints || 8,
      strands: officialStrands,
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
Ta mission est de RESTRUCTURER, PURIFIER, OPTIMISER et REFORMULER l'évaluation critériée existante pour une unité donnée, en respectant STRICTEMENT les objectifs spécifiques de l'IB enregistrés par l'enseignant.

DIRECTIVES CRITIQUES :
${isEn ? `0. LANGUAGE REQUIREMENT (100% ENGLISH MANDATORY):
   - Because this subject is Language Acquisition (English), EVERY SINGLE WORD of the output (criterionName, strands, rubricRows descriptors, exercise titles like "Task 1: ...", content, instructions, subQuestions, options, and model answers) MUST BE WRITTEN 100% IN ENGLISH. Never use French words like "Tâche", "Critère", "Mise en situation", or "Consigne". Use "Task", "Criterion", "Context", "Instructions".` : ''}
1. SUPPRESSION IMPÉRATIVE DES DOUBLONS ET RÉPÉTITIONS :
   - Analyse minutieusement toutes les questions fournies.
   - Si deux questions évaluent la même compétence ou notion de façon redondante, fusionne-les ou SUPPRIME la moins bonne.
   - AUCUNE répétition de question ou d'énoncé presque identique ne doit subsister.

2. CORRECTION DES QUESTIONS ILLOGIQUES OU IMPRÉCISES :
   - Si une question manque de données nécessaires à sa résolution, ajoute les données claires et cohérentes.
   - Si une question est illogique ou trop vague, réécris-la avec rigueur et clarté.
   - Les consignes doivent être explicites et utiliser des termes directifs IB précis (${isEn ? 'e.g. Identify, Determine, Explain, Justify, Evaluate, Analyze, Compare' : 'ex: Identifier, Déterminer, Calculer, Expliquer, Justifier, Évaluer, Comparer'}).

3. RESPECT STRICT DES OBJECTIFS SPÉCIFIQUES DE L'IB ENREGISTRÉS :
   - Conserve intégralement les intitulés officiels des critères ("criterionName") et les sous-aspects ("strands" i, ii, iii, iv) fournis dans l'entrée.
   - Ordonne les questions de manière fluide et progressive (du niveau 1-2 au niveau 7-8).
   - Chaque question ou sous-question doit être expressément alignée avec un sous-aspect officiel du critère (aspect i, ii, iii, iv).
   - Pour un critère donné, prévois 2 à 4 tâches/exercices majeurs bien construits (ou 1 tâche progressive à 3-4 sous-questions).

4. FORMAT HTML SOIGNÉ ET PROFESSIONNEL AVEC TABLEAUX (<p>, <strong>, <ul>, <table>...) :
   - Rédige chaque énoncé, mise en situation et consigne dans un format HTML propre, moderne et structuré.
   - Utilise judicieusement les balises sémantiques :
     * <p> pour séparer chaque paragraphe de manière aérée.
     * <strong> pour mettre en relief les termes directifs IB et données clés.
     * <ul> et <li> pour les listes de données chiffrées, hypothèses ou consignes par étapes.
     * <table> avec <thead>, <tbody>, <tr>, <th>, <td> pour les tableaux de données, textes supports ou tableaux comparatifs.
   - Le balisage doit être du HTML pur et propre (sans classes polluantes comme class="mb-2", sans styles inline).

5. COURBES, FIGURES, SCHÉMAS & DIAGRAMMES SUR-MESURE (EXIGENCE STRICTE DE COMPATIBILITÉ) :
   - RÈGLE ESSENTIELLE : Si et seulement si un exercice exploite ou fait référence à un schéma, une figure géométrique ou une courbe, LA FIGURE DOIT ÊTRE ENTIÈREMENT ET STRICTEMENT COMPATIBLE avec le texte de l'exercice.
   - N'invente JAMAIS de figure déconnectée ou contradictoire avec l'énoncé.
   - Si la question se résout sans nécessiter de dessin, laisse "imageUrl" et "imageCaption" VIDES ("").

6. VARIÉTÉ ET PRATICITÉ DES QUESTIONS :
   - Utilise une alternance équilibrée de :
     * Sous-questions progressives 1), 2), 3) ciblant chacune un sous-aspect.
     * Questions à choix multiples (QCM) stimulantes avec 4 propositions bien distinctes (A, B, C, D) et une seule bonne réponse argumentée.
     * Questions vrai/faux (${isEn ? 'True / False' : 'Vrai / Faux'}) avec justification.
     * Questions de rédaction ou résolution méthodique avec espace de réponse structuré.

7. CORRIGÉS DÉTAILLÉS POUR CHAQUE QUESTION :
   - Rédige pour chaque tâche le corrigé type complet ("answer") avec les éléments de réponse attendus et les critères de notation IB.

8. CONSERVATION DE LA MATIÈRE ET DE L'UNITÉ :
   - Conserve scrupuleusement la matière ("${subject}"), le niveau scolaire ("${gradeLevel}") et le thème de l'unité ("${unitTitle}").
   - Langue de rédaction : ${isEn ? '100% English (strictly no French)' : 'Français soigné et irréprochable'}.
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

Voici l'évaluation existante brute à restructurer, purger des doublons et rédiger en format HTML professionnel (<p>, <strong>, <ul>, <table>...) tout en respectant strictement les objectifs spécifiques IB fournis :
${JSON.stringify(existingSummary, null, 2)}

FORMAT DE SORTIE ATTENDU :
Retourne UNIQUEMENT un tableau JSON valide [ { ... }, { ... } ] où chaque élément est un objet de critère respectant ce schéma strict :
[
  {
    "criterion": "A",
    "criterionName": "${isEn ? 'Listening / Comprehending spoken and visual text' : 'Connaissances et compréhension'}",
    "maxPoints": 8,
    "strands": [
      "${isEn ? 'i. Identify explicit and implicit information (facts, opinions, messages and supporting details)' : 'i. Sélectionner les concepts et techniques appropriés'}",
      "${isEn ? 'ii. Analyze conventions and connections' : 'ii. Appliquer les méthodes pour résoudre des problèmes'}"
    ],
    "rubricRows": [
      { "level": "1-2", "descriptor": "..." },
      { "level": "3-4", "descriptor": "..." },
      { "level": "5-6", "descriptor": "..." },
      { "level": "7-8", "descriptor": "..." }
    ],
    "exercises": [
      {
        "title": "${isEn ? 'Task 1: [Explicit Title]' : 'Tâche 1 : [Titre explicite]'}",
        "content": "${isEn ? '<p><strong>Context:</strong> [Structured context]</p><p><strong>Instructions:</strong> [Clear instruction with IB command terms]</p>' : '<p><strong>Mise en situation :</strong> [Contexte concret structuré]</p><p><strong>Consigne :</strong> [Consigne claire avec termes directifs IB]</p>'}",
        "criterionReference": "${isEn ? 'Criterion A: i.' : 'Critère A : i.'}",
        "strandIndex": "i",
        "strandText": "...",
        "type": "open",
        "answer": "<p>[${isEn ? 'Detailed model answer and marking scheme' : 'Corrigé type détaillé pour le professeur avec étapes et justification'}]</p>",
        "imageUrl": "",
        "imageCaption": "",
        "subQuestions": [
          {
            "id": "sub_1",
            "label": "1)",
            "content": "<p><strong>${isEn ? 'Identify' : 'Calculer'}</strong> ...</p>",
            "strandIndex": "i",
            "strandText": "...",
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
      // Nettoyage et formatage HTML professionnel soigné, respect strict des objectifs IB sauvegardés
      const validated: AssessmentData[] = parsed.map((item: any, idx: number) => {
        const original = filteredExisting.find(o => o.criterion === item.criterion) || filteredExisting[idx];
        const critCode = (item.criterion || original?.criterion || 'A') as 'A' | 'B' | 'C' | 'D';
        const savedCrit = savedCriteriaConfig?.criteria?.find(c => c.criterion === critCode);

        const officialCriterionName = savedCrit?.criterionName
          || item.criterionName
          || original?.criterionName
          || (isEn ? `Criterion ${critCode}` : `Critère ${critCode}`);

        const officialStrands = savedCrit?.strands?.length
          ? [...savedCrit.strands]
          : (Array.isArray(item.strands) && item.strands.length > 0 ? item.strands : original?.strands || []);

        const officialRubricRows = Array.isArray(item.rubricRows) && item.rubricRows.length > 0
          ? item.rubricRows
          : (original?.rubricRows && original.rubricRows.length > 0
              ? original.rubricRows
              : [
                  { level: '0', descriptor: isEn ? 'The student does not reach a standard described by any of the descriptors below.' : "L'élève n'atteint aucun des niveaux décrits ci-dessous." },
                  { level: '1-2', descriptor: officialStrands.map(s => `${s} (${isEn ? 'limited level' : 'niveau limité'})`).join(' ; ') },
                  { level: '3-4', descriptor: officialStrands.map(s => `${s} (${isEn ? 'adequate level' : 'niveau satisfaisant'})`).join(' ; ') },
                  { level: '5-6', descriptor: officialStrands.map(s => `${s} (${isEn ? 'substantial level' : 'niveau substantiel'})`).join(' ; ') },
                  { level: '7-8', descriptor: officialStrands.map(s => `${s} (${isEn ? 'excellent level' : 'niveau excellent'})`).join(' ; ') },
                ]);

        return {
          criterion: critCode,
          criterionName: stripHtmlTags(officialCriterionName),
          maxPoints: typeof item.maxPoints === 'number' ? item.maxPoints : 8,
          strands: officialStrands.map((s: string) => stripHtmlTags(s)),
          rubricRows: officialRubricRows.map((r: any) => ({
            level: stripHtmlTags(String(r.level || '')),
            descriptor: stripHtmlTags(String(r.descriptor || '')),
          })),
          exercises: (Array.isArray(item.exercises) && item.exercises.length > 0 ? item.exercises : original?.exercises || []).map((ex: any, eIdx: number) => {
            const rawTitle = stripHtmlTags(ex.title) || (isEn ? `Task ${eIdx + 1}` : `Tâche ${eIdx + 1}`);
            const cleanTitle = isEn ? rawTitle.replace(/^Tâche\s+/i, 'Task ').replace(/^Exercice\s+/i, 'Task ') : rawTitle;
            const cleanContent = formatProfessionalHtml(ex.content) || `<p>${cleanTitle}</p>`;
            const cleanAnswer = ex.answer ? formatProfessionalHtml(ex.answer) : undefined;
            const subQuestionsText = Array.isArray(ex.subQuestions)
              ? ex.subQuestions.map((sq: any) => stripHtmlTags(sq.content || '')).join(' ')
              : '';

            const sanitizedVisual = insertVisualDiagrams
              ? sanitizeExerciseVisualsForDisplay({
                  subject,
                  unitTitle,
                  exerciseTitle: cleanTitle,
                  exerciseContent: cleanContent,
                  subQuestionsText,
                  imageUrl: ex.imageUrl,
                  imageCaption: ex.imageCaption,
                })
              : { imageUrl: undefined, imageCaption: undefined };

            const sIdx = ex.strandIndex || 'i';
            const matchedSavedStrand = savedCrit?.strands?.find(s => s.toLowerCase().startsWith(`${sIdx.toLowerCase()}.`));
            const officialStrandText = stripHtmlTags(matchedSavedStrand?.replace(/^[ivx]+[\.\)]\s*/i, '') || ex.strandText || '');

            return {
              title: cleanTitle,
              content: cleanContent,
              imageUrl: sanitizedVisual.imageUrl,
              imageCaption: sanitizedVisual.imageCaption,
              criterionReference: ex.criterionReference
                ? (isEn ? stripHtmlTags(String(ex.criterionReference)).replace(/^Critère/i, 'Criterion') : stripHtmlTags(String(ex.criterionReference)))
                : (isEn ? `Criterion ${critCode}: ${sIdx}.` : `Critère ${critCode} : ${sIdx}.`),
              strandIndex: sIdx,
              strandText: officialStrandText,
              type: ex.type || 'open',
              options: Array.isArray(ex.options) ? ex.options.map((o: any) => stripHtmlTags(String(o))) : undefined,
              correctAnswer: ex.correctAnswer ? stripHtmlTags(String(ex.correctAnswer)) : undefined,
              answer: cleanAnswer,
              subQuestions: Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0
                ? ex.subQuestions.map((sq: any, sqIdx: number) => {
                    const sqStrand = sq.strandIndex || 'i';
                    const matchedSqStrand = savedCrit?.strands?.find(s => s.toLowerCase().startsWith(`${sqStrand.toLowerCase()}.`));
                    return {
                      id: sq.id || `sub_${sqIdx + 1}`,
                      label: stripHtmlTags(sq.label) || `${sqIdx + 1})`,
                      content: formatProfessionalHtml(sq.content) || '',
                      strandIndex: sqStrand,
                      strandText: stripHtmlTags(matchedSqStrand?.replace(/^[ivx]+[\.\)]\s*/i, '') || sq.strandText || ''),
                      type: sq.type || 'open',
                      options: Array.isArray(sq.options) ? sq.options.map((o: any) => stripHtmlTags(String(o))) : undefined,
                      correctAnswer: sq.correctAnswer ? stripHtmlTags(String(sq.correctAnswer)) : undefined,
                    };
                  })
                : undefined,
            };
          }),
        };
      });

      // Enrichissement visuel : générer UNIQUEMENT pour les exercices qui requièrent une courbe, figure, diagramme, schéma à légender ou œuvre d'art
      if (insertVisualDiagrams) {
        const nanoTargets: Array<{ cIdx: number; eIdx: number }> = [];
        validated.forEach((crit, cIdx) => {
          crit.exercises.forEach((ex, eIdx) => {
            const subText = Array.isArray(ex.subQuestions)
              ? ex.subQuestions.map(sq => sq.content || '').join(' ')
              : '';
            const hasPedagogicalVisual = Boolean(ex.imageUrl && ex.imageUrl.startsWith('data:image/'));
            if (!hasPedagogicalVisual && shouldExerciseHaveVisual(subject, ex.title, `${ex.content} ${subText}`)) {
              nanoTargets.push({ cIdx, eIdx });
            }
          });
        });

        const selectedTargets = nanoTargets.slice(0, 6);
        await Promise.all(
          selectedTargets.map(async ({ cIdx, eIdx }) => {
            const ex = validated[cIdx].exercises[eIdx];
            try {
              const generated = await generateDiagramOrMapWithGeminiAI({
                subject,
                gradeLevel,
                unitTitle,
                exerciseTitle: ex.title,
                exerciseContent: ex.content,
                visualStyle: 'auto',
              });
              if (generated?.imageUrl) {
                validated[cIdx].exercises[eIdx].imageUrl = generated.imageUrl;
                validated[cIdx].exercises[eIdx].imageCaption = generated.imageCaption;
              }
            } catch {
              // Conserver le schéma existant en cas d'erreur
            }
          })
        );
      }

      return autoEnrichAssessmentsWithLabelsAndTrueFalse(validated, subject, unitTitle);
    }
    return sanitizeAndFormatLocalAssessments(filteredExisting, subject, unitTitle, gradeLevel);
  } catch (error) {
    console.warn('optimizeEvaluationWithAI: Erreur lors de l\'appel API, utilisation du repli structuré local:', error);
    return sanitizeAndFormatLocalAssessments(filteredExisting, subject, unitTitle, gradeLevel);
  }
}

function isTrueFalseQuestionText(text: string): boolean {
  const plain = stripHtmlTags(text || '');
  return /\b(vrai\s+ou\s+faux|vrai\s*\/\s*faux|true\s+or\s+false|true\s*\/\s*false|affirmation\s+(?:suivante\s+)?est\s+vraie\s+ou\s+fausse|indiquer\s+si\s+l'affirmation|r[ée]pondre\s+par\s+vrai\s+ou\s+faux)\b/i.test(plain);
}

function needsDragLabelsActivity(text: string): boolean {
  const plain = stripHtmlTags(text || '');
  return /\b(l[ée]gender|l[ée]gendez|[ée]tiquette|[ée]tiquettes|associer|associez|relier|reliez|replacer\s+les\s+(?:termes|[ée]tiquettes)|compl[ée]ter\s+le\s+sch[ée]ma|placer\s+sur\s+(?:la\s+figure|le\s+sch[ée]ma)|label\s+the|match\s+the|drag\s+and\s+drop|place\s+the\s+labels)\b/i.test(plain);
}

/**
 * Construit un module d'étiquettes interactives (drag_labels) contextualisé à l'exercice, la matière et l'unité.
 */
export function buildContextualDragLabelsModule(
  ex: AssessmentExercise,
  subject: string = '',
  unitTitle: string = ''
): InteractiveExerciseModule {
  const isEn = isLanguageAcquisitionSubject(subject) || /english|anglais|acquisition/i.test(subject);
  const s = (subject || '').toLowerCase();
  const fullText = stripHtmlTags(`${ex.title || ''} ${ex.content || ''} ${ex.answer || ''} ${unitTitle || ''}`);

  // Extraire les termes en gras de l'énoncé ou du corrigé s'ils existent
  const boldMatches = Array.from(
    `${ex.content || ''} ${ex.answer || ''}`.matchAll(/<(?:strong|b)>([^<]{3,38})<\/(?:strong|b)>/gi)
  )
    .map(m => stripHtmlTags(m[1]).replace(/[:.;!?]+$/, '').trim())
    .filter(
      w =>
        w.length >= 3 &&
        w.length <= 36 &&
        !/^(mise en situation|contexte|consigne|instructions?|données|document|rappel|affirmation|calculer|déterminer|justifier|expliquer|identifier|analyser|comparer|décrire|vrai ou faux|true or false)$/i.test(w)
    );

  const uniqueTerms = Array.from(new Set(boldMatches)).slice(0, 4);

  if (uniqueTerms.length >= 3) {
    return {
      type: 'drag_labels',
      title: isEn ? 'Interactive Concept & Label Matching' : 'Étiquettes des notions clés à associer',
      instructions: isEn
        ? 'Click or drag each key term label to its corresponding analytical step or definition below.'
        : 'Glissez-déposez chaque étiquette (ou cliquez sur une étiquette puis sur l\'emplacement correspondant) pour structurer votre réponse.',
      labels: uniqueTerms,
      dropZones: uniqueTerms.slice(0, 3).map((term, idx) => ({
        id: `zone_${idx + 1}`,
        prompt: isEn
          ? `${idx + 1}. Key element #${idx + 1} identified in this task`
          : `${idx + 1}. Notion ou étape clé n°${idx + 1} mobilisée dans l'exercice`,
        correctLabel: term,
      })),
    };
  }

  if (s.includes('math')) {
    const isGeo = /triangle|cercle|angle|vecteur|droite|segment|pythagore|thal[èe]s|figure/i.test(fullText);
    const labels = isGeo
      ? ['Hypoténuse / Segment principal', 'Relation géométrique (Théorème)', 'Calcul de la longueur / angle', 'Conclusion avec unité']
      : ['Données & Inconnue (x)', 'Formule / Équation mathématique', 'Développement & Calcul', 'Résultat final vérifié'];
    return {
      type: 'drag_labels',
      title: 'Étiquettes méthodologiques & Repères à associer',
      instructions: 'Associez chaque étiquette à l\'étape correspondante de la résolution mathématique :',
      labels,
      dropZones: [
        { id: 'zone_1', prompt: '1. Identification des données de départ sur la figure / l\'énoncé', correctLabel: labels[0] },
        { id: 'zone_2', prompt: '2. Propriété, théorème ou modèle algébrique appliqué', correctLabel: labels[1] },
        { id: 'zone_3', prompt: '3. Validation et interprétation du résultat final', correctLabel: labels[3] },
      ],
    };
  }

  if (s.includes('science') || s.includes('physique') || s.includes('chimie') || s.includes('biologie') || s.includes('svt')) {
    const labels = ['Variable indépendante (Cause)', 'Variable dépendante (Effet mesuré)', 'Hypothèse scientifique testable', 'Interprétation & Conclusion'];
    return {
      type: 'drag_labels',
      title: 'Étiquettes scientifiques à placer et associer',
      instructions: 'Glissez ou cliquez sur chaque étiquette scientifique pour l\'associer au bon repère de l\'étude :',
      labels,
      dropZones: [
        { id: 'zone_1', prompt: '1. Facteur modifié ou contrôlé lors de l\'observation / expérience', correctLabel: labels[0] },
        { id: 'zone_2', prompt: '2. Grandeur mesurée ou phénomène observé sur le graphique / document', correctLabel: labels[1] },
        { id: 'zone_3', prompt: '3. Validation expérimentale et conclusion scientifique', correctLabel: labels[3] },
      ],
    };
  }

  if (s.includes('individu') || s.includes('soci') || s.includes('histoire') || s.includes('géo') || s.includes('éco')) {
    const labels = ['Facteur historique / spatial', 'Acteurs & Enjeux économiques/sociaux', 'Conséquence à court et long terme', 'Synthèse argumentée'];
    return {
      type: 'drag_labels',
      title: 'Étiquettes d\'analyse documentaire (Individus et Sociétés)',
      instructions: 'Associez chaque étiquette au repère d\'analyse correspondant :',
      labels,
      dropZones: [
        { id: 'zone_1', prompt: '1. Origine ou contexte spatiotemporel du document étudié', correctLabel: labels[0] },
        { id: 'zone_2', prompt: '2. Dynamique principale et acteurs impliqués', correctLabel: labels[1] },
        { id: 'zone_3', prompt: '3. Impact global et mise en perspective', correctLabel: labels[2] },
      ],
    };
  }

  const labels = isEn
    ? ['Main Concept / Thesis', 'Supporting Evidence from Text', 'Critical Analysis & Structure', 'justified Conclusion']
    : ['Idée directrice / Concept clé', 'Indice ou procédé relevé dans le support', 'Interprétation & Mise en relation', 'Bilan synthétique justifié'];
  return {
    type: 'drag_labels',
    title: isEn ? 'Interactive Labels to Match' : 'Étiquettes de repérage et d\'analyse à associer',
    instructions: isEn
      ? 'Click or drag each label to match it with the corresponding analytical prompt below.'
      : 'Glissez ou cliquez sur chaque étiquette pour la placer face au repère correspondant :',
    labels,
    dropZones: [
      { id: 'zone_1', prompt: isEn ? '1. Primary element identified in the stimulus' : '1. Premier repère identifié dans le support d\'étude', correctLabel: labels[0] },
      { id: 'zone_2', prompt: isEn ? '2. Textual or visual evidence supporting the analysis' : '2. Justification ou indice précis tiré de l\'énoncé', correctLabel: labels[1] },
      { id: 'zone_3', prompt: isEn ? '3. Synthesis and reasoned interpretation' : '3. Interprétation globale et conclusion', correctLabel: labels[3] },
    ],
  };
}

/**
 * Structure automatiquement un exercice :
 * 1. Sépare proprement la mise en situation / le document support (`content`) des sous-questions (`subQuestions` 1), 2), a), b))
 *    afin d'éviter toute répétition des questions dans l'encadré d'énoncé et de bien mettre chaque question et sous-question en place.
 * 2. Détecte automatiquement les questions Vrai/Faux (`true_false`) et les activités d'étiquettes (`drag_labels`).
 */
export function autoStructureExerciseAndInteractiveTypes(
  ex: AssessmentExercise,
  criterionLetter: string,
  strands: string[] = [],
  subject: string = '',
  unitTitle: string = '',
  exIdx: number = 0
): AssessmentExercise {
  const isEn = isLanguageAcquisitionSubject(subject) || /english|anglais|acquisition/i.test(subject);
  const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];

  const resolveStrandMeta = (idx: number, explicitRoman?: string, explicitText?: string) => {
    const r = (explicitRoman || romanNumerals[idx % romanNumerals.length] || 'i').toLowerCase();
    const matched = (strands || []).find(
      s => s.toLowerCase().trim().startsWith(`${r}.`) || s.toLowerCase().trim().startsWith(`${r})`)
    );
    const desc = stripHtmlTags(matched ? matched.replace(/^[ivx]+[\.\)]\s*/i, '') : explicitText || '');
    return { strandIndex: r, strandText: desc };
  };

  let rawContent = ex.content || '';
  let subQuestions: AssessmentSubQuestion[] | undefined =
    Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0
      ? ex.subQuestions.map((sq, sqIdx) => {
          const meta = resolveStrandMeta(sqIdx, sq.strandIndex, sq.strandText);
          const formattedSqContent = formatProfessionalHtml(sq.content || '');
          const detectedType = isTrueFalseQuestionText(formattedSqContent) ? 'true_false' : (sq.type || 'open');
          return {
            ...sq,
            id: sq.id || `sub_${sqIdx + 1}`,
            label: stripHtmlTags(sq.label || `${sqIdx + 1})`),
            content: formattedSqContent,
            strandIndex: meta.strandIndex,
            strandText: meta.strandText,
            type: detectedType,
            options: sq.options ? sq.options.map(o => stripHtmlTags(o)) : undefined,
          };
        })
      : undefined;

  // Convertir le HTML en lignes logiques pour détecter des sous-questions intégrées 1), 2), a), b)
  const textWithLineBreaks = rawContent
    .replace(/<\/p>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<\/div>/gi, '\n');
  const rawLines = textWithLineBreaks
    .split('\n')
    .map(l => stripHtmlTags(l).trim())
    .filter(Boolean);

  const subQRegex = /^(?:question\s*\d+\s*[:\.\-\)]|\d+[\)\.]|[a-d][\)\.])\s+(.+)/i;

  if (!subQuestions || subQuestions.length === 0) {
    // Vérifier si l'énoncé contient au moins 2 sous-questions numérotées/lettrées (ex: 1) ... 2) ... ou a) ... b) ...)
    const matchingLines = rawLines.filter(l => subQRegex.test(l));
    if (matchingLines.length >= 2) {
      const introLines: string[] = [];
      const extracted: { label: string; text: string }[] = [];

      for (const line of rawLines) {
        const m = line.match(/^((?:question\s*\d+\s*[:\.\-\)]|\d+[\)\.]|[a-d][\)\.]))\s+(.+)/i);
        if (m) {
          const cleanLabel = m[1].replace(/\s+/g, ' ').trim();
          extracted.push({
            label: cleanLabel.endsWith(')') || cleanLabel.endsWith('.') || cleanLabel.endsWith(':') ? cleanLabel : `${cleanLabel})`,
            text: m[2].trim(),
          });
        } else if (extracted.length === 0) {
          introLines.push(line);
        } else {
          // Rattaché à la sous-question précédente
          extracted[extracted.length - 1].text += ` ${line}`;
        }
      }

      if (extracted.length >= 2) {
        subQuestions = extracted.map((item, sIdx) => {
          const meta = resolveStrandMeta(sIdx);
          const formattedQ = formatProfessionalHtml(item.text);
          return {
            id: `sub_${sIdx + 1}`,
            label: item.label,
            content: formattedQ,
            strandIndex: meta.strandIndex,
            strandText: meta.strandText,
            type: isTrueFalseQuestionText(formattedQ) ? 'true_false' : 'open',
          };
        });

        rawContent =
          introLines.length > 0
            ? introLines.join('\n\n')
            : isEn
            ? `<p><strong>Instructions:</strong> <strong>Analyze</strong> the context and <strong>answer</strong> each sub-question below methodically.</p>`
            : `<p><strong>Consigne :</strong> <strong>Analyser</strong> les données de l'exercice et <strong>répondre</strong> méthodiquement aux sous-questions ci-dessous.</p>`;
      }
    }
  } else {
    // Si subQuestions existe déjà, nettoyer `rawContent` pour retirer les lignes 1) ... 2) ... dupliquées
    const filteredIntroLines = rawLines.filter(line => !subQRegex.test(line));
    if (filteredIntroLines.length > 0 && filteredIntroLines.length < rawLines.length) {
      rawContent = filteredIntroLines.join('\n\n');
    }
  }

  const formattedContent = formatProfessionalHtml(rawContent);
  const allSubText = (subQuestions || []).map(sq => sq.content).join(' ');
  const combinedText = `${ex.title || ''} ${formattedContent} ${allSubText}`;

  const detectedMainType =
    (!subQuestions || subQuestions.length === 0) && isTrueFalseQuestionText(formattedContent)
      ? 'true_false'
      : ex.type || 'open';

  let interactiveModule = ex.interactiveModule;
  if (!interactiveModule && needsDragLabelsActivity(combinedText)) {
    interactiveModule = buildContextualDragLabelsModule(
      { ...ex, content: formattedContent, subQuestions },
      subject,
      unitTitle
    );
  }

  const mainStrandMeta = resolveStrandMeta(exIdx, ex.strandIndex, ex.strandText);

  return {
    ...ex,
    content: formattedContent,
    strandIndex: mainStrandMeta.strandIndex,
    strandText: mainStrandMeta.strandText,
    type: detectedMainType,
    interactiveModule,
    subQuestions,
  };
}

/**
 * Enrichit automatiquement l'évaluation lorsque cela est nécessaire :
 * - Garantit que les exercices qui demandent de légender/associer/classer (ou le 1er exercice de connaissances si aucun n'existe)
 *   disposent d'étiquettes mobiles interactives (`drag_labels`) si pertinent.
 * - Garantit la présence d'au moins une question/sous-question interactive Vrai / Faux (`true_false`) si l'évaluation n'en comporte aucune.
 */
export function autoEnrichAssessmentsWithLabelsAndTrueFalse(
  assessments: AssessmentData[],
  subject: string = '',
  unitTitle: string = ''
): AssessmentData[] {
  if (!Array.isArray(assessments) || assessments.length === 0) return assessments;
  const isEn = isLanguageAcquisitionSubject(subject) || /english|anglais|acquisition/i.test(subject);

  // 1. Structurer chaque exercice individuellement
  const structured = assessments.map(crit => ({
    ...crit,
    exercises: (crit.exercises || []).map((ex, exIdx) =>
      autoStructureExerciseAndInteractiveTypes(ex, crit.criterion, crit.strands || [], subject, unitTitle, exIdx)
    ),
  }));

  // 2. Vérifier si l'évaluation possède déjà une question Vrai/Faux et un module d'étiquettes
  let hasAnyTrueFalse = false;
  let hasAnyDragLabels = false;

  structured.forEach(crit => {
    (crit.exercises || []).forEach(ex => {
      if (ex.type === 'true_false') hasAnyTrueFalse = true;
      if (ex.interactiveModule?.type === 'drag_labels') hasAnyDragLabels = true;
      (ex.subQuestions || []).forEach(sq => {
        if (sq.type === 'true_false') hasAnyTrueFalse = true;
      });
    });
  });

  // 3. Si aucun module d'étiquettes n'est présent, en attacher un sur l'exercice le plus adapté (avec figure/schéma ou Critère A Ex 1)
  if (!hasAnyDragLabels && structured[0]?.exercises?.length > 0) {
    let targetCritIdx = 0;
    let targetExIdx = 0;
    for (let c = 0; c < structured.length; c++) {
      const foundIdx = (structured[c].exercises || []).findIndex(e => Boolean(e.imageUrl) && !e.interactiveModule);
      if (foundIdx !== -1) {
        targetCritIdx = c;
        targetExIdx = foundIdx;
        break;
      }
    }
    const targetEx = structured[targetCritIdx].exercises[targetExIdx];
    if (targetEx && !targetEx.interactiveModule) {
      targetEx.interactiveModule = buildContextualDragLabelsModule(targetEx, subject, unitTitle);
    }
  }

  // 4. Si aucune question Vrai/Faux n'est présente dans toute l'évaluation, ajouter une sous-question de vérification Vrai/Faux
  if (!hasAnyTrueFalse && structured[0]?.exercises?.length > 0) {
    const firstCrit = structured[0];
    const targetEx = firstCrit.exercises[0];
    if (targetEx) {
      const existingSubs = Array.isArray(targetEx.subQuestions) ? [...targetEx.subQuestions] : [];
      const alreadyHasAutoTf = existingSubs.some(sq => sq.id === 'sub_tf_verif' || sq.type === 'true_false');
      if (!alreadyHasAutoTf) {
        const tfContent = isEn
          ? formatProfessionalHtml(
              `<p><strong>True or False:</strong> Based on the concepts studied in "${unitTitle || targetEx.title || subject}", <strong>identify</strong> whether the main statement/hypothesis presented in this task is true or false, and <strong>justify</strong> your answer in one sentence.</p>`
            )
          : formatProfessionalHtml(
              `<p><strong>Vrai ou Faux :</strong> D'après les notions étudiées dans « ${unitTitle || targetEx.title || subject} », <strong>indiquer</strong> si l'affirmation ou propriété principale mobilisée dans cet exercice est exacte (Vrai) ou erronée (Faux), puis <strong>justifier</strong> brièvement.</p>`
            );

        if (existingSubs.length > 0) {
          existingSubs.push({
            id: 'sub_tf_verif',
            label: `${existingSubs.length + 1})`,
            content: tfContent,
            strandIndex: existingSubs[existingSubs.length - 1]?.strandIndex || 'ii',
            strandText: existingSubs[existingSubs.length - 1]?.strandText || '',
            type: 'true_false',
          });
          targetEx.subQuestions = existingSubs;
        } else if (targetEx.type === 'open') {
          // Transformer l'exercice en 2 sous-questions structurées : 1) Question principale + 2) Vrai/Faux de vérification
          const firstStrand = (firstCrit.strands || [])[0]?.replace(/^[ivx]+[\.\)]\s*/i, '') || '';
          const secondStrand = (firstCrit.strands || [])[1]?.replace(/^[ivx]+[\.\)]\s*/i, '') || firstStrand;
          targetEx.subQuestions = [
            {
              id: 'sub_1',
              label: '1)',
              content: targetEx.content,
              strandIndex: targetEx.strandIndex || 'i',
              strandText: targetEx.strandText || firstStrand,
              type: 'open',
            },
            {
              id: 'sub_tf_verif',
              label: '2)',
              content: tfContent,
              strandIndex: 'ii',
              strandText: secondStrand,
              type: 'true_false',
            },
          ];
          targetEx.content = isEn
            ? formatProfessionalHtml(`<p><strong>Context:</strong> Study the task elements below and <strong>complete</strong> both questions in order.</p>`)
            : formatProfessionalHtml(`<p><strong>Mise en situation :</strong> Prenez connaissance des éléments de l'exercice ci-dessous et <strong>répondez</strong> aux questions dans l'ordre.</p>`);
        }
      }
    }
  }

  return structured;
}

/**
 * Nettoyage et formatage local de sécurité :
 * Élimine les doublons exacts, applique le format HTML soigné sans aucun symbole **,
 * met en gras tous les mots-clés de consigne, structure automatiquement les questions et sous-questions,
 * ajoute automatiquement les questions d'étiquettes et Vrai/Faux si besoin,
 * et ne conserve/génère des visuels QUE pour les exercices de courbe, figure, diagramme, légende ou art.
 */
export function sanitizeAndFormatLocalAssessments(
  assessments: AssessmentData[],
  subject: string = '',
  unitTitle: string = '',
  gradeLevel: string = ''
): AssessmentData[] {
  const isEn = isLanguageAcquisitionSubject(subject) || /english|anglais|acquisition/i.test(subject);
  const savedCriteriaConfig = gradeLevel ? getCriteriaSync(subject, gradeLevel) : null;

  const cleanedCriteria = assessments.map(crit => {
    const savedCrit = savedCriteriaConfig?.criteria?.find(c => c.criterion === crit.criterion);
    const officialCriterionName = stripHtmlTags(savedCrit?.criterionName || crit.criterionName || (isEn ? `Criterion ${crit.criterion}` : `Critère ${crit.criterion}`));
    const officialStrands = (savedCrit?.strands?.length ? [...savedCrit.strands] : crit.strands || []).map(s => stripHtmlTags(s));

    const seenTitles = new Set<string>();
    const seenContents = new Set<string>();
    const uniqueExercises: AssessmentExercise[] = [];

    (crit.exercises || []).forEach((ex, idx) => {
      const cleanContent = formatProfessionalHtml(ex.content);
      const rawTitle = stripHtmlTags(ex.title) || (isEn ? `Task ${idx + 1}` : `Tâche ${idx + 1}`);
      const cleanTitle = isEn ? rawTitle.replace(/^Tâche\s+/i, 'Task ').replace(/^Exercice\s+/i, 'Task ') : rawTitle;
      const simpleContentKey = cleanContent.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 80);
      const simpleTitleKey = cleanTitle.toLowerCase().replace(/[^a-z0-9]/g, '');

      // Détection de doublons stricts
      if (simpleContentKey && seenContents.has(simpleContentKey)) {
        return;
      }
      if (simpleTitleKey && seenTitles.has(simpleTitleKey) && simpleContentKey && seenContents.has(simpleContentKey)) {
        return;
      }

      if (simpleContentKey) seenContents.add(simpleContentKey);
      if (simpleTitleKey) seenTitles.add(simpleTitleKey);

      const subQuestionsText = Array.isArray(ex.subQuestions)
        ? ex.subQuestions.map(sq => stripHtmlTags(sq.content || '')).join(' ')
        : '';

      // Validation stricte du visuel : supprime toute photo décorative et attache la vraie courbe/figure si requis
      const sanitizedVisual = sanitizeExerciseVisualsForDisplay({
        subject,
        unitTitle,
        exerciseTitle: cleanTitle,
        exerciseContent: cleanContent,
        subQuestionsText,
        imageUrl: ex.imageUrl,
        imageCaption: ex.imageCaption,
      });

      const sIdx = ex.strandIndex || 'i';
      const matchedSavedStrand = savedCrit?.strands?.find(s => s.toLowerCase().startsWith(`${sIdx.toLowerCase()}.`));

      uniqueExercises.push({
        ...ex,
        title: cleanTitle,
        content: cleanContent,
        criterionReference: ex.criterionReference
          ? (isEn ? stripHtmlTags(String(ex.criterionReference)).replace(/^Critère/i, 'Criterion') : stripHtmlTags(String(ex.criterionReference)))
          : (isEn ? `Criterion ${crit.criterion}: ${sIdx}.` : `Critère ${crit.criterion} : ${sIdx}.`),
        strandText: stripHtmlTags(matchedSavedStrand?.replace(/^[ivx]+[\.\)]\s*/i, '') || ex.strandText || ''),
        imageUrl: sanitizedVisual.imageUrl,
        imageCaption: sanitizedVisual.imageCaption,
        answer: ex.answer ? formatProfessionalHtml(ex.answer) : undefined,
        options: ex.options ? ex.options.map(o => stripHtmlTags(o)) : undefined,
        subQuestions: ex.subQuestions?.map(sq => {
          const sqStrand = sq.strandIndex || 'i';
          const matchedSqStrand = savedCrit?.strands?.find(s => s.toLowerCase().startsWith(`${sqStrand.toLowerCase()}.`));
          return {
            ...sq,
            label: stripHtmlTags(sq.label),
            strandText: stripHtmlTags(matchedSqStrand?.replace(/^[ivx]+[\.\)]\s*/i, '') || sq.strandText || ''),
            content: formatProfessionalHtml(sq.content),
            options: sq.options ? sq.options.map(o => stripHtmlTags(o)) : undefined,
          };
        }),
      });
    });

    return {
      ...crit,
      criterionName: officialCriterionName,
      strands: officialStrands,
      rubricRows: crit.rubricRows?.map(r => ({
        level: stripHtmlTags(r.level),
        descriptor: stripHtmlTags(r.descriptor),
      })),
      exercises: uniqueExercises,
    };
  });

  return autoEnrichAssessmentsWithLabelsAndTrueFalse(cleanedCriteria, subject, unitTitle);
}

