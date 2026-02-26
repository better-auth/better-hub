"use server";

import { getOctokit, invalidateRepoIssuesCache } from "@/lib/github";
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
