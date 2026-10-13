// The JSON API. Every write is checked by the sensitive-info guard again here,
// whatever the page did, and answers with the whole fresh garden.
import { TYPES, amsterdamDay, addDays, isDate, cadenceName } from '../public/shared/rules.js';
import { check, say } from '../public/shared/guard.js';
import { cleanSpecies } from '../public/shared/velune.js';
import { startLandscape } from './landscape.js';
import { startPicture } from './plantpicture.js';
import { frameDraft } from './frame.js';
import { buildState, keepOut, allText, TEXT_FIELDS, now, newId } from './store.js';

export const ROUTES = [
  ['GET', '/api/garden', garden],
  ['POST', '/api/plants', plantNew],
  ['PATCH', '/api/plants/:id', plantEdit],
  ['POST', '/api/plants/:id/checkin', checkin],
  ['POST', '/api/plants/:id/park', park],
  ['POST', '/api/plants/:id/revive', revive],
  ['POST', '/api/plants/:id/done', done],
  ['POST', '/api/plants/:id/picture', pictureStart],
  ['POST', '/api/frame', frame],
  ['POST', '/api/plants/:id/branches', branchNew],
  ['POST', '/api/branches/:id/updates', branchUpdate],
  ['POST', '/api/branches/:id/done', branchDone],
  ['POST', '/api/branches/:id/link', branchLink],
  ['POST', '/api/follow-ups/:id/clear', followClear],
  ['POST', '/api/follow-ups/:id/unclear', followUnclear],
  ['POST', '/api/ideas', ideaNew],
  ['DELETE', '/api/ideas/:id', ideaDiscard],
  ['POST', '/api/milestones/:id/toggle', milestoneToggle],
  ['GET', '/api/guard', guardList],
  ['POST', '/api/guard/words', guardWordAdd],
  ['DELETE', '/api/guard/words/:hash', guardWordRemove],
  ['POST', '/api/reword', reword],
  ['POST', '/api/landscape', landscapeStart],
  ['GET', '/api/export', exportAll]
];

class HttpError extends Error { constructor(status, body) { super(body.error); this.status = status; this.body = body; } }
const bad = (error, extra = {}) => { throw new HttpError(400, { error, ...extra }); };
const notFound = what => { throw new HttpError(404, { error: `${what} not found` }); };
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });

export async function api(request, env) {
  const url = new URL(request.url);
  const method = request.method;
  if (method !== 'GET') {
    // Writes only from this page: JSON, same origin. A form or a link on another site can't make one.
    if (!(request.headers.get('content-type') || '').startsWith('application/json')) return json({ error: 'JSON only' }, 415);
    const origin = request.headers.get('origin');
    if (origin && origin !== url.origin) return json({ error: 'wrong origin' }, 403);
  }
  for (const [m, pattern, handler] of ROUTES) {
    const params = match(pattern, url.pathname);
    if (!params || m !== method) continue;
    try {
      const body = method === 'GET' ? {} : await readBody(request);
      const ctx = { env, db: env.DB, params, body, today: amsterdamDay(), at: now() };
      const out = await handler(ctx);
      return out instanceof Response ? out : json(out);
    } catch (e) {
      if (e instanceof HttpError) return json(e.body, e.status);
      console.error('api', method, url.pathname, e && e.stack || e);
      return json({ error: 'Something went wrong; nothing was saved.' }, 500);
    }
  }
  return json({ error: 'not found' }, 404);
}

function match(pattern, path) {
  const a = pattern.split('/'), b = path.split('/');
  if (a.length !== b.length) return null;
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) { if (!b[i]) return null; params[a[i].slice(1)] = decodeURIComponent(b[i]); }
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

async function readBody(request) {
  const text = await request.text();
  if (text.length > 64000) bad('too long');
  if (!text) return {};
  try { const v = JSON.parse(text); return v && typeof v === 'object' && !Array.isArray(v) ? v : bad('expected an object'); } catch (e) { if (e instanceof HttpError) throw e; bad('not JSON'); }
}

