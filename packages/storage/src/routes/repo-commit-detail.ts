import { ApiError } from "@pierre/storage";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import * as z from "zod/v4";
import { slugSchema } from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { storageAdapter } from "../adapter";
import { gitStorage } from "../git-storage";
import { branchListIncludesRef } from "../lib/storage-tree";
import { findCommitMetadataInBranch } from "../lib/storage-commit-walk";
import { buildCommitDetailPayload } from "../lib/map-storage-commit-detail";

const query = z.object({
	slug: slugSchema,
	sha: z.string().min(1),
	branch: z.string().optional(),
});

export const repoCommitDetail = createAuthEndpoint(
	"/storage/repo/commit-detail",
	{
		method: "GET",
		use: [sessionMiddleware, storageMiddleware],
		query,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const { slug, sha, branch: branchParam } = ctx.query;
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
			throw ctx.error("NOT_FOUND", {
				message: "No branches",
				code: "NO_BRANCHES",
			});
		}

		const branch = branchParam ?? remote.defaultBranch;
		if (!branchListIncludesRef(branches, branch)) {
			throw ctx.error("NOT_FOUND", {
				message: "Branch not found",
				code: "BRANCH_NOT_FOUND",
			});
		}

		const meta = await findCommitMetadataInBranch(remote, branch, sha);
		const fullSha = meta?.sha ?? sha;

		let diff;
		try {
			diff = await remote.getCommitDiff({ sha: fullSha });
		} catch (e) {
			if (e instanceof ApiError && e.status === 404) {
				throw ctx.error("NOT_FOUND", {
					message: "Commit not found",
					code: "COMMIT_NOT_FOUND",
				});
			}
			throw e;
		}

		const repoBasePath = `/s/${slug}`;
		return buildCommitDetailPayload(fullSha, meta, diff, repoBasePath);
	},
);
