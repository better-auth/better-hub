"use client";

import { useState, useCallback, useMemo, memo, useEffect, useRef } from "react";
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
	FolderTree,
	List,
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
	onToggleViewed: (filename: string) => void;
	onSetFilesViewed: (filenames: string[], viewed: boolean) => void;
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

type ViewMode = "tree" | "flat";

function DiffFileSearchBar({
	searchIndex,
	onSelectFile,
	viewMode,
	onToggleViewMode,
}: {
	searchIndex: SearchEntry[];
	onSelectFile: (index: number) => void;
	viewMode: ViewMode;
	onToggleViewMode: () => void;
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
			<div className="flex items-center gap-1.5">
				<div className="relative flex-1">
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
				<button
					onClick={onToggleViewMode}
					className="p-1.5 rounded border border-border hover:bg-muted/50 transition-colors"
					title={
						viewMode === "tree"
							? "Switch to flat view"
							: "Switch to tree view"
					}
				>
					{viewMode === "tree" ? (
						<List className="w-3.5 h-3.5 text-muted-foreground" />
					) : (
						<FolderTree className="w-3.5 h-3.5 text-muted-foreground" />
					)}
				</button>
			</div>

			{showDropdown && (
				<div className="absolute left-2 right-10 top-full mt-0.5 z-30 max-h-72 overflow-y-auto bg-background border border-border rounded-md shadow-lg">
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
	onToggleViewed: (filename: string) => void;
	onSetFilesViewed: (filenames: string[], viewed: boolean) => void;
}

function collectFilePaths(node: DiffTreeNode): string[] {
	const paths: string[] = [];
	function walk(n: DiffTreeNode) {
		if (n.type === "file") {
			paths.push(n.path);
		} else if (n.children) {
			for (const child of n.children) walk(child);
		}
	}
	walk(node);
	return paths;
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
	onToggleViewed,
	onSetFilesViewed,
}: TreeNodeProps) {
	const isExpanded = expandedPaths.has(node.path);
	const paddingLeft = depth * 16 + 8;

	if (node.type === "dir") {
		const filePaths = collectFilePaths(node);
		const viewedCount = filePaths.filter((p) => viewedFiles.has(p)).length;
		const allViewed = filePaths.length > 0 && viewedCount === filePaths.length;
		const someViewed = viewedCount > 0 && viewedCount < filePaths.length;

		return (
			<div>
				<div
					onClick={() => onToggle(node.path)}
					className={cn(
						"flex items-center gap-1.5 w-full text-left py-[3px] pr-2 hover:bg-card transition-colors group cursor-pointer relative",
						allViewed && "opacity-70",
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
						<span className="text-[9px] font-mono text-success tabular-nums shrink-0 group-hover:hidden">
							+{node.additions}
						</span>
					)}
					{(node.deletions ?? 0) > 0 && (
						<span className="text-[9px] font-mono text-destructive tabular-nums shrink-0 group-hover:hidden">
							-{node.deletions}
						</span>
					)}
					<button
						onClick={(e) => {
							e.stopPropagation();
							onSetFilesViewed(filePaths, !allViewed);
						}}
						className="hidden group-hover:flex items-center justify-end w-[34px] shrink-0"
						title={
							allViewed
								? "Mark all as unviewed"
								: "Mark all as viewed"
						}
					>
						<span
							className={cn(
								"w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors cursor-pointer",
								allViewed
									? "bg-primary border-primary"
									: someViewed
										? "border-primary bg-primary/30"
										: "border-muted-foreground/40 hover:border-muted-foreground/60",
							)}
						>
							{allViewed && (
								<Check className="w-2.5 h-2.5 text-primary-foreground" />
							)}
							{someViewed && !allViewed && (
								<span className="w-1.5 h-1.5 bg-primary rounded-sm" />
							)}
						</span>
					</button>
				</div>
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
								onToggleViewed={onToggleViewed}
								onSetFilesViewed={onSetFilesViewed}
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
		<div
			className={cn(
				"flex items-center gap-1.5 w-full text-left py-[3px] pr-2 hover:bg-card transition-colors relative group/file cursor-pointer",
				isActive && "bg-accent!",
				isViewed && "opacity-70",
			)}
			style={{ paddingLeft: paddingLeft + 15 }}
			onClick={() => node.fileIndex !== undefined && onSelectFile(node.fileIndex)}
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
				<Check className="w-3 h-3 shrink-0 text-primary" />
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
			<span className="text-[9px] font-mono text-success tabular-nums shrink-0 group-hover/file:hidden">
				+{node.additions ?? 0}
			</span>
			<span className="text-[9px] font-mono text-destructive tabular-nums shrink-0 group-hover/file:hidden">
				-{node.deletions ?? 0}
			</span>
			<button
				onClick={(e) => {
					e.stopPropagation();
					onToggleViewed(node.path);
				}}
				className="hidden group-hover/file:flex items-center justify-end w-[34px] shrink-0"
				title={isViewed ? "Mark as unviewed" : "Mark as viewed"}
			>
				<span
					className={cn(
						"w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors cursor-pointer",
						isViewed
							? "bg-primary border-primary"
							: "border-muted-foreground/40 hover:border-muted-foreground/60",
					)}
				>
					{isViewed && (
						<Check className="w-2.5 h-2.5 text-primary-foreground" />
					)}
				</span>
			</button>
		</div>
	);
});

function collectAllDirPaths(nodes: DiffTreeNode[]): string[] {
	const paths: string[] = [];
	function walk(list: DiffTreeNode[]) {
		for (const n of list) {
			if (n.type === "dir") {
				paths.push(n.path);
				if (n.children) walk(n.children);
			}
		}
	}
	walk(nodes);
	return paths;
}

interface FlatFileItemProps {
	file: DiffFile;
	index: number;
	isActive: boolean;
	isViewed: boolean;
	threads: ReviewThread[] | undefined;
	onSelectFile: (index: number) => void;
	onToggleViewed: (filename: string) => void;
}

const FlatFileItem = memo(function FlatFileItem({
	file,
	index,
	isActive,
	isViewed,
	threads,
	onSelectFile,
	onToggleViewed,
}: FlatFileItemProps) {
	const Icon = getFileStatusIcon(file.status);
	const lastSlash = file.filename.lastIndexOf("/");
	const dirPath = lastSlash > 0 ? file.filename.slice(0, lastSlash + 1) : "";
	const fileName = lastSlash > 0 ? file.filename.slice(lastSlash + 1) : file.filename;

	return (
		<div
			onClick={() => onSelectFile(index)}
			className={cn(
				"flex items-center gap-1.5 w-full text-left py-[3px] px-2 hover:bg-card transition-colors relative group/file cursor-pointer",
				isActive && "bg-accent",
				isViewed && "opacity-70",
			)}
		>
			{isActive && (
				<span className="absolute left-0 top-0 bottom-0 w-0.5 bg-foreground" />
			)}
			{isViewed ? (
				<Check className="w-3 h-3 shrink-0 text-primary" />
			) : (
				<Icon
					className={cn(
						"w-3 h-3 shrink-0",
						getFileStatusColor(file.status),
					)}
				/>
			)}
			<span
				className="font-mono flex items-baseline min-w-0 flex-1 group-hover/file:text-foreground"
				title={file.filename}
			>
				{dirPath && (
					<span
						className={cn(
							"text-[9px] truncate min-w-0 shrink",
							isViewed
								? "text-muted-foreground/40 line-through"
								: "text-muted-foreground/50",
						)}
					>
						{dirPath}
					</span>
				)}
				<span
					className={cn(
						"text-[11px] shrink-0",
						isViewed
							? "text-muted-foreground/60 line-through"
							: "text-foreground/80",
					)}
				>
					{fileName}
				</span>
			</span>
			{threads && threads.length > 0 && (
				<span
					className="w-1.5 h-1.5 rounded-full bg-warning/60 shrink-0"
					title={`${threads.length} review thread${threads.length !== 1 ? "s" : ""}`}
				/>
			)}
			<span className="text-[9px] font-mono text-success tabular-nums shrink-0 group-hover/file:hidden">
				+{file.additions}
			</span>
			<span className="text-[9px] font-mono text-destructive tabular-nums shrink-0 group-hover/file:hidden">
				-{file.deletions}
			</span>
			<button
				onClick={(e) => {
					e.stopPropagation();
					onToggleViewed(file.filename);
				}}
				className="hidden group-hover/file:flex items-center justify-end w-[34px] shrink-0"
				title={isViewed ? "Mark as unviewed" : "Mark as viewed"}
			>
				<span
					className={cn(
						"w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors cursor-pointer",
						isViewed
							? "bg-primary border-primary"
							: "border-muted-foreground/40 hover:border-muted-foreground/60",
					)}
				>
					{isViewed && (
						<Check className="w-2.5 h-2.5 text-primary-foreground" />
					)}
				</span>
			</button>
		</div>
	);
});

export function DiffFileTree({
	files,
	activeIndex,
	onSelectFile,
	viewedFiles,
	threadsByFile,
	onToggleViewed,
	onSetFilesViewed,
}: DiffFileTreeProps) {
	const tree = useMemo(() => buildDiffFileTree(files), [files]);
	const searchIndex = useMemo(() => buildSearchIndex(tree), [tree]);

	const allDirPaths = useMemo(() => collectAllDirPaths(tree), [tree]);

	const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set<string>());
	const [viewMode, setViewMode] = useState<ViewMode>("tree");

	const initializedRef = useRef(false);
	useEffect(() => {
		if (!initializedRef.current && allDirPaths.length > 0) {
			initializedRef.current = true;
			setExpandedPaths(new Set(allDirPaths));
		}
	}, [allDirPaths]);

	const toggleExpand = useCallback((path: string) => {
		setExpandedPaths((prev) => {
			const next = new Set(prev);
			if (next.has(path)) next.delete(path);
			else next.add(path);
			return next;
		});
	}, []);

	const toggleViewMode = useCallback(() => {
		setViewMode((prev) => (prev === "tree" ? "flat" : "tree"));
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
				viewMode={viewMode}
				onToggleViewMode={toggleViewMode}
			/>
			<div className="flex-1 overflow-y-auto overflow-x-hidden py-1 pr-2 pb-12">
				<div key={viewMode} className="animate-in fade-in duration-150">
					{viewMode === "tree"
						? tree.map((node) => (
								<DiffTreeNode
									key={node.path}
									node={node}
									depth={0}
									activeIndex={activeIndex}
									onSelectFile={
										handleSelectFile
									}
									viewedFiles={viewedFiles}
									threadsByFile={
										threadsByFile
									}
									expandedPaths={
										expandedPaths
									}
									onToggle={toggleExpand}
									onToggleViewed={
										onToggleViewed
									}
									onSetFilesViewed={
										onSetFilesViewed
									}
								/>
							))
						: files.map((file, index) => (
								<FlatFileItem
									key={file.filename}
									file={file}
									index={index}
									isActive={
										index ===
										activeIndex
									}
									isViewed={viewedFiles.has(
										file.filename,
									)}
									threads={threadsByFile.get(
										file.filename,
									)}
									onSelectFile={
										handleSelectFile
									}
									onToggleViewed={
										onToggleViewed
									}
								/>
							))}
				</div>
			</div>
		</div>
	);
}
