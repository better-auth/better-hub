"use server";

import { getAuthenticatedUser, getOctokit, invalidateRepoIssuesCache } from "@/lib/github";
import { getErrorMessage } from "@/lib/utils";
import { revalidatePath } from "next/cache";
import { invalidateRepoCache } from "@/lib/repo-data-cache-vc";

export async function fetchIssuesByAuthor(owner: string, repo: string, author: string) {
	const octokit = await getOctokit();
	if (!octokit) return { open: [], closed: [] };

	const [openRes, closedRes] = await Promise.all([
		octokit.search.issuesAndPullRequests({
			q: `is:issue is:open repo:${owner}/${repo} author:${author}`,
			per_page: 100,
			sort: "updated",
			order: "desc",
		}),
		octokit.search.issuesAndPullRequests({
			q: `is:issue is:closed repo:${owner}/${repo} author:${author}`,
			per_page: 100,
			sort: "updated",
			order: "desc",
		}),
	]);

	return {
		open: openRes.data.items,
		closed: closedRes.data.items,
	};
}

export interface IssueTemplate {
	name: string;
	about: string;
	title: string;
	labels: string[];
	body: string;
}

export async function getIssueTemplates(owner: string, repo: string): Promise<IssueTemplate[]> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		const { data: contents } = await octokit.repos.getContent({
			owner,
			repo,
			path: ".github/ISSUE_TEMPLATE",
		});

		if (!Array.isArray(contents)) return [];

		const mdFiles = contents.filter(
			(f) =>
				f.type === "file" &&
				(f.name.endsWith(".md") ||
					f.name.endsWith(".yml") ||
					f.name.endsWith(".yaml")),
		);

		const templatePromises = mdFiles.map(async (file) => {
			try {
				const { data } = await octokit.repos.getContent({
					owner,
					repo,
					path: file.path,
				});

				if ("content" in data && typeof data.content === "string") {
					const decoded = Buffer.from(
						data.content,
						"base64",
					).toString("utf-8");
					return parseTemplateFrontmatter(decoded, file.name);
				}
			} catch {
				// skip unreadable files
			}
			return null;
		});

		const templatesResults = await Promise.all(templatePromises);
		return templatesResults.filter((t): t is IssueTemplate => t !== null);
	} catch {
		return [];
	}
}

