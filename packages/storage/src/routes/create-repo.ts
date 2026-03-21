import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { storageAdapter } from "../adapter";
import * as z from "zod/v4";
import {
	repositoryDescriptionSchema,
	repositoryNameSchema,
	repositoryVisibilitySchema,
	slugSchema,
} from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { gitStorage } from "../git-storage";

const body = z.object({
	name: repositoryNameSchema,
	slug: slugSchema,
	description: repositoryDescriptionSchema,
	visibility: repositoryVisibilitySchema,
});

export const createRepo = createAuthEndpoint(
	"/storage/create-repo",
	{
		method: "POST",
		use: [sessionMiddleware, storageMiddleware],
		body,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const { user } = ctx.context.session;
		const data = { ...ctx.body, user };

		const [org, repo] = await ctx.context.parseSlug(data.slug, { getOrg: true });

		if (!org) {
			throw ctx.error("BAD_REQUEST", {
				message: "Organization not found",
				code: "ORGANIZATION_NOT_FOUND",
			});
		}
		if (!repo) {
			throw ctx.error("BAD_REQUEST", {
				message: "Repository slug is invalid",
				code: "INVALID_REPOSITORY_SLUG",
			});
		}

		const result = await adapter.createRepo(data);
		if ("repository" in result) {
			const repository = await gitStorage.createRepo({
				id: result.repository.id,
			});
			const remoteURL = await repository.getRemoteURL({
				permissions: ["git:read", "git:write", "org:read", "repo:write"],
			});

			const defaultBranch = repository.defaultBranch;

			const value = {
				remoteURL,
				defaultBranch,
				repository: result.repository,
			};

			console.log(`Repository created:`, value);

			return value;
		}

		throw result;
	},
);
