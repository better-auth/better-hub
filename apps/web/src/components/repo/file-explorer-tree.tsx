"use client";

import { useState, useEffect, useMemo, useCallback, useRef, memo } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronRight, Search, X } from "lucide-react";
import { FileTypeIcon } from "@/components/shared/file-icon";
import { cn } from "@/lib/utils";
import { encodeFilePath } from "@/lib/github-utils";
import { type FileTreeNode, getAncestorPaths } from "@/lib/file-tree";

interface FileExplorerTreeProps {
	tree: FileTreeNode[];
	owner: string;
	repo: string;
	/** Defaults to `/${owner}/${repo}` */
	repoBasePath?: string;
	defaultBranch: string;
}

// ── Search index (built once per tree) ──────────────────────────────

interface SearchEntry {
	node: FileTreeNode;
	nameLower: string;
	pathLower: string;
}

function buildSearchIndex(nodes: FileTreeNode[]): SearchEntry[] {
	const result: SearchEntry[] = [];
	function walk(list: FileTreeNode[]) {
		for (const n of list) {
			if (n.type === "file") {
				result.push({
					node: n,
					nameLower: n.name.toLowerCase(),
					pathLower: n.path.toLowerCase(),
				});
			} else if (n.children) walk(n.children);
		}
	}
	walk(nodes);
	return result;
}

// ── Search bar (isolated — typing never re-renders the tree) ────────

