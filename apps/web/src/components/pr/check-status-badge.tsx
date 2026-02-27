"use client";

import { useState, useRef, useCallback, useMemo, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
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
	ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { CheckStatus, CheckRun } from "@/lib/github";

export function CheckIcon({ state, className }: { state: CheckRun["state"]; className?: string }) {
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

function getProvider(check: CheckRun): ProviderInfo {
	const name = check.name.toLowerCase();
	const url = (check.url ?? "").toLowerCase();

	if (name.startsWith("vercel") || url.includes("vercel.com")) {
		return { name: "Vercel", icon: VERCEL_SVG };
	}
	if (name.startsWith("netlify") || url.includes("netlify.com")) {
		return { name: "Netlify", icon: NETLIFY_SVG };
	}
	if (
		check.runId != null ||
		url.includes("github.com") ||
		name.includes("actions") ||
		name.includes("ci") ||
		name.includes("build") ||
		name.includes("test") ||
		name.includes("lint") ||
		name.includes("deploy")
	) {
		// If it has a runId, it's definitely a GitHub Actions check
		if (check.runId != null) {
			return { name: "GitHub Actions", icon: GITHUB_SVG };
		}
	}

	// Fallback: if it has a runId, GitHub Actions. Otherwise generic.
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
}

function groupChecksByProvider(checks: CheckRun[]): GroupedChecks[] {
	const map = new Map<string, GroupedChecks>();

	for (const check of checks) {
		const provider = getProvider(check);
		let group = map.get(provider.name);
		if (!group) {
			group = { provider, checks: [], failed: 0, passed: 0, pending: 0 };
			map.set(provider.name, group);
		}
		group.checks.push(check);
		if (check.state === "failure" || check.state === "error") group.failed++;
		else if (check.state === "success") group.passed++;
		else if (check.state === "pending") group.pending++;
	}

	// Sort: failed groups first, then pending, then passed
	return [...map.values()].sort((a, b) => {
		if (a.failed !== b.failed) return b.failed - a.failed;
		if (a.pending !== b.pending) return b.pending - a.pending;
		return a.provider.name.localeCompare(b.provider.name);
	});
}

function ProviderGroup({
	group,
	owner,
	repo,
	defaultOpen,
}: {
	group: GroupedChecks;
	owner?: string;
	repo?: string;
	defaultOpen: boolean;
}) {
	const [expanded, setExpanded] = useState(defaultOpen);

	return (
		<div>
			<button
				onClick={() => setExpanded(!expanded)}
				className="w-full flex items-center gap-2 px-3 py-2 hover:bg-muted/50 transition-colors cursor-pointer"
			>
				<ChevronRight
					className={cn(
						"w-2.5 h-2.5 text-muted-foreground/60 transition-transform duration-150 shrink-0",
						expanded && "rotate-90",
					)}
				/>
				<span className="text-muted-foreground/80 shrink-0">
					{group.provider.icon}
				</span>
				<span className="font-mono text-[11px] font-medium text-foreground flex-1 text-left truncate">
					{group.provider.name}
				</span>
				<span className="font-mono text-[10px] text-muted-foreground/70 tabular-nums shrink-0">
					{group.checks.length}
				</span>
				{group.failed > 0 && (
					<span className="font-mono text-[9px] text-destructive tabular-nums shrink-0">
						{group.failed} failed
					</span>
				)}
				{group.failed === 0 && group.pending > 0 && (
					<span className="font-mono text-[9px] text-warning tabular-nums shrink-0">
						{group.pending} pending
					</span>
				)}
				{group.failed === 0 && group.pending === 0 && (
					<CheckCircle2 className="w-3 h-3 text-success shrink-0" />
				)}
			</button>

			{expanded && (
				<div className="border-t border-border/30">
					{group.checks.map((check, i) => (
						<div
							key={`${check.name}-${i}`}
							className="flex items-center gap-2 pl-8 pr-3 py-1.5 hover:bg-muted/30 transition-colors"
						>
							<CheckIcon
								state={check.state}
								className="w-2.5 h-2.5 shrink-0"
							/>
							<span className="font-mono text-[10px] truncate flex-1 text-foreground/90">
								{check.name}
							</span>
							{check.runId && owner && repo ? (
								<Link
									href={`/${owner}/${repo}/actions/${check.runId}`}
									onClick={(e) =>
										e.stopPropagation()
									}
									className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
								>
									<ArrowRight className="w-2.5 h-2.5" />
								</Link>
							) : check.url ? (
								<a
									href={check.url}
									target="_blank"
									rel="noopener noreferrer"
									onClick={(e) =>
										e.stopPropagation()
									}
									className="shrink-0 text-muted-foreground/60 hover:text-foreground transition-colors"
								>
									<ExternalLink className="w-2.5 h-2.5" />
								</a>
							) : null}
						</div>
					))}
				</div>
			)}
		</div>
	);
}

export function CheckStatusBadge({
	checkStatus,
	align = "left",
	owner,
	repo,
	showChevron,
	usePortal = false,
	collisionPadding = 8,
}: {
	checkStatus: CheckStatus;
	align?: "left" | "right";
	owner?: string;
	repo?: string;
	showChevron?: boolean;
	usePortal?: boolean;
	collisionPadding?: number;
}) {
	const [open, setOpen] = useState(false);
	const rootRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const [panelPosition, setPanelPosition] = useState<{
		top: number;
		left: number;
	} | null>(null);

	const grouped = useMemo(
		() => groupChecksByProvider(checkStatus.checks),
		[checkStatus.checks],
	);

	const colorClass =
		checkStatus.state === "success"
			? "text-success"
			: checkStatus.state === "pending"
				? "text-warning"
				: "text-destructive";

	const updatePanelPosition = useCallback(() => {
		if (!triggerRef.current) return;
		const triggerRect = triggerRef.current.getBoundingClientRect();
		const panelRect = panelRef.current?.getBoundingClientRect();
		const panelWidth = panelRect?.width || 320;
		const top = triggerRect.bottom + 6;

		const preferredLeft =
			align === "right" ? triggerRect.right - panelWidth : triggerRect.left;
		const flippedLeft =
			align === "right" ? triggerRect.left : triggerRect.right - panelWidth;

		const minLeft = collisionPadding;
		const maxLeft = Math.max(
			collisionPadding,
			window.innerWidth - panelWidth - collisionPadding,
		);

		const canUsePreferred = preferredLeft >= minLeft && preferredLeft <= maxLeft;
		const baseLeft = canUsePreferred ? preferredLeft : flippedLeft;
		const left = Math.min(Math.max(baseLeft, minLeft), maxLeft);

		setPanelPosition({ top, left });
	}, [align, collisionPadding]);

	useLayoutEffect(() => {
		if (!open || !usePortal) return;
		updatePanelPosition();
	}, [open, usePortal, updatePanelPosition]);

	useEffect(() => {
		if (!open || !usePortal) return;
		const onViewportChange = () => updatePanelPosition();
		window.addEventListener("resize", onViewportChange);
		window.addEventListener("scroll", onViewportChange, true);
		return () => {
			window.removeEventListener("resize", onViewportChange);
			window.removeEventListener("scroll", onViewportChange, true);
		};
	}, [open, usePortal, updatePanelPosition]);

	useEffect(() => {
		if (!open) return;
		const onMouseDown = (event: MouseEvent) => {
			const target = event.target as Node;
			if (rootRef.current?.contains(target)) return;
			if (panelRef.current?.contains(target)) return;
			setOpen(false);
		};
		document.addEventListener("mousedown", onMouseDown);
		return () => document.removeEventListener("mousedown", onMouseDown);
	}, [open]);

	const panel = (
		<div
			ref={panelRef}
			className={cn(
				"z-50 w-80 border border-border bg-background shadow-lg rounded-md",
				usePortal
					? "fixed"
					: cn(
							"absolute top-full mt-1.5",
							align === "right" ? "right-0" : "left-0",
						),
			)}
			style={
				usePortal
					? panelPosition
						? {
								top: panelPosition.top,
								left: panelPosition.left,
							}
						: { top: -9999, left: -9999, visibility: "hidden" }
					: undefined
			}
			onClick={(e) => e.stopPropagation()}
		>
			{/* Header */}
			<div className="flex items-center gap-2 px-3 py-2 border-b border-border">
				<CheckIcon state={checkStatus.state} className="w-3.5 h-3.5" />
				<span
					className={cn(
						"font-mono text-[11px] font-medium",
						colorClass,
					)}
				>
					{checkStatus.state === "success"
						? "All checks passed"
						: checkStatus.state === "pending"
							? "Checks in progress"
							: `${checkStatus.failure} check${checkStatus.failure !== 1 ? "s" : ""} failed`}
				</span>
				<span className="ml-auto font-mono text-[10px] text-muted-foreground/70">
					{checkStatus.success}/{checkStatus.total}
				</span>
			</div>

			{/* Grouped check list */}
			<div className="max-h-80 overflow-y-auto divide-y divide-border/30">
				{grouped.map((group) => (
					<ProviderGroup
						key={group.provider.name}
						group={group}
						owner={owner}
						repo={repo}
						defaultOpen={group.failed > 0 || group.pending > 0}
					/>
				))}
			</div>
		</div>
	);

	return (
		<div ref={rootRef} className="relative">
			<button
				ref={triggerRef}
				onClick={(e) => {
					e.preventDefault();
					e.stopPropagation();
					setOpen((v) => !v);
				}}
				className={cn(
					"flex items-center gap-1 font-mono text-[10px] cursor-pointer hover:opacity-80 transition-opacity",
					colorClass,
				)}
			>
				<CheckIcon state={checkStatus.state} className="w-3 h-3" />
				{checkStatus.success}/{checkStatus.total}
				{showChevron && (
					<ChevronDown
						className={cn(
							"w-3 h-3 text-muted-foreground/70 transition-transform duration-150",
							open && "rotate-180",
						)}
					/>
				)}
			</button>

			{open && (usePortal ? createPortal(panel, document.body) : panel)}
		</div>
	);
}
