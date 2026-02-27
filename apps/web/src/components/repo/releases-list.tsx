"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { fetchReleasesPage } from "@/app/(app)/repos/[owner]/[repo]/releases/actions";
import Link from "next/link";
import Image from "next/image";
import {
	Tag,
	Download,
	Package,
	ExternalLink,
	ChevronDown,
	ChevronUp,
	Rocket,
	AlertCircle,
	Loader2,
} from "lucide-react";
import { cn, formatNumber } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";

type Asset = {
	id: number;
	name: string;
	size: number;
	download_count: number;
	browser_download_url: string;
	content_type: string;
};

type Release = {
	id: number;
	tag_name: string;
	name: string | null;
	body: string | null;
	bodyHtml: string | null;
	draft: boolean;
	prerelease: boolean;
	created_at: string;
	published_at: string | null;
	html_url: string;
	assets: Asset[];
	author: {
		login: string;
		avatar_url: string;
		html_url: string;
	};
	tarball_url: string | null;
	zipball_url: string | null;
	target_commitish: string;
};

interface ReleasesListProps {
	owner: string;
	repo: string;
	releases: Release[];
	hasMore: boolean;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

const COLLAPSE_THRESHOLD = 400;

function ReleaseBody({
	bodyHtml,
	owner,
	repo,
	tagName,
}: {
	bodyHtml: string;
	owner: string;
	repo: string;
	tagName: string;
}) {
	const [expanded, setExpanded] = useState(false);

	return (
		<div>
			<div
				className={cn(
					"overflow-hidden transition-all duration-200",
					!expanded && `max-h-[${COLLAPSE_THRESHOLD}px]`,
				)}
				style={!expanded ? { maxHeight: COLLAPSE_THRESHOLD } : undefined}
			>
				<div
					className="ghmd ghmd-sm"
					dangerouslySetInnerHTML={{ __html: bodyHtml }}
				/>
			</div>
			<div className="mt-2 flex items-center gap-3">
				<button
					onClick={() => setExpanded((e) => !e)}
					className="flex items-center gap-1 text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
				>
					{expanded ? (
						<>
							<ChevronUp className="w-3 h-3" />
							Show less
						</>
					) : (
						<>
							<ChevronDown className="w-3 h-3" />
							Show more
						</>
					)}
				</button>
				{!expanded && (
					<Link
						href={`/${owner}/${repo}/releases/${encodeURIComponent(tagName)}`}
						className="text-xs text-muted-foreground/60 hover:text-foreground transition-colors"
					>
						Full release notes →
					</Link>
				)}
			</div>
		</div>
	);
}

function ReleaseAssets({
	assets,
	tarball,
	zipball,
}: {
	assets: Asset[];
	tarball: string | null;
	zipball: string | null;
}) {
	const [open, setOpen] = useState(false);
	const hasSourceCode = tarball || zipball;
	const totalCount = assets.length + (hasSourceCode ? 2 : 0);

	if (totalCount === 0) return null;

	return (
		<div className="mt-4">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 text-xs text-muted-foreground/70 hover:text-foreground transition-colors"
			>
				<Package className="w-3.5 h-3.5" />
				<span>Assets</span>
				<span className="text-[10px] font-mono bg-muted/50 px-1.5 py-0.5 rounded">
					{totalCount}
				</span>
				{open ? (
					<ChevronUp className="w-3 h-3 ml-1" />
				) : (
					<ChevronDown className="w-3 h-3 ml-1" />
				)}
			</button>

			{open && (
				<div className="mt-2 border border-border/40 rounded-md overflow-hidden divide-y divide-border/30">
					{assets.map((asset) => (
						<a
							key={asset.id}
							href={asset.browser_download_url}
							className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/30 transition-colors group"
							data-no-github-intercept
						>
							<Download className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
							<span className="flex-1 font-mono text-foreground/80 group-hover:text-foreground truncate">
								{asset.name}
							</span>
							<span className="text-muted-foreground/50 shrink-0">
								{formatBytes(asset.size)}
							</span>
							<span className="text-muted-foreground/40 shrink-0 font-mono">
								{formatNumber(asset.download_count)}{" "}
								↓
							</span>
						</a>
					))}
					{zipball && (
						<a
							href={zipball}
							className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/30 transition-colors group"
							data-no-github-intercept
						>
							<Download className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
							<span className="flex-1 font-mono text-muted-foreground group-hover:text-foreground">
								Source code (zip)
							</span>
						</a>
					)}
					{tarball && (
						<a
							href={tarball}
							className="flex items-center gap-3 px-3 py-2 text-xs hover:bg-muted/30 transition-colors group"
							data-no-github-intercept
						>
							<Download className="w-3.5 h-3.5 text-muted-foreground/50 shrink-0" />
							<span className="flex-1 font-mono text-muted-foreground group-hover:text-foreground">
								Source code (tar.gz)
							</span>
						</a>
					)}
				</div>
			)}
		</div>
	);
}

function ReleaseItem({
	release,
	owner,
	repo,
	isLatest,
}: {
	release: Release;
	owner: string;
	repo: string;
	isLatest: boolean;
}) {
	return (
		<div
			className={cn(
				"py-8 border-b border-border/30 last:border-0",
				isLatest && "relative",
			)}
		>
			<div className="flex gap-4">
				<div className="shrink-0 pt-0.5">
					<a
						href={release.author.html_url}
						data-no-github-intercept
						target="_blank"
						rel="noopener noreferrer"
					>
						<Image
							src={release.author.avatar_url}
							alt={release.author.login}
							width={32}
							height={32}
							className="rounded-full"
						/>
					</a>
				</div>

				<div className="flex-1 min-w-0">
					<div className="flex items-center gap-2 mb-1.5 flex-wrap">
						{isLatest &&
							!release.prerelease &&
							!release.draft && (
								<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
									<Rocket className="w-2.5 h-2.5" />
									Latest
								</span>
							)}
						{release.prerelease && (
							<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
								<AlertCircle className="w-2.5 h-2.5" />
								Pre-release
							</span>
						)}
						{release.draft && (
							<span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
								Draft
							</span>
						)}
						<span className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/30">
							<Tag className="w-2.5 h-2.5" />
							{release.tag_name}
						</span>
					</div>

					<h3 className="text-sm font-semibold text-foreground mb-1">
						<Link
							href={`/${owner}/${repo}/releases/${encodeURIComponent(release.tag_name)}`}
							className="hover:underline underline-offset-2"
						>
							{release.name || release.tag_name}
						</Link>
					</h3>

					<p className="text-xs text-muted-foreground/70 mb-3">
						<a
							href={release.author.html_url}
							data-no-github-intercept
							target="_blank"
							rel="noopener noreferrer"
							className="font-medium text-muted-foreground hover:text-foreground transition-colors"
						>
							{release.author.login}
						</a>{" "}
						released{" "}
						{release.published_at ? (
							<TimeAgo date={release.published_at} />
						) : (
							"(unpublished)"
						)}{" "}
						·{" "}
						<span className="font-mono text-[10px]">
							{release.target_commitish}
						</span>
					</p>

					{release.bodyHtml && (
						<div className="pl-3 border-l-2 border-border/30 mb-1">
							<ReleaseBody
								bodyHtml={release.bodyHtml}
								owner={owner}
								repo={repo}
								tagName={release.tag_name}
							/>
						</div>
					)}

					<ReleaseAssets
						assets={release.assets}
						tarball={release.tarball_url}
						zipball={release.zipball_url}
					/>
				</div>

				<div className="shrink-0">
					<a
						href={release.html_url}
						data-no-github-intercept
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
					>
						<ExternalLink className="w-3 h-3" />
					</a>
				</div>
			</div>
		</div>
	);
}

export function ReleasesList({
	owner,
	repo,
	releases: initialReleases,
	hasMore: initialHasMore,
}: ReleasesListProps) {
	const [releases, setReleases] = useState(initialReleases);
	const [page, setPage] = useState(2);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [loading, setLoading] = useState(false);
	const sentinelRef = useRef<HTMLDivElement>(null);

	const loadMore = useCallback(async () => {
		if (loading || !hasMore) return;
		setLoading(true);
		try {
			const next = await fetchReleasesPage(owner, repo, page);
			if (next.length === 0) {
				setHasMore(false);
			} else {
				setReleases((prev) => [...prev, ...(next as Release[])]);
				setPage((p) => p + 1);
				if (next.length < 100) setHasMore(false);
			}
		} finally {
			setLoading(false);
		}
	}, [loading, hasMore, owner, repo, page]);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasMore) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0].isIntersecting) loadMore();
			},
			{ rootMargin: "300px" },
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [loadMore, hasMore]);

	if (releases.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
				<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
					<Tag className="w-5 h-5 text-muted-foreground/40" />
				</div>
				<div>
					<p className="text-sm font-medium text-foreground/80">
						No releases yet
					</p>
					<p className="text-xs text-muted-foreground/60 mt-1">
						There aren&apos;t any releases for{" "}
						<span className="font-mono">
							{owner}/{repo}
						</span>
					</p>
				</div>
				<a
					href={`https://github.com/${owner}/${repo}/releases/new`}
					data-no-github-intercept
					target="_blank"
					rel="noopener noreferrer"
					className="mt-1 flex items-center gap-1.5 text-xs px-3 py-1.5 border border-border rounded-md text-muted-foreground hover:text-foreground hover:border-foreground/20 transition-colors"
				>
					<ExternalLink className="w-3 h-3" />
					Create a release on GitHub
				</a>
			</div>
		);
	}

	const latestId = releases.find((r) => !r.prerelease && !r.draft)?.id;

	return (
		<div className="px-4 py-4">
			<div className="flex items-center justify-between mb-2">
				<h2 className="text-sm font-medium text-foreground">
					{releases.length}
					{hasMore ? "+" : ""}{" "}
					{releases.length === 1 ? "release" : "releases"}
				</h2>
				<a
					href={`https://github.com/${owner}/${repo}/releases`}
					data-no-github-intercept
					target="_blank"
					rel="noopener noreferrer"
					className="flex items-center gap-1 text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
				>
					<ExternalLink className="w-3 h-3" />
					View on GitHub
				</a>
			</div>

			<div>
				{releases.map((release) => (
					<ReleaseItem
						key={release.id}
						release={release}
						owner={owner}
						repo={repo}
						isLatest={release.id === latestId}
					/>
				))}
			</div>

			<div ref={sentinelRef} className="h-1" />
			{loading && (
				<div className="flex justify-center py-6">
					<Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
				</div>
			)}
		</div>
	);
}
