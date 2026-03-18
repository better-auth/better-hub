import { spawn } from "node:child_process";
import { Command } from "commander";
import pc from "picocolors";
import { select, isCancel, cancel, outro, log } from "@clack/prompts";
import {
	fuzzyFindRepos,
	getRepoEntries,
	listRegisteredRepos,
	pruneStaleRepos,
} from "../lib/repo-registry.js";
import { betterHubIntro } from "../lib/intro.js";

export const cdCommand = new Command("cd")
	.description("Change the current working directory to a repository")
	.argument("[slug]", "Repository slug (org/name)")
	.action(async (slug?: string) => {
		betterHubIntro("Change Directory");

		const pruned = pruneStaleRepos();
		if (pruned.length > 0) {
			log.warn(
				`Removed ${pruned.length} stale ${pruned.length === 1 ? "repo" : "repos"} (path no longer exists): ${pruned.map((r) => pc.dim(r.slug)).join(", ")}`,
			);
		}

		if (!slug) {
			const repos = listRegisteredRepos();
			if (!repos.length) {
				log.step(`${pc.bold("No repositories found")} ${pc.red("✗")}`);
				outro(pc.dim("You don't have any repositories to go to."));
				process.exit(0);
			}

			const selected = await select({
				message: "Select a repository:",
				options: repos.map((r) => {
					const segments = r.slug.split("/");
					return {
						label: `${pc.cyan(segments[0]! + "/")}${pc.cyan(pc.bold(segments[1]!))} ${pc.dim(r.path)}`,
						value: { slug: r.slug, path: r.path } as const,
					};
				}),
			});

			if (isCancel(selected)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			const segments = selected.slug.split("/");
			outro(
				pc.green(`${pc.bold("Directory changed to")}`) +
					" " +
					`${pc.cyan(segments[0]! + "/")}${pc.cyan(pc.bold(segments[1]!))}`,
			);

			spawn(process.env["SHELL"]!, {
				stdio: "inherit",
				cwd: selected.path,
			});
			return;
		}

		let repoPath: string | null = null;

		const exactEntries = getRepoEntries(slug);
		if (exactEntries.length === 1) {
			repoPath = exactEntries[0]!.path;
		} else if (exactEntries.length > 1) {
			const selected = await select({
				message: `Multiple clones of "${slug}":`,
				options: exactEntries.map((e) => ({
					label: `${pc.cyan(e.slug)} ${pc.dim(e.path)}`,
					value: e.path,
				})),
			});

			if (isCancel(selected)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			repoPath = selected;
		}

		if (!repoPath) {
			const matches = fuzzyFindRepos(slug);

			if (matches.length === 0) {
				console.error(
					pc.red(
						`No repositories matching "${slug}" found in local registry.`,
					),
				);
				console.error(
					pc.dim(
						"Registered repos are tracked when you create them with `bh repo create`.",
					),
				);
				process.exit(1);
			}

			if (matches.length === 1) {
				slug = matches[0]!.entry.slug;
				repoPath = matches[0]!.entry.path;
			} else {
				const selected = await select({
					message: `Multiple repos match "${slug}":`,
					options: matches.map((m) => ({
						label: `${pc.cyan(m.entry.slug)} ${pc.dim(m.entry.path)}`,
						value: m.entry.path,
					})),
				});

				if (isCancel(selected)) {
					cancel("Operation cancelled.");
					process.exit(0);
				}

				repoPath = selected;
				const match = matches.find((m) => m.entry.path === selected);
				if (match) slug = match.entry.slug;
			}
		}

		const segments = slug.split("/");

		outro(
			pc.green(`${pc.bold("Directory changed to")}`) +
				" " +
				`${pc.cyan(segments[0]! + "/")}${pc.cyan(pc.bold(segments[1]!))}`,
		);

		spawn(process.env["SHELL"]!, {
			stdio: "inherit",
			cwd: repoPath,
		});
	});
