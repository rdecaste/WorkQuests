// The Monday plant pictures (build step 3): the fixed style and the words for
// a person's branches. Only the Worker uses this; the page never shows sizes
// or steps, so growth stays a surprise.
//
// Like every image prompt here (see src/landscape.js), the text is fixed: a
// branch's name and updates never reach OpenAI, only its size and state.

import { mondayOf, daysBetween } from '../public/shared/rules.js';
import { CATALOGUE } from '../public/shared/velune.js';

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

// ---- The seed picture (✦ Paint its picture, right after planting) ----
// Roy, 13 Oct 2026: "I also want the plant image to be generated once I start a
// plant - there should be a button". Only the seed: what it grows into stays a
// surprise. The words come from the catalogue (public/shared/velune.js) and the
// fixed lines below; a species that is not in the catalogue is painted from its
// shape and colour only, so nothing typed reaches the painter.
const BIOME_LOOK = {
  spire: 'the Glass Dunes: pale gold sand with glints of blue glass',
  star: 'the Petal Steppe: rolling mauve grass with a few drifting glowing petals',
  tendril: 'the Tide Marsh: dark teal shallows with soft light on the water',
  cap: 'the Rust Flats: cracked rust-red crust under a faint spore haze',
  orb: 'the Ember Hollows: near-black rock, a cave mouth glowing warm orange behind'
};
const FORM_HINT = {
  spire: 'a tiny crystal shoot, faceted and translucent',
  star: 'a tiny shoot with two pointed seed leaves',
  tendril: 'a tiny shoot with one curled frond, like a fern unrolling',
  cap: 'a tiny shoot with a rounded cap the size of a fingernail',
  orb: 'a tiny shoot with a small round bud that glows faintly from inside'
};
const HUES = [[15, 'warm red'], [40, 'amber'], [65, 'gold'], [100, 'yellow-green'], [150, 'green'], [190, 'teal'], [215, 'cyan blue'], [255, 'blue'], [290, 'violet'], [335, 'magenta'], [361, 'warm red']];
export const hueWord = h => HUES.find(([max]) => h < max)[1];

export function seedPrompt(species) {
  const sp = species || {};
  const form = BIOME_LOOK[sp.form] ? sp.form : 'tendril';
  const known = CATALOGUE.find(c => c.name === sp.name && c.form === form);
  const hue = known ? known.hue : Number.isFinite(sp.hue) ? sp.hue : 150;
  return [
    `A close, intimate portrait of a single seed that has just sprouted on Velune, an alien night world${known ? `: the very first sprout of the ${known.name}` : ''}.`,
    `The seed sits half in the ground of ${BIOME_LOOK[form]}. From it rises ${FORM_HINT[form]}, glowing softly in ${hueWord(hue)} light.`,
    'It is only a sprout, no taller than a thumb: no stem to speak of, no flowers, no grown plant. Nothing hints at what it will grow into.',
    'The seed and sprout sit in the middle of the frame, in sharp focus; the ground and sky behind fall softly out of focus. No other plants, no creatures, no people.',
    STYLE,
    'Landscape 16:9.'
  ].join('\n');
}
