import React, { useState, useEffect } from 'react';
import { AssessmentExercise } from '../types';
import { Table, Tag, FlaskConical, Plus, Trash2, Check, RotateCcw, ArrowRight, Sparkles } from 'lucide-react';

interface InteractiveExerciseWidgetsProps {
  exercise: AssessmentExercise;
  subject?: string;
  currentAnswer: string;
  onUpdateAnswer: (newAnswer: string) => void;
  isTeacherConfigMode?: boolean;
  onUpdateExerciseConfig?: (updates: Partial<AssessmentExercise>) => void;
}

type ActiveWidgetTab = 'none' | 'table' | 'labels' | 'virtual_lab';
type VirtualLabExperiment = 'chemistry_ph' | 'physics_ohm' | 'biology_photosynthesis' | 'mechanics_gravity';

/**
 * Extrait un tableau HTML éventuel depuis l'énoncé de l'exercice pour pré-remplir la grille interactive
 */
function parseHtmlTableFromContent(html?: string): { headers: string[]; rows: string[][] } | null {
  if (!html || !/<table/i.test(html)) return null;
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const table = doc.querySelector('table');
    if (!table) return null;

    const trs = Array.from(table.querySelectorAll('tr'));
    if (trs.length === 0) return null;

    const headers = Array.from(trs[0].querySelectorAll('th, td')).map(c => (c.textContent || '').trim());
    const rows = trs.slice(1).map(tr =>
      Array.from(tr.querySelectorAll('td, th')).map(c => {
        const txt = (c.textContent || '').trim();
        // Si la cellule contient seulement "..." ou "?" on la laisse vide à remplir par l'élève
        if (/^(\.{2,}|\?+|_+|-+)$/.test(txt)) return '';
        return txt;
      })
    );

    if (headers.length >= 2) {
      return {
        headers,
        rows: rows.length > 0 ? rows : [headers.map(() => ''), headers.map(() => '')],
      };
    }
  } catch {}
  return null;
}

/**
 * Détecte des étiquettes / mots-clés pertinents selon l'énoncé ou la matière
 */
function getDefaultLabelsForSubject(subject?: string, title?: string, content?: string): {
  targets: string[];
  labels: string[];
} {
  const isEn = /english|anglais|acquisition/i.test(subject || '');
  const text = `${title || ''} ${content || ''}`.toLowerCase();

  if (text.includes('cellule') || text.includes('organite') || text.includes('noyau') || text.includes('membrane')) {
    return {
      targets: ['Repère (1)', 'Repère (2)', 'Repère (3)', 'Repère (4)'],
      labels: ['Membrane plasmique', 'Cytoplasme', 'Noyau cellulaire', 'Mitochondrie', 'Paroi végétale', 'Chloroplaste'],
    };
  }

  if (text.includes('circuit') || text.includes('électrique') || text.includes('pile') || text.includes('lampe')) {
    return {
      targets: ['Composant [A]', 'Composant [B]', 'Composant [C]', 'Composant [D]'],
      labels: ['Générateur (Pile)', 'Interrupteur', 'Lampe témoin', 'Résistance ohmique', 'Ampèremètre', 'Fils de connexion'],
    };
  }

  if (text.includes('triangle') || text.includes('angle') || text.includes('hypoténuse') || text.includes('géométrie')) {
    return {
      targets: ['Élément (1)', 'Élément (2)', 'Élément (3)', 'Élément (4)'],
      labels: ['Hypoténuse [AC]', 'Angle droit (90°)', 'Côté adjacent', 'Côté opposé', 'Sommet principal', 'Médiatrice'],
    };
  }

  if (text.includes('carte') || text.includes('géographie') || text.includes('continent') || text.includes('climat')) {
    return {
      targets: ['Zone [1]', 'Zone [2]', 'Zone [3]', 'Zone [4]'],
      labels: ['Zone intertropicale', 'Zone tempérée', 'Zone polaire', 'Équateur', 'Tropique du Cancer', 'Métropole'],
    };
  }

  if (isEn) {
    return {
      targets: ['Target (1)', 'Target (2)', 'Target (3)', 'Target (4)'],
      labels: ['Introduction / Thesis', 'Supporting Evidence', 'Key Concept', 'Conclusion', 'Cause', 'Consequence'],
    };
  }

  return {
    targets: ['Emplacement (1)', 'Emplacement (2)', 'Emplacement (3)', 'Emplacement (4)'],
    labels: ['Élément A', 'Élément B', 'Élément C', 'Élément D', 'Élément E'],
  };
}

