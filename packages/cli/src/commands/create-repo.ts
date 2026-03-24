import { Command } from "commander";
import { existsSync, mkdirSync } from "node:fs";
import { resolve, isAbsolute, basename, dirname } from "node:path";
import pc from "picocolors";
import { requireAuth } from "../lib/client.js";
import { getAuthClient } from "../lib/auth-client.js";
import {
	cancel,
	confirm,
	group,
	isCancel,
	log,
	outro,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { registerRepo } from "../lib/repo-registry.js";
import { exec, execSync } from "node:child_process";

export const createRepoCommand = new Command("create")
	.alias("init")
	.description("Create a new repository")
	.option("-n, --name <name>", "Repository name")
	.option("-s, --slug <slug>", "Repository slug (owner/name)")
	.option("-d, --description <desc>", "Repository description")
	.option("-v, --visibility <visibility>", "public or private", "public")
	.action(async (opts: { slug?: string; description?: string; visibility: string }) => {
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

		betterHubIntro("Create a new repository");

		const {
			description,
			name,
			path: path_,
			slug,
			visibility,
			segment,
		} = await group(
			{
				name: () => {
					return text({
						message: `Repository ${pc.bold("name")}: ${pc.dim("(not the slug)")}`,
						validate(value) {
							if (!value) return "Name is required";
						},
					});
				},
				segment: async ({ results }) => {
					const initial = results.name
						?.toLowerCase()
						.replace(/ /g, "-")
						.replace(/[^a-zA-Z0-9-_]/g, "");

					const segment = await text({
						message: `Repository ${pc.bold("slug")}:`,
						initialValue: initial ?? "",
						validate(value) {
							if (!value) return "Slug is required";
							if (!/^[a-zA-Z0-9-_]+$/.test(value)) {
								return "Slug can only contain letters, numbers, hyphens and underscores";
							}
						},
					});

					if (isCancel(segment)) {
						return segment;
					}
					return segment;
				},
				slug: async ({ results }) => {
					const organizations = await authClient.organization.list();
					if (organizations.error) {
						outro(
							pc.red(
								`Failed to list organizations: ${organizations.error.message}`,
							),
						);
						process.exit(1);
					}
					if (!organizations.data.length) {
						outro(
							pc.red(
								"No organizations found. Please sign into our dashboard.",
							),
						);
						process.exit(1);
					}
					if (organizations.data.length === 1) {
						log.step(
							`Select an ${pc.bold("organization")}:\n${pc.dim(organizations.data[0]!.slug)}`,
						);
						return `${organizations.data[0]!.slug}/${results.segment}`;
					}
					const organization = await select({
						message: `Select an ${pc.bold("organization")}:`,
						options: organizations.data.map((organization) => ({
							label: organization.name,
							value: organization.slug,
						})),
					});
					if (isCancel(organization)) {
						return organization;
					}
					return `${organization}/${results.segment}`;
				},
				description: async () => {
					const description = await text({
						message: `Repository ${pc.bold("description")}: ${pc.dim("(optional)")}`,
						defaultValue: "Skipped",
					});
					if (isCancel(description)) {
						return description;
					}
					if (description === "Skipped") {
						return undefined;
					}
					return description;
				},
				visibility: () => {
					return confirm({
						message: `Repository ${pc.bold("visibility")}:`,
						active: "public",
						inactive: "private",
					});
				},
				path: async ({ results }) => {
					const cwd = process.cwd();
					const confirmed = await confirm({
						message: `Create the repository in this directory? ${pc.dim(`(${cwd})`)}`,
						initialValue: true,
					});
					if (isCancel(confirmed)) {
						return confirmed;
					}
					if (confirmed) return cwd;
					const newPath = await text({
						message: `Directory path ${pc.dim("(relative or absolute)")}:`,
						placeholder: "./my-project",
						initialValue: `./${results.segment}`,
						validate(value) {
							if (!value?.trim())
								return "Path is required";
						},
					});
					if (isCancel(newPath)) {
						return newPath;
					}
					const resolved = isAbsolute(newPath)
						? resolve(newPath)
						: resolve(cwd, newPath);
					if (!existsSync(resolved)) {
						const dirName = basename(resolved);
						const dirParentPath = dirname(resolved);
						const shouldCreate = await confirm({
							message: `Directory ${pc.dim(dirParentPath + "/")}${pc.underline(pc.cyan(dirName))} doesn't exist, create it?`,
							initialValue: true,
						});
						if (isCancel(shouldCreate)) {
							cancel("Operation cancelled.");
							process.exit(0);
						}
						if (!shouldCreate) {
							cancel(
								"Cannot continue without a valid directory.",
							);
							process.exit(0);
						}
						mkdirSync(resolved, { recursive: true });
					}
					return resolved;
				},
			},
			{
				onCancel: () => {
					cancel("Operation cancelled.");
					process.exit(0);
				},
			},
		);
		const path = path_ as string;

		const s = spinner({});
		s.start("Creating repository...");

		const repo = await authClient.storage.createRepo({
			name,
			slug: slug as `${string}/${string}`,
			visibility: visibility ? "public" : "private",
			description,
		});
		if (repo.error) {
			s.stop(`${pc.bold("Repository creation failed!")} ${pc.red("✗")}`);
			if (repo.error.code === "REPOSITORY_ALREADY_EXISTS") {
				const msg = `Repository already exists. Please choose a different slug.`;
				outro(pc.red(msg));
				process.exit(1);
			}
			const msg = `Failed to create repository: ${pc.bold(repo.error.message)}`;
			outro(pc.red(msg));
			console.error(repo.error);
			process.exit(1);
		}
		s.stop(`${pc.bold("Repository created!")} ${pc.green("✓")}`);

		const hasGitFolder = (() => {
			const raw = execSync(`git rev-parse --is-inside-work-tree`, {
				cwd: path,
			});
			const result = raw.toString().trim();
			return result === "true";
		})();

		let gitCLIDetails: string[] = [];
		let shouldInit = true;
		if (hasGitFolder) {
			log.warn("Detected existing Git repository.");
			const confirmed = await confirm({
				message: `Initialize a new Git repository in the project directory?`,
				initialValue: true,
			});
			if (isCancel(confirmed)) {
				return confirmed;
			}
			if (!confirmed) {
				shouldInit = false;
			}
		}

		const defaultBranch = repo.data.defaultBranch || "main";

		if (shouldInit) {
			try {
				execSync(`git init -b "${defaultBranch}"`, { cwd: path });
			} catch (error) {
				log.error(`Failed to initialize Git repository: ${error}`);
				process.exit(1);
			}
			gitCLIDetails.push(pc.dim("✓ Initialized Git repository"));
		} else {
			gitCLIDetails.push(pc.dim("→ Using existing Git repository"));
		}

		if (repo.data.remoteURL) {
			try {
				execSync(
					`cd ${path} && git remote add better-hub ${repo.data.remoteURL}`,
					{
						cwd: path,
					},
				);
			} catch (error) {
				log.error(`Failed to add remote repository: ${error}`);
				process.exit(1);
			}
			try {
				execSync(`git config remote.pushDefault better-hub`, {
					cwd: path,
				});
			} catch (error) {
				log.error(`Failed to set remote.pushDefault: ${error}`);
				process.exit(1);
			}
			try {
				execSync(`git config push.autoSetupRemote true`, {
					cwd: path,
				});
			} catch (error) {
				log.error(`Failed to set push.autoSetupRemote: ${error}`);
				process.exit(1);
			}
			gitCLIDetails.push(pc.dim("✓ Registered remote repository"));
		} else {
			gitCLIDetails.push(
				pc.dim(
					"→ No remote repository recieved, skipping remote repository addition...",
				),
			);
		}

		log.info(`${pc.bold("Running Git")}`);
		log.message(gitCLIDetails.join("\n"));

		registerRepo(slug as string, path);

		const url = `https://better-hub.com/s/${slug}`;
		log.info(
			[
				`${pc.bold(pc.white(name))}`,
				description ? `${pc.gray(description)}` : null,
				``,
				`${pc.dim("→")} ${pc.yellow(` ${slug}`)}`,
				`${pc.dim("→")} ${pc.magenta(`⎇ ${defaultBranch}`)}`,
				`${pc.dim("→")} ${pc.cyan(`${pc.underline(`${url}`)}`)}`,
			]
				.filter((x) => !(x !== "" && !x))
				.join("\n"),
		);

		const commands: [string, string][] = [
			["bh push", "Stage, commit & push your changes"],
			["bh list", "List your repositories"],
			[`bh cd ${segment}`, "Change your working directory to this repository"],
		];

		const maxCmd = Math.max(...commands.map(([cmd]) => cmd.length));
		log.info(`${pc.bold("Next steps")}`);
		log.message(
			`${pc.gray(`Your repository is initiated, you can now start working on your project!`)}`,
		);
		log.message(
			commands
				.map(
					([cmd, desc]) =>
						`${pc.dim("$")} ${pc.cyan(cmd.padEnd(maxCmd))}  ${pc.dim(desc)}`,
				)
				.join("\n"),
		);

		outro(pc.green("Happy Hacking!"));
	});
