"use client";

import { useState, useEffect } from "react";
import {
	MoreHorizontal,
	Link,
	Copy,
	Quote,
	Check,
	Trash2,
	Loader2,
	Pencil,
	Flag,
	FilePlus2,
} from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	ReferenceIssueDialog,
	ReportContentDialog,
} from "@/components/shared/comment-action-dialogs";
import { buildReportContentUrl } from "@/lib/comment-actions";
import { cn } from "@/lib/utils";

type MessageActionsMenuProps = {
	commentUrl: string;
	body: string;
	canEdit?: boolean;
	canDelete?: boolean;
	onEdit?: () => void;
	onDelete?: () => Promise<void> | void;
	triggerClassName?: string;
	align?: "start" | "center" | "end";
	ariaLabel?: string;
	editLabel?: string;
	reportContent?: {
		authorLogin?: string | null;
		authorType?: string | null;
	};
	referenceIssue?: {
		owner: string;
		repo: string;
		authorLogin?: string | null;
	};
};

export function MessageActionsMenu({
	commentUrl,
	body,
	canEdit = false,
	canDelete = false,
	onDelete,
	onEdit,
	triggerClassName,
	align = "end",
	ariaLabel = "Comment actions",
	editLabel = "Edit",
	reportContent,
	referenceIssue,
}: MessageActionsMenuProps) {
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);
	const [reportDialogOpen, setReportDialogOpen] = useState(false);
	const [referenceDialogOpen, setReferenceDialogOpen] = useState(false);

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
		if (!canDelete || !onDelete) return;
		setDeleting(true);
		setOpen(false);
		try {
			await onDelete();
		} finally {
			setDeleting(false);
		}
	};

	const reportContentUrl = reportContent
		? buildReportContentUrl({
				commentUrl,
				authorLogin: reportContent.authorLogin,
				authorType: reportContent.authorType,
			})
		: null;
	const showManageSeparator = canEdit || canDelete;
	const showReference = Boolean(referenceIssue);
	const showReport = Boolean(reportContentUrl);
	const showTrailingSeparator = showReport && (showManageSeparator || showReference);

	return (
		<>
			<DropdownMenu open={open} onOpenChange={setOpen}>
				<DropdownMenuTrigger asChild>
					<button
						className={cn(
							"p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-muted-foreground transition-colors",
							triggerClassName,
						)}
						aria-label={ariaLabel}
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
				<DropdownMenuContent align={align} className="w-52">
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
					{showReference && referenceIssue && (
						<DropdownMenuItem
							onSelect={(e) => {
								e.preventDefault();
								setOpen(false);
								setReferenceDialogOpen(true);
							}}
						>
							<FilePlus2 className="w-3.5 h-3.5" />
							<span>Reference in new issue</span>
						</DropdownMenuItem>
					)}
					{showManageSeparator && <DropdownMenuSeparator />}
					{canEdit && onEdit && (
						<DropdownMenuItem
							onSelect={(e) => {
								e.preventDefault();
								setOpen(false);
								onEdit();
							}}
						>
							<Pencil className="w-3.5 h-3.5" />
							<span>{editLabel}</span>
						</DropdownMenuItem>
					)}
					{canDelete && onDelete && (
						<DropdownMenuItem
							onSelect={handleDelete}
							className="text-destructive focus:text-destructive"
						>
							<Trash2 className="w-3.5 h-3.5" />
							<span>Delete</span>
						</DropdownMenuItem>
					)}
					{showTrailingSeparator && <DropdownMenuSeparator />}
					{showReport && reportContentUrl && (
						<DropdownMenuItem
							onSelect={(e) => {
								e.preventDefault();
								setOpen(false);
								setReportDialogOpen(true);
							}}
						>
							<Flag className="w-3.5 h-3.5" />
							<span>Report content</span>
						</DropdownMenuItem>
					)}
				</DropdownMenuContent>
			</DropdownMenu>
			{reportContentUrl && (
				<ReportContentDialog
					open={reportDialogOpen}
					onOpenChange={setReportDialogOpen}
					reportUrl={reportContentUrl}
				/>
			)}
			{referenceIssue && (
				<ReferenceIssueDialog
					open={referenceDialogOpen}
					onOpenChange={setReferenceDialogOpen}
					owner={referenceIssue.owner}
					repo={referenceIssue.repo}
					sourceBody={body}
					sourceUrl={commentUrl}
					authorLogin={referenceIssue.authorLogin}
				/>
			)}
		</>
	);
}
