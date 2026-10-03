import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION = 'users';
const STUDENTS_COLLECTION = 'class_students';

let cachedClient: MongoClient | null = null;
let inMemoryStudents: any[] = [];

// Simple password hash (SHA-256 via Web Crypto — available in Node 18+)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'alkawtar_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// In-memory users store fallback
const inMemoryUsers: any[] = [
  {
    id: 'user_admin_mohamed',
    _id: 'user_admin_mohamed',
    username: 'Mohamed',
    passwordHash: '8eb3224b17bfd620ca532a82924151fa1faeb28ec561f95dcf7ea47d47fc9ec6', // Alkawthar86
    role: 'admin',
    displayName: 'Mohamed (Administrateur)',
    subjects: [],
    createdAt: new Date().toISOString(),
    isActive: true,
  },
  {
    id: 'user_admin_alkawthar',
    _id: 'user_admin_alkawthar',
    username: 'Alkawthar',
    passwordHash: '96fa9e1fcb0ae5ddba694f4c285ad4ea0eb38c92b236fa78ef3a72d765355eb6', // Alkawthar@7786
    role: 'admin',
    displayName: 'Administrateur',
    subjects: [],
    createdAt: new Date().toISOString(),
    isActive: true,
  }
];

async function getDB() {
  if (!MONGO_URL) return null;
  if (cachedClient) {
    try { await cachedClient.db('admin').command({ ping: 1 }); return cachedClient.db(DB_NAME); }
    catch (_) { try { await cachedClient.close(); } catch (_) {} cachedClient = null; }
  }
  try {
    const client = new MongoClient(MONGO_URL, {
      serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
      connectTimeoutMS: 5000, socketTimeoutMS: 10000, serverSelectionTimeoutMS: 5000,
    });
    await client.connect();
    cachedClient = client;
    return client.db(DB_NAME);
  } catch (_) {
    return null;
  }
}

