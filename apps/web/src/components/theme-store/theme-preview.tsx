"use client";

import { useState, useMemo } from "react";
import type { ExtensionThemeData } from "@/lib/theme-store-types";

export function ThemePreview({ dataJson }: { dataJson: string }) {
	const [previewMode, setPreviewMode] = useState<"dark" | "light">("dark");

	const themeData = useMemo<ExtensionThemeData | null>(() => {
		try {
			return JSON.parse(dataJson);
		} catch {
			return null;
		}
	}, [dataJson]);

	if (!themeData) return null;

	const variant = themeData[previewMode];
	if (!variant?.colors) return null;

	const colors = variant.colors;

	return (
		<div className="border border-border rounded-md overflow-hidden">
			<div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
				<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Preview
				</span>
				<div className="flex items-center gap-1 bg-muted/40 border border-border rounded-md p-0.5">
					<button
						onClick={() => setPreviewMode("dark")}
						className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
							previewMode === "dark"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Dark
					</button>
					<button
						onClick={() => setPreviewMode("light")}
						className={`px-2 py-0.5 text-[10px] font-medium rounded-sm transition-colors ${
							previewMode === "light"
								? "bg-background text-foreground shadow-sm"
								: "text-muted-foreground hover:text-foreground"
						}`}
					>
						Light
					</button>
				</div>
			</div>
			<div
				className="p-4 min-h-[180px]"
				style={{
					backgroundColor: colors["--background"],
					color: colors["--foreground"],
				}}
			>
				<div className="flex gap-3 mb-3">
					<div
						className="h-7 w-20 rounded-md"
						style={{ backgroundColor: colors["--primary"] }}
					/>
					<div
						className="h-7 w-16 rounded-md border"
						style={{
							backgroundColor: colors["--secondary"],
							borderColor: colors["--border"],
						}}
					/>
				</div>
				<div
					className="rounded-md border p-3 mb-3"
					style={{
						backgroundColor: colors["--card"],
						borderColor: colors["--border"],
						color: colors["--card-foreground"],
					}}
				>
					<div className="text-xs font-medium mb-1">Card Title</div>
					<div
						className="text-[10px]"
						style={{ color: colors["--muted-foreground"] }}
					>
						This is how card content looks with this theme.
					</div>
				</div>
				<div className="flex gap-2">
					<div
						className="h-5 w-24 rounded-sm"
						style={{ backgroundColor: colors["--accent"] }}
					/>
					<div
						className="h-5 w-16 rounded-sm"
						style={{ backgroundColor: colors["--muted"] }}
					/>
				</div>
				<div className="mt-3 text-[10px] font-mono space-y-0.5">
					<div
						className="px-2 py-0.5 rounded-sm"
						style={{
							backgroundColor: colors["--diff-add-bg"],
							color: colors["--diff-add-text"],
						}}
					>
						+ added line
					</div>
					<div
						className="px-2 py-0.5 rounded-sm"
						style={{
							backgroundColor: colors["--diff-del-bg"],
							color: colors["--diff-del-text"],
						}}
					>
						- removed line
					</div>
				</div>
			</div>
		</div>
	);
}
