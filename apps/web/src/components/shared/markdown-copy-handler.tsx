"use client";

import { useEffect, useRef, type ReactNode } from "react";

const STORAGE_KEY = "pkg-tab";

const COPY_SVG =
	'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>';
const CHECK_SVG =
	'<polyline points="20 6 9 17 4 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';

function flashCheck(btn: HTMLButtonElement) {
	const svg = btn.querySelector("svg");
	if (!svg) return;
	const original = svg.innerHTML;
	svg.innerHTML = CHECK_SVG;
	setTimeout(() => {
		svg.innerHTML = original;
	}, 1500);
}

export function MarkdownCopyHandler({ children }: { children: ReactNode }) {
	const ref = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const container = ref.current;
		if (!container) return;

		function injectAll() {
			// Restore saved package-manager preference on mount
			const saved = localStorage.getItem(STORAGE_KEY);
			if (saved != null) {
				syncAllTabs(container!, Number(saved));
			}

			// Inject copy buttons, both for code blocks and headings
			injectCopyButtons(container!);
			injectHeadingCopyButtons(container!);
		}

		// Inject on mount
		injectAll();

		// Re-inject on readme refresh or other DOM changes
		let injecting = false;
		const observer = new MutationObserver(() => {
			if (injecting) return;
			injecting = true;
			injectAll();
			injecting = false;
		});
		observer.observe(container, { childList: true, subtree: true });

		function handleClick(e: MouseEvent) {
			const target = e.target as HTMLElement;

			// Package-manager install copy
			const pkgBtn = target.closest<HTMLButtonElement>(
				".ghmd-pkg-copy[data-copy]",
			);
			if (pkgBtn) {
				const text = pkgBtn.dataset.copy;
				if (text) {
					navigator.clipboard
						.writeText(text)
						.then(() => flashCheck(pkgBtn));
				}
				return;
			}

			// Code block copy
			const codeBtn = target.closest<HTMLButtonElement>(".ghmd-code-copy");
			if (codeBtn) {
				const pre = codeBtn
					.closest(".ghmd-code-block")
					?.querySelector("pre");
				if (pre) {
					navigator.clipboard
						.writeText(pre.textContent || "")
						.then(() => flashCheck(codeBtn));
				}
				return;
			}

			// Heading section copy
			const headingBtn = target.closest<HTMLButtonElement>(".ghmd-heading-copy");
			if (headingBtn) {
				const heading = headingBtn.closest("h1, h2, h3, h4, h5, h6");
				if (heading) {
					const text = getSectionText(heading as HTMLElement);
					navigator.clipboard
						.writeText(text)
						.then(() => flashCheck(headingBtn));
				}
				return;
			}
		}

		function handleChange(e: Event) {
			const input = e.target as HTMLInputElement;
			if (input.type !== "radio" || !input.closest(".ghmd-pkg-tabs")) return;

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
			observer.disconnect();
			container.removeEventListener("click", handleClick);
			container.removeEventListener("change", handleChange);
		};
	}, []);

	return <div ref={ref}>{children}</div>;
}

/**
 * Find every <pre> inside the container and wrap it with a
 * .ghmd-code-block container + a copy button.
 * Skips <pre> inside install-tab panels (.ghmd-pkg-tabs).
 */
function injectCopyButtons(container: HTMLElement) {
	const pres = container.querySelectorAll<HTMLPreElement>("pre");
	for (const pre of pres) {
		// Skip if already wrapped
		if (pre.closest(".ghmd-code-block")) continue;
		// Skip install-tab panels (they have their own copy)
		if (pre.closest(".ghmd-pkg-tabs")) continue;

		const wrapper = document.createElement("div");
		wrapper.className = "ghmd-code-block";
		pre.parentNode!.insertBefore(wrapper, pre);
		wrapper.appendChild(pre);

		const btn = document.createElement("button");
		btn.className = "ghmd-code-copy";
		btn.title = "Copy to clipboard";
		btn.innerHTML = COPY_SVG;
		wrapper.appendChild(btn);
	}
}

/**
 * Inject a copy button on every heading (h1-h6) inside the container.
 */
function injectHeadingCopyButtons(container: HTMLElement) {
	const headings = container.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6");
	for (const heading of headings) {
		if (heading.querySelector(".ghmd-heading-copy")) continue;

		heading.style.position = "relative";

		const btn = document.createElement("button");
		btn.className = "ghmd-heading-copy";
		btn.title = "Copy section";
		btn.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`;
		heading.appendChild(btn);
	}
}

/**
 * Extract the text content of a heading's section: from the heading
 * down to (but not including) the next heading of equal or higher level.
 */
function getSectionText(heading: HTMLElement): string {
	const level = parseInt(heading.tagName[1], 10);
	const lines: string[] = [];

	// Include the heading text itself (without the copy button text)
	const clone = heading.cloneNode(true) as HTMLElement;
	const btn = clone.querySelector(".ghmd-heading-copy");
	if (btn) btn.remove();
	lines.push(clone.textContent?.trim() || "");

	let sibling = heading.nextElementSibling;
	while (sibling) {
		const tag = sibling.tagName;
		if (/^H[1-6]$/i.test(tag)) {
			const sibLevel = parseInt(tag[1], 10);
			if (sibLevel <= level) break;
		}
		lines.push(sibling.textContent?.trim() || "");
		sibling = sibling.nextElementSibling;
	}

	return lines.filter(Boolean).join("\n\n");
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
