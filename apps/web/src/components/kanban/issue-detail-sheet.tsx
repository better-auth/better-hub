"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import {
	ExternalLink,
	Loader2,
	CircleDot,
	CheckCircle2,
	MessageCircle,
	Calendar,
	Tag,
	User,
	Milestone,
	Plus,
	Clock,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { TimeAgo } from "@/components/ui/time-ago";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { getIssueDetails, addIssueToKanban } from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";
import type { ActiveIssue } from "@/app/(app)/repos/[owner]/[repo]/kanban/actions";
import type { KanbanItem } from "@/lib/kanban-store";

interface IssueDetailSheetProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	owner: string;
	repo: string;
	issue: ActiveIssue | null;
	onIssueAddedToKanban?: (item: KanbanItem) => void;
}

interface IssueDetails {
	issue: {
		number: number;
		title: string;
		body: string | null;
		state: "open" | "closed";
		user: { login: string; avatar_url: string } | null;
		assignees: { login: string; avatar_url: string }[];
		labels: { name: string; color: string }[];
		created_at: string;
		updated_at: string;
		closed_at: string | null;
		comments: number;
		html_url: string;
		milestone: { title: string; description: string | null } | null;
	};
	comments: {
		id: number;
		body: string;
		user: { login: string; avatar_url: string } | null;
		created_at: string;
		updated_at: string;
		author_association: string;
	}[];
}

function LabelPill({ label }: { label: { name: string; color: string } }) {
	return (
		<span
			className="text-[10px] font-mono px-2 py-0.5 border rounded-full"
			style={{
				borderColor: `#${label.color}30`,
				color: `#${label.color}`,
				backgroundColor: `#${label.color}08`,
			}}
		>
			{label.name}
		</span>
	);
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-2">
			{children}
		</h3>
	);
}

