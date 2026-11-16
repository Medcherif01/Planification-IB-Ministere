import React, { useState, useEffect } from 'react';
import {
  X, Eye, Sliders, ArrowUp, ArrowDown, Edit3, Plus, Trash2, Check, Sparkles,
  Calculator, CheckCircle, Save, Printer, Copy, FileText, Image as ImageIcon,
  Volume2, Video, FolderOpen, Share2, ArrowLeft, Settings, HelpCircle, Layers,
  GripVertical, Loader2, ExternalLink, BookOpen
} from 'lucide-react';
import {
  OnlineEvaluation,
  EvaluationLayoutConfig,
  AssessmentExercise,
  AssessmentSubQuestion,
  AssessmentData,
} from '../types';
import { ScientificCalculatorModal, MathSymbolsAndBracketsToolbar } from './ScientificCalculatorAndMathBar';
import { isEnglishSubject, GenerateQuestionOptions } from '../services/criterialQuestionGeneratorService';
import GenerateCriterialQuestionModal from './GenerateCriterialQuestionModal';
import EvaluationPrintView from './EvaluationPrintView';
import RichExerciseContent from './RichExerciseContent';
import InteractiveExerciseWidgets from './InteractiveExerciseWidgets';
import { resolveArtworkOrImage, convertGoogleDriveUrl } from '../services/artworkService';
import { extractGoogleDriveId } from '../services/studentRosterService';
import { normalizeEvaluationForCleanDisplay } from '../services/onlineEvaluationService';
import { getCriteriaSync, getStandardIBCriterion } from '../services/ibCriteriaService';
import {
  generateDiagramOrMapWithGeminiAI,
  generateNanoBananaPhotosForAssessments,
  NANO_BANANA_VISUAL_STYLES,
  NanoBananaVisualStyle,
  stripHtmlTags,
} from '../services/educationalDiagramService';