// ---- reading input ----
const str = (v, max, label, required = false) => {
  const s = typeof v === 'string' ? v.trim() : v == null ? '' : bad(`${label} must be text`);
  if (required && !s) bad(`${label} is required`, { field: label });
  if (s.length > max) bad(`${label} is too long (at most ${max} characters)`, { field: label });
  return s;
};
const date = (v, label, fallback) => (v ? (isDate(v) ? v : bad(`${label} is not a date`)) : fallback);
const cadence = v => { const n = Number(v); return Number.isInteger(n) && n >= 1 && n <= 365 ? n : bad('Cadence must be 1 to 365 days'); };
const type = v => (TYPES[v] ? v : bad('Type must be person, project or initiative'));

// The guard, again on the server. fields = { label: text }.
async function guard(db, fields) {
  const ko = await keepOut(db);
  for (const [field, text] of Object.entries(fields)) {
    const hits = await check(text, ko);
    if (hits.length) throw new HttpError(422, { error: 'guard', field, hits: hits.map(say) });
  }
}

async function plantRow(db, id, places) {
  const p = await db.prepare('SELECT * FROM plants WHERE id = ?').bind(id).first();
  if (!p || p.place === 'discarded') notFound('Plant');
  if (places && !places.includes(p.place)) throw new HttpError(409, { error: `Not possible while it is ${p.place === 'shed' ? 'parked' : p.place === 'garden' ? 'in the garden' : 'an idea'}` });
  return p;
}
const entry = (ctx, plantId, kind, { going = null, note = null, on = ctx.today, id = newId() } = {}) =>
  ctx.db.prepare('INSERT INTO entries (id, plant_id, kind, happened_on, going_on, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, plantId, kind, on, going, note || null, ctx.at);
// Any attention counts: the cadence clock restarts.
const cared = (ctx, plantId) => ctx.db.prepare('UPDATE plants SET last_cared_at = ?, updated_at = ? WHERE id = ?').bind(ctx.today, ctx.at, plantId);
const touched = (ctx, plantId) => ctx.db.prepare('UPDATE plants SET updated_at = ? WHERE id = ?').bind(ctx.at, plantId);
const fresh = ctx => buildState(ctx.env, { today: ctx.today });

// ---- handlers ----
function garden(ctx) { return fresh(ctx); }

// Paints the empty Velune landscape behind the Garden page: an OpenAI still, then a Gemini loop.
async function landscapeStart(ctx) {
  const refused = await startLandscape(ctx.env);
  if (refused) throw new HttpError(refused.status, refused.body);
  return fresh(ctx);
}

// ✦ Paint its picture: the seed, once (src/plantpicture.js).
async function pictureStart(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['greenhouse', 'shed', 'garden']);
  const refused = await startPicture(ctx.env, p);
  if (refused) throw new HttpError(refused.status, refused.body);
  return fresh(ctx);
}

// ✦ Frame it with AI (src/frame.js): a draft for the planting form, nothing saved.
function frame(ctx) { return frameDraft(ctx, { guard, bad, HttpError, str }); }

function readMilestones(list, today) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 30) bad('Milestones must be a short list');
  return list.map(m => ({ id: typeof m?.id === 'string' ? m.id : null, t: str(m?.t, 120, 'Milestone'), d: date(m?.d, 'Milestone date', today) })).filter(m => m.t);
}
const guardPlant = (db, v, ms) => guard(db, {
  Name: v.name, Purpose: v.goal, 'First next step': v.next,
  ...Object.fromEntries(ms.map((m, i) => [`Milestone ${i + 1}`, m.t]))
});

// Branches drafted at planting. A person's own: [{title, projectId?}]. For a
// project or initiative, the people on it: [{plantId, title}], each a new
// branch on that person's plant pointing to the new one.
function readBranches(list, field) {
  if (list == null) return [];
  if (!Array.isArray(list) || list.length > 8) bad('Branches must be a short list');
  return list.map(b => ({ title: str(b?.title, 120, 'Branch'), projectId: typeof b?.projectId === 'string' ? b.projectId : null, plantId: typeof b?.plantId === 'string' ? b.plantId : null }))
    .filter(b => b.title && (field !== 'people' || b.plantId));
}
async function personRow(db, id) {
  const p = await db.prepare("SELECT id, type, place FROM plants WHERE id = ? AND place IN ('greenhouse', 'shed')").bind(id).first();
  if (!p || p.type !== 'person') bad('People on it must be people in the greenhouse or the shed');
  return p;
}

