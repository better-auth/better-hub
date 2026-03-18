import type { BetterAuthPlugin } from "better-auth";
import { storageSchema } from "./db-schema";
import { parseSlugInit } from "./lib/parse-slug";
import { cloneRepo } from "./routes/clone-repo";
import { createRepo } from "./routes/create-repo";
import { listRepo } from "./routes/list-repo";
import { deleteRepo } from "./routes/delete-repo";

export const storagePlugin = () => {
	return {
		id: "storage",
		schema: storageSchema,
		init(ctx) {
			return {
				context: {
					...ctx,
					parseSlug: parseSlugInit(ctx),
				},
			};
		},
		endpoints: {
			cloneRepo: cloneRepo,
			createRepo: createRepo,
			listRepo: listRepo,
			deleteRepo: deleteRepo,
		},
	} satisfies BetterAuthPlugin;
};
