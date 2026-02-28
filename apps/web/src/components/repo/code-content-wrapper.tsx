"use client";

import { useMemo, useState, useCallback, useRef } from "react";
import { usePathname } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { PanelLeft, Copy, Check, Download, Monitor } from "lucide-react";
import { type FileTreeNode } from "@/lib/file-tree";
import { parseRefAndPath } from "@/lib/github-utils";
import { FileExplorerTree } from "./file-explorer-tree";
import { BranchSelector } from "./branch-selector";
import { BreadcrumbNav } from "./breadcrumb-nav";
import { cn } from "@/lib/utils";
import {
	revalidateBranches,
	revalidateTags,
} from "@/app/(app)/repos/[owner]/[repo]/readme-actions";

interface CodeContentWrapperProps {
	owner: string;
	repo: string;
	defaultBranch: string;
	tree: FileTreeNode[] | null;
	initialBranches?: { name: string }[] | null;
	initialTags?: { name: string }[] | null;
	children: React.ReactNode;
}

const SNAP_THRESHOLD = 100;
const DEFAULT_WIDTH = 240;

function CloneDownloadButtons({
	owner,
	repo,
	currentRef,
}: {
	owner: string;
	repo: string;
	currentRef: string;
}) {
	const [showClone, setShowClone] = useState(false);
	const [copied, setCopied] = useState(false);
	const [cloneProtocol, setCloneProtocol] = useState<"https" | "ssh">("https");

	const cloneUrl =
		cloneProtocol === "https"
			? `https://github.com/${owner}/${repo}.git`
			: `git@github.com:${owner}/${repo}.git`;

	const zipUrl = `https://github.com/${owner}/${repo}/archive/${currentRef}.zip`;

	function handleCopy() {
		navigator.clipboard.writeText(cloneUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	return (
		<div className="relative ml-auto flex items-center">
			<div className="flex items-center rounded-md border border-border overflow-hidden divide-x divide-border">
				<button
					onClick={() => setShowClone(!showClone)}
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
				>
					<Copy className="w-3 h-3" />
					Clone
				</button>
				<a
					href={zipUrl}
					data-no-github-intercept
					className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 transition-colors"
				>
					<Download className="w-3 h-3" />
					ZIP
				</a>
			</div>

			{showClone && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setShowClone(false)}
					/>
					<div className="absolute right-0 top-full mt-2 w-80 z-50 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-xl p-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
						<div className="flex items-center gap-1 mb-3">
							<button
								onClick={() =>
									setCloneProtocol("https")
								}
								className={`flex-1 py-1.5 text-[10px] font-mono rounded-md border transition-colors cursor-pointer ${
									cloneProtocol === "https"
										? "bg-muted/60 dark:bg-white/10 border-border text-foreground"
										: "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
								}`}
							>
								HTTPS
							</button>
							<button
								onClick={() =>
									setCloneProtocol("ssh")
								}
								className={`flex-1 py-1.5 text-[10px] font-mono rounded-md border transition-colors cursor-pointer ${
									cloneProtocol === "ssh"
										? "bg-muted/60 dark:bg-white/10 border-border text-foreground"
										: "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
								}`}
							>
								SSH
							</button>
						</div>
						<p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2.5">
							Clone with {cloneProtocol.toUpperCase()}
						</p>
						<div className="flex items-center gap-1.5">
							<input
								readOnly
								value={cloneUrl}
								className="flex-1 bg-muted/30 dark:bg-white/5 text-xs font-mono px-2.5 py-2 rounded-md border border-border text-muted-foreground focus:outline-none select-all"
							/>
							<button
								onClick={handleCopy}
								className="shrink-0 px-2.5 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
							>
								{copied ? (
									<Check className="w-3.5 h-3.5 text-success" />
								) : (
									<Copy className="w-3.5 h-3.5" />
								)}
							</button>
						</div>
						<a
							href={`x-github-client://openRepo/https://github.com/${owner}/${repo}`}
							className="mt-3 pt-3 border-t border-border flex items-center gap-2 text-[11px] font-mono text-muted-foreground hover:text-foreground transition-colors"
						>
							<Monitor className="w-3.5 h-3.5" />
							Open with GitHub Desktop
						</a>
					</div>
				</>
			)}
		</div>
	);
}

