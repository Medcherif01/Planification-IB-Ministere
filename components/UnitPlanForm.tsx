import React, { useState, useEffect } from 'react';
import { UnitPlan, UnitSession, FormativeAssessmentDetail, ATLDetail } from '../types';
import { KEY_CONCEPTS, RELATED_CONCEPTS_GENERIC, GLOBAL_CONTEXTS, SUBJECTS } from '../constants';
import { generateStatementOfInquiry, generateInquiryQuestions, generateLearningExperiences, generateFullUnitPlan, updateUnitFromConceptsAndObjectives } from '../services/geminiService';
import { Sparkles, Save, ArrowLeft, Loader2, Plus, Trash2, BookOpen, Wand2, FileText, Copy, User, ChevronDown, ChevronUp, CheckCircle, AlertCircle, Clock, Target, Brain, Users, Globe, BookMarked, Layers, MessageSquare, Settings, RefreshCw, Lock, Unlock } from 'lucide-react';
import ChaptersLessonsViewer from './ChaptersLessonsViewer';

interface UnitPlanFormProps {
  initialPlan?: UnitPlan;
  onSave: (plan: UnitPlan) => void;
  onCancel: () => void;
  detailUpdateMode?: boolean; // Mode mise à jour détails uniquement
}

// Composant Section repliable
const CollapsibleSection: React.FC<{
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string;
  badgeColor?: string;
}> = ({ title, icon, defaultOpen = false, children, badge, badgeColor = 'bg-blue-100 text-blue-700' }) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden mb-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-5 py-3 bg-slate-50 hover:bg-slate-100 transition text-left"
      >
        <div className="flex items-center gap-2 font-semibold text-slate-700">
          {icon}
          {title}
          {badge && <span className={`ml-2 text-xs px-2 py-0.5 rounded-full font-medium ${badgeColor}`}>{badge}</span>}
        </div>
        {open ? <ChevronUp size={18} className="text-slate-400" /> : <ChevronDown size={18} className="text-slate-400" />}
      </button>
      {open && <div className="p-5 bg-white">{children}</div>}
    </div>
  );
};

const ibSections = [
  { key: 'keyConcept', label: 'Concept clé' },
  { key: 'relatedConcepts', label: 'Concepts connexes' },
  { key: 'globalContext', label: 'Contexte mondial' },
  { key: 'statementOfInquiry', label: 'Énoncé de recherche' },
  { key: 'inquiryQuestions', label: 'Questions de recherche' },
  { key: 'objectives', label: 'Objectifs spécifiques' },
  { key: 'content', label: 'Contenu' },
  { key: 'atlSkills', label: 'ATL' },
  { key: 'learningExperiences', label: 'Expériences d\'apprentissage' },
  { key: 'formativeAssessment', label: 'Évaluation formative' },
  { key: 'summativeAssessment', label: 'Évaluation sommative' },
  { key: 'differentiation', label: 'Différenciation' },
  { key: 'reflection_prior', label: 'Réflexion avant' },
  { key: 'reflection_during', label: 'Réflexion pendant' },
  { key: 'reflection_after', label: 'Réflexion après' },
];

