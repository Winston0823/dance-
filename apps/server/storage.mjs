import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomBytes } from "node:crypto";

export const token = () => randomBytes(32).toString("base64url");
export const hash = (value) => createHash("sha256").update(value).digest("hex");
export const uid = () => randomBytes(12).toString("hex");

export function openStore(dataDir) {
  mkdirSync(join(dataDir, "media"), { recursive: true });
  const db = new DatabaseSync(join(dataDir, "danceform.sqlite"));
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS routines (
      id TEXT PRIMARY KEY, title TEXT NOT NULL, document TEXT NOT NULL,
      version INTEGER NOT NULL, updated_at TEXT NOT NULL, published_revision_id TEXT
    );
    CREATE TABLE IF NOT EXISTS revisions (
      id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines(id),
      revision_number INTEGER NOT NULL, draft_version INTEGER NOT NULL, document TEXT NOT NULL,
      created_at TEXT NOT NULL, review_note TEXT,
      UNIQUE(routine_id, draft_version), UNIQUE(routine_id, revision_number)
    );
    CREATE TABLE IF NOT EXISTS shares (
      id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines(id),
      token_hash TEXT NOT NULL UNIQUE, label TEXT NOT NULL,
      created_at TEXT NOT NULL, expires_at TEXT NOT NULL, revoked_at TEXT
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, role TEXT NOT NULL, share_id TEXT REFERENCES shares(id),
      actor_id TEXT NOT NULL, display_name TEXT NOT NULL, expires_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines(id),
      revision_id TEXT REFERENCES revisions(id),
      actor_id TEXT NOT NULL, display_name TEXT NOT NULL, tick INTEGER NOT NULL,
      dancer_id TEXT, section_id TEXT, text TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS acknowledgments (
      revision_id TEXT NOT NULL REFERENCES revisions(id), actor_id TEXT NOT NULL,
      display_name TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(revision_id, actor_id)
    );
    CREATE TABLE IF NOT EXISTS assets (
      id TEXT PRIMARY KEY, routine_id TEXT NOT NULL REFERENCES routines(id),
      name TEXT NOT NULL, mime TEXT NOT NULL, bytes INTEGER NOT NULL,
      content_hash TEXT NOT NULL, stored_name TEXT NOT NULL, created_at TEXT NOT NULL
    );
    PRAGMA user_version=1;
  `);
  return db;
}

export function transaction(db, fn) {
  db.exec("BEGIN IMMEDIATE");
  try {
    const value = fn();
    db.exec("COMMIT");
    return value;
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}