// Seasons left the app on 13 Oct 2026 (Roy: "drop the season thing"): every
// plant has a purpose (goal), a timing (target date) and milestones. Old
// seasons stay in D1, unshown; new people get none.
async function plantNew(ctx) {
  const b = ctx.body, db = ctx.db, today = ctx.today;
  const v = {
    name: str(b.name, 80, 'Name', true), type: type(b.type), cadence: cadence(b.cadence ?? TYPES[b.type]?.cadence),
    goal: str(b.goal, 300, 'Purpose'), next: str(b.next, 300, 'First next step')
  };
  const species = cleanSpecies(b.species) || bad('Pick a species');
  const ms = readMilestones(b.milestones, today);
  const perennial = v.type === 'person';
  const own = perennial ? readBranches(b.branches, 'branches') : [];
  const people = perennial ? [] : readBranches(b.people, 'people');
  await guardPlant(db, v, ms);
  await guard(db, { Species: [species.name, species.origin, species.lore, species.fits].join(' · ') });
  await guard(db, Object.fromEntries([...own, ...people].map((x, i) => [`Branch ${i + 1}`, x.title])));
  for (const x of own) if (x.projectId) await projectRow(db, x.projectId);
  for (const x of people) await personRow(db, x.plantId);
  let id = newId(), created = ctx.at;
  if (b.ideaId) {
    const idea = await plantRow(db, b.ideaId, ['idea']);
    id = idea.id; created = idea.created_at;
  }
  const target = date(b.target, 'Timing', addDays(today, 90));
  const stmts = [db.prepare(`INSERT INTO plants (id, name, type, place, cadence_days, goal, start_date, target_date, species, last_cared_at, created_at, planted_at, updated_at)
      VALUES (?1, ?2, ?3, 'greenhouse', ?4, ?5, ?6, ?7, ?8, ?6, ?9, ?6, ?10)
      ON CONFLICT (id) DO UPDATE SET name = ?2, type = ?3, place = 'greenhouse', cadence_days = ?4, goal = ?5, start_date = ?6, target_date = ?7,
        species = ?8, last_cared_at = ?6, planted_at = ?6, updated_at = ?10`)
    .bind(id, v.name, v.type, v.cadence, v.goal || null, today, target, JSON.stringify(species), created, ctx.at)];
  for (const m of ms) stmts.push(db.prepare('INSERT INTO milestones (id, plant_id, title, due_on) VALUES (?, ?, ?, ?)').bind(newId(), id, m.t, m.d));
  stmts.push(entry(ctx, id, 'plant', { note: species.name }));
  if (v.next) stmts.push(db.prepare('INSERT INTO follow_ups (id, plant_id, text, added_on) VALUES (?, ?, ?, ?)').bind(newId(), id, v.next, today));
  for (const x of own) stmts.push(db.prepare('INSERT INTO branches (id, plant_id, title, started_on, project_id) VALUES (?, ?, ?, ?, ?)').bind(newId(), id, x.title, today, x.projectId));
  for (const x of people) stmts.push(db.prepare('INSERT INTO branches (id, plant_id, title, started_on, project_id) VALUES (?, ?, ?, ?, ?)').bind(newId(), x.plantId, x.title, today, id));
  await db.batch(stmts);
  return { ...(await fresh(ctx)), id };
}

