import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { streamText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { getOctokitFromSession, getGitHubToken } from "@/lib/ai-auth";
import type { Octokit } from "@octokit/rest";
import { Sandbox } from "e2b";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { after } from "next/server";
import { getUserSettings } from "@/lib/user-settings-store";
import {
	getPromptRequest,
	updatePromptRequestStatus,
	updatePromptRequestProgress,
} from "@/lib/prompt-request-store";

export const maxDuration = 800;

// ─── GitHub API tools (fast path, no VM) ────────────────────────────────────

function buildGitHubTools(octokit: Octokit, owner: string, repo: string, promptRequestId: string) {
	let defaultBranch: string | null = null;
	const stagedFiles = new Map<string, string>();
	const deletedFiles = new Set<string>();

	return {
		getRepoInfo: tool({
			description:
				"Get repository metadata including default branch, language, and structure.",
			inputSchema: z.object({}),
			execute: async () => {
				const { data } = await octokit.repos.get({ owner, repo });
				defaultBranch = data.default_branch;
				return {
					defaultBranch: data.default_branch,
					language: data.language,
					description: data.description,
					private: data.private,
				};
			},
		}),

		getFileContent: tool({
			description:
				"Read the contents of a file from the repository via GitHub API.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
				ref: z
					.string()
					.optional()
					.describe(
						"Branch or commit SHA (defaults to default branch)",
					),
			}),
			execute: async ({ path, ref }) => {
				try {
					const { data } = await octokit.repos.getContent({
						owner,
						repo,
						path,
						...(ref ? { ref } : {}),
					});
					if (Array.isArray(data) || data.type !== "file")
						return { error: "Not a file" };
					const content = Buffer.from(
						(data as { content: string }).content,
						"base64",
					).toString("utf-8");
					return { path, content };
				} catch (e: any) {
					if (e.status === 404)
						return { error: `File not found: ${path}` };
					return { error: e.message };
				}
			},
		}),

		listDirectory: tool({
			description:
				"List files and directories at a given path in the repository.",
			inputSchema: z.object({
				path: z
					.string()
					.optional()
					.describe(
						"Directory path relative to repo root (empty or '.' for root)",
					),
				ref: z.string().optional().describe("Branch or commit SHA"),
			}),
			execute: async ({ path, ref }) => {
				try {
					const { data } = await octokit.repos.getContent({
						owner,
						repo,
						path: path || "",
						...(ref ? { ref } : {}),
					});
					if (!Array.isArray(data))
						return { error: "Not a directory" };
					return {
						entries: data.map((e) => ({
							name: e.name,
							type: e.type,
							path: e.path,
							size: e.size,
						})),
					};
				} catch (e: any) {
					return { error: e.message };
				}
			},
		}),

		searchCode: tool({
			description:
				"Search for code in the repository. Useful for finding files that contain specific patterns.",
			inputSchema: z.object({
				query: z
					.string()
					.describe(
						"Search query (e.g. 'className Button', 'import express', 'TODO')",
					),
			}),
			execute: async ({ query }) => {
				try {
					const { data } = await octokit.search.code({
						q: `${query} repo:${owner}/${repo}`,
						per_page: 15,
					});
					return {
						total_count: data.total_count,
						files: data.items.map((item) => ({
							path: item.path,
							name: item.name,
						})),
					};
				} catch (e: any) {
					return { error: e.message };
				}
			},
		}),

		stageFile: tool({
			description:
				"Stage a file for the next commit. Provide the full file content. Call this for each file you want to create or modify.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
				content: z.string().describe("Full file content"),
			}),
			execute: async ({ path, content }) => {
				stagedFiles.set(path, content);
				deletedFiles.delete(path);
				return { success: true, path, stagedCount: stagedFiles.size };
			},
		}),

		deleteFile: tool({
			description: "Stage a file for deletion in the next commit.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
			}),
			execute: async ({ path }) => {
				deletedFiles.add(path);
				stagedFiles.delete(path);
				return { success: true, path, deletedCount: deletedFiles.size };
			},
		}),

		commitAndCreatePR: tool({
			description:
				"Commit all staged files to a new branch and open a pull request. Call this after staging all your file changes with stageFile/deleteFile.",
			inputSchema: z.object({
				branch: z
					.string()
					.describe(
						"Branch name to create (e.g. 'feat/add-dark-mode')",
					),
				commitMessage: z
					.string()
					.describe("Commit message describing the changes"),
				prTitle: z.string().describe("Pull request title"),
				prBody: z.string().describe("Pull request description (markdown)"),
			}),
			execute: async ({ branch, commitMessage, prTitle, prBody }) => {
				if (stagedFiles.size === 0 && deletedFiles.size === 0) {
					return {
						error: "No files staged. Use stageFile or deleteFile first.",
					};
				}

				try {
					// 1. Get the default branch's latest commit SHA
					if (!defaultBranch) {
						const { data: repoData } = await octokit.repos.get({
							owner,
							repo,
						});
						defaultBranch = repoData.default_branch;
					}
					const { data: refData } = await octokit.git.getRef({
						owner,
						repo,
						ref: `heads/${defaultBranch}`,
					});
					const baseSha = refData.object.sha;

					// 2. Get the base tree
					const { data: baseCommit } = await octokit.git.getCommit({
						owner,
						repo,
						commit_sha: baseSha,
					});
					const baseTreeSha = baseCommit.tree.sha;

					// 3. Create blobs in parallel
					const treeEntries: {
						path: string;
						mode: "100644";
						type: "blob";
						sha: string | null;
					}[] = [];

					const blobPromises = Array.from(stagedFiles.entries()).map(
						async ([path, content]) => {
							const { data: blob } =
								await octokit.git.createBlob({
									owner,
									repo,
									content: Buffer.from(
										content,
									).toString("base64"),
									encoding: "base64",
								});
							return { path, sha: blob.sha };
						},
					);

					const blobs = await Promise.all(blobPromises);
					for (const { path, sha } of blobs) {
						treeEntries.push({
							path,
							mode: "100644",
							type: "blob",
							sha,
						});
					}

					for (const path of deletedFiles) {
						treeEntries.push({
							path,
							mode: "100644",
							type: "blob",
							sha: null,
						});
					}

					// 4. Create tree → commit → branch → PR
					const { data: newTree } = await octokit.git.createTree({
						owner,
						repo,
						base_tree: baseTreeSha,
						tree: treeEntries,
					});

					const { data: newCommit } = await octokit.git.createCommit({
						owner,
						repo,
						message: commitMessage,
						tree: newTree.sha,
						parents: [baseSha],
						author: {
							name: "Ghost",
							email: "ghost@better-github.app",
							date: new Date().toISOString(),
						},
					});

					const totalFilesChanged = blobs.length + deletedFiles.size;

					await octokit.git.createRef({
						owner,
						repo,
						ref: `refs/heads/${branch}`,
						sha: newCommit.sha,
					});

					const { data: pr } = await octokit.pulls.create({
						owner,
						repo,
						title: prTitle,
						body: prBody,
						head: branch,
						base: defaultBranch,
					});

					await updatePromptRequestStatus(
						promptRequestId,
						"completed",
						{ prNumber: pr.number },
					);

					stagedFiles.clear();
					deletedFiles.clear();

					return {
						success: true,
						prNumber: pr.number,
						prTitle: pr.title,
						branch,
						filesChanged: totalFilesChanged,
					};
				} catch (e: any) {
					return {
						error:
							e.message ||
							"Failed to create commit and PR",
					};
				}
			},
		}),
	};
}

