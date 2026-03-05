"use client";

import { useState, useMemo, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { Tag, Download, ExternalLink, Rocket, AlertCircle, Loader2 } from "lucide-react";
import { ListSearchInput } from "@/components/shared/list-controls";
import { fetchTagsPage } from "@/app/(app)/repos/[owner]/[repo]/tags/actions";

type RepoTag = {
	name: string;
	commit: { sha: string; url: string };
	zipball_url: string;
	tarball_url: string;
	node_id: string;
};

type Release = {
	id: number;
	tag_name: string;
	name: string | null;
	prerelease: boolean;
	draft: boolean;
	html_url: string;
	published_at: string | null;
};

interface TagsListProps {
	owner: string;
	repo: string;
	tags: RepoTag[];
	releases: Release[];
	hasMore: boolean;
}

export function TagsList({
	owner,
	repo,
	tags: initialTags,
	releases,
	hasMore: initialHasMore,
}: TagsListProps) {
	const [tags, setTags] = useState(initialTags);
	const [page, setPage] = useState(2);
	const [hasMore, setHasMore] = useState(initialHasMore);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const sentinelRef = useRef<HTMLDivElement>(null);

	const releaseByTag = useMemo(() => {
		const map = new Map<string, Release>();
		for (const r of releases) {
			map.set(r.tag_name, r);
		}
		return map;
	}, [releases]);

	const filtered = useMemo(() => {
		if (!search.trim()) return tags;
		const q = search.toLowerCase();
		return tags.filter((t) => t.name.toLowerCase().includes(q));
	}, [tags, search]);

	const loadMore = useCallback(async () => {
		if (loading || !hasMore) return;
		setLoading(true);
		try {
			const next = await fetchTagsPage(owner, repo, page);
			if (next.length === 0) {
				setHasMore(false);
			} else {
				setTags((prev) => [...prev, ...(next as RepoTag[])]);
				setPage((p) => p + 1);
				if (next.length < 100) setHasMore(false);
			}
		} finally {
			setLoading(false);
		}
	}, [loading, hasMore, owner, repo, page]);

	useEffect(() => {
		if (search.trim()) return;
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
	}, [loadMore, hasMore, search]);

	if (tags.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-20 gap-3 text-center">
				<div className="w-10 h-10 rounded-full bg-muted flex items-center justify-center">
					<Tag className="w-5 h-5 text-muted-foreground/40" />
				</div>
				<div>
					<p className="text-sm font-medium text-foreground/80">
						No tags yet
					</p>
					<p className="text-xs text-muted-foreground/60 mt-1">
						There aren&apos;t any tags for{" "}
						<span className="font-mono">
							{owner}/{repo}
						</span>
					</p>
				</div>
			</div>
		);
	}

	return (
		<div>
			<div className="sticky top-0 z-10 bg-background pb-3 pt-4 before:content-[''] before:absolute before:left-0 before:right-0 before:bottom-full before:h-8 before:bg-background">
				<div className="flex items-center gap-2 mb-3 flex-wrap">
					<ListSearchInput
						placeholder="Search tags…"
						value={search}
						onChange={setSearch}
					/>
					<span className="text-sm text-muted-foreground shrink-0 ml-auto">
						{search.trim() ? (
							<>
								{filtered.length} of {tags.length}
								{hasMore ? "+" : ""}{" "}
								{tags.length === 1 ? "tag" : "tags"}
							</>
						) : (
							<>
								{tags.length}
								{hasMore ? "+" : ""}{" "}
								{tags.length === 1 ? "tag" : "tags"}
							</>
						)}
					</span>
				</div>
			</div>

			{filtered.length === 0 ? (
				<p className="text-xs text-muted-foreground/60 text-center py-8">
					No tags matching &ldquo;{search}&rdquo;
				</p>
			) : (
				<div className="border border-border/40 rounded-md overflow-hidden divide-y divide-border/30">
					{filtered.map((tag) => {
						const release = releaseByTag.get(tag.name);
						const shortSha = tag.commit.sha.slice(0, 7);

						return (
							<div
								key={tag.name}
								className="flex items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors group"
							>
								<Tag className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />

								<div className="flex-1 min-w-0">
									<div className="flex items-center gap-2 flex-wrap">
										<Link
											href={`/${owner}/${repo}/releases/${tag.name}`}
											className="text-sm font-mono font-medium text-foreground truncate hover:underline hover:cursor-pointer"
										>
											{tag.name}
										</Link>
										{release &&
											!release.draft && (
												<>
													{release.prerelease ? (
														<span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
															<AlertCircle className="w-2.5 h-2.5" />
															Pre-release
														</span>
													) : (
														<span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
															<Rocket className="w-2.5 h-2.5" />
															{release.name ||
																release.tag_name}
														</span>
													)}
												</>
											)}
									</div>
									<p className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">
										{shortSha}
									</p>
								</div>

								<div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
									{release && (
										<a
											href={
												release.html_url
											}
											data-no-github-intercept
											target="_blank"
											rel="noopener noreferrer"
											className="flex items-center gap-1 text-[10px] px-2 py-1 border border-border/40 rounded text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
										>
											<Rocket className="w-3 h-3" />
											Release
										</a>
									)}
									<a
										href={
											tag.zipball_url
										}
										data-no-github-intercept
										className="flex items-center gap-1 text-[10px] px-2 py-1 border border-border/40 rounded text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
										title="Download zip"
									>
										<Download className="w-3 h-3" />
										zip
									</a>
									<a
										href={
											tag.tarball_url
										}
										data-no-github-intercept
										className="flex items-center gap-1 text-[10px] px-2 py-1 border border-border/40 rounded text-muted-foreground hover:text-foreground hover:border-border/80 transition-colors"
										title="Download tar.gz"
									>
										<Download className="w-3 h-3" />
										tar.gz
									</a>
									<a
										href={`https://github.com/${owner}/${repo}/releases/tag/${encodeURIComponent(tag.name)}`}
										data-no-github-intercept
										target="_blank"
										rel="noopener noreferrer"
										className="text-muted-foreground/40 hover:text-muted-foreground transition-colors"
									>
										<ExternalLink className="w-3.5 h-3.5" />
									</a>
								</div>
							</div>
						);
					})}
				</div>
			)}

			{!search.trim() && (
				<>
					<div ref={sentinelRef} className="h-1" />
					{loading && (
						<div className="flex justify-center py-4">
							<Loader2 className="w-4 h-4 animate-spin text-muted-foreground/40" />
						</div>
					)}
				</>
			)}
		</div>
	);
}
