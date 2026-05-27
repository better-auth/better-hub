"use client";

import {
	PRAuthorDossier,
	type AuthorDossierData,
	type RepoActivity,
} from "@/components/pr/pr-author-dossier";
import type { ScoreResult } from "@/lib/contributor-score";

export interface IssueAuthorDossierResult {
	author: AuthorDossierData;
	orgs: { login: string; avatar_url: string }[];
	topRepos: {
		name: string;
		full_name: string;
		stargazers_count: number;
		language: string | null;
	}[];
	isOrgMember?: boolean;
	score?: ScoreResult | null;
	contributionCount?: number;
	repoActivity?: RepoActivity;
	openedAt?: string;
}

export function IssueAuthorDossier(props: IssueAuthorDossierResult) {
	return <PRAuthorDossier {...props} />;
}
