import type { Metadata } from "next";
import { getAuthenticatedUser, searchIssues } from "@/lib/github";
import { PRsContent } from "@/components/prs/prs-content";

export const metadata: Metadata = {
	title: "Pull Requests",
};

export default async function PullsPage() {
	const user = await getAuthenticatedUser();
	if (!user) return null;

	const [reviewRequested, assigned, created, mentioned, involved] = await Promise.all([
		searchIssues(
			`is:pr is:open archived:false user-review-requested:${user.login}`,
			50,
		),
		searchIssues(`is:pr is:open archived:false assignee:${user.login}`, 50),
		searchIssues(`is:pr is:open archived:false author:${user.login}`, 50),
		searchIssues(`is:pr is:open archived:false mentions:${user.login}`, 50),
		searchIssues(
			`is:pr is:open archived:false involves:${user.login} -author:${user.login}`,
			50,
		),
	]);

	return (
		<PRsContent
			reviewRequested={reviewRequested}
			assigned={assigned}
			created={created}
			mentioned={mentioned}
			// involved={involved}
			username={user.login}
		/>
	);
}
