"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link, Loader2, MoreHorizontal, Pencil, Quote, Trash2 } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface CommentActionsMenuProps {
	body: string;
	url: string;
	ariaLabel?: string;
	canEdit?: boolean;
	canDelete?: boolean;
	onEdit?: () => void;
	onDelete?: () => Promise<{ error?: string } | void> | { error?: string } | void;
	onQuoteReply?: () => void;
}

export function CommentActionsMenu({
	body,
	url,
	ariaLabel = "Comment actions",
	canEdit = false,
	canDelete = false,
	onEdit,
	onDelete,
	onQuoteReply,
}: CommentActionsMenuProps) {
	const [copied, setCopied] = useState(false);
	const [open, setOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	useEffect(() => {
		if (!copied) return;
		const timer = setTimeout(() => setCopied(false), 1500);
		return () => clearTimeout(timer);
	}, [copied]);

	const handleCopyLink = async (e: Event) => {
		e.preventDefault();
		await navigator.clipboard.writeText(url);
		setCopied(true);
		setOpen(false);
	};

	const handleCopyText = async (e: Event) => {
		e.preventDefault();
		await navigator.clipboard.writeText(body);
		setCopied(true);
		setOpen(false);
	};

	const handleQuoteReply = (e: Event) => {
		e.preventDefault();
		onQuoteReply?.();
		setOpen(false);
	};

	const handleDelete = async (e: Event) => {
		e.preventDefault();
		if (!onDelete) return;
		setDeleting(true);
		setOpen(false);
		const result = await onDelete();
		if (result && typeof result === "object" && "error" in result && result.error) {
			alert(result.error);
			setDeleting(false);
			return;
		}
	};

	return (
		<DropdownMenu open={open} onOpenChange={setOpen}>
			<DropdownMenuTrigger asChild>
				<button
					type="button"
					className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-muted-foreground transition-colors"
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
				{((canEdit && onEdit) || (canDelete && onDelete)) && (
					<>
						<DropdownMenuSeparator />
						{canEdit && onEdit && (
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
					</>
				)}
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
