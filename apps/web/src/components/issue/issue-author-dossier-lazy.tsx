"use client";

import { useEffect, useState } from "react";

import { fetchIssueAuthorDossier } from "@/app/(app)/repos/[owner]/[repo]/issues/issue-actions";

import { IssueAuthorDossier, type IssueAuthorDossierResult } from "./issue-author-dossier";

const CLIENT_TIMEOUT_MS = 12_000;

export function IssueAuthorDossierLazy({
	owner,
	repo,
	authorLogin,
	openedAt,
}: {
	owner: string;
	repo: string;
	authorLogin: string;
	openedAt: string;
}) {
	const [data, setData] = useState<IssueAuthorDossierResult | null>(null);
	const [loaded, setLoaded] = useState(false);

	useEffect(() => {
		let cancelled = false;

		const timeout = setTimeout(() => {
			if (!cancelled) setLoaded(true);
		}, CLIENT_TIMEOUT_MS);

		fetchIssueAuthorDossier(owner, repo, authorLogin).then(
			(result) => {
				clearTimeout(timeout);
				if (!cancelled) {
					setData(result);
					setLoaded(true);
				}
			},
			() => {
				clearTimeout(timeout);
				if (!cancelled) setLoaded(true);
			},
		);

		return () => {
			cancelled = true;
			clearTimeout(timeout);
		};
	}, [owner, repo, authorLogin]);

	if (!loaded) {
		return (
			<div className="mb-1 animate-pulse">
				<div className="flex items-center gap-2 px-1 py-1.5">
					<div className="w-5 h-5 rounded-full bg-muted-foreground/15 shrink-0" />
					<div className="h-3 w-24 rounded bg-muted-foreground/10" />
				</div>
				<div className="px-1 py-1.5 space-y-2">
					<div className="flex items-start gap-3">
						<div className="w-9 h-9 rounded-full bg-muted-foreground/10 shrink-0" />
						<div className="flex-1 space-y-1.5">
							<div className="h-2.5 w-full rounded bg-muted-foreground/8" />
							<div className="h-2.5 w-3/4 rounded bg-muted-foreground/8" />
						</div>
					</div>
					<div className="flex gap-3">
						<div className="h-2.5 w-16 rounded bg-muted-foreground/8" />
						<div className="h-2.5 w-12 rounded bg-muted-foreground/8" />
						<div className="h-2.5 w-10 rounded bg-muted-foreground/8" />
					</div>
				</div>
			</div>
		);
	}

	if (!data) return null;

	return (
		<IssueAuthorDossier
			author={data.author}
			orgs={data.orgs}
			topRepos={data.topRepos}
			isOrgMember={data.isOrgMember}
			score={data.score}
			contributionCount={data.contributionCount}
			repoActivity={data.repoActivity}
			openedAt={openedAt}
		/>
	);
}
