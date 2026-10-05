import { ClassStudent, IndividualAccessCode } from '../types';
import { getEvaluations, createOrUpdateEvaluation } from './onlineEvaluationService';

const LOCAL_STORAGE_KEY = 'alkawthar_class_students_v1';

// Normaliser un numéro de matricule pour une comparaison stricte (insensible à la casse et aux espaces)
export function normalizeMatricule(matricule?: string): string {
  return (matricule || '').trim().toUpperCase();
}

// Normaliser le nom de la classe (ex: "PEI1" -> "PEI 1", "PEI 1 (6ème)" -> "PEI 1")
export function normalizeGradeLabel(grade: string): string {
  if (!grade) return 'PEI 1';
  const m = grade.match(/PEI\s*([1-5])/i);
  if (m) return `PEI ${m[1]}`;
  return grade.trim();
}

export function getLocalStudents(grade?: string): ClassStudent[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_KEY);
    const list: ClassStudent[] = raw ? JSON.parse(raw) : [];
    if (!grade) return list;
    const norm = normalizeGradeLabel(grade);
    return list
      .filter(s => normalizeGradeLabel(s.grade) === norm)
      .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  } catch {
    return [];
  }
}

function saveLocalStudents(list: ClassStudent[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(list));
  } catch (e) {
    console.warn('Impossible de sauvegarder les élèves dans localStorage:', e);
  }
}

export async function fetchAllStudents(grade?: string): Promise<ClassStudent[]> {
  const local = getLocalStudents();
  try {
    const url = grade
      ? `/api/users?entity=students&grade=${encodeURIComponent(normalizeGradeLabel(grade))}`
      : `/api/users?entity=students`;
    const res = await fetch(url);
    if (res.ok) {
      const remote: ClassStudent[] = await res.json();
      if (Array.isArray(remote) && remote.length > 0) {
        // Fusionner remote et local sans perdre d'élèves locaux
        const mergedMap = new Map<string, ClassStudent>();
        local.forEach(s => mergedMap.set(s.id, s));
        remote.forEach(s => {
          if (s && s.name) {
            mergedMap.set(s.id, {
              ...s,
              grade: normalizeGradeLabel(s.grade),
            });
          }
        });
        const allMerged = Array.from(mergedMap.values());
        saveLocalStudents(allMerged);

        // Si des élèves locaux n'étaient pas encore sur le serveur, les synchroniser en tâche de fond
        if (allMerged.length > remote.length) {
          fetch('/api/users?entity=students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: allMerged }),
          }).catch(() => {});
        }

        if (grade) {
          const norm = normalizeGradeLabel(grade);
          return allMerged
            .filter(s => normalizeGradeLabel(s.grade) === norm)
            .sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        }
        return allMerged.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      } else if (local.length > 0) {
        // Pousser le local vers le serveur
        fetch('/api/users?entity=students', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ students: local }),
        }).catch(() => {});
      }
    }
  } catch {
    // Fallback local
  }
  return grade ? getLocalStudents(grade) : local;
}

export async function saveStudentsForGrade(
  newStudents: Partial<ClassStudent>[],
  grade: string,
  replaceGrade: boolean = false
): Promise<ClassStudent[]> {
  const normGrade = normalizeGradeLabel(grade);
  const allLocal = getLocalStudents();
  const otherGrades = allLocal.filter(s => normalizeGradeLabel(s.grade) !== normGrade);
  const existingInGrade = replaceGrade
    ? []
    : allLocal.filter(s => normalizeGradeLabel(s.grade) === normGrade);

  const gradeDigit = normGrade.replace(/[^1-5]/g, '') || '1';
  const prepared: ClassStudent[] = [...existingInGrade];

  newStudents.forEach((st, idx) => {
    const cleanName = (st.name || '').trim();
    if (!cleanName) return;

    const existingIdx = prepared.findIndex(
      e =>
        (st.id && e.id === st.id) ||
        e.name.toLowerCase() === cleanName.toLowerCase()
    );

    const seqNum = existingIdx >= 0 ? existingIdx + 1 : prepared.length + 1;
    const autoMatricule = `PEI${gradeDigit}-${String(seqNum).padStart(3, '0')}`;
    const cleanNumber = (st.studentNumber || '').trim() || (existingIdx >= 0 ? prepared[existingIdx].studentNumber : autoMatricule);

    const record: ClassStudent = {
      id: st.id || (existingIdx >= 0 ? prepared[existingIdx].id : `stu_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`),
      name: cleanName,
      studentNumber: cleanNumber,
      grade: normGrade,
      createdAt: st.createdAt || new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      prepared[existingIdx] = record;
    } else {
      prepared.push(record);
    }
  });

  const sortedGrade = prepared.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  const updatedAll = [...otherGrades, ...sortedGrade];
  saveLocalStudents(updatedAll);

  try {
    await fetch('/api/users?entity=students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: sortedGrade,
        grade: normGrade,
        replaceGrade: true,
      }),
    });
  } catch {
    // Sauvegardé en local
  }

  // Synchroniser automatiquement les codes des évaluations existantes de cette classe avec les matricules à jour
  try {
    const evals = await getEvaluations();
    const matchingEvals = evals.filter(ev => normalizeGradeLabel(ev.grade) === normGrade);
    for (const ev of matchingEvals) {
      const { codes } = await generateCleanStudentCodesForEvaluation(
        ev.accessCode,
        normGrade,
        ev.studentAccessCodes?.length || 25,
        ev.studentAccessCodes || []
      );
      await createOrUpdateEvaluation({
        ...ev,
        studentAccessCodes: codes,
      });
    }
  } catch (e) {
    console.warn('Synchronisation automatique des codes avec les évaluations:', e);
  }

  return sortedGrade;
}

