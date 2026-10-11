// The Work Garden page: Greenhouse, Garden, Manage, the plant page and the
// planting form. All data comes from the Worker (GET /api/garden) and every
// change goes back through it; each write answers with the fresh garden.
import { LIMIT, TYPES, CADENCES, cadenceName, isPerennial, daysBetween, addDays, placeOf, lastCare, ratio as ratioOn, health as healthOn, RANK } from './shared/rules.js';
import { check, say, fingerprint, normalizeWord, mask, words, MAX_WORDS } from './shared/guard.js';
import { CATALOGUE } from './shared/velune.js';
import { esc, alienSVG, packet, terra, VEIL, pic, gardenScene } from './draw.js';

// ---------- state from the Worker ----------
let state = null, plants = [], TODAY = '', keepOutSet = {};
function setState(s) {
  state = s; plants = s.plants; TODAY = s.today;
  keepOutSet = { salt: s.salt, hashes: new Set(s.keepOut.map(w => w.hash)) };
}
const byId = id => plants.find(x => x.id === id);
const health = p => healthOn(p, TODAY);
const ratio = p => ratioOn(p, TODAY);

let busy = false;
// Sends a change; on success the fresh garden replaces the old one. Returns the answer, or null.
async function send(method, path, body = {}) {
  if (busy) return null;
  busy = true;
  try {
    const res = await fetch(path, { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error === 'guard' ? `Not saved: ${data.hits[0]}` : res.status === 401 || res.status === 403 ? 'Signed out: reload the page' : `Not saved: ${data.error || 'something went wrong'}`);
      return null;
    }
    if (data.plants) setState(data);
    return data;
  } catch {
    toast('Not saved: no connection, or signed out. Reload the page.');
    return null;
  } finally { busy = false; }
}

// ---------- small helpers ----------
const day = s => new Date(s + 'T12:00:00Z');
const fmt = (s, opts = { weekday: 'short', day: 'numeric', month: 'short' }) => day(s).toLocaleDateString('en-GB', { ...opts, timeZone: 'UTC' });
const short = s => (s ? fmt(s, { day: 'numeric', month: 'short', ...(s.slice(0, 4) !== TODAY.slice(0, 4) ? { year: 'numeric' } : {}) }) : '');
function isoWeek(s) {
  const t = day(s); t.setUTCDate(t.getUTCDate() + 3 - ((t.getUTCDay() + 6) % 7));
  const first = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - first) / 86400000 - 3 + ((first.getUTCDay() + 6) % 7)) / 7);
}
const lc = s => s.charAt(0).toLowerCase() + s.slice(1);
const STATE_LABEL = { thriving: 'Thriving', fine: 'Fine', thirsty: 'Thirsty', wilting: 'Wilting', dormant: 'Dormant', done: 'In the garden' };
function ago(p) {
  const lw = lastCare(p);
  if (!lw) return 'Not checked in yet';
  const d = daysBetween(lw, TODAY);
  return d === 0 ? 'Checked in today' : d === 1 ? 'Checked in yesterday' : `Checked in ${d} days ago`;
}
const lastNeedMet = p => (p.log.find(e => e.kind === 'need') || {}).date;
const stage = p => p.history.at(-1)[0]; // internal only: drives the picture, never shown
const weeksGrowing = p => Math.max(1, Math.round(daysBetween(p.planted, placeOf(p) === 'garden' ? p.done.date : TODAY) / 7));
// The picture is Monday's stage; between Mondays it takes on today's health.
const lookNow = p => (placeOf(p) === 'greenhouse' ? health(p) : p.history.at(-1)[1]);
const thumb = p => (placeOf(p) === 'idea' ? packet(p) : pic(p, stage(p), placeOf(p) === 'shed' ? 'dormant' : placeOf(p) === 'garden' ? p.history.at(-1)[1] : health(p)));
const activeWork = p => (p.work || []).filter(w => !w.ended);
const firstName = p => p.name.split(' ')[0];

// ---------- the guard, as you type and before saving (the Worker checks again) ----------
const guardFields = form => [...form.querySelectorAll('input[type="text"], input[type="search"]:not(#m-search), input:not([type]), textarea')].filter(el => !el.closest('.no-guard'));
async function guardField(el) {
  const hits = await check(el.value, keepOutSet);
  let msg = el.parentElement.querySelector(`.guard-msg[data-for="${el.id}"]`);
  if (!hits.length) { el.removeAttribute('aria-invalid'); if (msg) msg.remove(); return hits; }
  el.setAttribute('aria-invalid', 'true');
  if (!msg) { msg = document.createElement('div'); msg.className = 'guard-msg'; msg.dataset.for = el.id; msg.setAttribute('role', 'status'); el.insertAdjacentElement('afterend', msg); }
  msg.innerHTML = hits.map(h => `<span>🛡 ${esc(say(h))}</span>`).join('');
  return hits;
}
async function guardForm(form) {
  const fields = guardFields(form), bad = [];
  for (const el of fields) if ((await guardField(el)).length) bad.push(el);
  if (bad.length) { bad[0].focus(); toast('Not saved: reword the part marked with 🛡'); return false; }
  return true;
}

// ---------- views ----------
const $view = document.getElementById('view');
let filter = 'all';
let ghGroup = 'need';  // greenhouse grouping: 'need' | 'cadence'
let route = { name: 'greenhouse' };
let panel = null;      // plant page: 'park' | 'revive' | 'done' | 'season' | null
let np = null;         // new plant: { ideaId, draft: { fields, need, speciesIndex } }
let editDraft = null;  // edit page: typed values between re-renders
const UI = {};         // per plant: lookBack, logOpen, loreOpen
const ui = id => (UI[id] ||= {});

const hashOf = r => '#/' + r.name + (r.id ? '/' + encodeURIComponent(r.id) : '');
function parseHash() {
  const [name, id] = location.hash.replace(/^#\/?/, '').split('/');
  if (['plant', 'edit'].includes(name) && id && byId(decodeURIComponent(id))) return { name, id: decodeURIComponent(id) };
  if (['garden', 'manage'].includes(name)) return { name };
  return { name: 'greenhouse' };
}
function go(r) {
  route = r;
  if (r.name === 'manage') loadRewording();
  const h = r.name === 'new' ? '#/new' : hashOf(r);
  if (location.hash !== h) history.pushState(null, '', h);
  render(); window.scrollTo({ top: 0 });
}
window.addEventListener('popstate', () => { panel = null; np = null; editDraft = null; route = parseHash(); if (route.name === 'manage') loadRewording(); render(); });
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => (t.hidden = true), 2600);
}

function navHTML() {
  const count = pl => count[pl] ?? plants.filter(p => placeOf(p) === pl).length;
  const navOf = pl => (pl === 'shed' || pl === 'idea' ? 'manage' : pl);
  const cur = route.name === 'plant' || route.name === 'edit' ? navOf(placeOf(byId(route.id))) : route.name === 'new' ? (np && np.ideaId ? 'manage' : 'greenhouse') : route.name;
  count.manage = plants.length;
  return [['greenhouse', 'Greenhouse'], ['garden', 'Garden'], ['manage', 'Manage']].map(([k, l]) => `<button type="button" data-go="${k}" ${cur === k ? 'aria-current="page"' : ''}>${l}<small>${count(k)}</small></button>`).join('');
}

