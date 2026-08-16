import type { VercelRequest, VercelResponse } from '@vercel/node';

// Liste des templates autorisés (clés → URLs Google Docs)
const ALLOWED_TEMPLATES: Record<string, string> = {
  plan: 'https://docs.google.com/document/d/144_yUOythmkjTsP9PA4k5YLOpRFyV7Zv/export?format=docx',
  eval: 'https://docs.google.com/document/d/15ASfn_LF-jsPh5CYn4FJvEBSpm31hPAA/export?format=docx',
  exam: 'https://docs.google.com/document/d/1Gd7bZPsRNPbL5bpv_Pq6aAcSUgjF_FCR/export?format=docx',
};

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  const { type } = req.query;

  if (!type || typeof type !== 'string' || !ALLOWED_TEMPLATES[type]) {
    return res.status(400).json({
      error: 'Type de template invalide. Valeurs acceptées : plan, eval, exam',
    });
  }

  const templateUrl = ALLOWED_TEMPLATES[type];

  try {
    console.log(`[TEMPLATE API] Téléchargement du template "${type}" depuis Google Docs...`);

    // Ajouter un cache-buster pour forcer Google à renvoyer le fichier le plus récent
    const urlWithCacheBust = `${templateUrl}&t=${Date.now()}`;

    const response = await fetch(urlWithCacheBust, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlanificationIB/1.0)',
        'Accept': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/octet-stream,*/*',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    if (!response.ok) {
      console.error(`[TEMPLATE API] Échec HTTP ${response.status} pour template "${type}"`);
      return res.status(502).json({
        error: `Impossible de télécharger le template depuis Google Docs (HTTP ${response.status})`,
      });
    }

    const contentType = response.headers.get('content-type') || 'application/octet-stream';
    const buffer = await response.arrayBuffer();

    if (buffer.byteLength < 100) {
      console.error(`[TEMPLATE API] Template "${type}" trop petit (${buffer.byteLength} bytes) — probablement une erreur Google`);
      return res.status(502).json({
        error: 'Le template téléchargé est vide ou invalide',
      });
    }

    console.log(`[TEMPLATE API] Template "${type}" téléchargé avec succès (${buffer.byteLength} bytes)`);

    // Renvoyer le fichier binaire au frontend
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.setHeader('Content-Length', buffer.byteLength);
    res.setHeader('Cache-Control', 'no-store');
    res.status(200).send(Buffer.from(buffer));

  } catch (error: any) {
    console.error(`[TEMPLATE API] Erreur lors du téléchargement du template "${type}":`, error);
    return res.status(500).json({
      error: 'Erreur serveur lors du téléchargement du template',
      message: error.message,
    });
  }
}
