import type { Metadata } from "next";
import { getCommit } from "@/lib/github";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";
import { CommitDetail } from "@/components/repo/commit-detail";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; sha: string }>;
}): Promise<Metadata> {
	const { owner, repo, sha } = await params;
	const commit = await getCommit(owner, repo, sha);
	if (!commit) {
		return { title: `Commit ${sha.slice(0, 7)} · ${owner}/${repo}` };
	}
	const message = commit.commit?.message?.split("\n")[0] || "";
	const shortSha = sha.slice(0, 7);
	return { title: `${message || shortSha} · ${owner}/${repo}` };
}

export default async function CommitDetailPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; sha: string }>;
}) {
	const { owner, repo, sha } = await params;

	const commit = await getCommit(owner, repo, sha);

	if (!commit) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Commit not found
				</p>
			</div>
		);
	}

	// Pre-highlight diff lines with Shiki
	const highlightData: Record<string, Record<string, SyntaxToken[]>> = {};
	if (commit.files && commit.files.length > 0) {
		await Promise.all(
			commit.files.map(async (file: { filename: string; patch?: string }) => {
				if (file.patch) {
					try {
						highlightData[file.filename] =
							await highlightDiffLines(
								file.patch,
								file.filename,
							);
					} catch {
						// silent — fall back to plain text
					}
				}
			}),
		);
	}

	return (
		<CommitDetail
			owner={owner}
			repo={repo}
			commit={
				commit as {
					sha: string;
					html_url: string;
					commit: {
						message: string;
						author: {
							name?: string | null;
							date?: string | null;
						} | null;
						committer: {
							name?: string | null;
							date?: string | null;
						} | null;
					};
					author: {
						login: string;
						avatar_url: string;
						html_url: string;
					} | null;
					committer: {
						login: string;
						avatar_url: string;
						html_url: string;
					} | null;
					parents: { sha: string; html_url: string }[];
					stats?: {
						total: number;
						additions: number;
						deletions: number;
					};
					files: Array<{
						filename: string;
						status: string;
						additions: number;
						deletions: number;
						patch?: string;
						previous_filename?: string;
					}>;
				}
			}
			highlightData={highlightData}
		/>
	);
}
