// The garden's landscape (Roy, 11 Oct 2026: "an image in the background with
// the garden landscape (no plants) but should look alive. use open ai for the
// image and gemini for the motion").
//
// One wide night panorama of Velune's five biomes, empty, painted by OpenAI
// (IMAGE_MODEL, as Roy OS's weekly world), then turned into a seamless loop by
// Gemini (VIDEO_MODEL, omni like Roy OS). Both go to the R2 bucket
// work-garden-media under landscape/ and are served by this Worker at /media/…
// behind the sign-in. The GardenScene Workflow (src/entry.js) runs the steps;
// each paid step runs once. Nothing about Roy's work goes into a prompt: the
// prompts are fixed text.
//
// settings 'landscape'     {still_key, clip_key, made_at}   what the page shows
// settings 'landscape_job' {status, started_at, error}      painting | animating | ready | failed
// Old pictures stay in R2 (nothing is deleted); a repaint only points at new ones.

import { sessionKey, sameText } from './pass.js';

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta';
export const IMAGE_MODEL = 'gpt-image-2.5-flare';
export const VIDEO_MODEL = 'gemini-omni-flash-preview';
const BUSY = 30 * 60e3;        // a job older than this counts as stuck, and Paint works again
const SIGNED_FOR = 30 * 60e3;  // how long Gemini may read the still from its signed address
const KEY = /^landscape\/[0-9a-z-]+\.(jpg|mp4)$/;
const enc = new TextEncoder();
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---- The prompts: fixed, no plants, nothing from the garden's text ----
export const STILL_PROMPT = [
  'A wide cinematic panorama of Velune, an alien night world, painted in a soft painterly style with gentle glow, rich but calm colours, fine detail, no text, no frame.',
  'The sky: deep indigo night full of stars, the ringed gas giant Hesper large and low on the left with its rings catching pale light, the small silver moon Pell high on the right.',
  'Five landscapes flow into each other from left to right along one continuous ground line at the same camera height, a gentle three-quarter view from standing height: Glass Dunes (pale gold sand dunes with glints of blue glass), Petal Steppe (rolling mauve grass with a few drifting glowing petals), Tide Marsh (dark teal shallows with soft light on the water), Rust Flats (cracked rust-red crust under a faint spore haze), Ember Hollows (near-black rock with cave mouths glowing warm orange).',
  'The ground in the foreground and middle distance is open and empty, like a garden waiting to be planted: no plants, no trees, no flowers, no crystals standing up, no creatures, no people, no buildings, no paths. Distant hills and the horizon may have soft silhouettes.',
  'Calm, quiet, hopeful mood. Landscape 16:9.'
].join('\n');

export const MOTION_PROMPT = [
  'Animate the supplied image as a seamless infinite loop for a background. Keep the painting exactly as it is: composition, colours, light and the painterly style; do not make it photorealistic.',
  'ABSOLUTE RULES:\n- The camera stays completely static and locked: no zoom, pan, tilt, dolly, push-in, parallax, shake, reframing or perspective drift.\n- A clean cyclic loop: the last frame matches the first frame.\n- No cuts or transitions. Nothing new appears on the ground: no plants, creatures, people or objects grow, walk in or vanish.',
  'MOTION:\n- Stars twinkle softly; light glides slowly along Hesper\'s rings; thin clouds drift across the sky.\n- Ripples and moving light on the Tide Marsh water; a slow spore haze over the Rust Flats; the cave mouths of the Ember Hollows breathe a warm flicker.\n- A few glowing petals and specks of light drift on the air over the Petal Steppe; a light breeze moves the mauve grass and the sand on the dunes.\n- Every motion is slow and small and comes back to where it started, so the loop closes without a jump.',
  'OUTPUT: alive, subtle, calm, premium. Landscape 16:9. Sound: only a soft night ambience; no voices, no music.'
].join('\n');

// ---- What the page shows ----
async function setting(db, key) {
  const raw = await db.prepare('SELECT value FROM settings WHERE key = ?').bind(key).first('value');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}
