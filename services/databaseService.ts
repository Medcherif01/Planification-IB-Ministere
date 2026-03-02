import type { UnitPlan } from '../types';

// URL de l'API - en développement local ou en production
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3000/api';

export interface PlanificationData {
  key: string;
  plans: UnitPlan[];
  lastUpdated: string | null;
}

/**
 * Récupère les planifications depuis MongoDB pour une matière/classe
 */
export async function loadPlansFromDatabase(
  subject: string,
  grade: string
): Promise<UnitPlan[]> {
  try {
    // Valider les paramètres avant l'appel API
    const cleanSubject = subject.trim();
    const cleanGrade = grade.trim();
    
    if (!cleanSubject || !cleanGrade || cleanSubject.startsWith('_') || /^[_\s]+$/.test(cleanSubject)) {
      console.warn(`⚠️ Paramètres invalides pour le chargement: subject="${cleanSubject}", grade="${cleanGrade}"`);
      return loadPlansFromLocalStorage(subject, grade);
    }
    
    const response = await fetch(
      `${API_BASE_URL}/planifications?subject=${encodeURIComponent(cleanSubject)}&grade=${encodeURIComponent(cleanGrade)}`
    );

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data: PlanificationData = await response.json();
    return data.plans || [];
  } catch (error) {
    console.error('Erreur lors du chargement depuis MongoDB:', error);
    
    // Fallback vers localStorage si l'API échoue
    console.warn('Utilisation du localStorage comme fallback');
    return loadPlansFromLocalStorage(subject, grade);
  }
}

/**
 * Récupère TOUTES les planifications pour une classe donnée (toutes les matières)
 */
export async function loadAllPlansForGrade(grade: string): Promise<UnitPlan[]> {
  try {
    const response = await fetch(
      `${API_BASE_URL}/planifications?grade=${encodeURIComponent(grade)}`
    );

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const data = await response.json();
    
    // L'API retourne un tableau de planifications
    if (Array.isArray(data)) {
      // Fusionner tous les plans
      const allPlans: UnitPlan[] = [];
      data.forEach((planData: PlanificationData) => {
        if (planData.plans && Array.isArray(planData.plans)) {
          allPlans.push(...planData.plans);
        }
      });
      return allPlans;
    }
    
    return [];
  } catch (error) {
    console.error('Erreur lors du chargement de toutes les planifications:', error);
    
    // Fallback vers localStorage
    console.warn('Utilisation du localStorage comme fallback');
    return loadAllPlansForGradeFromLocalStorage(grade);
  }
}

/**
 * Sauvegarde les planifications dans MongoDB
 */
export async function savePlansToDatabase(
  subject: string,
  grade: string,
  plans: UnitPlan[]
): Promise<boolean> {
  try {
    // Valider les paramètres avant l'appel API
    const cleanSubject = subject.trim();
    const cleanGrade = grade.trim();
    
    if (!cleanSubject || !cleanGrade || cleanSubject.startsWith('_') || /^[_\s]+$/.test(cleanSubject)) {
      console.error(`❌ Paramètres invalides pour la sauvegarde: subject="${cleanSubject}", grade="${cleanGrade}"`);
      return false;
    }
    
    const response = await fetch(`${API_BASE_URL}/planifications`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        subject: cleanSubject,
        grade: cleanGrade,
        plans
      })
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ Planifications sauvegardées dans MongoDB:', result);
    
    // Sauvegarder aussi dans localStorage comme backup
    savePlansToLocalStorage(subject, grade, plans);
    
    return true;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde dans MongoDB:', error);
    
    // Fallback vers localStorage si l'API échoue
    console.warn('Sauvegarde dans localStorage comme fallback');
    savePlansToLocalStorage(subject, grade, plans);
    
    return false;
  }
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
  return allPlanifications[key] || [];
}

function savePlansToLocalStorage(subject: string, grade: string, plans: UnitPlan[]): void {
  const allPlanifications = loadSharedPlanifications();
  const key = getPlanningKey(subject, grade);
  allPlanifications[key] = plans;
  saveSharedPlanifications(allPlanifications);
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
  
  return allPlans;
}

