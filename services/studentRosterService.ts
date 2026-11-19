import { ClassStudent, IndividualAccessCode } from '../types';
import {
  getEvaluations,
  createOrUpdateEvaluation,
  applyMatriculeReplacementsToLocalEvaluationCache,
} from './onlineEvaluationService';

const LOCAL_STORAGE_KEY = 'alkawthar_class_students_v1';
const LOCAL_BOOKLETS_KEY = 'alkawthar_student_booklets_v1';

export interface MatriculeReplacement {
  studentId?: string;
  studentName?: string;
  grade?: string;
  oldMatricule: string;
  newMatricule: string;
}

// Normaliser un numéro de matricule pour une comparaison stricte (insensible à la casse et aux espaces)
export function normalizeMatricule(matricule?: string): string {
  return (matricule || '').trim().toUpperCase();
}

function normalizeMatCompact(matricule?: string): string {
  return (matricule || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
}

function normalizeNameKey(name?: string): string {
  return String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// Normaliser le nom de la classe (ex: "PEI1" -> "PEI 1", "PEI 1 (6ème)" -> "PEI 1")
export function normalizeGradeLabel(grade: string): string {
  if (!grade) return 'PEI 1';
  const m = grade.match(/PEI\s*([1-5])/i);
  if (m) return `PEI ${m[1]}`;
  return grade.trim();
}

/**
 * Extrait l'identifiant unique (file ID) d'un lien Google Drive
 */
export function extractGoogleDriveId(url?: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const driveRegex = /(?:drive\.google\.com\/(?:file\/(?:u\/\d+\/)?d\/|open\?.*?id=|uc\?.*?id=|thumbnail\?.*?id=)|lh3\.googleusercontent\.com\/d\/|docs\.google\.com\/(?:document|presentation|drawings|spreadsheets)\/d\/)([a-zA-Z0-9_-]{20,})/i;
  const match = trimmed.match(driveRegex);
  if (match && match[1]) return match[1];

  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i);
  if (queryMatch && queryMatch[1]) return queryMatch[1];

  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) return trimmed;
  return null;
}

/**
 * Convertit un lien Google Drive (partage / affichage / fichier) en URL d'image directe intégrable
 */
export function convertGoogleDriveUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('data:image/') || trimmed.startsWith('<svg')) return trimmed;

  const id = extractGoogleDriveId(trimmed);
  if (id) {
    return `https://lh3.googleusercontent.com/d/${id}`;
  }

  return trimmed;
}

/**
 * Retourne l'URL de proxy sécurisée pour les images Google Drive ou externes
 */
export function getProxyImageUrl(url?: string): string {
  if (!url) return '';
  const converted = convertGoogleDriveUrl(url);
  return `/api/image-proxy?url=${encodeURIComponent(converted || url)}`;
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

function deduplicateStudentsList(list: ClassStudent[]): ClassStudent[] {
  const byKey = new Map<string, ClassStudent>();
  for (const stu of list) {
    if (!stu || !stu.name) continue;
    const normGrade = normalizeGradeLabel(stu.grade);
    const cleanStu: ClassStudent = {
      ...stu,
      grade: normGrade,
      name: stu.name.trim(),
      studentNumber: normalizeMatricule(stu.studentNumber),
    };
    const key = `${normGrade}::${normalizeNameKey(cleanStu.name)}`;
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, cleanStu);
    } else {
      byKey.set(key, {
        ...existing,
        ...cleanStu,
        studentNumber: cleanStu.studentNumber || existing.studentNumber,
        birthDate: cleanStu.birthDate || existing.birthDate || '',
        photoUrl: cleanStu.photoUrl || existing.photoUrl || '',
      });
    }
  }
  return Array.from(byKey.values());
}

/**
 * Remplace proprement un ou plusieurs anciens matricules par les nouveaux matricules
 * partout dans l'application :
 * 1. Liste officielle des élèves par classe (serveur + local)
 * 2. Toutes les évaluations en ligne (studentAccessCodes, en conservant l'état utilisé/non utilisé)
 * 3. Toutes les copies déjà soumises ou corrigées (online_submissions)
 * 4. Tous les livrets scolaires (student_booklets)
 */
