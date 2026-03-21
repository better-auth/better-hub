import { APIError, type GenericEndpointContext, type User } from "better-auth";
import { gitStorage } from "./git-storage";
import type {
	RepositoryMember,
	Repository,
	RepositoryMemberInput,
	RepositoryInput,
	Visibility,
} from "./db-schema";

export const storageAdapter = (ctx: GenericEndpointContext) => {
	return {
		createRepo: async (options: {
			name: string;
			slug: `${string}/${string}`;
			user: User;
			visibility: Visibility;
			description?: string | undefined;
		}) => {
			const adapter = ctx.context.adapter;
			const repo = await gitStorage.createRepo();

			const repositoryData: RepositoryInput = {
				name: options.name,
				description: options.description,
				slug: options.slug,
				visibility: options.visibility,
				createdAt: new Date(),
				id: repo.id,
			};
			const repositoryMemberData: RepositoryMemberInput = {
				userId: options.user.id,
				repositoryId: repo.id,
				createdAt: new Date(),
			};

			const checkExisting = await adapter.findOne({
				model: "repository",
				where: [{ field: "slug", value: options.slug }],
				select: ["id"],
			});

			if (checkExisting) {
				throw new APIError("BAD_REQUEST", {
					message: "Repository already exists",
					code: "REPOSITORY_ALREADY_EXISTS",
				});
			}

			const result = await adapter.transaction(async (tx) => {
				const repository = await tx.create<Repository, RepositoryInput>({
					model: "repository",
					data: repositoryData as Repository,
					forceAllowId: true,
				});
				const repositoryMember = await tx.create<RepositoryMember>({
					model: "repositoryMember",
					data: repositoryMemberData,
				});
				return { repository, repositoryMember };
			});
			return result;
		},
		checkRepoExistsBySlug: async (slug: `${string}/${string}`) => {
			const adapter = ctx.context.adapter;
			const checkExisting = await adapter.findOne({
				model: "repository",
				where: [{ field: "slug", value: slug }],
				select: ["id"],
			});
			return !!checkExisting;
		},
		checkRepoExistsById: async (id: string) => {
			const adapter = ctx.context.adapter;
			const checkExisting = await adapter.findOne({
				model: "repository",
				where: [{ field: "id", value: id }],
				select: ["id"],
			});
			return !!checkExisting;
		},
		findRepoBySlug: async (slug: `${string}/${string}`) => {
			const adapter = ctx.context.adapter;
			const repo = await adapter.findOne<Repository>({
				model: "repository",
				where: [{ field: "slug", value: slug }],
			});
			return repo;
		},
		findRepoBySlugForUser: async (slug: `${string}/${string}`, userId: string) => {
			const adapter = ctx.context.adapter;
			const repo = await adapter.findOne<Repository>({
				model: "repository",
				where: [{ field: "slug", value: slug }],
			});
			if (!repo) return null;
			const member = await adapter.findOne({
				model: "repositoryMember",
				where: [
					{ field: "userId", value: userId },
					{ field: "repositoryId", value: repo.id },
				],
			});
			return member ? repo : null;
		},
		deleteRepo: async (id: string) => {
			const adapter = ctx.context.adapter;
			await adapter.delete({
				model: "repository",
				where: [{ field: "id", value: id }],
			});
			await adapter.deleteMany({
				model: "repositoryMember",
				where: [{ field: "repositoryId", value: id }],
			});
		},
		listRepos: async (userId: string) => {
			const adapter = ctx.context.adapter;
			const repositoryMembers = await adapter.findMany<RepositoryMember>({
				model: "repositoryMember",
				where: [{ field: "userId", value: userId }],
			});
			if (!repositoryMembers.length) return [];
			const repos = await adapter.findMany<Repository>({
				model: "repository",
				where: [
					{
						field: "id",
						value: repositoryMembers.map((r) => r.repositoryId),
						operator: "in",
					},
				],
			});
			return repos;
		},
	};
};
