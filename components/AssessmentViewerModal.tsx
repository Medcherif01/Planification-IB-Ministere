import React, { useState, useEffect } from 'react';
import { X, Eye, Edit3, Save, CheckCircle, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';
import { UnitPlan, AssessmentData } from '../types';

interface AssessmentViewerModalProps {
  isOpen: boolean;
  onClose: () => void;
  plan: UnitPlan | null;
  onUpdateUnit?: (plan: UnitPlan) => void;
}

const CRITERION_COLORS: Record<string, { bg: string; border: string; text: string; badge: string; light: string }> = {
  A: { bg: 'bg-blue-50',    border: 'border-blue-300',   text: 'text-blue-800',    badge: 'bg-blue-600',    light: 'bg-blue-100' },
  B: { bg: 'bg-emerald-50', border: 'border-emerald-300', text: 'text-emerald-800', badge: 'bg-emerald-600', light: 'bg-emerald-100' },
  C: { bg: 'bg-amber-50',   border: 'border-amber-300',  text: 'text-amber-800',   badge: 'bg-amber-600',   light: 'bg-amber-100' },
  D: { bg: 'bg-rose-50',    border: 'border-rose-300',   text: 'text-rose-800',    badge: 'bg-rose-600',    light: 'bg-rose-100' },
};

const AssessmentViewerModal: React.FC<AssessmentViewerModalProps> = ({
  isOpen, onClose, plan, onUpdateUnit,
}) => {
  const [assessments, setAssessments] = useState<AssessmentData[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [editMode, setEditMode] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved'>('idle');

  useEffect(() => {
    if (!isOpen || !plan) return;
    setAssessments(plan.assessments ? plan.assessments.map(a => JSON.parse(JSON.stringify(a))) : []);
    setActiveIdx(0);
    setEditMode(false);
    setSaveStatus('idle');
  }, [isOpen, plan]);

  if (!isOpen || !plan) return null;

  const active = assessments[activeIdx];

  // ── Helpers ──────────────────────────────────────────────────────────────────
  const updateField = <K extends keyof AssessmentData>(key: K, value: AssessmentData[K]) => {
    setAssessments(prev => prev.map((a, i) => i === activeIdx ? { ...a, [key]: value } : a));
  };

  const updateExercise = (exIdx: number, field: keyof AssessmentData['exercises'][0], value: string) => {
    setAssessments(prev => prev.map((a, i) => {
      if (i !== activeIdx) return a;
      const exercises = a.exercises.map((ex, ei) => ei === exIdx ? { ...ex, [field]: value } : ex);
      return { ...a, exercises };
    }));
  };

  const updateStrand = (sIdx: number, value: string) => {
    if (!active) return;
    const strands = [...active.strands];
    strands[sIdx] = value;
    updateField('strands', strands);
  };

  const updateRubric = (rIdx: number, value: string) => {
    if (!active) return;
    const rubricRows = active.rubricRows.map((r, i) => i === rIdx ? { ...r, descriptor: value } : r);
    updateField('rubricRows', rubricRows);
  };

  const handleSave = () => {
    if (!plan || !onUpdateUnit) return;
    const updated: UnitPlan = { ...plan, assessments };
    onUpdateUnit(updated);
    setSaveStatus('saved');
    setTimeout(() => setSaveStatus('idle'), 2500);
    setEditMode(false);
  };

  // ── Colors for active criterion ───────────────────────────────────────────────
  const colors = active ? (CRITERION_COLORS[active.criterion] || CRITERION_COLORS.A) : CRITERION_COLORS.A;

  return (
    <div className="fixed inset-0 z-[80] flex items-start justify-center bg-black/50 backdrop-blur-sm overflow-y-auto py-4 px-2">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-auto">

        {/* Header */}
        <div className="bg-gradient-to-r from-purple-600 to-violet-600 px-6 py-4 rounded-t-2xl flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center flex-shrink-0">
              <Eye size={20} className="text-white" />
            </div>
            <div className="min-w-0">
              <h2 className="text-white font-extrabold text-base truncate">Évaluations critériées</h2>
              <p className="text-purple-200 text-xs truncate">{plan.title} · {plan.subject} · {plan.gradeLevel}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {onUpdateUnit && (
              <button
                onClick={() => setEditMode(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                  editMode ? 'bg-white text-purple-700' : 'bg-white/20 text-white hover:bg-white/30'
                }`}
              >
                <Edit3 size={13} /> {editMode ? 'Vue' : 'Modifier'}
              </button>
            )}
            <button onClick={onClose} className="text-white/70 hover:text-white transition p-1">
              <X size={20} />
            </button>
          </div>
        </div>

        {assessments.length === 0 ? (
          <div className="p-12 text-center text-slate-400">
            <AlertTriangle size={32} className="mx-auto mb-3 text-slate-300" />
            <p className="font-semibold">Aucune évaluation critériée générée pour cette unité.</p>
            <p className="text-sm mt-1">Utilisez le bouton <strong>Mise à jour</strong> sur la carte de l'unité pour en générer.</p>
          </div>
        ) : (
          <>
            {/* Criterion tabs */}
            <div className="flex border-b border-slate-200 overflow-x-auto">
              {assessments.map((a, i) => {
                const c = CRITERION_COLORS[a.criterion] || CRITERION_COLORS.A;
                return (
                  <button
                    key={a.criterion}
                    onClick={() => { setActiveIdx(i); setEditMode(false); }}
                    className={`flex items-center gap-2 px-5 py-3 text-sm font-semibold border-b-2 transition whitespace-nowrap flex-shrink-0 ${
                      activeIdx === i
                        ? `border-purple-600 text-purple-700 bg-purple-50`
                        : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-6 h-6 rounded-md ${c.badge} text-white text-xs font-black flex items-center justify-center`}>
                      {a.criterion}
                    </span>
                    <span className="hidden sm:inline">{a.criterionName}</span>
                    <span className="text-xs font-normal text-slate-400">/{a.maxPoints}pts</span>
                  </button>
                );
              })}
              {/* Prev/Next arrows */}
              <div className="ml-auto flex items-center gap-1 px-2">
                <button onClick={() => setActiveIdx(i => Math.max(0, i-1))} disabled={activeIdx === 0}
                  className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition rounded">
                  <ChevronLeft size={16} />
                </button>
                <button onClick={() => setActiveIdx(i => Math.min(assessments.length-1, i+1))} disabled={activeIdx === assessments.length-1}
                  className="p-1 text-slate-400 hover:text-slate-600 disabled:opacity-30 transition rounded">
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>

            {/* Content */}
            {active && (
              <div className="p-6 space-y-6 max-h-[65vh] overflow-y-auto">

                {/* Criterion name */}
                <div className={`${colors.bg} border ${colors.border} rounded-xl p-4`}>
                  <div className="flex items-center gap-3 mb-2">
                    <span className={`w-9 h-9 rounded-xl ${colors.badge} text-white font-black text-base flex items-center justify-center flex-shrink-0`}>
                      {active.criterion}
                    </span>
                    {editMode ? (
                      <input
                        type="text"
                        value={active.criterionName}
                        onChange={e => updateField('criterionName', e.target.value)}
                        className={`flex-1 border ${colors.border} rounded-lg px-3 py-1.5 text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white`}
                      />
                    ) : (
                      <h3 className={`text-base font-bold ${colors.text}`}>{active.criterionName}</h3>
                    )}
                    <span className={`ml-auto text-xs font-bold ${colors.text} px-2 py-1 ${colors.light} rounded-lg`}>
                      /{active.maxPoints} pts
                    </span>
                  </div>
                </div>

                {/* Strands */}
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📋 Sous-aspects (strands)</h4>
                  <div className="space-y-2">
                    {active.strands.map((s, si) => (
                      <div key={si} className="flex items-start gap-2">
                        <span className="text-xs font-bold text-slate-400 mt-2 w-8 flex-shrink-0 text-right">
                          {['i', 'ii', 'iii', 'iv', 'v'][si]}.
                        </span>
                        {editMode ? (
                          <input
                            type="text"
                            value={s}
                            onChange={e => updateStrand(si, e.target.value)}
                            className={`flex-1 border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400`}
                          />
                        ) : (
                          <p className="flex-1 text-sm text-slate-700 bg-slate-50 border border-slate-100 rounded-lg px-3 py-1.5">{s}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Rubric */}
                {active.rubricRows && active.rubricRows.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">📊 Grille d'évaluation</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr className={colors.bg}>
                            <th className={`border ${colors.border} px-3 py-2 text-left font-bold ${colors.text} w-16`}>Niveau</th>
                            <th className={`border ${colors.border} px-3 py-2 text-left font-bold ${colors.text}`}>Descripteur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {active.rubricRows.map((row, ri) => (
                            <tr key={ri}>
                              <td className={`border ${colors.border} px-3 py-2 font-bold text-center ${colors.text} align-top`}>
                                {row.level}
                              </td>
                              <td className={`border ${colors.border} px-2 py-1`}>
                                {editMode ? (
                                  <textarea
                                    value={row.descriptor}
                                    onChange={e => updateRubric(ri, e.target.value)}
                                    rows={2}
                                    className="w-full border-0 focus:outline-none focus:ring-1 focus:ring-purple-300 rounded text-xs resize-none p-1"
                                  />
                                ) : (
                                  <span className="text-slate-700">{row.descriptor || <em className="text-slate-400">Non défini</em>}</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Exercises */}
                {active.exercises && active.exercises.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">✏️ Exercices ({active.exercises.length})</h4>
                    <div className="space-y-3">
                      {active.exercises.map((ex, ei) => (
                        <div key={ei} className={`border ${colors.border} rounded-xl p-4 ${colors.bg} space-y-2`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-xs font-bold ${colors.text} ${colors.light} px-2 py-0.5 rounded`}>
                              Ex. {ei + 1}
                            </span>
                            {ex.criterionReference && (
                              <span className="text-xs text-slate-500 italic">{ex.criterionReference}</span>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1">Titre</p>
                            {editMode ? (
                              <input
                                type="text"
                                value={ex.title}
                                onChange={e => updateExercise(ei, 'title', e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                              />
                            ) : (
                              <p className="text-sm font-semibold text-slate-800">{ex.title}</p>
                            )}
                          </div>
                          <div>
                            <p className="text-xs font-semibold text-slate-500 mb-1">Contenu</p>
                            {editMode ? (
                              <textarea
                                value={ex.content}
                                onChange={e => updateExercise(ei, 'content', e.target.value)}
                                rows={4}
                                className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white resize-none"
                              />
                            ) : (
                              <p className="text-sm text-slate-700 whitespace-pre-wrap">{ex.content}</p>
                            )}
                          </div>
                          {editMode && (
                            <div>
                              <p className="text-xs font-semibold text-slate-500 mb-1">Référence (strand)</p>
                              <input
                                type="text"
                                value={ex.criterionReference}
                                onChange={e => updateExercise(ei, 'criterionReference', e.target.value)}
                                className="w-full border border-slate-300 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400 bg-white"
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Footer */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 rounded-b-2xl flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500 min-h-[18px]">
                {saveStatus === 'saved' && (
                  <span className="flex items-center gap-1.5 text-green-600 font-semibold">
                    <CheckCircle size={14} /> Modifications sauvegardées !
                  </span>
                )}
                {editMode && saveStatus === 'idle' && (
                  <span className="text-purple-600">Mode édition — modifiez les champs puis cliquez sur Enregistrer.</span>
                )}
                {!editMode && saveStatus === 'idle' && (
                  <span>{assessments.length} critère(s) · {assessments.reduce((sum, a) => sum + (a.exercises?.length || 0), 0)} exercice(s) au total</span>
                )}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={onClose}
                  className="px-4 py-2 text-sm text-slate-600 bg-white border border-slate-300 rounded-xl hover:bg-slate-50 transition font-medium"
                >
                  Fermer
                </button>
                {editMode && onUpdateUnit && (
                  <button
                    onClick={handleSave}
                    className="flex items-center gap-2 px-5 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-sm font-semibold shadow transition"
                  >
                    <Save size={14} /> Enregistrer les modifications
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default AssessmentViewerModal;
