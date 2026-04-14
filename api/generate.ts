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

const OPENAI_API_KEY  = (process.env.OPENAI_API_KEY  || '').trim();
const OPENAI_BASE_URL = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').trim();
const GROQ_API_KEY    = (process.env.GROQ_API_KEY    || '').trim();
const GROQ_BASE_URL   = 'https://api.groq.com/openai/v1';

// ─────────────────────────────────────────────────────────────────────────────
// Modèles GROQ — cascade du plus grand contexte / TPM au plus petit
//   llama-3.1-8b-instant  : 128k ctx, 20k TPM  ← idéal pour gros prompts
//   llama3-8b-8192        :   8k ctx, 20k TPM  ← rapide
//   gemma2-9b-it          :   8k ctx, 15k TPM
//   llama-3.3-70b-versatile: 128k ctx, 12k TPM ← à éviter si prompt large
//   llama3-70b-8192       :   8k ctx, 6k TPM   ← dernier recours GROQ
// ─────────────────────────────────────────────────────────────────────────────
const GROQ_MODELS = [
  { id: 'llama-3.1-8b-instant',    tpmLimit: 20_000 },
  { id: 'llama3-8b-8192',          tpmLimit: 20_000 },
  { id: 'gemma2-9b-it',            tpmLimit: 15_000 },
  { id: 'llama-3.3-70b-versatile', tpmLimit: 12_000 },
  { id: 'llama3-70b-8192',         tpmLimit:  6_000 },
];

// ─────────────────────────────────────────────────────────────────────────────
// Estimation du nombre de tokens (approximation : 1 token ≈ 3,5 chars en FR/AR)
// ─────────────────────────────────────────────────────────────────────────────
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// ─────────────────────────────────────────────────────────────────────────────
// Prompt IB minimal mais suffisant pour GROQ (< 800 tokens ≈ 2800 chars)
// ─────────────────────────────────────────────────────────────────────────────
const GROQ_MINIMAL_SYSTEM_FR = `Tu es un expert pédagogique IB PEI. Génère un plan d'unité JSON complet en FRANÇAIS.

RÈGLES ABSOLUES (non négociables) :
1. "assessments" doit contenir EXACTEMENT 2 critères (jamais 1, jamais 3-4).
2. Chaque critère doit avoir AU MINIMUM 3 sous-aspects dans "strands" (ex: i, iii, iv).
3. Les sous-aspects peuvent être non-consécutifs.
4. JSON valide uniquement — pas de texte avant ou après.
5. Si tu génères une liste de plans, enveloppe-la dans {"units": [...]}.

Structure JSON attendue :
{
  "title": "...", "duration": "X heures", "chapters": "...",
  "keyConcept": "...", "relatedConcepts": ["..."],
  "globalContext": "...", "statementOfInquiry": "...",
  "inquiryQuestions": {"factual": ["..."], "conceptual": ["..."], "debatable": ["..."]},
  "objectives": ["..."], "atlSkills": ["..."],
  "content": "...", "learningExperiences": "...",
  "summativeAssessment": "...", "formativeAssessment": "...",
  "differentiation": "...", "resources": "...",
  "reflection": {"prior": "...", "during": "...", "after": "..."},
  "assessments": [
    {
      "criterion": "A", "criterionName": "...", "maxPoints": 8,
      "strands": ["i. ...", "iii. ...", "iv. ..."],
      "rubricRows": [
        {"level": "1-2", "descriptor": "..."},
        {"level": "3-4", "descriptor": "..."},
        {"level": "5-6", "descriptor": "..."},
        {"level": "7-8", "descriptor": "..."}
      ],
      "exercises": [{"title": "...", "content": "...", "criterionReference": "Critère A: i, iii", "workspaceNeeded": true}]
    }
  ]
}`;

