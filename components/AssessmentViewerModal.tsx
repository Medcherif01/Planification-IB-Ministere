import React, { useState, useEffect } from 'react';
import {
  X, Eye, Edit3, Save, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight,
  Printer, Send, Copy, Check, Sparkles, Plus, Trash2, HelpCircle, CheckSquare,
  FileQuestion, AlignLeft, ListOrdered, ChevronDown, ChevronUp, Layers, Filter
} from 'lucide-react';
import { UnitPlan, AssessmentData, AssessmentExercise, OnlineEvaluation } from '../types';
import EvaluationPrintView from './EvaluationPrintView';
import GenerateCriterialQuestionModal from './GenerateCriterialQuestionModal';
import { createOrUpdateEvaluation } from '../services/onlineEvaluationService';
import { isEnglishSubject } from '../services/criterialQuestionGeneratorService';

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
  const [editMode, setEditMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [publishedCode, setPublishedCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);

  // Tab d'affichage (Tâches / Aperçu Fiche Épreuve A4)
  const [viewTab, setViewTab] = useState<'tasks' | 'paper'>('tasks');
  const [preselectedStrand, setPreselectedStrand] = useState<string>('i');
  const [filterStrand, setFilterStrand] = useState<string | null>(null);

  // Modal de génération de question avec l'IA
  const [showAiQuestionModal, setShowAiQuestionModal] = useState(false);
  const [showManualMenu, setShowManualMenu] = useState(false);

  const isEn = plan ? isEnglishSubject(plan.subject) : false;

  useEffect(() => {
    if (!isOpen || !plan) return;
    setAssessments(plan.assessments ? plan.assessments.map(a => JSON.parse(JSON.stringify(a))) : []);
    setActiveIdx(0);
    setEditMode(false);
    setSaveStatus('idle');
    setPublishedCode(null);
    setShowAiQuestionModal(false);
    setShowManualMenu(false);
    setViewTab('tasks');
    setFilterStrand(null);
    setPreselectedStrand('i');
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const handlePublishOnline = async () => {
    if (!plan || assessments.length === 0) return;
    setIsPublishing(true);
    try {
      const accessCode = `EVAL-${Math.floor(1000 + Math.random() * 9000)}`;
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
      });
      setPublishedCode(newEval.accessCode);
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

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const updateField = <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) => {
    setAssessments(prev => prev.map((a, i) => i === activeIdx ? { ...a, [key]: value } : a));
  };

  const updateExercise = (exIdx: number, field: keyof AssessmentData['exercises'][0], value: any) => {
    setAssessments(prev => prev.map((a, i) => {
      if (i !== activeIdx) return a;
      const exercises = a.exercises.map((ex, ei) => ei === exIdx ? { ...ex, [field]: value } : ex);
      return { ...a, exercises };
    }));
  };

  const handleAddQuestionFromAi = (question: AssessmentExercise) => {
    if (!active) return;
    const exercises = [...(active.exercises || []), question];
    updateField('exercises', exercises);
    // Sauvegarder automatiquement sur le plan pour ne rien perdre
    if (onUpdateUnit) {
      const updatedAssessments = assessments.map((a, i) => i === activeIdx ? { ...a, exercises } : a);
      onUpdateUnit({ ...plan, assessments: updatedAssessments });
    }
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
  };

  const handleManualAddExercise = (type: 'open' | 'multiple_choice' | 'true_false' | 'subquestions') => {
    if (!active) return;
    const count = (active.exercises || []).length + 1;
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
    const roman = romanNumerals[(count - 1) % romanNumerals.length];
    const defaultStrand = active.strands?.find(s => s.toLowerCase().startsWith(`${roman}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') || `Aspect ${roman}`;

    let newEx: AssessmentExercise;

    if (type === 'multiple_choice') {
      newEx = {
        title: isEn ? `Task ${count}: Multiple Choice Question` : `Tâche ${count} : Question QCM`,
        content: isEn ? 'Read carefully and check the correct option:' : 'Lisez attentivement l\'énoncé et cochez la bonne réponse :',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : aspect ${roman}`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'multiple_choice',
        options: isEn ? ['Option A', 'Option B', 'Option C', 'Option D'] : ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
        correctAnswer: isEn ? 'Option A' : 'Proposition A',
        answer: isEn ? 'Option A is correct because...' : 'La proposition A est correcte car...',
      };
    } else if (type === 'true_false') {
      newEx = {
        title: isEn ? `Task ${count}: True or False` : `Tâche ${count} : Affirmation Vrai ou Faux`,
        content: isEn ? 'State whether the following claim is True or False and provide a brief justification:' : 'Indiquez si l\'affirmation suivante est Vraie ou Fausse et justifiez brièvement :',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : aspect ${roman}`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'true_false',
        correctAnswer: isEn ? 'True' : 'Vrai',
        answer: isEn ? 'True. Justification: ...' : 'Vrai. Justification : ...',
      };
    } else if (type === 'subquestions') {
      newEx = {
        title: isEn ? `Task ${count}: Multi-part Structured Problem` : `Tâche ${count} : Problème à sous-questions`,
        content: isEn ? 'Context and main problem stimulus text...' : 'Mise en situation et énoncé principal du problème...',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : aspect ${roman}`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'open',
        subQuestions: [
          {
            id: 'sub_1',
            label: '1)',
            content: isEn ? 'Part 1: Identify and state...' : 'Partie 1 : Identifier et expliciter...',
            strandIndex: 'i',
            strandText: active.strands?.[0] || 'Aspect i',
            type: 'open',
          },
          {
            id: 'sub_2',
            label: '2)',
            content: isEn ? 'Part 2: Calculate and solve with method...' : 'Partie 2 : Calculer et résoudre avec méthode...',
            strandIndex: 'ii',
            strandText: active.strands?.[1] || 'Aspect ii',
            type: 'open',
          },
        ],
      };
    } else {
      newEx = {
        title: isEn ? `Task ${count}: Open Response Task` : `Tâche ${count} : Question de réflexion`,
        content: isEn ? 'Detailed prompt and instructions for the student...' : 'Consigne détaillée de la tâche à réaliser...',
        criterionReference: isEn ? `Criterion ${active.criterion} : strand ${roman}` : `Critère ${active.criterion} : aspect ${roman}`,
        strandIndex: roman,
        strandText: defaultStrand,
        type: 'open',
      };
    }

    const exercises = [...(active.exercises || []), newEx];
    updateField('exercises', exercises);
    setShowManualMenu(false);
    if (onUpdateUnit) {
      const updatedAssessments = assessments.map((a, i) => i === activeIdx ? { ...a, exercises } : a);
      onUpdateUnit({ ...plan, assessments: updatedAssessments });
    }
  };

  const handleDeleteExercise = (exIdx: number) => {
    if (!active) return;
    if (!confirm(isEn ? 'Delete this question?' : 'Voulez-vous supprimer cette question ?')) return;
    const exercises = active.exercises.filter((_, i) => i !== exIdx);
    updateField('exercises', exercises);
    if (onUpdateUnit) {
      const updatedAssessments = assessments.map((a, i) => i === activeIdx ? { ...a, exercises } : a);
      onUpdateUnit({ ...plan, assessments: updatedAssessments });
    }
  };

  const handleDuplicateExercise = (exIdx: number) => {
    if (!active) return;
    const target = active.exercises[exIdx];
    if (!target) return;
    const duplicate: AssessmentExercise = JSON.parse(JSON.stringify(target));
    duplicate.title = `${duplicate.title} (${isEn ? 'Copy' : 'Copie'})`;
    const exercises = [...active.exercises.slice(0, exIdx + 1), duplicate, ...active.exercises.slice(exIdx + 1)];
    updateField('exercises', exercises);
    if (onUpdateUnit) {
      const updatedAssessments = assessments.map((a, i) => i === activeIdx ? { ...a, exercises } : a);
      onUpdateUnit({ ...plan, assessments: updatedAssessments });
    }
  };

  const handleMoveExercise = (exIdx: number, direction: 'up' | 'down') => {
    if (!active || !active.exercises) return;
    const targetIdx = direction === 'up' ? exIdx - 1 : exIdx + 1;
    if (targetIdx < 0 || targetIdx >= active.exercises.length) return;
    const exercises = [...active.exercises];
    const temp = exercises[exIdx];
    exercises[exIdx] = exercises[targetIdx];
    exercises[targetIdx] = temp;
    updateField('exercises', exercises);
    if (onUpdateUnit) {
      const updatedAssessments = assessments.map((a, i) => i === activeIdx ? { ...a, exercises } : a);
      onUpdateUnit({ ...plan, assessments: updatedAssessments });
    }
  };

  const updateStrand = (sIdx: number, value: string) => {
    if (!active) return;
    const strands = [...active.strands];
    strands[sIdx] = value;
    updateField('strands', strands);
  };

  const updateRubric = (rIdx: number, value: string) => {
    if (!active) return;
    const rubricRows = active.rubricRows.map((r, i) => i === rIdx ? { ...r, descriptor: value } : r);
    updateField('rubricRows', rubricRows);
  };

  const handleSave = () => {
    if (!plan || !onUpdateUnit) return;
    const updated: UnitPlan = { ...plan, assessments };
    onUpdateUnit(updated);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
    setEditMode(false);
  };

  // ── Colors for active criterion ───────────────────────────────────────────────
  const colors = active ? (CRITERION_COLORS[active.criterion] || CRITERION_COLORS.A) : CRITERION_COLORS.A;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto py-3 px-2 sm:px-4">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl my-auto flex flex-col overflow-hidden border border-slate-200">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 px-6 py-4.5 text-white flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center flex-shrink-0 shadow-inner">
              <Eye size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 className="text-white font-extrabold text-base truncate">
                  {isEn ? 'Criterion-referenced Assessments' : 'Évaluations critériées'}
                </h2>
                {isEn && (
                  <span className="text-[10px] bg-emerald-500/90 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    🇬🇧 English
                  </span>
                )}
              </div>
              <p className="text-purple-200 text-xs truncate mt-0.5">
                {plan.title} · {plan.subject} · {plan.gradeLevel}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => setShowPrintModal(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white/20 text-white hover:bg-white/30 transition shadow-sm"
              title="Aperçu & impression du sujet au format A4"
            >
              <Printer size={14} /> <span>{isEn ? 'Print A4' : 'Imprimer A4'}</span>
            </button>
            <button
              onClick={handlePublishOnline}
              disabled={isPublishing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-yellow-400 hover:bg-yellow-300 text-yellow-950 transition shadow"
              title="Activer cette évaluation sous forme électronique pour les élèves"
            >
              <Send size={14} /> <span>{isPublishing ? (isEn ? 'Publishing…' : 'Activation…') : (isEn ? 'Activate Online' : 'Activer en ligne')}</span>
            </button>
            {onUpdateUnit && (
              <button
                onClick={() => setEditMode(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition shadow-sm ${
                  editMode ? 'bg-white text-purple-800' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <Edit3 size={14} /> <span>{editMode ? (isEn ? 'View Mode' : 'Mode Lecture') : (isEn ? 'Quick Edit' : 'Modifier')}</span>
              </button>
            )}
            <button onClick={onClose} className="text-white/70 hover:text-white transition p-1.5 hover:bg-white/10 rounded-lg">
              <X size={20} />
            </button>
          </div>
        </div>

        {/* Bannière code en ligne */}
        {publishedCode && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-6 py-2.5 flex items-center justify-between gap-3 text-xs text-emerald-900">
            <div className="flex items-center gap-2">
              <CheckCircle size={16} className="text-emerald-600 flex-shrink-0" />
              <span>
                {isEn ? 'Assessment is active online! Student Access Code:' : 'Évaluation disponible en ligne ! Code d\'accès élèves :'}
                <strong className="font-mono bg-white px-2 py-0.5 rounded border border-emerald-300 text-emerald-800 text-sm ml-1.5">
                  {publishedCode}
                </strong>
              </span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  navigator.clipboard.writeText(publishedCode);
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2000);
                }}
                className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-emerald-100 text-emerald-800 rounded-lg border border-emerald-300 font-semibold"
              >
                {copiedCode ? <Check size={12} /> : <Copy size={12} />}
                <span>{copiedCode ? (isEn ? 'Copied!' : 'Copié !') : (isEn ? 'Copy Code' : 'Copier')}</span>
              </button>
              {onOpenOnlineManager && (
                <button
                  onClick={() => plan && onOpenOnlineManager(plan)}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold"
                >
                  {isEn ? 'View Submissions' : 'Voir les copies'}
                </button>
              )}
            </div>
          </div>
        )}

        {assessments.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-semibold">{isEn ? 'No criterion-referenced assessments for this unit.' : 'Aucune évaluation critériée générée pour cette unité.'}</p>
          </div>
        ) : (
          <>
            {/* Onglets des critères (A, B, C, D) */}
            <div className="flex border-b border-slate-200 bg-slate-50/60 px-4 pt-1 overflow-x-auto gap-2 items-center">
              {assessments.map((a, i) => {
                const c = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                const isCurrent = activeIdx === i;
                return (
                  <button
                    key={a.criterion}
                    onClick={() => { setActiveIdx(i); }}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-t-2xl font-bold text-xs border-b-2 transition whitespace-nowrap flex-shrink-0 ${
                      isCurrent
                        ? `border-purple-600 text-purple-900 bg-white shadow-xs`
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/60'
                    }`}
                  >
                    <span className={`w-5 h-5 rounded-lg ${c.badge} text-white text-[11px] font-black flex items-center justify-center`}>
                      {a.criterion}
                    </span>
                    <span>{isEn ? `Criterion ${a.criterion}` : `Critère ${a.criterion}`}</span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 font-semibold">
                      {a.exercises?.length || 0} {isEn ? 'task(s)' : 'tâche(s)'}
                    </span>
                  </button>
                );
              })}

              <div className="ml-auto flex items-center gap-1 px-2">
                <button
                  onClick={() => setActiveIdx(i => Math.max(0, i - 1))}
                  disabled={activeIdx === 0}
                  className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition rounded"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  onClick={() => setActiveIdx(i => Math.min(assessments.length - 1, i + 1))}
                  disabled={activeIdx === assessments.length - 1}
                  className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition rounded"
                >
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Contenu principal du critère actif */}
            {active && (
              <div className="p-6 space-y-6 max-h-[68vh] overflow-y-auto">

                {/* Bannière du critère */}
                <div className={`${colors.bg} border-2 ${colors.border} rounded-2xl p-4.5 shadow-xs`}>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={`w-10 h-10 rounded-2xl ${colors.badge} text-white font-black text-lg flex items-center justify-center flex-shrink-0 shadow-sm`}>
                      {active.criterion}
                    </span>
                    <div className="flex-1 min-w-[200px]">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                        {isEn ? `Criterion ${active.criterion}` : `Critère ${active.criterion}`}
                      </span>
                      {editMode ? (
                        <input
                          type="text"
                          value={active.criterionName}
                          onChange={e => updateField('criterionName', e.target.value)}
                          className="w-full mt-0.5 border border-slate-300 rounded-lg px-3 py-1.5 text-sm font-bold bg-white"
                        />
                      ) : (
                        <h3 className={`text-base font-extrabold ${colors.text}`}>{active.criterionName}</h3>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`text-xs font-extrabold ${colors.text} px-3 py-1 ${colors.light} rounded-xl border ${colors.border}`}>
                        /{active.maxPoints || 8} pts
                      </span>
                    </div>
                  </div>
                </div>

                {/* Sous-aspects (Strands) */}
                <div className="bg-slate-50/70 border border-slate-200 rounded-2xl p-4">
                  <div className="flex items-center justify-between mb-2.5">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 flex items-center gap-1.5">
                      <span>📋</span> <span>{isEn ? 'Strands (Aspects évalués)' : 'Sous-aspects officiels (Strands)'}</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-semibold">
                      {active.strands?.length || 0} aspect(s)
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {active.strands.map((s, si) => (
                      <div key={si} className="flex items-start gap-2 bg-white p-2.5 rounded-xl border border-slate-200 text-xs">
                        <span className="font-extrabold text-purple-700 w-6 flex-shrink-0 text-right">
                          {['i', 'ii', 'iii', 'iv', 'v'][si]}.
                        </span>
                        {editMode ? (
                          <input
                            type="text"
                            value={s}
                            onChange={e => updateStrand(si, e.target.value)}
                            className="flex-1 border border-slate-300 rounded-lg px-2 py-1 text-xs"
                          />
                        ) : (
                          <p className="flex-1 text-slate-700 leading-relaxed font-medium">
                            {s.replace(/^[ivx]+[\.\)]\s*/i, '')}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* SECTION EXERCICES / TÂCHES : Aperçu bien organisé + Ajout facile */}
                <div className="space-y-4">
                  {/* Barre d'outils de la section Exercices */}
                  <div className="flex items-center justify-between gap-3 flex-wrap bg-gradient-to-r from-purple-50 via-slate-50 to-indigo-50 p-4 rounded-2xl border-2 border-purple-200/80 shadow-xs">
                    <div>
                      <h4 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                        <span>✏️</span>
                        <span>{isEn ? `Assessment Tasks (${active.exercises?.length || 0})` : `Exercices & Tâches d'évaluation (${active.exercises?.length || 0})`}</span>
                      </h4>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {isEn
                          ? 'Generate new targeted questions with AI or add and customize tasks manually.'
                          : 'Générez des questions ciblées avec l\'IA ou ajoutez vos tâches personnalisées.'}
                      </p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      {/* BOUTON CLÉ : Générer avec l'IA */}
                      <button
                        type="button"
                        onClick={() => setShowAiQuestionModal(true)}
                        className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-xl font-bold text-xs shadow-md transition transform active:scale-95"
                        title={isEn ? 'Generate targeted question with Gemini AI' : 'Générer une question ciblée avec l\'IA'}
                      >
                        <Sparkles size={15} className="text-yellow-300 animate-pulse" />
                        <span>{isEn ? 'Generate Question (AI)' : 'Générer une question (IA)'}</span>
                      </button>

                      {/* Menu déroulant d'ajout manuel rapide */}
                      <div className="relative">
                        <button
                          type="button"
                          onClick={() => setShowManualMenu(v => !v)}
                          className="flex items-center gap-1.5 px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition shadow-2xs"
                        >
                          <Plus size={14} />
                          <span>{isEn ? 'Add Manually' : 'Ajouter manuellement'}</span>
                          <ChevronDown size={13} />
                        </button>

                        {showManualMenu && (
                          <div className="absolute right-0 top-full mt-1.5 w-60 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-30 animate-fadeIn">
                            <button
                              type="button"
                              onClick={() => handleManualAddExercise('multiple_choice')}
                              className="w-full text-left px-3.5 py-2 text-xs hover:bg-purple-50 flex items-center gap-2 text-slate-800 font-semibold"
                            >
                              <span>☑️</span> <span>{isEn ? 'Multiple Choice (MCQ)' : 'Question QCM (Choix multiples)'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleManualAddExercise('true_false')}
                              className="w-full text-left px-3.5 py-2 text-xs hover:bg-purple-50 flex items-center gap-2 text-slate-800 font-semibold"
                            >
                              <span>⚖️</span> <span>{isEn ? 'True or False' : 'Vrai ou Faux'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleManualAddExercise('subquestions')}
                              className="w-full text-left px-3.5 py-2 text-xs hover:bg-purple-50 flex items-center gap-2 text-slate-800 font-semibold"
                            >
                              <span>🔢</span> <span>{isEn ? 'Multi-part Subquestions' : 'Sous-questions 1), 2), 3)...'}</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => handleManualAddExercise('open')}
                              className="w-full text-left px-3.5 py-2 text-xs hover:bg-purple-50 flex items-center gap-2 text-slate-800 font-semibold"
                            >
                              <span>📝</span> <span>{isEn ? 'Open-ended Essay Task' : 'Rédaction / Problème ouvert'}</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Liste des exercices du critère */}
                  {(!active.exercises || active.exercises.length === 0) ? (
                    <div className="p-8 text-center bg-slate-50 rounded-2xl border border-dashed border-slate-300">
                      <HelpCircle size={28} className="mx-auto text-slate-400 mb-2" />
                      <p className="text-xs font-bold text-slate-600">
                        {isEn ? 'No tasks yet for this criterion.' : 'Aucun exercice pour ce critère pour le moment.'}
                      </p>
                      <p className="text-[11px] text-slate-400 mt-1">
                        {isEn
                          ? 'Click "Generate Question (AI)" to automatically create one, or add one manually.'
                          : 'Cliquez sur "Générer une question (IA)" pour en créer une sur mesure en quelques secondes.'}
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {active.exercises.map((ex, ei) => {
                        const isMcq = ex.type === 'multiple_choice';
                        const isTf = ex.type === 'true_false';
                        const hasSub = Array.isArray(ex.subQuestions) && ex.subQuestions.length > 0;

                        return (
                          <div
                            key={ei}
                            className={`border-2 ${colors.border} rounded-2xl p-5 bg-white shadow-xs space-y-3.5 transition hover:shadow-md`}
                          >
                            {/* En-tête de la carte exercice */}
                            <div className="flex items-center justify-between gap-3 pb-2 border-b border-slate-100 flex-wrap">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className={`text-xs font-black ${colors.text} ${colors.light} px-2.5 py-1 rounded-xl`}>
                                  {isEn ? `Task ${ei + 1}` : `Tâche ${ei + 1}`}
                                </span>

                                <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700">
                                  {isMcq ? '☑️ QCM' : isTf ? '⚖️ Vrai/Faux' : hasSub ? '🔢 Sous-questions' : '📝 Rédaction'}
                                </span>

                                {ex.criterionReference && (
                                  <span className="text-[11px] font-bold text-purple-700 bg-purple-50 px-2 py-0.5 rounded-lg border border-purple-200">
                                    {ex.criterionReference}
                                  </span>
                                )}

                                {ex.strandText && (
                                  <span className="text-[10px] text-slate-500 italic max-w-xs truncate" title={ex.strandText}>
                                    ({ex.strandText})
                                  </span>
                                )}
                              </div>

                              <div className="flex items-center gap-1.5 ml-auto">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateExercise(ei)}
                                  className="p-1.5 text-slate-500 hover:text-purple-700 hover:bg-purple-50 rounded-lg transition"
                                  title={isEn ? 'Duplicate question' : 'Dupliquer la question'}
                                >
                                  <Copy size={14} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteExercise(ei)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title={isEn ? 'Delete question' : 'Supprimer la question'}
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {/* Titre */}
                            <div>
                              {editMode ? (
                                <input
                                  type="text"
                                  value={ex.title}
                                  onChange={e => updateExercise(ei, 'title', e.target.value)}
                                  className="w-full border border-slate-300 rounded-xl px-3 py-1.5 text-sm font-bold bg-white"
                                  placeholder={isEn ? 'Task Title' : 'Titre de l\'exercice'}
                                />
                              ) : (
                                <h5 className="text-sm font-extrabold text-slate-900">{ex.title}</h5>
                              )}
                            </div>

                            {/* Énoncé / Consigne */}
                            <div>
                              {editMode ? (
                                <textarea
                                  value={ex.content}
                                  onChange={e => updateExercise(ei, 'content', e.target.value)}
                                  rows={4}
                                  className="w-full border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 bg-white"
                                  placeholder={isEn ? 'Question prompt and instructions...' : 'Énoncé de la question...'}
                                />
                              ) : (
                                <div className="text-xs text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50/50 p-3 rounded-xl border border-slate-100">
                                  {ex.content}
                                </div>
                              )}
                            </div>

                            {/* Affichage des propositions QCM */}
                            {isMcq && ex.options && ex.options.length > 0 && (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                {ex.options.map((opt, oi) => {
                                  const isCorrect = ex.correctAnswer === opt;
                                  return (
                                    <div
                                      key={oi}
                                      className={`p-2.5 rounded-xl text-xs border flex items-center gap-2 ${
                                        isCorrect
                                          ? 'bg-emerald-50 border-emerald-300 font-bold text-emerald-900'
                                          : 'bg-white border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                                        {String.fromCharCode(65 + oi)}
                                      </span>
                                      <span className="flex-1">{opt}</span>
                                      {isCorrect && (
                                        <span className="text-[10px] font-bold text-emerald-700">✔ {isEn ? 'Correct' : 'Bonne réponse'}</span>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Affichage Vrai ou Faux */}
                            {isTf && (
                              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                                <span className="font-semibold text-slate-600">
                                  {isEn ? 'Expected evaluation answer:' : 'Réponse attendue :'}
                                </span>
                                <span className="font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                                  {ex.correctAnswer || (isEn ? 'True' : 'Vrai')}
                                </span>
                              </div>
                            )}

                            {/* Affichage des sous-questions structurées */}
                            {hasSub && (
                              <div className="space-y-2 pt-1">
                                {ex.subQuestions!.map((sq, si) => (
                                  <div key={si} className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-200 text-xs space-y-1">
                                    <div className="flex items-center gap-2">
                                      <span className="font-extrabold text-indigo-800">{sq.label}</span>
                                      {sq.strandIndex && (
                                        <span className="text-[10px] font-bold bg-indigo-200 text-indigo-900 px-1.5 py-0.5 rounded">
                                          aspect {sq.strandIndex}
                                        </span>
                                      )}
                                    </div>
                                    <p className="text-slate-800">{sq.content}</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Éléments de réponse / Corrigé type */}
                            {ex.answer && (
                              <div className="p-3 bg-purple-50/60 rounded-xl border border-purple-200 text-xs text-purple-950">
                                <span className="font-bold text-[10px] uppercase tracking-wider text-purple-800 block mb-1">
                                  ✔ {isEn ? 'Model Answer & Rubric Notes' : 'Corrigé type & Critères'}
                                </span>
                                <p className="leading-relaxed">{ex.answer}</p>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Grille d'évaluation (Rubric) */}
                {active.rubricRows && active.rubricRows.length > 0 && (
                  <div className="bg-slate-50/60 border border-slate-200 rounded-2xl p-4">
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-600 mb-2.5 flex items-center gap-1.5">
                      <span>📊</span> <span>{isEn ? 'Assessment Rubric (Descripteurs de niveau)' : 'Grille d\'évaluation officielle'}</span>
                    </h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse bg-white rounded-xl overflow-hidden border border-slate-200">
                        <thead>
                          <tr className={colors.bg}>
                            <th className={`border ${colors.border} px-3 py-2 text-left font-bold ${colors.text} w-20`}>
                              {isEn ? 'Level' : 'Niveau'}
                            </th>
                            <th className={`border ${colors.border} px-3 py-2 text-left font-bold ${colors.text}`}>
                              {isEn ? 'Level Descriptor' : 'Descripteur de niveau'}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {active.rubricRows.map((row, ri) => (
                            <tr key={ri}>
                              <td className={`border ${colors.border} px-3 py-2 font-black text-center ${colors.text} align-top`}>
                                {row.level}
                              </td>
                              <td className={`border ${colors.border} px-3 py-2 text-slate-700 leading-relaxed`}>
                                {editMode ? (
                                  <textarea
                                    value={row.descriptor}
                                    onChange={e => updateRubric(ri, e.target.value)}
                                    rows={2}
                                    className="w-full border-0 focus:outline-none focus:ring-1 focus:ring-purple-300 rounded text-xs resize-none p-1"
                                  />
                                ) : (
                                  row.descriptor || <em className="text-slate-400">{isEn ? 'Not defined' : 'Non défini'}</em>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 rounded-b-3xl flex items-center justify-between gap-3 flex-shrink-0">
              <div className="text-xs text-slate-500">
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                    <CheckCircle size={15} /> {isEn ? 'Changes saved!' : 'Modifications enregistrées !'}
                  </span>
                )}
                {editMode && saveStatus === 'idle' && (
                  <span className="text-purple-700 font-semibold">{isEn ? 'Editing mode active.' : 'Mode édition actif.'}</span>
                )}
                {!editMode && saveStatus === 'idle' && (
                  <span>
                    {assessments.length} {isEn ? 'criteria' : 'critère(s)'} · {assessments.reduce((sum, a) => sum + (a.exercises?.length || 0), 0)} {isEn ? 'total task(s)' : 'tâche(s) au total'}
                  </span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-5 py-2.5 text-xs text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 transition font-bold"
                >
                  {isEn ? 'Close' : 'Fermer'}
                </button>
                {editMode && onUpdateUnit && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow-md transition"
                  >
                    <Save size={15} /> <span>{isEn ? 'Save Changes' : 'Enregistrer les modifications'}</span>
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {/* MODALE DE GÉNÉRATION DE QUESTION AVEC L'IA */}
      {showAiQuestionModal && active && (
        <GenerateCriterialQuestionModal
          isOpen={showAiQuestionModal}
          onClose={() => setShowAiQuestionModal(false)}
          onAddQuestion={handleAddQuestionFromAi}
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
    </div>
  );
};

export default AssessmentViewerModal;
