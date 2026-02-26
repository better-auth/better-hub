"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import {
	ChevronRight,
	GitBranch,
	GitCommit,
	User,
	Zap,
	Clock,
	TrendingDown,
	TrendingUp,
	Minus,
	Loader2,
	AlertCircle,
} from "lucide-react";
import { cn, calculateDuration, formatDurationDelta } from "@/lib/utils";
import { StatusIcon } from "./status-icon";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ComparisonRun } from "./run-comparison";

function formatDurationFromSeconds(totalSeconds: number): string {
	if (totalSeconds === 0) return "0s";
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

function conclusionLabel(conclusion: string | null, status: string | null): string {
	if (status === "in_progress" || status === "queued" || status === "waiting")
		return (status ?? "").replace("_", " ");
	return conclusion ?? status ?? "unknown";
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

interface JobLogsState {
	steps: StepLog[];
	loading: boolean;
	error: string | null;
}

/** Horizontal duration bar */
function DurationBar({
	seconds,
	maxSeconds,
	conclusion,
}: {
	seconds: number;
	maxSeconds: number;
	conclusion: string | null;
}) {
	if (maxSeconds === 0) return null;
	const pct = Math.max(2, (seconds / maxSeconds) * 100);
	return (
		<div className="h-1 w-full bg-muted/20 mt-1.5 overflow-hidden">
			<div
				className={cn(
					"h-full transition-all duration-700 ease-out",
					conclusion === "success" && "bg-success/40",
					conclusion === "failure" && "bg-destructive/40",
					conclusion === "cancelled" && "bg-muted-foreground/20",
					conclusion === "skipped" && "bg-muted-foreground/15",
					!conclusion && "bg-warning/40",
				)}
				style={{ width: `${pct}%` }}
			/>
		</div>
	);
}

function StepLogViewer({ stepLog }: { stepLog: StepLog | undefined }) {
	if (!stepLog || stepLog.lines.length === 0) {
		return (
			<div className="px-4 py-3 text-[11px] font-mono text-muted-foreground/30">
				No log output for this step
			</div>
		);
	}

	return (
		<div className="max-h-[300px] overflow-auto bg-black/20">
			<table className="w-full text-[11px] font-mono leading-[1.6]">
				<tbody>
					{stepLog.lines.map((line, i) => (
						<tr
							key={i}
							className={cn(
								"hover:bg-white/[0.02]",
								line.annotation === "error" &&
									"bg-red-500/10",
								line.annotation === "warning" &&
									"bg-yellow-500/10",
							)}
						>
							<td className="px-3 py-0 text-right text-muted-foreground/15 select-none align-top w-[1%] whitespace-nowrap tabular-nums">
								{i + 1}
							</td>
							<td
								className={cn(
									"px-3 py-0 whitespace-pre-wrap break-all",
									line.annotation === "error"
										? "text-red-400"
										: line.annotation ===
											  "warning"
											? "text-yellow-400"
											: line.annotation ===
												  "debug"
												? "text-muted-foreground/30"
												: line.annotation ===
													  "notice"
													? "text-blue-400"
													: "text-muted-foreground/60",
								)}
							>
								{line.content}
							</td>
						</tr>
					))}
				</tbody>
			</table>
		</div>
	);
}

function RunMetadataCard({
	run,
	label,
	delta,
	owner,
	repo,
}: {
	run: ComparisonRun;
	label: string;
	delta?: number;
	owner: string;
	repo: string;
}) {
	const duration = calculateDuration(run.run.run_started_at, run.run.updated_at);
	const deltaInfo = delta !== undefined ? formatDurationDelta(delta) : null;
	const conclusion = run.run.conclusion;

	return (
		<div
			className={cn(
				"flex-1 min-w-0 border border-border/40 overflow-hidden",
				"bg-gradient-to-b from-muted/5 to-transparent",
			)}
		>
			{/* Top accent bar */}
			<div
				className={cn(
					"h-0.5",
					conclusion === "success" && "bg-success/60",
					conclusion === "failure" && "bg-destructive/60",
					conclusion === "cancelled" && "bg-muted-foreground/30",
					!conclusion && "bg-warning/60",
				)}
			/>

			<div className="px-3 py-2.5">
				<div className="flex items-center gap-3">
					{/* Status + run number */}
					<StatusIcon
						status={run.run.status ?? ""}
						conclusion={run.run.conclusion ?? null}
						className="w-3.5 h-3.5 shrink-0"
					/>
					<Link
						href={`/${owner}/${repo}/actions/${run.run.id}`}
						className="text-[13px] font-medium tabular-nums shrink-0 hover:text-blue-400 transition-colors"
					>
						#{run.run.run_number}
					</Link>

					{/* Inline metadata */}
					<div className="flex items-center gap-2.5 text-[10px] font-mono text-muted-foreground min-w-0 flex-1 overflow-hidden">
						{run.run.head_branch && (
							<Link
								href={`/${owner}/${repo}/tree/${run.run.head_branch}`}
								className="flex items-center gap-1 shrink-0 hover:text-blue-400 transition-colors"
								onClick={(e) => e.stopPropagation()}
							>
								<GitBranch className="w-2.5 h-2.5 text-muted-foreground/20" />
								<span className="truncate max-w-[80px]">
									{run.run.head_branch}
								</span>
							</Link>
						)}
						<Link
							href={`/${owner}/${repo}/commit/${run.run.head_sha}`}
							className="flex items-center gap-1 shrink-0 hover:text-blue-400 transition-colors"
							onClick={(e) => e.stopPropagation()}
						>
							<GitCommit className="w-2.5 h-2.5 text-muted-foreground/20" />
							{(run.run.head_sha ?? "").slice(0, 7)}
						</Link>
						<span className="shrink-0">{run.run.event}</span>
						{run.run.actor && (
							<Link
								href={`/${run.run.actor.login}`}
								className="flex items-center gap-1 shrink-0 hover:text-blue-400 transition-colors"
								onClick={(e) => e.stopPropagation()}
							>
								<User className="w-2.5 h-2.5 text-muted-foreground/20" />
								{run.run.actor.login}
							</Link>
						)}
					</div>

					{/* Duration + status badge */}
					<div className="flex items-center gap-2 shrink-0 ml-auto">
						<span className="text-[12px] font-mono tabular-nums">
							{formatDurationFromSeconds(duration)}
						</span>
						{deltaInfo && deltaInfo.text && (
							<span
								className={cn(
									"text-[10px] font-mono",
									deltaInfo.className,
								)}
							>
								{deltaInfo.text}
							</span>
						)}
						<span
							className={cn(
								"text-[9px] font-mono uppercase px-1.5 py-0.5 border",
								conclusion === "success" &&
									"border-success/20 text-success bg-success/5",
								conclusion === "failure" &&
									"border-destructive/20 text-destructive bg-destructive/5",
								conclusion === "cancelled" &&
									"border-border text-muted-foreground bg-muted/20",
								!conclusion &&
									"border-warning/20 text-warning bg-warning/5",
							)}
						>
							{conclusionLabel(
								conclusion,
								run.run.status,
							)}
						</span>
					</div>
				</div>

				{/* Label */}
				<div className="mt-1 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/25">
					{label}
				</div>
			</div>
		</div>
	);
}

function LogPanel({
	logState,
}: {
	logState: { log: StepLog | undefined; loading: boolean; error: string | null } | null;
}) {
	if (!logState)
		return (
			<div className="px-3 py-3 text-[10px] font-mono text-muted-foreground/20">
				N/A
			</div>
		);
	if (logState.loading) {
		return (
			<div className="flex items-center gap-2 px-3 py-3">
				<Loader2 className="w-3 h-3 animate-spin text-muted-foreground/30" />
				<span className="text-[10px] font-mono text-muted-foreground/25">
					Loading...
				</span>
			</div>
		);
	}
	if (logState.error) {
		return (
			<div className="flex items-center gap-2 px-3 py-3">
				<AlertCircle className="w-3 h-3 text-muted-foreground/25" />
				<span className="text-[10px] font-mono text-muted-foreground/25">
					{logState.error}
				</span>
			</div>
		);
	}
	return <StepLogViewer stepLog={logState.log} />;
}

function StepRows({
	stepName,
	stepA,
	stepB,
	sDurA,
	sDurB,
	sDeltaInfo,
	isStepExpanded,
	logA,
	logB,
	onToggle,
}: {
	stepName: string;
	stepA?: ComparisonRun["jobs"][number]["steps"] extends (infer T)[] | undefined ? T : never;
	stepB?: ComparisonRun["jobs"][number]["steps"] extends (infer T)[] | undefined ? T : never;
	sDurA: number;
	sDurB: number;
	sDeltaInfo: { text: string; className: string } | null;
	isStepExpanded: boolean;
	logA: { log: StepLog | undefined; loading: boolean; error: string | null } | null;
	logB: { log: StepLog | undefined; loading: boolean; error: string | null } | null;
	onToggle: () => void;
}) {
	return (
		<>
			<tr
				className="bg-muted/[0.03] cursor-pointer hover:bg-muted/[0.08] transition-colors"
				onClick={onToggle}
			>
				<td className="pl-8 pr-4 py-1.5 text-[11px] font-mono text-muted-foreground/60">
					<div className="flex items-center gap-1.5">
						<ChevronRight
							className={cn(
								"w-2.5 h-2.5 text-muted-foreground/30 transition-transform duration-200 shrink-0",
								isStepExpanded && "rotate-90",
							)}
						/>
						<span className="text-muted-foreground/25 shrink-0">
							→
						</span>
						<span className="truncate">{stepName}</span>
					</div>
				</td>
				<td className="px-4 py-1.5 text-[11px] font-mono text-muted-foreground/60">
					{stepA ? (
						<div className="flex items-center gap-1.5 justify-end">
							<StatusIcon
								status={stepA.status}
								conclusion={
									stepA.conclusion ?? null
								}
								className="w-2.5 h-2.5"
							/>
							<span className="tabular-nums">
								{formatDurationFromSeconds(sDurA)}
							</span>
						</div>
					) : (
						<span className="text-muted-foreground/20 text-right block">
							—
						</span>
					)}
				</td>
				<td className="px-4 py-1.5 text-[11px] font-mono text-muted-foreground/60">
					{stepB ? (
						<div className="flex items-center gap-1.5 justify-end">
							<StatusIcon
								status={stepB.status}
								conclusion={
									stepB.conclusion ?? null
								}
								className="w-2.5 h-2.5"
							/>
							<span className="tabular-nums">
								{formatDurationFromSeconds(sDurB)}
							</span>
							{sDeltaInfo && sDeltaInfo.text && (
								<span
									className={cn(
										"text-[10px]",
										sDeltaInfo.className,
									)}
								>
									{sDeltaInfo.text}
								</span>
							)}
						</div>
					) : (
						<span className="text-muted-foreground/20 text-right block">
							—
						</span>
					)}
				</td>
			</tr>
			<tr className="bg-muted/[0.02]">
				<td className="p-0" />
				<td className="p-0 align-top">
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-200 ease-out",
							isStepExpanded
								? "grid-rows-[1fr]"
								: "grid-rows-[0fr]",
						)}
					>
						<div className="overflow-hidden min-h-0">
							<div>
								<LogPanel logState={logA} />
							</div>
						</div>
					</div>
				</td>
				<td className="p-0 align-top">
					<div
						className={cn(
							"grid transition-[grid-template-rows] duration-200 ease-out",
							isStepExpanded
								? "grid-rows-[1fr]"
								: "grid-rows-[0fr]",
						)}
					>
						<div className="overflow-hidden min-h-0">
							<div>
								<LogPanel logState={logB} />
							</div>
						</div>
					</div>
				</td>
			</tr>
		</>
	);
}