export function IssueDetailSheet({
	open,
	onOpenChange,
	owner,
	repo,
	issue,
	onIssueAddedToKanban,
}: IssueDetailSheetProps) {
	const [details, setDetails] = useState<IssueDetails | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isAddingToKanban, setIsAddingToKanban] = useState(false);
	const scrollRef = useRef<HTMLDivElement>(null);

	const loadDetails = useCallback(async () => {
		if (!issue) return;

		setIsLoading(true);
		setError(null);
		setDetails(null);

		try {
			const data = await getIssueDetails(owner, repo, issue.number);
			setDetails(data);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to load issue details");
		} finally {
			setIsLoading(false);
		}
	}, [owner, repo, issue]);

	useEffect(() => {
		if (open && issue) {
			loadDetails();
		}
	}, [open, issue, loadDetails]);

	const handleAddToKanban = async () => {
		if (!issue) return;

		setIsAddingToKanban(true);
		try {
			const newItem = await addIssueToKanban(owner, repo, issue.number);
			onIssueAddedToKanban?.(newItem);
		} catch (e) {
			setError(e instanceof Error ? e.message : "Failed to add to kanban");
		} finally {
			setIsAddingToKanban(false);
		}
	};

	const issueData = details?.issue ?? issue;
	const isOpen = issueData?.state === "open";

	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				side="right"
				className="max-w-[50vw] w-full p-0 flex flex-col"
				showCloseButton={true}
				title={issueData?.title ?? "Issue Details"}
			>
				{!issue ? (
					<div className="flex-1 flex items-center justify-center">
						<p className="text-sm text-muted-foreground">
							No issue selected
						</p>
					</div>
				) : isLoading ? (
					<div className="flex-1 flex items-center justify-center">
						<Loader2 className="w-6 h-6 animate-spin text-muted-foreground/40" />
					</div>
				) : error ? (
					<div className="flex-1 flex items-center justify-center px-6">
						<p className="text-sm text-red-400 text-center">
							{error}
						</p>
					</div>
				) : (
					<>
						{/* Header */}
						<div className="shrink-0 p-4 border-b border-border">
							<div className="flex items-start justify-between gap-3 mb-3">
								<h2 className="text-base font-medium leading-snug pr-6">
									{issueData?.title}
									<span className="text-muted-foreground/50 font-normal ml-2">
										#{issueData?.number}
									</span>
								</h2>
							</div>

							<div className="flex items-center gap-2 flex-wrap">
								<span
									className={cn(
										"inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-full",
										isOpen
											? "bg-success/10 text-success"
											: "bg-purple-500/10 text-purple-400",
									)}
								>
									{isOpen ? (
										<CircleDot className="w-3.5 h-3.5" />
									) : (
										<CheckCircle2 className="w-3.5 h-3.5" />
									)}
									{isOpen ? "Open" : "Closed"}
								</span>

								{issueData?.user && (
									<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
										<Image
											src={
												issueData
													.user
													.avatar_url
											}
											alt={
												issueData
													.user
													.login
											}
											width={16}
											height={16}
											className="rounded-full"
										/>
										<span className="font-mono">
											{
												issueData
													.user
													.login
											}
										</span>
									</span>
								)}

								<span className="text-[11px] text-muted-foreground/50">
									opened{" "}
									<TimeAgo
										date={
											issueData?.created_at ??
											""
										}
									/>
								</span>

								<span className="text-[11px] text-muted-foreground/50 font-mono">
									{issueData?.comments ?? 0}{" "}
									comment
									{(issueData?.comments ??
										0) !== 1
										? "s"
										: ""}
								</span>
							</div>

							{/* Labels */}
							{issueData?.labels &&
								issueData.labels.length > 0 && (
									<div className="flex flex-wrap gap-1.5 mt-3">
										{issueData.labels.map(
											(label) => (
												<LabelPill
													key={
														label.name
													}
													label={
														label
													}
												/>
											),
										)}
									</div>
								)}

							{/* Actions */}
							<div className="flex items-center gap-2 mt-4">
								<button
									onClick={handleAddToKanban}
									disabled={
										isAddingToKanban ||
										issue.isOnKanban
									}
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors",
										issue.isOnKanban
											? "bg-muted/50 text-muted-foreground cursor-not-allowed"
											: "bg-primary text-primary-foreground hover:bg-primary/90",
									)}
								>
									{isAddingToKanban ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : issue.isOnKanban ? (
										<CheckCircle2 className="w-3.5 h-3.5" />
									) : (
										<Plus className="w-3.5 h-3.5" />
									)}
									{issue.isOnKanban
										? "On Board"
										: "Add to Board"}
								</button>
								<a
									href={issueData?.html_url}
									target="_blank"
									rel="noopener noreferrer"
									className={cn(
										"flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md",
										"border border-border",
										"text-muted-foreground hover:text-foreground hover:bg-muted/50",
										"transition-colors",
									)}
								>
									<ExternalLink className="w-3.5 h-3.5" />
									GitHub
								</a>
							</div>
						</div>

						{/* Content */}
						<div
							ref={scrollRef}
							className="flex-1 overflow-y-auto min-h-0"
						>
							<div className="flex flex-col lg:flex-row">
								{/* Main content */}
								<div className="flex-1 min-w-0 p-4">
									{/* Description */}
									<div className="mb-6">
										<SectionHeading>
											Description
										</SectionHeading>
										{details?.issue
											.body ? (
											<div className="border border-border/60 rounded-lg p-4 bg-card/30">
												<ClientMarkdown
													content={
														details
															.issue
															.body
													}
												/>
											</div>
										) : (
											<p className="text-sm text-muted-foreground/50 italic">
												No
												description
												provided.
											</p>
										)}
									</div>

									{/* Comments */}
									{details?.comments &&
										details.comments
											.length >
											0 && (
											<div>
												<SectionHeading>
													<span className="flex items-center gap-1">
														<MessageCircle className="w-2.5 h-2.5" />
														Comments
														(
														{
															details
																.comments
																.length
														}
														)
													</span>
												</SectionHeading>
												<div className="space-y-3">
													{details.comments.map(
														(
															comment,
														) => (
															<CommentCard
																key={
																	comment.id
																}
																comment={
																	comment
																}
															/>
														),
													)}
												</div>
											</div>
										)}
								</div>

								{/* Sidebar */}
								<div className="lg:w-64 shrink-0 p-4 lg:border-l border-t lg:border-t-0 border-border/40 bg-muted/10">
									{/* Assignees */}
									{details?.issue.assignees &&
										details.issue
											.assignees
											.length >
											0 && (
											<div className="mb-4">
												<SectionHeading>
													<span className="flex items-center gap-1">
														<User className="w-2.5 h-2.5" />
														Assignees
													</span>
												</SectionHeading>
												<div className="space-y-1.5">
													{details.issue.assignees.map(
														(
															a,
														) => (
															<div
																key={
																	a.login
																}
																className="flex items-center gap-2 text-xs text-foreground/70"
															>
																<Image
																	src={
																		a.avatar_url
																	}
																	alt={
																		a.login
																	}
																	width={
																		18
																	}
																	height={
																		18
																	}
																	className="rounded-full"
																/>
																<span className="font-mono truncate">
																	{
																		a.login
																	}
																</span>
															</div>
														),
													)}
												</div>
											</div>
										)}

									{/* Milestone */}
									{details?.issue
										.milestone && (
										<div className="mb-4">
											<SectionHeading>
												<span className="flex items-center gap-1">
													<Milestone className="w-2.5 h-2.5" />
													Milestone
												</span>
											</SectionHeading>
											<span className="text-xs text-foreground/70 font-mono block">
												{
													details
														.issue
														.milestone
														.title
												}
											</span>
											{details
												.issue
												.milestone
												.description && (
												<p className="text-[10px] text-muted-foreground/50 leading-relaxed mt-1 line-clamp-2">
													{
														details
															.issue
															.milestone
															.description
													}
												</p>
											)}
										</div>
									)}

									{/* Dates */}
									<div>
										<SectionHeading>
											<span className="flex items-center gap-1">
												<Calendar className="w-2.5 h-2.5" />
												Details
											</span>
										</SectionHeading>
										<div className="space-y-1.5">
											<div className="flex items-center justify-between text-xs">
												<span className="text-muted-foreground/50">
													Created
												</span>
												<span className="font-mono text-foreground/60 text-[11px]">
													<TimeAgo
														date={
															details
																?.issue
																.created_at ??
															issueData?.created_at ??
															""
														}
													/>
												</span>
											</div>
											<div className="flex items-center justify-between text-xs">
												<span className="text-muted-foreground/50">
													Updated
												</span>
												<span className="font-mono text-foreground/60 text-[11px]">
													<TimeAgo
														date={
															details
																?.issue
																.updated_at ??
															issueData?.updated_at ??
															""
														}
													/>
												</span>
											</div>
											{details
												?.issue
												.closed_at && (
												<div className="flex items-center justify-between text-xs">
													<span className="text-muted-foreground/50">
														Closed
													</span>
													<span className="font-mono text-foreground/60 text-[11px]">
														<TimeAgo
															date={
																details
																	.issue
																	.closed_at
															}
														/>
													</span>
												</div>
											)}
										</div>
									</div>
								</div>
							</div>
						</div>
					</>
				)}
			</SheetContent>
		</Sheet>
	);
}

