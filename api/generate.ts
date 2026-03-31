import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';

// Utilise gemini-2.0-flash : beaucoup plus rapide que 2.5-flash (pas de thinking overhead)
// et suffisamment performant pour les plans PEI
const GEMINI_MODEL = 'gemini-2.0-flash';
const GEMINI_STREAM_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:streamGenerateContent`;

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

  if (!GEMINI_API_KEY) {
    return res.status(500).json({
      error: 'GEMINI_API_KEY not configured on server',
      message: "Veuillez configurer GEMINI_API_KEY dans les variables d'environnement Vercel."
    });
  }

  try {
    const { contents, systemInstruction, generationConfig } = req.body;

    if (!contents) {
      return res.status(400).json({ error: 'Missing contents in request body' });
    }

    // Build Gemini API request body
    const requestBody: any = {
      contents: Array.isArray(contents)
        ? contents
        : [{ role: 'user', parts: [{ text: contents }] }],
    };

    if (systemInstruction) {
      requestBody.systemInstruction = {
        role: 'user',
        parts: [{ text: systemInstruction }]
      };
    }

    // Config par défaut : désactiver le thinking pour plus de rapidité
    requestBody.generationConfig = {
      temperature: 0.7,
      maxOutputTokens: 8192,
      ...(generationConfig || {}),
    };

    // Utilise alt=sse pour recevoir le stream Server-Sent Events
    const url = `${GEMINI_STREAM_URL}?key=${GEMINI_API_KEY}&alt=sse`;

    const geminiResponse = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody),
    });

    if (!geminiResponse.ok) {
      const errorBody = await geminiResponse.text();
      console.error('❌ Gemini API error:', geminiResponse.status, errorBody);
      return res.status(geminiResponse.status).json({
        error: `Gemini API error: ${geminiResponse.status}`,
        details: errorBody
      });
    }

    // Lire le stream SSE et accumuler le texte complet
    const reader = geminiResponse.body?.getReader();
    if (!reader) {
      return res.status(500).json({ error: 'No response body from Gemini' });
    }

    const decoder = new TextDecoder();
    let fullText = '';
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });

      // Traiter chaque ligne SSE
      const lines = buffer.split('\n');
      buffer = lines.pop() || ''; // garder la ligne incomplète dans le buffer

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6).trim(); // enlever "data: "
        if (jsonStr === '[DONE]') continue;

        try {
          const chunk = JSON.parse(jsonStr);
          const chunkText = chunk?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (chunkText) {
            fullText += chunkText;
          }
        } catch {
          // Ignorer les chunks non-parsables
        }
      }
    }

    // Traiter le buffer restant
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
    return res.status(200).json({ text: fullText });

  } catch (error: any) {
    console.error('❌ [API/generate] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error?.message || String(error)
    });
  }
}
