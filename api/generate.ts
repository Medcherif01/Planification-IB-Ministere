import type { VercelRequest, VercelResponse } from '@vercel/node';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || process.env.VITE_GEMINI_API_KEY || '';
const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

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
      message: 'Veuillez configurer GEMINI_API_KEY dans les variables d\'environnement Vercel.'
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

    if (generationConfig) {
      requestBody.generationConfig = generationConfig;
    }

    const url = `${GEMINI_API_URL}?key=${GEMINI_API_KEY}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      console.error('❌ Gemini API error:', response.status, errorBody);
      return res.status(response.status).json({
        error: `Gemini API error: ${response.status}`,
        details: errorBody
      });
    }

    const data = await response.json();

    // Extract text from Gemini response
    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return res.status(200).json({ text, raw: data });

  } catch (error: any) {
    console.error('❌ [API/generate] Error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error?.message || String(error)
    });
  }
}
