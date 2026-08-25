import React, { useState, useEffect, useRef } from 'react';
import { UnitPlan, ServiceActionPlan } from '../types';
import { Plus, Edit2, Trash2, FileText, Calendar, Layers, Loader2, Download, X, FileCheck, Filter, FileArchive, User, LogOut, ArrowLeft, BookOpen, Printer, Globe, GitMerge, Tag, AlertTriangle, CheckCircle, Info, Heart, ChevronDown, ChevronUp, RefreshCw, RotateCcw, Upload, FolderOpen, ExternalLink, Clock, Eye, Save, Table, PenLine } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { generateCourseFromChapters, generateInterdisciplinaryUnits, parseDriveFormTags, generateFromDriveForm, DRIVE_FORM_TAGS, InterdisciplinaryUnit, DriveFormConfig, generateServiceActionForGrade, regenerateAllUnitsFromSummary, UnitSummaryInput, generateAssessmentsForUnit, generateUnitDetailsWithAI } from '../services/geminiService';
import type { AppUser } from '../services/authService';
import ModificationRequestModal from './ModificationRequestModal';
import { exportUnitPlanToWord, exportAllUnitPlansToZip, exportAssessmentsToZip, exportConsolidatedPlanByGrade, exportOverviewToWord, exportInterdisciplinaryToWord, exportInterdisciplinaryOverviewToWord, exportSEAOverviewToWord, exportSEAPlanToWord, exportCompleteInterdisciplinaryThemePlan, exportInterdisciplinaryAssessmentsToZip } from '../services/wordExportService';
import { checkSubjectCompletionAllGrades } from '../services/databaseService';
import { SUBJECTS, INTERDISCIPLINARY_SUBJECT, PEI_GRADES, DRIVE_FORM_TAG_GUIDE } from '../constants';
import AddEditUnitModal from './AddEditUnitModal';
import IbCriteriaEditor from './IbCriteriaEditor';
import HoursCalculatorModal from './HoursCalculatorModal';
import AssessmentViewerModal from './AssessmentViewerModal';
import UnitPlanFormImport from './UnitPlanForm';

interface DashboardProps {
  currentSubject: string;
  currentGrade: string;
  plans: UnitPlan[];
  onCreateNew: () => void;
  onEdit: (plan: UnitPlan) => void;
  onDelete: (id: string) => void;
  onAddPlans: (newPlans: UnitPlan[]) => void;
  onAddSingleUnit?: (plan: UnitPlan) => void;
  onUpdateUnit?: (plan: UnitPlan) => void;
  onLogout: () => void;
  currentUser?: AppUser | null;
}

