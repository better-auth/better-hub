import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { UIMessage } from "ai";
import { convertToModelMessages, generateId, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { getOctokitFromSession, getGitHubToken } from "@/lib/ai-auth";
import {
	getOrCreateConversation,
	updateActiveStreamId,
	saveMessages as saveMessagesToDb,
} from "@/lib/chat-store";
import { streamContext } from "@/lib/resumable-stream";
import type { Octokit } from "@octokit/rest";
import { Sandbox } from "e2b";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { embedText } from "@/lib/mixedbread";
import { rerankResults } from "@/lib/mixedbread";
import { searchEmbeddings, type ContentType } from "@/lib/embedding-store";
import { toAppUrl } from "@/lib/github-utils";
import { getUserSettings } from "@/lib/user-settings-store";
import {
	createPromptRequest as createPromptRequestInDb,
	updatePromptRequestStatus,
	updatePromptRequestContent,
	getPromptRequest as getPromptRequestFromDb,
} from "@/lib/prompt-request-store";
import {
	invalidateIssueCache,
	invalidatePullRequestCache,
	invalidateRepoIssuesCache,
	invalidateRepoPullRequestsCache,
} from "@/lib/github";
import Supermemory from "supermemory";

export const maxDuration = 800;

// ─── Model Config ───────────────────────────────────────────────────────────
// Central config for "auto" mode. Swap models here — no other changes needed.
const GHOST_MODELS = {
	default: process.env.GHOST_MODEL || "moonshotai/kimi-k2.5",
	mergeConflict: process.env.GHOST_MERGE_MODEL || "google/gemini-2.5-pro-preview",
} as const;

type GhostTaskType = "default" | "mergeConflict";

function resolveModel(userModel: string, task: GhostTaskType = "default"): string {
	if (userModel !== "auto") return userModel;
	return GHOST_MODELS[task] ?? GHOST_MODELS.default;
}

// ─── Safe tool wrapper ──────────────────────────────────────────────────────
// Wraps all tool execute functions with try/catch so a single tool failure
// (e.g. GitHub 403, rate limit, network error) doesn't crash the entire stream.
function withSafeTools<T extends Record<string, unknown>>(tools: T): T {
	const wrapped: Record<string, unknown> = {};
	for (const [name, t] of Object.entries(tools)) {
		if (t === undefined) continue;
		if (!t || typeof t !== "object") {
			wrapped[name] = t;
			continue;
		}
		const tObj = t as Record<string, unknown>;
		const origExecute = tObj.execute;
		if (typeof origExecute !== "function") {
			wrapped[name] = t;
			continue;
		}
		wrapped[name] = {
			...tObj,
			execute: async (...args: unknown[]) => {
				try {
					return await (
						origExecute as (...a: unknown[]) => Promise<unknown>
					)(...args);
				} catch (e: unknown) {
					const message =
						e instanceof Error
							? e.message
							: `Tool "${name}" failed`;
					return { error: message };
				}
			},
		};
	}
	return wrapped as T;
}

// ─── Supermemory ─────────────────────────────────────────────────────────────

function getSupermemoryClient(): Supermemory | null {
	const apiKey = process.env.SUPER_MEMORY_API_KEY;
	if (!apiKey) return null;
	return new Supermemory({ apiKey });
}

function getMemoryTools(userId: string) {
	const client = getSupermemoryClient();
	if (!client) return {};

	const containerTag = `user-${userId}`;

	return {
		saveMemory: tool({
			description:
				"Save important information the user wants you to remember for future conversations. Use this when the user says 'remember this', 'save this', 'keep in mind', or shares preferences, project context, or important facts they'd want recalled later.",
			inputSchema: z.object({
				content: z
					.string()
					.describe(
						"The information to remember. Write it as a clear, standalone fact or preference. Include relevant context so it's useful later.",
					),
			}),
			execute: async ({ content }) => {
				await client.add({
					content,
					containerTag,
					entityContext:
						"This is a memory from a GitHub power-user using a GitHub client app called Better GitHub. Extract preferences, decisions, project context, and important facts the user wants remembered across conversations.",
				});
				return { saved: true };
			},
		}),

		recallMemory: tool({
			description:
				"Search your memory for things the user previously asked you to remember. Use this when the user asks 'do you remember', 'what did I say about', or when context from past conversations would help answer their question.",
			inputSchema: z.object({
				query: z
					.string()
					.describe(
						"Natural language search query for what to recall",
					),
			}),
			execute: async ({ query }) => {
				const results = await client.search.memories({
					q: query,
					containerTag,
					limit: 5,
					searchMode: "hybrid",
				});
				if (!results.results || results.results.length === 0) {
					return {
						memories: [],
						message: "No relevant memories found.",
					};
				}
				return {
					memories: results.results.map((r) => ({
						content: r.memory || r.chunk || "",
						score: r.similarity,
					})),
				};
			},
		}),
	};
}

async function recallMemoriesForContext(userId: string, messages: UIMessage[]): Promise<string> {
	const client = getSupermemoryClient();
	if (!client) return "";

	// Use the last user message as the search query
	const lastUserMsg = [...messages].reverse().find((m) => m.role === "user");
	if (!lastUserMsg) return "";

	const query =
		lastUserMsg.parts
			?.filter((p): p is Extract<typeof p, { type: "text" }> => p.type === "text")
			.map((p) => p.text)
			.join(" ") || "";

	if (!query || query.length < 5) return "";

	try {
		const results = await client.search.memories({
			q: query,
			containerTag: `user-${userId}`,
			limit: 3,
			searchMode: "hybrid",
		});

		if (!results.results || results.results.length === 0) return "";

		const memoryLines = results.results
			.filter((r) => r.similarity > 0.3)
			.map((r) => `- ${r.memory || r.chunk || ""}`)
			.filter((line) => line !== "- ");

		if (memoryLines.length === 0) return "";

		return `\n\n## Recalled Memories
The following are things the user previously asked you to remember. Use them as context if relevant:
${memoryLines.join("\n")}`;
	} catch {
		return "";
	}
}

// ─── Types ──────────────────────────────────────────────────────────────────

interface PRContext {
	owner: string;
	repo: string;
	pullNumber: number;
	prTitle: string;
	prBody: string;
	baseBranch: string;
	headBranch: string;
	files: { filename: string; patch: string }[];
	mergeConflict?: boolean;
}

interface IssueContext {
	owner: string;
	repo: string;
	issueNumber: number;
	title: string;
	body: string | null;
	state: string;
	labels: string[];
	comments: { author: string; body: string; createdAt: string }[];
}

interface InlineContext {
	filename: string;
	startLine: number;
	endLine: number;
	selectedCode: string;
	side: "LEFT" | "RIGHT";
}

interface PageContext {
	pathname?: string;
}

// ─── Tool Factories ─────────────────────────────────────────────────────────

function getGeneralTools(octokit: Octokit, pageContext?: PageContext, userId?: string) {
	let createdPromptRequest: {
		id: string;
		title: string;
		owner: string;
		repo: string;
		url: string;
	} | null = null;
	return {
		searchRepos: tool({
			description:
				"Search GitHub repositories by query. Use for 'find repos about X', 'search for Y library', etc.",
			inputSchema: z.object({
				query: z.string().describe("Search query"),
				language: z
					.string()
					.optional()
					.describe("Filter by programming language"),
				sort: z
					.enum(["stars", "updated", "best-match"])
					.optional()
					.describe("Sort order"),
			}),
			execute: async ({ query, language, sort }) => {
				const q = language ? `${query} language:${language}` : query;
				const { data } = await octokit.search.repos({
					q,
					sort: sort === "best-match" ? undefined : sort,
					order: "desc",
					per_page: 10,
				});
				return {
					total_count: data.total_count,
					repos: data.items.map((r) => ({
						full_name: r.full_name,
						description: r.description,
						stargazers_count: r.stargazers_count,
						forks_count: r.forks_count,
						language: r.language,
						updated_at: r.updated_at,
						owner_avatar: r.owner?.avatar_url,
					})),
				};
			},
		}),

		searchUsers: tool({
			description: "Search GitHub users by username or name.",
			inputSchema: z.object({
				query: z.string().describe("Search query for username or name"),
			}),
			execute: async ({ query }) => {
				const { data } = await octokit.search.users({
					q: query,
					per_page: 10,
				});
				return {
					total_count: data.total_count,
					users: data.items.map((u) => ({
						login: u.login,
						avatar_url: u.avatar_url,
						type: u.type,
						html_url: toAppUrl(u.html_url),
					})),
				};
			},
		}),

		getRepoInfo: tool({
			description: "Get detailed information about a specific repository.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async ({ owner, repo }) => {
				const { data } = await octokit.repos.get({ owner, repo });
				return {
					full_name: data.full_name,
					description: data.description,
					stargazers_count: data.stargazers_count,
					forks_count: data.forks_count,
					open_issues_count: data.open_issues_count,
					language: data.language,
					default_branch: data.default_branch,
					created_at: data.created_at,
					updated_at: data.updated_at,
					license:
						(data.license as { spdx_id?: string } | null)
							?.spdx_id || null,
					topics: data.topics,
					private: data.private,
					fork: data.fork,
					archived: data.archived,
					watchers_count: data.watchers_count,
					owner_avatar: data.owner?.avatar_url,
				};
			},
		}),

		starRepo: tool({
			description:
				"Star a repository. Use when the user says 'star this repo' or 'star owner/repo'.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async ({ owner, repo }) => {
				await octokit.activity.starRepoForAuthenticatedUser({
					owner,
					repo,
				});
				return {
					success: true,
					action: "starred",
					repo: `${owner}/${repo}`,
				};
			},
		}),

		unstarRepo: tool({
			description: "Unstar a repository.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async ({ owner, repo }) => {
				await octokit.activity.unstarRepoForAuthenticatedUser({
					owner,
					repo,
				});
				return {
					success: true,
					action: "unstarred",
					repo: `${owner}/${repo}`,
				};
			},
		}),

		forkRepo: tool({
			description: "Fork a repository to the authenticated user's account.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async ({ owner, repo }) => {
				const { data } = await octokit.repos.createFork({ owner, repo });
				return {
					success: true,
					action: "forked",
					full_name: data.full_name,
					html_url: toAppUrl(data.html_url),
				};
			},
		}),

		watchRepo: tool({
			description: "Watch/subscribe to a repository for notifications.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async ({ owner, repo }) => {
				await octokit.activity.setRepoSubscription({
					owner,
					repo,
					subscribed: true,
				});
				return {
					success: true,
					action: "watching",
					repo: `${owner}/${repo}`,
				};
			},
		}),

		unwatchRepo: tool({
			description: "Stop watching a repository.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async ({ owner, repo }) => {
				await octokit.activity.deleteRepoSubscription({ owner, repo });
				return {
					success: true,
					action: "unwatched",
					repo: `${owner}/${repo}`,
				};
			},
		}),

		createIssue: tool({
			description:
				"Create a new issue on a repository. Ask for title and body if not provided.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				title: z.string().describe("Issue title"),
				body: z.string().optional().describe("Issue body/description"),
				labels: z.array(z.string()).optional().describe("Labels to add"),
			}),
			execute: async ({ owner, repo, title, body, labels }) => {
				const { data } = await octokit.issues.create({
					owner,
					repo,
					title,
					body,
					labels,
				});
				return {
					success: true,
					number: data.number,
					title: data.title,
					html_url: toAppUrl(data.html_url),
					repo: `${owner}/${repo}`,
				};
			},
		}),

		closeIssue: tool({
			description: "Close an issue. Only call after confirmation.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue number to close"),
			}),
			execute: async ({ owner, repo, issueNumber }) => {
				const { data } = await octokit.issues.update({
					owner,
					repo,
					issue_number: issueNumber,
					state: "closed",
				});
				return {
					success: true,
					action: "closed",
					number: data.number,
					title: data.title,
				};
			},
		}),

		listIssues: tool({
			description: "List issues for a repository.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				state: z
					.enum(["open", "closed", "all"])
					.optional()
					.describe("Issue state filter"),
				labels: z
					.string()
					.optional()
					.describe("Comma-separated label names"),
			}),
			execute: async ({ owner, repo, state, labels }) => {
				const { data } = await octokit.issues.listForRepo({
					owner,
					repo,
					state: state || "open",
					labels,
					per_page: 15,
					sort: "updated",
					direction: "desc",
				});
				return {
					issues: data
						.filter((i) => !i.pull_request)
						.map((i) => ({
							number: i.number,
							title: i.title,
							state: i.state,
							user: i.user?.login,
							labels: i.labels.map((l) =>
								typeof l === "string" ? l : l.name,
							),
							created_at: i.created_at,
							comments: i.comments,
						})),
				};
			},
		}),

		listPullRequests: tool({
			description: "List pull requests for a repository.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				state: z
					.enum(["open", "closed", "all"])
					.optional()
					.describe("PR state filter"),
			}),
			execute: async ({ owner, repo, state }) => {
				const { data } = await octokit.pulls.list({
					owner,
					repo,
					state: state || "open",
					per_page: 15,
					sort: "updated",
					direction: "desc",
				});
				return {
					pull_requests: data.map((pr) => ({
						number: pr.number,
						title: pr.title,
						state: pr.state,
						user: pr.user?.login,
						created_at: pr.created_at,
						draft: pr.draft,
						head: pr.head.ref,
						base: pr.base.ref,
					})),
				};
			},
		}),

		mergePullRequest: tool({
			description: "Merge a pull request. Ask for confirmation before merging.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pullNumber: z.number().describe("PR number to merge"),
				mergeMethod: z
					.enum(["merge", "squash", "rebase"])
					.optional()
					.describe("Merge method"),
			}),
			execute: async ({ owner, repo, pullNumber, mergeMethod }) => {
				const { data } = await octokit.pulls.merge({
					owner,
					repo,
					pull_number: pullNumber,
					merge_method: mergeMethod || "merge",
				});
				return {
					_clientAction: "refreshPage" as const,
					success: data.merged,
					message: data.message,
					sha: data.sha,
				};
			},
		}),

		getUserProfile: tool({
			description: "Get a GitHub user's profile information.",
			inputSchema: z.object({
				username: z.string().describe("GitHub username"),
			}),
			execute: async ({ username }) => {
				const { data } = await octokit.users.getByUsername({ username });
				return {
					login: data.login,
					name: data.name,
					bio: data.bio,
					avatar_url: data.avatar_url,
					html_url: toAppUrl(data.html_url),
					public_repos: data.public_repos,
					followers: data.followers,
					following: data.following,
					company: data.company,
					location: data.location,
					blog: data.blog,
					created_at: data.created_at,
				};
			},
		}),

		followUser: tool({
			description: "Follow a GitHub user.",
			inputSchema: z.object({
				username: z.string().describe("GitHub username to follow"),
			}),
			execute: async ({ username }) => {
				await octokit.users.follow({ username });
				return { success: true, action: "followed", username };
			},
		}),

		unfollowUser: tool({
			description: "Unfollow a GitHub user.",
			inputSchema: z.object({
				username: z.string().describe("GitHub username to unfollow"),
			}),
			execute: async ({ username }) => {
				await octokit.users.unfollow({ username });
				return { success: true, action: "unfollowed", username };
			},
		}),

		listNotifications: tool({
			description: "List the user's unread GitHub notifications.",
			inputSchema: z.object({
				all: z
					.boolean()
					.optional()
					.describe(
						"If true, show all notifications (not just unread)",
					),
			}),
			execute: async ({ all }) => {
				const { data } =
					await octokit.activity.listNotificationsForAuthenticatedUser(
						{
							all: all || false,
							per_page: 15,
						},
					);
				return {
					notifications: data.map((n) => ({
						id: n.id,
						reason: n.reason,
						subject_title: n.subject.title,
						subject_type: n.subject.type,
						repo: n.repository.full_name,
						updated_at: n.updated_at,
						unread: n.unread,
					})),
				};
			},
		}),

		markNotificationsRead: tool({
			description: "Mark all notifications as read.",
			inputSchema: z.object({}),
			execute: async () => {
				await octokit.activity.markNotificationsAsRead();
				return { success: true, action: "marked_all_read" };
			},
		}),

		createGist: tool({
			description:
				"Create a GitHub Gist. Useful for quickly sharing code snippets.",
			inputSchema: z.object({
				description: z.string().optional().describe("Gist description"),
				filename: z.string().describe("Filename for the gist"),
				content: z.string().describe("File content"),
				public: z
					.boolean()
					.optional()
					.describe("Whether the gist is public (default: false)"),
			}),
			execute: async ({ description, filename, content, public: isPublic }) => {
				const { data } = await octokit.gists.create({
					description: description || "",
					public: isPublic || false,
					files: { [filename]: { content } },
				});
				return {
					success: true,
					html_url: data.html_url
						? toAppUrl(data.html_url)
						: data.html_url,
					id: data.id,
				};
			},
		}),

		refreshPage: tool({
			description:
				"Refresh the current page to reflect changes. Call this AFTER any mutation that affects the current UI — e.g. after starring a repo while on that repo's page, after closing an issue while viewing it, after merging a PR, after commenting, after adding labels, etc. Only call once at the end of your response, not after every tool call.",
			inputSchema: z.object({}),
			execute: async () => {
				// Invalidate local caches so router.refresh() picks up fresh data
				const path = pageContext?.pathname || "";
				const issueMatch = path.match(
					/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
				);
				const prMatch = path.match(
					/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/,
				);
				const issueListMatch = path.match(
					/^\/repos\/([^/]+)\/([^/]+)\/issues\/?$/,
				);
				const prListMatch = path.match(
					/^\/repos\/([^/]+)\/([^/]+)\/pulls\/?$/,
				);

				if (issueMatch) {
					const [, owner, repo, num] = issueMatch;
					await invalidateIssueCache(owner, repo, parseInt(num, 10));
				} else if (prMatch) {
					const [, owner, repo, num] = prMatch;
					await invalidatePullRequestCache(
						owner,
						repo,
						parseInt(num, 10),
					);
				} else if (issueListMatch) {
					const [, owner, repo] = issueListMatch;
					await invalidateRepoIssuesCache(owner, repo);
				} else if (prListMatch) {
					const [, owner, repo] = prListMatch;
					await invalidateRepoPullRequestsCache(owner, repo);
				}

				return {
					_clientAction: "refreshPage" as const,
					success: true,
				};
			},
		}),

		navigateTo: tool({
			description:
				"Navigate the user to a top-level page within the app. Use when they say 'go to repos', 'show me PRs', 'show trending', etc.",
			inputSchema: z.object({
				page: z
					.enum([
						"dashboard",
						"repos",
						"prs",
						"issues",
						"notifications",
						"settings",
						"search",
						"trending",
						"orgs",
					])
					.describe("Target page"),
				description: z
					.string()
					.describe(
						"Brief description, e.g. 'Opening repositories page'",
					),
			}),
			execute: async (input) => ({
				_clientAction: "navigate" as const,
				...input,
			}),
		}),

		openRepo: tool({
			description: "Navigate to a specific repository within the app.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
			}),
			execute: async (input) => ({
				_clientAction: "openRepo" as const,
				...input,
			}),
		}),

		openRepoTab: tool({
			description:
				"Navigate to a specific tab/section of a repository within the app. Use when the user says 'show me actions', 'show commits', 'who contributes', 'show security', 'repo settings', etc.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				tab: z
					.enum([
						"actions",
						"commits",
						"issues",
						"pulls",
						"people",
						"security",
						"settings",
					])
					.describe("The repo tab to navigate to"),
			}),
			execute: async (input) => ({
				_clientAction: "openRepoTab" as const,
				...input,
			}),
		}),

		openWorkflowRun: tool({
			description:
				"Navigate to a specific workflow run (GitHub Action) within the app. Use when the user says 'show me run #123', 'open that action', etc.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				runId: z.number().describe("Workflow run ID"),
			}),
			execute: async (input) => ({
				_clientAction: "openWorkflowRun" as const,
				...input,
			}),
		}),

		openCommit: tool({
			description:
				"Navigate to a specific commit within the app. Use when the user says 'show me commit abc123', 'open that commit', etc.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				sha: z.string().describe("Commit SHA"),
			}),
			execute: async (input) => ({
				_clientAction: "openCommit" as const,
				...input,
			}),
		}),

		openIssue: tool({
			description:
				"Navigate to a specific issue within the app. Use when the user says 'open issue #5', 'go to that issue', 'show me issue 123', etc.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue number"),
			}),
			execute: async (input) => ({
				_clientAction: "openIssue" as const,
				...input,
			}),
		}),

		openPullRequest: tool({
			description:
				"Navigate to a specific pull request within the app. Use when the user says 'open PR #10', 'go to that PR', 'show me pull request 42', etc.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pullNumber: z.number().describe("Pull request number"),
			}),
			execute: async (input) => ({
				_clientAction: "openPullRequest" as const,
				...input,
			}),
		}),

		openUser: tool({
			description:
				"Navigate to a user's profile page within the app. Use when the user says 'show me user X', 'go to their profile', 'who is X', etc.",
			inputSchema: z.object({
				username: z.string().describe("GitHub username"),
			}),
			execute: async (input) => ({
				_clientAction: "openUser" as const,
				...input,
			}),
		}),

		openUrl: tool({
			description:
				"Open an external URL in a new browser tab. Only use for URLs that DON'T have an in-app equivalent. For repos, issues, PRs, actions, commits, users — always use the specific navigation tools instead.",
			inputSchema: z.object({
				url: z.string().describe("URL to open"),
				description: z.string().describe("What this link is"),
			}),
			execute: async (input) => ({
				_clientAction: "openUrl" as const,
				...input,
			}),
		}),

		// ── Flexible read-only GitHub API query ──────────────────────────────

		queryGitHub: tool({
			description: `Make any read-only GET request to the GitHub REST API. Use this when the user asks something that your other tools can't answer — e.g. "list branches", "show releases", "who reviewed PR #5", "show workflow runs", "list collaborators", "get commit history", etc.

The endpoint uses GitHub's REST route syntax: "GET /repos/{owner}/{repo}/branches", "GET /repos/{owner}/{repo}/releases", "GET /users/{username}/repos", etc.

Path parameters like {owner} should be filled in the params object. Query parameters (per_page, state, sort, etc.) also go in params.

Only GET requests are allowed. For mutations use the dedicated tools.`,
			inputSchema: z.object({
				endpoint: z
					.string()
					.describe(
						'GitHub REST API route, e.g. "GET /repos/{owner}/{repo}/branches"',
					),
				params: z
					.record(
						z.string(),
						z.union([z.string(), z.number(), z.boolean()]),
					)
					.optional()
					.describe(
						"Path and query parameters, e.g. { owner: 'vercel', repo: 'next.js', per_page: 10 }",
					),
			}),
			execute: async ({ endpoint, params }) => {
				// Enforce read-only
				if (!endpoint.startsWith("GET ")) {
					return {
						error: "Only GET requests are allowed. Use dedicated tools for mutations.",
					};
				}
				try {
					const response = await octokit.request(endpoint, {
						...params,
						per_page: (params?.per_page as number) || 20,
					});
					// Truncate large arrays to avoid overwhelming context
					const data = response.data;
					if (Array.isArray(data) && data.length > 30) {
						return {
							total_returned: data.length,
							items: data.slice(0, 30),
							truncated: true,
						};
					}
					return data;
				} catch (e: unknown) {
					return {
						error:
							e instanceof Error
								? e.message
								: "GitHub API request failed",
						status: (e as { status?: number }).status ?? null,
					};
				}
			},
		}),

		// ── Comment tools ────────────────────────────────────────────────────

		comment: tool({
			description: "Add a comment to a GitHub issue or pull request.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue or PR number"),
				body: z.string().describe("Comment body (markdown supported)"),
			}),
			execute: async ({ owner, repo, issueNumber, body }) => {
				const { data } = await octokit.issues.createComment({
					owner,
					repo,
					issue_number: issueNumber,
					body,
				});
				return {
					success: true,
					id: data.id,
					html_url: toAppUrl(data.html_url),
				};
			},
		}),

		// ── Label tools ──────────────────────────────────────────────────────

		addLabels: tool({
			description: "Add labels to an issue or pull request.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue or PR number"),
				labels: z.array(z.string()).describe("Label names to add"),
			}),
			execute: async ({ owner, repo, issueNumber, labels }) => {
				const { data } = await octokit.issues.addLabels({
					owner,
					repo,
					issue_number: issueNumber,
					labels,
				});
				return {
					success: true,
					labels: data.map((l) => l.name),
				};
			},
		}),

		removeLabels: tool({
			description: "Remove a label from an issue or pull request.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue or PR number"),
				label: z.string().describe("Label name to remove"),
			}),
			execute: async ({ owner, repo, issueNumber, label }) => {
				try {
					await octokit.issues.removeLabel({
						owner,
						repo,
						issue_number: issueNumber,
						name: label,
					});
					return { success: true, removed: label };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to remove label",
					};
				}
			},
		}),

		// ── PR review tools ──────────────────────────────────────────────────

		requestReviewers: tool({
			description:
				"Request reviewers for a pull request. Ask for confirmation if not sure who to request.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				pullNumber: z.number().describe("PR number"),
				reviewers: z
					.array(z.string())
					.describe("GitHub usernames to request review from"),
			}),
			execute: async ({ owner, repo, pullNumber, reviewers }) => {
				const { data } = await octokit.pulls.requestReviewers({
					owner,
					repo,
					pull_number: pullNumber,
					reviewers,
				});
				return {
					success: true,
					requested_reviewers: (data.requested_reviewers || []).map(
						(r: any) => r.login,
					),
				};
			},
		}),

		// ── Branch tool ──────────────────────────────────────────────────────

		createBranch: tool({
			description:
				"Create a new branch from an existing ref (branch name or SHA).",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				branchName: z.string().describe("New branch name"),
				fromRef: z
					.string()
					.describe(
						"Source branch name or commit SHA to branch from",
					),
			}),
			execute: async ({ owner, repo, branchName, fromRef }) => {
				try {
					// Resolve the SHA
					let sha = fromRef;
					if (!/^[0-9a-f]{40}$/i.test(fromRef)) {
						const { data } = await octokit.git.getRef({
							owner,
							repo,
							ref: `heads/${fromRef}`,
						});
						sha = data.object.sha;
					}
					await octokit.git.createRef({
						owner,
						repo,
						ref: `refs/heads/${branchName}`,
						sha,
					});
					return {
						success: true,
						branch: branchName,
						from: fromRef,
						sha,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to create branch",
					};
				}
			},
		}),

		// ── Assign tools ─────────────────────────────────────────────────────

		assignIssue: tool({
			description: "Assign users to an issue or pull request.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue or PR number"),
				assignees: z
					.array(z.string())
					.describe("GitHub usernames to assign"),
			}),
			execute: async ({ owner, repo, issueNumber, assignees }) => {
				const { data } = await octokit.issues.addAssignees({
					owner,
					repo,
					issue_number: issueNumber,
					assignees,
				});
				return {
					success: true,
					assignees: (data.assignees || []).map((a: any) => a.login),
				};
			},
		}),

		unassignIssue: tool({
			description: "Remove assignees from an issue or pull request.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				issueNumber: z.number().describe("Issue or PR number"),
				assignees: z
					.array(z.string())
					.describe("GitHub usernames to unassign"),
			}),
			execute: async ({ owner, repo, issueNumber, assignees }) => {
				const { data } = await octokit.issues.removeAssignees({
					owner,
					repo,
					issue_number: issueNumber,
					assignees,
				});
				return {
					success: true,
					remaining_assignees: (data.assignees || []).map(
						(a: any) => a.login,
					),
				};
			},
		}),

		createPromptRequest: tool({
			description:
				"Create a prompt request for a repository. Use when the user wants to capture an idea, feature request, bug fix, or refactor as a prompt request. Summarize the conversation into clear, actionable instructions in the body.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				title: z
					.string()
					.describe("Short descriptive title for the prompt request"),
				body: z
					.string()
					.describe(
						"Detailed instructions for the changes. Be specific about what files to change, what logic to add, etc.",
					),
			}),
			execute: async ({ owner, repo, title, body }) => {
				if (!userId) return { error: "Not authenticated" };
				if (createdPromptRequest) {
					return {
						_clientAction: "openPromptRequests" as const,
						success: true,
						alreadyCreated: true,
						...createdPromptRequest,
					};
				}
				const pr = await createPromptRequestInDb(
					userId,
					owner,
					repo,
					title,
					body,
				);
				createdPromptRequest = {
					id: pr.id,
					title: pr.title,
					owner,
					repo,
					url: `/${owner}/${repo}/prompts/${pr.id}`,
				};
				return {
					_clientAction: "openPromptRequests" as const,
					success: true,
					...createdPromptRequest,
				};
			},
		}),

		completePromptRequest: tool({
			description:
				"Mark a prompt request as completed after creating a PR for it. Use after createPullRequestFromBranch when processing a prompt request.",
			inputSchema: z.object({
				promptRequestId: z
					.string()
					.describe("The prompt request ID to mark as completed"),
				prNumber: z.number().describe("The PR number that was created"),
			}),
			execute: async ({ promptRequestId, prNumber }) => {
				await updatePromptRequestStatus(promptRequestId, "completed", {
					prNumber,
				});
				return {
					_clientAction: "refreshPage" as const,
					success: true,
					promptRequestId,
					prNumber,
				};
			},
		}),

		editPromptRequest: tool({
			description:
				"Edit an existing prompt request's title and/or body. Use when the user asks to update, refine, or change a prompt request they are currently viewing.",
			inputSchema: z.object({
				promptRequestId: z
					.string()
					.describe("The prompt request ID to edit"),
				title: z
					.string()
					.optional()
					.describe("New title (omit to keep current)"),
				body: z
					.string()
					.optional()
					.describe("New body/instructions (omit to keep current)"),
			}),
			execute: async ({ promptRequestId, title, body }) => {
				const existing = await getPromptRequestFromDb(promptRequestId);
				if (!existing) return { error: "Prompt request not found" };
				if (existing.status !== "open")
					return { error: "Can only edit open prompt requests" };

				const updated = await updatePromptRequestContent(promptRequestId, {
					...(title !== undefined ? { title } : {}),
					...(body !== undefined ? { body } : {}),
				});

				return {
					_clientAction: "refreshPage" as const,
					success: true,
					promptRequestId,
					title: updated?.title,
				};
			},
		}),
	};
}

