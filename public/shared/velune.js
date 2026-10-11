// Velune: the one world every species comes from, so all plants can stand in
// the same garden. A night world under the ringed giant Hesper and the small
// moon Pell, with five biomes, one per plant shape.
export const BIOMES = {
  spire: 'Glass Dunes',
  star: 'Petal Steppe',
  tendril: 'Tide Marsh',
  cap: 'Rust Flats',
  orb: 'Ember Hollows'
};
export const FORMS = Object.keys(BIOMES);

const S = (name, origin, form, hue, lore, fits) => ({ name, origin, form, hue, lore, fits });

// The species to choose from until AI planting arrives (build step 2); after
// that the AI writes a new one for each plant, from the same world.
export const CATALOGUE = [
  S('Heliarch Spire', 'Sunward ridge of the Glass Dunes', 'spire', 45, 'A crystal that grows toward whichever moon burns brighter. When a younger spire sprouts beside it, the Heliarch steps aside and lets the light through, on purpose.', 'Someone you are growing into your successor.'),
  S('Lattice Fern', 'Mist pools of the Tide Marsh', 'tendril', 175, 'Its fronds knot into scaffolds other plants climb. Left without anything to build, it coils in on itself and goes quiet.', 'A builder who is happiest designing structure for others.'),
  S('Thornbloom of Vesh', 'Storm edge of the Petal Steppe', 'star', 320, 'It only flowers after it has grown its first thorns. Steppe gardeners say a Thornbloom without thorns is a pretty weed the wind will flatten.', 'Someone learning to say no and still be liked for it.'),
  S('Ember Moss', 'Deep vents of the Ember Hollows', 'orb', 22, 'Glows from the inside and goes dark in cold silence long before anything shows on the outside. Warm it early and it lights a whole cave.', 'Someone whose energy drops quietly before it shows.'),
  S('Tidecaller Kelp', 'Open channels of the Tide Marsh', 'tendril', 205, 'Migrates between two waters with the great tide. It has to let go of the old reef completely before it can root in the new one; half-rooted kelp drowns.', 'A migration where both systems run until the old one is let go.'),
  S('Almanac Bloom', 'Clock circles of the Petal Steppe', 'star', 270, 'Opens one petal for every decision made. If the season turns while it is still deciding, it closes for good and seeds next year instead.', 'A short planning push that must end in decisions.'),
  S('Ironcap Mycelium', 'Under the Rust Flats', 'cap', 18, 'Trades nutrients through its roots with every neighbour, but only at a fair rate. Offered a bad trade, it simply grows toward someone else.', 'A negotiation that needs a real alternative.'),
  S('Beacon Orb', 'Mouth of the Ember Hollows', 'orb', 190, 'In permanent night it pulses light across the plains to call pollinators from far away. The steadier the pulse, the more arrive.', 'Recruiting, where steady signal brings people in.'),
  S('Stratacrystal', 'Ice seams beneath the Glass Dunes', 'spire', 200, 'Grows in clear layers, one per long winter. A layer only sets if many hands warm the ice at once; one gardener alone just makes slush.', 'Slow, structural work that needs many people to agree.'),
  S('Quietleaf', 'Still backwaters of the Tide Marsh', 'tendril', 130, 'Unfurls only in silence. One gong across the valley and every Quietleaf rolls shut for a day.', 'Protecting focus time from meetings.'),
  S('Twinseed', 'Paired caves of the Ember Hollows', 'orb', 330, 'Its seeds only sprout in pairs; a lone Twinseed waits, unbothered, for years.', 'Pairing people across teams.'),
  S('Fossil Fern', 'Dry beds at the edge of the Tide Marsh', 'tendril', 35, 'Half stone already. It waits until the last living root lets go, then turns fully to rock.', 'Switching off something people still lean on.'),
  S('Watchlight Cactus', 'Night posts of the Glass Dunes', 'spire', 15, 'Keeps a single lamp lit through the night so the rest of the dunes can sleep.', 'Making on-call bearable.'),
  S('Migrant Lantern', 'Drifting between the Ember Hollows', 'orb', 48, 'Blooms brightest just before it lifts off and drifts to a new hollow, carrying its light with it.', 'Someone you grow until they outgrow your team.'),
  S('Ledgerroot', 'Salt crust of the Rust Flats', 'cap', 105, 'Stores every drop of water it finds in a careful ring, and shares the surplus in dry years.', 'Finding savings without breaking things.'),
  S('Riverglass Reed', 'Frozen inlets of the Tide Marsh', 'tendril', 185, 'Carries messages along the ice in pulses of light, and never drops one.', 'Moving something critical without losing a piece.'),
  S('Comet Sapling', 'Where comets fall on the Petal Steppe', 'star', 285, 'Grows fastest when it is flung far from home, and leaves a bright trail behind.', 'Someone ready for a bigger orbit.'),
  S('Quorum Bloom', 'Meeting rings of the Rust Flats', 'cap', 300, 'Opens only when every plant around it leans the same way.', 'Getting a team to agree on how it works.'),
  S('Graftling of Orun', 'Orchard banks of the Tide Marsh', 'tendril', 150, 'Grafted from one great tree onto another. For a season it keeps its old bark while new roots find the soil; if nobody binds the graft, it slips.', 'Someone joining your team from another one.'),
  S("Wanderer's Lumen", 'Drifting over the Ember Hollows', 'orb', 210, 'A seed that drifts from hollow to hollow and only roots where the soil answers back. It tests the ground a few times, then decides to stay or drift on.', 'A new person deciding whether this team is home.'),
  S('Firstlight Sprig', 'Dawn terraces of the Petal Steppe', 'star', 55, 'Opens one petal for each small thing it does on its own, and closes them again if every move is made for it.', 'Building independence step by step.'),
  S('Molting Starling Reed', 'Wind cliffs above the Tide Marsh', 'tendril', 95, 'Spends years as a reed that hums in the wind, then one spring sheds its outer stalk and opens wings of leaf. Forced early, it tears; ignored, it stays a reed.', 'Someone testing whether a new role is for them.'),
  S('Twinlight Orchid', 'Twin-moon dusk on the Petal Steppe', 'star', 330, 'Blooms in two colours, one for each moon. Gardeners leave it to choose which moon to follow.', 'Someone choosing between two paths.'),
  S('Glowcap', 'Spore groves of the Rust Flats', 'cap', 140, 'Lights up the spore haze around it, and the brighter it glows the more small caps sprout in its ring.', 'Work that spreads once a few people pick it up.')
];

// A species as the Worker accepts it: from Velune, with a shape it can draw.
export function cleanSpecies(sp) {
  if (!sp || typeof sp !== 'object') return null;
  const str = (v, n) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
  const out = { name: str(sp.name, 60), origin: str(sp.origin, 80), form: sp.form, hue: Math.round(Number(sp.hue)), lore: str(sp.lore, 600), fits: str(sp.fits, 160) };
  if (!out.name || !FORMS.includes(out.form) || !(out.hue >= 0 && out.hue <= 360)) return null;
  return out;
}
