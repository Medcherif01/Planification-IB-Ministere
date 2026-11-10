import { OnlineEvaluation, StudentSubmission, StudentAnswer, AssessmentData } from '../types';
import { sanitizeExerciseVisualsForDisplay, stripHtmlTags } from './educationalDiagramService';
import { formatProfessionalHtml, autoEnrichAssessmentsWithLabelsAndTrueFalse } from './evaluationAiOptimizerService';

const API_BASE = '/api/online-evaluations';
const LOCAL_STORAGE_EVALS_KEY = 'ib_online_evaluations_cache';
const LOCAL_STORAGE_SUBS_KEY = 'ib_online_submissions_cache';

/**
 * Normalise une évaluation pour garantir :
 * 1) Aucune photo décorative ou hors-sujet : seuls les exercices nécessitant une courbe (Maths, IS, Éco, Sciences),
 *    une figure géométrique, un diagramme, un schéma à légender ou une œuvre d'art conservent/reçoivent leur visuel exact.
 * 2) Un HTML propre et structuré sans aucun symbole Markdown brut (**gras**, ###, etc.), avec les mots-clés de consigne en gras.
 * 3) Les questions et sous-questions 1), 2), 3) parfaitement séparées et structurées + ajout automatique d'étiquettes et Vrai/Faux si besoin.
 */
export function normalizeEvaluationForCleanDisplay(evalItem: OnlineEvaluation): OnlineEvaluation {
  if (!evalItem) return evalItem;
  const subject = evalItem.subject || '';
  const unitTitle = evalItem.unitTitle || evalItem.title || '';

  const cleanAssessments = (evalItem.assessments || []).map(crit => ({
    ...crit,
    criterionName: stripHtmlTags(crit.criterionName || ''),
    strands: (crit.strands || []).map(s => stripHtmlTags(s)),
    rubricRows: (crit.rubricRows || []).map(r => ({
      ...r,
      descriptor: stripHtmlTags(r.descriptor || ''),
    })),
    exercises: (crit.exercises || []).map(ex => {
      const subQuestionsText = (ex.subQuestions || [])
        .map(sq => stripHtmlTags(sq.content || ''))
        .join(' ');
      const sanitizedVisual = sanitizeExerciseVisualsForDisplay({
        subject,
        unitTitle,
        exerciseTitle: ex.title || '',
        exerciseContent: ex.content || '',
        subQuestionsText,
        imageUrl: ex.imageUrl,
        imageCaption: ex.imageCaption,
      });
      return {
        ...ex,
        title: stripHtmlTags(ex.title || ''),
        content: formatProfessionalHtml(ex.content || ''),
        imageUrl: sanitizedVisual.imageUrl,
        imageCaption: sanitizedVisual.imageCaption ? stripHtmlTags(sanitizedVisual.imageCaption) : undefined,
        answer: ex.answer ? formatProfessionalHtml(ex.answer) : undefined,
        options: ex.options ? ex.options.map(o => stripHtmlTags(o)) : undefined,
        subQuestions: ex.subQuestions?.map(sq => ({
          ...sq,
          label: stripHtmlTags(sq.label || ''),
          content: formatProfessionalHtml(sq.content || ''),
          strandText: sq.strandText ? stripHtmlTags(sq.strandText) : undefined,
          options: sq.options ? sq.options.map(o => stripHtmlTags(o)) : undefined,
        })),
      };
    }),
  }));

  const structuredAssessments = autoEnrichAssessmentsWithLabelsAndTrueFalse(cleanAssessments, subject, unitTitle);

  return {
    ...evalItem,
    title: stripHtmlTags(evalItem.title || ''),
    unitTitle: evalItem.unitTitle ? stripHtmlTags(evalItem.unitTitle) : undefined,
    statementOfInquiry: evalItem.statementOfInquiry ? stripHtmlTags(evalItem.statementOfInquiry) : undefined,
    assessments: structuredAssessments,
  };
}

// ── Cache local helpers ───────────────────────────────────────────────────────

function getLocalEvaluations(): OnlineEvaluation[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_EVALS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((e): e is OnlineEvaluation => Boolean(e && typeof e === 'object' && (e.id || e.accessCode)))
      .map(normalizeEvaluationForCleanDisplay)
      .filter((e): e is OnlineEvaluation => Boolean(e && typeof e === 'object' && (e.id || e.accessCode)));
  } catch {
    return [];
  }
}

