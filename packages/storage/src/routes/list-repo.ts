import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { storageMiddleware } from "../lib/middleware";
import { storageAdapter } from "../adapter";

export const listRepo = createAuthEndpoint(
	"/storage/list-repo",
	{
		method: "GET",
		use: [sessionMiddleware, storageMiddleware],
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const repos = await adapter.listRepos(ctx.context.session.user.id);
		return repos;
	},
);
