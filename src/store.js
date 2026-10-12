// Reading the garden out of D1, in the shape the page works with
// (see public/shared/rules.js), and the small helpers the writes share.
import { landscapeState } from './landscape.js';
import { amsterdamDay, mondayOf, nextMonday, health } from '../public/shared/rules.js';

export const now = () => new Date().toISOString();
export const newId = () => crypto.randomUUID();

// The guard's salt: made once, kept in settings. Keep-out words are stored as
// fingerprints made with it, so the list means nothing without the salt and
// the salt means nothing without the list.
export async function salt(db) {
  const have = await db.prepare("SELECT value FROM settings WHERE key = 'guard_salt'").first('value');
  if (have) return have;
  const fresh = [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
  await db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES ('guard_salt', ?)").bind(fresh).run();
  return db.prepare("SELECT value FROM settings WHERE key = 'guard_salt'").first('value');
}
export async function keepOut(db) {
  const [s, { results }] = await Promise.all([salt(db), db.prepare('SELECT hash, hint FROM guard_words ORDER BY added_at').all()]);
  return { salt: s, hashes: new Set(results.map(r => r.hash)), words: results };
}

const group = (rows, key) => {
  const m = new Map();
  for (const r of rows) { if (!m.has(r[key])) m.set(r[key], []); m.get(r[key]).push(r); }
  return k => m.get(k) || [];
};
const ms = m => ({ id: m.id, t: m.title, d: m.due_on, done: !!m.done_on });

// Everything the page needs, in one go. Discarded ideas stay in D1 but are not shown.
export async function buildState(env, { today = amsterdamDay() } = {}) {
  const db = env.DB;
  const ko = await keepOut(db);
  const q = sql => db.prepare(sql);
  const [plants, seasons, milestones, branches, updates, entries, follow, weeks] = (await db.batch([
    q("SELECT * FROM plants WHERE place != 'discarded' ORDER BY created_at"),
    q('SELECT * FROM seasons ORDER BY n'),
    q('SELECT * FROM milestones WHERE removed = 0 ORDER BY due_on, rowid'),
    q('SELECT * FROM branches ORDER BY started_on, rowid'),
    q('SELECT * FROM branch_updates ORDER BY happened_on DESC, created_at DESC'),
    q('SELECT * FROM entries ORDER BY happened_on DESC, created_at DESC'),
    q('SELECT * FROM follow_ups ORDER BY added_on, rowid'),
    q('SELECT plant_id, week, stage, health, image_key, seen_at FROM weeks ORDER BY week')
  ])).map(r => r.results);
  const by = {
    seasons: group(seasons, 'plant_id'), milestones: group(milestones, 'plant_id'), branches: group(branches, 'plant_id'),
    updates: group(updates, 'branch_id'), entries: group(entries, 'plant_id'), follow: group(follow, 'plant_id'), weeks: group(weeks, 'plant_id')
  };
  return {
    today, lastMonday: mondayOf(today), nextMonday: nextMonday(today),
    pictures: false, // OpenAI pictures of the plants arrive in build step 3
    landscape: await landscapeState(db), // the empty Velune landscape behind the Garden page
    royos: env.ROYOS_URL || null, // the header's link back to Roy OS
    salt: ko.salt, keepOut: ko.words,
    plants: plants.map(row => shapePlant(row, by, today))
  };
}

function shapePlant(row, by, today) {
  const p = { id: row.id, name: row.name, type: row.type, place: row.place, created: row.created_at.slice(0, 10), note: row.idea_note || '' };
  if (row.place === 'idea') return p;
  Object.assign(p, {
    cadence: row.cadence_days, planted: row.planted_at, start: row.start_date, target: row.target_date,
    goal: row.goal || '', intent: row.intent || '',
    species: JSON.parse(row.species || 'null') || { name: 'Unnamed seedling', origin: 'Somewhere on Velune', form: 'tendril', hue: 150, lore: '', fits: '' },
    need: { name: row.need_name || '', meaning: row.need_meaning || '', check: row.need_check || '' }
  });
  const mss = by.milestones(row.id);
  if (row.type === 'person') {
    const ss = by.seasons(row.id), cur = ss.filter(s => !s.closed_on).at(-1) || ss.at(-1);
    if (cur) p.season = { id: cur.id, n: cur.n, goal: cur.goal || '', start: cur.start_date, end: cur.end_date, milestones: mss.filter(m => m.season_id === cur.id).map(ms) };
    p.pastSeasons = ss.filter(s => s !== cur).map(s => ({ n: s.n, goal: s.goal || '', start: s.start_date, end: s.end_date, review: s.review || '' }));
  } else {
    p.milestones = mss.filter(m => !m.season_id).map(ms);
  }
  p.work = by.branches(row.id).map(b => ({ id: b.id, title: b.title, since: b.started_on, ended: b.done_on || null, updates: by.updates(b.id).map(u => ({ id: u.id, date: u.happened_on, text: u.text })) }));
  const fu = by.follow(row.id);
  p.todos = fu.map(f => ({ id: f.id, text: f.text, added: f.added_on, closed: f.cleared_on || null }));
  // A ticked follow-up shows in the log on the day it was ticked.
  const ticked = fu.filter(f => f.cleared_on).map(f => ({ id: 'todo-' + f.id, kind: 'todo', date: f.cleared_on, note: f.text, todo: f.id }));
  p.log = [...by.entries(row.id).map(e => ({ id: e.id, kind: e.kind, date: e.happened_on, going: e.going_on || '', follow: e.kind === 'checkin' ? e.note || '' : '', note: e.kind === 'checkin' ? '' : e.note || '' })), ...ticked]
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  const wk = by.weeks(row.id);
  p.history = wk.length ? wk.map(w => [w.stage, w.health]) : [[row.stage, row.place === 'greenhouse' ? health(p, today) : row.place === 'shed' ? 'dormant' : 'thriving']];
  p.unseen = !!(wk.at(-1) && wk.at(-1).image_key && !wk.at(-1).seen_at);
  if (row.place === 'garden') p.done = { date: row.done_on, note: row.done_note || '' };
  return p;
}

// Every stored text field, so the guard can look at all of it again with
// today's rules and keep-out words. ref = table.column.id; POST /api/reword fixes one.
export const TEXT_FIELDS = {
  'plants.name': { label: 'Name', required: true, max: 80 },
  'plants.idea_note': { label: 'Idea note', max: 300 },
  'plants.intent': { label: 'Why it matters now', max: 500 },
  'plants.goal': { label: 'Goal', max: 300 },
  'plants.need_name': { label: 'Special need', max: 80 },
  'plants.need_meaning': { label: 'What the need means at work', max: 200 },
  'plants.need_check': { label: 'The need check', max: 200 },
  'plants.done_note': { label: 'What came of it', max: 300 },
  'seasons.goal': { label: 'Season goal', max: 300 },
  'seasons.review': { label: 'Season review', max: 2000 },
  'milestones.title': { label: 'Milestone', required: true, max: 120 },
  'branches.title': { label: 'Branch', required: true, max: 120 },
  'branch_updates.text': { label: 'Branch update', required: true, max: 500 },
  'entries.going_on': { label: 'How it was going', max: 500 },
  'entries.note': { label: 'Log note', max: 500 },
  'follow_ups.text': { label: 'Follow-up', required: true, max: 300 }
};
const PLANT_OF = { plants: 'id', seasons: 'plant_id', milestones: 'plant_id', branches: 'plant_id', entries: 'plant_id', follow_ups: 'plant_id' };

export async function allText(db) {
  const out = [];
  const tables = [...new Set(Object.keys(TEXT_FIELDS).map(k => k.split('.')[0]))];
  const stmts = tables.map(t => {
    const cols = Object.keys(TEXT_FIELDS).filter(k => k.startsWith(t + '.')).map(k => k.split('.')[1]);
    if (t === 'branch_updates') return db.prepare(`SELECT u.id, b.plant_id AS plant, ${cols.map(c => 'u.' + c).join(', ')} FROM branch_updates u JOIN branches b ON b.id = u.branch_id`);
    return db.prepare(`SELECT id, ${PLANT_OF[t]} AS plant, ${cols.join(', ')} FROM ${t}`);
  });
  const results = await db.batch(stmts);
  tables.forEach((t, i) => {
    for (const r of results[i].results) {
      for (const [k, v] of Object.entries(r)) {
        if (k === 'id' || k === 'plant' || !v) continue;
        out.push({ ref: `${t}.${k}.${r.id}`, plant: r.plant, field: `${t}.${k}`, text: v });
      }
    }
  });
  return out;
}
