"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState, type Ref } from "react";

interface ContributionDay {
	contributionCount: number;
	date: string;
	color: string;
}

interface ContributionWeek {
	contributionDays: ContributionDay[];
}

interface ContributionData {
	totalContributions: number;
	weeks: ContributionWeek[];
}

export type ContributionChartStreak =
	| { count: number; kind: "current" }
	| { count: number; kind: "best" };

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOW_DAYS = [1, 3, 5];

/** Same buckets as the contribution heatmap cells (0 = none, 4 = busiest). */
export function getContributionHeatLevel(count: number): 0 | 1 | 2 | 3 | 4 {
	if (count === 0) return 0;
	if (count <= 3) return 1;
	if (count <= 6) return 2;
	if (count <= 9) return 3;
	return 4;
}

const LEVEL_CLASSES = [
	"bg-[var(--contrib-0)]",
	"bg-[var(--contrib-1)]",
	"bg-[var(--contrib-2)]",
	"bg-[var(--contrib-3)]",
	"bg-[var(--contrib-4)]",
];

const CELL = 10;
const GAP = 3;
const MONTH_LABEL_MIN_GAP_PX = 8;
const MONTH_LABEL_MIN_SPACING_PX = 24 + MONTH_LABEL_MIN_GAP_PX;
const TOOLTIP_EDGE_PADDING_PX = 8;
const FALLBACK_TOOLTIP_WIDTH_PX = 120;

function getMonthFromDate(date: string): number {
	const parts = date.split("-");
	if (parts.length >= 2) {
		const month = Number(parts[1]);
		if (month >= 1 && month <= 12) return month - 1;
	}
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return 0;
	return parsed.getUTCMonth();
}

/** Matches profile contribution grid dates (UTC YYYY-MM-DD from `toISOString`). */
function utcTodayDateString(): string {
	return new Date().toISOString().slice(0, 10);
}

function isFutureContributionDay(date: string): boolean {
	return date > utcTodayDateString();
}

