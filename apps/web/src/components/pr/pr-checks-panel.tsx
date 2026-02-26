"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
	CheckCircle2,
	XCircle,
	Clock,
	ExternalLink,
	ArrowRight,
	MinusCircle,
	SkipForward,
	ChevronRight,
	Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckStatus, CheckRun } from "@/lib/github";

function CheckIcon({ state, className }: { state: CheckRun["state"]; className?: string }) {
	switch (state) {
		case "success":
			return <CheckCircle2 className={cn("text-success", className)} />;
		case "failure":
		case "error":
			return <XCircle className={cn("text-destructive", className)} />;
		case "pending":
			return <Clock className={cn("text-warning", className)} />;
		case "neutral":
			return (
				<MinusCircle
					className={cn("text-muted-foreground/60", className)}
				/>
			);
		case "skipped":
			return <SkipForward className={cn("text-muted-foreground", className)} />;
	}
}

interface ProviderInfo {
	name: string;
	icon: React.ReactNode;
}

const VERCEL_SVG = (
	<svg viewBox="0 0 76 65" fill="currentColor" className="w-3 h-3">
		<path d="M37.5274 0L75.0548 65H0L37.5274 0Z" />
	</svg>
);

const GITHUB_SVG = (
	<svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
		<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z" />
	</svg>
);

const NETLIFY_SVG = (
	<svg viewBox="0 0 256 256" fill="currentColor" className="w-3 h-3">
		<path d="M170.3 132.5h-19.2l34.5-34.5a86 86 0 0 1 3 11.3l-18.3 23.2zm-48.3 24h47.4l-24.7 24.7c-5.3-1.2-11-4.5-15.2-8.8-3.6-3.7-6.1-8.7-7.5-15.9zm79.6-24h-14l18-22.8a87 87 0 0 1 5.6 22.8h-9.6zm-99.8-6.4 14.2-14.2c4 2 7 5.7 8.8 10.4l-23 3.8zm70.5-70.5L128 100l-10.6-3.6a38 38 0 0 0-5-10l60-60a85 85 0 0 1-.1 29.2z" />
	</svg>
);

const CIRCLECI_SVG = (
	<svg viewBox="0 0 24 24" fill="currentColor" className="w-3 h-3">
		<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm0-14c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm0 10c-2.21 0-4-1.79-4-4s1.79-4 4-4 4 1.79 4 4-1.79 4-4 4z" />
	</svg>
);

function getProvider(check: CheckRun): ProviderInfo {
	const name = check.name.toLowerCase();
	const url = (check.url ?? "").toLowerCase();

	if (name.startsWith("vercel") || url.includes("vercel.com")) {
		return { name: "Vercel", icon: VERCEL_SVG };
	}
	if (name.startsWith("netlify") || url.includes("netlify.com")) {
		return { name: "Netlify", icon: NETLIFY_SVG };
	}
	if (name.includes("circleci") || url.includes("circleci.com")) {
		return { name: "CircleCI", icon: CIRCLECI_SVG };
	}
	if (check.runId != null) {
		return { name: "GitHub Actions", icon: GITHUB_SVG };
	}

	return { name: "CI", icon: GITHUB_SVG };
}

interface GroupedChecks {
	provider: ProviderInfo;
	checks: CheckRun[];
	failed: number;
	passed: number;
	pending: number;
	skipped: number;
}

function groupChecksByProvider(checks: CheckRun[]): GroupedChecks[] {
	const map = new Map<string, GroupedChecks>();

	for (const check of checks) {
		const provider = getProvider(check);
		let group = map.get(provider.name);
		if (!group) {
			group = {
				provider,
				checks: [],
				failed: 0,
				passed: 0,
				pending: 0,
				skipped: 0,
			};
			map.set(provider.name, group);
		}
		group.checks.push(check);
		if (check.state === "failure" || check.state === "error") group.failed++;
		else if (check.state === "success") group.passed++;
		else if (check.state === "pending") group.pending++;
		else if (check.state === "skipped" || check.state === "neutral") group.skipped++;
	}

	return [...map.values()].sort((a, b) => {
		if (a.failed !== b.failed) return b.failed - a.failed;
		if (a.pending !== b.pending) return b.pending - a.pending;
		return a.provider.name.localeCompare(b.provider.name);
	});
}

