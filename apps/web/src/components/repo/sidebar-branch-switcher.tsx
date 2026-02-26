"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, ChevronDown, Check, Search } from "lucide-react";
import { cn } from "@/lib/utils";

interface SidebarBranchSwitcherProps {
	owner: string;
	repo: string;
	currentBranch: string;
	branches: { name: string }[];
	defaultBranch: string;
}

export function SidebarBranchSwitcher({
	owner,
	repo,
	currentBranch,
	branches,
	defaultBranch,
}: SidebarBranchSwitcherProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const router = useRouter();
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClick = (e: MouseEvent) => {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setOpen(false);
				setSearch("");
			}
		};
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open]);

	const filtered = branches
		.filter((b) => b.name.toLowerCase().includes(search.toLowerCase()))
		.sort((a, b) => {
			if (a.name === defaultBranch) return -1;
			if (b.name === defaultBranch) return 1;
			const aNum = /\d/.test(a.name);
			const bNum = /\d/.test(b.name);
			if (aNum !== bNum) return aNum ? 1 : -1;
			return a.name.localeCompare(b.name);
		});

	function select(ref: string) {
		setOpen(false);
		setSearch("");
		router.push(`/${owner}/${repo}/tree/${ref}`);
	}

	return (
		<div ref={containerRef} className="relative">
			<button
				onClick={() => setOpen(!open)}
				className={cn(
					"flex items-center gap-1 text-xs font-mono cursor-pointer transition-colors",
					"text-muted-foreground hover:text-foreground",
				)}
			>
				<span className="truncate max-w-[100px]">{currentBranch}</span>
				<ChevronDown className="w-2.5 h-2.5 shrink-0 text-muted-foreground/50" />
			</button>

			{open && (
				<div className="absolute right-0 top-full mt-1 z-50 w-56 border border-border bg-card shadow-lg rounded-md overflow-hidden">
					{branches.length > 5 && (
						<div className="p-1.5 border-b border-border">
							<div className="relative">
								<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-2.5 h-2.5 text-muted-foreground/50" />
								<input
									type="text"
									placeholder="Find branch..."
									value={search}
									onChange={(e) =>
										setSearch(
											e.target
												.value,
										)
									}
									className="w-full bg-transparent text-[11px] pl-6 pr-2 py-1 border border-border placeholder:text-muted-foreground focus:outline-none focus:border-foreground/20 rounded-sm"
									autoFocus
								/>
							</div>
						</div>
					)}
					<div className="max-h-48 overflow-y-auto">
						{filtered.map((b) => {
							const active = b.name === currentBranch;
							const isDefault = b.name === defaultBranch;
							return (
								<button
									key={b.name}
									onClick={() =>
										select(b.name)
									}
									className={cn(
										"w-full text-left px-2.5 py-1.5 text-[11px] font-mono hover:bg-muted/60 dark:hover:bg-white/3 transition-colors cursor-pointer flex items-center gap-1.5",
										active &&
											"bg-muted/30",
									)}
								>
									<span className="w-3 shrink-0 flex items-center justify-center">
										{active && (
											<Check className="w-2.5 h-2.5 text-foreground" />
										)}
									</span>
									<span className="truncate flex-1">
										{b.name}
									</span>
									{isDefault && (
										<span className="text-[9px] text-muted-foreground shrink-0">
											default
										</span>
									)}
								</button>
							);
						})}
						{filtered.length === 0 && (
							<div className="px-3 py-3 text-center text-[10px] text-muted-foreground/50 font-mono">
								No branches found
							</div>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
