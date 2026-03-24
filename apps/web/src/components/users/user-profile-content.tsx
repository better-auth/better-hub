"use client";

import { ContributionChart } from "@/components/dashboard/contribution-chart";
import { ContributionInsightCharts } from "@/components/users/contribution-insight-charts";
import { RepoBadge } from "@/components/repo/repo-badge";
import { XIcon } from "@/components/shared/icons/x-icon";
import { TimeAgo } from "@/components/ui/time-ago";
import { UserProfileActivityTimelineBoundary } from "@/components/users/user-profile-activity-timeline-boundary";
import { UserProfileActivityTimeline } from "@/components/users/user-profile-activity-timeline";
import { UserProfileScoreRing } from "@/components/users/user-profile-score-ring";
import { getLanguageColor } from "@/lib/github-utils";
import type { ActivityEvent } from "@/lib/github-types";
import { computeUserProfileScore } from "@/lib/user-profile-score";
import { cn, formatNumber } from "@/lib/utils";
import {
	Activity,
	ArrowUpDown,
	BookOpen,
	Building2,
	CalendarDays,
	ChevronRight,
	ExternalLink,
	FolderGit2,
	GitFork,
	Link2,
	MapPin,
	Search,
	Flame,
	Star,
	Users,
	X,
	type LucideIcon,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import {
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
	type ReactNode,
} from "react";

// !TODO: Last item in languages row should take up remaining space on mobile for a cleaner look
// !TODO: Better input handling of contribution graph on mobile
export interface UserProfile {
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
	bio: string | null;
	blog: string | null;
	location: string | null;
	company: string | null;
	twitter_username: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
}

export interface UserRepo {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	private: boolean;
	fork: boolean;
	archived: boolean;
	language: string | null;
	stargazers_count: number;
	forks_count: number;
	open_issues_count: number;
	created_at?: string | null;
	updated_at: string | null;
	pushed_at: string | null;
}

export interface UserOrg {
	login: string;
	avatar_url: string;
}

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
	contributionYears?: number[];
}

const filterTypes = ["all", "sources", "forks", "archived"] as const;

const sortTypes = ["updated", "name", "stars"] as const;

const profileTabTypes = ["readme", "repositories", "activity"] as const;

function formatJoinedDate(value: string | null): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
	});
}

function previousUtcDateString(ymd: string): string {
	const [y, m, d] = ymd.split("-").map(Number);
	const dt = new Date(Date.UTC(y, m - 1, d));
	dt.setUTCDate(dt.getUTCDate() - 1);
	return dt.toISOString().slice(0, 10);
}

export interface OrgTopRepo {
	name: string;
	full_name: string;
	stargazers_count: number;
	forks_count: number;
	language: string | null;
}

