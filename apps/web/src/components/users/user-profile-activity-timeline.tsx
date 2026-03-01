"use client";

import { useEffect, useMemo, useState } from "react";
import type { ActivityEvent } from "@/lib/github-types";
import { cn } from "@/lib/utils";
import {
	buildContributionMonthGroups,
	buildProfileRepoMonthMap,
	groupEventsByMonth,
	mergeMonthGroups,
	mergeProfileReposIntoMonths,
} from "@/components/users/activity-timeline/aggregators";
import {
	ContributionFallbackRows,
	monthContributionSummary,
	TimelineEventCard,
} from "@/components/users/activity-timeline/cards";
import { monthLabel } from "@/components/users/activity-timeline/helpers";
import type {
	ContributionData,
	ProfileRepoTimelineItem,
} from "@/components/users/activity-timeline/types";

export function UserProfileActivityTimeline({
	events,
	contributions,
	profileRepos,
}: {
	events: ActivityEvent[];
	contributions: ContributionData | null;
	profileRepos?: ProfileRepoTimelineItem[];
}) {
	const timelineSectionClass =
		"relative isolate border border-border rounded-md bg-card/50 p-4";

	const sortedEvents = useMemo(
		() =>
			[...events].sort((a, b) => {
				const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
				const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;
				return bTime - aTime;
			}),
		[events],
	);

	const eventMonthGroups = useMemo(() => groupEventsByMonth(sortedEvents), [sortedEvents]);
	const contributionMonthGroups = useMemo(
		() => buildContributionMonthGroups(contributions),
		[contributions],
	);
	const profileRepoMonthMap = useMemo(
		() => buildProfileRepoMonthMap(profileRepos),
		[profileRepos],
	);
	const monthGroups = useMemo(
		() => mergeMonthGroups(eventMonthGroups, contributionMonthGroups),
		[eventMonthGroups, contributionMonthGroups],
	);
	const monthGroupsWithRepos = useMemo(
		() => mergeProfileReposIntoMonths(monthGroups, profileRepoMonthMap),
		[monthGroups, profileRepoMonthMap],
	);

	const [visibleMonthCount, setVisibleMonthCount] = useState(1);
	const [pendingMonthKey, setPendingMonthKey] = useState<string | null>(null);
	const [showLeftFade, setShowLeftFade] = useState(false);
	const [showRightFade, setShowRightFade] = useState(false);

	const visibleMonths = monthGroupsWithRepos.slice(0, visibleMonthCount);
	const hasMore = monthGroupsWithRepos.length > visibleMonthCount;
	const remainingMonths = Math.max(0, monthGroupsWithRepos.length - visibleMonthCount);

	useEffect(() => {
		if (!pendingMonthKey) return;
		const targetId = `activity-month-${pendingMonthKey}`;
		const target = document.getElementById(targetId);
		if (!target) return;
		target.scrollIntoView({ block: "start", behavior: "smooth" });
		setPendingMonthKey(null);
	}, [pendingMonthKey, visibleMonthCount]);

	const years = useMemo(
		() =>
			[...new Set(monthGroupsWithRepos.map((group) => group.year))].sort(
				(a, b) => b - a,
			),
		[monthGroupsWithRepos],
	);
	const visibleYears = useMemo(
		() => new Set(visibleMonths.map((group) => group.year)),
		[visibleMonths],
	);
	const currentMonthKey = useMemo(() => {
		const now = new Date();
		const month = String(now.getMonth() + 1).padStart(2, "0");
		return `${now.getFullYear()}-${month}`;
	}, []);

	useEffect(() => {
		const rail = document.getElementById("timeline-year-rail");
		if (!rail) {
			setShowLeftFade(false);
			setShowRightFade(false);
			return;
		}

		const updateFades = () => {
			const maxScrollLeft = rail.scrollWidth - rail.clientWidth;
			setShowLeftFade(rail.scrollLeft > 2);
			setShowRightFade(maxScrollLeft - rail.scrollLeft > 2);
		};

		updateFades();
		rail.addEventListener("scroll", updateFades, { passive: true });
		window.addEventListener("resize", updateFades);
		return () => {
			rail.removeEventListener("scroll", updateFades);
			window.removeEventListener("resize", updateFades);
		};
	}, [years.length]);

	if (monthGroupsWithRepos.length === 0) {
		return (
			<section className={timelineSectionClass}>
				<h2 className="text-sm font-medium">Activity Timeline</h2>
				<p className="text-[11px] text-muted-foreground font-mono mt-1">
					No recent public activity found for this profile.
				</p>
				<div className="mt-4 rounded-md border border-border bg-card/70 px-3 py-3">
					<p className="text-[11px] text-muted-foreground">
						This user may have private contributions only, no
						recent public events, or activity outside the
						currently accessible data sources.
					</p>
				</div>
			</section>
		);
	}

	return (
		<section className={timelineSectionClass}>
			<div className="grid grid-cols-[1fr_auto] gap-4">
				<div>
					<h2 className="text-sm font-medium">Activity Timeline</h2>
					<p className="text-[11px] text-muted-foreground font-mono mt-1">
						Monthly activity narrative. Newest month appears
						first.
					</p>
				</div>
				{years.length > 0 ? (
					<div className="relative max-w-[40vw]">
						{showLeftFade ? (
							<div className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-card/95 to-transparent z-10" />
						) : null}
						{showRightFade ? (
							<div className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card/95 to-transparent z-10" />
						) : null}
						<div
							id="timeline-year-rail"
							className="flex items-center gap-1.5 overflow-x-auto no-scrollbar snap-x snap-mandatory pr-1"
						>
							{years.map((year) => (
								<button
									key={year}
									onClick={() => {
										const index =
											monthGroupsWithRepos.findIndex(
												(
													group,
												) =>
													group.year ===
													year,
											);
										if (index < 0)
											return;
										setPendingMonthKey(
											monthGroupsWithRepos[
												index
											]?.key ??
												null,
										);
										setVisibleMonthCount(
											(count) =>
												Math.max(
													count,
													index +
														1,
												),
										);
									}}
									className={cn(
										"shrink-0 snap-start px-2.5 py-1 text-[10px] font-mono rounded-md border border-border transition-colors",
										visibleYears.has(
											year,
										)
											? "bg-muted text-foreground border-foreground/20"
											: "text-muted-foreground hover:text-foreground hover:bg-muted/40",
									)}
								>
									{year}
								</button>
							))}
						</div>
					</div>
				) : null}
			</div>

			<div className="mt-4 space-y-4">
				{visibleMonths.map((monthGroup) => (
					<div
						key={monthGroup.key}
						id={`activity-month-${monthGroup.key}`}
						className="relative space-y-3 pl-4"
					>
						<div className="absolute left-0 top-1.5 h-[calc(100%-0.5rem)] w-px bg-border" />
						<div className="flex items-center gap-2">
							<span
								className={cn(
									"size-2 rounded-full border",
									monthGroup.key ===
										currentMonthKey
										? "border-success bg-success"
										: "border-border bg-card",
								)}
							/>
							<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
								{monthLabel(monthGroup.key)}
							</h3>
						</div>

						{monthGroup.kind === "events" ? (
							<div className="space-y-3">
								{monthGroup.items.map(
									(item, index) => (
										<TimelineEventCard
											key={`${monthGroup.key}-${item.kind}-${index.toString()}`}
											monthKey={
												monthGroup.key
											}
											item={item}
										/>
									),
								)}
							</div>
						) : (
							<div className="space-y-3">
								<div className="overflow-hidden rounded-md border border-border bg-card/70">
									<div className="border-b border-border bg-muted/25 px-3 py-2.5">
										<p className="text-xs font-medium">
											Contribution
											overview
										</p>
										<p className="text-[10px] font-mono text-muted-foreground">
											{monthContributionSummary(
												monthGroup.days,
											)}
										</p>
									</div>
									{monthGroup.items.length ===
									0 ? (
										<ContributionFallbackRows
											days={
												monthGroup.days
											}
										/>
									) : null}
								</div>
								{monthGroup.items.map(
									(item, index) => (
										<TimelineEventCard
											key={`${monthGroup.key}-contrib-${item.kind}-${index.toString()}`}
											monthKey={
												monthGroup.key
											}
											item={item}
										/>
									),
								)}
							</div>
						)}
					</div>
				))}
			</div>

			{hasMore ? (
				<button
					onClick={() => setVisibleMonthCount((count) => count + 3)}
					className="mt-4 w-full border border-border rounded-md py-2 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
				>
					Show {Math.min(3, remainingMonths)} more months (
					{remainingMonths} left)
				</button>
			) : null}
		</section>
	);
}
