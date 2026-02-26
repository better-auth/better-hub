import { CheckCircle2, MessageCircle, Tag, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";

interface DiscussionSidebarProps {
	category: { name: string; emoji: string; isAnswerable: boolean };
	labels: Array<{ name?: string; color?: string }>;
	isAnswered: boolean;
	answerChosenAt: string | null;
	createdAt: string;
	updatedAt: string;
}

function SectionHeading({ children }: { children: React.ReactNode }) {
	return (
		<h3 className="text-[10px] font-mono text-muted-foreground/50 uppercase tracking-wider mb-2">
			{children}
		</h3>
	);
}

export function DiscussionSidebar({
	category,
	labels,
	isAnswered,
	answerChosenAt,
	createdAt,
	updatedAt,
}: DiscussionSidebarProps) {
	return (
		<>
			{/* Category */}
			<div>
				<SectionHeading>
					<span className="flex items-center gap-1">
						<MessageCircle className="w-2.5 h-2.5" />
						Category
					</span>
				</SectionHeading>
				<span className="text-xs font-mono text-foreground/70 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-border/60">
					{category.emoji} {category.name}
				</span>
				{category.isAnswerable && (
					<p className="text-[10px] text-muted-foreground/40 mt-1">
						Q&A — answers can be marked
					</p>
				)}
			</div>

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

			{/* Status */}
			<div>
				<SectionHeading>Status</SectionHeading>
				{isAnswered ? (
					<div className="space-y-1">
						<span
							className={cn(
								"inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-sm",
								"text-success bg-success/10",
							)}
						>
							<CheckCircle2 className="w-3 h-3" />
							Answered
						</span>
						{answerChosenAt && (
							<p className="text-[10px] text-muted-foreground/40">
								Answer chosen{" "}
								<TimeAgo date={answerChosenAt} />
							</p>
						)}
					</div>
				) : (
					<span
						className={cn(
							"inline-flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-sm",
							"text-muted-foreground bg-muted/50",
						)}
					>
						<MessageCircle className="w-3 h-3" />
						Open
					</span>
				)}
			</div>

			{/* Dates */}
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
				</div>
			</div>
		</>
	);
}
