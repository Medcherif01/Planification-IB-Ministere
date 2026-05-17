// ─────────────────────────────────────────────────────────────────────────────
// ibCriteriaService.ts
// Gestion des objectifs spécifiques IB personnalisés par matière + niveau PEI.
//
// Structure stockée :
//   IbCriteriaConfig {
//     subject: string         // ex: "Mathématiques"
//     grade: string           // ex: "PEI 3"
//     criteria: IbCriterion[] // A, B, C, D (ou sous-ensemble) avec strands + grille
//     updatedAt: string       // ISO date
//   }
//
//   IbCriterion {
//     criterion: 'A'|'B'|'C'|'D'
//     criterionName: string
//     maxPoints: number           // toujours 8 en PEI
//     strands: string[]           // ["i. ...", "ii. ...", ...]  (jusqu'à 5)
//     rubricRows: IbRubricRow[]   // niveaux 0, 1-2, 3-4, 5-6, 7-8
//   }
//
//   IbRubricRow {
//     level: string     // "0" | "1-2" | "3-4" | "5-6" | "7-8"
//     descriptor: string
//   }
// ─────────────────────────────────────────────────────────────────────────────

export interface IbRubricRow {
  level: string;
  descriptor: string;
}

export interface IbCriterion {
  criterion: 'A' | 'B' | 'C' | 'D';
  criterionName: string;
  maxPoints: 8;
  strands: string[];      // min 3, max 5 strands
  rubricRows: IbRubricRow[];
}

export interface IbCriteriaConfig {
  subject: string;
  grade: string;
  criteria: IbCriterion[];
  updatedAt: string;
}

// ─── localStorage key helper ───────────────────────────────────────────────
const LS_PREFIX = 'ib_criteria_';

function lsKey(subject: string, grade: string): string {
  return `${LS_PREFIX}${subject.trim()}_${grade.trim()}`;
}

// ─── Default rubric rows used when building a fresh criterion ─────────────
export const DEFAULT_RUBRIC_ROWS: IbRubricRow[] = [
  { level: '0',   descriptor: "L'élève n'atteint pas le niveau décrit par les descripteurs suivants." },
  { level: '1–2', descriptor: "L'élève démontre une compréhension limitée des aspects évalués." },
  { level: '3–4', descriptor: "L'élève démontre une compréhension partielle des aspects évalués." },
  { level: '5–6', descriptor: "L'élève démontre une bonne compréhension des aspects évalués." },
  { level: '7–8', descriptor: "L'élève démontre une compréhension approfondie et nuancée de tous les aspects évalués." },
];

// ─── Standard IB rubric levels (labels only) ──────────────────────────────
export const RUBRIC_LEVELS = ['0', '1–2', '3–4', '5–6', '7–8'];

// ─────────────────────────────────────────────────────────────────────────────
// LOCAL STORAGE — Read / Write
// ─────────────────────────────────────────────────────────────────────────────

export function loadCriteriaFromLocalStorage(
  subject: string,
  grade: string
): IbCriteriaConfig | null {
  try {
    const raw = localStorage.getItem(lsKey(subject, grade));
    if (!raw) return null;
    return JSON.parse(raw) as IbCriteriaConfig;
  } catch {
    return null;
  }
}

export function saveCriteriaToLocalStorage(config: IbCriteriaConfig): void {
  try {
    localStorage.setItem(lsKey(config.subject, config.grade), JSON.stringify(config));
  } catch (e) {
    console.error('Erreur écriture ib_criteria localStorage:', e);
  }
}

export function deleteCriteriaFromLocalStorage(subject: string, grade: string): void {
  try {
    localStorage.removeItem(lsKey(subject, grade));
  } catch {
    // ignore
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// API — MongoDB via /api/ib-criteria
// ─────────────────────────────────────────────────────────────────────────────

const API_BASE_URL =
  process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3000/api';

export async function loadCriteriaFromDatabase(
  subject: string,
  grade: string
): Promise<IbCriteriaConfig | null> {
  try {
    const res = await fetch(
      `${API_BASE_URL}/ib-criteria?subject=${encodeURIComponent(subject)}&grade=${encodeURIComponent(grade)}`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return data.config ?? null;
  } catch (e) {
    console.warn('Fallback localStorage pour ib-criteria:', e);
    return loadCriteriaFromLocalStorage(subject, grade);
  }
}

export async function saveCriteriaToDatabase(config: IbCriteriaConfig): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/ib-criteria`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Also persist locally as backup
    saveCriteriaToLocalStorage(config);
    return true;
  } catch (e) {
    console.error('Erreur sauvegarde ib-criteria vers MongoDB:', e);
    saveCriteriaToLocalStorage(config);
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main public API — load with fallback chain: MongoDB → localStorage → null
// ─────────────────────────────────────────────────────────────────────────────

export async function loadCriteria(
  subject: string,
  grade: string
): Promise<IbCriteriaConfig | null> {
  // 1. Try localStorage first (instant, no network cost)
  const local = loadCriteriaFromLocalStorage(subject, grade);
  if (local) return local;
  // 2. Try MongoDB
  return loadCriteriaFromDatabase(subject, grade);
}

export async function saveCriteria(config: IbCriteriaConfig): Promise<void> {
  const stamped: IbCriteriaConfig = { ...config, updatedAt: new Date().toISOString() };
  saveCriteriaToLocalStorage(stamped); // instant
  await saveCriteriaToDatabase(stamped); // async, best-effort
}

// ─────────────────────────────────────────────────────────────────────────────
// Synchronous reader used inside geminiService (no async needed there since
// we cache to localStorage on save; generation always happens after the editor
// has been saved at least once).
// ─────────────────────────────────────────────────────────────────────────────

export function getCriteriaSync(subject: string, grade: string): IbCriteriaConfig | null {
  return loadCriteriaFromLocalStorage(subject, grade);
}

// ─────────────────────────────────────────────────────────────────────────────
// Build a compact textual summary of custom criteria for injection in prompts
// ─────────────────────────────────────────────────────────────────────────────
export function buildCriteriaSummaryForPrompt(config: IbCriteriaConfig): string {
  const lines: string[] = [
    `OBJECTIFS SPÉCIFIQUES IB OFFICIELS pour ${config.subject} — ${config.grade} (saisis par l'enseignant) :`,
    'Ces critères DOIVENT être utilisés EXACTEMENT dans la génération des évaluations critériées.',
    '',
  ];
  for (const c of config.criteria) {
    lines.push(`Critère ${c.criterion} — ${c.criterionName} (/${c.maxPoints}):`);
    c.strands.forEach(s => lines.push(`  ${s}`));
    if (c.rubricRows && c.rubricRows.length > 0) {
      lines.push('  Grille de notation :');
      c.rubricRows.forEach(r => lines.push(`    [${r.level}] : ${r.descriptor}`));
    }
    lines.push('');
  }
  return lines.join('\n');
}
