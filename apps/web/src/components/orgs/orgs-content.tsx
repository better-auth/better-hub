"use client";

import { useMemo, useState } from "react";
import Image from "@/components/shared/ghes-image";
import Link from "next/link";
import { Building2, ChevronRight, ExternalLink, Search } from "lucide-react";

export interface OrgListItem {
	id: number;
	login: string;
	avatar_url: string;
	description: string | null;
	html_url: string;
}

export function OrgsContent({ orgs }: { orgs: OrgListItem[] }) {
	const [search, setSearch] = useState("");

	const filtered = useMemo(() => {
		const query = search.trim().toLowerCase();
		if (!query) return orgs;

		return orgs.filter((org) =>
			[org.login, org.description ?? ""].join(" ").toLowerCase().includes(query),
		);
	}, [orgs, search]);

	return (
		<div className="flex flex-col flex-1 min-h-0">
			<div className="shrink-0 mb-4">
				<h1 className="text-xl font-medium tracking-tight">
					Organizations
				</h1>
				<p className="text-sm text-muted-foreground/70 mt-0.5">
					Browse organizations first, then open each one for
					repository details
				</p>
				<div className="w-16 h-px bg-foreground/20 mt-3" />
				<p className="text-xs text-muted-foreground/50 font-mono mt-3">
					Showing {filtered.length} of {orgs.length} organizations
				</p>
			</div>

			<div className="shrink-0 pb-2">
				<div className="relative max-w-sm">
					<Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground/70" />
					<input
						type="text"
						placeholder="Find an organization..."
						value={search}
						onChange={(e) => setSearch(e.target.value)}
						className="w-full bg-transparent border border-border pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground/70 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md"
					/>
				</div>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto border border-border divide-y divide-border">
				{filtered.map((org) => (
					<div
						key={org.id}
						className="group flex items-center gap-4 px-4 py-3 hover:bg-muted/60 dark:hover:bg-white/3 transition-colors"
					>
						<Link
							href={`/${org.login}`}
							className="flex items-center gap-4 flex-1 min-w-0"
						>
							<Image
								src={org.avatar_url}
								alt={org.login}
								width={26}
								height={26}
								className="rounded-md shrink-0 border border-border"
							/>

							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-sm text-foreground group-hover:text-foreground transition-colors font-mono">
										{org.login}
									</span>
									<span className="text-[9px] font-mono px-1 py-0.5 border border-border text-muted-foreground/70 uppercase tracking-wider">
										org
									</span>
								</div>

								{org.description ? (
									<p className="text-[11px] text-muted-foreground mt-1 truncate max-w-xl">
										{org.description}
									</p>
								) : (
									<p className="text-[11px] text-muted-foreground/60 mt-1 italic">
										No organization
										description
									</p>
								)}
							</div>
						</Link>

						<div className="flex items-center gap-3 shrink-0">
							<a
								href={org.html_url}
								target="_blank"
								rel="noreferrer"
								className="text-[11px] text-muted-foreground/70 hover:text-foreground inline-flex items-center gap-1"
							>
								GitHub
								<ExternalLink className="w-3 h-3" />
							</a>
							<Link href={`/${org.login}`}>
								<ChevronRight className="w-3 h-3 text-foreground/15 opacity-0 group-hover:opacity-100 transition-opacity" />
							</Link>
						</div>
					</div>
				))}

				{filtered.length === 0 && (
					<div className="py-16 text-center">
						<Building2 className="w-6 h-6 text-muted-foreground/30 mx-auto mb-3" />
						<p className="text-xs text-muted-foreground font-mono">
							No organizations found
						</p>
						<p className="text-xs text-muted-foreground/50 font-mono mt-1">
							Try a different search query
						</p>
					</div>
				)}
			</div>
		</div>
	);
}
