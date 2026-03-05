import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGist } from "@/lib/github";
import { GistNav } from "@/components/gist/gist-nav";
import { GistHeader } from "@/components/gist/gist-header";
import { ogImageUrl, ogImages } from "@/lib/og/og-utils";

export async function generateMetadata({
	params,
}: {
	params: Promise<{ owner: string; gistId: string }>;
}): Promise<Metadata> {
	const { gistId } = await params;
	const gist = await getGist(gistId).catch(() => null);

	if (!gist) {
		return { title: "Gist Not Found" };
	}

	const title = gist.description || Object.values(gist.files)[0]?.filename || "Untitled Gist";
	const firstFile = Object.values(gist.files)[0];

	return {
		title: `${title} - Gist by ${gist.owner.login}`,
		description: `Gist created by ${gist.owner.login}${firstFile ? ` - ${firstFile.filename}` : ""}`,
		openGraph: {
			title: `${title} - Gist`,
			...ogImages(ogImageUrl({ type: "owner", owner: gist.owner.login })),
		},
		twitter: {
			card: "summary_large_image",
			...ogImages(ogImageUrl({ type: "owner", owner: gist.owner.login })),
		},
	};
}

export default async function GistLayout({
	children,
	params,
}: {
	children: React.ReactNode;
	params: Promise<{ owner: string; gistId: string }>;
}) {
	const { owner, gistId } = await params;
	const gist = await getGist(gistId).catch(() => null);

	if (!gist) {
		notFound();
	}

	const fileCount = Object.keys(gist.files).length;

	return (
		<div className="space-y-4 pb-4">
			<header className="border-b border-border pb-4">
				<GistHeader gist={gist} />
				<div className="mt-4">
					<GistNav
						owner={owner}
						gistId={gistId}
						fileCount={fileCount}
						revisionCount={gist.history.length}
						commentCount={gist.comments}
					/>
				</div>
			</header>
			{children}
		</div>
	);
}
