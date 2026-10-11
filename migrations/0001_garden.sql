-- Work Garden: every plant, what you wrote about it, and its weekly pictures.
-- Nothing is ever deleted: discarded ideas and finished branches stay, marked.

CREATE TABLE plants (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,                       -- person | project | initiative
  place         TEXT NOT NULL DEFAULT 'greenhouse',  -- idea | greenhouse | shed | garden | discarded
  idea_note     TEXT,                                -- the one line jotted as an idea
  cadence_days  INTEGER NOT NULL DEFAULT 7,
  intent        TEXT,                                -- why it matters now
  goal          TEXT,                                -- annuals: what done looks like
  start_date    TEXT,
  target_date   TEXT,                                -- annuals
  species       TEXT,                                -- JSON: name, origin, form, hue, lore, fits; NULL while an idea
  need_name     TEXT,
  need_meaning  TEXT,
  need_check    TEXT,
  world_key     TEXT,                                -- R2 key of its backdrop on Velune (step 3)
  garden_x      REAL,
  garden_scale  REAL,                                -- its spot in the garden scene (step 3)
  stage         INTEGER NOT NULL DEFAULT 0,          -- internal only: drives the picture, never shown
  growth_points INTEGER NOT NULL DEFAULT 0,
  last_cared_at TEXT,                                -- newest attention of any kind
  done_on       TEXT,
  done_note     TEXT,                                -- when and why it went to the garden
  created_at    TEXT NOT NULL,                       -- when it was jotted or planted
  planted_at    TEXT,                                -- NULL while an idea
  updated_at    TEXT NOT NULL
);

CREATE TABLE seasons (                               -- people only
  id         TEXT PRIMARY KEY,
  plant_id   TEXT NOT NULL REFERENCES plants(id),
  n          INTEGER NOT NULL,
  goal       TEXT,
  start_date TEXT NOT NULL,
  end_date   TEXT NOT NULL,
  review     TEXT,                                   -- written when the season closes
  closed_on  TEXT
);
CREATE INDEX seasons_plant ON seasons(plant_id);

CREATE TABLE milestones (                            -- projects and initiatives: per plant; people: per season
  id        TEXT PRIMARY KEY,
  plant_id  TEXT NOT NULL REFERENCES plants(id),
  season_id TEXT REFERENCES seasons(id),
  title     TEXT NOT NULL,
  due_on    TEXT NOT NULL,
  done_on   TEXT,
  removed   INTEGER NOT NULL DEFAULT 0             -- taken out in Edit; kept, not erased
);
CREATE INDEX milestones_plant ON milestones(plant_id);

CREATE TABLE branches (                              -- what a person works on
  id         TEXT PRIMARY KEY,
  plant_id   TEXT NOT NULL REFERENCES plants(id),
  title      TEXT NOT NULL,
  started_on TEXT NOT NULL,
  done_on    TEXT
);
CREATE INDEX branches_plant ON branches(plant_id);

CREATE TABLE branch_updates (
  id          TEXT PRIMARY KEY,
  branch_id   TEXT NOT NULL REFERENCES branches(id),
  happened_on TEXT NOT NULL,
  text        TEXT NOT NULL,
  created_at  TEXT NOT NULL,
  edited_at   TEXT
);
CREATE INDEX branch_updates_branch ON branch_updates(branch_id);

CREATE TABLE entries (
  id          TEXT PRIMARY KEY,
  plant_id    TEXT NOT NULL REFERENCES plants(id),
  kind        TEXT NOT NULL DEFAULT 'checkin',
              -- checkin | need | idea | plant | park | revive | cadence | milestone | season | species | done
  happened_on TEXT NOT NULL,                         -- YYYY-MM-DD, Amsterdam
  going_on    TEXT,                                  -- checkin: "How are things going?"
  note        TEXT,                                  -- checkin: the follow-up written with it; other kinds: the detail
  created_at  TEXT NOT NULL,
  edited_at   TEXT
);
CREATE INDEX entries_plant ON entries(plant_id, happened_on);

CREATE TABLE follow_ups (
  id         TEXT PRIMARY KEY,
  plant_id   TEXT NOT NULL REFERENCES plants(id),
  entry_id   TEXT REFERENCES entries(id),            -- the check-in that added it
  text       TEXT NOT NULL,
  added_on   TEXT NOT NULL,
  cleared_on TEXT                                    -- ticked off, done or not
);
CREATE INDEX follow_ups_plant ON follow_ups(plant_id);

CREATE TABLE weeks (                                 -- one row per plant per Monday (step 3)
  plant_id  TEXT NOT NULL REFERENCES plants(id),
  week      TEXT NOT NULL,                           -- the Monday
  stage     INTEGER NOT NULL,
  health    TEXT NOT NULL,
  points    INTEGER NOT NULL,
  image_key TEXT,
  seen_at   TEXT,
  PRIMARY KEY (plant_id, week)
);

CREATE TABLE garden_versions (                       -- one row each time the garden changes (step 3)
  id        INTEGER PRIMARY KEY,
  made_at   TEXT NOT NULL,
  image_key TEXT NOT NULL,
  clip_key  TEXT,
  plant_ids TEXT NOT NULL
);

CREATE TABLE guard_words (                           -- keep-out words, as fingerprints only
  hash     TEXT PRIMARY KEY,                         -- SHA-256 of the salt and the lower-cased word
  hint     TEXT NOT NULL,                            -- masked, e.g. "A•••••p"
  added_at TEXT NOT NULL
);

CREATE TABLE settings (                              -- small key/value: the guard salt
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
