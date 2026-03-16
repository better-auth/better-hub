import { createAuthMiddleware } from "better-auth/api";
import type { parseSlugInit } from "./parse-slug";

export const storageMiddleware = createAuthMiddleware(async () => {
	return {} as {
		parseSlug: ReturnType<typeof parseSlugInit>;
	};
});
