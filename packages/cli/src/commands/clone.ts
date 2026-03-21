import { Command } from "commander";
import pc from "picocolors";
import { requireAuth } from "../lib/client.js";
import { getAuthClient } from "../lib/auth-client.js";
import {
	cancel,
	confirm,
	isCancel,
	log,
	outro,
	progress,
	select,
	spinner,
	text,
} from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { registerRepo } from "../lib/repo-registry.js";
import { getBaseUrl } from "../lib/config.js";
import { spawn, execSync } from "node:child_process";
import { resolve, isAbsolute, basename } from "node:path";
import { existsSync, mkdirSync, readdirSync } from "node:fs";

function repoSegment(slug: string): string {
	const parts = slug.split("/");
	return parts[1] ?? parts[0]!;
}

function isDirEmpty(path: string): boolean {
	try {
		return readdirSync(path).length === 0;
	} catch {
		return false;
	}
}

async function promptDir(cwd: string, segment: string): Promise<string> {
	const customPath = await text({
		message: `Directory path ${pc.dim("(relative or absolute)")}:`,
		placeholder: `./${segment}`,
		validate(value) {
			if (!value?.trim()) return "Path is required";
			const resolved = isAbsolute(value) ? resolve(value) : resolve(cwd, value);
			if (existsSync(resolved) && !isDirEmpty(resolved)) {
				return `Directory is not empty: ${resolved}`;
			}
		},
	});

	if (isCancel(customPath)) {
		cancel("Operation cancelled.");
		process.exit(0);
	}

	return isAbsolute(customPath) ? resolve(customPath) : resolve(cwd, customPath);
}

