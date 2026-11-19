import { MongoClient, ServerApiVersion } from 'mongodb';
import crypto from 'crypto';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const EVAL_COLLECTION = 'online_evaluations';
const SUB_COLLECTION = 'online_submissions';

const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 30_000;
const SERVER_SELECTION_TIMEOUT_MS = 10_000;
const MONGO_RETRY_COOLDOWN_MS = 10_000;

let cachedClient: MongoClient | null = null;
let connectingPromise: Promise<MongoClient | null> | null = null;
let mongoRetryAfter = 0;
let indexesEnsured = false;

// In-memory fallbacks (utilisés uniquement si MONGO_URL est absent ou temporairement injoignable)
const inMemoryEvaluations: any[] = [];
const inMemorySubmissions: any[] = [];

function normalizeMatStrict(val: any): string {
  return String(val || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
}

function normalizeMatDisplay(val: any): string {
  return String(val || '').trim().toUpperCase();
}

function escapeRegex(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function generateUniqueId(prefix: string): string {
  try {
    if (typeof crypto.randomUUID === 'function') {
      return `${prefix}_${crypto.randomUUID()}`;
    }
  } catch {}
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

function stripMongoInternalFields<T extends Record<string, any>>(doc: T): Omit<T, '_id'> {
  if (!doc || typeof doc !== 'object') return doc;
  const { _id, ...rest } = doc;
  return rest;
}

async function ensureIndexes(client: MongoClient): Promise<void> {
  if (indexesEnsured) return;
  indexesEnsured = true;
  try {
    const db = client.db(DB_NAME);
    const subCol = db.collection(SUB_COLLECTION);
    const evalCol = db.collection(EVAL_COLLECTION);
    await Promise.all([
      subCol.createIndex({ evaluationId: 1, normalizedStudentNumber: 1 }, { background: true }).catch(() => {}),
      subCol.createIndex({ evaluationId: 1, studentNumber: 1 }, { background: true }).catch(() => {}),
      subCol.createIndex({ id: 1 }, { background: true }).catch(() => {}),
      evalCol.createIndex({ id: 1 }, { background: true }).catch(() => {}),
      evalCol.createIndex({ accessCode: 1 }, { background: true }).catch(() => {}),
    ]);
  } catch {
    indexesEnsured = false;
  }
}

/**
 * Connexion MongoDB sécurisée pour forte concurrence :
 * - Une seule promesse partagée (`connectingPromise`) évite les tempêtes de connexions simultanées.
 * - Aucun `ping` par requête ni `cachedClient.close()` brutal qui tuerait les écritures concurrentes.
 * - Reconnexion automatique après un court délai en cas de coupure réseau temporaire.
 */
async function connectToDatabase(): Promise<MongoClient | null> {
  if (!MONGO_URL) return null;
  if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
    return null;
  }

  if (cachedClient) {
    return cachedClient;
  }

  if (Date.now() < mongoRetryAfter) {
    return null;
  }

  if (connectingPromise) {
    return connectingPromise;
  }

  connectingPromise = (async () => {
    try {
      const client = new MongoClient(MONGO_URL, {
        serverApi: {
          version: ServerApiVersion.v1,
          strict: false,
          deprecationErrors: false,
        },
        maxPoolSize: 50,
        minPoolSize: 2,
        maxIdleTimeMS: 60_000,
        connectTimeoutMS: CONNECT_TIMEOUT_MS,
        socketTimeoutMS: SOCKET_TIMEOUT_MS,
        serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
        retryWrites: true,
        retryReads: true,
      });
      await client.connect();
      client.on('topologyClosed', () => {
        if (cachedClient === client) {
          cachedClient = null;
        }
      });
      cachedClient = client;
      mongoRetryAfter = 0;
      ensureIndexes(client).catch(() => {});
      return client;
    } catch (err: any) {
      console.warn('[API/online-evaluations] Échec connexion MongoDB (nouvelle tentative dans 10s):', err?.message);
      mongoRetryAfter = Date.now() + MONGO_RETRY_COOLDOWN_MS;
      return null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
}

async function withMongoRetry<T>(operation: () => Promise<T>, maxAttempts = 3): Promise<T> {
  let lastError: any;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (err: any) {
      lastError = err;
      const msg = String(err?.message || '');
      const isTransient =
        err?.hasErrorLabel?.('TransientTransactionError') ||
        err?.hasErrorLabel?.('RetryableWriteError') ||
        /ECONNRESET|ETIMEDOUT|socket|topology|pool|closed|WriteConflict|temporarily/i.test(msg);

      if (/topology.*closed|client.*closed/i.test(msg)) {
        cachedClient = null;
      }

      if (!isTransient || attempt === maxAttempts) {
        throw err;
      }

      const backoff = 120 * attempt + Math.floor(Math.random() * 120);
      await new Promise(resolve => setTimeout(resolve, backoff));
    }
  }
  throw lastError;
}

function mergeGradedAnswers(existingAnswers: any[], incomingAnswers: any[]): any[] {
  if (!Array.isArray(incomingAnswers) || incomingAnswers.length === 0) {
    return existingAnswers;
  }
  return incomingAnswers.map((inc: any, aIdx: number) => {
    const match =
      existingAnswers.find(
        (ea: any) => ea && ea.criterion === inc?.criterion && Number(ea.exerciseIndex) === Number(inc?.exerciseIndex)
      ) || existingAnswers[aIdx];
    if (!match) return inc;
    const incResp = String(inc?.studentResponse || '').trim();
    const matchResp = String(match?.studentResponse || '').trim();
    return {
      ...match,
      ...inc,
      studentResponse:
        incResp && incResp !== '(Sans réponse)' && incResp !== '(Aucune réponse fournie)'
          ? inc.studentResponse
          : matchResp || inc.studentResponse || '',
      drawingDataUrl: inc?.drawingDataUrl || match?.drawingDataUrl,
      subAnswers:
        inc?.subAnswers && Object.keys(inc.subAnswers).length > 0
          ? { ...(match?.subAnswers || {}), ...inc.subAnswers }
          : match?.subAnswers || inc?.subAnswers,
    };
  });
}

function applyMatriculeReplacementToAccessCodes(
  codes: any[],
  oldMatStrict: string,
  newMatDisplay: string,
  studentName?: string
): { updated: any[]; changed: boolean } {
  if (!Array.isArray(codes) || !oldMatStrict || !newMatDisplay) {
    return { updated: codes || [], changed: false };
  }
  const newMatStrict = normalizeMatStrict(newMatDisplay);
  const normTargetName = String(studentName || '').trim().toLowerCase();
  let changed = false;

  const mapped = codes.map((sc: any) => {
    if (!sc) return sc;
    const scStrict = normalizeMatStrict(sc.studentNumber);
    const scName = String(sc.studentName || '').trim().toLowerCase();
    const matchesOld = scStrict === oldMatStrict;
    const matchesSameNameWithOld = Boolean(normTargetName && scName === normTargetName && scStrict !== newMatStrict);

    if (matchesOld || matchesSameNameWithOld) {
      changed = true;
      return {
        ...sc,
        studentNumber: newMatDisplay,
        studentName: studentName?.trim() || sc.studentName,
      };
    }
    return sc;
  });

  if (!changed) return { updated: codes, changed: false };

  // Dédupliquer si le nouveau matricule figurait déjà dans le tableau
  const deduped: any[] = [];
  const seen = new Map<string, number>();
  for (const item of mapped) {
    const key = normalizeMatStrict(item?.studentNumber);
    if (!key) {
      deduped.push(item);
      continue;
    }
    const prevIdx = seen.get(key);
    if (prevIdx === undefined) {
      seen.set(key, deduped.length);
      deduped.push(item);
    } else {
      // Fusionner en conservant l'état utilisé/soumission s'il existe
      const prev = deduped[prevIdx];
      deduped[prevIdx] = {
        ...prev,
        ...item,
        studentName: item.studentName || prev.studentName,
        isUsed: Boolean(prev.isUsed || item.isUsed),
        usedAt: prev.usedAt || item.usedAt,
        submissionId: prev.submissionId || item.submissionId,
        allowedRetake: Boolean(prev.allowedRetake || item.allowedRetake),
      };
    }
  }

  return { updated: deduped, changed: true };
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-User-Role, X-Username'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const action = req.query.action as string;
  const mongoConfigured = Boolean(
    MONGO_URL && (MONGO_URL.startsWith('mongodb://') || MONGO_URL.startsWith('mongodb+srv://'))
  );

  try {
    const client = await connectToDatabase();

    // Si MongoDB est configuré mais momentanément inaccessible pour une soumission critique,
    // renvoyer 503 afin que le client réessaie automatiquement au lieu de perdre la copie en mémoire !
    if (!client && mongoConfigured && req.method === 'POST' && action === 'submit') {
      return res.status(503).json({
        success: false,
        retryable: true,
        error: 'Base de données momentanément saturée — nouvelle tentative automatique en cours.',
      });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE LOCAL (IN-MEMORY) SI MONGO NON CONFIGURÉ
    // ═════════════════════════════════════════════════════════════════════════
    if (!client) {
      res.setHeader('X-Storage-Mode', 'in-memory');

      // 1. GET Requests
      if (req.method === 'GET') {
        if (action === 'student_submission') {
          const { accessCode, studentNumber, evalId } = req.query;
          const targetCode = String(accessCode || '').trim().toUpperCase();
          const targetStrict = normalizeMatStrict(studentNumber);
          const targetEvalId = String(evalId || '').trim();

          const sub = inMemorySubmissions.find(s => {
            const matchesNum = normalizeMatStrict(s.studentNumber) === targetStrict;
            if (!matchesNum) return false;
            if (targetCode && s.accessCode?.trim().toUpperCase() === targetCode) return true;
            if (targetEvalId && s.evaluationId === targetEvalId) return true;
            return false;
          });
          return res.status(200).json({ submission: sub || null });
        }

        if (action === 'submissions') {
          const { evalId, accessCode } = req.query;
          let filtered = [...inMemorySubmissions];
          if (evalId) filtered = filtered.filter(s => s.evaluationId === evalId);
          if (accessCode) {
            const codeUpper = String(accessCode).trim().toUpperCase();
            filtered = filtered.filter(s => String(s.accessCode || '').trim().toUpperCase() === codeUpper);
          }
          return res.status(200).json(filtered);
        }

        if (req.query.accessCode) {
          const code = String(req.query.accessCode).trim().toUpperCase();
          const found = inMemoryEvaluations.find(
            e =>
              e.accessCode?.trim().toUpperCase() === code ||
              (e.studentAccessCodes &&
                e.studentAccessCodes.some((sc: any) => sc.code?.trim().toUpperCase() === code))
          );
          if (!found) return res.status(404).json({ error: 'Évaluation non trouvée avec ce code' });
          return res.status(200).json(found);
        }

        if (req.query.id) {
          const found = inMemoryEvaluations.find(e => e.id === req.query.id);
          if (!found) return res.status(404).json({ error: 'Évaluation non trouvée' });
          return res.status(200).json(found);
        }

        const { subject, grade, teacherUsername } = req.query;
        let list = [...inMemoryEvaluations];
        if (subject) list = list.filter(e => e.subject === subject);
        if (grade) list = list.filter(e => e.grade === grade);
        if (teacherUsername) list = list.filter(e => e.teacherUsername === teacherUsername);
        return res.status(200).json(list);
      }

      // 2. POST Requests
      if (req.method === 'POST') {
        // Marquer uniquement l'accès d'un élève sans écraser les autres élèves
        if (action === 'mark_access') {
          const { evaluationId, accessCode, studentNumber, studentName, consumeRetake, submissionId } = req.body || {};
          const targetStrict = normalizeMatStrict(studentNumber);
          const cleanCode = String(accessCode || '').trim().toUpperCase();
          if (!targetStrict || (!evaluationId && !cleanCode)) {
            return res.status(400).json({ error: 'evaluationId/accessCode et studentNumber requis' });
          }

          const evalIdx = inMemoryEvaluations.findIndex(
            e =>
              (evaluationId && e.id === evaluationId) ||
              (cleanCode && String(e.accessCode || '').trim().toUpperCase() === cleanCode)
          );
          if (evalIdx !== -1 && Array.isArray(inMemoryEvaluations[evalIdx].studentAccessCodes)) {
            const now = new Date().toISOString();
            inMemoryEvaluations[evalIdx].studentAccessCodes = inMemoryEvaluations[evalIdx].studentAccessCodes.map(
              (sc: any) => {
                if (normalizeMatStrict(sc.studentNumber) === targetStrict) {
                  return {
                    ...sc,
                    studentName: sc.studentName || studentName || '',
                    isUsed: true,
                    usedAt: sc.usedAt || now,
                    allowedRetake: consumeRetake ? false : sc.allowedRetake,
                    submissionId: submissionId || sc.submissionId,
                  };
                }
                return sc;
              }
            );
          }
          return res.status(200).json({ success: true });
        }

        // Remplacement global d'un ou plusieurs matricules (ancien -> nouveau)
        if (action === 'replace_matricules') {
          const { replacements } = req.body || {};
          if (!Array.isArray(replacements)) {
            return res.status(400).json({ error: 'Tableau replacements requis' });
          }
          let updatedEvals = 0;
          let updatedSubs = 0;

          for (const rep of replacements) {
            const oldStrict = normalizeMatStrict(rep?.oldMatricule);
            const newDisplay = normalizeMatDisplay(rep?.newMatricule);
            if (!oldStrict || !newDisplay || oldStrict === normalizeMatStrict(newDisplay)) continue;

            for (let i = 0; i < inMemoryEvaluations.length; i++) {
              const ev = inMemoryEvaluations[i];
              if (!Array.isArray(ev.studentAccessCodes)) continue;
              const { updated, changed } = applyMatriculeReplacementToAccessCodes(
                ev.studentAccessCodes,
                oldStrict,
                newDisplay,
                rep.studentName
              );
              if (changed) {
                inMemoryEvaluations[i] = { ...ev, studentAccessCodes: updated };
                updatedEvals++;
              }
            }

            for (let i = 0; i < inMemorySubmissions.length; i++) {
              const sub = inMemorySubmissions[i];
              if (normalizeMatStrict(sub.studentNumber) === oldStrict) {
                inMemorySubmissions[i] = {
                  ...sub,
                  studentNumber: newDisplay,
                  normalizedStudentNumber: normalizeMatStrict(newDisplay),
                  studentName: rep.studentName?.trim() || sub.studentName,
                };
                updatedSubs++;
              }
            }
          }

          return res.status(200).json({ success: true, updatedEvaluations: updatedEvals, updatedSubmissions: updatedSubs });
        }

        // Soumission de l'élève
        if (action === 'submit') {
          const submissionData = stripMongoInternalFields(req.body || {});
          if (!submissionData.evaluationId || !submissionData.studentNumber || !submissionData.studentName) {
            return res.status(400).json({ error: 'Données de soumission incomplètes' });
          }

          const cleanNum = String(submissionData.studentNumber).trim();
          const normNum = normalizeMatStrict(cleanNum);
          const cleanCode = String(submissionData.accessCode || '').trim().toUpperCase();

          const existingIdx = inMemorySubmissions.findIndex(
            s => s.evaluationId === submissionData.evaluationId && normalizeMatStrict(s.studentNumber) === normNum
          );

          const id =
            (existingIdx !== -1 && inMemorySubmissions[existingIdx]?.id) ||
            submissionData.id ||
            generateUniqueId('sub');

          const newSubmission: Record<string, any> = {
            ...submissionData,
            id,
            accessCode: cleanCode || submissionData.accessCode,
            studentNumber: cleanNum,
            normalizedStudentNumber: normNum,
            submittedAt: submissionData.submittedAt || new Date().toISOString(),
            status: submissionData.status || 'submitted',
          };

          if (existingIdx !== -1) {
            inMemorySubmissions[existingIdx] = newSubmission;
          } else {
            inMemorySubmissions.unshift(newSubmission);
          }

          // Verrouiller atomiquement le matricule de CET élève dans l'évaluation en mémoire
          const evalIdx = inMemoryEvaluations.findIndex(
            e =>
              e.id === newSubmission.evaluationId ||
              (cleanCode && String(e.accessCode || '').trim().toUpperCase() === cleanCode)
          );
          if (evalIdx !== -1 && Array.isArray(inMemoryEvaluations[evalIdx].studentAccessCodes)) {
            inMemoryEvaluations[evalIdx].studentAccessCodes = inMemoryEvaluations[evalIdx].studentAccessCodes.map(
              (sc: any) => {
                if (normalizeMatStrict(sc.studentNumber) === normNum) {
                  return {
                    ...sc,
                    isUsed: true,
                    allowedRetake: false,
                    usedAt: newSubmission.submittedAt,
                    submissionId: newSubmission.id,
                    studentName: sc.studentName || newSubmission.studentName,
                  };
                }
                return sc;
              }
            );
          }

          return res.status(200).json({ success: true, persisted: true, submission: newSubmission });
        }

        // Correction par l'enseignant
        if (action === 'grade') {
          const { submissionId, criteriaScores, totalScore, overallFeedback, answers, gradedBy } = req.body;
          const idx = inMemorySubmissions.findIndex(s => s.id === submissionId);
          if (idx === -1) {
            return res.status(404).json({ error: 'Soumission non trouvée' });
          }

          const existingAnswers = Array.isArray(inMemorySubmissions[idx].answers)
            ? inMemorySubmissions[idx].answers
            : [];
          const mergedAnswers = mergeGradedAnswers(existingAnswers, answers);

          inMemorySubmissions[idx] = {
            ...inMemorySubmissions[idx],
            criteriaScores,
            totalScore,
            overallFeedback,
            answers: mergedAnswers,
            status: 'graded',
            gradedAt: new Date().toISOString(),
            gradedBy: gradedBy || 'Enseignant',
          };

          return res.status(200).json({ success: true, submission: inMemorySubmissions[idx] });
        }

        // Création / Mise à jour d'évaluation (enseignant)
        const evaluation = stripMongoInternalFields(req.body || {});
        if (!evaluation.title || !evaluation.subject || !evaluation.grade) {
          return res.status(400).json({ error: 'Champs title, subject et grade requis' });
        }

        const id = evaluation.id || generateUniqueId('eval');
        const accessCode = (evaluation.accessCode || `EVAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();

        const updatedEval = {
          ...evaluation,
          id,
          accessCode,
          status: evaluation.status || 'active',
          createdAt: evaluation.createdAt || new Date().toISOString(),
        };

        const existingIdx = inMemoryEvaluations.findIndex(e => e.id === id || e.accessCode === updatedEval.accessCode);
        if (existingIdx !== -1) {
          inMemoryEvaluations[existingIdx] = updatedEval;
        } else {
          inMemoryEvaluations.unshift(updatedEval);
        }

        return res.status(200).json({ success: true, evaluation: updatedEval });
      }

      // 3. DELETE Requests
      if (req.method === 'DELETE') {
        if (action === 'delete_submission') {
          const { submissionId, evalId, accessCode, studentNumber } = req.query;
          if (!submissionId && !studentNumber) return res.status(400).json({ error: 'submissionId requis' });

          const subIdx = inMemorySubmissions.findIndex(s => s.id === submissionId);
          let deletedSub: any = null;
          if (subIdx !== -1) {
            deletedSub = inMemorySubmissions[subIdx];
            inMemorySubmissions.splice(subIdx, 1);
          }

          const targetEvalId = evalId || deletedSub?.evaluationId;
          const targetCode = String(accessCode || deletedSub?.accessCode || '').trim().toUpperCase();
          const targetStudentNum = normalizeMatStrict(studentNumber || deletedSub?.studentNumber);

          if (targetStudentNum && (targetEvalId || targetCode)) {
            for (let i = inMemorySubmissions.length - 1; i >= 0; i--) {
              const s = inMemorySubmissions[i];
              const sameEval =
                (targetEvalId && s.evaluationId === targetEvalId) ||
                (targetCode && String(s.accessCode || '').trim().toUpperCase() === targetCode);
              if (sameEval && normalizeMatStrict(s.studentNumber) === targetStudentNum) {
                inMemorySubmissions.splice(i, 1);
              }
            }
          }

          let updatedEval: any = null;
          const evalIdx = inMemoryEvaluations.findIndex(
            e =>
              (targetEvalId && e.id === targetEvalId) ||
              (targetCode && String(e.accessCode || '').trim().toUpperCase() === targetCode)
          );
          if (evalIdx !== -1 && Array.isArray(inMemoryEvaluations[evalIdx].studentAccessCodes)) {
            inMemoryEvaluations[evalIdx].studentAccessCodes = inMemoryEvaluations[evalIdx].studentAccessCodes.map(
              (sc: any) => {
                if (
                  sc.submissionId === submissionId ||
                  (targetStudentNum && normalizeMatStrict(sc.studentNumber) === targetStudentNum)
                ) {
                  return {
                    ...sc,
                    isUsed: false,
                    allowedRetake: true,
                    usedAt: undefined,
                    submissionId: undefined,
                  };
                }
                return sc;
              }
            );
            updatedEval = inMemoryEvaluations[evalIdx];
          }

          return res.status(200).json({
            success: true,
            deleted: 1,
            deletedSubmission: deletedSub,
            updatedEvaluation: updatedEval,
          });
        }
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID requis pour la suppression' });
        const idx = inMemoryEvaluations.findIndex(e => e.id === id);
        if (idx !== -1) inMemoryEvaluations.splice(idx, 1);
        return res.status(200).json({ success: true, deleted: idx !== -1 ? 1 : 0 });
      }

      return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE MONGODB (CONCURRENCE ÉLEVÉE & OPÉRATIONS ATOMIQUES)
    // ═════════════════════════════════════════════════════════════════════════
    const db = client.db(DB_NAME);
    const evalCol = db.collection(EVAL_COLLECTION);
    const subCol = db.collection(SUB_COLLECTION);

    // 1. GET Requests
    if (req.method === 'GET') {
      if (action === 'student_submission') {
        const { accessCode, studentNumber, evalId } = req.query;
        const cleanNum = String(studentNumber || '').trim();
        const normNum = normalizeMatStrict(cleanNum);
        const escapedNum = escapeRegex(cleanNum);
        const cleanCode = String(accessCode || '').trim().toUpperCase();
        const targetEvalId = String(evalId || '').trim();

        const studentMatchOr: any[] = [
          { studentNumber: { $regex: new RegExp(`^${escapedNum}$`, 'i') } },
        ];
        if (normNum) {
          studentMatchOr.push({ normalizedStudentNumber: normNum });
        }

        const evalMatchOr: any[] = [];
        if (cleanCode) evalMatchOr.push({ accessCode: cleanCode });
        if (targetEvalId) evalMatchOr.push({ evaluationId: targetEvalId });

        const filter: any =
          evalMatchOr.length > 0
            ? { $and: [{ $or: studentMatchOr }, { $or: evalMatchOr }] }
            : { $or: studentMatchOr };

        const sub = await withMongoRetry(() => subCol.findOne(filter, { sort: { submittedAt: -1 } }));
        return res.status(200).json({ submission: sub || null });
      }

      if (action === 'submissions') {
        const { evalId, accessCode } = req.query;
        const filter: any = {};
        if (evalId) filter.evaluationId = String(evalId);
        if (accessCode) filter.accessCode = String(accessCode).trim().toUpperCase();
        const subs = await withMongoRetry(() => subCol.find(filter).sort({ submittedAt: -1 }).toArray());
        return res.status(200).json(subs);
      }

      if (req.query.accessCode) {
        const code = String(req.query.accessCode).trim().toUpperCase();
        const found = await withMongoRetry(() =>
          evalCol.findOne({
            $or: [{ accessCode: code }, { 'studentAccessCodes.code': code }],
          })
        );
        if (!found) return res.status(404).json({ error: 'Évaluation non trouvée avec ce code' });
        return res.status(200).json(found);
      }

      if (req.query.id) {
        const found = await withMongoRetry(() => evalCol.findOne({ id: String(req.query.id) }));
        if (!found) return res.status(404).json({ error: 'Évaluation non trouvée' });
        return res.status(200).json(found);
      }

      const { subject, grade, teacherUsername } = req.query;
      const filter: any = {};
      if (subject) filter.subject = subject;
      if (grade) filter.grade = grade;
      if (teacherUsername) filter.teacherUsername = teacherUsername;
      const list = await withMongoRetry(() => evalCol.find(filter).sort({ createdAt: -1 }).toArray());
      return res.status(200).json(list);
    }

    // 2. POST Requests
    if (req.method === 'POST') {
      // Marquer atomiquement l'accès d'un SEUL élève sans écraser les autres élèves connectés au même moment
      if (action === 'mark_access') {
        const { evaluationId, accessCode, studentNumber, studentName, consumeRetake, submissionId } = req.body || {};
        const cleanNum = String(studentNumber || '').trim();
        const cleanCode = String(accessCode || '').trim().toUpperCase();
        if (!cleanNum || (!evaluationId && !cleanCode)) {
          return res.status(400).json({ error: 'evaluationId/accessCode et studentNumber requis' });
        }

        const escapedNum = escapeRegex(cleanNum);
        const evalFilter = evaluationId ? { id: String(evaluationId) } : { accessCode: cleanCode };
        const now = new Date().toISOString();

        const setFields: Record<string, any> = {
          'studentAccessCodes.$[elem].isUsed': true,
          'studentAccessCodes.$[elem].usedAt': now,
        };
        if (consumeRetake) {
          setFields['studentAccessCodes.$[elem].allowedRetake'] = false;
        }
        if (submissionId) {
          setFields['studentAccessCodes.$[elem].submissionId'] = submissionId;
        }
        if (studentName) {
          setFields['studentAccessCodes.$[elem].studentName'] = String(studentName).trim();
        }

        await withMongoRetry(() =>
          evalCol.updateOne(
            evalFilter,
            { $set: setFields },
            {
              arrayFilters: [
                { 'elem.studentNumber': { $regex: new RegExp(`^\\s*${escapedNum}\\s*$`, 'i') } },
              ],
            }
          )
        );

        return res.status(200).json({ success: true });
      }

      // Remplacement global d'un ou plusieurs matricules (ancien -> nouveau) dans toutes les évaluations et copies
      if (action === 'replace_matricules') {
        const { replacements } = req.body || {};
        if (!Array.isArray(replacements)) {
          return res.status(400).json({ error: 'Tableau replacements requis' });
        }

        let updatedEvaluations = 0;
        let updatedSubmissions = 0;

        const allEvals = await withMongoRetry(() => evalCol.find({ studentAccessCodes: { $exists: true } }).toArray());

        for (const rep of replacements) {
          const oldRaw = String(rep?.oldMatricule || '').trim();
          const oldStrict = normalizeMatStrict(oldRaw);
          const newDisplay = normalizeMatDisplay(rep?.newMatricule);
          const newStrict = normalizeMatStrict(newDisplay);
          if (!oldStrict || !newDisplay || oldStrict === newStrict) continue;

          // 1. Mettre à jour toutes les évaluations contenant l'ancien matricule
          for (const ev of allEvals) {
            if (!Array.isArray(ev.studentAccessCodes)) continue;
            const { updated, changed } = applyMatriculeReplacementToAccessCodes(
              ev.studentAccessCodes,
              oldStrict,
              newDisplay,
              rep.studentName
            );
            if (changed) {
              ev.studentAccessCodes = updated;
              await withMongoRetry(() =>
                evalCol.updateOne({ id: ev.id }, { $set: { studentAccessCodes: updated } })
              );
              updatedEvaluations++;
            }
          }

          // 2. Mettre à jour toutes les copies soumises / corrigées portant l'ancien matricule
          const escapedOld = escapeRegex(oldRaw);
          const subUpdate: Record<string, any> = {
            studentNumber: newDisplay,
            normalizedStudentNumber: newStrict,
          };
          if (rep.studentName && String(rep.studentName).trim()) {
            subUpdate.studentName = String(rep.studentName).trim();
          }
          const subRes = await withMongoRetry(() =>
            subCol.updateMany(
              {
                $or: [
                  { normalizedStudentNumber: oldStrict },
                  { studentNumber: { $regex: new RegExp(`^\\s*${escapedOld}\\s*$`, 'i') } },
                ],
              },
              { $set: subUpdate }
            )
          );
          updatedSubmissions += subRes.modifiedCount || 0;
        }

        return res.status(200).json({
          success: true,
          updatedEvaluations,
          updatedSubmissions,
        });
      }

      // Soumission d'un élève — 100% atomique et isolée par (evaluationId + normalizedStudentNumber)
      if (action === 'submit') {
        const submissionData = stripMongoInternalFields(req.body || {});
        if (!submissionData.evaluationId || !submissionData.studentNumber || !submissionData.studentName) {
          return res.status(400).json({ error: 'Données de soumission incomplètes' });
        }

        const cleanNum = String(submissionData.studentNumber).trim();
        const normNum = normalizeMatStrict(cleanNum);
        const escapedNum = escapeRegex(cleanNum);
        const cleanCode = String(submissionData.accessCode || '').trim().toUpperCase();
        const now = new Date().toISOString();

        // Chercher une éventuelle copie déjà existante de CE MÊME élève pour CETTE évaluation
        const existing = await withMongoRetry(() =>
          subCol.findOne({
            evaluationId: submissionData.evaluationId,
            $or: [
              { normalizedStudentNumber: normNum },
              { studentNumber: { $regex: new RegExp(`^\\s*${escapedNum}\\s*$`, 'i') } },
            ],
          })
        );

        const id = existing?.id || submissionData.id || generateUniqueId('sub');
        const newSubmission: Record<string, any> = {
          ...submissionData,
          id,
          accessCode: cleanCode || submissionData.accessCode,
          studentNumber: cleanNum,
          normalizedStudentNumber: normNum,
          submittedAt: submissionData.submittedAt || now,
          status: existing?.status === 'graded' ? 'graded' : (submissionData.status || 'submitted'),
        };

        if (existing?._id) {
          await withMongoRetry(() =>
            subCol.updateOne({ _id: existing._id }, { $set: newSubmission })
          );
        } else {
          await withMongoRetry(() =>
            subCol.updateOne(
              { evaluationId: newSubmission.evaluationId, normalizedStudentNumber: normNum },
              { $set: newSubmission },
              { upsert: true }
            )
          );
        }

        // Mettre à jour atomiquement UNIQUEMENT l'entrée studentAccessCodes de cet élève
        // (n'écrase jamais les autres élèves même si 40 élèves soumettent à la même milliseconde !)
        evalCol
          .updateOne(
            { id: newSubmission.evaluationId },
            {
              $set: {
                'studentAccessCodes.$[elem].isUsed': true,
                'studentAccessCodes.$[elem].allowedRetake': false,
                'studentAccessCodes.$[elem].usedAt': newSubmission.submittedAt,
                'studentAccessCodes.$[elem].submissionId': newSubmission.id,
              },
            },
            {
              arrayFilters: [
                { 'elem.studentNumber': { $regex: new RegExp(`^\\s*${escapedNum}\\s*$`, 'i') } },
              ],
            }
          )
          .catch(() => {});

        return res.status(200).json({ success: true, persisted: true, submission: newSubmission });
      }

      if (action === 'grade') {
        const { submissionId, criteriaScores, totalScore, overallFeedback, answers, gradedBy } = req.body;
        const existingDoc = await withMongoRetry(() => subCol.findOne({ id: submissionId }));
        const existingAnswers = Array.isArray(existingDoc?.answers) ? existingDoc.answers : [];
        const mergedAnswers = mergeGradedAnswers(existingAnswers, answers);

        const update = {
          criteriaScores,
          totalScore,
          overallFeedback,
          answers: mergedAnswers,
          status: 'graded',
          gradedAt: new Date().toISOString(),
          gradedBy: gradedBy || 'Enseignant',
        };

        const result = await withMongoRetry(() =>
          subCol.findOneAndUpdate({ id: submissionId }, { $set: update }, { returnDocument: 'after' })
        );

        return res.status(200).json({ success: true, submission: result || { ...(existingDoc || {}), ...update } });
      }

      const evaluation = stripMongoInternalFields(req.body || {});
      if (!evaluation.title || !evaluation.subject || !evaluation.grade) {
        return res.status(400).json({ error: 'Champs title, subject et grade requis' });
      }

      const id = evaluation.id || generateUniqueId('eval');
      const accessCode = (evaluation.accessCode || `EVAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();

      const updatedEval = {
        ...evaluation,
        id,
        accessCode,
        status: evaluation.status || 'active',
        createdAt: evaluation.createdAt || new Date().toISOString(),
      };

      await withMongoRetry(() =>
        evalCol.updateOne({ id }, { $set: updatedEval }, { upsert: true })
      );

      return res.status(200).json({ success: true, evaluation: updatedEval });
    }

    // 3. DELETE Requests
    if (req.method === 'DELETE') {
      if (action === 'delete_submission') {
        const { submissionId, evalId, accessCode, studentNumber } = req.query;
        if (!submissionId && !studentNumber) return res.status(400).json({ error: 'submissionId requis' });

        const existingSub = submissionId
          ? await withMongoRetry(() => subCol.findOne({ id: String(submissionId) }))
          : null;
        const result = submissionId
          ? await withMongoRetry(() => subCol.deleteOne({ id: String(submissionId) }))
          : { deletedCount: 0 };

        const targetEvalId = String(evalId || existingSub?.evaluationId || '');
        const targetCode = String(accessCode || existingSub?.accessCode || '').trim().toUpperCase();
        const rawStudentNum = String(studentNumber || existingSub?.studentNumber || '').trim();
        const targetStudentNum = normalizeMatStrict(rawStudentNum);

        if (rawStudentNum && (targetEvalId || targetCode)) {
          const escapedNum = escapeRegex(rawStudentNum);
          const extraFilter: any = {
            $or: [
              { normalizedStudentNumber: targetStudentNum },
              { studentNumber: { $regex: new RegExp(`^\\s*${escapedNum}\\s*$`, 'i') } },
            ],
          };
          if (targetEvalId) extraFilter.evaluationId = targetEvalId;
          else if (targetCode) extraFilter.accessCode = targetCode;
          await withMongoRetry(() => subCol.deleteMany(extraFilter));
        }

        let updatedEvaluation: any = null;
        if (targetEvalId || targetCode) {
          const evalFilter = targetEvalId ? { id: targetEvalId } : { accessCode: targetCode };
          const evalDoc = await withMongoRetry(() => evalCol.findOne(evalFilter));
          if (evalDoc && Array.isArray(evalDoc.studentAccessCodes)) {
            const updatedCodes = evalDoc.studentAccessCodes.map((sc: any) => {
              if (
                sc.submissionId === submissionId ||
                (targetStudentNum && normalizeMatStrict(sc.studentNumber) === targetStudentNum)
              ) {
                return {
                  ...sc,
                  isUsed: false,
                  allowedRetake: true,
                  usedAt: undefined,
                  submissionId: undefined,
                };
              }
              return sc;
            });
            await withMongoRetry(() =>
              evalCol.updateOne(evalFilter, { $set: { studentAccessCodes: updatedCodes } })
            );
            updatedEvaluation = { ...evalDoc, studentAccessCodes: updatedCodes };
          }
        }

        return res.status(200).json({
          success: true,
          deleted: result.deletedCount || 1,
          updatedEvaluation,
        });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requis' });
      const result = await withMongoRetry(() => evalCol.deleteOne({ id: String(id) }));
      await withMongoRetry(() => subCol.deleteMany({ evaluationId: String(id) }));
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (error: any) {
    console.error('❌ [API/online-evaluations] Erreur critique:', error?.message || error);

    // CRITIQUE : Pour une soumission d'élève, NE JAMAIS renvoyer un faux 200 OK si la sauvegarde a échoué !
    // Renvoyer 503 afin que le client relance automatiquement la soumission jusqu'à confirmation réelle.
    if (req.method === 'POST' && action === 'submit') {
      return res.status(503).json({
        success: false,
        retryable: true,
        error: `Enregistrement temporairement indisponible (${error?.message || 'erreur serveur'}). Nouvelle tentative automatique.`,
      });
    }

    if (req.method === 'POST' && (action === 'grade' || action === 'replace_matricules' || action === 'mark_access')) {
      return res.status(503).json({
        success: false,
        error: error?.message || 'Erreur temporaire de base de données',
      });
    }

    return res.status(500).json({
      success: false,
      error: error?.message || 'Erreur serveur lors de l\'opération sur les évaluations',
    });
  }
}
