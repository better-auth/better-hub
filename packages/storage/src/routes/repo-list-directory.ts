import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod/v4";
import { slugSchema } from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { storageAdapter } from "../adapter";
import { gitStorage } from "../git-storage";
import { listStorageDirectoryFromRemote } from "../lib/storage-tree";

const query = z.object({
	slug: slugSchema,
	ref: z.string().optional(),
	pathPrefix: z.string().optional(),
});

export const repoListDirectory = createAuthEndpoint(
	"/storage/repo/list-directory",
	{
		method: "GET",
		use: [sessionMiddleware, storageMiddleware],
		query,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const { slug, ref, pathPrefix } = ctx.query;
		const repo = await adapter.findRepoBySlugForUser(slug, ctx.context.session.user.id);
		if (!repo) {
			throw ctx.error("NOT_FOUND", {
				message: "Repository not found or you don't have access",
				code: "REPOSITORY_NOT_FOUND",
			});
		}

		const remote = await gitStorage.findOne({ id: repo.id });
		if (!remote) {
			throw ctx.error("NOT_FOUND", {
				message: "Repository not found or you don't have access",
				code: "REPOSITORY_NOT_FOUND",
			});
		}

		const opts: { ref?: string; pathPrefix: string } = {
			pathPrefix: pathPrefix ?? "",
		};
		if (ref !== undefined) opts.ref = ref;
		return listStorageDirectoryFromRemote(remote, opts);
	},
);
