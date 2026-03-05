import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getGist } from "@/lib/github";
import { GistDetailContent } from "@/components/gist/gist-detail-content";
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

export default async function OwnerGistPage({
	params,
}: {
	params: Promise<{ owner: string; gistId: string }>;
}) {
	const { gistId } = await params;
	const gist = await getGist(gistId).catch(() => null);

	if (!gist) {
		notFound();
	}

	return <GistDetailContent gist={gist} />;
}
