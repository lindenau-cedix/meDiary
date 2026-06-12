import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { config } from '../config.js';

/**
 * Cloudflare-Access-Schutz (Zero Trust) für einzelne Endpunkte.
 *
 * Cloudflare prüft am Edge die Identität (Login bzw. Service-Token via
 * `CF-Access-Client-Id`/`CF-Access-Client-Secret`) und reicht an den Origin
 * ein signiertes JWT weiter — Header `Cf-Access-Jwt-Assertion` (alternativ
 * Cookie `CF_Authorization`). Diese Middleware validiert das JWT am Origin:
 *
 *  - Signatur (RS256) gegen die öffentlichen Team-Schlüssel
 *    (`https://<team>.cloudflareaccess.com/cdn-cgi/access/certs`, 10 min Cache,
 *    bei unbekannter kid einmaliger Frisch-Abruf für Key-Rotation),
 *  - Audience = AUD-Tag der Access-Application (`CF_ACCESS_AUD`),
 *  - Issuer = Team-Domain, Ablauf (`exp`) / Gültigkeitsbeginn (`nbf`).
 *
 * Fail-closed: ohne Konfiguration (CF_ACCESS_TEAM_DOMAIN + CF_ACCESS_AUD)
 * antwortet der Endpunkt mit 503. `CF_ACCESS_DISABLED=true` ist der explizite
 * Bypass für lokale Entwicklung und Smoke-Tests.
 */

interface AccessJwk {
  kid?: string;
  kty?: string;
  alg?: string;
  n?: string;
  e?: string;
}

export interface AccessJwtPayload {
  aud?: string | string[];
  iss?: string;
  exp?: number;
  nbf?: number;
  iat?: number;
  sub?: string;
  email?: string;
  /** Bei Service-Tokens: die Client-ID des Tokens. */
  common_name?: string;
  [key: string]: unknown;
}

const JWKS_TTL_MS = 10 * 60 * 1000;
let jwksCache: { url: string; keys: AccessJwk[]; fetchedAt: number } | null = null;

/** Team-Domain → Issuer-URL ("meinteam" → "https://meinteam.cloudflareaccess.com"). */
export function accessIssuer(teamDomain: string): string {
  if (/^https?:\/\//i.test(teamDomain)) return teamDomain.replace(/\/+$/, '');
  const host = teamDomain.includes('.') ? teamDomain : `${teamDomain}.cloudflareaccess.com`;
  return `https://${host}`;
}

async function fetchJwks(url: string, force = false): Promise<AccessJwk[]> {
  if (!force && jwksCache && jwksCache.url === url && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) {
    return jwksCache.keys;
  }
  const res = await fetch(url);
  if (!res.ok) throw new Error(`JWKS-Abruf fehlgeschlagen (HTTP ${res.status})`);
  const body = (await res.json()) as { keys?: AccessJwk[] };
  const keys = (body.keys ?? []).filter((k) => k.kty === 'RSA' && k.n && k.e);
  if (keys.length === 0) throw new Error('JWKS enthält keine RSA-Schlüssel');
  jwksCache = { url, keys, fetchedAt: Date.now() };
  return keys;
}

function decodePart<T>(part: string, what: string): T {
  try {
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8')) as T;
  } catch {
    throw new Error(`Token-${what} nicht dekodierbar`);
  }
}

/** Validiert ein Cloudflare-Access-JWT vollständig; wirft bei jedem Mangel. */
export async function verifyAccessJwt(
  token: string,
  opts: { issuer: string; aud: string; certsUrl: string },
): Promise<AccessJwtPayload> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Token ist kein JWT');
  const [headerB64, payloadB64, signatureB64] = parts;

  const header = decodePart<{ alg?: string; kid?: string }>(headerB64, 'Header');
  if (header.alg !== 'RS256') throw new Error(`Unerwarteter Signatur-Algorithmus: ${header.alg ?? '—'}`);

  let keys = await fetchJwks(opts.certsUrl);
  let jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) {
    // Key-Rotation: einmal frisch laden, bevor wir ablehnen.
    keys = await fetchJwks(opts.certsUrl, true);
    jwk = keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) throw new Error('Unbekannte Schlüssel-ID (kid)');

  const publicKey = crypto.createPublicKey({ key: { kty: 'RSA', n: jwk.n, e: jwk.e }, format: 'jwk' });
  const valid = crypto.verify(
    'RSA-SHA256',
    Buffer.from(`${headerB64}.${payloadB64}`),
    publicKey,
    Buffer.from(signatureB64, 'base64url'),
  );
  if (!valid) throw new Error('Signatur ungültig');

  const payload = decodePart<AccessJwtPayload>(payloadB64, 'Payload');
  const now = Math.floor(Date.now() / 1000);
  const skew = 30; // Sekunden Uhren-Toleranz
  if (typeof payload.exp !== 'number' || payload.exp < now - skew) throw new Error('Token abgelaufen');
  if (typeof payload.nbf === 'number' && payload.nbf > now + skew) throw new Error('Token noch nicht gültig');

  const audiences = Array.isArray(payload.aud) ? payload.aud : payload.aud ? [payload.aud] : [];
  if (!audiences.includes(opts.aud)) throw new Error('Audience (AUD-Tag) stimmt nicht');
  if (payload.iss !== opts.issuer) throw new Error('Issuer stimmt nicht');
  return payload;
}

function tokenFromRequest(req: Request): string | null {
  const header = req.get('Cf-Access-Jwt-Assertion');
  if (header?.trim()) return header.trim();
  const cookies = req.headers.cookie;
  if (cookies) {
    const m = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(cookies);
    if (m) return decodeURIComponent(m[1]);
  }
  return null;
}

export function requireCloudflareAccess(req: Request, res: Response, next: NextFunction): void {
  if (config.cfAccess.disabled) {
    next();
    return;
  }
  const { teamDomain, aud } = config.cfAccess;
  if (!teamDomain || !aud) {
    res.status(503).json({
      error:
        'Cloudflare Access ist nicht konfiguriert — CF_ACCESS_TEAM_DOMAIN und CF_ACCESS_AUD setzen ' +
        '(oder CF_ACCESS_DISABLED=true für lokale Entwicklung).',
    });
    return;
  }
  const token = tokenFromRequest(req);
  if (!token) {
    res.status(401).json({ error: 'Kein Cloudflare-Access-Token übermittelt (Header Cf-Access-Jwt-Assertion)' });
    return;
  }
  const issuer = accessIssuer(teamDomain);
  const certsUrl = config.cfAccess.certsUrl ?? `${issuer}/cdn-cgi/access/certs`;
  verifyAccessJwt(token, { issuer, aud, certsUrl })
    .then((payload) => {
      (req as Request & { cfAccess?: AccessJwtPayload }).cfAccess = payload;
      next();
    })
    .catch((e: unknown) => {
      res.status(401).json({
        error: `Cloudflare-Access-Token ungültig: ${e instanceof Error ? e.message : String(e)}`,
      });
    });
}
