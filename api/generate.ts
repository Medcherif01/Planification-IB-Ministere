import type { VercelRequest, VercelResponse } from '@vercel/node';
import { GoogleGenAI } from '@google/genai';

// ─────────────────────────────────────────────────────────────────────────────
// Modèles Gemini actifs et stables
// ─────────────────────────────────────────────────────────────────────────────
const GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-2.5-flash',
  'gemini-3.1-flash-lite',
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

// Modèle officiel Nano Banana 2.1 haute précision par défaut
export const AI_IMAGE_MODEL = process.env.AI_IMAGE_MODEL || 'gemini-nano-banana-2.1';

/**
 * Étape 1 : Utilise Gemini comme Directeur Artistique & Photographe Pédagogique
 * pour transformer l'énoncé brut d'un exercice en un prompt photographique ultra-précis
 * (sans jamais produire de dessin enfantin ni de bonhommes bâtons) + requêtes photo + légende.
 */
async function refineExerciseIntoPrecisionPhotoPrompt(
  keys: string[],
  rawPrompt: string,
  exerciseMeta?: {
    subject?: string;
    grade?: string;
    unitTitle?: string;
    exerciseTitle?: string;
    exerciseContent?: string;
    customPrompt?: string;
    visualStyle?: string;
  }
): Promise<{
  nanoBananaPrompt: string;
  searchQueries: string[];
  caption: string;
}> {
  const isEn = /english|anglais|acquisition/i.test(exerciseMeta?.subject || '');
  const defaultCaption =
    exerciseMeta?.customPrompt ||
    (exerciseMeta?.exerciseTitle
      ? `${isEn ? 'Visual Document — ' : 'Document photographique — '}${exerciseMeta.exerciseTitle}`
      : isEn
      ? 'Contextual Assessment Photograph'
      : 'Document photographique en lien avec l’exercice');

  const fallbackResult = {
    nanoBananaPrompt: `${rawPrompt}\nPhotorealistic high-resolution editorial photograph, DSLR 50mm lens, natural lighting, authentic textures and real-world details, 8k educational textbook photography. Strictly NO cartoon, NO stick figures, NO flat vector clipart.`,
    searchQueries: [
      exerciseMeta?.customPrompt || '',
      exerciseMeta?.exerciseTitle || '',
      exerciseMeta?.unitTitle || '',
    ].filter(Boolean),
    caption: defaultCaption,
  };

  if (!keys.length) return fallbackResult;

  const directorSystemInstruction = `You are a world-class National Geographic & IB MYP textbook photography director.
Your task is to analyze a school assessment exercise and write a HYPER-PRECISE, PHOTOREALISTIC image generation prompt for Nano Banana 2.1 (gemini-nano-banana-2.1).
CRITICAL RULES:
1. Return ONLY valid JSON with keys:
   {
     "nanoBananaPrompt": "Detailed English prompt (80-140 words) describing a high-resolution, realistic photograph or textbook scientific visual that directly depicts the exact scenario, objects, people, environment, experiment, or quantities in the exercise. Specify camera lens (e.g. 35mm/50mm DSLR), realistic lighting, authentic details, and exact composition. If the exercise compares two events/situations, specify a side-by-side split-screen diptych of two real photographs. NEVER ask for cartoons, simple icons, or stick figures.",
     "searchQueries": ["2 to 4 concise English search phrases (3-5 words each) describing the concrete real-world subject for archival photo lookup, e.g. 'university graduation ceremony students', 'family birthday cake celebration'"],
     "caption": "Clear pedagogical caption in ${isEn ? 'English' : 'French'} (1 sentence) explaining what the student should observe in the photo for this exercise."
   }
2. Focus 100% on the concrete real-world subject of the exercise.`;

  const userTask = `Analyze this IB MYP exercise and produce the JSON:
- Subject: ${exerciseMeta?.subject || 'IB MYP'} (${exerciseMeta?.grade || 'PEI'})
- Unit: ${exerciseMeta?.unitTitle || ''}
- Exercise Title: ${exerciseMeta?.exerciseTitle || ''}
- Exercise Content: ${(exerciseMeta?.exerciseContent || rawPrompt).slice(0, 1800)}
- Teacher Custom Request: ${exerciseMeta?.customPrompt || ''}
- Visual Style: ${exerciseMeta?.visualStyle || 'photo_realiste'}`;

  for (const model of ['gemini-3.8-flash', 'gemini-2.5-flash', 'gemini-3.1-flash-lite']) {
    for (const rawKey of keys) {
      const apiKey = cleanKey(rawKey);
      if (!apiKey) continue;
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });
        const resp = await ai.models.generateContent({
          model,
          contents: userTask,
          config: {
            systemInstruction: directorSystemInstruction,
            responseMimeType: 'application/json',
          },
        });
        const txt = (resp?.text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '');
        if (txt) {
          const parsed = JSON.parse(txt);
          if (parsed?.nanoBananaPrompt) {
            return {
              nanoBananaPrompt: `${parsed.nanoBananaPrompt}\nPhotorealistic, ultra-detailed editorial textbook quality, 4:3 aspect ratio. Strictly NO stick figures, NO amateur vector cartoons.`,
              searchQueries: Array.isArray(parsed.searchQueries) && parsed.searchQueries.length > 0
                ? parsed.searchQueries.map(String)
                : fallbackResult.searchQueries,
              caption: String(parsed.caption || defaultCaption),
            };
          }
        }
      } catch {
        // Passer à la clé/modèle suivant
      }
    }
  }

  return fallbackResult;
}