export const cloneCommand = new Command("clone")
	.description("Clone a Better Hub repository")
	.argument("[slug]", "Repository slug (owner/repo)")
	.option("-d, --dir <path>", "Target directory")
	.action(async (slug?: string, opts?: { dir?: string }) => {
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

		betterHubIntro("Clone");

		const s = spinner({});
		s.start("Fetching repositories...");

		const repos = await authClient.storage.listRepo();
		if (repos.error) {
			s.stop(`${pc.bold("Failed to fetch repositories")} ${pc.red("✗")}`);
			outro(pc.red(repos.error.message));
			process.exit(1);
		}
		if (!repos.data?.length) {
			s.stop(`${pc.bold("No repositories found")} ${pc.red("✗")}`);
			outro(pc.dim("Create one with `bh create`."));
			process.exit(0);
		}

		s.stop(
			`${pc.bold(`${repos.data.length} ${repos.data.length === 1 ? "repository" : "repositories"}`)} ${pc.green("✓")}`,
		);

		let repo: (typeof repos.data)[number] | undefined;

		if (slug) {
			repo = repos.data.find(
				(r) => r.slug === slug || r.slug.endsWith(`/${slug}`),
			);
			if (!repo) {
				log.error(`Repository ${pc.bold(slug)} not found.`);
				log.message(
					pc.dim("Available repositories:\n") +
						repos.data
							.map((r) => `  ${pc.cyan(r.slug)}`)
							.join("\n"),
				);
				process.exit(1);
			}
		} else {
			const maxName = Math.max(...repos.data.map((r) => r.name.length));
			const selected = await select({
				message: "Select a repository to clone:",
				options: repos.data.map((r) => {
					const visibility =
						r.visibility === "private"
							? pc.yellow("private")
							: pc.green("public");
					return {
						label: `${pc.bold(r.name.padEnd(maxName))}  ${pc.dim(r.slug)}  ${visibility}`,
						value: r.slug,
					};
				}),
			});

			if (isCancel(selected)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			repo = repos.data.find((r) => r.slug === selected)!;
		}

		slug = repo.slug;
		const segment = repoSegment(slug);

		// ── Fetch clone URL ──────────────────────────────
		const cloneSpinner = spinner({});
		cloneSpinner.start(`Resolving remote for ${pc.cyan(slug)}...`);

		const cloneInfo = await authClient.storage.cloneRepo({
			slug: slug as `${string}/${string}`,
		});
		if (cloneInfo.error) {
			cloneSpinner.stop(`${pc.bold("Failed to resolve remote")} ${pc.red("✗")}`);
			log.error(
				cloneInfo.error.message ??
					"Could not get clone URL for this repository.",
			);
			process.exit(1);
		}

		const { remoteURL, defaultBranch } = cloneInfo.data;
		cloneSpinner.stop(`${pc.bold("Remote resolved")} ${pc.green("✓")}`);

		// ── Target directory ─────────────────────────────
		let targetDir: string;
		const cwd = process.cwd();
		const cwdEmpty = isDirEmpty(cwd);

		if (opts?.dir) {
			const resolved = isAbsolute(opts.dir)
				? resolve(opts.dir)
				: resolve(cwd, opts.dir);
			if (existsSync(resolved) && !isDirEmpty(resolved)) {
				log.error(
					`Directory ${pc.bold(basename(resolved))} is not empty at ${pc.dim(resolved)}`,
				);
				process.exit(1);
			}
			targetDir = resolved;
		} else if (cwdEmpty) {
			const cloneHere = await confirm({
				message: `Current directory is empty. Clone into ${pc.cyan(`.`)} ${pc.dim(`(${cwd})`)}?`,
				initialValue: true,
			});

			if (isCancel(cloneHere)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			if (cloneHere) {
				targetDir = cwd;
			} else {
				targetDir = await promptDir(cwd, segment);
			}
		} else {
			const defaultDir = resolve(cwd, segment);
			const useDefault = await confirm({
				message: `Clone into ${pc.cyan(`./${segment}`)}?`,
				initialValue: true,
			});

			if (isCancel(useDefault)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			if (useDefault) {
				targetDir = defaultDir;
			} else {
				targetDir = await promptDir(cwd, segment);
			}
		}

		if (existsSync(targetDir) && !isDirEmpty(targetDir)) {
			log.error(
				`Directory ${pc.bold(basename(targetDir))} is not empty at ${pc.dim(targetDir)}`,
			);
			process.exit(1);
		}

		if (!existsSync(targetDir)) {
			const parentDir = resolve(targetDir, "..");
			if (!existsSync(parentDir)) {
				mkdirSync(parentDir, { recursive: true });
			}
		}

		// ── Clone ────────────────────────────────────────
		const baseUrl = getBaseUrl();

		log.info(
			`${pc.dim("Cloning")} ${pc.cyan(slug)} ${pc.dim("→")} ${pc.white(targetDir)}`,
		);

		const p = progress({ max: 100 });
		p.start(`Cloning ${pc.cyan(slug)}`);

		try {
			await new Promise<void>((resolve, reject) => {
				const child = spawn(
					"git",
					["clone", "--progress", remoteURL, targetDir],
					{ stdio: ["ignore", "pipe", "pipe"] },
				);

				let stderr = "";

				const STAGES: [RegExp, number, string][] = [
					[/cloning into/i, 5, "Initializing..."],
					[/enumerating objects/i, 10, "Enumerating objects..."],
					[/counting objects/i, 25, "Counting objects..."],
					[/compressing objects/i, 40, "Compressing objects..."],
					[/receiving objects/i, 55, "Receiving objects..."],
					[/resolving deltas/i, 75, "Resolving deltas..."],
					[/checking out files/i, 90, "Checking out files..."],
				];
				let reached = 0;

				const advance = (chunk: string) => {
					for (const [pattern, pct, label] of STAGES) {
						if (pct > reached && pattern.test(chunk)) {
							reached = pct;
							p.advance(pct, label);
						}
					}

					const pctMatch = chunk.match(/(\d+)%/);
					if (pctMatch) {
						const parsed = parseInt(pctMatch[1]!);
						const scaled = Math.min(
							95,
							reached +
								Math.floor(
									((parsed / 100) *
										(100 - reached)) /
										5,
								),
						);
						if (scaled > reached) {
							reached = scaled;
							p.advance(reached);
						}
					}
				};

				child.stderr.on("data", (data: Buffer) => {
					const text = data.toString();
					stderr += text;
					advance(text);
				});

				child.stdout.on("data", (data: Buffer) => {
					advance(data.toString());
				});

				child.on("close", (code) => {
					if (code === 0) {
						p.advance(100, "Done");
						resolve();
					} else {
						reject(
							new Error(
								stderr.trim() ||
									`git clone exited with code ${code}`,
							),
						);
					}
				});

				child.on("error", reject);
			});

			p.stop(`${pc.green("✓")} Cloned ${pc.cyan(slug)}`);
		} catch (e) {
			p.stop(`${pc.red("✗")} Clone failed`);
			log.error((e as Error).message);
			process.exit(1);
		}

		// ── Set up Better Hub ────────────────────────────
		log.info(`${pc.bold("Setting up Better Hub")}`);
		const setupDetails: string[] = [];

		try {
			const existingRemotes = execSync("git remote", {
				cwd: targetDir,
				encoding: "utf-8",
			}).trim();

			if (!existingRemotes.includes("better-hub")) {
				execSync(`git remote add better-hub ${remoteURL}`, {
					cwd: targetDir,
				});
				setupDetails.push(pc.dim("✓ Added better-hub remote"));
			} else {
				execSync(`git remote set-url better-hub ${remoteURL}`, {
					cwd: targetDir,
				});
				setupDetails.push(pc.dim("✓ Updated better-hub remote URL"));
			}
		} catch (error) {
			setupDetails.push(
				pc.yellow(
					`⚠ Could not configure remote: ${(error as Error).message}`,
				),
			);
		}

		try {
			execSync("git config remote.pushDefault better-hub", {
				cwd: targetDir,
			});
			setupDetails.push(pc.dim("✓ Set remote.pushDefault to better-hub"));
		} catch {
			setupDetails.push(pc.yellow("⚠ Could not set remote.pushDefault"));
		}

		try {
			execSync("git config push.autoSetupRemote true", {
				cwd: targetDir,
			});
			setupDetails.push(pc.dim("✓ Enabled push.autoSetupRemote"));
		} catch {
			setupDetails.push(pc.yellow("⚠ Could not set push.autoSetupRemote"));
		}

		log.message(setupDetails.join("\n"));

		registerRepo(slug, targetDir);
		setupDetails.push(pc.dim("✓ Registered in local repo registry"));

		// ── Summary ──────────────────────────────────────
		log.info(
			[
				`${pc.bold(pc.white(repo.name))}`,
				repo.description ? `${pc.gray(repo.description)}` : null,
				"",
				`${pc.dim("→")} ${pc.yellow(` ${slug}`)}`,
				`${pc.dim("→")} ${pc.magenta(`⎇ ${defaultBranch}`)}`,
				`${pc.dim("→")} ${pc.cyan(pc.underline(`${baseUrl}/${slug}`))}`,
				`${pc.dim("→")} ${pc.white(targetDir)}`,
			]
				.filter((x) => !(x !== "" && !x))
				.join("\n"),
		);

		const commands: [string, string][] = [
			[`cd ${targetDir}`, "Navigate to the repository"],
			["bh status", "View working tree status"],
			["bh push", "Stage, commit & push your changes"],
			[`bh cd ${segment}`, "Quick-navigate to this repo later"],
		];

		const maxCmd = Math.max(...commands.map(([cmd]) => cmd.length));
		log.info(`${pc.bold("Next steps")}`);
		log.message(
			commands
				.map(
					([cmd, desc]) =>
						`${pc.dim("$")} ${pc.cyan(cmd.padEnd(maxCmd))}  ${pc.dim(desc)}`,
				)
				.join("\n"),
		);

		outro(pc.green("Repository cloned successfully!"));
	});
