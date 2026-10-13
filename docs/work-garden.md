# Work Garden

The design is in `proposal.md` (agreed with Roy over 18 rounds of mockups,
go-ahead 11 Oct 2026). This file says what is built, how it works, and what
changed.

## Build status

| Step | What | Status |
|---|---|---|
| 1 | Plants, ideas, check-ins, health, Greenhouse / Garden / Manage, guard, Access | Built 11 Oct 2026 |
| 2 | AI planting: ✦ Frame it with AI, species from the catalogue, ✦ Paint its picture (the seed) | Built 13 Oct 2026 |
| 3 | Monday scoring, OpenAI pictures, garden scene, Gemini clip | The empty landscape (still + loop) built 11 Oct 2026; branch limbs and the plant style decided 13 Oct (`src/pictures.js`); the rest later |
| 4 | Seasons | Dropped 13 Oct 2026 (Roy: "drop the season thing"): everyone has purpose, timing and milestones |
| 5 | Backups (nightly to R2, like quest-engine) | Later |

Species come from the Velune catalogue (`public/shared/velune.js`): the AI
picks three, or "Another plant" walks through it when filling in by hand.
Until step 3 a plant shows its painted seed if Roy painted it, otherwise the
drawings in `public/draw.js`; every plant stays a seed (stage 0), and the
"next pictures" lines are hidden (`pictures: false` in the state).

## How it works

