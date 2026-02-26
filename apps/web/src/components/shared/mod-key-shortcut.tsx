"use client";

import { Command } from "lucide-react";
import { formatHotkeyForDisplay } from "@/lib/format-hotkey";
import { useIsMac } from "@/hooks/use-platform";
import { cn } from "@/lib/utils";

interface ModKeyShortcutProps {
	/** Hotkey string (e.g. "Mod+K", "Mod+/") */
	hotkey: string;
	/** Optional class for the wrapper span */
	className?: string;
	/** Optional class for the Command icon (Mac only) */
	iconClassName?: string;
}

/**
 * Displays a Mod-based shortcut with platform-appropriate formatting:
 * - Mac: Command icon + key
 * - Windows/Linux: "Ctrl" + key
 */
export function ModKeyShortcut({ hotkey, className, iconClassName }: ModKeyShortcutProps) {
	const isMac = useIsMac();

	if (isMac) {
		// Parse hotkey to get the key part (e.g. "K" from "Mod+K")
		// For compound shortcuts (Mod+Shift+K), fall back to formatHotkeyForDisplay
		const match = hotkey.match(/^Mod\+([^+]+)$/i);
		if (!match) {
			return (
				<span className={className} suppressHydrationWarning>
					{formatHotkeyForDisplay(hotkey)}
				</span>
			);
		}
		const keyPart = match[1];
		return (
			<span
				className={cn("inline-flex items-center gap-0.5", className)}
				suppressHydrationWarning
			>
				<Command className={cn("w-2 h-2", iconClassName)} />
				{keyPart}
			</span>
		);
	}

	return (
		<span className={className} suppressHydrationWarning>
			{formatHotkeyForDisplay(hotkey)}
		</span>
	);
}
