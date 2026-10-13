// ✦ Frame it with AI (Roy, 13 Oct 2026: "have AI help/guide me to start a
// plant, similar like how a quest is build - to frame it"). Roy says in a few
// lines who or what he wants to grow; the chat model drafts every field of the
// planting form with a one-line reason, a recommendation, up to three questions
// and three species from the catalogue. Nothing is saved here: the page shows
// the draft and Roy plants it (POST /api/plants) once it is right.
//
// The guard runs both ways: what Roy wrote is checked before it goes to the
// model, and every line of the answer is checked again; a line the guard
// catches is left blank. Roy OS drafts it with its OpenAI key (Studio.draft);
// without that binding this Worker calls OpenAI with its own OPENAI_API_KEY.

import { TYPES, LIMIT, addDays, isDate } from '../public/shared/rules.js';
import { check } from '../public/shared/guard.js';
import { CATALOGUE, BIOMES } from '../public/shared/velune.js';
import { keepOut } from './store.js';

export const FRAME_LIMIT = 40; // drafts a day, as the quest builder's cap
const CHAT_MODEL = 'gpt-6-astra';

// What the model may ask about depends on the kind of plant (Roy: "the few
// additional questions, should be tied to wether its a project or person").
export const ANGLES = {
  person: ['what they should be doing on their own by the date', 'which pieces of their work become branches', 'how involved Roy stays along the way'],
  project: ['what done looks like', 'the milestones on the way', 'who is on it (people Roy already has as plants get a branch pointing to it)'],
  initiative: ['what has changed once it has landed', 'the first visible steps', 'who is involved (people Roy already has as plants get a branch pointing to it)']
};

export const SYSTEM = [
  'You help Roy, a manager, start a plant in his Work Garden: a private app where each work stream he wants to keep alive is a plant he checks in on.',
  'A plant is a person (someone he looks after, often a report), a project, or an initiative. It is not a project management tool: no tasks, no assigning, no roles, no deadlines to chase.',
  'Every plant has: a short name; a check-in cadence in days (7 weekly, 14 fortnightly, 30 monthly); a purpose (what Roy wants to see grow, concrete enough to tell later whether it happened, one sentence); a timing (the date that purpose is for); up to 4 milestones (short steps toward the purpose, each with a date); and a first next step Roy can do this week.',
  'A person also has branches: the pieces of work they are on, each a short title; a branch can point to one of Roy\'s project plants (give its ref). A project or initiative has people on it: people Roy already has as plants (give their ref) with the branch title they would get.',
  'Species: pick 3 from the catalogue, your best fit first, by name exactly as written.',
  'For every field give a reason of at most 15 words. Recommend whether to plant it now or keep it as an idea for later, in one sentence; there are 12 beds and a full greenhouse means less attention for each plant.',
  'Then ask at most 3 short questions, only about what the description leaves open, from the angles given for this kind of plant. Ask none if it is clear.',
  'Never write amounts, prices, budgets, pay, contract terms, health, HR or personal matters, or names of customers or suppliers, even if the description hints at them. Plain, warm, short English; no jargon.',
  'Answer with JSON only, in this shape: {"type":"person|project|initiative","name":"","cadence":7,"purpose":"","timing":"YYYY-MM-DD","milestones":[{"title":"","date":"YYYY-MM-DD"}],"branches":[{"title":"","project":"p1 or null"}],"people":[{"person":"h1","branch":""}],"next":"","species":["","",""],"why":{"name":"","type":"","purpose":"","timing":"","milestones":"","branches":"","next":"","species":""},"recommend":{"plant_now":true,"reason":""},"questions":[""]}'
].join('\n');

// ---- reading what the page sends ----
function readInput(b, str, bad) {
  const description = str(b.description, 1500, 'What do you want to grow?', true);
  const type = TYPES[b.type] ? b.type : null;
  if (b.answers != null && (!Array.isArray(b.answers) || b.answers.length > 3)) bad('At most three answers');
  const answers = (b.answers || []).map((x, i) => ({ q: str(x?.q, 300, `Question ${i + 1}`), a: str(x?.a, 300, `Answer ${i + 1}`) })).filter(x => x.q && x.a);
  const d = b.draft && typeof b.draft === 'object' ? b.draft : null;
  const list = (v, n) => (Array.isArray(v) ? v.slice(0, n) : []);
  const draft = d && {
    name: str(d.name, 80, 'Name'), purpose: str(d.goal, 300, 'Purpose'), timing: isDate(d.target) ? d.target : '', next: str(d.next, 300, 'First next step'),
    milestones: list(d.milestones, 4).map(m => ({ title: str(m?.t, 120, 'Milestone'), date: isDate(m?.d) ? m.d : '' })).filter(m => m.title),
    branches: list(d.branches, 5).map(x => ({ title: str(x?.title, 120, 'Branch'), projectId: typeof x?.projectId === 'string' ? x.projectId : null })).filter(x => x.title),
    people: list(d.people, 6).map(x => ({ title: str(x?.title, 120, 'Branch'), plantId: typeof x?.plantId === 'string' ? x.plantId : null })).filter(x => x.title && x.plantId)
  };
  return { description, type, answers, draft };
}
const draftTexts = d => (d ? { Name: d.name, Purpose: d.purpose, 'First next step': d.next, ...Object.fromEntries([...d.milestones.map(m => m.title), ...d.branches.map(x => x.title), ...d.people.map(x => x.title)].map((t, i) => [`Draft line ${i + 1}`, t])) } : {});

