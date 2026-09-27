import React, { useRef } from 'react';
import { X, Printer, Award, Clock, Download } from 'lucide-react';
import { OnlineEvaluation, StudentSubmission } from '../types';

interface EvaluationPrintViewProps {
  evaluation: OnlineEvaluation;
  submission?: StudentSubmission | null;
  onClose: () => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  A: { bg: '#eff6ff', border: '#93c5fd', text: '#1e40af', badge: '#2563eb' },
  B: { bg: '#f0fdf4', border: '#86efac', text: '#166534', badge: '#16a34a' },
  C: { bg: '#fffbeb', border: '#fde68a', text: '#92400e', badge: '#d97706' },
  D: { bg: '#fff1f2', border: '#fecdd3', text: '#9f1239', badge: '#e11d48' },
};

// Helper: résoudre le sous-aspect individuel précis pour chaque question (i, ii, iii, etc.)
function getQuestionStrandLabel(
  criterionLetter: string,
  strands: string[] = [],
  exercise: { criterionReference?: string; strandIndex?: string; strandText?: string; title?: string },
  exerciseIndex: number
): { roman: string; description: string; fullText: string } {
  // Si le sous-aspect est déjà spécifié
  if (exercise.strandIndex && exercise.strandText) {
    return {
      roman: exercise.strandIndex,
      description: exercise.strandText,
      fullText: `Sous-aspect (${exercise.strandIndex}) : ${exercise.strandText}`,
    };
  }

  // Vérifier criterionReference (ex: "Critère A : ii. appliquer...")
  const ref = exercise.criterionReference || '';
  const match = ref.match(/(?:aspect|sous-aspect|strand)?\s*([ivx]+)\s*[\.\:\-\)]\s*(.*)/i);
  if (match) {
    const roman = match[1].toLowerCase();
    const desc = match[2]?.trim() || '';
    return {
      roman,
      description: desc,
      fullText: `Sous-aspect (${roman})${desc ? ` : ${desc}` : ''}`,
    };
  }

  // Attribution par index : Question 1 -> i, Question 2 -> ii, Question 3 -> iii...
  const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
  const targetRoman = romanNumerals[exerciseIndex % romanNumerals.length] || 'i';

  // Recherche dans les strands du critère
  const matched = strands.find(s =>
    s.toLowerCase().trim().startsWith(`${targetRoman}.`) ||
    s.toLowerCase().trim().startsWith(`${targetRoman})`)
  );

  if (matched) {
    const cleanDesc = matched.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
    return {
      roman: targetRoman,
      description: cleanDesc,
      fullText: `Sous-aspect (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[exerciseIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullText: `Sous-aspect (${targetRoman}) : ${cleanFallback || `Compétence ${criterionLetter}`}`,
  };
}

const EvaluationPrintView: React.FC<EvaluationPrintViewProps> = ({ evaluation, submission, onClose }) => {
  const isCorrectedCopy = Boolean(submission);
  const printContentRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadHtml = () => {
    if (!printContentRef.current) return;
    const content = printContentRef.current.innerHTML;
    const title = isCorrectedCopy
      ? `Copie_${submission?.studentName?.replace(/\s+/g, '_') || 'Eleve'}_${evaluation.accessCode}`
      : `Evaluation_${evaluation.title.replace(/\s+/g, '_')}_${evaluation.accessCode}`;

    const fullHtml = `<!DOCTYPE html>
<html lang="fr">
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
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .no-print {
        display: none !important;
      }
      .print-page {
        box-shadow: none !important;
        margin: 0 !important;
        padding: 0 !important;
        max-width: 100% !important;
        width: 100% !important;
        border: none !important;
      }
      .avoid-break {
        page-break-inside: avoid !important;
        break-inside: avoid !important;
      }
    }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
      background-color: #f8fafc;
      margin: 0;
      padding: 10mm;
      display: flex;
      justify-content: center;
    }
    .print-page {
      background: #ffffff;
      width: 100%;
      max-width: 190mm;
      box-sizing: border-box;
    }
    .avoid-break {
      page-break-inside: avoid;
      break-inside: avoid;
    }
  </style>
