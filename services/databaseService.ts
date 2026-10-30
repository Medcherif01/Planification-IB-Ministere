import type { UnitPlan } from '../types';
import { deduplicatePlans } from './excelBackupService';

// URL de l'API — toujours relative en production (Vercel) pour éviter les problèmes CORS.
// En développement local, pointe vers le serveur vite/vercel dev sur le port 3000.
const API_BASE_URL = (typeof window !== 'undefined')
  ? '/api'  // Navigateur : toujours relatif (fonctionne en prod et en dev avec vercel dev)
  : (process.env.NODE_ENV === 'production' ? '/api' : 'http://localhost:3000/api');

export interface PlanificationData {
  key: string;
  plans: UnitPlan[];
  lastUpdated: string | null;
}

/**
 * Force l'appartenance stricte d'une liste d'unités à une matière et une classe données,
 * et garantit un identifiant unique par unité.
 */
function enforceStrictClassIsolation(plans: UnitPlan[], subject?: string, grade?: string): UnitPlan[] {
  const cleanSubject = subject?.trim();
  const cleanGrade = grade?.trim();
  const usedIds = new Set<string>();

  return (plans || [])
    .filter(p => {
      if (!p) return false;
      if (cleanGrade && p.gradeLevel && p.gradeLevel.trim() !== '' && p.gradeLevel.trim() !== cleanGrade) {
        return false;
      }
      if (cleanSubject && p.subject && p.subject.trim() !== '' && p.subject.trim() !== cleanSubject) {
        return false;
      }
      return true;
    })
    .map((p, idx) => {
      let safeId = String(p.id || '').trim();
      if (!safeId || usedIds.has(safeId) || /^\d{13}$/.test(safeId)) {
        safeId = `unit_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 8)}`;
      }
      usedIds.add(safeId);
      return {
        ...p,
        id: safeId,
        subject: cleanSubject || p.subject,
        gradeLevel: cleanGrade || p.gradeLevel,
      };
    });
}

/**
 * Récupère les planifications depuis MongoDB pour une matière/classe.
 * Si MongoDB répond avec les plans actuels, synchronise immédiatement localStorage
 * pour écraser toute ancienne version locale et éviter qu'elle ne revienne.
 */
export async function loadPlansFromDatabase(
  subject: string,
  grade: string
): Promise<UnitPlan[]> {
  const cleanSubject = subject.trim();
  const cleanGrade = grade.trim();

  try {
    if (!cleanSubject || !cleanGrade || cleanSubject.startsWith('_') || /^[_\s]+$/.test(cleanSubject)) {
      return deduplicatePlans(enforceStrictClassIsolation(loadPlansFromLocalStorage(cleanSubject, cleanGrade), cleanSubject, cleanGrade));
    }
    
    const response = await fetch(
      `${API_BASE_URL}/planifications?subject=${encodeURIComponent(cleanSubject)}&grade=${encodeURIComponent(cleanGrade)}`
    );

    if (!response.ok) {
      return deduplicatePlans(enforceStrictClassIsolation(loadPlansFromLocalStorage(cleanSubject, cleanGrade), cleanSubject, cleanGrade));
    }

    const data: PlanificationData = await response.json();
    const serverPlans = deduplicatePlans(enforceStrictClassIsolation(data.plans || [], cleanSubject, cleanGrade));
    
    // Si le serveur possède un document (même mis à jour récemment), écraser localStorage avec la version serveur
    if (data.lastUpdated || serverPlans.length > 0) {
      savePlansToLocalStorage(cleanSubject, cleanGrade, serverPlans);
      return serverPlans;
    }

    // Si jamais le serveur n'a jamais reçu de document pour cette classe, vérifier localStorage une seule fois
    const localPlans = deduplicatePlans(enforceStrictClassIsolation(loadPlansFromLocalStorage(cleanSubject, cleanGrade), cleanSubject, cleanGrade));
    return localPlans;
  } catch (error) {
    // Fallback vers localStorage si l'API échoue
    return deduplicatePlans(enforceStrictClassIsolation(loadPlansFromLocalStorage(cleanSubject, cleanGrade), cleanSubject, cleanGrade));
  }
}

