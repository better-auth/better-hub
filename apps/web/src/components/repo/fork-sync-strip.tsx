"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitFork, Loader2, ChevronDown, RotateCcw } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

type ForkSyncActionResult = { success: true; message: string } | { success: false; error: string };

interface ForkSyncStripProps {
	owner: string;
	repo: string;
	defaultBranch: string;
	upstream: {
		owner: string;
		repo: string;
		defaultBranch: string;
	};
	aheadBy: number;
	behindBy: number;
	onSyncFork: (owner: string, repo: string, branch?: string) => Promise<ForkSyncActionResult>;
	onDiscardFork: (
		owner: string,
		repo: string,
		branch?: string,
	) => Promise<ForkSyncActionResult>;
}

function commitLabel(count: number): string {
	return count === 1 ? "commit" : "commits";
}

function compareHref(owner: string, repo: string, base: string, head: string): string {
	const params = new URLSearchParams({ base, head });
	return `/${owner}/${repo}/pulls/new?${params.toString()}`;
}

export function ForkSyncStrip({
	owner,
	repo,
	defaultBranch,
	upstream,
	aheadBy,
	behindBy,
	onSyncFork,
	onDiscardFork,
}: ForkSyncStripProps) {
	const router = useRouter();
	const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
	const [syncMenuOpen, setSyncMenuOpen] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [success, setSuccess] = useState<string | null>(null);
	const [pendingAction, setPendingAction] = useState<"sync" | "discard" | null>(null);
	const [isPending, startTransition] = useTransition();

	useEffect(() => {
		if (!success && !error) return;
		const timer = setTimeout(() => {
			setSuccess(null);
			setError(null);
		}, 5000);
		return () => clearTimeout(timer);
	}, [success, error]);

	const hasAhead = aheadBy > 0;
	const hasBehind = behindBy > 0;

	const syncDisabled = isPending || !hasBehind;
	const discardDisabled = isPending || !hasAhead;

	const upstreamFull = `${upstream.owner}/${upstream.repo}:${upstream.defaultBranch}`;
	const upstreamToForkCompare = useMemo(
		() =>
			compareHref(
				owner,
				repo,
				`${upstream.owner}:${upstream.defaultBranch}`,
				`${owner}:${defaultBranch}`,
			),
		[defaultBranch, owner, repo, upstream.defaultBranch, upstream.owner],
	);
	const forkToUpstreamCompare = useMemo(
		() =>
			compareHref(
				owner,
				repo,
				`${owner}:${defaultBranch}`,
				`${upstream.owner}:${upstream.defaultBranch}`,
			),
		[defaultBranch, owner, repo, upstream.defaultBranch, upstream.owner],
	);
	const openUpstreamPrHref = useMemo(
		() =>
			compareHref(
				upstream.owner,
				upstream.repo,
				upstream.defaultBranch,
				`${owner}:${defaultBranch}`,
			),
		[defaultBranch, owner, upstream.defaultBranch, upstream.owner, upstream.repo],
	);

	const statusSentence = useMemo(() => {
		if (!hasAhead && !hasBehind) {
			return (
				<>
					This branch is up to date with{" "}
					<UpstreamBadge upstream={upstreamFull} />.
				</>
			);
		}

		if (hasAhead && hasBehind) {
			return (
				<>
					This branch is{" "}
					<Link
						href={upstreamToForkCompare}
						className="text-primary hover:underline"
					>
						{aheadBy} {commitLabel(aheadBy)} ahead
					</Link>{" "}
					of and{" "}
					<Link
						href={forkToUpstreamCompare}
						className="text-primary hover:underline"
					>
						{behindBy} {commitLabel(behindBy)} behind
					</Link>{" "}
					<UpstreamBadge upstream={upstreamFull} />.
				</>
			);
		}

		if (hasAhead) {
			return (
				<>
					This branch is{" "}
					<Link
						href={upstreamToForkCompare}
						className="text-primary hover:underline"
					>
						{aheadBy} {commitLabel(aheadBy)} ahead
					</Link>{" "}
					of <UpstreamBadge upstream={upstreamFull} />.
				</>
			);
		}

		return (
			<>
				This branch is{" "}
				<Link
					href={forkToUpstreamCompare}
					className="text-primary hover:underline"
				>
					{behindBy} {commitLabel(behindBy)} behind
				</Link>{" "}
				of <UpstreamBadge upstream={upstreamFull} />.
			</>
		);
	}, [
		aheadBy,
		behindBy,
		hasAhead,
		hasBehind,
		forkToUpstreamCompare,
		upstreamFull,
		upstreamToForkCompare,
	]);

	function handleSync() {
		if (syncDisabled) return;
		setError(null);
		setSuccess(null);
		setPendingAction("sync");
		startTransition(async () => {
			const res = await onSyncFork(owner, repo, defaultBranch);
			if (!res.success) {
				setError(res.error);
			} else {
				setSuccess(res.message);
				setSyncMenuOpen(false);
				router.refresh();
			}
			setPendingAction(null);
		});
	}

	function handleDiscard() {
		if (discardDisabled) return;
		setError(null);
		setSuccess(null);
		setPendingAction("discard");
		startTransition(async () => {
			const res = await onDiscardFork(owner, repo, defaultBranch);
			if (!res.success) {
				setError(res.error);
			} else {
				setSuccess(res.message);
				setSyncMenuOpen(false);
				setShowDiscardConfirm(false);
				router.refresh();
			}
			setPendingAction(null);
		});
	}

	return (
		<>
			<div className="mb-3 rounded-md border border-border bg-card/40">
				<div className="flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
					<p className="text-xs text-muted-foreground leading-relaxed">
						{statusSentence}
					</p>
					<div className="flex items-center gap-2 shrink-0">
						<DropdownMenu>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								>
									<GitFork className="w-3 h-3" />
									Contribute
									<ChevronDown className="w-3 h-3" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-56"
							>
								<DropdownMenuItem asChild>
									<Link
										href={
											openUpstreamPrHref
										}
									>
										Open pull request to
										upstream
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link
										href={
											forkToUpstreamCompare
										}
									>
										Compare fork to
										upstream
									</Link>
								</DropdownMenuItem>
								<DropdownMenuItem asChild>
									<Link
										href={`/${upstream.owner}/${upstream.repo}`}
									>
										View upstream
										repository
									</Link>
								</DropdownMenuItem>
							</DropdownMenuContent>
						</DropdownMenu>

						<DropdownMenu
							open={syncMenuOpen}
							onOpenChange={setSyncMenuOpen}
						>
							<DropdownMenuTrigger asChild>
								<button
									type="button"
									className="flex items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
								>
									<RotateCcw className="w-3 h-3" />
									Sync fork
									<ChevronDown className="w-3 h-3" />
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								sideOffset={8}
								className="w-[min(28rem,calc(100vw-1.5rem))] p-0 overflow-hidden"
							>
								<div className="p-3 border-b border-border">
									<div className="flex items-start gap-3">
										<div className="size-7 rounded-full bg-muted flex items-center justify-center shrink-0">
											<GitFork className="w-3.5 h-3.5 text-muted-foreground" />
										</div>
										<div className="space-y-1.5">
											<h3 className="text-lg font-semibold tracking-tight">
												{hasBehind
													? "This branch is out-of-date"
													: hasAhead
														? "This branch is ahead"
														: "This branch is up-to-date"}
											</h3>
											<p className="text-muted-foreground/85 text-xs leading-relaxed">
												Update
												branch
												to
												merge
												the
												latest
												upstream
												changes
												into
												this
												branch.
											</p>
											{hasAhead && (
												<p className="text-muted-foreground/85 text-xs leading-relaxed">
													Discard{" "}
													{
														aheadBy
													}{" "}
													{commitLabel(
														aheadBy,
													)}{" "}
													to
													match
													the
													upstream
													repository.
												</p>
											)}
											<a
												href="https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/working-with-forks/syncing-a-fork"
												target="_blank"
												rel="noopener noreferrer"
												className="inline-block text-primary hover:underline text-xs"
											>
												Learn
												more
												about
												syncing
												a
												fork
											</a>
										</div>
									</div>
								</div>
								<div
									className={cn(
										"grid gap-1.5 p-2.5",
										hasAhead &&
											hasBehind
											? "grid-cols-2"
											: "grid-cols-1",
									)}
								>
									{hasAhead && (
										<button
											type="button"
											onClick={() => {
												setSyncMenuOpen(
													false,
												);
												setShowDiscardConfirm(
													true,
												);
											}}
											disabled={
												discardDisabled
											}
											className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-muted/30 px-3 text-sm font-semibold text-destructive hover:bg-muted/60 transition-colors disabled:opacity-60"
										>
											{pendingAction ===
											"discard" ? (
												<Loader2 className="w-4 h-4 animate-spin" />
											) : (
												`Discard ${aheadBy} ${commitLabel(aheadBy)}`
											)}
										</button>
									)}
									{hasBehind && (
										<button
											type="button"
											onClick={
												handleSync
											}
											disabled={
												syncDisabled
											}
											className="inline-flex h-8 items-center justify-center rounded-md bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60"
										>
											{pendingAction ===
											"sync" ? (
												<Loader2 className="w-4 h-4 animate-spin" />
											) : (
												"Update branch"
											)}
										</button>
									)}
									{!hasAhead &&
										!hasBehind && (
											<button
												type="button"
												disabled
												className="inline-flex h-8 items-center justify-center rounded-md border border-border bg-muted/30 px-3 text-sm font-semibold text-muted-foreground"
											>
												Up
												to
												date
											</button>
										)}
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					</div>
				</div>
				{(error || success) && (
					<div className="border-t border-border px-3 py-2 text-xs font-mono">
						{error ? (
							<p className="text-destructive">{error}</p>
						) : (
							<p className="text-success">{success}</p>
						)}
					</div>
				)}
			</div>

			<Dialog open={showDiscardConfirm} onOpenChange={setShowDiscardConfirm}>
				<DialogContent className="max-w-md">
					<DialogHeader>
						<DialogTitle>Discard local commits?</DialogTitle>
						<DialogDescription>
							This will hard reset{" "}
							<span className="font-mono">
								{owner}/{repo}:{defaultBranch}
							</span>{" "}
							to match upstream{" "}
							<span className="font-mono">
								{upstreamFull}
							</span>
							. This action cannot be undone.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter className="sm:justify-between">
						<button
							type="button"
							onClick={() => setShowDiscardConfirm(false)}
							className="inline-flex h-9 items-center justify-center rounded-md border border-border px-3 text-sm font-medium"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleDiscard}
							disabled={discardDisabled}
							className="inline-flex h-9 items-center justify-center rounded-md bg-destructive px-3 text-sm font-medium text-white hover:bg-destructive/90 disabled:opacity-60"
						>
							{pendingAction === "discard" ? (
								<Loader2 className="w-4 h-4 animate-spin" />
							) : (
								"Discard commits"
							)}
						</button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}

function UpstreamBadge({ upstream }: { upstream: string }) {
	return (
		<span className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 font-mono text-xs text-muted-foreground">
			{upstream}
		</span>
	);
}
