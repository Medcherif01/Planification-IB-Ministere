import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION = 'users';

let cachedClient: MongoClient | null = null;

async function getDB() {
  if (cachedClient) {
    try { await cachedClient.db('admin').command({ ping: 1 }); return cachedClient.db(DB_NAME); }
    catch (_) { try { await cachedClient.close(); } catch (_) {} cachedClient = null; }
  }
  const client = new MongoClient(MONGO_URL, {
    serverApi: { version: ServerApiVersion.v1, strict: false, deprecationErrors: false },
    connectTimeoutMS: 10000, socketTimeoutMS: 20000, serverSelectionTimeoutMS: 10000,
  });
  await client.connect();
  cachedClient = client;
  return client.db(DB_NAME);
}

// Simple password hash (SHA-256 via Web Crypto — available in Node 18+)
async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + 'alkawtar_salt_2024');
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
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
    console.error('[API users] Erreur:', error);
    return res.status(500).json({ error: 'Erreur serveur', message: error.message });
  }
}
