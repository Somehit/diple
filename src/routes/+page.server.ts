import { listBlocks } from '$lib/server/db/blocks.js';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = () => {
	return { blocks: listBlocks() };
};