</head>
<body>
  <div class="print-page">
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

  return (
    <div className="fixed inset-0 z-[100] bg-slate-900/80 backdrop-blur-sm overflow-y-auto flex flex-col items-center p-0 sm:p-4">
      {/* ── BARRE D'OUTILS D'IMPRESSION (MASQUÉE SUR IMPRIMANTE) ── */}
      <div className="no-print sticky top-0 z-50 w-full max-w-4xl bg-white border-b border-slate-200 px-6 py-3 shadow-md flex items-center justify-between rounded-t-none sm:rounded-t-2xl">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-purple-100 text-purple-700 rounded-lg flex items-center justify-center font-bold">
            <Printer size={20} />
          </div>
          <div>
            <h3 className="font-bold text-slate-800 text-sm">
              {isCorrectedCopy
                ? `Copie Corrigée — ${submission?.studentName} (${submission?.studentNumber})`
                : `Sujet d'Évaluation — ${evaluation.title}`}
            </h3>
            <p className="text-xs text-slate-500">
              Format A4 portrait · Marges 1 cm sans coupure de questions · Durée : {duration} min
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleDownloadHtml}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow transition"
            title="Télécharger directement la copie sous format HTML autonome (A4, marges 1 cm)"
          >
            <Download size={15} /> Télécharger HTML
          </button>
          <button
            onClick={handlePrint}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
            title="Imprimer ou enregistrer en PDF via le navigateur"
          >
            <Printer size={16} /> Imprimer / PDF
          </button>
          <button
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
            title="Fermer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ── PAGE D'IMPRESSION A4 ────────────────────────────────────────────── */}
      <div
        ref={printContentRef}
        className="print-page bg-white w-full max-w-[210mm] shadow-2xl my-0 sm:my-4 p-[10mm] text-slate-900 font-sans"
      >
        <style>{`
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
              -webkit-print-color-adjust: exact !important;
              print-color-adjust: exact !important;
            }
            .no-print {
              display: none !important;
            }
            .print-page {
              box-shadow: none !important;
              margin: 0 !important;
              padding: 0 !important;
              max-width: 100% !important;
              width: 100% !important;
              border: none !important;
            }
            .avoid-break {
              page-break-inside: avoid !important;
              break-inside: avoid !important;
            }
          }
        `}</style>

        {/* ── EN-TÊTE OFFICIEL ÉCOLE AL-KAWTAR & PEI ── */}
        <header className="border-b-2 border-slate-800 pb-3 mb-3 avoid-break">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <img
                src="/logo-alkawtar.png"
                alt="Logo Al-Kawthar"
                className="w-16 h-16 object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
              <div>
                <h1 className="text-base font-black tracking-tight text-slate-900 uppercase">
                  Les Écoles Internationales Al-Kawthar
                </h1>
                <p className="text-xs font-semibold text-purple-800 uppercase tracking-wide">
                  Programme d'Éducation Intermédiaire (PEI) · Baccalauréat International (IB)
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-[11px] text-slate-600 font-medium">
                    Évaluation Critériée Sommative Électronique
                  </span>
                  <span className="text-[11px] font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded flex items-center gap-1">
                    <Clock size={11} /> Durée : {duration} minutes
                  </span>
                </div>
              </div>
            </div>

            {/* Note globale si copie corrigée */}
            {isCorrectedCopy && (
              <div className="border-2 border-purple-600 bg-purple-50 rounded-xl px-4 py-2 text-center flex-shrink-0">
                <span className="block text-[10px] font-bold text-purple-700 uppercase">Note Finale</span>
                <span className="text-xl font-black text-purple-900">{totalScoreObtained} / {totalMaxPoints}</span>
                <span className="block text-[9px] text-purple-600">Niveau PEI</span>
              </div>
            )}
          </div>

          {/* Cartouche d'identification élève & examen */}
          <div className="mt-2.5 grid grid-cols-2 sm:grid-cols-4 gap-2 bg-slate-50 border border-slate-300 rounded-lg p-2.5 text-xs">
            <div>
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Matière</span>
              <span className="font-bold text-slate-800">{evaluation.subject}</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Niveau / Classe</span>
              <span className="font-bold text-slate-800">{evaluation.grade}</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Enseignant</span>
              <span className="font-medium text-slate-800">{evaluation.teacherName || '—'}</span>
            </div>
            <div>
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Date de composition</span>
              <span className="font-medium text-slate-800">
                {submission?.submittedAt
                  ? new Date(submission.submittedAt).toLocaleDateString('fr-FR')
                  : new Date(evaluation.createdAt).toLocaleDateString('fr-FR')}
              </span>
            </div>

            {/* Ligne 2 : Identification élève */}
            <div className="col-span-2 pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Nom & Prénom de l'élève</span>
              <span className="font-bold text-sm text-slate-900">
                {submission?.studentName || '________________________________________'}
              </span>
            </div>
            <div className="pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">N° d'inscription (Matricule)</span>
              <span className="font-bold text-slate-900 font-mono">
                {submission?.studentNumber || '________________'}
              </span>
            </div>
            <div className="pt-1 border-t border-slate-200">
              <span className="text-slate-500 font-semibold block text-[10px] uppercase">Code Évaluation</span>
              <span className="font-bold text-purple-700 font-mono">{evaluation.accessCode}</span>
            </div>
          </div>
        </header>

        {/* ── TITRE ET CADRE DE RECHERCHE PEI ── */}
        <div className="mb-3 bg-purple-50/60 border border-purple-200 rounded-lg p-2.5 text-xs avoid-break">
          <h2 className="text-sm font-black text-purple-950 uppercase mb-1 flex items-center gap-1.5">
            <Award size={14} className="text-purple-700" />
            {evaluation.title}
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px] mt-1.5">
            {evaluation.statementOfInquiry && (
              <div className="sm:col-span-3 bg-white p-2 rounded border border-purple-100">
                <span className="font-bold text-purple-900 block text-[10px] uppercase">Énoncé de recherche :</span>
                <span className="italic text-slate-700">"{evaluation.statementOfInquiry}"</span>
              </div>
            )}
            {evaluation.keyConcept && (
              <div className="bg-white p-1.5 rounded border border-purple-100">
                <span className="font-bold text-purple-900 block text-[10px] uppercase">Concept clé :</span>
                <span className="text-slate-800">{evaluation.keyConcept}</span>
              </div>
            )}
            {evaluation.globalContext && (
              <div className="bg-white p-1.5 rounded border border-purple-100">
                <span className="font-bold text-purple-900 block text-[10px] uppercase">Contexte mondial :</span>
                <span className="text-slate-800">{evaluation.globalContext}</span>
              </div>
            )}
            {evaluation.relatedConcepts && evaluation.relatedConcepts.length > 0 && (
              <div className="bg-white p-1.5 rounded border border-purple-100">
                <span className="font-bold text-purple-900 block text-[10px] uppercase">Concepts connexes :</span>
                <span className="text-slate-800">{evaluation.relatedConcepts.join(', ')}</span>
              </div>
            )}
          </div>
        </div>

        {/* ── TABLEAU RÉCAPITULATIF DES CRITÈRES ÉVALUÉS ── */}
        <div className="mb-4 avoid-break">
          <table className="w-full text-[11px] border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-100 text-slate-700">
                <th className="border border-slate-300 px-2 py-1 text-center w-16">Critère</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Intitulé de la compétence</th>
                <th className="border border-slate-300 px-2 py-1 text-left">Aspects spécifiques évalués</th>
                <th className="border border-slate-300 px-2 py-1 text-center w-20">Barème</th>
                {isCorrectedCopy && (
                  <th className="border border-slate-300 px-2 py-1 text-center w-24 bg-purple-100 text-purple-900 font-bold">
                    Note obtenue
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {evaluation.assessments.map(a => {
                const color = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                const score = submission?.criteriaScores?.[a.criterion];
                return (
                  <tr key={a.criterion}>
                    <td className="border border-slate-300 px-2 py-1 text-center font-black" style={{ color: color.badge }}>
                      Critère {a.criterion}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 font-bold text-slate-800">
                      {a.criterionName}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-slate-600 text-[10px]">
                      {(a.strands || []).join(' ; ')}
                    </td>
                    <td className="border border-slate-300 px-2 py-1 text-center font-semibold text-slate-700">
                      0 - {a.maxPoints || 8}
                    </td>
                    {isCorrectedCopy && (
                      <td className="border border-slate-300 px-2 py-1 text-center font-black text-purple-900 bg-purple-50 text-xs">
                        {score !== undefined ? `${score} / ${a.maxPoints || 8}` : '—'}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── QUESTIONS ET RÉPONSES AVEC SOUS-ASPECTS PRÉCIS ÉCRITS EN ROUGE ── */}
        <div className="space-y-4">
          {evaluation.assessments.map((crit) => {
            const color = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
            return (
              <div key={crit.criterion} className="space-y-3">
                {/* Bandeau critère */}
                <div
                  className="px-3 py-1.5 rounded-md font-bold text-xs flex items-center justify-between avoid-break"
                  style={{ backgroundColor: color.bg, borderLeft: `4px solid ${color.badge}` }}
                >
                  <span className="uppercase text-slate-800">
                    Critère {crit.criterion} : {crit.criterionName}
                  </span>
                  <span className="text-[10px] font-semibold" style={{ color: color.text }}>
                    Échelle 1 - {crit.maxPoints || 8}
                  </span>
                </div>

                {/* Rubrique des niveaux */}
                {crit.rubricRows && crit.rubricRows.length > 0 && (
                  <div className="avoid-break overflow-x-auto">
                    <table className="w-full text-[10px] border-collapse border border-slate-200">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600">
                          <th className="border border-slate-200 px-2 py-0.5 text-center w-14">Niveau</th>
                          <th className="border border-slate-200 px-2 py-0.5 text-left">Descripteur de niveau de réalisation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {crit.rubricRows.map((r, ri) => (
                          <tr key={ri}>
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

                {/* Exercices du critère */}
                {(crit.exercises || []).map((ex, exIdx) => {
                  const studentAns = submission?.answers.find(
                    ans => ans.criterion === crit.criterion && ans.exerciseIndex === exIdx
                  );

                  // Calcul du sous-aspect individuel (ex: "Aspect i", "Aspect ii")
                  const strandInfo = getQuestionStrandLabel(crit.criterion, crit.strands, ex, exIdx);

                  return (
                    <div key={exIdx} className="avoid-break border border-slate-300 rounded-lg p-3 text-xs bg-white space-y-2">
                      <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                        <div className="flex items-center gap-2">
                          <span
                            className="px-2 py-0.5 rounded text-[10px] font-bold text-white"
                            style={{ backgroundColor: color.badge }}
                          >
                            Tâche {exIdx + 1}
                          </span>
                          <span className="font-bold text-slate-900">{ex.title}</span>
                        </div>

                        {/* Note de la tâche si corrigé */}
                        {isCorrectedCopy && studentAns?.score !== undefined && (
                          <span className="text-[11px] font-black text-purple-800 bg-purple-100 px-2 py-0.5 rounded">
                            Niveau : {studentAns.score} / {crit.maxPoints || 8}
                          </span>
                        )}
                      </div>

                      {/* 🔴 SOUS-ASPECT SPÉCIFIQUE EN ROUGE SOUS CHAQUE QUESTION (EXIGENCE EXPLICITE) */}
                      <div className="text-red-600 font-bold text-[11px] flex items-center gap-1.5 bg-red-50/60 px-2 py-1 rounded border border-red-200">
                        <span className="text-red-700 font-black">● {strandInfo.fullText}</span>
                      </div>

                      {/* OEUVRE D'ART / PHOTO / ILLUSTRATION (SI PRÉSENTE) */}
                      {ex.imageUrl && (
                        <div className="my-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-center avoid-break">
                          <img
                            src={ex.imageUrl}
                            alt={ex.imageCaption || 'Illustration oeuvre d\'art'}
                            className="max-h-56 max-w-full mx-auto object-contain rounded shadow-xs"
                          />
                          {ex.imageCaption && (
                            <p className="text-[10px] text-slate-600 italic mt-1 font-medium">
                              🖼️ {ex.imageCaption}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Énoncé de la question */}
                      <div className="text-slate-800 whitespace-pre-wrap leading-relaxed font-normal bg-slate-50/60 p-2.5 rounded border border-slate-100">
                        {ex.content}
                      </div>

                      {/* SECTION RÉPONSE */}
                      {isCorrectedCopy ? (
                        <div className="mt-2 space-y-2">
                          <div className="bg-slate-50 border border-slate-200 rounded p-2.5">
                            <span className="text-[10px] font-bold text-slate-600 block uppercase mb-1">
                              Réponse rédigée par l'élève :
                            </span>
                            <p className="text-slate-900 whitespace-pre-wrap leading-relaxed font-mono text-[11px]">
                              {studentAns?.studentResponse || '(Aucune réponse saisie)'}
                            </p>

                            {/* Figure géométrique / dessin inséré par l'élève */}
                            {studentAns?.drawingDataUrl && (
                              <div className="mt-2 pt-2 border-t border-slate-200 text-center">
                                <span className="text-[10px] font-bold text-slate-500 block mb-1">
                                  📐 Figure géométrique / tracé de l'élève :
                                </span>
                                <img
                                  src={studentAns.drawingDataUrl}
                                  alt="Figure géométrique élève"
                                  className="max-h-48 max-w-full mx-auto border border-slate-300 rounded shadow-xs bg-white"
                                />
                              </div>
                            )}
                          </div>

                          {/* Commentaire enseignant / IA */}
                          {(studentAns?.teacherComment || studentAns?.aiFeedback) && (
                            <div className="bg-purple-50/70 border border-purple-200 rounded p-2 text-[11px]">
                              <span className="text-[10px] font-bold text-purple-900 block uppercase">
                                Feedback / Commentaire de l'enseignant :
                              </span>
                              <p className="text-purple-950 italic">
                                {studentAns.teacherComment || studentAns.aiFeedback}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        /* Pour sujet vierge imprimé : bloc propre sans espace pointillé */
                        <div className="mt-2 p-3 border border-slate-300 rounded-lg min-h-[90px] bg-white">
                          <span className="text-[10px] font-semibold text-slate-400 block uppercase">
                            [ Espace réservé pour la réponse rédigée de l'élève ]
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>

        {/* ── BILAN DE L'ÉVALUATION ET SIGNATURES ── */}
        <footer className="mt-5 pt-3 border-t-2 border-slate-800 avoid-break text-xs space-y-3">
          {isCorrectedCopy && submission?.overallFeedback && (
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
              <span className="text-xs font-bold text-purple-900 block uppercase mb-1">
                💬 Appréciation globale de l'enseignant :
              </span>
              <p className="text-slate-800 italic leading-relaxed text-[11px]">
                "{submission.overallFeedback}"
              </p>
            </div>
          )}

          {/* Grille de signature */}
          <div className="grid grid-cols-3 gap-3 pt-1">
            <div className="border border-slate-300 rounded p-2 h-20">
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Signature de l'enseignant</span>
              <div className="mt-4 text-[9px] text-slate-400 italic">Signature et date</div>
            </div>
            <div className="border border-slate-300 rounded p-2 h-20">
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Visa Direction / Coordonnateur PEI</span>
              <div className="mt-4 text-[9px] text-slate-400 italic">Signature et cachet</div>
            </div>
            <div className="border border-slate-300 rounded p-2 h-20">
              <span className="text-[10px] font-bold text-slate-600 block uppercase">Signature des parents</span>
              <div className="mt-4 text-[9px] text-slate-400 italic">Vu et pris connaissance</div>
            </div>
          </div>

          <div className="text-center text-[10px] text-slate-400 pt-1 border-t border-slate-200">
            Document officiel · Les Écoles Internationales Al-Kawthar · Système PEI IB
          </div>
        </footer>
      </div>
    </div>
  );
};

export default EvaluationPrintView;
