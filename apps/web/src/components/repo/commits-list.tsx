"use client";

import { noSSR } from "foxact/no-ssr";
import { useState, useTransition, useMemo, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { GitBranch, ChevronDown, Search, Check, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { fetchCommitsByDate } from "@/app/(app)/repos/[owner]/[repo]/commits/actions";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";

type Commit = {
	sha: string;
	commit: {
		message: string;
		author: {
			name?: string | null;
			date?: string | null;
		} | null;
	};
	author:
		| {
				login: string;
				avatar_url: string;
		  }
		| Record<string, never>
		| null;
	html_url: string;
};

interface CommitsListProps {
	owner: string;
	repo: string;
	commits: Commit[];
	defaultBranch: string;
	branches: { name: string }[];
}

function BranchPicker({
	branches,
	currentBranch,
	defaultBranch,
	onChange,
}: {
	branches: { name: string }[];
	currentBranch: string;
	defaultBranch: string;
	onChange: (branch: string) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (open) {
			setSearch("");
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [open]);

	const sorted = useMemo(() => {
		const list = [...branches].sort((a, b) => {
			if (a.name === defaultBranch) return -1;
			if (b.name === defaultBranch) return 1;
			return a.name.localeCompare(b.name);
		});
		if (!search) return list;
		const q = search.toLowerCase();
		return list.filter((b) => b.name.toLowerCase().includes(q));
	}, [branches, defaultBranch, search]);

	return (
		<div className="relative">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 px-3 py-2 text-[11px] font-mono border border-border hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer"
			>
				<GitBranch className="w-3 h-3 text-muted-foreground/70" />
				<span className="max-w-[140px] truncate">{currentBranch}</span>
				<ChevronDown className="w-3 h-3 text-muted-foreground/50" />
			</button>
			{open && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => {
							setOpen(false);
							setSearch("");
						}}
					/>
					<div className="absolute top-full left-0 mt-1 z-50 w-72 border border-border bg-card shadow-lg">
						<div className="p-2 border-b border-border">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
								<input
									ref={inputRef}
									type="text"
									placeholder="Find a branch..."
									value={search}
									onChange={(e) =>
										setSearch(
											e.target
												.value,
										)
									}
									className="w-full bg-transparent text-xs pl-7 pr-2 py-1.5 border border-border placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 transition-colors"
								/>
							</div>
						</div>
						<div className="max-h-60 overflow-y-auto">
							{sorted.map((b) => {
								const isActive =
									b.name === currentBranch;
								const isDefault =
									b.name === defaultBranch;
								return (
									<button
										key={b.name}
										onClick={() => {
											onChange(
												b.name,
											);
											setOpen(
												false,
											);
											setSearch(
												"",
											);
										}}
										className={cn(
											"w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer flex items-center gap-2",
											isActive &&
												"bg-muted/30",
										)}
									>
										<span className="w-3.5 shrink-0 flex items-center justify-center">
											{isActive && (
												<Check className="w-3 h-3 text-foreground" />
											)}
										</span>
										<span className="truncate flex-1">
											{b.name}
										</span>
										{isDefault && (
											<span className="text-[9px] text-muted-foreground/50 shrink-0">
												default
											</span>
										)}
									</button>
								);
							})}
							{sorted.length === 0 && (
								<div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50 font-mono">
									No branches found
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

function groupByDate(commits: Commit[]) {
	const groups: Record<string, Commit[]> = {};
	for (const commit of commits) {
		const date = commit.commit.author?.date;
		const key = date
			? new Date(date).toLocaleDateString("en-US", {
					month: "long",
					day: "numeric",
					year: "numeric",
				})
			: "Unknown date";
		if (!groups[key]) groups[key] = [];
		groups[key].push(commit);
	}
	return Object.entries(groups);
}

export function CommitsList({ owner, repo, commits, defaultBranch, branches }: CommitsListProps) {
	noSSR();
	const [search, setSearch] = useState("");
	const [copiedSha, setCopiedSha] = useState<string | null>(null);
	const [since, setSince] = useState("");
	const [until, setUntil] = useState("");
	const [currentBranch, setCurrentBranch] = useState(defaultBranch);
	const [displayedCommits, setDisplayedCommits] = useState<Commit[]>(commits);
	const [isPending, startTransition] = useTransition();

	const hasDateFilter = since !== "" || until !== "";

	useMutationSubscription(
		[
			"pr:merged",
			"pr:suggestion-committed",
			"pr:file-committed",
			"repo:file-committed",
		],
		(event: MutationEvent) => {
			if (!isRepoEvent(event, owner, repo)) return;
			startTransition(async () => {
				const result = await fetchCommitsByDate(
					owner,
					repo,
					since ? new Date(since).toISOString() : undefined,
					until ? new Date(until + "T23:59:59").toISOString() : undefined,
					currentBranch,
				);
				setDisplayedCommits(result as Commit[]);
			});
		},
	);

	const fetchCommits = (branch: string, newSince?: string, newUntil?: string) => {
		startTransition(async () => {
			const result = await fetchCommitsByDate(
				owner,
				repo,
				newSince ? new Date(newSince).toISOString() : undefined,
				newUntil
					? new Date(newUntil + "T23:59:59").toISOString()
					: undefined,
				branch,
			);
			setDisplayedCommits(result as Commit[]);
		});
	};

	const handleDateChange = (newSince: string, newUntil: string) => {
		if (!newSince && !newUntil && currentBranch === defaultBranch) {
			setDisplayedCommits(commits);
			return;
		}
		fetchCommits(currentBranch, newSince, newUntil);
	};

	const handleBranchChange = (branch: string) => {
		setCurrentBranch(branch);
		if (branch === defaultBranch && !since && !until) {
			setDisplayedCommits(commits);
		} else {
			fetchCommits(branch, since, until);
		}
	};

	const clearDates = () => {
		setSince("");
		setUntil("");
		if (currentBranch === defaultBranch) {
			setDisplayedCommits(commits);
		} else {
			fetchCommits(currentBranch);
		}
	};

	const filtered = search
		? displayedCommits.filter((c) =>
				c.commit.message.toLowerCase().includes(search.toLowerCase()),
			)
		: displayedCommits;

	const grouped = groupByDate(filtered);

	const copySha = (sha: string) => {
		navigator.clipboard.writeText(sha);
		setCopiedSha(sha);
		setTimeout(() => setCopiedSha(null), 2000);
	};

	return (
		<div className="space-y-4">
			<div className="flex items-center gap-2">
				<BranchPicker
					branches={branches}
					currentBranch={currentBranch}
					defaultBranch={defaultBranch}
					onChange={handleBranchChange}
				/>
				<div className="relative flex-1">
					<input
						type="text"
						placeholder="Search commits..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full rounded-md border border-border bg-background px-3 py-2 pl-9 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-ring"
					/>
					<svg
						className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/50"
						width="14"
						height="14"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<circle cx="11" cy="11" r="8" />
						<line x1="21" y1="21" x2="16.65" y2="16.65" />
					</svg>
				</div>
				<input
					type="date"
					value={since}
					onChange={(e) => {
						setSince(e.target.value);
						handleDateChange(e.target.value, until);
					}}
					title="Since date"
					className="rounded-md border border-border bg-background px-2 py-2 font-mono text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				<input
					type="date"
					value={until}
					onChange={(e) => {
						setUntil(e.target.value);
						handleDateChange(since, e.target.value);
					}}
					title="Until date"
					className="rounded-md border border-border bg-background px-2 py-2 font-mono text-xs text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
				/>
				{hasDateFilter && (
					<button
						onClick={clearDates}
						title="Clear date filters"
						className="rounded-md border border-border bg-background px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground cursor-pointer"
					>
						✕
					</button>
				)}
			</div>

			{isPending && (
				<div className="py-4 text-center text-xs text-muted-foreground">
					Loading commits...
				</div>
			)}

			{!isPending && grouped.length === 0 && (
				<div className="py-12 text-center text-sm text-muted-foreground">
					No commits found.
				</div>
			)}

			{grouped.map(([date, dateCommits]) => (
				<div key={date}>
					<p className="mb-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground/70">
						Commits on {date}
					</p>
					<div className="overflow-hidden rounded-md border border-border">
						{dateCommits.map((commit, i) => {
							const firstLine =
								commit.commit.message.split(
									"\n",
								)[0];
							const login = commit.author?.login;
							const avatarUrl = commit.author?.avatar_url;
							const shortSha = commit.sha.slice(0, 7);

							return (
								<div
									key={commit.sha}
									className={cn(
										"flex items-start gap-3 px-4 py-3",
										i > 0 &&
											"border-t border-border",
									)}
								>
									{avatarUrl ? (
										<Link
											href={`/${login}`}
											className="mt-0.5 shrink-0"
										>
											<Image
												src={
													avatarUrl
												}
												alt={
													login ??
													""
												}
												width={
													24
												}
												height={
													24
												}
												className="rounded-full"
											/>
										</Link>
									) : (
										<div className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-muted" />
									)}

									<div className="min-w-0 flex-1">
										<Link
											href={`/${owner}/${repo}/commits/${commit.sha}`}
											className="text-sm font-medium text-foreground hover:text-info line-clamp-1"
										>
											{firstLine}
										</Link>
										<p className="mt-0.5 text-xs text-muted-foreground">
											{login ? (
												<Link
													href={`/${login}`}
													className="hover:underline"
												>
													{
														login
													}
												</Link>
											) : (
												(commit
													.commit
													.author
													?.name ??
												"Unknown")
											)}
											{commit
												.commit
												.author
												?.date && (
												<>
													{" "}
													·{" "}
													<TimeAgo
														date={
															commit
																.commit
																.author
																.date
														}
													/>
												</>
											)}
										</p>
									</div>

									<button
										onClick={() =>
											copySha(
												commit.sha,
											)
										}
										title="Copy full SHA"
										className="mt-0.5 shrink-0 cursor-pointer rounded px-1.5 py-0.5 font-mono text-xs text-muted-foreground transition-colors hover:bg-muted"
									>
										{copiedSha ===
										commit.sha
											? "Copied!"
											: shortSha}
									</button>
								</div>
							);
						})}
					</div>
				</div>
			))}
		</div>
	);
}
