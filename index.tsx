import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';

/**
 * Supprime les images bitmap base64 lourdes (> 12 Ko) d'une chaîne JSON
 * tout en préservant les courbes et figures vectorielles SVG (data:image/svg+xml).
 */
function stripHeavyBase64BitmapsFromJson(jsonStr: string): string {
  if (!jsonStr || jsonStr.length < 15000) return jsonStr;
  return jsonStr.replace(
    /"data:image\/(?:png|jpeg|jpg|webp);base64,[A-Za-z0-9+/=]{12000,}"/g,
    '""'
  );
}

/**
 * Compacte immédiatement localStorage pour libérer de l'espace et éviter tout QuotaExceededError.
 */
function compactLocalStorageNow(preserveKey?: string): void {
  try {
    const keysToRemove: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || k === preserveKey) continue;
      // Supprimer les clés dupliquées plans_<matière>_<classe> (déjà stockées dans myp_shared_planifications)
      // ainsi que les anciens brouillons temporaires
      if (k.startsWith('plans_') || k.startsWith('draft_eval_')) {
        keysToRemove.push(k);
      }
    }
    keysToRemove.forEach(k => {
      try { localStorage.removeItem(k); } catch {}
    });

    // Compacter les grandes clés JSON en retirant les bitmaps base64 lourds et les entrées nulles
    const heavyKeys = [
      'myp_shared_planifications',
      'ib_online_evaluations_cache',
      'ib_online_submissions_cache',
      'ib_student_submissions',
      'saved_exams',
    ];
    for (const k of heavyKeys) {
      if (k === preserveKey) continue;
      try {
        const raw = localStorage.getItem(k);
        if (!raw) continue;
        let compacted = stripHeavyBase64BitmapsFromJson(raw);
        if (k === 'ib_online_evaluations_cache' || k === 'ib_online_submissions_cache' || k === 'ib_student_submissions') {
          try {
            const arr = JSON.parse(compacted);
            if (Array.isArray(arr)) {
              const cleanArr = arr.filter(item => item && typeof item === 'object' && (item.id || item.accessCode || item.evaluationId));
              compacted = JSON.stringify(cleanArr.slice(0, 40));
            }
          } catch {}
        }
        if (compacted.length < raw.length) {
          localStorage.removeItem(k);
          localStorage.setItem(k, compacted);
        }
      } catch {}
    }
  } catch {}
}

if (typeof window !== 'undefined') {
  // 1. Compacter localStorage dès le démarrage pour purger les anciens blobs saturés
  compactLocalStorageNow();

  // 2. Sécuriser globalement Storage.prototype.setItem contre QuotaExceededError
  try {
    const nativeSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key: string, value: string) {
      const safeVal = stripHeavyBase64BitmapsFromJson(String(value ?? ''));
      try {
        nativeSetItem.call(this, key, safeVal);
      } catch (err: any) {
        // En cas de dépassement de quota, compacter et réessayer
        compactLocalStorageNow(key);
        try {
          nativeSetItem.call(this, key, safeVal);
        } catch {
          // Ultime recours : si c'est une petite clé critique (currentView, ib_locked_*, session), libérer les caches secondaires
          if (safeVal.length < 5000) {
            try {
              localStorage.removeItem('ib_online_submissions_cache');
              localStorage.removeItem('ib_student_submissions');
              localStorage.removeItem('saved_exams');
              nativeSetItem.call(this, key, safeVal);
            } catch {}
          }
        }
      }
    };
  } catch {}

  (window as any).selectedGrade = (window as any).selectedGrade || '';
  (window as any).currentUserName = (window as any).currentUserName || 'Enseignant';
}

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Une erreur inattendue est survenue">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);