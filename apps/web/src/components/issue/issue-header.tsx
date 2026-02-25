import Link from "next/link";
import Image from "next/image";
import { CircleDot, CheckCircle2, GitPullRequest, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { CopyLinkButton } from "@/components/shared/copy-link-button";
import { PinButton } from "@/components/shared/pin-button";
import type { CrossReference } from "@/lib/github";

interface IssueHeaderProps {
	title: string;
	number: number;
	state: string;
	author: { login: string; avatar_url: string } | null;
	createdAt: string;
	commentsCount: number;
	labels: Array<{ name?: string; color?: string }>;
	owner: string;
	repo: string;
	crossRefs?: CrossReference[];
	isPinned?: boolean;
}

export function IssueHeader({
	title,
	number,
	state,
	author,
	createdAt,
	commentsCount,
	labels,
	owner,
	repo,
	crossRefs,
	isPinned = false,
}: IssueHeaderProps) {
	const isOpen = state === "open";
	const linkedPRs = crossRefs?.filter((r) => r.isPullRequest) ?? [];
	const linkedIssues = crossRefs?.filter((r) => !r.isPullRequest) ?? [];

	return (
		<div className="mb-6">
			<h1 className="text-base font-medium tracking-tight mb-2">
				{title}{" "}
				<span className="text-muted-foreground/50 font-normal">
					#{number}
				</span>
			</h1>
			<div className="flex items-center gap-3 flex-wrap">
				<span
					className={cn(
						"inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono",
						isOpen ? "text-success" : "text-alert-important",
					)}
				>
					{isOpen ? (
						<CircleDot className="w-3 h-3" />
					) : (
						<CheckCircle2 className="w-3 h-3" />
					)}
					{isOpen ? "Open" : "Closed"}
				</span>
				{author && (
					<span className="flex items-center gap-1.5 text-xs text-muted-foreground">
						<Link
							href={`/users/${author.login}`}
							className="flex items-center gap-1.5 hover:text-foreground transition-colors"
						>
							<Image
								src={author.avatar_url}
								alt={author.login}
								width={16}
								height={16}
								className="rounded-full"
							/>
							<span className="font-mono">
								{author.login}
							</span>
						</Link>
						<span className="text-muted-foreground/50">
							opened <TimeAgo date={createdAt} />
						</span>
					</span>
				)}
				<span className="text-[11px] text-muted-foreground/50 font-mono">
					{commentsCount} comment{commentsCount !== 1 ? "s" : ""}
				</span>
				<CopyLinkButton
					owner={owner}
					repo={repo}
					number={number}
					type="issues"
				/>
				<PinButton
					owner={owner}
					repo={repo}
					url={`/${owner}/${repo}/issues/${number}`}
					title={`${title} #${number}`}
					itemType="issue"
					isPinned={isPinned}
				/>
				{labels
					.filter((l) => l.name)
					.map((label) => (
						<span
							key={label.name}
							className="text-[9px] font-mono px-2 py-0.5 border rounded-full"
							style={{
								borderColor: `#${label.color || "888"}30`,
								color: `#${label.color || "888"}`,
							}}
						>
							{label.name}
						</span>
					))}
			</div>
			{(linkedPRs.length > 0 || linkedIssues.length > 0) &&
				(() => {
					const renderRef = (ref: CrossReference) => {
						const isLocal =
							ref.repoOwner === owner &&
							ref.repoName === repo;
						const href = isLocal
							? `/${owner}/${repo}/${ref.isPullRequest ? "pulls" : "issues"}/${ref.number}`
							: `/${ref.repoOwner}/${ref.repoName}/${ref.isPullRequest ? "pulls" : "issues"}/${ref.number}`;
						return (
							<Link
								key={`${ref.repoOwner}/${ref.repoName}#${ref.number}`}
								href={href}
								className={cn(
									"inline-flex items-center gap-1.5 px-2 py-0.5 text-[11px] font-mono rounded-sm transition-colors hover:bg-muted/50",
									ref.merged
										? isLocal
											? "text-purple-400"
											: "text-purple-400/70"
										: ref.state ===
											  "open"
											? isLocal
												? "text-success"
												: "text-success/70"
											: isLocal
												? "text-alert-important"
												: "text-alert-important/70",
								)}
							>
								{!isLocal && (
									<ExternalLink className="w-3 h-3 shrink-0" />
								)}
								{ref.isPullRequest ? (
									<GitPullRequest className="w-3 h-3" />
								) : (
									<CircleDot className="w-3 h-3" />
								)}
								{!isLocal && (
									<span className="text-muted-foreground/50">
										{ref.repoOwner}/
										{ref.repoName}
									</span>
								)}
								<span>#{ref.number}</span>
								<span
									className={cn(
										"max-w-[200px] truncate",
										isLocal
											? "text-muted-foreground/70"
											: "text-muted-foreground/50",
									)}
								>
									{ref.title}
								</span>
								<span
									className={cn(
										"text-[9px] px-1 py-px rounded-sm",
										ref.merged
											? "bg-purple-400/10 text-purple-400"
											: ref.state ===
												  "open"
												? "bg-success/10 text-success"
												: "bg-alert-important/10 text-alert-important",
										!isLocal &&
											"opacity-70",
									)}
								>
									{ref.merged
										? "merged"
										: ref.state}
								</span>
							</Link>
						);
					};
					return (
						<div className="flex flex-col gap-1.5 mt-2">
							<div className="flex items-center gap-2 flex-wrap">
								{[
									...linkedPRs,
									...linkedIssues,
								].map(renderRef)}
							</div>
						</div>
					);
				})()}
		</div>
	);
}
