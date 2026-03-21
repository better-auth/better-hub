"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Loader2, CheckCircle, XCircle, Users } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { copyRepoTeamAccess } from "@/app/(app)/repos/team-actions";

type CopyResult = {
	repo: string;
	team: string;
	permission: string;
	success: boolean;
	error?: string;
};

export function CopyTeamAccessPrompt() {
	const { subscribe } = useMutationEvents();

	const [open, setOpen] = useState(false);
	const [targetOwner, setTargetOwner] = useState("");
	const [targetRepo, setTargetRepo] = useState("");
	const [sourceRepo, setSourceRepo] = useState("");
	const [results, setResults] = useState<CopyResult[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	// Keep a ref to avoid stale closure in the subscription
	const pendingEvent = useRef<{ owner: string; repo: string } | null>(null);

	useEffect(() => {
		return subscribe((event) => {
			if (event.type === "repo:created") {
				pendingEvent.current = {
					owner: event.owner,
					repo: event.repo,
				};
				setTargetOwner(event.owner);
				setTargetRepo(event.repo);
				setSourceRepo("");
				setResults(null);
				setError(null);
				setOpen(true);
			}
		});
	}, [subscribe]);

	function handleClose() {
		setOpen(false);
		setResults(null);
		setError(null);
		setSourceRepo("");
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!sourceRepo.trim() || isPending) return;

		startTransition(async () => {
			const result = await copyRepoTeamAccess(
				targetOwner,
				sourceRepo.trim(),
				[targetRepo],
			);
			setResults(result.results);
		});
	}

	const successCount = results?.filter((r) => r.success).length ?? 0;
	const errorCount = results?.filter((r) => !r.success).length ?? 0;

	return (
		<Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="text-sm font-mono flex items-center gap-2">
						<Users className="w-4 h-4" />
						Copy team access
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground font-mono">
						Copy team permissions from an existing repo to{" "}
						<span className="text-foreground">
							{targetOwner}/{targetRepo}
						</span>
					</DialogDescription>
				</DialogHeader>

				{results === null ? (
					<form onSubmit={handleSubmit} className="space-y-4">
						<div>
							<label className="block text-[11px] font-mono text-muted-foreground mb-1">
								Source repository
							</label>
							<input
								type="text"
								value={sourceRepo}
								onChange={(e) => {
									setSourceRepo(e.target.value);
									setError(null);
								}}
								placeholder="template-repo"
								className="w-full px-3 py-1.5 text-sm bg-background border border-border focus:border-foreground/30 focus:outline-none font-mono placeholder:text-muted-foreground"
								autoFocus
							/>
							<p className="mt-1 text-[10px] font-mono text-muted-foreground">
								Teams from this repo in{" "}
								<span className="text-foreground">
									{targetOwner}
								</span>{" "}
								will be copied to{" "}
								<span className="text-foreground">
									{targetRepo}
								</span>
							</p>
						</div>

						{error && (
							<p className="text-xs text-destructive font-mono">
								{error}
							</p>
						)}

						<div className="flex gap-2">
							<button
								type="submit"
								disabled={!sourceRepo.trim() || isPending}
								className={cn(
									"flex-1 flex items-center justify-center gap-2 px-4 py-2 text-xs font-mono border transition-colors cursor-pointer",
									sourceRepo.trim() && !isPending
										? "bg-foreground text-background border-foreground hover:bg-foreground/90"
										: "bg-muted text-muted-foreground border-border cursor-not-allowed",
								)}
							>
								{isPending ? (
									<>
										<Loader2 className="w-3 h-3 animate-spin" />
										Copying…
									</>
								) : (
									"Copy team access"
								)}
							</button>
							<button
								type="button"
								onClick={handleClose}
								disabled={isPending}
								className="px-4 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:cursor-not-allowed"
							>
								Skip
							</button>
						</div>
					</form>
				) : (
					<div className="space-y-3">
						{/* Summary */}
						<div className="flex items-center gap-3 text-xs font-mono">
							{successCount > 0 && (
								<span className="flex items-center gap-1 text-green-600 dark:text-green-400">
									<CheckCircle className="w-3 h-3" />
									{successCount} team
									{successCount !== 1 ? "s" : ""} copied
								</span>
							)}
							{errorCount > 0 && (
								<span className="flex items-center gap-1 text-destructive">
									<XCircle className="w-3 h-3" />
									{errorCount} failed
								</span>
							)}
							{results.length === 0 && (
								<span className="text-muted-foreground">
									No teams found on {sourceRepo}
								</span>
							)}
						</div>

						{/* Per-team results */}
						{results.length > 0 && (
							<ul className="space-y-1 max-h-48 overflow-y-auto">
								{results.map((r, i) => (
									<li
										key={i}
										className="flex items-center gap-2 text-[11px] font-mono"
									>
										{r.success ? (
											<CheckCircle className="w-3 h-3 text-green-600 dark:text-green-400 shrink-0" />
										) : (
											<XCircle className="w-3 h-3 text-destructive shrink-0" />
										)}
										<span
											className={cn(
												r.success
													? "text-foreground"
													: "text-muted-foreground",
											)}
										>
											{r.team}
										</span>
										{r.success && (
											<span className="text-muted-foreground">
												({r.permission})
											</span>
										)}
										{r.error && (
											<span className="text-destructive truncate">
												— {r.error}
											</span>
										)}
									</li>
								))}
							</ul>
						)}

						<button
							type="button"
							onClick={handleClose}
							className="w-full px-4 py-2 text-xs font-mono border border-border text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
						>
							Done
						</button>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}
