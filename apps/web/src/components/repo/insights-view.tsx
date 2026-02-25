"use client";

import { useState } from "react";
import { cn, formatNumber } from "@/lib/utils";
import type {
	CommitActivityWeek,
	CodeFrequencyWeek,
	WeeklyParticipation,
	ContributorStats,
} from "@/lib/github";

// --- Language colors ---
const LANG_COLORS: Record<string, string> = {
	JavaScript: "#f1e05a",
	TypeScript: "#3178c6",
	Python: "#3572A5",
	Java: "#b07219",
	Go: "#00ADD8",
	Rust: "#dea584",
	Ruby: "#701516",
	PHP: "#4F5D95",
	"C++": "#f34b7d",
	C: "#555555",
	"C#": "#178600",
	Swift: "#F05138",
	Kotlin: "#A97BFF",
	Dart: "#00B4AB",
	Shell: "#89e051",
	HTML: "#e34c26",
	CSS: "#563d7c",
	SCSS: "#c6538c",
	Vue: "#41b883",
	Svelte: "#ff3e00",
	Lua: "#000080",
	Elixir: "#6e4a7e",
	Haskell: "#5e5086",
	Scala: "#c22d40",
	Zig: "#ec915c",
	Nix: "#7e7eff",
	OCaml: "#3be133",
	Dockerfile: "#384d54",
	Makefile: "#427819",
};

interface RepoPulseData {
	stargazers_count?: number;
	forks_count?: number;
	subscribers_count?: number;
	watchers_count?: number;
	open_issues_count?: number;
	size?: number;
	created_at?: string;
	pushed_at?: string;
	language?: string | null;
}

interface InsightsViewProps {
	repo: RepoPulseData;
	commitActivity: CommitActivityWeek[];
	codeFrequency: CodeFrequencyWeek[];
	participation: WeeklyParticipation | null;
	languages: Record<string, number>;
	contributors: ContributorStats[];
	isOrg: boolean;
}

function formatWeekDate(unixTimestamp: number): string {
	const d = new Date(unixTimestamp * 1000);
	return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatBytes(bytes: number): string {
	if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
	if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
	return `${bytes} B`;
}

function repoAge(createdAt: string): string {
	const created = new Date(createdAt);
	const now = new Date();
	const months =
		(now.getFullYear() - created.getFullYear()) * 12 +
		(now.getMonth() - created.getMonth());
	if (months < 1) return "< 1 month";
	if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
	const years = Math.floor(months / 12);
	const rem = months % 12;
	if (rem === 0) return `${years} year${years === 1 ? "" : "s"}`;
	return `${years}y ${rem}m`;
}

// --- Section wrapper ---
function Section({
	title,
	subtitle,
	children,
}: {
	title: string;
	subtitle?: string;
	children: React.ReactNode;
}) {
	return (
		<div className="border border-dashed border-border/60 p-4">
			<div className="flex items-baseline gap-2 mb-4">
				<h3 className="text-sm font-medium text-foreground">{title}</h3>
				{subtitle && (
					<span className="text-xs font-mono text-muted-foreground/60">
						{subtitle}
					</span>
				)}
			</div>
			{children}
		</div>
	);
}

// --- Stat card ---
function Stat({ label, value }: { label: string; value: string }) {
	return (
		<div className="flex flex-col gap-1 px-3 py-2.5 border border-dashed border-border/60">
			<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">
				{label}
			</span>
			<span className="text-sm font-medium tabular-nums text-foreground/80">
				{value}
			</span>
		</div>
	);
}

// --- Sparkline for contributors ---
function Sparkline({ data, maxVal }: { data: number[]; maxVal: number }) {
	const h = 20;
	return (
		<div className="flex items-end gap-px" style={{ height: h }}>
			{data.map((v, i) => (
				<div
					key={i}
					className="w-1 bg-success/60 rounded-t-sm"
					style={{
						height:
							maxVal > 0
								? Math.max(1, (v / maxVal) * h)
								: 1,
					}}
				/>
			))}
		</div>
	);
}

// --- Empty state ---
function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex items-center justify-center h-24 text-xs font-mono text-muted-foreground/50">
			{message}
		</div>
	);
}

