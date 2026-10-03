import React, { useState, useEffect } from 'react';
import { X, Sparkles, Loader2, Check, ArrowRight, BookOpen, AlertCircle, RefreshCw, Edit3 } from 'lucide-react';
import { AssessmentExercise } from '../types';
import {
  GenerateQuestionOptions,
  QUESTION_TYPES,
  isEnglishSubject,
  generateCriterialQuestion,
} from '../services/criterialQuestionGeneratorService';

interface GenerateCriterialQuestionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAddQuestion: (question: AssessmentExercise) => void;
  subject: string;
  gradeLevel: string;
  criterion: string;
  criterionName?: string;
  availableStrands?: string[];
  unitTitle?: string;
  statementOfInquiry?: string;
  chapters?: string;
  keyConcept?: string;
  relatedConcepts?: string[];
  existingQuestionsCount?: number;
  initialStrandIndex?: string;
}

const GenerateCriterialQuestionModal: React.FC<GenerateCriterialQuestionModalProps> = ({
  isOpen,
  onClose,
  onAddQuestion,
  subject,
  gradeLevel,
  criterion,
  criterionName,
  availableStrands = [],
  unitTitle,
  statementOfInquiry,
  chapters,
  keyConcept,
  relatedConcepts,
  existingQuestionsCount = 0,
  initialStrandIndex = 'i',
}) => {
  const isEn = isEnglishSubject(subject);

  // Form states
  const [selectedType, setSelectedType] = useState<GenerateQuestionOptions['questionType']>('multiple_choice');
  const [selectedStrandIndex, setSelectedStrandIndex] = useState<string>(initialStrandIndex || 'i');
  const [difficulty, setDifficulty] = useState<'facile' | 'moyen' | 'difficile' | 'approfondi'>('moyen');
  const [customGuidance, setCustomGuidance] = useState('');

  // Generation status & result
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedQuestion, setGeneratedQuestion] = useState<AssessmentExercise | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editable preview
  const [isEditingPreview, setIsEditingPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSelectedStrandIndex(initialStrandIndex || 'i');
      setGeneratedQuestion(null);
      setErrorMessage(null);
      setIsEditingPreview(false);
      setCustomGuidance('');
    }
  }, [isOpen, initialStrandIndex]);

  if (!isOpen) return null;

  // Extraire le texte du sous-aspect sélectionné
  const currentStrandText = availableStrands.find(s => {
    const clean = s.trim().toLowerCase();
    return clean.startsWith(`${selectedStrandIndex}.`) || clean.startsWith(`${selectedStrandIndex})`);
  })?.replace(/^[ivx]+[\.\)]\s*/i, '') || '';

  const handleGenerate = async () => {
    setIsGenerating(true);
    setErrorMessage(null);
    setGeneratedQuestion(null);
    setIsEditingPreview(false);

    try {
      const q = await generateCriterialQuestion({
        subject,
        gradeLevel,
        unitTitle,
        statementOfInquiry,
        chapters,
        keyConcept,
        relatedConcepts,
        criterion,
        criterionName,
        strandIndex: selectedStrandIndex,
        strandText: currentStrandText,
        questionType: selectedType,
        difficulty,
        customGuidance: customGuidance.trim() || undefined,
        taskNumber: existingQuestionsCount + 1,
      });

      setGeneratedQuestion(q);
    } catch (err: any) {
      setErrorMessage(err.message || (isEn ? 'Failed to generate question.' : 'Erreur lors de la génération.'));
    } finally {
      setIsGenerating(false);
    }
  };

  const handleConfirmAdd = () => {
    if (!generatedQuestion) return;
    onAddQuestion(generatedQuestion);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn my-auto border border-slate-200">
        
        {/* Header */}
        <div className="bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 p-5 text-white flex items-center justify-between gap-3 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-2xl flex items-center justify-center text-white shadow-inner">
              <Sparkles size={22} className="text-yellow-300 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-extrabold tracking-wide">
                  {isEn ? 'Generate Targeted Assessment Question (AI)' : 'Générer une question ciblée avec l\'IA'}
                </h3>
                {isEn && (
                  <span className="text-[10px] bg-emerald-500/90 text-white font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                    🇬🇧 English Only
                  </span>
                )}
              </div>
              <p className="text-xs text-purple-200 mt-0.5">
                {isEn
                  ? `Criterion ${criterion}: ${criterionName || ''} · ${subject} (${gradeLevel})`
                  : `Critère ${criterion} : ${criterionName || ''} · ${subject} (${gradeLevel})`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">

          {/* Étape 1 : Choisir la nature / type de question */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              1. {isEn ? 'Question Type / Nature' : 'Nature de la question à générer'} <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5">
              {QUESTION_TYPES.map(type => {
                const isSelected = selectedType === type.id;
                return (
                  <button
                    key={type.id}
                    type="button"
                    onClick={() => setSelectedType(type.id)}
                    className={`p-3 rounded-2xl border-2 text-left transition flex items-start gap-2.5 ${
                      isSelected
                        ? 'border-purple-600 bg-purple-50/80 shadow-sm text-purple-950 ring-2 ring-purple-400/30'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <span className="text-lg flex-shrink-0 mt-0.5">{type.icon}</span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold truncate">
                        {isEn ? type.labelEn : type.labelFr}
                      </div>
                      <div className="text-[10px] text-slate-500 line-clamp-2 mt-0.5">
                        {isEn ? type.descEn : type.descFr}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Étape 2 : Sous-aspect ciblé (Strand) */}
          <div>
            <label className="block text-xs font-black uppercase tracking-wider text-slate-700 mb-2">
              2. {isEn ? `Targeted Strand (Criterion ${criterion})` : `Sous-aspect ciblé (Critère ${criterion})`} <span className="text-red-500">*</span>
            </label>
            <div className="space-y-2">
              {availableStrands.length > 0 ? (
                availableStrands.map((strand, idx) => {
                  const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
                  const roman = romanNumerals[idx] || `${idx + 1}`;
                  const isSelected = selectedStrandIndex === roman;
                  const cleanText = strand.replace(/^[ivx]+[\.\)]\s*/i, '');

                  return (
                    <label
                      key={idx}
                      onClick={() => setSelectedStrandIndex(roman)}
                      className={`flex items-start gap-3 p-3 rounded-xl border-2 cursor-pointer transition ${
                        isSelected
                          ? 'border-purple-600 bg-purple-50/70 text-purple-950 font-semibold'
                          : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                      }`}
                    >
                      <input
                        type="radio"
                        name="strand"
                        checked={isSelected}
                        onChange={() => setSelectedStrandIndex(roman)}
                        className="mt-1 text-purple-600 focus:ring-purple-500"
                      />
                      <div className="text-xs leading-relaxed flex-1">
                        <span className="font-bold uppercase text-purple-700 mr-1.5">
                          {isEn ? `Aspect ${roman}.` : `Sous-aspect ${roman}.`}
                        </span>
                        {cleanText}
                      </div>
                    </label>
                  );
                })
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {['i', 'ii', 'iii', 'iv'].map(r => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setSelectedStrandIndex(r)}
                      className={`py-2 px-3 rounded-xl border-2 text-center text-xs font-bold transition ${
                        selectedStrandIndex === r
                          ? 'border-purple-600 bg-purple-50 text-purple-900'
                          : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      Aspect {r}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Étape 3 : Options complémentaires (Difficulté & Consigne libre) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-2xl border border-slate-200">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isEn ? 'Difficulty Level' : 'Niveau de difficulté'}
              </label>
              <select
                value={difficulty}
                onChange={e => setDifficulty(e.target.value as any)}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
              >
                <option value="facile">{isEn ? 'Foundation / Easy' : 'Accessible / Facile'}</option>
                <option value="moyen">{isEn ? 'Standard / Medium' : 'Standard / Niveau attendu'}</option>
                <option value="difficile">{isEn ? 'Challenging / Difficult' : 'Difficile / Approfondi'}</option>
                <option value="approfondi">{isEn ? 'Advanced / Extension' : 'Excellence / Différenciation +'}</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                {isEn ? 'Specific focus or topic (optional)' : 'Orientation ou notion spécifique (optionnel)'}
              </label>
              <input
                type="text"
                value={customGuidance}
                onChange={e => setCustomGuidance(e.target.value)}
                placeholder={isEn ? 'e.g. Focus on paragraph structure, environmental theme...' : 'ex: Insister sur les fractions, inclure un piège classique...'}
                className="w-full p-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-purple-400"
              />
            </div>
          </div>

          {/* Erreur éventuelle */}
          {errorMessage && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs flex items-center gap-2">
              <AlertCircle size={16} className="text-rose-500 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Bouton de génération */}
          {!generatedQuestion && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleGenerate}
                disabled={isGenerating}
                className="w-full py-3 px-6 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white font-bold rounded-2xl shadow-lg transition flex items-center justify-center gap-2.5 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                {isGenerating ? (
                  <>
                    <Loader2 size={18} className="animate-spin text-white" />
                    <span>{isEn ? 'Generating question with Gemini AI...' : 'Génération de la question avec l\'IA…'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles size={18} className="text-yellow-300" />
                    <span>{isEn ? 'Generate Question Now' : 'Générer la question maintenant'}</span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* Aperçu de la question générée */}
          {generatedQuestion && (
            <div className="border-2 border-emerald-300 bg-emerald-50/40 rounded-2xl p-5 space-y-4 animate-fadeIn">
              <div className="flex items-center justify-between pb-2 border-b border-emerald-200">
                <div className="flex items-center gap-2">
                  <span className="p-1 bg-emerald-600 text-white rounded-lg text-xs">✔</span>
                  <span className="text-xs font-extrabold uppercase text-emerald-900 tracking-wider">
                    {isEn ? 'Generated Question Preview' : 'Aperçu de la question générée'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingPreview(v => !v)}
                    className="flex items-center gap-1 text-xs text-emerald-800 hover:text-emerald-950 font-semibold px-2 py-1 bg-white border border-emerald-200 rounded-lg"
                  >
                    <Edit3 size={12} />
                    <span>{isEditingPreview ? (isEn ? 'Done Editing' : 'Terminer édition') : (isEn ? 'Edit Text' : 'Modifier')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleGenerate}
                    disabled={isGenerating}
                    className="flex items-center gap-1 text-xs text-purple-700 hover:text-purple-900 font-semibold px-2 py-1 bg-white border border-purple-200 rounded-lg"
                  >
                    <RefreshCw size={12} className={isGenerating ? 'animate-spin' : ''} />
                    <span>{isEn ? 'Regenerate' : 'Régénérer'}</span>
                  </button>
                </div>
              </div>

              {/* Titre */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  {isEn ? 'Task Title' : 'Titre de la tâche'}
                </label>
                {isEditingPreview ? (
                  <input
                    type="text"
                    value={generatedQuestion.title}
                    onChange={e => setGeneratedQuestion({ ...generatedQuestion, title: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold"
                  />
                ) : (
                  <div className="text-sm font-bold text-slate-900 bg-white p-2.5 rounded-xl border border-slate-200">
                    {generatedQuestion.title}
                  </div>
                )}
              </div>

              {/* Énoncé */}
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                  {isEn ? 'Prompt / Question Content' : 'Énoncé / Consigne'}
                </label>
                {isEditingPreview ? (
                  <textarea
                    rows={4}
                    value={generatedQuestion.content}
                    onChange={e => setGeneratedQuestion({ ...generatedQuestion, content: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                  />
                ) : (
                  <div className="text-xs text-slate-800 bg-white p-3 rounded-xl border border-slate-200 whitespace-pre-wrap leading-relaxed">
                    {generatedQuestion.content}
                  </div>
                )}
              </div>

              {/* Options QCM */}
              {generatedQuestion.type === 'multiple_choice' && generatedQuestion.options && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    {isEn ? 'Multiple Choice Options' : 'Propositions du QCM'}
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {generatedQuestion.options.map((opt, i) => (
                      <div
                        key={i}
                        className={`p-2.5 rounded-xl text-xs border flex items-center gap-2 ${
                          generatedQuestion.correctAnswer === opt
                            ? 'bg-emerald-100 border-emerald-400 font-bold text-emerald-900'
                            : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center">
                          {String.fromCharCode(65 + i)}
                        </span>
                        <span>{opt}</span>
                        {generatedQuestion.correctAnswer === opt && (
                          <span className="ml-auto text-[10px] text-emerald-700 font-bold">✔ {isEn ? 'Correct' : 'Bonne réponse'}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Vrai ou Faux */}
              {generatedQuestion.type === 'true_false' && (
                <div className="p-3 bg-white rounded-xl border border-slate-200 text-xs flex items-center justify-between">
                  <span className="font-semibold text-slate-700">{isEn ? 'Expected Answer:' : 'Réponse attendue :'}</span>
                  <span className="font-bold px-3 py-1 bg-emerald-100 text-emerald-800 rounded-lg">
                    {generatedQuestion.correctAnswer || (isEn ? 'True' : 'Vrai')}
                  </span>
                </div>
              )}

              {/* Sous-questions */}
              {generatedQuestion.subQuestions && generatedQuestion.subQuestions.length > 0 && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    {isEn ? 'Structured Sub-questions' : 'Sous-questions structurées'}
                  </label>
                  <div className="space-y-2">
                    {generatedQuestion.subQuestions.map((sq, i) => (
                      <div key={i} className="p-2.5 bg-white rounded-xl border border-slate-200 text-xs">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-bold text-purple-700">{sq.label}</span>
                          <span className="text-[10px] bg-purple-100 text-purple-800 px-1.5 py-0.5 rounded font-bold">
                            aspect {sq.strandIndex}
                          </span>
                        </div>
                        <p className="text-slate-800">{sq.content}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Corrigé type */}
              {generatedQuestion.answer && (
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">
                    {isEn ? 'Model Answer & Marking Guide' : 'Corrigé type & Critères attendus'}
                  </label>
                  <div className="text-xs text-slate-700 bg-white/80 p-3 rounded-xl border border-slate-200 whitespace-pre-wrap leading-relaxed">
                    {generatedQuestion.answer}
                  </div>
                </div>
              )}

              {/* Bouton d'ajout final */}
              <div className="pt-2 flex gap-3">
                <button
                  type="button"
                  onClick={handleConfirmAdd}
                  className="flex-1 py-3 px-5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-2xl shadow-lg transition flex items-center justify-center gap-2 text-sm"
                >
                  <Check size={18} />
                  <span>
                    {isEn
                      ? `Add this Question to Criterion ${criterion}`
                      : `Valider et ajouter au Critère ${criterion}`}
                  </span>
                </button>
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex justify-end gap-2 flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-200 rounded-xl transition"
          >
            {isEn ? 'Cancel' : 'Annuler'}
          </button>
        </div>

      </div>
    </div>
  );
};

export default GenerateCriterialQuestionModal;
