"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings, Check } from "lucide-react";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuLabel,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { getDiffPreferences, setSplitView, setWordWrap } from "@/lib/diff-preferences";

type DiffMode = "single" | "combined";
const PR_VIEW_MODE_EVENT = "pr:view-mode-changed";
const PR_DIFF_LAYOUT_EVENT = "pr:diff-layout-changed";
const PR_WORD_WRAP_EVENT = "pr:word-wrap-changed";

function resolveModeFromUrl(): DiffMode {
	if (typeof window === "undefined") return "single";
	const url = new URL(window.location.href);
	return url.searchParams.get("view") === "combined" ? "combined" : "single";
}

export function PRViewSettingsButton() {
	const [diffMode, setDiffMode] = useState<DiffMode>("single");
	const [splitView, setSplitViewState] = useState(false);
	const [wordWrap, setWordWrapState] = useState(true);

	const syncFromSources = useCallback(() => {
		setDiffMode(resolveModeFromUrl());
		const prefs = getDiffPreferences();
		setSplitViewState(prefs.splitView);
		setWordWrapState(prefs.wordWrap);
	}, []);

	useEffect(() => {
		const onLayoutChanged = (e: Event) => {
			const split = (e as CustomEvent<{ splitView?: boolean }>).detail?.splitView;
			if (typeof split === "boolean") setSplitViewState(split);
			else syncFromSources();
		};
		const onWrapChanged = (e: Event) => {
			const wrap = (e as CustomEvent<{ wordWrap?: boolean }>).detail?.wordWrap;
			if (typeof wrap === "boolean") setWordWrapState(wrap);
			else syncFromSources();
		};

		syncFromSources();
		window.addEventListener("popstate", syncFromSources);
		window.addEventListener(PR_VIEW_MODE_EVENT, syncFromSources as EventListener);
		window.addEventListener(PR_DIFF_LAYOUT_EVENT, onLayoutChanged as EventListener);
		window.addEventListener(PR_WORD_WRAP_EVENT, onWrapChanged as EventListener);
		return () => {
			window.removeEventListener("popstate", syncFromSources);
			window.removeEventListener(
				PR_VIEW_MODE_EVENT,
				syncFromSources as EventListener,
			);
			window.removeEventListener(
				PR_DIFF_LAYOUT_EVENT,
				onLayoutChanged as EventListener,
			);
			window.removeEventListener(
				PR_WORD_WRAP_EVENT,
				onWrapChanged as EventListener,
			);
		};
	}, [syncFromSources]);

	const setMode = useCallback(
		(next: DiffMode) => {
			if (next === diffMode) return;
			setDiffMode(next);
			const url = new URL(window.location.href);
			if (next === "single") url.searchParams.delete("view");
			else url.searchParams.set("view", "combined");
			window.history.replaceState(null, "", url.toString());
			window.dispatchEvent(
				new CustomEvent(PR_VIEW_MODE_EVENT, { detail: { mode: next } }),
			);
		},
		[diffMode],
	);

	const toggleWrap = useCallback(() => {
		const next = !wordWrap;
		setWordWrap(next);
		setWordWrapState(next);
		window.dispatchEvent(
			new CustomEvent(PR_WORD_WRAP_EVENT, { detail: { wordWrap: next } }),
		);
	}, [wordWrap]);

	return (
		<DropdownMenu modal={false}>
			<DropdownMenuTrigger asChild>
				<button
					className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer shrink-0"
					title="View settings"
				>
					<Settings className="w-3 h-3" />
				</button>
			</DropdownMenuTrigger>
			<DropdownMenuContent
				align="end"
				className="w-48"
				onOpenAutoFocus={(e) => e.preventDefault()}
				onCloseAutoFocus={(e) => e.preventDefault()}
			>
				<DropdownMenuLabel className="text-[10px] font-mono">
					File view
				</DropdownMenuLabel>
				<DropdownMenuSeparator />
				<DropdownMenuItem
					onSelect={() => setMode("single")}
					className="text-[11px] font-mono flex items-center justify-between"
				>
					Single file
					{diffMode === "single" && <Check className="w-3 h-3" />}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => setMode("combined")}
					className="text-[11px] font-mono flex items-center justify-between"
				>
					All files
					{diffMode === "combined" && <Check className="w-3 h-3" />}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-[10px] font-mono">
					Diff layout
				</DropdownMenuLabel>
				<DropdownMenuItem
					onSelect={() => {
						setSplitView(false);
						setSplitViewState(false);
						window.dispatchEvent(
							new CustomEvent(PR_DIFF_LAYOUT_EVENT, {
								detail: { splitView: false },
							}),
						);
					}}
					className="text-[11px] font-mono flex items-center justify-between"
				>
					Unified
					{!splitView && <Check className="w-3 h-3" />}
				</DropdownMenuItem>
				<DropdownMenuItem
					onSelect={() => {
						setSplitView(true);
						setSplitViewState(true);
						window.dispatchEvent(
							new CustomEvent(PR_DIFF_LAYOUT_EVENT, {
								detail: { splitView: true },
							}),
						);
					}}
					className="text-[11px] font-mono flex items-center justify-between"
				>
					Split
					{splitView && <Check className="w-3 h-3" />}
				</DropdownMenuItem>
				<DropdownMenuSeparator />
				<DropdownMenuLabel className="text-[10px] font-mono">
					Line wrapping
				</DropdownMenuLabel>
				<DropdownMenuItem
					onSelect={toggleWrap}
					className="text-[11px] font-mono flex items-center justify-between"
				>
					{wordWrap ? "Wrap lines: On" : "Wrap lines: Off"}
					<Check className="w-3 h-3 opacity-0" />
				</DropdownMenuItem>
			</DropdownMenuContent>
		</DropdownMenu>
	);
}