// --- Pulse Section ---
function PulseSection({ repo }: { repo: RepoPulseData }) {
	return (
		<div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
			<Stat label="Stars" value={formatNumber(repo.stargazers_count ?? 0)} />
			<Stat label="Forks" value={formatNumber(repo.forks_count ?? 0)} />
			<Stat
				label="Watchers"
				value={formatNumber(
					repo.subscribers_count ?? repo.watchers_count ?? 0,
				)}
			/>
			<Stat
				label="Open Issues"
				value={formatNumber(repo.open_issues_count ?? 0)}
			/>
			<Stat label="Size" value={formatBytes((repo.size ?? 0) * 1024)} />
			<Stat
				label="Age"
				value={repo.created_at ? repoAge(repo.created_at) : "—"}
			/>
			<Stat
				label="Last Push"
				value={
					repo.pushed_at
						? new Date(repo.pushed_at).toLocaleDateString(
								"en-US",
								{
									month: "short",
									day: "numeric",
									year: "numeric",
								},
							)
						: "—"
				}
			/>
			<Stat label="Language" value={repo.language ?? "—"} />
		</div>
	);
}

// --- Commit Activity Section ---
function CommitActivitySection({ data }: { data: CommitActivityWeek[] }) {
	const [hovered, setHovered] = useState<number | null>(null);
	if (data.length === 0) return <EmptyState message="No commit activity data available" />;

	const maxCommits = Math.max(...data.map((w) => w.total), 1);
	const totalCommits = data.reduce((sum, w) => sum + w.total, 0);
	const chartHeight = 120;

	return (
		<Section
			title="Commit Activity"
			subtitle={`${formatNumber(totalCommits)} commits in the last year`}
		>
			<div className="relative">
				<div
					className="flex items-end gap-px"
					style={{ height: chartHeight }}
				>
					{data.map((week, i) => (
						<div
							key={i}
							className="flex-1 relative group"
							onMouseEnter={() => setHovered(i)}
							onMouseLeave={() => setHovered(null)}
						>
							<div
								className={cn(
									"w-full rounded-t-sm transition-colors",
									hovered === i
										? "bg-success/80"
										: "bg-success/70",
								)}
								style={{
									height: Math.max(
										1,
										(week.total /
											maxCommits) *
											chartHeight,
									),
								}}
							/>
							{hovered === i && (
								<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap px-2 py-1 text-[10px] font-mono bg-card text-foreground rounded shadow-lg">
									{formatWeekDate(week.week)}{" "}
									— {week.total} commit
									{week.total !== 1
										? "s"
										: ""}
								</div>
							)}
						</div>
					))}
				</div>
			</div>
		</Section>
	);
}

// --- Code Frequency Section ---
function CodeFrequencySection({ data }: { data: CodeFrequencyWeek[] }) {
	const [hovered, setHovered] = useState<number | null>(null);
	if (data.length === 0) return <EmptyState message="No code frequency data available" />;

	const maxAdd = Math.max(...data.map((w) => w.additions), 1);
	const maxDel = Math.max(...data.map((w) => w.deletions), 1);
	const maxVal = Math.max(maxAdd, maxDel);
	const halfHeight = 80;

	const totalAdditions = data.reduce((sum, w) => sum + w.additions, 0);
	const totalDeletions = data.reduce((sum, w) => sum + w.deletions, 0);

	return (
		<Section
			title="Code Frequency"
			subtitle={`+${formatNumber(totalAdditions)} / -${formatNumber(totalDeletions)}`}
		>
			<div className="relative" style={{ height: halfHeight * 2 }}>
				{/* Center line */}
				<div className="absolute left-0 right-0 top-1/2 h-px bg-border/60" />
				<div className="flex items-center gap-px h-full">
					{data.map((week, i) => {
						const addH =
							maxVal > 0
								? (week.additions / maxVal) *
									halfHeight
								: 0;
						const delH =
							maxVal > 0
								? (week.deletions / maxVal) *
									halfHeight
								: 0;
						return (
							<div
								key={i}
								className="flex-1 relative flex flex-col h-full group"
								onMouseEnter={() => setHovered(i)}
								onMouseLeave={() =>
									setHovered(null)
								}
							>
								{/* Additions (grow upward from center) */}
								<div className="flex-1 flex items-end justify-center">
									<div
										className={cn(
											"w-full rounded-t-sm",
											hovered ===
												i
												? "bg-success/80"
												: "bg-success/60",
										)}
										style={{
											height: Math.max(
												0,
												addH,
											),
										}}
									/>
								</div>
								{/* Deletions (grow downward from center) */}
								<div className="flex-1 flex items-start justify-center">
									<div
										className={cn(
											"w-full rounded-b-sm",
											hovered ===
												i
												? "bg-destructive/80"
												: "bg-destructive/60",
										)}
										style={{
											height: Math.max(
												0,
												delH,
											),
										}}
									/>
								</div>
								{hovered === i && (
									<div className="absolute top-0 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap px-2 py-1 text-[10px] font-mono bg-card text-foreground rounded shadow-lg">
										{formatWeekDate(
											week.week,
										)}{" "}
										— +
										{formatNumber(
											week.additions,
										)}{" "}
										/ -
										{formatNumber(
											week.deletions,
										)}
									</div>
								)}
							</div>
						);
					})}
				</div>
			</div>
			<div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground/60">
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-sm bg-success/60" />{" "}
					Additions
				</span>
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-sm bg-destructive/60" />{" "}
					Deletions
				</span>
			</div>
		</Section>
	);
}

