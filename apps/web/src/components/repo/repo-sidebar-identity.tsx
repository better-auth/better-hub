import Image from "next/image";
import { RepoBreadcrumb } from "@/components/repo/repo-breadcrumb";
import { RepoBadge, type RepoBadgeProps } from "@/components/repo/repo-badge";

export function RepoSidebarIdentity({
	owner,
	repoName,
	ownerType,
	ownerAvatarUrl,
	description,
	badges,
	repoBasePath,
	children,
}: {
	owner: string;
	repoName: string;
	ownerType: string;
	ownerAvatarUrl: string;
	description: string | null;
	badges: Array<Pick<RepoBadgeProps, "type" | "href">>;
	repoBasePath?: string;
	children?: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-2">
			<RepoBreadcrumb
				owner={owner}
				repoName={repoName}
				ownerType={ownerType}
				ownerAvatarUrl={ownerAvatarUrl}
				repoBasePath={repoBasePath}
			/>
			<Image
				src={ownerAvatarUrl}
				alt=""
				width={160}
				height={160}
				className="w-32 aspect-square rounded-lg"
			/>
			{description ? (
				<p className="text-xs text-muted-foreground leading-relaxed">
					{description}
				</p>
			) : null}
			<div className="flex flex-wrap gap-1.5">
				{badges.map((b, i) => (
					<RepoBadge
						key={i}
						type={b.type}
						href={b.href}
						style="dashed"
					/>
				))}
			</div>
			{children}
		</div>
	);
}
