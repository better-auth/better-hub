import Image from "next/image";
import Link from "next/link";
import {
	GitFork,
	Eye,
	Lock,
	Globe,
	Scale,
	Archive,
	Link as LinkIcon,
	HardDrive,
} from "lucide-react";
import { formatNumber } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { formatBytes } from "@/lib/github-utils";
import { StarButton } from "@/components/repo/star-button";
import { ForkButton } from "@/components/repo/fork-button";
import { ForkSyncButton } from "@/components/repo/fork-sync-button";
import { PinButton } from "@/components/repo/pin-button";
import { SidebarLanguages } from "@/components/repo/sidebar-languages";
import { SidebarContributors } from "@/components/repo/sidebar-contributors";

import { LatestCommitSection } from "@/components/repo/latest-commit-section";
import { RepoBreadcrumb } from "@/components/repo/repo-breadcrumb";
import type { ContributorAvatarsData } from "@/lib/repo-data-cache";
import type { ForkSyncStatus } from "@/lib/github";

interface LatestCommit {
	sha: string;
	message: string;
	date: string;
	author: { login: string; avatarUrl: string } | null;
}

interface RepoSidebarProps {
	owner: string;
	repoName: string;
	ownerType: string;
	avatarUrl: string;
	description: string | null;
	stars: number;
	forks: number;
	watchers: number;
	openIssuesCount: number;
	isPrivate: boolean;
	defaultBranch: string;
	language: string | null;
	license: { name: string; spdx_id: string | null } | null;
	pushedAt: string;
	size: number;
	htmlUrl: string;
	homepage: string | null;
	topics: string[];
	archived: boolean;
	fork: boolean;
	parent: { fullName: string; owner: string; name: string } | null;
	initialContributors: ContributorAvatarsData | null;
	initialLanguages: Record<string, number> | null;
	latestCommit: LatestCommit | null;
	isStarred: boolean;
	disableForkButton?: boolean;
	isOwnFork?: boolean;
	forkSyncStatus?: ForkSyncStatus | null;
}

