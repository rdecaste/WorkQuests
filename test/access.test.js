import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, token, EMAIL, TEAM } from './helpers.js';
import { primeCerts } from '../src/access.js';

test('a valid Access token for an allowed email gets in', async () => {
  const r = await call(makeEnv(), 'GET', '/api/garden');
  assert.equal(r.status, 200);
  assert.ok(Array.isArray(r.body.plants));
});

test('the page itself is behind the check too, with security headers', async () => {
  const env = makeEnv();
  const ok = await call(env, 'GET', '/');
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  const no = await call(env, 'GET', '/', undefined, { jwt: '' });
  assert.equal(no.status, 401);
  assert.equal(no.body, 'Not allowed');
});

test('fails closed when Access is not configured', async () => {
  for (const missing of ['ACCESS_TEAM', 'ACCESS_AUD', 'ALLOWED_EMAILS']) {
    const r = await call(makeEnv({ [missing]: '' }), 'GET', '/api/garden');
    assert.equal(r.status, 503, missing);
  }
});

test('refuses bad tokens', async () => {
  const env = makeEnv();
  const cases = {
    expired: await token({ exp: Math.floor(Date.now() / 1000) - 10 }),
    'wrong audience': await token({ aud: ['someone-else'] }),
    'wrong issuer': await token({ iss: 'https://evil.cloudflareaccess.com' }),
    'other email': await token({ email: 'stranger@example.test' }),
    'unknown key': await token({}, { kid: 'nope' }),
    'none alg': await token({}, { alg: 'none' }),
    garbage: 'a.b.c'
  };
  for (const [name, jwt] of Object.entries(cases)) {
    const r = await call(env, 'GET', '/api/garden', undefined, { jwt });
    assert.ok([401, 403].includes(r.status), `${name}: ${r.status}`);
  }
  // A tampered payload breaks the signature.
  const good = await token();
  const [h, , s] = good.split('.');
  const forged = Buffer.from(JSON.stringify({ iss: 'https://test-team.cloudflareaccess.com', aud: ['test-aud'], email: EMAIL, exp: 9999999999 })).toString('base64url');
  assert.equal((await call(env, 'GET', '/api/garden', undefined, { jwt: `${h}.${forged}.${s}` })).status, 401);
});

test('emails are matched case-insensitively from a comma list', async () => {
  const r = await call(makeEnv({ ALLOWED_EMAILS: ` other@example.test , ${EMAIL.toUpperCase()} ` }), 'GET', '/api/garden');
  assert.equal(r.status, 200);
});

test('the dev bypass works only on localhost', async () => {
  const env = makeEnv({ DEV_SKIP_ACCESS: '1' });
  const r = await call(env, 'GET', '/api/garden', undefined, { jwt: '' });
  assert.equal(r.status, 401);
});

test('writes need JSON from the same origin', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'POST', '/api/ideas', { name: 'x', type: 'project' }, { headers: { 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call(env, 'POST', '/api/ideas', { name: 'x', type: 'project' }, { headers: { origin: 'https://evil.example' } })).status, 403);
});

test('a key set fetched later does not drop the keys already known', async () => {
  const env = makeEnv();
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({ keys: [] }), { status: 200 });
  try {
    await primeCerts(TEAM, []); // as if Cloudflare's set was just fetched, without our test key
    assert.equal((await call(env, 'GET', '/api/garden')).status, 200);
    assert.equal((await call(env, 'GET', '/api/garden', undefined, { jwt: await token({}, { kid: 'other' }) })).status, 401);
    assert.equal((await call(env, 'GET', '/api/garden')).status, 200);
  } finally { globalThis.fetch = real; }
});
