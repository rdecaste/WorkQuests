// Work Garden: one Worker serving the page and its API. You get in through
// Roy OS (src/pass.js: a one-time pass from Roy OS becomes a 12-hour cookie)
// or with a Cloudflare Access token (src/access.js).
//
//   GET  /pass?t=…         a pass from Roy OS → the cookie, then the page
// Everything else needs the cookie or an Access token:
//   /                      the page (public/: index.html, app.js, draw.js, style.css, shared/)
//   GET  /api/garden       everything the page shows
//   POST /api/plants, PATCH /api/plants/:id, POST /api/plants/:id/{checkin,need,park,revive,done,season,branches}
//   POST /api/branches/:id/{updates,done}, POST /api/follow-ups/:id/{clear,unclear}
//   POST /api/ideas, DELETE /api/ideas/:id (hides it; nothing is deleted)
//   PATCH /api/seasons/:id, POST /api/seasons/:id/milestones, POST /api/milestones/:id/toggle
//   GET /api/guard, POST /api/guard/words, DELETE /api/guard/words/:hash, POST /api/reword
//   GET  /api/export       every table as JSON
// The full list with handlers is ROUTES in src/api.js.
import { checkAccess } from './access.js';
import { api } from './api.js';
import { passRoute, hasSession } from './pass.js';

const SECURITY = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()'
};
const secure = res => {
  const out = new Response(res.body, res);
  for (const [k, v] of Object.entries(SECURITY)) out.headers.set(k, v);
  return out;
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pass = await passRoute(request, env);
    if (pass) return secure(pass);
    let who = await checkAccess(request, env);
    if (!who.ok && await hasSession(request, env.DB)) who = { ok: true, email: null };
    if (!who.ok) {
      console.warn('access refused:', who.reason);
      // The page itself goes to Roy OS, which sends the browser back with a pass (or asks Roy to sign in there).
      if (env.ROYOS_URL && request.method === 'GET' && !url.pathname.startsWith('/api/')) {
        return secure(new Response(null, { status: 303, headers: { location: `${env.ROYOS_URL}/go/garden`, 'cache-control': 'no-store' } }));
      }
      return secure(new Response('Not allowed', { status: env.ROYOS_URL && who.status === 503 ? 401 : who.status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } }));
    }
    if (url.pathname.startsWith('/api/')) return secure(await api(request, env, who));
    const res = await env.ASSETS.fetch(request);
    const out = secure(res);
    out.headers.set('cache-control', 'no-cache');
    return out;
  }
};