export async function removeStudentById(studentId: string): Promise<void> {
  const allLocal = getLocalStudents().filter(s => s.id !== studentId);
  saveLocalStudents(allLocal);
  try {
    await fetch(`/api/users?entity=students&id=${encodeURIComponent(studentId)}`, {
      method: 'DELETE',
    });
  } catch {}
}

export async function clearGradeStudents(grade: string): Promise<void> {
  const normGrade = normalizeGradeLabel(grade);
  const remaining = getLocalStudents().filter(s => normalizeGradeLabel(s.grade) !== normGrade);
  saveLocalStudents(remaining);
  try {
    await fetch(`/api/users?entity=students&grade=${encodeURIComponent(normGrade)}`, {
      method: 'DELETE',
    });
  } catch {}
}

// Analyse intelligente d'une liste d'élèves collée par l'administrateur
export function parseBulkStudentText(rawText: string, grade: string, startSeq: number = 1): Partial<ClassStudent>[] {
  const normGrade = normalizeGradeLabel(grade);
  const gradeDigit = normGrade.replace(/[^1-5]/g, '') || '1';
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0);

  const results: Partial<ClassStudent>[] = [];
  lines.forEach((line, idx) => {
    // Retirer une éventuelle numérotation initiale "1. ", "1) ", "- "
    const cleaned = line.replace(/^(?:\d+[\.\)\-\s]+|[\-\•\*]\s+)/, '').trim();
    if (!cleaned) return;

    // Supporter le format "Nom Prénom ; Matricule" ou "Nom Prénom | Matricule" ou "Nom Prénom \t Matricule"
    const parts = cleaned.split(/[;\|\t]+/).map(p => p.trim()).filter(Boolean);
    let name = cleaned;
    let studentNumber = '';

    if (parts.length >= 2) {
      // Déterminer lequel est le matricule (souvent court avec chiffres) et lequel est le nom
      if (/^[A-Z0-9\-_]{2,15}$/i.test(parts[0]) && /\d/.test(parts[0]) && !/\d/.test(parts[1])) {
        studentNumber = parts[0].toUpperCase();
        name = parts.slice(1).join(' ');
      } else {
        name = parts[0];
        studentNumber = parts[1].toUpperCase();
      }
    }

    if (!studentNumber) {
      studentNumber = `PEI${gradeDigit}-${String(startSeq + idx).padStart(3, '0')}`;
    }

    results.push({
      name,
      studentNumber,
      grade: normGrade,
    });
  });

  return results;
}

// Générer automatiquement des codes d'accès propres et nominatifs pour chaque élève de la classe
export async function generateCleanStudentCodesForEvaluation(
  accessCode: string,
  grade: string,
  fallbackCount: number = 25,
  existingCodes: IndividualAccessCode[] = []
): Promise<{ codes: IndividualAccessCode[]; fromClassRoster: boolean; rosterCount: number }> {
  const normGrade = normalizeGradeLabel(grade);
  const gradeDigit = normGrade.replace(/[^1-5]/g, '') || '1';
  const classStudents = await fetchAllStudents(normGrade);
  const cleanPrefix = accessCode.trim().toUpperCase();

  if (classStudents.length > 0) {
    const generated: IndividualAccessCode[] = classStudents.map((stu, idx) => {
      const expectedMat = stu.studentNumber || `PEI${gradeDigit}-${String(idx + 1).padStart(3, '0')}`;
      // Vérifier si l'élève avait déjà un matricule assigné dans existingCodes
      const alreadyAssigned = existingCodes.find(
        c =>
          (c.studentNumber && stu.studentNumber && c.studentNumber.toLowerCase() === stu.studentNumber.toLowerCase()) ||
          (c.studentName && c.studentName.trim().toLowerCase() === stu.name.trim().toLowerCase())
      );

      if (alreadyAssigned) {
        return {
          ...alreadyAssigned,
          code: cleanPrefix,
          studentName: stu.name,
          studentNumber: expectedMat,
        };
      }

      return {
        code: cleanPrefix,
        studentName: stu.name,
        studentNumber: expectedMat,
        isUsed: false,
        allowedRetake: false,
        createdAt: new Date().toISOString(),
      };
    });

    return {
      codes: generated,
      fromClassRoster: true,
      rosterCount: classStudents.length,
    };
  }

  // Fallback si aucun élève n'est encore enregistré dans cette classe : un seul code d'évaluation + un matricule propre obligatoire par élève
  const count = Math.max(1, fallbackCount);
  const fallbackCodes: IndividualAccessCode[] = [];
  for (let i = 1; i <= count; i++) {
    const defaultMatricule = `PEI${gradeDigit}-${String(i).padStart(3, '0')}`;
    const existing = existingCodes[i - 1];
    fallbackCodes.push({
      code: cleanPrefix,
      studentName: existing?.studentName || '',
      studentNumber: existing?.studentNumber?.trim() || defaultMatricule,
      isUsed: existing?.isUsed || false,
      usedAt: existing?.usedAt,
      allowedRetake: existing?.allowedRetake || false,
      createdAt: existing?.createdAt || new Date().toISOString(),
    });
  }

  return {
    codes: fallbackCodes,
    fromClassRoster: false,
    rosterCount: 0,
  };
}