// --- Contributors Section ---
const INITIAL_CONTRIBUTOR_COUNT = 10;

function ContributorsSection({ contributors }: { contributors: ContributorStats[] }) {
	const [showAll, setShowAll] = useState(false);

	if (contributors.length === 0)
		return <EmptyState message="No contributor data available" />;

	const sorted = [...contributors].sort((a, b) => b.total - a.total);
	const hasMore = sorted.length > INITIAL_CONTRIBUTOR_COUNT;
	const visible = showAll ? sorted : sorted.slice(0, INITIAL_CONTRIBUTOR_COUNT);
	const sparklineWeeks = 12;
	const maxSparkline = Math.max(
		...visible.flatMap((c) => c.weeks.slice(-sparklineWeeks).map((w) => w.c)),
		1,
	);

	return (
		<Section title="Top Contributors" subtitle={`${contributors.length} total`}>
			<div className="space-y-2">
				{visible.map((c) => {
					const recent = c.weeks.slice(-sparklineWeeks);
					const totalAdd = c.weeks.reduce((s, w) => s + w.a, 0);
					const totalDel = c.weeks.reduce((s, w) => s + w.d, 0);
					return (
						<div
							key={c.login}
							className="flex items-center gap-3 py-1"
						>
							{/* eslint-disable-next-line @next/next/no-img-element */}
							<img
								src={
									c.avatar_url ||
									`https://github.com/${c.login}.png?size=32`
								}
								alt={c.login}
								width={20}
								height={20}
								className="rounded-full w-5 h-5 object-cover bg-muted"
							/>
							<span className="text-xs font-mono text-foreground/80 w-28 truncate">
								{c.login}
							</span>
							<div className="hidden sm:block">
								<Sparkline
									data={recent.map(
										(w) => w.c,
									)}
									maxVal={maxSparkline}
								/>
							</div>
							<span className="text-xs font-mono tabular-nums text-foreground/60 ml-auto">
								{formatNumber(c.total)}
							</span>
							<span className="text-[10px] font-mono tabular-nums text-success/80">
								+{formatNumber(totalAdd)}
							</span>
							<span className="text-[10px] font-mono tabular-nums text-destructive/80">
								-{formatNumber(totalDel)}
							</span>
						</div>
					);
				})}
			</div>
			{hasMore && (
				<button
					onClick={() => setShowAll(!showAll)}
					className="mt-3 text-[11px] font-mono text-muted-foreground/60 hover:text-foreground/80 transition-colors cursor-pointer"
				>
					{showAll
						? "Show less"
						: `Show all ${sorted.length} contributors`}
				</button>
			)}
		</Section>
	);
}