function ProviderSection({
	group,
	owner,
	repo,
	defaultOpen,
}: {
	group: GroupedChecks;
	owner: string;
	repo: string;
	defaultOpen: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultOpen);

	const sortedChecks = useMemo(() => {
		return [...group.checks].sort((a, b) => {
			const order = {
				failure: 0,
				error: 0,
				pending: 1,
				success: 2,
				neutral: 3,
				skipped: 3,
			};
			return (order[a.state] ?? 4) - (order[b.state] ?? 4);
		});
	}, [group.checks]);

	return (
		<div className="border-b border-border/40 last:border-b-0">
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer"
			>
				<ChevronRight
					className={cn(
						"w-3 h-3 text-muted-foreground/50 transition-transform duration-150 shrink-0",
						expanded && "rotate-90",
					)}
				/>
				<span className="text-muted-foreground/70 shrink-0">
					{group.provider.icon}
				</span>
				<span className="text-xs font-medium text-foreground/90 flex-1 text-left truncate">
					{group.provider.name}
				</span>
				{group.failed > 0 && (
					<span className="text-[10px] font-mono text-destructive tabular-nums shrink-0">
						{group.failed} failed
					</span>
				)}
				{group.failed === 0 && group.pending > 0 && (
					<span className="text-[10px] font-mono text-warning tabular-nums shrink-0 flex items-center gap-1">
						<Loader2 className="w-2.5 h-2.5 animate-spin" />
						{group.pending} running
					</span>
				)}
				{group.failed === 0 && group.pending === 0 && (
					<CheckCircle2 className="w-3 h-3 text-success shrink-0" />
				)}
				<span className="text-[10px] font-mono text-muted-foreground/50 tabular-nums shrink-0 ml-1">
					{group.checks.length}
				</span>
			</button>

			{expanded && (
				<div className="pb-1">
					{sortedChecks.map((check, i) => (
						<div
							key={`${check.name}-${i}`}
							className="flex items-center gap-2 pl-8 pr-3 py-1 hover:bg-muted/20 transition-colors group/check"
						>
							<CheckIcon
								state={check.state}
								className="w-3 h-3 shrink-0"
							/>
							<span className="text-[11px] font-mono truncate flex-1 text-foreground/80">
								{check.name}
							</span>
							{check.runId && owner && repo ? (
								<Link
									href={`/${owner}/${repo}/actions/${check.runId}`}
									className="shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/check:opacity-100"
								>
									<ArrowRight className="w-3 h-3" />
								</Link>
							) : check.url ? (
								<a
									href={check.url}
									target="_blank"
									rel="noopener noreferrer"
									className="shrink-0 text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover/check:opacity-100"
								>
									<ExternalLink className="w-3 h-3" />
								</a>
							) : null}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function PRChecksPanel({
	checkStatus,
	owner,
	repo,
}: {
	checkStatus: CheckStatus;
	owner: string;
	repo: string;
}) {
	const [expanded, setExpanded] = useState(true);

	const grouped = useMemo(
		() => groupChecksByProvider(checkStatus.checks),
		[checkStatus.checks],
	);

	const statusColor =
		checkStatus.state === "success"
			? "text-success"
			: checkStatus.state === "pending"
				? "text-warning"
				: "text-destructive";

	const borderColor =
		checkStatus.state === "success"
			? "border-success/20"
			: checkStatus.state === "pending"
				? "border-warning/20"
				: "border-destructive/30";

	const bgColor =
		checkStatus.state === "success"
			? "bg-success/[0.03]"
			: checkStatus.state === "pending"
				? "bg-warning/[0.03]"
				: "bg-destructive/[0.03]";

	const statusText =
		checkStatus.state === "success"
			? "All checks have passed"
			: checkStatus.state === "pending"
				? `${checkStatus.pending} check${checkStatus.pending !== 1 ? "s" : ""} in progress`
				: `${checkStatus.failure} check${checkStatus.failure !== 1 ? "s" : ""} failed`;

	return (
		<div
			className={cn(
				"rounded-lg border border-dashed overflow-hidden",
				borderColor,
				bgColor,
			)}
		>
			<button
				onClick={() => setExpanded(!expanded)}
				className={cn(
					"w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/30 transition-colors cursor-pointer",
					expanded && "border-b border-dashed border-border/40",
				)}
			>
				<ChevronRight
					className={cn(
						"w-3 h-3 text-muted-foreground transition-transform duration-150 shrink-0",
						expanded && "rotate-90",
					)}
				/>
				<div className={cn("shrink-0", statusColor)}>
					{checkStatus.state === "pending" ? (
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
					) : checkStatus.state === "success" ? (
						<CheckCircle2 className="w-3.5 h-3.5" />
					) : (
						<XCircle className="w-3.5 h-3.5" />
					)}
				</div>
				<span className={cn("text-[11px]", statusColor)}>{statusText}</span>
				<span className="text-[11px] text-muted-foreground/50 font-mono">
					{checkStatus.success}/{checkStatus.total}
				</span>
			</button>

			{expanded && (
				<div>
					{grouped.map((group) => (
						<ProviderSection
							key={group.provider.name}
							group={group}
							owner={owner}
							repo={repo}
							defaultOpen={
								group.failed > 0 ||
								group.pending > 0
							}
						/>
					))}
				</div>
			)}
		</div>
	);
}