const UnitPlanForm: React.FC<UnitPlanFormProps> = ({ initialPlan, onSave, onCancel, detailUpdateMode = false }) => {
  const [plan, setPlan] = useState<UnitPlan>(initialPlan || {
    id: Date.now().toString(),
    teacherName: '',
    title: '',
    subject: '',
    gradeLevel: '',
    duration: '',
    schoolYear: '',
    numberOfPeriods: '',
    numberOfHours: '',
    startDate: '',
    endDate: '',
    prerequisites: '',
    keyConcept: '',
    relatedConcepts: [],
    globalContext: '',
    statementOfInquiry: '',
    inquiryQuestions: { factual: [], conceptual: [], debatable: [] },
    objectives: [],
    atlSkills: [],
    content: '',
    lessons: [],
    learningExperiences: '',
    summativeAssessment: '',
    formativeAssessment: '',
    differentiation: '',
    resources: '',
    reflection: { prior: '', during: '', after: '' },
    generatedAssessmentDocument: '',
    assessmentData: undefined,
    assessments: [],
    sessions: [],
    formativeDetails: [],
  });

  const [allowUnlock, setAllowUnlock] = useState(false);

  // Synchroniser le plan lorsque initialPlan change (notamment après génération IA)
  useEffect(() => {
    if (initialPlan) {
      setPlan(initialPlan);
    }
  }, [initialPlan]);

  const [topicsInput, setTopicsInput] = useState('');
  const [isFullGenerating, setIsFullGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'plan' | 'assessment' | 'compliance'>('plan');

  const [isGeneratingSOI, setIsGeneratingSOI] = useState(false);
  const [isGeneratingQuestions, setIsGeneratingQuestions] = useState(false);
  const [isGeneratingActivities, setIsGeneratingActivities] = useState(false);
  const [soiSuggestions, setSoiSuggestions] = useState<string[]>([]);
  const [isUpdatingFromConcepts, setIsUpdatingFromConcepts] = useState(false);
  const [updateStatusMsg, setUpdateStatusMsg] = useState('');

  const handleUpdateFromConceptsAndObjectives = async () => {
    setIsUpdatingFromConcepts(true);
    setUpdateStatusMsg("Initialisation de la mise à jour...");
    try {
      const updated = await updateUnitFromConceptsAndObjectives(plan, (msg) => {
        setUpdateStatusMsg(msg);
      });
      setPlan(updated);
      alert(
        `✅ Unité et évaluations mises à jour avec succès !\n\n` +
        `• Énoncé de recherche et questions réalignés sur les concepts.\n` +
        `• Détails des objectifs actualisés.\n` +
        `• ${updated.assessments?.length || 0} évaluation(s) critériée(s) générée(s) pour : ${(updated.objectives || []).join(', ')}.`
      );
    } catch (err: any) {
      alert(`❌ Erreur lors de la mise à jour : ${err?.message || err}`);
    } finally {
      setIsUpdatingFromConcepts(false);
      setUpdateStatusMsg('');
    }
  };

  const handleInputChange = (field: keyof UnitPlan, value: any) => {
    setPlan(prev => ({ ...prev, [field]: value }));
  };

  const handleNestedChange = (section: string, field: string, value: any) => {
    setPlan(prev => ({
      ...prev,
      [section]: { ...(prev as any)[section], [field]: value }
    }));
  };

  const handleReflectionChange = (field: keyof typeof plan.reflection, value: string) => {
    setPlan(prev => ({ ...prev, reflection: { ...prev.reflection, [field]: value } }));
  };

  const toggleRelatedConcept = (concept: string) => {
    setPlan(prev => {
      const current = prev.relatedConcepts;
      if (current.includes(concept)) {
        return { ...prev, relatedConcepts: current.filter(c => c !== concept) };
      }
      if (current.length >= 3) return prev;
      return { ...prev, relatedConcepts: [...current, concept] };
    });
  };

  // Calcul conformité IB
  const computeCompliance = () => {
    const checks: Record<string, 'complete' | 'partial' | 'missing'> = {};
    
    const check = (key: string, value: any) => {
      if (!value || (Array.isArray(value) && value.length === 0) || value === '') {
        checks[key] = 'missing';
      } else if (typeof value === 'string' && value.length < 20) {
        checks[key] = 'partial';
      } else {
        checks[key] = 'complete';
      }
    };

    check('keyConcept', plan.keyConcept);
    check('relatedConcepts', plan.relatedConcepts);
    check('globalContext', plan.globalContext);
    check('statementOfInquiry', plan.statementOfInquiry);
    check('inquiryQuestions', [
      ...(plan.inquiryQuestions?.factual || []),
      ...(plan.inquiryQuestions?.conceptual || []),
      ...(plan.inquiryQuestions?.debatable || [])
    ]);
    check('objectives', plan.objectives);
    check('content', plan.content);
    check('atlSkills', plan.atlSkills);
    check('learningExperiences', plan.learningExperiences);
    check('formativeAssessment', plan.formativeAssessment);
    check('summativeAssessment', plan.summativeAssessment);
    check('differentiation', plan.differentiation);
    check('reflection_prior', plan.reflection?.prior);
    check('reflection_during', plan.reflection?.during);
    check('reflection_after', plan.reflection?.after);

    const total = Object.keys(checks).length;
    const score = Object.values(checks).reduce((acc, v) => acc + (v === 'complete' ? 1 : v === 'partial' ? 0.5 : 0), 0);
    const pct = Math.round((score / total) * 100);

    return { checks, score: pct };
  };

  const { checks, score } = computeCompliance();

  const handleGenerateFullPlan = async () => {
    if (!topicsInput || !plan.subject || !plan.gradeLevel) {
      alert("Veuillez entrer la matière, le niveau scolaire et les chapitres/sujets.");
      return;
    }
    setIsFullGenerating(true);
    try {
      const generatedData = await generateFullUnitPlan(topicsInput, plan.subject, plan.gradeLevel);
      if (!generatedData || typeof generatedData !== 'object') {
        throw new Error("L'IA n'a pas retourné de plan valide.");
      }
      setPlan(prev => ({
        ...prev,
        ...generatedData,
        teacherName: prev.teacherName || generatedData.teacherName || "",
        inquiryQuestions: {
          factual: generatedData.inquiryQuestions?.factual || prev.inquiryQuestions.factual || [],
          conceptual: generatedData.inquiryQuestions?.conceptual || prev.inquiryQuestions.conceptual || [],
          debatable: generatedData.inquiryQuestions?.debatable || prev.inquiryQuestions.debatable || []
        },
        reflection: prev.reflection
      }));
    } catch (error: any) {
      alert(`❌ Échec de la génération:\n\n${error?.message || error}`);
    } finally {
      setIsFullGenerating(false);
    }
  };

  const handleGenerateSOI = async () => {
    if (!plan.keyConcept || plan.relatedConcepts.length === 0 || !plan.globalContext) {
      alert("Veuillez sélectionner le concept clé, les concepts connexes et le contexte mondial.");
      return;
    }
    setIsGeneratingSOI(true);
    const suggestions = await generateStatementOfInquiry(
      plan.keyConcept, plan.relatedConcepts, plan.globalContext,
      plan.subject, plan.gradeLevel, plan.title
    );
    setSoiSuggestions(suggestions);
    setIsGeneratingSOI(false);
  };

  const handleGenerateQuestions = async () => {
    if (!plan.statementOfInquiry) {
      alert("Veuillez d'abord définir un énoncé de recherche.");
      return;
    }
    setIsGeneratingQuestions(true);
    const questions = await generateInquiryQuestions(
      plan.statementOfInquiry, plan.subject, plan.keyConcept, plan.relatedConcepts
    );
    setPlan(prev => ({ ...prev, inquiryQuestions: questions }));
    setIsGeneratingQuestions(false);
  };

  const handleGenerateActivities = async () => {
    if (!plan.title || !plan.statementOfInquiry) {
      alert("Veuillez d'abord entrer un titre et un énoncé de recherche.");
      return;
    }
    setIsGeneratingActivities(true);
    const ideas = await generateLearningExperiences(plan);
    setPlan(prev => ({ ...prev, learningExperiences: prev.learningExperiences + (prev.learningExperiences ? "\n\n" : "") + ideas }));
    setIsGeneratingActivities(false);
  };

  const copyAssessmentToClipboard = () => {
    const text = plan.assessments.map(a =>
      `Critère ${a.criterion}: ${a.criterionName}\nMax: ${a.maxPoints}\n` +
      a.exercises.map((e, i) => `${i+1}. ${e.title}\n${e.content}`).join('\n\n')
    ).join('\n-------------------\n');
    navigator.clipboard.writeText(text || plan.generatedAssessmentDocument);
    alert("Résumé des évaluations copié !");
  };

  // --- Gestion des séances ---
  const addSession = () => {
    const newSession: UnitSession = {
      numero: (plan.sessions?.length || 0) + 1,
      date: '',
      duree: '',
      objectifApprentissage: '',
      contenu: '',
      concepts: '',
      questionsRecherche: '',
      atl: '',
      activite: '',
      roleEnseignant: '',
      roleEleves: '',
      strategie: '',
      ressources: '',
      technologie: '',
      evaluationFormative: '',
      differenciation: '',
      extensionAvances: '',
      soutienDifficultes: '',
      preuveApprentissage: '',
      reflexion: '',
    };
    setPlan(prev => ({ ...prev, sessions: [...(prev.sessions || []), newSession] }));
  };

  const updateSession = (idx: number, field: keyof UnitSession, value: any) => {
    setPlan(prev => {
      const sessions = [...(prev.sessions || [])];
      sessions[idx] = { ...sessions[idx], [field]: value };
      return { ...prev, sessions };
    });
  };

  const removeSession = (idx: number) => {
    setPlan(prev => ({
      ...prev,
      sessions: (prev.sessions || []).filter((_, i) => i !== idx)
    }));
  };

  // --- Gestion évaluations formatives détaillées ---
  const addFormativeDetail = () => {
    const newFD: FormativeAssessmentDetail = {
      titre: '',
      moment: '',
      objectifEvalue: '',
      activite: '',
      criteres: '',
      methodeEvaluation: '',
      feedbackEnseignant: '',
      autoevaluation: '',
      evaluationPairs: '',
      actionApres: '',
    };
    setPlan(prev => ({ ...prev, formativeDetails: [...(prev.formativeDetails || []), newFD] }));
  };

  const updateFormativeDetail = (idx: number, field: keyof FormativeAssessmentDetail, value: string) => {
    setPlan(prev => {
      const details = [...(prev.formativeDetails || [])];
      details[idx] = { ...details[idx], [field]: value };
      return { ...prev, formativeDetails: details };
    });
  };

  const removeFormativeDetail = (idx: number) => {
    setPlan(prev => ({
      ...prev,
      formativeDetails: (prev.formativeDetails || []).filter((_, i) => i !== idx)
    }));
  };

  const inputClass = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm";
  const textareaClass = "w-full p-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-sm";
  const labelClass = "block text-sm font-medium text-slate-600 mb-1";

  const isReadOnly = (field: string) => {
    if (!detailUpdateMode || allowUnlock) return false;
    // En mode mise à jour détails, certains champs sont verrouillés par défaut
    const locked = ['title', 'subject', 'gradeLevel', 'objectives', 'assessments', 'atlSkills'];
    return locked.includes(field);
  };

  return (
    <div className="max-w-5xl mx-auto bg-white shadow-xl rounded-xl overflow-hidden border border-slate-200">
      {/* Header */}
      <div className="bg-slate-800 text-white p-5 flex flex-wrap justify-between items-center gap-3 sticky top-0 z-10">
        <div className="flex items-center space-x-3 flex-wrap gap-2">
          <button onClick={onCancel} className="p-2 hover:bg-slate-700 rounded-full transition">
            <ArrowLeft size={20} />
          </button>
          <h2 className="text-lg font-bold flex items-center gap-2">
            <BookOpen size={22} />
            {detailUpdateMode ? "Mise à jour des détails" : initialPlan ? "Modifier le plan d'unité" : "Nouveau plan d'unité"}
          </h2>
          {detailUpdateMode && (
            <button
              type="button"
              onClick={() => setAllowUnlock(!allowUnlock)}
              className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full font-medium transition ${
                allowUnlock
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
              }`}
              title={allowUnlock ? "Champs déverrouillés pour modification" : "Cliquer pour déverrouiller tous les champs"}
            >
              {allowUnlock ? <Unlock size={13} /> : <Lock size={13} />}
              {allowUnlock ? "Champs déverrouillés" : "Champs de base verrouillés (cliquer pour déverrouiller)"}
            </button>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={handleUpdateFromConceptsAndObjectives}
            disabled={isUpdatingFromConcepts}
            className="flex items-center gap-1.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-3 py-2 rounded-lg font-medium transition shadow text-xs sm:text-sm disabled:opacity-50"
            title="Mettre à jour l'unité selon les concepts modifiés et critères spécifiques sélectionnés, avec évaluations adaptées"
          >
            {isUpdatingFromConcepts ? (
              <>
                <Loader2 className="animate-spin" size={15} />
                <span className="max-w-[180px] truncate">{updateStatusMsg || "Mise à jour..."}</span>
              </>
            ) : (
              <>
                <Sparkles size={15} className="text-amber-300" />
                <span>Mise à jour selon concepts & objectifs</span>
              </>
            )}
          </button>
          <div className="flex bg-slate-700 rounded-lg p-1">
            <button onClick={() => setActiveTab('plan')} className={`px-3 py-1 rounded-md text-xs font-medium transition ${activeTab === 'plan' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>Plan</button>
            <button onClick={() => setActiveTab('assessment')} className={`px-3 py-1 rounded-md text-xs font-medium transition ${activeTab === 'assessment' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>Évaluations ({plan.assessments.length})</button>
            <button onClick={() => setActiveTab('compliance')} className={`px-3 py-1 rounded-md text-xs font-medium transition ${activeTab === 'compliance' ? 'bg-white text-slate-900' : 'text-slate-300 hover:text-white'}`}>Conformité IB</button>
          </div>
          <button
            onClick={() => {
              if (!detailUpdateMode && plan.objectives.length < 2) {
                alert('⚠️ Veuillez sélectionner au moins 2 critères avant de sauvegarder.');
                return;
              }
              onSave({ ...plan, lastDetailUpdate: new Date().toISOString(), isDetailUpdate: detailUpdateMode });
            }}
            className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-600 text-white px-4 py-2 rounded-lg font-medium transition shadow-md text-sm"
          >
            <Save size={16} />
            Sauvegarder
          </button>
        </div>
      </div>

      {/* TAB: CONFORMITÉ IB */}
      {activeTab === 'compliance' && (
        <div className="p-8 bg-slate-50 min-h-[80vh]">
          <h3 className="text-xl font-bold text-slate-800 mb-2">Vérification de conformité IB</h3>
          <p className="text-sm text-slate-500 mb-6">Ce score est un indicateur de complétude du document et ne constitue pas une certification IB officielle.</p>
          <div className="mb-6">
            <div className="flex items-center gap-4">
              <div className={`text-4xl font-bold ${score >= 80 ? 'text-emerald-600' : score >= 50 ? 'text-amber-500' : 'text-red-500'}`}>{score}%</div>
              <div className="flex-1 bg-slate-200 rounded-full h-4">
                <div className={`h-4 rounded-full transition-all ${score >= 80 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-400' : 'bg-red-400'}`} style={{ width: `${score}%` }} />
              </div>
            </div>
            <p className="text-sm text-slate-500 mt-2">Score de complétude : {score} %</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {ibSections.map(s => {
              const status = checks[s.key] || 'missing';
              return (
                <div key={s.key} className={`flex items-center gap-3 p-3 rounded-lg border ${status === 'complete' ? 'bg-emerald-50 border-emerald-200' : status === 'partial' ? 'bg-amber-50 border-amber-200' : 'bg-red-50 border-red-200'}`}>
                  {status === 'complete' ? <CheckCircle size={18} className="text-emerald-500 flex-shrink-0" /> : status === 'partial' ? <AlertCircle size={18} className="text-amber-500 flex-shrink-0" /> : <AlertCircle size={18} className="text-red-400 flex-shrink-0" />}
                  <span className="text-sm font-medium text-slate-700">{s.label}</span>
                  <span className={`ml-auto text-xs font-bold ${status === 'complete' ? 'text-emerald-600' : status === 'partial' ? 'text-amber-600' : 'text-red-500'}`}>
                    {status === 'complete' ? '🟢 Complet' : status === 'partial' ? '🟠 À compléter' : '🔴 Manquant'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB: ÉVALUATIONS */}
      {activeTab === 'assessment' && (
        <div className="p-8 bg-slate-50 min-h-[80vh]">
          <div className="max-w-4xl mx-auto">
            <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-xl font-bold text-slate-800">Aperçu des Évaluations</h3>
                <p className="text-xs text-slate-500">Évaluations critériées IB alignées sur les critères de l'unité ({plan.assessments.length} critère(s))</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleUpdateFromConceptsAndObjectives}
                  disabled={isUpdatingFromConcepts}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3 py-2 rounded-lg shadow-sm transition disabled:opacity-50"
                  title="Régénérer les évaluations selon les critères sélectionnés et concepts de l'unité"
                >
                  {isUpdatingFromConcepts ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} className="text-amber-300" />}
                  Mettre à jour les évaluations
                </button>
                <button onClick={copyAssessmentToClipboard} className="flex items-center gap-2 text-blue-600 hover:text-blue-700 bg-white border border-blue-200 px-3 py-2 rounded-lg shadow-sm transition text-sm">
                  <Copy size={16} /> Copier
                </button>
              </div>
            </div>
            {plan.assessments.length > 0 ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {plan.assessments.map((assessment, idx) => (
                  <div key={idx} className="bg-white p-5 rounded-xl shadow border border-slate-200">
                    <div className="flex justify-between items-center border-b border-slate-100 pb-3 mb-3">
                      <h4 className="font-bold text-lg text-slate-800">Critère {assessment.criterion}</h4>
                      <span className="bg-slate-100 text-slate-600 text-xs px-2 py-1 rounded">{assessment.maxPoints} pts</span>
                    </div>
                    <p className="text-sm text-slate-600 mb-2 font-medium">{assessment.criterionName}</p>
                    <div className="space-y-2 mt-4">
                      <p className="text-xs text-slate-400 uppercase font-bold">Exercices:</p>
                      {assessment.exercises.map((ex, i) => (
                        <div key={i} className="text-sm bg-slate-50 p-2 rounded border border-slate-100">
                          <span className="font-bold block text-slate-700">{ex.title}</span>
                          <span className="text-slate-500 text-xs whitespace-pre-wrap block">{ex.content}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-white p-12 rounded-lg border border-dashed border-slate-300 text-center">
                <FileText size={48} className="mx-auto text-slate-300 mb-4" />
                <p className="text-slate-500 mb-2">Aucune évaluation générée pour le moment.</p>
                <p className="text-xs text-slate-400 mb-4">Cliquez sur le bouton ci-dessous pour générer les évaluations selon les critères choisis.</p>
                <button
                  type="button"
                  onClick={handleUpdateFromConceptsAndObjectives}
                  disabled={isUpdatingFromConcepts}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow transition inline-flex items-center gap-1.5"
                >
                  {isUpdatingFromConcepts ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  Générer les évaluations selon critères & concepts
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB: PLAN */}
      {activeTab === 'plan' && (
        <div className="p-6 space-y-4">

          {/* Génération automatique */}
          {!initialPlan && !detailUpdateMode && (
            <div className="bg-gradient-to-r from-violet-50 to-indigo-50 p-5 rounded-xl border border-indigo-100 shadow-sm">
              <div className="flex items-center gap-2 mb-3 text-indigo-900">
                <Wand2 className="text-indigo-600" size={22} />
                <h3 className="text-base font-bold">Génération Automatique (Plan + Évaluations A-D)</h3>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div>
                  <label className={labelClass}>Matière</label>
                  <input type="text" value={plan.subject} className={`${inputClass} bg-indigo-50`} readOnly />
                </div>
                <div>
                  <label className={labelClass}>Niveau PEI</label>
                  <input type="text" value={plan.gradeLevel} className={`${inputClass} bg-indigo-50`} readOnly />
                </div>
              </div>
              <div className="mb-3">
                <label className={labelClass}>Chapitres / Contenu</label>
                <textarea value={topicsInput} onChange={(e) => setTopicsInput(e.target.value)} placeholder="ex: Chapitre 1: Les équations linéaires, Chapitre 2: Les inéquations..." className={`${textareaClass} h-20`} />
              </div>
              <button onClick={handleGenerateFullPlan} disabled={isFullGenerating} className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow transition flex items-center justify-center gap-2 text-sm">
                {isFullGenerating ? <><Loader2 className="animate-spin" size={18} />Génération en cours...</> : <><Sparkles size={18} />Générer le Plan et les Évaluations</>}
              </button>
            </div>
          )}

          {/* ── Aperçu des Chapitres et Leçons au format tirets et couleurs ── */}
          {(plan.chapters || (plan.lessons && plan.lessons.length > 0) || (plan.sessions && plan.sessions.length > 0)) && (
            <div className="mb-2">
              <ChaptersLessonsViewer plan={plan} variant="full" />
            </div>
          )}

          {/* ── A. INFORMATIONS GÉNÉRALES ── */}
          <CollapsibleSection title="A. Informations générales" icon={<BookMarked size={18} className="text-blue-600" />} defaultOpen={true}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Enseignant(e)</label>
                <input type="text" value={plan.teacherName} onChange={(e) => handleInputChange('teacherName', e.target.value)} className={inputClass} placeholder="Nom de l'enseignant" disabled={isReadOnly('teacherName')} />
              </div>
              <div>
                <label className={labelClass}>Titre de l'unité {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
                <input type="text" value={plan.title} onChange={(e) => !isReadOnly('title') && handleInputChange('title', e.target.value)} className={`${inputClass} ${isReadOnly('title') ? 'bg-slate-100 cursor-not-allowed' : ''}`} readOnly={isReadOnly('title')} />
              </div>
              <div>
                <label className={labelClass}>Groupe de matières {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
                {initialPlan?.subject || plan.subject || isReadOnly('subject') ? (
                  <input type="text" value={plan.subject} className={`${inputClass} bg-slate-100 cursor-not-allowed`} readOnly />
                ) : (
                  <select value={plan.subject} onChange={(e) => handleInputChange('subject', e.target.value)} className={`${inputClass} bg-white`}>
                    <option value="">Sélectionner...</option>
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                )}
              </div>
              <div>
                <label className={labelClass}>Année du PEI {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
                <input type="text" value={plan.gradeLevel} className={`${inputClass} bg-slate-100 cursor-not-allowed`} readOnly />
              </div>
              <div>
                <label className={labelClass}>Durée (heures)</label>
                <input type="text" value={plan.duration} onChange={(e) => handleInputChange('duration', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Année scolaire</label>
                <input type="text" value={plan.schoolYear || ''} onChange={(e) => handleInputChange('schoolYear', e.target.value)} className={inputClass} placeholder="2024-2025" />
              </div>
              <div>
                <label className={labelClass}>Nombre de périodes</label>
                <input type="text" value={plan.numberOfPeriods || ''} onChange={(e) => handleInputChange('numberOfPeriods', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Nombre d'heures</label>
                <input type="text" value={plan.numberOfHours || ''} onChange={(e) => handleInputChange('numberOfHours', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Date de début</label>
                <input type="text" value={plan.startDate || ''} onChange={(e) => handleInputChange('startDate', e.target.value)} className={inputClass} placeholder="ex: 30 Août 2026" />
              </div>
              <div>
                <label className={labelClass}>Date de fin</label>
                <input type="text" value={plan.endDate || ''} onChange={(e) => handleInputChange('endDate', e.target.value)} className={inputClass} placeholder="ex: 15 Octobre 2026" />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Prérequis</label>
                <textarea value={plan.prerequisites || ''} onChange={(e) => handleInputChange('prerequisites', e.target.value)} className={`${textareaClass} h-16`} placeholder="Connaissances et compétences prérequises..." />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Chapitres / Leçons inclus dans cette unité</label>
                <textarea value={plan.chapters || ''} onChange={(e) => handleInputChange('chapters', e.target.value)} className={`${textareaClass} h-20`} placeholder="- Chapitre 1: Introduction...&#10;- Chapitre 2: Développement..." />
                {(plan.chapters || (plan.lessons && plan.lessons.length > 0)) && (
                  <div className="mt-2.5">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                      <Sparkles size={12} className="text-indigo-600" /> Aperçu dynamique des chapitres et leçons (tirets et couleurs) :
                    </p>
                    <ChaptersLessonsViewer plan={plan} chapters={plan.chapters} variant="preview" showTitle={false} />
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* ── B. CONTEXTE DES ÉLÈVES ── */}
          <CollapsibleSection title="B. Contexte des élèves et connaissances antérieures" icon={<Users size={18} className="text-green-600" />} badge="Exigence IB 1.6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Connaissances antérieures des élèves</label>
                <textarea value={plan.studentContext?.priorKnowledge || ''} onChange={(e) => handleNestedChange('studentContext', 'priorKnowledge', e.target.value)} className={`${textareaClass} h-20`} placeholder="Ce que les élèves savent déjà..." />
              </div>
              <div>
                <label className={labelClass}>Compétences déjà acquises</label>
                <textarea value={plan.studentContext?.acquiredSkills || ''} onChange={(e) => handleNestedChange('studentContext', 'acquiredSkills', e.target.value)} className={`${textareaClass} h-20`} placeholder="Compétences maîtrisées..." />
              </div>
              <div>
                <label className={labelClass}>Liens avec les unités précédentes</label>
                <textarea value={plan.studentContext?.linksPreviousUnits || ''} onChange={(e) => handleNestedChange('studentContext', 'linksPreviousUnits', e.target.value)} className={`${textareaClass} h-20`} placeholder="Connexions avec les unités précédentes..." />
              </div>
              <div>
                <label className={labelClass}>Besoins spécifiques des élèves</label>
                <textarea value={plan.studentContext?.specificNeeds || ''} onChange={(e) => handleNestedChange('studentContext', 'specificNeeds', e.target.value)} className={`${textareaClass} h-20`} placeholder="Besoins identifiés..." />
              </div>
              <div>
                <label className={labelClass}>Diversité des profils</label>
                <textarea value={plan.studentContext?.profileDiversity || ''} onChange={(e) => handleNestedChange('studentContext', 'profileDiversity', e.target.value)} className={`${textareaClass} h-20`} placeholder="Diversité culturelle, sociale, linguistique..." />
              </div>
              <div>
                <label className={labelClass}>Difficultés anticipées</label>
                <textarea value={plan.studentContext?.anticipatedDifficulties || ''} onChange={(e) => handleNestedChange('studentContext', 'anticipatedDifficulties', e.target.value)} className={`${textareaClass} h-20`} placeholder="Obstacles prévisibles..." />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── C. CONCEPTS ── */}
          <CollapsibleSection title="C. Concepts" icon={<Brain size={18} className="text-purple-600" />} defaultOpen={true}>
            {/* Action de mise à jour rapide selon les concepts */}
            <div className="p-3.5 mb-4 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-purple-900 flex items-center gap-1.5">
                  <Sparkles size={15} className="text-purple-600" />
                  Mise à jour de l'unité selon les concepts modifiés
                </p>
                <p className="text-[11px] text-purple-700 mt-0.5">
                  Réaligne automatiquement l'énoncé de recherche, les questions de recherche et les évaluations en accord avec vos concepts (clé et connexes) et le contexte mondial.
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpdateFromConceptsAndObjectives}
                disabled={isUpdatingFromConcepts}
                className="flex items-center gap-1.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-semibold px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50 shrink-0"
              >
                {isUpdatingFromConcepts ? <Loader2 className="animate-spin" size={13} /> : <RefreshCw size={13} />}
                Actualiser l'unité selon ces concepts
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelClass}>Concept clé {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
                <select value={plan.keyConcept} onChange={(e) => !isReadOnly('keyConcept') && handleInputChange('keyConcept', e.target.value)} className={`${inputClass} bg-white ${isReadOnly('keyConcept') ? 'bg-slate-100 cursor-not-allowed' : ''}`} disabled={isReadOnly('keyConcept')}>
                  <option value="">Sélectionner...</option>
                  {KEY_CONCEPTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className={labelClass}>Concepts connexes (Max 3) {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
                <div className={`h-28 overflow-y-auto border border-slate-300 rounded-lg bg-white p-2 ${isReadOnly('relatedConcepts') ? 'bg-slate-100 pointer-events-none' : ''}`}>
                  {RELATED_CONCEPTS_GENERIC.map(c => (
                    <label key={c} className="flex items-center space-x-2 text-xs cursor-pointer hover:bg-blue-50 p-1 rounded">
                      <input type="checkbox" checked={plan.relatedConcepts.includes(c)} onChange={() => toggleRelatedConcept(c)} className="rounded text-blue-600" />
                      <span className={plan.relatedConcepts.includes(c) ? 'font-medium text-blue-700' : 'text-slate-600'}>{c}</span>
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Contexte mondial</label>
                <select value={plan.globalContext} onChange={(e) => handleInputChange('globalContext', e.target.value)} className={`${inputClass} bg-white`}>
                  <option value="">Sélectionner...</option>
                  {GLOBAL_CONTEXTS.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Définition du concept clé</label>
                <textarea value={plan.keyConceptDefinition || ''} onChange={(e) => handleInputChange('keyConceptDefinition', e.target.value)} className={`${textareaClass} h-16`} placeholder="Définir le concept clé..." />
              </div>
              <div>
                <label className={labelClass}>Justification du choix du concept</label>
                <textarea value={plan.keyConceptJustification || ''} onChange={(e) => handleInputChange('keyConceptJustification', e.target.value)} className={`${textareaClass} h-16`} placeholder="Pourquoi ce concept..." />
              </div>
              <div>
                <label className={labelClass}>Comment le concept sera développé dans l'unité</label>
                <textarea value={plan.keyConceptDevelopment || ''} onChange={(e) => handleInputChange('keyConceptDevelopment', e.target.value)} className={`${textareaClass} h-16`} placeholder="Développement prévu..." />
              </div>
              <div>
                <label className={labelClass}>Justification du contexte mondial</label>
                <textarea value={plan.globalContextJustification || ''} onChange={(e) => handleInputChange('globalContextJustification', e.target.value)} className={`${textareaClass} h-16`} placeholder="Pourquoi ce contexte mondial..." />
              </div>
              <div>
                <label className={labelClass}>Aspects du contexte mondial explorés</label>
                <textarea value={plan.globalContextAspects || ''} onChange={(e) => handleInputChange('globalContextAspects', e.target.value)} className={`${textareaClass} h-16`} placeholder="Quels aspects sont abordés..." />
              </div>
              <div>
                <label className={labelClass}>Liens contexte mondial ↔ concepts ↔ contenu</label>
                <textarea value={plan.globalContextLinks || ''} onChange={(e) => handleInputChange('globalContextLinks', e.target.value)} className={`${textareaClass} h-16`} placeholder="Comment les éléments sont liés..." />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── D. ÉNONCÉ DE RECHERCHE ── */}
          <CollapsibleSection title="D. Énoncé de recherche" icon={<MessageSquare size={18} className="text-indigo-600" />} defaultOpen={true}>
            <div className="bg-indigo-50 p-4 rounded-lg mb-4">
              <div className="flex justify-between items-center mb-2">
                <label className="text-sm font-bold text-slate-700">Énoncé de recherche</label>
                <button onClick={handleGenerateSOI} disabled={isGeneratingSOI} className="flex items-center gap-1 text-xs bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white px-3 py-1.5 rounded-full hover:opacity-90 transition disabled:opacity-50">
                  {isGeneratingSOI ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                  Suggérer
                </button>
              </div>
              {soiSuggestions.length > 0 && (
                <div className="mb-3 p-3 bg-violet-50 border border-violet-100 rounded-md">
                  <p className="text-xs text-violet-700 font-bold mb-2">Suggestions IA :</p>
                  <ul className="space-y-2">
                    {soiSuggestions.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-slate-700 group">
                        <button onClick={() => setPlan(prev => ({...prev, statementOfInquiry: s}))} className="mt-0.5 text-violet-500 hover:text-violet-700"><Plus size={14} /></button>
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              <textarea value={plan.statementOfInquiry} onChange={(e) => handleInputChange('statementOfInquiry', e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none text-base font-medium text-slate-800" rows={3} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Explication de l'énoncé</label>
                <textarea value={plan.statementExplanation || ''} onChange={(e) => handleInputChange('statementExplanation', e.target.value)} className={`${textareaClass} h-16`} placeholder="Ce que l'énoncé signifie..." />
              </div>
              <div>
                <label className={labelClass}>Possibilité de transfert</label>
                <textarea value={plan.statementTransfer || ''} onChange={(e) => handleInputChange('statementTransfer', e.target.value)} className={`${textareaClass} h-16`} placeholder="Comment les élèves peuvent transférer..." />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── E. QUESTIONS DE RECHERCHE ── */}
          <CollapsibleSection title="E. Questions de recherche" icon={<Target size={18} className="text-rose-600" />} defaultOpen={true}>
            <div className="flex justify-end mb-3">
              <button onClick={handleGenerateQuestions} disabled={isGeneratingQuestions} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-200 transition">
                {isGeneratingQuestions ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                Générer les questions
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[{key:'factual',label:'Factuelles',color:'bg-blue-50 border-blue-200'},{key:'conceptual',label:'Conceptuelles',color:'bg-purple-50 border-purple-200'},{key:'debatable',label:'Invitant au débat',color:'bg-orange-50 border-orange-200'}].map((type) => {
                const questionList = plan.inquiryQuestions?.[type.key as keyof typeof plan.inquiryQuestions] || [];
                return (
                  <div key={type.key} className={`p-3 rounded-lg border ${type.color}`}>
                    <h4 className="text-xs font-bold uppercase text-slate-600 mb-2">{type.label}</h4>
                    <ul className="space-y-2 min-h-[80px]">
                      {questionList.map((q, i) => (
                        <li key={i} className="text-xs text-slate-700 bg-white p-2 rounded flex justify-between group border border-slate-100">
                          <span>{q}</span>
                          <button onClick={() => {
                            const newQs = {...plan.inquiryQuestions};
                            const key = type.key as keyof typeof plan.inquiryQuestions;
                            (newQs[key] as string[]) = (newQs[key] as string[]).filter((_, idx) => idx !== i);
                            setPlan(p => ({...p, inquiryQuestions: newQs}));
                          }} className="text-slate-300 hover:text-red-500 ml-2 flex-shrink-0"><Trash2 size={10} /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </CollapsibleSection>

          {/* ── F. OBJECTIFS SPÉCIFIQUES ── */}
          <CollapsibleSection title="F. Objectifs spécifiques du groupe de matières" icon={<CheckCircle size={18} className="text-emerald-600" />} defaultOpen={true} badge={detailUpdateMode ? "🔒 Verrouillé" : undefined} badgeColor="bg-amber-100 text-amber-700">
            {/* Action de mise à jour des évaluations selon les critères modifiés */}
            <div className="p-3.5 mb-4 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-lg flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-emerald-900 flex items-center gap-1.5">
                  <CheckCircle size={15} className="text-emerald-600" />
                  Mettre à jour les évaluations selon les critères sélectionnés
                </p>
                <p className="text-[11px] text-emerald-700 mt-0.5">
                  Génère des évaluations critériées IB authentiques strictement ciblées sur les critères choisis pour cette unité ({plan.objectives.length > 0 ? plan.objectives.map(c => `Critère ${c}`).join(', ') : 'Sélectionnez au moins 2 critères'}).
                </p>
              </div>
              <button
                type="button"
                onClick={handleUpdateFromConceptsAndObjectives}
                disabled={isUpdatingFromConcepts}
                className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow-sm transition disabled:opacity-50 shrink-0"
              >
                {isUpdatingFromConcepts ? <Loader2 className="animate-spin" size={13} /> : <Sparkles size={13} />}
                Mettre à jour selon ces critères
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Critères d'évaluation (min. 2) {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
                <div className={`space-y-2 p-3 border border-slate-300 rounded-lg bg-slate-50 ${isReadOnly('objectives') ? 'pointer-events-none opacity-75' : ''}`}>
                  {['A', 'B', 'C', 'D'].map(criterion => {
                    const names: Record<string, string> = { 'A': 'Connaissances et compréhension', 'B': 'Recherche', 'C': 'Communication', 'D': 'Pensée critique' };
                    const isSelected = plan.objectives.includes(criterion);
                    return (
                      <label key={criterion} className="flex items-center space-x-2 cursor-pointer hover:bg-slate-100 p-2 rounded">
                        <input type="checkbox" checked={isSelected} onChange={(e) => {
                          if (isReadOnly('objectives')) return;
                          const newObj = e.target.checked ? [...plan.objectives, criterion] : plan.objectives.filter(o => o !== criterion);
                          handleInputChange('objectives', newObj);
                        }} className="w-4 h-4 text-blue-600 rounded" />
                        <span className="text-sm"><strong>Critère {criterion}:</strong> {names[criterion]}</span>
                      </label>
                    );
                  })}
                </div>
                {plan.objectives.length < 2 && !detailUpdateMode && (
                  <p className="text-xs text-red-600 mt-1">⚠️ Sélectionnez au moins 2 critères</p>
                )}
              </div>
              <div>
                <label className={labelClass}>Évaluation sommative (aperçu)</label>
                <textarea value={plan.summativeAssessment} onChange={(e) => handleInputChange('summativeAssessment', e.target.value)} className={`${textareaClass} h-32`} />
              </div>
            </div>
            {/* Détails par objectif */}
            {plan.objectives.length > 0 && (
              <div className="mt-4 space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase">Détails par objectif (OBJECTIF → ACTIVITÉ → APPRENTISSAGE → ÉVALUATION)</p>
                {plan.objectives.map(criterion => {
                  const names: Record<string, string> = { 'A': 'Connaissances et compréhension', 'B': 'Recherche', 'C': 'Communication', 'D': 'Pensée critique' };
                  const detail = plan.objectivesDetails?.find(d => d.criterion === criterion) || { criterion, aspects: '', expectedLevel: '', activities: '', formativeAssessment: '', summativeAssessment: '' };
                  return (
                    <div key={criterion} className="bg-slate-50 p-3 rounded-lg border border-slate-200">
                      <p className="text-sm font-bold text-blue-700 mb-2">Critère {criterion} : {names[criterion]}</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Aspects travaillés</label>
                          <input type="text" value={detail.aspects} onChange={(e) => {
                            const newDetails = [...(plan.objectivesDetails || [])];
                            const idx = newDetails.findIndex(d => d.criterion === criterion);
                            if (idx >= 0) newDetails[idx] = { ...newDetails[idx], aspects: e.target.value };
                            else newDetails.push({ ...detail, aspects: e.target.value });
                            handleInputChange('objectivesDetails', newDetails);
                          }} className={`${inputClass} text-xs`} placeholder="ex: i, ii, iii" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Niveau attendu</label>
                          <input type="text" value={detail.expectedLevel} onChange={(e) => {
                            const newDetails = [...(plan.objectivesDetails || [])];
                            const idx = newDetails.findIndex(d => d.criterion === criterion);
                            if (idx >= 0) newDetails[idx] = { ...newDetails[idx], expectedLevel: e.target.value };
                            else newDetails.push({ ...detail, expectedLevel: e.target.value });
                            handleInputChange('objectivesDetails', newDetails);
                          }} className={`${inputClass} text-xs`} placeholder="ex: 5-6" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Activités permettant de développer</label>
                          <textarea value={detail.activities} onChange={(e) => {
                            const newDetails = [...(plan.objectivesDetails || [])];
                            const idx = newDetails.findIndex(d => d.criterion === criterion);
                            if (idx >= 0) newDetails[idx] = { ...newDetails[idx], activities: e.target.value };
                            else newDetails.push({ ...detail, activities: e.target.value });
                            handleInputChange('objectivesDetails', newDetails);
                          }} className={`${textareaClass} text-xs h-14`} />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 block mb-1">Évaluation formative associée</label>
                          <textarea value={detail.formativeAssessment} onChange={(e) => {
                            const newDetails = [...(plan.objectivesDetails || [])];
                            const idx = newDetails.findIndex(d => d.criterion === criterion);
                            if (idx >= 0) newDetails[idx] = { ...newDetails[idx], formativeAssessment: e.target.value };
                            else newDetails.push({ ...detail, formativeAssessment: e.target.value });
                            handleInputChange('objectivesDetails', newDetails);
                          }} className={`${textareaClass} text-xs h-14`} />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CollapsibleSection>

          {/* ── G. CONTENU ── */}
          <CollapsibleSection title="G. Contenu" icon={<Layers size={18} className="text-teal-600" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Contenu général</label>
                <textarea value={plan.content} onChange={(e) => handleInputChange('content', e.target.value)} className={`${textareaClass} h-20`} />
              </div>
              <div>
                <label className={labelClass}>Connaissances</label>
                <textarea value={plan.contentDetails?.knowledges || ''} onChange={(e) => handleNestedChange('contentDetails', 'knowledges', e.target.value)} className={`${textareaClass} h-16`} placeholder="Savoirs théoriques..." />
              </div>
              <div>
                <label className={labelClass}>Notions / Vocabulaire</label>
                <textarea value={plan.contentDetails?.vocabulary || ''} onChange={(e) => handleNestedChange('contentDetails', 'vocabulary', e.target.value)} className={`${textareaClass} h-16`} placeholder="Termes clés à maîtriser..." />
              </div>
              <div>
                <label className={labelClass}>Méthodes et techniques</label>
                <textarea value={plan.contentDetails?.methods || ''} onChange={(e) => handleNestedChange('contentDetails', 'methods', e.target.value)} className={`${textareaClass} h-16`} placeholder="Démarches méthodologiques..." />
              </div>
              <div>
                <label className={labelClass}>Compétences disciplinaires / Savoir-faire</label>
                <textarea value={plan.contentDetails?.disciplinarySkills || ''} onChange={(e) => handleNestedChange('contentDetails', 'disciplinarySkills', e.target.value)} className={`${textareaClass} h-16`} placeholder="Compétences spécifiques à la matière..." />
              </div>
              <div>
                <label className={labelClass}>Contenu obligatoire</label>
                <textarea value={plan.contentDetails?.mandatoryContent || ''} onChange={(e) => handleNestedChange('contentDetails', 'mandatoryContent', e.target.value)} className={`${textareaClass} h-16`} placeholder="Programme obligatoire IB..." />
              </div>
              <div>
                <label className={labelClass}>Liens programme national français</label>
                <textarea value={plan.contentDetails?.nationalLinks || ''} onChange={(e) => handleNestedChange('contentDetails', 'nationalLinks', e.target.value)} className={`${textareaClass} h-16`} placeholder="Correspondances avec le programme national..." />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Leçons / Chapitres <span className="text-xs text-slate-400">(une leçon par ligne)</span></label>
                <textarea value={plan.lessons?.join('\n') || ''} onChange={(e) => handleInputChange('lessons', e.target.value.split('\n').filter(l => l.trim()))} className={`${textareaClass} h-24`} placeholder="- Leçon 1: Introduction&#10;- Leçon 2: Développement" />
                {(plan.lessons && plan.lessons.length > 0) && (
                  <div className="mt-2.5">
                    <p className="text-[11px] font-bold text-slate-500 mb-1 flex items-center gap-1">
                      <Sparkles size={12} className="text-teal-600" /> Structure dynamique des leçons :
                    </p>
                    <ChaptersLessonsViewer lessons={plan.lessons} variant="preview" showTitle={false} />
                  </div>
                )}
              </div>
            </div>
          </CollapsibleSection>

          {/* ── H. ATL ── */}
          <CollapsibleSection title="H. Approches de l'apprentissage (ATL)" icon={<Settings size={18} className="text-orange-600" />} badge={detailUpdateMode ? "🔒 Verrouillé" : undefined} badgeColor="bg-amber-100 text-amber-700">
            <div className={isReadOnly('atlSkills') ? 'pointer-events-none opacity-75' : ''}>
              <label className={labelClass}>ATL sélectionnées {detailUpdateMode && <span className="text-xs text-amber-600 ml-1">🔒</span>}</label>
              <textarea value={Array.isArray(plan.atlSkills) ? plan.atlSkills.join('\n') : plan.atlSkills} onChange={(e) => !isReadOnly('atlSkills') && handleInputChange('atlSkills', e.target.value.split('\n'))} className={`${textareaClass} h-20`} placeholder="Catégorie: Compétence — Sous-compétence..." />
            </div>
            <div className="mt-4">
              <p className="text-xs font-bold text-slate-500 uppercase mb-3">Détails ATL (méthode d'enseignement + observation)</p>
              <div className="space-y-3">
                {(plan.atlDetails || []).map((atl, idx) => (
                  <div key={idx} className="bg-orange-50 p-3 rounded-lg border border-orange-200">
                    <div className="flex justify-between mb-2">
                      <span className="text-xs font-bold text-orange-700">ATL #{idx+1}</span>
                      <button onClick={() => {
                        const newAtl = (plan.atlDetails || []).filter((_, i) => i !== idx);
                        handleInputChange('atlDetails', newAtl);
                      }} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        {field:'categorie', label:'Catégorie', placeholder:'Communication / Recherche / Pensée / Autogestion / Social'},
                        {field:'competence', label:'Compétence', placeholder:'Compétence ATL...'},
                        {field:'objectifDeveloppement', label:'Objectif de développement', placeholder:'Que l\'élève devra développer...'},
                        {field:'activite', label:'Activité', placeholder:'Activité permettant de développer...'},
                        {field:'methodeEnseignement', label:'Méthode d\'enseignement', placeholder:'Comment l\'ATL est enseignée...'},
                        {field:'observation', label:'Observation / Évaluation', placeholder:'Comment observer la progression...'},
                        {field:'reflexionEleve', label:'Réflexion de l\'élève', placeholder:'Comment l\'élève réfléchit sur ses ATL...'},
                      ].map(f => (
                        <div key={f.field} className={f.field === 'categorie' || f.field === 'reflexionEleve' ? 'col-span-2' : ''}>
                          <label className="text-xs text-slate-500 block mb-1">{f.label}</label>
                          <input type="text" value={(atl as any)[f.field]} onChange={(e) => {
                            const newAtl = [...(plan.atlDetails || [])];
                            newAtl[idx] = { ...newAtl[idx], [f.field]: e.target.value };
                            handleInputChange('atlDetails', newAtl);
                          }} className={`${inputClass} text-xs`} placeholder={f.placeholder} />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                <button onClick={() => {
                  const newAtl: ATLDetail = { categorie: '', competence: '', sousCompetence: '', objectifDeveloppement: '', activite: '', methodeEnseignement: '', observation: '', reflexionEleve: '' };
                  handleInputChange('atlDetails', [...(plan.atlDetails || []), newAtl]);
                }} className="flex items-center gap-2 text-xs text-orange-600 hover:text-orange-700 border border-dashed border-orange-300 rounded-lg px-3 py-2 w-full justify-center">
                  <Plus size={14} /> Ajouter une ATL détaillée
                </button>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── I. PROCESSUS D'APPRENTISSAGE ── */}
          <CollapsibleSection title="I. Processus d'apprentissage" icon={<RefreshCw size={18} className="text-cyan-600" />}>
            <div className="space-y-3">
              {[
                {phase:'phase1_activation', label:'Phase 1 – Activation des connaissances antérieures', placeholder:'Activité diagnostique, questionnement, brainstorming, carte conceptuelle...'},
                {phase:'phase2_acquisition', label:'Phase 2 – Acquisition', placeholder:'Enseignement explicite, lecture, observation, recherche, expérimentation...'},
                {phase:'phase3_practice', label:'Phase 3 – Mise en pratique', placeholder:'Exercices, activités collaboratives, études de cas, résolution de problèmes...'},
                {phase:'phase4_transfer', label:'Phase 4 – Application et transfert', placeholder:'Comment les élèves utilisent leurs connaissances dans une nouvelle situation...'},
                {phase:'phase5_reflection', label:'Phase 5 – Réflexion', placeholder:'Ce qu\'ils ont appris, comment, difficultés, stratégies, progrès, transfert...'},
              ].map(p => (
                <div key={p.phase}>
                  <label className={labelClass}>{p.label}</label>
                  <textarea value={plan.learningProcess?.[p.phase as keyof typeof plan.learningProcess] || ''} onChange={(e) => handleNestedChange('learningProcess', p.phase, e.target.value)} className={`${textareaClass} h-16`} placeholder={p.placeholder} />
                </div>
              ))}
            </div>
          </CollapsibleSection>

          {/* ── J. EXPÉRIENCES D'APPRENTISSAGE ── */}
          <CollapsibleSection title="J. Expériences d'apprentissage et stratégies d'enseignement" icon={<Globe size={18} className="text-blue-600" />}>
            <div className="flex justify-end mb-3">
              <button onClick={handleGenerateActivities} disabled={isGeneratingActivities} className="flex items-center gap-1 text-xs bg-violet-100 text-violet-700 px-3 py-1.5 rounded-full hover:bg-violet-200 transition">
                {isGeneratingActivities ? <Loader2 className="animate-spin" size={12} /> : <Sparkles size={12} />}
                Suggérer
              </button>
            </div>
            <div className="grid grid-cols-1 gap-4">
              <div>
                <label className={labelClass}>Activités d'apprentissage et stratégies d'enseignement</label>
                <textarea value={plan.learningExperiences} onChange={(e) => handleInputChange('learningExperiences', e.target.value)} className={`${textareaClass} h-32 font-mono`} />
              </div>
              <div>
                <label className={labelClass}>Ce que fait l'enseignant (rôle)</label>
                <textarea value={plan.teachingStrategies || ''} onChange={(e) => handleInputChange('teachingStrategies', e.target.value)} className={`${textareaClass} h-20`} placeholder="Enseignement explicite, questionnement, facilitation, feedback..." />
              </div>
              <div>
                <label className={labelClass}>Ce que font les élèves (activités principales)</label>
                <textarea value={plan.studentActivities || ''} onChange={(e) => handleInputChange('studentActivities', e.target.value)} className={`${textareaClass} h-20`} placeholder="Recherche, collaboration, création, présentation, réflexion..." />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── K. PLANIFICATION DES SÉANCES ── */}
          <CollapsibleSection title="K. Planification détaillée des séances" icon={<Clock size={18} className="text-violet-600" />}>
            <div className="space-y-4">
              {(plan.sessions || []).map((session, idx) => (
                <div key={idx} className="bg-violet-50 p-4 rounded-xl border border-violet-200">
                  <div className="flex justify-between items-center mb-3">
                    <h4 className="text-sm font-bold text-violet-800">Séance {session.numero}</h4>
                    <button onClick={() => removeSession(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-3">
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Date</label>
                      <input type="date" value={session.date || ''} onChange={(e) => updateSession(idx, 'date', e.target.value)} className={`${inputClass} text-xs`} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 block mb-1">Durée</label>
                      <input type="text" value={session.duree} onChange={(e) => updateSession(idx, 'duree', e.target.value)} className={`${inputClass} text-xs`} placeholder="ex: 55 min" />
                    </div>
                    <div className="col-span-2">
                      <label className="text-xs text-slate-500 block mb-1">Objectif d'apprentissage</label>
                      <input type="text" value={session.objectifApprentissage} onChange={(e) => updateSession(idx, 'objectifApprentissage', e.target.value)} className={`${inputClass} text-xs`} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      {field:'contenu', label:'Contenu'},
                      {field:'concepts', label:'Concept(s)'},
                      {field:'questionsRecherche', label:'Question(s) de recherche'},
                      {field:'atl', label:'ATL'},
                      {field:'activite', label:'Activité d\'apprentissage'},
                      {field:'roleEnseignant', label:'Rôle de l\'enseignant'},
                      {field:'roleEleves', label:'Rôle des élèves'},
                      {field:'strategie', label:'Stratégie d\'enseignement'},
                      {field:'ressources', label:'Ressources'},
                      {field:'technologie', label:'Technologie / outils numériques'},
                      {field:'evaluationFormative', label:'Évaluation formative'},
                      {field:'differenciation', label:'Différenciation'},
                      {field:'extensionAvances', label:'Extension élèves avancés'},
                      {field:'soutienDifficultes', label:'Soutien élèves en difficulté'},
                      {field:'preuveApprentissage', label:'Preuve d\'apprentissage'},
                      {field:'reflexion', label:'Réflexion'},
                    ].map(f => (
                      <div key={f.field}>
                        <label className="text-xs text-slate-500 block mb-1">{f.label}</label>
                        <textarea value={(session as any)[f.field]} onChange={(e) => updateSession(idx, f.field as keyof UnitSession, e.target.value)} className="w-full p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-violet-400 outline-none text-xs h-12 resize-none" />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addSession} className="flex items-center gap-2 text-sm text-violet-600 hover:text-violet-700 border border-dashed border-violet-300 rounded-xl px-4 py-3 w-full justify-center font-medium">
                <Plus size={16} /> Ajouter une séance
              </button>
            </div>
          </CollapsibleSection>

          {/* ── L. ÉVALUATION FORMATIVE ── */}
          <CollapsibleSection title="L. Évaluation formative" icon={<CheckCircle size={18} className="text-emerald-600" />}>
            <div>
              <label className={labelClass}>Évaluation formative (résumé)</label>
              <textarea value={plan.formativeAssessment} onChange={(e) => handleInputChange('formativeAssessment', e.target.value)} className={`${textareaClass} h-20 mb-4`} />
            </div>
            <div className="space-y-3">
              <p className="text-xs font-bold text-slate-500 uppercase">Évaluations formatives détaillées</p>
              {(plan.formativeDetails || []).map((fd, idx) => (
                <div key={idx} className="bg-emerald-50 p-4 rounded-xl border border-emerald-200">
                  <div className="flex justify-between mb-3">
                    <span className="text-xs font-bold text-emerald-700">Formative #{idx+1}</span>
                    <button onClick={() => removeFormativeDetail(idx)} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {field:'titre', label:'Titre'},
                      {field:'moment', label:'Moment (séance)'},
                      {field:'objectifEvalue', label:'Objectif évalué'},
                      {field:'activite', label:'Activité'},
                      {field:'criteres', label:'Critères'},
                      {field:'methodeEvaluation', label:'Méthode d\'évaluation'},
                      {field:'feedbackEnseignant', label:'Feedback enseignant'},
                      {field:'autoevaluation', label:'Autoévaluation'},
                      {field:'evaluationPairs', label:'Évaluation par les pairs'},
                      {field:'actionApres', label:'Action après le feedback'},
                    ].map(f => (
                      <div key={f.field} className={f.field === 'titre' || f.field === 'actionApres' ? 'col-span-2' : ''}>
                        <label className="text-xs text-slate-500 block mb-1">{f.label}</label>
                        <input type="text" value={(fd as any)[f.field]} onChange={(e) => updateFormativeDetail(idx, f.field as keyof FormativeAssessmentDetail, e.target.value)} className={`${inputClass} text-xs`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={addFormativeDetail} className="flex items-center gap-2 text-xs text-emerald-600 hover:text-emerald-700 border border-dashed border-emerald-300 rounded-lg px-3 py-2 w-full justify-center">
                <Plus size={14} /> Ajouter une évaluation formative détaillée
              </button>
            </div>
          </CollapsibleSection>

          {/* ── M. ÉVALUATION SOMMATIVE ── */}
          <CollapsibleSection title="M. Évaluation sommative" icon={<FileText size={18} className="text-blue-600" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className={labelClass}>Titre de la tâche</label>
                <input type="text" value={plan.summativeDetails?.titre || ''} onChange={(e) => handleNestedChange('summativeDetails', 'titre', e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>Contexte</label>
                <textarea value={plan.summativeDetails?.contexte || ''} onChange={(e) => handleNestedChange('summativeDetails', 'contexte', e.target.value)} className={`${textareaClass} h-16`} placeholder="Contexte et situation de la tâche..." />
              </div>
              <div>
                <label className={labelClass}>Consigne</label>
                <textarea value={plan.summativeDetails?.consigne || ''} onChange={(e) => handleNestedChange('summativeDetails', 'consigne', e.target.value)} className={`${textareaClass} h-16`} placeholder="Consigne précise donnée aux élèves..." />
              </div>
              <div>
                <label className={labelClass}>Production attendue</label>
                <textarea value={plan.summativeDetails?.productionAttendue || ''} onChange={(e) => handleNestedChange('summativeDetails', 'productionAttendue', e.target.value)} className={`${textareaClass} h-16`} placeholder="Livrable(s) attendu(s)..." />
              </div>
              <div>
                <label className={labelClass}>Durée et modalités</label>
                <textarea value={plan.summativeDetails?.modalites || ''} onChange={(e) => handleNestedChange('summativeDetails', 'modalites', e.target.value)} className={`${textareaClass} h-16`} placeholder="Durée, conditions de réalisation..." />
              </div>
              <div>
                <label className={labelClass}>Ressources autorisées</label>
                <input type="text" value={plan.summativeDetails?.ressourcesAutorisees || ''} onChange={(e) => handleNestedChange('summativeDetails', 'ressourcesAutorisees', e.target.value)} className={inputClass} placeholder="Documents, outils, matériel..." />
              </div>
              <div>
                <label className={labelClass}>Niveau attendu</label>
                <input type="text" value={plan.summativeDetails?.niveauAttendu || ''} onChange={(e) => handleNestedChange('summativeDetails', 'niveauAttendu', e.target.value)} className={inputClass} placeholder="ex: 5-6 sur 8" />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Grille / critères d'évaluation</label>
                <textarea value={plan.summativeDetails?.grilleCriteres || ''} onChange={(e) => handleNestedChange('summativeDetails', 'grilleCriteres', e.target.value)} className={`${textareaClass} h-24`} placeholder="Descripteurs de niveaux, critères détaillés..." />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── N. DIFFÉRENCIATION ── */}
          <CollapsibleSection title="N. Différenciation" icon={<Users size={18} className="text-amber-600" />}>
            <div>
              <label className={labelClass}>Différenciation générale</label>
              <textarea value={plan.differentiation} onChange={(e) => handleInputChange('differentiation', e.target.value)} className={`${textareaClass} h-20 mb-4`} />
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <p className="text-sm font-bold text-blue-700 mb-3">🤝 Soutien aux élèves en difficulté</p>
                <div className="space-y-2">
                  {[
                    {field:'vocabulary', label:'Vocabulaire adapté'},
                    {field:'visualSupports', label:'Supports visuels'},
                    {field:'adaptedInstructions', label:'Consignes adaptées'},
                    {field:'smallGroups', label:'Travail en petits groupes'},
                    {field:'additionalResources', label:'Ressources supplémentaires'},
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-xs text-slate-500">{f.label}</label>
                      <input type="text" value={plan.differentiationDetails?.supportStudents?.[f.field as keyof typeof plan.differentiationDetails.supportStudents] || ''} onChange={(e) => {
                        const current = plan.differentiationDetails?.supportStudents || {};
                        handleNestedChange('differentiationDetails', 'supportStudents', { ...current, [f.field]: e.target.value });
                      }} className={`${inputClass} text-xs mt-0.5`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                <p className="text-sm font-bold text-emerald-700 mb-3">🚀 Enrichissement élèves avancés</p>
                <div className="space-y-2">
                  {[
                    {field:'deepening', label:'Approfondissement'},
                    {field:'autonomousResearch', label:'Recherche autonome'},
                    {field:'complexProblems', label:'Problèmes complexes'},
                    {field:'transfer', label:'Transfert'},
                    {field:'advancedProduction', label:'Production avancée'},
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-xs text-slate-500">{f.label}</label>
                      <input type="text" value={plan.differentiationDetails?.advancedStudents?.[f.field as keyof typeof plan.differentiationDetails.advancedStudents] || ''} onChange={(e) => {
                        const current = plan.differentiationDetails?.advancedStudents || {};
                        handleNestedChange('differentiationDetails', 'advancedStudents', { ...current, [f.field]: e.target.value });
                      }} className={`${inputClass} text-xs mt-0.5`} />
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <label className={labelClass}>Différenciation du contenu</label>
                <textarea value={plan.differentiationDetails?.contentDifferentiation || ''} onChange={(e) => handleNestedChange('differentiationDetails', 'contentDifferentiation', e.target.value)} className={`${textareaClass} h-16`} />
              </div>
              <div>
                <label className={labelClass}>Différenciation du processus</label>
                <textarea value={plan.differentiationDetails?.processDifferentiation || ''} onChange={(e) => handleNestedChange('differentiationDetails', 'processDifferentiation', e.target.value)} className={`${textareaClass} h-16`} />
              </div>
              <div className="md:col-span-2">
                <label className={labelClass}>Différenciation du produit</label>
                <textarea value={plan.differentiationDetails?.productDifferentiation || ''} onChange={(e) => handleNestedChange('differentiationDetails', 'productDifferentiation', e.target.value)} className={`${textareaClass} h-16`} />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── O. RESSOURCES ── */}
          <CollapsibleSection title="O. Ressources" icon={<BookOpen size={18} className="text-slate-600" />}>
            <textarea value={plan.resources} onChange={(e) => handleInputChange('resources', e.target.value)} className={`${textareaClass} h-24`} placeholder="Manuels, sites web, ressources numériques, matériel..." />
          </CollapsibleSection>

          {/* ── P. RÉFLEXION ── */}
          <CollapsibleSection title="P. Réflexion (avant / pendant / après)" icon={<Brain size={18} className="text-pink-600" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                <h4 className="text-sm font-bold text-yellow-700 mb-3">📋 Avant l'enseignement</h4>
                <textarea value={plan.reflection?.prior || ''} onChange={(e) => handleReflectionChange('prior', e.target.value)} className={`${textareaClass} h-24`} placeholder="Connaissances antérieures, besoins, stratégies prévues..." />
                <div className="mt-3 space-y-2">
                  {[
                    {field:'priorKnowledge', label:'Connaissances antérieures'},
                    {field:'anticipatedDifficulties', label:'Difficultés anticipées'},
                    {field:'plannedStrategies', label:'Stratégies prévues'},
                    {field:'expectedOutcomes', label:'Résultats attendus'},
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-xs text-slate-500">{f.label}</label>
                      <input type="text" value={plan.reflectionDetails?.before?.[f.field as keyof typeof plan.reflectionDetails.before] || ''} onChange={(e) => {
                        const current = plan.reflectionDetails?.before || {};
                        handleNestedChange('reflectionDetails', 'before', { ...current, [f.field]: e.target.value });
                      }} className={`${inputClass} text-xs mt-0.5`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <h4 className="text-sm font-bold text-blue-700 mb-3">⚡ Pendant l'enseignement</h4>
                <textarea value={plan.reflection?.during || ''} onChange={(e) => handleReflectionChange('during', e.target.value)} className={`${textareaClass} h-24`} placeholder="Progrès observés, ajustements effectués..." />
                <div className="mt-3 space-y-2">
                  {[
                    {field:'progressObserved', label:'Progrès observés'},
                    {field:'effectiveStrategies', label:'Stratégies efficaces'},
                    {field:'adjustmentsMade', label:'Ajustements effectués'},
                    {field:'emergingNeeds', label:'Besoins apparus'},
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-xs text-slate-500">{f.label}</label>
                      <input type="text" value={plan.reflectionDetails?.during?.[f.field as keyof typeof plan.reflectionDetails.during] || ''} onChange={(e) => {
                        const current = plan.reflectionDetails?.during || {};
                        handleNestedChange('reflectionDetails', 'during', { ...current, [f.field]: e.target.value });
                      }} className={`${inputClass} text-xs mt-0.5`} />
                    </div>
                  ))}
                </div>
              </div>
              <div className="bg-emerald-50 p-4 rounded-lg border border-emerald-200">
                <h4 className="text-sm font-bold text-emerald-700 mb-3">✅ Suite à l'enseignement</h4>
                <textarea value={plan.reflection?.after || ''} onChange={(e) => handleReflectionChange('after', e.target.value)} className={`${textareaClass} h-24`} placeholder="Objectifs atteints, améliorations, points forts..." />
                <div className="mt-3 space-y-2">
                  {[
                    {field:'achievedObjectives', label:'Objectifs atteints'},
                    {field:'successes', label:'Réussites'},
                    {field:'improvements', label:'Points à améliorer'},
                    {field:'modificationsNext', label:'Modifications pour la prochaine fois'},
                  ].map(f => (
                    <div key={f.field}>
                      <label className="text-xs text-slate-500">{f.label}</label>
                      <input type="text" value={plan.reflectionDetails?.after?.[f.field as keyof typeof plan.reflectionDetails.after] || ''} onChange={(e) => {
                        const current = plan.reflectionDetails?.after || {};
                        handleNestedChange('reflectionDetails', 'after', { ...current, [f.field]: e.target.value });
                      }} className={`${inputClass} text-xs mt-0.5`} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CollapsibleSection>

          {/* ── Q. COHÉRENCE ── */}
          <CollapsibleSection title="Q. Cohérence verticale et horizontale" icon={<Layers size={18} className="text-indigo-600" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label className={labelClass}>Avant l'unité (ce qu'ils ont appris)</label>
                <textarea value={plan.verticalCoherence?.before || ''} onChange={(e) => handleNestedChange('verticalCoherence', 'before', e.target.value)} className={`${textareaClass} h-20`} />
              </div>
              <div>
                <label className={labelClass}>Pendant l'unité (ce qu'ils apprennent)</label>
                <textarea value={plan.verticalCoherence?.during || ''} onChange={(e) => handleNestedChange('verticalCoherence', 'during', e.target.value)} className={`${textareaClass} h-20`} />
              </div>
              <div>
                <label className={labelClass}>Après l'unité (ce qui sera développé)</label>
                <textarea value={plan.verticalCoherence?.after || ''} onChange={(e) => handleNestedChange('verticalCoherence', 'after', e.target.value)} className={`${textareaClass} h-20`} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>Liens avec les autres matières (horizontal)</label>
                <textarea value={plan.horizontalCoherence?.otherSubjectLinks || ''} onChange={(e) => handleNestedChange('horizontalCoherence', 'otherSubjectLinks', e.target.value)} className={`${textareaClass} h-16`} placeholder="Matières, concepts et ATL en commun..." />
              </div>
              <div>
                <label className={labelClass}>Compétences transversales communes</label>
                <textarea value={plan.horizontalCoherence?.transversalSkills || ''} onChange={(e) => handleNestedChange('horizontalCoherence', 'transversalSkills', e.target.value)} className={`${textareaClass} h-16`} />
              </div>
            </div>
          </CollapsibleSection>

          {/* ── R. LIENS INTERDISCIPLINAIRES ── */}
          <CollapsibleSection title="R. Liens interdisciplinaires" icon={<Globe size={18} className="text-teal-600" />}>
            <div className="space-y-3">
              {(plan.interdisciplinaryLinks || []).map((link, idx) => (
                <div key={idx} className="bg-teal-50 p-4 rounded-lg border border-teal-200">
                  <div className="flex justify-between mb-2">
                    <span className="text-xs font-bold text-teal-700">Lien #{idx+1}</span>
                    <button onClick={() => handleInputChange('interdisciplinaryLinks', (plan.interdisciplinaryLinks || []).filter((_, i) => i !== idx))} className="text-red-400 hover:text-red-600"><Trash2 size={12} /></button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      {field:'subject', label:'Matière concernée'},
                      {field:'commonConcept', label:'Concept commun'},
                      {field:'commonSkill', label:'Compétence commune'},
                      {field:'commonActivity', label:'Activité commune'},
                      {field:'interdisciplinaryProject', label:'Projet interdisciplinaire'},
                      {field:'eachDisciplineRole', label:'Rôle de chaque discipline'},
                    ].map(f => (
                      <div key={f.field}>
                        <label className="text-xs text-slate-500 block mb-1">{f.label}</label>
                        <input type="text" value={(link as any)[f.field]} onChange={(e) => {
                          const newLinks = [...(plan.interdisciplinaryLinks || [])];
                          newLinks[idx] = { ...newLinks[idx], [f.field]: e.target.value };
                          handleInputChange('interdisciplinaryLinks', newLinks);
                        }} className={`${inputClass} text-xs`} />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              <button onClick={() => {
                handleInputChange('interdisciplinaryLinks', [...(plan.interdisciplinaryLinks || []), {subject:'',commonConcept:'',commonSkill:'',commonContent:'',commonActivity:'',interdisciplinaryProject:'',eachDisciplineRole:''}]);
              }} className="flex items-center gap-2 text-xs text-teal-600 border border-dashed border-teal-300 rounded-lg px-3 py-2 w-full justify-center">
                <Plus size={14} /> Ajouter un lien interdisciplinaire
              </button>
            </div>
          </CollapsibleSection>

        </div>
      )}
    </div>
  );
};

export default UnitPlanForm;
