"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import {
	Search,
	Plus,
	Palette,
	FolderTree,
	Layers,
	CheckCircle2,
	CircleDashed,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ExtensionCard } from "./theme-card";
import { DocsDialog } from "./docs-dialog";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import Link from "next/link";
import type { ThemeStoreListItem, CustomThemeType } from "@/lib/theme-store-types";

type FilterType = "all" | CustomThemeType;
type InstallFilter = "all" | "installed" | "not-installed";

const TYPE_FILTERS: {
	id: FilterType;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "all", label: "All", icon: Layers },
	{ id: "theme", label: "Themes", icon: Palette },
	{ id: "icon-theme", label: "Icons", icon: FolderTree },
];

const INSTALL_FILTERS: {
	id: InstallFilter;
	label: string;
	icon: React.ComponentType<{ className?: string }>;
}[] = [
	{ id: "all", label: "All", icon: Layers },
	{ id: "installed", label: "Installed", icon: CheckCircle2 },
	{ id: "not-installed", label: "Not Installed", icon: CircleDashed },
];

export function ThemeStoreBrowse() {
	const [extensions, setExtensions] = useState<ThemeStoreListItem[]>([]);
	const [total, setTotal] = useState(0);
	const [loading, setLoading] = useState(true);
	const [search, setSearch] = useState("");
	const [filter, setFilter] = useState<FilterType>("all");
	const [installFilter, setInstallFilter] = useState<InstallFilter>("all");
	const [page, setPage] = useState(1);
	const [installedIds, setInstalledIds] = useState<Set<string>>(new Set());
	const installedLoaded = useRef(false);
	const { emit } = useMutationEvents();
	const extensionsRef = useRef(extensions);
	extensionsRef.current = extensions;

	useEffect(() => {
		if (installedLoaded.current) return;
		installedLoaded.current = true;

		fetch("/api/theme-store/installed")
			.then((r) => (r.ok ? r.json() : []))
			.then((exts: Array<{ id: string }>) => {
				setInstalledIds(new Set(exts.map((e) => e.id)));
			})
			.catch(() => {});
	}, []);

	const handleInstall = useCallback(
		async (id: string) => {
			const res = await fetch("/api/theme-store/install", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ customThemeId: id }),
			});
			if (res.ok) {
				const data = await res.json();
				setInstalledIds((prev) => new Set(prev).add(id));
				if (!data.alreadyInstalled) {
					setExtensions((prev) =>
						prev.map((e) =>
							e.id === id
								? {
										...e,
										downloads:
											e.downloads +
											1,
									}
								: e,
						),
					);
				}
				const ext = extensionsRef.current.find((e) => e.id === id);
				if (ext) {
					emit({
						type: "customTheme:installed",
						themeType: ext.type,
					});
				}
			}
		},
		[emit],
	);

	const handleUninstall = useCallback(async (id: string) => {
		const ext = extensionsRef.current.find((e) => e.id === id);
		const res = await fetch("/api/theme-store/install", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ customThemeId: id }),
		});
		if (res.ok) {
			setInstalledIds((prev) => {
				const next = new Set(prev);
				next.delete(id);
				return next;
			});
			setExtensions((prev) =>
				prev.map((e) =>
					e.id === id
						? { ...e, downloads: Math.max(0, e.downloads - 1) }
						: e,
				),
			);
			if (ext) {
				emit({ type: "customTheme:uninstalled", themeType: ext.type });
			}
		}
	}, []);

	const fetchExtensions = useCallback(async () => {
		setLoading(true);
		const params = new URLSearchParams();
		if (filter !== "all") params.set("type", filter);
		if (search.trim()) params.set("search", search.trim());
		params.set("page", String(page));

		try {
			const res = await fetch(`/api/theme-store/extensions?${params}`);
			if (res.ok) {
				const data = await res.json();
				setExtensions(data.items);
				setTotal(data.total);
			}
		} finally {
			setLoading(false);
		}
	}, [filter, search, page]);

	useEffect(() => {
		const timer = setTimeout(fetchExtensions, search ? 300 : 0);
		return () => clearTimeout(timer);
	}, [fetchExtensions, search]);

	useEffect(() => {
		setPage(1);
	}, [filter, search]);

	const filteredExtensions =
		installFilter === "all"
			? extensions
			: extensions.filter((ext) =>
					installFilter === "installed"
						? installedIds.has(ext.id)
						: !installedIds.has(ext.id),
				);

	const perPage = 24;
	const totalPages = Math.ceil(total / perPage);

	return (
		<div className="flex flex-col h-full">
			<div className="border-b border-border px-4 sm:px-6 py-4">
				<div className="flex items-center justify-between gap-3 mb-4">
					<div className="min-w-0">
						<h1 className="text-lg font-semibold text-foreground">
							Theme Store
						</h1>
						<p className="text-xs text-muted-foreground mt-0.5 hidden sm:block">
							Discover and install themes and icon packs
						</p>
					</div>
					<div className="flex items-center gap-2 shrink-0">
						<DocsDialog />
						<Link href="/theme-store/publish">
							<Button
								size="sm"
								variant="outline"
								className="gap-1.5"
							>
								<Plus className="size-3.5" />
								<span className="hidden sm:inline">
									Publish
								</span>
							</Button>
						</Link>
					</div>
				</div>

				<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
					<div className="relative flex-1 sm:max-w-sm">
						<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground/50" />
						<input
							type="text"
							placeholder="Search extensions..."
							value={search}
							onChange={(e) => setSearch(e.target.value)}
							className="w-full h-8 pl-8 pr-3 text-xs bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
						/>
					</div>
					<div className="flex items-center gap-1 bg-muted/40 border border-border rounded-md p-0.5 self-start">
						{TYPE_FILTERS.map((f) => (
							<button
								key={f.id}
								onClick={() => setFilter(f.id)}
								className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors ${
									filter === f.id
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								<f.icon className="size-3" />
								{f.label}
							</button>
						))}
					</div>
					<div className="flex items-center gap-1 bg-muted/40 border border-border rounded-md p-0.5 self-start">
						{INSTALL_FILTERS.map((f) => (
							<button
								key={f.id}
								onClick={() =>
									setInstallFilter(f.id)
								}
								className={`flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium rounded-sm transition-colors ${
									installFilter === f.id
										? "bg-background text-foreground shadow-sm"
										: "text-muted-foreground hover:text-foreground"
								}`}
							>
								<f.icon className="size-3" />
								{f.label}
							</button>
						))}
					</div>
				</div>
			</div>

			<div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
				{loading && extensions.length === 0 ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
						{Array.from({ length: 6 }).map((_, i) => (
							<div
								key={i}
								className="h-32 border border-border bg-muted/20 animate-pulse rounded-md"
							/>
						))}
					</div>
				) : filteredExtensions.length === 0 ? (
					<div className="flex flex-col items-center justify-center py-20 text-center">
						<Layers className="size-10 text-muted-foreground/30 mb-3" />
						<p className="text-sm text-muted-foreground">
							No extensions found
						</p>
						<p className="text-xs text-muted-foreground/60 mt-1">
							{search
								? "Try a different search term"
								: installFilter !== "all"
									? "No matching extensions for this filter"
									: "Be the first to publish an extension"}
						</p>
					</div>
				) : (
					<>
						<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
							{filteredExtensions.map((ext) => (
								<ExtensionCard
									key={ext.id}
									ext={ext}
									installed={installedIds.has(
										ext.id,
									)}
									onInstall={handleInstall}
									onUninstall={
										handleUninstall
									}
								/>
							))}
						</div>
						{totalPages > 1 && (
							<div className="flex items-center justify-center gap-2 mt-6">
								<Button
									size="sm"
									variant="outline"
									disabled={page <= 1}
									onClick={() =>
										setPage(
											(p) =>
												p -
												1,
										)
									}
								>
									Previous
								</Button>
								<span className="text-xs text-muted-foreground">
									Page {page} of {totalPages}
								</span>
								<Button
									size="sm"
									variant="outline"
									disabled={
										page >= totalPages
									}
									onClick={() =>
										setPage(
											(p) =>
												p +
												1,
										)
									}
								>
									Next
								</Button>
							</div>
						)}
					</>
				)}
			</div>
		</div>
	);
}
