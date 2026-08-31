import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { SUBJECTS, PEI_GRADES } from '../constants';
import type { UnitPlan, ServiceActionPlan, Exam } from '../types';
import type { InterdisciplinaryUnit } from './geminiService';
import type { AppUser, ModificationRequest } from './authService';
import { loadAllPlansForGrade, loadPlansFromDatabase } from './databaseService';
import { listUsers } from './authService';
import { loadExamsFromDatabase } from './examDatabaseService';
import { sanitizeUnitPlan } from './geminiService';

// ─────────────────────────────────────────────────────────────────────────────
// Structure des statistiques d'import/export
// ─────────────────────────────────────────────────────────────────────────────
export interface BackupStats {
  units: number;
  interdisciplinary: number;
  sea: number;
  users: number;
  requests: number;
  exams: number;
  criteria: number;
  calendars: number;
  errors: string[];
}

export interface ImportResult {
  success: boolean;
  message: string;
  stats: BackupStats;
}

// ─── Normalisation des Niveaux (Grades) ──────────────────────────────────────
export const normalizeGrade = (raw: string | number | undefined | null): string => {
  if (raw === undefined || raw === null) return 'PEI 1';
  const str = String(raw).trim().toLowerCase();
  
  if (/pei\s*1|myp\s*1|grade\s*6|6\s*[eè]me|6\s*e|sixi[eè]me|1\s*[eè]re\s*ann[eé]e|^1$/i.test(str)) return 'PEI 1';
  if (/pei\s*2|myp\s*2|grade\s*7|5\s*[eè]me|5\s*e|cinqui[eè]me|2\s*[eè]me\s*ann[eé]e|^2$/i.test(str)) return 'PEI 2';
  if (/pei\s*3|myp\s*3|grade\s*8|4\s*[eè]me|4\s*e|quatri[eè]me|3\s*[eè]me\s*ann[eé]e|^3$/i.test(str)) return 'PEI 3';
  if (/pei\s*4|myp\s*4|grade\s*9|3\s*[eè]me|3\s*e|troisi[eè]me|4\s*[eè]me\s*ann[eé]e|^4$/i.test(str)) return 'PEI 4';
  if (/pei\s*5|myp\s*5|grade\s*10|2\s*nde|2\s*nd|seconde|tronc\s*commun|5\s*[eè]me\s*ann[eé]e|^5$/i.test(str)) return 'PEI 5';

  // Si c'est déjà exactement un des grades connus
  const exact = PEI_GRADES.find(g => g.toLowerCase() === str);
  if (exact) return exact;

  return String(raw).trim() || 'PEI 1';
};

// ─── Normalisation des Matières (Subjects) ──────────────────────────────────
export const normalizeSubject = (raw: string | undefined | null): string => {
  if (!raw) return 'Mathématiques';
  const str = String(raw).trim().toLowerCase();

  if (/math[eé]matique|maths?|algebre|geometrie/i.test(str)) return 'Mathématiques';
  if (/langue\s*et\s*litt[eé]rature|fran[cç]ais|arabe\s*a|litt[eé]rature|langue\s*a/i.test(str)) return 'Langue et littérature';
  if (/acquisition\s*de\s*langues?|anglais|english|langue\s*b|espagnol|allemand|langue\s*[eé]trang[eè]re/i.test(str)) return 'Acquisition de langues';
  if (/individus?\s*et\s*soci[eé]t[eé]s?|histoire|g[eé]ographie|hist-g[eé]o|h&g|sciences?\s*humaines?|sciences?\s*sociales?/i.test(str)) return 'Individus et sociétés';
  if (/sciences?|physique|chimie|biologie|svt|sciences?\s*int[eé]gr[eé]es?/i.test(str)) return 'Sciences';
  if (/arts?|arts?\s*visuels?|musique|th[eé][aâ]tre|dessin|arts?\s*plastiques?/i.test(str)) return 'Arts';
  if (/design|technologie|informatique|conception|robotique|num[eé]rique/i.test(str)) return 'Design';
  if (/[eé]ducation\s*physique|eps|sport|sant[eé]/i.test(str)) return 'Éducation physique et à la santé';

  // Trouver correspondance exacte
  const exact = SUBJECTS.find(s => s.toLowerCase() === str);
  if (exact) return exact;

  return String(raw).trim();
};

// ─── Clé normalisée pour extraction tolérante ───────────────────────────────
const cleanKey = (k: string): string => {
  return k
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retirer accents
    .replace(/[^a-z0-9]/g, ''); // garder seulement lettres et chiffres
};

const getRowValue = (row: any, aliases: string[]): any => {
  if (!row || typeof row !== 'object') return undefined;
  const rowKeys = Object.keys(row);
  const normalizedMap: Record<string, string> = {};
  for (const k of rowKeys) {
    normalizedMap[cleanKey(k)] = k;
  }

  for (const alias of aliases) {
    const normAlias = cleanKey(alias);
    if (normalizedMap[normAlias] !== undefined) {
      const origKey = normalizedMap[normAlias];
      const val = row[origKey];
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        return val;
      }
    }
  }
  return undefined;
};

// ─── Helpers Excel Safe Limits (Évite l'erreur 'Text length must not exceed 32767 characters') ───
const prepareJsonChunks = (data: any): Record<string, string> => {
  const str = typeof data === 'string' ? data : JSON.stringify(data);
  const CHUNK_SIZE = 30000;
  if (str.length <= CHUNK_SIZE) {
    return { '_full_data_json': str };
  }
  const result: Record<string, string> = {
    '_full_data_json': str.slice(0, CHUNK_SIZE),
  };
  let part = 2;
  for (let i = CHUNK_SIZE; i < str.length; i += CHUNK_SIZE) {
    result[`_full_data_json_p${part}`] = str.slice(i, i + CHUNK_SIZE);
    part++;
  }
  return result;
};

