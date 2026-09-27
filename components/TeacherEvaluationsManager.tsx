import React, { useState, useEffect } from 'react';
import { Award, CheckCircle, Copy, Eye, FileText, Filter, Loader2, LogOut, Plus, Printer, RefreshCw, Search, Sparkles, Trash2, User, X, ExternalLink, AlertTriangle, ShieldCheck, ChevronRight, Check, Edit3, Download, Image as ImageIcon } from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, UnitPlan, AssessmentData, AssessmentExercise } from '../types';
import { getEvaluations, createOrUpdateEvaluation, deleteEvaluation, getSubmissionsForEvaluation, gradeSubmission, generateAIGradingWithGemini } from '../services/onlineEvaluationService';
import EvaluationPrintView from './EvaluationPrintView';

interface TeacherEvaluationsManagerProps {
  currentSubject?: string;
  currentGrade?: string;
  currentUnitPlan?: UnitPlan | null;
  allUnitPlans?: UnitPlan[];
  currentUser?: any;
  onClose: () => void;
  onOpenStudentPortal?: (accessCode: string) => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; light: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',    badge: 'bg-blue-600',    light: 'bg-blue-100' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', light: 'bg-emerald-100' },
  C: { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',   badge: 'bg-amber-600',   light: 'bg-amber-100' },
  D: { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-800',    badge: 'bg-rose-600',    light: 'bg-rose-100' },
};

const ARTWORK_PRESETS = [
  {
    name: 'La Nuit étoilée (Van Gogh)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ea/Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg/800px-Van_Gogh_-_Starry_Night_-_Google_Art_Project.jpg',
    caption: 'La Nuit étoilée, Vincent van Gogh (1889), Huile sur toile, MoMA New York'
  },
  {
    name: 'La Joconde (Léonard de Vinci)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ec/Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg/800px-Mona_Lisa%2C_by_Leonardo_da_Vinci%2C_from_C2RMF_retouched.jpg',
    caption: 'Mona Lisa (La Joconde), Léonard de Vinci (1503-1506), Musée du Louvre'
  },
  {
    name: 'La Grande Vague de Kanagawa (Hokusai)',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Tsunami_by_hokusai_19th_century.jpg/800px-Tsunami_by_hokusai_19th_century.jpg',
    caption: 'La Grande Vague de Kanagawa, Katsushika Hokusai (vers 1831), Estampe japonaise'
  },
  {
    name: 'Calligraphie Arabe Koufique',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Kufic_script_in_blue_Quran.jpg/800px-Kufic_script_in_blue_Quran.jpg',
    caption: 'Coran Bleu, Calligraphie en écriture koufique dorée sur parchemin teinté à l\'indigo (IXe siècle)'
  },
  {
    name: 'Art Islamique - Géométrie & Mosaïque',
    url: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Alhambra_Mosaics.jpg/800px-Alhambra_Mosaics.jpg',
    caption: 'Motif géométrique et arabesque en zellige, Palais de l\'Alhambra, Grenade'
  },
  {
    name: 'Guernica (Pablo Picasso)',
    url: 'https://upload.wikimedia.org/wikipedia/en/7/74/PicassoGuernica.jpg',
    caption: 'Guernica, Pablo Picasso (1937), Musée Reina Sofía Madrid'
  }
];

const TeacherEvaluationsManager: React.FC<TeacherEvaluationsManagerProps> = ({
  currentSubject,
  currentGrade,
  currentUnitPlan,
  allUnitPlans = [],
  currentUser,
  onClose,
  onOpenStudentPortal,
}) => {
  const [evaluations, setEvaluations] = useState<OnlineEvaluation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // New evaluation modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [selectedPlanForCreate, setSelectedPlanForCreate] = useState<UnitPlan | null>(currentUnitPlan || null);
  const [customTitle, setCustomTitle] = useState('');
  const [customDuration, setCustomDuration] = useState('45');
  const [customInstructions, setCustomInstructions] = useState('Répondez de manière structurée et détaillée à chaque question.');

  // Question editing modal
  const [editingEvaluation, setEditingEvaluation] = useState<OnlineEvaluation | null>(null);
  const [editingCriterionIdx, setEditingCriterionIdx] = useState(0);
  const [isSavingEvalChanges, setIsSavingEvalChanges] = useState(false);

  // Submissions view & correction
  const [selectedEvaluation, setSelectedEvaluation] = useState<OnlineEvaluation | null>(null);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loadingSubmissions, setLoadingSubmissions] = useState(false);
  const [activeSubmission, setActiveSubmission] = useState<StudentSubmission | null>(null);

  // Correction state
  const [editedCriteriaScores, setEditedCriteriaScores] = useState<Record<string, number>>({});
  const [editedOverallFeedback, setEditedOverallFeedback] = useState('');
  const [editedComments, setEditedComments] = useState<Record<string, string>>({}); // key: `${criterion}_${exerciseIndex}`
  const [isAiGrading, setIsAiGrading] = useState(false);
  const [isSavingGrade, setIsSavingGrade] = useState(false);
  const [saveGradeSuccess, setSaveGradeSuccess] = useState(false);

  // Print view
  const [printEvaluation, setPrintEvaluation] = useState<OnlineEvaluation | null>(null);
  const [printSubmission, setPrintSubmission] = useState<StudentSubmission | null>(null);

  // Charger les évaluations
  const loadEvaluationsList = async () => {
    setLoading(true);
    try {
      const list = await getEvaluations({
        subject: currentSubject,
        grade: currentGrade,
      });
      setEvaluations(list);
    } catch (err) {
      console.error('Erreur chargement évaluations:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvaluationsList();
  }, [currentSubject, currentGrade]);

  // Si un unit plan est passé à l'ouverture, pré-remplir la création
  useEffect(() => {
    if (currentUnitPlan) {
      setSelectedPlanForCreate(currentUnitPlan);
      setCustomTitle(`Évaluation critériée — ${currentUnitPlan.title}`);
    }
  }, [currentUnitPlan]);

  // Charger les soumissions pour l'évaluation sélectionnée
  const handleOpenSubmissions = async (evaluation: OnlineEvaluation) => {
    setSelectedEvaluation(evaluation);
    setLoadingSubmissions(true);
    try {
      const subs = await getSubmissionsForEvaluation(evaluation.id);
      setSubmissions(subs);
    } catch (err) {
      console.error('Erreur chargement soumissions:', err);
    } finally {
      setLoadingSubmissions(false);
    }
  };

  // Ouvrir la correction d'une copie
  const handleOpenGrading = (sub: StudentSubmission) => {
    setActiveSubmission(sub);
    setEditedCriteriaScores(sub.criteriaScores || {});
    setEditedOverallFeedback(sub.overallFeedback || '');
    const comments: Record<string, string> = {};
    sub.answers.forEach(a => {
      comments[`${a.criterion}_${a.exerciseIndex}`] = a.teacherComment || a.aiFeedback || '';
    });
    setEditedComments(comments);
    setSaveGradeSuccess(false);
  };

  // Copier le code d'accès
  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Copier le lien direct pour les élèves
  const handleCopyStudentLink = (code: string) => {
    const url = `${window.location.origin}?mode=student&code=${encodeURIComponent(code)}`;
    navigator.clipboard.writeText(url);
    setCopiedCode(`link_${code}`);
    setTimeout(() => setCopiedCode(null), 2500);
  };

  // Supprimer une évaluation
  const handleDeleteEvaluation = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('Êtes-vous sûr de vouloir supprimer cette évaluation en ligne et toutes les copies associées ?')) {
      return;
    }
    await deleteEvaluation(id);
    setEvaluations(prev => prev.filter(item => item.id !== id));
    if (selectedEvaluation?.id === id) {
      setSelectedEvaluation(null);
      setSubmissions([]);
    }
  };

  // Enregistrer les modifications de questions de l'évaluation
  const handleSaveEditedEvaluation = async () => {
    if (!editingEvaluation) return;
    setIsSavingEvalChanges(true);
    try {
      const updated = await createOrUpdateEvaluation(editingEvaluation);
      setEvaluations(prev => prev.map(e => e.id === updated.id ? updated : e));
      if (selectedEvaluation?.id === updated.id) {
        setSelectedEvaluation(updated);
      }
      setEditingEvaluation(null);
      alert('✅ Évaluation et questions mises à jour avec succès !');
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible d\'enregistrer'}`);
    } finally {
      setIsSavingEvalChanges(false);
    }
  };

  // Ajouter une nouvelle question dans le critère sélectionné
  const handleAddQuestionToEditingEval = (critIndex: number) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIndex];
    if (!targetCrit) return;

    const count = (targetCrit.exercises || []).length + 1;
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
    const roman = romanNumerals[(count - 1) % romanNumerals.length];
    const defaultStrandText = targetCrit.strands?.find(s => s.toLowerCase().startsWith(`${roman}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') || `Compétence ${targetCrit.criterion}`;

    const newExercise: AssessmentExercise = {
      title: `Tâche ${count} : Question d'évaluation`,
      content: 'Consigne détaillée de la question...',
      criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
      strandIndex: roman,
      strandText: defaultStrandText,
      type: 'open',
      options: ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
      correctAnswer: 'Proposition A',
    };

    if (!targetCrit.exercises) targetCrit.exercises = [];
    targetCrit.exercises.push(newExercise);
    setEditingEvaluation(newEval);
  };

  // Mettre à jour une question
  const handleUpdateEditingExercise = (
    critIdx: number,
    exIdx: number,
    updates: Partial<AssessmentExercise>
  ) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIdx];
    if (!targetCrit || !targetCrit.exercises[exIdx]) return;

    targetCrit.exercises[exIdx] = {
      ...targetCrit.exercises[exIdx],
      ...updates,
    };
    setEditingEvaluation(newEval);
  };

  // Supprimer une question
  const handleDeleteEditingExercise = (critIdx: number, exIdx: number) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIdx];
    if (!targetCrit) return;

    targetCrit.exercises.splice(exIdx, 1);
    setEditingEvaluation(newEval);
  };

  // Créer une nouvelle évaluation en ligne depuis une unité
  const handleCreateEvaluation = async () => {
    if (!selectedPlanForCreate) {
      alert('Veuillez sélectionner une unité de référence.');
      return;
    }

    if (!selectedPlanForCreate.assessments || selectedPlanForCreate.assessments.length === 0) {
      alert('Cette unité n\'a pas encore d\'évaluations critériées générées. Ouvrez d\'abord l\'unité et cliquez sur "Mise à jour Évals".');
      return;
    }

    const title = customTitle.trim() || `Évaluation : ${selectedPlanForCreate.title}`;
    const code = `EVAL-${Math.floor(1000 + Math.random() * 9000)}`;

    const newEval = await createOrUpdateEvaluation({
      accessCode: code,
      title,
      subject: selectedPlanForCreate.subject || currentSubject || 'Matière',
      grade: selectedPlanForCreate.gradeLevel || currentGrade || 'PEI',
      unitId: selectedPlanForCreate.id,
      unitTitle: selectedPlanForCreate.title,
      teacherName: currentUser?.displayName || selectedPlanForCreate.teacherName || 'Enseignant',
      teacherUsername: currentUser?.username || '',
      statementOfInquiry: selectedPlanForCreate.statementOfInquiry,
      globalContext: selectedPlanForCreate.globalContext,
      keyConcept: selectedPlanForCreate.keyConcept,
      relatedConcepts: selectedPlanForCreate.relatedConcepts,
      assessments: selectedPlanForCreate.assessments,
      durationMinutes: parseInt(customDuration) || 0,
      instructions: customInstructions,
      status: 'active',
    });

    setEvaluations(prev => [newEval, ...prev]);
    setShowCreateModal(false);
    alert(`✅ Évaluation créée avec succès !\n\nCode d'accès pour les élèves : ${newEval.accessCode}\nDonnez ce code à vos élèves pour qu'ils puissent composer.`);
  };

  // ── CORRECTION AUTOMATIQUE PAR IA (GEMINI) ─────────────────────────────────
  const handleAiAutoGrading = async () => {
    if (!selectedEvaluation || !activeSubmission) return;

    setIsAiGrading(true);
    try {
      const aiResult = await generateAIGradingWithGemini(selectedEvaluation, activeSubmission);

      // Appliquer les notes proposées par l'IA
      setEditedCriteriaScores(aiResult.criteriaScores);

      // Appliquer l'appréciation globale et les conseils
      let feedbackText = aiResult.overallFeedback;
      if (aiResult.strengths?.length > 0) {
        feedbackText += `\n\nPoints forts : ${aiResult.strengths.join(' ; ')}`;
      }
      if (aiResult.areasForImprovement?.length > 0) {
        feedbackText += `\n\nAxes d'amélioration : ${aiResult.areasForImprovement.join(' ; ')}`;
      }
      setEditedOverallFeedback(feedbackText);

      // Appliquer les commentaires par question
      const newComments: Record<string, string> = {};
      aiResult.answersGrading.forEach(g => {
        newComments[`${g.criterion}_${g.exerciseIndex}`] = g.comment;
      });
      setEditedComments(newComments);

      alert('✨ Correction automatique par IA terminée !\n\nLes niveaux de réussite (1-8), les commentaires de justification et l\'appréciation générale ont été pré-remplis. Vous pouvez les ajuster manuellement avant d\'enregistrer.');
    } catch (err: any) {
      alert(`Erreur correction IA : ${err.message || 'Impossible de joindre le service d\'IA'}`);
    } finally {
      setIsAiGrading(false);
    }
  };

  // ── ENREGISTRER LA CORRECTION (MANUELLE OU VALIDÉE) ─────────────────────────
  const handleSaveGrading = async () => {
    if (!activeSubmission) return;

    setIsSavingGrade(true);
    try {
      // Mettre à jour les réponses avec commentaires
      const updatedAnswers = activeSubmission.answers.map(ans => {
        const comment = editedComments[`${ans.criterion}_${ans.exerciseIndex}`] || '';
        const critScore = editedCriteriaScores[ans.criterion];
        return {
          ...ans,
          teacherComment: comment,
          score: critScore !== undefined ? critScore : ans.score,
        };
      });

      // Calculer le total
      const total = Object.values(editedCriteriaScores).reduce((sum, v) => sum + (Number(v) || 0), 0);

      const graded = await gradeSubmission(activeSubmission.id, {
        criteriaScores: editedCriteriaScores,
        totalScore: total,
        overallFeedback: editedOverallFeedback,
        answers: updatedAnswers,
        gradedBy: currentUser?.displayName || 'Enseignant',
      });

      setActiveSubmission(graded);
      setSubmissions(prev => prev.map(s => s.id === graded.id ? graded : s));
      setSaveGradeSuccess(true);
      setTimeout(() => setSaveGradeSuccess(false), 3000);
    } catch (err: any) {
      alert(`Erreur enregistrement note : ${err.message || 'Veuillez réessayer'}`);
    } finally {
      setIsSavingGrade(false);
    }
  };

  // Filtrer les évaluations
  const filteredEvaluations = evaluations.filter(e => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return true;
    return (
      e.title.toLowerCase().includes(q) ||
      e.accessCode.toLowerCase().includes(q) ||
      e.subject.toLowerCase().includes(q) ||
      e.grade.toLowerCase().includes(q)
    );
  });

  return (
    <div className="fixed inset-0 z-[80] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden my-auto border border-slate-200">

        {/* ── TOP HEADER ── */}
        <header className="bg-gradient-to-r from-purple-700 via-indigo-700 to-violet-800 text-white p-5 flex items-center justify-between gap-4 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center font-black text-xl shadow-inner">
              💻
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">
                Évaluations Critériées Électroniques
              </h2>
              <p className="text-purple-200 text-xs">
                Gestion des évaluations en ligne · Codes d'accès élèves · Correction assistée par IA & A4 Print
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                setSelectedPlanForCreate(currentUnitPlan || allUnitPlans[0] || null);
                setShowCreateModal(true);
              }}
              className="flex items-center gap-1.5 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 text-xs font-black rounded-xl shadow-lg transition"
            >
              <Plus size={16} /> Lancer une évaluation
            </button>
            <button
              onClick={onClose}
              className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
            >
              <X size={20} />
            </button>
          </div>
        </header>

        {/* ── BODY DE GESTION ── */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">

          {/* Recherche & Filtres */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher par titre, code ou matière…"
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 font-medium"
              />
              <Search size={15} className="absolute left-3 top-2.5 text-slate-400" />
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="font-semibold text-slate-700">{filteredEvaluations.length}</span> évaluation(s) disponible(s)
            </div>
          </div>

          {/* Liste des évaluations publiées */}
          {loading ? (
            <div className="p-12 text-center text-slate-400">
              <Loader2 size={32} className="animate-spin mx-auto mb-2 text-purple-600" />
              <p className="text-sm font-semibold">Chargement des évaluations…</p>
            </div>
          ) : filteredEvaluations.length === 0 ? (
            <div className="p-12 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
              <FileText size={40} className="mx-auto text-slate-300 mb-2" />
              <h4 className="font-bold text-slate-700 text-sm">Aucune évaluation en ligne pour le moment</h4>
              <p className="text-slate-400 text-xs mt-1 max-w-md mx-auto">
                Cliquez sur <strong>"Lancer une évaluation"</strong> pour publier une évaluation critériée et générer un code d'accès que vous pourrez distribuer à vos élèves.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredEvaluations.map(ev => {
                const totalPoints = (ev.assessments || []).reduce((acc, a) => acc + (a.maxPoints || 8), 0);
                const isCopied = copiedCode === ev.accessCode;
                const isLinkCopied = copiedCode === `link_${ev.accessCode}`;

                return (
                  <div
                    key={ev.id}
                    className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs hover:shadow-md transition flex flex-col justify-between space-y-4"
                  >
                    <div>
                      {/* Badge code d'accès */}
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-xs font-black px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 tracking-wider">
                            {ev.accessCode}
                          </span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                            ev.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {ev.status === 'active' ? '● En cours' : 'Fermée'}
                          </span>
                        </div>

                        <button
                          onClick={(e) => handleDeleteEvaluation(ev.id, e)}
                          className="text-slate-400 hover:text-rose-600 p-1 transition"
                          title="Supprimer cette évaluation"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>

                      <h3 className="font-bold text-sm text-slate-900 line-clamp-2">{ev.title}</h3>
                      <p className="text-xs text-slate-500 mt-1">
                        {ev.subject} · {ev.grade} · {ev.assessments?.length || 0} critère(s) ({totalPoints} pts)
                      </p>

                      {/* Critères badges */}
                      <div className="flex gap-1.5 mt-3 flex-wrap">
                        {ev.assessments.map(a => {
                          const col = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                          return (
                            <span
                              key={a.criterion}
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${col.light} ${col.text}`}
                            >
                              Critère {a.criterion} (/{a.maxPoints || 8})
                            </span>
                          );
                        })}
                      </div>
                    </div>

                    <div className="pt-3 border-t border-slate-100 space-y-2">
                      {/* Boutons de copie de code et lien */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <button
                          onClick={() => handleCopyCode(ev.accessCode)}
                          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium transition"
                          title="Copier le code d'accès pour les élèves"
                        >
                          {isCopied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                          <span>{isCopied ? 'Code copié !' : 'Copier Code'}</span>
                        </button>
                        <button
                          onClick={() => handleCopyStudentLink(ev.accessCode)}
                          className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-purple-50 hover:bg-purple-100 text-purple-700 rounded-lg font-medium transition"
                          title="Copier le lien direct de passation"
                        >
                          {isLinkCopied ? <Check size={13} className="text-green-600" /> : <ExternalLink size={13} />}
                          <span>{isLinkCopied ? 'Lien copié !' : 'Lien élève'}</span>
                        </button>
                      </div>

                      {/* Boutons actions principales */}
                      <div className="flex flex-col gap-2 pt-1">
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenSubmissions(ev)}
                            className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-bold shadow transition"
                          >
                            <Eye size={14} /> Copies d'élèves
                          </button>
                          <button
                            onClick={() => {
                              setPrintEvaluation(ev);
                              setPrintSubmission(null);
                            }}
                            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl transition"
                            title="Imprimer le sujet au format A4 (Marges 1 cm, PDF / HTML)"
                          >
                            <Printer size={15} />
                          </button>
                        </div>

                        {/* Personnalisation des questions, types et oeuvres d'art */}
                        <button
                          onClick={() => {
                            setEditingEvaluation(JSON.parse(JSON.stringify(ev)));
                            setEditingCriterionIdx(0);
                          }}
                          className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl text-xs font-bold transition border border-indigo-200"
                          title="Modifier les questions, types (Vrai/Faux, QCM), oeuvres d'art et sous-aspects"
                        >
                          <Edit3 size={13} /> Modifier questions & types (Vrai/Faux, QCM, Art)
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* ═════════════════════════════════════════════════════════════════
              SECTION : COPIES D'ÉLÈVES POUR L'ÉVALUATION SÉLECTIONNÉE
              ═════════════════════════════════════════════════════════════════ */}
          {selectedEvaluation && (
            <div className="mt-8 pt-6 border-t-2 border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-600 bg-purple-50 px-2 py-0.5 rounded">
                    Copies remises en ligne
                  </span>
                  <h3 className="text-base font-black text-slate-800 mt-1">
                    {selectedEvaluation.title} — {submissions.length} copie(s)
                  </h3>
                </div>

                <button
                  onClick={() => setSelectedEvaluation(null)}
                  className="text-xs text-slate-400 hover:text-slate-600 p-1"
                >
                  Masquer les copies
                </button>
              </div>

              {loadingSubmissions ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 size={24} className="animate-spin mx-auto mb-2 text-purple-600" />
                  <p className="text-xs">Chargement des copies remises…</p>
                </div>
              ) : submissions.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-400">
                  <User size={30} className="mx-auto mb-2 text-slate-300" />
                  <p className="font-semibold text-slate-600">Aucun élève n'a encore soumis sa copie.</p>
                  <p className="text-[11px] mt-1">
                    Partagez le code <strong>{selectedEvaluation.accessCode}</strong> à vos élèves pour qu'ils commencent à composer.
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
                  <table className="w-full text-xs text-left">
                    <thead className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3">Élève</th>
                        <th className="px-4 py-3">N° Inscription</th>
                        <th className="px-4 py-3">Date de remise</th>
                        <th className="px-4 py-3">Statut</th>
                        <th className="px-4 py-3">Note globale</th>
                        <th className="px-4 py-3 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {submissions.map(sub => {
                        const isGraded = sub.status === 'graded';
                        const totalMax = (selectedEvaluation.assessments || []).reduce((acc, a) => acc + (a.maxPoints || 8), 0);
                        return (
                          <tr key={sub.id} className="hover:bg-slate-50/80 transition">
                            <td className="px-4 py-3 font-bold text-slate-900">{sub.studentName}</td>
                            <td className="px-4 py-3 font-mono text-slate-600">{sub.studentNumber}</td>
                            <td className="px-4 py-3 text-slate-500">
                              {new Date(sub.submittedAt).toLocaleString('fr-FR', {
                                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
                              })}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                isGraded ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                              }`}>
                                {isGraded ? '✓ Corrigé' : '⏳ En attente'}
                              </span>
                            </td>
                            <td className="px-4 py-3 font-black text-slate-800">
                              {isGraded ? `${sub.totalScore ?? 0} / ${totalMax}` : '—'}
                            </td>
                            <td className="px-4 py-3 text-right space-x-1.5 whitespace-nowrap">
                              <button
                                onClick={() => handleOpenGrading(sub)}
                                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
                              >
                                {isGraded ? 'Modifier correction' : 'Corriger la copie'}
                              </button>
                              <button
                                onClick={() => {
                                  setPrintEvaluation(selectedEvaluation);
                                  setPrintSubmission(sub);
                                }}
                                className="p-1.5 text-slate-600 hover:bg-slate-100 rounded-lg transition"
                                title="Imprimer la copie corrigée (A4, 1 cm)"
                              >
                                <Printer size={15} />
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

        </div>

        {/* ── MODALE CRÉATION D'ÉVALUATION ── */}
        {showCreateModal && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden animate-fadeIn">
              <div className="bg-gradient-to-r from-purple-700 to-indigo-700 p-6 text-white flex justify-between items-start">
                <div>
                  <h3 className="text-lg font-black">Lancer une évaluation électronique</h3>
                  <p className="text-purple-200 text-xs mt-0.5">
                    Génère un code que vos élèves utiliseront pour composer en ligne
                  </p>
                </div>
                <button onClick={() => setShowCreateModal(false)} className="text-white/70 hover:text-white">
                  <X size={20} />
                </button>
              </div>

              <div className="p-6 space-y-4">
                {/* Choix de l'unité source */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Unité de cours de référence *
                  </label>
                  <select
                    value={selectedPlanForCreate?.id || ''}
                    onChange={e => {
                      const found = allUnitPlans.find(p => p.id === e.target.value) || null;
                      setSelectedPlanForCreate(found);
                      if (found) setCustomTitle(`Évaluation : ${found.title}`);
                    }}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-400 outline-none"
                  >
                    {allUnitPlans.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.title} ({p.subject} - {p.gradeLevel})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Titre */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Titre de l'évaluation pour les élèves *
                  </label>
                  <input
                    type="text"
                    value={customTitle}
                    onChange={e => setCustomTitle(e.target.value)}
                    placeholder="Ex: Évaluation sommative — Unité 2"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-400 outline-none"
                  />
                </div>

                {/* Durée */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Durée conseillée (minutes)
                  </label>
                  <input
                    type="number"
                    value={customDuration}
                    onChange={e => setCustomDuration(e.target.value)}
                    placeholder="45"
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-400 outline-none"
                  />
                </div>

                {/* Consignes */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1">
                    Consignes générales
                  </label>
                  <textarea
                    value={customInstructions}
                    onChange={e => setCustomInstructions(e.target.value)}
                    rows={3}
                    className="w-full p-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium focus:ring-2 focus:ring-purple-400 outline-none resize-none"
                  />
                </div>

                {/* Résumé des critères qui seront inclus */}
                {selectedPlanForCreate?.assessments && selectedPlanForCreate.assessments.length > 0 && (
                  <div className="bg-purple-50 p-3 rounded-xl border border-purple-100 text-xs">
                    <span className="font-bold text-purple-900 block mb-1">Critères inclus dans cette évaluation :</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {selectedPlanForCreate.assessments.map(a => (
                        <span key={a.criterion} className="bg-white border border-purple-200 text-purple-800 px-2 py-0.5 rounded font-semibold text-[11px]">
                          Critère {a.criterion} ({a.exercises?.length || 0} ex.)
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-3 pt-2">
                  <button
                    onClick={() => setShowCreateModal(false)}
                    className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateEvaluation}
                    className="flex-1 py-2.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl text-xs shadow transition"
                  >
                    Activer & Générer le code
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════
            MODALE DE CORRECTION D'UNE COPIE ÉLÈVE (AVEC ASSISTANCE IA)
            ═════════════════════════════════════════════════════════════════ */}
        {activeSubmission && selectedEvaluation && (
          <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn">
              
              {/* Header correction */}
              <div className="bg-gradient-to-r from-purple-800 to-indigo-900 p-5 text-white flex items-center justify-between gap-4 flex-shrink-0">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 bg-purple-700/60 px-2 py-0.5 rounded">
                    Correction de la copie
                  </span>
                  <h3 className="text-base font-black mt-0.5">
                    Élève : {activeSubmission.studentName} (N° {activeSubmission.studentNumber})
                  </h3>
                  <p className="text-xs text-purple-200">
                    {selectedEvaluation.title} · Remise le {new Date(activeSubmission.submittedAt).toLocaleString('fr-FR')}
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  {/* Bouton IA Auto-Grading */}
                  <button
                    onClick={handleAiAutoGrading}
                    disabled={isAiGrading}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 font-black text-xs rounded-xl shadow-lg transition disabled:opacity-60"
                    title="Générer une proposition de note et des commentaires détaillés avec Gemini"
                  >
                    {isAiGrading ? (
                      <><Loader2 size={14} className="animate-spin" /> Correction IA en cours…</>
                    ) : (
                      <><Sparkles size={14} /> Correction automatique via AI</>
                    )}
                  </button>
                  <button
                    onClick={() => setActiveSubmission(null)}
                    className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Corps de correction scrollable */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6">

                {/* Grille de saisie des notes par critère */}
                <div className="bg-purple-50/60 border border-purple-200 rounded-2xl p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-xs font-black uppercase text-purple-900 tracking-wide">
                      🎯 Niveaux de réalisation par critère (Échelle discrète 1-8 PEI)
                    </h4>
                    <span className="text-xs font-bold text-purple-700">
                      Total : {Object.values(editedCriteriaScores).reduce((sum, v) => sum + (Number(v) || 0), 0)} / {(selectedEvaluation.assessments || []).reduce((acc, a) => acc + (a.maxPoints || 8), 0)} pts
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {selectedEvaluation.assessments.map(crit => {
                      const colors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
                      const currentScore = editedCriteriaScores[crit.criterion] ?? '';

                      return (
                        <div key={crit.criterion} className="bg-white p-3 rounded-xl border border-purple-100 shadow-xs">
                          <div className="flex items-center gap-1.5 mb-1.5">
                            <span className={`w-5 h-5 rounded ${colors.badge} text-white font-bold text-[10px] flex items-center justify-center`}>
                              {crit.criterion}
                            </span>
                            <span className="text-xs font-bold text-slate-800 truncate">{crit.criterionName}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <select
                              value={currentScore}
                              onChange={e => {
                                const val = parseInt(e.target.value);
                                setEditedCriteriaScores(prev => ({ ...prev, [crit.criterion]: val }));
                              }}
                              className="w-full p-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold focus:ring-2 focus:ring-purple-400 outline-none"
                            >
                              <option value="">Sélectionner (1-8)</option>
                              {[1, 2, 3, 4, 5, 6, 7, 8].map(lvl => (
                                <option key={lvl} value={lvl}>
                                  Niveau {lvl} / 8
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Appréciation globale */}
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                    💬 Appréciation générale de l'enseignant :
                  </label>
                  <textarea
                    value={editedOverallFeedback}
                    onChange={e => setEditedOverallFeedback(e.target.value)}
                    rows={3}
                    placeholder="Commentaire général valorisant les réussites et indiquant les pistes d'amélioration..."
                    className="w-full p-3 bg-slate-50 border border-slate-300 focus:border-purple-600 focus:ring-2 focus:ring-purple-200 rounded-xl text-xs outline-none transition font-sans"
                  />
                </div>

                {/* Réponses de l'élève par question et commentaires spécifiques */}
                <div className="space-y-4">
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                    📝 Réponses de l'élève et commentaires par question
                  </h4>

                  {activeSubmission.answers.map((ans, idx) => {
                    const colors = CRITERION_COLORS[ans.criterion] || CRITERION_COLORS.A;
                    const commentKey = `${ans.criterion}_${ans.exerciseIndex}`;
                    const commentValue = editedComments[commentKey] || '';

                    return (
                      <div key={idx} className="bg-slate-50 border border-slate-200 rounded-2xl p-5 space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                          <div className="flex items-center gap-2">
                            <span className={`w-6 h-6 rounded-md ${colors.badge} text-white text-xs font-black flex items-center justify-center`}>
                              {ans.criterion}
                            </span>
                            <span className="font-bold text-sm text-slate-900">{ans.exerciseTitle}</span>
                            {ans.criterionReference && (
                              <span className="text-xs text-slate-400 italic">({ans.criterionReference})</span>
                            )}
                          </div>
                        </div>

                        {/* Énoncé de la question */}
                        <div className="text-xs text-slate-600 bg-white p-3 rounded-xl border border-slate-200">
                          {ans.questionContent}
                        </div>

                        {/* Réponse de l'élève */}
                        <div>
                          <span className="text-[10px] font-bold text-slate-500 uppercase block mb-1">
                            Réponse soumise par l'élève :
                          </span>
                          <div className="bg-white p-3 rounded-xl border border-slate-200 text-xs font-mono text-slate-800 whitespace-pre-wrap leading-relaxed">
                            {ans.studentResponse || <em className="text-slate-400">Aucune réponse fournie</em>}
                          </div>
                        </div>

                        {/* Commentaire enseignant */}
                        <div>
                          <label className="text-[10px] font-bold text-purple-900 uppercase block mb-1">
                            Remarque / Justification pour cette réponse :
                          </label>
                          <textarea
                            value={commentValue}
                            onChange={e => setEditedComments(prev => ({ ...prev, [commentKey]: e.target.value }))}
                            rows={2}
                            placeholder="Commentaire de correction pour cette question..."
                            className="w-full p-2.5 bg-white border border-slate-300 focus:border-purple-600 rounded-xl text-xs outline-none"
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>

              </div>

              {/* Footer correction */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <div className="text-xs">
                  {saveGradeSuccess && (
                    <span className="flex items-center gap-1.5 text-green-600 font-bold">
                      <CheckCircle size={15} /> Correction enregistrée avec succès !
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setPrintEvaluation(selectedEvaluation);
                      setPrintSubmission(activeSubmission);
                    }}
                    className="flex items-center gap-1.5 px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    <Printer size={15} /> Imprimer Copie Corrigée (A4)
                  </button>
                  <button
                    onClick={handleSaveGrading}
                    disabled={isSavingGrade}
                    className="flex items-center gap-1.5 px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-60"
                  >
                    {isSavingGrade ? 'Enregistrement…' : 'Valider & Enregistrer'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* ── MODALE D'IMPRESSION A4 (AVEC MARGES 1 CM) ── */}
        {printEvaluation && (
          <EvaluationPrintView
            evaluation={printEvaluation}
            submission={printSubmission}
            onClose={() => {
              setPrintEvaluation(null);
              setPrintSubmission(null);
            }}
          />
        )}

        {/* ── MODALE ÉDITION DES QUESTIONS & TYPES D'ÉVALUATION ── */}
        {editingEvaluation && (
          <div className="fixed inset-0 z-[90] bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn my-auto border border-slate-200">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-indigo-800 via-purple-800 to-indigo-900 p-5 text-white flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center font-bold text-lg">
                    ✏️
                  </div>
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-purple-300 bg-purple-700/60 px-2 py-0.5 rounded">
                      Configuration des Questions & Types
                    </span>
                    <h3 className="text-base font-black mt-0.5">
                      {editingEvaluation.title} ({editingEvaluation.accessCode})
                    </h3>
                    <p className="text-xs text-purple-200">
                      Ajoutez des questions, changez le type (Vrai/Faux, QCM, Rédaction), associez des oeuvres d'art et assignez le sous-aspect précis (i, ii, iii...).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingEvaluation(null)}
                    className="p-2 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Paramètres généraux rapides */}
              <div className="bg-slate-50 border-b border-slate-200 p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Titre de l'évaluation :
                  </label>
                  <input
                    type="text"
                    value={editingEvaluation.title}
                    onChange={e => setEditingEvaluation({ ...editingEvaluation, title: e.target.value })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Durée conseillée (minutes) :
                  </label>
                  <input
                    type="number"
                    value={editingEvaluation.durationMinutes || 45}
                    onChange={e => setEditingEvaluation({ ...editingEvaluation, durationMinutes: parseInt(e.target.value) || 45 })}
                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                    Code d'accès élèves :
                  </label>
                  <span className="inline-block py-2 px-3 bg-purple-100 text-purple-900 font-mono font-bold rounded-lg text-xs">
                    {editingEvaluation.accessCode}
                  </span>
                </div>
              </div>

              {/* Navigation par critère */}
              <div className="flex border-b border-slate-200 bg-white px-4 pt-2 overflow-x-auto gap-2">
                {editingEvaluation.assessments.map((crit, idx) => {
                  const colors = CRITERION_COLORS[crit.criterion] || CRITERION_COLORS.A;
                  const isCurrent = editingCriterionIdx === idx;
                  return (
                    <button
                      key={crit.criterion}
                      onClick={() => setEditingCriterionIdx(idx)}
                      className={`flex items-center gap-2 px-4 py-2.5 rounded-t-xl font-bold text-xs border-b-2 transition ${
                        isCurrent
                          ? `border-purple-600 text-purple-900 bg-purple-50/70`
                          : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <span className={`w-5 h-5 rounded ${colors.badge} text-white font-black text-[10px] flex items-center justify-center`}>
                        {crit.criterion}
                      </span>
                      <span>Critère {crit.criterion}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700">
                        {crit.exercises?.length || 0} tâche(s)
                      </span>
                    </button>
                  );
                })}
              </div>

              {/* Contenu du critère actif */}
              {(() => {
                const activeCrit = editingEvaluation.assessments[editingCriterionIdx];
                if (!activeCrit) return null;
                const colors = CRITERION_COLORS[activeCrit.criterion] || CRITERION_COLORS.A;

                return (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Bannière du critère */}
                    <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bg} flex items-center justify-between gap-4`}>
                      <div>
                        <h4 className="font-bold text-sm text-slate-900">
                          Critère {activeCrit.criterion} : {activeCrit.criterionName}
                        </h4>
                        <p className="text-xs text-slate-600 mt-0.5">
                          Échelle : 1-{activeCrit.maxPoints || 8} points · {activeCrit.exercises?.length || 0} question(s) enregistrée(s)
                        </p>
                      </div>

                      <button
                        onClick={() => handleAddQuestionToEditingEval(editingCriterionIdx)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow transition"
                      >
                        <Plus size={15} /> Ajouter une question
                      </button>
                    </div>

                    {/* Liste des questions */}
                    <div className="space-y-5">
                      {(activeCrit.exercises || []).map((ex, exIdx) => {
                        const qType = ex.type || 'open';
                        const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];

                        return (
                          <div
                            key={exIdx}
                            className="bg-white rounded-2xl p-5 border border-slate-300 shadow-xs space-y-4 hover:border-purple-300 transition"
                          >
                            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                              <div className="flex items-center gap-2">
                                <span className={`px-2.5 py-0.5 rounded-lg text-xs font-bold text-white ${colors.badge}`}>
                                  Question {exIdx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={ex.title}
                                  onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { title: e.target.value })}
                                  placeholder="Titre de la tâche..."
                                  className="font-bold text-sm text-slate-800 border-b border-dashed border-slate-300 focus:border-purple-600 focus:outline-none px-1 py-0.5"
                                />
                              </div>

                              <button
                                onClick={() => handleDeleteEditingExercise(editingCriterionIdx, exIdx)}
                                className="text-slate-400 hover:text-rose-600 p-1 transition"
                                title="Supprimer cette question"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* 🔴 CONFIGURATION DU SOUS-ASPECT INDIVIDUEL (EN ROUGE) */}
                            <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 space-y-2">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-black text-red-700 uppercase tracking-wide flex items-center gap-1">
                                  <span>●</span> Sous-aspect individuel (précisé en rouge sous la question) :
                                </label>
                                <span className="text-[10px] text-red-600 italic">
                                  Un seul sous-aspect par question (pas d'aspects groupés)
                                </span>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                <div>
                                  <select
                                    value={ex.strandIndex || romanNumerals[exIdx % romanNumerals.length]}
                                    onChange={e => {
                                      const val = e.target.value;
                                      const matchedDesc = activeCrit.strands?.find(s => s.toLowerCase().startsWith(`${val}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') || '';
                                      handleUpdateEditingExercise(editingCriterionIdx, exIdx, {
                                        strandIndex: val,
                                        strandText: matchedDesc || ex.strandText || '',
                                        criterionReference: `Critère ${activeCrit.criterion} : ${val}.`,
                                      });
                                    }}
                                    className="w-full p-2 bg-white border border-red-300 rounded-lg text-xs font-bold text-red-800 focus:outline-none"
                                  >
                                    {romanNumerals.map(r => (
                                      <option key={r} value={r}>
                                        Sous-aspect ({r})
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="sm:col-span-3">
                                  <input
                                    type="text"
                                    value={ex.strandText || ''}
                                    onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { strandText: e.target.value })}
                                    placeholder="Description de la compétence évaluée (ex: appliquer les concepts mathématiques...)"
                                    className="w-full p-2 bg-white border border-red-300 rounded-lg text-xs font-medium text-red-900 focus:outline-none"
                                  />
                                </div>
                              </div>
                            </div>

                            {/* ⚙️ TYPE DE QUESTION */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                              <div>
                                <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                                  Type de question :
                                </label>
                                <select
                                  value={qType}
                                  onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { type: e.target.value as any })}
                                  className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:outline-none"
                                >
                                  <option value="open">📝 Rédaction libre (avec outils maths/géométrie)</option>
                                  <option value="true_false">⚖️ Vrai ou Faux</option>
                                  <option value="multiple_choice">☑️ Choix multiples (QCM)</option>
                                </select>
                              </div>

                              {/* Options pour Vrai / Faux */}
                              {qType === 'true_false' && (
                                <div className="sm:col-span-2">
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                                    Bonne réponse attendue :
                                  </label>
                                  <div className="flex gap-4 pt-1">
                                    {['Vrai', 'Faux'].map(opt => (
                                      <label key={opt} className="flex items-center gap-1.5 text-xs font-bold text-slate-700 cursor-pointer">
                                        <input
                                          type="radio"
                                          name={`tf_correct_${exIdx}`}
                                          checked={ex.correctAnswer === opt}
                                          onChange={() => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { correctAnswer: opt })}
                                          className="text-purple-600 focus:ring-purple-400"
                                        />
                                        <span>{opt}</span>
                                      </label>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* Options pour QCM */}
                              {qType === 'multiple_choice' && (
                                <div className="sm:col-span-2">
                                  <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                                    Cochez la bonne réponse parmi les propositions ci-dessous :
                                  </label>
                                  <span className="text-[11px] text-purple-700 font-semibold">
                                    Réponse correcte sélectionnée : <strong>{ex.correctAnswer || 'Non définie'}</strong>
                                  </span>
                                </div>
                              )}
                            </div>

                            {/* Édition des propositions du QCM si actif */}
                            {qType === 'multiple_choice' && (
                              <div className="p-3 bg-purple-50/50 border border-purple-200 rounded-xl space-y-2">
                                <label className="text-[10px] font-bold text-purple-900 uppercase block">
                                  Propositions du QCM (cochez le bouton radio de la bonne réponse) :
                                </label>
                                <div className="space-y-1.5">
                                  {(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, optIdx) => (
                                    <div key={optIdx} className="flex items-center gap-2">
                                      <input
                                        type="radio"
                                        name={`qcm_correct_${exIdx}`}
                                        checked={ex.correctAnswer === opt}
                                        onChange={() => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { correctAnswer: opt })}
                                        className="text-purple-600 focus:ring-purple-400"
                                        title="Définir comme bonne réponse"
                                      />
                                      <input
                                        type="text"
                                        value={opt}
                                        onChange={e => {
                                          const nextOptions = [...(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'])];
                                          const oldVal = nextOptions[optIdx];
                                          nextOptions[optIdx] = e.target.value;
                                          const update: Partial<AssessmentExercise> = { options: nextOptions };
                                          if (ex.correctAnswer === oldVal) {
                                            update.correctAnswer = e.target.value;
                                          }
                                          handleUpdateEditingExercise(editingCriterionIdx, exIdx, update);
                                        }}
                                        className="flex-1 p-1.5 bg-white border border-slate-300 rounded-lg text-xs"
                                        placeholder={`Option ${optIdx + 1}`}
                                      />
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Consigne de la question */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                                Consigne / Énoncé de la question :
                              </label>
                              <textarea
                                value={ex.content}
                                onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { content: e.target.value })}
                                rows={3}
                                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-normal focus:outline-none focus:ring-2 focus:ring-purple-400"
                                placeholder="Formulez la question claire pour l'élève..."
                              />
                            </div>

                            {/* 🖼️ OEUVRE D'ART / PHOTO / ILLUSTRATION (POUR LES ARTS, SCIENCES, ETC.) */}
                            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                              <div className="flex items-center justify-between">
                                <label className="text-[11px] font-bold text-slate-700 uppercase flex items-center gap-1.5">
                                  <ImageIcon size={14} className="text-purple-600" />
                                  Oeuvre d'art / Photo / Schéma d'illustration (facultatif) :
                                </label>
                                {ex.imageUrl && (
                                  <button
                                    onClick={() => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { imageUrl: '', imageCaption: '' })}
                                    className="text-[10px] font-bold text-rose-600 hover:text-rose-800"
                                  >
                                    Supprimer l'image
                                  </button>
                                )}
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <div>
                                  <input
                                    type="text"
                                    value={ex.imageUrl || ''}
                                    onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { imageUrl: e.target.value })}
                                    placeholder="Lien URL de l'image ou photo (https://...)"
                                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                                  />
                                </div>
                                <div>
                                  <input
                                    type="text"
                                    value={ex.imageCaption || ''}
                                    onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { imageCaption: e.target.value })}
                                    placeholder="Légende (Titre, Artiste, Date, etc.)"
                                    className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs"
                                  />
                                </div>
                              </div>

                              {/* Boutons d'insertion rapide d'oeuvres d'art célèbres */}
                              <div className="pt-1">
                                <span className="text-[10px] font-bold text-slate-400 uppercase block mb-1">
                                  Exemples d'oeuvres d'art célèbres (1-clic pour insérer) :
                                </span>
                                <div className="flex gap-1.5 flex-wrap">
                                  {ARTWORK_PRESETS.map(art => (
                                    <button
                                      key={art.name}
                                      type="button"
                                      onClick={() => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { imageUrl: art.url, imageCaption: art.caption })}
                                      className="px-2 py-1 bg-white hover:bg-purple-100 border border-slate-200 rounded text-[10px] font-semibold text-slate-700 transition"
                                    >
                                      🎨 {art.name}
                                    </button>
                                  ))}
                                </div>
                              </div>

                              {/* Aperçu de l'image */}
                              {ex.imageUrl && (
                                <div className="p-2 bg-white rounded-lg border border-slate-200 text-center max-w-xs mx-auto">
                                  <img
                                    src={ex.imageUrl}
                                    alt={ex.imageCaption || 'Aperçu'}
                                    className="max-h-36 mx-auto object-contain rounded"
                                    onError={(e) => { e.currentTarget.style.display = 'none'; }}
                                  />
                                  {ex.imageCaption && (
                                    <p className="text-[10px] text-slate-600 italic mt-1">{ex.imageCaption}</p>
                                  )}
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })()}

              {/* Footer de sauvegarde */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
                <span className="text-xs text-slate-500">
                  Les modifications seront immédiatement visibles par les élèves lors de la passation et sur les fiches d'impression A4.
                </span>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setEditingEvaluation(null)}
                    className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-bold rounded-xl transition"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveEditedEvaluation}
                    disabled={isSavingEvalChanges}
                    className="px-6 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition disabled:opacity-60"
                  >
                    {isSavingEvalChanges ? 'Enregistrement…' : 'Enregistrer les modifications'}
                  </button>
                </div>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default TeacherEvaluationsManager;
