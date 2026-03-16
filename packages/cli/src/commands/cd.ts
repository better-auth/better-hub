import { spawn } from "node:child_process";
import { Command } from "commander";
import pc from "picocolors";
import { select, isCancel, cancel, outro, log } from "@clack/prompts";
import { fuzzyFindRepos, getRepoPath, listRegisteredRepos } from "../lib/repo-registry.js";
import { betterHubIntro } from "../lib/intro.js";

export const cdCommand = new Command("cd")
	.description("Change the current working directory to a repository")
	.argument("[slug]", "Repository slug (org/name)")
	.action(async (slug?: string) => {
		betterHubIntro("Change Directory");
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
						value: r.slug,
					};
				}),
			});

			if (isCancel(selected)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			slug = selected;
		}

		let repoPath = getRepoPath(slug);

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
					options: matches.map((m) => {
						const segments = m.entry.slug.split("/");
						return {
							label: `${pc.cyan(segments[0]! + "/")}${pc.cyan(pc.bold(segments[1]!))} ${pc.dim(m.entry.path)}`,
							value: m.entry.slug,
						};
					}),
				});

				if (isCancel(selected)) {
					cancel("Operation cancelled.");
					process.exit(0);
				}

				slug = selected;
				repoPath = getRepoPath(slug)!;
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
