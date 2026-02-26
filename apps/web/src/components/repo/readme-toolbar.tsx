"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { Check, ChevronDown, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReadmeToolbarProps {
	owner: string;
	repo: string;
	branch: string;
	fetchMarkdown: (owner: string, repo: string, branch: string) => Promise<string | null>;
	onRevalidate?: () => Promise<void>;
}

const CHAT_SERVICES = [
	{
		id: "chatgpt",
		label: "ChatGPT",
		icon: (
			<svg
				viewBox="0 0 24 24"
				className="w-4 h-4"
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="M22.2819 9.8211a5.9847 5.9847 0 0 0-.5157-4.9108 6.0462 6.0462 0 0 0-6.5098-2.9A6.0651 6.0651 0 0 0 4.9807 4.1818a5.9847 5.9847 0 0 0-3.9977 2.9 6.0462 6.0462 0 0 0 .7427 7.0966 5.98 5.98 0 0 0 .511 4.9107 6.051 6.051 0 0 0 6.5146 2.9001A5.9847 5.9847 0 0 0 13.2599 24a6.0557 6.0557 0 0 0 5.7718-4.2058 5.9894 5.9894 0 0 0 3.9977-2.9001 6.0557 6.0557 0 0 0-.7475-7.0729zm-9.022 12.6081a4.4755 4.4755 0 0 1-2.8764-1.0408l.1419-.0804 4.7783-2.7582a.7948.7948 0 0 0 .3927-.6813v-6.7369l2.02 1.1686a.071.071 0 0 1 .038.052v5.5826a4.504 4.504 0 0 1-4.4945 4.4944zm-9.6607-4.1254a4.4708 4.4708 0 0 1-.5346-3.0137l.142.0852 4.783 2.7582a.7712.7712 0 0 0 .7806 0l5.8428-3.3685v2.3324a.0804.0804 0 0 1-.0332.0615L9.74 19.9502a4.4992 4.4992 0 0 1-6.1408-1.6464zM2.3408 7.8956a4.485 4.485 0 0 1 2.3655-1.9728V11.6a.7664.7664 0 0 0 .3879.6765l5.8144 3.3543-2.0201 1.1685a.0757.0757 0 0 1-.071 0l-4.8303-2.7865A4.504 4.504 0 0 1 2.3408 7.872zm16.5963 3.8558L13.1038 8.364 15.1192 7.2a.0757.0757 0 0 1 .071 0l4.8303 2.7913a4.4944 4.4944 0 0 1-.6765 8.1042v-5.6772a.79.79 0 0 0-.407-.667zm2.0107-3.0231l-.142-.0852-4.7735-2.7818a.7759.7759 0 0 0-.7854 0L9.409 9.2297V6.8974a.0662.0662 0 0 1 .0284-.0615l4.8303-2.7866a4.4992 4.4992 0 0 1 6.6802 4.66zM8.3065 12.863l-2.02-1.1638a.0804.0804 0 0 1-.038-.0567V6.0742a4.4992 4.4992 0 0 1 7.3757-3.4537l-.142.0805L8.704 5.459a.7948.7948 0 0 0-.3927.6813zm1.0976-2.3654l2.602-1.4998 2.6069 1.4998v2.9994l-2.5974 1.4997-2.6067-1.4997Z" />
			</svg>
		),
		createUrl: (prompt: string) =>
			`https://chatgpt.com/?${new URLSearchParams({ hints: "search", prompt })}`,
	},
	{
		id: "claude",
		label: "Claude",
		icon: (
			<svg
				viewBox="0 0 24 24"
				className="w-4 h-4"
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="M17.3041 3.541h-3.6718l6.696 16.918H24Zm-10.6082 0L0 20.459h3.7442l1.3693-3.5527h7.0052l1.3693 3.5528h3.7442L10.5363 3.5409Zm-.3712 10.2232 2.2914-5.9456 2.2914 5.9456Z" />
			</svg>
		),
		createUrl: (q: string) => `https://claude.ai/new?${new URLSearchParams({ q })}`,
	},
	{
		id: "t3",
		label: "T3 Chat",
		icon: (
			<svg
				viewBox="0 0 24 24"
				className="w-4 h-4"
				fill="none"
				stroke="currentColor"
				strokeWidth="2"
				strokeLinecap="round"
				strokeLinejoin="round"
			>
				<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />
			</svg>
		),
		createUrl: (q: string) => `https://t3.chat/new?${new URLSearchParams({ q })}`,
	},
	{
		id: "copilot",
		label: "Copilot",
		icon: (
			<svg
				viewBox="0 0 1322.9 1147.5"
				className="w-4 h-4"
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="m711.19 265.2c-27.333 0-46.933 3.07-58.8 9.33 27.067-80.267 47.6-210.13 168-210.13 114.93 0 108.4 138.27 157.87 200.8zm107.33 112.93c-35.467 125.2-70 251.2-110.13 375.33-12.133 36.4-45.733 61.6-84 61.6h-136.27c9.3333-14 16.8-28.933 21.467-45.733 35.467-125.07 70-251.07 110.13-375.33 12.133-36.4 45.733-61.6 84-61.6h136.27c-9.3333 14-16.8 28.934-21.467 45.734m-316.13 704.8c-114.93 0-108.4-138.13-157.87-200.67h267.07c27.467 0 47.067-3.07 58.8-9.33-27.067 80.266-47.6 210-168 210m777.47-758.93h0.93c-32.667-38.266-82.267-57.866-146.67-57.866h-36.4c-34.533-2.8-65.333-26.134-76.533-58.8l-36.4-103.6c-21.463-61.737-80.263-103.74-145.73-103.74h-475.07c-175.6 0-251.2 225.07-292.27 361.33-38.267 127.07-126 341.73-24.267 462.13 46.667 55.067 116.67 57.867 183.07 57.867 34.533 2.8 65.333 26.133 76.533 58.8l36.4 103.6c21.467 61.733 80.267 103.73 145.6 103.73h475.2c175.47 0 251.07-225.07 292.27-361.33 30.8-100.8 68.133-224.93 66.267-324.8 0-50.534-11.2-100-42.933-137.33" />
			</svg>
		),
		createUrl: (q: string) =>
			`https://copilot.microsoft.com/?${new URLSearchParams({ q })}`,
	},
	{
		id: "cursor",
		label: "Cursor",
		icon: (
			<svg
				viewBox="0 0 466.73 532.09"
				className="w-4 h-4"
				fill="currentColor"
				xmlns="http://www.w3.org/2000/svg"
			>
				<path d="M457.43,125.94L244.42,2.96c-6.84-3.95-15.28-3.95-22.12,0L9.3,125.94c-5.75,3.32-9.3,9.46-9.3,16.11v247.99c0,6.65,3.55,12.79,9.3,16.11l213.01,122.98c6.84,3.95,15.28,3.95,22.12,0l213.01-122.98c5.75-3.32,9.3-9.46,9.3-16.11v-247.99c0-6.65-3.55-12.79-9.3-16.11h-.01ZM444.05,151.99l-205.63,356.16c-1.39,2.4-5.06,1.42-5.06-1.36v-233.21c0-4.66-2.49-8.97-6.53-11.31L24.87,145.67c-2.4-1.39-1.42-5.06,1.36-5.06h411.26c5.84,0,9.49,6.33,6.57,11.39h-.01Z" />
			</svg>
		),
		createUrl: (text: string) => {
			const url = new URL("https://cursor.com/link/prompt");
			url.searchParams.set("text", text);
			return url.toString();
		},
	},
] as const;

