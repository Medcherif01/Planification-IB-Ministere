import React, { useState, useEffect } from 'react';
import { Award, BookOpen, CheckCircle, Clock, FileText, HelpCircle, LogOut, Printer, Send, ShieldCheck, User, AlertCircle, ChevronRight, Save } from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, StudentAnswer } from '../types';
import { getEvaluationByAccessCode, getStudentSubmission, submitStudentEvaluation } from '../services/onlineEvaluationService';
import EvaluationPrintView from './EvaluationPrintView';

interface StudentEvaluationPortalProps {
  initialAccessCode?: string;
  onExit: () => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; light: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',    badge: 'bg-blue-600',    light: 'bg-blue-100' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', light: 'bg-emerald-100' },
  C: { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',   badge: 'bg-amber-600',   light: 'bg-amber-100' },
  D: { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-800',    badge: 'bg-rose-600',    light: 'bg-rose-100' },
};

const StudentEvaluationPortal: React.FC<StudentEvaluationPortalProps> = ({ initialAccessCode = '', onExit }) => {
  // Login fields
  const [accessCode, setAccessCode] = useState(initialAccessCode);
  const [studentNumber, setStudentNumber] = useState('');
  const [studentName, setStudentName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [isValidating, setIsValidating] = useState(false);

  // Active evaluation & session
  const [evaluation, setEvaluation] = useState<OnlineEvaluation | null>(null);
  const [existingSubmission, setExistingSubmission] = useState<StudentSubmission | null>(null);

  // Taking evaluation state
  const [activeCriterionIdx, setActiveCriterionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // key: `${criterion}_${exerciseIndex}` -> response
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);

  // Print view modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Restaurer session élève depuis localStorage si existante
  useEffect(() => {
    try {
      const savedStudent = localStorage.getItem('ib_student_session');
      if (savedStudent) {
        const parsed = JSON.parse(savedStudent);
        if (parsed.studentNumber && parsed.studentName) {
          setStudentNumber(parsed.studentNumber);
          setStudentName(parsed.studentName);
          if (parsed.accessCode && !initialAccessCode) {
            setAccessCode(parsed.accessCode);
          }
        }
      }
    } catch {}
  }, [initialAccessCode]);

  // Sauvegarder les brouillons de réponse de l'élève en local
  const autoSaveDraftAnswers = (newAnswers: Record<string, string>) => {
    if (!evaluation || !studentNumber) return;
    try {
      const draftKey = `draft_eval_${evaluation.accessCode}_${studentNumber}`;
      localStorage.setItem(draftKey, JSON.stringify(newAnswers));
      setLastAutoSave(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {}
  };

  // ── Handler Connexion Élève ────────────────────────────────────────────────
  const handleStudentLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanCode = accessCode.trim().toUpperCase();
    const cleanNum = studentNumber.trim();
    const cleanName = studentName.trim();

    if (!cleanCode) {
      setLoginError('Veuillez renseigner le code d\'accès donné par votre enseignant.');
      return;
    }
    if (!cleanNum) {
      setLoginError('Veuillez saisir votre numéro d\'inscription (matricule).');
      return;
    }
    if (!cleanName) {
      setLoginError('Veuillez renseigner votre nom et prénom.');
      return;
    }

    setIsValidating(true);
    try {
      const evalData = await getEvaluationByAccessCode(cleanCode);
      if (!evalData) {
        setLoginError(`Aucune évaluation trouvée pour le code "${cleanCode}". Vérifiez le code avec votre professeur.`);
        setIsValidating(false);
        return;
      }

      if (evalData.status === 'closed') {
        setLoginError('Cette évaluation est actuellement fermée par l\'enseignant.');
        setIsValidating(false);
        return;
      }

      // Enregistrer la session élève
      localStorage.setItem('ib_student_session', JSON.stringify({
        studentNumber: cleanNum,
        studentName: cleanName,
        accessCode: cleanCode,
      }));

      // Vérifier si l'élève a déjà soumis une copie
      const prevSub = await getStudentSubmission(cleanCode, cleanNum);
      if (prevSub) {
        setExistingSubmission(prevSub);
        setEvaluation(evalData);
        setIsValidating(false);
        return;
      }

      // Initialiser les réponses à partir du brouillon local s'il existe
      const draftKey = `draft_eval_${cleanCode}_${cleanNum}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          setAnswers(JSON.parse(savedDraft));
        } catch {}
      }

      setEvaluation(evalData);
    } catch (err: any) {
      setLoginError(err.message || 'Erreur lors de l\'accès à l\'évaluation.');
    } finally {
      setIsValidating(false);
    }
  };

  // ── Mise à jour de réponse d'un exercice ──────────────────────────────────
  const handleResponseChange = (criterion: string, exerciseIdx: number, text: string) => {
    const key = `${criterion}_${exerciseIdx}`;
    setAnswers(prev => {
      const next = { ...prev, [key]: text };
      autoSaveDraftAnswers(next);
      return next;
    });
  };

  // ── Calcul de l'avancement ────────────────────────────────────────────────
  const totalExercises = (evaluation?.assessments || []).reduce((acc, a) => acc + (a.exercises?.length || 0), 0);
  const completedExercises = Object.values(answers).filter(v => v && v.trim().length > 0).length;

  // ── Soumission de la copie ────────────────────────────────────────────────
  const handleSubmitEvaluation = async () => {
    if (!evaluation) return;

    setIsSubmitting(true);
    try {
      const formattedAnswers: StudentAnswer[] = [];

      (evaluation.assessments || []).forEach(crit => {
        (crit.exercises || []).forEach((ex, exIdx) => {
          const key = `${crit.criterion}_${exIdx}`;
          const responseText = answers[key] || '';
          formattedAnswers.push({
            criterion: crit.criterion,
            exerciseIndex: exIdx,
            exerciseTitle: ex.title,
            criterionReference: ex.criterionReference,
            questionContent: ex.content,
            studentResponse: responseText,
          });
        });
      });

      const submission = await submitStudentEvaluation({
        evaluationId: evaluation.id,
        accessCode: evaluation.accessCode,
        studentNumber: studentNumber.trim(),
        studentName: studentName.trim(),
        answers: formattedAnswers,
      });

      // Supprimer le brouillon local
      try {
        localStorage.removeItem(`draft_eval_${evaluation.accessCode}_${studentNumber.trim()}`);
      } catch {}

      setExistingSubmission(submission);
      setSubmittedSuccess(true);
      setShowConfirmSubmit(false);
    } catch (err: any) {
      alert(`Erreur lors de la remise de votre copie : ${err.message || 'Veuillez réessayer'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 1 : FORMULAIRE D'ACCÈS ÉLÈVE (LOGIN)
  // ═══════════════════════════════════════════════════════════════════════════
  if (!evaluation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-slate-900 flex flex-col justify-between p-4 sm:p-6">
        {/* Header simple avec logo */}
        <header className="max-w-xl mx-auto w-full flex items-center justify-between py-2">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-white rounded-2xl p-1 shadow-lg flex items-center justify-center">
              <img
                src="/logo-alkawtar.png"
                alt="Logo Al-Kawthar"
                className="w-full h-full object-contain"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-base tracking-wide">Écoles Al-Kawthar</h2>
              <p className="text-purple-200 text-xs font-medium">Espace Évaluation des Élèves</p>
            </div>
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 text-xs text-purple-200 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl transition"
          >
            <LogOut size={14} /> Retour à l'accueil
          </button>
        </header>

        {/* Boîte de connexion */}
        <main className="max-w-md mx-auto w-full my-auto py-8">
          <div className="bg-white rounded-3xl shadow-2xl p-6 sm:p-8 border border-purple-100">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <FileText size={32} />
              </div>
              <h1 className="text-2xl font-black text-slate-800">Évaluation Électronique</h1>
              <p className="text-slate-500 text-xs mt-1">
                Entrez vos identifiants d'élève et le code donné par votre professeur pour commencer.
              </p>
            </div>

            {loginError && (
              <div className="mb-5 bg-rose-50 border border-rose-200 text-rose-700 px-4 py-3 rounded-xl flex items-start gap-2.5 text-xs">
                <AlertCircle size={16} className="flex-shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <form onSubmit={handleStudentLogin} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Code d'évaluation (donné par le professeur) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={accessCode}
                    onChange={e => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="Ex: EVAL-8492"
                    className="w-full pl-3.5 pr-10 py-3 bg-purple-50/50 border-2 border-purple-200 focus:border-purple-600 rounded-xl font-mono text-base font-bold text-purple-900 tracking-wider uppercase focus:outline-none transition"
                    required
                  />
                  <div className="absolute right-3 top-3 text-purple-400">
                    <ShieldCheck size={20} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Numéro d'inscription / Matricule <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={studentNumber}
                    onChange={e => setStudentNumber(e.target.value)}
                    placeholder="Ex: 2024-0012 ou votre matricule élève"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-300 focus:border-purple-600 rounded-xl text-sm focus:outline-none transition font-medium"
                    required
                  />
                  <div className="absolute left-3 top-2.5 text-slate-400">
                    <User size={18} />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Nom et Prénom complets <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentName}
                  onChange={e => setStudentName(e.target.value)}
                  placeholder="Ex: Mohamed Yasmine"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 focus:border-purple-600 rounded-xl text-sm focus:outline-none transition font-medium"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={isValidating}
                className="w-full mt-2 py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl shadow-lg hover:shadow-xl transition flex items-center justify-center gap-2 text-sm disabled:opacity-60"
              >
                {isValidating ? (
                  <span>Recherche de l'évaluation…</span>
                ) : (
                  <>
                    <span>Accéder à l'évaluation</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <span>🔒</span> Vos réponses sont enregistrées et sécurisées sur le serveur.
              </p>
            </div>
          </div>
        </main>

        <footer className="text-center text-purple-300 text-xs py-2">
          Les Écoles Internationales Al-Kawthar · Système PEI IB
        </footer>
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 2 : COPIE DÉJÀ REMISE (EN ATTENTE DE CORRECTION OU CORRIGÉE)
  // ═══════════════════════════════════════════════════════════════════════════
  if (existingSubmission) {
    const isGraded = existingSubmission.status === 'graded';
    const totalMax = (evaluation.assessments || []).reduce((acc, a) => acc + (a.maxPoints || 8), 0);

    return (
      <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-6 py-4 sticky top-0 z-30 shadow-xs flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 text-white rounded-xl flex items-center justify-center font-black">
              PEI
            </div>
            <div>
              <h2 className="font-bold text-sm text-slate-800">{evaluation.title}</h2>
              <p className="text-xs text-slate-500">
                Élève : <strong>{existingSubmission.studentName}</strong> (N° {existingSubmission.studentNumber})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition"
            >
              <Printer size={15} /> Imprimer ma copie (A4)
            </button>
            <button
              onClick={() => {
                setEvaluation(null);
                setExistingSubmission(null);
                onExit();
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition"
              title="Quitter"
            >
              <LogOut size={18} />
            </button>
          </div>
        </header>

        {/* Contenu copie élève */}
        <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
          {/* Statut banner */}
          <div className={`rounded-2xl p-6 border ${
            isGraded ? 'bg-emerald-50 border-emerald-200 text-emerald-950' : 'bg-amber-50 border-amber-200 text-amber-950'
          }`}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className={`w-12 h-12 rounded-2xl flex items-center justify-center ${
                  isGraded ? 'bg-emerald-600 text-white' : 'bg-amber-500 text-white'
                }`}>
                  {isGraded ? <Award size={26} /> : <CheckCircle size={26} />}
                </div>
                <div>
                  <h3 className="text-lg font-black">
                    {isGraded ? '🎉 Évaluation corrigée !' : '✅ Copie remise avec succès'}
                  </h3>
                  <p className="text-xs mt-0.5 opacity-90">
                    Remise le {new Date(existingSubmission.submittedAt).toLocaleString('fr-FR')}
                  </p>
                </div>
              </div>

              {isGraded && (
                <div className="text-right bg-white px-4 py-2 rounded-xl shadow-xs border border-emerald-200">
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Note finale</span>
                  <span className="text-2xl font-black text-emerald-800">
                    {existingSubmission.totalScore ?? 0} <span className="text-sm font-semibold text-slate-400">/ {totalMax}</span>
                  </span>
                </div>
              )}
            </div>

            {isGraded && existingSubmission.overallFeedback && (
              <div className="mt-4 bg-white/80 rounded-xl p-3.5 border border-emerald-100 text-xs">
                <span className="font-bold text-emerald-900 block mb-1">💬 Commentaire de l'enseignant :</span>
                <p className="text-slate-700 italic">"{existingSubmission.overallFeedback}"</p>
              </div>
            )}
          </div>

          {/* Tableau des notes par critère si corrigé */}
          {isGraded && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-3">
                📊 Résultats par critère IB PEI
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {evaluation.assessments.map(a => {
                  const score = existingSubmission.criteriaScores?.[a.criterion];
                  const colors = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                  return (
                    <div key={a.criterion} className={`rounded-xl p-3 border ${colors.border} ${colors.bg}`}>
                      <div className="flex items-center justify-between mb-1">
                        <span className={`w-6 h-6 rounded-md ${colors.badge} text-white text-xs font-black flex items-center justify-center`}>
                          {a.criterion}
                        </span>
                        <span className="text-xs font-bold text-slate-700">/{a.maxPoints || 8}</span>
                      </div>
                      <p className="text-[11px] font-semibold text-slate-700 truncate">{a.criterionName}</p>
                      <p className="text-lg font-black mt-1" style={{ color: colors.badge }}>
                        {score !== undefined ? `Niveau ${score}` : 'Non noté'}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Détail des réponses de l'élève */}
          <div className="space-y-4">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
              📝 Vos réponses détaillées
            </h4>
            {existingSubmission.answers.map((ans, idx) => {
              const colors = CRITERION_COLORS[ans.criterion] || CRITERION_COLORS.A;
              return (
                <div key={idx} className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <div className="flex items-center gap-2">
                      <span className={`w-6 h-6 rounded-md ${colors.badge} text-white text-xs font-black flex items-center justify-center`}>
                        {ans.criterion}
                      </span>
                      <span className="font-bold text-sm text-slate-800">{ans.exerciseTitle}</span>
                      {ans.criterionReference && (
                        <span className="text-xs text-slate-400 italic">({ans.criterionReference})</span>
                      )}
                    </div>
                    {isGraded && ans.score !== undefined && (
                      <span className={`text-xs font-black ${colors.text} ${colors.light} px-2.5 py-1 rounded-lg`}>
                        Niveau {ans.score} / 8
                      </span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                    {ans.questionContent}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                      Votre réponse :
                    </span>
                    <p className="text-xs text-slate-800 whitespace-pre-wrap bg-purple-50/40 p-3 rounded-xl border border-purple-100 leading-relaxed font-mono">
                      {ans.studentResponse || '(Aucune réponse)'}
                    </p>
                  </div>

                  {/* Feedback enseignant par question */}
                  {isGraded && ans.teacherComment && (
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-xs text-emerald-900">
                      <span className="font-bold block text-[10px] uppercase">Remarque du professeur :</span>
                      {ans.teacherComment}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>

        {/* Modal d'impression A4 */}
        {showPrintModal && (
          <EvaluationPrintView
            evaluation={evaluation}
            submission={existingSubmission}
            onClose={() => setShowPrintModal(false)}
          />
        )}
      </div>
    );
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 3 : PASSATION DE L'ÉVALUATION EN LIGNE (INTERACTIVE)
  // ═══════════════════════════════════════════════════════════════════════════
  const activeAssessment = evaluation.assessments[activeCriterionIdx];
  const activeColors = activeAssessment
    ? (CRITERION_COLORS[activeAssessment.criterion] || CRITERION_COLORS.A)
    : CRITERION_COLORS.A;

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* ── TOP BAR STICKY AVEC PROGRESSION ET AUTO-SAVE ── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl flex items-center justify-center font-black flex-shrink-0 shadow">
              PEI
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-sm text-slate-800 truncate">{evaluation.title}</h2>
              <p className="text-xs text-slate-500 truncate">
                Élève : <span className="font-semibold text-slate-700">{studentName}</span> ({studentNumber}) · {evaluation.subject} ({evaluation.grade})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {lastAutoSave && (
              <span className="hidden md:flex items-center gap-1 text-[11px] text-slate-400">
                <Save size={12} className="text-green-500" /> Sauvegardé ({lastAutoSave})
              </span>
            )}

            {/* Compteur de progression */}
            <div className="hidden sm:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
              <CheckCircle size={14} className={completedExercises === totalExercises ? 'text-green-600' : 'text-purple-600'} />
              <span>{completedExercises} / {totalExercises} réponses</span>
            </div>

            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
            >
              <Send size={14} /> Vérifier & Soumettre
            </button>
          </div>
        </div>
      </header>

      {/* ── CADRE DE RECHERCHE PEI DÉPLIABLE ── */}
      {evaluation.statementOfInquiry && (
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white px-4 py-3 shadow-inner">
          <div className="max-w-6xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            <div className="flex items-start gap-2">
              <span className="font-black uppercase tracking-wider text-purple-300 text-[10px] bg-purple-800/80 px-2 py-0.5 rounded">
                Énoncé de recherche
              </span>
              <p className="italic text-purple-100 font-medium">"{evaluation.statementOfInquiry}"</p>
            </div>
            <div className="flex items-center gap-3 text-[11px] text-purple-200">
              {evaluation.keyConcept && (
                <span>Concept clé : <strong className="text-white">{evaluation.keyConcept}</strong></span>
              )}
              {evaluation.globalContext && (
                <span>Contexte : <strong className="text-white">{evaluation.globalContext}</strong></span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── CORPS DE L'ÉVALUATION ── */}
      <main className="max-w-6xl mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col space-y-5">
        {/* Navigation par critères */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
          {evaluation.assessments.map((crit, idx) => {
            const colors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
            const critExercisesCount = crit.exercises?.length || 0;
            const critAnswersCount = (crit.exercises || []).filter((_, exI) => {
              const k = `${crit.criterion}_${exI}`;
              return answers[k] && answers[k].trim().length > 0;
            }).length;

            const isCurrent = activeCriterionIdx === idx;
            return (
              <button
                key={crit.criterion}
                onClick={() => setActiveCriterionIdx(idx)}
                className={`flex items-center gap-2.5 px-4 py-2.5 rounded-xl font-bold text-xs transition border flex-shrink-0 ${
                  isCurrent
                    ? 'bg-white border-purple-500 shadow-md text-purple-900'
                    : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white hover:border-slate-300'
                }`}
              >
                <span className={`w-6 h-6 rounded-lg ${colors.badge} text-white text-xs font-black flex items-center justify-center`}>
                  {crit.criterion}
                </span>
                <span>{crit.criterionName}</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                  critAnswersCount === critExercisesCount && critExercisesCount > 0
                    ? 'bg-green-100 text-green-700'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {critAnswersCount}/{critExercisesCount}
                </span>
              </button>
            );
          })}
        </div>

        {/* Détail du critère actif */}
        {activeAssessment && (
          <div className="space-y-6">
            {/* Bannière du critère */}
            <div className={`rounded-2xl p-5 border ${activeColors.border} ${activeColors.bg}`}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${activeColors.light} ${activeColors.text}`}>
                    Critère {activeAssessment.criterion} · Échelle 1-8
                  </span>
                  <h3 className="text-lg font-black text-slate-800 mt-1">
                    {activeAssessment.criterionName}
                  </h3>
                  {activeAssessment.strands && activeAssessment.strands.length > 0 && (
                    <div className="mt-2 text-xs text-slate-600 space-y-0.5">
                      <span className="font-semibold text-slate-700">Sous-aspects évalués :</span>
                      <ul className="list-disc list-inside space-y-0.5 text-slate-600 text-[11px]">
                        {activeAssessment.strands.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>

                <span className={`text-xs font-black px-3 py-1 rounded-xl ${activeColors.light} ${activeColors.text}`}>
                  Max : {activeAssessment.maxPoints || 8} pts
                </span>
              </div>

              {/* Rubrique / Grille de descripteurs (dépliable pour guider l'élève) */}
              {activeAssessment.rubricRows && activeAssessment.rubricRows.length > 0 && (
                <details className="mt-3 text-xs bg-white rounded-xl border border-slate-200 overflow-hidden">
                  <summary className="px-3.5 py-2 cursor-pointer font-bold text-slate-700 hover:text-purple-700 select-none flex items-center justify-between">
                    <span>📖 Voir la grille des niveaux de réalisation (Descripteurs PEI 1-8)</span>
                    <span className="text-[10px] text-slate-400 font-normal">Cliquer pour afficher</span>
                  </summary>
                  <div className="p-3 border-t border-slate-100 overflow-x-auto">
                    <table className="w-full text-[11px] border-collapse">
                      <thead>
                        <tr className="bg-slate-50 text-slate-600 font-bold">
                          <th className="border border-slate-200 px-2.5 py-1 text-center w-16">Niveau</th>
                          <th className="border border-slate-200 px-2.5 py-1 text-left">Descripteur d'évaluation</th>
                        </tr>
                      </thead>
                      <tbody>
                        {activeAssessment.rubricRows.map((r, ri) => (
                          <tr key={ri}>
                            <td className="border border-slate-200 px-2.5 py-1 text-center font-bold text-slate-800">
                              {r.level}
                            </td>
                            <td className="border border-slate-200 px-2.5 py-1 text-slate-600">
                              {r.descriptor}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              )}
            </div>

            {/* Questions / Tâches de ce critère */}
            <div className="space-y-5">
              {(activeAssessment.exercises || []).map((ex, exIdx) => {
                const answerKey = `${activeAssessment.criterion}_${exIdx}`;
                const currentAnswer = answers[answerKey] || '';
                const wordCount = currentAnswer.trim() ? currentAnswer.trim().split(/\s+/).length : 0;

                return (
                  <div
                    key={exIdx}
                    className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-4 hover:border-purple-200 transition"
                  >
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold text-white ${activeColors.badge}`}>
                          Question {exIdx + 1}
                        </span>
                        <h4 className="font-bold text-base text-slate-900">{ex.title}</h4>
                      </div>
                      {ex.criterionReference && (
                        <span className="text-xs font-semibold text-slate-400 italic">
                          {ex.criterionReference}
                        </span>
                      )}
                    </div>

                    {/* Énoncé de la question */}
                    <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-100 font-normal">
                      {ex.content}
                    </div>

                    {/* Zone de saisie élève */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide flex items-center gap-1.5">
                          <span>✏️</span> Votre réponse rédigée :
                        </label>
                        <span className="text-[11px] text-slate-400">
                          {wordCount} mot{wordCount > 1 ? 's' : ''}
                        </span>
                      </div>

                      <textarea
                        value={currentAnswer}
                        onChange={e => handleResponseChange(activeAssessment.criterion, exIdx, e.target.value)}
                        placeholder="Rédigez ici votre réponse claire, argumentée et détaillée en respectant les critères d'évaluation..."
                        rows={6}
                        className="w-full p-4 border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-sm outline-none transition leading-relaxed resize-y font-sans"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Navigation bas de page vers critère suivant/précédent */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                onClick={() => setActiveCriterionIdx(i => Math.max(0, i - 1))}
                disabled={activeCriterionIdx === 0}
                className="px-4 py-2 bg-white border border-slate-200 hover:bg-slate-50 rounded-xl text-xs font-bold text-slate-700 disabled:opacity-30 transition"
              >
                ← Critère précédent
              </button>

              {activeCriterionIdx < evaluation.assessments.length - 1 ? (
                <button
                  onClick={() => setActiveCriterionIdx(i => Math.min(evaluation.assessments.length - 1, i + 1))}
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition"
                >
                  Critère suivant →
                </button>
              ) : (
                <button
                  onClick={() => setShowConfirmSubmit(true)}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-lg transition flex items-center gap-1.5"
                >
                  <Send size={14} /> Vérifier & Terminer
                </button>
              )}
            </div>
          </div>
        )}
      </main>

      {/* ── MODALE DE CONFIRMATION DE SOUMISSION ── */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white text-center">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Send size={28} />
              </div>
              <h3 className="text-xl font-black">Confirmer la remise de votre copie ?</h3>
              <p className="text-purple-100 text-xs mt-1">
                Une fois remise, vous ne pourrez plus modifier vos réponses.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Élève :</span>
                  <span className="font-bold text-slate-800">{studentName} ({studentNumber})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Évaluation :</span>
                  <span className="font-bold text-slate-800">{evaluation.title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Questions complétées :</span>
                  <span className={`font-black ${completedExercises === totalExercises ? 'text-green-600' : 'text-amber-600'}`}>
                    {completedExercises} sur {totalExercises}
                  </span>
                </div>
              </div>

              {completedExercises < totalExercises && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>
                    Attention : Vous avez laissé <strong>{totalExercises - completedExercises}</strong> question(s) sans réponse. Vous pouvez encore revenir en arrière pour compléter.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmSubmit(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                >
                  Continuer à relire
                </button>
                <button
                  onClick={handleSubmitEvaluation}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Envoi en cours…' : 'Oui, soumettre ma copie'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentEvaluationPortal;
