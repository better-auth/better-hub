import type { Metadata } from "next";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `New Pull Request · ${owner}/${repo}` };
}

export default function NewPullRequestLayout({ children }: { children: React.ReactNode }) {
	return children;
}