const isDry = p => ['thirsty', 'wilting'].includes(health(p));
function ghGroups(shown) {
  if (ghGroup === 'need') return [['need', 'Due a check-in', shown.filter(isDry)], ['fine', 'Doing fine', shown.filter(p => !isDry(p))]].filter(g => g[2].length);
  const days = [...new Set(shown.map(p => p.cadence))].sort((a, b) => a - b);
  return days.map(d => { const list = shown.filter(p => p.cadence === d), dry = list.filter(isDry).length; return ['cad', cadenceName(d), list, dry ? `${dry} due a check-in` : '']; });
}
function greenhouseView() {
  const active = plants.filter(p => placeOf(p) === 'greenhouse').sort((a, b) => RANK[health(a)] - RANK[health(b)] || ratio(b) - ratio(a));
  const shown = active.filter(p => filter === 'all' || p.type === filter);
  const need = active.filter(isDry).length;
  const ideas = plants.filter(p => placeOf(p) === 'idea').length;
  const meter = Array.from({ length: LIMIT }, (_, i) => `<i class="${i < active.length ? 'on' : ''}"></i>`).join('');
  const lines = [
    state.pictures && (n => (n ? `<b>${n} new picture${n > 1 ? 's' : ''} to reveal.</b>` : ''))(active.filter(p => p.unseen).length),
    state.pictures && `Next pictures arrive ${fmt(state.nextMonday, { weekday: 'long', day: 'numeric', month: 'short' })} at 06:00.`,
    ideas && `<button type="button" class="linkish" data-go="manage" data-mfilter="all">${ideas} idea${ideas > 1 ? 's' : ''} waiting</button>`
  ].filter(Boolean).join(' ');
  return `
    <div class="summary">
      <div><h1>${!active.length ? 'Nothing growing yet' : need ? `<em>${need} plant${need > 1 ? 's' : ''}</em> ${need > 1 ? 'are' : 'is'} due a check-in` : 'Everything is checked in'}</h1>
      <p>${lines || (active.length ? '' : 'Plant a person, a project or an initiative to start. Ideas you are not ready for go in Manage.')}</p></div>
      <div class="beds"><span class="meter">${meter}</span>${active.length} of ${LIMIT} beds<button class="btn primary small" data-go="new" type="button">+ Plant</button></div>
    </div>
    ${active.length ? `<div class="ghbar">
      <div class="filters" role="group" aria-label="Show">
        ${[['all', 'All'], ['person', 'People'], ['project', 'Projects'], ['initiative', 'Initiatives']].map(([k, l]) => `<button class="chip" type="button" data-filter="${k}" aria-pressed="${filter === k}">${l}</button>`).join('')}
      </div>
      <div class="seg" role="group" aria-label="Group by"><span>Group by</span>${[['need', 'Status'], ['cadence', 'Cadence']].map(([k, l]) => `<button type="button" data-ghgroup="${k}" aria-pressed="${ghGroup === k}">${l}</button>`).join('')}</div>
    </div>` : ''}
    ${active.length && !shown.length ? '<p class="hint">Nothing of this kind in the greenhouse.</p>' : ''}
    ${ghGroups(shown).map(([cls, title, list, sub], i, all) => `
    ${all.length > 1 || ghGroup === 'cadence' ? `<h2 class="gh-h ${cls}">${title} · ${list.length}${sub ? ` <span class="sub">${sub}</span>` : ''}</h2>` : ''}
    <div class="grid">
      ${list.map(p => { const h = health(p); return `
        <button class="plot s-${h}" type="button" data-plant="${p.id}">
          ${pic(p, stage(p), h, `<span class="pill">${STATE_LABEL[h]}</span><span class="name">${esc(p.name)}</span>`)}
          <div class="body">
            <span class="species-name">${esc(p.species.name)}</span>
            <span class="meta">${TYPES[p.type].label} · ${cadenceName(p.cadence).toLowerCase()}</span>
            ${isPerennial(p) && activeWork(p).length ? `<span class="on">On: ${activeWork(p).map(w => esc(w.title)).join(', ')}</span>` : ''}
            <span class="when">${ago(p)}</span>
          </div>
        </button>`; }).join('')}
    </div>`).join('')}`;
}

function gardenView() {
  const done = plants.filter(p => placeOf(p) === 'garden').sort((a, b) => (a.done.date < b.done.date ? -1 : 1));
  const first = done.slice().sort((a, b) => (a.planted < b.planted ? -1 : 1))[0];
  return `
    <div class="summary"><div><h1>The garden</h1><p>Everything you grew to the end. It stays as it was on its last day; nothing here needs a check-in.</p></div></div>
    ${done.length ? `<div class="scene-wrap">${gardenScene(done)}</div>
    <div class="scene-caption"><span>${done.length} plant${done.length > 1 ? 's' : ''} grown since ${fmt(first.planted, { month: 'long', year: 'numeric' })}, all on Velune</span><span>Tap a plant to open it</span></div>
    <div class="done-list">${done.slice().reverse().map(p => `<button class="done-row" type="button" data-plant="${p.id}">${thumb(p)}<div><b>${esc(p.name)}</b> <span class="species-name">${esc(p.species.name)}</span><div class="out">${esc(p.done.note)}</div></div><span class="dates">${short(p.planted)} → ${short(p.done.date)}</span></button>`).join('')}</div>`
    : '<p class="hint">Nothing finished yet. Plants you mark Done, or people you plant out, settle here.</p>'}`;
}

let mfilter = 'all', msearch = '';
let move = null;        // board: { id, to } while asking why it is parked or what came of it
let ideaOpen = false;   // board: the + Idea box is open
let doneAll = false;    // board: show every done plant
let dragId = null;
let rewording = [];     // stored lines the guard now catches (GET /api/guard)
async function loadRewording() {
  try {
    const res = await fetch('/api/guard', { credentials: 'same-origin' });
    if (!res.ok) return;
    const data = await res.json();
    const changed = JSON.stringify(data.rewording) !== JSON.stringify(rewording);
    rewording = data.rewording;
    if (changed && route.name === 'manage') renderKeepingFocus();
  } catch {}
}
const ORDER = ['idea', 'greenhouse', 'shed', 'garden'];
// Where a card may go from each column. Done is final.
const MOVES = { idea: ['greenhouse'], greenhouse: ['shed', 'garden'], shed: ['greenhouse', 'garden'], garden: [] };
function manageView() {
  const NAME = { idea: 'Ideas', greenhouse: 'Growing', shed: 'Parked', garden: 'Done' };
  const WHY = { idea: 'no bed, no picture', greenhouse: `${plants.filter(p => placeOf(p) === 'greenhouse').length} of ${LIMIT} beds`, shed: 'no wilting', garden: 'stays as it is' };
  const cnt = k => plants.filter(p => placeOf(p) === k).length;
  const q = msearch.toLowerCase();
  const list = plants.filter(p => (mfilter === 'all' || p.type === mfilter) && (!q || [p.name, p.note, p.species?.name].some(x => (x || '').toLowerCase().includes(q))));
  const since = p => {
    const pl = placeOf(p);
    if (pl === 'idea') return `Jotted ${short(p.created)}`;
    if (pl === 'greenhouse') return ago(p);
    if (pl === 'shed') return `Parked ${short((p.log.find(e => e.kind === 'park') || {}).date)}`;
    return `Done ${short(p.done.date)}`;
  };
  const out = p => isPerennial(p) ? 'Plant out' : 'Done';
  const acts = p => ({
    idea: `<button class="btn small primary" type="button" data-plantidea="${p.id}">Plant</button><button class="btn small ghost" type="button" data-discard="${p.id}">Discard</button>`,
    greenhouse: `<button class="btn small ghost" type="button" data-move="${p.id}" data-to="shed">Park</button><button class="btn small ghost" type="button" data-move="${p.id}" data-to="garden">${out(p)}</button>`,
    shed: `<button class="btn small ghost" type="button" data-revive="${p.id}">Revive</button><button class="btn small ghost" type="button" data-move="${p.id}" data-to="garden">${out(p)}</button>`,
    garden: ''
  })[placeOf(p)];
  const card = p => { const pl = placeOf(p); return `
    <div class="kcard ${pl === 'greenhouse' ? 's-' + health(p) : ''}" draggable="true" data-card="${p.id}">
      ${thumb(p)}
      <div class="nm">${pl === 'idea' ? `<b>${esc(p.name)}</b><small>${esc(TYPES[p.type].label)}${p.note ? ` · ${esc(p.note)}` : ''}</small>` : `<button type="button" data-plant="${p.id}">${esc(p.name)}</button><small>${TYPES[p.type].label} · ${cadenceName(p.cadence).toLowerCase()}</small>`}<span class="since">${since(p)}</span></div>
      <div class="acts">${acts(p)}</div>
    </div>`; };
  const moveBox = p => {
    const toGarden = move.to === 'garden';
    return `<form class="move-box" id="move-form" novalidate>
      <p>${toGarden ? `${out(p)}: ${esc(p.name)}` : `Park ${esc(p.name)}`}</p>
      <input id="mv-note" placeholder="${toGarden ? (isPerennial(p) ? 'Where did they go? e.g. moved on to lead Payments' : 'What came of it? (optional)') : 'Why park it? (optional)'}" aria-label="Note" autocomplete="off" maxlength="300">
      <div class="acts"><button class="btn primary small" type="submit">${toGarden ? 'Plant out in the garden' : 'Park in the shed'}</button><button class="btn small ghost" type="button" data-movecancel="1">Cancel</button></div>
    </form>`;
  };
  const ideaBox = ideaOpen ? `<form class="kadd" id="idea-form" novalidate>
      <input id="i-name" placeholder="Name: a person, project or initiative" aria-label="Idea name" autocomplete="off" maxlength="80">
      <input id="i-note" placeholder="One line: why might it matter?" aria-label="Idea note" autocomplete="off" maxlength="300">
      <div class="row"><select id="i-type" aria-label="Type">${Object.entries(TYPES).map(([k, t]) => `<option value="${k}">${t.label}</option>`).join('')}</select><button class="btn primary small" type="submit">Add</button></div>
    </form>` : `<button class="kadd-open" type="button" data-ideaopen="1">+ Idea</button>`;
  const col = k => {
    let cards = list.filter(p => placeOf(p) === k);
    if (k === 'greenhouse') cards.sort((a, b) => RANK[health(a)] - RANK[health(b)] || ratio(b) - ratio(a));
    if (k === 'garden') cards.sort((a, b) => (a.done.date < b.done.date ? 1 : -1));
    if (k === 'idea') cards.sort((a, b) => (a.created < b.created ? 1 : -1));
    const total = cards.length, cut = k === 'garden' && !doneAll && total > 4;
    if (cut) cards = cards.slice(0, 4);
    const mv = move && move.to === k ? byId(move.id) : null;
    return `<section class="col st-${k}" data-col="${k}" aria-label="${NAME[k]}">
      <div class="col-h"><h2>${NAME[k]}</h2><span class="n">${cnt(k)}</span><span class="ctx">${WHY[k]}</span></div>
      ${k === 'idea' ? ideaBox : ''}
      ${mv ? moveBox(mv) : ''}
      ${cards.map(card).join('') || (k === 'idea' ? '' : `<p class="empty">${q || mfilter !== 'all' ? 'Nothing matches.' : 'Empty.'}</p>`)}
      ${cut ? `<button class="more" type="button" data-doneall="1">Show all ${total}</button>` : k === 'garden' && doneAll && total > 4 ? `<button class="more" type="button" data-doneall="1">Show fewer</button>` : ''}
    </section>`;
  };
  return `
    <div class="summary"><div><h1>Manage plants</h1><p>Drag a card to move it: an idea into Growing plants it, Growing into Parked or Done, Parked back into Growing. Hover a card for its buttons.</p></div></div>
    <div class="manage-bar">
      <div class="filters" role="group" aria-label="Show">${[['all', 'All'], ['person', 'People'], ['project', 'Projects'], ['initiative', 'Initiatives']].map(([k, l]) => `<button class="chip" type="button" data-mfilter="${k}" aria-pressed="${mfilter === k}">${l}</button>`).join('')}</div>
      <input class="search" id="m-search" type="search" placeholder="Filter the board" value="${esc(msearch)}" aria-label="Filter the board">
    </div>
    <div class="board" id="board">${ORDER.map(col).join('')}</div>
    ${rewording.length ? `<div class="card reword-card">
      <span class="label">🛡 Needs rewording · ${rewording.length}</span>
      <p class="hint" style="margin:0">Lines saved before the current rules or keep-out words caught them. Reword each one and save; the old wording is replaced.</p>
      ${rewording.map((r, i) => `<form class="reword" data-ref="${esc(r.ref)}" novalidate>
        <div class="rw-where">${r.plantName ? `<button type="button" class="linkish" ${['greenhouse', 'shed', 'garden'].includes(r.place) ? `data-plant="${esc(r.plant)}"` : ''}>${esc(r.plantName)}</button> · ` : ''}${esc(r.label)}</div>
        <div class="rw-row"><input id="rw-${i}" value="${esc(r.text)}" aria-label="${esc(r.label)}" autocomplete="off" aria-invalid="true"><button class="btn small primary" type="submit">Save</button></div>
        <div class="guard-msg" data-for="rw-${i}" role="status">${r.hits.map(h => `<span>🛡 ${esc(h)}</span>`).join('')}</div>
      </form>`).join('')}
    </div>` : ''}
    <div class="card guard-card">
      <span class="label">🛡 Sensitive-info guard</span>
      <p class="hint" style="margin:0">Every line you type is checked as you type and again by the server when saving. Anything that looks like the items below can't be saved until it is reworded. Stored lines are checked again with the current rules and keep-out words; any that fail show up here to reword.</p>
      <ul><li>Money amounts, prices and rates</li><li>Contract terms</li><li>Pay details</li><li>Health details</li><li>HR or legal cases</li><li>Passwords and keys</li><li>Emails, phone numbers and bank details</li></ul>
      <span class="label">Your keep-out words</span>
      <div class="chips">${state.keepOut.map(w => `<button type="button" data-unkeep="${esc(w.hash)}" title="Remove" aria-label="Remove keep-out word ${esc(w.hint)}">${esc(w.hint)} ✕</button>`).join('') || '<span class="hint">None yet</span>'}</div>
      <p class="hint" style="margin:0">One to three words each, like a customer or supplier name. Stored only as a fingerprint, so the list itself gives nothing away.</p>
      <form id="keepout-form" class="no-guard" novalidate><input id="ko-word" placeholder="e.g. a customer or supplier name" aria-label="Keep-out word" autocomplete="off" maxlength="80"><button class="btn small" type="submit">+ Add</button></form>
    </div>
    <p class="hint">Ideas are seed packets: they don't take a bed and get no pictures. Plant, or dragging an idea into Growing, opens the planting form with its note. <a href="/api/export" download>Download everything (JSON)</a></p>`;
}

