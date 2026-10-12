# Work Garden: proposal

Draft for Roy's go-ahead, 11 Oct 2026 (seventeenth round: every species
comes from one world, Velune, so all plants fit one landscape, and the garden
is alive, made into a looping clip by Gemini. Fifteenth: Manage is a kanban
board; the Greenhouse can group by cadence; "watering" is called **checking
in** everywhere (Roy: "water Mark" sounds strange). Fourteenth: any attention
counts as a check-in, withering shows, quick find, every species has a home world). Nothing is built yet. Once agreed, this becomes
`docs/work-garden.md` in rdecaste/WorkQuests (description and change log, the
way quest-engine keeps `docs/quest-engine.md`).

Mockup: https://claude.ai/artifact/SwW9r6oQsZKJ7caUzFqnGC

## Conventions borrowed from the quest system

rdecaste/WorkQuests is empty, so this follows rdecaste/quest-engine (Worker +
D1 + Workflows), rdecaste/MainQuest (a card served by a Worker behind
Cloudflare Access) and the new-quest page in rdecaste/journal:

- Plain JavaScript, no build step. `wrangler.jsonc`; `npm test` with
  `node --test`; D1 faked with real SQLite (`test/d1fake.js`, copied).
- Schema as numbered files in `migrations/`, applied before the deploy that
  needs them. The route list sits at the top of `src/index.js`.
- A push to `main` deploys via Workers Builds, tests first.
- Days and Mondays count in Amsterdam time.
- Login by Cloudflare Access on the Worker's Access tab (team
  `billowing-boat-2009.cloudflareaccess.com`).
- AI the way journal's `/quests/new` does it: one OpenAI chat call per
  request with a JSON answer (`chatJson`), a daily cap, `CHAT_MODEL` var.
- Pictures the way quest-engine makes Goku's forms: an image Workflow, one
  step at a time, using the previous picture as the reference (`editImage`)
  so it stays the same plant. `IMAGE_MODEL` var.

