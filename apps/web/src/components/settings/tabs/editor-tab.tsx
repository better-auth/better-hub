"use client";

import { useState, useRef } from "react";
import { Check, Moon, Sun, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCodeTheme } from "@/components/theme/code-theme-provider";
import { BUILT_IN_THEMES } from "@/lib/code-themes/built-in";
import { CODE_FONTS } from "@/lib/code-themes/fonts";
import type { CodeThemeOption } from "@/lib/code-themes/types";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { HighlightedCodeBlock } from "@/components/shared/highlighted-code-block";

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log("Result:", result);`;

interface CustomThemeItem {
	id: string;
	name: string;
	mode: "dark" | "light";
	bgColor: string;
	fgColor: string;
	accentColor: string;
}

export function EditorTab() {
	const {
		codeThemeDark,
		codeThemeLight,
		codeFont,
		codeFontSize,
		setCodeThemeDark,
		setCodeThemeLight,
		setCodeFont,
		setCodeFontSize,
	} = useCodeTheme();
	const { emit } = useMutationEvents();

	const [customThemes, setCustomThemes] = useState<CustomThemeItem[]>([]);
	const [importError, setImportError] = useState<string | null>(null);
	const [importing, setImporting] = useState(false);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const loadedRef = useRef(false);

	// Load custom themes on mount
	if (!loadedRef.current) {
		loadedRef.current = true;
		fetch("/api/code-themes")
			.then((r) => (r.ok ? r.json() : []))
			.then((themes: CustomThemeItem[]) => setCustomThemes(themes))
			.catch(() => {});
	}

	const darkThemes = BUILT_IN_THEMES.filter((t) => t.mode === "dark");
	const lightThemes = BUILT_IN_THEMES.filter((t) => t.mode === "light");
	const customDark = customThemes.filter((t) => t.mode === "dark");
	const customLight = customThemes.filter((t) => t.mode === "light");

	async function handleImportFile(e: React.ChangeEvent<HTMLInputElement>) {
		const file = e.target.files?.[0];
		if (!file) return;
		setImportError(null);
		setImporting(true);
		try {
			const text = await file.text();
			const json = JSON.parse(text);
			const res = await fetch("/api/code-themes", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					name: json.name || file.name.replace(/\.json$/, ""),
					themeJson: json,
				}),
			});
			if (!res.ok) {
				const err = await res
					.json()
					.catch(() => ({ error: "Import failed" }));
				setImportError(err.error || "Import failed");
			} else {
				const theme = await res.json();
				setCustomThemes((prev) => [theme, ...prev]);
				emit({ type: "code-theme:created" });
			}
		} catch {
			setImportError("Invalid JSON file");
		} finally {
			setImporting(false);
			if (fileInputRef.current) fileInputRef.current.value = "";
		}
	}

	async function handleDeleteCustom(id: string) {
		const res = await fetch("/api/code-themes", {
			method: "DELETE",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ id }),
		});
		if (res.ok) {
			setCustomThemes((prev) => prev.filter((t) => t.id !== id));
			// Reset selection if deleted theme was active
			if (codeThemeDark === id) setCodeThemeDark("vitesse-black");
			if (codeThemeLight === id) setCodeThemeLight("vitesse-light");
			emit({ type: "code-theme:deleted" });
		}
	}

	return (
		<div className="divide-y divide-border overflow-y-auto max-h-[calc(100dvh-220px)]">
			{/* Dark Code Theme */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Dark Code Theme
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Syntax highlighting theme used when the UI is in dark mode.
				</p>
				<ThemeGrid
					themes={[...darkThemes, ...customDark.map(toOption)]}
					activeId={codeThemeDark}
					onSelect={setCodeThemeDark}
					onDelete={(id) =>
						customDark.some((c) => c.id === id) &&
						handleDeleteCustom(id)
					}
					customIds={new Set(customDark.map((c) => c.id))}
				/>
			</div>

			{/* Light Code Theme */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Light Code Theme
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Syntax highlighting theme used when the UI is in light mode.
				</p>
				<ThemeGrid
					themes={[...lightThemes, ...customLight.map(toOption)]}
					activeId={codeThemeLight}
					onSelect={setCodeThemeLight}
					onDelete={(id) =>
						customLight.some((c) => c.id === id) &&
						handleDeleteCustom(id)
					}
					customIds={new Set(customLight.map((c) => c.id))}
				/>
			</div>

			{/* Import Custom Theme */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Import Custom Theme
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Import a VS Code compatible theme JSON file.
				</p>
				<div className="flex items-center gap-2">
					<input
						ref={fileInputRef}
						type="file"
						accept=".json"
						onChange={handleImportFile}
						className="hidden"
					/>
					<button
						onClick={() => fileInputRef.current?.click()}
						disabled={importing}
						className={cn(
							"flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono border border-border",
							"hover:bg-muted/50 transition-colors cursor-pointer",
							importing &&
								"opacity-50 cursor-not-allowed",
						)}
					>
						<Upload className="size-3" />
						{importing ? "Importing..." : "Choose File"}
					</button>
				</div>
				{importError && (
					<p className="text-[11px] text-destructive mt-2">
						{importError}
					</p>
				)}
			</div>

			{/* Code Font */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Code Font
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Font used in code blocks, file viewer, and diffs.
				</p>
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
					{CODE_FONTS.map((font) => {
						const isActive = codeFont === font.id;
						return (
							<button
								key={font.id}
								onClick={() => setCodeFont(font.id)}
								className={cn(
									"group relative flex flex-col border px-3 py-2.5 text-left transition-colors cursor-pointer",
									isActive
										? "border-foreground/30 bg-muted/50 dark:bg-white/[0.04]"
										: "border-border hover:border-foreground/10 hover:bg-muted/30",
								)}
							>
								<div className="flex items-center justify-between">
									<span className="text-xs font-mono font-medium text-foreground">
										{font.name}
									</span>
									{isActive && (
										<Check className="size-3.5 text-success shrink-0" />
									)}
								</div>
								<span
									className="text-[11px] text-muted-foreground mt-1 truncate"
									style={{
										fontFamily: font.family,
									}}
								>
									{`const x = 42; // preview`}
								</span>
							</button>
						);
					})}
				</div>
			</div>

			{/* Font Size */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Font Size
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Code font size in pixels.
				</p>
				<div className="flex items-center gap-3">
					<input
						type="range"
						min={10}
						max={20}
						step={1}
						value={codeFontSize}
						onChange={(e) =>
							setCodeFontSize(Number(e.target.value))
						}
						className="flex-1 accent-foreground"
					/>
					<span className="text-xs font-mono text-muted-foreground w-8 text-right">
						{codeFontSize}px
					</span>
				</div>
			</div>

			{/* Live Preview */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Preview
				</label>
				<div
					className="mt-2 border border-border overflow-hidden"
					style={{
						backgroundColor:
							"var(--code-theme-bg, var(--code-bg))",
					}}
				>
					<div
						className="code-content p-3 overflow-x-auto [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!bg-transparent [&_code]:!bg-transparent"
						style={{
							fontFamily: "var(--code-font-override, var(--font-code)), ui-monospace, monospace",
							fontSize: `var(--code-font-size, 13px)`,
							lineHeight: "20px",
						}}
					>
						<HighlightedCodeBlock
							code={SAMPLE_CODE}
							lang="typescript"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}

function toOption(ct: CustomThemeItem): CodeThemeOption {
	return {
		id: ct.id,
		name: ct.name,
		type: "custom",
		mode: ct.mode,
		bgColor: ct.bgColor,
		fgColor: ct.fgColor,
		accentColor: ct.accentColor,
	};
}

function ThemeGrid({
	themes,
	activeId,
	onSelect,
	onDelete,
	customIds,
}: {
	themes: CodeThemeOption[];
	activeId: string;
	onSelect: (id: string) => void;
	onDelete: (id: string) => void;
	customIds: Set<string>;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
			{themes.map((theme) => {
				const isActive = activeId === theme.id;
				const isCustom = customIds.has(theme.id);
				return (
					<button
						key={theme.id}
						onClick={() => onSelect(theme.id)}
						className={cn(
							"group relative flex items-center gap-3 border px-3 py-2.5 text-left transition-colors cursor-pointer",
							isActive
								? "border-foreground/30 bg-muted/50 dark:bg-white/[0.04]"
								: "border-border hover:border-foreground/10 hover:bg-muted/30",
						)}
					>
						{/* Color preview dots */}
						<div className="flex items-center gap-1 shrink-0">
							<span
								className="w-4 h-4 rounded-full border border-border/60"
								style={{
									backgroundColor:
										theme.bgColor,
								}}
							/>
							<span
								className="w-4 h-4 rounded-full border border-border/60"
								style={{
									backgroundColor:
										theme.accentColor,
								}}
							/>
						</div>

						{/* Name */}
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-1.5">
								<span className="text-xs font-mono font-medium text-foreground truncate">
									{theme.name}
								</span>
								{theme.mode === "dark" ? (
									<Moon className="size-2.5 text-muted-foreground/50 shrink-0" />
								) : (
									<Sun className="size-2.5 text-muted-foreground/50 shrink-0" />
								)}
							</div>
							{isCustom && (
								<span className="text-[10px] text-muted-foreground/60">
									Custom
								</span>
							)}
						</div>

						{/* Actions */}
						<div className="flex items-center gap-1 shrink-0">
							{isActive && (
								<Check className="size-3.5 text-success" />
							)}
							{isCustom && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										onDelete(theme.id);
									}}
									className="opacity-0 group-hover:opacity-100 p-0.5 hover:text-destructive transition-all cursor-pointer"
								>
									<Trash2 className="size-3" />
								</button>
							)}
						</div>
					</button>
				);
			})}
		</div>
	);
}
