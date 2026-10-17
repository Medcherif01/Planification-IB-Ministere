import { OnlineEvaluation, StudentSubmission, StudentAnswer, AssessmentData } from '../types';

const API_BASE = '/api/online-evaluations';
const LOCAL_STORAGE_EVALS_KEY = 'ib_online_evaluations_cache';
const LOCAL_STORAGE_SUBS_KEY = 'ib_online_submissions_cache';

// ── Cache local helpers ───────────────────────────────────────────────────────

function getLocalEvaluations(): OnlineEvaluation[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EVALS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalEvaluations(evals: OnlineEvaluation[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_EVALS_KEY, JSON.stringify(evals));
  } catch {}
}

export function getLocalSubmissions(): StudentSubmission[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUBS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalSubmissions(subs: StudentSubmission[]): void {
  try {
    localStorage.setItem(LOCAL_STORAGE_SUBS_KEY, JSON.stringify(subs));
  } catch {}
}

// ── Evaluation Management ────────────────────────────────────────────────────

export async function createOrUpdateEvaluation(
  evaluation: Partial<OnlineEvaluation> & { title: string; subject: string; grade: string; assessments: AssessmentData[] }
): Promise<OnlineEvaluation> {
  const payload = {
    ...evaluation,
    id: evaluation.id || `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accessCode: (evaluation.accessCode || `EVAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
    status: evaluation.status || 'active',
    createdAt: evaluation.createdAt || new Date().toISOString(),
  };

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const saved = data.evaluation as OnlineEvaluation;
      // Sync local storage
      const locals = getLocalEvaluations().filter(e => e.id !== saved.id && e.accessCode !== saved.accessCode);
      locals.unshift(saved);
      saveLocalEvaluations(locals);
      return saved;
    }
  } catch (err) {
    console.warn('[EvaluationService] API non joignable, fallback local:', err);
  }

  // Fallback local
  const locals = getLocalEvaluations().filter(e => e.id !== payload.id && e.accessCode !== payload.accessCode);
  const fullEval = payload as OnlineEvaluation;
  locals.unshift(fullEval);
  saveLocalEvaluations(locals);
  return fullEval;
}

export async function getEvaluations(filter?: {
  subject?: string;
  grade?: string;
  teacherUsername?: string;
}): Promise<OnlineEvaluation[]> {
  try {
    const params = new URLSearchParams();
    if (filter?.subject) params.set('subject', filter.subject);
    if (filter?.grade) params.set('grade', filter.grade);
    if (filter?.teacherUsername) params.set('teacherUsername', filter.teacherUsername);

    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        // Merge with local storage
        saveLocalEvaluations(data);
        return data;
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API non joignable, lecture local:', err);
  }

  let list = getLocalEvaluations();
  if (filter?.subject) list = list.filter(e => e.subject === filter.subject);
  if (filter?.grade) list = list.filter(e => e.grade === filter.grade);
  if (filter?.teacherUsername) list = list.filter(e => e.teacherUsername === filter.teacherUsername);
  return list;
}

