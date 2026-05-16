import React, { useState, useEffect, useRef } from 'react';
import { UnitPlan, ServiceActionPlan } from '../types';
import { Plus, Edit2, Trash2, FileText, Calendar, Layers, Loader2, Download, X, FileCheck, Filter, FileArchive, User, LogOut, ArrowLeft, BookOpen, Printer, Globe, GitMerge, Tag, AlertTriangle, CheckCircle, Info, Heart, ChevronDown, ChevronUp, RefreshCw, RotateCcw } from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';
import { generateCourseFromChapters, generateInterdisciplinaryUnits, parseDriveFormTags, generateFromDriveForm, DRIVE_FORM_TAGS, InterdisciplinaryUnit, DriveFormConfig, generateServiceActionForGrade, regenerateAllUnitsFromSummary, UnitSummaryInput } from '../services/geminiService';
import { exportUnitPlanToWord, exportAssessmentsToZip, exportConsolidatedPlanByGrade, exportOverviewToWord, exportInterdisciplinaryToWord, exportInterdisciplinaryOverviewToWord, exportSEAOverviewToWord, exportSEAPlanToWord, exportCompleteInterdisciplinaryThemePlan, exportInterdisciplinaryAssessmentsToZip } from '../services/wordExportService';
import { checkSubjectCompletionAllGrades } from '../services/databaseService';
import { SUBJECTS, INTERDISCIPLINARY_SUBJECT, PEI_GRADES, DRIVE_FORM_TAG_GUIDE } from '../constants';
import AddEditUnitModal from './AddEditUnitModal';

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
}

