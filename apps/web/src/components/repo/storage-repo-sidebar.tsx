import Link from "next/link";
import { HardDrive } from "lucide-react";
import { RepoBreadcrumb } from "@/components/repo/repo-breadcrumb";
import { RepoBadge } from "@/components/repo/repo-badge";

export function StorageRepoSidebar({
	owner,
	repoName,
	description,
	visibility,
	defaultBranch,
	repoBasePath,
}: {
	owner: string;
	repoName: string;
	description: string | null;
	visibility: "public" | "private";
	defaultBranch: string;
	repoBasePath: string;
}) {
	const badges = [
		{ type: visibility === "private" ? ("private" as const) : ("public" as const) },
	];

	return (
		<aside className="hidden lg:flex shrink-0 overflow-y-auto pt-0 pr-2 pl-4 pb-4 flex-col gap-5">
			<div className="flex flex-col gap-2">
				<RepoBreadcrumb
					owner={owner}
					repoName={repoName}
					ownerType="User"
					repoBasePath={repoBasePath}
				/>
				<div className="w-32 aspect-square rounded-lg border border-border bg-muted/40 flex items-center justify-center">
					<HardDrive
						className="w-10 h-10 text-muted-foreground/50"
						aria-hidden
					/>
				</div>
				{description ? (
					<p className="text-xs text-muted-foreground leading-relaxed">
						{description}
					</p>
				) : null}
				<div className="flex flex-wrap gap-1.5">
					{badges.map((b, i) => (
						<RepoBadge key={i} type={b.type} style="dashed" />
					))}
				</div>
				<p className="text-[11px] text-muted-foreground/60 font-mono">
					Better Hub{" "}
					<Link
						href={repoBasePath}
						className="hover:text-foreground transition-colors"
					>
						git storage
					</Link>
				</p>
			</div>

			<div className="flex flex-col gap-2">
				<span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/70">
					Info
				</span>
				<div className="flex flex-col gap-1.5">
					<div className="flex items-center justify-between text-xs">
						<span className="text-muted-foreground/70">
							Default branch
						</span>
						<span className="font-mono text-muted-foreground">
							{defaultBranch}
						</span>
					</div>
				</div>
			</div>
		</aside>
	);
}
