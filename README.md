# Work Garden

A private garden of the things you keep alive at work. Each person, project
or initiative is a plant from the world Velune with a check-in cadence; it
thrives when you give it attention and gets thirsty when you don't. Nothing
dies. Finished plants move to the garden, a living landscape of Velune.

One Cloudflare Worker (page + API) with a D1 database, opened through Roy OS
(or Cloudflare Access). See `docs/work-garden.md` for how it works and what is built, and
`docs/proposal.md` for the agreed design.

```
npm test              # node --test, D1 faked with real SQLite
npx wrangler dev      # local, with .dev.vars (see .dev.vars.example)
```
