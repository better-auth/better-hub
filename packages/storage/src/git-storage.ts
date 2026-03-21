import { GitStorage } from "@pierre/storage";

const name = process.env["GIT_STORAGE_NAME"] ?? "better-hub";
const key = process.env["GIT_STORAGE_PRIVATE_KEY"];

if (!key) {
	throw new Error("Missing GIT_STORAGE_PRIVATE_KEY environment variable");
}

/** Package-private Pierre client — not re-exported from the package root. */
export const gitStorage = new GitStorage({ name, key });
