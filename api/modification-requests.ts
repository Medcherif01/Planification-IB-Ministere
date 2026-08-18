import { MongoClient, ServerApiVersion, ObjectId } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION = 'modification_requests';

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

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Role, X-Username');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const db = await getDB();
    const col = db.collection(COLLECTION);
    const callerRole = req.headers['x-user-role'] as string;
    const callerUsername = req.headers['x-username'] as string;

    // ── GET — Liste des demandes ─────────────────────────────────────────────
    if (req.method === 'GET') {
      let filter: Record<string, unknown> = {};
      // Admin voit tout, enseignant voit uniquement ses demandes
      if (callerRole !== 'admin') {
        filter = { teacherUsername: callerUsername };
      }
      const status = req.query.status as string;
      if (status) filter.status = status;
      const requests = await col.find(filter).sort({ createdAt: -1 }).toArray();
      return res.status(200).json(requests.map(r => ({ ...r, id: r._id.toString() })));
    }

    // ── POST — Créer une demande (enseignant) ────────────────────────────────
    if (req.method === 'POST') {
      const { teacherUsername, teacherDisplayName, subject, grade, unitId, unitTitle, requestType, description } = req.body;
      if (!teacherUsername || !subject || !unitTitle || !description) {
        return res.status(400).json({ error: 'Champs obligatoires manquants' });
      }
      const result = await col.insertOne({
        teacherUsername,
        teacherDisplayName: teacherDisplayName || teacherUsername,
        subject,
        grade: grade || '',
        unitId: unitId || '',
        unitTitle,
        requestType: requestType || 'modification',
        description,
        status: 'pending', // pending | approved | rejected | completed
        createdAt: new Date().toISOString(),
        adminNote: '',
        approvedAt: null,
        completedAt: null,
      });
      return res.status(201).json({ success: true, id: result.insertedId.toString() });
    }

    // ── PUT — Mettre à jour le statut (admin) ou marquer comme terminée (enseignant) ──
    if (req.method === 'PUT') {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: 'id requis' });

      const { status, adminNote } = req.body;
      const update: Record<string, unknown> = {};

      if (callerRole === 'admin') {
        // Admin peut changer le statut
        if (status) update.status = status;
        if (adminNote !== undefined) update.adminNote = adminNote;
        if (status === 'approved') update.approvedAt = new Date().toISOString();
        if (status === 'rejected') update.rejectedAt = new Date().toISOString();
      } else {
        // Enseignant peut seulement marquer comme terminée (completed)
        if (status === 'completed') {
          // Vérifier que la demande appartient à cet enseignant et est approved
          const existing = await col.findOne({ _id: new ObjectId(id as string) });
          if (!existing || existing.teacherUsername !== callerUsername) {
            return res.status(403).json({ error: 'Accès interdit' });
          }
          if (existing.status !== 'approved') {
            return res.status(400).json({ error: 'Cette demande n\'est pas approuvée' });
          }
          update.status = 'completed';
          update.completedAt = new Date().toISOString();
        } else {
          return res.status(403).json({ error: 'Action non autorisée' });
        }
      }

      await col.updateOne({ _id: new ObjectId(id as string) }, { $set: update });
      return res.status(200).json({ success: true });
    }

    // ── DELETE — Supprimer une demande (admin seulement) ─────────────────────
    if (req.method === 'DELETE') {
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
    console.error('[API modification-requests] Erreur:', error);
    return res.status(500).json({ error: 'Erreur serveur', message: error.message });
  }
}
