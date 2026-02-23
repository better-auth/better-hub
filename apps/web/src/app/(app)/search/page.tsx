import type { Metadata } from "next";
import { SearchContent } from "@/components/search/search-content";

export const metadata: Metadata = {
	title: "Search",
};

export default async function SearchPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; lang?: string; page?: string; type?: string }>;
}) {
	const params = await searchParams;
	return (
		<SearchContent
			initialQuery={params.q || ""}
			initialLanguage={params.lang || ""}
			initialPage={Number(params.page) || 1}
			initialType={
				(params.type as "code" | "repos" | "issues" | "prs" | "users") ||
				"code"
			}
		/>
	);
}
