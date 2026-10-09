import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Filter, Search, Award, CheckCircle, Download, FileSpreadsheet,
  Printer, Loader2, Sparkles, MessageSquare, ChevronDown, ChevronUp,
  User, RefreshCw, BarChart2, BookOpen
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { OnlineEvaluation, StudentSubmission } from '../types';
import { getAllSubmissions, getEvaluations } from '../services/onlineEvaluationService';
import { SUBJECTS, PEI_GRADES } from '../constants';

interface GradedEvaluationsRecapModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSubject?: string;
  currentGrade?: string;
}

interface FlattenedStudentGrade {
  submissionId: string;
  evaluationId: string;
  evaluationTitle: string;
  subject: string;
  grade: string;
  semester: string;
  studentName: string;
  studentNumber: string;
  submittedAt: string;
  gradedAt?: string;
  gradedBy?: string;
  criteriaScores: Record<string, number>; // { A: 6, B: 7, ... }
  totalScore: number;
  maxTotalScore: number;
  overallFeedback: string;
  questionComments: {
    criterion: string;
    exerciseTitle: string;
    exerciseIndex: number;
    score?: number;
    comment: string;
  }[];
}

const CRITERION_COLORS: Record<string, { bg: string; text: string; badge: string; border: string }> = {
  A: { bg: 'bg-blue-50', text: 'text-blue-700', badge: 'bg-blue-600', border: 'border-blue-200' },
  B: { bg: 'bg-emerald-50', text: 'text-emerald-700', badge: 'bg-emerald-600', border: 'border-emerald-200' },
  C: { bg: 'bg-amber-50', text: 'text-amber-700', badge: 'bg-amber-600', border: 'border-amber-200' },
  D: { bg: 'bg-rose-50', text: 'text-rose-700', badge: 'bg-rose-600', border: 'border-rose-200' },
};

