"use client";

import Link from "next/link";
import Image from "next/image";
import {
	ArrowLeft,
	ArrowRight,
	ChevronLeft,
	Download,
	ExternalLink,
	Package,
	Rocket,
	AlertCircle,
	Tag,
	GitCommit,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { useState } from "react";

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

interface ReleaseDetailProps {
	owner: string;
	repo: string;
	release: Release;
	bodyHtml: string | null;
	prevRelease: { tag_name: string; name: string | null } | null;
	nextRelease: { tag_name: string; name: string | null } | null;
}

function formatBytes(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
	return `${(bytes / 1024 / 1024 / 1024).toFixed(1)} GB`;
}

function formatDownloads(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function AssetsSection({
	assets,
	tarball,
	zipball,
}: {
	assets: Asset[];
	tarball: string | null;
	zipball: string | null;
}) {
	const [open, setOpen] = useState(true);
	const hasSourceCode = tarball || zipball;
	const totalCount = assets.length + (hasSourceCode ? 2 : 0);

	if (totalCount === 0) return null;

	const totalDownloads = assets.reduce((sum, a) => sum + a.download_count, 0);

	return (
		<div className="mt-8">
			<button
				onClick={() => setOpen((o) => !o)}
				className="flex items-center gap-2 text-sm font-medium text-foreground/80 hover:text-foreground transition-colors mb-2"
			>
				<Package className="w-4 h-4" />
				Assets
				<span className="text-xs font-mono text-muted-foreground/60 bg-muted/50 px-1.5 py-0.5 rounded">
					{totalCount}
				</span>
				{totalDownloads > 0 && (
					<span className="text-xs text-muted-foreground/50 font-normal">
						· {formatDownloads(totalDownloads)} downloads
					</span>
				)}
			</button>

			{open && (
				<div className="border border-border/40 rounded-md overflow-hidden divide-y divide-border/30">
					{assets.map((asset) => (
						<a
							key={asset.id}
							href={asset.browser_download_url}
							data-no-github-intercept
							className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors group"
						>
							<Download className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
							<span className="flex-1 font-mono text-xs text-foreground/80 group-hover:text-foreground truncate">
								{asset.name}
							</span>
							<span className="text-xs text-muted-foreground/50 shrink-0 tabular-nums">
								{formatBytes(asset.size)}
							</span>
							{asset.download_count > 0 && (
								<span className="text-xs text-muted-foreground/40 shrink-0 font-mono tabular-nums">
									{formatDownloads(
										asset.download_count,
									)}{" "}
									↓
								</span>
							)}
						</a>
					))}

					{zipball && (
						<a
							href={zipball}
							data-no-github-intercept
							className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors group"
						>
							<Download className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
							<span className="flex-1 font-mono text-xs text-muted-foreground group-hover:text-foreground">
								Source code (zip)
							</span>
						</a>
					)}
					{tarball && (
						<a
							href={tarball}
							data-no-github-intercept
							className="flex items-center gap-3 px-4 py-2.5 text-sm hover:bg-muted/30 transition-colors group"
						>
							<Download className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />
							<span className="flex-1 font-mono text-xs text-muted-foreground group-hover:text-foreground">
								Source code (tar.gz)
							</span>
						</a>
					)}
				</div>
			)}
		</div>
	);
}

export function ReleaseDetail({
	owner,
	repo,
	release,
	bodyHtml,
	prevRelease,
	nextRelease,
}: ReleaseDetailProps) {
	const base = `/${owner}/${repo}`;

	return (
		<div className="px-4 py-6 max-w-3xl">
			<Link
				href={`${base}/releases`}
				className="inline-flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors mb-6"
			>
				<ChevronLeft className="w-3.5 h-3.5" />
				All releases
			</Link>

			<div className="flex items-center gap-2 flex-wrap mb-2">
				{!release.prerelease && !release.draft && (
					<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
						<Rocket className="w-3 h-3" />
						Latest release
					</span>
				)}
				{release.prerelease && (
					<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
						<AlertCircle className="w-3 h-3" />
						Pre-release
					</span>
				)}
				{release.draft && (
					<span className="inline-flex items-center gap-1 text-[11px] font-medium px-2.5 py-0.5 rounded-full bg-muted text-muted-foreground border border-border/40">
						Draft
					</span>
				)}
				<span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-muted/50 text-muted-foreground border border-border/30">
					<Tag className="w-3 h-3" />
					{release.tag_name}
				</span>
				<span className="inline-flex items-center gap-1 text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-muted/40 text-muted-foreground/70 border border-border/20">
					<GitCommit className="w-3 h-3" />
					{release.target_commitish}
				</span>
			</div>

			<h1 className="text-xl font-semibold text-foreground mb-3">
				{release.name || release.tag_name}
			</h1>

			<div className="flex items-center gap-2 text-xs text-muted-foreground/70 mb-8">
				<a
					href={release.author.html_url}
					data-no-github-intercept
					target="_blank"
					rel="noopener noreferrer"
				>
					<Image
						src={release.author.avatar_url}
						alt={release.author.login}
						width={20}
						height={20}
						className="rounded-full"
					/>
				</a>
				<span>
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
					)}
				</span>
				<a
					href={release.html_url}
					data-no-github-intercept
					target="_blank"
					rel="noopener noreferrer"
					className="ml-1 text-muted-foreground/40 hover:text-muted-foreground transition-colors"
				>
					<ExternalLink className="w-3 h-3" />
				</a>
			</div>

			{bodyHtml ? (
				<div
					className="ghmd ghmd-sm"
					dangerouslySetInnerHTML={{ __html: bodyHtml }}
				/>
			) : (
				<p className="text-xs text-muted-foreground/50 italic">
					No release notes provided.
				</p>
			)}

			<AssetsSection
				assets={release.assets}
				tarball={release.tarball_url}
				zipball={release.zipball_url}
			/>

			{(prevRelease || nextRelease) && (
				<div className="mt-10 pt-6 border-t border-border/30 flex items-center justify-between gap-4">
					{prevRelease ? (
						<Link
							href={`${base}/releases/${encodeURIComponent(prevRelease.tag_name)}`}
							className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors min-w-0"
						>
							<ArrowLeft className="w-3.5 h-3.5 shrink-0" />
							<span className="truncate font-mono">
								{prevRelease.name ||
									prevRelease.tag_name}
							</span>
						</Link>
					) : (
						<span />
					)}
					{nextRelease ? (
						<Link
							href={`${base}/releases/${encodeURIComponent(nextRelease.tag_name)}`}
							className="flex items-center gap-1.5 text-xs text-muted-foreground/60 hover:text-foreground transition-colors min-w-0 text-right"
						>
							<span className="truncate font-mono">
								{nextRelease.name ||
									nextRelease.tag_name}
							</span>
							<ArrowRight className="w-3.5 h-3.5 shrink-0" />
						</Link>
					) : (
						<span />
					)}
				</div>
			)}
		</div>
	);
}
