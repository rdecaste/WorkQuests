// The Monday plant pictures (build step 3): the fixed style and the words for
// a person's branches. Only the Worker uses this; the page never shows sizes
// or steps, so growth stays a surprise.
//
// Like every image prompt here (see src/landscape.js), the text is fixed: a
// branch's name and updates never reach OpenAI, only its size and state.

import { mondayOf, daysBetween } from '../public/shared/rules.js';

// Roy, 13 Oct 2026: "the plant image needs to be between hyper realistic and
// 'anime'".
export const STYLE = 'Style: halfway between hyper-realistic and anime. Realistic textures, light, depth and fine botanical detail, '
  + 'with the clean shapes, crisp outlines and rich, saturated colour of a high-end anime film. Not a photo, not flat cartoon. '
  + 'Night light from the ringed giant Hesper and the small moon Pell, plus the plant\'s own soft glow; '
  + 'camera at plant height, three-quarter view, the plant standing on the ground line. No text, no frame.';

// Every branch is a limb on the plant (Roy, 13 Oct 2026: "every branch should
// be a visual branch the week after ... the bigger the branch the bigger the
// leaf/branch"). Bigger = more weeks with at least one update (his pick).
// Sizes: 0 bud, 1 sprig, 2 branch, 3 leafy branch, 4 bough.
export const SIZE_WEEKS = [0, 1, 2, 4, 8]; // weeks with an update needed for each size
export const QUIET_DAYS = 21;               // untouched this long: pale, curled leaves
export const MAX_LIMBS = 8;

// The limbs for the picture of the given Monday, from the bottom of the stem
// up (oldest branch lowest, so each keeps its place). Only what happened
// before that Monday counts, so a new branch shows up the Monday after.
export function branchLimbs(work, monday) {
  const limbs = (work || []).filter(w => w.since < monday).map(w => {
    const dates = w.updates.map(u => u.date).filter(d => d < monday);
    const weeks = new Set(dates.map(mondayOf)).size;
    const size = SIZE_WEEKS.filter(n => weeks >= n).length - 1;
    const done = !!w.ended && w.ended < monday;
    const last = [w.since, ...dates].sort().at(-1);
    return { id: w.id, size, state: done ? 'done' : daysBetween(last, monday) >= QUIET_DAYS ? 'quiet' : 'growing', ended: done ? w.ended : null };
  });
  // Too many to paint: the branches finished longest ago drop out of the
  // picture (they stay in the data and on the plant page).
  const drop = limbs.filter(l => l.state === 'done').sort((a, b) => (a.ended < b.ended ? -1 : 1)).slice(0, Math.max(0, limbs.length - MAX_LIMBS));
  return limbs.filter(l => !drop.includes(l)).map(({ id, size, state }) => ({ id, size, state }));
}

const SIZE_WORDS = ['a new bud', 'a small sprig with two leaves', 'a slender branch with a few leaves', 'a long leafy branch with broad leaves', 'a thick, full bough'];
const STATE_WORDS = { growing: '', quiet: ', its leaves curled and pale', done: ', flowering at its tip' };

// The prompt lines for the limbs: sizes and states only.
export function limbPrompt(limbs) {
  if (!limbs.length) return '';
  return ['Limbs from the bottom of the stem up:', ...limbs.map((l, i) => `${i + 1}. ${SIZE_WORDS[l.size]}${STATE_WORDS[l.state]}`),
    'Keep every existing limb where it is in the reference picture; add new ones above.'].join('\n');
}
