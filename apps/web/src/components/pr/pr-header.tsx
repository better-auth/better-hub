import Link from "next/link";
import Image from "next/image";
import { GitPullRequest, GitBranch, ArrowRight, Check, X } from "lucide-react";
import type { CheckStatus, CrossReference } from "@/lib/github";
import { CircleDot, ExternalLink } from "lucide-react";
import { CheckStatusBadge } from "@/components/pr/check-status-badge";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { CopyLinkButton } from "@/components/shared/copy-link-button";
import { PinButton } from "@/components/shared/pin-button";
import { RefreshButton } from "@/components/shared/refresh-button";
import { EditablePRTitle } from "@/components/pr/editable-pr-title";
import { EditableBaseBranch } from "@/components/pr/editable-base-branch";
import { PRStatusIndicator } from "@/components/pr/pr-status-indicator";
import { UserTooltip } from "@/components/shared/user-tooltip";
import { buildPrHeadBranchTreeHref } from "@/lib/github-utils";

interface PRHeaderProps {
	title: string;
	number: number;
	state: string;
	merged: boolean;
	draft: boolean;
	author: { login: string; avatar_url: string } | null;
	createdAt: string;
	baseBranch: string;
	headBranch: string;
	additions: number;
	deletions: number;
	changedFiles: number;
	labels: Array<{ name?: string; color?: string }>;
	reviewStatuses?: Array<{ login: string; avatar_url: string; state: string }>;
	checkStatus?: CheckStatus;
	actions?: React.ReactNode;
	owner: string;
	repo: string;
	headRepoOwner?: string | null;
	headRepoName?: string | null;
	canEdit?: boolean;
	isPinned?: boolean;
	crossRefs?: CrossReference[];
}

export function PRHeader({
	title,
	number,
	state,
	merged,
	draft,
	author,
	createdAt,
	baseBranch,
	headBranch,
	additions,
	deletions,
	changedFiles,
	labels,
	reviewStatuses,
	checkStatus,
	actions,
	owner,
	repo,
	headRepoOwner,
	headRepoName,
	canEdit = false,
	isPinned = false,
	crossRefs,
}: PRHeaderProps) {
	const headBranchHref = buildPrHeadBranchTreeHref({
		baseOwner: owner,
		baseRepo: repo,
		headBranch,
		headRepoOwner,
		headRepoName,
	});

	return (
		<div className="pb-3 mb-0">
			{/* Title + actions */}
			<div className="flex items-start gap-3 mb-2.5">
				<EditablePRTitle
					title={title}
					number={number}
					owner={owner}
					repo={repo}
					canEdit={canEdit}
				/>
				{actions && <div className="shrink-0">{actions}</div>}
			</div>

			{/* Meta row */}
			<div className="flex items-center gap-2.5 flex-wrap">
				{/* Status */}
				<PRStatusIndicator
					owner={owner}
					repo={repo}
					number={number}
					initialState={state}
					initialMerged={merged}
					initialDraft={draft}
				/>

				{/* Author */}
				{author && (
					<UserTooltip username={author.login}>
						<Link
							href={`/users/${author.login}`}
							className="flex items-center gap-1.5 text-muted-foreground/70 hover:text-foreground transition-colors"
						>
							<Image
								src={author.avatar_url}
								alt={author.login}
								width={16}
								height={16}
								className="rounded-full"
							/>
							<span className="font-mono text-[11px] hover:underline">
								{author.login}
							</span>
						</Link>
					</UserTooltip>
				)}

				<span className="text-muted-foreground/50 text-[10px]">
					<TimeAgo date={createdAt} />
				</span>

				{/* Separator */}
				<span className="w-px h-3 bg-border" />

				{/* Branch */}
				<span className="flex items-center gap-1 font-mono text-muted-foreground/60 text-[10px]">
					<GitBranch className="w-3 h-3" />
					<Link
						href={headBranchHref}
						className="hover:text-info transition-colors hover:underline"
					>
						{headBranch}
					</Link>
					<ArrowRight className="w-2.5 h-2.5 text-muted-foreground" />
					<EditableBaseBranch
						owner={owner}
						repo={repo}
						pullNumber={number}
						baseBranch={baseBranch}
						headBranch={headBranch}
						canEdit={canEdit || false}
					/>
				</span>

				{/* Separator */}
				<span className="w-px h-3 bg-border" />

				{/* Stats */}
				<span className="flex items-center gap-1.5 font-mono text-[10px]">
					<span className="text-success">+{additions}</span>
					<span className="text-destructive">-{deletions}</span>
					<span className="text-muted-foreground/60">
						{changedFiles} file{changedFiles !== 1 ? "s" : ""}
					</span>
				</span>

				{checkStatus && (
					<>
						<span className="w-px h-3 bg-border" />
						<CheckStatusBadge
							checkStatus={checkStatus}
							owner={owner}
							repo={repo}
						/>
					</>
				)}

				<CopyLinkButton
					owner={owner}
					repo={repo}
					number={number}
					type="pulls"
				/>
				<PinButton
					owner={owner}
					repo={repo}
					url={`/${owner}/${repo}/pulls/${number}`}
					title={`${title} #${number}`}
					itemType="pr"
					isPinned={isPinned}
				/>
				<RefreshButton />

				{/* Labels */}
				{labels
					.filter((l) => l.name)
					.slice(0, 3)
					.map((label) => (
						<span
							key={label.name}
							className="text-[9px] font-mono px-1.5 py-0.5 border rounded-full"
							style={{
								borderColor: `#${label.color || "888"}30`,
								color: `#${label.color || "888"}`,
							}}
						>
							{label.name}
						</span>
					))}

				{/* Review statuses */}
				{reviewStatuses && reviewStatuses.length > 0 && (
					<>
						<span className="w-px h-3 bg-border" />
						{reviewStatuses.map((r) => (
							<UserTooltip
								key={r.login}
								username={r.login}
							>
								<Link
									href={`/users/${r.login}`}
									className="inline-flex items-center gap-1 hover:opacity-80 transition-opacity"
									title={`${r.login} ${r.state === "APPROVED" ? "approved" : "requested changes"}`}
								>
									<span className="relative">
										<Image
											src={
												r.avatar_url
											}
											alt={
												r.login
											}
											width={16}
											height={16}
											className="rounded-full"
										/>
										<span
											className={cn(
												"absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full flex items-center justify-center ring-2 ring-background",
												r.state ===
													"APPROVED"
													? "bg-success"
													: "bg-warning",
											)}
										>
											{r.state ===
											"APPROVED" ? (
												<Check className="w-2 h-2 text-white" />
											) : (
												<X className="w-2 h-2 text-white" />
											)}
										</span>
									</span>
								</Link>
							</UserTooltip>
						))}
					</>
				)}
			</div>
			{crossRefs && crossRefs.length > 0 && (
				<div className="flex items-center gap-2 flex-wrap mt-2">
					{crossRefs.map((ref) => {
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
										? "text-purple-400"
										: ref.state ===
											  "open"
											? "text-success"
											: "text-alert-important",
									!isLocal && "opacity-70",
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
									)}
								>
									{ref.merged
										? "merged"
										: ref.state}
								</span>
							</Link>
						);
					})}
				</div>
			)}
		</div>
	);
}