export function ReadmeToolbar({
	owner,
	repo,
	branch,
	fetchMarkdown,
	onRevalidate,
}: ReadmeToolbarProps) {
	const [copied, setCopied] = useState(false);
	const [loading, setLoading] = useState(false);
	const [refreshing, setRefreshing] = useState(false);
	const [dropdownOpen, setDropdownOpen] = useState(false);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const getMarkdown = useCallback(async () => {
		setLoading(true);
		try {
			const md = await fetchMarkdown(owner, repo, branch);
			return md;
		} finally {
			setLoading(false);
		}
	}, [owner, repo, branch, fetchMarkdown]);

	async function handleCopy() {
		const md = await getMarkdown();
		if (!md) return;
		await navigator.clipboard.writeText(md);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	async function handleOpenIn(createUrl: (content: string) => string) {
		setDropdownOpen(false);
		const md = await getMarkdown();
		if (!md) return;
		const prompt = `Here is the README for ${owner}/${repo}:\n\n${md}`;
		window.open(createUrl(prompt), "_blank", "noopener");
	}

	useEffect(() => {
		if (!dropdownOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (
				dropdownRef.current &&
				!dropdownRef.current.contains(e.target as Node)
			) {
				setDropdownOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [dropdownOpen]);

	async function handleRefresh() {
		if (!onRevalidate) return;
		setRefreshing(true);
		try {
			await onRevalidate();
		} finally {
			setRefreshing(false);
		}
	}

	return (
		<div className="flex items-center gap-0">
			{onRevalidate && (
				<>
					<button
						onClick={handleRefresh}
						disabled={refreshing}
						className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-foreground/80 transition-colors cursor-pointer disabled:opacity-50"
					>
						<RefreshCw
							className={cn(
								"w-3 h-3",
								refreshing && "animate-spin",
							)}
						/>
						Refresh
					</button>
					<span className="w-px h-3 bg-border/40" />
				</>
			)}
			<button
				onClick={handleCopy}
				disabled={loading}
				className="flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-foreground/80 transition-colors cursor-pointer disabled:opacity-50"
			>
				{copied ? (
					<Check className="w-3 h-3" />
				) : (
					<Copy className="w-3 h-3" />
				)}
				{copied ? "Copied" : "Copy MD"}
			</button>

			<span className="w-px h-3 bg-border/40" />

			<div className="relative" ref={dropdownRef}>
				<button
					onClick={() => setDropdownOpen(!dropdownOpen)}
					disabled={loading}
					className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 hover:text-foreground/80 transition-colors cursor-pointer disabled:opacity-50"
				>
					Open in
					<ChevronDown
						className={cn(
							"w-2.5 h-2.5 transition-transform duration-150",
							dropdownOpen && "rotate-180",
						)}
					/>
				</button>

				{dropdownOpen && (
					<div className="absolute right-0 top-full mt-1.5 w-48 rounded-lg border border-border bg-background shadow-lg z-50 py-1 animate-in fade-in-0 zoom-in-95 duration-100">
						{CHAT_SERVICES.map((service) => (
							<button
								key={service.id}
								onClick={() =>
									handleOpenIn(
										service.createUrl,
									)
								}
								className="flex items-center gap-2.5 w-full px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
							>
								<span className="shrink-0 text-muted-foreground/50">
									{service.icon}
								</span>
								<span className="flex-1 text-left">
									{service.label}
								</span>
								<ExternalLink className="w-3 h-3 shrink-0 text-muted-foreground/30" />
							</button>
						))}
					</div>
				)}
			</div>
		</div>
	);
}
