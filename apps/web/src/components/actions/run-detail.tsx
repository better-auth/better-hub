"use client";

import { useState, useCallback, useRef } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LiveDuration } from "@/components/ui/live-duration";
import { TimeAgo } from "@/components/ui/time-ago";
import { StatusIcon } from "./status-icon";

interface WorkflowRun {
	id: number;
	name?: string | null;
	display_title: string;
	run_number: number;
	status: string | null;
	conclusion: string | null;
	head_branch: string | null;
	head_sha: string;
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

interface JobLogsState {
	steps: StepLog[];
	loading: boolean;
	error: string | null;
}

function conclusionLabel(conclusion: string | null, status: string): string {
	if (status === "in_progress" || status === "queued" || status === "waiting")
		return status.replace("_", " ");
	return conclusion ?? status;
}

const COLLAPSED_LINE_LIMIT = 200;

function StepLogViewer({ stepLog }: { stepLog: StepLog | undefined }) {
	const [expanded, setExpanded] = useState(false);

	if (!stepLog || stepLog.lines.length === 0) {
		return (
			<div className="px-4 py-3 text-[11px] font-mono text-muted-foreground">
				No log output for this step
			</div>
		);
	}

	const isLong = stepLog.lines.length > COLLAPSED_LINE_LIMIT;
	const visibleLines =
		!isLong || expanded ? stepLog.lines : stepLog.lines.slice(0, COLLAPSED_LINE_LIMIT);

	return (
		<div className="bg-black/20">
			<table className="w-full text-[11px] font-mono leading-[1.6]">
				<tbody>
					{visibleLines.map((line, i) => (
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
							<td className="px-3 py-0 text-right text-muted-foreground/20 select-none align-top w-[1%] whitespace-nowrap">
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
					))}
				</tbody>
			</table>
			{isLong && !expanded && (
				<button
					onClick={() => setExpanded(true)}
					className="w-full px-4 py-2 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground/70 bg-black/10 hover:bg-black/20 transition-colors cursor-pointer border-t border-border/20"
				>
					Show all {stepLog.lines.length} lines (
					{stepLog.lines.length - COLLAPSED_LINE_LIMIT} more)
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
}: {
	owner: string;
	repo: string;
	run: WorkflowRun;
	jobs: Job[];
}) {
	const [expandedSteps, setExpandedSteps] = useState<Set<string>>(new Set());
	const jobLogsRef = useRef<Map<number, JobLogsState>>(new Map());
	const [, forceUpdate] = useState(0);

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

			// Mark as loading
			jobLogsRef.current.set(jobId, {
				steps: [],
				loading: true,
				error: null,
			});
			forceUpdate((n) => n + 1);

			// Find the job to get owner/repo context
			const job = jobs.find((j) => j.id === jobId);
			if (!job) return;

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

		// Try matching by step number first, then by name
		const log =
			jobState.steps.find((s) => s.stepNumber === stepNumber) ??
			jobState.steps.find(
				(s) => s.stepName.toLowerCase() === stepName.toLowerCase(),
			);
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
									{run.display_title}
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
									<span className="flex items-center gap-1 text-[10px] text-muted-foreground/50">
										<GitBranch className="w-2.5 h-2.5" />
										{run.head_branch}
									</span>
								)}
								<span className="text-[9px] font-mono px-1 py-0.5 border border-border text-muted-foreground/50">
									{run.event}
								</span>
								<span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
									<GitCommit className="w-2.5 h-2.5" />
									{run.head_sha.slice(0, 7)}
								</span>
								{run.run_started_at && (
									<span className="flex items-center gap-1 text-[10px] text-muted-foreground">
										<Clock className="w-2.5 h-2.5" />
										<LiveDuration
											startedAt={run.run_started_at}
											completedAt={
												run.status === "completed"
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
								className="flex items-center gap-2 shrink-0 hover:text-foreground transition-colors"
							>
								<Image
									src={run.actor.avatar_url}
									alt={run.actor.login}
									width={20}
									height={20}
									className="rounded-full"
								/>
								<span className="text-[10px] font-mono text-muted-foreground/50">
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
										startedAt={job.started_at}
										completedAt={job.completed_at}
									/>
								</span>
							)}
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
