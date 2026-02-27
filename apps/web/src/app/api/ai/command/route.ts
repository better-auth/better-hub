import type { UIMessage } from "ai";
import { convertToModelMessages, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { getOctokitFromSession } from "@/lib/ai-auth";
import { auth } from "@/lib/auth";
import { getInternalModel } from "@/lib/billing/ai-models";
import { headers } from "next/headers";
import { checkUsageLimit } from "@/lib/billing/usage-limit";
import { getBillingErrorCode } from "@/lib/billing/config";
import { logTokenUsage } from "@/lib/billing/token-usage";

export const maxDuration = 60;

export async function POST(req: Request) {
	const {
		messages,
		pageContext,
	}: {
		messages: UIMessage[];
		pageContext?: {
			page: string | null;
			pathname: string | null;
			entities: Array<{
				type: string;
				id: string;
				name: string;
				[key: string]: unknown;
			}>;
		} | null;
	} = await req.json();

	const session = await auth.api.getSession({ headers: await headers() });
	if (!session?.user) {
		return new Response("Unauthorized", { status: 401 });
	}
	const userId = session.user.id;

	const octokit = await getOctokitFromSession();
	if (!octokit) {
		return new Response("Unauthorized", { status: 401 });
	}

	const { model, modelId, isCustomApiKey } = await getInternalModel(userId);

	const limitResult = await checkUsageLimit(userId, isCustomApiKey);
	if (!limitResult.allowed) {
		const errorCode = getBillingErrorCode(limitResult);
		return new Response(JSON.stringify({ error: errorCode, ...limitResult }), {
			status: 429,
			headers: { "Content-Type": "application/json" },
		});
	}

	// Get authenticated user info
	let currentUser: { login: string } | null = null;
	try {
		const { data } = await octokit.users.getAuthenticated();
		currentUser = { login: data.login };
	} catch {
		// continue without user context
	}

	// Build page context for system prompt
	let pageContextPrompt = "";
	if (pageContext?.pathname || pageContext?.entities?.length) {
		const parts: string[] = ["\n## CURRENT PAGE CONTEXT"];
		if (pageContext.pathname) {
			parts.push(`**Current URL:** ${pageContext.pathname}`);
		}
		if (pageContext.page) {
			parts.push(`**Page:** ${pageContext.page}`);
		}
		if (pageContext.entities?.length) {
			parts.push("\n**Entities on screen:**");
			for (const entity of pageContext.entities) {
				const { type, id, name, ...rest } = entity;
				const details = Object.entries(rest)
					.filter(
						([, v]) =>
							v !== null && v !== undefined && v !== "",
					)
					.map(([k, v]) => `${k}: ${v}`)
					.join(", ");
				parts.push(
					`- **${type}**: ${name} (${id}${details ? `, ${details}` : ""})`,
				);
			}

			const repoEntity = pageContext.entities.find((e) => e.type === "repo");
			if (repoEntity) {
				parts.push(
					`\nThe user is viewing repo "${repoEntity.name}". When they say "star this repo", "fork this", "create an issue", etc., use this repo. Do NOT ask which repo.`,
				);
			}
		}
		pageContextPrompt = parts.join("\n");
	}

	const result = streamText({
		model,
		system: `You are an AI assistant built into a GitHub client app's command palette (Cmd+K). You help users perform GitHub actions and navigate the app through natural language.

${currentUser ? `Authenticated GitHub user: ${currentUser.login}` : ""}

## CRITICAL UI RULES
- Tool results are automatically rendered as rich UI components. Do NOT repeat tool output as text/markdown.
- After calling a tool, only add a brief 1-sentence commentary. The UI handles display.
- Keep all text responses extremely short. 1-2 sentences max.
- When asked to do something on a repo, check page context first — the user is likely referring to the repo they're viewing.

## Action Rules
- For destructive actions (delete repo, close issue), ask for confirmation first.
- For star/unstar/fork, proceed directly — these are low-risk.
- When creating issues or PRs, ask for details if not provided (title, body).
- Use the navigateTo tool when the user wants to go to a page within the app.
- Use openUrl tool to open external GitHub pages.

## Available Navigation Pages
- dashboard, repos, prs, issues, notifications, settings

## Today's date
${new Date().toISOString().split("T")[0]}
${pageContextPrompt}`,
		messages: await convertToModelMessages(messages),
		tools: {
			// ─── Search & Discovery ──────────────────────────────────────────
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
					const q = language
						? `${query} language:${language}`
						: query;
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
					query: z
						.string()
						.describe("Search query for username or name"),
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
							html_url: u.html_url,
						})),
					};
				},
			}),

			// ─── Repo Information ────────────────────────────────────────────
			getRepoInfo: tool({
				description:
					"Get detailed information about a specific repository.",
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
						license: data.license?.spdx_id || null,
						topics: data.topics,
						private: data.private,
						fork: data.fork,
						archived: data.archived,
						watchers_count: data.watchers_count,
						owner_avatar: data.owner?.avatar_url,
					};
				},
			}),

			// ─── Repo Actions ────────────────────────────────────────────────
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
				description:
					"Fork a repository to the authenticated user's account.",
				inputSchema: z.object({
					owner: z.string().describe("Repository owner"),
					repo: z.string().describe("Repository name"),
				}),
				execute: async ({ owner, repo }) => {
					const { data } = await octokit.repos.createFork({
						owner,
						repo,
					});
					return {
						success: true,
						action: "forked",
						full_name: data.full_name,
						html_url: data.html_url,
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
					await octokit.activity.deleteRepoSubscription({
						owner,
						repo,
					});
					return {
						success: true,
						action: "unwatched",
						repo: `${owner}/${repo}`,
					};
				},
			}),

			// ─── Issue Actions ───────────────────────────────────────────────
			createIssue: tool({
				description:
					"Create a new issue on a repository. Ask for title and body if not provided.",
				inputSchema: z.object({
					owner: z.string().describe("Repository owner"),
					repo: z.string().describe("Repository name"),
					title: z.string().describe("Issue title"),
					body: z
						.string()
						.optional()
						.describe("Issue body/description"),
					labels: z
						.array(z.string())
						.optional()
						.describe("Labels to add"),
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
						html_url: data.html_url,
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
									typeof l === "string"
										? l
										: l.name,
								),
								created_at: i.created_at,
								comments: i.comments,
							})),
					};
				},
			}),

			// ─── PR Actions ──────────────────────────────────────────────────
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
				description:
					"Merge a pull request. Ask for confirmation before merging.",
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
						success: data.merged,
						message: data.message,
						sha: data.sha,
					};
				},
			}),

			// ─── User Actions ────────────────────────────────────────────────
			getUserProfile: tool({
				description: "Get a GitHub user's profile information.",
				inputSchema: z.object({
					username: z.string().describe("GitHub username"),
				}),
				execute: async ({ username }) => {
					const { data } = await octokit.users.getByUsername({
						username,
					});
					return {
						login: data.login,
						name: data.name,
						bio: data.bio,
						avatar_url: data.avatar_url,
						html_url: data.html_url,
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
					username: z
						.string()
						.describe("GitHub username to unfollow"),
				}),
				execute: async ({ username }) => {
					await octokit.users.unfollow({ username });
					return { success: true, action: "unfollowed", username };
				},
			}),

			// ─── Notifications ───────────────────────────────────────────────
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

			// ─── Gists ───────────────────────────────────────────────────────
			createGist: tool({
				description:
					"Create a GitHub Gist. Useful for quickly sharing code snippets.",
				inputSchema: z.object({
					description: z
						.string()
						.optional()
						.describe("Gist description"),
					filename: z.string().describe("Filename for the gist"),
					content: z.string().describe("File content"),
					public: z
						.boolean()
						.optional()
						.describe(
							"Whether the gist is public (default: false)",
						),
				}),
				execute: async ({
					description,
					filename,
					content,
					public: isPublic,
				}) => {
					const { data } = await octokit.gists.create({
						description: description || "",
						public: isPublic || false,
						files: { [filename]: { content } },
					});
					return {
						success: true,
						html_url: data.html_url,
						id: data.id,
					};
				},
			}),

			// ─── Client-Side Navigation ──────────────────────────────────────
			navigateTo: tool({
				description:
					"Navigate the user to a page within the app. Use when they say 'go to repos', 'show me PRs', etc.",
				inputSchema: z.object({
					page: z
						.enum([
							"dashboard",
							"repos",
							"prs",
							"issues",
							"notifications",
							"settings",
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

			openUrl: tool({
				description: "Open an external URL in a new browser tab.",
				inputSchema: z.object({
					url: z.string().describe("URL to open"),
					description: z.string().describe("What this link is"),
				}),
				execute: async (input) => ({
					_clientAction: "openUrl" as const,
					...input,
				}),
			}),
		},
		stopWhen: stepCountIs(3),
	});

	// Fire-and-forget token usage logging
	Promise.resolve(result.usage)
		.then((usage) =>
			logTokenUsage({
				userId,
				provider: "openrouter",
				modelId,
				taskType: "command",
				usage,
				isCustomApiKey,
			}),
		)
		.catch((e) => console.error("[billing] logTokenUsage failed:", e));

	return result.toUIMessageStreamResponse();
}
