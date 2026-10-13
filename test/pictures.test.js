import { test } from 'node:test';
import assert from 'node:assert/strict';
import { branchLimbs, limbPrompt, STYLE, MAX_LIMBS } from '../src/pictures.js';

const branch = (id, since, dates = [], ended = null) => ({ id, title: 'Never sent ' + id, since, ended, updates: dates.map(date => ({ date, text: 'secret note ' + id })) });

test('a new branch shows up the Monday after as a bud, then grows with the weeks it is updated', () => {
  const w = [branch('a', '2026-10-15')];
  assert.deepEqual(branchLimbs(w, '2026-10-12'), []);
  assert.deepEqual(branchLimbs(w, '2026-10-19'), [{ id: 'a', size: 0, state: 'growing' }]);
  w[0].updates.push({ date: '2026-10-20' }, { date: '2026-10-22' }); // one week, twice
  assert.equal(branchLimbs(w, '2026-10-26')[0].size, 1);
  w[0].updates.push({ date: '2026-10-28' });
  assert.equal(branchLimbs(w, '2026-11-02')[0].size, 2);
  for (const d of ['2026-11-03', '2026-11-10']) w[0].updates.push({ date: d });
  assert.equal(branchLimbs(w, '2026-11-16')[0].size, 3);
  for (const d of ['2026-11-17', '2026-11-24', '2026-12-01', '2026-12-08']) w[0].updates.push({ date: d });
  assert.equal(branchLimbs(w, '2026-12-14')[0].size, 4);
  // an update on the Monday itself waits for next week's picture
  assert.equal(branchLimbs([branch('b', '2026-10-01', ['2026-10-19'])], '2026-10-19')[0].size, 0);
});

test('quiet after three weeks without updates, never smaller; done flowers', () => {
  const w = [branch('a', '2026-09-01', ['2026-09-02', '2026-09-09'])];
  assert.equal(branchLimbs(w, '2026-09-28')[0].state, 'growing'); // 19 days
  assert.deepEqual(branchLimbs(w, '2026-10-05'), [{ id: 'a', size: 2, state: 'quiet' }]); // 26 days, still size 2
  w[0].ended = '2026-10-07';
  assert.deepEqual(branchLimbs(w, '2026-10-12'), [{ id: 'a', size: 2, state: 'done' }]);
});

test('oldest branch lowest; too many limbs drops the branches finished longest ago', () => {
  const w = Array.from({ length: MAX_LIMBS + 2 }, (_, i) => branch('b' + i, `2026-09-0${i < 9 ? i + 1 : 9}`, [], i < 3 ? `2026-09-1${i}` : null));
  const limbs = branchLimbs(w, '2026-10-05');
  assert.equal(limbs.length, MAX_LIMBS);
  assert.deepEqual(limbs.map(l => l.id), ['b2', ...w.slice(3).map(x => x.id)]);
});

test('the prompt carries sizes and states only, never names or notes', () => {
  const w = [branch('a', '2026-09-01', ['2026-09-02', '2026-09-09', '2026-09-16', '2026-09-23']), branch('b', '2026-09-01', ['2026-09-02'], '2026-09-20'), branch('c', '2026-10-01')];
  const text = limbPrompt(branchLimbs(w, '2026-10-05')) + STYLE;
  assert.match(text, /1\. a long leafy branch/);
  assert.match(text, /flowering at its tip/);
  assert.match(text, /3\. a new bud/);
  assert.doesNotMatch(text, /Never sent|secret note/);
  assert.match(STYLE, /hyper-realistic and anime/);
  assert.equal(limbPrompt([]), '');
});
