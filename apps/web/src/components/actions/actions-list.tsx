"use client";

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import {
	Play,
	GitBranch,
	Clock,
	ChevronDown,
	Search,
	X,
	Loader2,
	ChevronLeft,
	ChevronRight,
	ArrowLeftRight,
} from "lucide-react";
import { cn, formatDuration } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { StatusIcon } from "./status-icon";
import { RunComparisonInline } from "./run-comparison-inline";

interface Workflow {
	id: number;
	name: string;
	state: string;
	path: string;
}

interface WorkflowRun {
	id: number;
	name?: string | null;
	display_title: string;
	run_number: number;
	status: string | null;
	conclusion: string | null;
	workflow_id: number;
	head_branch: string | null;
	event: string;
	run_started_at?: string | null;
	updated_at: string;
	created_at: string;
	actor: { login: string; avatar_url: string } | null;
}

type StatusFilter = "all" | "success" | "failure" | "in_progress" | "cancelled" | "skipped";

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
	{ value: "all", label: "All statuses" },
	{ value: "success", label: "Success" },
	{ value: "failure", label: "Failure" },
	{ value: "in_progress", label: "In progress" },
	{ value: "cancelled", label: "Cancelled" },
	{ value: "skipped", label: "Skipped" },
];

const PER_PAGE = 30;

function FilterSection({
	label,
	value,
	options,
	onChange,
	searchable,
}: {
	label: string;
	value: string;
	options: { value: string; label: string }[];
	onChange: (value: string) => void;
	searchable?: boolean;
}) {
	const [search, setSearch] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const isDefault = options[0]?.value === value;

	const filtered = useMemo(() => {
		if (!search) return options;
		const q = search.toLowerCase();
		return options.filter(
			(o) => o.value === options[0]?.value || o.label.toLowerCase().includes(q),
		);
	}, [options, search]);

	return (
		<div>
			<div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
				<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/30 flex-1">
					{label}
				</span>
				{!isDefault && (
					<button
						onClick={() => {
							onChange(options[0]?.value ?? "all");
							setSearch("");
						}}
						className="text-[9px] font-mono text-blue-400/60 hover:text-blue-400 transition-colors cursor-pointer"
					>
						clear
					</button>
				)}
			</div>
			{searchable && options.length > 6 && (
				<div className="flex items-center gap-1.5 mx-3 mb-1 px-2 py-1 border border-border/40 bg-muted/10">
					<Search className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
					<input
						ref={inputRef}
						type="text"
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						placeholder={`Filter ${label.toLowerCase()}...`}
						className="flex-1 bg-transparent text-[10px] font-mono placeholder:text-muted-foreground/20 focus:outline-none min-w-0"
					/>
					{search && (
						<button
							onClick={() => setSearch("")}
							className="text-muted-foreground/30 hover:text-muted-foreground cursor-pointer"
						>
							<X className="w-2.5 h-2.5" />
						</button>
					)}
				</div>
			)}
			<div
				className={cn(
					"overflow-y-auto",
					searchable && options.length > 6
						? "max-h-[160px]"
						: "max-h-[200px]",
				)}
			>
				{filtered.map((opt) => (
					<button
						key={opt.value}
						onClick={() => {
							onChange(opt.value);
							setSearch("");
						}}
						className={cn(
							"w-full text-left px-3 py-1 text-[11px] font-mono hover:bg-muted/50 transition-colors cursor-pointer truncate",
							value === opt.value &&
								"text-foreground font-medium bg-muted/20",
						)}
					>
						{opt.label}
					</button>
				))}
				{filtered.length === 0 && (
					<div className="px-3 py-2 text-[10px] font-mono text-muted-foreground/25 text-center">
						No matches
					</div>
				)}
			</div>
		</div>
	);
}

