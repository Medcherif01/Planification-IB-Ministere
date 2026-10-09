import React, { useState, useEffect, useMemo } from 'react';
import {
  X, Printer, Save, RefreshCw, Plus, Trash2, Edit3, Check,
  Calendar, BookOpen, User, Paperclip, Clock, ArrowRight,
  Sparkles, CheckCircle2, ChevronLeft, ChevronRight, Download, FileText
} from 'lucide-react';
import { WeeklyPlan, WeeklyPlanDay, WeeklyPlanItem, SchoolSection } from '../types';
import {
  loadWeeklyPlan, saveWeeklyPlan, createDefaultWeeklyPlan,
  getTeachersForSection, getDefaultTeacher, sanitizeWeeklyPlanBySection
} from '../services/weeklyPlanService';
import { isArabicText } from '../constants';
import { PEI_GRADES } from '../constants';

interface WeeklyPlanModalProps {
  initialSection?: SchoolSection;
  initialGrade?: string;
  onClose: () => void;
}

const DAYS_META: { fr: string; ar: string }[] = [
  { fr: 'Dimanche', ar: 'الأحد' },
  { fr: 'Lundi', ar: 'الإثنين' },
  { fr: 'Mardi', ar: 'الثلاثاء' },
  { fr: 'Mercredi', ar: 'الأربعاء' },
  { fr: 'Jeudi', ar: 'الخميس' },
];

const PERIOD_OPTIONS = ['P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7', 'P8'];

const SUBJECT_OPTIONS = [
  'الدراسات الإسلامية',
  'Maths',
  'Mathématiques',
  'Design',
  'EPS',
  'L.L',
  'Langue et littérature',
  'اللغة العربية',
  'Anglais',
  'Acquisition de langues',
  'Sciences',
  'Individus et sociétés',
  'Arts',
];

