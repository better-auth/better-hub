import type { Metadata } from "next";
import { getDiscussion, getDiscussionComments, getAuthenticatedUser, getRepo } from "@/lib/github";
import { extractParticipants } from "@/lib/github-utils";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { DiscussionHeader } from "@/components/discussion/discussion-header";
import { IssueDetailLayout } from "@/components/issue/issue-detail-layout";
import { DiscussionCommentsClient } from "@/components/discussion/discussion-comments-client";
import { DiscussionCommentForm } from "@/components/discussion/discussion-comment-form";
import { DiscussionSidebar } from "@/components/discussion/discussion-sidebar";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
}): Promise<Metadata> {
	const { owner, repo, number: numStr } = await params;
	const discussionNumber = parseInt(numStr, 10);

	const repoData = await getRepo(owner, repo);
	const isPrivate = !repoData || repoData.private === true;

	if (isPrivate) {
		return { title: `Discussion #${discussionNumber} · ${owner}/${repo}` };
	}

	const discussion = await getDiscussion(owner, repo, discussionNumber);

	if (!discussion) {
		return { title: `Discussion #${discussionNumber} · ${owner}/${repo}` };
	}

	return {
		title: `${discussion.title} · Discussion #${discussionNumber} · ${owner}/${repo}`,
	};
}

export default async function DiscussionDetailPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
}) {
	const { owner, repo, number: numStr } = await params;
	const discussionNumber = parseInt(numStr, 10);

	const [discussion, rawComments, currentUser] = await Promise.all([
		getDiscussion(owner, repo, discussionNumber),
		getDiscussionComments(owner, repo, discussionNumber),
		getAuthenticatedUser(),
	]);

	if (!discussion) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Discussion not found
				</p>
			</div>
		);
	}

	// Pre-render all markdown in a single flattened Promise.all
	const refCtx = { owner, repo };
	const allMarkdownPromises: Promise<string>[] = [];

	// Description body
	allMarkdownPromises.push(
		discussion.body
			? renderMarkdownToHtml(discussion.body, undefined, refCtx)
			: Promise.resolve(""),
	);

	// Comments and their replies
	const commentBodyIndices: number[] = [];
	const replyIndicesMap: { commentIdx: number; replyIndices: number[] }[] = [];

	for (const comment of rawComments) {
		const idx = allMarkdownPromises.length;
		commentBodyIndices.push(idx);
		allMarkdownPromises.push(
			comment.body
				? renderMarkdownToHtml(comment.body, undefined, refCtx)
				: Promise.resolve(""),
		);

		const replyIndices: number[] = [];
		for (const reply of comment.replies) {
			const ridx = allMarkdownPromises.length;
			replyIndices.push(ridx);
			allMarkdownPromises.push(
				reply.body
					? renderMarkdownToHtml(reply.body, undefined, refCtx)
					: Promise.resolve(""),
			);
		}
		replyIndicesMap.push({ commentIdx: idx, replyIndices });
	}

	const htmlResults = await Promise.all(allMarkdownPromises);

	const descriptionHtml = htmlResults[0];

	// Build comments with pre-rendered HTML
	const commentsWithHtml = rawComments.map((c, ci) => ({
		...c,
		bodyHtml: htmlResults[commentBodyIndices[ci]],
		replies: c.replies.map((r, ri) => ({
			...r,
			bodyHtml: htmlResults[replyIndicesMap[ci].replyIndices[ri]],
		})),
	}));

	const descriptionEntry = {
		body: discussion.body || "",
		bodyHtml: descriptionHtml,
		author: discussion.author,
		createdAt: discussion.createdAt,
	};

	// Extract participants
	const participants = extractParticipants([
		discussion.author
			? {
					login: discussion.author.login,
					avatar_url: discussion.author.avatar_url,
				}
			: null,
		...rawComments.map((c) =>
			c.author
				? { login: c.author.login, avatar_url: c.author.avatar_url }
				: null,
		),
		...rawComments.flatMap((c) =>
			c.replies.map((r) =>
				r.author
					? { login: r.author.login, avatar_url: r.author.avatar_url }
					: null,
			),
		),
	]);

	return (
		<IssueDetailLayout
			header={
				<DiscussionHeader
					title={discussion.title}
					number={discussion.number}
					category={discussion.category}
					isAnswered={discussion.isAnswered}
					upvoteCount={discussion.upvoteCount}
					author={discussion.author}
					createdAt={discussion.createdAt}
					commentsCount={discussion.commentsCount}
					labels={(discussion.labels || []).map((l) => ({
						name: l.name,
						color: l.color ?? undefined,
					}))}
				/>
			}
			timeline={
				<DiscussionCommentsClient
					owner={owner}
					repo={repo}
					discussionNumber={discussionNumber}
					initialComments={commentsWithHtml}
					descriptionEntry={descriptionEntry}
				/>
			}
			commentForm={
				<DiscussionCommentForm
					owner={owner}
					repo={repo}
					discussionNumber={discussionNumber}
					discussionId={discussion.id}
					userAvatarUrl={
						(currentUser as { avatar_url?: string } | null)
							?.avatar_url
					}
					userName={(currentUser as { login?: string } | null)?.login}
					participants={participants}
				/>
			}
			sidebar={
				<DiscussionSidebar
					category={discussion.category}
					labels={(discussion.labels || []).map((l) => ({
						name: l.name,
						color: l.color ?? undefined,
					}))}
					isAnswered={discussion.isAnswered}
					answerChosenAt={discussion.answerChosenAt}
					createdAt={discussion.createdAt}
					updatedAt={discussion.updatedAt}
				/>
			}
		/>
	);
}
