import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * Proxy d'images sécurisé pour les documents pédagogiques et oeuvres d'art.
 * Permet d'éviter les restrictions de Referer (403), de CORS ou de rate limiting (429)
 * imposées par certains hébergeurs (ex. Wikimedia Commons).
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Support CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = req.query.url as string;
  if (!rawUrl) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return res.status(400).json({ error: 'Invalid URL' });
  }

  // Sécurité SSRF : autoriser uniquement http et https, bloquer les adresses privées / localhost
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return res.status(400).json({ error: 'Only http and https protocols are supported' });
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname.startsWith('192.168.') ||
    hostname.startsWith('10.') ||
    hostname.endsWith('.internal') ||
    hostname.endsWith('.local')
  ) {
    return res.status(403).json({ error: 'Private network addresses are not allowed' });
  }

  const client = parsed.protocol === 'https:' ? https : http;

  const options: https.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      // User-Agent conforme à la politique Wikimedia et navigateurs standards
      'User-Agent': 'PlanPEI-Educational-Platform/1.0 (educational-evaluation; https://alkawtar.edu)',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'fr,en;q=0.9',
      // Supprimer explicitement le Referer pour éviter les rejets anti-hotlinking
      'Referer': '',
    },
    timeout: 15_000,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    // Si redirection 301/302, suivre la redirection
    if (
      (proxyRes.statusCode === 301 || proxyRes.statusCode === 302 || proxyRes.statusCode === 307 || proxyRes.statusCode === 308) &&
      proxyRes.headers.location
    ) {
      try {
        const nextUrl = new URL(proxyRes.headers.location, parsed.origin).toString();
        res.writeHead(302, { Location: `/api/image-proxy?url=${encodeURIComponent(nextUrl)}` });
        return res.end();
      } catch {
        // Fallback standard
      }
    }

    if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
      return res.status(proxyRes.statusCode).json({ error: `Upstream error: ${proxyRes.statusCode}` });
    }

    const contentType = proxyRes.headers['content-type'] || 'image/jpeg';
    res.setHeader('Content-Type', contentType);
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable'); // Cache 7 jours
    if (proxyRes.headers['content-length']) {
      res.setHeader('Content-Length', proxyRes.headers['content-length']);
    }

    proxyRes.pipe(res);
  });

  proxyReq.on('timeout', () => {
    proxyReq.destroy();
    if (!res.headersSent) {
      res.status(504).json({ error: 'Gateway timeout while fetching image' });
    }
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy request failed', details: err.message });
    }
  });

  proxyReq.end();
}