export async function replaceStudentMatricules(
  replacements: MatriculeReplacement[]
): Promise<{ replacedCount: number }> {
  const validReplacements = (replacements || [])
    .map(r => ({
      studentId: r.studentId,
      studentName: r.studentName?.trim(),
      grade: r.grade ? normalizeGradeLabel(r.grade) : undefined,
      oldMatricule: normalizeMatricule(r.oldMatricule),
      newMatricule: normalizeMatricule(r.newMatricule),
    }))
    .filter(
      r =>
        r.newMatricule &&
        r.oldMatricule &&
        normalizeMatCompact(r.oldMatricule) !== normalizeMatCompact(r.newMatricule)
    );

  if (validReplacements.length === 0) {
    return { replacedCount: 0 };
  }

  // 1. Mettre à jour le cache local des élèves de classe (remplacement en place, sans doublon)
  const localStudents = getLocalStudents();
  let localChanged = false;
  const nextLocalStudents = localStudents.map(stu => {
    const stuCompact = normalizeMatCompact(stu.studentNumber);
    const stuNameKey = normalizeNameKey(stu.name);
    const matched = validReplacements.find(
      r =>
        (r.studentId && stu.id === r.studentId) ||
        normalizeMatCompact(r.oldMatricule) === stuCompact ||
        (r.studentName &&
          normalizeNameKey(r.studentName) === stuNameKey &&
          (!r.grade || normalizeGradeLabel(stu.grade) === r.grade))
    );
    if (matched) {
      localChanged = true;
      return {
        ...stu,
        name: matched.studentName || stu.name,
        studentNumber: matched.newMatricule,
      };
    }
    return stu;
  });
  if (localChanged) {
    saveLocalStudents(deduplicateStudentsList(nextLocalStudents));
  }

  // 2. Mettre à jour le cache local des évaluations et soumissions
  applyMatriculeReplacementsToLocalEvaluationCache(validReplacements);

  // 3. Mettre à jour le cache local des livrets scolaires
  try {
    const rawBooklets = localStorage.getItem(LOCAL_BOOKLETS_KEY);
    if (rawBooklets) {
      const store = JSON.parse(rawBooklets);
      if (store && typeof store === 'object') {
        let bookletsChanged = false;
        Object.keys(store).forEach(k => {
          const b = store[k];
          if (!b) return;
          const bCompact = normalizeMatCompact(b.studentNumber);
          const matched = validReplacements.find(
            r =>
              (r.studentId && b.studentId === r.studentId) ||
              normalizeMatCompact(r.oldMatricule) === bCompact
          );
          if (matched) {
            bookletsChanged = true;
            store[k] = {
              ...b,
              studentNumber: matched.newMatricule,
              studentName: matched.studentName || b.studentName,
            };
          }
        });
        if (bookletsChanged) {
          localStorage.setItem(LOCAL_BOOKLETS_KEY, JSON.stringify(store));
        }
      }
    }
  } catch {}

  // 4. Synchroniser immédiatement sur le serveur (toutes les collections : class_students, online_evaluations, online_submissions, student_booklets)
  await Promise.all([
    fetch('/api/users?entity=students&action=replace_matricules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replacements: validReplacements }),
    }).catch(() => {}),
    fetch('/api/online-evaluations?action=replace_matricules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replacements: validReplacements }),
    }).catch(() => {}),
    fetch('/api/student-booklets?action=replace_matricules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replacements: validReplacements }),
    }).catch(() => {}),
  ]);

  return { replacedCount: validReplacements.length };
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
        const cleanedRemote = deduplicateStudentsList(
          remote
            .filter(s => s && s.name)
            .map(s => ({
              ...s,
              grade: normalizeGradeLabel(s.grade),
              studentNumber: normalizeMatricule(s.studentNumber),
            }))
        );

        // Si on a demandé une classe précise, remplacer uniquement cette classe dans le cache local
        // (évite de ressusciter un ancien matricule supprimé/remplacé depuis un autre navigateur !)
        if (grade) {
          const norm = normalizeGradeLabel(grade);
          const otherGradesLocal = local.filter(s => normalizeGradeLabel(s.grade) !== norm);
          const mergedAll = [...otherGradesLocal, ...cleanedRemote];
          saveLocalStudents(mergedAll);
          return cleanedRemote.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
        }

        // Sinon le serveur fait autorité pour toutes les classes
        saveLocalStudents(cleanedRemote);
        return cleanedRemote.sort((a, b) => a.name.localeCompare(b.name, 'fr'));
      } else if (local.length > 0) {
        // Si le serveur est vide (premier démarrage in-memory), pousser le local
        const toPush = grade
          ? local.filter(s => normalizeGradeLabel(s.grade) === normalizeGradeLabel(grade))
          : local;
        if (toPush.length > 0) {
          fetch('/api/users?entity=students', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ students: toPush, grade: grade ? normalizeGradeLabel(grade) : undefined }),
          }).catch(() => {});
        }
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

  // S'assurer de partir de la liste serveur/locale la plus récente pour détecter tous les changements de matricule
  let latestGradeStudents: ClassStudent[] = [];
  try {
    latestGradeStudents = await fetchAllStudents(normGrade);
  } catch {
    latestGradeStudents = getLocalStudents(normGrade);
  }

  const allLocal = getLocalStudents();
  const otherGrades = allLocal.filter(s => normalizeGradeLabel(s.grade) !== normGrade);
  const existingInGrade = replaceGrade ? [] : [...latestGradeStudents];

  const gradeDigit = normGrade.replace(/[^1-5]/g, '') || '1';
  const prepared: ClassStudent[] = [...existingInGrade];
  const detectedReplacements: MatriculeReplacement[] = [];

  newStudents.forEach((st, idx) => {
    const cleanName = (st.name || '').trim();
    if (!cleanName) return;
    const cleanNameKey = normalizeNameKey(cleanName);

    const existingIdx = prepared.findIndex(
      e =>
        (st.id && e.id === st.id) ||
        normalizeNameKey(e.name) === cleanNameKey
    );

    const seqNum = existingIdx >= 0 ? existingIdx + 1 : prepared.length + 1;
    const autoMatricule = `PEI${gradeDigit}-${String(seqNum).padStart(3, '0')}`;
    const oldNumber = existingIdx >= 0 ? normalizeMatricule(prepared[existingIdx].studentNumber) : '';
    const cleanNumber = normalizeMatricule(st.studentNumber) || oldNumber || autoMatricule;

    const record: ClassStudent = {
      id: st.id || (existingIdx >= 0 ? prepared[existingIdx].id : `stu_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 6)}`),
      name: cleanName,
      studentNumber: cleanNumber,
      grade: normGrade,
      birthDate: st.birthDate !== undefined ? st.birthDate.trim() : (existingIdx >= 0 ? prepared[existingIdx].birthDate || '' : ''),
      photoUrl: convertGoogleDriveUrl(st.photoUrl !== undefined ? st.photoUrl : (existingIdx >= 0 ? prepared[existingIdx].photoUrl || '' : '')),
      createdAt: (existingIdx >= 0 ? prepared[existingIdx].createdAt : undefined) || st.createdAt || new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      if (oldNumber && cleanNumber && normalizeMatCompact(oldNumber) !== normalizeMatCompact(cleanNumber)) {
        detectedReplacements.push({
          studentId: record.id,
          studentName: record.name,
          grade: normGrade,
          oldMatricule: oldNumber,
          newMatricule: cleanNumber,
        });
      }
      prepared[existingIdx] = record;
    } else {
      prepared.push(record);
    }
  });

  // Détecter aussi les changements en mode replaceGrade par correspondance de nom
  if (replaceGrade && latestGradeStudents.length > 0) {
    prepared.forEach(newStu => {
      const prev = latestGradeStudents.find(
        old => old.id === newStu.id || normalizeNameKey(old.name) === normalizeNameKey(newStu.name)
      );
      if (prev && prev.studentNumber && normalizeMatCompact(prev.studentNumber) !== normalizeMatCompact(newStu.studentNumber)) {
        detectedReplacements.push({
          studentId: newStu.id,
          studentName: newStu.name,
          grade: normGrade,
          oldMatricule: normalizeMatricule(prev.studentNumber),
          newMatricule: normalizeMatricule(newStu.studentNumber),
        });
      }
    });
  }

  const sortedGrade = deduplicateStudentsList(prepared).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
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

  // Si un ou plusieurs matricules ont changé, remplacer l'ancien matricule partout (évaluations, copies, livrets)
  if (detectedReplacements.length > 0) {
    await replaceStudentMatricules(detectedReplacements);
  }

  // Synchroniser automatiquement les codes des évaluations existantes de cette classe avec la liste à jour
  // tout en préservant les statuts isUsed / submissionId / allowedRetake des élèves existants
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

