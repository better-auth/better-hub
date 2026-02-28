"use client";

import { useState, useCallback, useMemo, useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Lock, Star, Search } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { formatNumber } from "@/lib/utils";

interface OrgRepo {
	name: string;
	full_name: string;
	description: string | null;
	stargazers_count: number;
	private: boolean;
}

interface RepoBreadcrumbProps {
	owner: string;
	repoName: string;
	ownerType: string;
	ownerAvatarUrl?: string;
}

export function RepoBreadcrumb({
	owner,
	repoName,
	ownerType,
	ownerAvatarUrl,
}: RepoBreadcrumbProps) {
	const router = useRouter();
	const [repos, setRepos] = useState<OrgRepo[] | null>(null);
	const [isLoading, setIsLoading] = useState(false);
	const [hasError, setHasError] = useState(false);
	const [filter, setFilter] = useState("");
	const fetchedRef = useRef(false);
	const inputRef = useRef<HTMLInputElement>(null);

	const isOrg = ownerType === "Organization";

	const fetchOrgRepos = useCallback(async () => {
		if (fetchedRef.current) return;
		fetchedRef.current = true;

		setIsLoading(true);
		setHasError(false);
		try {
			const response = await fetch(
				`/api/org-repos?org=${encodeURIComponent(owner)}`,
			);
			if (!response.ok) throw new Error("Failed to fetch repos");
			const data = await response.json();
			setRepos(data.repos);
		} catch {
			setHasError(true);
			fetchedRef.current = false;
		} finally {
			setIsLoading(false);
		}
	}, [owner]);

	const filteredRepos = useMemo(() => {
		if (!repos) return null;
		if (!filter.trim()) return repos;
		const query = filter.toLowerCase();
		return repos.filter((repo) => repo.name.toLowerCase().includes(query));
	}, [repos, filter]);

	const handleRepoSelect = (selectedRepo: OrgRepo) => {
		if (selectedRepo.name !== repoName) {
			router.push(`/${owner}/${selectedRepo.name}`);
		}
	};

	const handleOpenChange = (open: boolean) => {
		if (open) {
			fetchOrgRepos();
		} else {
			setFilter("");
		}
	};

	return (
		<div className="flex items-center gap-1 text-xs">
			{ownerAvatarUrl && (
				<Image
					src={ownerAvatarUrl}
					alt={owner}
					width={16}
					height={16}
					className="rounded-sm border border-border"
				/>
			)}
			<Link
				href={`/${owner}`}
				className="text-muted-foreground hover:text-foreground transition-colors tracking-tight"
			>
				{owner}
			</Link>
			<span className="text-muted-foreground/30">/</span>
			{isOrg ? (
				<DropdownMenu onOpenChange={handleOpenChange}>
					<DropdownMenuTrigger asChild>
						<button
							suppressHydrationWarning
							className="flex items-center gap-1 font-medium text-foreground hover:text-foreground/80 transition-colors tracking-tight outline-none"
						>
							{repoName}
							<ChevronDown className="w-3 h-3 mt-0.5 text-muted-foreground/50" />
						</button>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="start"
						className="w-72 max-h-80 overflow-hidden flex flex-col p-2"
						onCloseAutoFocus={(e) => e.preventDefault()}
					>
						{isLoading ? (
							<div className="px-2 py-3 text-xs text-muted-foreground/50 text-center">
								Loading...
							</div>
						) : hasError ? (
							<div className="px-2 py-3 text-xs text-muted-foreground text-center">
								Failed to load repositories
							</div>
						) : repos && repos.length > 0 ? (
							<>
								<div className="flex items-center gap-2 px-2 py-1.5 border-b border-border mb-2">
									<Search className="w-3 h-3 text-muted-foreground/50 shrink-0" />
									<input
										ref={inputRef}
										type="text"
										placeholder="Filter repositories..."
										value={filter}
										onChange={(e) =>
											setFilter(
												e
													.target
													.value,
											)
										}
										onKeyDown={(e) =>
											e.stopPropagation()
										}
										className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
										autoFocus
									/>
								</div>
								<div className="overflow-y-auto flex-1">
									{filteredRepos &&
									filteredRepos.length > 0 ? (
										filteredRepos.map(
											(repo) => (
												<DropdownMenuItem
													key={
														repo.name
													}
													onClick={() =>
														handleRepoSelect(
															repo,
														)
													}
													className={`flex flex-col items-start gap-0.5 py-2 cursor-pointer ${
														repo.name ===
														repoName
															? "bg-accent"
															: ""
													}`}
													autoFocus={
														false
													}
												>
													<div className="flex items-center gap-1.5 w-full">
														<span className="font-medium text-xs truncate">
															{
																repo.name
															}
														</span>
														{repo.private && (
															<Lock className="w-3 h-3 text-muted-foreground/50 shrink-0" />
														)}
														<span className="flex items-center gap-0.5 ml-auto text-[10px] text-muted-foreground/60 shrink-0">
															<Star className="size-2 opacity-50" />
															{formatNumber(
																repo.stargazers_count,
															)}
														</span>
													</div>
													<span className="text-[10px] min-h-[14px] text-muted-foreground/70 line-clamp-1">
														{repo.description ??
															null}
													</span>
												</DropdownMenuItem>
											),
										)
									) : (
										<div className="px-2 py-3 text-xs text-muted-foreground text-center">
											No matching
											repositories
										</div>
									)}
								</div>
							</>
						) : (
							<div className="px-2 py-3 text-xs text-muted-foreground text-center">
								No repositories found
							</div>
						)}
					</DropdownMenuContent>
				</DropdownMenu>
			) : (
				<Link
					href={`/${owner}/${repoName}`}
					className="font-medium text-foreground hover:text-foreground/80 transition-colors tracking-tight"
				>
					{repoName}
				</Link>
			)}
		</div>
	);
}