const Dashboard: React.FC<DashboardProps> = ({ currentSubject, currentGrade, plans, onCreateNew, onEdit, onDelete, onAddPlans, onAddSingleUnit, onUpdateUnit, onLogout }) => {
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

  // ── État : Refaire toutes les unités de l'année ───────────────────────────
  const [isRegenAllModalOpen, setIsRegenAllModalOpen] = useState(false);
  const [isRegenAllGenerating, setIsRegenAllGenerating] = useState(false);
  const [regenAllProgress, setRegenAllProgress] = useState('');
  // Editable summaries for regen
  const [regenSummaries, setRegenSummaries] = useState<UnitSummaryInput[]>([]);

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
    await exportUnitPlanToWord(plan);
    setExportingId(null);
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
        
        <header className="flex flex-col md:flex-row justify-between items-end border-b border-slate-200 pb-6 gap-4">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-white shadow-md overflow-hidden border border-slate-100">
             <img 
                src="/logo-alkawtar.png" 
                alt="Logo Al Kawthar" 
                className="w-full h-full object-contain p-1"
                onError={(e) => e.currentTarget.style.display = 'none'}
             />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Planificateur PEI - {currentGrade}</h1>
            <div className="flex items-center gap-2 text-slate-500 mt-1">
              <FileText size={16} />
              <span className="font-medium">{currentSubject}</span>
            </div>
          </div>
        </div>
        <div className="flex gap-3 flex-wrap">
             <button 
              onClick={onLogout}
              className="flex items-center gap-2 bg-slate-200 hover:bg-slate-300 text-slate-700 px-4 py-3 rounded-lg font-semibold shadow transition"
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
                 className="flex items-center gap-2 bg-cyan-600 hover:bg-cyan-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
                 title="Imprimer les descriptifs des unités"
               >
                 <Printer size={20} />
                 Imprimer Descriptifs
               </button>
             )}
             <button 
               onClick={handleExportConsolidated}
               disabled={exportingId === 'consolidated'}
               className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5 disabled:opacity-70 disabled:cursor-not-allowed"
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
             {/* ── Bouton Formulaire Drive avec balises ────────────────── */}
             <button
               onClick={() => setIsDriveFormModalOpen(true)}
               className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
               title="Générer des unités à partir d'un formulaire balisé (type Google Drive)"
             >
               <Tag size={20} />
               Formulaire Drive
             </button>
             {/* ── Bouton Service et Action (SEA) ──────────────────────── */}
             <button
               onClick={() => { setIsSEAModalOpen(true); setSeaStep('form'); setGeneratedSEAPlans([]); }}
               className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
               title="Générer les projets Service et Action (SEA) IB PEI par classe"
             >
               <Heart size={20} />
               Service &amp; Action
             </button>
             {/* ── Bouton Unités Interdisciplinaires ───────────────────── */}
             <button
               onClick={() => { setIsInterdisciplinaryModalOpen(true); setInterStep('form'); }}
               className="flex items-center gap-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
               title="Générer des unités interdisciplinaires IB PEI (structure Recherche / Action / Réflexion)"
             >
               <GitMerge size={20} />
               Interdisciplinaire
             </button>
             <button 
              onClick={() => setIsBulkModalOpen(true)}
              className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
            >
              <Layers size={20} />
              Planification Annuelle
            </button>
             {/* ── Bouton Refaire toutes les unités ────────────────── */}
             {plans.length > 0 && (
               <button
                 onClick={handleOpenRegenAll}
                 className="flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
                 title="Refaire toutes les unités de l'année (basé sur titre + énoncé + chapitres + critères)"
               >
                 <RotateCcw size={20} />
                 Refaire Toutes les Unités
               </button>
             )}
            <button 
              onClick={handleOpenAddUnit}
              className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-5 py-3 rounded-lg font-semibold shadow-lg transition transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              Ajouter une unité
            </button>
        </div>
      </header>

      {/* Stats Section */}
      {plans.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4">Unités pour {currentGrade}</h3>
                <div className="flex items-center gap-4">
                    <div className="p-4 bg-blue-50 rounded-full text-blue-600">
                        <FileText size={32} />
                    </div>
                    <span className="text-4xl font-bold text-slate-800">{plans.length}</span>
                </div>
            </div>
            
            <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-100 flex flex-col md:col-span-2">
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
      )}

      {/* Plans List */}
      <section>
        <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
            <h2 className="text-xl font-bold text-slate-800 flex items-center gap-2">
                <Calendar size={20} className="text-slate-500" />
                Unités récentes
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
                    <div key={plan.id} className="print-card bg-white p-6 rounded-xl shadow-sm border border-slate-200 hover:shadow-md transition group flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <div>
                                <span className="inline-block px-2 py-1 text-xs font-bold bg-blue-100 text-blue-700 rounded mb-2">
                                    {plan.subject || 'Sans matière'}
                                </span>
                                <h3 className="text-lg font-bold text-slate-800 group-hover:text-blue-600 transition">{plan.title || 'Unité sans titre'}</h3>
                                <p className="text-sm text-slate-500">{plan.gradeLevel} • {plan.duration}</p>
                            </div>
                            <div className="flex flex-col gap-2">
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
                            </div>
                        </div>
                        
                        <div className="flex-grow space-y-3">
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

                        <div className="flex items-center justify-between text-xs text-slate-500 mt-4 pt-4 border-t border-slate-100">
                            <div className="flex items-center gap-2 flex-wrap">
                                <button 
                                    onClick={() => handleExportPlan(plan)}
                                    className="flex items-center gap-1 bg-emerald-50 text-emerald-700 px-2 py-1 rounded hover:bg-emerald-100 transition"
                                    disabled={exportingId === `plan-${plan.id}`}
                                >
                                    {exportingId === `plan-${plan.id}` ? <Loader2 className="animate-spin" size={14}/> : <Download size={14}/>}
                                    Plan
                                </button>
                                <button 
                                    onClick={() => handleExportAssessment(plan)}
                                    className="flex items-center gap-1 bg-indigo-50 text-indigo-700 px-2 py-1 rounded hover:bg-indigo-100 transition"
                                    disabled={exportingId === `eval-${plan.id}`}
                                    title={"Exporter les évaluations (Zip)"}
                                >
                                    {exportingId === `eval-${plan.id}` ? <Loader2 className="animate-spin" size={14}/> : <FileArchive size={14}/>}
                                    Exams (Zip)
                                </button>
                                <button 
                                    onClick={() => handlePrintUnit(plan)}
                                    className="flex items-center gap-1 bg-violet-50 text-violet-700 px-2 py-1 rounded hover:bg-violet-100 transition"
                                    title="Imprimer cette unité"
                                >
                                    <Printer size={14}/>
                                    Imprimer
                                </button>
                                {/* ── Bouton rapide SEA pour cette classe ── */}
                                <button
                                    onClick={() => handleOpenSEAForGrade(plan.gradeLevel)}
                                    className="flex items-center gap-1 bg-rose-50 text-rose-700 px-2 py-1 rounded hover:bg-rose-100 transition"
                                    title={`Générer les projets Service & Action pour ${plan.gradeLevel}`}
                                >
                                    <Heart size={14}/>
                                    SEA {plan.gradeLevel}
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
    </>
  );
};

export default Dashboard;
