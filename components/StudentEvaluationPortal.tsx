import React, { useState, useEffect, useRef } from 'react';
import {
  Award, CheckCircle, Clock, FileText, LogOut, Printer, Send, ShieldCheck, User, AlertCircle,
  ChevronRight, Save, Image as ImageIcon, Check, Lock, AlertTriangle, Palette, Compass, Ruler,
  Square, Circle, Triangle, Edit3
} from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, StudentAnswer, AssessmentExercise, AssessmentSubQuestion } from '../types';
import { getEvaluationByAccessCode, getStudentSubmission, submitStudentEvaluation, createOrUpdateEvaluation } from '../services/onlineEvaluationService';
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

// Helper: déterminer précisément le sous-aspect individuel pour une question principale (i, ii, iii...)
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

// Helper: déterminer le sous-aspect spécifique pour une SOUS-QUESTION 1), 2), 3)...
function resolveStrandForSubQuestion(
  criterionLetter: string,
  strands: string[] = [],
  sub: AssessmentSubQuestion,
  subIndex: number
): { roman: string; description: string; fullLabel: string } {
  if (sub.strandIndex && sub.strandText) {
    return {
      roman: sub.strandIndex,
      description: sub.strandText,
      fullLabel: `Sous-aspect (${sub.strandIndex}) : ${sub.strandText}`,
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
      fullLabel: `Sous-aspect (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[subIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullLabel: `Sous-aspect (${targetRoman}) : ${cleanFallback || `Compétence ${criterionLetter}`}`,
  };
}

// Helper: Extraire les sous-questions d'un exercice (soit définies explicitement, soit détectées dans le texte 1) ... 2) ...)
function getExerciseSubQuestions(
  exercise: AssessmentExercise,
  criterionLetter: string,
  strands: string[] = []
): AssessmentSubQuestion[] {
  // 1. Sous-questions explicites enregistrées
  if (exercise.subQuestions && exercise.subQuestions.length > 0) {
    return exercise.subQuestions;
  }

  // 2. Détection intelligente dans le contenu (ex: lignes commençant par 1) ... 2) ... ou a) ... b) ...)
  const content = exercise.content || '';
  const pattern = /(?:^|\n)\s*(?:([0-9]+|[a-d])\s*[\)\.]\s+)/gi;
  const matches = Array.from(content.matchAll(pattern)) as RegExpExecArray[];

  if (matches.length >= 2) {
    const subQuestions: AssessmentSubQuestion[] = [];
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];

    for (let i = 0; i < matches.length; i++) {
      const match = matches[i];
      const nextMatch = matches[i + 1];
      const startPos = (match.index || 0) + match[0].length;
      const endPos = nextMatch ? nextMatch.index : content.length;
      const subText = content.substring(startPos, endPos).trim();
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
    return subQuestions;
  }

  return [];
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
  // answers stores:
  // - for standard questions: `${criterion}_${exIdx}` -> response
  // - for sub-questions: `${criterion}_${exIdx}_sub_${subIdx}` -> response
  const [answers, setAnswers] = useState<Record<string, string>>({});
  // drawings stores:
  // - `${criterion}_${exIdx}` or `${criterion}_${exIdx}_sub_${subIdx}` -> dataUrl
  const [drawings, setDrawings] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showConfirmSubmit, setShowConfirmSubmit] = useState(false);
  const [lastAutoSave, setLastAutoSave] = useState<string | null>(null);

  // Geometric & Art drawing modal state
  const [drawingModalTarget, setDrawingModalTarget] = useState<string | null>(null);
  const [drawingModalLabel, setDrawingModalLabel] = useState<string>('');

  // 45 min timer
  const [secondsRemaining, setSecondsRemaining] = useState<number>(45 * 60);
  const timerIntervalRef = useRef<any>(null);

  // Print view modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Sécurité plein écran & surveillance anti-fraude
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const hasTriggeredViolationRef = useRef(false);
  const handleSubmitRef = useRef<((forceAutoSubmit?: boolean, reason?: string) => Promise<void>) | null>(null);

  // Synchroniser le code d'accès si fourni par l'URL (ex: ?code=EVAL-1234)
  useEffect(() => {
    if (initialAccessCode) {
      setAccessCode(initialAccessCode.trim().toUpperCase());
    }
  }, [initialAccessCode]);

  // Demander le mode plein écran au navigateur
  const enterFullscreen = async () => {
    try {
      const el = document.documentElement;
      if (el.requestFullscreen) {
        await el.requestFullscreen();
      } else if ((el as any).webkitRequestFullscreen) {
        await (el as any).webkitRequestFullscreen();
      } else if ((el as any).mozRequestFullscreen) {
        await (el as any).mozRequestFullscreen();
      } else if ((el as any).msRequestFullscreen) {
        await (el as any).msRequestFullscreen();
      }
      setIsFullscreen(true);
    } catch (err) {
      console.warn('Mode plein écran :', err);
    }
  };

  // Gestion du chronomètre 45 minutes
  useEffect(() => {
    if (!evaluation || isLockedAlready || existingSubmission) return;

    // Restaurer le temps restant depuis localStorage si session en cours
    const timerKey = `timer_${evaluation.accessCode}_${studentNumber}`;
    const savedTime = localStorage.getItem(timerKey);
    const initialDuration = evaluation.durationMinutes ? evaluation.durationMinutes * 60 : 45 * 60;
    const startTime = savedTime ? parseInt(savedTime) : initialDuration;
    setSecondsRemaining(startTime);

    timerIntervalRef.current = setInterval(() => {
      setSecondsRemaining(prev => {
        if (prev <= 1) {
          clearInterval(timerIntervalRef.current);
          handleSubmitEvaluation(true); // Soumission automatique à la fin du temps
          return 0;
        }
        const updated = prev - 1;
        try {
          localStorage.setItem(timerKey, updated.toString());
        } catch {}
        return updated;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [evaluation?.id, isLockedAlready, Boolean(existingSubmission)]);

  // Formatage mm:ss
  const formatTimeRemaining = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // ── Sauvegarde automatique du brouillon ────────────────────────────────────
  const autoSaveDraftAnswers = (newAnswers: Record<string, string>, newDrawings: Record<string, string>) => {
    if (!evaluation || isLockedAlready) return;
    try {
      const draftKey = `draft_eval_${evaluation.accessCode}_${studentNumber}`;
      localStorage.setItem(draftKey, JSON.stringify({ answers: newAnswers, drawings: newDrawings, updatedAt: new Date().toISOString() }));
      setLastAutoSave(new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    } catch {}
  };

  // Connexion de l'élève avec code + N° inscription + Nom
  const handleValidateAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError('');

    const cleanCode = accessCode.trim().toUpperCase();
    const cleanNum = studentNumber.trim();
    const cleanName = studentName.trim();

    if (!cleanCode) {
      setLoginError('Veuillez saisir le code d\'accès fourni par votre enseignant.');
      return;
    }
    if (!cleanNum) {
      setLoginError('Veuillez saisir votre N° d\'inscription / Matricule.');
      return;
    }
    if (!cleanName) {
      setLoginError('Veuillez saisir votre nom et prénom complets.');
      return;
    }

    setIsValidating(true);
    try {
      // 1. Sauvegarder l'identité permanente de l'élève
      localStorage.setItem('ib_permanent_matricule', cleanNum);
      localStorage.setItem('ib_permanent_student_name', cleanName);
      localStorage.setItem('ib_student_session', JSON.stringify({ accessCode: cleanCode, studentNumber: cleanNum, studentName: cleanName }));

      // 2. Vérifier si l'évaluation existe
      const evalData = await getEvaluationByAccessCode(cleanCode);
      if (!evalData) {
        setLoginError(`Aucune évaluation trouvée pour le code "${cleanCode}". Vérifiez avec votre professeur.`);
        setIsValidating(false);
        return;
      }

      if (evalData.status === 'closed') {
        setLoginError('Cette évaluation est actuellement fermée par l\'enseignant.');
        setIsValidating(false);
        return;
      }

      // 3. Vérifier si cleanCode est un code d'accès individuel à usage unique
      const individualCode = evalData.studentAccessCodes?.find(sc => sc.code.trim().toUpperCase() === cleanCode);

      if (individualCode) {
        // Cas A : Code déjà utilisé ET non réautorisé par l'enseignant
        if (individualCode.isUsed && !individualCode.allowedRetake) {
          setLoginError(`❌ Ce code d'accès individuel (${cleanCode}) a déjà été utilisé pour composer${individualCode.studentName ? ` par ${individualCode.studentName}` : ''}. Il est à usage unique et n'est plus valide pour un deuxième essai, sauf si votre enseignant vous réautorise l'accès.`);
          setIsValidating(false);
          return;
        }

        // Cas B : Code déjà utilisé MAIS réautorisé par l'enseignant pour un nouvel essai
        if (individualCode.isUsed && individualCode.allowedRetake) {
          // Lever le verrou local pour autoriser le nouvel essai
          localStorage.removeItem(`ib_locked_${cleanCode}_${cleanNum}`);
          localStorage.removeItem(`ib_locked_${evalData.accessCode}_${cleanNum}`);
        }
      } else {
        // Code d'évaluation général : vérifier si une copie a DÉJÀ été soumise par ce matricule pour ce code
        const lockKey = `ib_locked_${cleanCode}_${cleanNum}`;
        const isLocallyLocked = localStorage.getItem(lockKey) === 'true';

        const prevSub = await getStudentSubmission(cleanCode, cleanNum);
        if (prevSub || isLocallyLocked) {
          setEvaluation(evalData);
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
          setIsValidating(false);
          return;
        }
      }

      // 4. Charger l'évaluation et le brouillon existant
      setEvaluation(evalData);
      const draftKey = `draft_eval_${cleanCode}_${cleanNum}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.answers) setAnswers(parsed.answers);
          if (parsed.drawings) setDrawings(parsed.drawings);
        } catch {}
      }

      // 5. Si code individuel, marquer le code comme utilisé par cet élève
      if (evalData.studentAccessCodes && evalData.studentAccessCodes.length > 0) {
        const hasMatch = evalData.studentAccessCodes.some(sc => sc.code.trim().toUpperCase() === cleanCode);
        if (hasMatch) {
          const updatedCodes = evalData.studentAccessCodes.map(sc => {
            if (sc.code.trim().toUpperCase() === cleanCode) {
              return {
                ...sc,
                studentName: cleanName,
                studentNumber: cleanNum,
                isUsed: true,
                usedAt: sc.usedAt || new Date().toISOString(),
                allowedRetake: sc.allowedRetake, // Conservé durant la passation pour autoriser le rechargement de page si besoin
              };
            }
            return sc;
          });
          evalData.studentAccessCodes = updatedCodes;
          createOrUpdateEvaluation({
            ...evalData,
            studentAccessCodes: updatedCodes,
          }).catch(console.error);
        }
      }

      // 6. Réinitialiser la surveillance et activer le mode plein écran obligatoire (Exigence brief)
      hasTriggeredViolationRef.current = false;
      await enterFullscreen();
    } catch (err: any) {
      setLoginError(err.message || 'Erreur lors de la validation du code.');
    } finally {
      setIsValidating(false);
    }
  };

  // Mise à jour de la réponse (pour question principale ou sous-question)
  const handleResponseChange = (key: string, value: string) => {
    if (isLockedAlready) return;
    setAnswers(prev => {
      const next = { ...prev, [key]: value };
      autoSaveDraftAnswers(next, drawings);
      return next;
    });
  };

  // Insertion de symboles mathématiques dans le textarea ciblé
  const handleInsertMathSymbol = (key: string, symbol: string) => {
    if (isLockedAlready) return;
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

    handleResponseChange(key, updated);
  };

  // Sauvegarde d'un tracé géométrique ou dessin d'art
  const handleSaveDrawing = (dataUrl: string) => {
    if (!drawingModalTarget || isLockedAlready) return;
    setDrawings(prev => {
      const next = { ...prev, [drawingModalTarget]: dataUrl };
      autoSaveDraftAnswers(answers, next);
      return next;
    });
    setDrawingModalTarget(null);
  };

  // ── Calcul de l'avancement global ──────────────────────────────────────────
  const isMathSubject = /math/i.test(evaluation?.subject || '');
  const isArtSubject = /art|plastique|visuel|dessin/i.test(evaluation?.subject || '');

  let totalQuestionsCount = 0;
  let answeredQuestionsCount = 0;

  if (evaluation) {
    evaluation.assessments.forEach(crit => {
      (crit.exercises || []).forEach((ex, exIdx) => {
        const subQuestions = getExerciseSubQuestions(ex, crit.criterion, crit.strands);
        if (subQuestions.length > 0) {
          subQuestions.forEach((_, sIdx) => {
            totalQuestionsCount++;
            const subKey = `${crit.criterion}_${exIdx}_sub_${sIdx}`;
            if (answers[subKey] && answers[subKey].trim().length > 0) {
              answeredQuestionsCount++;
            }
          });
        } else {
          totalQuestionsCount++;
          const key = `${crit.criterion}_${exIdx}`;
          if (answers[key] && answers[key].trim().length > 0) {
            answeredQuestionsCount++;
          }
        }
      });
    });
  }

  // ── SÉCURITÉ ANTI-FRAUDE : PLEIN ÉCRAN OBLIGATOIRE & INTERDICTION DE QUITTER OU CHANGER D'ONGLET ──
  const isTakingExam = Boolean(evaluation && !existingSubmission && !isLockedAlready);

  useEffect(() => {
    handleSubmitRef.current = handleSubmitEvaluation;
  });

  useEffect(() => {
    if (!isTakingExam) return;

    let blurTimer: any = null;

    const triggerAutoTermination = (reason: string) => {
      if (hasTriggeredViolationRef.current) return;
      hasTriggeredViolationRef.current = true;
      setTerminatedReason(reason);

      // Quitter le plein écran si actif
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      } catch {}

      if (handleSubmitRef.current) {
        handleSubmitRef.current(true, reason);
      }
    };

    // 1. Détection de sortie du plein écran
    const handleFullscreenChange = () => {
      const activeFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(activeFs);

      if (!activeFs && !hasTriggeredViolationRef.current) {
        triggerAutoTermination("Sortie du mode plein écran détectée. Il est strictement interdit de quitter le plein écran durant l'évaluation.");
      }
    };

    // 2. Détection de changement d'onglet ou masquage de la page (visibilitychange)
    const handleVisibilityChange = () => {
      if (document.hidden && !hasTriggeredViolationRef.current) {
        triggerAutoTermination("Changement d'onglet ou minimisation de la fenêtre détecté. L'évaluation a été automatiquement clôturée.");
      }
    };

    // 3. Détection de perte de focus (ouverture d'une autre application ou onglet)
    const handleWindowBlur = () => {
      blurTimer = setTimeout(() => {
        if ((document.hidden || !document.hasFocus()) && !hasTriggeredViolationRef.current) {
          triggerAutoTermination("Perte de focus de la fenêtre d'examen détectée (tentative d'ouverture d'un autre programme ou onglet).");
        }
      }, 250);
    };

    // 4. Bloquer le clic droit (menu contextuel)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 5. Bloquer les raccourcis clavier de navigation et d'inspection
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F11' ||
        e.key === 'F12' ||
        (e.altKey && (e.key === 'Tab' || e.key === 'ArrowLeft' || e.key === 'ArrowRight')) ||
        (e.ctrlKey && (e.key === 't' || e.key === 'T' || e.key === 'n' || e.key === 'N' || e.key === 'w' || e.key === 'W' || e.key === 'r' || e.key === 'R')) ||
        (e.ctrlKey && e.shiftKey && (e.key === 'I' || e.key === 'i' || e.key === 'C' || e.key === 'c' || e.key === 'J' || e.key === 'j'))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // 6. Alerte en cas de tentative de rechargement ou de fermeture de la page
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "L'évaluation est en cours. Toute sortie clôturera automatiquement votre copie.";
      return e.returnValue;
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleWindowBlur);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (blurTimer) clearTimeout(blurTimer);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleWindowBlur);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isTakingExam]);

  // ── Soumission de la copie (avec verrouillage immédiat et définitif) ───────
  const handleSubmitEvaluation = async (forceAutoSubmit = false, reason = '') => {
    if (!evaluation || isSubmitting || isLockedAlready) return;

    if (reason) {
      setTerminatedReason(reason);
    }

    setIsSubmitting(true);
    try {
      const formattedAnswers: StudentAnswer[] = [];

      (evaluation.assessments || []).forEach(crit => {
        (crit.exercises || []).forEach((ex, exIdx) => {
          const mainKey = `${crit.criterion}_${exIdx}`;
          const strand = resolveStrandForQuestion(crit.criterion, crit.strands, ex, exIdx);
          const subQuestions = getExerciseSubQuestions(ex, crit.criterion, crit.strands);

          let combinedResponse = '';
          const subAnswersMap: Record<string, { response: string; drawingDataUrl?: string }> = {};

          if (subQuestions.length > 0) {
            const parts: string[] = [];
            subQuestions.forEach((sub, sIdx) => {
              const subKey = `${crit.criterion}_${exIdx}_sub_${sIdx}`;
              const subResp = answers[subKey] || '';
              const subDraw = drawings[subKey];
              const subId = sub.id || `sub_${sIdx + 1}`;
              subAnswersMap[subId] = {
                response: subResp,
                drawingDataUrl: subDraw,
              };
              parts.push(`${sub.label} ${subResp || '(Sans réponse)'}`);
            });
            combinedResponse = parts.join('\n\n');
          } else {
            combinedResponse = answers[mainKey] || '';
          }

          formattedAnswers.push({
            criterion: crit.criterion,
            exerciseIndex: exIdx,
            exerciseTitle: ex.title,
            criterionReference: ex.criterionReference,
            strandIndex: strand.roman,
            strandText: strand.description,
            questionType: ex.type || 'open',
            questionContent: ex.content,
            studentResponse: combinedResponse,
            drawingDataUrl: drawings[mainKey],
            subAnswers: Object.keys(subAnswersMap).length > 0 ? subAnswersMap : undefined,
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

      // ── VERROUILLAGE DÉFINITIF DU CODE D'ACCÈS INDIVIDUEL ──
      const cleanNum = studentNumber.trim();
      const cleanCode = accessCode.trim().toUpperCase();

      if (evaluation.studentAccessCodes && evaluation.studentAccessCodes.length > 0) {
        const updatedCodes = evaluation.studentAccessCodes.map(sc => {
          if (sc.code.trim().toUpperCase() === cleanCode) {
            return {
              ...sc,
              isUsed: true,
              allowedRetake: false, // Usage unique consommé
              usedAt: new Date().toISOString(),
              studentName: studentName.trim(),
              studentNumber: cleanNum,
            };
          }
          return sc;
        });

        createOrUpdateEvaluation({
          ...evaluation,
          studentAccessCodes: updatedCodes,
        }).catch(err => console.warn('Erreur verrouillage code individuel:', err));
      }

      // VERROUILLAGE DÉFINITIF EN LOCAL
      const lockKey = `ib_locked_${evaluation.accessCode}_${cleanNum}`;
      localStorage.setItem(lockKey, 'true');
      localStorage.setItem(`ib_locked_${cleanCode}_${cleanNum}`, 'true');
      localStorage.removeItem(`draft_eval_${evaluation.accessCode}_${cleanNum}`);
      localStorage.removeItem(`draft_eval_${cleanCode}_${cleanNum}`);
      localStorage.removeItem(`timer_${evaluation.accessCode}_${cleanNum}`);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

      // Quitter le plein écran dès la remise
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      } catch {}

      setExistingSubmission(submission);
      setIsLockedAlready(true);
      setShowConfirmSubmit(false);

      if (!forceAutoSubmit) {
        alert('🎉 Votre copie a été remise avec succès et est maintenant verrouillée.');
      } else if (reason) {
        alert(`⚠️ ÉVALUATION CLÔTURÉE AUTOMATIQUEMENT :\n\n${reason}\n\nVos réponses saisies ont été enregistrées et verrouillées.`);
      }
    } catch (err: any) {
      alert(`Erreur lors de la remise : ${err.message || 'Impossible de soumettre la copie'}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // VUE 1 : ÉCRAN DE CONNEXION ÉLÈVE
  // ═══════════════════════════════════════════════════════════════════════════
  if (!evaluation) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-950 via-slate-900 to-indigo-950 flex flex-col justify-between p-4 sm:p-6 text-white">
        <header className="flex items-center justify-between max-w-5xl mx-auto w-full py-2">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-purple-600 rounded-xl flex items-center justify-center font-black text-white shadow-lg">
              PEI
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-wide text-purple-200">Évaluation Critériée en Ligne</h1>
              <p className="text-[11px] text-purple-400">Portail officiel des élèves · Baccalauréat International</p>
            </div>
          </div>
          <button
            onClick={onExit}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-semibold transition"
          >
            <LogOut size={14} /> Retour à l'accueil
          </button>
        </header>

        <main className="max-w-md mx-auto w-full my-8">
          <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl border border-purple-200/20 animate-fadeIn">
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto mb-3 shadow-inner">
                <ShieldCheck size={32} />
              </div>
              <h2 className="text-xl font-black text-slate-800">Espace Évaluation Élève</h2>
              <p className="text-xs text-slate-500 mt-1">
                Saisissez votre code d'accès et vos identifiants d'élève pour composer
              </p>
            </div>

            {loginError && (
              <div className="mb-4 bg-rose-50 border border-rose-200 text-rose-700 p-3 rounded-xl text-xs flex items-start gap-2">
                <AlertCircle size={16} className="text-rose-600 flex-shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="mb-4 bg-amber-50/90 border-2 border-amber-300 text-amber-950 p-4 rounded-2xl text-xs space-y-2 shadow-xs">
              <div className="flex items-center gap-2 font-black text-amber-900 text-sm">
                <ShieldCheck size={18} className="text-amber-700 flex-shrink-0" />
                <span>Mode Examen Sécurisé & Plein Écran Obligatoire</span>
              </div>
              <p className="text-[11px] leading-relaxed text-amber-900 font-medium">
                Dès que vous cliquerez sur <strong>« Commencer l'évaluation »</strong>, votre navigateur passera obligatoirement en <strong>plein écran</strong>.
              </p>
              <div className="bg-white/80 p-2.5 rounded-xl border border-amber-200 text-[11px] text-rose-700 font-bold">
                ⚠️ Il est formellement interdit de quitter le plein écran ou d'ouvrir un autre onglet. Si vous le faites, votre examen sera <u>automatiquement terminé et remis</u>.
              </div>
            </div>

            <form onSubmit={handleValidateAccess} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Code d'accès de l'évaluation <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={accessCode}
                    onChange={e => setAccessCode(e.target.value.toUpperCase())}
                    placeholder="Ex: EVAL-4892"
                    className="w-full px-4 py-3 bg-purple-50/50 border-2 border-purple-200 focus:border-purple-600 rounded-xl text-base font-mono font-black text-purple-900 tracking-wider text-center focus:outline-none transition uppercase"
                    required
                    autoFocus
                  />
                </div>
                <p className="text-[11px] text-slate-400 mt-1">Fourni au tableau ou par votre enseignant</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  N° d'inscription / Matricule <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentNumber}
                  onChange={e => setStudentNumber(e.target.value)}
                  placeholder="Ex: 2024-8491"
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-300 focus:border-purple-600 rounded-xl text-sm font-mono font-bold focus:outline-none transition"
                  required
                />
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
  // VUE 2 : COPIE SOUMISE & VERROUILLÉE
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
          {/* Notification si l'épreuve a été clôturée pour sortie d'écran / changement d'onglet */}
          {terminatedReason && (
            <div className="bg-rose-50 border-2 border-rose-300 rounded-2xl p-5 text-rose-950 flex items-start gap-4">
              <div className="w-12 h-12 bg-rose-600 text-white rounded-2xl flex items-center justify-center flex-shrink-0 shadow-md">
                <AlertCircle size={26} />
              </div>
              <div>
                <h3 className="text-base font-black text-rose-900">
                  ⚠️ Évaluation terminée et clôturée automatiquement
                </h3>
                <p className="text-xs text-rose-800 mt-1 leading-relaxed font-medium">
                  {terminatedReason}
                </p>
                <p className="text-[11px] text-rose-700 mt-1">
                  Toutes les réponses saisies jusqu'à cet instant ont été sauvegardées et transmises à l'enseignant.
                </p>
              </div>
            </div>
          )}

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

                    {/* Sous-aspect principal si pas de sous-questions */}
                    {ans.strandIndex && !ans.subAnswers && (
                      <div className="text-red-600 font-bold text-xs bg-red-50/60 px-2.5 py-1 rounded border border-red-200">
                        🔴 Sous-aspect ({ans.strandIndex}) : {ans.strandText}
                      </div>
                    )}

                    <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                      {ans.questionContent}
                    </div>

                    {/* Affichage des réponses par sous-question si présentes */}
                    {ans.subAnswers && Object.keys(ans.subAnswers).length > 0 ? (
                      <div className="space-y-3 pt-2">
                        <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wide block">
                          Détail de vos réponses par sous-question :
                        </span>
                        {Object.entries(ans.subAnswers).map(([subId, subData], subIdx) => (
                          <div key={subId} className="bg-purple-50/40 p-3.5 rounded-xl border border-purple-100 space-y-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-xs text-purple-900">
                                Sous-question {subIdx + 1})
                              </span>
                            </div>
                            <p className="text-xs text-slate-800 whitespace-pre-wrap font-mono">
                              {subData.response || '(Aucune réponse)'}
                            </p>
                            {subData.drawingDataUrl && (
                              <div className="mt-2 text-center pt-2 border-t border-purple-100">
                                <span className="text-[10px] font-bold text-slate-500 block mb-1">Tracé / Figure géométrique :</span>
                                <img
                                  src={subData.drawingDataUrl}
                                  alt="Tracé élève"
                                  className="max-h-40 max-w-full mx-auto border border-slate-200 rounded shadow-xs bg-white"
                                />
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide block mb-1">
                          Votre réponse saisie :
                        </span>
                        <p className="text-xs text-slate-800 whitespace-pre-wrap bg-purple-50/40 p-3 rounded-xl border border-purple-100 leading-relaxed font-mono">
                          {ans.studentResponse || '(Aucune réponse)'}
                        </p>

                        {ans.drawingDataUrl && (
                          <div className="mt-2 text-center">
                            <span className="text-[10px] font-bold text-slate-500 block mb-1">Figure géométrique / Tracé :</span>
                            <img
                              src={ans.drawingDataUrl}
                              alt="Figure élève"
                              className="max-h-48 max-w-full mx-auto border border-slate-200 rounded shadow-xs bg-white"
                            />
                          </div>
                        )}
                      </div>
                    )}

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
  // VUE 3 : PASSATION EN LIGNE (INTERACTIVE - 45 MIN AVEC OUTILS MATHS & GÉOMÉTRIE & ART)
  // ═══════════════════════════════════════════════════════════════════════════
  const activeAssessment = evaluation.assessments[activeCriterionIdx];
  const activeColors = activeAssessment
    ? (CRITERION_COLORS[activeAssessment.criterion] || CRITERION_COLORS.A)
    : CRITERION_COLORS.A;

  const isTimeCritical = secondsRemaining <= 300; // < 5 minutes

  // Symboles mathématiques pour barre d'outils
  const MATH_SYMBOLS = [
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
  ];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col select-none">
      {/* ⚠️ MODALE DE FORÇAGE PLEIN ÉCRAN SI DÉSACTIVÉ */}
      {!isFullscreen && isTakingExam && (
        <div className="fixed inset-0 z-50 bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl border border-purple-200">
            <div className="w-16 h-16 bg-purple-100 text-purple-700 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
              <ShieldCheck size={36} />
            </div>
            <h3 className="text-lg font-black text-slate-900">Mode Plein Écran Obligatoire</h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Pour des raisons d'intégrité académique, cette épreuve doit impérativement être passée en <strong>plein écran</strong>.
              <br /><br />
              <strong className="text-rose-600">Attention :</strong> Si vous quittez le plein écran ou ouvrez un autre onglet, l'examen sera <strong>immédiatement clôturé</strong> pour vous.
            </p>
            <button
              type="button"
              onClick={enterFullscreen}
              className="w-full py-3.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2"
            >
              <span>Activer le plein écran pour composer</span>
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      )}

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
              <CheckCircle size={14} className={answeredQuestionsCount === totalQuestionsCount && totalQuestionsCount > 0 ? 'text-green-600' : 'text-purple-600'} />
              <span>{answeredQuestionsCount} / {totalQuestionsCount} répondues</span>
            </div>

            {/* 🔒 Indicateur plein écran & surveillance */}
            <div className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl text-xs font-bold shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Plein écran actif · Surveillance anti-fraude</span>
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
                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">
                  {critExercisesCount} tâche(s)
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
            <div className="space-y-6">
              {(activeAssessment.exercises || []).map((ex, exIdx) => {
                const subQuestions = getExerciseSubQuestions(ex, activeAssessment.criterion, activeAssessment.strands);
                const hasSubQuestions = subQuestions.length > 0;
                const mainStrand = resolveStrandForQuestion(activeAssessment.criterion, activeAssessment.strands, ex, exIdx);

                return (
                  <div
                    key={exIdx}
                    className="bg-white rounded-3xl p-6 sm:p-7 border border-slate-200 shadow-sm space-y-5 hover:border-purple-300 transition"
                  >
                    {/* Header de la question principale */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <span className={`px-3 py-1 rounded-xl text-xs font-black text-white ${activeColors.badge}`}>
                          Question {exIdx + 1}
                        </span>
                        <h4 className="font-black text-base text-slate-900">{ex.title}</h4>
                      </div>
                      <span className="text-xs font-semibold text-slate-400">
                        {hasSubQuestions
                          ? `${subQuestions.length} sous-questions`
                          : ex.type === 'multiple_choice' ? 'QCM' : ex.type === 'true_false' ? 'Vrai/Faux' : 'Rédaction'}
                      </span>
                    </div>

                    {/* OEUVRE D'ART / PHOTO / SCHÉMA SI PRÉSENT */}
                    {ex.imageUrl && (
                      <div className="my-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
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

                    {/* Énoncé global / Contexte de la question */}
                    {ex.content && (
                      <div className="bg-slate-50 p-4 rounded-2xl text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-100 font-normal">
                        {ex.content}
                      </div>
                    )}

                    {/* ═══════════════════════════════════════════════════════════
                        CAS 1 : LA QUESTION CONTIENT DES SOUS-QUESTIONS 1), 2), 3)...
                        Chaque sous-question a son sous-aspect en rouge, sa réponse et ses outils !
                        ═══════════════════════════════════════════════════════════ */}
                    {hasSubQuestions ? (
                      <div className="space-y-6 pt-2">
                        <div className="text-xs font-bold uppercase tracking-wider text-purple-900 flex items-center gap-2">
                          <span>📋</span>
                          <span>Sous-questions à traiter :</span>
                        </div>

                        {subQuestions.map((sub, sIdx) => {
                          const subKey = `${activeAssessment.criterion}_${exIdx}_sub_${sIdx}`;
                          const subAnswer = answers[subKey] || '';
                          const subDrawing = drawings[subKey];
                          const subStrand = resolveStrandForSubQuestion(activeAssessment.criterion, activeAssessment.strands, sub, sIdx);
                          const subQType = sub.type || ex.type || 'open';

                          return (
                            <div
                              key={sub.id || sIdx}
                              className="bg-purple-50/20 border-2 border-purple-100 rounded-2xl p-5 space-y-4 hover:border-purple-300 transition"
                            >
                              {/* Intitulé de la sous-question */}
                              <div className="flex items-start justify-between gap-2">
                                <div className="flex items-baseline gap-2">
                                  <span className="font-black text-sm text-purple-700 bg-purple-100 px-2.5 py-0.5 rounded-lg flex-shrink-0">
                                    {sub.label || `${sIdx + 1})`}
                                  </span>
                                  <h5 className="font-bold text-sm text-slate-900 leading-snug">
                                    {sub.content || `Sous-question ${sIdx + 1}`}
                                  </h5>
                                </div>
                                <span className="text-[11px] font-semibold text-slate-400 flex-shrink-0">
                                  {subQType === 'multiple_choice' ? '☑️ QCM' : subQType === 'true_false' ? '⚖️ Vrai/Faux' : '📝 Rédaction'}
                                </span>
                              </div>

                              {/* 🔴 SOUS-ASPECT INDIVIDUEL EN ROUGE SOUS CETTE SOUS-QUESTION (EXIGENCE BRIEF) */}
                              <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                                <span className="text-red-700 font-black">● {subStrand.fullLabel}</span>
                              </div>

                              {/* ── ZONE DE RÉPONSE INTERACTIVE SELON LE TYPE DE LA SOUS-QUESTION ── */}

                              {/* A. QCM : COCHER LA BONNE RÉPONSE */}
                              {subQType === 'multiple_choice' && (
                                <div className="space-y-2 pt-1">
                                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                                    Cochez la bonne réponse :
                                  </label>
                                  <div className="space-y-2">
                                    {(sub.options || ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, optIdx) => {
                                      const isSelected = subAnswer === opt;
                                      return (
                                        <div
                                          key={optIdx}
                                          onClick={() => handleResponseChange(subKey, opt)}
                                          className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                                            isSelected
                                              ? 'bg-purple-100/90 border-purple-600 text-purple-950 font-bold shadow-xs'
                                              : 'bg-white border-slate-200 hover:border-purple-300 text-slate-700'
                                          }`}
                                        >
                                          <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                            isSelected ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-400 bg-white'
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

                              {/* B. VRAI OU FAUX */}
                              {subQType === 'true_false' && (
                                <div className="space-y-2.5 pt-1">
                                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                                    Indiquez votre réponse :
                                  </label>
                                  <div className="grid grid-cols-2 gap-3 max-w-xs">
                                    {['Vrai', 'Faux'].map(opt => {
                                      const isSelected = subAnswer.startsWith(opt);
                                      return (
                                        <button
                                          key={opt}
                                          type="button"
                                          onClick={() => handleResponseChange(subKey, opt)}
                                          className={`py-2.5 px-4 rounded-xl font-bold text-xs border-2 transition flex items-center justify-center gap-2 ${
                                            isSelected
                                              ? 'bg-purple-600 border-purple-600 text-white shadow-md'
                                              : 'bg-white border-slate-200 hover:border-purple-300 text-slate-700'
                                          }`}
                                        >
                                          {isSelected && <Check size={14} />}
                                          <span>{opt}</span>
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* C. RÉDACTION LIBRE AVEC OUTILS MATHS & GÉOMÉTRIE OU ART */}
                              {subQType === 'open' && (
                                <div className="space-y-2 pt-1">
                                  {/* BARRE D'OUTILS SPÉCIALISÉE SOUS LA SOUS-QUESTION */}
                                  <div className="bg-white border border-slate-200 rounded-xl p-2 flex items-center justify-between flex-wrap gap-2 text-xs shadow-2xs">
                                    {/* Outils Maths si matière scientifique */}
                                    {isMathSubject && (
                                      <div className="flex items-center gap-1 flex-wrap">
                                        <span className="text-[10px] font-bold text-slate-500 uppercase mr-1">Maths :</span>
                                        {MATH_SYMBOLS.slice(0, 10).map(item => (
                                          <button
                                            key={item.label}
                                            type="button"
                                            onClick={() => handleInsertMathSymbol(subKey, item.val)}
                                            className="px-2 py-0.5 bg-slate-50 hover:bg-purple-100 text-slate-700 hover:text-purple-900 border border-slate-200 rounded font-bold text-xs transition"
                                            title={`Insérer ${item.label}`}
                                          >
                                            {item.label}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {/* Palette rapide si matière d'art */}
                                    {isArtSubject && (
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[10px] font-bold text-purple-700 uppercase">🎨 Outils d'Art :</span>
                                        <span className="text-[11px] text-slate-500 italic">Pinceaux, fusain, lavis et palette disponibles</span>
                                      </div>
                                    )}

                                    {/* Bouton pour ouvrir l'outil de dessin adapté */}
                                    <div className="flex items-center gap-1.5 ml-auto">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setDrawingModalTarget(subKey);
                                          setDrawingModalLabel(`Question ${exIdx + 1} - ${sub.label}`);
                                        }}
                                        className="flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
                                        title="Ouvrir le studio de tracé (Équerre, Rapporteur, Compas ou Art)"
                                      >
                                        {isArtSubject ? <span>🎨 Dessiner / Esquisser</span> : <span>📐 Géométrie (Équerre, Compas)</span>}
                                      </button>
                                    </div>
                                  </div>

                                  {/* Zone de saisie directe pour cette sous-question */}
                                  <textarea
                                    id={`textarea_${subKey}`}
                                    value={subAnswer}
                                    onChange={e => handleResponseChange(subKey, e.target.value)}
                                    placeholder={`Rédigez votre réponse détaillée pour la sous-question ${sub.label}...`}
                                    rows={4}
                                    className="w-full p-3.5 bg-white border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-sm outline-none transition font-sans leading-relaxed"
                                  />

                                  {/* Tracé rattaché à cette sous-question */}
                                  {subDrawing && (
                                    <div className="relative inline-block bg-white border border-slate-300 rounded-xl p-2.5 text-center mt-1 shadow-2xs">
                                      <span className="text-[10px] font-bold text-slate-600 block mb-1">
                                        {isArtSubject ? '🎨 Dessin / Croquis rattaché :' : '📐 Figure géométrique rattachée :'}
                                      </span>
                                      <img
                                        src={subDrawing}
                                        alt="Figure élève"
                                        className="max-h-40 max-w-full mx-auto border border-slate-200 rounded bg-white"
                                      />
                                      <div className="flex items-center justify-center gap-3 mt-1.5">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setDrawingModalTarget(subKey);
                                            setDrawingModalLabel(`Question ${exIdx + 1} - ${sub.label}`);
                                          }}
                                          className="text-[11px] text-purple-600 hover:text-purple-800 font-bold"
                                        >
                                          Modifier le tracé
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const next = { ...drawings };
                                            delete next[subKey];
                                            setDrawings(next);
                                          }}
                                          className="text-[11px] text-rose-600 hover:text-rose-800 font-bold"
                                        >
                                          Supprimer
                                        </button>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      /* ═══════════════════════════════════════════════════════════
                          CAS 2 : QUESTION UNIQUE SANS SOUS-QUESTIONS
                          Affichage classique avec son sous-aspect unique en rouge
                          ═══════════════════════════════════════════════════════════ */
                      <div className="space-y-4">
                        {/* 🔴 SOUS-ASPECT INDIVIDUEL EN ROUGE SOUS LA QUESTION */}
                        <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50/70 px-3 py-1.5 rounded-xl border border-red-200">
                          <span className="text-red-700 font-black">● {mainStrand.fullLabel}</span>
                        </div>

                        {/* TYPE QCM */}
                        {ex.type === 'multiple_choice' && (
                          <div className="space-y-2.5 pt-1">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                              Cochez la bonne réponse :
                            </label>
                            <div className="space-y-2">
                              {(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, optIdx) => {
                                const answerKey = `${activeAssessment.criterion}_${exIdx}`;
                                const currentAnswer = answers[answerKey] || '';
                                const isSelected = currentAnswer === opt;
                                return (
                                  <div
                                    key={optIdx}
                                    onClick={() => handleResponseChange(answerKey, opt)}
                                    className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                                      isSelected
                                        ? 'bg-purple-50 border-purple-600 text-purple-950 font-bold shadow-xs'
                                        : 'bg-white border-slate-200 hover:border-purple-200 text-slate-700'
                                    }`}
                                  >
                                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                                      isSelected ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300 bg-white'
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

                        {/* TYPE VRAI / FAUX */}
                        {ex.type === 'true_false' && (
                          <div className="space-y-3 pt-1">
                            <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                              Indiquez votre réponse :
                            </label>
                            <div className="grid grid-cols-2 gap-3 max-w-md">
                              {['Vrai', 'Faux'].map(option => {
                                const answerKey = `${activeAssessment.criterion}_${exIdx}`;
                                const currentAnswer = answers[answerKey] || '';
                                const isSelected = currentAnswer.startsWith(option);
                                return (
                                  <button
                                    key={option}
                                    type="button"
                                    onClick={() => handleResponseChange(answerKey, option)}
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
                          </div>
                        )}

                        {/* TYPE RÉDACTION LIBRE AVEC OUTILS MATHS & GÉOMÉTRIE OU ART */}
                        {(!ex.type || ex.type === 'open') && (
                          <div className="space-y-2">
                            {/* 📐 BARRE D'OUTILS MATHÉMATIQUES & GÉOMÉTRIE & ART */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-2 flex items-center justify-between flex-wrap gap-1.5 text-xs">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span className="text-[11px] font-bold text-slate-500 uppercase mr-1">
                                  {isArtSubject ? 'Art :' : 'Maths :'}
                                </span>
                                {MATH_SYMBOLS.map(item => (
                                  <button
                                    key={item.label}
                                    type="button"
                                    onClick={() => handleInsertMathSymbol(`${activeAssessment.criterion}_${exIdx}`, item.val)}
                                    className="px-2 py-1 bg-white hover:bg-purple-100 text-slate-700 hover:text-purple-800 border border-slate-200 rounded font-bold text-xs transition shadow-2xs"
                                    title={`Insérer ${item.label}`}
                                  >
                                    {item.label}
                                  </button>
                                ))}
                              </div>

                              {/* Bouton outil de tracé */}
                              <button
                                type="button"
                                onClick={() => {
                                  setDrawingModalTarget(`${activeAssessment.criterion}_${exIdx}`);
                                  setDrawingModalLabel(`Question ${exIdx + 1}`);
                                }}
                                className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
                                title="Ouvrir le studio de tracé (Équerre, Rapporteur, Compas ou Art)"
                              >
                                {isArtSubject ? <span>🎨 Studio de dessin & croquis</span> : <span>📐 Tracer une figure (Équerre, Compas)</span>}
                              </button>
                            </div>

                            {/* Zone de saisie directe */}
                            <textarea
                              id={`textarea_${activeAssessment.criterion}_${exIdx}`}
                              value={answers[`${activeAssessment.criterion}_${exIdx}`] || ''}
                              onChange={e => handleResponseChange(`${activeAssessment.criterion}_${exIdx}`, e.target.value)}
                              placeholder="Écrivez directement ici votre réponse rédigée et détaillée..."
                              rows={5}
                              className="w-full p-4 border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-sm outline-none transition leading-relaxed resize-y font-sans"
                            />

                            {/* Aperçu du tracé rattaché */}
                            {drawings[`${activeAssessment.criterion}_${exIdx}`] && (
                              <div className="relative inline-block bg-slate-50 border border-slate-300 rounded-xl p-2 text-center mt-2">
                                <span className="text-[10px] font-bold text-slate-600 block mb-1">
                                  {isArtSubject ? '🎨 Dessin / Croquis rattaché :' : '📐 Figure géométrique rattachée :'}
                                </span>
                                <img
                                  src={drawings[`${activeAssessment.criterion}_${exIdx}`]}
                                  alt="Tracé élève"
                                  className="max-h-48 max-w-full mx-auto border border-slate-200 rounded bg-white shadow-xs"
                                />
                                <div className="flex items-center justify-center gap-3 mt-1.5">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setDrawingModalTarget(`${activeAssessment.criterion}_${exIdx}`);
                                      setDrawingModalLabel(`Question ${exIdx + 1}`);
                                    }}
                                    className="text-[11px] text-purple-600 hover:text-purple-800 font-bold"
                                  >
                                    Modifier le tracé
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const next = { ...drawings };
                                      delete next[`${activeAssessment.criterion}_${exIdx}`];
                                      setDrawings(next);
                                    }}
                                    className="text-[11px] text-rose-600 hover:text-rose-800 font-bold"
                                  >
                                    Supprimer
                                  </button>
                                </div>
                              </div>
                            )}
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

      {/* ── MODALE GÉOMÉTRIQUE & ART (ÉQUERRE, RAPPORTEUR, COMPAS, COULEURS) ── */}
      {drawingModalTarget && (
        <GeometricDrawingModal
          isOpen={true}
          onClose={() => setDrawingModalTarget(null)}
          onSaveDrawing={handleSaveDrawing}
          initialDrawing={drawings[drawingModalTarget]}
          subject={evaluation.subject}
          questionLabel={drawingModalLabel}
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
                  <span className="text-slate-500 font-semibold">Questions répondues :</span>
                  <span className={`font-black ${answeredQuestionsCount === totalQuestionsCount ? 'text-green-600' : 'text-amber-600'}`}>
                    {answeredQuestionsCount} sur {totalQuestionsCount}
                  </span>
                </div>
              </div>

              {answeredQuestionsCount < totalQuestionsCount && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs text-amber-800 flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  <span>
                    Attention : Vous avez laissé <strong>{totalQuestionsCount - answeredQuestionsCount}</strong> question(s) ou sous-question(s) sans réponse.
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
