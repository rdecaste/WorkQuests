// The garden's rules, shared by the page and the Worker: dates, health and
// what counts as attention. Plants here are in the shape GET /api/garden
// returns (src/store.js builds it).

export const LIMIT = 12; // soft limit on beds in the greenhouse
export const TYPES = {
  person: { label: 'Person', plural: 'People', cadence: 7, life: 'Perennial: grows in seasons, no end date' },
  project: { label: 'Project', plural: 'Projects', cadence: 14, life: 'Annual: has a target, ends in the garden' },
  initiative: { label: 'Initiative', plural: 'Initiatives', cadence: 14, life: 'Annual: has a target, ends in the garden' }
};
export const CADENCES = [[7, 'Weekly'], [14, 'Fortnightly'], [30, 'Monthly']];
export const cadenceName = n => (CADENCES.find(c => c[0] === n) || [, `Every ${n} days`])[1];
export const isPerennial = p => p.type === 'person';

// ---- dates: plain YYYY-MM-DD strings, days counted in Amsterdam ----
const day = s => new Date(s + 'T12:00:00Z');
export const daysBetween = (a, b) => Math.round((day(b) - day(a)) / 86400000);
export const addDays = (s, n) => { const d = day(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(day(s)) && day(s).toISOString().slice(0, 10) === s;
const amsterdam = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Amsterdam', year: 'numeric', month: '2-digit', day: '2-digit' });
export const amsterdamDay = (now = new Date()) => amsterdam.format(now);
// The Monday of the week a day is in, and the next one after it.
export const mondayOf = s => addDays(s, -((day(s).getUTCDay() + 6) % 7));
export const nextMonday = s => addDays(mondayOf(s), 7);

// ---- health ----
export const placeOf = p => p.place || 'greenhouse';
// Any attention counts as a check-in: a check-in (with or without a note), a
// branch update, a follow-up added or ticked off, or a milestone ticked ('need'
// is the special need, marked met before it was taken out on 12 Oct 2026).
// Looking at the page alone does not.
export const CARE = new Set(['checkin', 'need', 'todo', 'milestone']);
export function lastCare(p) {
  return [
    ...(p.log || []).filter(e => CARE.has(e.kind)).map(e => e.date),
    ...(p.work || []).flatMap(w => w.updates.map(u => u.date)),
    ...(p.todos || []).map(t => t.added)
  ].sort().at(-1);
}
// The day the cadence clock runs from: planting, the last attention, or a revive.
export const careDate = p => [p.planted, lastCare(p), ...(p.log || []).filter(e => e.kind === 'revive').map(e => e.date)].filter(Boolean).sort().at(-1);
export const ratio = (p, today) => daysBetween(careDate(p), today) / p.cadence;
export function health(p, today) {
  const place = placeOf(p);
  if (place === 'shed') return 'dormant';
  if (place === 'garden') return 'done';
  if (place === 'idea') return 'idea';
  const r = ratio(p, today);
  return r <= 0.5 ? 'thriving' : r <= 1 ? 'fine' : r <= 1.5 ? 'thirsty' : 'wilting';
}
export const RANK = { wilting: 0, thirsty: 1, fine: 2, thriving: 3 };
