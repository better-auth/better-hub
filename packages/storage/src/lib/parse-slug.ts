import type { AuthContext } from "better-auth";
import type { Organization } from "better-auth/plugins";
import type { Repository } from "../db-schema";
import { slugSchema } from "../zod-schema";

export const parseSlugInit =
	(ctx: AuthContext) =>
	/**
	 * Helper to parse a string slug into [organization, repository]
	 * Additionally, you can pass `getOrg` or `getRepo` to get the organization or repository object instead of the slug
	 * @returns
	 */
	async <O extends boolean = false, R extends boolean = false>(
		slug: `${string}/${string}`,
		options?: { getOrg?: O; getRepo?: R },
	): Promise<
		[
			organization: (O extends true ? Organization : string) | null,
			repository: (R extends true ? Repository : string) | null,
		]
	> => {
		const adapter = ctx.adapter;
		const [organization, repository] = slug.split("/");
		let result: Record<"organization" | "repository", any> = {
			organization: null,
			repository: null,
		};

		if (!organization) {
			result.organization = null;
		} else if (options?.getOrg) {
			const organizationValue = await adapter.findOne({
				model: "organization",
				where: [{ field: "slug", value: organization }],
			});
			result.organization = organizationValue;
		} else {
			result.organization = organization;
		}

		if (!repository) {
			result.repository = null;
		} else if (options?.getRepo) {
			const repositoryValue = await adapter.findOne({
				model: "repository",
				where: [{ field: "slug", value: repository }],
			});
			result.repository = repositoryValue;
		} else {
			result.repository = repository;
		}
		return [result.organization, result.repository] as any;
	};

/**
 * Returns a boolean indicating if the slug is valid in terms of syntax
 * Example:
 * ```ts
 * if (ctx.body.newSlug) {
 *     const isValidSlug = validateSlugSyntax(ctx.body.newSlug);
 *     if (!isValidSlug) {
 *         throw ctx.error("BAD_REQUEST", {
 *             message: "Invalid slug syntax",
 *             code: "INVALID_SLUG_SYNTAX",
 *         });
 *     }
 * }
 * ```
 * @param slug
 * @returns
 */
export const isValidSlugSyntax = (slug: string | `${string}/${string}`) => {
	return slugSchema.safeParse(slug).success;
};
