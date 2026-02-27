"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
	ArrowUpDown,
	Bot,
	Building2,
	CalendarDays,
	ChevronRight,
	ExternalLink,
	FolderGit2,
	GitFork,
	Globe,
	Link2,
	Lock,
	MapPin,
	Search,
	Shield,
	Star,
	Twitter,
	Users,
} from "lucide-react";
import { cn, formatNumber, type ProfileTab } from "@/lib/utils";
import { getLanguageColor } from "@/lib/github-utils";
import type { UserFollow } from "@/lib/github";
import { TimeAgo } from "@/components/ui/time-ago";
import { ContributionChart } from "@/components/dashboard/contribution-chart";
import { computeUserProfileScore } from "@/lib/user-profile-score";
import { UserProfileScoreRing } from "@/components/users/user-profile-score-ring";

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
}

const filterTypes = ["all", "sources", "forks", "archived"] as const;
type FilterType = (typeof filterTypes)[number];

const sortTypes = ["updated", "name", "stars"] as const;
type SortType = (typeof sortTypes)[number];

function formatJoinedDate(value: string | null): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return parsed.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
	});
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
	followers = [],
	following = [],
	initialTab = "repos",
	orgTopRepos = [],
}: {
	user: UserProfile;
	repos: UserRepo[];
	orgs: UserOrg[];
	contributions: ContributionData | null;
	followers?: UserFollow[];
	following?: UserFollow[];
	initialTab?: ProfileTab;
	orgTopRepos?: OrgTopRepo[];
}) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParamsObj = useSearchParams();

	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterType>("all");
	const [sort, setSort] = useState<SortType>("updated");
	const [activeTab, setActiveTab] = useState<ProfileTab>(initialTab);
	const deferredSearch = useDeferredValue(search);

	useEffect(() => {
		setActiveTab(initialTab);
		setSearch("");
	}, [initialTab]);

	const switchTab = useCallback(
		(tab: ProfileTab) => {
			setActiveTab(tab);
			setSearch("");
			const params = new URLSearchParams(searchParamsObj.toString());
			if (tab === "repos") {
				params.delete("tab");
			} else {
				params.set("tab", tab);
			}
			const qs = params.toString();
			router.replace(`${pathname}${qs ? `?${qs}` : ""}`, { scroll: false });
		},
		[router, pathname, searchParamsObj],
	);
	const [languageFilter, setLanguageFilter] = useState<string | null>(null);
	const [showMoreLanguages, setShowMoreLanguages] = useState(false);
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
						deferredSearch &&
						![
							repo.name,
							repo.description ?? "",
							repo.language ?? "",
						]
							.join(" ")
							.toLowerCase()
							.includes(deferredSearch.toLowerCase())
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
		setLanguageFilter(null);
		setShowMoreLanguages(false);
	}, []);

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

	const filteredFollowers = useMemo(() => {
		const q = deferredSearch.trim().toLowerCase();
		if (!q) return followers;
		return followers.filter((p) => p.login.toLowerCase().includes(q));
	}, [followers, deferredSearch]);

	const filteredFollowing = useMemo(() => {
		const q = deferredSearch.trim().toLowerCase();
		if (!q) return following;
		return following.filter((p) => p.login.toLowerCase().includes(q));
	}, [following, deferredSearch]);

	const activePeople = useMemo(() => {
		if (activeTab === "followers") return filteredFollowers;
		if (activeTab === "following") return filteredFollowing;
		return [];
	}, [activeTab, filteredFollowers, filteredFollowing]);

	const searchPlaceholder =
		activeTab === "repos"
			? "Find a repository..."
			: activeTab === "followers"
				? "Find a follower..."
				: "Find a user...";

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
		<div className="flex flex-col lg:flex-row gap-8 flex-1 min-h-0">
			{/* ── Left sidebar ── */}
			<aside className="shrink-0 lg:w-[280px] lg:sticky lg:top-4 lg:self-start">
				{/* Avatar + identity */}
				<div className="flex flex-col items-center lg:items-start">
					<div className="relative group">
						<div className="absolute -inset-1 rounded-full bg-gradient-to-br from-[var(--contrib-2)]/20 via-transparent to-[var(--contrib-4)]/10 opacity-0 group-hover:opacity-100 transition-opacity duration-500 blur-sm" />
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
						<button
							type="button"
							onClick={() => switchTab("followers")}
							className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"
							title="View followers"
							aria-label={`View ${user.followers} followers`}
						>
							<span className="text-foreground font-medium">
								{formatNumber(user.followers)}
							</span>{" "}
							followers
						</button>
					</span>
					<span className="text-muted-foreground/30">&middot;</span>
					<button
						type="button"
						onClick={() => switchTab("following")}
						className="hover:text-foreground transition-colors cursor-pointer"
						title="View following"
						aria-label={`View ${user.following} following`}
					>
						<span className="text-foreground font-medium">
							{formatNumber(user.following)}
						</span>{" "}
						following
					</button>
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
							<Twitter className="w-3 h-3 shrink-0 text-muted-foreground/50" />
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
									className="group flex items-center gap-2.5 py-1 px-1.5 -mx-1.5 rounded-md hover:bg-muted/50 dark:hover:bg-white/[0.03] transition-colors"
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
				{activeTab === "repos" && languageDistribution.length > 0 && (
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
			<main className="flex-1 min-w-0 flex flex-col min-h-0">
				<div className="shrink-0 mb-3">
					<div className="flex items-center border border-border divide-x divide-border rounded-md w-fit">
						{(
							[
								["repos", "Repositories"],
								["followers", "Followers"],
								["following", "Following"],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								onClick={() => switchTab(value)}
								className={cn(
									"px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
									activeTab === value
										? "bg-muted/50 dark:bg-white/4 text-foreground"
										: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
								)}
							>
								{label}
							</button>
						))}
					</div>
				</div>

				{/* Search & filters */}
				<div className="shrink-0">
					<div className="flex items-center gap-2 mb-3">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
							<input
								type="text"
								placeholder={searchPlaceholder}
								value={search}
								onChange={(e) => {
									const next = e.target.value;
									setSearch(next);
									if (next.trim())
										setLanguageFilter(
											null,
										);
								}}
								className="w-full bg-transparent border border-border pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md font-mono"
							/>
						</div>

						{activeTab === "repos" && (
							<>
								<div className="flex items-center border border-border divide-x divide-border rounded-md shrink-0">
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
									).map(([value, label]) => (
										<button
											key={value}
											onClick={() =>
												setFilter(
													value,
												)
											}
											className={cn(
												"px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
												filter ===
													value
													? "bg-muted/50 dark:bg-white/4 text-foreground"
													: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
											)}
										>
											{label}
										</button>
									))}
								</div>

								<button
									onClick={() =>
										setSort((current) =>
											current ===
											"updated"
												? "stars"
												: current ===
													  "stars"
													? "name"
													: "updated",
										)
									}
									className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground border border-border hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer rounded-md shrink-0"
								>
									<ArrowUpDown className="w-3 h-3" />
									{sort === "updated"
										? "Updated"
										: sort === "stars"
											? "Stars"
											: "Name"}
								</button>
							</>
						)}
					</div>

					<div className="flex items-center justify-between mb-4">
						{activeTab === "repos" && languages.length > 0 && (
							<div className="flex items-center gap-1.5 flex-wrap flex-1">
								{topLanguages.map((lang) => (
									<button
										key={lang}
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
										{lang}
									</button>
								))}
								{extraLanguages.length > 0 && (
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
						{(search || languageFilter) && (
							<button
								onClick={clearRepoFilters}
								aria-label="Clear repository filters"
								className="ml-2 text-[11px] text-muted-foreground hover:text-foreground font-mono transition-colors"
							>
								Clear
							</button>
						)}
						<span className="text-[11px] text-muted-foreground/30 font-mono shrink-0 ml-auto">
							{activeTab === "repos"
								? `${filtered.length}/${repos.length}`
								: activeTab === "followers"
									? `${filteredFollowers.length}/${followers.length}`
									: `${filteredFollowing.length}/${following.length}`}
						</span>
					</div>
				</div>

				{/* Contribution chart */}
				{activeTab === "repos" && contributions && (
					<div className="shrink-0 mb-4 border border-border rounded-md p-4 bg-card/50">
						<ContributionChart data={contributions} />
					</div>
				)}

				{/* Repo list */}
				<div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border">
					{activeTab === "repos" &&
						filtered.map((repo) => (
							<Link
								key={repo.id}
								href={`/${repo.full_name}`}
								className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
							>
								<FolderGit2 className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2">
										<span className="text-sm text-foreground group-hover:text-foreground transition-colors font-mono">
											{repo.name}
										</span>
										{repo.private ? (
											<span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/60 rounded-sm">
												<Lock className="w-2.5 h-2.5" />
												Private
											</span>
										) : (
											<span className="flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/60 rounded-sm">
												<Globe className="w-2.5 h-2.5" />
												Public
											</span>
										)}
										{repo.archived && (
											<span className="text-[9px] font-mono px-1.5 py-0.5 border border-warning/30 text-warning rounded-sm">
												Archived
											</span>
										)}
										{repo.fork && (
											<span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/60 rounded-sm">
												Fork
											</span>
										)}
									</div>

									{repo.description && (
										<p className="text-[11px] text-muted-foreground/60 mt-1 truncate max-w-lg">
											{
												repo.description
											}
										</p>
									)}
								</div>

								<div className="flex items-center gap-4 shrink-0">
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
									{repo.forks_count > 0 && (
										<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
											<GitFork className="w-3 h-3" />
											{formatNumber(
												repo.forks_count,
											)}
										</span>
									)}
									{repo.updated_at && (
										<span className="text-[11px] text-muted-foreground font-mono w-14 text-right">
											<TimeAgo
												date={
													repo.updated_at
												}
											/>
										</span>
									)}
									<ChevronRight className="w-3 h-3 text-foreground/10 opacity-0 group-hover:opacity-100 transition-opacity" />
								</div>
							</Link>
						))}

					{activeTab !== "repos" &&
						activePeople.map((person) => (
							<Link
								key={person.login}
								href={`/users/${person.login}`}
								className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
							>
								<Image
									src={person.avatar_url}
									alt={person.login}
									width={28}
									height={28}
									className="rounded-full shrink-0 ring-1 ring-border/60"
								/>
								<div className="min-w-0 flex-1">
									<div className="flex items-center gap-2 min-w-0">
										<div className="text-sm font-medium truncate">
											{person.name ??
												person.login}
										</div>
										{person.name && (
											<div className="text-[11px] font-mono text-muted-foreground/60 truncate">
												{
													person.login
												}
											</div>
										)}
									</div>
									<div className="mt-0.5 min-h-4 text-[11px] text-muted-foreground/60 truncate">
										{person.bio ?? ""}
									</div>
									<div className="mt-1 min-h-4 flex items-center gap-3 text-[10px] font-mono text-muted-foreground/50">
										{person.company && (
											<span className="inline-flex items-center gap-1 truncate max-w-[200px]">
												<Building2 className="w-3 h-3 shrink-0" />
												<span className="truncate">
													{
														person.company
													}
												</span>
											</span>
										)}
										{person.location && (
											<span className="inline-flex items-center gap-1 truncate max-w-[180px]">
												<MapPin className="w-3 h-3 shrink-0" />
												<span className="truncate">
													{
														person.location
													}
												</span>
											</span>
										)}
										{person.site_admin && (
											<span className="inline-flex items-center gap-1">
												<Shield className="w-3 h-3 shrink-0" />
												GitHub
												staff
											</span>
										)}
										{person.type ===
											"Bot" && (
											<span className="inline-flex items-center gap-1">
												<Bot className="w-3 h-3 shrink-0" />
												Bot
											</span>
										)}
									</div>
								</div>
								<ChevronRight className="w-3 h-3 text-foreground/10 opacity-0 group-hover:opacity-100 transition-opacity" />
							</Link>
						))}

					{activeTab === "repos" && filtered.length === 0 && (
						<div className="py-16 text-center">
							<FolderGit2 className="w-6 h-6 text-muted-foreground/20 mx-auto mb-3" />
							<p className="text-xs text-muted-foreground/50 font-mono">
								No repositories found
							</p>
						</div>
					)}
					{activeTab !== "repos" && activePeople.length === 0 && (
						<div className="py-16 text-center">
							<Users className="w-6 h-6 text-muted-foreground/20 mx-auto mb-3" />
							<p className="text-xs text-muted-foreground/50 font-mono">
								{activeTab === "followers"
									? "No followers found"
									: "No following users found"}
							</p>
						</div>
					)}
				</div>
			</main>
		</div>
	);
}
