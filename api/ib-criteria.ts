import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'ib_criteria';

let cachedClient: MongoClient | null = null;
const inMemoryCriteria = new Map<string, any>();

async function connectToDatabase(): Promise<MongoClient | null> {
  if (!MONGO_URL) return null;
  if (cachedClient) return cachedClient;
  try {
    const client = new MongoClient(MONGO_URL, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: false,
        deprecationErrors: false,
      },
      connectTimeoutMS: 5000,
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
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST,DELETE');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }

  try {
    const client = await connectToDatabase();
    
    // In-memory fallback
    if (!client) {
      res.setHeader('X-Storage-Mode', 'in-memory');
      if (req.method === 'GET') {
        const { subject, grade } = req.query;
        if (!subject || !grade) return res.status(400).json({ error: 'subject et grade requis' });
        const key = `${String(subject).trim()}_${String(grade).trim()}`;
        return res.status(200).json({ config: inMemoryCriteria.get(key) ?? null });
      }
      if (req.method === 'POST') {
        const config = req.body;
        if (!config?.subject || !config?.grade || !Array.isArray(config?.criteria)) {
          return res.status(400).json({ error: 'Champs subject, grade et criteria requis' });
        }
        const key = `${config.subject.trim()}_${config.grade.trim()}`;
        inMemoryCriteria.set(key, config);
        return res.status(200).json({ success: true, key });
      }
      if (req.method === 'DELETE') {
        const { subject, grade } = req.query;
        if (subject && grade) {
          inMemoryCriteria.delete(`${String(subject).trim()}_${String(grade).trim()}`);
        }
        return res.status(200).json({ success: true });
      }
      return res.status(200).json({ success: true });
    }

    const collection = client.db(DB_NAME).collection(COLLECTION_NAME);

    // GET — load config for subject+grade
    if (req.method === 'GET') {
      const { subject, grade } = req.query;
      if (!subject || !grade) {
        return res.status(400).json({ error: 'subject et grade requis' });
      }
      const key = `${String(subject).trim()}_${String(grade).trim()}`;
      const doc = await collection.findOne({ key });
      return res.status(200).json({ config: doc?.config ?? null });
    }

    // POST — save / upsert config
    if (req.method === 'POST') {
      const config = req.body;
      if (!config?.subject || !config?.grade || !Array.isArray(config?.criteria)) {
        return res.status(400).json({ error: 'Champs subject, grade et criteria requis' });
      }
      const key = `${config.subject.trim()}_${config.grade.trim()}`;
      await collection.updateOne(
        { key },
        { $set: { key, config, updatedAt: new Date().toISOString() } },
        { upsert: true }
      );
      return res.status(200).json({ success: true, key });
    }

    // DELETE — remove config for subject+grade
    if (req.method === 'DELETE') {
      const { subject, grade } = req.query;
      if (!subject || !grade) {
        return res.status(400).json({ error: 'subject et grade requis' });
      }
      const key = `${String(subject).trim()}_${String(grade).trim()}`;
      await collection.deleteOne({ key });
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Méthode non autorisée' });
  } catch (error: any) {
    console.warn('⚠️ [API/ib-criteria] Fallback local suite à erreur:', error?.message);
    return res.status(200).json({ config: null });
  }
}

