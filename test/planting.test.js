// Guided planting (13 Oct 2026): branches and people drafted at planting,
// ✦ Frame it with AI, and ✦ Paint its picture.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeEnv, call, SPECIES } from './helpers.js';
import { amsterdamDay, addDays } from '../public/shared/rules.js';
import { CATALOGUE } from '../public/shared/velune.js';
import { cleanDraft, FRAME_LIMIT } from '../src/frame.js';
import { seedPrompt, STYLE } from '../src/pictures.js';
import { finishPicture } from '../src/plantpicture.js';

const today = amsterdamDay();
const find = (state, id) => state.plants.find(p => p.id === id);
const plant = async (env, body) => {
  const r = await call(env, 'POST', '/api/plants', { species: SPECIES, cadence: 14, ...body });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  return r.body;
};

test('planting a person with branches, one pointing to a project', async () => {
  const env = makeEnv();
  const proj = await plant(env, { name: 'Onboarding revamp', type: 'project' });
  const s = await plant(env, { name: 'Lars', type: 'person', branches: [{ title: 'Onboarding revamp', projectId: proj.id }, { title: 'Release notes' }, { title: '' }] });
  const p = find(s, s.id);
  assert.deepEqual(p.work.map(w => [w.title, w.project]), [['Onboarding revamp', proj.id], ['Release notes', null]]);
  assert.deepEqual(find(s, proj.id).people.map(x => x.name), ['Lars']);
  // A branch can't point at a person, and branch titles meet the guard.
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'Mia', type: 'person', species: SPECIES, branches: [{ title: 'x', projectId: s.id }] })).status, 400);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'Mia', type: 'person', species: SPECIES, branches: [{ title: 'Her salary review' }] })).status, 422);
});

test('planting a project with people on it gives each person a linked branch', async () => {
  const env = makeEnv();
  const lars = await plant(env, { name: 'Lars', type: 'person' });
  const s = await plant(env, { name: 'Docs refresh', type: 'project', people: [{ plantId: lars.id, title: 'Docs refresh' }] });
  assert.deepEqual(find(s, lars.id).work.map(w => [w.title, w.project]), [['Docs refresh', s.id]]);
  assert.deepEqual(find(s, s.id).people.map(x => x.name), ['Lars']);
  assert.equal((await call(env, 'POST', '/api/plants', { name: 'X', type: 'project', species: SPECIES, people: [{ plantId: s.id, title: 'x' }] })).status, 400);
});

// ---- Frame it with AI ----
function frameEnv(answer) {
  const asked = [];
  const env = makeEnv({ STUDIO: { draft: async (system, user) => { asked.push({ system, user }); return typeof answer === 'function' ? answer() : answer; } } });
  return { env, asked };
}
const ANSWER = {
  type: 'person', name: 'Lars', cadence: 7, purpose: 'Runs a new starter\'s first week on his own', timing: addDays(today, 150),
  milestones: [{ title: 'Shadows the next starter week', date: addDays(today, 40) }, { title: 'Agreed a €5k budget', date: addDays(today, 60) }],
  branches: [{ title: 'Onboarding revamp', project: 'p1' }, { title: 'Release notes', project: null }],
  next: 'Ask him which part of the first week he would take first',
  species: ['Firstlight Sprig', 'Graftling of Orun', 'Not a species'],
  why: { name: 'A person plant is named after them.', purpose: 'Made concrete enough to check.' },
  recommend: { plant_now: true, reason: 'New to the team: weekly check-ins pay off most now.' },
  questions: ['Should speaking up in planning be its own branch?', 'Does his bonus depend on this?']
};

test('Frame it: the description is guarded before it goes out, and the answer after', async () => {
  const { env, asked } = frameEnv(ANSWER);
  const proj = await plant(env, { name: 'Onboarding revamp', type: 'project' });
  const r = await call(env, 'POST', '/api/frame', { description: 'Lars joined two months ago and is on the onboarding revamp. I want him running onboarding on his own by spring.', type: 'person' });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const d = r.body.draft;
  assert.equal(d.type, 'person');
  assert.equal(d.goal, "Runs a new starter's first week on his own");
  assert.deepEqual(d.milestones.map(m => m.t), ['Shadows the next starter week']); // the € line is dropped
  assert.deepEqual(d.branches, [{ title: 'Onboarding revamp', projectId: proj.id }, { title: 'Release notes', projectId: null }]);
  assert.deepEqual(d.questions, ['Should speaking up in planning be its own branch?']); // "bonus" is caught
  assert.equal(r.body.blanked, 2);
  assert.equal(d.species.length, 3);
  assert.deepEqual(d.species.slice(0, 2).map(i => CATALOGUE[i].name), ['Firstlight Sprig', 'Graftling of Orun']);
  assert.equal(r.body.left, FRAME_LIMIT - 1);
  // What went out: the person angles, the project by ref, never its id.
  assert.match(asked[0].user, /what they should be doing on their own by the date/);
  assert.match(asked[0].user, /"ref":"p1","name":"Onboarding revamp"/);
  assert.ok(!asked[0].user.includes(proj.id));
  // A sensitive description never reaches the AI.
  const bad = await call(env, 'POST', '/api/frame', { description: 'Lars asked about his salary' });
  assert.equal(bad.status, 422);
  assert.equal(asked.length, 1);
});

