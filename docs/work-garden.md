# Work Garden

The design is in `proposal.md` (agreed with Roy over 18 rounds of mockups,
go-ahead 11 Oct 2026). This file says what is built, how it works, and what
changed.

## Build status

| Step | What | Status |
|---|---|---|
| 1 | Plants, ideas, check-ins, health, Greenhouse / Garden / Manage, guard, Access | Built 11 Oct 2026 |
| 2 | AI planting: species, lore and special need drafted by OpenAI | Next |
| 3 | Monday scoring, OpenAI pictures, garden scene, Gemini clip | Later; confirm the Gemini model and price first |
| 4 | Seasons: AI-drafted season reviews (seasons themselves work since step 1) | Later |
| 5 | Backups (nightly to R2, like quest-engine) | Later |

Until step 2 the planting form is filled in by hand: the species comes from
the Velune catalogue (`public/shared/velune.js`, "Another plant" walks through
it) and the special need is typed in. Until step 3 the pictures are the
drawings in `public/draw.js`, every plant stays a seed (stage 0), and the
"next pictures" lines are hidden (`pictures: false` in the state).

## How it works

- **Access.** Every request, the page included (`run_worker_first`), goes
  through `src/access.js`: the `Cf-Access-Jwt-Assertion` token must be signed
  by the Access team `billowing-boat-2009`, carry the app's audience tag
  (`ACCESS_AUD`) and an email in the `ALLOWED_EMAILS` secret. Missing any of
  them, nobody gets in.
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
- **Export.** `GET /api/export` downloads every table as JSON (link at the
  bottom of Manage).

## Cloudflare

- Worker `work-garden`; D1 `work-garden` (id `5d19a52b-ebc2-43a5-8320-f370d6c52dc1`,
  Western Europe), schema `migrations/0001_garden.sql` applied 11 Oct 2026.
- Vars: `ACCESS_TEAM`, `ACCESS_AUD`. Secrets: `ALLOWED_EMAILS`; later
  `OPENAI_API_KEY`, `GEMINI_API_KEY`.

## Change log

- **11 Oct 2026, step 1.** Worker, D1 schema, Access check, guard with
  keep-out fingerprints and "Needs rewording", the page ported from mockup
  version 20 (Greenhouse with Group by Status / Cadence, Garden scene, Manage
  kanban, plant page with check-in, follow-ups, branches, seasons and
  milestones, quick find). D1 database created and migrated.
