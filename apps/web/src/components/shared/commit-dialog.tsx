"use client";

import { useState } from "react";
import { Loader2, Sparkles, GitCommit } from "lucide-react";
import { getErrorMessage } from "@/lib/utils";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogFooter,
} from "@/components/ui/dialog";

interface CommitDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	filename: string;
	branch: string;
	originalContent: string;
	newContent: string;
	onCommit: (message: string) => Promise<void>;
}

export function CommitDialog({
	open,
	onOpenChange,
	filename,
	branch,
	originalContent,
	newContent,
	onCommit,
}: CommitDialogProps) {
	const [message, setMessage] = useState(`Update ${filename}`);
	const [isCommitting, setIsCommitting] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [error, setError] = useState<string | null>(null);

	const handleGenerate = async () => {
		setIsGenerating(true);
		setError(null);
		try {
			const res = await fetch("/api/ai/commit-message", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ filename, originalContent, newContent }),
			});
			const data = await res.json();
			if (data.error) {
				setError(data.error);
			} else {
				setMessage(data.message);
			}
		} catch {
			setError("Failed to generate commit message");
		} finally {
			setIsGenerating(false);
		}
	};

	const handleCommit = async () => {
		if (!message.trim()) return;
		setIsCommitting(true);
		setError(null);
		try {
			await onCommit(message.trim());
			onOpenChange(false);
		} catch (e: unknown) {
			setError(getErrorMessage(e) || "Failed to commit");
		} finally {
			setIsCommitting(false);
		}
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-sm font-mono">
						Commit changes
					</DialogTitle>
				</DialogHeader>

				<div className="space-y-3">
					<div className="flex items-center gap-2 text-[11px] font-mono text-muted-foreground">
						<GitCommit className="w-3.5 h-3.5" />
						<span>{branch}</span>
						<span className="text-muted-foreground">/</span>
						<span className="truncate">{filename}</span>
					</div>

					<div className="relative">
						<textarea
							value={message}
							onChange={(e) => setMessage(e.target.value)}
							placeholder="Commit message..."
							rows={3}
							className="w-full rounded-md border border-border bg-muted/30 px-3 py-2 pr-8 text-xs font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
							onKeyDown={(e) => {
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey)
								) {
									e.preventDefault();
									handleCommit();
								}
							}}
						/>
						<button
							type="button"
							onClick={handleGenerate}
							disabled={isGenerating || isCommitting}
							className="absolute right-2 top-2 p-0.5 text-muted-foreground hover:text-foreground/70 transition-colors cursor-pointer disabled:cursor-wait"
							title="Generate with AI"
						>
							<Sparkles
								className={`w-3.5 h-3.5 ${isGenerating ? "animate-pulse text-foreground/50" : ""}`}
							/>
						</button>
					</div>

					{error && (
						<p className="text-[11px] font-mono text-destructive">
							{error}
						</p>
					)}
				</div>

				<DialogFooter className="gap-2 sm:gap-2">
					<button
						onClick={handleCommit}
						disabled={isCommitting || !message.trim()}
						className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-40 cursor-pointer"
					>
						{isCommitting && (
							<Loader2 className="w-3 h-3 animate-spin" />
						)}
						Commit
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
