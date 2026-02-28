import { NextRequest, NextResponse } from "next/server";
import { getOctokit } from "@/lib/github";
import { threeWayMerge, type ConflictFileData } from "@/lib/three-way-merge";
import { getErrorMessage } from "@/lib/utils";

const MAX_FILES = 30;

interface GitHubFileContent {
	content: string;
	type: string;
}

export async function GET(request: NextRequest) {
	const { searchParams } = request.nextUrl;
	const owner = searchParams.get("owner");
	const repo = searchParams.get("repo");
	const base = searchParams.get("base");
	const head = searchParams.get("head");

	if (!owner || !repo || !base || !head) {
		return NextResponse.json(
			{ error: "Missing required parameters: owner, repo, base, head" },
			{ status: 400 },
		);
	}

	const octokit = await getOctokit();
	if (!octokit) {
		return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
	}

	try {
		const { data: comparison } = await octokit.repos.compareCommits({
			owner,
			repo,
			base,
			head,
		});

		const mergeBaseSha = comparison.merge_base_commit.sha;
		const baseSha = comparison.base_commit.sha;
		const headSha =
			comparison.commits.length > 0
				? comparison.commits[comparison.commits.length - 1].sha
				: mergeBaseSha;

		// For fork PRs, head content lives in the fork repo
		const isFork = head.includes(":");
		const headOwner = isFork ? head.split(":")[0] : owner;

		const diffFiles = (comparison.files || []).slice(0, MAX_FILES);

		if (diffFiles.length === 0) {
			return NextResponse.json({
				mergeBaseSha,
				baseBranch: base,
				headBranch: head,
				files: [],
			});
		}

		const fetchContent = async (
			contentOwner: string,
			contentRepo: string,
			filePath: string,
			ref: string,
		): Promise<string | null> => {
			try {
				const { data } = await octokit.repos.getContent({
					owner: contentOwner,
					repo: contentRepo,
					path: filePath,
					ref,
				});
				if (Array.isArray(data) || data.type !== "file") return null;
				const fileContent = data as GitHubFileContent;
				return Buffer.from(fileContent.content, "base64").toString("utf-8");
			} catch {
				return null;
			}
		};

		const files: ConflictFileData[] = await Promise.all(
			diffFiles.map(async (file) => {
				const filePath = file.filename;

				const [ancestorContent, baseContent, headContent] =
					await Promise.all([
						fetchContent(owner, repo, filePath, mergeBaseSha),
						fetchContent(owner, repo, filePath, baseSha),
						fetchContent(headOwner, repo, filePath, headSha),
					]);

				if (
					ancestorContent === null &&
					baseContent === null &&
					headContent !== null
				) {
					return {
						path: filePath,
						hunks: [
							{
								type: "clean" as const,
								resolvedLines:
									headContent.split("\n"),
							},
						],
						hasConflicts: false,
						autoResolved: true,
					};
				}
				if (
					ancestorContent === null &&
					headContent === null &&
					baseContent !== null
				) {
					return {
						path: filePath,
						hunks: [
							{
								type: "clean" as const,
								resolvedLines:
									baseContent.split("\n"),
							},
						],
						hasConflicts: false,
						autoResolved: true,
					};
				}
				if (baseContent === null && headContent === null) {
					return {
						path: filePath,
						hunks: [],
						hasConflicts: false,
						autoResolved: true,
					};
				}

				const ancestor = (ancestorContent ?? "").split("\n");
				const baseLines = (baseContent ?? "").split("\n");
				const headLines = (headContent ?? "").split("\n");

				const baseChanged = baseContent !== ancestorContent;
				const headChanged = headContent !== ancestorContent;

				if (baseChanged && !headChanged) {
					return {
						path: filePath,
						hunks: [
							{
								type: "clean" as const,
								resolvedLines: baseLines,
							},
						],
						hasConflicts: false,
						autoResolved: true,
					};
				}
				if (headChanged && !baseChanged) {
					return {
						path: filePath,
						hunks: [
							{
								type: "clean" as const,
								resolvedLines: headLines,
							},
						],
						hasConflicts: false,
						autoResolved: true,
					};
				}
				if (!baseChanged && !headChanged) {
					return {
						path: filePath,
						hunks: [
							{
								type: "clean" as const,
								resolvedLines: ancestor,
							},
						],
						hasConflicts: false,
						autoResolved: true,
					};
				}

				const result = threeWayMerge(ancestor, baseLines, headLines);
				return {
					path: filePath,
					hunks: result.hunks,
					hasConflicts: result.hasConflicts,
					autoResolved: !result.hasConflicts,
				};
			}),
		);

		return NextResponse.json({
			mergeBaseSha,
			baseBranch: base,
			headBranch: head,
			files,
		});
	} catch (e: unknown) {
		const msg = getErrorMessage(e) || "Failed to compute merge conflicts";
		const status =
			e &&
			typeof e === "object" &&
			"status" in e &&
			typeof (e as { status: unknown }).status === "number"
				? (e as { status: number }).status
				: 500;
		if (status === 404) {
			return NextResponse.json(
				{
					error: `Could not compare branches. The branch may not exist or you may not have access. If this is a fork PR, ensure the head branch is accessible.`,
				},
				{ status: 404 },
			);
		}
		return NextResponse.json({ error: msg }, { status });
	}
}
