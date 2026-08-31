import * as XLSX from 'xlsx';
import { saveAs } from 'file-saver';
import { SUBJECTS, PEI_GRADES } from '../constants';
import type { UnitPlan, ServiceActionPlan, Exam } from '../types';
import type { InterdisciplinaryUnit } from './geminiService';
import type { AppUser, ModificationRequest } from './authService';
import { loadAllPlansForGrade } from './databaseService';
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
  
  if (/pei\s*1|myp\s*1|grade\s*6|6\s*[eè]me|6\s*e|sixi[eè]me|1\s*[eè]re\s*ann[eé]e|^1$|الصف\s*السادس|سادس|سنة\s*أولى/i.test(str)) return 'PEI 1';
  if (/pei\s*2|myp\s*2|grade\s*7|5\s*[eè]me|5\s*e|cinqui[eè]me|2\s*[eè]me\s*ann[eé]e|^2$|الصف\s*السابع|سابع|سنة\s*ثانية/i.test(str)) return 'PEI 2';
  if (/pei\s*3|myp\s*3|grade\s*8|4\s*[eè]me|4\s*e|quatri[eè]me|3\s*[eè]me\s*ann[eé]e|^3$|الصف\s*الثامن|ثامن|سنة\s*ثالثة/i.test(str)) return 'PEI 3';
  if (/pei\s*4|myp\s*4|grade\s*9|3\s*[eè]me|3\s*e|troisi[eè]me|4\s*[eè]me\s*ann[eé]e|^4$|الصف\s*التاسع|تاسع|سنة\s*رابعة/i.test(str)) return 'PEI 4';
  if (/pei\s*5|myp\s*5|grade\s*10|2\s*nde|2\s*nd|seconde|tronc\s*commun|5\s*[eè]me\s*ann[eé]e|^5$|الصف\s*العاشر|عاشر|سنة\s*خامسة|أولى\s*ثانوي/i.test(str)) return 'PEI 5';

  const exact = PEI_GRADES.find(g => g.toLowerCase() === str);
  if (exact) return exact;

  return String(raw).trim() || 'PEI 1';
};

// ─── Normalisation des Matières (Subjects) ──────────────────────────────────
export const normalizeSubject = (raw: string | undefined | null): string => {
  if (!raw) return 'Mathématiques';
  const str = String(raw).trim().toLowerCase();

  if (/math[eé]matique|maths?|algebre|geometrie|mathematics|math|calcul|رياضيات|حساب/i.test(str)) return 'Mathématiques';
  if (/langue\s*et\s*litt[eé]rature|fran[cç]ais|arabe\s*a|litt[eé]rature|langue\s*a|language\s*and\s*literature|french|arabic|لغة\s*و?أدب|لغة\s*عربية|اللغة\s*العربية|لغة\s*أ/i.test(str)) return 'Langue et littérature';
  if (/acquisition\s*de\s*langues?|anglais|english|langue\s*b|espagnol|allemand|langue\s*[eé]trang[eè]re|language\s*acquisition|spanish|german|اكتساب\s*اللغات?|لغة\s*ثانية|إنجليزي|انجليزي|لغة\s*ب/i.test(str)) return 'Acquisition de langues';
  if (/individus?\s*et\s*soci[eé]t[eé]s?|histoire|g[eé]ographie|hist-g[eé]o|h&g|sciences?\s*humaines?|sciences?\s*sociales?|individuals\s*and\s*societies|social\s*studies|geography|history|أفراد\s*ومجتمعات|تاريخ|جغرافيا|دراسات\s*اجتماعية/i.test(str)) return 'Individus et sociétés';
  if (/sciences?|physique|chimie|biologie|svt|sciences?\s*int[eé]gr[eé]es?|physics|chemistry|biology|science|علوم|فيزياء|كيمياء|أحياء|علوم\s*متكاملة/i.test(str)) return 'Sciences';
  if (/arts?|arts?\s*visuels?|musique|th[eé][aâ]tre|dessin|arts?\s*plastiques?|visual\s*arts|music|drama|فنون|فنون\s*بصرية|موسيقى|مسرح|رسم/i.test(str)) return 'Arts';
  if (/design|technologie|informatique|conception|robotique|num[eé]rique|technology|computer\s*science|tice|تصميم|تكنولوجيا|حاسب\s*آلي|معلوماتية/i.test(str)) return 'Design';
  if (/[eé]ducation\s*physique|eps|sport|sant[eé]|physical\s*and\s*health|phe|physical\s*education|تربية\s*بدنية\s*وصحية|رياضة|تربية\s*رياضية/i.test(str)) return 'Éducation physique et à la santé';

  const exact = SUBJECTS.find(s => s.toLowerCase() === str);
  if (exact) return exact;

  return String(raw).trim() || 'Mathématiques';
};

// ─── Clé normalisée pour extraction tolérante ───────────────────────────────
export const cleanKey = (k: string): string => {
  return k
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '');
};

export const getRowValue = (row: any, aliases: string[]): any => {
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
// COMPARAISON & DÉDOUBLONNAGE INTELLIGENT SÉCURISÉ (AUCUNE PERTE D'UNITÉ)
// ─────────────────────────────────────────────────────────────────────────────
export const normalizeTextForComparison = (str: string | undefined | null): string => {
  if (!str) return '';
  return String(str)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0600-\u06FF]/g, '')
    .trim();
};

/**
 * Détermine si deux plans d'unité représentent exactement la même unité pédagogique.
 * Ne fusionne QUE si l'ID est identique ou si (Matière + Classe + Titre exact) sont identiques.
 * Deux unités avec des titres différents ne sont JAMAIS fusionnées.
 */
export const isSameUnitPlan = (a: UnitPlan, b: UnitPlan): boolean => {
  if (!a || !b) return false;

  // 1. Même identifiant strict non-vide
  if (a.id && b.id && String(a.id).trim() === String(b.id).trim()) return true;

  const subjA = normalizeSubject(a.subject);
  const subjB = normalizeSubject(b.subject);
  const gradeA = normalizeGrade(a.gradeLevel);
  const gradeB = normalizeGrade(b.gradeLevel);

  // Doivent impérativement appartenir à la même matière et au même niveau
  if (subjA !== subjB || gradeA !== gradeB) {
    return false;
  }

  // 2. Titre normalisé identique (non vide)
  const normTitleA = normalizeTextForComparison(a.title);
  const normTitleB = normalizeTextForComparison(b.title);
  if (normTitleA && normTitleB && normTitleA === normTitleB) {
    return true;
  }

  return false;
};

