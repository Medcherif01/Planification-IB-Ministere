import React, { useState, useEffect } from 'react';
import {
  X, Eye, Edit3, Save, CheckCircle, ChevronLeft, ChevronRight,
  Printer, Send, Copy, Check, Sparkles, Plus, Trash2, HelpCircle,
  ChevronDown, ChevronUp
} from 'lucide-react';
import { UnitPlan, AssessmentData, AssessmentExercise, AssessmentSubQuestion, OnlineEvaluation } from '../types';
import EvaluationPrintView from './EvaluationPrintView';
import GenerateCriterialQuestionModal from './GenerateCriterialQuestionModal';
import StudentViewLayoutEditorModal from './StudentViewLayoutEditorModal';
import { createOrUpdateEvaluation } from '../services/onlineEvaluationService';
import { isEnglishSubject, GenerateQuestionOptions } from '../services/criterialQuestionGeneratorService';
import { generateCleanStudentCodesForEvaluation } from '../services/studentRosterService';

interface AssessmentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: UnitPlan | null;
  onUpdateUnit?: (plan: UnitPlan) => void;
  onOpenOnlineManager?: (plan: UnitPlan) => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; light: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',    badge: 'bg-blue-600',    light: 'bg-blue-100' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', light: 'bg-emerald-100' },
  C: { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',   badge: 'bg-amber-600',   light: 'bg-amber-100' },
  D: { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-800',    badge: 'bg-rose-600',    light: 'bg-rose-100' },
};

const AssessmentViewerModal: React.FC<AssessmentViewerModalProps> = ({
  isOpen, onClose, plan, onUpdateUnit, onOpenOnlineManager,
}) => {
  const [assessments, setAssessments] = useState<AssessmentData[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [showStudentViewModal, setShowStudentViewModal] = useState(false);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [publishedRosterCount, setPublishedRosterCount] = useState<number>(0);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [showRubric, setShowRubric] = useState(false);

  // Modal de génération de question avec l'IA (soit pour ajouter, soit pour remplacer une question précise)
  const [showAiQuestionModal, setShowAiQuestionModal] = useState(false);
  const [aiTargetQuestionIdx, setAiTargetQuestionIdx] = useState<number | null>(null);
  const [aiInitialStrand, setAiInitialStrand] = useState<string>('i');
  const [aiInitialType, setAiInitialType] = useState<GenerateQuestionOptions['questionType']>('multiple_choice');

  const isEn = plan ? isEnglishSubject(plan.subject) : false;

  useEffect(() => {
    if (!isOpen || !plan) return;
    setAssessments(plan.assessments ? plan.assessments.map(a => JSON.parse(JSON.stringify(a))) : []);
    setActiveIdx(0);
    setHasUnsavedChanges(false);
    setSaveStatus('idle');
    setPublishedCode(null);
    setPublishedRosterCount(0);
    setShowAiQuestionModal(false);
    setAiTargetQuestionIdx(null);
    setShowRubric(false);
  }, [isOpen, plan?.id]);

  if (!isOpen || !plan) return null;

  const persistChanges = (updatedAssessments: AssessmentData[]) => {
    setAssessments(updatedAssessments);
    setHasUnsavedChanges(true);
    if (onUpdateUnit) {
      onUpdateUnit({ ...plan, assessments: updatedAssessments });
      setHasUnsavedChanges(false);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 2500);
    }
  };

  const handlePublishOnline = async () => {
    if (!plan || assessments.length === 0) return;
    setIsPublishing(true);
    try {
      const accessCode = `EVAL-${Math.floor(1000 + Math.random() * 9000)}`;
      const { codes, rosterCount } = await generateCleanStudentCodesForEvaluation(
        accessCode,
        plan.gradeLevel || 'PEI 1',
        25
      );
      const newEval = await createOrUpdateEvaluation({
        accessCode,
        title: isEn ? `Assessment: ${plan.title}` : `Évaluation : ${plan.title}`,
        subject: plan.subject || '',
        grade: plan.gradeLevel || '',
        unitId: plan.id,
        unitTitle: plan.title,
        teacherName: plan.teacherName || 'Teacher',
        statementOfInquiry: plan.statementOfInquiry,
        globalContext: plan.globalContext,
        keyConcept: plan.keyConcept,
        relatedConcepts: plan.relatedConcepts,
        assessments: assessments,
        durationMinutes: 45,
        status: 'active',
        studentAccessCodes: codes,
      });
      setPublishedCode(newEval.accessCode);
      setPublishedRosterCount(rosterCount);
    } catch (err: any) {
      alert(`Erreur activation en ligne : ${err.message || 'Veuillez réessayer'}`);
    } finally {
      setIsPublishing(false);
    }
  };

  const getEvaluationForPrint = (): OnlineEvaluation => ({
    id: plan.id,
    accessCode: publishedCode || 'EVAL-0000',
    title: isEn ? `Criterion-based Assessment — ${plan.title}` : `Évaluation critériée — ${plan.title}`,
    subject: plan.subject || '',
    grade: plan.gradeLevel || '',
    unitId: plan.id,
    unitTitle: plan.title,
    teacherName: plan.teacherName || (isEn ? 'Teacher' : 'Enseignant'),
    createdAt: new Date().toISOString(),
    status: 'active',
    statementOfInquiry: plan.statementOfInquiry,
    globalContext: plan.globalContext,
    keyConcept: plan.keyConcept,
    relatedConcepts: plan.relatedConcepts,
    assessments: assessments,
  });

  const active = assessments[activeIdx];
  const colors = active ? (CRITERION_COLORS[active.criterion] || CRITERION_COLORS.A) : CRITERION_COLORS.A;

  // ── Helpers d'édition directe ────────────────────────────────────────────────
  const updateExerciseFields = (exIdx: number, updates: Partial<AssessmentExercise>) => {
    const next = assessments.map((a, i) => {
      if (i !== activeIdx) return a;
      const exercises = (a.exercises || []).map((ex, ei) => ei === exIdx ? { ...ex, ...updates } : ex);
      return { ...a, exercises };
    });
    setAssessments(next);
    setHasUnsavedChanges(true);
  };

  // Changer la nature / modalité d'une question existante (QCM, Vrai/Faux, Sous-questions, Rédaction)
  const handleChangeExerciseKind = (
    exIdx: number,
    kind: 'open' | 'multiple_choice' | 'true_false' | 'subquestions'
  ) => {
    if (!active) return;
    const ex = active.exercises[exIdx];
    if (!ex) return;

    if (kind === 'subquestions') {
      const defaultSub: AssessmentSubQuestion[] =
        ex.subQuestions && ex.subQuestions.length > 0
          ? ex.subQuestions
          : [
              {
                id: `sub_${Date.now()}_1`,
                label: '1)',
                content: isEn ? 'Sub-question 1...' : 'Sous-question 1...',
                strandIndex: 'i',
                strandText: active.strands?.[0]?.replace(/^[ivx]+[\.\)]\s*/i, '') || '',
                type: 'open',
              },
              {
                id: `sub_${Date.now()}_2`,
                label: '2)',
                content: isEn ? 'Sub-question 2...' : 'Sous-question 2...',
                strandIndex: 'ii',
                strandText: active.strands?.[1]?.replace(/^[ivx]+[\.\)]\s*/i, '') || '',
                type: 'open',
              },
            ];
      updateExerciseFields(exIdx, { type: 'open', subQuestions: defaultSub });
    } else if (kind === 'multiple_choice') {
      const opts =
        ex.options && ex.options.length >= 2
          ? ex.options
          : isEn
          ? ['Option A', 'Option B', 'Option C', 'Option D']
          : ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'];
      updateExerciseFields(exIdx, {
        type: 'multiple_choice',
        subQuestions: [],
        options: opts,
        correctAnswer: ex.correctAnswer && opts.includes(ex.correctAnswer) ? ex.correctAnswer : opts[0],
      });
    } else if (kind === 'true_false') {
      updateExerciseFields(exIdx, {
        type: 'true_false',
        subQuestions: [],
        options: isEn ? ['True', 'False'] : ['Vrai', 'Faux'],
        correctAnswer: isEn ? 'True' : 'Vrai',
      });
    } else {
      updateExerciseFields(exIdx, {
        type: 'open',
        subQuestions: [],
      });
    }
  };

  // Changer le sous-aspect d'une question
  const handleChangeExerciseStrand = (exIdx: number, roman: string) => {
    if (!active) return;
    const matched = active.strands?.find(s =>
      s.trim().toLowerCase().startsWith(`${roman}.`) ||
      s.trim().toLowerCase().startsWith(`${roman})`)
    );
    const cleanDesc = matched ? matched.replace(/^[ivx]+[\.\)]\s*/i, '').trim() : '';
    updateExerciseFields(exIdx, {
      strandIndex: roman,
      strandText: cleanDesc,
      criterionReference: isEn
        ? `Criterion ${active.criterion} : strand ${roman}.${cleanDesc ? ` ${cleanDesc}` : ''}`
        : `Critère ${active.criterion} : ${roman}.${cleanDesc ? ` ${cleanDesc}` : ''}`,
    });
  };

  // Ajouter une nouvelle question via l'IA
  const handleAddQuestionFromAi = (question: AssessmentExercise) => {
    if (!active) return;
    const updated = assessments.map((a, i) =>
      i === activeIdx ? { ...a, exercises: [...(a.exercises || []), question] } : a
    );
    persistChanges(updated);
  };

  // Remplacer une question précise via l'IA
  const handleReplaceQuestionFromAi = (targetIdx: number, question: AssessmentExercise) => {
    if (!active) return;
    const updated = assessments.map((a, i) => {
      if (i !== activeIdx) return a;
      const exercises = [...(a.exercises || [])];
      exercises[targetIdx] = question;
      return { ...a, exercises };
    });
    persistChanges(updated);
  };

  // Ouvrir le générateur IA pour une question spécifique (ou pour une nouvelle question)
  const openAiGeneratorForQuestion = (exIdx: number | null) => {
    if (!active) return;
    if (exIdx !== null && active.exercises?.[exIdx]) {
      const ex = active.exercises[exIdx];
      const hasSub = Boolean(ex.subQuestions && ex.subQuestions.length > 0);
      const qType: GenerateQuestionOptions['questionType'] = hasSub
        ? 'subquestions'
        : ex.type === 'multiple_choice'
        ? 'multiple_choice'
        : ex.type === 'true_false'
        ? 'true_false'
        : 'open';
      setAiTargetQuestionIdx(exIdx);
      setAiInitialStrand(ex.strandIndex || 'i');
      setAiInitialType(qType);
    } else {
      const count = active.exercises?.length || 0;
      const romans = ['i', 'ii', 'iii', 'iv'];
      setAiTargetQuestionIdx(null);
      setAiInitialStrand(romans[count % romans.length]);
      setAiInitialType('multiple_choice');
    }
    setShowAiQuestionModal(true);
  };

  // Ajout manuel d'une nouvelle question
  const handleManualAddExercise = (type: 'open' | 'multiple_choice' | 'true_false' | 'subquestions') => {
    if (!active) return;
    const count = (active.exercises || []).length + 1;
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
    const roman = romanNumerals[(count - 1) % romanNumerals.length];
    const defaultStrand =
      active.strands?.find(s => s.toLowerCase().startsWith(`${roman}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') ||
      `Aspect ${roman}`;

    let newEx: AssessmentExercise;

    if (type === 'multiple_choice') {
      newEx = {
        title: isEn ? `Question ${count}: Multiple Choice` : `Question ${count} : QCM (Choix multiples)`,
        content: isEn ? 'Read carefully and select the correct option:' : 'Lisez attentivement l\'énoncé et cochez la bonne réponse :',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'multiple_choice',
        options: isEn ? ['Option A', 'Option B', 'Option C', 'Option D'] : ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
        correctAnswer: isEn ? 'Option A' : 'Proposition A',
        answer: '',
      };
    } else if (type === 'true_false') {
      newEx = {
        title: isEn ? `Question ${count}: True or False` : `Question ${count} : Vrai ou Faux`,
        content: isEn ? 'State whether the following statement is True or False and justify:' : 'Indiquez si l\'affirmation suivante est Vraie ou Fausse et justifiez :',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'true_false',
        correctAnswer: isEn ? 'True' : 'Vrai',
        answer: '',
      };
    } else if (type === 'subquestions') {
      newEx = {
        title: isEn ? `Question ${count}: Structured Problem` : `Question ${count} : Problème à sous-questions`,
        content: isEn ? 'Context and problem statement...' : 'Contexte et énoncé principal du problème...',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'open',
        subQuestions: [
          {
            id: `sub_${Date.now()}_1`,
            label: '1)',
            content: isEn ? 'First sub-question...' : 'Première sous-question...',
            strandIndex: 'i',
            strandText: active.strands?.[0]?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Aspect i',
            type: 'open',
          },
          {
            id: `sub_${Date.now()}_2`,
            label: '2)',
            content: isEn ? 'Second sub-question...' : 'Deuxième sous-question...',
            strandIndex: 'ii',
            strandText: active.strands?.[1]?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Aspect ii',
            type: 'open',
          },
        ],
      };
    } else {
      newEx = {
        title: isEn ? `Question ${count}: Open Question` : `Question ${count} : Question ouverte`,
        content: isEn ? 'Enter the question instructions here...' : 'Saisissez l\'énoncé de la question ici...',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'open',
        answer: '',
      };
    }

    const updated = assessments.map((a, i) =>
      i === activeIdx ? { ...a, exercises: [...(a.exercises || []), newEx] } : a
    );
    persistChanges(updated);
  };

  const handleDeleteExercise = (exIdx: number) => {
    if (!active) return;
    if (!window.confirm(isEn ? 'Delete this question?' : 'Voulez-vous supprimer cette question ?')) return;
    const updated = assessments.map((a, i) =>
      i === activeIdx ? { ...a, exercises: a.exercises.filter((_, ei) => ei !== exIdx) } : a
    );
    persistChanges(updated);
  };

  const handleDuplicateExercise = (exIdx: number) => {
    if (!active) return;
    const target = active.exercises[exIdx];
    if (!target) return;
    const duplicate: AssessmentExercise = JSON.parse(JSON.stringify(target));
    duplicate.title = `${duplicate.title} (${isEn ? 'Copy' : 'Copie'})`;
    const exercises = [...active.exercises.slice(0, exIdx + 1), duplicate, ...active.exercises.slice(exIdx + 1)];
    const updated = assessments.map((a, i) => (i === activeIdx ? { ...a, exercises } : a));
    persistChanges(updated);
  };

  const handleMoveExercise = (exIdx: number, direction: 'up' | 'down') => {
    if (!active || !active.exercises) return;
    const targetIdx = direction === 'up' ? exIdx - 1 : exIdx + 1;
    if (targetIdx < 0 || targetIdx >= active.exercises.length) return;
    const exercises = [...active.exercises];
    const temp = exercises[exIdx];
    exercises[exIdx] = exercises[targetIdx];
    exercises[targetIdx] = temp;
    const updated = assessments.map((a, i) => (i === activeIdx ? { ...a, exercises } : a));
    persistChanges(updated);
  };

  const handleSaveAll = () => {
    persistChanges(assessments);
  };

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-3 px-2 sm:px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl my-auto flex flex-col overflow-hidden border border-slate-200">

        {/* ── HEADER PRINCIPAL ── */}
        <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 px-6 py-4 text-white flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/15 rounded-2xl flex items-center justify-center flex-shrink-0">
              <Edit3 size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-extrabold text-base truncate">
                  {isEn ? `Assessment & Questions Editor — ${plan.title}` : `Évaluation & Questions — ${plan.title}`}
                </h2>
                {isEn && (
                  <span className="text-[10px] bg-emerald-500 text-white font-black px-2 py-0.5 rounded-md uppercase">
                    🇬🇧 English
                  </span>
                )}
              </div>
              <p className="text-slate-300 text-xs truncate">
                {plan.subject} · {plan.gradeLevel} · {isEn ? 'Modify existing questions, change their type, or generate any question with AI' : 'Modifiez les questions existantes, changez leur nature ou générez chaque question par IA'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0 flex-wrap">
            {assessments.length > 0 && (
              <>
                <button
                  onClick={() => setShowStudentViewModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl text-xs font-black shadow transition"
                  title="Voir la page d'examen exactement comme chez l'élève et modifier l'organisation ou la mise en page"
                >
                  <Eye size={14} />
                  <span>{isEn ? 'Student View & Layout' : '👁️ Voir Version Élève & Mise en Page'}</span>
                </button>

                <button
                  onClick={() => setShowPrintModal(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white/15 hover:bg-white/25 text-white rounded-xl text-xs font-bold transition"
                >
                  <Printer size={14} />
                  <span>{isEn ? 'A4 Exam Sheet Preview' : 'Aperçu Feuille A4 / Imprimer'}</span>
                </button>

                <button
                  onClick={handlePublishOnline}
                  disabled={isPublishing}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-400 hover:bg-amber-300 text-amber-950 rounded-xl text-xs font-black shadow transition disabled:opacity-50"
                >
                  <Send size={13} />
                  <span>{isPublishing ? (isEn ? 'Activating...' : 'Activation...') : (isEn ? 'Launch Online (Student Codes)' : 'Activer en ligne (Codes élèves)')}</span>
                </button>

                {onUpdateUnit && (
                  <button
                    onClick={handleSaveAll}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold shadow transition ${
                      hasUnsavedChanges
                        ? 'bg-emerald-500 hover:bg-emerald-600 text-white ring-2 ring-emerald-300'
                        : 'bg-indigo-600 hover:bg-indigo-700 text-white'
                    }`}
                  >
                    <Save size={14} />
                    <span>{isEn ? 'Save Evaluation' : 'Enregistrer'}</span>
                  </button>
                )}
              </>
            )}
            <button onClick={onClose} className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* ── BANNIÈRE CODE D'ACCÈS PUBLIÉ ── */}
        {publishedCode && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-3 flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="px-2.5 py-1 bg-emerald-600 text-white font-black text-xs rounded-lg uppercase">
                {isEn ? 'Online Active' : 'Évaluation Active'}
              </span>
              <span className="text-xs text-emerald-900 font-semibold">
                {isEn ? 'Main Code:' : 'Code principal :'} <strong className="font-mono text-sm bg-white px-2 py-0.5 rounded border border-emerald-300">{publishedCode}</strong>
                {publishedRosterCount > 0 && (
                  <span className="ml-2 text-emerald-800 font-bold">
                    · 🎓 {publishedRosterCount} {isEn ? 'nominative student codes generated for' : 'codes nominatifs générés pour les élèves de'} {plan.gradeLevel}
                  </span>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publishedCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-white hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold transition"
              >
                {copiedCode ? <Check size={13} /> : <Copy size={13} />}
                <span>{copiedCode ? (isEn ? 'Copied!' : 'Copié !') : (isEn ? 'Copy Code' : 'Copier le code')}</span>
              </button>
              {onOpenOnlineManager && (
                <button
                  onClick={() => onOpenOnlineManager({ ...plan, assessments })}
                  className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-lg text-xs font-bold transition"
                >
                  {isEn ? 'View Student Codes & Submissions' : 'Gérer les codes élèves & copies'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* ── CORPS DE L'ÉDITEUR D'ÉVALUATION ── */}
        {assessments.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <HelpCircle size={40} className="text-slate-300 mx-auto" />
            <p className="text-slate-700 font-bold text-sm">
              {isEn ? 'No criterion assessment found in this unit.' : 'Aucune évaluation critériée dans cette unité pour le moment.'}
            </p>
            <button
              type="button"
              onClick={() => {
                const defaultCrit: AssessmentData = {
                  criterion: 'A',
                  criterionName: isEn ? 'Knowing and understanding' : 'Connaissances et compréhension',
                  maxPoints: 8,
                  strands: [
                    isEn ? 'i. select appropriate concepts and knowledge' : 'i. sélectionner les concepts et connaissances appropriés',
                    isEn ? 'ii. apply knowledge to solve problems' : 'ii. appliquer les connaissances pour résoudre des problèmes',
                    isEn ? 'iii. analyze and interpret information' : 'iii. analyser et interpréter des informations',
                  ],
                  rubricRows: [
                    { level: '1-2', descriptor: '' },
                    { level: '3-4', descriptor: '' },
                    { level: '5-6', descriptor: '' },
                    { level: '7-8', descriptor: '' },
                  ],
                  exercises: [],
                };
                persistChanges([defaultCrit]);
              }}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition"
            >
              + {isEn ? 'Initialize Criterion A Assessment' : 'Initialiser une évaluation (Critère A)'}
            </button>
          </div>
        ) : (
          <>
            {/* Barre d'onglets des Critères A, B, C, D */}
            <div className="flex items-center gap-2 px-6 pt-3 pb-0 border-b border-slate-200 bg-slate-50 overflow-x-auto flex-shrink-0">
              {assessments.map((a, idx) => {
                const c = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={idx}
                    onClick={() => setActiveIdx(idx)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs transition border-b-2 -mb-px whitespace-nowrap ${
                      isActive
                        ? `bg-white ${c.text} border-current shadow-xs`
                        : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-white/60'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-md ${c.badge} text-white text-[11px] font-black flex items-center justify-center`}>
                      {a.criterion}
                    </span>
                    <span>{isEn ? `Criterion ${a.criterion}: ${a.criterionName}` : `Critère ${a.criterion} : ${a.criterionName}`}</span>
                    <span className="text-[11px] text-slate-500 font-semibold">
                      · {a.exercises?.length || 0} {isEn ? 'question(s)' : 'question(s)'}
                    </span>
                  </button>
                );
              })}

              <div className="ml-auto flex items-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() => setShowRubric(v => !v)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg transition"
                >
                  {showRubric
                    ? (isEn ? 'Hide Rubric & Strands' : 'Masquer Sous-aspects & Grille')
                    : (isEn ? 'Show Strands & Rubric (1-8)' : 'Voir Sous-aspects & Grille (1-8)')}
                </button>
              </div>
            </div>

            {/* Contenu du critère actif : Questions directement visibles et modifiables */}
            {active && (
              <div className="p-6 space-y-5 max-h-[72vh] overflow-y-auto bg-slate-50/50">

                {/* Sous-aspects & Grille (repliable pour garder les questions au premier plan) */}
                {showRubric && (
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-700 mb-2">
                        📋 {isEn ? `Official Strands — Criterion ${active.criterion}` : `Sous-aspects officiels — Critère ${active.criterion}`}
                      </h4>
                      <div className="space-y-1.5">
                        {(active.strands || []).map((s, si) => {
                          const roman = ['i', 'ii', 'iii', 'iv', 'v'][si] || 'i';
                          return (
                            <div key={si} className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                              <span className="font-black text-indigo-700 w-5">{roman}.</span>
                              <input
                                type="text"
                                value={s.replace(/^[ivx]+[\.\)]\s*/i, '')}
                                onChange={e => {
                                  const strands = [...active.strands];
                                  strands[si] = `${roman}. ${e.target.value}`;
                                  const next = assessments.map((a, idx) => idx === activeIdx ? { ...a, strands } : a);
                                  setAssessments(next);
                                  setHasUnsavedChanges(true);
                                }}
                                className="flex-1 bg-transparent focus:bg-white border border-transparent focus:border-slate-300 rounded px-1.5 py-0.5 text-slate-800 outline-none"
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div>
                      <h4 className="text-xs font-black uppercase text-slate-700 mb-2">
                        📊 {isEn ? 'Rubric Descriptors (1-8)' : 'Descripteurs de niveaux (1-8)'}
                      </h4>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {(active.rubricRows || []).map((r, ri) => (
                          <div key={ri} className="flex items-start gap-2 text-xs bg-slate-50 p-2 rounded-lg border border-slate-200">
                            <span className="font-black text-slate-700 w-10">{r.level}</span>
                            <textarea
                              value={r.descriptor}
                              onChange={e => {
                                const rubricRows = active.rubricRows.map((row, idx) => idx === ri ? { ...row, descriptor: e.target.value } : row);
                                const next = assessments.map((a, idx) => idx === activeIdx ? { ...a, rubricRows } : a);
                                setAssessments(next);
                                setHasUnsavedChanges(true);
                              }}
                              rows={2}
                              className="flex-1 bg-white border border-slate-200 rounded px-2 py-1 text-xs outline-none"
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* BARRE SUPÉRIEURE D'AJOUT DE NOUVELLES QUESTIONS */}
                <div className="bg-white border-2 border-indigo-200 rounded-2xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-black text-slate-900">
                      {isEn
                        ? `Criterion ${active.criterion} Questions (${active.exercises?.length || 0})`
                        : `Questions de l'évaluation — Critère ${active.criterion} (${active.exercises?.length || 0} question${(active.exercises?.length || 0) > 1 ? 's' : ''})`}
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {isEn
                        ? 'Each question below can be edited directly, converted to another type, or generated/replaced by AI.'
                        : 'Chaque question ci-dessous peut être modifiée directement, changée de nature (QCM, Vrai/Faux...) ou générée par l\'IA.'}
                    </p>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      type="button"
                      onClick={() => openAiGeneratorForQuestion(null)}
                      className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition"
                    >
                      <Sparkles size={14} className="text-yellow-300" />
                      <span>{isEn ? '+ Generate New Question (AI)' : '+ Générer une nouvelle question par IA'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleManualAddExercise('multiple_choice')}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition"
                    >
                      + QCM
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManualAddExercise('true_false')}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition"
                    >
                      + {isEn ? 'True/False' : 'Vrai/Faux'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManualAddExercise('subquestions')}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition"
                    >
                      + {isEn ? 'Sub-questions' : 'Sous-questions'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleManualAddExercise('open')}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl font-bold text-xs transition"
                    >
                      + {isEn ? 'Open Question' : 'Rédaction'}
                    </button>
                  </div>
                </div>

                {/* LISTE DES QUESTIONS EXISTANTES (DIRECTEMENT ÉDITABLES + BOUTON IA SUR CHAQUE QUESTION) */}
                {(!active.exercises || active.exercises.length === 0) ? (
                  <div className="p-10 text-center bg-white rounded-2xl border-2 border-dashed border-slate-300 space-y-3">
                    <HelpCircle size={32} className="mx-auto text-slate-400" />
                    <p className="text-sm font-bold text-slate-700">
                      {isEn ? 'No questions in this criterion yet.' : 'Aucune question pour ce critère.'}
                    </p>
                    <div className="flex justify-center gap-2">
                      <button
                        type="button"
                        onClick={() => openAiGeneratorForQuestion(null)}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow transition"
                      >
                        <Sparkles size={14} className="text-yellow-300" />
                        <span>{isEn ? 'Generate Question 1 with AI' : 'Générer la Question 1 par IA'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleManualAddExercise('open')}
                        className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-bold text-xs transition"
                      >
                        + {isEn ? 'Add Manually' : 'Ajouter manuellement'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {active.exercises.map((ex, ei) => {
                      const hasSub = Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0;
                      const currentKind: 'open' | 'multiple_choice' | 'true_false' | 'subquestions' =
                        hasSub
                          ? 'subquestions'
                          : ex.type === 'multiple_choice'
                          ? 'multiple_choice'
                          : ex.type === 'true_false'
                          ? 'true_false'
                          : 'open';

                      return (
                        <div
                          key={ei}
                          className={`border-2 ${colors.border} rounded-2xl bg-white shadow-xs overflow-hidden transition`}
                        >
                          {/* ── EN-TÊTE DE LA QUESTION : Numéro + Choix Nature + Choix Sous-aspect + Bouton Générer par IA ── */}
                          <div className={`${colors.bg} px-4 py-3 border-b ${colors.border} flex items-center justify-between gap-3 flex-wrap`}>
                            <div className="flex items-center gap-2.5 flex-wrap">
                              <span className={`px-3 py-1 rounded-xl text-xs font-black text-white ${colors.badge}`}>
                                Question {ei + 1}
                              </span>

                              {/* Sélecteur direct de la Nature de la question */}
                              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-300">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                  {isEn ? 'Type:' : 'Nature :'}
                                </span>
                                <select
                                  value={currentKind}
                                  onChange={e => handleChangeExerciseKind(ei, e.target.value as any)}
                                  className="text-xs font-bold text-slate-900 bg-transparent outline-none cursor-pointer"
                                >
                                  <option value="open">{isEn ? '📝 Open / Essay' : '📝 Rédaction / Ouverte'}</option>
                                  <option value="multiple_choice">{isEn ? '☑️ Multiple Choice (QCM)' : '☑️ QCM (Choix multiples)'}</option>
                                  <option value="true_false">{isEn ? '⚖️ True or False' : '⚖️ Vrai ou Faux'}</option>
                                  <option value="subquestions">{isEn ? '🔢 Sub-questions 1), 2), 3)...' : '🔢 Sous-questions 1), 2), 3)...'}</option>
                                </select>
                              </div>

                              {/* Sélecteur direct du Sous-aspect (Strand i, ii, iii, iv) */}
                              <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-xl border border-slate-300">
                                <span className="text-[10px] font-bold text-slate-500 uppercase">
                                  {isEn ? 'Strand:' : 'Sous-aspect :'}
                                </span>
                                <select
                                  value={ex.strandIndex || 'i'}
                                  onChange={e => handleChangeExerciseStrand(ei, e.target.value)}
                                  className="text-xs font-bold text-indigo-800 bg-transparent outline-none cursor-pointer max-w-[220px] truncate"
                                >
                                  {['i', 'ii', 'iii', 'iv', 'v'].slice(0, Math.max(4, active.strands?.length || 4)).map((rom, sIdx) => {
                                    const sDesc = active.strands?.[sIdx]?.replace(/^[ivx]+[\.\)]\s*/i, '') || '';
                                    return (
                                      <option key={rom} value={rom}>
                                        Aspect ({rom}) {sDesc ? `— ${sDesc.slice(0, 45)}` : ''}
                                      </option>
                                    );
                                  })}
                                </select>
                              </div>
                            </div>

                            {/* BOUTON IA PAR QUESTION + Actions Monter / Descendre / Dupliquer / Supprimer */}
                            <div className="flex items-center gap-1.5 ml-auto">
                              <button
                                type="button"
                                onClick={() => openAiGeneratorForQuestion(ei)}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
                                title={isEn ? 'Generate or replace this question with AI' : 'Générer ou remplacer cette question avec l\'IA'}
                              >
                                <Sparkles size={13} className="text-yellow-300" />
                                <span>{isEn ? 'Generate by AI' : 'Générer par IA'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleMoveExercise(ei, 'up')}
                                disabled={ei === 0}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 transition"
                                title={isEn ? 'Move up' : 'Monter'}
                              >
                                <ChevronUp size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveExercise(ei, 'down')}
                                disabled={ei === active.exercises.length - 1}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-white rounded-lg disabled:opacity-30 transition"
                                title={isEn ? 'Move down' : 'Descendre'}
                              >
                                <ChevronDown size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDuplicateExercise(ei)}
                                className="p-1.5 text-slate-500 hover:text-indigo-700 hover:bg-white rounded-lg transition"
                                title={isEn ? 'Duplicate question' : 'Dupliquer la question'}
                              >
                                <Copy size={14} />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteExercise(ei)}
                                className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition"
                                title={isEn ? 'Delete question' : 'Supprimer la question'}
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </div>

                          {/* ── CORPS ÉDITABLE DE LA QUESTION ── */}
                          <div className="p-4 space-y-3.5">
                            {/* Titre de la question */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                {isEn ? 'Question Title' : 'Titre de la question'}
                              </label>
                              <input
                                type="text"
                                value={ex.title}
                                onChange={e => updateExerciseFields(ei, { title: e.target.value })}
                                className="w-full border border-slate-300 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs font-bold text-slate-900 bg-white outline-none"
                                placeholder={isEn ? 'Question title...' : 'Titre de la question...'}
                              />
                            </div>

                            {/* Énoncé / Consigne */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                {isEn ? 'Question Prompt / Instructions' : 'Énoncé / Consigne de la question'}
                              </label>
                              <textarea
                                value={ex.content}
                                onChange={e => updateExerciseFields(ei, { content: e.target.value })}
                                rows={3}
                                className="w-full border border-slate-300 focus:border-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 bg-slate-50/60 focus:bg-white outline-none leading-relaxed"
                                placeholder={isEn ? 'Write or edit the question text here...' : 'Rédigez ou modifiez l\'énoncé de la question ici...'}
                              />
                            </div>

                            {/* CAS QCM : Édition directe des propositions + sélection de la bonne réponse */}
                            {currentKind === 'multiple_choice' && (
                              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-slate-700">
                                    ☑️ {isEn ? 'MCQ Options (click radio to mark correct answer):' : 'Propositions QCM (cochez la bonne réponse) :'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const nextOpts = [...(ex.options || []), isEn ? `Option ${(ex.options?.length || 0) + 1}` : `Proposition ${(ex.options?.length || 0) + 1}`];
                                      updateExerciseFields(ei, { options: nextOpts });
                                    }}
                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800"
                                  >
                                    + {isEn ? 'Add option' : 'Ajouter une proposition'}
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                  {(ex.options || []).map((opt, oi) => {
                                    const isCorrect = ex.correctAnswer === opt;
                                    return (
                                      <div
                                        key={oi}
                                        className={`flex items-center gap-2 p-2 rounded-xl border ${
                                          isCorrect ? 'bg-emerald-50 border-emerald-400' : 'bg-white border-slate-200'
                                        }`}
                                      >
                                        <input
                                          type="radio"
                                          name={`correct_q_${activeIdx}_${ei}`}
                                          checked={isCorrect}
                                          onChange={() => updateExerciseFields(ei, { correctAnswer: opt })}
                                          className="accent-emerald-600 cursor-pointer"
                                          title={isEn ? 'Mark as correct answer' : 'Définir comme bonne réponse'}
                                        />
                                        <span className="text-xs font-black text-slate-500 w-4">
                                          {String.fromCharCode(65 + oi)}.
                                        </span>
                                        <input
                                          type="text"
                                          value={opt}
                                          onChange={e => {
                                            const newVal = e.target.value;
                                            const nextOpts = [...(ex.options || [])];
                                            nextOpts[oi] = newVal;
                                            const updates: Partial<AssessmentExercise> = { options: nextOpts };
                                            if (isCorrect) updates.correctAnswer = newVal;
                                            updateExerciseFields(ei, updates);
                                          }}
                                          className="flex-1 text-xs font-medium bg-transparent border-b border-transparent focus:border-slate-300 outline-none"
                                        />
                                        {(ex.options?.length || 0) > 2 && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const nextOpts = (ex.options || []).filter((_, idx) => idx !== oi);
                                              updateExerciseFields(ei, { options: nextOpts });
                                            }}
                                            className="text-slate-400 hover:text-rose-600"
                                          >
                                            <X size={13} />
                                          </button>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* CAS VRAI / FAUX : Choix direct de la réponse attendue */}
                            {currentKind === 'true_false' && (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between flex-wrap gap-2">
                                <span className="text-xs font-bold text-slate-700">
                                  ⚖️ {isEn ? 'Expected Correct Answer:' : 'Réponse correcte attendue :'}
                                </span>
                                <div className="flex items-center gap-2">
                                  {[isEn ? 'True' : 'Vrai', isEn ? 'False' : 'Faux'].map(val => {
                                    const activeVal = (ex.correctAnswer || (isEn ? 'True' : 'Vrai')) === val;
                                    return (
                                      <button
                                        key={val}
                                        type="button"
                                        onClick={() => updateExerciseFields(ei, { correctAnswer: val })}
                                        className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border transition ${
                                          activeVal
                                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                                        }`}
                                      >
                                        {val}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* CAS SOUS-QUESTIONS 1), 2), 3)... */}
                            {currentKind === 'subquestions' && (
                              <div className="bg-indigo-50/40 p-3.5 rounded-xl border border-indigo-200 space-y-2.5">
                                <div className="flex items-center justify-between">
                                  <span className="text-xs font-bold text-indigo-950">
                                    🔢 {isEn ? 'Structured Sub-questions:' : 'Sous-questions structurées :'}
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      const currentSubs = ex.subQuestions || [];
                                      const nextNum = currentSubs.length + 1;
                                      const romans = ['i', 'ii', 'iii', 'iv'];
                                      const rom = romans[(nextNum - 1) % romans.length];
                                      const nextSubs: AssessmentSubQuestion[] = [
                                        ...currentSubs,
                                        {
                                          id: `sub_${Date.now()}_${nextNum}`,
                                          label: `${nextNum})`,
                                          content: '',
                                          strandIndex: rom,
                                          strandText: active.strands?.[nextNum - 1]?.replace(/^[ivx]+[\.\)]\s*/i, '') || '',
                                          type: 'open',
                                        },
                                      ];
                                      updateExerciseFields(ei, { subQuestions: nextSubs });
                                    }}
                                    className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition"
                                  >
                                    + {isEn ? 'Add sub-question' : 'Ajouter une sous-question'}
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {(ex.subQuestions || []).map((sq, si) => (
                                    <div key={sq.id || si} className="bg-white p-3 rounded-xl border border-indigo-200 space-y-2">
                                      <div className="flex items-center justify-between gap-2 flex-wrap">
                                        <div className="flex items-center gap-2">
                                          <input
                                            type="text"
                                            value={sq.label}
                                            onChange={e => {
                                              const nextSubs = [...(ex.subQuestions || [])];
                                              nextSubs[si] = { ...sq, label: e.target.value };
                                              updateExerciseFields(ei, { subQuestions: nextSubs });
                                            }}
                                            className="w-12 border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-black text-indigo-800 text-center"
                                          />
                                          <select
                                            value={sq.strandIndex || 'i'}
                                            onChange={e => {
                                              const rom = e.target.value;
                                              const matched = active.strands?.find(s => s.trim().toLowerCase().startsWith(`${rom}.`));
                                              const cleanDesc = matched ? matched.replace(/^[ivx]+[\.\)]\s*/i, '').trim() : '';
                                              const nextSubs = [...(ex.subQuestions || [])];
                                              nextSubs[si] = { ...sq, strandIndex: rom, strandText: cleanDesc };
                                              updateExerciseFields(ei, { subQuestions: nextSubs });
                                            }}
                                            className="border border-slate-300 rounded-lg px-2 py-0.5 text-xs font-bold text-indigo-700 bg-indigo-50/50"
                                          >
                                            {['i', 'ii', 'iii', 'iv', 'v'].map(r => (
                                              <option key={r} value={r}>Aspect ({r})</option>
                                            ))}
                                          </select>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextSubs = (ex.subQuestions || []).filter((_, idx) => idx !== si);
                                            updateExerciseFields(ei, { subQuestions: nextSubs });
                                          }}
                                          className="text-rose-500 hover:text-rose-700 p-1"
                                          title={isEn ? 'Remove sub-question' : 'Supprimer cette sous-question'}
                                        >
                                          <Trash2 size={13} />
                                        </button>
                                      </div>

                                      <textarea
                                        value={sq.content}
                                        onChange={e => {
                                          const nextSubs = [...(ex.subQuestions || [])];
                                          nextSubs[si] = { ...sq, content: e.target.value };
                                          updateExerciseFields(ei, { subQuestions: nextSubs });
                                        }}
                                        rows={2}
                                        placeholder={isEn ? 'Sub-question prompt...' : 'Énoncé de la sous-question...'}
                                        className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 outline-none focus:border-indigo-400"
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Corrigé type / Éléments de réponse attendus */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                                ✔ {isEn ? 'Model Answer / Grading Key (Optional)' : 'Corrigé type / Éléments de réponse attendus (Optionnel)'}
                              </label>
                              <input
                                type="text"
                                value={ex.answer || ''}
                                onChange={e => updateExerciseFields(ei, { answer: e.target.value })}
                                placeholder={isEn ? 'Expected answer or marking notes...' : 'Éléments de réponse ou barème indicatif...'}
                                className="w-full border border-slate-200 focus:border-indigo-400 rounded-xl px-3 py-1.5 text-xs text-slate-700 bg-slate-50/50 focus:bg-white outline-none"
                              />
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* ── FOOTER ── */}
            <div className="px-6 py-4 border-t border-slate-200 bg-white rounded-b-3xl flex items-center justify-between gap-3 flex-shrink-0">
              <div className="text-xs text-slate-600 flex items-center gap-3">
                {saveStatus === 'saved' ? (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                    <CheckCircle size={15} /> {isEn ? 'Evaluation saved!' : 'Évaluation enregistrée avec succès !'}
                  </span>
                ) : hasUnsavedChanges ? (
                  <span className="text-amber-700 font-bold">
                    ● {isEn ? 'Unsaved edits — click Save Evaluation' : 'Modifications en cours — cliquez sur Enregistrer'}
                  </span>
                ) : (
                  <span>
                    {assessments.length} {isEn ? 'criteria' : 'critère(s)'} · {assessments.reduce((sum, a) => sum + (a.exercises?.length || 0), 0)} {isEn ? 'question(s)' : 'question(s) au total'}
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-xs text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition font-bold"
                >
                  {isEn ? 'Close' : 'Fermer'}
                </button>
                {onUpdateUnit && (
                  <button
                    onClick={handleSaveAll}
                    className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow transition"
                  >
                    <Save size={14} />
                    <span>{isEn ? 'Save Evaluation & Questions' : 'Enregistrer les questions'}</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODALE DE GÉNÉRATION / REMPLACEMENT DE QUESTION AVEC L'IA */}
      {showAiQuestionModal && active && (
        <GenerateCriterialQuestionModal
          isOpen={showAiQuestionModal}
          onClose={() => {
            setShowAiQuestionModal(false);
            setAiTargetQuestionIdx(null);
          }}
          onAddQuestion={handleAddQuestionFromAi}
          onReplaceQuestion={handleReplaceQuestionFromAi}
          targetQuestionIndex={aiTargetQuestionIdx}
          initialStrandIndex={aiInitialStrand}
          initialQuestionType={aiInitialType}
          subject={plan.subject || ''}
          gradeLevel={plan.gradeLevel || ''}
          criterion={active.criterion}
          criterionName={active.criterionName}
          availableStrands={active.strands || []}
          unitTitle={plan.title}
          statementOfInquiry={plan.statementOfInquiry}
          chapters={plan.chapters}
          keyConcept={plan.keyConcept}
          relatedConcepts={plan.relatedConcepts}
          existingQuestionsCount={active.exercises?.length || 0}
        />
      )}

      {/* Impression A4 */}
      {showPrintModal && plan && (
        <EvaluationPrintView
          evaluation={getEvaluationForPrint()}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      {/* Version Élève & Mise en Page */}
      {showStudentViewModal && plan && (
        <StudentViewLayoutEditorModal
          isOpen={showStudentViewModal}
          evaluation={getEvaluationForPrint()}
          onClose={() => setShowStudentViewModal(false)}
          onSave={async (updatedEval) => {
            persistChanges(updatedEval.assessments);
          }}
        />
      )}
    </div>
  );
};

export default AssessmentViewerModal;
