"use client";

import { useState, useEffect } from "react";
import { MoreHorizontal, Link, Copy, Quote, Check, Trash2, Loader2, Pencil } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { deletePRComment } from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { deleteIssueComment } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

type MessageActionsMenuProps = {
	owner: string;
	repo: string;
	commentId: number;
	body: string;
	onDelete?: () => void;
	onEdit?: () => void;
} & (
	| { contentType: "pr"; pullNumber: number; issueNumber?: never }
	| { contentType: "issue"; issueNumber: number; pullNumber?: never }
);

export function MessageActionsMenu({
	owner,
	repo,
	contentType,
	pullNumber,
	issueNumber,
	commentId,
	body,
	onDelete,
	onEdit,
}: MessageActionsMenuProps) {
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const number = contentType === "pr" ? pullNumber : issueNumber;
	const urlType = contentType === "pr" ? "pull" : "issues";
	const commentUrl = `https://github.com/${owner}/${repo}/${urlType}/${number}#issuecomment-${commentId}`;

	useEffect(() => {
		if (copied) {
			const timer = setTimeout(() => setCopied(false), 1500);
			return () => clearTimeout(timer);
		}
	}, [copied]);

	const handleCopyLink = async (e: Event) => {
		e.preventDefault();
		await navigator.clipboard.writeText(commentUrl);
		setCopied(true);
		setOpen(false);
	};

	const handleCopyText = async (e: Event) => {
		e.preventDefault();
		await navigator.clipboard.writeText(body);
		setCopied(true);
		setOpen(false);
	};

	const handleQuoteReply = async (e: Event) => {
		e.preventDefault();
		const quoted = body
			.split("\n")
			.map((line) => `> ${line}`)
			.join("\n");
		await navigator.clipboard.writeText(quoted + "\n\n");
		setCopied(true);
		setOpen(false);
	};

	const handleDelete = async (e: Event) => {
		e.preventDefault();
		setDeleting(true);
		setOpen(false);
		const result =
			contentType === "pr"
				? await deletePRComment(owner, repo, pullNumber!, commentId)
				: await deleteIssueComment(owner, repo, issueNumber!, commentId);
		if (result.error) {
			alert(result.error);
		} else {
			onDelete?.();
		}
		setDeleting(false);
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-muted-foreground transition-colors"
					aria-label="Message actions"
					disabled={deleting}
				>
					{deleting ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : copied ? (
						<Check className="w-3.5 h-3.5 text-green-500" />
					) : (
						<MoreHorizontal className="w-3.5 h-3.5" />
					)}
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent align="end" className="w-40">
				<DropdownMenuItem onSelect={handleCopyLink}>
					<Link className="w-3.5 h-3.5" />
					<span>Copy link</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={handleCopyText}>
					<Copy className="w-3.5 h-3.5" />
					<span>Copy text</span>
				</DropdownMenuItem>
				<DropdownMenuItem onSelect={handleQuoteReply}>
					<Quote className="w-3.5 h-3.5" />
					<span>Quote reply</span>
				</DropdownMenuItem>
				{onEdit && (
					<>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							onSelect={(e) => {
								e.preventDefault();
								setOpen(false);
								onEdit();
							}}
						>
							<Pencil className="w-3.5 h-3.5" />
							<span>Edit</span>
						</DropdownMenuItem>
					</>
				)}
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={handleDelete}
					className="text-destructive focus:text-destructive"
				>
					<Trash2 className="w-3.5 h-3.5" />
					<span>Delete</span>
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