/**
 * Fusionne une liste entrante dans une liste existante en REMPLAÇANT
 * les unités strictement identiques sans créer de doublons.
 */
export const mergePlansWithReplacement = (
  existingList: UnitPlan[],
  incomingList: UnitPlan[]
): UnitPlan[] => {
  const result: UnitPlan[] = [...existingList];

  for (const incoming of incomingList) {
    if (!incoming) continue;
    const matchIdx = result.findIndex(existing => isSameUnitPlan(existing, incoming));

    if (matchIdx !== -1) {
      const existingId = result[matchIdx].id;
      result[matchIdx] = {
        ...incoming,
        id: existingId || incoming.id,
      };
    } else {
      result.push(incoming);
    }
  }

  return result;
};

/**
 * Dédoublonne un tableau de plans en remplaçant les doublons stricts
 */
export const deduplicatePlans = (plans: UnitPlan[]): UnitPlan[] => {
  return mergePlansWithReplacement([], plans);
};

// ─── Dédoublonnage Interdisciplinaire ───────────────────────────────────────
export const isSameInterdisciplinary = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const gradeA = normalizeGrade(a.grade);
  const gradeB = normalizeGrade(b.grade);
  if (gradeA !== gradeB) return false;
  const titleA = normalizeTextForComparison(a.title || a.themeTitle);
  const titleB = normalizeTextForComparison(b.title || b.themeTitle);
  return Boolean(titleA && titleB && titleA === titleB);
};

export const mergeInterWithReplacement = (existingList: any[], incomingList: any[]): any[] => {
  const result = [...existingList];
  for (const incoming of incomingList) {
    if (!incoming) continue;
    const matchIdx = result.findIndex(e => isSameInterdisciplinary(e, incoming));
    if (matchIdx !== -1) {
      result[matchIdx] = { ...incoming, id: result[matchIdx].id || incoming.id };
    } else {
      result.push(incoming);
    }
  }
  return result;
};

// ─── Dédoublonnage Service et Action (SEA) ──────────────────────────────────
export const isSameSEA = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const gradeA = normalizeGrade(a.grade);
  const gradeB = normalizeGrade(b.grade);
  if (gradeA !== gradeB) return false;
  const titleA = normalizeTextForComparison(a.projectTitle || a.title);
  const titleB = normalizeTextForComparison(b.projectTitle || b.title);
  return Boolean(titleA && titleB && titleA === titleB);
};

export const mergeSEAWithReplacement = (existingList: any[], incomingList: any[]): any[] => {
  const result = [...existingList];
  for (const incoming of incomingList) {
    if (!incoming) continue;
    const matchIdx = result.findIndex(e => isSameSEA(e, incoming));
    if (matchIdx !== -1) {
      result[matchIdx] = { ...incoming, id: result[matchIdx].id || incoming.id };
    } else {
      result.push(incoming);
    }
  }
  return result;
};

// ─── Dédoublonnage Enseignants / Utilisateurs ───────────────────────────────
export const isSameUser = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  const userA = normalizeTextForComparison(a.username);
  const userB = normalizeTextForComparison(b.username);
  if (userA && userB && userA === userB) return true;
  const dispA = normalizeTextForComparison(a.displayName);
  const dispB = normalizeTextForComparison(b.displayName);
  return Boolean(dispA && dispB && dispA === dispB);
};

export const mergeUsersWithReplacement = (existingList: any[], incomingList: any[]): any[] => {
  const result = [...existingList];
  for (const incoming of incomingList) {
    if (!incoming) continue;
    const matchIdx = result.findIndex(e => isSameUser(e, incoming));
    if (matchIdx !== -1) {
      result[matchIdx] = { ...incoming, id: result[matchIdx].id || incoming.id };
    } else {
      result.push(incoming);
    }
  }
  return result;
};

// ─── Dédoublonnage Examens ──────────────────────────────────────────────────
export const isSameExam = (a: any, b: any): boolean => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return true;
  const gradeA = normalizeGrade(a.grade);
  const gradeB = normalizeGrade(b.grade);
  const subjA = normalizeSubject(a.subject);
  const subjB = normalizeSubject(b.subject);
  if (gradeA !== gradeB || subjA !== subjB) return false;
  const titleA = normalizeTextForComparison(a.title);
  const titleB = normalizeTextForComparison(b.title);
  return Boolean(titleA && titleB && titleA === titleB);
};

export const mergeExamsWithReplacement = (existingList: any[], incomingList: any[]): any[] => {
  const result = [...existingList];
  for (const incoming of incomingList) {
    if (!incoming) continue;
    const matchIdx = result.findIndex(e => isSameExam(e, incoming));
    if (matchIdx !== -1) {
      result[matchIdx] = { ...incoming, id: result[matchIdx].id || incoming.id };
    } else {
      result.push(incoming);
    }
  }
  return result;
};

// ─────────────────────────────────────────────────────────────────────────────
// EXTRACTION INTELLIGENTE DES LIGNES DEPUIS UNE FEUILLE EXCEL
// ─────────────────────────────────────────────────────────────────────────────
export const extractRowsFromWorksheet = (ws: XLSX.WorkSheet): Record<string, any>[] => {
  if (!ws) return [];
  
  const standardRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  if (standardRows.length === 0) return [];

  const firstKeys = Object.keys(standardRows[0] || {});
  const hasValidKeys = firstKeys.some(k => {
    const ck = cleanKey(k);
    return ck.includes('titre') || ck.includes('title') || ck.includes('matiere') || ck.includes('subject') ||
      ck.includes('niveau') || ck.includes('grade') || ck.includes('unite') || ck.includes('concept') ||
      ck.includes('fulldatajson') || ck.includes('id') || ck.includes('عنوان') || ck.includes('المادة') || ck.includes('الصف');
  });

  if (hasValidKeys) {
    return standardRows;
  }

  const raw2D: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  if (raw2D.length < 2) return standardRows;

  let bestHeaderIdx = 0;
  let bestScore = -1;

  for (let r = 0; r < Math.min(raw2D.length, 12); r++) {
    const row = raw2D[r];
    if (!Array.isArray(row)) continue;
    let score = 0;
    for (const cell of row) {
      if (!cell) continue;
      const ck = cleanKey(String(cell));
      if (ck.includes('titre') || ck.includes('title') || ck.includes('unite') || ck.includes('theme') || ck.includes('nom') || ck.includes('عنوان')) score += 3;
      if (ck.includes('matiere') || ck.includes('subject') || ck.includes('discipline') || ck.includes('cours') || ck.includes('المادة')) score += 3;
      if (ck.includes('niveau') || ck.includes('grade') || ck.includes('classe') || ck.includes('annee') || ck.includes('الصف')) score += 3;
      if (ck.includes('concept') || ck.includes('contexte') || ck.includes('enonce') || ck.includes('recherche') || ck.includes('atl') || ck.includes('objectifs') || ck.includes('evaluation')) score += 2;
    }
    if (score > bestScore) {
      bestScore = score;
      bestHeaderIdx = r;
    }
  }

  if (bestScore <= 0) {
    return standardRows;
  }

  const headers = raw2D[bestHeaderIdx].map((h: any) => String(h || '').trim());
  const converted: Record<string, any>[] = [];

  for (let r = bestHeaderIdx + 1; r < raw2D.length; r++) {
    const row = raw2D[r];
    if (!Array.isArray(row) || row.every(c => c === '' || c === null || c === undefined)) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) {
        obj[h] = row[idx] !== undefined ? row[idx] : '';
      }
    });
    row.forEach((val, idx) => {
      obj[`col_${idx}`] = val;
    });
    converted.push(obj);
  }

  return converted.length > 0 ? converted : standardRows;
};

