import React, { useState, useEffect, useRef } from 'react';
import { Award, CheckCircle, Clock, FileText, LogOut, Printer, Send, ShieldCheck, User, AlertCircle, ChevronRight, Save, Image as ImageIcon, Check, Lock, AlertTriangle } from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, StudentAnswer, AssessmentExercise } from '../types';
import { getEvaluationByAccessCode, getStudentSubmission, submitStudentEvaluation } from '../services/onlineEvaluationService';
import EvaluationPrintView from './EvaluationPrintView';
import GeometricDrawingModal from './GeometricDrawingModal';

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

// Helper: déterminer précisément le sous-aspect individuel (i, ii, iii...)
function resolveStrandForQuestion(
  criterionLetter: string,
  strands: string[] = [],
  exercise: AssessmentExercise,
  exerciseIndex: number
): { roman: string; description: string; fullLabel: string } {
  if (exercise.strandIndex && exercise.strandText) {
    return {
      roman: exercise.strandIndex,
      description: exercise.strandText,
      fullLabel: `Sous-aspect (${exercise.strandIndex}) : ${exercise.strandText}`,
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
      fullLabel: `Sous-aspect (${roman})${desc ? ` : ${desc}` : ''}`,
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
      fullLabel: `Sous-aspect (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[exerciseIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullLabel: `Sous-aspect (${targetRoman}) : ${cleanFallback || `Compétence ${criterionLetter}`}`,
  };
}

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
  const [isLockedAlready, setIsLockedAlready] = useState(false);

  // Taking evaluation state
  const [activeCriterionIdx, setActiveCriterionIdx] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({}); // key: `${criterion}_${exerciseIndex}` -> response
  const [drawings, setDrawings] = useState<Record<string, string>>({}); // key: `${criterion}_${exerciseIndex}` -> dataUrl
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);

  // Geometric drawing modal state
  const [drawingModalTarget, setDrawingModalTarget] = useState<string | null>(null);

  // 45 min timer
  const [secondsRemaining, setSecondsRemaining] = useState<number>(45 * 60);
  const timerIntervalRef = useRef<any>(null);

  // Print view modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Restaurer session élève depuis localStorage si existante
  useEffect(() => {
    try {
      const permanentMatricule = localStorage.getItem('ib_permanent_matricule');
      const permanentName = localStorage.getItem('ib_permanent_student_name');
      if (permanentMatricule) setStudentNumber(permanentMatricule);
      if (permanentName) setStudentName(permanentName);

      const savedStudent = localStorage.getItem('ib_student_session');
      if (savedStudent) {
        const parsed = JSON.parse(savedStudent);
        if (parsed.studentNumber) setStudentNumber(parsed.studentNumber);
        if (parsed.studentName) setStudentName(parsed.studentName);
        const code = (initialAccessCode || parsed.accessCode || '').trim().toUpperCase();
        if (code) {
          setAccessCode(code);
          const studentNum = (parsed.studentNumber || permanentMatricule || '').trim();
          if (studentNum) {
            const lockKey = `ib_locked_${code}_${studentNum}`;
            const isLocallyLocked = localStorage.getItem(lockKey) === 'true';

            // Auto-check si copie déjà soumise
            getEvaluationByAccessCode(code).then(ev => {
              if (ev) {
                setEvaluation(ev);
                getStudentSubmission(code, studentNum).then(prevSub => {
                  if (prevSub || isLocallyLocked) {
                    setExistingSubmission(prevSub || {
                      id: `locked_${studentNum}`,
                      evaluationId: ev.id,
                      accessCode: code,
                      studentNumber: studentNum,
                      studentName: parsed.studentName || permanentName || 'Élève',
                      submittedAt: new Date().toISOString(),
                      status: 'submitted',
                      isLocked: true,
                      answers: [],
                    });
                    setIsLockedAlready(true);
                  }
                });
              }
            });
          }
        }
      }
    } catch {}
  }, [initialAccessCode]);

  // Gestion du chronomètre de 45 minutes
  useEffect(() => {
    if (!evaluation || existingSubmission || isLockedAlready) return;

    const timerKey = `timer_${evaluation.accessCode}_${studentNumber}`;
    const savedEndTime = localStorage.getItem(timerKey);
    const durationSec = (evaluation.durationMinutes || 45) * 60;

    let targetEndTime: number;
    if (savedEndTime) {
      targetEndTime = parseInt(savedEndTime);
    } else {
      targetEndTime = Date.now() + durationSec * 1000;
      localStorage.setItem(timerKey, targetEndTime.toString());
    }

    const updateTimer = () => {
      const diff = Math.max(0, Math.floor((targetEndTime - Date.now()) / 1000));
      setSecondsRemaining(diff);

      // Auto-submit si temps écoulé !
      if (diff <= 0) {
        clearInterval(timerIntervalRef.current);
        alert('⏰ Temps écoulé (45 minutes) ! Votre copie va être soumise automatiquement.');
        handleSubmitEvaluation(true);
      }
    };

    updateTimer();
    timerIntervalRef.current = setInterval(updateTimer, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [evaluation, existingSubmission, isLockedAlready, studentNumber]);

  // Sauvegarder les brouillons de réponse de l'élève en local
  const autoSaveDraftAnswers = (newAnswers: Record<string, string>, newDrawings: Record<string, string>) => {
    if (!evaluation || !studentNumber) return;
    try {
      const draftKey = `draft_eval_${evaluation.accessCode}_${studentNumber}`;
      localStorage.setItem(draftKey, JSON.stringify({ answers: newAnswers, drawings: newDrawings }));
      setLastAutoSave(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {}
  };

  // Format du temps restant (ex: 43:25)
  const formatTimeRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
      setLoginError('Veuillez saisir votre numéro d\'inscription (matricule permanent).');
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

      // Enregistrer la session élève et le matricule permanent
      localStorage.setItem('ib_permanent_matricule', cleanNum);
      localStorage.setItem('ib_permanent_student_name', cleanName);
      localStorage.setItem('ib_student_session', JSON.stringify({
        studentNumber: cleanNum,
        studentName: cleanName,
        accessCode: cleanCode,
      }));

      // VÉRIFICATION DE VERROUILLAGE : Copie déjà soumise par cet élève ?
      const lockKey = `ib_locked_${cleanCode}_${cleanNum}`;
      const isLocallyLocked = localStorage.getItem(lockKey) === 'true';

      const prevSub = await getStudentSubmission(cleanCode, cleanNum);
      if (prevSub || isLocallyLocked) {
        setExistingSubmission(prevSub || {
          id: `locked_${cleanNum}`,
          evaluationId: evalData.id,
          accessCode: cleanCode,
          studentNumber: cleanNum,
          studentName: cleanName,
          submittedAt: new Date().toISOString(),
          status: 'submitted',
          isLocked: true,
          answers: [],
        });
        setIsLockedAlready(true);
        setEvaluation(evalData);
        setIsValidating(false);
        return;
      }

      // Initialiser les réponses à partir du brouillon local s'il existe
      const draftKey = `draft_eval_${cleanCode}_${cleanNum}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.answers) setAnswers(parsed.answers);
          if (parsed.drawings) setDrawings(parsed.drawings);
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
    if (isLockedAlready) return;
    const key = `${criterion}_${exerciseIdx}`;
    setAnswers(prev => {
      const next = { ...prev, [key]: text };
      autoSaveDraftAnswers(next, drawings);
      return next;
    });
  };

  // Insertion de symboles mathématiques dans la réponse avec positionnement du curseur
  const handleInsertMathSymbol = (criterion: string, exerciseIdx: number, symbol: string) => {
    if (isLockedAlready) return;
    const key = `${criterion}_${exerciseIdx}`;
    const textarea = document.getElementById(`textarea_${key}`) as HTMLTextAreaElement | null;
    const current = answers[key] || '';

    let updated = current;
    let newCursorPos = current.length + symbol.length;

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      updated = current.substring(0, start) + symbol + current.substring(end);
      newCursorPos = start + symbol.length;
      setTimeout(() => {
        try {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        } catch {}
      }, 20);
    } else {
      updated = current + symbol;
    }

    handleResponseChange(criterion, exerciseIdx, updated);
  };

  // Sauvegarde d'un tracé géométrique
  const handleSaveDrawing = (dataUrl: string) => {
    if (!drawingModalTarget || isLockedAlready) return;
    setDrawings(prev => {
      const next = { ...prev, [drawingModalTarget]: dataUrl };
      autoSaveDraftAnswers(answers, next);
      return next;
    });
    setDrawingModalTarget(null);
  };

  // ── Calcul de l'avancement ────────────────────────────────────────────────
  const totalExercises = (evaluation?.assessments || []).reduce((acc, a) => acc + (a.exercises?.length || 0), 0);
  const completedExercises = Object.values(answers).filter(v => v && v.trim().length > 0).length;

  // ── Soumission de la copie (avec verrouillage immédiat et définitif) ───────
  const handleSubmitEvaluation = async (forceAutoSubmit = false) => {
    if (!evaluation || isSubmitting || isLockedAlready) return;

    setIsSubmitting(true);
    try {
      const formattedAnswers: StudentAnswer[] = [];

      (evaluation.assessments || []).forEach(crit => {
        (crit.exercises || []).forEach((ex, exIdx) => {
          const key = `${crit.criterion}_${exIdx}`;
          const responseText = answers[key] || '';
          const drawingDataUrl = drawings[key];
          const strand = resolveStrandForQuestion(crit.criterion, crit.strands, ex, exIdx);

          formattedAnswers.push({
            criterion: crit.criterion,
            exerciseIndex: exIdx,
            exerciseTitle: ex.title,
            criterionReference: ex.criterionReference,
            strandIndex: strand.roman,
            strandText: strand.description,
            questionType: ex.type || 'open',
            questionContent: ex.content,
            studentResponse: responseText,
            drawingDataUrl: drawingDataUrl,
          });
        });
      });

      const submission = await submitStudentEvaluation({
        evaluationId: evaluation.id,
        accessCode: evaluation.accessCode,
        studentNumber: studentNumber.trim(),
        studentName: studentName.trim(),
        isLocked: true,
        answers: formattedAnswers,
      });

      // VERROUILLAGE DÉFINITIF EN LOCAL : Même si l'élève rafraîchit la page, il ne peut plus rouvrir
      const cleanNum = studentNumber.trim();
      const lockKey = `ib_locked_${evaluation.accessCode}_${cleanNum}`;
      localStorage.setItem(lockKey, 'true');
      localStorage.removeItem(`draft_eval_${evaluation.accessCode}_${cleanNum}`);
      localStorage.removeItem(`timer_${evaluation.accessCode}_${cleanNum}`);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      setExistingSubmission(submission);
      setIsLockedAlready(true);
      setShowConfirmSubmit(false);

      if (!forceAutoSubmit) {
        alert('✅ Votre copie a été transmise avec succès à votre enseignant !\nElle est maintenant définitivement enregistrée et verrouillée.');
      }
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
              <p className="text-purple-200 text-xs font-medium">Espace Évaluation des Élèves (PEI IB)</p>
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
                Entrez votre numéro d'inscription permanent et le code d'évaluation pour commencer votre épreuve de 45 min.
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
                  Numéro d'inscription / Matricule (unique et permanent) <span className="text-rose-500">*</span>
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
                  <span>Vérification des identifiants…</span>
                ) : (
                  <>
                    <span>Commencer l'évaluation (45 min)</span>
                    <ChevronRight size={18} />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-100 text-center">
              <p className="text-[11px] text-slate-400 flex items-center justify-center gap-1">
                <span>🔒</span> Une fois soumise, votre copie est définitivement verrouillée.
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
  // VUE 2 : COPIE SOUMISE & VERROUILLÉE (L'ÉLÈVE NE PEUT PLUS MODIFIER OU REFAIRE)
  // ═══════════════════════════════════════════════════════════════════════════
  if (existingSubmission || isLockedAlready) {
    const isGraded = existingSubmission?.status === 'graded';
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
                Élève : <strong>{existingSubmission?.studentName || studentName}</strong> (Matricule {existingSubmission?.studentNumber || studentNumber})
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

        {/* Contenu copie verrouillée */}
        <main className="max-w-4xl mx-auto w-full p-4 sm:p-6 space-y-6 flex-1">
          {/* Bannière de verrouillage stricte */}
          <div className="bg-amber-50 border-2 border-amber-300 rounded-2xl p-5 text-amber-950 flex items-start gap-4">
            <div className="w-12 h-12 bg-amber-500 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
              <Lock size={26} />
            </div>
            <div>
              <h3 className="text-base font-black">
                {isGraded ? '🎉 Évaluation corrigée par votre professeur' : '🔒 Copie définitivement transmise et verrouillée'}
              </h3>
              <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                Votre évaluation pour le code <strong>{evaluation.accessCode}</strong> a été soumise avec succès.
                Conformément aux règles d'examen, vous ne pouvez plus modifier vos réponses ni recommencer l'épreuve.
              </p>
              {existingSubmission?.submittedAt && (
                <span className="inline-block mt-2 text-[11px] font-semibold text-amber-700 bg-amber-100 px-2.5 py-0.5 rounded-full">
                  Date de réception : {new Date(existingSubmission.submittedAt).toLocaleString('fr-FR')}
                </span>
              )}
            </div>
          </div>

          {/* Tableau des notes par critère si corrigé */}
          {isGraded && (
            <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
              <div className="flex items-center justify-between mb-4">
                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  📊 Résultats de votre évaluation critériée
                </h4>
                <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 px-3 py-1 rounded-xl text-xs font-black">
                  Total : {existingSubmission.totalScore ?? 0} / {totalMax}
                </div>
              </div>

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

              {existingSubmission.overallFeedback && (
                <div className="mt-4 bg-purple-50/80 rounded-xl p-3.5 border border-purple-200 text-xs">
                  <span className="font-bold text-purple-900 block mb-1">💬 Commentaire de l'enseignant :</span>
                  <p className="text-slate-700 italic">"{existingSubmission.overallFeedback}"</p>
                </div>
              )}
            </div>
          )}

          {/* Détail des réponses de l'élève */}
          {existingSubmission && existingSubmission.answers?.length > 0 && (
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                📝 Vos réponses enregistrées
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
                      </div>
                      {isGraded && ans.score !== undefined && (
                        <span className={`text-xs font-black ${colors.text} ${colors.light} px-2.5 py-1 rounded-lg`}>
                          Niveau {ans.score} / 8
                        </span>
                      )}
                    </div>

                    {/* Sous-aspect précis en rouge */}
                    {ans.strandIndex && (
                      <div className="text-red-600 font-bold text-xs bg-red-50/60 px-2.5 py-1 rounded border border-red-200">
                        🔴 Sous-aspect ({ans.strandIndex}) : {ans.strandText}
                      </div>
                    )}

                    <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                      {ans.questionContent}
                    </div>

                    <div>
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                        Votre réponse saisie :
                      </span>
                      <p className="text-xs text-slate-800 whitespace-pre-wrap bg-purple-50/40 p-3 rounded-xl border border-purple-100 leading-relaxed font-mono">
                        {ans.studentResponse || '(Aucune réponse)'}
                      </p>

                      {ans.drawingDataUrl && (
                        <div className="mt-2 text-center">
                          <span className="text-[10px] font-bold text-slate-500 block mb-1">Figure géométrique :</span>
                          <img
                            src={ans.drawingDataUrl}
                            alt="Figure géométrique"
                            className="max-h-48 max-w-full mx-auto border border-slate-200 rounded shadow-xs"
                          />
                        </div>
                      )}
                    </div>

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
          )}
        </main>

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
  // VUE 3 : PASSATION EN LIGNE (INTERACTIVE - 45 MIN AVEC OUTILS MATHS & GÉOMÉTRIE)
  // ═══════════════════════════════════════════════════════════════════════════
  const activeAssessment = evaluation.assessments[activeCriterionIdx];
  const activeColors = activeAssessment
    ? (CRITERION_COLORS[activeAssessment.criterion] || CRITERION_COLORS.A)
    : CRITERION_COLORS.A;

  const isTimeCritical = secondsRemaining <= 300; // < 5 minutes

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col">
      {/* ── TOP BAR STICKY AVEC CHRONO 45 MIN & AUTO-SAVE ── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl flex items-center justify-center font-black flex-shrink-0 shadow">
              PEI
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-sm text-slate-800 truncate">{evaluation.title}</h2>
              <p className="text-xs text-slate-500 truncate">
                Élève : <span className="font-semibold text-slate-700">{studentName}</span> (Matricule {studentNumber}) · {evaluation.subject}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 flex-shrink-0">
            {/* ⏱️ CHRONOMÈTRE 45 MINUTES */}
            <div className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-black shadow-inner transition ${
              isTimeCritical
                ? 'bg-rose-100 text-rose-700 border border-rose-300 animate-pulse'
                : 'bg-purple-100 text-purple-900 border border-purple-200'
            }`}>
              <Clock size={15} className={isTimeCritical ? 'text-rose-600' : 'text-purple-600'} />
              <span>Temps restant : {formatTimeRemaining(secondsRemaining)}</span>
            </div>

            {/* Progression */}
            <div className="hidden md:flex items-center gap-2 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
              <CheckCircle size={14} className={completedExercises === totalExercises ? 'text-green-600' : 'text-purple-600'} />
              <span>{completedExercises} / {totalExercises} réponses</span>
            </div>

            <button
              onClick={() => setShowConfirmSubmit(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
            >
              <Send size={14} /> Soumettre ma copie
            </button>
          </div>
        </div>
      </header>

      {/* ── CADRE DE RECHERCHE PEI ── */}
      {evaluation.statementOfInquiry && (
        <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white px-4 py-2.5 shadow-inner">
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
                </div>

                <span className={`text-xs font-black px-3 py-1 rounded-xl ${activeColors.light} ${activeColors.text}`}>
                  Max : {activeAssessment.maxPoints || 8} pts
                </span>
              </div>
            </div>

            {/* Questions / Tâches du critère */}
            <div className="space-y-5">
              {(activeAssessment.exercises || []).map((ex, exIdx) => {
                const answerKey = `${activeAssessment.criterion}_${exIdx}`;
                const currentAnswer = answers[answerKey] || '';
                const currentDrawing = drawings[answerKey];
                const strand = resolveStrandForQuestion(activeAssessment.criterion, activeAssessment.strands, ex, exIdx);
                const qType = ex.type || 'open';

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
                      <span className="text-xs font-semibold text-slate-400">
                        {qType === 'true_false' ? 'Vrai ou Faux' : qType === 'multiple_choice' ? 'QCM' : 'Rédaction'}
                      </span>
                    </div>

                    {/* 🔴 SOUS-ASPECT INDIVIDUEL EN ROUGE SOUS LA QUESTION (EXIGENCE FORMELLE DU BRIEF) */}
                    <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50/70 px-3 py-1.5 rounded-xl border border-red-200">
                      <span className="text-red-700 font-black">● {strand.fullLabel}</span>
                    </div>

                    {/* OEUVRE D'ART / PHOTO / SCHÉMA SI PRÉSENT */}
                    {ex.imageUrl && (
                      <div className="my-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                        <img
                          src={ex.imageUrl}
                          alt={ex.imageCaption || 'Illustration oeuvre d\'art'}
                          className="max-h-64 max-w-full mx-auto object-contain rounded-xl shadow-xs"
                        />
                        {ex.imageCaption && (
                          <p className="text-xs text-slate-600 italic mt-2 font-medium">
                            🖼️ {ex.imageCaption}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Énoncé de la question */}
                    <div className="bg-slate-50 p-4 rounded-xl text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-100 font-normal">
                      {ex.content}
                    </div>

                    {/* ── ZONE DE RÉPONSE INTERACTIVE SELON LE TYPE DE QUESTION ── */}

                    {/* 1. TYPE VRAI OU FAUX */}
                    {qType === 'true_false' && (
                      <div className="space-y-3 pt-1">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                          Indiquez votre réponse :
                        </label>
                        <div className="grid grid-cols-2 gap-3 max-w-md">
                          {['Vrai', 'Faux'].map(option => {
                            const isSelected = currentAnswer.startsWith(option);
                            return (
                              <button
                                key={option}
                                type="button"
                                onClick={() => handleResponseChange(activeAssessment.criterion, exIdx, option)}
                                className={`py-3 px-4 rounded-xl font-bold text-sm border-2 transition flex items-center justify-center gap-2 ${
                                  isSelected
                                    ? 'bg-purple-600 border-purple-600 text-white shadow-md'
                                    : 'bg-white border-slate-200 hover:border-purple-300 text-slate-700'
                                }`}
                              >
                                {isSelected && <Check size={16} />}
                                <span>{option}</span>
                              </button>
                            );
                          })}
                        </div>
                        <div>
                          <label className="text-[11px] font-semibold text-slate-500 block mb-1">
                            Justification ou explication (facultative) :
                          </label>
                          <textarea
                            value={currentAnswer.replace(/^(Vrai|Faux)\s*:\s*/, '')}
                            onChange={e => {
                              const prefix = currentAnswer.startsWith('Vrai') ? 'Vrai : ' : currentAnswer.startsWith('Faux') ? 'Faux : ' : '';
                              handleResponseChange(activeAssessment.criterion, exIdx, prefix + e.target.value);
                            }}
                            rows={2}
                            placeholder="Rédigez votre justification ici..."
                            className="w-full p-3 border border-slate-300 focus:border-purple-600 rounded-xl text-xs outline-none"
                          />
                        </div>
                      </div>
                    )}

                    {/* 2. TYPE CHOIX MULTIPLES (QCM) */}
                    {qType === 'multiple_choice' && (
                      <div className="space-y-2.5 pt-1">
                        <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                          Cochez la bonne réponse :
                        </label>
                        <div className="space-y-2">
                          {(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, optIdx) => {
                            const isSelected = currentAnswer === opt;
                            return (
                              <div
                                key={optIdx}
                                onClick={() => handleResponseChange(activeAssessment.criterion, exIdx, opt)}
                                className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                                  isSelected
                                    ? 'bg-purple-50 border-purple-600 text-purple-950 font-bold shadow-xs'
                                    : 'bg-white border-slate-200 hover:border-purple-200 text-slate-700'
                                }`}
                              >
                                <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                  isSelected ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300'
                                }`}>
                                  {isSelected && <div className="w-2 h-2 rounded-full bg-white" />}
                                </div>
                                <span className="text-sm">{opt}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* 3. TYPE OUVERT / RÉDACTION AVEC BARRE D'OUTILS MATHS & GÉOMÉTRIE */}
                    {qType === 'open' && (
                      <div className="space-y-2">
                        {/* 📐 BARRE D'OUTILS MATHÉMATIQUES & GÉOMÉTRIE */}
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-between flex-wrap gap-1.5 text-xs">
                          <div className="flex items-center gap-1 flex-wrap">
                            <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">Maths :</span>
                            {[
                              { label: 'x²', val: '²' },
                              { label: 'x³', val: '³' },
                              { label: 'xⁿ', val: '^()' },
                              { label: '√x', val: '√()' },
                              { label: '∛x', val: '∛()' },
                              { label: 'a/b', val: ' / ' },
                              { label: 'π', val: 'π' },
                              { label: '°', val: '°' },
                              { label: '±', val: '±' },
                              { label: '×', val: '×' },
                              { label: '÷', val: '÷' },
                              { label: '≠', val: '≠' },
                              { label: '≤', val: '≤' },
                              { label: '≥', val: '≥' },
                              { label: '∠', val: '∠' },
                              { label: '△', val: '△' },
                              { label: '⊥', val: '⊥' },
                              { label: '∥', val: '∥' },
                              { label: '[AB]', val: '[AB]' },
                            ].map(item => (
                              <button
                                key={item.label}
                                type="button"
                                onClick={() => handleInsertMathSymbol(activeAssessment.criterion, exIdx, item.val)}
                                className="px-2 py-1 bg-white hover:bg-purple-100 text-slate-700 hover:text-purple-800 border border-slate-200 rounded font-bold text-xs transition shadow-2xs"
                                title={`Insérer ${item.label}`}
                              >
                                {item.label}
                              </button>
                            ))}
                          </div>

                          {/* Bouton outil géométrique */}
                          <button
                            type="button"
                            onClick={() => setDrawingModalTarget(answerKey)}
                            className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
                            title="Ouvrir l'outil de dessin géométrique"
                          >
                            <span>📐</span> Tracer une figure
                          </button>
                        </div>

                        {/* Zone de saisie directe (sans espace pointillé) */}
                        <textarea
                          id={`textarea_${answerKey}`}
                          value={currentAnswer}
                          onChange={e => handleResponseChange(activeAssessment.criterion, exIdx, e.target.value)}
                          placeholder="Écrivez directement ici votre réponse rédigée et détaillée..."
                          rows={6}
                          className="w-full p-4 border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-sm outline-none transition leading-relaxed resize-y font-sans"
                        />

                        {/* Aperçu de la figure géométrique insérée */}
                        {currentDrawing && (
                          <div className="relative inline-block bg-slate-50 border border-slate-300 rounded-xl p-2 text-center mt-2">
                            <span className="text-[10px] font-bold text-slate-600 block mb-1">
                              📐 Figure géométrique rattachée à cette question :
                            </span>
                            <img
                              src={currentDrawing}
                              alt="Figure géométrique élève"
                              className="max-h-48 max-w-full mx-auto border border-slate-200 rounded bg-white shadow-xs"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = { ...drawings };
                                delete next[answerKey];
                                setDrawings(next);
                              }}
                              className="mt-1 text-[11px] text-rose-600 hover:text-rose-800 font-bold"
                            >
                              Supprimer la figure
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Navigation bas de page */}
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

      {/* ── MODALE GÉOMÉTRIQUE TRACÉ DE FIGURE ── */}
      {drawingModalTarget && (
        <GeometricDrawingModal
          isOpen={true}
          onClose={() => setDrawingModalTarget(null)}
          onSaveDrawing={handleSaveDrawing}
          initialDrawing={drawings[drawingModalTarget]}
        />
      )}

      {/* ── MODALE DE CONFIRMATION DE SOUMISSION ── */}
      {showConfirmSubmit && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn">
            <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-6 text-white text-center">
              <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-2">
                <Send size={28} />
              </div>
              <h3 className="text-xl font-black">Confirmer la remise définitive ?</h3>
              <p className="text-purple-100 text-xs mt-1">
                ⚠️ Une fois remise, votre copie sera verrouillée et vous ne pourrez plus la modifier.
              </p>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500 font-semibold">Élève :</span>
                  <span className="font-bold text-slate-800">{studentName} (Matricule {studentNumber})</span>
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
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>
                    Attention : Vous avez laissé <strong>{totalExercises - completedExercises}</strong> question(s) sans réponse.
                  </span>
                </div>
              )}

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={() => setShowConfirmSubmit(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                >
                  Continuer à composer
                </button>
                <button
                  onClick={() => handleSubmitEvaluation(false)}
                  disabled={isSubmitting}
                  className="flex-1 py-3 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow-lg transition flex items-center justify-center gap-2"
                >
                  {isSubmitting ? 'Envoi en cours…' : 'Oui, soumettre définitivement'}
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
