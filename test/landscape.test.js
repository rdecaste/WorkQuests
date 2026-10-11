import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from './helpers.js';
import { finishLandscape, signedMediaUrl, paintStill, animate, STILL_PROMPT, MOTION_PROMPT } from '../src/landscape.js';

// R2 for the tests: put, head, get (with a byte range).
function fakeR2() {
  const store = new Map();
  return {
    store,
    async put(key, bytes) { store.set(key, new Uint8Array(bytes)); },
    async head(key) { return store.has(key) ? { size: store.get(key).length } : null; },
    async get(key, { range } = {}) {
      if (!store.has(key)) return null;
      const all = store.get(key);
      const part = range ? all.slice(range.offset, range.offset + range.length) : all;
      return { body: part, size: all.length };
    }
  };
}
function landEnv(extra = {}) {
  const runs = [];
  const env = makeEnv({ MEDIA: fakeR2(), GARDEN_SCENE: { create: async opts => { runs.push(opts); return { id: 'run1' }; } }, OPENAI_API_KEY: 'test', GEMINI_API_KEY: 'test', PUBLIC_URL: 'https://garden.example.test', ...extra });
  return { env, runs };
}

test('nothing painted yet: the state says so', async () => {
  const r = await call(landEnv().env, 'GET', '/api/garden');
  assert.deepEqual(r.body.landscape, { still: null, clip: null, status: 'none' });
});

test('Paint starts the Workflow once, and the state shows it painting', async () => {
  const { env, runs } = landEnv();
  const r = await call(env, 'POST', '/api/landscape', {});
  assert.equal(r.status, 200);
  assert.equal(r.body.landscape.status, 'painting');
  assert.equal(runs.length, 1);
  assert.match(runs[0].params.stamp, /^[0-9a-z]+$/);
  const again = await call(env, 'POST', '/api/landscape', {});
  assert.equal(again.status, 409);
  assert.equal(runs.length, 1);
});

test('Paint is refused without the OpenAI key or the bindings', async () => {
  assert.equal((await call(landEnv({ OPENAI_API_KEY: '' }).env, 'POST', '/api/landscape', {})).status, 503);
  assert.equal((await call(landEnv({ GARDEN_SCENE: undefined }).env, 'POST', '/api/landscape', {})).status, 503);
});

test('when the Workflow finishes, the page gets the still and the loop', async () => {
  const { env } = landEnv();
  await finishLandscape(env.DB, { stillKey: 'landscape/a1.jpg', clipKey: 'landscape/a1.mp4' });
  const r = await call(env, 'GET', '/api/garden');
  assert.deepEqual(r.body.landscape, { still: '/media/landscape/a1.jpg', clip: '/media/landscape/a1.mp4', status: 'ready' });
  await finishLandscape(env.DB, { stillKey: 'landscape/b2.jpg', clipKey: null, error: 'clip: no' });
  assert.deepEqual((await call(env, 'GET', '/api/garden')).body.landscape, { still: '/media/landscape/b2.jpg', clip: null, status: 'ready' });
});

test('/media serves the pictures to the signed-in page only, with byte ranges for the video', async () => {
  const { env } = landEnv();
  await env.MEDIA.put('landscape/a1.mp4', new TextEncoder().encode('0123456789'));
  const full = await call(env, 'GET', '/media/landscape/a1.mp4');
  assert.equal(full.status, 200);
  assert.equal(String(full.body), '0123456789');
  assert.equal(full.headers.get('content-type'), 'video/mp4');
  const part = await call(env, 'GET', '/media/landscape/a1.mp4', undefined, { headers: { range: 'bytes=2-5' } });
  assert.equal(part.status, 206);
  assert.equal(String(part.body), '2345');
  assert.equal(part.headers.get('content-range'), 'bytes 2-5/10');
  assert.equal((await call(env, 'GET', '/media/landscape/a1.mp4', undefined, { jwt: '' })).status, 401);
  assert.equal((await call(env, 'GET', '/media/landscape/none.mp4')).status, 404);
  assert.equal((await call(env, 'GET', '/media/other/a1.mp4')).status, 404);
  assert.equal((await call(env, 'GET', '/media/landscape/..%2Fx.jpg')).status, 404);
});

test('a signed address lets Gemini read the still for half an hour, nothing else', async () => {
  const { env } = landEnv();
  await env.MEDIA.put('landscape/a1.jpg', new Uint8Array([1, 2, 3]));
  await env.MEDIA.put('landscape/a2.jpg', new Uint8Array([4]));
  const url = new URL(await signedMediaUrl(env, 'landscape/a1.jpg'));
  assert.equal(url.origin, 'https://garden.example.test');
  const ok = await call(env, 'GET', url.pathname + url.search, undefined, { jwt: '' });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get('content-type'), 'image/jpeg');
  const other = await call(env, 'GET', '/media/landscape/a2.jpg' + url.search, undefined, { jwt: '' });
  assert.equal(other.status, 401);
  const tampered = url.search.replace(/exp=(\d+)/, (_, n) => `exp=${Number(n) + 1}`);
  assert.equal((await call(env, 'GET', url.pathname + tampered, undefined, { jwt: '' })).status, 401);
  const old = new URL(await signedMediaUrl(env, 'landscape/a1.jpg', Date.now() - 31 * 60e3));
  assert.equal((await call(env, 'GET', old.pathname + old.search, undefined, { jwt: '' })).status, 401);
});

test('painting and animating call OpenAI and Gemini with the fixed prompts only', async () => {
  const seen = [];
  const real = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    seen.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null });
    if (String(url).includes('openai.com')) return new Response(JSON.stringify({ data: [{ b64_json: Buffer.from('jpg').toString('base64') }] }));
    if (String(url).endsWith('/interactions')) return new Response(JSON.stringify({ id: 'i1', outputs: [{ type: 'video', data: Buffer.from('mp4').toString('base64') }] }));
    throw new Error('unexpected ' + url);
  };
  try {
    const env = { OPENAI_API_KEY: 'k', GEMINI_API_KEY: 'g' };
    assert.equal(Buffer.from(await paintStill(env)).toString(), 'jpg');
    assert.equal(Buffer.from(await animate(env, 'https://garden.example.test/media/landscape/a1.jpg?x')).toString(), 'mp4');
  } finally { globalThis.fetch = real; }
  assert.equal(seen[0].body.prompt, STILL_PROMPT);
  assert.equal(seen[0].body.model, 'gpt-image-2.5-flare');
  assert.equal(seen[1].body.model, 'gemini-omni-flash-preview');
  assert.equal(seen[1].body.input[1].text, MOTION_PROMPT);
  assert.match(STILL_PROMPT, /no plants/);
});
