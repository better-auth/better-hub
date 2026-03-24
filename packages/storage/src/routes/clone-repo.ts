import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import { storageAdapter } from "../adapter";
import * as z from "zod/v4";
import { slugSchema } from "../zod-schema";
import { storageMiddleware } from "../lib/middleware";
import { createRepo } from "./create-repo";
import type { Visibility } from "../db-schema";
import { isValidSlugSyntax } from "../lib/parse-slug";

const body = z.object({
	slug: slugSchema,
	newSlug: slugSchema.optional(),
	newName: z.string().optional(),
	newVisibility: z.enum(["public", "private"]).optional(),
	newDescription: z.string().optional(),
});

export const cloneRepo = createAuthEndpoint(
	"/storage/clone-repo",
	{
		method: "POST",
		use: [sessionMiddleware, storageMiddleware],
		body,
	},
	async (ctx) => {
		const adapter = storageAdapter(ctx);
		const repo = await adapter.findRepoBySlug(ctx.body.slug);

		if (!repo) {
			throw ctx.error("NOT_FOUND", {
				message: "Repository not found or you don't have access",
				code: "REPOSITORY_NOT_FOUND",
			});
		}

		// if for some reason the existing repo that is trying to be clone has an invalid slug:
		if (!isValidSlugSyntax(repo.slug)) {
			throw ctx.error("UNPROCESSABLE_ENTITY", {
				message: "Upstream repository slug is invalid",
				code: "INVALID_UPSTREAM_REPOSITORY_SLUG",
			});
		}

		const data = {
			name: repo.name,
			slug: (repo.slug + `-clone`) as `${string}/${string}`,
			visibility: repo.visibility as Visibility,
			description: repo.description ?? undefined,
		};

		if (ctx.body.newName) {
			data.name = ctx.body.newName;
		}
		if (ctx.body.newSlug) {
			if (!isValidSlugSyntax(ctx.body.newSlug)) {
				throw ctx.error("BAD_REQUEST", {
					message: "Invalid slug syntax",
					code: "INVALID_SLUG_SYNTAX",
				});
			}
			data.slug = ctx.body.newSlug as `${string}/${string}`;
		}
		if (ctx.body.newVisibility) {
			data.visibility = ctx.body.newVisibility as Visibility;
		}
		if (ctx.body.newDescription) {
			data.description = ctx.body.newDescription;
		}

		const result = await createRepo({
			body: data,
			headers: ctx.headers,
		});

		return result;
	},
);
