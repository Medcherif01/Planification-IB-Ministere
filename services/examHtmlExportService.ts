import { saveAs } from 'file-saver';
import { Exam, QuestionType } from '../types';
import { LOGO_ALKAWTAR_BASE64 } from './logoBase64';
import { isArabicText } from '../constants';

// Convertir les notations mathématiques simples pour affichage lisible
function formatMathText(text: string): string {
  if (!text) return '';
  let s = text;
  // Fractions LaTeX
  for (let i = 0; i < 5; i++) {
    s = s.replace(/\\?frac\{([^{}]*)\}\{([^{}]*)\}/g, '$1/$2');
  }
  s = s.replace(/\\?sqrt\{([^{}]*)\}/g, '√($1)');
  s = s.replace(/\\?sqrt\s+(\S+)/g, '√($1)');
  s = s.replace(/\\cdot/g, '×');
  s = s.replace(/\\times/g, '×');
  s = s.replace(/\\div/g, '÷');
  s = s.replace(/\\pm/g, '±');
  s = s.replace(/\\leq/g, '≤');
  s = s.replace(/\\geq/g, '≥');
  s = s.replace(/\\neq/g, '≠');
  s = s.replace(/\\approx/g, '≈');
  s = s.replace(/\\infty/g, '∞');
  s = s.replace(/\\pi/g, 'π');
  s = s.replace(/\$([^$\n]+)\$/g, '$1');
  s = s.replace(/\\([a-zA-Z]+)/g, '$1');
  return s;
}

// Générer des lignes d'écriture pointillées pour les réponses des élèves
function generateDottedAnswerLines(linesCount: number = 4): string {
  const line = '<div class="student-answer-line"></div>';
  return Array(linesCount).fill(line).join('');
}

// Formater le contenu d'une question
function formatQuestionContent(content: string): string {
  if (!content) return '';
  let c = formatMathText(content);

  // Si le contenu contient déjà une table HTML, on s'assure qu'elle a la classe requise
  if (c.includes('<table')) {
    c = c.replace(/<table([^>]*)>/gi, '<table class="exam-table"$1>');
  } else {
    // Si c'est du markdown table avec des pipes (|)
    const lines = c.split('\n');
    const out: string[] = [];
    let inTable = false;
    let tableHtml = '';
    let isHeader = true;

    for (const line of lines) {
      if (/^\s*\|.+\|\s*$/.test(line)) {
        if (!inTable) {
          inTable = true;
          tableHtml = '<table class="exam-table"><tbody>';
          isHeader = true;
        }
        if (/^\s*\|[\s\-|:]+\|\s*$/.test(line)) {
          isHeader = false;
          continue;
        }
        const cells = line.split('|').map(x => x.trim()).filter(x => x !== '');
        const tag = isHeader ? 'th' : 'td';
        tableHtml += '<tr>' + cells.map(cell => {
          const isAr = isArabicText(cell);
          const arAttrs = isAr ? ' dir="rtl" class="arabic-cell" style="direction: rtl !important; text-align: center !important;"' : '';
          return `<${tag}${arAttrs}>${cell}</${tag}>`;
        }).join('') + '</tr>';
        if (isHeader) isHeader = false;
      } else {
        if (inTable) {
          tableHtml += '</tbody></table>';
          out.push(tableHtml);
          inTable = false;
        }
        out.push(line);
      }
    }
    if (inTable) {
      tableHtml += '</tbody></table>';
      out.push(tableHtml);
    }
    c = out.join('\n');
  }

  // Remplacer les retours à la ligne simples par des sauts de ligne si ce n'est pas dans un tag HTML
  c = c.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>');
  return `<p>${c}</p>`;
}

/**
 * Génère le code HTML complet et autonome d'un examen,
 * reproduisant fidèlement le design du modèle Word officiel d'Al Kawthar
 * et optimisé pour une impression parfaite en format A4.
 */
