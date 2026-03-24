"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
	ArrowLeft,
	Download,
	ExternalLink,
	BadgeCheck,
	Check,
	Loader2,
	Trash2,
	RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/dialog";
import type { ThemeStoreDetail } from "@/lib/theme-store-types";
import { ThemePreview } from "./theme-preview";
import { IconThemePreview } from "./icon-theme-preview";
import { ExtensionIcon } from "./default-theme-icon";
import { UserTooltip } from "../shared/user-tooltip";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

function formatDownloads(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

function formatRelativeDate(iso: string): string {
	const ms = Date.now() - new Date(iso).getTime();
	const sec = Math.floor(ms / 1000);
	if (sec < 60) return "just now";
	const min = Math.floor(sec / 60);
	if (min < 60) return `${min}m ago`;
	const hr = Math.floor(min / 60);
	if (hr < 24) return `${hr}h ago`;
	const days = Math.floor(hr / 24);
	if (days < 30) return `${days}d ago`;
	const months = Math.floor(days / 30);
	if (months < 12) return `${months}mo ago`;
	const years = Math.floor(months / 12);
	return `${years}y ago`;
}

function formatDate(iso: string): string {
	return new Date(iso).toLocaleDateString("en-US", {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
}

export function ThemeDetail({ slug }: { slug: string }) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [ext, setExt] = useState<ThemeStoreDetail | null>(null);
	const [loading, setLoading] = useState(true);
	const [installing, setInstalling] = useState(false);
	const [installed, setInstalled] = useState(false);
	const [unpublishing, setUnpublishing] = useState(false);
	const [unpublishOpen, setUnpublishOpen] = useState(false);
	const [updating, setUpdating] = useState(false);

	useEffect(() => {
		fetch(`/api/theme-store/extensions/${slug}`)
			.then((r) => (r.ok ? r.json() : null))
			.then((data) => {
				if (data && !data.error) {
					setExt(data);
					setInstalled(!!data.installed);
				}
			})
			.finally(() => setLoading(false));
	}, [slug]);

	async function handleInstall() {
		if (!ext) return;
		setInstalling(true);
		try {
			const res = await fetch("/api/theme-store/install", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ customThemeId: ext.id }),
			});
			if (res.ok) {
				const data = await res.json();
				setInstalled(true);
				if (!data.alreadyInstalled) {
					setExt((prev) =>
						prev
							? { ...prev, downloads: prev.downloads + 1 }
							: prev,
					);
				}
				emit({ type: "customTheme:installed", themeType: ext.type });
			}
		} finally {
			setInstalling(false);
		}
	}

	async function handleUninstall() {
		if (!ext) return;
		setInstalling(true);
		try {
			const res = await fetch("/api/theme-store/install", {
				method: "DELETE",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ customThemeId: ext.id }),
			});
			if (res.ok) {
				setInstalled(false);
				setExt((prev) =>
					prev
						? {
								...prev,
								downloads: Math.max(
									0,
									prev.downloads - 1,
								),
							}
						: prev,
				);
				emit({ type: "customTheme:uninstalled", themeType: ext.type });
			}
		} finally {
			setInstalling(false);
		}
	}

	async function handleUnpublish() {
		if (!ext) return;
		setUnpublishing(true);
		try {
			const res = await fetch(`/api/theme-store/extensions/${slug}`, {
				method: "DELETE",
			});
			if (res.ok) {
				setUnpublishOpen(false);
				router.push("/theme-store");
			}
		} finally {
			setUnpublishing(false);
		}
	}

	async function handleUpdate() {
		if (!ext) return;
		setUpdating(true);
		try {
			const res = await fetch(`/api/theme-store/extensions/${slug}`, {
				method: "PATCH",
			});
			if (res.ok) {
				const data = await res.json();
				setExt((prev) => ({
					...data,
					downloads: prev?.downloads ?? data.downloads,
				}));
			}
		} finally {
			setUpdating(false);
		}
	}

	if (loading) {
		return (
			<div className="flex flex-col h-full overflow-y-auto">
				<div className="px-4 sm:px-6 py-3">
					<div className="h-4 w-24 bg-muted/50 rounded animate-pulse" />
				</div>
				<div className="flex-1 px-4 sm:px-6 py-6">
					<div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
						<div className="flex-1 min-w-0 order-2 lg:order-1 space-y-6">
							<div className="border border-border rounded-md p-4 space-y-3">
								<div className="h-48 bg-muted/30 rounded animate-pulse" />
							</div>
							<div className="border border-border rounded-md p-5 space-y-3">
								<div className="h-5 w-48 bg-muted/50 rounded animate-pulse" />
								<div className="h-3 w-full bg-muted/30 rounded animate-pulse" />
								<div className="h-3 w-5/6 bg-muted/30 rounded animate-pulse" />
								<div className="h-3 w-4/6 bg-muted/30 rounded animate-pulse" />
								<div className="h-3 w-full bg-muted/30 rounded animate-pulse" />
								<div className="h-3 w-3/4 bg-muted/30 rounded animate-pulse" />
							</div>
						</div>
						<div className="w-full lg:w-64 shrink-0 order-1 lg:order-2 space-y-4">
							<div className="flex flex-row lg:flex-col items-start gap-4">
								<div className="size-12 sm:size-14 rounded-lg bg-muted/40 animate-pulse shrink-0" />
								<div className="min-w-0 flex-1 space-y-2">
									<div className="h-6 w-40 bg-muted/50 rounded animate-pulse" />
									<div className="h-3 w-full bg-muted/30 rounded animate-pulse" />
									<div className="h-3 w-3/4 bg-muted/30 rounded animate-pulse" />
									<div className="flex gap-2 mt-1">
										<div className="h-5 w-16 bg-muted/30 rounded-full animate-pulse" />
										<div className="h-5 w-10 bg-muted/30 rounded animate-pulse" />
									</div>
								</div>
							</div>
							<div className="border border-border rounded-md divide-y divide-border">
								<div className="p-4 space-y-2">
									<div className="h-3 w-14 bg-muted/40 rounded animate-pulse" />
									<div className="h-4 w-28 bg-muted/30 rounded animate-pulse" />
								</div>
								<div className="p-4 space-y-2">
									<div className="h-3 w-20 bg-muted/40 rounded animate-pulse" />
									<div className="h-4 w-36 bg-muted/30 rounded animate-pulse" />
								</div>
								<div className="p-4 grid grid-cols-2 gap-3">
									<div className="space-y-1">
										<div className="h-3 w-16 bg-muted/40 rounded animate-pulse" />
										<div className="h-5 w-10 bg-muted/30 rounded animate-pulse" />
									</div>
									<div className="space-y-1">
										<div className="h-3 w-14 bg-muted/40 rounded animate-pulse" />
										<div className="h-5 w-12 bg-muted/30 rounded animate-pulse" />
									</div>
								</div>
								<div className="p-4 space-y-1">
									<div className="h-3 w-14 bg-muted/40 rounded animate-pulse" />
									<div className="h-4 w-10 bg-muted/30 rounded animate-pulse" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		);
	}

	if (!ext) {
		return (
			<div className="flex flex-col items-center justify-center py-20 gap-3">
				<p className="text-sm text-muted-foreground">Extension not found</p>
				<Link href="/theme-store">
					<Button variant="outline" size="sm">
						Back to Theme Store
					</Button>
				</Link>
			</div>
		);
	}

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<div className="px-4 sm:px-6 py-3">
				<Link
					href="/theme-store"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="size-3" />
					Theme Store
				</Link>
			</div>

			<div className="flex-1 px-4 sm:px-6 py-6">
				<div className="flex flex-col lg:flex-row gap-6 max-w-5xl mx-auto">
					<div className="flex-1 min-w-0 order-2 lg:order-1">
						{ext.dataJson && (
							<div className="mb-6">
								{ext.type === "theme" ? (
									<ThemePreview
										dataJson={
											ext.dataJson
										}
									/>
								) : (
									<IconThemePreview
										dataJson={
											ext.dataJson
										}
									/>
								)}
							</div>
						)}

						{ext.readmeHtml ? (
							<div className="border border-border rounded-md p-3 sm:p-5">
								<div
									className="ghmd"
									dangerouslySetInnerHTML={{
										__html: ext.readmeHtml,
									}}
								/>
							</div>
						) : (
							<div className="border border-border rounded-md p-8 text-center">
								<p className="text-sm text-muted-foreground/60">
									No README available
								</p>
							</div>
						)}
					</div>

					<div className="w-full lg:w-64 shrink-0 order-1 lg:order-2">
						<div className="flex flex-row lg:flex-col items-start gap-4 mb-5">
							<ExtensionIcon
								iconUrl={ext.iconUrl}
								type={ext.type}
								className="size-12 sm:size-14 rounded-lg shrink-0"
								iconClassName="size-6 sm:size-7"
							/>
							<div className="min-w-0 flex-1">
								<div className="flex items-center gap-2 flex-wrap">
									<h1 className="text-lg sm:text-xl font-semibold text-foreground">
										{ext.name}
									</h1>
									{ext.verified && (
										<BadgeCheck className="size-4 text-primary" />
									)}
								</div>
								<p className="text-sm text-muted-foreground mt-1">
									{ext.description}
								</p>
								<div className="flex items-center gap-3 mt-2">
									<Badge
										variant="outline"
										className="text-[10px]"
									>
										{ext.type ===
										"theme"
											? "Theme"
											: "Icon Theme"}
									</Badge>
									<span className="text-[11px] text-muted-foreground/60">
										v{ext.version}
									</span>
								</div>
							</div>
							<div className="shrink-0">
								{installed ? (
									<Button
										size="sm"
										variant="outline"
										onClick={
											handleUninstall
										}
										disabled={
											installing
										}
									>
										{installing ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : (
											<Check className="size-3.5" />
										)}
										Installed
									</Button>
								) : (
									<Button
										size="sm"
										onClick={
											handleInstall
										}
										disabled={
											installing
										}
									>
										{installing ? (
											<Loader2 className="size-3.5 animate-spin" />
										) : (
											<Download className="size-3.5" />
										)}
										Install
									</Button>
								)}
							</div>
						</div>

						<div className="border border-border rounded-md divide-y divide-border">
							<div className="p-4">
								<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
									Author
								</h3>
								<UserTooltip
									username={ext.authorName}
								>
									<div className="flex items-center gap-2 select-none">
										{ext.authorAvatarUrl && (
											<img
												src={
													ext.authorAvatarUrl
												}
												alt=""
												className="size-5 rounded-full"
											/>
										)}
										<span className="text-xs font-medium text-foreground">
											{
												ext.authorName
											}
										</span>
									</div>
								</UserTooltip>
							</div>
							<div className="p-4">
								<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2">
									Repository
								</h3>
								<a
									href={`https://github.com/${ext.owner}/${ext.repo}`}
									target="_blank"
									rel="noopener noreferrer"
									className="inline-flex items-center gap-1 text-xs text-link hover:underline"
								>
									{ext.owner}/{ext.repo}
									<ExternalLink className="size-3" />
								</a>
							</div>
							<div className="p-4 grid grid-cols-2 gap-3">
								<div>
									<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
										Downloads
									</h3>
									<span className="text-sm font-medium text-foreground">
										{formatDownloads(
											ext.downloads,
										)}
									</span>
								</div>
								<div>
									<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
										Version
									</h3>
									<span className="text-sm font-medium text-foreground">
										{ext.version}
									</span>
								</div>
							</div>
							{ext.license && (
								<div className="p-4">
									<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
										License
									</h3>
									<span className="text-xs text-foreground">
										{ext.license}
									</span>
								</div>
							)}
							<div className="p-4 grid grid-cols-2 gap-3">
								<div>
									<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
										Published
									</h3>
									<span
										className="text-sm font-medium text-foreground"
										title={formatDate(
											ext.createdAt,
										)}
									>
										{formatRelativeDate(
											ext.createdAt,
										)}
									</span>
								</div>
								<div>
									<h3 className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
										Updated
									</h3>
									<span
										className="text-sm font-medium text-foreground"
										title={formatDate(
											ext.updatedAt,
										)}
									>
										{formatRelativeDate(
											ext.updatedAt,
										)}
									</span>
								</div>
							</div>
						</div>

						{ext.isAuthor && (
							<div className="mt-3 flex flex-col gap-2">
								<Button
									variant="outline"
									size="sm"
									className="w-full"
									onClick={handleUpdate}
									disabled={updating}
								>
									{updating ? (
										<Loader2 className="size-3.5 animate-spin" />
									) : (
										<RefreshCw className="size-3.5" />
									)}
									{updating
										? "Updating..."
										: "Update Package"}
								</Button>
								<Dialog
									open={unpublishOpen}
									onOpenChange={
										setUnpublishOpen
									}
								>
									<DialogTrigger asChild>
										<Button
											variant="outline"
											size="sm"
											className="w-full text-destructive hover:text-destructive hover:bg-destructive/10 border-destructive/30"
										>
											<Trash2 className="size-3.5" />
											Unpublish
											Extension
										</Button>
									</DialogTrigger>
									<DialogContent className="sm:max-w-md">
										<DialogHeader>
											<DialogTitle>
												Unpublish
												Extension
											</DialogTitle>
											<DialogDescription>
												This
												will
												permanently
												remove{" "}
												<strong className="text-foreground">
													{
														ext.name
													}
												</strong>{" "}
												from
												the
												theme
												store.
												All
												existing
												installations
												will
												be
												removed.
												This
												action
												cannot
												be
												undone.
											</DialogDescription>
										</DialogHeader>
										<DialogFooter>
											<Button
												variant="outline"
												size="sm"
												onClick={() =>
													setUnpublishOpen(
														false,
													)
												}
												disabled={
													unpublishing
												}
											>
												Cancel
											</Button>
											<Button
												variant="destructive"
												size="sm"
												onClick={
													handleUnpublish
												}
												disabled={
													unpublishing
												}
											>
												{unpublishing ? (
													<Loader2 className="size-3.5 animate-spin" />
												) : (
													<Trash2 className="size-3.5" />
												)}
												{unpublishing
													? "Unpublishing..."
													: "Unpublish"}
											</Button>
										</DialogFooter>
									</DialogContent>
								</Dialog>
							</div>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
