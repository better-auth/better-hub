"use client";

import { useMemo } from "react";
import { parseAsString, parseAsStringLiteral, useQueryState } from "nuqs";
import Image from "next/image";
import Link from "next/link";
import {
	ArrowUpDown,
	Bot,
	Building2,
	CalendarDays,
	ChevronRight,
	ExternalLink,
	FolderGit2,
	GitFork,
	Link2,
	Lock,
	MapPin,
	Search,
	Shield,
	Star,
	Users,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { getLanguageColor } from "@/lib/github-utils";
import type { UserFollow } from "@/lib/github";
import { TimeAgo } from "@/components/ui/time-ago";
import { CreateRepoDialog } from "@/components/repo/create-repo-dialog";

export interface OrgDetails {
	login: string;
	name: string | null;
	avatar_url: string;
	html_url: string;
	description: string | null;
	blog: string | null;
	location: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string | null;
}

export interface OrgRepo {
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

const orgFilterTypes = ["all", "public", "private", "forks", "archived"] as const;

const sortTypes = ["updated", "name", "stars"] as const;

const orgTabTypes = ["repositories", "followers", "following"] as const;
type OrgTabType = (typeof orgTabTypes)[number];

function formatJoinedDate(value: string | null): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;

	return new Intl.DateTimeFormat("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
		timeZone: "UTC",
	}).format(parsed);
}

