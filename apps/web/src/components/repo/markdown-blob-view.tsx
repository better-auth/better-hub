"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Pencil, WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/github-utils";
import { useGlobalChat, type InlineContext } from "@/components/shared/global-chat-provider";
import { CommitDialog } from "@/components/shared/commit-dialog";
import { commitFileEdit } from "@/app/(app)/repos/[owner]/[repo]/blob/blob-actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

export function MarkdownBlobView({
	rawView,
	previewView,
	fileSize,
	lineCount,
	language,
	content,
	filePath,
	filename,
	canEdit,
	sha: initialSha,
	owner,
	repo,
	branch,
}: {
	rawView: React.ReactNode;
	previewView: React.ReactNode;
	fileSize?: number;
	lineCount: number;
	language: string;
	content: string;
	filePath: string;
	filename: string;
	canEdit?: boolean;
	sha?: string;
	owner?: string;
	repo?: string;
	branch?: string;
}) {
	const [mode, setMode] = useState<"preview" | "raw" | "edit">("preview");
	const mdRouter = useRouter();
	const { addCodeContext } = useGlobalChat();
	const { emit } = useMutationEvents();
	const [editContent, setEditContent] = useState(content);
	const [commitDialogOpen, setCommitDialogOpen] = useState(false);
	const [currentSha, setCurrentSha] = useState(initialSha);
	const [wordWrap, setWordWrap] = useState(false);

	const displayName = filePath || filename;

	const handleAddFileToGhost = useCallback(() => {
		const ctx: InlineContext = {
			filename: displayName,
			startLine: 1,
			endLine: lineCount,
			selectedCode: content,
			side: "RIGHT",
		};
		addCodeContext(ctx);
	}, [displayName, lineCount, content, addCodeContext]);

	// Cmd+S while editing opens the commit dialog
	useEffect(() => {
		if (mode !== "edit") return;
		const handleSaveShortcut = (e: KeyboardEvent) => {
			if ((e.metaKey || e.ctrlKey) && e.key === "s") {
				e.preventDefault();
				if (editContent !== content) {
					setCommitDialogOpen(true);
				}
			}
		};
		document.addEventListener("keydown", handleSaveShortcut);
		return () => document.removeEventListener("keydown", handleSaveShortcut);
	}, [mode, editContent, content]);

	const handleCommit = useCallback(
		async (message: string) => {
			if (!owner || !repo || !branch || !currentSha) return;
			const result = await commitFileEdit(
				owner,
				repo,
				filePath,
				branch,
				editContent,
				currentSha,
				message,
			);
			if (result.error) throw new Error(result.error);
			if (result.newSha) setCurrentSha(result.newSha);
			setMode("preview");
			if (owner && repo) emit({ type: "repo:file-committed", owner, repo });
			mdRouter.refresh();
		},
		[owner, repo, branch, currentSha, filePath, editContent, mdRouter],
	);

	return (
		<div>
			<div className="sticky top-0 z-30 bg-background/95 backdrop-blur-sm flex items-center gap-3 px-1 py-1.5">
				<div className="flex items-center gap-1.5">
					<button
						onClick={() => {
							setMode("raw");
						}}
						className={cn(
							"text-[11px] font-mono transition-colors cursor-pointer",
							mode === "raw"
								? "text-muted-foreground underline underline-offset-4"
								: "text-muted-foreground/40 hover:text-muted-foreground",
						)}
					>
						Raw
					</button>
					<span className="text-muted-foreground/25 text-[11px]">
						/
					</span>
					<button
						onClick={() => {
							setMode("preview");
						}}
						className={cn(
							"text-[11px] font-mono transition-colors cursor-pointer",
							mode === "preview"
								? "text-muted-foreground underline underline-offset-4"
								: "text-muted-foreground/40 hover:text-muted-foreground",
						)}
					>
						Preview
					</button>
				</div>
				{fileSize != null && (
					<span className="text-[11px] font-mono text-muted-foreground/60">
						{formatBytes(fileSize)}
					</span>
				)}
				<span className="text-[11px] font-mono text-muted-foreground/60">
					{lineCount} lines
				</span>
				<span className="text-[11px] font-mono text-muted-foreground/60">
					{language}
				</span>
				<div className="flex-1" />
				{mode === "edit" ? (
					<>
						<button
							onClick={() => {
								setMode("preview");
								setEditContent(content);
							}}
							className="px-2 py-1 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-muted/60"
						>
							Cancel
						</button>
						<button
							onClick={() => setCommitDialogOpen(true)}
							disabled={editContent === content}
							className="px-2 py-1 text-[11px] font-mono bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-40 cursor-pointer"
						>
							Save
						</button>
					</>
				) : (
					<div className="flex items-center gap-0.5">
						<button
							onClick={() => setWordWrap((w) => !w)}
							className={cn(
								"flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer rounded-md",
								wordWrap
									? "text-foreground bg-muted/80"
									: "text-muted-foreground/50 hover:text-foreground hover:bg-muted/60",
							)}
							title="Toggle word wrap"
						>
							<WrapText className="w-3.5 h-3.5" />
						</button>
						{canEdit && (
							<button
								onClick={() => {
									setEditContent(content);
									setMode("edit");
								}}
								className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer rounded-md hover:bg-muted/60"
								title="Edit file"
							>
								<Pencil className="w-3.5 h-3.5" />
							</button>
						)}
					</div>
				)}
			</div>
			<div
				className={cn(
					mode === "raw" ? "block" : "hidden",
					wordWrap && "word-wrap",
				)}
			>
				{rawView}
			</div>
			<div className={mode === "preview" ? "block" : "hidden"}>{previewView}</div>
			{mode === "edit" && (
				<div className="border border-border rounded-md">
					<textarea
						value={editContent}
						onChange={(e) => setEditContent(e.target.value)}
						className="w-full min-h-[400px] bg-muted/20 px-4 py-3 font-mono text-[13px] leading-relaxed text-foreground focus:outline-none resize-y rounded-md"
						style={{ tabSize: 2 }}
						spellCheck={false}
						autoFocus
					/>
				</div>
			)}

			{/* Commit dialog */}
			{commitDialogOpen && branch && (
				<CommitDialog
					open={commitDialogOpen}
					onOpenChange={setCommitDialogOpen}
					filename={filePath}
					branch={branch}
					originalContent={content}
					newContent={editContent}
					onCommit={handleCommit}
				/>
			)}
		</div>
	);
}