export function CodeContentWrapper({
	owner,
	repo,
	defaultBranch,
	tree,
	initialBranches,
	initialTags,
	children,
}: CodeContentWrapperProps) {
	const pathname = usePathname();
	const base = `/${owner}/${repo}`;

	const isCodeRoute =
		pathname === `${base}/code` ||
		pathname.startsWith(`${base}/tree`) ||
		pathname.startsWith(`${base}/blob`);

	const { data: branches = [] } = useQuery({
		queryKey: ["repo-branches", owner, repo],
		queryFn: async () => (await revalidateBranches(owner, repo)) ?? [],
		initialData: initialBranches ?? undefined,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
		enabled: isCodeRoute,
	});

	const { data: tags = [] } = useQuery({
		queryKey: ["repo-tags", owner, repo],
		queryFn: async () => (await revalidateTags(owner, repo)) ?? [],
		initialData: initialTags ?? undefined,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
		enabled: isCodeRoute,
	});

	// Detail routes (e.g. /pulls/123, /issues/5, /people/username) manage their own scrolling
	// Note: /pull/ (singular) comes from GitHub-style URLs rewritten by next.config.ts
	const isDetailRoute =
		/\/pulls?\/\d+/.test(pathname) ||
		/\/issues\/\d+/.test(pathname) ||
		/\/people\/[^/]+$/.test(pathname);

	// Overview route: page frame stays fixed, only content sections scroll (lg only)
	const isOverviewRoute = pathname === base;

	const showTree = isCodeRoute && tree !== null;

	const isBlobOrTree =
		pathname.startsWith(`${base}/blob`) || pathname.startsWith(`${base}/tree`);

	// Parse ref and path from URL for blob/tree routes
	const { currentRef, currentPath, pathType } = useMemo(() => {
		if (!isBlobOrTree) {
			return {
				currentRef: defaultBranch,
				currentPath: "",
				pathType: "tree" as const,
			};
		}

		const blobPrefix = `${base}/blob/`;
		const treePrefix = `${base}/tree/`;
		let rawPath: string;
		let type: "blob" | "tree";

		if (pathname.startsWith(blobPrefix)) {
			rawPath = decodeURIComponent(pathname.slice(blobPrefix.length));
			type = "blob";
		} else {
			rawPath = decodeURIComponent(pathname.slice(treePrefix.length));
			type = "tree";
		}

		const segments = rawPath.split("/").filter(Boolean);
		const branchNames = [...branches.map((b) => b.name), ...tags.map((t) => t.name)];
		const { ref, path } = parseRefAndPath(segments, branchNames);

		return { currentRef: ref, currentPath: path, pathType: type };
	}, [pathname, base, isBlobOrTree, branches, tags, defaultBranch]);

	const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
	const lastOpenWidthRef = useRef(DEFAULT_WIDTH);
	const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);

	const collapsed = sidebarWidth === 0;

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			const startWidth = sidebarWidth;
			dragRef.current = { startX: e.clientX, startWidth };
			const onMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const delta = ev.clientX - dragRef.current.startX;
				const raw = dragRef.current.startWidth + delta;
				// Snap to closed below threshold, otherwise clamp between 160-480
				if (raw < SNAP_THRESHOLD) {
					setSidebarWidth(0);
				} else {
					const clamped = Math.max(160, Math.min(480, raw));
					setSidebarWidth(clamped);
				}
			};
			const onUp = () => {
				dragRef.current = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
				// Save last open width for restore
				setSidebarWidth((w) => {
					if (w > 0) lastOpenWidthRef.current = w;
					return w;
				});
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "col-resize";
		},
		[sidebarWidth],
	);

	const handleExpand = useCallback(() => {
		setSidebarWidth(lastOpenWidthRef.current || DEFAULT_WIDTH);
	}, []);

	return (
		<div className="flex flex-1 min-h-0">
			{showTree && (
				<>
					{/* Collapsed toggle */}
					{collapsed && (
						<div className="hidden lg:flex shrink-0 flex-col items-center pt-2 pl-4 pr-0.5">
							<button
								type="button"
								onClick={handleExpand}
								className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors cursor-pointer"
								title="Show file explorer"
							>
								<PanelLeft className="w-4 h-4" />
							</button>
						</div>
					)}

					{/* Sidebar */}
					{!collapsed && (
						<div
							className="hidden lg:flex shrink-0 border-r border-border flex-col min-h-0 overflow-hidden pl-4"
							style={{ width: sidebarWidth }}
						>
							<FileExplorerTree
								tree={tree}
								owner={owner}
								repo={repo}
								defaultBranch={defaultBranch}
							/>
						</div>
					)}

					{/* Drag handle — only when open */}
					{!collapsed && (
						<div
							onMouseDown={handleDragStart}
							className="hidden lg:flex w-1 shrink-0 cursor-col-resize items-center justify-center hover:bg-foreground/10 active:bg-foreground/15 transition-colors group"
						>
							<div className="w-[2px] h-8 rounded-full bg-border group-hover:bg-foreground/20 group-active:bg-foreground/30 transition-colors" />
						</div>
					)}
				</>
			)}
			<div className="flex-1 min-w-0 flex flex-col min-h-0">
				{isBlobOrTree && (
					<div
						className="shrink-0 pl-4 pt-3 pb-3 flex items-center gap-3"
						style={{ paddingRight: "var(--repo-pr, 1rem)" }}
					>
						<BranchSelector
							owner={owner}
							repo={repo}
							currentRef={currentRef}
							branches={branches}
							tags={tags}
							currentPath={currentPath}
							pathType={pathType}
						/>
						<BreadcrumbNav
							owner={owner}
							repo={repo}
							currentRef={currentRef}
							path={currentPath}
							isFile={pathType === "blob"}
						/>
						<CloneDownloadButtons
							owner={owner}
							repo={repo}
							currentRef={currentRef}
						/>
					</div>
				)}
				<div
					className={cn(
						"flex-1 min-h-0",
						isDetailRoute
							? "flex flex-col overflow-hidden pl-4"
							: isOverviewRoute
								? "flex flex-col overflow-y-auto pl-4 pb-4 pt-3"
								: cn(
										"overflow-y-auto pl-4 pb-4",
										isBlobOrTree
											? ""
											: "pt-3",
									),
					)}
					style={{
						paddingRight:
							"var(--repo-pr, calc(var(--spacing) * 4))",
					}}
				>
					{children}
				</div>
			</div>
		</div>
	);
}
