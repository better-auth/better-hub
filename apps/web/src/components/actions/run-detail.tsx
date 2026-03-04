"use client";

import { Fragment, useState, useCallback, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import {
	GitBranch,
	Clock,
	GitCommit,
	ArrowLeft,
	ChevronRight,
	Loader2,
	AlertCircle,
	MoreHorizontal,
	FileText,
	Copy,
	Download,
	Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDuration } from "@/components/ui/live-duration";
import { TimeAgo } from "@/components/ui/time-ago";
import { StatusIcon } from "./status-icon";
import { getRunLinkTargets, splitTitleOnPrToken } from "./run-link-targets";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface WorkflowRun {
	id: number;
	name?: string | null;
	display_title: string;
	run_number: number;
	status: string | null;
	conclusion: string | null;
	head_branch: string | null;
	head_sha: string;
	repository?: { name?: string | null; owner?: { login?: string | null } | null } | null;
	head_repository?: {
		name?: string | null;
		owner?: { login?: string | null } | null;
	} | null;
	pull_requests?: { number?: number }[] | null;
	event: string;
	run_started_at?: string | null;
	updated_at: string;
	created_at: string;
	actor: { login: string; avatar_url: string } | null;
	html_url: string;
}

interface Step {
	name: string;
	status: string;
	conclusion: string | null;
	number: number;
	started_at?: string | null;
	completed_at?: string | null;
}

interface Job {
	id: number;
	name: string;
	status: string;
	conclusion: string | null;
	started_at: string | null;
	completed_at: string | null;
	steps?: Step[];
}

interface LogLine {
	timestamp: string | null;
	content: string;
	annotation: "error" | "warning" | "debug" | "notice" | null;
}

interface StepLog {
	stepNumber: number;
	stepName: string;
	lines: LogLine[];
}

interface LogGroup {
	title: string;
	timestamp: string | null;
	lines: LogLine[];
}

type StepLogBlock = { type: "line"; line: LogLine } | { type: "group"; group: LogGroup };

interface JobLogsState {
	steps: StepLog[];
	loading: boolean;
	error: string | null;
}

interface JobRawLogsState {
	raw: string | null;
	loading: boolean;
	error: string | null;
}

function conclusionLabel(conclusion: string | null, status: string): string {
	if (status === "in_progress" || status === "queued" || status === "waiting")
		return status.replace("_", " ");
	return conclusion ?? status;
}

function normalizeStepName(name: string): string {
	return name
		.toLowerCase()
		.trim()
		.replace(/^run\s+/, "")
		.replace(/\s+/g, " ");
}

const COLLAPSED_LINE_LIMIT = 200;

function formatLogTimestamp(timestamp: string | null): string {
	if (!timestamp) return "";
	const d = new Date(timestamp);
	if (Number.isNaN(d.getTime())) return "";
	const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
	const months = [
		"Jan",
		"Feb",
		"Mar",
		"Apr",
		"May",
		"Jun",
		"Jul",
		"Aug",
		"Sep",
		"Oct",
		"Nov",
		"Dec",
	];
	const pad2 = (n: number) => String(n).padStart(2, "0");
	return `${weekdays[d.getUTCDay()]}, ${pad2(d.getUTCDate())} ${months[d.getUTCMonth()]} ${d.getUTCFullYear()} ${pad2(d.getUTCHours())}:${pad2(d.getUTCMinutes())}:${pad2(d.getUTCSeconds())} GMT`;
}

function buildStepLogBlocks(lines: LogLine[]): StepLogBlock[] {
	const blocks: StepLogBlock[] = [];
	let activeGroup: LogGroup | null = null;

	for (const line of lines) {
		const startGroup = line.content.match(/^##\[group\](.*)$/);
		if (startGroup) {
			const title = startGroup[1]?.trim() || "Details";
			if (activeGroup) blocks.push({ type: "group", group: activeGroup });
			activeGroup = { title, timestamp: line.timestamp, lines: [] };
			continue;
		}

		if (line.content.includes("##[endgroup]")) {
			if (activeGroup) blocks.push({ type: "group", group: activeGroup });
			activeGroup = null;
			continue;
		}

		if (activeGroup) {
			activeGroup.lines.push(line);
		} else {
			blocks.push({ type: "line", line });
		}
	}

	if (activeGroup) blocks.push({ type: "group", group: activeGroup });
	return blocks;
}

function StepLogViewer({
	stepLog,
	showTimestamps,
}: {
	stepLog: StepLog | undefined;
	showTimestamps: boolean;
}) {
	const [expanded, setExpanded] = useState(false);
	const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

	if (!stepLog || stepLog.lines.length === 0) {
		return (
			<div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
				No log output for this step
			</div>
		);
	}

	const blocks = buildStepLogBlocks(stepLog.lines);
	const totalLogicalLines = blocks.reduce((total, block) => {
		if (block.type === "line") return total + 1;
		return total + 1 + block.group.lines.length;
	}, 0);
	const isLong = totalLogicalLines > COLLAPSED_LINE_LIMIT;
	const visibleLineCap =
		!isLong || expanded ? Number.POSITIVE_INFINITY : COLLAPSED_LINE_LIMIT;
	let logicalLineNumber = 0;

	const hiddenCount = Math.max(0, totalLogicalLines - COLLAPSED_LINE_LIMIT);

	return (
		<div className="bg-black/20">
			<table className="w-full text-[11px] font-mono leading-[1.6]">
				<tbody>
					{blocks.map((block, blockIdx) => {
						if (block.type === "line") {
							const line = block.line;
							logicalLineNumber += 1;
							if (logicalLineNumber > visibleLineCap)
								return null;
							return (
								<tr
									key={`line-${blockIdx}`}
									className={cn(
										"hover:bg-white/[0.02]",
										line.annotation ===
											"error" &&
											"bg-red-500/10",
										line.annotation ===
											"warning" &&
											"bg-yellow-500/10",
									)}
								>
									<td className="px-3 py-0 text-right text-muted-foreground/20 select-none align-top w-[1%] whitespace-nowrap">
										{logicalLineNumber}
									</td>
									{showTimestamps && (
										<td className="px-2 py-0 text-muted-foreground/45 whitespace-nowrap align-top w-[1%]">
											{formatLogTimestamp(
												line.timestamp,
											)}
										</td>
									)}
									<td
										className={cn(
											"px-3 py-0 whitespace-pre-wrap break-all",
											line.annotation ===
												"error"
												? "text-red-400"
												: line.annotation ===
													  "warning"
													? "text-yellow-400"
													: line.annotation ===
														  "debug"
														? "text-muted-foreground"
														: line.annotation ===
															  "notice"
															? "text-blue-400"
															: "text-muted-foreground/70",
										)}
									>
										{line.content}
									</td>
								</tr>
							);
						}

						const key = `${blockIdx}-${block.group.title}`;
						const isExpanded =
							expandedGroups[key] ??
							block.group.title
								.toLowerCase()
								.startsWith("run ");
						const groupHeaderLine = logicalLineNumber + 1;
						const groupStartLine = groupHeaderLine + 1;
						const groupEndLine =
							groupHeaderLine + block.group.lines.length;
						logicalLineNumber = groupEndLine;
						if (groupHeaderLine > visibleLineCap) return null;

						return (
							<Fragment key={`group-block-${key}`}>
								<tr
									key={`group-header-${key}`}
									className="border-y border-border/20"
								>
									<td className="bg-white/[0.02] px-3 py-1 text-right text-muted-foreground/20 select-none align-middle w-[1%] whitespace-nowrap tabular-nums">
										{groupHeaderLine}
									</td>
									{showTimestamps && (
										<td className="bg-white/[0.02] px-2 py-1 text-muted-foreground/45 whitespace-nowrap align-middle w-[1%]">
											{formatLogTimestamp(
												block
													.group
													.timestamp,
											)}
										</td>
									)}
									<td className="bg-white/[0.02] px-3 py-1">
										<button
											type="button"
											onClick={() =>
												setExpandedGroups(
													(
														prev,
													) => ({
														...prev,
														[key]: !isExpanded,
													}),
												)
											}
											className="inline-flex items-center gap-1.5 text-muted-foreground/80 hover:text-foreground transition-colors"
										>
											<ChevronRight
												className={cn(
													"w-3 h-3 transition-transform",
													isExpanded &&
														"rotate-90",
												)}
											/>
											<span>
												{
													block
														.group
														.title
												}
											</span>
										</button>
									</td>
								</tr>
								{isExpanded &&
									block.group.lines.map(
										(line, i) => {
											const lineNumber =
												groupStartLine +
												i;
											if (
												lineNumber >
												visibleLineCap
											)
												return null;
											return (
												<tr
													key={`group-line-${key}-${i}`}
													className={cn(
														"hover:bg-white/[0.02]",
														line.annotation ===
															"error" &&
															"bg-red-500/10",
														line.annotation ===
															"warning" &&
															"bg-yellow-500/10",
													)}
												>
													<td className="px-3 py-0 text-right text-muted-foreground/20 select-none align-top w-[1%] whitespace-nowrap">
														{
															lineNumber
														}
													</td>
													{showTimestamps && (
														<td className="px-2 py-0 text-muted-foreground/45 whitespace-nowrap align-top w-[1%]">
															{formatLogTimestamp(
																line.timestamp,
															)}
														</td>
													)}
													<td
														className={cn(
															"px-3 py-0 pl-7 whitespace-pre-wrap break-all border-l border-border/20",
															line.annotation ===
																"error"
																? "text-red-400"
																: line.annotation ===
																	  "warning"
																	? "text-yellow-400"
																	: line.annotation ===
																		  "debug"
																		? "text-muted-foreground"
																		: line.annotation ===
																			  "notice"
																			? "text-blue-400"
																			: "text-muted-foreground/70",
														)}
													>
														{
															line.content
														}
													</td>
												</tr>
											);
										},
									)}
							</Fragment>
						);
					})}
				</tbody>
			</table>
			{isLong && !expanded && (
				<button
					onClick={() => setExpanded(true)}
					className="w-full px-4 py-2 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/70 bg-black/10 hover:bg-black/20 transition-colors cursor-pointer border-t border-border/20"
				>
					Show all {totalLogicalLines} lines ({hiddenCount} more)
				</button>
			)}
		</div>
	);
}

export function RunDetail({
	owner,
	repo,
	run,
	jobs,
	initialJobId,
}: {
	owner: string;
	repo: string;
	run: WorkflowRun;
	jobs: Job[];
	initialJobId?: number;
}) {
	const linkTargets = getRunLinkTargets(owner, repo, run);
	const titleParts = splitTitleOnPrToken(run.display_title, linkTargets.prNumber);
	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(() => {
		if (!initialJobId) return new Set<string>();
		const job = jobs.find((j) => j.id === initialJobId);
		if (!job?.steps) return new Set<string>();
		return new Set(job.steps.map((s) => `${initialJobId}-${s.number}`));
	});
	const [showTimestamps, setShowTimestamps] = useState(false);
	const jobLogsRef = useRef<Map<number, JobLogsState>>(new Map());
	const [jobRawLogs, setJobRawLogs] = useState<Record<number, JobRawLogsState>>({});
	const [copyingRawJobId, setCopyingRawJobId] = useState<number | null>(null);
	const [copiedRawJobId, setCopiedRawJobId] = useState<number | null>(null);
	const [, forceUpdate] = useState(0);

	// Auto-load logs for the initial job
	const initialLoadRef = useRef(false);
	if (initialJobId && !initialLoadRef.current) {
		initialLoadRef.current = true;
		const job = jobs.find((j) => j.id === initialJobId);
		if (job && !jobLogsRef.current.has(initialJobId)) {
			jobLogsRef.current.set(initialJobId, {
				steps: [],
				loading: true,
				error: null,
			});
			fetch(
				`/api/job-logs?${new URLSearchParams({ owner, repo, job_id: String(initialJobId) })}`,
			)
				.then(async (res) => {
					if (!res.ok) {
						const body = await res.json().catch(() => ({}));
						jobLogsRef.current.set(initialJobId, {
							steps: [],
							loading: false,
							error:
								res.status === 410
									? "Logs are no longer available"
									: (body.error ??
										"Failed to fetch logs"),
						});
					} else {
						const data = await res.json();
						jobLogsRef.current.set(initialJobId, {
							steps: data.steps ?? [],
							loading: false,
							error: null,
						});
					}
					forceUpdate((n) => n + 1);
				})
				.catch(() => {
					jobLogsRef.current.set(initialJobId, {
						steps: [],
						loading: false,
						error: "Failed to fetch logs",
					});
					forceUpdate((n) => n + 1);
				});
		}
	}

	const toggleStep = useCallback(
		async (jobId: number, stepNumber: number) => {
			const key = `${jobId}-${stepNumber}`;

			setExpandedSteps((prev) => {
				const next = new Set(prev);
				if (next.has(key)) {
					next.delete(key);
				} else {
					next.add(key);
				}
				return next;
			});

			// If logs for this job are already fetched or loading, skip
			const existing = jobLogsRef.current.get(jobId);
			if (existing) return;

			// Guard unknown job ids before mutating loading state.
			if (!jobs.some((j) => j.id === jobId)) return;

			// Mark as loading
			jobLogsRef.current.set(jobId, {
				steps: [],
				loading: true,
				error: null,
			});
			forceUpdate((n) => n + 1);

			try {
				const params = new URLSearchParams({
					owner,
					repo,
					job_id: String(jobId),
				});
				const res = await fetch(`/api/job-logs?${params}`);

				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					jobLogsRef.current.set(jobId, {
						steps: [],
						loading: false,
						error:
							res.status === 410
								? "Logs are no longer available"
								: (body.error ??
									"Failed to fetch logs"),
					});
					forceUpdate((n) => n + 1);
					return;
				}

				const data = await res.json();
				jobLogsRef.current.set(jobId, {
					steps: data.steps ?? [],
					loading: false,
					error: null,
				});
				forceUpdate((n) => n + 1);
			} catch {
				jobLogsRef.current.set(jobId, {
					steps: [],
					loading: false,
					error: "Failed to fetch logs",
				});
				forceUpdate((n) => n + 1);
			}
		},
		[owner, repo, jobs],
	);

	const ensureJobRawLogs = useCallback(
		async (jobId: number): Promise<string | null> => {
			const existing = jobRawLogs[jobId];
			if (existing && existing.raw !== null) return existing.raw;
			if (existing?.loading) return null;

			setJobRawLogs((prev) => ({
				...prev,
				[jobId]: { raw: null, loading: true, error: null },
			}));

			try {
				const params = new URLSearchParams({
					owner,
					repo,
					job_id: String(jobId),
					include_raw: "1",
				});
				const res = await fetch(`/api/job-logs?${params}`);

				if (!res.ok) {
					const body = await res.json().catch(() => ({}));
					setJobRawLogs((prev) => ({
						...prev,
						[jobId]: {
							raw: null,
							loading: false,
							error:
								res.status === 410
									? "Logs are no longer available"
									: (body.error ??
										"Failed to fetch raw logs"),
						},
					}));
					return null;
				}

				const data = await res.json();
				const raw = typeof data.raw === "string" ? data.raw : "";
				setJobRawLogs((prev) => ({
					...prev,
					[jobId]: { raw, loading: false, error: null },
				}));

				// Reuse parsed steps if we don't have them yet.
				if (!jobLogsRef.current.has(jobId)) {
					jobLogsRef.current.set(jobId, {
						steps: data.steps ?? [],
						loading: false,
						error: null,
					});
					forceUpdate((n) => n + 1);
				}

				return raw;
			} catch {
				setJobRawLogs((prev) => ({
					...prev,
					[jobId]: {
						raw: null,
						loading: false,
						error: "Failed to fetch raw logs",
					},
				}));
				return null;
			}
		},
		[jobRawLogs, owner, repo],
	);

	const openRawLogsPage = useCallback(
		(jobId: number) => {
			const params = new URLSearchParams({
				owner,
				repo,
				job_id: String(jobId),
				format: "raw",
			});
			window.open(`/api/job-logs?${params}`, "_blank", "noopener,noreferrer");
		},
		[owner, repo],
	);

	const copyRawLogs = useCallback(
		async (jobId: number) => {
			setCopyingRawJobId(jobId);
			try {
				const raw = await ensureJobRawLogs(jobId);
				if (raw === null) return;
				await navigator.clipboard.writeText(raw);
				setCopiedRawJobId(jobId);
				setTimeout(() => {
					setCopiedRawJobId((current) =>
						current === jobId ? null : current,
					);
				}, 1400);
			} finally {
				setCopyingRawJobId((current) =>
					current === jobId ? null : current,
				);
			}
		},
		[ensureJobRawLogs],
	);

	const downloadRawLogs = useCallback(
		async (jobId: number, jobName: string) => {
			const raw = await ensureJobRawLogs(jobId);
			if (raw === null) return;
			const safeName =
				jobName
					.trim()
					.toLowerCase()
					.replace(/[^a-z0-9_-]+/g, "-") || "job";
			const blob = new Blob([raw], { type: "text/plain;charset=utf-8" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = `${owner}-${repo}-${safeName}-${jobId}.log`;
			document.body.appendChild(a);
			a.click();
			a.remove();
			URL.revokeObjectURL(url);
		},
		[ensureJobRawLogs, owner, repo],
	);

	function getStepLog(
		jobId: number,
		stepNumber: number,
		stepName: string,
	): { log: StepLog | undefined; loading: boolean; error: string | null } {
		const jobState = jobLogsRef.current.get(jobId);
		if (!jobState) return { log: undefined, loading: false, error: null };
		if (jobState.loading) return { log: undefined, loading: true, error: null };
		if (jobState.error)
			return { log: undefined, loading: false, error: jobState.error };

		const normalizedUiName = normalizeStepName(stepName);
		// Prefer deterministic matching to avoid silently binding wrong logs.
		const log =
			jobState.steps.find((s) => s.stepNumber === stepNumber) ??
			jobState.steps.find(
				(s) => normalizeStepName(s.stepName) === normalizedUiName,
			) ??
			jobState.steps.find((s) => s.stepNumber === stepNumber - 1);
		return { log, loading: false, error: null };
	}

	return (
		<div>
			{/* Sticky header */}
			<div className="sticky -top-3 z-10 bg-background pt-3 pb-3">
				{/* Back link */}
				<Link
					href={`/${owner}/${repo}/actions`}
					className="inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors mb-3"
				>
					<ArrowLeft className="w-3 h-3" />
					All runs
				</Link>

				{/* Header */}
				<div className="border border-border px-4 py-3">
					<div className="flex items-center gap-3">
						<StatusIcon
							status={run.status ?? ""}
							conclusion={run.conclusion}
							className="w-4 h-4 shrink-0"
						/>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2">
								<h1 className="text-sm font-medium truncate">
									{titleParts &&
									linkTargets.prHref ? (
										<>
											{
												titleParts.before
											}
											<Link
												href={
													linkTargets.prHref
												}
												className="text-link hover:underline"
											>
												{
													titleParts.token
												}
											</Link>
											{
												titleParts.after
											}
										</>
									) : (
										run.display_title
									)}
								</h1>
								<span className="text-[11px] font-mono text-muted-foreground/50 shrink-0">
									{run.name} #{run.run_number}
								</span>
							</div>
							<div className="flex items-center gap-3 mt-1 flex-wrap">
								<span
									className={cn(
										"text-[9px] font-mono uppercase px-1.5 py-0.5 border",
										run.conclusion ===
											"success"
											? "border-success/30 text-success"
											: run.conclusion ===
												  "failure"
												? "border-destructive/30 text-destructive"
												: "border-border text-muted-foreground",
									)}
								>
									{conclusionLabel(
										run.conclusion,
										run.status ?? "",
									)}
								</span>
								{run.head_branch && (
									<>
										{linkTargets.branchHref ? (
											<Link
												href={
													linkTargets.branchHref
												}
												className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-foreground transition-colors"
											>
												<GitBranch className="w-2.5 h-2.5" />
												{
													run.head_branch
												}
											</Link>
										) : (
											<span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
												<GitBranch className="w-2.5 h-2.5" />
												{
													run.head_branch
												}
											</span>
										)}
									</>
								)}
								<span className="text-[9px] font-mono px-1 py-0.5 border border-border text-muted-foreground/50">
									{run.event}
								</span>
								{linkTargets.commitHref ? (
									<Link
										href={
											linkTargets.commitHref
										}
										className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
									>
										<GitCommit className="w-2.5 h-2.5" />
										{run.head_sha.slice(
											0,
											7,
										)}
									</Link>
								) : (
									<span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
										<GitCommit className="w-2.5 h-2.5" />
										{run.head_sha.slice(
											0,
											7,
										)}
									</span>
								)}
								{run.run_started_at?.trim() && (
									<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
										<Clock className="w-2.5 h-2.5" />
										<LiveDuration
											startedAt={
												run.run_started_at
											}
											completedAt={
												run.status ===
												"completed"
													? run.updated_at
													: null
											}
										/>
									</span>
								)}
								<span className="text-[10px] text-muted-foreground/30">
									<TimeAgo
										date={
											run.updated_at
										}
									/>
								</span>
							</div>
						</div>
						{run.actor && (
							<Link
								href={`/users/${run.actor.login}`}
								className="group flex items-center gap-2 shrink-0 text-muted-foreground/50 hover:text-foreground transition-colors"
							>
								<Image
									src={run.actor.avatar_url}
									alt={run.actor.login}
									width={20}
									height={20}
									className="rounded-full"
								/>
								<span className="text-[10px] font-mono transition-colors group-hover:text-foreground">
									{run.actor.login}
								</span>
							</Link>
						)}
					</div>
				</div>
			</div>

			{/* Jobs */}
			<h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-3">
				Jobs
			</h2>
			<div className="space-y-3">
				{jobs.map((job) => (
					<div key={job.id} className="border border-border">
						{/* Job header */}
						<div className="flex items-center gap-3 px-4 py-3 border-b border-border">
							<StatusIcon
								status={job.status}
								conclusion={job.conclusion}
							/>
							<span className="text-sm font-medium flex-1 min-w-0 truncate">
								{job.name}
							</span>
							{job.started_at && (
								<span className="flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50 shrink-0">
									<Clock className="w-3 h-3" />
									<LiveDuration
										startedAt={
											job.started_at
										}
										completedAt={
											job.completed_at
										}
									/>
								</span>
							)}
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
									<button
										type="button"
										aria-label="Job log actions"
										className="p-1 rounded-sm text-muted-foreground/70 hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
									>
										<MoreHorizontal className="w-3.5 h-3.5" />
									</button>
								</DropdownMenuTrigger>
								<DropdownMenuContent
									align="end"
									className="w-56"
								>
									<DropdownMenuItem
										onSelect={(e) => {
											e.preventDefault();
											setShowTimestamps(
												(
													prev,
												) =>
													!prev,
											);
										}}
									>
										<Clock className="w-3.5 h-3.5" />
										<span>
											{showTimestamps
												? "Hide timestamps"
												: "Show timestamps"}
										</span>
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={(e) => {
											e.preventDefault();
											void downloadRawLogs(
												job.id,
												job.name,
											);
										}}
									>
										<Download className="w-3.5 h-3.5" />
										<span>
											Download log
											archive
										</span>
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={(e) => {
											e.preventDefault();
											openRawLogsPage(
												job.id,
											);
										}}
									>
										<FileText className="w-3.5 h-3.5" />
										<span>
											View raw
											logs
										</span>
									</DropdownMenuItem>
									<DropdownMenuItem
										onSelect={(e) => {
											e.preventDefault();
											void copyRawLogs(
												job.id,
											);
										}}
									>
										{copyingRawJobId ===
										job.id ? (
											<Loader2 className="w-3.5 h-3.5 animate-spin" />
										) : copiedRawJobId ===
										  job.id ? (
											<Check className="w-3.5 h-3.5 text-success" />
										) : (
											<Copy className="w-3.5 h-3.5" />
										)}
										<span>
											{copyingRawJobId ===
											job.id
												? "Copying raw logs"
												: copiedRawJobId ===
													  job.id
													? "Copied raw logs"
													: "Copy raw logs"}
										</span>
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						</div>

						{/* Steps */}
						{job.steps && job.steps.length > 0 && (
							<div className="divide-y divide-border/50">
								{job.steps.map((step) => {
									const stepKey = `${job.id}-${step.number}`;
									const isExpanded =
										expandedSteps.has(
											stepKey,
										);
									const {
										log,
										loading,
										error,
									} = getStepLog(
										job.id,
										step.number,
										step.name,
									);

									return (
										<div
											key={
												step.number
											}
										>
											<button
												onClick={() =>
													toggleStep(
														job.id,
														step.number,
													)
												}
												className="flex items-center gap-3 px-4 py-2 w-full text-left hover:bg-muted/30 transition-colors cursor-pointer"
											>
												<ChevronRight
													className={cn(
														"w-3 h-3 text-muted-foreground transition-transform shrink-0",
														isExpanded &&
															"rotate-90",
													)}
												/>
												<StatusIcon
													status={
														step.status
													}
													conclusion={
														step.conclusion
													}
													className="w-3 h-3"
												/>
												<span className="text-[11px] font-mono text-muted-foreground/60 w-5 text-right shrink-0">
													{
														step.number
													}
												</span>
												<span className="text-xs flex-1 min-w-0 truncate">
													{
														step.name
													}
												</span>
												{step.started_at && (
													<span className="text-[10px] font-mono text-muted-foreground shrink-0">
														<LiveDuration
															startedAt={
																step.started_at
															}
															completedAt={
																step.completed_at ??
																null
															}
														/>
													</span>
												)}
											</button>

											{isExpanded && (
												<div className="border-t border-border/30">
													{loading ? (
														<div className="flex items-center gap-2 px-4 py-4">
															<Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
															<span className="text-[11px] font-mono text-muted-foreground">
																Loading
																logs...
															</span>
														</div>
													) : error ? (
														<div className="flex items-center gap-2 px-4 py-4">
															<AlertCircle className="w-3 h-3 text-muted-foreground" />
															<span className="text-[11px] font-mono text-muted-foreground">
																{
																	error
																}
															</span>
														</div>
													) : (
														<StepLogViewer
															stepLog={
																log
															}
															showTimestamps={
																showTimestamps
															}
														/>
													)}
												</div>
											)}
										</div>
									);
								})}
							</div>
						)}
					</div>
				))}

				{jobs.length === 0 && (
					<div className="py-12 text-center border border-border">
						<p className="text-xs text-muted-foreground font-mono">
							No jobs found
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
