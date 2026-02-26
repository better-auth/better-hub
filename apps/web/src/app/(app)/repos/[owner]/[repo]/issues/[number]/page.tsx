import type { Metadata } from "next";
import {
	getIssue,
	getIssueComments,
	getRepo,
	getCrossReferences,
	getAuthenticatedUser,
} from "@/lib/github";
import { ogImageUrl, ogImages } from "@/lib/og/og-utils";
import { extractParticipants } from "@/lib/github-utils";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { IssueHeader } from "@/components/issue/issue-header";
import { IssueDetailLayout } from "@/components/issue/issue-detail-layout";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import type { IssueTimelineEntry } from "@/components/issue/issue-conversation";
import { IssueCommentsClient, type IssueComment } from "@/components/issue/issue-comments-client";
import { IssueCommentForm } from "@/components/issue/issue-comment-form";
import { IssueSidebar } from "@/components/issue/issue-sidebar";
import { IssueParticipants } from "@/components/issue/issue-participants";
import { TrackView } from "@/components/shared/track-view";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { inngest } from "@/lib/inngest";
import { isItemPinned } from "@/lib/pinned-items-store";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
}): Promise<Metadata> {
	const { owner, repo, number: numStr } = await params;
	const issueNumber = parseInt(numStr, 10);

	const repoData = await getRepo(owner, repo);
	const isPrivate = !repoData || repoData.private === true;

	if (isPrivate) {
		return { title: `Issue #${issueNumber} · ${owner}/${repo}` };
	}

	const issue = await getIssue(owner, repo, issueNumber);
	const ogUrl = ogImageUrl({ type: "issue", owner, repo, number: issueNumber });

	if (!issue) {
		return { title: `Issue #${issueNumber} · ${owner}/${repo}` };
	}

	return {
		title: `${issue.title} · Issue #${issueNumber} · ${owner}/${repo}`,
		description: issue.body
			? issue.body.slice(0, 200)
			: `Issue #${issueNumber} on ${owner}/${repo}`,
		openGraph: { title: `${issue.title} · Issue #${issueNumber}`, ...ogImages(ogUrl) },
		twitter: { card: "summary_large_image", ...ogImages(ogUrl) },
	};
}

