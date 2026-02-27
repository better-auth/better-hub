"use client";

import { Moon, Sun, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { useColorTheme } from "@/components/theme/theme-provider";
import type { ThemeDefinition } from "@/lib/themes";
import type { UserSettings } from "@/lib/user-settings-store";

interface GeneralTabProps {
	settings: UserSettings;
	onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
}

function ThemeGrid({
	themes,
	activeId,
	mode,
	onSelect,
}: {
	themes: ThemeDefinition[];
	activeId: string;
	mode: "dark" | "light";
	onSelect: (id: string) => void;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
			{themes.map((theme) => {
				const isActive = activeId === theme.id;
				const variant = theme[mode];
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
						<div className="flex items-center gap-1 shrink-0">
							<span
								className="w-4 h-4 rounded-full border border-border/60"
								style={{
									backgroundColor:
										variant.bgPreview,
								}}
							/>
							<span
								className="w-4 h-4 rounded-full border border-border/60"
								style={{
									backgroundColor:
										variant.accentPreview,
								}}
							/>
						</div>

						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-1.5">
								<span className="text-xs font-mono font-medium text-foreground">
									{theme.name}
								</span>
							</div>
							<span className="text-[10px] text-muted-foreground/60">
								{theme.description}
							</span>
						</div>

						{isActive && (
							<Check className="size-3.5 text-success shrink-0" />
						)}
					</button>
				);
			})}
		</div>
	);
}

export function GeneralTab({ settings: _settings, onUpdate: _onUpdate }: GeneralTabProps) {
	const { themeId, mode, setTheme, toggleMode, themes } = useColorTheme();

	return (
		<div className="divide-y divide-border">
			{/* Mode toggle */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					{mode === "dark" ? (
						<Moon className="size-3" />
					) : (
						<Sun className="size-3" />
					)}
					Appearance Mode
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Toggle between dark and light mode.
				</p>
				<div className="flex gap-2">
					<button
						onClick={() => mode === "light" && toggleMode()}
						className={cn(
							"flex items-center gap-2 px-3 py-2 border text-sm transition-colors",
							mode === "dark"
								? "border-foreground/30 bg-muted/50"
								: "border-border hover:border-foreground/10",
						)}
					>
						<Moon className="size-4" />
						<span>Dark</span>
						{mode === "dark" && (
							<Check className="size-3.5 text-success" />
						)}
					</button>
					<button
						onClick={() => mode === "dark" && toggleMode()}
						className={cn(
							"flex items-center gap-2 px-3 py-2 border text-sm transition-colors",
							mode === "light"
								? "border-foreground/30 bg-muted/50"
								: "border-border hover:border-foreground/10",
						)}
					>
						<Sun className="size-4" />
						<span>Light</span>
						{mode === "light" && (
							<Check className="size-3.5 text-success" />
						)}
					</button>
				</div>
			</div>

			{/* Theme selection */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Theme
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Choose a color theme. Each theme has both dark and light
					variants.
				</p>
				<ThemeGrid
					themes={themes}
					activeId={themeId}
					mode={mode}
					onSelect={setTheme}
				/>
			</div>
		</div>
	);
}