export const WeeklyPlanModal: React.FC<WeeklyPlanModalProps> = ({
  initialSection = 'Garçons',
  initialGrade = 'PEI 1',
  onClose,
}) => {
  const [section, setSection] = useState<SchoolSection>(initialSection);
  const [grade, setGrade] = useState<string>(initialGrade.replace(/Garçons|Filles/g, '').trim() || 'PEI 1');
  const [weekNumber, setWeekNumber] = useState<number>(7);
  const [semester, setSemester] = useState<number>(1);
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [isEditing, setIsEditing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);
  const [savedSuccess, setSavedSuccess] = useState<boolean>(false);
  const [activeDayIndex, setActiveDayIndex] = useState<number>(-1); // -1 = Tous les jours

  // Charger et assainir strictement le plan quand section, grade, semaine ou semestre change
  useEffect(() => {
    let isMounted = true;
    const fetchPlan = async () => {
      const data = await loadWeeklyPlan(section, grade, weekNumber, semester);
      if (isMounted) {
        // Garantir qu'aucun enseignant de l'autre section n'est présent
        const sanitized = sanitizeWeeklyPlanBySection(data, section);
        setPlan(sanitized);
      }
    };
    fetchPlan();
    return () => { isMounted = false; };
  }, [section, grade, weekNumber, semester]);

  // Liste des enseignants disponibles STRICTEMENT pour la section active
  const availableTeachers = useMemo(() => {
    return getTeachersForSection(section);
  }, [section]);

  const handleSave = async () => {
    if (!plan) return;
    setSaving(true);
    // Assainissement strict avant sauvegarde
    const sanitized = sanitizeWeeklyPlanBySection(plan, section);
    await saveWeeklyPlan(sanitized);
    setPlan(sanitized);
    setSaving(false);
    setSavedSuccess(true);
    setIsEditing(false);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const handleResetToDefault = () => {
    if (!window.confirm(`Réinitialiser ce plan au modèle officiel Al Kawthar pour la Section ${section} ? Les modifications actuelles seront remplacées.`)) return;
    const defaultPlan = createDefaultWeeklyPlan(section, grade, weekNumber, semester);
    setPlan(defaultPlan);
    saveWeeklyPlan(defaultPlan);
  };

  const handlePrint = () => {
    window.print();
  };

  // Téléchargement HTML / PDF avec rendu RTL et centrage parfaits
  const handleDownloadHtml = () => {
    if (!plan) return;
    const cleanGrade = grade.replace(/Garçons|Filles/g, '').trim();
    const docTitle = `Plan_Hebdomadaire_${section}_${cleanGrade.replace(/\s+/g, '_')}_Semaine_${weekNumber}`;
    
    const rowsHtml = plan.days.map(d => {
      const itemsHtml = d.items.map(it => {
        const isSubjAr = isArabicText(it.subject);
        const isCwAr = isArabicText(it.classworkDescription) || isArabicText(it.classworkTitle);
        const isHwAr = isArabicText(it.homework);

        return `
          <tr>
            <td class="cell-subject ${isSubjAr ? 'arabic-cell' : ''}">
              <div class="subj-badge ${isSubjAr ? 'arabic-cell' : ''}">${it.subject}</div>
              <div class="period-badge">🎓 ${it.period}</div>
              <div class="teacher-label">👨‍🏫 ${it.teacherName}</div>
            </td>
            <td class="cell-classwork ${isCwAr ? 'arabic-cell' : ''}" dir="${isCwAr ? 'rtl' : 'ltr'}">
              ${it.classworkTitle ? `<div class="cw-title ${isCwAr ? 'arabic-cell' : ''}">🎓 ${it.classworkTitle}</div>` : ''}
              <div class="cw-desc ${isCwAr ? 'arabic-cell' : ''}">${it.classworkDescription || ''}</div>
              ${it.support ? `<div class="cw-support ${isArabicText(it.support) ? 'arabic-cell' : ''}">📎 Support : ${it.support}</div>` : ''}
            </td>
            <td class="cell-homework ${isHwAr ? 'arabic-cell' : ''}" dir="${isHwAr ? 'rtl' : 'ltr'}">
              ${it.hasHomework && it.homework ? `
                <div class="hw-box ${isHwAr ? 'arabic-cell' : ''}">
                  <div class="hw-tag">${isHwAr ? 'الواجب المنزلي (À FAIRE) :' : 'À FAIRE :'}</div>
                  <div class="hw-text ${isHwAr ? 'arabic-cell' : ''}">${it.homework}</div>
                </div>
              ` : '<div class="hw-none">Aucun</div>'}
            </td>
          </tr>
        `;
      }).join('');

      return `
        <div class="day-section">
          <div class="day-header">
            <span>📅 ${d.dateFormattedFr}</span>
            <span class="day-ar">${d.dayNameAr}</span>
          </div>
          <table class="plan-table">
            <thead>
              <tr>
                <th style="width: 22%;">MATIÈRES</th>
                <th style="width: 48%;">TRAVAIL DE CLASSE</th>
                <th style="width: 30%;">DEVOIRS</th>
              </tr>
            </thead>
            <tbody>
              ${itemsHtml}
            </tbody>
          </table>
        </div>
      `;
    }).join('');

    const fullHtml = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${docTitle}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700;800&family=Inter:wght@400;600;700;800&display=swap');
    
    * { box-sizing: border-box; }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      margin: 0;
      padding: 20px;
      background: #f1f5f9;
      color: #0f172a;
    }

    .page-container {
      max-width: 960px;
      margin: 0 auto;
      background: #ffffff;
      padding: 30px;
      border-radius: 12px;
      box-shadow: 0 4px 20px rgba(0,0,0,0.08);
    }

    /* RÈGLE UNIVERSELLE ARABE : STRICTEMENT RTL ET CENTRÉ DANS TOUTES LES CASES */
    .arabic-cell,
    [dir="rtl"],
    td[dir="rtl"],
    th[dir="rtl"],
    .arabic-cell *,
    [dir="rtl"] * {
      direction: rtl !important;
      text-align: center !important;
      font-family: 'Cairo', 'Amiri', Tahoma, sans-serif !important;
      unicode-bidi: plaintext !important;
    }

    .school-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 2px solid #cbd5e1;
      padding-bottom: 15px;
      margin-bottom: 20px;
    }
    .school-title {
      font-size: 18px;
      font-weight: 900;
      text-transform: uppercase;
      color: #0f172a;
      margin: 0;
    }
    .school-sub {
      font-size: 13px;
      font-weight: bold;
      color: #1e40af;
      margin: 4px 0 0 0;
      direction: rtl;
      text-align: right;
    }
    .meta-box {
      text-align: right;
      font-size: 12px;
      font-weight: 600;
      color: #475569;
    }
    .meta-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 6px;
      font-weight: 800;
      font-size: 12px;
      margin-top: 4px;
      background: ${section === 'Garçons' ? '#dbeafe' : '#fce7f3'};
      color: ${section === 'Garçons' ? '#1e40af' : '#be185d'};
      border: 1px solid ${section === 'Garçons' ? '#93c5fd' : '#fbcfe8'};
    }

    .day-section {
      margin-bottom: 24px;
      border: 1.5px solid #cbd5e1;
      border-radius: 8px;
      overflow: hidden;
      page-break-inside: avoid;
    }
    .day-header {
      background: #1e3a8a;
      color: #ffffff;
      padding: 8px 14px;
      font-weight: bold;
      font-size: 14px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .day-ar {
      color: #fde047;
      font-family: 'Cairo', sans-serif;
      font-size: 16px;
      direction: rtl;
      text-align: center;
    }

    .plan-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .plan-table th {
      background: #0f172a;
      color: #ffffff;
      padding: 8px;
      text-align: center;
      font-weight: 800;
      font-size: 11px;
      border: 1px solid #334155;
    }
    .plan-table td {
      border: 1px solid #cbd5e1;
      padding: 10px;
      vertical-align: middle;
    }

    .cell-subject {
      text-align: center;
      background: #fafafa;
    }
    .subj-badge {
      font-weight: bold;
      color: #1e40af;
      font-size: 13px;
      margin-bottom: 4px;
    }
    .period-badge {
      display: inline-block;
      background: #0f172a;
      color: #fff;
      font-size: 10px;
      font-weight: 800;
      padding: 2px 6px;
      border-radius: 4px;
      margin-bottom: 4px;
    }
    .teacher-label {
      font-size: 11px;
      font-weight: 600;
      color: #475569;
    }

    .cw-title {
      font-weight: bold;
      color: #1e3a8a;
      margin-bottom: 4px;
      font-size: 12px;
    }
    .cw-desc {
      line-height: 1.5;
      color: #1e293b;
    }
    .cw-support {
      margin-top: 6px;
      display: inline-block;
      background: #eff6ff;
      border: 1px solid #bfdbfe;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 11px;
      color: #1e40af;
      font-weight: 600;
    }

    .hw-box {
      border: 1px solid #fca5a5;
      background: #fff5f5;
      padding: 8px;
      border-radius: 6px;
    }
    .hw-tag {
      font-size: 10px;
      font-weight: 900;
      color: #b91c1c;
      text-transform: uppercase;
      margin-bottom: 3px;
    }
    .hw-text {
      color: #7f1d1d;
      font-size: 11px;
      line-height: 1.4;
    }
    .hw-none {
      text-align: center;
      color: #94a3b8;
      font-style: italic;
    }

    .print-bar {
      position: sticky;
      top: 10px;
      margin-bottom: 20px;
      display: flex;
      justify-content: flex-end;
      gap: 10px;
    }
    .btn {
      padding: 8px 16px;
      border-radius: 6px;
      font-weight: bold;
      font-size: 13px;
      cursor: pointer;
      border: none;
      box-shadow: 0 2px 6px rgba(0,0,0,0.1);
    }
    .btn-primary { background: #2563eb; color: #fff; }

    @media print {
      body { background: #fff; padding: 0; }
      .page-container { box-shadow: none; padding: 0; max-width: 100%; }
      .print-bar { display: none !important; }
      @page { size: A4 portrait; margin: 8mm; }
    }
  </style>
</head>
<body>
  <div class="print-bar">
    <button class="btn btn-primary" onclick="window.print()">🖨️ Imprimer / Enregistrer en PDF (A4)</button>
  </div>
  <div class="page-container">
    <div class="school-header">
      <div>
        <h1 class="school-title">Les Écoles Internationales Al Kawthar</h1>
        <p class="school-sub">AL KAWTHAR INTERNATIONAL SCHOOLS • مدارس الكوثر العالمية</p>
        <div style="font-size: 11px; font-weight: bold; color: #0369a1; margin-top: 4px;">
          📅 ${plan.dateRangeText}
        </div>
      </div>
      <div class="meta-box">
        <div><strong>SECTION :</strong> Section ${section}</div>
        <div class="meta-badge">${cleanGrade} ${section}</div>
        <div style="margin-top: 4px;">SEMAINE : <strong>${weekNumber}</strong> | SEMESTRE : <strong>${semester}</strong></div>
      </div>
    </div>
    ${rowsHtml}
    <div style="text-align: center; font-size: 10px; color: #64748b; margin-top: 20px; border-top: 1px solid #e2e8f0; padding-top: 8px;">
      Les Écoles Internationales Al Kawthar • Programme d'Éducation Intermédiaire (PEI) • Section ${section}
    </div>
  </div>
</body>
</html>`;

    const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${docTitle}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Mettre à jour un champ d'un item de séance
  const updateItemField = (dayIdx: number, itemIdx: number, field: keyof WeeklyPlanItem, value: any) => {
    if (!plan) return;
    const newDays = [...plan.days];
    const newItems = [...newDays[dayIdx].items];
    newItems[itemIdx] = {
      ...newItems[itemIdx],
      [field]: value,
    };
    if (field === 'subject') {
      // Auto-assigner l'enseignant par défaut STRICTEMENT autorisé pour cette section
      newItems[itemIdx].teacherName = getDefaultTeacher(section, value);
    }
    newDays[dayIdx] = { ...newDays[dayIdx], items: newItems };
    setPlan({ ...plan, days: newDays });
  };

  const addItemToDay = (dayIdx: number) => {
    if (!plan) return;
    const newDays = [...plan.days];
    const day = newDays[dayIdx];
    const nextPeriodIndex = (day.items.length % PERIOD_OPTIONS.length) + 1;
    const nextPeriod = `P${nextPeriodIndex}`;
    const defaultSubj = SUBJECT_OPTIONS[0];
    const newItem: WeeklyPlanItem = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      period: nextPeriod,
      subject: defaultSubj,
      teacherName: getDefaultTeacher(section, defaultSubj),
      classworkDescription: 'Nouvelle séance de cours',
      support: '',
      homework: '',
      hasHomework: false,
    };
    newDays[dayIdx] = { ...day, items: [...day.items, newItem] };
    setPlan({ ...plan, days: newDays });
  };

  const removeItemFromDay = (dayIdx: number, itemIdx: number) => {
    if (!plan) return;
    const newDays = [...plan.days];
    const day = newDays[dayIdx];
    const newItems = day.items.filter((_, i) => i !== itemIdx);
    newDays[dayIdx] = { ...day, items: newItems };
    setPlan({ ...plan, days: newDays });
  };

  if (!plan) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
        <div className="bg-white p-6 rounded-2xl shadow-2xl flex items-center gap-3">
          <div className="w-6 h-6 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="font-semibold text-slate-700">Chargement du plan hebdomadaire...</span>
        </div>
      </div>
    );
  }

  const displayedDays = activeDayIndex === -1 ? plan.days : [plan.days[activeDayIndex]];

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex flex-col justify-between overflow-hidden">
      {/* ══ STYLES D'IMPRESSION STRICTS POUR LE FORMAT A4 ══ */}
      <style>{`
        @media print {
          body * {
            visibility: hidden !important;
          }
          #weekly-plan-printable, #weekly-plan-printable * {
            visibility: visible !important;
          }
          #weekly-plan-printable {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          @page {
            size: A4 portrait;
            margin: 8mm 10mm 10mm 10mm;
          }
        }
      `}</style>

      {/* ══ BARRE D'OUTILS ET CONTRÔLES SUPÉRIEURS (MASQUÉE À L'IMPRESSION) ══ */}
      <header className="bg-slate-900 border-b border-slate-800 text-white px-4 py-3 flex-shrink-0 no-print">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          {/* Titre & Section */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white p-1 flex items-center justify-center shadow-md">
              <img src="/logo-alkawtar.png" alt="Al Kawthar" className="w-full h-full object-contain" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="font-black text-sm sm:text-base tracking-wide flex items-center gap-1.5">
                  <Calendar size={18} className="text-cyan-400" />
                  Plan Hebdomadaire
                </h1>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Al Kawthar
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Les Écoles Internationales Al-Kawthar · Système Officiel
              </p>
            </div>
          </div>

          {/* SÉPARATION DÉFINITIVE DES SECTIONS (Garçons / Filles) */}
          <div className="flex items-center bg-slate-800/90 p-1 rounded-xl border border-slate-700 shadow-inner">
            <button
              onClick={() => {
                setSection('Garçons');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                section === 'Garçons'
                  ? 'bg-blue-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>👨 Section Garçons</span>
            </button>
            <button
              onClick={() => {
                setSection('Filles');
              }}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                section === 'Filles'
                  ? 'bg-rose-600 text-white shadow-md'
                  : 'text-slate-300 hover:text-white hover:bg-slate-700/60'
              }`}
            >
              <span>👩 Section Filles</span>
            </button>
          </div>

          {/* Sélecteurs Classe, Semaine, Semestre */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Classe */}
            <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 font-semibold">Classe:</span>
              <select
                value={grade}
                onChange={e => setGrade(e.target.value)}
                className="bg-transparent font-bold text-white outline-none cursor-pointer"
              >
                {PEI_GRADES.map(g => (
                  <option key={g} value={g} className="bg-slate-800 text-white">
                    {g} ({section})
                  </option>
                ))}
              </select>
            </div>

            {/* Semaine */}
            <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 font-semibold">Semaine:</span>
              <select
                value={weekNumber}
                onChange={e => setWeekNumber(Number(e.target.value))}
                className="bg-transparent font-bold text-cyan-300 outline-none cursor-pointer"
              >
                {Array.from({ length: 38 }, (_, i) => i + 1).map(w => (
                  <option key={w} value={w} className="bg-slate-800 text-white">
                    Semaine {w}
                  </option>
                ))}
              </select>
            </div>

            {/* Semestre */}
            <div className="flex items-center gap-1 bg-slate-800 px-2.5 py-1.5 rounded-xl border border-slate-700 text-xs">
              <span className="text-slate-400 font-semibold">Semestre:</span>
              <select
                value={semester}
                onChange={e => setSemester(Number(e.target.value))}
                className="bg-transparent font-bold text-white outline-none cursor-pointer"
              >
                <option value={1} className="bg-slate-800 text-white">Semestre 1</option>
                <option value={2} className="bg-slate-800 text-white">Semestre 2</option>
              </select>
            </div>
          </div>

          {/* Boutons d'action */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setIsEditing(!isEditing)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition border ${
                isEditing
                  ? 'bg-amber-500 text-slate-950 border-amber-400'
                  : 'bg-slate-800 text-slate-200 border-slate-700 hover:bg-slate-700'
              }`}
            >
              <Edit3 size={13} />
              <span>{isEditing ? 'Visualisation' : 'Modifier'}</span>
            </button>

            {isEditing && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              >
                <Save size={13} />
                <span>{saving ? 'Sauvegarde...' : 'Enregistrer'}</span>
              </button>
            )}

            <button
              onClick={handleResetToDefault}
              title={`Réinitialiser au modèle officiel Al Kawthar (${section})`}
              className="p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-xl transition"
            >
              <RefreshCw size={14} />
            </button>

            <button
              onClick={handleDownloadHtml}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 rounded-xl text-xs font-bold transition shadow-sm"
              title="Télécharger le fichier HTML autonome conforme A4"
            >
              <Download size={13} />
              <span className="hidden sm:inline">Export HTML</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-sm"
              title="Imprimer ou enregistrer au format PDF (A4)"
            >
              <Printer size={13} />
              <span className="hidden sm:inline">Imprimer / PDF</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-red-400 hover:bg-slate-800 rounded-xl transition"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Filtres par jour pour navigation rapide */}
        <div className="max-w-7xl mx-auto mt-2 pt-2 border-t border-slate-800 flex items-center justify-between gap-2 overflow-x-auto text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-400 text-[11px] font-semibold mr-1">Affichage :</span>
            <button
              onClick={() => setActiveDayIndex(-1)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition ${
                activeDayIndex === -1 ? 'bg-cyan-500 text-slate-950 font-black' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Toute la semaine (Dimanche → Jeudi)
            </button>
            {DAYS_META.map((d, idx) => (
              <button
                key={d.fr}
                onClick={() => setActiveDayIndex(idx)}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition flex items-center gap-1 ${
                  activeDayIndex === idx ? 'bg-cyan-600 text-white font-bold' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>{d.fr}</span>
                <span className="font-arabic text-[11px] opacity-75">({d.ar})</span>
              </button>
            ))}
          </div>

          {savedSuccess && (
            <div className="flex items-center gap-1.5 text-emerald-400 font-bold text-xs animate-pulse">
              <CheckCircle2 size={14} />
              <span>Plan hebdomadaire enregistré avec succès !</span>
            </div>
          )}
        </div>
      </header>

      {/* ══ ZONE PRINCIPALE : DESIGN EXACT DU DOCUMENT AL KAWTHAR ══ */}
      <div className="flex-1 overflow-y-auto bg-slate-200 p-2 sm:p-6 print:p-0 print:bg-white print:overflow-visible">
        <div
          id="weekly-plan-printable"
          className="max-w-5xl mx-auto bg-white shadow-2xl rounded-2xl border border-slate-300 p-4 sm:p-8 print:shadow-none print:border-none print:p-0 print:max-w-full"
        >

          {/* ════ EN-TÊTE OFFICIEL AL KAWTHAR ════ */}
          <div className="border-b-2 border-slate-200 pb-5 mb-5 flex items-start justify-between gap-4">
            {/* Logo et Nom de l'école */}
            <div className="flex items-start gap-4">
              <div className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl bg-white p-1 border border-slate-200 shadow-sm flex items-center justify-center flex-shrink-0">
                <img
                  src="/logo-alkawtar.png"
                  alt="Logo Al Kawthar"
                  className="w-full h-full object-contain"
                />
              </div>
              <div className="space-y-1">
                <h2 className="text-base sm:text-xl font-black text-slate-900 tracking-tight leading-tight uppercase font-sans">
                  Les Écoles Internationales Al Kawthar
                </h2>
                {/* Nom arabe : RTL et Centré */}
                <p className="text-xs sm:text-sm font-bold text-blue-800 tracking-wide font-arabic dir-rtl text-right">
                  <span className="font-sans">AL KAWTHAR INTERNATIONAL SCHOOLS</span> • <span dir="rtl" className="dir-rtl text-center font-arabic">مدارس الكوثر العالمية</span>
                </p>
                {/* Plage de dates avec icône calendrier */}
                <div className="inline-flex items-center gap-1.5 bg-sky-50 text-sky-800 border border-sky-200 px-3 py-1 rounded-full text-xs font-bold mt-1">
                  <span>📅</span>
                  {isEditing ? (
                    <input
                      type="text"
                      value={plan.dateRangeText}
                      onChange={e => setPlan({ ...plan, dateRangeText: e.target.value })}
                      className="bg-white border border-sky-300 rounded px-2 py-0.5 text-xs text-sky-950 font-bold outline-none"
                    />
                  ) : (
                    <span>{plan.dateRangeText}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Métadonnées de classe, section et semaine */}
            <div className="text-right flex flex-col items-end space-y-1">
              <div className="text-xs sm:text-sm font-black text-slate-700">
                SECTION :{' '}
                <span className={`inline-flex items-center px-2 py-0.5 rounded-lg text-xs font-black border ${
                  section === 'Garçons'
                    ? 'bg-blue-50 text-blue-700 border-blue-200'
                    : 'bg-rose-50 text-rose-700 border-rose-200'
                }`}>
                  Section {section} {section === 'Garçons' ? '👨' : '👩'}
                </span>
              </div>
              <div className="text-xs sm:text-sm font-black text-slate-700">
                CLASSE :{' '}
                <span className="inline-block bg-blue-100 text-blue-900 border border-blue-300 px-2 py-0.5 rounded-md text-xs sm:text-sm font-extrabold tracking-wide">
                  {grade} {section}
                </span>
              </div>
              <div className="text-xs font-bold text-slate-600">
                SEMAINE : <strong className="text-slate-900">{weekNumber}</strong> | SEMESTRE : <strong className="text-slate-900">{semester}</strong>
              </div>
              <div className="text-xs font-black tracking-widest text-slate-500 uppercase pt-1">
                PLAN HEBDOMADAIRE
              </div>
            </div>
          </div>

          {/* ════ LISTE DES JOURS ET TABLEAUX DE COURS ════ */}
          <div className="space-y-8">
            {displayedDays.map((day, dIdx) => {
              const actualDayIndex = activeDayIndex === -1 ? dIdx : activeDayIndex;

              return (
                <div
                  key={day.dayNameFr}
                  className="rounded-2xl border-2 border-slate-300 overflow-hidden shadow-xs bg-white print:border-slate-800 print:rounded-none avoid-break"
                >
                  {/* BANDEAU DU JOUR : Titre en français à gauche | Nom arabe à droite (RTL et centré) */}
                  <div className="bg-[#1e3a8a] text-white px-4 py-2 flex items-center justify-between font-bold text-sm sm:text-base print:bg-[#1e3a8a]">
                    <div className="flex items-center gap-2">
                      <span>📅</span>
                      <span>{day.dateFormattedFr}</span>
                    </div>
                    {/* Nom du jour en arabe (RTL et centré) */}
                    <div className="font-arabic text-base sm:text-lg font-bold text-amber-300 dir-rtl text-center" dir="rtl">
                      {day.dayNameAr}
                    </div>
                  </div>

                  {/* TABLEAU DES SÉANCES : MATIÈRES | TRAVAIL DE CLASSE | DEVOIRS */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse text-xs sm:text-sm">
                      <thead>
                        <tr className="bg-[#0f172a] text-white uppercase text-[11px] sm:text-xs tracking-wider border-b border-slate-400">
                          <th className="py-2.5 px-3 text-center w-[22%] border-r border-slate-700 font-extrabold">
                            MATIÈRES
                          </th>
                          <th className="py-2.5 px-4 text-center w-[48%] border-r border-slate-700 font-extrabold">
                            TRAVAIL DE CLASSE
                          </th>
                          <th className="py-2.5 px-4 text-center w-[30%] font-extrabold">
                            DEVOIRS
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-300">
                        {day.items.map((item, itemIdx) => {
                          const isArabicSubj = isArabicText(item.subject);
                          const isArabicClasswork = isArabicText(item.classworkDescription) || isArabicText(item.classworkTitle);
                          const isArabicHomework = isArabicText(item.homework);

                          return (
                            <tr
                              key={item.id}
                              className="hover:bg-slate-50/70 transition-colors"
                            >
                              {/* 1. COLONNE MATIÈRES (RTL et centré si arabe) */}
                              <td className={`p-2.5 sm:p-3 border-r border-slate-300 align-middle ${isArabicSubj ? 'arabic-cell' : ''}`}>
                                <div className="flex flex-col items-center justify-center space-y-1.5 text-center">
                                  {/* Boîte matière avec badge période P1..P8 */}
                                  <div className="w-full max-w-[170px] border border-slate-300 rounded-lg p-1.5 bg-slate-50 shadow-2xs flex items-center justify-between gap-1">
                                    {isEditing ? (
                                      <select
                                        value={item.subject}
                                        onChange={e => updateItemField(actualDayIndex, itemIdx, 'subject', e.target.value)}
                                        className={`flex-1 text-xs font-bold text-slate-800 bg-white border border-slate-200 rounded px-1 py-0.5 outline-none ${
                                          isArabicSubj ? 'dir-rtl text-center font-arabic' : 'text-center'
                                        }`}
                                      >
                                        {SUBJECT_OPTIONS.map(s => (
                                          <option key={s} value={s}>{s}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span
                                        className={`flex-1 font-bold text-slate-800 text-xs sm:text-sm px-1 ${
                                          isArabicSubj
                                            ? 'dir-rtl text-center font-arabic leading-snug font-extrabold'
                                            : 'text-center font-bold text-blue-700'
                                        }`}
                                        dir={isArabicSubj ? 'rtl' : 'ltr'}
                                        style={isArabicSubj ? { direction: 'rtl', textAlign: 'center' } : {}}
                                      >
                                        {item.subject}
                                      </span>
                                    )}

                                    {/* Badge Période (P1, P2, P3...) */}
                                    {isEditing ? (
                                      <select
                                        value={item.period}
                                        onChange={e => updateItemField(actualDayIndex, itemIdx, 'period', e.target.value)}
                                        className="bg-slate-900 text-white rounded px-1 text-[10px] font-black"
                                      >
                                        {PERIOD_OPTIONS.map(p => (
                                          <option key={p} value={p}>{p}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="flex-shrink-0 bg-slate-900 text-white rounded px-1.5 py-0.5 text-[10px] font-black tracking-tight flex items-center gap-0.5">
                                        🎓 {item.period}
                                      </span>
                                    )}
                                  </div>

                                  {/* Enseignant (Strictement filtré par Section) */}
                                  <div className="flex items-center justify-center gap-1 text-slate-600 text-xs font-semibold">
                                    <User size={12} className="text-slate-400" />
                                    {isEditing ? (
                                      <select
                                        value={item.teacherName}
                                        onChange={e => updateItemField(actualDayIndex, itemIdx, 'teacherName', e.target.value)}
                                        className="text-xs border border-slate-200 rounded px-1 py-0.5 text-slate-800 font-semibold"
                                      >
                                        {availableTeachers.map(t => (
                                          <option key={t} value={t}>{t}</option>
                                        ))}
                                      </select>
                                    ) : (
                                      <span className="font-semibold text-slate-700">
                                        {item.teacherName}
                                      </span>
                                    )}
                                  </div>

                                  {isEditing && (
                                    <button
                                      onClick={() => removeItemFromDay(actualDayIndex, itemIdx)}
                                      className="text-[10px] text-red-500 hover:text-red-700 flex items-center gap-0.5 mt-1"
                                      title="Supprimer cette séance"
                                    >
                                      <Trash2 size={10} /> Supprimer
                                    </button>
                                  )}
                                </div>
                              </td>

                              {/* 2. COLONNE TRAVAIL DE CLASSE : CENTRÉ ET RTL SI ARABE DANS TOUTES LES CASES */}
                              <td
                                className={`p-2.5 sm:p-3 border-r border-slate-300 align-middle ${
                                  isArabicClasswork ? 'dir-rtl text-center font-arabic arabic-cell' : 'text-left'
                                }`}
                                dir={isArabicClasswork ? 'rtl' : 'ltr'}
                                style={isArabicClasswork ? { direction: 'rtl', textAlign: 'center' } : {}}
                              >
                                <div className={`space-y-1.5 ${isArabicClasswork ? 'flex flex-col items-center justify-center text-center w-full' : 'text-left'}`}>
                                  {/* Titre de séance / chapitre si existant */}
                                  {isEditing ? (
                                    <input
                                      type="text"
                                      placeholder="Titre du cours (optionnel)"
                                      value={item.classworkTitle || ''}
                                      onChange={e => updateItemField(actualDayIndex, itemIdx, 'classworkTitle', e.target.value)}
                                      className={`w-full text-xs font-bold text-blue-800 border border-blue-200 rounded px-2 py-1 outline-none mb-1 ${
                                        isArabicText(item.classworkTitle) ? 'dir-rtl text-center font-arabic' : ''
                                      }`}
                                      dir={isArabicText(item.classworkTitle) ? 'rtl' : 'ltr'}
                                    />
                                  ) : (
                                    item.classworkTitle && (
                                      <div
                                        className={`font-bold text-blue-900 text-xs sm:text-sm flex items-center gap-1.5 ${
                                          isArabicText(item.classworkTitle) || isArabicClasswork
                                            ? 'justify-center dir-rtl text-center font-arabic'
                                            : 'justify-start'
                                        }`}
                                        dir={isArabicText(item.classworkTitle) ? 'rtl' : 'ltr'}
                                        style={isArabicText(item.classworkTitle) ? { direction: 'rtl', textAlign: 'center' } : {}}
                                      >
                                        <span>🎓</span>
                                        <span>{item.classworkTitle}</span>
                                      </div>
                                    )
                                  )}

                                  {/* Description détaillée du travail de classe */}
                                  {isEditing ? (
                                    <textarea
                                      value={item.classworkDescription}
                                      onChange={e => updateItemField(actualDayIndex, itemIdx, 'classworkDescription', e.target.value)}
                                      rows={2}
                                      className={`w-full text-xs text-slate-800 border border-slate-300 rounded p-1.5 outline-none ${
                                        isArabicText(item.classworkDescription) ? 'dir-rtl text-center font-arabic' : ''
                                      }`}
                                      dir={isArabicText(item.classworkDescription) ? 'rtl' : 'ltr'}
                                    />
                                  ) : (
                                    <div
                                      className={`text-slate-800 text-xs sm:text-sm leading-relaxed ${
                                        isArabicClasswork
                                          ? 'font-arabic dir-rtl text-center font-medium leading-loose'
                                          : 'leading-relaxed'
                                      }`}
                                      dir={isArabicClasswork ? 'rtl' : 'ltr'}
                                      style={isArabicClasswork ? { direction: 'rtl', textAlign: 'center', unicodeBidi: 'plaintext' } : {}}
                                    >
                                      {item.classworkDescription}
                                    </div>
                                  )}

                                  {/* Support pédagogique (Badge avec trombone) */}
                                  {isEditing ? (
                                    <div className={`flex items-center gap-1 mt-1 ${isArabicClasswork ? 'justify-center' : ''}`}>
                                      <span className="text-[10px] text-slate-500 font-bold">Support :</span>
                                      <input
                                        type="text"
                                        placeholder="ex: Templin maths page 36"
                                        value={item.support || ''}
                                        onChange={e => updateItemField(actualDayIndex, itemIdx, 'support', e.target.value)}
                                        className={`flex-1 text-[11px] border border-slate-200 rounded px-1.5 py-0.5 text-slate-700 ${
                                          isArabicText(item.support) ? 'dir-rtl text-center font-arabic' : ''
                                        }`}
                                        dir={isArabicText(item.support) ? 'rtl' : 'ltr'}
                                      />
                                    </div>
                                  ) : (
                                    item.support && (
                                      <div
                                        className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-50 text-blue-800 text-[11px] font-semibold border border-blue-200 mt-1 ${
                                          isArabicClasswork ? 'mx-auto justify-center' : ''
                                        } ${isArabicText(item.support) ? 'dir-rtl font-arabic' : ''}`}
                                        dir={isArabicText(item.support) ? 'rtl' : 'ltr'}
                                        style={isArabicText(item.support) ? { direction: 'rtl', textAlign: 'center' } : {}}
                                      >
                                        <Paperclip size={11} className="text-blue-600 flex-shrink-0" />
                                        <span>SUPPORT : {item.support}</span>
                                      </div>
                                    )
                                  )}
                                </div>
                              </td>

                              {/* 3. COLONNE DEVOIRS : CENTRÉ ET RTL SI ARABE */}
                              <td
                                className={`p-2.5 sm:p-3 align-middle ${
                                  isArabicHomework ? 'dir-rtl text-center font-arabic arabic-cell' : 'text-center'
                                }`}
                                dir={isArabicHomework ? 'rtl' : 'ltr'}
                                style={isArabicHomework ? { direction: 'rtl', textAlign: 'center' } : {}}
                              >
                                {isEditing ? (
                                  <div className={`space-y-1.5 ${isArabicHomework ? 'flex flex-col items-center justify-center' : ''}`}>
                                    <label className="flex items-center justify-center gap-1.5 text-xs font-bold text-red-700">
                                      <input
                                        type="checkbox"
                                        checked={item.hasHomework}
                                        onChange={e => updateItemField(actualDayIndex, itemIdx, 'hasHomework', e.target.checked)}
                                        className="rounded text-red-600"
                                      />
                                      Devoir à faire
                                    </label>
                                    {item.hasHomework && (
                                      <textarea
                                        value={item.homework || ''}
                                        onChange={e => updateItemField(actualDayIndex, itemIdx, 'homework', e.target.value)}
                                        rows={2}
                                        placeholder="Consigne du devoir..."
                                        className={`w-full text-xs text-red-950 border border-red-300 rounded p-1.5 outline-none bg-red-50/40 ${
                                          isArabicText(item.homework) ? 'dir-rtl text-center font-arabic' : ''
                                        }`}
                                        dir={isArabicText(item.homework) ? 'rtl' : 'ltr'}
                                      />
                                    )}
                                  </div>
                                ) : item.hasHomework && item.homework ? (
                                  /* Encadré rouge élégant pour devoirs */
                                  <div
                                    className={`rounded-lg border border-red-300 bg-red-50/30 p-2 sm:p-2.5 text-xs text-red-900 shadow-2xs space-y-1 ${
                                      isArabicHomework ? 'dir-rtl text-center font-arabic flex flex-col items-center justify-center' : 'text-left'
                                    }`}
                                    dir={isArabicHomework ? 'rtl' : 'ltr'}
                                    style={isArabicHomework ? { direction: 'rtl', textAlign: 'center', unicodeBidi: 'plaintext' } : {}}
                                  >
                                    <div
                                      className={`font-black text-red-700 flex items-center gap-1 text-[11px] sm:text-xs uppercase tracking-wide ${
                                        isArabicHomework ? 'justify-center dir-rtl text-center' : 'justify-start'
                                      }`}
                                    >
                                      <span>✏️</span>
                                      <span>{isArabicHomework ? 'الواجب المنزلي (À FAIRE) :' : 'À FAIRE :'}</span>
                                    </div>
                                    <div
                                      className={`text-red-950 font-medium leading-relaxed ${
                                        isArabicHomework ? 'font-arabic dir-rtl text-center leading-loose font-semibold' : ''
                                      }`}
                                      dir={isArabicHomework ? 'rtl' : 'ltr'}
                                      style={isArabicHomework ? { direction: 'rtl', textAlign: 'center', unicodeBidi: 'plaintext' } : {}}
                                    >
                                      {item.homework}
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-slate-400 italic text-xs sm:text-sm text-center">
                                    Aucun
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Bouton pour ajouter une période au jour (mode édition) */}
                  {isEditing && (
                    <div className="p-2 bg-slate-50 border-t border-slate-200 flex justify-center">
                      <button
                        onClick={() => addItemToDay(actualDayIndex)}
                        className="flex items-center gap-1.5 px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition"
                      >
                        <Plus size={12} />
                        Ajouter une séance à {day.dayNameFr}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* ════ PIED DE PAGE OFFICIEL ════ */}
          <div className="mt-8 pt-4 border-t border-slate-300 flex items-center justify-between text-[10px] text-slate-500 font-medium">
            <div>
              Les Écoles Internationales Al Kawthar • Programme du Baccalauréat International (IB MYP)
            </div>
            <div>
              Section {section} {section === 'Garçons' ? '👨' : '👩'} • Classe : {grade} {section} • Semaine {weekNumber}
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default WeeklyPlanModal;