/**
 * Met à jour le profil d'un élève (Nom, matricule, date de naissance, photo Drive)
 * et remplace l'ancien matricule par le nouveau partout s'il a été modifié.
 */
export async function updateStudentProfile(
  studentId: string,
  updates: Partial<ClassStudent>
): Promise<ClassStudent | null> {
  const all = getLocalStudents();
  const idx = all.findIndex(s => s.id === studentId);
  if (idx < 0) return null;

  const current = all[idx];
  const oldNumber = normalizeMatricule(current.studentNumber);
  const newNumber = updates.studentNumber !== undefined
    ? normalizeMatricule(updates.studentNumber)
    : oldNumber;

  const updatedStudent: ClassStudent = {
    ...current,
    name: updates.name !== undefined ? updates.name.trim() : current.name,
    studentNumber: newNumber || oldNumber,
    birthDate: updates.birthDate !== undefined ? updates.birthDate.trim() : (current.birthDate || ''),
    photoUrl: updates.photoUrl !== undefined ? convertGoogleDriveUrl(updates.photoUrl) : (current.photoUrl || ''),
    grade: updates.grade ? normalizeGradeLabel(updates.grade) : current.grade,
  };

  all[idx] = updatedStudent;
  saveLocalStudents(all);

  try {
    await fetch('/api/users?entity=students', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        students: [updatedStudent],
        grade: updatedStudent.grade,
        replaceGrade: false,
      }),
    });
  } catch (e) {
    console.warn('Erreur sauvegarde profil élève distant:', e);
  }

  // Si le matricule a été modifié, remplacer l'ancien matricule partout (évaluations, copies, livrets)
  if (oldNumber && updatedStudent.studentNumber && normalizeMatCompact(oldNumber) !== normalizeMatCompact(updatedStudent.studentNumber)) {
    await replaceStudentMatricules([
      {
        studentId: updatedStudent.id,
        studentName: updatedStudent.name,
        grade: updatedStudent.grade,
        oldMatricule: oldNumber,
        newMatricule: updatedStudent.studentNumber,
      },
    ]);
  }

  return updatedStudent;
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
      const expectedMat = normalizeMatricule(stu.studentNumber) || `PEI${gradeDigit}-${String(idx + 1).padStart(3, '0')}`;
      const stuNameKey = normalizeNameKey(stu.name);

      // Vérifier si l'élève avait déjà une entrée dans existingCodes (par matricule ou par nom normalisé)
      const alreadyAssigned = existingCodes.find(
        c =>
          (c.studentNumber && stu.studentNumber && normalizeMatCompact(c.studentNumber) === normalizeMatCompact(stu.studentNumber)) ||
          (c.studentName && normalizeNameKey(c.studentName) === stuNameKey)
      );

      if (alreadyAssigned) {
        // Conserver son historique de passation (isUsed, usedAt, allowedRetake, submissionId) tout en remplaçant son matricule par le nouveau !
        return {
          ...alreadyAssigned,
          code: cleanPrefix,
          studentName: stu.name,
          studentNumber: expectedMat,
          isUsed: Boolean(alreadyAssigned.isUsed),
          allowedRetake: Boolean(alreadyAssigned.allowedRetake),
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

  // Fallback si aucun élève n'est encore enregistré dans cette classe
  const count = Math.max(1, fallbackCount);
  const fallbackCodes: IndividualAccessCode[] = [];
  for (let i = 1; i <= count; i++) {
    const defaultMatricule = `PEI${gradeDigit}-${String(i).padStart(3, '0')}`;
    const existing = existingCodes[i - 1];
    fallbackCodes.push({
      code: cleanPrefix,
      studentName: existing?.studentName || '',
      studentNumber: normalizeMatricule(existing?.studentNumber) || defaultMatricule,
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
