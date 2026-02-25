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
	onSelect,
}: {
	themes: ThemeDefinition[];
	activeId: string;
	onSelect: (id: string) => void;
}) {
	return (
		<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
			{themes.map((theme) => {
				const isActive = activeId === theme.id;
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
										theme.bgPreview,
								}}
							/>
							<span
								className="w-4 h-4 rounded-full border border-border/60"
								style={{
									backgroundColor:
										theme.accentPreview,
								}}
							/>
						</div>

						{/* Name + description */}
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

						{/* Check */}
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
	const { setColorTheme, darkThemes, lightThemes, darkThemeId, lightThemeId } =
		useColorTheme();

	return (
		<div className="divide-y divide-border">
			{/* Dark themes */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					<Moon className="size-3" />
					Dark Theme
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Used when dark mode is active.
				</p>
				<ThemeGrid
					themes={darkThemes}
					activeId={darkThemeId}
					onSelect={setColorTheme}
				/>
			</div>

			{/* Light themes */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					<Sun className="size-3" />
					Light Theme
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Used when light mode is active.
				</p>
				<ThemeGrid
					themes={lightThemes}
					activeId={lightThemeId}
					onSelect={setColorTheme}
				/>
			</div>
		</div>
	);
}
