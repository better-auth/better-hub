import Link from "next/link";
import { RepoSidebarIdentity } from "@/components/repo/repo-sidebar-identity";

export function StorageRepoSidebar({
	owner,
	repoName,
	ownerType,
	ownerAvatarUrl,
	description,
	visibility,
	defaultBranch,
	repoBasePath,
}: {
	owner: string;
	repoName: string;
	ownerType: string;
	ownerAvatarUrl: string;
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
			<RepoSidebarIdentity
				owner={owner}
				repoName={repoName}
				ownerType={ownerType}
				ownerAvatarUrl={ownerAvatarUrl}
				description={description}
				badges={badges}
				repoBasePath={repoBasePath}
			>
				<p className="text-[11px] text-muted-foreground/60 font-mono">
					Better Hub{" "}
					<Link
						href={repoBasePath}
						className="hover:text-foreground transition-colors"
					>
						git storage
					</Link>
				</p>
			</RepoSidebarIdentity>

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
