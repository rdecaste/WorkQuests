// D1 and R2 for the tests. D1 is a real SQLite database (node:sqlite) behind
// the same binding API (prepare/bind/all/first/run, batch, exec), with every
// migration in migrations/ applied, so the tests run the real SQL.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, readFileSync } from 'node:fs';

const MIGRATIONS = new URL('../migrations/', import.meta.url);

class Statement {
  constructor(sqlite, sql, params = []) { this.sqlite = sqlite; this.sql = sql; this.params = params; }
  bind(...params) {
    // D1 refuses undefined; so does this, to catch it in the tests.
    params.forEach((p, i) => { if (p === undefined) throw new Error(`D1_TYPE_ERROR: undefined at parameter ${i + 1} of: ${this.sql}`); });
    return new Statement(this.sqlite, this.sql, params);
  }
  // Plain objects, as D1 returns (node:sqlite's have no prototype).
  async all() { return { success: true, results: this.sqlite.prepare(this.sql).all(...this.params).map(r => ({ ...r })), meta: {} }; }
  async first(column) {
    const row = this.sqlite.prepare(this.sql).get(...this.params);
    return row === undefined ? null : column ? row[column] : { ...row };
  }
  async run() {
    const r = this.sqlite.prepare(this.sql).run(...this.params);
    return { success: true, results: [], meta: { changes: Number(r.changes), last_row_id: Number(r.lastInsertRowid) } };
  }
  async raw() { return this.sqlite.prepare(this.sql).all(...this.params).map(r => Object.values(r)); }
  exec() {
    const stmt = this.sqlite.prepare(this.sql);
    return stmt.columns().length ? { success: true, results: stmt.all(...this.params).map(r => ({ ...r })), meta: {} }
      : (stmt.run(...this.params), { success: true, results: [], meta: {} });
  }
}

export function fakeD1({ migrate = true } = {}) {
  const sqlite = new DatabaseSync(':memory:');
  if (migrate) {
    for (const file of readdirSync(MIGRATIONS).filter(f => f.endsWith('.sql')).sort()) {
      sqlite.exec(readFileSync(new URL(file, MIGRATIONS), 'utf8'));
    }
  }
  return {
    sqlite,
    prepare: sql => {
      // D1 refuses a compound SELECT of more than a few terms (1 Oct 2026:
      // 11 UNION ALLs failed with "too many terms in compound SELECT").
      if ((sql.match(/\bUNION\b/gi) || []).length > 4) throw new Error('D1_ERROR: too many terms in compound SELECT: SQLITE_ERROR');
      return new Statement(sqlite, sql);
    },
    // All or nothing, as in D1.
    async batch(statements) {
      sqlite.exec('BEGIN');
      try {
        const results = statements.map(s => s.exec());
        sqlite.exec('COMMIT');
        return results;
      } catch (e) {
        sqlite.exec('ROLLBACK');
        throw e;
      }
    },
    async exec(sql) { sqlite.exec(sql); return { count: 1, duration: 0 }; }
  };
}

export function fakeR2() {
  const objects = new Map();
  const object = (key, value) => ({ key, size: value.length, text: async () => value, json: async () => JSON.parse(value) });
  return {
    objects,
    meta: new Map(),
    async put(key, value, options) {
      objects.set(key, value instanceof ArrayBuffer ? new TextDecoder().decode(value) : String(value));
      if (options) this.meta.set(key, options);
      return { key };
    },
    async get(key) { return objects.has(key) ? object(key, objects.get(key)) : null; },
    async head(key) { return objects.has(key) ? { key, size: objects.get(key).length } : null; },
    async delete(keys) { for (const k of [].concat(keys)) objects.delete(k); },
    async list({ prefix = '', delimiter } = {}) {
      const keys = [...objects.keys()].filter(k => k.startsWith(prefix)).sort();
      if (!delimiter) return { objects: keys.map(k => ({ key: k, size: objects.get(k).length })), delimitedPrefixes: [], truncated: false };
      const prefixes = new Set(), direct = [];
      for (const k of keys) {
        const at = k.indexOf(delimiter, prefix.length);
        if (at === -1) direct.push({ key: k });
        else prefixes.add(k.slice(0, at + 1));
      }
      return { objects: direct, delimitedPrefixes: [...prefixes], truncated: false };
    }
  };
}
