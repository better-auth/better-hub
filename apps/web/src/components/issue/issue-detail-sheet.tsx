"use client";

import Link from "next/link";
import { Loader2, Maximize2, X } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { ResizeHandle } from "@/components/ui/resize-handle";
import { IssueDetailLayout } from "@/components/issue/issue-detail-layout";
import { IssueHeader } from "@/components/issue/issue-header";
import { IssueCommentsClient } from "@/components/issue/issue-comments-client";
import { IssueCommentForm } from "@/components/issue/issue-comment-form";
import { IssueSidebar } from "@/components/issue/issue-sidebar";
import { IssueParticipants } from "@/components/issue/issue-participants";
import type { IssueDetailData } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

export const ISSUE_SHEET_WIDTH_COOKIE = "issue_sheet_width";
export const DEFAULT_ISSUE_SHEET_WIDTH = "60vw";
export const MIN_ISSUE_SHEET_WIDTH = 600;

export function IssueDetailSheet({
	open,
	onOpenChange,
	owner,
	repo,
	issueNumber,
	detail,
	isLoading,
	sheetWidth,
	isResizing,
	onResize,
	onResizeEnd,
	onResetWidth,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	owner: string;
	repo: string;
	issueNumber: number | null;
	detail: IssueDetailData | null;
	isLoading: boolean;
	sheetWidth: number | null;
	isResizing: boolean;
	onResize: (clientX: number) => void;
	onResizeEnd: () => void;
	onResetWidth: () => void;
}) {
	return (
		<Sheet open={open} onOpenChange={onOpenChange}>
			<SheetContent
				title="Issue Details"
				side="right"
				className="p-0 overflow-hidden"
				showCloseButton={false}
				style={{
					width: sheetWidth ?? DEFAULT_ISSUE_SHEET_WIDTH,
					maxWidth: "90vw",
					minWidth: sheetWidth
						? `${MIN_ISSUE_SHEET_WIDTH}px`
						: DEFAULT_ISSUE_SHEET_WIDTH,
					transition: isResizing ? "none" : "width 0.2s ease-out",
				}}
			>
				<ResizeHandle
					onResize={onResize}
					onDragStart={() => {}}
					onDragEnd={onResizeEnd}
					onDoubleClick={onResetWidth}
					className="absolute left-0 inset-y-0 z-20"
				/>
				<div className="absolute top-4 right-4 z-10 flex items-center gap-2">
					{issueNumber && (
						<Link
							href={`/${owner}/${repo}/issues/${issueNumber}`}
							title="Open full page"
							className="rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
						>
							<Maximize2 className="h-4 w-4" />
							<span className="sr-only">
								Open full page
							</span>
						</Link>
					)}
					<button
						onClick={() => onOpenChange(false)}
						className="rounded-sm p-1 opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 cursor-pointer"
					>
						<X className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</button>
				</div>

				{isLoading ? (
					<div className="flex items-center justify-center h-full">
						<Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
					</div>
				) : detail?.isPullRequest && issueNumber ? (
					<div className="flex flex-col items-center justify-center h-full gap-3 px-6 text-center">
						<p className="text-sm text-muted-foreground">
							This item is a pull request.
						</p>
						<Link
							href={`/${owner}/${repo}/pulls/${issueNumber}`}
							className="text-sm text-primary hover:underline"
						>
							Open pull request #{issueNumber}
						</Link>
					</div>
				) : detail ? (
					<div className="h-full px-4 sm:px-6 flex flex-col">
						<IssueDetailLayout
							contentGapClassName="gap-4"
							mainScrollClassName="pr-3"
							sidebarClassName="w-[180px] xl:w-[200px] pl-4"
							header={
								<IssueHeader
									title={detail.issue.title}
									number={detail.issue.number}
									state={detail.issue.state}
									author={detail.issue.user}
									createdAt={
										detail.issue
											.created_at
									}
									commentsCount={
										detail.issue
											.comments
									}
									labels={detail.issue.labels.map(
										(l) => ({
											name: l.name,
											color:
												l.color ??
												undefined,
										}),
									)}
									owner={owner}
									repo={repo}
									crossRefs={detail.crossRefs}
								/>
							}
							timeline={
								<IssueCommentsClient
									owner={owner}
									repo={repo}
									issueNumber={
										detail.issue.number
									}
									initialComments={
										detail.comments
									}
									descriptionEntry={
										detail.descriptionEntry
									}
									canEdit={
										detail.canEditIssue
									}
									issueTitle={
										detail.issue.title
									}
									currentUserLogin={
										detail.currentUserLogin
									}
									viewerHasWriteAccess={
										detail.viewerHasWriteAccess
									}
									timelineEvents={
										detail.timelineEvents
									}
								/>
							}
							commentForm={
								<IssueCommentForm
									owner={owner}
									repo={repo}
									issueNumber={
										detail.issue.number
									}
									issueState={
										detail.issue.state
									}
									canClose={detail.canClose}
									canReopen={detail.canReopen}
									userAvatarUrl={
										detail.userAvatarUrl
									}
									userName={detail.userName}
									participants={
										detail.participants
									}
								/>
							}
							sidebar={
								<>
									<IssueSidebar
										assignees={
											detail.issue
												.assignees
										}
										labels={detail.issue.labels.map(
											(l) => ({
												name: l.name,
												color:
													l.color ??
													undefined,
											}),
										)}
										milestone={
											detail.issue
												.milestone
										}
										state={
											detail.issue
												.state
										}
										stateReason={
											detail.issue
												.state_reason ??
											null
										}
										createdAt={
											detail.issue
												.created_at
										}
										updatedAt={
											detail.issue
												.updated_at
										}
										closedAt={
											detail.issue
												.closed_at ??
											null
										}
										closedBy={
											detail.issue
												.closed_by ??
											null
										}
										locked={
											detail.issue
												.locked ??
											false
										}
										activeLockReason={
											detail.issue
												.active_lock_reason ??
											null
										}
										crossRefs={
											detail.crossRefs
										}
										owner={owner}
										repo={repo}
									/>
									<IssueParticipants
										participants={
											detail.participants
										}
									/>
								</>
							}
						/>
					</div>
				) : (
					<div className="flex items-center justify-center h-full">
						<p className="text-sm text-muted-foreground">
							Issue not found
						</p>
					</div>
				)}
			</SheetContent>
		</Sheet>
	);
}
