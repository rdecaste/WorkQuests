# Work Garden: notes for Claude

Roy's private app for keeping work streams (people, projects, initiatives)
alive: each is a plant from the world Velune with a check-in cadence. One
Cloudflare Worker serves the page and its JSON API, with the D1 database
`work-garden` (binding `DB`). Roy gets in through Roy OS (a one-time pass,
`src/pass.js`); Cloudflare Access tokens work too. Full description,
build status and change log: `docs/work-garden.md`. Keep it up to date with
every change. The agreed design is `docs/proposal.md`.

## Rules that always hold
- **Nothing with business impact if it leaks.** Every text field goes through
  the guard (`public/shared/guard.js`): on the page as you type, and again in
  the Worker on every write (`guard()` in `src/api.js`). A new text field must
  be checked in both places and listed in `TEXT_FIELDS` (`src/store.js`).
  Example and test data must pass the guard: no amounts, prices, contract
  terms, pay, health or HR details, no real names of customers or suppliers.
- Keep-out words are stored only as salted fingerprints; the page hashes them,
  the plain word never reaches the server.
- Every request needs the Roy OS session cookie (`src/pass.js`) or an Access
  token (`src/access.js`); without either, nothing but a redirect to Roy OS.
  The session key and passes never leave D1 (not in the export).
- Nothing is deleted: discarded ideas get `place = 'discarded'`, removed
  milestones `removed = 1`.
- Growth is never previewed and no levels are shown; new Monday pictures stay
  veiled until revealed.
- Not a project management tool: no assigning people to initiatives.
- Roy's rules: step by step, no data loss, and ask him before any change to
  live data or any switch.

## Working here
- `git pull --rebase` before committing: other Claude sessions may work here too.
- Plain JS modules, no build. The Worker's entry is `src/entry.js` (adds the
  `GardenPass` entrypoint Roy OS calls); tests import `src/index.js`. `public/shared/` is imported by both the page
  and the Worker.
- Tests: `npm test` (`node --test`). D1 is faked with real SQLite
  (`test/d1fake.js`); Access tokens are signed with a key made in the test.
- Schema: `migrations/` (apply with `npx wrangler d1 migrations apply work-garden --remote`).
- Local: `npx wrangler dev` with `DEV_SKIP_ACCESS=1` in `.dev.vars` (only
  works on localhost).
- Deploys: a push to `main` is built by Workers Builds (tests first). Check
  `npx wrangler deployments list` afterwards.
- Never commit secrets or Roy's email; `ALLOWED_EMAILS` is a Worker secret.
