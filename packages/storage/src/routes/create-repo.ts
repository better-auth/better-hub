import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { storageAdapter } from "../adapter";
import * as z from "zod/v4";
import { slugSchema } from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { storage } from "..";

const body = z.object({
	name: z.string().min(1),
	slug: slugSchema,
	description: z.string().optional(),
	visibility: z.enum(["public", "private"]),
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
			const repository = await storage.createRepo({
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
