import Image from "next/image";
import Link from "next/link";
import { ExternalLink, FileCode2, Globe, History, Lock, MessageSquare, Star } from "lucide-react";
import { CodeViewer } from "@/components/repo/code-viewer";
import { MarkdownBlobView } from "@/components/repo/markdown-blob-view";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import { CommentThread } from "@/components/shared/comment-thread";
import { TimeAgo } from "@/components/ui/time-ago";
import type { GistComment, GistDetail } from "@/lib/github-types";
import { formatBytes, getLanguageColor, getLanguageFromFilename } from "@/lib/github-utils";
import { formatNumber } from "@/lib/utils";

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown", "mdown", "mkd"]);

function isMarkdownFile(filename: string): boolean {
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	return MARKDOWN_EXTENSIONS.has(ext);
}

function getGistTitle(gist: GistDetail): string {
	const firstFile = Object.values(gist.files)[0];
	return gist.description?.trim() || firstFile?.filename || "Untitled Gist";
}

export function GistDetailContent({
	gist,
	comments = [],
}: {
	gist: GistDetail;
	comments?: GistComment[];
}) {
	const files = Object.entries(gist.files).map(([key, file]) => ({
		key,
		filename: file.filename || key,
		file,
	}));
	const title = getGistTitle(gist);
	const showDescription = !!gist.description?.trim() && gist.description.trim() !== title;

	return (
		<div className="space-y-4 pb-4">
			<header className="border-b border-border pb-4">
				<div className="flex items-start justify-between gap-3">
					<div className="min-w-0">
						<div className="flex items-center gap-2">
							<Image
								src={gist.owner.avatar_url}
								alt={gist.owner.login}
								width={20}
								height={20}
								className="rounded-full border border-border"
							/>
							<Link
								href={`/${gist.owner.login}`}
								className="text-sm text-muted-foreground hover:text-foreground transition-colors"
							>
								{gist.owner.login}
							</Link>
							<span className="text-muted-foreground/40">
								/
							</span>
							<h1 className="text-sm sm:text-base font-semibold wrap-break-word">
								{title}
							</h1>
						</div>

						{showDescription && (
							<p className="mt-1.5 text-sm text-muted-foreground wrap-break-word">
								{gist.description}
							</p>
						)}

						<div className="mt-2.5 flex items-center gap-3 flex-wrap text-[11px] font-mono text-muted-foreground/70">
							<span className="inline-flex items-center gap-1">
								<FileCode2 className="w-3 h-3" />
								{files.length} file
								{files.length !== 1 ? "s" : ""}
							</span>
							<span className="inline-flex items-center gap-1">
								{gist.public ? (
									<Globe className="w-3 h-3" />
								) : (
									<Lock className="w-3 h-3" />
								)}
								{gist.public ? "Public" : "Secret"}
							</span>
							{gist.comments > 0 && (
								<span className="inline-flex items-center gap-1">
									<MessageSquare className="w-3 h-3" />
									{formatNumber(
										gist.comments,
									)}{" "}
									comments
								</span>
							)}
							{gist.stars > 0 && (
								<span className="inline-flex items-center gap-1">
									<Star className="w-3 h-3" />
									{formatNumber(
										gist.stars,
									)}{" "}
									stars
								</span>
							)}
							<span>
								Updated{" "}
								<TimeAgo date={gist.updated_at} />
							</span>
						</div>
					</div>

					<a
						href={gist.html_url}
						data-no-github-intercept
						target="_blank"
						rel="noopener noreferrer"
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors shrink-0"
					>
						<ExternalLink className="w-3 h-3" />
						View on GitHub
					</a>
				</div>
			</header>

			<div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_280px] gap-4">
				<main className="space-y-4 min-w-0">
					{files.map(({ key, filename, file }) => {
						const hasInlineContent =
							file.content !== undefined &&
							file.content !== null;
						const inlineContent = file.content ?? "";
						const isMarkdown = isMarkdownFile(filename);
						const language =
							file.language ||
							getLanguageFromFilename(filename);

						return (
							<section
								key={key}
								className="border border-border rounded-md overflow-hidden"
							>
								<div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
									<FileCode2 className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
									<span className="text-[12px] font-mono text-foreground truncate">
										{filename}
									</span>
									<div className="ml-auto flex items-center gap-2 text-[10px] font-mono text-muted-foreground/70">
										{language && (
											<span className="inline-flex items-center gap-1">
												<span
													className="w-2 h-2 rounded-full"
													style={{
														backgroundColor:
															getLanguageColor(
																language,
															),
													}}
												/>
												{
													language
												}
											</span>
										)}
										{file.size > 0 && (
											<span>
												{formatBytes(
													file.size,
												)}
											</span>
										)}
										{file.raw_url && (
											<a
												href={
													file.raw_url
												}
												target="_blank"
												rel="noopener noreferrer"
												className="text-muted-foreground hover:text-foreground transition-colors"
											>
												Raw
											</a>
										)}
									</div>
								</div>

								<div className="p-1">
									{hasInlineContent ? (
										isMarkdown ? (
											<MarkdownBlobView
												rawView={
													<CodeViewer
														content={
															inlineContent
														}
														filename={
															filename
														}
														filePath={
															filename
														}
														fileSize={
															file.size
														}
														hideHeader
													/>
												}
												previewView={
													<div className="border border-border rounded-md overflow-hidden">
														<div className="px-6 py-5">
															<MarkdownRenderer
																content={
																	inlineContent
																}
															/>
														</div>
													</div>
												}
												fileSize={
													file.size
												}
												lineCount={
													inlineContent.split(
														"\n",
													)
														.length
												}
												language={getLanguageFromFilename(
													filename,
												)}
												content={
													inlineContent
												}
												filePath={
													filename
												}
												filename={
													filename
												}
											/>
										) : (
											<CodeViewer
												content={
													inlineContent
												}
												filename={
													filename
												}
												filePath={
													filename
												}
												fileSize={
													file.size
												}
											/>
										)
									) : (
										<div className="py-16 text-center px-4">
											<p className="text-xs text-muted-foreground font-mono">
												File
												content
												is
												not
												available
												inline.
											</p>
											{file.raw_url && (
												<a
													href={
														file.raw_url
													}
													target="_blank"
													rel="noopener noreferrer"
													className="inline-flex mt-2 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
												>
													Open
													raw
													file
												</a>
											)}
										</div>
									)}
								</div>
							</section>
						);
					})}

					<section className="border border-border rounded-md overflow-hidden">
						<div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/30">
							<MessageSquare className="w-3.5 h-3.5 text-muted-foreground/70 shrink-0" />
							<span className="text-[12px] font-mono text-foreground">
								Comments
							</span>
							<span className="ml-auto text-[11px] font-mono text-muted-foreground/70">
								{formatNumber(gist.comments)}
							</span>
						</div>
						<div className="p-3">
							<CommentThread comments={comments} />
						</div>
					</section>
				</main>

				<aside className="xl:sticky xl:top-2 self-start">
					<div className="border border-border rounded-md overflow-hidden">
						<div className="px-3 py-2 border-b border-border bg-muted/30 flex items-center justify-between">
							<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/80">
								Revisions
							</span>
							<span className="text-[11px] font-mono text-muted-foreground/60">
								{gist.history.length}
							</span>
						</div>
						{gist.history.length > 0 ? (
							<ul className="divide-y divide-border">
								{gist.history.map(
									(entry, index) => (
										<li
											key={
												entry.version
											}
										>
											<a
												href={`${gist.html_url}/${entry.version}`}
												data-no-github-intercept
												target="_blank"
												rel="noopener noreferrer"
												className="px-3 py-2.5 flex items-center gap-2 hover:bg-muted/40 transition-colors"
											>
												<History className="w-3 h-3 text-muted-foreground/60 shrink-0" />
												<div className="min-w-0 flex-1">
													<div className="text-[11px] font-mono text-foreground truncate">
														{entry.version.slice(
															0,
															7,
														)}
														{index ===
														0
															? " (latest)"
															: ""}
													</div>
													<div className="text-[10px] font-mono text-muted-foreground/70">
														<TimeAgo
															date={
																entry.committed_at
															}
														/>
													</div>
												</div>
											</a>
										</li>
									),
								)}
							</ul>
						) : (
							<div className="px-3 py-5 text-center text-xs text-muted-foreground font-mono">
								No revision history
							</div>
						)}
					</div>
				</aside>
			</div>
		</div>
	);
}