async function put(db, key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run();
}
export const setJob = (db, job) => put(db, 'landscape_job', job);

export async function landscapeState(db, now = Date.now()) {
  const [shown, job] = await Promise.all([setting(db, 'landscape'), setting(db, 'landscape_job')]);
  const busy = job && (job.status === 'painting' || job.status === 'animating') && now - Date.parse(job.started_at) < BUSY;
  return {
    still: shown && shown.still_key ? '/media/' + shown.still_key : null,
    clip: shown && shown.clip_key ? '/media/' + shown.clip_key : null,
    status: busy ? job.status : job && job.status === 'failed' ? 'failed' : shown ? 'ready' : 'none'
  };
}

// POST /api/landscape: start painting (or repainting). Refused while a job runs.
export async function startLandscape(env, now = Date.now()) {
  if (!env.GARDEN_SCENE || !env.MEDIA) return { status: 503, body: { error: 'The landscape is not set up on this Worker.' } };
  if (!env.OPENAI_API_KEY) return { status: 503, body: { error: 'Add the OPENAI_API_KEY secret to paint the landscape.' } };
  const { status } = await landscapeState(env.DB, now);
  if (status === 'painting' || status === 'animating') return { status: 409, body: { error: 'The landscape is already being painted.' } };
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'z').toLowerCase();
  await setJob(env.DB, { status: 'painting', started_at: new Date(now).toISOString(), error: null });
  try {
    await env.GARDEN_SCENE.create({ params: { stamp } });
  } catch (e) {
    await setJob(env.DB, { status: 'failed', started_at: new Date(now).toISOString(), error: String(e && e.message || e).slice(0, 300) });
    throw e;
  }
  return null;
}

// The Workflow's last step: point the page at the new pictures (the clip may be missing).
export async function finishLandscape(db, { stillKey, clipKey, error = null }, now = Date.now()) {
  await put(db, 'landscape', { still_key: stillKey, clip_key: clipKey || null, made_at: new Date(now).toISOString() });
  await setJob(db, { status: 'ready', started_at: new Date(now).toISOString(), error });
}

