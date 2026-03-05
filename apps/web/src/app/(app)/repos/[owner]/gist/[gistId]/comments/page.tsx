import { notFound } from "next/navigation";
import { getGist, getGistComments } from "@/lib/github";
import { GistComments } from "@/components/gist/gist-comments";

export default async function GistCommentsPage({
	params,
}: {
	params: Promise<{ owner: string; gistId: string }>;
}) {
	const { gistId } = await params;
	const [gist, comments] = await Promise.all([
		getGist(gistId).catch(() => null),
		getGistComments(gistId).catch(() => []),
	]);

	if (!gist) {
		notFound();
	}

	return <GistComments gist={gist} comments={comments} />;
}