function CombinedFilterDropdown({
	filters,
}: {
	filters: {
		label: string;
		value: string;
		options: { value: string; label: string }[];
		onChange: (value: string) => void;
		searchable?: boolean;
	}[];
}) {
	const [open, setOpen] = useState(false);
	const activeFilters = filters.filter((f) => f.options[0]?.value !== f.value);
	const activeCount = activeFilters.length;

	return (
		<div className="relative">
			<div className="flex items-center gap-1.5">
				<button
					onClick={() => setOpen(!open)}
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono border transition-colors cursor-pointer",
						activeCount > 0
							? "border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10"
							: "border-border/60 text-muted-foreground hover:border-border hover:text-foreground/80",
					)}
				>
					Filters
					{activeCount > 0 && (
						<span className="flex items-center justify-center w-4 h-4 bg-blue-500/15 text-blue-400 text-[10px] font-medium tabular-nums">
							{activeCount}
						</span>
					)}
					<ChevronDown
						className={cn(
							"w-3 h-3 shrink-0 opacity-50 transition-transform",
							open && "rotate-180",
						)}
					/>
				</button>
				{/* Active filter chips */}
				{activeFilters.map((f) => {
					const selected = f.options.find((o) => o.value === f.value);
					return (
						<span
							key={f.label}
							className="inline-flex items-center gap-1 px-2 py-1 text-[10px] font-mono bg-blue-500/8 text-blue-400/80 border border-blue-500/15"
						>
							<span className="text-blue-400/40">
								{f.label}:
							</span>
							<span className="truncate max-w-[80px]">
								{selected?.label ?? f.value}
							</span>
							<button
								onClick={(e) => {
									e.stopPropagation();
									f.onChange(
										f.options[0]
											?.value ??
											"all",
									);
								}}
								className="ml-0.5 text-blue-400/30 hover:text-blue-400 transition-colors cursor-pointer"
							>
								<X className="w-2.5 h-2.5" />
							</button>
						</span>
					);
				})}
			</div>
			{open && (
				<>
					<div
						className="fixed inset-0 z-10"
						onClick={() => setOpen(false)}
					/>
					<div className="absolute top-full left-0 mt-1 z-20 min-w-[260px] border border-border bg-background shadow-lg">
						{filters.map((filter, fi) => (
							<div key={filter.label}>
								{fi > 0 && (
									<div className="h-px bg-border/20" />
								)}
								<FilterSection
									label={filter.label}
									value={filter.value}
									options={filter.options}
									onChange={filter.onChange}
									searchable={
										filter.searchable
									}
								/>
							</div>
						))}
					</div>
				</>
			)}
		</div>
	);
}

