"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import Image from "next/image";
import { History, GitPullRequest, CircleDot, ChevronRight, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { getRecentViews, type RecentViewItem } from "@/lib/recent-views";

export function RecentlyViewed() {
	const [views, setViews] = useState<RecentViewItem[]>([]);
	const [search, setSearch] = useState("");
	const [showSearch, setShowSearch] = useState(false);
	const searchRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		setViews(getRecentViews());
	}, []);

	const filtered = useMemo(() => {
		if (!search) return views;
		const q = search.toLowerCase();
		return views.filter(
			(v) =>
				v.title.toLowerCase().includes(q) ||
				v.subtitle.toLowerCase().includes(q) ||
				(v.number && String(v.number).includes(q)),
		);
	}, [views, search]);

	if (views.length === 0) return null;

	return (
		<section className="flex-1 min-h-0 flex flex-col border border-border">
			<div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border">
				<History className="w-3 h-3 text-muted-foreground/50" />
				<h2 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Recently viewed
				</h2>
				<div className="ml-auto flex items-center">
					{showSearch ? (
						<div className="relative">
							<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
							<input
								ref={searchRef}
								type="text"
								placeholder="Search..."
								value={search}
								onChange={(e) =>
									setSearch(e.target.value)
								}
								onBlur={() => {
									if (!search)
										setShowSearch(
											false,
										);
								}}
								className="w-40 text-[11px] font-mono pl-7 pr-2.5 py-1.5 rounded-md border border-border bg-transparent placeholder:text-muted-foreground focus:outline-none transition-all duration-200"
							/>
						</div>
					) : (
						<button
							type="button"
							onClick={() => {
								setShowSearch(true);
								setTimeout(
									() =>
										searchRef.current?.focus(),
									0,
								);
							}}
							className="p-1.5 text-muted-foreground hover:text-muted-foreground transition-colors cursor-pointer"
						>
							<Search className="w-3 h-3" />
						</button>
					)}
				</div>
			</div>
			<div className="flex-1 min-h-0 overflow-y-auto">
				{filtered.length > 0 ? (
					filtered.map((item) => (
						<RecentViewRow key={item.url} item={item} />
					))
				) : (
					<div className="py-6 text-center">
						<p className="text-[11px] text-muted-foreground font-mono">
							No matches
						</p>
					</div>
				)}
			</div>
		</section>
	);
}

function RecentViewRow({ item }: { item: RecentViewItem }) {
	const icon =
		item.type === "pr" ? (
			<GitPullRequest
				className={cn(
					"w-3.5 h-3.5 shrink-0",
					item.state === "merged"
						? "text-alert-important"
						: item.state === "open"
							? "text-success"
							: "text-muted-foreground/60",
				)}
			/>
		) : item.type === "issue" ? (
			<CircleDot
				className={cn(
					"w-3.5 h-3.5 shrink-0",
					item.state === "open"
						? "text-success"
						: "text-muted-foreground/60",
				)}
			/>
		) : item.image ? (
			<Image
				src={item.image}
				alt=""
				width={16}
				height={16}
				className="w-4 h-4 rounded-sm shrink-0"
			/>
		) : (
			<div className="w-4 h-4 rounded-sm shrink-0 bg-muted flex items-center justify-center text-[8px] font-medium text-muted-foreground">
				{item.title.charAt(0).toUpperCase()}
			</div>
		);

	return (
		<Link
			href={item.url}
			className="group flex items-center gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border last:border-b-0"
		>
			{icon}
			<div className="flex-1 min-w-0">
				<span className="text-xs truncate block group-hover:text-foreground transition-colors">
					{item.title}
					{item.number && (
						<span className="text-muted-foreground/50 ml-1">
							#{item.number}
						</span>
					)}
				</span>
				<div className="flex items-center gap-2 mt-px">
					<span className="text-[11px] font-mono text-muted-foreground/70 truncate">
						{item.subtitle}
					</span>
					<span className="text-[11px] text-muted-foreground/50 shrink-0">
						<TimeAgo
							date={new Date(item.viewedAt).toISOString()}
						/>
					</span>
				</div>
			</div>
			<ChevronRight className="w-3 h-3 text-muted-foreground/30 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
		</Link>
	);
}
