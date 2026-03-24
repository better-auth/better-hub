import type { BetterAuthDBSchema, InferDBFieldsOutput } from "better-auth";
import * as z from "zod/v4";

export const storageSchema = {
	repository: {
		fields: {
			name: {
				type: "string",
				required: true,
			},
			// slug example: `<owner>/<repo>`
			slug: {
				type: "string",
				required: true,
				unique: true,
				validator: {
					input: z.templateLiteral([
						z
							.string()
							.min(1)
							.max(100)
							.regex(/^[-a-z0-9]+$/),
						"/",
						z
							.string()
							.min(1)
							.max(100)
							.regex(/^[-a-z0-9]+$/),
					]),
				},
			},
			createdAt: {
				type: "date",
				required: true,
			},
			updatedAt: {
				type: "date",
				required: false,
			},
			description: {
				type: "string",
				required: false,
			},
			visibility: {
				type: "string",
				required: true,
			},
		},
		modelName: "repository",
	},
	repositoryMember: {
		fields: {
			repositoryId: {
				type: "string",
				required: true,
				references: {
					model: "repository",
					field: "id",
				},
			},
			userId: {
				type: "string",
				required: true,
				references: {
					model: "user",
					field: "id",
				},
			},
			createdAt: {
				type: "date",
				required: true,
			},
			updatedAt: {
				type: "date",
				required: false,
			},
		},
		modelName: "repositoryMember",
	},
} satisfies BetterAuthDBSchema;
type StorageSchema = typeof storageSchema;

// Helpers
type ID = { id: string };
export type GetFields<T extends keyof StorageSchema> = InferDBFieldsOutput<
	StorageSchema[T]["fields"]
>;

// Specific Types
export type Visibility = "public" | "private";

// Model Types
export type Repository = GetFields<"repository"> & { visibility: Visibility } & ID;
export type RepositoryInput = GetFields<"repository"> & { visibility: Visibility } & ID; // ID is included - we map our own IDs to Code.Storage repo IDs
export type RepositoryMember = GetFields<"repositoryMember"> & ID;
export type RepositoryMemberInput = GetFields<"repositoryMember">;
