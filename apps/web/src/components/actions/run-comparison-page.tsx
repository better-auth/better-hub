"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { Loader2, ArrowLeftRight, ArrowLeft, Copy, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { RunComparisonDiff } from "./run-comparison-diff";
import { RunComparisonTimeline } from "./run-comparison-timeline";
import type { ComparisonRun } from "./run-comparison";

export function RunComparisonPage({
	owner,
	repo,
	runIds,
	repoAvatarUrl,
	repoDescription,
}: {
	owner: string;
	repo: string;
	runIds: number[];
	repoAvatarUrl: string | null;
	repoDescription: string | null;
}) {
	const [data, setData] = useState<ComparisonRun[] | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [loading, setLoading] = useState(true);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams({ owner, repo });
		runIds.forEach((id) => params.append("run_ids", String(id)));
		fetch(`/api/compare-runs?${params}`)
			.then(async (res) => {
				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					throw new Error(
						body.error || "Failed to fetch comparison data",
					);
				}
				return res.json();
			})
			.then((json) => setData(json.runs))
			.catch((e) => setError(e.message))
			.finally(() => setLoading(false));
	}, [owner, repo, runIds]);

	function copyLink() {
		const url = window.location.href;
		navigator.clipboard.writeText(url).then(() => {
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		});
	}

	return (
		<div className="-mx-4 sm:-mx-6 -mt-4">
			{/* Repo context header */}
			<div className="border-b border-border/40 px-6 py-4">
				<div className="max-w-[1200px] mx-auto">
					{/* Back link */}
					<Link
						href={`/${owner}/${repo}/actions`}
						className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-muted-foreground transition-colors mb-4"
					>
						<ArrowLeft className="w-3 h-3" />
						Back to runs
					</Link>

					<div className="flex items-center gap-4">
						{/* Repo avatar */}
						{repoAvatarUrl && (
							<Image
								src={repoAvatarUrl}
								alt={owner}
								width={36}
								height={36}
								className="rounded-sm shrink-0 border border-border/30"
							/>
						)}

						<div className="flex-1 min-w-0">
							{/* Owner / repo */}
							<div className="flex items-center gap-1.5 text-sm">
								<Link
									href={`/${owner}`}
									className="text-muted-foreground/60 hover:text-foreground transition-colors"
								>
									{owner}
								</Link>
								<span className="text-muted-foreground/20">
									/
								</span>
								<Link
									href={`/${owner}/${repo}`}
									className="font-medium hover:text-foreground transition-colors"
								>
									{repo}
								</Link>
							</div>

							{repoDescription && (
								<p className="text-[11px] text-muted-foreground/30 mt-0.5 truncate max-w-[500px]">
									{repoDescription}
								</p>
							)}
						</div>

						{/* Comparison badge + share */}
						<div className="flex items-center gap-2 shrink-0">
							<div className="flex items-center gap-2 px-3 py-1.5 bg-blue-500/[0.06] border border-blue-500/15">
								<ArrowLeftRight className="w-3.5 h-3.5 text-blue-400" />
								<span className="text-[11px] font-mono text-blue-400/80">
									{runIds.length} runs
								</span>
							</div>
							<button
								onClick={copyLink}
								className={cn(
									"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono border transition-all cursor-pointer",
									copied
										? "border-success/30 text-success bg-success/5"
										: "border-border/40 text-muted-foreground hover:text-muted-foreground hover:border-border",
								)}
							>
								{copied ? (
									<Check className="w-3 h-3" />
								) : (
									<Copy className="w-3 h-3" />
								)}
								{copied ? "Copied" : "Copy link"}
							</button>
						</div>
					</div>
				</div>
			</div>

			{/* Content */}
			<div className="max-w-[1200px] mx-auto px-6 py-6">
				{loading && (
					<div className="flex flex-col items-center justify-center py-24 gap-3">
						<Loader2 className="w-5 h-5 text-muted-foreground/30 animate-spin" />
						<span className="text-[11px] font-mono text-muted-foreground/25">
							Loading run data...
						</span>
					</div>
				)}
				{error && (
					<div className="flex flex-col items-center justify-center py-24 gap-2">
						<div className="w-8 h-8 flex items-center justify-center border border-destructive/20 bg-destructive/5">
							<ArrowLeftRight className="w-4 h-4 text-destructive/60" />
						</div>
						<p className="text-[12px] font-mono text-destructive/80">
							{error}
						</p>
					</div>
				)}
				{data && data.length === 2 && (
					<RunComparisonDiff
						runs={data as [ComparisonRun, ComparisonRun]}
						owner={owner}
						repo={repo}
					/>
				)}
				{data && data.length > 2 && (
					<RunComparisonTimeline
						runs={data}
						owner={owner}
						repo={repo}
					/>
				)}
			</div>
		</div>
	);
}