**One Worker serves both the page and the API on one address, all behind
Access**, with no CORS (the cards call an open quest-engine; work notes
shouldn't). The Worker also verifies the `Cf-Access-Jwt-Assertion` token and
refuses anything without it.

**Locked-down laptop:** the page loads nothing from other addresses. The
plant pictures are stored in R2 and served by the same Worker, behind
Access. No Cloudinary, no CDN, no web fonts.

## Security: nothing with business impact if it ever leaks

The rule: the app only holds what would be harmless if someone else read it.
Two layers make that hold.

**1. The guard keeps sensitive details out.** `src/guard.js` is one set of
rules used by both the page and the Worker. It flags:

- money amounts (€45k, EUR 20.000, 140k) and prices or rates (a quote "up 18%")
- contract terms (clauses, notice periods, penalties, renewal terms, NDAs)
- pay details (salary, bonus, pay bands)
- health details, and HR or legal cases (sick leave, PIP, grievance, lawyer)
- passwords and keys, emails, phone numbers and bank details
- your own **keep-out words** (customer, supplier or deal names)

It runs as you type: the field turns red with what matched and how to
reword it ("say *higher than planned* instead of the number"). Saving is
blocked until it is reworded; there is no "save anyway". The Worker checks
every write again (entries, plant fields, branches and branch updates, ideas, seasons,
milestones, notes) and refuses it with the field and the reason, so the rule
holds even if the page is bypassed. It also checks the AI's answers before
you see them, and runs before anything is sent to OpenAI, so a flagged line
never leaves. **Every Monday** all stored text is checked again with the
current rules (the keep-out list grows), and anything that matches shows on
Manage under **Needs rewording** until you fix it.

Keep-out words are stored only as fingerprints (a salted hash of the
lower-cased word), and matched by fingerprinting each one-to-three-word run
of what you type, so the list itself gives nothing away. They show masked
("A•••••p").

The guard catches patterns, not meaning: "the supplier wants a lot more"
gets through, and should. It is a net for slips, not a guarantee; what you
choose to write is still the real protection. Names of people are allowed
(people plants need them); first names are enough.

**2. Only you can get in.** Access allows your work email only, with a
24-hour session. The Worker verifies the Access token and that email on
every request, pictures and export included; nothing is public. Nothing
sensitive goes in URLs, and request bodies are never logged. The OpenAI key
is a Worker secret. Backups go to a private R2 bucket.

## Where plants live

A plant is in one of four states. The top bar has three pages: Greenhouse,
Garden and Manage.

| State | What it is | Behaviour |
|---|---|---|
| **Idea** | A seed packet: name, type, one line | No bed, no picture, no check-ins. **✦ Plant** starts AI planting with the idea's line |
| **Growing** (Greenhouse) | Active plants, 8–12 (soft limit 12) | Checked in on, scored and repainted every Monday |
| **Parked** (the shed) | Dormant on purpose | No wilting, no bed, no new pictures. Revive any time |
| **Done** (Garden) | Finished | Static. Its last picture joins the garden scene |

**The garden is Velune itself** (see *One world* below): one wide night
landscape with its five biomes side by side, Glass Dunes, Petal Steppe, Tide
Marsh, Rust Flats and Ember Hollows, and every finished plant standing in its
own biome. It is built from layers so plants never change once they're in:

- the landscape, painted once by OpenAI as a wide panorama (repaintable on
  request);
- each plant's last weekly picture, painted with a transparent background,
  placed in its biome at a fixed spot and size stored with the plant.

**The garden is alive.** Each time a plant moves in, the Worker composes
the new garden picture and Gemini's video model (Veo) turns it into a short
clip that loops without a jump: the camera stays still, the plants sway,
fireflies drift, mist rolls through the marsh, stars twinkle, Hesper's ring
catches the light. The clip starts and ends on the composed picture, so it
loops cleanly and the plants stay where they stand. The page plays it muted
on repeat, with the still picture underneath; tapping a plant still opens
its page (the tap targets sit over the fixed spots). With reduced motion
turned on, on a slow connection, or if a clip fails, the still picture
shows. A new clip is only made when the garden changes, or on request, so
that is a handful a month. What goes to Gemini: the composed picture and a
fixed motion prompt, never plant names or notes. Not yet checked: Gemini's
current model name, clip length and price; I will confirm those before
building this part and tell you the cost. (In the mockup the page animates
the scene itself.)

Below the scene, a short list gives each plant's outcome and dates.

## Types: annuals and perennials

| Type | Life | Default cadence |
|---|---|---|
| Person (reports, coachees) | **Perennial**: grows in seasons, no end date | Weekly |
| Project | **Annual**: goal, target date, milestones; ends in the garden | Fortnightly |
| Initiative | **Annual**, same as a project | Fortnightly |

Cadence presets are Weekly, Fortnightly and Monthly (rare), or any number of
days.

**Suggestion for people: seasons.** A person never "finishes", but a
relationship does move in chapters. So a person plant has seasons, by default
one per quarter and lined up with your review cycle. A season holds what you
want for that person this quarter: an optional **goal** ("Runs the squad's
planning without me in the room") and optional **milestones**, dated steps
toward it ("Runs sprint planning on her own · 30 Oct") that you tick off.
The season card is kept small: a header line (season, end date, days left),
the goal with a ✎ to change it, the why in grey, the milestones, and a footer
with **+ Milestone**, **Earlier seasons** and **✦ Close season** as quiet
links. No bar, no section labels. Projects and initiatives keep their own
goal, target date and milestones.

A season can be **empty**. With no goal, the plan card says so with a **Set a
goal** button; nothing nags, and the plant still grows
from check-ins. At the end of a season, **Close season** has the AI draft a
short review from that season's log and milestones (what grew, what didn't)
and propose the next season's goal, which you can edit or leave blank. Open
milestones move into the next season. Past seasons stay on the plant page as chips. A person
plant only goes to the garden when they move on (**Plant out**: "Moved on to
lead Payments").

**Branches: what a person is working on.** A person plant has
**branches**, one per piece of work, named in your own words ("Icon
migration", "ITCI migration", "TPO ownership"). Each branch has its own
short updates: every branch has its own update box with an **Add** button.
A closed branch shows its latest update; opening it (tap its name) shows the
whole history. **Done** moves the branch to
a "Done" line. Branch updates also appear in the plant's log, marked with the
branch name. It is a note, not an assignment: no links to project plants, no
roles, no due dates. Their Greenhouse tile shows the current branches. In the
Monday picture each current branch is a branch of the plant (named nowhere),
so adding one shows up the next Monday. When planting a person, the AI may
suggest a first few branches from the description.

**Rare edits sit behind a button.** Adding a branch (**+ Branch**), a
milestone (**+ Milestone**) or setting or changing the season goal (**Set a
goal**, **Change**, with **✦ Suggest**) first shows a button; the input box
appears only after tapping it. Frequent things (a branch update, a check-in)
have their boxes always open.

**A check-in is general, with two boxes**: *How are things going?* and
*Next steps / follow-up*, under a heading "Check in with Mark" (people) or
"Check in on Q4 planning" (projects and initiatives). No date picker (the date
is today; a log entry can be fixed later) and no special-need box. Both boxes
may stay empty: tapping **✓ Check in** then records "Checked in, no note", a
one-tap way to say you gave it attention. (The garden words stay for the
plants themselves: thirsty, wilting, growing. Only the action is a check-in.)

**Any attention counts as a check-in.** You may miss a meeting because you or
the person is out of office, but you still visit the plant, and that visit
counts. A plant's *last cared for* date is the newest of: a check-in (with or
without a note), a branch update, a follow-up added or ticked off, a
milestone ticked, or the special need marked met. Health and the Monday score
both use that date. Only looking at the page does not count: it needs one
tap, so an open tab in a meeting never checks in by accident.

**Follow-ups have their own card**, below the check-in, and it is only a list:
each next step written when checking in, with the date it was added and a box
to tick it off, whether it got done or not. Ticked items move to the log.

**The log folds**: it shows the three newest entries, with *Show all* to open
the rest. It folds again when you leave the page. News about a specific piece
of work goes on its branch; "how are things going" is about the person.

## Species, lore and special needs

> **12 Oct 2026: the special need is taken out** (Roy: "remove this special
> needs thing, does not make sense"). Everything below about special needs,
> including the growth point for a need met, no longer applies; see
> `docs/work-garden.md`.

**One world: Velune.** Every species comes from the same planet, so all
plants look like they belong together and can stand in one garden. Velune is
a night world under the ringed giant **Hesper** and the small pale moon
**Pell**, with five biomes, one per plant shape:

| Biome | Shape | Ground and light |
|---|---|---|
| Glass Dunes | spires, crystals | pale gold sand, glints of blue glass |
| Petal Steppe | flowers, stars | mauve grass, scattered glowing petals |
| Tide Marsh | fronds, reeds, kelp | dark teal shallows, light on the water |
| Rust Flats | caps, fungi | rust-red crust, spore haze |
| Ember Hollows | orbs, lanterns | near-black cave mouths, warm glow |

A fixed **style guide** goes into every image prompt, so OpenAI paints all
plants the same way: the same painterly, softly glowing night style, the
same light (Hesper and Pell plus the plant's own glow), the same camera
height and three-quarter angle, the plant standing on the ground line, and a
size class (small, medium, tall) so they keep their scale next to each
other. The first picture of each species becomes its reference image for
later weeks. The AI picks species only from Velune: the prompt lists the
biomes and the style guide, and each answer must name its biome.

When planting, the AI suggests a **species** that fits the context. Each one
has:

- a name and an origin in its biome ("Heliarch Spire, sunward ridge of the
  Glass Dunes"),
- 2–3 sentences of lore,
- what it fits ("someone you are growing into your successor"),
- a **special need** tied to the context: a lore name, what it means at work,
  and the check that says it was met. For Anna: *Open sky*, "room to decide
  things without me in the loop", met when "Anna made a call without me".
  The species card has a **✓ Met this week** button for it.

**✦ Another plant** asks for a new suggestion, on the new-plant page and from
Edit later. The previous suggestions stay one tap back. A species change is
logged.

## Growth and the Monday pictures

Every plant has a **stage** (0 to 5) behind the scenes. It drives the
picture prompt and is never shown: no stage names, no level list, no "next
level" anywhere. The plant page shows how many weeks it has been growing.

**Growth is a surprise.** The app never shows what a plant will look like
next: no preview of the grown species when planting (only its seed), no
growth levels, and no hints in chat or in the AI's text. What it grows into is only seen when
Monday's picture is revealed. Past In bloom it keeps changing each week (a
fuller bloom, seeds, small companions), so there is always a next surprise.

**Monday 06:00 Amsterdam**, for each Greenhouse plant:

1. **Score last week.** Cared for on schedule (any attention, see above; for
   fortnightly plants: within the last 14 days) earns 1 growth point; its special need marked met at least
   once earns 1 more. Stages need 0, 2, 5, 9, 14 and 20 points. Points never go
   down: a plant never shrinks or dies. Its health that Monday (thriving, fine,
   thirsty, wilting) is stored with the week.
2. **Paint the week's picture.** One OpenAI image per plant, made by an image
   Workflow. The prompt is built from the species and its lore, the stage, the
   health ("drooping, colours faded" when wilting) and the special need, and
   asks for one new, unexpected detail that fits the lore (a new colour, a
   shape, a creature visiting), so no two weeks look alike. The previous
   week's picture is the reference image, so it is visibly the same plant
   growing, or withering. The plant is painted on a transparent background
   and saved to R2 as `plants/<id>/<week>.png`.

**Every plant stands on its own patch of Velune.** At planting, OpenAI
paints the plant's backdrop once: its biome under the shared sky (Hesper and
Pell in their usual places), saved as `plants/<id>/world.png`
(`plants.world_key`). The page shows each week's plant standing on it, on
the tile and on the plant page, so the picture is a scene and not a
cut-out. The backdrop never changes; the plant on it does. The same
transparent plant is what later stands in the garden, in the same biome.
(In the mockup the backdrops are drawn in the page.)

**Withering is visible.** A thirsty or wilting plant's world dims and loses
colour, the ground cracks, and a wilting tile gets a slow red pulse on its
frame. The Greenhouse groups them first under **Due a check-in · N** and the
rest under **Doing fine · N**. No "overdue" wording anywhere: tiles, cards and
plant pages only say when you last checked in. The
header says "3 plants are due a check-in" and nothing more. Nothing dies: the Monday
picture of a wilting plant is drooping, never dead.

**New pictures stay veiled until you open them.** On the Greenhouse a plant
with an unopened picture shows a shimmering "✦ New growth" tile instead of
its picture; the header counts them ("3 new pictures to reveal").
On the plant page the picture and the newest slot of the growth
strip stay hidden behind a **Reveal** button, which plays a short reveal
(skipped with reduced motion) and says "grew" when it moved up, without
naming a level. Small
thumbnails elsewhere stay veiled too. Revealing is stored per week
(`weeks.seen_at`).

Between Mondays the plant page shows Monday's picture, with a CSS filter
(desaturated, slightly darker) if its health has dropped since.

The plant page shows only the current picture. The past weekly pictures sit
behind **Look back at past weeks** (folded away by default, folded again when
you leave the page), as a strip of the last 8, labelled by week. A new plant gets its first picture (a seed) right
after planting. The Shed and the Garden get no new pictures.

Cost: about 10 images a week (one per Greenhouse plant), plus two per new
plant (its backdrop and its seed), plus one Gemini clip each time a plant
moves to the garden. Pictures are kept forever (they are small) and included in the backup.

## Planting with AI

1. **Describe it** in a sentence or two.
2. **✦ Draft with AI** (one call): name, type, species with lore and special
   need, season goal (person) or goal + target + 2–3 milestones (project or
   initiative), why it matters, cadence and a first next step, each with a
   one-line reason. It also gives a recommendation (plant now, or what could
   go to the garden or shed first), related plants, and up to three questions;
   **Update draft with answers** redrafts.
3. **Review**: every field editable, **✦ Suggest** on the goal, why and next
   step, **✦ Another plant** on the species. The species is shown only as
   its seed, with its lore; what it grows into is a surprise. **Fill in myself** skips the AI.
4. **Plant**: the first next step becomes the first follow-up; the plant's
   home world and its seed picture are painted (two images, in one
   Workflow).

What the AI sees: the description, your answers and your plants' names,
goals and special needs, all after the guard has passed them. Never log entries, except for **Close season**, which
reads that person's log for the season. That is worth checking against your
employer's rules; with `AI=0` the AI parts disappear and the pictures stop.

## Data model (D1, a new database `work-garden`)

```sql
CREATE TABLE plants (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,        -- person | project | initiative
  place         TEXT NOT NULL DEFAULT 'greenhouse',  -- idea | greenhouse | shed | garden
  idea_note     TEXT,                 -- the one line jotted as an idea
  cadence_days  INTEGER NOT NULL,
  intent        TEXT,                 -- why it matters now
  goal          TEXT,                 -- annuals: what done looks like
  start_date    TEXT, target_date TEXT,   -- annuals
  species       TEXT,                 -- JSON: name, biome, origin, lore, fits, look, size; NULL while an idea
  garden_x REAL, garden_scale REAL,   -- its spot in the garden scene, set when done
  need_name     TEXT, need_meaning TEXT, need_check TEXT,
  world_key     TEXT,                 -- R2 key of its home-world backdrop, painted at planting
  stage         INTEGER NOT NULL DEFAULT 0,
  growth_points INTEGER NOT NULL DEFAULT 0,
  last_cared_at TEXT,                 -- newest attention of any kind (see Check-ins)
  done_on       TEXT, done_note TEXT, -- when planted out in the garden
  planted_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL
);

CREATE TABLE seasons (                -- perennials only
  id TEXT PRIMARY KEY, plant_id TEXT NOT NULL REFERENCES plants(id),
  n INTEGER NOT NULL, goal TEXT, start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  review TEXT                         -- filled when the season closes
);

CREATE TABLE milestones (             -- annuals: per plant; people: per season
  id TEXT PRIMARY KEY, plant_id TEXT NOT NULL REFERENCES plants(id),
  season_id TEXT REFERENCES seasons(id),
  title TEXT NOT NULL, due_on TEXT NOT NULL, done_on TEXT
);

CREATE TABLE branches (               -- what a person works on (perennials only)
  id TEXT PRIMARY KEY,
  plant_id   TEXT NOT NULL REFERENCES plants(id),
  title      TEXT NOT NULL,
  started_on TEXT NOT NULL, done_on TEXT
);

CREATE TABLE branch_updates (
  id TEXT PRIMARY KEY,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  happened_on TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL, edited_at TEXT
);

CREATE TABLE garden_versions (       -- one row each time the garden changes
  id INTEGER PRIMARY KEY,
  made_at   TEXT NOT NULL,
  image_key TEXT NOT NULL,            -- R2: the composed still, garden/<id>.png
  clip_key  TEXT,                     -- R2: the Gemini loop, garden/<id>.mp4; null until made or if it failed
  plant_ids TEXT NOT NULL             -- JSON: who stands in it
);

CREATE TABLE follow_ups (             -- the follow-up checklist
  id TEXT PRIMARY KEY,
  plant_id   TEXT NOT NULL REFERENCES plants(id),
  entry_id   TEXT REFERENCES entries(id),   -- the check-in that added it
  text       TEXT NOT NULL,
  added_on   TEXT NOT NULL,
  cleared_on TEXT                     -- ticked off, done or not
);

CREATE TABLE guard_words (            -- keep-out words, as fingerprints only
  hash TEXT PRIMARY KEY,              -- salted SHA-256 of the lower-cased word
  hint TEXT NOT NULL,                 -- masked, e.g. "A•••••p"
  added_at TEXT NOT NULL
);

CREATE TABLE entries (
  id          TEXT PRIMARY KEY,
  plant_id    TEXT NOT NULL REFERENCES plants(id),
  kind        TEXT NOT NULL DEFAULT 'checkin',
              -- checkin | need | idea | plant | park | revive | cadence | milestone | season | species | done
              -- a checkin with both boxes empty shows as "Checked in, no note"
  happened_on TEXT NOT NULL,          -- YYYY-MM-DD, can be backdated
  going_on    TEXT,                   -- "How are things going?"; for kind 'need': the check
  note        TEXT,                   -- the reason or detail for other kinds
  created_at  TEXT NOT NULL, edited_at TEXT
);

CREATE TABLE weeks (                  -- one row per plant per Monday: the growth strip
  plant_id TEXT NOT NULL REFERENCES plants(id),
  week     TEXT NOT NULL,             -- the Monday, YYYY-MM-DD
  stage INTEGER NOT NULL, health TEXT NOT NULL, points INTEGER NOT NULL,
  image_key TEXT,                     -- R2 key; null until the picture is made
  seen_at  TEXT,                      -- when you revealed it; null = still veiled
  PRIMARY KEY (plant_id, week)
);
```

Health is never stored on the plant; it is worked out on every read from
`last_cared_at` and the cadence (≤ 0.5 × cadence thriving, ≤ 1 fine, ≤ 1.5
thirsty, then wilting). `last_cared_at` is bumped by every write that counts
as attention (check-ins, branch updates, follow-ups added or
ticked, milestones ticked, need checks). Reviving restarts the clock. Nothing
is ever deleted.

## Screens

1. **Greenhouse** (home): the active plants as tiles in two groups, **Due a
   check-in · N** first and **Doing fine · N** below, neediest first within
   each. Each tile shows the plant on its patch of Velune with the health
   pill (or a veiled "✦ New growth" until you open a new picture) and its
   name written on the picture; below it only the species, type and cadence,
   the current branches (people) and when you last checked in. The special
   need lives on the plant page, not the tile. A header shows how many are due a check-in, beds in use, and when the
   next pictures arrive. Filter chips: All, People, Projects, Initiatives.
   **Group by** Status (Due a check-in / Doing fine, the default) or **Cadence**
   (Weekly, Fortnightly, Monthly, then any custom "Every N days"), each
   cadence heading saying how many in it are due a check-in. Wilting tiles look the
   same in either grouping.
   **Quick find** in the top bar: type a few letters of a name, a species or
   a branch and pick the plant; **/** focuses it from anywhere, arrows and
   Enter choose, Escape closes. For use in a meeting: find, glance, one tap.
2. **Plant page**, laid out for a meeting, with what you act on first. Left:
   the picture on its world (veiled with **Reveal** when new), health, weeks
   growing, cadence and due date, **Look back**; the species card with its
   lore folded behind **Lore**; the special need with **✓ Met this week**.
   Right: **Check in** first (two boxes, the ✓ Check in button, a hint that any
   attention counts), then **Follow-ups** to tick off, then **Branches**
   (people), then the plan (the compact season card, or the goal with its
   timeline and milestones), then the log folded to the newest three. Edit,
   Done / Plant out and Park sit in the header.
3. **New plant**: describe it, then review the draft.
4. **Garden**: one scene with every finished plant in it, then a short list
   of outcomes. Plant pages here are read-only.
5. **Manage** is a **kanban board** with four columns: **Ideas**, **Growing**
   (with beds in use), **Parked** and **Done** (newest four, *Show all*).
   Cards are small: picture, name, type and cadence, and when it was last
   checked in on, jotted, parked or done; Growing cards carry their health as a
   coloured edge, neediest first. Filter chips by type and a filter box sit
   above the board. **Drag a card** to move it, and only the columns it may
   go to light up: an idea into Growing starts AI planting with its note;
   Growing into Parked or Done, and Parked into Done, open a one-line box in
   the target column ("Why park it?", "What came of it?") with confirm and
   cancel; Parked into Growing revives it. Done is final. The same moves are
   buttons on each card (shown on hover, always on touch screens) for the
   keyboard and the phone: ✦ Plant and Discard on ideas, Park and Done or
   Plant out on growing plants, Revive and Done on parked ones. **+ Idea**
   at the top of the Ideas column opens a small box (name, one line,
   type). Below the board: **Needs rewording** (anything the Monday
   guard check flagged) and the **🛡 Sensitive-info guard** card with the
   rules and your masked keep-out words.

## Scheduled runs

| When (Amsterdam) | What |
|---|---|
| Monday 06:00 | Score last week for each Greenhouse plant from `last_cared_at`; start an image Workflow per plant (the plant only, its world is already painted); re-check all stored text with the guard |
| When a plant moves to the garden | Compose the new garden still and start a GardenClip Workflow (Gemini); the old clip plays until the new one is ready |
| Every night 02:00 | Back up D1 and new pictures to R2 (later, as in quest-engine) |

## API (same Worker, under `/api`)

```
GET   /api/garden                 everything for the three places
GET   /api/plants/:id             one plant: seasons, milestones, weeks, log
POST  /api/ai                     draft | suggest | species | season-review
POST  /api/plants                 plant the reviewed draft
PATCH /api/plants/:id             edit any field, species included
POST  /api/plants/:id/checkin     going_on, follow_up (added to the follow-up list)
POST  /api/plants/:id/need        the special need was met (today)
POST  /api/follow-ups/:id/clear   tick a follow-up off (and /unclear to undo)
POST  /api/ideas                   name, type, note
POST  /api/plants/:id/park | revive | done   note
DELETE /api/ideas/:id             discard an idea (ideas only; hidden, not erased)
POST  /api/plants/:id/season      close the season: review, next goal, end date
POST  /api/seasons/:id/milestones add a milestone to a person's season
PATCH /api/seasons/:id            set or change the season goal
POST  /api/milestones/:id/toggle
POST  /api/plants/:id/reveal      mark this week's picture as seen
POST  /api/plants/:id/branches    add a branch
POST  /api/branches/:id/updates   add an update to a branch
POST  /api/branches/:id/done      mark a branch done
GET   /api/guard                  the rules and the masked keep-out list
POST  /api/guard/words            add a keep-out word (only its fingerprint is kept)
DELETE /api/guard/words/:hash     remove one
PATCH /api/entries/:id            fix an entry
GET   /img/plants/:id/:week.png   a picture from R2
GET   /img/garden.png             the garden landscape
GET   /api/export                 everything as JSON
```

## Repo structure (rdecaste/WorkQuests)

```
README.md, CLAUDE.md
wrangler.jsonc         Worker "work-garden": assets ./public, D1 DB, R2 PICTURES,
                       Workflow PLANT_PICTURE, cron for Monday 06:00,
                       vars ACCESS_TEAM, ACCESS_AUD, CHAT_MODEL, IMAGE_MODEL, AI
package.json
migrations/0001_garden.sql
src/
  index.js             route list, Access check, cron, dispatch
  access.js            verifies the Access token and your email
  guard.js             the sensitive-info rules, shared with the page
  garden.js            pure rules: health, scoring, stages, seasons, sorting
  store.js             D1 reads and writes
  ai.js                draft, suggest, species and season-review prompts; checks the answers
  pictures.js          the style guide, the image prompt and the PlantPicture Workflow
  garden.js            composes the garden still and the GardenClip Workflow (Gemini)
public/
  index.html, app.js, style.css
test/
  d1fake.js, garden.test.js, api.test.js, ai.test.js, guard.test.js
docs/work-garden.md
```

Secrets: `OPENAI_API_KEY`, `GEMINI_API_KEY`. Address: `work-garden.quest-engine.workers.dev`.

## Setup steps only you can do

1. Create the D1 database and the R2 bucket (I can do both through the
   Cloudflare connector if you prefer).
2. Turn on Access on the Worker's Access tab and give me the audience tag.
3. Set `OPENAI_API_KEY` and `GEMINI_API_KEY` (`npx wrangler secret put …`).
4. Connect Workers Builds to the repo's `main`.
5. Check the address opens on the work laptop. If `workers.dev` is blocked
   there, a custom domain is the fallback.

## Build order

1. Plants, ideas, check-ins, health, Greenhouse / Garden / Manage, Access,
   and the guard from day one (no AI, no pictures).
2. AI planting, species and special needs.
3. Monday scoring, growth strip, the picture Workflow, the garden scene.
4. Seasons and season reviews.
5. Backups.