- **Getting in: through Roy OS** (Roy, 11 Oct 2026: "my RoyOS should have
  the access layer, from there I should be able to navigate to the other
  pages"). Every request, the page included (`run_worker_first`), needs a
  `garden_session` cookie or an Access token. Roy OS's menu link goes to its
  own `/go/garden`, which (only when Roy is signed in on Roy OS) asks this
  Worker for a pass over a service binding to the `GardenPass` entrypoint
  (`src/entry.js`; an entrypoint can't be reached from the internet) and
  sends the browser to `/pass?t=<pass>`. A pass works once, within a minute,
  and is stored only as a SHA-256 fingerprint (`settings` key `pass:…`).
  It becomes a 12-hour cookie signed with `session_key` (made once, kept in
  `settings`, never exported). Without a session the page sends the browser
  to Roy OS's `/go/garden`, which comes straight back with a pass or shows
  Roy OS's sign-in, so it stays one tap; the API answers 401. Code:
  `src/pass.js`. The header has a "← Roy OS" link back to Roy OS's landing
  page (the state's `royos`, from `ROYOS_URL`; hidden when that isn't set).
- **Access** still works next to it: a `Cf-Access-Jwt-Assertion` token signed
  by the Access team `billowing-boat-2009`, with the app's audience tag
  (`ACCESS_AUD`) and an email in the `ALLOWED_EMAILS` secret (`src/access.js`).
- **Writes** must be JSON from the same origin (no cross-site forms).
- **State.** `GET /api/garden` returns everything in the shape the page uses
  (`buildState` in `src/store.js`); every write answers with the same fresh
  state. Health is computed from the log with the shared rules
  (`public/shared/rules.js`): thriving up to half the cadence, fine up to the
  cadence, thirsty up to one and a half, then wilting. Any attention counts:
  a check-in, a ticked or added follow-up, a milestone, a branch update, a
  revive.
- **No special need** (taken out 12 Oct 2026, Roy: "remove this special needs
  thing, does not make sense"). The form, the plant page box, "Met this
  week" and `POST /api/plants/:id/need` are gone. The `need_*` columns and
  anything typed in them stay in D1 (nothing is deleted), are no longer
  shown or written, and stay under the guard's rewording check.
- **Branches link people and projects** (Roy, 12 Oct 2026: "keep both, but
  have some connection between both. but keep it simple"). A person's branch
  can point to a project or initiative plant (growing or parked):
  `branches.project_id` (migration 0002), set when adding a branch (the page
  offers matching projects under the name box) or later with "Link to a
  project", and undone with ×; `POST /api/branches/:id/link {projectId|null}`.
  The project's page then shows "People on it": each person with a current
  linked branch and that branch's latest update (`linkPeople` in
  `src/store.js`). Updates are written on the branch only. No roles, due
  dates or assigning. Branch update boxes grow as you type (up to 2000
  characters, line breaks kept); Ctrl/⌘+Enter adds.
- **No seasons** (taken out 13 Oct 2026, Roy: "drop the season thing. yes
  milestones. yes timing, yes, intent/purpose no to 'why it matters now'").
  Every plant has a **purpose** (`plants.goal`), a **timing** (`target_date`)
  and **milestones**, people included; Edit changes them for every type. The
  season card, Close season and `POST /api/plants/:id/season`,
  `PATCH /api/seasons/:id`, `POST /api/seasons/:id/milestones` are gone. New
  people get no season; seasons already made (and their goals and reviews)
  stay in D1 and the export, unshown, and stay under the guard. "Why it
  matters now" (`plants.intent`) is no longer asked or shown; old text stays.
- **✦ Frame it with AI** (Roy, 13 Oct 2026: "have AI help/guide me to start a
  plant, similar like how a quest is build - to frame it"). + Plant opens a
  describe step: a few lines, what it's about (a person, a project, an
  initiative, or let the AI tell), then **✦ Frame it with AI** or **Fill in
  myself**. `POST /api/frame {description, type?, answers?, draft?}`
  (`src/frame.js`) guards the description, answers and any draft lines (422
  as any write), counts the call (at most 40 a day, `settings`
  `frame_calls`), and asks the chat model through Roy OS (`STUDIO.draft`,
  Roy OS's OpenAI key and `CHAT_MODEL`; without the binding this Worker's
  `OPENAI_API_KEY`). The model gets fixed instructions (`SYSTEM`), today, the
  beds in use, Roy's live project and people plants by name with short refs
  (`p1`, `h1`; ids never leave), the catalogue, and question angles for the
  kind of plant (`ANGLES`: a person: what they do on their own by the date,
  which work becomes branches, how involved Roy stays; a project: what done
  looks like, the milestones, who's on it; an initiative: what has changed,
  the first steps, who's involved). The answer is cleaned (`cleanDraft`:
  lengths, dates between today and two years out, refs mapped back to real
  plants, three catalogue species) and every line goes through the guard
  again (`guardDraft`): a caught line is left out and the page says how many.
  Nothing is saved. The draft fills the form with a ✦ reason under each field,
  a recommendation (plant now, or **Save as an idea**), the three species and
  up to three questions; **✦ Update draft with answers** sends the answers and
  the edited draft back. Planting (`POST /api/plants`) takes `branches`
  (`[{title, projectId?}]`, a person's own) or `people` (`[{plantId, title}]`,
  a project or initiative: each person gets a branch pointing to it), all
  guarded.
- **✦ Paint its picture** (Roy, 13 Oct 2026: "I also want the plant image to
  be generated once I start a plant - there should be a button"). Once
  planted, the plant page offers it (or Later; then a small link stays).
  `POST /api/plants/:id/picture` starts the `PlantPicture` Workflow
  (`src/entry.js`, `src/plantpicture.js`): one paid still from Roy OS's Studio,
  saved to R2 `plants/<id>/<stamp>.jpg`, shown from `plants.picture_key`
  (migration 0003) on the tile, the plant page and in lists; `settings`
  `picture:<id>` holds painting / ready / failed, and the page looks again
  every 15 seconds while it paints. Once per plant: a plant with its picture
  keeps it (409 after). The prompt (`seedPrompt` in `src/pictures.js`) is
  the plant style (halfway between hyper-realistic and anime) plus only the
  seed: the catalogue species' name, its biome and colour, a sprout no
  taller than a thumb, nothing about what it grows into. A species not in the
  catalogue is painted from its shape and colour only; nothing typed goes in.
- **The guard** (`public/shared/guard.js`): pattern rules for money, prices,
  contract terms, pay, health, HR and legal cases, secrets, and contact or
  bank details, plus Roy's keep-out words. Keep-out words are stored as
  SHA-256 fingerprints with a salt kept in `settings`; text is matched by
  fingerprinting every run of one to three words. The page checks as you
  type, the Worker checks every write and answers 422 with the hits.
  `GET /api/guard` checks all stored text again with today's rules and words;
  anything caught is listed on Manage under "Needs rewording", where
  `POST /api/reword` replaces it.
- **Nothing is deleted.** Discarded ideas are hidden (`place = 'discarded'`),
  milestones taken out in Edit are marked `removed`.
- **The landscape** (Roy, 11 Oct 2026: "an image in the background with the
  garden landscape (no plants) but should look alive. use open ai for the
  image and gemini for the motion"). The Garden page shows an empty night
  panorama of Velune's five biomes. **✦ Paint the landscape** (later
  "Repaint", which asks first because it is paid) calls `POST /api/landscape`,
  which starts the `GardenScene` Workflow (`src/entry.js`). Roy OS paints
  with its own keys (service binding `STUDIO` to its `Studio` entrypoint; Roy:
  "can't you reuse the keys from the roy os?"): OpenAI
  `gpt-image-2.5-flare` paints the still (2048×1152, as Roy OS), then Gemini
  `gemini-omni-flash-preview` turns it into a seamless loop (it reads the still
  from a signed `/media/…?exp=&sig=` address that works for 30 minutes). Each
  paid step runs once; if the loop fails the still shows alone. Both live in
  R2 `work-garden-media` under `landscape/` and are served at `/media/…`
  behind the sign-in (with byte ranges for the video); old ones are kept.
  `settings` holds `landscape` (what the page shows) and `landscape_job`
  (painting, animating, ready, failed). The prompts are fixed text
  (`STILL_PROMPT`, `MOTION_PROMPT` in `src/landscape.js`): nothing Roy types
  goes to OpenAI or Gemini. The landscape is the wallpaper of every page
  (Roy: "the image should be used for the whole garden as background not just
  the garden tab"): over it the app wears its dark colours with see-through
  cards, and the picture is dimmed except on the Garden page. It first came
  to the Garden page only, as on Roy OS (Roy: "I want the garden to fill the whole page
  similar to the roy os landing page. just make sure my plants visible"): a
  fixed `#wall` behind the page plays the loop muted on repeat over the still
  (with reduced motion only the still), the header turns to glass, and the
  finished plants stand along the bottom of the first screen in their biome
  bands (`gardenPlants` in `public/draw.js`, the same left-to-right order as
  the painted biomes; swipe sideways on a phone). Their list follows below.
- **Export.** `GET /api/export` downloads every table as JSON (link at the
  bottom of Manage); of `settings` only the guard salt.

## Cloudflare

- Worker `work-garden`; D1 `work-garden` (id `5d19a52b-ebc2-43a5-8320-f370d6c52dc1`,
  Western Europe), schema `migrations/0001_garden.sql` applied 11 Oct 2026, `0002_branch_project.sql`
  12 Oct, `0003_plant_picture.sql` 13 Oct.
- Address: `work-garden.quest-engine.workers.dev`. Access on the Worker's Access tab: all traffic,
  policy "Cloudflare account", 7-day sessions (Roy, 11 Oct 2026).
- Roy OS (Worker `royos`, repo rdecaste/RoyOS) has a service binding `WORK_GARDEN` to this
  Worker's `GardenPass` entrypoint. Deploy this Worker first when the entrypoint changes.
- R2 bucket `work-garden-media` (made 11 Oct 2026, location ENAM, default jurisdiction: it only
  holds pictures of Velune, no work text), binding `MEDIA`. Workflows `work-garden-scene` (binding `GARDEN_SCENE`,
  the landscape) and `work-garden-plant` (binding `PLANT_PICTURE`, a plant's seed).
- Service binding `STUDIO` → Worker `royos`, entrypoint `Studio` (Roy OS's keys paint the landscape and the seeds,
  and its `draft` answers ✦ Frame it with AI).
  Deploy Roy OS first when `Studio` changes.
- Vars: `ACCESS_TEAM`, `ACCESS_AUD` (the Access app's audience tag), `ROYOS_URL`, `PUBLIC_URL`; optional `IMAGE_MODEL`,
  `VIDEO_MODEL`, `CHAT_MODEL`. Secrets: `ALLOWED_EMAILS`; `OPENAI_API_KEY` and `GEMINI_API_KEY` only if `STUDIO` is removed.

## Change log

- **11 Oct 2026, step 1.** Worker, D1 schema, Access check, guard with
  keep-out fingerprints and "Needs rewording", the page ported from mockup
  version 20 (Greenhouse with Group by Status / Cadence, Garden scene, Manage
  kanban, plant page with check-in, follow-ups, branches, seasons and
  milestones, quick find). D1 database created and migrated.
- **11 Oct 2026.** Workers Builds connected to `main`; tests no longer touch
  the network (a build failed when one reached the real cloudflareaccess.com).
  Access turned on; `ACCESS_AUD` set.
- **11 Oct 2026, in through Roy OS.** Roy's work laptop can't use the Access
  login, and Roy OS already works there. Roy OS hands over a one-time pass
  (`GardenPass.mint`, `/pass`), which becomes a 12-hour cookie; without one
  the page goes to Roy OS and back. Worker entry is now `src/entry.js`. The
  export no longer includes the sign-in key. Access tokens still work.
- **11 Oct 2026, the living landscape.** Roy, now in from his work laptop, asked
  for an image behind the empty Garden page that looks alive. Paint button,
  `POST /api/landscape`, `GardenScene` Workflow (OpenAI still, Gemini loop),
  `/media/…` from R2, `landscape` in the state.
- **11 Oct 2026, painted with Roy OS's keys.** Secrets can't be read back to
  copy, so Roy OS's new `Studio` entrypoint paints the still and the loop with
  its keys and the weekly world's functions (rdecaste/RoyOS `src/studio.js`);
  no keys needed here.
- **11 Oct 2026, the garden fills the page.** Roy painted the first landscape
  (still and loop ready in about a minute). The Garden page is now full-bleed
  like Roy OS's landing page, with the finished plants standing on it.
- **11 Oct 2026, the landscape behind every page.** Greenhouse, Manage and the
  plant pages too, with see-through dark cards; the loop keeps playing when
  moving between pages.
- **12 Oct 2026, back to Roy OS.** A "← Roy OS" link next to the Work Garden
  name in the header (Roy: "add a link back to my roy os from my work garden
  page").
- **12 Oct 2026, no special need.** Taken out of the planting and edit form,
  the plant page and the API (Roy: "remove this special needs thing, does not
  make sense"). What was typed stays in D1, unshown. Step 3's growth score
  loses its "need met" point; to settle when step 3 is built.
- **12 Oct 2026, branches link to projects.** A branch can point to a project
  plant, which then shows the person under "People on it"; branch update
  boxes grow with the text (up to 2000 characters). Mockup:
  https://claude.ai/artifact/9RK89ZKLsMPi9xHgeNZoYS. Migration 0002 adds
  `branches.project_id`.
- **13 Oct 2026, step 3 plan: branches and style.** Each branch becomes a
  limb in the Monday picture, sized by the weeks it had an update (bud,
  sprig, branch, leafy branch, bough), pale when quiet three weeks, a bloom
  when done. Plant pictures are halfway between hyper-realistic and anime.
  Rules and fixed prompt words in `src/pictures.js` (tested), used once the
  Monday pictures are built. Proposal:
  https://claude.ai/artifact/9ztkzXdkPBaenXHnBbGE8J.
- **13 Oct 2026, guided planting, step 2.** + Plant starts with a few lines
  and **✦ Frame it with AI** (every field drafted with a reason, a
  recommendation, up to three questions by kind of plant, three species),
  or Fill in myself. Planting can add a person's branches or a project's
  people. After planting, **✦ Paint its picture** paints the seed. Seasons
  are gone: everyone has purpose, timing and milestones (the season on Roy's
  one person plant stays in D1, unshown). Roy OS got `Studio.draft`.
  Mockup: https://claude.ai/artifact/3js2FZ4p7gNd65wiMRsSmn. Migration 0003
  adds `plants.picture_key`.