function WorkflowFilterDropdown({
	workflows,
	value,
	onChange,
}: {
	workflows: Workflow[];
	value: number | null;
	onChange: (id: number | null) => void;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const selected = workflows.find((w) => w.id === value);
	const isDefault = !value;

	const filtered = useMemo(() => {
		const sorted = [...workflows].sort((a, b) => a.name.localeCompare(b.name));
		if (!search) return sorted;
		const q = search.toLowerCase();
		return sorted.filter((w) => w.name.toLowerCase().includes(q));
	}, [workflows, search]);

	useEffect(() => {
		if (open) {
			setSearch("");
			setTimeout(() => inputRef.current?.focus(), 0);
		}
	}, [open]);

	return (
		<div className="relative">
			<button
				onClick={() => setOpen(!open)}
				className={cn(
					"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono border transition-colors cursor-pointer",
					isDefault
						? "border-border/60 text-muted-foreground hover:border-border hover:text-foreground/80"
						: "border-blue-500/30 bg-blue-500/5 text-blue-400 hover:bg-blue-500/10",
				)}
			>
				<span
					className={
						isDefault
							? "text-muted-foreground/60"
							: "text-blue-400/60"
					}
				>
					Workflow
				</span>
				<span className="truncate max-w-[140px]">
					{selected?.name ?? "All workflows"}
				</span>
				<ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
			</button>
			{open && (
				<>
					<div
						className="fixed inset-0 z-10"
						onClick={() => setOpen(false)}
					/>
					<div className="absolute top-full left-0 mt-1 z-20 min-w-[260px] border border-border bg-background shadow-lg">
						<div className="flex items-center gap-2 px-2.5 py-2 border-b border-border/60">
							<Search className="w-3 h-3 text-muted-foreground shrink-0" />
							<input
								ref={inputRef}
								type="text"
								value={search}
								onChange={(e) =>
									setSearch(e.target.value)
								}
								placeholder="Filter workflows…"
								className="flex-1 bg-transparent text-[11px] font-mono placeholder:text-muted-foreground/30 focus:outline-none"
							/>
							{search && (
								<button
									onClick={() =>
										setSearch("")
									}
									className="text-muted-foreground hover:text-muted-foreground cursor-pointer"
								>
									<X className="w-3 h-3" />
								</button>
							)}
						</div>
						<div className="max-h-[260px] overflow-y-auto">
							<button
								onClick={() => {
									onChange(null);
									setOpen(false);
								}}
								className={cn(
									"w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-muted/50 transition-colors cursor-pointer",
									!value &&
										"text-foreground font-medium bg-muted/20",
								)}
							>
								All workflows
							</button>
							{filtered.map((wf) => (
								<button
									key={wf.id}
									onClick={() => {
										onChange(wf.id);
										setOpen(false);
									}}
									className={cn(
										"w-full text-left px-3 py-1.5 text-[11px] font-mono hover:bg-muted/50 transition-colors cursor-pointer truncate",
										value === wf.id &&
											"text-foreground font-medium bg-muted/20",
									)}
								>
									{wf.name}
								</button>
							))}
							{filtered.length === 0 && (
								<div className="px-3 py-3 text-[11px] font-mono text-muted-foreground text-center">
									No workflows match
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}

async function fetchWorkflowRuns(
	owner: string,
	repo: string,
	workflowId: number | null,
	page: number,
): Promise<{ total_count: number; workflow_runs: WorkflowRun[] }> {
	const params = new URLSearchParams({
		owner,
		repo,
		page: String(page),
		per_page: String(PER_PAGE),
	});
	if (workflowId) params.set("workflow_id", String(workflowId));
	const res = await fetch(`/api/workflow-runs?${params}`);
	if (!res.ok) throw new Error("Failed to fetch workflow runs");
	return res.json();
}

export function ActionsList({
	owner,
	repo,
	workflows,
	runs: initialRuns,
	initialTotalCount,
	initialWorkflow,
}: {
	owner: string;
	repo: string;
	workflows: Workflow[];
	runs: WorkflowRun[];
	initialTotalCount: number;
	initialWorkflow?: string;
}) {
	const initialWorkflowId = useMemo(() => {
		if (!initialWorkflow) return null;
		const wf = workflows.find(
			(w) =>
				w.path === `.github/workflows/${initialWorkflow}` ||
				w.path === initialWorkflow,
		);
		return wf?.id ?? null;
	}, [initialWorkflow, workflows]);

	const [workflowFilter, setWorkflowFilter] = useState<number | null>(initialWorkflowId);
	const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
	const [eventFilter, setEventFilter] = useState<string>("all");
	const [branchFilter, setBranchFilter] = useState<string>("all");
	const [actorFilter, setActorFilter] = useState<string>("all");

	// Pagination + fetched runs
	const [page, setPage] = useState(1);
	const [displayRuns, setDisplayRuns] = useState<WorkflowRun[]>(initialRuns);
	const [totalCount, setTotalCount] = useState(initialTotalCount);
	const [loading, setLoading] = useState(false);

	// Run comparison selection
	const [selectedRuns, setSelectedRuns] = useState<Set<number>>(new Set());
	const [showCompare, setShowCompare] = useState(false);

	function toggleRunSelection(runId: number) {
		setSelectedRuns((prev) => {
			const next = new Set(prev);
			if (next.has(runId)) next.delete(runId);
			else if (next.size < 10) next.add(runId);
			return next;
		});
	}

	const selectedWorkflow = workflows.find((w) => w.id === workflowFilter);
	const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

	// Fetch runs when workflow or page changes
	useEffect(() => {
		// On initial render with no workflow filter and page 1, use SSR data
		if (!workflowFilter && page === 1) {
			setDisplayRuns(initialRuns);
			setTotalCount(initialTotalCount);
			return;
		}

		let cancelled = false;
		setLoading(true);
		fetchWorkflowRuns(owner, repo, workflowFilter, page)
			.then((data) => {
				if (cancelled) return;
				setDisplayRuns(data.workflow_runs as WorkflowRun[]);
				setTotalCount(data.total_count);
			})
			.catch(() => {
				if (cancelled) return;
				setDisplayRuns([]);
				setTotalCount(0);
			})
			.finally(() => {
				if (!cancelled) setLoading(false);
			});
		return () => {
			cancelled = true;
		};
	}, [owner, repo, workflowFilter, page, initialRuns, initialTotalCount]);

	// Derive filter options from currently displayed runs
	const eventOptions = useMemo(() => {
		const events = [...new Set(displayRuns.map((r) => r.event))].sort();
		return [
			{ value: "all", label: "All events" },
			...events.map((e) => ({ value: e, label: e })),
		];
	}, [displayRuns]);

	const branchOptions = useMemo(() => {
		const branches = [
			...new Set(
				displayRuns.map((r) => r.head_branch).filter(Boolean) as string[],
			),
		].sort();
		return [
			{ value: "all", label: "All branches" },
			...branches.map((b) => ({ value: b, label: b })),
		];
	}, [displayRuns]);

	const actorOptions = useMemo(() => {
		const actors = [
			...new Set(
				displayRuns.map((r) => r.actor?.login).filter(Boolean) as string[],
			),
		].sort();
		return [
			{ value: "all", label: "All actors" },
			...actors.map((a) => ({ value: a, label: a })),
		];
	}, [displayRuns]);

	// Apply client-side filters (event, status, branch, actor) on fetched runs
	const filteredRuns = useMemo(() => {
		return displayRuns.filter((run) => {
			if (statusFilter !== "all") {
				if (statusFilter === "in_progress") {
					if (
						run.status !== "in_progress" &&
						run.status !== "queued" &&
						run.status !== "waiting"
					)
						return false;
				} else {
					if (run.conclusion !== statusFilter) return false;
				}
			}
			if (eventFilter !== "all" && run.event !== eventFilter) return false;
			if (branchFilter !== "all" && run.head_branch !== branchFilter)
				return false;
			if (actorFilter !== "all" && run.actor?.login !== actorFilter) return false;
			return true;
		});
	}, [displayRuns, statusFilter, eventFilter, branchFilter, actorFilter]);

	const hasActiveFilters =
		statusFilter !== "all" ||
		eventFilter !== "all" ||
		branchFilter !== "all" ||
		actorFilter !== "all";

	const pushWorkflowUrl = useCallback(
		(wf: Workflow | undefined) => {
			if (wf) {
				const file = wf.path.replace(/^\.github\/workflows\//, "");
				window.history.pushState(
					null,
					"",
					`/${owner}/${repo}/actions/workflows/${file}`,
				);
			} else {
				window.history.pushState(null, "", `/${owner}/${repo}/actions`);
			}
		},
		[owner, repo],
	);

	function handleWorkflowChange(id: number | null) {
		setWorkflowFilter(id);
		setPage(1);
		setStatusFilter("all");
		setEventFilter("all");
		setBranchFilter("all");
		setActorFilter("all");
		pushWorkflowUrl(id ? workflows.find((w) => w.id === id) : undefined);
	}

	function clearAllFilters() {
		setWorkflowFilter(null);
		setPage(1);
		setStatusFilter("all");
		setEventFilter("all");
		setBranchFilter("all");
		setActorFilter("all");
		pushWorkflowUrl(undefined);
	}

	return (
		<div>
			{/* Sticky header + filters — always visible */}
			<div className="sticky -top-3 z-10 bg-background pt-3 pb-2">
				{/* Filter bar — hidden during comparison */}
				{!showCompare && (
					<>
						<div className="flex items-center gap-2 flex-wrap">
							<WorkflowFilterDropdown
								workflows={workflows}
								value={workflowFilter}
								onChange={handleWorkflowChange}
							/>
							<CombinedFilterDropdown
								filters={[
									{
										label: "Status",
										value: statusFilter,
										options: STATUS_OPTIONS.map(
											(o) => ({
												value: o.value,
												label: o.label,
											}),
										),
										onChange: (v) =>
											setStatusFilter(
												v as StatusFilter,
											),
									},
									{
										label: "Event",
										value: eventFilter,
										options: eventOptions,
										onChange: (v) =>
											setEventFilter(
												v,
											),
									},
									{
										label: "Branch",
										value: branchFilter,
										options: branchOptions,
										onChange: (v) =>
											setBranchFilter(
												v,
											),
										searchable: true,
									},
									{
										label: "Actor",
										value: actorFilter,
										options: actorOptions,
										onChange: (v) =>
											setActorFilter(
												v,
											),
										searchable: true,
									},
								]}
							/>
							{(hasActiveFilters || workflowFilter) && (
								<button
									onClick={clearAllFilters}
									className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
								>
									<X className="w-3 h-3" />
									Clear
								</button>
							)}

							{/* Compare button — right side of filter row */}
							{selectedRuns.size > 0 && (
								<button
									onClick={
										selectedRuns.size >=
										2
											? () =>
													setShowCompare(
														true,
													)
											: undefined
									}
									className={cn(
										"inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono ml-auto border border-dashed transition-colors",
										selectedRuns.size >=
											2
											? "border-blue-500/30 text-blue-400 hover:bg-blue-500/10 cursor-pointer"
											: "border-border/40 text-muted-foreground cursor-default",
									)}
								>
									<span className="text-blue-400 text-[10px] font-medium tabular-nums">
										{selectedRuns.size}
									</span>
									<ArrowLeftRight className="w-3 h-3" />
									Compare
									<span
										role="button"
										onClick={(e) => {
											e.stopPropagation();
											setSelectedRuns(
												new Set(),
											);
										}}
										className="ml-0.5 p-0.5 text-muted-foreground/30 hover:text-muted-foreground/60 transition-colors cursor-pointer"
									>
										<X className="w-3 h-3" />
									</span>
								</button>
							)}
						</div>

						{/* Run count + pagination info */}
						<div className="mt-4 mb-2 flex items-center justify-between">
							<span className="text-[11px] font-mono text-muted-foreground">
								{totalCount.toLocaleString()} run
								{totalCount !== 1 ? "s" : ""} total
								{hasActiveFilters
									? ` · ${filteredRuns.length} shown on this page`
									: ""}
								{totalPages > 1 &&
									` · page ${page} of ${totalPages}`}
							</span>
							{loading && (
								<Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
							)}
						</div>
					</>
				)}
			</div>

			{/* Inline comparison view */}
			{showCompare && selectedRuns.size >= 2 ? (
				<RunComparisonInline
					owner={owner}
					repo={repo}
					runIds={[...selectedRuns]}
					onClose={() => setShowCompare(false)}
				/>
			) : (
				<>
					{/* Runs list */}
					<div
						className={cn(
							"border border-border/60 divide-y divide-border/40 transition-opacity duration-200",
							loading && "opacity-40 pointer-events-none",
						)}
					>
						{filteredRuns.map((run) => {
							const workflowName =
								workflows.find(
									(w) =>
										w.id ===
										run.workflow_id,
								)?.name ?? run.name;
							const duration = run.run_started_at
								? formatDuration(
										run.run_started_at,
										run.status ===
											"completed"
											? run.updated_at
											: null,
									)
								: null;
							const isSelected = selectedRuns.has(run.id);

							return (
								<div
									key={run.id}
									className={cn(
										"group flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors",
										isSelected &&
											"bg-blue-500/5",
									)}
								>
									<button
										onClick={(e) => {
											e.stopPropagation();
											toggleRunSelection(
												run.id,
											);
										}}
										className={cn(
											"shrink-0 w-[15px] h-[15px] border transition-all duration-150 cursor-pointer flex items-center justify-center",
											isSelected
												? "border-blue-500 bg-blue-500 text-white scale-105"
												: "border-border/40 hover:border-blue-500/40 bg-transparent",
										)}
									>
										{isSelected && (
											<svg
												className="w-2.5 h-2.5"
												viewBox="0 0 12 12"
												fill="none"
											>
												<path
													d="M2 6L5 9L10 3"
													stroke="currentColor"
													strokeWidth="2"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										)}
									</button>
									<Link
										href={`/${owner}/${repo}/actions/${run.id}`}
										className="flex items-center gap-3 flex-1 min-w-0"
									>
										<StatusIcon
											status={
												run.status ??
												""
											}
											conclusion={
												run.conclusion
											}
											className="w-4 h-4"
										/>
										<div className="flex-1 min-w-0">
											<div className="text-[13px] truncate group-hover:text-foreground transition-colors">
												{
													run.display_title
												}
											</div>
											<div className="flex items-center gap-1.5 mt-1 text-[11px] font-mono text-muted-foreground/50 flex-wrap">
												<span>
													{
														workflowName
													}
												</span>
												<span className="text-muted-foreground/20">
													·
												</span>
												<span>
													#
													{
														run.run_number
													}
												</span>
												<span className="text-muted-foreground/20">
													·
												</span>
												<span>
													{
														run.event
													}
												</span>
												{run.head_branch && (
													<>
														<span className="text-muted-foreground/20">
															·
														</span>
														<span className="inline-flex items-center gap-0.5">
															<GitBranch className="w-3 h-3" />
															{
																run.head_branch
															}
														</span>
													</>
												)}
												{run.actor && (
													<>
														<span className="text-muted-foreground/20">
															·
														</span>
														<span>
															{
																run
																	.actor
																	.login
															}
														</span>
													</>
												)}
											</div>
										</div>
										<div className="shrink-0 text-right hidden sm:block">
											<div className="text-[11px] text-muted-foreground">
												<TimeAgo
													date={
														run.updated_at
													}
												/>
											</div>
											{duration && (
												<div
													className="flex items-center gap-1 text-[11px] text-muted-foreground/30 justify-end mt-0.5"
													suppressHydrationWarning
												>
													<Clock className="w-3 h-3" />
													{
														duration
													}
												</div>
											)}
										</div>
										{run.actor && (
											<Image
												src={
													run
														.actor
														.avatar_url
												}
												alt={
													run
														.actor
														.login
												}
												width={
													20
												}
												height={
													20
												}
												className="rounded-full shrink-0 hidden sm:block"
											/>
										)}
									</Link>
								</div>
							);
						})}

						{!loading && filteredRuns.length === 0 && (
							<div className="py-16 text-center">
								<Play className="w-5 h-5 text-muted-foreground/20 mx-auto mb-3" />
								<p className="text-[11px] text-muted-foreground font-mono">
									No workflow runs found
								</p>
							</div>
						)}
					</div>

					{/* Pagination */}
					{totalPages > 1 && (
						<div className="flex items-center justify-center gap-1 mt-4">
							<button
								onClick={() =>
									setPage((p) =>
										Math.max(1, p - 1),
									)
								}
								disabled={page <= 1}
								className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-mono border border-border/60 hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
							>
								<ChevronLeft className="w-3 h-3" />
								Previous
							</button>
							<span className="px-3 py-1.5 text-[11px] font-mono text-muted-foreground/50">
								{page} / {totalPages}
							</span>
							<button
								onClick={() =>
									setPage((p) =>
										Math.min(
											totalPages,
											p + 1,
										),
									)
								}
								disabled={page >= totalPages}
								className="flex items-center gap-1 px-2.5 py-1.5 text-[11px] font-mono border border-border/60 hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
							>
								Next
								<ChevronRight className="w-3 h-3" />
							</button>
						</div>
					)}
				</>
			)}
		</div>
	);
}