interface CommitAuthor {
	name: string;
	email: string;
}

function getPrTools(octokit: Octokit, prContext: PRContext, commitAuthor?: CommitAuthor) {
	return {
		getFileContent: tool({
			description:
				"Read the full contents of a file from the PR's head branch. Use this before editing a file to get its current state.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
			}),
			execute: async ({ path }) => {
				try {
					const { data } = await octokit.repos.getContent({
						owner: prContext.owner,
						repo: prContext.repo,
						path,
						ref: prContext.headBranch,
					});
					if (Array.isArray(data) || data.type !== "file") {
						return { error: "Not a file" };
					}
					const content = Buffer.from(
						(data as { content: string }).content,
						"base64",
					).toString("utf-8");
					return { path, content };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to read file",
					};
				}
			},
		}),

		editFile: tool({
			description:
				"Edit an existing file on the PR branch and commit the change. Always read the file first with getFileContent.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
				content: z.string().describe("The complete new file content"),
				commitMessage: z
					.string()
					.describe(
						"A clear, concise commit message describing the change",
					),
			}),
			execute: async ({ path, content, commitMessage }) => {
				try {
					const { data: fileData } = await octokit.repos.getContent({
						owner: prContext.owner,
						repo: prContext.repo,
						path,
						ref: prContext.headBranch,
					});
					if (Array.isArray(fileData) || fileData.type !== "file") {
						return { error: "Not a file" };
					}

					await octokit.repos.createOrUpdateFileContents({
						owner: prContext.owner,
						repo: prContext.repo,
						path,
						message: commitMessage,
						content: Buffer.from(content).toString("base64"),
						sha: (fileData as { sha?: string }).sha,
						branch: prContext.headBranch,
						...(commitAuthor
							? {
									author: commitAuthor,
									committer: commitAuthor,
								}
							: {}),
					});

					return {
						success: true,
						path,
						branch: prContext.headBranch,
						commitMessage,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to edit file",
					};
				}
			},
		}),

		createFile: tool({
			description: "Create a new file on the PR branch and commit it.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
				content: z.string().describe("The file content"),
				commitMessage: z
					.string()
					.describe("A clear, concise commit message"),
			}),
			execute: async ({ path, content, commitMessage }) => {
				try {
					await octokit.repos.createOrUpdateFileContents({
						owner: prContext.owner,
						repo: prContext.repo,
						path,
						message: commitMessage,
						content: Buffer.from(content).toString("base64"),
						branch: prContext.headBranch,
						...(commitAuthor
							? {
									author: commitAuthor,
									committer: commitAuthor,
								}
							: {}),
					});

					return {
						success: true,
						path,
						branch: prContext.headBranch,
						commitMessage,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to create file",
					};
				}
			},
		}),

		amendCommit: tool({
			description:
				"Amend the last commit on the PR branch. Replaces the most recent commit with updated file changes while keeping the same parent. Use this when you want to add more changes to the previous commit instead of creating a new one — for example, fixing a typo in a file you just edited, or adding a forgotten file to the last commit.",
			inputSchema: z.object({
				files: z
					.array(
						z.object({
							path: z
								.string()
								.describe(
									"File path relative to repo root",
								),
							content: z
								.string()
								.describe(
									"The complete new file content",
								),
						}),
					)
					.describe("Files to include in the amended commit"),
				commitMessage: z
					.string()
					.optional()
					.describe(
						"New commit message. If omitted, keeps the original message.",
					),
			}),
			execute: async ({ files, commitMessage }) => {
				try {
					const o = prContext.owner;
					const r = prContext.repo;
					const branch = prContext.headBranch;

					// 1. Get the latest commit on the branch
					const { data: refData } = await octokit.git.getRef({
						owner: o,
						repo: r,
						ref: `heads/${branch}`,
					});
					const lastCommitSha = refData.object.sha;

					// 2. Get the commit to find its parent and message
					const { data: lastCommit } = await octokit.git.getCommit({
						owner: o,
						repo: r,
						commit_sha: lastCommitSha,
					});
					const parentSha = lastCommit.parents[0]?.sha;
					if (!parentSha) {
						return {
							error: "Cannot amend: no parent commit found",
						};
					}
					const originalMessage = lastCommit.message;
					const baseTreeSha = lastCommit.tree.sha;

					// 3. Create blobs for each file
					const treeItems = await Promise.all(
						files.map(async (file) => {
							const { data: blob } =
								await octokit.git.createBlob({
									owner: o,
									repo: r,
									content: Buffer.from(
										file.content,
									).toString("base64"),
									encoding: "base64",
								});
							return {
								path: file.path,
								mode: "100644" as const,
								type: "blob" as const,
								sha: blob.sha,
							};
						}),
					);

					// 4. Create a new tree based on the last commit's tree
					const { data: newTree } = await octokit.git.createTree({
						owner: o,
						repo: r,
						base_tree: baseTreeSha,
						tree: treeItems,
					});

					// 5. Create a new commit with the same parent (replacing the old one)
					const { data: newCommit } = await octokit.git.createCommit({
						owner: o,
						repo: r,
						message: commitMessage || originalMessage,
						tree: newTree.sha,
						parents: [parentSha],
						...(commitAuthor
							? {
									author: {
										...commitAuthor,
										date: new Date().toISOString(),
									},
								}
							: {}),
					});

					// 6. Force-update the branch to point to the new commit
					await octokit.git.updateRef({
						owner: o,
						repo: r,
						ref: `heads/${branch}`,
						sha: newCommit.sha,
						force: true,
					});

					return {
						success: true,
						branch,
						commitMessage: commitMessage || originalMessage,
						amendedSha: lastCommitSha.slice(0, 7),
						newSha: newCommit.sha.slice(0, 7),
						filesChanged: files.map((f) => f.path),
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to amend commit",
					};
				}
			},
		}),
	};
}

