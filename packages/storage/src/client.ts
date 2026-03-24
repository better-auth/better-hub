import type { BetterAuthClientPlugin } from "better-auth";
import type { storagePlugin } from "./plugin";

export const storageClient = () => {
	return {
		id: "storage-client",
		$InferServerPlugin: {} as ReturnType<typeof storagePlugin>,
		pathMethods: {
			"/storage/clone-repo": "POST",
			"/storage/delete-repo": "POST",
			"/storage/repo/commit-detail": "GET",
			"/storage/repo/commits": "GET",
			"/storage/repo/file": "GET",
			"/storage/repo/git-meta": "GET",
			"/storage/repo/list-directory": "GET",
		},
	} satisfies BetterAuthClientPlugin;
};