// --- Languages Section ---
function LanguagesSection({ languages }: { languages: Record<string, number> }) {
	const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
	if (entries.length === 0) return <EmptyState message="No language data available" />;

	const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);

	const top8 = entries.slice(0, 8);
	const otherBytes = entries.slice(8).reduce((sum, [, bytes]) => sum + bytes, 0);
	const display =
		otherBytes > 0 ? [...top8, ["Other", otherBytes] as [string, number]] : top8;

	return (
		<Section title="Languages" subtitle={formatBytes(totalBytes)}>
			{/* Stacked bar */}
			<div className="flex h-3 rounded-sm overflow-hidden mb-4">
				{display.map(([lang, bytes]) => (
					<div
						key={lang}
						className="h-full"
						style={{
							width: `${(bytes / totalBytes) * 100}%`,
							backgroundColor:
								LANG_COLORS[lang] ?? "#6b7280",
						}}
					/>
				))}
			</div>
			{/* Breakdown list */}
			<div className="space-y-1.5">
				{display.map(([lang, bytes]) => {
					const pct = ((bytes / totalBytes) * 100).toFixed(1);
					return (
						<div
							key={lang}
							className="flex items-center gap-2 text-xs"
						>
							<span
								className="w-2 h-2 rounded-full shrink-0"
								style={{
									backgroundColor:
										LANG_COLORS[lang] ??
										"#6b7280",
								}}
							/>
							<span className="font-mono text-foreground/80">
								{lang}
							</span>
							<span className="font-mono text-muted-foreground/60 ml-auto tabular-nums">
								{pct}%
							</span>
							<span className="font-mono text-muted-foreground/40 tabular-nums w-16 text-right">
								{formatBytes(bytes)}
							</span>
						</div>
					);
				})}
			</div>
		</Section>
	);
}

// --- Participation Section ---
function ParticipationSection({
	participation,
	isOrg,
}: {
	participation: WeeklyParticipation | null;
	isOrg: boolean;
}) {
	const [hovered, setHovered] = useState<number | null>(null);

	if (!participation) return <EmptyState message="No participation data available" />;

	const { all, owner: ownerData } = participation;
	const maxVal = Math.max(...all, 1);
	const chartHeight = 120;

	const ownerTotal = ownerData.reduce((s, v) => s + v, 0);
	const communityTotal = all.reduce((s, v) => s + v, 0) - ownerTotal;
	const ownerLabel = isOrg ? "Members" : "Owner";

	return (
		<Section
			title="Participation"
			subtitle={`${ownerLabel}: ${formatNumber(ownerTotal)} | Community: ${formatNumber(communityTotal)}`}
		>
			<div className="flex items-end gap-px" style={{ height: chartHeight }}>
				{all.map((total, i) => {
					const ownerVal = ownerData[i] ?? 0;
					const communityVal = total - ownerVal;
					const ownerH =
						maxVal > 0 ? (ownerVal / maxVal) * chartHeight : 0;
					const communityH =
						maxVal > 0
							? (communityVal / maxVal) * chartHeight
							: 0;
					return (
						<div
							key={i}
							className="flex-1 flex flex-col justify-end relative group"
							style={{ height: chartHeight }}
							onMouseEnter={() => setHovered(i)}
							onMouseLeave={() => setHovered(null)}
						>
							<div
								className={cn(
									"w-full rounded-t-sm",
									hovered === i
										? "bg-success/50"
										: "bg-success/30",
								)}
								style={{
									height: Math.max(
										0,
										communityH,
									),
								}}
							/>
							<div
								className={cn(
									"w-full",
									hovered === i
										? "bg-success"
										: "bg-success/70",
								)}
								style={{
									height: Math.max(0, ownerH),
								}}
							/>
							{hovered === i && (
								<div className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 z-10 whitespace-nowrap px-2 py-1 text-[10px] font-mono bg-card text-foreground rounded shadow-lg">
									{ownerLabel}: {ownerVal} |
									Community: {communityVal}
								</div>
							)}
						</div>
					);
				})}
			</div>
			<div className="flex items-center gap-4 mt-3 text-[10px] font-mono text-muted-foreground/60">
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-sm bg-success/70" />{" "}
					{ownerLabel}
				</span>
				<span className="flex items-center gap-1.5">
					<span className="w-2 h-2 rounded-sm bg-success/30" />{" "}
					Community
				</span>
			</div>
		</Section>
	);
}

// --- Main Component ---
export function InsightsView({
	repo,
	commitActivity,
	codeFrequency,
	participation,
	languages,
	contributors,
	isOrg,
}: InsightsViewProps) {
	return (
		<div className="space-y-4">
			<PulseSection repo={repo} />
			<CommitActivitySection data={commitActivity} />
			<CodeFrequencySection data={codeFrequency} />
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				<ContributorsSection contributors={contributors} />
				<LanguagesSection languages={languages} />
			</div>
			<ParticipationSection participation={participation} isOrg={isOrg} />
		</div>
	);
}
