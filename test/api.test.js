import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, SPECIES } from './helpers.js';
import { fingerprint, normalizeWord, mask } from '../public/shared/guard.js';
import { amsterdamDay } from '../public/shared/rules.js';

const today = amsterdamDay();
const find = (state, id) => state.plants.find(p => p.id === id);
async function plantPerson(env, extra = {}) {
  const r = await call(env, 'POST', '/api/plants', { name: 'Lars Meijer', type: 'person', cadence: 7, species: SPECIES, seasonGoal: 'Settled in and shipping on his own', intent: 'New to the team', next: 'Pick a starter ticket', ...extra });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
}

test('plant a person: season, follow-up from the first step, planted entry', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  const p = find(s, s.id);
  assert.equal(p.place, 'greenhouse');
  assert.equal(p.planted, today);
  assert.equal(p.season.n, 1);
  assert.equal(p.season.goal, 'Settled in and shipping on his own');
  assert.deepEqual(p.todos.map(t => t.text), ['Pick a starter ticket']);
  assert.equal(p.log[0].kind, 'plant');
  assert.equal(p.species.name, 'Lattice Fern');
  assert.equal(p.history.at(-1)[0], 0);
  assert.equal(s.pictures, false);
  assert.ok(s.salt.length >= 16);
});

test('plant a project with milestones and a target', async () => {
  const env = makeEnv();
  const r = await call(env, 'POST', '/api/plants', { name: 'API deprecation policy', type: 'project', cadence: 14, species: SPECIES, goal: 'A written policy with dates', target: '2027-01-31', milestones: [{ t: 'Draft out', d: '2026-11-15' }, { t: '', d: '2026-12-01' }] });
  assert.equal(r.status, 200);
  const p = find(r.body, r.body.id);
  assert.equal(p.target, '2027-01-31');
  assert.deepEqual(p.milestones.map(m => m.t), ['Draft out']);
  assert.equal(p.season, undefined);
});

test('the guard refuses sensitive text on every write, server side', async () => {
  const env = makeEnv();
  const r = await call(env, 'POST', '/api/plants', { name: 'Tooling renewal', type: 'project', species: SPECIES, intent: 'Offer is €48k higher' });
  assert.equal(r.status, 422);
  assert.equal(r.body.error, 'guard');
  assert.equal(r.body.field, 'Why it matters now');
  assert.match(r.body.hits[0], /amount of money/);
  const s = await plantPerson(env);
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/checkin`, { going: 'Talked about his salary' })).status, 422);
  assert.equal((await call(env, 'POST', '/api/ideas', { name: 'Vendor', type: 'project', note: 'mail sales@vendor.example' })).status, 422);
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/park`, { note: 'he is on sick leave' })).status, 422);
  // Nothing was stored by the refused writes.
  const g = (await call(env, 'GET', '/api/garden')).body;
  assert.equal(g.plants.length, 1);
  assert.equal(find(g, s.id).place, 'greenhouse');
});

test('keep-out words: only the fingerprint reaches the server, and it is enforced', async () => {
  const env = makeEnv();
  const { salt } = (await call(env, 'GET', '/api/garden')).body;
  const hash = await fingerprint(salt, normalizeWord('Acme Corp'));
  const r = await call(env, 'POST', '/api/guard/words', { hash, hint: mask('Acme Corp') });
  assert.equal(r.status, 200);
  assert.deepEqual(r.body.keepOut, [{ hash, hint: 'A•••••••p' }]);
  assert.equal((await call(env, 'POST', '/api/guard/words', { hash, hint: 'Acme Corp' })).status, 400, 'plain words are refused as hints');
  const blocked = await call(env, 'POST', '/api/ideas', { name: 'Talks with acme corp', type: 'project' });
  assert.equal(blocked.status, 422);
  assert.match(blocked.body.hits[0], /keep-out/);
  await call(env, 'DELETE', `/api/guard/words/${hash}`);
  assert.equal((await call(env, 'POST', '/api/ideas', { name: 'Talks with acme corp', type: 'project' })).status, 200);
});

test('stored text the guard now catches is listed and can be reworded', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  await call(env, 'POST', `/api/plants/${s.id}/checkin`, { going: 'Long chat about Zephyr', follow: 'Ask about Zephyr' });
  const hash = await fingerprint(s.salt, 'zephyr');
  await call(env, 'POST', '/api/guard/words', { hash, hint: mask('Zephyr') });
  const g = (await call(env, 'GET', '/api/guard')).body;
  assert.equal(g.rewording.length, 3); // going, the follow-up on the entry, and the follow-up itself
  const item = g.rewording.find(x => x.label === 'How it was going');
  assert.equal(item.plantName, 'Lars Meijer');
  assert.equal((await call(env, 'POST', '/api/reword', { ref: item.ref, text: 'Long chat about a supplier' })).status, 200);
  assert.equal((await call(env, 'POST', '/api/reword', { ref: item.ref, text: 'zephyr again' })).status, 422);
  assert.equal((await call(env, 'POST', '/api/reword', { ref: `settings.value.guard_salt`, text: 'x' })).status, 400);
  assert.equal((await call(env, 'POST', '/api/reword', { ref: `plants.name.${s.id}; DROP TABLE plants`, text: 'x' })).status, 400);
  const left = (await call(env, 'GET', '/api/guard')).body.rewording;
  assert.equal(left.length, 2);
});

