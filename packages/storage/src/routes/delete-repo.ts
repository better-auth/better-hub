import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { storageMiddleware } from "../lib/middleware";
import { storage } from "..";
import * as z from "zod/v4";
import { storageAdapter } from "../adapter";

const body = z.object({
	id: z.string(),
});

export const deleteRepo = createAuthEndpoint(
	"/storage/delete-repo",
	{
		method: "POST",
		use: [sessionMiddleware, storageMiddleware],
		body,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);

		// TODO: Authorization check to ensure user has perms to delete the repo

		console.log(`checking if repo exists ${ctx.body.id}`);
		const repoExists = await adapter.checkRepoExistsById(ctx.body.id);
		console.log(`repo exists ${repoExists}`);
		if (!repoExists) {
			throw ctx.error("NOT_FOUND", {
				message: "Repository not found",
				code: "REPOSITORY_NOT_FOUND",
			});
		}
		await adapter.deleteRepo(ctx.body.id);
		try {
			await storage.deleteRepo({
				id: ctx.body.id,
			});
		} catch {
			throw ctx.error("NOT_FOUND", {
				message: "Repository not found",
				code: "REPOSITORY_NOT_FOUND",
			});
		}

		return ctx.json({ success: true });
	},
);
