import React, { useState, useEffect } from 'react';
import { UnitPlan } from '../types';
import { KEY_CONCEPTS, RELATED_CONCEPTS_GENERIC, GLOBAL_CONTEXTS } from '../constants';
import {
  generateSingleUnit,
  generateAssessmentsForUnit,
  sanitizeUnitPlan,
  updateUnitFromConceptsAndObjectives,
} from '../services/geminiService';
import {
  extractCriteriaLetters,
  getStandardIBCriterion,
  normalizeCriterionLetter,
  formatCriterionFullName,
} from '../services/ibCriteriaService';
import {
  X,
  Wand2,
  Save,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  CheckCircle,
  PenLine,
  Sparkles,
  Target,
  BookOpen,
} from 'lucide-react';
import ChaptersLessonsViewer from './ChaptersLessonsViewer';
import ErrorBoundary from './ErrorBoundary';

// ─── IB Criteria by subject (simplified) ─────────────────────────────────────
const IB_CRITERIA_OPTIONS = [
  { letter: 'A', label: 'Critère A – Connaissances et compréhension' },
  { letter: 'B', label: 'Critère B – Développement des compétences / Investigation' },
  { letter: 'C', label: 'Critère C – Communication' },
  { letter: 'D', label: 'Critère D – Réflexion / Application' },
];

interface AddEditUnitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (plan: UnitPlan) => void;
  existingPlan?: UnitPlan | null; // null/undefined = ajout, sinon modification
  subject: string;
  gradeLevel: string;
}

type ModalMode = 'auto' | 'manual';

const emptyPlan = (subject: string, gradeLevel: string): UnitPlan =>
  sanitizeUnitPlan({ id: Date.now().toString() }, subject, gradeLevel);

