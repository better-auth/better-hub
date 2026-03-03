"use client";

import { useColorTheme } from "@/components/theme/theme-provider";
import { CrescentIcon, StarIcon } from "@/components/shared/icons/star-icon";

export function ThemeToggle() {
	const { mode, toggleMode } = useColorTheme();
	const isDark = mode === "dark";

	return (
		<button
			onClick={(e) => toggleMode(e)}
			className="relative flex items-center w-[34px] h-[18px] rounded-full border border-border bg-muted/60 transition-colors cursor-pointer hover:border-foreground/20"
			title={isDark ? "Switch to light mode" : "Switch to dark mode"}
		>
			<span
				className="absolute top-[2px] flex items-center justify-center w-3 h-3 rounded-full bg-foreground transition-all duration-200"
				style={{ left: isDark ? "2px" : "16px" }}
			>
				{isDark ? (
					<CrescentIcon className="size-[7px] text-background" />
				) : (
					<StarIcon className="size-2 text-background" />
				)}
			</span>
			<span className="sr-only">Toggle theme</span>
		</button>
	);
}
