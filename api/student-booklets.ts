import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION = 'student_booklets';

let cachedClient: MongoClient | null = null;
let connectingPromise: Promise<MongoClient | null> | null = null;
let mongoRetryAfter = 0;
const inMemoryBooklets = new Map<string, any>();

function normalizeMatStrict(val: any): string {
  return String(val || '').trim().toUpperCase().replace(/[\s\-_]/g, '');
}

function normalizeMatDisplay(val: any): string {
  return String(val || '').trim().toUpperCase();
}

function escapeRegex(val: string): string {
  return val.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

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
        maxPoolSize: 30,
        minPoolSize: 1,
        maxIdleTimeMS: 60_000,
        connectTimeoutMS: 10_000,
        socketTimeoutMS: 20_000,
        serverSelectionTimeoutMS: 10_000,
        retryWrites: true,
        retryReads: true,
      });
      await client.connect();
      client.on('topologyClosed', () => {
        if (cachedClient === client) cachedClient = null;
      });
      cachedClient = client;
      mongoRetryAfter = 0;
      return client;
    } catch (_) {
      mongoRetryAfter = Date.now() + 10_000;
      return null;
    } finally {
      connectingPromise = null;
    }
  })();

  return connectingPromise;
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
  const action = typeof req.query.action === 'string' ? req.query.action.trim() : '';

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

      if (req.method === 'POST' && action === 'replace_matricules') {
        const { replacements } = req.body || {};
        if (!Array.isArray(replacements)) {
          return res.status(400).json({ error: 'Tableau replacements requis' });
        }
        let updatedCount = 0;
        for (const rep of replacements) {
          const oldStrict = normalizeMatStrict(rep?.oldMatricule);
          const newDisplay = normalizeMatDisplay(rep?.newMatricule);
          const targetId = rep?.studentId ? String(rep.studentId) : '';
          if (!newDisplay) continue;
          for (const [key, b] of inMemoryBooklets.entries()) {
            const matchId = Boolean(targetId && b.studentId === targetId);
            const matchOld = Boolean(oldStrict && normalizeMatStrict(b.studentNumber) === oldStrict);
            if (matchId || matchOld) {
              inMemoryBooklets.set(key, {
                ...b,
                studentNumber: newDisplay,
                studentName: rep?.studentName?.trim() || b.studentName,
                updatedAt: new Date().toISOString(),
              });
              updatedCount++;
            }
          }
        }
        return res.status(200).json({ success: true, updatedCount });
      }

      if (req.method === 'POST' || req.method === 'PUT') {
        const booklet = req.body;
        if (!booklet || !booklet.grade || !booklet.studentId) {
          return res.status(400).json({ error: 'grade et studentId sont requis' });
        }

        const id = booklet.id || `booklet_${booklet.grade}_${booklet.schoolYear || '2026_2027'}_${booklet.term || 'Semestre1'}_${booklet.studentId}`;
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
        query.grade = { $regex: new RegExp(`^${escapeRegex(String(grade).trim())}$`, 'i') };
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

    if (req.method === 'POST' && action === 'replace_matricules') {
      const { replacements } = req.body || {};
      if (!Array.isArray(replacements)) {
        return res.status(400).json({ error: 'Tableau replacements requis' });
      }
      let updatedCount = 0;
      for (const rep of replacements) {
        const oldRaw = String(rep?.oldMatricule || '').trim();
        const newDisplay = normalizeMatDisplay(rep?.newMatricule);
        const targetId = rep?.studentId ? String(rep.studentId) : '';
        if (!newDisplay) continue;
        const orClauses: any[] = [];
        if (oldRaw) {
          orClauses.push({ studentNumber: { $regex: new RegExp(`^\\s*${escapeRegex(oldRaw)}\\s*$`, 'i') } });
        }
        if (targetId) {
          orClauses.push({ studentId: targetId });
        }
        if (orClauses.length === 0) continue;
        const r = await collection.updateMany(
          { $or: orClauses },
          {
            $set: {
              studentNumber: newDisplay,
              ...(rep?.studentName?.trim() ? { studentName: rep.studentName.trim() } : {}),
              updatedAt: new Date().toISOString(),
            },
          }
        );
        updatedCount += r.modifiedCount || 0;
      }
      return res.status(200).json({ success: true, updatedCount });
    }

    if (req.method === 'POST' || req.method === 'PUT') {
      const { _id, ...booklet } = req.body || {};
      if (!booklet || !booklet.grade || !booklet.studentId) {
        return res.status(400).json({ error: 'grade et studentId sont requis' });
      }

      const id = booklet.id || `booklet_${booklet.grade.replace(/\s+/g, '')}_${(booklet.schoolYear || '2026_2027').replace(/\//g, '_')}_${(booklet.term || 'Semestre1').replace(/\s+/g, '')}_${booklet.studentId}`;
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