const openBranches = new Set();
let adding = null; // 'branch' | 'ms' | 'goal': rare edits open behind a button
function workHTML(p) {
  const act = activeWork(p), past = (p.work || []).filter(w => w.ended), live = placeOf(p) === 'greenhouse';
  if (!live && !(p.work || []).length) return '';
  const first = esc(firstName(p));
  const branch = w => { const open = openBranches.has(w.id), shown = open ? w.updates : w.updates.slice(0, 1); return `<li class="branch ${open ? 'open' : ''}">
      <div class="b-head"><button class="b-name" type="button" data-bopen="${w.id}" aria-expanded="${open}">${esc(w.title)}<span class="chev" aria-hidden="true">${open ? '▾' : '▸'}</span></button>
        ${live ? `<button class="linkish" type="button" data-wrap="${w.id}" aria-label="Done: ${esc(w.title)}">Done</button>` : ''}</div>
      ${shown.length ? `<ul class="b-hist">${shown.map(u => `<li><span class="d">${short(u.date)}</span>${esc(u.text)}</li>`).join('')}</ul>` : '<div class="b-none">No updates yet</div>'}
      ${!open && w.updates.length > 1 ? `<button class="linkish small" type="button" data-bopen="${w.id}">${w.updates.length - 1} earlier update${w.updates.length > 2 ? 's' : ''}</button>` : ''}
      ${live ? `<form class="b-form" data-branch="${w.id}" novalidate><input id="b-text-${w.id}" placeholder="Update on ${esc(w.title)}" aria-label="Update on ${esc(w.title)}" autocomplete="off" maxlength="500"><button class="btn small" type="submit">Add</button></form>` : ''}
    </li>`; };
  return `<div class="card work">
    <div class="legend"><span class="label">Branches</span><span>What ${first} is working on</span></div>
    ${act.length ? `<ul class="branches">${act.map(branch).join('')}</ul>` : '<p class="hint" style="margin:0">No branches yet.</p>'}
    ${past.length ? `<p class="hint" style="margin:0">Done: ${past.map(w => esc(w.title)).join(', ')}</p>` : ''}
    ${live ? (adding === 'branch' ? `<form class="inline-add three" id="work-form" novalidate>
      <input id="wk-title" placeholder="e.g. the platform migration" aria-label="Something ${first} works on" autocomplete="off" maxlength="120">
      <button class="btn small primary" type="submit">Add branch</button><button class="btn small ghost" type="button" data-adding="">Cancel</button>
    </form>` : `<div><button class="btn small" type="button" data-adding="branch">+ Branch</button></div>`) : ''}
  </div>`;
}

function stripHTML(p) {
  const weeks = p.history.slice(-8);
  const end = placeOf(p) === 'garden' ? addDays(p.done.date, -((day(p.done.date).getUTCDay() + 6) % 7)) : state.lastMonday;
  const mondays = weeks.map((_, i) => addDays(end, -7 * (weeks.length - 1 - i)));
  return `<div class="strip">${weeks.map(([st, hp], i) => { const last = i === weeks.length - 1, hide = last && p.unseen; return `<div class="wk ${last ? 'now' : ''} s-${hp}" title="Week ${isoWeek(mondays[i])}${hide ? ': not opened yet' : `: ${STATE_LABEL[hp].toLowerCase()}`}">${hide ? terra(p.species, st, hp, VEIL('✦', ''), 'veiled') : last ? pic(p, st, hp) : terra(p.species, st, hp)}<span>W${isoWeek(mondays[i])}</span></div>`; }).join('')}</div>`;
}

