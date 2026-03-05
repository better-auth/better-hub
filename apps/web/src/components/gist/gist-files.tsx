import { FileCode2 } from "lucide-react";
import { CodeViewer } from "@/components/repo/code-viewer";
import { MarkdownBlobView } from "@/components/repo/markdown-blob-view";
import { MarkdownRenderer } from "@/components/shared/markdown-renderer";
import type { GistDetail } from "@/lib/github-types";
import { formatBytes, getLanguageColor, getLanguageFromFilename } from "@/lib/github-utils";

const MARKDOWN_EXTENSIONS = new Set(["md", "mdx", "markdown", "mdown", "mkd"]);

function isMarkdownFile(filename: string): boolean {
	const ext = filename.split(".").pop()?.toLowerCase() || "";
	return MARKDOWN_EXTENSIONS.has(ext);
}

interface GistFilesProps {
	gist: GistDetail;
}

export function GistFiles({ gist }: GistFilesProps) {
	const files = Object.entries(gist.files).map(([key, file]) => ({
		key,
		filename: file.filename || key,
		file,
	}));

	return (
		<div className="space-y-4">
			{files.map(({ key, filename, file }) => {
				const hasInlineContent =
					file.content !== undefined && file.content !== null;
				const inlineContent = file.content ?? "";
				const isMarkdown = isMarkdownFile(filename);
				const language = file.language || getLanguageFromFilename(filename);

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
										{language}
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
										href={file.raw_url}
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
										fileSize={file.size}
										lineCount={
											inlineContent.split(
												"\n",
											).length
										}
										language={getLanguageFromFilename(
											filename,
										)}
										content={
											inlineContent
										}
										filePath={filename}
										filename={filename}
									/>
								) : (
									<CodeViewer
										content={
											inlineContent
										}
										filename={filename}
										filePath={filename}
										fileSize={file.size}
									/>
								)
							) : (
								<div className="py-16 text-center px-4">
									<p className="text-xs text-muted-foreground font-mono">
										File content is not
										available inline.
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
											Open raw
											file
										</a>
									)}
								</div>
							)}
						</div>
					</section>
				);
			})}
		</div>
	);
}