interface StudentViewLayoutEditorModalProps {
  evaluation: OnlineEvaluation;
  isOpen?: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSave?: (updated: OnlineEvaluation) => Promise<void> | void;
  onSaveEvaluation?: (updated: OnlineEvaluation) => Promise<void> | void;
  onOpenDetailedQuestionEditor?: (updated: OnlineEvaluation, criterionIdx?: number) => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; light: string; headerBg: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',    badge: 'bg-blue-600',    light: 'bg-blue-100',    headerBg: 'bg-indigo-50/90' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', light: 'bg-emerald-100', headerBg: 'bg-emerald-50/90' },
  C: { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',   badge: 'bg-amber-600',   light: 'bg-amber-100',   headerBg: 'bg-amber-50/90' },
  D: { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-800',    badge: 'bg-rose-600',    light: 'bg-rose-100',    headerBg: 'bg-rose-50/90' },
};

const ROMAN_NUMERALS = ['i', 'ii', 'iii', 'iv', 'v'];

type LeftNavSection = 'general' | 'instructions' | 'exercises' | 'rubric';
type ActiveMediaTab = 'none' | 'document' | 'image_ai' | 'image_drive' | 'audio' | 'video' | 'interactive';

const StudentViewLayoutEditorModal: React.FC<StudentViewLayoutEditorModalProps> = ({
  evaluation,
  isOpen = true,
  isSaving = false,
  onClose,
  onSave,
  onSaveEvaluation,
  onOpenDetailedQuestionEditor,
}) => {
  const [draftEval, setDraftEval] = useState<OnlineEvaluation>(() =>
    normalizeEvaluationForCleanDisplay(JSON.parse(JSON.stringify(evaluation)))
  );
  // 'studio' = Nouvelle interface organisée 3 colonnes (comme l'image de référence)
  // 'pure_student' = Aperçu Feuille d'Examen Élève complète et interactive
  const [viewMode, setViewMode] = useState<'studio' | 'pure_student'>('studio');
  const [leftSection, setLeftSection] = useState<LeftNavSection>('exercises');
  const [activeCriterionIdx, setActiveCriterionIdx] = useState<number>(0);
  const [activeExerciseIdx, setActiveExerciseIdx] = useState<number>(0);
  const [editingSubIdx, setEditingSubIdx] = useState<number | null>(null);
  const [isEditingMainPrompt, setIsEditingMainPrompt] = useState<boolean>(false);
  const [activeMediaTab, setActiveMediaTab] = useState<ActiveMediaTab>('none');

  const [savingInternal, setSavingInternal] = useState<boolean>(false);
  const [saveSuccess, setSaveSuccess] = useState<boolean>(false);
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [showPublishModal, setShowPublishModal] = useState<boolean>(false);
  const [copiedLinkType, setCopiedLinkType] = useState<string | null>(null);

  // Génération IA de Document / Texte support
  const [docAiPrompt, setDocAiPrompt] = useState<string>('');
  const [docAiType, setDocAiType] = useState<'article' | 'historical_source' | 'scientific_data' | 'literary_text' | 'case_study'>('article');
  const [isGeneratingDocAi, setIsGeneratingDocAi] = useState<boolean>(false);

  // État pour tester l'interface comme un élève (calculatrice, réponses, parenthèses/accolades)
  const [testAnswers, setTestAnswers] = useState<Record<string, string>>({});
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [activeTextareaKey, setActiveTextareaKey] = useState<string | null>(null);
  const [activeTextareaLabel, setActiveTextareaLabel] = useState<string>('');

  // Modale IA intégrée
  const [aiModalTarget, setAiModalTarget] = useState<{
    critIdx: number;
    exIdx: number | null;
    initialStrand: string;
    initialType: GenerateQuestionOptions['questionType'];
  } | null>(null);
  const [geminiDiagramPromptMap, setGeminiDiagramPromptMap] = useState<Record<string, string>>({});
  const [geminiDiagramStyleMap, setGeminiDiagramStyleMap] = useState<Record<string, NanoBananaVisualStyle>>({});
  const [isGeneratingDiagramKey, setIsGeneratingDiagramKey] = useState<string | null>(null);
  const [isBatchGeneratingPhotos, setIsBatchGeneratingPhotos] = useState<boolean>(false);
  const [batchPhotoProgress, setBatchPhotoProgress] = useState<string>('');

  useEffect(() => {
    if (evaluation) {
      const normalized = normalizeEvaluationForCleanDisplay(JSON.parse(JSON.stringify(evaluation)));
      // S'assurer que les critères utilisent bien les objectifs et sous-aspects officiels de la matière et de la classe
      const savedCriteria = getCriteriaSync(normalized.subject, normalized.grade);
      normalized.assessments = (normalized.assessments || []).map(crit => {
        const letter = (crit.criterion || 'A') as 'A' | 'B' | 'C' | 'D';
        const customCrit = savedCriteria?.criteria?.find(c => c.criterion === letter);
        const stdCrit = getStandardIBCriterion(normalized.subject, letter);
        return {
          ...crit,
          criterionName: crit.criterionName || customCrit?.criterionName || stdCrit.name,
          strands: (crit.strands && crit.strands.length > 0)
            ? crit.strands
            : (customCrit?.strands && customCrit.strands.length > 0 ? [...customCrit.strands] : [...stdCrit.strands]),
        };
      });
      setDraftEval(normalized);
    }
  }, [evaluation]);

  if (!isOpen) return null;

  const isEn = isEnglishSubject(draftEval.subject);

  const layout: EvaluationLayoutConfig = {
    displayMode: 'full_page',
    numberingStyle: 'continuous',
    spacing: 'normal',
    headerStyle: 'official_ib',
    answerBoxRows: 4,
    showCalculator: true,
    showMathToolbar: true,
    showStrandBadges: true,
    showPointsPerCriterion: true,
    showSummaryNav: true,
    ...(draftEval.layoutConfig || {}),
  };

  const updateLayout = (patch: Partial<EvaluationLayoutConfig>) => {
    setDraftEval(prev => ({
      ...prev,
      allowCalculator: patch.showCalculator !== undefined ? patch.showCalculator : prev.allowCalculator,
      layoutConfig: {
        ...layout,
        ...patch,
      },
    }));
  };

  // Liste aplatie de tous les exercices pour la colonne de gauche
  const allFlatExercises: {
    critIdx: number;
    exIdx: number;
    globalNum: number;
    criterion: string;
    criterionName: string;
    exercise: AssessmentExercise;
  }[] = [];

  (draftEval.assessments || []).forEach((crit, cIdx) => {
    (crit.exercises || []).forEach((ex, eIdx) => {
      allFlatExercises.push({
        critIdx: cIdx,
        exIdx: eIdx,
        globalNum: allFlatExercises.length + 1,
        criterion: crit.criterion,
        criterionName: crit.criterionName,
        exercise: ex,
      });
    });
  });

  // Garantir que les index sélectionnés sont valides
  const safeCritIdx = Math.min(Math.max(0, activeCriterionIdx), Math.max(0, (draftEval.assessments?.length || 1) - 1));
  const activeCrit: AssessmentData | undefined = draftEval.assessments?.[safeCritIdx];
  const safeExIdx = Math.min(Math.max(0, activeExerciseIdx), Math.max(0, (activeCrit?.exercises?.length || 1) - 1));
  const activeEx: AssessmentExercise | undefined = activeCrit?.exercises?.[safeExIdx];

  // Obtenir les sous-aspects officiels pour le critère actif (spécifiques à la matière et à la classe)
  const getOfficialStrandsForCriterion = (criterionLetter: string): { roman: string; text: string; full: string }[] => {
    const letter = (criterionLetter || 'A') as 'A' | 'B' | 'C' | 'D';
    const critInEval = draftEval.assessments.find(a => a.criterion === letter);
    const savedCriteria = getCriteriaSync(draftEval.subject, draftEval.grade);
    const savedCritObj = savedCriteria?.criteria?.find(c => c.criterion === letter);
    const stdCrit = getStandardIBCriterion(draftEval.subject, letter);

    const rawStrands =
      (critInEval?.strands && critInEval.strands.length > 0)
        ? critInEval.strands
        : (savedCritObj?.strands && savedCritObj.strands.length > 0)
        ? savedCritObj.strands
        : stdCrit.strands;

    return rawStrands.map((s, idx) => {
      const roman = ROMAN_NUMERALS[idx] || `s${idx + 1}`;
      const cleanDesc = stripHtmlTags(s).replace(/^[ivx]+[\.\)\s:-]+/i, '').trim();
      return {
        roman,
        text: cleanDesc,
        full: `${roman}. ${cleanDesc}`,
      };
    });
  };

  const activeOfficialStrands = activeCrit ? getOfficialStrandsForCriterion(activeCrit.criterion) : [];

  const getGlobalExerciseNumber = (critIdx: number, exIdx: number): number => {
    if (layout.numberingStyle === 'by_criterion') return exIdx + 1;
    let count = 0;
    for (let c = 0; c < critIdx; c++) {
      count += draftEval.assessments[c]?.exercises?.length || 0;
    }
    return count + exIdx + 1;
  };

  const handleTriggerSave = async () => {
    const saveFn = onSave || onSaveEvaluation;
    if (!saveFn) return;
    setSavingInternal(true);
    setSaveSuccess(false);
    try {
      await saveFn(draftEval);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3500);
    } catch (err: any) {
      alert(`Erreur lors de l'enregistrement : ${err?.message || 'Impossible de sauvegarder'}`);
    } finally {
      setSavingInternal(false);
    }
  };

  const handleBatchGenerateNanoPhotos = async () => {
    if (isBatchGeneratingPhotos) return;
    setIsBatchGeneratingPhotos(true);
    setBatchPhotoProgress('Analyse des exercices…');
    try {
      const { updatedAssessments } = await generateNanoBananaPhotosForAssessments({
        subject: draftEval.subject || '',
        gradeLevel: draftEval.grade || '',
        unitTitle: draftEval.unitTitle || draftEval.title,
        assessments: draftEval.assessments || [],
        overwriteExisting: true,
        onlyContextualExercises: true,
        removeDecorativeVisuals: true,
        visualStyle: 'auto',
        onProgress: (done, total, title) => {
          setBatchPhotoProgress(`${done}/${total} : ${title}`);
        },
      });
      setDraftEval(prev => ({
        ...prev,
        assessments: updatedAssessments as any,
      }));
    } finally {
      setIsBatchGeneratingPhotos(false);
      setBatchPhotoProgress('');
    }
  };

  // ── Actions sur les critères et exercices ──────────────────────────────────

  const handleUpdateExerciseField = (critIdx: number, exIdx: number, patch: Partial<AssessmentExercise>) => {
    const nextAssessments = draftEval.assessments.map((c, cI) => {
      if (cI !== critIdx) return c;
      const nextEx = (c.exercises || []).map((ex, eI) => (eI === exIdx ? { ...ex, ...patch } : ex));
      return { ...c, exercises: nextEx };
    });
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
  };

  const handleUpdateSubQuestionField = (
    critIdx: number,
    exIdx: number,
    subIdx: number,
    patch: Partial<AssessmentSubQuestion>
  ) => {
    const ex = draftEval.assessments[critIdx]?.exercises?.[exIdx];
    if (!ex || !ex.subQuestions) return;
    const nextSubs = ex.subQuestions.map((s, sI) => (sI === subIdx ? { ...s, ...patch } : s));
    handleUpdateExerciseField(critIdx, exIdx, { subQuestions: nextSubs });
  };

  const handleAddSubQuestion = (critIdx: number, exIdx: number, targetRoman?: string) => {
    const crit = draftEval.assessments[critIdx];
    const ex = crit?.exercises?.[exIdx];
    if (!crit || !ex) return;
    const strandsList = getOfficialStrandsForCriterion(crit.criterion);
    const currentSubs = ex.subQuestions && ex.subQuestions.length > 0
      ? [...ex.subQuestions]
      : [
          {
            id: `sub_${Date.now()}_1`,
            label: '1)',
            content: ex.content || 'Question 1...',
            strandIndex: ex.strandIndex || strandsList[0]?.roman || 'i',
            strandText: ex.strandText || strandsList[0]?.text || '',
            type: ex.type || 'open',
            options: ex.options,
            correctAnswer: ex.correctAnswer,
            answer: ex.answer,
            expectedLines: ex.expectedLines || layout.answerBoxRows || 4,
          },
        ];

    const nextNum = currentSubs.length + 1;
    const roman = targetRoman || ROMAN_NUMERALS[(nextNum - 1) % Math.max(1, strandsList.length)] || 'i';
    const matchedStrand = strandsList.find(s => s.roman === roman) || strandsList[0];

    const newSub: AssessmentSubQuestion = {
      id: `sub_${Date.now()}_${nextNum}`,
      label: `${nextNum})`,
      content: isEn ? `Question ${nextNum}: Write your statement here...` : `Question ${nextNum} : saisissez l'énoncé...`,
      strandIndex: roman,
      strandText: matchedStrand?.text || `Aspect (${roman})`,
      type: 'open',
      expectedLines: layout.answerBoxRows || 4,
    };

    const nextSubs = [...currentSubs, newSub];
    handleUpdateExerciseField(critIdx, exIdx, {
      subQuestions: nextSubs,
    });
    setEditingSubIdx(nextSubs.length - 1);
  };

  const handleDuplicateSubQuestion = (critIdx: number, exIdx: number, subIdx: number) => {
    const ex = draftEval.assessments[critIdx]?.exercises?.[exIdx];
    if (!ex) return;
    if (!ex.subQuestions || ex.subQuestions.length === 0) {
      // Convertir l'exercice simple en 2 sous-questions identiques
      const sub1: AssessmentSubQuestion = {
        id: `sub_${Date.now()}_1`,
        label: '1)',
        content: ex.content || 'Question 1',
        strandIndex: ex.strandIndex || 'i',
        strandText: ex.strandText || '',
        type: ex.type || 'open',
        options: ex.options ? [...ex.options] : undefined,
        correctAnswer: ex.correctAnswer,
        answer: ex.answer,
      };
      const sub2: AssessmentSubQuestion = {
        ...sub1,
        id: `sub_${Date.now()}_2`,
        label: '2)',
      };
      handleUpdateExerciseField(critIdx, exIdx, { subQuestions: [sub1, sub2] });
      return;
    }
    const target = ex.subQuestions[subIdx];
    if (!target) return;
    const clone: AssessmentSubQuestion = {
      ...JSON.parse(JSON.stringify(target)),
      id: `sub_${Date.now()}_${ex.subQuestions.length + 1}`,
    };
    const nextSubs = [...ex.subQuestions];
    nextSubs.splice(subIdx + 1, 0, clone);
    const renumbered = nextSubs.map((s, idx) => ({ ...s, label: `${idx + 1})` }));
    handleUpdateExerciseField(critIdx, exIdx, { subQuestions: renumbered });
  };

  const handleDeleteSubQuestion = (critIdx: number, exIdx: number, subIdx: number) => {
    const ex = draftEval.assessments[critIdx]?.exercises?.[exIdx];
    if (!ex || !ex.subQuestions) return;
    const nextSubs = ex.subQuestions
      .filter((_, idx) => idx !== subIdx)
      .map((s, i) => ({ ...s, label: `${i + 1})` }));
    handleUpdateExerciseField(critIdx, exIdx, {
      subQuestions: nextSubs.length > 0 ? nextSubs : undefined,
    });
    if (editingSubIdx === subIdx) setEditingSubIdx(null);
  };

  const handleMoveSubQuestion = (critIdx: number, exIdx: number, subIdx: number, direction: 'up' | 'down') => {
    const ex = draftEval.assessments[critIdx]?.exercises?.[exIdx];
    if (!ex || !ex.subQuestions) return;
    const subs = [...ex.subQuestions];
    const targetIdx = direction === 'up' ? subIdx - 1 : subIdx + 1;
    if (targetIdx < 0 || targetIdx >= subs.length) return;
    const [moved] = subs.splice(subIdx, 1);
    subs.splice(targetIdx, 0, moved);
    const renumbered = subs.map((s, i) => ({
      ...s,
      label: `${i + 1})`,
    }));
    handleUpdateExerciseField(critIdx, exIdx, { subQuestions: renumbered });
  };

  const handleAddQuickExercise = (
    critIdx: number,
    questionFormat: 'open' | 'multiple_choice' | 'subquestions' | 'true_false' = 'subquestions'
  ) => {
    const crit = draftEval.assessments[critIdx];
    if (!crit) return;
    const strandsList = getOfficialStrandsForCriterion(crit.criterion);
    const nextIdx = (crit.exercises?.length || 0) + 1;
    const roman = strandsList[(nextIdx - 1) % Math.max(1, strandsList.length)]?.roman || 'i';
    const defaultStrand = strandsList.find(s => s.roman === roman)?.text || strandsList[0]?.text || '';

    const newEx: AssessmentExercise = {
      title: isEn ? `Task ${nextIdx}: Criterion ${crit.criterion} Exercise` : `Tâche ${nextIdx} : Exercice d'application`,
      content: isEn
        ? '<strong>Context:</strong> Read the problem statement carefully.<br/><strong>Instructions:</strong> Answer each question below showing all your steps.'
        : '<strong>Mise en situation :</strong> Dans le cadre de cette unité, mobilisez les notions étudiées en cours.<br/><strong>Consigne :</strong> Répondez aux questions suivantes en détaillant chaque étape de votre raisonnement.',
      criterionReference: `Critère ${crit.criterion} : ${roman}.`,
      strandIndex: roman,
      strandText: defaultStrand,
      type: questionFormat === 'subquestions' ? 'open' : questionFormat,
      expectedLines: layout.answerBoxRows || 4,
      ...(questionFormat === 'multiple_choice'
        ? {
            options: ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
            correctAnswer: 'Proposition A',
          }
        : {}),
      ...(questionFormat === 'true_false'
        ? {
            options: ['Vrai', 'Faux'],
            correctAnswer: 'Vrai',
          }
        : {}),
      ...(questionFormat === 'subquestions'
        ? {
            subQuestions: [
              {
                id: `sub_${Date.now()}_1`,
                label: '1)',
                content: isEn ? 'First question...' : 'Première question à résoudre...',
                strandIndex: strandsList[0]?.roman || 'i',
                strandText: strandsList[0]?.text || 'Aspect (i)',
                type: 'open',
              },
              {
                id: `sub_${Date.now()}_2`,
                label: '2)',
                content: isEn ? 'Second question...' : 'Deuxième question à résoudre...',
                strandIndex: strandsList[1]?.roman || 'ii',
                strandText: strandsList[1]?.text || 'Aspect (ii)',
                type: 'open',
              },
            ],
          }
        : {}),
    };

    const nextAssessments = draftEval.assessments.map((c, cI) =>
      cI === critIdx ? { ...c, exercises: [...(c.exercises || []), newEx] } : c
    );
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setLeftSection('exercises');
    setActiveCriterionIdx(critIdx);
    setActiveExerciseIdx(crit.exercises?.length || 0);
  };

  const handleDuplicateExercise = (critIdx: number, exIdx: number) => {
    const crit = draftEval.assessments[critIdx];
    const ex = crit?.exercises?.[exIdx];
    if (!crit || !ex) return;
    const cloned: AssessmentExercise = {
      ...JSON.parse(JSON.stringify(ex)),
      title: `${ex.title} (Copie)`,
    };
    const nextExercises = [...(crit.exercises || [])];
    nextExercises.splice(exIdx + 1, 0, cloned);
    const nextAssessments = draftEval.assessments.map((c, cI) =>
      cI === critIdx ? { ...c, exercises: nextExercises } : c
    );
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setActiveExerciseIdx(exIdx + 1);
  };

  const handleDeleteExercise = (critIdx: number, exIdx: number) => {
    const crit = draftEval.assessments[critIdx];
    if (!crit) return;
    const nextAssessments = draftEval.assessments.map((c, cI) => {
      if (cI !== critIdx) return c;
      return {
        ...c,
        exercises: (c.exercises || []).filter((_, eI) => eI !== exIdx),
      };
    });
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setActiveExerciseIdx(Math.max(0, exIdx - 1));
  };

  const handleMoveExercise = (critIdx: number, exIdx: number, direction: 'up' | 'down') => {
    const exercises = [...(draftEval.assessments[critIdx]?.exercises || [])];
    const targetIdx = direction === 'up' ? exIdx - 1 : exIdx + 1;
    if (targetIdx < 0 || targetIdx >= exercises.length) return;
    const [moved] = exercises.splice(exIdx, 1);
    exercises.splice(targetIdx, 0, moved);
    const nextAssessments = draftEval.assessments.map((c, idx) =>
      idx === critIdx ? { ...c, exercises } : c
    );
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setActiveExerciseIdx(targetIdx);
  };

  // Changer le critère d'un exercice (ou activer un nouveau critère A, B, C, D en conservant les objectifs de la matière/classe)
  const handleAssignExerciseToCriterion = (targetLetter: 'A' | 'B' | 'C' | 'D') => {
    if (!activeCrit || !activeEx) return;
    if (activeCrit.criterion === targetLetter) return;

    const savedCriteria = getCriteriaSync(draftEval.subject, draftEval.grade);
    const savedCritObj = savedCriteria?.criteria?.find(c => c.criterion === targetLetter);
    const stdCrit = getStandardIBCriterion(draftEval.subject, targetLetter);

    const nextAssessments = JSON.parse(JSON.stringify(draftEval.assessments)) as AssessmentData[];
    let targetCritIdx = nextAssessments.findIndex(a => a.criterion === targetLetter);

    // Si le critère cible n'existe pas encore dans l'évaluation, on le crée avec ses vrais aspects IB
    if (targetCritIdx === -1) {
      const officialStrands = savedCritObj?.strands?.length ? [...savedCritObj.strands] : [...stdCrit.strands];
      const newCrit: AssessmentData = {
        criterion: targetLetter,
        criterionName: savedCritObj?.criterionName || stdCrit.name,
        maxPoints: 8,
        strands: officialStrands,
        rubricRows: savedCritObj?.rubricRows?.length
          ? [...savedCritObj.rubricRows]
          : [
              { level: '1-2', descriptor: `L'élève démontre une compréhension limitée des aspects du Critère ${targetLetter} (${stdCrit.name}).` },
              { level: '3-4', descriptor: `L'élève démontre une compréhension satisfaisante des aspects du Critère ${targetLetter} (${stdCrit.name}).` },
              { level: '5-6', descriptor: `L'élève démontre une bonne maîtrise des aspects du Critère ${targetLetter} (${stdCrit.name}).` },
              { level: '7-8', descriptor: `L'élève démontre une excellente maîtrise et justifie avec rigueur tous les aspects du Critère ${targetLetter} (${stdCrit.name}).` },
            ],
        exercises: [],
      };
      nextAssessments.push(newCrit);
      nextAssessments.sort((a, b) => a.criterion.localeCompare(b.criterion));
      targetCritIdx = nextAssessments.findIndex(a => a.criterion === targetLetter);
    }

    // Retirer l'exercice du critère actuel et l'ajouter au critère cible avec mise à jour des références d'aspect
    const sourceCrit = nextAssessments.find(a => a.criterion === activeCrit.criterion);
    if (!sourceCrit) return;
    const [movedEx] = sourceCrit.exercises.splice(safeExIdx, 1);
    if (!movedEx) return;

    const targetStrands = getOfficialStrandsForCriterion(targetLetter);
    const firstStrand = targetStrands[0] || { roman: 'i', text: '' };
    movedEx.criterionReference = `Critère ${targetLetter} : ${movedEx.strandIndex || firstStrand.roman}.`;
    movedEx.strandText = targetStrands.find(s => s.roman === movedEx.strandIndex)?.text || firstStrand.text;
    if (movedEx.subQuestions) {
      movedEx.subQuestions = movedEx.subQuestions.map((sq, idx) => {
        const st = targetStrands.find(s => s.roman === sq.strandIndex) || targetStrands[idx % Math.max(1, targetStrands.length)] || firstStrand;
        return {
          ...sq,
          strandIndex: st.roman,
          strandText: st.text,
        };
      });
    }

    nextAssessments[targetCritIdx].exercises.push(movedEx);
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setActiveCriterionIdx(targetCritIdx);
    setActiveExerciseIdx(nextAssessments[targetCritIdx].exercises.length - 1);
  };

  // Activer ou désactiver un aspect (i, ii, iii, iv) dans le panneau de droite pour l'exercice actif
  const handleToggleStrandOnExercise = (roman: string, strandDesc: string) => {
    if (!activeCrit || !activeEx) return;
    if (activeEx.subQuestions && activeEx.subQuestions.length > 0) {
      const hasSubWithStrand = activeEx.subQuestions.some(sq => sq.strandIndex === roman);
      if (hasSubWithStrand) {
        // Assigner aussi comme aspect principal
        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
          strandIndex: roman,
          strandText: strandDesc,
          criterionReference: `Critère ${activeCrit.criterion} : ${roman}.`,
        });
      } else {
        // Ajouter une sous-question évaluant cet aspect précis ou mettre à jour la sous-question sélectionnée
        if (editingSubIdx !== null && activeEx.subQuestions[editingSubIdx]) {
          handleUpdateSubQuestionField(safeCritIdx, safeExIdx, editingSubIdx, {
            strandIndex: roman,
            strandText: strandDesc,
          });
        } else {
          handleAddSubQuestion(safeCritIdx, safeExIdx, roman);
        }
      }
    } else {
      handleUpdateExerciseField(safeCritIdx, safeExIdx, {
        strandIndex: roman,
        strandText: strandDesc,
        criterionReference: `Critère ${activeCrit.criterion} : ${roman}.`,
      });
    }
  };

  // Générer un document / texte support par IA pour l'exercice actif
  const handleGenerateDocumentWithAI = async () => {
    if (!activeCrit || !activeEx || isGeneratingDocAi) return;
    setIsGeneratingDocAi(true);
    try {
      const docTypeLabels: Record<typeof docAiType, string> = {
        article: 'Article documentaire ou extrait informatif structuré',
        historical_source: 'Source historique / Géographique / Document d\'archive avec source et date',
        scientific_data: 'Protocole expérimental, étude scientifique et tableau de mesures',
        literary_text: 'Extrait littéraire ou texte de compréhension écrite adapté au niveau',
        case_study: 'Étude de cas concret / Situation problème contextualisée avec données chiffrées',
      };

      const prompt = `Génère un document de référence pédagogique court, clair et directement exploitable par les élèves pour cet exercice d'évaluation PEI :
- Matière : ${draftEval.subject}
- Classe : ${draftEval.grade}
- Unité : ${draftEval.unitTitle || draftEval.title}
- Critère évalué : Critère ${activeCrit.criterion} (${activeCrit.criterionName})
- Titre de l'exercice : ${activeEx.title}
- Énoncé actuel : ${stripHtmlTags(activeEx.content || '')}
- Type de document souhaité : ${docTypeLabels[docAiType]}
${docAiPrompt.trim() ? `- Consigne spécifique de l'enseignant : ${docAiPrompt.trim()}` : ''}

Réponds en JSON strict avec ce format :
{
  "documentTitle": "Document 1 : [Titre précis et académique du document]",
  "documentContent": "<p>Contenu riche en HTML propre (avec <strong>mots-clés</strong>, paragraphes clairs ou <table> si données chiffrées)...</p>"
}`;

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: prompt,
          generationConfig: {
            temperature: 0.4,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        let text = String(data.text || '').trim();
        text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
        const parsed = JSON.parse(text);
        if (parsed.documentContent) {
          handleUpdateExerciseField(safeCritIdx, safeExIdx, {
            documentTitle: parsed.documentTitle || `Document de référence – ${activeEx.title}`,
            documentContent: parsed.documentContent,
          });
          setActiveMediaTab('none');
        }
      }
    } catch (e) {
      // Fallback local propre si l'API est occupée
      handleUpdateExerciseField(safeCritIdx, safeExIdx, {
        documentTitle: `Document 1 : Support d'analyse – ${activeEx.title}`,
        documentContent: `<p><strong>Contexte documentaire (${draftEval.subject} – ${draftEval.grade}) :</strong></p><p>${docAiPrompt.trim() || `Ce document présente les données de référence relatives à « ${draftEval.unitTitle || draftEval.title} ». Lisez attentivement les informations ci-dessous afin de justifier vos réponses aux questions de l'exercice.`}</p>`,
      });
      setActiveMediaTab('none');
    } finally {
      setIsGeneratingDocAi(false);
    }
  };

  // Upload local d'image ou d'audio (converti en Data URL)
  const handleLocalFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'image' | 'audio'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      if (!result) return;
      if (kind === 'image') {
        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
          imageUrl: result,
          imageCaption: activeEx?.imageCaption || file.name.replace(/\.[^.]+$/, ''),
        });
      } else if (kind === 'audio') {
        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
          audioUrl: result,
          audioCaption: activeEx?.audioCaption || `Support audio : ${file.name.replace(/\.[^.]+$/, '')}`,
        });
      }
      setActiveMediaTab('none');
    };
    reader.readAsDataURL(file);
  };

  // Insertion de symboles mathématiques dans la zone de test élève
  const handleInsertTestSymbol = (key: string, symbol: string, cursorOffset?: number) => {
    setActiveTextareaKey(key);
    const textarea = document.getElementById(`preview_textarea_${key}`) as HTMLTextAreaElement | null;
    const current = testAnswers[key] || '';
    let updated = current;
    let newCursorPos = current.length + symbol.length + (cursorOffset || 0);

    if (textarea && typeof textarea.selectionStart === 'number' && typeof textarea.selectionEnd === 'number') {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const selectedText = current.substring(start, end);

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

    setTestAnswers(prev => ({ ...prev, [key]: updated }));
  };

  const directStudentUrl = typeof window !== 'undefined'
    ? `${window.location.origin}?mode=student&code=${encodeURIComponent(draftEval.accessCode)}`
    : `?mode=student&code=${encodeURIComponent(draftEval.accessCode)}`;

  const handleCopyPublishInfo = (type: 'code' | 'link' | 'classroom') => {
    if (type === 'code') {
      navigator.clipboard.writeText(draftEval.accessCode);
    } else if (type === 'link') {
      navigator.clipboard.writeText(directStudentUrl);
    } else {
      const text = `📝 ÉVALUATION CRITÉRÉE EN LIGNE : ${draftEval.title} (${draftEval.subject} - ${draftEval.grade})\n\n🔗 Lien direct à ouvrir sur votre tablette ou ordinateur :\n${directStudentUrl}\n\n🔑 Code d'accès unique de la classe : ${draftEval.accessCode}\n🔒 Saisissez votre N° de Matricule personnel pour démarrer l'évaluation.`;
      navigator.clipboard.writeText(text);
    }
    setCopiedLinkType(type);
    setTimeout(() => setCopiedLinkType(null), 2500);
  };

  const isBusySaving = isSaving || savingInternal;

  // Questions à afficher dans la liste "Questions de l'exercice" du panneau central
  const displayQuestionsList: {
    isVirtualMain: boolean;
    subIdx: number;
    label: string;
    content: string;
    strandIndex: string;
    strandText: string;
    type: 'open' | 'multiple_choice' | 'true_false';
    options?: string[];
    correctAnswer?: string;
    answer?: string;
  }[] = activeEx
    ? (activeEx.subQuestions && activeEx.subQuestions.length > 0
        ? activeEx.subQuestions.map((sq, idx) => ({
            isVirtualMain: false,
            subIdx: idx,
            label: `Q${idx + 1}`,
            content: sq.content || '',
            strandIndex: sq.strandIndex || activeOfficialStrands[idx % Math.max(1, activeOfficialStrands.length)]?.roman || 'i',
            strandText: sq.strandText || activeOfficialStrands.find(s => s.roman === sq.strandIndex)?.text || '',
            type: (sq.type || 'open') as 'open' | 'multiple_choice' | 'true_false',
            options: sq.options,
            correctAnswer: sq.correctAnswer,
            answer: sq.answer,
          }))
        : [
            {
              isVirtualMain: true,
              subIdx: 0,
              label: 'Q1',
              content: activeEx.content || '',
              strandIndex: activeEx.strandIndex || activeOfficialStrands[0]?.roman || 'i',
              strandText: activeEx.strandText || activeOfficialStrands[0]?.text || '',
              type: (activeEx.type || 'open') as 'open' | 'multiple_choice' | 'true_false',
              options: activeEx.options,
              correctAnswer: activeEx.correctAnswer,
              answer: activeEx.answer,
            },
          ])
    : [];

  return (
    <div className="fixed inset-0 z-[115] bg-[#f4f5f9] flex flex-col overflow-hidden animate-fadeIn">
      {/* ═══════════════════════════════════════════════════════════════════════
          1. BANNIÈRE SUPÉRIEURE OFFICIELLE AL-KAWTHAR (COMME L'IMAGE MODÈLE)
          ═══════════════════════════════════════════════════════════════════════ */}
      <header className="bg-gradient-to-r from-[#191056] via-[#271778] to-[#321b92] text-white px-4 sm:px-6 py-2.5 flex items-center justify-between gap-4 shadow-md flex-shrink-0">
        {/* Gauche : Logo KIS / Al-Kawthar */}
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full border-2 border-white/80 bg-white/10 flex flex-col items-center justify-center font-black text-xs leading-none shadow-inner">
            <span className="text-[10px] text-amber-300">♛</span>
            <span className="tracking-wider">KIS</span>
          </div>
          <div className="leading-tight">
            <div className="font-black text-base sm:text-lg tracking-tight text-white">Alkawthar</div>
            <div className="text-[11px] font-semibold text-indigo-200">International Schools</div>
          </div>
        </div>

        {/* Centre : Titre de l'Évaluation & Matière – Classe */}
        <div className="text-center flex-1 min-w-0 px-2">
          <h1 className="font-black text-sm sm:text-lg md:text-xl text-white truncate">
            Évaluation : {draftEval.unitTitle || draftEval.title}
          </h1>
          <div className="flex items-center justify-center gap-2 text-xs sm:text-sm font-bold text-indigo-200 mt-0.5 flex-wrap">
            <span>{draftEval.subject} – {draftEval.grade}</span>
            <span className="text-white/40">•</span>
            <span className="font-mono text-xs bg-white/15 px-2 py-0.5 rounded text-amber-300">
              Code : {draftEval.accessCode}
            </span>
          </div>
        </div>

        {/* Droite : Badge Édition Enseignant */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setViewMode(prev => (prev === 'studio' ? 'pure_student' : 'studio'))}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-500 hover:to-purple-500 border border-white/25 text-white font-black text-xs sm:text-sm shadow-md flex items-center gap-2 transition"
          >
            <Edit3 size={15} />
            <span>{viewMode === 'studio' ? 'Édition – Enseignant' : 'Mode Aperçu Élève'}</span>
          </button>
        </div>
      </header>

      {/* ═══════════════════════════════════════════════════════════════════════
          2. BARRE D'OUTILS SECONDAIRE BLANCHE (Retour, Aperçu Élève, Enregistrer, Publier)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 flex items-center justify-between gap-3 flex-wrap shadow-2xs flex-shrink-0">
        {/* Bouton Retour + Sélecteur de Vue */}
        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-bold text-xs sm:text-sm flex items-center gap-2 shadow-2xs transition"
          >
            <ArrowLeft size={15} />
            <span>Retour</span>
          </button>

          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setViewMode('studio')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${
                viewMode === 'studio'
                  ? 'bg-white text-indigo-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers size={14} className="text-indigo-600" />
              <span>Studio d'Organisation (3 colonnes)</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pure_student')}
              className={`px-3 py-1.5 rounded-lg text-xs font-black flex items-center gap-1.5 transition ${
                viewMode === 'pure_student'
                  ? 'bg-white text-indigo-900 shadow-2xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Eye size={14} className="text-purple-600" />
              <span>Feuille d'Examen Complète (Élève)</span>
            </button>
          </div>

          {saveSuccess && (
            <span className="text-xs font-black bg-emerald-100 text-emerald-800 border border-emerald-300 px-3 py-1 rounded-xl flex items-center gap-1.5 animate-fadeIn">
              <CheckCircle size={14} className="text-emerald-600" /> Modifications enregistrées avec succès !
            </span>
          )}
        </div>

        {/* Actions Droite : Photos IA, Imprimer A4, Aperçu Élève, Enregistrer, Publier aux élèves */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            disabled={isBatchGeneratingPhotos}
            onClick={handleBatchGenerateNanoPhotos}
            className="px-3 py-2 rounded-xl border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs flex items-center gap-1.5 transition disabled:opacity-60"
            title="Générer automatiquement des illustrations IA pour les exercices qui en ont besoin"
          >
            <span>🍌</span>
            <span>{isBatchGeneratingPhotos ? batchPhotoProgress || 'Photos IA...' : 'Illustrations IA'}</span>
          </button>

          <button
            type="button"
            onClick={() => setShowPrintModal(true)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs flex items-center gap-1.5 transition"
            title="Imprimer la copie vierge au format A4"
          >
            <Printer size={14} />
            <span className="hidden sm:inline">Sujet Vierge (A4)</span>
          </button>

          <button
            type="button"
            onClick={() => setViewMode(prev => (prev === 'pure_student' ? 'studio' : 'pure_student'))}
            className={`px-4 py-2 rounded-xl border font-bold text-xs sm:text-sm flex items-center gap-1.5 transition ${
              viewMode === 'pure_student'
                ? 'border-purple-600 bg-purple-50 text-purple-900'
                : 'border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-indigo-800'
            }`}
          >
            <Eye size={15} />
            <span>{viewMode === 'pure_student' ? 'Retour au Studio' : 'Aperçu Élève'}</span>
          </button>

          <button
            type="button"
            disabled={isBusySaving}
            onClick={handleTriggerSave}
            className="px-4 py-2 rounded-xl border border-indigo-300 bg-indigo-50/80 hover:bg-indigo-100 text-indigo-900 font-bold text-xs sm:text-sm flex items-center gap-1.5 transition disabled:opacity-50"
          >
            <Save size={15} />
            <span>{isBusySaving ? 'Enregistrement…' : 'Enregistrer'}</span>
          </button>

          <button
            type="button"
            onClick={async () => {
              await handleTriggerSave();
              setShowPublishModal(true);
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-black text-xs sm:text-sm shadow-sm flex items-center gap-1.5 transition"
          >
            <Share2 size={15} />
            <span>Publier aux élèves</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          3. CORPS PRINCIPAL : MODE STUDIO 3 COLONNES vs MODE APERÇU ÉLÈVE
          ═══════════════════════════════════════════════════════════════════════ */}
      {viewMode === 'studio' ? (
        <div className="flex-1 overflow-hidden grid grid-cols-1 lg:grid-cols-12 gap-4 p-4 max-w-[1600px] w-full mx-auto">
          
          {/* ─────────────────────────────────────────────────────────────────
              COLONNE GAUCHE (3 cols) : STRUCTURE DE L'ÉVALUATION
              ───────────────────────────────────────────────────────────────── */}
          <aside className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden">
            <div className="p-3 border-b border-slate-100">
              <div className="bg-gradient-to-r from-purple-700 to-indigo-700 text-white px-3.5 py-2.5 rounded-xl font-black text-xs sm:text-sm flex items-center gap-2 shadow-2xs">
                <Layers size={16} />
                <span>Structure de l'évaluation</span>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {/* 1. Informations générales */}
              <button
                type="button"
                onClick={() => setLeftSection('general')}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between border transition ${
                  leftSection === 'general'
                    ? 'bg-purple-50 border-purple-300 text-purple-950 shadow-2xs'
                    : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <FileText size={15} className="text-slate-500" />
                  <span>Informations générales</span>
                </span>
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check size={12} />
                </span>
              </button>

              {/* 2. Consignes & Mise en situation */}
              <button
                type="button"
                onClick={() => setLeftSection('instructions')}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between border transition ${
                  leftSection === 'instructions'
                    ? 'bg-purple-50 border-purple-300 text-purple-950 shadow-2xs'
                    : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <BookOpen size={15} className="text-slate-500" />
                  <span>Consignes & Mise en situation</span>
                </span>
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check size={12} />
                </span>
              </button>

              {/* 3. Accordéon Exercices (N) */}
              <div className="rounded-xl border border-purple-200 bg-purple-50/30 overflow-hidden">
                <button
                  type="button"
                  onClick={() => setLeftSection('exercises')}
                  className="w-full bg-gradient-to-r from-purple-700 to-indigo-600 text-white px-3.5 py-2.5 text-xs font-black flex items-center justify-between"
                >
                  <span className="flex items-center gap-2">
                    <FileText size={15} />
                    <span>Exercices ({allFlatExercises.length})</span>
                  </span>
                  <span className="text-[11px] bg-white/20 px-2 py-0.5 rounded-md">
                    {draftEval.assessments.length} Critère(s)
                  </span>
                </button>

                <div className="p-2 space-y-1.5">
                  {allFlatExercises.map(item => {
                    const isSelected =
                      leftSection === 'exercises' &&
                      item.critIdx === safeCritIdx &&
                      item.exIdx === safeExIdx;
                    const cColors = CRITERION_COLORS[item.criterion] || CRITERION_COLORS.A;
                    return (
                      <div
                        key={`${item.criterion}_${item.exIdx}`}
                        onClick={() => {
                          setLeftSection('exercises');
                          setActiveCriterionIdx(item.critIdx);
                          setActiveExerciseIdx(item.exIdx);
                          setEditingSubIdx(null);
                          setActiveMediaTab('none');
                        }}
                        className={`group px-3 py-2 rounded-xl cursor-pointer flex items-center justify-between gap-2 border transition ${
                          isSelected
                            ? 'bg-purple-100/90 border-purple-400 text-purple-950 font-black shadow-2xs'
                            : 'bg-white border-slate-200/70 text-slate-700 hover:border-purple-300 hover:bg-purple-50/40 font-bold'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <GripVertical size={13} className="text-slate-400 flex-shrink-0" />
                          <span className={`w-5 h-5 rounded text-[10px] font-black text-white flex items-center justify-center flex-shrink-0 ${cColors.badge}`}>
                            {item.criterion}
                          </span>
                          <div className="min-w-0">
                            <div className="text-xs truncate">Exercice {item.globalNum}</div>
                            <div className="text-[10px] text-slate-500 font-normal truncate">
                              {stripHtmlTags(item.exercise.title)}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-0.5 opacity-70 group-hover:opacity-100">
                          <button
                            type="button"
                            disabled={item.exIdx === 0}
                            onClick={e => {
                              e.stopPropagation();
                              handleMoveExercise(item.critIdx, item.exIdx, 'up');
                            }}
                            className="p-1 hover:bg-white rounded text-slate-600 disabled:opacity-25"
                            title="Monter"
                          >
                            <ArrowUp size={11} />
                          </button>
                          <button
                            type="button"
                            disabled={item.exIdx === (draftEval.assessments[item.critIdx]?.exercises?.length || 1) - 1}
                            onClick={e => {
                              e.stopPropagation();
                              handleMoveExercise(item.critIdx, item.exIdx, 'down');
                            }}
                            className="p-1 hover:bg-white rounded text-slate-600 disabled:opacity-25"
                            title="Descendre"
                          >
                            <ArrowDown size={11} />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 4. Barème & Options */}
              <button
                type="button"
                onClick={() => setLeftSection('rubric')}
                className={`w-full px-3.5 py-2.5 rounded-xl text-left text-xs font-bold flex items-center justify-between border transition ${
                  leftSection === 'rubric'
                    ? 'bg-purple-50 border-purple-300 text-purple-950 shadow-2xs'
                    : 'bg-white border-slate-200/80 text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2">
                  <Sliders size={15} className="text-slate-500" />
                  <span>Barème & Options</span>
                </span>
                <span className="w-5 h-5 rounded-full bg-emerald-500 text-white flex items-center justify-center">
                  <Check size={12} />
                </span>
              </button>
            </div>

            {/* Boutons d'ajout en bas de la colonne gauche */}
            <div className="p-3 border-t border-slate-100 space-y-2 bg-slate-50/50">
              <button
                type="button"
                onClick={() => handleAddQuickExercise(safeCritIdx, 'subquestions')}
                className="w-full py-2.5 px-3 rounded-xl border-2 border-purple-400 text-purple-700 hover:bg-purple-50 font-black text-xs flex items-center justify-center gap-1.5 transition"
              >
                <Plus size={15} />
                <span>Ajouter un exercice</span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setAiModalTarget({
                    critIdx: safeCritIdx,
                    exIdx: null,
                    initialStrand: 'i',
                    initialType: 'subquestions',
                  })
                }
                className="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-bold text-xs flex items-center justify-center gap-1.5 shadow-2xs transition"
              >
                <Sparkles size={13} className="text-amber-300" />
                <span>Générer un exercice par IA</span>
              </button>
            </div>
          </aside>

          {/* ─────────────────────────────────────────────────────────────────
              COLONNE CENTRALE (6 cols) : ZONE DE TRAVAIL DE L'EXERCICE ACTIF
              ───────────────────────────────────────────────────────────────── */}
          <main className="lg:col-span-6 flex flex-col gap-3 overflow-y-auto pr-1">
            {/* Sélecteur rapide des Critères A, B, C, D + Bannière du Critère */}
            {activeCrit && (
              <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 border border-indigo-200/90 rounded-2xl p-3.5 flex items-center justify-between gap-3 flex-wrap shadow-2xs">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-xl ${(CRITERION_COLORS[activeCrit.criterion] || CRITERION_COLORS.A).badge} text-white font-black text-base flex items-center justify-center shadow-xs`}>
                    {activeCrit.criterion}
                  </div>
                  <div>
                    <h2 className="font-black text-sm sm:text-base text-slate-900">
                      Critère {activeCrit.criterion} – {activeCrit.criterionName}
                    </h2>
                    <p className="text-[11px] font-semibold text-indigo-800">
                      {draftEval.subject} · {draftEval.grade} · {activeOfficialStrands.length} aspects officiels (i–{ROMAN_NUMERALS[Math.max(0, activeOfficialStrands.length - 1)]})
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  {/* Onglets critères présents dans l'évaluation */}
                  <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-indigo-200">
                    {draftEval.assessments.map((c, cI) => {
                      const col = CRITERION_COLORS[c.criterion] || CRITERION_COLORS.A;
                      const isCurr = cI === safeCritIdx;
                      return (
                        <button
                          key={c.criterion}
                          type="button"
                          onClick={() => {
                            setActiveCriterionIdx(cI);
                            setActiveExerciseIdx(0);
                            setLeftSection('exercises');
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-black transition ${
                            isCurr ? `${col.badge} text-white shadow-2xs` : 'text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          Crit. {c.criterion}
                        </button>
                      );
                    })}
                  </div>

                  <span className="px-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-indigo-900 font-black text-xs shadow-2xs">
                    Barème : Niveau 1 à {activeCrit.maxPoints || 8}
                  </span>
                </div>
              </div>
            )}

            {/* VUE 1 : INFORMATIONS GÉNÉRALES */}
            {leftSection === 'general' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <FileText size={18} className="text-purple-600" />
                    <span>Informations générales de l'évaluation</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setLeftSection('exercises')}
                    className="text-xs font-bold text-purple-700 hover:underline"
                  >
                    Retour aux exercices →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Titre de l'évaluation :</label>
                    <input
                      type="text"
                      value={draftEval.title}
                      onChange={e => setDraftEval(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-sm text-slate-900 focus:bg-white focus:border-purple-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Durée de l'épreuve (minutes) :</label>
                    <input
                      type="number"
                      value={draftEval.durationMinutes || 45}
                      onChange={e => setDraftEval(prev => ({ ...prev, durationMinutes: parseInt(e.target.value) || 45 }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-purple-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="font-bold text-slate-700 block mb-1">Semestre :</label>
                    <select
                      value={draftEval.semester || 'Semestre 1'}
                      onChange={e => setDraftEval(prev => ({ ...prev, semester: e.target.value }))}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl font-bold text-slate-900 focus:bg-white focus:border-purple-500 outline-none"
                    >
                      <option value="Semestre 1">Semestre 1</option>
                      <option value="Semestre 2">Semestre 2</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="font-bold text-slate-700 block mb-1">Énoncé de recherche (Statement of Inquiry) :</label>
                    <textarea
                      value={draftEval.statementOfInquiry || ''}
                      onChange={e => setDraftEval(prev => ({ ...prev, statementOfInquiry: e.target.value }))}
                      rows={2}
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-slate-800 focus:bg-white focus:border-purple-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* VUE 2 : CONSIGNES GÉNÉRALES */}
            {leftSection === 'instructions' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <BookOpen size={18} className="text-purple-600" />
                    <span>Consignes générales & Mise en situation globale</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setLeftSection('exercises')}
                    className="text-xs font-bold text-purple-700 hover:underline"
                  >
                    Retour aux exercices →
                  </button>
                </div>

                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1.5">
                    Consignes affichées en haut de la copie de l'élève :
                  </label>
                  <textarea
                    value={draftEval.instructions || ''}
                    onChange={e => setDraftEval(prev => ({ ...prev, instructions: e.target.value }))}
                    rows={4}
                    placeholder="Ex: Lisez attentivement chaque énoncé. Détaillez toutes les étapes de vos calculs et justifiez vos réponses..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 rounded-xl text-xs sm:text-sm text-slate-800 focus:bg-white focus:border-purple-500 outline-none leading-relaxed"
                  />
                </div>
              </div>
            )}

            {/* VUE 3 : BARÈME & OPTIONS */}
            {leftSection === 'rubric' && activeCrit && (
              <div className="bg-white rounded-2xl border border-slate-200 p-5 space-y-4 shadow-xs">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <h3 className="font-black text-base text-slate-900 flex items-center gap-2">
                    <Sliders size={18} className="text-purple-600" />
                    <span>Barème IB (Niveaux 1 à 8) & Options de l'épreuve</span>
                  </h3>
                  <button
                    type="button"
                    onClick={() => setLeftSection('exercises')}
                    className="text-xs font-bold text-purple-700 hover:underline"
                  >
                    Retour aux exercices →
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layout.showCalculator !== false}
                      onChange={e => updateLayout({ showCalculator: e.target.checked })}
                      className="w-4 h-4 rounded text-purple-600"
                    />
                    <span>🧮 Autoriser la Calculatrice Scientifique</span>
                  </label>
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layout.showMathToolbar !== false}
                      onChange={e => updateLayout({ showMathToolbar: e.target.checked })}
                      className="w-4 h-4 rounded text-purple-600"
                    />
                    <span>( ) [ ] Barre de symboles mathématiques</span>
                  </label>
                  <label className="flex items-center gap-2 font-bold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={layout.showStrandBadges !== false}
                      onChange={e => updateLayout({ showStrandBadges: e.target.checked })}
                      className="w-4 h-4 rounded text-purple-600"
                    />
                    <span>🔴 Afficher les aspects IB (i, ii, iii) sous chaque question</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-700">Affichage élève :</span>
                    <select
                      value={layout.displayMode}
                      onChange={e => updateLayout({ displayMode: e.target.value as any })}
                      className="p-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800"
                    >
                      <option value="full_page">Feuille complète</option>
                      <option value="tabs">Par onglets de critères</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="text-xs font-black uppercase text-slate-700">
                    Descripteurs officiels du Critère {activeCrit.criterion} ({activeCrit.criterionName}) :
                  </h4>
                  {(activeCrit.rubricRows || []).map((row, rIdx) => (
                    <div key={rIdx} className="flex items-start gap-2.5 bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-xs">
                      <span className="px-2.5 py-1 bg-purple-700 text-white font-black rounded-lg text-[11px] flex-shrink-0">
                        Niv. {row.level}
                      </span>
                      <textarea
                        value={row.descriptor}
                        onChange={e => {
                          const nextRows = [...(activeCrit.rubricRows || [])];
                          nextRows[rIdx] = { ...nextRows[rIdx], descriptor: e.target.value };
                          const nextAssessments = draftEval.assessments.map((c, idx) =>
                            idx === safeCritIdx ? { ...c, rubricRows: nextRows } : c
                          );
                          setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
                        }}
                        rows={2}
                        className="flex-1 p-1.5 bg-white border border-slate-200 rounded-lg text-slate-800 text-xs"
                      />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VUE 4 (PRINCIPALE) : CARTE DE L'EXERCICE ACTIF (COMME L'IMAGE DE RÉFÉRENCE) */}
            {leftSection === 'exercises' && activeCrit && activeEx && (
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-5">
                {/* En-tête de l'exercice : Pill Exercice X + Titre + Badge N sous-questions */}
                <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3.5 flex-wrap">
                  <div className="flex items-center gap-2.5 flex-1 min-w-[220px]">
                    <span className="px-3 py-1 rounded-full bg-blue-600 text-white font-black text-xs shadow-2xs flex-shrink-0">
                      Exercice {getGlobalExerciseNumber(safeCritIdx, safeExIdx)}
                    </span>
                    <input
                      type="text"
                      value={activeEx.title}
                      onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { title: e.target.value })}
                      className="flex-1 font-black text-sm sm:text-base text-slate-900 bg-transparent hover:bg-slate-50 focus:bg-white border border-transparent hover:border-slate-200 focus:border-purple-400 rounded-xl px-2.5 py-1 outline-none transition"
                      placeholder="Titre de l'exercice..."
                    />
                  </div>

                  <div className="flex items-center gap-1.5">
                    <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-700 font-bold text-xs border border-slate-200">
                      {displayQuestionsList.length} {displayQuestionsList.length > 1 ? 'sous-questions' : 'question'}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setAiModalTarget({
                          critIdx: safeCritIdx,
                          exIdx: safeExIdx,
                          initialStrand: activeEx.strandIndex || 'i',
                          initialType: activeEx.subQuestions?.length ? 'subquestions' : (activeEx.type || 'open'),
                        })
                      }
                      className="p-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 transition"
                      title="Régénérer ou enrichir cet exercice avec l'IA"
                    >
                      <Sparkles size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDuplicateExercise(safeCritIdx, safeExIdx)}
                      className="p-1.5 rounded-lg bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 transition"
                      title="Dupliquer cet exercice"
                    >
                      <Copy size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteExercise(safeCritIdx, safeExIdx)}
                      className="p-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 transition"
                      title="Supprimer cet exercice"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                {/* Encadré Mise en situation & Consigne (Exactement comme l'image) */}
                <div className="bg-slate-50/90 border border-slate-200/90 rounded-2xl p-4 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                      <span>📌</span>
                      <span>Mise en situation & Consigne de l'exercice</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsEditingMainPrompt(v => !v)}
                      className="text-xs font-bold text-purple-700 hover:text-purple-900 bg-white px-2.5 py-1 rounded-lg border border-purple-200 flex items-center gap-1 shadow-2xs"
                    >
                      <Edit3 size={12} />
                      <span>{isEditingMainPrompt ? 'Terminer l\'édition' : 'Modifier le texte'}</span>
                    </button>
                  </div>

                  {isEditingMainPrompt ? (
                    <div className="space-y-2">
                      <textarea
                        value={activeEx.content}
                        onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { content: e.target.value })}
                        rows={4}
                        placeholder="Mise en situation : ... Consigne : ..."
                        className="w-full p-3 bg-white border border-purple-300 rounded-xl text-xs sm:text-sm text-slate-900 leading-relaxed outline-none"
                      />
                      <div className="flex items-center gap-2 text-[11px] text-slate-500">
                        <span>Astuce : Utilisez &lt;strong&gt;Mise en situation :&lt;/strong&gt; et &lt;strong&gt;Consigne :&lt;/strong&gt; pour mettre en valeur.</span>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => setIsEditingMainPrompt(true)}
                      className="text-xs sm:text-sm text-slate-800 leading-relaxed cursor-pointer hover:bg-white/70 p-2 rounded-xl transition"
                      title="Cliquez pour modifier la mise en situation et la consigne"
                    >
                      {activeEx.content ? (
                        <RichExerciseContent content={activeEx.content} />
                      ) : (
                        <p className="text-slate-400 italic">
                          Cliquez ici pour saisir la mise en situation et la consigne de l'exercice…
                        </p>
                      )}
                    </div>
                  )}
                </div>

                {/* ── BARRE D'OUTILS MULTIMÉDIA & DOCUMENTS DE L'EXERCICE (Générer Document/Texte, Image IA, Photo Drive, Audio, Vidéo) ── */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                      📎 Ajouter ou générer un support pour cet exercice :
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setActiveMediaTab(prev => (prev === 'document' ? 'none' : 'document'))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                        activeMediaTab === 'document' || activeEx.documentContent
                          ? 'bg-amber-50 border-amber-300 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <FileText size={13} className="text-amber-600" />
                      <span>{activeEx.documentContent ? '📄 Document / Texte (Actif)' : '+ Générer Document / Texte'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMediaTab(prev => (prev === 'image_ai' ? 'none' : 'image_ai'))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                        activeMediaTab === 'image_ai'
                          ? 'bg-purple-50 border-purple-300 text-purple-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Sparkles size={13} className="text-purple-600" />
                      <span>+ Générer Image / Schéma IA</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMediaTab(prev => (prev === 'image_drive' ? 'none' : 'image_drive'))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                        activeMediaTab === 'image_drive' || activeEx.imageUrl
                          ? 'bg-blue-50 border-blue-300 text-blue-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <ImageIcon size={13} className="text-blue-600" />
                      <span>{activeEx.imageUrl ? '🖼️ Photo / Image (Active)' : '+ Photo Drive / Image'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMediaTab(prev => (prev === 'audio' ? 'none' : 'audio'))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                        activeMediaTab === 'audio' || activeEx.audioUrl
                          ? 'bg-indigo-50 border-indigo-300 text-indigo-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Volume2 size={13} className="text-indigo-600" />
                      <span>{activeEx.audioUrl ? '🎧 Audio (Actif)' : '+ Audio (Drive / MP3)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMediaTab(prev => (prev === 'video' ? 'none' : 'video'))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                        activeMediaTab === 'video' || activeEx.videoUrl
                          ? 'bg-rose-50 border-rose-300 text-rose-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Video size={13} className="text-rose-600" />
                      <span>{activeEx.videoUrl ? '🎬 Vidéo (Active)' : '+ Vidéo (Drive / YouTube)'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => setActiveMediaTab(prev => (prev === 'interactive' ? 'none' : 'interactive'))}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold border flex items-center gap-1.5 transition ${
                        activeMediaTab === 'interactive' || activeEx.interactiveModule
                          ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <Sliders size={13} className="text-emerald-600" />
                      <span>+ Tableau / Étiquettes</span>
                    </button>
                  </div>

                  {/* Sous-panneau 1 : Générer ou éditer un Document / Texte de référence */}
                  {activeMediaTab === 'document' && (
                    <div className="bg-amber-50/80 border border-amber-300 rounded-2xl p-4 space-y-3 text-xs animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-amber-950 uppercase flex items-center gap-1.5">
                          📚 Générer ou rédiger un Document / Texte support pour cet exercice
                        </span>
                        {activeEx.documentContent && (
                          <button
                            type="button"
                            onClick={() =>
                              handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                                documentTitle: undefined,
                                documentContent: undefined,
                              })
                            }
                            className="text-rose-600 font-bold hover:underline"
                          >
                            ✕ Supprimer le document
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <select
                          value={docAiType}
                          onChange={e => setDocAiType(e.target.value as any)}
                          className="p-2 bg-white border border-amber-300 rounded-xl font-bold text-slate-800"
                        >
                          <option value="article">📄 Texte / Article documentaire</option>
                          <option value="historical_source">🏛️ Source historique / Géographique</option>
                          <option value="scientific_data">🔬 Expérience / Tableau de données</option>
                          <option value="literary_text">📖 Extrait littéraire / Lecture</option>
                          <option value="case_study">📊 Étude de cas / Problème concret</option>
                        </select>
                        <input
                          type="text"
                          value={docAiPrompt}
                          onChange={e => setDocAiPrompt(e.target.value)}
                          placeholder="Thème ou précision pour l'IA (optionnel)..."
                          className="p-2 bg-white border border-amber-300 rounded-xl text-slate-800"
                        />
                        <button
                          type="button"
                          disabled={isGeneratingDocAi}
                          onClick={handleGenerateDocumentWithAI}
                          className="px-3 py-2 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-700 hover:to-orange-700 text-white font-black rounded-xl flex items-center justify-center gap-1.5 shadow-2xs disabled:opacity-50"
                        >
                          {isGeneratingDocAi ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                          <span>{isGeneratingDocAi ? 'Génération IA...' : 'Générer le document par IA'}</span>
                        </button>
                      </div>

                      <div className="space-y-2 pt-1">
                        <input
                          type="text"
                          value={activeEx.documentTitle || ''}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { documentTitle: e.target.value })}
                          placeholder="Titre du document (ex: Document 1 : Évolution de la température...)"
                          className="w-full p-2 bg-white border border-amber-300 rounded-xl font-bold text-slate-900"
                        />
                        <textarea
                          value={activeEx.documentContent || ''}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { documentContent: e.target.value })}
                          rows={4}
                          placeholder="Saisissez ou collez ici le texte du document, l'extrait littéraire ou le tableau de données..."
                          className="w-full p-2.5 bg-white border border-amber-300 rounded-xl text-slate-800 leading-relaxed"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sous-panneau 2 : Générer Image / Schéma / Courbe par IA */}
                  {activeMediaTab === 'image_ai' && (
                    <div className="bg-purple-50/80 border border-purple-200 rounded-2xl p-4 space-y-3 text-xs animate-fadeIn">
                      <span className="font-black text-purple-950 uppercase block">
                        🍌 Générer une Illustration, Courbe, Figure géométrique ou Schéma par IA
                      </span>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <select
                          value={geminiDiagramStyleMap[`${safeCritIdx}_${safeExIdx}`] || 'auto'}
                          onChange={e =>
                            setGeminiDiagramStyleMap(prev => ({
                              ...prev,
                              [`${safeCritIdx}_${safeExIdx}`]: e.target.value as NanoBananaVisualStyle,
                            }))
                          }
                          className="sm:w-52 p-2 bg-white border border-purple-300 rounded-xl font-bold text-slate-800"
                        >
                          {NANO_BANANA_VISUAL_STYLES.map(s => (
                            <option key={s.id} value={s.id}>
                              {isEn ? s.labelEn : s.labelFr}
                            </option>
                          ))}
                        </select>
                        <input
                          type="text"
                          value={geminiDiagramPromptMap[`${safeCritIdx}_${safeExIdx}`] ?? ''}
                          onChange={e =>
                            setGeminiDiagramPromptMap(prev => ({
                              ...prev,
                              [`${safeCritIdx}_${safeExIdx}`]: e.target.value,
                            }))
                          }
                          placeholder="Précisez ce que l'image ou le schéma doit représenter (ou laissez vide pour auto)..."
                          className="flex-1 p-2 bg-white border border-purple-300 rounded-xl"
                        />
                        <button
                          type="button"
                          disabled={isGeneratingDiagramKey === `${safeCritIdx}_${safeExIdx}`}
                          onClick={async () => {
                            const key = `${safeCritIdx}_${safeExIdx}`;
                            setIsGeneratingDiagramKey(key);
                            try {
                              const customPrompt = (geminiDiagramPromptMap[key] || '').trim();
                              const selectedStyle = geminiDiagramStyleMap[key] || 'auto';
                              const subQuestionsText = (activeEx.subQuestions || [])
                                .map((sq, idx) => `${sq.label || `${idx + 1})`} ${sq.content}`)
                                .join(' | ');
                              const generated = await generateDiagramOrMapWithGeminiAI({
                                subject: draftEval.subject || '',
                                grade: draftEval.grade || '',
                                unitTitle: draftEval.unitTitle || draftEval.title,
                                exerciseTitle: activeEx.title,
                                exerciseContent: `${activeEx.content || ''}\n${subQuestionsText}`.trim(),
                                customPrompt: customPrompt || undefined,
                                visualStyle: selectedStyle,
                              });
                              if (generated) {
                                handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                                  imageUrl: generated.imageUrl,
                                  imageCaption: generated.imageCaption,
                                });
                                setActiveMediaTab('none');
                              }
                            } finally {
                              setIsGeneratingDiagramKey(null);
                            }
                          }}
                          className="px-4 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black rounded-xl flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
                        >
                          <Sparkles size={14} />
                          <span>
                            {isGeneratingDiagramKey === `${safeCritIdx}_${safeExIdx}` ? 'Génération...' : 'Générer par IA'}
                          </span>
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Sous-panneau 3 : Photo Google Drive ou Fichier Image local */}
                  {activeMediaTab === 'image_drive' && (
                    <div className="bg-blue-50/80 border border-blue-200 rounded-2xl p-4 space-y-3 text-xs animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-blue-950 uppercase">
                          🖼️ Ajouter une Photo depuis Google Drive, une URL ou votre ordinateur
                        </span>
                        {activeEx.imageUrl && (
                          <button
                            type="button"
                            onClick={() => handleUpdateExerciseField(safeCritIdx, safeExIdx, { imageUrl: '', imageCaption: '' })}
                            className="text-rose-600 font-bold hover:underline"
                          >
                            ✕ Retirer l'image
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={activeEx.imageUrl?.startsWith('data:') ? '' : (activeEx.imageUrl || '')}
                          onChange={e => {
                            const rawVal = e.target.value;
                            const converted = rawVal.includes('drive.google.com')
                              ? convertGoogleDriveUrl(rawVal)
                              : rawVal;
                            handleUpdateExerciseField(safeCritIdx, safeExIdx, { imageUrl: converted });
                          }}
                          placeholder="Collez un lien partagé Google Drive (https://drive.google.com/...) ou URL..."
                          className="p-2 bg-white border border-blue-300 rounded-xl"
                        />
                        <input
                          type="text"
                          value={activeEx.imageCaption || ''}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { imageCaption: e.target.value })}
                          placeholder="Légende de la photo / figure..."
                          className="p-2 bg-white border border-blue-300 rounded-xl"
                        />
                      </div>
                      <div className="flex items-center gap-2">
                        <label className="px-3 py-1.5 bg-white hover:bg-blue-100 text-blue-900 border border-blue-300 rounded-xl font-bold cursor-pointer inline-flex items-center gap-1.5">
                          <FolderOpen size={13} />
                          <span>Importer une image depuis l'ordinateur / tablette</span>
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleLocalFileUpload(e, 'image')}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Sous-panneau 4 : Ajouter un Audio (Google Drive / MP3 / Fichier local) */}
                  {activeMediaTab === 'audio' && (
                    <div className="bg-indigo-50/80 border border-indigo-200 rounded-2xl p-4 space-y-3 text-xs animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-indigo-950 uppercase">
                          🎧 Ajouter un document sonore (Lien Audio Google Drive, URL MP3 ou Fichier)
                        </span>
                        {activeEx.audioUrl && (
                          <button
                            type="button"
                            onClick={() => handleUpdateExerciseField(safeCritIdx, safeExIdx, { audioUrl: undefined, audioCaption: undefined })}
                            className="text-rose-600 font-bold hover:underline"
                          >
                            ✕ Supprimer l'audio
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={activeEx.audioUrl?.startsWith('data:') ? '' : (activeEx.audioUrl || '')}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { audioUrl: e.target.value })}
                          placeholder="Lien Google Drive du fichier audio ou URL directe (.mp3, .wav)..."
                          className="p-2 bg-white border border-indigo-300 rounded-xl"
                        />
                        <input
                          type="text"
                          value={activeEx.audioCaption || ''}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { audioCaption: e.target.value })}
                          placeholder="Titre / Consigne d'écoute (ex: Écoutez l'enregistrement 2 fois)..."
                          className="p-2 bg-white border border-indigo-300 rounded-xl"
                        />
                      </div>
                      <div>
                        <label className="px-3 py-1.5 bg-white hover:bg-indigo-100 text-indigo-900 border border-indigo-300 rounded-xl font-bold cursor-pointer inline-flex items-center gap-1.5">
                          <FolderOpen size={13} />
                          <span>Importer un fichier audio (.mp3, .wav, .m4a) depuis votre appareil</span>
                          <input
                            type="file"
                            accept="audio/*"
                            onChange={e => handleLocalFileUpload(e, 'audio')}
                            className="hidden"
                          />
                        </label>
                      </div>
                    </div>
                  )}

                  {/* Sous-panneau 5 : Ajouter une Vidéo (Google Drive / YouTube / MP4) */}
                  {activeMediaTab === 'video' && (
                    <div className="bg-rose-50/80 border border-rose-200 rounded-2xl p-4 space-y-3 text-xs animate-fadeIn">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-rose-950 uppercase">
                          🎬 Ajouter une Vidéo (Lien Google Drive, YouTube ou MP4)
                        </span>
                        {activeEx.videoUrl && (
                          <button
                            type="button"
                            onClick={() => handleUpdateExerciseField(safeCritIdx, safeExIdx, { videoUrl: undefined, videoCaption: undefined })}
                            className="text-rose-600 font-bold hover:underline"
                          >
                            ✕ Supprimer la vidéo
                          </button>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          type="text"
                          value={activeEx.videoUrl || ''}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { videoUrl: e.target.value })}
                          placeholder="Collez un lien YouTube (https://youtu.be/...), Google Drive ou MP4..."
                          className="p-2 bg-white border border-rose-300 rounded-xl"
                        />
                        <input
                          type="text"
                          value={activeEx.videoCaption || ''}
                          onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { videoCaption: e.target.value })}
                          placeholder="Titre ou consigne de visionnage de la vidéo..."
                          className="p-2 bg-white border border-rose-300 rounded-xl"
                        />
                      </div>
                    </div>
                  )}

                  {/* Sous-panneau 6 : Module interactif (Tableau, Étiquettes à glisser, Labo) */}
                  {activeMediaTab === 'interactive' && (
                    <div className="bg-emerald-50/60 border border-emerald-200 rounded-2xl p-3 animate-fadeIn">
                      <InteractiveExerciseWidgets
                        module={activeEx.interactiveModule}
                        subject={draftEval.subject || ''}
                        isTeacherEditMode={true}
                        onUpdateModule={newMod =>
                          handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                            interactiveModule: newMod,
                          })
                        }
                        currentAnswer=""
                        onUpdateAnswer={() => {}}
                      />
                    </div>
                  )}

                  {/* ── APERÇU EN DIRECT DES SUPPORTS ATTACHÉS À L'EXERCICE ── */}
                  {activeEx.documentContent && (
                    <div className="bg-amber-50/70 border border-amber-200 border-l-4 border-l-amber-600 rounded-xl p-3.5 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-black uppercase text-amber-900 flex items-center gap-1.5">
                          <span>📚</span>
                          <span>{stripHtmlTags(activeEx.documentTitle || 'Document de référence')}</span>
                        </span>
                        <button
                          type="button"
                          onClick={() => setActiveMediaTab('document')}
                          className="text-[11px] font-bold text-amber-800 hover:underline"
                        >
                          ✏️ Modifier le document
                        </button>
                      </div>
                      <RichExerciseContent content={activeEx.documentContent} className="text-xs text-slate-800 font-serif leading-relaxed" />
                    </div>
                  )}

                  {activeEx.imageUrl && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-center space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] text-slate-500 px-1">
                        <span className="font-bold">🖼️ Support visuel de l'exercice</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateExerciseField(safeCritIdx, safeExIdx, { imageUrl: '', imageCaption: '' })}
                          className="text-rose-600 font-bold hover:underline"
                        >
                          ✕ Supprimer
                        </button>
                      </div>
                      {activeEx.imageUrl.startsWith('<svg') ? (
                        <div
                          className="max-h-56 mx-auto flex items-center justify-center [&>svg]:max-h-56 [&>svg]:w-auto"
                          dangerouslySetInnerHTML={{ __html: activeEx.imageUrl }}
                        />
                      ) : (
                        <img
                          src={resolveArtworkOrImage(activeEx.imageUrl, activeEx.imageCaption)?.imageUrl || convertGoogleDriveUrl(activeEx.imageUrl) || activeEx.imageUrl}
                          alt={stripHtmlTags(activeEx.imageCaption || 'Illustration')}
                          referrerPolicy="no-referrer"
                          className="max-h-56 mx-auto rounded-lg border border-slate-200 bg-white object-contain"
                        />
                      )}
                      {activeEx.imageCaption && (
                        <p className="text-xs font-bold text-slate-700 italic">{stripHtmlTags(activeEx.imageCaption)}</p>
                      )}
                    </div>
                  )}

                  {activeEx.audioUrl && (
                    <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-950">
                        <span>🎧 {activeEx.audioCaption || 'Support Audio'}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateExerciseField(safeCritIdx, safeExIdx, { audioUrl: undefined, audioCaption: undefined })}
                          className="text-rose-600 text-[11px] hover:underline"
                        >
                          ✕ Supprimer
                        </button>
                      </div>
                      {extractGoogleDriveId(activeEx.audioUrl) ? (
                        <iframe
                          src={`https://drive.google.com/file/d/${extractGoogleDriveId(activeEx.audioUrl)}/preview`}
                          className="w-full h-14 rounded-lg border border-indigo-200 bg-white"
                          allow="autoplay"
                          title="Lecteur Audio Drive"
                        />
                      ) : (
                        <audio controls src={activeEx.audioUrl} className="w-full h-9" />
                      )}
                    </div>
                  )}

                  {activeEx.videoUrl && (
                    <div className="bg-slate-900 text-white rounded-xl p-3 space-y-2">
                      <div className="flex items-center justify-between text-xs font-bold text-indigo-200">
                        <span>🎬 {activeEx.videoCaption || 'Support Vidéo'}</span>
                        <button
                          type="button"
                          onClick={() => handleUpdateExerciseField(safeCritIdx, safeExIdx, { videoUrl: undefined, videoCaption: undefined })}
                          className="text-rose-400 text-[11px] hover:underline"
                        >
                          ✕ Supprimer
                        </button>
                      </div>
                      {(() => {
                        const driveId = extractGoogleDriveId(activeEx.videoUrl);
                        const ytMatch = activeEx.videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                        if (ytMatch?.[1]) {
                          return (
                            <iframe
                              src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                              className="w-full aspect-video rounded-lg bg-black"
                              allowFullScreen
                              title="Vidéo YouTube"
                            />
                          );
                        }
                        if (driveId) {
                          return (
                            <iframe
                              src={`https://drive.google.com/file/d/${driveId}/preview`}
                              className="w-full aspect-video rounded-lg bg-black"
                              allow="autoplay"
                              allowFullScreen
                              title="Vidéo Drive"
                            />
                          );
                        }
                        return <video controls src={activeEx.videoUrl} className="w-full max-h-60 rounded-lg bg-black mx-auto" />;
                      })()}
                    </div>
                  )}
                </div>

                {/* ── LISTE DES QUESTIONS DE L'EXERCICE (Q1, Q2, Q3... COMME SUR L'IMAGE DE RÉFÉRENCE) ── */}
                <div className="bg-slate-50/70 border border-slate-200/90 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-black text-xs sm:text-sm text-slate-900 flex items-center gap-2">
                      <span className="text-purple-700">☰</span>
                      <span>Questions de l'exercice</span>
                    </h4>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      Cliquez sur ✏️ pour modifier l'énoncé, le type (QCM/Vrai-Faux) ou l'aspect (i, ii, iii)
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {displayQuestionsList.map((qItem, qIdx) => {
                      const isEditingThis = editingSubIdx === qIdx;
                      return (
                        <div
                          key={qIdx}
                          className={`bg-white rounded-xl border transition shadow-2xs ${
                            isEditingThis ? 'border-purple-400 ring-2 ring-purple-100' : 'border-slate-200/90 hover:border-purple-300'
                          }`}
                        >
                          {/* Ligne principale Q1 / Q2 / Q3 */}
                          <div className="p-3 flex items-center justify-between gap-3">
                            <div
                              onClick={() => setEditingSubIdx(isEditingThis ? null : qIdx)}
                              className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer"
                            >
                              <span className="px-2.5 py-1 rounded-lg bg-gradient-to-r from-purple-600 to-indigo-600 text-white font-black text-xs flex-shrink-0 shadow-2xs">
                                {qItem.label}
                              </span>
                              <div className="flex-1 min-w-0">
                                <div className="font-bold text-xs sm:text-sm text-slate-900 leading-snug">
                                  <RichExerciseContent content={qItem.content || `Question ${qIdx + 1}`} />
                                </div>
                                <div className="flex items-center gap-2 mt-1 flex-wrap">
                                  <span className="text-[10px] font-black text-red-700 bg-red-50 border border-red-200 px-2 py-0.5 rounded">
                                    Aspect ({qItem.strandIndex}) : {qItem.strandText || 'Objectif du critère'}
                                  </span>
                                  {qItem.type !== 'open' && (
                                    <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                                      {qItem.type === 'multiple_choice' ? '☑️ QCM' : '⚖️ Vrai / Faux'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Boutons d'action à droite (✏️ Éditer, 📋 Dupliquer, 🗑️ Supprimer) */}
                            <div className="flex items-center gap-1 flex-shrink-0">
                              <button
                                type="button"
                                onClick={() => setEditingSubIdx(isEditingThis ? null : qIdx)}
                                className={`p-2 rounded-lg border transition ${
                                  isEditingThis
                                    ? 'bg-purple-600 text-white border-purple-600'
                                    : 'bg-slate-50 hover:bg-blue-50 text-blue-600 border-slate-200'
                                }`}
                                title="Modifier cette question"
                              >
                                <Edit3 size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateSubQuestion(safeCritIdx, safeExIdx, qIdx)}
                                className="p-2 rounded-lg bg-slate-50 hover:bg-indigo-50 text-indigo-600 border border-slate-200 transition"
                                title="Dupliquer cette question"
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  if (qItem.isVirtualMain) {
                                    handleDeleteExercise(safeCritIdx, safeExIdx);
                                  } else {
                                    handleDeleteSubQuestion(safeCritIdx, safeExIdx, qIdx);
                                  }
                                }}
                                className="p-2 rounded-lg bg-rose-50/70 hover:bg-rose-100 text-rose-600 border border-rose-200 transition"
                                title="Supprimer cette question"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* Tiroir d'édition en ligne de la question Q1 / Q2 / Q3 */}
                          {isEditingThis && (
                            <div className="px-3.5 pb-3.5 pt-2 border-t border-slate-100 bg-purple-50/30 space-y-3 text-xs animate-fadeIn">
                              <div>
                                <label className="font-bold text-slate-700 block mb-1">
                                  Énoncé de la question {qItem.label} :
                                </label>
                                <textarea
                                  value={qItem.content}
                                  onChange={e => {
                                    if (qItem.isVirtualMain) {
                                      handleUpdateExerciseField(safeCritIdx, safeExIdx, { content: e.target.value });
                                    } else {
                                      handleUpdateSubQuestionField(safeCritIdx, safeExIdx, qIdx, { content: e.target.value });
                                    }
                                  }}
                                  rows={2}
                                  className="w-full p-2.5 bg-white border border-purple-300 rounded-xl font-semibold text-slate-900 outline-none"
                                />
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                                {/* Choix de l'aspect du critère */}
                                <div>
                                  <label className="font-bold text-slate-700 block mb-1">
                                    Aspect évalué (Critère {activeCrit.criterion}) :
                                  </label>
                                  <select
                                    value={qItem.strandIndex}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const matched = activeOfficialStrands.find(s => s.roman === val);
                                      const desc = matched?.text || qItem.strandText;
                                      if (qItem.isVirtualMain) {
                                        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                                          strandIndex: val,
                                          strandText: desc,
                                          criterionReference: `Critère ${activeCrit.criterion} : ${val}.`,
                                        });
                                      } else {
                                        handleUpdateSubQuestionField(safeCritIdx, safeExIdx, qIdx, {
                                          strandIndex: val,
                                          strandText: desc,
                                        });
                                      }
                                    }}
                                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
                                  >
                                    {activeOfficialStrands.map(st => (
                                      <option key={st.roman} value={st.roman}>
                                        ({st.roman}) {st.text.slice(0, 55)}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {/* Type de réponse */}
                                <div>
                                  <label className="font-bold text-slate-700 block mb-1">
                                    Format de réponse :
                                  </label>
                                  <select
                                    value={qItem.type}
                                    onChange={e => {
                                      const val = e.target.value as 'open' | 'multiple_choice' | 'true_false';
                                      const defaultOpts =
                                        val === 'multiple_choice'
                                          ? ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']
                                          : val === 'true_false'
                                          ? ['Vrai', 'Faux']
                                          : undefined;
                                      if (qItem.isVirtualMain) {
                                        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                                          type: val,
                                          options: defaultOpts || activeEx.options,
                                        });
                                      } else {
                                        handleUpdateSubQuestionField(safeCritIdx, safeExIdx, qIdx, {
                                          type: val,
                                          options: defaultOpts || qItem.options,
                                        });
                                      }
                                    }}
                                    className="w-full p-2 bg-white border border-slate-300 rounded-xl font-bold text-slate-800"
                                  >
                                    <option value="open">📝 Réponse rédigée / Calcul</option>
                                    <option value="multiple_choice">☑️ QCM (Choix multiples)</option>
                                    <option value="true_false">⚖️ Vrai / Faux</option>
                                  </select>
                                </div>
                              </div>

                              {/* Options QCM si QCM sélectionné */}
                              {qItem.type === 'multiple_choice' && (
                                <div className="space-y-1.5 bg-white p-3 rounded-xl border border-slate-200">
                                  <span className="font-bold text-slate-700 block">Propositions du QCM :</span>
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {(qItem.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, oIdx) => (
                                      <input
                                        key={oIdx}
                                        type="text"
                                        value={opt}
                                        onChange={e => {
                                          const nextOpts = [...(qItem.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'])];
                                          nextOpts[oIdx] = e.target.value;
                                          if (qItem.isVirtualMain) {
                                            handleUpdateExerciseField(safeCritIdx, safeExIdx, { options: nextOpts });
                                          } else {
                                            handleUpdateSubQuestionField(safeCritIdx, safeExIdx, qIdx, { options: nextOpts });
                                          }
                                        }}
                                        className="p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-semibold"
                                      />
                                    ))}
                                  </div>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* Boutons d'ajout en bas de la carte d'exercice (Exactement comme l'image de référence) */}
                  <div className="pt-2 flex items-center justify-center gap-3 flex-wrap">
                    <button
                      type="button"
                      onClick={() => handleAddQuickExercise(safeCritIdx, 'open')}
                      className="px-4 py-2.5 rounded-xl border-2 border-purple-300 bg-white hover:bg-purple-50 text-purple-800 font-black text-xs flex items-center gap-1.5 shadow-2xs transition"
                    >
                      <Plus size={14} />
                      <span>Ajouter une question</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleAddSubQuestion(safeCritIdx, safeExIdx)}
                      className="px-4 py-2.5 rounded-xl border-2 border-indigo-300 bg-white hover:bg-indigo-50 text-indigo-800 font-black text-xs flex items-center gap-1.5 shadow-2xs transition"
                    >
                      <Plus size={14} />
                      <span>Ajouter une sous-question</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </main>

          {/* ─────────────────────────────────────────────────────────────────
              COLONNE DROITE (3 cols) : PARAMÈTRES DE L'EXERCICE & ASPECTS IB
              ───────────────────────────────────────────────────────────────── */}
          <aside className="lg:col-span-3 bg-white rounded-2xl border border-slate-200/90 shadow-xs flex flex-col overflow-hidden">
            <div className="p-3.5 border-b border-slate-100 bg-indigo-50/60 flex items-center gap-2">
              <Settings size={17} className="text-indigo-700" />
              <h3 className="font-black text-xs sm:text-sm text-slate-900">
                Paramètres de l'exercice
              </h3>
            </div>

            {activeCrit && activeEx ? (
              <div className="flex-1 overflow-y-auto p-4 space-y-5 text-xs">
                {/* 1. Titre de l'exercice */}
                <div>
                  <label className="font-black text-slate-800 block mb-1.5">
                    Titre de l'exercice
                  </label>
                  <input
                    type="text"
                    value={activeEx.title}
                    onChange={e => handleUpdateExerciseField(safeCritIdx, safeExIdx, { title: e.target.value })}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 focus:bg-white focus:border-purple-500 rounded-xl font-bold text-slate-900 outline-none transition"
                  />
                </div>

                {/* 2. Critère(s) concerné(s) (A, B, C, D) */}
                <div>
                  <label className="font-black text-slate-800 block mb-2">
                    Critère(s) concerné(s)
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['A', 'B', 'C', 'D'] as const).map(letter => {
                      const isCurrentCrit = activeCrit.criterion === letter;
                      const existsInEval = draftEval.assessments.some(a => a.criterion === letter);
                      return (
                        <label
                          key={letter}
                          onClick={() => handleAssignExerciseToCriterion(letter)}
                          className={`p-2 rounded-xl border-2 cursor-pointer flex items-center justify-center gap-1.5 font-black text-xs transition ${
                            isCurrentCrit
                              ? 'bg-blue-50 border-blue-600 text-blue-900 shadow-2xs'
                              : existsInEval
                              ? 'bg-white border-slate-300 text-slate-700 hover:border-purple-300'
                              : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                          }`}
                          title={`Assigner cet exercice au Critère ${letter} (${getStandardIBCriterion(draftEval.subject, letter).name})`}
                        >
                          <input
                            type="checkbox"
                            checked={isCurrentCrit}
                            onChange={() => {}}
                            className="w-4 h-4 rounded text-blue-600 pointer-events-none"
                          />
                          <span>{letter}</span>
                        </label>
                      );
                    })}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1.5">
                    Objectif : <strong className="text-slate-700">Critère {activeCrit.criterion} – {activeCrit.criterionName}</strong>
                  </p>
                </div>

                {/* 3. Aspect(s) & Sous-aspect(s) officiels du Critère (i, ii, iii, iv) pour la matière et la classe */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="font-black text-slate-800">
                      Aspect(s) du critère {activeCrit.criterion}
                    </label>
                    <span className="text-[10px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded">
                      {draftEval.grade}
                    </span>
                  </div>

                  <div className="space-y-2.5">
                    {activeOfficialStrands.map(st => {
                      const isUsedInMain = activeEx.strandIndex === st.roman;
                      const isUsedInSubs = Boolean(
                        activeEx.subQuestions &&
                        activeEx.subQuestions.some(sq => sq.strandIndex === st.roman)
                      );
                      const isChecked = isUsedInMain || isUsedInSubs;

                      return (
                        <div
                          key={st.roman}
                          onClick={() => handleToggleStrandOnExercise(st.roman, st.text)}
                          className={`p-2.5 rounded-xl border cursor-pointer flex items-start gap-2.5 transition ${
                            isChecked
                              ? 'bg-blue-50/70 border-blue-300 text-slate-900 shadow-2xs'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {}}
                            className="mt-0.5 w-4 h-4 rounded text-blue-600 flex-shrink-0 pointer-events-none"
                          />
                          <div className="flex-1 min-w-0">
                            <span className="font-black text-slate-900 mr-1.5">{st.roman}.</span>
                            <span className="text-[11px] leading-snug font-medium">{st.text}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* 4. Options complémentaires de l'exercice (Espace géométrie, Corrigé type) */}
                <div className="pt-2 border-t border-slate-100 space-y-3">
                  <label className="flex items-center gap-2 font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={Boolean(activeEx.workspaceNeeded)}
                      onChange={e =>
                        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                          workspaceNeeded: e.target.checked,
                        })
                      }
                      className="w-4 h-4 rounded text-purple-600"
                    />
                    <span>📐 Activer la table de dessin / géométrie pour l'élève</span>
                  </label>

                  <div>
                    <label className="font-black text-slate-800 block mb-1">
                      Corrigé indicatif / Réponse attendue :
                    </label>
                    <textarea
                      value={activeEx.answer || activeEx.correctAnswer || ''}
                      onChange={e =>
                        handleUpdateExerciseField(safeCritIdx, safeExIdx, {
                          answer: e.target.value,
                        })
                      }
                      rows={3}
                      placeholder="Éléments de réponse attendus pour guider la correction IA et enseignant..."
                      className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-purple-500 outline-none"
                    />
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-slate-400 text-xs">
                Sélectionnez un exercice à gauche pour afficher ses paramètres.
              </div>
            )}
          </aside>
        </div>
      ) : (
        /* ═════════════════════════════════════════════════════════════════════
           MODE APERÇU FEUILLE D'EXAMEN ÉLÈVE COMPLÈTE (SCROLLABLE & TESTABLE)
           ═════════════════════════════════════════════════════════════════════ */
        <div className="flex-1 overflow-y-auto bg-slate-100 text-slate-900">
          {/* Barre sticky de simulation élève */}
          <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sticky top-0 z-20 shadow-xs">
            <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-xs shadow">
                  PEI
                </div>
                <div>
                  <h3 className="font-black text-xs sm:text-sm text-slate-800">{draftEval.title}</h3>
                  <p className="text-[11px] text-slate-500">
                    Aperçu en conditions réelles · {draftEval.subject} ({draftEval.grade})
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {layout.showCalculator !== false && (
                  <button
                    type="button"
                    onClick={() => setIsCalculatorOpen(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-black shadow-xs transition"
                  >
                    <Calculator size={14} />
                    <span>Calculatrice Scientifique</span>
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setViewMode('studio')}
                  className="flex items-center gap-1.5 px-3.5 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black shadow-xs transition"
                >
                  <Edit3 size={13} />
                  <span>Retour au Studio d'Édition</span>
                </button>
              </div>
            </div>
          </div>

          <div className="max-w-5xl mx-auto w-full p-4 sm:p-6 space-y-6">
            {/* En-tête officiel de la copie élève */}
            <div className="bg-white rounded-3xl border-2 border-slate-300 shadow-xs overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 bg-white/10 px-2.5 py-0.5 rounded-md">
                    Les Écoles Internationales Al-Kawthar · Baccalauréat International (PEI)
                  </span>
                  <h1 className="text-lg sm:text-xl font-black mt-1 text-white">{draftEval.title}</h1>
                </div>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="bg-white/15 px-3 py-1 rounded-xl font-bold text-purple-100">
                    📚 {draftEval.subject}
                  </span>
                  <span className="bg-white/15 px-3 py-1 rounded-xl font-bold text-purple-100">
                    🎓 {draftEval.grade}
                  </span>
                  <span className="bg-amber-400/20 border border-amber-300/40 px-3 py-1 rounded-xl font-black text-amber-200">
                    ⏱️ {draftEval.durationMinutes || 45} min
                  </span>
                </div>
              </div>

              {(draftEval.statementOfInquiry || draftEval.instructions) && (
                <div className="p-4 sm:p-5 space-y-2.5 bg-white text-xs">
                  {draftEval.statementOfInquiry && (
                    <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3">
                      <span className="font-black uppercase text-[10px] text-purple-800 mr-2">
                        🔎 Énoncé de recherche :
                      </span>
                      <span className="italic font-semibold text-purple-950">"{draftEval.statementOfInquiry}"</span>
                    </div>
                  )}
                  {draftEval.instructions && (
                    <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-amber-950">
                      <span className="font-black uppercase text-[10px] text-amber-800 block mb-1">
                        📌 Consignes générales :
                      </span>
                      <p className="text-xs leading-relaxed whitespace-pre-wrap">{draftEval.instructions}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Tous les critères et exercices tels que vus par l'élève */}
            {draftEval.assessments.map((crit, critIdx) => {
              const activeColors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
              return (
                <section key={crit.criterion} className="space-y-5">
                  <div className={`rounded-2xl p-4 sm:p-5 border-2 ${activeColors.border} ${activeColors.bg} shadow-2xs flex items-center justify-between flex-wrap gap-3`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl ${activeColors.badge} text-white font-black text-base flex items-center justify-center shadow-xs`}>
                        {crit.criterion}
                      </div>
                      <div>
                        <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${activeColors.light} ${activeColors.text}`}>
                          Critère {crit.criterion} · Objectif PEI
                        </span>
                        <h3 className="text-base sm:text-lg font-black text-slate-900 mt-0.5">
                          {crit.criterionName}
                        </h3>
                      </div>
                    </div>
                    <span className={`text-xs font-black px-3 py-1.5 rounded-xl border ${activeColors.border} bg-white ${activeColors.text}`}>
                      Barème : Niveau 1 à {crit.maxPoints || 8}
                    </span>
                  </div>

                  <div className="space-y-5">
                    {(crit.exercises || []).map((ex, exIdx) => {
                      const exerciseNum = getGlobalExerciseNumber(critIdx, exIdx);
                      const hasSubQuestions = Boolean(ex.subQuestions && ex.subQuestions.length > 0);
                      const editKey = `${crit.criterion}_${exIdx}`;

                      return (
                        <div
                          key={exIdx}
                          className="bg-white rounded-3xl p-6 border-2 border-slate-200 shadow-xs space-y-4"
                        >
                          <div className="flex items-center justify-between border-b border-slate-100 pb-3 flex-wrap gap-2">
                            <div className="flex items-center gap-3">
                              <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black text-white ${activeColors.badge}`}>
                                Exercice {exerciseNum}
                              </span>
                              <h4 className="font-black text-base text-slate-900">{ex.title}</h4>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                setActiveCriterionIdx(critIdx);
                                setActiveExerciseIdx(exIdx);
                                setLeftSection('exercises');
                                setViewMode('studio');
                              }}
                              className="px-3 py-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 font-bold text-xs border border-purple-200 flex items-center gap-1"
                            >
                              <Edit3 size={12} /> Modifier dans le Studio
                            </button>
                          </div>

                          {ex.documentContent && (
                            <div className="bg-amber-50/70 border-2 border-amber-200 border-l-4 border-l-amber-600 rounded-2xl p-4 space-y-1.5">
                              <div className="text-xs font-black uppercase text-amber-900">
                                📚 {stripHtmlTags(ex.documentTitle || 'Document de référence')}
                              </div>
                              <RichExerciseContent content={ex.documentContent} className="text-sm text-slate-800 font-serif leading-relaxed" />
                            </div>
                          )}

                          {ex.imageUrl && (
                            <div className="my-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                              {ex.imageUrl.startsWith('<svg') ? (
                                <div
                                  className="max-h-64 mx-auto flex items-center justify-center [&>svg]:max-h-64"
                                  dangerouslySetInnerHTML={{ __html: ex.imageUrl }}
                                />
                              ) : (
                                <img
                                  src={resolveArtworkOrImage(ex.imageUrl, ex.imageCaption)?.imageUrl || convertGoogleDriveUrl(ex.imageUrl) || ex.imageUrl}
                                  alt={stripHtmlTags(ex.imageCaption || 'Figure')}
                                  referrerPolicy="no-referrer"
                                  className="max-h-64 mx-auto rounded-xl border border-slate-200 bg-white object-contain"
                                />
                              )}
                              {ex.imageCaption && (
                                <p className="text-xs font-bold text-slate-700 italic mt-2">🖼️ {stripHtmlTags(ex.imageCaption)}</p>
                              )}
                            </div>
                          )}

                          {ex.audioUrl && (
                            <div className="bg-indigo-50/70 border border-indigo-200 rounded-2xl p-3.5 space-y-2">
                              <div className="text-xs font-black text-indigo-950">
                                🎧 {ex.audioCaption || 'Support Audio'}
                              </div>
                              {extractGoogleDriveId(ex.audioUrl) ? (
                                <iframe
                                  src={`https://drive.google.com/file/d/${extractGoogleDriveId(ex.audioUrl)}/preview`}
                                  className="w-full h-16 rounded-xl border border-indigo-200 bg-white"
                                  allow="autoplay"
                                  title="Audio"
                                />
                              ) : (
                                <audio controls src={ex.audioUrl} className="w-full h-10" />
                              )}
                            </div>
                          )}

                          {ex.videoUrl && (
                            <div className="bg-slate-900 rounded-2xl p-3.5 space-y-2 text-white">
                              <div className="text-xs font-black text-indigo-200">
                                🎬 {ex.videoCaption || 'Support Vidéo'}
                              </div>
                              {(() => {
                                const driveId = extractGoogleDriveId(ex.videoUrl);
                                const ytMatch = ex.videoUrl.match(/(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
                                if (ytMatch?.[1]) {
                                  return (
                                    <iframe
                                      src={`https://www.youtube.com/embed/${ytMatch[1]}`}
                                      className="w-full aspect-video rounded-xl bg-black"
                                      allowFullScreen
                                      title="Vidéo"
                                    />
                                  );
                                }
                                if (driveId) {
                                  return (
                                    <iframe
                                      src={`https://drive.google.com/file/d/${driveId}/preview`}
                                      className="w-full aspect-video rounded-xl bg-black"
                                      allow="autoplay"
                                      allowFullScreen
                                      title="Vidéo Drive"
                                    />
                                  );
                                }
                                return <video controls src={ex.videoUrl} className="w-full max-h-72 rounded-xl bg-black mx-auto" />;
                              })()}
                            </div>
                          )}

                          {ex.content && (
                            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200">
                              <RichExerciseContent content={ex.content} />
                            </div>
                          )}

                          <InteractiveExerciseWidgets
                            module={ex.interactiveModule}
                            subject={draftEval.subject || ''}
                            isTeacherEditMode={false}
                            currentAnswer={testAnswers[editKey] || ''}
                            onUpdateAnswer={val => setTestAnswers(prev => ({ ...prev, [editKey]: val }))}
                          />

                          {hasSubQuestions ? (
                            <div className="space-y-4">
                              {(ex.subQuestions || []).map((sub, sIdx) => {
                                const subKey = `${crit.criterion}_${exIdx}_sub_${sIdx}`;
                                return (
                                  <div key={sub.id || sIdx} className="bg-slate-50/80 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                                    <div className="flex items-start gap-2.5">
                                      <span className="font-black text-xs text-white bg-purple-700 px-2.5 py-1 rounded-lg">
                                        {sub.label || `Q${sIdx + 1}`}
                                      </span>
                                      <div className="font-bold text-sm text-slate-900">
                                        <RichExerciseContent content={sub.content} />
                                      </div>
                                    </div>
                                    {layout.showStrandBadges !== false && (
                                      <div className="text-[11px] font-bold text-red-700 bg-red-50 px-2.5 py-1 rounded-lg border border-red-200 w-fit">
                                        ● Aspect ({sub.strandIndex || 'i'}) : {sub.strandText}
                                      </div>
                                    )}
                                    {layout.showMathToolbar !== false && (
                                      <MathSymbolsAndBracketsToolbar
                                        compact
                                        targetKey={subKey}
                                        onInsertSymbol={handleInsertTestSymbol}
                                        onOpenCalculator={layout.showCalculator !== false ? () => setIsCalculatorOpen(true) : undefined}
                                      />
                                    )}
                                    <textarea
                                      id={`preview_textarea_${subKey}`}
                                      value={testAnswers[subKey] || ''}
                                      onFocus={() => {
                                        setActiveTextareaKey(subKey);
                                        setActiveTextareaLabel(`Ex ${exerciseNum} - ${sub.label || `Q${sIdx + 1}`}`);
                                      }}
                                      onChange={e => setTestAnswers(prev => ({ ...prev, [subKey]: e.target.value }))}
                                      rows={sub.expectedLines || layout.answerBoxRows || 3}
                                      placeholder="Zone de réponse de l'élève (testez la saisie ici)..."
                                      className="w-full p-3 bg-white border border-slate-300 rounded-xl text-sm font-mono outline-none focus:border-purple-500"
                                    />
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {layout.showMathToolbar !== false && (
                                <MathSymbolsAndBracketsToolbar
                                  compact
                                  targetKey={editKey}
                                  onInsertSymbol={handleInsertTestSymbol}
                                  onOpenCalculator={layout.showCalculator !== false ? () => setIsCalculatorOpen(true) : undefined}
                                />
                              )}
                              <textarea
                                id={`preview_textarea_${editKey}`}
                                value={testAnswers[editKey] || ''}
                                onFocus={() => {
                                  setActiveTextareaKey(editKey);
                                  setActiveTextareaLabel(`Exercice ${exerciseNum}`);
                                }}
                                onChange={e => setTestAnswers(prev => ({ ...prev, [editKey]: e.target.value }))}
                                rows={ex.expectedLines || layout.answerBoxRows || 4}
                                placeholder="Zone de réponse de l'élève (testez la saisie ici)..."
                                className="w-full p-3.5 bg-slate-50 focus:bg-white border border-slate-300 rounded-2xl text-sm font-mono outline-none focus:border-purple-500"
                              />
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
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALE DE PUBLICATION AUX ÉLÈVES (Code d'accès, Lien direct, Google Classroom)
          ═══════════════════════════════════════════════════════════════════════ */}
      {showPublishModal && (
        <div className="fixed inset-0 z-[130] bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full overflow-hidden border border-slate-200 animate-fadeIn">
            <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 text-white p-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                  <Share2 size={20} />
                </div>
                <div>
                  <h3 className="font-black text-base">Publier l'évaluation aux élèves</h3>
                  <p className="text-xs text-purple-200">{draftEval.title} · {draftEval.grade}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/10"
              >
                <X size={18} />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs">
              <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3.5 text-emerald-900 font-semibold flex items-center gap-2">
                <CheckCircle size={18} className="text-emerald-600 flex-shrink-0" />
                <span>Votre évaluation est enregistrée et active. Partagez le code ou le lien direct avec vos élèves :</span>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">Code d'accès unique de la classe</span>
                  <span className="font-mono font-black text-xl text-purple-900 tracking-wider">{draftEval.accessCode}</span>
                </div>
                <button
                  type="button"
                  onClick={() => handleCopyPublishInfo('code')}
                  className="px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl flex items-center gap-1.5"
                >
                  <Copy size={13} />
                  <span>{copiedLinkType === 'code' ? 'Copié !' : 'Copier le Code'}</span>
                </button>
              </div>

              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => handleCopyPublishInfo('link')}
                  className="w-full py-3 px-4 bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border border-indigo-200 rounded-2xl font-black flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <ExternalLink size={15} className="text-indigo-600" />
                    <span>Copier le lien direct Élève (Tablettes / PC)</span>
                  </span>
                  <span className="text-indigo-700">{copiedLinkType === 'link' ? '✓ Lien copié !' : 'Copier'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleCopyPublishInfo('classroom')}
                  className="w-full py-3 px-4 bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-200 rounded-2xl font-black flex items-center justify-between transition"
                >
                  <span className="flex items-center gap-2">
                    <Share2 size={15} className="text-amber-600" />
                    <span>Copier l'annonce complète pour Google Classroom</span>
                  </span>
                  <span className="text-amber-800">{copiedLinkType === 'classroom' ? '✓ Annonce copiée !' : 'Copier'}</span>
                </button>
              </div>
            </div>

            <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setShowPublishModal(false)}
                className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold rounded-xl text-xs"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Calculatrice scientifique flottante pour tester */}
      <ScientificCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        activeTargetLabel={activeTextareaLabel}
        onInsertText={val => {
          if (activeTextareaKey) {
            handleInsertTestSymbol(activeTextareaKey, val);
          }
        }}
      />

      {/* Modale d'impression du Sujet Vierge Officiel A4 */}
      {showPrintModal && (
        <EvaluationPrintView
          evaluation={draftEval}
          submission={null}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Modale de génération IA ciblée */}
      {aiModalTarget && draftEval.assessments[aiModalTarget.critIdx] && (
        <GenerateCriterialQuestionModal
          isOpen={true}
          onClose={() => setAiModalTarget(null)}
          subject={draftEval.subject}
          gradeLevel={draftEval.grade}
          unitTitle={draftEval.unitTitle || draftEval.title}
          statementOfInquiry={draftEval.statementOfInquiry}
          criterion={draftEval.assessments[aiModalTarget.critIdx].criterion as 'A' | 'B' | 'C' | 'D'}
          criterionName={draftEval.assessments[aiModalTarget.critIdx].criterionName}
          availableStrands={draftEval.assessments[aiModalTarget.critIdx].strands || []}
          initialStrandIndex={aiModalTarget.initialStrand}
          initialQuestionType={aiModalTarget.initialType}
          targetQuestionIndex={aiModalTarget.exIdx}
          existingQuestionsCount={draftEval.assessments[aiModalTarget.critIdx].exercises?.length || 0}
          onAddQuestion={generatedEx => {
            const cIdx = aiModalTarget.critIdx;
            const nextAssessments = draftEval.assessments.map((c, idx) =>
              idx === cIdx ? { ...c, exercises: [...(c.exercises || []), generatedEx] } : c
            );
            setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
            setAiModalTarget(null);
          }}
          onReplaceQuestion={(targetIdx, generatedEx) => {
            const cIdx = aiModalTarget.critIdx;
            const nextAssessments = draftEval.assessments.map((c, idx) => {
              if (idx !== cIdx) return c;
              const currentExercises = [...(c.exercises || [])];
              if (currentExercises[targetIdx]) {
                currentExercises[targetIdx] = generatedEx;
              } else {
                currentExercises.push(generatedEx);
              }
              return { ...c, exercises: currentExercises };
            });
            setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
            setAiModalTarget(null);
          }}
        />
      )}
    </div>
  );
};

export default StudentViewLayoutEditorModal;
