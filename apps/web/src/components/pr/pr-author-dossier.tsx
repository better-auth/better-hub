"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import {
	MapPin,
	Building2,
	Users,
	BookOpen,
	Calendar,
	Star,
	Link as LinkIcon,
	ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { ScoreResult } from "@/lib/contributor-score";
import { UserTooltip } from "@/components/shared/user-tooltip";

interface AuthorOrg {
	login: string;
	avatar_url: string;
}

interface AuthorRepo {
	name: string;
	full_name: string;
	stargazers_count: number;
	language: string | null;
}

export interface AuthorDossierData {
	login: string;
	name: string | null;
	avatar_url: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	twitter_username: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
	type: string;
}

export interface RepoActivity {
	commits: number;
	prs: number;
	reviews: number;
	issues: number;
}

interface PRAuthorDossierProps {
	author: AuthorDossierData;
	orgs: AuthorOrg[];
	topRepos: AuthorRepo[];
	isOrgMember?: boolean;
	score?: ScoreResult | null;
	contributionCount?: number;
	repoActivity?: RepoActivity;
	openedAt?: string;
}

function fmtAge(d: string): string {
	const m = (Date.now() - new Date(d).getTime()) / 2.628e9; // months
	if (m < 1) return "<1mo";
	if (m < 12) return `${Math.floor(m)}mo`;
	const y = Math.floor(m / 12);
	const r = Math.floor(m % 12);
	return r > 0 ? `${y}y ${r}mo` : `${y}y`;
}