const InteractiveExerciseWidgets: React.FC<InteractiveExerciseWidgetsProps> = ({
  exercise,
  subject = '',
  currentAnswer,
  onUpdateAnswer,
  isTeacherConfigMode = false,
  onUpdateExerciseConfig,
}) => {
  const isEn = /english|anglais|acquisition/i.test(subject);

  // Déterminer quel outil ouvrir par défaut si l'enseignant en a pré-sélectionné un
  const initialTab: ActiveWidgetTab =
    exercise.interactiveType && exercise.interactiveType !== 'none'
      ? exercise.interactiveType
      : 'none';

  const [activeTab, setActiveTab] = useState<ActiveWidgetTab>(initialTab);

  useEffect(() => {
    if (exercise.interactiveType && exercise.interactiveType !== 'none') {
      setActiveTab(exercise.interactiveType);
    }
  }, [exercise.interactiveType]);

  // ═══════════════════════════════════════════════════════════════════════════
  // 1. ÉTAT DU TABLEAU INTERACTIF À REMPLIR PAR L'ÉLÈVE
  // ═══════════════════════════════════════════════════════════════════════════
  const parsedTable = parseHtmlTableFromContent(exercise.content);
  const [tableHeaders, setTableHeaders] = useState<string[]>(
    exercise.interactiveTableConfig?.headers ||
      parsedTable?.headers ||
      (isEn ? ['Parameter / Item', 'Observation / Value', 'Conclusion / Unit'] : ['Grandeur / Élément', 'Valeur / Observation', 'Conclusion / Unité'])
  );
  const [tableRows, setTableRows] = useState<string[][]>(
    exercise.interactiveTableConfig?.rows ||
      parsedTable?.rows || [
        ['', '', ''],
        ['', '', ''],
        ['', '', ''],
      ]
  );
  const [tableSyncedToast, setTableSyncedToast] = useState(false);

  const syncTableToStudentAnswer = (headers: string[], rows: string[][]) => {
    const headerLine = `| ${headers.join(' | ')} |`;
    const sepLine = `| ${headers.map(() => '---').join(' | ')} |`;
    const rowLines = rows.map(r => `| ${headers.map((_, cIdx) => (r[cIdx] || '—').trim()).join(' | ')} |`);
    const formattedBlock = `\n[📊 TABLEAU COMPLÉTÉ]\n${headerLine}\n${sepLine}\n${rowLines.join('\n')}\n[/TABLEAU]`;

    const cleanedPrev = (currentAnswer || '').replace(/\n?\[📊 TABLEAU COMPLÉTÉ\][\s\S]*?\[\/TABLEAU\]/g, '').trim();
    const nextAnswer = cleanedPrev ? `${cleanedPrev}\n\n${formattedBlock.trim()}` : formattedBlock.trim();
    onUpdateAnswer(nextAnswer);
    setTableSyncedToast(true);
    setTimeout(() => setTableSyncedToast(false), 2000);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 2. ÉTAT DES ÉTIQUETTES À DÉPLACER / LÉGENDER (DRAG & DROP + TAP)
  // ═══════════════════════════════════════════════════════════════════════════
  const defaultLabelsSetup = getDefaultLabelsForSubject(subject, exercise.title, exercise.content);
  const [labelTargets, setLabelTargets] = useState<string[]>(
    exercise.interactiveLabelsConfig?.targets || defaultLabelsSetup.targets
  );
  const [availableLabels, setAvailableLabels] = useState<string[]>(
    exercise.interactiveLabelsConfig?.labels || defaultLabelsSetup.labels
  );
  const [placedLabels, setPlacedLabels] = useState<Record<number, string>>({});
  const [selectedLabelForTap, setSelectedLabelForTap] = useState<string | null>(null);
  const [draggedLabel, setDraggedLabel] = useState<string | null>(null);
  const [newCustomLabelInput, setNewCustomLabelInput] = useState('');
  const [labelsSyncedToast, setLabelsSyncedToast] = useState(false);

  const syncLabelsToStudentAnswer = (nextPlaced: Record<number, string>) => {
    const lines = labelTargets.map((targetName, idx) => {
      const val = nextPlaced[idx] || (isEn ? '(Not placed)' : '(Non renseigné)');
      return `• ${targetName} ➔ ${val}`;
    });
    const formattedBlock = `\n[🏷️ ÉTIQUETTES PLACÉES]\n${lines.join('\n')}\n[/ÉTIQUETTES]`;
    const cleanedPrev = (currentAnswer || '').replace(/\n?\[🏷️ ÉTIQUETTES PLACÉES\][\s\S]*?\[\/ÉTIQUETTES\]/g, '').trim();
    const nextAnswer = cleanedPrev ? `${cleanedPrev}\n\n${formattedBlock.trim()}` : formattedBlock.trim();
    onUpdateAnswer(nextAnswer);
    setLabelsSyncedToast(true);
    setTimeout(() => setLabelsSyncedToast(false), 2000);
  };

  const handlePlaceLabelOnTarget = (targetIdx: number, labelText: string) => {
    const next = { ...placedLabels, [targetIdx]: labelText };
    setPlacedLabels(next);
    setSelectedLabelForTap(null);
    setDraggedLabel(null);
    syncLabelsToStudentAnswer(next);
  };

  // ═══════════════════════════════════════════════════════════════════════════
  // 3. ÉTAT DU LABORATOIRE VIRTUEL (MANIPULATION EXPÉRIMENTALE)
  // ═══════════════════════════════════════════════════════════════════════════
  const defaultLab: VirtualLabExperiment =
    exercise.virtualLabType ||
    (/circuit|ohm|électr|electr/i.test(`${exercise.title} ${exercise.content}`)
      ? 'physics_ohm'
      : /cellule|plante|photosynth|svt|biologie/i.test(`${exercise.title} ${exercise.content}`)
      ? 'biology_photosynthesis'
      : /poids|masse|gravit|pendule|force/i.test(`${exercise.title} ${exercise.content}`)
      ? 'mechanics_gravity'
      : 'chemistry_ph');

  const [labExperiment, setLabExperiment] = useState<VirtualLabExperiment>(defaultLab);

  // Expérience 1 : Chimie (Dosage pH Acide/Base)
  const [acidVolumeMl, setAcidVolumeMl] = useState<number>(20);
  const [baseVolumeMl, setBaseVolumeMl] = useState<number>(20);
  const [waterVolumeMl, setWaterVolumeMl] = useState<number>(60);
  const [indicatorType, setIndicatorType] = useState<'bbt' | 'phenolphtaleine' | 'red_cabbage'>('bbt');

  // Calcul réaliste du pH
  const netAcidBase = baseVolumeMl - acidVolumeMl;
  const totalVol = Math.max(10, acidVolumeMl + baseVolumeMl + waterVolumeMl);
  const computedPh = Math.max(
    1,
    Math.min(14, Number((7 + (netAcidBase / totalVol) * 12).toFixed(1)))
  );
  const getSolutionColor = (ph: number) => {
    if (indicatorType === 'bbt') {
      if (ph < 6.0) return { hex: '#facc15', name: isEn ? 'Yellow (Acidic)' : 'Jaune (Milieu Acide)' };
      if (ph <= 7.6) return { hex: '#22c55e', name: isEn ? 'Green (Neutral)' : 'Vert (Milieu Neutre)' };
      return { hex: '#2563eb', name: isEn ? 'Blue (Basic)' : 'Bleu (Milieu Basique)' };
    }
    if (indicatorType === 'phenolphtaleine') {
      if (ph < 8.2) return { hex: '#e2e8f0', name: isEn ? 'Colorless' : 'Incolore (pH < 8,2)' };
      return { hex: '#ec4899', name: isEn ? 'Pink-Fuchsia (Basic)' : 'Rose Fuchsia (Basique)' };
    }
    // Chou rouge
    if (ph < 4) return { hex: '#ef4444', name: 'Rouge vif (Très acide)' };
    if (ph < 6.5) return { hex: '#a855f7', name: 'Violet-Rose (Acide faible)' };
    if (ph <= 7.5) return { hex: '#6366f1', name: 'Bleu-Violet (Neutre)' };
    if (ph < 10) return { hex: '#14b8a6', name: 'Bleu-Vert (Basique)' };
    return { hex: '#eab308', name: 'Jaune-Vert (Très basique)' };
  };
  const chemColor = getSolutionColor(computedPh);

  // Expérience 2 : Physique (Circuit Électrique & Loi d'Ohm U = R * I)
  const [voltageU, setVoltageU] = useState<number>(6); // Volts
  const [resistanceR, setResistanceR] = useState<number>(100); // Ohms
  const [switchClosed, setSwitchClosed] = useState<boolean>(true);
  const currentI_mA = switchClosed ? Number(((voltageU / resistanceR) * 1000).toFixed(1)) : 0;
  const powerP_mW = switchClosed ? Number((voltageU * currentI_mA).toFixed(1)) : 0;

  // Expérience 3 : SVT (Photosynthèse & Dégagement d'O2)
  const [lightIntensity, setLightIntensity] = useState<number>(70); // %
  const [co2Concentration, setCo2Concentration] = useState<number>(60); // %
  const [waterTempC, setWaterTempC] = useState<number>(25); // °C
  const tempFactor = Math.max(0, 1 - Math.abs(waterTempC - 26) / 25);
  const o2BubblesPerMin = Math.round((lightIntensity / 100) * (co2Concentration / 100) * tempFactor * 48);

  // Expérience 4 : Mécanique (Masse, Poids & Gravité P = m * g)
  const [planet, setPlanet] = useState<'earth' | 'moon' | 'mars' | 'jupiter'>('earth');
  const [massKg, setMassKg] = useState<number>(2.5);
  const planetGravityMap: Record<'earth' | 'moon' | 'mars' | 'jupiter', { name: string; g: number; color: string }> = {
    earth: { name: isEn ? 'Earth' : 'Terre', g: 9.81, color: '#3b82f6' },
    moon: { name: isEn ? 'Moon' : 'Lune', g: 1.62, color: '#94a3b8' },
    mars: { name: 'Mars', g: 3.71, color: '#ef4444' },
    jupiter: { name: 'Jupiter', g: 24.79, color: '#f59e0b' },
  };
  const activePlanet = planetGravityMap[planet];
  const weightNewton = Number((massKg * activePlanet.g).toFixed(2));

  // Journal des mesures de laboratoire enregistrées par l'élève
  const [labLogs, setLabLogs] = useState<string[]>([]);
  const [labSyncedToast, setLabSyncedToast] = useState(false);

  const handleRecordLabMeasurement = () => {
    let entry = '';
    if (labExperiment === 'chemistry_ph') {
      entry = `Essai Chimie : V(Acide)=${acidVolumeMl} mL, V(Base)=${baseVolumeMl} mL, V(Eau)=${waterVolumeMl} mL ➔ pH mesuré = ${computedPh} (${chemColor.name})`;
    } else if (labExperiment === 'physics_ohm') {
      entry = `Essai Loi d'Ohm : U = ${voltageU} V, R = ${resistanceR} Ω (${switchClosed ? 'Circuit fermé' : 'Circuit ouvert'}) ➔ I = ${currentI_mA} mA (P = ${powerP_mW} mW)`;
    } else if (labExperiment === 'biology_photosynthesis') {
      entry = `Essai Photosynthèse : Lumière = ${lightIntensity}%, CO₂ = ${co2Concentration}%, Température = ${waterTempC}°C ➔ Dégagement = ${o2BubblesPerMin} bulles O₂/min`;
    } else {
      entry = `Essai Gravité (${activePlanet.name}, g=${activePlanet.g} N/kg) : Masse m = ${massKg} kg ➔ Poids mesuré P = ${weightNewton} N`;
    }
    const nextLogs = [...labLogs, entry];
    setLabLogs(nextLogs);

    const formattedBlock = `\n[🧪 PROTOCOLE & MESURES DE LABORATOIRE VIRTUEL]\n${nextLogs.map((l, i) => `${i + 1}. ${l}`).join('\n')}\n[/LABORATOIRE]`;
    const cleanedPrev = (currentAnswer || '').replace(/\n?\[🧪 PROTOCOLE & MESURES DE LABORATOIRE VIRTUEL\][\s\S]*?\[\/LABORATOIRE\]/g, '').trim();
    const nextAnswer = cleanedPrev ? `${cleanedPrev}\n\n${formattedBlock.trim()}` : formattedBlock.trim();
    onUpdateAnswer(nextAnswer);
    setLabSyncedToast(true);
    setTimeout(() => setLabSyncedToast(false), 2000);
  };

  return (
    <div className="my-3 rounded-2xl border-2 border-indigo-200/90 bg-gradient-to-r from-indigo-50/60 via-purple-50/40 to-teal-50/50 p-3.5 space-y-3 shadow-2xs">
      {/* Barre d'activation des 3 outils interactifs Élève */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-black uppercase tracking-wide flex items-center gap-1.5 shadow-2xs">
            <Sparkles size={12} className="text-yellow-300" />
            <span>{isEn ? 'Interactive Student Tools' : 'Outils Interactifs Élève'}</span>
          </span>
          <span className="text-[11px] text-slate-600 font-semibold hidden sm:inline">
            {isEn
              ? 'Fill a table, drag labels, or run a virtual lab experiment:'
              : 'Remplir un tableau, déplacer des étiquettes ou manipuler au laboratoire virtuel :'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              const next = activeTab === 'table' ? 'none' : 'table';
              setActiveTab(next);
              if (isTeacherConfigMode && onUpdateExerciseConfig) {
                onUpdateExerciseConfig({ interactiveType: next });
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 border ${
              activeTab === 'table'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                : 'bg-white text-indigo-900 border-indigo-200 hover:bg-indigo-50'
            }`}
          >
            <Table size={13} />
            <span>{isEn ? '📊 Fillable Table' : '📊 Remplir un Tableau'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = activeTab === 'labels' ? 'none' : 'labels';
              setActiveTab(next);
              if (isTeacherConfigMode && onUpdateExerciseConfig) {
                onUpdateExerciseConfig({ interactiveType: next });
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 border ${
              activeTab === 'labels'
                ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
                : 'bg-white text-purple-900 border-purple-200 hover:bg-purple-50'
            }`}
          >
            <Tag size={13} />
            <span>{isEn ? '🏷️ Move Labels' : '🏷️ Déplacer des Étiquettes'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const next = activeTab === 'virtual_lab' ? 'none' : 'virtual_lab';
              setActiveTab(next);
              if (isTeacherConfigMode && onUpdateExerciseConfig) {
                onUpdateExerciseConfig({ interactiveType: next, virtualLabType: labExperiment });
              }
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-black transition flex items-center gap-1.5 border ${
              activeTab === 'virtual_lab'
                ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                : 'bg-white text-teal-900 border-teal-200 hover:bg-teal-50'
            }`}
          >
            <FlaskConical size={13} />
            <span>{isEn ? '🧪 Virtual Lab' : '🧪 Laboratoire Virtuel'}</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════════
          OUTIL 1 : TABLEAU INTERACTIF À REMPLIR PAR L'ÉLÈVE
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'table' && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 p-4 space-y-3 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 className="text-xs font-black text-indigo-950 uppercase tracking-wide flex items-center gap-1.5">
                <Table size={14} className="text-indigo-600" />
                <span>{isEn ? 'Interactive Table to Complete' : 'Tableau interactif à compléter par l\'élève'}</span>
              </h5>
              <p className="text-[11px] text-slate-500">
                {isEn
                  ? 'Type directly inside the cells below. Click "Insert Table into Answer" to save your table.'
                  : 'Saisissez vos valeurs ou réponses dans les cases ci-dessous puis cliquez sur « Insérer dans ma réponse ».'}
              </p>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  const nextRows = [...tableRows, tableHeaders.map(() => '')];
                  setTableRows(nextRows);
                }}
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <Plus size={12} />
                <span>{isEn ? '+ Row' : '+ Ligne'}</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const nextHeaders = [...tableHeaders, isEn ? `Col ${tableHeaders.length + 1}` : `Colonne ${tableHeaders.length + 1}`];
                  const nextRows = tableRows.map(r => [...r, '']);
                  setTableHeaders(nextHeaders);
                  setTableRows(nextRows);
                }}
                className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border border-indigo-200 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <Plus size={12} />
                <span>{isEn ? '+ Column' : '+ Colonne'}</span>
              </button>
              <button
                type="button"
                onClick={() => syncTableToStudentAnswer(tableHeaders, tableRows)}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs transition"
              >
                {tableSyncedToast ? <Check size={13} /> : <ArrowRight size={13} />}
                <span>
                  {tableSyncedToast
                    ? isEn ? 'Inserted into answer!' : 'Tableau inséré dans la réponse !'
                    : isEn ? 'Insert Table into Answer' : 'Insérer le tableau dans ma réponse'}
                </span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-indigo-200">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-indigo-100/80 text-indigo-950">
                  {tableHeaders.map((h, cIdx) => (
                    <th key={cIdx} className="border border-indigo-200 p-2 min-w-[130px]">
                      <div className="flex items-center gap-1">
                        <input
                          type="text"
                          value={h}
                          onChange={e => {
                            const next = [...tableHeaders];
                            next[cIdx] = e.target.value;
                            setTableHeaders(next);
                          }}
                          className="w-full bg-white/90 px-2 py-1 rounded border border-indigo-300 font-black text-indigo-950 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                        {tableHeaders.length > 2 && (
                          <button
                            type="button"
                            onClick={() => {
                              setTableHeaders(tableHeaders.filter((_, i) => i !== cIdx));
                              setTableRows(tableRows.map(r => r.filter((_, i) => i !== cIdx)));
                            }}
                            className="text-slate-400 hover:text-rose-600 p-0.5"
                            title="Supprimer cette colonne"
                          >
                            ✕
                          </button>
                        )}
                      </div>
                    </th>
                  ))}
                  <th className="border border-indigo-200 p-2 w-10 text-center"></th>
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row, rIdx) => (
                  <tr key={rIdx} className="even:bg-slate-50/70">
                    {tableHeaders.map((_, cIdx) => (
                      <td key={cIdx} className="border border-slate-200 p-1.5">
                        <input
                          type="text"
                          value={row[cIdx] || ''}
                          onChange={e => {
                            const next = tableRows.map((r, i) => {
                              if (i !== rIdx) return r;
                              const copy = [...r];
                              copy[cIdx] = e.target.value;
                              return copy;
                            });
                            setTableRows(next);
                          }}
                          onBlur={() => syncTableToStudentAnswer(tableHeaders, tableRows)}
                          placeholder={isEn ? 'Complete...' : 'Compléter...'}
                          className="w-full p-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-900 focus:border-indigo-600 focus:ring-2 focus:ring-indigo-200 outline-none"
                        />
                      </td>
                    ))}
                    <td className="border border-slate-200 p-1 text-center">
                      {tableRows.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setTableRows(tableRows.filter((_, i) => i !== rIdx))}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="Supprimer cette ligne"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          OUTIL 2 : ÉTIQUETTES À DÉPLACER / LÉGENDER (DRAG & DROP OU CLIC)
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'labels' && (
        <div className="bg-white rounded-2xl border-2 border-purple-200 p-4 space-y-3.5 shadow-xs animate-fadeIn">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <h5 className="text-xs font-black text-purple-950 uppercase tracking-wide flex items-center gap-1.5">
                <Tag size={14} className="text-purple-600" />
                <span>
                  {isEn
                    ? 'Interactive Movable Labels (Drag & Drop or Click to Place)'
                    : 'Étiquettes mobiles à déplacer sur les repères (Glisser-déposer ou Cliquer)'}
                </span>
              </h5>
              <p className="text-[11px] text-slate-500">
                {isEn
                  ? 'Drag a label onto a target box below (or tap a label then tap a target box).'
                  : 'Glissez une étiquette vers la zone correspondante (ou cliquez sur une étiquette puis sur sa zone cible).'}
              </p>
            </div>

            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => {
                  setPlacedLabels({});
                  setSelectedLabelForTap(null);
                }}
                className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold flex items-center gap-1"
              >
                <RotateCcw size={12} />
                <span>{isEn ? 'Reset' : 'Réinitialiser'}</span>
              </button>
              <button
                type="button"
                onClick={() => syncLabelsToStudentAnswer(placedLabels)}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-xs"
              >
                {labelsSyncedToast ? <Check size={13} /> : <ArrowRight size={13} />}
                <span>
                  {labelsSyncedToast
                    ? isEn ? 'Labels saved!' : 'Étiquettes insérées !'
                    : isEn ? 'Save Labels to Answer' : 'Valider dans ma réponse'}
                </span>
              </button>
            </div>
          </div>

          {/* Réserve d'étiquettes déplaçables */}
          <div className="bg-purple-50/70 border border-purple-200 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="text-[11px] font-black text-purple-900 uppercase">
                🏷️ {isEn ? 'Available Labels:' : 'Étiquettes disponibles (cliquez ou glissez) :'}
              </span>
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  value={newCustomLabelInput}
                  onChange={e => setNewCustomLabelInput(e.target.value)}
                  placeholder={isEn ? 'Add custom label...' : 'Nouvelle étiquette...'}
                  className="px-2.5 py-1 bg-white border border-purple-300 rounded-lg text-xs focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => {
                    const clean = newCustomLabelInput.trim();
                    if (!clean) return;
                    setAvailableLabels(prev => [...prev, clean]);
                    setNewCustomLabelInput('');
                  }}
                  className="px-2.5 py-1 bg-purple-600 text-white rounded-lg text-xs font-bold"
                >
                  +
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {availableLabels.map((lbl, idx) => {
                const isSelected = selectedLabelForTap === lbl;
                const isAlreadyPlaced = Object.values(placedLabels).includes(lbl);
                return (
                  <div
                    key={`${lbl}_${idx}`}
                    draggable
                    onDragStart={() => setDraggedLabel(lbl)}
                    onClick={() => setSelectedLabelForTap(isSelected ? null : lbl)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black cursor-grab active:cursor-grabbing select-none transition flex items-center gap-1.5 border-2 ${
                      isSelected
                        ? 'bg-purple-700 text-white border-purple-900 shadow-md scale-105'
                        : isAlreadyPlaced
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                        : 'bg-white text-purple-950 border-purple-300 hover:border-purple-500 shadow-2xs'
                    }`}
                  >
                    <span>🏷️ {lbl}</span>
                    {isAlreadyPlaced && <Check size={12} className="text-emerald-600" />}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Zones cibles où déposer les étiquettes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {labelTargets.map((targetName, tIdx) => {
              const placed = placedLabels[tIdx];
              return (
                <div
                  key={tIdx}
                  onDragOver={e => e.preventDefault()}
                  onDrop={() => {
                    if (draggedLabel) {
                      handlePlaceLabelOnTarget(tIdx, draggedLabel);
                    }
                  }}
                  onClick={() => {
                    if (selectedLabelForTap) {
                      handlePlaceLabelOnTarget(tIdx, selectedLabelForTap);
                    }
                  }}
                  className={`p-3 rounded-xl border-2 border-dashed transition flex items-center justify-between gap-2 cursor-pointer ${
                    placed
                      ? 'bg-emerald-50/70 border-emerald-400'
                      : selectedLabelForTap
                      ? 'bg-purple-50 border-purple-500 animate-pulse'
                      : 'bg-slate-50 border-slate-300 hover:border-purple-400'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 bg-slate-800 text-white rounded-md text-[11px] font-black flex-shrink-0">
                      {tIdx + 1}
                    </span>
                    <input
                      type="text"
                      value={targetName}
                      onClick={e => e.stopPropagation()}
                      onChange={e => {
                        const next = [...labelTargets];
                        next[tIdx] = e.target.value;
                        setLabelTargets(next);
                      }}
                      className="text-xs font-bold text-slate-800 bg-transparent border-b border-transparent focus:border-purple-400 focus:bg-white px-1 rounded outline-none w-32 sm:w-36"
                    />
                  </div>

                  {placed ? (
                    <div className="flex items-center gap-1.5 bg-white px-2.5 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                      <span className="text-xs font-black text-emerald-900">🏷️ {placed}</span>
                      <button
                        type="button"
                        onClick={e => {
                          e.stopPropagation();
                          const next = { ...placedLabels };
                          delete next[tIdx];
                          setPlacedLabels(next);
                          syncLabelsToStudentAnswer(next);
                        }}
                        className="text-slate-400 hover:text-rose-600 text-xs font-bold ml-1"
                      >
                        ✕
                      </button>
                    </div>
                  ) : (
                    <span className="text-[11px] font-semibold text-slate-400 italic">
                      {selectedLabelForTap
                        ? isEn ? 'Tap here to place' : 'Cliquer ici pour déposer'
                        : isEn ? 'Drop label here' : 'Déposer une étiquette ici'}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-between pt-1">
            <button
              type="button"
              onClick={() => setLabelTargets([...labelTargets, `Repère (${labelTargets.length + 1})`])}
              className="text-[11px] font-bold text-purple-700 hover:text-purple-900"
            >
              + {isEn ? 'Add Target Zone' : 'Ajouter un repère à légender'}
            </button>
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════════
          OUTIL 3 : LABORATOIRE VIRTUEL & MANIPULATION EXPÉRIMENTALE
          ═══════════════════════════════════════════════════════════════════════ */}
      {activeTab === 'virtual_lab' && (
        <div className="bg-white rounded-2xl border-2 border-teal-300 p-4 space-y-4 shadow-xs animate-fadeIn">
          {/* En-tête du labo et choix de l'expérience */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
            <div>
              <h5 className="text-xs font-black text-teal-950 uppercase tracking-wide flex items-center gap-1.5">
                <FlaskConical size={15} className="text-teal-600" />
                <span>
                  {isEn
                    ? 'Interactive Virtual Laboratory — Student Experimentation'
                    : 'Paillasse de Laboratoire Virtuel — Manipulation Expérimentale Élève'}
                </span>
              </h5>
              <p className="text-[11px] text-slate-500">
                {isEn
                  ? 'Adjust the experimental parameters, observe the live phenomenon, and record your measurements.'
                  : 'Manipulez les curseurs, observez la réaction en direct et cliquez sur « Relever cette mesure » pour l\'insérer dans votre réponse.'}
              </p>
            </div>

            <select
              value={labExperiment}
              onChange={e => {
                const val = e.target.value as VirtualLabExperiment;
                setLabExperiment(val);
                if (isTeacherConfigMode && onUpdateExerciseConfig) {
                  onUpdateExerciseConfig({ virtualLabType: val });
                }
              }}
              className="px-3 py-1.5 bg-teal-50 border border-teal-300 rounded-xl text-xs font-black text-teal-950 focus:outline-none"
            >
              <option value="chemistry_ph">🧪 Chimie : Dosage pH, Acides & Bases</option>
              <option value="physics_ohm">⚡ Physique : Circuit Électrique & Loi d'Ohm (U = R × I)</option>
              <option value="biology_photosynthesis">🌿 SVT / Biologie : Photosynthèse & Production d'O₂</option>
              <option value="mechanics_gravity">🪐 Mécanique : Masse, Poids & Gravité (P = m × g)</option>
            </select>
          </div>

          {/* ── EXPÉRIENCE 1 : CHIMIE (DOSAGE pH & INDICATEUR COLORÉ) ── */}
          {labExperiment === 'chemistry_ph' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="flex justify-between text-xs font-bold text-rose-700 mb-1">
                    <span>🧪 Volume d'Acide (HCl) ajouté :</span>
                    <span>{acidVolumeMl} mL</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={acidVolumeMl}
                    onChange={e => setAcidVolumeMl(Number(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-blue-700 mb-1">
                    <span>🧴 Volume de Base (NaOH) ajouté :</span>
                    <span>{baseVolumeMl} mL</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={baseVolumeMl}
                    onChange={e => setBaseVolumeMl(Number(e.target.value))}
                    className="w-full accent-blue-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-sky-700 mb-1">
                    <span>💧 Dilution (Eau distillée) :</span>
                    <span>{waterVolumeMl} mL</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={150}
                    step={10}
                    value={waterVolumeMl}
                    onChange={e => setWaterVolumeMl(Number(e.target.value))}
                    className="w-full accent-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    🎨 Indicateur coloré versé dans le bécher :
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: 'bbt', label: 'BBT' },
                      { id: 'phenolphtaleine', label: 'Phénolphtaléine' },
                      { id: 'red_cabbage', label: 'Chou rouge' },
                    ].map(ind => (
                      <button
                        key={ind.id}
                        type="button"
                        onClick={() => setIndicatorType(ind.id as any)}
                        className={`py-1.5 px-2 rounded-lg text-[11px] font-bold border ${
                          indicatorType === ind.id
                            ? 'bg-teal-600 text-white border-teal-600'
                            : 'bg-white text-slate-700 border-slate-300'
                        }`}
                      >
                        {ind.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Visualisation du Bécher et du pH-mètre en direct */}
              <div className="flex flex-col items-center justify-center bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between w-full px-2">
                  <span className="text-xs font-bold text-teal-300">🔬 pH-mètre numérique :</span>
                  <span className="px-3 py-1 rounded-xl bg-black/50 border border-teal-400 font-mono text-lg font-black text-teal-300">
                    pH = {computedPh}
                  </span>
                </div>

                <svg viewBox="0 0 260 170" className="w-56 h-36">
                  {/* Bécher gradué */}
                  <rect x="65" y="20" width="130" height="130" rx="8" fill="none" stroke="#94a3b8" strokeWidth="4" />
                  {/* Liquide coloré selon pH */}
                  <rect
                    x="69"
                    y={Math.max(35, 146 - Math.min(110, (totalVol / 250) * 110))}
                    width="122"
                    height={Math.min(110, (totalVol / 250) * 110)}
                    rx="4"
                    fill={chemColor.hex}
                    fillOpacity="0.85"
                  />
                  {/* Graduations */}
                  <line x1="65" y1="50" x2="80" y2="50" stroke="#cbd5e1" strokeWidth="2" />
                  <line x1="65" y1="80" x2="85" y2="80" stroke="#cbd5e1" strokeWidth="2" />
                  <line x1="65" y1="110" x2="80" y2="110" stroke="#cbd5e1" strokeWidth="2" />
                  {/* Sonde pH */}
                  <rect x="155" y="5" width="8" height="125" fill="#475569" rx="3" />
                  <circle cx="159" cy="132" r="5" fill="#38bdf8" />
                </svg>

                <div className="text-center text-xs">
                  <span className="font-bold text-slate-300">Teinte observée : </span>
                  <span className="font-black text-white">{chemColor.name}</span>
                  <span className="block text-[11px] text-slate-400">Volume total : {totalVol} mL</span>
                </div>
              </div>
            </div>
          )}

          {/* ── EXPÉRIENCE 2 : PHYSIQUE (CIRCUIT ÉLECTRIQUE & LOI D'OHM) ── */}
          {labExperiment === 'physics_ohm' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="flex justify-between text-xs font-bold text-amber-800 mb-1">
                    <span>🔋 Tension du générateur (U) :</span>
                    <span>{voltageU} V</span>
                  </div>
                  <input
                    type="range"
                    min={1}
                    max={24}
                    step={0.5}
                    value={voltageU}
                    onChange={e => setVoltageU(Number(e.target.value))}
                    className="w-full accent-amber-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-indigo-800 mb-1">
                    <span>🎛️ Résistance du conducteur ohmique (R) :</span>
                    <span>{resistanceR} Ω</span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={500}
                    step={10}
                    value={resistanceR}
                    onChange={e => setResistanceR(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>

                <div className="flex items-center justify-between pt-2">
                  <span className="text-xs font-bold text-slate-700">Interrupteur du circuit :</span>
                  <button
                    type="button"
                    onClick={() => setSwitchClosed(!switchClosed)}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition ${
                      switchClosed ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'
                    }`}
                  >
                    {switchClosed ? '⚡ Circuit Fermé (Courant passe)' : '⭕ Circuit Ouvert (I = 0)'}
                  </button>
                </div>
              </div>

              <div className="flex flex-col items-center justify-center bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                <div className="grid grid-cols-2 gap-2 w-full text-center">
                  <div className="bg-black/40 border border-amber-400/60 rounded-xl p-2">
                    <span className="text-[10px] text-amber-200 block uppercase font-bold">Ampèremètre (I)</span>
                    <span className="font-mono text-base font-black text-amber-300">{currentI_mA} mA</span>
                  </div>
                  <div className="bg-black/40 border border-emerald-400/60 rounded-xl p-2">
                    <span className="text-[10px] text-emerald-200 block uppercase font-bold">Puissance (P = U×I)</span>
                    <span className="font-mono text-base font-black text-emerald-300">{powerP_mW} mW</span>
                  </div>
                </div>

                <svg viewBox="0 0 280 140" className="w-60 h-32">
                  <rect x="30" y="25" width="220" height="90" fill="none" stroke={switchClosed ? '#facc15' : '#64748b'} strokeWidth="3" rx="8" />
                  {/* Pile */}
                  <rect x="115" y="15" width="50" height="20" fill="#0f172a" />
                  <line x1="132" y1="12" x2="132" y2="38" stroke="#ef4444" strokeWidth="3" />
                  <line x1="148" y1="18" x2="148" y2="32" stroke="#cbd5e1" strokeWidth="4" />
                  <text x="140" y="52" fontSize="11" fill="#fde047" textAnchor="middle" fontWeight="bold">U = {voltageU}V</text>
                  {/* Résistance */}
                  <rect x="55" y="103" width="60" height="24" fill="#312e81" stroke="#818cf8" strokeWidth="2" rx="4" />
                  <text x="85" y="119" fontSize="10" fill="#e0e7ff" textAnchor="middle" fontWeight="bold">R={resistanceR}Ω</text>
                  {/* Lampe avec éclat proportionnel au courant */}
                  <circle
                    cx="195"
                    cy="115"
                    r="16"
                    fill={switchClosed ? '#fef08a' : '#334155'}
                    stroke="#eab308"
                    strokeWidth="2"
                  />
                  <text x="195" y="119" fontSize="11" fill="#0f172a" textAnchor="middle" fontWeight="bold">L</text>
                </svg>
              </div>
            </div>
          )}

          {/* ── EXPÉRIENCE 3 : SVT (PHOTOSYNTHÈSE & PRODUCTION D'O2) ── */}
          {labExperiment === 'biology_photosynthesis' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <div className="flex justify-between text-xs font-bold text-amber-700 mb-1">
                    <span>☀️ Intensité lumineuse :</span>
                    <span>{lightIntensity} %</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={lightIntensity}
                    onChange={e => setLightIntensity(Number(e.target.value))}
                    className="w-full accent-amber-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-emerald-800 mb-1">
                    <span>🫧 Concentration en CO₂ dissous :</span>
                    <span>{co2Concentration} %</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    step={5}
                    value={co2Concentration}
                    onChange={e => setCo2Concentration(Number(e.target.value))}
                    className="w-full accent-emerald-600"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-rose-700 mb-1">
                    <span>🌡️ Température de l'eau :</span>
                    <span>{waterTempC} °C</span>
                  </div>
                  <input
                    type="range"
                    min={5}
                    max={45}
                    step={1}
                    value={waterTempC}
                    onChange={e => setWaterTempC(Number(e.target.value))}
                    className="w-full accent-rose-600"
                  />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center bg-slate-900 text-white rounded-2xl p-4 space-y-3">
                <div className="flex items-center justify-between w-full px-2">
                  <span className="text-xs font-bold text-emerald-300">🌿 Dégagement gazeux d'O₂ :</span>
                  <span className="px-3 py-1 rounded-xl bg-black/50 border border-emerald-400 font-mono text-base font-black text-emerald-300">
                    {o2BubblesPerMin} bulles / min
                  </span>
                </div>

                <svg viewBox="0 0 260 150" className="w-56 h-32">
                  {/* Soleil / Lampe */}
                  <circle cx="45" cy="40" r="18" fill="#facc15" fillOpacity={Math.max(0.15, lightIntensity / 100)} />
                  {/* Tube avec plante aquatique Élodée */}
                  <rect x="110" y="15" width="70" height="120" rx="8" fill="#0ea5e9" fillOpacity="0.25" stroke="#38bdf8" strokeWidth="2.5" />
                  {/* Tige et feuilles */}
                  <line x1="145" y1="125" x2="145" y2="55" stroke="#22c55e" strokeWidth="4" />
                  <ellipse cx="133" cy="95" rx="12" ry="5" fill="#16a34a" />
                  <ellipse cx="157" cy="80" rx="12" ry="5" fill="#16a34a" />
                  <ellipse cx="133" cy="65" rx="11" ry="5" fill="#16a34a" />
                  {/* Bulles d'O2 */}
                  {o2BubblesPerMin > 5 && <circle cx="145" cy="45" r="3.5" fill="#e0f2fe" />}
                  {o2BubblesPerMin > 15 && <circle cx="153" cy="35" r="4" fill="#e0f2fe" />}
                  {o2BubblesPerMin > 28 && <circle cx="138" cy="26" r="3.5" fill="#e0f2fe" />}
                </svg>
              </div>
            </div>
          )}

          {/* ── EXPÉRIENCE 4 : MÉCANIQUE (MASSE, POIDS & GRAVITÉ P = m × g) ── */}
          {labExperiment === 'mechanics_gravity' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
              <div className="space-y-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    🪐 Choisir l'astre d'expérimentation (intensité de pesanteur g) :
                  </label>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(Object.keys(planetGravityMap) as Array<'earth' | 'moon' | 'mars' | 'jupiter'>).map(pKey => {
                      const pInfo = planetGravityMap[pKey];
                      return (
                        <button
                          key={pKey}
                          type="button"
                          onClick={() => setPlanet(pKey)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border ${
                            planet === pKey
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-white text-slate-700 border-slate-300'
                          }`}
                        >
                          {pInfo.name} ({pInfo.g})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-xs font-bold text-indigo-900 mb-1">
                    <span>⚖️ Masse de l'objet suspendu (m) :</span>
                    <span>{massKg} kg</span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={10}
                    step={0.5}
                    value={massKg}
                    onChange={e => setMassKg(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              </div>

              <div className="flex flex-col items-center justify-center bg-slate-900 text-white rounded-2xl p-4 space-y-2">
                <div className="flex items-center justify-between w-full px-2">
                  <span className="text-xs font-bold text-amber-300">
                    Dynamomètre ({activePlanet.name}, g = {activePlanet.g} N/kg) :
                  </span>
                  <span className="px-3 py-1 rounded-xl bg-black/50 border border-amber-400 font-mono text-base font-black text-amber-300">
                    P = {weightNewton} N
                  </span>
                </div>
                <div className="text-xs text-slate-300 pt-1">
                  Formule vérifiée : <strong>P = m × g = {massKg} × {activePlanet.g} = {weightNewton} N</strong>
                </div>
              </div>
            </div>
          )}

          {/* Bouton d'enregistrement de la mesure dans la copie de l'élève */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
            <div className="text-[11px] text-slate-600 font-semibold">
              {labLogs.length > 0
                ? `${labLogs.length} mesure(s) expérimentale(s) enregistrée(s) dans votre réponse.`
                : isEn
                ? 'Click the button to record your experimental observation into your answer.'
                : 'Cliquez sur le bouton à droite pour enregistrer vos mesures dans votre réponse.'}
            </div>

            <div className="flex items-center gap-2">
              {labLogs.length > 0 && (
                <button
                  type="button"
                  onClick={() => setLabLogs([])}
                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold"
                >
                  {isEn ? 'Clear Log' : 'Effacer relevés'}
                </button>
              )}
              <button
                type="button"
                onClick={handleRecordLabMeasurement}
                className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-black flex items-center gap-1.5 shadow-sm transition"
              >
                {labSyncedToast ? <Check size={14} /> : <FlaskConical size={14} />}
                <span>
                  {labSyncedToast
                    ? isEn ? 'Recorded into Answer!' : 'Mesure insérée dans la réponse !'
                    : isEn ? '+ Record Measurement into Answer' : '+ Relever cette mesure dans ma réponse'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InteractiveExerciseWidgets;
