import { notFound } from "next/navigation";
import { getGist } from "@/lib/github";
import { GistRevisions } from "@/components/gist/gist-revisions";

export default async function GistRevisionsPage({
	params,
}: {
	params: Promise<{ owner: string; gistId: string }>;
}) {
	const { gistId } = await params;
	const gist = await getGist(gistId).catch(() => null);

	if (!gist) {
		notFound();
	}

	return <GistRevisions gist={gist} />;
}
