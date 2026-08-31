import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'exams';

const CONNECT_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS  = 10_000;

let cachedClient: MongoClient | null = null;
const inMemoryExams: any[] = [];

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
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  try {
    const client = await connectToDatabase();
    
    // In-memory mode fallback
    if (!client) {
      res.setHeader('X-Storage-Mode', 'in-memory');
      if (req.method === 'GET') {
        const { subject, grade, semester } = req.query;
        let filtered = inMemoryExams;
        if (subject) filtered = filtered.filter(e => e.subject === subject);
        if (grade) filtered = filtered.filter(e => e.grade === grade);
        if (semester) filtered = filtered.filter(e => e.semester === semester);
        return res.status(200).json(filtered);
      }
      if (req.method === 'POST') {
        const exam = { ...req.body, id: req.body.id || `exam_${Date.now()}`, createdAt: req.body.createdAt || new Date(), updatedAt: new Date() };
        const existingIdx = inMemoryExams.findIndex(e => (e.id && e.id === exam.id) || (e.subject === exam.subject && e.grade === exam.grade && e.semester === exam.semester && e.title?.toLowerCase() === exam.title?.toLowerCase()));
        if (existingIdx !== -1) {
          inMemoryExams[existingIdx] = exam;
        } else {
          inMemoryExams.unshift(exam);
        }
        return res.status(200).json({ success: true, id: exam.id, exam });
      }
      if (req.method === 'DELETE') {
        const { id } = req.query;
        const idx = inMemoryExams.findIndex(e => e.id === id || e._id === id);
        if (idx !== -1) inMemoryExams.splice(idx, 1);
        return res.status(200).json({ success: true, deleted: idx !== -1 ? 1 : 0 });
      }
      return res.status(200).json({ success: true });
    }

    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // GET: Récupérer les examens
    if (req.method === 'GET') {
      const { subject, grade, semester } = req.query;

      const filter: any = {};
      if (subject) filter.subject = subject;
      if (grade) filter.grade = grade;
      if (semester) filter.semester = semester;

      const exams = await collection
        .find(filter)
        .sort({ createdAt: -1 })
        .limit(100)
        .toArray();

      return res.status(200).json(exams);
    }

    // POST: Sauvegarder un nouvel examen ou mettre à jour un existant (remplacement sans doublon)
    if (req.method === 'POST') {
      const exam = req.body;

      if (!exam.subject || !exam.grade || !exam.semester) {
        return res.status(400).json({ 
          error: 'Les champs subject, grade et semester sont requis' 
        });
      }

      exam.updatedAt = new Date();
      if (!exam.createdAt) {
        exam.createdAt = new Date();
      }

      const query: any = {};
      if (exam.id) {
        query.$or = [
          { id: exam.id },
          { _id: exam.id },
          { subject: exam.subject, grade: exam.grade, semester: exam.semester, title: exam.title }
        ];
      } else {
        query.subject = exam.subject;
        query.grade = exam.grade;
        query.semester = exam.semester;
        query.title = exam.title;
      }

      const result = await collection.updateOne(
        query,
        { $set: exam },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        id: exam.id || result.upsertedId,
        exam
      });
    }

    // DELETE: Supprimer un examen
    if (req.method === 'DELETE') {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ 
          error: 'Le paramètre id est requis' 
        });
      }

      const result = await collection.deleteOne({ id: id });

      return res.status(200).json({
        success: true,
        deleted: result.deletedCount
      });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (error: any) {
    console.warn('⚠️ [API/exams] Basculement fallback local suite à erreur:', error?.message);
    return res.status(200).json(inMemoryExams);
  }
}