function fmtN(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

const LC: Record<string, string> = {
	TypeScript: "#3178c6",
	JavaScript: "#f1e05a",
	Python: "#3572A5",
	Rust: "#dea584",
	Go: "#00ADD8",
	Java: "#b07219",
	Ruby: "#701516",
	"C++": "#f34b7d",
	C: "#555555",
	Swift: "#F05138",
	Kotlin: "#A97BFF",
	PHP: "#4F5D95",
	Shell: "#89e051",
	"C#": "#178600",
	Vue: "#41b883",
};

function scoreColor(total: number): string {
	if (total >= 80) return "text-emerald-400";
	if (total >= 60) return "text-green-400";
	if (total >= 30) return "text-amber-400";
	return "text-muted-foreground/50";
}

function scoreRingColor(total: number): string {
	if (total >= 80) return "stroke-emerald-400";
	if (total >= 60) return "stroke-green-400";
	if (total >= 30) return "stroke-amber-400";
	return "stroke-muted-foreground/30";
}

function scoreLabel(total: number): string {
	if (total >= 80) return "Highly trusted";
	if (total >= 60) return "Trusted";
	if (total >= 30) return "Moderate";
	return "New contributor";
}

function XIcon({ className }: { className?: string }) {
	return (
		<svg viewBox="0 0 24 24" className={className} fill="currentColor">
			<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
		</svg>
	);
}

/** Circular score ring */
function ScoreRing({ score }: { score: ScoreResult }) {
	const radius = 14;
	const circumference = 2 * Math.PI * radius;
	const progress = (score.total / 100) * circumference;
	const triggerRef = useRef<HTMLDivElement>(null);
	const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

	const handleMouseEnter = useCallback(() => {
		if (triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			setTooltipPos({
				top: rect.bottom + 8,
				left: rect.left + rect.width / 2,
			});
		}
	}, []);

	const animateIn = useCallback((el: HTMLDivElement | null) => {
		el?.animate(
			[
				{ opacity: 0, transform: "translateX(-50%) translateY(4px)" },
				{ opacity: 1, transform: "translateX(-50%) translateY(0)" },
			],
			{ duration: 150, easing: "ease-out", fill: "forwards" },
		);
	}, []);

	return (
		<div
			ref={triggerRef}
			className="relative shrink-0"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={() => setTooltipPos(null)}
		>
			<div className="relative w-9 h-9 flex items-center justify-center">
				<svg className="w-9 h-9 -rotate-90" viewBox="0 0 36 36">
					<circle
						cx="18"
						cy="18"
						r={radius}
						fill="none"
						strokeWidth="2.5"
						className="stroke-muted/40"
					/>
					<circle
						cx="18"
						cy="18"
						r={radius}
						fill="none"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeDasharray={circumference}
						strokeDashoffset={circumference - progress}
						className={cn(
							"transition-all duration-500",
							scoreRingColor(score.total),
						)}
					/>
				</svg>
				<span
					className={cn(
						"absolute inset-0 flex items-center justify-center text-[10px] font-semibold font-mono",
						scoreColor(score.total),
					)}
				>
					{score.total}
				</span>
			</div>

			{tooltipPos &&
				createPortal(
					<div
						ref={animateIn}
						className="fixed z-[9999] w-52 px-3 py-2.5 rounded-lg border border-border/60 shadow-xl text-left pointer-events-none"
						style={{
							top: tooltipPos.top,
							left: tooltipPos.left,
							opacity: 0,
							backgroundColor: "var(--card)",
						}}
					>
						<div
							className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-l border-t border-border/60 mb-[-5px]"
							style={{ backgroundColor: "var(--card)" }}
						/>
						<div className="flex items-center gap-1.5 mb-1.5">
							<ShieldCheck className="w-3 h-3 text-muted-foreground" />
							<span
								className={cn(
									"text-[11px] font-semibold",
									scoreColor(score.total),
								)}
							>
								{scoreLabel(score.total)}
							</span>
						</div>
						<p className="text-[10px] leading-relaxed text-muted-foreground">
							Trust score from profile, repo
							contributions, and open-source track record.
						</p>
						<div className="mt-2 flex gap-0.5 h-1 rounded-full overflow-hidden">
							<div
								className="bg-emerald-400/70 rounded-full"
								style={{
									width: `${(score.repoFamiliarity / 100) * 100}%`,
								}}
								title="Repo activity"
							/>
							<div
								className="bg-green-400/70 rounded-full"
								style={{
									width: `${(score.communityStanding / 100) * 100}%`,
								}}
								title="Community"
							/>
							<div
								className="bg-blue-400/70 rounded-full"
								style={{
									width: `${(score.ossInfluence / 100) * 100}%`,
								}}
								title="Open source"
							/>
							<div
								className="bg-amber-400/70 rounded-full"
								style={{
									width: `${(score.prTrackRecord / 100) * 100}%`,
								}}
								title="PR history"
							/>
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}

export function PRAuthorDossier({
	author,
	orgs,
	topRepos,
	isOrgMember,
	score,
	contributionCount,
	repoActivity,
	openedAt,
}: PRAuthorDossierProps) {
	const isBot = author.type === "Bot";
	const isFirstTime = !contributionCount || contributionCount === 0;

	// Normalize blog URL
	const rawBlog = author.blog?.trim() || null;
	const blogUrl = rawBlog
		? rawBlog.startsWith("http")
			? rawBlog
			: `https://${rawBlog}`
		: null;
	const blogLabel = rawBlog ? rawBlog.replace(/^https?:\/\//, "").replace(/\/$/, "") : null;

	return (
		<div className="mb-1">
			{/* Author summary row */}
			<div className="flex items-center gap-2 px-1 py-1.5">
				<UserTooltip username={author.login} side="bottom" align="start">
					<Link
						href={`/users/${author.login}`}
						className="flex items-center gap-2 hover:opacity-80 transition-opacity"
					>
						<Image
							src={author.avatar_url}
							alt={author.login}
							width={20}
							height={20}
							className="rounded-full shrink-0"
						/>
						<span className="text-[11px] font-medium text-foreground/80 truncate hover:underline">
							{author.name || author.login}
						</span>
						{author.name && (
							<span className="text-[10px] font-mono text-muted-foreground truncate hidden sm:inline">
								{author.login}
							</span>
						)}
					</Link>
				</UserTooltip>
				{isBot && (
					<span className="text-[8px] px-1 py-px bg-muted text-muted-foreground rounded-full font-mono uppercase shrink-0">
						bot
					</span>
				)}
				{isOrgMember && (
					<span className="text-[8px] px-1 py-px border border-success/30 text-success rounded-full font-mono uppercase shrink-0">
						member
					</span>
				)}
				{isFirstTime && !isBot && (
					<span className="text-[8px] px-1 py-px border border-blue-400/30 text-blue-400 rounded-full font-mono uppercase shrink-0">
						new contributor
					</span>
				)}

				{openedAt && (
					<span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">
						opened <TimeAgo date={openedAt} />
					</span>
				)}
			</div>

			{/* Detail */}
			<div className="px-1 py-1.5 space-y-1.5">
				{/* Score + Bio row */}
				<div className="flex items-start gap-3">
					{score && <ScoreRing score={score} />}
					<div className="flex-1 min-w-0">
						{author.bio && (
							<p className="text-[11px] text-foreground/60 leading-snug">
								{author.bio}
							</p>
						)}
						{!author.bio && score && (
							<p className="text-[10px] text-muted-foreground italic">
								No bio
							</p>
						)}
					</div>
				</div>

				{/* Meta row */}
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] font-mono text-muted-foreground/50">
					{author.company && (
						<span className="inline-flex items-center gap-0.5">
							<Building2 className="w-2.5 h-2.5" />
							{author.company.replace(/^@/, "")}
						</span>
					)}
					{author.location && (
						<span className="inline-flex items-center gap-0.5">
							<MapPin className="w-2.5 h-2.5" />
							{author.location}
						</span>
					)}
					<span
						className="inline-flex items-center gap-0.5"
						title={`Since ${new Date(author.created_at).toLocaleDateString()}`}
					>
						<Calendar className="w-2.5 h-2.5" />
						{fmtAge(author.created_at)}
					</span>
					<span className="inline-flex items-center gap-0.5">
						<Users className="w-2.5 h-2.5" />
						{fmtN(author.followers)}
					</span>
					<span className="inline-flex items-center gap-0.5">
						<BookOpen className="w-2.5 h-2.5" />
						{fmtN(author.public_repos)}
					</span>
					{author.twitter_username && (
						<Link
							href={`https://x.com/${author.twitter_username}`}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 hover:text-foreground/70 transition-colors"
						>
							<XIcon className="w-2.5 h-2.5" />@
							{author.twitter_username}
						</Link>
					)}
					{blogUrl && (
						<Link
							href={blogUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="inline-flex items-center gap-0.5 hover:text-foreground/70 transition-colors truncate max-w-[140px]"
						>
							<LinkIcon className="w-2.5 h-2.5 shrink-0" />
							{blogLabel}
						</Link>
					)}
				</div>

				{/* Repo activity */}
				{repoActivity &&
					(repoActivity.commits > 0 ||
						repoActivity.prs > 0 ||
						repoActivity.reviews > 0 ||
						repoActivity.issues > 0 ||
						(contributionCount ?? 0) > 0) && (
						<div className="flex items-center gap-1.5 flex-wrap">
							{(contributionCount ?? 0) > 0 && (
								<span className="text-[10px] font-mono px-1.5 py-0.5 rounded-full bg-success/8 text-success/80 border border-success/15">
									{fmtN(contributionCount!)}{" "}
									contribution
									{contributionCount !== 1
										? "s"
										: ""}
								</span>
							)}
							{repoActivity.commits > 0 && (
								<span className="text-[10px] font-mono text-muted-foreground">
									{fmtN(repoActivity.commits)}{" "}
									commit
									{repoActivity.commits !== 1
										? "s"
										: ""}
								</span>
							)}
							{repoActivity.prs > 0 && (
								<span className="text-[10px] font-mono text-muted-foreground">
									{fmtN(repoActivity.prs)} PR
									{repoActivity.prs !== 1
										? "s"
										: ""}
								</span>
							)}
							{repoActivity.reviews > 0 && (
								<span className="text-[10px] font-mono text-muted-foreground">
									{fmtN(repoActivity.reviews)}{" "}
									review
									{repoActivity.reviews !== 1
										? "s"
										: ""}
								</span>
							)}
							{repoActivity.issues > 0 && (
								<span className="text-[10px] font-mono text-muted-foreground">
									{fmtN(repoActivity.issues)}{" "}
									issue
									{repoActivity.issues !== 1
										? "s"
										: ""}
								</span>
							)}
						</div>
					)}

				{/* Orgs */}
				{orgs.length > 0 && (
					<div className="flex items-center gap-1">
						{orgs.slice(0, 6).map((o) => (
							<Link
								key={o.login}
								href={`https://github.com/${o.login}`}
								target="_blank"
								rel="noopener noreferrer"
								title={o.login}
								className="hover:ring-1 hover:ring-foreground/20 rounded-sm transition-all"
							>
								<Image
									src={o.avatar_url}
									alt={o.login}
									width={16}
									height={16}
									className="rounded-sm"
								/>
							</Link>
						))}
						{orgs.length > 6 && (
							<span className="text-[9px] text-muted-foreground/30 font-mono">
								+{orgs.length - 6}
							</span>
						)}
					</div>
				)}

				{/* Top repos — compact inline list */}
				{topRepos.length > 0 && (
					<div className="flex flex-wrap gap-x-2.5 gap-y-0.5 pt-0.5">
						{topRepos.slice(0, 3).map((r) => (
							<Link
								key={r.full_name}
								href={`/${r.full_name}`}
								className="inline-flex items-center gap-1 text-[10px] font-mono text-foreground/50 hover:text-foreground transition-colors"
							>
								{r.language && (
									<span
										className="w-1.5 h-1.5 rounded-full shrink-0"
										style={{
											backgroundColor:
												LC[
													r
														.language
												] ||
												"#888",
										}}
									/>
								)}
								<span className="truncate max-w-[100px]">
									{r.name}
								</span>
								<Star className="w-2 h-2 text-muted-foreground/30" />
								<span className="text-muted-foreground">
									{fmtN(r.stargazers_count)}
								</span>
							</Link>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