const extractFullJson = (row: any): any => {
  if (!row) return null;
  let combined = '';
  if (row['_full_data_json']) combined += row['_full_data_json'];
  else if (row['full_data_json']) combined += row['full_data_json'];
  else if (row['json']) combined += row['json'];
  else {
    const rawVal = getRowValue(row, ['fulldatajson', 'json', 'datajson', 'fulljson']);
    if (rawVal) combined += String(rawVal);
  }

  let p = 2;
  while (row[`_full_data_json_p${p}`] || row[`fulldatajsonp${p}`]) {
    combined += (row[`_full_data_json_p${p}`] || row[`fulldatajsonp${p}`]);
    p++;
  }

  if (combined) {
    try {
      return JSON.parse(combined);
    } catch (_) {}
  }
  return null;
};

const sanitizeRowForExcel = (row: Record<string, any>): Record<string, any> => {
  const sanitized: Record<string, any> = {};
  for (const [key, val] of Object.entries(row)) {
    if (val === null || val === undefined) {
      sanitized[key] = '';
    } else if (typeof val === 'string') {
      sanitized[key] = val.length > 32000 ? val.slice(0, 32000) : val;
    } else if (typeof val === 'number' || typeof val === 'boolean') {
      sanitized[key] = val;
    } else {
      const str = JSON.stringify(val);
      sanitized[key] = str.length > 32000 ? str.slice(0, 32000) : str;
    }
  }
  return sanitized;
};

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT COMPLET EN EXCEL (.XLSX) MULTI-FEUILLES
// ─────────────────────────────────────────────────────────────────────────────
export const exportAllDataToExcel = async (
  onProgress?: (step: string, percent: number) => void
): Promise<Blob> => {
  onProgress?.('Collecte de toutes les données...', 10);

  const allUnitsMap = new Map<string, UnitPlan>();

  // a) Charger depuis l'API MongoDB
  for (const grade of PEI_GRADES) {
    try {
      const gradePlans = await loadAllPlansForGrade(grade);
      for (const p of gradePlans) {
        const uniqueKey = `${p.subject}_${p.gradeLevel}_${p.title}`.toLowerCase();
        allUnitsMap.set(p.id || uniqueKey, p);
      }
    } catch (e) {
      console.warn(`[Excel Export] Erreur chargement unités pour ${grade}:`, e);
    }
  }

  // b) Compléter avec le localStorage (plans_* et myp_shared_planifications)
  try {
    const rawShared = localStorage.getItem('myp_shared_planifications');
    if (rawShared) {
      const parsedShared = JSON.parse(rawShared);
      Object.keys(parsedShared).forEach(key => {
        const plans = parsedShared[key];
        if (Array.isArray(plans)) {
          plans.forEach(p => {
            const uniqueKey = `${p.subject}_${p.gradeLevel}_${p.title}`.toLowerCase();
            const existingId = p.id || uniqueKey;
            if (!allUnitsMap.has(existingId)) {
              allUnitsMap.set(existingId, p);
            }
          });
        }
      });
    }
  } catch (_) {}

  for (const grade of PEI_GRADES) {
    for (const subject of SUBJECTS) {
      const localKey = `plans_${subject}_${grade}`;
      const raw = localStorage.getItem(localKey);
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed)) {
            for (const p of parsed) {
              const uniqueKey = `${p.subject || subject}_${p.gradeLevel || grade}_${p.title}`.toLowerCase();
              const existingId = p.id || uniqueKey;
              if (!allUnitsMap.has(existingId)) {
                allUnitsMap.set(existingId, {
                  ...p,
                  subject: p.subject || subject,
                  gradeLevel: p.gradeLevel || grade,
                });
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  const allUnits = Array.from(allUnitsMap.values());
  onProgress?.('Collecte des unités interdisciplinaires et SEA...', 35);

  let allInter: InterdisciplinaryUnit[] = [];
  try {
    const rawInter = localStorage.getItem('interdisciplinary_units');
    if (rawInter) allInter = JSON.parse(rawInter);
  } catch (_) {}

  let allSEA: ServiceActionPlan[] = [];
  try {
    const rawSEA = localStorage.getItem('sea_plans');
    if (rawSEA) allSEA = JSON.parse(rawSEA);
  } catch (_) {}

  onProgress?.('Collecte des utilisateurs, examens et critères...', 60);

  let allUsers: AppUser[] = [];
  try {
    allUsers = await listUsers();
  } catch (_) {
    try {
      const rawUsers = localStorage.getItem('app_users');
      if (rawUsers) allUsers = JSON.parse(rawUsers);
    } catch (_) {}
  }

  let allRequests: ModificationRequest[] = [];
  try {
    const resReq = await fetch('/api/modification-requests', {
      headers: { 'X-User-Role': 'admin' }
    });
    if (resReq.ok) allRequests = await resReq.json();
  } catch (_) {
    try {
      const rawReq = localStorage.getItem('modification_requests');
      if (rawReq) allRequests = JSON.parse(rawReq);
    } catch (_) {}
  }

  let allExams: Exam[] = [];
  try {
    allExams = await loadExamsFromDatabase();
  } catch (_) {
    try {
      const rawExams = localStorage.getItem('saved_exams');
      if (rawExams) allExams = JSON.parse(rawExams);
    } catch (_) {}
  }

  let allCriteria: any[] = [];
  try {
    const resCrit = await fetch('/api/ib-criteria');
    if (resCrit.ok) allCriteria = await resCrit.json();
  } catch (_) {
    try {
      const rawCrit = localStorage.getItem('custom_ib_criteria');
      if (rawCrit) allCriteria = JSON.parse(rawCrit);
    } catch (_) {}
  }

  const allCalendars: Array<{ grade: string; schoolYear: string; entriesCount: number; data: any }> = [];
  for (const grade of PEI_GRADES) {
    try {
      const rawCal = localStorage.getItem(`annual_calendar_${grade}`);
      if (rawCal) {
        const parsed = JSON.parse(rawCal);
        allCalendars.push({
          grade,
          schoolYear: '2026/2027',
          entriesCount: Array.isArray(parsed) ? parsed.length : (parsed?.entries?.length || 0),
          data: parsed,
        });
      }
    } catch (_) {}
  }

  onProgress?.('Génération du classeur Excel...', 80);

  const wb = XLSX.utils.book_new();

  // ── FEUILLE 1 : Unités PEI ───────────────────────────────────────────────
  const unitRows = allUnits.map(p => sanitizeRowForExcel({
    'ID_Unité': p.id || '',
    'Matière': p.subject || '',
    'Niveau_Classe': p.gradeLevel || '',
    'Titre': p.title || '',
    'Enseignant': p.teacherName || '',
    'Durée': p.duration || '',
    'Année_Scolaire': p.schoolYear || '2026/2027',
    'Nb_Heures': p.numberOfHours || '',
    'Nb_Périodes': p.numberOfPeriods || '',
    'Date_Début': p.startDate || '',
    'Date_Fin': p.endDate || '',
    'Concept_Clé': p.keyConcept || '',
    'Concepts_Connexes': Array.isArray(p.relatedConcepts) ? p.relatedConcepts.join(', ') : '',
    'Contexte_Mondial': p.globalContext || '',
    'Énoncé_de_Recherche': p.statementOfInquiry || '',
    'Questions_Factuelles': p.inquiryQuestions?.factual?.join('\n') || '',
    'Questions_Conceptuelles': p.inquiryQuestions?.conceptual?.join('\n') || '',
    'Questions_Débat': p.inquiryQuestions?.debatable?.join('\n') || '',
    'Objectifs_IB': Array.isArray(p.objectives) ? p.objectives.join(', ') : '',
    'Compétences_ATL': Array.isArray(p.atlSkills) ? p.atlSkills.join('\n') : '',
    'Contenu_Notions': p.content || '',
    'Processus_Apprentissage': p.learningExperiences || '',
    'Évaluation_Formative': p.formativeAssessment || '',
    'Évaluation_Sommative': p.summativeAssessment || '',
    'Différenciation': p.differentiation || '',
    'Ressources': p.resources || '',
    'Prérequis': p.prerequisites || '',
    'Score_IB': p.ibComplianceScore !== undefined ? p.ibComplianceScore : '',
    'Réflexion_Avant': p.reflection?.prior || '',
    'Réflexion_Pendant': p.reflection?.during || '',
    'Réflexion_Après': p.reflection?.after || '',
    'Nb_Critères_Évaluation': p.assessments?.length || 0,
    ...prepareJsonChunks(p),
  }));

  const wsUnits = XLSX.utils.json_to_sheet(unitRows);
  wsUnits['!cols'] = [
    { wch: 15 }, { wch: 25 }, { wch: 12 }, { wch: 35 }, { wch: 22 },
    { wch: 12 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 14 },
    { wch: 14 }, { wch: 20 }, { wch: 30 }, { wch: 35 }, { wch: 45 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 15 }, { wch: 35 },
    { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 40 }, { wch: 35 },
    { wch: 30 }, { wch: 25 }, { wch: 10 }, { wch: 30 }, { wch: 30 },
    { wch: 30 }, { wch: 15 }, { wch: 50 },
  ];
  XLSX.utils.book_append_sheet(wb, wsUnits, 'Unités PEI');

  // ── FEUILLE 2 : Unités Interdisciplinaires ──────────────────────────────────
  const interRows = allInter.map((item: any) => sanitizeRowForExcel({
    'ID': item.id || '',
    'Niveau_Classe': item.grade || '',
    'Titre_Thème': item.title || item.themeTitle || '',
    'Matières_Impliquées': Array.isArray(item.disciplines) ? item.disciplines.join(', ') : (Array.isArray(item.subjects) ? item.subjects.join(', ') : ''),
    'Enseignants': Array.isArray(item.teachers) ? item.teachers.join(', ') : '',
    'Concept_Clé': item.keyConcept || '',
    'Contexte_Mondial': item.globalContext || '',
    'Énoncé_de_Recherche': item.statementOfInquiry || '',
    'Objectifs_Partagés': Array.isArray(item.sharedObjectives) ? item.sharedObjectives.join('\n') : '',
    'Description_Projet': item.integrationPurpose || item.projectDescription || '',
    'Évaluation_Sommative': item.summativeTask || '',
    'Date_Création': item.createdAt || new Date().toISOString(),
    ...prepareJsonChunks(item),
  }));

  const wsInter = XLSX.utils.json_to_sheet(interRows);
  XLSX.utils.book_append_sheet(wb, wsInter, 'Interdisciplinaire');

  // ── FEUILLE 3 : Projets Service et Action (SEA) ────────────────────────────
  const seaRows = allSEA.map(item => sanitizeRowForExcel({
    'ID': item.id || '',
    'Niveau_Classe': item.grade || '',
    'Matière': item.subject || '',
    'Enseignant': item.teacherName || '',
    'Titre_Projet': item.title || '',
    'Unité_Source': item.sourceUnitTitle || '',
    'Types_Action': Array.isArray(item.actionTypes) ? item.actionTypes.join(', ') : '',
    'Besoin_Communautaire': item.communityNeed || '',
    'Description': item.projectDescription || '',
    'Objectifs_IB': Array.isArray(item.learningOutcomes) ? item.learningOutcomes.map(o => o.text).join('\n') : '',
    'Compétences_ATL': Array.isArray(item.atlSkills) ? item.atlSkills.join('\n') : '',
    'Critères_Réussite': Array.isArray(item.successCriteria) ? item.successCriteria.map(s => s.description).join('\n') : '',
    'Date_Création': item.createdAt || new Date().toISOString(),
    ...prepareJsonChunks(item),
  }));

  const wsSEA = XLSX.utils.json_to_sheet(seaRows);
  XLSX.utils.book_append_sheet(wb, wsSEA, 'Service et Action');

  // ── FEUILLE 4 : Enseignants & Utilisateurs ──────────────────────────────────
  const userRows = allUsers.map((u: any) => sanitizeRowForExcel({
    'ID': u.id || '',
    'Nom_Utilisateur': u.username || '',
    'Nom_Complet': u.displayName || '',
    'Rôle': u.role || 'teacher',
    'Matières_Attribuées': Array.isArray(u.subjects) ? u.subjects.join(', ') : (u.subjects || ''),
    'Actif': u.isActive !== false ? 'OUI' : 'NON',
    'Date_Création': u.createdAt || '',
    ...prepareJsonChunks(u),
  }));

  const wsUsers = XLSX.utils.json_to_sheet(userRows);
  XLSX.utils.book_append_sheet(wb, wsUsers, 'Enseignants & Utilisateurs');

  // ── FEUILLE 5 : Demandes de Modification ───────────────────────────────────
  const reqRows = allRequests.map((r: any) => sanitizeRowForExcel({
    'ID': r.id || '',
    'Nom_Utilisateur': r.teacherUsername || '',
    'Nom_Enseignant': r.teacherDisplayName || '',
    'Matière': r.subject || '',
    'Classe': r.grade || '',
    'Titre_Unité': r.unitTitle || '',
    'Description': r.description || '',
    'Statut': r.status || 'pending',
    'Note_Admin': r.adminNote || '',
    'Date_Création': r.createdAt || '',
    'Date_Mise_à_Jour': r.completedAt || r.approvedAt || '',
  }));

  const wsReq = XLSX.utils.json_to_sheet(reqRows);
  XLSX.utils.book_append_sheet(wb, wsReq, 'Demandes de Modification');

  // ── FEUILLE 6 : Examens & Évaluations ──────────────────────────────────────
  const examRows = allExams.map(ex => sanitizeRowForExcel({
    'ID': ex.id || '',
    'Matière': ex.subject || '',
    'Niveau_Classe': ex.grade || '',
    'Semestre': ex.semester || '',
    'Enseignant': ex.teacherName || '',
    'Nom_Classe': ex.className || '',
    'Titre': ex.title || '',
    'Durée': ex.duration || '',
    'Total_Points': ex.totalPoints || '',
    'Difficulté': ex.difficulty || '',
    'Style': ex.style || '',
    'Nb_Questions': ex.questions?.length || 0,
    'Date_Création': ex.createdAt ? new Date(ex.createdAt).toISOString() : '',
    ...prepareJsonChunks(ex),
  }));

  const wsExams = XLSX.utils.json_to_sheet(examRows);
  XLSX.utils.book_append_sheet(wb, wsExams, 'Examens & Évaluations');

  // ── FEUILLE 7 : Critères IB Personnalisés ──────────────────────────────────
  const critRows = allCriteria.map((c: any) => sanitizeRowForExcel({
    'ID': c.id || c._id || '',
    'Matière': c.subject || '',
    'Niveau': c.grade || '',
    'Critère': c.criterion || '',
    'Nom_Critère': c.criterionName || '',
    'Aspects': Array.isArray(c.strands) ? c.strands.join('\n') : (c.aspects || ''),
    'Dernière_Mise_à_Jour': c.lastUpdated || '',
    ...prepareJsonChunks(c),
  }));

  const wsCrit = XLSX.utils.json_to_sheet(critRows);
  XLSX.utils.book_append_sheet(wb, wsCrit, 'Critères IB');

  // ── FEUILLE 8 : Calendriers Annuels ────────────────────────────────────────
  const calRows = allCalendars.map(cal => sanitizeRowForExcel({
    'Niveau_Classe': cal.grade || '',
    'Année_Scolaire': cal.schoolYear || '2026/2027',
    'Nb_Entrées': cal.entriesCount || 0,
    ...prepareJsonChunks(cal.data),
  }));

  const wsCal = XLSX.utils.json_to_sheet(calRows);
  XLSX.utils.book_append_sheet(wb, wsCal, 'Calendriers');

  // ── ÉCRIRE LE FICHIER EXCEL ────────────────────────────────────────────────
  const excelBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([excelBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });

  onProgress?.('Téléchargement du fichier...', 100);
  return blob;
};

// ─────────────────────────────────────────────────────────────────────────────
// TÉLÉCHARGEMENT DIRECT DE LA SAUVEGARDE EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export const downloadCompleteExcelBackup = async (
  onProgress?: (step: string, percent: number) => void
): Promise<void> => {
  try {
    const blob = await exportAllDataToExcel(onProgress);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Sauvegarde_Complete_PEI_AlKawthar_${dateStr}.xlsx`;
    saveAs(blob, fileName);
  } catch (error: any) {
    console.error('Erreur export Excel complet:', error);
    alert(`Erreur lors de l'exportation Excel : ${error?.message || error}`);
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTATION & RESTAURATION COMPLÈTE DEPUIS LE FICHIER EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export const importAllDataFromExcel = async (
  file: File,
  onProgress?: (step: string, percent: number) => void
): Promise<ImportResult> => {
  const stats: BackupStats = {
    units: 0,
    interdisciplinary: 0,
    sea: 0,
    users: 0,
    requests: 0,
    exams: 0,
    criteria: 0,
    calendars: 0,
    errors: [],
  };

  try {
    onProgress?.('Lecture et analyse du fichier Excel...', 10);
    const arrayBuffer = await file.arrayBuffer();
    const wb = XLSX.read(arrayBuffer, { type: 'array' });

    if (!wb.SheetNames || wb.SheetNames.length === 0) {
      throw new Error('Le fichier Excel ne contient aucune feuille de calcul.');
    }

    // Classer les feuilles selon leur type
    const sheetCategories: {
      units: string[];
      inter: string[];
      sea: string[];
      users: string[];
      requests: string[];
      exams: string[];
      criteria: string[];
      calendars: string[];
    } = {
      units: [],
      inter: [],
      sea: [],
      users: [],
      requests: [],
      exams: [],
      criteria: [],
      calendars: [],
    };

    for (const sheetName of wb.SheetNames) {
      const lower = sheetName.toLowerCase().trim();
      if (/inter/i.test(lower)) {
        sheetCategories.inter.push(sheetName);
      } else if (/service|sea|action/i.test(lower)) {
        sheetCategories.sea.push(sheetName);
      } else if (/enseignant|utilisateur|user|prof/i.test(lower)) {
        sheetCategories.users.push(sheetName);
      } else if (/demande|request|modif/i.test(lower)) {
        sheetCategories.requests.push(sheetName);
      } else if (/examen|eval|exam/i.test(lower)) {
        sheetCategories.exams.push(sheetName);
      } else if (/crit[eè]re|criteria/i.test(lower)) {
        sheetCategories.criteria.push(sheetName);
      } else if (/calendrier|calendar/i.test(lower)) {
        sheetCategories.calendars.push(sheetName);
      } else {
        // Toutes les autres feuilles (Unités PEI, Plans, PEI 1, PEI 2, Mathématiques, Sciences, Sheet1, etc.) sont traitées comme feuilles d'unités !
        sheetCategories.units.push(sheetName);
      }
    }

    // ── 1. RESTAURER TOUTES LES UNITÉS PEI SUR TOUTES LES FEUILLES CONCERNÉES ──
    const groupedPlans: Record<string, { subject: string; grade: string; plans: UnitPlan[] }> = {};

    for (const sheetName of sheetCategories.units) {
      onProgress?.(`Lecture de la feuille "${sheetName}"...`, 25);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);

      // Déduire le grade ou le sujet si le nom de la feuille correspond
      const inferredGradeFromSheet = normalizeGrade(sheetName);
      const inferredSubjectFromSheet = normalizeSubject(sheetName);
      const isSheetGradeName = /pei|myp|6[eè]|5[eè]|4[eè]|3[eè]|2nde/i.test(sheetName);
      const isSheetSubjectName = SUBJECTS.some(s => s.toLowerCase() === sheetName.toLowerCase().trim());

      for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
        const row = rawRows[rIdx];
        let plan: UnitPlan | null = null;

        // a) Utiliser JSON complet si présent
        const extractedJson = extractFullJson(row);
        if (extractedJson && typeof extractedJson === 'object' && (extractedJson.title || extractedJson.subject || extractedJson.id)) {
          plan = sanitizeUnitPlan(
            extractedJson,
            extractedJson.subject || (isSheetSubjectName ? inferredSubjectFromSheet : ''),
            extractedJson.gradeLevel || (isSheetGradeName ? inferredGradeFromSheet : '')
          );
        }

        // b) Sinon reconstruire via les colonnes tabulaires
        if (!plan) {
          const rawTitle = getRowValue(row, [
            'titre', 'titredeunite', 'title', 'nom', 'nomdeunite', 'intitule', 'unite', 'theme', 'unitepedagogique'
          ]);
          const rawSubject = getRowValue(row, [
            'matiere', 'discipline', 'subject', 'cours', 'matiereprincipale', 'branche', 'domaine'
          ]);
          const rawGrade = getRowValue(row, [
            'niveauclasse', 'niveau', 'classe', 'grade', 'gradelevel', 'annee', 'anneepei', 'pei', 'anneeclasse', 'year', 'level'
          ]);

          const title = String(rawTitle || '').trim() || (rawSubject || rawGrade ? `Unité ${rIdx + 1}` : '');
          const subject = normalizeSubject(rawSubject || (isSheetSubjectName ? inferredSubjectFromSheet : ''));
          const gradeLevel = normalizeGrade(rawGrade || (isSheetGradeName ? inferredGradeFromSheet : 'PEI 1'));

          if (!title && !rawSubject && !rawGrade) continue; // Ligne vide

          const teacherName = String(getRowValue(row, ['enseignant', 'professeur', 'prof', 'teacher', 'nomenseignant', 'auteur', 'author']) || '').trim();
          const duration = String(getRowValue(row, ['duree', 'duration', 'temps', 'volumehoraire', 'dureetotale']) || '10 heures').trim();
          const schoolYear = String(getRowValue(row, ['anneescolaire', 'annee', 'schoolyear', 'promotion']) || '2026/2027').trim();
          const numberOfHours = String(getRowValue(row, ['nbheures', 'nombredheures', 'heures', 'heuresprevues', 'hours', 'nbheure']) || '').trim();
          const numberOfPeriods = String(getRowValue(row, ['nbperiodes', 'nombredeperiodes', 'periodes', 'periods', 'nbseances', 'seances', 'sessions']) || '').trim();
          const startDate = String(getRowValue(row, ['datedebut', 'startdate', 'debut', 'datecommencement']) || '').trim();
          const endDate = String(getRowValue(row, ['datefin', 'enddate', 'fin', 'dateecheance']) || '').trim();
          const keyConcept = String(getRowValue(row, ['conceptcle', 'conceptclef', 'keyconcept', 'conceptcentral', 'cle']) || '').trim();
          
          const rawRelated = getRowValue(row, ['conceptsconnexes', 'relatedconcepts', 'conceptconnexe', 'connexes', 'conceptsassocies']);
          const relatedConcepts = typeof rawRelated === 'string'
            ? rawRelated.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
            : Array.isArray(rawRelated) ? rawRelated : [];

          const globalContext = String(getRowValue(row, ['contextemondial', 'globalcontext', 'contexte', 'contexteglobal', 'mondial']) || '').trim();
          const statementOfInquiry = String(getRowValue(row, ['enoncederecherche', 'enonce', 'statementofinquiry', 'soi', 'problematique', 'ideegenerale']) || '').trim();

          const rawFactual = getRowValue(row, ['questionsfactuelles', 'factuelles', 'factualquestions', 'factual']);
          const rawConceptual = getRowValue(row, ['questionsconceptuelles', 'conceptuelles', 'conceptualquestions', 'conceptual']);
          const rawDebatable = getRowValue(row, ['questionsdebat', 'questionsdebatables', 'debat', 'debatablequestions', 'debatable', 'questionsadebat']);

          const inquiryQuestions = {
            factual: typeof rawFactual === 'string' ? rawFactual.split(/[\n|;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawFactual) ? rawFactual : []),
            conceptual: typeof rawConceptual === 'string' ? rawConceptual.split(/[\n|;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawConceptual) ? rawConceptual : []),
            debatable: typeof rawDebatable === 'string' ? rawDebatable.split(/[\n|;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawDebatable) ? rawDebatable : []),
          };

          const rawObj = getRowValue(row, ['objectifsib', 'objectifs', 'criteresib', 'criteres', 'objectives', 'criteria', 'criteresevaluation']);
          const objectives = typeof rawObj === 'string'
            ? rawObj.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
            : Array.isArray(rawObj) ? rawObj : [];

          const rawAtl = getRowValue(row, ['competencesatl', 'approchesapprentissage', 'atl', 'atlskills', 'competences']);
          const atlSkills = typeof rawAtl === 'string'
            ? rawAtl.split(/[\n;]/).map(s => s.trim()).filter(Boolean)
            : Array.isArray(rawAtl) ? rawAtl : [];

          const content = String(getRowValue(row, ['contenunotions', 'contenu', 'notions', 'savoirs', 'connaissances', 'content', 'programme']) || '').trim();
          const learningExperiences = String(getRowValue(row, ['processusapprentissage', 'experiencesapprentissage', 'activites', 'activitesapprentissage', 'learningexperiences', 'deroulement', 'processus']) || '').trim();
          const formativeAssessment = String(getRowValue(row, ['evaluationformative', 'evalformative', 'formativeassessment', 'formative', 'evaluationsformatives']) || '').trim();
          const summativeAssessment = String(getRowValue(row, ['evaluationsommative', 'evalsommative', 'summativeassessment', 'summative', 'evaluationssommatives', 'tachesommative']) || '').trim();
          const differentiation = String(getRowValue(row, ['differenciation', 'differentiation', 'adaptation', 'soutien', 'enrichissement']) || '').trim();
          const resources = String(getRowValue(row, ['ressources', 'resources', 'materiel', 'supports', 'outils']) || '').trim();
          const prerequisites = String(getRowValue(row, ['prerequis', 'prerequisites', 'prealables']) || '').trim();
          const chapters = String(getRowValue(row, ['chapitres', 'chapters', 'lecons', 'lessons', 'parties']) || '').trim();

          const scoreVal = getRowValue(row, ['scoreib', 'score', 'conformite', 'ibscore']);
          const ibComplianceScore = scoreVal !== undefined && !isNaN(Number(scoreVal)) ? Number(scoreVal) : undefined;

          const refPrior = String(getRowValue(row, ['reflexionavant', 'reflexionprealable', 'avant', 'prior', 'priorreflection']) || '').trim();
          const refDuring = String(getRowValue(row, ['reflexionpendant', 'pendant', 'during', 'duringreflection']) || '').trim();
          const refAfter = String(getRowValue(row, ['reflexionapres', 'apres', 'after', 'afterreflection']) || '').trim();

          const id = String(getRowValue(row, ['idunite', 'id', 'identifier']) || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

          plan = sanitizeUnitPlan({
            id,
            title: title || 'Unité sans titre',
            subject,
            gradeLevel,
            teacherName,
            duration,
            schoolYear,
            numberOfHours,
            numberOfPeriods,
            startDate,
            endDate,
            prerequisites,
            chapters,
            keyConcept,
            relatedConcepts,
            globalContext,
            statementOfInquiry,
            inquiryQuestions,
            objectives,
            atlSkills,
            content,
            learningExperiences,
            formativeAssessment,
            summativeAssessment,
            differentiation,
            resources,
            ibComplianceScore,
            reflection: {
              prior: refPrior,
              during: refDuring,
              after: refAfter,
            },
          }, subject, gradeLevel);
        }

        if (plan && plan.subject && plan.gradeLevel) {
          const groupKey = `${plan.subject}_${plan.gradeLevel}`;
          if (!groupedPlans[groupKey]) {
            groupedPlans[groupKey] = {
              subject: plan.subject,
              grade: plan.gradeLevel,
              plans: [],
            };
          }
          // Éviter les doublons stricts par id ou titre dans le même groupe
          const existingIdx = groupedPlans[groupKey].plans.findIndex(p => p.id === plan?.id || (p.title && p.title.toLowerCase() === plan?.title?.toLowerCase()));
          if (existingIdx !== -1) {
            groupedPlans[groupKey].plans[existingIdx] = plan;
          } else {
            groupedPlans[groupKey].plans.push(plan);
          }
          stats.units++;
        }
      }
    }

    // ── Enregistrer les unités vers MongoDB ET tous les caches localStorage ──
    onProgress?.('Enregistrement des unités dans la base de données...', 50);

    // Charger les planifications partagées existantes
    let sharedPlans: Record<string, UnitPlan[]> = {};
    try {
      const rawShared = localStorage.getItem('myp_shared_planifications');
      if (rawShared) sharedPlans = JSON.parse(rawShared);
    } catch (_) {}

    for (const groupKey of Object.keys(groupedPlans)) {
      const { subject, grade, plans } = groupedPlans[groupKey];
      
      // Fusionner avec les plans existants
      const existingLocalPlans = sharedPlans[groupKey] || [];
      const mergedPlansMap = new Map<string, UnitPlan>();
      
      for (const p of existingLocalPlans) {
        if (p.id) mergedPlansMap.set(p.id, p);
      }
      for (const p of plans) {
        mergedPlansMap.set(p.id, p);
      }
      const finalPlansList = Array.from(mergedPlansMap.values());

      // 1. Sauvegarder dans myp_shared_planifications (source de vérité localStorage)
      sharedPlans[groupKey] = finalPlansList;

      // 2. Sauvegarder dans plans_${subject}_${grade} (cache individuel)
      try {
        const localKey = `plans_${subject}_${grade}`;
        localStorage.setItem(localKey, JSON.stringify(finalPlansList));
      } catch (_) {}

      // 3. Sauvegarder dans MongoDB via API
      try {
        await fetch('/api/planifications', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-User-Role': 'admin',
            'X-Import-Mode': 'restore',
          },
          body: JSON.stringify({ subject, grade, plans: finalPlansList }),
        });
      } catch (err: any) {
        stats.errors.push(`Erreur API pour ${subject} - ${grade}: ${err?.message || err}`);
      }
    }

    try {
      localStorage.setItem('myp_shared_planifications', JSON.stringify(sharedPlans));
    } catch (_) {}

    // ── 2. RESTAURER LES UNITÉS INTERDISCIPLINAIRES ──────────────────────────
    for (const sheetName of sheetCategories.inter) {
      onProgress?.('Restauration des unités interdisciplinaires...', 65);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredInter: InterdisciplinaryUnit[] = [];

      for (const row of rawRows) {
        let item: InterdisciplinaryUnit | null = extractFullJson(row);
        if (!item) {
          const themeTitle = String(getRowValue(row, ['titretheme', 'titre', 'theme', 'title']) || '').trim();
          const grade = normalizeGrade(getRowValue(row, ['niveauclasse', 'niveau', 'classe', 'grade']));
          if (themeTitle) {
            const rawSubj = getRowValue(row, ['matieresimpliquees', 'matieres', 'disciplines', 'subjects']);
            const rawTeach = getRowValue(row, ['enseignants', 'teachers', 'profs']);
            const rawObj = getRowValue(row, ['objectifspartages', 'objectifs', 'sharedobjectives']);

            item = {
              id: String(getRowValue(row, ['id', 'idunite']) || `inter_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
              grade,
              themeTitle,
              subjects: typeof rawSubj === 'string' ? rawSubj.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawSubj) ? rawSubj : []),
              teachers: typeof rawTeach === 'string' ? rawTeach.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawTeach) ? rawTeach : []),
              keyConcept: String(getRowValue(row, ['conceptcle', 'conceptclef', 'keyconcept']) || '').trim(),
              globalContext: String(getRowValue(row, ['contextemondial', 'globalcontext']) || '').trim(),
              statementOfInquiry: String(getRowValue(row, ['enoncederecherche', 'statementofinquiry', 'soi']) || '').trim(),
              sharedObjectives: typeof rawObj === 'string' ? rawObj.split(/[\n;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawObj) ? rawObj : []),
              projectDescription: String(getRowValue(row, ['descriptionprojet', 'description', 'projet']) || '').trim(),
              summativeAssessment: String(getRowValue(row, ['evaluationsommative', 'summativeassessment', 'tachesommative']) || '').trim(),
              createdAt: String(getRowValue(row, ['datecreation', 'createdat']) || new Date().toISOString()),
            } as any;
          }
        }
        if (item) {
          restoredInter.push(item);
          stats.interdisciplinary++;
        }
      }

      if (restoredInter.length > 0) {
        try {
          const existing: InterdisciplinaryUnit[] = JSON.parse(localStorage.getItem('interdisciplinary_units') || '[]');
          const merged = [...existing.filter(e => !restoredInter.some(r => r.id === e.id)), ...restoredInter];
          localStorage.setItem('interdisciplinary_units', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 3. RESTAURER SERVICE ET ACTION (SEA) ─────────────────────────────────
    for (const sheetName of sheetCategories.sea) {
      onProgress?.('Restauration des projets Service et Action...', 75);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredSEA: ServiceActionPlan[] = [];

      for (const row of rawRows) {
        let item: ServiceActionPlan | null = extractFullJson(row);
        if (!item) {
          const projectTitle = String(getRowValue(row, ['titreprojet', 'titre', 'projet', 'title']) || '').trim();
          const grade = normalizeGrade(getRowValue(row, ['niveauclasse', 'niveau', 'classe', 'grade']));
          if (projectTitle) {
            const rawAct = getRowValue(row, ['typesaction', 'actiontypes', 'actions']);
            const rawOutcomes = getRowValue(row, ['objectifsib', 'learningoutcomes', 'objectifs']);
            const rawAtl = getRowValue(row, ['competencesatl', 'atlskills', 'atl']);
            const rawSucc = getRowValue(row, ['criteresreussite', 'successcriteria', 'criteres']);

            item = {
              id: String(getRowValue(row, ['id', 'idprojet']) || `sea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
              grade,
              subject: normalizeSubject(getRowValue(row, ['matiere', 'discipline', 'subject'])),
              teacherName: String(getRowValue(row, ['enseignant', 'teacher', 'prof']) || '').trim(),
              projectTitle,
              unitTitle: String(getRowValue(row, ['unitesource', 'sourceunit', 'unite']) || '').trim(),
              actionTypes: typeof rawAct === 'string' ? rawAct.split(/[,;\n]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawAct) ? rawAct : []),
              communityNeed: String(getRowValue(row, ['besoincommunautaire', 'communityneed', 'besoin']) || '').trim(),
              description: String(getRowValue(row, ['description', 'detail']) || '').trim(),
              learningOutcomes: typeof rawOutcomes === 'string' ? rawOutcomes.split(/[\n;]/).map((s: string) => ({ id: `lo_${Date.now()}`, text: s.trim() })) : (Array.isArray(rawOutcomes) ? rawOutcomes : []),
              atlSkills: typeof rawAtl === 'string' ? rawAtl.split(/[\n;]/).map((s: string) => s.trim()).filter(Boolean) : (Array.isArray(rawAtl) ? rawAtl : []),
              successCriteria: typeof rawSucc === 'string' ? rawSucc.split(/[\n;]/).map((s: string) => ({ id: `sc_${Date.now()}`, description: s.trim() })) : (Array.isArray(rawSucc) ? rawSucc : []),
              createdAt: String(getRowValue(row, ['datecreation', 'createdat']) || new Date().toISOString()),
            } as any;
          }
        }
        if (item) {
          restoredSEA.push(item);
          stats.sea++;
        }
      }

      if (restoredSEA.length > 0) {
        try {
          const existing: ServiceActionPlan[] = JSON.parse(localStorage.getItem('sea_plans') || '[]');
          const merged = [...existing.filter(e => !restoredSEA.some(r => r.id === e.id)), ...restoredSEA];
          localStorage.setItem('sea_plans', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 4. RESTAURER LES ENSEIGNANTS / UTILISATEURS ────────────────────────────
    for (const sheetName of sheetCategories.users) {
      onProgress?.('Restauration des enseignants...', 82);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredUsers: AppUser[] = [];

      for (const row of rawRows) {
        let user: AppUser | null = extractFullJson(row);
        if (!user) {
          const username = String(getRowValue(row, ['nomutilisateur', 'username', 'identifiant', 'login', 'email']) || '').trim();
          const displayName = String(getRowValue(row, ['nomcomplet', 'displayname', 'nom', 'enseignant', 'prenom']) || username).trim();
          if (username) {
            const rawSubj = getRowValue(row, ['matieresattribuees', 'matieres', 'subjects', 'disciplines']);
            const subjects = typeof rawSubj === 'string'
              ? rawSubj.split(/[,;\n]/).map(s => normalizeSubject(s)).filter(Boolean)
              : Array.isArray(rawSubj) ? rawSubj.map(s => normalizeSubject(s)) : [];

            user = {
              id: String(getRowValue(row, ['id', 'user_id']) || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
              username,
              displayName: displayName || username,
              role: (String(getRowValue(row, ['role', 'statut', 'grade']) || 'teacher').toLowerCase().includes('admin') ? 'admin' : 'teacher') as any,
              subjects,
            };
          }
        }
        if (user) {
          restoredUsers.push(user);
          stats.users++;

          // Tenter la mise à jour via l'API
          try {
            await fetch('/api/users', {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-User-Role': 'admin',
              },
              body: JSON.stringify({
                action: 'create',
                userData: {
                  username: user.username,
                  displayName: user.displayName,
                  role: user.role,
                  subjects: user.subjects,
                  password: 'ChangeMe2026!',
                },
              }),
            });
          } catch (_) {}
        }
      }

      if (restoredUsers.length > 0) {
        try {
          const existing: AppUser[] = JSON.parse(localStorage.getItem('app_users') || '[]');
          const merged = [...existing.filter(e => !restoredUsers.some(r => r.username === e.username)), ...restoredUsers];
          localStorage.setItem('app_users', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 5. RESTAURER LES EXAMENS ──────────────────────────────────────────────
    for (const sheetName of sheetCategories.exams) {
      onProgress?.('Restauration des examens...', 88);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredExams: Exam[] = [];

      for (const row of rawRows) {
        let exam: Exam | null = extractFullJson(row);
        if (!exam) {
          const title = String(getRowValue(row, ['titre', 'title', 'nom']) || '').trim();
          const subject = normalizeSubject(getRowValue(row, ['matiere', 'discipline', 'subject']));
          const grade = normalizeGrade(getRowValue(row, ['niveauclasse', 'niveau', 'classe', 'grade']));
          const semester = String(getRowValue(row, ['semestre', 'semester', 'periode']) || 'Semestre 1').trim();

          if (title || subject) {
            exam = {
              id: String(getRowValue(row, ['id', 'idexamen']) || `exam_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
              title: title || `Examen ${subject}`,
              subject,
              grade,
              semester,
              teacherName: String(getRowValue(row, ['enseignant', 'teacher', 'prof']) || '').trim(),
              className: String(getRowValue(row, ['nomclasse', 'classe', 'classname']) || '').trim(),
              duration: String(getRowValue(row, ['duree', 'duration']) || '60 min').trim(),
              totalPoints: Number(getRowValue(row, ['totalpoints', 'points', 'bareme'])) || 20,
              difficulty: String(getRowValue(row, ['difficulte', 'difficulty']) || 'Moyen'),
              style: String(getRowValue(row, ['style', 'type']) || 'Standard'),
              instructions: [],
              questions: [],
              createdAt: String(getRowValue(row, ['datecreation', 'createdat']) || new Date().toISOString()),
            } as any;
          }
        }
        if (exam) {
          restoredExams.push(exam);
          stats.exams++;
          try {
            await fetch('/api/exams', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(exam),
            });
          } catch (_) {}
        }
      }

      if (restoredExams.length > 0) {
        try {
          const existing: Exam[] = JSON.parse(localStorage.getItem('saved_exams') || '[]');
          const merged = [...existing.filter(e => !restoredExams.some(r => r.id === e.id)), ...restoredExams];
          localStorage.setItem('saved_exams', JSON.stringify(merged));
        } catch (_) {}
      }
    }

    // ── 6. RESTAURER LES CALENDRIERS ANNUELS ──────────────────────────────────
    for (const sheetName of sheetCategories.calendars) {
      onProgress?.('Restauration des calendriers...', 94);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      for (const row of rawRows) {
        const grade = normalizeGrade(getRowValue(row, ['niveauclasse', 'niveau', 'classe', 'grade']));
        const data = extractFullJson(row);
        if (grade && data) {
          try {
            localStorage.setItem(`annual_calendar_${grade}`, JSON.stringify(data));
            stats.calendars++;
          } catch (_) {}
        }
      }
    }

    // ── 7. RESTAURER LES CRITÈRES IB ─────────────────────────────────────────
    for (const sheetName of sheetCategories.criteria) {
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows: any[] = XLSX.utils.sheet_to_json(ws);
      const restoredCrit: any[] = [];
      for (const row of rawRows) {
        let parsed = extractFullJson(row);
        if (!parsed) {
          const crit = getRowValue(row, ['critere', 'criterion']);
          const name = getRowValue(row, ['nomcritere', 'criterionname', 'nom']);
          const subj = normalizeSubject(getRowValue(row, ['matiere', 'subject']));
          const grade = normalizeGrade(getRowValue(row, ['niveau', 'grade']));
          if (crit && name) {
            const rawStrands = getRowValue(row, ['aspects', 'strands']);
            parsed = {
              id: String(getRowValue(row, ['id']) || `crit_${Date.now()}`),
              criterion: String(crit),
              criterionName: String(name),
              subject: subj,
              grade,
              strands: typeof rawStrands === 'string' ? rawStrands.split(/[\n;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawStrands) ? rawStrands : []),
              lastUpdated: new Date().toISOString(),
            };
          }
        }
        if (parsed) {
          restoredCrit.push(parsed);
          stats.criteria++;
        }
      }
      if (restoredCrit.length > 0) {
        try {
          localStorage.setItem('custom_ib_criteria', JSON.stringify(restoredCrit));
        } catch (_) {}
      }
    }

    // Déclencher des événements globaux pour forcer la mise à jour immédiate de tous les composants React
    try {
      window.dispatchEvent(new CustomEvent('planifications_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (_) {}

    onProgress?.('Restauration terminée avec succès !', 100);

    const totalRestored = stats.units + stats.interdisciplinary + stats.sea + stats.users + stats.exams + stats.calendars + stats.criteria;
    return {
      success: true,
      message: `Restauration réussie : ${stats.units} unité(s) PEI, ${stats.interdisciplinary} unité(s) interdisciplinaire(s), ${stats.sea} projet(s) SEA, ${stats.users} enseignant(s), ${stats.exams} examen(s) et ${stats.calendars} calendrier(s) restaurés et synchronisés !`,
      stats,
    };
  } catch (error: any) {
    console.error('Erreur restauration Excel:', error);
    return {
      success: false,
      message: error?.message || 'Erreur lors de la lecture du fichier Excel.',
      stats,
    };
  }
};
