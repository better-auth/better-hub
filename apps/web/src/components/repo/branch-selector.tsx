"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, Tag, ChevronDown, Search, Check } from "lucide-react";
import { cn } from "@/lib/utils";

interface BranchSelectorProps {
	owner: string;
	repo: string;
	currentRef: string;
	branches: { name: string }[];
	tags: { name: string }[];
	currentPath?: string;
	pathType?: "tree" | "blob";
	defaultBranch?: string;
}

export function BranchSelector({
	owner,
	repo,
	currentRef,
	branches,
	tags,
	currentPath,
	pathType = "tree",
	defaultBranch,
}: BranchSelectorProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [tab, setTab] = useState<"branches" | "tags">("branches");
	const router = useRouter();

	const items = tab === "branches" ? branches : tags;
	const filtered = items
		.filter((item) => item.name.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => {
			// Default branch always first
			if (tab === "branches" && defaultBranch) {
				if (a.name === defaultBranch) return -1;
				if (b.name === defaultBranch) return 1;
			}
			// Alpha-only names before names containing numbers
			const aHasNum = /\d/.test(a.name);
			const bHasNum = /\d/.test(b.name);
			if (aHasNum !== bHasNum) return aHasNum ? 1 : -1;
			return a.name.localeCompare(b.name);
		});

	function selectRef(ref: string) {
		setOpen(false);
		setSearch("");
		const pathSuffix = currentPath ? `/${currentPath}` : "";
		if (currentPath) {
			router.push(`/${owner}/${repo}/${pathType}/${ref}${pathSuffix}`);
		} else {
			router.push(`/${owner}/${repo}/tree/${ref}`);
		}
	}

	return (
		<div className="relative">
			<button
				onClick={() => setOpen(!open)}
				className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border hover:bg-muted/60 dark:hover:bg-white/3 transition-colors rounded-sm cursor-pointer"
			>
				<GitBranch className="w-3 h-3 text-muted-foreground/70" />
				<span className="max-w-[120px] truncate">{currentRef}</span>
				<ChevronDown className="w-3 h-3 text-muted-foreground/50" />
			</button>

			{open && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => {
							setOpen(false);
							setSearch("");
						}}
					/>
					<div className="absolute top-full left-0 mt-1 z-50 w-72 border border-border bg-card shadow-lg rounded-md">
						<div className="p-2 border-b border-border">
							<div className="relative">
								<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
								<input
									type="text"
									placeholder="Find a branch or tag..."
									value={search}
									onChange={(e) =>
										setSearch(
											e.target
												.value,
										)
									}
									className="w-full bg-transparent text-xs pl-7 pr-2 py-1.5 border border-border placeholder:text-muted-foreground/50 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
									autoFocus
								/>
							</div>
						</div>
						<div className="flex border-b border-border">
							<button
								onClick={() => setTab("branches")}
								className={cn(
									"flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-wider cursor-pointer -mb-px",
									tab === "branches"
										? "text-foreground border-b-2 border-foreground/70"
										: "text-muted-foreground hover:text-foreground/60",
								)}
							>
								<GitBranch className="w-3 h-3" />
								Branches
								<span className="text-[9px] text-muted-foreground/50 ml-0.5">
									{branches.length}
								</span>
							</button>
							<button
								onClick={() => setTab("tags")}
								className={cn(
									"flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-[10px] font-mono uppercase tracking-wider cursor-pointer -mb-px",
									tab === "tags"
										? "text-foreground border-b-2 border-foreground/70"
										: "text-muted-foreground hover:text-foreground/60",
								)}
							>
								<Tag className="w-3 h-3" />
								Tags
								<span className="text-[9px] text-muted-foreground/50 ml-0.5">
									{tags.length}
								</span>
							</button>
						</div>
						<div className="max-h-60 overflow-y-auto">
							{filtered.map((item) => {
								const isActive =
									item.name === currentRef;
								const isDefault =
									tab === "branches" &&
									defaultBranch &&
									item.name === defaultBranch;
								return (
									<button
										key={item.name}
										onClick={() =>
											selectRef(
												item.name,
											)
										}
										className={cn(
											"w-full text-left px-3 py-1.5 text-xs font-mono hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer flex items-center gap-2",
											isActive &&
												"bg-muted/30",
										)}
									>
										<span className="w-3.5 shrink-0 flex items-center justify-center">
											{isActive && (
												<Check className="w-3 h-3 text-foreground" />
											)}
										</span>
										<span className="truncate flex-1">
											{item.name}
										</span>
										{isDefault && (
											<span className="text-[9px] text-muted-foreground/50 shrink-0">
												default
											</span>
										)}
									</button>
								);
							})}
							{filtered.length === 0 && (
								<div className="px-3 py-4 text-center text-[11px] text-muted-foreground/50 font-mono">
									Nothing found
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
}