export async function getEvaluationByAccessCode(accessCode: string): Promise<OnlineEvaluation | null> {
  const code = accessCode.trim().toUpperCase();
  try {
    const res = await fetch(`${API_BASE}?accessCode=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.accessCode) return data as OnlineEvaluation;
    }
  } catch (err) {
    console.warn('[EvaluationService] API offline, recherche locale pour code:', code);
  }

  const locals = getLocalEvaluations();
  const found = locals.find(e =>
    e.accessCode?.trim().toUpperCase() === code ||
    (e.studentAccessCodes && e.studentAccessCodes.some(sc => sc.code?.trim().toUpperCase() === code))
  );
  return found || null;
}

export async function deleteEvaluation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const locals = getLocalEvaluations().filter(e => e.id !== id);
      saveLocalEvaluations(locals);
      return true;
    }
  } catch (err) {
    console.warn('[EvaluationService] Erreur suppression:', err);
  }

  const locals = getLocalEvaluations().filter(e => e.id !== id);
  saveLocalEvaluations(locals);
  return true;
}

export async function deleteStudentSubmission(
  submissionId: string,
  accessCode?: string,
  studentNumber?: string,
  evaluationId?: string
): Promise<boolean> {
  const normMat = (v: any) => String(v || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
  const cleanCode = (accessCode || '').trim().toUpperCase();
  const cleanNum = (studentNumber || '').trim();
  const normTargetNum = normMat(cleanNum);

  try {
    const params = new URLSearchParams({
      action: 'delete_submission',
      submissionId,
    });
    if (cleanCode) params.set('accessCode', cleanCode);
    if (cleanNum) params.set('studentNumber', cleanNum);
    if (evaluationId) params.set('evalId', evaluationId);

    const res = await fetch(`${API_BASE}?${params.toString()}`, { method: 'DELETE' });
    if (res.ok) {
      const data = await res.json().catch(() => ({}));
      if (data?.updatedEvaluation) {
        const localEvals = getLocalEvaluations();
        const idx = localEvals.findIndex(e => e.id === data.updatedEvaluation.id);
        if (idx !== -1) {
          localEvals[idx] = data.updatedEvaluation;
          saveLocalEvaluations(localEvals);
        }
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] Erreur suppression copie élève:', err);
  }

  // Purger la copie supprimée du stockage local
  const locals = getLocalSubmissions().filter(s => {
    if (s.id === submissionId) return false;
    if (normTargetNum && normMat(s.studentNumber) === normTargetNum) {
      if ((evaluationId && s.evaluationId === evaluationId) || (cleanCode && s.accessCode?.trim().toUpperCase() === cleanCode)) {
        return false;
      }
    }
    return true;
  });
  saveLocalSubmissions(locals);

  // Réouvrir également le matricule dans l'évaluation en cache local
  if (normTargetNum && (evaluationId || cleanCode)) {
    const localEvals = getLocalEvaluations().map(ev => {
      const isMatch = (evaluationId && ev.id === evaluationId) || (cleanCode && ev.accessCode?.trim().toUpperCase() === cleanCode);
      if (!isMatch || !ev.studentAccessCodes) return ev;
      return {
        ...ev,
        studentAccessCodes: ev.studentAccessCodes.map(sc => {
          if (sc.submissionId === submissionId || normMat(sc.studentNumber) === normTargetNum) {
            return {
              ...sc,
              isUsed: false,
              allowedRetake: true,
              usedAt: undefined,
              submissionId: undefined,
            };
          }
          return sc;
        }),
      };
    });
    saveLocalEvaluations(localEvals);
  }

  // Déverrouiller également en local si présent sur cet appareil
  if (cleanCode && cleanNum) {
    try {
      localStorage.removeItem(`ib_locked_${cleanCode}_${cleanNum}`);
      localStorage.removeItem(`draft_eval_${cleanCode}_${cleanNum}`);
      localStorage.removeItem(`timer_${cleanCode}_${cleanNum}`);
    } catch {}
  }

  return true;
}

// ── Student Submissions ──────────────────────────────────────────────────────

export async function submitStudentEvaluation(
  submission: Omit<StudentSubmission, 'id' | 'submittedAt' | 'status'> & { id?: string }
): Promise<StudentSubmission> {
  const payload: StudentSubmission = {
    ...submission,
    id: submission.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    submittedAt: new Date().toISOString(),
    status: 'submitted',
  };

  try {
    const res = await fetch(`${API_BASE}?action=submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json();
      const saved = data.submission as StudentSubmission;
      // Sync local storage
      const locals = getLocalSubmissions().filter(
        s => !(s.evaluationId === saved.evaluationId && s.studentNumber === saved.studentNumber)
      );
      locals.unshift(saved);
      saveLocalSubmissions(locals);
      return saved;
    }
  } catch (err) {
    console.warn('[EvaluationService] API submit offline, fallback local:', err);
  }

  const locals = getLocalSubmissions().filter(
    s => !(s.evaluationId === payload.evaluationId && s.studentNumber === payload.studentNumber)
  );
  locals.unshift(payload);
  saveLocalSubmissions(locals);
  return payload;
}

