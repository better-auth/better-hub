"use client";

import { useState, useRef, useMemo, useCallback } from "react";
import { useClickOutside } from "@/hooks/use-click-outside";
import Link from "next/link";
import Image from "next/image";
import {
	FolderGit2,
	Star,
	GitFork,
	Search,
	Lock,
	SlidersHorizontal,
	Check,
	X,
	List,
	LayoutGrid,
	Group,
	CircleDot,
	Archive,
	ChevronDown,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { getLanguageColor } from "@/lib/github-utils";
import { TimeAgo } from "@/components/ui/time-ago";

interface Repo {
	id: number;
	name: string;
	full_name: string;
	description: string | null;
	html_url: string;
	stargazers_count: number;
	forks_count: number;
	language: string | null;
	updated_at: string | null;
	pushed_at: string | null;
	private: boolean;
	fork: boolean;
	archived: boolean;
	open_issues_count: number;
	owner?: {
		login: string;
		avatar_url: string;
		type?: string;
	};
}

type FilterType = "all" | "public" | "private" | "forks" | "archived";
type SortType = "updated" | "name" | "stars";
type ViewMode = "list" | "grid" | "grouped";

function RepoRow({ repo, showOwner = true }: { repo: Repo; showOwner?: boolean }) {
	const langColor = repo.language ? getLanguageColor(repo.language) : null;

	return (
		<Link
			href={`/${repo.full_name}`}
			className="group flex gap-3.5 px-4 py-3.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
		>
			{/* Language accent */}
			<div className="shrink-0 pt-1.5">
				{langColor ? (
					<span
						className="block w-2 h-2 rounded-full"
						style={{ backgroundColor: langColor }}
					/>
				) : (
					<FolderGit2 className="w-3.5 h-3.5 text-muted-foreground" />
				)}
			</div>

			{/* Content */}
			<div className="flex-1 min-w-0">
				{/* Name row */}
				<div className="flex items-center gap-2 flex-wrap">
					<span className="text-[13px] font-mono font-medium text-foreground group-hover:text-foreground transition-colors">
						{showOwner ? (
							<>
								<span className="text-muted-foreground/50 font-normal">
									{repo.owner?.login ||
										repo.full_name.split(
											"/",
										)[0]}
								</span>
								<span className="text-muted-foreground/30 mx-0.5">
									/
								</span>
								{repo.name}
							</>
						) : (
							repo.name
						)}
					</span>
					{repo.private && (
						<span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-px border border-border/60 text-muted-foreground rounded-full">
							<Lock className="w-2 h-2" />
							Private
						</span>
					)}
					{repo.archived && (
						<span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-px border border-warning/30 text-warning rounded-full">
							<Archive className="w-2 h-2" />
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

				{/* Description */}
				{repo.description && (
					<p className="text-xs text-muted-foreground/70 mt-1 line-clamp-1 max-w-2xl leading-relaxed">
						{repo.description}
					</p>
				)}

				{/* Meta row */}
				<div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground/60">
					{repo.language && (
						<span className="font-mono">{repo.language}</span>
					)}
					{repo.stargazers_count > 0 && (
						<span className="flex items-center gap-1">
							<Star className="w-3 h-3" />
							{formatNumber(repo.stargazers_count)}
						</span>
					)}
					{repo.forks_count > 0 && (
						<span className="flex items-center gap-1">
							<GitFork className="w-3 h-3" />
							{formatNumber(repo.forks_count)}
						</span>
					)}
					{repo.open_issues_count > 0 && (
						<span className="flex items-center gap-1">
							<CircleDot className="w-3 h-3" />
							{formatNumber(repo.open_issues_count)}
						</span>
					)}
					{repo.updated_at && (
						<span className="ml-auto font-mono text-muted-foreground/50">
							<TimeAgo date={repo.updated_at} />
						</span>
					)}
				</div>
			</div>
		</Link>
	);
}

function RepoCard({ repo }: { repo: Repo }) {
	const langColor = repo.language ? getLanguageColor(repo.language) : null;

	return (
		<Link
			href={`/${repo.full_name}`}
			className="group flex flex-col border border-border rounded-md p-4 hover:bg-muted/50 dark:hover:bg-white/[0.02] hover:border-border transition-colors"
		>
			{/* Name */}
			<div className="flex items-center gap-2 min-w-0">
				<span className="text-[13px] font-mono font-medium truncate">
					<span className="text-muted-foreground/50 font-normal">
						{repo.owner?.login || repo.full_name.split("/")[0]}
					</span>
					<span className="text-muted-foreground/30 mx-0.5">/</span>
					{repo.name}
				</span>
				{repo.private && (
					<Lock className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" />
				)}
			</div>

			{/* Description */}
			<p className="text-xs text-muted-foreground/60 mt-1.5 line-clamp-2 leading-relaxed flex-1">
				{repo.description || "No description"}
			</p>

			{/* Footer */}
			<div className="flex items-center gap-3 mt-3 pt-3 border-t border-border/60 text-[11px] text-muted-foreground/60">
				{langColor && (
					<span className="flex items-center gap-1.5 font-mono">
						<span
							className="w-2 h-2 rounded-full"
							style={{ backgroundColor: langColor }}
						/>
						{repo.language}
					</span>
				)}
				{repo.stargazers_count > 0 && (
					<span className="flex items-center gap-1">
						<Star className="w-3 h-3" />
						{formatNumber(repo.stargazers_count)}
					</span>
				)}
				{repo.forks_count > 0 && (
					<span className="flex items-center gap-1">
						<GitFork className="w-3 h-3" />
						{formatNumber(repo.forks_count)}
					</span>
				)}
				{repo.updated_at && (
					<span className="ml-auto font-mono text-muted-foreground/50">
						<TimeAgo date={repo.updated_at} />
					</span>
				)}
			</div>
		</Link>
	);
}

export function ReposContent({ repos }: { repos: Repo[] }) {
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterType>("all");
	const [sort, setSort] = useState<SortType>("updated");
	const [lang, setLang] = useState("");
	const [showFilters, setShowFilters] = useState(false);
	const [sortOpen, setSortOpen] = useState(false);
	const [view, setView] = useState<ViewMode>(() => {
		if (typeof window === "undefined") return "list";
		const saved = localStorage.getItem("repo-view-mode");
		return saved === "grid" || saved === "grouped" ? saved : "list";
	});
	const setViewAndSave = (v: ViewMode) => {
		setView(v);
		localStorage.setItem("repo-view-mode", v);
	};
	const sortRef = useRef<HTMLDivElement>(null);

	useClickOutside(
		sortRef,
		useCallback(() => setSortOpen(false), []),
	);

	const filtered = repos
		.filter((repo) => {
			if (search && !repo.full_name.toLowerCase().includes(search.toLowerCase()))
				return false;
			if (filter === "public" && repo.private) return false;
			if (filter === "private" && !repo.private) return false;
			if (filter === "forks" && !repo.fork) return false;
			if (filter === "archived" && !repo.archived) return false;
			if (lang && repo.language !== lang) return false;
			return true;
		})
		.sort((a, b) => {
			if (sort === "name") return a.name.localeCompare(b.name);
			if (sort === "stars") return b.stargazers_count - a.stargazers_count;
			return (
				new Date(b.updated_at || 0).getTime() -
				new Date(a.updated_at || 0).getTime()
			);
		});

	const languages = [
		...new Set(repos.map((r) => r.language).filter((l): l is string => Boolean(l))),
	];

	const activeFilterCount = (filter !== "all" ? 1 : 0) + (lang !== "" ? 1 : 0);

	const groupedByOrg = useMemo(() => {
		const groups = new Map<
			string,
			{ avatar: string; ownerType: string; repos: Repo[] }
		>();
		for (const repo of filtered) {
			const owner =
				repo.owner?.login ?? repo.full_name.split("/")[0] ?? "unknown";
			const avatar = repo.owner?.avatar_url ?? "";
			const ownerType = repo.owner?.type ?? "User";
			if (!groups.has(owner)) {
				groups.set(owner, { avatar, ownerType, repos: [] });
			}
			groups.get(owner)!.repos.push(repo);
		}
		return [...groups.entries()].sort((a, b) => b[1].repos.length - a[1].repos.length);
	}, [filtered]);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			{/* Header + count */}
			<div className="shrink-0 flex items-baseline gap-3 mb-4">
				<h1 className="text-xl font-medium tracking-tight">Repositories</h1>
				<span className="text-xs text-muted-foreground/50 font-mono tabular-nums">
					{filtered.length}
					{filtered.length !== repos.length && ` / ${repos.length}`}
				</span>
			</div>

			{/* Toolbar */}
			<div className="shrink-0 flex items-center gap-2 mb-3">
				{/* Search */}
				<div className="relative flex-1 min-w-[180px] max-w-sm">
					<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/50" />
					<input
						type="text"
						placeholder="Find a repository..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full bg-transparent border border-border pl-8 pr-3 py-1.5 text-xs font-mono placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
					/>
				</div>

				{/* Filter button */}
				<button
					onClick={() => setShowFilters((v) => !v)}
					className={cn(
						"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono border transition-colors cursor-pointer rounded-md",
						showFilters || activeFilterCount > 0
							? "border-foreground/20 bg-muted/50 dark:bg-white/4 text-foreground"
							: "border-border text-muted-foreground/70 hover:bg-muted/50 dark:hover:bg-white/4",
					)}
				>
					<SlidersHorizontal className="w-3 h-3" />
					Filter
					{activeFilterCount > 0 && (
						<span className="text-[9px] px-1.5 py-0.5 border border-foreground/20 bg-foreground/5 text-foreground">
							{activeFilterCount}
						</span>
					)}
				</button>

				{/* Sort dropdown */}
				<div ref={sortRef} className="relative">
					<button
						onClick={() => setSortOpen((o) => !o)}
						className={cn(
							"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-mono border border-border hover:bg-muted/50 dark:hover:bg-white/4 transition-colors cursor-pointer rounded-md",
							sort !== "updated"
								? "text-foreground border-foreground/20"
								: "text-muted-foreground/70",
						)}
					>
						<ChevronDown
							className={cn(
								"w-3 h-3 transition-transform",
								sortOpen && "rotate-180",
							)}
						/>
						{sort === "updated"
							? "Last updated"
							: sort === "stars"
								? "Most stars"
								: "Name (A-Z)"}
					</button>

					{sortOpen && (
						<div className="absolute top-full right-0 mt-1.5 w-48 bg-background border border-border rounded-md shadow-lg dark:shadow-2xl z-50 py-1">
							{(
								[
									["updated", "Last updated"],
									["stars", "Most stars"],
									["name", "Name (A-Z)"],
								] as const
							).map(([value, label]) => (
								<button
									key={value}
									onClick={() => {
										setSort(value);
										setSortOpen(false);
									}}
									className={cn(
										"flex items-center gap-2 w-full px-3 py-1.5 text-[11px] font-mono text-left transition-colors cursor-pointer",
										sort === value
											? "text-foreground"
											: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/40 dark:hover:bg-white/[0.03]",
									)}
								>
									<span
										className={cn(
											"w-3 h-3 flex items-center justify-center",
											sort ===
												value
												? "opacity-100"
												: "opacity-0",
										)}
									>
										<Check className="w-3 h-3" />
									</span>
									{label}
								</button>
							))}
						</div>
					)}
				</div>

				{activeFilterCount > 0 && (
					<button
						onClick={() => {
							setFilter("all");
							setLang("");
						}}
						className="flex items-center gap-1 px-2 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground/60 transition-colors cursor-pointer"
					>
						<X className="w-3 h-3" />
						Clear
					</button>
				)}

				{/* View toggle */}
				<div className="flex items-center gap-0.5 ml-auto bg-muted/30 dark:bg-white/[0.02] rounded-md p-0.5">
					{[
						{ key: "list" as const, icon: List, label: "List" },
						{
							key: "grid" as const,
							icon: LayoutGrid,
							label: "Grid",
						},
						{
							key: "grouped" as const,
							icon: Group,
							label: "Grouped",
						},
					].map(({ key, icon: Icon, label }) => (
						<button
							key={key}
							onClick={() => setViewAndSave(key)}
							className={cn(
								"flex items-center gap-1.5 px-2 py-1 text-[11px] font-mono transition-colors cursor-pointer rounded",
								view === key
									? "bg-background dark:bg-muted text-foreground shadow-sm"
									: "text-muted-foreground/60 hover:text-foreground",
							)}
							title={label}
						>
							<Icon className="w-3 h-3" />
							<span className="hidden sm:inline">
								{label}
							</span>
						</button>
					))}
				</div>
			</div>

			{/* Filter panel */}
			{showFilters && (
				<div className="shrink-0 border border-border rounded-md p-3 mb-3 space-y-3">
					{/* Visibility */}
					<div className="flex items-center gap-2">
						<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
							Type
						</span>
						<div className="flex items-center border border-border divide-x divide-border rounded-sm">
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
									onClick={() =>
										setFilter(value)
									}
									className={cn(
										"px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors cursor-pointer",
										filter === value
											? "bg-muted/50 dark:bg-white/4 text-foreground"
											: "text-muted-foreground hover:text-foreground/60 hover:bg-muted/60 dark:hover:bg-white/3",
									)}
								>
									{label}
								</button>
							))}
						</div>
					</div>

					{/* Language */}
					{languages.length > 0 && (
						<div className="flex items-center gap-2">
							<span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/50 w-16 shrink-0">
								Lang
							</span>
							<div className="flex items-center gap-1.5 flex-wrap">
								{languages.map((l) => (
									<button
										key={l}
										onClick={() =>
											setLang(
												lang ===
													l
													? ""
													: l,
											)
										}
										className={cn(
											"flex items-center gap-1.5 px-2 py-1 text-[10px] border transition-colors cursor-pointer font-mono",
											lang === l
												? "border-foreground/30 bg-muted/50 dark:bg-white/4 text-foreground"
												: "border-border text-muted-foreground hover:bg-muted/60 dark:hover:bg-white/3",
										)}
									>
										<span
											className="w-2 h-2 rounded-full shrink-0"
											style={{
												backgroundColor:
													getLanguageColor(
														l,
													),
											}}
										/>
										{l}
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			)}

			{/* Content */}
			{filtered.length === 0 ? (
				<div className="flex-1 min-h-0 flex items-center justify-center border border-border rounded-md">
					<div className="text-center">
						<FolderGit2 className="w-5 h-5 text-muted-foreground/30 mx-auto mb-2" />
						<p className="text-xs text-muted-foreground/60 font-mono">
							No repositories found
						</p>
					</div>
				</div>
			) : view === "grid" ? (
				<div className="flex-1 min-h-0 overflow-y-auto">
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{filtered.map((repo) => (
							<RepoCard key={repo.id} repo={repo} />
						))}
					</div>
				</div>
			) : view === "grouped" ? (
				<div className="flex-1 min-h-0 overflow-y-auto space-y-3">
					{groupedByOrg.map(
						([
							owner,
							{ avatar, ownerType, repos: orgRepos },
						]) => (
							<div
								key={owner}
								className="border border-border rounded-md"
							>
								<Link
									href={
										ownerType ===
										"Organization"
											? `/${owner}`
											: `/users/${owner}`
									}
									className="flex items-center gap-3 px-4 py-2.5 border-b border-border bg-muted/20 dark:bg-white/[0.015] hover:bg-muted/40 dark:hover:bg-white/[0.03] transition-colors"
								>
									{avatar ? (
										<Image
											src={avatar}
											alt={owner}
											width={18}
											height={18}
											className="rounded-sm"
										/>
									) : (
										<FolderGit2 className="w-4 h-4 text-muted-foreground/50" />
									)}
									<span className="text-xs font-mono font-medium">
										{owner}
									</span>
									<span className="text-[11px] text-muted-foreground/50 font-mono tabular-nums">
										{orgRepos.length}
									</span>
								</Link>
								<div className="divide-y divide-border/60">
									{orgRepos.map((repo) => (
										<RepoRow
											key={
												repo.id
											}
											repo={repo}
											showOwner={
												false
											}
										/>
									))}
								</div>
							</div>
						),
					)}
				</div>
			) : (
				<div className="flex-1 min-h-0 overflow-y-auto border border-border rounded-md divide-y divide-border/60">
					{filtered.map((repo) => (
						<RepoRow key={repo.id} repo={repo} />
					))}
				</div>
			)}
		</div>
	);
}
