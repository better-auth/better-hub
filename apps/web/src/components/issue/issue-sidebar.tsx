import Image from "next/image";
import Link from "next/link";
import {
	CircleDot,
	CheckCircle2,
	GitPullRequest,
	Tag,
	Milestone,
	Calendar,
	Lock,
	ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import type { CrossReference } from "@/lib/github";

interface Assignee {
	login: string;
	avatar_url: string;
}

interface Label {
	name?: string;
	color?: string;
}

interface IssueSidebarProps {
	assignees?: Assignee[];
	milestone?: {
		title: string;
		description?: string | null;
		open_issues?: number;
		closed_issues?: number;
	} | null;
	labels?: Label[];
	state?: string;
	stateReason?: string | null;
	createdAt?: string;
	updatedAt?: string;
	closedAt?: string | null;
	closedBy?: { login: string; avatar_url: string } | null;
	locked?: boolean;
	activeLockReason?: string | null;
	crossRefs?: CrossReference[];
	owner?: string;
	repo?: string;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-2">
			{children}
		</h3>
	);
}

export function IssueSidebar({
	assignees,
	milestone,
	labels,
	state,
	stateReason,
	createdAt,
	updatedAt,
	closedAt,
	closedBy,
	locked,
	activeLockReason,
	crossRefs,
	owner,
	repo,
}: IssueSidebarProps) {
	const isOpen = state === "open";

	return (
		<>
			{/* Labels */}
			{labels && labels.filter((l) => l.name).length > 0 && (
				<div>
					<SectionHeading>
						<span className="flex items-center gap-1">
							<Tag className="w-2.5 h-2.5" />
							Labels
						</span>
					</SectionHeading>
					<div className="flex flex-wrap gap-1.5">
						{labels
							.filter((l) => l.name)
							.map((label) => (
								<span
									key={label.name}
									className="text-[10px] font-mono px-2 py-0.5 border rounded-full"
									style={{
										borderColor: `#${label.color || "888"}30`,
										color: `#${label.color || "888"}`,
										backgroundColor: `#${label.color || "888"}08`,
									}}
								>
									{label.name}
								</span>
							))}
					</div>
				</div>
			)}

			{/* Assignees */}
			{assignees && assignees.length > 0 && (
				<div>
					<SectionHeading>Assignees</SectionHeading>
					<div className="space-y-1.5">
						{assignees.map((a) => (
							<Link
								key={a.login}
								href={`/users/${a.login}`}
								className="flex items-center gap-2 text-xs text-foreground/70 hover:text-foreground transition-colors"
							>
								<Image
									src={a.avatar_url}
									alt={a.login}
									width={18}
									height={18}
									className="rounded-full"
								/>
								<span className="font-mono truncate">
									{a.login}
								</span>
							</Link>
						))}
					</div>
				</div>
			)}

			{/* Cross-references (linked PRs & issues) */}
			{crossRefs && crossRefs.length > 0 && owner && repo && (
				<div>
					<SectionHeading>
						<span className="flex items-center gap-1">
							<GitPullRequest className="w-2.5 h-2.5" />
							References
						</span>
					</SectionHeading>
					<div className="space-y-1.5">
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
										"flex items-center gap-1.5 text-xs transition-colors hover:bg-muted/40 rounded-sm px-1 py-0.5 -mx-1",
										ref.merged
											? "text-purple-400"
											: ref.state ===
												  "open"
												? "text-success"
												: "text-alert-important",
									)}
								>
									{ref.isPullRequest ? (
										<GitPullRequest className="w-3 h-3 shrink-0" />
									) : (
										<CircleDot className="w-3 h-3 shrink-0" />
									)}
									{!isLocal && (
										<span className="text-muted-foreground text-[10px] truncate max-w-[80px]">
											{
												ref.repoOwner
											}
											/
											{
												ref.repoName
											}
										</span>
									)}
									<span className="font-mono">
										#{ref.number}
									</span>
									<span className="text-muted-foreground/70 truncate text-[11px]">
										{ref.title}
									</span>
									{!isLocal && (
										<ExternalLink className="w-2.5 h-2.5 shrink-0 text-muted-foreground" />
									)}
								</Link>
							);
						})}
					</div>
				</div>
			)}

			{/* Milestone */}
			{milestone && (
				<div>
					<SectionHeading>
						<span className="flex items-center gap-1">
							<Milestone className="w-2.5 h-2.5" />
							Milestone
						</span>
					</SectionHeading>
					<div className="space-y-1">
						<span className="text-xs text-foreground/70 font-mono block">
							{milestone.title}
						</span>
						{milestone.description && (
							<p className="text-[10px] text-muted-foreground/50 leading-relaxed line-clamp-2">
								{milestone.description}
							</p>
						)}
						{(milestone.open_issues !== undefined ||
							milestone.closed_issues !== undefined) && (
							<div className="flex items-center gap-2 mt-1">
								{(() => {
									const open =
										milestone.open_issues ??
										0;
									const closed =
										milestone.closed_issues ??
										0;
									const total = open + closed;
									const pct =
										total > 0
											? Math.round(
													(closed /
														total) *
														100,
												)
											: 0;
									return (
										<>
											<div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
												<div
													className="h-full bg-success rounded-full transition-all"
													style={{
														width: `${pct}%`,
													}}
												/>
											</div>
											<span className="text-[9px] font-mono text-muted-foreground/50 tabular-nums shrink-0">
												{
													pct
												}
												%
											</span>
										</>
									);
								})()}
							</div>
						)}
					</div>
				</div>
			)}

			{/* Dates */}
			{createdAt && (
				<div>
					<SectionHeading>
						<span className="flex items-center gap-1">
							<Calendar className="w-2.5 h-2.5" />
							Details
						</span>
					</SectionHeading>
					<div className="space-y-1.5">
						<div className="flex items-center justify-between text-xs">
							<span className="text-muted-foreground/50">
								Created
							</span>
							<span className="font-mono text-foreground/60 text-[11px]">
								<TimeAgo date={createdAt} />
							</span>
						</div>
						{updatedAt && updatedAt !== createdAt && (
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground/50">
									Updated
								</span>
								<span className="font-mono text-foreground/60 text-[11px]">
									<TimeAgo date={updatedAt} />
								</span>
							</div>
						)}
						{closedAt && (
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground/50">
									Closed
								</span>
								<span className="font-mono text-foreground/60 text-[11px]">
									<TimeAgo date={closedAt} />
								</span>
							</div>
						)}
						{closedBy && (
							<div className="flex items-center justify-between text-xs">
								<span className="text-muted-foreground/50">
									Closed by
								</span>
								<Link
									href={`/users/${closedBy.login}`}
									className="flex items-center gap-1.5 text-foreground/60 hover:text-foreground transition-colors"
								>
									<Image
										src={
											closedBy.avatar_url
										}
										alt={closedBy.login}
										width={14}
										height={14}
										className="rounded-full"
									/>
									<span className="font-mono text-[11px]">
										{closedBy.login}
									</span>
								</Link>
							</div>
						)}
					</div>
				</div>
			)}

			{/* Status details */}
			{state && !isOpen && stateReason && (
				<div>
					<SectionHeading>Status</SectionHeading>
					<span
						className={cn(
							"inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-sm",
							stateReason === "completed"
								? "text-purple-400 bg-purple-400/10"
								: "text-muted-foreground bg-muted/50",
						)}
					>
						{stateReason === "completed" ? (
							<CheckCircle2 className="w-3 h-3" />
						) : (
							<CircleDot className="w-3 h-3" />
						)}
						{stateReason === "completed"
							? "Completed"
							: "Not planned"}
					</span>
				</div>
			)}

			{/* Lock status */}
			{locked && (
				<div>
					<SectionHeading>
						<span className="flex items-center gap-1">
							<Lock className="w-2.5 h-2.5" />
							Locked
						</span>
					</SectionHeading>
					<span className="text-[11px] text-muted-foreground/60 font-mono">
						{activeLockReason
							? activeLockReason
									.replace(/_/g, " ")
									.replace(/\b\w/g, (c) =>
										c.toUpperCase(),
									)
							: "Conversation locked"}
					</span>
				</div>
			)}
		</>
	);
}
