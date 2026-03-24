"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";
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
const MONTH_LABEL_MIN_GAP_PX = 8;
const MONTH_LABEL_MIN_SPACING_PX = 24 + MONTH_LABEL_MIN_GAP_PX;
const TOOLTIP_EDGE_PADDING_PX = 8;
const FALLBACK_TOOLTIP_WIDTH_PX = 120;
const FALLBACK_TOOLTIP_HEIGHT_PX = 56;
const TOOLTIP_GAP_PX = 8;
const HELD_TOOLTIP_GAP_PX = 14;

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

function getYearFromDate(date: string): number {
	const parts = date.split("-");
	if (parts.length >= 1) {
		const year = Number(parts[0]);
		if (year >= 1970 && year <= 9999) return year;
	}
	const parsed = new Date(date);
	if (Number.isNaN(parsed.getTime())) return new Date().getUTCFullYear();
	return parsed.getUTCFullYear();
}

export function ContributionChart({ data }: { data: ContributionData }) {
	const isMobile = useIsMobile();
	const [hovered, setHovered] = useState<ContributionDay | null>(null);
	const [tooltipX, setTooltipX] = useState(0);
	const [tooltipY, setTooltipY] = useState(0);
	const [halfYear, setHalfYear] = useState<"h1" | "h2">("h1");
	const [isHalfTransitioning, setIsHalfTransitioning] = useState(false);
	const [heldCell, setHeldCell] = useState<{
		date: string;
		weekIndex: number;
		dayIndex: number;
	} | null>(null);
	const scrollContainerRef = useRef<HTMLDivElement | null>(null);
	const hoveredCellRef = useRef<HTMLDivElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const activePointerIdRef = useRef<number | null>(null);
	const halfTransitionTimeoutRef = useRef<number | null>(null);

	const targetYear = useMemo(() => {
		const counts = new Map<number, number>();

		for (const week of data.weeks) {
			for (const day of week.contributionDays) {
				const year = getYearFromDate(day.date);
				counts.set(year, (counts.get(year) ?? 0) + 1);
			}
		}

		let bestYear = new Date().getUTCFullYear();
		let bestCount = -1;
		for (const [year, count] of counts) {
			if (count > bestCount) {
				bestCount = count;
				bestYear = year;
			}
		}

		return bestYear;
	}, [data.weeks]);

	const visibleWeeks = useMemo(() => {
		if (isMobile !== true) return data.weeks;

		const weeks = data.weeks.filter((week) =>
			week.contributionDays.some((day) => {
				const year = getYearFromDate(day.date);
				if (year !== targetYear) return false;
				const month = getMonthFromDate(day.date);
				return halfYear === "h1" ? month <= 5 : month >= 6;
			}),
		);

		return weeks.length > 0 ? weeks : data.weeks;
	}, [data.weeks, halfYear, isMobile, targetYear]);

	const dayByDate = useMemo(() => {
		const map = new Map<string, ContributionDay>();
		for (const week of visibleWeeks) {
			for (const day of week.contributionDays) {
				map.set(day.date, day);
			}
		}
		return map;
	}, [visibleWeeks]);

	const monthPositions = useMemo(() => {
		const positions: { label: string; col: number }[] = [];
		let last = -1;
		visibleWeeks.forEach((week, i) => {
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
	}, [visibleWeeks]);

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

	const updateTooltipPosition = useCallback((cell: HTMLDivElement, held = false) => {
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
			const tooltipHeight =
				tooltipRef.current?.offsetHeight ?? FALLBACK_TOOLTIP_HEIGHT_PX;
			const rawY =
				cellRect.top -
				parentRect.top -
				tooltipHeight -
				(held ? HELD_TOOLTIP_GAP_PX : TOOLTIP_GAP_PX);
			setTooltipY(rawY);
			return;
		}

		setTooltipX(Math.min(Math.max(rawX, minX), maxX));
		const tooltipHeight =
			tooltipRef.current?.offsetHeight ?? FALLBACK_TOOLTIP_HEIGHT_PX;
		const rawY =
			cellRect.top -
			parentRect.top -
			tooltipHeight -
			(held ? HELD_TOOLTIP_GAP_PX : TOOLTIP_GAP_PX);
		setTooltipY(rawY);
	}, []);

	const clearHeldCell = useCallback(() => {
		activePointerIdRef.current = null;
		setHeldCell(null);
		hoveredCellRef.current = null;
		setHovered(null);
	}, []);

	const setHeldFromPointer = useCallback(
		(
			day: ContributionDay,
			weekIndex: number,
			dayIndex: number,
			element: HTMLDivElement,
		) => {
			hoveredCellRef.current = element;
			setHeldCell({
				date: day.date,
				weekIndex,
				dayIndex,
			});
			setHovered(day);
			updateTooltipPosition(element, true);
		},
		[updateTooltipPosition],
	);

	const getHeldCellTransform = useCallback(
		(weekIndex: number, dayIndex: number, date: string) => {
			if (!heldCell) return null;

			if (heldCell.date === date) {
				return {
					zIndex: 30,
				};
			}

			const dx = weekIndex - heldCell.weekIndex;
			const dy = dayIndex - heldCell.dayIndex;
			const distance = Math.max(Math.abs(dx), Math.abs(dy));

			if (distance > 2 || distance === 0) return null;

			const push = distance === 1 ? 3 : 1.5;
			const translateX = dx === 0 ? 0 : Math.sign(dx) * push;
			const translateY = dy === 0 ? 0 : Math.sign(dy) * push;

			return {
				transform: `translate3d(${translateX}px, ${translateY}px, 0)`,
				zIndex: distance === 1 ? 20 : 10,
			};
		},
		[heldCell],
	);

	const updateHeldFromPoint = useCallback(
		(clientX: number, clientY: number) => {
			const target = document.elementFromPoint(clientX, clientY);
			if (!(target instanceof HTMLElement)) return;

			const cell = target.closest<HTMLDivElement>("[data-contrib-cell='true']");
			if (!cell) return;

			const date = cell.dataset.date;
			const weekIndex = Number(cell.dataset.weekIndex);
			const dayIndex = Number(cell.dataset.dayIndex);

			if (!date || Number.isNaN(weekIndex) || Number.isNaN(dayIndex)) return;

			const day = dayByDate.get(date);
			if (!day) return;

			hoveredCellRef.current = cell;
			setHeldCell((current) => {
				if (
					current?.date === date &&
					current.weekIndex === weekIndex &&
					current.dayIndex === dayIndex
				) {
					return current;
				}
				return {
					date,
					weekIndex,
					dayIndex,
				};
			});
			setHovered((current) => (current?.date === day.date ? current : day));
			updateTooltipPosition(cell, true);
		},
		[dayByDate, updateTooltipPosition],
	);

	const toggleHalfYear = useCallback(() => {
		if (isMobile !== true) return;
		if (isHalfTransitioning) return;

		setIsHalfTransitioning(true);
		if (halfTransitionTimeoutRef.current !== null) {
			window.clearTimeout(halfTransitionTimeoutRef.current);
		}

		halfTransitionTimeoutRef.current = window.setTimeout(() => {
			setHalfYear((current) => (current === "h1" ? "h2" : "h1"));
			window.requestAnimationFrame(() => {
				setIsHalfTransitioning(false);
			});
		}, 130);
	}, [isHalfTransitioning, isMobile]);

	useEffect(() => {
		if (!hovered || !hoveredCellRef.current) return;

		const update = () => {
			if (!hoveredCellRef.current) return;
			updateTooltipPosition(hoveredCellRef.current, Boolean(heldCell));
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
	}, [heldCell, hovered, updateTooltipPosition]);

	useEffect(() => {
		clearHeldCell();
	}, [clearHeldCell, halfYear]);

	useEffect(() => {
		if (!heldCell) return;

		const release = () => clearHeldCell();
		window.addEventListener("pointerup", release, {
			passive: true,
		});
		window.addEventListener("pointercancel", release, {
			passive: true,
		});
		window.addEventListener("touchend", release, {
			passive: true,
		});

		return () => {
			window.removeEventListener("pointerup", release);
			window.removeEventListener("pointercancel", release);
			window.removeEventListener("touchend", release);
		};
	}, [clearHeldCell, heldCell]);

	useEffect(() => {
		if (!heldCell) return;

		const body = document.body;
		const html = document.documentElement;
		const prevBodyOverflow = body.style.overflow;
		const prevHtmlOverflow = html.style.overflow;
		const prevBodyTouchAction = body.style.touchAction;
		const prevHtmlTouchAction = html.style.touchAction;

		body.style.overflow = "hidden";
		html.style.overflow = "hidden";
		body.style.touchAction = "none";
		html.style.touchAction = "none";

		const preventTouchMove = (event: TouchEvent) => {
			event.preventDefault();
		};

		document.addEventListener("touchmove", preventTouchMove, {
			passive: false,
		});

		return () => {
			body.style.overflow = prevBodyOverflow;
			html.style.overflow = prevHtmlOverflow;
			body.style.touchAction = prevBodyTouchAction;
			html.style.touchAction = prevHtmlTouchAction;
			document.removeEventListener("touchmove", preventTouchMove);
		};
	}, [heldCell]);

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
								"w-2.5 h-2.5 rounded-xs",
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
						"absolute left-0 z-50 pointer-events-none select-none -translate-x-1/2 transition-all duration-100",
						heldCell ? "" : "bottom-full mb-2",
						hovered
							? "opacity-100 translate-y-0"
							: "opacity-0 translate-y-1",
					)}
					style={
						heldCell
							? {
									left: tooltipX,
									top: tooltipY,
								}
							: { left: tooltipX }
					}
				>
					{hovered && (
						<div
							className={cn(
								heldCell
									? "relative rounded-md border border-border/70 dark:border-white/15 bg-background/95 dark:bg-black/90 backdrop-blur-xl shadow-md dark:shadow-none"
									: "rounded-sm border border-border/60 dark:border-white/10 bg-background/80 dark:bg-black/80 backdrop-blur-xl shadow-sm dark:shadow-none ring-1 ring-black/3 dark:ring-white/3",
							)}
						>
							<div
								className={cn(
									"text-center",
									heldCell
										? "px-2.5 py-1.5"
										: "px-3 py-1.5",
								)}
							>
								<div
									className={cn(
										"tabular-nums text-foreground",
										heldCell
											? "text-sm font-semibold"
											: "text-xs font-medium",
									)}
								>
									{hovered.contributionCount}
								</div>
								<div className="text-[10px] font-mono text-muted-foreground">
									contribution
									{hovered.contributionCount !==
									1
										? "s"
										: ""}
								</div>
								<div className="text-[10px] font-mono text-muted-foreground/80">
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
							{heldCell && (
								<span className="absolute left-1/2 -bottom-1.5 h-3 w-3 -translate-x-1/2 rotate-45 border-r border-b border-border/70 dark:border-white/15 bg-background/95 dark:bg-black/90" />
							)}
						</div>
					)}
				</div>
				<div ref={scrollContainerRef}>
					<div
						className={cn(
							"inline-grid pt-0 transition-opacity duration-200",
							isHalfTransitioning
								? "opacity-0"
								: "opacity-100",
						)}
						style={{ gridTemplateColumns: `auto 1fr` }}
					>
						{/* Day labels column */}
						<div
							className="flex flex-col lg:pr-2"
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
						<div className="min-w-0">
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
								{visibleWeeks.map((week, wi) => (
									<div
										key={wi}
										className="flex flex-col"
										style={{ gap: GAP }}
									>
										{week.contributionDays.map(
											(
												day,
												di,
											) => (
												<div
													key={
														day.date
													}
													className={cn(
														"relative rounded-xs transition-all duration-100 touch-none select-none",
														LEVEL_CLASSES[
															getLevel(
																day.contributionCount,
															)
														],
														heldCell?.date ===
															day.date
															? "ring-1 ring-foreground/35"
															: "hover:ring-1 hover:ring-foreground/30",
													)}
													style={{
														width: CELL,
														height: CELL,
														...getHeldCellTransform(
															wi,
															di,
															day.date,
														),
													}}
													onMouseEnter={(
														e,
													) => {
														if (
															heldCell
														)
															return;
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
															heldCell
														)
															return;
														hoveredCellRef.current =
															null;
														setHovered(
															null,
														);
													}}
													onPointerDown={(
														e,
													) => {
														if (
															e.pointerType ===
															"mouse"
														)
															return;
														activePointerIdRef.current =
															e.pointerId;
														e.currentTarget.setPointerCapture(
															e.pointerId,
														);
														e.preventDefault();
														setHeldFromPointer(
															day,
															wi,
															di,
															e.currentTarget,
														);
													}}
													onPointerMove={(
														e,
													) => {
														if (
															e.pointerType ===
															"mouse"
														)
															return;
														if (
															activePointerIdRef.current !==
															e.pointerId
														)
															return;
														e.preventDefault();
														updateHeldFromPoint(
															e.clientX,
															e.clientY,
														);
													}}
													onPointerUp={(
														e,
													) => {
														if (
															e.pointerType ===
															"mouse"
														)
															return;
														if (
															activePointerIdRef.current !==
															e.pointerId
														)
															return;
														clearHeldCell();
													}}
													onPointerCancel={
														clearHeldCell
													}
													onLostPointerCapture={
														clearHeldCell
													}
													onContextMenu={(
														e,
													) =>
														e.preventDefault()
													}
													data-contrib-cell="true"
													data-date={
														day.date
													}
													data-week-index={
														wi
													}
													data-day-index={
														di
													}
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

			{/* Mobile half-year toggle row */}
			<div className="md:hidden mt-3 flex items-center justify-end">
				<button
					onClick={toggleHalfYear}
					aria-label={
						halfYear === "h1"
							? "Show July through December"
							: "Show January through June"
					}
					className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors"
				>
					{halfYear === "h1" ? "Jan - Jun" : "Jul - Dec"}
					<ChevronRight
						className={cn(
							"w-3 h-3 transition-transform duration-200",
							halfYear === "h2" && "rotate-180",
						)}
					/>
				</button>
			</div>
		</div>
	);
}
