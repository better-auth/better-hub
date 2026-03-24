import pc from "picocolors";
import { requireAuth } from "../lib/client.js";
import { getAuthClient } from "../lib/auth-client.js";
import { log, outro, spinner } from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { syncRegistry } from "../lib/repo-registry.js";
import { Command } from "commander";

export const listRepoCommand = new Command("list")
	.alias("ls")
	.description("List your repositories")
	.action(async () => {
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

		betterHubIntro("Your repositories");

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
			outro(pc.dim("Create one with `bh repo create`."));
			process.exit(0);
		}

		s.stop(
			`${pc.bold(`${repos.data.length} ${repos.data.length === 1 ? "repository" : "repositories"} found`)} ${pc.green("✓")}`,
		);

		const maxName = Math.max(...repos.data.map((r) => r.name.length));

		log.message(
			repos.data
				.map((r) => {
					const visibility =
						r.visibility === "private"
							? pc.yellow("private")
							: pc.green("public");
					return `  ${pc.bold(r.name.padEnd(maxName))}  ${pc.dim(r.slug)}  ${visibility}`;
				})
				.join("\n"),
		);

		outro(pc.dim(`Run ${pc.cyan("bh repo create")} to add a new repository.`));
	});
