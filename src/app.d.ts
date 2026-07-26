// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		// interface Locals {}
		// interface PageData {}
		/** Shallow-routing state. `zoom` tracks the current zoom level (block id or null for root). */
		interface PageState {
			zoom?: string | null;
		}
		// interface Platform {}
	}
}

export {};