export async function getSubmissionsForEvaluation(evaluationId: string): Promise<StudentSubmission[]> {
  try {
    const res = await fetch(`${API_BASE}?action=submissions&evalId=${encodeURIComponent(evaluationId)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API offline, recherche submissions locales');
  }

  return getLocalSubmissions().filter(s => s.evaluationId === evaluationId);
}

export async function getAllSubmissions(): Promise<StudentSubmission[]> {
  try {
    const res = await fetch(`${API_BASE}?action=submissions`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data;
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API offline, utilisation cache submissions');
  }
  return getLocalSubmissions();
}

export async function getStudentSubmission(accessCode: string, studentNumber: string, evaluationId?: string): Promise<StudentSubmission | null> {
  const code = accessCode.trim().toUpperCase();
  const num = studentNumber.trim();
  const normNum = num.toLowerCase();

  try {
    const params = new URLSearchParams({
      action: 'student_submission',
      accessCode: code,
      studentNumber: num,
    });
    if (evaluationId) params.set('evalId', evaluationId);

    const res = await fetch(`${API_BASE}?${params.toString()}`);
    if (res.ok) {
      const data = await res.json();
      if (data && data.submission) return data.submission as StudentSubmission;
      // Le serveur répond 200 OK avec submission: null -> aucune copie (ou copie supprimée par l'enseignant)
      const locals = getLocalSubmissions().filter(
        s => !(
          (s.accessCode?.trim().toUpperCase() === code || (evaluationId && s.evaluationId === evaluationId)) &&
          s.studentNumber?.trim().toLowerCase() === normNum
        )
      );
      saveLocalSubmissions(locals);
      try {
        localStorage.removeItem(`ib_locked_${code}_${num}`);
        if (evaluationId) localStorage.removeItem(`ib_locked_${evaluationId}_${num}`);
      } catch {}
      return null;
    }
  } catch (err) {
    console.warn('[EvaluationService] API offline pour student submission');
  }

  const locals = getLocalSubmissions();
  const found = locals.find(
    s => (s.accessCode?.trim().toUpperCase() === code || (evaluationId && s.evaluationId === evaluationId)) &&
         s.studentNumber?.trim().toLowerCase() === normNum
  );
  return found || null;
}

export async function gradeSubmission(
  submissionId: string,
  gradingData: {
    criteriaScores: Record<string, number>;
    totalScore: number;
    overallFeedback: string;
    answers: StudentAnswer[];
    gradedBy: string;
  }
): Promise<StudentSubmission> {
  try {
    const res = await fetch(`${API_BASE}?action=grade`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ submissionId, ...gradingData }),
    });

    if (res.ok) {
      const data = await res.json();
      const updated = data.submission as StudentSubmission;
      const locals = getLocalSubmissions().map(s => s.id === updated.id ? updated : s);
      saveLocalSubmissions(locals);
      return updated;
    }
  } catch (err) {
    console.warn('[EvaluationService] API grade offline, mise à jour locale');
  }

  const locals = getLocalSubmissions();
  const idx = locals.findIndex(s => s.id === submissionId);
  if (idx !== -1) {
    locals[idx] = {
      ...locals[idx],
      ...gradingData,
      status: 'graded',
      gradedAt: new Date().toISOString(),
    };
    saveLocalSubmissions(locals);
    return locals[idx];
  }

  throw new Error('Soumission non trouvée pour correction');
}

// ── AI Automatic Grading (Gemini) ────────────────────────────────────────────

export interface AIGradingResult {
  criteriaScores: Record<string, number>;
  totalScore: number;
  overallFeedback: string;
  strengths: string[];
  areasForImprovement: string[];
  answersGrading: {
    criterion: string;
    exerciseIndex: number;
    suggestedScore: number; // 1-8
    comment: string;
  }[];
}

export async function generateAIGradingWithGemini(
  evaluation: OnlineEvaluation,
  submission: StudentSubmission
): Promise<AIGradingResult> {
  const criteriaData = evaluation.assessments.map(a => ({
    criterion: a.criterion,
    name: a.criterionName,
    maxPoints: a.maxPoints || 8,
    strands: a.strands,
    rubric: a.rubricRows,
  }));

  const studentResponses = submission.answers.map((ans, idx) => ({
    questionIndex: idx + 1,
    criterion: ans.criterion,
    exerciseIndex: ans.exerciseIndex,
    exerciseTitle: ans.exerciseTitle,
    strandReference: ans.criterionReference || '',
    questionText: ans.questionContent,
    studentText: ans.studentResponse || '(Aucune réponse fournie)',
  }));

  const systemInstruction = `Tu es un examinateur expert et bienveillant du Programme d'Éducation Intermédiaire (PEI) du Baccalauréat International (IB).
Ta mission est d'évaluer la copie d'un élève pour une évaluation critériée PEI.

RÈGLES D'ÉVALUATION IB PEI IMPÉRATIVES :
1. Chaque critère (A, B, C, D) est évalué sur l'échelle officielle discrète de 1 à 8 (niveaux 1-2, 3-4, 5-6, 7-8).
2. EXIGENCE MAJEURE - COMMENTAIRE POUR CHAQUE QUESTION SÉPARÉMENT :
   - Tu DOIS impérativement rédiger un commentaire précis, constructif et pédagogique pour CHAQUE question individuelle (champ "comment" dans "answersGrading").
   - Ne donne JAMAIS de commentaire générique. Analyse la réponse exacte de l'élève, pointe les réussites, explique les erreurs de raisonnement ou de calcul, et formule le conseil direct d'amélioration selon le descripteur du critère.
3. EXIGENCE MAJEURE - APPRÉCIATION GÉNÉRALE EN FIN DE CORRECTION :
   - Rédige une appréciation générale complète, chaleureuse et motivante (champ "overallFeedback") qui fait le bilan global de la copie, met en avant l'engagement de l'élève, et synthétise les points forts ("strengths") et les axes de progrès ("areasForImprovement").
4. Sois équitable, rigoureux selon les rubriques PEI et valorisant pour l'élève.

IMPORTANT : Tu DOIS répondre UNIQUEMENT en format JSON valide, sans aucun texte autour, selon le schéma demandé.`;

  const prompt = `Voici l'évaluation critériée PEI et les réponses de l'élève à corriger :

TITRE : ${evaluation.title}
MATIÈRE : ${evaluation.subject}
NIVEAU : ${evaluation.grade}
ÉNONCÉ DE RECHERCHE : ${evaluation.statementOfInquiry || 'Non spécifié'}
CONTEXTE MONDIAL : ${evaluation.globalContext || 'Non spécifié'}
CONCEPT CLÉ : ${evaluation.keyConcept || 'Non spécifié'}

CRITÈRES ET RUBRIQUES OFFICIELLES DU PEI :
${JSON.stringify(criteriaData, null, 2)}

COPIE DE L'ÉLÈVE (${submission.studentName} - N° d'inscription : ${submission.studentNumber}) :
${JSON.stringify(studentResponses, null, 2)}

Réponds en JSON STRICT avec la structure exacte suivante :
{
  "criteriaScores": {
    ${criteriaData.map(c => `"${c.criterion}": <nombre entre 1 et 8>`).join(',\n    ')}
  },
  "overallFeedback": "<Bilan général et appréciation générale complète, détaillée et bienveillante en français à la fin de la copie>",
  "strengths": [
    "<Point fort 1 constaté dans la copie>",
    "<Point fort 2 constaté dans la copie>"
  ],
  "areasForImprovement": [
    "<Axe de progrès 1 pour la prochaine évaluation>",
    "<Axe de progrès 2 pour la prochaine évaluation>"
  ],
  "answersGrading": [
    ${studentResponses.map((r, i) => `{
      "criterion": "${r.criterion}",
      "exerciseIndex": ${r.exerciseIndex},
      "suggestedScore": <nombre entre 1 et 8>,
      "comment": "<Commentaire spécifique, personnalisé et détaillé pour cette question ${i + 1} (${r.exerciseTitle}) analysant la réponse de l'élève>"
    }`).join(',\n    ')}
  ]
}`;

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: prompt,
        systemInstruction,
        generationConfig: {
          temperature: 0.2, // Faible température pour une évaluation constante et rigoureuse
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur serveur ${res.status}`);
    }

    const data = await res.json();
    let text = data.text || '';
    // Nettoyer si des backticks markdown subsistent
    text = text.replace(/```json/g, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(text) as AIGradingResult;

    // Calculer le totalScore
    const total = Object.values(parsed.criteriaScores || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    parsed.totalScore = total;

    return parsed;
  } catch (error: any) {
    console.error('[AI Grading] Erreur lors de la correction automatique:', error);
    throw new Error(`Correction automatique impossible : ${error.message || 'Erreur inconnue'}`);
  }
}
