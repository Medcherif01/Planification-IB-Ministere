import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const EVAL_COLLECTION = 'online_evaluations';
const SUB_COLLECTION = 'online_submissions';

const CONNECT_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS = 10_000;

let cachedClient: MongoClient | null = null;

// In-memory fallbacks
const inMemoryEvaluations: any[] = [];
const inMemorySubmissions: any[] = [];

async function connectToDatabase(): Promise<MongoClient | null> {
  if (!MONGO_URL) return null;
  if (cachedClient) {
    try {
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch (_) {
      try { await cachedClient.close(); } catch (_) {}
      cachedClient = null;
    }
  }

  if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
    return null;
  }

  try {
    const client = new MongoClient(MONGO_URL, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: false,
      },
      connectTimeoutMS: CONNECT_TIMEOUT_MS,
      socketTimeoutMS: SOCKET_TIMEOUT_MS,
      serverSelectionTimeoutMS: CONNECT_TIMEOUT_MS,
    });
    await client.connect();
    cachedClient = client;
    return client;
  } catch (_) {
    return null;
  }
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

  try {
    const client = await connectToDatabase();
    const action = req.query.action as string;

    // ═════════════════════════════════════════════════════════════════════════
    // MODE LOCAL (IN-MEMORY) SI MONGO INDISPONIBLE
    // ═════════════════════════════════════════════════════════════════════════
    if (!client) {
      res.setHeader('X-Storage-Mode', 'in-memory');

      // 1. GET Requests
      if (req.method === 'GET') {
        // Obtenir une soumission par accessCode + studentNumber
        if (action === 'student_submission') {
          const { accessCode, studentNumber } = req.query;
          const sub = inMemorySubmissions.find(
            s => s.accessCode?.trim().toUpperCase() === String(accessCode).trim().toUpperCase() &&
                 s.studentNumber?.trim().toLowerCase() === String(studentNumber).trim().toLowerCase()
          );
          return res.status(200).json({ submission: sub || null });
        }

        // Liste des soumissions pour une évaluation
        if (action === 'submissions') {
          const { evalId, accessCode } = req.query;
          let filtered = inMemorySubmissions;
          if (evalId) filtered = filtered.filter(s => s.evaluationId === evalId);
          if (accessCode) filtered = filtered.filter(s => s.accessCode === accessCode);
          return res.status(200).json(filtered);
        }

        // Obtenir une évaluation par accessCode (pour les élèves : code principal ou code individuel)
        if (req.query.accessCode) {
          const code = String(req.query.accessCode).trim().toUpperCase();
          const found = inMemoryEvaluations.find(e =>
            e.accessCode?.trim().toUpperCase() === code ||
            (e.studentAccessCodes && e.studentAccessCodes.some((sc: any) => sc.code?.trim().toUpperCase() === code))
          );
          if (!found) return res.status(404).json({ error: 'Évaluation non trouvée avec ce code' });
          return res.status(200).json(found);
        }

        // Obtenir une évaluation par ID
        if (req.query.id) {
          const found = inMemoryEvaluations.find(e => e.id === req.query.id);
          if (!found) return res.status(404).json({ error: 'Évaluation non trouvée' });
          return res.status(200).json(found);
        }

        // Liste filtrée des évaluations (pour l'enseignant)
        const { subject, grade, teacherUsername } = req.query;
        let list = [...inMemoryEvaluations];
        if (subject) list = list.filter(e => e.subject === subject);
        if (grade) list = list.filter(e => e.grade === grade);
        if (teacherUsername) list = list.filter(e => e.teacherUsername === teacherUsername);
        return res.status(200).json(list);
      }

      // 2. POST Requests
      if (req.method === 'POST') {
        // Soumission de l'élève
        if (action === 'submit') {
          const submissionData = req.body;
          if (!submissionData.evaluationId || !submissionData.studentNumber || !submissionData.studentName) {
            return res.status(400).json({ error: 'Données de soumission incomplètes' });
          }

          const id = submissionData.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const newSubmission = {
            ...submissionData,
            id,
            submittedAt: submissionData.submittedAt || new Date().toISOString(),
            status: submissionData.status || 'submitted',
          };

          const existingIdx = inMemorySubmissions.findIndex(
            s => s.evaluationId === newSubmission.evaluationId &&
                 s.studentNumber?.trim().toLowerCase() === newSubmission.studentNumber?.trim().toLowerCase()
          );

          if (existingIdx !== -1) {
            inMemorySubmissions[existingIdx] = newSubmission;
          } else {
            inMemorySubmissions.unshift(newSubmission);
          }

          return res.status(200).json({ success: true, submission: newSubmission });
        }

        // Correction par l'enseignant
        if (action === 'grade') {
          const { submissionId, criteriaScores, totalScore, overallFeedback, answers, gradedBy } = req.body;
          const idx = inMemorySubmissions.findIndex(s => s.id === submissionId);
          if (idx === -1) {
            return res.status(404).json({ error: 'Soumission non trouvée' });
          }

          inMemorySubmissions[idx] = {
            ...inMemorySubmissions[idx],
            criteriaScores,
            totalScore,
            overallFeedback,
            answers: answers || inMemorySubmissions[idx].answers,
            status: 'graded',
            gradedAt: new Date().toISOString(),
            gradedBy: gradedBy || 'Enseignant',
          };

          return res.status(200).json({ success: true, submission: inMemorySubmissions[idx] });
        }

        // Création / Mise à jour d'évaluation (enseignant)
        const evaluation = req.body;
        if (!evaluation.title || !evaluation.subject || !evaluation.grade) {
          return res.status(400).json({ error: 'Champs title, subject et grade requis' });
        }

        const id = evaluation.id || `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const accessCode = evaluation.accessCode || `EVAL-${Math.floor(1000 + Math.random() * 9000)}`;

        const updatedEval = {
          ...evaluation,
          id,
          accessCode: accessCode.toUpperCase(),
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
        const { id } = req.query;
        if (!id) return res.status(400).json({ error: 'ID requis pour la suppression' });
        const idx = inMemoryEvaluations.findIndex(e => e.id === id);
        if (idx !== -1) inMemoryEvaluations.splice(idx, 1);
        return res.status(200).json({ success: true, deleted: idx !== -1 ? 1 : 0 });
      }

      return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE MONGODB
    // ═════════════════════════════════════════════════════════════════════════
    const db = client.db(DB_NAME);
    const evalCol = db.collection(EVAL_COLLECTION);
    const subCol = db.collection(SUB_COLLECTION);

    // 1. GET Requests
    if (req.method === 'GET') {
      if (action === 'student_submission') {
        const { accessCode, studentNumber } = req.query;
        const sub = await subCol.findOne({
          accessCode: String(accessCode).trim().toUpperCase(),
          studentNumber: String(studentNumber).trim(),
        });
        return res.status(200).json({ submission: sub || null });
      }

      if (action === 'submissions') {
        const { evalId, accessCode } = req.query;
        const filter: any = {};
        if (evalId) filter.evaluationId = evalId;
        if (accessCode) filter.accessCode = accessCode;
        const subs = await subCol.find(filter).sort({ submittedAt: -1 }).toArray();
        return res.status(200).json(subs);
      }

      if (req.query.accessCode) {
        const code = String(req.query.accessCode).trim().toUpperCase();
        const found = await evalCol.findOne({
          $or: [
            { accessCode: code },
            { 'studentAccessCodes.code': code }
          ]
        });
        if (!found) return res.status(404).json({ error: 'Évaluation non trouvée avec ce code' });
        return res.status(200).json(found);
      }

      if (req.query.id) {
        const found = await evalCol.findOne({ id: req.query.id });
        if (!found) return res.status(404).json({ error: 'Évaluation non trouvée' });
        return res.status(200).json(found);
      }

      const { subject, grade, teacherUsername } = req.query;
      const filter: any = {};
      if (subject) filter.subject = subject;
      if (grade) filter.grade = grade;
      if (teacherUsername) filter.teacherUsername = teacherUsername;
      const list = await evalCol.find(filter).sort({ createdAt: -1 }).toArray();
      return res.status(200).json(list);
    }

    // 2. POST Requests
    if (req.method === 'POST') {
      if (action === 'submit') {
        const submissionData = req.body;
        if (!submissionData.evaluationId || !submissionData.studentNumber || !submissionData.studentName) {
          return res.status(400).json({ error: 'Données de soumission incomplètes' });
        }

        const id = submissionData.id || `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const newSubmission = {
          ...submissionData,
          id,
          submittedAt: submissionData.submittedAt || new Date().toISOString(),
          status: submissionData.status || 'submitted',
        };

        await subCol.updateOne(
          { evaluationId: newSubmission.evaluationId, studentNumber: newSubmission.studentNumber },
          { $set: newSubmission },
          { upsert: true }
        );

        return res.status(200).json({ success: true, submission: newSubmission });
      }

      if (action === 'grade') {
        const { submissionId, criteriaScores, totalScore, overallFeedback, answers, gradedBy } = req.body;
        const update = {
          criteriaScores,
          totalScore,
          overallFeedback,
          answers,
          status: 'graded',
          gradedAt: new Date().toISOString(),
          gradedBy: gradedBy || 'Enseignant',
        };

        const result = await subCol.findOneAndUpdate(
          { id: submissionId },
          { $set: update },
          { returnDocument: 'after' }
        );

        return res.status(200).json({ success: true, submission: result || update });
      }

      const evaluation = req.body;
      if (!evaluation.title || !evaluation.subject || !evaluation.grade) {
        return res.status(400).json({ error: 'Champs title, subject et grade requis' });
      }

      const id = evaluation.id || `eval_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const accessCode = (evaluation.accessCode || `EVAL-${Math.floor(1000 + Math.random() * 9000)}`).toUpperCase();

      const updatedEval = {
        ...evaluation,
        id,
        accessCode,
        status: evaluation.status || 'active',
        createdAt: evaluation.createdAt || new Date().toISOString(),
      };

      await evalCol.updateOne(
        { id },
        { $set: updatedEval },
        { upsert: true }
      );

      return res.status(200).json({ success: true, evaluation: updatedEval });
    }

    // 3. DELETE Requests
    if (req.method === 'DELETE') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'ID requis' });
      const result = await evalCol.deleteOne({ id });
      // Supprimer également les soumissions associées
      await subCol.deleteMany({ evaluationId: id });
      return res.status(200).json({ success: true, deleted: result.deletedCount });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (error: any) {
    console.warn('⚠️ [API/online-evaluations] Erreur:', error?.message);
    return res.status(200).json(inMemoryEvaluations);
  }
}
