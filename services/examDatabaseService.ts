import type { Exam } from '../types';

// URL de l'API - en développement local ou en production
const API_BASE_URL = process.env.NODE_ENV === 'production' 
  ? '/api' 
  : 'http://localhost:3000/api';

/**
 * Sauvegarde un examen généré dans MongoDB
 * IMPORTANT: Enregistre le dernier essai de génération (examen + correction)
 */
export async function saveExamToDatabase(exam: Exam): Promise<boolean> {
  try {
    console.log('💾 [DB] Sauvegarde de l\'examen dans MongoDB...', {
      subject: exam.subject,
      grade: exam.grade,
      semester: exam.semester
    });
    
    const response = await fetch(`${API_BASE_URL}/exams`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(exam)
    });

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const result = await response.json();
    console.log('✅ [DB] Examen sauvegardé dans MongoDB:', result);
    
    // Sauvegarder aussi dans localStorage comme backup
    saveExamToLocalStorage(exam);
    
    return true;
  } catch (error) {
    console.error('❌ [DB] Erreur lors de la sauvegarde dans MongoDB:', error);
    
    // Fallback vers localStorage si l'API échoue
    console.warn('⚠️ [DB] Sauvegarde dans localStorage comme fallback');
    saveExamToLocalStorage(exam);
    
    return false;
  }
}

/**
 * Récupère les examens depuis MongoDB
 */
export async function loadExamsFromDatabase(
  subject?: string,
  grade?: string,
  semester?: string
): Promise<Exam[]> {
  try {
    let url = `${API_BASE_URL}/exams?`;
    
    if (subject) url += `subject=${encodeURIComponent(subject)}&`;
    if (grade) url += `grade=${encodeURIComponent(grade)}&`;
    if (semester) url += `semester=${encodeURIComponent(semester)}`;
    
    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Erreur HTTP: ${response.status}`);
    }

    const exams = await response.json();
    return exams || [];
  } catch (error) {
    console.error('❌ [DB] Erreur lors du chargement depuis MongoDB:', error);
    
    // Fallback vers localStorage
    console.warn('⚠️ [DB] Utilisation du localStorage comme fallback');
    return loadExamsFromLocalStorage(subject, grade, semester);
  }
}

/**
 * Récupère le dernier examen généré pour une matière/classe/semestre
 */
export async function loadLastExam(
  subject: string,
  grade: string,
  semester: string
): Promise<Exam | null> {
  try {
    const exams = await loadExamsFromDatabase(subject, grade, semester);
    
    if (exams.length === 0) return null;
    
    // Trier par date de création (le plus récent en premier)
    const sortedExams = exams.sort((a, b) => {
      const dateA = new Date(a.createdAt).getTime();
      const dateB = new Date(b.createdAt).getTime();
      return dateB - dateA;
    });
    
    return sortedExams[0];
  } catch (error) {
    console.error('❌ [DB] Erreur lors du chargement du dernier examen:', error);
    return null;
  }
}

// ===== FALLBACK: localStorage functions =====

const EXAMS_STORAGE_KEY = 'myp_generated_exams';

interface ExamsStorage {
  [key: string]: Exam[];
}

function getExamKey(exam: Exam): string {
  return `${exam.subject}_${exam.grade}_${exam.semester}`;
}

function loadExamsStorage(): ExamsStorage {
  try {
    const saved = localStorage.getItem(EXAMS_STORAGE_KEY);
    if (saved) {
      return JSON.parse(saved);
    }
  } catch (e) {
    console.error("❌ [LocalStorage] Erreur lecture:", e);
  }
  return {};
}

function saveExamsStorage(storage: ExamsStorage): void {
  try {
    const dataString = JSON.stringify(storage);
    localStorage.setItem(EXAMS_STORAGE_KEY, dataString);
  } catch (e: any) {
    console.error("❌ [LocalStorage] Erreur écriture:", e);
    
    // Si quota dépassé, nettoyer le localStorage
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      console.warn("⚠️ [LocalStorage] Quota dépassé - nettoyage en cours...");
      try {
        // Garder seulement les 5 examens les plus récents au lieu de 10
        const cleanedStorage: ExamsStorage = {};
        Object.keys(storage).forEach(key => {
          if (Array.isArray(storage[key])) {
            cleanedStorage[key] = storage[key].slice(0, 5);
          }
        });
        localStorage.setItem(EXAMS_STORAGE_KEY, JSON.stringify(cleanedStorage));
        console.log("✅ [LocalStorage] Nettoyage réussi - 5 examens conservés par clé");
      } catch (cleanError) {
        console.error("❌ [LocalStorage] Impossible de nettoyer:", cleanError);
        // Dernier recours : vider complètement
        localStorage.removeItem(EXAMS_STORAGE_KEY);
        console.warn("⚠️ [LocalStorage] localStorage vidé complètement");
      }
    }
  }
}

function saveExamToLocalStorage(exam: Exam): void {
  try {
    const storage = loadExamsStorage();
    const key = getExamKey(exam);
    
    if (!storage[key]) {
      storage[key] = [];
    }
    
    // Ajouter l'examen en début de liste (le plus récent)
    storage[key].unshift(exam);
    
    // Garder seulement les 5 derniers examens par clé (réduit pour éviter quota exceeded)
    if (storage[key].length > 5) {
      storage[key] = storage[key].slice(0, 5);
    }
    
    saveExamsStorage(storage);
    console.log('✅ [LocalStorage] Examen sauvegardé localement');
  } catch (error) {
    console.error('❌ [LocalStorage] Impossible de sauvegarder:', error);
    // Ne pas propager l'erreur - la sauvegarde localStorage est optionnelle
  }
}

function loadExamsFromLocalStorage(
  subject?: string,
  grade?: string,
  semester?: string
): Exam[] {
  const storage = loadExamsStorage();
  const allExams: Exam[] = [];
  
  Object.keys(storage).forEach(key => {
    const exams = storage[key];
    if (Array.isArray(exams)) {
      // Filtrer selon les critères
      const filtered = exams.filter(exam => {
        if (subject && exam.subject !== subject) return false;
        if (grade && exam.grade !== grade) return false;
        if (semester && exam.semester !== semester) return false;
        return true;
      });
      allExams.push(...filtered);
    }
  });
  
  return allExams;
}
