import type { VercelRequest, VercelResponse } from '@vercel/node';

// ─────────────────────────────────────────────────────────────────────────────
// API Keys — OpenAI (primary) and Gemini (fallback)
// ─────────────────────────────────────────────────────────────────────────────
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';
const OPENAI_BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const OPENAI_MODEL = 'gpt-5';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

// ─────────────────────────────────────────────────────────────────────────────
// OpenAI generation (primary)
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithOpenAI(
  contents: string,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const messages: Array<{ role: string; content: string }> = [];

  if (systemInstruction) {
    messages.push({ role: 'system', content: systemInstruction });
  }

  // contents can be a string or an array — normalise to string
  const userContent = typeof contents === 'string'
    ? contents
    : JSON.stringify(contents);

  messages.push({ role: 'user', content: userContent });

  const requestBody: Record<string, any> = {
    model: OPENAI_MODEL,
    messages,
    temperature: generationConfig?.temperature ?? 0.7,
    max_tokens: generationConfig?.maxOutputTokens ?? 8192,
  };

  // If caller wants JSON, ask OpenAI to return JSON
  if (generationConfig?.responseMimeType === 'application/json') {
    requestBody.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${OPENAI_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorBody = await response.text();
    console.error('❌ OpenAI API error:', response.status, errorBody);
    throw new Error(`OpenAI API error ${response.status}: ${errorBody}`);
  }

  const data = await response.json();
  const text = data?.choices?.[0]?.message?.content || '';
  console.log(`✅ OpenAI generation complete, text length: ${text.length}`);
  return text;
}

// ─────────────────────────────────────────────────────────────────────────────
// Gemini generation (fallback via SSE streaming)
// ─────────────────────────────────────────────────────────────────────────────
async function generateWithGemini(
  contents: any,
  systemInstruction?: string,
  generationConfig?: Record<string, any>
): Promise<string> {
  if (!GEMINI_API_KEY) {
    throw new Error('GEMINI_API_KEY not configured');
  }

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

  requestBody.generationConfig = {
    temperature: 0.7,
    maxOutputTokens: 8192,
    ...(generationConfig || {}),
  };

  const url = `${GEMINI_STREAM_URL}?key=${GEMINI_API_KEY}&alt=sse`;

  const geminiResponse = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });

  if (!geminiResponse.ok) {
    const errorBody = await geminiResponse.text();
    console.error('❌ Gemini API error:', geminiResponse.status, errorBody);
    throw new Error(`Gemini API error ${geminiResponse.status}: ${errorBody}`);
  }

  const reader = geminiResponse.body?.getReader();
  if (!reader) {
    throw new Error('No response body from Gemini');
  }

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
      } catch { /* ignore non-parseable chunks */ }
    }
  }

  // Process remaining buffer
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

  console.log(`✅ Gemini stream complete, total text length: ${fullText.length}`);
  return fullText;
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Vercel handler
// ─────────────────────────────────────────────────────────────────────────────
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
  );

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Require at least one AI key
  if (!OPENAI_API_KEY && !GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'No AI API key configured',
      message:
        "Veuillez configurer OPENAI_API_KEY ou GEMINI_API_KEY dans les variables d'environnement Vercel.",
    });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;

    if (!contents) {
      return res.status(400).json({ error: 'Missing contents in request body' });
    }

    let fullText = '';
    let usedProvider = '';

    // ── Try OpenAI first ──────────────────────────────────────────────────────
    if (OPENAI_API_KEY) {
      try {
        console.log('🚀 Trying OpenAI API (primary)...');
        fullText = await generateWithOpenAI(contents, systemInstruction, generationConfig);
        usedProvider = 'openai';
      } catch (openaiError: any) {
        console.warn('⚠️ OpenAI failed, trying Gemini fallback:', openaiError.message);

        // ── Fallback to Gemini ─────────────────────────────────────────────────
        if (GEMINI_API_KEY) {
          try {
            console.log('🤖 Trying Gemini API (fallback)...');
            fullText = await generateWithGemini(contents, systemInstruction, generationConfig);
            usedProvider = 'gemini';
          } catch (geminiError: any) {
            console.error('❌ Both AI providers failed');
            console.error('OpenAI error:', openaiError.message);
            console.error('Gemini error:', geminiError.message);

            // Return a user-friendly error
            const geminiMsg = geminiError.message || '';
            if (geminiMsg.includes('429') || geminiMsg.toLowerCase().includes('quota') || geminiMsg.toLowerCase().includes('limit')) {
              return res.status(429).json({
                error: 'AI quota exceeded',
                message: "Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.",
              });
            }
            throw geminiError;
          }
        } else {
          // No Gemini key — re-throw OpenAI error
          throw openaiError;
        }
      }
    } else {
      // No OpenAI key — use Gemini directly
      console.log('🤖 Using Gemini API (no OpenAI key)...');
      fullText = await generateWithGemini(contents, systemInstruction, generationConfig);
      usedProvider = 'gemini';
    }

    console.log(`✅ Generation complete via ${usedProvider}, text length: ${fullText.length}`);
    return res.status(200).json({ text: fullText });

  } catch (error: any) {
    console.error('❌ [API/generate] Error:', error);

    const msg: string = error?.message || String(error);

    // Quota / rate-limit errors
    if (msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('rate') || msg.toLowerCase().includes('limit')) {
      return res.status(429).json({
        error: 'AI quota exceeded',
        message: "Limite d'utilisation de l'IA atteinte. Réessayez dans quelques minutes.",
      });
    }

    return res.status(500).json({
      error: 'Internal server error',
      message: msg,
    });
  }
}
