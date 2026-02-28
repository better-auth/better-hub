"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { UserTooltip } from "@/components/shared/user-tooltip";

interface MentionData {
	element: HTMLAnchorElement;
	username: string;
	wrapper: HTMLSpanElement;
}

function MentionTooltipPortal({ mention }: { mention: MentionData }) {
	const [children, setChildren] = useState<React.ReactNode>(null);

	useEffect(() => {
		setChildren(
			<span dangerouslySetInnerHTML={{ __html: mention.element.innerHTML }} />,
		);
	}, [mention.element]);

	if (!children) return null;

	return createPortal(
		<UserTooltip username={mention.username} side="top">
			<a
				href={mention.element.href}
				className={mention.element.className}
				onClick={(e) => {
					e.stopPropagation();
				}}
			>
				{children}
			</a>
		</UserTooltip>,
		mention.wrapper,
	);
}

export function MarkdownMentionTooltips({ children }: { children: React.ReactNode }) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [mentions, setMentions] = useState<MentionData[]>([]);
	const mentionsRef = useRef<MentionData[]>([]);

	useEffect(() => {
		const container = containerRef.current;
		if (!container) return;

		const mentionLinks =
			container.querySelectorAll<HTMLAnchorElement>("a.ghmd-mention");
		if (mentionLinks.length === 0) return;

		const newMentions: MentionData[] = [];

		for (const link of mentionLinks) {
			const href = link.getAttribute("href") || "";
			const usernameMatch = href.match(/\/users\/([^/]+)/);
			if (!usernameMatch) continue;

			const username = usernameMatch[1];

			const wrapper = document.createElement("span");
			wrapper.style.display = "inline";
			link.parentNode?.insertBefore(wrapper, link);
			link.style.display = "none";

			newMentions.push({
				element: link,
				username,
				wrapper,
			});
		}

		mentionsRef.current = newMentions;
		setMentions(newMentions);

		return () => {
			for (const mention of mentionsRef.current) {
				mention.element.style.display = "";
				mention.wrapper.remove();
			}
			mentionsRef.current = [];
		};
	}, []);

	return (
		<div ref={containerRef}>
			{children}
			{mentions.map((mention, idx) => (
				<MentionTooltipPortal key={idx} mention={mention} />
			))}
		</div>
	);
}
