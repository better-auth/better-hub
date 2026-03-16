import { GitStorage } from "@pierre/storage";

export const storage = new GitStorage({
	name: "better-hub",
	key: process.env["GIT_STORAGE_PRIVATE_KEY"]!,
});
