"use client";

import { useState, useMemo } from "react";
import type { CustomThemeData } from "@/lib/theme-store-types";

function hsl(v: string | undefined): string {
	if (!v) return "transparent";
	if (v.startsWith("#") || v.startsWith("rgb") || v.startsWith("hsl(")) return v;
	return `hsl(${v})`;
}

type CodeSegment = { text: string; color: string };
type CodeLine = { highlighted?: boolean; segments: CodeSegment[] };

const CODE_PREVIEW_LINES: CodeLine[] = [
	{
		segments: [{ text: "// Fetch user repositories", color: "--muted-foreground" }],
	},
	{
		highlighted: true,
		segments: [
			{ text: "async function ", color: "--foreground" },
			{ text: "fetchRepos", color: "--link" },
			{ text: "(", color: "--foreground" },
			{ text: "user", color: "--warning" },
			{ text: ") {", color: "--foreground" },
		],
	},
	{
		segments: [
			{ text: "  const url = ", color: "--foreground" },
			{ text: '"https://api.github.com"', color: "--success" },
			{ text: ";", color: "--foreground" },
		],
	},
	{
		segments: [
			{ text: "  const res = await ", color: "--foreground" },
			{ text: "fetch", color: "--link" },
			{ text: "(url);", color: "--foreground" },
		],
	},
	{ segments: [{ text: " ", color: "--foreground" }] },
	{
		segments: [
			{ text: "  if (!res.", color: "--foreground" },
			{ text: "ok", color: "--info" },
			{ text: ") {", color: "--foreground" },
		],
	},
	{
		segments: [
			{ text: "    throw new ", color: "--foreground" },
			{ text: "Error", color: "--link" },
			{ text: "(", color: "--foreground" },
			{ text: '"request failed"', color: "--success" },
			{ text: ");", color: "--foreground" },
		],
	},
	{ segments: [{ text: "  }", color: "--foreground" }] },
	{ segments: [{ text: " ", color: "--foreground" }] },
	{
		segments: [
			{ text: "  const repos = await res.", color: "--foreground" },
			{ text: "json", color: "--link" },
			{ text: "();", color: "--foreground" },
		],
	},
	{
		segments: [
			{ text: "  return repos.", color: "--foreground" },
			{ text: "filter", color: "--link" },
			{ text: "(r => r.", color: "--foreground" },
			{ text: "stars", color: "--info" },
			{ text: " > ", color: "--foreground" },
			{ text: "50", color: "--warning" },
			{ text: ");", color: "--foreground" },
		],
	},
	{ segments: [{ text: "}", color: "--foreground" }] },
];

