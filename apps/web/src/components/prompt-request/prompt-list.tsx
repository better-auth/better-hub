"use client";

import { useState, useMemo, useTransition, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
	Sparkles,
	X,
	Loader2,
	Search,
	ArrowUpDown,
	CircleDot,
	XCircle,
	CheckCircle2,
	Copy,
	Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { closePromptRequest } from "@/app/(app)/repos/[owner]/[repo]/prompts/actions";
import { SuggestPromptDialog } from "@/components/prompt-request/suggest-prompt-dialog";
import type { PromptRequest, PromptRequestStatus } from "@/lib/prompt-request-store";
import { useMutationSubscription } from "@/hooks/use-mutation-subscription";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { isRepoEvent, type MutationEvent } from "@/lib/mutation-events";

type StatusTab = "open" | "closed";
type SortType = "newest" | "oldest" | "updated";

const sortLabels: Record<SortType, string> = {
	newest: "Newest",
	oldest: "Oldest",
	updated: "Updated",
};

const sortCycle: SortType[] = ["newest", "oldest", "updated"];

const statusColors: Record<PromptRequestStatus, string> = {
	open: "bg-green-500/15 text-green-400",
	accepted: "bg-blue-500/15 text-blue-400",
	closed: "bg-red-500/15 text-red-400",
};

const statusLabels: Record<PromptRequestStatus, string> = {
	open: "Open",
	accepted: "Accepted",
	closed: "Closed",
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
	const router = useRouter();
	const [closingId, setClosingId] = useState<string | null>(null);
	const [copiedId, setCopiedId] = useState<string | null>(null);
	const [, startTransition] = useTransition();
	const [suggestDialogOpen, setSuggestDialogOpen] = useState(false);

	const [countAdjustments, setCountAdjustments] = useState({ open: 0, closed: 0 });
	const { emit } = useMutationEvents();

	useEffect(() => {
		setCountAdjustments({ open: 0, closed: 0 });
	}, [promptRequests]);

	useMutationSubscription(
		["prompt:closed", "prompt:created", "prompt:reopened", "prompt:accepted"],
		(event: MutationEvent) => {
			if (!isRepoEvent(event, owner, repo)) return;
			setCountAdjustments((prev) => {
				switch (event.type) {
					case "prompt:closed":
					case "prompt:accepted":
						return {
							...prev,
							open: prev.open - 1,
							closed: prev.closed + 1,
						};
					case "prompt:reopened":
						return {
							...prev,
							open: prev.open + 1,
							closed: prev.closed - 1,
						};
					case "prompt:created":
						return { ...prev, open: prev.open + 1 };
					default:
						return prev;
				}
			});
		},
	);

	const counts = useMemo(() => {
		const c = { open: 0, closed: 0 };
		for (const pr of promptRequests) {
			if (pr.status === "open") c.open++;
			else if (pr.status === "accepted" || pr.status === "closed") c.closed++;
		}
		return c;
	}, [promptRequests]);

	const filtered = useMemo(() => {
		let list = promptRequests.filter((pr) =>
			tab === "open"
				? pr.status === "open"
				: pr.status === "accepted" || pr.status === "closed",
		);

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
			await closePromptRequest(id);
			emit({ type: "prompt:closed", owner, repo });
			startTransition(() => router.refresh());
		} finally {
			setClosingId(null);
		}
	};

	const handleCopy = async (e: React.MouseEvent, pr: PromptRequest) => {
		e.preventDefault();
		e.stopPropagation();
		await navigator.clipboard.writeText(pr.body);
		setCopiedId(pr.id);
		setTimeout(() => setCopiedId(null), 2000);
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
				key: "closed",
				label: "Closed",
				icon: <XCircle className="w-3 h-3" />,
				count: counts.closed + countAdjustments.closed,
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

					<button
						onClick={() => setSuggestDialogOpen(true)}
						className="ml-auto flex items-center gap-1.5 h-8 px-3 text-xs font-medium bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors cursor-pointer"
					>
						<Sparkles className="w-3 h-3" />
						Suggest Prompt
					</button>
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
					<Sparkles className="w-8 h-8 mx-auto text-muted-foreground/30 mb-3" />
					<p className="text-xs text-muted-foreground/60 font-mono">
						{search
							? "No matching prompt requests"
							: tab === "open"
								? "No open prompt requests"
								: "No closed prompt requests"}
					</p>
					{tab === "open" && !search && (
						<p className="text-xs text-muted-foreground/40 mt-1">
							Suggest a prompt to get started
						</p>
					)}
				</div>
			) : (
				<div className="divide-y divide-border mx-4">
					{filtered.map((pr) => (
						<Link
							key={pr.id}
							href={`/${owner}/${repo}/prompts/${pr.id}`}
							className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors group"
						>
							{pr.status === "closed" ? (
								<XCircle className="w-4 h-4 text-red-400/60 shrink-0" />
							) : pr.status === "accepted" ? (
								<CheckCircle2 className="w-4 h-4 text-blue-400/60 shrink-0" />
							) : (
								<CircleDot className="w-4 h-4 text-green-400/60 shrink-0" />
							)}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm text-foreground font-medium truncate group-hover:text-foreground/90">
										{pr.title}
									</span>
									{(pr.status ===
										"accepted" ||
										pr.status ===
											"closed") && (
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
									{pr.userName && (
										<>
											{pr.userAvatarUrl && (
												<Image
													src={
														pr.userAvatarUrl
													}
													alt={
														pr.userName
													}
													width={
														14
													}
													height={
														14
													}
													className="rounded-full"
												/>
											)}
											{pr.userLogin ? (
												<Link
													href={`/users/${pr.userLogin}`}
													onClick={(
														e,
													) =>
														e.stopPropagation()
													}
													className="text-[11px] text-muted-foreground/60 hover:text-foreground hover:underline"
												>
													{
														pr.userName
													}
												</Link>
											) : (
												<span className="text-[11px] text-muted-foreground/60">
													{
														pr.userName
													}
												</span>
											)}
											<span className="text-muted-foreground/30">
												·
											</span>
										</>
									)}
									<span className="text-[11px] text-muted-foreground/50 font-mono">
										<TimeAgo
											date={
												pr.createdAt
											}
										/>
									</span>
								</div>
							</div>
							<div className="flex items-center gap-1 shrink-0">
								<button
									onClick={(e) =>
										handleCopy(e, pr)
									}
									className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 transition-all"
									title="Copy prompt"
								>
									{copiedId === pr.id ? (
										<Check className="w-3.5 h-3.5 text-green-400" />
									) : (
										<Copy className="w-3.5 h-3.5" />
									)}
								</button>
								{pr.status === "open" &&
									tab === "open" && (
										<button
											onClick={(
												e,
											) =>
												handleClose(
													e,
													pr.id,
												)
											}
											disabled={
												closingId ===
												pr.id
											}
											className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md text-muted-foreground/40 hover:text-red-400 hover:bg-red-500/10 transition-all shrink-0"
											title="Close prompt request"
										>
											{closingId ===
											pr.id ? (
												<Loader2 className="w-3.5 h-3.5 animate-spin" />
											) : (
												<X className="w-3.5 h-3.5" />
											)}
										</button>
									)}
							</div>
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
