"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Loader2 } from "lucide-react";

export default function NewPRSlugRedirect() {
	const params = useParams<{ owner: string; repo: string; sub: string[] }>();
	const router = useRouter();

	useEffect(() => {
		const head = params.sub?.join("/");
		router.replace(
			`/repos/${params.owner}/${params.repo}/pulls/new${head ? `?head=${encodeURIComponent(head)}` : ""}`,
		);
	}, [params, router]);

	return (
		<div className="flex items-center justify-center py-24">
			<Loader2 className="w-5 h-5 animate-spin text-muted-foreground/40" />
		</div>
	);
}
