// ✦ Paint its picture: a plant's first picture, the seed on its patch of Velune
// (Roy, 13 Oct 2026). One paid still, painted by Roy OS's Studio (or OpenAI with
// this Worker's own key), kept in R2 under plants/<id>/ and served at /media/….
// The prompt is fixed text from src/pictures.js: nothing Roy typed goes in.
// The PlantPicture Workflow (src/entry.js) runs it; the still is paid once.
//
// plants.picture_key            the picture the page shows
// settings 'picture:<plant id>' {status, started_at, error}   painting | ready | failed
// Painted once: a plant that has its picture keeps it (nothing is deleted).

const BUSY = 20 * 60e3; // a job older than this counts as stuck, and Paint works again

async function put(db, key, value) {
  await db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').bind(key, JSON.stringify(value)).run();
}
export const setPictureJob = (db, plantId, job) => put(db, 'picture:' + plantId, job);

// From the settings rows: plant id → 'painting' | 'failed' | null.
export function pictureJobs(rows, now = Date.now()) {
  const m = new Map();
  for (const r of rows || []) {
    let job;
    try { job = JSON.parse(r.value); } catch { continue; }
    const id = r.key.slice('picture:'.length);
    if (job.status === 'painting' && now - Date.parse(job.started_at) < BUSY) m.set(id, 'painting');
    else if (job.status === 'failed') m.set(id, 'failed');
  }
  return id => m.get(id) || null;
}

// POST /api/plants/:id/picture. Returns null when started, or {status, body} when refused.
export async function startPicture(env, plant, now = Date.now()) {
  if (!env.PLANT_PICTURE || !env.MEDIA) return { status: 503, body: { error: 'Plant pictures are not set up on this Worker.' } };
  if (!env.STUDIO && !env.OPENAI_API_KEY) return { status: 503, body: { error: 'Nothing to paint with: connect Roy OS (STUDIO) or add OPENAI_API_KEY.' } };
  if (plant.picture_key) return { status: 409, body: { error: 'It already has its picture. New ones come on Mondays.' } };
  const raw = await env.DB.prepare('SELECT value FROM settings WHERE key = ?').bind('picture:' + plant.id).first('value');
  if (pictureJobs(raw ? [{ key: 'picture:' + plant.id, value: raw }] : [], now)(plant.id) === 'painting') return { status: 409, body: { error: 'Its picture is already being painted.' } };
  const stamp = new Date(now).toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'z').toLowerCase();
  await setPictureJob(env.DB, plant.id, { status: 'painting', started_at: new Date(now).toISOString(), error: null });
  try {
    await env.PLANT_PICTURE.create({ params: { plantId: plant.id, stamp } });
  } catch (e) {
    await setPictureJob(env.DB, plant.id, { status: 'failed', started_at: new Date(now).toISOString(), error: String(e && e.message || e).slice(0, 300) });
    throw e;
  }
  return null;
}

// The Workflow's last step: show the picture.
export async function finishPicture(db, plantId, key, now = Date.now()) {
  await db.batch([
    db.prepare('UPDATE plants SET picture_key = ? WHERE id = ?').bind(key, plantId),
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .bind('picture:' + plantId, JSON.stringify({ status: 'ready', started_at: new Date(now).toISOString(), error: null }))
  ]);
}