const Dashboard: React.FC<DashboardProps> = ({ currentSubject, currentGrade, plans, onCreateNew, onEdit, onDelete, onAddPlans, onAddSingleUnit, onUpdateUnit, onLogout, currentUser }) => {
  // Permissions basées sur le rôle
  const isAdmin = currentUser?.role === 'admin' || !currentUser || localStorage.getItem('userRole') === 'admin';
  const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
  // Pre-fill subject and grade from session
  const [bulkSubject, setBulkSubject] = useState(currentSubject);
  const [bulkGrade, setBulkGrade] = useState(currentGrade);
  const [bulkTeacher, setBulkTeacher] = useState('');
  const [bulkChapters, setBulkChapters] = useState('');
  const [bulkResources, setBulkResources] = useState('');
  const [isBulkGenerating, setIsBulkGenerating] = useState(false);
  const [exportingId, setExportingId] = useState<string | null>(null);
  const [isOverviewExporting, setIsOverviewExporting] = useState(false);
  const [overviewCompletionStatus, setOverviewCompletionStatus] = useState<{
    complete: boolean;
    gradesWithPlans: string[];
    gradesMissing: string[];
  } | null>(null);
  const [isCheckingCompletion, setIsCheckingCompletion] = useState(false);

  // Filter States (only subject needed since grade is filtered by App)
  const [filterSubject, setFilterSubject] = useState('');

  // ── État : Unités interdisciplinaires ─────────────────────────────────────
  const [isInterdisciplinaryModalOpen, setIsInterdisciplinaryModalOpen] = useState(false);
  const [interDiscipline1, setInterDiscipline1] = useState(currentSubject);
  const [interDiscipline2, setInterDiscipline2] = useState('');
  const [interDiscipline3, setInterDiscipline3] = useState('');
  const [interGrade, setInterGrade] = useState(currentGrade);
  const [interTheme, setInterTheme] = useState('');
  const [interCount, setInterCount] = useState(2);
  const [interTeacher1, setInterTeacher1] = useState('');
  const [interTeacher2, setInterTeacher2] = useState('');
  const [interTeacher3, setInterTeacher3] = useState('');
  const [interSharedObjectives, setInterSharedObjectives] = useState('');
  const [isInterGenerating, setIsInterGenerating] = useState(false);
  const [generatedInterUnits, setGeneratedInterUnits] = useState<InterdisciplinaryUnit[]>([]);
  const [interStep, setInterStep] = useState<'form' | 'result'>('form');
  // Unités interdisciplinaires sauvegardées (depuis localStorage)
  const [savedInterUnits, setSavedInterUnits] = useState<InterdisciplinaryUnit[]>([]);
  const [showSavedInter, setShowSavedInter] = useState(false);
  const [isExportingInterOverview, setIsExportingInterOverview] = useState(false);

  // ── État : Service et Action (SEA) ────────────────────────────────────────
  const [isSEAModalOpen, setIsSEAModalOpen] = useState(false);
  const [seaGrade, setSeaGrade] = useState(currentGrade);
  const [isGeneratingSEA, setIsGeneratingSEA] = useState(false);
  const [seaProgress, setSeaProgress] = useState<{ current: number; total: number; unitTitle: string } | null>(null);
  const [generatedSEAPlans, setGeneratedSEAPlans] = useState<ServiceActionPlan[]>([]);
  const [savedSEAPlans, setSavedSEAPlans] = useState<ServiceActionPlan[]>([]);
  const [showSavedSEA, setShowSavedSEA] = useState(false);
  const [isExportingSEAOverview, setIsExportingSEAOverview] = useState(false);
  const [seaStep, setSeaStep] = useState<'form' | 'result'>('form');

  // ── État : Formulaire Drive-form avec balises ──────────────────────────────
  const [isDriveFormModalOpen, setIsDriveFormModalOpen] = useState(false);
  const [driveFormText, setDriveFormText] = useState('');
  const [driveFormParsed, setDriveFormParsed] = useState<DriveFormConfig | null>(null);
  const [isDriveFormGenerating, setIsDriveFormGenerating] = useState(false);
  const driveFormTextRef = useRef<HTMLTextAreaElement>(null);

  // ── État : Ajouter/Modifier une unité ─────────────────────────────────────
  const [isAddEditUnitModalOpen, setIsAddEditUnitModalOpen] = useState(false);
  const [editingUnitPlan, setEditingUnitPlan] = useState<UnitPlan | null>(null);

  // ── État : Éditeur des critères IB ─────────────────────────────────────
  const [isCriteriaEditorOpen, setIsCriteriaEditorOpen] = useState(false);

  // State: Hours Calculator
  const [isHoursCalculatorOpen, setIsHoursCalculatorOpen] = useState(false);

  // State: Interdisciplinary Criteria Editor
  const [interCriteriaSubject, setInterCriteriaSubject] = useState('');
  const [interCriteriaGrade, setInterCriteriaGrade] = useState('');
  const [isInterCriteriaEditorOpen, setIsInterCriteriaEditorOpen] = useState(false);

  // State: Assessment Viewer/Editor Modal
  const [viewerPlan, setViewerPlan] = useState<UnitPlan | null>(null);

  // ── État : Mise à jour des objectifs d'une unité ──────────────────────────────
  const [updatingAssessmentId, setUpdatingAssessmentId] = useState<string | null>(null);
  // ── État : Mise à jour des détails d'une unité (mode détails) ────────────────
  const [detailUpdatePlan, setDetailUpdatePlan] = useState<UnitPlan | null>(null);
  const [isDetailUpdateMode, setIsDetailUpdateMode] = useState(false);
  const [isExportingExcel, setIsExportingExcel] = useState(false);
  const [isExportingZip, setIsExportingZip] = useState(false);
  // ── État : Génération IA des détails ─────────────────────────────────────────
  const [isGeneratingAIDetails, setIsGeneratingAIDetails] = useState(false);
  const [aiDetailsProgress, setAIDetailsProgress] = useState('');

  // ── État : Upload travaux élèves ──────────────────────────────────────────────
  const [uploadModalPlan, setUploadModalPlan] = useState<UnitPlan | null>(null);
  const [uploadStudentName, setUploadStudentName] = useState('');
  const [uploadCriterion, setUploadCriterion] = useState('');
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  // ── État : Refaire toutes les unités de l'année ───────────────────────────
  const [isRegenAllModalOpen, setIsRegenAllModalOpen] = useState(false);
  const [isRegenAllGenerating, setIsRegenAllGenerating] = useState(false);
  const [regenAllProgress, setRegenAllProgress] = useState('');
  // Editable summaries for regen
  const [regenSummaries, setRegenSummaries] = useState<UnitSummaryInput[]>([]);

  // ── État : Demande de modification (enseignant) ───────────────────────────
  const [modRequestPlan, setModRequestPlan] = useState<UnitPlan | null>(null);
  const [showModRequestModal, setShowModRequestModal] = useState(false);

  // Vérifier la complétude de la matière sur tous les PEI au montage
  useEffect(() => {
    if (!currentSubject) return;
    const checkCompletion = async () => {
      setIsCheckingCompletion(true);
      try {
        const status = await checkSubjectCompletionAllGrades(currentSubject);
        setOverviewCompletionStatus(status);
      } catch (e) {
        console.warn('Could not check subject completion:', e);
      } finally {
        setIsCheckingCompletion(false);
      }
    };
    checkCompletion();
  }, [currentSubject]);

  // Prepare data for charts
  const subjectData = plans.reduce((acc: Record<string, number>, plan) => {
    const subj = plan.subject || 'Non assigné';
    acc[subj] = (acc[subj] || 0) + 1;
    return acc;
  }, {});
  
  const chartData = Object.entries(subjectData).map(([name, value]) => ({ name, value }));

  // Filter Logic
  const uniqueSubjects = Array.from(new Set(plans.map(p => p.subject).filter(Boolean))).sort();

  const filteredPlans = plans.filter(plan => {
    return filterSubject ? plan.subject === filterSubject : true;
  });

  const handleBulkGenerate = async () => {
    if (!bulkSubject || !bulkGrade || !bulkChapters) {
      alert("Veuillez remplir les champs obligatoires (chapitres).");
      return;
    }
    
    setIsBulkGenerating(true);
    try {
      console.log('🚀 Génération planification annuelle pour:', { subject: bulkSubject, grade: bulkGrade });
      const newPlans = await generateCourseFromChapters(bulkChapters, bulkSubject, bulkGrade);
      
      if (!newPlans || newPlans.length === 0) {
        throw new Error("L'IA n'a pas retourné de plan valide. Vérifiez que vous avez bien entré les chapitres du programme.");
      }
      
      console.log(`✅ ${newPlans.length} unité(s) générée(s) avec succès`);
      
      // Ajouter enseignant et ressources à chaque plan généré
      const enrichedPlans = newPlans.map(plan => ({
        ...plan,
        teacherName: bulkTeacher || plan.teacherName,
        resources: bulkResources || plan.resources
      }));
      
      if (onAddPlans) {
          onAddPlans(enrichedPlans);
      }
      setIsBulkModalOpen(false);
      setBulkChapters('');
      setBulkTeacher('');
      setBulkResources('');
    } catch (e: any) {
      const errorMsg = e?.message || String(e);
      console.error("❌ Erreur génération planification:", e);
      alert(`❌ Erreur lors de la génération:\n\n${errorMsg}\n\nConseils:\n- Vérifiez que vous avez bien copié tout le programme\n- Assurez-vous que le texte est clair et structuré\n- Réessayez dans quelques instants`);
    } finally {
      setIsBulkGenerating(false);
    }
  };

  const handleExportPlan = async (plan: UnitPlan) => {
    setExportingId(`plan-${plan.id}`);
    try {
      await exportUnitPlanToWord(plan);
    } catch (e: any) {
      console.error("Erreur téléchargement plan Word:", e);
      alert(`Erreur lors du téléchargement du plan Word: ${e?.message || e}`);
    } finally {
      setExportingId(null);
    }
  };

  const handleExportAssessment = async (plan: UnitPlan) => {
    setExportingId(`eval-${plan.id}`);
    await exportAssessmentsToZip(plan);
    setExportingId(null);
  };

  // NOUVEAU: Fonction d'impression d'une carte d'unité
  const handlePrintUnit = (plan: UnitPlan) => {
    // Créer une fenêtre d'impression avec le contenu formaté
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      alert('Veuillez autoriser les pop-ups pour imprimer');
      return;
    }
    
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <title>Unité: ${plan.title || 'Sans titre'}</title>
        <style>
          @media print {
            @page { margin: 2cm; }
          }
          body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Helvetica', 'Arial', sans-serif;
            line-height: 1.6;
            color: #334155;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
          }
          .header {
            border-bottom: 3px solid #3b82f6;
            padding-bottom: 10px;
            margin-bottom: 20px;
          }
          .subject-badge {
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 12px;
            border-radius: 6px;
            font-size: 12px;
            font-weight: bold;
            margin-bottom: 8px;
          }
          h1 {
            color: #1e293b;
            font-size: 24px;
            margin: 10px 0;
          }
          .meta {
            color: #64748b;
            font-size: 14px;
            margin: 5px 0;
          }
          .section {
            margin: 20px 0;
            padding: 15px;
            border-radius: 8px;
            background: #f8fafc;
            border: 1px solid #e2e8f0;
          }
          .section-title {
            font-weight: bold;
            color: #475569;
            font-size: 12px;
            text-transform: uppercase;
            margin-bottom: 8px;
            display: flex;
            align-items: center;
            gap: 6px;
          }
          .section-content {
            font-size: 14px;
            color: #1e293b;
          }
          .chapters-text {
            white-space: pre-line;
            font-size: 14px;
            color: #1e293b;
          }
          }
          .criteria {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 8px;
          }
          .criterion-badge {
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 10px;
            border-radius: 4px;
            font-size: 12px;
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <span class="subject-badge">${plan.subject || 'Sans matière'}</span>
          <h1>${plan.title || 'Unité sans titre'}</h1>
          <div class="meta">
            ${plan.gradeLevel || ''} ${plan.duration ? '• ' + plan.duration : ''}
            ${plan.teacherName ? '• Enseignant(e): ' + plan.teacherName : ''}
          </div>
        </div>
        
        ${plan.statementOfInquiry ? `
          <div class="section">
            <div class="section-title">📍 Énoncé de recherche</div>
            <div class="section-content"><em>"${plan.statementOfInquiry}"</em></div>
          </div>
        ` : ''}
        
        ${plan.content ? `
          <div class="section">
            <div class="section-title">📚 Chapitres inclus</div>
            <div class="section-content">${plan.content}</div>
          </div>
        ` : ''}
        
        ${plan.chapters ? `
          <div class="section">
            <div class="section-title">📖 Chapitres et leçons</div>
            <div class="chapters-text">${plan.chapters}</div>
          </div>
        ` : ''}
        
        ${plan.assessments && plan.assessments.length > 0 ? `
          <div class="section">
            <div class="section-title">🎯 Critères d'évaluation</div>
            <div class="criteria">
              ${plan.assessments.map(a => `<span class="criterion-badge">Critère ${a.criterion}: ${a.criterionName} (${a.maxPoints}pts)</span>`).join(' ')}
            </div>
          </div>
        ` : ''}
        
        ${plan.summativeAssessment ? `
          <div class="section">
            <div class="section-title">✅ Évaluation sommative</div>
            <div class="section-content">${plan.summativeAssessment}</div>
          </div>
        ` : ''}
        
        <script>
          window.onload = () => {
            window.print();
            // Optionnel: fermer la fenêtre après impression
            // window.onafterprint = () => window.close();
          };
        </script>
      </body>
      </html>
    `;
    
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  const handleExportConsolidated = async () => {
    setExportingId('consolidated');
    await exportConsolidatedPlanByGrade(currentGrade);
    setExportingId(null);
  };

  const handleExportOverview = async () => {
    setIsOverviewExporting(true);
    try {
      await exportOverviewToWord(currentSubject);
    } catch (e: any) {
      alert('Erreur lors de la génération de l\'Overview: ' + (e?.message || e));
    } finally {
      setIsOverviewExporting(false);
    }
  };

  // Re-check completion when plans change (after new generation)
  const refreshCompletionStatus = async () => {
    if (!currentSubject) return;
    try {
      const status = await checkSubjectCompletionAllGrades(currentSubject);
      setOverviewCompletionStatus(status);
    } catch (e) {
      console.warn('Could not refresh subject completion:', e);
    }
  };

  // ── Charger les unités interdisciplinaires + SEA sauvegardées au montage ───
  useEffect(() => {
    try {
      const raw = localStorage.getItem('interdisciplinary_units');
      if (raw) setSavedInterUnits(JSON.parse(raw));
    } catch { /* ignore */ }
    try {
      const rawSEA = localStorage.getItem('sea_plans');
      if (rawSEA) setSavedSEAPlans(JSON.parse(rawSEA));
    } catch { /* ignore */ }
  }, []);

  // ── Handlers : Unités interdisciplinaires ─────────────────────────────────
  // Helper: extract teacher name for a discipline from already-saved plans for the grade
  const getTeacherForDiscipline = (discipline: string, grade: string): string => {
    const match = plans.find(p =>
      p.gradeLevel === grade &&
      p.subject?.toLowerCase().includes(discipline.toLowerCase().split(' ')[0])
    );
    return match?.teacherName || '';
  };

  // Helper: extract relevant chapters/content from saved plans for a discipline+grade
  const getUnitsContextForDiscipline = (discipline: string, grade: string): string => {
    const matched = plans.filter(p =>
      p.gradeLevel === grade &&
      p.subject?.toLowerCase().includes(discipline.toLowerCase().split(' ')[0])
    );
    if (matched.length === 0) return '';
    return matched.map(p => `- ${p.title}${p.keyConcept ? ` (concept: ${p.keyConcept})` : ''}`).join('\n');
  };

  const handleGenerateInterdisciplinary = async () => {
    if (!interDiscipline1 || !interDiscipline2) {
      alert('Veuillez sélectionner au moins 2 disciplines.');
      return;
    }
    if (interDiscipline1 === interDiscipline2) {
      alert('⚠️ Les disciplines 1 et 2 doivent être différentes.');
      return;
    }
    setIsInterGenerating(true);
    try {
      const additionalDisciplines = interDiscipline3 ? [interDiscipline3] : [];
      const allDisciplines = [interDiscipline1, interDiscipline2, ...additionalDisciplines];

      // Auto-fill teachers from saved plans if not manually set
      const resolvedTeachers = allDisciplines.map((d, i) => {
        const manual = [interTeacher1, interTeacher2, interTeacher3][i];
        return manual?.trim() || getTeacherForDiscipline(d, interGrade);
      });

      // Build enriched context from already-generated units for this grade
      const unitsContextParts = allDisciplines.map(d => {
        const ctx = getUnitsContextForDiscipline(d, interGrade);
        return ctx ? `Unités existantes pour ${d} en ${interGrade}:\n${ctx}` : '';
      }).filter(Boolean);
      const enrichedTheme = [
        interTheme,
        unitsContextParts.join('\n\n'),
      ].filter(Boolean).join('\n\n');

      const sharedObjs = interSharedObjectives
        ? interSharedObjectives.split('\n').map(s => s.trim()).filter(Boolean)
        : [];
      const units = await generateInterdisciplinaryUnits(
        interGrade,
        interDiscipline1,
        interDiscipline2,
        additionalDisciplines,
        enrichedTheme,
        Math.max(2, interCount),
        resolvedTeachers,
        sharedObjs,
      );
      setGeneratedInterUnits(units);
      setInterStep('result');
    } catch (e: any) {
      alert('❌ Erreur lors de la génération interdisciplinaire:\n\n' + (e?.message || e));
    } finally {
      setIsInterGenerating(false);
    }
  };

  const handleSaveInterdisciplinaryUnits = () => {
    try {
      const existing = JSON.parse(localStorage.getItem('interdisciplinary_units') || '[]');
      const merged = [
        ...existing.filter((u: InterdisciplinaryUnit) =>
          !generatedInterUnits.some(g => g.id === u.id)),
        ...generatedInterUnits,
      ];
      localStorage.setItem('interdisciplinary_units', JSON.stringify(merged));
      setSavedInterUnits(merged);
      alert(`✅ ${generatedInterUnits.length} unité(s) interdisciplinaire(s) sauvegardée(s) pour ${interGrade}.\n\nRetrouvez-les dans le panneau "Unités interdisciplinaires sauvegardées" du tableau de bord.`);
      setIsInterdisciplinaryModalOpen(false);
      setInterStep('form');
      setGeneratedInterUnits([]);
    } catch (e) {
      alert('Erreur lors de la sauvegarde.');
    }
  };

  const handleDeleteSavedInterUnit = (id: string) => {
    if (!window.confirm('Supprimer cette unité interdisciplinaire ?')) return;
    const updated = savedInterUnits.filter(u => u.id !== id);
    setSavedInterUnits(updated);
    localStorage.setItem('interdisciplinary_units', JSON.stringify(updated));
  };

  // Déléguer l'export Word IB complet au service dédié
  const handleExportInterdisciplinaryWord = (unit: InterdisciplinaryUnit) => {
    exportInterdisciplinaryToWord(unit);
  };

  // Export ZIP des évaluations critériées d'une unité interdisciplinaire
  const handleExportInterdisciplinaryAssessments = async (unit: InterdisciplinaryUnit) => {
    try {
      await exportInterdisciplinaryAssessmentsToZip(unit);
    } catch (e: any) {
      alert('Erreur export évaluations interdisciplinaires : ' + (e?.message || e));
    }
  };

  // Export overview interdisciplinaire (toutes classes) — tableau synthèse
  const handleExportInterOverview = async () => {
    setIsExportingInterOverview(true);
    try {
      await exportInterdisciplinaryOverviewToWord(savedInterUnits);
    } catch (e: any) {
      alert('Erreur export overview interdisciplinaire: ' + (e?.message || e));
    } finally {
      setIsExportingInterOverview(false);
    }
  };

  // Export plan complet interdisciplinaire (toutes unités, tous détails)
  const handleExportCompleteInterPlan = () => {
    try {
      exportCompleteInterdisciplinaryThemePlan(savedInterUnits);
    } catch (e: any) {
      alert('Erreur export plan complet interdisciplinaire: ' + (e?.message || e));
    }
  };

  // ── Handlers : Service et Action (SEA) ───────────────────────────────────
  const handleGenerateSEA = async (gradeOverride?: string) => {
    const targetGrade = gradeOverride || seaGrade;
    if (gradeOverride) setSeaGrade(gradeOverride);
    const gradePlans = plans.filter(p => p.gradeLevel === targetGrade);
    if (gradePlans.length === 0) {
      alert(`❌ Aucune unité générée pour ${targetGrade}.\nVeuillez d'abord générer les unités de cette classe.`);
      return;
    }
    setIsGeneratingSEA(true);
    setSeaProgress(null);
    setSeaStep('form');
    try {
      const sea = await generateServiceActionForGrade(
        gradePlans,
        targetGrade,
        (current, total, unitTitle) => setSeaProgress({ current, total, unitTitle })
      );
      setGeneratedSEAPlans(sea);
      setSeaStep('result');
    } catch (e: any) {
      alert('❌ Erreur génération SEA:\n\n' + (e?.message || e));
    } finally {
      setIsGeneratingSEA(false);
      setSeaProgress(null);
    }
  };

  // Open SEA modal pre-set to a specific grade and immediately generate
  const handleOpenSEAForGrade = (grade: string) => {
    setSeaGrade(grade);
    setSeaStep('form');
    setGeneratedSEAPlans([]);
    setIsSEAModalOpen(true);
  };

  const handleSaveSEAPlans = () => {
    try {
      const existing: ServiceActionPlan[] = JSON.parse(localStorage.getItem('sea_plans') || '[]');
      const merged = [
        ...existing.filter(s => !generatedSEAPlans.some(g => g.id === s.id)),
        ...generatedSEAPlans,
      ];
      localStorage.setItem('sea_plans', JSON.stringify(merged));
      setSavedSEAPlans(merged);
      alert(`✅ ${generatedSEAPlans.length} projet(s) SEA sauvegardé(s) pour ${seaGrade}.`);
      setIsSEAModalOpen(false);
      setSeaStep('form');
      setGeneratedSEAPlans([]);
    } catch {
      alert('Erreur lors de la sauvegarde SEA.');
    }
  };

  const handleDeleteSEAPlan = (id: string) => {
    if (!window.confirm('Supprimer ce projet SEA ?')) return;
    const updated = savedSEAPlans.filter(s => s.id !== id);
    setSavedSEAPlans(updated);
    localStorage.setItem('sea_plans', JSON.stringify(updated));
  };

  const handleExportSEAOverview = async () => {
    setIsExportingSEAOverview(true);
    try {
      await exportSEAOverviewToWord(savedSEAPlans);
    } catch (e: any) {
      alert('Erreur export SEA: ' + (e?.message || e));
    } finally {
      setIsExportingSEAOverview(false);
    }
  };

  // Helper: Parse planned hours from unit durations for subject+grade
  const getPlannedHoursForSubjectGrade = (): number => {
    const subjectPlans = plans.filter(
      p => (p.subject || currentSubject) === currentSubject &&
           (p.gradeLevel || currentGrade) === currentGrade
    );
    let total = 0;
    for (const p of subjectPlans) {
      if (!p.duration) continue;
      const heureMatch = p.duration.match(/(\d+(?:[.,]\d+)?)\s*(?:heures?|h\b)/i);
      const semaineMatch = p.duration.match(/(\d+(?:[.,]\d+)?)\s*semaines?/i);
      if (heureMatch) {
        total += parseFloat(heureMatch[1].replace(',', '.'));
      } else if (semaineMatch) {
        total += parseFloat(semaineMatch[1].replace(',', '.')) * 2;
      }
    }
    return total;
  };

  // ── Handler : Mise à jour des évaluations critériées d'une unité ────────────
  const handleUpdateAssessments = async (plan: UnitPlan) => {
    if (!plan.id) return;
    setUpdatingAssessmentId(plan.id);
    try {
      const newAssessments = await generateAssessmentsForUnit(plan);
      const updatedPlan: UnitPlan = { ...plan, assessments: newAssessments };
      if (onUpdateUnit) {
        onUpdateUnit(updatedPlan);
      } else {
        onAddPlans(plans.map(p => p.id === plan.id ? updatedPlan : p));
      }
    } catch (e: any) {
      alert(`Erreur mise à jour des évaluations : ${e?.message || e}`);
    } finally {
      setUpdatingAssessmentId(null);
    }
  };

  // ── Handler : onSaved depuis IbCriteriaEditor → met à jour toutes les unités ──
  const handleCriteriaSaved = async (savedSubject: string, savedGrade: string) => {
    const toUpdate = plans.filter(
      p => (p.subject || currentSubject) === savedSubject && (p.gradeLevel || currentGrade) === savedGrade
    );
    if (toUpdate.length === 0) return;
    for (const plan of toUpdate) {
      try {
        const newAssessments = await generateAssessmentsForUnit(plan);
        const updated = { ...plan, assessments: newAssessments };
        if (onUpdateUnit) onUpdateUnit(updated);
        else onAddPlans(plans.map(p => p.id === updated.id ? updated : p));
      } catch (e) {
        console.warn('Mise à jour auto évaluations échouée pour', plan.title, e);
      }
    }
  };

  // ── Handler : Sauvegarder la mise à jour des détails ─────────────────────
  const handleSaveDetailUpdate = (updatedPlan: UnitPlan) => {
    if (onUpdateUnit) {
      onUpdateUnit(updatedPlan);
    } else {
      const updated = plans.map(p => p.id === updatedPlan.id ? updatedPlan : p);
      onAddPlans(updated);
    }
    setDetailUpdatePlan(null);
    setIsDetailUpdateMode(false);
  };

  // ── Handler : Génération IA des détails manquants ────────────────────────
  const handleGenerateAIDetails = async () => {
    if (!detailUpdatePlan) return;
    if (!window.confirm(
      `Générer automatiquement les détails manquants pour "${detailUpdatePlan.title}" avec Gemini ?\n\n` +
      `Sections générées : Processus d'apprentissage (5 phases), Séances (4 séances), ` +
      `Différenciation, Réflexion, Contexte élèves, Cohérence verticale/horizontale, Liens interdisciplinaires.\n\n` +
      `Les champs déjà remplis ne seront pas écrasés.`
    )) return;

    setIsGeneratingAIDetails(true);
    setAIDetailsProgress('Initialisation…');
    try {
      const g = await generateUnitDetailsWithAI(
        detailUpdatePlan,
        (msg) => setAIDetailsProgress(msg)
      );

      // ── Helper : retourne `a` si non-vide/non-null, sinon `b` ─────────────
      const pick = <T,>(a: T | undefined | null, b: T | undefined | null): T | undefined => {
        if (a !== undefined && a !== null && a !== '' && !(Array.isArray(a) && a.length === 0)) return a as T;
        return (b ?? undefined) as T | undefined;
      };

      // ── Merge profond learningProcess (5 phases) ──────────────────────────
      const existLP = detailUpdatePlan.learningProcess;
      const genLP   = g.learningProcess;
      const mergedLP = (existLP || genLP) ? {
        phase1_activation:  pick(existLP?.phase1_activation,  genLP?.phase1_activation)  ?? '',
        phase2_acquisition: pick(existLP?.phase2_acquisition, genLP?.phase2_acquisition) ?? '',
        phase3_practice:    pick(existLP?.phase3_practice,    genLP?.phase3_practice)    ?? '',
        phase4_transfer:    pick(existLP?.phase4_transfer,    genLP?.phase4_transfer)    ?? '',
        phase5_reflection:  pick(existLP?.phase5_reflection,  genLP?.phase5_reflection)  ?? '',
      } : undefined;

      // ── Merge profond differentiationDetails ─────────────────────────────
      const existDD = detailUpdatePlan.differentiationDetails;
      const genDD   = g.differentiationDetails;
      const mergedDD = (existDD || genDD) ? {
        supportStudents: {
          vocabulary:           pick(existDD?.supportStudents?.vocabulary,           genDD?.supportStudents?.vocabulary)           ?? '',
          visualSupports:       pick(existDD?.supportStudents?.visualSupports,       genDD?.supportStudents?.visualSupports)       ?? '',
          models:               pick(existDD?.supportStudents?.models,               genDD?.supportStudents?.models)               ?? '',
          adaptedInstructions:  pick(existDD?.supportStudents?.adaptedInstructions,  genDD?.supportStudents?.adaptedInstructions)  ?? '',
          intermediateSteps:    pick(existDD?.supportStudents?.intermediateSteps,    genDD?.supportStudents?.intermediateSteps)    ?? '',
          smallGroups:          pick(existDD?.supportStudents?.smallGroups,          genDD?.supportStudents?.smallGroups)          ?? '',
          individualSupport:    pick(existDD?.supportStudents?.individualSupport,    genDD?.supportStudents?.individualSupport)    ?? '',
          extraTime:            pick(existDD?.supportStudents?.extraTime,            genDD?.supportStudents?.extraTime)            ?? '',
          additionalResources:  pick(existDD?.supportStudents?.additionalResources,  genDD?.supportStudents?.additionalResources)  ?? '',
        },
        advancedStudents: {
          deepening:            pick(existDD?.advancedStudents?.deepening,           genDD?.advancedStudents?.deepening)           ?? '',
          autonomousResearch:   pick(existDD?.advancedStudents?.autonomousResearch,  genDD?.advancedStudents?.autonomousResearch)  ?? '',
          complexProblems:      pick(existDD?.advancedStudents?.complexProblems,     genDD?.advancedStudents?.complexProblems)     ?? '',
          challenges:           pick(existDD?.advancedStudents?.challenges,          genDD?.advancedStudents?.challenges)          ?? '',
          transfer:             pick(existDD?.advancedStudents?.transfer,            genDD?.advancedStudents?.transfer)            ?? '',
          advancedProduction:   pick(existDD?.advancedStudents?.advancedProduction,  genDD?.advancedStudents?.advancedProduction)  ?? '',
        },
        contentDifferentiation:  pick(existDD?.contentDifferentiation,  genDD?.contentDifferentiation)  ?? '',
        processDifferentiation:  pick(existDD?.processDifferentiation,  genDD?.processDifferentiation)  ?? '',
        productDifferentiation:  pick(existDD?.productDifferentiation,  genDD?.productDifferentiation)  ?? '',
      } : undefined;

      // ── Merge profond reflectionDetails (avant / pendant / après) ─────────
      // Noms de champs conformes à types.ts ET au formulaire UnitPlanForm
      const existRD = detailUpdatePlan.reflectionDetails;
      const genRD   = g.reflectionDetails;
      const mergedRD = (existRD || genRD) ? {
        before: {
          priorKnowledge:          pick(existRD?.before?.priorKnowledge,          genRD?.before?.priorKnowledge)          ?? '',
          studentNeeds:            pick(existRD?.before?.studentNeeds,            genRD?.before?.studentNeeds)            ?? '',
          anticipatedDifficulties: pick(existRD?.before?.anticipatedDifficulties, genRD?.before?.anticipatedDifficulties) ?? '',
          relevance:               pick(existRD?.before?.relevance,               genRD?.before?.relevance)               ?? '',
          previousLinks:           pick(existRD?.before?.previousLinks,           genRD?.before?.previousLinks)           ?? '',
          plannedStrategies:       pick(existRD?.before?.plannedStrategies,       genRD?.before?.plannedStrategies)       ?? '',
          plannedDifferentiation:  pick(existRD?.before?.plannedDifferentiation,  genRD?.before?.plannedDifferentiation)  ?? '',
          expectedOutcomes:        pick(existRD?.before?.expectedOutcomes,        genRD?.before?.expectedOutcomes)        ?? '',
        },
        during: {
          progressObserved:        pick(existRD?.during?.progressObserved,        genRD?.during?.progressObserved)        ?? '',
          difficulties:            pick(existRD?.during?.difficulties,            genRD?.during?.difficulties)            ?? '',
          effectiveStrategies:     pick(existRD?.during?.effectiveStrategies,     genRD?.during?.effectiveStrategies)     ?? '',
          ineffectiveStrategies:   pick(existRD?.during?.ineffectiveStrategies,   genRD?.during?.ineffectiveStrategies)   ?? '',
          studentParticipation:    pick(existRD?.during?.studentParticipation,    genRD?.during?.studentParticipation)    ?? '',
          adjustmentsMade:         pick(existRD?.during?.adjustmentsMade,         genRD?.during?.adjustmentsMade)         ?? '',
          planningChanges:         pick(existRD?.during?.planningChanges,         genRD?.during?.planningChanges)         ?? '',
          emergingNeeds:           pick(existRD?.during?.emergingNeeds,           genRD?.during?.emergingNeeds)           ?? '',
        },
        after: {
          achievedObjectives:      pick(existRD?.after?.achievedObjectives,       genRD?.after?.achievedObjectives)       ?? '',
          partialObjectives:       pick(existRD?.after?.partialObjectives,        genRD?.after?.partialObjectives)        ?? '',
          studentDifficulties:     pick(existRD?.after?.studentDifficulties,      genRD?.after?.studentDifficulties)      ?? '',
          assessmentResults:       pick(existRD?.after?.assessmentResults,        genRD?.after?.assessmentResults)        ?? '',
          activityEfficiency:      pick(existRD?.after?.activityEfficiency,       genRD?.after?.activityEfficiency)       ?? '',
          teachingEfficiency:      pick(existRD?.after?.teachingEfficiency,       genRD?.after?.teachingEfficiency)       ?? '',
          differentiationEfficiency: pick(existRD?.after?.differentiationEfficiency, genRD?.after?.differentiationEfficiency) ?? '',
          successes:               pick(existRD?.after?.successes,               genRD?.after?.successes)               ?? '',
          improvements:            pick(existRD?.after?.improvements,            genRD?.after?.improvements)            ?? '',
          modificationsNext:       pick(existRD?.after?.modificationsNext,       genRD?.after?.modificationsNext)       ?? '',
          elementsToKeep:          pick(existRD?.after?.elementsToKeep,          genRD?.after?.elementsToKeep)          ?? '',
          elementsToRemove:        pick(existRD?.after?.elementsToRemove,        genRD?.after?.elementsToRemove)        ?? '',
          elementsToAdd:           pick(existRD?.after?.elementsToAdd,           genRD?.after?.elementsToAdd)           ?? '',
        },
      } : undefined;

      // ── Merge profond verticalCoherence ───────────────────────────────────
      const existVC = detailUpdatePlan.verticalCoherence;
      const genVC_before = g.verticalCoherenceText;
      const mergedVC = (existVC || genVC_before) ? {
        before: pick(existVC?.before, genVC_before) ?? '',
        during: existVC?.during ?? '',
        after:  existVC?.after  ?? '',
      } : undefined;

      // ── Merge profond horizontalCoherence ─────────────────────────────────
      const existHC = detailUpdatePlan.horizontalCoherence;
      const genHC_text = g.horizontalCoherenceText;
      const mergedHC = (existHC || genHC_text) ? {
        otherSubjectLinks:  pick(existHC?.otherSubjectLinks,  genHC_text) ?? '',
        transversalSkills:  pick(existHC?.transversalSkills,  '') ?? '',
      } : undefined;

      // ── Merge profond studentContext ──────────────────────────────────────
      const existSC = detailUpdatePlan.studentContext;
      const genSC   = g.studentContext;
      const mergedSC = (existSC || genSC) ? {
        priorKnowledge:          pick(existSC?.priorKnowledge,          genSC?.priorKnowledge)          ?? '',
        acquiredSkills:          pick(existSC?.acquiredSkills,          genSC?.acquiredSkills)          ?? '',
        linksPreviousUnits:      pick(existSC?.linksPreviousUnits,      genSC?.linksPreviousUnits)      ?? '',
        specificNeeds:           pick(existSC?.specificNeeds,           genSC?.specificNeeds)           ?? '',
        profileDiversity:        pick(existSC?.profileDiversity,        genSC?.profileDiversity)        ?? '',
        culturalContexts:        pick(existSC?.culturalContexts,        genSC?.culturalContexts)        ?? '',
        anticipatedDifficulties: pick(existSC?.anticipatedDifficulties, genSC?.anticipatedDifficulties) ?? '',
      } : undefined;

      // ── Merge profond interdisciplinaryLinks ──────────────────────────────
      const existIL = detailUpdatePlan.interdisciplinaryLinks;
      const genIL   = g.interdisciplinaryLinks;
      const mergedIL = (existIL && existIL.length > 0) ? existIL : (genIL && genIL.length > 0 ? genIL : existIL);

      // ── Merge final complet ───────────────────────────────────────────────
      const merged: UnitPlan = {
        ...detailUpdatePlan,
        // ── Cadrage conceptuel & recherche (complété si vide/minimal) ──
        keyConcept:         pick(detailUpdatePlan.keyConcept, g.keyConcept) ?? detailUpdatePlan.keyConcept,
        keyConceptDefinition: pick(detailUpdatePlan.keyConceptDefinition, g.keyConceptDefinition) ?? detailUpdatePlan.keyConceptDefinition,
        relatedConcepts:    (detailUpdatePlan.relatedConcepts && detailUpdatePlan.relatedConcepts.length > 0)
                              ? detailUpdatePlan.relatedConcepts : (g.relatedConcepts ?? detailUpdatePlan.relatedConcepts),
        globalContext:      pick(detailUpdatePlan.globalContext, g.globalContext) ?? detailUpdatePlan.globalContext,
        globalContextAspects: pick(detailUpdatePlan.globalContextAspects, g.globalContextAspects) ?? detailUpdatePlan.globalContextAspects,
        statementOfInquiry: pick(detailUpdatePlan.statementOfInquiry, g.statementOfInquiry) ?? detailUpdatePlan.statementOfInquiry,
        statementExplanation: pick(detailUpdatePlan.statementExplanation, g.statementExplanation) ?? detailUpdatePlan.statementExplanation,
        inquiryQuestions:   (detailUpdatePlan.inquiryQuestions && (detailUpdatePlan.inquiryQuestions.factual?.length || detailUpdatePlan.inquiryQuestions.conceptual?.length || detailUpdatePlan.inquiryQuestions.debatable?.length))
                              ? detailUpdatePlan.inquiryQuestions : (g.inquiryQuestions ?? detailUpdatePlan.inquiryQuestions),
        objectives:         (detailUpdatePlan.objectives && detailUpdatePlan.objectives.length > 0)
                              ? detailUpdatePlan.objectives : (g.objectives ?? detailUpdatePlan.objectives),
        atlSkills:          (detailUpdatePlan.atlSkills && (Array.isArray(detailUpdatePlan.atlSkills) ? detailUpdatePlan.atlSkills.length > 0 : Boolean(detailUpdatePlan.atlSkills)))
                              ? detailUpdatePlan.atlSkills : (g.atlSkills ?? detailUpdatePlan.atlSkills),
        // ── Section A : Informations générales ──
        numberOfPeriods:    pick(detailUpdatePlan.numberOfPeriods, g.numberOfPeriods)    ?? detailUpdatePlan.numberOfPeriods,
        numberOfHours:      pick(detailUpdatePlan.numberOfHours,   g.numberOfHours)      ?? detailUpdatePlan.numberOfHours,
        startDate:          pick(detailUpdatePlan.startDate,        g.startDate)          ?? detailUpdatePlan.startDate,
        endDate:            pick(detailUpdatePlan.endDate,          g.endDate)            ?? detailUpdatePlan.endDate,
        prerequisites:      pick(detailUpdatePlan.prerequisites,    g.prerequisites)      ?? detailUpdatePlan.prerequisites,
        schoolYear:         pick(detailUpdatePlan.schoolYear,       g.schoolYear)         ?? detailUpdatePlan.schoolYear,
        // ── Sections B/G/H ──
        studentContext:     mergedSC,
        contentDetails:     pick(detailUpdatePlan.contentDetails,   g.contentDetails)     ?? detailUpdatePlan.contentDetails,
        objectivesDetails:  pick(detailUpdatePlan.objectivesDetails,g.objectivesDetails)  ?? detailUpdatePlan.objectivesDetails,
        // ── Section I : Processus d'apprentissage (5 phases) ──
        learningProcess:    mergedLP,
        // ── Section J/K ──
        sessions:           (detailUpdatePlan.sessions && detailUpdatePlan.sessions.length > 0)
                              ? detailUpdatePlan.sessions : g.sessions,
        learningExperiences: pick(detailUpdatePlan.learningExperiences, g.learningExperiences) ?? detailUpdatePlan.learningExperiences,
        teachingStrategies:  pick(detailUpdatePlan.teachingStrategies,  g.teachingStrategies)  ?? '',
        studentActivities:   pick(detailUpdatePlan.studentActivities,   g.studentActivities)   ?? '',
        // ── Section L/M : Évaluations ──
        formativeAssessment: pick(detailUpdatePlan.formativeAssessment, g.formativeAssessment) ?? detailUpdatePlan.formativeAssessment,
        summativeAssessment: pick(detailUpdatePlan.summativeAssessment, g.summativeAssessment) ?? detailUpdatePlan.summativeAssessment,
        summativeDetails:    pick(detailUpdatePlan.summativeDetails, g.summativeDetails) ?? detailUpdatePlan.summativeDetails,
        // ── Section N : Différenciation ──
        differentiationDetails: mergedDD,
        differentiation:    pick(detailUpdatePlan.differentiation, g.differentiation) ?? detailUpdatePlan.differentiation,
        // ── Section O : Ressources ──
        resources:          pick(detailUpdatePlan.resources, g.resources) ?? detailUpdatePlan.resources,
        // ── Section P : Réflexion (avant / pendant / après) ──
        reflectionDetails:  mergedRD,
        // ── Section Q : Cohérence verticale / horizontale ──
        verticalCoherence:       mergedVC,
        horizontalCoherence:     mergedHC,
        verticalCoherenceText:   pick(detailUpdatePlan.verticalCoherenceText,   g.verticalCoherenceText)   ?? '',
        horizontalCoherenceText: pick(detailUpdatePlan.horizontalCoherenceText, g.horizontalCoherenceText) ?? '',
        // ── Section R : Liens interdisciplinaires ──
        interdisciplinaryLinks:     mergedIL,
        interdisciplinaryLinksText: pick(detailUpdatePlan.interdisciplinaryLinksText, g.interdisciplinaryLinksText) ?? '',
        // ── Marqueurs ──
        lastDetailUpdate: new Date().toISOString().slice(0, 10),
        isDetailUpdate: true,
      };

      setDetailUpdatePlan(merged);
      // Sauvegarder immédiatement via onUpdateUnit pour persister dans MongoDB
      if (onUpdateUnit) onUpdateUnit(merged);
      setAIDetailsProgress('✅ Détails générés et sauvegardés !');
      setTimeout(() => setAIDetailsProgress(''), 4000);
    } catch (e: any) {
      setAIDetailsProgress('');
      alert(`❌ Erreur lors de la génération IA :\n${e?.message || String(e)}`);
    } finally {
      setIsGeneratingAIDetails(false);
    }
  };

  // ── Handler : Export Excel global (toutes les données) ───────────────────
  const handleExportAllExcel = async () => {
    setIsExportingExcel(true);
    try {
      const response = await fetch(`/api/planifications?export=excel&t=${Date.now()}`);
      if (!response.ok) {
        throw new Error(`Erreur HTTP: ${response.status}`);
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `export_toutes_donnees_PEI_${new Date().toISOString().slice(0,10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      // Fallback: export CSV local depuis les plans chargés
      exportPlansToCSV(plans, `plans_${currentSubject}_${currentGrade}`);
    } finally {
      setIsExportingExcel(false);
    }
  };

  // ── Helper : Export CSV local ─────────────────────────────────────────────
  const exportPlansToCSV = (plansToExport: UnitPlan[], filename: string) => {
    const headers = [
      'Titre', 'Matière', 'Niveau', 'Enseignant', 'Durée', 'Année scolaire',
      'Concept clé', 'Concepts connexes', 'Contexte mondial', 'Énoncé de recherche',
      'Questions factuelles', 'Questions conceptuelles', 'Questions débattables',
      'Objectifs', 'ATL', 'Contenu', 'Activités d\'apprentissage',
      'Évaluation formative', 'Évaluation sommative', 'Différenciation',
      'Ressources', 'Réflexion avant', 'Réflexion pendant', 'Réflexion après',
      'Critères évaluation', 'Date création'
    ];
    
    const rows = plansToExport.map(p => [
      p.title || '',
      p.subject || '',
      p.gradeLevel || '',
      p.teacherName || '',
      p.duration || '',
      p.schoolYear || '',
      p.keyConcept || '',
      (p.relatedConcepts || []).join('; '),
      p.globalContext || '',
      p.statementOfInquiry || '',
      (p.inquiryQuestions?.factual || []).join(' | '),
      (p.inquiryQuestions?.conceptual || []).join(' | '),
      (p.inquiryQuestions?.debatable || []).join(' | '),
      (p.objectives || []).join('; '),
      (Array.isArray(p.atlSkills) ? p.atlSkills : [p.atlSkills || '']).join('; '),
      (p.content || '').replace(/\n/g, ' '),
      (p.learningExperiences || '').replace(/\n/g, ' '),
      (p.formativeAssessment || '').replace(/\n/g, ' '),
      (p.summativeAssessment || '').replace(/\n/g, ' '),
      (p.differentiation || '').replace(/\n/g, ' '),
      (p.resources || '').replace(/\n/g, ' '),
      (p.reflection?.prior || '').replace(/\n/g, ' '),
      (p.reflection?.during || '').replace(/\n/g, ' '),
      (p.reflection?.after || '').replace(/\n/g, ' '),
      (p.assessments || []).map(a => `Critère ${a.criterion}: ${a.criterionName}`).join('; '),
      p.lastDetailUpdate || new Date().toISOString().slice(0,10),
    ]);

    const csvContent = [headers, ...rows]
      .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    
    const BOM = '\uFEFF'; // BOM for Excel UTF-8
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}_${new Date().toISOString().slice(0,10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // ── Handler : Export ZIP des plans d'une classe (tous au format Word .docx) ──
  const [zipProgress, setZipProgress] = useState<{ current: number; total: number; title: string } | null>(null);
  const handleExportClassZip = async () => {
    if (plans.length === 0) {
      alert("Aucun plan d'unité à exporter pour cette classe.");
      return;
    }
    setIsExportingZip(true);
    setZipProgress(null);
    try {
      await exportAllUnitPlansToZip(
        plans,
        currentSubject,
        currentGrade,
        (current, total, title) => {
          setZipProgress({ current, total, title });
        }
      );
    } catch (e: any) {
      console.error("Erreur export ZIP des plans Word:", e);
      alert('Erreur lors de l\'export ZIP des plans Word: ' + (e?.message || e));
    } finally {
      setIsExportingZip(false);
      setZipProgress(null);
    }
  };

  // ── Handlers : Ajouter / Modifier une unité ──────────────────────────────
  const handleOpenAddUnit = () => {
    setEditingUnitPlan(null);
    setIsAddEditUnitModalOpen(true);
  };

  const handleOpenEditUnit = (plan: UnitPlan) => {
    setEditingUnitPlan(plan);
    setIsAddEditUnitModalOpen(true);
  };

  const handleSaveUnit = (plan: UnitPlan) => {
    const planWithSession = {
      ...plan,
      subject: plan.subject || currentSubject,
      gradeLevel: plan.gradeLevel || currentGrade,
    };
    if (editingUnitPlan && editingUnitPlan.id) {
      // Modification d'une unité existante
      if (onUpdateUnit) {
        onUpdateUnit(planWithSession);
      } else {
        // Fallback: replace in the whole plans array
        const updated = plans.map(p => p.id === planWithSession.id ? planWithSession : p);
        onAddPlans(updated);
      }
    } else {
      // Ajout d'une nouvelle unité
      if (onAddSingleUnit) {
        onAddSingleUnit({ ...planWithSession, id: Date.now().toString() });
      } else {
        onAddPlans([...plans, { ...planWithSession, id: Date.now().toString() }]);
      }
    }
    setIsAddEditUnitModalOpen(false);
    setEditingUnitPlan(null);
  };

  // ── Handlers : Refaire toutes les unités de l'année ──────────────────────
  const handleOpenRegenAll = () => {
    // Init summaries from current plans
    const summaries: UnitSummaryInput[] = plans.map(p => ({
      title: p.title || '',
      statementOfInquiry: p.statementOfInquiry || '',
      chapters: p.chapters || p.content || '',
      objectives: (p.assessments || []).map(a => `Critère ${a.criterion}`).filter(Boolean).length > 0
        ? (p.assessments || []).map(a => `Critère ${a.criterion}`)
        : (p.objectives || []),
    }));
    setRegenSummaries(summaries);
    setIsRegenAllModalOpen(true);
    setRegenAllProgress('');
  };

  const handleRegenAllUnits = async () => {
    if (regenSummaries.length === 0) {
      alert('Aucune unité à régénérer.');
      return;
    }
    const hasEmpty = regenSummaries.some(s => !s.title.trim() || !s.statementOfInquiry.trim());
    if (hasEmpty) {
      alert('Veuillez remplir le titre et l\'énoncé de recherche pour toutes les unités.');
      return;
    }
    setIsRegenAllGenerating(true);
    setRegenAllProgress('Génération en cours…');
    try {
      const newPlans = await regenerateAllUnitsFromSummary(regenSummaries, currentSubject, currentGrade);
      // Preserve teacher names from original plans
      const enriched = newPlans.map((p, idx) => ({
        ...p,
        teacherName: plans[idx]?.teacherName || p.teacherName,
        subject: currentSubject,
        gradeLevel: currentGrade,
      }));
      if (onAddPlans) {
        // Use the existing onAddPlans (it will ask confirmation since plans exist)
        onAddPlans(enriched);
      }
      setIsRegenAllModalOpen(false);
      setRegenAllProgress('');
    } catch (e: any) {
      alert('❌ Erreur lors de la régénération:\n\n' + (e?.message || e));
    } finally {
      setIsRegenAllGenerating(false);
    }
  };

  const updateRegenSummary = (idx: number, field: keyof UnitSummaryInput, value: string | string[]) => {
    setRegenSummaries(prev => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: value };
      return copy;
    });
  };

  // ── Handlers : Formulaire Drive avec balises ───────────────────────────────
  const handleParseDriveForm = () => {
    if (!driveFormText.trim()) return;
    const config = parseDriveFormTags(driveFormText);
    setDriveFormParsed(config);
  };

  const handleGenerateFromDriveForm = async () => {
    if (!driveFormParsed) return;
    if (driveFormParsed.missingRequired.length > 0) {
      alert(`Formulaire incomplet.\nTags obligatoires manquants :\n${driveFormParsed.missingRequired.join('\n')}`);
      return;
    }
    setIsDriveFormGenerating(true);
    try {
      const result = await generateFromDriveForm(driveFormParsed);
      if (!result || result.length === 0) throw new Error("L'IA n'a pas retourné de résultat.");

      if (driveFormParsed.isInterdisciplinary) {
        const newUnits = result as InterdisciplinaryUnit[];
        const existing = JSON.parse(localStorage.getItem('interdisciplinary_units') || '[]');
        const merged = [...existing, ...newUnits];
        localStorage.setItem('interdisciplinary_units', JSON.stringify(merged));
        setSavedInterUnits(merged);
        alert(`✅ ${newUnits.length} unité(s) interdisciplinaire(s) générée(s) et sauvegardée(s).\n\nRetrouvez-les dans le panneau "Unités interdisciplinaires sauvegardées".`);
      } else {
        onAddPlans(result as UnitPlan[]);
      }
      setIsDriveFormModalOpen(false);
      setDriveFormText('');
      setDriveFormParsed(null);
    } catch (e: any) {
      alert('❌ Erreur lors de la génération:\n\n' + (e?.message || e));
    } finally {
      setIsDriveFormGenerating(false);
    }
  };

  const getDriveFormTemplate = (interdisciplinary = false) => {
    if (interdisciplinary) {
      return `[MATIERE] Mathématiques
[CLASSE] PEI 3
[CHAPITRES]
Chapitre 1 : Fonctions et équations
Chapitre 2 : Statistiques et probabilités

[DISCIPLINE2] Sciences
[DISCIPLINE3] Individus et sociétés

[ENSEIGNANT] M. Dupont | Mme Martin | M. Leclerc
[RESSOURCES] Manuels, laboratoire, ressources numériques

[CONCEPT_CLE] Systèmes
[CONTEXTE] Innovation scientifique et technique

[THEME] Développement durable et modélisation

[NOMBRE_UNITES] 2

[OBJECTIFS_COMMUNS]
Développer la pensée critique interdisciplinaire
Analyser des phénomènes complexes sous plusieurs angles disciplinaires`;
    }
    return `[MATIERE] Mathématiques
[CLASSE] PEI 3
[CHAPITRES]
Chapitre 1 : Nombres et opérations
Chapitre 2 : Géométrie plane
Chapitre 3 : Statistiques et probabilités
Chapitre 4 : Algèbre et équations

[ENSEIGNANT] Nom de l'enseignant
[RESSOURCES] Manuel scolaire, cahier d'activités

[CONCEPT_CLE] Logique
[CONTEXTE] Orientation dans l'espace et le temps

[DUREE] 30 heures
[NOMBRE_UNITES] 4

[THEME] (optionnel — thème directeur libre)
[ENONCE] (optionnel — suggestion d'énoncé de recherche)

[DISCIPLINE2] (laisser vide pour planification standard — remplir pour interdisciplinaire, ex: Sciences)
[DISCIPLINE3] (optionnel — 3ème discipline, ex: Individus et sociétés)

[OBJECTIFS_COMMUNS]
(optionnel — objectifs communs aux disciplines, un par ligne)`;
  };

  const handlePrintSubjectUnits = () => {
    // Préparer le contenu HTML pour l'impression
    const printContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <title>Descriptifs des Unités - ${currentSubject} - ${currentGrade}</title>
        <style>
          @page { margin: 20mm; }
          body {
            font-family: 'Calibri', Arial, sans-serif;
            line-height: 1.6;
            color: #333;
            font-size: 11pt;
          }
          .header {
            text-align: center;
            margin-bottom: 20px;
            padding-bottom: 15px;
            border-bottom: 3px solid #3b82f6;
          }
          .header h1 {
            color: #1e40af;
            margin: 0 0 5px 0;
            font-size: 22pt;
          }
          .header h2 {
            color: #64748b;
            margin: 0;
            font-size: 14pt;
            font-weight: normal;
          }
          .unit {
            page-break-inside: avoid;
            margin-bottom: 25px;
            padding: 15px;
            border: 2px solid #3b82f6;
            border-radius: 8px;
            background: #f8fafc;
          }
          .unit-title {
            background: #3b82f6;
            color: white;
            padding: 8px 12px;
            margin: -15px -15px 15px -15px;
            border-radius: 6px 6px 0 0;
            font-size: 14pt;
            font-weight: bold;
          }
          .section {
            margin-bottom: 12px;
          }
          .section-label {
            font-weight: bold;
            color: #475569;
            font-size: 10pt;
            text-transform: uppercase;
            margin-bottom: 4px;
          }
          .section-content {
            color: #334155;
            padding-left: 10px;
          }
          .criteria-badges {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
            margin-top: 4px;
          }
          .criteria-badge {
            display: inline-block;
            background: #dbeafe;
            color: #1e40af;
            padding: 3px 10px;
            border-radius: 12px;
            font-size: 9pt;
            font-weight: bold;
          }
          .chapters {
            white-space: pre-line;
            font-size: 10pt;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <h1>📚 Descriptifs des Unités</h1>
          <h2>${currentSubject} - ${currentGrade}</h2>
        </div>
        ${filteredPlans.map((plan, index) => `
          <div class="unit">
            <div class="unit-title">Unité ${index + 1} : ${plan.title || 'Sans titre'}</div>
            
            ${plan.statementOfInquiry ? `
              <div class="section">
                <div class="section-label">📌 Énoncé de recherche</div>
                <div class="section-content">"${plan.statementOfInquiry}"</div>
              </div>
            ` : ''}
            
            ${plan.chapters ? `
              <div class="section">
                <div class="section-label">📖 Chapitres inclus</div>
                <div class="section-content chapters">${plan.chapters}</div>
              </div>
            ` : ''}
            
            <div class="section">
              <div class="section-label">🔑 Concept clé</div>
              <div class="section-content">${plan.keyConcept || 'Non défini'}</div>
            </div>
            
            ${plan.relatedConcepts && plan.relatedConcepts.length > 0 ? `
              <div class="section">
                <div class="section-label">🔗 Concepts connexes</div>
                <div class="section-content">${plan.relatedConcepts.join(', ')}</div>
              </div>
            ` : ''}
            
            ${plan.globalContext ? `
              <div class="section">
                <div class="section-label">🌍 Contexte mondial</div>
                <div class="section-content">${plan.globalContext}</div>
              </div>
            ` : ''}
            
            ${plan.duration ? `
              <div class="section">
                <div class="section-label">⏱️ Durée</div>
                <div class="section-content">${plan.duration}</div>
              </div>
            ` : ''}
            
            ${plan.assessments && plan.assessments.length > 0 ? `
              <div class="section">
                <div class="section-label">🎯 Critères d'évaluation</div>
                <div class="criteria-badges">
                  ${plan.assessments.map(a => `
                    <span class="criteria-badge">Critère ${a.criterion}: ${a.criterionName} (${a.maxPoints}pts)</span>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </div>
        `).join('')}
      </body>
      </html>
    `;

    // Créer une fenêtre d'impression
    const printWindow = window.open('', '', 'width=800,height=600');
    if (printWindow) {
      printWindow.document.write(printContent);
      printWindow.document.close();
      printWindow.focus();
      setTimeout(() => {
        printWindow.print();
        printWindow.close();
      }, 250);
    } else {
      alert('Impossible d\'ouvrir la fenêtre d\'impression. Veuillez autoriser les pop-ups.');
    }
  };

  return (
    <>
      {/* Styles d'impression */}
      <style>{`
        @media print {
          /* Masquer les boutons et éléments non nécessaires */
          button, .no-print {
            display: none !important;
          }
          
          /* Ajuster les marges pour l'impression */
          body {
            margin: 0;
            padding: 20px;
          }
          
          /* Optimiser l'affichage des cartes */
          .print-card {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          
          /* Garder les couleurs pour l'impression */
          * {
            -webkit-print-color-adjust: exact;
            print-color-adjust: exact;
          }
          
          /* Réduire les ombres pour économiser l'encre */
          .shadow-sm, .shadow-md, .shadow-lg {
            box-shadow: none !important;
            border: 1px solid #e2e8f0 !important;
          }
        }
      `}</style>
      
      <div className="max-w-7xl mx-auto p-6 space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-end bg-gradient-to-r from-slate-800 via-blue-900 to-indigo-900 rounded-2xl px-6 py-5 mb-2 gap-4 shadow-xl">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-2xl bg-white/10 shadow-lg overflow-hidden border-2 border-white/20 flex-shrink-0">
             <img 
                src="/logo-alkawtar.png" 
                alt="Logo Al Kawthar" 
                className="w-full h-full object-contain p-1"
                onError={(e) => e.currentTarget.style.display = 'none'}
             />
          </div>
          <div>
            <h1 className="text-2xl font-black text-white tracking-tight">Planificateur PEI — {currentGrade}</h1>
            <div className="flex items-center gap-2 text-blue-200 mt-0.5">
              <FileText size={14} />
              <span className="font-semibold text-sm">{currentSubject}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
             <button 
              onClick={onLogout}
              className="flex items-center gap-2 bg-white/10 hover:bg-white/20 text-white border border-white/20 px-4 py-3 rounded-xl font-semibold shadow transition"
              title="Changer de matière/classe"
            >
              <ArrowLeft size={20} />
              Retour
            </button>
             {/* ── Bouton Overview (toutes les années) ─────────────────────── */}
             {overviewCompletionStatus && (
               <div className="relative group">
                 <button
                   onClick={overviewCompletionStatus.complete ? handleExportOverview : undefined}
                   disabled={isOverviewExporting || isCheckingCompletion || !overviewCompletionStatus.complete}
                   className={`flex items-center gap-2 px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5 ${
                     overviewCompletionStatus.complete
                       ? 'bg-orange-500 hover:bg-orange-600 text-white cursor-pointer'
                       : 'bg-gray-300 text-gray-500 cursor-not-allowed opacity-60'
                   } disabled:cursor-not-allowed`}
                   title={
                     overviewCompletionStatus.complete
                       ? 'Générer le document Overview complet (toutes les années PEI)'
                       : `Overview indisponible — années manquantes : ${overviewCompletionStatus.gradesMissing.join(', ')}`
                   }
                 >
                   {isOverviewExporting ? (
                     <><Loader2 className="animate-spin" size={20} />Overview...</>
                   ) : (
                     <><Globe size={20} />Overview</>  
                   )}
                 </button>
                 {/* Tooltip avec le statut de complétude */}
                 {!overviewCompletionStatus.complete && (
                   <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 hidden group-hover:block w-64">
                     <div className="bg-slate-800 text-white text-xs rounded-lg p-3 shadow-xl">
                       <p className="font-bold mb-1">📊 Progression de la matière</p>
                       <p className="text-green-300">✅ Complétés : {overviewCompletionStatus.gradesWithPlans.join(', ') || 'Aucun'}</p>
                       <p className="text-red-300">❌ Manquants : {overviewCompletionStatus.gradesMissing.join(', ')}</p>
                       <p className="mt-2 text-slate-300 italic">Complétez toutes les années pour activer l'Overview.</p>
                     </div>
                   </div>
                 )}
               </div>
             )}
             {filteredPlans.length > 0 && (
               <button 
                 onClick={handlePrintSubjectUnits}
                 className="flex items-center gap-2 bg-white/15 hover:bg-white/25 text-white border border-white/20 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
                 title="Imprimer les descriptifs des unités"
               >
                 <Printer size={20} />
                 Imprimer Descriptifs
               </button>
             )}
             <button 
               onClick={handleExportConsolidated}
               disabled={exportingId === 'consolidated'}
               className="flex items-center gap-2 bg-emerald-500/80 hover:bg-emerald-500 text-white border border-emerald-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
               title="Exporter toutes les matières de cette classe en un seul document"
             >
               {exportingId === 'consolidated' ? (
                 <>
                   <Loader2 className="animate-spin" size={20} />
                   Export...
                 </>
               ) : (
                 <>
                   <BookOpen size={20} />
                   Export Classe Complète
                 </>
               )}
             </button>
             {/* Formulaire Drive, SEA, Interdisciplinaire disponibles depuis HomeScreen uniquement */}
             <button 
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-2 bg-violet-500/80 hover:bg-violet-500 text-white border border-violet-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
            >
              <Layers size={20} />
              Planification Annuelle
            </button>
             {/* ── Bouton Objectifs IB (éditeur de critères) ─────── */}
             <button
               onClick={() => setIsCriteriaEditorOpen(true)}
               className="flex items-center gap-2 bg-indigo-500/80 hover:bg-indigo-500 text-white border border-indigo-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
               title={`Configurer les critères IB officiels pour ${currentSubject} — ${currentGrade}`}
             >
               <BookOpen size={20} />
               Objectifs IB
             </button>
             {/* ── Bouton Calculateur d'heures ──────────────────── */}
             <button
               onClick={() => setIsHoursCalculatorOpen(true)}
               className="flex items-center gap-2 bg-teal-500/80 hover:bg-teal-500 text-white border border-teal-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
               title="Calculer le volume horaire annuel et vérifier la conformité IB (50h minimum)"
             >
               <Clock size={20} />
               Heures
             </button>
             {/* ── Bouton Refaire toutes les unités ─ admin seulement ─── */}
             {isAdmin && plans.length > 0 && (
               <button
                 onClick={handleOpenRegenAll}
                 className="flex items-center gap-2 bg-amber-500/80 hover:bg-amber-500 text-white border border-amber-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
                 title="Refaire toutes les unités de l'année (basé sur titre + énoncé + chapitres + critères)"
               >
                 <RotateCcw size={20} />
                 Refaire Toutes les Unités
               </button>
             )}
            {/* ── Bouton Export Excel Global ─ admin seulement ─── */}
            {isAdmin && (
              <button
                onClick={handleExportAllExcel}
                disabled={isExportingExcel}
                className="flex items-center gap-2 bg-green-500/80 hover:bg-green-500 text-white border border-green-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5 disabled:opacity-70"
                title="Télécharger toutes les données en format Excel/CSV"
              >
                {isExportingExcel ? <Loader2 className="animate-spin" size={20} /> : <Table size={20} />}
                Export CSV
              </button>
            )}
            {/* ── Bouton Export ZIP Plans Word Classe ─── */}
            {plans.length > 0 && (
              <button
                onClick={handleExportClassZip}
                disabled={isExportingZip}
                className="flex items-center gap-2 bg-gradient-to-r from-rose-600 to-pink-600 hover:from-rose-500 hover:to-pink-500 text-white border border-rose-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5 disabled:opacity-70"
                title="Télécharger tous les plans d'unités de cette classe sous forme d'archive ZIP (contenant tous les fichiers Word .docx)"
              >
                {isExportingZip ? <Loader2 className="animate-spin" size={20} /> : <FileArchive size={20} />}
                {isExportingZip && zipProgress
                  ? `Export Word (${zipProgress.current}/${zipProgress.total})...`
                  : `ZIP Plans Word (${plans.length})`}
              </button>
            )}
            {/* ── Bouton Demander une modification ─ enseignant seulement ─ */}
            {!isAdmin && plans.length > 0 && (
              <button
                onClick={() => {
                  setModRequestPlan(plans[0]);
                  setShowModRequestModal(true);
                }}
                className="flex items-center gap-2 bg-blue-500/80 hover:bg-blue-500 text-white border border-blue-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
                title="Envoyer une demande de modification à l'administrateur"
              >
                <PenLine size={20} />
                Demander une modification
              </button>
            )}
            {/* ── Bouton Ajouter une unité ─ admin seulement ─── */}
            {isAdmin && (
              <button 
                onClick={handleOpenAddUnit}
                className="flex items-center gap-2 bg-blue-500/80 hover:bg-blue-500 text-white border border-blue-400/30 px-5 py-3 rounded-xl font-semibold shadow transition hover:-translate-y-0.5"
              >
                <Plus size={20} />
                Ajouter une unité
              </button>
            )}
        </div>
      </header>

      {/* Stats Section */}
      {plans.length > 0 && (() => {
        const ph = getPlannedHoursForSubjectGrade();
        const hasHoursData = ph > 0;
        const hoursOk = ph >= 50;
        return (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Hours alert banner — only shown when durations are parsed */}
            {hasHoursData && (
              <div className={`md:col-span-3 rounded-xl px-4 py-3 flex items-center justify-between gap-4 border text-sm ${
                hoursOk
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
                  : 'bg-amber-50 border-amber-200 text-amber-700'
              }`}>
                <div className="flex items-center gap-2">
                  {hoursOk
                    ? <CheckCircle size={16} className="flex-shrink-0 text-emerald-500" />
                    : <AlertTriangle size={16} className="flex-shrink-0 text-amber-500" />}
                  <span>
                    <strong>Volume horaire planifié : {ph.toFixed(1)}h</strong>
                    {hoursOk
                      ? ` — Conforme IB (≥ 50h) ✅`
                      : ` — Il manque ${(50 - ph).toFixed(1)}h pour atteindre le minimum IB de 50h ⚠️`}
                  </span>
                </div>
                <button
                  onClick={() => setIsHoursCalculatorOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition whitespace-nowrap flex-shrink-0 bg-white hover:bg-teal-50 border-teal-300 text-teal-700"
                >
                  <Clock size={13} /> Calculateur
                </button>
              </div>
            )}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-6 rounded-2xl shadow-sm border border-blue-100 flex flex-col hover:shadow-md transition-all duration-300">
                <h3 className="text-sm font-bold text-blue-400 uppercase tracking-wider mb-4">Unités pour {currentGrade}</h3>
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-blue-100 rounded-2xl text-blue-600 shadow-sm">
                        <FileText size={32} />
                    </div>
                    <span className="text-5xl font-black text-blue-700">{plans.length}</span>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex flex-col md:col-span-2 hover:shadow-md transition-all duration-300">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">Répartition par matière</h3>
                <div className="h-40 w-full">
                     <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={chartData} layout="vertical" margin={{left: 40}}>
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={150} tick={{fontSize: 12}} />
                            <Tooltip cursor={{fill: 'transparent'}} />
                            <Bar dataKey="value" fill="#3b82f6" radius={[0, 4, 4, 0]} barSize={20} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </section>
        );
      })()}

      {/* Plans List */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-extrabold text-slate-800 flex items-center gap-2">
                <Calendar size={20} className="text-indigo-500" />
                Unités planifiées
                {plans.length > 0 && (
                  <span className="ml-1 bg-indigo-100 text-indigo-700 text-sm font-bold px-2.5 py-0.5 rounded-full">
                    {plans.length}
                  </span>
                )}
            </h2>

            {/* Filters */}
            {plans.length > 0 && (
                <div className="flex flex-wrap gap-3 items-center">
                    <div className="flex items-center gap-2 text-slate-500 text-sm mr-1">
                        <Filter size={16} />
                        <span>Filtrer:</span>
                    </div>
                    <select 
                        value={filterSubject}
                        onChange={(e) => setFilterSubject(e.target.value)}
                        className="bg-white border border-slate-300 text-slate-700 py-2 px-3 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                        <option value="">Toutes les matières</option>
                        {uniqueSubjects.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>

                    {filterSubject && (
                        <button 
                            onClick={() => setFilterSubject('')}
                            className="text-slate-500 hover:text-red-500 transition p-1 rounded-full hover:bg-red-50"
                            title="Effacer"
                        >
                            <X size={18} />
                        </button>
                    )}
                </div>
            )}
        </div>
        
        {plans.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-xl border border-dashed border-slate-300 shadow-sm">
                <div className="text-slate-400 mb-4 mx-auto w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center">
                    <Layers size={32} />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Aucune unité pour {currentGrade}</h3>
                <p className="text-slate-500 mb-8 max-w-md mx-auto">
                   C'est le moment idéal pour générer automatiquement tout votre programme annuel en une seule fois.
                </p>
                <button 
                  onClick={() => setIsBulkModalOpen(true)}
                  className="bg-violet-600 hover:bg-violet-700 text-white px-6 py-3 rounded-lg font-bold shadow-md transition inline-flex items-center gap-2"
                >
                  <Layers size={20} />
                  Lancer la Planification Annuelle
                </button>
                <div className="mt-4">
                     <span className="text-slate-400 text-sm">ou</span>
                     <button onClick={handleOpenAddUnit} className="ml-2 text-blue-600 hover:underline text-sm">ajouter une unité (auto ou manuel)</button>
                </div>
            </div>
        ) : filteredPlans.length === 0 ? (
            <div className="text-center py-12 bg-white rounded-xl border border-dashed border-slate-300">
                <p className="text-slate-500 mb-2">Aucune unité ne correspond à vos filtres.</p>
                <button 
                  onClick={() => setFilterSubject('')}
                  className="text-blue-600 font-medium hover:underline text-sm"
                >
                  Effacer les filtres
                </button>
            </div>
        ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {filteredPlans.map(plan => (
                    <div key={plan.id} className="print-card bg-white p-6 rounded-2xl shadow-sm border border-slate-200 hover:shadow-xl hover:-translate-y-1 hover:border-blue-200 transition-all duration-300 group flex flex-col h-full relative overflow-hidden">
                      {/* animated gradient shimmer on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-blue-50/0 via-indigo-50/0 to-violet-50/0 group-hover:from-blue-50/60 group-hover:via-indigo-50/30 group-hover:to-violet-50/20 transition-all duration-500 rounded-2xl pointer-events-none" />
                        <div className="relative z-10 flex justify-between items-start mb-4">
                            <div>
                                <span className="inline-block px-2 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded mb-2">
                                    {plan.subject || 'Sans matière'}
                                </span>
                                <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition">{plan.title || 'Unité sans titre'}</h3>
                                <p className="text-sm text-slate-500">{plan.gradeLevel} • {plan.duration}</p>
                            </div>
                            <div className="flex flex-col gap-2">
                                {isAdmin ? (
                                  <>
                                    <button 
                                        onClick={() => handleOpenEditUnit(plan)}
                                        className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition ml-auto"
                                        title="Modifier l'unité"
                                    >
                                        <Edit2 size={18} />
                                    </button>
                                    <button 
                                        onClick={() => onDelete(plan.id)}
                                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition ml-auto"
                                        title="Supprimer"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    onClick={() => { setModRequestPlan(plan); setShowModRequestModal(true); }}
                                    className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition ml-auto"
                                    title="Demander une modification à l'administrateur"
                                  >
                                    <PenLine size={18} />
                                  </button>
                                )}
                            </div>
                        </div>
                        
                        <div className="relative z-10 flex-grow space-y-3">
                            {plan.statementOfInquiry ? (
                                <div className="bg-slate-50 p-3 rounded-lg">
                                    <p className="text-xs font-bold text-slate-400 uppercase mb-1">Énoncé de recherche</p>
                                    <p className="text-sm text-slate-700 italic line-clamp-2">"{plan.statementOfInquiry}"</p>
                                </div>
                            ) : (
                                <div className="h-16 bg-slate-50 rounded-lg flex items-center justify-center text-xs text-slate-400 italic">
                                    Pas d'énoncé défini
                                </div>
                            )}
                            
                            {/* Affichage des chapitres inclus */}
                            {plan.chapters && (
                                <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
                                    <p className="text-xs font-bold text-amber-900 mb-2 flex items-center gap-1">
                                        <BookOpen size={14} />
                                        Chapitres inclus
                                    </p>
                                    <ul className="text-xs text-slate-800 space-y-1 ml-4">
                                        {plan.chapters.split('\n').filter(line => line.trim()).map((chapter, idx) => (
                                            <li key={idx} className="list-disc">
                                                {chapter.trim().replace(/^-\s*/, '')}
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            )}
                            
                            {/* Affichage des critères d'évaluation */}
                            {plan.assessments && plan.assessments.length > 0 && (
                                <div className="bg-purple-50 p-3 rounded-lg border border-purple-100">
                                    <p className="text-xs font-bold text-purple-900 uppercase mb-2">Critères d'évaluation</p>
                                    <div className="flex flex-wrap gap-2">
                                        {plan.assessments.map((assessment, idx) => (
                                            <span 
                                                key={idx}
                                                className="inline-flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-800 rounded-full text-xs font-semibold"
                                                title={assessment.criterionName}
                                            >
                                                Critère {assessment.criterion}
                                                <span className="text-purple-600">({assessment.maxPoints}pts)</span>
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="relative z-10 flex items-center justify-between text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button 
                                    onClick={() => handleExportPlan(plan)}
                                    className="flex items-center gap-1 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md transition font-medium"
                                    disabled={exportingId === `plan-${plan.id}`}
                                    title="Télécharger ce plan d'unité sous format Word (.docx)"
                                >
                                    {exportingId === `plan-${plan.id}` ? <Loader2 className="animate-spin" size={14}/> : <FileText size={14}/>}
                                    Plan Word
                                </button>
                                <button 
                                    onClick={() => handleExportAssessment(plan)}
                                    className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-100 transition"
                                    disabled={exportingId === `eval-${plan.id}`}
                                    title="Exporter les évaluations critériées (ZIP Word)"
                                >
                                    {exportingId === `eval-${plan.id}` ? <Loader2 className="animate-spin" size={14}/> : <FileArchive size={14}/>}
                                    Évals (Zip)
                                </button>
                                <button 
                                    onClick={() => handlePrintUnit(plan)}
                                    className="flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-1 rounded hover:bg-violet-100 transition"
                                    title="Imprimer cette unité"
                                >
                                    <Printer size={14}/>
                                    Imprimer
                                </button>
                                {/* ── Bouton Voir / Éditer les évaluations critériées ── */}
                                {plan.assessments && plan.assessments.length > 0 && (
                                  <button
                                    onClick={() => setViewerPlan(plan)}
                                    className="flex items-center gap-1 bg-purple-50 text-purple-700 px-2 py-1 rounded hover:bg-purple-100 transition"
                                    title="Voir et modifier les évaluations critériées générées"
                                  >
                                    <Eye size={14}/>
                                    Voir Évals
                                  </button>
                                )}
                                {/* ── Boutons admin uniquement : Mise à jour Évals + Ajouter Détails ── */}
                                {isAdmin && (
                                  <>
                                    <button
                                        onClick={() => handleUpdateAssessments(plan)}
                                        disabled={updatingAssessmentId === plan.id}
                                        className="flex items-center gap-1 bg-amber-50 text-amber-700 px-2 py-1 rounded hover:bg-amber-100 transition disabled:opacity-50"
                                        title="Mettre à jour les évaluations critériées selon les objectifs spécifiques enregistrés (titre et contenu inchangés)"
                                    >
                                        {updatingAssessmentId === plan.id
                                          ? <Loader2 className="animate-spin" size={14}/>
                                          : <RefreshCw size={14}/>}
                                        Mise à jour Évals
                                    </button>
                                    <button
                                        onClick={() => {
                                          setDetailUpdatePlan(plan);
                                          setIsDetailUpdateMode(true);
                                        }}
                                        className="flex items-center gap-1 bg-teal-50 text-teal-700 px-2 py-1 rounded hover:bg-teal-100 transition"
                                        title="Ajouter des détails (séances, contexte élèves, réflexion, différenciation) sans modifier titre/objectifs/critères/ATL"
                                    >
                                        <PenLine size={14}/>
                                        Ajouter Détails
                                    </button>
                                  </>
                                )}
                                {/* ── Bouton Demander une modification ─ enseignant seulement ─ */}
                                {!isAdmin && (
                                  <button
                                    onClick={() => { setModRequestPlan(plan); setShowModRequestModal(true); }}
                                    className="flex items-center gap-1 bg-blue-50 text-blue-700 px-2 py-1 rounded hover:bg-blue-100 transition"
                                    title="Demander une modification à l'administrateur"
                                  >
                                    <PenLine size={14}/>
                                    Demander modif.
                                  </button>
                                )}
                                {/* ── Bouton Upload travaux élèves ── */}
                                <button
                                    onClick={() => {
                                      setUploadModalPlan(plan);
                                      setUploadStudentName('');
                                      setUploadCriterion(plan.assessments?.[0]?.criterion ? `Critere_${plan.assessments[0].criterion}` : '');
                                      setUploadFile(null);
                                    }}
                                    className="flex items-center gap-1 bg-sky-50 text-sky-700 px-2 py-1 rounded hover:bg-sky-100 transition"
                                    title="Déposer le travail d'un élève pour cette évaluation critériée"
                                >
                                    <Upload size={14}/>
                                    Travaux élèves
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════
          PANNEAU : UNITÉS INTERDISCIPLINAIRES SAUVEGARDÉES
          ═══════════════════════════════════════════════════════════════════ */}
      {savedInterUnits.length > 0 && (
        <section className="bg-white rounded-xl border border-fuchsia-200 shadow-sm overflow-hidden">
          <div
            className="flex items-center justify-between p-4 cursor-pointer bg-gradient-to-r from-fuchsia-50 to-purple-50 hover:from-fuchsia-100 hover:to-purple-100 transition"
            onClick={() => setShowSavedInter(v => !v)}
          >
            <h2 className="text-base font-bold text-fuchsia-800 flex items-center gap-2">
              <GitMerge size={18} className="text-fuchsia-600" />
              Unités interdisciplinaires sauvegardées
              <span className="ml-2 bg-fuchsia-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {savedInterUnits.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              {/* Objectifs IB pour l'interdisciplinaire */}
              <button
                onClick={e => {
                  e.stopPropagation();
                  setInterCriteriaSubject('Interdisciplinaire');
                  setInterCriteriaGrade(currentGrade);
                  setIsInterCriteriaEditorOpen(true);
                }}
                className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow transition"
                title="Configurer les objectifs IB pour les unités interdisciplinaires"
              >
                <BookOpen size={12} />
                Objectifs IB
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleExportCompleteInterPlan(); }}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-700 hover:bg-purple-800 text-white rounded-lg text-xs font-semibold shadow transition"
                title="Télécharger le plan complet de toutes les unités interdisciplinaires (document détaillé)"
              >
                <FileText size={12} />
                Plan complet
              </button>
              <button
                onClick={e => { e.stopPropagation(); handleExportInterOverview(); }}
                disabled={isExportingInterOverview}
                className="flex items-center gap-1 px-3 py-1.5 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-60"
                title="Télécharger le tableau synthèse interdisciplinaire (toutes classes)"
              >
                {isExportingInterOverview ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Tableau synthèse
              </button>
              <span className="text-fuchsia-500 text-xs font-medium">
                {showSavedInter ? '▲ Réduire' : '▼ Voir toutes'}
              </span>
            </div>
          </div>

          {showSavedInter && (
            <div className="p-4 space-y-4">
              {/* Grouper par classe */}
              {['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'].map(grade => {
                const gradeUnits = savedInterUnits.filter(u => u.grade === grade);
                if (gradeUnits.length === 0) return null;
                return (
                  <div key={grade}>
                    <h3 className="text-xs font-bold text-fuchsia-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span className="bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded">{grade}</span>
                      <span className="text-slate-400 font-normal">— {gradeUnits.length} unité(s)</span>
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {gradeUnits.map(unit => (
                        <div key={unit.id} className="border border-fuchsia-200 rounded-xl p-4 bg-fuchsia-50 space-y-3">
                          {/* En-tête de l'unité */}
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-fuchsia-600 font-semibold uppercase tracking-wide mb-0.5">
                                {unit.disciplines.join(' + ')}
                              </p>
                              <h4 className="text-sm font-bold text-slate-800 leading-snug">{unit.title}</h4>
                              <p className="text-xs text-slate-500 mt-0.5">{unit.duration}</p>
                              {unit.teachers && unit.teachers.length > 0 && (
                                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                  <User size={10} />
                                  {unit.disciplines.map((d, i) => unit.teachers[i] ? `${d}: ${unit.teachers[i]}` : null).filter(Boolean).join(' | ')}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0 flex-wrap justify-end">
                              <button
                                onClick={() => {
                                  setInterCriteriaSubject(unit.disciplines.join(' + '));
                                  setInterCriteriaGrade(unit.grade || currentGrade);
                                  setIsInterCriteriaEditorOpen(true);
                                }}
                                className="flex items-center gap-1 px-2 py-1 bg-white border border-indigo-300 text-indigo-700 rounded text-xs font-medium hover:bg-indigo-50 transition"
                                title="Configurer les objectifs IB pour ce thème interdisciplinaire"
                              >
                                <BookOpen size={12} /> Obj. IB
                              </button>
                              <button
                                onClick={() => handleExportInterdisciplinaryWord(unit)}
                                className="flex items-center gap-1 px-2 py-1 bg-white border border-fuchsia-300 text-fuchsia-700 rounded text-xs font-medium hover:bg-fuchsia-50 transition"
                                title="Exporter le plan IB en Word"
                              >
                                <Download size={12} /> Word
                              </button>
                              <button
                                onClick={() => handleExportInterdisciplinaryAssessments(unit)}
                                className="flex items-center gap-1 px-2 py-1 bg-white border border-violet-300 text-violet-700 rounded text-xs font-medium hover:bg-violet-50 transition"
                                title="Télécharger les évaluations critériées A/B/C (ZIP) — même modèle que les unités classiques"
                              >
                                <FileArchive size={12} /> Évaluations
                              </button>
                              <button
                                onClick={() => handleDeleteSavedInterUnit(unit.id)}
                                className="flex items-center gap-1 px-2 py-1 bg-white border border-red-200 text-red-500 rounded text-xs font-medium hover:bg-red-50 transition"
                                title="Supprimer"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Énoncé de recherche */}
                          {unit.statementOfInquiry && (
                            <div className="bg-amber-50 border-l-3 border-amber-400 px-3 py-2 rounded text-xs italic text-slate-700">
                              📌 {unit.statementOfInquiry}
                            </div>
                          )}

                          {/* But de l'intégration */}
                          {unit.integrationPurpose && (
                            <div className="bg-blue-50 rounded p-2 border border-blue-100">
                              <p className="text-xs font-bold text-blue-700 mb-0.5">🔗 But de l'intégration</p>
                              <p className="text-xs text-slate-600 line-clamp-2">{unit.integrationPurpose}</p>
                            </div>
                          )}

                          {/* Critères d'évaluation interdisciplinaires */}
                          {unit.summativeCriteria && unit.summativeCriteria.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-fuchsia-800 uppercase mb-1">
                                🎯 Critères interdisciplinaires (alignés sur le thème)
                              </p>
                              <div className="space-y-1">
                                {unit.summativeCriteria.map(c => (
                                  <div key={c.criterion} className="bg-white border border-fuchsia-200 rounded px-2 py-1.5">
                                    <div className="flex items-center justify-between mb-0.5">
                                      <span className="text-xs font-bold text-fuchsia-700">
                                        Critère {c.criterion} : {c.name}
                                      </span>
                                      <span className="text-xs bg-fuchsia-100 text-fuchsia-700 px-1.5 rounded font-bold">/8</span>
                                    </div>
                                    <p className="text-xs text-slate-500">{c.discipline}</p>
                                    {c.strands && c.strands.length > 0 && (
                                      <ul className="mt-1 space-y-0.5">
                                        {c.strands.slice(0, 3).map((s, si) => (
                                          <li key={si} className="text-xs text-slate-600 truncate">• {s}</li>
                                        ))}
                                      </ul>
                                    )}
                                    {c.task && (
                                      <p className="text-xs text-slate-500 mt-1 italic line-clamp-2">
                                        📝 {c.task}
                                      </p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Objectifs communs */}
                          {unit.sharedObjectives && unit.sharedObjectives.length > 0 && (
                            <div className="bg-green-50 border border-green-100 rounded p-2">
                              <p className="text-xs font-bold text-green-700 mb-1">🎓 Objectifs communs aux disciplines</p>
                              <ul className="space-y-0.5">
                                {unit.sharedObjectives.map((obj, i) => (
                                  <li key={i} className="text-xs text-slate-600">• {obj}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Tâches par discipline */}
                          {unit.disciplineBases && unit.disciplineBases.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-600 uppercase mb-1">📚 Tâches par discipline</p>
                              <div className="space-y-1">
                                {unit.disciplineBases.map((db, dbi) => (
                                  <div key={dbi} className="bg-white border border-slate-200 rounded px-2 py-1">
                                    <p className="text-xs font-bold text-slate-700">
                                      {db.discipline}
                                      {db.teacher && <span className="font-normal text-slate-400"> — {db.teacher}</span>}
                                    </p>
                                    {db.ibObjective && (
                                      <p className="text-xs text-slate-500 line-clamp-1">🎯 {db.ibObjective}</p>
                                    )}
                                    {db.summativeAssessment && (
                                      <p className="text-xs text-slate-500 line-clamp-1 italic">📋 {db.summativeAssessment}</p>
                                    )}
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}

                          {/* Phases */}
                          {unit.phases && (
                            <div className="grid grid-cols-3 gap-1">
                              {[
                                { label: '🔍 RECHERCHE', color: 'blue', text: unit.phases.recherche },
                                { label: '⚡ ACTION', color: 'green', text: unit.phases.action },
                                { label: '💡 RÉFLEXION', color: 'purple', text: unit.phases.reflexion },
                              ].map(p => (
                                <div key={p.label} className={`bg-${p.color}-50 rounded p-1.5 border border-${p.color}-100`}>
                                  <p className={`text-xs font-bold text-${p.color}-700 mb-0.5`}>{p.label}</p>
                                  <p className="text-xs text-slate-600 line-clamp-2">{p.text}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          PANNEAU : SERVICE ET ACTION (SEA) SAUVEGARDÉS
          ═══════════════════════════════════════════════════════════════════ */}
      {savedSEAPlans.length > 0 && (
        <section className="bg-white rounded-xl border border-rose-200 shadow-sm overflow-hidden">
          <div
            className="flex items-center justify-between p-4 cursor-pointer bg-gradient-to-r from-rose-50 to-pink-50 hover:from-rose-100 hover:to-pink-100 transition"
            onClick={() => setShowSavedSEA(v => !v)}
          >
            <h2 className="text-base font-bold text-rose-800 flex items-center gap-2">
              <Heart size={18} className="text-rose-600" />
              Planification Service et Action (SEA)
              <span className="ml-2 bg-rose-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                {savedSEAPlans.length}
              </span>
            </h2>
            <div className="flex items-center gap-3">
              <button
                onClick={e => { e.stopPropagation(); handleExportSEAOverview(); }}
                disabled={isExportingSEAOverview}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-semibold shadow transition disabled:opacity-60"
                title="Télécharger le tableau Planification Service et Action (toutes classes)"
              >
                {isExportingSEAOverview ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}
                Tableau SEA
              </button>
              <span className="text-rose-500 text-xs font-medium">
                {showSavedSEA ? '▲ Réduire' : '▼ Voir tous'}
              </span>
            </div>
          </div>

          {showSavedSEA && (
            <div className="p-4 space-y-4">
              {/* Grouper par classe */}
              {['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'].map(grade => {
                const gradeSeaPlans = savedSEAPlans.filter(s => s.grade === grade);
                if (gradeSeaPlans.length === 0) return null;
                return (
                  <div key={grade}>
                    <h3 className="text-xs font-bold text-rose-700 uppercase tracking-wider mb-2 flex items-center gap-2">
                      <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded">{grade}</span>
                      <span className="text-slate-400 font-normal">— {gradeSeaPlans.length} projet(s)</span>
                    </h3>
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
                      {gradeSeaPlans.map(sea => (
                        <div key={sea.id} className="border border-rose-200 rounded-xl p-4 bg-rose-50 space-y-2">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="text-xs text-rose-600 font-semibold uppercase tracking-wide mb-0.5">
                                {sea.subject} — {sea.grade}
                              </p>
                              <h4 className="text-sm font-bold text-slate-800 leading-snug">{sea.title}</h4>
                              <p className="text-xs text-slate-500 mt-0.5 italic">Basé sur : {sea.sourceUnitTitle}</p>
                              {sea.teacherName && (
                                <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                                  <User size={10} /> {sea.teacherName}
                                </p>
                              )}
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <button
                                onClick={() => exportSEAPlanToWord(sea)}
                                className="flex items-center gap-1 px-2 py-1 bg-white border border-rose-300 text-rose-700 rounded text-xs font-medium hover:bg-rose-50 transition"
                                title="Exporter en Word"
                              >
                                <Download size={12} /> Word
                              </button>
                              <button
                                onClick={() => handleDeleteSEAPlan(sea.id)}
                                className="flex items-center gap-1 px-2 py-1 bg-white border border-red-200 text-red-500 rounded text-xs font-medium hover:bg-red-50 transition"
                              >
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>

                          {/* Type d'action */}
                          <div className="flex flex-wrap gap-1">
                            {sea.actionTypes.map(t => (
                              <span key={t} className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">{t}</span>
                            ))}
                          </div>

                          {/* Description courte */}
                          {sea.projectDescription && (
                            <p className="text-xs text-slate-600 line-clamp-3">{sea.projectDescription}</p>
                          )}

                          {/* Lien avec l'unité */}
                          {sea.linkToUnit && (
                            <div className="bg-blue-50 border border-blue-100 rounded p-2">
                              <p className="text-xs font-bold text-blue-700 mb-0.5">🔗 Lien avec l'unité</p>
                              <p className="text-xs text-slate-600 line-clamp-2">{sea.linkToUnit}</p>
                            </div>
                          )}

                          {/* Objectifs d'apprentissage IB sélectionnés */}
                          {sea.learningOutcomes.filter(lo => lo.selected).length > 0 && (
                            <div className="bg-green-50 border border-green-100 rounded p-2">
                              <p className="text-xs font-bold text-green-700 mb-1">🎓 Objectifs IB sélectionnés</p>
                              <ul className="space-y-0.5">
                                {sea.learningOutcomes.filter(lo => lo.selected).map(lo => (
                                  <li key={lo.id} className="text-xs text-slate-600">• OA{lo.id}: {lo.text.substring(0, 60)}…</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {/* Compétences ATL */}
                          {sea.atlSkills.length > 0 && (
                            <div className="flex flex-wrap gap-1">
                              {sea.atlSkills.map((s, i) => (
                                <span key={i} className="text-xs bg-purple-50 text-purple-700 border border-purple-100 px-2 py-0.5 rounded">{s}</span>
                              ))}
                            </div>
                          )}

                          {/* Critères de réussite */}
                          {sea.successCriteria.length > 0 && (
                            <div>
                              <p className="text-xs font-bold text-slate-600 mb-1">✅ Critères de réussite</p>
                              <ul className="space-y-0.5">
                                {sea.successCriteria.slice(0, 2).map((c, i) => (
                                  <li key={i} className="text-xs text-slate-600">• {c.description}</li>
                                ))}
                              </ul>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* Bulk Modal */}
      {isBulkModalOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
           <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
              <div className="bg-violet-600 p-4 flex justify-between items-center text-white">
                 <h3 className="text-lg font-bold flex items-center gap-2">
                    <Layers size={20} />
                    Planification Annuelle : {currentGrade}
                 </h3>
                 <button onClick={() => setIsBulkModalOpen(false)} className="hover:bg-violet-700 p-1 rounded">
                    <X size={20} />
                 </button>
              </div>
              
              <div className="p-6 space-y-4">
                 <p className="text-slate-600 text-sm">
                    Collez le programme complet ci-dessous. L'IA va structurer 4 à 6 unités et générer tous les évaluations.
                 </p>
                 
                 <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Matière</label>
                        <input 
                            type="text" 
                            value={bulkSubject}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-slate-100 font-medium"
                            readOnly
                        />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">Niveau</label>
                        <input 
                            type="text" 
                            value={bulkGrade}
                            className="w-full p-2 border border-slate-300 rounded-lg text-sm bg-slate-100 font-medium"
                            readOnly
                        />
                    </div>
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Nom de l'enseignant(e)</label>
                    <input 
                        type="text" 
                        value={bulkTeacher}
                        onChange={(e) => setBulkTeacher(e.target.value)}
                        placeholder="ex: M. Dupont"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Liste des chapitres / Sujets</label>
                    <textarea 
                        value={bulkChapters}
                        onChange={(e) => setBulkChapters(e.target.value)}
                        placeholder="Collez ici le programme complet..."
                        className="w-full h-40 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                 </div>

                 <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Ressources</label>
                    <textarea 
                        value={bulkResources}
                        onChange={(e) => setBulkResources(e.target.value)}
                        placeholder="ex: Manuel page 45-60, Vidéo YouTube, etc."
                        className="w-full h-24 p-3 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-violet-500 outline-none"
                    />
                 </div>

                 <button 
                    onClick={handleBulkGenerate}
                    disabled={isBulkGenerating}
                    className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white rounded-lg font-bold flex items-center justify-center gap-2 transition disabled:opacity-70"
                 >
                    {isBulkGenerating ? (
                        <>
                            <Loader2 className="animate-spin" size={20} />
                            Analyse et structuration en cours (Ceci peut prendre 30s)...
                        </>
                    ) : (
                        <>
                            <Layers size={20} />
                            Générer les 4-6 Unités
                        </>
                    )}
                 </button>
              </div>
           </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODALE : UNITÉS INTERDISCIPLINAIRES
          ═══════════════════════════════════════════════════════════════════ */}
      {isInterdisciplinaryModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-fuchsia-600 to-purple-600 text-white p-6 rounded-t-2xl flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <GitMerge size={22} /> Unités Interdisciplinaires IB PEI
                </h2>
                <p className="text-fuchsia-100 text-sm mt-1">
                  Structure Recherche / Action / Réflexion — Critères A, B, C (chacun /8)
                </p>
              </div>
              <button onClick={() => { setIsInterdisciplinaryModalOpen(false); setInterStep('form'); setGeneratedInterUnits([]); }}
                className="text-white hover:text-fuchsia-200 transition">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {interStep === 'form' ? (
                <>
                  {/* Encart informatif */}
                  <div className="bg-fuchsia-50 border border-fuchsia-200 rounded-xl p-4 text-sm text-fuchsia-800">
                    <p className="font-semibold mb-1">📋 Rappel des normes IB pour les unités interdisciplinaires :</p>
                    <ul className="list-disc pl-4 space-y-1 text-fuchsia-700">
                      <li>Minimum <strong>2 unités par classe</strong></li>
                      <li>Collaboration entre <strong>au moins 2 disciplines</strong></li>
                      <li>Structure en 3 phases : <strong>Recherche → Action → Réflexion</strong></li>
                      <li>Énoncé de recherche <strong>déclaratif</strong> (15-35 mots), <strong>sans nommer les matières</strong></li>
                      <li>Critères d'évaluation <strong>A, B, C</strong> chacun <strong>sur 8 points</strong></li>
                    </ul>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Classe *</label>
                      <select value={interGrade} onChange={e => setInterGrade(e.target.value)}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none">
                        {['PEI 1','PEI 2','PEI 3','PEI 4','PEI 5'].map(g =>
                          <option key={g} value={g}>{g}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Nombre d'unités *</label>
                      <select value={interCount} onChange={e => setInterCount(Number(e.target.value))}
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none">
                        <option value={2}>2 unités (minimum requis)</option>
                        <option value={3}>3 unités</option>
                        <option value={4}>4 unités</option>
                      </select>
                    </div>
                  </div>

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                    <p className="text-sm font-bold text-slate-700">Disciplines collaboratrices *</p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Discipline 1 *</label>
                        <select value={interDiscipline1} onChange={e => setInterDiscipline1(e.target.value)}
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none bg-white">
                          <option value="">Choisir…</option>
                          {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                          <option value="Éducation physique et sportive">Éducation physique et sportive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Discipline 2 *</label>
                        <select value={interDiscipline2} onChange={e => setInterDiscipline2(e.target.value)}
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none bg-white">
                          <option value="">Choisir…</option>
                          {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                          <option value="Éducation physique et sportive">Éducation physique et sportive</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-slate-600 mb-1">Discipline 3 (optionnel)</label>
                        <select value={interDiscipline3} onChange={e => setInterDiscipline3(e.target.value)}
                          className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none bg-white">
                          <option value="">Aucune</option>
                          {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                          <option value="Éducation physique et sportive">Éducation physique et sportive</option>
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Enseignants */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Enseignant(e) discipline 1</label>
                      <input type="text" value={interTeacher1} onChange={e => setInterTeacher1(e.target.value)}
                        placeholder="ex: Mme Martin"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Enseignant(e) discipline 2</label>
                      <input type="text" value={interTeacher2} onChange={e => setInterTeacher2(e.target.value)}
                        placeholder="ex: M. Dupont"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none" />
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-slate-700 mb-1">Enseignant(e) discipline 3</label>
                      <input type="text" value={interTeacher3} onChange={e => setInterTeacher3(e.target.value)}
                        placeholder="ex: Mme Leclerc"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none" />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Thème directeur (optionnel)</label>
                    <input type="text" value={interTheme} onChange={e => setInterTheme(e.target.value)}
                      placeholder="ex: Développement durable, Identité et appartenance, Innovation…"
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none" />
                    <p className="text-xs text-slate-500 mt-1">Laissez vide pour laisser l'IA choisir librement.</p>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Objectifs communs aux disciplines (optionnel)
                      <span className="ml-1 text-slate-400 font-normal">— un par ligne</span>
                    </label>
                    <textarea value={interSharedObjectives} onChange={e => setInterSharedObjectives(e.target.value)}
                      rows={3}
                      placeholder="ex: Développer la pensée critique interdisciplinaire&#10;Analyser des phénomènes complexes sous plusieurs angles"
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-fuchsia-500 outline-none resize-none" />
                    <p className="text-xs text-slate-400 mt-1">Ces objectifs seront DIFFÉRENTS des objectifs spécifiques de chaque matière (norme IB).</p>
                  </div>

                  <button onClick={handleGenerateInterdisciplinary} disabled={isInterGenerating || !interDiscipline1 || !interDiscipline2}
                    className="w-full py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg">
                    {isInterGenerating ? (
                      <><Loader2 className="animate-spin" size={20} />Génération en cours (30-90s)…</>
                    ) : (
                      <><GitMerge size={20} />Générer {interCount} unité(s) interdisciplinaire(s) IB</>
                    )}
                  </button>
                </>
              ) : (
                /* ── Résultats ── */
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-800 text-lg">
                      ✅ {generatedInterUnits.length} unité(s) générée(s)
                    </h3>
                    <button onClick={() => setInterStep('form')}
                      className="text-sm text-fuchsia-600 hover:underline flex items-center gap-1">
                      <ArrowLeft size={14} /> Retour au formulaire
                    </button>
                  </div>

                  {generatedInterUnits.map((unit, idx) => (
                    <div key={unit.id} className="border border-fuchsia-200 rounded-xl p-4 bg-fuchsia-50 space-y-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-fuchsia-600 font-semibold uppercase tracking-wide mb-1">
                            Unité {idx + 1} · {unit.grade} · {unit.disciplines.join(' + ')}
                          </p>
                          <h4 className="text-base font-bold text-slate-800">{unit.title}</h4>
                          <p className="text-xs text-slate-500 mt-1">{unit.duration}</p>
                          {unit.sharedObjectives && unit.sharedObjectives.length > 0 && (
                            <p className="text-xs text-fuchsia-700 mt-1">
                              🎯 Objectifs communs : {unit.sharedObjectives.slice(0, 2).join(' | ')}
                            </p>
                          )}
                        </div>
                        <button onClick={() => handleExportInterdisciplinaryWord(unit)}
                          className="flex items-center gap-1 px-3 py-1.5 bg-white border border-fuchsia-300 text-fuchsia-700 rounded-lg text-xs font-medium hover:bg-fuchsia-50 transition">
                          <Download size={14} /> Word IB
                        </button>
                      </div>

                      <div className="bg-amber-50 border-l-4 border-amber-400 px-3 py-2 rounded text-sm italic text-slate-700">
                        📌 {unit.statementOfInquiry}
                      </div>

                      {unit.integrationPurpose && (
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2">
                          <p className="text-xs font-bold text-blue-700 mb-1">🔗 But de l'intégration</p>
                          <p className="text-xs text-slate-600 line-clamp-2">{unit.integrationPurpose}</p>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-2">
                        {unit.phases && (
                          <>
                            <div className="bg-blue-50 rounded-lg p-2 border border-blue-100">
                              <p className="text-xs font-bold text-blue-700 mb-1">🔍 RECHERCHE</p>
                              <p className="text-xs text-slate-600 line-clamp-3">{unit.phases.recherche}</p>
                            </div>
                            <div className="bg-green-50 rounded-lg p-2 border border-green-100">
                              <p className="text-xs font-bold text-green-700 mb-1">⚡ ACTION</p>
                              <p className="text-xs text-slate-600 line-clamp-3">{unit.phases.action}</p>
                            </div>
                            <div className="bg-purple-50 rounded-lg p-2 border border-purple-100">
                              <p className="text-xs font-bold text-purple-700 mb-1">💡 RÉFLEXION</p>
                              <p className="text-xs text-slate-600 line-clamp-3">{unit.phases.reflexion}</p>
                            </div>
                          </>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        {(unit.summativeCriteria || []).map(c => (
                          <span key={c.criterion} className="text-xs bg-white border border-fuchsia-200 text-fuchsia-800 px-2 py-1 rounded-lg font-medium">
                            Critère {c.criterion} : {c.name} ({c.discipline}) /8
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}

                  <button onClick={handleSaveInterdisciplinaryUnits}
                    className="w-full py-3 bg-fuchsia-600 hover:bg-fuchsia-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg">
                    <CheckCircle size={20} />
                    Sauvegarder {generatedInterUnits.length} unité(s) interdisciplinaire(s)
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODALE : FORMULAIRE DRIVE AVEC BALISES
          ═══════════════════════════════════════════════════════════════════ */}
      {isDriveFormModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-teal-600 to-cyan-600 text-white p-6 rounded-t-2xl flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Tag size={22} /> Formulaire Drive avec balises
                </h2>
                <p className="text-teal-100 text-sm mt-1">
                  Copiez-collez votre formulaire balisé pour générer des unités automatiquement
                </p>
              </div>
              <button onClick={() => { setIsDriveFormModalOpen(false); setDriveFormParsed(null); setDriveFormText(''); }}
                className="text-white hover:text-teal-200 transition">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Guide des balises */}
              <div className="bg-teal-50 border border-teal-200 rounded-xl p-4">
                <p className="text-sm font-bold text-teal-800 mb-2">🏷️ Balises reconnues</p>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <p className="font-semibold text-red-700 mb-1">Obligatoires :</p>
                    {DRIVE_FORM_TAGS.required.map(t => (
                      <span key={t} className="inline-block bg-red-100 text-red-700 px-2 py-0.5 rounded mr-1 mb-1 font-mono">{t}</span>
                    ))}
                  </div>
                  <div>
                    <p className="font-semibold text-teal-700 mb-1">Optionnels :</p>
                    {DRIVE_FORM_TAGS.optional.map(t => (
                      <span key={t} className="inline-block bg-teal-100 text-teal-700 px-2 py-0.5 rounded mr-1 mb-1 font-mono">{t}</span>
                    ))}
                  </div>
                </div>
                <p className="text-xs text-teal-600 mt-2">
                  💡 Astuce : ajoutez <span className="font-mono bg-teal-100 px-1 rounded">[DISCIPLINE2]</span> pour générer une unité interdisciplinaire.
                </p>
              </div>

              {/* Bouton modèle */}
              <button onClick={() => setDriveFormText(getDriveFormTemplate())}
                className="flex items-center gap-2 text-sm text-teal-700 hover:text-teal-900 border border-teal-300 hover:border-teal-500 px-3 py-1.5 rounded-lg transition bg-teal-50 hover:bg-teal-100">
                <FileText size={14} /> Charger un modèle de formulaire
              </button>

              {/* Zone de saisie */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Contenu du formulaire balisé *</label>
                <textarea
                  ref={driveFormTextRef}
                  value={driveFormText}
                  onChange={e => { setDriveFormText(e.target.value); setDriveFormParsed(null); }}
                  placeholder={`[MATIERE] Mathématiques\n[CLASSE] PEI 3\n[CHAPITRES]\nChapitre 1 : ...\n...`}
                  className="w-full h-52 p-3 border border-slate-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-teal-500 outline-none resize-none"
                />
              </div>

              {/* Bouton Analyser */}
              <button onClick={handleParseDriveForm} disabled={!driveFormText.trim()}
                className="w-full py-2.5 bg-slate-700 hover:bg-slate-800 text-white rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition disabled:opacity-50">
                <Info size={16} /> Analyser les balises
              </button>

              {/* Résultat du parsing */}
              {driveFormParsed && (
                <div className="border border-slate-200 rounded-xl p-4 space-y-3">
                  <p className="font-semibold text-slate-800 text-sm">📊 Résultat de l'analyse</p>

                  {/* Erreurs */}
                  {driveFormParsed.missingRequired.length > 0 && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 flex gap-2">
                      <AlertTriangle size={16} className="text-red-500 flex-shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-semibold text-red-700">Tags obligatoires manquants :</p>
                        <p className="text-xs text-red-600 mt-1">{driveFormParsed.missingRequired.join(', ')}</p>
                      </div>
                    </div>
                  )}

                  {/* Avertissements */}
                  {driveFormParsed.warnings.length > 0 && driveFormParsed.warnings.map((w, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                      <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">{w}</p>
                    </div>
                  ))}

                  {/* Champs détectés */}
                  {driveFormParsed.missingRequired.length === 0 && (
                    <>
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex gap-2">
                        <CheckCircle size={16} className="text-green-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-green-700 font-medium">
                          Formulaire valide !
                          {driveFormParsed.isInterdisciplinary
                            ? ` → Génération d'unités INTERDISCIPLINAIRES (${driveFormParsed.subject} + ${driveFormParsed.discipline2})`
                            : ` → Génération de planification standard pour ${driveFormParsed.subject} — ${driveFormParsed.grade}`}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs">
                        {[
                          ['Matière', driveFormParsed.subject],
                          ['Classe', driveFormParsed.grade],
                          ['Enseignant', driveFormParsed.teacherName || '—'],
                          ['Durée', driveFormParsed.duration || 'Auto'],
                          ['Concept clé', driveFormParsed.keyConcept || 'Auto (IA)'],
                          ['Contexte mondial', driveFormParsed.globalContext || 'Auto (IA)'],
                          ['Nb. d\'unités', driveFormParsed.numberOfUnits ? String(driveFormParsed.numberOfUnits) : 'Auto'],
                          ['Interdisciplinaire', driveFormParsed.isInterdisciplinary ? `Oui (+ ${driveFormParsed.discipline2})` : 'Non'],
                        ].map(([label, value]) => (
                          <div key={label} className="bg-slate-50 rounded-lg p-2 border border-slate-100">
                            <p className="text-slate-500 font-medium">{label}</p>
                            <p className="text-slate-800 font-semibold truncate">{value}</p>
                          </div>
                        ))}
                      </div>

                      <button onClick={handleGenerateFromDriveForm} disabled={isDriveFormGenerating}
                        className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-60 shadow-lg">
                        {isDriveFormGenerating ? (
                          <><Loader2 className="animate-spin" size={20} />Génération en cours…</>
                        ) : (
                          <><Tag size={20} />Lancer la génération</>
                        )}
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════
          MODALE : SERVICE ET ACTION (SEA)
          ═══════════════════════════════════════════════════════════════════ */}
      {isSEAModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] overflow-y-auto">
            {/* En-tête */}
            <div className="bg-gradient-to-r from-rose-600 to-pink-600 text-white p-6 rounded-t-2xl flex justify-between items-start">
              <div>
                <h2 className="text-xl font-bold flex items-center gap-2">
                  <Heart size={22} /> Service en tant qu'Action — IB PEI
                </h2>
                <p className="text-rose-100 text-sm mt-1">
                  Génère des projets SEA conformes IB à partir des unités déjà générées pour la classe
                </p>
              </div>
              <button onClick={() => { setIsSEAModalOpen(false); setSeaStep('form'); setGeneratedSEAPlans([]); }}
                className="text-white hover:text-rose-200 transition">
                <X size={24} />
              </button>
            </div>

            <div className="p-6 space-y-5">
              {seaStep === 'form' ? (
                <>
                  {/* Info IB */}
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 text-sm text-rose-800">
                    <p className="font-semibold mb-2">📋 Rappel IB — Service en tant qu'Action :</p>
                    <ul className="list-disc pl-4 space-y-1 text-rose-700">
                      <li>Le projet SEA doit utiliser les <strong>compétences apprises en classe</strong></li>
                      <li>Répondre à un <strong>besoin réel</strong> (local, national ou mondial)</li>
                      <li><strong>Minimum 3 rencontres / séances</strong> documentées (journal de bord)</li>
                      <li>Types : Service Direct, Indirect, Défense d'une cause, Recherche</li>
                      <li>2 à 3 <strong>objectifs d'apprentissage IB</strong> parmi les 7 officiels</li>
                    </ul>
                  </div>

                  {/* Sélection de la classe */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-2">Classe *</label>
                    <div className="grid grid-cols-5 gap-2">
                      {['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'].map(g => {
                        const gradeCount = plans.filter(p => p.gradeLevel === g).length;
                        return (
                          <button
                            key={g}
                            onClick={() => setSeaGrade(g)}
                            className={`py-3 rounded-xl font-semibold text-sm border-2 transition flex flex-col items-center gap-1 ${
                              seaGrade === g
                                ? 'bg-rose-600 border-rose-600 text-white'
                                : gradeCount > 0
                                ? 'bg-rose-50 border-rose-200 text-rose-700 hover:bg-rose-100'
                                : 'bg-slate-50 border-slate-200 text-slate-400 cursor-not-allowed'
                            }`}
                          >
                            {g}
                            <span className={`text-xs font-normal ${seaGrade === g ? 'text-rose-100' : gradeCount > 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                              {gradeCount} unité{gradeCount !== 1 ? 's' : ''}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {plans.filter(p => p.gradeLevel === seaGrade).length === 0 && (
                      <div className="mt-3 bg-amber-50 border border-amber-200 rounded-lg p-3 flex gap-2">
                        <AlertTriangle size={16} className="text-amber-500 flex-shrink-0 mt-0.5" />
                        <p className="text-sm text-amber-700">
                          Aucune unité générée pour {seaGrade}. Lancez d'abord la <strong>Planification Annuelle</strong> pour cette classe.
                        </p>
                      </div>
                    )}
                    {plans.filter(p => p.gradeLevel === seaGrade).length > 0 && (
                      <div className="mt-3 bg-green-50 border border-green-200 rounded-lg p-3">
                        <p className="text-xs font-bold text-green-700 mb-1">
                          ✅ {plans.filter(p => p.gradeLevel === seaGrade).length} unité(s) disponibles pour {seaGrade} :
                        </p>
                        <ul className="space-y-0.5">
                          {plans.filter(p => p.gradeLevel === seaGrade).slice(0, 5).map(p => (
                            <li key={p.id} className="text-xs text-slate-600">
                              • <strong>{p.subject}</strong> — {p.title}
                              {p.teacherName && <span className="text-slate-400"> ({p.teacherName})</span>}
                            </li>
                          ))}
                          {plans.filter(p => p.gradeLevel === seaGrade).length > 5 && (
                            <li className="text-xs text-slate-400">… et {plans.filter(p => p.gradeLevel === seaGrade).length - 5} autre(s)</li>
                          )}
                        </ul>
                      </div>
                    )}
                  </div>

                  {/* Barre de progression SEA */}
                  {isGeneratingSEA && seaProgress && (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 space-y-2">
                      <div className="flex items-center justify-between text-xs text-rose-700">
                        <span className="font-semibold flex items-center gap-1">
                          <Loader2 size={12} className="animate-spin" />
                          Projet {seaProgress.current} / {seaProgress.total}
                        </span>
                        <span className="text-rose-500">{Math.round((seaProgress.current / seaProgress.total) * 100)}%</span>
                      </div>
                      <div className="w-full bg-rose-200 rounded-full h-2">
                        <div
                          className="bg-rose-600 h-2 rounded-full transition-all duration-500"
                          style={{ width: `${(seaProgress.current / seaProgress.total) * 100}%` }}
                        />
                      </div>
                      <p className="text-xs text-slate-600 italic truncate">
                        Génération en cours : <strong>{seaProgress.unitTitle}</strong>
                      </p>
                    </div>
                  )}

                  <button
                    onClick={() => handleGenerateSEA()}
                    disabled={isGeneratingSEA || plans.filter(p => p.gradeLevel === seaGrade).length === 0}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition disabled:opacity-60 disabled:cursor-not-allowed shadow-lg"
                  >
                    {isGeneratingSEA ? (
                      <><Loader2 className="animate-spin" size={20} />Génération SEA en cours…</>
                    ) : (
                      <><Heart size={20} />Générer les projets SEA pour {seaGrade}</>
                    )}
                  </button>
                </>
              ) : (
                /* ── Résultats SEA ── */
                <>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-bold text-slate-800 text-lg">
                      ✅ {generatedSEAPlans.length} projet(s) SEA générés
                    </h3>
                    <button onClick={() => setSeaStep('form')}
                      className="text-sm text-rose-600 hover:underline flex items-center gap-1">
                      <ArrowLeft size={14} /> Retour
                    </button>
                  </div>

                  {generatedSEAPlans.map((sea, idx) => (
                    <div key={sea.id} className="border border-rose-200 rounded-xl p-4 bg-rose-50 space-y-3">
                      {/* En-tête */}
                      <div className="flex items-start justify-between">
                        <div>
                          <p className="text-xs text-rose-600 font-semibold uppercase tracking-wide mb-1">
                            Projet {idx + 1} · {sea.subject} · {sea.grade}
                          </p>
                          <h4 className="text-base font-bold text-slate-800">{sea.title}</h4>
                          <p className="text-xs text-slate-500 mt-0.5 italic">Basé sur : {sea.sourceUnitTitle}</p>
                        </div>
                        <div className="flex flex-wrap gap-1 justify-end">
                          {sea.actionTypes.map(t => (
                            <span key={t} className="text-xs bg-rose-200 text-rose-800 px-2 py-0.5 rounded-full font-medium">{t}</span>
                          ))}
                        </div>
                      </div>

                      {/* Description */}
                      <div className="bg-white border border-rose-100 rounded-lg p-3">
                        <p className="text-xs font-bold text-slate-600 mb-1">📋 Description du projet</p>
                        <p className="text-xs text-slate-700">{sea.projectDescription}</p>
                      </div>

                      {/* Besoin + Lien */}
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-amber-50 border border-amber-100 rounded-lg p-2">
                          <p className="text-xs font-bold text-amber-700 mb-1">🎯 Besoin de la communauté</p>
                          <p className="text-xs text-slate-600 line-clamp-3">{sea.communityNeed}</p>
                        </div>
                        <div className="bg-blue-50 border border-blue-100 rounded-lg p-2">
                          <p className="text-xs font-bold text-blue-700 mb-1">🔗 Lien avec l'unité</p>
                          <p className="text-xs text-slate-600 line-clamp-3">{sea.linkToUnit}</p>
                        </div>
                      </div>

                      {/* Objectifs IB */}
                      <div className="bg-green-50 border border-green-100 rounded-lg p-2">
                        <p className="text-xs font-bold text-green-700 mb-1">🎓 Objectifs d'apprentissage IB sélectionnés</p>
                        <ul className="space-y-0.5">
                          {sea.learningOutcomes.filter(lo => lo.selected).map(lo => (
                            <li key={lo.id} className="text-xs text-slate-700">
                              <span className="font-bold text-green-700">OA{lo.id} :</span> {lo.text}
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* ATL + Critères */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <p className="text-xs font-bold text-purple-700 mb-1">🧠 Compétences ATL</p>
                          <ul className="space-y-0.5">
                            {sea.atlSkills.map((s, i) => <li key={i} className="text-xs text-slate-600">• {s}</li>)}
                          </ul>
                        </div>
                        <div>
                          <p className="text-xs font-bold text-slate-600 mb-1">✅ Critères de réussite</p>
                          <ul className="space-y-0.5">
                            {sea.successCriteria.map((c, i) => <li key={i} className="text-xs text-slate-600">• {c.description}</li>)}
                          </ul>
                        </div>
                      </div>

                      {/* Questions de réflexion */}
                      {sea.reflectionPrompts.length > 0 && (
                        <div className="bg-purple-50 border border-purple-100 rounded-lg p-2">
                          <p className="text-xs font-bold text-purple-700 mb-1">💭 Questions de réflexion</p>
                          <ol className="space-y-0.5 list-decimal list-inside">
                            {sea.reflectionPrompts.map((q, i) => <li key={i} className="text-xs text-slate-600">{q.question}</li>)}
                          </ol>
                        </div>
                      )}
                    </div>
                  ))}

                  <button onClick={handleSaveSEAPlans}
                    className="w-full py-3 bg-rose-600 hover:bg-rose-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition shadow-lg">
                    <CheckCircle size={20} />
                    Sauvegarder {generatedSEAPlans.length} projet(s) SEA
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}

    </div>

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : ÉDITEUR DES CRITÈRES IB
        ═══════════════════════════════════════════════════════════════════ */}
    <IbCriteriaEditor
      isOpen={isCriteriaEditorOpen}
      onClose={() => setIsCriteriaEditorOpen(false)}
      subject={currentSubject}
      grade={currentGrade}
      onSaved={handleCriteriaSaved}
    />

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : VISIONNEUSE / ÉDITEUR DES ÉVALUATIONS CRITÉRIÉES
        ═══════════════════════════════════════════════════════════════════ */}
    <AssessmentViewerModal
      isOpen={viewerPlan !== null}
      onClose={() => setViewerPlan(null)}
      plan={viewerPlan}
      onUpdateUnit={plan => {
        if (onUpdateUnit) onUpdateUnit(plan);
        else onAddPlans(plans.map(p => p.id === plan.id ? plan : p));
        setViewerPlan(plan);
      }}
    />

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : ÉDITEUR CRITÈRES IB INTERDISCIPLINAIRE
        ═══════════════════════════════════════════════════════════════════ */}
    <IbCriteriaEditor
      isOpen={isInterCriteriaEditorOpen}
      onClose={() => setIsInterCriteriaEditorOpen(false)}
      subject={interCriteriaSubject}
      grade={interCriteriaGrade}
      onSaved={handleCriteriaSaved}
    />

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : CALCULATEUR D'HEURES
        ═══════════════════════════════════════════════════════════════════ */}
    <HoursCalculatorModal
      isOpen={isHoursCalculatorOpen}
      onClose={() => setIsHoursCalculatorOpen(false)}
      subject={currentSubject}
      grade={currentGrade}
      plannedHours={getPlannedHoursForSubjectGrade()}
    />

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : MISE À JOUR DES DÉTAILS D'UNE UNITÉ
        (Sans toucher titre / objectifs / critères / ATL)
        ═══════════════════════════════════════════════════════════════════ */}
    {isDetailUpdateMode && detailUpdatePlan && (
      <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[60] overflow-y-auto">
        <div className="min-h-screen p-4 flex items-start justify-center">
          <div className="w-full max-w-5xl">
            {/* Barre d'outils IA en haut du modal */}
            <div className="mb-3 bg-gradient-to-r from-violet-700 to-indigo-700 rounded-2xl shadow-xl p-4 flex flex-col sm:flex-row items-start sm:items-center gap-3">
              <div className="flex-1 min-w-0">
                <p className="text-white font-bold text-sm flex items-center gap-2">
                  <span className="text-lg">✨</span>
                  Mode Mise à Jour Détaillée
                </p>
                <p className="text-violet-200 text-xs mt-0.5 truncate">
                  Unité : <span className="font-semibold text-white">{detailUpdatePlan.title}</span>
                </p>
                {aiDetailsProgress && (
                  <p className={`text-xs mt-1 font-medium flex items-center gap-1.5 ${
                    aiDetailsProgress.startsWith('✅') ? 'text-green-300' : 'text-yellow-200'
                  }`}>
                    {!aiDetailsProgress.startsWith('✅') && (
                      <Loader2 size={11} className="animate-spin flex-shrink-0" />
                    )}
                    {aiDetailsProgress}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={handleGenerateAIDetails}
                  disabled={isGeneratingAIDetails}
                  className="flex items-center gap-2 px-4 py-2 bg-yellow-400 hover:bg-yellow-300 disabled:opacity-60 text-yellow-900 rounded-xl text-sm font-bold shadow-lg transition whitespace-nowrap"
                  title="Générer automatiquement les sections détaillées manquantes avec Gemini"
                >
                  {isGeneratingAIDetails
                    ? <><Loader2 size={14} className="animate-spin" /> Génération IA…</>
                    : <><span className="text-base">🤖</span> Générer avec IA</>
                  }
                </button>
                <span className="text-violet-300 text-xs hidden sm:block">ou remplissez manuellement ↓</span>
              </div>
            </div>
            <UnitPlanFormImport
              initialPlan={detailUpdatePlan}
              onSave={handleSaveDetailUpdate}
              onCancel={() => { setDetailUpdatePlan(null); setIsDetailUpdateMode(false); }}
              detailUpdateMode={true}
            />
          </div>
        </div>
      </div>
    )}

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : AJOUTER / MODIFIER UNE UNITÉ
        ═══════════════════════════════════════════════════════════════════ */}
    <AddEditUnitModal
      isOpen={isAddEditUnitModalOpen}
      onClose={() => { setIsAddEditUnitModalOpen(false); setEditingUnitPlan(null); }}
      onSave={handleSaveUnit}
      existingPlan={editingUnitPlan}
      subject={currentSubject}
      gradeLevel={currentGrade}
    />

    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : REFAIRE TOUTES LES UNITÉS DE L'ANNÉE
        ═══════════════════════════════════════════════════════════════════ */}
    {isRegenAllModalOpen && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-amber-600 to-orange-600 text-white p-5 rounded-t-2xl flex justify-between items-start">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <RotateCcw size={22} />
                Refaire toutes les unités de l'année
              </h2>
              <p className="text-amber-100 text-sm mt-1">
                Régénère {plans.length} unité(s) complète(s) en conservant le titre, l'énoncé, les chapitres et les critères
              </p>
            </div>
            <button
              onClick={() => { setIsRegenAllModalOpen(false); setRegenAllProgress(''); }}
              className="text-white hover:text-amber-200 transition p-1"
            >
              <X size={24} />
            </button>
          </div>

          {/* Body scrollable */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {/* Info box */}
            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm text-amber-800">
              <p className="font-semibold mb-2">ℹ️ Comment fonctionne cette option ?</p>
              <ul className="list-disc pl-4 space-y-1 text-amber-700">
                <li>L'IA régénère <strong>tous les champs</strong> de chaque unité (concepts, contexte, questions, activités, évaluations…)</li>
                <li>Elle <strong>conserve</strong> le titre, l'énoncé de recherche, les chapitres et les critères que vous définissez ci-dessous</li>
                <li>Vous pouvez modifier ces informations avant de lancer la régénération</li>
                <li>⚠️ La planification existante sera <strong>remplacée</strong></li>
              </ul>
            </div>

            {/* Editable summaries */}
            <div className="space-y-4">
              {regenSummaries.map((summary, idx) => (
                <div key={idx} className="border border-slate-200 rounded-xl p-4 bg-slate-50 space-y-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="bg-amber-600 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      Unité {idx + 1}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">{summary.title || 'Sans titre'}</span>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Titre *</label>
                    <input
                      value={summary.title}
                      onChange={e => updateRegenSummary(idx, 'title', e.target.value)}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none"
                      placeholder="Titre de l'unité"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Énoncé de recherche *</label>
                    <textarea
                      value={summary.statementOfInquiry}
                      onChange={e => updateRegenSummary(idx, 'statementOfInquiry', e.target.value)}
                      rows={2}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none"
                      placeholder="Énoncé de recherche…"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Chapitres</label>
                    <textarea
                      value={summary.chapters}
                      onChange={e => updateRegenSummary(idx, 'chapters', e.target.value)}
                      rows={2}
                      className="w-full p-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-400 outline-none resize-none"
                      placeholder="Chapitres et leçons…"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">Critères d'évaluation</label>
                    <div className="flex flex-wrap gap-2">
                      {['A', 'B', 'C', 'D'].map(letter => {
                        const isSelected = summary.objectives.some(o => o.includes(letter));
                        return (
                          <button
                            key={letter}
                            type="button"
                            onClick={() => {
                              const current = summary.objectives.some(o => o.includes(letter));
                              const newObjs = current
                                ? summary.objectives.filter(o => !o.includes(letter))
                                : [...summary.objectives, `Critère ${letter}`];
                              updateRegenSummary(idx, 'objectives', newObjs);
                            }}
                            className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${
                              isSelected
                                ? 'bg-amber-600 text-white border-amber-600'
                                : 'bg-white text-slate-600 border-slate-300 hover:border-amber-400'
                            }`}
                          >
                            Critère {letter}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between items-center gap-4">
            <p className="text-xs text-slate-500">
              {regenSummaries.length} unité(s) seront régénérées pour <strong>{currentSubject} — {currentGrade}</strong>
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => { setIsRegenAllModalOpen(false); setRegenAllProgress(''); }}
                className="px-5 py-2.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 font-semibold text-sm transition"
              >
                Annuler
              </button>
              <button
                onClick={handleRegenAllUnits}
                disabled={isRegenAllGenerating}
                className="px-6 py-2.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm flex items-center gap-2 transition disabled:opacity-60 shadow"
              >
                {isRegenAllGenerating ? (
                  <><Loader2 className="animate-spin" size={18} />{regenAllProgress || 'Génération…'}</>
                ) : (
                  <><RotateCcw size={18} />Lancer la régénération</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    )}
    {/* ═══════════════════════════════════════════════════════════════════
        MODAL : DÉPÔT DES TRAVAUX D'ÉLÈVES
        ═══════════════════════════════════════════════════════════════════ */}
    {uploadModalPlan && (
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg">
          {/* Header */}
          <div className="bg-gradient-to-r from-sky-600 to-cyan-600 text-white p-5 rounded-t-2xl flex justify-between items-start">
            <div>
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Upload size={20} />
                Dépôt du travail d'élève
              </h2>
              <p className="text-sky-100 text-sm mt-1">
                Unité : <strong>{uploadModalPlan.title}</strong> · {uploadModalPlan.subject || currentSubject}
              </p>
            </div>
            <button onClick={() => setUploadModalPlan(null)} className="text-white/70 hover:text-white p-1">
              <X size={22} />
            </button>
          </div>

          {/* Body */}
          <div className="p-6 space-y-4">
            {/* Student name */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Nom de l'élève <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={uploadStudentName}
                onChange={e => setUploadStudentName(e.target.value)}
                placeholder="ex : Ahmed Benali"
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              />
            </div>

            {/* Criterion select */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Critère d'évaluation <span className="text-red-500">*</span>
              </label>
              <select
                value={uploadCriterion}
                onChange={e => setUploadCriterion(e.target.value)}
                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-400"
              >
                <option value="">— Choisir un critère —</option>
                {(uploadModalPlan.assessments && uploadModalPlan.assessments.length > 0
                  ? uploadModalPlan.assessments
                  : [{ criterion: 'A', criterionName: 'Critère A' }, { criterion: 'B', criterionName: 'Critère B' },
                     { criterion: 'C', criterionName: 'Critère C' }, { criterion: 'D', criterionName: 'Critère D' }]
                ).map(a => (
                  <option key={a.criterion} value={`Critere_${a.criterion}`}>
                    Critère {a.criterion}{a.criterionName ? ` — ${a.criterionName}` : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* Subject + Unit auto-display + folder path */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 text-xs text-slate-600 space-y-1">
              <p><span className="font-semibold">Matière :</span> {uploadModalPlan.subject || currentSubject}</p>
              <p><span className="font-semibold">Unité :</span> {uploadModalPlan.title}</p>
              <p><span className="font-semibold">Classe :</span> {uploadModalPlan.gradeLevel || currentGrade}</p>
              {/* Folder path structure */}
              <div className="mt-2 bg-sky-50 border border-sky-200 rounded-lg px-3 py-2 space-y-1">
                <p className="font-bold text-sky-800 text-xs">📁 Arborescence Drive recommandée :</p>
                <div className="flex items-center gap-1 text-sky-700 font-mono text-xs flex-wrap">
                  <span className="bg-sky-100 px-1.5 py-0.5 rounded">{uploadModalPlan.gradeLevel || currentGrade}</span>
                  <span className="text-slate-400">/</span>
                  <span className="bg-sky-100 px-1.5 py-0.5 rounded">{(uploadModalPlan.subject || currentSubject).replace(/\s/g, '_')}</span>
                  <span className="text-slate-400">/</span>
                  <span className="bg-sky-100 px-1.5 py-0.5 rounded">{(uploadModalPlan.title || 'Unite').replace(/[^a-z0-9\s]/gi,'').trim().replace(/\s+/g,'_').slice(0,25)}</span>
                  <span className="text-slate-400">/</span>
                  <span className={`px-1.5 py-0.5 rounded ${uploadStudentName ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                    {uploadStudentName || 'Eleve'}
                  </span>
                </div>
              </div>
              {uploadStudentName && uploadCriterion && (
                <p className="mt-2 font-bold text-sky-700">
                  📄 Nom du fichier : {`${(uploadModalPlan.subject || currentSubject).replace(/[^a-z0-9]/gi,'_')}-${(uploadModalPlan.title || '').replace(/[^a-z0-9]/gi,'_').slice(0,20)}-${uploadCriterion}-${uploadStudentName.replace(/[^a-z0-9]/gi,'_')}-${(uploadModalPlan.gradeLevel || currentGrade).replace(/\s/g,'_')}`}
                </p>
              )}
            </div>

            {/* File picker */}
            <div>
              <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                Fichier à déposer
              </label>
              <input
                type="file"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png"
                onChange={e => setUploadFile(e.target.files?.[0] || null)}
                className="w-full text-sm text-slate-600 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:bg-sky-100 file:text-sky-700 file:font-semibold hover:file:bg-sky-200 transition"
              />
            </div>

            {/* Drive link notice */}
            <div className="bg-sky-50 border border-sky-100 rounded-lg p-3 text-xs text-sky-700 space-y-2">
              <p className="font-semibold">📁 Instructions de dépôt Google Drive :</p>
              <ol className="list-decimal list-inside space-y-1 text-sky-700">
                <li>Ouvrez le dossier Drive ci-dessous</li>
                <li>Naviguez vers : <strong>{uploadModalPlan.gradeLevel || currentGrade}</strong> → <strong>{(uploadModalPlan.subject || currentSubject).replace(/\s/g, '_')}</strong> → <strong>{(uploadModalPlan.title || 'Unite').replace(/[^a-z0-9\s]/gi,'').trim().replace(/\s+/g,'_').slice(0,25)}</strong></li>
                <li>Créez un sous-dossier avec le nom de l'élève si nécessaire</li>
                <li>Glissez-déposez le fichier renommé avec le nom indiqué ci-dessus</li>
              </ol>
              <a
                href={`https://drive.google.com/drive/folders/1qwx0XnrnRRCcK3o_AMr07n1YHCm4-oJ4`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-sky-600 hover:text-sky-800 font-medium underline"
              >
                <FolderOpen size={13} />
                Ouvrir le dossier Drive
                <ExternalLink size={11} />
              </a>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex justify-between items-center gap-3">
            <button
              onClick={() => setUploadModalPlan(null)}
              className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition font-medium"
            >
              Fermer
            </button>
            <a
              href={`https://drive.google.com/drive/folders/1qwx0XnrnRRCcK3o_AMr07n1YHCm4-oJ4`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow transition"
            >
              <FolderOpen size={16} />
              Ouvrir Drive et déposer
              <ExternalLink size={13} className="opacity-75" />
            </a>
          </div>
        </div>
      </div>
    )}
    {/* ── Modale Demande de Modification (enseignant) ───────────────────── */}
    {showModRequestModal && modRequestPlan && (
      <ModificationRequestModal
        plan={modRequestPlan}
        currentUser={currentUser || null}
        onClose={() => { setShowModRequestModal(false); setModRequestPlan(null); }}
        onSuccess={() => {
          setShowModRequestModal(false);
          setModRequestPlan(null);
          alert('✅ Votre demande a été envoyée à l\'administrateur. Vous serez notifié dès qu\'elle sera traitée.');
        }}
      />
    )}
    </>
  );
};

export default Dashboard;