function getIssueTools(
	octokit: Octokit,
	issueContext: IssueContext,
	defaultBranch: string,
	commitAuthor?: CommitAuthor,
) {
	let workingBranch: string | null = null;
	const branchName = `fix/issue-${issueContext.issueNumber}`;

	return {
		getFileContent: tool({
			description:
				"Read the full contents of a file from the repository's default branch. Use this before editing a file to understand its current state.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
			}),
			execute: async ({ path }) => {
				try {
					const { data } = await octokit.repos.getContent({
						owner: issueContext.owner,
						repo: issueContext.repo,
						path,
						ref: workingBranch || defaultBranch,
					});
					if (Array.isArray(data) || data.type !== "file") {
						return { error: "Not a file" };
					}
					const content = Buffer.from(
						(data as { content: string }).content,
						"base64",
					).toString("utf-8");
					return { path, content };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to read file",
					};
				}
			},
		}),

		editFile: tool({
			description:
				"Edit an existing file and commit the change. Creates a new branch on first edit. Always read the file first with getFileContent.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
				content: z.string().describe("The complete new file content"),
				commitMessage: z
					.string()
					.describe(
						"A clear, concise commit message describing the change",
					),
			}),
			execute: async ({ path, content, commitMessage }) => {
				try {
					if (!workingBranch) {
						const { data: refData } = await octokit.git.getRef({
							owner: issueContext.owner,
							repo: issueContext.repo,
							ref: `heads/${defaultBranch}`,
						});
						try {
							await octokit.git.createRef({
								owner: issueContext.owner,
								repo: issueContext.repo,
								ref: `refs/heads/${branchName}`,
								sha: refData.object.sha,
							});
						} catch (e: unknown) {
							if (
								(e as { status?: number })
									.status !== 422
							)
								throw e;
						}
						workingBranch = branchName;
					}

					const { data: fileData } = await octokit.repos.getContent({
						owner: issueContext.owner,
						repo: issueContext.repo,
						path,
						ref: workingBranch,
					});
					if (Array.isArray(fileData) || fileData.type !== "file") {
						return { error: "Not a file" };
					}

					await octokit.repos.createOrUpdateFileContents({
						owner: issueContext.owner,
						repo: issueContext.repo,
						path,
						message: commitMessage,
						content: Buffer.from(content).toString("base64"),
						sha: (fileData as { sha?: string }).sha,
						branch: workingBranch,
						...(commitAuthor
							? {
									author: commitAuthor,
									committer: commitAuthor,
								}
							: {}),
					});

					return {
						success: true,
						path,
						branch: workingBranch,
						commitMessage,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to edit file",
					};
				}
			},
		}),

		createFile: tool({
			description:
				"Create a new file and commit it. Creates a new branch on first edit.",
			inputSchema: z.object({
				path: z.string().describe("File path relative to repo root"),
				content: z.string().describe("The file content"),
				commitMessage: z
					.string()
					.describe("A clear, concise commit message"),
			}),
			execute: async ({ path, content, commitMessage }) => {
				try {
					if (!workingBranch) {
						const { data: refData } = await octokit.git.getRef({
							owner: issueContext.owner,
							repo: issueContext.repo,
							ref: `heads/${defaultBranch}`,
						});
						try {
							await octokit.git.createRef({
								owner: issueContext.owner,
								repo: issueContext.repo,
								ref: `refs/heads/${branchName}`,
								sha: refData.object.sha,
							});
						} catch (e: unknown) {
							if (
								(e as { status?: number })
									.status !== 422
							)
								throw e;
						}
						workingBranch = branchName;
					}

					await octokit.repos.createOrUpdateFileContents({
						owner: issueContext.owner,
						repo: issueContext.repo,
						path,
						message: commitMessage,
						content: Buffer.from(content).toString("base64"),
						branch: workingBranch,
						...(commitAuthor
							? {
									author: commitAuthor,
									committer: commitAuthor,
								}
							: {}),
					});

					return {
						success: true,
						path,
						branch: workingBranch,
						commitMessage,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to create file",
					};
				}
			},
		}),

		createPullRequest: tool({
			description:
				"Create a pull request from the working branch to fix this issue. Only use after making edits with editFile/createFile.",
			inputSchema: z.object({
				title: z.string().describe("PR title"),
				body: z.string().describe("PR description body"),
			}),
			execute: async ({ title, body }) => {
				try {
					if (!workingBranch) {
						return {
							error: "No changes have been made yet. Use editFile or createFile first.",
						};
					}

					const prBody = `${body}\n\nFixes #${issueContext.issueNumber}`;

					const { data } = await octokit.pulls.create({
						owner: issueContext.owner,
						repo: issueContext.repo,
						title,
						body: prBody,
						head: workingBranch,
						base: defaultBranch,
					});

					return {
						_clientAction: "openPullRequest" as const,
						success: true,
						number: data.number,
						title: data.title,
						html_url: toAppUrl(data.html_url),
						branch: workingBranch,
						owner: issueContext.owner,
						repo: issueContext.repo,
						pullNumber: data.number,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to create pull request",
					};
				}
			},
		}),
	};
}

