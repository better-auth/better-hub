import type { Metadata } from "next";
import {
	getIssue,
	getIssueComments,
	getRepo,
	getLinkedPullRequests,
	getAuthenticatedUser,
} from "@/lib/github";
import { extractParticipants } from "@/lib/github-utils";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { IssueHeader } from "@/components/issue/issue-header";
import { IssueDetailLayout } from "@/components/issue/issue-detail-layout";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import { IssueConversation, type IssueTimelineEntry } from "@/components/issue/issue-conversation";
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
	const issue = await getIssue(owner, repo, issueNumber);

	if (!issue) {
		return { title: `Issue #${issueNumber} · ${owner}/${repo}` };
	}

	return {
		title: `${issue.title} · Issue #${issueNumber} · ${owner}/${repo}`,
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
	const [issue, rawComments, repoData, linkedPRs, currentUser, session] = await Promise.all([
		getIssue(owner, repo, issueNumber),
		getIssueComments(owner, repo, issueNumber),
		getRepo(owner, repo),
		getLinkedPullRequests(owner, repo, issueNumber),
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
						linkedPRs={linkedPRs}
						isPinned={issuePinned}
					/>
				}
				description={
					<IssueConversation
						entries={[descriptionEntry]}
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
					/>
				}
				panelHeader={<IssueParticipants participants={participants} />}
				conversationPanel={
					<IssueCommentsClient
						owner={owner}
						repo={repo}
						issueNumber={issueNumber}
						initialComments={commentsWithHtml}
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
						milestone={
							(
								issue.milestone as {
									title?: string;
								} | null
							)?.title ?? null
						}
					/>
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
						"Create a prompt request for this issue",
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
