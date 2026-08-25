import { MongoClient, ServerApiVersion } from 'mongodb';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import * as XLSX from 'xlsx';

// Accepte MONGO_URL ou MONGODB_URI (les deux noms sont courants)
const MONGO_URL = (process.env.MONGO_URL || process.env.MONGODB_URI || '').trim();
const DB_NAME = 'planpei';
const COLLECTION_NAME = 'planifications';

// In-memory store fallback en cas d'absence de MONGO_URL
const inMemoryStore = new Map<string, { key: string; subject: string; grade: string; plans: any[]; lastUpdated: string }>();

// Timeout de connexion réduit pour éviter des blocages trop longs
const CONNECT_TIMEOUT_MS = 5_000;
const SOCKET_TIMEOUT_MS  = 10_000;

let cachedClient: MongoClient | null = null;
let mongoDisabled = false;

async function connectToDatabase(): Promise<MongoClient | null> {
  if (!MONGO_URL || mongoDisabled) {
    return null;
  }

  // Réutiliser le client s'il est déjà connecté
  if (cachedClient) {
    try {
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch (_) {
      console.warn('[MongoDB] Connexion cached perdue, reconnexion...');
      try { await cachedClient.close(); } catch (_) {}
      cachedClient = null;
    }
  }

  // Valider le format basique de l'URL
  if (!MONGO_URL.startsWith('mongodb://') && !MONGO_URL.startsWith('mongodb+srv://')) {
    console.warn('[MongoDB] MONGO_URL invalide, basculement en mode local');
    return null;
  }

  try {
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
  } catch (err: any) {
    console.warn('[MongoDB] Impossible de se connecter à MongoDB Atlas, utilisation du stockage local:', err?.message || err);
    return null;
  }
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

  try {
    const client = await connectToDatabase();
    
    // ═════════════════════════════════════════════════════════════════════════
    // MODE LOCAL (IN-MEMORY) SI MONGO INDISPONIBLE
    // ═════════════════════════════════════════════════════════════════════════
    if (!client) {
      res.setHeader('X-Storage-Mode', 'in-memory');

      if (req.method === 'GET') {
        const { subject, grade, export: exportType } = req.query;

        if (exportType === 'excel' || exportType === 'xlsx') {
          const wb = XLSX.utils.book_new();
          const rows: any[] = [];
          for (const item of inMemoryStore.values()) {
            for (const p of item.plans || []) {
              rows.push({
                'ID_Unité': p.id || '',
                'Titre': p.title || '',
                'Matière': p.subject || item.subject,
                'Niveau_Classe': p.gradeLevel || item.grade,
                'Enseignant': p.teacherName || '',
                'Durée': p.duration || '',
                'Année_Scolaire': p.schoolYear || '2026/2027',
                'Concept_Clé': p.keyConcept || '',
                'Contexte_Mondial': p.globalContext || '',
                'Énoncé_de_Recherche': p.statementOfInquiry || '',
                'Dernière_Mise_à_Jour': item.lastUpdated || '',
                '_full_data_json': JSON.stringify(p),
              });
            }
          }
          const ws = XLSX.utils.json_to_sheet(rows);
          XLSX.utils.book_append_sheet(wb, ws, 'Unités PEI');
          const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });
          res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
          res.setHeader('Content-Disposition', `attachment; filename="export_PEI_${new Date().toISOString().slice(0,10)}.xlsx"`);
          return res.status(200).send(buffer);
        }

        if (!subject && grade) {
          const list = Array.from(inMemoryStore.values()).filter(item => item.grade === grade);
          return res.status(200).json(list);
        }

        if (subject && grade) {
          const key = `${subject}_${grade}`;
          const existing = inMemoryStore.get(key);
          if (existing) {
            return res.status(200).json(existing);
          }
          return res.status(200).json({ key, plans: [], lastUpdated: null });
        }

        return res.status(200).json(Array.from(inMemoryStore.values()));
      }

      if (req.method === 'POST') {
        const { subject, grade, plans } = req.body;
        if (!subject || !grade || !Array.isArray(plans)) {
          return res.status(400).json({ error: 'Les champs subject, grade et plans sont requis' });
        }
        const key = `${subject}_${grade}`;
        const now = new Date().toISOString();
        inMemoryStore.set(key, { key, subject, grade, plans, lastUpdated: now });
        return res.status(200).json({ success: true, key, modified: 1, upserted: 1, lastUpdated: now, mode: 'local' });
      }

      if (req.method === 'DELETE') {
        const { subject, grade } = req.query;
        if (subject && grade) {
          inMemoryStore.delete(`${subject}_${grade}`);
        }
        return res.status(200).json({ success: true, deleted: 1 });
      }

      return res.status(200).json({ success: true });
    }

    // ═════════════════════════════════════════════════════════════════════════
    // MODE MONGODB ATLAS
    // ═════════════════════════════════════════════════════════════════════════
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);

    // GET: Récupérer les planifications pour une matière/classe
    if (req.method === 'GET') {
      const { subject, grade, export: exportType } = req.query;

      // ── Export Excel: toutes les données complètes ──────────────────────
      if (exportType === 'excel' || exportType === 'xlsx') {
        const allPlanifications = await collection.find({}).toArray();
        const wb = XLSX.utils.book_new();
        const rows: any[] = [];

        const sanitizeCell = (val: any): any => {
          if (val === null || val === undefined) return '';
          if (typeof val === 'string') return val.length > 32000 ? val.slice(0, 32000) : val;
          if (typeof val === 'number' || typeof val === 'boolean') return val;
          const s = JSON.stringify(val);
          return s.length > 32000 ? s.slice(0, 32000) : s;
        };

        for (const planif of allPlanifications) {
          const plans = planif.plans || [];
          for (const p of plans) {
            const rawJson = JSON.stringify(p);
            const row: Record<string, any> = {
              'ID_Unité': sanitizeCell(p.id || ''),
              'Titre': sanitizeCell(p.title || ''),
              'Matière': sanitizeCell(p.subject || ''),
              'Niveau_Classe': sanitizeCell(p.gradeLevel || ''),
              'Enseignant': sanitizeCell(p.teacherName || ''),
              'Durée': sanitizeCell(p.duration || ''),
              'Année_Scolaire': sanitizeCell(p.schoolYear || '2026/2027'),
              'Nb_Heures': sanitizeCell(p.numberOfHours || ''),
              'Nb_Périodes': sanitizeCell(p.numberOfPeriods || ''),
              'Date_Début': sanitizeCell(p.startDate || ''),
              'Date_Fin': sanitizeCell(p.endDate || ''),
              'Concept_Clé': sanitizeCell(p.keyConcept || ''),
              'Concepts_Connexes': sanitizeCell((p.relatedConcepts || []).join('; ')),
              'Contexte_Mondial': sanitizeCell(p.globalContext || ''),
              'Énoncé_de_Recherche': sanitizeCell(p.statementOfInquiry || ''),
              'Questions_Factuelles': sanitizeCell((p.inquiryQuestions?.factual || []).join(' | ')),
              'Questions_Conceptuelles': sanitizeCell((p.inquiryQuestions?.conceptual || []).join(' | ')),
              'Questions_Débat': sanitizeCell((p.inquiryQuestions?.debatable || []).join(' | ')),
              'Objectifs_IB': sanitizeCell((p.objectives || []).join('; ')),
              'Compétences_ATL': sanitizeCell((Array.isArray(p.atlSkills) ? p.atlSkills : [p.atlSkills || '']).join('; ')),
              'Contenu_Notions': sanitizeCell((p.content || '').replace(/\n/g, ' ')),
              'Processus_Apprentissage': sanitizeCell((p.learningExperiences || '').replace(/\n/g, ' ')),
              'Évaluation_Formative': sanitizeCell((p.formativeAssessment || '').replace(/\n/g, ' ')),
              'Évaluation_Sommative': sanitizeCell((p.summativeAssessment || '').replace(/\n/g, ' ')),
              'Différenciation': sanitizeCell((p.differentiation || '').replace(/\n/g, ' ')),
              'Ressources': sanitizeCell((p.resources || '').replace(/\n/g, ' ')),
              'Réflexion_Avant': sanitizeCell((p.reflection?.prior || '').replace(/\n/g, ' ')),
              'Réflexion_Pendant': sanitizeCell((p.reflection?.during || '').replace(/\n/g, ' ')),
              'Réflexion_Après': sanitizeCell((p.reflection?.after || '').replace(/\n/g, ' ')),
              'Critères_Évaluation': sanitizeCell((p.assessments || []).map((a: any) => `Critère ${a.criterion}: ${a.criterionName}`).join('; ')),
              'Nb_Séances': sanitizeCell(String((p.sessions || []).length)),
              'Dernière_Mise_à_Jour': sanitizeCell(p.lastDetailUpdate || planif.lastUpdated || ''),
              '_full_data_json': rawJson.length > 30000 ? rawJson.slice(0, 30000) : rawJson,
            };
            if (rawJson.length > 30000) {
              row['_full_data_json_p2'] = rawJson.slice(30000, 60000);
            }
            if (rawJson.length > 60000) {
              row['_full_data_json_p3'] = rawJson.slice(60000, 90000);
            }
            rows.push(row);
          }
        }

        const ws = XLSX.utils.json_to_sheet(rows);
        XLSX.utils.book_append_sheet(wb, ws, 'Unités PEI');
        const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'buffer' });

        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
        res.setHeader('Content-Disposition', `attachment; filename="export_toutes_donnees_PEI_${new Date().toISOString().slice(0,10)}.xlsx"`);
        return res.status(200).send(buffer);
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
