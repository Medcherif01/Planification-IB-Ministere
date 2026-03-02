import { MongoClient } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

const MONGO_URL = process.env.MONGO_URL || '';
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'planifications';

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

    // GET: Récupérer les planifications pour une matière/classe
    if (req.method === 'GET') {
      const { subject, grade } = req.query;

      // Si seulement grade est fourni, retourner toutes les matières pour cette classe
      if (!subject && grade) {
        const planifications = await collection.find({ grade }).toArray();
        return res.status(200).json(planifications);
      }

      if (!subject || !grade) {
        return res.status(400).json({ 
          error: 'Les paramètres subject et grade sont requis (ou seulement grade pour toutes les matières)' 
        });
      }

      const key = `${subject}_${grade}`;
      const planification = await collection.findOne({ key });

      if (planification) {
        return res.status(200).json({ 
          key: planification.key,
          plans: planification.plans,
          lastUpdated: planification.lastUpdated
        });
      } else {
        return res.status(200).json({ 
          key,
          plans: [],
          lastUpdated: null
        });
      }
    }

    // POST: Sauvegarder/Mettre à jour les planifications
    if (req.method === 'POST') {
      const { subject, grade, plans } = req.body;

      if (!subject || !grade || !Array.isArray(plans)) {
        return res.status(400).json({ 
          error: 'Les champs subject, grade et plans (array) sont requis' 
        });
      }

      const key = `${subject}_${grade}`;
      const now = new Date().toISOString();

      const result = await collection.updateOne(
        { key },
        {
          $set: {
            key,
            subject,
            grade,
            plans,
            lastUpdated: now
          }
        },
        { upsert: true }
      );

      return res.status(200).json({
        success: true,
        key,
        modified: result.modifiedCount,
        upserted: result.upsertedCount,
        lastUpdated: now
      });
    }

    // DELETE: Supprimer une planification
    if (req.method === 'DELETE') {
      const { subject, grade } = req.query;

      if (!subject || !grade) {
        return res.status(400).json({ 
          error: 'Les paramètres subject et grade sont requis' 
        });
      }

      const key = `${subject}_${grade}`;
      const result = await collection.deleteOne({ key });

      return res.status(200).json({
        success: true,
        deleted: result.deletedCount
      });
    }

    // Méthode non supportée
    return res.status(405).json({ error: 'Méthode non autorisée' });

  } catch (error: any) {
    console.error('Erreur API MongoDB:', error);
    return res.status(500).json({ 
      error: 'Erreur serveur',
      message: error.message 
    });
  }
}