// ---- the messages ----
export function userMessage({ description, type, answers, draft }, { today, beds, projects, people }) {
  const ref = (list, pre) => list.map((x, i) => ({ ref: `${pre}${i + 1}`, name: x.name }));
  const kinds = type ? [type] : Object.keys(TYPES);
  const lines = [
    `Today: ${today}. Beds in use: ${beds} of ${LIMIT}.`,
    `Kind: ${type || 'not given: decide from the description'}.`,
    `Question angles: ${kinds.map(k => `${k}: ${ANGLES[k].join('; ')}`).join(' | ')}.`,
    `Roy's project and initiative plants (for a person's branches): ${JSON.stringify(ref(projects, 'p'))}.`,
    type === 'person' ? '' : `Roy's people plants (for the people on a project or initiative): ${JSON.stringify(ref(people, 'h'))}.`,
    `Species catalogue (name · biome · fits): ${CATALOGUE.map(s => `${s.name} · ${BIOMES[s.form]} · ${s.fits}`).join(' | ')}.`,
    '',
    `Roy's description:\n${description}`
  ];
  if (answers.length) lines.push('', 'His answers to your questions:', ...answers.map(x => `Q: ${x.q}\nA: ${x.a}`));
  if (draft) {
    const pid = id => { const i = projects.findIndex(p => p.id === id); return i < 0 ? null : `p${i + 1}`; };
    const hid = id => { const i = people.findIndex(p => p.id === id); return i < 0 ? null : `h${i + 1}`; };
    lines.push('', 'The draft as it stands now (he may have edited it). Keep what he changed, fold in his answers, and ask only what is still open:',
      JSON.stringify({ name: draft.name, purpose: draft.purpose, timing: draft.timing, milestones: draft.milestones, branches: draft.branches.map(x => ({ title: x.title, project: pid(x.projectId) })), people: draft.people.map(x => ({ person: hid(x.plantId), branch: x.title })).filter(x => x.person), next: draft.next }));
  }
  return lines.filter(l => l !== '').join('\n');
}

// ---- cleaning the answer ----
const text = (v, n) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, n) : '');
export function cleanDraft(raw, { type, today, projects, people }) {
  const r = raw && typeof raw === 'object' ? raw : {};
  const kind = type || (TYPES[r.type] ? r.type : 'project');
  const cad = Number(r.cadence);
  const timing = isDate(r.timing) && r.timing > today && r.timing <= addDays(today, 730) ? r.timing : addDays(today, 90);
  const msDate = d => (isDate(d) && d >= today && d <= addDays(today, 730) ? d : timing);
  const byRef = (list, pre) => ref => { const m = new RegExp(`^${pre}(\\d+)$`).exec(String(ref || '').trim()); return m ? list[Number(m[1]) - 1]?.id || null : null; };
  const project = byRef(projects, 'p'), person = byRef(people, 'h');
  const names = [];
  for (const n of Array.isArray(r.species) ? r.species : []) {
    const i = CATALOGUE.findIndex(s => s.name.toLowerCase() === text(n, 60).toLowerCase());
    if (i >= 0 && !names.includes(i)) names.push(i);
  }
  for (let i = 0; names.length < 3 && i < CATALOGUE.length; i++) {
    const j = (Math.floor(Math.random() * CATALOGUE.length) + i) % CATALOGUE.length;
    if (!names.includes(j)) names.push(j);
  }
  const why = r.why && typeof r.why === 'object' ? r.why : {};
  const rec = r.recommend && typeof r.recommend === 'object' ? r.recommend : {};
  return {
    type: kind,
    name: text(r.name, 80),
    cadence: Number.isInteger(cad) && cad >= 1 && cad <= 365 ? cad : TYPES[kind].cadence,
    goal: text(r.purpose, 300),
    target: timing,
    milestones: (Array.isArray(r.milestones) ? r.milestones : []).slice(0, 4).map(m => ({ t: text(m?.title, 120), d: msDate(m?.date) })).filter(m => m.t),
    branches: kind !== 'person' ? [] : (Array.isArray(r.branches) ? r.branches : []).slice(0, 5).map(b => ({ title: text(b?.title, 120), projectId: project(b?.project) })).filter(b => b.title),
    people: kind === 'person' ? [] : (Array.isArray(r.people) ? r.people : []).slice(0, 6).map(x => ({ plantId: person(x?.person), title: text(x?.branch, 120) || text(r.name, 80) }))
      .filter((x, i, all) => x.plantId && x.title && all.findIndex(y => y.plantId === x.plantId) === i),
    next: text(r.next, 300),
    species: names.slice(0, 3),
    why: Object.fromEntries(['name', 'type', 'purpose', 'timing', 'milestones', 'branches', 'next', 'species'].map(k => [k, text(why[k], 160)])),
    recommend: { now: rec.plant_now !== false, text: text(rec.reason, 240) },
    questions: (Array.isArray(r.questions) ? r.questions : []).map(q => text(q, 200)).filter(Boolean).slice(0, 3)
  };
}