const GROQ_MINIMAL_SYSTEM_EN = `You are an IB MYP expert. Generate a complete unit plan JSON in ENGLISH.

ABSOLUTE RULES:
1. "assessments" must contain EXACTLY 2 criteria (never 1, never 3-4).
2. Each criterion must have AT LEAST 3 sub-aspects in "strands" (e.g., i, iii, iv).
3. Sub-aspects can be non-consecutive.
4. Valid JSON only — no text before or after.
5. If generating a list of plans, wrap in {"units": [...]}.

Expected JSON structure same as FR version but all values in English.`;

const GROQ_MINIMAL_SYSTEM_BILINGUAL = `Tu es un expert IB PEI. Génère un plan d'unité JSON BILINGUE (français + arabe).

RÈGLES ABSOLUES :
1. "assessments" doit contenir EXACTEMENT 2 critères.
2. Chaque critère doit avoir AU MINIMUM 3 sous-aspects dans "strands".
3. Chaque champ doit avoir une version arabe (suffixe _ar).
4. JSON valide uniquement — enveloppe les listes dans {"units": [...]}.`;

// ─────────────────────────────────────────────────────────────────────────────
// Compresse un system prompt volumineux pour en extraire l'essentiel
// ─────────────────────────────────────────────────────────────────────────────
function compressSystemPrompt(systemPrompt: string, targetChars = 3000): string {
  if (!systemPrompt) return '';
  if (systemPrompt.length <= targetChars) return systemPrompt;

  const lines = systemPrompt.split('\n');
  const essential: string[] = [];

  for (const line of lines) {
    const t = line.trim();
    if (!t) { essential.push(''); continue; }

    const isKey =
      t.includes('LOI ABSOLUE') || t.includes('ABSOLUTE LAW') ||
      t.includes('OBLIGATOIRE') || t.includes('MANDATORY') ||
      t.includes('NON NÉGOCIABLE') || t.includes('NON-NEGOTIABLE') ||
      t.includes('JAMAIS') || t.includes('NEVER') ||
      t.includes('TOUJOURS') || t.includes('ALWAYS') ||
      t.includes('EXACTEMENT') || t.includes('EXACTLY') ||
      t.includes('MINIMUM') || t.includes('INVALIDE') || t.includes('INVALID') ||
      t.includes('assessments') || t.includes('strands') ||
      t.startsWith('❗') || t.startsWith('‼') || t.startsWith('⚠️') ||
      t.startsWith('"') || t.startsWith('{') || t.startsWith('}') ||
      t.startsWith('[') || t.startsWith(']');

    if (isKey) essential.push(line);
  }

  const compressed = essential.join('\n').replace(/\n{3,}/g, '\n\n').trim();
  // If still too large, take only first targetChars characters
  return compressed.length > targetChars
    ? compressed.slice(0, targetChars) + '\n...'
    : compressed;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sélectionne le meilleur system prompt minimal selon la langue détectée
// ─────────────────────────────────────────────────────────────────────────────
function detectLanguage(userContent: string, systemInstruction?: string): 'en' | 'bilingual' | 'fr' {
  const combined = (userContent + (systemInstruction || '')).toLowerCase();
  if (combined.includes('language acquisition') || combined.includes('english') || combined.includes('anglais')) return 'en';
  if (combined.includes('bilingue') || combined.includes('_ar') || combined.includes('arabe')) return 'bilingual';
  return 'fr';
}

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

// Erreur de taille de requête (413 ou message "too large")
function isSizeError(status: number, body: string): boolean {
  if (status === 413) return true;
  const lower = body.toLowerCase();
  return (
    lower.includes('too large') ||
    lower.includes('reduce your message') ||
    lower.includes('request too large') ||
    lower.includes('maximum context') ||
    lower.includes('context length') ||
    lower.includes('token') // "token limit exceeded"
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
    console.error(`❌ [${keyLabel}] Erreur ${geminiResponse.status}:`, errorBody.slice(0, 200));
    throw new Error(`Gemini error ${geminiResponse.status}: ${errorBody.slice(0, 150)}`);
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
  if (keys.length === 0) throw new Error('Aucune clé Gemini configurée');

  console.log(`🔑 ${keys.length} clé(s) Gemini — démarrage rotation…`);

  for (let i = 0; i < keys.length; i++) {
    const label = i < 8 ? `GEMINI_API_KEY_${i + 1}` : 'GEMINI_API_KEY';
    try {
      const text = await tryGeminiKey(keys[i], label, contents, systemInstruction, generationConfig);
      if (i > 0) console.log(`✅ Succès clé #${i + 1} après ${i} échec(s)`);
      return text;
    } catch (err: any) {
      if (err.isQuota) continue;
      throw err; // erreur non-quota → propager
    }
  }

  console.error('❌ Toutes les clés Gemini sont épuisées ou en erreur.');
  const err: any = new Error('Toutes les clés Gemini sont épuisées');
  err.isQuota = true;
  err.allExhausted = true;
  throw err;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tentative avec UN modèle GROQ donné
// ─────────────────────────────────────────────────────────────────────────────
async function tryGroqModel(
  modelId: string,
  messages: Array<{ role: string; content: string }>,
  generationConfig?: Record<string, any>
): Promise<string> {
  const requestBody: Record<string, any> = {
    model: modelId,
    messages,
    temperature: generationConfig?.temperature ?? 0.7,
    max_tokens: Math.min(generationConfig?.maxOutputTokens ?? 4096, 4096),
  };
  if (generationConfig?.responseMimeType === 'application/json') {
    requestBody.response_format = { type: 'json_object' };
  }

  const estimatedTokens = estimateTokens(JSON.stringify(messages));
  console.log(`🔀 GROQ [${modelId}] — ~${estimatedTokens} tokens estimés…`);

  const response = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.warn(`⚠️ GROQ [${modelId}] erreur ${response.status}:`, errorBody.slice(0, 300));

    if (isQuotaError(response.status, errorBody)) {
      const err: any = new Error(`GROQ quota [${modelId}]`);
      err.isQuota = true; err.tryNext = true;
      throw err;
    }
    if (isSizeError(response.status, errorBody)) {
      const err: any = new Error(`GROQ trop grand [${modelId}]`);
      err.isTooLarge = true; err.tryNext = true;
      throw err;
    }
    throw new Error(`GROQ [${modelId}] error ${response.status}: ${errorBody.slice(0, 200)}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  console.log(`✅ GROQ [${modelId}] OK — ${text.length} chars`);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Construit les messages GROQ avec une taille maîtrisée selon la limite TPM
// Stratégie :
//   - Niveau 0 : prompt minimal prédéfini (< 800 tokens) + contenu tronqué si besoin
//   - Niveau 1 : prompt compressé depuis l'original + contenu tronqué
//   - Niveau 2 : prompt ultra-minimal (50 tokens) + contenu très tronqué
// ─────────────────────────────────────────────────────────────────────────────
function buildGroqMessages(
  userContent: string,
  systemInstruction: string | undefined,
  tpmLimit: number,
  attempt: number,
  generationConfig?: Record<string, any>
): Array<{ role: string; content: string }> {

  const jsonWrapper =
    generationConfig?.responseMimeType === 'application/json'
      ? '\n\n⚠️ JSON UNIQUEMENT. Si liste → enveloppe dans {"units": [...]}.'
      : '';

  const lang = detectLanguage(userContent, systemInstruction);

  // Budget : réserver 4096 tokens pour la réponse
  // TPM = tokens totaux par minute, donc budget prompt = tpmLimit - 4096
  // Mais on est conservateur : budget prompt = min(tpmLimit - 4096, 7000)
  const promptBudget = Math.min(tpmLimit - 4096, 7000);

  let sysText: string;

  if (attempt === 0) {
    // Utiliser le prompt minimal prédéfini selon la langue détectée
    const minimal =
      lang === 'en' ? GROQ_MINIMAL_SYSTEM_EN
      : lang === 'bilingual' ? GROQ_MINIMAL_SYSTEM_BILINGUAL
      : GROQ_MINIMAL_SYSTEM_FR;
    sysText = minimal + jsonWrapper;
  } else if (attempt === 1 && systemInstruction) {
    // Compresser le prompt original
    const compressed = compressSystemPrompt(systemInstruction, promptBudget * 3);
    sysText = compressed + jsonWrapper;
  } else {
    // Ultra-minimal
    sysText =
      lang === 'en'
        ? `IB MYP expert. JSON only. 2 criteria with ≥3 strands each. Wrap lists in {"units": [...]}. ${jsonWrapper}`
        : `Expert IB PEI. JSON uniquement. 2 critères ≥3 strands chacun. Listes dans {"units": [...]}. ${jsonWrapper}`;
  }

  const sysTokens = estimateTokens(sysText);
  const userBudgetTokens = promptBudget - sysTokens;
  const maxUserChars = Math.max(800, userBudgetTokens * 3);

  let truncatedContent = userContent;
  if (userContent.length > maxUserChars) {
    truncatedContent = userContent.slice(0, maxUserChars) +
      '\n...[contenu tronqué pour respecter la limite de tokens]';
    console.warn(`⚠️ Contenu utilisateur tronqué: ${userContent.length} → ${truncatedContent.length} chars`);
  }

  const messages: Array<{ role: string; content: string }> = [];
  if (sysText.trim()) messages.push({ role: 'system', content: sysText });
  messages.push({ role: 'user', content: truncatedContent });

  const totalEst = estimateTokens(JSON.stringify(messages));
  console.log(`📊 GROQ messages: ~${totalEst} tokens (budget: ${promptBudget}, tpm: ${tpmLimit})`);

  return messages;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fallback OpenAI-compatible : cascade GROQ → OpenAI
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithOpenAICompat(
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<{ text: string; provider: string }> {

  const userContent = typeof contents === 'string'
    ? contents
    : (Array.isArray(contents)
        ? (contents[0]?.parts?.[0]?.text || JSON.stringify(contents))
        : JSON.stringify(contents));

  // ── Cascade GROQ ──────────────────────────────────────────────────────────
  if (GROQ_API_KEY) {
    // On itère sur les modèles × niveaux de compression (max 3 levels)
    for (let mIdx = 0; mIdx < GROQ_MODELS.length; mIdx++) {
      const model = GROQ_MODELS[mIdx];
      const maxAttempts = 3; // niveaux de compression

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const messages = buildGroqMessages(
          userContent, systemInstruction,
          model.tpmLimit, attempt, generationConfig
        );
        const totalTokens = estimateTokens(JSON.stringify(messages));

        // Si les tokens estimés dépassent la limite TPM, passer au niveau suivant
        if (totalTokens > model.tpmLimit - 3000) {
          console.warn(`⚠️ GROQ [${model.id}] niveau ${attempt}: ${totalTokens} tokens > ${model.tpmLimit - 3000} — niveau suivant`);
          continue;
        }

        try {
          const text = await tryGroqModel(model.id, messages, generationConfig);
          return { text, provider: `GROQ/${model.id}` };
        } catch (err: any) {
          if (err.tryNext) {
            if (err.isTooLarge && attempt < maxAttempts - 1) {
              console.warn(`⚠️ GROQ [${model.id}] trop grand, compression ++`);
              continue; // essayer avec plus de compression
            }
            // quota ou erreur irrécupérable → prochain modèle
            console.warn(`⚠️ GROQ [${model.id}] → modèle suivant`);
            break;
          }
          throw err;
        }
      }
    }
    console.warn('⚠️ Tous les modèles GROQ ont échoué → tentative OpenAI…');
  }

  // ── Essai OpenAI ──────────────────────────────────────────────────────────
  if (OPENAI_API_KEY) {
    const lang = detectLanguage(userContent, systemInstruction);
    const minimal =
      lang === 'en' ? GROQ_MINIMAL_SYSTEM_EN
      : lang === 'bilingual' ? GROQ_MINIMAL_SYSTEM_BILINGUAL
      : GROQ_MINIMAL_SYSTEM_FR;
    const jsonWrapper =
      generationConfig?.responseMimeType === 'application/json'
        ? '\n\n⚠️ JSON UNIQUEMENT. Listes dans {"units": [...]}.'
        : '';
    const sysText = minimal + jsonWrapper;

    const messages: Array<{ role: string; content: string }> = [
      { role: 'system', content: sysText },
      { role: 'user', content: userContent },
    ];

    const requestBody: Record<string, any> = {
      model: 'gpt-4o-mini',
      messages,
      temperature: generationConfig?.temperature ?? 0.7,
      max_tokens: generationConfig?.maxOutputTokens ?? 4096,
    };
    if (generationConfig?.responseMimeType === 'application/json') {
      requestBody.response_format = { type: 'json_object' };
    }

    console.log('🔀 Tentative OpenAI (gpt-4o-mini)…');
    const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ OpenAI error:', response.status, errorBody.slice(0, 200));
      if (isQuotaError(response.status, errorBody)) {
        const err: any = new Error('OpenAI quota épuisé');
        err.isQuota = true;
        throw err;
      }
      throw new Error(`OpenAI error ${response.status}: ${errorBody.slice(0, 150)}`);
    }

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || '';
    console.log(`✅ OpenAI OK — ${text.length} chars`);
    return { text, provider: 'OpenAI' };
  }

  throw new Error('Aucun provider fallback disponible (GROQ_API_KEY et OPENAI_API_KEY non configurés)');
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler principal Vercel
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
  const hasOpenAI  = !!OPENAI_API_KEY || !!GROQ_API_KEY;

  if (geminiKeys.length === 0 && !hasOpenAI) {
    return res.status(500).json({
      error: 'No AI API key configured',
      message: "Veuillez configurer GEMINI_API_KEY_1 (ou GEMINI_API_KEY) dans les variables d'environnement Vercel.",
    });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;
    if (!contents) return res.status(400).json({ error: 'Missing contents in request body' });

    let fullText = '';
    let usedProvider = '';

    // ── Étape 1 : Rotation Gemini ─────────────────────────────────────────
    if (geminiKeys.length > 0) {
      try {
        fullText     = await generateWithGeminiRotation(contents, systemInstruction, generationConfig);
        usedProvider = 'Gemini';
      } catch (geminiErr: any) {
        if (geminiErr.allExhausted || geminiErr.isQuota) {
          console.warn('⚠️ Gemini épuisé → fallback GROQ/OpenAI…');
          if (hasOpenAI) {
            try {
              const result = await generateWithOpenAICompat(contents, systemInstruction, generationConfig);
              fullText     = result.text;
              usedProvider = result.provider;
            } catch (fallbackErr: any) {
              console.error('❌ Tous les providers épuisés:', fallbackErr.message);
              return res.status(429).json({
                error: 'all_providers_exhausted',
                message: "Toutes les clés IA sont temporairement épuisées. Veuillez réessayer dans quelques minutes.",
              });
            }
          } else {
            return res.status(429).json({
              error: 'all_gemini_keys_exhausted',
              message: "Toutes les clés Gemini sont épuisées. Réessayez dans quelques minutes.",
            });
          }
        } else {
          throw geminiErr;
        }
      }
    } else {
      // ── Étape 2 : Pas de Gemini → GROQ/OpenAI directement ────────────────
      console.log('🔀 Pas de clé Gemini → GROQ/OpenAI directement…');
      const result = await generateWithOpenAICompat(contents, systemInstruction, generationConfig);
      fullText     = result.text;
      usedProvider = result.provider;
    }

    console.log(`✅ Génération OK via ${usedProvider} — ${fullText.length} chars`);
    return res.status(200).json({ text: fullText });

  } catch (error: any) {
    console.error('❌ [API/generate] Erreur:', error);
    const msg: string = error?.message || String(error);

    if (msg.includes('429') || msg.toLowerCase().includes('quota') ||
        msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('épuisé')) {
      return res.status(429).json({
        error: 'quota_exceeded',
        message: "Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.",
      });
    }
    return res.status(500).json({ error: 'Internal server error', message: msg });
  }
}
