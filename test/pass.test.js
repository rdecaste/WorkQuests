import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call } from './helpers.js';
import { mintPass, usePass } from '../src/pass.js';

const ROYOS = 'https://royos.example.test';
const cookieOf = r => r.headers.get('set-cookie').split(';')[0];

test('a pass from Roy OS becomes a session cookie that opens the page and the API', async () => {
  const env = makeEnv({ ROYOS_URL: ROYOS });
  const pass = await mintPass(env.DB);
  const r = await call(env, 'GET', `/pass?t=${pass}`, undefined, { jwt: '' });
  assert.equal(r.status, 303);
  assert.equal(r.headers.get('location'), '/');
  const set = r.headers.get('set-cookie');
  assert.match(set, /^garden_session=\d+\.[0-9a-f]{64}; /);
  assert.match(set, /HttpOnly/); assert.match(set, /Secure/); assert.match(set, /SameSite=Lax/);
  const page = await call(env, 'GET', '/', undefined, { jwt: '', headers: { cookie: cookieOf(r) } });
  assert.equal(page.status, 200);
  const garden = await call(env, 'GET', '/api/garden', undefined, { jwt: '', headers: { cookie: cookieOf(r) } });
  assert.equal(garden.status, 200);
  assert.ok(Array.isArray(garden.body.plants));
});

test('a pass works once, and not after a minute', async () => {
  const env = makeEnv();
  const pass = await mintPass(env.DB);
  assert.equal(await usePass(env.DB, pass), true);
  assert.equal(await usePass(env.DB, pass), false);
  const old = await mintPass(env.DB, Date.now() - 61e3);
  assert.equal(await usePass(env.DB, old), false);
  const r = await call(env, 'GET', '/pass?t=' + 'a'.repeat(64), undefined, { jwt: '' });
  assert.equal(r.status, 401);
  assert.equal(r.headers.get('set-cookie'), null);
  for (const bad of ['', 'nope', "x' OR 1=1 --"]) assert.equal(await usePass(env.DB, bad), false);
});

test('passes are stored only as fingerprints, and unused old ones are cleared', async () => {
  const env = makeEnv();
  const stale = await mintPass(env.DB, Date.now() - 120e3);
  const pass = await mintPass(env.DB);
  const rows = env.DB.sqlite.prepare("SELECT key, value FROM settings WHERE key LIKE 'pass:%'").all();
  assert.equal(rows.length, 1);
  assert.ok(!JSON.stringify(rows).includes(pass) && !JSON.stringify(rows).includes(stale));
});

test('without a session the page goes to Roy OS and the API refuses', async () => {
  const env = makeEnv({ ROYOS_URL: ROYOS });
  const page = await call(env, 'GET', '/', undefined, { jwt: '' });
  assert.equal(page.status, 303);
  assert.equal(page.headers.get('location'), `${ROYOS}/go/garden`);
  const api = await call(env, 'GET', '/api/garden', undefined, { jwt: '' });
  assert.equal(api.status, 401);
  assert.equal(api.body, 'Not allowed');
  const write = await call(env, 'POST', '/api/ideas', { name: 'x' }, { jwt: '' });
  assert.equal(write.status, 401);
});

test('forged, tampered or expired cookies get nothing', async () => {
  const env = makeEnv({ ROYOS_URL: ROYOS });
  const r = await call(env, 'GET', `/pass?t=${await mintPass(env.DB)}`, undefined, { jwt: '' });
  const [name, value] = cookieOf(r).split('=');
  const [expires, mac] = value.split('.');
  const bad = [
    `${name}=${Number(expires) + 3600}.${mac}`,
    `${name}=${expires}.${'0'.repeat(64)}`,
    `${name}=${expires}`,
    `${name}=abc.${mac}`,
    `${name}=`
  ];
  for (const cookie of bad) {
    const got = await call(env, 'GET', '/api/garden', undefined, { jwt: '', headers: { cookie } });
    assert.equal(got.status, 401, cookie);
  }
  // Signed with another garden's key: no good here.
  const other = makeEnv();
  const theirs = await call(other, 'GET', `/pass?t=${await mintPass(other.DB)}`, undefined, { jwt: '' });
  assert.equal((await call(env, 'GET', '/api/garden', undefined, { jwt: '', headers: { cookie: cookieOf(theirs) } })).status, 401);
});

test('the export leaves the sign-in key and passes out', async () => {
  const env = makeEnv();
  await call(env, 'GET', '/api/garden'); // makes the guard salt
  await call(env, 'GET', `/pass?t=${await mintPass(env.DB)}`, undefined, { jwt: '' }); // makes the session key
  await mintPass(env.DB);
  assert.equal(env.DB.sqlite.prepare('SELECT COUNT(*) AS n FROM settings').get().n, 3);
  const r = await call(env, 'GET', '/api/export');
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.settings.map(s => s.key), ['guard_salt']);
});

test('Access tokens keep working next to the passes', async () => {
  const r = await call(makeEnv({ ROYOS_URL: ROYOS }), 'GET', '/api/garden');
  assert.equal(r.status, 200);
});
