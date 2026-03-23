import type { BetterAuthPlugin } from "better-auth";
import { storageSchema } from "./db-schema";
import { parseSlugInit } from "./lib/parse-slug";
import { cloneRepo } from "./routes/clone-repo";
import { createRepo } from "./routes/create-repo";
import { listRepo } from "./routes/list-repo";
import { deleteRepo } from "./routes/delete-repo";
import { repoCommitDetail } from "./routes/repo-commit-detail";
import { repoCommits } from "./routes/repo-commits";
import { repoFile } from "./routes/repo-file";
import { repoGitMeta } from "./routes/repo-git-meta";
import { repoListDirectory } from "./routes/repo-list-directory";

export const storagePlugin = () => {
	return {
		id: "storage",
		schema: storageSchema,
		init(ctx) {
			return {
				context: {
					...ctx,
					parseSlug: parseSlugInit(ctx),
				},
			};
		},
		endpoints: {
			cloneRepo: cloneRepo,
			createRepo: createRepo,
			listRepo: listRepo,
			deleteRepo: deleteRepo,
			repoCommitDetail: repoCommitDetail,
			repoCommits: repoCommits,
			repoFile: repoFile,
			repoGitMeta: repoGitMeta,
			repoListDirectory: repoListDirectory,
		},
	} satisfies BetterAuthPlugin;
};
