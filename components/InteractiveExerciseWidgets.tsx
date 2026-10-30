import React, { useState, useEffect } from 'react';
import { InteractiveExerciseModule, InteractiveDropZone } from '../types';
import { Table, Tag, FlaskConical, Plus, Trash2, Check, RefreshCw, Zap, Eye, Sliders } from 'lucide-react';

interface InteractiveExerciseWidgetsProps {
  module?: InteractiveExerciseModule;
  subject?: string;
  currentAnswer?: string;
  onUpdateAnswer?: (newAnswer: string) => void;
  isTeacherEditMode?: boolean;
  onUpdateModule?: (newModule: InteractiveExerciseModule | undefined) => void;
  readOnly?: boolean;
}

export function createDefaultInteractiveModule(
  type: 'table' | 'drag_labels' | 'virtual_lab',
  subject: string = ''
): InteractiveExerciseModule {
  const isEn = /english|anglais|acquisition/i.test(subject);
  const isSci = /science|physique|chimie|biologie|svt/i.test(subject);

  if (type === 'table') {
    return {
      type: 'table',
      title: isEn ? 'Interactive Table to Complete' : 'Tableau de données à compléter par l\'élève',
      instructions: isEn
        ? 'Complete the empty cells [...] in the table below. Your entries are automatically saved into your answer.'
        : 'Complétez les cases vides [...] dans le tableau ci-dessous. Vos réponses sont automatiquement enregistrées dans votre copie.',
      tableHeaders: isEn
        ? ['Element / Measure', 'Observation / Formula', 'Result & Unit']
        : ['Grandeur / Élément', 'Relation / Observation', 'Valeur & Unité'],
      tableRows: [
        [isEn ? 'Case 1' : 'Mesure 1', '[...]', '[...]'],
        [isEn ? 'Case 2' : 'Mesure 2', '[...]', '[...]'],
        [isEn ? 'Case 3' : 'Mesure 3', '[...]', '[...]'],
      ],
    };
  }

  if (type === 'drag_labels') {
    return {
      type: 'drag_labels',
      title: isEn ? 'Drag & Drop Labels Activity' : 'Étiquettes mobiles à déplacer et associer',
      instructions: isEn
        ? 'Drag each label or click on a label then click on its matching target zone below.'
        : 'Glissez-déposez chaque étiquette (ou cliquez sur une étiquette puis sur la zone correspondante) pour compléter l\'association.',
      labels: isEn
        ? ['Concept A', 'Concept B', 'Concept C', 'Concept D']
        : ['Étiquette 1', 'Étiquette 2', 'Étiquette 3', 'Étiquette 4'],
      dropZones: [
        { id: 'zone_1', prompt: isEn ? '1. First element or definition' : '1. Premier élément ou repère du schéma', correctLabel: isEn ? 'Concept A' : 'Étiquette 1' },
        { id: 'zone_2', prompt: isEn ? '2. Second element or definition' : '2. Deuxième élément ou repère du schéma', correctLabel: isEn ? 'Concept B' : 'Étiquette 2' },
        { id: 'zone_3', prompt: isEn ? '3. Third element or definition' : '3. Troisième élément ou repère du schéma', correctLabel: isEn ? 'Concept C' : 'Étiquette 3' },
      ],
    };
  }

  return {
    type: 'virtual_lab',
    title: isEn ? 'Virtual Laboratory Simulation' : 'Laboratoire Virtuel & Manipulation Expérimentale',
    instructions: isEn
      ? 'Perform the virtual experiment by adjusting the parameters below, observe the measurements, and click "Record Measurement" to insert your experimental data into your answer.'
      : 'Réalisez la manipulation virtuelle en ajustant les paramètres ci-dessous, observez le phénomène en direct, puis cliquez sur « Insérer ce relevé dans ma copie ».',
    labType: isSci ? 'circuit' : 'optics_mechanics',
  };
}

