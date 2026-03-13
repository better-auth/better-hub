"use client";

import { useState } from "react";
import Link from "next/link";
import { Download, BadgeCheck, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ThemeStoreListItem } from "@/lib/theme-store-types";
import { ExtensionIcon } from "./default-theme-icon";

function hsl(v: string): string {
	if (v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl(")) return v;
	return `hsl(${v})`;
}

function ThemeColorPreview({ colors }: { colors: string[] }) {
	return (
		<div className="flex items-center gap-1">
			{colors.map((c, i) => (
				<div
					key={i}
					className="size-4 rounded-full ring-1 ring-border/40"
					style={{ backgroundColor: hsl(c) }}
				/>
			))}
		</div>
	);
}

function IconPreview({ urls }: { urls: string[] }) {
	return (
		<div className="flex items-center gap-1.5">
			{urls.map((url, i) => (
				<img
					key={i}
					src={url}
					alt=""
					className="size-4 object-contain"
					loading="lazy"
				/>
			))}
		</div>
	);
}

function formatDownloads(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return String(n);
}

export function ExtensionCard({
	ext,
	installed,
	onInstall,
	onUninstall,
}: {
	ext: ThemeStoreListItem;
	installed?: boolean;
	onInstall?: (id: string) => Promise<void>;
	onUninstall?: (id: string) => Promise<void>;
}) {
	const [busy, setBusy] = useState(false);

	async function handleToggle(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		if (busy) return;
		setBusy(true);
		try {
			if (installed) {
				await onUninstall?.(ext.id);
			} else {
				await onInstall?.(ext.id);
			}
		} finally {
			setBusy(false);
		}
	}

	return (
		<div className="relative h-full">
			<button
				type="button"
				onClick={handleToggle}
				disabled={busy}
				className={cn(
					"absolute top-2.5 right-2.5 z-10 flex items-center gap-1 px-2 py-0.5 rounded-sm text-[10px] font-medium transition-colors cursor-pointer",
					installed
						? "bg-primary/10 text-primary hover:bg-destructive/15 hover:text-destructive"
						: "bg-muted text-muted-foreground hover:bg-primary/10 hover:text-primary",
				)}
			>
				{busy ? (
					<Loader2 className="size-3 animate-spin" />
				) : installed ? (
					"Uninstall"
				) : (
					"Install"
				)}
			</button>
			<Link
				href={`/theme-store/${ext.slug}`}
				className={cn(
					"flex flex-col gap-3 border p-4 transition-colors rounded-md h-full",
					installed
						? "border-primary/30 bg-primary/[0.03] hover:border-primary/40 hover:bg-primary/[0.05]"
						: "border-border hover:border-foreground/15 hover:bg-muted/30",
				)}
			>
				<div className="flex items-start gap-3">
					<ExtensionIcon
						iconUrl={ext.iconUrl}
						type={ext.type}
						className="size-10 rounded-md"
						iconClassName="size-5"
					/>
					<div className="min-w-0 flex-1">
						<div className="flex items-center gap-1.5">
							<span className="text-sm font-medium text-foreground truncate">
								{ext.name}
							</span>
							{ext.verified && (
								<BadgeCheck className="size-3.5 text-primary shrink-0" />
							)}
						</div>
						<p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
							{ext.description}
						</p>
					</div>
				</div>
				{ext.previewColors && ext.previewColors.length > 0 && (
					<ThemeColorPreview colors={ext.previewColors} />
				)}
				{ext.previewIconUrls && ext.previewIconUrls.length > 0 && (
					<IconPreview urls={ext.previewIconUrls} />
				)}
				<div className="flex items-center justify-between mt-auto">
					<div className="flex items-center gap-2">
						{ext.authorAvatarUrl && (
							<img
								src={ext.authorAvatarUrl}
								alt=""
								className="size-4 rounded-full"
							/>
						)}
						<span className="text-[11px] text-muted-foreground/70 font-mono">
							{ext.authorName}
						</span>
					</div>
					<div className="flex items-center gap-3">
						<Badge
							variant="outline"
							className="text-[10px] px-1.5 py-0"
						>
							{ext.type === "theme" ? "Theme" : "Icons"}
						</Badge>
						<span className="flex items-center gap-1 text-[11px] text-muted-foreground/60">
							<Download className="size-3" />
							{formatDownloads(ext.downloads)}
						</span>
					</div>
				</div>
			</Link>
		</div>
	);
}
