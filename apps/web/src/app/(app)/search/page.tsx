import { Suspense } from "react";
import { SearchContent } from "@/components/search/search-content";

export default async function SearchPage({
	searchParams,
}: {
	searchParams: Promise<{ q?: string; lang?: string; page?: string; type?: string }>;
}) {
	const params = await searchParams;
	return (
		<Suspense fallback={<SearchSkeleton />}>
			<SearchContent
				initialQuery={params.q || ""}
				initialLanguage={params.lang || ""}
				initialPage={Number(params.page) || 1}
				initialType={
					(params.type as "code" | "repos" | "issues" | "prs" | "users") ||
					"code"
				}
			/>
		</Suspense>
	);
}

function SearchSkeleton() {
	return (
		<div className="flex flex-col flex-1 min-h-0 animate-pulse">
			<div className="shrink-0 mb-6">
				<div className="h-6 w-20 rounded bg-muted mb-4" />
				<div className="h-10 max-w-2xl rounded-md bg-muted" />
				<div className="flex items-center gap-1 mt-3 border-b border-border pb-2">
					{[0, 1, 2, 3, 4].map((i) => (
						<div key={i} className="h-6 w-16 rounded bg-muted" />
					))}
				</div>
			</div>
		</div>
	);
}