function CommentCard({
	comment,
}: {
	comment: {
		id: number;
		body: string;
		user: { login: string; avatar_url: string } | null;
		created_at: string;
		author_association: string;
	};
}) {
	return (
		<div className="border border-border/60 rounded-lg overflow-hidden">
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border/60 bg-card/80">
				{comment.user ? (
					<>
						<Image
							src={comment.user.avatar_url}
							alt={comment.user.login}
							width={20}
							height={20}
							className="rounded-full"
						/>
						<span className="text-xs font-semibold text-foreground/90">
							{comment.user.login}
						</span>
					</>
				) : (
					<span className="text-xs font-semibold text-foreground/80">
						ghost
					</span>
				)}
				{comment.author_association &&
					comment.author_association !== "NONE" && (
						<span className="text-[9px] px-1.5 py-0.5 border border-border/60 text-muted-foreground/50 rounded font-medium">
							{comment.author_association.toLowerCase()}
						</span>
					)}
				<span className="text-[11px] text-muted-foreground/50">
					<TimeAgo date={comment.created_at} />
				</span>
			</div>
			<div className="px-3 py-3">
				{comment.body ? (
					<ClientMarkdown content={comment.body} />
				) : (
					<p className="text-sm text-muted-foreground/30 italic">
						No content.
					</p>
				)}
			</div>
		</div>
	);
}