function JobRow({
	jobName,
	jobA,
	jobB,
	maxDuration,
	owner,
	repo,
}: {
	jobName: string;
	jobA?: ComparisonRun["jobs"][number];
	jobB?: ComparisonRun["jobs"][number];
	maxDuration: number;
	owner: string;
	repo: string;
}) {
	const [expanded, setExpanded] = useState(false);
	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
	const jobLogsRef = useRef<Map<number, JobLogsState>>(new Map());
	const [, forceUpdate] = useState(0);

	const durationA = jobA ? calculateDuration(jobA.started_at, jobA.completed_at) : 0;
	const durationB = jobB ? calculateDuration(jobB.started_at, jobB.completed_at) : 0;
	const delta = jobA && jobB ? durationB - durationA : undefined;
	const deltaInfo = delta !== undefined ? formatDurationDelta(delta) : null;

	const statusChanged = jobA && jobB && jobA.conclusion !== jobB.conclusion;

	const stepsA = jobA?.steps ?? [];
	const stepsB = jobB?.steps ?? [];
	const allStepNames = [
		...new Set([...stepsA.map((s) => s.name), ...stepsB.map((s) => s.name)]),
	];
	const hasSteps = allStepNames.length > 0;

	const fetchJobLogs = useCallback(
		async (jobId: number) => {
			const existing = jobLogsRef.current.get(jobId);
			if (existing) return;

			jobLogsRef.current.set(jobId, { steps: [], loading: true, error: null });
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
								? "Logs expired"
								: (body.error ??
									"Failed to fetch logs"),
					});
				} else {
					const data = await res.json();
					jobLogsRef.current.set(jobId, {
						steps: data.steps ?? [],
						loading: false,
						error: null,
					});
				}
			} catch {
				jobLogsRef.current.set(jobId, {
					steps: [],
					loading: false,
					error: "Failed to fetch logs",
				});
			}
			forceUpdate((n) => n + 1);
		},
		[owner, repo],
	);

	function getStepLog(
		jobId: number,
		stepName: string,
		stepNumber?: number,
	): { log: StepLog | undefined; loading: boolean; error: string | null } {
		const state = jobLogsRef.current.get(jobId);
		if (!state) return { log: undefined, loading: false, error: null };
		if (state.loading) return { log: undefined, loading: true, error: null };
		if (state.error) return { log: undefined, loading: false, error: state.error };
		// Match by step number first (log step names from ##[group] markers often differ from API step names)
		let log =
			stepNumber !== undefined
				? state.steps.find((s) => s.stepNumber === stepNumber)
				: undefined;
		if (!log) {
			log = state.steps.find(
				(s) => s.stepName.toLowerCase() === stepName.toLowerCase(),
			);
		}
		return { log, loading: false, error: null };
	}

	return (
		<>
			<tr
				className={cn(
					"group transition-colors",
					hasSteps && "cursor-pointer hover:bg-muted/15",
					statusChanged && "bg-warning/[0.03]",
				)}
				onClick={() => hasSteps && setExpanded(!expanded)}
			>
				<td className="px-4 py-2.5 text-[12px] font-mono">
					<div className="flex items-center gap-2">
						{hasSteps ? (
							<ChevronRight
								className={cn(
									"w-3 h-3 text-muted-foreground/25 transition-transform duration-200 shrink-0",
									expanded && "rotate-90",
								)}
							/>
						) : (
							<span className="w-3 shrink-0" />
						)}
						<span
							className={cn(
								"truncate",
								statusChanged && "text-warning",
							)}
						>
							{jobName}
						</span>
						{statusChanged && (
							<span className="text-[9px] font-mono px-1 py-0.5 bg-warning/10 text-warning/70 shrink-0">
								changed
							</span>
						)}
					</div>
				</td>
				<td className="px-4 py-2.5 text-[12px] font-mono">
					{jobA ? (
						<div>
							<div className="flex items-center gap-2 justify-end">
								<StatusIcon
									status={jobA.status}
									conclusion={
										jobA.conclusion ??
										null
									}
									className="w-3 h-3"
								/>
								<span className="tabular-nums">
									{formatDurationFromSeconds(
										durationA,
									)}
								</span>
							</div>
							<DurationBar
								seconds={durationA}
								maxSeconds={maxDuration}
								conclusion={jobA.conclusion}
							/>
						</div>
					) : (
						<span className="text-muted-foreground/15 text-right block">
							—
						</span>
					)}
				</td>
				<td className="px-4 py-2.5 text-[12px] font-mono">
					{jobB ? (
						<div>
							<div className="flex items-center gap-2 justify-end">
								<StatusIcon
									status={jobB.status}
									conclusion={
										jobB.conclusion ??
										null
									}
									className="w-3 h-3"
								/>
								<span className="tabular-nums">
									{formatDurationFromSeconds(
										durationB,
									)}
								</span>
								{deltaInfo && deltaInfo.text && (
									<span
										className={cn(
											"text-[10px] ml-0.5",
											deltaInfo.className,
										)}
									>
										{deltaInfo.text}
									</span>
								)}
							</div>
							<DurationBar
								seconds={durationB}
								maxSeconds={maxDuration}
								conclusion={jobB.conclusion}
							/>
						</div>
					) : (
						<span className="text-muted-foreground/15 text-right block">
							—
						</span>
					)}
				</td>
			</tr>

			{/* Steps container — always rendered for smooth animation */}
			{hasSteps && (
				<tr>
					<td colSpan={3} className="p-0">
						<div
							className={cn(
								"grid transition-[grid-template-rows] duration-200 ease-out",
								expanded
									? "grid-rows-[1fr]"
									: "grid-rows-[0fr]",
							)}
						>
							<div className="overflow-hidden min-h-0">
								<table className="w-full">
									<colgroup>
										<col className="w-[40%]" />
										<col className="w-[30%]" />
										<col className="w-[30%]" />
									</colgroup>
									<tbody>
										{allStepNames.map(
											(
												stepName,
											) => {
												const stepA =
													stepsA.find(
														(
															s,
														) =>
															s.name ===
															stepName,
													);
												const stepB =
													stepsB.find(
														(
															s,
														) =>
															s.name ===
															stepName,
													);
												const sDurA =
													stepA
														? calculateDuration(
																stepA.started_at,
																stepA.completed_at,
															)
														: 0;
												const sDurB =
													stepB
														? calculateDuration(
																stepB.started_at,
																stepB.completed_at,
															)
														: 0;
												const sDelta =
													stepA &&
													stepB
														? sDurB -
															sDurA
														: undefined;
												const sDeltaInfo =
													sDelta !==
													undefined
														? formatDurationDelta(
																sDelta,
															)
														: null;

												const isStepExpanded =
													expandedSteps.has(
														stepName,
													);
												const stepAIdx =
													stepsA.findIndex(
														(
															s,
														) =>
															s.name ===
															stepName,
													);
												const stepBIdx =
													stepsB.findIndex(
														(
															s,
														) =>
															s.name ===
															stepName,
													);
												const logA =
													jobA
														? getStepLog(
																jobA.id,
																stepName,
																stepAIdx >=
																	0
																	? stepAIdx +
																			1
																	: undefined,
															)
														: null;
												const logB =
													jobB
														? getStepLog(
																jobB.id,
																stepName,
																stepBIdx >=
																	0
																	? stepBIdx +
																			1
																	: undefined,
															)
														: null;

												return (
													<StepRows
														key={
															stepName
														}
														stepName={
															stepName
														}
														stepA={
															stepA
														}
														stepB={
															stepB
														}
														sDurA={
															sDurA
														}
														sDurB={
															sDurB
														}
														sDeltaInfo={
															sDeltaInfo
														}
														isStepExpanded={
															isStepExpanded
														}
														logA={
															logA
														}
														logB={
															logB
														}
														onToggle={() => {
															setExpandedSteps(
																(
																	prev,
																) => {
																	const next =
																		new Set(
																			prev,
																		);
																	if (
																		next.has(
																			stepName,
																		)
																	) {
																		next.delete(
																			stepName,
																		);
																	} else {
																		next.add(
																			stepName,
																		);
																		if (
																			jobA
																		)
																			fetchJobLogs(
																				jobA.id,
																			);
																		if (
																			jobB
																		)
																			fetchJobLogs(
																				jobB.id,
																			);
																	}
																	return next;
																},
															);
														}}
													/>
												);
											},
										)}
									</tbody>
								</table>
							</div>
						</div>
					</td>
				</tr>
			)}
		</>
	);
}

