import { MongoClient } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = process.env.MONGO_URL || '';
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'exams';

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  if (!MONGO_URL) {
    throw new Error('MONGO_URL non définie dans les variables d\'environnement');
  }

  const client = new MongoClient(MONGO_URL);
  await client.connect();
  cachedClient = client;
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
    console.error('❌ [API] Erreur MongoDB:', error);
    return res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
}
