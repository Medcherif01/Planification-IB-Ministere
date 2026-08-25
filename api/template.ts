import type { VercelRequest, VercelResponse } from '@vercel/node';
import fs from 'fs';
import path from 'path';

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

    const urlWithCacheBust = `${templateUrl}&t=${Date.now()}`;

    const response = await fetch(urlWithCacheBust, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; PlanificationIB/1.0)',
        'Accept': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/octet-stream,*/*',
        'Cache-Control': 'no-cache',
      },
      redirect: 'follow',
    });

    if (response.ok) {
      const buffer = await response.arrayBuffer();
      if (buffer.byteLength > 100) {
        console.log(`[TEMPLATE API] Template "${type}" téléchargé depuis Google Docs (${buffer.byteLength} bytes)`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Length', buffer.byteLength);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(Buffer.from(buffer));
      }
    }
  } catch (error: any) {
    console.warn(`[TEMPLATE API] Échec téléchargement Google Docs pour "${type}", essai fallback local:`, error.message);
  }

  // Fallback local file if Google Docs is unavailable
  try {
    const localPaths = [
      path.join(process.cwd(), 'public', 'templates', `${type}.docx`),
      path.join(process.cwd(), 'templates', `${type}.docx`),
    ];
    for (const p of localPaths) {
      if (fs.existsSync(p)) {
        const fileBuf = fs.readFileSync(p);
        console.log(`[TEMPLATE API] Utilisation du template local "${type}" (${fileBuf.byteLength} bytes)`);
        res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
        res.setHeader('Content-Length', fileBuf.byteLength);
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).send(fileBuf);
      }
    }
  } catch (e: any) {
    console.error(`[TEMPLATE API] Erreur lecture fallback local:`, e.message);
  }

  return res.status(502).json({
    error: `Impossible de charger le modèle Word "${type}"`,
  });
}
