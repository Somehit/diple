/**
 * Client-side view of the app's persistence health, feeding the sync dot.
 *
 * This app is a single-user, self-hosted backend (one SQLite file). There is
 * no remote sync server yet — `pendingRemote` is therefore always 0, kept in
 * the UI so the panel's shape doesn't change when real sync lands.
 *
 * - online: the app's own API answers (health ping). Meaningful once hosted:
 *   a user whose network drops can't reach the server even though the app is
 *   running locally.
 * - pendingLocal: mutations in flight (optimistically applied, not yet acked
 *   by the server). Failures flip `online` to false instead of counting —
 *   the editor rolls back those changes.
 * - lastChange: epoch ms of the last successful server write.
 */
export const sync = $state({
	online: false,
	pendingLocal: 0,
	pendingRemote: 0,
	lastChange: null as number | null
});

/** A mutation is being sent to the server. */
export function syncBegin(): void {
	sync.pendingLocal++;
}

/** The server acked a mutation — it's the last writer now. */
export function syncCommit(): void {
	sync.pendingLocal = Math.max(0, sync.pendingLocal - 1);
	sync.lastChange = Date.now();
}

/** A mutation failed — the client and server may have diverged. */
export function syncFail(): void {
	sync.pendingLocal = Math.max(0, sync.pendingLocal - 1);
	sync.online = false;
}
