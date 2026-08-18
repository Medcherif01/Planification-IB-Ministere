import React, { useState, useEffect, useCallback } from 'react';
import { AppMode } from '../types';
import { SUBJECTS, PEI_GRADES } from '../constants';
import { loadAllPlansForGrade, loadPlansFromDatabase } from '../services/databaseService';
import type { UnitPlan, ServiceActionPlan } from '../types';
import type { InterdisciplinaryUnit } from '../services/geminiService';
import {
  generateAutoInterdisciplinaryForGrade,
  generateServiceActionForGrade,
} from '../services/geminiService';
import {
  exportCompleteInterdisciplinaryThemePlan,
  exportSEAOverviewToWord,
  exportSEAPlanToWord,
  exportInterdisciplinaryToWord,
} from '../services/wordExportService';
import {
  LogOut, ChevronLeft, BookOpen, FlaskConical, Calculator,
  Globe, Palette, Dumbbell, Cpu, Languages, GitMerge, Heart,
  Loader2, CheckCircle, AlertCircle, Download, RefreshCw,
  Users, Layers, Sparkles, FileText, Eye, Trash2, ChevronDown,
  ChevronUp, BookMarked, GraduationCap, FolderOpen, ExternalLink,
  Table, Shield, Lock,
} from 'lucide-react';
import AdminPanel from './AdminPanel';
import type { AppUser } from '../services/authService';

// ─── Props ────────────────────────────────────────────────────────────────────
interface HomeScreenProps {
  onSelectSubjectGrade: (subject: string, grade: string, mode: AppMode) => void;
  onLogout: () => void;
  onGoToExams: () => void;
  currentUser?: AppUser | null;
}

// ─── Subject metadata ─────────────────────────────────────────────────────────
interface SubjectMeta {
  label: string;
  icon: React.ReactNode;
  bg: string;
  text: string;
  border: string;
  ring: string;
  badge: string;
}

const SUBJECT_META: Record<string, SubjectMeta> = {
  'Langue et littérature': {
    label: 'Langue et\nlittérature',
    icon: <BookOpen size={28} />,
    bg: 'bg-blue-50',
    text: 'text-blue-700',
    border: 'border-blue-200',
    ring: 'ring-blue-300',
    badge: 'bg-blue-600',
  },
  'Acquisition de langues': {
    label: 'Acquisition\nde langues',
    icon: <Languages size={28} />,
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    ring: 'ring-sky-300',
    badge: 'bg-sky-600',
  },
  'Individus et sociétés': {
    label: 'Individus et\nsociétés',
    icon: <Users size={28} />,
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    ring: 'ring-amber-300',
    badge: 'bg-amber-600',
  },
  'Sciences': {
    label: 'Sciences',
    icon: <FlaskConical size={28} />,
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    ring: 'ring-emerald-300',
    badge: 'bg-emerald-600',
  },
  'Mathématiques': {
    label: 'Mathématiques',
    icon: <Calculator size={28} />,
    bg: 'bg-red-50',
    text: 'text-red-700',
    border: 'border-red-200',
    ring: 'ring-red-300',
    badge: 'bg-red-600',
  },
  'Arts': {
    label: 'Arts',
    icon: <Palette size={28} />,
    bg: 'bg-yellow-50',
    text: 'text-yellow-700',
    border: 'border-yellow-200',
    ring: 'ring-yellow-300',
    badge: 'bg-yellow-600',
  },
  'Éducation physique et à la santé': {
    label: 'Éducation\nphysique',
    icon: <Dumbbell size={28} />,
    bg: 'bg-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
    ring: 'ring-pink-300',
    badge: 'bg-pink-600',
  },
  'Design': {
    label: 'Design',
    icon: <Cpu size={28} />,
    bg: 'bg-violet-50',
    text: 'text-violet-700',
    border: 'border-violet-200',
    ring: 'ring-violet-300',
    badge: 'bg-violet-600',
  },
};

const GRADE_CONFIG: Record<string, { emoji: string; color: string; textColor: string; border: string; ring: string; label: string }> = {
  'PEI 1': { emoji: '🧒', color: 'from-blue-400 to-blue-600',   textColor: 'text-blue-700',   border: 'border-blue-200',   ring: 'ring-blue-300',   label: '6ème' },
  'PEI 2': { emoji: '👦', color: 'from-green-400 to-green-600', textColor: 'text-green-700',  border: 'border-green-200',  ring: 'ring-green-300',  label: '5ème' },
  'PEI 3': { emoji: '👧', color: 'from-amber-400 to-amber-600', textColor: 'text-amber-700',  border: 'border-amber-200',  ring: 'ring-amber-300',  label: '4ème' },
  'PEI 4': { emoji: '🧑', color: 'from-rose-400 to-rose-600',   textColor: 'text-rose-700',   border: 'border-rose-200',   ring: 'ring-rose-300',   label: '3ème' },
  'PEI 5': { emoji: '👱', color: 'from-violet-400 to-violet-600', textColor: 'text-violet-700', border: 'border-violet-200', ring: 'ring-violet-300', label: '2nde' },
};

// ─────────────────────────────────────────────────────────────────────────────