async function plantEdit(ctx) {
  const b = ctx.body, db = ctx.db, today = ctx.today;
  const p = await plantRow(db, ctx.params.id, ['greenhouse', 'shed']);
  const v = { name: str(b.name, 80, 'Name', true), type: type(b.type), cadence: cadence(b.cadence), goal: str(b.goal, 300, 'Purpose'), next: '' };
  const ms = readMilestones(b.milestones, today);
  await guardPlant(db, v, ms);
  const old = JSON.parse(p.species || 'null');
  const species = b.species ? cleanSpecies(b.species) || bad('That species is not from Velune') : old;
  if (species !== old) await guard(db, { Species: [species.name, species.origin, species.lore, species.fits].join(' · ') });
  const stmts = [db.prepare(`UPDATE plants SET name = ?, type = ?, cadence_days = ?, goal = ?, start_date = ?, target_date = ?, species = ?,
      updated_at = ? WHERE id = ?`)
    .bind(v.name, v.type, v.cadence, v.goal || null, p.start_date || p.planted_at || today,
      date(b.target, 'Timing', p.target_date || addDays(today, 90)), JSON.stringify(species), ctx.at, p.id)];
  if (p.cadence_days !== v.cadence) stmts.push(entry(ctx, p.id, 'cadence', { note: `${cadenceName(p.cadence_days)} → ${cadenceName(v.cadence).toLowerCase()}` }));
  if (old && species.name !== old.name) stmts.push(entry(ctx, p.id, 'species', { note: `${old.name} → ${species.name}` }));
  // Milestones by id: kept ones are updated, new ones added, missing ones marked removed (never erased).
  const { results: have } = await db.prepare('SELECT id FROM milestones WHERE plant_id = ? AND removed = 0').bind(p.id).all();
  const keep = new Set();
  for (const m of ms) {
    if (m.id && have.some(h => h.id === m.id)) { keep.add(m.id); stmts.push(db.prepare('UPDATE milestones SET title = ?, due_on = ? WHERE id = ?').bind(m.t, m.d, m.id)); }
    else stmts.push(db.prepare('INSERT INTO milestones (id, plant_id, title, due_on) VALUES (?, ?, ?, ?)').bind(newId(), p.id, m.t, m.d));
  }
  for (const h of have) if (!keep.has(h.id)) stmts.push(db.prepare('UPDATE milestones SET removed = 1 WHERE id = ?').bind(h.id));
  await db.batch(stmts);
  return fresh(ctx);
}

async function checkin(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['greenhouse']);
  const going = str(ctx.body.going, 500, 'How are things going?'), follow = str(ctx.body.follow, 300, 'Next steps');
  await guard(ctx.db, { 'How are things going?': going, 'Next steps': follow });
  const id = newId();
  const stmts = [entry(ctx, p.id, 'checkin', { id, going: going || null, note: follow }), cared(ctx, p.id)];
  if (follow) stmts.push(ctx.db.prepare('INSERT INTO follow_ups (id, plant_id, entry_id, text, added_on) VALUES (?, ?, ?, ?, ?)').bind(newId(), p.id, id, follow, ctx.today));
  await ctx.db.batch(stmts);
  return fresh(ctx);
}

async function park(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['greenhouse']);
  const note = str(ctx.body.note, 300, 'Why park it?');
  await guard(ctx.db, { 'Why park it?': note });
  await ctx.db.batch([ctx.db.prepare("UPDATE plants SET place = 'shed', updated_at = ? WHERE id = ?").bind(ctx.at, p.id), entry(ctx, p.id, 'park', { note })]);
  return fresh(ctx);
}

async function revive(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['shed']);
  const note = str(ctx.body.note, 300, 'Note');
  await guard(ctx.db, { Note: note });
  // Revived plants start fresh: the cadence clock runs from today.
  await ctx.db.batch([ctx.db.prepare("UPDATE plants SET place = 'greenhouse', last_cared_at = ?, updated_at = ? WHERE id = ?").bind(ctx.today, ctx.at, p.id), entry(ctx, p.id, 'revive', { note })]);
  return fresh(ctx);
}

async function done(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['greenhouse', 'shed']);
  const note = str(ctx.body.note, 300, 'What came of it?') || (p.type === 'person' ? 'Moved on' : p.goal || 'Done');
  await guard(ctx.db, { 'What came of it?': note });
  await ctx.db.batch([ctx.db.prepare("UPDATE plants SET place = 'garden', done_on = ?, done_note = ?, updated_at = ? WHERE id = ?").bind(ctx.today, note, ctx.at, p.id), entry(ctx, p.id, 'done', { note })]);
  return fresh(ctx);
}


