import type { Metadata } from "next";
import {
	getPullRequestBundle,
	getPullRequestFiles,
	getRepo,
	getAuthenticatedUser,
	extractRepoPermissions,
	getOctokit,
	fetchCheckStatusForRef,
	getCachedCheckStatus,
	getAuthorDossier,
	isBranchBehindBase,
	type CheckStatus,
	type AuthorDossierResult,
	getCrossReferences,
} from "@/lib/github";
import { ogImageUrl, ogImages } from "@/lib/og/og-utils";
import { extractParticipants } from "@/lib/github-utils";
import { highlightDiffLines, type SyntaxToken } from "@/lib/shiki";
import { PRHeader } from "@/components/pr/pr-header";
import { PRDiffViewer } from "@/components/pr/pr-diff-viewer";
import { PRDetailLayout } from "@/components/pr/pr-detail-layout";
import {
	PRConversation,
	type TimelineEntry,
	type ReviewCommentEntry,
	type CommitEntry,
	type StateChangeEntry,
	type CrossReferenceEntry,
} from "@/components/pr/pr-conversation";
import { PRMergePanel } from "@/components/pr/pr-merge-panel";
import { PRCommentForm } from "@/components/pr/pr-comment-form";
import { PRReviewForm } from "@/components/pr/pr-review-form";
import { PRConflictResolver } from "@/components/pr/pr-conflict-resolver";
import { PRAuthorDossier } from "@/components/pr/pr-author-dossier";
import { PRChecksPanel } from "@/components/pr/pr-checks-panel";
import { ChatPageActivator } from "@/components/shared/chat-page-activator";
import { TrackView } from "@/components/shared/track-view";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { inngest } from "@/lib/inngest";
import { isItemPinned } from "@/lib/pinned-items-store";
import { all } from "better-all";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
}): Promise<Metadata> {
	const { owner, repo, number: numStr } = await params;
	const pullNumber = parseInt(numStr, 10);

	const repoData = await getRepo(owner, repo);
	const isPrivate = !repoData || repoData.private === true;

	if (isPrivate) {
		return { title: `PR #${pullNumber} · ${owner}/${repo}` };
	}

	const bundle = await getPullRequestBundle(owner, repo, pullNumber);
	const ogUrl = ogImageUrl({ type: "pr", owner, repo, number: pullNumber });

	if (!bundle) {
		return { title: `PR #${pullNumber} · ${owner}/${repo}` };
	}

	return {
		title: `${bundle.pr.title} · PR #${pullNumber} · ${owner}/${repo}`,
		description: bundle.pr.body
			? bundle.pr.body.slice(0, 200)
			: `Pull request #${pullNumber} on ${owner}/${repo}`,
		openGraph: { title: `${bundle.pr.title} · PR #${pullNumber}`, ...ogImages(ogUrl) },
		twitter: { card: "summary_large_image", ...ogImages(ogUrl) },
	};
}

type GitHubPRFile = {
	filename: string;
	status: string;
	additions: number;
	deletions: number;
	patch?: string;
	previous_filename?: string;
};
type RepoWithMergeSettings = {
	allow_merge_commit?: boolean;
	allow_squash_merge?: boolean;
	allow_rebase_merge?: boolean;
};

