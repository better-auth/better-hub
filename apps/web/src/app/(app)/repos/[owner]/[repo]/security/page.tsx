import type { Metadata } from "next";
import { ShieldAlert } from "lucide-react";
import { getRepoSecurityTabData, getFileContent } from "@/lib/github";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { SecurityView } from "@/components/security/security-view";

async function fetchSecurityPolicy(owner: string, repo: string): Promise<string | null> {
	const paths = ["SECURITY.md", ".github/SECURITY.md", "docs/SECURITY.md"];
	const results = await Promise.all(paths.map((path) => getFileContent(owner, repo, path)));
	const file = results.find((r) => r?.content);
	if (file?.content) {
		return renderMarkdownToHtml(file.content, {
			owner,
			repo,
			branch: "HEAD",
		});
	}
	return null;
}

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `Security · ${owner}/${repo}` };
}

export default async function SecurityPage({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}) {
	const { owner, repo } = await params;

	const [data, policyHtml] = await Promise.all([
		getRepoSecurityTabData(owner, repo),
		fetchSecurityPolicy(owner, repo),
	]);

	const hasSecurityAccess = !!data && (data.permissions.admin || data.permissions.maintain);

	if (!data) {
		return (
			<div className="py-16 text-center">
				<ShieldAlert className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
				<h2 className="text-sm font-medium text-muted-foreground/70">
					Security
				</h2>
				<p className="text-xs text-muted-foreground/50 font-mono mt-1">
					Sign in to GitHub to load security data
				</p>
			</div>
		);
	}

	return (
		<SecurityView
			owner={owner}
			repo={repo}
			advisories={data.reports.alerts}
			advisoriesError={data.reports.error}
			dependabot={data.dependabot}
			secretScanning={data.secretScanning}
			policyHtml={policyHtml}
			isOwner={hasSecurityAccess}
		/>
	);
}
