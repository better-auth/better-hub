"use client";

import { useState, useEffect } from "react";

/**
 * Detects if the user is on macOS/iOS for modifier key display (Command vs Ctrl).
 * Returns false during SSR and until client hydration to avoid hydration mismatch.
 */
export function useIsMac(): boolean {
	const [isMac, setIsMac] = useState(false);

	useEffect(() => {
		setIsMac(
			typeof navigator !== "undefined" &&
				/Mac|iPhone|iPad/.test(
					navigator.userAgent || navigator.platform || "",
				),
		);
		return () => {};
	}, []);

	return isMac;
}