function FileSearchBar({
	searchIndex,
	repoBasePath,
	defaultBranch,
}: {
	searchIndex: SearchEntry[];
	repoBasePath: string;
	defaultBranch: string;
}) {
	const router = useRouter();
	const inputRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);
	const versionRef = useRef(0);

	const [inputValue, setInputValue] = useState("");
	const [suggestions, setSuggestions] = useState<FileTreeNode[]>([]);
	const [selectedIdx, setSelectedIdx] = useState(0);

	const showDropdown = inputValue.trim().length > 0;

	// Debounced search
	useEffect(() => {
		const q = inputValue.trim().toLowerCase();
		if (!q) {
			setSuggestions([]);
			versionRef.current++;
			return;
		}
		const version = ++versionRef.current;
		if (debounceRef.current) clearTimeout(debounceRef.current);
		debounceRef.current = setTimeout(() => {
			if (version !== versionRef.current) return;
			const nameStarts: FileTreeNode[] = [];
			const nameContains: FileTreeNode[] = [];
			const pathContains: FileTreeNode[] = [];
			for (const entry of searchIndex) {
				if (entry.nameLower.startsWith(q)) nameStarts.push(entry.node);
				else if (entry.nameLower.includes(q)) nameContains.push(entry.node);
				else if (entry.pathLower.includes(q)) pathContains.push(entry.node);
				if (
					nameStarts.length +
						nameContains.length +
						pathContains.length >=
					50
				)
					break;
			}
			if (version !== versionRef.current) return;
			setSuggestions(
				[...nameStarts, ...nameContains, ...pathContains].slice(0, 15),
			);
			setSelectedIdx(0);
		}, 100);
		return () => {
			if (debounceRef.current) clearTimeout(debounceRef.current);
		};
	}, [inputValue, searchIndex]);

	// Scroll selected into view
	useEffect(() => {
		if (!listRef.current) return;
		const el = listRef.current.children[selectedIdx] as HTMLElement | undefined;
		el?.scrollIntoView({ block: "nearest" });
	}, [selectedIdx]);

	const navigate = useCallback(
		(filePath: string) => {
			setInputValue("");
			setSuggestions([]);
			router.push(
				`${repoBasePath}/blob/${defaultBranch}/${encodeFilePath(filePath)}`,
			);
		},
		[router, repoBasePath, defaultBranch],
	);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (!showDropdown) return;
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setSelectedIdx((i) => Math.min(i + 1, suggestions.length - 1));
			} else if (e.key === "ArrowUp") {
				e.preventDefault();
				setSelectedIdx((i) => Math.max(i - 1, 0));
			} else if (e.key === "Enter") {
				e.preventDefault();
				const item = suggestions[selectedIdx];
				if (item) navigate(item.path);
			} else if (e.key === "Escape") {
				e.preventDefault();
				setInputValue("");
				inputRef.current?.blur();
			}
		},
		[showDropdown, suggestions, selectedIdx, navigate],
	);

	return (
		<div className="shrink-0 p-2 relative">
			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
				<input
					ref={inputRef}
					type="text"
					placeholder="Go to file..."
					value={inputValue}
					onChange={(e) => setInputValue(e.target.value)}
					onKeyDown={handleKeyDown}
					className="w-full text-[11px] font-mono pl-7 pr-7 py-1.5 bg-transparent border border-border rounded focus:outline-none focus:ring-1 focus:ring-muted-foreground/30 placeholder:text-muted-foreground/50"
				/>
				{inputValue && (
					<button
						onClick={() => {
							setInputValue("");
							setSuggestions([]);
						}}
						className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>

			{showDropdown && (
				<div
					ref={listRef}
					className="absolute left-2 right-2 top-full mt-0.5 z-30 max-h-72 overflow-y-auto bg-background border border-border rounded-md shadow-lg"
				>
					{suggestions.length === 0 ? (
						<p className="text-[11px] text-muted-foreground/50 font-mono px-3 py-2">
							{inputValue.trim()
								? "No files found"
								: "Type to search..."}
						</p>
					) : (
						suggestions.map((node, i) => (
							<button
								key={node.path}
								onMouseDown={(e) => {
									e.preventDefault();
									navigate(node.path);
								}}
								onMouseEnter={() =>
									setSelectedIdx(i)
								}
								className={cn(
									"flex items-center gap-2 w-full text-left px-2.5 py-1.5 transition-colors cursor-pointer",
									i === selectedIdx
										? "bg-muted/70"
										: "hover:bg-muted/40",
								)}
							>
								<FileTypeIcon
									name={node.name}
									type="file"
									className="w-3.5 h-3.5 shrink-0"
								/>
								<span className="text-[11px] font-mono truncate">
									<span className="text-foreground">
										{node.name}
									</span>
									<span className="text-muted-foreground ml-1.5">
										{node.path}
									</span>
								</span>
							</button>
						))
					)}
				</div>
			)}
		</div>
	);
}

// ── Main component ──────────────────────────────────────────────────

function refAndSubpathFromCodePath(
	pathname: string,
	base: string,
	fallbackRef: string,
): { ref: string; filePath: string | null } {
	for (const kind of ["blob", "tree"] as const) {
		const prefix = `${base}/${kind}/`;
		if (!pathname.startsWith(prefix)) continue;
		const rest = pathname.slice(prefix.length);
		const slash = rest.indexOf("/");
		const ref = slash === -1 ? rest : rest.slice(0, slash);
		const tail = slash === -1 ? "" : rest.slice(slash + 1);
		if (!ref) continue;
		try {
			return {
				ref,
				filePath: tail ? decodeURIComponent(tail) : null,
			};
		} catch {
			return { ref, filePath: tail || null };
		}
	}
	return { ref: fallbackRef, filePath: null };
}

export function FileExplorerTree({
	tree,
	owner,
	repo,
	repoBasePath,
	defaultBranch,
}: FileExplorerTreeProps) {
	const pathname = usePathname();
	const base = repoBasePath ?? `/${owner}/${repo}`;
	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(new Set());

	const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);

	const pathRef = useMemo(
		() => refAndSubpathFromCodePath(pathname, base, defaultBranch).ref,
		[pathname, base, defaultBranch],
	);

	const currentPath = useMemo(() => {
		return refAndSubpathFromCodePath(pathname, base, defaultBranch).filePath;
	}, [pathname, base, defaultBranch]);

	useEffect(() => {
		if (!currentPath) return;
		const ancestors = getAncestorPaths(currentPath);
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			for (const a of ancestors) next.add(a);
			next.add(currentPath);
			return next;
		});
	}, [currentPath]);

	const toggleExpand = useCallback((path: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	return (
		<div className="flex flex-col h-full">
			<FileSearchBar
				searchIndex={searchIndex}
				repoBasePath={base}
				defaultBranch={pathRef}
			/>
			<div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
				{tree.map((node) => (
					<TreeNode
						key={node.path}
						node={node}
						depth={0}
						repoBasePath={base}
						defaultBranch={pathRef}
						currentPath={currentPath}
						expandedPaths={expandedPaths}
						onToggle={toggleExpand}
					/>
				))}
			</div>
		</div>
	);
}

// ── Tree node (memoized) ────────────────────────────────────────────

interface TreeNodeProps {
	node: FileTreeNode;
	depth: number;
	repoBasePath: string;
	defaultBranch: string;
	currentPath: string | null;
	expandedPaths: Set<string>;
	onToggle: (path: string) => void;
}

const TreeNode = memo(function TreeNode({
	node,
	depth,
	repoBasePath,
	defaultBranch,
	currentPath,
	expandedPaths,
	onToggle,
}: TreeNodeProps) {
	const isExpanded = expandedPaths.has(node.path);
	const isActive = currentPath === node.path;
	const paddingLeft = depth * 16 + 8;

	if (node.type === "dir") {
		return (
			<div>
				<button
					onClick={() => onToggle(node.path)}
					className={cn(
						"flex items-center gap-1.5 w-full text-left py-[3px] pr-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors group relative",
						isActive && "bg-muted/70",
					)}
					style={{ paddingLeft }}
				>
					{Array.from({ length: depth }).map((_, i) => (
						<span
							key={i}
							className="absolute top-0 bottom-0 w-px bg-border/60"
							style={{ left: i * 16 + 16 }}
						/>
					))}
					<ChevronRight
						className={cn(
							"w-3 h-3 text-muted-foreground/50 shrink-0 transition-transform duration-150",
							isExpanded && "rotate-90",
						)}
					/>
					<FileTypeIcon
						name={node.name}
						type="dir"
						className="w-3.5 h-3.5 shrink-0"
						isOpen={isExpanded}
					/>
					<span className="text-[12px] font-mono truncate">
						{node.name}
					</span>
				</button>
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-150 ease-out",
						isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
					)}
				>
					<div className="overflow-hidden">
						{node.children?.map((child) => (
							<TreeNode
								key={child.path}
								node={child}
								depth={depth + 1}
								repoBasePath={repoBasePath}
								defaultBranch={defaultBranch}
								currentPath={currentPath}
								expandedPaths={expandedPaths}
								onToggle={onToggle}
							/>
						))}
					</div>
				</div>
			</div>
		);
	}

	return (
		<Link
			href={`${repoBasePath}/blob/${defaultBranch}/${encodeFilePath(node.path)}`}
			prefetch={true}
			className={cn(
				"flex items-center gap-1.5 py-[3px] pr-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors relative",
				isActive && "bg-muted/70",
			)}
			style={{ paddingLeft: paddingLeft + 15 }}
		>
			{Array.from({ length: depth }).map((_, i) => (
				<span
					key={i}
					className="absolute top-0 bottom-0 w-px bg-border/60"
					style={{ left: i * 16 + 16 }}
				/>
			))}
			{isActive && (
				<span className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground" />
			)}
			<FileTypeIcon name={node.name} type="file" className="w-4 h-4 shrink-0" />
			<span className="text-[12px] font-mono truncate">{node.name}</span>
		</Link>
	);
});
