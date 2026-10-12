-- A person's branch can point to a project or initiative plant (Roy, 12 Oct
-- 2026: "keep both, but have some connection between both. but keep it
-- simple"). Only a pointer: no roles, no due dates, no assigning.
ALTER TABLE branches ADD COLUMN project_id TEXT REFERENCES plants(id);