export default async function IssueDetailPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
}) {
	const { owner, repo, number: numStr } = await params;
	const issueNumber = parseInt(numStr, 10);

	const hdrs = await headers();
	const [issue, rawComments, repoData, crossRefs, currentUser, session] = await Promise.all([
		getIssue(owner, repo, issueNumber),
		getIssueComments(owner, repo, issueNumber),
		getRepo(owner, repo),
		getCrossReferences(owner, repo, issueNumber),
		getAuthenticatedUser(),
		auth.api.getSession({ headers: hdrs }),
	]);
	const comments = rawComments as IssueComment[];

	if (!issue) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Issue not found
				</p>
			</div>
		);
	}

	// Start pin check in parallel with markdown rendering
	const pinnedPromise = session?.user?.id
		? isItemPinned(
				session.user.id,
				owner,
				repo,
				`/${owner}/${repo}/issues/${issueNumber}`,
			)
		: Promise.resolve(false);

	// Fire-and-forget: embed issue content for semantic search
	if (session?.user?.id) {
		void inngest.send({
			name: "app/content.viewed",
			data: {
				userId: session.user.id,
				contentType: "issue",
				owner,
				repo,
				number: issueNumber,
				title: issue.title,
				body: issue.body ?? "",
				comments: (comments || [])
					.filter((c) => c.body)
					.map((c) => ({
						id: c.id,
						body: c.body,
						author: c.user?.login ?? "unknown",
						createdAt: c.created_at,
					})),
			},
		});
	}

	const issueLabels = (issue.labels || [])
		.map((l) => (typeof l === "string" ? l : l.name || ""))
		.filter(Boolean);

	const issueComments = (comments || []).map((c) => ({
		author: c.user?.login || "unknown",
		body: c.body || "",
		createdAt: c.created_at,
	}));

	// Pre-render markdown for description and initial comments
	const issueRefCtx = { owner, repo };
	const [descriptionHtml, ...commentHtmls] = await Promise.all([
		issue.body
			? renderMarkdownToHtml(issue.body, undefined, issueRefCtx)
			: Promise.resolve(""),
		...(comments || []).map((c) =>
			c.body
				? renderMarkdownToHtml(c.body, undefined, issueRefCtx)
				: Promise.resolve(""),
		),
	]);
	const issuePinned = await pinnedPromise;

	const commentsWithHtml: IssueComment[] = (comments || []).map((c, i) => ({
		...c,
		bodyHtml: commentHtmls[i],
	}));

	const descriptionEntry: IssueTimelineEntry = {
		type: "description",
		id: "description",
		user: issue.user,
		body: issue.body || "",
		bodyHtml: descriptionHtml,
		created_at: issue.created_at,
		reactions:
			(issue as { reactions?: Record<string, unknown> }).reactions ?? undefined,
	};
	// Extract participants
	const participants = extractParticipants([
		issue.user ? { login: issue.user.login, avatar_url: issue.user.avatar_url } : null,
		...(comments || []).map((c) =>
			c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null,
		),
	]);

	return (
		<>
			<TrackView
				type="issue"
				url={`/${owner}/${repo}/issues/${issueNumber}`}
				title={issue.title}
				subtitle={`${owner}/${repo}`}
				number={issueNumber}
				state={issue.state}
			/>
			<IssueDetailLayout
				header={
					<IssueHeader
						title={issue.title}
						number={issue.number}
						state={issue.state}
						author={issue.user}
						createdAt={issue.created_at}
						commentsCount={issue.comments}
						labels={(issue.labels || []).map((l) =>
							typeof l === "string"
								? { name: l }
								: {
										name: l.name,
										color:
											l.color ??
											undefined,
									},
						)}
						owner={owner}
						repo={repo}
						crossRefs={crossRefs}
						isPinned={issuePinned}
					/>
				}
				timeline={
					<IssueCommentsClient
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
						initialComments={commentsWithHtml}
						descriptionEntry={descriptionEntry}
					/>
				}
				commentForm={
					<IssueCommentForm
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
						issueState={issue.state}
						userAvatarUrl={
							(
								currentUser as {
									avatar_url?: string;
								} | null
							)?.avatar_url
						}
						userName={
							(currentUser as { login?: string } | null)
								?.login
						}
						participants={participants}
					/>
				}
				sidebar={
					<>
						<IssueSidebar
							assignees={(
								(
									issue as {
										assignees?: Array<{
											login: string;
											avatar_url: string;
										}>;
									}
								).assignees || []
							).map((a) => ({
								login: a.login,
								avatar_url: a.avatar_url,
							}))}
							labels={(issue.labels || []).map((l) =>
								typeof l === "string"
									? { name: l }
									: {
											name: l.name,
											color:
												l.color ??
												undefined,
										},
							)}
							milestone={
								issue.milestone
									? {
											title: (
												issue.milestone as {
													title: string;
												}
											).title,
											description:
												(
													issue.milestone as {
														description?:
															| string
															| null;
													}
												)
													.description ??
												null,
											open_issues:
												(
													issue.milestone as {
														open_issues?: number;
													}
												)
													.open_issues,
											closed_issues:
												(
													issue.milestone as {
														closed_issues?: number;
													}
												)
													.closed_issues,
										}
									: null
							}
							state={issue.state}
							stateReason={
								(
									issue as {
										state_reason?:
											| string
											| null;
									}
								).state_reason ?? null
							}
							createdAt={issue.created_at}
							updatedAt={
								(issue as { updated_at?: string })
									.updated_at
							}
							closedAt={
								(
									issue as {
										closed_at?:
											| string
											| null;
									}
								).closed_at ?? null
							}
							closedBy={
								(
									issue as {
										closed_by?: {
											login: string;
											avatar_url: string;
										} | null;
									}
								).closed_by ?? null
							}
							locked={
								(issue as { locked?: boolean })
									.locked ?? false
							}
							activeLockReason={
								(
									issue as {
										active_lock_reason?:
											| string
											| null;
									}
								).active_lock_reason ?? null
							}
							crossRefs={crossRefs}
							owner={owner}
							repo={repo}
						/>
						<IssueParticipants participants={participants} />
					</>
				}
			/>
			<ChatPageActivator
				config={{
					chatType: "issue",
					contextKey: `${owner}/${repo}#i${issueNumber}`,
					contextBody: {
						issueContext: {
							owner,
							repo,
							issueNumber,
							title: issue.title,
							body: issue.body ?? null,
							labels: issueLabels,
							state: issue.state,
							comments: issueComments,
						},
					},
					suggestions: [
						"Summarize this issue",
						"Suggest a fix",
						"Draft a response",
						"Create a PR to fix this",
					],
					placeholder: "Ask Ghost about this issue...",
					emptyTitle: "Ghost",
					emptyDescription:
						"Create a prompt request, get help drafting responses, or have Ghost fix this issue",
					repoFileSearch: repoData
						? { owner, repo, ref: repoData.default_branch }
						: undefined,
				}}
			/>
		</>
	);
}
