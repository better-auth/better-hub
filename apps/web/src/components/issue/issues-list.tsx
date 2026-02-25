"use client";

import { useState, useEffect, useMemo, useCallback, useTransition, useRef } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import {
	CircleDot,
	CheckCircle2,
	MessageSquare,
	Clock,
	X,
	ThumbsUp,
	ArrowUpDown,
	SlidersHorizontal,
	Search,
	CircleSlash,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { CreateIssueDialog } from "./create-issue-dialog";
import { useClickOutside } from "@/hooks/use-click-outside";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";
import { useInfiniteScroll } from "@/hooks/use-infinite-scroll";
import { InfiniteScrollSentinel, LoadingOverlay } from "@/components/shared/list-controls";
import { LabelBadge } from "@/components/shared/label-badge";
import { useGlobalChat } from "@/components/shared/global-chat-provider";
import { Zap, GitPullRequest } from "lucide-react";

interface IssueUser {
	login: string;
	avatar_url: string;
}

interface Issue {
	id: number;
	number: number;
	title: string;
	state: string;
	state_reason?: string | null;
	updated_at: string;
	created_at: string;
	closed_at: string | null;
	comments: number;
	user: IssueUser | null;
	labels: Array<string | { name?: string; color?: string | null }>;
	assignees: IssueUser[];
	milestone: { title: string } | null;
	reactions: { total_count: number; "+1": number };
	pull_request?: { url?: string; html_url?: string } | null;
}

type TabState = "open" | "closed" | "not_planned";

type SortType = "updated" | "newest" | "oldest" | "comments" | "reactions";
type AssigneeFilter = "all" | "assigned" | "unassigned";
type ActivityFilter = "all" | "most-active" | "no-response" | "quiet";

const sortLabels: Record<SortType, string> = {
	updated: "Updated",
	newest: "Newest",
	oldest: "Oldest",
	comments: "Comments",
	reactions: "Reactions",
};

const sortCycle: SortType[] = ["updated", "newest", "oldest", "comments", "reactions"];

export function IssuesList({
	owner,
	repo,
	openIssues,
	closedIssues,
	openCount,
	closedCount,
	onAuthorFilter,
}: {
	owner: string;
	repo: string;
	openIssues: Issue[];
	closedIssues: Issue[];
	openCount: number;
	closedCount: number;
	onAuthorFilter?: (
		owner: string,
		repo: string,
		author: string,
	) => Promise<{ open: Issue[]; closed: Issue[] }>;
}) {
	const searchParams = useSearchParams();
	const tabParam = searchParams.get("tab");
	const initialTab: TabState =
		tabParam === "closed" || tabParam === "not_planned" ? tabParam : "open";
	const [state, setState] = useState<TabState>(initialTab);
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortType>("updated");
	const [selectedAuthor, setSelectedAuthor] = useState<string | null>(null);
	const [authorSearch, setAuthorSearch] = useState("");
	const [authorDropdownOpen, setAuthorDropdownOpen] = useState(false);
	const authorRef = useRef<HTMLDivElement>(null);
	const [selectedLabel, setSelectedLabel] = useState<string | null>(null);
	const [authorIssues, setAuthorIssues] = useState<{
		open: Issue[];
		closed: Issue[];
	} | null>(null);
	const [isPending, startTransition] = useTransition();
	const [filtersOpen, setFiltersOpen] = useState(false);
	const filtersRef = useRef<HTMLDivElement>(null);
	const [assigneeFilter, setAssigneeFilter] = useState<AssigneeFilter>("all");
	const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
	const [selectedMilestone, setSelectedMilestone] = useState<string | null>(null);
	const { openChat } = useGlobalChat();

	const [countAdjustments, setCountAdjustments] = useState({ open: 0, closed: 0 });

	useEffect(() => {
		setCountAdjustments({ open: 0, closed: 0 });
	}, [openIssues, closedIssues]);

	useMutationSubscription(
		["issue:closed", "issue:reopened", "issue:created"],
		(event: MutationEvent) => {
			if (!isRepoEvent(event, owner, repo)) return;
			setCountAdjustments((prev) => {
				switch (event.type) {
					case "issue:closed":
						return {
							...prev,
							open: prev.open - 1,
							closed: prev.closed + 1,
						};
					case "issue:reopened":
						return {
							...prev,
							open: prev.open + 1,
							closed: prev.closed - 1,
						};
					case "issue:created":
						return { ...prev, open: prev.open + 1 };
					default:
						return prev;
				}
			});
		},
	);

	const allIssues = useMemo(
		() => [...openIssues, ...closedIssues],
		[openIssues, closedIssues],
	);

	const authors = useMemo(() => {
		const seen = new Map<string, IssueUser>();
		for (const issue of allIssues) {
			if (issue.user && !seen.has(issue.user.login)) {
				seen.set(issue.user.login, issue.user);
			}
		}
		return [...seen.values()];
	}, [allIssues]);

	const filteredAuthors = useMemo(() => {
		if (!authorSearch) return authors.slice(0, 8);
		const q = authorSearch.toLowerCase();
		return authors.filter((a) => a.login.toLowerCase().includes(q)).slice(0, 8);
	}, [authors, authorSearch]);

	const selectedAuthorData = useMemo(
		() => authors.find((a) => a.login === selectedAuthor) ?? null,
		[authors, selectedAuthor],
	);

	useClickOutside(
		authorRef,
		useCallback(() => setAuthorDropdownOpen(false), []),
	);
	useClickOutside(
		filtersRef,
		useCallback(() => setFiltersOpen(false), []),
	);

	const labels = useMemo(() => {
		const seen = new Map<string, { name: string; color: string }>();
		for (const issue of allIssues) {
			for (const label of issue.labels) {
				const name = typeof label === "string" ? label : label.name;
				const color =
					typeof label === "string" ? "888" : label.color || "888";
				if (name && !seen.has(name)) {
					seen.set(name, { name, color });
				}
			}
		}
		return [...seen.values()].slice(0, 10);
	}, [allIssues]);

	const milestones = useMemo(() => {
		const seen = new Set<string>();
		for (const issue of allIssues) {
			if (issue.milestone?.title) seen.add(issue.milestone.title);
		}
		return [...seen].slice(0, 8);
	}, [allIssues]);

	const activeFilterCount =
		(assigneeFilter !== "all" ? 1 : 0) +
		(activityFilter !== "all" ? 1 : 0) +
		(selectedMilestone ? 1 : 0) +
		(selectedAuthor ? 1 : 0) +
		(selectedLabel ? 1 : 0);

	const clearAllFilters = () => {
		setSearch("");
		setSelectedAuthor(null);
		setAuthorSearch("");
		setAuthorIssues(null);
		setSelectedLabel(null);
		setAssigneeFilter("all");
		setActivityFilter("all");
		setSelectedMilestone(null);
	};

	const currentOpenIssues = authorIssues ? authorIssues.open : openIssues;
	const currentClosedIssues = authorIssues ? authorIssues.closed : closedIssues;

	const closedCompleted = useMemo(
		() => currentClosedIssues.filter((i) => i.state_reason !== "not_planned"),
		[currentClosedIssues],
	);
	const closedNotPlanned = useMemo(
		() => currentClosedIssues.filter((i) => i.state_reason === "not_planned"),
		[currentClosedIssues],
	);

	const baseIssues =
		state === "open"
			? currentOpenIssues
			: state === "closed"
				? closedCompleted
				: closedNotPlanned;

	const filtered = useMemo(() => {
		const q = search.toLowerCase();
		return baseIssues
			.filter((issue) => {
				if (q) {
					const matchesNumber = q.startsWith("#")
						? issue.number.toString().startsWith(q.slice(1))
						: false;
					const matchesSearch =
						matchesNumber ||
						issue.title.toLowerCase().includes(q) ||
						issue.user?.login.toLowerCase().includes(q) ||
						issue.labels.some((l) =>
							(typeof l === "string" ? l : l.name)
								?.toLowerCase()
								.includes(q),
						) ||
						(issue.milestone?.title
							?.toLowerCase()
							.includes(q) ??
							false);
					if (!matchesSearch) return false;
				}
				if (
					!authorIssues &&
					selectedAuthor &&
					issue.user?.login !== selectedAuthor
				)
					return false;
				if (
					selectedLabel &&
					!issue.labels.some(
						(l) =>
							(typeof l === "string" ? l : l.name) ===
							selectedLabel,
					)
				)
					return false;
				if (
					assigneeFilter === "assigned" &&
					(issue.assignees?.length ?? 0) === 0
				)
					return false;
				if (
					assigneeFilter === "unassigned" &&
					(issue.assignees?.length ?? 0) > 0
				)
					return false;
				if (activityFilter === "most-active" && (issue.comments ?? 0) < 5)
					return false;
				if (activityFilter === "no-response" && (issue.comments ?? 0) > 0)
					return false;
				if (activityFilter === "quiet" && (issue.comments ?? 0) > 2)
					return false;
				if (
					selectedMilestone &&
					issue.milestone?.title !== selectedMilestone
				)
					return false;
				return true;
			})
			.sort((a, b) => {
				switch (sort) {
					case "newest":
						return (
							new Date(b.created_at).getTime() -
							new Date(a.created_at).getTime()
						);
					case "oldest":
						return (
							new Date(a.created_at).getTime() -
							new Date(b.created_at).getTime()
						);
					case "comments":
						return (b.comments ?? 0) - (a.comments ?? 0);
					case "reactions":
						return (
							(b.reactions?.total_count ?? 0) -
							(a.reactions?.total_count ?? 0)
						);
					default:
						return (
							new Date(b.updated_at).getTime() -
							new Date(a.updated_at).getTime()
						);
				}
			});
	}, [
		baseIssues,
		search,
		sort,
		selectedAuthor,
		selectedLabel,
		assigneeFilter,
		activityFilter,
		selectedMilestone,
		authorIssues,
	]);

	const { visible, hasMore, loadMore, sentinelRef } = useInfiniteScroll(filtered, [
		state,
		search,
		sort,
		selectedAuthor,
		selectedLabel,
		assigneeFilter,
		activityFilter,
		selectedMilestone,
	]);

	return (
		<div>
			{/* Toolbar */}
			<div className="sticky top-0 z-10 bg-background pb-3 pt-4 before:content-[''] before:absolute before:left-0 before:right-0 before:bottom-full before:h-8 before:bg-background">
				{/* Row 1: Search + Sort + Filter + New Issue */}
				<div className="flex items-center gap-2 mb-3 flex-wrap">
					<div className="relative flex-1 max-w-sm">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
						<input
							type="text"
							placeholder="Search issues..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full h-8 bg-transparent border border-border rounded-lg pl-9 pr-4 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-colors"
						/>
					</div>

					<button
						onClick={() =>
							setSort(
								sortCycle[
									(sortCycle.indexOf(sort) +
										1) %
										sortCycle.length
								],
							)
						}
						className={cn(
							"flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							sort !== "updated"
								? "border-foreground/20 bg-muted/50 dark:bg-white/4 text-foreground"
								: "border-border text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/3",
						)}
					>
						<ArrowUpDown className="w-3 h-3" />
						{sortLabels[sort]}
					</button>

					<div ref={filtersRef} className="relative">
						<button
							onClick={() => setFiltersOpen((v) => !v)}
							className={cn(
								"flex items-center gap-1.5 h-8 px-3 rounded-lg border text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
								filtersOpen || activeFilterCount > 0
									? "border-foreground/20 bg-muted/50 dark:bg-white/4 text-foreground"
									: "border-border text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/3",
							)}
						>
							<SlidersHorizontal className="w-3 h-3" />
							Filters
							{activeFilterCount > 0 && (
								<span className="flex items-center justify-center w-4 h-4 rounded-full bg-foreground/10 text-[9px] font-mono text-foreground">
									{activeFilterCount}
								</span>
							)}
						</button>

						{filtersOpen && (
							<div className="absolute z-30 top-full right-0 mt-2 w-[calc(100vw-2rem)] sm:w-72 border border-border/60 bg-background shadow-xl rounded-xl overflow-hidden">
								{/* Activity */}
								<div className="px-3.5 pt-3 pb-2.5">
									<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
										Activity
									</span>
									<div className="flex flex-wrap gap-1 mt-2">
										{(
											[
												[
													"all",
													"All",
												],
												[
													"most-active",
													"Active",
												],
												[
													"no-response",
													"No Response",
												],
												[
													"quiet",
													"Quiet",
												],
											] as [
												ActivityFilter,
												string,
											][]
										).map(
											([
												value,
												label,
											]) => (
												<button
													key={
														value
													}
													onClick={() =>
														setActivityFilter(
															value,
														)
													}
													className={cn(
														"px-2.5 py-1 text-[10px] font-mono rounded-md transition-colors cursor-pointer",
														activityFilter ===
															value
															? "bg-foreground/8 text-foreground"
															: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
													)}
												>
													{
														label
													}
												</button>
											),
										)}
									</div>
								</div>

								<div className="border-t border-border/30 mx-3" />

								{/* Assignee */}
								<div className="px-3.5 pt-2.5 pb-2.5">
									<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
										Assignee
									</span>
									<div className="flex flex-wrap gap-1 mt-2">
										{(
											[
												[
													"all",
													"All",
												],
												[
													"assigned",
													"Assigned",
												],
												[
													"unassigned",
													"Unassigned",
												],
											] as [
												AssigneeFilter,
												string,
											][]
										).map(
											([
												value,
												label,
											]) => (
												<button
													key={
														value
													}
													onClick={() =>
														setAssigneeFilter(
															value,
														)
													}
													className={cn(
														"px-2.5 py-1 text-[10px] font-mono rounded-md transition-colors cursor-pointer",
														assigneeFilter ===
															value
															? "bg-foreground/8 text-foreground"
															: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
													)}
												>
													{
														label
													}
												</button>
											),
										)}
									</div>
								</div>

								<div className="border-t border-border/30 mx-3" />

								{/* Author */}
								<div className="px-3.5 pt-2.5 pb-2.5">
									<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
										Author
									</span>
									<div
										className="mt-2"
										ref={authorRef}
									>
										{selectedAuthor &&
										selectedAuthorData ? (
											<button
												onClick={() => {
													setSelectedAuthor(
														null,
													);
													setAuthorSearch(
														"",
													);
													setAuthorIssues(
														null,
													);
												}}
												className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono rounded-md bg-foreground/8 text-foreground transition-colors cursor-pointer"
											>
												<Image
													src={
														selectedAuthorData.avatar_url
													}
													alt={
														selectedAuthorData.login
													}
													width={
														14
													}
													height={
														14
													}
													className="rounded-full"
												/>
												{
													selectedAuthorData.login
												}
												<X className="w-2.5 h-2.5 text-muted-foreground/50" />
											</button>
										) : (
											<div className="relative">
												<input
													type="text"
													placeholder="Search authors..."
													value={
														authorSearch
													}
													onChange={(
														e,
													) => {
														setAuthorSearch(
															e
																.target
																.value,
														);
														setAuthorDropdownOpen(
															true,
														);
													}}
													onFocus={() =>
														setAuthorDropdownOpen(
															true,
														)
													}
													className="w-full bg-transparent border-b border-border/40 px-1 py-1 text-[10px] font-mono placeholder:text-muted-foreground/40 focus:outline-none focus:border-foreground/20 transition-colors"
												/>
												{authorDropdownOpen &&
													filteredAuthors.length >
														0 && (
														<div className="absolute z-40 top-full left-0 mt-1 w-full border border-border/60 bg-background shadow-lg max-h-36 overflow-y-auto rounded-lg">
															{filteredAuthors.map(
																(
																	author,
																) => (
																	<button
																		key={
																			author.login
																		}
																		onClick={() => {
																			setSelectedAuthor(
																				author.login,
																			);
																			setAuthorSearch(
																				"",
																			);
																			setAuthorDropdownOpen(
																				false,
																			);
																			if (
																				onAuthorFilter
																			) {
																				startTransition(
																					async () => {
																						const result =
																							await onAuthorFilter(
																								owner,
																								repo,
																								author.login,
																							);
																						setAuthorIssues(
																							result as {
																								open: Issue[];
																								closed: Issue[];
																							},
																						);
																					},
																				);
																			}
																		}}
																		className="flex items-center gap-2 w-full px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground hover:bg-muted/50 dark:hover:bg-white/3 hover:text-foreground transition-colors cursor-pointer"
																	>
																		<Image
																			src={
																				author.avatar_url
																			}
																			alt={
																				author.login
																			}
																			width={
																				14
																			}
																			height={
																				14
																			}
																			className="rounded-full"
																		/>
																		{
																			author.login
																		}
																	</button>
																),
															)}
														</div>
													)}
											</div>
										)}
									</div>
								</div>

								{/* Labels */}
								{labels.length > 0 && (
									<>
										<div className="border-t border-border/30 mx-3" />
										<div className="px-3.5 pt-2.5 pb-2.5">
											<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
												Label
											</span>
											<div className="flex flex-wrap gap-1 mt-2">
												{labels.map(
													(
														label,
													) => (
														<button
															key={
																label.name
															}
															onClick={() =>
																setSelectedLabel(
																	(
																		l,
																	) =>
																		l ===
																		label.name
																			? null
																			: label.name,
																)
															}
															className={cn(
																"flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono rounded-md transition-colors cursor-pointer",
																selectedLabel ===
																	label.name
																	? "bg-foreground/8 text-foreground"
																	: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
															)}
														>
															<span
																className="w-2 h-2 rounded-full shrink-0"
																style={{
																	backgroundColor: `#${label.color}`,
																}}
															/>
															{
																label.name
															}
														</button>
													),
												)}
											</div>
										</div>
									</>
								)}

								{/* Milestone */}
								{milestones.length > 0 && (
									<>
										<div className="border-t border-border/30 mx-3" />
										<div className="px-3.5 pt-2.5 pb-2.5">
											<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/40">
												Milestone
											</span>
											<div className="flex flex-wrap gap-1 mt-2">
												{milestones.map(
													(
														ms,
													) => (
														<button
															key={
																ms
															}
															onClick={() =>
																setSelectedMilestone(
																	(
																		m,
																	) =>
																		m ===
																		ms
																			? null
																			: ms,
																)
															}
															className={cn(
																"px-2.5 py-1 text-[10px] font-mono rounded-md transition-colors cursor-pointer",
																selectedMilestone ===
																	ms
																	? "bg-foreground/8 text-foreground"
																	: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
															)}
														>
															{
																ms
															}
														</button>
													),
												)}
											</div>
										</div>
									</>
								)}

								{/* Clear all */}
								{activeFilterCount > 0 && (
									<>
										<div className="border-t border-border/30 mx-3" />
										<button
											onClick={() => {
												clearAllFilters();
												setFiltersOpen(
													false,
												);
											}}
											className="flex items-center gap-1.5 w-full px-3.5 py-2.5 text-[10px] font-mono text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer"
										>
											<X className="w-3 h-3" />
											Clear all
											filters
										</button>
									</>
								)}
							</div>
						)}
					</div>

					{activeFilterCount > 0 && (
						<button
							onClick={clearAllFilters}
							className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
						>
							<X className="w-3 h-3" />
							Clear
						</button>
					)}

					<div className="ml-auto flex items-center gap-2">
						<button
							onClick={() => {
								openChat({
									chatType: "general",
									contextKey: `${owner}/${repo}`,
									contextBody: {},
									placeholder:
										"Describe the change you want Ghost to implement...",
									emptyTitle: "Run with Ghost",
									emptyDescription:
										"Ghost will analyze the repo, make changes, and open a PR with the full conversation.",
								});
							}}
							className="flex items-center gap-1.5 h-8 px-3 rounded-lg border text-xs font-medium transition-colors cursor-pointer border-border text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/3"
						>
							<Zap className="w-3 h-3" />
							Run with Ghost
						</button>
						<CreateIssueDialog owner={owner} repo={repo} />
					</div>
				</div>

				{/* Row 2: State tabs */}
				<div className="flex items-center border-b border-border/40">
					{[
						{
							key: "open" as TabState,
							label: "Open",
							icon: <CircleDot className="w-3 h-3" />,
							count:
								currentOpenIssues.length +
								countAdjustments.open,
						},
						{
							key: "closed" as TabState,
							label: "Closed",
							icon: <CheckCircle2 className="w-3 h-3" />,
							count:
								closedCompleted.length +
								countAdjustments.closed,
						},
						{
							key: "not_planned" as TabState,
							label: "Not Planned",
							icon: <CircleSlash className="w-3 h-3" />,
							count: closedNotPlanned.length,
						},
					].map((tab) => (
						<button
							key={tab.key}
							onClick={() => {
								setState(tab.key);
								const url = new URL(
									window.location.href,
								);
								if (tab.key === "open") {
									url.searchParams.delete(
										"tab",
									);
								} else {
									url.searchParams.set(
										"tab",
										tab.key,
									);
								}
								window.history.replaceState(
									null,
									"",
									url.toString(),
								);
							}}
							className={cn(
								"relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[12px] transition-colors cursor-pointer",
								state === tab.key
									? "text-foreground"
									: "text-muted-foreground/50 hover:text-foreground/70",
							)}
						>
							{tab.icon}
							<span className="hidden sm:inline">
								{tab.label}
							</span>
							<span
								className={cn(
									"text-[10px] tabular-nums font-mono",
									state === tab.key
										? "text-foreground/50"
										: "text-muted-foreground/30",
								)}
							>
								{tab.count}
							</span>
							{state === tab.key && (
								<span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* Issue List */}
			<div className="relative flex-1 min-h-0 overflow-y-auto divide-y divide-border">
				<LoadingOverlay show={isPending} />
				{visible.map((issue) => {
					const reactionCount = issue.reactions?.["+1"] ?? 0;

					return (
						<Link
							key={issue.id}
							href={`/${owner}/${repo}/issues/${issue.number}`}
							className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
						>
							{issue.state === "open" ? (
								<CircleDot className="w-3.5 h-3.5 shrink-0 mt-0.5 text-success" />
							) : (
								<CheckCircle2 className="w-3.5 h-3.5 shrink-0 mt-0.5 text-alert-important" />
							)}
							<div className="flex-1 min-w-0">
								{/* Row 1: Title + Milestone badge + Labels + Assignee avatars */}
								<div className="flex items-center gap-2 flex-wrap">
									<span className="text-sm truncate group-hover:text-foreground transition-colors">
										{issue.title}
									</span>
									{issue.milestone && (
										<span className="text-[9px] font-mono px-1.5 py-0.5 border border-border/60 text-muted-foreground/70 shrink-0">
											{
												issue
													.milestone
													.title
											}
										</span>
									)}
									{issue.labels
										.map((l) =>
											typeof l ===
											"string"
												? {
														name: l,
														color: "888",
													}
												: l,
										)
										.filter(
											(l) =>
												l.name,
										)
										.slice(0, 3)
										.map((label) => (
											<LabelBadge
												key={
													label.name
												}
												label={
													label
												}
											/>
										))}
									{/* Assignee avatars — far right */}
									{(issue.assignees?.length ??
										0) > 0 && (
										<span className="flex items-center ml-auto shrink-0 -space-x-1.5">
											{(
												issue.assignees ??
												[]
											)
												.slice(
													0,
													3,
												)
												.map(
													(
														a,
													) => (
														<Image
															key={
																a.login
															}
															src={
																a.avatar_url
															}
															alt={
																a.login
															}
															width={
																16
															}
															height={
																16
															}
															className="rounded-full border border-border"
															title={`Assignee: ${a.login}`}
														/>
													),
												)}
										</span>
									)}
								</div>

								{/* Row 2: Author avatar + login + opened X ago */}
								<div className="flex items-center gap-3 mt-1">
									{issue.user && (
										<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
											<Image
												src={
													issue
														.user
														.avatar_url
												}
												alt={
													issue
														.user
														.login
												}
												width={
													14
												}
												height={
													14
												}
												className="rounded-full"
											/>
											<span className="font-mono text-[10px]">
												{
													issue
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
												issue.created_at
											}
										/>
									</span>
								</div>

								{/* Row 3: #number + updated X ago + comments + reactions */}
								<div className="flex items-center gap-3 mt-1">
									<span className="text-[11px] font-mono text-muted-foreground/70">
										#{issue.number}
									</span>
									{issue.pull_request && (
										<span className="flex items-center gap-1 text-[11px] text-purple-400/70 font-mono">
											<GitPullRequest className="w-3 h-3" />
											Linked PR
										</span>
									)}
									<span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
										<Clock className="w-3 h-3" />
										<TimeAgo
											date={
												issue.updated_at
											}
										/>
									</span>
									<span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
										<MessageSquare className="w-3 h-3" />
										{issue.comments ??
											0}
									</span>
									{reactionCount > 0 && (
										<span className="flex items-center gap-1 text-[11px] text-muted-foreground/50">
											<ThumbsUp className="w-3 h-3" />
											{
												reactionCount
											}
										</span>
									)}
								</div>
							</div>
						</Link>
					);
				})}

				<InfiniteScrollSentinel
					sentinelRef={sentinelRef}
					hasMore={hasMore}
					loadMore={loadMore}
					remaining={filtered.length - visible.length}
				/>

				{filtered.length === 0 && (
					<div className="py-16 text-center">
						<CircleDot className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
						<p className="text-xs text-muted-foreground font-mono">
							{search || activeFilterCount > 0
								? "No issues match your filters"
								: `No ${state} issues`}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
