import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─────────────────────────────────────────────────────────────────────────────
// Collecte toutes les clés Gemini disponibles
// GEMINI_API_KEY_1 … GEMINI_API_KEY_8 puis GEMINI_API_KEY (générique)
// ─────────────────────────────────────────────────────────────────────────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const k = (process.env[`GEMINI_API_KEY_${i}`] || '').trim();
    if (k) keys.push(k);
  }
  const generic = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  if (generic && !keys.includes(generic)) keys.push(generic);
  return keys;
}

const GEMINI_MODEL    = 'gemini-2.0-flash';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

// ─────────────────────────────────────────────────────────────────────────────
// Détermine si une erreur HTTP signifie quota/rate-limit
// ─────────────────────────────────────────────────────────────────────────────
function isQuotaError(status: number, body: string): boolean {
  if (status === 429 || status === 503) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests') ||
    lower.includes('overloaded')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tentative Gemini avec UNE clé donnée
// ─────────────────────────────────────────────────────────────────────────────
async function tryGeminiKey(
  apiKey: string,
  keyLabel: string,
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  const requestBody: Record<string, any> = {
    contents: Array.isArray(contents)
      ? contents
      : [{ role: 'user', parts: [{ text: contents }] }],
  };

  if (systemInstruction) {
    requestBody.systemInstruction = {
      role: 'user',
      parts: [{ text: systemInstruction }],
    };
  }

  const geminiConfig: Record<string, any> = {
    temperature: generationConfig?.temperature ?? 0.7,
    maxOutputTokens: generationConfig?.maxOutputTokens ?? 8192,
  };
  if (generationConfig?.responseMimeType) {
    geminiConfig.responseMimeType = generationConfig.responseMimeType;
  }
  requestBody.generationConfig = geminiConfig;

  const url = `${GEMINI_BASE_URL}?key=${apiKey}&alt=sse`;
  const geminiResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    if (isQuotaError(geminiResponse.status, errorBody)) {
      console.warn(`⚠️ [${keyLabel}] Quota épuisé (${geminiResponse.status}), rotation…`);
      const err: any = new Error(`Quota épuisé: ${keyLabel}`);
      err.isQuota = true;
      throw err;
    }
    console.error(`❌ [${keyLabel}] Erreur ${geminiResponse.status}:`, errorBody.slice(0, 300));
    throw new Error(`Gemini error ${geminiResponse.status}: ${errorBody.slice(0, 200)}`);
  }

  const reader = geminiResponse.body?.getReader();
  if (!reader) throw new Error('Aucun corps de réponse Gemini');

  const decoder = new TextDecoder();
  let fullText = '';
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    for (const line of lines) {
      const t = line.trim();
      if (!t || !t.startsWith('data: ')) continue;
      const j = t.slice(6).trim();
      if (j === '[DONE]') continue;
      try {
        const chunk = JSON.parse(j);
        const txt = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) fullText += txt;
      } catch { /* ignore */ }
    }
  }
  // Flush any remaining buffer
  if (buffer.trim().startsWith('data: ')) {
    try {
      const j = buffer.trim().slice(6);
      if (j && j !== '[DONE]') {
        const chunk = JSON.parse(j);
        const txt = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (txt) fullText += txt;
      }
    } catch { /* ignore */ }
  }

  console.log(`✅ [${keyLabel}] Gemini OK — ${fullText.length} chars`);
  return fullText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotation automatique sur toutes les clés Gemini
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithGeminiRotation(
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error('Aucune clé Gemini configurée. Veuillez ajouter GEMINI_API_KEY_1 dans les variables d\'environnement Vercel.');
  }

  console.log(`🔑 ${keys.length} clé(s) Gemini disponible(s) — démarrage rotation…`);

  for (let i = 0; i < keys.length; i++) {
    const label = i < 8 ? `GEMINI_API_KEY_${i + 1}` : 'GEMINI_API_KEY';
    try {
      const text = await tryGeminiKey(keys[i], label, contents, systemInstruction, generationConfig);
      if (i > 0) console.log(`✅ Succès avec la clé #${i + 1} (${i} clé(s) épuisée(s) avant)`);
      return text;
    } catch (err: any) {
      if (err.isQuota) {
        console.warn(`⚠️ [${label}] Quota épuisé (429), rotation vers la clé suivante…`);
        continue;
      }
      throw err; // erreur non-quota → propager immédiatement
    }
  }

  console.error('❌ Toutes les clés Gemini sont épuisées ou en erreur.');
  const err: any = new Error('Toutes les clés Gemini sont épuisées. Réessayez dans quelques minutes.');
  err.isQuota = true;
  err.allExhausted = true;
  throw err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal Vercel — Gemini UNIQUEMENT
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { return res.status(405).json({ error: 'Method not allowed' }); }

  const geminiKeys = getGeminiKeys();

  if (geminiKeys.length === 0) {
    return res.status(500).json({
      error: 'No Gemini API key configured',
      message: "Veuillez configurer GEMINI_API_KEY_1 (ou GEMINI_API_KEY) dans les variables d'environnement Vercel.",
    });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    if (!contents) {
      return res.status(400).json({ error: 'Missing contents in request body' });
    }

    console.log(`🔑 ${geminiKeys.length} clé(s) Gemini — lancement génération…`);

    const fullText = await generateWithGeminiRotation(contents, systemInstruction, generationConfig);

    console.log(`✅ Génération OK via Gemini — ${fullText.length} chars`);
    return res.status(200).json({ text: fullText });

  } catch (error: any) {
    console.error('❌ [API/generate] Erreur:', error);
    const msg: string = error?.message || String(error);

    if (
      msg.includes('429') ||
      msg.toLowerCase().includes('quota') ||
      msg.toLowerCase().includes('épuisé') ||
      msg.toLowerCase().includes('rate') ||
      (error as any)?.isQuota
    ) {
      return res.status(429).json({
        error: 'quota_exceeded',
        message: "Toutes les clés Gemini sont temporairement épuisées (quota journalier atteint). Veuillez réessayer demain ou ajouter de nouvelles clés dans les variables Vercel.",
      });
    }

    return res.status(500).json({ error: 'Internal server error', message: msg });
  }
}
