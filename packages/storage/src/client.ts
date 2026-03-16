import type { BetterAuthClientPlugin } from "better-auth";
import type { storagePlugin } from "./plugin";

export const storageClient = () => {
	return {
		id: "storage-client",
		$InferServerPlugin: {} as ReturnType<typeof storagePlugin>,
		pathMethods: {
			"/storage/delete-repo": "POST",
		},
	} satisfies BetterAuthClientPlugin;
};
