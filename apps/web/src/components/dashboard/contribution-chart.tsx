"use client";

import { cn } from "@/lib/utils";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SHOW_DAYS = [1, 3, 5];

function getLevel(count: number): number {
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
const MONTH_LABEL_TEXT_WIDTH_PX = 24;
const MONTH_LABEL_MIN_GAP_PX = 8;
const MONTH_LABEL_MIN_SPACING_PX = MONTH_LABEL_TEXT_WIDTH_PX + MONTH_LABEL_MIN_GAP_PX;
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

export function ContributionChart({ data }: { data: ContributionData }) {
	const [hovered, setHovered] = useState<ContributionDay | null>(null);
	const [tooltipX, setTooltipX] = useState(0);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const hoveredCellRef = useRef<HTMLDivElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);

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
		let previousRightEdge = Number.NEGATIVE_INFINITY;
		return monthPositions.filter(({ col }) => {
			const left = col * (CELL + GAP);
			if (left - previousRightEdge < MONTH_LABEL_MIN_SPACING_PX) return false;
			previousRightEdge = left + MONTH_LABEL_TEXT_WIDTH_PX;
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
		if (!hovered || !hoveredCellRef.current) return;

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
	}, [hovered, updateTooltipPosition]);

	return (
		<div className="w-full">
			{/* Header */}
			<div className="flex items-center justify-between mb-3">
				<div className="flex items-baseline gap-2">
					<span className="text-sm tabular-nums font-medium">
						{data.totalContributions.toLocaleString()}
					</span>
					<span className="text-[11px] text-muted-foreground font-mono">
						contributions this year
					</span>
				</div>
				<div className="flex items-center gap-1 text-[10px] text-muted-foreground/60 font-mono select-none">
					<span>Less</span>
					{[0, 1, 2, 3, 4].map((l) => (
						<div
							key={l}
							className={cn(
								"w-[10px] h-[10px] rounded-[2px]",
								LEVEL_CLASSES[l],
							)}
						/>
					))}
					<span>More</span>
				</div>
			</div>

			{/* Chart */}
			<div className="relative">
				<div
					ref={tooltipRef}
					className={cn(
						"absolute left-0 bottom-full mb-2 z-10 pointer-events-none -translate-x-1/2 transition-all duration-100",
						hovered
							? "opacity-100 translate-y-0"
							: "opacity-0 translate-y-1",
					)}
					style={{ left: tooltipX }}
				>
					{hovered && (
						<div className="rounded-lg border border-border/60 dark:border-white/10 bg-background/80 dark:bg-black/80 backdrop-blur-xl shadow-sm dark:shadow-none ring-1 ring-black/[0.03] dark:ring-white/[0.03]">
							<div className="px-3 py-1.5 text-center">
								<div className="text-xs font-medium tabular-nums text-foreground">
									<span className="font-semibold">
										{
											hovered.contributionCount
										}
									</span>{" "}
									contribution
									{hovered.contributionCount !==
									1
										? "s"
										: ""}
								</div>
								<div className="text-[10px] font-mono text-muted-foreground">
									{new Date(
										hovered.date,
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
				<div className="overflow-x-auto" ref={scrollContainerRef}>
					<div
						className="inline-grid pt-0"
						style={{ gridTemplateColumns: `auto 1fr` }}
					>
						{/* Day labels column */}
						<div
							className="flex flex-col pr-2"
							style={{ gap: GAP, paddingTop: 16 + GAP }}
						>
							{DAYS.map((day, i) => (
								<div
									key={day}
									className="flex items-center justify-end"
									style={{ height: CELL }}
								>
									{SHOW_DAYS.includes(i) && (
										<span className="text-[9px] font-mono text-muted-foreground/50 leading-none">
											{day}
										</span>
									)}
								</div>
							))}
						</div>

						{/* Grid column */}
						<div className="overflow-hidden">
							{/* Month labels — absolutely positioned so they don't clip */}
							<div className="relative h-4 mb-px">
								{visibleMonthPositions.map((m) => (
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
										{m.label}
									</span>
								))}
							</div>

							{/* Cells */}
							<div className="flex" style={{ gap: GAP }}>
								{data.weeks.map((week, wi) => (
									<div
										key={wi}
										className="flex flex-col"
										style={{ gap: GAP }}
									>
										{week.contributionDays.map(
											(day) => (
												<div
													key={
														day.date
													}
													className={cn(
														"rounded-[2px] transition-all duration-75",
														LEVEL_CLASSES[
															getLevel(
																day.contributionCount,
															)
														],
														"hover:ring-1 hover:ring-foreground/30",
													)}
													style={{
														width: CELL,
														height: CELL,
													}}
													onMouseEnter={(
														e,
													) => {
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
														hoveredCellRef.current =
															null;
														setHovered(
															null,
														);
													}}
												/>
											),
										)}
									</div>
								))}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	);
}
