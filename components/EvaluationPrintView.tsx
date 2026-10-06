import React, { useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Award, Clock, Download } from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, AssessmentSubQuestion } from '../types';
import { isEnglishSubject } from '../services/criterialQuestionGeneratorService';

interface EvaluationPrintViewProps {
  evaluation: OnlineEvaluation;
  submission?: StudentSubmission | null;
  onClose: () => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  A: { bg: '#f8fafc', border: '#cbd5e1', text: '#1e3a8a', badge: '#1e40af' },
  B: { bg: '#f8fafc', border: '#cbd5e1', text: '#14532d', badge: '#15803d' },
  C: { bg: '#f8fafc', border: '#cbd5e1', text: '#78350f', badge: '#b45309' },
  D: { bg: '#f8fafc', border: '#cbd5e1', text: '#881337', badge: '#be123c' },
};

// Helper: Nettoyer le texte des artefacts d'espace réponse (ex: "Réponse : .........")
function sanitizeText(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:^|\n)\s*Réponse\s*:\s*[\.\_\-\s]{2,}.*$/gi, '')
    .replace(/\s*Réponse\s*:\s*[\.\_\-\s]{2,}.*$/gi, '')
    .trim();
}

// Helper: Extraire le texte support (stimulus) et les sous-questions proprement sans duplication
interface ParsedExercise {
  stimulusText: string;
  subQuestions: AssessmentSubQuestion[];
}

