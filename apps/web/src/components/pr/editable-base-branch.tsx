"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { useRouter } from "next/navigation";
import { GitBranch, ChevronDown, Check, Loader2, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { useClickOutside } from "@/hooks/use-click-outside";
import {
	fetchBranchNames,
	updatePRBaseBranch,
} from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface EditableBaseBranchProps {
	owner: string;
	repo: string;
	pullNumber: number;
	baseBranch: string;
	headBranch: string;
	canEdit: boolean;
}

export function EditableBaseBranch({
	owner,
	repo,
	pullNumber,
	baseBranch,
	headBranch,
	canEdit,
}: EditableBaseBranchProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [open, setOpen] = useState(false);
	const [branches, setBranches] = useState<string[]>([]);
	const [loading, setLoading] = useState(false);
	const [search, setSearch] = useState("");
	const [isPending, startTransition] = useTransition();
	const dropdownRef = useRef<HTMLDivElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);

	useClickOutside(dropdownRef, () => setOpen(false));

	const handleOpen = async () => {
		if (!canEdit || open) return;
		setOpen(true);
		setSearch("");
		if (branches.length === 0) {
			setLoading(true);
			const names = await fetchBranchNames(owner, repo);
			setBranches(names);
			setLoading(false);
		}
		setTimeout(() => searchRef.current?.focus(), 50);
	};

	const handleSelect = (branch: string) => {
		if (branch === baseBranch) {
			setOpen(false);
			return;
		}
		startTransition(async () => {
			const result = await updatePRBaseBranch(owner, repo, pullNumber, branch);
			if (result.success) {
				emit({
					type: "pr:branch-updated",
					owner,
					repo,
					number: pullNumber,
				});
				setOpen(false);
				router.refresh();
			}
		});
	};

	const filtered = branches.filter(
		(b) => b !== headBranch && b.toLowerCase().includes(search.toLowerCase()),
	);

	return (
		<div className="relative inline-flex" ref={dropdownRef}>
			<button
				onClick={handleOpen}
				disabled={!canEdit}
				className={cn(
					"inline-flex items-center gap-0.5 font-mono text-foreground/70 text-[10px] transition-colors",
					canEdit && "hover:text-foreground cursor-pointer",
					!canEdit && "cursor-default",
				)}
			>
				{isPending ? (
					<Loader2 className="w-2.5 h-2.5 animate-spin" />
				) : (
					baseBranch
				)}
				{canEdit && (
					<ChevronDown className="w-2.5 h-2.5 text-muted-foreground/40" />
				)}
			</button>

			{open && (
				<div className="absolute top-full left-0 mt-1.5 z-50 w-56 bg-background border border-border rounded-lg shadow-lg overflow-hidden">
					<div className="px-2 py-1.5 border-b border-border/60">
						<div className="flex items-center gap-1.5">
							<Search className="w-3 h-3 text-muted-foreground/40 shrink-0" />
							<input
								ref={searchRef}
								value={search}
								onChange={(e) =>
									setSearch(e.target.value)
								}
								placeholder="Filter branches..."
								className="flex-1 bg-transparent text-xs font-mono text-foreground placeholder:text-muted-foreground/40 outline-none min-w-0"
							/>
						</div>
					</div>
					<div className="max-h-48 overflow-y-auto">
						{loading ? (
							<div className="flex items-center justify-center py-4">
								<Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/40" />
							</div>
						) : filtered.length === 0 ? (
							<div className="py-3 text-center text-[11px] text-muted-foreground/40 font-mono">
								No branches found
							</div>
						) : (
							filtered.map((branch) => (
								<button
									key={branch}
									onClick={() =>
										handleSelect(branch)
									}
									disabled={isPending}
									className={cn(
										"w-full flex items-center gap-2 px-3 py-1.5 text-left text-xs font-mono transition-colors cursor-pointer",
										"hover:bg-muted/60",
										branch ===
											baseBranch &&
											"text-foreground",
										branch !==
											baseBranch &&
											"text-muted-foreground/70",
										isPending &&
											"opacity-50",
									)}
								>
									<GitBranch className="w-3 h-3 shrink-0 text-muted-foreground/40" />
									<span className="truncate flex-1">
										{branch}
									</span>
									{branch === baseBranch && (
										<Check className="w-3 h-3 shrink-0 text-success" />
									)}
								</button>
							))
						)}
					</div>
				</div>
			)}
		</div>
	);
}
