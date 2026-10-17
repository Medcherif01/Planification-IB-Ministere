import type { VercelRequest, VercelResponse } from '@vercel/node';
import https from 'https';
import http from 'http';
import { URL } from 'url';

/**
 * Proxy d'images sécurisé pour les documents pédagogiques, photos Google Drive et oeuvres d'art.
 * Permet d'éviter les restrictions de Referer (403), de CORS ou de redirections
 * imposées par les hébergeurs (notamment Google Drive et Wikimedia Commons).
 */

function extractDriveId(inputUrl: string): string | null {
  if (!inputUrl) return null;
  const trimmed = inputUrl.trim();
  const driveRegex = /(?:drive\.google\.com\/(?:file\/(?:u\/\d+\/)?d\/|open\?.*?id=|uc\?.*?id=|thumbnail\?.*?id=)|lh3\.googleusercontent\.com\/d\/|docs\.google\.com\/(?:document|presentation|drawings|spreadsheets)\/d\/)([a-zA-Z0-9_-]{20,})/i;
  const match = trimmed.match(driveRegex);
  if (match && match[1]) return match[1];
  const queryMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{20,})/i);
  if (queryMatch && queryMatch[1]) return queryMatch[1];
  if (/^[a-zA-Z0-9_-]{25,50}$/.test(trimmed)) return trimmed;
  return null;
}

function fetchWithRedirects(
  targetUrl: string,
  res: VercelResponse,
  redirectCount = 0
) {
  if (redirectCount > 5) {
    if (!res.headersSent) {
      res.status(508).json({ error: 'Trop de redirections pour cette image' });
    }
    return;
  }

  let parsed: URL;
  try {
    parsed = new URL(targetUrl);
  } catch {
    if (!res.headersSent) {
      res.status(400).json({ error: 'Invalid URL' });
    }
    return;
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    if (!res.headersSent) {
      res.status(400).json({ error: 'Only http and https protocols are supported' });
    }
    return;
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
    if (!res.headersSent) {
      res.status(403).json({ error: 'Private network addresses are not allowed' });
    }
    return;
  }

  const client = parsed.protocol === 'https:' ? https : http;

  const options: https.RequestOptions = {
    hostname: parsed.hostname,
    port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
    path: parsed.pathname + parsed.search,
    method: 'GET',
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
      'Accept-Language': 'fr,en;q=0.9',
      'Referer': '',
    },
    timeout: 15_000,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    // Si redirection 301/302/307/308, suivre automatiquement la redirection côté serveur
    if (
      (proxyRes.statusCode === 301 ||
        proxyRes.statusCode === 302 ||
        proxyRes.statusCode === 303 ||
        proxyRes.statusCode === 307 ||
        proxyRes.statusCode === 308) &&
      proxyRes.headers.location
    ) {
      try {
        const nextUrl = new URL(proxyRes.headers.location, parsed.origin).toString();
        proxyRes.resume(); // Vider le buffer
        return fetchWithRedirects(nextUrl, res, redirectCount + 1);
      } catch {
        // En cas d'erreur de parsing d'URL de redirection, renvoyer erreur
      }
    }

    if (proxyRes.statusCode && proxyRes.statusCode >= 400) {
      if (!res.headersSent) {
        return res.status(proxyRes.statusCode).json({ error: `Upstream error: ${proxyRes.statusCode}` });
      }
      return;
    }

    let contentType = proxyRes.headers['content-type'] || 'image/jpeg';
    // Si Google Drive renvoie octet-stream ou binary, forcer image/jpeg pour que le navigateur l'affiche
    if (contentType.includes('binary') || contentType.includes('octet-stream')) {
      contentType = 'image/jpeg';
    }

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
      res.status(504).json({ error: 'Délai dépassé lors du chargement de l\'image' });
    }
  });

  proxyReq.on('error', (err) => {
    if (!res.headersSent) {
      res.status(502).json({ error: 'Proxy request failed', details: err.message });
    }
  });

  proxyReq.end();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  // Support CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', '*');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const rawUrl = (req.query.url || req.query.src || '') as string;
  const driveIdParam = (req.query.id || req.query.driveId || '') as string;

  let targetUrl = rawUrl.trim();

  // Si un ID de drive explicite est passé
  if (driveIdParam) {
    targetUrl = `https://lh3.googleusercontent.com/d/${driveIdParam}=w1600`;
  } else if (targetUrl) {
    // Détecter automatiquement si c'est un lien Google Drive
    const driveId = extractDriveId(targetUrl);
    if (driveId) {
      // Prioriser l'URL directe CDN Google UserContent avec fallback thumbnail
      targetUrl = `https://lh3.googleusercontent.com/d/${driveId}=w1600`;
    }
  }

  if (!targetUrl) {
    return res.status(400).json({ error: 'Paramètre url ou id manquant' });
  }

  fetchWithRedirects(targetUrl, res, 0);
}
