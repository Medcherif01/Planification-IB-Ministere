import React, { useState, useEffect } from 'react';
import { Award, CheckCircle, Copy, Eye, FileText, Filter, Loader2, LogOut, Plus, Printer, RefreshCw, Search, Sparkles, Trash2, User, X, ExternalLink, AlertTriangle, AlertCircle, ShieldCheck, ChevronRight, Check, Edit3, Download, Image as ImageIcon, Key, Lock, Unlock, Users } from 'lucide-react';
import { OnlineEvaluation, StudentSubmission, UnitPlan, AssessmentData, AssessmentExercise, AssessmentSubQuestion, IndividualAccessCode } from '../types';
import { getEvaluations, createOrUpdateEvaluation, deleteEvaluation, getSubmissionsForEvaluation, gradeSubmission, generateAIGradingWithGemini } from '../services/onlineEvaluationService';
import EvaluationPrintView from './EvaluationPrintView';
import GenerateCriterialQuestionModal from './GenerateCriterialQuestionModal';

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
  const [selectedCriteriaForCreate, setSelectedCriteriaForCreate] = useState<string[]>([]);
  const [customTitle, setCustomTitle] = useState('');
  const [customDuration, setCustomDuration] = useState('45');
  const [customInstructions, setCustomInstructions] = useState('Répondez de manière structurée et détaillée à chaque question.');

  // Question editing modal
  const [editingEvaluation, setEditingEvaluation] = useState<OnlineEvaluation | null>(null);
  const [editingCriterionIdx, setEditingCriterionIdx] = useState(0);
  const [isSavingEvalChanges, setIsSavingEvalChanges] = useState(false);
  const [showAiGenModal, setShowAiGenModal] = useState(false);

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

  // Gestion des codes d'accès individuels des élèves
  const [studentCodesCountToCreate, setStudentCodesCountToCreate] = useState('25');
  const [managingCodesEval, setManagingCodesEval] = useState<OnlineEvaluation | null>(null);
  const [newCustomCode, setNewCustomCode] = useState('');
  const [newCustomStudentName, setNewCustomStudentName] = useState('');
  const [newCustomStudentNumber, setNewCustomStudentNumber] = useState('');
  const [showPrintCodesModal, setShowPrintCodesModal] = useState(false);
  const [isSavingCodes, setIsSavingCodes] = useState(false);

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
      if (currentUnitPlan.assessments && currentUnitPlan.assessments.length > 0) {
        setSelectedCriteriaForCreate(currentUnitPlan.assessments.map(a => a.criterion));
      }
    }
  }, [currentUnitPlan]);

  // Mettre à jour les critères sélectionnés par défaut dès que l'unité change
  useEffect(() => {
    if (selectedPlanForCreate?.assessments && selectedPlanForCreate.assessments.length > 0) {
      setSelectedCriteriaForCreate(selectedPlanForCreate.assessments.map(a => a.criterion));
    } else {
      setSelectedCriteriaForCreate([]);
    }
  }, [selectedPlanForCreate]);

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

  // Ajouter une nouvelle question selon la manière choisie par l'enseignant
  const handleAddQuestionWithType = (
    critIndex: number,
    questionKind: 'open' | 'multiple_choice' | 'subquestions' | 'true_false' | 'geometry' | 'art'
  ) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIndex];
    if (!targetCrit) return;

    const count = (targetCrit.exercises || []).length + 1;
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
    const roman = romanNumerals[(count - 1) % romanNumerals.length];
    const defaultStrandText = targetCrit.strands?.find(s => s.toLowerCase().startsWith(`${roman}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') || `Compétence ${targetCrit.criterion}`;

    let newExercise: AssessmentExercise;

    if (questionKind === 'multiple_choice') {
      newExercise = {
        title: `Tâche ${count} : Question QCM (Choix multiples)`,
        content: 'Lisez attentivement l\'énoncé et cochez la bonne réponse parmi les propositions ci-dessous :',
        criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrandText,
        type: 'multiple_choice',
        options: ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'],
        correctAnswer: 'Proposition A',
      };
    } else if (questionKind === 'subquestions') {
      const sub1Strand = targetCrit.strands?.find(s => s.toLowerCase().startsWith('i.'))?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Sélectionner et appliquer la méthode';
      const sub2Strand = targetCrit.strands?.find(s => s.toLowerCase().startsWith('ii.'))?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Résoudre le problème avec démarche';
      const sub3Strand = targetCrit.strands?.find(s => s.toLowerCase().startsWith('iii.'))?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Justifier et vérifier la solution';

      newExercise = {
        title: `Tâche ${count} : Problème à sous-questions multiples`,
        content: 'Mise en situation globale / Énoncé principal du problème...',
        criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrandText,
        type: 'open',
        subQuestions: [
          {
            id: 'sub_1',
            label: '1)',
            content: 'Première sous-question : identifier et énoncer...',
            strandIndex: 'i',
            strandText: sub1Strand,
            type: 'open',
          },
          {
            id: 'sub_2',
            label: '2)',
            content: 'Deuxième sous-question : calculer et résoudre avec démarche...',
            strandIndex: 'ii',
            strandText: sub2Strand,
            type: 'open',
          },
          {
            id: 'sub_3',
            label: '3)',
            content: 'Troisième sous-question : vérifier la réponse (QCM de validation)...',
            strandIndex: 'iii',
            strandText: sub3Strand,
            type: 'multiple_choice',
            options: ['Solution A (conforme)', 'Solution B (incorrecte)', 'Solution C (partielle)'],
            correctAnswer: 'Solution A (conforme)',
          },
        ],
      };
    } else if (questionKind === 'geometry') {
      newExercise = {
        title: `Tâche ${count} : Construction Géométrique (Équerre, Compas)`,
        content: 'À l\'aide des outils de géométrie (équerre, compas, rapporteur, règle graduée), réalisez la construction demandée et justifiez votre démarche :',
        criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrandText,
        type: 'open',
        workspaceNeeded: true,
      };
    } else if (questionKind === 'art') {
      newExercise = {
        title: `Tâche ${count} : Analyse Visuelle & Création Artistique`,
        content: 'Observez l\'oeuvre ci-dessous. Analysez les contrastes de couleurs, la composition et les textures, puis réalisez votre proposition plastique dans le studio d\'art :',
        criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrandText,
        type: 'open',
        imageUrl: ARTWORK_PRESETS[0].url,
        imageCaption: ARTWORK_PRESETS[0].caption,
        workspaceNeeded: true,
      };
    } else if (questionKind === 'true_false') {
      newExercise = {
        title: `Tâche ${count} : Affirmation Vrai ou Faux`,
        content: 'Indiquez si l\'affirmation suivante est Vraie ou Fausse et justifiez brièvement :',
        criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrandText,
        type: 'true_false',
        correctAnswer: 'Vrai',
      };
    } else {
      newExercise = {
        title: `Tâche ${count} : Question d'évaluation`,
        content: 'Consigne détaillée de la question...',
        criterionReference: `Critère ${targetCrit.criterion} : ${roman}.`,
        strandIndex: roman,
        strandText: defaultStrandText,
        type: 'open',
      };
    }

    if (!targetCrit.exercises) targetCrit.exercises = [];
    targetCrit.exercises.push(newExercise);
    setEditingEvaluation(newEval);
  };

  // Ajouter une question générée par l'IA selon le type et le sous-aspect
  const handleAddAiGeneratedQuestion = (generatedQuestion: AssessmentExercise) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[editingCriterionIdx];
    if (!targetCrit) return;

    if (!targetCrit.exercises) targetCrit.exercises = [];
    targetCrit.exercises.push(generatedQuestion);
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

  // Ajouter une sous-question à un exercice
  const handleAddSubQuestionToExercise = (critIdx: number, exIdx: number) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIdx];
    if (!targetCrit || !targetCrit.exercises[exIdx]) return;

    const ex = targetCrit.exercises[exIdx];
    if (!ex.subQuestions) ex.subQuestions = [];

    const subCount = ex.subQuestions.length + 1;
    const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];
    const roman = romanNumerals[(subCount - 1) % romanNumerals.length];
    const defaultStrand = targetCrit.strands?.find(s => s.toLowerCase().startsWith(`${roman}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') || `Aspect (${roman})`;

    ex.subQuestions.push({
      id: `sub_${Date.now()}_${subCount}`,
      label: `${subCount})`,
      content: `Consigne de la sous-question ${subCount}...`,
      strandIndex: roman,
      strandText: defaultStrand,
      type: 'open',
    });

    setEditingEvaluation(newEval);
  };

  // Mettre à jour une sous-question
  const handleUpdateSubQuestion = (
    critIdx: number,
    exIdx: number,
    subIdx: number,
    updates: Partial<AssessmentSubQuestion>
  ) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIdx];
    if (!targetCrit || !targetCrit.exercises[exIdx] || !targetCrit.exercises[exIdx].subQuestions) return;

    targetCrit.exercises[exIdx].subQuestions![subIdx] = {
      ...targetCrit.exercises[exIdx].subQuestions![subIdx],
      ...updates,
    };
    setEditingEvaluation(newEval);
  };

  // Supprimer une sous-question
  const handleDeleteSubQuestion = (critIdx: number, exIdx: number, subIdx: number) => {
    if (!editingEvaluation) return;
    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    const targetCrit = newEval.assessments[critIdx];
    if (!targetCrit || !targetCrit.exercises[exIdx] || !targetCrit.exercises[exIdx].subQuestions) return;

    targetCrit.exercises[exIdx].subQuestions!.splice(subIdx, 1);
    // Si plus de sous-questions, on peut remettre à undefined
    if (targetCrit.exercises[exIdx].subQuestions!.length === 0) {
      delete targetCrit.exercises[exIdx].subQuestions;
    }
    setEditingEvaluation(newEval);
  };

  // Retirer un critère complet de l'évaluation
  const handleRemoveCriterionFromEvaluation = (critIdx: number) => {
    if (!editingEvaluation) return;
    if (editingEvaluation.assessments.length <= 1) {
      alert('Une évaluation doit comporter au moins un critère.');
      return;
    }
    const targetCrit = editingEvaluation.assessments[critIdx];
    if (!confirm(`Voulez-vous retirer le Critère ${targetCrit.criterion} (${targetCrit.criterionName}) de cette évaluation ?`)) {
      return;
    }

    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;
    newEval.assessments.splice(critIdx, 1);
    setEditingEvaluation(newEval);
    setEditingCriterionIdx(0);
  };

  // Ajouter un critère à l'évaluation (depuis l'unité source ou standard IB)
  const handleAddCriterionToEvaluation = (criterionLetter: string) => {
    if (!editingEvaluation) return;
    const parentUnit = allUnitPlans.find(p => p.id === editingEvaluation.unitId);
    const existingInParent = parentUnit?.assessments?.find(a => a.criterion === criterionLetter);

    const newEval = JSON.parse(JSON.stringify(editingEvaluation)) as OnlineEvaluation;

    if (existingInParent) {
      newEval.assessments.push(JSON.parse(JSON.stringify(existingInParent)));
    } else {
      const criterionNames: Record<string, string> = {
        A: 'Connaissances et compréhension',
        B: 'Recherche de régularités / Conception',
        C: 'Communication',
        D: 'Application dans des contextes réels',
      };
      newEval.assessments.push({
        criterion: criterionLetter,
        criterionName: criterionNames[criterionLetter] || `Critère ${criterionLetter}`,
        maxPoints: 8,
        strands: [
          'i. Sélectionner les concepts et techniques appropriés',
          'ii. Appliquer les méthodes pour résoudre des problèmes',
          'iii. Justifier et expliquer la démarche de résolution',
        ],
        rubricRows: [
          { level: '1-2', descriptor: 'L\'élève démontre des connaissances très élémentaires.' },
          { level: '3-4', descriptor: 'L\'élève démontre une compréhension satisfaisante des concepts.' },
          { level: '5-6', descriptor: 'L\'élève démontre une bonne compréhension et applique les méthodes avec assurance.' },
          { level: '7-8', descriptor: 'L\'élève démontre une excellente maîtrise et justifie de manière rigoureuse.' },
        ],
        exercises: [
          {
            title: `Tâche 1 : Évaluation ${criterionLetter}`,
            content: 'Consigne de la tâche à réaliser...',
            criterionReference: `Critère ${criterionLetter} : i.`,
            strandIndex: 'i',
            strandText: 'Sélectionner les concepts et techniques appropriés',
            type: 'open',
          }
        ],
      });
    }

    setEditingEvaluation(newEval);
    setEditingCriterionIdx(newEval.assessments.length - 1);
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

    // Filtrer les critères selon le choix de l'enseignant (Exigence: un seul ou plusieurs critères selon l'unité)
    const chosenAssessments = selectedPlanForCreate.assessments.filter(a =>
      selectedCriteriaForCreate.includes(a.criterion)
    );

    if (chosenAssessments.length === 0) {
      alert('Veuillez sélectionner au moins un critère (ex: Critère A seul, ou A et B) pour composer cette évaluation.');
      return;
    }

    const title = customTitle.trim() || `Évaluation : ${selectedPlanForCreate.title}`;
    const code = `EVAL-${Math.floor(1000 + Math.random() * 9000)}`;

    // 🔑 Génération automatique des codes d'accès individuels à usage unique pour chaque élève
    const count = Math.max(1, parseInt(studentCodesCountToCreate) || 25);
    const initialStudentCodes: IndividualAccessCode[] = [];
    for (let i = 1; i <= count; i++) {
      initialStudentCodes.push({
        code: `${code}-${String(i).padStart(2, '0')}`,
        studentName: '',
        studentNumber: '',
        isUsed: false,
        allowedRetake: false,
        createdAt: new Date().toISOString(),
      });
    }

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
      assessments: chosenAssessments,
      durationMinutes: parseInt(customDuration) || 0,
      instructions: customInstructions,
      status: 'active',
      studentAccessCodes: initialStudentCodes,
    });

    setEvaluations(prev => [newEval, ...prev]);
    setShowCreateModal(false);
    alert(`✅ Évaluation créée avec succès !\n\nCritère(s) retenu(s) : ${chosenAssessments.map(a => `Critère ${a.criterion}`).join(', ')}\n${initialStudentCodes.length} codes d'accès individuels à usage unique ont été générés pour vos élèves (ex: ${code}-01, ${code}-02...). Cliquez sur "Codes d'accès élèves" pour les gérer ou les imprimer.`);
  };

  // ── GESTION DES CODES D'ACCÈS INDIVIDUELS ÉLÈVES ─────────────────────────────
  // Réouvrir l'accès pour un deuxième essai (ou reverrouiller)
  const handleToggleCodeRetake = async (targetCode: string) => {
    if (!managingCodesEval) return;
    setIsSavingCodes(true);
    try {
      const currentCodes = managingCodesEval.studentAccessCodes || [];
      const updatedCodes = currentCodes.map(c => {
        if (c.code === targetCode) {
          const nextAllowed = !c.allowedRetake;
          return {
            ...c,
            allowedRetake: nextAllowed,
          };
        }
        return c;
      });

      const updatedEval: OnlineEvaluation = {
        ...managingCodesEval,
        studentAccessCodes: updatedCodes,
      };

      const saved = await createOrUpdateEvaluation(updatedEval);
      setManagingCodesEval(saved);
      setEvaluations(prev => prev.map(e => e.id === saved.id ? saved : e));
      if (selectedEvaluation?.id === saved.id) setSelectedEvaluation(saved);
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible de modifier le statut du code'}`);
    } finally {
      setIsSavingCodes(false);
    }
  };

  // Réinitialiser complètement un code (efface l'utilisation pour le remettre à neuf)
  const handleResetCodeUsage = async (targetCode: string) => {
    if (!managingCodesEval) return;
    if (!window.confirm(`Voulez-vous réinitialiser le code ${targetCode} ?\n\nIl redeviendra utilisable par n'importe quel élève et son statut redeviendra disponible.`)) return;

    setIsSavingCodes(true);
    try {
      const currentCodes = managingCodesEval.studentAccessCodes || [];
      const updatedCodes = currentCodes.map(c => {
        if (c.code === targetCode) {
          return {
            ...c,
            isUsed: false,
            usedAt: undefined,
            studentName: '',
            studentNumber: '',
            allowedRetake: false,
          };
        }
        return c;
      });

      const updatedEval: OnlineEvaluation = {
        ...managingCodesEval,
        studentAccessCodes: updatedCodes,
      };

      const saved = await createOrUpdateEvaluation(updatedEval);
      setManagingCodesEval(saved);
      setEvaluations(prev => prev.map(e => e.id === saved.id ? saved : e));
      if (selectedEvaluation?.id === saved.id) setSelectedEvaluation(saved);
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible de réinitialiser le code'}`);
    } finally {
      setIsSavingCodes(false);
    }
  };

  // Supprimer un code
  const handleDeleteCode = async (targetCode: string) => {
    if (!managingCodesEval) return;
    if (!window.confirm(`Supprimer définitivement le code d'accès ${targetCode} ?`)) return;

    setIsSavingCodes(true);
    try {
      const currentCodes = managingCodesEval.studentAccessCodes || [];
      const updatedCodes = currentCodes.filter(c => c.code !== targetCode);

      const updatedEval: OnlineEvaluation = {
        ...managingCodesEval,
        studentAccessCodes: updatedCodes,
      };

      const saved = await createOrUpdateEvaluation(updatedEval);
      setManagingCodesEval(saved);
      setEvaluations(prev => prev.map(e => e.id === saved.id ? saved : e));
      if (selectedEvaluation?.id === saved.id) setSelectedEvaluation(saved);
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible de supprimer le code'}`);
    } finally {
      setIsSavingCodes(false);
    }
  };

  // Ajouter un code personnalisé ou assigné
  const handleAddCustomCode = async () => {
    if (!managingCodesEval) return;
    const cleanCode = (newCustomCode.trim() || `${managingCodesEval.accessCode}-${Math.floor(100 + Math.random() * 900)}`).toUpperCase();
    const currentCodes = managingCodesEval.studentAccessCodes || [];

    if (currentCodes.some(c => c.code.toUpperCase() === cleanCode)) {
      alert('Ce code d\'accès existe déjà dans cette évaluation.');
      return;
    }

    setIsSavingCodes(true);
    try {
      const newCodeObj: IndividualAccessCode = {
        code: cleanCode,
        studentName: newCustomStudentName.trim(),
        studentNumber: newCustomStudentNumber.trim(),
        isUsed: false,
        allowedRetake: false,
        createdAt: new Date().toISOString(),
      };

      const updatedCodes = [...currentCodes, newCodeObj];
      const updatedEval: OnlineEvaluation = {
        ...managingCodesEval,
        studentAccessCodes: updatedCodes,
      };

      const saved = await createOrUpdateEvaluation(updatedEval);
      setManagingCodesEval(saved);
      setEvaluations(prev => prev.map(e => e.id === saved.id ? saved : e));
      if (selectedEvaluation?.id === saved.id) setSelectedEvaluation(saved);

      setNewCustomCode('');
      setNewCustomStudentName('');
      setNewCustomStudentNumber('');
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible d\'ajouter le code'}`);
    } finally {
      setIsSavingCodes(false);
    }
  };

  // Générer un lot de N codes supplémentaires
  const handleGenerateBatchCodes = async (qty: number) => {
    if (!managingCodesEval) return;
    setIsSavingCodes(true);
    try {
      const currentCodes = managingCodesEval.studentAccessCodes || [];
      const existingNumbers = currentCodes
        .map(c => {
          const m = c.code.match(/-([0-9]+)$/);
          return m ? parseInt(m[1]) : 0;
        })
        .filter(n => n > 0);
      let nextNum = existingNumbers.length > 0 ? Math.max(...existingNumbers) + 1 : currentCodes.length + 1;

      const newCodes: IndividualAccessCode[] = [];
      for (let i = 0; i < qty; i++) {
        newCodes.push({
          code: `${managingCodesEval.accessCode}-${String(nextNum + i).padStart(2, '0')}`,
          studentName: '',
          studentNumber: '',
          isUsed: false,
          allowedRetake: false,
          createdAt: new Date().toISOString(),
        });
      }

      const updatedCodes = [...currentCodes, ...newCodes];
      const updatedEval: OnlineEvaluation = {
        ...managingCodesEval,
        studentAccessCodes: updatedCodes,
      };

      const saved = await createOrUpdateEvaluation(updatedEval);
      setManagingCodesEval(saved);
      setEvaluations(prev => prev.map(e => e.id === saved.id ? saved : e));
      if (selectedEvaluation?.id === saved.id) setSelectedEvaluation(saved);
    } catch (err: any) {
      alert(`Erreur : ${err.message || 'Impossible de générer les codes'}`);
    } finally {
      setIsSavingCodes(false);
    }
  };

  // Copier tous les codes avec statut
  const handleCopyAllCodes = () => {
    if (!managingCodesEval) return;
    const codes = managingCodesEval.studentAccessCodes || [];
    if (codes.length === 0) {
      alert('Aucun code individuel à copier.');
      return;
    }
    const lines = codes.map((c, i) => {
      const statusText = c.isUsed ? (c.allowedRetake ? 'Accès réouvert (2e essai)' : 'Utilisé / Verrouillé') : 'Disponible';
      const studentText = c.studentName ? `Élève: ${c.studentName} (${c.studentNumber || '—'})` : 'Non assigné';
      return `${i + 1}. Code: ${c.code} | Statut: ${statusText} | ${studentText} | Lien direct: ${window.location.origin}?mode=student&code=${encodeURIComponent(c.code)}`;
    });
    navigator.clipboard.writeText(lines.join('\n'));
    setCopiedCode('all_codes');
    setTimeout(() => setCopiedCode(null), 3000);
    alert(`📋 ${codes.length} codes d'accès copiés dans le presse-papiers avec statuts et liens !`);
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
                        {/* 🔑 GESTION DES CODES D'ACCÈS INDIVIDUELS ÉLÈVES (Usage unique & 2e essai) */}
                        {(() => {
                          const codes = ev.studentAccessCodes || [];
                          const totalCodes = codes.length;
                          const usedCodes = codes.filter(c => c.isUsed).length;
                          const retakeCodes = codes.filter(c => c.isUsed && c.allowedRetake).length;

                          return (
                            <button
                              onClick={() => setManagingCodesEval(ev)}
                              className="w-full flex items-center justify-between px-3 py-2 bg-gradient-to-r from-purple-50 to-indigo-50 hover:from-purple-100 hover:to-indigo-100 text-purple-900 rounded-xl text-xs font-bold transition border border-purple-200 shadow-2xs"
                              title="Gérer les codes individuels uniques des élèves, autoriser un 2e essai ou en générer d'autres"
                            >
                              <div className="flex items-center gap-1.5 min-w-0">
                                <Key size={14} className="text-purple-600 flex-shrink-0" />
                                <span className="truncate">Codes d'accès élèves</span>
                              </div>
                              <div className="flex items-center gap-1 flex-shrink-0">
                                {retakeCodes > 0 && (
                                  <span className="text-[10px] px-1.5 py-0.2 bg-amber-100 text-amber-800 rounded font-black border border-amber-300">
                                    {retakeCodes} réouvert(s)
                                  </span>
                                )}
                                <span className={`text-[10px] px-2 py-0.5 rounded-lg font-black ${
                                  usedCodes > 0 ? 'bg-purple-600 text-white' : 'bg-white text-purple-700 border border-purple-200'
                                }`}>
                                  {usedCodes} / {totalCodes} utilisé(s)
                                </span>
                              </div>
                            </button>
                          );
                        })()}

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

                {/* Choix des critères à inclure (Exigence: un seul ou plusieurs critères selon l'unité) */}
                {selectedPlanForCreate?.assessments && selectedPlanForCreate.assessments.length > 0 ? (
                  <div className="space-y-2 pt-1">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <label className="block text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Critères à évaluer dans cette épreuve <span className="text-rose-500">*</span>
                      </label>
                      <div className="flex items-center gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            if (selectedPlanForCreate?.assessments) {
                              setSelectedCriteriaForCreate(selectedPlanForCreate.assessments.map(a => a.criterion));
                            }
                          }}
                          className="text-[11px] text-purple-700 hover:text-purple-900 font-bold"
                        >
                          Tous
                        </button>
                        <span className="text-slate-300">·</span>
                        {selectedPlanForCreate.assessments.map(a => (
                          <button
                            key={a.criterion}
                            type="button"
                            onClick={() => setSelectedCriteriaForCreate([a.criterion])}
                            className="text-[11px] text-slate-600 hover:text-purple-700 font-semibold"
                            title={`Évaluer uniquement le Critère ${a.criterion}`}
                          >
                            Seul {a.criterion}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-[11px] text-slate-500">
                      Cochez le ou les critères souhaités pour cette évaluation (ex: <strong>Critère A seul</strong>, ou <strong>A et B</strong>, etc.) :
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      {selectedPlanForCreate.assessments.map(a => {
                        const colors = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                        const isSelected = selectedCriteriaForCreate.includes(a.criterion);

                        return (
                          <div
                            key={a.criterion}
                            onClick={() => {
                              setSelectedCriteriaForCreate(prev =>
                                prev.includes(a.criterion)
                                  ? prev.filter(c => c !== a.criterion)
                                  : [...prev, a.criterion]
                              );
                            }}
                            className={`p-3 rounded-2xl border-2 cursor-pointer transition flex items-center justify-between gap-3 ${
                              isSelected
                                ? `border-purple-600 bg-purple-50/70 shadow-xs`
                                : 'border-slate-200 bg-white hover:border-slate-300 opacity-60'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <div
                                className={`w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 transition ${
                                  isSelected ? 'border-purple-600 bg-purple-600 text-white' : 'border-slate-300 bg-white'
                                }`}
                              >
                                {isSelected && <Check size={13} strokeWidth={3} />}
                              </div>
                              <span
                                className={`w-6 h-6 rounded-lg ${colors.badge} text-white font-black text-xs flex items-center justify-center flex-shrink-0`}
                              >
                                {a.criterion}
                              </span>
                              <div className="min-w-0">
                                <h5 className="font-bold text-xs text-slate-900 truncate">
                                  Critère {a.criterion}
                                </h5>
                                <p className="text-[10px] text-slate-500 truncate">{a.criterionName}</p>
                              </div>
                            </div>

                            <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-lg border border-slate-200 flex-shrink-0">
                              {a.exercises?.length || 0} tâche(s)
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    {selectedCriteriaForCreate.length === 0 && (
                      <p className="text-[11px] text-rose-600 font-bold bg-rose-50 p-2 rounded-xl border border-rose-200 flex items-center gap-1.5">
                        <AlertCircle size={14} /> Veuillez cocher au moins un critère pour composer cette évaluation.
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900">
                    Cette unité n'a pas encore de critères générés. Vous pourrez ajouter les questions manuellement ensuite.
                  </div>
                )}

                {/* 🔑 Configuration des codes d'accès individuels à usage unique */}
                <div className="bg-purple-50/70 border border-purple-200 rounded-2xl p-3.5 space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-bold text-purple-950 uppercase tracking-wide flex items-center gap-1.5">
                      <Key size={14} className="text-purple-700" />
                      Codes d'accès individuels (Usage unique)
                    </label>
                    <span className="text-[10px] font-bold text-purple-700 bg-white px-2 py-0.5 rounded-lg border border-purple-200">
                      Sécurité & 2e essai contrôlé
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-600 leading-relaxed">
                    Chaque élève recevra un code unique (ex: <code>EVAL-XXXX-01</code>). Dès qu'un élève soumet, son code est <strong>verrouillé</strong> pour un 2ème essai, sauf si vous lui réouvrez l'accès.
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="flex-1">
                      <label className="text-[10px] text-slate-500 font-bold block uppercase mb-1">
                        Nombre de codes à générer :
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={studentCodesCountToCreate}
                        onChange={e => setStudentCodesCountToCreate(e.target.value)}
                        className="w-full p-2 bg-white border border-purple-200 rounded-xl text-xs font-bold text-slate-800 outline-none focus:ring-2 focus:ring-purple-400"
                      />
                    </div>
                    <div className="flex gap-1.5 pt-4">
                      {['15', '25', '30', '35'].map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setStudentCodesCountToCreate(n)}
                          className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition ${
                            studentCodesCountToCreate === n
                              ? 'bg-purple-600 text-white border-purple-600'
                              : 'bg-white text-slate-600 border-slate-200 hover:bg-purple-50'
                          }`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

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

              {/* Navigation par critère avec possibilité d'ajouter ou retirer des critères */}
              <div className="flex border-b border-slate-200 bg-white px-4 pt-2 overflow-x-auto gap-2 items-center">
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

                {/* Bouton pour ajouter un critère manquant (ex: si l'enseignant a choisi A seul et veut maintenant ajouter B) */}
                {(() => {
                  const currentLetters = editingEvaluation.assessments.map(a => a.criterion);
                  const candidateLetters = ['A', 'B', 'C', 'D'].filter(l => !currentLetters.includes(l));
                  if (candidateLetters.length === 0) return null;

                  return (
                    <div className="flex items-center gap-1.5 ml-2">
                      {candidateLetters.map(letter => (
                        <button
                          key={letter}
                          type="button"
                          onClick={() => handleAddCriterionToEvaluation(letter)}
                          className="flex items-center gap-1 px-2.5 py-1 bg-purple-50 hover:bg-purple-100 text-purple-700 border border-dashed border-purple-300 rounded-lg text-xs font-bold transition shadow-2xs"
                          title={`Ajouter le Critère ${letter} à cette évaluation`}
                        >
                          <Plus size={12} />
                          <span>+ Critère {letter}</span>
                        </button>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Contenu du critère actif */}
              {(() => {
                const activeCrit = editingEvaluation.assessments[editingCriterionIdx];
                if (!activeCrit) return null;
                const colors = CRITERION_COLORS[activeCrit.criterion] || CRITERION_COLORS.A;

                return (
                  <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {/* Bannière du critère & Menu d'ajout multi-manières */}
                    <div className={`p-4 rounded-2xl border ${colors.border} ${colors.bg} space-y-3`}>
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <div>
                          <h4 className="font-bold text-sm text-slate-900">
                            Critère {activeCrit.criterion} : {activeCrit.criterionName}
                          </h4>
                          <p className="text-xs text-slate-600 mt-0.5">
                            Échelle : 1-{activeCrit.maxPoints || 8} points · {activeCrit.exercises?.length || 0} tâche(s) enregistrée(s)
                          </p>
                        </div>

                        {/* Bouton pour retirer ce critère si plus d'un critère présent */}
                        {editingEvaluation.assessments.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveCriterionFromEvaluation(editingCriterionIdx)}
                            className="flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-rose-50 text-rose-600 border border-rose-200 rounded-xl text-xs font-bold transition shadow-2xs"
                            title="Retirer ce critère de l'évaluation"
                          >
                            <Trash2 size={13} />
                            <span>Retirer le Critère {activeCrit.criterion}</span>
                          </button>
                        )}
                      </div>

                      {/* Barres d'ajout rapide par type de question (Exigence du brief) */}
                      <div className="pt-2 border-t border-slate-200/60">
                        <span className="text-[10px] font-black uppercase text-purple-900 tracking-wider block mb-2">
                          ➕ Ajouter une question (choisissez la modalité) :
                        </span>
                        <div className="flex gap-2 flex-wrap items-center">
                          {/* BOUTON IA EN VEDETTE : Génération selon la nature & sous-aspect */}
                          <button
                            type="button"
                            onClick={() => setShowAiGenModal(true)}
                            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-gradient-to-r from-purple-600 via-indigo-600 to-purple-700 hover:from-purple-700 hover:to-indigo-800 text-white rounded-xl font-bold text-xs shadow-md transition transform active:scale-95"
                            title="Générer une question ciblée avec l'IA en choisissant la nature (QCM, Vrai/Faux, etc.) et le sous-aspect"
                          >
                            <Sparkles size={14} className="text-yellow-300 animate-pulse" />
                            <span>Générer avec l'IA</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddQuestionWithType(editingCriterionIdx, 'multiple_choice')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
                            title="Ajouter une question QCM avec propositions à cocher"
                          >
                            <span>☑️</span> <span>Question QCM</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddQuestionWithType(editingCriterionIdx, 'subquestions')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
                            title="Ajouter un problème divisé en sous-questions 1), 2), 3)... avec un sous-aspect sous chaque sous-question"
                          >
                            <span>🔢</span> <span>Sous-questions 1), 2), 3)...</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddQuestionWithType(editingCriterionIdx, 'geometry')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
                            title="Ajouter une question avec outils de géométrie (Équerre, Compas, Rapporteur)"
                          >
                            <span>📐</span> <span>Géométrie & Construction</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddQuestionWithType(editingCriterionIdx, 'art')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shadow-xs transition"
                            title="Ajouter une question d'art avec oeuvre célèbre et studio de dessin"
                          >
                            <span>🎨</span> <span>Arts & Dessin</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddQuestionWithType(editingCriterionIdx, 'open')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition"
                            title="Ajouter une tâche de rédaction libre"
                          >
                            <span>📝</span> <span>Rédaction libre</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => handleAddQuestionWithType(editingCriterionIdx, 'true_false')}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 rounded-xl font-bold text-xs transition"
                            title="Ajouter une question Vrai ou Faux"
                          >
                            <span>⚖️</span> <span>Vrai / Faux</span>
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Liste des questions */}
                    <div className="space-y-6">
                      {(activeCrit.exercises || []).map((ex, exIdx) => {
                        const hasSubQuestions = Boolean(ex.subQuestions && ex.subQuestions.length > 0);
                        const qType = hasSubQuestions ? 'subquestions' : (ex.type || 'open');
                        const romanNumerals = ['i', 'ii', 'iii', 'iv', 'v'];

                        return (
                          <div
                            key={exIdx}
                            className="bg-white rounded-3xl p-5 sm:p-6 border-2 border-slate-300 shadow-sm space-y-5 hover:border-purple-300 transition"
                          >
                            {/* Titre & suppression de la tâche */}
                            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                              <div className="flex items-center gap-3 flex-1 mr-3">
                                <span className={`px-2.5 py-1 rounded-xl text-xs font-black text-white ${colors.badge}`}>
                                  Tâche {exIdx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={ex.title}
                                  onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { title: e.target.value })}
                                  placeholder="Titre de la tâche..."
                                  className="font-bold text-sm text-slate-800 border-b border-dashed border-slate-300 focus:border-purple-600 focus:outline-none px-2 py-0.5 w-full"
                                />
                              </div>

                              <button
                                onClick={() => handleDeleteEditingExercise(editingCriterionIdx, exIdx)}
                                className="text-slate-400 hover:text-rose-600 p-1.5 rounded-lg hover:bg-rose-50 transition"
                                title="Supprimer cette tâche"
                              >
                                <Trash2 size={16} />
                              </button>
                            </div>

                            {/* ⚙️ SÉLECTEUR DE TYPE DE QUESTION (AVEC OPTION SOUS-QUESTIONS 1, 2, 3...) */}
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-2xl border border-slate-200">
                              <div>
                                <label className="block text-[10px] font-black text-slate-600 uppercase mb-1">
                                  Format de la question :
                                </label>
                                <select
                                  value={qType}
                                  onChange={e => {
                                    const val = e.target.value;
                                    if (val === 'subquestions') {
                                      // Initialiser avec 2 sous-questions si vide
                                      if (!ex.subQuestions || ex.subQuestions.length === 0) {
                                        const sub1Desc = activeCrit.strands?.find(s => s.toLowerCase().startsWith('i.'))?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Sous-aspect (i)';
                                        const sub2Desc = activeCrit.strands?.find(s => s.toLowerCase().startsWith('ii.'))?.replace(/^[ivx]+[\.\)]\s*/i, '') || 'Sous-aspect (ii)';
                                        handleUpdateEditingExercise(editingCriterionIdx, exIdx, {
                                          subQuestions: [
                                            { id: 'sub_1', label: '1)', content: 'Sous-question 1 : énoncer...', strandIndex: 'i', strandText: sub1Desc, type: 'open' },
                                            { id: 'sub_2', label: '2)', content: 'Sous-question 2 : résoudre ou justifier...', strandIndex: 'ii', strandText: sub2Desc, type: 'open' },
                                          ],
                                        });
                                      }
                                    } else {
                                      // Supprimer sous-questions explicites et définir type standard
                                      const updates: Partial<AssessmentExercise> = { type: val as any };
                                      delete (updates as any).subQuestions;
                                      if (val === 'multiple_choice' && (!ex.options || ex.options.length === 0)) {
                                        updates.options = ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D'];
                                        updates.correctAnswer = 'Proposition A';
                                      }
                                      handleUpdateEditingExercise(editingCriterionIdx, exIdx, updates);
                                    }
                                  }}
                                  className="w-full p-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-purple-400"
                                >
                                  <option value="open">📝 Rédaction libre (avec outils maths/géométrie)</option>
                                  <option value="multiple_choice">☑️ Choix multiples (QCM à cocher)</option>
                                  <option value="subquestions">🔢 Question à sous-questions multiples 1), 2), 3)...</option>
                                  <option value="true_false">⚖️ Vrai ou Faux</option>
                                </select>
                              </div>

                              <div className="sm:col-span-2 flex items-center justify-between text-xs text-slate-500">
                                {qType === 'multiple_choice' && (
                                  <span className="text-purple-700 font-semibold bg-purple-50 px-2.5 py-1 rounded-lg border border-purple-200">
                                    💡 L'élève aura des cases/boutons radio pour cocher la bonne réponse.
                                  </span>
                                )}
                                {qType === 'subquestions' && (
                                  <span className="text-indigo-700 font-semibold bg-indigo-50 px-2.5 py-1 rounded-lg border border-indigo-200">
                                    💡 Chaque sous-question disposera de son sous-aspect (i, ii...) en rouge et de son espace de réponse.
                                  </span>
                                )}
                                {qType === 'open' && (
                                  <span className="text-slate-600 bg-white px-2.5 py-1 rounded-lg border border-slate-200">
                                    💡 Outils Maths (Équerre, Compas, Rapporteur) ou Art mis à disposition de l'élève.
                                  </span>
                                )}
                              </div>
                            </div>

                            {/* Consigne / Énoncé global */}
                            <div>
                              <label className="block text-[10px] font-bold text-slate-600 uppercase mb-1">
                                {hasSubQuestions ? 'Contexte / Énoncé principal du problème :' : 'Consigne / Énoncé de la tâche :'}
                              </label>
                              <textarea
                                value={ex.content}
                                onChange={e => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { content: e.target.value })}
                                rows={hasSubQuestions ? 2 : 3}
                                className="w-full p-3 bg-white border border-slate-300 rounded-xl text-xs font-normal focus:outline-none focus:ring-2 focus:ring-purple-400"
                                placeholder={hasSubQuestions ? 'Présentez la situation ou les données du problème...' : 'Formulez la question claire pour l\'élève...'}
                              />
                            </div>

                            {/* ═══════════════════════════════════════════════════════════
                                CAS A : GESTION DES SOUS-QUESTIONS 1), 2), 3)...
                                Avec configuration du sous-aspect sous chaque sous-question
                                ═══════════════════════════════════════════════════════════ */}
                            {hasSubQuestions && (
                              <div className="bg-indigo-50/40 border-2 border-indigo-200 rounded-2xl p-4 space-y-4">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm">🔢</span>
                                    <h5 className="font-black text-xs text-indigo-950 uppercase tracking-wide">
                                      Sous-questions de cette tâche ({ex.subQuestions?.length || 0}) :
                                    </h5>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => handleAddSubQuestionToExercise(editingCriterionIdx, exIdx)}
                                    className="flex items-center gap-1 px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold text-xs shadow-xs transition"
                                  >
                                    <Plus size={14} /> Ajouter une sous-question (ex: {(ex.subQuestions?.length || 0) + 1})
                                  </button>
                                </div>

                                <div className="space-y-4">
                                  {(ex.subQuestions || []).map((sub, subIdx) => {
                                    const subRoman = sub.strandIndex || romanNumerals[subIdx % romanNumerals.length];

                                    return (
                                      <div
                                        key={sub.id || subIdx}
                                        className="bg-white rounded-xl p-4 border border-indigo-200 shadow-2xs space-y-3"
                                      >
                                        <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2">
                                          <div className="flex items-center gap-2">
                                            <input
                                              type="text"
                                              value={sub.label}
                                              onChange={e => handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, { label: e.target.value })}
                                              className="w-12 text-center p-1 bg-purple-50 border border-purple-200 rounded font-black text-xs text-purple-900"
                                              placeholder="1)"
                                            />
                                            <span className="font-bold text-xs text-slate-700">Sous-question {subIdx + 1}</span>
                                          </div>

                                          <div className="flex items-center gap-2">
                                            {/* Type de la sous-question */}
                                            <select
                                              value={sub.type || 'open'}
                                              onChange={e => {
                                                const val = e.target.value as any;
                                                const subUpdates: Partial<AssessmentSubQuestion> = { type: val };
                                                if (val === 'multiple_choice' && (!sub.options || sub.options.length === 0)) {
                                                  subUpdates.options = ['Proposition A', 'Proposition B', 'Proposition C'];
                                                  subUpdates.correctAnswer = 'Proposition A';
                                                }
                                                handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, subUpdates);
                                              }}
                                              className="p-1 bg-slate-50 border border-slate-200 rounded text-[11px] font-semibold text-slate-700"
                                            >
                                              <option value="open">📝 Rédaction</option>
                                              <option value="multiple_choice">☑️ QCM</option>
                                              <option value="true_false">⚖️ Vrai/Faux</option>
                                            </select>

                                            <button
                                              type="button"
                                              onClick={() => handleDeleteSubQuestion(editingCriterionIdx, exIdx, subIdx)}
                                              className="text-slate-400 hover:text-rose-600 p-1"
                                              title="Supprimer cette sous-question"
                                            >
                                              <Trash2 size={14} />
                                            </button>
                                          </div>
                                        </div>

                                        {/* 🔴 SÉLECTION DU SOUS-ASPECT CONVENABLE POUR CETTE SOUS-QUESTION */}
                                        <div className="bg-red-50/80 border border-red-200 rounded-xl p-2.5 space-y-1.5">
                                          <label className="text-[10px] font-black text-red-700 uppercase flex items-center gap-1">
                                            <span>●</span> Sous-aspect évalué pour cette sous-question (affiché en rouge) :
                                          </label>
                                          <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                            <div>
                                              <select
                                                value={subRoman}
                                                onChange={e => {
                                                  const val = e.target.value;
                                                  const matchedDesc = activeCrit.strands?.find(s => s.toLowerCase().startsWith(`${val}.`))?.replace(/^[ivx]+[\.\)]\s*/i, '') || '';
                                                  handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, {
                                                    strandIndex: val,
                                                    strandText: matchedDesc || sub.strandText || '',
                                                  });
                                                }}
                                                className="w-full p-1.5 bg-white border border-red-300 rounded text-xs font-bold text-red-800"
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
                                                value={sub.strandText || ''}
                                                onChange={e => handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, { strandText: e.target.value })}
                                                placeholder="Description de la compétence (ex: calculer la surface, appliquer la formule...)"
                                                className="w-full p-1.5 bg-white border border-red-300 rounded text-xs font-medium text-red-900"
                                              />
                                            </div>
                                          </div>
                                        </div>

                                        {/* Énoncé de la sous-question */}
                                        <div>
                                          <input
                                            type="text"
                                            value={sub.content}
                                            onChange={e => handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, { content: e.target.value })}
                                            placeholder={`Consigne de la sous-question ${sub.label}...`}
                                            className="w-full p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:border-indigo-400 outline-none"
                                          />
                                        </div>

                                        {/* Si la sous-question est un QCM */}
                                        {sub.type === 'multiple_choice' && (
                                          <div className="p-3 bg-purple-50/60 border border-purple-200 rounded-xl space-y-2">
                                            <div className="flex items-center justify-between">
                                              <label className="text-[10px] font-bold text-purple-900 uppercase">
                                                Options du QCM (cochez le bouton radio de la bonne réponse) :
                                              </label>
                                              <button
                                                type="button"
                                                onClick={() => {
                                                  const curr = sub.options || ['Option A', 'Option B'];
                                                  const nextOpt = `Option ${String.fromCharCode(65 + curr.length)}`;
                                                  handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, {
                                                    options: [...curr, nextOpt],
                                                  });
                                                }}
                                                className="text-[10px] font-bold text-purple-700 hover:text-purple-900"
                                              >
                                                + Ajouter une option
                                              </button>
                                            </div>

                                            <div className="space-y-1.5">
                                              {(sub.options || ['Proposition A', 'Proposition B', 'Proposition C']).map((opt, oIdx) => (
                                                <div key={oIdx} className="flex items-center gap-2">
                                                  <input
                                                    type="radio"
                                                    name={`sub_qcm_${exIdx}_${subIdx}`}
                                                    checked={sub.correctAnswer === opt}
                                                    onChange={() => handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, { correctAnswer: opt })}
                                                    className="text-purple-600"
                                                    title="Marquer comme bonne réponse"
                                                  />
                                                  <input
                                                    type="text"
                                                    value={opt}
                                                    onChange={e => {
                                                      const next = [...(sub.options || ['Proposition A', 'Proposition B', 'Proposition C'])];
                                                      const old = next[oIdx];
                                                      next[oIdx] = e.target.value;
                                                      const upd: Partial<AssessmentSubQuestion> = { options: next };
                                                      if (sub.correctAnswer === old) upd.correctAnswer = e.target.value;
                                                      handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, upd);
                                                    }}
                                                    className="flex-1 p-1 bg-white border border-slate-300 rounded text-xs"
                                                  />
                                                  {(sub.options || []).length > 2 && (
                                                    <button
                                                      type="button"
                                                      onClick={() => {
                                                        const next = (sub.options || []).filter((_, idx) => idx !== oIdx);
                                                        handleUpdateSubQuestion(editingCriterionIdx, exIdx, subIdx, { options: next });
                                                      }}
                                                      className="text-slate-400 hover:text-rose-600 p-0.5"
                                                    >
                                                      ✕
                                                    </button>
                                                  )}
                                                </div>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* ═══════════════════════════════════════════════════════════
                                CAS B : SOUS-ASPECT UNIQUE (SI PAS DE SOUS-QUESTIONS)
                                ═══════════════════════════════════════════════════════════ */}
                            {!hasSubQuestions && (
                              <div className="bg-red-50/70 border border-red-200 rounded-xl p-3 space-y-2">
                                <div className="flex items-center justify-between">
                                  <label className="text-[11px] font-black text-red-700 uppercase tracking-wide flex items-center gap-1">
                                    <span>●</span> Sous-aspect individuel (précisé en rouge sous la question) :
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => handleAddSubQuestionToExercise(editingCriterionIdx, exIdx)}
                                    className="text-[11px] text-indigo-700 hover:text-indigo-900 font-bold underline"
                                  >
                                    ➕ Diviser en sous-questions 1), 2), 3)...
                                  </button>
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
                            )}

                            {/* ═══════════════════════════════════════════════════════════
                                CAS C : ÉDITION DES PROPOSITIONS DU QCM (POUR QUESTION SIMPLE)
                                ═══════════════════════════════════════════════════════════ */}
                            {!hasSubQuestions && qType === 'multiple_choice' && (
                              <div className="p-4 bg-purple-50/70 border-2 border-purple-200 rounded-2xl space-y-3">
                                <div className="flex items-center justify-between">
                                  <div>
                                    <label className="text-[11px] font-black text-purple-900 uppercase block">
                                      Propositions du QCM (Choix multiples) :
                                    </label>
                                    <span className="text-[11px] text-purple-700">
                                      Cochez le bouton radio de la réponse correcte : <strong>{ex.correctAnswer || 'Non définie'}</strong>
                                    </span>
                                  </div>

                                  <button
                                    type="button"
                                    onClick={() => {
                                      const curr = ex.options || ['Proposition A', 'Proposition B'];
                                      const nextLabel = `Proposition ${String.fromCharCode(65 + curr.length)}`;
                                      handleUpdateEditingExercise(editingCriterionIdx, exIdx, {
                                        options: [...curr, nextLabel],
                                      });
                                    }}
                                    className="px-3 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-bold text-xs shadow-xs"
                                  >
                                    + Ajouter une proposition
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {(ex.options || ['Proposition A', 'Proposition B', 'Proposition C', 'Proposition D']).map((opt, optIdx) => (
                                    <div key={optIdx} className="flex items-center gap-2 bg-white p-2 rounded-xl border border-purple-200">
                                      <input
                                        type="radio"
                                        name={`qcm_correct_${exIdx}`}
                                        checked={ex.correctAnswer === opt}
                                        onChange={() => handleUpdateEditingExercise(editingCriterionIdx, exIdx, { correctAnswer: opt })}
                                        className="text-purple-600 focus:ring-purple-400 w-4 h-4 ml-1"
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
                                        className="flex-1 p-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                        placeholder={`Proposition ${optIdx + 1}`}
                                      />
                                      {(ex.options || []).length > 2 && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            const nextOptions = (ex.options || []).filter((_, idx) => idx !== optIdx);
                                            handleUpdateEditingExercise(editingCriterionIdx, exIdx, { options: nextOptions });
                                          }}
                                          className="text-slate-400 hover:text-rose-600 p-1"
                                          title="Supprimer cette proposition"
                                        >
                                          ✕
                                        </button>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* Options pour Vrai / Faux */}
                            {!hasSubQuestions && qType === 'true_false' && (
                              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
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

        {/* ═════════════════════════════════════════════════════════════════
            MODALE DE GESTION DES CODES D'ACCÈS INDIVIDUELS ÉLÈVES
            ═════════════════════════════════════════════════════════════════ */}
        {managingCodesEval && (
          <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
            <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden animate-fadeIn my-auto border border-purple-200">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-purple-800 via-indigo-800 to-violet-900 p-5 text-white flex items-center justify-between gap-4 flex-shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                    <Key size={22} className="text-yellow-300" />
                  </div>
                  <div>
                    <h3 className="text-base font-black tracking-tight">
                      Codes d'Accès Individuels à Usage Unique
                    </h3>
                    <p className="text-xs text-purple-200">
                      {managingCodesEval.title} · Code de base : <strong className="text-white">{managingCodesEval.accessCode}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowPrintCodesModal(true)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-400 hover:bg-yellow-300 text-yellow-950 rounded-xl text-xs font-black shadow transition"
                    title="Imprimer les coupons de codes d'accès individuels (Format A4 à découper pour les élèves)"
                  >
                    <Printer size={14} /> Imprimer fiches A4
                  </button>
                  <button
                    onClick={() => setManagingCodesEval(null)}
                    className="p-1.5 text-white/70 hover:text-white rounded-xl hover:bg-white/10 transition"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Contenu */}
              <div className="p-6 space-y-5 overflow-y-auto flex-1">
                {/* Cartes statistiques */}
                {(() => {
                  const codes = managingCodesEval.studentAccessCodes || [];
                  const total = codes.length;
                  const used = codes.filter(c => c.isUsed).length;
                  const available = codes.filter(c => !c.isUsed).length;
                  const retakes = codes.filter(c => c.isUsed && c.allowedRetake).length;

                  return (
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="bg-purple-50 border border-purple-200 rounded-2xl p-3">
                        <span className="text-[10px] font-bold text-purple-700 uppercase block">Total Codes</span>
                        <span className="text-xl font-black text-purple-950">{total}</span>
                        <span className="text-[10px] text-purple-600 block mt-0.5">élèves prévus</span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-3">
                        <span className="text-[10px] font-bold text-emerald-700 uppercase block">Disponibles</span>
                        <span className="text-xl font-black text-emerald-950">{available}</span>
                        <span className="text-[10px] text-emerald-600 block mt-0.5">prêts pour passation</span>
                      </div>
                      <div className="bg-rose-50 border border-rose-200 rounded-2xl p-3">
                        <span className="text-[10px] font-bold text-rose-700 uppercase block">Utilisés (Verrouillés)</span>
                        <span className="text-xl font-black text-rose-950">{used - retakes}</span>
                        <span className="text-[10px] text-rose-600 block mt-0.5">2e essai bloqué</span>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3">
                        <span className="text-[10px] font-bold text-amber-700 uppercase block">2e Essai Réautorisé</span>
                        <span className="text-xl font-black text-amber-950">{retakes}</span>
                        <span className="text-[10px] text-amber-600 block mt-0.5">accès réouvert par vous</span>
                      </div>
                    </div>
                  );
                })()}

                {/* Explication règles */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-3.5 text-xs text-slate-600 flex items-start gap-2.5">
                  <ShieldCheck size={18} className="text-purple-600 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <p className="font-semibold text-slate-800">
                      Règle de sécurité des codes d'accès :
                    </p>
                    <p className="text-[11px] leading-relaxed">
                      Chaque élève se connecte avec son <strong>code unique</strong>. Dès qu'un code est utilisé pour soumettre l'évaluation, il est automatiquement <strong>verrouillé</strong>. L'élève ne peut plus composer une 2ème fois, <strong>sauf si vous cliquez sur « 🔓 Réouvrir l'accès »</strong> pour lui accorder une nouvelle tentative.
                    </p>
                  </div>
                </div>

                {/* Barre d'outils d'ajout & génération en lot */}
                <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-3">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wide">
                        Générer ou ajouter des codes
                      </h4>
                      <p className="text-[11px] text-slate-500">Ajoutez des codes supplémentaires ou assignez des élèves spécifiques</p>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-semibold text-slate-600">Génération rapide :</span>
                      <button
                        onClick={() => handleGenerateBatchCodes(5)}
                        disabled={isSavingCodes}
                        className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition"
                      >
                        +5 codes
                      </button>
                      <button
                        onClick={() => handleGenerateBatchCodes(10)}
                        disabled={isSavingCodes}
                        className="px-2.5 py-1 bg-white hover:bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-xs font-bold transition"
                      >
                        +10 codes
                      </button>
                      <button
                        onClick={() => handleGenerateBatchCodes(25)}
                        disabled={isSavingCodes}
                        className="px-2.5 py-1 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-xs font-bold transition shadow-xs"
                      >
                        +25 codes
                      </button>
                      <button
                        onClick={handleCopyAllCodes}
                        className="flex items-center gap-1 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg text-xs font-bold transition"
                        title="Copier toute la liste des codes dans le presse-papiers"
                      >
                        <Copy size={13} /> Copier la liste
                      </button>
                    </div>
                  </div>

                  {/* Formulaire ajout personnalisé */}
                  <div className="pt-2 border-t border-slate-200 flex flex-col sm:flex-row items-center gap-2">
                    <input
                      type="text"
                      value={newCustomCode}
                      onChange={e => setNewCustomCode(e.target.value.toUpperCase())}
                      placeholder={`Code (ex: ${managingCodesEval.accessCode}-09)`}
                      className="w-full sm:w-44 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold uppercase focus:ring-2 focus:ring-purple-400 outline-none"
                    />
                    <input
                      type="text"
                      value={newCustomStudentName}
                      onChange={e => setNewCustomStudentName(e.target.value)}
                      placeholder="Nom de l'élève (optionnel)"
                      className="w-full sm:flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs focus:ring-2 focus:ring-purple-400 outline-none"
                    />
                    <input
                      type="text"
                      value={newCustomStudentNumber}
                      onChange={e => setNewCustomStudentNumber(e.target.value)}
                      placeholder="Matricule (optionnel)"
                      className="w-full sm:w-32 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono focus:ring-2 focus:ring-purple-400 outline-none"
                    />
                    <button
                      onClick={handleAddCustomCode}
                      disabled={isSavingCodes}
                      className="w-full sm:w-auto px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow-xs whitespace-nowrap flex items-center justify-center gap-1"
                    >
                      <Plus size={14} /> Ajouter ce code
                    </button>
                  </div>
                </div>

                {/* Tableau de tous les codes d'accès */}
                {(!managingCodesEval.studentAccessCodes || managingCodesEval.studentAccessCodes.length === 0) ? (
                  <div className="p-8 text-center bg-slate-50 rounded-2xl border-2 border-dashed border-slate-200 space-y-3">
                    <Key size={36} className="mx-auto text-slate-300" />
                    <div>
                      <p className="font-bold text-slate-700 text-sm">Aucun code d'accès individuel configuré</p>
                      <p className="text-xs text-slate-400 mt-1">
                        Générez automatiquement un jeu de codes pour chaque élève de votre classe.
                      </p>
                    </div>
                    <button
                      onClick={() => handleGenerateBatchCodes(25)}
                      className="px-5 py-2.5 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
                    >
                      ⚡ Générer 25 codes d'accès pour la classe
                    </button>
                  </div>
                ) : (
                  <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-700 uppercase text-[10px] font-bold border-b border-slate-200">
                        <tr>
                          <th className="px-3 py-2.5 w-12 text-center">N°</th>
                          <th className="px-4 py-2.5">Code d'Accès Unique</th>
                          <th className="px-4 py-2.5">Élève assigné / Ayant composé</th>
                          <th className="px-4 py-2.5">Statut de validité</th>
                          <th className="px-4 py-2.5 text-right">Actions de l'enseignant</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {managingCodesEval.studentAccessCodes.map((codeObj, idx) => {
                          const isCopied = copiedCode === codeObj.code;
                          const isLinkCopied = copiedCode === `link_${codeObj.code}`;
                          const isUsed = Boolean(codeObj.isUsed);
                          const isRetakeAllowed = Boolean(codeObj.allowedRetake);

                          return (
                            <tr key={codeObj.code} className="hover:bg-slate-50/80 transition">
                              <td className="px-3 py-2.5 text-center font-mono text-slate-400 text-[11px]">
                                {idx + 1}
                              </td>

                              <td className="px-4 py-2.5 font-mono">
                                <div className="flex items-center gap-2">
                                  <span className="font-black text-purple-900 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-xs">
                                    {codeObj.code}
                                  </span>
                                  <button
                                    onClick={() => handleCopyCode(codeObj.code)}
                                    className="p-1 text-slate-400 hover:text-purple-700 rounded transition"
                                    title="Copier ce code"
                                  >
                                    {isCopied ? <Check size={13} className="text-green-600" /> : <Copy size={13} />}
                                  </button>
                                  <button
                                    onClick={() => handleCopyStudentLink(codeObj.code)}
                                    className="p-1 text-slate-400 hover:text-indigo-700 rounded transition"
                                    title="Copier le lien direct avec ce code individuel"
                                  >
                                    {isLinkCopied ? <Check size={13} className="text-green-600" /> : <ExternalLink size={13} />}
                                  </button>
                                </div>
                              </td>

                              <td className="px-4 py-2.5">
                                {codeObj.studentName ? (
                                  <div>
                                    <span className="font-bold text-slate-800 block text-xs">{codeObj.studentName}</span>
                                    {codeObj.studentNumber && (
                                      <span className="text-[10px] text-slate-500 font-mono">
                                        Matricule : {codeObj.studentNumber}
                                      </span>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-slate-400 italic text-[11px]">Non assigné (saisi à la connexion)</span>
                                )}
                              </td>

                              <td className="px-4 py-2.5">
                                {isUsed && !isRetakeAllowed && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                    <Lock size={11} className="text-rose-600" />
                                    <span>Utilisé (2e essai bloqué)</span>
                                  </span>
                                )}
                                {isUsed && isRetakeAllowed && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                                    <Unlock size={11} className="text-amber-700" />
                                    <span>Accès réouvert (2e essai autorisé)</span>
                                  </span>
                                )}
                                {!isUsed && (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle size={11} className="text-emerald-600" />
                                    <span>Disponible (Jamais utilisé)</span>
                                  </span>
                                )}
                                {codeObj.usedAt && (
                                  <span className="block text-[9px] text-slate-400 mt-0.5">
                                    {new Date(codeObj.usedAt).toLocaleString('fr-FR')}
                                  </span>
                                )}
                              </td>

                              <td className="px-4 py-2.5 text-right space-x-1.5 whitespace-nowrap">
                                {/* Bouton de déblocage / réouverture du code pour un deuxième essai */}
                                {isUsed && (
                                  <button
                                    onClick={() => handleToggleCodeRetake(codeObj.code)}
                                    className={`px-3 py-1 rounded-lg text-xs font-bold transition shadow-2xs ${
                                      isRetakeAllowed
                                        ? 'bg-rose-100 hover:bg-rose-200 text-rose-800 border border-rose-300'
                                        : 'bg-amber-400 hover:bg-amber-300 text-amber-950 font-black'
                                    }`}
                                    title={isRetakeAllowed ? "Reverrouiller le code" : "Autoriser l'élève à repasser l'épreuve avec ce même code"}
                                  >
                                    {isRetakeAllowed ? '🔒 Reverrouiller' : '🔓 Réouvrir l\'accès (2e essai)'}
                                  </button>
                                )}

                                {/* Réinitialiser le code à neuf */}
                                {isUsed && (
                                  <button
                                    onClick={() => handleResetCodeUsage(codeObj.code)}
                                    className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition"
                                    title="Réinitialiser ce code (effacer l'usage précédent et le rendre réutilisable)"
                                  >
                                    <RefreshCw size={13} />
                                  </button>
                                )}

                                {/* Supprimer */}
                                <button
                                  onClick={() => handleDeleteCode(codeObj.code)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition"
                                  title="Supprimer ce code"
                                >
                                  <Trash2 size={13} />
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

              {/* Footer */}
              <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3 flex-shrink-0">
                <span className="text-xs text-slate-500">
                  {managingCodesEval.studentAccessCodes?.length || 0} code(s) configuré(s) au total.
                </span>

                <button
                  onClick={() => setManagingCodesEval(null)}
                  className="px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  Fermer
                </button>
              </div>

            </div>
          </div>
        )}

        {/* ═════════════════════════════════════════════════════════════════
            MODALE D'IMPRESSION A4 DES FICHES / COUPONS DE CODES ÉLÈVES
            ═════════════════════════════════════════════════════════════════ */}
        {showPrintCodesModal && managingCodesEval && (
          <div className="print-modal-container fixed inset-0 z-[90] bg-slate-900/80 backdrop-blur-sm overflow-y-auto flex flex-col items-center p-0 sm:p-4">
            {/* Barre d'action */}
            <div className="no-print sticky top-0 z-50 w-full max-w-4xl bg-white border-b border-slate-200 px-6 py-3 shadow-md flex items-center justify-between rounded-t-none sm:rounded-t-2xl">
              <div>
                <h3 className="font-bold text-slate-800 text-sm">
                  Fiches d'Accès Élèves — Format A4 Prêt à Découper
                </h3>
                <p className="text-xs text-slate-500">
                  {managingCodesEval.studentAccessCodes?.length || 0} coupons élèves avec codes individuels à usage unique
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white text-xs font-bold rounded-xl shadow transition"
                >
                  <Printer size={16} /> Imprimer les fiches
                </button>
                <button
                  onClick={() => setShowPrintCodesModal(false)}
                  className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition"
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            {/* Feuilles A4 imprimables */}
            <div className="print-sheet bg-white w-full max-w-[190mm] my-0 sm:my-4 p-[10mm] text-slate-900 font-sans shadow-xl border-0">
              <style>{`
                @page {
                  size: A4 portrait;
                  margin: 10mm;
                }
                @media print {
                  .no-print {
                    display: none !important;
                  }
                  html, body {
                    background: #ffffff !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    width: 100% !important;
                  }
                  .print-modal-container {
                    position: static !important;
                    inset: auto !important;
                    background: transparent !important;
                    backdrop-filter: none !important;
                    overflow: visible !important;
                    display: block !important;
                    padding: 0 !important;
                    margin: 0 !important;
                    width: 100% !important;
                  }
                  .print-sheet {
                    box-shadow: none !important;
                    margin: 0 !important;
                    padding: 0 !important;
                    max-width: 100% !important;
                    width: 100% !important;
                    border: none !important;
                    outline: none !important;
                  }
                  .avoid-break-coupon {
                    page-break-inside: avoid !important;
                    break-inside: avoid !important;
                  }
                }
              `}</style>

              <div className="text-center pb-3 border-b-2 border-slate-800 mb-4 avoid-break-coupon">
                <h2 className="text-base font-black uppercase text-slate-900 tracking-tight">
                  Les Écoles Internationales Al-Kawthar · PEI IB
                </h2>
                <p className="text-xs font-bold text-purple-800 uppercase mt-0.5">
                  Fiches Individuelles de Passation d'Évaluation en Ligne
                </p>
                <p className="text-[11px] text-slate-600 mt-1">
                  Évaluation : <strong>{managingCodesEval.title}</strong> ({managingCodesEval.subject} - {managingCodesEval.grade})
                </p>
              </div>

              {/* Grille de coupons découpables */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {(managingCodesEval.studentAccessCodes || []).map((codeObj, cIdx) => (
                  <div
                    key={codeObj.code}
                    className="avoid-break-coupon border-2 border-dashed border-slate-400 rounded-2xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-2.5 relative"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-1.5 text-[10px] text-slate-500 font-bold uppercase">
                      <span>✂️ Découper</span>
                      <span className="text-purple-700">Coupon N° {cIdx + 1}</span>
                    </div>

                    <div>
                      <h4 className="font-black text-xs text-slate-900 truncate">
                        {managingCodesEval.title}
                      </h4>
                      <p className="text-[10px] text-slate-500">
                        {managingCodesEval.subject} · {managingCodesEval.grade}
                      </p>
                    </div>

                    <div className="space-y-1 text-xs">
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">Nom de l'élève :</span>
                        <span className="font-bold text-slate-800 block border-b border-slate-300 pb-0.5 min-h-[18px]">
                          {codeObj.studentName || ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] font-bold text-slate-500 uppercase block">N° d'inscription (Matricule) :</span>
                        <span className="font-mono font-bold text-slate-800 block border-b border-slate-300 pb-0.5 min-h-[18px]">
                          {codeObj.studentNumber || ''}
                        </span>
                      </div>
                    </div>

                    {/* Cadre Code Unique */}
                    <div className="bg-purple-100/80 border-2 border-purple-500 rounded-xl p-2.5 text-center my-1">
                      <span className="block text-[9px] font-black uppercase tracking-wider text-purple-900">
                        Votre Code d'Accès Unique
                      </span>
                      <span className="text-xl font-mono font-black text-purple-950 tracking-wider">
                        {codeObj.code}
                      </span>
                      <span className="block text-[9px] font-bold text-purple-700 mt-0.5">
                        Usage Unique · Verrouillage après soumission
                      </span>
                    </div>

                    <div className="text-[9px] text-slate-500 leading-tight">
                      <strong>Consignes :</strong> Accédez au lien d'examen, saisissez votre nom, matricule et ce code. En mode examen plein écran strict. Aucun 2e essai sans accord du professeur.
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Modal de génération de questions ciblées avec l'IA */}
        {showAiGenModal && editingEvaluation && editingEvaluation.assessments[editingCriterionIdx] && (
          <GenerateCriterialQuestionModal
            isOpen={showAiGenModal}
            onClose={() => setShowAiGenModal(false)}
            onAddQuestion={handleAddAiGeneratedQuestion}
            subject={editingEvaluation.subject}
            gradeLevel={editingEvaluation.grade}
            criterion={editingEvaluation.assessments[editingCriterionIdx].criterion}
            criterionName={editingEvaluation.assessments[editingCriterionIdx].criterionName}
            availableStrands={editingEvaluation.assessments[editingCriterionIdx].strands || []}
            unitTitle={editingEvaluation.unitTitle || editingEvaluation.title}
            statementOfInquiry={editingEvaluation.statementOfInquiry}
            keyConcept={editingEvaluation.keyConcept}
            relatedConcepts={editingEvaluation.relatedConcepts}
            existingQuestionsCount={editingEvaluation.assessments[editingCriterionIdx].exercises?.length || 0}
          />
        )}

      </div>
    </div>
  );
};

export default TeacherEvaluationsManager;
