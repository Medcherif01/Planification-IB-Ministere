import React, { useState } from 'react';
import {
  X, Eye, Sliders, ArrowUp, ArrowDown, Edit3, Plus, Trash2, Check, Sparkles,
  Calculator, List, Layers, Clock, CheckCircle, Send, Save, RotateCcw
} from 'lucide-react';
import {
  OnlineEvaluation,
  EvaluationLayoutConfig,
  AssessmentExercise,
  AssessmentSubQuestion,
} from '../types';
import { ScientificCalculatorModal, MathSymbolsAndBracketsToolbar } from './ScientificCalculatorAndMathBar';
import { isEnglishSubject } from '../services/criterialQuestionGeneratorService';

interface StudentViewLayoutEditorModalProps {
  evaluation: OnlineEvaluation;
  isOpen: boolean;
  isSaving?: boolean;
  onClose: () => void;
  onSaveEvaluation: (updated: OnlineEvaluation) => Promise<void>;
  onOpenDetailedQuestionEditor?: (updated: OnlineEvaluation, criterionIdx?: number) => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; light: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',    badge: 'bg-blue-600',    light: 'bg-blue-100' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', light: 'bg-emerald-100' },
  C: { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',   badge: 'bg-amber-600',   light: 'bg-amber-100' },
  D: { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-800',    badge: 'bg-rose-600',    light: 'bg-rose-100' },
};

const StudentViewLayoutEditorModal: React.FC<StudentViewLayoutEditorModalProps> = ({
  evaluation,
  isOpen,
  isSaving = false,
  onClose,
  onSaveEvaluation,
  onOpenDetailedQuestionEditor,
}) => {
  const [draftEval, setDraftEval] = useState<OnlineEvaluation>(() => JSON.parse(JSON.stringify(evaluation)));
  const [viewMode, setViewMode] = useState<'organize' | 'pure_student'>('organize');
  const [showLayoutPanel, setShowLayoutPanel] = useState<boolean>(true);
  const [activeCriterionIdx, setActiveCriterionIdx] = useState<number>(0);

  // État pour tester l'interface comme un élève (calculatrice, réponses, parenthèses/accolades)
  const [testAnswers, setTestAnswers] = useState<Record<string, string>>({});
  const [isCalculatorOpen, setIsCalculatorOpen] = useState<boolean>(false);
  const [activeTextareaKey, setActiveTextareaKey] = useState<string | null>(null);
  const [activeTextareaLabel, setActiveTextareaLabel] = useState<string>('');

  // Édition rapide sur place d'un exercice
  const [inlineEditingKey, setInlineEditingKey] = useState<string | null>(null);

  if (!isOpen) return null;

  const isEn = isEnglishSubject(draftEval.subject);
  const isArtSubject = /art|plastique|visuel|dessin/i.test(draftEval.subject || '');

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
      layoutConfig: {
        ...layout,
        ...patch,
      },
    }));
  };

  // Numérotation continue des exercices
  const getGlobalExerciseNumber = (critIdx: number, exIdx: number): number => {
    if (layout.numberingStyle === 'by_criterion') return exIdx + 1;
    let count = 0;
    for (let c = 0; c < critIdx; c++) {
      count += draftEval.assessments[c]?.exercises?.length || 0;
    }
    return count + exIdx + 1;
  };

  // ── Actions de réorganisation (Critères, Exercices, Sous-questions) ─────────

  const handleMoveCriterion = (critIdx: number, direction: 'up' | 'down') => {
    const targetIdx = direction === 'up' ? critIdx - 1 : critIdx + 1;
    if (targetIdx < 0 || targetIdx >= draftEval.assessments.length) return;
    const nextAssessments = [...draftEval.assessments];
    const [moved] = nextAssessments.splice(critIdx, 1);
    nextAssessments.splice(targetIdx, 0, moved);
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setActiveCriterionIdx(targetIdx);
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
  };

  const handleMoveSubQuestion = (critIdx: number, exIdx: number, subIdx: number, direction: 'up' | 'down') => {
    const ex = draftEval.assessments[critIdx]?.exercises?.[exIdx];
    if (!ex || !ex.subQuestions) return;
    const subs = [...ex.subQuestions];
    const targetIdx = direction === 'up' ? subIdx - 1 : subIdx + 1;
    if (targetIdx < 0 || targetIdx >= subs.length) return;
    const [moved] = subs.splice(subIdx, 1);
    subs.splice(targetIdx, 0, moved);
    // Renuméroter proprement 1), 2), 3)...
    const renumbered = subs.map((s, i) => ({
      ...s,
      label: `${i + 1})`,
    }));
    handleUpdateExerciseField(critIdx, exIdx, { subQuestions: renumbered });
  };

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

  const handleDeleteExercise = (critIdx: number, exIdx: number) => {
    const nextAssessments = draftEval.assessments.map((c, cI) => {
      if (cI !== critIdx) return c;
      return {
        ...c,
        exercises: (c.exercises || []).filter((_, eI) => eI !== exIdx),
      };
    });
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
  };

  const handleAddQuickExercise = (critIdx: number) => {
    const crit = draftEval.assessments[critIdx];
    if (!crit) return;
    const newEx: AssessmentExercise = {
      title: `Exercice ${(crit.exercises?.length || 0) + 1}`,
      content: 'Énoncé de la question...',
      criterionReference: `Critère ${crit.criterion} : i.`,
      strandIndex: 'i',
      strandText: crit.strands?.[0]?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Compétence évaluée',
      type: 'open',
      expectedLines: layout.answerBoxRows || 4,
    };
    const nextAssessments = draftEval.assessments.map((c, cI) =>
      cI === critIdx ? { ...c, exercises: [...(c.exercises || []), newEx] } : c
    );
    setDraftEval(prev => ({ ...prev, assessments: nextAssessments }));
    setInlineEditingKey(`${crit.criterion}_${crit.exercises?.length || 0}`);
  };

  // Insertion de symboles mathématiques / parenthèses / accolades dans la zone de test élève
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

  const criteriaToRender =
    layout.displayMode === 'full_page'
      ? draftEval.assessments.map((c, idx) => ({ crit: c, critIdx: idx }))
      : draftEval.assessments[activeCriterionIdx]
      ? [{ crit: draftEval.assessments[activeCriterionIdx], critIdx: activeCriterionIdx }]
      : [];

  return (
    <div className="fixed inset-0 z-[92] bg-slate-950/80 backdrop-blur-sm flex flex-col overflow-hidden animate-fadeIn">
      {/* ═══════════════════════════════════════════════════════════════════════
          BARRE SUPÉRIEURE ENSEIGNANT : CONTRÔLE DE L'APERÇU & MISE EN PAGE
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-purple-950 text-white px-4 sm:px-6 py-3 border-b border-white/15 flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-purple-600/30 border border-purple-400/40 flex items-center justify-center text-purple-200 font-black">
            <Eye size={20} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-400/30">
                Version Élève & Mise en Page
              </span>
              <span className="text-xs font-mono text-purple-300 font-bold">
                Code : {draftEval.accessCode}
              </span>
            </div>
            <h2 className="text-sm sm:text-base font-black text-white truncate">
              {draftEval.title} ({draftEval.subject} · {draftEval.grade})
            </h2>
          </div>
        </div>

        {/* Commutateur : Mode Organisation/Mise en page vs Mode 100% Élève */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700">
            <button
              type="button"
              onClick={() => setViewMode('organize')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'organize'
                  ? 'bg-purple-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Sliders size={13} />
              <span>Organiser & Modifier sur place</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('pure_student')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 transition ${
                viewMode === 'pure_student'
                  ? 'bg-emerald-600 text-white shadow'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Eye size={13} />
              <span>Aperçu 100% Élève (Tester)</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setShowLayoutPanel(v => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border transition flex items-center gap-1.5 ${
              showLayoutPanel
                ? 'bg-indigo-600/40 border-indigo-400 text-indigo-100'
                : 'bg-white/10 border-white/15 text-slate-200 hover:bg-white/20'
            }`}
          >
            <Sliders size={13} />
            <span>{showLayoutPanel ? 'Masquer options mise en page' : 'Options de mise en page'}</span>
          </button>

          {onOpenDetailedQuestionEditor && (
            <button
              type="button"
              onClick={() => onOpenDetailedQuestionEditor(draftEval, activeCriterionIdx)}
              className="px-3 py-1.5 bg-white/10 hover:bg-white/20 border border-white/20 text-white rounded-xl text-xs font-bold transition flex items-center gap-1.5"
              title="Ouvrir l'éditeur complet avec générateur IA par question"
            >
              <Sparkles size={13} className="text-yellow-300" />
              <span>Éditeur IA Détaillé</span>
            </button>
          )}

          <button
            type="button"
            disabled={isSaving}
            onClick={() => onSaveEvaluation(draftEval)}
            className="px-4 py-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded-xl text-xs shadow-lg transition flex items-center gap-1.5 disabled:opacity-50"
          >
            <Save size={14} />
            <span>{isSaving ? 'Enregistrement…' : 'Enregistrer la mise en page'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition"
            title="Fermer"
          >
            <X size={20} />
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          PANNEAU DE CONFIGURATION DE LA MISE EN PAGE & DE L'ORGANISATION
          ═══════════════════════════════════════════════════════════════════════ */}
      {showLayoutPanel && (
        <div className="bg-indigo-950/95 text-white px-4 sm:px-6 py-3 border-b border-indigo-800/80 shadow-md flex-shrink-0">
          <div className="max-w-6xl mx-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 text-xs">
            {/* 1. Mode de présentation */}
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-800/60">
              <label className="text-[10px] font-black uppercase text-indigo-300 block mb-1">
                1. Mode d'affichage Élève :
              </label>
              <select
                value={layout.displayMode}
                onChange={e => updateLayout({ displayMode: e.target.value as any })}
                className="w-full p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white"
              >
                <option value="full_page">📄 Feuille d'examen complète (Recommandé)</option>
                <option value="tabs">🗂️ Par onglets de critères (Étape par étape)</option>
              </select>
            </div>

            {/* 2. Numérotation des exercices */}
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-800/60">
              <label className="text-[10px] font-black uppercase text-indigo-300 block mb-1">
                2. Numérotation des questions :
              </label>
              <select
                value={layout.numberingStyle}
                onChange={e => updateLayout({ numberingStyle: e.target.value as any })}
                className="w-full p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white"
              >
                <option value="continuous">🔢 Continue (Exercice 1, 2, 3...)</option>
                <option value="by_criterion">🔤 Par critère (Critère A - Ex 1...)</option>
              </select>
            </div>

            {/* 3. Style d'en-tête & Espacement */}
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-800/60">
              <label className="text-[10px] font-black uppercase text-indigo-300 block mb-1">
                3. En-tête & Espacement :
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                <select
                  value={layout.headerStyle}
                  onChange={e => updateLayout({ headerStyle: e.target.value as any })}
                  className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-[11px] font-bold text-white"
                >
                  <option value="official_ib">🏛️ En-tête IB</option>
                  <option value="modern_card">✨ Compact</option>
                </select>
                <select
                  value={layout.spacing}
                  onChange={e => updateLayout({ spacing: e.target.value as any })}
                  className="p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-[11px] font-bold text-white"
                >
                  <option value="compact">Dense</option>
                  <option value="normal">Standard</option>
                  <option value="spacious">Aéré</option>
                </select>
              </div>
            </div>

            {/* 4. Hauteur des cadres de réponse */}
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-800/60">
              <label className="text-[10px] font-black uppercase text-indigo-300 block mb-1">
                4. Taille cadres de réponse :
              </label>
              <select
                value={layout.answerBoxRows || 4}
                onChange={e => updateLayout({ answerBoxRows: parseInt(e.target.value) || 4 })}
                className="w-full p-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold text-white"
              >
                <option value={3}>Court (3 lignes)</option>
                <option value={4}>Standard (4-5 lignes)</option>
                <option value={6}>Grand (6-7 lignes)</option>
                <option value={8}>Très grand (8-9 lignes)</option>
              </select>
            </div>

            {/* 5. Outils Élève (Calculatrice, Parenthèses, Accolades...) */}
            <div className="bg-slate-900/80 p-2.5 rounded-xl border border-indigo-800/60 flex flex-col justify-center gap-1">
              <label className="text-[10px] font-black uppercase text-indigo-300 block">
                5. Outils Élève affichés :
              </label>
              <div className="flex items-center gap-3 flex-wrap pt-0.5">
                <label className="flex items-center gap-1 cursor-pointer text-[11px] font-bold text-emerald-300">
                  <input
                    type="checkbox"
                    checked={layout.showCalculator !== false}
                    onChange={e => updateLayout({ showCalculator: e.target.checked })}
                    className="rounded text-emerald-500"
                  />
                  <span>🧮 Calculatrice</span>
                </label>
                <label className="flex items-center gap-1 cursor-pointer text-[11px] font-bold text-purple-200">
                  <input
                    type="checkbox"
                    checked={layout.showMathToolbar !== false}
                    onChange={e => updateLayout({ showMathToolbar: e.target.checked })}
                    className="rounded text-purple-500"
                  />
                  <span>( ) &#123; &#125; [ ] Symboles</span>
                </label>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          ZONE DE RENDU EXACT DE LA VERSION ÉLÈVE (SCROLLABLE)
          ═══════════════════════════════════════════════════════════════════════ */}
      <div className="flex-1 overflow-y-auto bg-slate-100 text-slate-900">
        {/* Simulation de la barre sticky de l'élève */}
        <div className="bg-white border-b border-slate-200 px-4 sm:px-6 py-2.5 sticky top-0 z-20 shadow-xs">
          <div className="max-w-5xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl flex items-center justify-center font-black text-xs shadow">
                PEI
              </div>
              <div>
                <h3 className="font-black text-xs sm:text-sm text-slate-800">{draftEval.title}</h3>
                <p className="text-[11px] text-slate-500">
                  Élève : <span className="font-semibold text-slate-700">Nom Prénom Élève</span> (Matricule <span className="font-mono font-bold text-purple-800">PEI-001</span>) · {draftEval.subject}
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
                  <span>Calculatrice</span>
                </button>
              )}

              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black bg-purple-100 text-purple-900 border border-purple-200">
                <Clock size={14} className="text-purple-600" />
                <span>{draftEval.durationMinutes || 45}:00</span>
              </div>
            </div>
          </div>
        </div>

        {/* Feuille d'examen vue par l'élève */}
        <div className={`max-w-5xl mx-auto w-full p-4 sm:p-6 ${
          layout.spacing === 'compact' ? 'space-y-4' : layout.spacing === 'spacious' ? 'space-y-8' : 'space-y-6'
        }`}>
          {/* 1. EN-TÊTE OFFICIEL DE L'ÉVALUATION */}
          {layout.headerStyle === 'official_ib' ? (
            <div className="bg-white rounded-3xl border-2 border-slate-300 shadow-xs overflow-hidden">
              <div className="bg-gradient-to-r from-slate-900 via-purple-950 to-indigo-950 text-white px-6 py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex-1">
                  <span className="text-[10px] font-black uppercase tracking-widest text-purple-300 bg-white/10 px-2.5 py-0.5 rounded-md">
                    Les Écoles Internationales Al-Kawthar · Baccalauréat International (PEI)
                  </span>
                  {viewMode === 'organize' ? (
                    <input
                      type="text"
                      value={draftEval.title}
                      onChange={e => setDraftEval(prev => ({ ...prev, title: e.target.value }))}
                      className="w-full mt-1 bg-white/10 border border-white/20 rounded-xl px-3 py-1 text-base sm:text-lg font-black text-white focus:outline-none focus:border-purple-400"
                      placeholder="Titre de l'évaluation..."
                    />
                  ) : (
                    <h1 className="text-lg sm:text-xl font-black mt-1 text-white">{draftEval.title}</h1>
                  )}
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

              <div className="p-4 sm:p-5 space-y-2.5 bg-white text-xs">
                {draftEval.statementOfInquiry && (
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-purple-50/70 border border-purple-200 rounded-xl p-3">
                    <div>
                      <span className="font-black uppercase text-[10px] text-purple-800 mr-2">
                        🔎 Énoncé de recherche :
                      </span>
                      <span className="italic font-semibold text-purple-950">"{draftEval.statementOfInquiry}"</span>
                    </div>
                  </div>
                )}

                {/* Consignes générales éditables directement en mode Organisation */}
                <div className="bg-amber-50/70 border border-amber-200 rounded-xl p-3 text-amber-950">
                  <span className="font-black uppercase text-[10px] text-amber-800 block mb-1">
                    📌 Consignes générales pour l'élève :
                  </span>
                  {viewMode === 'organize' ? (
                    <textarea
                      value={draftEval.instructions || ''}
                      onChange={e => setDraftEval(prev => ({ ...prev, instructions: e.target.value }))}
                      rows={2}
                      placeholder="Ajoutez vos consignes générales pour les élèves (ex: L'usage de la calculatrice intégrée est autorisé, détaillez toutes les étapes de vos calculs...)"
                      className="w-full p-2 bg-white border border-amber-300 rounded-lg text-xs text-slate-800 focus:outline-none focus:border-purple-500"
                    />
                  ) : (
                    <p className="text-xs leading-relaxed whitespace-pre-wrap">
                      {draftEval.instructions || 'Répondez de manière structurée et détaillée à chaque question.'}
                    </p>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="bg-gradient-to-r from-purple-900 to-indigo-900 text-white p-4 rounded-2xl shadow-xs text-xs flex flex-col md:flex-row md:items-center justify-between gap-2">
              <div>
                <span className="font-black uppercase tracking-wider text-purple-300 text-[10px] bg-purple-800/80 px-2 py-0.5 rounded mr-2">
                  {draftEval.title}
                </span>
                {draftEval.statementOfInquiry && (
                  <span className="italic text-purple-100 font-medium">"{draftEval.statementOfInquiry}"</span>
                )}
              </div>
            </div>
          )}

          {/* 2. SOMMAIRE DU PLAN DE L'ÉVALUATION */}
          {layout.showSummaryNav !== false && (
            <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-black text-slate-500 uppercase tracking-wider mr-1">
                  📋 Sommaire des exercices :
                </span>
                {draftEval.assessments.map((crit, cIdx) => {
                  const colors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
                  return (crit.exercises || []).map((ex, eIdx) => {
                    const globalNum = getGlobalExerciseNumber(cIdx, eIdx);
                    return (
                      <button
                        key={`${crit.criterion}_${eIdx}`}
                        type="button"
                        onClick={() => {
                          setActiveCriterionIdx(cIdx);
                          const el = document.getElementById(`preview_ex_${crit.criterion}_${eIdx}`);
                          if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }}
                        className="px-2.5 py-1 rounded-xl text-xs font-bold flex items-center gap-1.5 border bg-slate-50 border-slate-200 text-slate-700 hover:border-purple-300 hover:bg-purple-50/50 transition"
                      >
                        <span className={`w-4 h-4 rounded text-[10px] font-black text-white flex items-center justify-center ${colors.badge}`}>
                          {crit.criterion}
                        </span>
                        <span>Ex. {globalNum}</span>
                      </button>
                    );
                  });
                })}
              </div>
            </div>
          )}

          {/* Onglets par critère si mode 'tabs' */}
          {layout.displayMode === 'tabs' && (
            <div className="flex items-center gap-2 overflow-x-auto pb-1 border-b border-slate-200">
              {draftEval.assessments.map((crit, idx) => {
                const colors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
                const isCurrent = activeCriterionIdx === idx;
                return (
                  <button
                    key={crit.criterion}
                    type="button"
                    onClick={() => setActiveCriterionIdx(idx)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition border flex-shrink-0 ${
                      isCurrent
                        ? 'bg-white border-purple-500 shadow-md text-purple-900'
                        : 'bg-white/60 border-slate-200 text-slate-600 hover:bg-white'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-lg ${colors.badge} text-white text-xs font-black flex items-center justify-center`}>
                      {crit.criterion}
                    </span>
                    <span>Critère {crit.criterion} — {crit.criterionName}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* 3. CRITÈRES ET EXERCICES */}
          <div className={layout.spacing === 'compact' ? 'space-y-5' : layout.spacing === 'spacious' ? 'space-y-10' : 'space-y-8'}>
            {criteriaToRender.map(({ crit: activeAssessment, critIdx }) => {
              const activeColors = CRITERION_COLORS[activeAssessment.criterion] || CRITERION_COLORS.A;

              return (
                <section
                  key={activeAssessment.criterion}
                  className={layout.spacing === 'compact' ? 'space-y-4' : 'space-y-6'}
                >
                  {/* Bannière du Critère + Boutons d'organisation du Critère */}
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

                      <div className="flex items-center gap-2 flex-wrap">
                        {layout.showPointsPerCriterion !== false && (
                          <span className={`text-xs font-black px-3 py-1.5 rounded-xl border ${activeColors.border} bg-white ${activeColors.text}`}>
                            Barème : Niveau 1 à {activeAssessment.maxPoints || 8}
                          </span>
                        )}

                        {viewMode === 'organize' && (
                          <div className="flex items-center gap-1 bg-white/90 p-1 rounded-xl border border-slate-300 shadow-2xs">
                            <button
                              type="button"
                              disabled={critIdx === 0}
                              onClick={() => handleMoveCriterion(critIdx, 'up')}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 disabled:opacity-30"
                              title="Monter ce critère"
                            >
                              <ArrowUp size={14} />
                            </button>
                            <button
                              type="button"
                              disabled={critIdx === draftEval.assessments.length - 1}
                              onClick={() => handleMoveCriterion(critIdx, 'down')}
                              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-700 disabled:opacity-30"
                              title="Descendre ce critère"
                            >
                              <ArrowDown size={14} />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleAddQuickExercise(critIdx)}
                              className="flex items-center gap-1 px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition"
                            >
                              <Plus size={13} />
                              <span>+ Exercice</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Liste des exercices du critère */}
                  <div className={layout.spacing === 'compact' ? 'space-y-4' : layout.spacing === 'spacious' ? 'space-y-8' : 'space-y-6'}>
                    {(activeAssessment.exercises || []).map((ex, exIdx) => {
                      const exerciseNum = getGlobalExerciseNumber(critIdx, exIdx);
                      const hasSubQuestions = Boolean(ex.subQuestions && ex.subQuestions.length > 0);
                      const editKey = `${activeAssessment.criterion}_${exIdx}`;
                      const isInlineEditing = viewMode === 'organize' && inlineEditingKey === editKey;

                      return (
                        <div
                          id={`preview_ex_${activeAssessment.criterion}_${exIdx}`}
                          key={exIdx}
                          className={`bg-white rounded-3xl ${
                            layout.spacing === 'compact' ? 'p-4 sm:p-5 space-y-4' : layout.spacing === 'spacious' ? 'p-7 sm:p-8 space-y-6' : 'p-6 sm:p-7 space-y-5'
                          } border-2 ${isInlineEditing ? 'border-purple-500 ring-4 ring-purple-100' : 'border-slate-200'} shadow-sm transition`}
                        >
                          {/* En-tête de l'exercice + Contrôles d'organisation (Monter / Descendre / Modifier) */}
                          <div className="flex items-center justify-between border-b-2 border-slate-100 pb-3.5 flex-wrap gap-2">
                            <div className="flex items-center gap-3 flex-1 min-w-[220px]">
                              <span className={`px-3.5 py-1.5 rounded-xl text-xs font-black text-white shadow-2xs flex-shrink-0 ${activeColors.badge}`}>
                                Exercice {exerciseNum}
                              </span>
                              {isInlineEditing ? (
                                <input
                                  type="text"
                                  value={ex.title}
                                  onChange={e => handleUpdateExerciseField(critIdx, exIdx, { title: e.target.value })}
                                  className="flex-1 p-1.5 bg-purple-50 border border-purple-300 rounded-lg font-black text-sm text-slate-900"
                                  placeholder="Titre de l'exercice..."
                                />
                              ) : (
                                <h4 className="font-black text-base sm:text-lg text-slate-900">
                                  {ex.title || `Exercice ${exerciseNum}`}
                                </h4>
                              )}
                            </div>

                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-1 rounded-lg">
                                {hasSubQuestions
                                  ? `${ex.subQuestions?.length} sous-questions`
                                  : ex.type === 'multiple_choice' ? '☑️ QCM' : ex.type === 'true_false' ? '⚖️ Vrai / Faux' : '📝 Rédaction & Calculs'}
                              </span>

                              {/* Barre d'actions d'organisation Enseignant sur chaque exercice */}
                              {viewMode === 'organize' && (
                                <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-300">
                                  <button
                                    type="button"
                                    disabled={exIdx === 0}
                                    onClick={() => handleMoveExercise(critIdx, exIdx, 'up')}
                                    className="p-1.5 bg-white hover:bg-purple-50 text-slate-700 rounded-lg disabled:opacity-30 shadow-2xs"
                                    title="Monter cet exercice dans l'ordre"
                                  >
                                    <ArrowUp size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    disabled={exIdx === (activeAssessment.exercises?.length || 1) - 1}
                                    onClick={() => handleMoveExercise(critIdx, exIdx, 'down')}
                                    className="p-1.5 bg-white hover:bg-purple-50 text-slate-700 rounded-lg disabled:opacity-30 shadow-2xs"
                                    title="Descendre cet exercice dans l'ordre"
                                  >
                                    <ArrowDown size={13} />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setInlineEditingKey(isInlineEditing ? null : editKey)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1 transition ${
                                      isInlineEditing
                                        ? 'bg-emerald-600 text-white'
                                        : 'bg-white hover:bg-purple-50 text-purple-800 border border-purple-200'
                                    }`}
                                  >
                                    {isInlineEditing ? <><Check size={12} /> Terminer</> : <><Edit3 size={12} /> Modifier ici</>}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteExercise(critIdx, exIdx)}
                                    className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 rounded-lg shadow-2xs"
                                    title="Supprimer cet exercice"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>

                          {/* Édition rapide sur place de l'énoncé et de la hauteur du cadre */}
                          {isInlineEditing ? (
                            <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-4 space-y-3">
                              <div className="flex items-center justify-between gap-2 flex-wrap">
                                <label className="text-[11px] font-black text-purple-900 uppercase">
                                  Énoncé / Contexte de l'exercice :
                                </label>
                                <div className="flex items-center gap-2 text-xs">
                                  <span className="text-slate-600 font-semibold">Lignes de réponse :</span>
                                  <select
                                    value={ex.expectedLines || layout.answerBoxRows || 4}
                                    onChange={e => handleUpdateExerciseField(critIdx, exIdx, { expectedLines: parseInt(e.target.value) || 4 })}
                                    className="p-1 bg-white border border-purple-300 rounded font-bold text-xs"
                                  >
                                    {[2, 3, 4, 5, 6, 8, 10].map(n => (
                                      <option key={n} value={n}>{n} lignes</option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <textarea
                                value={ex.content}
                                onChange={e => handleUpdateExerciseField(critIdx, exIdx, { content: e.target.value })}
                                rows={3}
                                className="w-full p-3 bg-white border border-purple-300 rounded-xl text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-400"
                              />
                            </div>
                          ) : (
                            ex.content && (
                              <div className="bg-slate-50/90 p-4 rounded-2xl text-sm text-slate-800 whitespace-pre-wrap leading-relaxed border border-slate-200/80 font-medium">
                                {ex.content}
                              </div>
                            )
                          )}

                          {/* Image si présente */}
                          {ex.imageUrl && (
                            <div className="my-2 p-3 bg-slate-50 border border-slate-200 rounded-2xl text-center">
                              <img
                                src={ex.imageUrl}
                                alt={ex.imageCaption || 'Illustration'}
                                className="max-h-60 max-w-full mx-auto object-contain rounded-xl"
                              />
                              {ex.imageCaption && (
                                <p className="text-xs text-slate-600 italic mt-2">{ex.imageCaption}</p>
                              )}
                            </div>
                          )}

                          {/* Sous-questions ou Question directe */}
                          {hasSubQuestions ? (
                            <div className="space-y-4 pt-1">
                              {(ex.subQuestions || []).map((sub, sIdx) => {
                                const subKey = `${activeAssessment.criterion}_${exIdx}_sub_${sIdx}`;
                                const subAnswer = testAnswers[subKey] || '';
                                const subQType = sub.type || ex.type || 'open';

                                return (
                                  <div
                                    key={sub.id || sIdx}
                                    className="bg-slate-50/70 border-2 border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3"
                                  >
                                    <div className="flex items-start justify-between gap-2">
                                      <div className="flex items-baseline gap-2.5 flex-1">
                                        <span className="font-black text-sm text-white bg-purple-700 px-2.5 py-0.5 rounded-lg flex-shrink-0">
                                          {sub.label || `${sIdx + 1})`}
                                        </span>
                                        {isInlineEditing ? (
                                          <input
                                            type="text"
                                            value={sub.content}
                                            onChange={e => handleUpdateSubQuestionField(critIdx, exIdx, sIdx, { content: e.target.value })}
                                            className="flex-1 p-1.5 bg-white border border-purple-300 rounded-lg text-sm font-bold text-slate-900"
                                          />
                                        ) : (
                                          <h5 className="font-bold text-sm sm:text-base text-slate-900 leading-snug">
                                            {sub.content}
                                          </h5>
                                        )}
                                      </div>

                                      {/* Réorganisation de l'ordre des sous-questions */}
                                      {viewMode === 'organize' && (
                                        <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200 flex-shrink-0">
                                          <button
                                            type="button"
                                            disabled={sIdx === 0}
                                            onClick={() => handleMoveSubQuestion(critIdx, exIdx, sIdx, 'up')}
                                            className="p-1 hover:bg-purple-50 text-slate-600 rounded disabled:opacity-30"
                                            title="Monter cette sous-question"
                                          >
                                            <ArrowUp size={12} />
                                          </button>
                                          <button
                                            type="button"
                                            disabled={sIdx === (ex.subQuestions?.length || 1) - 1}
                                            onClick={() => handleMoveSubQuestion(critIdx, exIdx, sIdx, 'down')}
                                            className="p-1 hover:bg-purple-50 text-slate-600 rounded disabled:opacity-30"
                                            title="Descendre cette sous-question"
                                          >
                                            <ArrowDown size={12} />
                                          </button>
                                        </div>
                                      )}
                                    </div>

                                    {layout.showStrandBadges !== false && (
                                      <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50 px-3 py-1.5 rounded-xl border border-red-200">
                                        <span className="text-red-700 font-black">
                                          ● {isEn ? 'Strand' : 'Sous-aspect'} ({sub.strandIndex || 'i'}) : {sub.strandText || 'Compétence évaluée'}
                                        </span>
                                      </div>
                                    )}

                                    {subQType === 'multiple_choice' && (
                                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                                        {(sub.options || ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, oIdx) => {
                                          const isSelected = subAnswer === opt;
                                          return (
                                            <div
                                              key={oIdx}
                                              onClick={() => setTestAnswers(prev => ({ ...prev, [subKey]: opt }))}
                                              className={`p-3 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                                                isSelected
                                                  ? 'bg-purple-100 border-purple-600 text-purple-950 font-bold'
                                                  : 'bg-white border-slate-200 text-slate-700'
                                              }`}
                                            >
                                              <div className={`w-4 h-4 rounded-full border-2 ${isSelected ? 'border-purple-600 bg-purple-600' : 'border-slate-400'}`} />
                                              <span className="text-sm">{opt}</span>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {subQType === 'true_false' && (
                                      <div className="grid grid-cols-2 gap-3 max-w-xs pt-1">
                                        {['Vrai', 'Faux'].map(opt => (
                                          <button
                                            key={opt}
                                            type="button"
                                            onClick={() => setTestAnswers(prev => ({ ...prev, [subKey]: opt }))}
                                            className={`py-2 px-4 rounded-xl font-bold text-xs border-2 ${
                                              subAnswer === opt
                                                ? 'bg-purple-600 border-purple-600 text-white'
                                                : 'bg-white border-slate-200 text-slate-700'
                                            }`}
                                          >
                                            {opt}
                                          </button>
                                        ))}
                                      </div>
                                    )}

                                    {subQType === 'open' && (
                                      <div className="space-y-2 pt-1">
                                        {layout.showMathToolbar !== false && (
                                          <MathSymbolsAndBracketsToolbar
                                            targetKey={subKey}
                                            onInsertSymbol={handleInsertTestSymbol}
                                            showCalculatorButton={layout.showCalculator !== false}
                                            onOpenCalculator={() => {
                                              setActiveTextareaKey(subKey);
                                              setActiveTextareaLabel(`Ex. ${exerciseNum} - ${sub.label}`);
                                              setIsCalculatorOpen(true);
                                            }}
                                            isArtSubject={isArtSubject}
                                            compact
                                          />
                                        )}
                                        <textarea
                                          id={`preview_textarea_${subKey}`}
                                          value={subAnswer}
                                          onFocus={() => {
                                            setActiveTextareaKey(subKey);
                                            setActiveTextareaLabel(`Ex. ${exerciseNum} - ${sub.label}`);
                                          }}
                                          onChange={e => setTestAnswers(prev => ({ ...prev, [subKey]: e.target.value }))}
                                          rows={sub.expectedLines || layout.answerBoxRows || 4}
                                          placeholder={`Zone de réponse de l'élève pour la question ${sub.label} (testez les parenthèses, accolades et la calculatrice)...`}
                                          className="w-full p-3.5 bg-white border-2 border-slate-300 focus:border-purple-600 rounded-xl text-sm outline-none transition"
                                        />
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="space-y-4">
                              {layout.showStrandBadges !== false && (
                                <div className="text-red-600 font-bold text-xs flex items-center gap-1.5 bg-red-50/70 px-3 py-1.5 rounded-xl border border-red-200">
                                  <span className="text-red-700 font-black">
                                    ● {isEn ? 'Strand' : 'Sous-aspect'} ({ex.strandIndex || 'i'}) : {ex.strandText || ex.criterionReference || 'Compétence évaluée'}
                                  </span>
                                </div>
                              )}

                              {ex.type === 'multiple_choice' && (
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                                  {(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, oIdx) => {
                                    const isSelected = testAnswers[editKey] === opt;
                                    return (
                                      <div
                                        key={oIdx}
                                        onClick={() => setTestAnswers(prev => ({ ...prev, [editKey]: opt }))}
                                        className={`p-3.5 rounded-xl border-2 cursor-pointer transition flex items-center gap-3 ${
                                          isSelected
                                            ? 'bg-purple-50 border-purple-600 text-purple-950 font-bold'
                                            : 'bg-white border-slate-200 text-slate-700'
                                        }`}
                                      >
                                        <div className={`w-4 h-4 rounded-full border-2 ${isSelected ? 'border-purple-600 bg-purple-600' : 'border-slate-300'}`} />
                                        <span className="text-sm">{opt}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              )}

                              {ex.type === 'true_false' && (
                                <div className="grid grid-cols-2 gap-3 max-w-md pt-1">
                                  {['Vrai', 'Faux'].map(opt => (
                                    <button
                                      key={opt}
                                      type="button"
                                      onClick={() => setTestAnswers(prev => ({ ...prev, [editKey]: opt }))}
                                      className={`py-3 px-4 rounded-xl font-bold text-sm border-2 ${
                                        testAnswers[editKey] === opt
                                          ? 'bg-purple-600 border-purple-600 text-white'
                                          : 'bg-white border-slate-200 text-slate-700'
                                      }`}
                                    >
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              )}

                              {(!ex.type || ex.type === 'open') && (
                                <div className="space-y-2.5">
                                  {layout.showMathToolbar !== false && (
                                    <MathSymbolsAndBracketsToolbar
                                      targetKey={editKey}
                                      onInsertSymbol={handleInsertTestSymbol}
                                      showCalculatorButton={layout.showCalculator !== false}
                                      onOpenCalculator={() => {
                                        setActiveTextareaKey(editKey);
                                        setActiveTextareaLabel(`Exercice ${exerciseNum}`);
                                        setIsCalculatorOpen(true);
                                      }}
                                      isArtSubject={isArtSubject}
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
                                    rows={ex.expectedLines || (layout.answerBoxRows || 4) + 1}
                                    placeholder="Zone de rédaction de l'élève (vous pouvez tester ici les boutons ( ), { }, [ ] et la calculatrice)..."
                                    className="w-full p-4 border-2 border-slate-300 focus:border-purple-600 rounded-xl text-sm outline-none transition leading-relaxed"
                                  />
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
        </div>
      </div>

      {/* Modale Calculatrice Scientifique testable directement dans l'aperçu */}
      <ScientificCalculatorModal
        isOpen={isCalculatorOpen}
        onClose={() => setIsCalculatorOpen(false)}
        activeTargetLabel={activeTextareaLabel}
        onInsertText={txt => {
          if (activeTextareaKey) {
            handleInsertTestSymbol(activeTextareaKey, txt);
          }
        }}
      />
    </div>
  );
};

export default StudentViewLayoutEditorModal;