/**
 * Récupère TOUTES les planifications pour une classe donnée (toutes les matières de cette classe strictement)
 */
export async function loadAllPlansForGrade(grade: string): Promise<UnitPlan[]> {
  const cleanGrade = grade.trim();
  try {
    const response = await fetch(
      `${API_BASE_URL}/planifications?grade=${encodeURIComponent(cleanGrade)}`
    );

    if (!response.ok) {
      return deduplicatePlans(enforceStrictClassIsolation(loadAllPlansForGradeFromLocalStorage(cleanGrade), undefined, cleanGrade));
    }

    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const allPlans: UnitPlan[] = [];
      data.forEach((planData: PlanificationData) => {
        if (planData.plans && Array.isArray(planData.plans)) {
          allPlans.push(...enforceStrictClassIsolation(planData.plans, undefined, cleanGrade));
        }
      });
      if (allPlans.length > 0) return deduplicatePlans(allPlans);
    }
    
    return deduplicatePlans(enforceStrictClassIsolation(loadAllPlansForGradeFromLocalStorage(cleanGrade), undefined, cleanGrade));
  } catch (error) {
    return deduplicatePlans(enforceStrictClassIsolation(loadAllPlansForGradeFromLocalStorage(cleanGrade), undefined, cleanGrade));
  }
}

/**
 * Sauvegarde les planifications dans MongoDB en effaçant intégralement
 * les versions précédentes de cette classe/matière dans localStorage et MongoDB.
 */
