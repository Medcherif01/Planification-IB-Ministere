import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'exams';

const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS  = 20_000;

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) {
    try {
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch (_) {
      console.warn('[MongoDB/exams] Connexion cached perdue, reconnexion...');
      try { await cachedClient.close(); } catch (_) {}
      cachedClient = null;
    }
  }

  if (!MONGO_URL) {
    throw new Error(
      'Variable d\'environnement MONGO_URL (ou MONGODB_URI) non définie sur Vercel.'
    );
  }

  if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
    throw new Error('MONGO_URL invalide : doit commencer par "mongodb://" ou "mongodb+srv://".');
  }

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
  console.log('[MongoDB/exams] Connexion établie avec succès');
  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers pour permettre les requêtes depuis le frontend
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
        .sort({ createdAt: -1 }) // Les plus récents en premier
        .limit(100) // Limiter à 100 résultats
        .toArray();

      return res.status(200).json(exams);
    }

    // POST: Sauvegarder un nouvel examen
    if (req.method === 'POST') {
      const exam = req.body;

      if (!exam.subject || !exam.grade || !exam.semester) {
        return res.status(400).json({ 
          error: 'Les champs subject, grade et semester sont requis' 
        });
      }

      // Ajouter les timestamps
      exam.createdAt = new Date();
      exam.updatedAt = new Date();

      const result = await collection.insertOne(exam);

      return res.status(201).json({
        success: true,
        id: result.insertedId,
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

    // Méthode non supportée
    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (error: any) {
    console.error('❌ [API/exams] Erreur MongoDB:', error);

    let userMessage = error.message || 'Erreur serveur inconnue';

    if (error.code === 'ENOTFOUND' || (error.message && error.message.includes('ENOTFOUND'))) {
      userMessage =
        'Impossible de résoudre le nom d\'hôte MongoDB. ' +
        'Vérifiez MONGO_URL dans les variables d\'environnement Vercel ' +
        'et autorisez l\'IP 0.0.0.0/0 dans MongoDB Atlas (Network Access).';
      if (cachedClient) {
        try { await cachedClient.close(); } catch (_) {}
        cachedClient = null;
      }
    } else if (error.message && error.message.includes('authentication')) {
      userMessage = 'Échec d\'authentification MongoDB. Vérifiez les identifiants dans MONGO_URL.';
      if (cachedClient) {
        try { await cachedClient.close(); } catch (_) {}
        cachedClient = null;
      }
    }

    return res.status(500).json({
      error: 'Erreur serveur MongoDB',
      message: userMessage,
    });
  }
}
