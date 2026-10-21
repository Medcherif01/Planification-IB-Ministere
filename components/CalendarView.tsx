import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X, Sparkles, RefreshCw, Download, Loader2, CheckCircle,
  AlertCircle, ChevronLeft, ChevronRight, Edit3, Save,
  Calendar, BookOpen, RotateCcw, Info, ZoomIn, ZoomOut,
} from 'lucide-react';
import {
  SCHOOL_WEEKS_2026_2027,
  SUBJECT_COLORS,
  generateAnnualCalendarWithAI,
  extractUnitWeeklyChapters,
  CalendarEntry,
  AnnualCalendar,
} from '../services/geminiService';
import { exportCalendarToWord } from '../services/wordExportService';
import { loadAllPlansForGrade } from '../services/databaseService';
import type { UnitPlan } from '../types';
import type { InterdisciplinaryUnit } from '../services/geminiService';
import { SUBJECTS } from '../constants';

// ─── Props ────────────────────────────────────────────────────────────────────
interface CalendarViewProps {
  grade: string;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const getSubjectColor = (subject: string): string => {
  return SUBJECT_COLORS[subject] || '#6b7280';
};

const getSubjectAbbr = (subject: string): string => {
  const map: Record<string, string> = {
    'Langue et littérature': 'L&L',
    'Acquisition de langues': 'AcqL',
    'Individus et sociétés': 'I&S',
    'Sciences': 'Sci',
    'Mathématiques': 'Math',
    'Arts': 'Arts',
    'Éducation physique et à la santé': 'EPS',
    'Design': 'Des',
    'Interdisciplinaire': 'Inter',
    'SEA': 'SEA',
  };
  return map[subject] || subject.slice(0, 4);
};

const lighten = (hex: string, amount = 0.85): string => {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const lr = Math.round(r + (255 - r) * amount);
  const lg = Math.round(g + (255 - g) * amount);
  const lb = Math.round(b + (255 - b) * amount);
  return `rgb(${lr},${lg},${lb})`;
};

const STORAGE_KEY = (grade: string) => `annual_calendar_${grade}`;

// ─── Component ────────────────────────────────────────────────────────────────
const CalendarView: React.FC<CalendarViewProps> = ({ grade, onClose }) => {
  const [calendar, setCalendar] = useState<AnnualCalendar | null>(null);
  const [genState, setGenState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [genMsg, setGenMsg] = useState('');
  const [editMode, setEditMode] = useState(false);
  const [editEntry, setEditEntry] = useState<CalendarEntry | null>(null);
  const [editWeek, setEditWeek] = useState<number>(1);
  const [plansBySubject, setPlansBySubject] = useState<Record<string, UnitPlan[]>>({});
  const [isExporting, setIsExporting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [filterSubject, setFilterSubject] = useState<string>('');
  const [zoom, setZoom] = useState<'compact' | 'normal' | 'large'>('normal');

  // ── Chargement initial & enrichissement automatique des chapitres ──────────
  useEffect(() => {
    const loadPlansAndCalendar = async () => {
      const bySubject: Record<string, UnitPlan[]> = {};
      try {
        const allPlans = await loadAllPlansForGrade(grade);
        SUBJECTS.forEach(subj => {
          bySubject[subj] = allPlans.filter(p => p.subject === subj);
        });
      } catch {
        SUBJECTS.forEach(subj => { bySubject[subj] = []; });
      }
      setPlansBySubject(bySubject);

      // Charger le calendrier sauvegardé et l'enrichir avec les chapitres si nécessaire
      const saved = localStorage.getItem(STORAGE_KEY(grade));
      if (saved) {
        try {
          const parsedCal = JSON.parse(saved) as AnnualCalendar;
          if (parsedCal && Array.isArray(parsedCal.entries)) {
            // Enrichir chaque entrée n'ayant pas encore de chapitre précis
            const enrichedEntries = parsedCal.entries.map(e => ({ ...e }));
            for (const [subj, plans] of Object.entries(bySubject)) {
              if (!plans || plans.length === 0) continue;
              plans.forEach((plan, uIdx) => {
                const unitNum = uIdx + 1;
                const unitEntries = enrichedEntries
                  .filter(e => e.subject === subj && e.unitNumber === unitNum && e.type === 'unit')
                  .sort((a, b) => a.weekNum - b.weekNum);
                if (unitEntries.length > 0) {
                  const weeklyChaps = extractUnitWeeklyChapters(plan, unitEntries.length);
                  unitEntries.forEach((ue, wIdx) => {
                    if (!ue.chapter || ue.chapter.trim().length === 0) {
                      ue.chapter = weeklyChaps[Math.min(wIdx, weeklyChaps.length - 1)];
                    }
                    if (!ue.unitTitle || ue.unitTitle.startsWith('Unité ')) {
                      ue.unitTitle = plan.title || ue.unitTitle;
                    }
                  });
                }
              });
            }
            const updatedCal = { ...parsedCal, entries: enrichedEntries };
            setCalendar(updatedCal);
            localStorage.setItem(STORAGE_KEY(grade), JSON.stringify(updatedCal));
            setGenState('done');
          }
        } catch { /* ignore */ }
      }
    };
    loadPlansAndCalendar();
  }, [grade]);

  // ── Sauvegarde automatique ────────────────────────────────────────────────
  const saveCalendar = useCallback((cal: AnnualCalendar) => {
    localStorage.setItem(STORAGE_KEY(grade), JSON.stringify(cal));
    setCalendar(cal);
  }, [grade]);

  // ── Génération IA ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenState('loading');
    setGenMsg('Chargement des unités et des chapitres...');
    try {
      const allPlans = await loadAllPlansForGrade(grade);
      const bySubject: Record<string, UnitPlan[]> = {};
      SUBJECTS.forEach(s => { bySubject[s] = allPlans.filter(p => p.subject === s); });
      setPlansBySubject(bySubject);

      const hasPlans = Object.values(bySubject).some(p => p.length > 0);
      if (!hasPlans) {
        setGenState('error');
        setGenMsg(`Aucune unité planifiée pour ${grade}. Générez d'abord des planifications annuelles.`);
        return;
      }

      const rawInter = localStorage.getItem('interdisciplinary_units');
      const allInter: InterdisciplinaryUnit[] = rawInter ? JSON.parse(rawInter) : [];
      const interForGrade = allInter.filter(u => u.grade === grade);

      const result = await generateAnnualCalendarWithAI(
        grade, bySubject, interForGrade,
        (msg) => setGenMsg(msg)
      );

      saveCalendar(result);
      setGenState('done');
      setGenMsg(`✅ Calendrier annuel généré avec succès — ${result.entries.length} entrées (unités + chapitres de chaque semaine) sur 38 semaines.`);
    } catch (e: unknown) {
      setGenState('error');
      setGenMsg((e as Error)?.message || 'Erreur lors de la génération.');
    }
  };

  // ── Édition manuelle ──────────────────────────────────────────────────────
  const handleEntryClick = (entry: CalendarEntry) => {
    if (!editMode) return;
    setEditEntry({ ...entry });
    setEditWeek(entry.weekNum);
  };

  const handleSaveEdit = () => {
    if (!calendar || !editEntry) return;
    const updated: AnnualCalendar = {
      ...calendar,
      entries: calendar.entries.map(e => {
        if (
          e.weekNum === editEntry.weekNum &&
          e.subject === editEntry.subject &&
          e.unitNumber === editEntry.unitNumber &&
          e.type === editEntry.type
        ) {
          return { ...editEntry, weekNum: editWeek };
        }
        return e;
      }),
    };
    saveCalendar(updated);
    setEditEntry(null);
  };

  const handleDeleteEntry = (entry: CalendarEntry) => {
    if (!calendar) return;
    const updated: AnnualCalendar = {
      ...calendar,
      entries: calendar.entries.filter(e => !(
        e.weekNum === entry.weekNum &&
        e.subject === entry.subject &&
        e.unitNumber === entry.unitNumber &&
        e.type === entry.type
      )),
    };
    saveCalendar(updated);
  };

  const handleAddEntry = (weekNum: number) => {
    if (!calendar) return;
    const defaultSubj = filterSubject || SUBJECTS[0];
    const newEntry: CalendarEntry = {
      weekNum,
      subject: defaultSubj,
      unitNumber: 1,
      unitTitle: 'Unité 1',
      chapter: 'Chapitre 1 : Introduction',
      type: 'unit',
    };
    const updated: AnnualCalendar = {
      ...calendar,
      entries: [...calendar.entries, newEntry],
    };
    saveCalendar(updated);
  };

  // ── Export Word ───────────────────────────────────────────────────────────
  const handleExportWord = async () => {
    if (!calendar) return;
    setIsExporting(true);
    try {
      await exportCalendarToWord(calendar, grade);
    } catch (e: unknown) {
      alert('Erreur export : ' + (e as Error)?.message);
    } finally {
      setIsExporting(false);
    }
  };

  // ── Rendu des entrées pour une semaine ────────────────────────────────────
  const getEntriesForWeek = (weekNum: number): CalendarEntry[] => {
    if (!calendar) return [];
    return calendar.entries.filter(e =>
      e.weekNum === weekNum &&
      (filterSubject === '' || e.subject === filterSubject)
    );
  };

  // Toutes les matières présentes dans le calendrier
  const presentSubjects: string[] = calendar
    ? Array.from(new Set<string>(calendar.entries.map(e => e.subject))).sort()
    : [];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const cellHeight = zoom === 'compact' ? 'min-h-[64px]' : zoom === 'large' ? 'min-h-[140px]' : 'min-h-[96px]';
  const weekLabelW = zoom === 'compact' ? 'w-24' : 'w-32';

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-stretch justify-center overflow-hidden">
      <div className="relative bg-white w-full max-w-[1600px] flex flex-col h-full shadow-2xl">

        {/* ══ HEADER ══════════════════════════════════════════════════════════ */}
        <div className="bg-gradient-to-r from-teal-600 via-cyan-600 to-blue-600 px-6 py-4 flex items-center gap-4 flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
            <Calendar size={22} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white font-extrabold text-lg leading-tight">
              Calendrier annuel (Unités & Chapitres par semaine) — {grade}
            </h2>
            <p className="text-teal-100 text-xs">Année scolaire 2026-2027 · 38 semaines · Progression hebdomadaire des unités et chapitres</p>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap flex-shrink-0">
            {/* Zoom */}
            <button
              onClick={() => setZoom(z => z === 'compact' ? 'normal' : z === 'normal' ? 'large' : 'compact')}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-medium transition"
              title="Changer la taille des cellules"
            >
              {zoom === 'compact' ? <ZoomIn size={13} /> : zoom === 'large' ? <ZoomOut size={13} /> : <ZoomIn size={13} />}
              <span className="hidden sm:inline capitalize">{zoom}</span>
            </button>

            {/* Vue */}
            <button
              onClick={() => setViewMode(v => v === 'grid' ? 'list' : 'grid')}
              className="flex items-center gap-1 px-2.5 py-1.5 bg-white/15 hover:bg-white/25 text-white rounded-lg text-xs font-medium transition"
            >
              {viewMode === 'grid' ? 'Vue par Unité & Semaine' : 'Vue Grille 38 Semaines'}
            </button>

            {/* Edit mode */}
            <button
              onClick={() => { setEditMode(v => !v); setEditEntry(null); }}
              className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                editMode ? 'bg-amber-400 text-amber-900' : 'bg-white/15 hover:bg-white/25 text-white'
              }`}
            >
              <Edit3 size={13} />
              {editMode ? 'Mode édition ON' : 'Modifier'}
            </button>

            {/* Generate */}
            <button
              onClick={handleGenerate}
              disabled={genState === 'loading'}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-teal-500 hover:bg-teal-400 disabled:opacity-50 text-white rounded-lg text-xs font-semibold transition border border-teal-300/40"
            >
              {genState === 'loading'
                ? <><Loader2 size={13} className="animate-spin" /> Génération…</>
                : genState === 'done'
                ? <><RefreshCw size={13} /> Regénérer (Unités & Chapitres)</>
                : <><Sparkles size={13} /> Générer IA</>
              }
            </button>

            {/* Export */}
            {calendar && (
              <button
                onClick={handleExportWord}
                disabled={isExporting}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-teal-50 text-teal-700 rounded-lg text-xs font-semibold transition border border-teal-200 shadow-sm"
              >
                {isExporting ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                Export Word
              </button>
            )}

            <button onClick={onClose} className="p-2 hover:bg-white/15 rounded-lg text-white transition">
              <X size={18} />
            </button>
          </div>
        </div>

        {/* ══ STATUS BAR ═══════════════════════════════════════════════════════ */}
        {genMsg && (
          <div className={`px-6 py-2.5 text-sm flex items-center gap-2 flex-shrink-0 ${
            genState === 'loading' ? 'bg-teal-50 text-teal-700 border-b border-teal-100' :
            genState === 'done'    ? 'bg-green-50 text-green-700 border-b border-green-100' :
                                     'bg-red-50 text-red-700 border-b border-red-100'
          }`}>
            {genState === 'loading' && <Loader2 size={13} className="animate-spin flex-shrink-0" />}
            {genState === 'done'    && <CheckCircle size={13} className="flex-shrink-0" />}
            {genState === 'error'   && <AlertCircle size={13} className="flex-shrink-0" />}
            <span>{genMsg}</span>
          </div>
        )}

        {/* ══ LÉGENDE + FILTRES ════════════════════════════════════════════════ */}
        {calendar && (
          <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex-shrink-0 overflow-x-auto">
            <div className="flex items-center gap-3 flex-wrap min-w-max">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Matière :</span>

              {/* Bouton "Toutes" */}
              <button
                onClick={() => setFilterSubject('')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                  filterSubject === ''
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Toutes les matières
              </button>

              {presentSubjects.map(subj => {
                const color = getSubjectColor(subj);
                const isSelected = filterSubject === subj;
                return (
                  <button
                    key={subj}
                    onClick={() => setFilterSubject(isSelected ? '' : subj)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                      isSelected ? 'shadow-md ring-2 ring-offset-1' : 'opacity-80 hover:opacity-100'
                    }`}
                    style={{
                      backgroundColor: isSelected ? color : lighten(color, 0.8),
                      color: isSelected ? '#fff' : color,
                      borderColor: color,
                    }}
                    title={subj}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    {subj}
                  </button>
                );
              })}

              {/* Légende type */}
              <span className="ml-2 text-xs text-slate-400">|</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block w-4 h-3 rounded-sm bg-slate-200 border border-slate-300" /> Unité + Chapitre de la semaine
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block w-4 h-3 rounded-sm border-2 border-red-400 bg-red-50" /> Éval. sommative
              </span>
            </div>
          </div>
        )}

        {/* ══ EDIT MODE PANEL ══════════════════════════════════════════════════ */}
        {editMode && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0 flex items-center gap-3 text-xs text-amber-800">
            <Edit3 size={13} className="flex-shrink-0 text-amber-600" />
            <strong>Mode édition activé</strong> — cliquez sur une semaine/unité pour modifier l'unité, le chapitre de la semaine ou la déplacer.
          </div>
        )}

        {/* ══ MAIN CONTENT ═════════════════════════════════════════════════════ */}
        <div className="flex-1 overflow-auto">

          {/* ─── Pas de calendrier ─────────────────────────────────────────── */}
          {!calendar && genState !== 'loading' && (
            <div className="flex flex-col items-center justify-center h-full gap-6 text-center p-8">
              <div className="w-20 h-20 rounded-full bg-teal-100 flex items-center justify-center">
                <Calendar size={36} className="text-teal-600" />
              </div>
              <div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Aucun calendrier généré</h3>
                <p className="text-slate-500 max-w-md text-sm">
                  Cliquez sur <strong>Générer IA</strong> pour distribuer automatiquement chaque unité
                  et ses chapitres de chaque semaine sur les 38 semaines de l'année scolaire 2026-2027.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-sm transition shadow-lg"
              >
                <Sparkles size={16} />
                Générer le calendrier annuel (Unités & Chapitres)
              </button>
            </div>
          )}

          {/* ─── Loading ───────────────────────────────────────────────────── */}
          {genState === 'loading' && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 size={40} className="animate-spin text-teal-600" />
              <p className="text-slate-600 font-medium">{genMsg}</p>
              <p className="text-slate-400 text-sm">Répartition des unités et des chapitres sur les 38 semaines…</p>
            </div>
          )}

          {/* ─── GRILLE HEBDOMADAIRE (AVEC UNITÉ + CHAPITRE DE CHAQUE SEMAINE) ─── */}
          {calendar && genState !== 'loading' && viewMode === 'grid' && (
            <div className="p-4">
              <div className="space-y-2">
                {SCHOOL_WEEKS_2026_2027.map(week => {
                  const entries = getEntriesForWeek(week.num);
                  const isVacation = [16, 17].includes(week.num); // Noël
                  const isFerie = [12].includes(week.num); // Vacances Toussaint
                  const bg = isVacation || isFerie ? 'bg-slate-100' : 'bg-white';

                  return (
                    <div
                      key={week.num}
                      className={`flex gap-2 rounded-xl border ${isVacation ? 'border-slate-300 opacity-75' : 'border-slate-200'} ${bg} overflow-hidden hover:shadow-sm transition`}
                    >
                      {/* Numéro de semaine */}
                      <div className={`${weekLabelW} flex-shrink-0 flex flex-col items-center justify-center p-2.5 bg-slate-50 border-r border-slate-200`}>
                        <span className="text-slate-800 font-black text-sm">Semaine {week.num}</span>
                        <span className="text-slate-500 text-[10px] text-center leading-tight mt-0.5 font-medium">{week.dates}</span>
                        {(isVacation || isFerie) && (
                          <span className="mt-1 text-[9px] font-semibold text-slate-500 bg-slate-200 rounded px-1.5 py-0.5">Période allégée / Vacances</span>
                        )}
                      </div>

                      {/* Entrées (Unités + Chapitres de la semaine) */}
                      <div className={`flex-1 ${cellHeight} grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2 p-2.5 content-start`}>
                        {entries.length === 0 && !editMode && (
                          <span className="text-slate-300 text-xs italic self-center col-span-full">—</span>
                        )}
                        {entries.map((entry, i) => {
                          const color = getSubjectColor(entry.subject);
                          const isAssessment = entry.type === 'assessment';
                          return (
                            <div
                              key={i}
                              onClick={() => handleEntryClick(entry)}
                              title={`${entry.subject} — Unité ${entry.unitNumber} : ${entry.unitTitle}${entry.chapter ? `\nChapitre : ${entry.chapter}` : ''}${isAssessment ? `\nÉvaluation Critère ${entry.assessmentCriterion}` : ''}`}
                              className={`flex flex-col justify-between p-2.5 rounded-xl text-left transition group relative
                                ${editMode ? 'cursor-pointer hover:scale-[1.01] hover:shadow-md' : 'cursor-default'}
                                ${isAssessment ? 'border-2 shadow-2xs' : 'border'}`}
                              style={{
                                backgroundColor: isAssessment ? '#fff' : lighten(color, 0.86),
                                borderColor: color,
                                color: darken(color),
                              }}
                            >
                              {/* Ligne 1 : Matière + Numéro d'Unité */}
                              <div className="flex items-center justify-between gap-1.5 mb-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <span
                                    className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                                    style={{ backgroundColor: color }}
                                  />
                                  <span className="text-[10px] font-black uppercase tracking-wide truncate" style={{ color }}>
                                    {entry.subject}
                                  </span>
                                </div>
                                <span
                                  className="text-[10px] font-black px-1.5 py-0.5 rounded text-white flex-shrink-0"
                                  style={{ backgroundColor: color }}
                                >
                                  {isAssessment ? `★ Éval. Crit. ${entry.assessmentCriterion || 'A'}` : `Unité ${entry.unitNumber}`}
                                </span>
                              </div>

                              {/* Ligne 2 : Titre de l'unité */}
                              <div className="text-xs font-extrabold text-slate-900 leading-snug line-clamp-1">
                                {entry.unitTitle || `Unité ${entry.unitNumber}`}
                              </div>

                              {/* Ligne 3 : Chapitre de la semaine */}
                              {entry.chapter && (
                                <div className="mt-1 pt-1 border-t border-black/10 text-[11px] font-semibold text-slate-700 flex items-start gap-1 leading-snug">
                                  <BookOpen size={11} className="flex-shrink-0 mt-0.5" style={{ color }} />
                                  <span className="line-clamp-2">{entry.chapter}</span>
                                </div>
                              )}

                              {/* Delete button in edit mode */}
                              {editMode && (
                                <button
                                  type="button"
                                  className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-600 text-white opacity-0 group-hover:opacity-100 flex items-center justify-center text-[10px] font-bold shadow"
                                  onClick={(ev) => { ev.stopPropagation(); handleDeleteEntry(entry); }}
                                  title="Supprimer cette entrée"
                                >✕</button>
                              )}
                            </div>
                          );
                        })}

                        {/* Bouton Ajouter en mode édition */}
                        {editMode && (
                          <button
                            onClick={() => handleAddEntry(week.num)}
                            className="flex items-center justify-center gap-1 p-2 rounded-xl text-xs font-semibold border-2 border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-600 transition min-h-[60px]"
                          >
                            + Ajouter une entrée
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── VUE PAR UNITÉ & PROGRESSION HEBDOMADAIRE DES CHAPITRES ───────── */}
          {calendar && genState !== 'loading' && viewMode === 'list' && (
            <div className="p-4 space-y-5">
              {presentSubjects
                .filter(s => filterSubject === '' || s === filterSubject)
                .map(subject => {
                  const color = getSubjectColor(subject);
                  const subjectEntries = calendar.entries.filter(e => e.subject === subject);
                  const unitNums: number[] = Array.from(new Set<number>(subjectEntries.map(e => Number(e.unitNumber)))).sort((a: number, b: number) => a - b);

                  return (
                    <div
                      key={subject}
                      className="rounded-2xl border-2 overflow-hidden shadow-sm bg-white"
                      style={{ borderColor: color }}
                    >
                      {/* Header matière */}
                      <div className="px-5 py-3 flex items-center gap-2.5" style={{ backgroundColor: lighten(color, 0.85) }}>
                        <span className="w-3.5 h-3.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-black text-base" style={{ color: darken(color) }}>{subject}</span>
                        <span className="ml-auto text-xs font-bold px-2.5 py-1 rounded-full bg-white/80 text-slate-700">
                          {unitNums.length} unité(s) · {subjectEntries.filter(e => e.type === 'unit').length} semaines planifiées
                        </span>
                      </div>

                      {/* Unités et leurs chapitres par semaine */}
                      <div className="divide-y divide-slate-200">
                        {unitNums.map(unitNum => {
                          const unitEntries = subjectEntries.filter(e => e.unitNumber === unitNum);
                          const unitWeekEntries = unitEntries.filter(e => e.type === 'unit').sort((a, b) => a.weekNum - b.weekNum);
                          const assessEntries = unitEntries.filter(e => e.type === 'assessment');
                          const minWeek = unitWeekEntries[0]?.weekNum || 0;
                          const maxWeek = unitWeekEntries[unitWeekEntries.length - 1]?.weekNum || 0;
                          const unitTitle = unitWeekEntries[0]?.unitTitle || unitEntries[0]?.unitTitle || `Unité ${unitNum}`;

                          return (
                            <div key={unitNum} className="p-4 bg-white space-y-3">
                              <div className="flex items-center justify-between flex-wrap gap-2">
                                <div className="flex items-center gap-3">
                                  <div
                                    className="px-3 py-1.5 rounded-xl text-white text-xs font-black flex-shrink-0 shadow-2xs"
                                    style={{ backgroundColor: color }}
                                  >
                                    Unité {unitNum}
                                  </div>
                                  <div>
                                    <h4 className="text-sm font-extrabold text-slate-900">
                                      {unitTitle}
                                    </h4>
                                    <p className="text-xs text-slate-500">
                                      Semaine {minWeek} à Semaine {maxWeek} ({unitWeekEntries.length} semaine{unitWeekEntries.length > 1 ? 's' : ''})
                                    </p>
                                  </div>
                                </div>

                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {assessEntries.map((ae, ai) => (
                                    <span key={ai} className="text-xs px-2.5 py-1 rounded-lg font-bold border text-red-700 bg-red-50 border-red-200">
                                      ★ Éval. Critère {ae.assessmentCriterion} (Semaine {ae.weekNum})
                                    </span>
                                  ))}
                                </div>
                              </div>

                              {/* Détail des chapitres semaine par semaine */}
                              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2 pl-2">
                                {unitWeekEntries.map(we => {
                                  const weekInfo = SCHOOL_WEEKS_2026_2027.find(w => w.num === we.weekNum);
                                  return (
                                    <div
                                      key={we.weekNum}
                                      onClick={() => handleEntryClick(we)}
                                      className={`p-2.5 rounded-xl border text-xs transition ${
                                        editMode ? 'cursor-pointer hover:shadow-md' : ''
                                      }`}
                                      style={{
                                        backgroundColor: lighten(color, 0.92),
                                        borderColor: lighten(color, 0.6),
                                      }}
                                    >
                                      <div className="flex items-center justify-between font-bold text-slate-800 mb-1">
                                        <span className="px-1.5 py-0.5 rounded text-[10px] text-white font-black" style={{ backgroundColor: color }}>
                                          Semaine {we.weekNum}
                                        </span>
                                        <span className="text-[10px] text-slate-500">{weekInfo?.dates}</span>
                                      </div>
                                      <div className="text-[11px] font-semibold text-slate-800 leading-snug">
                                        {we.chapter || `Progression — ${unitTitle}`}
                                      </div>
                                    </div>
                                  );
                                })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* ══ EDIT MODAL ═══════════════════════════════════════════════════════ */}
        {editEntry && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10 p-4" onClick={() => setEditEntry(null)}>
            <div className="bg-white rounded-2xl shadow-2xl p-6 w-full max-w-md" onClick={e => e.stopPropagation()}>
              <h3 className="font-bold text-slate-800 mb-4 flex items-center gap-2">
                <Edit3 size={16} className="text-teal-600" />
                Modifier l'unité et le chapitre de la semaine
              </h3>

              <div className="space-y-4">
                {/* Matière */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Matière</label>
                  <select
                    value={editEntry.subject}
                    onChange={e => setEditEntry({ ...editEntry, subject: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    {SUBJECTS.map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>

                {/* Numéro d'unité */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Numéro d'unité</label>
                  <input
                    type="number"
                    min={1}
                    value={editEntry.unitNumber}
                    onChange={e => setEditEntry({ ...editEntry, unitNumber: parseInt(e.target.value) || 1 })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                {/* Titre de l'unité */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Titre de l'unité</label>
                  <input
                    type="text"
                    value={editEntry.unitTitle}
                    onChange={e => setEditEntry({ ...editEntry, unitTitle: e.target.value })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                {/* Chapitre de la semaine */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Chapitre / Leçon de la semaine</label>
                  <input
                    type="text"
                    value={editEntry.chapter || ''}
                    onChange={e => setEditEntry({ ...editEntry, chapter: e.target.value })}
                    placeholder="Ex: Chap. 1 : Nombres entiers — Leçon 1"
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  />
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Type</label>
                  <select
                    value={editEntry.type}
                    onChange={e => setEditEntry({ ...editEntry, type: e.target.value as 'unit' | 'assessment' })}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    <option value="unit">Unité & Chapitre</option>
                    <option value="assessment">Évaluation sommative</option>
                  </select>
                </div>

                {/* Critère si évaluation */}
                {editEntry.type === 'assessment' && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 mb-1">Critère d'évaluation</label>
                    <select
                      value={editEntry.assessmentCriterion || 'A'}
                      onChange={e => setEditEntry({ ...editEntry, assessmentCriterion: e.target.value })}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                    >
                      {['A', 'B', 'C', 'D'].map(c => <option key={c} value={c}>Critère {c}</option>)}
                    </select>
                  </div>
                )}

                {/* Semaine */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Déplacer vers la semaine</label>
                  <select
                    value={editWeek}
                    onChange={e => setEditWeek(parseInt(e.target.value))}
                    className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-teal-400"
                  >
                    {SCHOOL_WEEKS_2026_2027.map(w => (
                      <option key={w.num} value={w.num}>S{w.num} — {w.dates}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-6">
                <button
                  onClick={handleSaveEdit}
                  className="flex items-center gap-2 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-sm font-semibold transition"
                >
                  <Save size={14} /> Enregistrer
                </button>
                <button
                  onClick={() => { if (calendar) { handleDeleteEntry(editEntry); setEditEntry(null); } }}
                  className="flex items-center gap-2 px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 rounded-xl text-sm font-medium transition"
                >
                  Supprimer
                </button>
                <button
                  onClick={() => setEditEntry(null)}
                  className="ml-auto flex items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl text-sm font-medium transition"
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ══ FOOTER ══════════════════════════════════════════════════════════ */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex-shrink-0 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4">
            <span>📅 Année scolaire 2026-2027</span>
            {calendar && <span>· {calendar.entries.filter(e => e.type === 'unit').length} semaines-unités · {calendar.entries.filter(e => e.type === 'assessment').length} évaluations</span>}
          </div>
          <div className="flex items-center gap-2">
            <Info size={11} />
            Les données sont sauvegardées localement automatiquement.
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Helper color functions ───────────────────────────────────────────────────
function darken(hex: string, amount = 0.4): string {
  // Si c'est déjà un rgb(), retourner directement
  if (hex.startsWith('rgb')) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const dr = Math.round(r * (1 - amount));
  const dg = Math.round(g * (1 - amount));
  const db = Math.round(b * (1 - amount));
  return `rgb(${dr},${dg},${db})`;
}

export default CalendarView;
