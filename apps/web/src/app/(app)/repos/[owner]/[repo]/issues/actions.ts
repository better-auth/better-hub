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

		const templates: IssueTemplate[] = [];

		for (const file of mdFiles) {
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
					const template = parseTemplateFrontmatter(
						decoded,
						file.name,
					);
					if (template) templates.push(template);
				}
			} catch {
				// skip unreadable files
			}
		}

		return templates;
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

	// Prefer an existing same-name repo in the viewer account as the upload target.
	// This keeps image upload working even when fork naming diverges or the name is already taken.
	try {
		const { data: sameNameRepo } = await octokit.repos.get({
			owner: viewerLogin,
			repo: upstreamRepo,
		});

		if (sameNameRepo?.name) {
			return { uploadRepo: sameNameRepo.name };
		}
	} catch {
		// Same-name repo not found or inaccessible; continue with fork discovery.
	}

	// Primary fork detection path: ask GitHub for forks of the upstream repo,
	// then pick the one owned by the current viewer regardless of fork repo name.
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
		// If upstream fork listing fails, continue with local fallbacks.
	}

	const upstreamFullName = `${upstreamOwner}/${upstreamRepo}`;

	// Fallback path for environments where upstream fork listing is limited:
	// inspect viewer-owned repos and match by fork parent/source linkage.
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
		// Ignore search failures and fall back to current state.
	}

	return {};
}

export async function getIssueImageUploadContext(
	owner: string,
	repo: string,
): Promise<IssueImageUploadContext> {
	const octokit = await getOctokit();
	if (!octokit) return { success: false, error: "Not authenticated" };

	const viewer = await getAuthenticatedUser();
	if (!viewer?.login) return { success: false, error: "Not authenticated" };

	try {
		const { data: repoData } = await octokit.repos.get({ owner, repo });
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

		const forkTarget = await findUserForkUploadTarget(
			octokit,
			viewer.login,
			owner,
			repo,
		);
		if (forkTarget.uploadRepo) {
			return {
				success: true,
				mode: "fork",
				viewerLogin: viewer.login,
				uploadOwner: viewer.login,
				uploadRepo: forkTarget.uploadRepo,
			};
		}

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

/**
 * Upload an image to a temporary location in the repository for use in issue/PR bodies.
 * GitHub hosts issue/PR paste images on their own asset storage (user-attachments);
 * we don't have that API, so we commit to the repo in .github-images/.
 * - For issues: upload to default branch (no branch context).
 * - For PRs: pass `branch` (head branch) so the image is part of the PR and merges with it.
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
		// Read file as base64
		const bytes = await file.arrayBuffer();
		const base64Content = Buffer.from(bytes).toString("base64");

		// Generate a unique filename with timestamp
		const timestamp = Date.now();
		const randomId = Math.random().toString(36).substring(2, 10);
		const ext = file.name.split(".").pop()?.toLowerCase() || "png";
		const filename = `${type}-upload-${timestamp}-${randomId}.${ext}`;

		// Use provided branch (e.g. PR head) or default branch
		const targetBranch =
			branch ?? (await octokit.repos.get({ owner, repo })).data.default_branch;

		// Try to create/update the file in a hidden .github-images directory
		// This follows GitHub's pattern for issue assets
		const path = `.github-images/${filename}`;

		try {
			// Create or update file on the target branch
			await octokit.repos.createOrUpdateFileContents({
				owner,
				repo,
				path,
				message: `Upload image for ${type}: ${filename}`,
				content: base64Content,
				branch: targetBranch,
			});

			// Construct the raw GitHub URL for the uploaded image
			const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${path}`;

			return { success: true, url: imageUrl };
		} catch (error) {
			// If the file already exists (rare but possible), try to get it
			if (
				typeof error === "object" &&
				error !== null &&
				"status" in error &&
				error.status === 422
			) {
				// File might already exist, construct URL anyway
				const imageUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${targetBranch}/${path}`;
				return { success: true, url: imageUrl };
			}
			throw error;
		}
	} catch (err: unknown) {
		const message = getErrorMessage(err);
		// Check if it's a permission error - users without write access can't upload this way
		if (typeof err === "object" && err !== null && "status" in err) {
			if (err.status === 403 || err.status === 404) {
				return {
					success: false,
					error: "You don't have permission to upload images to this repository. Please drag and drop images directly into the GitHub text editor instead.",
				};
			}
		}
		return { success: false, error: `Upload failed: ${message}` };
	}
}
