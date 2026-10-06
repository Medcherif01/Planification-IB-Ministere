import React, { useState, useEffect, useRef } from 'react';
import {
  Award, CheckCircle, Clock, FileText, LogOut, Printer, Send, ShieldCheck, User, AlertCircle,
  ChevronRight, Save, Image as ImageIcon, Check, Lock, AlertTriangle, Palette, Compass, Ruler,
  Square, Circle, Triangle, Edit3, Calculator, Layers, List, Keyboard
} from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, StudentAnswer, AssessmentExercise, AssessmentSubQuestion } from '../types';
import { getEvaluationByAccessCode, getStudentSubmission, submitStudentEvaluation, createOrUpdateEvaluation } from '../services/onlineEvaluationService';
import { fetchAllStudents, normalizeMatricule, normalizeGradeLabel } from '../services/studentRosterService';
import EvaluationPrintView from './EvaluationPrintView';
import GeometricDrawingModal from './GeometricDrawingModal';
import { ScientificCalculatorModal, MathSymbolsAndBracketsToolbar } from './ScientificCalculatorAndMathBar';
import { isEnglishSubject } from '../services/criterialQuestionGeneratorService';
import VirtualTabletKeyboard from './VirtualTabletKeyboard';
import RichExerciseContent from './RichExerciseContent';

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
  exerciseIndex: number,
  isEn: boolean = false
): { roman: string; description: string; fullLabel: string } {
  const prefix = isEn ? 'Strand' : 'Sous-aspect';
  if (exercise.strandIndex && exercise.strandText) {
    return {
      roman: exercise.strandIndex,
      description: exercise.strandText,
      fullLabel: `${prefix} (${exercise.strandIndex}) : ${exercise.strandText}`,
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
      fullLabel: `${prefix} (${roman})${desc ? ` : ${desc}` : ''}`,
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
      fullLabel: `${prefix} (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[exerciseIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullLabel: `${prefix} (${targetRoman}) : ${cleanFallback || (isEn ? `Criterion ${criterionLetter} Skill` : `Compétence ${criterionLetter}`)}`,
  };
}

// Helper: déterminer le sous-aspect spécifique pour une SOUS-QUESTION 1), 2), 3)...
function resolveStrandForSubQuestion(
  criterionLetter: string,
  strands: string[] = [],
  sub: AssessmentSubQuestion,
  subIndex: number,
  isEn: boolean = false
): { roman: string; description: string; fullLabel: string } {
  const prefix = isEn ? 'Strand' : 'Sous-aspect';
  if (sub.strandIndex && sub.strandText) {
    return {
      roman: sub.strandIndex,
      description: sub.strandText,
      fullLabel: `${prefix} (${sub.strandIndex}) : ${sub.strandText}`,
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
      fullLabel: `${prefix} (${targetRoman}) : ${cleanDesc}`,
    };
  }

  const fallback = strands[subIndex % Math.max(1, strands.length)] || '';
  const cleanFallback = fallback.replace(/^[ivx]+[\.\)]\s*/i, '').trim();
  return {
    roman: targetRoman,
    description: cleanFallback,
    fullLabel: `${prefix} (${targetRoman}) : ${cleanFallback || (isEn ? `Criterion ${criterionLetter} Skill` : `Compétence ${criterionLetter}`)}`,
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

  // Calculatrice scientifique & cible de saisie active
  const [isCalculatorOpen, setIsCalculatorOpen] = useState(false);
  const [activeTextareaKey, setActiveTextareaKey] = useState<string | null>(null);
  const [activeTextareaLabel, setActiveTextareaLabel] = useState<string>('');
  const [studentDisplayModeOverride, setStudentDisplayModeOverride] = useState<'full_page' | 'tabs' | null>(null);

  // Clavier virtuel tablette (Empêche le clavier natif de masquer la zone de saisie)
  const [isVirtualKeyboardOpen, setIsVirtualKeyboardOpen] = useState(false);
  const [isTabletModeNoNative, setIsTabletModeNoNative] = useState(false);

  // 45 min timer (calculé en temps réel pour rester actif durant la mise en veille)
  const [secondsRemaining, setSecondsRemaining] = useState<number>(45 * 60);
  const timerIntervalRef = useRef<any>(null);

  // Print view modal
  const [showPrintModal, setShowPrintModal] = useState(false);

  // Détection automatique si l'évaluation est en anglais
  const isEn = evaluation ? isEnglishSubject(evaluation.subject) : false;

  // Sécurité plein écran & surveillance anti-fraude
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [terminatedReason, setTerminatedReason] = useState<string | null>(null);
  const hasTriggeredViolationRef = useRef(false);
  const fullscreenEngagedRef = useRef(false);
  const examStartTimeRef = useRef(0);
  const answersRef = useRef(answers);
  const drawingsRef = useRef(drawings);
  const evaluationRef = useRef(evaluation);
  const studentNumberRef = useRef(studentNumber);
  const studentNameRef = useRef(studentName);
  const isLockedAlreadyRef = useRef(isLockedAlready);
  const isSubmittingRef = useRef(isSubmitting);
  const handleSubmitRef = useRef<((forceAutoSubmit?: boolean, reason?: string) => Promise<void>) | null>(null);

  useEffect(() => { answersRef.current = answers; }, [answers]);
  useEffect(() => { drawingsRef.current = drawings; }, [drawings]);
  useEffect(() => { evaluationRef.current = evaluation; }, [evaluation]);
  useEffect(() => { studentNumberRef.current = studentNumber; }, [studentNumber]);
  useEffect(() => { studentNameRef.current = studentName; }, [studentName]);
  useEffect(() => { isLockedAlreadyRef.current = isLockedAlready; }, [isLockedAlready]);
  useEffect(() => { isSubmittingRef.current = isSubmitting; }, [isSubmitting]);

  // Synchroniser le code d'accès si fourni par l'URL (ex: ?code=EVAL-1234-01)
  useEffect(() => {
    if (initialAccessCode) {
      setAccessCode(initialAccessCode.trim().toUpperCase());
    }
  }, [initialAccessCode]);

  // Reconnaissance automatique du nom de l'élève uniquement LORSQUE l'élève saisit son Matricule exact (le matricule n'est jamais pré-rempli)
  useEffect(() => {
    const cleanCode = accessCode.trim().toUpperCase();
    const enteredMat = normalizeMatricule(studentNumber);
    if (cleanCode.length < 4 || !enteredMat) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const evalData = await getEvaluationByAccessCode(cleanCode);
        if (cancelled || !evalData) return;
        const matchedInEval = evalData.studentAccessCodes?.find(
          sc => sc.studentNumber && normalizeMatricule(sc.studentNumber) === enteredMat
        );
        if (matchedInEval && matchedInEval.studentName) {
          setStudentName(matchedInEval.studentName);
          return;
        }
        const classStudents = await fetchAllStudents(normalizeGradeLabel(evalData.grade));
        if (cancelled) return;
        const matchedInRoster = classStudents.find(
          s => s.studentNumber && normalizeMatricule(s.studentNumber) === enteredMat
        );
        if (matchedInRoster && matchedInRoster.name) {
          setStudentName(matchedInRoster.name);
        }
      } catch {}
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [accessCode, studentNumber]);

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
      fullscreenEngagedRef.current = true;
    } catch (err) {
      console.warn('Mode plein écran :', err);
    }
  };

  // ⏱️ Gestion du chronomètre réel résistant à la mise en veille de l'ordinateur/tablette
  // RÈGLE : Si l'ordinateur se met en veille, l'évaluation NE se clôture PAS, mais le temps réel écoulé reste décompté !
  useEffect(() => {
    if (!evaluation || isLockedAlready || existingSubmission) return;

    const timerEndKey = `timer_end_${evaluation.accessCode}_${studentNumber}`;
    const initialDurationSec = evaluation.durationMinutes ? evaluation.durationMinutes * 60 : 45 * 60;

    let targetEndTime: number;
    const savedEndTime = localStorage.getItem(timerEndKey);
    const now = Date.now();

    if (savedEndTime && !isNaN(parseInt(savedEndTime, 10))) {
      targetEndTime = parseInt(savedEndTime, 10);
    } else {
      targetEndTime = now + initialDurationSec * 1000;
      try {
        localStorage.setItem(timerEndKey, targetEndTime.toString());
      } catch {}
    }

    const calcRemainingSeconds = (): number => {
      const diffSec = Math.round((targetEndTime - Date.now()) / 1000);
      return Math.max(0, diffSec);
    };

    const initialRem = calcRemainingSeconds();
    setSecondsRemaining(initialRem);

    if (initialRem <= 0) {
      handleSubmitEvaluation(true, "Temps total imparti écoulé.");
      return;
    }

    // Intervalle régulier d'actualisation de la pendule
    timerIntervalRef.current = setInterval(() => {
      const left = calcRemainingSeconds();
      setSecondsRemaining(left);
      if (left <= 0) {
        clearInterval(timerIntervalRef.current);
        handleSubmitEvaluation(true, "Temps imparti de l'évaluation écoulé.");
      }
    }, 1000);

    // ÉCOUTEUR VEILLE / SORTIE DE VEILLE :
    // Lorsque l'ordinateur se réveille de veille (visibilitychange / focus),
    // l'épreuve RESTE OUVERTE (ne se clôture pas), et le temps réel est recalculé avec exactitude.
    const handleSleepWakeSync = () => {
      const left = calcRemainingSeconds();
      setSecondsRemaining(left);
      autoSaveDraftAnswers(answers, drawings);
      if (left <= 0) {
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        handleSubmitEvaluation(true, "Temps imparti de l'évaluation écoulé.");
      }
    };

    document.addEventListener('visibilitychange', handleSleepWakeSync);
    window.addEventListener('focus', handleSleepWakeSync);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      document.removeEventListener('visibilitychange', handleSleepWakeSync);
      window.removeEventListener('focus', handleSleepWakeSync);
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
    let cleanNum = studentNumber.trim();
    let cleanName = studentName.trim();

    if (!cleanCode) {
      setLoginError('Veuillez saisir le code d\'accès fourni par votre enseignant.');
      return;
    }

    setIsValidating(true);
    try {
      // Vérifier d'abord si l'évaluation existe et si le code est nominatif
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

      if (!cleanNum) {
        setLoginError('❌ Accès refusé : Veuillez saisir votre N° d\'inscription / Matricule. L\'accès est bloqué sans matricule.');
        setIsValidating(false);
        return;
      }

      // Charger la liste officielle des élèves de la classe pour vérifier le matricule
      const normGrade = normalizeGradeLabel(evalData.grade);
      const classStudents = await fetchAllStudents(normGrade);
      const enteredMat = normalizeMatricule(cleanNum);
      const baseEvalCode = evalData.accessCode.trim().toUpperCase();

      // Vérifier si le matricule saisi figure dans la liste des matricules configurés par l'enseignant pour cette évaluation
      const matchedCodeByMat = evalData.studentAccessCodes?.find(
        sc => sc.studentNumber && normalizeMatricule(sc.studentNumber) === enteredMat
      );
      const matchedRosterByMat = classStudents.find(
        s => s.studentNumber && normalizeMatricule(s.studentNumber) === enteredMat
      );

      // Si un ancien code individuel spécifique (différent du code unique de la classe) a été saisi, vérifier qu'il correspond bien à ce matricule
      const legacyIndividualCode = cleanCode !== baseEvalCode
        ? evalData.studentAccessCodes?.find(sc => sc.code.trim().toUpperCase() === cleanCode)
        : undefined;

      if (legacyIndividualCode && legacyIndividualCode.studentNumber) {
        const expectedLegacyMat = normalizeMatricule(legacyIndividualCode.studentNumber);
        if (expectedLegacyMat && expectedLegacyMat !== enteredMat) {
          setLoginError(
            `❌ Accès refusé : Le N° d'inscription / Matricule saisi ("${cleanNum}") est incorrect${legacyIndividualCode.studentName ? ` pour ${legacyIndividualCode.studentName}` : ''}. Vous devez obligatoirement écrire votre matricule exact pour avoir accès.`
          );
          setIsValidating(false);
          return;
        }
      }

      // Vérification stricte : l'élève DOIT avoir écrit un matricule valide configuré par l'enseignant (ou présent dans la liste de classe)
      if (!matchedCodeByMat && !matchedRosterByMat) {
        setLoginError(
          `❌ Accès refusé : Le N° d'inscription / Matricule "${cleanNum}" est incorrect. Seuls les élèves dont le matricule a été enregistré par l'enseignant peuvent accéder à cette évaluation.`
        );
        setIsValidating(false);
        return;
      }

      const matchedStudentRecord = matchedCodeByMat || legacyIndividualCode;

      const officialName = matchedStudentRecord?.studentName || matchedRosterByMat?.name || '';
      if (!cleanName && officialName) {
        cleanName = officialName;
        setStudentName(cleanName);
      }

      if (!cleanName) {
        setLoginError('Veuillez saisir votre nom et prénom complets.');
        setIsValidating(false);
        return;
      }

      // Réinitialiser l'état local avant vérification
      setExistingSubmission(null);
      setIsLockedAlready(false);
      setTerminatedReason(null);

      // Vérifier sur le serveur si une copie existe actuellement pour cet élève
      // (Si l'enseignant a supprimé la copie de l'élève, prevSub sera null !)
      const prevSub = await getStudentSubmission(evalData.accessCode, cleanNum, evalData.id);
      const isRetakeAuthorized = Boolean(matchedStudentRecord && matchedStudentRecord.allowedRetake);
      const isRecordUsed = Boolean(matchedStudentRecord && matchedStudentRecord.isUsed && !matchedStudentRecord.allowedRetake);
      const isLocallyLocked = localStorage.getItem(`ib_locked_${evalData.accessCode}_${cleanNum}`) === 'true' ||
                              localStorage.getItem(`ib_locked_${cleanCode}_${cleanNum}`) === 'true' ||
                              localStorage.getItem(`ib_locked_${evalData.id}_${cleanNum}`) === 'true';

      // RÈGLE STRICTE DU BRIEF : Une fois qu'un élève a validé ou que sa copie a été envoyée (clôturée),
      // il ne pourra plus JAMAIS avoir accès à cette épreuve, SAUF si l'enseignant supprime sa copie envoyée
      // ou lui accorde un nouveau matricule.
      if ((prevSub || isRecordUsed || isLocallyLocked) && !isRetakeAuthorized) {
        setLoginError(
          `❌ Accès refusé : Votre copie pour l'évaluation "${evalData.title}" a déjà été transmise et clôturée.\n\nVous ne pouvez plus accéder à cette épreuve. Seul votre enseignant peut réinitialiser votre accès en supprimant votre copie envoyée ou en vous accordant un nouveau matricule.`
        );
        setIsValidating(false);
        return;
      }

      // Si aucune copie n'existe sur le serveur (jamais remise ou supprimée par l'enseignant) OU si un nouveau tour est autorisé :
      // on lève tout verrou local résiduel pour permettre à l'élève de composer une nouvelle copie !
      if (!prevSub || isRetakeAuthorized) {
        const lockKey1 = `ib_locked_${evalData.accessCode}_${cleanNum}`;
        const lockKey2 = `ib_locked_${cleanCode}_${cleanNum}`;
        const lockKey3 = `ib_locked_${evalData.id}_${cleanNum}`;
        const wasLocallyLocked = localStorage.getItem(lockKey1) === 'true' || localStorage.getItem(lockKey2) === 'true' || localStorage.getItem(lockKey3) === 'true';

        localStorage.removeItem(lockKey1);
        localStorage.removeItem(lockKey2);
        localStorage.removeItem(lockKey3);

        // Si l'élève avait déjà remis une copie et que l'enseignant l'a supprimée (ou réouverte), repartir sur une copie neuve
        if (wasLocallyLocked || isRetakeAuthorized) {
          localStorage.removeItem(`draft_eval_${evalData.accessCode}_${cleanNum}`);
          localStorage.removeItem(`draft_eval_${cleanCode}_${cleanNum}`);
          localStorage.removeItem(`draft_eval_${evalData.id}_${cleanNum}`);
          localStorage.removeItem(`timer_${evalData.accessCode}_${cleanNum}`);
          localStorage.removeItem(`timer_end_${evalData.accessCode}_${cleanNum}`);
          setAnswers({});
          setDrawings({});
        }
      }

      // 1. Sauvegarder l'identité permanente de l'élève
      localStorage.setItem('ib_permanent_matricule', cleanNum);
      localStorage.setItem('ib_permanent_student_name', cleanName);
      localStorage.setItem('ib_student_session', JSON.stringify({ accessCode: evalData.accessCode, studentNumber: cleanNum, studentName: cleanName }));

      // 4. Charger l'évaluation et le brouillon existant
      setEvaluation(evalData);
      const draftKey = `draft_eval_${evalData.accessCode}_${cleanNum}`;
      const savedDraft = localStorage.getItem(draftKey);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          if (parsed.answers) setAnswers(parsed.answers);
          if (parsed.drawings) setDrawings(parsed.drawings);
        } catch {}
      }

      // 5. Marquer uniquement le matricule de CET élève comme en cours d'utilisation / utilisé
      if (evalData.studentAccessCodes && evalData.studentAccessCodes.length > 0) {
        const hasMatch = evalData.studentAccessCodes.some(
          sc => sc.studentNumber && normalizeMatricule(sc.studentNumber) === enteredMat
        );
        if (hasMatch) {
          const updatedCodes = evalData.studentAccessCodes.map(sc => {
            if (sc.studentNumber && normalizeMatricule(sc.studentNumber) === enteredMat) {
              return {
                ...sc,
                studentName: sc.studentName || cleanName,
                studentNumber: sc.studentNumber || cleanNum,
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

  // Insertion de symboles mathématiques, parenthèses (), accolades {}, crochets [] dans le textarea ciblé
  const handleInsertMathSymbol = (key: string, symbol: string, cursorOffset?: number) => {
    if (isLockedAlready) return;
    setActiveTextareaKey(key);
    const textarea = document.getElementById(`textarea_${key}`) as HTMLTextAreaElement | null;
    const current = answers[key] || '';

    let updated = current;
    let newCursorPos = current.length + symbol.length + (cursorOffset || 0);

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = current.substring(start, end);

      // Si l'élève a sélectionné du texte et clique sur ( ), { }, [ ], | |, √( ), ∛( ), on entoure la sélection !
      if (selectedText && cursorOffset === -1 && symbol.length >= 2) {
        const openPart = symbol.slice(0, symbol.length - 1);
        const closePart = symbol.slice(symbol.length - 1);
        const wrapped = `${openPart}${selectedText}${closePart}`;
        updated = current.substring(0, start) + wrapped + current.substring(end);
        newCursorPos = start + wrapped.length;
      } else {
        updated = current.substring(0, start) + symbol + current.substring(end);
        newCursorPos = start + symbol.length + (cursorOffset || 0);
      }

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

  // ── SÉCURITÉ DE PASSATION & PROTECTION DU PROCESSUS D'EXAMEN ──
  const isTakingExam = Boolean(evaluation && !existingSubmission && !isLockedAlready);

  // Construction du payload de soumission synchronisé avec l'état le plus récent
  const buildSubmissionPayload = () => {
    const curEval = evaluationRef.current || evaluation;
    if (!curEval) return null;
    const curAnswers = answersRef.current;
    const curDrawings = drawingsRef.current;
    const curNum = (studentNumberRef.current || studentNumber).trim();
    const curName = (studentNameRef.current || studentName).trim();
    const isEnSubject = isEnglishSubject(curEval.subject);

    const formattedAnswers: StudentAnswer[] = [];

    (curEval.assessments || []).forEach(crit => {
      (crit.exercises || []).forEach((ex, exIdx) => {
        const mainKey = `${crit.criterion}_${exIdx}`;
        const strand = resolveStrandForQuestion(crit.criterion, crit.strands, ex, exIdx, isEnSubject);
        const subQuestions = getExerciseSubQuestions(ex, crit.criterion, crit.strands);

        let combinedResponse = '';
        const subAnswersMap: Record<string, { response: string; drawingDataUrl?: string }> = {};

        if (subQuestions.length > 0) {
          const parts: string[] = [];
          subQuestions.forEach((sub, sIdx) => {
            const subKey = `${crit.criterion}_${exIdx}_sub_${sIdx}`;
            const subResp = curAnswers[subKey] || '';
            const subDraw = curDrawings[subKey];
            const subId = sub.id || `sub_${sIdx + 1}`;
            subAnswersMap[subId] = {
              response: subResp,
              drawingDataUrl: subDraw,
            };
            parts.push(`${sub.label} ${subResp || '(Sans réponse)'}`);
          });
          combinedResponse = parts.join('\n\n');
        } else {
          combinedResponse = curAnswers[mainKey] || '';
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
          drawingDataUrl: curDrawings[mainKey],
          subAnswers: Object.keys(subAnswersMap).length > 0 ? subAnswersMap : undefined,
        });
      });
    });

    return {
      evaluationId: curEval.id,
      accessCode: curEval.accessCode,
      studentNumber: curNum,
      studentName: curName,
      isLocked: true,
      answers: formattedAnswers,
    };
  };

  // Envoi réseau immédiat lors de la fermeture de fenêtre/onglet (Beacon ou Fetch keepalive)
  const sendBeaconOrKeepaliveSubmission = () => {
    if (isLockedAlreadyRef.current) return;
    const payload = buildSubmissionPayload();
    if (!payload || !payload.studentNumber) return;

    const cleanNum = payload.studentNumber;
    const accessCode = payload.accessCode;

    // 1. Verrouillage local immédiat
    try {
      localStorage.setItem(`ib_locked_${accessCode}_${cleanNum}`, 'true');
      if (payload.evaluationId) {
        localStorage.setItem(`ib_locked_${payload.evaluationId}_${cleanNum}`, 'true');
      }
      localStorage.removeItem(`draft_eval_${accessCode}_${cleanNum}`);
      if (payload.evaluationId) {
        localStorage.removeItem(`draft_eval_${payload.evaluationId}_${cleanNum}`);
      }
      localStorage.removeItem(`timer_${accessCode}_${cleanNum}`);
      localStorage.removeItem(`timer_end_${accessCode}_${cleanNum}`);
    } catch {}

    const fullPayload: StudentSubmission = {
      ...payload,
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      submittedAt: new Date().toISOString(),
      status: 'submitted',
    };

    // 2. Sauvegarde locale de la soumission
    try {
      const raw = localStorage.getItem('ib_student_submissions');
      const existing = raw ? JSON.parse(raw) : [];
      const filtered = existing.filter((s: any) => !(s.evaluationId === fullPayload.evaluationId && s.studentNumber === cleanNum));
      filtered.unshift(fullPayload);
      localStorage.setItem('ib_student_submissions', JSON.stringify(filtered));
    } catch {}

    // 3. Transmission réseau synchrone/résistante à la fermeture
    try {
      const bodyStr = JSON.stringify(fullPayload);
      if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
        const blob = new Blob([bodyStr], { type: 'application/json' });
        navigator.sendBeacon('/api/online-evaluations?action=submit', blob);
      } else {
        fetch('/api/online-evaluations?action=submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: bodyStr,
          keepalive: true,
        }).catch(() => {});
      }
    } catch {}
  };

  useEffect(() => {
    handleSubmitRef.current = handleSubmitEvaluation;
  });

  // Gestion de la saisie au clavier virtuel pour tablette
  const handleVirtualInsertText = (text: string, cursorOffset = 0) => {
    if (!activeTextareaKey || isLockedAlready) return;
    const textarea = document.getElementById(`textarea_${activeTextareaKey}`) as HTMLTextAreaElement | null;
    const current = answers[activeTextareaKey] || '';
    let updated = current;
    let newCursorPos = current.length + text.length + cursorOffset;

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      updated = current.substring(0, start) + text + current.substring(end);
      newCursorPos = start + text.length + cursorOffset;

      setTimeout(() => {
        try {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        } catch {}
      }, 10);
    } else {
      updated = current + text;
    }

    handleResponseChange(activeTextareaKey, updated);
  };

  const handleVirtualBackspace = () => {
    if (!activeTextareaKey || isLockedAlready) return;
    const textarea = document.getElementById(`textarea_${activeTextareaKey}`) as HTMLTextAreaElement | null;
    const current = answers[activeTextareaKey] || '';
    if (!current) return;

    let updated = current;
    let newCursorPos = current.length - 1;

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      if (start !== end) {
        updated = current.substring(0, start) + current.substring(end);
        newCursorPos = start;
      } else if (start > 0) {
        updated = current.substring(0, start - 1) + current.substring(end);
        newCursorPos = start - 1;
      }

      setTimeout(() => {
        try {
          textarea.focus();
          textarea.setSelectionRange(newCursorPos, newCursorPos);
        } catch {}
      }, 10);
    } else {
      updated = current.slice(0, -1);
    }

    handleResponseChange(activeTextareaKey, updated);
  };

  // ── Surveillance stricte : Plein écran obligatoire & Fermeture du navigateur ──
  useEffect(() => {
    if (!isTakingExam) return;

    examStartTimeRef.current = Date.now();
    hasTriggeredViolationRef.current = false;

    // 1. Détection de statut plein écran :
    // SI L'ÉLÈVE SORT DU PLEIN ÉCRAN -> CLÔTURE & ENVOI AUTOMATIQUES IMMÉDIATS
    const handleFullscreenChange = () => {
      const activeFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      setIsFullscreen(activeFs);

      if (activeFs) {
        fullscreenEngagedRef.current = true;
      } else {
        // SORTIE DU PLEIN ÉCRAN DÉTECTÉE -> Clôture et envoi automatiques immédiats
        const elapsedSinceStart = Date.now() - examStartTimeRef.current;
        if (
          (fullscreenEngagedRef.current || elapsedSinceStart > 1000) &&
          !isLockedAlreadyRef.current &&
          !isSubmittingRef.current &&
          !hasTriggeredViolationRef.current
        ) {
          hasTriggeredViolationRef.current = true;
          console.warn('🚨 Sortie du mode plein écran détectée -> clôture et envoi automatiques de l\'évaluation.');
          handleSubmitRef.current?.(
            true,
            "Sortie du mode plein écran détectée. Conformément aux consignes de sécurité, votre évaluation a été automatiquement clôturée et votre copie a été transmise à votre enseignant."
          );
        }
      }
    };

    // 2. Bloquer le clic droit (menu contextuel)
    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      return false;
    };

    // 3. Bloquer les raccourcis clavier de navigation accidentelle
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        e.key === 'F11' ||
        e.key === 'F12' ||
        (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) ||
        (e.ctrlKey && (e.key === 'r' || e.key === 'R'))
      ) {
        e.preventDefault();
        e.stopPropagation();
      }
    };

    // 4. Fermeture du navigateur ou de l'onglet -> clôture et envoi automatiques immédiats
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isLockedAlreadyRef.current || isSubmittingRef.current || hasTriggeredViolationRef.current) return;
      hasTriggeredViolationRef.current = true;
      sendBeaconOrKeepaliveSubmission();
      handleSubmitRef.current?.(
        true,
        "Fermeture du navigateur détectée. Votre évaluation a été automatiquement clôturée et votre copie a été soumise."
      );
      e.preventDefault();
      e.returnValue = "L'évaluation est en cours. La fermeture du navigateur clôturera et soumettra automatiquement votre copie.";
      return e.returnValue;
    };

    const handlePageHide = () => {
      if (isLockedAlreadyRef.current || isSubmittingRef.current) return;
      sendBeaconOrKeepaliveSubmission();
    };

    // Vérifier l'état plein écran initial après court délai d'amorce
    const timer = setTimeout(() => {
      const isCurrentlyFs = Boolean(
        document.fullscreenElement ||
        (document as any).webkitFullscreenElement ||
        (document as any).mozFullScreenElement ||
        (document as any).msFullscreenElement
      );
      if (isCurrentlyFs) {
        fullscreenEngagedRef.current = true;
      }
    }, 2000);

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('msfullscreenchange', handleFullscreenChange);
    window.addEventListener('contextmenu', handleContextMenu);
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('msfullscreenchange', handleFullscreenChange);
      window.removeEventListener('contextmenu', handleContextMenu);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [isTakingExam]);

  // ── Soumission de la copie (avec verrouillage immédiat et définitif) ───────
  const handleSubmitEvaluation = async (forceAutoSubmit = false, reason = '') => {
    if (!evaluation || isSubmitting || isLockedAlready) return;

    if (reason) {
      setTerminatedReason(reason);
    }

    hasTriggeredViolationRef.current = true;
    setIsSubmitting(true);
    try {
      const curEval = evaluationRef.current || evaluation;
      const curAnswers = answersRef.current;
      const curDrawings = drawingsRef.current;
      const curNum = (studentNumberRef.current || studentNumber).trim();
      const curName = (studentNameRef.current || studentName).trim();
      const isEnSubject = isEnglishSubject(curEval.subject);

      const formattedAnswers: StudentAnswer[] = [];

      (curEval.assessments || []).forEach(crit => {
        (crit.exercises || []).forEach((ex, exIdx) => {
          const mainKey = `${crit.criterion}_${exIdx}`;
          const strand = resolveStrandForQuestion(crit.criterion, crit.strands, ex, exIdx, isEnSubject);
          const subQuestions = getExerciseSubQuestions(ex, crit.criterion, crit.strands);

          let combinedResponse = '';
          const subAnswersMap: Record<string, { response: string; drawingDataUrl?: string }> = {};

          if (subQuestions.length > 0) {
            const parts: string[] = [];
            subQuestions.forEach((sub, sIdx) => {
              const subKey = `${crit.criterion}_${exIdx}_sub_${sIdx}`;
              const subResp = curAnswers[subKey] || '';
              const subDraw = curDrawings[subKey];
              const subId = sub.id || `sub_${sIdx + 1}`;
              subAnswersMap[subId] = {
                response: subResp,
                drawingDataUrl: subDraw,
              };
              parts.push(`${sub.label} ${subResp || '(Sans réponse)'}`);
            });
            combinedResponse = parts.join('\n\n');
          } else {
            combinedResponse = curAnswers[mainKey] || '';
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
            drawingDataUrl: curDrawings[mainKey],
            subAnswers: Object.keys(subAnswersMap).length > 0 ? subAnswersMap : undefined,
          });
        });
      });

      const submission = await submitStudentEvaluation({
        evaluationId: curEval.id,
        accessCode: curEval.accessCode,
        studentNumber: curNum,
        studentName: curName,
        isLocked: true,
        answers: formattedAnswers,
      });

      // ── VERROUILLAGE DÉFINITIF DU MATRICULE DE L'ÉLÈVE ──
      const cleanNum = curNum;
      const enteredMat = normalizeMatricule(cleanNum);
      const cleanCode = curEval.accessCode.trim().toUpperCase();

      if (curEval.studentAccessCodes && curEval.studentAccessCodes.length > 0) {
        const updatedCodes = curEval.studentAccessCodes.map(sc => {
          if (sc.studentNumber && normalizeMatricule(sc.studentNumber) === enteredMat) {
            return {
              ...sc,
              isUsed: true,
              allowedRetake: false, // Usage unique consommé
              usedAt: new Date().toISOString(),
              studentName: sc.studentName || curName,
              studentNumber: sc.studentNumber || cleanNum,
            };
          }
          return sc;
        });

        createOrUpdateEvaluation({
          ...curEval,
          studentAccessCodes: updatedCodes,
        }).catch(err => console.warn('Erreur verrouillage matricule:', err));
      }

      // VERROUILLAGE DÉFINITIF EN LOCAL
      const lockKey = `ib_locked_${curEval.accessCode}_${cleanNum}`;
      localStorage.setItem(lockKey, 'true');
      localStorage.setItem(`ib_locked_${cleanCode}_${cleanNum}`, 'true');
      if (curEval.id) {
        localStorage.setItem(`ib_locked_${curEval.id}_${cleanNum}`, 'true');
      }
      localStorage.removeItem(`draft_eval_${curEval.accessCode}_${cleanNum}`);
      localStorage.removeItem(`draft_eval_${cleanCode}_${cleanNum}`);
      if (curEval.id) {
        localStorage.removeItem(`draft_eval_${curEval.id}_${cleanNum}`);
      }
      localStorage.removeItem(`timer_${curEval.accessCode}_${cleanNum}`);
      localStorage.removeItem(`timer_end_${curEval.accessCode}_${cleanNum}`);

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
                  N° d'inscription / Matricule obligatoire <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={studentNumber}
                  onChange={e => setStudentNumber(e.target.value)}
                  placeholder="Saisissez votre matricule exact (ex: PEI1-001)"
                  className="w-full px-4 py-2.5 bg-slate-50 border-2 border-slate-300 focus:border-purple-600 rounded-xl text-sm font-mono font-bold focus:outline-none transition"
                  required
                />
                <p className="text-[11px] text-rose-600 font-semibold mt-1">
                  🔒 Si le matricule saisi est incorrect, l'accès à l'évaluation sera refusé.
                </p>
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
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold">
              <Lock size={13} className="text-amber-700" />
              <span>Copie transmise · Accès clôturé</span>
            </span>
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
                setIsLockedAlready(false);
                onExit();
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
              title="Fermer la session de l'épreuve"
            >
              <LogOut size={14} /> Fermer la session
            </button>
            <button
              onClick={() => {
                setEvaluation(null);
                setExistingSubmission(null);
                setIsLockedAlready(false);
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
  // VUE 3 : PASSATION EN LIGNE BIEN ORGANISÉE (AVEC CALCULATRICE, PARENTHÈSES, ACCOLADES & MISE EN PAGE)
  // ═══════════════════════════════════════════════════════════════════════════
  const layout = evaluation.layoutConfig || {};
  const effectiveDisplayMode: 'full_page' | 'tabs' =
    studentDisplayModeOverride || layout.displayMode || 'full_page';
  const numberingStyle = layout.numberingStyle || 'continuous';
  const spacingMode = layout.spacing || 'normal';
  const headerStyle = layout.headerStyle || 'official_ib';
  const defaultRows = layout.answerBoxRows || 4;
  const showCalculator = (evaluation.allowCalculator !== undefined
    ? evaluation.allowCalculator
    : layout.showCalculator) !== false;
  const showMathToolbar = layout.showMathToolbar !== false;
  const showStrandBadges = layout.showStrandBadges !== false;
  const showPointsPerCriterion = layout.showPointsPerCriterion !== false;
  const showSummaryNav = layout.showSummaryNav !== false;

  const isTimeCritical = secondsRemaining <= 300; // < 5 minutes

  // Calcul de la numérotation continue des exercices sur toute l'évaluation
  const getGlobalExerciseNumber = (critIdx: number, exIdx: number): number => {
    if (numberingStyle === 'by_criterion') return exIdx + 1;
    let count = 0;
    for (let c = 0; c < critIdx; c++) {
      count += evaluation.assessments[c]?.exercises?.length || 0;
    }
    return count + exIdx + 1;
  };

  // Vérifier si un exercice est entièrement répondu
  const isExerciseAnswered = (crit: typeof evaluation.assessments[0], ex: AssessmentExercise, exIdx: number): boolean => {
    const subs = getExerciseSubQuestions(ex, crit.criterion, crit.strands);
    if (subs.length > 0) {
      return subs.every((_, sIdx) => {
        const k = `${crit.criterion}_${exIdx}_sub_${sIdx}`;
        return Boolean((answers[k] && answers[k].trim().length > 0) || drawings[k]);
      });
    }
    const k = `${crit.criterion}_${exIdx}`;
    return Boolean((answers[k] && answers[k].trim().length > 0) || drawings[k]);
  };

  const criteriaToRender =
    effectiveDisplayMode === 'full_page'
      ? evaluation.assessments.map((c, idx) => ({ crit: c, critIdx: idx }))
      : evaluation.assessments[activeCriterionIdx]
      ? [{ crit: evaluation.assessments[activeCriterionIdx], critIdx: activeCriterionIdx }]
      : [];

  return (
    <div className="min-h-screen bg-slate-100 text-slate-900 flex flex-col select-none">
      {/* 🚨 AVERTISSEMENT SÉCURITÉ PLEIN ÉCRAN */}
      {!isFullscreen && isTakingExam && (
        <div className="bg-rose-900 text-white px-4 py-2.5 flex items-center justify-between gap-3 text-xs shadow-md border-b border-rose-700">
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-amber-300 flex-shrink-0" />
            <span>
              <strong>Plein écran obligatoire :</strong> La sortie du plein écran ou la fermeture de la fenêtre entraînera la <strong>clôture et la soumission automatiques</strong> de votre copie.
            </span>
          </div>
          <button
            type="button"
            onClick={enterFullscreen}
            className="px-3.5 py-1.5 bg-amber-400 hover:bg-amber-300 text-rose-950 font-black rounded-xl text-xs transition shadow-md flex-shrink-0"
          >
            Activer le plein écran
          </button>
        </div>
      )}

      {/* ── TOP BAR STICKY AVEC CHRONO, CALCULATRICE, CLAVIER & PROGRESSION ── */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sticky top-0 z-30 shadow-xs">
        <div className="max-w-6xl mx-auto flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl flex items-center justify-center font-black flex-shrink-0 shadow">
              PEI
            </div>
            <div className="min-w-0">
              <h2 className="font-black text-sm text-slate-800 truncate">{evaluation.title}</h2>
              <p className="text-xs text-slate-500 truncate">
                Élève : <span className="font-semibold text-slate-700">{studentName}</span> (Matricule <span className="font-mono font-bold text-purple-800">{studentNumber}</span>) · {evaluation.subject} ({evaluation.grade})
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 sm:gap-2.5 flex-shrink-0 flex-wrap">
            {/* ⌨️ BOUTON CLAVIER TABLETTE VIRTUEL */}
            <button
              type="button"
              onClick={() => setIsVirtualKeyboardOpen(!isVirtualKeyboardOpen)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-xs transition ${
                isVirtualKeyboardOpen
                  ? 'bg-purple-700 text-white ring-2 ring-purple-300'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white'
              }`}
              title="Ouvrir le clavier tablette intégré (évite que le clavier de l'écran ne masque vos réponses)"
            >
              <Keyboard size={15} />
              <span>{isVirtualKeyboardOpen ? 'Clavier Actif' : 'Clavier Tablette'}</span>
            </button>

            {/* 🧮 BOUTON CALCULATRICE SCIENTIFIQUE (si autorisée par l'enseignant) */}
            {showCalculator ? (
              <button
                type="button"
                onClick={() => setIsCalculatorOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition"
                title="Ouvrir la calculatrice scientifique"
              >
                <Calculator size={15} />
                <span>Calculatrice</span>
              </button>
            ) : (
              <span
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 text-slate-400 rounded-xl text-xs font-bold border border-slate-200"
                title="Calculatrice non autorisée pour cette épreuve par l'enseignant"
              >
                <Calculator size={14} className="text-slate-400" />
                <span className="hidden sm:inline">Calculatrice non autorisée</span>
              </span>
            )}

            {/* Bascule Feuille complète / Par onglets */}
            <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200 text-[11px] font-bold">
              <button
                type="button"
                onClick={() => setStudentDisplayModeOverride('full_page')}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                  effectiveDisplayMode === 'full_page'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Afficher toute l'évaluation bien organisée sur une seule feuille"
              >
                <List size={12} />
                <span>Feuille complète</span>
              </button>
              <button
                type="button"
                onClick={() => setStudentDisplayModeOverride('tabs')}
                className={`px-2.5 py-1 rounded-lg transition flex items-center gap-1 ${
                  effectiveDisplayMode === 'tabs'
                    ? 'bg-white text-purple-900 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="Afficher critère par critère"
              >
                <Layers size={12} />
                <span>Par critère</span>
              </button>
            </div>

            {/* ⏱️ CHRONOMÈTRE */}
            <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-inner transition ${
              isTimeCritical
                ? 'bg-rose-100 text-rose-700 border border-rose-300 animate-pulse'
                : 'bg-purple-100 text-purple-900 border border-purple-200'
            }`}>
              <Clock size={14} className={isTimeCritical ? 'text-rose-600' : 'text-purple-600'} />
              <span>{formatTimeRemaining(secondsRemaining)}</span>
            </div>

            {/* Progression */}
            <div className="hidden md:flex items-center gap-1.5 bg-slate-100 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-700">
              <CheckCircle size={14} className={answeredQuestionsCount === totalQuestionsCount && totalQuestionsCount > 0 ? 'text-green-600' : 'text-purple-600'} />
              <span>{answeredQuestionsCount} / {totalQuestionsCount}</span>
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

      {/* ── CORPS DE L'ÉVALUATION BIEN STRUCTURÉ ── */}
      <main className={`max-w-5xl mx-auto w-full p-4 sm:p-6 flex-1 flex flex-col ${
        spacingMode === 'compact' ? 'space-y-4' : spacingMode === 'spacious' ? 'space-y-8' : 'space-y-6'
      } ${isVirtualKeyboardOpen ? 'pb-80 sm:pb-96' : 'pb-16'}`}>
        {/* 1. EN-TÊTE OFFICIEL DE L'ÉPREUVE & CONSIGNES GÉNÉRALES */}
        {headerStyle === 'official_ib' ? (
          <div className="bg-white rounded-3xl border-2 border-slate-300 shadow-xs overflow-hidden">
            <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 bg-white/10 px-2.5 py-0.5 rounded-md">
                  Les Écoles Internationales Al-Kawthar · Baccalauréat International (PEI)
                </span>
                <h1 className="text-lg sm:text-xl font-black mt-1 text-white">{evaluation.title}</h1>
              </div>
              <div className="flex items-center gap-2 flex-wrap text-xs">
                <span className="bg-white/15 px-3 py-1 rounded-xl font-bold text-purple-100">
                  📚 {evaluation.subject}
                </span>
                <span className="bg-white/15 px-3 py-1 rounded-xl font-bold text-purple-100">
                  🎓 {evaluation.grade}
                </span>
                <span className="bg-amber-400/20 border border-amber-300/40 px-3 py-1 rounded-xl font-black text-amber-200">
                  ⏱️ {evaluation.durationMinutes || 45} min
                </span>
              </div>
            </div>

            <div className="p-4 sm:p-5 bg-slate-50/70 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs border-b border-slate-200">
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Candidat(e) :</span>
                <span className="font-black text-slate-800 text-sm">{studentName}</span>
                <span className="block text-[11px] font-mono text-purple-700 font-bold mt-0.5">
                  Matricule : {studentNumber}
                </span>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Critères évalués :</span>
                <div className="flex items-center gap-1.5 flex-wrap mt-1">
                  {evaluation.assessments.map(a => {
                    const c = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                    return (
                      <span key={a.criterion} className={`px-2 py-0.5 rounded-md text-white font-black text-[11px] ${c.badge}`}>
                        Critère {a.criterion} ({a.maxPoints || 8} pts)
                      </span>
                    );
                  })}
                </div>
              </div>
              <div className="bg-white p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">Outils autorisés :</span>
                <div className="flex items-center gap-2 mt-1 flex-wrap text-[11px] font-bold text-slate-700">
                  {showCalculator ? (
                    <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">🧮 Calculatrice autorisée</span>
                  ) : (
                    <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">🚫 Calculatrice non autorisée</span>
                  )}
                  {showMathToolbar && <span className="text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200">( ) &#123; &#125; [ ] Symboles</span>}
                  <span className="text-purple-700 bg-purple-50 px-2 py-0.5 rounded border border-purple-200">📐 Géométrie / Croquis</span>
                </div>
              </div>
            </div>

            {(evaluation.statementOfInquiry || evaluation.instructions) && (
              <div className="p-4 sm:p-5 space-y-2.5 bg-white text-xs">
                {evaluation.statementOfInquiry && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-purple-50/70 border border-purple-200 rounded-xl p-3">
                    <div>
                      <span className="font-black uppercase text-[10px] text-purple-800 mr-2">
                        🔎 Énoncé de recherche :
                      </span>
                      <span className="italic font-semibold text-purple-950">"{evaluation.statementOfInquiry}"</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-purple-800 flex-shrink-0">
                      {evaluation.keyConcept && <span>Concept : <strong>{evaluation.keyConcept}</strong></span>}
                      {evaluation.globalContext && <span>· Contexte : <strong>{evaluation.globalContext}</strong></span>}
                    </div>
                  </div>
                )}
                {evaluation.instructions && (
                  <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-amber-950">
                    <span className="font-black uppercase text-[10px] text-amber-800 block mb-0.5">
                      📌 Consignes générales de l'évaluation :
                    </span>
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">{evaluation.instructions}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          evaluation.statementOfInquiry && (
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-4 rounded-2xl shadow-xs text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <span className="font-black uppercase tracking-wider text-purple-300 text-[10px] bg-purple-800/80 px-2 py-0.5 rounded mr-2">
                  Énoncé de recherche
                </span>
                <span className="italic text-purple-100 font-medium">"{evaluation.statementOfInquiry}"</span>
              </div>
              {evaluation.instructions && (
                <span className="text-purple-200 text-[11px]">{evaluation.instructions}</span>
              )}
            </div>
          )
        )}

        {/* 2. SOMMAIRE DE NAVIGATION RAPIDE DES EXERCICES */}
        {showSummaryNav && (
          <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mr-1">
                📋 Plan de l'évaluation :
              </span>
              {evaluation.assessments.map((crit, cIdx) => {
                const colors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
                return (crit.exercises || []).map((ex, eIdx) => {
                  const globalNum = getGlobalExerciseNumber(cIdx, eIdx);
                  const done = isExerciseAnswered(crit, ex, eIdx);
                  return (
                    <button
                      key={`${crit.criterion}_${eIdx}`}
                      type="button"
                      onClick={() => {
                        setActiveCriterionIdx(cIdx);
                        const el = document.getElementById(`eval_ex_${crit.criterion}_${eIdx}`);
                        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                      }}
                      className={`px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                        done
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-slate-50 border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50/50'
                      }`}
                    >
                      <span className={`w-4 h-4 rounded text-[10px] font-black text-white flex items-center justify-center ${colors.badge}`}>
                        {crit.criterion}
                      </span>
                      <span>Ex. {globalNum}</span>
                      {done && <Check size={12} className="text-emerald-600 stroke-[3]" />}
                    </button>
                  );
                });
              })}
            </div>
          </div>
        )}

        {/* Navigation par critères si mode Onglets ('tabs') */}
        {effectiveDisplayMode === 'tabs' && (
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
                  <span>Critère {crit.criterion} — {crit.criterionName}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-slate-100 text-slate-600">
                    {critExercisesCount} exercice(s)
                  </span>
                </button>
              );
            })}
          </div>
        )}

        {/* 3. LISTE STRUCTURÉE DES CRITÈRES ET EXERCICES */}
        <div className={spacingMode === 'compact' ? 'space-y-5' : spacingMode === 'spacious' ? 'space-y-10' : 'space-y-8'}>
          {criteriaToRender.map(({ crit: activeAssessment, critIdx }) => {
            const activeColors = CRITERION_COLORS[activeAssessment.criterion] || CRITERION_COLORS.A;

            return (
              <section
                key={activeAssessment.criterion}
                className={spacingMode === 'compact' ? 'space-y-4' : 'space-y-6'}
              >
                {/* Bannière de section du Critère */}
                <div className={`rounded-2xl p-4 sm:p-5 border-2 ${activeColors.border} ${activeColors.bg} shadow-2xs`}>
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${activeColors.badge} text-white font-black text-base flex items-center justify-center shadow-xs`}>
                        {activeAssessment.criterion}
                      </div>
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${activeColors.light} ${activeColors.text}`}>
                          Critère {activeAssessment.criterion} · Objectif PEI
                        </span>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                          {activeAssessment.criterionName}
                        </h3>
                      </div>
                    </div>

                    {showPointsPerCriterion && (
                      <span className={`text-xs font-black px-3.5 py-1.5 rounded-xl border ${activeColors.border} bg-white ${activeColors.text}`}>
                        Barème : Niveau 1 à {activeAssessment.maxPoints || 8}
                      </span>
                    )}
                  </div>
                </div>

                {/* Exercices / Tâches du critère */}
                <div className={spacingMode === 'compact' ? 'space-y-4' : spacingMode === 'spacious' ? 'space-y-8' : 'space-y-6'}>
                  {(activeAssessment.exercises || []).map((ex, exIdx) => {
                    const subQuestions = getExerciseSubQuestions(ex, activeAssessment.criterion, activeAssessment.strands);
                    const hasSubQuestions = subQuestions.length > 0;
                    const mainStrand = resolveStrandForQuestion(activeAssessment.criterion, activeAssessment.strands, ex, exIdx, isEn);
                    const exerciseNum = getGlobalExerciseNumber(critIdx, exIdx);
                    const exDone = isExerciseAnswered(activeAssessment, ex, exIdx);

                    return (
                      <div
                        id={`eval_ex_${activeAssessment.criterion}_${exIdx}`}
                        key={exIdx}
                        className={`bg-white rounded-3xl ${
                          spacingMode === 'compact' ? 'p-4 sm:p-5 space-y-4' : spacingMode === 'spacious' ? 'p-7 sm:p-8 space-y-6' : 'p-6 sm:p-7 space-y-5'
                        } border-2 ${exDone ? 'border-emerald-300/80' : 'border-slate-200'} shadow-sm hover:border-purple-300 transition`}
                      >
                        {/* En-tête de l'exercice */}
                        <div className="flex items-center justify-between border-b-2 border-slate-100 pb-3.5 flex-wrap gap-2">
                          <div className="flex items-center gap-3">
                            <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black text-white shadow-2xs ${activeColors.badge}`}>
                              Exercice {exerciseNum}
                            </span>
                            <h4 className="font-black text-base sm:text-lg text-slate-900">
                              {ex.title || `Exercice ${exerciseNum}`}
                            </h4>
                          </div>
                          <div className="flex items-center gap-2">
                            {exDone && (
                              <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-full flex items-center gap-1">
                                <Check size={12} /> Répondu
                              </span>
                            )}
                            <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                              {hasSubQuestions
                                ? `${subQuestions.length} sous-questions`
                                : ex.type === 'multiple_choice' ? '☑️ QCM' : ex.type === 'true_false' ? '⚖️ Vrai / Faux' : '📝 Rédaction & Calculs'}
                            </span>
                          </div>
                        </div>

                        {/* OEUVRE D'ART / PHOTO / SCHÉMA SI PRÉSENT */}
                        {ex.imageUrl && (
                          <div className="my-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                            <img
                              src={ex.imageUrl}
                              alt={ex.imageCaption || 'Illustration'}
                              className="max-h-64 max-w-full mx-auto object-contain rounded-xl shadow-xs"
                            />
                            {ex.imageCaption && (
                              <p className="text-xs text-slate-600 italic mt-2 font-medium">
                                🖼️ {ex.imageCaption}
                              </p>
                            )}
                          </div>
                        )}

                        {/* Énoncé global / Contexte de l'exercice */}
                        {ex.content && (
                          <div className="bg-slate-50/90 p-4 rounded-2xl border border-slate-200/80">
                            <RichExerciseContent content={ex.content} />
                          </div>
                        )}

                        {/* ═══════════════════════════════════════════════════════════
                            CAS 1 : L'EXERCICE CONTIENT DES SOUS-QUESTIONS 1), 2), 3)...
                            ═══════════════════════════════════════════════════════════ */}
                        {hasSubQuestions ? (
                          <div className="space-y-5 pt-1">
                            <div className="text-xs font-black uppercase tracking-wider text-purple-900 flex items-center gap-2 bg-purple-50 px-3 py-1.5 rounded-xl border border-purple-100 w-fit">
                              <span>📋</span>
                              <span>Questions à traiter dans l'ordre ({subQuestions.length}) :</span>
                            </div>

                            {subQuestions.map((sub, sIdx) => {
                              const subKey = `${activeAssessment.criterion}_${exIdx}_sub_${sIdx}`;
                              const subAnswer = answers[subKey] || '';
                              const subDrawing = drawings[subKey];
                              const subStrand = resolveStrandForSubQuestion(activeAssessment.criterion, activeAssessment.strands, sub, sIdx, isEn);
                              const subQType = sub.type || ex.type || 'open';

                              return (
                                <div
                                  key={sub.id || sIdx}
                                  className="bg-slate-50/60 border-2 border-slate-200/90 rounded-2xl p-4 sm:p-5 space-y-3.5 hover:border-purple-300 transition"
                                >
                                  {/* Intitulé de la sous-question */}
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-baseline gap-2.5">
                                      <span className="font-black text-sm text-white bg-purple-700 px-2.5 py-0.5 rounded-lg flex-shrink-0 shadow-2xs">
                                        {sub.label || `${sIdx + 1})`}
                                      </span>
                                      <div className="font-bold text-sm sm:text-base text-slate-900 leading-snug">
                                        <RichExerciseContent content={sub.content || `Sous-question ${sIdx + 1}`} />
                                      </div>
                                    </div>
                                    <span className="text-[11px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded-md border border-slate-200 flex-shrink-0">
                                      {subQType === 'multiple_choice' ? '☑️ QCM' : subQType === 'true_false' ? '⚖️ Vrai/Faux' : '📝 Rédaction'}
                                    </span>
                                  </div>

                                  {/* 🔴 SOUS-ASPECT INDIVIDUEL EN ROUGE */}
                                  {showStrandBadges && (
                                    <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                                      <span className="text-red-700 font-black">● {subStrand.fullLabel}</span>
                                    </div>
                                  )}

                                  {/* A. QCM */}
                                  {subQType === 'multiple_choice' && (
                                    <div className="space-y-2 pt-1">
                                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                                        Cochez la bonne réponse :
                                      </label>
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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

                                  {/* C. RÉDACTION LIBRE AVEC PARENTHÈSES (), ACCOLADES {}, CROCHETS [], CALCULATRICE & GÉOMÉTRIE */}
                                  {subQType === 'open' && (
                                    <div className="space-y-2 pt-1">
                                      {showMathToolbar && (
                                        <MathSymbolsAndBracketsToolbar
                                          targetKey={subKey}
                                          onInsertSymbol={handleInsertMathSymbol}
                                          showCalculatorButton={showCalculator}
                                          onOpenCalculator={() => {
                                            setActiveTextareaKey(subKey);
                                            setActiveTextareaLabel(`Ex. ${exerciseNum} - ${sub.label || sIdx + 1}`);
                                            setIsCalculatorOpen(true);
                                          }}
                                          onOpenVirtualKeyboard={() => {
                                            setActiveTextareaKey(subKey);
                                            setActiveTextareaLabel(`Ex. ${exerciseNum} - ${sub.label || sIdx + 1}`);
                                            setIsVirtualKeyboardOpen(true);
                                          }}
                                          onOpenDrawingStudio={() => {
                                            setDrawingModalTarget(subKey);
                                            setDrawingModalLabel(`Exercice ${exerciseNum} - ${sub.label}`);
                                          }}
                                          isArtSubject={isArtSubject}
                                          compact
                                        />
                                      )}

                                      <textarea
                                        id={`textarea_${subKey}`}
                                        value={subAnswer}
                                        inputMode={isTabletModeNoNative ? 'none' : undefined}
                                        onFocus={() => {
                                          setActiveTextareaKey(subKey);
                                          setActiveTextareaLabel(`Ex. ${exerciseNum} - ${sub.label || sIdx + 1}`);
                                          setTimeout(() => {
                                            const el = document.getElementById(`textarea_${subKey}`);
                                            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                          }, 80);
                                        }}
                                        onChange={e => handleResponseChange(subKey, e.target.value)}
                                        placeholder={`Rédigez votre réponse ou vos calculs pour la question ${sub.label || sIdx + 1}...`}
                                        rows={sub.expectedLines || defaultRows}
                                        className="w-full p-3.5 bg-white border-2 border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-sm outline-none transition font-sans leading-relaxed"
                                      />

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
                                                setDrawingModalLabel(`Exercice ${exerciseNum} - ${sub.label}`);
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
                              ═══════════════════════════════════════════════════════════ */
                          <div className="space-y-4">
                            {showStrandBadges && (
                              <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50/70 px-3 py-1.5 rounded-xl border border-red-200">
                                <span className="text-red-700 font-black">● {mainStrand.fullLabel}</span>
                              </div>
                            )}

                            {/* TYPE QCM */}
                            {ex.type === 'multiple_choice' && (
                              <div className="space-y-2.5 pt-1">
                                <label className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                                  Cochez la bonne réponse :
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                  {(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, optIdx) => {
                                    const answerKey = `${activeAssessment.criterion}_${exIdx}`;
                                    const currentAnswer = answers[answerKey] || '';
                                    const isSelected = currentAnswer === opt;
                                    return (
                                      <div
                                        key={optIdx}
                                        onClick={() => handleResponseChange(answerKey, opt)}
                                        className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
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

                            {/* TYPE RÉDACTION LIBRE AVEC PARENTHÈSES (), ACCOLADES {}, CROCHETS [], CALCULATRICE & GÉOMÉTRIE */}
                            {(!ex.type || ex.type === 'open') && (
                              <div className="space-y-2.5">
                                {showMathToolbar && (
                                  <MathSymbolsAndBracketsToolbar
                                    targetKey={`${activeAssessment.criterion}_${exIdx}`}
                                    onInsertSymbol={handleInsertMathSymbol}
                                    showCalculatorButton={showCalculator}
                                    onOpenCalculator={() => {
                                      setActiveTextareaKey(`${activeAssessment.criterion}_${exIdx}`);
                                      setActiveTextareaLabel(`Exercice ${exerciseNum}`);
                                      setIsCalculatorOpen(true);
                                    }}
                                    onOpenVirtualKeyboard={() => {
                                      setActiveTextareaKey(`${activeAssessment.criterion}_${exIdx}`);
                                      setActiveTextareaLabel(`Exercice ${exerciseNum}`);
                                      setIsVirtualKeyboardOpen(true);
                                    }}
                                    onOpenDrawingStudio={() => {
                                      setDrawingModalTarget(`${activeAssessment.criterion}_${exIdx}`);
                                      setDrawingModalLabel(`Exercice ${exerciseNum}`);
                                    }}
                                    isArtSubject={isArtSubject}
                                  />
                                )}

                                <textarea
                                  id={`textarea_${activeAssessment.criterion}_${exIdx}`}
                                  value={answers[`${activeAssessment.criterion}_${exIdx}`] || ''}
                                  inputMode={isTabletModeNoNative ? 'none' : undefined}
                                  onFocus={() => {
                                    setActiveTextareaKey(`${activeAssessment.criterion}_${exIdx}`);
                                    setActiveTextareaLabel(`Exercice ${exerciseNum}`);
                                    setTimeout(() => {
                                      const el = document.getElementById(`textarea_${activeAssessment.criterion}_${exIdx}`);
                                      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                    }, 80);
                                  }}
                                  onChange={e => handleResponseChange(`${activeAssessment.criterion}_${exIdx}`, e.target.value)}
                                  placeholder="Écrivez directement ici votre réponse rédigée, vos formules et vos calculs..."
                                  rows={ex.expectedLines || defaultRows + 1}
                                  className="w-full p-4 border-2 border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-sm outline-none transition leading-relaxed resize-y font-sans"
                                />

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
                                          setDrawingModalLabel(`Exercice ${exerciseNum}`);
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
              </section>
            );
          })}
        </div>

        {/* Navigation bas de page */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-200">
          {effectiveDisplayMode === 'tabs' ? (
            <>
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
            </>
          ) : (
            <div className="w-full flex items-center justify-between bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
              <div className="text-xs text-slate-600">
                Progression : <strong className="text-purple-800">{answeredQuestionsCount} / {totalQuestionsCount}</strong> question(s) répondue(s)
              </div>
              <button
                onClick={() => setShowConfirmSubmit(true)}
                className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white rounded-xl text-xs font-black shadow-lg transition flex items-center gap-2"
              >
                <Send size={15} /> Vérifier & Soumettre ma copie
              </button>
            </div>
          )}
        </div>
      </main>

      {/* ── MODALE CALCULATRICE SCIENTIFIQUE & STANDARD (si autorisée) ── */}
      {showCalculator && (
        <ScientificCalculatorModal
          isOpen={isCalculatorOpen}
          onClose={() => setIsCalculatorOpen(false)}
          activeTargetLabel={activeTextareaLabel}
          onInsertText={(txt) => {
            if (activeTextareaKey) {
              handleInsertMathSymbol(activeTextareaKey, txt);
            }
          }}
        />
      )}

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
      {/* ⌨️ CLAVIER VIRTUEL TABLETTE INTÉGRÉ */}
      <VirtualTabletKeyboard
        isOpen={isVirtualKeyboardOpen}
        onClose={() => setIsVirtualKeyboardOpen(false)}
        activeInputKey={activeTextareaKey}
        activeInputLabel={activeTextareaLabel}
        onInsertText={handleVirtualInsertText}
        onBackspace={handleVirtualBackspace}
        isTabletModeNoNativeKeyboard={isTabletModeNoNative}
        onToggleTabletMode={setIsTabletModeNoNative}
      />
    </div>
  );
};

export default StudentEvaluationPortal;
