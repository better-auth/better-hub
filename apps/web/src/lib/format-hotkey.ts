/**
 * Formats a hotkey for display in the UI.
 * Mac: symbols (⌘K). Windows/Linux: text (Ctrl+K).
 * SSR-safe: defaults to Ctrl style when navigator is undefined.
 */
export function formatHotkeyForDisplay(hotkey: string): string {
	const isMac =
		typeof navigator !== "undefined" &&
		/Mac|iPhone|iPad/.test(navigator.userAgent || navigator.platform || "");

	// Mod = Command on Mac, Ctrl on Windows/Linux
	const modLabel = isMac ? "⌘" : "Ctrl";

	// Parse "Mod+K", "Mod+/", "Mod+Enter" etc.
	const modMatch = hotkey.match(/^Mod\+(.+)$/i);
	if (!modMatch) return hotkey;

	const keyPart = modMatch[1];
	const keySymbols: Record<string, string> = {
		Enter: "↵",
		Escape: "Esc",
		Backspace: "⌫",
		Delete: "⌦",
		Tab: "⇥",
		Space: "␣",
	};
	const keyDisplay = keySymbols[keyPart] ?? keyPart;

	return isMac ? `${modLabel}${keyDisplay}` : `${modLabel}+${keyDisplay}`;
}
