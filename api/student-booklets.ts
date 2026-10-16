import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION = 'student_booklets';

let cachedClient: MongoClient | null = null;
const inMemoryBooklets = new Map<string, any>();

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
      connectTimeoutMS: 5000,
      socketTimeoutMS: 10000,
      serverSelectionTimeoutMS: 5000,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,PUT,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-User-Role, X-Username'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  const callerRole = (req.headers['x-user-role'] as string) || '';
  const callerUsername = (req.headers['x-username'] as string) || '';

  try {
    const client = await connectToDatabase();

    // ── Mode local en mémoire si MongoDB inaccessible ──
    if (!client) {
      res.setHeader('X-Storage-Mode', 'in-memory');

      if (req.method === 'GET') {
        const { grade, schoolYear, term, studentId } = req.query;
        let list = Array.from(inMemoryBooklets.values());

        if (grade) {
          list = list.filter(b => b.grade?.toLowerCase() === String(grade).toLowerCase());
        }
        if (schoolYear) {
          list = list.filter(b => b.schoolYear === String(schoolYear));
        }
        if (term) {
          list = list.filter(b => b.term === String(term));
        }
        if (studentId) {
          list = list.filter(b => b.studentId === String(studentId));
        }

        return res.status(200).json(list);
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        const booklet = req.body;
        if (!booklet || !booklet.grade || !booklet.studentId) {
          return res.status(400).json({ error: 'grade et studentId sont requis' });
        }

        const id = booklet.id || `booklet_${booklet.grade}_${booklet.schoolYear || '2025_2026'}_${booklet.term || 'T1'}_${booklet.studentId}`;
        const updated = {
          ...booklet,
          id,
          updatedAt: new Date().toISOString(),
          createdAt: booklet.createdAt || new Date().toISOString(),
          lastUpdatedBy: callerUsername || 'user',
        };

        inMemoryBooklets.set(id, updated);
        return res.status(200).json({ success: true, booklet: updated });
      }

      if (req.method === 'DELETE') {
        const { id } = req.query;
        if (id) {
          inMemoryBooklets.delete(String(id));
        }
        return res.status(200).json({ success: true });
      }

      return res.status(405).json({ error: 'Méthode non autorisée' });
    }

    // ── Mode MongoDB Atlas ──
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION);

    if (req.method === 'GET') {
      const { grade, schoolYear, term, studentId, id } = req.query;

      if (id) {
        const doc = await collection.findOne({ id: String(id) });
        return res.status(200).json(doc ? [doc] : []);
      }

      const query: Record<string, any> = {};
      if (grade) {
        query.grade = { $regex: new RegExp(`^${String(grade).trim()}$`, 'i') };
      }
      if (schoolYear) {
        query.schoolYear = String(schoolYear).trim();
      }
      if (term) {
        query.term = String(term).trim();
      }
      if (studentId) {
        query.studentId = String(studentId).trim();
      }

      const list = await collection.find(query).toArray();
      return res.status(200).json(list);
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const booklet = req.body;
      if (!booklet || !booklet.grade || !booklet.studentId) {
        return res.status(400).json({ error: 'grade et studentId sont requis' });
      }

      const id = booklet.id || `booklet_${booklet.grade.replace(/\s+/g, '')}_${(booklet.schoolYear || '2025_2026').replace(/\//g, '_')}_${(booklet.term || 'T1').replace(/\s+/g, '')}_${booklet.studentId}`;
      const now = new Date().toISOString();

      const docToSave = {
        ...booklet,
        id,
        updatedAt: now,
        lastUpdatedBy: callerUsername || callerRole || 'user',
      };
      if (!docToSave.createdAt) {
        docToSave.createdAt = now;
      }

      await collection.updateOne(
        { id },
        { $set: docToSave },
        { upsert: true }
      );

      return res.status(200).json({ success: true, booklet: docToSave });
    }

    if (req.method === 'DELETE') {
      const { id, grade } = req.query;
      if (id) {
        await collection.deleteOne({ id: String(id) });
      } else if (grade && callerRole === 'admin') {
        await collection.deleteMany({ grade: String(grade) });
      }
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (error: any) {
    console.error('[API student-booklets] Erreur:', error);
    return res.status(500).json({ error: 'Erreur serveur livrets scolaires', message: error?.message || String(error) });
  }
}