function parseTemplateFrontmatter(content: string, filename: string): IssueTemplate | null {
	// Handle YAML-based templates (.yml/.yaml)
	if (filename.endsWith(".yml") || filename.endsWith(".yaml")) {
		return parseYamlTemplate(content, filename);
	}

	// Markdown templates with YAML front matter
	const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)/);
	if (!fmMatch) {
		return {
			name: filename.replace(/\.md$/, "").replace(/[-_]/g, " "),
			about: "",
			title: "",
			labels: [],
			body: content,
		};
	}

	const frontmatter = fmMatch[1];
	const body = fmMatch[2].trim();

	const name =
		extractYamlValue(frontmatter, "name") ||
		filename.replace(/\.md$/, "").replace(/[-_]/g, " ");
	const about = extractYamlValue(frontmatter, "about") || "";
	const title = extractYamlValue(frontmatter, "title") || "";
	const labelsRaw = extractYamlValue(frontmatter, "labels") || "";
	const labels = labelsRaw
		? labelsRaw
				.replace(/^\[|\]$/g, "")
				.split(",")
				.map((l) => l.trim().replace(/^['"]|['"]$/g, ""))
				.filter(Boolean)
		: [];

	return { name, about, title, labels, body };
}

function parseYamlTemplate(content: string, filename: string): IssueTemplate | null {
	const name =
		extractYamlValue(content, "name") ||
		filename.replace(/\.(yml|yaml)$/, "").replace(/[-_]/g, " ");
	const description = extractYamlValue(content, "description") || "";
	const title = extractYamlValue(content, "title") || "";
	const labelsRaw = extractYamlValue(content, "labels") || "";
	const labels = labelsRaw
		? labelsRaw
				.replace(/^\[|\]$/g, "")
				.split(",")
				.map((l) => l.trim().replace(/^['"]|['"]$/g, ""))
				.filter(Boolean)
		: [];

	// Build body from form fields
	const bodyParts: string[] = [];
	const bodyMatch = content.match(/body:\s*\n([\s\S]*)/);
	if (bodyMatch) {
		const fieldMatches = bodyMatch[1].matchAll(
			/- type:\s*(\w+)[\s\S]*?(?:label:\s*["']?(.+?)["']?\s*\n)[\s\S]*?(?:description:\s*["']?(.+?)["']?\s*\n)?/g,
		);
		for (const m of fieldMatches) {
			const type = m[1];
			const label = m[2]?.trim() || "";
			if (type === "markdown") continue;
			if (label) {
				bodyParts.push(`### ${label}\n\n`);
			}
		}
	}

	return {
		name,
		about: description,
		title,
		labels,
		body: bodyParts.join("\n") || "",
	};
}

function extractYamlValue(yaml: string, key: string): string | null {
	const re = new RegExp(`^${key}:\\s*(.+)$`, "m");
	const match = yaml.match(re);
	if (!match) return null;
	return match[1].trim().replace(/^['"]|['"]$/g, "");
}

export async function createIssue(
	owner: string,
	repo: string,
	title: string,
	body: string,
	labels: string[],
	assignees: string[],
): Promise<{ success: boolean; number?: number; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		const { data } = await octokit.issues.create({
			owner,
			repo,
			title,
			body: body || undefined,
			labels: labels.length > 0 ? labels : undefined,
			assignees: assignees.length > 0 ? assignees : undefined,
		});

		await invalidateRepoIssuesCache(owner, repo);
		invalidateRepoCache(owner, repo);
		revalidatePath(`/repos/${owner}/${repo}/issues`);
		revalidatePath(`/repos/${owner}/${repo}`, "layout");
		return { success: true, number: data.number };
	} catch (err: unknown) {
		return {
			success: false,
			error: getErrorMessage(err),
		};
	}
}

export async function getRepoLabels(
	owner: string,
	repo: string,
): Promise<Array<{ name: string; color: string; description: string | null }>> {
	const octokit = await getOctokit();
	if (!octokit) return [];

	try {
		const { data } = await octokit.issues.listLabelsForRepo({
			owner,
			repo,
			per_page: 100,
		});
		return data.map((l) => ({
			name: l.name,
			color: l.color ?? "888888",
			description: l.description ?? null,
		}));
	} catch {
		return [];
	}
}

interface UploadImageResult {
	success: boolean;
	url?: string;
	error?: string;
}

export type IssueImageUploadMode = "repo" | "fork" | "needs_fork" | "name_taken";

export interface IssueImageUploadContext {
	success: boolean;
	mode?: IssueImageUploadMode;
	viewerLogin?: string;
	uploadOwner?: string;
	uploadRepo?: string;
	error?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isForkOfRepo(
	forkData: {
		fork?: boolean;
		name?: string | null;
		parent?: { full_name?: string | null } | null;
		source?: { full_name?: string | null } | null;
	},
	fullName: string,
) {
	if (!forkData.fork) return false;
	return forkData.parent?.full_name === fullName || forkData.source?.full_name === fullName;
}

async function findUserForkUploadTarget(
	octokit: Awaited<ReturnType<typeof getOctokit>>,
	viewerLogin: string,
	upstreamOwner: string,
	upstreamRepo: string,
): Promise<{ uploadRepo?: string }> {
	if (!octokit) return {};

	const normalizedViewer = viewerLogin.toLowerCase();

	// Main fork detection path: find any upstream fork owned by the viewer.
	try {
		const forks = await octokit.paginate(octokit.repos.listForks, {
			owner: upstreamOwner,
			repo: upstreamRepo,
			per_page: 100,
		});

		const userFork = forks.find(
			(forkRepo) => forkRepo.owner?.login?.toLowerCase() === normalizedViewer,
		);

		if (userFork?.name) {
			return { uploadRepo: userFork.name };
		}
	} catch {
		// Continue with local fallback.
	}

	const upstreamFullName = `${upstreamOwner}/${upstreamRepo}`;

	// Fallback: inspect viewer-owned repos and match by parent/source linkage.
	try {
		const ownedRepos = await octokit.paginate(octokit.repos.listForAuthenticatedUser, {
			affiliation: "owner",
			visibility: "all",
			per_page: 100,
		});

		for (const repoData of ownedRepos) {
			if (!repoData?.fork) continue;
			if (isForkOfRepo(repoData, upstreamFullName)) {
				return { uploadRepo: repoData.name ?? upstreamRepo };
			}
		}
	} catch {
		// Ignore and fall back to current state.
	}

	return {};
}

async function findSameNameUploadTarget(
	octokit: Awaited<ReturnType<typeof getOctokit>>,
	viewerLogin: string,
	repo: string,
): Promise<{ uploadRepo?: string }> {
	if (!octokit) return {};

	try {
		const { data: sameNameRepo } = await octokit.repos.get({
			owner: viewerLogin,
			repo,
		});

		if (sameNameRepo?.name) {
			return { uploadRepo: sameNameRepo.name };
		}
	} catch {
		// Continue with fallback discovery.
	}

	return {};
}

export async function getIssueImageUploadContext(
	owner: string,
	repo: string,
): Promise<IssueImageUploadContext> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		const viewerPromise = getAuthenticatedUser();
		const repoDataPromise = octokit.repos.get({ owner, repo });
		const sameNameTargetPromise: Promise<{ uploadRepo?: string }> = viewerPromise.then(
			(viewer) =>
				viewer?.login
					? findSameNameUploadTarget(octokit, viewer.login, repo)
					: {},
		);

		const [viewer, { data: repoData }, sameNameTarget] = await Promise.all([
			viewerPromise,
			repoDataPromise,
			sameNameTargetPromise,
		]);

		if (!viewer?.login) return { success: false, error: "Not authenticated" };

		const isOwner = repoData.owner?.login === viewer.login;
		const canWrite =
			repoData.permissions?.push ||
			repoData.permissions?.maintain ||
			repoData.permissions?.admin;

		// Prefer direct upstream uploads for owners and users with write-level permissions.
		if (isOwner || canWrite) {
			return {
				success: true,
				mode: "repo",
				viewerLogin: viewer.login,
				uploadOwner: owner,
				uploadRepo: repo,
			};
		}

		if (sameNameTarget.uploadRepo) {
			return {
				success: true,
				mode: "fork",
				viewerLogin: viewer.login,
				uploadOwner: viewer.login,
				uploadRepo: sameNameTarget.uploadRepo,
			};
		}

		// Skip the expensive paginated fork search here — it paginates through all
		// upstream forks (potentially thousands) and all user repos. That discovery
		// only matters when the user actually tries to upload, so defer it to
		// ensureForkForIssueImageUpload which runs on-demand.
		return {
			success: true,
			mode: "needs_fork",
			viewerLogin: viewer.login,
		};
	} catch (err: unknown) {
		return { success: false, error: getErrorMessage(err) };
	}
}

export async function ensureForkForIssueImageUpload(
	owner: string,
	repo: string,
): Promise<IssueImageUploadContext> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	const viewer = await getAuthenticatedUser();
	if (!viewer?.login) return { success: false, error: "Not authenticated" };

	try {
		// Defensive short-circuit: if viewer can already write upstream, no fork is needed.
		const { data: repoData } = await octokit.repos.get({ owner, repo });
		const isOwner = repoData.owner?.login === viewer.login;
		const canWrite =
			repoData.permissions?.push ||
			repoData.permissions?.maintain ||
			repoData.permissions?.admin;
		if (isOwner || canWrite) {
			return {
				success: true,
				mode: "repo",
				viewerLogin: viewer.login,
				uploadOwner: owner,
				uploadRepo: repo,
			};
		}

		const sameNameTarget = await findSameNameUploadTarget(octokit, viewer.login, repo);
		if (sameNameTarget.uploadRepo) {
			return {
				success: true,
				mode: "fork",
				viewerLogin: viewer.login,
				uploadOwner: viewer.login,
				uploadRepo: sameNameTarget.uploadRepo,
			};
		}

		// Reuse an already available upload target (same-name repo or discovered fork)
		// before attempting a new fork API call.
		const existingFork = await findUserForkUploadTarget(
			octokit,
			viewer.login,
			owner,
			repo,
		);
		if (existingFork.uploadRepo) {
			return {
				success: true,
				mode: "fork",
				viewerLogin: viewer.login,
				uploadOwner: viewer.login,
				uploadRepo: existingFork.uploadRepo,
			};
		}

		await octokit.repos.createFork({ owner, repo });
		// GitHub fork creation is async; poll until the fork is queryable and linked.
		for (let attempt = 0; attempt < 12; attempt++) {
			// Re-resolve target each attempt so renamed/newly created forks are picked up.
			const resolvedFork = await findUserForkUploadTarget(
				octokit,
				viewer.login,
				owner,
				repo,
			);
			if (resolvedFork.uploadRepo) {
				return {
					success: true,
					mode: "fork",
					viewerLogin: viewer.login,
					uploadOwner: viewer.login,
					uploadRepo: resolvedFork.uploadRepo,
				};
			}

			await sleep(1000);
		}

		return {
			success: false,
			error: "Fork created, but it is still provisioning. Try again in a few seconds.",
		};
	} catch (err: any) {
		const resolvedFork = await findUserForkUploadTarget(
			octokit,
			viewer.login,
			owner,
			repo,
		);
		if (resolvedFork.uploadRepo) {
			return {
				success: true,
				mode: "fork",
				viewerLogin: viewer.login,
				uploadOwner: viewer.login,
				uploadRepo: resolvedFork.uploadRepo,
			};
		}

		const message = getErrorMessage(err);
		if (message.includes("already exists") || err.status === 422) {
			return {
				success: false,
				error: `A repository named "${viewer.login}/${repo}" already exists but is not a fork of this repository. Please rename or delete it to proceed.`,
			};
		}
		return { success: false, error: message };
	}
}

// Fire fork creation and return immediately — GitHub provisions the fork async.
// The client should call uploadImage right after; it will retry on 404 until the fork is ready.
export async function triggerForkCreation(
	owner: string,
	repo: string,
): Promise<{ success: boolean; viewerLogin?: string; uploadRepo?: string; error?: string }> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	const viewer = await getAuthenticatedUser();
	if (!viewer?.login) return { success: false, error: "Not authenticated" };

	try {
		// Fast path: a same-name repo already exists.
		const sameNameTarget = await findSameNameUploadTarget(octokit, viewer.login, repo);
		if (sameNameTarget.uploadRepo) {
			return {
				success: true,
				viewerLogin: viewer.login,
				uploadRepo: sameNameTarget.uploadRepo,
			};
		}

		// Kick off fork creation — do not poll or wait for it to finish.
		await octokit.repos.createFork({ owner, repo });
		// GitHub always names the fork after the upstream repo.
		return { success: true, viewerLogin: viewer.login, uploadRepo: repo };
	} catch (err: any) {
		if (err.status === 422) {
			// A same-name repo already exists (race or missed by fast path) — use it.
			return { success: true, viewerLogin: viewer.login, uploadRepo: repo };
		}
		return { success: false, error: getErrorMessage(err) };
	}
}

/**
 * Upload an image to a temporary location in the repository for use in issue/PR bodies.
 * GitHub hosts issue/PR paste images on their own asset storage (user-attachments);
 * we don't have that API, so we commit to the repo in .github-images/.
 * - For issues: upload to default branch (no branch context).
 * - For PRs: pass `branch` (head branch) so the image is part of the PR and merges with it.
 *
 * Retries on 404 up to 15 times (1 s apart) so uploads kicked off immediately after
 * triggerForkCreation succeed once the fork finishes provisioning.
 */
export async function uploadImage(
	owner: string,
	repo: string,
	file: File,
	type: "issue" | "pull" = "issue",
	branch?: string,
): Promise<UploadImageResult> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	try {
		const bytes = await file.arrayBuffer();
		const base64Content = Buffer.from(bytes).toString("base64");

		const timestamp = Date.now();
		const randomId = Math.random().toString(36).substring(2, 10);
		const ext = file.name.split(".").pop()?.toLowerCase() || "png";
		const filename = `${type}-upload-${timestamp}-${randomId}.${ext}`;
		const path = `.github-images/${filename}`;

		// 404 means the fork is still provisioning — retry until ready or timeout.
		for (let attempt = 0; attempt <= 15; attempt++) {
			try {
				const targetBranch =
					branch ??
					(await octokit.repos.get({ owner, repo })).data
						.default_branch;

				await octokit.repos.createOrUpdateFileContents({
					owner,
					repo,
					path,
					message: `Upload image for ${type}: ${filename}`,
					content: base64Content,
					branch: targetBranch,
				});

				return {
					success: true,
					url: `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${path}`,
				};
			} catch (err: any) {
				if (err.status === 422) {
					// File already exists — construct the URL without a branch re-fetch.
					const fallbackBranch = branch ?? "main";
					return {
						success: true,
						url: `https://raw.githubusercontent.com/${owner}/${repo}/${fallbackBranch}/${path}`,
					};
				}
				if (err.status === 404 && attempt < 15) {
					// Fork not ready yet — wait and retry.
					await sleep(1000);
					continue;
				}
				throw err;
			}
		}

		return {
			success: false,
			error: "Repository not available after waiting. Please try again.",
		};
	} catch (err: unknown) {
		const message = getErrorMessage(err);
		if (typeof err === "object" && err !== null && "status" in err) {
			if ((err as any).status === 403) {
				return {
					success: false,
					error: "You don't have permission to upload images to this repository. Please drag and drop images directly into the GitHub text editor instead.",
				};
			}
		}
		return { success: false, error: `Upload failed: ${message}` };
	}
}
