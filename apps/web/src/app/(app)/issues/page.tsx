import type { Metadata } from "next";
import { getAuthenticatedUser, searchIssues } from "@/lib/github";
import { IssuesContent } from "@/components/issues/issues-content";

export const metadata: Metadata = {
	title: "Issues",
};

export default async function IssuesPage() {
	const user = await getAuthenticatedUser();
	if (!user) return null;

	const [assigned, created, mentioned] = await Promise.all([
		searchIssues(`is:issue is:open assignee:${user.login}`, 30),
		searchIssues(`is:issue is:open author:${user.login}`, 30),
		searchIssues(`is:issue is:open mentions:${user.login}`, 20),
	]);

	return (
		<IssuesContent
			assigned={assigned}
			created={created}
			mentioned={mentioned}
			username={user.login}
		/>
	);
}