const HomeScreen: React.FC<HomeScreenProps> = ({ onSelectSubjectGrade, onLogout, onGoToExams, currentUser }) => {

  const [selectedGrade, setSelectedGrade] = useState<string | null>(null);
  const [showAdminPanel, setShowAdminPanel] = useState(false);

  // Dériver les infos user depuis currentUser prop (avec fallback localStorage)
  const userName = currentUser?.displayName || localStorage.getItem('userName') || 'Administrateur';
  const userRole = currentUser?.role || localStorage.getItem('userRole') || 'admin';
  const isAdmin = userRole === 'admin';

  // Grade stats: unit count per grade
  const [gradeUnitCounts, setGradeUnitCounts] = useState<Record<string, number>>({});
  const [gradeStatsLoading, setGradeStatsLoading] = useState(true);

  // Subject plan counts for selected grade
  const [subjectCounts, setSubjectCounts] = useState<Record<string, number>>({});
  const [subjectCountsLoading, setSubjectCountsLoading] = useState(false);

  // Interdisciplinary state for selected grade
  const [interState, setInterState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [interMsg, setInterMsg] = useState('');
  const [savedInter, setSavedInter] = useState<InterdisciplinaryUnit[]>([]);
  const [showInterList, setShowInterList] = useState(false);

  // SEA state for selected grade
  const [seaState, setSeaState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [seaMsg, setSeaMsg] = useState('');
  const [seaProgress, setSeaProgress] = useState<{ current: number; total: number; unitTitle: string } | null>(null);
  const [savedSEA, setSavedSEA] = useState<ServiceActionPlan[]>([]);
  const [showSeaList, setShowSeaList] = useState(false);

  // Special counts per grade (for grade cards)
  const [specialCounts, setSpecialCounts] = useState<Record<string, { inter: number; sea: number }>>({});

  // ── Load grade stats ──────────────────────────────────────────────────────
  useEffect(() => {
    const loadStats = async () => {
      setGradeStatsLoading(true);
      const counts: Record<string, number> = {};
      const specials: Record<string, { inter: number; sea: number }> = {};

      const rawInter = localStorage.getItem('interdisciplinary_units');
      const rawSEA = localStorage.getItem('sea_plans');
      const allInter: InterdisciplinaryUnit[] = rawInter ? JSON.parse(rawInter) : [];
      const allSEA: ServiceActionPlan[] = rawSEA ? JSON.parse(rawSEA) : [];

      await Promise.all(PEI_GRADES.map(async (grade) => {
        try {
          const plans = await loadAllPlansForGrade(grade);
          counts[grade] = plans.length;
        } catch {
          counts[grade] = 0;
        }
        specials[grade] = {
          inter: allInter.filter(u => u.grade === grade).length,
          sea: allSEA.filter(s => s.grade === grade).length,
        };
      }));

      setGradeUnitCounts(counts);
      setSpecialCounts(specials);
      setGradeStatsLoading(false);
    };
    loadStats();
  }, []);

  // ── Load subject counts when grade is selected ────────────────────────────
  const loadSubjectData = useCallback(async (grade: string) => {
    setSubjectCountsLoading(true);

    // Load per-subject plan counts
    const counts: Record<string, number> = {};
    await Promise.all(SUBJECTS.map(async (subj) => {
      try {
        const plans = await loadPlansFromDatabase(subj, grade);
        counts[subj] = plans.length;
      } catch {
        counts[subj] = 0;
      }
    }));
    setSubjectCounts(counts);
    setSubjectCountsLoading(false);

    // Load saved inter & SEA for this grade
    const rawInter = localStorage.getItem('interdisciplinary_units');
    const rawSEA = localStorage.getItem('sea_plans');
    const allInter: InterdisciplinaryUnit[] = rawInter ? JSON.parse(rawInter) : [];
    const allSEA: ServiceActionPlan[] = rawSEA ? JSON.parse(rawSEA) : [];
    setSavedInter(allInter.filter(u => u.grade === grade));
    setSavedSEA(allSEA.filter(s => s.grade === grade));
  }, []);

  const handleGradeSelect = (grade: string) => {
    setSelectedGrade(grade);
    setInterState('idle');
    setInterMsg('');
    setSeaState('idle');
    setSeaMsg('');
    setSeaProgress(null);
    setShowInterList(false);
    setShowSeaList(false);
    loadSubjectData(grade);
  };

  const handleBack = () => {
    setSelectedGrade(null);
    setInterState('idle');
    setSeaState('idle');
  };

  // ── Auto-generate interdisciplinary ──────────────────────────────────────
  const handleAutoGenerateInter = async () => {
    if (!selectedGrade) return;
    setInterState('loading');
    setInterMsg('Chargement des unités…');
    try {
      const plans = await loadAllPlansForGrade(selectedGrade);
      if (plans.length === 0) {
        setInterState('error');
        setInterMsg(`Aucune unité pour ${selectedGrade}. Générez d'abord les planifications annuelles.`);
        return;
      }
      const result = await generateAutoInterdisciplinaryForGrade(
        selectedGrade, plans, (msg) => setInterMsg(msg)
      );
      // Persist
      const existing: InterdisciplinaryUnit[] = JSON.parse(localStorage.getItem('interdisciplinary_units') || '[]');
      const merged = [...existing.filter(u => !result.some(r => r.id === u.id)), ...result];
      localStorage.setItem('interdisciplinary_units', JSON.stringify(merged));
      const forGrade = merged.filter(u => u.grade === selectedGrade);
      setSavedInter(forGrade);
      setSpecialCounts(prev => ({ ...prev, [selectedGrade]: { ...prev[selectedGrade], inter: forGrade.length } }));
      setInterState('done');
      setInterMsg(`✅ ${result.length} unité(s) interdisciplinaire(s) générée(s) et sauvegardée(s).`);
      setShowInterList(true);
    } catch (e: unknown) {
      setInterState('error');
      setInterMsg((e as Error)?.message || 'Erreur lors de la génération.');
    }
  };

  // ── Auto-generate SEA ─────────────────────────────────────────────────────
  const handleAutoGenerateSEA = async () => {
    if (!selectedGrade) return;
    setSeaState('loading');
    setSeaProgress(null);
    setSeaMsg('Chargement des unités…');
    try {
      const plans = await loadAllPlansForGrade(selectedGrade);
      if (plans.length === 0) {
        setSeaState('error');
        setSeaMsg(`Aucune unité pour ${selectedGrade}. Générez d'abord les planifications annuelles.`);
        return;
      }
      const result = await generateServiceActionForGrade(
        plans,
        selectedGrade,
        (current, total, unitTitle) => {
          setSeaProgress({ current, total, unitTitle });
          setSeaMsg(`Projet ${current}/${total} — ${unitTitle}`);
        }
      );
      // Persist
      const existing: ServiceActionPlan[] = JSON.parse(localStorage.getItem('sea_plans') || '[]');
      const merged = [...existing.filter(s => !result.some(r => r.id === s.id)), ...result];
      localStorage.setItem('sea_plans', JSON.stringify(merged));
      const forGrade = merged.filter(s => s.grade === selectedGrade);
      setSavedSEA(forGrade);
      setSpecialCounts(prev => ({ ...prev, [selectedGrade]: { ...prev[selectedGrade], sea: forGrade.length } }));
      setSeaState('done');
      setSeaMsg(`✅ ${result.length} projet(s) SEA générés et sauvegardés.`);
      setSeaProgress(null);
      setShowSeaList(true);
    } catch (e: unknown) {
      setSeaState('error');
      setSeaMsg((e as Error)?.message || 'Erreur lors de la génération SEA.');
      setSeaProgress(null);
    }
  };

  // ── Delete handlers ───────────────────────────────────────────────────────
  const handleDeleteInter = (id: string) => {
    if (!window.confirm('Supprimer cette unité interdisciplinaire ?')) return;
    const all: InterdisciplinaryUnit[] = JSON.parse(localStorage.getItem('interdisciplinary_units') || '[]');
    const filtered = all.filter(u => u.id !== id);
    localStorage.setItem('interdisciplinary_units', JSON.stringify(filtered));
    const forGrade = filtered.filter(u => u.grade === selectedGrade);
    setSavedInter(forGrade);
    if (selectedGrade) {
      setSpecialCounts(prev => ({ ...prev, [selectedGrade]: { ...prev[selectedGrade], inter: forGrade.length } }));
    }
  };

  const handleDeleteSEA = (id: string) => {
    if (!window.confirm('Supprimer ce projet SEA ?')) return;
    const all: ServiceActionPlan[] = JSON.parse(localStorage.getItem('sea_plans') || '[]');
    const filtered = all.filter(s => s.id !== id);
    localStorage.setItem('sea_plans', JSON.stringify(filtered));
    const forGrade = filtered.filter(s => s.grade === selectedGrade);
    setSavedSEA(forGrade);
    if (selectedGrade) {
      setSpecialCounts(prev => ({ ...prev, [selectedGrade]: { ...prev[selectedGrade], sea: forGrade.length } }));
    }
  };

  // ── Export CSV global (toutes données BDD) ───────────────────────────────
  const [isExportingCSV, setIsExportingCSV] = useState(false);

  const handleExportAllCSV = async () => {
    setIsExportingCSV(true);
    try {
      const response = await fetch(`/api/planifications?export=excel&t=${Date.now()}`);
      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export_toutes_donnees_PEI_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        // Fallback : export local depuis localStorage
        const rawPlans: Record<string, unknown>[] = [];
        const PEI_GRADES_LOCAL = ['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'];
        const SUBJECTS_LOCAL = [
          'Langue et littérature', 'Acquisition de langues', 'Individus et sociétés',
          'Sciences', 'Mathématiques', 'Arts', 'Éducation physique et à la santé', 'Design'
        ];
        for (const grade of PEI_GRADES_LOCAL) {
          for (const subject of SUBJECTS_LOCAL) {
            const key = `plans_${subject}_${grade}`;
            const raw = localStorage.getItem(key);
            if (raw) {
              try {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) rawPlans.push(...parsed);
              } catch { /* ignore */ }
            }
          }
        }
        if (rawPlans.length === 0) {
          alert('Aucune donnée disponible pour l\'export.');
          return;
        }
        const headers = [
          'Titre', 'Matière', 'Niveau', 'Enseignant', 'Durée',
          'Concept clé', 'Contexte mondial', 'Énoncé de recherche',
          'Objectifs', 'ATL', 'Évaluation formative', 'Évaluation sommative',
        ];
        const rows = rawPlans.map((p: any) => [
          p.title || '', p.subject || '', p.gradeLevel || '', p.teacherName || '', p.duration || '',
          p.keyConcept || '', p.globalContext || '', p.statementOfInquiry || '',
          (p.objectives || []).join('; '),
          (Array.isArray(p.atlSkills) ? p.atlSkills : [p.atlSkills || '']).join('; '),
          (p.formativeAssessment || '').replace(/\n/g, ' '),
          (p.summativeAssessment || '').replace(/\n/g, ' '),
        ]);
        const csv = '\uFEFF' + [headers, ...rows]
          .map(row => row.map((c: string) => `"${String(c).replace(/"/g, '""')}"`).join(','))
          .join('\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `export_local_PEI_${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (e: unknown) {
      alert('Erreur lors de l\'export : ' + (e as Error)?.message);
    } finally {
      setIsExportingCSV(false);
    }
  };

  // ── Export helpers ────────────────────────────────────────────────────────
  const handleExportInter = () => {
    if (savedInter.length === 0) { alert('Aucune unité interdisciplinaire sauvegardée.'); return; }
    try { exportCompleteInterdisciplinaryThemePlan(savedInter); }
    catch (e: unknown) { alert('Erreur export: ' + (e as Error)?.message); }
  };

  const handleExportSEA = async () => {
    if (savedSEA.length === 0) { alert('Aucun projet SEA sauvegardé.'); return; }
    try { await exportSEAOverviewToWord(savedSEA); }
    catch (e: unknown) { alert('Erreur export SEA: ' + (e as Error)?.message); }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const gc = selectedGrade ? GRADE_CONFIG[selectedGrade] : null;
  const specialValues: { inter: number; sea: number }[] = Object.values(specialCounts);
  const totalInter = specialValues.reduce((s, v) => s + v.inter, 0);
  const totalSEA = specialValues.reduce((s, v) => s + v.sea, 0);
  const unitValues: number[] = Object.values(gradeUnitCounts);
  const totalUnits = unitValues.reduce((s, v) => s + v, 0);

  // ── Import CSV handler ────────────────────────────────────────────────────
  const handleImportCSV = async (file: File) => {
    // Délégué à AdminPanel — ici on rafraîchit juste les stats
    setTimeout(() => {
      window.location.reload();
    }, 500);
  };

  return (
    <>
    {/* Admin Panel Modal */}
    {showAdminPanel && isAdmin && (
      <AdminPanel
        onClose={() => setShowAdminPanel(false)}
        onExportCSV={handleExportAllCSV}
        onImportCSV={handleImportCSV}
      />
    )}
    <div className="min-h-screen bg-gradient-to-br from-slate-100 via-blue-50 to-indigo-100">

      {/* ══ HEADER ══ */}
      <header className="bg-gradient-to-r from-indigo-700 via-blue-600 to-cyan-600 shadow-2xl">
        <div className="max-w-6xl mx-auto px-4 py-5 flex items-center justify-between gap-4">

          {/* Logo + Title */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-white shadow-lg overflow-hidden flex-shrink-0 flex items-center justify-center border-2 border-white/30">
              <img
                src="/logo-alkawtar.png"
                alt="Al Kawthar"
                className="w-full h-full object-contain p-0.5"
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-extrabold text-white tracking-tight flex items-center gap-2">
                <Layers size={20} className="flex-shrink-0" />
                PEI Planner
              </h1>
              <p className="text-blue-200 text-xs truncate">Les Écoles Internationales Al-Kawthar</p>
            </div>
          </div>

          {/* Breadcrumb */}
          {selectedGrade && gc && (
            <div className="flex-1 flex items-center justify-center">
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg text-sm font-medium transition"
              >
                <ChevronLeft size={15} />
                Accueil
              </button>
              <span className="text-white/40 mx-2">/</span>
              <span className="text-white font-semibold text-sm">{selectedGrade}</span>
            </div>
          )}

          {/* Right actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <div className="hidden sm:block text-right">
              <p className="text-blue-100 text-xs">Connecté en tant que</p>
              <p className="text-white text-xs font-semibold">
                {userName}
                {isAdmin && <span className="ml-1 text-yellow-300 text-xs">★ Admin</span>}
              </p>
            </div>

            {/* Bouton Export CSV — admin seulement */}
            {isAdmin && (
              <button
                onClick={handleExportAllCSV}
                disabled={isExportingCSV}
                title="Exporter toutes les données en CSV (Excel)"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/80 hover:bg-emerald-400 disabled:opacity-60 text-white rounded-lg text-xs font-semibold transition border border-emerald-300/40 shadow-sm"
              >
                {isExportingCSV
                  ? <Loader2 size={13} className="animate-spin" />
                  : <Table size={13} />
                }
                <span className="hidden sm:inline">{isExportingCSV ? 'Export…' : 'Export CSV'}</span>
              </button>
            )}

            {/* Bouton Admin Panel — admin seulement */}
            {isAdmin && (
              <button
                onClick={() => setShowAdminPanel(true)}
                title="Panneau d'administration"
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/80 hover:bg-amber-400 text-white rounded-lg text-xs font-semibold transition border border-amber-300/40 shadow-sm"
              >
                <Shield size={13} />
                <span className="hidden sm:inline">Admin</span>
              </button>
            )}

            {userRole !== 'exams_only' && (
              <button
                onClick={onGoToExams}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 text-white rounded-lg text-xs font-semibold transition border border-white/20"
              >
                📝 Examens
              </button>
            )}
            <button
              onClick={onLogout}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-red-500/60 text-white rounded-lg text-xs font-medium transition border border-white/10"
            >
              <LogOut size={13} />
              <span className="hidden sm:inline">Déconnexion</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">

        {/* ══ Bandeau enseignant ══ */}
        {!isAdmin && currentUser && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-center gap-3 text-sm text-blue-800">
            <Lock size={16} className="flex-shrink-0 text-blue-500" />
            <div>
              <span className="font-semibold">Mode enseignant</span> — Vous avez accès à{' '}
              {currentUser.subjects.length > 0
                ? <><span className="font-bold">{currentUser.subjects.join(', ')}</span>, aux unités interdisciplinaires et aux planifications SEA.</>
                : 'toutes les matières (aucune restriction configurée).'}
              <span className="ml-2 text-blue-600">Pour modifier des données, utilisez « Demander une modification ».</span>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            VUE 1 — Sélection de la classe
        ══════════════════════════════════════════════════════════════ */}
        {!selectedGrade && (
          <div className="space-y-8">

            {/* Welcome banner */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row items-center gap-5">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-lg flex-shrink-0">
                <GraduationCap size={32} className="text-white" />
              </div>
              <div className="text-center sm:text-left flex-1">
                <h2 className="text-xl font-extrabold text-slate-800">Bienvenue, {userName} !</h2>
                <p className="text-slate-500 text-sm mt-1">
                  Sélectionnez une classe pour accéder à ses matières, au thème interdisciplinaire et aux projets Service et Action.
                </p>
              </div>
              <div className="flex gap-3 flex-shrink-0">
                <div className="text-center bg-blue-50 rounded-xl px-4 py-2 border border-blue-100">
                  <p className="text-2xl font-black text-blue-700">{gradeStatsLoading ? '…' : totalUnits}</p>
                  <p className="text-xs text-blue-500 font-medium">unités</p>
                </div>
                <div className="text-center bg-fuchsia-50 rounded-xl px-4 py-2 border border-fuchsia-100">
                  <p className="text-2xl font-black text-fuchsia-700">{totalInter}</p>
                  <p className="text-xs text-fuchsia-500 font-medium">inter.</p>
                </div>
                <div className="text-center bg-rose-50 rounded-xl px-4 py-2 border border-rose-100">
                  <p className="text-2xl font-black text-rose-700">{totalSEA}</p>
                  <p className="text-xs text-rose-500 font-medium">SEA</p>
                </div>
              </div>
            </div>

            {/* Section title */}
            <div>
              <h3 className="text-base font-bold text-slate-600 mb-4 flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs font-bold flex-shrink-0">1</span>
                Choisissez une classe
              </h3>

              {/* Grade cards grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
                {PEI_GRADES.map(grade => {
                  const cfg = GRADE_CONFIG[grade];
                  const units = gradeUnitCounts[grade] ?? 0;
                  const sp = specialCounts[grade] ?? { inter: 0, sea: 0 };
                  return (
                    <button
                      key={grade}
                      onClick={() => handleGradeSelect(grade)}
                      className="group relative flex flex-col items-center gap-3 p-5 bg-white rounded-2xl border-2 border-slate-200 hover:border-indigo-300 shadow-sm hover:shadow-xl transition-all duration-200 hover:-translate-y-1 active:scale-95 overflow-hidden"
                    >
                      {/* Background gradient on hover */}
                      <div className="absolute inset-0 bg-gradient-to-br from-indigo-50 to-blue-50 opacity-0 group-hover:opacity-100 transition-opacity rounded-2xl" />

                      {/* Avatar */}
                      <div className={`relative z-10 w-16 h-16 rounded-2xl bg-gradient-to-br ${cfg.color} flex items-center justify-center text-4xl shadow-lg`}>
                        {cfg.emoji}
                      </div>

                      {/* Grade name */}
                      <div className="relative z-10 text-center">
                        <p className="text-base font-black text-slate-800">{grade}</p>
                        <p className="text-xs text-slate-400 font-medium">{cfg.label}</p>
                      </div>

                      {/* Stats */}
                      <div className="relative z-10 flex flex-col items-center gap-1 w-full">
                        {gradeStatsLoading ? (
                          <Loader2 size={12} className="animate-spin text-slate-300" />
                        ) : (
                          <>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${units > 0 ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-400'}`}>
                              {units > 0 ? `${units} unité${units > 1 ? 's' : ''}` : 'Vide'}
                            </span>
                            {(sp.inter > 0 || sp.sea > 0) && (
                              <div className="flex gap-1">
                                {sp.inter > 0 && <span className="text-xs bg-fuchsia-100 text-fuchsia-700 px-1.5 py-0.5 rounded-full font-medium">{sp.inter} 🔀</span>}
                                {sp.sea > 0 && <span className="text-xs bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded-full font-medium">{sp.sea} ❤️</span>}
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ══════════════════════════════════════════════════════════════
            VUE 2 — Matières + Interdisciplinaire + SEA pour la classe
        ══════════════════════════════════════════════════════════════ */}
        {selectedGrade && gc && (
          <div className="space-y-6">

            {/* Grade hero card */}
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-5">
              <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${gc.color} flex items-center justify-center text-4xl shadow-lg flex-shrink-0`}>
                {gc.emoji}
              </div>
              <div className="flex-1 min-w-0">
                <h2 className="text-2xl font-extrabold text-slate-800">{selectedGrade} <span className="text-slate-400 font-normal text-lg">— {gc.label}</span></h2>
                {subjectCountsLoading ? (
                  <div className="flex items-center gap-2 text-slate-400 text-sm mt-1">
                    <Loader2 size={14} className="animate-spin" /> Chargement des données…
                  </div>
                ) : (
                  <p className="text-slate-500 text-sm mt-1">
                    <span className="font-semibold text-blue-700">{Object.values(subjectCounts).reduce((a: number, b: number) => a + b, 0)}</span> unités planifiées
                    {savedInter.length > 0 && <> · <span className="font-semibold text-fuchsia-700">{savedInter.length}</span> unité(s) interdisciplinaire(s)</>}
                    {savedSEA.length > 0 && <> · <span className="font-semibold text-rose-700">{savedSEA.length}</span> projet(s) SEA</>}
                  </p>
                )}
              </div>
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-sm font-medium transition flex-shrink-0"
              >
                <ChevronLeft size={15} /> Retour
              </button>
            </div>

            {/* Section: Matières */}
            <div>
              <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                <span className="w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold">2</span>
                Matières
              </h3>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {SUBJECTS.map(subject => {
                  // Filtrer les matières pour les enseignants
                  const canAccess = isAdmin || !currentUser || currentUser.subjects.length === 0 || currentUser.subjects.includes(subject);

                  const meta = SUBJECT_META[subject] || {
                    label: subject,
                    icon: <Globe size={28} />,
                    bg: 'bg-slate-50',
                    text: 'text-slate-700',
                    border: 'border-slate-200',
                    ring: 'ring-slate-300',
                    badge: 'bg-slate-600',
                  };
                  const count = subjectCounts[subject] ?? 0;

                  if (!canAccess) {
                    // Afficher la carte verrouillée pour les enseignants sans accès
                    return (
                      <div
                        key={subject}
                        className="relative flex flex-col items-center gap-2 p-4 bg-slate-100 rounded-2xl border-2 border-slate-200 opacity-50 cursor-not-allowed"
                        title="Vous n'avez pas accès à cette matière"
                      >
                        <Lock size={20} className="text-slate-400 mt-1" />
                        <span className="text-xs font-bold text-center leading-tight text-slate-400 whitespace-pre-line">
                          {meta.label}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-slate-200 text-slate-400">
                          Accès refusé
                        </span>
                      </div>
                    );
                  }

                  return (
                    <button
                      key={subject}
                      onClick={() => onSelectSubjectGrade(subject, selectedGrade, AppMode.PEI_PLANNER)}
                      className={`group relative flex flex-col items-center gap-2 p-4 ${meta.bg} rounded-2xl border-2 ${meta.border} hover:ring-4 ${meta.ring} hover:ring-opacity-50 transition-all duration-200 hover:shadow-lg hover:-translate-y-0.5 active:scale-95`}
                    >
                      {/* Badge */}
                      {count > 0 && (
                        <span className={`absolute top-2 right-2 ${meta.badge} text-white text-xs font-bold min-w-[20px] h-5 px-1 rounded-full flex items-center justify-center`}>
                          {count > 9 ? '9+' : count}
                        </span>
                      )}

                      {/* Icon */}
                      <div className={`${meta.text} mt-1`}>
                        {meta.icon}
                      </div>

                      {/* Label */}
                      <span className={`text-xs font-bold text-center leading-tight ${meta.text} whitespace-pre-line`}>
                        {meta.label}
                      </span>

                      {/* Status indicator */}
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${count > 0 ? 'bg-green-100 text-green-700' : 'bg-white/70 text-slate-400'}`}>
                        {count > 0 ? `${count} unité${count > 1 ? 's' : ''}` : 'À planifier'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                Section: Thème Interdisciplinaire
            ───────────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-fuchsia-50 to-purple-50 rounded-2xl border-2 border-fuchsia-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-fuchsia-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-fuchsia-600 flex items-center justify-center shadow">
                    <GitMerge size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-fuchsia-800 text-base">Thème Interdisciplinaire</h3>
                    <p className="text-fuchsia-500 text-xs">Unités croisant plusieurs matières — norme IB PEI</p>
                  </div>
                </div>
                {savedInter.length > 0 && (
                  <span className="bg-fuchsia-600 text-white text-sm font-bold px-3 py-1 rounded-full">
                    {savedInter.length} unité{savedInter.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Status message */}
                {interState !== 'idle' && (
                  <div className={`rounded-xl p-3 text-sm flex items-start gap-2 ${
                    interState === 'loading' ? 'bg-white/80 text-slate-600' :
                    interState === 'done' ? 'bg-green-50 text-green-700 border border-green-200' :
                    'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {interState === 'loading' && <Loader2 size={14} className="animate-spin flex-shrink-0 mt-0.5" />}
                    {interState === 'done' && <CheckCircle size={14} className="text-green-600 flex-shrink-0 mt-0.5" />}
                    {interState === 'error' && <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />}
                    <span>{interMsg}</span>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleAutoGenerateInter}
                    disabled={interState === 'loading'}
                    className="flex items-center gap-2 px-4 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow transition"
                  >
                    {interState === 'loading'
                      ? <><Loader2 size={14} className="animate-spin" /> Génération en cours…</>
                      : interState === 'done'
                      ? <><RefreshCw size={14} /> Regénérer</>
                      : <><Sparkles size={14} /> Générer automatiquement</>
                    }
                  </button>

                  {savedInter.length > 0 && (
                    <>
                      <button
                        onClick={handleExportInter}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-fuchsia-50 border border-fuchsia-300 text-fuchsia-700 rounded-xl text-sm font-semibold transition shadow-sm"
                      >
                        <Download size={14} /> Plan complet Word
                      </button>
                      <button
                        onClick={() => setShowInterList(v => !v)}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-fuchsia-50 border border-fuchsia-200 text-fuchsia-600 rounded-xl text-sm font-medium transition shadow-sm"
                      >
                        {showInterList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {showInterList ? 'Masquer' : 'Voir les unités'}
                      </button>
                    </>
                  )}
                </div>

                {/* Help tip */}
                {interState === 'idle' && savedInter.length === 0 && (
                  <p className="text-xs text-fuchsia-600 bg-fuchsia-50 border border-fuchsia-100 rounded-lg p-2.5">
                    💡 La génération automatique analyse toutes les unités de {selectedGrade}, identifie les matières partageant des concepts communs et crée 2 unités interdisciplinaires conformes aux normes IB PEI.
                  </p>
                )}

                {/* Saved interdisciplinary units list */}
                {showInterList && savedInter.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {savedInter.map((u, i) => (
                      <div key={u.id} className="bg-white rounded-xl p-3 border border-fuchsia-100 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-fuchsia-500 font-semibold mb-0.5">
                              Unité {i + 1} · {u.disciplines?.join(' + ') || 'Interdisciplinaire'}
                            </p>
                            <p className="text-sm font-bold text-slate-800 truncate">{u.title}</p>
                            {u.statementOfInquiry && (
                              <p className="text-xs text-slate-500 mt-0.5 italic line-clamp-1">📌 {u.statementOfInquiry}</p>
                            )}
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {(u.summativeCriteria || []).map(c => (
                                <span key={c.criterion} className="text-xs bg-fuchsia-100 text-fuchsia-700 px-2 py-0.5 rounded-full font-medium">
                                  Critère {c.criterion} /8
                                </span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => { try { exportInterdisciplinaryToWord(u); } catch (e: unknown) { alert((e as Error)?.message); } }}
                              className="p-1.5 text-fuchsia-600 hover:bg-fuchsia-50 rounded-lg transition"
                              title="Exporter cette unité"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteInter(u.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                Section: Service en tant qu'Action (SEA)
            ───────────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-rose-50 to-pink-50 rounded-2xl border-2 border-rose-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-rose-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-rose-600 flex items-center justify-center shadow">
                    <Heart size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-rose-800 text-base">Service en tant qu'Action</h3>
                    <p className="text-rose-500 text-xs">Projets SEA liés aux unités — engagement et réflexion IB</p>
                  </div>
                </div>
                {savedSEA.length > 0 && (
                  <span className="bg-rose-600 text-white text-sm font-bold px-3 py-1 rounded-full">
                    {savedSEA.length} projet{savedSEA.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              <div className="p-4 space-y-3">
                {/* Status message */}
                {seaState !== 'idle' && (
                  <div className={`rounded-xl p-3 text-sm flex items-start gap-2 ${
                    seaState === 'loading' ? 'bg-white/80 text-slate-600' :
                    seaState === 'done' ? 'bg-green-50 text-green-700 border border-green-200' :
                    'bg-red-50 text-red-700 border border-red-200'
                  }`}>
                    {seaState === 'loading' && <Loader2 size={14} className="animate-spin flex-shrink-0 mt-0.5" />}
                    {seaState === 'done' && <CheckCircle size={14} className="text-green-600 flex-shrink-0 mt-0.5" />}
                    {seaState === 'error' && <AlertCircle size={14} className="text-red-600 flex-shrink-0 mt-0.5" />}
                    <span>{seaMsg}</span>
                  </div>
                )}

                {/* Progress bar */}
                {seaState === 'loading' && seaProgress && (
                  <div className="space-y-1">
                    <div className="flex items-center justify-between text-xs text-rose-600 font-medium">
                      <span>Projet {seaProgress.current}/{seaProgress.total}</span>
                      <span className="truncate max-w-[200px]">{seaProgress.unitTitle}</span>
                    </div>
                    <div className="w-full bg-rose-200 rounded-full h-2">
                      <div
                        className="bg-rose-600 h-2 rounded-full transition-all duration-700"
                        style={{ width: `${(seaProgress.current / seaProgress.total) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={handleAutoGenerateSEA}
                    disabled={seaState === 'loading'}
                    className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow transition"
                  >
                    {seaState === 'loading'
                      ? <><Loader2 size={14} className="animate-spin" /> Génération en cours…</>
                      : seaState === 'done'
                      ? <><RefreshCw size={14} /> Regénérer</>
                      : <><Sparkles size={14} /> Générer automatiquement</>
                    }
                  </button>

                  {savedSEA.length > 0 && (
                    <>
                      <button
                        onClick={handleExportSEA}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-rose-50 border border-rose-300 text-rose-700 rounded-xl text-sm font-semibold transition shadow-sm"
                      >
                        <Download size={14} /> Tableau SEA Word
                      </button>
                      <button
                        onClick={() => setShowSeaList(v => !v)}
                        className="flex items-center gap-2 px-4 py-2 bg-white hover:bg-rose-50 border border-rose-200 text-rose-600 rounded-xl text-sm font-medium transition shadow-sm"
                      >
                        {showSeaList ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                        {showSeaList ? 'Masquer' : 'Voir les projets'}
                      </button>
                    </>
                  )}
                </div>

                {/* Help tip */}
                {seaState === 'idle' && savedSEA.length === 0 && (
                  <p className="text-xs text-rose-600 bg-rose-50 border border-rose-100 rounded-lg p-2.5">
                    💡 La génération automatique crée un projet SEA IB pour chaque unité planifiée dans {selectedGrade} : identification, description, objectifs d'apprentissage, compétences ATL, journal de réflexion et critères de réussite.
                  </p>
                )}

                {/* Saved SEA plans list */}
                {showSeaList && savedSEA.length > 0 && (
                  <div className="space-y-2 pt-1">
                    {savedSEA.map((sea, i) => (
                      <div key={sea.id} className="bg-white rounded-xl p-3 border border-rose-100 shadow-sm">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs text-rose-500 font-semibold mb-0.5">
                              Projet {i + 1} · {sea.subject}
                              {sea.teacherName && <span className="text-slate-400"> · {sea.teacherName}</span>}
                            </p>
                            <p className="text-sm font-bold text-slate-800 truncate">{sea.title}</p>
                            <p className="text-xs text-slate-500 mt-0.5 italic line-clamp-1">
                              Basé sur : {sea.sourceUnitTitle}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {sea.actionTypes?.map(t => (
                                <span key={t} className="text-xs bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-medium">{t}</span>
                              ))}
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={() => { try { exportSEAPlanToWord(sea); } catch (e: unknown) { alert((e as Error)?.message); } }}
                              className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition"
                              title="Exporter ce projet SEA"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              onClick={() => handleDeleteSEA(sea.id)}
                              className="p-1.5 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition"
                              title="Supprimer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ─────────────────────────────────────────────────────────
                Section: Google Drive — Dépôt des travaux d'élèves
            ───────────────────────────────────────────────────────── */}
            <div className="bg-gradient-to-br from-sky-50 to-cyan-50 rounded-2xl border-2 border-sky-200 shadow-sm overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between p-4 border-b border-sky-100">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-sky-600 flex items-center justify-center shadow">
                    <FolderOpen size={20} className="text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sky-800 text-base">Dépôt des travaux d'élèves</h3>
                    <p className="text-sky-500 text-xs">Accès au dossier Google Drive partagé pour {selectedGrade}</p>
                  </div>
                </div>
                <span className="bg-sky-100 text-sky-700 text-xs font-bold px-3 py-1 rounded-full border border-sky-200">
                  Google Drive
                </span>
              </div>

              <div className="p-4 space-y-3">
                {/* Drive link card */}
                <div className="bg-white rounded-xl border border-sky-100 shadow-sm p-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-slate-700 mb-0.5">
                      Dossier partagé — Travaux &amp; Productions {selectedGrade}
                    </p>
                    <p className="text-xs text-slate-500">
                      Déposez les copies, évaluations et portfolios des élèves directement dans le dossier Google Drive de l'établissement.
                    </p>
                  </div>
                  <a
                    href="https://drive.google.com/drive/folders/1qwx0XnrnRRCcK3o_AMr07n1YHCm4-oJ4"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl text-sm font-semibold shadow transition whitespace-nowrap flex-shrink-0"
                  >
                    <FolderOpen size={16} />
                    Ouvrir le dossier Drive
                    <ExternalLink size={13} className="opacity-75" />
                  </a>
                </div>

                {/* Upload instructions */}
                <div className="bg-sky-50 border border-sky-100 rounded-xl p-3 text-xs text-sky-700 space-y-1.5">
                  <p className="font-semibold text-sky-800">📋 Comment déposer des fichiers :</p>
                  <ol className="list-decimal list-inside space-y-1 text-sky-700">
                    <li>Cliquez sur <strong>Ouvrir le dossier Drive</strong> ci-dessus</li>
                    <li>Créez un sous-dossier par matière ou par élève si nécessaire</li>
                    <li>Glissez-déposez les fichiers ou cliquez sur <strong>+ Nouveau → Importer des fichiers</strong></li>
                    <li>Les fichiers sont immédiatement accessibles à toute l'équipe pédagogique</li>
                  </ol>
                </div>
              </div>
            </div>

            {/* Bottom tip */}
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-4 flex gap-3 items-start text-sm text-blue-700">
              <BookMarked size={16} className="flex-shrink-0 mt-0.5 text-blue-500" />
              <span>
                <strong>Astuce :</strong> Générez d'abord toutes les planifications annuelles de chaque matière pour {selectedGrade}, puis utilisez les boutons <em>Thème Interdisciplinaire</em> et <em>Service et Action</em> — l'IA analysera automatiquement les unités pour créer des projets cohérents avec les objectifs IB communs.
              </span>
            </div>

          </div>
        )}
      </main>
    </div>
    </>
  );
};

export default HomeScreen;
