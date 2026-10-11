import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scan, check, fingerprint, mask, normalizeWord, say } from '../public/shared/guard.js';
import { CATALOGUE } from '../public/shared/velune.js';

test('catches what could hurt the business', () => {
  const caught = {
    'an amount of money': ['Renewal came in at €48k', 'about 120k EUR', '$2.5m deal'],
    'a price or rate': ['the price went up 12%', '7% discount offered'],
    'contract terms': ['the termination clause', 'notice period is long'],
    'pay details': ['talked about his salary', 'bonus this year'],
    'health details': ['she is on sick leave', 'burnout risk'],
    'an HR or legal case': ['he is on a PIP', 'a grievance came in'],
    'a password or key': ['password: hunter2', 'key sk-abcdefghijklmnop'],
    'contact or bank details': ['mail me at someone@example.com', 'call +31 6 1234 5678', 'NL91 ABNA 0417 1643 00']
  };
  for (const [kind, lines] of Object.entries(caught)) for (const l of lines) assert.ok(scan(l).some(h => h.kind === kind), `${kind}: ${l}`);
});

test('lets ordinary work notes through', () => {
  for (const l of ['Rehearsal went well; two dashboards still need owners', 'Renewal offer came in higher than planned', 'Q4 priorities agreed', 'Pages went down a lot', 'Moved on to lead Payments', 'Ship 3 features by spring']) {
    assert.deepEqual(scan(l), [], l);
  }
});

test('every species in the catalogue passes the guard', () => {
  for (const s of CATALOGUE) assert.deepEqual(scan([s.name, s.origin, s.lore, s.fits].join(' ')), [], s.name);
});

test('keep-out words match by fingerprint, one to three words, any case', async () => {
  const salt = 'pepper';
  const hashes = new Set([await fingerprint(salt, normalizeWord('Acme Corp')), await fingerprint(salt, normalizeWord('Zephyr'))]);
  assert.equal((await check('Call with ACME corp tomorrow', { salt, hashes })).length, 1);
  assert.equal((await check('zephyr is late', { salt, hashes }))[0].found, 'zephyr');
  assert.deepEqual(await check('Acme is fine alone', { salt, hashes }), []);
  assert.deepEqual(await check('Call with Acme Corp', { salt: 'other', hashes }), []);
});

test('masks and messages', () => {
  assert.equal(mask('Acme Corp'), 'A•••••••p');
  assert.equal(mask('ab'), '••');
  assert.match(say(scan('€5k')[0]), /looks like an amount of money/);
});
