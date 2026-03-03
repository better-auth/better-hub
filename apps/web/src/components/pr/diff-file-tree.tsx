"use client";

import { useState, useCallback, useMemo, memo } from "react";
import {
	ChevronRight,
	FilePlus2,
	FileX2,
	FileEdit,
	ArrowRight,
	FileText,
	Check,
	Search,
	X,
} from "lucide-react";
import { FileTypeIcon } from "@/components/shared/file-icon";
import { cn } from "@/lib/utils";
import {
	type DiffTreeNode,
	type DiffFile,
	buildDiffFileTree,
	getAncestorPaths,
} from "@/lib/file-tree";
import type { ReviewThread } from "@/lib/github";

interface DiffFileTreeProps {
	files: DiffFile[];
	activeIndex: number;
	onSelectFile: (index: number) => void;
	viewedFiles: Set<string>;
	threadsByFile: Map<string, ReviewThread[]>;
}

function getFileStatusIcon(status: string) {
	switch (status) {
		case "added":
			return FilePlus2;
		case "removed":
			return FileX2;
		case "modified":
			return FileEdit;
		case "renamed":
		case "copied":
			return ArrowRight;
		default:
			return FileText;
	}
}

function getFileStatusColor(status: string) {
	switch (status) {
		case "added":
			return "text-success";
		case "removed":
			return "text-destructive";
		case "modified":
			return "text-warning";
		case "renamed":
		case "copied":
			return "text-info";
		default:
			return "text-muted-foreground/60";
	}
}

interface SearchEntry {
	node: DiffTreeNode;
	nameLower: string;
	pathLower: string;
}

