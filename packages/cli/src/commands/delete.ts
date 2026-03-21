import pc from "picocolors";
import { requireAuth } from "../lib/client.js";
import { getAuthClient } from "../lib/auth-client.js";
import { cancel, confirm, isCancel, log, outro, select, spinner } from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { getRepoEntries, syncRegistry, unregisterRepo } from "../lib/repo-registry.js";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import { Command } from "commander";

export const deleteRepoCommand = new Command("delete")
	.alias("remove")
	.alias("rm")
	.description("Delete a repository")
	.option("-s, --slug <slug>", "Repository slug (owner/name) to delete")
	.action(async (opts: { slug?: string }) => {
		requireAuth();
		const authClient = getAuthClient();
		const session = await authClient.getSession();

		if (session.error) {
			outro(pc.red(`Failed to get session: ${session.error.message}`));
			process.exit(1);
		}
		if (!session.data) {
			outro(pc.red("Not logged in. Run `better-hub auth login` first."));
			process.exit(1);
		}

		betterHubIntro("Delete a repository");

		const s = spinner({});
		s.start("Fetching repositories...");

		const repos = await authClient.storage.listRepo();
		if (repos.error) {
			s.stop(`${pc.bold("Failed to fetch repositories")} ${pc.red("✗")}`);
			outro(pc.red(repos.error.message));
			process.exit(1);
		}
		const serverSlugs = new Set((repos.data ?? []).map((r) => r.slug));
		syncRegistry(serverSlugs);

		if (!repos.data?.length) {
			s.stop(`${pc.bold("No repositories found")} ${pc.red("✗")}`);
			outro(pc.dim("You don't have any repositories to delete."));
			process.exit(0);
		}

		s.stop(`${pc.bold("Repositories loaded")} ${pc.green("✓")}`);

		let targetRepo: (typeof repos.data)[number] | undefined;

		if (opts.slug) {
			targetRepo = repos.data.find((r) => r.slug === opts.slug);
			if (!targetRepo) {
				outro(pc.red(`Repository "${opts.slug}" not found.`));
				process.exit(1);
			}
		} else {
			const selected = await select({
				message: `Select a repository to ${pc.bold(pc.red("delete"))}:`,
				options: repos.data.map((r) => ({
					label: `${r.name} ${pc.dim(`(${r.slug})`)}`,
					value: r.id,
					hint: r.visibility,
				})),
			});

			if (isCancel(selected)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			targetRepo = repos.data.find((r) => r.id === selected);
		}

		if (!targetRepo) {
			outro(pc.red("Repository not found."));
			process.exit(1);
		}

		log.warn(
			`You are about to delete ${pc.bold(pc.red(targetRepo.name))} ${pc.dim(`(${targetRepo.slug})`)}`,
		);

		const confirmed = await confirm({
			message: `Are you sure? ${pc.dim("This action cannot be undone.")}`,
			initialValue: false,
			active: pc.red("Confirm Deletion"),
			inactive: pc.green("Cancel"),
		});

		if (isCancel(confirmed) || !confirmed) {
			cancel("Deletion cancelled.");
			process.exit(0);
		}

		s.start(`${pc.bold("Deleting repository")} ${pc.dim(`(${targetRepo.slug})`)}...`);

		const result = await authClient.storage.deleteRepo({
			id: targetRepo.id,
		});

		if (result.error) {
			s.stop(
				`${pc.bold("Deletion failed")} ${pc.red("✗")} ${pc.dim(`(${targetRepo.id})`)}`,
			);
			outro(pc.red(`Failed to delete repository: ${result.error.message}`));
			console.error(result.error);
			process.exit(1);
		}

		const localEntries = getRepoEntries(targetRepo.slug).filter((e) =>
			existsSync(e.path),
		);
		unregisterRepo(targetRepo.slug);

		s.stop(`${pc.bold("Repository deleted")} ${pc.green("✓")}`);

		for (const entry of localEntries) {
			const deleteLocal = await confirm({
				message: `Delete local files at ${pc.dim(entry.path)}?`,
				initialValue: false,
				active: pc.red("Yes"),
				inactive: pc.green("No"),
			});

			if (isCancel(deleteLocal)) {
				cancel("Skipped remaining local cleanup.");
				break;
			}

			if (deleteLocal) {
				const ds = spinner({});
				ds.start("Removing local files...");
				try {
					await fs.rm(entry.path, { recursive: true, force: true });
					ds.stop(
						`${pc.bold("Local files removed")} ${pc.green("✓")}`,
					);
				} catch (err) {
					ds.stop(
						`${pc.bold("Failed to remove local files")} ${pc.red("✗")}`,
					);
					log.error(
						`Could not delete ${pc.dim(entry.path)}: ${err instanceof Error ? err.message : String(err)}`,
					);
				}
			}
		}

		outro(pc.green(`${pc.bold(targetRepo.name)} has been deleted.`));
	});
