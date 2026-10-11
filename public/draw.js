// The pictures drawn in the page: each plant in its own little piece of Velune,
// the seed packets for ideas, and the garden scene. Until build step 3 these
// drawings are the pictures; after that they stand in while OpenAI's load.
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let uid = 0;
function rng(str) {
  let h = 1779033703 ^ str.length;
  for (const c of str) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
export function alienSVG(sp, st, hp) {
  const id = 'g' + (++uid);
  const r = rng(sp.name);
  const [sat, lit, glow] = { thriving: [88, 62, 1], fine: [64, 56, .65], thirsty: [34, 50, .35], wilting: [12, 42, .12], dormant: [20, 36, .2] }[hp] || [64, 56, .6];
  const hue = sp.hue;
  const main = `hsl(${hue} ${sat}% ${lit}%)`, light = `hsl(${hue} ${Math.min(100, sat + 8)}% ${Math.min(92, lit + 22)}%)`, deep = `hsl(${hue} ${Math.round(sat * .7)}% ${Math.max(14, lit - 26)}%)`;
  const droop = { thriving: 0, fine: 4, thirsty: 14, wilting: 36 }[hp] || 0;
  let back = '', front = '';
  const ground = `<ellipse cx="50" cy="111" rx="36" ry="5.5" fill="#2a2142"/><ellipse cx="50" cy="110" rx="30" ry="3.5" fill="none" stroke="hsl(${hue} 70% 65% / ${(.15 + glow * .25).toFixed(2)})" stroke-width="1"/>`;
  if (hp === 'dormant') {
    front = `<ellipse cx="50" cy="106" rx="7" ry="5.5" fill="${deep}"/><ellipse cx="48" cy="104.5" rx="2.5" ry="1.5" fill="${main}" opacity=".7"/><text x="62" y="92" fill="#ffffff70" style="font:600 10px var(--font-mono)">z</text><text x="69" y="83" fill="#ffffff55" style="font:600 8px var(--font-mono)">z</text>`;
    return `<svg viewBox="0 0 100 120" aria-hidden="true">${ground}${front}</svg>`;
  }
  if (st === 0) {
    back = `<circle cx="50" cy="105" r="10" fill="${main}" opacity="${.35 * glow + .1}"/>`;
    front = `<ellipse cx="50" cy="106" rx="4.5" ry="6" fill="${main}"/><path d="M50 100 q2 -5 5 -6" stroke="${light}" stroke-width="1.5" fill="none" stroke-linecap="round"/>`;
  } else if (sp.form === 'spire') {
    const n = [0, 1, 2, 3, 5, 7][st];
    for (let i = 0; i < n; i++) {
      const off = i - (n - 1) / 2;
      const ang = off * (13 + r() * 8) + (off === 0 ? droop * .4 : Math.sign(off) * droop * .8);
      const h = (16 + st * 13) * (off === 0 ? 1 : .5 + .4 * r());
      const w = 3.5 + st * .7, bx = 50 + off * 3;
      const shard = `<path d="M${bx - w} 109 L${bx} ${109 - h} L${bx + w} 109Z" transform="rotate(${ang} ${bx} 109)"`;
      back += `${shard} fill="${main}" opacity="${glow * .9}"/>`;
      front += `${shard} fill="${main}" fill-opacity=".85" stroke="${light}" stroke-width=".8"/><line x1="${bx}" y1="109" x2="${bx}" y2="${109 - h * .85}" stroke="${light}" stroke-width=".7" opacity=".7" transform="rotate(${ang} ${bx} 109)"/>`;
    }
    if (hp === 'wilting') front += `<path d="M64 109 L80 106 L66 104Z" fill="${deep}"/>`;
  } else if (sp.form === 'orb') {
    const h = 16 + st * 12, tip = [50 + droop * .9, 109 - h + droop * .5];
    front += `<path d="M50 109 Q${46 + r() * 8} ${109 - h / 2} ${tip[0]} ${tip[1]}" stroke="${deep}" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
    const orbs = [];
    for (let i = 0; i < st; i++) {
      const t = (i + 1) / (st + .6), side = i % 2 ? -1 : 1;
      const x = 50 + (tip[0] - 50) * t, y = 109 - (109 - tip[1]) * t;
      const ox = x + side * (7 + r() * 6), oy = y - 3 - r() * 4 + droop * .3;
      const rad = (i === st - 1 ? 5 + st * .5 : 2.8 + r() * 2) * (hp === 'wilting' ? .7 : 1);
      front += `<path d="M${x} ${y} Q${(x + ox) / 2} ${oy - 4} ${ox} ${oy}" stroke="${deep}" stroke-width="1.4" fill="none"/>`;
      orbs.push([ox, oy, rad]);
    }
    for (const [x, y, rad] of orbs) { back += `<circle cx="${x}" cy="${y}" r="${rad * 2.2}" fill="${main}" opacity="${glow * .55}"/>`; front += `<circle cx="${x}" cy="${y}" r="${rad}" fill="${main}"/><circle cx="${x - rad * .3}" cy="${y - rad * .3}" r="${rad * .35}" fill="${light}"/>`; }
    if (hp === 'wilting') front += `<circle cx="70" cy="108" r="2.6" fill="${deep}"/>`;
  } else if (sp.form === 'tendril') {
    const n = st + 1;
    for (let i = 0; i < n; i++) {
      const off = i - (n - 1) / 2, dir = off === 0 ? (r() > .5 ? 1 : -1) : Math.sign(off);
      const bx = 50 + off * 4, h = (14 + st * 11) * (.6 + .4 * r());
      const ex = bx + dir * (6 + r() * 8) + dir * droop * .5, ey = 109 - h + droop * (.4 + r() * .4);
      const d = `M${bx} 109 C${bx - dir * 6} ${109 - h * .45} ${ex - dir * 10} ${ey + 4 - droop * .3} ${ex} ${ey}`;
      back += `<path d="${d}" stroke="${main}" stroke-width="5" fill="none" opacity="${glow * .5}" stroke-linecap="round"/>`;
      front += `<path d="${d}" stroke="${main}" stroke-width="2.3" fill="none" stroke-linecap="round"/><path d="M${ex} ${ey} a3 3 0 1 ${dir > 0 ? 1 : 0} ${dir * 4} 2" stroke="${light}" stroke-width="1.6" fill="none" stroke-linecap="round"/><circle cx="${ex}" cy="${ey}" r="1.6" fill="${light}"/>`;
    }
    if (hp === 'wilting') front += `<path d="M30 109 q6 -3 10 0" stroke="${deep}" stroke-width="2" fill="none"/>`;
  } else if (sp.form === 'cap') {
    const h = 14 + st * 12;
    front += `<path d="M47 109 Q49 ${109 - h / 2} 48.5 ${109 - h} L51.5 ${109 - h} Q51 ${109 - h / 2} 53 109Z" fill="${deep}"/>`;
    for (let i = 0; i < st; i++) {
      const y = 109 - h + i * (h / (st + .5)) + 2, rw = 8 + i * 4 + st * .8, tilt = (i % 2 ? -1 : 1) * droop * .6;
      const cap = `<path d="M${50 - rw} ${y} Q50 ${y - rw * .9} ${50 + rw} ${y}Z" transform="rotate(${tilt} 50 ${y})"`;
      back += `${cap} fill="${main}" opacity="${glow * .6}"/>`;
      front += `${cap} fill="${main}"/><circle cx="${50 - rw * .35}" cy="${y - rw * .32}" r="1.3" fill="${light}" transform="rotate(${tilt} 50 ${y})"/><circle cx="${50 + rw * .3}" cy="${y - rw * .4}" r="1" fill="${light}" transform="rotate(${tilt} 50 ${y})"/>`;
    }
    if (hp === 'wilting') front += `<path d="M66 109 Q72 103 78 109Z" fill="${deep}"/>`;
  } else if (sp.form === 'star') {
    const h = 18 + st * 10, cx = 50 + droop * .8, cy = 109 - h + droop * .6;
    front += `<path d="M50 109 Q46 ${109 - h / 2} ${cx} ${cy}" stroke="${deep}" stroke-width="2.4" fill="none" stroke-linecap="round"/>`;
    front += `<path d="M50 ${100 - st} q-9 -2 -12 -8 q8 0 12 8Z" fill="${deep}"/><path d="M50 ${96 - st * 2} q9 -2 12 -8 q-8 0 -12 8Z" fill="${deep}"/>`;
    if (st < 3) { back += `<circle cx="${cx}" cy="${cy}" r="8" fill="${main}" opacity="${glow * .5}"/>`; front += `<ellipse cx="${cx}" cy="${cy}" rx="3.5" ry="5.5" fill="${main}"/>`; }
    else {
      const n = 4 + st, len = 6 + st * 2.2;
      for (let i = 0; i < n; i++) {
        const ray = `<ellipse cx="${cx}" cy="${cy - len / 2}" rx="${1.6 + st * .25}" ry="${len / 2}" transform="rotate(${i * 360 / n + droop} ${cx} ${cy})"`;
        back += `${ray} fill="${main}" opacity="${glow * .7}"/>`;
        front += `${ray} fill="${main}"/>`;
      }
      front += `<circle cx="${cx}" cy="${cy}" r="${2.5 + st * .5}" fill="${light}"/>`;
    }
  }
  if (st === 5 && (hp === 'thriving' || hp === 'fine')) {
    for (let i = 0; i < 4; i++) { const x = 22 + r() * 56, y = 18 + r() * 40, s = 1.5 + r() * 1.8; front += `<path d="M${x} ${y - s * 2} L${x + s * .5} ${y - s * .5} L${x + s * 2} ${y} L${x + s * .5} ${y + s * .5} L${x} ${y + s * 2} L${x - s * .5} ${y + s * .5} L${x - s * 2} ${y} L${x - s * .5} ${y - s * .5}Z" fill="${light}" opacity=".85"/>`; }
  }
  if (hp === 'wilting' || hp === 'thirsty') front += `<circle cx="36" cy="109" r="1" fill="${deep}"/><circle cx="62" cy="110" r="1.2" fill="${deep}"/>`;
  return `<svg viewBox="0 0 100 120" aria-hidden="true"><defs><filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.5"/></filter></defs>${ground}<g filter="url(#${id})">${back}</g>${front}</svg>`;
}
export const TYPE_HUE = { person: 45, project: 200, initiative: 280 };
export function packetSVG(type) {
  const hue = TYPE_HUE[type];
  return `<svg viewBox="0 0 100 120" aria-hidden="true"><ellipse cx="50" cy="111" rx="30" ry="4.5" fill="#2a2142"/>
    <g transform="rotate(-6 50 70)"><rect x="29" y="34" width="42" height="70" rx="3" fill="hsl(40 35% 84%)"/><rect x="29" y="34" width="42" height="18" rx="3" fill="hsl(${hue} 55% 52%)"/>
    <path d="M29 50 L71 50" stroke="hsl(40 20% 60%)" stroke-dasharray="2 2"/><circle cx="50" cy="76" r="9" fill="hsl(${hue} 55% 52%)" opacity=".85"/>
    <ellipse cx="47" cy="76" rx="2" ry="3" fill="hsl(40 35% 90%)"/><ellipse cx="53" cy="75" rx="2" ry="3" fill="hsl(40 35% 90%)"/><rect x="36" y="92" width="28" height="3" rx="1.5" fill="hsl(40 15% 65%)"/></g></svg>`;
}
export const packet = p => `<div class="terra" style="--h:${TYPE_HUE[p.type]}">${packetSVG(p.type)}</div>`;
// Each species has a home world painted once (from build step 3 by OpenAI, at planting); the weekly plant is painted on top of it.
const WORLDS = new Map();
// Every species comes from one world, Velune, so they can all stand in the same garden.
// Same night sky everywhere (the ringed giant Hesper and the small moon Pell); the ground is the species' biome.
export const LOOK = {
  spire:   { name: 'Glass Dunes',   ground: 'hsl(36 32% 21%)',  far: 'hsl(36 25% 15%)',  haze: 'hsl(38 60% 40% / .30)', horizon: 'M0 78 Q25 70 50 76 T100 72 V100 H0Z' },
  star:    { name: 'Petal Steppe',  ground: 'hsl(300 26% 19%)', far: 'hsl(290 22% 14%)', haze: 'hsl(310 55% 45% / .28)', horizon: 'M0 82 Q30 72 55 78 T100 74 V100 H0Z' },
  tendril: { name: 'Tide Marsh',    ground: 'hsl(192 45% 15%)', far: 'hsl(200 35% 11%)', haze: 'hsl(180 60% 40% / .30)', horizon: 'M0 80 H100 V100 H0Z' },
  cap:     { name: 'Rust Flats',    ground: 'hsl(16 38% 16%)',  far: 'hsl(14 28% 12%)',  haze: 'hsl(20 60% 40% / .26)', horizon: 'M0 76 L30 74 L60 78 L100 72 V100 H0Z' },
  orb:     { name: 'Ember Hollows', ground: 'hsl(330 22% 10%)', far: 'hsl(330 18% 8%)',  haze: 'hsl(340 60% 40% / .24)', horizon: 'M0 72 Q20 64 35 73 T70 69 T100 74 V100 H0Z' }
};
export const biomeOf = sp => LOOK[sp.form] || LOOK.tendril;
export function world(sp) {
  const key = sp.name + '|' + sp.origin;
  if (WORLDS.has(key)) return WORLDS.get(key);
  const r = rng(sp.origin || sp.name), b = biomeOf(sp), k = sp.form;
  // Hesper and Pell sit roughly where they sit in the garden sky, nudged a little per plant.
  const hx = 72 + r() * 14, hy = 47 + r() * 5, px = 12 + r() * 14, py = 46 + r() * 8;
  const moons = `<circle cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" r="7" fill="url(#hesper)"/><ellipse cx="${hx.toFixed(1)}" cy="${hy.toFixed(1)}" rx="13" ry="2.4" fill="none" stroke="hsl(40 70% 78% / .6)" stroke-width="1" transform="rotate(-16 ${hx.toFixed(1)} ${hy.toFixed(1)})"/><circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="2.6" fill="#d4dbff" opacity=".85"/>`;
  let stars = ''; for (let i = 0; i < 22; i++) stars += `<circle cx="${(r() * 100).toFixed(1)}" cy="${(4 + r() * 66).toFixed(1)}" r="${(.3 + r() * .7).toFixed(2)}" fill="#fff" opacity="${(.3 + r() * .6).toFixed(2)}"/>`;
  const detail = k === 'tendril' ? `<path d="M0 85 H100" stroke="hsl(180 60% 55% / .35)" stroke-width="1"/><path d="M10 91 H40 M60 95 H90" stroke="hsl(180 60% 65% / .25)" stroke-width="1"/>`
    : k === 'orb' ? `<path d="M0 0 L12 30 L20 0Z M80 0 L88 26 L96 0Z M40 0 L44 14 L48 0Z" fill="hsl(330 18% 9%)"/>`
    : k === 'spire' ? `<path d="M55 78 L62 60 L69 78Z M75 76 L79 66 L83 76Z M12 77 L16 68 L20 77Z" fill="hsl(190 40% 55% / .25)"/>`
    : k === 'star' ? `<circle cx="18" cy="86" r="1.2" fill="hsl(320 70% 70% / .6)"/><circle cx="74" cy="90" r="1.4" fill="hsl(280 70% 75% / .5)"/><circle cx="88" cy="84" r="1" fill="hsl(330 70% 75% / .6)"/>`
    : k === 'cap' ? `<path d="M0 80 L100 76" stroke="hsl(18 45% 24%)" stroke-width="1"/><circle cx="78" cy="79" r="3" fill="hsl(18 45% 24%)"/>` : '';
  const id = 'w' + (++uid);
  const svg = `<svg class="world" viewBox="0 0 100 100" preserveAspectRatio="xMidYMax slice" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0820"/><stop offset=".65" stop-color="#1b1440"/><stop offset="1" stop-color="#2b1d4f"/></linearGradient><radialGradient id="${id}h" cx=".5" cy="1" r=".7"><stop offset="0" stop-color="${b.haze}"/><stop offset="1" stop-color="transparent"/></radialGradient></defs><rect width="100" height="100" fill="url(#${id})"/><rect y="50" width="100" height="40" fill="url(#${id}h)"/>${stars}${moons}<path d="M0 74 Q30 66 60 72 T100 68 V100 H0Z" fill="${b.far}"/>${detail}<path d="${b.horizon}" fill="${b.ground}"/></svg>`;
  WORLDS.set(key, svg); return svg;
}
export const terra = (sp, st, hp, extra = '', cls = '') => `<div class="terra ${cls}" style="--h:${sp.hue}">${world(sp)}${alienSVG(sp, st, hp)}${extra}</div>`;
export const VEIL = (big = '✦ New growth', small = 'open to reveal', more = '') => `<div class="veil"><b>${big}</b><small>${small}</small>${more}</div>`;
// The plant's current picture, veiled while this Monday's picture is unopened.
export const pic = (p, st, hp, extra = '') => (p.unseen ? terra(p.species, st, hp, VEIL() + extra, 'veiled') : terra(p.species, st, hp, extra, p.justRevealed ? 'revealed' : ''));

// The garden is Velune itself: its five biomes side by side, each finished plant standing in its own biome.
// From build step 3 Gemini turns the composed picture into a looping clip; until then the page animates it.
export const ZONES = ['spire', 'star', 'tendril', 'cap', 'orb'];

// Every finished plant in its biome (a 200-wide band of a 1000-wide scene, in ZONES order,
// the same order as the painted landscape), the back row at backBase, the front at frontBase.
function plantsIn(done, r, backBase, frontBase) {
  const zoneOf = p => Math.max(0, ZONES.indexOf(p.species.form));
  const perZone = {};
  const slots = done.map(p => {
    const z = zoneOf(p), k = (perZone[z] = (perZone[z] || 0) + 1) - 1;
    const back = k % 2 === 1, s = back ? .78 : 1.04;
    const x = z * 200 + 100 + (k === 0 ? 0 : (k % 2 ? -1 : 1) * (58 + 20 * Math.floor(k / 2))) + (r() - .5) * 16, base = back ? backBase : frontBase;
    return { p, back, s, x, base };
  }).sort((a, b) => (a.back === b.back ? 0 : a.back ? -1 : 1));
  return slots.map(({ p, s, x, base }, i) => {
    const [st, hp] = p.history.at(-1);
    const w = 118 * s, hh = 142 * s;
    const svg = alienSVG(p.species, st, hp).replace('<svg viewBox', `<svg x="${(x - w / 2).toFixed(1)}" y="${(base - hh + 6).toFixed(1)}" width="${w.toFixed(1)}" height="${hh.toFixed(1)}" viewBox`);
    return `<g class="gplant" data-gplant="${p.id}" tabindex="0" role="button" aria-label="${esc(p.name)}: ${esc(p.done.note)}"><title>${esc(p.name)} · ${esc(p.done.note)}</title><g class="sway" style="animation-delay:-${(i * 1.7).toFixed(1)}s;animation-duration:${(5.5 + (i % 3)).toFixed(1)}s">${svg}</g>
      <text x="${x.toFixed(1)}" y="${(base + 14).toFixed(1)}" text-anchor="middle" fill="#ffffffd0" style="font:600 ${s > 1 ? 13 : 11}px var(--font-body);paint-order:stroke;stroke:#0b0916a0;stroke-width:3px">${esc(p.name)}</text></g>`;
  }).join('');
}

// The finished plants alone, to stand on the painted landscape (the Garden page's wallpaper).
export function gardenPlants(done) {
  return `<svg class="plants-layer alive" viewBox="0 0 1000 230" preserveAspectRatio="xMidYMax meet" role="img" aria-label="Your garden on Velune, ${done.length} finished plant${done.length > 1 ? 's' : ''}">${plantsIn(done, rng('the garden'), 168, 212)}</svg>`;
}
export function gardenScene(done) {
  const r = rng('the garden');
  let stars = '';
  for (let i = 0; i < 80; i++) stars += `<circle class="${i % 5 === 0 ? 'tw' : ''}" style="animation-delay:${(r() * 6).toFixed(1)}s" cx="${(r() * 1000).toFixed(1)}" cy="${(r() * 270).toFixed(1)}" r="${(.4 + r() * 1.1).toFixed(2)}" fill="#fff" opacity="${(.25 + r() * .7).toFixed(2)}"/>`;
  let flies = '';
  for (let i = 0; i < 16; i++) { const x = 40 + r() * 920, y = 250 + r() * 120, hue = 80 + r() * 100; flies += `<g class="fly" style="animation-delay:-${(r() * 12).toFixed(1)}s;animation-duration:${(9 + r() * 8).toFixed(1)}s"><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="5" fill="hsl(${hue} 90% 70%)" opacity=".12"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="1.3" fill="hsl(${hue} 90% 80%)" opacity=".9"/></g>`; }
  // ground: each biome a 200-wide band, blended into its neighbours
  const stops = ZONES.map((z, i) => `<stop offset="${(i * .2 + .1).toFixed(2)}" stop-color="${LOOK[z].ground}"/>`).join('');
  const farStops = ZONES.map((z, i) => `<stop offset="${(i * .2 + .1).toFixed(2)}" stop-color="${LOOK[z].far}"/>`).join('');
  const hazes = ZONES.map((z, i) => `<ellipse cx="${i * 200 + 100}" cy="320" rx="150" ry="70" fill="${LOOK[z].haze}"/>`).join('');
  const labels = ZONES.map((z, i) => `<text x="${i * 200 + 100}" y="300" text-anchor="middle" fill="#ffffff38" style="font:600 10px var(--font-body);letter-spacing:.14em">${LOOK[z].name.toUpperCase()}</text>`).join('');
  const plantsSVG = plantsIn(done, r, 340, 392);
  return `<svg class="scene alive" viewBox="0 0 1000 420" role="img" aria-label="Your garden on Velune, ${done.length} finished plants">
    <defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0b0820"/><stop offset=".6" stop-color="#1b1440"/><stop offset="1" stop-color="#2b1d4f"/></linearGradient>
      <linearGradient id="gfar" x1="0" y1="0" x2="1" y2="0">${farStops}</linearGradient>
      <linearGradient id="gnear" x1="0" y1="0" x2="1" y2="0">${stops}</linearGradient>
    </defs>
    <rect width="1000" height="420" fill="url(#sky)"/>${stars}
    <g class="hesper"><circle cx="820" cy="92" r="46" fill="url(#hesper)"/>
    <ellipse cx="820" cy="92" rx="84" ry="15" fill="none" stroke="hsl(40 70% 78% / .65)" stroke-width="3" transform="rotate(-16 820 92)"/></g>
    <circle cx="150" cy="70" r="15" fill="#d4dbff" opacity=".85"/><circle cx="144" cy="66" r="3" fill="#b8c0ea"/>
    ${hazes}
    <path d="M0 300 Q120 248 250 284 T520 272 T800 290 T1000 266 V420 H0Z" fill="url(#gfar)"/>
    <g class="mist"><path d="M-200 318 Q0 300 200 316 T600 312 T1000 318 T1400 312 V336 H-200Z" fill="#ffffff0d"/></g>
    <path d="M0 336 Q150 302 320 328 T650 318 T1000 326 V420 H0Z" fill="url(#gnear)"/>
    <path d="M520 420 Q560 386 505 362 T540 330" fill="none" stroke="hsl(185 55% 65% / .22)" stroke-width="22" stroke-linecap="round"/>
    ${labels}${flies}${plantsSVG}
  </svg>`;
}
