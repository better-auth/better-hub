"use client";

import { useState, useEffect, useTransition } from "react";
import Image from "next/image";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Search, Loader2, Plus, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { KanbanItem } from "@/lib/kanban-store";
import {
	fetchRepoIssuesForKanban,
	addIssueToKanban,
} from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";

interface Issue {
	number: number;
	title: string;
	user: { login: string; avatar_url: string } | null;
	labels: string[];
	created_at: string;
	updated_at: string;
}

interface AddIssueDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	owner: string;
	repo: string;
	onItemAdded: (item: KanbanItem) => void;
}

export function AddIssueDialog({
	open,
	onOpenChange,
	owner,
	repo,
	onItemAdded,
}: AddIssueDialogProps) {
	const [search, setSearch] = useState("");
	const [issues, setIssues] = useState<Issue[]>([]);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [addingIssue, setAddingIssue] = useState<number | null>(null);
	const [generatingSummary, setGeneratingSummary] = useState<string | null>(null);

	useEffect(() => {
		if (open) {
			setIsLoading(true);
			setError(null);
			fetchRepoIssuesForKanban(owner, repo)
				.then((data) => {
					setIssues(data);
					setIsLoading(false);
				})
				.catch((e) => {
					setError(e.message || "Failed to load issues");
					setIsLoading(false);
				});
		} else {
			setSearch("");
			setIssues([]);
			setError(null);
		}
	}, [open, owner, repo]);

	const filteredIssues = issues.filter(
		(issue) =>
			issue.title.toLowerCase().includes(search.toLowerCase()) ||
			issue.number.toString().includes(search),
	);

	const handleAddIssue = async (issue: Issue) => {
		setAddingIssue(issue.number);
		try {
			const newItem = await addIssueToKanban(owner, repo, issue.number);

			setGeneratingSummary(newItem.id);

			try {
				const response = await fetch("/api/ai/kanban-summary", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({
						issueTitle: issue.title,
						issueBody: "",
						issueNumber: issue.number,
						repoFullName: `${owner}/${repo}`,
					}),
				});

				if (response.ok) {
					const { summary } = await response.json();
					if (summary) {
						const { setKanbanItemAiSummary } =
							await import("@/app/(app)/repos/[owner]/[repo]/kanban/actions");
						await setKanbanItemAiSummary(newItem.id, summary);
						newItem.aiSummary = summary;
					}
				}
			} catch {
				// Summary generation failed, but item was added
			}

			setGeneratingSummary(null);
			onItemAdded(newItem);
			setIssues((prev) => prev.filter((i) => i.number !== issue.number));
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to add issue");
		}
		setAddingIssue(null);
	};

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-in fade-in-0" />
				<Dialog.Content
					className={cn(
						"fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
						"z-50 w-full max-w-lg max-h-[85vh] flex flex-col",
						"bg-background border border-border rounded-lg shadow-lg",
						"animate-in fade-in-0 zoom-in-95",
					)}
				>
					<div className="flex items-center justify-between p-4 border-b border-border">
						<Dialog.Title className="text-sm font-semibold">
							Add Issue to Board
						</Dialog.Title>
						<Dialog.Close asChild>
							<button className="p-1 rounded-md hover:bg-muted transition-colors">
								<X className="w-4 h-4 text-muted-foreground" />
							</button>
						</Dialog.Close>
					</div>

					<div className="p-4 border-b border-border">
						<div className="relative">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground/40" />
							<input
								type="text"
								value={search}
								onChange={(e) =>
									setSearch(e.target.value)
								}
								placeholder="Search issues..."
								className={cn(
									"w-full pl-9 pr-3 py-2 text-sm",
									"bg-muted/30 border border-border rounded-md",
									"placeholder:text-muted-foreground/40",
									"focus:outline-none focus:ring-2 focus:ring-primary/50",
								)}
								autoFocus
							/>
						</div>
					</div>

					<div className="flex-1 overflow-y-auto p-2 min-h-[200px]">
						{isLoading ? (
							<div className="flex items-center justify-center h-full">
								<Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
							</div>
						) : error ? (
							<div className="flex items-center justify-center h-full">
								<p className="text-sm text-red-400">
									{error}
								</p>
							</div>
						) : filteredIssues.length === 0 ? (
							<div className="flex items-center justify-center h-full">
								<p className="text-sm text-muted-foreground/60">
									{search
										? "No matching issues found"
										: "All open issues are already on the board"}
								</p>
							</div>
						) : (
							<div className="space-y-1">
								{filteredIssues.map((issue) => (
									<button
										key={issue.number}
										onClick={() =>
											handleAddIssue(
												issue,
											)
										}
										disabled={
											addingIssue !==
											null
										}
										className={cn(
											"w-full flex items-start gap-3 p-3 rounded-md",
											"hover:bg-muted/50 transition-colors text-left",
											"disabled:opacity-50 disabled:cursor-not-allowed",
										)}
									>
										<CircleDot className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 mb-1">
												<span className="text-sm font-medium line-clamp-1">
													{
														issue.title
													}
												</span>
											</div>
											<div className="flex items-center gap-2 text-[10px] text-muted-foreground/60">
												<span className="font-mono">
													#
													{
														issue.number
													}
												</span>
												{issue.user && (
													<>
														<span>
															•
														</span>
														<span>
															{
																issue
																	.user
																	.login
															}
														</span>
													</>
												)}
												<span>
													•
												</span>
												<TimeAgo
													date={
														issue.updated_at
													}
												/>
											</div>
										</div>
										<div className="shrink-0">
											{addingIssue ===
											issue.number ? (
												<div className="flex items-center gap-1.5 text-xs text-muted-foreground">
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
													{generatingSummary
														? "Generating..."
														: "Adding..."}
												</div>
											) : (
												<Plus className="w-4 h-4 text-muted-foreground/40" />
											)}
										</div>
									</button>
								))}
							</div>
						)}
					</div>

					<div className="p-4 border-t border-border">
						<p className="text-xs text-muted-foreground/60 text-center">
							Select an issue to add it to the kanban
							board
						</p>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