const AddEditUnitModalContent: React.FC<AddEditUnitModalProps> = ({
  isOpen,
  onClose,
  onSave,
  existingPlan,
  subject,
  gradeLevel,
}) => {
  const isEdit = !!existingPlan;

  const [mode, setMode] = useState<ModalMode>(isEdit ? 'manual' : 'auto');

  // ── Champs communs ────────────────────────────────────────────────────────
  const [title, setTitle] = useState('');
  const [statementOfInquiry, setStatementOfInquiry] = useState('');
  const [chapters, setChapters] = useState('');
  const [selectedCriteria, setSelectedCriteria] = useState<string[]>([]);
  const [duration, setDuration] = useState('10 heures');
  const [teacherName, setTeacherName] = useState('');

  // ── Champs mode manuel ────────────────────────────────────────────────────
  const [keyConcept, setKeyConcept] = useState('');
  const [keyConceptMode, setKeyConceptMode] = useState<'select' | 'type'>('select');
  const [keyConceptInput, setKeyConceptInput] = useState('');

  const [relatedConcepts, setRelatedConcepts] = useState<string[]>([]);
  const [relatedConceptMode, setRelatedConceptMode] = useState<'select' | 'type'>('select');
  const [relatedConceptInput, setRelatedConceptInput] = useState('');

  const [globalContext, setGlobalContext] = useState('');
  const [content, setContent] = useState('');
  const [atlSkills, setAtlSkills] = useState('');
  const [summativeAssessment, setSummativeAssessment] = useState('');
  const [formativeAssessment, setFormativeAssessment] = useState('');
  const [differentiation, setDifferentiation] = useState('');
  const [resources, setResources] = useState('');

  // Objectives details (aspects, expected levels, activities)
  const [objectivesDetails, setObjectivesDetails] = useState<{
    criterion: string;
    aspects: string;
    expectedLevel: string;
    activities: string;
    formativeAssessment: string;
    summativeAssessment?: string;
  }[]>([]);

  // Inquiry questions
  const [factualQs, setFactualQs] = useState<string[]>(['', '']);
  const [conceptualQs, setConceptualQs] = useState<string[]>(['', '']);
  const [debatableQs, setDebatableQs] = useState<string[]>(['', '']);

  // ── États de génération ───────────────────────────────────────────────────
  const [isGenerating, setIsGenerating] = useState(false);
  const [isRegeneratingAssessments, setIsRegeneratingAssessments] = useState(false);
  const [generatedPlan, setGeneratedPlan] = useState<UnitPlan | null>(null);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  // ── Section accordion ─────────────────────────────────────────────────────
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    concepts: true,
    objectives: true,
    inquiry: false,
    pedagogy: false,
    assessment: false,
  });

  const toggleSection = (key: string) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Initialiser depuis existingPlan avec assainissement complet ───────────
  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setSuccessMsg('');
    setGeneratedPlan(null);

    if (existingPlan) {
      const sanitized = sanitizeUnitPlan(existingPlan, subject, gradeLevel);
      setMode('manual');
      setTitle(sanitized.title || '');
      setStatementOfInquiry(sanitized.statementOfInquiry || '');
      setChapters(sanitized.chapters || sanitized.content || '');
      setDuration(sanitized.duration || '10 heures');
      setTeacherName(sanitized.teacherName || '');
      setKeyConcept(sanitized.keyConcept || '');
      setKeyConceptInput(sanitized.keyConcept || '');

      const relArr = Array.isArray(sanitized.relatedConcepts)
        ? sanitized.relatedConcepts
        : typeof sanitized.relatedConcepts === 'string'
          ? (sanitized.relatedConcepts as string).split(/[,;]/).map(s => s.trim()).filter(Boolean)
          : [];
      setRelatedConcepts(relArr);
      setRelatedConceptInput(relArr.join(', '));

      setGlobalContext(sanitized.globalContext || '');
      setContent(sanitized.content || '');

      const atlStr = Array.isArray(sanitized.atlSkills)
        ? sanitized.atlSkills.join('\n')
        : typeof sanitized.atlSkills === 'string'
          ? sanitized.atlSkills
          : '';
      setAtlSkills(atlStr);

      setSummativeAssessment(sanitized.summativeAssessment || '');
      setFormativeAssessment(sanitized.formativeAssessment || '');
      setDifferentiation(sanitized.differentiation || '');
      setResources(sanitized.resources || '');

      // Safe criterion extraction
      const rawCriteria = (sanitized.assessments || [])
        .map(a => a?.criterion)
        .concat(sanitized.objectives || []);
      const criLetters = extractCriteriaLetters(rawCriteria);
      const activeCriteria = criLetters.length > 0 ? criLetters : ['A', 'B'];
      setSelectedCriteria(activeCriteria);

      // Safe question array conversion
      const toQuestionArray = (val: any): string[] => {
        if (Array.isArray(val)) return val.map(String).filter(Boolean);
        if (typeof val === 'string' && val.trim()) {
          return val.split(/\r?\n/).map(s => s.trim().replace(/^[-*•\d.]+\s*/, '')).filter(Boolean);
        }
        return [];
      };

      const fQs = toQuestionArray(sanitized.inquiryQuestions?.factual);
      const cQs = toQuestionArray(sanitized.inquiryQuestions?.conceptual);
      const dQs = toQuestionArray(sanitized.inquiryQuestions?.debatable);
      setFactualQs(fQs.length ? fQs : ['', '']);
      setConceptualQs(cQs.length ? cQs : ['', '']);
      setDebatableQs(dQs.length ? dQs : ['', '']);

      // Safe objectivesDetails initialization
      const existingDetails = Array.isArray(sanitized.objectivesDetails) ? sanitized.objectivesDetails : [];
      const initializedDetails = activeCriteria.map(c => {
        const existing = existingDetails.find(d => normalizeCriterionLetter(d.criterion) === c);
        const std = getStandardIBCriterion(subject, (['A', 'B', 'C', 'D'].includes(c) ? c : 'A') as 'A' | 'B' | 'C' | 'D');
        return {
          criterion: c,
          aspects: (existing?.aspects && String(existing.aspects).trim()) ? String(existing.aspects).trim() : std.aspectsFormatted,
          expectedLevel: (existing?.expectedLevel && String(existing.expectedLevel).trim()) ? String(existing.expectedLevel).trim() : 'Niveau 5-6 attendu /8',
          activities: (existing?.activities && String(existing.activities).trim()) ? String(existing.activities).trim() : std.activities,
          formativeAssessment: (existing?.formativeAssessment && String(existing.formativeAssessment).trim()) ? String(existing.formativeAssessment).trim() : std.formativeAssessment,
          summativeAssessment: (existing?.summativeAssessment && String(existing.summativeAssessment).trim()) ? String(existing.summativeAssessment).trim() : '',
        };
      });
      setObjectivesDetails(initializedDetails);
    } else {
      setMode('auto');
      setTitle('');
      setStatementOfInquiry('');
      setChapters('');
      setDuration('10 heures');
      setTeacherName('');
      setKeyConcept('');
      setKeyConceptInput('');
      setRelatedConcepts([]);
      setRelatedConceptInput('');
      setGlobalContext('');
      setContent('');
      setAtlSkills('');
      setSummativeAssessment('');
      setFormativeAssessment('');
      setDifferentiation('');
      setResources('');
      setSelectedCriteria(['A', 'B']);
      setFactualQs(['', '']);
      setConceptualQs(['', '']);
      setDebatableQs(['', '']);
      setObjectivesDetails([
        {
          criterion: 'A',
          aspects: getStandardIBCriterion(subject, 'A').aspectsFormatted,
          expectedLevel: 'Niveau 5-6 attendu /8',
          activities: getStandardIBCriterion(subject, 'A').activities,
          formativeAssessment: getStandardIBCriterion(subject, 'A').formativeAssessment,
          summativeAssessment: '',
        },
        {
          criterion: 'B',
          aspects: getStandardIBCriterion(subject, 'B').aspectsFormatted,
          expectedLevel: 'Niveau 5-6 attendu /8',
          activities: getStandardIBCriterion(subject, 'B').activities,
          formativeAssessment: getStandardIBCriterion(subject, 'B').formativeAssessment,
          summativeAssessment: '',
        },
      ]);
    }
  }, [isOpen, existingPlan, subject, gradeLevel]);

  if (!isOpen) return null;

  // ── Helpers ───────────────────────────────────────────────────────────────
  const toggleCriterion = (letter: string) => {
    setSelectedCriteria(prev => {
      const next = prev.includes(letter) ? prev.filter(c => c !== letter) : [...prev, letter];
      // Sync objectivesDetails with selected criteria
      setObjectivesDetails(currentDetails => {
        return next.map(c => {
          const existing = currentDetails.find(d => normalizeCriterionLetter(d.criterion) === c);
          if (existing) return existing;
          const std = getStandardIBCriterion(subject, (['A', 'B', 'C', 'D'].includes(c) ? c : 'A') as 'A' | 'B' | 'C' | 'D');
          return {
            criterion: c,
            aspects: std.aspectsFormatted,
            expectedLevel: 'Niveau 5-6 attendu /8',
            activities: std.activities,
            formativeAssessment: std.formativeAssessment,
            summativeAssessment: '',
          };
        });
      });
      return next;
    });
  };

  const updateObjectiveDetail = (criterion: string, field: 'aspects' | 'expectedLevel' | 'activities' | 'formativeAssessment', value: string) => {
    setObjectivesDetails(prev => {
      const idx = prev.findIndex(d => normalizeCriterionLetter(d.criterion) === criterion);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: value };
        return next;
      }
      const std = getStandardIBCriterion(subject, (['A', 'B', 'C', 'D'].includes(criterion) ? criterion : 'A') as 'A' | 'B' | 'C' | 'D');
      return [
        ...prev,
        {
          criterion,
          aspects: std.aspectsFormatted,
          expectedLevel: 'Niveau 5-6 attendu /8',
          activities: std.activities,
          formativeAssessment: std.formativeAssessment,
          [field]: value,
        },
      ];
    });
  };

  const toggleRelatedConcept = (concept: string) => {
    setRelatedConcepts(prev =>
      prev.includes(concept) ? prev.filter(c => c !== concept) : prev.length < 3 ? [...prev, concept] : prev
    );
  };

  const addTypedConcept = () => {
    const val = relatedConceptInput.trim();
    if (!val) return;
    const items = val.split(',').map(s => s.trim()).filter(Boolean);
    setRelatedConcepts(prev => {
      const merged = [...prev];
      for (const item of items) {
        if (!merged.includes(item) && merged.length < 5) merged.push(item);
      }
      return merged;
    });
    setRelatedConceptInput('');
  };

  const updateQuestion = (
    setter: React.Dispatch<React.SetStateAction<string[]>>,
    arr: string[],
    idx: number,
    val: string
  ) => {
    const copy = [...arr];
    copy[idx] = val;
    setter(copy);
  };

  const addQuestion = (setter: React.Dispatch<React.SetStateAction<string[]>>) => {
    setter(prev => [...prev, '']);
  };

  const removeQuestion = (setter: React.Dispatch<React.SetStateAction<string[]>>, idx: number) => {
    setter(prev => prev.filter((_, i) => i !== idx));
  };

  // ── Build plan from manual fields ─────────────────────────────────────────
  const buildManualPlan = (): UnitPlan => {
    const effectiveKeyConcept = keyConceptMode === 'type' ? keyConceptInput.trim() : keyConcept;
    const effectiveRelated =
      relatedConceptMode === 'type'
        ? relatedConceptInput.split(',').map(s => s.trim()).filter(Boolean)
        : relatedConcepts;

    const base = existingPlan
      ? { ...existingPlan }
      : sanitizeUnitPlan({ id: Date.now().toString() }, subject, gradeLevel);

    // Make sure objectivesDetails is strictly populated for all selected criteria
    const finalizedObjectivesDetails = selectedCriteria.map(c => {
      const existing = objectivesDetails.find(d => normalizeCriterionLetter(d.criterion) === c);
      const std = getStandardIBCriterion(subject, (['A', 'B', 'C', 'D'].includes(c) ? c : 'A') as 'A' | 'B' | 'C' | 'D');
      return {
        criterion: c,
        aspects: (existing?.aspects && String(existing.aspects).trim()) ? String(existing.aspects).trim() : std.aspectsFormatted,
        expectedLevel: (existing?.expectedLevel && String(existing.expectedLevel).trim()) ? String(existing.expectedLevel).trim() : 'Niveau 5-6 attendu /8',
        activities: (existing?.activities && String(existing.activities).trim()) ? String(existing.activities).trim() : std.activities,
        formativeAssessment: (existing?.formativeAssessment && String(existing.formativeAssessment).trim()) ? String(existing.formativeAssessment).trim() : std.formativeAssessment,
        summativeAssessment: (existing?.summativeAssessment && String(existing.summativeAssessment).trim()) ? String(existing.summativeAssessment).trim() : '',
      };
    });

    return {
      ...base,
      title: title.trim() || base.title || "Nouvelle Unité",
      statementOfInquiry,
      chapters,
      content: content || chapters,
      duration,
      teacherName,
      keyConcept: effectiveKeyConcept,
      relatedConcepts: effectiveRelated,
      globalContext,
      atlSkills: atlSkills.split('\n').map(s => s.trim()).filter(Boolean),
      objectives: selectedCriteria.map(c => formatCriterionFullName(subject, (['A', 'B', 'C', 'D'].includes(c) ? c : 'A') as 'A' | 'B' | 'C' | 'D')),
      objectivesDetails: finalizedObjectivesDetails,
      summativeAssessment,
      formativeAssessment,
      differentiation,
      resources,
      inquiryQuestions: {
        factual: Array.isArray(factualQs) ? factualQs.filter(Boolean) : [],
        conceptual: Array.isArray(conceptualQs) ? conceptualQs.filter(Boolean) : [],
        debatable: Array.isArray(debatableQs) ? debatableQs.filter(Boolean) : [],
      },
      subject,
      gradeLevel,
    };
  };

  // ── Génération automatique ────────────────────────────────────────────────
  const handleAutoGenerate = async () => {
    if (!title.trim()) { setError("Veuillez saisir le titre de l'unité."); return; }
    if (!statementOfInquiry.trim()) { setError("Veuillez saisir l'énoncé de recherche."); return; }
    if (!chapters.trim()) { setError("Veuillez saisir les chapitres / le contenu."); return; }
    if (selectedCriteria.length < 2) { setError("Veuillez sélectionner au moins 2 critères IB."); return; }

    setError('');
    setSuccessMsg('');
    setIsGenerating(true);
    try {
      const plan = await generateSingleUnit(
        title.trim(),
        statementOfInquiry.trim(),
        chapters.trim(),
        selectedCriteria,
        subject,
        gradeLevel
      );
      plan.teacherName = teacherName || plan.teacherName;
      plan.duration = duration || plan.duration;
      setGeneratedPlan(plan);
      if (plan.objectivesDetails && plan.objectivesDetails.length > 0) {
        setObjectivesDetails(plan.objectivesDetails);
      }
      setSuccessMsg(`✅ Unité "${plan.title}" générée avec ${plan.assessments?.length || 0} évaluation(s).`);
    } catch (e: any) {
      setError(`❌ Erreur: ${e?.message || e}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // ── Régénérer évaluations pour unité manuelle ─────────────────────────────
  const handleRegenerateAssessments = async () => {
    setError('');
    setSuccessMsg('');
    setIsRegeneratingAssessments(true);
    try {
      const planForRegen = buildManualPlan();
      const assessments = await generateAssessmentsForUnit(planForRegen);
      if (generatedPlan) {
        setGeneratedPlan(prev => prev ? { ...prev, assessments } : null);
      } else {
        setGeneratedPlan({ ...planForRegen, assessments });
      }
      setSuccessMsg(`✅ ${assessments.length} évaluation(s) critériée(s) régénérée(s) avec succès.`);
    } catch (e: any) {
      setError(`❌ Erreur: ${e?.message || e}`);
    } finally {
      setIsRegeneratingAssessments(false);
    }
  };

  // ── Mettre à jour l'unité selon concepts et objectifs spécifiques ─────────
  const [isUpdatingFromConcepts, setIsUpdatingFromConcepts] = useState(false);

  const handleUpdateFromConceptsAndObjectives = async () => {
    setError('');
    setSuccessMsg('');
    setIsUpdatingFromConcepts(true);
    try {
      const planToUpdate = mode === 'auto' && generatedPlan ? generatedPlan : buildManualPlan();
      const updated = await updateUnitFromConceptsAndObjectives(planToUpdate);
      setGeneratedPlan(updated);
      if (updated.objectivesDetails && updated.objectivesDetails.length > 0) {
        setObjectivesDetails(updated.objectivesDetails);
      }
      if (mode === 'manual') {
        if (updated.statementOfInquiry) setStatementOfInquiry(updated.statementOfInquiry);
        if (updated.inquiryQuestions) {
          if (updated.inquiryQuestions.factual?.length) setFactualQs(updated.inquiryQuestions.factual);
          if (updated.inquiryQuestions.conceptual?.length) setConceptualQs(updated.inquiryQuestions.conceptual);
          if (updated.inquiryQuestions.debatable?.length) setDebatableQs(updated.inquiryQuestions.debatable);
        }
        if (updated.keyConcept) setKeyConcept(updated.keyConcept);
        if (updated.relatedConcepts) setRelatedConcepts(updated.relatedConcepts);
        if (updated.globalContext) setGlobalContext(updated.globalContext);
        if (updated.summativeAssessment) setSummativeAssessment(updated.summativeAssessment);
      }
      setSuccessMsg(`✅ Unité mise à jour selon les concepts et critères : ${updated.assessments?.length || 0} évaluation(s) critériée(s) générée(s). Vos modifications d'objectifs et aspects ont été préservées pour l'export Word.`);
    } catch (e: any) {
      setError(`❌ Erreur: ${e?.message || e}`);
    } finally {
      setIsUpdatingFromConcepts(false);
    }
  };

  // ── Sauvegarde ────────────────────────────────────────────────────────────
  const handleSave = () => {
    setError('');
    if (mode === 'auto') {
      if (!generatedPlan) {
        setError("Veuillez d'abord générer l'unité.");
        return;
      }
      onSave(generatedPlan);
    } else {
      const manual = buildManualPlan();
      if (generatedPlan?.assessments?.length) {
        manual.assessments = generatedPlan.assessments;
      }
      if (generatedPlan?.objectivesDetails?.length && (!manual.objectivesDetails || manual.objectivesDetails.length === 0)) {
        manual.objectivesDetails = generatedPlan.objectivesDetails;
      }
      if (!manual.title.trim()) { setError("Le titre est obligatoire."); return; }
      onSave(manual);
    }
    onClose();
  };

  // ── Render helpers ────────────────────────────────────────────────────────
  const SectionHeader: React.FC<{ title: string; sectionKey: string; icon?: React.ReactNode }> = ({ title: t, sectionKey, icon }) => (
    <button
      type="button"
      onClick={() => toggleSection(sectionKey)}
      className="w-full flex items-center justify-between py-2 px-3 bg-slate-100 hover:bg-slate-200 rounded-lg transition text-sm font-semibold text-slate-700"
    >
      <span className="flex items-center gap-2">{icon}{t}</span>
      {openSections[sectionKey] ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
    </button>
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[95vh] flex flex-col overflow-hidden">

        {/* ── Header ── */}
        <div className={`flex items-center justify-between p-5 text-white rounded-t-2xl ${isEdit ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-gradient-to-r from-blue-600 to-indigo-600'}`}>
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              {isEdit ? <PenLine size={22} /> : <Plus size={22} />}
              {isEdit ? "Modifier l'unité" : "Ajouter une unité"}
            </h2>
            <p className="text-sm opacity-80 mt-0.5">{subject} — {gradeLevel}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-white/20 transition">
            <X size={22} />
          </button>
        </div>

        {/* ── Mode selector (only for new units) ── */}
        {!isEdit && (
          <div className="px-6 pt-4 pb-2">
            <div className="flex bg-slate-100 rounded-xl p-1 gap-1">
              <button
                onClick={() => { setMode('auto'); setError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${mode === 'auto' ? 'bg-white shadow text-blue-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <Sparkles size={16} />
                Automatique (IA)
              </button>
              <button
                onClick={() => { setMode('manual'); setError(''); }}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold transition flex items-center justify-center gap-2 ${mode === 'manual' ? 'bg-white shadow text-amber-700' : 'text-slate-500 hover:text-slate-700'}`}
              >
                <PenLine size={16} />
                Manuel
              </button>
            </div>
          </div>
        )}

        {/* ── Scrollable body ── */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">

          {/* Error / Success */}
          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm flex items-start gap-2">
              <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}
          {successMsg && (
            <div className="bg-green-50 border border-green-200 text-green-700 rounded-xl p-3 text-sm flex items-start gap-2">
              <CheckCircle size={16} className="mt-0.5 flex-shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* ════ CHAMPS COMMUNS ════ */}
          <div className="space-y-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Titre de l'unité *</label>
              <input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: L'eau et les écosystèmes"
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Énoncé de recherche *</label>
              <textarea
                value={statementOfInquiry}
                onChange={e => setStatementOfInquiry(e.target.value)}
                rows={2}
                placeholder="Ex: La gestion durable des ressources en eau dépend des interactions entre les activités humaines et les équilibres écologiques."
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Chapitres / Contenu du programme *</label>
              <textarea
                value={chapters}
                onChange={e => setChapters(e.target.value)}
                rows={3}
                placeholder={"Chapitre 1 : Le cycle naturel de l'eau\n- Les états de la matière\n- Les précipitations\nChapitre 2 : La pollution et le traitement"}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-400 outline-none resize-none font-mono text-xs"
              />
            </div>

            {/* Visualisation structurée des chapitres et leçons */}
            {chapters.trim() && (
              <div className="border border-slate-200 rounded-xl p-3 bg-slate-50">
                <p className="text-xs font-bold text-slate-600 mb-2 flex items-center gap-1.5">
                  <BookOpen size={14} className="text-blue-600" />
                  Aperçu de la structure des chapitres & leçons
                </p>
                <ChaptersLessonsViewer rawText={chapters} unitTitle={title} compact={true} />
              </div>
            )}

            {/* Critères IB */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                Critères IB évalués dans cette unité * <span className="text-slate-400 font-normal">(min. 2 recommandés)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {IB_CRITERIA_OPTIONS.map(({ letter, label }) => {
                  const isSelected = selectedCriteria.includes(letter);
                  return (
                    <button
                      key={letter}
                      type="button"
                      onClick={() => toggleCriterion(letter)}
                      className={`p-2.5 rounded-xl border text-left text-xs font-medium transition flex items-center gap-2.5 ${
                        isSelected
                          ? 'bg-blue-50 border-blue-500 text-blue-800 ring-1 ring-blue-500'
                          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${isSelected ? 'bg-blue-600 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {letter}
                      </span>
                      <span className="truncate">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Durée & Enseignant */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Durée estimée</label>
                <input
                  value={duration}
                  onChange={e => setDuration(e.target.value)}
                  placeholder="Ex: 12 heures (6 semaines)"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-400 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Enseignant(s)</label>
                <input
                  value={teacherName}
                  onChange={e => setTeacherName(e.target.value)}
                  placeholder="Nom de l'enseignant"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-2 focus:ring-blue-400 outline-none"
                />
              </div>
            </div>
          </div>

          {/* ════ MODE AUTOMATIQUE : BOUTON GÉNÉRER ════ */}
          {mode === 'auto' && (
            <div className="pt-2">
              <button
                type="button"
                onClick={handleAutoGenerate}
                disabled={isGenerating}
                className="w-full py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition shadow-md disabled:opacity-60"
              >
                {isGenerating ? (
                  <><Loader2 className="animate-spin" size={18} />Génération de l'unité par l'IA…</>
                ) : (
                  <><Wand2 size={18} />Générer l'unité complète avec évaluations</>
                )}
              </button>

              {generatedPlan && (
                <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-xl space-y-2 text-xs">
                  <p className="font-bold text-blue-900 text-sm">✅ Aperçu de l'unité générée :</p>
                  <p><span className="font-semibold">Concept clé :</span> {generatedPlan.keyConcept}</p>
                  <p><span className="font-semibold">Concepts connexes :</span> {(generatedPlan.relatedConcepts || []).join(', ')}</p>
                  <p><span className="font-semibold">Contexte mondial :</span> {generatedPlan.globalContext}</p>
                  <p><span className="font-semibold">Évaluations :</span> {generatedPlan.assessments?.length || 0} critère(s) généré(s)</p>
                </div>
              )}
            </div>
          )}

          {/* ════ MODE MANUEL : ACCORDIONS DÉTAILLÉS ════ */}
          {mode === 'manual' && (
            <div className="space-y-3 pt-2">

              {/* Section: Concepts & Contexte */}
              <SectionHeader title="Concepts & Contexte mondial" sectionKey="concepts" icon="💡" />
              {openSections.concepts && (
                <div className="space-y-3 pl-2">
                  {/* Concept clé */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Concept clé</label>
                      <div className="flex text-xs bg-slate-100 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setKeyConceptMode('select')}
                          className={`px-2 py-0.5 rounded transition ${keyConceptMode === 'select' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                          Choisir
                        </button>
                        <button
                          type="button"
                          onClick={() => setKeyConceptMode('type')}
                          className={`px-2 py-0.5 rounded transition ${keyConceptMode === 'type' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                          Saisir
                        </button>
                      </div>
                    </div>
                    {keyConceptMode === 'select' ? (
                      <div className="flex flex-wrap gap-1.5">
                        {KEY_CONCEPTS.map(c => (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setKeyConcept(c)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${keyConcept === c ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-300 hover:border-blue-400'}`}
                          >
                            {c}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input
                        value={keyConceptInput}
                        onChange={e => setKeyConceptInput(e.target.value)}
                        placeholder="Saisir un concept clé..."
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none"
                      />
                    )}
                  </div>

                  {/* Concepts connexes */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Concepts connexes (1 à 3)</label>
                      <div className="flex text-xs bg-slate-100 rounded-lg p-0.5">
                        <button
                          type="button"
                          onClick={() => setRelatedConceptMode('select')}
                          className={`px-2 py-0.5 rounded transition ${relatedConceptMode === 'select' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                          Choisir
                        </button>
                        <button
                          type="button"
                          onClick={() => setRelatedConceptMode('type')}
                          className={`px-2 py-0.5 rounded transition ${relatedConceptMode === 'type' ? 'bg-white shadow text-slate-800' : 'text-slate-500'}`}
                        >
                          Saisir
                        </button>
                      </div>
                    </div>

                    {relatedConceptMode === 'select' ? (
                      <>
                        <div className="flex flex-wrap gap-1.5 mb-2">
                          {RELATED_CONCEPTS_GENERIC.map(c => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => toggleRelatedConcept(c)}
                              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${relatedConcepts.includes(c) ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white text-slate-600 border-slate-300 hover:border-indigo-400'}`}
                            >
                              {c}
                            </button>
                          ))}
                        </div>
                        {relatedConcepts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            <span className="text-xs text-slate-500">Sélectionnés: </span>
                            {relatedConcepts.map(c => (
                              <span key={c} className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                {c}
                                <button type="button" onClick={() => toggleRelatedConcept(c)} className="hover:text-red-500"><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <input
                            value={relatedConceptInput}
                            onChange={e => setRelatedConceptInput(e.target.value)}
                            placeholder="Saisir un ou plusieurs concepts (séparés par virgule)..."
                            className="flex-1 p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-slate-400 outline-none"
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addTypedConcept(); } }}
                          />
                          <button
                            type="button"
                            onClick={addTypedConcept}
                            className="px-3 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 transition"
                          >
                            <Plus size={16} />
                          </button>
                        </div>
                        {relatedConcepts.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {relatedConcepts.map(c => (
                              <span key={c} className="bg-indigo-100 text-indigo-800 text-xs px-2 py-0.5 rounded-full flex items-center gap-1">
                                {c}
                                <button type="button" onClick={() => setRelatedConcepts(prev => prev.filter(x => x !== c))} className="hover:text-red-500"><X size={10} /></button>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Contexte mondial */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">Contexte mondial</label>
                    <div className="flex flex-wrap gap-1.5">
                      {GLOBAL_CONTEXTS.map(ctx => (
                        <button
                          key={ctx}
                          type="button"
                          onClick={() => setGlobalContext(ctx)}
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium border transition ${globalContext === ctx ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white text-slate-600 border-slate-300 hover:border-emerald-400'}`}
                        >
                          {ctx}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Section: Objectifs spécifiques & Aspects par critère */}
              <SectionHeader title="Objectifs spécifiques & Aspects par critère (IB)" sectionKey="objectives" icon="🎯" />
              {openSections.objectives && (
                <div className="space-y-4 pl-2">
                  <p className="text-xs text-slate-500">
                    Modifiez ici les objectifs spécifiques, les aspects travaillés (i, ii, iii...), le niveau attendu et les activités pour chaque critère. Ces modifications seront intégralement conservées lors de la mise à jour et reportées dans le document Word généré.
                  </p>
                  {selectedCriteria.length === 0 ? (
                    <p className="text-xs text-amber-600 italic">Veuillez sélectionner au moins un critère IB ci-dessus.</p>
                  ) : (
                    selectedCriteria.map(criterion => {
                      const std = getStandardIBCriterion(subject, (['A', 'B', 'C', 'D'].includes(criterion) ? criterion : 'A') as 'A' | 'B' | 'C' | 'D');
                      const detail = objectivesDetails.find(d => normalizeCriterionLetter(d.criterion) === criterion) || {
                        criterion,
                        aspects: std.aspectsFormatted,
                        expectedLevel: 'Niveau 5-6 attendu /8',
                        activities: std.activities,
                        formativeAssessment: std.formativeAssessment,
                      };
                      return (
                        <div key={criterion} className="border border-blue-200 bg-blue-50/50 rounded-xl p-3.5 space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-xs text-blue-900 flex items-center gap-1.5">
                              <Target size={14} className="text-blue-600" />
                              Critère {criterion} : {std.name}
                            </span>
                            <span className="text-[10px] bg-blue-100 text-blue-800 font-semibold px-2 py-0.5 rounded">
                              PEI IB
                            </span>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">Aspects travaillés</label>
                              <input
                                type="text"
                                value={detail.aspects}
                                onChange={e => updateObjectiveDetail(criterion, 'aspects', e.target.value)}
                                placeholder="ex: i, ii, iii"
                                className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-400 outline-none bg-white"
                              />
                            </div>
                            <div>
                              <label className="text-[11px] font-bold text-slate-600 block mb-1">Niveau attendu</label>
                              <input
                                type="text"
                                value={detail.expectedLevel}
                                onChange={e => updateObjectiveDetail(criterion, 'expectedLevel', e.target.value)}
                                placeholder="ex: Niveau 5-6 attendu /8"
                                className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-400 outline-none bg-white"
                              />
                            </div>
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">Activités permettant de développer l'objectif</label>
                            <textarea
                              value={detail.activities}
                              onChange={e => updateObjectiveDetail(criterion, 'activities', e.target.value)}
                              rows={2}
                              placeholder="Activités d'apprentissage spécifiques à ce critère..."
                              className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-400 outline-none resize-none bg-white"
                            />
                          </div>

                          <div>
                            <label className="text-[11px] font-bold text-slate-600 block mb-1">Évaluation formative associée</label>
                            <textarea
                              value={detail.formativeAssessment}
                              onChange={e => updateObjectiveDetail(criterion, 'formativeAssessment', e.target.value)}
                              rows={2}
                              placeholder="Tâche ou observation formative associée..."
                              className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-400 outline-none resize-none bg-white"
                            />
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {/* Section: Questions de recherche */}
              <SectionHeader title="Questions de recherche" sectionKey="inquiry" icon="❓" />
              {openSections.inquiry && (
                <div className="space-y-4 pl-2">
                  {([
                    { label: 'Questions factuelles', arr: factualQs, setter: setFactualQs, color: 'blue' },
                    { label: 'Questions conceptuelles', arr: conceptualQs, setter: setConceptualQs, color: 'purple' },
                    { label: 'Questions invitant au débat', arr: debatableQs, setter: setDebatableQs, color: 'amber' },
                  ] as { label: string; arr: string[]; setter: React.Dispatch<React.SetStateAction<string[]>>; color: string }[]).map(({ label, arr, setter }) => (
                    <div key={label}>
                      <label className="text-xs font-bold text-slate-600 mb-1 block">{label}</label>
                      <div className="space-y-1.5">
                        {Array.isArray(arr) && arr.map((q, idx) => (
                          <div key={idx} className="flex gap-2">
                            <input
                              value={q}
                              onChange={e => updateQuestion(setter, arr, idx, e.target.value)}
                              placeholder={`Question ${idx + 1}…`}
                              className="flex-1 p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-300 outline-none"
                            />
                            {arr.length > 1 && (
                              <button type="button" onClick={() => removeQuestion(setter, idx)} className="text-red-400 hover:text-red-600"><Trash2 size={14} /></button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => addQuestion(setter)}
                          className="text-xs text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Plus size={12} /> Ajouter une question
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Section: Pédagogie */}
              <SectionHeader title="Pédagogie & ressources" sectionKey="pedagogy" icon="📚" />
              {openSections.pedagogy && (
                <div className="space-y-3 pl-2">
                  {[
                    { label: 'Contenu détaillé', value: content, setter: setContent, placeholder: 'Contenu spécifique de l\'unité…' },
                    { label: 'Compétences ATL (une par ligne)', value: atlSkills, setter: setAtlSkills, placeholder: "Compétence de communication\nCompétence de recherche…" },
                    { label: 'Évaluation sommative', value: summativeAssessment, setter: setSummativeAssessment, placeholder: 'Description de la tâche finale…' },
                    { label: 'Évaluation formative', value: formativeAssessment, setter: setFormativeAssessment, placeholder: 'Quiz, travaux en classe…' },
                    { label: 'Différenciation', value: differentiation, setter: setDifferentiation, placeholder: 'Stratégies pour les élèves en difficulté et avancés…' },
                    { label: 'Ressources', value: resources, setter: setResources, placeholder: 'Manuels, sites web, vidéos…' },
                  ].map(({ label, value, setter, placeholder }) => (
                    <div key={label}>
                      <label className="block text-xs font-bold text-slate-700 mb-1">{label}</label>
                      <textarea
                        value={value}
                        onChange={e => setter(e.target.value)}
                        rows={2}
                        placeholder={placeholder}
                        className="w-full p-2 border border-slate-300 rounded-lg text-xs focus:ring-1 focus:ring-blue-300 outline-none resize-none"
                      />
                    </div>
                  ))}
                </div>
              )}

              {/* ── Mise à jour selon concepts & objectifs ── */}
              <div className="bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 rounded-xl p-4">
                <p className="text-sm text-indigo-900 font-semibold mb-1 flex items-center gap-2">
                  <Sparkles size={16} className="text-indigo-600" />
                  Mise à jour de l'unité selon les concepts & objectifs modifiés
                </p>
                <p className="text-xs text-indigo-700 mb-3">
                  Réaligne l'énoncé de recherche, les questions de recherche et génère des évaluations critériées IB authentiques en préservant scrupuleusement vos corrections d'aspects et d'objectifs pour l'exportation Word.
                </p>
                <button
                  onClick={handleUpdateFromConceptsAndObjectives}
                  disabled={isUpdatingFromConcepts}
                  className="w-full py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition shadow disabled:opacity-60"
                >
                  {isUpdatingFromConcepts ? (
                    <><Loader2 className="animate-spin" size={18} />Mise à jour en cours…</>
                  ) : (
                    <><Sparkles size={18} className="text-amber-300" />Mettre à jour l'unité (Concepts & Objectifs)</>
                  )}
                </button>
              </div>

              {/* ── Régénérer évaluations (mode manuel) ── */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                <p className="text-sm text-amber-800 font-semibold mb-1 flex items-center gap-2">
                  <RefreshCw size={16} />
                  Régénérer les évaluations critériées
                </p>
                <p className="text-xs text-amber-700 mb-3">
                  Après modification manuelle de l'unité, régénérez les évaluations critériées pour qu'elles soient adaptées au nouveau contenu.
                </p>
                <button
                  onClick={handleRegenerateAssessments}
                  disabled={isRegeneratingAssessments}
                  className="w-full py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-60"
                >
                  {isRegeneratingAssessments ? (
                    <><Loader2 className="animate-spin" size={18} />Régénération en cours…</>
                  ) : (
                    <><RefreshCw size={18} />Régénérer les évaluations critériées</>
                  )}
                </button>
                {generatedPlan?.assessments && generatedPlan.assessments.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {generatedPlan.assessments.map(a => (
                      <span key={a.criterion} className="bg-amber-100 text-amber-800 text-xs font-bold px-3 py-1 rounded-full">
                        Critère {a.criterion}: {a.criterionName}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ── Footer ── */}
        <div className="p-4 border-t border-slate-100 flex items-center justify-between gap-3 bg-slate-50 rounded-b-2xl flex-wrap">
          <div>
            {(isEdit || generatedPlan) && (
              <button
                onClick={handleUpdateFromConceptsAndObjectives}
                disabled={isUpdatingFromConcepts}
                className="px-4 py-2 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white font-semibold text-xs sm:text-sm flex items-center gap-1.5 transition shadow disabled:opacity-50"
                title="Mettre à jour l'unité selon les modifications de concepts et critères d'évaluation"
              >
                {isUpdatingFromConcepts ? (
                  <><Loader2 className="animate-spin" size={15} />Mise à jour…</>
                ) : (
                  <><Sparkles size={15} className="text-amber-300" />Mise à jour (Concepts & Objectifs)</>
                )}
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm transition"
            >
              Annuler
            </button>
            <button
              onClick={handleSave}
              className={`px-5 py-2 rounded-xl text-white font-bold text-sm flex items-center gap-2 transition shadow ${isEdit ? 'bg-amber-600 hover:bg-amber-700' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              <Save size={16} />
              {isEdit ? "Enregistrer les modifications" : "Enregistrer l'unité"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

const AddEditUnitModal: React.FC<AddEditUnitModalProps> = (props) => {
  if (!props.isOpen) return null;
  return (
    <ErrorBoundary
      fallbackTitle="Erreur lors de l'ouverture du formulaire d'unité"
      onReset={props.onClose}
    >
      <AddEditUnitModalContent {...props} />
    </ErrorBoundary>
  );
};

export default AddEditUnitModal;
