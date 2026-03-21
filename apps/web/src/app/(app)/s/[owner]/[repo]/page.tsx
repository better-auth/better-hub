import type { Metadata } from "next";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; repo: string }>;
}): Promise<Metadata> {
	const { owner, repo } = await params;
	return { title: `${owner}/${repo}` };
}

export default async function StorageRepoOverviewPage() {
	return (
		<div className="pl-4 pr-4 py-8">
			<p className="text-xs text-muted-foreground font-mono text-center border border-dashed border-border/60 rounded-md py-16">
				Overview — coming soon.
			</p>
		</div>
	);
}
