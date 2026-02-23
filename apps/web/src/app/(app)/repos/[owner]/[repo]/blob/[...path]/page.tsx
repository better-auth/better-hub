import type { Metadata } from "next";
import {
	getFileContent,
	getRepoBranches,
	getRepoTags,
	getRepo,
	extractRepoPermissions,
} from "@/lib/github";
import { parseRefAndPath, formatBytes, getLanguageFromFilename } from "@/lib/github-utils";
import { CodeViewer } from "@/components/repo/code-viewer";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { MarkdownBlobView } from "@/components/repo/markdown-blob-view";
import { File, Download } from "lucide-react";

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown", "mdown", "mkd"]);

const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp"]);

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; path: string[] }>;
}): Promise<Metadata> {
	const { owner, repo, path: pathSegments } = await params;
	const [branches, tags] = await Promise.all([
		getRepoBranches(owner, repo),
		getRepoTags(owner, repo),
	]);
	const branchNames = [...branches.map((b) => b.name), ...tags.map((t) => t.name)];
	const { path } = parseRefAndPath(pathSegments, branchNames);
	const filename = path.split("/").pop() || path;
	return { title: `${filename} · ${owner}/${repo}` };
}

function isBinary(content: string): boolean {
	// eslint-disable-next-line no-control-regex
	return /[\x00-\x08\x0E-\x1F]/.test(content.slice(0, 1000));
}

export default async function BlobPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; path: string[] }>;
}) {
	const { owner, repo, path: pathSegments } = await params;

	const [branches, tags, repoData] = await Promise.all([
		getRepoBranches(owner, repo),
		getRepoTags(owner, repo),
		getRepo(owner, repo),
	]);
	const permissions = repoData ? extractRepoPermissions(repoData) : null;
	const canEdit = !!(permissions?.push || permissions?.admin || permissions?.maintain);
	const branchNames = [...branches.map((b) => b.name), ...tags.map((t) => t.name)];

	const { ref, path } = parseRefAndPath(pathSegments, branchNames);
	const filename = path.split("/").pop() || "";
	const ext = filename.split(".").pop()?.toLowerCase() || "";

	// Handle images
	if (IMAGE_EXTENSIONS.has(ext)) {
		const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${ref}/${path}`;
		return (
			<div className="border border-border p-8 flex items-center justify-center">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={rawUrl}
					alt={filename}
					className="max-w-full max-h-[500px] object-contain"
				/>
			</div>
		);
	}

	const file = await getFileContent(owner, repo, path, ref);

	if (!file) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					File not found
				</p>
			</div>
		);
	}

	// File too large
	if (file.size > 1024 * 1024) {
		return (
			<div className="border border-border py-16 text-center">
				<File className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
				<p className="text-xs text-muted-foreground font-mono mb-2">
					File too large to display ({formatBytes(file.size)})
				</p>
				<a
					href={file.download_url || "#"}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				>
					<Download className="w-3 h-3" />
					Download
				</a>
			</div>
		);
	}

	// Binary file
	if (isBinary(file.content)) {
		return (
			<div className="border border-border py-16 text-center">
				<File className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
				<p className="text-xs text-muted-foreground font-mono mb-2">
					Binary file ({formatBytes(file.size)})
				</p>
				<a
					href={file.download_url || "#"}
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				>
					<Download className="w-3 h-3" />
					Download
				</a>
			</div>
		);
	}

	const isMarkdown = MARKDOWN_EXTENSIONS.has(ext);
	const fileDir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

	if (isMarkdown) {
		const lang = getLanguageFromFilename(filename);
		const mdLineCount = file.content.split("\n").length;
		return (
			<MarkdownBlobView
				rawView={
					<CodeViewer
						content={file.content}
						filename={filename}
						filePath={path}
						fileSize={file.size}
						hideHeader
					/>
				}
				previewView={
					<div className="border border-border rounded-md overflow-hidden">
						<div className="px-6 py-5">
							<MarkdownRenderer
								content={file.content}
								repoContext={{
									owner,
									repo,
									branch: ref,
									dir: fileDir,
								}}
							/>
						</div>
					</div>
				}
				fileSize={file.size}
				lineCount={mdLineCount}
				language={lang}
				content={file.content}
				filePath={path}
				filename={filename}
				canEdit={canEdit}
				sha={file.sha}
				owner={owner}
				repo={repo}
				branch={ref}
			/>
		);
	}

	return (
		<CodeViewer
			content={file.content}
			filename={filename}
			filePath={path}
			fileSize={file.size}
			canEdit={canEdit}
			sha={file.sha}
			owner={owner}
			repo={repo}
			branch={ref}
		/>
	);
}
