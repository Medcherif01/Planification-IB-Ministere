import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─────────────────────────────────────────────────────────────────────────────
// Collecte toutes les clés Gemini disponibles dans l'ordre de priorité :
// GEMINI_API_KEY_1, GEMINI_API_KEY_2, …, GEMINI_API_KEY_8, puis GEMINI_API_KEY
// Seules les clés non-vides sont retenues.
// ─────────────────────────────────────────────────────────────────────────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  for (let i = 1; i <= 8; i++) {
    const k = process.env[`GEMINI_API_KEY_${i}`] || '';
    if (k.trim()) keys.push(k.trim());
  }
  // Clé générique en dernier (GEMINI_API_KEY ou VITE_GEMINI_API_KEY)
  const generic = (process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '').trim();
  if (generic && !keys.includes(generic)) keys.push(generic);
  return keys;
}

const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_BASE_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

// OpenAI / GROQ — utilisé comme dernier recours si TOUTES les clés Gemini sont épuisées
const OPENAI_API_KEY   = (process.env.OPENAI_API_KEY  || '').trim();
const OPENAI_BASE_URL  = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
const OPENAI_MODEL     = 'gpt-4o';
const GROQ_API_KEY     = (process.env.GROQ_API_KEY    || '').trim();
const GROQ_BASE_URL    = 'https://api.groq.com/openai/v1';
const GROQ_MODEL       = 'llama-3.3-70b-versatile';