// ─── Semantic Search Tool ────────────────────────────────────────────────────

function getSemanticSearchTool(userId: string) {
	return {
		semanticSearch: tool({
			description: `ALWAYS use this tool FIRST when the user asks to find, list, or search for PRs/issues/comments by topic, keyword, or description (e.g. "find PRs about X", "list issues related to Y", "search for Z"). This performs semantic search across all content the user has previously viewed. Only fall back to GitHub API search tools if this returns no results.`,
			inputSchema: z.object({
				query: z.string().describe("Natural language search query"),
				owner: z.string().optional().describe("Filter by repository owner"),
				repo: z.string().optional().describe("Filter by repository name"),
				contentTypes: z
					.array(
						z.enum([
							"pr",
							"issue",
							"pr_comment",
							"issue_comment",
							"review",
						]),
					)
					.optional()
					.describe("Filter by content type"),
				topK: z
					.number()
					.optional()
					.describe("Number of results to return (default 10)"),
			}),
			execute: async ({ query, owner, repo, contentTypes, topK }) => {
				try {
					// 1. Embed the query
					const queryEmbedding = await embedText(query);

					// 2. Cosine similarity search (top 30 candidates)
					const candidates = await searchEmbeddings(
						userId,
						queryEmbedding,
						{
							owner,
							repo,
							topK: 30,
							contentTypes: contentTypes as
								| ContentType[]
								| undefined,
						},
					);

					if (candidates.length === 0) {
						return {
							results: [],
							message: "No previously viewed content found. The user needs to view PRs/issues first for them to be searchable.",
						};
					}

					// 3. Rerank via Mixedbread
					const reranked = await rerankResults(
						query,
						candidates.map((c) => ({
							id: c.contentKey,
							text: `${c.title ?? ""}\n${c.snippet}`,
						})),
						topK ?? 10,
					);

					// 4. Map reranked results back to candidates
					const rerankedMap = new Map(
						reranked.map((r) => [r.id, r.score]),
					);
					const results = candidates
						.filter((c) => rerankedMap.has(c.contentKey))
						.map((c) => ({
							contentType: c.contentType,
							contentKey: c.contentKey,
							owner: c.owner,
							repo: c.repo,
							itemNumber: c.itemNumber,
							title: c.title,
							snippet: c.snippet,
							score: rerankedMap.get(c.contentKey)!,
						}))
						.sort((a, b) => b.score - a.score);

					return { results };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Semantic search failed",
					};
				}
			},
		}),
	};
}

// ─── Shared Helpers ─────────────────────────────────────────────────────────

function buildInlineContextBlock(inlineContexts?: InlineContext[]): string {
	if (!inlineContexts || inlineContexts.length === 0) return "";

	const blocks = inlineContexts
		.map((ctx) => {
			const lineLabel =
				ctx.startLine === ctx.endLine
					? `line ${ctx.startLine}`
					: `lines ${ctx.startLine}\u2013${ctx.endLine}`;
			const sideLabel =
				ctx.side === "LEFT" ? "old/removed version" : "new/current version";
			// Use diff language hint if the code contains diff markers
			const hasDiffMarkers = /^[+-] /m.test(ctx.selectedCode);
			const lang = hasDiffMarkers ? "diff" : "";
			return `### File: \`${ctx.filename}\` | ${lineLabel} (${sideLabel})\n\`\`\`${lang}\n${ctx.selectedCode}\n\`\`\``;
		})
		.join("\n\n");

	return `

## USER-SELECTED CODE (HIGHEST PRIORITY)
**The user has explicitly selected the following code snippet(s) from the diff. When they say "this line", "this code", "this", "what does this do", etc., they are ALWAYS referring to this exact code below.** Answer about this code directly — do not ask them to clarify which line or which file.

${blocks}

Reference the exact file name and line numbers shown above in your response. The line numbers correspond to the file's line numbers. If you need to see more of the file for full context, use the getFileContent tool.`;
}

