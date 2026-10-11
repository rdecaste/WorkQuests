# Work Garden

The design is in `proposal.md` (agreed with Roy over 18 rounds of mockups,
go-ahead 11 Oct 2026). This file says what is built, how it works, and what
changed.

## Build status

| Step | What | Status |
|---|---|---|
| 1 | Plants, ideas, check-ins, health, Greenhouse / Garden / Manage, guard, Access | Built 11 Oct 2026 |
| 2 | AI planting: species, lore and special need drafted by OpenAI | Next |
| 3 | Monday scoring, OpenAI pictures, garden scene, Gemini clip | The empty landscape (still + loop) built 11 Oct 2026; the rest later |
| 4 | Seasons: AI-drafted season reviews (seasons themselves work since step 1) | Later |
| 5 | Backups (nightly to R2, like quest-engine) | Later |

Until step 2 the planting form is filled in by hand: the species comes from
the Velune catalogue (`public/shared/velune.js`, "Another plant" walks through
it) and the special need is typed in. Until step 3 the pictures are the
drawings in `public/draw.js`, every plant stays a seed (stage 0), and the
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
  `src/pass.js`.
- **Access** still works next to it: a `Cf-Access-Jwt-Assertion` token signed
  by the Access team `billowing-boat-2009`, with the app's audience tag
  (`ACCESS_AUD`) and an email in the `ALLOWED_EMAILS` secret (`src/access.js`).
- **Writes** must be JSON from the same origin (no cross-site forms).
- **State.** `GET /api/garden` returns everything in the shape the page uses
  (`buildState` in `src/store.js`); every write answers with the same fresh
  state. Health is computed from the log with the shared rules
  (`public/shared/rules.js`): thriving up to half the cadence, fine up to the
  cadence, thirsty up to one and a half, then wilting. Any attention counts:
  a check-in, the special need, a ticked or added follow-up, a milestone, a
  branch update, a revive.
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
  Western Europe), schema `migrations/0001_garden.sql` applied 11 Oct 2026.
- Address: `work-garden.quest-engine.workers.dev`. Access on the Worker's Access tab: all traffic,
  policy "Cloudflare account", 7-day sessions (Roy, 11 Oct 2026).
- Roy OS (Worker `royos`, repo rdecaste/RoyOS) has a service binding `WORK_GARDEN` to this
  Worker's `GardenPass` entrypoint. Deploy this Worker first when the entrypoint changes.
- R2 bucket `work-garden-media` (made 11 Oct 2026, location ENAM, default jurisdiction: it only
  holds pictures of Velune, no work text), binding `MEDIA`. Workflow `work-garden-scene`, binding `GARDEN_SCENE`.
- Service binding `STUDIO` → Worker `royos`, entrypoint `Studio` (Roy OS's keys paint the landscape).
  Deploy Roy OS first when `Studio` changes.
- Vars: `ACCESS_TEAM`, `ACCESS_AUD` (the Access app's audience tag), `ROYOS_URL`, `PUBLIC_URL`; optional `IMAGE_MODEL`,
  `VIDEO_MODEL`. Secrets: `ALLOWED_EMAILS`; `OPENAI_API_KEY` and `GEMINI_API_KEY` only if `STUDIO` is removed.

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