function saveLocalEvaluations(evals: OnlineEvaluation[]): void {
  try {
    const valid = (evals || [])
      .filter((e): e is OnlineEvaluation => Boolean(e && typeof e === 'object' && (e.id || e.accessCode)))
      .map(normalizeEvaluationForCleanDisplay)
      .slice(0, 40);
    localStorage.setItem(LOCAL_STORAGE_EVALS_KEY, JSON.stringify(valid));
  } catch {}
}

export function getLocalSubmissions(): StudentSubmission[] {
  try {
    const raw = localStorage.getItem(LOCAL_STORAGE_SUBS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (s): s is StudentSubmission => Boolean(s && typeof s === 'object' && (s.id || s.evaluationId || s.studentNumber))
    );
  } catch {
    return [];
  }
}

function saveLocalSubmissions(subs: StudentSubmission[]): void {
  try {
    const valid = (subs || [])
      .filter((s): s is StudentSubmission => Boolean(s && typeof s === 'object' && (s.id || s.evaluationId || s.studentNumber)))
      .slice(0, 80);
    localStorage.setItem(LOCAL_STORAGE_SUBS_KEY, JSON.stringify(valid));
  } catch {}
}

// ── Evaluation Management ────────────────────────────────────────────────────

export async function createOrUpdateEvaluation(
  evaluation: Partial<OnlineEvaluation> & { title: string; subject: string; grade: string; assessments: AssessmentData[] }
): Promise<OnlineEvaluation> {
  const rawPayload = {
    ...evaluation,
    id: evaluation.id || `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    accessCode: (evaluation.accessCode || `EVAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase(),
    status: evaluation.status || 'active',
    createdAt: evaluation.createdAt || new Date().toISOString(),
  } as OnlineEvaluation;

  const payload = normalizeEvaluationForCleanDisplay(rawPayload);

  try {
    const res = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      const data = await res.json().catch(() => null);
      const candidate =
        data && typeof data === 'object' && !Array.isArray(data)
          ? (data.evaluation && typeof data.evaluation === 'object' ? data.evaluation : data.id ? data : null)
          : null;
      if (candidate && (candidate.id || candidate.accessCode)) {
        const saved = normalizeEvaluationForCleanDisplay(candidate as OnlineEvaluation);
        const locals = getLocalEvaluations().filter(e => e && e.id !== saved.id && e.accessCode !== saved.accessCode);
        locals.unshift(saved);
        saveLocalEvaluations(locals);
        return saved;
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API non joignable, fallback local:', err);
  }

  // Fallback local
  const locals = getLocalEvaluations().filter(e => e && e.id !== payload.id && e.accessCode !== payload.accessCode);
  const fullEval = payload;
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
        const cleaned = data
          .filter((e): e is OnlineEvaluation => Boolean(e && typeof e === 'object' && (e.id || e.accessCode)))
          .map(normalizeEvaluationForCleanDisplay);
        if (cleaned.length > 0) {
          saveLocalEvaluations(cleaned);
          return cleaned;
        }
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API non joignable, lecture local:', err);
  }

  let list = getLocalEvaluations();
  if (filter?.subject) list = list.filter(e => e && e.subject === filter.subject);
  if (filter?.grade) list = list.filter(e => e && e.grade === filter.grade);
  if (filter?.teacherUsername) list = list.filter(e => e && e.teacherUsername === filter.teacherUsername);
  return list;
}

