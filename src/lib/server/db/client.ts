import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { ensureSchema } from './schema.js';

let db: Database.Database | null = null;

export function getDb(): Database.Database {
	if (db) return db;

	const dbPath = process.env.DATABASE_PATH || './data/diple.db';
	mkdirSync(dirname(dbPath), { recursive: true });

	db = new Database(dbPath);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');

	ensureSchema(db);

	return db;
}