export function ContributionChart({
	data,
	streak = null,
	calendarMeasureRef,
}: {
	data: ContributionData;
	streak?: ContributionChartStreak | null;
	/** Width of the calendar block; used to cap the activity year strip on large screens. */
	calendarMeasureRef?: Ref<HTMLDivElement | null>;
}) {
	const [hovered, setHovered] = useState<ContributionDay | null>(null);
	const [tooltipX, setTooltipX] = useState(0);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const hoveredCellRef = useRef<HTMLDivElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);

	const tooltipDay = hovered && !isFutureContributionDay(hovered.date) ? hovered : null;

	const monthPositions = useMemo(() => {
		const positions: { label: string; col: number }[] = [];
		let last = -1;
		data.weeks.forEach((week, i) => {
			const d = week.contributionDays[0];
			if (d) {
				const m = getMonthFromDate(d.date);
				if (m !== last) {
					positions.push({ label: MONTHS[m], col: i });
					last = m;
				}
			}
		});
		return positions;
	}, [data.weeks]);

	const visibleMonthPositions = useMemo(() => {
		const candidates = monthPositions.filter((month, index, all) => {
			if (index !== 0) return true;
			const next = all[1];
			if (!next) return true;
			const firstLeft = month.col * (CELL + GAP);
			const nextLeft = next.col * (CELL + GAP);
			return nextLeft - firstLeft >= MONTH_LABEL_MIN_SPACING_PX;
		});

		let previousLeft = Number.NEGATIVE_INFINITY;
		return candidates.filter(({ col }) => {
			const left = col * (CELL + GAP);
			if (left - previousLeft < MONTH_LABEL_MIN_SPACING_PX) return false;
			previousLeft = left;
			return true;
		});
	}, [monthPositions]);

	const updateTooltipPosition = useCallback((cell: HTMLDivElement) => {
		const parent = scrollContainerRef.current;
		if (!parent) return;

		const cellRect = cell.getBoundingClientRect();
		const parentRect = parent.getBoundingClientRect();
		const rawX = cellRect.left - parentRect.left + CELL / 2;
		const tooltipWidth = tooltipRef.current?.offsetWidth ?? FALLBACK_TOOLTIP_WIDTH_PX;
		const tooltipHalf = tooltipWidth / 2;
		const minX = tooltipHalf + TOOLTIP_EDGE_PADDING_PX;
		const maxX = parent.clientWidth - tooltipHalf - TOOLTIP_EDGE_PADDING_PX;

		if (minX >= maxX) {
			setTooltipX(parent.clientWidth / 2);
			return;
		}

		setTooltipX(Math.min(Math.max(rawX, minX), maxX));
	}, []);

	useEffect(() => {
		if (!tooltipDay || !hoveredCellRef.current) return;

		const update = () => {
			if (!hoveredCellRef.current) return;
			updateTooltipPosition(hoveredCellRef.current);
		};

		update();

		const parent = scrollContainerRef.current;
		parent?.addEventListener("scroll", update, {
			passive: true,
		});
		window.addEventListener("resize", update);

		return () => {
			parent?.removeEventListener("scroll", update);
			window.removeEventListener("resize", update);
		};
	}, [tooltipDay, updateTooltipPosition]);

	const levelLegend = (
		<div className="flex shrink-0 items-center gap-1 text-[10px] text-muted-foreground/60 font-mono select-none">
			<span>Less</span>
			{[0, 1, 2, 3, 4].map((l) => (
				<div
					key={l}
					className={cn(
						"h-[10px] w-[10px] rounded-[2px]",
						LEVEL_CLASSES[l],
					)}
				/>
			))}
			<span>More</span>
		</div>
	);

	return (
		<div className="w-full">
			<div className="relative w-full min-w-0">
				<div
					ref={calendarMeasureRef}
					className="inline-block w-max max-w-full"
				>
					<div className="relative">
						<div
							ref={tooltipRef}
							className={cn(
								"pointer-events-none absolute bottom-full left-0 z-10 mb-2 -translate-x-1/2 transition-all duration-100",
								tooltipDay
									? "translate-y-0 opacity-100"
									: "translate-y-1 opacity-0",
							)}
							style={{ left: tooltipX }}
						>
							{tooltipDay && (
								<div className="rounded-sm border border-border/60 bg-background/80 shadow-sm ring-1 ring-black/[0.03] backdrop-blur-xl dark:border-white/10 dark:bg-black/80 dark:shadow-none dark:ring-white/[0.03]">
									<div className="px-3 py-1.5 text-center">
										<div className="text-xs font-medium text-foreground tabular-nums">
											<span className="font-semibold">
												{
													tooltipDay.contributionCount
												}
											</span>{" "}
											contribution
											{tooltipDay.contributionCount !==
											1
												? "s"
												: ""}
										</div>
										<div className="text-[10px] font-mono text-muted-foreground">
											{new Date(
												tooltipDay.date,
											).toLocaleDateString(
												"en-US",
												{
													weekday: "short",
													month: "short",
													day: "numeric",
												},
											)}
										</div>
									</div>
								</div>
							)}
						</div>
						<div
							className="overflow-x-auto pr-2"
							ref={scrollContainerRef}
						>
							<div
								className="inline-grid pt-0"
								style={{
									gridTemplateColumns: `auto 1fr`,
								}}
							>
								{/* Day labels column */}
								<div
									className="flex flex-col pr-2"
									style={{
										gap: GAP,
										paddingTop:
											16 + GAP,
									}}
								>
									{DAYS.map((day, i) => (
										<div
											key={day}
											className="flex items-center justify-end"
											style={{
												height: CELL,
											}}
										>
											{SHOW_DAYS.includes(
												i,
											) && (
												<span className="text-[9px] font-mono text-muted-foreground/50 leading-none">
													{
														day
													}
												</span>
											)}
										</div>
									))}
								</div>

								{/* Grid column */}
								<div className="min-w-0">
									{/* Month labels — absolutely positioned so they don't clip */}
									<div className="relative mb-px h-4">
										{visibleMonthPositions.map(
											(m) => (
												<span
													key={`${m.label}-${m.col}`}
													className="absolute text-[9px] font-mono text-muted-foreground/50 leading-none"
													style={{
														left:
															m.col *
															(CELL +
																GAP),
													}}
												>
													{
														m.label
													}
												</span>
											),
										)}
									</div>

									{/* Cells */}
									<div
										className="flex"
										style={{ gap: GAP }}
									>
										{data.weeks.map(
											(
												week,
												wi,
											) => (
												<div
													key={
														wi
													}
													className="flex flex-col"
													style={{
														gap: GAP,
													}}
												>
													{week.contributionDays.map(
														(
															day,
															di,
														) => {
															const future =
																isFutureContributionDay(
																	day.date,
																);
															return (
																<div
																	key={`${wi}-${di}`}
																	className={cn(
																		"rounded-[2px] transition-[background-color,opacity,box-shadow] duration-300 ease-out",
																		future
																			? "bg-muted/45 dark:bg-muted/35 opacity-50"
																			: LEVEL_CLASSES[
																					getContributionHeatLevel(
																						day.contributionCount,
																					)
																				],
																		!future &&
																			"hover:ring-1 hover:ring-foreground/30",
																	)}
																	style={{
																		width: CELL,
																		height: CELL,
																	}}
																	onMouseEnter={(
																		e,
																	) => {
																		if (
																			future
																		) {
																			hoveredCellRef.current =
																				null;
																			setHovered(
																				null,
																			);
																			return;
																		}
																		hoveredCellRef.current =
																			e.currentTarget;
																		setHovered(
																			day,
																		);
																		updateTooltipPosition(
																			e.currentTarget,
																		);
																	}}
																	onMouseLeave={() => {
																		if (
																			future
																		)
																			return;
																		hoveredCellRef.current =
																			null;
																		setHovered(
																			null,
																		);
																	}}
																/>
															);
														},
													)}
												</div>
											),
										)}
									</div>
								</div>
							</div>
						</div>
					</div>
					<div className="mt-3 grid w-full grid-cols-1 items-center gap-y-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-3 sm:gap-y-0">
						<div className="flex min-w-0 flex-wrap items-baseline gap-2 justify-self-start">
							<span className="text-xs font-medium tabular-nums">
								{data.totalContributions.toLocaleString()}
							</span>
							<span className="text-[11px] font-mono text-muted-foreground">
								contributions this year
							</span>
						</div>
						<div className="flex justify-self-center px-1">
							{streak ? (
								<div className="flex items-center gap-2 text-xs text-muted-foreground">
									<span
										className="size-2 shrink-0 rounded-full bg-primary"
										aria-hidden
									/>
									<span>
										{streak.count}{" "}
										{streak.kind ===
										"current"
											? "day streak"
											: "day best streak"}
									</span>
								</div>
							) : null}
						</div>
						<div className="min-w-0 justify-self-end sm:justify-self-end">
							{levelLegend}
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
