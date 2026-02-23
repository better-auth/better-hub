import type { Metadata } from "next";
import { getUserRepos } from "@/lib/github";
import { ReposContent } from "@/components/repos/repos-content";

export const metadata: Metadata = {
	title: "Repositories",
};

export default async function ReposPage() {
	const repos = await getUserRepos("updated", 50);
	return <ReposContent repos={repos} />;
}
