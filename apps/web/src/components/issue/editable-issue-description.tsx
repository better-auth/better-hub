"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	Pencil,
	X,
	Loader2,
	AlertCircle,
	Eye,
	Bold,
	Italic,
	Code,
	Link as LinkIcon,
	List,
	ListOrdered,
	Quote,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { MarkdownCopyHandler } from "@/components/shared/markdown-copy-handler";
import { CollapsibleBody } from "@/components/issue/collapsible-body";
import { ReactionDisplay, type Reactions } from "@/components/shared/reaction-display";
import { UserTooltip } from "@/components/shared/user-tooltip";
import { updateIssue } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

interface EditableIssueDescriptionProps {
	entry: {
		user: { login: string; avatar_url: string } | null;
		body: string;
		bodyHtml?: string;
		created_at: string;
		reactions?: Reactions;
	};
	issueTitle: string;
	owner: string;
	repo: string;
	issueNumber: number;
}

export function EditableIssueDescription({
	entry,
	issueTitle,
	owner,
	repo,
	issueNumber,
}: EditableIssueDescriptionProps) {
	const router = useRouter();
	const [isEditing, setIsEditing] = useState(false);
	const [editTitle, setEditTitle] = useState(issueTitle);
	const [editBody, setEditBody] = useState(entry.body);
	const [bodyTab, setBodyTab] = useState<"write" | "preview">("write");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const hasBody = Boolean(entry.body && entry.body.trim().length > 0);
	const isLong = hasBody && entry.body.length > 800;

	const renderedBody = entry.bodyHtml ? (
		<MarkdownCopyHandler>
			<div
				className="ghmd"
				dangerouslySetInnerHTML={{ __html: entry.bodyHtml }}
			/>
		</MarkdownCopyHandler>
	) : null;

	const handleSave = () => {
		if (!editTitle.trim()) {
			setError("Title is required");
			return;
		}
		setError(null);
		startTransition(async () => {
			const result = await updateIssue(
				owner,
				repo,
				issueNumber,
				editTitle.trim(),
				editBody.trim(),
			);
			if (result.error) {
				setError(result.error);
			} else {
				setIsEditing(false);
				setBodyTab("write");
				router.refresh();
			}
		});
	};

	const handleCancel = () => {
		setEditTitle(issueTitle);
		setEditBody(entry.body);
		setBodyTab("write");
		setError(null);
		setIsEditing(false);
	};

	const insertMarkdown = useCallback(
		(prefix: string, suffix: string = prefix) => {
			const ta = textareaRef.current;
			if (!ta) return;
			const start = ta.selectionStart;
			const end = ta.selectionEnd;
			const selected = editBody.slice(start, end);
			const replacement = selected
				? `${prefix}${selected}${suffix}`
				: `${prefix}${suffix}`;
			const newBody =
				editBody.slice(0, start) + replacement + editBody.slice(end);
			setEditBody(newBody);
			requestAnimationFrame(() => {
				ta.focus();
				const cursorPos = selected
					? start + replacement.length
					: start + prefix.length;
				ta.setSelectionRange(cursorPos, cursorPos);
			});
		},
		[editBody],
	);

	const insertLinePrefix = useCallback(
		(prefix: string) => {
			const ta = textareaRef.current;
			if (!ta) return;
			const start = ta.selectionStart;
			const lineStart = editBody.lastIndexOf("\n", start - 1) + 1;
			const newBody =
				editBody.slice(0, lineStart) + prefix + editBody.slice(lineStart);
			setEditBody(newBody);
			requestAnimationFrame(() => {
				ta.focus();
				ta.setSelectionRange(start + prefix.length, start + prefix.length);
			});
		},
		[editBody],
	);

	const toolbarActions = [
		{ icon: Bold, action: () => insertMarkdown("**"), title: "Bold" },
		{ icon: Italic, action: () => insertMarkdown("_"), title: "Italic" },
		{ icon: Code, action: () => insertMarkdown("`"), title: "Code" },
		{ icon: LinkIcon, action: () => insertMarkdown("[", "](url)"), title: "Link" },
		{ icon: Quote, action: () => insertLinePrefix("> "), title: "Quote" },
		{ icon: List, action: () => insertLinePrefix("- "), title: "Bullet list" },
		{
			icon: ListOrdered,
			action: () => insertLinePrefix("1. "),
			title: "Numbered list",
		},
	];

	return (
		<div className="border border-border/60 rounded-lg overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-2 px-3.5 py-2 border-b border-border/60 bg-card/80">
				{entry.user && (
					<UserTooltip username={entry.user.login}>
						<Link
							href={`/users/${entry.user.login}`}
							className="text-xs font-semibold text-foreground/90 hover:text-foreground hover:underline transition-colors"
						>
							{entry.user.login}
						</Link>
					</UserTooltip>
				)}
				<span className="text-[11px] text-muted-foreground/50">
					commented <TimeAgo date={entry.created_at} />
				</span>
				{!isEditing ? (
					<button
						onClick={() => setIsEditing(true)}
						className="ml-auto p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
						title="Edit issue"
					>
						<Pencil className="w-3.5 h-3.5" />
					</button>
				) : (
					<button
						onClick={handleCancel}
						disabled={isPending}
						className="ml-auto p-0.5 rounded text-muted-foreground/40 hover:text-muted-foreground transition-colors cursor-pointer"
						title="Cancel edit"
					>
						<X className="w-3.5 h-3.5" />
					</button>
				)}
			</div>

			{isEditing ? (
				/* Edit form */
				<div className="p-3.5 space-y-3">
					{/* Title */}
					<div>
						<label className="text-[11px] text-muted-foreground/50 mb-1 block">
							Title
						</label>
						<input
							type="text"
							value={editTitle}
							onChange={(e) =>
								setEditTitle(e.target.value)
							}
							className="w-full bg-muted/20 border border-border/50 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:border-foreground/20 transition-colors"
							autoFocus
							onKeyDown={(e) => {
								if (e.key === "Escape")
									handleCancel();
							}}
						/>
					</div>

					{/* Body editor */}
					<div>
						<label className="text-[11px] text-muted-foreground/50 mb-1 block">
							Body
						</label>

						{/* Tabs + toolbar */}
						<div className="flex items-center gap-0 mb-1.5">
							<div className="flex items-center gap-0 mr-3">
								<button
									type="button"
									onClick={() =>
										setBodyTab("write")
									}
									className={cn(
										"flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer",
										bodyTab === "write"
											? "text-foreground bg-muted/60 dark:bg-white/5 font-medium"
											: "text-muted-foreground/50 hover:text-muted-foreground",
									)}
								>
									<Pencil className="w-3 h-3" />
									Write
								</button>
								<button
									type="button"
									onClick={() =>
										setBodyTab(
											"preview",
										)
									}
									className={cn(
										"flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer",
										bodyTab ===
											"preview"
											? "text-foreground bg-muted/60 dark:bg-white/5 font-medium"
											: "text-muted-foreground/50 hover:text-muted-foreground",
									)}
								>
									<Eye className="w-3 h-3" />
									Preview
								</button>
							</div>

							{/* Markdown toolbar — only in write mode */}
							{bodyTab === "write" && (
								<div className="flex items-center gap-0 border-l border-border/30 dark:border-white/5 pl-2">
									{toolbarActions.map(
										({
											icon: Icon,
											action,
											title: t,
										}) => (
											<button
												key={
													t
												}
												type="button"
												onClick={
													action
												}
												title={
													t
												}
												className="p-1 text-muted-foreground/35 hover:text-muted-foreground transition-colors cursor-pointer rounded"
											>
												<Icon className="w-3.5 h-3.5" />
											</button>
										),
									)}
								</div>
							)}
						</div>

						{/* Write / Preview area */}
						<div
							className={cn(
								"rounded-lg border border-border/50 dark:border-white/6 overflow-hidden bg-muted/15 dark:bg-white/[0.01] transition-colors",
								bodyTab === "write" &&
									"focus-within:border-foreground/15",
							)}
						>
							{bodyTab === "write" ? (
								<textarea
									ref={textareaRef}
									value={editBody}
									onChange={(e) =>
										setEditBody(
											e.target
												.value,
										)
									}
									rows={10}
									className="w-full bg-transparent px-3 py-2.5 text-[13px] leading-relaxed placeholder:text-muted-foreground/25 focus:outline-none resize-y font-mono"
									placeholder="Describe the issue... (Markdown supported)"
									onKeyDown={(e) => {
										if (
											e.key ===
											"Escape"
										)
											handleCancel();
										if (
											e.key ===
												"Enter" &&
											(e.metaKey ||
												e.ctrlKey)
										) {
											e.preventDefault();
											handleSave();
										}
									}}
								/>
							) : (
								<div className="min-h-[160px] px-3 py-2.5 overflow-y-auto">
									{editBody.trim() ? (
										<div className="ghmd text-[13px]">
											<ReactMarkdown>
												{
													editBody
												}
											</ReactMarkdown>
										</div>
									) : (
										<p className="text-[13px] text-muted-foreground/25 italic">
											Nothing to
											preview
										</p>
									)}
								</div>
							)}
						</div>
					</div>

					{error && (
						<div className="flex items-center gap-2 text-[11px] text-destructive">
							<AlertCircle className="w-3 h-3 shrink-0" />
							{error}
						</div>
					)}

					<div className="flex items-center justify-between">
						<span className="text-[10px] text-muted-foreground/25">
							{typeof navigator !== "undefined" &&
							/Mac|iPhone|iPad/.test(navigator.userAgent)
								? "⌘"
								: "Ctrl"}
							+Enter to save
						</span>
						<div className="flex items-center gap-2">
							<button
								onClick={handleCancel}
								disabled={isPending}
								className="px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-md"
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								disabled={
									isPending ||
									!editTitle.trim()
								}
								className={cn(
									"flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer",
									editTitle.trim()
										? "bg-foreground text-background hover:bg-foreground/90"
										: "bg-muted text-muted-foreground/30 cursor-not-allowed",
									"disabled:opacity-50 disabled:cursor-not-allowed",
								)}
							>
								{isPending && (
									<Loader2 className="w-3 h-3 animate-spin" />
								)}
								Save changes
							</button>
						</div>
					</div>
				</div>
			) : (
				/* Read view */
				<>
					{hasBody && renderedBody ? (
						<div className="px-3.5 py-3">
							{isLong ? (
								<CollapsibleBody>
									{renderedBody}
								</CollapsibleBody>
							) : (
								renderedBody
							)}
						</div>
					) : (
						<div className="px-3.5 py-4">
							<p className="text-sm text-muted-foreground/30 italic">
								No description provided.
							</p>
						</div>
					)}
					<div className="px-3.5 pb-2.5">
						<ReactionDisplay
							reactions={entry.reactions ?? {}}
							owner={owner}
							repo={repo}
							contentType="issue"
							contentId={issueNumber}
						/>
					</div>
				</>
			)}
		</div>
	);
}