// ─── Sandbox tools (fallback for tasks requiring a VM) ──────────────────────

function buildSandboxTools(
	octokit: Octokit,
	githubToken: string,
	owner: string,
	repo: string,
	promptRequestId: string,
) {
	let sandbox: Sandbox | null = null;
	let repoPath: string | null = null;

	return {
		startSandbox: tool({
			description:
				"LAST RESORT: Start a cloud sandbox VM and clone the repository. Only use this if you absolutely need to run shell commands (tests, builds, linters). For normal file changes, use stageFile + commitAndCreatePR instead — it's 10x faster.",
			inputSchema: z.object({
				branch: z
					.string()
					.optional()
					.describe("Branch to clone (defaults to default branch)"),
			}),
			execute: async ({ branch }) => {
				// Make idempotent — kill existing sandbox if any
				if (sandbox) {
					await sandbox.kill().catch(() => {});
					sandbox = null;
					repoPath = null;
				}

				try {
					sandbox = await Sandbox.create({
						timeoutMs: 10 * 60 * 1000,
					});
				} catch (e: any) {
					sandbox = null;
					return { error: `Sandbox creation failed: ${e.message}` };
				}

				try {
					// Git config
					await sandbox.commands.run(
						`git config --global user.name "Ghost" && git config --global user.email "ghost@better-github.app"`,
					);

					repoPath = `/home/user/${repo}`;
					// Clone with token auth
					await sandbox.commands.run(
						`git clone ${branch ? `-b ${branch}` : ""} https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git ${repoPath}`,
						{ timeoutMs: 120_000 },
					);

					const infoResult = await sandbox.commands.run(
						'echo "__BRANCH__$(git rev-parse --abbrev-ref HEAD)__END__" && ls -la',
						{ cwd: repoPath },
					);
					const output = infoResult.stdout;
					const branchMatch = output.match(/__BRANCH__(.+?)__END__/);
					const defaultBranch = branchMatch?.[1]?.trim() || "main";
					const files = output.replace(/__BRANCH__.*__END__\n?/, "");
					return { success: true, repoPath, defaultBranch, files };
				} catch (e: any) {
					if (sandbox) await sandbox.kill().catch(() => {});
					sandbox = null;
					return { error: `Clone error: ${e.message}` };
				}
			},
		}),

		sandboxRun: tool({
			description:
				"Run a shell command in the sandbox VM. Requires startSandbox first.",
			inputSchema: z.object({
				command: z.string().describe("Shell command to execute"),
				timeout: z
					.number()
					.optional()
					.describe(
						"Timeout in seconds (default 120, use 300 for installs/builds)",
					),
			}),
			execute: async ({ command, timeout }) => {
				if (!sandbox || !repoPath)
					return {
						error: "No sandbox running. Call startSandbox first.",
					};
				const result = await sandbox.commands.run(command, {
					cwd: repoPath,
					timeoutMs: (timeout ?? 120) * 1000,
				});
				const output =
					result.stdout + (result.stderr ? `\n${result.stderr}` : "");
				const maxLen = 10000;
				const stdout =
					output.length > maxLen
						? `...(truncated ${output.length - maxLen} chars)...\n` +
							output.slice(-maxLen)
						: output;
				return { exitCode: result.exitCode, stdout };
			},
		}),

		sandboxReadFile: tool({
			description:
				"Read a file from the sandbox filesystem. Requires startSandbox first.",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Absolute path or path relative to repo root"),
			}),
			execute: async ({ path: filePath }) => {
				if (!sandbox || !repoPath) return { error: "No sandbox running." };
				const absPath = filePath.startsWith("/")
					? filePath
					: `${repoPath}/${filePath}`;
				try {
					const content = await sandbox.files.read(absPath);
					if (!content)
						return { error: `File not found: ${absPath}` };
					return { path: filePath, content };
				} catch (e: any) {
					return { error: e.message || "Failed to read file" };
				}
			},
		}),

		sandboxWriteFile: tool({
			description:
				"Write content to a file in the sandbox. Requires startSandbox first.",
			inputSchema: z.object({
				path: z
					.string()
					.describe("Absolute path or path relative to repo root"),
				content: z.string().describe("File content to write"),
			}),
			execute: async ({ path: filePath, content }) => {
				if (!sandbox || !repoPath) return { error: "No sandbox running." };
				const absPath = filePath.startsWith("/")
					? filePath
					: `${repoPath}/${filePath}`;
				try {
					await sandbox.files.write(absPath, content);
					return { success: true, path: filePath };
				} catch (e: any) {
					return { error: e.message || "Failed to write file" };
				}
			},
		}),

		killSandbox: tool({
			description: "Shut down the sandbox VM.",
			inputSchema: z.object({}),
			execute: async () => {
				if (!sandbox) return { success: true };
				try {
					await sandbox.kill();
					sandbox = null;
					repoPath = null;
					return { success: true };
				} catch (e: any) {
					return { error: e.message };
				}
			},
		}),

		_cleanup: async () => {
			if (sandbox) {
				await sandbox.kill().catch(() => {});
				sandbox = null;
			}
		},
	};
}