async function milestoneToggle(ctx) {
  const m = await ctx.db.prepare('SELECT * FROM milestones WHERE id = ? AND removed = 0').bind(ctx.params.id).first();
  if (!m) notFound('Milestone');
  await plantRow(ctx.db, m.plant_id, ['greenhouse']);
  if (m.done_on) await ctx.db.batch([ctx.db.prepare('UPDATE milestones SET done_on = NULL WHERE id = ?').bind(m.id), touched(ctx, m.plant_id)]);
  else await ctx.db.batch([ctx.db.prepare('UPDATE milestones SET done_on = ? WHERE id = ?').bind(ctx.today, m.id), entry(ctx, m.plant_id, 'milestone', { note: m.title }), cared(ctx, m.plant_id)]);
  return fresh(ctx);
}

async function branchNew(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['greenhouse']);
  if (p.type !== 'person') bad('Branches are for people');
  const title = str(ctx.body.title, 120, 'Branch', true);
  const project = ctx.body.projectId ? await projectRow(ctx.db, ctx.body.projectId) : null;
  await guard(ctx.db, { Branch: title });
  await ctx.db.batch([ctx.db.prepare('INSERT INTO branches (id, plant_id, title, started_on, project_id) VALUES (?, ?, ?, ?, ?)').bind(newId(), p.id, title, ctx.today, project?.id ?? null), touched(ctx, p.id)]);
  return fresh(ctx);
}

// The project or initiative a branch may point to: growing or parked.
async function projectRow(db, id) {
  const p = await plantRow(db, String(id), ['greenhouse', 'shed']);
  if (p.type === 'person') bad('A branch can point to a project or an initiative, not a person');
  return p;
}

// Point a branch at a project, or (projectId null) back to a plain branch.
async function branchLink(ctx) {
  const b = await branchRow(ctx.db, ctx.params.id);
  const project = ctx.body.projectId ? await projectRow(ctx.db, ctx.body.projectId) : null;
  await ctx.db.batch([ctx.db.prepare('UPDATE branches SET project_id = ? WHERE id = ?').bind(project?.id ?? null, b.id), touched(ctx, b.plant_id)]);
  return fresh(ctx);
}

async function branchRow(db, id) {
  const b = await db.prepare('SELECT * FROM branches WHERE id = ?').bind(id).first();
  if (!b) notFound('Branch');
  if (b.done_on) throw new HttpError(409, { error: 'That branch is done' });
  await plantRow(db, b.plant_id, ['greenhouse']);
  return b;
}

async function branchUpdate(ctx) {
  const b = await branchRow(ctx.db, ctx.params.id);
  const text = str(ctx.body.text, 2000, 'Update', true);
  await guard(ctx.db, { Update: text });
  await ctx.db.batch([ctx.db.prepare('INSERT INTO branch_updates (id, branch_id, happened_on, text, created_at) VALUES (?, ?, ?, ?, ?)').bind(newId(), b.id, ctx.today, text, ctx.at), cared(ctx, b.plant_id)]);
  return fresh(ctx);
}

async function branchDone(ctx) {
  const b = await branchRow(ctx.db, ctx.params.id);
  await ctx.db.batch([ctx.db.prepare('UPDATE branches SET done_on = ? WHERE id = ?').bind(ctx.today, b.id), touched(ctx, b.plant_id)]);
  return fresh(ctx);
}

async function followRow(db, id) {
  const f = await db.prepare('SELECT * FROM follow_ups WHERE id = ?').bind(id).first();
  if (!f) notFound('Follow-up');
  await plantRow(db, f.plant_id, ['greenhouse']);
  return f;
}
async function followClear(ctx) {
  const f = await followRow(ctx.db, ctx.params.id);
  if (!f.cleared_on) await ctx.db.batch([ctx.db.prepare('UPDATE follow_ups SET cleared_on = ? WHERE id = ?').bind(ctx.today, f.id), cared(ctx, f.plant_id)]);
  return fresh(ctx);
}
async function followUnclear(ctx) {
  const f = await followRow(ctx.db, ctx.params.id);
  await ctx.db.batch([ctx.db.prepare('UPDATE follow_ups SET cleared_on = NULL WHERE id = ?').bind(f.id), touched(ctx, f.plant_id)]);
  return fresh(ctx);
}