export const GradedEvaluationsRecapModal: React.FC<GradedEvaluationsRecapModalProps> = ({
  isOpen,
  onClose,
  currentSubject,
  currentGrade,
}) => {
  const [loading, setLoading] = useState(true);
  const [evaluations, setEvaluations] = useState<OnlineEvaluation[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);

  // Filtres
  const [selectedSubject, setSelectedSubject] = useState<string>(currentSubject || '');
  const [selectedGrade, setSelectedGrade] = useState<string>(currentGrade || '');
  const [selectedSemester, setSelectedSemester] = useState<string>(''); // '', 'Semestre 1', 'Semestre 2'
  const [selectedCriterion, setSelectedCriterion] = useState<string>(''); // '', 'A', 'B', 'C', 'D'
  const [searchStudent, setSearchStudent] = useState<string>('');
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  // Charger les données
  const loadData = async () => {
    setLoading(true);
    try {
      const [evals, subs] = await Promise.all([
        getEvaluations(),
        getAllSubmissions(),
      ]);
      setEvaluations(evals || []);
      setSubmissions(subs || []);
    } catch (err) {
      console.error('Erreur chargement récapitulatif des notes:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen]);

  // Associer et aplatir les données de notes corrigées
  const flattenedGrades: FlattenedStudentGrade[] = useMemo(() => {
    const evalMap = new Map<string, OnlineEvaluation>();
    evaluations.forEach(ev => evalMap.set(ev.id, ev));

    // Filtrer uniquement les soumissions corrigées (status === 'graded') ou ayant une note
    const gradedSubs = submissions.filter(s =>
      s.status === 'graded' ||
      (s.criteriaScores && Object.keys(s.criteriaScores).length > 0) ||
      (s.totalScore !== undefined && s.totalScore !== null)
    );

    return gradedSubs.map(sub => {
      const parentEval = evalMap.get(sub.evaluationId);
      const subject = parentEval?.subject || 'Matière inconnue';
      const grade = parentEval?.grade || 'PEI';
      const semester = (parentEval as any)?.semester || 'Semestre 1';
      const maxTotal = (parentEval?.assessments || []).reduce((acc, a) => acc + (a.maxPoints || 8), 0) || 8;

      const questionComments: FlattenedStudentGrade['questionComments'] = [];
      (sub.answers || []).forEach(ans => {
        const comment = ans.teacherComment || ans.aiFeedback || '';
        if (comment) {
          questionComments.push({
            criterion: ans.criterion,
            exerciseTitle: ans.exerciseTitle,
            exerciseIndex: ans.exerciseIndex,
            score: ans.score,
            comment,
          });
        }
      });

      return {
        submissionId: sub.id,
        evaluationId: sub.evaluationId,
        evaluationTitle: parentEval?.title || 'Évaluation',
        subject,
        grade,
        semester,
        studentName: sub.studentName,
        studentNumber: sub.studentNumber,
        submittedAt: sub.submittedAt,
        gradedAt: sub.gradedAt,
        gradedBy: sub.gradedBy,
        criteriaScores: sub.criteriaScores || {},
        totalScore: sub.totalScore ?? 0,
        maxTotalScore: maxTotal,
        overallFeedback: sub.overallFeedback || (sub as any).aiOverallFeedback || '',
        questionComments,
      };
    });
  }, [evaluations, submissions]);

  // Filtrage multi-critères
  const filteredGrades = useMemo(() => {
    return flattenedGrades.filter(row => {
      if (selectedSubject && row.subject !== selectedSubject) return false;
      if (selectedGrade && row.grade !== selectedGrade) return false;
      if (selectedSemester && row.semester !== selectedSemester) return false;
      if (selectedCriterion) {
        if (row.criteriaScores[selectedCriterion] === undefined) return false;
      }
      if (searchStudent) {
        const q = searchStudent.toLowerCase();
        const matchName = row.studentName.toLowerCase().includes(q);
        const matchNum = row.studentNumber.toLowerCase().includes(q);
        const matchTitle = row.evaluationTitle.toLowerCase().includes(q);
        if (!matchName && !matchNum && !matchTitle) return false;
      }
      return true;
    });
  }, [flattenedGrades, selectedSubject, selectedGrade, selectedSemester, selectedCriterion, searchStudent]);

  // Moyennes et statistiques par critère sur la sélection
  const stats = useMemo(() => {
    const critTotals: Record<string, { sum: number; count: number }> = {
      A: { sum: 0, count: 0 },
      B: { sum: 0, count: 0 },
      C: { sum: 0, count: 0 },
      D: { sum: 0, count: 0 },
    };

    let totalScoreSum = 0;
    let totalScoreCount = 0;

    filteredGrades.forEach(row => {
      ['A', 'B', 'C', 'D'].forEach(crit => {
        const sc = row.criteriaScores[crit];
        if (sc !== undefined && sc !== null) {
          critTotals[crit].sum += sc;
          critTotals[crit].count += 1;
        }
      });
      if (row.totalScore !== undefined) {
        totalScoreSum += row.totalScore;
        totalScoreCount += 1;
      }
    });

    return {
      critA: critTotals.A.count ? (critTotals.A.sum / critTotals.A.count).toFixed(1) : '—',
      critB: critTotals.B.count ? (critTotals.B.sum / critTotals.B.count).toFixed(1) : '—',
      critC: critTotals.C.count ? (critTotals.C.sum / critTotals.C.count).toFixed(1) : '—',
      critD: critTotals.D.count ? (critTotals.D.sum / critTotals.D.count).toFixed(1) : '—',
      avgTotal: totalScoreCount ? (totalScoreSum / totalScoreCount).toFixed(1) : '—',
      totalCount: filteredGrades.length,
    };
  }, [filteredGrades]);

  // Export Excel
  const handleExportExcel = () => {
    if (filteredGrades.length === 0) {
      alert("Aucune note à exporter avec les filtres actuels.");
      return;
    }

    const dataRows = filteredGrades.map(g => {
      const detailedComments = g.questionComments.map(qc => `[Crit ${qc.criterion} - ${qc.exerciseTitle}] : ${qc.comment}`).join('\n\n');
      return {
        'Élève': g.studentName,
        'Matricule': g.studentNumber,
        'Matière': g.subject,
        'Niveau': g.grade,
        'Semestre': g.semester,
        'Évaluation': g.evaluationTitle,
        'Date de remise': g.submittedAt ? new Date(g.submittedAt).toLocaleDateString('fr-FR') : '',
        'Critère A (/8)': g.criteriaScores.A ?? '',
        'Critère B (/8)': g.criteriaScores.B ?? '',
        'Critère C (/8)': g.criteriaScores.C ?? '',
        'Critère D (/8)': g.criteriaScores.D ?? '',
        'Total Niveaux': g.totalScore,
        'Sur': g.maxTotalScore,
        'Appréciation Générale': g.overallFeedback,
        'Commentaires par question': detailedComments,
        'Corrigé par': g.gradedBy || 'Enseignant',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dataRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Notes Corrigées');

    const fileName = `Recap_Notes_Evals_${(selectedSubject || 'Toutes_Matieres').replace(/\s+/g, '_')}_${selectedGrade || 'Tous_Niveaux'}_${selectedSemester || 'Tous_Semestres'}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  // Imprimer tableau récap
  const handlePrint = () => {
    window.print();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[90] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-7xl max-h-[94vh] flex flex-col overflow-hidden my-auto border border-slate-200">
        
        {/* ── HEADER ── */}
        <header className="bg-gradient-to-r from-emerald-700 via-teal-700 to-cyan-800 text-white p-5 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner">
              📊
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Tableau Récapitulatif des Notes d'Évaluations Corrigées
              </h2>
              <p className="text-emerald-100 text-xs">
                Classées par Élève · Matière · Critères A, B, C, D (/8) · Semestre 1 & 2 · Appréciations & Commentaires
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportExcel}
              disabled={filteredGrades.length === 0}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 text-xs font-black rounded-xl shadow-lg transition disabled:opacity-50"
              title="Exporter les notes en tableau Excel (.xlsx)"
            >
              <FileSpreadsheet size={15} /> Export Excel
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3 py-2 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl transition"
              title="Imprimer ce tableau"
            >
              <Printer size={15} /> Imprimer
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ── BARRE DE FILTRES ET STATISTIQUES ── */}
        <div className="bg-slate-50 border-b border-slate-200 p-4 space-y-3 flex-shrink-0">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3">
            {/* Matière */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Matière</label>
              <select
                value={selectedSubject}
                onChange={e => setSelectedSubject(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Toutes les matières</option>
                {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Niveau */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Niveau PEI</label>
              <select
                value={selectedGrade}
                onChange={e => setSelectedGrade(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tous les niveaux</option>
                {PEI_GRADES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>

            {/* Semestre */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Semestre</label>
              <select
                value={selectedSemester}
                onChange={e => setSelectedSemester(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tous les semestres</option>
                <option value="Semestre 1">Semestre 1</option>
                <option value="Semestre 2">Semestre 2</option>
              </select>
            </div>

            {/* Critère */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Critère IB</label>
              <select
                value={selectedCriterion}
                onChange={e => setSelectedCriterion(e.target.value)}
                className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-semibold text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="">Tous les critères (A, B, C, D)</option>
                <option value="A">Critère A seul</option>
                <option value="B">Critère B seul</option>
                <option value="C">Critère C seul</option>
                <option value="D">Critère D seul</option>
              </select>
            </div>

            {/* Recherche Élève */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 uppercase mb-1">Recherche Élève</label>
              <div className="relative">
                <input
                  type="text"
                  value={searchStudent}
                  onChange={e => setSearchStudent(e.target.value)}
                  placeholder="Nom ou Matricule…"
                  className="w-full pl-8 pr-2 py-2 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <Search size={14} className="absolute left-2.5 top-2.5 text-slate-400" />
              </div>
            </div>
          </div>

          {/* Cartouches statistiques synthétiques */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-200/80">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-600">
                Copies corrigées trouvées : <strong className="text-emerald-700">{filteredGrades.length}</strong>
              </span>
              {(selectedSubject || selectedGrade || selectedSemester || selectedCriterion || searchStudent) && (
                <button
                  onClick={() => {
                    setSelectedSubject('');
                    setSelectedGrade('');
                    setSelectedSemester('');
                    setSelectedCriterion('');
                    setSearchStudent('');
                  }}
                  className="text-[11px] text-rose-600 hover:underline font-bold ml-2"
                >
                  ✕ Réinitialiser les filtres
                </button>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Moyennes :</span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-blue-100 text-blue-800 border border-blue-200">
                A : {stats.critA}/8
              </span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-200">
                B : {stats.critB}/8
              </span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-amber-100 text-amber-800 border border-amber-200">
                C : {stats.critC}/8
              </span>
              <span className="px-2 py-0.5 rounded-lg text-xs font-black bg-rose-100 text-rose-800 border border-rose-200">
                D : {stats.critD}/8
              </span>
              <span className="px-2.5 py-0.5 rounded-lg text-xs font-black bg-purple-100 text-purple-900 border border-purple-200">
                Moy. Générale : {stats.avgTotal} pts
              </span>
            </div>
          </div>
        </div>

        {/* ── TABLEAU RECAPITULATIF DES NOTES ── */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="p-16 text-center text-slate-400">
              <Loader2 size={36} className="animate-spin mx-auto mb-3 text-emerald-600" />
              <p className="text-sm font-semibold">Collecte et calcul du tableau récapitulatif des notes…</p>
            </div>
          ) : filteredGrades.length === 0 ? (
            <div className="p-16 text-center border-2 border-dashed border-slate-200 rounded-3xl bg-slate-50">
              <Award size={48} className="mx-auto text-slate-300 mb-3" />
              <h4 className="font-bold text-slate-700 text-base">Aucune note corrigée trouvée</h4>
              <p className="text-slate-400 text-xs mt-1.5 max-w-md mx-auto">
                Les notes apparaîtront ici dès que des copies d'élèves auront été corrigées (manuellement par l'enseignant ou via la correction IA dans "Évals Électroniques").
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200 shadow-xs bg-white">
              <table className="w-full text-xs text-left border-collapse">
                <thead className="bg-slate-100/90 text-slate-700 font-bold border-b border-slate-200 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="px-3 py-3 w-10"></th>
                    <th className="px-4 py-3">Élève & Matricule</th>
                    <th className="px-3 py-3">Matière & Niveau</th>
                    <th className="px-3 py-3">Semestre</th>
                    <th className="px-3 py-3">Évaluation</th>
                    <th className="px-2 py-3 text-center">Critère A (/8)</th>
                    <th className="px-2 py-3 text-center">Critère B (/8)</th>
                    <th className="px-2 py-3 text-center">Critère C (/8)</th>
                    <th className="px-2 py-3 text-center">Critère D (/8)</th>
                    <th className="px-3 py-3 text-center">Total Niveaux</th>
                    <th className="px-4 py-3">Appréciation Générale & Commentaires</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredGrades.map((row) => {
                    const isExpanded = expandedRowId === row.submissionId;
                    return (
                      <React.Fragment key={row.submissionId}>
                        <tr className={`hover:bg-slate-50/80 transition ${isExpanded ? 'bg-slate-50/90' : ''}`}>
                          {/* Bouton d'extension détails */}
                          <td className="px-3 py-3 text-center">
                            <button
                              type="button"
                              onClick={() => setExpandedRowId(isExpanded ? null : row.submissionId)}
                              className="text-slate-400 hover:text-slate-700 p-1 rounded-md transition"
                              title="Voir les commentaires détaillés par question"
                            >
                              {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                            </button>
                          </td>

                          {/* Élève */}
                          <td className="px-4 py-3">
                            <div className="font-bold text-slate-900 text-xs flex items-center gap-1.5">
                              <User size={13} className="text-emerald-600 flex-shrink-0" />
                              <span className="truncate max-w-[150px]">{row.studentName}</span>
                            </div>
                            <div className="font-mono text-[10px] text-slate-500 font-semibold mt-0.5">
                              Matr: {row.studentNumber}
                            </div>
                          </td>

                          {/* Matière & Niveau */}
                          <td className="px-3 py-3">
                            <span className="font-bold text-slate-800 block">{row.subject}</span>
                            <span className="text-[10px] text-slate-500 font-semibold">{row.grade}</span>
                          </td>

                          {/* Semestre */}
                          <td className="px-3 py-3">
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              row.semester === 'Semestre 2'
                                ? 'bg-indigo-100 text-indigo-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}>
                              {row.semester}
                            </span>
                          </td>

                          {/* Évaluation */}
                          <td className="px-3 py-3 max-w-[160px]">
                            <span className="font-semibold text-slate-700 line-clamp-2" title={row.evaluationTitle}>
                              {row.evaluationTitle}
                            </span>
                            {row.submittedAt && (
                              <span className="text-[10px] text-slate-400 block mt-0.5">
                                {new Date(row.submittedAt).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </td>

                          {/* Critère A */}
                          <td className="px-2 py-3 text-center">
                            {row.criteriaScores.A !== undefined ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg font-black text-xs bg-blue-100 text-blue-900 border border-blue-200">
                                {row.criteriaScores.A}/8
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* Critère B */}
                          <td className="px-2 py-3 text-center">
                            {row.criteriaScores.B !== undefined ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg font-black text-xs bg-emerald-100 text-emerald-900 border border-emerald-200">
                                {row.criteriaScores.B}/8
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* Critère C */}
                          <td className="px-2 py-3 text-center">
                            {row.criteriaScores.C !== undefined ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg font-black text-xs bg-amber-100 text-amber-900 border border-amber-200">
                                {row.criteriaScores.C}/8
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* Critère D */}
                          <td className="px-2 py-3 text-center">
                            {row.criteriaScores.D !== undefined ? (
                              <span className="inline-block px-2.5 py-1 rounded-lg font-black text-xs bg-rose-100 text-rose-900 border border-rose-200">
                                {row.criteriaScores.D}/8
                              </span>
                            ) : (
                              <span className="text-slate-300 font-bold">—</span>
                            )}
                          </td>

                          {/* Total Score */}
                          <td className="px-3 py-3 text-center">
                            <span className="font-black text-xs text-purple-950 bg-purple-100 px-2.5 py-1 rounded-lg border border-purple-200">
                              {row.totalScore} / {row.maxTotalScore}
                            </span>
                          </td>

                          {/* Commentaires & Appréciation */}
                          <td className="px-4 py-3 max-w-[280px]">
                            {row.overallFeedback ? (
                              <p className="text-[11px] text-slate-700 italic line-clamp-2" title={row.overallFeedback}>
                                « {row.overallFeedback} »
                              </p>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">Aucun commentaire global</span>
                            )}
                            {row.questionComments.length > 0 && (
                              <button
                                type="button"
                                onClick={() => setExpandedRowId(isExpanded ? null : row.submissionId)}
                                className="text-[10px] text-emerald-700 hover:underline font-bold mt-1 block flex items-center gap-1"
                              >
                                <MessageSquare size={11} /> {row.questionComments.length} commentaire(s) détaillés
                              </button>
                            )}
                          </td>
                        </tr>

                        {/* Rangée extensible avec les détails complets des commentaires */}
                        {isExpanded && (
                          <tr className="bg-emerald-50/40 border-b border-emerald-100">
                            <td colSpan={11} className="p-4 pl-12 space-y-3">
                              {row.overallFeedback && (
                                <div className="bg-white p-3.5 rounded-xl border border-emerald-200 shadow-2xs">
                                  <h6 className="font-bold text-xs text-emerald-950 flex items-center gap-1.5 mb-1">
                                    <Sparkles size={14} className="text-emerald-600" />
                                    Appréciation générale complète de l'enseignant :
                                  </h6>
                                  <p className="text-xs text-slate-700 leading-relaxed italic">
                                    « {row.overallFeedback} »
                                  </p>
                                </div>
                              )}

                              {row.questionComments.length > 0 ? (
                                <div className="space-y-2">
                                  <h6 className="font-bold text-[11px] text-slate-700 uppercase tracking-wide">
                                    Commentaires et conseils par question :
                                  </h6>
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                                    {row.questionComments.map((qc, i) => {
                                      const col = CRITERION_COLORS[qc.criterion] || CRITERION_COLORS.A;
                                      return (
                                        <div key={i} className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs space-y-1">
                                          <div className="flex items-center justify-between">
                                            <span className={`px-2 py-0.5 rounded text-[10px] font-black ${col.badge} text-white`}>
                                              Critère {qc.criterion}
                                            </span>
                                            {qc.score !== undefined && (
                                              <span className="text-[10px] font-black text-slate-700">
                                                Niveau {qc.score}/8
                                              </span>
                                            )}
                                          </div>
                                          <h6 className="font-bold text-slate-800 text-[11px] truncate">
                                            {qc.exerciseTitle}
                                          </h6>
                                          <p className="text-slate-600 text-[11px] leading-relaxed">
                                            {qc.comment}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              ) : (
                                <p className="text-xs text-slate-500 italic">
                                  Aucun commentaire spécifique par question n'a été enregistré pour cette copie.
                                </p>
                              )}
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── FOOTER ── */}
        <footer className="bg-slate-100 p-4 border-t border-slate-200 flex items-center justify-between flex-shrink-0 text-xs text-slate-600">
          <div>
            <strong>Barème officiel IB PEI :</strong> Niveaux de 1 à 8 par critère · Échelle discrète [1-2, 3-4, 5-6, 7-8]
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl transition"
          >
            Fermer
          </button>
        </footer>

      </div>
    </div>
  );
};

export default GradedEvaluationsRecapModal;