export function RunComparisonDiff({
	runs,
	owner,
	repo,
}: {
	runs: [ComparisonRun, ComparisonRun];
	owner: string;
	repo: string;
}) {
	const [runA, runB] = runs;

	const totalA = calculateDuration(runA.run.run_started_at, runA.run.updated_at);
	const totalB = calculateDuration(runB.run.run_started_at, runB.run.updated_at);
	const totalDelta = totalB - totalA;

	const allJobNames = [
		...new Set([...runA.jobs.map((j) => j.name), ...runB.jobs.map((j) => j.name)]),
	].sort();

	const maxJobDuration = Math.max(
		...runA.jobs.map((j) => calculateDuration(j.started_at, j.completed_at)),
		...runB.jobs.map((j) => calculateDuration(j.started_at, j.completed_at)),
		1,
	);

	const deltaInfo = formatDurationDelta(totalDelta);
	const jobsChanged = allJobNames.filter((name) => {
		const a = runA.jobs.find((j) => j.name === name);
		const b = runB.jobs.find((j) => j.name === name);
		return a && b && a.conclusion !== b.conclusion;
	}).length;

	return (
		<div className="space-y-4">
			{/* Summary pills */}
			<div className="flex items-center gap-3 flex-wrap">
				{totalDelta !== 0 && (
					<div
						className={cn(
							"inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono border",
							totalDelta < 0
								? "border-success/15 bg-success/5 text-success"
								: "border-destructive/15 bg-destructive/5 text-destructive",
						)}
					>
						{totalDelta < 0 ? (
							<TrendingDown className="w-3 h-3" />
						) : (
							<TrendingUp className="w-3 h-3" />
						)}
						Run #{runB.run.run_number} was{" "}
						{formatDurationFromSeconds(Math.abs(totalDelta))}{" "}
						{totalDelta < 0 ? "faster" : "slower"}
					</div>
				)}
				{totalDelta === 0 && totalA > 0 && (
					<div className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono border border-border/30 text-muted-foreground/50">
						<Minus className="w-3 h-3" />
						Same total duration
					</div>
				)}
				{jobsChanged > 0 && (
					<div className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono border border-warning/15 bg-warning/5 text-warning">
						{jobsChanged} job{jobsChanged > 1 ? "s" : ""}{" "}
						changed status
					</div>
				)}
			</div>

			{/* Metadata cards */}
			<div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
				<RunMetadataCard
					run={runA}
					label="Base run"
					owner={owner}
					repo={repo}
				/>
				<RunMetadataCard
					run={runB}
					label="Compare run"
					delta={totalDelta}
					owner={owner}
					repo={repo}
				/>
			</div>

			{/* Section label */}
			<div className="flex items-center gap-3">
				<h3 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/30">
					Jobs & steps
				</h3>
				<div className="flex-1 h-px bg-border/20" />
				<span className="text-[10px] font-mono text-muted-foreground/20">
					{allJobNames.length} job
					{allJobNames.length !== 1 ? "s" : ""}
				</span>
			</div>

			{/* Jobs table */}
			<div className="border border-border/40 overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b border-border/30">
							<th className="px-4 py-2.5 text-left text-[10px] font-mono text-muted-foreground/30 font-normal uppercase tracking-wider w-[40%]">
								Job
							</th>
							<th className="px-4 py-2.5 text-right text-[10px] font-mono text-muted-foreground/30 font-normal uppercase tracking-wider w-[30%]">
								<Link
									href={`/${owner}/${repo}/actions/${runA.run.id}`}
									className="inline-flex items-center gap-1.5 hover:text-blue-400 transition-colors"
								>
									<span
										className={cn(
											"w-1.5 h-1.5 rounded-full",
											runA.run
												.conclusion ===
												"success"
												? "bg-success/60"
												: runA
															.run
															.conclusion ===
													  "failure"
													? "bg-destructive/60"
													: "bg-muted-foreground/30",
										)}
									/>
									#{runA.run.run_number}
								</Link>
							</th>
							<th className="px-4 py-2.5 text-right text-[10px] font-mono text-muted-foreground/30 font-normal uppercase tracking-wider w-[30%]">
								<Link
									href={`/${owner}/${repo}/actions/${runB.run.id}`}
									className="inline-flex items-center gap-1.5 hover:text-blue-400 transition-colors"
								>
									<span
										className={cn(
											"w-1.5 h-1.5 rounded-full",
											runB.run
												.conclusion ===
												"success"
												? "bg-success/60"
												: runB
															.run
															.conclusion ===
													  "failure"
													? "bg-destructive/60"
													: "bg-muted-foreground/30",
										)}
									/>
									#{runB.run.run_number}
								</Link>
							</th>
						</tr>
					</thead>
					<tbody className="divide-y divide-border/15">
						{allJobNames.map((jobName) => (
							<JobRow
								key={jobName}
								jobName={jobName}
								jobA={runA.jobs.find(
									(j) => j.name === jobName,
								)}
								jobB={runB.jobs.find(
									(j) => j.name === jobName,
								)}
								maxDuration={maxJobDuration}
								owner={owner}
								repo={repo}
							/>
						))}
					</tbody>
					<tfoot>
						<tr className="border-t border-border/30 bg-muted/[0.04]">
							<td className="px-4 py-2.5 text-[11px] font-mono font-medium text-muted-foreground">
								Total
							</td>
							<td className="px-4 py-2.5 text-[12px] font-mono font-medium text-right tabular-nums">
								{formatDurationFromSeconds(totalA)}
							</td>
							<td className="px-4 py-2.5 text-[12px] font-mono font-medium text-right tabular-nums">
								{formatDurationFromSeconds(totalB)}
								{deltaInfo.text && (
									<span
										className={cn(
											"ml-1.5 text-[10px]",
											deltaInfo.className,
										)}
									>
										{deltaInfo.text}
									</span>
								)}
							</td>
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	);
}