// ---- Painting: OpenAI, the same call and settings as Roy OS's stills ----
const SIZES = ['2048x1152', '1536x1024'];
function fromBase64(b64) {
  const s = atob(b64), out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
export async function paintStill(env) {
  const model = env.IMAGE_MODEL || IMAGE_MODEL;
  let res, data;
  for (const size of SIZES) {
    res = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
      body: JSON.stringify({ model, prompt: STILL_PROMPT, n: 1, size, quality: 'high', background: 'opaque', moderation: 'low', output_format: 'jpeg', output_compression: 92 })
    });
    data = await res.json().catch(() => ({}));
    if (!(res.status === 400 && /size/i.test((data.error && (data.error.param || data.error.message)) || ''))) break;
  }
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(data.error && data.error.message) || 'image generation failed'}`);
  const b64 = data.data && data.data[0] && data.data[0].b64_json;
  if (!b64) throw new Error('OpenAI returned no image');
  return fromBase64(b64);
}

// ---- Motion: Gemini omni (Interactions API), as Roy OS. The still goes in by URL
// (inline bytes were refused there), so Gemini gets a signed address that works
// for half an hour.
async function gemini(env, method, path, body) {
  const res = await fetch(`${GEMINI_URL}${path}`, { method, headers: { 'x-goog-api-key': env.GEMINI_API_KEY, 'content-type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Gemini ${res.status}: ${(data.error && data.error.message) || 'request failed'}`);
  return data;
}
function findVideo(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'video' && (node.data || node.uri)) return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) { const f = findVideo(v); if (f) return f; }
  return null;
}
export async function animate(env, imageUrl) {
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not set');
  let result = await gemini(env, 'POST', '/interactions', {
    model: env.VIDEO_MODEL || VIDEO_MODEL,
    input: [{ type: 'image', uri: imageUrl, mime_type: 'image/jpeg' }, { type: 'text', text: MOTION_PROMPT }],
    response_format: { type: 'video', aspect_ratio: '16:9' }
  });
  const deadline = Date.now() + 12 * 60e3;
  while (!findVideo(result)) {
    const status = String(result.status || '').toLowerCase();
    if (['failed', 'cancelled', 'canceled', 'blocked'].includes(status)) throw new Error('Gemini video ' + status);
    if (!result.id || Date.now() > deadline) throw new Error('Gemini returned no video');
    await sleep(10000);
    result = await gemini(env, 'GET', `/interactions/${result.id}`);
  }
  const video = findVideo(result);
  if (video.data) return fromBase64(video.data);
  const file = video.uri.split('?')[0].replace(/:download$/, '').replace(/^.*\/v1beta\//, '');
  while (true) {
    const f = await gemini(env, 'GET', `/${file}`).catch(() => ({ state: 'ACTIVE' }));
    const state = String(f.state || 'ACTIVE').toUpperCase();
    if (state === 'ACTIVE') break;
    if (state === 'FAILED' || Date.now() > deadline) throw new Error('Gemini video file never became ready');
    await sleep(5000);
  }
  const dl = await fetch(`${GEMINI_URL}/${file}:download?alt=media`, { headers: { 'x-goog-api-key': env.GEMINI_API_KEY } });
  if (!dl.ok) throw new Error(`Gemini download ${dl.status}`);
  return new Uint8Array(await dl.arrayBuffer());
}

// ---- /media/<key>: the pictures, from R2 ----
async function mediaSig(db, key, exp) {
  const k = await crypto.subtle.importKey('raw', enc.encode(await sessionKey(db)), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await crypto.subtle.sign('HMAC', k, enc.encode(`media:${key}:${exp}`)));
}
// A signed address for one picture, for Gemini to read without the sign-in.
export async function signedMediaUrl(env, key, now = Date.now()) {
  const exp = String(now + SIGNED_FOR);
  const sig = await mediaSig(env.DB, key, exp);
  return `${env.PUBLIC_URL}/media/${key}?exp=${exp}&sig=${sig}`;
}

// Answers GET /media/<key> (null for other paths). Signed in, or with a good signature.
export async function mediaRoute(request, env, signedIn, now = Date.now()) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/media/') || request.method !== 'GET') return null;
  const key = url.pathname.slice(7);
  const plain = { 'cache-control': 'no-store', 'content-type': 'text/plain; charset=utf-8' };
  if (!KEY.test(key) || !env.MEDIA) return new Response('Not found', { status: 404, headers: plain });
  if (!(await signedIn())) {
    const exp = url.searchParams.get('exp') || '', sig = url.searchParams.get('sig') || '';
    const good = /^\d+$/.test(exp) && Number(exp) >= now && Number(exp) <= now + SIGNED_FOR && sameText(sig, await mediaSig(env.DB, key, exp));
    if (!good) return new Response('Not allowed', { status: 401, headers: plain });
  }
  const head = await env.MEDIA.head(key);
  if (!head) return new Response('Not found', { status: 404, headers: plain });
  const type = key.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
  const headers = { 'content-type': type, 'cache-control': 'private, max-age=86400, immutable', 'accept-ranges': 'bytes' };
  // Video players (Safari above all) ask for byte ranges.
  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get('range') || '');
  if (range && (range[1] || range[2])) {
    const size = head.size;
    let start = range[1] ? Number(range[1]) : size - Number(range[2]);
    let end = range[1] && range[2] ? Number(range[2]) : size - 1;
    start = Math.max(0, start); end = Math.min(end, size - 1);
    if (start > end) return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    const obj = await env.MEDIA.get(key, { range: { offset: start, length: end - start + 1 } });
    return new Response(obj.body, { status: 206, headers: { ...headers, 'content-range': `bytes ${start}-${end}/${size}`, 'content-length': String(end - start + 1) } });
  }
  const obj = await env.MEDIA.get(key);
  return new Response(obj.body, { headers: { ...headers, 'content-length': String(head.size) } });
}