// ─── System Prompts ─────────────────────────────────────────────────────────

function buildPrSystemPrompt(
	prContext: PRContext,
	inlineContexts?: InlineContext[],
	activeFile?: string,
	sandboxPrompt?: string,
) {
	// Determine which files need full diffs (active file + files in inline contexts)
	const priorityFiles = new Set<string>();
	if (activeFile) priorityFiles.add(activeFile);
	if (inlineContexts) {
		for (const ctx of inlineContexts) priorityFiles.add(ctx.filename);
	}

	// Budget: keep total diff content under ~50K chars (~12K tokens) to leave room
	const MAX_DIFF_CHARS = 50_000;
	let diffCharsUsed = 0;

	// 1. Build full diffs for priority files first
	const priorityDiffs: string[] = [];
	const otherFiles: { filename: string; patchLen: number }[] = [];

	for (const f of prContext.files) {
		if (priorityFiles.has(f.filename) && f.patch) {
			priorityDiffs.push(`### ${f.filename}\n\`\`\`diff\n${f.patch}\n\`\`\``);
			diffCharsUsed += f.patch.length;
		} else {
			otherFiles.push({ filename: f.filename, patchLen: f.patch?.length ?? 0 });
		}
	}

	// 2. Include other file diffs if they fit within the budget
	const includedOtherDiffs: string[] = [];
	const listedOnlyFiles: string[] = [];

	for (const f of otherFiles) {
		const file = prContext.files.find((pf) => pf.filename === f.filename);
		if (file?.patch && diffCharsUsed + file.patch.length < MAX_DIFF_CHARS) {
			includedOtherDiffs.push(
				`### ${file.filename}\n\`\`\`diff\n${file.patch}\n\`\`\``,
			);
			diffCharsUsed += file.patch.length;
		} else {
			listedOnlyFiles.push(f.filename);
		}
	}

	// 3. Assemble the changed files section
	const allDiffs = [...priorityDiffs, ...includedOtherDiffs].join("\n\n");
	const fileListSection =
		listedOnlyFiles.length > 0
			? `\n\n### Other Changed Files (${listedOnlyFiles.length} files — use getFileContent to read)\n${listedOnlyFiles.map((f) => `- \`${f}\``).join("\n")}`
			: "";

	const inlineContextPrompt = buildInlineContextBlock(inlineContexts);

	const activeFilePrompt = activeFile
		? `\n\n## Currently Viewing\nThe user is currently viewing the file: \`${activeFile}\` in the diff viewer.\nIf no specific code snippet is attached below, then "this file" or "this" refers to this file.`
		: "";

	return `You are Ghost, an AI assistant built into a GitHub client app. You are currently helping with a pull request.

## Pull Request Context
**Repository:** ${prContext.owner}/${prContext.repo}
**PR #${prContext.pullNumber}:** ${prContext.prTitle}
**Branches:** ${prContext.headBranch} \u2192 ${prContext.baseBranch}
**Files changed:** ${prContext.files.length}

### Description
${prContext.prBody || "(No description provided)"}
${activeFilePrompt}${inlineContextPrompt}

### Changed Files
${allDiffs || "(No file changes available)"}${fileListSection}

## Instructions
- Be concise and specific. Reference file names, line numbers, and show specific code changes.
- If the user attached a code snippet above, ALWAYS answer about that specific code.
- Use **getFileContent** to read files whose diffs were omitted above.
- **NEVER stop mid-task.** Keep calling tools until done. Always provide a complete final response.
- **IMPORTANT:** When linking to repos, PRs, issues, or users, ALWAYS use this app's URLs (e.g. \`${process.env.NEXT_PUBLIC_APP_URL || ""}/repos/{owner}/{repo}\`), NEVER use github.com URLs.
- After any mutation affecting the current page, ALWAYS call **refreshPage**.

## PR Tools
Tools for modifying files on the PR branch (\`${prContext.headBranch}\`):
- **getFileContent**: Read full file contents (use before editing; also for files whose diffs were omitted).
- **editFile**: Edit a file and commit. Always read first with getFileContent.
- **createFile**: Create a new file and commit it.
- **amendCommit**: Amend the last commit (for follow-up fixes). Accepts multiple files.

Read file first → editFile/createFile → clear commit message. Use amendCommit when asked to amend/fixup.
All commits attributed to the signed-in user. Only use tools when explicitly asked to make changes.

${MULTI_FILE_COMMIT_PROMPT}

${QUERYGITHUB_PROMPT}

${MEMORY_PROMPT}

${SEMANTIC_SEARCH_PROMPT}

${sandboxPrompt || ""}`;
}

function buildIssueSystemPrompt(
	issueContext: IssueContext,
	defaultBranch: string,
	inlineContexts?: InlineContext[],
	sandboxPrompt?: string,
) {
	const branchName = `fix/issue-${issueContext.issueNumber}`;
	const commentsFormatted = issueContext.comments
		.map((c) => `**@${c.author}** (${c.createdAt}):\n${c.body}`)
		.join("\n\n---\n\n");

	const inlineContextPrompt = buildInlineContextBlock(inlineContexts);

	return `You are Ghost, an AI assistant built into a GitHub client app. You are currently helping with a GitHub issue.

## Issue Context
**Repository:** ${issueContext.owner}/${issueContext.repo}
**Issue #${issueContext.issueNumber}:** ${issueContext.title}
**State:** ${issueContext.state}
**Labels:** ${issueContext.labels.length > 0 ? issueContext.labels.join(", ") : "(none)"}

### Description
${issueContext.body || "(No description provided)"}
${inlineContextPrompt}

${commentsFormatted ? `### Comments\n${commentsFormatted}` : ""}

## Instructions
- Be concise and specific. Reference file names, line numbers, and show specific code changes.
- If the user attached a code snippet above, ALWAYS answer about that specific code.
- **NEVER stop mid-task.** Keep calling tools until done. Always provide a complete final response.
- **IMPORTANT:** When linking to repos, PRs, issues, or users, ALWAYS use this app's URLs (e.g. \`${process.env.NEXT_PUBLIC_APP_URL || ""}/repos/{owner}/{repo}\`), NEVER use github.com URLs.
- After any mutation affecting the current page, ALWAYS call **refreshPage**.

## Issue Tools
- **getFileContent**: Read full file contents from \`${defaultBranch}\`.
- **editFile**: Edit a file. Creates branch \`${branchName}\` on first edit.
- **createFile**: Create a new file (same branch strategy).
- **createPullRequest**: Open a PR from the working branch.

Read files first → editFile/createFile → createPullRequest. All commits attributed to the signed-in user.
Only use tools when explicitly asked to make changes or fix something.

${MULTI_FILE_COMMIT_PROMPT}

${QUERYGITHUB_PROMPT}

${MEMORY_PROMPT}

${SEMANTIC_SEARCH_PROMPT}

${sandboxPrompt || ""}`;
}

function buildGeneralSystemPrompt(
	currentUser: { login: string } | null,
	pageContext?: PageContext,
	inlineContexts?: InlineContext[],
	sandboxPrompt?: string,
) {
	let pageContextPrompt = "";
	if (pageContext?.pathname) {
		pageContextPrompt = `\n\n## Current Page Context
**Current URL:** ${pageContext.pathname}
Use this context to understand what the user might be referring to.`;
	}

	const inlineContextPrompt = buildInlineContextBlock(inlineContexts);

	return `You are Ghost, an AI assistant built into a GitHub client app. You help users perform GitHub actions and navigate the app through natural language.

${currentUser ? `Authenticated GitHub user: ${currentUser.login}` : ""}
${inlineContextPrompt}

## Instructions
- Be concise and helpful. Tool results render as rich UI — do NOT repeat tool output as text.
- If the user attached a code snippet above, ALWAYS answer about that specific code.
- **NEVER stop mid-task.** Keep calling tools until done. Always provide a complete final response.
- **IMPORTANT:** ALWAYS use this app's URLs (e.g. \`${process.env.NEXT_PUBLIC_APP_URL || ""}/repos/{owner}/{repo}\`), NEVER github.com URLs.

## Action Rules
- Destructive actions (delete repo, close issue): ask confirmation. Star/fork: proceed directly.
- **ALWAYS call refreshPage** after any mutation affecting the current page.
- **ALWAYS navigate within the app** — use navigation tools, not github.com links.
- **NEVER say you can't perform git operations.** Use stageFile + commitChanges for multi-file commits, or the sandbox for shell-based git ops.

## Prompt Requests
- \`createPromptRequest\`: when the user says "open/create a prompt request". Summarize conversation into actionable instructions. Call exactly ONCE per request.
- \`editPromptRequest\`: when asked to update a prompt request. Extract ID from URL if on a prompt page.
- \`completePromptRequest\`: after creating a PR that fulfills a prompt request.
- When processing a prompt request, use stageFile + commitChanges + createPullRequestFromBranch, then call completePromptRequest.

${MULTI_FILE_COMMIT_PROMPT}

${QUERYGITHUB_PROMPT}

${MEMORY_PROMPT}

${SEMANTIC_SEARCH_PROMPT}

${sandboxPrompt || ""}

## Today's date
${new Date().toISOString().split("T")[0]}${pageContextPrompt}`;
}

// ─── Shared Prompt Sections ─────────────────────────────────────────────────

const MEMORY_PROMPT = `## Memory
Long-term memory via \`saveMemory\` / \`recallMemory\`. Save when the user asks to remember something. Recall when past context would help. Use recalled memories naturally.`;

const SEMANTIC_SEARCH_PROMPT = `## Semantic Search (USE FIRST)
When the user asks to find/search PRs/issues by topic, ALWAYS call **semanticSearch** FIRST — it does natural language search across previously viewed content. Only fall back to GitHub API if it returns empty.`;

const MULTI_FILE_COMMIT_PROMPT = `## Multi-file Commits
For changes spanning multiple files: **stageFile** (one per file) → **commitChanges** → **createPullRequestFromBranch**.`;

const QUERYGITHUB_PROMPT = `## queryGitHub
For any read-only query not covered by a specific tool, use queryGitHub to make GET requests to the GitHub REST API (branches, releases, commits, contributors, workflow runs, stats, org members, etc.).`;

const SANDBOX_PROMPT = `## Cloud Sandbox
Use ONLY for running commands (tests, builds, linters). Workflow: startSandbox → sandboxRun → killSandbox. To commit sandbox changes: sandboxReadFile → stageFile + commitChanges.
Do NOT use sandbox for file reads/writes or commits — use API tools instead. Only install deps when you need to run code.

## Merge Conflicts
Use getMergeConflictInfo → commitMergeResolution (API-based). For complex git ops (cherry-pick, rebase, bisect), use the sandbox.`;