export function OrgDetailContent({
	org,
	repos,
	followers = [],
	following = [],
}: {
	org: OrgDetails;
	repos: OrgRepo[];
	followers?: UserFollow[];
	following?: UserFollow[];
}) {
	const [tab, setTab] = useQueryState(
		"tab",
		parseAsStringLiteral(orgTabTypes).withDefault("repositories"),
	);
	const [search, setSearch] = useQueryState("q", parseAsString.withDefault(""));
	const [filter, setFilter] = useQueryState(
		"filter",
		parseAsStringLiteral(orgFilterTypes).withDefault("all"),
	);
	const [sort, setSort] = useQueryState(
		"sort",
		parseAsStringLiteral(sortTypes).withDefault("updated"),
	);

	const filtered = useMemo(
		() =>
			repos
				.filter((repo) => {
					if (
						search &&
						![
							repo.full_name,
							repo.description ?? "",
							repo.language ?? "",
						]
							.join(" ")
							.toLowerCase()
							.includes(search.toLowerCase())
					) {
						return false;
					}

					if (filter === "public" && repo.private) return false;
					if (filter === "private" && !repo.private) return false;
					if (filter === "forks" && !repo.fork) return false;
					if (filter === "archived" && !repo.archived) return false;

					return true;
				})
				.sort((a, b) => {
					if (sort === "name")
						return a.full_name.localeCompare(b.full_name);
					if (sort === "stars")
						return b.stargazers_count - a.stargazers_count;
					return (
						new Date(b.updated_at || 0).getTime() -
						new Date(a.updated_at || 0).getTime()
					);
				}),
		[repos, search, filter, sort],
	);

	const filteredFollowers = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return followers;
		return followers.filter((person) =>
			[
				person.login,
				person.name ?? "",
				person.bio ?? "",
				person.company ?? "",
				person.location ?? "",
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [followers, search]);

	const filteredFollowing = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return following;
		return following.filter((person) =>
			[
				person.login,
				person.name ?? "",
				person.bio ?? "",
				person.company ?? "",
				person.location ?? "",
			]
				.join(" ")
				.toLowerCase()
				.includes(query),
		);
	}, [following, search]);

	const activePeople = useMemo(() => {
		if (tab === "followers") return filteredFollowers;
		if (tab === "following") return filteredFollowing;
		return [];
	}, [filteredFollowers, filteredFollowing, tab]);

	const languages = useMemo(
		() => [...new Set(repos.map((repo) => repo.language).filter(Boolean))],
		[repos],
	);

	const joinedDate = formatJoinedDate(org.created_at);

	const searchPlaceholder =
		tab === "repositories"
			? "Find a repository..."
			: tab === "followers"
				? "Find a follower..."
				: "Find a user...";

	const handleTabChange = (nextTab: OrgTabType) => {
		setTab(nextTab);
		setSearch("");
	};

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Profile header */}
			<div className="shrink-0 pb-6 mb-6 border-b border-border">
				<div className="flex items-start gap-5">
					<Image
						src={org.avatar_url}
						alt={org.login}
						width={72}
						height={72}
						className="rounded-lg border border-border shrink-0"
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-3">
							<h1 className="text-2xl font-medium tracking-tight truncate">
								{org.name || org.login}
							</h1>
							<a
								href={org.html_url}
								target="_blank"
								rel="noreferrer"
								className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0"
							>
								<ExternalLink className="w-3.5 h-3.5" />
							</a>
						</div>
						<p className="text-xs text-muted-foreground/60 font-mono mt-0.5">
							@{org.login}
						</p>

						{org.description && (
							<p className="text-sm text-muted-foreground mt-2 max-w-2xl">
								{org.description}
							</p>
						)}

						<div className="flex items-center gap-4 mt-3 flex-wrap">
							<button
								type="button"
								onClick={() =>
									handleTabChange(
										"repositories",
									)
								}
								className={cn(
									"inline-flex items-center gap-1.5 text-xs font-mono transition-colors cursor-pointer",
									tab === "repositories"
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<FolderGit2 className="w-3 h-3" />
								{formatNumber(
									org.public_repos,
								)}{" "}
								repos
							</button>
							<button
								type="button"
								onClick={() =>
									handleTabChange("followers")
								}
								aria-label={`View ${org.login} followers list`}
								className={cn(
									"inline-flex items-center gap-1.5 text-xs font-mono transition-colors cursor-pointer",
									tab === "followers"
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Users className="w-3 h-3" />
								{formatNumber(org.followers)}{" "}
								followers
							</button>
							<button
								type="button"
								onClick={() =>
									handleTabChange("following")
								}
								aria-label={`View ${org.login} following list`}
								className={cn(
									"inline-flex items-center gap-1.5 text-xs font-mono transition-colors cursor-pointer",
									tab === "following"
										? "text-foreground"
										: "text-muted-foreground hover:text-foreground",
								)}
							>
								<Users className="w-3 h-3" />
								{formatNumber(org.following)}{" "}
								following
							</button>
							{org.location && (
								<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
									<MapPin className="w-3 h-3" />
									{org.location}
								</span>
							)}
							{org.blog && (
								<a
									href={
										org.blog.startsWith(
											"http",
										)
											? org.blog
											: `https://${org.blog}`
									}
									target="_blank"
									rel="noreferrer"
									className="inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors"
								>
									<Link2 className="w-3 h-3" />
									{org.blog.replace(
										/^https?:\/\//,
										"",
									)}
								</a>
							)}
							{joinedDate && (
								<span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 font-mono">
									<CalendarDays className="w-3 h-3" />
									{joinedDate}
								</span>
							)}
						</div>
					</div>
				</div>
			</div>

			<div className="shrink-0 mb-4">
				<div className="grid grid-cols-1 sm:grid-cols-3 border border-border divide-y sm:divide-y-0 sm:divide-x divide-border rounded-md">
					<button
						type="button"
						onClick={() => handleTabChange("repositories")}
						className={cn(
							"flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							tab === "repositories"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
						)}
					>
						<FolderGit2 className="w-3.5 h-3.5" />
						Repositories
						<span className="tabular-nums">{repos.length}</span>
					</button>
					<button
						type="button"
						onClick={() => handleTabChange("followers")}
						className={cn(
							"flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							tab === "followers"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
						)}
					>
						<Users className="w-3.5 h-3.5" />
						Followers
						<span className="tabular-nums">
							{followers.length}
						</span>
					</button>
					<button
						type="button"
						onClick={() => handleTabChange("following")}
						className={cn(
							"flex items-center justify-center gap-2 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
							tab === "following"
								? "bg-foreground text-background"
								: "text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
						)}
					>
						<Users className="w-3.5 h-3.5" />
						Following
						<span className="tabular-nums">
							{following.length}
						</span>
					</button>
				</div>
			</div>

			{/* Search & filters */}
			<div className="shrink-0 flex items-center gap-2 mb-3 flex-wrap">
				<div className="relative flex-1 min-w-[200px] max-w-sm">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
					<input
						type="text"
						placeholder={searchPlaceholder}
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full bg-transparent border border-border pl-8 pr-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
					/>
				</div>

				{tab === "repositories" && (
					<div className="flex items-center gap-1">
						{(
							[
								["all", "All"],
								["public", "Public"],
								["private", "Private"],
								["forks", "Forks"],
								["archived", "Archived"],
							] as const
						).map(([value, label]) => (
							<button
								key={value}
								onClick={() => setFilter(value)}
								className={cn(
									"px-2.5 py-1.5 text-[11px] font-mono transition-colors cursor-pointer rounded-md",
									filter === value
										? "bg-foreground text-background"
										: "text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4",
								)}
							>
								{label}
							</button>
						))}
					</div>
				)}

				{tab === "repositories" && (
					<button
						onClick={() =>
							setSort((current) =>
								current === "updated"
									? "stars"
									: current === "stars"
										? "name"
										: "updated",
							)
						}
						className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono text-muted-foreground/70 border border-border hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4 transition-colors cursor-pointer rounded-md"
					>
						<ArrowUpDown className="w-3 h-3" />
						{sort === "updated"
							? "Updated"
							: sort === "stars"
								? "Stars"
								: "Name"}
					</button>
				)}

				<div className="flex items-center gap-2 ml-auto">
					{tab === "repositories" && (
						<CreateRepoDialog org={org.login} />
					)}
					<span className="text-[11px] text-muted-foreground/50 font-mono tabular-nums">
						{tab === "repositories"
							? `${filtered.length}${filtered.length !== repos.length ? ` / ${repos.length}` : ""}`
							: tab === "followers"
								? `${filteredFollowers.length}${filteredFollowers.length !== followers.length ? ` / ${followers.length}` : ""}`
								: `${filteredFollowing.length}${filteredFollowing.length !== following.length ? ` / ${following.length}` : ""}`}
					</span>
				</div>
			</div>

			{tab === "repositories" && languages.length > 0 && (
				<div className="shrink-0 flex items-center gap-1.5 flex-wrap mb-3">
					{languages.slice(0, 14).map((lang) => (
						<button
							key={lang}
							onClick={() => setSearch(lang || "")}
							className="flex items-center gap-1.5 px-2 py-1 text-[11px] text-muted-foreground/70 hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/4 transition-colors cursor-pointer font-mono rounded-md"
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
				</div>
			)}

			{/* Content list */}
			<div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border/50">
				{tab === "repositories" &&
					filtered.map((repo) => {
						const langColor = repo.language
							? getLanguageColor(repo.language)
							: null;
						return (
							<Link
								key={repo.id}
								href={`/${repo.full_name}`}
								className="group flex gap-3.5 px-4 py-3.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
							>
								<div className="shrink-0 pt-1.5">
									{langColor ? (
										<span
											className="block w-2 h-2 rounded-full"
											style={{
												backgroundColor:
													langColor,
											}}
										/>
									) : (
										<FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
									)}
								</div>
								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<span className="text-[13px] font-mono font-medium text-foreground group-hover:text-foreground transition-colors">
											{repo.name}
										</span>
										{repo.private && (
											<span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-px border border-border/60 text-muted-foreground rounded-full">
												<Lock className="w-2 h-2" />
												Private
											</span>
										)}
										{repo.archived && (
											<span className="text-[9px] font-mono px-1.5 py-px border border-warning/30 text-warning rounded-full">
												Archived
											</span>
										)}
										{repo.fork && (
											<span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-px border border-border/60 text-muted-foreground rounded-full">
												<GitFork className="w-2 h-2" />
												Fork
											</span>
										)}
									</div>
									{repo.description && (
										<p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1 max-w-2xl leading-relaxed">
											{
												repo.description
											}
										</p>
									)}
									<div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground/60">
										{repo.language && (
											<span className="font-mono">
												{
													repo.language
												}
											</span>
										)}
										{repo.stargazers_count >
											0 && (
											<span className="flex items-center gap-1">
												<Star className="w-3 h-3" />
												{formatNumber(
													repo.stargazers_count,
												)}
											</span>
										)}
										{repo.forks_count >
											0 && (
											<span className="flex items-center gap-1">
												<GitFork className="w-3 h-3" />
												{formatNumber(
													repo.forks_count,
												)}
											</span>
										)}
										{repo.updated_at && (
											<span className="ml-auto font-mono text-muted-foreground/50">
												<TimeAgo
													date={
														repo.updated_at
													}
												/>
											</span>
										)}
									</div>
								</div>
							</Link>
						);
					})}

				{tab !== "repositories" &&
					activePeople.map((person) => (
						<Link
							key={person.login}
							href={`/${person.login}`}
							className="group flex items-start gap-3 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
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
											GitHub staff
										</span>
									)}
									{person.type === "Bot" && (
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

				{tab === "repositories" && filtered.length === 0 && (
					<div className="py-16 text-center">
						<FolderGit2 className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
						<p className="text-xs text-muted-foreground/60 font-mono">
							No repositories found
						</p>
					</div>
				)}
				{tab !== "repositories" && activePeople.length === 0 && (
					<div className="py-16 text-center">
						<Users className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
						<p className="text-xs text-muted-foreground/60 font-mono">
							{tab === "followers"
								? "No followers found"
								: "No following users found"}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
