"use client";

import { useEffect, useRef, type ReactNode } from "react";

const STORAGE_KEY = "pkg-tab";

export function MarkdownCopyHandler({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = ref.current;
		if (!container) return;

		// Restore saved preference on mount
		const saved = localStorage.getItem(STORAGE_KEY);
		if (saved != null) {
			syncAllTabs(container, Number(saved));
		}

		function handleClick(e: MouseEvent) {
			const btn = (e.target as HTMLElement).closest<HTMLButtonElement>(
				".ghmd-pkg-copy[data-copy]",
			);
			if (!btn) return;
			const text = btn.dataset.copy;
			if (!text) return;

			navigator.clipboard.writeText(text).then(() => {
				const svg = btn.querySelector("svg");
				if (!svg) return;
				const original = svg.innerHTML;
				svg.innerHTML =
					'<polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
				setTimeout(() => {
					svg.innerHTML = original;
				}, 1500);
			});
		}

		function handleChange(e: Event) {
			const input = e.target as HTMLInputElement;
			if (input.type !== "radio" || !input.closest(".ghmd-pkg-tabs")) return;

			// Determine the tab index (0=npm, 1=yarn, 2=pnpm, 3=bun)
			const group = input.closest(".ghmd-pkg-tabs")!;
			const radios =
				group.querySelectorAll<HTMLInputElement>('input[type="radio"]');
			let tabIndex = 0;
			radios.forEach((r, i) => {
				if (r === input) tabIndex = i;
			});

			localStorage.setItem(STORAGE_KEY, String(tabIndex));
			syncAllTabs(container!, tabIndex, group as HTMLElement);
		}

		container.addEventListener("click", handleClick);
		container.addEventListener("change", handleChange);
		return () => {
			container.removeEventListener("click", handleClick);
			container.removeEventListener("change", handleChange);
		};
	}, []);

	return <div ref={ref}>{children}</div>;
}

function syncAllTabs(container: HTMLElement, tabIndex: number, skip?: HTMLElement) {
	const groups = container.querySelectorAll<HTMLElement>(".ghmd-pkg-tabs");
	for (const group of groups) {
		if (group === skip) continue;
		const radios = group.querySelectorAll<HTMLInputElement>('input[type="radio"]');
		if (radios[tabIndex]) {
			radios[tabIndex].checked = true;
		}
	}
}
