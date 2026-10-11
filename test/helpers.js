// A Worker env for the tests: real SQLite behind the D1 API, a stand-in for
// the page's files, and a real Access token signed with a key made here.
import { fakeD1 } from './d1fake.js';
import { primeCerts } from '../src/access.js';
import worker from '../src/index.js';

// No network in the tests: the build machine can reach the real cloudflareaccess.com.
globalThis.fetch = async url => { throw new Error(`no network in tests: ${url}`); };

export const TEAM = 'test-team', AUD = 'test-aud', EMAIL = 'gardener@example.test';
const enc = o => Buffer.from(JSON.stringify(o)).toString('base64url');

let keyPair;
async function keys() {
  if (keyPair) return keyPair;
  keyPair = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  const jwk = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  await primeCerts(TEAM, [{ ...jwk, kid: 'k1' }]);
  return keyPair;
}

export async function token(claims = {}, head = {}) {
  const { privateKey } = await keys();
  const h = enc({ alg: 'RS256', kid: 'k1', ...head });
  const p = enc({ iss: `https://${TEAM}.cloudflareaccess.com`, aud: [AUD], email: EMAIL, exp: Math.floor(Date.now() / 1000) + 3600, ...claims });
  const sig = Buffer.from(await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${h}.${p}`))).toString('base64url');
  return `${h}.${p}.${sig}`;
}

export function makeEnv(extra = {}) {
  return {
    DB: fakeD1(),
    ASSETS: { fetch: async req => new Response(`asset ${new URL(req.url).pathname}`, { headers: { 'content-type': 'text/html' } }) },
    ACCESS_TEAM: TEAM, ACCESS_AUD: AUD, ALLOWED_EMAILS: EMAIL,
    ...extra
  };
}

// Calls the Worker as the page would. Returns { status, body }.
export async function call(env, method, path, body, { jwt, headers = {} } = {}) {
  const h = { 'cf-access-jwt-assertion': jwt ?? (await token()), ...headers };
  if (method !== 'GET' && !('content-type' in headers)) h['content-type'] = 'application/json';
  const res = await worker.fetch(new Request(`https://garden.example.test${path}`, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }), env);
  const text = await res.text();
  let parsed = text;
  try { parsed = JSON.parse(text); } catch {}
  return { status: res.status, body: parsed, headers: res.headers };
}

export const SPECIES = { name: 'Lattice Fern', origin: 'Mist pools of the Tide Marsh', form: 'tendril', hue: 175, lore: 'Its fronds knot into scaffolds.', fits: 'A builder.' };