export function ThemePreview({ dataJson }: { dataJson: string }) {
	const [previewMode, setPreviewMode] = useState<"dark" | "light">("dark");

	const themeData = useMemo<CustomThemeData | null>(() => {
		try {
			return JSON.parse(dataJson);
		} catch {
			return null;
		}
	}, [dataJson]);

	if (!themeData) return null;

	const variant = themeData[previewMode];
	if (!variant?.colors) return null;

	const c = variant.colors;

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
				className="p-4 space-y-3"
				style={{
					backgroundColor: hsl(c["--background"]),
					color: hsl(c["--foreground"]),
				}}
			>
				{/* Buttons row */}
				<div className="flex items-center gap-2">
					<div
						className="h-7 px-3 rounded-md flex items-center text-[10px] font-medium"
						style={{
							backgroundColor: hsl(c["--primary"]),
							color: hsl(c["--primary-foreground"]),
						}}
					>
						Primary
					</div>
					<div
						className="h-7 px-3 rounded-md flex items-center text-[10px] font-medium"
						style={{
							backgroundColor: hsl(c["--secondary"]),
							color: hsl(c["--secondary-foreground"]),
						}}
					>
						Secondary
					</div>
					<div
						className="h-7 px-3 rounded-md flex items-center text-[10px] font-medium text-white"
						style={{
							backgroundColor: hsl(c["--destructive"]),
						}}
					>
						Delete
					</div>
					<div
						className="h-7 px-3 rounded-md flex items-center text-[10px] font-medium text-white"
						style={{
							backgroundColor: hsl(c["--success"]),
						}}
					>
						Save
					</div>
				</div>

				{/* Card with text, link, input, inline code */}
				<div
					className="rounded-md border p-3 space-y-2.5"
					style={{
						backgroundColor: hsl(c["--card"]),
						borderColor: hsl(c["--border"]),
						color: hsl(c["--card-foreground"]),
					}}
				>
					<div className="flex items-center justify-between">
						<div className="text-xs font-medium">
							Repository Overview
						</div>
						<div
							className="text-[10px] px-1.5 py-0.5 rounded-full border font-medium"
							style={{
								borderColor: hsl(c["--border"]),
								color: hsl(c["--muted-foreground"]),
							}}
						>
							v2.1.0
						</div>
					</div>
					<div
						className="text-[10px] leading-relaxed"
						style={{
							color: hsl(c["--muted-foreground"]),
						}}
					>
						A modern UI toolkit with{" "}
						<span
							className="underline underline-offset-2 cursor-pointer"
							style={{ color: hsl(c["--link"]) }}
						>
							full documentation
						</span>{" "}
						and built-in support for{" "}
						<span
							className="px-1 py-0.5 rounded text-[9px] font-mono"
							style={{
								backgroundColor: hsl(
									c["--inline-code-bg"],
								),
							}}
						>
							dark mode
						</span>
						.
					</div>

					<div
						className="h-7 rounded-md border px-2.5 flex items-center text-[10px]"
						style={{
							borderColor: hsl(c["--input"]),
							backgroundColor: hsl(c["--background"]),
							color: hsl(c["--muted-foreground"]),
						}}
					>
						Search files...
					</div>
				</div>

				{/* Code block */}
				<div
					className="rounded-md border overflow-hidden text-[10px] font-mono"
					style={{
						borderColor: hsl(c["--border"]),
						backgroundColor: hsl(c["--code-block-bg"]),
					}}
				>
					{CODE_PREVIEW_LINES.map((line, i) => (
						<div
							key={i}
							className="flex"
							style={
								line.highlighted
									? {
											backgroundColor:
												hsl(
													c[
														"--line-highlight"
													],
												),
										}
									: undefined
							}
						>
							<div
								className="w-8 shrink-0 text-right pr-2 py-0.5 select-none"
								style={{
									color: hsl(
										c["--line-gutter"],
									),
								}}
							>
								{i + 1}
							</div>
							<div className="py-0.5 px-2">
								{line.segments.map((seg, j) => (
									<span
										key={j}
										style={{
											color: hsl(
												c[
													seg.color as keyof typeof c
												],
											),
										}}
									>
										{seg.text}
									</span>
								))}
							</div>
						</div>
					))}
				</div>

				{/* Diff */}
				<div
					className="rounded-md border overflow-hidden text-[10px] font-mono"
					style={{ borderColor: hsl(c["--border"]) }}
				>
					<div
						className="flex"
						style={{ backgroundColor: hsl(c["--diff-del-bg"]) }}
					>
						<div
							className="w-8 shrink-0 text-right pr-2 py-0.5 select-none"
							style={{
								color: hsl(c["--diff-del-gutter"]),
							}}
						>
							4
						</div>
						<div
							className="w-4 shrink-0 text-center py-0.5"
							style={{
								color: hsl(c["--diff-del-text"]),
							}}
						>
							-
						</div>
						<div
							className="py-0.5 pr-2"
							style={{
								color: hsl(c["--diff-del-text"]),
							}}
						>
							const old ={" "}
							<span
								className="px-0.5 rounded-sm"
								style={{
									backgroundColor: hsl(
										c[
											"--diff-word-del"
										],
									),
								}}
							>
								&quot;deprecated&quot;
							</span>
						</div>
					</div>
					<div
						className="flex"
						style={{ backgroundColor: hsl(c["--diff-add-bg"]) }}
					>
						<div
							className="w-8 shrink-0 text-right pr-2 py-0.5 select-none"
							style={{
								color: hsl(c["--diff-add-gutter"]),
							}}
						>
							4
						</div>
						<div
							className="w-4 shrink-0 text-center py-0.5"
							style={{
								color: hsl(c["--diff-add-text"]),
							}}
						>
							+
						</div>
						<div
							className="py-0.5 pr-2"
							style={{
								color: hsl(c["--diff-add-text"]),
							}}
						>
							const val ={" "}
							<span
								className="px-0.5 rounded-sm"
								style={{
									backgroundColor: hsl(
										c[
											"--diff-word-add"
										],
									),
								}}
							>
								&quot;updated&quot;
							</span>
						</div>
					</div>
				</div>

				{/* Bottom row: contribution graph + alerts */}
				<div className="flex items-end justify-between gap-3">
					{/* Contribution graph */}
					<div className="flex gap-[3px]">
						{[
							[0, 1, 2, 0, 3],
							[1, 0, 3, 4, 2],
							[0, 2, 4, 1, 0],
							[3, 1, 0, 2, 4],
							[2, 4, 1, 3, 0],
							[0, 3, 2, 0, 1],
							[1, 0, 4, 3, 2],
						].map((col, ci) => (
							<div
								key={ci}
								className="flex flex-col gap-[3px]"
							>
								{col.map((level, ri) => (
									<div
										key={ri}
										className="size-[7px] rounded-[2px]"
										style={{
											backgroundColor:
												hsl(
													c[
														`--contrib-${level}` as keyof typeof c
													],
												),
										}}
									/>
								))}
							</div>
						))}
					</div>

					{/* Alert badges */}
					<div className="flex gap-1.5 flex-wrap justify-end">
						{(
							[
								["Note", "--alert-note"],
								["Tip", "--alert-tip"],
								["Warn", "--alert-warning"],
								["Err", "--alert-caution"],
							] as const
						).map(([label, key]) => (
							<div
								key={label}
								className="text-[9px] font-medium px-1.5 py-0.5 rounded-sm border"
								style={{
									borderColor: hsl(
										c[
											key as keyof typeof c
										],
									),
									color: hsl(
										c[
											key as keyof typeof c
										],
									),
								}}
							>
								{label}
							</div>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
