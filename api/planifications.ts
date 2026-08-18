import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';

// Accepte MONGO_URL ou MONGODB_URI (les deux noms sont courants)
const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'planifications';

// Timeout de connexion réduit pour éviter des blocages trop longs
const CONNECT_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS  = 20_000;

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  // Réutiliser le client s'il est déjà connecté
  if (cachedClient) {
    try {
      // Vérifier que la connexion est toujours vivante
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch (_) {
      // Connexion perdue — on en recrée une
      console.warn('[MongoDB] Connexion cached perdue, reconnexion...');
      try { await cachedClient.close(); } catch (_) {}
      cachedClient = null;
    }
  }

  if (!MONGO_URL) {
    throw new Error(
      'Variable d\'environnement MONGO_URL (ou MONGODB_URI) non définie sur Vercel. ' +
      'Allez dans Project Settings > Environment Variables et ajoutez votre chaîne de connexion MongoDB Atlas.'
    );
  }

  // Valider le format basique de l'URL
  if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
    throw new Error(
      'MONGO_URL invalide : doit commencer par "mongodb://" ou "mongodb+srv://". ' +
      'Vérifiez votre chaîne de connexion MongoDB Atlas.'
    );
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
  console.log('[MongoDB] Connexion établie avec succès');
  return client;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers pour permettre les requêtes depuis le frontend
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, X-User-Role, X-Username, X-Import-Mode'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Rôle utilisateur depuis les headers
  const userRole = (req.headers['x-user-role'] as string || '').toLowerCase();
  const isAdminUser = userRole === 'admin';

  try {
    const client = await connectToDatabase();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // GET: Récupérer les planifications pour une matière/classe
    if (req.method === 'GET') {
      const { subject, grade, export: exportType } = req.query;

      // ── Export Excel/CSV: toutes les données ──────────────────────────────
      if (exportType === 'excel') {
        const allPlanifications = await collection.find({}).toArray();
        
        // Construire le CSV avec BOM UTF-8
        const headers = [
          'Titre', 'Matière', 'Niveau', 'Enseignant', 'Durée', 'Année scolaire',
          'Concept clé', 'Concepts connexes', 'Contexte mondial', 'Énoncé de recherche',
          'Questions factuelles', 'Questions conceptuelles', 'Questions débattables',
          'Objectifs', 'ATL', 'Contenu',
          'Activités apprentissage', 'Évaluation formative', 'Évaluation sommative',
          'Différenciation', 'Ressources',
          'Réflexion avant', 'Réflexion pendant', 'Réflexion après',
          'Critères évaluation', 'Séances (nombre)', 'Dernière mise à jour détails', 'Date modification'
        ];

        const rows: string[][] = [];
        for (const planif of allPlanifications) {
          const plans = planif.plans || [];
          for (const p of plans) {
            rows.push([
              p.title || '',
              p.subject || '',
              p.gradeLevel || '',
              p.teacherName || '',
              p.duration || '',
              p.schoolYear || '',
              p.keyConcept || '',
              (p.relatedConcepts || []).join('; '),
              p.globalContext || '',
              p.statementOfInquiry || '',
              (p.inquiryQuestions?.factual || []).join(' | '),
              (p.inquiryQuestions?.conceptual || []).join(' | '),
              (p.inquiryQuestions?.debatable || []).join(' | '),
              (p.objectives || []).join('; '),
              (Array.isArray(p.atlSkills) ? p.atlSkills : [p.atlSkills || '']).join('; '),
              (p.content || '').replace(/\n/g, ' '),
              (p.learningExperiences || '').replace(/\n/g, ' '),
              (p.formativeAssessment || '').replace(/\n/g, ' '),
              (p.summativeAssessment || '').replace(/\n/g, ' '),
              (p.differentiation || '').replace(/\n/g, ' '),
              (p.resources || '').replace(/\n/g, ' '),
              (p.reflection?.prior || '').replace(/\n/g, ' '),
              (p.reflection?.during || '').replace(/\n/g, ' '),
              (p.reflection?.after || '').replace(/\n/g, ' '),
              (p.assessments || []).map((a: any) => `Critère ${a.criterion}: ${a.criterionName}`).join('; '),
              String((p.sessions || []).length),
              p.lastDetailUpdate || '',
              planif.lastUpdated || '',
            ]);
          }
        }

        const BOM = '\uFEFF';
        const csvContent = BOM + [headers, ...rows]
          .map(row => row.map((cell: string) => `"${String(cell).replace(/"/g, '""')}"`).join(','))
          .join('\n');

        res.setHeader('Content-Type', 'text/csv;charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="export_toutes_donnees_PEI_${new Date().toISOString().slice(0,10)}.csv"`);
        return res.status(200).send(csvContent);
      }

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

    // Fournir des messages d'erreur lisibles selon le type d'erreur
    let userMessage = error.message || 'Erreur serveur inconnue';

    if (
      error.code === 'ENOTFOUND' ||
      (error.message && error.message.includes('ENOTFOUND'))
    ) {
      userMessage =
        'Impossible de résoudre le nom d\'hôte MongoDB. ' +
        'Vérifiez que MONGO_URL est correctement configurée dans les variables d\'environnement Vercel ' +
        'et que l\'IP de Vercel est autorisée dans MongoDB Atlas (Network Access > Allow from anywhere : 0.0.0.0/0).';
      // Invalider le cache pour forcer une nouvelle tentative de connexion
      if (cachedClient) {
        try { await cachedClient.close(); } catch (_) {}
        cachedClient = null;
      }
    } else if (
      error.message &&
      (error.message.includes('authentication failed') || error.message.includes('AuthenticationFailed'))
    ) {
      userMessage =
        'Échec d\'authentification MongoDB. ' +
        'Vérifiez le nom d\'utilisateur et le mot de passe dans votre chaîne MONGO_URL.';
      if (cachedClient) {
        try { await cachedClient.close(); } catch (_) {}
        cachedClient = null;
      }
    } else if (
      error.message &&
      (error.message.includes('MONGO_URL') || error.message.includes('MONGODB_URI'))
    ) {
      userMessage = error.message; // Message d'erreur de configuration déjà lisible
    }

    return res.status(500).json({
      error: 'Erreur serveur MongoDB',
      message: userMessage,
    });
  }
}