function parseExerciseContent(
  exercise: any,
  criterionLetter: string,
  strands: string[] = []
): ParsedExercise {
  const content = exercise.content || '';

  // 1. Si des sous-questions explicites sont déjà fournies
  if (exercise.subQuestions && exercise.subQuestions.length > 0) {
    return {
      stimulusText: sanitizeText(content),
      subQuestions: exercise.subQuestions.map((sq: AssessmentSubQuestion) => ({
        ...sq,
        content: sanitizeText(sq.content),
      })),
    };
  }

  // 2. Détection du schéma de questions numérotées : 1) ... 2) ... ou 1. ... 2. ...
  const pattern = /(?:^|\n)\s*(?:([0-9]+|[a-d])\s*[\)\.]\s+)/gi;
  const matches = Array.from(content.matchAll(pattern)) as RegExpExecArray[];

  if (matches.length >= 2) {
    const firstMatchPos = matches[0].index || 0;
    const stimulus = sanitizeText(content.substring(0, firstMatchPos));
    const subQuestions: AssessmentSubQuestion[] = [];
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];
      const startPos = (match.index || 0) + match[0].length;
      const endPos = nextMatch ? nextMatch.index : content.length;
      const rawSubText = content.substring(startPos, endPos).trim();
      const subText = sanitizeText(rawSubText);
      const label = match[1] + ')';
      const roman = romanNumerals[i % romanNumerals.length];
      const matchedStrand = strands.find(s => s.toLowerCase().startsWith(`${roman}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '').trim();

      subQuestions.push({
        id: `sub_${i + 1}`,
        label,
        content: subText,
        strandIndex: roman,
        strandText: matchedStrand || '',
        type: exercise.type || 'open',
        options: exercise.options,
        correctAnswer: exercise.correctAnswer,
      });
    }

    return {
      stimulusText: stimulus,
      subQuestions,
    };
  }

  // 3. Question unique
  return {
    stimulusText: '',
    subQuestions: [],
  };
}

// Helper: résoudre le sous-aspect individuel précis pour chaque question (i, ii, iii, etc.)
function getQuestionStrandLabel(
  criterionLetter: string,
  strands: string[] = [],
  exercise: { criterionReference?: string; strandIndex?: string; strandText?: string; title?: string },
  exerciseIndex: number,
  isEn: boolean = false
): { roman: string; description: string; fullText: string } {
  const prefix = isEn ? 'Strand' : 'Sous-aspect';
  if (exercise.strandIndex && exercise.strandText) {
    return {
      roman: exercise.strandIndex,
      description: exercise.strandText,
      fullText: `${prefix} (${exercise.strandIndex}) : ${exercise.strandText}`,
    };
  }

  const ref = exercise.criterionReference || '';
  const match = ref.match(/(?:aspect|sous-aspect|strand)?\s*([ivx]+)\s*[\.\:\-\)]\s*(.*)/i);
  if (match) {
    const roman = match[1].toLowerCase();
    const desc = match[2]?.trim() || '';
    return {
      roman,
      description: desc,
      fullText: `${prefix} (${roman})${desc ? ` : ${desc}` : ''}`,
    };
  }

  const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
  const targetRoman = romanNumerals[exerciseIndex % romanNumerals.length] || 'i';

  const matched = strands.find(s =>
    s.toLowerCase().trim().startsWith(`${targetRoman}.`) ||
    s.toLowerCase().trim().startsWith(`${targetRoman})`)
  );

  if (matched) {
    const cleanDesc = matched.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
    return {
      roman: targetRoman,
      description: cleanDesc,
      fullText: `${prefix} (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[exerciseIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullText: `${prefix} (${targetRoman}) : ${cleanFallback || (isEn ? `Criterion ${criterionLetter} skill` : `Compétence ${criterionLetter}`)}`,
  };
}

// Helper: résoudre le sous-aspect d'une sous-question spécifique
function getSubQuestionStrandLabel(
  criterionLetter: string,
  strands: string[] = [],
  sub: AssessmentSubQuestion,
  subIndex: number,
  isEn: boolean = false
): { roman: string; description: string; fullText: string } {
  const prefix = isEn ? 'Strand' : 'Sous-aspect';
  if (sub.strandIndex && sub.strandText) {
    return {
      roman: sub.strandIndex,
      description: sub.strandText,
      fullText: `${prefix} (${sub.strandIndex}) : ${sub.strandText}`,
    };
  }

  const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
  const targetRoman = (sub.strandIndex || romanNumerals[subIndex % romanNumerals.length] || 'i').toLowerCase();

  const matched = strands.find(s =>
    s.toLowerCase().trim().startsWith(`${targetRoman}.`) ||
    s.toLowerCase().trim().startsWith(`${targetRoman})`)
  );

  if (matched) {
    const cleanDesc = matched.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
    return {
      roman: targetRoman,
      description: cleanDesc,
      fullText: `${prefix} (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[subIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullText: `${prefix} (${targetRoman}) : ${cleanFallback || (isEn ? `Criterion ${criterionLetter} skill` : `Compétence ${criterionLetter}`)}`,
  };
}

const EvaluationPrintView: React.FC<EvaluationPrintViewProps> = ({ evaluation, submission, onClose }) => {
  const isCorrectedCopy = Boolean(submission);
  const printContentRef = useRef<HTMLDivElement>(null);
  const isEn = isEnglishSubject(evaluation.subject);

  const dateLocale = isEn ? 'en-US' : 'fr-FR';
  const currentDateFormatted = new Date().toLocaleDateString(dateLocale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });

  const examDateFormatted = submission?.submittedAt
    ? new Date(submission.submittedAt).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : evaluation.createdAt
    ? new Date(evaluation.createdAt).toLocaleDateString(dateLocale, { day: '2-digit', month: '2-digit', year: 'numeric' })
    : currentDateFormatted;

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    if (!printContentRef.current) return;
    const content = printContentRef.current.innerHTML;
    const title = isCorrectedCopy
      ? `${isEn ? 'Graded_Copy' : 'Copie'}_${submission?.studentName?.replace(/\s+/g, '_') || (isEn ? 'Student' : 'Eleve')}_${evaluation.accessCode}`
      : `${isEn ? 'Assessment' : 'Evaluation'}_${evaluation.title.replace(/\s+/g, '_')}_${evaluation.accessCode}`;

    const fullHtml = `<!DOCTYPE html>
<html lang="${isEn ? 'en' : 'fr'}">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    @page {
      size: A4 portrait;
      margin: 10mm;
    }
    @media print {
      html, body {
        background: #ffffff !important;
        color: #0f172a !important;
        margin: 0 !important;
        padding: 0 !important;
        width: 100% !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      .print-sheet {
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        border: none !important;
        outline: none !important;
      }
      table, tr, td, th {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
      .avoid-break {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
        break-inside: avoid-page !important;
      }
      .print-footer-fixed {
        position: fixed;
        bottom: 0;
        left: 0;
        right: 0;
        height: 6mm;
        font-size: 8pt;
        color: #64748b;
        border-top: 1px solid #cbd5e1;
        display: flex !important;
        justify-content: space-between;
        align-items: center;
        background: #ffffff !important;
        padding-top: 1mm;
        z-index: 9999;
      }
      .print-page-num::after {
        content: counter(page);
      }
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      background-color: #f1f5f9;
      margin: 0;
      padding: 16px;
      display: flex;
      justify-content: center;
    }
    .print-sheet {
      background: #ffffff;
      width: 100%;
      max-width: 190mm;
      box-sizing: border-box;
      padding: 10mm;
    }
    .print-footer-fixed {
      display: flex;
      justify-content: space-between;
      border-top: 1px solid #cbd5e1;
      padding-top: 6px;
      margin-top: 20px;
      font-size: 10px;
      color: #64748b;
    }
    .avoid-break {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
    table {
      page-break-inside: avoid !important;
      break-inside: avoid !important;
    }
  </style>
</head>
<body>
  <div class="print-sheet">
    ${content}
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${title}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const totalMaxPoints = (evaluation.assessments || []).reduce((acc, a) => acc + (a.maxPoints || 8), 0);
  const totalScoreObtained = submission?.totalScore ?? 0;
  const duration = evaluation.durationMinutes || 45;

  const modalContent = (
    <div className="print-modal-container fixed inset-0 z-[9999] bg-slate-900/85 backdrop-blur-sm overflow-y-auto flex flex-col items-center p-0 sm:p-4">
      {/* ── BARRE D'OUTILS D'IMPRESSION (MASQUÉE SUR IMPRIMANTE) ── */}
      <div className="no-print sticky top-0 z-50 w-full max-w-4xl bg-white border-b border-slate-200 px-6 py-3 shadow-md flex items-center justify-between rounded-t-none sm:rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center font-bold">
            <Printer size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">
              {isCorrectedCopy
                ? (isEn
                    ? `Graded Copy — ${submission?.studentName} (${submission?.studentNumber})`
                    : `Copie Corrigée — ${submission?.studentName} (${submission?.studentNumber})`)
                : (isEn
                    ? `Official Assessment Paper — ${evaluation.title}`
                    : `Sujet d'Évaluation Officiel — ${evaluation.title}`)}
            </h3>
            <p className="text-xs text-slate-500">
              {isEn
                ? 'Official IB MYP Layout · A4 Format · 1 cm Margins · No Question Break'
                : 'Mise en page officielle PEI IB · Format A4 · Marges 1 cm · Aucune coupure de questions'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition"
            title={isEn ? 'Download standalone HTML version' : 'Télécharger la version autonome HTML'}
          >
            <Download size={15} /> {isEn ? 'Download HTML' : 'Télécharger HTML'}
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
            title={isEn ? 'Print or save to PDF via browser' : 'Imprimer ou enregistrer en PDF via le navigateur'}
          >
            <Printer size={16} /> {isEn ? 'Print / PDF' : 'Imprimer / PDF'}
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
            title={isEn ? 'Close' : 'Fermer'}
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── PAGE D'IMPRESSION A4 STRICTE (SANS ENCADREMENT ET ISOLÉE DU FOND DE L'APP) ── */}
      <div
        ref={printContentRef}
        className="print-sheet bg-white w-full max-w-[190mm] my-0 sm:my-4 p-[10mm] text-slate-900 font-sans shadow-2xl sm:rounded-sm border-0"
        style={{ boxSizing: 'border-box' }}
      >
        <style>{`
          @page {
            size: A4 portrait;
            margin: 10mm;
          }
          @media print {
            /* 1. CACHER COMPLÈTEMENT LE RESTE DU PORTAIL / APPLICATION EN ARRIÈRE-PLAN */
            #root {
              display: none !important;
            }
            body > *:not(.print-modal-container) {
              display: none !important;
            }
            .no-print {
              display: none !important;
            }

            /* 2. RÉINITIALISER LE CORPS DE PAGE POUR L'IMPRESSION */
            html, body {
              background: #ffffff !important;
              color: #0f172a !important;
              margin: 0 !important;
              padding: 0 !important;
              width: 100% !important;
              height: auto !important;
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }

            .print-modal-container {
              position: static !important;
              inset: auto !important;
              background: transparent !important;
              backdrop-filter: none !important;
              overflow: visible !important;
              display: block !important;
              padding: 0 !important;
              margin: 0 !important;
              width: 100% !important;
              height: auto !important;
            }

            .print-sheet {
              box-shadow: none !important;
              margin: 0 !important;
              padding: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              border: none !important;
              outline: none !important;
              background: #ffffff !important;
            }

            table, tr, td, th {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }

            .avoid-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              break-inside: avoid-page !important;
            }

            /* PIED DE PAGE FIXE EN BAS DE CHAQUE PAGE A4 */
            .print-footer-fixed {
              position: fixed;
              bottom: 0;
              left: 0;
              right: 0;
              height: 6mm;
              font-size: 8pt;
              color: #64748b;
              border-top: 1px solid #cbd5e1;
              display: flex !important;
              justify-content: space-between;
              align-items: center;
              background: #ffffff !important;
              padding-top: 1mm;
              z-index: 9999;
            }

            .print-page-num::after {
              content: counter(page);
            }
          }

          @media screen {
            .print-footer-fixed {
              display: flex;
              justify-content: space-between;
              border-top: 1px solid #e2e8f0;
              padding-top: 8px;
              margin-top: 24px;
              font-size: 10px;
              color: #64748b;
            }
          }
        `}</style>

        {/* ── 1. EN-TÊTE ACADÉMIQUE OFFICIEL ÉCOLES AL-KAWTHAR & PEI IB ── */}
        <header className="border-b-2 border-slate-900 pb-2.5 mb-2.5 avoid-break">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/logo-alkawtar.png"
                alt="Logo Al-Kawthar"
                className="w-14 h-14 object-contain shrink-0"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div>
                <h1 className="text-[15px] font-black tracking-tight text-slate-900 uppercase font-sans">
                  {isEn ? 'Al-Kawthar International Schools' : 'Les Écoles Internationales Al-Kawthar'}
                </h1>
                <p className="text-[11px] font-bold text-purple-900 uppercase tracking-wide">
                  {isEn
                    ? 'Middle Years Programme (MYP) · International Baccalaureate (IB)'
                    : "Programme d'Éducation Intermédiaire (PEI) · Baccalauréat International (IB)"}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-slate-700 font-bold uppercase tracking-wider">
                    {isEn ? 'Summative Criterion-Referenced Assessment' : 'Épreuve Sommative Critériée'}
                  </span>
                  <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                    <Clock size={11} /> {isEn ? `Duration: ${duration} minutes` : `Durée : ${duration} minutes`}
                  </span>
                </div>
              </div>
            </div>

            {/* Note finale si copie corrigée */}
            {isCorrectedCopy ? (
              <div className="border-2 border-purple-800 bg-purple-50 rounded-lg px-3.5 py-1.5 text-center min-w-[95px] shrink-0">
                <span className="block text-[9px] font-bold text-purple-800 uppercase tracking-wider">
                  {isEn ? 'Final Mark' : 'Note Finale'}
                </span>
                <span className="text-xl font-black text-purple-950 leading-tight">{totalScoreObtained} / {totalMaxPoints}</span>
                <span className="block text-[9px] font-semibold text-purple-700">
                  {isEn ? 'MYP Level' : 'Niveau PEI'}
                </span>
              </div>
            ) : (
              <div className="border border-slate-300 bg-slate-50 rounded-lg px-3.5 py-1.5 text-center min-w-[95px] shrink-0">
                <span className="block text-[9px] font-bold text-slate-500 uppercase">
                  {isEn ? 'Total Scale' : 'Barème Total'}
                </span>
                <span className="text-lg font-black text-slate-800 leading-tight">/ {totalMaxPoints}</span>
                <span className="block text-[9px] text-slate-500">
                  {isEn ? 'MYP Scale 1-8' : 'PEI Barème 8'}
                </span>
              </div>
            )}
          </div>

          {/* Cartouche d'identification élève & examen */}
          <div className="mt-2.5 border border-slate-400 text-[11px] divide-y divide-slate-300">
            <div className="grid grid-cols-4 divide-x divide-slate-300 bg-slate-50/70">
              <div className="p-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Subject' : 'Matière'}
                </span>
                <span className="font-bold text-slate-900">{evaluation.subject}</span>
              </div>
              <div className="p-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Grade / Level' : 'Classe / Niveau'}
                </span>
                <span className="font-bold text-slate-900">{evaluation.grade}</span>
              </div>
              <div className="p-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Teacher' : 'Enseignant(e)'}
                </span>
                <span className="font-medium text-slate-800">{evaluation.teacherName || '—'}</span>
              </div>
              <div className="p-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Date' : 'Date'}
                </span>
                <span className="font-medium text-slate-800">{examDateFormatted}</span>
              </div>
            </div>

            <div className="grid grid-cols-4 divide-x divide-slate-300">
              <div className="p-1.5 col-span-2">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Student Full Name' : "Nom & Prénom de l'élève"}
                </span>
                <span className="font-bold text-sm text-slate-900">
                  {submission?.studentName || '________________________________________'}
                </span>
              </div>
              <div className="p-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Candidate ID' : 'N° Matricule'}
                </span>
                <span className="font-mono font-bold text-slate-900">
                  {submission?.studentNumber || '________________'}
                </span>
              </div>
              <div className="p-1.5">
                <span className="text-[9px] font-bold text-slate-500 uppercase block">
                  {isEn ? 'Assessment Code' : 'Code Examen'}
                </span>
                <span className="font-mono font-bold text-purple-700">{evaluation.accessCode}</span>
              </div>
            </div>
          </div>
        </header>

        {/* ── 2. CADRE DE RECHERCHE PEI & ÉNONCÉ DE RECHERCHE ── */}
        <section className="mb-3 p-2.5 border border-slate-300 bg-slate-50/50 rounded text-xs avoid-break">
          <div className="flex items-center gap-1.5 mb-1">
            <Award size={14} className="text-purple-700 shrink-0" />
            <span className="font-black text-slate-900 uppercase text-xs">
              {evaluation.title}
            </span>
          </div>

          {evaluation.statementOfInquiry && (
            <div className="text-slate-800 italic text-[11px] mb-1.5 bg-white p-1.5 rounded border border-slate-200">
              <strong className="not-italic text-purple-900 font-bold uppercase text-[10px] mr-1">
                {isEn ? 'Statement of inquiry:' : 'Énoncé de recherche :'}
              </strong>
              « {evaluation.statementOfInquiry} »
            </div>
          )}

          <div className="flex flex-wrap gap-x-4 gap-y-1 text-[10px] text-slate-600">
            {evaluation.keyConcept && (
              <span><strong>{isEn ? 'Key concept:' : 'Concept clé :'}</strong> {evaluation.keyConcept}</span>
            )}
            {evaluation.globalContext && (
              <span><strong>{isEn ? 'Global context:' : 'Contexte mondial :'}</strong> {evaluation.globalContext}</span>
            )}
            {evaluation.relatedConcepts && evaluation.relatedConcepts.length > 0 && (
              <span><strong>{isEn ? 'Related concepts:' : 'Concepts connexes :'}</strong> {evaluation.relatedConcepts.join(', ')}</span>
            )}
          </div>
        </section>

        {/* ── 3. TABLEAU SYNTHÉTIQUE DES CRITÈRES ÉVALUÉS ── */}
        <section className="mb-3.5 avoid-break">
          <table className="w-full text-[10px] border-collapse border border-slate-300" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
            <thead>
              <tr className="bg-slate-100 text-slate-700 uppercase" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                <th className="border border-slate-300 px-2 py-1 text-center w-16">
                  {isEn ? 'Criterion' : 'Critère'}
                </th>
                <th className="border border-slate-300 px-2 py-1 text-left">
                  {isEn ? 'Skill / Criterion Title' : 'Intitulé de la compétence'}
                </th>
                <th className="border border-slate-300 px-2 py-1 text-left">
                  {isEn ? 'Assessed Specific Strands' : 'Aspects spécifiques évalués'}
                </th>
                <th className="border border-slate-300 px-2 py-1 text-center w-16">
                  {isEn ? 'Scale' : 'Barème'}
                </th>
                {isCorrectedCopy && (
                  <th className="border border-slate-300 px-2 py-1 text-center w-20 bg-purple-100 text-purple-900 font-bold">
                    {isEn ? 'Mark' : 'Note'}
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {evaluation.assessments.map(a => {
                const color = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                const score = submission?.criteriaScores?.[a.criterion];
                return (
                  <tr key={a.criterion} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <td className="border border-slate-300 px-2 py-1 text-center font-black" style={{ color: color.badge }}>
                      {isEn ? `Criterion ${a.criterion}` : `Critère ${a.criterion}`}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 font-bold text-slate-800">
                      {a.criterionName}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-slate-600 text-[9.5px]">
                      {(a.strands || []).join(' ; ')}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-700">
                      0 - {a.maxPoints || 8}
                    </td>
                    {isCorrectedCopy && (
                      <td className="border border-slate-300 px-2 py-1 text-center font-black text-purple-900 bg-purple-50 text-[11px]">
                        {score !== undefined ? `${score} / ${a.maxPoints || 8}` : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        {/* ── 4. TÂCHES D'ÉVALUATION ET QUESTIONS (SANS DUPLICATION, STYLE EXAMEN PRO) ── */}
        <main className="space-y-4">
          {evaluation.assessments.map((crit) => {
            return (
              <div key={crit.criterion} className="space-y-3">
                {/* Bandeau d'intitulé de Critère */}
                <div
                  className="py-1 px-2.5 bg-slate-800 text-white font-bold text-xs uppercase tracking-wide flex items-center justify-between rounded-xs avoid-break"
                >
                  <span>{isEn ? `Criterion ${crit.criterion}: ${crit.criterionName}` : `Critère ${crit.criterion} : ${crit.criterionName}`}</span>
                  <span className="text-[10px] text-slate-300 font-normal">
                    {isEn ? `Achievement scale: 1 - ${crit.maxPoints || 8} points` : `Barème de réalisation : 1 - ${crit.maxPoints || 8}`}
                  </span>
                </div>

                {/* Rubrique descriptive succincte si présente */}
                {crit.rubricRows && crit.rubricRows.length > 0 && (
                  <div className="avoid-break overflow-x-auto" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                    <table className="w-full text-[9.5px] border-collapse border border-slate-200" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                      <thead>
                        <tr className="bg-slate-50 text-slate-600" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                          <th className="border border-slate-200 px-2 py-0.5 text-center w-12">
                            {isEn ? 'Level' : 'Niveau'}
                          </th>
                          <th className="border border-slate-200 px-2 py-0.5 text-left">
                            {isEn ? 'Achievement Descriptor' : 'Descripteur de réalisation'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {crit.rubricRows.map((r, ri) => (
                          <tr key={ri} style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                            <td className="border border-slate-200 px-2 py-0.5 text-center font-bold text-slate-700">
                              {r.level}
                            </td>
                            <td className="border border-slate-200 px-2 py-0.5 text-slate-600">
                              {r.descriptor}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Exercices / Tâches du critère */}
                {(crit.exercises || []).map((ex, exIdx) => {
                  const studentAns = submission?.answers.find(
                    ans => ans.criterion === crit.criterion && ans.exerciseIndex === exIdx
                  );

                  // Décomposition propre du stimulus et des sous-questions sans duplication
                  const { stimulusText, subQuestions } = parseExerciseContent(ex, crit.criterion, crit.strands);
                  const hasSubQuestions = subQuestions.length > 0;
                  const strandInfo = getQuestionStrandLabel(crit.criterion, crit.strands, ex, exIdx, isEn);

                  return (
                    <div
                      key={exIdx}
                      className="border border-slate-300 rounded p-3 text-xs bg-white space-y-2.5"
                    >
                      {/* Entête de tâche */}
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 avoid-break">
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-0.5 bg-slate-700 text-white font-bold text-[10px] rounded-xs uppercase">
                            {isEn ? `Task ${exIdx + 1}` : `Tâche ${exIdx + 1}`}
                          </span>
                          <span className="font-bold text-slate-900 text-xs">{ex.title}</span>
                        </div>

                        {/* Note de la tâche si corrigé */}
                        {isCorrectedCopy && studentAns?.score !== undefined && (
                          <span className="text-[11px] font-black text-purple-900 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded">
                            {isEn ? `Mark: ${studentAns.score} / ${crit.maxPoints || 8}` : `Note : ${studentAns.score} / ${crit.maxPoints || 8}`}
                          </span>
                        )}
                      </div>

                      {/* Illustration / Image si présente */}
                      {ex.imageUrl && (
                        <div className="my-2 p-2 bg-slate-50 border border-slate-200 rounded text-center avoid-break">
                          <img
                            src={ex.imageUrl}
                            alt={ex.imageCaption || (isEn ? 'Task illustration' : 'Illustration exercice')}
                            className="max-h-52 max-w-full mx-auto object-contain rounded"
                          />
                          {ex.imageCaption && (
                            <p className="text-[10px] text-slate-600 italic mt-1 font-medium">
                              🖼️ {ex.imageCaption}
                            </p>
                          )}
                        </div>
                      )}

                      {/* TEXTE SUPPORT / STIMULUS (NON DUPLIQUÉ) */}
                      {stimulusText && (
                        <div className="my-1.5 p-3 bg-slate-50/80 border-l-3 border-purple-700 text-slate-800 text-[11px] leading-relaxed italic avoid-break">
                          {stimulusText}
                        </div>
                      )}

                      {/* CAS 1 : SOUS-QUESTIONS */}
                      {hasSubQuestions ? (
                        <div className="space-y-3 pt-1">
                          {subQuestions.map((sub, sIdx) => {
                            const subStrand = getSubQuestionStrandLabel(crit.criterion, crit.strands, sub, sIdx, isEn);
                            const subId = sub.id || `sub_${sIdx + 1}`;
                            const subAnswerData = studentAns?.subAnswers?.[subId];
                            const subResponseText = subAnswerData?.response;
                            const subDrawing = subAnswerData?.drawingDataUrl;

                            return (
                              <div
                                key={subId}
                                className="border-t border-slate-200 pt-2 space-y-1.5 avoid-break"
                                style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}
                              >
                                <div className="flex items-baseline gap-2">
                                  <span className="font-bold text-xs text-purple-950 bg-purple-100 px-1.5 py-0.5 rounded">
                                    {sub.label}
                                  </span>
                                  <span className="font-bold text-slate-900 text-xs">{sub.content}</span>
                                </div>

                                {/* 🔴 SOUS-ASPECT EN ROUGE BIEN MIS EN VALEUR */}
                                <div className="text-red-700 font-bold text-[10px] flex items-center gap-1.5 bg-red-50/80 px-2 py-0.5 rounded border border-red-200 w-fit">
                                  <span>● {subStrand.fullText}</span>
                                </div>

                                {/* QCM */}
                                {sub.type === 'multiple_choice' && (
                                  <div className="space-y-1 pt-1">
                                    {(sub.options || ex.options || (isEn ? ['Option A', 'Option B', 'Option C'] : ['Proposition A', 'Proposition B', 'Proposition C'])).map((opt, oIdx) => {
                                      const isChosen = subResponseText === opt;
                                      return (
                                        <div key={oIdx} className="flex items-center gap-2 text-xs">
                                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center font-bold text-[9px] ${
                                            isChosen ? 'bg-purple-700 text-white border-purple-700' : 'border-slate-400 bg-white'
                                          }`}>
                                            {isChosen ? '✓' : ''}
                                          </span>
                                          <span className={isChosen ? 'font-bold text-purple-950' : 'text-slate-700'}>{opt}</span>
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}

                                {/* Réponse libre */}
                                {sub.type !== 'multiple_choice' && (
                                  isCorrectedCopy ? (
                                    subResponseText ? (
                                      <div className="mt-1 bg-slate-50 border border-slate-200 rounded p-2 text-xs">
                                        <span className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">
                                          {isEn ? `Student's response (${sub.label}):` : `Réponse de l'élève (${sub.label}) :`}
                                        </span>
                                        <p className="text-slate-900 font-serif text-[11px] whitespace-pre-wrap leading-relaxed">
                                          {subResponseText}
                                        </p>
                                        {subDrawing && (
                                          <div className="mt-2 pt-1 border-t border-slate-200 text-center">
                                            <span className="text-[9.5px] font-bold text-slate-500 block mb-0.5">
                                              {isEn ? 'Drawing / Attached figure:' : 'Tracé / Dessin rattaché :'}
                                            </span>
                                            <img src={subDrawing} alt="Figure élève" className="max-h-36 max-w-full mx-auto border rounded bg-white" />
                                          </div>
                                        )}
                                      </div>
                                    ) : (
                                      <div className="mt-1 px-2.5 py-1 bg-slate-50 border border-dashed border-slate-200 rounded text-[10px] text-slate-400 italic">
                                        {isEn ? 'Not answered by student' : "Non répondu par l'élève"}
                                      </div>
                                    )
                                  ) : (
                                    <div className="mt-1.5 p-2 border border-slate-300 rounded bg-slate-50/20">
                                      <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">
                                        {isEn ? `Answer space for ${sub.label}:` : `Espace réponse pour ${sub.label} :`}
                                      </div>
                                      <div className="border-b border-dotted border-slate-300 h-5"></div>
                                      <div className="border-b border-dotted border-slate-300 h-5"></div>
                                    </div>
                                  )
                                )}
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        /* CAS 2 : QUESTION UNIQUE (SANS SOUS-QUESTIONS) */
                        <div className="space-y-2 avoid-break" style={{ pageBreakInside: 'avoid', breakInside: 'avoid' }}>
                          {/* Énoncé de la question si pas de sous-questions */}
                          {ex.content && (
                            <div className="text-slate-900 font-medium text-xs leading-relaxed">
                              {sanitizeText(ex.content)}
                            </div>
                          )}

                          {/* 🔴 SOUS-ASPECT EN ROUGE BIEN MIS EN VALEUR */}
                          <div className="text-red-700 font-bold text-[10px] flex items-center gap-1.5 bg-red-50/80 px-2 py-0.5 rounded border border-red-200 w-fit">
                            <span>● {strandInfo.fullText}</span>
                          </div>

                          {/* QCM simple */}
                          {ex.type === 'multiple_choice' && (
                            <div className="space-y-1 pt-1">
                              {(ex.options || (isEn ? ['Option A', 'Option B', 'Option C', 'Option D'] : ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'])).map((opt, oIdx) => {
                                const isChosen = studentAns?.studentResponse === opt;
                                return (
                                  <div key={oIdx} className="flex items-center gap-2 text-xs">
                                    <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center font-bold text-[9px] ${
                                      isChosen ? 'bg-purple-700 text-white border-purple-700' : 'border-slate-400 bg-white'
                                    }`}>
                                      {isChosen ? '✓' : ''}
                                    </span>
                                    <span className={isChosen ? 'font-bold text-purple-950' : 'text-slate-700'}>{opt}</span>
                                  </div>
                                );
                              })}
                            </div>
                          )}

                          {/* Réponse libre */}
                          {ex.type !== 'multiple_choice' && (
                            isCorrectedCopy ? (
                              studentAns?.studentResponse ? (
                                <div className="mt-1.5 bg-slate-50 border border-slate-200 rounded p-2 text-xs">
                                  <span className="text-[9.5px] font-bold text-slate-500 uppercase block mb-0.5">
                                    {isEn ? "Student's written response:" : "Réponse rédigée par l'élève :"}
                                  </span>
                                  <p className="text-slate-900 font-serif text-[11px] whitespace-pre-wrap leading-relaxed">
                                    {studentAns.studentResponse}
                                  </p>

                                  {studentAns.drawingDataUrl && (
                                    <div className="mt-2 pt-1 border-t border-slate-200 text-center">
                                      <span className="text-[9.5px] font-bold text-slate-500 block mb-0.5">
                                        {isEn ? "Student's drawing / diagram:" : "Figure / Tracé de l'élève :"}
                                      </span>
                                      <img
                                        src={studentAns.drawingDataUrl}
                                        alt="Figure élève"
                                        className="max-h-44 max-w-full mx-auto border border-slate-300 rounded bg-white"
                                      />
                                    </div>
                                  )}

                                  {/* Commentaire enseignant */}
                                  {(studentAns.teacherComment || studentAns.aiFeedback) && (
                                    <div className="mt-2 p-1.5 bg-purple-50 border border-purple-200 rounded text-[10.5px]">
                                      <span className="text-[9px] font-bold text-purple-900 block uppercase">
                                        {isEn ? "Teacher's comment:" : "Commentaire de l'enseignant :"}
                                      </span>
                                      <p className="text-purple-950 italic">
                                        {studentAns.teacherComment || studentAns.aiFeedback}
                                      </p>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="mt-1 px-2.5 py-1 bg-slate-50 border border-dashed border-slate-200 rounded text-[10px] text-slate-400 italic">
                                  {isEn ? 'Not answered by student' : "Non répondu par l'élève"}
                                </div>
                              )
                            ) : (
                              <div className="mt-1.5 p-2 border border-slate-300 rounded bg-slate-50/20">
                                <div className="text-[9px] font-semibold text-slate-400 uppercase mb-1">
                                  {isEn ? 'Reserved zone for student written response:' : 'Zone réservée pour la réponse rédigée de l\'élève :'}
                                </div>
                                <div className="border-b border-dotted border-slate-300 h-6"></div>
                                <div className="border-b border-dotted border-slate-300 h-6"></div>
                                <div className="border-b border-dotted border-slate-300 h-6"></div>
                              </div>
                            )
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </main>

        {/* ── 5. BILAN DE L'ÉVALUATION ET SIGNATURES OFFICIELLES ── */}
        <footer className="mt-6 pt-3 border-t-2 border-slate-900 avoid-break text-xs space-y-2.5">
          {isCorrectedCopy && submission?.overallFeedback && (
            <div className="bg-purple-50/80 border border-purple-200 rounded p-2.5">
              <span className="text-[10px] font-bold text-purple-900 block uppercase mb-0.5">
                {isEn ? "💬 Teacher's General Feedback:" : "💬 Appréciation globale de l'enseignant :"}
              </span>
              <p className="text-slate-800 italic leading-relaxed text-[11px]">
                "{submission.overallFeedback}"
              </p>
            </div>
          )}

          {/* Grille de signature officielle */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="border border-slate-400 rounded p-2 h-20 bg-slate-50/40">
              <span className="text-[9.5px] font-bold text-slate-700 block uppercase">
                {isEn ? "Teacher's Signature" : "Signature de l'enseignant(e)"}
              </span>
              <div className="mt-6 text-[8.5px] text-slate-400 italic">
                {isEn ? 'Date and signature' : 'Date et signature'}
              </div>
            </div>
            <div className="border border-slate-400 rounded p-2 h-20 bg-slate-50/40">
              <span className="text-[9.5px] font-bold text-slate-700 block uppercase">
                {isEn ? 'IB MYP Coordinator / School Leadership' : 'Visa Direction / Coordonnateur PEI'}
              </span>
              <div className="mt-6 text-[8.5px] text-slate-400 italic">
                {isEn ? 'Signature and stamp' : 'Signature et cachet'}
              </div>
            </div>
            <div className="border border-slate-400 rounded p-2 h-20 bg-slate-50/40">
              <span className="text-[9.5px] font-bold text-slate-700 block uppercase">
                {isEn ? "Parents' Signature" : 'Signature des parents'}
              </span>
              <div className="mt-6 text-[8.5px] text-slate-400 italic">
                {isEn ? 'Seen and acknowledged' : 'Vu et pris connaissance'}
              </div>
            </div>
          </div>

          <div className="text-center text-[9.5px] text-slate-500 pt-1 border-t border-slate-200">
            {isEn
              ? 'Official Assessment Document · Al-Kawthar International Schools · IB MYP'
              : "Document officiel d'évaluation · Les Écoles Internationales Al-Kawthar · Système PEI IB"}
          </div>
        </footer>

        {/* ── 6. PIED DE PAGE (DATE & NUMÉRO DE PAGE) ── */}
        <div className="print-footer-fixed">
          <div>
            <span>{isEn ? 'Al-Kawthar Schools · IB MYP' : 'Écoles Al-Kawthar · PEI IB'}</span>
            <span className="mx-1.5 text-slate-300">|</span>
            <span>{isEn ? 'Date: ' : 'Date : '}{examDateFormatted}</span>
          </div>
          <div className="font-semibold text-slate-700">
            {evaluation.title} ({isEn ? 'Code' : 'Code'} : {evaluation.accessCode})
          </div>
          <div>
            <span>{isEn ? 'Page ' : 'Page '}</span>
            <span className="print-page-num font-bold">1</span>
          </div>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default EvaluationPrintView;
