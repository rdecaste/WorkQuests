import { test } from 'node:test';
import assert from 'node:assert/strict';
import { health, careDate, daysBetween, addDays, isDate, mondayOf, nextMonday, amsterdamDay, cadenceName } from '../public/shared/rules.js';

const plant = (extra = {}) => ({ place: 'greenhouse', planted: '2026-09-01', cadence: 7, log: [], work: [], todos: [], ...extra });

test('health follows the cadence: half, one, one and a half', () => {
  const p = plant({ log: [{ kind: 'checkin', date: '2026-10-01' }] });
  assert.equal(health(p, '2026-10-04'), 'thriving');
  assert.equal(health(p, '2026-10-08'), 'fine');
  assert.equal(health(p, '2026-10-11'), 'thirsty');
  assert.equal(health(p, '2026-10-12'), 'wilting');
});

test('any attention counts; markers do not', () => {
  const base = plant({ log: [{ kind: 'park', date: '2026-10-10' }, { kind: 'cadence', date: '2026-10-10' }] });
  assert.equal(careDate(base), '2026-09-01');
  for (const extra of [{ log: [{ kind: 'need', date: '2026-10-10' }] }, { log: [{ kind: 'todo', date: '2026-10-10' }] }, { log: [{ kind: 'milestone', date: '2026-10-10' }] },
    { work: [{ updates: [{ date: '2026-10-10' }] }] }, { todos: [{ added: '2026-10-10' }] }, { log: [{ kind: 'revive', date: '2026-10-10' }] }]) {
    assert.equal(careDate(plant(extra)), '2026-10-10', JSON.stringify(extra));
  }
});

test('places that never wilt', () => {
  assert.equal(health(plant({ place: 'shed' }), '2027-01-01'), 'dormant');
  assert.equal(health(plant({ place: 'garden' }), '2027-01-01'), 'done');
});

test('dates', () => {
  assert.equal(daysBetween('2026-10-01', '2026-10-11'), 10);
  assert.equal(addDays('2026-10-30', 3), '2026-11-02');
  assert.ok(isDate('2026-02-28') && !isDate('2026-02-30') && !isDate('11-10-2026'));
  assert.equal(mondayOf('2026-10-11'), '2026-10-05');
  assert.equal(nextMonday('2026-10-11'), '2026-10-12');
  assert.equal(nextMonday('2026-10-12'), '2026-10-19');
  assert.equal(amsterdamDay(new Date('2026-10-10T22:30:00Z')), '2026-10-11');
  assert.equal(cadenceName(14), 'Fortnightly');
  assert.equal(cadenceName(10), 'Every 10 days');
});
