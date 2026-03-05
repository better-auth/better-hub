"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
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

function fmtN(n: number): string {
	return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(n);
}

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
			<div className="relative size-11 flex items-center justify-center">
				<svg className="size-11 -rotate-90" viewBox="0 0 36 36">
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
	topRepos: _topRepos,
	isOrgMember,
	score,
	contributionCount,
	repoActivity,
	openedAt,
}: PRAuthorDossierProps) {
	const isBot = author.type === "Bot";
	const isFirstTime = !contributionCount || contributionCount === 0;

	const hasActivity =
		repoActivity &&
		(repoActivity.commits > 0 ||
			repoActivity.prs > 0 ||
			repoActivity.reviews > 0 ||
			repoActivity.issues > 0 ||
			(contributionCount ?? 0) > 0);

	return (
		<div className="mb-4">
			{/* Author summary row */}
			<div className="flex items-center gap-2.5 px-1 py-1.5">
				{score && <ScoreRing score={score} />}
				<div className="flex-1 min-w-0 gap-0.5 flex flex-col justify-center h-10">
					{/* Top: User info */}
					<div className="flex items-center gap-1.5">
						<UserTooltip
							username={author.login}
							side="bottom"
							align="start"
						>
							<Link
								href={`/users/${author.login}`}
								className="flex items-center gap-1.5 hover:opacity-80 transition-opacity"
							>
								<Image
									src={author.avatar_url}
									alt={author.login}
									width={20}
									height={20}
									className="rounded-full shrink-0 border"
								/>
								<span className="text-[11px] font-medium text-foreground/80 truncate hover:underline">
									{author.name ||
										author.login}
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
						{/* Detail */}
						<div className="px-1 py-1.5 space-y-1.5">
							{/* Orgs */}
							{orgs.length > 0 && (
								<div className="flex items-center gap-1">
									{orgs
										.slice(0, 6)
										.map((o) => (
											<Link
												key={
													o.login
												}
												href={`https://github.com/${o.login}`}
												target="_blank"
												rel="noopener noreferrer"
												title={
													o.login
												}
												className="ring-1 ring-border hover:ring-foreground/20 rounded-sm transition-all"
											>
												<Image
													src={
														o.avatar_url
													}
													alt={
														o.login
													}
													width={
														16
													}
													height={
														16
													}
													className="rounded-sm"
												/>
											</Link>
										))}
									{orgs.length > 6 && (
										<span className="text-[9px] text-muted-foreground/30 font-mono">
											+
											{orgs.length -
												6}
										</span>
									)}
								</div>
							)}
						</div>
						{openedAt && (
							<span className="ml-auto text-[10px] text-muted-foreground/50 shrink-0">
								opened <TimeAgo date={openedAt} />
							</span>
						)}
					</div>
					{/* Bottom: Stats */}
					{hasActivity && (
						<div className="flex items-center gap-1.5 flex-wrap text-[10px] font-mono text-muted-foreground mt-0.5">
							{(contributionCount ?? 0) > 0 && (
								<>
									<span>
										{fmtN(
											contributionCount!,
										)}{" "}
										contribution
										{contributionCount !==
										1
											? "s"
											: ""}
									</span>
									{(repoActivity.commits >
										0 ||
										repoActivity.prs >
											0 ||
										repoActivity.reviews >
											0 ||
										repoActivity.issues >
											0) && (
										<span className="text-muted-foreground/60">
											&middot;
										</span>
									)}
								</>
							)}
							{repoActivity.commits > 0 && (
								<>
									<span>
										{fmtN(
											repoActivity.commits,
										)}{" "}
										commit
										{repoActivity.commits !==
										1
											? "s"
											: ""}
									</span>
									{(repoActivity.prs > 0 ||
										repoActivity.reviews >
											0 ||
										repoActivity.issues >
											0) && (
										<span className="text-muted-foreground/60">
											&middot;
										</span>
									)}
								</>
							)}
							{repoActivity.prs > 0 && (
								<>
									<span>
										{fmtN(
											repoActivity.prs,
										)}{" "}
										PR
										{repoActivity.prs !==
										1
											? "s"
											: ""}
									</span>
									{(repoActivity.reviews >
										0 ||
										repoActivity.issues >
											0) && (
										<span className="text-muted-foreground/60">
											&middot;
										</span>
									)}
								</>
							)}
							{repoActivity.reviews > 0 && (
								<>
									<span>
										{fmtN(
											repoActivity.reviews,
										)}{" "}
										review
										{repoActivity.reviews !==
										1
											? "s"
											: ""}
									</span>
									{repoActivity.issues >
										0 && (
										<span className="text-muted-foreground/60">
											&middot;
										</span>
									)}
								</>
							)}
							{repoActivity.issues > 0 && (
								<span>
									{fmtN(repoActivity.issues)}{" "}
									issue
									{repoActivity.issues !== 1
										? "s"
										: ""}
								</span>
							)}
						</div>
					)}
				</div>
			</div>
		</div>
	);
}