// ===== MIGRATION AUTOMATIQUE localStorage → MongoDB =====

/**
 * Migre automatiquement toutes les planifications de localStorage vers MongoDB
 * Appelé au démarrage de l'application pour synchroniser les données locales
 */
export async function migrateLocalStorageToMongoDB(): Promise<{
  success: boolean;
  migrated: number;
  errors: number;
}> {
  console.log('🔄 Vérification des données localStorage à migrer vers MongoDB...');
  
  const localPlanifications = loadSharedPlanifications();
  const keys = Object.keys(localPlanifications);
  
  if (keys.length === 0) {
    console.log('ℹ️ Aucune donnée localStorage à migrer');
    return { success: true, migrated: 0, errors: 0 };
  }
  
  console.log(`📦 ${keys.length} planification(s) trouvée(s) dans localStorage`);
  
  let migrated = 0;
  let errors = 0;
  
  // Migrer chaque planification
  for (const key of keys) {
    try {
      // Extraire subject et grade depuis la clé (format: "Mathématiques_PEI 3" ou "Acquisition de langues_PEI 5")
      // La clé est construite avec getPlanningKey qui fait: `${subject}_${grade}`
      // Le grade peut contenir un espace (ex: "PEI 3")
      // On cherche le dernier underscore pour séparer subject et grade
      const lastUnderscoreIndex = key.lastIndexOf('_');
      
      if (lastUnderscoreIndex === -1) {
        console.warn(`⚠️ Clé invalide ignorée (pas de _): ${key}`);
        continue;
      }
      
      const subject = key.substring(0, lastUnderscoreIndex).trim(); // Tout avant le dernier _
      const grade = key.substring(lastUnderscoreIndex + 1).trim(); // Tout après le dernier _
      
      // Valider que subject et grade ne sont pas vides ou invalides
      if (!subject || subject.startsWith('_') || !grade) {
        console.warn(`⚠️ Clé invalide ignorée (subject ou grade vide/invalide): "${key}" -> subject="${subject}", grade="${grade}"`);
        continue;
      }
      
      // Vérifier que le subject ne contient que des underscores ou espaces (clé corrompue)
      if (/^[_\s]+$/.test(subject)) {
        console.warn(`⚠️ Clé invalide ignorée (subject ne contient que des underscores/espaces): "${key}"`);
        continue;
      }
      
      const localPlans = localPlanifications[key];
      
      if (!Array.isArray(localPlans) || localPlans.length === 0) {
        console.log(`⏭️ Planification vide ignorée: ${key}`);
        continue;
      }
      
      console.log(`🔄 Migration de ${key} (${localPlans.length} plan(s))...`);
      
      // Vérifier si des données existent déjà dans MongoDB
      const existingPlans = await loadPlansFromDatabase(subject, grade);
      
      if (existingPlans.length > 0) {
        console.log(`ℹ️ ${key} existe déjà dans MongoDB (${existingPlans.length} plan(s)), ignoré`);
        continue;
      }
      
      // Sauvegarder dans MongoDB
      const success = await savePlansToDatabase(subject, grade, localPlans);
      
      if (success) {
        migrated++;
        console.log(`✅ ${key} migré avec succès (${localPlans.length} plan(s))`);
      } else {
        errors++;
        console.error(`❌ Échec de la migration de ${key}`);
      }
      
    } catch (error) {
      errors++;
      console.error(`❌ Erreur lors de la migration de ${key}:`, error);
    }
  }
  
  console.log(`\n📊 Résumé de la migration:`);
  console.log(`   ✅ Migrés: ${migrated}`);
  console.log(`   ❌ Erreurs: ${errors}`);
  console.log(`   ⏭️ Ignorés: ${keys.length - migrated - errors}`);
  
  return {
    success: errors === 0,
    migrated,
    errors
  };
}

/**
 * Vérifie si une migration est nécessaire
 */
export function needsMigration(): boolean {
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