export async function getEvaluationByAccessCode(accessCode: string): Promise<OnlineEvaluation | null> {
  const code = accessCode.trim().toUpperCase();
  try {
    const res = await fetch(`${API_BASE}?accessCode=${encodeURIComponent(code)}`);
    if (res.ok) {
      const data = await res.json();
      if (data && typeof data === 'object' && !Array.isArray(data) && data.accessCode) {
        return normalizeEvaluationForCleanDisplay(data as OnlineEvaluation);
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API offline, recherche locale pour code:', code);
  }

  const locals = getLocalEvaluations();
  const found = locals.find(e =>
    e && (
      e.accessCode?.trim().toUpperCase() === code ||
      (e.studentAccessCodes && e.studentAccessCodes.some(sc => sc && sc.code?.trim().toUpperCase() === code))
    )
  );
  return found ? normalizeEvaluationForCleanDisplay(found) : null;
}

export async function deleteEvaluation(id: string): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE}?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (res.ok) {
      const locals = getLocalEvaluations().filter(e => e && e.id !== id);
      saveLocalEvaluations(locals);
      return true;
    }
  } catch (err) {
    console.warn('[EvaluationService] Erreur suppression:', err);
  }

  const locals = getLocalEvaluations().filter(e => e && e.id !== id);
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
      if (data?.updatedEvaluation && data.updatedEvaluation.id) {
        const localEvals = getLocalEvaluations();
        const idx = localEvals.findIndex(e => e && e.id === data.updatedEvaluation.id);
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
    if (!s) return false;
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
      if (!ev) return ev;
      const isMatch = (evaluationId && ev.id === evaluationId) || (cleanCode && ev.accessCode?.trim().toUpperCase() === cleanCode);
      if (!isMatch || !ev.studentAccessCodes) return ev;
      return {
        ...ev,
        studentAccessCodes: ev.studentAccessCodes.map(sc => {
          if (sc && (sc.submissionId === submissionId || normMat(sc.studentNumber) === normTargetNum)) {
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
      const data = await res.json().catch(() => null);
      const saved = (data?.submission && typeof data.submission === 'object' ? data.submission : null) as StudentSubmission | null;
      if (saved && saved.id) {
        const locals = getLocalSubmissions().filter(
          s => s && !(s.evaluationId === saved.evaluationId && s.studentNumber === saved.studentNumber)
        );
        locals.unshift(saved);
        saveLocalSubmissions(locals);
        return saved;
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API submit offline, fallback local:', err);
  }

  const locals = getLocalSubmissions().filter(
    s => s && !(s.evaluationId === payload.evaluationId && s.studentNumber === payload.studentNumber)
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
        return data.filter((s): s is StudentSubmission => Boolean(s && typeof s === 'object'));
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API offline, recherche submissions locales');
  }

  return getLocalSubmissions().filter(s => s && s.evaluationId === evaluationId);
}

export async function getAllSubmissions(): Promise<StudentSubmission[]> {
  try {
    const res = await fetch(`${API_BASE}?action=submissions`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data)) {
        return data.filter((s): s is StudentSubmission => Boolean(s && typeof s === 'object'));
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
        s => s && !(
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
    s => s &&
         (s.accessCode?.trim().toUpperCase() === code || (evaluationId && s.evaluationId === evaluationId)) &&
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
      const data = await res.json().catch(() => null);
      const updated = (data?.submission && typeof data.submission === 'object' ? data.submission : null) as StudentSubmission | null;
      if (updated && updated.id) {
        const locals = getLocalSubmissions().map(s => (s && s.id === updated.id ? updated : s));
        saveLocalSubmissions(locals);
        return updated;
      }
    }
  } catch (err) {
    console.warn('[EvaluationService] API grade offline, mise à jour locale');
  }

  const locals = getLocalSubmissions();
  const idx = locals.findIndex(s => s && s.id === submissionId);
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

// ── AI Automatic Grading (Gemini + Repli Intelligent Local PEI) ───────────────

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

/**
 * Construit le texte complet de la réponse d'un élève (incluant les sous-questions 1), 2), 3) éventuelles).
 */
function extractFullStudentResponseText(ans: StudentAnswer): string {
  const parts: string[] = [];
  if (ans.studentResponse && ans.studentResponse.trim()) {
    parts.push(ans.studentResponse.trim());
  }
  if (ans.subAnswers && typeof ans.subAnswers === 'object') {
    const subEntries = Object.entries(ans.subAnswers)
      .map(([k, v]) => {
        const resp = (v?.response || '').trim();
        return resp ? `[${k}] ${resp}` : '';
      })
      .filter(Boolean);
    if (subEntries.length > 0) {
      parts.push(subEntries.join(' | '));
    }
  }
  return parts.join('\n').trim();
}

/**
 * Moteur de correction critériée PEI locale intelligente (fallback instantané si le serveur IA répond 504 ou est hors-ligne).
 * Évalue chaque question selon la nature de l'exercice (QCM, Vrai/Faux, Rédaction/Calculs, Sous-questions) et le barème IB 1-8.
 */
function generateSmartLocalIBGrading(
  evaluation: OnlineEvaluation,
  submission: StudentSubmission
): AIGradingResult {
  const answersGrading: AIGradingResult['answersGrading'] = [];
  const scoresByCriterion: Record<string, number[]> = {};
  let answeredCount = 0;
  let totalQuestions = 0;

  (submission.answers || []).forEach((ans, idx) => {
    totalQuestions++;
    const critObj = (evaluation.assessments || []).find(a => a.criterion === ans.criterion);
    const exObj = critObj?.exercises?.[ans.exerciseIndex];
    const fullStudentText = extractFullStudentResponseText(ans);
    const cleanTitle = stripHtmlTags(ans.exerciseTitle || exObj?.title || `Question ${idx + 1}`);

    if (!scoresByCriterion[ans.criterion]) {
      scoresByCriterion[ans.criterion] = [];
    }

    if (!fullStudentText || fullStudentText === '(Aucune réponse fournie)') {
      const hasDrawing = Boolean(
        ans.drawingDataUrl ||
        (ans.subAnswers && Object.values(ans.subAnswers).some(sa => Boolean(sa?.drawingDataUrl)))
      );
      if (hasDrawing) {
        answeredCount++;
        const score = 5;
        scoresByCriterion[ans.criterion].push(score);
        answersGrading.push({
          criterion: ans.criterion,
          exerciseIndex: ans.exerciseIndex,
          suggestedScore: score,
          comment: `Tracé / schéma fourni pour « ${cleanTitle} ». Pensez à accompagner votre figure d'une justification écrite détaillant votre démarche (Critère ${ans.criterion}).`,
        });
        return;
      }

      scoresByCriterion[ans.criterion].push(1);
      answersGrading.push({
        criterion: ans.criterion,
        exerciseIndex: ans.exerciseIndex,
        suggestedScore: 1,
        comment: `Aucune réponse rédigée pour « ${cleanTitle} ». Veillez à traiter chaque aspect du Critère ${ans.criterion} en mobilisant les notions du cours.`,
      });
      return;
    }

    answeredCount++;

    // Cas 1 : QCM ou Vrai/Faux avec réponse attendue connue
    if ((exObj?.type === 'multiple_choice' || exObj?.type === 'true_false') && exObj.correctAnswer) {
      const expected = stripHtmlTags(exObj.correctAnswer).trim().toLowerCase();
      const given = stripHtmlTags(fullStudentText).trim().toLowerCase();
      const isCorrect = given === expected || given.includes(expected) || expected.includes(given);
      const score = isCorrect ? 8 : 2;
      scoresByCriterion[ans.criterion].push(score);
      answersGrading.push({
        criterion: ans.criterion,
        exerciseIndex: ans.exerciseIndex,
        suggestedScore: score,
        comment: isCorrect
          ? `Excellente réponse pour « ${cleanTitle} » (« ${fullStudentText} »). La notion évaluée au Critère ${ans.criterion} est parfaitement maîtrisée.`
          : `Réponse incorrecte (« ${fullStudentText} »). La proposition attendue était « ${stripHtmlTags(exObj.correctAnswer)} ». Revoyez la définition correspondante du cours.`,
      });
      return;
    }

    // Cas 2 : Question ouverte ou sous-questions — évaluation multicritère de la richesse, structure et précision
    const wordCount = fullStudentText.split(/\s+/).filter(Boolean).length;
    const hasNumbersOrMath = /[0-9=+\-*/^√%()]/.test(fullStudentText);
    const hasReasoningConnectors = /\b(car|parce que|donc|ainsi|or|puisque|on sait que|d'après|selon|permet|implique|conséquence|effet|en effet|conclusion|because|therefore|thus|since|however)\b/i.test(fullStudentText);

    // Vérification de correspondance avec le corrigé type s'il existe
    let keywordOverlapBoost = 0;
    if (exObj?.answer) {
      const expectedWords = stripHtmlTags(exObj.answer)
        .toLowerCase()
        .split(/[^a-zàâçéèêëîïôûùüÿñæœ0-9]+/i)
        .filter(w => w.length >= 4);
      if (expectedWords.length > 0) {
        const lowerStudent = fullStudentText.toLowerCase();
        const matched = expectedWords.filter(w => lowerStudent.includes(w));
        const ratio = matched.length / expectedWords.length;
        if (ratio >= 0.45) keywordOverlapBoost = 2;
        else if (ratio >= 0.2) keywordOverlapBoost = 1;
      }
    }

    let suggestedScore = 4;
    if (wordCount >= 28 && (hasReasoningConnectors || hasNumbersOrMath)) {
      suggestedScore = 7 + Math.min(1, keywordOverlapBoost);
    } else if (wordCount >= 14 || (wordCount >= 6 && hasNumbersOrMath)) {
      suggestedScore = Math.min(8, 5 + keywordOverlapBoost);
    } else if (wordCount >= 5) {
      suggestedScore = Math.min(6, 4 + keywordOverlapBoost);
    } else {
      suggestedScore = 3;
    }

    scoresByCriterion[ans.criterion].push(suggestedScore);

    let comment = '';
    if (suggestedScore >= 7) {
      comment = `Très bonne maîtrise sur « ${cleanTitle} » (Niveau ${suggestedScore}/8). Le raisonnement est structuré, précis et répond aux attentes du Critère ${ans.criterion}.`;
    } else if (suggestedScore >= 5) {
      comment = `Réponse pertinente et satisfaisante pour « ${cleanTitle} » (Niveau ${suggestedScore}/8). Les éléments essentiels sont présents ; développez davantage la justification ou la terminologie disciplinaire pour viser le niveau 7-8.`;
    } else {
      comment = `Éléments de réponse partiels pour « ${cleanTitle} » (Niveau ${suggestedScore}/8). Votre proposition (« ${fullStudentText.slice(0, 80)}${fullStudentText.length > 80 ? '…' : ''} ») doit être approfondie et justifiée étape par étape.`;
    }

    answersGrading.push({
      criterion: ans.criterion,
      exerciseIndex: ans.exerciseIndex,
      suggestedScore,
      comment,
    });
  });

  const criteriaScores: Record<string, number> = {};
  (evaluation.assessments || []).forEach(a => {
    const arr = scoresByCriterion[a.criterion] || [];
    if (arr.length > 0) {
      const avg = arr.reduce((acc, v) => acc + v, 0) / arr.length;
      criteriaScores[a.criterion] = Math.max(1, Math.min(a.maxPoints || 8, Math.round(avg)));
    } else {
      criteriaScores[a.criterion] = 1;
    }
  });

  const totalScore = Object.values(criteriaScores).reduce((sum, val) => sum + (Number(val) || 0), 0);
  const maxPossible = (evaluation.assessments || []).reduce((sum, a) => sum + (a.maxPoints || 8), 0) || 8;
  const ratio = totalScore / maxPossible;

  const strengths: string[] = [];
  const areasForImprovement: string[] = [];

  if (answeredCount === totalQuestions && totalQuestions > 0) {
    strengths.push("L'ensemble des tâches de l'évaluation a été traité avec sérieux.");
  } else if (answeredCount > 0) {
    strengths.push(`Implication démontrée sur ${answeredCount} tâche(s) traitée(s).`);
    areasForImprovement.push("Veiller à gérer le temps afin de répondre à la totalité des questions posées.");
  }

  if (ratio >= 0.7) {
    strengths.push("Bonne maîtrise des concepts clés et de la démarche attendue au PEI.");
    areasForImprovement.push("Poursuivre la précision du vocabulaire technique et l'argumentation détaillée pour consolider l'excellence (niveau 7-8).");
  } else if (ratio >= 0.45) {
    strengths.push("Compréhension globale des notions fondamentales de l'unité.");
    areasForImprovement.push("Structurer chaque réponse en explicitant toutes les étapes du raisonnement et en justifiant à l'aide des données de l'énoncé.");
  } else {
    strengths.push("Participation à l'épreuve et prise de contact avec les objectifs du critère.");
    areasForImprovement.push("Revoir les notions fondamentales de l'unité et s'entraîner à rédiger des réponses complètes et justifiées.");
  }

  const overallFeedback =
    ratio >= 0.7
      ? `Très bon travail d'ensemble de ${submission.studentName} (${totalScore}/${maxPossible}). Les compétences évaluées dans « ${stripHtmlTags(evaluation.title)} » sont bien acquises et les réponses témoignent d'une réflexion solide conforme aux exigences du PEI.`
      : ratio >= 0.45
      ? `Ensemble encourageant de ${submission.studentName} (${totalScore}/${maxPossible}) sur « ${stripHtmlTags(evaluation.title)} ». Les bases sont comprises ; un effort supplémentaire dans la justification détaillée et la rigueur du vocabulaire permettra d'atteindre les niveaux supérieurs.`
      : `Travail encore fragile pour ${submission.studentName} (${totalScore}/${maxPossible}) sur « ${stripHtmlTags(evaluation.title)} ». Il est important de reprendre les exercices travaillés en classe et de détailler systématiquement vos démarches pour progresser.`;

  return {
    criteriaScores,
    totalScore,
    overallFeedback,
    strengths,
    areasForImprovement,
    answersGrading,
  };
}

export async function generateAIGradingWithGemini(
  evaluation: OnlineEvaluation,
  submission: StudentSubmission
): Promise<AIGradingResult> {
  const criteriaData = (evaluation.assessments || []).map(a => ({
    criterion: a.criterion,
    name: stripHtmlTags(a.criterionName),
    maxPoints: a.maxPoints || 8,
    strands: (a.strands || []).map(s => stripHtmlTags(s)),
    rubric: (a.rubricRows || []).map(r => ({
      level: stripHtmlTags(r.level),
      descriptor: stripHtmlTags(r.descriptor),
    })),
  }));

  const studentResponses = (submission.answers || []).map((ans, idx) => {
    const critObj = (evaluation.assessments || []).find(a => a.criterion === ans.criterion);
    const exObj = critObj?.exercises?.[ans.exerciseIndex];
    const fullText = extractFullStudentResponseText(ans);
    return {
      questionIndex: idx + 1,
      criterion: ans.criterion,
      exerciseIndex: ans.exerciseIndex,
      exerciseTitle: stripHtmlTags(ans.exerciseTitle || exObj?.title || `Exercice ${idx + 1}`),
      strandReference: stripHtmlTags(ans.criterionReference || ''),
      questionText: stripHtmlTags(ans.questionContent || exObj?.content || '').slice(0, 600),
      expectedAnswer: exObj?.correctAnswer || (exObj?.answer ? stripHtmlTags(exObj.answer).slice(0, 300) : undefined),
      studentText: fullText || '(Aucune réponse fournie)',
    };
  });

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

TITRE : ${stripHtmlTags(evaluation.title)}
MATIÈRE : ${evaluation.subject}
NIVEAU : ${evaluation.grade}
ÉNONCÉ DE RECHERCHE : ${stripHtmlTags(evaluation.statementOfInquiry || 'Non spécifié')}

CRITÈRES ET RUBRIQUES OFFICIELLES DU PEI :
${JSON.stringify(criteriaData)}

COPIE DE L'ÉLÈVE (${submission.studentName} - Matricule : ${submission.studentNumber}) :
${JSON.stringify(studentResponses)}

Réponds en JSON STRICT avec la structure exacte suivante :
{
  "criteriaScores": {
    ${criteriaData.map(c => `"${c.criterion}": 6`).join(', ')}
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
      "suggestedScore": 6,
      "comment": "<Commentaire spécifique, personnalisé et détaillé pour cette question ${i + 1} (${r.exerciseTitle}) analysant la réponse de l'élève>"
    }`).join(',\n    ')}
  ]
}`;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 24000);

    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: prompt,
        systemInstruction,
        generationConfig: {
          temperature: 0.2,
          responseMimeType: 'application/json',
        },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || `Erreur serveur ${res.status}`);
    }

    const data = await res.json();
    let text = (data.text || '').trim();
    text = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    const firstBrace = text.indexOf('{');
    const lastBrace = text.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      text = text.slice(firstBrace, lastBrace + 1);
    }
    const parsed = JSON.parse(text) as AIGradingResult;

    const total = Object.values(parsed.criteriaScores || {}).reduce((sum, val) => sum + (Number(val) || 0), 0);
    parsed.totalScore = total;

    return parsed;
  } catch (error: any) {
    console.warn('[AI Grading] Basculement automatique sur le moteur de correction critériée PEI local:', error?.message || error);
    return generateSmartLocalIBGrading(evaluation, submission);
  }
}