test('Frame it: answers and the edited draft go back; the day has a limit', async () => {
  const { env, asked } = frameEnv({ ...ANSWER, type: 'project', people: [{ person: 'h1', branch: 'Docs' }, { person: 'h9', branch: 'Ghost' }] });
  const lars = await plant(env, { name: 'Lars', type: 'person' });
  const r = await call(env, 'POST', '/api/frame', {
    description: 'A refresh of the developer docs', answers: [{ q: 'Who is on it?', a: 'Lars' }],
    draft: { name: 'Docs refresh', goal: 'New docs live', target: addDays(today, 60), milestones: [{ t: 'Outline agreed', d: addDays(today, 20) }], people: [{ plantId: lars.id, title: 'Docs' }] }
  });
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.deepEqual(r.body.draft.people, [{ plantId: lars.id, title: 'Docs' }]);
  assert.deepEqual(r.body.draft.branches, []);
  assert.match(asked[0].user, /Q: Who is on it\?\nA: Lars/);
  assert.match(asked[0].user, /"people":\[\{"person":"h1","branch":"Docs"\}\]/);
  assert.match(asked[0].user, /what done looks like/);
  // Answers meet the guard too.
  assert.equal((await call(env, 'POST', '/api/frame', { description: 'Docs', answers: [{ q: 'Budget?', a: 'About €20k' }] })).status, 422);
  await env.DB.prepare("UPDATE settings SET value = ? WHERE key = 'frame_calls'").bind(JSON.stringify({ day: today, n: FRAME_LIMIT })).run();
  assert.equal((await call(env, 'POST', '/api/frame', { description: 'Docs' })).status, 429);
});

test('Frame it: no AI connected, or the AI fails', async () => {
  assert.equal((await call(makeEnv(), 'POST', '/api/frame', { description: 'Docs' })).status, 503);
  const { env } = frameEnv(() => { throw new Error('boom'); });
  const r = await call(env, 'POST', '/api/frame', { description: 'Docs' });
  assert.equal(r.status, 502);
  assert.match(r.body.error, /fill it in yourself/);
  assert.equal((await call(env, 'POST', '/api/frame', {})).status, 400);
});

test('cleanDraft keeps dates sane and refs to real plants only', () => {
  const d = cleanDraft({ type: 'person', timing: '2020-01-01', cadence: 999, milestones: [{ title: 'a', date: 'soon' }], branches: [{ title: 'b', project: 'p7' }], people: [{ person: 'h1' }], species: [] },
    { type: null, today, projects: [{ id: 'x' }], people: [{ id: 'y' }] });
  assert.equal(d.target, addDays(today, 90));
  assert.equal(d.cadence, 7);
  assert.deepEqual(d.milestones, [{ t: 'a', d: d.target }]);
  assert.deepEqual(d.branches, [{ title: 'b', projectId: null }]);
  assert.deepEqual(d.people, []);
  assert.equal(new Set(d.species).size, 3);
});

// ---- Paint its picture ----
function fakeR2() {
  const store = new Map();
  return { store, async put(k, b) { store.set(k, new Uint8Array(b)); }, async head(k) { return store.has(k) ? { size: store.get(k).length } : null; }, async get(k) { return store.has(k) ? { body: store.get(k) } : null; } };
}

test('Paint its picture: once, and only fixed words go to the painter', async () => {
  const runs = [];
  const env = makeEnv({ MEDIA: fakeR2(), STUDIO: {}, PLANT_PICTURE: { create: async o => { runs.push(o); return { id: 'r1' }; } } });
  const s = await plant(env, { name: 'Coaching Ana', type: 'person', goal: 'Leads the platform sync on her own' });
  let r = await call(env, 'POST', `/api/plants/${s.id}/picture`, {});
  assert.equal(r.status, 200);
  assert.equal(find(r.body, s.id).pictureStatus, 'painting');
  assert.deepEqual(Object.keys(runs[0].params), ['plantId', 'stamp']);
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/picture`, {})).status, 409);
  const key = `plants/${s.id}/${runs[0].params.stamp}.jpg`;
  await env.MEDIA.put(key, new Uint8Array([1, 2, 3]));
  await finishPicture(env.DB, s.id, key);
  const g = (await call(env, 'GET', '/api/garden')).body;
  assert.equal(find(g, s.id).picture, '/media/' + key);
  assert.equal(find(g, s.id).pictureStatus, null);
  const img = await call(env, 'GET', '/media/' + key);
  assert.equal(img.status, 200);
  assert.equal(img.headers.get('content-type'), 'image/jpeg');
  assert.equal((await call(env, 'POST', `/api/plants/${s.id}/picture`, {})).status, 409);
  assert.equal((await call(makeEnv(), 'POST', `/api/plants/${s.id}/picture`, {})).status, 404);
});

test('the seed prompt: catalogue words and the style, nothing typed', () => {
  const sp = CATALOGUE.find(c => c.name === 'Ember Moss');
  const p = seedPrompt(sp);
  assert.ok(p.includes('Ember Moss') && p.includes('Ember Hollows') && p.includes(STYLE));
  assert.ok(!p.includes(sp.lore) && !p.includes(sp.fits));
  const made = seedPrompt({ name: 'Ana\'s secret plan', origin: 'typed', form: 'star', hue: 300, lore: 'typed lore', fits: 'typed' });
  assert.ok(!/Ana|secret|typed/.test(made));
  assert.match(made, /Petal Steppe/);
  assert.ok(made.length < 4000);
});
