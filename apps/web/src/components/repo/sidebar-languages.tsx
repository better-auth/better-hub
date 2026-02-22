"use client";

import { useQuery } from "@tanstack/react-query";
import { revalidateLanguages } from "@/app/(app)/repos/[owner]/[repo]/readme-actions";

const LANG_COLORS: Record<string, string> = {
	JavaScript: "#f1e05a",
	TypeScript: "#3178c6",
	Python: "#3572A5",
	Java: "#b07219",
	Go: "#00ADD8",
	Rust: "#dea584",
	Ruby: "#701516",
	PHP: "#4F5D95",
	"C++": "#f34b7d",
	C: "#555555",
	"C#": "#178600",
	Swift: "#F05138",
	Kotlin: "#A97BFF",
	Dart: "#00B4AB",
	Shell: "#89e051",
	HTML: "#e34c26",
	CSS: "#563d7c",
	SCSS: "#c6538c",
	Vue: "#41b883",
	Svelte: "#ff3e00",
};

export function SidebarLanguages({
	owner,
	repo,
	initialLanguages,
}: {
	owner: string;
	repo: string;
	initialLanguages: Record<string, number> | null;
}) {
	const { data: languages, isLoading } = useQuery({
		queryKey: ["repo-languages", owner, repo],
		queryFn: () => revalidateLanguages(owner, repo),
		initialData: initialLanguages ?? undefined,
		staleTime: Infinity,
		gcTime: Infinity,
		refetchOnMount: "always",
	});

	if (isLoading) {
		return (
			<div className="flex flex-col gap-2">
				<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
					Languages
				</span>
				<div className="animate-pulse space-y-2">
					<div className="flex h-2 rounded-sm overflow-hidden gap-[2px]">
						<div className="h-full flex-3 bg-muted/40 rounded-sm" />
						<div className="h-full flex-2 bg-muted/30 rounded-sm" />
						<div className="h-full flex-1 bg-muted/20 rounded-sm" />
					</div>
					<div className="space-y-1.5">
						<div className="h-3 w-20 bg-muted/30 rounded" />
						<div className="h-3 w-16 bg-muted/20 rounded" />
					</div>
				</div>
			</div>
		);
	}

	if (!languages || Object.keys(languages).length === 0) return null;

	const entries = Object.entries(languages).sort((a, b) => b[1] - a[1]);
	const totalBytes = entries.reduce((sum, [, bytes]) => sum + bytes, 0);
	const top5 = entries.slice(0, 5);
	const otherBytes = entries.slice(5).reduce((sum, [, bytes]) => sum + bytes, 0);
	const display =
		otherBytes > 0 ? [...top5, ["Other", otherBytes] as [string, number]] : top5;

	return (
		<div className="flex flex-col gap-2">
			<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
				Languages
			</span>
			<div className="flex h-2 rounded-sm overflow-hidden">
				{display.map(([lang, bytes]) => (
					<div
						key={lang}
						className="h-full"
						style={{
							width: `${(bytes / totalBytes) * 100}%`,
							backgroundColor:
								LANG_COLORS[lang] ?? "#6b7280",
						}}
					/>
				))}
			</div>
			<div className="flex flex-col gap-1">
				{display.map(([lang, bytes]) => {
					const pct = ((bytes / totalBytes) * 100).toFixed(1);
					return (
						<div
							key={lang}
							className="flex items-center gap-1.5 text-xs"
						>
							<span
								className="w-2 h-2 rounded-full shrink-0"
								style={{
									backgroundColor:
										LANG_COLORS[lang] ??
										"#6b7280",
								}}
							/>
							<span className="font-mono text-muted-foreground/80 text-[11px]">
								{lang}
							</span>
							<span className="font-mono text-muted-foreground/50 ml-auto tabular-nums text-[10px]">
								{pct}%
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
