import fs from 'node:fs';
import { DB_PATH } from './db/client';

/**
 * Server-side last-write bookkeeping, fed to GET /api/health for the sync dot.
 *
 * Primary source: an in-memory timestamp touched by every mutation endpoint
 * (precise, no I/O). Fallback: the DB file's mtime, which survives server
 * restarts — both the main file and its `-wal` companion are checked, since
 * WAL mode writes land in the -wal file first (checkpoints move them back).
 */
let lastWriteMs: number | null = null;

/** Called by mutation endpoints right after the write succeeds. */
export function touchLastChange(): void {
	lastWriteMs = Date.now();
}

/** Latest known write (epoch ms) — memory, else max(db, -wal) mtime, else null. */
export function lastChangeMs(): number | null {
	let max = lastWriteMs ?? 0;
	for (const p of [DB_PATH, `${DB_PATH}-wal`]) {
		try {
			max = Math.max(max, fs.statSync(p).mtimeMs);
		} catch {
			// File doesn't exist yet (never written) — not a valid timestamp.
		}
	}
	return max || null;
}
