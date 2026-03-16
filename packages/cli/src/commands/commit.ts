import { Command } from "commander";
import pc from "picocolors";
import { requireAuth } from "../lib/client.js";
import {
	cancel,
	confirm,
	intro,
	isCancel,
	log,
	multiselect,
	outro,
	progress,
	spinner,
	stream,
	taskLog,
	text,
} from "@clack/prompts";
import { betterHubIntro } from "../lib/intro.js";
import { sleep } from "../lib/utils.js";

export const commitCommand = new Command("commit")
	.alias("push")
	.alias("c")
	.alias("p")
	.description("Commit changes and view CI results")
	.option("-m, --message [message]", "Commit message (omit value to generate with AI)")
	.option("-a, --all", "Stage all changed files")
	.option("-p, --push", "Push to remote after commit")
	.option("--no-push", "Skip pushing to remote")
	.action(async (opts: { message?: string | boolean; all?: boolean; push?: boolean }) => {
		requireAuth();
		betterHubIntro("Commit & Push");
		const fakeFiles: {
			raw: string;
			status: "modified" | "added" | "deleted" | "renamed";
			diff: { additions: number; deletions: number } | null;
		}[] = [
			{
				raw: "src/lib/auth.ts",
				status: "modified",
				diff: { additions: 10, deletions: 5 },
			},
			{
				raw: "src/components/navbar.tsx",
				status: "modified",
				diff: { additions: 10, deletions: 5 },
			},
			{ raw: "src/app/settings/page.tsx", status: "added", diff: null },
			{
				raw: "src/utils/format.ts",
				status: "modified",
				diff: { additions: 10, deletions: 5 },
			},
			{ raw: "tests/auth.test.ts", status: "deleted", diff: null },
		];

		const maxLen = Math.max(...fakeFiles.map((f) => f.raw.length));

		const statusColor = (s: string) => {
			if (s === "added") return pc.green(s);
			if (s === "deleted") return pc.red(s);
			return pc.yellowBright(s);
		};

		const formatPath = (
			raw: string,
			status: "modified" | "added" | "deleted" | "renamed",
		) => {
			const sep = raw.lastIndexOf("/");
			const dir = raw.slice(0, sep + 1);
			const file = raw.slice(sep + 1);
			let color: keyof typeof pc = "gray";
			switch (status) {
				case "added":
					color = "green";
					break;
				case "deleted":
					color = "red";
					break;
				case "modified":
					color = "yellow";
					break;
				case "renamed":
					color = "blue";
					break;
				default:
					color = "gray";
					break;
			}
			let fileText = pc[color](file);
			if (status === "deleted") {
				fileText = pc.strikethrough(fileText);
			}
			return `${pc.gray(dir)}${fileText}`;
		};

		log.info(
			`${pc.dim("On branch")} ${pc.cyan("feat/custom-storage")} ${pc.dim("· 5 changed files")}`,
		);

		const staged = opts.all
			? (() => {
					log.step("Staging all changed files:");
					const logs: string[] = [];
					for (const f of fakeFiles) {
						const padding = " ".repeat(
							maxLen - f.raw.length + 2,
						);

						let diff = "";
						if (f.diff) {
							diff = ` ${pc.dim(pc.green(`+${f.diff.additions}`) + " " + `${pc.red(`-${f.diff.deletions}`)}`)}`;
						}
						logs.push(
							`  ${formatPath(f.raw, f.status)}${padding}${pc.dim(`${statusColor(f.status)}${diff}`)}`,
						);
					}
					log.message(logs.join("\n"));
					return fakeFiles.map((f) => f.raw);
				})()
			: await multiselect({
					message: "Select files to stage:",
					options: fakeFiles.map((f) => {
						const padding = " ".repeat(
							maxLen - f.raw.length + 2,
						);
						let diff = "";
						if (f.diff) {
							diff = ` ${pc.dim(pc.green(`+${f.diff.additions}`) + " " + `${pc.red(`-${f.diff.deletions}`)}`)}`;
						}
						return {
							label: `${formatPath(f.raw, f.status)}${padding}${pc.dim(`${statusColor(f.status)}${diff}`)}`,
							value: f.raw,
						};
					}),
					initialValues: fakeFiles.map((x) => x.raw),
				});

		if (isCancel(staged)) {
			cancel("Operation cancelled.");
			process.exit(0);
		}

		let commitMsg = typeof opts.message === "string" ? opts.message : undefined;
		const useAI = opts.message === true;

		if (!commitMsg && !useAI) {
			const raw = await text({
				message: `Commit message: ${pc.dim("(leave empty to generate with AI)")}`,
				defaultValue: "auto-generate",
			});

			if (isCancel(raw)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			commitMsg = raw;
		}

		if (!commitMsg || commitMsg === "auto-generate") {
			const s = spinner();
			s.start("Generating commit message with AI...");
			await sleep(1500);
			s.stop("AI commit message:");

			commitMsg = "feat: add custom storage adapter with device auth flow";
			await stream.info(asyncTypeOut(pc.cyan(commitMsg), 60, 2));
		}

		let shouldPush = opts.push;

		if (shouldPush === undefined) {
			const answer = await confirm({
				message: "Push to remote after commit?",
				initialValue: true,
			});

			if (isCancel(answer)) {
				cancel("Operation cancelled.");
				process.exit(0);
			}

			shouldPush = answer;
		}

		const shortHash = Math.random().toString(16).slice(2, 9);

		log.success(`Committed ${pc.bold(shortHash)} ${pc.dim("→")} ${pc.cyan(commitMsg)}`);
		log.message(
			`${pc.dim(`${(staged as string[]).length} file(s) changed, 47 insertions(+), 12 deletions(-)`)}`,
		);

		if (!shouldPush) {
			outro(pc.green("Done!"));
			return;
		}

		const p = progress({ max: 100 });
		p.start(`Pushing to ${pc.cyan("origin/feat/custom-storage")}`);
		await sleep(800);
		p.advance(15, "Enumerating objects...");
		await sleep(600);
		p.advance(30, "Counting objects...");
		await sleep(700);
		p.advance(50, "Compressing objects...");
		await sleep(800);
		p.advance(70, "Writing objects...");
		await sleep(900);
		p.advance(90, "Resolving deltas...");
		await sleep(600);
		p.stop(`${pc.green("✓")} Pushed to ${pc.cyan("origin/feat/custom-storage")}`);
		log.info(`${pc.bold("Running Actions")} ${pc.dim("— watching CI run...")}`);

		await streamCIResults();

		outro(pc.green("All checks passed! ") + pc.dim(`(${shortHash})`));
	});

async function* asyncTypeOut(text: string, delayMs = 30, chunkSize = 3): AsyncGenerator<string> {
	for (let i = 0; i < text.length; i += chunkSize) {
		await sleep(delayMs);
		yield text.slice(i, i + chunkSize);
	}
}

async function emitLines(tl: { message(msg: string): void }, lines: string[], delayMs: number) {
	for (const line of lines) {
		await sleep(delayMs);
		tl.message(line);
	}
}

const CI_ACTIONS = ["lint", "typecheck", "test", "build", "deploy-preview"];
const CI_MAX_NAME = Math.max(...CI_ACTIONS.map((n) => n.length));

function ciTitle(name: string) {
	const pad = " ".repeat(CI_MAX_NAME - name.length);
	return `${pc.yellow("◆")} ${pc.cyan(name)}${pad} ${pc.dim("running...")}`;
}

function ciSuccess(name: string, result: string) {
	const pad = " ".repeat(CI_MAX_NAME - name.length);
	return `${pc.green("✓")} ${pc.bold(name)}${pad} — ${result}`;
}

async function streamCIResults() {
	const lint = taskLog({ title: ciTitle("lint") });
	await emitLines(
		lint,
		[
			"Checking code style...",
			`${pc.dim("src/lib/auth.ts")} — no issues`,
			`${pc.dim("src/components/navbar.tsx")} — no issues`,
			`${pc.dim("src/app/settings/page.tsx")} — no issues`,
			`${pc.dim("src/utils/format.ts")} — no issues`,
			`${pc.dim("tests/auth.test.ts")} — no issues`,
		],
		400,
	);
	await sleep(300);
	lint.success(ciSuccess("lint", `${pc.green("passed")} ${pc.dim("(3.2s)")}`));
	await sleep(500);
	const typecheck = taskLog({ title: ciTitle("typecheck") });
	await emitLines(
		typecheck,
		[
			"Running tsc --noEmit...",
			`${pc.dim("Compiling 247 files...")}`,
			`${pc.dim("src/lib/auth.ts")} — ok`,
			`${pc.dim("src/components/navbar.tsx")} — ok`,
			`${pc.dim("src/app/settings/page.tsx")} — ok`,
			`${pc.dim("src/utils/format.ts")} — ok`,
			`${pc.dim("tests/auth.test.ts")} — ok`,
			`${pc.dim("Found 0 errors in 247 files.")}`,
		],
		350,
	);
	await sleep(300);
	typecheck.success(ciSuccess("typecheck", `${pc.green("passed")} ${pc.dim("(8.1s)")}`));
	await sleep(500);
	const test = taskLog({ title: ciTitle("test") });
	await emitLines(
		test,
		[
			"Running vitest...",
			`${pc.dim("DEV  v3.1.0")}`,
			"",
			` ${pc.green("✓")} src/lib/auth.test.ts ${pc.dim("(12 tests)")} ${pc.dim("1.2s")}`,
			` ${pc.green("✓")} src/utils/format.test.ts ${pc.dim("(8 tests)")} ${pc.dim("0.4s")}`,
			` ${pc.green("✓")} src/components/navbar.test.tsx ${pc.dim("(6 tests)")} ${pc.dim("0.9s")}`,
			` ${pc.green("✓")} src/app/settings/page.test.tsx ${pc.dim("(10 tests)")} ${pc.dim("1.8s")}`,
			` ${pc.green("✓")} tests/auth.test.ts ${pc.dim("(6 tests)")} ${pc.dim("0.7s")}`,
			"",
			`${pc.green("Test Files")}  5 passed (5)`,
			`${pc.green("     Tests")}  42 passed (42)`,
		],
		300,
	);
	await sleep(400);
	test.success(
		ciSuccess(
			"test",
			`${pc.green("42 passed")}, ${pc.gray("0 failed")} ${pc.dim("(12.4s)")}`,
		),
	);
	await sleep(500);
	const build = taskLog({ title: ciTitle("build") });
	await emitLines(
		build,
		[
			"Building with Next.js...",
			`${pc.dim("Creating an optimized production build...")}`,
			`${pc.dim("Compiled successfully.")}`,
			`${pc.dim("Collecting page data...")}`,
			`${pc.dim("Generating static pages (0/24)...")}`,
			`${pc.dim("Generating static pages (12/24)...")}`,
			`${pc.dim("Generating static pages (24/24)...")}`,
			`${pc.dim("Finalizing page optimization...")}`,
			`${pc.dim("Route (app)")}                 Size    First Load JS`,
			`${pc.dim("├ ○ /")}                       ${pc.dim("5.2 kB")}   ${pc.dim("89 kB")}`,
			`${pc.dim("├ ○ /settings")}               ${pc.dim("3.1 kB")}   ${pc.dim("87 kB")}`,
			`${pc.dim("└ ○ /device")}                 ${pc.dim("1.8 kB")}   ${pc.dim("85 kB")}`,
		],
		250,
	);
	await sleep(400);
	build.success(ciSuccess("build", `${pc.green("passed")} ${pc.dim("(24.7s)")}`));

	await sleep(500);

	const deploy = taskLog({ title: ciTitle("deploy-preview") });
	await emitLines(
		deploy,
		[
			"Deploying to Vercel...",
			`${pc.dim("Uploading build outputs...")}`,
			`${pc.dim("Assigning preview domain...")}`,
			`${pc.dim("Running checks...")}`,
			`${pc.dim("Preview ready.")}`,
		],
		500,
	);
	await sleep(400);
	deploy.success(
		ciSuccess(
			"deploy-preview",
			`${pc.green("ready")} ${pc.dim("(50s) →")} ${pc.cyan("https://better-hub-git-feat-custom-storage.vercel.app")}`,
		),
	);
}
