import Link from "next/link";
import { formatBytes, encodeFilePath } from "@/lib/github-utils";
import { FileTypeIcon } from "@/components/shared/file-icon";

interface FileItem {
	name: string;
	path: string;
	type: "file" | "dir";
	size?: number;
}

interface FileListProps {
	items: FileItem[];
	owner: string;
	repo: string;
	currentRef: string;
	/** @default "github" — `storage` uses `/s/:owner/:repo/tree|blob/...` for hosted git repos */
	linkBase?: "github" | "storage";
}

export function FileList({ items, owner, repo, currentRef, linkBase = "github" }: FileListProps) {
	const sorted = [...items].sort((a, b) => {
		if (a.type === "dir" && b.type !== "dir") return -1;
		if (a.type !== "dir" && b.type === "dir") return 1;
		return a.name.localeCompare(b.name);
	});

	if (sorted.length === 0) {
		return (
			<div className="border border-border rounded-md py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					This repository is empty
				</p>
			</div>
		);
	}

	const pathPrefix = linkBase === "storage" ? `/s/${owner}/${repo}` : `/${owner}/${repo}`;

	return (
		<div className="border border-border divide-y divide-border rounded-md overflow-hidden">
			{sorted.map((item) => {
				const href =
					item.type === "dir"
						? `${pathPrefix}/tree/${currentRef}/${encodeFilePath(item.path)}`
						: `${pathPrefix}/blob/${currentRef}/${encodeFilePath(item.path)}`;

				return (
					<Link
						key={item.path}
						href={href}
						className="group flex items-center gap-3 px-4 py-2 hover:bg-muted/50 transition-colors"
					>
						<FileTypeIcon
							name={item.name}
							type={item.type}
							className="w-4 h-4 shrink-0"
						/>
						<span className="text-sm font-mono group-hover:text-foreground transition-colors flex-1 min-w-0 truncate">
							{item.name}
						</span>
						{item.type === "file" &&
							item.size !== undefined && (
								<span className="text-[11px] text-muted-foreground/60 font-mono shrink-0">
									{formatBytes(item.size)}
								</span>
							)}
					</Link>
				);
			})}
		</div>
	);
}
