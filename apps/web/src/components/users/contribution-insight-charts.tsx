"use client";

import type { ChartConfig } from "@/components/ui/chart";
import { ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { cn } from "@/lib/utils";
import { CalendarDays, ChartLine, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

type InsightTab = "month" | "week" | "trend";

const MONTH_SHORT = [
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
] as const;

export interface ContributionInsightWeek {
	contributionDays: Array<{
		date: string;
		contributionCount: number;
	}>;
}

const chartConfig = {
	contributions: {
		label: "Contributions",
		color: "var(--primary)",
	},
	total: {
		label: "Cumulative",
		color: "var(--primary)",
	},
} satisfies ChartConfig;

function buildMonthSeries(weeks: ContributionInsightWeek[]) {
	const totals = Array.from({ length: 12 }, () => 0);
	for (const week of weeks) {
		for (const day of week.contributionDays) {
			if (day.contributionCount <= 0) continue;
			const m = Number(day.date.slice(5, 7)) - 1;
			if (m >= 0 && m < 12) {
				totals[m] += day.contributionCount;
			}
		}
	}
	return MONTH_SHORT.map((month, i) => ({
		key: month,
		month,
		contributions: totals[i],
	}));
}

/** Per-column week totals (same weeks as the contribution grid). */
function buildWeeklySeries(weeks: ContributionInsightWeek[]) {
	return weeks.map((week, i) => ({
		key: String(i),
		week: i + 1,
		contributions: week.contributionDays.reduce((s, d) => s + d.contributionCount, 0),
	}));
}

function buildCumulativeWeekSeries(weeks: ContributionInsightWeek[]) {
	let running = 0;
	return weeks.map((week, i) => {
		const weekTotal = week.contributionDays.reduce(
			(s, d) => s + d.contributionCount,
			0,
		);
		running += weekTotal;
		return {
			key: String(i),
			week: i + 1,
			total: running,
		};
	});
}

export function ContributionInsightCharts({ weeks }: { weeks: ContributionInsightWeek[] }) {
	const monthData = useMemo(() => buildMonthSeries(weeks), [weeks]);
	const weeklyData = useMemo(() => buildWeeklySeries(weeks), [weeks]);
	const cumulativeData = useMemo(() => buildCumulativeWeekSeries(weeks), [weeks]);

	const [insightTab, setInsightTab] = useState<InsightTab>("month");

	const tabButtonClass = (active: boolean, edge: "left" | "mid" | "right") =>
		cn(
			"flex flex-1 min-w-0 items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer sm:flex-none",
			edge === "left" && "rounded-l-sm lg:rounded-l-md",
			edge === "mid" && "rounded-none",
			edge === "right" && "rounded-r-sm lg:rounded-r-md",
			active
				? "bg-muted/50 text-foreground dark:bg-white/4"
				: "text-muted-foreground hover:bg-muted/60 hover:text-foreground/60 dark:hover:bg-white/3",
		);

	return (
		<div className="flex h-full min-h-0 w-full flex-1 flex-col rounded-md border border-border bg-card/50 p-4">
			<div className="flex min-h-0 w-full min-w-0 flex-1 flex-col gap-3">
				<div className="flex w-full shrink-0 items-center divide-x divide-border rounded-sm border border-border lg:w-fit max-w-full overflow-x-auto">
					<button
						type="button"
						onClick={() => setInsightTab("month")}
						className={tabButtonClass(
							insightTab === "month",
							"left",
						)}
					>
						<CalendarDays className="size-3.5 shrink-0" />
						Month
					</button>
					<button
						type="button"
						onClick={() => setInsightTab("week")}
						className={tabButtonClass(
							insightTab === "week",
							"mid",
						)}
					>
						<ChartLine className="size-3.5 shrink-0" />
						Week
					</button>
					<button
						type="button"
						onClick={() => setInsightTab("trend")}
						className={tabButtonClass(
							insightTab === "trend",
							"right",
						)}
					>
						<TrendingUp className="size-3.5 shrink-0" />
						Trend
					</button>
				</div>
				{insightTab === "month" && (
					<div className="flex min-h-0 flex-1 flex-col">
						<ChartContainer
							config={chartConfig}
							className="aspect-auto h-full min-h-[200px] w-full min-w-0 flex-1"
						>
							<BarChart
								accessibilityLayer
								data={monthData}
								margin={{ left: 0, right: 4 }}
							>
								<CartesianGrid
									vertical={false}
									strokeDasharray="3 3"
								/>
								<XAxis
									dataKey="month"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									fontSize={10}
									interval={0}
								/>
								<YAxis
									width={32}
									tickLine={false}
									axisLine={false}
									tickMargin={4}
									fontSize={10}
									tickFormatter={(v) =>
										typeof v ===
											"number" &&
										v >= 1000
											? `${(v / 1000).toFixed(1)}k`
											: String(v)
									}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent
											hideLabel
										/>
									}
									cursor={{
										fill: "hsl(var(--muted) / 0.25)",
									}}
								/>
								<Bar
									dataKey="contributions"
									fill="var(--color-contributions)"
									radius={[4, 4, 0, 0]}
									maxBarSize={28}
								/>
							</BarChart>
						</ChartContainer>
					</div>
				)}
				{insightTab === "week" && (
					<div className="flex min-h-0 flex-1 flex-col">
						{weeklyData.length === 0 ? (
							<div className="flex min-h-[200px] flex-1 items-center justify-center rounded-md border border-dashed border-border/80 bg-muted/20 px-4 text-center">
								<p className="text-[11px] font-mono text-muted-foreground">
									No weeks in this year view.
								</p>
							</div>
						) : (
							<ChartContainer
								config={chartConfig}
								className="aspect-auto h-full min-h-[200px] w-full min-w-0 flex-1"
							>
								<AreaChart
									accessibilityLayer
									data={weeklyData}
									margin={{
										left: 0,
										right: 4,
										top: 4,
									}}
								>
									<defs>
										<linearGradient
											id="fillContributionWeekly"
											x1="0"
											y1="0"
											x2="0"
											y2="1"
										>
											<stop
												offset="0%"
												stopColor="var(--color-contributions)"
												stopOpacity={
													0.35
												}
											/>
											<stop
												offset="100%"
												stopColor="var(--color-contributions)"
												stopOpacity={
													0.02
												}
											/>
										</linearGradient>
									</defs>
									<CartesianGrid
										vertical={false}
										strokeDasharray="3 3"
									/>
									<XAxis
										dataKey="week"
										tickLine={false}
										axisLine={false}
										tickMargin={8}
										fontSize={10}
										tickFormatter={(
											w,
										) => `W${w}`}
										interval="preserveStartEnd"
										minTickGap={12}
									/>
									<YAxis
										width={36}
										tickLine={false}
										axisLine={false}
										tickMargin={4}
										fontSize={10}
										tickFormatter={(
											v,
										) =>
											typeof v ===
												"number" &&
											v >= 1000
												? `${(v / 1000).toFixed(1)}k`
												: String(
														v,
													)
										}
									/>
									<ChartTooltip
										content={
											<ChartTooltipContent
												hideLabel
											/>
										}
									/>
									<Area
										type="monotone"
										dataKey="contributions"
										name="contributions"
										stroke="var(--color-contributions)"
										strokeWidth={2}
										fill="url(#fillContributionWeekly)"
										dot={false}
										activeDot={{
											r: 4,
											strokeWidth: 1,
											stroke: "var(--background)",
										}}
									/>
								</AreaChart>
							</ChartContainer>
						)}
					</div>
				)}
				{insightTab === "trend" && (
					<div className="flex min-h-0 flex-1 flex-col">
						<ChartContainer
							config={chartConfig}
							className="aspect-auto h-full min-h-[200px] w-full min-w-0 flex-1"
						>
							<AreaChart
								accessibilityLayer
								data={cumulativeData}
								margin={{
									left: 0,
									right: 4,
									top: 4,
								}}
							>
								<defs>
									<linearGradient
										id="fillContributionTotal"
										x1="0"
										y1="0"
										x2="0"
										y2="1"
									>
										<stop
											offset="0%"
											stopColor="var(--color-total)"
											stopOpacity={
												0.35
											}
										/>
										<stop
											offset="100%"
											stopColor="var(--color-total)"
											stopOpacity={
												0.02
											}
										/>
									</linearGradient>
								</defs>
								<CartesianGrid
									vertical={false}
									strokeDasharray="3 3"
								/>
								<XAxis
									dataKey="week"
									tickLine={false}
									axisLine={false}
									tickMargin={8}
									fontSize={10}
									tickFormatter={(w) =>
										`W${w}`
									}
									interval="preserveStartEnd"
									minTickGap={16}
								/>
								<YAxis
									width={36}
									tickLine={false}
									axisLine={false}
									tickMargin={4}
									fontSize={10}
									tickFormatter={(v) =>
										typeof v ===
											"number" &&
										v >= 1000
											? `${(v / 1000).toFixed(1)}k`
											: String(v)
									}
								/>
								<ChartTooltip
									content={
										<ChartTooltipContent />
									}
								/>
								<Area
									type="monotone"
									dataKey="total"
									name="total"
									stroke="var(--color-total)"
									strokeWidth={2}
									fill="url(#fillContributionTotal)"
								/>
							</AreaChart>
						</ChartContainer>
					</div>
				)}
			</div>
		</div>
	);
}
