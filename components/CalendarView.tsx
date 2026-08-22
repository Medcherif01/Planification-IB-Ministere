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

  // ── Chargement initial ────────────────────────────────────────────────────
  useEffect(() => {
    // Charger le calendrier sauvegardé
    const saved = localStorage.getItem(STORAGE_KEY(grade));
    if (saved) {
      try {
        setCalendar(JSON.parse(saved));
        setGenState('done');
      } catch { /* ignore */ }
    }

    // Charger les plans par matière
    const loadPlans = async () => {
      const bySubject: Record<string, UnitPlan[]> = {};
      await Promise.all(SUBJECTS.map(async (subj) => {
        try {
          const plans = await loadAllPlansForGrade(grade);
          bySubject[subj] = plans.filter(p => p.subject === subj);
        } catch {
          bySubject[subj] = [];
        }
      }));
      setPlansBySubject(bySubject);
    };
    loadPlans();
  }, [grade]);

  // ── Sauvegarde automatique ────────────────────────────────────────────────
  const saveCalendar = useCallback((cal: AnnualCalendar) => {
    localStorage.setItem(STORAGE_KEY(grade), JSON.stringify(cal));
    setCalendar(cal);
  }, [grade]);

  // ── Génération IA ─────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    setGenState('loading');
    setGenMsg('Chargement des données...');
    try {
      // Charger toutes les unités de la classe
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

      // Charger les unités interdisciplinaires
      const rawInter = localStorage.getItem('interdisciplinary_units');
      const allInter: InterdisciplinaryUnit[] = rawInter ? JSON.parse(rawInter) : [];
      const interForGrade = allInter.filter(u => u.grade === grade);

      // Générer avec l'IA
      const result = await generateAnnualCalendarWithAI(
        grade, bySubject, interForGrade,
        (msg) => setGenMsg(msg)
      );

      saveCalendar(result);
      setGenState('done');
      setGenMsg(`✅ Calendrier généré avec succès — ${result.entries.length} entrées réparties sur 38 semaines.`);
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
          return { ...e, weekNum: editWeek };
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
    const newEntry: CalendarEntry = {
      weekNum,
      subject: SUBJECTS[0],
      unitNumber: 1,
      unitTitle: 'Nouvelle unité',
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
  const presentSubjects = calendar
    ? [...new Set(calendar.entries.map(e => e.subject))].sort()
    : [];

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const cellHeight = zoom === 'compact' ? 'min-h-[60px]' : zoom === 'large' ? 'min-h-[140px]' : 'min-h-[100px]';
  const weekLabelW = zoom === 'compact' ? 'w-20' : 'w-28';

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
              Calendrier annuel — {grade}
            </h2>
            <p className="text-teal-100 text-xs">Année scolaire 2026-2027 · 38 semaines</p>
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
              {viewMode === 'grid' ? 'Vue liste' : 'Vue grille'}
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
                ? <><RefreshCw size={13} /> Regénérer</>
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
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Légende :</span>

              {/* Bouton "Toutes" */}
              <button
                onClick={() => setFilterSubject('')}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition ${
                  filterSubject === ''
                    ? 'bg-slate-800 text-white border-slate-800'
                    : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-100'
                }`}
              >
                Toutes
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
                      ringColor: isSelected ? color : 'transparent',
                    }}
                    title={subj}
                  >
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                    {getSubjectAbbr(subj)}
                  </button>
                );
              })}

              {/* Légende type */}
              <span className="ml-2 text-xs text-slate-400">|</span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block w-4 h-3 rounded-sm bg-slate-200 border border-slate-300" /> Unité
              </span>
              <span className="flex items-center gap-1 text-xs text-slate-500">
                <span className="inline-block w-4 h-3 rounded-sm border-2 border-red-400 bg-red-50" /> Éval.
              </span>

              <span className="ml-2 text-xs text-slate-400 italic">
                {calendar.entries.length} entrées · Généré le {new Date(calendar.generatedAt).toLocaleDateString('fr-FR')}
              </span>
            </div>
          </div>
        )}

        {/* ══ EDIT MODE PANEL ══════════════════════════════════════════════════ */}
        {editMode && (
          <div className="px-6 py-2 bg-amber-50 border-b border-amber-200 flex-shrink-0 flex items-center gap-3 text-xs text-amber-800">
            <Edit3 size={13} className="flex-shrink-0 text-amber-600" />
            <strong>Mode édition activé</strong> — cliquez sur une entrée pour la modifier ou la déplacer.
            {editMode && !calendar && <span className="text-amber-600">Générez d'abord un calendrier.</span>}
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
                  Cliquez sur <strong>Générer IA</strong> pour distribuer automatiquement toutes les unités
                  de {grade} sur les 38 semaines de l'année 2026-2027, avec les évaluations et les
                  unités interdisciplinaires en parallèle.
                </p>
              </div>
              <button
                onClick={handleGenerate}
                disabled={genState === 'loading'}
                className="flex items-center gap-2 px-6 py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-semibold text-sm transition shadow-lg"
              >
                <Sparkles size={16} />
                Générer le calendrier avec l'IA
              </button>
            </div>
          )}

          {/* ─── Loading ───────────────────────────────────────────────────── */}
          {genState === 'loading' && (
            <div className="flex flex-col items-center justify-center h-full gap-4">
              <Loader2 size={40} className="animate-spin text-teal-600" />
              <p className="text-slate-600 font-medium">{genMsg}</p>
              <p className="text-slate-400 text-sm">Cela peut prendre 30 à 60 secondes…</p>
            </div>
          )}

          {/* ─── GRILLE ────────────────────────────────────────────────────── */}
          {calendar && genState !== 'loading' && viewMode === 'grid' && (
            <div className="p-4">
              <div className="space-y-1">
                {SCHOOL_WEEKS_2026_2027.map(week => {
                  const entries = getEntriesForWeek(week.num);
                  const isVacation = [16, 17].includes(week.num); // Noël
                  const isFerie = [12].includes(week.num); // Vacances Toussaint
                  const bg = isVacation || isFerie ? 'bg-slate-100' : 'bg-white';

                  return (
                    <div
                      key={week.num}
                      className={`flex gap-2 rounded-xl border ${isVacation ? 'border-slate-300 opacity-70' : 'border-slate-200'} ${bg} overflow-hidden hover:shadow-sm transition`}
                    >
                      {/* Numéro de semaine */}
                      <div className={`${weekLabelW} flex-shrink-0 flex flex-col items-center justify-center p-2 bg-slate-50 border-r border-slate-200`}>
                        <span className="text-slate-800 font-black text-sm">S{week.num}</span>
                        <span className="text-slate-400 text-[10px] text-center leading-tight">{week.dates}</span>
                        {(isVacation || isFerie) && (
                          <span className="mt-1 text-[9px] font-semibold text-slate-400 bg-slate-200 rounded px-1">Vacances</span>
                        )}
                      </div>

                      {/* Entrées */}
                      <div className={`flex-1 ${cellHeight} flex flex-wrap gap-1.5 p-2 content-start`}>
                        {entries.length === 0 && !editMode && (
                          <span className="text-slate-300 text-xs italic self-center">—</span>
                        )}
                        {entries.map((entry, i) => {
                          const color = getSubjectColor(entry.subject);
                          const isAssessment = entry.type === 'assessment';
                          return (
                            <button
                              key={i}
                              onClick={() => handleEntryClick(entry)}
                              title={`${entry.subject} — Unité ${entry.unitNumber}: ${entry.unitTitle}${isAssessment ? ` — Critère ${entry.assessmentCriterion}` : ''}`}
                              className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold transition group
                                ${editMode ? 'cursor-pointer hover:scale-105 hover:shadow-md active:scale-95' : 'cursor-default'}
                                ${isAssessment ? 'border-2' : 'border'}`}
                              style={{
                                backgroundColor: isAssessment ? '#fff' : lighten(color, 0.75),
                                borderColor: color,
                                color: isAssessment ? color : darken(color),
                              }}
                            >
                              {/* Dot */}
                              <span
                                className="w-2 h-2 rounded-full flex-shrink-0"
                                style={{ backgroundColor: color }}
                              />
                              {/* Label */}
                              <span className="truncate max-w-[120px]">
                                {getSubjectAbbr(entry.subject)} U{entry.unitNumber}
                                {isAssessment && <span className="ml-0.5 font-bold">★{entry.assessmentCriterion}</span>}
                              </span>
                              {/* Delete button in edit mode */}
                              {editMode && (
                                <span
                                  className="ml-1 opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 text-xs font-bold"
                                  onClick={(ev) => { ev.stopPropagation(); handleDeleteEntry(entry); }}
                                  title="Supprimer cette entrée"
                                >✕</span>
                              )}
                            </button>
                          );
                        })}

                        {/* Bouton Ajouter en mode édition */}
                        {editMode && (
                          <button
                            onClick={() => handleAddEntry(week.num)}
                            className="flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold border border-dashed border-slate-300 text-slate-400 hover:border-teal-400 hover:text-teal-600 transition"
                          >
                            + Ajouter
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* ─── VUE LISTE ─────────────────────────────────────────────────── */}
          {calendar && genState !== 'loading' && viewMode === 'list' && (
            <div className="p-4 space-y-3">
              {presentSubjects
                .filter(s => filterSubject === '' || s === filterSubject)
                .map(subject => {
                  const color = getSubjectColor(subject);
                  const subjectEntries = calendar.entries.filter(e => e.subject === subject);
                  // Grouper par numéro d'unité
                  const unitNums = [...new Set(subjectEntries.map(e => e.unitNumber))].sort((a, b) => a - b);

                  return (
                    <div
                      key={subject}
                      className="rounded-xl border overflow-hidden shadow-sm"
                      style={{ borderColor: color }}
                    >
                      {/* Header matière */}
                      <div className="px-4 py-2 flex items-center gap-2" style={{ backgroundColor: lighten(color, 0.85) }}>
                        <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                        <span className="font-bold text-sm" style={{ color: darken(color) }}>{subject}</span>
                        <span className="ml-auto text-xs text-slate-500">{subjectEntries.length} entrées</span>
                      </div>

                      {/* Unités */}
                      <div className="divide-y divide-slate-100">
                        {unitNums.map(unitNum => {
                          const unitEntries = subjectEntries.filter(e => e.unitNumber === unitNum);
                          const unitEntry = unitEntries.find(e => e.type === 'unit');
                          const assessEntries = unitEntries.filter(e => e.type === 'assessment');
                          const unitWeeks = unitEntries.filter(e => e.type === 'unit').map(e => e.weekNum).sort((a, b) => a - b);
                          const minWeek = unitWeeks[0] || 0;
                          const maxWeek = unitWeeks[unitWeeks.length - 1] || 0;

                          return (
                            <div key={unitNum} className="px-4 py-2.5 bg-white flex items-start gap-3">
                              <div
                                className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs font-black flex-shrink-0"
                                style={{ backgroundColor: color }}
                              >
                                U{unitNum}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-800 truncate">
                                  {unitEntry?.unitTitle || `Unité ${unitNum}`}
                                </p>
                                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                                  <span className="text-xs text-slate-500">
                                    Sem. {minWeek}{maxWeek !== minWeek ? `–${maxWeek}` : ''} · {maxWeek - minWeek + 1} sem.
                                  </span>
                                  {unitWeeks.map(w => (
                                    <span key={w} className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ backgroundColor: lighten(color, 0.75), color: darken(color) }}>
                                      S{w}
                                    </span>
                                  ))}
                                  {assessEntries.map((ae, ai) => (
                                    <span key={ai} className="text-[10px] px-1.5 py-0.5 rounded-full font-bold border text-red-700 bg-red-50 border-red-200">
                                      Éval. Crit.{ae.assessmentCriterion} S{ae.weekNum}
                                    </span>
                                  ))}
                                </div>
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
                Modifier l'entrée
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

                {/* Titre */}
                <div>
                  <label className="block text-xs font-semibold text-slate-500 mb-1">Titre de l'unité</label>
                  <input
                    type="text"
                    value={editEntry.unitTitle}
                    onChange={e => setEditEntry({ ...editEntry, unitTitle: e.target.value })}
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
                    <option value="unit">Unité</option>
                    <option value="assessment">Évaluation</option>
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
