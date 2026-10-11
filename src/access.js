// Cloudflare Access in front of everything. Access itself stops anyone who is
// not on the list; this checks again in the Worker, so a request that slips
// past Access (a misconfigured route, workers.dev left open) still gets nothing.
// Fails closed: without ACCESS_TEAM, ACCESS_AUD and ALLOWED_EMAILS, no one gets in.

const CERTS = new Map(); // team -> { at, keys: Map(kid -> CryptoKey) }
const CERTS_TTL = 3600e3;
const REFETCH_GAP = 60e3; // an unknown key id triggers at most one fetch a minute

const b64url = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(s.length / 4) * 4, '=')), c => c.charCodeAt(0));
const json = s => JSON.parse(new TextDecoder().decode(b64url(s)));
const importKey = jwk => crypto.subtle.importKey('jwk', { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);

// Adds keys to the team's set (the tests hand over their own instead of fetching
// Cloudflare's). Keys already known stay until the set expires, so a rotation
// in the middle of a session doesn't lock anyone out.
export async function primeCerts(team, jwks) {
  const have = CERTS.get(team);
  const keys = have && Date.now() - have.at < CERTS_TTL ? have.keys : new Map();
  for (const k of jwks) if (k && k.kid && k.kty === 'RSA') keys.set(k.kid, await importKey(k));
  CERTS.set(team, { at: Date.now(), keys });
}

async function keyFor(team, kid) {
  const cached = CERTS.get(team);
  const fresh = cached && Date.now() - cached.at < CERTS_TTL;
  if (fresh && cached.keys.has(kid)) return cached.keys.get(kid);
  if (cached && Date.now() - cached.at < REFETCH_GAP) return null;
  try {
    const res = await fetch(`https://${team}.cloudflareaccess.com/cdn-cgi/access/certs`);
    if (!res.ok) return null;
    await primeCerts(team, (await res.json()).keys || []);
  } catch { return null; }
  return CERTS.get(team).keys.get(kid) || null;
}

const allowed = env => String(env.ALLOWED_EMAILS || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);

// { ok: true, email } or { ok: false, status, reason }. The reason is for the
// log only; the visitor just sees "Not allowed".
export async function checkAccess(request, env) {
  const url = new URL(request.url);
  if (env.DEV_SKIP_ACCESS === '1' && (url.hostname === 'localhost' || url.hostname === '127.0.0.1')) return { ok: true, email: 'dev@localhost' };
  const team = env.ACCESS_TEAM, aud = env.ACCESS_AUD, emails = allowed(env);
  if (!team || !aud || !emails.length) return { ok: false, status: 503, reason: 'Access is not configured' };
  const token = request.headers.get('Cf-Access-Jwt-Assertion');
  if (!token) return { ok: false, status: 401, reason: 'no Access token' };
  try {
    const [h, p, s] = token.split('.');
    if (!h || !p || !s) return { ok: false, status: 401, reason: 'malformed token' };
    const head = json(h), claims = json(p);
    if (head.alg !== 'RS256' || !head.kid) return { ok: false, status: 401, reason: 'wrong algorithm' };
    const key = await keyFor(team, head.kid);
    if (!key) return { ok: false, status: 401, reason: 'unknown key' };
    const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64url(s), new TextEncoder().encode(`${h}.${p}`));
    if (!good) return { ok: false, status: 401, reason: 'bad signature' };
    const now = Date.now() / 1000;
    if (!(claims.exp > now)) return { ok: false, status: 401, reason: 'expired' };
    if (claims.nbf && claims.nbf > now + 60) return { ok: false, status: 401, reason: 'not yet valid' };
    if (claims.iss !== `https://${team}.cloudflareaccess.com`) return { ok: false, status: 401, reason: 'wrong issuer' };
    if (!(Array.isArray(claims.aud) ? claims.aud : [claims.aud]).includes(aud)) return { ok: false, status: 401, reason: 'wrong audience' };
    const email = String(claims.email || '').toLowerCase();
    if (!emails.includes(email)) return { ok: false, status: 403, reason: 'not on the list' };
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, reason: 'unreadable token' };
  }
}