export const InteractiveExerciseWidgets: React.FC<InteractiveExerciseWidgetsProps> = ({
  module,
  subject = '',
  currentAnswer = '',
  onUpdateAnswer,
  isTeacherEditMode = false,
  onUpdateModule,
  readOnly = false,
}) => {
  const isEn = /english|anglais|acquisition/i.test(subject);

  // ── ÉTATS POUR LE TABLEAU INTERACTIF ───────────────────────────────────────
  const [studentCells, setStudentCells] = useState<Record<string, string>>({});

  // ── ÉTATS POUR LES ÉTIQUETTES À DÉPLACER (DRAG & DROP + CLIC) ─────────────
  const [placedLabels, setPlacedLabels] = useState<Record<string, string>>({});
  const [selectedLabelForClick, setSelectedLabelForClick] = useState<string | null>(null);
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  const [newLabelInput, setNewLabelInput] = useState('');

  // ── ÉTATS POUR LE LABORATOIRE VIRTUEL ─────────────────────────────────────
  // 1. Circuit électrique (Loi d'Ohm)
  const [voltage, setVoltage] = useState<number>(12);
  const [resistance, setResistance] = useState<number>(100);
  const [circuitClosed, setCircuitClosed] = useState<boolean>(true);
  // 2. Chimie Acide-Base & Titrage pH
  const [titrantVolumeMl, setTitrantVolumeMl] = useState<number>(0);
  const [initialAcidConc, setInitialAcidConc] = useState<number>(0.1);
  const [indicatorType, setIndicatorType] = useState<'bbt' | 'phenolphthalein'>('bbt');
  // 3. Optique & Mécanique (Pendule / Lentille)
  const [pendulumLengthCm, setPendulumLengthCm] = useState<number>(100);
  const [gravityG, setGravityG] = useState<number>(9.81);
  // 4. Microscope Biologie
  const [magnification, setMagnification] = useState<40 | 100 | 400>(100);
  const [focusSharpness, setFocusSharpness] = useState<number>(95);
  const [specimen, setSpecimen] = useState<'plant' | 'animal' | 'mitosis'>('plant');
  const [recordedTrials, setRecordedTrials] = useState<string[]>([]);

  // Synchroniser l'état initial si changement de module
  useEffect(() => {
    setStudentCells({});
    setPlacedLabels({});
    setSelectedLabelForClick(null);
  }, [module?.type]);

  // Synchroniser les saisies du tableau dans la réponse de l'élève
  const handleStudentCellChange = (rIdx: number, cIdx: number, val: string) => {
    if (readOnly) return;
    const next = { ...studentCells, [`${rIdx}_${cIdx}`]: val };
    setStudentCells(next);

    if (onUpdateAnswer && module?.tableRows) {
      const headers = module.tableHeaders || [];
      const lines: string[] = [];
      lines.push(isEn ? '📊 [COMPLETED TABLE]:' : '📊 [TABLEAU COMPLÉTÉ PAR L\'ÉLÈVE] :');
      if (headers.length > 0) {
        lines.push(`| ${headers.join(' | ')} |`);
      }
      module.tableRows.forEach((row, r) => {
        const renderedRow = row.map((cell, c) => {
          const isBlank = !cell || cell.trim() === '' || cell.includes('[...]');
          return isBlank ? (next[`${r}_${c}`] || '___') : cell;
        });
        lines.push(`• ${renderedRow.join('  |  ')}`);
      });
      const tableBlock = lines.join('\n');
      const cleanedPrev = (currentAnswer || '')
        .replace(/📊 \[(?:COMPLETED TABLE|TABLEAU COMPLÉTÉ PAR L'ÉLÈVE)\][\s\S]*?(?=\n\n|$)/g, '')
        .trim();
      onUpdateAnswer(cleanedPrev ? `${tableBlock}\n\n${cleanedPrev}` : tableBlock);
    }
  };

  // Synchroniser le placement des étiquettes dans la réponse de l'élève
  const updatePlacedLabelsAndSync = (nextPlaced: Record<string, string>) => {
    if (readOnly) return;
    setPlacedLabels(nextPlaced);
    if (onUpdateAnswer && module?.dropZones) {
      const lines: string[] = [];
      lines.push(isEn ? '🏷️ [MATCHED LABELS]:' : '🏷️ [ÉTIQUETTES PLACÉES PAR L\'ÉLÈVE] :');
      module.dropZones.forEach(z => {
        const chosen = nextPlaced[z.id] || (isEn ? '(not placed)' : '(non renseigné)');
        lines.push(`• ${z.prompt} ➔ ${chosen}`);
      });
      const block = lines.join('\n');
      const cleanedPrev = (currentAnswer || '')
        .replace(/🏷️ \[(?:MATCHED LABELS|ÉTIQUETTES PLACÉES PAR L'ÉLÈVE)\][\s\S]*?(?=\n\n|$)/g, '')
        .trim();
      onUpdateAnswer(cleanedPrev ? `${block}\n\n${cleanedPrev}` : block);
    }
  };

  // Enregistrer une mesure expérimentale du laboratoire virtuel dans la copie de l'élève
  const handleRecordLabMeasurement = (measurementLine: string) => {
    if (readOnly) return;
    const nextTrials = [...recordedTrials, measurementLine];
    setRecordedTrials(nextTrials);
    if (onUpdateAnswer) {
      const header = isEn ? '🧪 [VIRTUAL LAB MEASUREMENTS]:' : '🧪 [RELEVÉS EXPÉRIMENTAUX — LABORATOIRE VIRTUEL] :';
      const labBlock = `${header}\n${nextTrials.map((t, i) => `  Essai ${i + 1} : ${t}`).join('\n')}`;
      const cleanedPrev = (currentAnswer || '')
        .replace(/🧪 \[(?:VIRTUAL LAB MEASUREMENTS|RELEVÉS EXPÉRIMENTAUX — LABORATOIRE VIRTUEL)\][\s\S]*?(?=\n\n|$)/g, '')
        .trim();
      onUpdateAnswer(cleanedPrev ? `${labBlock}\n\n${cleanedPrev}` : labBlock);
    }
  };

  // Si aucun module n'est attaché et que nous ne sommes pas en mode édition enseignant, ne rien afficher
  if (!module && !isTeacherEditMode) {
    return null;
  }

  return (
    <div className="space-y-3">
      {/* BARRE D'ACTIVATION POUR L'ENSEIGNANT (Ajouter Tableau / Étiquettes / Labo Virtuel) */}
      {isTeacherEditMode && onUpdateModule && (
        <div className="bg-gradient-to-r from-emerald-50 via-teal-50 to-indigo-50 border border-emerald-200 rounded-2xl p-3 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Sliders size={15} className="text-emerald-700" />
            <span className="text-[11px] font-black text-emerald-950 uppercase tracking-wide">
              {isEn
                ? 'Interactive Student Workspace (Table, Labels, Virtual Lab):'
                : 'Activité Interactive Élève (Tableau à remplir, Étiquettes, Labo Virtuel) :'}
            </span>
          </div>

          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={() => onUpdateModule(createDefaultInteractiveModule('table', subject))}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                module?.type === 'table'
                  ? 'bg-emerald-600 text-white border-emerald-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-emerald-50'
              }`}
            >
              <Table size={13} />
              <span>{isEn ? 'Fillable Table' : '📊 Tableau à remplir'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateModule(createDefaultInteractiveModule('drag_labels', subject))}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                module?.type === 'drag_labels'
                  ? 'bg-indigo-600 text-white border-indigo-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-indigo-50'
              }`}
            >
              <Tag size={13} />
              <span>{isEn ? 'Movable Labels' : '🏷️ Étiquettes à déplacer'}</span>
            </button>

            <button
              type="button"
              onClick={() => onUpdateModule(createDefaultInteractiveModule('virtual_lab', subject))}
              className={`px-2.5 py-1.5 rounded-xl text-xs font-bold flex items-center gap-1.5 border transition ${
                module?.type === 'virtual_lab'
                  ? 'bg-purple-600 text-white border-purple-700 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-purple-50'
              }`}
            >
              <FlaskConical size={13} />
              <span>{isEn ? 'Virtual Lab' : '🧪 Manipulation Laboratoire'}</span>
            </button>

            {module && (
              <button
                type="button"
                onClick={() => onUpdateModule(undefined)}
                className="px-2.5 py-1.5 rounded-xl text-xs font-bold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 transition"
                title="Retirer l'activité interactive de cet exercice"
              >
                ✕ {isEn ? 'Remove' : 'Retirer'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODULE 1 : TABLEAU INTERACTIF À REMPLIR PAR L'ÉLÈVE ('table')
          ═══════════════════════════════════════════════════════════════════════ */}
      {module?.type === 'table' && (
        <div className="bg-emerald-50/60 border-2 border-emerald-200 rounded-2xl p-4 space-y-3 shadow-2xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-emerald-600 text-white">
                <Table size={15} />
              </span>
              <div>
                <h5 className="text-xs sm:text-sm font-black text-emerald-950">
                  {module.title || (isEn ? 'Interactive Table to Complete' : 'Tableau à remplir par l\'élève')}
                </h5>
                <p className="text-[11px] text-emerald-800">
                  {module.instructions ||
                    (isEn
                      ? 'Fill in the blank cells directly in the table below.'
                      : 'Remplissez directement les cases à compléter dans le tableau ci-dessous.')}
                </p>
              </div>
            </div>

            {isTeacherEditMode && onUpdateModule && (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    const cols = (module.tableHeaders || ['Col 1', 'Col 2']).length;
                    const nextRow = Array(cols).fill('[...]');
                    nextRow[0] = `Ligne ${(module.tableRows?.length || 0) + 1}`;
                    onUpdateModule({
                      ...module,
                      tableRows: [...(module.tableRows || []), nextRow],
                    });
                  }}
                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus size={12} /> + Ligne
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const nextColIndex = (module.tableHeaders?.length || 2) + 1;
                    onUpdateModule({
                      ...module,
                      tableHeaders: [...(module.tableHeaders || []), `Colonne ${nextColIndex}`],
                      tableRows: (module.tableRows || []).map(r => [...r, '[...]']),
                    });
                  }}
                  className="px-2.5 py-1 bg-teal-600 hover:bg-teal-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus size={12} /> + Colonne
                </button>
              </div>
            )}
          </div>

          {isTeacherEditMode && onUpdateModule && (
            <p className="text-[11px] text-emerald-900 bg-white/80 px-3 py-1.5 rounded-xl border border-emerald-200">
              💡 <strong>Mode Enseignant :</strong> Écrivez <code className="bg-emerald-100 px-1 rounded font-bold">[...]</code> (ou laissez vide) dans une cellule pour que l'élève doive la remplir lui-même.
            </p>
          )}

          <div className="overflow-x-auto rounded-xl border border-emerald-300 bg-white shadow-2xs">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-emerald-700 text-white">
                  {(module.tableHeaders || ['Colonne 1', 'Colonne 2', 'Colonne 3']).map((h, cIdx) => (
                    <th key={cIdx} className="p-2.5 border-r border-emerald-600 last:border-r-0 text-left font-bold">
                      {isTeacherEditMode && onUpdateModule ? (
                        <div className="flex items-center gap-1">
                          <input
                            type="text"
                            value={h}
                            onChange={e => {
                              const nextHeaders = [...(module.tableHeaders || [])];
                              nextHeaders[cIdx] = e.target.value;
                              onUpdateModule({ ...module, tableHeaders: nextHeaders });
                            }}
                            className="w-full bg-emerald-800/80 text-white px-2 py-1 rounded border border-emerald-500 text-xs font-bold focus:outline-none"
                          />
                          {(module.tableHeaders?.length || 0) > 2 && (
                            <button
                              type="button"
                              onClick={() => {
                                const nextHeaders = (module.tableHeaders || []).filter((_, i) => i !== cIdx);
                                const nextRows = (module.tableRows || []).map(r => r.filter((_, i) => i !== cIdx));
                                onUpdateModule({ ...module, tableHeaders: nextHeaders, tableRows: nextRows });
                              }}
                              className="text-emerald-200 hover:text-rose-300 px-1"
                              title="Supprimer cette colonne"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      ) : (
                        <span>{h}</span>
                      )}
                    </th>
                  ))}
                  {isTeacherEditMode && <th className="w-8 bg-emerald-800" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {(module.tableRows || []).map((row, rIdx) => (
                  <tr key={rIdx} className="hover:bg-emerald-50/40">
                    {row.map((cell, cIdx) => {
                      const isEditableByStudent = !cell || cell.trim() === '' || cell.includes('[...]');
                      return (
                        <td key={cIdx} className="p-2 border-r border-slate-200 last:border-r-0">
                          {isTeacherEditMode && onUpdateModule ? (
                            <input
                              type="text"
                              value={cell}
                              onChange={e => {
                                const nextRows = (module.tableRows || []).map((r, ri) =>
                                  ri === rIdx ? r.map((c, ci) => (ci === cIdx ? e.target.value : c)) : r
                                );
                                onUpdateModule({ ...module, tableRows: nextRows });
                              }}
                              placeholder="[...] (à remplir par l'élève)"
                              className={`w-full px-2 py-1.5 rounded-lg border text-xs font-medium ${
                                isEditableByStudent
                                  ? 'bg-amber-50/70 border-amber-300 text-amber-900 font-bold'
                                  : 'bg-slate-50 border-slate-200 text-slate-800'
                              }`}
                            />
                          ) : isEditableByStudent ? (
                            <input
                              type="text"
                              disabled={readOnly}
                              value={studentCells[`${rIdx}_${cIdx}`] ?? ''}
                              onChange={e => handleStudentCellChange(rIdx, cIdx, e.target.value)}
                              placeholder={isEn ? 'Type answer here...' : 'Compléter ici...'}
                              className="w-full px-2.5 py-1.5 bg-emerald-50/80 focus:bg-white border-2 border-emerald-400 focus:border-emerald-600 rounded-lg text-xs font-bold text-emerald-950 outline-none transition"
                            />
                          ) : (
                            <span className="font-semibold text-slate-800 px-1">{cell}</span>
                          )}
                        </td>
                      );
                    })}
                    {isTeacherEditMode && onUpdateModule && (
                      <td className="p-1 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            const nextRows = (module.tableRows || []).filter((_, i) => i !== rIdx);
                            onUpdateModule({ ...module, tableRows: nextRows });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1"
                          title="Supprimer cette ligne"
                        >
                          <Trash2 size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODULE 2 : ÉTIQUETTES À DÉPLACER / GLISSER-DÉPOSER ('drag_labels')
          ═══════════════════════════════════════════════════════════════════════ */}
      {module?.type === 'drag_labels' && (
        <div className="bg-indigo-50/60 border-2 border-indigo-200 rounded-2xl p-4 space-y-4 shadow-2xs">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="p-1.5 rounded-lg bg-indigo-600 text-white">
                <Tag size={15} />
              </span>
              <div>
                <h5 className="text-xs sm:text-sm font-black text-indigo-950">
                  {module.title || (isEn ? 'Movable Labels (Drag & Drop)' : 'Étiquettes mobiles à déplacer')}
                </h5>
                <p className="text-[11px] text-indigo-800">
                  {module.instructions ||
                    (isEn
                      ? 'Drag a label onto a target zone, or click a label then click its target box.'
                      : 'Glissez une étiquette vers la zone souhaitée (ou cliquez sur une étiquette puis sur sa zone cible).')}
                </p>
              </div>
            </div>

            {!readOnly && Object.keys(placedLabels).length > 0 && (
              <button
                type="button"
                onClick={() => updatePlacedLabelsAndSync({})}
                className="px-2.5 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <RefreshCw size={12} /> {isEn ? 'Reset Labels' : 'Réinitialiser les étiquettes'}
              </button>
            )}
          </div>

          {/* Réserve d'étiquettes mobiles */}
          <div className="bg-white p-3 rounded-xl border border-indigo-200 space-y-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900 block">
              🏷️ {isEn ? 'Available Labels (Click or Drag):' : ' Banque d\'étiquettes mobiles (Cliquez ou glissez) :'}
            </span>
            <div className="flex flex-wrap gap-2">
              {(module.labels || []).map((lbl, idx) => {
                const isAlreadyPlaced = Object.values(placedLabels).includes(lbl);
                const isSelected = selectedLabelForClick === lbl;
                return (
                  <div
                    key={`${lbl}_${idx}`}
                    draggable={!readOnly}
                    onDragStart={() => setDraggedLabel(lbl)}
                    onClick={() => {
                      if (readOnly) return;
                      setSelectedLabelForClick(isSelected ? null : lbl);
                    }}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer select-none transition flex items-center gap-1.5 border-2 ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-700 shadow-md scale-105'
                        : isAlreadyPlaced
                        ? 'bg-slate-100 text-slate-500 border-slate-200 opacity-75'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-950 border-indigo-300 shadow-2xs'
                    }`}
                  >
                    <span>⠿</span>
                    <span>{lbl}</span>
                    {isTeacherEditMode && onUpdateModule && (
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const next = (module.labels || []).filter((_, i) => i !== idx);
                          onUpdateModule({ ...module, labels: next });
                        }}
                        className="ml-1 text-rose-500 hover:text-rose-700 font-black"
                        title="Supprimer cette étiquette"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {isTeacherEditMode && onUpdateModule && (
              <div className="flex items-center gap-2 pt-2 border-t border-slate-100">
                <input
                  type="text"
                  value={newLabelInput}
                  onChange={e => setNewLabelInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newLabelInput.trim()) {
                      e.preventDefault();
                      onUpdateModule({
                        ...module,
                        labels: [...(module.labels || []), newLabelInput.trim()],
                      });
                      setNewLabelInput('');
                    }
                  }}
                  placeholder="Nouvelle étiquette (ex: Chloroplaste, Mitochondrie, Noyau...)"
                  className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-300 rounded-lg text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!newLabelInput.trim()) return;
                    onUpdateModule({
                      ...module,
                      labels: [...(module.labels || []), newLabelInput.trim()],
                    });
                    setNewLabelInput('');
                  }}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold"
                >
                  + Ajouter étiquette
                </button>
              </div>
            )}
          </div>

          {/* Zones de dépôt (Drop Zones) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-wider text-indigo-900">
                🎯 {isEn ? 'Target Zones (Drop labels here):' : 'Zones cibles où déposer les étiquettes :'}
              </span>
              {isTeacherEditMode && onUpdateModule && (
                <button
                  type="button"
                  onClick={() => {
                    const nextNum = (module.dropZones?.length || 0) + 1;
                    const nextZone: InteractiveDropZone = {
                      id: `zone_${Date.now()}_${nextNum}`,
                      prompt: `${nextNum}. Élément à identifier...`,
                    };
                    onUpdateModule({
                      ...module,
                      dropZones: [...(module.dropZones || []), nextZone],
                    });
                  }}
                  className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1"
                >
                  <Plus size={12} /> + Ajouter une zone cible
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {(module.dropZones || []).map((zone, zIdx) => {
                const currentPlaced = placedLabels[zone.id];
                return (
                  <div
                    key={zone.id || zIdx}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (readOnly || !draggedLabel) return;
                      updatePlacedLabelsAndSync({
                        ...placedLabels,
                        [zone.id]: draggedLabel,
                      });
                      setDraggedLabel(null);
                    }}
                    onClick={() => {
                      if (readOnly) return;
                      if (selectedLabelForClick) {
                        updatePlacedLabelsAndSync({
                          ...placedLabels,
                          [zone.id]: selectedLabelForClick,
                        });
                        setSelectedLabelForClick(null);
                      }
                    }}
                    className={`p-3 rounded-xl border-2 transition flex flex-col justify-between gap-2 ${
                      currentPlaced
                        ? 'bg-white border-indigo-500 shadow-2xs'
                        : selectedLabelForClick
                        ? 'bg-indigo-100/60 border-dashed border-indigo-500 cursor-pointer animate-pulse'
                        : 'bg-white/90 border-dashed border-indigo-300'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      {isTeacherEditMode && onUpdateModule ? (
                        <input
                          type="text"
                          value={zone.prompt}
                          onChange={e => {
                            const nextZones = (module.dropZones || []).map((z, i) =>
                              i === zIdx ? { ...z, prompt: e.target.value } : z
                            );
                            onUpdateModule({ ...module, dropZones: nextZones });
                          }}
                          className="flex-1 px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-bold text-slate-800"
                        />
                      ) : (
                        <span className="text-xs font-bold text-slate-800">{zone.prompt}</span>
                      )}

                      {isTeacherEditMode && onUpdateModule && (module.dropZones?.length || 0) > 1 && (
                        <button
                          type="button"
                          onClick={e => {
                            e.stopPropagation();
                            const nextZones = (module.dropZones || []).filter((_, i) => i !== zIdx);
                            onUpdateModule({ ...module, dropZones: nextZones });
                          }}
                          className="text-slate-400 hover:text-rose-600 p-1"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </div>

                    <div className="min-h-[34px] rounded-lg bg-indigo-50/80 border border-indigo-200 px-3 py-1.5 flex items-center justify-between">
                      {currentPlaced ? (
                        <>
                          <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5">
                            <Check size={13} className="text-emerald-600" />
                            {currentPlaced}
                          </span>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={e => {
                                e.stopPropagation();
                                const next = { ...placedLabels };
                                delete next[zone.id];
                                updatePlacedLabelsAndSync(next);
                              }}
                              className="text-[10px] font-bold text-rose-600 hover:text-rose-800"
                            >
                              ✕
                            </button>
                          )}
                        </>
                      ) : (
                        <span className="text-[11px] italic text-indigo-400">
                          {selectedLabelForClick
                            ? isEn
                              ? `Click here to place "${selectedLabelForClick}"`
                              : `Cliquez ici pour déposer « ${selectedLabelForClick} »`
                            : isEn
                            ? 'Drop label here...'
                            : 'Déposez une étiquette ici...'}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          MODULE 3 : LABORATOIRE VIRTUEL & MANIPULATION EXPÉRIMENTALE ('virtual_lab')
          ═══════════════════════════════════════════════════════════════════════ */}
      {module?.type === 'virtual_lab' && (
        <div className="bg-gradient-to-br from-slate-900 via-indigo-950 to-purple-950 text-white rounded-2xl p-4 sm:p-5 space-y-4 border-2 border-purple-400/50 shadow-md">
          {/* En-tête du laboratoire virtuel */}
          <div className="flex items-center justify-between gap-3 flex-wrap border-b border-white/15 pb-3">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-amber-400 text-slate-950 flex items-center justify-center font-black shadow">
                <FlaskConical size={20} />
              </div>
              <div>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-300 block">
                  {isEn ? 'Interactive Virtual Science Lab' : 'Paillasse de Manipulation & Expérience Virtuelle'}
                </span>
                <h5 className="text-sm sm:text-base font-black text-white">
                  {module.title || (isEn ? 'Virtual Lab Experiment' : 'Manipulation de Laboratoire Virtuel')}
                </h5>
              </div>
            </div>

            {/* Choix du banc de laboratoire (circuit, chimie, optique/mécanique, microscope) */}
            <div className="flex items-center gap-1.5 flex-wrap">
              {(
                [
                  { id: 'circuit', label: isEn ? '⚡ Electric Circuit' : '⚡ Circuit & Loi d\'Ohm' },
                  { id: 'chemistry_ph', label: isEn ? '🧪 Acid-Base & pH' : '🧪 Chimie & Titrage pH' },
                  { id: 'optics_mechanics', label: isEn ? '🔭 Pendulum & Gravity' : '🔭 Pendule & Gravité' },
                  { id: 'biology_microscope', label: isEn ? '🔬 Cell Microscope' : '🔬 Microscope Cellulaire' },
                ] as const
              ).map(tab => {
                const active = (module.labType || 'circuit') === tab.id;
                return (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => {
                      if (onUpdateModule) {
                        onUpdateModule({ ...module, labType: tab.id });
                      }
                    }}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition ${
                      active
                        ? 'bg-amber-400 text-slate-950 font-black shadow-xs'
                        : 'bg-white/10 text-purple-200 hover:bg-white/20'
                    }`}
                  >
                    {tab.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* EXPÉRIENCE A : CIRCUIT ÉLECTRIQUE & LOI D'OHM (U = R * I) */}
          {(!module.labType || module.labType === 'circuit') && (() => {
            const currentAmp = circuitClosed ? Number((voltage / resistance).toFixed(3)) : 0;
            const currentMa = Number((currentAmp * 1000).toFixed(1));
            const powerWatt = Number((voltage * currentAmp).toFixed(2));
            const bulbGlow = Math.min(1, powerWatt / 3);

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                {/* Schéma dynamique interactif du circuit */}
                <div className="bg-slate-950/90 border border-indigo-400/30 rounded-xl p-3 text-center">
                  <svg viewBox="0 0 420 230" className="w-full h-48 mx-auto">
                    {/* Fils du circuit */}
                    <rect x="50" y="35" width="320" height="160" rx="12" fill="none" stroke={circuitClosed ? '#38bdf8' : '#64748b'} strokeWidth="4" />
                    {/* Générateur U */}
                    <circle cx="50" cy="115" r="24" fill="#1e293b" stroke="#f59e0b" strokeWidth="3" />
                    <text x="50" y="112" textAnchor="middle" fill="#fbbf24" fontSize="11" fontWeight="bold">G</text>
                    <text x="50" y="126" textAnchor="middle" fill="#ffffff" fontSize="10">{voltage}V</text>
                    {/* Interrupteur */}
                    <rect x="175" y="20" width="70" height="28" rx="6" fill="#0f172a" stroke="#94a3b8" strokeWidth="1.5" />
                    <line
                      x1="185"
                      y1="35"
                      x2={circuitClosed ? '235' : '228'}
                      y2={circuitClosed ? '35' : '18'}
                      stroke={circuitClosed ? '#4ade80' : '#f43f5e'}
                      strokeWidth="4"
                    />
                    {/* Résistance R */}
                    <rect x="160" y="177" width="100" height="36" rx="6" fill="#1e1b4b" stroke="#a855f7" strokeWidth="3" />
                    <text x="210" y="199" textAnchor="middle" fill="#e9d5ff" fontSize="12" fontWeight="bold">
                      R = {resistance} Ω
                    </text>
                    {/* Lampe témoin + Ampèremètre */}
                    <circle
                      cx="370"
                      cy="115"
                      r="26"
                      fill={circuitClosed && currentAmp > 0 ? `rgba(250, 204, 21, ${0.25 + bulbGlow * 0.7})` : '#1e293b'}
                      stroke="#eab308"
                      strokeWidth="3"
                    />
                    <text x="370" y="112" textAnchor="middle" fill="#fef08a" fontSize="11" fontWeight="bold">A</text>
                    <text x="370" y="126" textAnchor="middle" fill="#ffffff" fontSize="10">{currentMa}mA</text>
                  </svg>
                  <div className="flex items-center justify-center gap-3 text-xs mt-1">
                    <span className="px-2.5 py-1 rounded bg-amber-500/20 border border-amber-400/40 text-amber-200 font-mono font-bold">
                      U = {voltage.toFixed(1)} V
                    </span>
                    <span className="px-2.5 py-1 rounded bg-purple-500/20 border border-purple-400/40 text-purple-200 font-mono font-bold">
                      R = {resistance} Ω
                    </span>
                    <span className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 font-mono font-bold">
                      I = {currentMa} mA ({currentAmp} A)
                    </span>
                  </div>
                </div>

                {/* Commandes de manipulation par l'élève */}
                <div className="space-y-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-purple-200">
                      {isEn ? 'Main Switch:' : 'Interrupteur du circuit :'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setCircuitClosed(!circuitClosed)}
                      className={`px-3 py-1 rounded-lg text-xs font-black transition ${
                        circuitClosed ? 'bg-emerald-500 text-slate-950' : 'bg-rose-600 text-white'
                      }`}
                    >
                      {circuitClosed ? (isEn ? 'CLOSED (ON)' : 'FERMÉ (Courant actif)') : (isEn ? 'OPEN (OFF)' : 'OUVERT (0 A)')}
                    </button>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>⚡ {isEn ? 'Generator Voltage (U):' : 'Tension du générateur (U) :'}</span>
                      <span className="text-amber-300 font-mono">{voltage} V</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={24}
                      step={0.5}
                      value={voltage}
                      onChange={e => setVoltage(parseFloat(e.target.value))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>🎛️ {isEn ? 'Resistance (R):' : 'Résistance du dipôle (R) :'}</span>
                      <span className="text-purple-300 font-mono">{resistance} Ω</span>
                    </div>
                    <input
                      type="range"
                      min={10}
                      max={500}
                      step={10}
                      value={resistance}
                      onChange={e => setResistance(parseInt(e.target.value, 10))}
                      className="w-full accent-purple-400 cursor-pointer"
                    />
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleRecordLabMeasurement(
                        `U = ${voltage} V | R = ${resistance} Ω ➔ I = ${currentMa} mA (${currentAmp} A) | P = ${powerWatt} W`
                      )
                    }
                    className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                  >
                    <Zap size={14} />
                    <span>
                      {isEn
                        ? '+ Record this measurement in my answer'
                        : '📥 Insérer cette mesure expérimentale dans ma copie'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* EXPÉRIENCE B : CHIMIE — TITRAGE ACIDE-BASE & pH-MÈTRE */}
          {module.labType === 'chemistry_ph' && (() => {
            // Simulation d'un titrage de 20 mL d'acide HCl (C_a = initialAcidConc) par NaOH (C_b = 0.1 mol/L)
            const eqVol = (20 * initialAcidConc) / 0.1;
            const diff = titrantVolumeMl - eqVol;
            let ph = 7.0;
            if (Math.abs(diff) < 0.15) {
              ph = 7.0;
            } else if (diff < 0) {
              const excessH = ((eqVol - titrantVolumeMl) * 0.1) / (20 + titrantVolumeMl);
              ph = Math.max(1.0, Number((-Math.log10(Math.max(1e-7, excessH))).toFixed(2)));
            } else {
              const excessOH = ((titrantVolumeMl - eqVol) * 0.1) / (20 + titrantVolumeMl);
              const poh = -Math.log10(Math.max(1e-7, excessOH));
              ph = Math.min(13.2, Number((14 - poh).toFixed(2)));
            }

            const beakerColor =
              indicatorType === 'bbt'
                ? ph < 6.0
                  ? '#facc15' // Jaune (acide)
                  : ph <= 7.6
                  ? '#10b981' // Vert (zone de virage / neutre)
                  : '#3b82f6' // Bleu (basique)
                : ph < 8.2
                ? 'rgba(226, 232, 240, 0.35)' // Incolore
                : '#ec4899'; // Rose fuchsia

            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="bg-slate-950/90 border border-indigo-400/30 rounded-xl p-3 text-center">
                  <svg viewBox="0 0 380 220" className="w-full h-44 mx-auto">
                    {/* Burette graduée */}
                    <rect x="178" y="10" width="24" height="75" rx="3" fill="#1e293b" stroke="#94a3b8" strokeWidth="2" />
                    <rect x="181" y={15 + Math.min(60, titrantVolumeMl * 2)} width="18" height={Math.max(5, 65 - titrantVolumeMl * 2)} fill="#38bdf8" />
                    <circle cx="190" cy="96" r="4" fill="#38bdf8" />
                    {/* Bécher */}
                    <path d="M 135 110 L 135 190 Q 135 202 148 202 L 232 202 Q 245 202 245 190 L 245 110" fill="none" stroke="#e2e8f0" strokeWidth="3" />
                    <path d="M 138 135 L 138 188 Q 138 199 148 199 L 232 199 Q 242 199 242 188 L 242 135 Z" fill={beakerColor} />
                    {/* Écran pH-mètre */}
                    <rect x="265" y="120" width="95" height="58" rx="8" fill="#0f172a" stroke="#10b981" strokeWidth="2.5" />
                    <text x="312" y="140" textAnchor="middle" fill="#6ee7b7" fontSize="10" fontWeight="bold">pH-MÈTRE</text>
                    <text x="312" y="164" textAnchor="middle" fill="#ffffff" fontSize="18" fontWeight="bold" fontFamily="monospace">
                      {ph.toFixed(2)}
                    </text>
                  </svg>
                  <div className="flex items-center justify-center gap-2 text-xs">
                    <span className="px-2.5 py-1 rounded bg-emerald-500/20 border border-emerald-400/40 text-emerald-200 font-mono font-bold">
                      pH = {ph.toFixed(2)}
                    </span>
                    <span className="px-2.5 py-1 rounded bg-sky-500/20 border border-sky-400/40 text-sky-200 font-mono font-bold">
                      V(NaOH versé) = {titrantVolumeMl.toFixed(1)} mL
                    </span>
                  </div>
                </div>

                <div className="space-y-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>💧 {isEn ? 'NaOH Volume added (mL):' : 'Volume de soude NaOH versé (V) :'}</span>
                      <span className="text-sky-300 font-mono">{titrantVolumeMl.toFixed(1)} mL</span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={25}
                      step={0.5}
                      value={titrantVolumeMl}
                      onChange={e => setTitrantVolumeMl(parseFloat(e.target.value))}
                      className="w-full accent-sky-400 cursor-pointer"
                    />
                  </div>

                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span>🎨 {isEn ? 'Color Indicator:' : 'Indicateur coloré :'}</span>
                    <div className="flex gap-1.5">
                      <button
                        type="button"
                        onClick={() => setIndicatorType('bbt')}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                          indicatorType === 'bbt' ? 'bg-emerald-500 text-slate-950' : 'bg-white/10 text-white'
                        }`}
                      >
                        BBT
                      </button>
                      <button
                        type="button"
                        onClick={() => setIndicatorType('phenolphthalein')}
                        className={`px-2.5 py-1 rounded text-[11px] font-bold ${
                          indicatorType === 'phenolphthalein' ? 'bg-pink-500 text-white' : 'bg-white/10 text-white'
                        }`}
                      >
                        Phénolphtaléine
                      </button>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleRecordLabMeasurement(
                        `V(NaOH) = ${titrantVolumeMl.toFixed(1)} mL ➔ pH mesuré = ${ph.toFixed(2)} (${
                          ph < 6.8 ? 'Milieu Acide' : ph > 7.2 ? 'Milieu Basique' : 'Neutralité / Équivalence'
                        })`
                      )
                    }
                    className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                  >
                    <Zap size={14} />
                    <span>
                      {isEn
                        ? '+ Record pH measurement in my answer'
                        : '📥 Insérer ce relevé pH dans ma copie'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* EXPÉRIENCE C : PENDULE & GRAVITÉ (T = 2*pi*sqrt(L/g)) */}
          {module.labType === 'optics_mechanics' && (() => {
            const lengthM = pendulumLengthCm / 100;
            const periodSec = Number((2 * Math.PI * Math.sqrt(lengthM / gravityG)).toFixed(2));
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                <div className="bg-slate-950/90 border border-indigo-400/30 rounded-xl p-3 text-center">
                  <svg viewBox="0 0 360 210" className="w-full h-44 mx-auto">
                    <line x1="120" y1="20" x2="240" y2="20" stroke="#94a3b8" strokeWidth="5" />
                    <line
                      x1="180"
                      y1="20"
                      x2={180 + Math.min(75, pendulumLengthCm * 0.4)}
                      y2={20 + Math.min(145, pendulumLengthCm * 0.9)}
                      stroke="#38bdf8"
                      strokeWidth="3"
                    />
                    <circle
                      cx={180 + Math.min(75, pendulumLengthCm * 0.4)}
                      cy={20 + Math.min(145, pendulumLengthCm * 0.9)}
                      r="16"
                      fill="#f59e0b"
                      stroke="#fef08a"
                      strokeWidth="2.5"
                    />
                    <text x="180" y="195" textAnchor="middle" fill="#e2e8f0" fontSize="12" fontWeight="bold">
                      Période d'oscillation T = {periodSec} s
                    </text>
                  </svg>
                </div>

                <div className="space-y-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>📏 {isEn ? 'Pendulum Length (L):' : 'Longueur du fil (L) :'}</span>
                      <span className="text-amber-300 font-mono">{pendulumLengthCm} cm ({lengthM.toFixed(2)} m)</span>
                    </div>
                    <input
                      type="range"
                      min={20}
                      max={200}
                      step={10}
                      value={pendulumLengthCm}
                      onChange={e => setPendulumLengthCm(parseInt(e.target.value, 10))}
                      className="w-full accent-amber-400 cursor-pointer"
                    />
                  </div>

                  <div>
                    <div className="flex justify-between text-xs font-bold mb-1">
                      <span>🌍 {isEn ? 'Gravity (g):' : 'Intensité de la pesanteur (g) :'}</span>
                      <span className="text-sky-300 font-mono">{gravityG} m/s²</span>
                    </div>
                    <div className="flex gap-1.5">
                      {[
                        { label: 'Terre (9.81)', val: 9.81 },
                        { label: 'Lune (1.62)', val: 1.62 },
                        { label: 'Mars (3.71)', val: 3.71 },
                      ].map(p => (
                        <button
                          key={p.label}
                          type="button"
                          onClick={() => setGravityG(p.val)}
                          className={`px-2 py-1 rounded text-[11px] font-bold flex-1 ${
                            gravityG === p.val ? 'bg-sky-400 text-slate-950' : 'bg-white/10 text-white'
                          }`}
                        >
                          {p.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleRecordLabMeasurement(
                        `L = ${lengthM.toFixed(2)} m | g = ${gravityG} m/s² ➔ Période mesurée T = ${periodSec} s`
                      )
                    }
                    className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                  >
                    <Zap size={14} />
                    <span>
                      {isEn ? '+ Record period T in my answer' : '📥 Insérer cette mesure dans ma copie'}
                    </span>
                  </button>
                </div>
              </div>
            );
          })()}

          {/* EXPÉRIENCE D : MICROSCOPE CELLULAIRE (BIOLOGIE / SVT) */}
          {module.labType === 'biology_microscope' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="bg-slate-950/90 border border-indigo-400/30 rounded-xl p-3 text-center">
                <div
                  className="w-44 h-44 mx-auto rounded-full border-4 border-slate-600 bg-emerald-950/70 flex items-center justify-center overflow-hidden shadow-inner"
                  style={{ filter: `blur(${Math.max(0, (100 - focusSharpness) / 14)}px)` }}
                >
                  {specimen === 'plant' && (
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      <rect x="30" y="45" width="140" height="110" rx="12" fill="#bbf7d0" stroke="#15803d" strokeWidth="6" />
                      <ellipse cx="105" cy="100" rx="42" ry="26" fill="#e0f2fe" stroke="#0284c7" strokeWidth="2" />
                      <circle cx="62" cy="82" r="14" fill="#be185d" />
                      <circle cx="70" cy="128" r="6" fill="#16a34a" />
                      <circle cx="145" cy="75" r="6" fill="#16a34a" />
                      <circle cx="138" cy="126" r="6" fill="#16a34a" />
                    </svg>
                  )}
                  {specimen === 'animal' && (
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      <ellipse cx="100" cy="100" rx="62" ry="48" fill="#fbcfe8" stroke="#db2777" strokeWidth="3" />
                      <circle cx="100" cy="100" r="18" fill="#831843" />
                    </svg>
                  )}
                  {specimen === 'mitosis' && (
                    <svg viewBox="0 0 200 200" className="w-full h-full">
                      <ellipse cx="100" cy="100" rx="65" ry="48" fill="#fef3c7" stroke="#d97706" strokeWidth="3" />
                      <path d="M 75 80 L 90 100 L 75 120 M 125 80 L 110 100 L 125 120" stroke="#7c2d12" strokeWidth="4" fill="none" />
                    </svg>
                  )}
                </div>
                <span className="text-[11px] text-emerald-300 font-mono block mt-2">
                  Grossissement : ×{magnification} · Netteté : {focusSharpness}%
                </span>
              </div>

              <div className="space-y-3 bg-white/5 p-3.5 rounded-xl border border-white/10">
                <div className="flex gap-1.5">
                  {[
                    { id: 'plant', label: '🌿 Cellule végétale' },
                    { id: 'animal', label: '🧬 Cellule animale' },
                    { id: 'mitosis', label: '🔬 Mitose' },
                  ].map(sp => (
                    <button
                      key={sp.id}
                      type="button"
                      onClick={() => setSpecimen(sp.id as any)}
                      className={`px-2.5 py-1 rounded text-[11px] font-bold flex-1 ${
                        specimen === sp.id ? 'bg-emerald-400 text-slate-950' : 'bg-white/10 text-white'
                      }`}
                    >
                      {sp.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span>🔍 Objectif (Grossissement) :</span>
                  <div className="flex gap-1.5">
                    {([40, 100, 400] as const).map(mag => (
                      <button
                        key={mag}
                        type="button"
                        onClick={() => setMagnification(mag)}
                        className={`px-2.5 py-1 rounded font-mono font-bold ${
                          magnification === mag ? 'bg-amber-400 text-slate-950' : 'bg-white/10 text-white'
                        }`}
                      >
                        ×{mag}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold mb-1">
                    <span>🎯 Vis micrométrique (Mise au point) :</span>
                    <span className="text-emerald-300 font-mono">{focusSharpness}%</span>
                  </div>
                  <input
                    type="range"
                    min={20}
                    max={100}
                    value={focusSharpness}
                    onChange={e => setFocusSharpness(parseInt(e.target.value, 10))}
                    className="w-full accent-emerald-400 cursor-pointer"
                  />
                </div>

                <button
                  type="button"
                  onClick={() =>
                    handleRecordLabMeasurement(
                      `Observation microscopique (${
                        specimen === 'plant'
                          ? 'Cellule végétale : paroi, vacuole, noyau, chloroplastes'
                          : specimen === 'animal'
                          ? 'Cellule animale : membrane plasmique, cytoplasme, noyau'
                          : 'Cellule en division (Mitose : séparation des chromosomes)'
                      }) au grossissement ×${magnification} (netteté ${focusSharpness}%)`
                    )
                  }
                  className="w-full py-2 px-3 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs rounded-xl shadow transition flex items-center justify-center gap-1.5"
                >
                  <Eye size={14} />
                  <span>📥 Insérer cette observation dans ma copie</span>
                </button>
              </div>
            </div>
          )}

          {/* Historique des mesures insérées */}
          {recordedTrials.length > 0 && (
            <div className="bg-black/30 rounded-xl p-2.5 border border-emerald-400/30 text-xs space-y-1">
              <span className="text-[10px] font-black uppercase text-emerald-300 block">
                ✔ Mesures expérimentales insérées dans votre copie ({recordedTrials.length}) :
              </span>
              {recordedTrials.map((t, idx) => (
                <div key={idx} className="text-emerald-100 font-mono text-[11px]">
                  • Essai {idx + 1} : {t}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InteractiveExerciseWidgets;