const MERGE_CONFLICT_PROMPT = `

## MERGE CONFLICT RESOLUTION

You are resolving merge conflicts for this PR. Follow this exact process:

### Step 1: Get conflict info
- Call \`getMergeConflictInfo\` with the base branch ({baseBranch}) and head branch ({headBranch})
- This returns each file's content from BOTH branches

### Step 2: Resolve each file
For each file that differs between branches:
1. Compare the base version and head version
2. Resolve intelligently:
   - If changes are in DIFFERENT parts of the code (non-overlapping): keep BOTH changes
   - If changes OVERLAP but are complementary (e.g., one adds an import, other adds a different import): merge both
   - If changes are truly conflicting (modifying the same logic differently): prefer the HEAD (PR) version but incorporate any critical fixes from the base branch
   - Preserve the code style, indentation, and formatting of the surrounding code
3. Produce the final resolved content for each file

### Step 3: Commit the resolution
- Call \`commitMergeResolution\` with ALL resolved files at once
- This creates a merge commit with two parents (head + base), properly resolving the conflict

### Step 4: Report
- Tell the user which files had conflicts and how each was resolved
- Call \`refreshPage\` so the PR page updates

### Critical rules:
- NEVER skip a conflicting file — resolve ALL of them
- If unsure about a conflict, lean toward keeping the PR's changes (HEAD) since the author intended those
- If a conflict is in a generated file (lock files, compiled output), keep the HEAD version
`;

// ─── API-based Code Edit Tools ──────────────────────────────────────────────

function getCodeEditTools(octokit: Octokit, commitAuthor?: CommitAuthor) {
	const stagedFiles = new Map<
		string,
		{ owner: string; repo: string; path: string; content: string }
	>();
	const deletedFiles = new Map<string, { owner: string; repo: string; path: string }>();

	return {
		stageFile: tool({
			description:
				"Stage a file for the next commit. Provide the full file content. Call this for each file you want to create or modify, then use commitChanges to commit them all at once.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				path: z.string().describe("File path relative to repo root"),
				content: z.string().describe("Full file content"),
			}),
			execute: async ({ owner, repo, path, content }) => {
				const key = `${owner}/${repo}:${path}`;
				stagedFiles.set(key, { owner, repo, path, content });
				deletedFiles.delete(key);
				return { success: true, path, stagedCount: stagedFiles.size };
			},
		}),

		stageFileForDeletion: tool({
			description: "Stage a file for deletion in the next commit.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				path: z.string().describe("File path relative to repo root"),
			}),
			execute: async ({ owner, repo, path }) => {
				const key = `${owner}/${repo}:${path}`;
				deletedFiles.set(key, { owner, repo, path });
				stagedFiles.delete(key);
				return { success: true, path, deletedCount: deletedFiles.size };
			},
		}),

		commitChanges: tool({
			description:
				"Commit all staged files to a branch. Creates the branch if it doesn't exist. Use after staging files with stageFile.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				branch: z
					.string()
					.describe(
						"Branch name to commit to (created if it doesn't exist)",
					),
				commitMessage: z
					.string()
					.describe("Commit message describing the changes"),
				baseBranch: z
					.string()
					.optional()
					.describe(
						"Base branch to create from (defaults to repo default branch). Only used when creating a new branch.",
					),
			}),
			execute: async ({ owner, repo, branch, commitMessage, baseBranch }) => {
				// Filter staged/deleted files for this repo
				const repoPrefix = `${owner}/${repo}:`;
				const filesToCommit = Array.from(stagedFiles.entries())
					.filter(([key]) => key.startsWith(repoPrefix))
					.map(([, v]) => v);
				const filesToDelete = Array.from(deletedFiles.entries())
					.filter(([key]) => key.startsWith(repoPrefix))
					.map(([, v]) => v);

				if (filesToCommit.length === 0 && filesToDelete.length === 0) {
					return {
						error: "No files staged for this repository. Use stageFile or stageFileForDeletion first.",
					};
				}

				try {
					// 1. Resolve base branch SHA
					let baseSha: string;
					try {
						const { data: refData } = await octokit.git.getRef({
							owner,
							repo,
							ref: `heads/${branch}`,
						});
						// Branch already exists — commit on top of it
						baseSha = refData.object.sha;
					} catch {
						// Branch doesn't exist — create from baseBranch or default branch
						const base =
							baseBranch ||
							(await octokit.repos.get({ owner, repo }))
								.data.default_branch;
						const { data: baseRef } = await octokit.git.getRef({
							owner,
							repo,
							ref: `heads/${base}`,
						});
						baseSha = baseRef.object.sha;
					}

					// 2. Get the base tree
					const { data: baseCommit } = await octokit.git.getCommit({
						owner,
						repo,
						commit_sha: baseSha,
					});
					const baseTreeSha = baseCommit.tree.sha;

					// 3. Create blobs for staged files in parallel
					const treeEntries: {
						path: string;
						mode: "100644";
						type: "blob";
						sha: string | null;
					}[] = [];

					const blobPromises = filesToCommit.map(
						async ({ path, content }) => {
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

					// 4. Add deletions
					for (const { path } of filesToDelete) {
						treeEntries.push({
							path,
							mode: "100644",
							type: "blob",
							sha: null,
						});
					}

					// 5. Create tree → commit
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
						author: commitAuthor
							? {
									...commitAuthor,
									date: new Date().toISOString(),
								}
							: {
									name: "User",
									email: "user@users.noreply.github.com",
									date: new Date().toISOString(),
								},
					});

					// 6. Create or update branch ref
					try {
						await octokit.git.createRef({
							owner,
							repo,
							ref: `refs/heads/${branch}`,
							sha: newCommit.sha,
						});
					} catch {
						// Branch already exists — update it
						await octokit.git.updateRef({
							owner,
							repo,
							ref: `heads/${branch}`,
							sha: newCommit.sha,
						});
					}

					// 7. Clear staged files for this repo
					for (const key of stagedFiles.keys()) {
						if (key.startsWith(repoPrefix))
							stagedFiles.delete(key);
					}
					for (const key of deletedFiles.keys()) {
						if (key.startsWith(repoPrefix))
							deletedFiles.delete(key);
					}

					return {
						success: true,
						branch,
						commitMessage,
						commitSha: newCommit.sha.slice(0, 7),
						filesChanged: filesToCommit.length,
						filesDeleted: filesToDelete.length,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to commit changes",
					};
				}
			},
		}),

		createPullRequestFromBranch: tool({
			description:
				"Create a pull request from a branch. Use after committing changes with commitChanges.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				title: z.string().describe("PR title"),
				body: z.string().describe("PR description body (markdown)"),
				head: z
					.string()
					.describe(
						"Source branch name (the branch with your commits)",
					),
				base: z
					.string()
					.optional()
					.describe(
						"Target branch (defaults to repo default branch)",
					),
			}),
			execute: async ({ owner, repo, title, body, head, base }) => {
				try {
					const targetBase =
						base ||
						(await octokit.repos.get({ owner, repo })).data
							.default_branch;
					const { data } = await octokit.pulls.create({
						owner,
						repo,
						title,
						body,
						head,
						base: targetBase,
					});
					return {
						_clientAction: "openPullRequest" as const,
						success: true,
						number: data.number,
						title: data.title,
						html_url: toAppUrl(data.html_url),
						owner,
						repo,
						pullNumber: data.number,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to create pull request",
					};
				}
			},
		}),
	};
}

// ─── Merge Conflict Tools ───────────────────────────────────────────────────

function getMergeConflictTools(octokit: Octokit, commitAuthor?: CommitAuthor) {
	return {
		getMergeConflictInfo: tool({
			description:
				"Get merge conflict details for a PR. Shows which files differ between the two branches and their content from both sides.",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				baseBranch: z.string().describe("Target/base branch (e.g. 'main')"),
				headBranch: z
					.string()
					.describe("Source/head branch (e.g. 'feat/my-feature')"),
			}),
			execute: async ({ owner, repo, baseBranch, headBranch }) => {
				try {
					// 1. Compare branches to find differing files
					const { data: comparison } =
						await octokit.repos.compareCommits({
							owner,
							repo,
							base: baseBranch,
							head: headBranch,
						});

					const files =
						(
							comparison as {
								files?: {
									filename: string;
									status: string;
								}[];
							}
						).files || [];
					if (files.length === 0) {
						return {
							message: "No file differences found between branches.",
						};
					}

					// 2. For modified files, read both versions
					const conflictFiles = await Promise.all(
						files.slice(0, 20).map(async (f: any) => {
							const result: any = {
								path: f.filename,
								status: f.status,
							};

							// Read base version
							try {
								const { data: baseData } =
									await octokit.repos.getContent(
										{
											owner,
											repo,
											path: f.filename,
											ref: baseBranch,
										},
									);
								if (
									!Array.isArray(baseData) &&
									baseData.type === "file"
								) {
									result.baseContent =
										Buffer.from(
											(
												baseData as {
													content: string;
												}
											).content,
											"base64",
										).toString("utf-8");
								}
							} catch {
								result.baseContent = null; // File doesn't exist on base
							}

							// Read head version
							try {
								const { data: headData } =
									await octokit.repos.getContent(
										{
											owner,
											repo,
											path: f.filename,
											ref: headBranch,
										},
									);
								if (
									!Array.isArray(headData) &&
									headData.type === "file"
								) {
									result.headContent =
										Buffer.from(
											(
												headData as {
													content: string;
												}
											).content,
											"base64",
										).toString("utf-8");
								}
							} catch {
								result.headContent = null; // File doesn't exist on head
							}

							return result;
						}),
					);

					return {
						baseBranch,
						headBranch,
						totalFiles: files.length,
						files: conflictFiles,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to get merge conflict info",
					};
				}
			},
		}),

		commitMergeResolution: tool({
			description:
				"Create a merge commit to resolve conflicts. Takes resolved file contents and creates a merge commit with two parents (head and base).",
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				headBranch: z.string().describe("Source/head branch to update"),
				baseBranch: z.string().describe("Target/base branch to merge in"),
				resolvedFiles: z
					.array(
						z.object({
							path: z
								.string()
								.describe(
									"File path relative to repo root",
								),
							content: z
								.string()
								.describe("Resolved file content"),
						}),
					)
					.describe("Array of resolved files with their content"),
				commitMessage: z
					.string()
					.optional()
					.describe("Merge commit message"),
			}),
			execute: async ({
				owner,
				repo,
				headBranch,
				baseBranch,
				resolvedFiles,
				commitMessage,
			}) => {
				try {
					// 1. Get HEAD SHAs of both branches
					const [headRef, baseRef] = await Promise.all([
						octokit.git.getRef({
							owner,
							repo,
							ref: `heads/${headBranch}`,
						}),
						octokit.git.getRef({
							owner,
							repo,
							ref: `heads/${baseBranch}`,
						}),
					]);
					const headSha = headRef.data.object.sha;
					const baseSha = baseRef.data.object.sha;

					// 2. Get head commit's tree as base
					const { data: headCommit } = await octokit.git.getCommit({
						owner,
						repo,
						commit_sha: headSha,
					});

					// 3. Create blobs for resolved files
					const treeEntries = await Promise.all(
						resolvedFiles.map(async (file) => {
							const { data: blob } =
								await octokit.git.createBlob({
									owner,
									repo,
									content: Buffer.from(
										file.content,
									).toString("base64"),
									encoding: "base64",
								});
							return {
								path: file.path,
								mode: "100644" as const,
								type: "blob" as const,
								sha: blob.sha,
							};
						}),
					);

					// 4. Create new tree based on head's tree
					const { data: newTree } = await octokit.git.createTree({
						owner,
						repo,
						base_tree: headCommit.tree.sha,
						tree: treeEntries,
					});

					// 5. Create merge commit with TWO PARENTS: [headSha, baseSha]
					const message =
						commitMessage ||
						`Merge branch '${baseBranch}' into ${headBranch}`;
					const { data: mergeCommit } =
						await octokit.git.createCommit({
							owner,
							repo,
							message,
							tree: newTree.sha,
							parents: [headSha, baseSha],
							author: commitAuthor
								? {
										...commitAuthor,
										date: new Date().toISOString(),
									}
								: {
										name: "User",
										email: "user@users.noreply.github.com",
										date: new Date().toISOString(),
									},
						});

					// 6. Update head branch ref to point to merge commit
					await octokit.git.updateRef({
						owner,
						repo,
						ref: `heads/${headBranch}`,
						sha: mergeCommit.sha,
					});

					return {
						_clientAction: "refreshPage" as const,
						success: true,
						mergeCommitSha: mergeCommit.sha.slice(0, 7),
						resolvedFileCount: resolvedFiles.length,
						message,
					};
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to create merge commit",
					};
				}
			},
		}),
	};
}