export function UserProfileContent({
	user,
	repos,
	orgs,
	contributions,
	activityEvents = [],
	orgTopRepos = [],
	hasProfileReadme = false,
	profileReadmePanel = null,
}: {
	user: UserProfile;
	repos: UserRepo[];
	orgs: UserOrg[];
	contributions: ContributionData | null;
	activityEvents?: ActivityEvent[];
	orgTopRepos?: OrgTopRepo[];
	hasProfileReadme?: boolean;
	profileReadmePanel?: ReactNode;
}) {
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringLiteral(profileTabTypes).withDefault(
			hasProfileReadme ? "readme" : "repositories",
		),
	);

	useEffect(() => {
		if (!hasProfileReadme && tab === "readme") {
			void setTab("repositories");
		}
	}, [hasProfileReadme, tab, setTab]);
	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
	const [filter, setFilter] = useQueryState(
		"filter",
		parseAsStringLiteral(filterTypes).withDefault("all"),
	);
	const [sort, setSort] = useQueryState(
		"sort",
		parseAsStringLiteral(sortTypes).withDefault("updated"),
	);
	const [languageFilter, setLanguageFilter] = useState<string | null>(null);
	const [showMoreLanguages, setShowMoreLanguages] = useState(false);
	const [selectedYear, setSelectedYear] = useState<number | null>(null);

	const currentYear = new Date().getFullYear();
	const activeYear = selectedYear ?? currentYear;

	const calendarMeasureRef = useRef<HTMLDivElement>(null);
	const [activityYearStripMaxPx, setActivityYearStripMaxPx] = useState<number | null>(null);
	const activityYearScrollRef = useRef<HTMLDivElement>(null);
	const [activityYearCanScrollLeft, setActivityYearCanScrollLeft] = useState(false);
	const [activityYearCanScrollRight, setActivityYearCanScrollRight] = useState(false);
	const activityYearStripScrolledToEndRef = useRef(false);
	const activityYearStripScrollProfileLoginRef = useRef<string | null>(null);

	const filteredContributions = useMemo(() => {
		if (!contributions) return null;

		// Build a map of existing contribution data by date
		const contributionMap = new Map<
			string,
			{ contributionCount: number; color: string }
		>();
		for (const week of contributions.weeks) {
			for (const day of week.contributionDays) {
				contributionMap.set(day.date, {
					contributionCount: day.contributionCount,
					color: day.color,
				});
			}
		}

		// Generate a full year's worth of dates
		const startOfYear = new Date(Date.UTC(activeYear, 0, 1));
		const endOfYear = new Date(Date.UTC(activeYear, 11, 31));

		// Adjust start to the previous Sunday (week start)
		const startDay = startOfYear.getUTCDay();
		const adjustedStart = new Date(startOfYear);
		adjustedStart.setUTCDate(adjustedStart.getUTCDate() - startDay);

		// Adjust end to the next Saturday (week end)
		const endDay = endOfYear.getUTCDay();
		const adjustedEnd = new Date(endOfYear);
		if (endDay !== 6) {
			adjustedEnd.setUTCDate(adjustedEnd.getUTCDate() + (6 - endDay));
		}

		// Generate all weeks
		const weeks: ContributionWeek[] = [];
		const current = new Date(adjustedStart);

		while (current <= adjustedEnd) {
			const week: ContributionDay[] = [];
			for (let i = 0; i < 7; i++) {
				const dateStr = current.toISOString().split("T")[0];
				const existing = contributionMap.get(dateStr);
				week.push({
					date: dateStr,
					contributionCount: existing?.contributionCount ?? 0,
					color: existing?.color ?? "var(--contrib-0)",
				});
				current.setUTCDate(current.getUTCDate() + 1);
			}
			weeks.push({ contributionDays: week });
		}

		// Calculate total contributions for the year
		const totalContributions = weeks.reduce(
			(sum, week) =>
				sum +
				week.contributionDays.reduce(
					(daySum, day) => daySum + day.contributionCount,
					0,
				),
			0,
		);

		return {
			...contributions,
			weeks,
			totalContributions,
		};
	}, [contributions, activeYear]);

	const yearStats = useMemo(() => {
		if (!filteredContributions) return null;

		const allDays = filteredContributions.weeks.flatMap((w) => w.contributionDays);
		const activeDays = allDays.filter((d) => d.contributionCount > 0).length;

		// Current streak: walk backward from today; skip zero days until the last activity,
		// then count consecutive days with contributions (matches “streak” when today is empty).
		const today = new Date().toISOString().split("T")[0];
		const countByDate = new Map(
			allDays.map((day) => [day.date, day.contributionCount]),
		);
		let anchor = today;
		while (countByDate.has(anchor) && (countByDate.get(anchor) ?? 0) === 0) {
			anchor = previousUtcDateString(anchor);
		}
		let currentStreak = 0;
		if (countByDate.has(anchor) && (countByDate.get(anchor) ?? 0) > 0) {
			let d = anchor;
			while (countByDate.has(d) && (countByDate.get(d) ?? 0) > 0) {
				currentStreak++;
				d = previousUtcDateString(d);
			}
		}

		// Calculate best streak in the year
		const sortedDaysAsc = [...allDays].sort((a, b) => a.date.localeCompare(b.date));
		let bestStreak = 0;
		let tempStreak = 0;
		for (const day of sortedDaysAsc) {
			if (day.contributionCount > 0) {
				tempStreak++;
				bestStreak = Math.max(bestStreak, tempStreak);
			} else {
				tempStreak = 0;
			}
		}

		return {
			activeDays,
			currentStreak,
			bestStreak,
		};
	}, [filteredContributions]);

	useLayoutEffect(() => {
		if (!contributions || !filteredContributions) {
			setActivityYearStripMaxPx(null);
			return;
		}
		const el = calendarMeasureRef.current;
		if (!el) {
			setActivityYearStripMaxPx(null);
			return;
		}
		const mq = window.matchMedia("(min-width: 1024px)");
		const update = () => {
			const w = Math.round(el.getBoundingClientRect().width);
			setActivityYearStripMaxPx(mq.matches ? w : null);
		};
		update();
		const ro = new ResizeObserver(update);
		ro.observe(el);
		mq.addEventListener("change", update);
		return () => {
			ro.disconnect();
			mq.removeEventListener("change", update);
		};
	}, [contributions, filteredContributions, activeYear]);

	const updateActivityYearScrollShadow = useCallback(() => {
		const el = activityYearScrollRef.current;
		if (!el) {
			setActivityYearCanScrollLeft(false);
			setActivityYearCanScrollRight(false);
			return;
		}
		const { scrollLeft, clientWidth, scrollWidth } = el;
		const epsilon = 2;
		const maxScroll = scrollWidth - clientWidth;
		setActivityYearCanScrollLeft(scrollLeft > epsilon);
		setActivityYearCanScrollRight(
			maxScroll > epsilon && scrollLeft < maxScroll - epsilon,
		);
	}, []);

	useLayoutEffect(() => {
		if (activityYearStripScrollProfileLoginRef.current !== user.login) {
			activityYearStripScrollProfileLoginRef.current = user.login;
			activityYearStripScrolledToEndRef.current = false;
		}

		updateActivityYearScrollShadow();
		const el = activityYearScrollRef.current;
		if (!el) return;

		const tryScrollYearStripToEnd = () => {
			if (activityYearStripScrolledToEndRef.current) {
				return;
			}
			const years = contributions?.contributionYears;
			if (!years || years.length <= 1) {
				return;
			}
			if (el.scrollWidth <= el.clientWidth + 1) {
				return;
			}
			el.scrollLeft = el.scrollWidth - el.clientWidth;
			activityYearStripScrolledToEndRef.current = true;
			updateActivityYearScrollShadow();
		};

		tryScrollYearStripToEnd();

		const ro = new ResizeObserver(() => {
			updateActivityYearScrollShadow();
			tryScrollYearStripToEnd();
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, [
		user.login,
		updateActivityYearScrollShadow,
		contributions,
		activityYearStripMaxPx,
		activeYear,
	]);

	const contributionStatItems = useMemo(
		(): {
			key: string;
			label: string;
			value: string;
			icon: LucideIcon;
		}[] => [
			{
				key: "contributions",
				label: "Contributions",
				value: formatNumber(filteredContributions?.totalContributions ?? 0),
				icon: Activity,
			},
			{
				key: "active",
				label: "Active days",
				value: formatNumber(yearStats?.activeDays ?? 0),
				icon: CalendarDays,
			},
			{
				key: "streak",
				label: "Longest streak",
				value: formatNumber(yearStats?.bestStreak ?? 0),
				icon: Flame,
			},
		],
		[filteredContributions, yearStats],
	);

	const moreLanguagesRef = useRef<HTMLDivElement | null>(null);
	const moreLanguagesMenuRef = useRef<HTMLDivElement | null>(null);
	const [moreLanguagesPlacement, setMoreLanguagesPlacement] = useState<
		"down-left" | "down-right" | "up-left" | "up-right"
	>("down-left");

	useEffect(() => {
		if (!showMoreLanguages) return;
		const root = moreLanguagesRef.current;
		const menu = moreLanguagesMenuRef.current;
		if (root && menu) {
			const rootRect = root.getBoundingClientRect();
			const menuRect = menu.getBoundingClientRect();
			const shouldOpenUp =
				rootRect.bottom + 6 + menuRect.height > window.innerHeight - 8;
			const shouldAlignRight =
				rootRect.left + menuRect.width > window.innerWidth - 8;
			setMoreLanguagesPlacement(
				`${shouldOpenUp ? "up" : "down"}-${shouldAlignRight ? "right" : "left"}`,
			);
		}
		const firstItem = moreLanguagesMenuRef.current?.querySelector<HTMLButtonElement>(
			'button[data-more-lang-item="true"]',
		);
		firstItem?.focus();

		function onPointerDown(event: MouseEvent) {
			if (!moreLanguagesRef.current) return;
			const target = event.target;
			if (target instanceof Node && !moreLanguagesRef.current.contains(target)) {
				setShowMoreLanguages(false);
			}
		}
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setShowMoreLanguages(false);
				const trigger =
					moreLanguagesRef.current?.querySelector<HTMLButtonElement>(
						'button[data-more-lang-trigger="true"]',
					);
				trigger?.focus();
				return;
			}
			if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
			if (!moreLanguagesRef.current?.contains(document.activeElement)) return;
			const items = Array.from(
				moreLanguagesMenuRef.current?.querySelectorAll<HTMLButtonElement>(
					'button[data-more-lang-item="true"]',
				) ?? [],
			);
			if (items.length === 0) return;
			event.preventDefault();
			const activeIdx = items.findIndex((el) => el === document.activeElement);
			if (event.key === "Home") {
				items[0]?.focus();
				return;
			}
			if (event.key === "End") {
				items[items.length - 1]?.focus();
				return;
			}
			if (event.key === "ArrowDown") {
				const next = activeIdx < 0 ? 0 : (activeIdx + 1) % items.length;
				items[next]?.focus();
				return;
			}
			const prev =
				activeIdx < 0
					? items.length - 1
					: (activeIdx - 1 + items.length) % items.length;
			items[prev]?.focus();
		}
		document.addEventListener("mousedown", onPointerDown);
		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("mousedown", onPointerDown);
			document.removeEventListener("keydown", onKeyDown);
		};
	}, [showMoreLanguages]);

	const filtered = useMemo(
		() =>
			repos
				.filter((repo) => {
					if (
						search &&
						![
							repo.name,
							repo.description ?? "",
							repo.language ?? "",
						]
							.join(" ")
							.toLowerCase()
							.includes(search.toLowerCase())
					) {
						return false;
					}
					if (filter === "sources" && repo.fork) return false;
					if (filter === "forks" && !repo.fork) return false;
					if (filter === "archived" && !repo.archived) return false;
					if (languageFilter && repo.language !== languageFilter)
						return false;
					return true;
				})
				.sort((a, b) => {
					if (sort === "name") return a.name.localeCompare(b.name);
					if (sort === "stars")
						return b.stargazers_count - a.stargazers_count;
					return (
						new Date(b.updated_at || 0).getTime() -
						new Date(a.updated_at || 0).getTime()
					);
				}),
		[repos, search, filter, sort, languageFilter],
	);

	const languages = useMemo(
		() => [
			...new Set(
				repos
					.map((repo) => repo.language)
					.filter((lang): lang is string => Boolean(lang)),
			),
		],
		[repos],
	);
	const topLanguages = useMemo(() => languages.slice(0, 10), [languages]);
	const extraLanguages = useMemo(() => languages.slice(10), [languages]);

	const clearRepoFilters = useCallback(() => {
		setSearch("");
		setFilter("all");
		setLanguageFilter(null);
		setShowMoreLanguages(false);
	}, [setFilter, setSearch]);

	const toggleLanguageFilter = useCallback((language: string) => {
		setLanguageFilter((current) => (current === language ? null : language));
		setShowMoreLanguages(false);
	}, []);

	// Language distribution for the bar
	const languageDistribution = useMemo(() => {
		const counts: Record<string, number> = {};
		for (const repo of repos) {
			if (repo.language) {
				counts[repo.language] = (counts[repo.language] || 0) + 1;
			}
		}
		const total = Object.values(counts).reduce((a, b) => a + b, 0);
		if (total === 0) return [];
		return Object.entries(counts)
			.sort(([, a], [, b]) => b - a)
			.map(([lang, count]) => ({
				language: lang,
				percentage: (count / total) * 100,
				count,
			}));
	}, [repos]);

	const joinedDate = formatJoinedDate(user.created_at);

	const totalStars = useMemo(
		() => repos.reduce((sum, r) => sum + r.stargazers_count, 0),
		[repos],
	);

	const totalForks = useMemo(() => repos.reduce((sum, r) => sum + r.forks_count, 0), [repos]);

	const profileScore = useMemo(() => {
		const personalTopStars =
			repos.length > 0 ? Math.max(...repos.map((r) => r.stargazers_count)) : 0;
		const orgTopStars =
			orgTopRepos.length > 0
				? Math.max(...orgTopRepos.map((r) => r.stargazers_count))
				: 0;
		const topRepoStars = Math.max(personalTopStars, orgTopStars);

		// Include org repo stars/forks in totals
		const orgStars = orgTopRepos.reduce((sum, r) => sum + r.stargazers_count, 0);
		const orgForks = orgTopRepos.reduce((sum, r) => sum + r.forks_count, 0);

		// Languages from both personal and org repos
		const allLanguages = [
			...repos.map((r) => r.language),
			...orgTopRepos.map((r) => r.language),
		].filter(Boolean);
		const languageCount = new Set(allLanguages).size;

		return computeUserProfileScore({
			followers: user.followers,
			following: user.following,
			publicRepos: user.public_repos,
			accountCreated: user.created_at,
			hasBio: !!user.bio,
			totalStars: totalStars + orgStars,
			topRepoStars,
			totalForks: totalForks + orgForks,
			totalContributions: contributions?.totalContributions ?? 0,
			orgCount: orgs.length,
			languageCount,
		});
	}, [user, repos, orgs, contributions, totalStars, totalForks, orgTopRepos]);

	return (
		<div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0 pb-2 px-4 sm:px-6 lg:px-8">
			{/* ── Left sidebar ── */}
			<aside className="shrink-0 lg:w-70 lg:sticky lg:top-4 lg:self-start">
				{/* Avatar + identity */}
				<div className="flex flex-col items-center lg:items-start">
					<div className="relative group">
						<div className="absolute -inset-1 rounded-full bg-linear-to-br from-(--contrib-2)/20 via-transparent to-(--contrib-4)/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
						<Image
							src={user.avatar_url}
							alt={user.login}
							width={120}
							height={120}
							className="relative rounded-full border border-border"
						/>
					</div>

					<div className="mt-4 text-center lg:text-left w-full">
						<div className="flex items-center gap-2 justify-center lg:justify-start">
							<h1 className="text-xl font-medium tracking-tight truncate">
								{user.name || user.login}
							</h1>
							<a
								href={user.html_url}
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
							>
								<ExternalLink className="w-3 h-3" />
							</a>
						</div>
						<p className="text-xs text-muted-foreground/50 font-mono">
							@{user.login}
						</p>
					</div>
				</div>

				{user.bio && (
					<p className="text-sm text-muted-foreground mt-3 leading-relaxed">
						{user.bio}
					</p>
				)}

				{/* Stats grid */}
				<div className="grid grid-cols-3 gap-px mt-5 bg-border rounded-md overflow-hidden">
					{[
						{ label: "Repos", value: user.public_repos },
						{ label: "Stars", value: totalStars },
						{ label: "Forks", value: totalForks },
					].map((stat) => (
						<div
							key={stat.label}
							className="bg-card px-3 py-2.5 text-center"
						>
							<div className="text-sm font-medium tabular-nums">
								{formatNumber(stat.value)}
							</div>
							<div className="text-[10px] text-muted-foreground/50 font-mono uppercase tracking-wider mt-0.5">
								{stat.label}
							</div>
						</div>
					))}
				</div>

				{/* Profile Score */}
				<div className="mt-4">
					<UserProfileScoreRing score={profileScore} />
				</div>

				{/* Followers */}
				<div className="flex items-center gap-3 mt-4 text-xs text-muted-foreground font-mono">
					<span className="inline-flex items-center gap-1.5">
						<Users className="w-3 h-3" />
						<span className="text-foreground font-medium">
							{formatNumber(user.followers)}
						</span>{" "}
						followers
					</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<span>
						<span className="text-foreground font-medium">
							{formatNumber(user.following)}
						</span>{" "}
						following
					</span>
				</div>

				{/* Metadata */}
				<div className="flex flex-col gap-2 mt-5 pt-5 border-t border-border">
					{user.company && (
						<span className="inline-flex items-center gap-2 text-xs text-muted-foreground font-mono">
							<Building2 className="w-3 h-3 shrink-0 text-muted-foreground/50" />
							{user.company}
						</span>
					)}
					{user.location && (
						<span className="inline-flex items-center gap-2 text-xs text-muted-foreground font-mono">
							<MapPin className="w-3 h-3 shrink-0 text-muted-foreground/50" />
							{user.location}
						</span>
					)}
					{user.blog && (
						<a
							href={
								user.blog.startsWith("http")
									? user.blog
									: `https://${user.blog}`
							}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
						>
							<Link2 className="w-3 h-3 shrink-0 text-muted-foreground/50" />
							{user.blog.replace(/^https?:\/\//, "")}
						</a>
					)}
					{user.twitter_username && (
						<a
							href={`https://twitter.com/${user.twitter_username}`}
							target="_blank"
							rel="noreferrer"
							className="inline-flex items-center gap-2 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
						>
							<XIcon className="w-3 h-3 shrink-0 text-muted-foreground/50" />
							@{user.twitter_username}
						</a>
					)}
					{joinedDate && (
						<span className="inline-flex items-center gap-2 text-xs text-muted-foreground/50 font-mono">
							<CalendarDays className="w-3 h-3 shrink-0" />
							Joined {joinedDate}
						</span>
					)}
				</div>

				{/* Organizations */}
				{orgs.length > 0 && (
					<div className="mt-5 pt-5 border-t border-border">
						<h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
							Organizations
						</h2>
						<div className="flex flex-col gap-1.5">
							{orgs.map((org) => (
								<Link
									key={org.login}
									href={`/${org.login}`}
									className="group flex items-center gap-2.5 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-muted/50 dark:hover:bg-white/3 transition-colors"
								>
									<Image
										src={org.avatar_url}
										alt={org.login}
										width={20}
										height={20}
										className="rounded shrink-0"
									/>
									<span className="text-xs font-mono text-muted-foreground group-hover:text-foreground transition-colors truncate">
										{org.login}
									</span>
								</Link>
							))}
						</div>
					</div>
				)}

				{/* Language distribution */}
				{languageDistribution.length > 0 && (
					<div className="my-5 pt-5 border-t border-border">
						<h2 className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mb-3">
							Languages
						</h2>
						{/* Bar */}
						<div className="flex h-2 rounded-full overflow-hidden gap-px">
							{languageDistribution.map((lang) => (
								<div
									key={lang.language}
									className="h-full first:rounded-l-full last:rounded-r-full transition-all duration-300"
									style={{
										width: `${Math.max(lang.percentage, 2)}%`,
										backgroundColor:
											getLanguageColor(
												lang.language,
											),
									}}
									title={`${lang.language}: ${lang.percentage.toFixed(1)}%`}
								/>
							))}
						</div>
						{/* Legend */}
						<div className="flex flex-wrap gap-x-3 gap-y-1 mt-2.5">
							{languageDistribution
								.slice(0, 6)
								.map((lang) => (
									<button
										key={lang.language}
										onClick={() =>
											setLanguageFilter(
												(
													current,
												) =>
													current ===
													lang.language
														? null
														: lang.language,
											)
										}
										className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 font-mono hover:text-foreground transition-colors cursor-pointer"
									>
										<span
											className="w-1.5 h-1.5 rounded-full shrink-0"
											style={{
												backgroundColor:
													getLanguageColor(
														lang.language,
													),
											}}
										/>
										{lang.language}
										<span className="text-muted-foreground/30">
											{lang.percentage.toFixed(
												0,
											)}
											%
										</span>
									</button>
								))}
						</div>
					</div>
				)}
			</aside>

			{/* ── Main content ── */}
			<main className="flex-1 min-w-0 flex flex-col min-h-0 lg:overflow-y-auto">
				{/* Contribution chart, year stats, and insight charts */}
				<div className="shrink-0 mb-4 pt-5 sm:pt-6">
					{contributions && filteredContributions ? (
						<div className="grid w-full grid-cols-1 gap-4 xl:grid-cols-[max-content_minmax(22rem,1fr)] xl:items-stretch xl:gap-4">
							{/* Calendar + year stats (one card); hugs width beside insights on xl */}
							<div className="flex min-h-0 w-full max-w-full flex-col lg:w-max xl:h-full xl:min-h-0">
								<div className="flex min-h-0 flex-1 flex-col overflow-x-hidden rounded-md border border-border bg-card/50 p-4">
									{contributions.contributionYears &&
										contributions
											.contributionYears
											.length >
											1 && (
											<div
												className="relative mb-3 min-w-0"
												style={
													activityYearStripMaxPx !=
													null
														? {
																maxWidth: activityYearStripMaxPx,
															}
														: undefined
												}
											>
												<div
													className={cn(
														"pointer-events-none absolute inset-y-0 left-0 z-10 w-8 bg-gradient-to-r from-card/80 to-transparent transition-opacity duration-200",
														activityYearCanScrollLeft
															? "opacity-100"
															: "opacity-0",
													)}
													aria-hidden
												/>
												<div
													className={cn(
														"pointer-events-none absolute inset-y-0 right-0 z-10 w-8 bg-gradient-to-l from-card/80 to-transparent transition-opacity duration-200",
														activityYearCanScrollRight
															? "opacity-100"
															: "opacity-0",
													)}
													aria-hidden
												/>
												<div
													ref={
														activityYearScrollRef
													}
													className="no-scrollbar flex min-w-0 items-center gap-1 overflow-x-auto"
													onScroll={
														updateActivityYearScrollShadow
													}
												>
													<span className="mr-2 shrink-0 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50">
														Activity
													</span>
													<div className="flex shrink-0 items-center">
														{[
															...contributions.contributionYears,
														]
															.sort(
																(
																	a,
																	b,
																) =>
																	a -
																	b,
															)
															.map(
																(
																	year,
																	index,
																) => (
																	<div
																		key={
																			year
																		}
																		className="flex items-center"
																	>
																		{index >
																			0 && (
																			<div className="mx-1 h-px w-3 bg-border" />
																		)}
																		<button
																			type="button"
																			onClick={() =>
																				setSelectedYear(
																					year ===
																						currentYear
																						? null
																						: year,
																				)
																			}
																			className={cn(
																				"cursor-pointer rounded-sm px-2 py-1 text-[11px] font-mono transition-colors",
																				activeYear ===
																					year
																					? "bg-muted/60 text-foreground dark:bg-white/6"
																					: "text-muted-foreground hover:bg-muted/40 hover:text-foreground dark:hover:bg-white/3",
																			)}
																		>
																			{
																				year
																			}
																		</button>
																	</div>
																),
															)}
													</div>
												</div>
											</div>
										)}
									<div className="flex min-w-0 flex-col gap-3">
										<div className="min-w-0 shrink-0">
											<ContributionChart
												calendarMeasureRef={
													calendarMeasureRef
												}
												data={
													filteredContributions
												}
												streak={
													yearStats
														? activeYear ===
															currentYear
															? yearStats.currentStreak >
																0
																? {
																		kind: "current",
																		count: yearStats.currentStreak,
																	}
																: null
															: yearStats.bestStreak >
																  0
																? {
																		kind: "best",
																		count: yearStats.bestStreak,
																	}
																: null
														: null
												}
											/>
										</div>
										<div className="grid w-full shrink-0 grid-cols-1 gap-2 border-t border-border/60 pt-3 min-[420px]:grid-cols-3">
											{contributionStatItems.map(
												(
													s,
												) => {
													const Icon =
														s.icon;
													return (
														<div
															key={
																s.key
															}
															className="flex items-center gap-2 rounded-md bg-muted/35 px-2 py-1.5 dark:bg-white/[0.04]"
														>
															<div className="flex size-7 shrink-0 items-center justify-center rounded border border-border/60 bg-background/70 text-muted-foreground dark:bg-black/20">
																<Icon
																	className="size-3.5"
																	strokeWidth={
																		1.75
																	}
																	aria-hidden
																/>
															</div>
															<div className="min-w-0 flex-1 leading-tight">
																<div className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/65">
																	{
																		s.label
																	}
																</div>
																<div className="mt-0.5 text-sm font-semibold tabular-nums tracking-tight">
																	{
																		s.value
																	}
																</div>
															</div>
														</div>
													);
												},
											)}
										</div>
									</div>
								</div>
							</div>

							<div className="flex min-h-0 w-full min-w-0 flex-col xl:h-full">
								<ContributionInsightCharts
									weeks={
										filteredContributions.weeks
									}
								/>
							</div>
						</div>
					) : (
						<div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
							{contributionStatItems.map((s) => (
								<div
									key={s.key}
									className="border border-border rounded-md bg-card/50 px-2.5 py-2"
								>
									<div className="text-sm font-semibold tabular-nums leading-none">
										{s.value}
									</div>
									<div className="text-[9px] text-muted-foreground/60 font-mono uppercase tracking-wider mt-1">
										{s.label}
									</div>
								</div>
							))}
						</div>
					)}
				</div>

				{/* Tab switcher */}
				<div className="shrink-0 mb-4">
					<div className="flex items-center border border-border divide-x divide-border rounded-sm lg:w-fit">
						{hasProfileReadme && (
							<button
								type="button"
								onClick={() => setTab("readme")}
								className={cn(
									"flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer lg:rounded-l-md",
									tab === "readme"
										? "bg-muted/50 dark:bg-white/4 text-foreground"
										: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
								)}
							>
								<BookOpen className="w-3.5 h-3.5" />
								README
							</button>
						)}
						<button
							type="button"
							onClick={() => setTab("repositories")}
							className={cn(
								"flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
								hasProfileReadme
									? "lg:rounded-none"
									: "lg:rounded-l-md",
								tab === "repositories"
									? "bg-muted/50 dark:bg-white/4 text-foreground"
									: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
							)}
						>
							<FolderGit2 className="w-3.5 h-3.5" />
							Repositories
							<span className="text-muted-foreground/50 tabular-nums">
								{repos.length}
							</span>
						</button>
						<button
							type="button"
							onClick={() => setTab("activity")}
							className={cn(
								"flex-1 flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer lg:rounded-r-md",
								tab === "activity"
									? "bg-muted/50 dark:bg-white/4 text-foreground"
									: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
							)}
						>
							<Activity className="w-3.5 h-3.5" />
							Activity
						</button>
					</div>
				</div>

				{tab === "readme" && hasProfileReadme && profileReadmePanel}

				{tab === "repositories" && (
					<>
						{/* Search & filters */}
						<div className="shrink-0">
							<div className="flex flex-col gap-2 lg:mb-3 sm:flex-row sm:items-center">
								<div className="relative flex-1">
									<Search className="absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground/50" />
									<input
										type="text"
										placeholder="Find a repository..."
										value={search}
										onChange={(e) => {
											const next =
												e
													.target
													.value;
											setSearch(
												next,
											);
											if (
												next.trim()
											)
												setLanguageFilter(
													null,
												);
										}}
										className="box-border h-8 w-full rounded-none border border-border bg-transparent pr-3 pl-8 font-mono text-sm leading-8 placeholder:text-muted-foreground transition-colors focus:border-foreground/20 focus:outline-none focus:ring-[3px] focus:ring-ring/50 lg:rounded-md"
									/>
								</div>

								<div className="flex w-full items-center justify-between gap-2 sm:w-auto sm:justify-start">
									<div className="flex shrink-0 items-center divide-x divide-border rounded-md border border-border">
										{(
											[
												[
													"all",
													"All",
												],
												[
													"sources",
													"Sources",
												],
												[
													"forks",
													"Forks",
												],
												[
													"archived",
													"Archived",
												],
											] as const
										).map(
											([
												value,
												label,
											]) => (
												<button
													key={
														value
													}
													onClick={() =>
														setFilter(
															value,
														)
													}
													className={cn(
														"cursor-pointer px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
														filter ===
															value
															? "bg-muted/50 dark:bg-white/4 text-foreground"
															: "text-muted-foreground hover:bg-muted/60 hover:text-foreground/60 dark:hover:bg-white/3",
													)}
												>
													{
														label
													}
												</button>
											),
										)}
									</div>

									<button
										onClick={() =>
											setSort(
												(
													current,
												) =>
													current ===
													"updated"
														? "stars"
														: current ===
															  "stars"
															? "name"
															: "updated",
											)
										}
										className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground/60 dark:hover:bg-white/3"
									>
										<ArrowUpDown className="w-3 h-3" />
										{sort === "updated"
											? "Updated"
											: sort ===
												  "stars"
												? "Stars"
												: "Name"}
									</button>
								</div>
							</div>

							<div className="flex items-start justify-between gap-4 mb-4">
								{languages.length > 0 && (
									<div className="flex items-center gap-1.5 flex-wrap mt-0.5 after:flex-1 after:content-['']">
										{topLanguages.map(
											(lang) => (
												<button
													key={
														lang
													}
													onClick={() =>
														toggleLanguageFilter(
															lang,
														)
													}
													aria-label={`Filter by ${lang}`}
													className={cn(
														"flex items-center gap-1.5 px-2 py-1 text-[11px] border border-border transition-colors cursor-pointer font-mono rounded-md",
														languageFilter ===
															lang
															? "bg-muted/80 dark:bg-white/6 text-foreground border-foreground/15"
															: "text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3",
													)}
												>
													<span
														className="w-2 h-2 rounded-full"
														style={{
															backgroundColor:
																getLanguageColor(
																	lang,
																),
														}}
													/>
													{
														lang
													}
												</button>
											),
										)}
										{extraLanguages.length >
											0 && (
											<div
												className="relative"
												ref={
													moreLanguagesRef
												}
											>
												<button
													data-more-lang-trigger="true"
													onClick={() =>
														setShowMoreLanguages(
															(
																current,
															) =>
																!current,
														)
													}
													aria-label={`Show ${extraLanguages.length} more languages`}
													aria-expanded={
														showMoreLanguages
													}
													aria-haspopup="true"
													className="px-2 py-1 text-[11px] border border-border rounded-md text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3 transition-colors font-mono"
												>
													+
													{
														extraLanguages.length
													}{" "}
													more
												</button>
												{showMoreLanguages && (
													<div
														ref={
															moreLanguagesMenuRef
														}
														className={cn(
															"absolute z-20 min-w-40 max-h-56 overflow-y-auto rounded-md border border-border bg-background/95 backdrop-blur-sm p-1.5 shadow-xl",
															moreLanguagesPlacement.startsWith(
																"up",
															)
																? "bottom-[calc(100%+6px)]"
																: "top-[calc(100%+6px)]",
															moreLanguagesPlacement.endsWith(
																"right",
															)
																? "right-0"
																: "left-0",
														)}
													>
														<div className="flex flex-col gap-1">
															{extraLanguages.map(
																(
																	lang,
																) => (
																	<button
																		key={
																			lang
																		}
																		data-more-lang-item="true"
																		onClick={() =>
																			toggleLanguageFilter(
																				lang,
																			)
																		}
																		aria-label={`Filter by ${lang}`}
																		className={cn(
																			"flex items-center gap-1.5 px-2 py-1 text-[11px] border border-border transition-colors cursor-pointer font-mono rounded-md text-left",
																			languageFilter ===
																				lang
																				? "bg-muted/80 dark:bg-white/6 text-foreground border-foreground/15"
																				: "text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3",
																		)}
																	>
																		<span
																			className="w-2 h-2 rounded-full"
																			style={{
																				backgroundColor:
																					getLanguageColor(
																						lang,
																					),
																			}}
																		/>
																		{
																			lang
																		}
																	</button>
																),
															)}
														</div>
													</div>
												)}
											</div>
										)}
									</div>
								)}
								<div className="hidden lg:flex items-center gap-3 shrink-0 ml-auto pt-1">
									{(search ||
										languageFilter ||
										filter !==
											"all") && (
										<button
											onClick={
												clearRepoFilters
											}
											aria-label="Clear repository filters"
											className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors"
										>
											<X className="w-3 h-3" />
											Clear
										</button>
									)}
									<span className="text-[11px] text-muted-foreground/30 font-mono tabular-nums">
										{filtered.length}/
										{repos.length}
									</span>
								</div>
							</div>

							{/* Mobile counter & clear row */}
							<div className="lg:hidden flex items-center justify-between mb-4">
								{(search ||
									languageFilter ||
									filter !== "all") && (
									<button
										onClick={
											clearRepoFilters
										}
										aria-label="Clear repository filters"
										className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors"
									>
										<X className="w-3 h-3" />
										Clear
									</button>
								)}
								<span className="text-[11px] text-muted-foreground/30 font-mono tabular-nums ml-auto">
									{filtered.length}/
									{repos.length}
								</span>
							</div>
						</div>

						{/* Repo list */}
						<div className="flex-1 min-h-[50dvh] lg:min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
							{filtered.map((repo) => (
								<Link
									key={repo.id}
									href={`/${repo.full_name}`}
									className="group flex items-start md:items-center gap-3 md:gap-4 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
								>
									{/* Mobile: Stacked layout */}
									<div className="flex sm:hidden w-full items-start gap-3">
										<FolderGit2 className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
										<div className="flex-1 min-w-0">
											<span className="text-sm text-foreground font-mono truncate block">
												{
													repo.name
												}
											</span>
											<div className="flex items-center gap-1.5 flex-wrap mt-1">
												{repo.private ? (
													<RepoBadge type="private" />
												) : (
													<RepoBadge type="public" />
												)}
												{repo.archived && (
													<RepoBadge type="archived" />
												)}
												{repo.fork && (
													<RepoBadge type="fork" />
												)}
											</div>
											{repo.description && (
												<p className="text-[11px] text-muted-foreground/60 mt-1">
													{
														repo.description
													}
												</p>
											)}
											<div className="mt-2 flex items-center flex-wrap gap-x-3 gap-y-1">
												{repo.language && (
													<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-mono">
														<span
															className="w-2 h-2 rounded-full"
															style={{
																backgroundColor:
																	getLanguageColor(
																		repo.language,
																	),
															}}
														/>
														{
															repo.language
														}
													</span>
												)}
												{repo.stargazers_count >
													0 && (
													<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
														<Star className="w-3 h-3" />
														{formatNumber(
															repo.stargazers_count,
														)}
													</span>
												)}
												{repo.forks_count >
													0 && (
													<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
														<GitFork className="w-3 h-3" />
														{formatNumber(
															repo.forks_count,
														)}
													</span>
												)}
												{repo.updated_at && (
													<span className="text-[11px] text-muted-foreground font-mono">
														<TimeAgo
															date={
																repo.updated_at
															}
														/>
													</span>
												)}
											</div>
										</div>
										<ChevronRight className="w-3 h-3 text-foreground/10 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
									</div>

									{/* Desktop: Inline layout */}
									<div className="contents">
										<FolderGit2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
										<div className="flex-1 min-w-0">
											<div className="flex items-center gap-2 flex-wrap">
												<span className="text-sm text-foreground group-hover:text-foreground transition-colors font-mono">
													{
														repo.name
													}
												</span>
												<div className="flex items-center gap-1.5 flex-wrap">
													{repo.private ? (
														<RepoBadge type="private" />
													) : (
														<RepoBadge type="public" />
													)}
													{repo.archived && (
														<RepoBadge type="archived" />
													)}
													{repo.fork && (
														<RepoBadge type="fork" />
													)}
												</div>
											</div>

											{repo.description && (
												<p className="text-[11px] text-muted-foreground/60 mt-1 truncate max-w-lg">
													{
														repo.description
													}
												</p>
											)}
											<div className="flex md:hidden items-center flex-wrap gap-x-3 gap-y-1 mt-1.5">
												{repo.language && (
													<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-mono">
														<span
															className="w-2 h-2 rounded-full"
															style={{
																backgroundColor:
																	getLanguageColor(
																		repo.language,
																	),
															}}
														/>
														{
															repo.language
														}
													</span>
												)}
												{repo.stargazers_count >
													0 && (
													<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
														<Star className="w-3 h-3" />
														{formatNumber(
															repo.stargazers_count,
														)}
													</span>
												)}
												{repo.forks_count >
													0 && (
													<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
														<GitFork className="w-3 h-3" />
														{formatNumber(
															repo.forks_count,
														)}
													</span>
												)}
												{repo.updated_at && (
													<span className="text-[11px] text-muted-foreground font-mono">
														<TimeAgo
															date={
																repo.updated_at
															}
														/>
													</span>
												)}
											</div>
										</div>

										<div className="hidden md:flex items-center flex-nowrap gap-4 shrink-0">
											{repo.language && (
												<span className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 font-mono">
													<span
														className="w-2 h-2 rounded-full"
														style={{
															backgroundColor:
																getLanguageColor(
																	repo.language,
																),
														}}
													/>
													{
														repo.language
													}
												</span>
											)}
											{repo.stargazers_count >
												0 && (
												<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
													<Star className="w-3 h-3" />
													{formatNumber(
														repo.stargazers_count,
													)}
												</span>
											)}
											{repo.forks_count >
												0 && (
												<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
													<GitFork className="w-3 h-3" />
													{formatNumber(
														repo.forks_count,
													)}
												</span>
											)}
											{repo.updated_at && (
												<span className="text-[11px] text-muted-foreground font-mono md:w-14 md:text-right md:ml-auto">
													<TimeAgo
														date={
															repo.updated_at
														}
													/>
												</span>
											)}
											<ChevronRight className="hidden md:block w-3 h-3 text-foreground/10 opacity-0 group-hover:opacity-100 transition-opacity" />
										</div>
									</div>
								</Link>
							))}

							{filtered.length === 0 && (
								<div className="py-16 text-center">
									<FolderGit2 className="w-6 h-6 text-muted-foreground/20 mx-auto mb-3" />
									<p className="text-xs text-muted-foreground/50 font-mono">
										No repositories
										found
									</p>
								</div>
							)}
						</div>
					</>
				)}

				{tab === "activity" && (
					<div className="flex-1 min-h-[50dvh] lg:min-h-0 overflow-y-auto pb-4">
						<UserProfileActivityTimelineBoundary>
							<UserProfileActivityTimeline
								events={activityEvents}
								contributions={contributions}
								profileRepos={repos.map((repo) => ({
									full_name: repo.full_name,
									created_at:
										repo.created_at ??
										null,
									language: repo.language,
								}))}
							/>
						</UserProfileActivityTimelineBoundary>
					</div>
				)}
			</main>
		</div>
	);
}