// ─────────────────────────────────────────────────────────────────────────────
// PARSER CSV ROBUSTE & UNIVERSEL (DELIMITEURS, GUILLEMETS MULTI-LIGNES, BOM)
// ─────────────────────────────────────────────────────────────────────────────
export const parseCSVToRows = (text: string): string[][] => {
  const cleanText = text.replace(/^\uFEFF/, '');
  
  const sampleLines = cleanText.split(/\r?\n/).slice(0, 8).filter(l => l.trim().length > 0);
  let delimiter = ',';
  let maxCount = 0;
  for (const del of [';', ',', '\t', '|']) {
    let count = 0;
    for (const line of sampleLines) {
      count += (line.split(del).length - 1);
    }
    if (count > maxCount) {
      maxCount = count;
      delimiter = del;
    }
  }

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let inQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const ch = cleanText[i];
    const nextCh = cleanText[i + 1];

    if (ch === '"') {
      if (inQuotes && nextCh === '"') {
        currentCell += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === delimiter && !inQuotes) {
      currentRow.push(currentCell.trim());
      currentCell = '';
    } else if ((ch === '\r' || ch === '\n') && !inQuotes) {
      if (ch === '\r' && nextCh === '\n') {
        i++;
      }
      currentRow.push(currentCell.trim());
      currentCell = '';
      if (currentRow.some(c => c.length > 0)) {
        rows.push(currentRow);
      }
      currentRow = [];
    } else {
      currentCell += ch;
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      rows.push(currentRow);
    }
  }

  return rows;
};

export const convertCSVRowsToObjects = (rows: string[][]): Record<string, any>[] => {
  if (rows.length < 2) return [];

  let headerRowIndex = 0;
  let maxScore = -1;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r];
    let score = 0;
    for (const c of row) {
      const ck = cleanKey(c);
      if (ck.includes('titre') || ck.includes('title') || ck.includes('matiere') || ck.includes('subject') ||
          ck.includes('grade') || ck.includes('niveau') || ck.includes('classe') || ck.includes('unite') ||
          ck.includes('concept') || ck.includes('contexte') || ck.includes('recherche')) {
        score++;
      }
    }
    if (score > maxScore) {
      maxScore = score;
      headerRowIndex = r;
    }
  }

  const headers = rows[headerRowIndex].map(h => h.trim());
  const objects: Record<string, any>[] = [];

  for (let r = headerRowIndex + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row || row.every(c => !c || c.trim() === '')) continue;
    const obj: Record<string, any> = {};
    headers.forEach((h, idx) => {
      if (h) {
        obj[h] = row[idx] !== undefined ? row[idx] : '';
      }
    });
    row.forEach((val, idx) => {
      obj[`col_${idx}`] = val;
    });
    objects.push(obj);
  }

  return objects;
};