// Every line of the answer through the guard; a caught line is blanked (or dropped from a list).
export async function guardDraft(d, ko) {
  let blanked = 0;
  const ok = async t => { if (!t) return true; const fine = !(await check(t, ko)).length; if (!fine) blanked++; return fine; };
  for (const k of ['name', 'goal', 'next']) if (!(await ok(d[k]))) d[k] = '';
  for (const k of Object.keys(d.why)) if (!(await ok(d.why[k]))) d.why[k] = '';
  if (!(await ok(d.recommend.text))) d.recommend.text = '';
  const keep = async (list, field) => { const out = []; for (const x of list) if (await ok(x[field])) out.push(x); return out; };
  d.milestones = await keep(d.milestones, 't');
  d.branches = await keep(d.branches, 'title');
  d.people = await keep(d.people, 'title');
  const qs = [];
  for (const q of d.questions) if (await ok(q)) qs.push(q);
  d.questions = qs;
  return blanked;
}

async function chat(env, system, user) {
  if (env.STUDIO) return env.STUDIO.draft(system, user);
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { authorization: `Bearer ${env.OPENAI_API_KEY}`, 'content-type': 'application/json' },
    body: JSON.stringify({ model: env.CHAT_MODEL || CHAT_MODEL, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], response_format: { type: 'json_object' }, max_completion_tokens: 2000 })
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${(data.error && data.error.message) || 'chat failed'}`);
  return JSON.parse(data.choices?.[0]?.message?.content || '{}');
}

// POST /api/frame {description, type?, answers?, draft?} → {draft, blanked, left}
export async function frameDraft(ctx, { guard, bad, HttpError, str }) {
  const { env, db, today } = ctx;
  if (!env.STUDIO && !env.OPENAI_API_KEY) throw new HttpError(503, { error: 'No AI to frame it with: connect Roy OS (STUDIO) or add OPENAI_API_KEY.' });
  const input = readInput(ctx.body, str, bad);
  await guard(db, { 'What do you want to grow?': input.description, ...Object.fromEntries(input.answers.flatMap((x, i) => [[`Question ${i + 1}`, x.q], [`Answer ${i + 1}`, x.a]])), ...draftTexts(input.draft) });
  // A day's drafts are counted before the call, so a failing call can't loop.
  const raw = await db.prepare("SELECT value FROM settings WHERE key = 'frame_calls'").first('value');
  let used = { day: today, n: 0 };
  try { const u = JSON.parse(raw || 'null'); if (u && u.day === today) used = u; } catch {}
  if (used.n >= FRAME_LIMIT) throw new HttpError(429, { error: `That's ${FRAME_LIMIT} drafts today. Fill it in yourself, or try again tomorrow.` });
  used.n++;
  await db.prepare("INSERT INTO settings (key, value) VALUES ('frame_calls', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(used)).run();
  const { results } = await db.prepare("SELECT id, name, type, place FROM plants WHERE place IN ('greenhouse', 'shed') ORDER BY created_at").all();
  const projects = results.filter(p => p.type !== 'person'), people = results.filter(p => p.type === 'person');
  const beds = results.filter(p => p.place === 'greenhouse').length;
  let answer;
  try {
    answer = await chat(env, SYSTEM, userMessage(input, { today, beds, projects, people }));
  } catch (e) {
    throw new HttpError(502, { error: `The AI could not frame it this time (${String(e && e.message || e).slice(0, 120)}). Try again, or fill it in yourself.` });
  }
  const draft = cleanDraft(answer, { type: input.type, today, projects, people });
  const blanked = await guardDraft(draft, await keepOut(db));
  return { draft, blanked, left: FRAME_LIMIT - used.n };
}