test('check in: with lines, without, and follow-ups ticked off', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  let g = (await call(env, 'POST', `/api/plants/${s.id}/checkin`, {})).body;
  let p = find(g, s.id);
  assert.equal(p.log[0].kind, 'checkin');
  assert.equal(p.log[0].going, '');
  g = (await call(env, 'POST', `/api/plants/${s.id}/checkin`, { going: 'Settling in well', follow: 'Introduce him to ops' })).body;
  p = find(g, s.id);
  assert.equal(p.log[0].going, 'Settling in well');
  assert.equal(p.log[0].follow, 'Introduce him to ops');
  assert.equal(p.todos.length, 2);
  const todo = p.todos.find(t => t.text === 'Introduce him to ops');
  g = (await call(env, 'POST', `/api/follow-ups/${todo.id}/clear`, {})).body;
  p = find(g, s.id);
  assert.equal(p.todos.find(t => t.id === todo.id).closed, today);
  assert.ok(p.log.some(e => e.kind === 'todo' && e.todo === todo.id));
  g = (await call(env, 'POST', `/api/follow-ups/${todo.id}/unclear`, {})).body;
  assert.equal(find(g, s.id).todos.find(t => t.id === todo.id).closed, null);
});

test('the special need is gone from the page and the API, and what was typed stays in D1', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  await env.DB.prepare("UPDATE plants SET need_name = 'A binding', need_check = 'Got unblocked quickly' WHERE id = ?").bind(s.id).run();
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/need`, {})).status, 404);
  const g = (await call(env, 'PATCH', `/api/plants/${s.id}`, { name: 'Lars Meijer', type: 'person', cadence: 14, need: { name: 'Something else' } })).body;
  assert.equal(find(g, s.id).need, undefined);
  const row = await env.DB.prepare('SELECT need_name, need_check FROM plants WHERE id = ?').bind(s.id).first();
  assert.deepEqual({ ...row }, { need_name: 'A binding', need_check: 'Got unblocked quickly' });
});

test('branches and updates', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  let g = (await call(env, 'POST', `/api/plants/${s.id}/branches`, { title: 'Notifications service' })).body;
  const b = find(g, s.id).work[0];
  g = (await call(env, 'POST', `/api/branches/${b.id}/updates`, { text: 'First PR merged' })).body;
  assert.equal(find(g, s.id).work[0].updates[0].text, 'First PR merged');
  g = (await call(env, 'POST', `/api/branches/${b.id}/done`, {})).body;
  assert.equal(find(g, s.id).work[0].ended, today);
  assert.equal((await call(env, 'POST', `/api/branches/${b.id}/updates`, { text: 'late' })).status, 409);
});

test('seasons: goal, milestones, closing moves open milestones on', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  const season = find(s, s.id).season;
  let g = (await call(env, 'PATCH', `/api/seasons/${season.id}`, { goal: 'Owns the notifications service' })).body;
  assert.equal(find(g, s.id).season.goal, 'Owns the notifications service');
  await call(env, 'POST', `/api/seasons/${season.id}/milestones`, { t: 'Ships one feature', d: season.end });
  g = (await call(env, 'POST', `/api/seasons/${season.id}/milestones`, { t: 'Joins on-call', d: season.end })).body;
  const [m1] = find(g, s.id).season.milestones;
  g = (await call(env, 'POST', `/api/milestones/${m1.id}/toggle`, {})).body;
  assert.equal(find(g, s.id).season.milestones.find(m => m.id === m1.id).done, true);
  g = (await call(env, 'POST', `/api/plants/${s.id}/season`, { review: 'Settled in quickly.', goal: 'Leads a small project', end: '2027-03-31' })).body;
  const p = find(g, s.id);
  assert.equal(p.season.n, 2);
  assert.equal(p.season.goal, 'Leads a small project');
  assert.deepEqual(p.season.milestones.map(m => m.t), ['Joins on-call']);
  assert.deepEqual(p.pastSeasons.map(x => [x.n, x.review]), [[1, 'Settled in quickly.']]);
  assert.equal(p.log[0].kind, 'season');
});

test('park, revive, done; done is final', async () => {
  const env = makeEnv();
  const s = await plantPerson(env);
  let g = (await call(env, 'POST', `/api/plants/${s.id}/park`, { note: 'Waiting on the reorg' })).body;
  assert.equal(find(g, s.id).place, 'shed');
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/checkin`, {})).status, 409);
  g = (await call(env, 'POST', `/api/plants/${s.id}/revive`, {})).body;
  assert.equal(find(g, s.id).place, 'greenhouse');
  g = (await call(env, 'POST', `/api/plants/${s.id}/done`, { note: 'Moved on to lead Payments' })).body;
  assert.deepEqual(find(g, s.id).done, { date: today, note: 'Moved on to lead Payments' });
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/revive`, {})).status, 409);
  assert.equal((await call(env, 'PATCH', `/api/plants/${s.id}`, { name: 'x', type: 'person', cadence: 7 })).status, 409);
});

test('ideas: jot, plant in place, discard hides without deleting', async () => {
  const env = makeEnv();
  let r = await call(env, 'POST', '/api/ideas', { name: 'Tech radar refresh', type: 'initiative', note: 'Retire some old tools' });
  const idea = find(r.body, r.body.id);
  assert.equal(idea.place, 'idea');
  assert.equal(idea.note, 'Retire some old tools');
  r = await call(env, 'POST', '/api/plants', { ideaId: idea.id, name: 'Tech radar refresh', type: 'initiative', cadence: 30, species: SPECIES });
  const p = find(r.body, idea.id);
  assert.equal(p.place, 'greenhouse');
  assert.equal(p.created, idea.created);
  assert.deepEqual(p.log.map(e => e.kind).sort(), ['idea', 'plant']);
  r = await call(env, 'POST', '/api/ideas', { name: 'Incident reviews', type: 'initiative' });
  const second = r.body.id;
  r = await call(env, 'DELETE', `/api/ideas/${second}`);
  assert.equal(find(r.body, second), undefined);
  assert.equal(await env.DB.prepare('SELECT place FROM plants WHERE id = ?').bind(second).first('place'), 'discarded');
});

test('edit: cadence and species changes are logged, milestones kept by id', async () => {
  const env = makeEnv();
  let r = await call(env, 'POST', '/api/plants', { name: 'Migration', type: 'project', cadence: 14, species: SPECIES, target: '2027-01-31', milestones: [{ t: 'Rehearsal', d: '2026-11-01' }, { t: 'Cutover', d: '2026-12-08' }] });
  const id = r.body.id;
  const [rehearsal, cutover] = find(r.body, id).milestones;
  await call(env, 'POST', `/api/milestones/${rehearsal.id}/toggle`, {});
  r = await call(env, 'PATCH', `/api/plants/${id}`, { name: 'Data platform migration', type: 'project', cadence: 7, target: '2027-02-28', species: { ...SPECIES, name: 'Tidecaller Kelp', hue: 205 },
    milestones: [{ id: rehearsal.id, t: 'Cutover rehearsal', d: '2026-11-01' }, { t: 'Old warehouse off', d: '2027-02-28' }] });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const p = find(r.body, id);
  assert.equal(p.name, 'Data platform migration');
  assert.deepEqual(p.milestones.map(m => [m.t, m.done]), [['Cutover rehearsal', true], ['Old warehouse off', false]]);
  assert.deepEqual(p.log.filter(e => ['cadence', 'species'].includes(e.kind)).map(e => e.note).sort(), ['Fortnightly → weekly', 'Lattice Fern → Tidecaller Kelp']);
  assert.equal(await env.DB.prepare('SELECT removed FROM milestones WHERE id = ?').bind(cutover.id).first('removed'), 1);
});

test('refuses bad input', async () => {
  const env = makeEnv();
  assert.equal((await call(env, 'POST', '/api/plants', { name: '', type: 'person', species: SPECIES })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'x', type: 'boss', species: SPECIES })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'x', type: 'person', species: { ...SPECIES, form: 'tree' } })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'x', type: 'project', species: SPECIES, target: '2026-13-01' })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'x'.repeat(81), type: 'person', species: SPECIES })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'x', type: 'person', cadence: 0, species: SPECIES })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants/nope/checkin', {})).status, 404);
  assert.equal((await call(env, 'GET', '/api/nothing')).status, 404);
});

test('export has every table', async () => {
  const env = makeEnv();
  await plantPerson(env);
  const r = await call(env, 'GET', '/api/export');
  assert.equal(r.status, 200);
  assert.match(r.headers.get('content-disposition'), /attachment/);
  assert.equal(r.body.plants.length, 1);
  for (const t of ['seasons', 'entries', 'follow_ups', 'guard_words', 'settings']) assert.ok(Array.isArray(r.body[t]), t);
});
