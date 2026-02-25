"use client";

import Link from "next/link";
import { cn, calculateDuration } from "@/lib/utils";
import { StatusIcon } from "./status-icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { GitBranch } from "lucide-react";
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

function StatusCell({
	job,
	maxDuration,
}: {
	job: ComparisonRun["jobs"][number] | undefined;
	maxDuration: number;
}) {
	if (!job) {
		return (
			<td className="px-3 py-2.5 text-center">
				<span className="text-[11px] font-mono text-muted-foreground/12">
					—
				</span>
			</td>
		);
	}

	const duration = calculateDuration(job.started_at, job.completed_at);
	const pct = maxDuration > 0 ? Math.max(3, (duration / maxDuration) * 100) : 0;

	const isSkipped = job.conclusion === "skipped";
	const isCancelled = job.conclusion === "cancelled";

	return (
		<td
			className={cn(
				"px-3 py-2.5 text-center relative",
				job.conclusion === "failure" && "bg-destructive/[0.04]",
			)}
		>
			<div className="flex flex-col items-center gap-1">
				<div className="flex items-center gap-1.5 justify-center">
					<StatusIcon
						status={job.status}
						conclusion={job.conclusion ?? null}
						className="w-3 h-3"
					/>
					{isSkipped ? (
						<span className="text-[11px] font-mono text-muted-foreground/25">
							skip
						</span>
					) : isCancelled ? (
						<span className="text-[11px] font-mono text-muted-foreground/25">
							cancel
						</span>
					) : (
						<span className="text-[11px] font-mono tabular-nums">
							{formatDurationFromSeconds(duration)}
						</span>
					)}
				</div>
				{/* Mini duration bar */}
				{!isSkipped && !isCancelled && maxDuration > 0 && (
					<div className="h-0.5 w-full max-w-[80px] bg-muted/15 overflow-hidden mx-auto">
						<div
							className={cn(
								"h-full",
								job.conclusion === "success" &&
									"bg-success/30",
								job.conclusion === "failure" &&
									"bg-destructive/30",
								!job.conclusion && "bg-warning/30",
							)}
							style={{ width: `${pct}%` }}
						/>
					</div>
				)}
			</div>
		</td>
	);
}

export function RunComparisonTimeline({
	runs,
	owner,
	repo,
}: {
	runs: ComparisonRun[];
	owner: string;
	repo: string;
}) {
	const allJobNames = [...new Set(runs.flatMap((r) => r.jobs.map((j) => j.name)))].sort();

	// Find max duration across all jobs for bar scaling
	const maxJobDuration = Math.max(
		...runs.flatMap((r) =>
			r.jobs.map((j) => calculateDuration(j.started_at, j.completed_at)),
		),
		1,
	);

	// Compute total durations for trend
	const totalDurations = runs.map((r) =>
		calculateDuration(r.run.run_started_at, r.run.updated_at),
	);
	const minTotal = Math.min(...totalDurations);
	const maxTotal = Math.max(...totalDurations);

	// Count failures per run
	const failureCounts = runs.map(
		(r) => r.jobs.filter((j) => j.conclusion === "failure").length,
	);

	return (
		<div className="space-y-6">
			{/* Summary row */}
			<div className="flex items-center gap-4 flex-wrap">
				<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/30">
					{runs.length} runs · {allJobNames.length} job
					{allJobNames.length !== 1 ? "s" : ""}
				</span>
				{minTotal !== maxTotal && (
					<div className="inline-flex items-center gap-2 px-3 py-1.5 text-[11px] font-mono border border-border/20 text-muted-foreground">
						Duration range:{" "}
						{formatDurationFromSeconds(minTotal)} —{" "}
						{formatDurationFromSeconds(maxTotal)}
					</div>
				)}
			</div>

			{/* Table */}
			<div className="border border-border/40 overflow-x-auto">
				<table className="w-full">
					<thead>
						<tr className="border-b border-border/30">
							<th className="px-4 py-3 text-left text-[10px] font-mono text-muted-foreground/25 font-normal uppercase tracking-wider sticky left-0 bg-background z-10 min-w-[160px]" />
							{runs.map((r) => (
								<th
									key={r.run.id}
									className="px-3 py-3 text-center font-normal min-w-[130px]"
								>
									<div className="flex flex-col items-center gap-1.5">
										{/* Run number + status */}
										<Link
											href={`/${owner}/${repo}/actions/${r.run.id}`}
											className="flex items-center gap-1.5 hover:text-blue-400 transition-colors"
										>
											<StatusIcon
												status={
													r
														.run
														.status ??
													""
												}
												conclusion={
													r
														.run
														.conclusion ??
													null
												}
												className="w-3 h-3"
											/>
											<span className="text-[12px] font-mono font-medium tabular-nums">
												#
												{
													r
														.run
														.run_number
												}
											</span>
										</Link>

										{/* Branch */}
										{r.run
											.head_branch && (
											<Link
												href={`/${owner}/${repo}/tree/${r.run.head_branch}`}
												className="flex items-center gap-1 max-w-[110px] hover:text-blue-400 transition-colors"
											>
												<GitBranch className="w-2.5 h-2.5 text-muted-foreground/20 shrink-0" />
												<span className="text-[10px] font-mono text-muted-foreground/30 truncate">
													{
														r
															.run
															.head_branch
													}
												</span>
											</Link>
										)}

										{/* Time ago */}
										<span className="text-[10px] font-mono text-muted-foreground/20">
											<TimeAgo
												date={
													r
														.run
														.updated_at
												}
											/>
										</span>
									</div>
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-border/10">
						{allJobNames.map((jobName, idx) => (
							<tr
								key={jobName}
								className={cn(
									"hover:bg-muted/10 transition-colors",
									idx % 2 === 1 &&
										"bg-muted/[0.02]",
								)}
							>
								<td className="px-4 py-2.5 text-[12px] font-mono whitespace-nowrap sticky left-0 bg-background z-10">
									{jobName}
								</td>
								{runs.map((r) => (
									<StatusCell
										key={r.run.id}
										job={r.jobs.find(
											(j) =>
												j.name ===
												jobName,
										)}
										maxDuration={
											maxJobDuration
										}
									/>
								))}
							</tr>
						))}
					</tbody>

					{/* Total footer */}
					<tfoot>
						<tr className="border-t border-border/30 bg-muted/[0.04]">
							<td className="px-4 py-2.5 text-[11px] font-mono font-medium text-muted-foreground sticky left-0 bg-muted/[0.04] z-10">
								Total
							</td>
							{runs.map((r, i) => {
								const total = totalDurations[i];
								const isFastest =
									total === minTotal &&
									minTotal !== maxTotal;
								const isSlowest =
									total === maxTotal &&
									minTotal !== maxTotal;
								return (
									<td
										key={r.run.id}
										className="px-3 py-2.5 text-center"
									>
										<div className="flex flex-col items-center gap-0.5">
											<span
												className={cn(
													"text-[12px] font-mono font-medium tabular-nums",
													isFastest &&
														"text-success",
													isSlowest &&
														"text-destructive/70",
												)}
											>
												{formatDurationFromSeconds(
													total,
												)}
											</span>
											{isFastest && (
												<span className="text-[9px] font-mono text-success/50">
													fastest
												</span>
											)}
											{isSlowest && (
												<span className="text-[9px] font-mono text-destructive/40">
													slowest
												</span>
											)}
										</div>
									</td>
								);
							})}
						</tr>
					</tfoot>
				</table>
			</div>
		</div>
	);
}