export function generateExamHtml(exam: Exam, isCorrection: boolean = false): string {
  const isEnglish = (exam.subject || '').toLowerCase().includes('anglais') ||
                    (exam.subject || '').toLowerCase().includes('english') ||
                    (exam.subject || '').toLowerCase().includes('language acquisition');

  const examTypeLabel = exam.title?.toLowerCase().includes('évaluation') ? 'Évaluation' : 'Examen';
  const mainTitle = isCorrection
    ? `${examTypeLabel} en ${exam.subject} — CORRECTION`
    : `${examTypeLabel} en ${exam.subject}`;

  // Organiser les questions par section
  const sectionsMap = new Map<string, any[]>();
  (exam.questions || []).forEach(q => {
    const sec = q.section || (isEnglish ? 'Exercises' : 'Exercices');
    if (!sectionsMap.has(sec)) sectionsMap.set(sec, []);
    sectionsMap.get(sec)!.push(q);
  });

  let globalQuestionIndex = 0;
  let exercisesHtml = '';

  sectionsMap.forEach((questions, sectionName) => {
    if (sectionName !== 'Exercices' && sectionName !== 'Exercises') {
      exercisesHtml += `
        <div class="exam-section-header">
          ${sectionName.toUpperCase()}
        </div>
      `;
    }

    questions.forEach(q => {
      globalQuestionIndex++;
      const exerciseLabel = isEnglish ? 'EXERCISE' : 'EXERCICE';
      const pointsLabel = isEnglish ? (q.points > 1 ? 'points' : 'point') : (q.points > 1 ? 'points' : 'point');
      const titleText = formatMathText(q.title || '').toUpperCase();

      exercisesHtml += `
        <div class="exercise-card">
          <div class="exercise-header">
            <div class="exercise-title">
              <strong>${exerciseLabel} ${globalQuestionIndex} : ${titleText}</strong>
              <span class="exercise-points">(${q.points} ${pointsLabel})</span>
            </div>
            ${q.isDifferentiation ? `
              <div class="differentiation-badge">
                ★ ${isEnglish ? 'Differentiation Exercise' : 'Exercice de différenciation'}
              </div>
            ` : ''}
          </div>

          <div class="exercise-body">
            ${formatQuestionContent(q.content || '')}

            ${/* Affichage spécifique selon le type de question pour le sujet */ ''}
            ${!isCorrection && q.type === QuestionType.QCM && q.options && q.options.length > 0 ? `
              <div class="qcm-options">
                ${q.options.map((opt: string, i: number) => `
                  <div class="qcm-option-item">
                    <span class="qcm-checkbox">☐</span>
                    <strong>${String.fromCharCode(65 + i)}.</strong>
                    <span>${formatMathText(opt)}</span>
                  </div>
                `).join('')}
              </div>
            ` : ''}

            ${!isCorrection && q.type === QuestionType.VRAI_FAUX && q.statements && q.statements.length > 0 ? `
              <table class="exam-table true-false-table">
                <thead>
                  <tr>
                    <th style="width: 70%; text-align: left;">Affirmation</th>
                    <th style="width: 15%; text-align: center;">Vrai</th>
                    <th style="width: 15%; text-align: center;">Faux</th>
                  </tr>
                </thead>
                <tbody>
                  ${q.statements.map((stmt: any, i: number) => `
                    <tr>
                      <td>${i + 1}. ${formatMathText(stmt.statement || stmt)}</td>
                      <td style="text-align: center; font-size: 1.1em;">☐</td>
                      <td style="text-align: center; font-size: 1.1em;">☐</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            ` : ''}

            ${!isCorrection && (
              q.type === QuestionType.REPONSE_LONGUE ||
              q.type === QuestionType.PROBLEME ||
              q.type === QuestionType.ANALYSE_DOCUMENTS ||
              q.type === QuestionType.DEFINITIONS ||
              q.type === QuestionType.TEXTE_A_TROUS ||
              q.type === QuestionType.LEGENDER
            ) ? `
              <div class="student-answer-zone">
                ${generateDottedAnswerLines(
                  q.expectedLines || (q.type === QuestionType.ANALYSE_DOCUMENTS ? 5 : q.type === QuestionType.REPONSE_LONGUE ? 6 : 4)
                )}
              </div>
            ` : ''}

            ${/* Zone de correction si le mode corrigé est activé */ ''}
            ${isCorrection ? `
              <div class="correction-box">
                <div class="correction-badge">
                  <span>✔ ${isEnglish ? 'OFFICIAL CORRECTION & MARKING CRITERIA' : 'CORRIGÉ TYPE & CRITÈRES D\'ÉVALUATION'}</span>
                  <span>(${q.points} ${pointsLabel})</span>
                </div>
                <div class="correction-content">
                  ${q.type === QuestionType.QCM ? `
                    <p><strong>${isEnglish ? 'Correct answer' : 'Bonne réponse'} :</strong> ${q.correctAnswer || q.answer || 'Option correcte'}</p>
                    ${q.explanation ? `<p><em>${isEnglish ? 'Explanation' : 'Explication'} :</em> ${formatMathText(q.explanation)}</p>` : ''}
                  ` : q.type === QuestionType.VRAI_FAUX && q.statements ? `
                    <ul class="correction-list">
                      ${q.statements.map((s: any, idx: number) => `
                        <li>Affirmation ${idx + 1} : <strong>${s.isTrue ? (isEnglish ? 'TRUE' : 'VRAI') : (isEnglish ? 'FALSE' : 'FAUX')}</strong> ${s.explanation ? `(${formatMathText(s.explanation)})` : ''}</li>
                      `).join('')}
                    </ul>
                  ` : `
                    <div class="correction-text">
                      ${formatQuestionContent(q.answer || q.correction || 'Correction détaillée attendue selon le barème officiel.')}
                    </div>
                  `}
                </div>
              </div>
            ` : ''}
          </div>
        </div>
      `;
    });
  });

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${mainTitle} - ${exam.className || exam.grade}</title>
  <style>
    /* Reset & Typographie conforme au modèle Word */
    *, *::before, *::after {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }

    body {
      background-color: #f1f5f9;
      color: #111827;
      font-family: Arial, "Helvetica Neue", Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }

    /* Barre d'action supérieure (masquée lors de l'impression) */
    .top-action-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      background: #ffffff;
      border-bottom: 1px solid #e2e8f0;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
      padding: 12px 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 16px;
    }

    .top-action-bar h1 {
      font-size: 14pt;
      font-weight: 700;
      color: #1e293b;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .action-buttons {
      display: flex;
      gap: 10px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 6px;
      font-size: 10pt;
      font-weight: 600;
      cursor: pointer;
      border: 1px solid transparent;
      transition: all 0.15s ease-in-out;
      text-decoration: none;
    }

    .btn-primary {
      background-color: #2563eb;
      color: #ffffff;
    }
    .btn-primary:hover {
      background-color: #1d4ed8;
    }

    .btn-secondary {
      background-color: #f8fafc;
      color: #334155;
      border-color: #cbd5e1;
    }
    .btn-secondary:hover {
      background-color: #e2e8f0;
    }

    .btn-success {
      background-color: #16a34a;
      color: #ffffff;
    }
    .btn-success:hover {
      background-color: #15803d;
    }

    /* Feuille A4 */
    .a4-page-container {
      width: 210mm;
      min-height: 297mm;
      margin: 24px auto;
      background: #ffffff;
      padding: 15mm 18mm 20mm 18mm;
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.12);
      border: 1px solid #cbd5e1;
      position: relative;
    }

    /* En-tête de l'établissement (fidèle au modèle Word) */
    .school-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding-bottom: 12px;
      margin-bottom: 12px;
      border-bottom: 1.5px solid #000000;
    }

    .school-header-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .school-logo {
      height: 60px;
      width: auto;
      object-fit: contain;
    }

    .school-header-right {
      text-align: right;
    }

    .school-name {
      font-size: 13pt;
      font-weight: 800;
      color: #000000;
      letter-spacing: 0.5px;
      text-transform: uppercase;
    }

    .school-year {
      font-size: 10.5pt;
      font-weight: 500;
      color: #374151;
      margin-top: 2px;
    }

    /* Table d'identification de l'examen (Table 0 du modèle Word) */
    .exam-identity-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000000;
      margin-bottom: 8px;
    }

    .exam-identity-table td, 
    .exam-identity-table th {
      border: 1px solid #000000;
      padding: 6px 10px;
      vertical-align: middle;
      font-size: 10.5pt;
    }

    .exam-title-cell {
      width: 52%;
      text-align: center;
      font-weight: 800;
      font-size: 13pt;
      text-transform: uppercase;
      background-color: #fbfbfb;
      padding: 12px 8px !important;
      line-height: 1.3;
    }

    .exam-meta-cell {
      width: 48%;
      padding: 5px 10px !important;
      font-size: 10pt;
    }

    .exam-student-row td {
      padding: 8px 10px !important;
      font-weight: 600;
      background-color: #fafafa;
    }

    /* Grille Note & Observations (Table 1 du modèle Word) */
    .exam-grading-table {
      width: 100%;
      border-collapse: collapse;
      border: 1.5px solid #000000;
      margin-bottom: 20px;
    }

    .exam-grading-table th {
      border: 1px solid #000000;
      padding: 5px 8px;
      font-weight: 700;
      font-size: 10pt;
      background-color: #f2f2f2;
      text-align: center;
    }

    .exam-grading-table td {
      border: 1px solid #000000;
      padding: 8px 10px;
      font-size: 10pt;
    }

    .exam-grade-score-cell {
      width: 25%;
      text-align: center;
      font-size: 15pt;
      font-weight: 800;
      height: 38px;
    }

    .exam-grade-obs-cell {
      width: 75%;
      height: 38px;
    }

    /* Titres de parties/sections */
    .exam-section-header {
      background-color: #f1f5f9;
      border-left: 4px solid #000000;
      padding: 6px 12px;
      font-weight: 800;
      font-size: 11.5pt;
      margin: 18px 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    /* Carte Exercice */
    .exercise-card {
      margin-bottom: 22px;
      page-break-inside: avoid;
    }

    .exercise-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      border-bottom: 1.5px solid #000000;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    .exercise-title {
      font-size: 11pt;
      font-weight: 800;
      color: #000000;
    }

    .exercise-points {
      font-weight: 700;
      font-size: 10pt;
      color: #1f2937;
      margin-left: 6px;
    }

    .differentiation-badge {
      font-size: 9pt;
      font-weight: 600;
      color: #854d0e;
      background-color: #fef9c3;
      padding: 2px 8px;
      border-radius: 4px;
      border: 1px solid #fde047;
    }

    .exercise-body {
      font-size: 10.5pt;
      line-height: 1.5;
    }

    .exercise-body p {
      margin-bottom: 8px;
    }

    /* QCM */
    .qcm-options {
      margin: 10px 0;
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 6px 16px;
    }

    .qcm-option-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 6px;
    }

    .qcm-checkbox {
      font-size: 13pt;
      line-height: 1;
    }

    /* Tableaux dans les exercices */
    .exam-table {
      width: 100%;
      border-collapse: collapse;
      margin: 10px 0;
      font-size: 10pt;
    }

    .exam-table th, .exam-table td {
      border: 1px solid #475569;
      padding: 6px 10px;
      text-align: left;
    }

    .exam-table th {
      background-color: #f1f5f9;
      font-weight: 700;
    }

    /* Lignes pour réponse de l'élève (pointillées) */
    .student-answer-zone {
      margin-top: 10px;
      margin-bottom: 8px;
    }

    .student-answer-line {
      border-bottom: 1px dotted #6b7280;
      height: 22px;
      width: 100%;
    }

    /* Boîte de correction (mode Corrigé) */
    .correction-box {
      margin-top: 12px;
      border: 1.5px solid #dc2626;
      border-radius: 6px;
      background-color: #fef2f2;
      padding: 10px 14px;
    }

    .correction-badge {
      display: flex;
      justify-content: space-between;
      color: #991b1b;
      font-weight: 800;
      font-size: 9.5pt;
      text-transform: uppercase;
      border-bottom: 1px solid #fecaca;
      padding-bottom: 4px;
      margin-bottom: 8px;
    }

    .correction-content {
      color: #7f1d1d;
      font-size: 10pt;
      line-height: 1.5;
    }

    .correction-list {
      margin-left: 20px;
      margin-top: 4px;
    }

    .correction-list li {
      margin-bottom: 4px;
    }

    /* Pied de page de numérotation */
    .page-footer {
      margin-top: 30px;
      text-align: center;
      font-size: 9pt;
      color: #64748b;
      border-top: 1px solid #e2e8f0;
      padding-top: 8px;
    }

    /* Support complet de la langue arabe : RTL et Centré dans toutes les cases */
    .arabic-text,
    [dir="rtl"],
    .dir-rtl,
    .arabic-cell,
    td[dir="rtl"],
    th[dir="rtl"] {
      direction: rtl !important;
      text-align: center !important;
      font-family: 'Cairo', 'Amiri', Tahoma, sans-serif !important;
      unicode-bidi: plaintext !important;
    }
    td.arabic-cell,
    th.arabic-cell,
    .exam-table td[dir="rtl"],
    .exam-table th[dir="rtl"],
    .exam-identity-table td[dir="rtl"],
    .exam-grading-table td[dir="rtl"] {
      text-align: center !important;
      direction: rtl !important;
    }

    /* Règles d'impression A4 strictes */
    @media print {
      body {
        background: #ffffff !important;
        color: #000000 !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }

      .arabic-text,
      [dir="rtl"],
      .dir-rtl,
      .arabic-cell,
      td[dir="rtl"],
      th[dir="rtl"],
      td.arabic-cell,
      th.arabic-cell {
        direction: rtl !important;
        text-align: center !important;
        font-family: 'Cairo', 'Amiri', Tahoma, sans-serif !important;
        unicode-bidi: plaintext !important;
      }

      .no-print {
        display: none !important;
      }

      .a4-page-container {
        width: 100% !important;
        min-height: auto !important;
        margin: 0 !important;
        padding: 0 !important;
        box-shadow: none !important;
        border: none !important;
      }

      .exercise-card {
        page-break-inside: avoid;
      }

      .exam-section-header {
        page-break-after: avoid;
      }

      @page {
        size: A4 portrait;
        margin: 12mm 15mm 15mm 15mm;
      }
    }
  </style>
</head>
<body>

  <!-- Barre d'action supérieure (masquée lors de l'impression) -->
  <div class="top-action-bar no-print">
    <h1>
      <span>📄</span>
      <span>${mainTitle} — ${exam.className || exam.grade}</span>
    </h1>
    <div class="action-buttons">
      <button class="btn btn-primary" onclick="window.print()">
        🖨️ Imprimer / Enregistrer en PDF (A4)
      </button>
      <button class="btn btn-success" onclick="downloadHtmlFile()">
        💾 Télécharger le fichier HTML
      </button>
      <button class="btn btn-secondary" onclick="window.close()">
        ✕ Fermer
      </button>
    </div>
  </div>

  <!-- Feuille A4 contenant l'examen avec le design exact du modèle Word -->
  <div class="a4-page-container">

    <!-- En-tête officiel Al Kawthar -->
    <header class="school-header">
      <div class="school-header-left">
        <img class="school-logo" src="${LOGO_ALKAWTAR_BASE64}" alt="Logo Al Kawthar" />
      </div>
      <div class="school-header-right">
        <div class="school-name">LES ÉCOLES INTERNATIONALES AL KAWTHAR</div>
        <div class="school-year">L’année scolaire : 2026 - 2027</div>
      </div>
    </header>

    <!-- Table 0 : Identification et métadonnées de l'examen -->
    <table class="exam-identity-table">
      <tbody>
        <tr>
          <!-- Cellule gauche fusionnée (Titre de l'épreuve) -->
          <td rowspan="5" class="exam-title-cell">
            ${mainTitle}
          </td>
          <!-- Colonne droite (5 lignes d'informations) -->
          <td class="exam-meta-cell">
            <strong>Classe :</strong> ${exam.className || exam.grade || 'PEI'}
          </td>
        </tr>
        <tr>
          <td class="exam-meta-cell">
            <strong>Durée :</strong> ${exam.duration || '2H'}
          </td>
        </tr>
        <tr>
          <td class="exam-meta-cell">
            <strong>Enseignant :</strong> ${exam.teacherName || '................................'}
          </td>
        </tr>
        <tr>
          <td class="exam-meta-cell">
            <strong>Semestre :</strong> ${exam.semester || 'Semestre 1'}
          </td>
        </tr>
        <tr>
          <td class="exam-meta-cell">
            <strong>Date :</strong> ${exam.date || '....../....../..........'}
          </td>
        </tr>
        <!-- Ligne pleine largeur : Nom et prénom -->
        <tr class="exam-student-row">
          <td colspan="2">
            <strong>Nom et prénom :</strong> ................................................................................................................................................
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Table 1 : Grille Note et Observations -->
    <table class="exam-grading-table">
      <thead>
        <tr>
          <th style="width: 25%;">Note</th>
          <th style="width: 75%;">Observations</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td class="exam-grade-score-cell">
            /${exam.totalPoints || 30}
          </td>
          <td class="exam-grade-obs-cell">
            <!-- Espace réservé aux remarques et observations de l'enseignant -->
          </td>
        </tr>
      </tbody>
    </table>

    <!-- Corps des exercices -->
    <main class="exam-content-area">
      ${exercisesHtml}
    </main>

    <!-- Pied de page -->
    <footer class="page-footer">
      <span>Les Écoles Internationales Al Kawthar — ${exam.title || 'Examen'}</span>
    </footer>

  </div>

  <script>
    function downloadHtmlFile() {
      const htmlContent = document.documentElement.outerHTML;
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = "${mainTitle.replace(/[\s\/:*?"<>|]+/g, '_')}_A4.html";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  </script>
</body>
</html>`;
}

/**
 * Télécharge directement le fichier HTML autonome de l'examen sur le disque de l'utilisateur
 */
export function downloadExamHtml(exam: Exam, isCorrection: boolean = false): void {
  const html = generateExamHtml(exam, isCorrection);
  const examType = exam.title?.toLowerCase().includes('évaluation') ? 'Evaluation' : 'Examen';
  const prefix = isCorrection ? `${examType}_Correction` : examType;
  const fileName = `${prefix}_${(exam.subject || '').replace(/\s+/g, '_')}_${(exam.grade || '').replace(/\s+/g, '_')}_A4.html`;

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  saveAs(blob, fileName);
}

/**
 * Ouvre une nouvelle fenêtre de prévisualisation avec la version HTML A4,
 * prête à être imprimée directement ou enregistrée en PDF.
 */
export function openExamPrintWindow(exam: Exam, isCorrection: boolean = false): void {
  const html = generateExamHtml(exam, isCorrection);
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
  } else {
    // Si popup bloquée, télécharger le fichier directement
    downloadExamHtml(exam, isCorrection);
  }
}