// ─── Background processor ───────────────────────────────────────────────────

async function processPromptRequestInBackground(
	promptRequestId: string,
	owner: string,
	repo: string,
	title: string,
	body: string,
	octokit: Octokit,
	githubToken: string,
	userId: string,
) {
	const apiTools = buildGitHubTools(octokit, owner, repo, promptRequestId);
	const sandboxTools = buildSandboxTools(octokit, githubToken, owner, repo, promptRequestId);
	const { _cleanup, ...sandboxToolsForAI } = sandboxTools;

	const tools = { ...apiTools, ...sandboxToolsForAI };

	const defaultModel = process.env.GHOST_MODEL || "moonshotai/kimi-k2.5";
	let apiKey = process.env.OPEN_ROUTER_API_KEY!;

	const settings = await getUserSettings(userId);
	const userModelChoice = settings.ghostModel || "auto";
	const modelId = userModelChoice === "auto" ? defaultModel : userModelChoice;
	if (settings.useOwnApiKey && settings.openrouterApiKey) apiKey = settings.openrouterApiKey;

	// Pre-fetch key repo files so the LLM has context immediately
	await updatePromptRequestProgress(promptRequestId, "Fetching repo context...");
	let repoContext = "";
	try {
		const [repoInfo, ...fileResults] = await Promise.allSettled([
			octokit.repos.get({ owner, repo }),
			...["package.json", "README.md"].map(async (path) => {
				const { data } = await octokit.repos.getContent({
					owner,
					repo,
					path,
				});
				if (Array.isArray(data) || data.type !== "file") return null;
				const content = Buffer.from(
					(data as { content: string }).content,
					"base64",
				).toString("utf-8");
				return {
					path,
					content:
						content.length > 3000
							? content.slice(0, 3000) +
								"\n...(truncated)"
							: content,
				};
			}),
		]);

		const parts: string[] = [];

		if (repoInfo.status === "fulfilled") {
			const r = repoInfo.value.data;
			parts.push(
				`- Default branch: ${r.default_branch}\n- Language: ${r.language}\n- Description: ${r.description || "none"}`,
			);
		}

		const fetched = fileResults
			.filter(
				(
					r,
				): r is PromiseFulfilledResult<{
					path: string;
					content: string;
				} | null> => r.status === "fulfilled" && r.value != null,
			)
			.map((r) => r.value!);
		if (fetched.length > 0) {
			parts.push(
				fetched
					.map((f) => `### ${f.path}\n\`\`\`\n${f.content}\n\`\`\``)
					.join("\n\n"),
			);
		}

		if (parts.length > 0) {
			repoContext =
				"\n\n## Pre-fetched Repository Context\n" + parts.join("\n\n");
		}
	} catch {
		// Non-critical
	}

	const systemPrompt = `You are Ghost, an autonomous AI developer. Process the request fully — no questions, no confirmation. Create a Pull Request with the changes.

Repository: ${owner}/${repo} | Date: ${new Date().toISOString().split("T")[0]}

## Workflow
1. Explore: getFileContent, listDirectory, searchCode
2. Stage: stageFile (full content) / deleteFile per file
3. Commit: commitAndCreatePR once with all staged changes

Rules: always read before modifying, use meaningful branch names (e.g. "feat/add-dark-mode"), write clear PR descriptions.

Sandbox (startSandbox → sandboxRun → killSandbox): ONLY for running tests/builds/linters. Never for file reads/writes — the API tools are instant.${repoContext}`;

	try {
		let lastProgressUpdate = 0;
		const result = streamText({
			model: createOpenRouter({ apiKey })(modelId),
			system: systemPrompt,
			prompt: `Process this prompt request and open a PR:\n\n**${title}**\n\n${body}`,
			tools,
			maxRetries: 3,
			stopWhen: stepCountIs(50),
			onStepFinish({ toolResults }) {
				const now = Date.now();
				if (now - lastProgressUpdate < 3000) return;
				lastProgressUpdate = now;
				const toolNames = toolResults.map((tr) => tr.toolName);
				const label =
					toolNames.length > 0 ? toolNames.join(", ") : "thinking";
				void updatePromptRequestProgress(
					promptRequestId,
					`Running: ${label}`,
				);
			},
		});

		// Consume the stream to drive execution
		for await (const _ of result.fullStream) {
		}

		// Check if the prompt request was marked completed
		const updated = await getPromptRequest(promptRequestId);
		if (updated && updated.status !== "completed") {
			await updatePromptRequestStatus(promptRequestId, "open", {
				errorMessage:
					"Ghost finished processing but did not create a pull request. Try again or process manually.",
			});
		}

		await updatePromptRequestProgress(promptRequestId, null);
	} catch (e: unknown) {
		await updatePromptRequestProgress(promptRequestId, null);
		await updatePromptRequestStatus(promptRequestId, "open", {
			errorMessage:
				e instanceof Error ? e.message : "Processing failed unexpectedly",
		});
	}

	// Clean up sandbox if it was used
	await _cleanup();
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
	const { promptRequestId } = await req.json();
	if (!promptRequestId) {
		return Response.json({ error: "Missing promptRequestId" }, { status: 400 });
	}

	const octokit = await getOctokitFromSession();
	if (!octokit) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const githubToken = await getGitHubToken();
	if (!githubToken) {
		return Response.json({ error: "No GitHub token" }, { status: 401 });
	}

	const session = await auth.api.getSession({ headers: await headers() });
	const userId = session?.user?.id;
	if (!userId) {
		return Response.json({ error: "No user session" }, { status: 401 });
	}

	const pr = await getPromptRequest(promptRequestId);
	if (!pr) {
		return Response.json({ error: "Prompt request not found" }, { status: 404 });
	}

	if (pr.status !== "processing") {
		return Response.json(
			{ error: "Prompt request is not in processing state" },
			{ status: 400 },
		);
	}

	// Schedule work to run after the response is sent
	after(async () => {
		await processPromptRequestInBackground(
			promptRequestId,
			pr.owner,
			pr.repo,
			pr.title,
			pr.body,
			octokit,
			githubToken,
			userId,
		);
	});

	return Response.json({ success: true, message: "Processing started" });
}