async function ideaNew(ctx) {
  const name = str(ctx.body.name, 80, 'Name', true), t = type(ctx.body.type), note = str(ctx.body.note, 300, 'Idea note');
  await guard(ctx.db, { Name: name, 'Idea note': note });
  const id = newId();
  await ctx.db.batch([
    ctx.db.prepare("INSERT INTO plants (id, name, type, place, idea_note, cadence_days, created_at, updated_at) VALUES (?, ?, ?, 'idea', ?, ?, ?, ?)").bind(id, name, t, note || null, TYPES[t].cadence, ctx.at, ctx.at),
    entry(ctx, id, 'idea', { note })
  ]);
  return { ...(await fresh(ctx)), id };
}

// Discarding an idea hides it; the row stays (nothing is ever deleted).
async function ideaDiscard(ctx) {
  const p = await plantRow(ctx.db, ctx.params.id, ['idea']);
  await ctx.db.prepare("UPDATE plants SET place = 'discarded', updated_at = ? WHERE id = ?").bind(ctx.at, p.id).run();
  return fresh(ctx);
}

// ---- the guard's own page: keep-out words and stored text that needs rewording ----
async function guardList(ctx) {
  const ko = await keepOut(ctx.db);
  const names = new Map((await ctx.db.prepare('SELECT id, name, place FROM plants').all()).results.map(p => [p.id, p]));
  const rewording = [];
  for (const t of await allText(ctx.db)) {
    const hits = await check(t.text, ko);
    if (!hits.length) continue;
    const p = names.get(t.plant) || {};
    rewording.push({ ref: t.ref, plant: t.plant, plantName: p.name || '', place: p.place || '', label: TEXT_FIELDS[t.field].label, required: !!TEXT_FIELDS[t.field].required, text: t.text, hits: hits.map(say) });
  }
  return { keepOut: ko.words, rewording };
}

// The page sends only the fingerprint and a masked hint: the word itself never leaves the browser.
async function guardWordAdd(ctx) {
  const hash = String(ctx.body.hash || ''), hint = String(ctx.body.hint || '');
  if (!/^[0-9a-f]{64}$/.test(hash)) bad('Expected a fingerprint');
  if (!/^(\S?•{2,}\S?|•{1,2})$/u.test(hint) || hint.length > 40) bad('Expected a masked hint');
  await ctx.db.prepare('INSERT OR IGNORE INTO guard_words (hash, hint, added_at) VALUES (?, ?, ?)').bind(hash, hint, ctx.at).run();
  return fresh(ctx);
}
async function guardWordRemove(ctx) {
  await ctx.db.prepare('DELETE FROM guard_words WHERE hash = ?').bind(ctx.params.hash).run();
  return fresh(ctx);
}

// Fix one stored line the guard now catches. Only the fields in TEXT_FIELDS.
async function reword(ctx) {
  const m = /^([a-z_]+\.[a-z_]+)\.([\w-]+)$/.exec(String(ctx.body.ref || ''));
  const f = m && TEXT_FIELDS[m[1]];
  if (!f) bad('Unknown field');
  const [table, column] = m[1].split('.');
  const text = str(ctx.body.text, f.max, f.label, f.required);
  await guard(ctx.db, { [f.label]: text });
  const edited = ['entries', 'branch_updates'].includes(table) ? ', edited_at = ?2' : '';
  const r = await ctx.db.prepare(`UPDATE ${table} SET ${column} = ?1${edited} WHERE id = ?3`).bind(text || null, ctx.at, m[2]).run();
  if (!r.meta.changes) notFound('Text');
  return guardList(ctx);
}

// Everything, as JSON, for keeping a copy yourself.
async function exportAll(ctx) {
  const tables = ['plants', 'seasons', 'milestones', 'branches', 'branch_updates', 'entries', 'follow_ups', 'weeks', 'garden_versions', 'guard_words', 'settings'];
  // Of settings only the guard salt (needed to read guard_words back); the sign-in key and passes stay out.
  const results = await ctx.db.batch(tables.map(t => ctx.db.prepare(t === 'settings' ? "SELECT * FROM settings WHERE key = 'guard_salt'" : `SELECT * FROM ${t}`)));
  const out = { exported_at: ctx.at, ...Object.fromEntries(tables.map((t, i) => [t, results[i].results])) };
  return json(out, 200, { 'content-disposition': `attachment; filename="work-garden-${ctx.today}.json"` });
}

