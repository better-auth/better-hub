"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ArrowUp, Square } from "lucide-react";
import { AICommandResults, type AIMessage } from "@/components/ai-command-results";
import { AgentIcon } from "@/components/ui/agent-icon";

/** Known top-level app routes that are NOT owner/repo paths */
const KNOWN_PREFIXES = new Set([
	"repos",
	"prs",
	"issues",
	"settings",
	"search",
	"trending",
	"users",
	"orgs",
	"dashboard",
	"api",
	"collections",
]);

/** Try to match /:owner/:repo from a clean pathname (skipping known app prefixes) */
function matchRepoFromPathname(pathname: string): [string, string] | null {
	const segments = pathname.split("/").filter(Boolean);
	if (segments.length < 2) return null;
	if (KNOWN_PREFIXES.has(segments[0])) return null;
	return [segments[0], segments[1]];
}

interface AICommandContentProps {
	onClose: () => void;
	onToggleMode: () => void;
}

export default function AICommandContent({ onClose, onToggleMode }: AICommandContentProps) {
	const [search, setSearch] = useState("");
	const inputRef = useRef<HTMLInputElement>(null);
	const aiScrollRef = useRef<HTMLDivElement>(null);
	const router = useRouter();
	const pathname = usePathname();

	// Build page context from current URL
	const pageContext = useMemo(() => {
		if (!pathname) return null;
		const entities: Array<{
			type: string;
			id: string;
			name: string;
			[key: string]: unknown;
		}> = [];

		const repoMatch = matchRepoFromPathname(pathname);
		if (repoMatch) {
			entities.push({
				type: "repo",
				id: `${repoMatch[0]}/${repoMatch[1]}`,
				name: `${repoMatch[0]}/${repoMatch[1]}`,
				owner: repoMatch[0],
				repo: repoMatch[1],
			});
		}

		let page: string | null = null;
		if (repoMatch) {
			if (pathname.includes("/issues/")) page = "issue-detail";
			else if (pathname.includes("/issues")) page = "repo-issues";
			else if (pathname.includes("/pulls/")) page = "pr-detail";
			else if (pathname.includes("/pulls")) page = "repo-pulls";
			else if (pathname.includes("/blob/")) page = "file-viewer";
			else if (pathname.includes("/tree/")) page = "directory-browser";
			else page = "repo-overview";
		} else if (pathname === "/repos") page = "repos-list";
		else if (pathname === "/dashboard") page = "dashboard";
		else if (pathname === "/prs") page = "prs";
		else if (pathname === "/issues") page = "issues";
		else if (pathname === "/settings") page = "settings";

		return { page, pathname, entities };
	}, [pathname]);

	const pageContextKey = useMemo(() => JSON.stringify(pageContext), [pageContext]);

	const aiTransport = useMemo(
		() =>
			new DefaultChatTransport({
				api: "/api/ai/command",
				body: { pageContext },
			}),
		// eslint-disable-next-line react-hooks/exhaustive-deps
		[pageContextKey],
	);

	const {
		messages: aiMessages,
		sendMessage: aiSendMessage,
		setMessages: setAiMessages,
		status: aiStatus,
		error: aiError,
		stop: aiStop,
	} = useChat({
		transport: aiTransport,
	});

	const isAiStreaming = aiStatus === "streaming" || aiStatus === "submitted";

	// Focus on mount
	useEffect(() => {
		setTimeout(() => inputRef.current?.focus(), 0);
	}, []);

	// Auto-scroll AI messages
	useEffect(() => {
		if (aiScrollRef.current) {
			aiScrollRef.current.scrollTop = aiScrollRef.current.scrollHeight;
		}
	}, [aiMessages]);

	// ─── Client-Side Action Executor ──────────────────────────────────
	const executedActionsRef = useRef<Set<string>>(new Set());

	useEffect(() => {
		if (!aiMessages.length) {
			executedActionsRef.current.clear();
			return;
		}

		for (const msg of aiMessages) {
			if (msg.role !== "assistant") continue;
			for (const part of msg.parts) {
				if (!part.type.startsWith("tool-")) continue;
				const toolPart = part as {
					type: string;
					output?: unknown;
					toolCallId?: string;
					state?: string;
				};
				const output = toolPart.output as
					| Record<string, unknown>
					| undefined;
				if (!output || !output._clientAction) continue;
				if (toolPart.state !== "output-available") continue;

				const actionKey = `${msg.id}-${toolPart.toolCallId || part.type}`;
				if (executedActionsRef.current.has(actionKey)) continue;
				executedActionsRef.current.add(actionKey);

				const action = output._clientAction as string;

				setTimeout(() => {
					if (action === "refreshPage") {
						router.refresh();
						return;
					}
					if (action === "navigate") {
						const pageMap: Record<string, string> = {
							dashboard: "/dashboard",
							repos: "/repos",
							prs: "/prs",
							issues: "/issues",
							notifications:
								"/dashboard?panel=notifications",
							settings: "/settings",
							search: "/search",
							trending: "/trending",
							orgs: "/orgs",
						};
						const page = output.page as string;
						const target = pageMap[page] ?? "/dashboard";
						onClose();
						router.push(target);
					} else if (action === "openRepo") {
						onClose();
						router.push(`/${output.owner}/${output.repo}`);
					} else if (action === "openRepoTab") {
						onClose();
						router.push(
							`/${output.owner}/${output.repo}/${output.tab}`,
						);
					} else if (action === "openWorkflowRun") {
						onClose();
						router.push(
							`/${output.owner}/${output.repo}/actions/${output.runId}`,
						);
					} else if (action === "openCommit") {
						onClose();
						router.push(
							`/${output.owner}/${output.repo}/commits/${output.sha}`,
						);
					} else if (action === "openIssue") {
						onClose();
						router.push(
							`/${output.owner}/${output.repo}/issues/${output.issueNumber}`,
						);
					} else if (action === "openPullRequest") {
						onClose();
						router.push(
							`/${output.owner}/${output.repo}/pulls/${output.pullNumber}`,
						);
					} else if (action === "openUser") {
						onClose();
						router.push(`/users/${output.username}`);
					} else if (action === "openUrl") {
						const url = output.url as string;
						if (url) {
							onClose();
							window.open(url, "_blank");
						}
					}
				}, 600);
			}
		}
	}, [aiMessages, router, onClose]);

	const startNewChat = useCallback(() => {
		setAiMessages([]);
		setSearch("");
		inputRef.current?.focus();
	}, [setAiMessages]);

	const handleKeyDown = useCallback(
		(e: React.KeyboardEvent) => {
			if (e.key === "Tab") {
				e.preventDefault();
				onToggleMode();
				return;
			}
			if (e.key === "Escape" && isAiStreaming) {
				e.preventDefault();
				e.stopPropagation();
				aiStop();
				return;
			}
			if (e.key === "Enter" && search.trim() && !isAiStreaming) {
				e.preventDefault();
				aiSendMessage({ text: search.trim() });
				setSearch("");
				return;
			}
		},
		[onToggleMode, isAiStreaming, aiStop, search, aiSendMessage],
	);

	return (
		<>
			{/* AI Input */}
			<div className="flex items-center border-b border-border/40 dark:border-white/6 px-4 shrink-0">
				<AgentIcon className="size-4.5 text-muted-foreground/70 shrink-0" />
				<input
					ref={inputRef}
					value={search}
					onChange={(e) => setSearch(e.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Ask anything..."
					className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 px-3 py-3.5 text-[15px] outline-none"
				/>
				<div className="flex items-center gap-1.5">
					{isAiStreaming ? (
						<button
							type="button"
							onClick={() => aiStop()}
							className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all duration-150"
						>
							<Square className="size-2.5 fill-current" />
						</button>
					) : search.trim() ? (
						<button
							type="button"
							onClick={() => {
								if (search.trim()) {
									aiSendMessage({
										text: search.trim(),
									});
									setSearch("");
								}
							}}
							className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background hover:bg-foreground/90 transition-all duration-150"
						>
							<ArrowUp className="size-3.5" />
						</button>
					) : null}
					<kbd className="inline-flex h-6 items-center gap-1 rounded border border-border/50 bg-muted/50 dark:bg-white/4 dark:border-white/7 px-1.5 font-mono text-[10px] text-muted-foreground/70">
						ESC
					</kbd>
				</div>
			</div>

			{/* AI Messages */}
			<div ref={aiScrollRef} className="overflow-y-auto flex-1 min-h-0">
				<AICommandResults
					messages={aiMessages as AIMessage[]}
					isStreaming={isAiStreaming}
					error={aiError}
					onQuickReply={(text) => {
						aiSendMessage({ text });
					}}
					onNavigateRepo={(fullName) => {
						onClose();
						router.push(`/${fullName}`);
					}}
					onOpenUrl={(url) => {
						onClose();
						window.open(url, "_blank");
					}}
					onClear={startNewChat}
				/>
			</div>

			{/* Disclaimer */}
			<div className="flex items-center justify-center gap-1.5 px-4 py-2 border-t border-warning/10 bg-warning/5 shrink-0">
				<p className="text-[11px] text-warning/60">
					AI can make mistakes. Review actions carefully.
				</p>
			</div>
		</>
	);
}