// ─────────────────────────────────────────────────────────────────────────────
// PARSEUR UNIVERSEL D'UN PLAN D'UNITÉ DEPUIS UN ROW (EXCEL OU CSV)
// ─────────────────────────────────────────────────────────────────────────────
const parseUnitPlanFromRow = (
  row: any,
  rIdx: number,
  inferredSubject: string,
  inferredGrade: string
): UnitPlan | null => {
  if (!row || typeof row !== 'object') return null;

  // a) Utiliser JSON complet si présent
  const extractedJson = extractFullJson(row);
  if (extractedJson && typeof extractedJson === 'object' && (extractedJson.title || extractedJson.subject || extractedJson.id)) {
    return sanitizeUnitPlan(
      extractedJson,
      extractedJson.subject || inferredSubject || '',
      extractedJson.gradeLevel || inferredGrade || ''
    );
  }

  // b) Extraction tolérante depuis colonnes
  let rawTitle = getRowValue(row, [
    'titre', 'titredeunite', 'title', 'nom', 'nomdeunite', 'intitule', 'unite', 'theme', 'unitepedagogique',
    'nomdelunite', 'titredelunite', 'chapitre', 'module', 'sujet', 'topic', 'unit_title', 'unit title',
    'titre de l\'unité', 'nom de l\'unité', 'titre de l unite', 'nom de l unite',
    'عنوان', 'عنوان الوحدة', 'الوحدة', 'اسم الوحدة', 'الموضوع'
  ]);
  let rawSubject = getRowValue(row, [
    'matiere', 'discipline', 'subject', 'cours', 'matiereprincipale', 'branche', 'domaine', 'groupe',
    'groupematiere', 'matieres', 'disciplines', 'sujet', 'subject_name', 'matière', 'matières',
    'المادة', 'المقرر', 'التخصص', 'المجال'
  ]);
  let rawGrade = getRowValue(row, [
    'niveauclasse', 'niveau', 'classe', 'grade', 'gradelevel', 'annee', 'anneepei', 'pei', 'myp',
    'anneeclasse', 'year', 'level', 'annee_pei', 'année', 'année pei', 'promotion', 'groupe_classe',
    'الصف', 'المستوى', 'السنة', 'المرحلة'
  ]);

  if (!rawTitle) {
    const candidates = Object.entries(row)
      .filter(([k, v]) => !k.startsWith('_full') && typeof v === 'string' && v.trim().length > 0 && v.trim().length < 120);
    if (candidates.length > 0) {
      rawTitle = candidates[0][1];
    }
  }

  const subject = normalizeSubject(rawSubject || inferredSubject || 'Mathématiques');
  const gradeLevel = normalizeGrade(rawGrade || inferredGrade || 'PEI 1');
  const title = String(rawTitle || '').trim() || (rawSubject || rawGrade ? `Unité ${rIdx + 1}` : '');

  if (!title && !rawSubject && !rawGrade) return null;

  const teacherName = String(getRowValue(row, ['enseignant', 'professeur', 'prof', 'teacher', 'nomenseignant', 'auteur', 'author', 'المعلم', 'الأستاذ']) || '').trim();
  const duration = String(getRowValue(row, ['duree', 'duration', 'temps', 'volumehoraire', 'dureetotale', 'المدة']) || '10 heures').trim();
  const schoolYear = String(getRowValue(row, ['anneescolaire', 'annee', 'schoolyear', 'promotion', 'العام الدراسي']) || '2026/2027').trim();
  const numberOfHours = String(getRowValue(row, ['nbheures', 'nombredheures', 'heures', 'heuresprevues', 'hours', 'nbheure', 'عدد الساعات']) || '').trim();
  const numberOfPeriods = String(getRowValue(row, ['nbperiodes', 'nombredeperiodes', 'periodes', 'periods', 'nbseances', 'seances', 'sessions', 'الحصص']) || '').trim();
  const startDate = String(getRowValue(row, ['datedebut', 'startdate', 'debut', 'datecommencement', 'تاريخ البدء']) || '').trim();
  const endDate = String(getRowValue(row, ['datefin', 'enddate', 'fin', 'dateecheance', 'تاريخ الانتهاء']) || '').trim();
  const keyConcept = String(getRowValue(row, ['conceptcle', 'conceptclef', 'keyconcept', 'conceptcentral', 'cle', 'المفهوم الرئيسي']) || '').trim();
  
  const rawRelated = getRowValue(row, ['conceptsconnexes', 'relatedconcepts', 'conceptconnexe', 'connexes', 'conceptsassocies', 'المفاهيم ذات الصلة']);
  const relatedConcepts = typeof rawRelated === 'string'
    ? rawRelated.split(/[,;\n|]/).map(s => s.trim()).filter(Boolean)
    : Array.isArray(rawRelated) ? rawRelated : [];

  const globalContext = String(getRowValue(row, ['contextemondial', 'globalcontext', 'contexte', 'contexteglobal', 'mondial', 'السياق العالمي']) || '').trim();
  const statementOfInquiry = String(getRowValue(row, ['enoncederecherche', 'enonce', 'statementofinquiry', 'soi', 'problematique', 'ideegenerale', 'بيان الاستقصاء']) || '').trim();

  const rawFactual = getRowValue(row, ['questionsfactuelles', 'factuelles', 'factualquestions', 'factual', 'الأسئلة الواقعية']);
  const rawConceptual = getRowValue(row, ['questionsconceptuelles', 'conceptuelles', 'conceptualquestions', 'conceptual', 'الأسئلة المفاهيمية']);
  const rawDebatable = getRowValue(row, ['questionsdebat', 'questionsdebatables', 'debat', 'debatablequestions', 'debatable', 'الأسئلة الجدلية']);

  const inquiryQuestions = {
    factual: typeof rawFactual === 'string' ? rawFactual.split(/[\n|;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawFactual) ? rawFactual : []),
    conceptual: typeof rawConceptual === 'string' ? rawConceptual.split(/[\n|;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawConceptual) ? rawConceptual : []),
    debatable: typeof rawDebatable === 'string' ? rawDebatable.split(/[\n|;]/).map(s => s.trim()).filter(Boolean) : (Array.isArray(rawDebatable) ? rawDebatable : []),
  };

  const rawObj = getRowValue(row, ['objectifsib', 'objectifs', 'criteresib', 'criteres', 'objectives', 'criteria', 'معايير التقييم', 'الأهداف']);
  const objectives = typeof rawObj === 'string'
    ? rawObj.split(/[,;\n|]/).map(s => s.trim()).filter(Boolean)
    : Array.isArray(rawObj) ? rawObj : [];

  const rawAtl = getRowValue(row, ['competencesatl', 'approchesapprentissage', 'atl', 'atlskills', 'competences', 'مهارات أساليب التعلم']);
  const atlSkills = typeof rawAtl === 'string'
    ? rawAtl.split(/[\n;|]/).map(s => s.trim()).filter(Boolean)
    : Array.isArray(rawAtl) ? rawAtl : [];

  const content = String(getRowValue(row, ['contenunotions', 'contenu', 'notions', 'savoirs', 'connaissances', 'content', 'programme', 'المحتوى']) || '').trim();
  const learningExperiences = String(getRowValue(row, ['processusapprentissage', 'experiencesapprentissage', 'activites', 'learningexperiences', 'deroulement', 'خبرات التعلم']) || '').trim();
  const formativeAssessment = String(getRowValue(row, ['evaluationformative', 'evalformative', 'formativeassessment', 'formative', 'التقييم التكويني']) || '').trim();
  const summativeAssessment = String(getRowValue(row, ['evaluationsommative', 'evalsommative', 'summativeassessment', 'summative', 'التقييم الختامي']) || '').trim();
  const differentiation = String(getRowValue(row, ['differenciation', 'differentiation', 'adaptation', 'soutien', 'التمايز']) || '').trim();
  const resources = String(getRowValue(row, ['ressources', 'resources', 'materiel', 'supports', 'المصادر']) || '').trim();
  const prerequisites = String(getRowValue(row, ['prerequis', 'prerequisites', 'prealables']) || '').trim();
  const chapters = String(getRowValue(row, ['chapitres', 'chapters', 'lecons', 'lessons', 'parties']) || '').trim();

  const scoreVal = getRowValue(row, ['scoreib', 'score', 'conformite', 'ibscore']);
  const ibComplianceScore = scoreVal !== undefined && !isNaN(Number(scoreVal)) ? Number(scoreVal) : undefined;

  const refPrior = String(getRowValue(row, ['reflexionavant', 'reflexionprealable', 'avant', 'prior', 'التأمل قبل']) || '').trim();
  const refDuring = String(getRowValue(row, ['reflexionpendant', 'pendant', 'during', 'التأمل خلال']) || '').trim();
  const refAfter = String(getRowValue(row, ['reflexionapres', 'apres', 'after', 'التأمل بعد']) || '').trim();

  const id = String(getRowValue(row, ['idunite', 'id', 'identifier']) || `unit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`);

  return sanitizeUnitPlan({
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

  // b) Compléter avec le localStorage
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
                } as any);
              }
            }
          }
        } catch (_) {}
      }
    }
  }

  const allUnits = deduplicatePlans(Array.from(allUnitsMap.values()));
  onProgress?.('Collecte des unités interdisciplinaires et SEA...', 35);

  let allInter: InterdisciplinaryUnit[] = [];
  try {
    const rawInter = localStorage.getItem('interdisciplinary_units');
    if (rawInter) allInter = mergeInterWithReplacement([], JSON.parse(rawInter));
  } catch (_) {}

  let allSEA: ServiceActionPlan[] = [];
  try {
    const rawSEA = localStorage.getItem('sea_plans');
    if (rawSEA) allSEA = mergeSEAWithReplacement([], JSON.parse(rawSEA));
  } catch (_) {}

  let allUsers: AppUser[] = [];
  try {
    allUsers = await listUsers();
  } catch (_) {
    try {
      const rawUsers = localStorage.getItem('myp_custom_users');
      if (rawUsers) allUsers = JSON.parse(rawUsers);
    } catch (_) {}
  }

  let allRequests: ModificationRequest[] = [];
  try {
    const rawReq = localStorage.getItem('myp_modification_requests');
    if (rawReq) allRequests = JSON.parse(rawReq);
  } catch (_) {}

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
    const rawCrit = localStorage.getItem('custom_ib_criteria');
    if (rawCrit) allCriteria = JSON.parse(rawCrit);
  } catch (_) {}

  const allCalendars: { grade: string; schoolYear: string; data: any; entriesCount: number }[] = [];
  for (const grade of PEI_GRADES) {
    try {
      const rawCal = localStorage.getItem(`annual_calendar_${grade}`);
      if (rawCal) {
        const calData = JSON.parse(rawCal);
        allCalendars.push({
          grade,
          schoolYear: '2026/2027',
          data: calData,
          entriesCount: Object.keys(calData || {}).length,
        });
      }
    } catch (_) {}
  }

  onProgress?.('Génération du classeur Excel...', 70);
  const wb = XLSX.utils.book_new();

  // ── FEUILLE 1 : Unités PEI ─────────────────────────────────────────────────
  const unitRows = allUnits.map(u => sanitizeRowForExcel({
    'ID': u.id || '',
    'Titre': u.title || '',
    'Matière': u.subject || '',
    'Niveau_Classe': u.gradeLevel || '',
    'Enseignant': u.teacherName || '',
    'Durée': u.duration || '',
    'Année_Scolaire': u.schoolYear || '2026/2027',
    'Nb_Heures': u.numberOfHours || '',
    'Nb_Périodes': u.numberOfPeriods || '',
    'Date_Début': u.startDate || '',
    'Date_Fin': u.endDate || '',
    'Concept_Clé': u.keyConcept || '',
    'Concepts_Connexes': Array.isArray(u.relatedConcepts) ? u.relatedConcepts.join(', ') : (u.relatedConcepts || ''),
    'Contexte_Mondial': u.globalContext || '',
    'Énoncé_Recherche': u.statementOfInquiry || '',
    'Questions_Factuelles': Array.isArray(u.inquiryQuestions?.factual) ? u.inquiryQuestions.factual.join('\n') : '',
    'Questions_Conceptuelles': Array.isArray(u.inquiryQuestions?.conceptual) ? u.inquiryQuestions.conceptual.join('\n') : '',
    'Questions_Débat': Array.isArray(u.inquiryQuestions?.debatable) ? u.inquiryQuestions.debatable.join('\n') : '',
    'Objectifs_IB': Array.isArray(u.objectives) ? u.objectives.join(', ') : (u.objectives || ''),
    'Compétences_ATL': Array.isArray(u.atlSkills) ? u.atlSkills.join('\n') : (u.atlSkills || ''),
    'Contenu_Notions': u.content || '',
    'Processus_Apprentissage': u.learningExperiences || '',
    'Évaluation_Formative': u.formativeAssessment || '',
    'Évaluation_Sommative': u.summativeAssessment || '',
    'Différenciation': u.differentiation || '',
    'Ressources': u.resources || '',
    'Prérequis': u.prerequisites || '',
    'Chapitres': u.chapters || '',
    'Score_IB': u.ibComplianceScore !== undefined ? u.ibComplianceScore : '',
    'Réflexion_Avant': u.reflection?.prior || '',
    'Réflexion_Pendant': u.reflection?.during || '',
    'Réflexion_Après': u.reflection?.after || '',
    ...prepareJsonChunks(u),
  }));

  const wsUnits = XLSX.utils.json_to_sheet(unitRows);
  XLSX.utils.book_append_sheet(wb, wsUnits, 'Unités PEI');

  // ── FEUILLE 2 : Unités Interdisciplinaires ──────────────────────────────────
  const interRows = allInter.map((item: any) => sanitizeRowForExcel({
    'ID': item.id || '',
    'Titre_Thème': item.title || item.themeTitle || '',
    'Niveau_Classe': item.grade || '',
    'Durée': item.duration || '',
    'Matières_Impliquées': Array.isArray(item.disciplines) ? item.disciplines.join(', ') : (Array.isArray(item.subjects) ? item.subjects.join(', ') : ''),
    'Enseignants': Array.isArray(item.teachers) ? item.teachers.join(', ') : '',
    'Concept_Clé': item.keyConcept || '',
    'Contexte_Mondial': item.globalContext || '',
    'Énoncé_Recherche': item.statementOfInquiry || '',
    'Objectifs_Partagés': Array.isArray(item.sharedObjectives) ? item.sharedObjectives.join('\n') : '',
    'Tâche_Sommative': item.summativeTask || item.summativeAssessment || '',
    'Date_Création': item.createdAt || new Date().toISOString(),
    ...prepareJsonChunks(item),
  }));

  const wsInter = XLSX.utils.json_to_sheet(interRows);
  XLSX.utils.book_append_sheet(wb, wsInter, 'Interdisciplinaire');

  // ── FEUILLE 3 : Service et Action (SEA) ────────────────────────────────────
  const seaRows = allSEA.map((item: any) => sanitizeRowForExcel({
    'ID': item.id || '',
    'Titre_Projet': item.title || item.projectTitle || '',
    'Niveau_Classe': item.grade || '',
    'Matière_Source': item.subject || '',
    'Enseignant_Responsable': item.teacherName || item.supervisor || '',
    'Types_Action': Array.isArray(item.actionTypes) ? item.actionTypes.join(', ') : (item.serviceType || ''),
    'Besoin_Communautaire': item.communityNeed || '',
    'Description': item.projectDescription || '',
    'Lien_Unite': item.linkToUnit || '',
    'Objectifs_IB': Array.isArray(item.learningOutcomes) ? item.learningOutcomes.map((o: any) => o.text).join('\n') : '',
    'Compétences_ATL': Array.isArray(item.atlSkills) ? item.atlSkills.join('\n') : '',
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
// EXPORT COMPLET EN FORMAT CSV (.CSV) AVEC BOM UTF-8
// ─────────────────────────────────────────────────────────────────────────────
export const exportAllDataToCSV = async (
  onProgress?: (step: string, percent: number) => void
): Promise<Blob> => {
  onProgress?.('Collecte des planifications pour export CSV...', 20);

  const allUnitsMap = new Map<string, UnitPlan>();

  for (const grade of PEI_GRADES) {
    try {
      const gradePlans = await loadAllPlansForGrade(grade);
      for (const p of gradePlans) {
        const uniqueKey = `${p.subject}_${p.gradeLevel}_${p.title}`.toLowerCase();
        allUnitsMap.set(p.id || uniqueKey, p);
      }
    } catch (_) {}
  }

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

  const allUnits = deduplicatePlans(Array.from(allUnitsMap.values()));
  onProgress?.('Formatage du fichier CSV...', 60);

  const escapeCSV = (val: any): string => {
    if (val === null || val === undefined) return '""';
    const str = String(val).replace(/"/g, '""');
    return `"${str}"`;
  };

  const headers = [
    'ID',
    'Titre',
    'Matiere',
    'Niveau_Classe',
    'Enseignant',
    'Duree',
    'Annee_Scolaire',
    'Nombre_Heures',
    'Nombre_Periodes',
    'Date_Debut',
    'Date_Fin',
    'Concept_Cle',
    'Concepts_Connexes',
    'Contexte_Mondial',
    'Enonce_Recherche',
    'Questions_Factuelles',
    'Questions_Conceptuelles',
    'Questions_Debat',
    'Objectifs_IB',
    'Competences_ATL',
    'Contenu_Notions',
    'Processus_Apprentissage',
    'Evaluation_Formative',
    'Evaluation_Sommative',
    'Differenciation',
    'Ressources',
    'Prerequis',
    'Chapitres',
    'Score_IB',
    'Reflexion_Avant',
    'Reflexion_Pendant',
    'Reflexion_Apres',
    '_full_data_json',
  ];

  const csvRows: string[] = [];
  csvRows.push(headers.map(escapeCSV).join(';'));

  for (const u of allUnits) {
    const row = [
      u.id || '',
      u.title || '',
      u.subject || '',
      u.gradeLevel || '',
      u.teacherName || '',
      u.duration || '',
      u.schoolYear || '2026/2027',
      u.numberOfHours || '',
      u.numberOfPeriods || '',
      u.startDate || '',
      u.endDate || '',
      u.keyConcept || '',
      Array.isArray(u.relatedConcepts) ? u.relatedConcepts.join(', ') : (u.relatedConcepts || ''),
      u.globalContext || '',
      u.statementOfInquiry || '',
      Array.isArray(u.inquiryQuestions?.factual) ? u.inquiryQuestions.factual.join('\n') : '',
      Array.isArray(u.inquiryQuestions?.conceptual) ? u.inquiryQuestions.conceptual.join('\n') : '',
      Array.isArray(u.inquiryQuestions?.debatable) ? u.inquiryQuestions.debatable.join('\n') : '',
      Array.isArray(u.objectives) ? u.objectives.join(', ') : (u.objectives || ''),
      Array.isArray(u.atlSkills) ? u.atlSkills.join('\n') : (u.atlSkills || ''),
      u.content || '',
      u.learningExperiences || '',
      u.formativeAssessment || '',
      u.summativeAssessment || '',
      u.differentiation || '',
      u.resources || '',
      u.prerequisites || '',
      u.chapters || '',
      u.ibComplianceScore !== undefined ? String(u.ibComplianceScore) : '',
      u.reflection?.prior || '',
      u.reflection?.during || '',
      u.reflection?.after || '',
      JSON.stringify(u),
    ];
    csvRows.push(row.map(escapeCSV).join(';'));
  }

  const csvContent = '\uFEFF' + csvRows.join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });

  onProgress?.('Téléchargement du CSV...', 100);
  return blob;
};

// ─────────────────────────────────────────────────────────────────────────────
// TÉLÉCHARGEMENT DIRECT DE LA SAUVEGARDE CSV
// ─────────────────────────────────────────────────────────────────────────────
export const downloadCompleteCSVBackup = async (
  onProgress?: (step: string, percent: number) => void
): Promise<void> => {
  try {
    const blob = await exportAllDataToCSV(onProgress);
    const dateStr = new Date().toISOString().slice(0, 10);
    const fileName = `Planifications_PEI_AlKawthar_${dateStr}.csv`;
    saveAs(blob, fileName);
  } catch (error: any) {
    console.error('Erreur export CSV:', error);
    alert(`Erreur lors de l'exportation CSV : ${error?.message || error}`);
  }
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
// IMPORTATION DÉDIÉE DEPUIS UN FICHIER CSV (.CSV)
// ─────────────────────────────────────────────────────────────────────────────
export const importAllDataFromCSV = async (
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
    onProgress?.('Lecture du fichier CSV...', 10);
    const text = await file.text();
    if (!text || !text.trim()) {
      throw new Error('Le fichier CSV est vide.');
    }

    const rows2D = parseCSVToRows(text);
    if (rows2D.length < 2) {
      throw new Error('Le fichier CSV doit contenir au moins 1 ligne d\'entête et 1 ligne de données.');
    }

    const objects = convertCSVRowsToObjects(rows2D);
    onProgress?.(`Analyse de ${objects.length} lignes CSV...`, 25);

    const groupedPlans: Record<string, { subject: string; grade: string; plans: UnitPlan[] }> = {};
    let lastKnownSubject = 'Mathématiques';
    let lastKnownGrade = 'PEI 1';

    for (let rIdx = 0; rIdx < objects.length; rIdx++) {
      const row = objects[rIdx];
      const plan = parseUnitPlanFromRow(row, rIdx, lastKnownSubject, lastKnownGrade);

      if (plan && plan.subject && plan.gradeLevel) {
        lastKnownSubject = plan.subject;
        lastKnownGrade = plan.gradeLevel;

        const groupKey = `${plan.subject}_${plan.gradeLevel}`;
        if (!groupedPlans[groupKey]) {
          groupedPlans[groupKey] = {
            subject: plan.subject,
            grade: plan.gradeLevel,
            plans: [],
          };
        }
        groupedPlans[groupKey].plans = mergePlansWithReplacement(groupedPlans[groupKey].plans, [plan]);
      }
    }

    onProgress?.('Nettoyage et réinitialisation de la base de données...', 50);

    // 1. Réinitialiser la collection MongoDB
    try {
      await fetch('/api/planifications?all=true', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'admin',
        },
      });
    } catch (err) {
      console.warn('Note: Réinitialisation MongoDB avant import CSV:', err);
    }

    // 2. Nettoyer les anciens caches individuels localStorage
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('plans_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}

    // 3. Enregistrer les plans
    const newSharedPlans: Record<string, UnitPlan[]> = {};
    let totalUnits = 0;

    for (const groupKey of Object.keys(groupedPlans)) {
      const { subject, grade, plans } = groupedPlans[groupKey];
      const finalPlansList = deduplicatePlans(plans);
      totalUnits += finalPlansList.length;

      newSharedPlans[groupKey] = finalPlansList;

      try {
        const localKey = `plans_${subject}_${grade}`;
        localStorage.setItem(localKey, JSON.stringify(finalPlansList));
      } catch (_) {}

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

    stats.units = totalUnits;

    try {
      localStorage.setItem('myp_shared_planifications', JSON.stringify(newSharedPlans));
    } catch (_) {}

    try {
      window.dispatchEvent(new CustomEvent('planifications_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (_) {}

    onProgress?.('Importation CSV terminée avec succès !', 100);

    return {
      success: true,
      message: `Import CSV réussi : ${totalUnits} unité(s) PEI importée(s) et synchronisée(s) !`,
      stats,
    };
  } catch (error: any) {
    console.error('Erreur import CSV:', error);
    return {
      success: false,
      message: error?.message || 'Erreur lors de la lecture du fichier CSV.',
      stats,
    };
  }
};

// ─────────────────────────────────────────────────────────────────────────────
// IMPORTATION & RESTAURATION COMPLÈTE DEPUIS EXCEL (.XLSX, .XLS, .CSV)
// ─────────────────────────────────────────────────────────────────────────────
export const importAllDataFromExcel = async (
  file: File,
  onProgress?: (step: string, percent: number) => void
): Promise<ImportResult> => {
  if (file.name.toLowerCase().endsWith('.csv')) {
    return importAllDataFromCSV(file, onProgress);
  }

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
        sheetCategories.units.push(sheetName);
      }
    }

    // ── 1. RESTAURER TOUTES LES UNITÉS PEI SUR TOUTES LES FEUILLES CONCERNÉES ──
    const groupedPlans: Record<string, { subject: string; grade: string; plans: UnitPlan[] }> = {};

    for (const sheetName of sheetCategories.units) {
      onProgress?.(`Lecture de la feuille "${sheetName}"...`, 25);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      
      const rawRows = extractRowsFromWorksheet(ws);

      const inferredGradeFromSheet = normalizeGrade(sheetName);
      const inferredSubjectFromSheet = normalizeSubject(sheetName);
      const isSheetGradeName = /pei|myp|6[eè]|5[eè]|4[eè]|3[eè]|2nde|سادس|سابع|ثامن|تاسع|عاشر/i.test(sheetName);
      const isSheetSubjectName = SUBJECTS.some(s => s.toLowerCase() === sheetName.toLowerCase().trim());

      let lastKnownSubjectInSheet = isSheetSubjectName ? inferredSubjectFromSheet : 'Mathématiques';
      let lastKnownGradeInSheet = isSheetGradeName ? inferredGradeFromSheet : 'PEI 1';

      for (let rIdx = 0; rIdx < rawRows.length; rIdx++) {
        const row = rawRows[rIdx];
        const plan = parseUnitPlanFromRow(
          row,
          rIdx,
          lastKnownSubjectInSheet,
          lastKnownGradeInSheet
        );

        if (plan && plan.subject && plan.gradeLevel) {
          lastKnownSubjectInSheet = plan.subject;
          lastKnownGradeInSheet = plan.gradeLevel;

          const groupKey = `${plan.subject}_${plan.gradeLevel}`;
          if (!groupedPlans[groupKey]) {
            groupedPlans[groupKey] = {
              subject: plan.subject,
              grade: plan.gradeLevel,
              plans: [],
            };
          }
          groupedPlans[groupKey].plans = mergePlansWithReplacement(groupedPlans[groupKey].plans, [plan]);
        }
      }
    }

    // ── Enregistrer les unités vers MongoDB ET tous les caches localStorage ──
    onProgress?.('Nettoyage et réinitialisation des anciennes planifications...', 45);

    // 1. Réinitialiser la collection MongoDB pour repartir sur une base propre
    try {
      await fetch('/api/planifications?all=true', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'X-User-Role': 'admin',
        },
      });
    } catch (err) {
      console.warn('Note: Réinitialisation MongoDB avant import:', err);
    }

    // 2. Nettoyer les anciens caches individuels localStorage (plans_*)
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('plans_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch (_) {}

    // 3. Préparer le nouveau dictionnaire de planifications partagées
    const newSharedPlans: Record<string, UnitPlan[]> = {};
    let totalRestoredUnits = 0;

    for (const groupKey of Object.keys(groupedPlans)) {
      const { subject, grade, plans } = groupedPlans[groupKey];
      const finalPlansList = deduplicatePlans(plans);
      totalRestoredUnits += finalPlansList.length;

      newSharedPlans[groupKey] = finalPlansList;

      try {
        const localKey = `plans_${subject}_${grade}`;
        localStorage.setItem(localKey, JSON.stringify(finalPlansList));
      } catch (_) {}

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

    stats.units = totalRestoredUnits;

    try {
      localStorage.setItem('myp_shared_planifications', JSON.stringify(newSharedPlans));
    } catch (_) {}

    // ── 2. RESTAURER LES UNITÉS INTERDISCIPLINAIRES ──────────────────────────
    for (const sheetName of sheetCategories.inter) {
      onProgress?.('Restauration des unités interdisciplinaires...', 65);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows = extractRowsFromWorksheet(ws);
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
          localStorage.setItem('interdisciplinary_units', JSON.stringify(restoredInter));
        } catch (_) {}
      }
    }

    // ── 3. RESTAURER SERVICE ET ACTION (SEA) ─────────────────────────────────
    for (const sheetName of sheetCategories.sea) {
      onProgress?.('Restauration de Service & Action...', 75);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows = extractRowsFromWorksheet(ws);
      const restoredSEA: any[] = [];

      for (const row of rawRows) {
        let item: any = extractFullJson(row);
        if (!item) {
          const projectTitle = String(getRowValue(row, ['titreprojet', 'titre', 'projet', 'title']) || '').trim();
          const grade = normalizeGrade(getRowValue(row, ['niveauclasse', 'niveau', 'classe', 'grade']));
          if (projectTitle) {
            const rawAtl = getRowValue(row, ['competencesatl', 'atl', 'atlskills']);
            const rawOutcomes = getRowValue(row, ['objectifsib', 'objectifs', 'learningoutcomes']);
            const rawCriteria = getRowValue(row, ['criteresreussite', 'criteres', 'successcriteria']);
            const rawTypes = getRowValue(row, ['typesaction', 'actiontypes', 'typeservice', 'type']);

            item = {
              id: String(getRowValue(row, ['id', 'idprojet']) || `sea_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
              grade,
              subject: normalizeSubject(getRowValue(row, ['matieresource', 'matiere', 'subject'])),
              teacherName: String(getRowValue(row, ['enseignantresponsable', 'responsable', 'enseignant', 'teachername']) || '').trim(),
              sourceUnitTitle: String(getRowValue(row, ['titreunitesource', 'sourceunittitle', 'unite']) || '').trim(),
              sourceUnitId: '',
              title: projectTitle,
              actionTypes: typeof rawTypes === 'string' ? rawTypes.split(/[,;\n]/).map(t => t.trim()).filter(Boolean) : ['Direct'],
              projectDescription: String(getRowValue(row, ['description', 'descriptionprojet']) || '').trim(),
              communityNeed: String(getRowValue(row, ['besoincommunautaire', 'besoin', 'communityneed']) || '').trim(),
              linkToUnit: String(getRowValue(row, ['lienunite', 'linktounit', 'lien']) || '').trim(),
              learningOutcomes: typeof rawOutcomes === 'string'
                ? rawOutcomes.split(/[\n;]/).map((t, idx) => ({ id: idx + 1, text: t.trim(), selected: true })).filter(o => o.text)
                : [],
              atlSkills: typeof rawAtl === 'string' ? rawAtl.split(/[\n;]/).map(s => s.trim()).filter(Boolean) : [],
              journalEntries: [],
              reflectionPrompts: [],
              successCriteria: typeof rawCriteria === 'string'
                ? rawCriteria.split(/[\n;]/).map(d => ({ description: d.trim() })).filter(c => c.description)
                : [],
              globalContext: String(getRowValue(row, ['contextemondial', 'globalcontext']) || '').trim(),
              keyConcept: String(getRowValue(row, ['conceptcle', 'conceptclef', 'keyconcept']) || '').trim(),
              createdAt: String(getRowValue(row, ['datecreation', 'createdat']) || new Date().toISOString()),
            };
          }
        }
        if (item) {
          restoredSEA.push(item);
          stats.sea++;
        }
      }

      if (restoredSEA.length > 0) {
        try {
          localStorage.setItem('sea_plans', JSON.stringify(restoredSEA));
        } catch (_) {}
      }
    }

    // ── 4. RESTAURER LES UTILISATEURS / ENSEIGNANTS ──────────────────────────
    for (const sheetName of sheetCategories.users) {
      onProgress?.('Restauration des enseignants...', 85);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows = extractRowsFromWorksheet(ws);
      const restoredUsers: AppUser[] = [];

      for (const row of rawRows) {
        let user: AppUser | null = extractFullJson(row);
        if (!user) {
          const username = String(getRowValue(row, ['nomutilisateur', 'username', 'user', 'login', 'identifiant']) || '').trim();
          const displayName = String(getRowValue(row, ['nomcomplet', 'displayname', 'nom', 'name', 'nomenseignant']) || '').trim();
          if (username) {
            const rawSubj = getRowValue(row, ['matieresattribuees', 'matieres', 'subjects']);
            const subjects = typeof rawSubj === 'string'
              ? rawSubj.split(/[,;\n]/).map(s => s.trim()).filter(Boolean)
              : (Array.isArray(rawSubj) ? rawSubj : []);

            user = {
              id: String(getRowValue(row, ['id']) || `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`),
              username,
              displayName: displayName || username,
              role: (getRowValue(row, ['role', 'statut']) || 'teacher') as any,
              subjects: subjects.length > 0 ? subjects : ['Mathématiques'],
            };
          }
        }
        if (user && user.username) {
          restoredUsers.push(user);
          stats.users++;
        }
      }

      if (restoredUsers.length > 0) {
        try {
          const existingUsers: AppUser[] = JSON.parse(localStorage.getItem('myp_custom_users') || '[]');
          const mergedUsers = mergeUsersWithReplacement(existingUsers, restoredUsers);
          localStorage.setItem('myp_custom_users', JSON.stringify(mergedUsers));
        } catch (_) {}
      }
    }

    // ── 5. RESTAURER LES EXAMENS ─────────────────────────────────────────────
    for (const sheetName of sheetCategories.exams) {
      onProgress?.('Restauration des examens...', 90);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows = extractRowsFromWorksheet(ws);
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
              questions: [],
              resources: [],
              createdAt: new Date(),
              updatedAt: new Date(),
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
          localStorage.setItem('saved_exams', JSON.stringify(restoredExams));
        } catch (_) {}
      }
    }

    // ── 6. RESTAURER LES CALENDRIERS ANNUELS ──────────────────────────────────
    for (const sheetName of sheetCategories.calendars) {
      onProgress?.('Restauration des calendriers...', 94);
      const ws = wb.Sheets[sheetName];
      if (!ws) continue;
      const rawRows = extractRowsFromWorksheet(ws);
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
      const rawRows = extractRowsFromWorksheet(ws);
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

    // Déclencher des événements globaux pour forcer la mise à jour immédiate
    try {
      window.dispatchEvent(new CustomEvent('planifications_updated'));
      window.dispatchEvent(new Event('storage'));
    } catch (_) {}

    onProgress?.('Restauration terminée avec succès !', 100);

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