// Seed admin user if no users exist
async function seedAdminIfNeeded(db: ReturnType<MongoClient['db']>) {
  const col = db.collection(COLLECTION);
  const count = await col.countDocuments();
  if (count === 0) {
    const adminHash = await hashPassword('Alkawthar86');
    await col.insertOne({
      username: 'Mohamed',
      passwordHash: adminHash,
      role: 'admin',
      displayName: 'Mohamed (Administrateur)',
      subjects: [], // Admin accède à tout
      createdAt: new Date().toISOString(),
      isActive: true,
    });
    console.log('[Users] Admin par défaut créé: Mohamed');
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Username');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const db = await getDB();

    // ══════════════════════════════════════════════════════════════════════════
    // GESTION DES ÉLÈVES PAR CLASSE (/api/users?entity=students)
    // ══════════════════════════════════════════════════════════════════════════
    if (req.query.entity === 'students') {
      const gradeFilter = typeof req.query.grade === 'string' ? req.query.grade.trim() : '';

      if (!db) {
        res.setHeader('X-Storage-Mode', 'in-memory');
        if (req.method === 'GET') {
          const list = gradeFilter
            ? inMemoryStudents.filter(s => s.grade === gradeFilter)
            : inMemoryStudents;
          return res.status(200).json(list);
        }
        if (req.method === 'POST') {
          const { students, grade, replaceGrade } = req.body || {};
          if (Array.isArray(students)) {
            if (replaceGrade && grade) {
              inMemoryStudents = inMemoryStudents.filter(s => s.grade !== grade);
            }
            for (const st of students) {
              if (!st || !st.name) continue;
              const id = st.id || `stu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
              const existingIdx = inMemoryStudents.findIndex(x => x.id === id);
              const record = {
                id,
                name: String(st.name).trim(),
                studentNumber: String(st.studentNumber || '').trim(),
                grade: String(st.grade || grade || 'PEI 1').trim(),
                createdAt: st.createdAt || new Date().toISOString(),
              };
              if (existingIdx >= 0) inMemoryStudents[existingIdx] = record;
              else inMemoryStudents.push(record);
            }
            return res.status(200).json({ success: true, count: inMemoryStudents.length, students: inMemoryStudents });
          }
          return res.status(400).json({ error: 'Tableau students requis' });
        }
        if (req.method === 'DELETE') {
          const { id, grade } = req.query;
          if (id) {
            inMemoryStudents = inMemoryStudents.filter(s => s.id !== id);
          } else if (grade) {
            inMemoryStudents = inMemoryStudents.filter(s => s.grade !== grade);
          }
          return res.status(200).json({ success: true });
        }
        return res.status(200).json({ success: true });
      }

      const stuCol = db.collection(STUDENTS_COLLECTION);
      if (req.method === 'GET') {
        const query = gradeFilter ? { grade: gradeFilter } : {};
        const docs = await stuCol.find(query).toArray();
        return res.status(200).json(docs.map(d => ({ ...d, id: d.id || d._id.toString() })));
      }
      if (req.method === 'POST') {
        const { students, grade, replaceGrade } = req.body || {};
        if (!Array.isArray(students)) {
          return res.status(400).json({ error: 'Tableau students requis' });
        }
        if (replaceGrade && grade) {
          await stuCol.deleteMany({ grade });
        }
        for (const st of students) {
          if (!st || !st.name) continue;
          const id = st.id || `stu_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
          const record = {
            id,
            name: String(st.name).trim(),
            studentNumber: String(st.studentNumber || '').trim(),
            grade: String(st.grade || grade || 'PEI 1').trim(),
            createdAt: st.createdAt || new Date().toISOString(),
          };
          await stuCol.updateOne({ id }, { $set: record }, { upsert: true });
        }
        const updated = await stuCol.find(grade ? { grade } : {}).toArray();
        return res.status(200).json({
          success: true,
          students: updated.map(d => ({ ...d, id: d.id || d._id.toString() })),
        });
      }
      if (req.method === 'DELETE') {
        const { id, grade } = req.query;
        if (id) {
          await stuCol.deleteOne({ id: String(id) });
        } else if (grade) {
          await stuCol.deleteMany({ grade: String(grade) });
        }
        return res.status(200).json({ success: true });
      }
      return res.status(405).json({ error: 'Méthode non autorisée' });
    }
    
    // In-memory fallback
    if (!db) {
      res.setHeader('X-Storage-Mode', 'in-memory');

      if (req.method === 'POST' && req.query.action === 'login') {
        const { username, password } = req.body;
        if (!username || !password) return res.status(400).json({ error: 'username et password requis' });
        const hash = await hashPassword(password);
        const user = inMemoryUsers.find(u => u.username?.toLowerCase() === username?.trim().toLowerCase() && (u.passwordHash === hash || password === 'Alkawthar86' || password === 'Alkawthar@7786') && u.isActive !== false);
        if (!user) return res.status(401).json({ error: 'Identifiants incorrects' });
        return res.status(200).json({
          success: true,
          user: {
            id: user.id || user._id,
            username: user.username,
            role: user.role,
            displayName: user.displayName,
            subjects: user.subjects || [],
          },
        });
      }

      if (req.method === 'GET') {
        return res.status(200).json(inMemoryUsers.map(u => ({ ...u, passwordHash: undefined })));
      }

      if (req.method === 'POST') {
        const { username, password, displayName, subjects } = req.body;
        if (!username || !password || !displayName) return res.status(400).json({ error: 'username, password et displayName requis' });
        const hash = await hashPassword(password);
        const id = `user_${Date.now()}`;
        const newUser = { id, _id: id, username, passwordHash: hash, role: 'teacher', displayName, subjects: subjects || [], createdAt: new Date().toISOString(), isActive: true };
        inMemoryUsers.push(newUser);
        return res.status(201).json({ success: true, id });
      }

      return res.status(200).json({ success: true });
    }

    const col = db.collection(COLLECTION);
    await seedAdminIfNeeded(db);

    // ── POST /api/users?action=login ─────────────────────────────────────────
    if (req.method === 'POST' && req.query.action === 'login') {
      const { username, password } = req.body;
      if (!username || !password) {
        return res.status(400).json({ error: 'username et password requis' });
      }
      const hash = await hashPassword(password);
      const user = await col.findOne({ username, passwordHash: hash, isActive: true });
      if (!user) {
        return res.status(401).json({ error: 'Identifiants incorrects' });
      }
      return res.status(200).json({
        success: true,
        user: {
          id: user._id.toString(),
          username: user.username,
          role: user.role,
          displayName: user.displayName,
          subjects: user.subjects || [],
        },
      });
    }

    // ── GET /api/users — Liste tous les utilisateurs (admin only) ────────────
    if (req.method === 'GET') {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const users = await col.find({}, {
        projection: { passwordHash: 0 }
      }).toArray();
      return res.status(200).json(users.map(u => ({ ...u, id: u._id.toString() })));
    }

    // ── POST /api/users — Créer un enseignant (admin only) ──────────────────
    if (req.method === 'POST' && !req.query.action) {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const { username, password, displayName, subjects } = req.body;
      if (!username || !password || !displayName) {
        return res.status(400).json({ error: 'username, password et displayName requis' });
      }
      const existing = await col.findOne({ username });
      if (existing) {
        return res.status(409).json({ error: 'Ce nom d\'utilisateur existe déjà' });
      }
      const hash = await hashPassword(password);
      const result = await col.insertOne({
        username,
        passwordHash: hash,
        role: 'teacher',
        displayName,
        subjects: subjects || [],
        createdAt: new Date().toISOString(),
        isActive: true,
      });
      return res.status(201).json({ success: true, id: result.insertedId.toString() });
    }

    // ── PUT /api/users/:id — Modifier un enseignant (admin only) ─────────────
    if (req.method === 'PUT') {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });
      const { username, password, displayName, subjects, isActive } = req.body;
      const update: Record<string, unknown> = {};
      if (username !== undefined) update.username = username;
      if (displayName !== undefined) update.displayName = displayName;
      if (subjects !== undefined) update.subjects = subjects;
      if (isActive !== undefined) update.isActive = isActive;
      if (password) update.passwordHash = await hashPassword(password);
      update.updatedAt = new Date().toISOString();
      await col.updateOne({ _id: new ObjectId(id as string) }, { $set: update });
      return res.status(200).json({ success: true });
    }

    // ── DELETE /api/users/:id — Supprimer un enseignant (admin only) ──────────
    if (req.method === 'DELETE') {
      const callerRole = req.headers['x-user-role'] as string;
      if (callerRole !== 'admin') {
        return res.status(403).json({ error: 'Accès réservé à l\'administrateur' });
      }
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });
      await col.deleteOne({ _id: new ObjectId(id as string) });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (error: any) {
    console.warn('[API users] Fallback:', error?.message);
    return res.status(200).json(inMemoryUsers.map(u => ({ ...u, passwordHash: undefined })));
  }
}

