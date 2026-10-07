import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ─────────────────────────────────────────────────────────────────────────────
// Modèles Gemini actifs et stables
// ─────────────────────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  'gemini-2.5-flash',
  'gemini-2.0-flash',
  'gemini-2.5-flash-lite',
  'gemini-flash-latest',
];

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// ─────────────────────────────────────────────────────────────────────────────
// Retry queue configuration
// ─────────────────────────────────────────────────────────────────────────────
const RETRY_INTERVAL_MS    = 30_000;       // 30 secondes entre chaque passe
const MAX_RETRY_DURATION_MS = 20 * 60_000; // 20 minutes maximum d'attente totale

// ─────────────────────────────────────────────────────────────────────────────
// Nettoie et valide une clé API (supprime guillemets accidentels, espaces)
// ─────────────────────────────────────────────────────────────────────────────
function cleanKey(raw?: string): string {
  if (!raw) return '';
  return raw.replace(/^["']|["']$/g, '').trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// Collecte toutes les clés Gemini disponibles
// Priorité à GEMINI_API_KEY (officielle AI Studio), puis GEMINI_API_KEY_1…8
// ─────────────────────────────────────────────────────────────────────────────
function getGeminiKeys(): string[] {
  const keys: string[] = [];
  
  // Clé principale AI Studio / Vercel
  const primary = cleanKey(process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY);
  if (primary && primary.length >= 10 && !primary.includes('YOUR_API_KEY')) {
    keys.push(primary);
  }

  // Clés secondaires de rotation
  for (let i = 1; i <= 8; i++) {
    const k = cleanKey(process.env[`GEMINI_API_KEY_${i}`]);
    if (k && k.length >= 10 && !keys.includes(k) && !k.includes('YOUR_API_KEY')) {
      keys.push(k);
    }
  }

  return keys;
}

// ─────────────────────────────────────────────────────────────────────────────
// Détermine si une erreur doit déclencher la rotation vers la clé ou le modèle suivant
// ─────────────────────────────────────────────────────────────────────────────
function isRotatableError(status: number, body: string): boolean {
  if (status === 429 || status === 503 || status === 404 || status === 401 || status === 403) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('api key not valid') ||
    lower.includes('invalid api key') ||
    lower.includes('api_key_invalid') ||
    lower.includes('invalid_argument') ||
    lower.includes('permission_denied') ||
    lower.includes('unauthenticated') ||
    lower.includes('quota') ||
    lower.includes('rate limit') ||
    lower.includes('resource_exhausted') ||
    lower.includes('too many requests') ||
    lower.includes('overloaded') ||
    lower.includes('not found') ||
    lower.includes('not supported') ||
    lower.includes('no longer available') ||
    lower.includes('is not supported for generatecontent') ||
    lower.includes('shut down')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─────────────────────────────────────────────────────────────────────────────
// Tentative Gemini avec UNE clé + UN modèle spécifique
// Tente d'abord via le SDK officiel @google/genai, avec repli REST SSE si besoin
// ─────────────────────────────────────────────────────────────────────────────
async function tryGeminiKeyWithModel(
  apiKey: string,
  model: string,
  label: string,
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  const sanitizedKey = cleanKey(apiKey);

  // 1. Tentative via @google/genai SDK
  try {
    const ai = new GoogleGenAI({
      apiKey: sanitizedKey,
      httpOptions: {
        headers: { 'User-Agent': 'aistudio-build' },
      },
    });

    const response = await ai.models.generateContent({
      model,
      contents: Array.isArray(contents) ? contents : [{ role: 'user', parts: [{ text: String(contents) }] }],
      config: {
        systemInstruction: systemInstruction || undefined,
        temperature: generationConfig?.temperature ?? 0.7,
        maxOutputTokens: generationConfig?.maxOutputTokens ?? 65536,
        responseMimeType: generationConfig?.responseMimeType || undefined,
      },
    });

    const text = response?.text;
    if (text && text.trim().length > 0) {
      console.log(`✅ [${label}/${model}] Succès via SDK (@google/genai) — ${text.length} chars`);
      return text;
    }
  } catch (sdkErr: any) {
    const errMsg = sdkErr?.message || String(sdkErr);
    console.warn(`⚠️ [${label}/${model}] SDK erreur: ${errMsg.slice(0, 160)}. Repli sur REST SSE…`);
    if (isRotatableError(400, errMsg)) {
      const err: any = new Error(errMsg);
      err.isQuota = true;
      throw err;
    }
  }

  // 2. Repli direct REST SSE
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
    maxOutputTokens: generationConfig?.maxOutputTokens ?? 65536,
  };
  if (generationConfig?.responseMimeType) {
    geminiConfig.responseMimeType = generationConfig.responseMimeType;
  }
  requestBody.generationConfig = geminiConfig;

  const url = `${GEMINI_BASE}/${model}:streamGenerateContent?key=${encodeURIComponent(sanitizedKey)}&alt=sse`;
  const geminiResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    console.warn(`⚠️ [${label}/${model}] Erreur REST ${geminiResponse.status}: ${errorBody.slice(0, 180)}`);
    const err: any = new Error(`Gemini error ${geminiResponse.status}: ${errorBody.slice(0, 150)}`);
    err.isQuota = true; // Activer la rotation pour essayer la clé/modèle suivant
    throw err;
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

  console.log(`✅ [${label}/${model}] Succès via REST — ${fullText.length} chars`);
  return fullText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Une passe de rotation : essaie chaque modèle × chaque clé
// ─────────────────────────────────────────────────────────────────────────────
async function tryOneRotationPass(
  keys: string[],
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  let lastError: any = null;

  for (const model of GEMINI_MODELS) {
    console.log(`🔄 Essai modèle ${model} sur ${keys.length} clé(s)…`);

    for (let i = 0; i < keys.length; i++) {
      const label = `KEY_${i + 1}`;

      try {
        const text = await tryGeminiKeyWithModel(
          keys[i], model, label, contents, systemInstruction, generationConfig
        );
        return text;
      } catch (err: any) {
        lastError = err;
        console.warn(`⚠️ [${label}/${model}] Échec: ${err?.message || err}. Essai clé suivante…`);
        continue;
      }
    }

    console.warn(`⚠️ Toutes les clés épuisées pour ${model}, passage au modèle suivant…`);
  }

  const err: any = new Error(lastError?.message || 'ALL_EXHAUSTED');
  err.isQuota = true;
  err.allExhausted = true;
  throw err;
}


// ─────────────────────────────────────────────────────────────────────────────
// Rotation principale avec retry silencieux toutes les 60 s pendant 30 min
// Si toutes les clés × tous les modèles sont épuisés lors d'une passe,
// on attend RETRY_INTERVAL_MS avant de réessayer (silencieusement).
// Après MAX_RETRY_DURATION_MS sans succès, on lance une erreur définitive.
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithGeminiRotation(
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  const keys = getGeminiKeys();
  if (keys.length === 0) {
    throw new Error(
      "Aucune clé Gemini configurée. Ajoutez GEMINI_API_KEY_1 dans les variables d'environnement Vercel."
    );
  }

  const totalCombinations = keys.length * GEMINI_MODELS.length;
  console.log(
    `🔑 ${keys.length} clé(s) × ${GEMINI_MODELS.length} modèles = ${totalCombinations} combinaisons possibles`
  );

  const startTime = Date.now();
  let attempt = 0;

  while (true) {
    attempt++;
    console.log(
      attempt === 1
        ? `🚀 Lancement génération (passe #${attempt})…`
        : `⏳ Nouvelle tentative (passe #${attempt}) après attente de ${RETRY_INTERVAL_MS / 1000}s…`
    );

    try {
      const text = await tryOneRotationPass(keys, contents, systemInstruction, generationConfig);
      if (attempt > 1) {
        console.log(`✅ Succès à la passe #${attempt} (après ${Math.round((Date.now() - startTime) / 1000)}s d'attente)`);
      }
      return text;
    } catch (err: any) {
      if (!err.allExhausted) {
        // Erreur non-quota → propager immédiatement
        throw err;
      }

      // Toutes les combinaisons épuisées — vérifier si on peut encore réessayer
      const elapsed = Date.now() - startTime;
      const remaining = MAX_RETRY_DURATION_MS - elapsed;

      if (remaining <= 0) {
        // Délai maximum atteint → erreur définitive
        console.error(
          `❌ Toutes les tentatives épuisées après ${Math.round(elapsed / 60000)} min ` +
          `(${attempt} passes, ${totalCombinations} combinaisons par passe)`
        );
        const finalErr: any = new Error(
          `Toutes les clés Gemini sont épuisées pour tous les modèles après ${attempt} tentatives ` +
          `(${Math.round(elapsed / 60000)} min). Le quota journalier est atteint. ` +
          `Réessayez demain ou ajoutez de nouvelles clés API dans Vercel.`
        );
        finalErr.isQuota = true;
        finalErr.allExhausted = true;
        throw finalErr;
      }

      // Attente silencieuse avant la prochaine passe
      const waitMs = Math.min(RETRY_INTERVAL_MS, remaining);
      console.warn(
        `⏳ Passe #${attempt} : toutes les combinaisons épuisées. ` +
        `Nouvelle tentative dans ${Math.round(waitMs / 1000)}s ` +
        `(temps restant : ${Math.round(remaining / 60000)} min)…`
      );
      await sleep(waitMs);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal Vercel — Gemini UNIQUEMENT avec multi-modèles + retry
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

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

    return res.status(200).json({ text: fullText });

  } catch (error: any) {
    console.error('❌ [API/generate] Erreur finale:', error?.message || error);
    const msg: string = error?.message || String(error);

    if (
      (error as any)?.isQuota ||
      msg.includes('429') ||
      msg.toLowerCase().includes('quota') ||
      msg.toLowerCase().includes('épuisé') ||
      msg.toLowerCase().includes('exhausted')
    ) {
      return res.status(429).json({
        error: 'quota_exceeded',
        message:
          "⏳ Le quota journalier de l'IA Gemini est atteint pour toutes les clés et tous les modèles.\n\n" +
          "La génération a été tentée pendant 30 minutes sans succès.\n\n" +
          "💡 Solutions :\n" +
          "• Réessayez demain matin (quota réinitialisé à minuit heure du Pacifique)\n" +
          "• Ajoutez de nouvelles clés API dans les variables Vercel (GEMINI_API_KEY_9, etc.)\n" +
          "• Créez de nouveaux projets Google AI Studio pour obtenir des clés supplémentaires",
      });
    }

    return res.status(500).json({ error: 'Internal server error', message: msg });
  }
}
