import Image from "next/image";
import Link from "next/link";
import { ExternalLink, Globe, Lock, Star } from "lucide-react";
import { GistStarButton } from "./gist-star-button";
import type { GistDetail } from "@/lib/github-types";
import { formatNumber } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";

function getGistTitle(gist: GistDetail): string {
	const firstFile = Object.values(gist.files)[0];
	return gist.description?.trim() || firstFile?.filename || "Untitled Gist";
}

interface GistHeaderProps {
	gist: GistDetail;
}

export function GistHeader({ gist }: GistHeaderProps) {
	const title = getGistTitle(gist);
	const showDescription = !!gist.description?.trim() && gist.description.trim() !== title;

	return (
		<div className="flex items-start justify-between gap-3">
			<div className="min-w-0">
				<div className="flex items-center gap-2">
					<Image
						src={gist.owner.avatar_url}
						alt={gist.owner.login}
						width={20}
						height={20}
						className="rounded-full border border-border"
					/>
					<Link
						href={`/${gist.owner.login}`}
						className="text-sm text-muted-foreground hover:text-foreground transition-colors"
					>
						{gist.owner.login}
					</Link>
					<span className="text-muted-foreground/40">/</span>
					<h1 className="text-sm sm:text-base font-semibold wrap-break-word">
						{title}
					</h1>
				</div>

				{showDescription && (
					<p className="mt-1.5 text-sm text-muted-foreground wrap-break-word">
						{gist.description}
					</p>
				)}

				<div className="mt-2.5 flex items-center gap-3 flex-wrap text-[11px] font-mono text-muted-foreground/70">
					<span className="inline-flex items-center gap-1">
						{gist.public ? (
							<Globe className="w-3 h-3" />
						) : (
							<Lock className="w-3 h-3" />
						)}
						{gist.public ? "Public" : "Secret"}
					</span>
					{gist.stars > 0 && (
						<span className="inline-flex items-center gap-1">
							<Star className="w-3 h-3" />
							{formatNumber(gist.stars)} stars
						</span>
					)}
					<span>
						Updated <TimeAgo date={gist.updated_at} />
					</span>
				</div>
			</div>

			<div className="flex items-center gap-2 shrink-0">
				<GistStarButton
					gistId={gist.id}
					starred={gist.viewerHasStarred}
					starCount={gist.stars}
				/>
				<a
					href={gist.html_url}
					data-no-github-intercept
					target="_blank"
					rel="noopener noreferrer"
					className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
				>
					<ExternalLink className="w-3 h-3" />
					View on GitHub
				</a>
			</div>
		</div>
	);
}