export async function savePlansToDatabase(
  subject: string,
  grade: string,
  plans: UnitPlan[]
): Promise<boolean> {
  const cleanSubject = subject.trim();
  const cleanGrade = grade.trim();

  if (!cleanSubject || !cleanGrade || cleanSubject.startsWith('_') || /^[_\s]+$/.test(cleanSubject)) {
    console.error(`❌ Paramètres invalides pour la sauvegarde: subject="${cleanSubject}", grade="${cleanGrade}"`);
    return false;
  }

  const cleanPlans = deduplicatePlans(enforceStrictClassIsolation(plans, cleanSubject, cleanGrade));

  // 1. Écraser immédiatement toutes les versions précédentes dans localStorage
  savePlansToLocalStorage(cleanSubject, cleanGrade, cleanPlans);

  try {
    const response = await fetch(`${API_BASE_URL}/planifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: cleanSubject,
        grade: cleanGrade,
        plans: cleanPlans
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Planifications sauvegardées dans MongoDB (anciennes versions effacées):', result);
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde dans MongoDB:', error);
    return false;
  }
}

/**
 * Récupère TOUTES les planifications d'une matière pour toutes les années PEI (PEI 1 → PEI 5)
 */
export async function loadAllPlansForSubjectAllGrades(
  subject: string
): Promise<Record<string, UnitPlan[]>> {
  const grades = ['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'];
  const result: Record<string, UnitPlan[]> = {};

  for (const grade of grades) {
    try {
      const plans = await loadPlansFromDatabase(subject, grade);
      result[grade] = plans;
    } catch (error) {
      console.warn(`⚠️ Impossible de charger ${subject} - ${grade}:`, error);
      result[grade] = [];
    }
  }

  return result;
}

/**
 * Vérifie si une matière a des plans pour toutes les 5 années PEI
 */
export async function checkSubjectCompletionAllGrades(
  subject: string
): Promise<{ complete: boolean; gradesWithPlans: string[]; gradesMissing: string[] }> {
  const grades = ['PEI 1', 'PEI 2', 'PEI 3', 'PEI 4', 'PEI 5'];
  const gradesWithPlans: string[] = [];
  const gradesMissing: string[] = [];

  for (const grade of grades) {
    try {
      const plans = await loadPlansFromDatabase(subject, grade);
      if (plans && plans.length > 0) {
        gradesWithPlans.push(grade);
      } else {
        gradesMissing.push(grade);
      }
    } catch {
      gradesMissing.push(grade);
    }
  }

  return {
    complete: gradesMissing.length === 0,
    gradesWithPlans,
    gradesMissing,
  };
}

/**
 * Supprime les planifications de MongoDB
 */
export async function deletePlansFromDatabase(
  subject: string,
  grade: string
): Promise<boolean> {
  try {
    // Valider les paramètres avant l'appel API
    const cleanSubject = subject.trim();
    const cleanGrade = grade.trim();
    
    if (!cleanSubject || !cleanGrade || cleanSubject.startsWith('_') || /^[_\s]+$/.test(cleanSubject)) {
      console.warn(`⚠️ Paramètres invalides pour la suppression: subject="${cleanSubject}", grade="${cleanGrade}"`);
      return false;
    }
    
    const response = await fetch(
      `${API_BASE_URL}/planifications?subject=${encodeURIComponent(cleanSubject)}&grade=${encodeURIComponent(cleanGrade)}`,
      { method: 'DELETE' }
    );

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    return true;
  } catch (error) {
    console.error('Erreur lors de la suppression depuis MongoDB:', error);
    return false;
  }
}

// ===== FALLBACK: localStorage functions =====

const SHARED_PLANNINGS_KEY = 'myp_shared_planifications';

interface SharedPlanifications {
  [key: string]: UnitPlan[];
}

function getPlanningKey(subject: string, grade: string): string {
  return `${subject}_${grade}`;
}

function loadSharedPlanifications(): SharedPlanifications {
  try {
    const saved = localStorage.getItem(SHARED_PLANNINGS_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("Erreur lecture localStorage", e);
  }
  return {};
}

function saveSharedPlanifications(planifications: SharedPlanifications): void {
  try {
    localStorage.setItem(SHARED_PLANNINGS_KEY, JSON.stringify(planifications));
  } catch (e) {
    console.error("Erreur écriture localStorage", e);
  }
}

function loadPlansFromLocalStorage(subject: string, grade: string): UnitPlan[] {
  const allPlanifications = loadSharedPlanifications();
  const key = getPlanningKey(subject, grade);
  if (allPlanifications[key] && Array.isArray(allPlanifications[key]) && allPlanifications[key].length > 0) {
    return deduplicatePlans(allPlanifications[key]);
  }
  // Also check individual local storage key
  try {
    const directKey = `plans_${subject}_${grade}`;
    const directData = localStorage.getItem(directKey);
    if (directData) {
      const parsed = JSON.parse(directData);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const clean = deduplicatePlans(parsed);
        // Sync to shared
        allPlanifications[key] = clean;
        saveSharedPlanifications(allPlanifications);
        return clean;
      }
    }
  } catch (_) {}
  return [];
}

function savePlansToLocalStorage(subject: string, grade: string, plans: UnitPlan[]): void {
  const cleanPlans = deduplicatePlans(plans);
  const allPlanifications = loadSharedPlanifications();
  const key = getPlanningKey(subject, grade);
  allPlanifications[key] = cleanPlans;
  saveSharedPlanifications(allPlanifications);
  try {
    const directKey = `plans_${subject}_${grade}`;
    localStorage.setItem(directKey, JSON.stringify(cleanPlans));
  } catch (_) {}
}

function loadAllPlansForGradeFromLocalStorage(grade: string): UnitPlan[] {
  const allPlanifications = loadSharedPlanifications();
  const allPlans: UnitPlan[] = [];
  
  // Parcourir toutes les clés et filtrer par grade
  Object.keys(allPlanifications).forEach(key => {
    if (key.endsWith(`_${grade}`) || key.includes(`_${grade.replace(' ', '_')}`)) {
      const plans = allPlanifications[key];
      if (Array.isArray(plans)) {
        allPlans.push(...plans);
      }
    }
  });
  
  return deduplicatePlans(allPlans);
}

// ===== MIGRATION AUTOMATIQUE localStorage → MongoDB =====

const MIGRATION_COMPLETED_KEY = 'myp_migration_completed_v2';

/**
 * Migre une seule fois les planifications de localStorage vers MongoDB
 * sans jamais écraser les planifications existantes ni réinjecter d'anciennes unités.
 */
export async function migrateLocalStorageToMongoDB(): Promise<{
  success: boolean;
  migrated: number;
  errors: number;
}> {
  if (typeof window !== 'undefined' && localStorage.getItem(MIGRATION_COMPLETED_KEY) === 'true') {
    return { success: true, migrated: 0, errors: 0 };
  }

  const localPlanifications = loadSharedPlanifications();
  const keys = Object.keys(localPlanifications);
  
  if (keys.length === 0) {
    try { localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true'); } catch {}
    return { success: true, migrated: 0, errors: 0 };
  }
  
  let migrated = 0;
  let errors = 0;
  
  for (const key of keys) {
    try {
      const lastUnderscoreIndex = key.lastIndexOf('_');
      if (lastUnderscoreIndex === -1) continue;
      
      const subject = key.substring(0, lastUnderscoreIndex).trim();
      const grade = key.substring(lastUnderscoreIndex + 1).trim();
      
      if (!subject || subject.startsWith('_') || !grade || /^[_\s]+$/.test(subject)) {
        continue;
      }
      
      const localPlans = localPlanifications[key];
      if (!Array.isArray(localPlans) || localPlans.length === 0) continue;
      
      const existingPlans = await loadPlansFromDatabase(subject, grade);
      if (existingPlans.length > 0) continue;
      
      const success = await savePlansToDatabase(subject, grade, localPlans);
      if (success) migrated++;
      else errors++;
    } catch {
      errors++;
    }
  }
  
  try { localStorage.setItem(MIGRATION_COMPLETED_KEY, 'true'); } catch {}
  return {
    success: errors === 0,
    migrated,
    errors
  };
}

/**
 * Vérifie si une migration initiale est nécessaire
 */
export function needsMigration(): boolean {
  try {
    if (localStorage.getItem(MIGRATION_COMPLETED_KEY) === 'true') return false;
  } catch {}
  const localPlanifications = loadSharedPlanifications();
  return Object.keys(localPlanifications).length > 0;
}

/**
 * Nettoie les clés localStorage invalides (celles avec subject vide ou commençant par _)
 * Retourne le nombre de clés supprimées
 */
export function cleanupInvalidLocalStorageKeys(): number {
  console.log('🧹 Nettoyage des clés localStorage invalides...');
  
  const allPlanifications = loadSharedPlanifications();
  const keys = Object.keys(allPlanifications);
  let cleaned = 0;
  
  const validPlanifications: SharedPlanifications = {};
  
  for (const key of keys) {
    const lastUnderscoreIndex = key.lastIndexOf('_');
    
    if (lastUnderscoreIndex === -1) {
      console.log(`🗑️ Suppression de la clé invalide (pas de _): ${key}`);
      cleaned++;
      continue;
    }
    
    const subject = key.substring(0, lastUnderscoreIndex).trim();
    const grade = key.substring(lastUnderscoreIndex + 1).trim();
    
    // Vérifier si la clé est valide
    if (!subject || subject.startsWith('_') || !grade || /^[_\s]+$/.test(subject)) {
      console.log(`🗑️ Suppression de la clé invalide: ${key} (subject="${subject}", grade="${grade}")`);
      cleaned++;
      continue;
    }
    
    // Clé valide, on la garde
    validPlanifications[key] = allPlanifications[key];
  }
  
  if (cleaned > 0) {
    saveSharedPlanifications(validPlanifications);
    console.log(`✅ ${cleaned} clé(s) invalide(s) supprimée(s) de localStorage`);
  } else {
    console.log('✅ Aucune clé invalide trouvée');
  }
  
  return cleaned;
}
