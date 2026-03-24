import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod/v4";
import { slugSchema } from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { storageAdapter } from "../adapter";
import { gitStorage } from "../git-storage";
import { branchListIncludesRef } from "../lib/storage-tree";
import { commitInfoToGithubListRow } from "../lib/map-storage-commit-detail";

const query = z.object({
	slug: slugSchema,
	branch: z.string().optional(),
	cursor: z.string().optional(),
	limit: z.coerce.number().min(1).max(100).optional(),
});

export const repoCommits = createAuthEndpoint(
	"/storage/repo/commits",
	{
		method: "GET",
		use: [sessionMiddleware, storageMiddleware],
		query,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const { slug, branch: branchParam, cursor, limit } = ctx.query;
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
		if (branches.length === 0) {
			return {
				commits: [],
				nextCursor: null,
				hasMore: false,
			};
		}

		const branch = branchParam ?? remote.defaultBranch;
		if (!branchListIncludesRef(branches, branch)) {
			throw ctx.error("NOT_FOUND", {
				message: "Branch not found",
				code: "BRANCH_NOT_FOUND",
			});
		}

		const listOpts: { branch: string; cursor?: string; limit: number } = {
			branch,
			limit: limit ?? 30,
		};
		if (cursor !== undefined) listOpts.cursor = cursor;
		const page = await remote.listCommits(listOpts);

		return {
			commits: page.commits.map(commitInfoToGithubListRow),
			nextCursor: page.nextCursor ?? null,
			hasMore: page.hasMore,
		};
	},
);
