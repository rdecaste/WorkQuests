// The Worker's entry (wrangler.jsonc "main"): the page and API from index.js,
// plus GardenPass, which only Workers with a service binding to it can call
// (Roy OS's WORK_GARDEN binding). Kept apart from index.js because
// cloudflare:workers only exists on Cloudflare, not in the tests.
import { WorkerEntrypoint } from 'cloudflare:workers';
import worker from './index.js';
import { mintPass } from './pass.js';

export class GardenPass extends WorkerEntrypoint {
  // A one-time pass for /pass?t=…, good for a minute. Roy OS only asks once Roy is signed in there.
  async mint() { return mintPass(this.env.DB); }
}

export default worker;
