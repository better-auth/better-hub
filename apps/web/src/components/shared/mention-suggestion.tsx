"use client";

import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle } from "react";
import { createRoot, type Root } from "react-dom/client";
import { createPortal } from "react-dom";
import Image from "@/components/shared/github-image";
import { cn } from "@/lib/utils";
import type { SuggestionProps, SuggestionKeyDownProps } from "@tiptap/suggestion";

export interface MentionUser {
	login: string;
	avatar_url: string;
}

interface MentionSuggestionListProps {
	items: MentionUser[];
	command: (item: { id: string; label: string; avatar?: string }) => void;
	clientRect: (() => DOMRect | null) | null;
	isLoading?: boolean;
}

export interface MentionSuggestionListRef {
	onKeyDown: (props: SuggestionKeyDownProps) => boolean;
}

export const MentionSuggestionList = forwardRef<
	MentionSuggestionListRef,
	MentionSuggestionListProps
>(function MentionSuggestionList({ items, command, clientRect, isLoading }, ref) {
	const [selectedIndex, setSelectedIndex] = useState(0);

	useEffect(() => {
		setSelectedIndex(0);
	}, [items]);

	const selectItem = useCallback(
		(index: number) => {
			const item = items[index];
			if (item) {
				command({
					id: item.login,
					label: item.login,
					avatar: item.avatar_url,
				});
			}
		},
		[items, command],
	);

	useImperativeHandle(ref, () => ({
		onKeyDown: ({ event }: SuggestionKeyDownProps) => {
			if (event.key === "ArrowUp") {
				setSelectedIndex((i) => (i + items.length - 1) % items.length);
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((i) => (i + 1) % items.length);
				return true;
			}
			if (event.key === "Enter") {
				selectItem(selectedIndex);
				return true;
			}
			if (event.key === "Escape") {
				return true;
			}
			return false;
		},
	}));

	const rect = clientRect?.();
	if (!rect) return null;
	if (items.length === 0 && !isLoading) return null;

	// Estimate dropdown height: ~34px per item, min 40px for loading state
	const rowHeight = 34;
	const estimatedHeight = items.length > 0 ? items.length * rowHeight : 40;
	const gap = 4;
	const spaceBelow = window.innerHeight - rect.bottom - gap;
	const spaceAbove = rect.top - gap;
	const flipAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;

	const dropdown = (
		<div
			className="mention-suggestion"
			style={{
				position: "fixed",
				...(flipAbove
					? {
							bottom: window.innerHeight - rect.top + gap,
							left: rect.left,
						}
					: { top: rect.bottom + gap, left: rect.left }),
				zIndex: 9999,
				maxHeight: flipAbove ? spaceAbove : spaceBelow,
				overflowY: "auto",
			}}
		>
			{items.length === 0 && isLoading ? (
				<div className="mention-suggestion-item text-muted-foreground/50 text-[11px] px-2 py-1.5">
					Searching...
				</div>
			) : (
				items.map((item, index) => (
					<button
						key={item.login}
						className={cn(
							"mention-suggestion-item",
							index === selectedIndex && "is-selected",
						)}
						onClick={() => selectItem(index)}
						onMouseEnter={() => setSelectedIndex(index)}
						type="button"
					>
						<Image
							src={item.avatar_url}
							alt=""
							width={18}
							height={18}
							className="rounded-full shrink-0"
						/>
						<span className="text-[11px] font-mono truncate">
							{item.login}
						</span>
					</button>
				))
			)}
		</div>
	);

	return createPortal(dropdown, document.body);
});

/**
 * Creates a Tiptap suggestion config for @mentions.
 * `participantsRef` is a ref to the current list of conversation participants.
 */
export function createSuggestionConfig(
	participantsRef: React.RefObject<MentionUser[]>,
	ownerRef?: React.RefObject<string>,
) {
	let debounceTimer: ReturnType<typeof setTimeout> | null = null;
	let reactRoot: Root | null = null;
	let containerEl: HTMLDivElement | null = null;
	let currentProps: SuggestionProps | null = null;
	let listRef: MentionSuggestionListRef | null = null;

	function renderDropdown(items: MentionUser[], loading: boolean) {
		if (!containerEl) return;
		if (!reactRoot) {
			reactRoot = createRoot(containerEl);
		}
		reactRoot.render(
			React.createElement(MentionSuggestionList, {
				items,
				command: currentProps!.command,
				clientRect: currentProps!.clientRect ?? null,
				isLoading: loading,
				ref: (r: MentionSuggestionListRef | null) => {
					listRef = r;
				},
			}),
		);
	}

	function maybeSearchAsync(query: string, localItems: MentionUser[]) {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}

		// Only search GitHub if query is 2+ chars and we have few local matches
		if (query.length < 2 || localItems.length >= 5) return;

		renderDropdown(localItems, true);

		debounceTimer = setTimeout(async () => {
			try {
				const org = ownerRef?.current || "";
				const orgParam = org ? `&org=${encodeURIComponent(org)}` : "";
				const res = await fetch(
					`/api/search-users?q=${encodeURIComponent(query)}&per_page=8${orgParam}`,
				);
				if (!res.ok) return;
				const data = await res.json();
				const searchUsers: MentionUser[] = (data.items || []).map(
					(u: { login: string; avatar_url: string }) => ({
						login: u.login,
						avatar_url: u.avatar_url,
					}),
				);

				// Merge: local matches first, then search results (deduplicated)
				const seen = new Set(localItems.map((p) => p.login));
				const merged = [
					...localItems,
					...searchUsers.filter((u) => !seen.has(u.login)),
				].slice(0, 8);

				renderDropdown(merged, false);
			} catch {
				renderDropdown(localItems, false);
			}
		}, 300);
	}

	function cleanup() {
		if (debounceTimer) {
			clearTimeout(debounceTimer);
			debounceTimer = null;
		}
		if (reactRoot) {
			reactRoot.unmount();
			reactRoot = null;
		}
		if (containerEl) {
			containerEl.remove();
			containerEl = null;
		}
		listRef = null;
		currentProps = null;
	}

	return {
		items: ({ query }: { query: string }) => {
			const participants = participantsRef.current || [];
			if (!query) {
				return participants.slice(0, 8);
			}
			const q = query.toLowerCase();
			return participants
				.filter((p) => p.login.toLowerCase().includes(q))
				.slice(0, 8);
		},

		render: () => ({
			onStart: (props: SuggestionProps) => {
				currentProps = props;
				containerEl = document.createElement("div");
				document.body.appendChild(containerEl);
				renderDropdown(props.items as MentionUser[], false);
				maybeSearchAsync(props.query, props.items as MentionUser[]);
			},

			onUpdate: (props: SuggestionProps) => {
				currentProps = props;
				renderDropdown(props.items as MentionUser[], false);
				maybeSearchAsync(props.query, props.items as MentionUser[]);
			},

			onKeyDown: (props: SuggestionKeyDownProps) => {
				if (props.event.key === "Escape") {
					cleanup();
					return true;
				}
				return listRef?.onKeyDown(props) ?? false;
			},

			onExit: () => {
				cleanup();
			},
		}),

		char: "@",
		allowSpaces: false,
		startOfLine: false,
	};
}
