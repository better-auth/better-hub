import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod/v4";
import { slugSchema } from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { storageAdapter } from "../adapter";
import { gitStorage } from "../git-storage";

const query = z.object({
	slug: slugSchema,
});

export const repoGitMeta = createAuthEndpoint(
	"/storage/repo/git-meta",
	{
		method: "GET",
		use: [sessionMiddleware, storageMiddleware],
		query,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const { slug } = ctx.query;
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

		const { branches } = await remote.listBranches();
		const branchRows = branches.map((b) => ({ name: b.name }));

		let files: Array<{ path: string; size: number }> | null = null;
		if (branches.length > 0) {
			try {
				const meta = await remote.listFilesWithMetadata({
					ref: remote.defaultBranch,
				});
				files = meta.files;
			} catch {
				files = null;
			}
		}

		return {
			defaultBranch: remote.defaultBranch,
			branches: branchRows,
			files,
		};
	},
);
