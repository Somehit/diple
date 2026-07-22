import { SvelteMap } from 'svelte/reactivity';

export interface Block {
	id: string;
	parent_id: string | null;
	content: string;
	position: number;
	created_at: number;
	updated_at: number;
}

export class TreeStore {
	blocks = new SvelteMap<string, Block>();
	focusedId = $state<string | null>(null);
	caretPos = $state<number | null>(null);
	onError: (() => void) | null = null;

	constructor(initial: Block[]) {
		for (const b of initial) this.blocks.set(b.id, b);
	}

	// --- read ---

	roots(): Block[] {
		return [...this.blocks.values()]
			.filter((b) => b.parent_id === null)
			.sort((a, b) => a.position - b.position);
	}

	childrenOf(parentId: string | null): Block[] {
		return [...this.blocks.values()]
			.filter((b) => b.parent_id === parentId)
			.sort((a, b) => a.position - b.position);
	}

	flatList(): Block[] {
		const out: Block[] = [];
		const walk = (parentId: string | null) => {
			for (const child of this.childrenOf(parentId)) {
				out.push(child);
				walk(child.id);
			}
		};
		walk(null);
		return out;
	}

	prevSibling(id: string): Block | null {
		const block = this.blocks.get(id);
		if (!block) return null;
		const siblings = this.childrenOf(block.parent_id);
		const idx = siblings.findIndex((b) => b.id === id);
		return idx > 0 ? siblings[idx - 1] : null;
	}

	// --- mutations ---

	async create(parentId: string | null, content: string = '', position?: number): Promise<string> {
		const id = crypto.randomUUID();
		const pos = position ?? this.childrenOf(parentId).length;
		const now = Date.now();

		// shift siblings to make room at position
		for (const sib of this.childrenOf(parentId)) {
			if (sib.position >= pos) {
				this.blocks.set(sib.id, { ...sib, position: sib.position + 1 });
			}
		}

		const block: Block = {
			id,
			parent_id: parentId,
			content,
			position: pos,
			created_at: now,
			updated_at: now
		};
		this.blocks.set(id, block);

		try {
			const res = await fetch('/api/blocks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op: 'create', id, parentId, position: pos, content })
			});
			if (!res.ok) throw new Error('create failed');
		} catch {
			this.blocks.delete(id);
			this.onError?.();
		}
		return id;
	}

	saveContent(id: string, content: string): void {
		const block = this.blocks.get(id);
		if (!block) return;

		this.blocks.set(id, { ...block, content, updated_at: Date.now() });

		// fire-and-forget — content saves are best-effort in v0.1
		fetch('/api/blocks', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ op: 'update', id, content })
		}).catch(() => {});
	}

	async deleteBlock(id: string): Promise<string | null> {
		const block = this.blocks.get(id);
		if (!block) return null;

		const prevId = this.previousVisibleId(id);

		// Remove block and all descendants from local state
		this.removeRecursive(id);

		try {
			const res = await fetch('/api/blocks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op: 'delete', id })
			});
			if (!res.ok) throw new Error('delete failed');
		} catch {
			this.onError?.();
		}
		return prevId;
	}

	async indent(id: string): Promise<void> {
		const block = this.blocks.get(id);
		if (!block) return;

		const prev = this.prevSibling(id);
		if (!prev) return;

		const newParentId = prev.id;
		const newPosition = this.childrenOf(prev.id).length;
		const oldParentId = block.parent_id;
		const oldPosition = block.position;

		// apply locally (optimistic)
		this.blocks.set(id, { ...block, parent_id: newParentId, position: newPosition });
		this.shiftSiblingsUp(oldParentId, oldPosition);

		try {
			const res = await fetch('/api/blocks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op: 'indent', id })
			});
			if (!res.ok) throw new Error('indent failed');
		} catch {
			this.onError?.();
		}
	}

	async outdent(id: string): Promise<void> {
		const block = this.blocks.get(id);
		if (!block || block.parent_id === null) return;

		const parent = this.blocks.get(block.parent_id);
		if (!parent) return;

		const newParentId = parent.parent_id;
		const newPosition = parent.position + 1;
		const oldParentId = block.parent_id;
		const oldPosition = block.position;

		// shift later siblings in new parent to make room
		this.shiftSiblingsDown(newParentId, newPosition);
		// close gap in old parent
		this.shiftSiblingsUp(oldParentId, oldPosition);
		// move
		this.blocks.set(id, { ...block, parent_id: newParentId, position: newPosition });

		try {
			const res = await fetch('/api/blocks', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ op: 'outdent', id })
			});
			if (!res.ok) throw new Error('outdent failed');
		} catch {
			this.onError?.();
		}
	}

	// --- helpers ---

	private removeRecursive(id: string): void {
		for (const child of this.childrenOf(id)) {
			this.removeRecursive(child.id);
		}
		this.blocks.delete(id);
	}

	private shiftSiblingsUp(parentId: string | null, afterPosition: number): void {
		for (const sib of this.childrenOf(parentId)) {
			if (sib.position > afterPosition) {
				this.blocks.set(sib.id, { ...sib, position: sib.position - 1 });
			}
		}
	}

	private shiftSiblingsDown(parentId: string | null, fromPosition: number): void {
		for (const sib of this.childrenOf(parentId)) {
			if (sib.position >= fromPosition) {
				this.blocks.set(sib.id, { ...sib, position: sib.position + 1 });
			}
		}
	}

	private previousVisibleId(id: string): string | null {
		const flat = this.flatList();
		const idx = flat.findIndex((b) => b.id === id);
		return idx > 0 ? flat[idx - 1].id : null;
	}
}
