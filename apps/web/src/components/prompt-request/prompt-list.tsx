"use client";

import { useState, useMemo, useTransition, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
	Ghost,
	GitPullRequest,
	Sparkles,
	X,
	Loader2,
	Search,
	ArrowUpDown,
	CircleDot,
	CheckCircle2,
	XCircle,
	Zap,
	ChevronDown,
	MessageSquarePlus,
	Play,
	FileText,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { useGlobalChat } from "@/components/shared/global-chat-provider";
import { rejectPromptRequest } from "@/app/(app)/repos/[owner]/[repo]/prompts/actions";
import { SuggestPromptDialog } from "@/components/prompt-request/suggest-prompt-dialog";
import type { PromptRequest, PromptRequestStatus } from "@/lib/prompt-request-store";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";

type StatusTab = "open" | "completed" | "rejected";
type SortType = "newest" | "oldest" | "updated";

const sortLabels: Record<SortType, string> = {
	newest: "Newest",
	oldest: "Oldest",
	updated: "Updated",
};

const sortCycle: SortType[] = ["newest", "oldest", "updated"];

const statusColors: Record<PromptRequestStatus, string> = {
	open: "bg-green-500/15 text-green-400",
	processing: "bg-yellow-500/15 text-yellow-400",
	completed: "bg-purple-500/15 text-purple-400",
	rejected: "bg-red-500/15 text-red-400",
};

const statusLabels: Record<PromptRequestStatus, string> = {
	open: "Open",
	processing: "Processing",
	completed: "Completed",
	rejected: "Rejected",
};

interface PromptListProps {
	owner: string;
	repo: string;
	promptRequests: PromptRequest[];
}

export function PromptList({ owner, repo, promptRequests }: PromptListProps) {
	const [tab, setTab] = useState<StatusTab>("open");
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortType>("newest");
	const { openChat } = useGlobalChat();
	const router = useRouter();
	const [closingId, setClosingId] = useState<string | null>(null);
	const [, startTransition] = useTransition();
	const [newMenuOpen, setNewMenuOpen] = useState(false);
	const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);
	const newMenuRef = useRef<HTMLDivElement>(null);

	const [countAdjustments, setCountAdjustments] = useState({ open: 0, rejected: 0 });
	const { emit } = useMutationEvents();

	useEffect(() => {
		if (!newMenuOpen) return;
		const handle = (e: MouseEvent) => {
			if (newMenuRef.current && !newMenuRef.current.contains(e.target as Node)) {
				setNewMenuOpen(false);
			}
		};
		document.addEventListener("mousedown", handle);
		return () => document.removeEventListener("mousedown", handle);
	}, [newMenuOpen]);

	useEffect(() => {
		setCountAdjustments({ open: 0, rejected: 0 });
	}, [promptRequests]);

	useMutationSubscription(["prompt:rejected", "prompt:created"], (event: MutationEvent) => {
		if (!isRepoEvent(event, owner, repo)) return;
		setCountAdjustments((prev) => {
			switch (event.type) {
				case "prompt:rejected":
					return {
						...prev,
						open: prev.open - 1,
						rejected: prev.rejected + 1,
					};
				case "prompt:created":
					return { ...prev, open: prev.open + 1 };
				default:
					return prev;
			}
		});
	});

	const counts = useMemo(() => {
		const c = { open: 0, completed: 0, rejected: 0 };
		for (const pr of promptRequests) {
			if (pr.status === "open" || pr.status === "processing") c.open++;
			else if (pr.status === "completed") c.completed++;
			else if (pr.status === "rejected") c.rejected++;
		}
		return c;
	}, [promptRequests]);

	const filtered = useMemo(() => {
		let list = promptRequests.filter((pr) => {
			if (tab === "open")
				return pr.status === "open" || pr.status === "processing";
			return pr.status === tab;
		});

		if (search) {
			const q = search.toLowerCase();
			list = list.filter(
				(pr) =>
					pr.title.toLowerCase().includes(q) ||
					pr.body.toLowerCase().includes(q),
			);
		}

		return list.sort((a, b) => {
			switch (sort) {
				case "oldest":
					return (
						new Date(a.createdAt).getTime() -
						new Date(b.createdAt).getTime()
					);
				case "updated":
					return (
						new Date(b.updatedAt).getTime() -
						new Date(a.updatedAt).getTime()
					);
				default: // newest
					return (
						new Date(b.createdAt).getTime() -
						new Date(a.createdAt).getTime()
					);
			}
		});
	}, [promptRequests, tab, search, sort]);

	const handleClose = async (e: React.MouseEvent, id: string) => {
		e.preventDefault();
		e.stopPropagation();
		setClosingId(id);
		try {
			await rejectPromptRequest(id);
			emit({ type: "prompt:rejected", owner, repo });
			startTransition(() => router.refresh());
		} finally {
			setClosingId(null);
		}
	};

	const tabItems: { key: StatusTab; label: string; icon: React.ReactNode; count: number }[] =
		[
			{
				key: "open",
				label: "Open",
				icon: <CircleDot className="w-3 h-3" />,
				count: counts.open + countAdjustments.open,
			},
			{
				key: "completed",
				label: "Completed",
				icon: <CheckCircle2 className="w-3 h-3" />,
				count: counts.completed,
			},
			{
				key: "rejected",
				label: "Closed",
				icon: <XCircle className="w-3 h-3" />,
				count: counts.rejected + countAdjustments.rejected,
			},
		];

	return (
		<div>
			{/* Toolbar */}
			<div className="sticky top-0 z-10 bg-background pb-3 pt-4 px-4 before:content-[''] before:absolute before:left-0 before:right-0 before:bottom-full before:h-8 before:bg-background">
				{/* Row 1: Search + Sort + New */}
				<div className="flex items-center gap-2 mb-3">
					<div className="relative flex-1 max-w-sm">
						<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/40" />
						<input
							type="text"
							placeholder="Search prompt requests..."
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
							sort !== "newest"
								? "border-foreground/20 bg-muted/50 dark:bg-white/4 text-foreground"
								: "border-border text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/3",
						)}
					>
						<ArrowUpDown className="w-3 h-3" />
						{sortLabels[sort]}
					</button>

					<div className="ml-auto relative" ref={newMenuRef}>
						<button
							onClick={() => setNewMenuOpen((v) => !v)}
							className="flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-foreground text-background rounded-lg hover:bg-foreground/90 transition-colors cursor-pointer"
						>
							<Sparkles className="w-3 h-3" />
							Prompt
							<ChevronDown
								className={cn(
									"w-3 h-3 opacity-60 transition-transform",
									newMenuOpen && "rotate-180",
								)}
							/>
						</button>
						{newMenuOpen && (
							<div className="absolute right-0 top-full mt-1.5 w-56 rounded-lg border border-border/60 bg-background shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-1 duration-150">
								<button
									onClick={() => {
										setNewMenuOpen(
											false,
										);
										setSuggestDialogOpen(
											true,
										);
									}}
									className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
								>
									<MessageSquarePlus className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
									<div>
										<div className="text-[12px] font-medium text-foreground">
											Suggest
											Prompt
										</div>
										<div className="text-[10px] text-muted-foreground/50 mt-0.5">
											Draft a
											request for
											maintainer
											review
										</div>
									</div>
								</button>
								<button
									onClick={() => {
										setNewMenuOpen(
											false,
										);
										openChat({
											chatType: "general",
											contextKey: `${owner}/${repo}`,
											contextBody:
												{},
											placeholder:
												"Describe the change you want Ghost to make...",
											emptyTitle: "Run Prompt with Ghost",
											emptyDescription:
												"Ghost will make the changes and open a PR with the full AI conversation.",
										});
									}}
									className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
								>
									<Play className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
									<div>
										<div className="text-[12px] font-medium text-foreground">
											Run with
											Ghost
										</div>
										<div className="text-[10px] text-muted-foreground/50 mt-0.5">
											Execute now
											&mdash;
											creates a PR
											with AI
											convo
										</div>
									</div>
								</button>
								<div className="h-px bg-border/40 mx-2 my-1" />
								<button
									onClick={() => {
										setNewMenuOpen(
											false,
										);
										openChat({
											chatType: "general",
											contextKey: `${owner}/${repo}`,
											contextBody:
												{},
											placeholder:
												"Describe the change you want, then say 'open a prompt request'...",
											emptyTitle: "New Prompt Request",
											emptyDescription:
												"Chat with Ghost to create a prompt request for this repo.",
										});
									}}
									className="w-full flex items-start gap-2.5 px-3 py-2 text-left hover:bg-muted/50 transition-colors cursor-pointer"
								>
									<FileText className="w-4 h-4 text-muted-foreground/60 mt-0.5 shrink-0" />
									<div>
										<div className="text-[12px] font-medium text-foreground">
											Open Prompt
											Request
										</div>
										<div className="text-[10px] text-muted-foreground/50 mt-0.5">
											Chat with
											Ghost to
											draft a
											request
										</div>
									</div>
								</button>
							</div>
						)}
					</div>
				</div>

				{/* Row 2: Status tabs */}
				<div className="flex items-center border-b border-border/40">
					{tabItems.map((t) => (
						<button
							key={t.key}
							onClick={() => setTab(t.key)}
							className={cn(
								"relative flex items-center gap-1.5 px-3 pb-2.5 pt-1 text-[12px] transition-colors cursor-pointer",
								tab === t.key
									? "text-foreground"
									: "text-muted-foreground/50 hover:text-foreground/70",
							)}
						>
							{t.icon}
							<span className="hidden sm:inline">
								{t.label}
							</span>
							<span
								className={cn(
									"text-[10px] tabular-nums font-mono",
									tab === t.key
										? "text-foreground/50"
										: "text-muted-foreground/30",
								)}
							>
								{t.count}
							</span>
							{tab === t.key && (
								<span className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground" />
							)}
						</button>
					))}
				</div>
			</div>

			{/* List */}
			{filtered.length === 0 ? (
				<div className="py-16 text-center">
					<Ghost className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
					<p className="text-xs text-muted-foreground/60 font-mono">
						{search
							? "No matching prompt requests"
							: tab === "open"
								? "No open prompt requests"
								: `No ${tab} prompt requests`}
					</p>
					<p className="text-xs text-muted-foreground/40 mt-1">
						Chat with Ghost to create one
					</p>
				</div>
			) : (
				<div className="divide-y divide-border mx-4">
					{filtered.map((pr) => (
						<Link
							key={pr.id}
							href={`/${owner}/${repo}/prompts/${pr.id}`}
							className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
						>
							{pr.status === "processing" ? (
								<Zap className="w-4 h-4 text-yellow-400 shrink-0" />
							) : pr.status === "completed" ? (
								<CheckCircle2 className="w-4 h-4 text-purple-400/60 shrink-0" />
							) : pr.status === "rejected" ? (
								<XCircle className="w-4 h-4 text-red-400/60 shrink-0" />
							) : (
								<CircleDot className="w-4 h-4 text-green-400/60 shrink-0" />
							)}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm text-foreground font-medium truncate group-hover:text-foreground/90">
										{pr.title}
									</span>
									{pr.status ===
										"processing" && (
										<span
											className={cn(
												"text-[10px] font-mono px-1.5 py-0.5 rounded-full shrink-0",
												statusColors[
													pr
														.status
												],
											)}
										>
											{
												statusLabels[
													pr
														.status
												]
											}
										</span>
									)}
								</div>
								<div className="flex items-center gap-2 mt-0.5">
									<span className="text-[11px] text-muted-foreground/50 font-mono">
										<TimeAgo
											date={
												pr.createdAt
											}
										/>
									</span>
									{pr.prNumber && (
										<span className="flex items-center gap-1 text-[11px] text-purple-400/70 font-mono">
											<GitPullRequest className="w-3 h-3" />
											#
											{
												pr.prNumber
											}
										</span>
									)}
								</div>
							</div>
							{(pr.status === "open" ||
								pr.status === "processing") && (
								<button
									onClick={(e) =>
										handleClose(
											e,
											pr.id,
										)
									}
									disabled={
										closingId === pr.id
									}
									className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
									title="Close prompt request"
								>
									{closingId === pr.id ? (
										<Loader2 className="w-3.5 h-3.5 animate-spin" />
									) : (
										<X className="w-3.5 h-3.5" />
									)}
								</button>
							)}
						</Link>
					))}
				</div>
			)}

			<SuggestPromptDialog
				owner={owner}
				repo={repo}
				open={suggestDialogOpen}
				onOpenChange={setSuggestDialogOpen}
			/>
		</div>
	);
}