// ─────────────────────────────────────────────────────────────────────────────
// Détermine si une erreur HTTP signifie un quota/rate-limit épuisé
// ─────────────────────────────────────────────────────────────────────────────
function isQuotaError(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status === 503) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests')
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Tentative Gemini avec UNE clé donnée
// Retourne le texte généré ou lance une erreur.
// Lance { quota: true } si c'est un problème de quota (pour déclencher la rotation).
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

  // Filtrer les clés inconnues de generationConfig pour Gemini
  // (éviter de passer des champs non supportés)
  const geminiConfig: Record<string, any> = {
    temperature: 0.7,
    maxOutputTokens: 8192,
  };
  if (generationConfig?.temperature !== undefined) geminiConfig.temperature = generationConfig.temperature;
  if (generationConfig?.maxOutputTokens !== undefined) geminiConfig.maxOutputTokens = generationConfig.maxOutputTokens;
  if (generationConfig?.responseMimeType) geminiConfig.responseMimeType = generationConfig.responseMimeType;

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
      console.warn(`⚠️ [${keyLabel}] Quota épuisé (${geminiResponse.status}), rotation vers la clé suivante…`);
      const err: any = new Error(`Quota épuisé pour ${keyLabel}`);
      err.isQuota = true;
      throw err;
    }
    console.error(`❌ [${keyLabel}] Erreur Gemini ${geminiResponse.status}:`, errorBody.slice(0, 300));
    throw new Error(`Gemini API error ${geminiResponse.status}: ${errorBody.slice(0, 200)}`);
  }

  // Lire le stream SSE et accumuler le texte
  const reader = geminiResponse.body?.getReader();
  if (!reader) throw new Error('Aucun corps de réponse de Gemini');

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
      const trimmed = line.trim();
      if (!trimmed || !trimmed.startsWith('data: ')) continue;
      const jsonStr = trimmed.slice(6).trim();
      if (jsonStr === '[DONE]') continue;
      try {
        const chunk = JSON.parse(jsonStr);
        const chunkText = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunkText) fullText += chunkText;
      } catch { /* ignore */ }
    }
  }

  // Buffer restant
  if (buffer.trim().startsWith('data: ')) {
    try {
      const jsonStr = buffer.trim().slice(6);
      if (jsonStr && jsonStr !== '[DONE]') {
        const chunk = JSON.parse(jsonStr);
        const chunkText = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (chunkText) fullText += chunkText;
      }
    } catch { /* ignore */ }
  }

  console.log(`✅ [${keyLabel}] Gemini OK — longueur texte: ${fullText.length}`);
  return fullText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Rotation automatique sur toutes les clés Gemini disponibles
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithGeminiRotation(
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) throw new Error('Aucune clé Gemini configurée');

  let lastError: any = null;

  for (let i = 0; i < keys.length; i++) {
    const label = i < 8 ? `GEMINI_API_KEY_${i + 1}` : 'GEMINI_API_KEY';
    try {
      const text = await tryGeminiKey(keys[i], label, contents, systemInstruction, generationConfig);
      if (i > 0) {
        console.log(`✅ Succès avec la clé #${i + 1} (${i} clé(s) épuisée(s) avant)`);
      }
      return text;
    } catch (err: any) {
      lastError = err;
      if (err.isQuota) {
        // Quota → on essaie la clé suivante
        continue;
      }
      // Erreur non liée au quota → propager immédiatement
      throw err;
    }
  }

  // Toutes les clés Gemini sont épuisées
  console.error('❌ Toutes les clés Gemini sont épuisées ou en erreur.');
  const allQuota: any = new Error('Toutes les clés Gemini sont épuisées');
  allQuota.isQuota = true;
  allQuota.allExhausted = true;
  throw allQuota;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback OpenAI-compatible (OpenAI ou GROQ)
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithOpenAICompat(
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<{ text: string; provider: string }> {
  // Choisir le provider disponible (préférer GROQ si disponible car gratuit)
  const apiKey   = GROQ_API_KEY  || OPENAI_API_KEY;
  const baseUrl  = GROQ_API_KEY  ? GROQ_BASE_URL  : OPENAI_BASE_URL;
  const model    = GROQ_API_KEY  ? GROQ_MODEL     : OPENAI_MODEL;
  const provider = GROQ_API_KEY  ? 'GROQ'         : 'OpenAI';

  if (!apiKey) throw new Error('Aucune clé OpenAI/GROQ configurée');

  const messages: Array<{ role: string; content: string }> = [];

  // ── Instruction système ───────────────────────────────────────────────────
  // OpenAI/GROQ avec json_object NE PEUT PAS retourner un tableau à la racine.
  // On ajoute une consigne claire pour envelopper dans un objet wrapper.
  let systemText = systemInstruction || '';
  if (generationConfig?.responseMimeType === 'application/json') {
    systemText +=
      '\n\n⚠️ RÈGLE ABSOLUE JSON : Retourne TOUJOURS un objet JSON valide à la racine.' +
      " Si la réponse est une liste d'unités/plans, enveloppe-la dans {\"units\": [...]}." +
      ' Ne commence jamais par [ directement.';
  }
  if (systemText.trim()) messages.push({ role: 'system', content: systemText });

  const userContent = typeof contents === 'string' ? contents : JSON.stringify(contents);
  messages.push({ role: 'user', content: userContent });

  const requestBody: Record<string, any> = {
    model,
    messages,
    temperature: generationConfig?.temperature ?? 0.7,
    max_tokens: generationConfig?.maxOutputTokens ?? 8192,
  };

  if (generationConfig?.responseMimeType === 'application/json') {
    requestBody.response_format = { type: 'json_object' };
  }

  console.log(`🔀 Tentative fallback avec ${provider} (${model})…`);

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error(`❌ ${provider} API error ${response.status}:`, errorBody.slice(0, 300));
    if (isQuotaError(response.status, errorBody)) {
      const err: any = new Error(`Quota ${provider} épuisé`);
      err.isQuota = true;
      throw err;
    }
    throw new Error(`${provider} API error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  console.log(`✅ ${provider} OK — longueur texte: ${text.length}`);
  return { text, provider };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal Vercel
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // En-têtes CORS
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST')    { return res.status(405).json({ error: 'Method not allowed' }); }

  // Vérification : au moins une clé configurée
  const geminiKeys = getGeminiKeys();
  const hasOpenAI  = !!OPENAI_API_KEY || !!GROQ_API_KEY;

  if (geminiKeys.length === 0 && !hasOpenAI) {
    return res.status(500).json({
      error: 'No AI API key configured',
      message:
        "Veuillez configurer au moins GEMINI_API_KEY_1 (ou GEMINI_API_KEY) dans les variables d'environnement Vercel.",
    });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    if (!contents) return res.status(400).json({ error: 'Missing contents in request body' });

    let fullText    = '';
    let usedProvider = '';

    // ── Étape 1 : Rotation automatique entre toutes les clés Gemini ──────────
    if (geminiKeys.length > 0) {
      try {
        console.log(`🔑 ${geminiKeys.length} clé(s) Gemini disponible(s) — démarrage rotation…`);
        fullText     = await generateWithGeminiRotation(contents, systemInstruction, generationConfig);
        usedProvider = 'Gemini';
      } catch (geminiErr: any) {
        if (geminiErr.allExhausted || geminiErr.isQuota) {
          // Toutes les clés Gemini épuisées → tenter OpenAI/GROQ
          console.warn('⚠️ Toutes les clés Gemini épuisées, tentative fallback OpenAI/GROQ…');
          if (hasOpenAI) {
            try {
              const result  = await generateWithOpenAICompat(contents, systemInstruction, generationConfig);
              fullText      = result.text;
              usedProvider  = result.provider;
            } catch (openaiErr: any) {
              // OpenAI/GROQ aussi épuisé → répondre avec une erreur claire
              console.error('❌ OpenAI/GROQ aussi épuisé:', openaiErr.message);
              return res.status(429).json({
                error: 'all_providers_exhausted',
                message:
                  "Toutes les clés IA sont temporairement épuisées. Veuillez réessayer dans quelques minutes.",
              });
            }
          } else {
            // Pas de fallback disponible
            return res.status(429).json({
              error: 'all_gemini_keys_exhausted',
              message:
                "Toutes les clés Gemini sont épuisées. Réessayez dans quelques minutes ou ajoutez des clés supplémentaires.",
            });
          }
        } else {
          // Erreur non-quota (ex: réseau, format…) → propager
          throw geminiErr;
        }
      }

    // ── Étape 2 : Pas de clé Gemini → utiliser directement OpenAI/GROQ ──────
    } else {
      console.log('🔀 Aucune clé Gemini configurée, utilisation OpenAI/GROQ…');
      const result  = await generateWithOpenAICompat(contents, systemInstruction, generationConfig);
      fullText      = result.text;
      usedProvider  = result.provider;
    }

    console.log(`✅ Génération terminée via ${usedProvider} — longueur: ${fullText.length}`);
    return res.status(200).json({ text: fullText });

  } catch (error: any) {
    console.error('❌ [API/generate] Erreur inattendue:', error);
    const msg: string = error?.message || String(error);

    if (
      msg.includes('429') ||
      msg.toLowerCase().includes('quota') ||
      msg.toLowerCase().includes('rate') ||
      msg.toLowerCase().includes('épuisé')
    ) {
      return res.status(429).json({
        error: 'quota_exceeded',
        message: "Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.",
      });
    }

    return res.status(500).json({ error: 'Internal server error', message: msg });
  }
}
