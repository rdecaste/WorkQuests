// Signing in through Roy OS (Roy, 11 Oct 2026: "my RoyOS should have the
// access layer, from there I should be able to navigate to the other pages").
//
// Roy OS, once Roy is signed in there, asks this Worker for a pass over a
// service binding (GardenPass.mint in src/entry.js; that entrypoint can't be
// reached from the internet) and sends the browser to /pass?t=<pass>. A pass
// works once, within a minute, and turns into a garden_session cookie for
// 12 hours. A visitor without a cookie is sent to Roy OS's /go/garden, which
// comes straight back with a fresh pass, or shows Roy OS's own sign-in.
//
// Passes are kept in settings as 'pass:<sha-256 of the pass>' (the pass itself
// is never stored); the cookie is signed with 'session_key', made once.

const COOKIE = 'garden_session';
const SESSION = 12 * 3600;
const PASS_LIFE = 60e3;
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const random = () => hex(crypto.getRandomValues(new Uint8Array(32)));
const sha256 = async text => hex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

function sameText(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}

async function sessionKey(db) {
  const have = await db.prepare("SELECT value FROM settings WHERE key = 'session_key'").first('value');
  if (have) return have;
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('session_key', ?)").bind(random()).run();
  return db.prepare("SELECT value FROM settings WHERE key = 'session_key'").first('value');
}
async function sign(db, text) {
  const key = await crypto.subtle.importKey('raw', enc.encode(await sessionKey(db)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', key, enc.encode(text)));
}

// A new one-time pass (64 hex characters). Old passes nobody used are cleared.
export async function mintPass(db, now = Date.now()) {
  const pass = random();
  await db.batch([
    db.prepare("DELETE FROM settings WHERE key LIKE 'pass:%' AND CAST(value AS INTEGER) < ?").bind(now),
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').bind('pass:' + await sha256(pass), String(now + PASS_LIFE))
  ]);
  return pass;
}

// True once for a pass that is known and not expired; using it removes it.
export async function usePass(db, pass, now = Date.now()) {
  if (!/^[0-9a-f]{64}$/.test(String(pass || ''))) return false;
  const until = await db.prepare('DELETE FROM settings WHERE key = ? RETURNING value').bind('pass:' + await sha256(pass)).first('value');
  return until != null && Number(until) >= now;
}

export async function sessionCookie(db, now = Date.now()) {
  const expires = Math.floor(now / 1000) + SESSION;
  return `${COOKIE}=${expires}.${await sign(db, 'garden-session:' + expires)}; Path=/; Max-Age=${SESSION}; HttpOnly; Secure; SameSite=Lax`;
}

export async function hasSession(request, db, now = Date.now()) {
  const cookie = (request.headers.get('Cookie') || '').split(/;\s*/).find(c => c.startsWith(COOKIE + '='));
  if (!cookie) return false;
  const [expires, mac] = cookie.slice(COOKIE.length + 1).split('.');
  if (!/^\d+$/.test(expires || '') || !mac || Number(expires) * 1000 < now) return false;
  return sameText(mac, await sign(db, 'garden-session:' + expires));
}

// GET /pass?t=…: a good pass becomes the cookie and goes to the garden.
export async function passRoute(request, env, now = Date.now()) {
  const url = new URL(request.url);
  if (url.pathname !== '/pass' || request.method !== 'GET') return null;
  const headers = { 'cache-control': 'no-store' };
  if (!await usePass(env.DB, url.searchParams.get('t'), now)) {
    return new Response('This link has expired. Open Work Garden from Roy OS again.', { status: 401, headers: { ...headers, 'content-type': 'text/plain; charset=utf-8' } });
  }
  return new Response(null, { status: 303, headers: { ...headers, location: '/', 'set-cookie': await sessionCookie(env.DB, now) } });
}
