// The Worker's entry (wrangler.jsonc "main"): the page and API from index.js,
// plus GardenPass, which only Workers with a service binding to it can call
// (Roy OS's WORK_GARDEN binding), and the GardenScene Workflow that paints the
// landscape. Kept apart from index.js because cloudflare:workers only exists
// on Cloudflare, not in the tests.
import { WorkerEntrypoint, WorkflowEntrypoint } from 'cloudflare:workers';
import worker from './index.js';
import { mintPass } from './pass.js';
import { paintStill, animate, signedMediaUrl, finishLandscape, setJob } from './landscape.js';

export class GardenPass extends WorkerEntrypoint {
  // A one-time pass for /pass?t=…, good for a minute. Roy OS only asks once Roy is signed in there.
  async mint() { return mintPass(this.env.DB); }
}

const CHEAP = { retries: { limit: 3, delay: '10 seconds', backoff: 'exponential' }, timeout: '2 minutes' };
const ONCE_PAID = { retries: { limit: 0, delay: '1 second' }, timeout: '15 minutes' };
const message = err => String(err && err.message || err).slice(0, 300);

// The landscape (src/landscape.js): the still, then the loop, each paid once. When
// the loop fails the still is shown on its own; when the still fails nothing changes.
export class GardenScene extends WorkflowEntrypoint {
  async run(event, step) {
    const { stamp } = event.payload;
    const env = this.env;
    let stillKey;
    try {
      stillKey = await step.do('still', ONCE_PAID, async () => {
        const key = `landscape/${stamp}.jpg`;
        await env.MEDIA.put(key, await paintStill(env), { httpMetadata: { contentType: 'image/jpeg' } });
        return key;
      });
    } catch (err) {
      await setJob(env.DB, { status: 'failed', started_at: new Date().toISOString(), error: 'still: ' + message(err) });
      throw err;
    }
    await step.do('animating', CHEAP, () => setJob(env.DB, { status: 'animating', started_at: new Date().toISOString(), error: null }));
    let clipKey = null, error = null;
    if (!env.STUDIO && !env.GEMINI_API_KEY) error = 'No STUDIO or GEMINI_API_KEY: the still only';
    else {
      try {
        clipKey = await step.do('clip', ONCE_PAID, async () => {
          const key = `landscape/${stamp}.mp4`;
          await env.MEDIA.put(key, await animate(env, await signedMediaUrl(env, stillKey)), { httpMetadata: { contentType: 'video/mp4' } });
          return key;
        });
      } catch (err) { error = 'clip: ' + message(err); }
    }
    await step.do('show', CHEAP, () => finishLandscape(env.DB, { stillKey, clipKey, error }));
    return { ok: 1, stillKey, clipKey, error };
  }
}

export default worker;
