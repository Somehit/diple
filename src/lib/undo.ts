import type { Block } from '$lib/server/db/queries';

/**
 * One atomic change to the tree, used as a building block for undo entries.
 * Convention: `before` = state before the action, `after` = state after.
 * Undo sets content/parent/position back to `before`.
 * Redo sets to `after`.
 */
export type Mutation =
	| { kind: 'create'; block: Block }
	| {
			kind: 'delete';
			block: Block;
			/**
			 * Present when the delete cascaded (multi-block selection): the block's
			 * descendants, parents first and siblings in ascending position order —
			 * the exact replay order undo needs for FK integrity and position
			 * shifts. Single-block deletes (Backspace) leave it undefined.
			 */
			descendants?: Block[];
	  }
	| { kind: 'update'; id: string; before: string; after: string }
	| {
			kind: 'move';
			id: string;
			from: { parent_id: string | null; position: number };
			to: { parent_id: string | null; position: number };
	  };

/**
 * One undoable unit: a batch of mutations produced by a single user gesture,
 * plus caret positions so we can restore focus after undo/redo.
 */
export type UndoEntry = {
	mutations: Mutation[];
	caretBefore: { id: string; offset: number };
	caretAfter: { id: string; offset: number };
};

const MAX_STACK = 200;

/** Plain imperative stack — no Svelte reactivity needed. */
export class UndoStack {
	private past: UndoEntry[] = [];
	private future: UndoEntry[] = [];

	/** Push a new entry. Clears the redo stack (standard behaviour). */
	push(entry: UndoEntry) {
		this.past.push(entry);
		this.future = [];
		if (this.past.length > MAX_STACK) {
			this.past = this.past.slice(-MAX_STACK);
		}
	}

	/** Pop the most recent entry. Moves it to the redo stack. */
	undo(): UndoEntry | null {
		const entry = this.past.pop();
		if (entry) this.future.push(entry);
		return entry ?? null;
	}

	/** Pop the most recent undone entry. Moves it back to undo. */
	redo(): UndoEntry | null {
		const entry = this.future.pop();
		if (entry) this.past.push(entry);
		return entry ?? null;
	}

	get canUndo(): boolean {
		return this.past.length > 0;
	}

	get canRedo(): boolean {
		return this.future.length > 0;
	}
}