function buildSearchIndex(nodes: DiffTreeNode[]): SearchEntry[] {
	const result: SearchEntry[] = [];
	function walk(list: DiffTreeNode[]) {
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

function DiffFileSearchBar({
	searchIndex,
	onSelectFile,
}: {
	searchIndex: SearchEntry[];
	onSelectFile: (index: number) => void;
}) {
	const [inputValue, setInputValue] = useState("");
	const [selectedIdx, setSelectedIdx] = useState(0);

	const suggestions = useMemo(() => {
		const q = inputValue.trim().toLowerCase();
		if (!q) return [];

		const nameStarts: DiffTreeNode[] = [];
		const nameContains: DiffTreeNode[] = [];
		const pathContains: DiffTreeNode[] = [];

		for (const entry of searchIndex) {
			if (entry.nameLower.startsWith(q)) nameStarts.push(entry.node);
			else if (entry.nameLower.includes(q)) nameContains.push(entry.node);
			else if (entry.pathLower.includes(q)) pathContains.push(entry.node);
			if (nameStarts.length + nameContains.length + pathContains.length >= 50)
				break;
		}

		return [...nameStarts, ...nameContains, ...pathContains].slice(0, 15);
	}, [inputValue, searchIndex]);

	const showDropdown = inputValue.trim().length > 0;

	const navigate = useCallback(
		(node: DiffTreeNode) => {
			if (node.fileIndex !== undefined) {
				setInputValue("");
				onSelectFile(node.fileIndex);
			}
		},
		[onSelectFile],
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
				if (item) navigate(item);
			} else if (e.key === "Escape") {
				e.preventDefault();
				setInputValue("");
			}
		},
		[showDropdown, suggestions, selectedIdx, navigate],
	);

	return (
		<div className="shrink-0 p-2 relative">
			<div className="relative">
				<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
				<input
					type="text"
					placeholder="Filter files..."
					value={inputValue}
					onChange={(e) => {
						setInputValue(e.target.value);
						setSelectedIdx(0);
					}}
					onKeyDown={handleKeyDown}
					className="w-full text-[11px] font-mono pl-7 pr-7 py-1.5 bg-transparent border border-border rounded focus:outline-none focus:ring-1 focus:ring-muted-foreground/30 placeholder:text-muted-foreground/50"
				/>
				{inputValue && (
					<button
						onClick={() => setInputValue("")}
						className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground/50 hover:text-muted-foreground transition-colors"
					>
						<X className="w-3 h-3" />
					</button>
				)}
			</div>

			{showDropdown && (
				<div className="absolute left-2 right-2 top-full mt-0.5 z-30 max-h-72 overflow-y-auto bg-background border border-border rounded-md shadow-lg">
					{suggestions.length === 0 ? (
						<p className="text-[11px] text-muted-foreground/50 font-mono px-3 py-2">
							No files found
						</p>
					) : (
						suggestions.map((node, i) => {
							const Icon = getFileStatusIcon(
								node.status ?? "modified",
							);
							return (
								<button
									key={node.path}
									onMouseDown={(e) => {
										e.preventDefault();
										navigate(node);
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
									<Icon
										className={cn(
											"w-3.5 h-3.5 shrink-0",
											getFileStatusColor(
												node.status ??
													"modified",
											),
										)}
									/>
									<span className="text-[11px] font-mono truncate flex-1">
										<span className="text-foreground">
											{node.name}
										</span>
										<span className="text-muted-foreground ml-1.5">
											{node.path}
										</span>
									</span>
								</button>
							);
						})
					)}
				</div>
			)}
		</div>
	);
}

interface TreeNodeProps {
	node: DiffTreeNode;
	depth: number;
	activeIndex: number;
	onSelectFile: (index: number) => void;
	viewedFiles: Set<string>;
	threadsByFile: Map<string, ReviewThread[]>;
	expandedPaths: Set<string>;
	onToggle: (path: string) => void;
}

const DiffTreeNode = memo(function DiffTreeNode({
	node,
	depth,
	activeIndex,
	onSelectFile,
	viewedFiles,
	threadsByFile,
	expandedPaths,
	onToggle,
}: TreeNodeProps) {
	const isExpanded = expandedPaths.has(node.path);
	const paddingLeft = depth * 16 + 8;

	if (node.type === "dir") {
		return (
			<div>
				<button
					onClick={() => onToggle(node.path)}
					className={cn(
						"flex items-center gap-1.5 w-full text-left py-[3px] pr-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors group relative",
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
					<span className="text-[11px] font-mono truncate flex-1">
						{node.name}
					</span>
					{(node.additions ?? 0) > 0 && (
						<span className="text-[9px] font-mono text-success tabular-nums shrink-0">
							+{node.additions}
						</span>
					)}
					{(node.deletions ?? 0) > 0 && (
						<span className="text-[9px] font-mono text-destructive tabular-nums shrink-0">
							-{node.deletions}
						</span>
					)}
				</button>
				<div
					className={cn(
						"grid transition-[grid-template-rows] duration-150 ease-out",
						isExpanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
					)}
				>
					<div className="overflow-hidden">
						{node.children?.map((child) => (
							<DiffTreeNode
								key={child.path}
								node={child}
								depth={depth + 1}
								activeIndex={activeIndex}
								onSelectFile={onSelectFile}
								viewedFiles={viewedFiles}
								threadsByFile={threadsByFile}
								expandedPaths={expandedPaths}
								onToggle={onToggle}
							/>
						))}
					</div>
				</div>
			</div>
		);
	}

	const isActive = node.fileIndex === activeIndex;
	const isViewed = viewedFiles.has(node.path);
	const fileThreads = threadsByFile.get(node.path);
	const Icon = getFileStatusIcon(node.status ?? "modified");

	return (
		<button
			onClick={() => node.fileIndex !== undefined && onSelectFile(node.fileIndex)}
			className={cn(
				"flex items-center gap-1.5 w-full text-left py-[3px] pr-2 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors relative group/file cursor-pointer",
				isActive && "bg-muted/70",
				isViewed && "opacity-50",
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
			{isViewed ? (
				<Check className="w-3 h-3 shrink-0 text-success" />
			) : (
				<Icon
					className={cn(
						"w-3 h-3 shrink-0",
						getFileStatusColor(node.status ?? "modified"),
					)}
				/>
			)}
			<span
				className={cn(
					"text-[11px] font-mono truncate flex-1 group-hover/file:text-foreground",
					isViewed
						? "text-muted-foreground/60 line-through"
						: "text-foreground/80",
				)}
			>
				{node.name}
			</span>
			{fileThreads && fileThreads.length > 0 && (
				<span
					className="w-1.5 h-1.5 rounded-full bg-warning/60 shrink-0"
					title={`${fileThreads.length} review thread${fileThreads.length !== 1 ? "s" : ""}`}
				/>
			)}
			<span className="text-[9px] font-mono text-success tabular-nums shrink-0">
				+{node.additions ?? 0}
			</span>
			<span className="text-[9px] font-mono text-destructive tabular-nums shrink-0">
				-{node.deletions ?? 0}
			</span>
		</button>
	);
});

export function DiffFileTree({
	files,
	activeIndex,
	onSelectFile,
	viewedFiles,
	threadsByFile,
}: DiffFileTreeProps) {
	const tree = useMemo(() => buildDiffFileTree(files), [files]);
	const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);

	const currentFile = files[activeIndex];
	const currentPath = currentFile?.filename ?? null;

	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => {
		if (!currentPath) return new Set<string>();
		const ancestors = getAncestorPaths(currentPath);
		return new Set(ancestors);
	});

	const toggleExpand = useCallback((path: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const handleSelectFile = useCallback(
		(index: number) => {
			const file = files[index];
			if (file) {
				const ancestors = getAncestorPaths(file.filename);
				setExpandedPaths((prev) => {
					const next = new Set(prev);
					for (const a of ancestors) next.add(a);
					return next;
				});
			}
			onSelectFile(index);
		},
		[files, onSelectFile],
	);

	return (
		<div className="flex flex-col h-full">
			<DiffFileSearchBar
				searchIndex={searchIndex}
				onSelectFile={handleSelectFile}
			/>
			<div className="flex-1 overflow-y-auto overflow-x-hidden py-1">
				{tree.map((node) => (
					<DiffTreeNode
						key={node.path}
						node={node}
						depth={0}
						activeIndex={activeIndex}
						onSelectFile={handleSelectFile}
						viewedFiles={viewedFiles}
						threadsByFile={threadsByFile}
						expandedPaths={expandedPaths}
						onToggle={toggleExpand}
					/>
				))}
			</div>
		</div>
	);
}
