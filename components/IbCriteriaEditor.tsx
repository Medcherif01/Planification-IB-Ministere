import React, { useState, useEffect } from 'react';
import {
  X, Plus, Trash2, Save, ChevronDown, ChevronUp,
  CheckCircle, Loader2, AlertTriangle, BookOpen, Info, Copy,
} from 'lucide-react';
import {
  IbCriteriaConfig,
  IbCriterion,
  IbRubricRow,
  DEFAULT_RUBRIC_ROWS,
  RUBRIC_LEVELS,
  loadCriteria,
  saveCriteria,
} from '../services/ibCriteriaService';

// ─── IB criterion letters available ─────────────────────────────────────────
const CRITERION_LETTERS: ('A' | 'B' | 'C' | 'D')[] = ['A', 'B', 'C', 'D'];

// ─── Colors per criterion ────────────────────────────────────────────────────
const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string }> = {
  A: { bg: 'bg-blue-50',   border: 'border-blue-300',   text: 'text-blue-800',   badge: 'bg-blue-600' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600' },
  C: { bg: 'bg-amber-50',  border: 'border-amber-300',  text: 'text-amber-800',  badge: 'bg-amber-600' },
  D: { bg: 'bg-rose-50',   border: 'border-rose-300',   text: 'text-rose-800',   badge: 'bg-rose-600' },
};

// ─── Default criterion names per subject ────────────────────────────────────
const DEFAULT_CRITERION_NAMES: Record<string, string[]> = {
  'Mathématiques': ['Connaissances et compréhension', 'Investigation de modèles', 'Communication en mathématiques', "Application dans des contextes réels"],
  'Sciences': ['Connaissances et compréhension', 'Recherche et conception', 'Traitement et évaluation', 'Réflexion sur les répercussions de la science'],
  'Individus et sociétés': ['Connaissances et compréhension', 'Recherche', 'Communication', 'Réflexion critique'],
  'Design': ['Rechercher et définir', 'Idéer et concevoir', 'Créer la solution', 'Évaluer'],
  'Arts': ['Connaissances et compréhension', 'Développement des compétences', 'Penser de façon créative', 'Répondre'],
  'Éducation physique et à la santé': ['Connaissances et compréhension', 'Développement des compétences', 'Réflexion et performance', 'Pensée en mouvement'],
};

function getDefaultCriterionName(subject: string, letter: 'A' | 'B' | 'C' | 'D'): string {
  const idx = CRITERION_LETTERS.indexOf(letter);
  const names = DEFAULT_CRITERION_NAMES[subject];
  if (names && idx < names.length) return names[idx];
  const fallback = ['Connaissances et compréhension', 'Développement des compétences', 'Communication', 'Réflexion et évaluation'];
  return fallback[idx] || `Critère ${letter}`;
}

function buildEmptyCriterion(letter: 'A' | 'B' | 'C' | 'D', subject: string): IbCriterion {
  return {
    criterion: letter,
    criterionName: getDefaultCriterionName(subject, letter),
    maxPoints: 8,
    strands: ['i. ', 'ii. ', 'iii. '],
    rubricRows: DEFAULT_RUBRIC_ROWS.map(r => ({ ...r })),
  };
}

// ─────────────────────────────────────────────────────────────────────────────

interface IbCriteriaEditorProps {
  isOpen: boolean;
  onClose: () => void;
  subject: string;
  grade: string;
  /** Called after a successful save so the caller can trigger assessment updates */
  onSaved?: (subject: string, grade: string) => void;
}

// PEI propagation map: PEI 1 → PEI 2, PEI 3 → PEI 4 (same group level)
const PROPAGATION_MAP: Record<string, string> = {
  'PEI 1': 'PEI 2',
  'PEI 3': 'PEI 4',
};

const IbCriteriaEditor: React.FC<IbCriteriaEditorProps> = ({
  isOpen, onClose, subject, grade, onSaved,
}) => {
  const [criteria, setCriteria] = useState<IbCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');
  const [expandedCriteria, setExpandedCriteria] = useState<Set<string>>(new Set(['A']));
  const [activeTab, setActiveTab] = useState<Record<string, 'strands' | 'rubric'>>({});
  const [propagating, setPropagating] = useState(false);
  const [propagateStatus, setPropagateStatus] = useState<'idle' | 'done' | 'error'>('idle');

  // ── Load existing config ────────────────────────────────────────────────────
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setSaveStatus('idle');
    loadCriteria(subject, grade).then(config => {
      if (config && config.criteria.length > 0) {
        setCriteria(config.criteria);
        setExpandedCriteria(new Set([config.criteria[0].criterion]));
      } else {
        // Init with 4 empty criteria
        const initial = CRITERION_LETTERS.map(l => buildEmptyCriterion(l, subject));
        setCriteria(initial);
        setExpandedCriteria(new Set(['A']));
      }
      setLoading(false);
    });
  }, [isOpen, subject, grade]);

  if (!isOpen) return null;

  // ── Handlers ────────────────────────────────────────────────────────────────

  const toggleExpand = (letter: string) => {
    setExpandedCriteria(prev => {
      const next = new Set(prev);
      if (next.has(letter)) next.delete(letter);
      else next.add(letter);
      return next;
    });
  };

  const getTab = (letter: string): 'strands' | 'rubric' =>
    activeTab[letter] || 'strands';

  const setTab = (letter: string, tab: 'strands' | 'rubric') =>
    setActiveTab(prev => ({ ...prev, [letter]: tab }));

  // ── Criterion field updates ─────────────────────────────────────────────────
  const updateCriterionName = (letter: string, name: string) => {
    setCriteria(prev => prev.map(c => c.criterion === letter ? { ...c, criterionName: name } : c));
  };

  // ── Strands ────────────────────────────────────────────────────────────────
  const updateStrand = (letter: string, idx: number, value: string) => {
    setCriteria(prev => prev.map(c => {
      if (c.criterion !== letter) return c;
      const strands = [...c.strands];
      strands[idx] = value;
      return { ...c, strands };
    }));
  };

  const addStrand = (letter: string) => {
    setCriteria(prev => prev.map(c => {
      if (c.criterion !== letter) return c;
      if (c.strands.length >= 5) return c; // max 5 strands per IB guide
      const roman = ['i', 'ii', 'iii', 'iv', 'v'];
      const next = `${roman[c.strands.length]}. `;
      return { ...c, strands: [...c.strands, next] };
    }));
  };

  const removeStrand = (letter: string, idx: number) => {
    setCriteria(prev => prev.map(c => {
      if (c.criterion !== letter) return c;
      if (c.strands.length <= 1) return c; // min 1 strand
      const strands = c.strands.filter((_, i) => i !== idx);
      return { ...c, strands };
    }));
  };

  // ── Rubric rows ────────────────────────────────────────────────────────────
  const updateRubricDescriptor = (letter: string, levelIdx: number, value: string) => {
    setCriteria(prev => prev.map(c => {
      if (c.criterion !== letter) return c;
      const rubricRows: IbRubricRow[] = c.rubricRows.map((r, i) =>
        i === levelIdx ? { ...r, descriptor: value } : r
      );
      return { ...c, rubricRows };
    }));
  };

  // ── Add / remove criteria ──────────────────────────────────────────────────
  const addCriterion = (letter: 'A' | 'B' | 'C' | 'D') => {
    if (criteria.some(c => c.criterion === letter)) return;
    setCriteria(prev => {
      const next = [...prev, buildEmptyCriterion(letter, subject)];
      return next.sort((a, b) => CRITERION_LETTERS.indexOf(a.criterion) - CRITERION_LETTERS.indexOf(b.criterion));
    });
    setExpandedCriteria(prev => new Set([...prev, letter]));
  };

  const removeCriterion = (letter: string) => {
    if (criteria.length <= 2) {
      alert('Un minimum de 2 critères est requis par les normes IB PEI.');
      return;
    }
    setCriteria(prev => prev.filter(c => c.criterion !== letter));
  };

  // ── Save ───────────────────────────────────────────────────────────────────
  const handleSave = async () => {
    // Validate: at least 1 strand per criterion, non-empty
    for (const c of criteria) {
      const filled = c.strands.filter(s => s.trim().length > 1);
      if (filled.length < 1) {
        alert(`Critère ${c.criterion} : veuillez remplir au moins 1 sous-aspect (strand).`);
        setExpandedCriteria(prev => new Set([...prev, c.criterion]));
        setTab(c.criterion, 'strands');
        return;
      }
      if (!c.criterionName.trim()) {
        alert(`Critère ${c.criterion} : le nom du critère est obligatoire.`);
        setExpandedCriteria(prev => new Set([...prev, c.criterion]));
        return;
      }
    }

    setSaving(true);
    try {
      const config: IbCriteriaConfig = {
        subject,
        grade,
        criteria,
        updatedAt: new Date().toISOString(),
      };
      await saveCriteria(config);
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
      // Notify parent so it can trigger assessment updates
      onSaved?.(subject, grade);
    } catch {
      setSaveStatus('error');
    } finally {
      setSaving(false);
    }
  };

  // ── Propagate current criteria to the paired PEI grade ─────────────────────
  const targetGrade = PROPAGATION_MAP[grade]; // e.g. PEI 1 → PEI 2
  const handlePropagate = async () => {
    if (!targetGrade) return;
    // Validate same as save
    for (const c of criteria) {
      if (c.strands.filter(s => s.trim().length > 1).length < 1) {
        alert(`Critère ${c.criterion} : veuillez remplir au moins 1 sous-aspect avant d'appliquer.`);
        return;
      }
    }
    setPropagating(true);
    setPropagateStatus('idle');
    try {
      const config: IbCriteriaConfig = {
        subject,
        grade: targetGrade,
        criteria: criteria.map(c => ({ ...c, rubricRows: c.rubricRows.map(r => ({ ...r })), strands: [...c.strands] })),
        updatedAt: new Date().toISOString(),
      };
      await saveCriteria(config);
      setPropagateStatus('done');
      setTimeout(() => setPropagateStatus('idle'), 3500);
      // Notify parent for the target grade too
      onSaved?.(subject, targetGrade);
    } catch {
      setPropagateStatus('error');
    } finally {
      setPropagating(false);
    }
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const availableToAdd = CRITERION_LETTERS.filter(l => !criteria.some(c => c.criterion === l));

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4 px-2">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl my-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-blue-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <BookOpen size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-base">Objectifs spécifiques IB</h2>
              <p className="text-blue-200 text-xs">{subject} — {grade}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-white/70 hover:text-white transition p-1">
            <X size={20} />
          </button>
        </div>

        {/* Info banner */}
        <div className="bg-blue-50 border-b border-blue-100 px-6 py-3 flex items-start gap-2 text-xs text-blue-700">
          <Info size={14} className="flex-shrink-0 mt-0.5 text-blue-500" />
          <span>
            Saisissez ici les sous-aspects (i., ii., iii…) officiels du guide IB pour <strong>{subject}</strong> en <strong>{grade}</strong>.
            Ils seront utilisés automatiquement dans toutes les générations d'unités et d'évaluations critériées.
            Une fois enregistrés, ils persistent jusqu'à modification manuelle.
          </span>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 text-slate-400 gap-3">
              <Loader2 size={24} className="animate-spin" />
              <span>Chargement des critères…</span>
            </div>
          ) : (
            <>
              {criteria.map(criterion => {
                const colors = CRITERION_COLORS[criterion.criterion];
                const expanded = expandedCriteria.has(criterion.criterion);
                const tab = getTab(criterion.criterion);
                const filledStrands = criterion.strands.filter(s => s.trim().length > 1).length;

                return (
                  <div key={criterion.criterion} className={`border-2 ${colors.border} rounded-xl overflow-hidden`}>
                    {/* Criterion header */}
                    <div
                      className={`${colors.bg} px-4 py-3 flex items-center justify-between cursor-pointer select-none`}
                      onClick={() => toggleExpand(criterion.criterion)}
                    >
                      <div className="flex items-center gap-3">
                        <span className={`w-8 h-8 rounded-lg ${colors.badge} text-white font-black text-sm flex items-center justify-center`}>
                          {criterion.criterion}
                        </span>
                        <div>
                          <p className={`font-bold text-sm ${colors.text}`}>{criterion.criterionName || `Critère ${criterion.criterion}`}</p>
                          <p className="text-xs text-slate-500">
                            {filledStrands}/{criterion.strands.length} sous-aspects · /8 pts
                            {criterion.rubricRows.length > 0 && ` · ${criterion.rubricRows.length} niveaux`}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {filledStrands >= 1 && (
                          <CheckCircle size={14} className="text-green-500" />
                        )}
                        {criteria.length > 2 && (
                          <button
                            onClick={e => { e.stopPropagation(); removeCriterion(criterion.criterion); }}
                            className="p-1 text-slate-400 hover:text-red-500 transition rounded"
                            title="Supprimer ce critère"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                        {expanded ? <ChevronUp size={16} className="text-slate-400" /> : <ChevronDown size={16} className="text-slate-400" />}
                      </div>
                    </div>

                    {/* Expanded content */}
                    {expanded && (
                      <div className="p-4 space-y-4 bg-white">
                        {/* Criterion name */}
                        <div>
                          <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">
                            Nom du critère
                          </label>
                          <input
                            type="text"
                            value={criterion.criterionName}
                            onChange={e => updateCriterionName(criterion.criterion, e.target.value)}
                            placeholder={`ex: Connaissances et compréhension`}
                            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                          />
                        </div>

                        {/* Tabs: Strands / Rubric */}
                        <div className="flex border border-slate-200 rounded-lg overflow-hidden">
                          <button
                            onClick={() => setTab(criterion.criterion, 'strands')}
                            className={`flex-1 py-2 text-xs font-semibold transition ${tab === 'strands'
                              ? `${colors.badge} text-white`
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                          >
                            📋 Sous-aspects (strands)
                          </button>
                          <button
                            onClick={() => setTab(criterion.criterion, 'rubric')}
                            className={`flex-1 py-2 text-xs font-semibold transition ${tab === 'rubric'
                              ? `${colors.badge} text-white`
                              : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                          >
                            📊 Grille d'évaluation
                          </button>
                        </div>

                        {/* ── STRANDS TAB ─────────────────────────────────── */}
                        {tab === 'strands' && (
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                              💡 Saisissez les sous-aspects exacts du guide IB officiel pour ce critère.
                              Minimum 1, maximum 5 sous-aspects. Commencez par les préfixes i., ii., iii., iv., v.
                            </p>
                            {criterion.strands.map((strand, si) => (
                              <div key={si} className="flex items-center gap-2">
                                <span className="text-xs font-bold text-slate-400 w-8 flex-shrink-0 text-center">
                                  {['i', 'ii', 'iii', 'iv', 'v'][si]}.
                                </span>
                                <input
                                  type="text"
                                  value={strand.replace(/^(i{1,3}v?|iv|v)\.\s*/i, '')}
                                  onChange={e => {
                                    const roman = ['i', 'ii', 'iii', 'iv', 'v'];
                                    updateStrand(criterion.criterion, si, `${roman[si]}. ${e.target.value}`);
                                  }}
                                  placeholder={`Sous-aspect ${si + 1}…`}
                                  className="flex-1 border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                                />
                                {criterion.strands.length > 1 && (
                                  <button
                                    onClick={() => removeStrand(criterion.criterion, si)}
                                    className="p-1.5 text-slate-400 hover:text-red-500 transition rounded"
                                  >
                                    <Trash2 size={13} />
                                  </button>
                                )}
                              </div>
                            ))}
                            {criterion.strands.length < 5 && (
                              <button
                                onClick={() => addStrand(criterion.criterion)}
                                className="flex items-center gap-1.5 text-xs text-blue-600 hover:text-blue-800 font-semibold mt-1 px-2 py-1 rounded-lg hover:bg-blue-50 transition"
                              >
                                <Plus size={13} /> Ajouter un sous-aspect
                              </button>
                            )}
                            {criterion.strands.length >= 5 && (
                              <p className="text-xs text-amber-600 bg-amber-50 rounded px-2 py-1">
                                ⚠️ Maximum 5 sous-aspects atteint (limite du guide IB).
                              </p>
                            )}
                          </div>
                        )}

                        {/* ── RUBRIC TAB ──────────────────────────────────── */}
                        {tab === 'rubric' && (
                          <div className="space-y-2">
                            <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                              💡 Définissez les descripteurs pour chaque niveau de performance (grille de notation IB sur 8 points).
                            </p>
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs border-collapse">
                                <thead>
                                  <tr className={`${colors.bg}`}>
                                    <th className={`border ${colors.border} px-3 py-2 text-left font-bold ${colors.text} w-16`}>Niveau</th>
                                    <th className={`border ${colors.border} px-3 py-2 text-left font-bold ${colors.text}`}>Descripteur de performance</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {RUBRIC_LEVELS.map((level, li) => {
                                    const row = criterion.rubricRows.find(r => r.level === level) || { level, descriptor: '' };
                                    const rowIdx = criterion.rubricRows.findIndex(r => r.level === level);
                                    const actualIdx = rowIdx >= 0 ? rowIdx : li;
                                    return (
                                      <tr key={level}>
                                        <td className={`border ${colors.border} px-3 py-2 font-bold text-center ${colors.text} align-top`}>
                                          {level}
                                        </td>
                                        <td className={`border ${colors.border} px-2 py-1`}>
                                          <textarea
                                            value={row.descriptor}
                                            onChange={e => updateRubricDescriptor(criterion.criterion, actualIdx, e.target.value)}
                                            placeholder={`Descripteur pour le niveau ${level}…`}
                                            rows={2}
                                            className="w-full border-0 focus:outline-none focus:ring-1 focus:ring-blue-300 rounded text-xs resize-none p-1"
                                          />
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Add criterion buttons */}
              {availableToAdd.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap pt-1">
                  <span className="text-xs text-slate-500 font-medium">Ajouter un critère :</span>
                  {availableToAdd.map(letter => {
                    const colors = CRITERION_COLORS[letter];
                    return (
                      <button
                        key={letter}
                        onClick={() => addCriterion(letter)}
                        className={`flex items-center gap-1 px-3 py-1.5 ${colors.bg} border ${colors.border} ${colors.text} rounded-lg text-xs font-bold hover:opacity-80 transition`}
                      >
                        <Plus size={12} /> Critère {letter}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Warning if < 2 criteria */}
              {criteria.length < 2 && (
                <div className="flex items-center gap-2 text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs">
                  <AlertTriangle size={14} />
                  Les normes IB PEI exigent au minimum 2 critères d'évaluation par unité.
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl space-y-3">
          {/* Status row */}
          <div className="text-xs text-slate-500 min-h-[18px]">
            {saveStatus === 'saved' && (
              <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                <CheckCircle size={14} /> Enregistré pour <strong>{grade}</strong> — les générations futures utiliseront ces critères.
              </span>
            )}
            {saveStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-red-600 font-semibold">
                <AlertTriangle size={14} /> Erreur — critères sauvegardés en local uniquement.
              </span>
            )}
            {propagateStatus === 'done' && (
              <span className="flex items-center gap-1.5 text-emerald-600 font-semibold">
                <CheckCircle size={14} /> Critères appliqués à <strong>{targetGrade}</strong> avec succès !
              </span>
            )}
            {propagateStatus === 'error' && (
              <span className="flex items-center gap-1.5 text-red-500 font-semibold">
                <AlertTriangle size={14} /> Erreur lors de l'application à {targetGrade}.
              </span>
            )}
            {saveStatus === 'idle' && propagateStatus === 'idle' && (
              <span>Les critères s'appliquent à : <strong>{subject}</strong> — <strong>{grade}</strong></span>
            )}
          </div>

          {/* Buttons row */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            {/* Left: propagate button (only for PEI 1 and PEI 3) */}
            <div>
              {targetGrade && (
                <button
                  onClick={handlePropagate}
                  disabled={propagating || loading || criteria.length < 2}
                  className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow transition"
                  title={`Copier ces objectifs tels quels vers ${subject} — ${targetGrade}`}
                >
                  {propagating ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                  Appliquer à {targetGrade}
                </button>
              )}
            </div>

            {/* Right: close + save */}
            <div className="flex gap-2">
              <button
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition font-medium"
              >
                Fermer
              </button>
              <button
                onClick={handleSave}
                disabled={saving || loading || criteria.length < 2}
                className="flex items-center gap-2 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-sm font-semibold shadow transition"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default IbCriteriaEditor;