// ─── Sandbox Tools ──────────────────────────────────────────────────────────

function getSandboxTools(octokit: Octokit, githubToken: string, commitAuthor?: CommitAuthor) {
	let sandbox: Sandbox | null = null;
	let repoPath: string | null = null;
	let repoOwner: string | null = null;
	let repoName: string | null = null;
	let defaultBranch: string | null = null;

	return {
		startSandbox: tool({
			description: `Start a cloud sandbox VM and clone a GitHub repo into it. Returns quickly with project info (package manager, scripts, file listing). Does NOT install dependencies — use sandboxRun for that after this returns.

Use this ONLY when you need to execute commands:
- Running tests (npm test, pytest, etc.)
- Running builds (npm run build, cargo build, etc.)
- Running linters/formatters
- Any task that requires shell execution

Do NOT use this for file reads/writes or commits — use the GitHub API tools (stageFile + commitChanges) instead.

The sandbox has git, node, npm, python, and common dev tools.

**After this returns**, follow these steps:
1. If the project uses pnpm/yarn/bun: run \`sandboxRun\` with the installHint command
2. Then run whatever commands you need (tests, builds, etc.)
3. To commit changes made in the sandbox: read modified files with sandboxReadFile, then use stageFile + commitChanges`,
			inputSchema: z.object({
				owner: z.string().describe("Repository owner"),
				repo: z.string().describe("Repository name"),
				branch: z
					.string()
					.optional()
					.describe("Branch to clone (defaults to default branch)"),
			}),
			execute: async ({ owner, repo, branch }) => {
				// Validate owner/repo are real GitHub names (alphanumeric, hyphens, dots, underscores)
				const validName = /^[a-zA-Z0-9._-]+$/;
				if (!validName.test(owner) || !validName.test(repo)) {
					return {
						error: `Invalid owner/repo: "${owner}/${repo}". Provide valid GitHub owner and repository names.`,
					};
				}

				// Make idempotent — kill existing sandbox if any
				if (sandbox) {
					await sandbox.kill().catch(() => {});
					sandbox = null;
					repoPath = null;
					repoOwner = null;
					repoName = null;
					defaultBranch = null;
				}

				try {
					sandbox = await Sandbox.create({
						timeoutMs: 10 * 60 * 1000, // 10 minutes
					});
				} catch (e: unknown) {
					sandbox = null;
					return {
						error: `Sandbox creation failed: ${e instanceof Error ? e.message : "unknown"}`,
					};
				}

				try {
					// Git config
					await sandbox.commands.run(
						`git config --global user.name "${commitAuthor?.name ?? "Ghost"}" && git config --global user.email "${commitAuthor?.email ?? "ghost@better-github.app"}"`,
					);

					repoPath = `/home/user/${repo}`;
					repoOwner = owner;
					repoName = repo;

					// Clone with token auth
					await sandbox.commands.run(
						`git clone ${branch ? `-b ${branch}` : ""} https://x-access-token:${githubToken}@github.com/${owner}/${repo}.git ${repoPath}`,
						{ timeoutMs: 120_000 },
					);
				} catch (e: unknown) {
					if (sandbox) await sandbox.kill().catch(() => {});
					sandbox = null;
					return {
						error: `Clone error: ${e instanceof Error ? e.message : "unknown"}`,
					};
				}

				try {
					const [branchResult, lsResult] = await Promise.all([
						sandbox.commands.run(
							"git rev-parse --abbrev-ref HEAD",
							{ cwd: repoPath },
						),
						sandbox.commands.run("ls -1", { cwd: repoPath }),
					]);
					defaultBranch = branchResult.stdout.trim();
					const topLevelFiles = lsResult.stdout
						.trim()
						.split("\n")
						.filter(Boolean);

					const hasPnpm = topLevelFiles.includes("pnpm-lock.yaml");
					const hasYarn = topLevelFiles.includes("yarn.lock");
					const hasBun =
						topLevelFiles.includes("bun.lock") ||
						topLevelFiles.includes("bun.lockb");
					const hasPkgJson = topLevelFiles.includes("package.json");

					let packageManager = "npm";
					let installHint = "npm install";
					if (hasPnpm) {
						packageManager = "pnpm";
						installHint = "npm install -g pnpm && pnpm install";
					} else if (hasYarn) {
						packageManager = "yarn";
						installHint = "yarn install";
					} else if (hasBun) {
						packageManager = "bun";
						installHint =
							'curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install';
					}

					let scripts: Record<string, string> = {};
					let isMonorepo = false;

					if (hasPkgJson) {
						try {
							const content = await sandbox.files.read(
								`${repoPath}/package.json`,
							);
							if (content) {
								const pkg = JSON.parse(content);
								scripts = pkg.scripts || {};
								if (pkg.workspaces)
									isMonorepo = true;
							}
						} catch {
							// invalid package.json
						}
					}

					if (
						!isMonorepo &&
						topLevelFiles.includes("pnpm-workspace.yaml")
					) {
						isMonorepo = true;
					}

					return {
						success: true,
						sandboxId: sandbox.sandboxId,
						repoPath,
						branch: defaultBranch,
						packageManager,
						installHint,
						availableScripts: scripts,
						isMonorepo,
						topLevelFiles,
						nextStep: `Run sandboxRun with command: ${installHint}`,
					};
				} catch {
					return {
						success: true,
						sandboxId: sandbox.sandboxId,
						repoPath,
						branch: defaultBranch || "main",
						packageManager: "npm",
						installHint: "npm install",
						availableScripts: {},
						isMonorepo: false,
						topLevelFiles: [],
						nextStep: "Detection had issues. Use sandboxRun to explore the repo manually.",
					};
				}
			},
		}),

		sandboxRun: tool({
			description:
				"Run a shell command in the sandbox. The working directory defaults to the cloned repo root. Use for: installing deps (npm install), running tests (npm test), building (npm run build), linting, formatting, or any CLI tool. Use a longer timeout for install/build commands.",
			inputSchema: z.object({
				command: z.string().describe("Shell command to run"),
				cwd: z
					.string()
					.optional()
					.describe("Working directory (defaults to repo root)"),
				timeout: z
					.number()
					.optional()
					.describe(
						"Timeout in seconds (default 120, use 300 for installs/builds)",
					),
			}),
			execute: async ({ command, cwd, timeout }) => {
				if (!sandbox)
					return {
						error: "No sandbox running. Use startSandbox first.",
					};
				try {
					const result = await sandbox.commands.run(command, {
						cwd: cwd || repoPath || undefined,
						timeoutMs: (timeout ?? 120) * 1000,
					});
					// Truncate large output — keep the tail where errors usually appear
					const maxLen = 8000;
					const output =
						result.stdout +
						(result.stderr ? `\n${result.stderr}` : "");
					const stdout =
						output.length > maxLen
							? `...(truncated ${output.length - maxLen} chars)...\n` +
								output.slice(-maxLen)
							: output;

					if (result.exitCode !== 0) {
						return {
							error:
								stdout.trim() ||
								`exit code ${result.exitCode}`,
							exitCode: result.exitCode,
							stdout,
						};
					}
					return { success: true, stdout, exitCode: 0 };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Command failed",
					};
				}
			},
		}),

		sandboxReadFile: tool({
			description:
				"Read a file from the sandbox filesystem. Path is relative to the repo root unless it starts with /.",
			inputSchema: z.object({
				path: z
					.string()
					.describe(
						"File path (relative to repo root, or absolute if starts with /)",
					),
			}),
			execute: async ({ path }) => {
				if (!sandbox)
					return {
						error: "No sandbox running. Use startSandbox first.",
					};
				try {
					const absPath = path.startsWith("/")
						? path
						: `${repoPath}/${path}`;
					const content = await sandbox.files.read(absPath);
					if (!content)
						return { error: `File not found: ${absPath}` };
					if (content.length > 30000) {
						return {
							path: absPath,
							content:
								content.slice(0, 30000) +
								"\n...(truncated)",
						};
					}
					return { path: absPath, content };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to read file",
					};
				}
			},
		}),

		sandboxWriteFile: tool({
			description:
				"Write or create a file in the sandbox. Path is relative to the repo root unless it starts with /.",
			inputSchema: z.object({
				path: z
					.string()
					.describe(
						"File path (relative to repo root, or absolute if starts with /)",
					),
				content: z.string().describe("File content to write"),
			}),
			execute: async ({ path, content }) => {
				if (!sandbox)
					return {
						error: "No sandbox running. Use startSandbox first.",
					};
				try {
					const absPath = path.startsWith("/")
						? path
						: `${repoPath}/${path}`;
					await sandbox.files.write(absPath, content);
					return { success: true, path: absPath };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to write file",
					};
				}
			},
		}),

		killSandbox: tool({
			description: "Shut down the running sandbox VM to free resources.",
			inputSchema: z.object({}),
			execute: async () => {
				if (!sandbox)
					return { success: true, message: "No sandbox running." };
				try {
					await sandbox.kill();
					sandbox = null;
					repoPath = null;
					return { success: true, message: "Sandbox terminated." };
				} catch (e: unknown) {
					return {
						error:
							(e instanceof Error ? e.message : null) ||
							"Failed to stop sandbox",
					};
				}
			},
		}),
	};
}

// ─── Route Handler ──────────────────────────────────────────────────────────