export default async function PRDetailPage({
	params,
	searchParams,
}: {
	params: Promise<{ owner: string; repo: string; number: string }>;
	searchParams: Promise<{ resolve?: string }>;
}) {
	const { owner, repo, number: numStr } = await params;
	const sp = await searchParams;
	const pullNumber = parseInt(numStr, 10);

	const { bundle, files, repoData, currentUser, session, crossRefs } = await all({
		bundle: () => getPullRequestBundle(owner, repo, pullNumber),
		files: () => getPullRequestFiles(owner, repo, pullNumber),
		repoData: () => getRepo(owner, repo),
		currentUser: () => getAuthenticatedUser(),
		session: async () => auth.api.getSession({ headers: await headers() }),
		crossRefs: () => getCrossReferences(owner, repo, pullNumber),
	});

	if (!bundle) {
		return (
			<div className="py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Pull request not found
				</p>
			</div>
		);
	}

	const {
		pr,
		issueComments,
		reviewComments,
		reviews,
		reviewThreads: threads,
		commits,
		stateEvents,
	} = bundle;
	const comments = { issueComments, reviewComments };

	const permissions = extractRepoPermissions(repoData ?? {});
	const canWrite = permissions.push || permissions.admin || permissions.maintain;
	const canTriage = canWrite || permissions.triage;
	const isOpen = pr.state === "open" && !pr.merged_at;

	// Start highlighting in parallel with second batch
	const prFiles = (files ?? []) as GitHubPRFile[];
	const highlightPromise = (async () => {
		const data: Record<string, Record<string, SyntaxToken[]>> = {};
		if (prFiles.length > 0) {
			await Promise.all(
				prFiles.map(async (file) => {
					if (file.patch) {
						try {
							data[file.filename] =
								await highlightDiffLines(
									file.patch,
									file.filename,
								);
						} catch {
							// highlight error — skip file
						}
					}
				}),
			);
		}
		return data;
	})();

	const {
		checkStatus: checkStatusResult,
		prPinned,
		authorDossier,
		branchBehindBase,
	} = await all({
		checkStatus: async () => {
			if (!isOpen) return undefined;
			const cached = await getCachedCheckStatus(owner, repo, pullNumber);
			if (cached) return cached;
			try {
				const octokit = await getOctokit();
				const cs = await fetchCheckStatusForRef(
					octokit,
					owner,
					repo,
					pr.head.sha,
				);
				return cs ?? undefined;
			} catch {
				return undefined;
			}
		},
		prPinned: () =>
			session?.user?.id
				? isItemPinned(
						session.user.id,
						owner,
						repo,
						`/${owner}/${repo}/pulls/${pullNumber}`,
					)
				: Promise.resolve(false),
		authorDossier: () =>
			pr.user?.login
				? getAuthorDossier(owner, repo, pr.user.login).catch(() => null)
				: Promise.resolve(null),
		branchBehindBase: () =>
			isOpen
				? isBranchBehindBase(
						owner,
						repo,
						pr.base.ref,
						pr.head.ref,
						(pr as { head_repo_owner?: string | null })
							.head_repo_owner,
					)
				: Promise.resolve(false),
	});

	const checkStatus = checkStatusResult as CheckStatus | undefined;
	const dossier = authorDossier as AuthorDossierResult | null;

	// Fire-and-forget: embed PR content for semantic search
	if (session?.user?.id) {
		void inngest.send({
			name: "app/content.viewed",
			data: {
				userId: session.user.id,
				contentType: "pr",
				owner,
				repo,
				number: pullNumber,
				title: pr.title,
				body: pr.body ?? "",
				comments: comments.issueComments
					.filter((c) => c.body)
					.map((c) => ({
						id: c.id,
						body: c.body,
						author: c.user?.login ?? "unknown",
						createdAt: c.created_at,
					})),
				reviews: reviews
					.filter((r) => r.body)
					.map((r) => ({
						id: r.id,
						body: r.body!,
						author: r.user?.login ?? "unknown",
						state: r.state,
						createdAt: r.submitted_at ?? "",
					})),
			},
		});
	}

	// Group review comments by pull_request_review_id
	const reviewCommentsByReviewId = new Map<number, ReviewCommentEntry[]>();
	for (const rc of comments.reviewComments) {
		const reviewId = rc.pull_request_review_id;
		if (reviewId) {
			const existing = reviewCommentsByReviewId.get(reviewId) || [];
			existing.push({
				id: rc.id,
				user: rc.user
					? { login: rc.user.login, avatar_url: rc.user.avatar_url }
					: null,
				body: rc.body || "",
				path: rc.path || "",
				line: rc.line,
				diff_hunk: rc.diff_hunk,
				created_at: rc.created_at,
				reactions: rc.reactions,
			});
			reviewCommentsByReviewId.set(reviewId, existing);
		}
	}

	// Build unified timeline
	const timeline: TimelineEntry[] = [];

	timeline.push({
		type: "description",
		id: `pr-body-${pr.number}`,
		user: pr.user ? { login: pr.user.login, avatar_url: pr.user.avatar_url } : null,
		body: pr.body || "",
		created_at: pr.created_at,
		reactions: pr.reactions ?? undefined,
	});

	for (const c of comments.issueComments) {
		timeline.push({
			type: "comment",
			id: c.id,
			user: c.user
				? {
						login: c.user.login,
						avatar_url: c.user.avatar_url,
						type: c.user.type,
					}
				: null,
			body: c.body || "",
			created_at: c.created_at,
			author_association: c.author_association,
			reactions: c.reactions ?? undefined,
		});
	}

	for (const r of reviews) {
		timeline.push({
			type: "review",
			id: r.id,
			user: r.user
				? {
						login: r.user.login,
						avatar_url: r.user.avatar_url,
						type: r.user.type,
					}
				: null,
			body: r.body || null,
			state: r.state,
			created_at: r.created_at || r.submitted_at || "",
			submitted_at: r.submitted_at || null,
			comments: reviewCommentsByReviewId.get(r.id) || [],
		});
	}

	for (const c of commits) {
		const entry: CommitEntry = {
			type: "commit",
			id: c.sha,
			sha: c.sha,
			message: c.commit?.message || "",
			user: c.author
				? { login: c.author.login, avatar_url: c.author.avatar_url }
				: null,
			committer_name: c.commit?.author?.name || c.commit?.committer?.name || null,
			created_at: c.commit?.author?.date || c.commit?.committer?.date || "",
		};
		timeline.push(entry);
	}

	for (const s of stateEvents) {
		const entry: StateChangeEntry = {
			type: "state_change",
			id: s.id,
			event: s.event,
			user: s.actor,
			created_at: s.created_at,
			merge_ref_name: s.merge_ref_name,
		};
		timeline.push(entry);
	}

	for (const ref of crossRefs) {
		const entry: CrossReferenceEntry = {
			type: "cross_reference",
			id: `xref-${ref.repoOwner}-${ref.repoName}-${ref.number}`,
			number: ref.number,
			title: ref.title,
			state: ref.state,
			merged: ref.merged,
			isPullRequest: ref.isPullRequest,
			user: ref.user,
			repoOwner: ref.repoOwner,
			repoName: ref.repoName,
			created_at: ref.created_at,
		};
		timeline.push(entry);
	}

	timeline.sort((a, b) => {
		if (a.type === "description") return -1;
		if (b.type === "description") return 1;
		const dateA = a.type === "review" ? a.submitted_at || a.created_at : a.created_at;
		const dateB = b.type === "review" ? b.submitted_at || b.created_at : b.created_at;
		return new Date(dateA).getTime() - new Date(dateB).getTime();
	});

	// Resolve highlighting (started in parallel with second batch above)
	const highlightData = await highlightPromise;

	const showConflictResolver = sp.resolve === "conflicts" && isOpen;
	const headSha = pr.head.sha;
	const headBranch = pr.head.ref;
	const baseSha = pr.base.sha;

	// Build review summaries for reviews panel
	const reviewSummaries = reviews.map((r) => ({
		id: r.id,
		user: r.user ? { login: r.user.login, avatar_url: r.user.avatar_url } : null,
		state: r.state,
		submitted_at: r.submitted_at || null,
	}));

	// Compute latest review state per user (for approval indicators)
	const latestReviewByUser = new Map<
		string,
		{ login: string; avatar_url: string; state: string }
	>();
	for (const r of reviews) {
		if (!r.user || r.state === "PENDING" || r.state === "COMMENTED") continue;
		latestReviewByUser.set(r.user.login, {
			login: r.user.login,
			avatar_url: r.user.avatar_url,
			state: r.state,
		});
	}
	const reviewStatuses = Array.from(latestReviewByUser.values());

	// Extract participants for @mention autocomplete
	const participants = extractParticipants([
		pr.user ? { login: pr.user.login, avatar_url: pr.user.avatar_url } : null,
		...comments.issueComments.map((c) =>
			c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null,
		),
		...comments.reviewComments.map((c) =>
			c.user ? { login: c.user.login, avatar_url: c.user.avatar_url } : null,
		),
		...reviews.map((r) =>
			r.user ? { login: r.user.login, avatar_url: r.user.avatar_url } : null,
		),
	]);

	return (
		<>
			<TrackView
				type="pr"
				url={`/${owner}/${repo}/pulls/${pullNumber}`}
				title={pr.title}
				subtitle={`${owner}/${repo}`}
				number={pullNumber}
				state={pr.merged_at ? "merged" : pr.state}
			/>
			<PRDetailLayout
				commentCount={comments.issueComments.length}
				fileCount={prFiles.length}
				hasReviews={reviews.some((r) => r.state !== "PENDING")}
				conflictPanel={
					showConflictResolver ? (
						<PRConflictResolver
							owner={owner}
							repo={repo}
							pullNumber={pullNumber}
							baseBranch={pr.base.ref}
							headBranch={pr.head.ref}
						/>
					) : undefined
				}
				infoBar={
					<>
						<PRHeader
							title={pr.title}
							number={pr.number}
							state={pr.state}
							merged={!!pr.merged_at}
							draft={pr.draft || false}
							author={pr.user}
							createdAt={pr.created_at}
							baseBranch={pr.base.ref}
							headBranch={pr.head.ref}
							additions={pr.additions}
							deletions={pr.deletions}
							changedFiles={pr.changed_files}
							labels={(pr.labels || []).map((l) =>
								typeof l === "string"
									? { name: l }
									: {
											...l,
											color:
												l.color ??
												undefined,
										},
							)}
							reviewStatuses={reviewStatuses}
							checkStatus={checkStatus}
							owner={owner}
							repo={repo}
							canEdit={
								canWrite ||
								pr.user?.login ===
									currentUser?.login
							}
							isPinned={prPinned}
							crossRefs={crossRefs}
							actions={
								<div className="flex items-center gap-2">
									{isOpen && (
										<PRReviewForm
											owner={
												owner
											}
											repo={repo}
											pullNumber={
												pr.number
											}
											participants={
												participants
											}
										/>
									)}
									<PRMergePanel
										owner={owner}
										repo={repo}
										pullNumber={
											pr.number
										}
										prTitle={pr.title}
										prBody={
											pr.body ||
											""
										}
										commitMessages={commits
											.map(
												(
													c,
												) =>
													c
														.commit
														?.message ||
													"",
											)
											.filter(
												Boolean,
											)}
										state={pr.state}
										merged={
											!!pr.merged_at
										}
										mergeable={
											pr.mergeable ??
											null
										}
										allowMergeCommit={
											(
												repoData as RepoWithMergeSettings | null
											)
												?.allow_merge_commit ??
											true
										}
										allowSquashMerge={
											(
												repoData as RepoWithMergeSettings | null
											)
												?.allow_squash_merge ??
											true
										}
										allowRebaseMerge={
											(
												repoData as RepoWithMergeSettings | null
											)
												?.allow_rebase_merge ??
											true
										}
										headBranch={
											pr.head.ref
										}
										baseBranch={
											pr.base.ref
										}
										draft={
											pr.draft ??
											false
										}
										canWrite={canWrite}
										canTriage={
											canTriage
										}
										isAuthor={
											currentUser?.login !=
												null &&
											pr.user
												?.login !=
												null &&
											currentUser.login ===
												pr
													.user
													.login
										}
										branchBehindBase={
											branchBehindBase ??
											false
										}
									/>
								</div>
							}
						/>
					</>
				}
				diffPanel={
					<PRDiffViewer
						files={prFiles}
						reviewComments={
							comments.reviewComments as unknown as Array<{
								id: number;
								user: {
									login: string;
									avatar_url: string;
								} | null;
								body: string;
								path: string;
								line: number | null;
								original_line: number | null;
								side: string | null;
								created_at: string;
							}>
						}
						reviewThreads={threads}
						reviewSummaries={reviewSummaries}
						commits={commits}
						owner={owner}
						repo={repo}
						pullNumber={pullNumber}
						headSha={headSha}
						headBranch={headBranch}
						baseSha={baseSha}
						canWrite={canWrite}
						highlightData={highlightData}
						participants={participants}
						checkStatus={checkStatus}
					/>
				}
				conversationPanel={
					<>
						{dossier && (
							<PRAuthorDossier
								author={dossier.author}
								orgs={dossier.orgs}
								topRepos={dossier.topRepos}
								isOrgMember={dossier.isOrgMember}
								score={dossier.score}
								contributionCount={
									dossier.contributionCount
								}
								repoActivity={dossier.repoActivity}
								openedAt={pr.created_at}
							/>
						)}
						<PRConversation
							entries={timeline}
							owner={owner}
							repo={repo}
							pullNumber={pullNumber}
							checkStatus={
								checkStatus && checkStatus.total > 0
									? checkStatus
									: undefined
							}
						/>
					</>
				}
				commentForm={
					<PRCommentForm
						owner={owner}
						repo={repo}
						pullNumber={pullNumber}
						userAvatarUrl={currentUser?.avatar_url}
						userName={currentUser?.login}
						participants={participants}
					/>
				}
			/>
			<ChatPageActivator
				config={{
					chatType: "pr",
					contextKey: `${owner}/${repo}#${pullNumber}`,
					contextBody: {
						prContext: {
							owner,
							repo,
							pullNumber,
							prTitle: pr.title,
							prBody: pr.body || "",
							baseBranch: pr.base.ref,
							headBranch: pr.head.ref,
							files: prFiles.map((f) => ({
								filename: f.filename,
								patch: f.patch || "",
							})),
						},
					},
					suggestions: [
						"Summarize this PR",
						"Any potential bugs?",
						"Suggest improvements",
						"Explain the changes",
					],
					placeholder: "Ask Ghost about this PR...",
					emptyTitle: "Ghost",
					emptyDescription:
						"Ask questions about changes, get explanations, or find potential issues",
					repoFileSearch: { owner, repo, ref: pr.head.ref },
				}}
			/>
		</>
	);
}