function timelineHTML(p) {
  const ms = (p.milestones || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  const start = p.start || p.planted, target = p.target || addDays(start, 90);
  const span = Math.max(1, daysBetween(start, target));
  const pos = d => Math.min(100, Math.max(0, daysBetween(start, d) / span * 100));
  const left = daysBetween(TODAY, target);
  const live = placeOf(p) === 'greenhouse', inGarden = placeOf(p) === 'garden';
  return `<div class="tl">
    <div class="tl-head"><span class="label">Timeline</span><b class="${left < 0 ? 'late' : ''}">${inGarden ? `Done ${short(p.done.date)}` : left > 0 ? `${left} days to the target` : left === 0 ? 'Target is today' : `Target passed ${-left} days ago`}</b></div>
    <div class="bar"><div class="done" style="width:${pos(inGarden ? p.done.date : TODAY)}%"></div>
      ${ms.map(m => `<span class="ms ${m.done ? 'ok' : m.d < TODAY ? 'late' : ''}" style="left:${pos(m.d)}%" title="${esc(m.t)} · ${short(m.d)}"></span>`).join('')}
      ${inGarden ? '' : `<span class="now" style="left:${pos(TODAY)}%" title="Today"></span>`}</div>
    <div class="tl-ends"><span>${short(start)}</span><span>${short(target)}</span></div>
    ${ms.length ? `<ul class="ms-list">${ms.map(m => `<li class="${!m.done && m.d < TODAY ? 'late' : ''}"><span class="${m.done ? 'tick' : 'open'}">${m.done ? '✓' : '○'}</span>${live ? `<button type="button" data-msid="${m.id}" title="Tick or untick">${esc(m.t)}</button>` : `<span>${esc(m.t)}</span>`}<span class="d2">${short(m.d)}</span></li>`).join('')}</ul>` : ''}
  </div>`;
}

let showPast = false;
function seasonHTML(p) {
  const s = p.season;
  if (!s) return '';
  const live = placeOf(p) === 'greenhouse', ms = (s.milestones || []).slice().sort((a, b) => (a.d < b.d ? -1 : 1));
  const left = daysBetween(TODAY, s.end), past = p.pastSeasons || [];
  const cancel = '<button class="btn small ghost" type="button" data-adding="">Cancel</button>';
  const goal = live && adding === 'goal'
    ? `<div class="empty-goal"><form class="inline-add three" id="sgoal-form" novalidate><input id="sg-text" value="${esc(s.goal)}" placeholder="What you want for ${esc(firstName(p))} this season" aria-label="Season goal" autocomplete="off" maxlength="300"><button class="btn small primary" type="submit">Save</button>${cancel}</form></div>`
    : s.goal ? `<p class="goal">${esc(s.goal)}${live ? `<button class="edit-ico" type="button" data-adding="goal" aria-label="Change the goal" title="Change the goal">✎</button>` : ''}</p>`
    : `<p class="goal none">No goal this season${live ? ` · <button class="linkish" type="button" data-adding="goal">Set one</button>` : ''}</p>`;
  return `<div class="season">
    <div class="s-head"><span>Season ${s.n} · until ${short(s.end)}</span><span>${placeOf(p) === 'garden' ? `Planted out ${short(p.done.date)}` : left > 0 ? `${left} days left` : left === 0 ? 'Ends today' : `Ended ${short(s.end)}`}</span></div>
    ${goal}
    ${p.intent ? `<p class="intent">${esc(p.intent)}</p>` : ''}
    ${ms.length ? `<ul class="ms-list">${ms.map(m => `<li class="${m.done ? 'done' : !m.d || m.d >= TODAY ? '' : 'late'}"><span class="${m.done ? 'tick' : 'open'}">${m.done ? '✓' : '○'}</span>${live ? `<button type="button" data-msid="${m.id}" title="Tick or untick">${esc(m.t)}</button>` : `<span>${esc(m.t)}</span>`}<span class="d2">${short(m.d)}</span></li>`).join('')}</ul>` : ''}
    ${live && adding === 'ms' ? `<form class="inline-add ms-add" id="sms-form" novalidate><input id="sms-t" placeholder="Milestone" aria-label="Milestone" autocomplete="off" maxlength="120"><input type="date" id="sms-d" value="${addDays(TODAY, 21) < s.end ? addDays(TODAY, 21) : s.end}" min="${s.start}" max="${s.end}" aria-label="Milestone date"><button class="btn small primary" type="submit">Add</button>${cancel}</form>` : ''}
    ${showPast && past.length ? `<ul class="past">${past.slice().reverse().map(x => `<li><b>Season ${x.n}</b> ${esc(x.goal || 'no goal')}${x.review ? `<small>${esc(x.review)}</small>` : ''}</li>`).join('')}</ul>` : ''}
    ${live && panel === 'season' ? `
      <form class="season-review" id="season-form" novalidate>
        <span class="label">Close season ${s.n}</span>
        <div class="field"><label for="ns-review">What grew, and what didn't (optional)</label><textarea id="ns-review" maxlength="2000" placeholder="A few lines to look back on"></textarea></div>
        <div class="field"><label for="ns-goal">Season ${s.n + 1} goal (optional)</label><input id="ns-goal" maxlength="300" autocomplete="off"></div>
        <div class="field"><label for="ns-end">Season ${s.n + 1} ends</label><input type="date" id="ns-end" value="${addDays(TODAY, 90)}" min="${addDays(TODAY, 1)}"></div>
        ${ms.some(m => !m.done) ? `<p class="hint" style="margin:0">Open milestones move to season ${s.n + 1}: ${ms.filter(m => !m.done).map(m => esc(m.t)).join(', ')}.</p>` : ''}
        <div class="actions"><button class="btn primary small" type="submit">Start season ${s.n + 1}</button><button class="btn ghost small" type="button" data-do="cancel">Cancel</button></div>
      </form>` : ''}
    <div class="s-foot">
      ${live && adding !== 'ms' ? '<button class="linkish" type="button" data-adding="ms">+ Milestone</button>' : '<span></span>'}
      <span class="s-links">${past.length ? `<button class="linkish quiet" type="button" data-showpast="1">${showPast ? 'Hide earlier seasons' : `Earlier seasons (${past.length})`}</button>` : ''}${live && panel !== 'season' ? '<button class="linkish quiet" type="button" data-do="ask-season">Close season</button>' : ''}</span>
    </div>
  </div>`;
}

function followupsHTML(p) {
  const shown = (p.todos || []).filter(t => !t.closed || t.closed === TODAY);
  const cleared = (p.todos || []).filter(t => t.closed && t.closed !== TODAY).length;
  return `<div class="card followups">
    <div class="legend"><h2>Follow-ups</h2><span>${(p.todos || []).filter(t => !t.closed).length} open</span></div>
    ${shown.length ? `<ul class="todos">${shown.map(t => `<li class="${t.closed ? 'done' : ''}"><input type="checkbox" id="td-${t.id}" data-todo="${t.id}" ${t.closed ? 'checked' : ''}><label for="td-${t.id}">${esc(t.text)}</label><span class="d">${short(t.added)}</span></li>`).join('')}</ul>` : '<p class="hint" style="margin:0">Nothing to follow up. Next steps you write when checking in land here.</p>'}
    ${cleared ? `<p class="hint" style="margin:0">${cleared} checked off earlier (in the log)</p>` : ''}
  </div>`;
}

const LOG_LABEL = { park: 'Parked in the shed', revive: 'Revived', cadence: 'Cadence changed', done: 'Planted out in the garden', plant: 'Planted', milestone: 'Milestone reached', season: 'New season', species: 'Species changed', idea: 'Jotted down as an idea', need: 'Special need met', todo: 'Follow-up checked off', checkin: 'Checked in, no note' };
function plantView(p) {
  const h = health(p), pl = placeOf(p), u = ui(p.id);
  const branchNews = (p.work || []).flatMap(w => w.updates.map(x => ({ kind: 'branch', date: x.date, note: x.text, title: w.title })));
  const logItems = [...p.log, ...branchNews].map((e, i) => ({ e, i })).sort((a, b) => (a.e.date < b.e.date ? 1 : a.e.date > b.e.date ? -1 : a.i - b.i)).map(({ e }) => e).map(e => {
    const date = fmt(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    if (e.kind === 'branch') return `<li class="marker bnews"><div class="d">${date} · 🌿 ${esc(e.title)}</div><div class="note">${esc(e.note)}</div></li>`;
    if (e.kind === 'checkin' && (e.going || e.follow)) return `<li><div class="d">${date}</div>
      <div class="lines">${e.going ? `<div><span>How it's going</span>${esc(e.going)}</div>` : ''}${e.follow ? `<div><span>Follow-up</span>${esc(e.follow)}</div>` : ''}</div></li>`;
    if (e.kind === 'plant') return `<li class="marker"><div class="d">${date} · Planted${e.note ? ` as a ${esc(e.note)} seed` : ''}</div></li>`;
    return `<li class="marker ${e.kind === 'season' ? 'season' : ''}"><div class="d">${date} · ${LOG_LABEL[e.kind] || esc(e.kind)}</div>${e.note ? `<div class="note">${esc(e.note)}</div>` : ''}</li>`;
  });
  const activeCount = plants.filter(x => placeOf(x) === 'greenhouse').length;
  const box = (label, ph, buttons, pre = '') => `<form class="confirm" id="confirm-form" novalidate>${pre}<label for="c-note">${label}</label><input id="c-note" placeholder="${ph}" autocomplete="off" maxlength="300"><div class="actions">${buttons}<button class="btn ghost small" type="button" data-do="cancel">Cancel</button></div></form>`;
  const confirm = panel === 'park' ? box('Why park it? (optional)', 'e.g. waiting on a decision', '<button class="btn primary small" type="submit">Park in the shed</button>')
    : panel === 'revive' ? box('Note (optional)', 'e.g. the go-ahead came', `<button class="btn primary small" type="submit">${activeCount >= LIMIT ? 'Revive anyway' : 'Revive'}</button>`, activeCount >= LIMIT ? `<div class="full">All ${LIMIT} beds are in use. Park a plant first, or revive anyway.</div>` : '')
    : panel === 'done' ? box(isPerennial(p) ? 'Where did they go?' : 'What came of it?', isPerennial(p) ? 'e.g. moved on to lead Payments' : 'e.g. old warehouse switched off', '<button class="btn primary small" type="submit">Plant out in the garden</button>', '<p class="hint" style="margin:0">It keeps its last picture and stays in the garden, unchanged.</p>')
    : '';
  const met = lastNeedMet(p);
  const showStrip = state.pictures && p.history.length > 1;
  const picMeta = [
    state.pictures && (pl === 'garden' ? 'Stays as it was on its last day' : pl === 'shed' ? 'Pictures paused while dormant' : `Next picture ${fmt(state.nextMonday, { weekday: 'short', day: 'numeric', month: 'short' })}, a surprise`),
    showStrip && `<button class="linkish quiet" type="button" data-do="lookback">${u.lookBack ? 'Hide past weeks' : 'Look back'}</button>`
  ].filter(Boolean).join(' · ');
  return `
    <button class="back" type="button" data-go="${pl === 'shed' ? 'manage' : pl}">← ${pl === 'greenhouse' ? 'Greenhouse' : pl === 'garden' ? 'Garden' : 'Manage'}</button>
    <div class="plant-layout">
      <div class="col">
        <div class="card specimen s-${h}">
          ${p.unseen ? terra(p.species, stage(p), lookNow(p), VEIL(`✦ New picture from Mon ${short(state.lastMonday)}`, 'Painted this week, not seen by anyone yet'), 'veiled')
            : pic(p, stage(p), pl === 'shed' ? 'dormant' : lookNow(p), state.pictures ? `<span class="caption">${pl === 'garden' ? `Last picture · ${short(p.done.date)}` : `Picture of Mon ${short(state.lastMonday)}`}</span>` : '')}
          <div class="info">
            <div class="row-between"><span class="pill">${STATE_LABEL[h]}</span></div>
            <h1>${esc(p.name)}</h1>
            <p class="facts-line">${TYPES[p.type].label} · ${cadenceName(p.cadence).toLowerCase()} · ${pl === 'greenhouse' ? ago(p).toLowerCase() : pl === 'garden' ? `finished ${short(p.done.date)}` : 'dormant'} · growing ${weeksGrowing(p)} week${weeksGrowing(p) > 1 ? 's' : ''}</p>
            ${picMeta ? `<p class="pic-meta">${picMeta}</p>` : ''}
            ${showStrip && u.lookBack ? stripHTML(p) : ''}
            ${pl === 'garden' ? '' : `<div class="actions">
              <button class="btn small" type="button" data-go="edit">Edit</button>
              ${pl === 'shed' ? '<button class="btn small" type="button" data-do="ask-revive">Revive</button>' : `<button class="btn small" type="button" data-do="ask-done">${isPerennial(p) ? 'Plant out' : 'Done'}</button><button class="btn small" type="button" data-do="ask-park">Park</button>`}
            </div>`}
            ${confirm}
          </div>
        </div>
        <div class="card species-card">
          <div class="row-between"><span class="label">Species</span>${p.species.lore ? `<button class="linkish quiet" type="button" data-lore="1" aria-expanded="${!!u.loreOpen}">${u.loreOpen ? 'Hide lore' : 'Lore'}</button>` : ''}</div>
          <h3>${esc(p.species.name)}</h3>
          <span class="origin">${esc(p.species.origin)}</span>
          ${u.loreOpen ? `<p>${esc(p.species.lore)}</p>${p.species.fits ? `<p class="fits">Fits: ${esc(lc(p.species.fits))}</p>` : ''}` : ''}
          <div class="need-box">
            <span class="label">Special need</span>
            ${p.need.name ? `<span class="need-name">${esc(p.need.name)}</span>
            ${p.need.meaning ? `<span class="meaning">${esc(p.need.meaning)}</span>` : ''}
            <span class="met">${met ? `Last met ${short(met)}` : 'Not met yet'}</span>
            ${pl === 'greenhouse' ? (met === TODAY ? '<span class="met-today">✓ Met today</span>' : `<button class="btn small" type="button" data-needmet="1" title="${esc(p.need.check)}">✓ Met this week</button>`) : ''}`
            : `<span class="meaning">None yet${pl === 'garden' ? '' : '. Add one with Edit: what this plant needs to grow.'}</span>`}
          </div>
        </div>
      </div>
      <div class="col">
        ${pl === 'greenhouse' ? `
        <form class="card water" id="water-form" novalidate>
          <div class="legend"><h2>Check in${p.type === 'person' ? ' with' : ' on'} ${esc(p.type === 'person' ? firstName(p) : p.name)}</h2><span>${ago(p)}</span></div>
          <div class="field"><label for="w-going">How are things going?</label><input id="w-going" autocomplete="off" maxlength="500" placeholder="One line, or leave it empty and just check in"></div>
          <div class="field"><label for="w-follow">Next steps / follow-up</label><input id="w-follow" autocomplete="off" maxlength="300" placeholder="Optional; lands in the follow-up list"></div>
          <div class="water-foot">
            <span class="hint">Any attention counts as a check-in: a line here, a branch update, a ticked follow-up, a milestone, the special need.</span>
            <button class="btn primary" type="submit">✓ Check in</button>
          </div>
        </form>
        ${followupsHTML(p)}` : pl === 'shed' ? `<div class="card"><b>Dormant</b><p class="hint" style="margin:0">Parked in the shed. It doesn't wilt or take a bed. Revive it to start checking in again.</p></div>` : `<div class="card"><b>${esc(p.done.note)}</b><p class="hint" style="margin:0">Planted out in the garden on ${short(p.done.date)}. It stays as it is.</p></div>`}
        ${isPerennial(p) ? workHTML(p) : ''}
        <div class="card plan">
          ${isPerennial(p) ? '' : `<div><span class="label">Goal</span><p class="goal">${p.goal ? esc(p.goal) : '<span class="hint">No goal written yet</span>'}</p></div>`}
          ${isPerennial(p) ? seasonHTML(p) : `${p.intent ? `<div><span class="label">Why</span><p class="intent">${esc(p.intent)}</p></div>` : ''}${timelineHTML(p)}`}
        </div>
        <div class="log"><div class="log-head"><h2>Log</h2>${logItems.length > 3 ? `<button class="linkish" type="button" data-logtoggle="1" aria-expanded="${!!u.logOpen}">${u.logOpen ? 'Show less' : `Show all ${logItems.length}`}</button>` : ''}</div>
          <ol>${(u.logOpen ? logItems : logItems.slice(0, 3)).join('')}</ol>
          ${!u.logOpen && logItems.length > 3 ? `<button class="linkish more" type="button" data-logtoggle="1">${logItems.length - 3} older entries</button>` : ''}</div>
      </div>
    </div>`;
}

// The species card, with "Another plant": until AI planting (build step 2) it
// walks through the catalogue of Velune species.
function speciesPick(sp, n, total) {
  return `<div class="species-pick">
    ${terra(sp, 0, 'thriving', '<span class="seedcap">What it grows into is a surprise</span>')}
    <div class="txt">
      <span class="label" style="color:var(--magic)">Species from Velune</span>
      <h3>${esc(sp.name)}</h3>
      <span class="hint" style="font-family:var(--font-mono);font-size:12px">${esc(sp.origin)}</span>
      <p>${esc(sp.lore)}</p>
      ${sp.fits ? `<p class="fits">Fits: ${esc(lc(sp.fits))}</p>` : ''}
      <div class="row" style="justify-content:flex-start"><button class="btn small" type="button" data-do="reroll">Another plant</button>${total ? `<span class="count">${n + 1} of ${total}</span>` : ''}</div>
    </div>
  </div>`;
}

function formFields(v, { editing = false, sp, need, n, total }) {
  const perennial = v.type === 'person';
  return `
    <div class="field"><label for="f-name">Name</label><input id="f-name" value="${esc(v.name)}" placeholder="A person, a project or an initiative" autocomplete="off" maxlength="80"></div>
    <div class="field"><span class="label">Type</span>
      <div class="types">${Object.entries(TYPES).map(([k, t]) => `<input type="radio" name="type" id="ty-${k}" value="${k}" ${k === v.type ? 'checked' : ''}><label for="ty-${k}"><b>${t.label}</b><small>${t.life}</small></label>`).join('')}</div>
    </div>
    <div class="field"><span class="label">Species</span>${speciesPick(sp, n, total)}</div>
    <div class="field"><span class="label">Special need</span>
      <div class="two"><div class="field"><label for="f-need" class="sub">Name</label><input id="f-need" value="${esc(need.name)}" placeholder="e.g. Open sky" maxlength="80" autocomplete="off"></div>
      <div class="field"><label for="f-need-meaning" class="sub">What it means at work</label><input id="f-need-meaning" value="${esc(need.meaning)}" placeholder="e.g. room to decide without me" maxlength="200" autocomplete="off"></div></div>
      <div class="field"><label for="f-need-check" class="sub">The check you tick when checking in</label><input id="f-need-check" value="${esc(need.check)}" placeholder="e.g. made a call without me" maxlength="200" autocomplete="off"></div>
    </div>
    ${perennial ? `
    <div class="field"><label for="f-sgoal">This season's goal</label><textarea id="f-sgoal" placeholder="What should grow this season?" maxlength="300">${esc(v.seasonGoal)}</textarea></div>
    <div class="field"><label for="f-send">Season ends</label><input type="date" id="f-send" value="${v.seasonEnd || ''}"></div>` : `
    <div class="field"><label for="f-goal">Goal: what done looks like</label><textarea id="f-goal" placeholder="Concrete enough to check off" maxlength="300">${esc(v.goal)}</textarea></div>
    <div class="field"><span class="label">Timeline</span>
      <div class="field"><label for="f-target" class="sub">Target date</label><input type="date" id="f-target" value="${v.target || ''}"></div>
      <div class="ms-edit">
        ${(v.milestones || []).map((m, i) => `<div class="ms-row"><input value="${esc(m.t)}" aria-label="Milestone ${i + 1}" data-mst="${i}" data-mid="${esc(m.id || '')}" maxlength="120" id="ms-t-${i}"><input type="date" value="${m.d}" aria-label="Milestone ${i + 1} date" data-msd="${i}"><button type="button" class="x" data-msx="${i}" aria-label="Remove milestone">×</button></div>`).join('')}
        <div><button type="button" class="linkish" data-msadd>+ Milestone</button></div>
      </div>
    </div>`}
    <div class="field"><label for="f-intent">Why it matters now</label><textarea id="f-intent" placeholder="In your own words" maxlength="500">${esc(v.intent)}</textarea></div>
    <div class="field"><span class="label">Check in every</span>
      <div class="cadence">${CADENCES.map(([d, l]) => `<button type="button" class="chip" data-cad="${d}" aria-pressed="${d === v.cadence}">${l}</button>`).join('')}
        <span class="hint">or</span><input type="number" id="f-days" min="1" max="365" value="${v.cadence}" aria-label="Days"><span class="hint">days</span></div>
    </div>
    ${editing ? '' : `<div class="field"><label for="f-next">First next step</label><input id="f-next" value="${esc(v.next)}" autocomplete="off" placeholder="Something you can do this week" maxlength="300"></div>`}
    <div class="err" id="f-err" hidden>Give it a name.</div>`;
}

function newPlant(idea) {
  const type = idea ? idea.type : 'person';
  return {
    ideaId: idea?.id || null,
    draft: {
      speciesIndex: Math.floor(Math.random() * CATALOGUE.length),
      need: { name: '', meaning: '', check: '' },
      fields: { name: idea?.name || '', type, cadence: TYPES[type].cadence, goal: '', target: addDays(TODAY, 90), milestones: [], seasonGoal: '', seasonEnd: addDays(TODAY, 90), intent: idea?.note || '', next: '' }
    }
  };
}

function newView() {
  const activeCount = plants.filter(x => placeOf(x) === 'greenhouse').length;
  const full = activeCount >= LIMIT ? `<div class="full">All ${LIMIT} beds are in use. Park a plant first, or plant anyway.</div>` : '';
  const d = np.draft;
  return `
    <button class="back" type="button" data-go="${np.ideaId ? 'manage' : 'greenhouse'}">← ${np.ideaId ? 'Manage' : 'Greenhouse'}</button>
    <div class="np-head"><h1>${np.ideaId ? 'Plant an idea' : 'Plant something'}</h1><p>Only the name is required. Pick a species from Velune with Another plant, give it a special need, and say what you want to grow.</p></div>
    <form class="form-card" id="plant-form" novalidate style="max-width:760px">
      ${full}
      ${formFields(d.fields, { sp: CATALOGUE[d.speciesIndex], need: d.need, n: d.speciesIndex, total: CATALOGUE.length })}
      <div class="actions"><button class="btn primary" type="submit">Plant</button><button class="btn ghost" type="button" data-go="${np.ideaId ? 'manage' : 'greenhouse'}">Cancel</button></div>
    </form>`;
}

function editView(p) {
  const v = { ...p, seasonGoal: p.season?.goal, seasonEnd: p.season?.end, ...(editDraft || {}) };
  return `
    <button class="back" type="button" data-go="plant">← ${esc(p.name)}</button>
    <form class="form-card" id="plant-form" novalidate style="max-width:760px">
      <h1>Edit plant</h1>
      ${formFields(v, { editing: true, sp: v.speciesChoice || p.species, need: v.needDraft || p.need, n: 0, total: 0 })}
      <div class="actions"><button class="btn primary" type="submit">Save</button><button class="btn ghost" type="button" data-go="plant">Cancel</button></div>
    </form>`;
}

// Re-render without losing the field being typed in.
function renderKeepingFocus() {
  const el = document.activeElement, id = el && el.id, pos = el && el.selectionStart;
  render();
  const again = id && document.getElementById(id);
  if (again) { again.focus(); if (pos != null && again.setSelectionRange) again.setSelectionRange(pos, pos); }
}

function render() {
  if (!state) return;
  const p = route.id && byId(route.id);
  if ((route.name === 'plant' || route.name === 'edit') && !p) route = { name: 'greenhouse' };
  if (route.name === 'new' && !np) route = { name: 'greenhouse' };
  $view.innerHTML = route.name === 'plant' ? plantView(p) : route.name === 'new' ? newView() : route.name === 'edit' ? editView(p)
    : route.name === 'garden' ? gardenView() : route.name === 'manage' ? manageView() : greenhouseView();
  document.getElementById('places').innerHTML = navHTML();
}

// ---------- reading the form ----------
const val = id => (document.getElementById(id) || {}).value?.trim() ?? '';
function readForm() {
  const type = document.querySelector('input[name="type"]:checked').value;
  return {
    name: val('f-name'), type, goal: val('f-goal'), target: val('f-target'), seasonGoal: val('f-sgoal'), seasonEnd: val('f-send'),
    intent: val('f-intent'), next: val('f-next'), cadence: Math.max(1, Math.min(365, parseInt(val('f-days'), 10) || TYPES[type].cadence)),
    milestones: [...document.querySelectorAll('[data-mst]')].map(el => ({ id: el.dataset.mid || undefined, t: el.value.trim(), d: document.querySelector(`[data-msd="${el.dataset.mst}"]`).value || TODAY })),
    need: { name: val('f-need'), meaning: val('f-need-meaning'), check: val('f-need-check') }
  };
}
function keep() { // keep typing across re-renders
  if (!document.getElementById('plant-form')) return;
  const v = readForm();
  const need = v.need; delete v.need;
  if (route.name === 'new') { np.draft.need = need; Object.assign(np.draft.fields, v); }
  else editDraft = { ...(editDraft || {}), ...v, needDraft: need };
}

// ---------- interactions ----------
const plantPath = (p, what) => `/api/plants/${encodeURIComponent(p.id)}${what ? '/' + what : ''}`;
function openPlant(id) { openBranches.clear(); adding = null; showPast = false; panel = null; Object.assign(ui(id), { lookBack: false, logOpen: false }); go({ name: 'plant', id }); }

$view.addEventListener('click', async e => {
  const gp = e.target.closest('[data-gplant]');
  if (gp) { openPlant(gp.dataset.gplant); return; }
  const t = e.target.closest('button');
  if (!t) return;
  const current = route.id && byId(route.id);
  if (t.dataset.mfilter) { mfilter = t.dataset.mfilter; if (t.dataset.go) go({ name: 'manage' }); else render(); return; }
  if (t.dataset.unkeep) { if (await send('DELETE', `/api/guard/words/${t.dataset.unkeep}`)) { toast('Keep-out word removed'); render(); loadRewording(); } return; }
  if (t.dataset.bopen) { const id = t.dataset.bopen; openBranches.has(id) ? openBranches.delete(id) : openBranches.add(id); render(); return; }
  if (t.dataset.needmet) { if (await send('POST', plantPath(current, 'need'))) { toast(`${current.need.name}: met`); render(); } return; }
  if (t.dataset.wrap) {
    const w = current.work.find(x => x.id === t.dataset.wrap);
    if (await send('POST', `/api/branches/${encodeURIComponent(w.id)}/done`)) { toast(`Branch done: ${w.title}`); render(); }
    return;
  }
  if (t.dataset.plant) { openPlant(t.dataset.plant); return; }
  if (t.dataset.plantidea) { np = newPlant(byId(t.dataset.plantidea)); go({ name: 'new' }); return; }
  if (t.dataset.discard) { const idea = byId(t.dataset.discard); if (await send('DELETE', `/api/ideas/${encodeURIComponent(idea.id)}`)) { toast(`Discarded "${idea.name}"`); render(); } return; }
  if (t.dataset.filter) { filter = t.dataset.filter; render(); return; }
  if (t.dataset.ghgroup) { ghGroup = t.dataset.ghgroup; render(); return; }
  if (t.dataset.move) { move = { id: t.dataset.move, to: t.dataset.to }; render(); document.getElementById('mv-note')?.focus(); return; }
  if (t.dataset.movecancel) { move = null; render(); return; }
  if (t.dataset.ideaopen) { ideaOpen = true; render(); document.getElementById('i-name').focus(); return; }
  if (t.dataset.doneall) { doneAll = !doneAll; render(); return; }
  if (t.dataset.revive) { revive(byId(t.dataset.revive)); return; }
  if (t.dataset.msid && current) {
    const m = [...(current.milestones || []), ...(current.season?.milestones || [])].find(x => x.id === t.dataset.msid);
    if (await send('POST', `/api/milestones/${encodeURIComponent(m.id)}/toggle`)) { toast(m.done ? 'Milestone reopened' : 'Milestone reached'); render(); }
    return;
  }
  if (t.dataset.lore) { ui(current.id).loreOpen = !ui(current.id).loreOpen; render(); return; }
  if (t.dataset.showpast) { showPast = !showPast; render(); return; }
  if ('adding' in t.dataset) { adding = t.dataset.adding || null; render(); document.querySelector('#wk-title, #sg-text, #sms-t')?.focus(); return; }
  if (t.dataset.logtoggle) { ui(current.id).logOpen = !ui(current.id).logOpen; render(); return; }
  if (t.dataset.cad) { document.querySelectorAll('[data-cad]').forEach(b => b.setAttribute('aria-pressed', b === t)); document.getElementById('f-days').value = t.dataset.cad; return; }
  if (t.dataset.msadd !== undefined) { keep(); const f = route.name === 'new' ? np.draft.fields : editDraft; f.milestones = f.milestones || []; f.milestones.push({ t: '', d: f.target || addDays(TODAY, 30) }); render(); document.getElementById(`ms-t-${f.milestones.length - 1}`)?.focus(); return; }
  if (t.dataset.msx !== undefined) { keep(); const f = route.name === 'new' ? np.draft.fields : editDraft; f.milestones.splice(+t.dataset.msx, 1); render(); return; }
  const g = t.dataset.go;
  if (g === 'greenhouse' || g === 'garden' || g === 'manage') { panel = null; np = null; move = null; go({ name: g }); return; }
  if (g === 'new') { np = newPlant(null); go({ name: 'new' }); return; }
  if (g === 'edit') { editDraft = { milestones: (current.milestones || []).map(m => ({ ...m })) }; go({ name: 'edit', id: route.id }); return; }
  if (g === 'plant') { editDraft = null; go({ name: 'plant', id: route.id }); return; }
  const d = t.dataset.do;
  if (d === 'lookback') { ui(current.id).lookBack = !ui(current.id).lookBack; render(); return; }
  if (d === 'reroll') {
    keep();
    if (route.name === 'new') np.draft.speciesIndex = (np.draft.speciesIndex + 1) % CATALOGUE.length;
    else {
      const cur = (editDraft && editDraft.speciesChoice) || current.species;
      const at = CATALOGUE.findIndex(s => s.name === cur.name);
      editDraft = { ...(editDraft || {}), speciesChoice: CATALOGUE[(at + 1) % CATALOGUE.length] };
    }
    render(); return;
  }
  if (d && d.startsWith('ask-')) { panel = d.slice(4); render(); document.querySelector('#c-note, #ns-review')?.focus(); return; }
  if (d === 'cancel') { panel = null; render(); }
});
$view.addEventListener('change', async e => {
  if (e.target.dataset.todo) {
    const id = e.target.dataset.todo, on = e.target.checked;
    if (await send('POST', `/api/follow-ups/${encodeURIComponent(id)}/${on ? 'clear' : 'unclear'}`)) { if (on) toast('Checked off'); }
    render(); return;
  }
  if (e.target.name === 'type') {
    keep();
    if (route.name === 'new') np.draft.fields.cadence = TYPES[e.target.value].cadence;
    render();
  }
});
$view.addEventListener('input', e => {
  const form = e.target.closest('form');
  if (form && guardFields(form).includes(e.target)) guardField(e.target);
  if (e.target.id === 'm-search') { msearch = e.target.value; const pos = e.target.selectionStart; render(); const el = document.getElementById('m-search'); el.focus(); el.setSelectionRange(pos, pos); return; }
  if (e.target.id === 'f-days') document.querySelectorAll('[data-cad]').forEach(b => b.setAttribute('aria-pressed', +b.dataset.cad === +e.target.value));
});
async function revive(p, note = '') {
  if (await send('POST', plantPath(p, 'revive'), { note })) { panel = null; toast(`${p.name} is back in the greenhouse`); render(); }
}
function dropOn(id, to) {
  const p = byId(id), from = placeOf(p);
  if (!MOVES[from].includes(to)) return;
  if (from === 'idea') { np = newPlant(p); go({ name: 'new' }); return; }
  if (to === 'greenhouse') { revive(p); return; }
  move = { id, to }; render(); document.getElementById('mv-note')?.focus();
}
// Drag and drop on the board; the buttons on each card do the same without a mouse.
$view.addEventListener('dragstart', e => {
  const c = e.target.closest?.('[data-card]'); if (!c) return;
  dragId = c.dataset.card; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', dragId);
  c.classList.add('is-dragged');
  const from = placeOf(byId(dragId)), board = document.getElementById('board');
  board.classList.add('dragging');
  board.querySelectorAll('[data-col]').forEach(col => col.classList.toggle('can-drop', MOVES[from].includes(col.dataset.col)));
});
$view.addEventListener('dragover', e => {
  const col = e.target.closest?.('.col.can-drop'); if (!col || !dragId) return;
  e.preventDefault(); document.querySelectorAll('.col.over').forEach(c => c !== col && c.classList.remove('over')); col.classList.add('over');
});
$view.addEventListener('dragleave', e => { const col = e.target.closest?.('.col'); if (col && !col.contains(e.relatedTarget)) col.classList.remove('over'); });
$view.addEventListener('drop', e => {
  const col = e.target.closest?.('.col.can-drop'); if (!col || !dragId) return;
  e.preventDefault(); const id = dragId; dragId = null; dropOn(id, col.dataset.col);
});
$view.addEventListener('dragend', () => { dragId = null; const b = document.getElementById('board'); if (!b) return; b.classList.remove('dragging'); b.querySelectorAll('.can-drop, .over, .is-dragged').forEach(el => el.classList.remove('can-drop', 'over', 'is-dragged')); });

$view.addEventListener('submit', async e => {
  e.preventDefault();
  const form = e.target;
  if (form.id === 'keepout-form') {
    const w = normalizeWord(val('ko-word'));
    if (!w) { document.getElementById('ko-word').focus(); return; }
    if (words(w).length > MAX_WORDS) { toast(`Keep-out words are one to ${MAX_WORDS} words`); return; }
    // Only the fingerprint and a masked hint go to the server; the word stays here.
    const hash = await fingerprint(state.salt, w);
    if (await send('POST', '/api/guard/words', { hash, hint: mask(val('ko-word')) })) { toast('Keep-out word added'); render(); document.getElementById('ko-word')?.focus(); loadRewording(); }
    return;
  }
  if (!(await guardForm(form))) return;
  const p = route.id && byId(route.id);
  if (form.classList.contains('reword')) {
    const input = form.querySelector('input'), item = rewording.find(r => r.ref === form.dataset.ref);
    if (!input.value.trim() && item?.required) { input.focus(); return; }
    const out = await send('POST', '/api/reword', { ref: form.dataset.ref, text: input.value.trim() });
    if (out) {
      rewording = out.rewording; toast('Reworded');
      const fresh = await fetch('/api/garden', { credentials: 'same-origin' }).then(r => r.ok ? r.json() : null).catch(() => null);
      if (fresh) setState(fresh);
      render();
    }
    return;
  }
  if (form.id === 'move-form') {
    const mp = byId(move.id), note = val('mv-note'), to = move.to;
    if (await send('POST', plantPath(mp, to === 'shed' ? 'park' : 'done'), { note })) {
      toast(to === 'shed' ? `${mp.name} parked in the shed` : `${mp.name} planted out in the garden`);
      move = null; render();
    }
    return;
  }
  if (form.id === 'confirm-form') {
    const note = val('c-note');
    if (panel === 'revive') { revive(p, note); return; }
    if (panel === 'park' && await send('POST', plantPath(p, 'park'), { note })) { panel = null; toast('Parked. Find it under Manage.'); render(); }
    if (panel === 'done' && await send('POST', plantPath(p, 'done'), { note })) { panel = null; toast('Planted out in the garden'); go({ name: 'garden' }); }
    return;
  }
  if (form.id === 'season-form') {
    const n = p.season.n + 1;
    if (await send('POST', plantPath(p, 'season'), { review: val('ns-review'), goal: val('ns-goal'), end: val('ns-end') })) { panel = null; toast(`Season ${n} started`); render(); }
    return;
  }
  if (form.id === 'idea-form') {
    const name = val('i-name');
    if (!name) { document.getElementById('i-name').focus(); return; }
    if (await send('POST', '/api/ideas', { name, type: val('i-type'), note: val('i-note') })) { toast(`Idea saved: ${name}`); render(); document.getElementById('i-name')?.focus(); }
    return;
  }
  if (form.classList.contains('b-form')) {
    const w = p.work.find(x => x.id === form.dataset.branch), text = val(`b-text-${w.id}`);
    if (!text) { document.getElementById(`b-text-${w.id}`).focus(); return; }
    if (await send('POST', `/api/branches/${encodeURIComponent(w.id)}/updates`, { text })) { toast(`Added to ${w.title} · checked in`); render(); }
    return;
  }
  if (form.id === 'sgoal-form') {
    const text = val('sg-text');
    if (!text) { document.getElementById('sg-text').focus(); return; }
    if (await send('PATCH', `/api/seasons/${encodeURIComponent(p.season.id)}`, { goal: text })) { adding = null; toast('Season goal saved'); render(); }
    return;
  }
  if (form.id === 'sms-form') {
    const text = val('sms-t');
    if (!text) { document.getElementById('sms-t').focus(); return; }
    if (await send('POST', `/api/seasons/${encodeURIComponent(p.season.id)}/milestones`, { t: text, d: val('sms-d') || p.season.end })) { adding = null; toast('Milestone added'); render(); }
    return;
  }
  if (form.id === 'work-form') {
    const title = val('wk-title');
    if (!title) { document.getElementById('wk-title').focus(); return; }
    if (await send('POST', plantPath(p, 'branches'), { title })) { adding = null; toast(`New branch: ${title}`); render(); }
    return;
  }
  if (form.id === 'water-form') {
    if (await send('POST', plantPath(p, 'checkin'), { going: val('w-going'), follow: val('w-follow') })) { toast(`Checked in ${p.type === 'person' ? 'with' : 'on'} ${p.type === 'person' ? firstName(p) : p.name}`); render(); }
    return;
  }
  if (form.id === 'plant-form') {
    const v = readForm();
    if (!v.name) { document.getElementById('f-err').hidden = false; document.getElementById('f-name').focus(); return; }
    const body = { name: v.name, type: v.type, cadence: v.cadence, intent: v.intent, goal: v.goal, target: v.target, seasonGoal: v.seasonGoal, seasonEnd: v.seasonEnd, need: v.need, milestones: v.milestones.filter(m => m.t) };
    if (route.name === 'edit') {
      if (editDraft?.speciesChoice) body.species = editDraft.speciesChoice;
      if (await send('PATCH', plantPath(p), body)) { editDraft = null; toast('Saved'); go({ name: 'plant', id: p.id }); }
    } else {
      const sp = CATALOGUE[np.draft.speciesIndex];
      const out = await send('POST', '/api/plants', { ...body, next: v.next, species: sp, ideaId: np.ideaId || undefined });
      if (out) { np = null; toast(`${v.name} planted: a ${sp.name} seed`); openPlant(out.id); }
    }
  }
});
$view.addEventListener('keydown', e => {
  const gp = e.target.closest && e.target.closest('[data-gplant]');
  if (gp && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openPlant(gp.dataset.gplant); return; }
  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
    const form = e.target.closest('#water-form');
    if (form) { e.preventDefault(); form.requestSubmit(); }
  } else if (e.key === 'Enter' && e.target.closest('#water-form') && e.target.tagName === 'INPUT' && !['date', 'checkbox'].includes(e.target.type)) {
    e.preventDefault();
    const ids = ['w-going', 'w-follow'];
    const i = ids.indexOf(e.target.id);
    if (i >= 0 && i < ids.length - 1) document.getElementById(ids[i + 1]).focus(); else document.getElementById('water-form').requestSubmit();
  }
});
document.getElementById('places').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { panel = null; np = null; go({ name: b.dataset.go }); } });
document.getElementById('home').addEventListener('click', () => { panel = null; np = null; go({ name: 'greenhouse' }); });

// Quick find: any plant, wherever it is. "/" focuses it from anywhere.
const $find = document.getElementById('find'), $found = document.getElementById('find-results');
let findSel = 0;
function findMatches(q) {
  q = q.trim().toLowerCase(); if (!q) return [];
  const score = p => (p.name.toLowerCase().startsWith(q) ? 0 : p.name.toLowerCase().includes(q) ? 1 : (p.species?.name || '').toLowerCase().includes(q) ? 2 : (p.work || []).some(w => w.title.toLowerCase().includes(q)) ? 3 : (p.note || '').toLowerCase().includes(q) ? 4 : 9);
  const ORDER_FIND = { greenhouse: 0, shed: 1, idea: 2, garden: 3 };
  return plants.map(p => [score(p), p]).filter(([sc]) => sc < 9).sort((a, b) => a[0] - b[0] || ORDER_FIND[placeOf(a[1])] - ORDER_FIND[placeOf(b[1])]).slice(0, 7).map(([, p]) => p);
}
function renderFind() {
  const q = $find.value, hits = findMatches(q);
  if (!q.trim()) { $found.hidden = true; $found.innerHTML = ''; return; }
  findSel = Math.min(findSel, Math.max(0, hits.length - 1));
  const PLACE = { greenhouse: p => STATE_LABEL[health(p)], shed: () => 'Parked', idea: () => 'Idea', garden: () => 'Done' };
  const cls = p => placeOf(p) === 'greenhouse' ? `s-${health(p)}` : `st-${placeOf(p)}`;
  $found.innerHTML = hits.length ? hits.map((p, i) => `<button type="button" class="${i === findSel ? 'sel' : ''} ${cls(p)}" data-find="${p.id}">${thumb(p)}<span><b>${esc(p.name)}</b><small>${TYPES[p.type].label}${p.species ? ` · ${esc(p.species.name)}` : ''}${isPerennial(p) && activeWork(p).length ? ` · on ${activeWork(p).map(w => esc(w.title)).join(', ')}` : ''}</small></span><span class="st">${PLACE[placeOf(p)](p)}</span></button>`).join('') : '<div class="none">No plant matches. Add it as an idea in Manage.</div>';
  $found.hidden = false;
}
function openFound(id) {
  $find.value = ''; $found.hidden = true; findSel = 0;
  const p = byId(id);
  if (placeOf(p) === 'idea') { mfilter = 'all'; msearch = p.name; go({ name: 'manage' }); return; }
  openPlant(id);
}
$find.addEventListener('input', () => { findSel = 0; renderFind(); });
$find.addEventListener('focus', renderFind);
$find.addEventListener('keydown', e => {
  const hits = findMatches($find.value);
  if (e.key === 'ArrowDown') { e.preventDefault(); findSel = Math.min(hits.length - 1, findSel + 1); renderFind(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); findSel = Math.max(0, findSel - 1); renderFind(); }
  else if (e.key === 'Enter' && hits[findSel]) { e.preventDefault(); openFound(hits[findSel].id); }
  else if (e.key === 'Escape') { $find.value = ''; $found.hidden = true; $find.blur(); }
});
$found.addEventListener('click', e => { const b = e.target.closest('[data-find]'); if (b) openFound(b.dataset.find); });
document.addEventListener('click', e => { if (!e.target.closest('.find')) $found.hidden = true; });
document.addEventListener('keydown', e => { if (e.key === '/' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) { e.preventDefault(); $find.focus(); $find.select(); } });

// ---------- start ----------
document.getElementById('logo').innerHTML = alienSVG(CATALOGUE[0], 4, 'thriving');
(async function start() {
  try {
    const res = await fetch('/api/garden', { credentials: 'same-origin' });
    if (!res.ok) throw new Error(res.status);
    setState(await res.json());
  } catch {
    $view.innerHTML = '<p class="hint">Could not open the garden. You may be signed out: reload the page.</p>';
    return;
  }
  document.getElementById('today').textContent = fmt(TODAY, { weekday: 'long', day: 'numeric', month: 'long' });
  route = parseHash();
  if (route.name === 'manage') loadRewording();
  render();
})();