export function RepoSidebar({
	owner,
	repoName,
	ownerType,
	avatarUrl,
	description,
	stars,
	forks,
	watchers,
	openIssuesCount,
	isPrivate,
	defaultBranch,
	language,
	license,
	pushedAt,
	size,
	htmlUrl,
	homepage,
	topics,
	archived,
	fork,
	parent,
	initialContributors,
	initialLanguages,
	latestCommit,
	isStarred,
	disableForkButton = false,
	isOwnFork,
	forkSyncStatus,
}: RepoSidebarProps) {
	const badges = [
		isPrivate ? { label: "Private", icon: Lock } : { label: "Public", icon: Globe },
		...(archived ? [{ label: "Archived", icon: Archive }] : []),
		...(fork ? [{ label: "Fork", icon: GitFork }] : []),
		...(homepage ? [{ label: "Website", icon: LinkIcon, href: homepage }] : []),
	];

	return (
		<>
			{/* Desktop sidebar */}
			<aside className="hidden lg:flex w-[260px] shrink-0 overflow-y-auto pt-0 pr-2 pl-6 pb-4 flex-col gap-5">
				{/* Name + Avatar + Description + Badges */}
				<div className="flex flex-col gap-2">
					<RepoBreadcrumb
						owner={owner}
						repoName={repoName}
						ownerType={ownerType}
						ownerAvatarUrl={avatarUrl}
					/>
					<Image
						src={avatarUrl}
						alt=""
						width={160}
						height={160}
						className="w-32 aspect-square rounded-lg"
					/>
					{description && (
						<p className="text-xs text-muted-foreground leading-relaxed">
							{description}
						</p>
					)}
					<div className="flex flex-wrap gap-1.5">
						{badges.map((b) => {
							const content = (
								<>
									<b.icon className="w-2.5 h-2.5" />
									{b.label}
								</>
							);
							const className =
								"flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-dashed border-border rounded-full text-muted-foreground";
							return "href" in b && b.href ? (
								<a
									key={b.label}
									href={b.href}
									target="_blank"
									rel="noopener noreferrer"
									className={`${className} hover:text-foreground transition-colors`}
								>
									{content}
								</a>
							) : (
								<span
									key={b.label}
									className={className}
								>
									{content}
								</span>
							);
						})}
					</div>
					{fork && parent && (
						<p className="text-[11px] text-muted-foreground/60">
							Forked from{" "}
							<Link
								href={`/${parent.owner}/${parent.name}`}
								className="text-muted-foreground hover:text-foreground transition-colors font-mono"
							>
								{parent.fullName}
							</Link>
						</p>
					)}
					{isOwnFork && fork && forkSyncStatus && (
						<ForkSyncButton
							owner={owner}
							repo={repoName}
							defaultBranch={defaultBranch}
							behind={forkSyncStatus.behind}
							parentFullName={parent?.fullName}
						/>
					)}
				</div>

				{/* Latest commit */}
				<LatestCommitSection
					owner={owner}
					repoName={repoName}
					initialCommit={latestCommit}
				/>

				{/* Topics */}
				{topics.length > 0 && (
					<div className="relative">
						<div className="flex gap-1.5 overflow-x-auto no-scrollbar">
							{topics.map((topic) => (
								<span
									key={topic}
									className="text-[10px] font-mono px-2 py-0.5 bg-muted text-muted-foreground rounded-full shrink-0"
								>
									{topic}
								</span>
							))}
						</div>
						<div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-background to-transparent" />
					</div>
				)}

				{/* Actions */}
				<div className="flex flex-col gap-2">
					<StarButton
						owner={owner}
						repo={repoName}
						starred={isStarred}
						starCount={stars}
					/>

					<PinButton
						owner={owner}
						repo={repoName}
						language={language}
						stargazers_count={stars}
						isPrivate={isPrivate}
						avatarUrl={avatarUrl}
					/>
					<ForkButton
						owner={owner}
						repo={repoName}
						forkCount={forks}
						disabled={disableForkButton}
					/>

					<span className="flex items-center justify-center gap-1.5 text-[11px] font-mono text-muted-foreground/60">
						<Eye className="w-3 h-3" />
						Watchers
						<span className="tabular-nums">
							{formatNumber(watchers)}
						</span>
					</span>
				</div>

				{/* Info */}
				<div className="flex flex-col gap-2">
					<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
						Info
					</span>
					<div className="flex flex-col gap-1.5">
						{language && (
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground/70">
									Language
								</span>
								<span className="font-mono text-muted-foreground">
									{language}
								</span>
							</div>
						)}
						{license && (
							<div className="flex items-center justify-between text-xs">
								<span className="flex items-center gap-1.5 text-muted-foreground/70">
									<Scale className="w-3 h-3" />
									License
								</span>
								<span className="font-mono text-muted-foreground">
									{license.spdx_id ??
										license.name}
								</span>
							</div>
						)}
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground/70">
								Last push
							</span>
							<span className="font-mono text-muted-foreground">
								<TimeAgo date={pushedAt} />
							</span>
						</div>
						{size > 0 && (
							<div className="flex items-center justify-between text-xs">
								<span className="flex items-center gap-1.5 text-muted-foreground/70">
									<HardDrive className="w-3 h-3" />
									Size
								</span>
								<span className="font-mono text-muted-foreground">
									{formatBytes(size * 1024)}
								</span>
							</div>
						)}
						{homepage && (
							<div className="flex items-center justify-between text-xs">
								<span className="flex items-center gap-1.5 text-muted-foreground/70">
									<LinkIcon className="w-3 h-3" />
									Homepage
								</span>
								<a
									href={homepage}
									target="_blank"
									rel="noopener noreferrer"
									className="font-mono text-muted-foreground hover:text-foreground transition-colors truncate max-w-[120px]"
								>
									{homepage.replace(
										/^https?:\/\//,
										"",
									)}
								</a>
							</div>
						)}
					</div>
				</div>

				{/* Languages (client-fetched) */}
				<SidebarLanguages
					owner={owner}
					repo={repoName}
					initialLanguages={initialLanguages}
				/>

				{/* Contributors (client-fetched) */}
				<SidebarContributors
					owner={owner}
					repo={repoName}
					initialData={initialContributors}
				/>
			</aside>

			{/* Mobile compact header */}
			<div className="block lg:hidden px-0">
				<div className="mb-2">
					{description && (
						<p className="text-xs text-muted-foreground mb-1.5 max-w-2xl">
							{description}
						</p>
					)}
					<div className="flex items-center gap-2 sm:gap-4 flex-wrap">
						{badges.map((b) => {
							const content = (
								<>
									<b.icon className="w-2.5 h-2.5" />
									{b.label}
								</>
							);
							const className =
								"flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 border border-dashed border-border rounded-full text-muted-foreground";
							return "href" in b && b.href ? (
								<a
									key={b.label}
									href={b.href}
									target="_blank"
									rel="noopener noreferrer"
									className={`${className} hover:text-foreground transition-colors`}
								>
									{content}
								</a>
							) : (
								<span
									key={b.label}
									className={className}
								>
									{content}
								</span>
							);
						})}
						<StarButton
							owner={owner}
							repo={repoName}
							starred={isStarred}
							starCount={stars}
						/>
						<span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
							<GitFork className="w-3 h-3" />
							{formatNumber(forks)}
						</span>
						<span className="flex items-center gap-1 text-[11px] text-muted-foreground/70">
							<Eye className="w-3 h-3" />
							{formatNumber(watchers)}
						</span>
					</div>
				</div>
			</div>
		</>
	);
}
