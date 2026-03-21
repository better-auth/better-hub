import type { Metadata } from "next";
import { getUserOrgs } from "@/lib/github";
import { OrgsContent, type OrgListItem } from "@/components/orgs/orgs-content";
import { GITHUB_WEB_URL } from "@/lib/github-config";

export const metadata: Metadata = {
	title: "Organizations",
};

export default async function OrgsPage() {
	const orgsResponse = await getUserOrgs(50);

	const orgs: OrgListItem[] = orgsResponse.map((org) => ({
		id: org.id,
		login: org.login,
		avatar_url: org.avatar_url,
		description: org.description,
		html_url: `${GITHUB_WEB_URL}/${org.login}`,
	}));

	orgs.sort((a, b) => a.login.localeCompare(b.login));

	return <OrgsContent orgs={orgs} />;
}