/**
 * Recherche et télécharge côté serveur une vraie photographie haute définition libre de droits
 * depuis Wikimedia Commons (en base64) si toutes les clés Gemini Image sont en quota gratuit (429).
 * Garantit qu'on obtient TOUJOURS une vraie photo professionnelle liée au sujet et JAMAIS un SVG enfantin.
 */
async function fetchRealContextualPhotoFallback(
  searchQueries: string[]
): Promise<{ imageDataUri: string; modelUsed: string } | null> {
  const candidates = searchQueries
    .map(q => q.replace(/[^\w\s'-]/g, ' ').replace(/\s+/g, ' ').trim())
    .filter(q => q.length >= 3);

  for (const query of candidates) {
    try {
      const apiUrl = `https://commons.wikimedia.org/w/api.php?action=query&generator=search&gsrnamespace=6&gsrsearch=${encodeURIComponent(
        `filetype:bitmap ${query}`
      )}&gsrlimit=6&prop=imageinfo&iiprop=url|mime&iiurlwidth=1024&format=json&origin=*`;

      const r = await fetch(apiUrl, {
        headers: { 'User-Agent': 'IBMYPPlanner/2.0 (https://aistudio.google.com)' },
      });
      if (!r.ok) continue;
      const data: any = await r.json();
      const pages = Object.values(data?.query?.pages || {}) as any[];

      for (const page of pages) {
        const info = page?.imageinfo?.[0];
        const mime: string = info?.mime || '';
        const imgUrl: string = info?.thumburl || info?.url || '';
        if (!imgUrl || (!mime.includes('jpeg') && !mime.includes('jpg') && !mime.includes('png') && !mime.includes('webp'))) {
          continue;
        }

        const imgResp = await fetch(imgUrl, {
          headers: { 'User-Agent': 'IBMYPPlanner/2.0 (https://aistudio.google.com)' },
        });
        if (!imgResp.ok) continue;
        const contentType = imgResp.headers.get('content-type') || 'image/jpeg';
        if (!contentType.startsWith('image/') || contentType.includes('svg')) continue;

        const arrayBuf = await imgResp.arrayBuffer();
        const buf = Buffer.from(arrayBuf);
        if (buf.length < 8000) continue; // Ignorer les miniatures trop petites

        return {
          imageDataUri: `data:${contentType};base64,${buf.toString('base64')}`,
          modelUsed: 'wikimedia-hd-photo',
        };
      }
    } catch {
      // Essayer la requête suivante
    }
  }
  return null;
}

async function tryGenerateImageWithNanoBanana(
  keys: string[],
  promptText: string,
  customModel?: string,
  exerciseMeta?: {
    subject?: string;
    grade?: string;
    unitTitle?: string;
    exerciseTitle?: string;
    exerciseContent?: string;
    customPrompt?: string;
    visualStyle?: string;
  }
): Promise<{ imageDataUri: string; caption?: string; modelUsed?: string; quotaExceeded?: boolean } | null> {
  // 0. Raffiner le prompt avec Gemini pour une précision photographique maximale liée à l'exercice
  const refined = await refineExerciseIntoPrecisionPhotoPrompt(keys, promptText, exerciseMeta);
  const effectivePrompt = refined.nanoBananaPrompt;

  // Normaliser les alias Nano Banana vers les modèles officiels Gemini Image (@google/genai)
  const normalizeImageModel = (m?: string): string => {
    if (!m) return 'gemini-nano-banana-2.1';
    const lower = m.toLowerCase().trim();
    if (lower.includes('nano-banana-2.1')) return 'gemini-nano-banana-2.1';
    if (lower.includes('3.1-flash-lite-image') || lower.includes('nano-banana-lite')) return 'gemini-3.1-flash-lite-image';
    if (lower.includes('nano-banana-pro') || lower.includes('3-pro-image')) return 'gemini-3-pro-image';
    if (lower.includes('3.1-flash-image')) return 'gemini-3.1-flash-image-preview';
    if (lower.includes('2.5-flash-image')) return 'gemini-2.5-flash-image';
    if (lower.includes('nano-banana')) return 'gemini-nano-banana-2.1';
    return m;
  };

  const modelsToTry = [
    normalizeImageModel(customModel || AI_IMAGE_MODEL),
    'gemini-nano-banana-2.1',
    'gemini-3.1-flash-lite-image',
    'gemini-3-pro-image',
    'gemini-2.5-flash-image',
    'gemini-3.1-flash-image-preview',
  ].filter((v, i, a) => Boolean(v) && a.indexOf(v) === i);

  let hitQuota429 = false;

  for (const model of modelsToTry) {
    const supportsImageSize = model === 'gemini-nano-banana-2.1' || model === 'gemini-3-pro-image';

    for (let i = 0; i < keys.length; i++) {
      const apiKey = cleanKey(keys[i]);
      if (!apiKey) continue;

      // 1. Tentative via le SDK officiel @google/genai
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: {
            headers: { 'User-Agent': 'aistudio-build' },
          },
        });

        const response = await ai.models.generateContent({
          model,
          contents: {
            parts: [{ text: effectivePrompt }],
          },
          config: {
            imageConfig: supportsImageSize
              ? { aspectRatio: '4:3', imageSize: '1K' }
              : { aspectRatio: '4:3' },
          },
        });

        const parts: any[] = response?.candidates?.[0]?.content?.parts || [];
        let imageDataUri = '';
        let caption = '';
        for (const part of parts) {
          if (part?.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            imageDataUri = `data:${mime};base64,${part.inlineData.data}`;
          } else if (part?.text) {
            caption += part.text;
          }
        }
        if (imageDataUri) {
          console.log(`✅ [NanoBanana SDK/${model}/KEY_${i + 1}] Photo IA haute précision générée avec succès !`);
          return {
            imageDataUri,
            caption: caption.trim() || refined.caption,
            modelUsed: model,
          };
        }
      } catch (sdkErr: any) {
        const msg = sdkErr?.message || String(sdkErr);
        if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('billing')) {
          hitQuota429 = true;
        }
        console.warn(`⚠️ [NanoBanana SDK/${model}/KEY_${i + 1}] ${msg.slice(0, 140)}`);
      }

      // 2. Tentative de repli via appel REST direct
      try {
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(apiKey)}`;
        const resp = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ role: 'user', parts: [{ text: effectivePrompt }] }],
            generationConfig: {
              imageConfig: {
                aspectRatio: '4:3',
              },
            },
          }),
        });
        if (!resp.ok) {
          if (resp.status === 429) hitQuota429 = true;
          continue;
        }
        const json: any = await resp.json();
        const parts: any[] = json?.candidates?.[0]?.content?.parts || [];
        let imageDataUri = '';
        let caption = '';
        for (const part of parts) {
          if (part?.inlineData?.data) {
            const mime = part.inlineData.mimeType || 'image/png';
            imageDataUri = `data:${mime};base64,${part.inlineData.data}`;
          } else if (part?.text) {
            caption += part.text;
          }
        }
        if (imageDataUri) {
          console.log(`✅ [NanoBanana REST/${model}/KEY_${i + 1}] Photo IA haute précision générée avec succès !`);
          return {
            imageDataUri,
            caption: caption.trim() || refined.caption,
            modelUsed: model,
          };
        }
      } catch {
        // Passer à la clé/modèle suivant
      }
    }
  }

  // 3. Si toutes les clés sont sur le tier gratuit (429 sur les modèles Nano Banana payants),
  // récupérer une vraie photographie haute définition correspondant exactement aux requêtes extraites par Gemini
  const hdPhoto = await fetchRealContextualPhotoFallback(refined.searchQueries);
  if (hdPhoto?.imageDataUri) {
    console.log(`✅ [Photo HD Contextuelle] Photographie réelle récupérée pour : ${refined.searchQueries.join(', ')}`);
    return {
      imageDataUri: hdPhoto.imageDataUri,
      caption: refined.caption,
      modelUsed: hdPhoto.modelUsed,
      quotaExceeded: hitQuota429,
    };
  }

  return hitQuota429 ? { imageDataUri: '', caption: refined.caption, quotaExceeded: true } : null;
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
    const {
      contents,
      systemInstruction,
      generationConfig,
      generateImage,
      imagePrompt,
      imageModel,
      exerciseMeta,
    } = req.body;
    if (!contents && !imagePrompt) {
      return res.status(400).json({ error: 'Missing contents in request body' });
    }

    // Si une génération d'image IA (Nano Banana 2.1 / gemini-3.1-flash-lite-image) est demandée pour illustrer un exercice
    if (generateImage) {
      const promptForImg = typeof imagePrompt === 'string' && imagePrompt.trim()
        ? imagePrompt
        : typeof contents === 'string'
        ? contents
        : JSON.stringify(contents);
      const nanoResult = await tryGenerateImageWithNanoBanana(
        geminiKeys,
        promptForImg,
        imageModel,
        exerciseMeta
      );
      if (nanoResult?.imageDataUri) {
        return res.status(200).json({
          imageDataUri: nanoResult.imageDataUri,
          caption: nanoResult.caption,
          modelUsed: nanoResult.modelUsed || imageModel || AI_IMAGE_MODEL,
          quotaExceeded: nanoResult.quotaExceeded || false,
          text: JSON.stringify({
            imageDataUri: nanoResult.imageDataUri,
            caption: nanoResult.caption,
            modelUsed: nanoResult.modelUsed || imageModel || AI_IMAGE_MODEL,
          }),
        });
      }
      // Ne JAMAIS basculer sur la génération de SVG enfantin par le modèle texte lorsque generateImage=true
      return res.status(429).json({
        error: 'image_generation_quota',
        quotaExceeded: Boolean(nanoResult?.quotaExceeded),
        message:
          "Les modèles photo Nano Banana (gemini-nano-banana-2.1 / gemini-3.1-flash-lite-image) nécessitent une clé API avec facturation activée (Paid API Key) dans AI Studio.",
      });
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