export async function POST(req: Request) {
	const {
		id: chatId,
		persistKey,
		chatType: persistChatType,
		messages,
		prContext,
		issueContext,
		inlineContexts,
		pageContext,
		activeFile,
	}: {
		id?: string;
		persistKey?: string;
		chatType?: string;
		messages: UIMessage[];
		prContext?: PRContext;
		issueContext?: IssueContext;
		inlineContexts?: InlineContext[];
		pageContext?: PageContext;
		activeFile?: string;
	} = await req.json();

	const octokit = await getOctokitFromSession();
	if (!octokit) {
		return new Response("Unauthorized", { status: 401 });
	}

	const githubToken = await getGitHubToken();

	// Extract userId and commit author info
	const session = await auth.api.getSession({ headers: await headers() });
	const userId = session?.user?.id;
	let commitAuthor: CommitAuthor | undefined;
	if (session?.user) {
		const u = session.user;
		const name = u.name || "User";
		const email = u.email || "ghost@users.noreply.github.com";
		commitAuthor = { name, email };
	}

	// Determine mode and build tools + system prompt
	let systemPrompt: string;
	let tools: Record<string, unknown>;

	const generalTools = getGeneralTools(octokit, pageContext, userId ?? undefined);
	const codeEditTools = getCodeEditTools(octokit, commitAuthor);
	const sandboxTools = githubToken ? getSandboxTools(octokit, githubToken, commitAuthor) : {};
	const sandboxPrompt = githubToken ? SANDBOX_PROMPT : undefined;
	const searchTools = userId ? getSemanticSearchTool(userId) : {};
	const memoryTools = userId ? getMemoryTools(userId) : {};
	const recalledMemories = userId ? await recallMemoriesForContext(userId, messages) : "";

	// Auto-detect PR/issue context from pathname when not explicitly provided
	let resolvedPrContext = prContext;
	let resolvedIssueContext = issueContext;

	if (!resolvedPrContext && !resolvedIssueContext && pageContext?.pathname) {
		const prMatch = pageContext.pathname.match(
			/^\/repos\/([^/]+)\/([^/]+)\/pulls\/(\d+)/,
		);
		const issueMatch = pageContext.pathname.match(
			/^\/repos\/([^/]+)\/([^/]+)\/issues\/(\d+)/,
		);

		if (prMatch) {
			const [, owner, repo, numStr] = prMatch;
			const pullNumber = parseInt(numStr, 10);
			try {
				const [{ data: pr }, { data: files }] = await Promise.all([
					octokit.pulls.get({ owner, repo, pull_number: pullNumber }),
					octokit.pulls.listFiles({
						owner,
						repo,
						pull_number: pullNumber,
						per_page: 50,
					}),
				]);
				resolvedPrContext = {
					owner,
					repo,
					pullNumber,
					prTitle: pr.title,
					prBody: pr.body || "",
					baseBranch: pr.base.ref,
					headBranch: pr.head.ref,
					files: files.map((f) => ({
						filename: f.filename,
						patch: f.patch || "",
					})),
				};
			} catch {
				// Couldn't fetch PR — fall through to general mode
			}
		} else if (issueMatch) {
			const [, owner, repo, numStr] = issueMatch;
			const issueNumber = parseInt(numStr, 10);
			try {
				const [{ data: issue }, { data: comments }] = await Promise.all([
					octokit.issues.get({
						owner,
						repo,
						issue_number: issueNumber,
					}),
					octokit.issues.listComments({
						owner,
						repo,
						issue_number: issueNumber,
						per_page: 30,
					}),
				]);
				resolvedIssueContext = {
					owner,
					repo,
					issueNumber,
					title: issue.title,
					body: issue.body || null,
					state: issue.state,
					labels: (issue.labels || []).map((l) =>
						typeof l === "string" ? l : l.name || "",
					),
					comments: comments.map((c) => ({
						author: c.user?.login || "unknown",
						body: c.body || "",
						createdAt: c.created_at,
					})),
				};
			} catch {
				// Couldn't fetch issue — fall through to general mode
			}
		}
	}

	if (resolvedPrContext) {
		// PR mode
		const prTools = getPrTools(octokit, resolvedPrContext, commitAuthor);
		const mergeConflictTools = getMergeConflictTools(octokit, commitAuthor);
		// For merge conflicts, skip file diffs — Ghost uses getMergeConflictInfo tool instead
		if (resolvedPrContext.mergeConflict) {
			const liteContext = { ...resolvedPrContext, files: [] };
			systemPrompt =
				buildPrSystemPrompt(
					liteContext,
					inlineContexts,
					activeFile,
					sandboxPrompt,
				) + recalledMemories;
			systemPrompt += MERGE_CONFLICT_PROMPT.replace(
				/{headBranch}/g,
				resolvedPrContext.headBranch,
			).replace(/{baseBranch}/g, resolvedPrContext.baseBranch);
		} else {
			systemPrompt =
				buildPrSystemPrompt(
					resolvedPrContext,
					inlineContexts,
					activeFile,
					sandboxPrompt,
				) + recalledMemories;
		}
		tools = withSafeTools({
			...prTools,
			...codeEditTools,
			...mergeConflictTools,
			...generalTools,
			...sandboxTools,
			...searchTools,
			...memoryTools,
		});
	} else if (resolvedIssueContext) {
		// Issue mode
		let defaultBranch = "main";
		try {
			const { data: repoData } = await octokit.repos.get({
				owner: resolvedIssueContext.owner,
				repo: resolvedIssueContext.repo,
			});
			defaultBranch = repoData.default_branch;
		} catch {
			// fallback to main
		}

		const issueTools = getIssueTools(
			octokit,
			resolvedIssueContext,
			defaultBranch,
			commitAuthor,
		);
		systemPrompt =
			buildIssueSystemPrompt(
				resolvedIssueContext,
				defaultBranch,
				inlineContexts,
				sandboxPrompt,
			) + recalledMemories;
		tools = withSafeTools({
			...issueTools,
			...codeEditTools,
			...generalTools,
			...sandboxTools,
			...searchTools,
			...memoryTools,
		});
	} else {
		// General mode
		let currentUser: { login: string } | null = null;
		try {
			const { data } = await octokit.users.getAuthenticated();
			currentUser = { login: data.login };
		} catch {
			// continue without user context
		}

		systemPrompt =
			buildGeneralSystemPrompt(
				currentUser,
				pageContext,
				inlineContexts,
				sandboxPrompt,
			) + recalledMemories;

		// Add getFileContent tool when we can infer a repo from the current page
		const repoMatch = pageContext?.pathname?.match(/^\/repos\/([^/]+)\/([^/]+)/);
		if (repoMatch) {
			const [, owner, repo] = repoMatch;
			tools = withSafeTools({
				...generalTools,
				...codeEditTools,
				...sandboxTools,
				...searchTools,
				...memoryTools,
				getFileContent: tool({
					description:
						"Read the full contents of a file from the repository. Use this to get more context about code the user is asking about.",
					inputSchema: z.object({
						path: z
							.string()
							.describe(
								"File path relative to repo root",
							),
						ref: z
							.string()
							.optional()
							.describe(
								"Branch or commit SHA (defaults to the repo's default branch)",
							),
					}),
					execute: async ({ path, ref }) => {
						const { data } = await octokit.repos.getContent({
							owner,
							repo,
							path,
							...(ref ? { ref } : {}),
						});
						if (Array.isArray(data) || data.type !== "file") {
							return { error: "Not a file" };
						}
						const content = Buffer.from(
							(data as { content: string }).content,
							"base64",
						).toString("utf-8");
						return { path, content };
					},
				}),
			});
		} else {
			tools = withSafeTools({
				...generalTools,
				...codeEditTools,
				...sandboxTools,
				...searchTools,
				...memoryTools,
			});
		}
	}

	// Determine task type for model selection
	const taskType: GhostTaskType = resolvedPrContext?.mergeConflict
		? "mergeConflict"
		: "default";

	let userModelChoice = "auto";
	const serverApiKey = process.env.OPEN_ROUTER_API_KEY ?? "";
	let apiKey = serverApiKey;
	let usingOwnKey = false;

	if (userId) {
		const settings = await getUserSettings(userId);
		if (settings.ghostModel) userModelChoice = settings.ghostModel;
		if (settings.useOwnApiKey && settings.openrouterApiKey) {
			apiKey = settings.openrouterApiKey;
			usingOwnKey = true;
		}
	}

	const modelId = resolveModel(userModelChoice, taskType);

	if (!apiKey) {
		return new Response(
			JSON.stringify({ error: "No OpenRouter API key configured." }),
			{ status: 500, headers: { "Content-Type": "application/json" } },
		);
	}

	try {
		const checkRes = await fetch("https://openrouter.ai/api/v1/auth/key", {
			headers: { Authorization: `Bearer ${apiKey}` },
		});
		if (!checkRes.ok) {
			// If user's own key is invalid, fall back to the server key
			if (usingOwnKey && serverApiKey) {
				apiKey = serverApiKey;
				usingOwnKey = false;
			} else {
				return new Response(
					JSON.stringify({
						error: "OpenRouter API key is invalid or expired. Please update your API key in settings.",
					}),
					{
						status: 401,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
		}
	} catch {
		// Network error validating key — proceed anyway
	}

	// Resolve conversation for persistence (if configured)
	let conversationId: string | null = null;
	if (persistKey && persistChatType && userId) {
		try {
			const conv = await getOrCreateConversation(
				userId,
				persistChatType,
				persistKey,
			);
			conversationId = conv.id;
			// Clear any stale stream ID
			await updateActiveStreamId(conversationId, null);
		} catch {
			// Persistence failure should not block the stream
		}
	}

	try {
		const result = streamText({
			model: createOpenRouter({ apiKey })(modelId),
			system: systemPrompt,
			messages: await convertToModelMessages(messages),
			tools: tools as Parameters<typeof streamText>[0]["tools"],
			maxRetries: 4,
			stopWhen: stepCountIs(50),
			onError() {},
		});

		if (conversationId) {
			const convId = conversationId;
			return result.toUIMessageStreamResponse({
				sendReasoning: true,
				originalMessages: messages,
				generateMessageId: generateId,
				async consumeSseStream({ stream }) {
					const streamId = generateId();
					await streamContext.createNewResumableStream(
						streamId,
						() => stream,
					);
					await updateActiveStreamId(convId, streamId).catch(
						() => {},
					);
				},
				onFinish: async ({ messages: finishedMessages }) => {
					try {
						// Persist all messages server-side with full parts
						const toSave = finishedMessages.map((m) => ({
							id: m.id,
							role: m.role,
							content:
								m.parts
									?.filter(
										(
											p,
										): p is Extract<
											typeof p,
											{
												type: "text";
											}
										> =>
											p.type ===
											"text",
									)
									.map((p) => p.text)
									.join("") || "",
							partsJson: JSON.stringify(m.parts),
						}));
						await saveMessagesToDb(convId, toSave);
					} catch {
						// Best-effort persistence
					}
					await updateActiveStreamId(convId, null).catch(() => {});
				},
			});
		}

		return result.toUIMessageStreamResponse({
			sendReasoning: true,
		});
	} catch (e: unknown) {
		const message = e instanceof Error ? e.message : "AI request failed";
		return new Response(JSON.stringify({ error: message }), {
			status: 502,
			headers: { "Content-Type": "application/json" },
		});
	}
}
