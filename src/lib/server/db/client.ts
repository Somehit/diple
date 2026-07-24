import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';

const DB_PATH = process.env.DATABASE_PATH ?? './data/diple.db';

let db: Database.Database | null = null;

/** Get or create the singleton SQLite connection. */
export function getDb(): Database.Database {
	if (db) return db;

	// Ensure the parent directory exists
	const dir = path.dirname(DB_PATH);
	fs.mkdirSync(dir, { recursive: true });

	db = new Database(DB_PATH);
	db.pragma('journal_mode = WAL');
	db.pragma('foreign_keys = ON');
	return db;
}

/** Close the database connection (for testing / shutdown). */
export function closeDb(): void {
	db?.close();
	db = null;
}
