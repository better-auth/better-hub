import Link from "next/link";
import { encodeFilePath } from "@/lib/github-utils";

interface BreadcrumbNavProps {
	owner: string;
	repo: string;
	currentRef: string;
	path: string;
	isFile?: boolean;
}

export function BreadcrumbNav({ owner, repo, currentRef, path, isFile }: BreadcrumbNavProps) {
	if (!path) return null;

	const segments = path.split("/").filter(Boolean);
	const crumbs = segments.map((segment, i) => {
		const partialPath = segments.slice(0, i + 1).join("/");
		const isLast = i === segments.length - 1;
		const href =
			isLast && isFile
				? `/${owner}/${repo}/blob/${currentRef}/${encodeFilePath(partialPath)}`
				: `/${owner}/${repo}/tree/${currentRef}/${encodeFilePath(partialPath)}`;

		return { label: segment, href, isLast };
	});

	return (
		<nav className="flex items-center gap-1 text-xs font-mono overflow-x-auto">
			<Link
				href={`/${owner}/${repo}/code`}
				className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
			>
				{repo}
			</Link>
			{crumbs.map((crumb) => (
				<span key={crumb.href} className="flex items-center gap-1 shrink-0">
					<span className="text-muted-foreground/50">/</span>
					{crumb.isLast ? (
						<span className="text-foreground font-medium">
							{crumb.label}
						</span>
					) : (
						<Link
							href={crumb.href}
							className="text-muted-foreground hover:text-foreground transition-colors"
						>
							{crumb.label}
						</Link>
					)}
				</span>
			))}
		</nav>
	);
}
