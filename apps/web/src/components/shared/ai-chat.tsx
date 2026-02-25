"use client";

import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { DefaultChatTransport } from "ai";
import { useEffect, useMemo, useRef, useState, useCallback, memo } from "react";
import { HighlightedCodeBlock } from "@/components/shared/highlighted-code-block";
import {
	ArrowUp,
	Square,
	RotateCcw,
	Loader2,
	Check,
	FileEdit,
	FilePlus2,
	FileSearch,
	GitPullRequest,
	Search,
	Star,
	GitFork,
	Eye,
	EyeOff,
	CirclePlus,
	CircleX,
	List,
	GitMerge,
	User,
	UserPlus,
	UserMinus,
	Bell,
	BellOff,
	Code2,
	Navigation,
	ExternalLink,
	MessageSquare,
	Tag,
	GitBranch,
	Container,
	Terminal,
	FileUp,
	FileDown,
	GitCommitHorizontal,
	Power,
	Play,
	Ghost,
	Copy,
	X,
} from "lucide-react";

function GithubIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<path
				fill="currentColor"
				d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489c.5.092.682-.217.682-.482c0-.237-.008-.866-.013-1.7c-2.782.603-3.369-1.342-3.369-1.342c-.454-1.155-1.11-1.462-1.11-1.462c-.908-.62.069-.608.069-.608c1.003.07 1.531 1.03 1.531 1.03c.892 1.529 2.341 1.087 2.91.832c.092-.647.35-1.088.636-1.338c-2.22-.253-4.555-1.11-4.555-4.943c0-1.091.39-1.984 1.029-2.683c-.103-.253-.446-1.27.098-2.647c0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025c.546 1.377.203 2.394.1 2.647c.64.699 1.028 1.592 1.028 2.683c0 3.842-2.339 4.687-4.566 4.935c.359.309.678.919.678 1.852c0 1.336-.012 2.415-.012 2.743c0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10"
			/>
		</svg>
	);
}
const GHOST_THINKING_PHRASES = [
	"Haunting the codebase",
	"Summoning answers",
	"Phasing through repos",
	"Reading the spectral docs",
	"Channeling commits",
	"Whispering to the API",
	"Drifting through issues",
	"Manifesting a response",
];

function formatElapsed(ms: number): string {
	const seconds = ms / 1000;
	if (seconds < 60) return `${seconds.toFixed(1)}s`;
	const minutes = Math.floor(seconds / 60);
	const secs = Math.floor(seconds % 60);
	return `${minutes}m ${secs.toString().padStart(2, "0")}s`;
}

function useElapsed(active: boolean) {
	const startRef = useRef(active ? Date.now() : null);
	const [elapsed, setElapsed] = useState(0);

	useEffect(() => {
		if (active) {
			if (!startRef.current) startRef.current = Date.now();
			const id = setInterval(() => {
				setElapsed(Date.now() - startRef.current!);
			}, 100);
			return () => clearInterval(id);
		} else if (startRef.current) {
			setElapsed(Date.now() - startRef.current);
		}
	}, [active]);

	return startRef.current !== null ? elapsed : null;
}

function GhostThinkingIndicator({ status }: { status: string }) {
	const [phraseIdx, setPhraseIdx] = useState(() =>
		Math.floor(Math.random() * GHOST_THINKING_PHRASES.length),
	);
	const elapsed = useElapsed(true);

	useEffect(() => {
		const interval = setInterval(() => {
			setPhraseIdx((i) => (i + 1) % GHOST_THINKING_PHRASES.length);
		}, 3000);
		return () => clearInterval(interval);
	}, []);

	const phrase = status === "submitted" ? GHOST_THINKING_PHRASES[phraseIdx] : "Conjuring";

	return (
		<div className="flex items-center gap-2 py-2">
			<div className="ghost-thinking-float">
				<Ghost className="w-3.5 h-3.5 text-muted-foreground/50" />
			</div>
			<span className="text-[11px] font-mono text-muted-foreground/50 transition-all duration-300">
				{phrase}
			</span>
			{elapsed !== null && elapsed >= 1000 && (
				<span className="text-[10px] font-mono text-muted-foreground/30 tabular-nums">
					{formatElapsed(elapsed)}
				</span>
			)}
			<span className="flex gap-[2px]">
				<span className="ghost-dot-1 w-[3px] h-[3px] rounded-full bg-muted-foreground/40" />
				<span className="ghost-dot-2 w-[3px] h-[3px] rounded-full bg-muted-foreground/40" />
				<span className="ghost-dot-3 w-[3px] h-[3px] rounded-full bg-muted-foreground/40" />
			</span>
		</div>
	);
}

import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import Link from "next/link";
import { toInternalUrl, parseGitHubUrl } from "@/lib/github-utils";
import { useSession } from "@/lib/auth-client";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);
	return (
		<button
			type="button"
			onClick={() => {
				navigator.clipboard.writeText(text).then(() => {
					setCopied(true);
					setTimeout(() => setCopied(false), 1500);
				});
			}}
			className={cn(
				"absolute top-1.5 right-1.5 p-1 rounded-md transition-all duration-150 cursor-pointer",
				"opacity-0 group-hover/code:opacity-100",
				copied
					? "bg-success/10 text-success"
					: "bg-accent text-muted-foreground/60 hover:text-foreground hover:bg-accent/80",
			)}
			title="Copy"
		>
			{copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
		</button>
	);
}

/** Custom markdown components for Ghost AI responses.
 *  Rewrites github.com links to internal app routes.
 *  Adds copy button on code blocks and inline code.
 *  Makes file:line references clickable when in a PR context. */
interface HastElement {
	tagName?: string;
	properties?: { className?: string[] };
	children?: HastElement[];
}

/**
 * Matches file references like `src/foo.ts:42`, `lib/bar.tsx:10-20`, `path/to/file.py:L5`,
 * `path/to/file.py:L5-L10`, or just `src/foo.ts` (filename only, no line).
 * Captures: [fullMatch, filepath, lineSpec | undefined]
 */
const FILE_LINE_RE = /(\b(?:[\w.@~-]+\/)+[\w.-]+\.\w+)(?::L?(\d+)(?:[–\-]L?(\d+))?)?/g;

type FileNavigateFn = (filename: string, line?: number) => void;

function createGhostMarkdownComponents(
	onNavigateToFile?: FileNavigateFn,
	knownFiles?: Set<string>,
) {
	/** Parse inline code text for file:line patterns and return clickable elements */
	function renderFileRef(text: string): React.ReactNode {
		if (!onNavigateToFile || !knownFiles || knownFiles.size === 0) return null;

		FILE_LINE_RE.lastIndex = 0;
		const match = FILE_LINE_RE.exec(text);
		if (!match) return null;

		const filepath = match[1];
		const line = match[2] ? parseInt(match[2], 10) : undefined;

		// Check if this filepath matches a known file in the PR
		if (!knownFiles.has(filepath)) return null;

		return (
			<button
				type="button"
				onClick={() => onNavigateToFile(filepath, line)}
				className="inline-flex items-center gap-0.5 font-mono text-info hover:text-info/80 hover:underline underline-offset-2 cursor-pointer transition-colors"
				title={`Go to ${filepath}${line ? `:${line}` : ""}`}
			>
				<Code2 className="w-3 h-3 shrink-0 opacity-60" />
				{text}
			</button>
		);
	}

	/** Process text nodes to linkify file:line references in plain text */
	function linkifyFileRefs(text: string): React.ReactNode {
		if (!onNavigateToFile || !knownFiles || knownFiles.size === 0) return text;

		FILE_LINE_RE.lastIndex = 0;
		const parts: React.ReactNode[] = [];
		let lastIndex = 0;
		let match: RegExpExecArray | null;

		while ((match = FILE_LINE_RE.exec(text)) !== null) {
			const filepath = match[1];
			if (!knownFiles.has(filepath)) continue;

			const line = match[2] ? parseInt(match[2], 10) : undefined;
			const fullMatch = match[0];
			const start = match.index;

			if (start > lastIndex) {
				parts.push(text.slice(lastIndex, start));
			}

			parts.push(
				<button
					key={start}
					type="button"
					onClick={() => onNavigateToFile(filepath, line)}
					className="inline-flex items-center gap-0.5 font-mono text-info hover:text-info/80 hover:underline underline-offset-2 cursor-pointer transition-colors text-[inherit]"
					title={`Go to ${filepath}${line ? `:${line}` : ""}`}
				>
					<Code2 className="w-2.5 h-2.5 shrink-0 opacity-60" />
					{fullMatch}
				</button>,
			);

			lastIndex = start + fullMatch.length;
		}

		if (parts.length === 0) return text;
		if (lastIndex < text.length) parts.push(text.slice(lastIndex));
		return <>{parts}</>;
	}

	return {
		pre: ({
			children,
			node,
			...props
		}: React.HTMLAttributes<HTMLPreElement> & { node?: HastElement }) => {
			let codeText = "";
			const child = Array.isArray(children) ? children[0] : children;
			if (child && typeof child === "object" && "props" in child) {
				const codeChildren = child.props.children;
				if (typeof codeChildren === "string") {
					codeText = codeChildren;
				} else if (Array.isArray(codeChildren)) {
					codeText = codeChildren
						.map((c: unknown) =>
							typeof c === "string" ? c : "",
						)
						.join("");
				}
			}
			const nodeChildren = (node?.children ?? []) as HastElement[];
			const codeChild = nodeChildren.find((c) => c.tagName === "code");
			const hasLang = codeChild?.properties?.className?.some?.(
				(c: string) => typeof c === "string" && c.startsWith("language-"),
			);
			if (hasLang) {
				return (
					<div className="relative group/code">
						{children}
						{codeText && <CopyButton text={codeText} />}
					</div>
				);
			}
			return (
				<div className="relative group/code">
					<pre {...props}>{children}</pre>
					{codeText && <CopyButton text={codeText} />}
				</div>
			);
		},
		code: ({ children, className, ...props }: React.HTMLAttributes<HTMLElement>) => {
			// Fenced code block with language — use syntax highlighting
			const langMatch = /language-(\w+)/.exec(className || "");
			if (langMatch) {
				return (
					<HighlightedCodeBlock
						code={String(children).replace(/\n$/, "")}
						lang={langMatch[1]}
					/>
				);
			}
			// Inline code — check for file:line reference
			const text = typeof children === "string" ? children : "";
			const fileLink = text ? renderFileRef(text) : null;
			if (fileLink) {
				return fileLink;
			}
			return (
				<span className="relative inline-flex group/code">
					<code {...props}>{children}</code>
					{text && (
						<button
							type="button"
							onClick={() =>
								navigator.clipboard.writeText(text)
							}
							className="opacity-0 group-hover/code:opacity-100 ml-0.5 p-0.5 rounded text-muted-foreground/40 hover:text-foreground transition-all duration-150 cursor-pointer self-center"
							title="Copy"
						>
							<Copy className="w-2.5 h-2.5" />
						</button>
					)}
				</span>
			);
		},
		// Process plain text to linkify file:line references
		p: ({ children, ...props }: React.HTMLAttributes<HTMLParagraphElement>) => {
			const processed = Array.isArray(children)
				? children.map((child, i) =>
						typeof child === "string" ? (
							<span key={i}>
								{linkifyFileRefs(child)}
							</span>
						) : (
							child
						),
					)
				: typeof children === "string"
					? linkifyFileRefs(children)
					: children;
			return <p {...props}>{processed}</p>;
		},
		li: ({ children, ...props }: React.HTMLAttributes<HTMLLIElement>) => {
			const processed = Array.isArray(children)
				? children.map((child, i) =>
						typeof child === "string" ? (
							<span key={i}>
								{linkifyFileRefs(child)}
							</span>
						) : (
							child
						),
					)
				: typeof children === "string"
					? linkifyFileRefs(children)
					: children;
			return <li {...props}>{processed}</li>;
		},
		table: ({ children, ...props }: React.HTMLAttributes<HTMLTableElement>) => (
			<div className="overflow-x-auto my-2 rounded border border-border/60">
				<table className="w-full text-[11px]" {...props}>
					{children}
				</table>
			</div>
		),
		th: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
			<th
				className="px-2.5 py-1.5 text-left font-medium text-muted-foreground/70 bg-muted/40 border-b border-border/60"
				{...props}
			>
				{children}
			</th>
		),
		td: ({ children, ...props }: React.HTMLAttributes<HTMLTableCellElement>) => (
			<td className="px-2.5 py-1.5 border-b border-border/30" {...props}>
				{children}
			</td>
		),
		a: ({
			href,
			children,
			...props
		}: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
			if (href && parseGitHubUrl(href)) {
				const internalPath = toInternalUrl(href);
				return (
					<Link href={internalPath} {...props}>
						{children}
					</Link>
				);
			}
			const appUrl = process.env.NEXT_PUBLIC_APP_URL;
			if (href && appUrl && href.startsWith(appUrl)) {
				const path = href.slice(appUrl.replace(/\/$/, "").length);
				return (
					<Link href={path} {...props}>
						{children}
					</Link>
				);
			}
			return (
				<a href={href} target="_blank" rel="noopener noreferrer" {...props}>
					{children}
				</a>
			);
		},
	};
}

interface MentionableFile {
	filename: string;
	patch: string;
}

interface AttachedContext {
	filename: string;
	startLine: number;
	endLine: number;
}

interface HistoryItem {
	contextKey: string;
	title: string;
	updatedAt: string;
}

function formatRelativeTime(dateStr: string): string {
	const diff = Date.now() - new Date(dateStr).getTime();
	const mins = Math.floor(diff / 60000);
	if (mins < 1) return "now";
	if (mins < 60) return `${mins}m`;
	const hours = Math.floor(mins / 60);
	if (hours < 24) return `${hours}h`;
	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d`;
	return `${Math.floor(days / 30)}mo`;
}

interface AIChatProps {
	apiEndpoint: string;
	contextBody: Record<string, unknown>;
	contextKey: string;
	/** When provided, messages are persisted to the DB via /api/ai/chat-history */
	persistKey?: string;
	/** Chat type for persistence (e.g. "pr", "issue") */
	chatType?: string;
	placeholder?: string;
	emptyTitle?: string;
	emptyDescription?: string;
	suggestions?: string[];
	/** Extra content rendered above the textarea inside the input border (e.g. inline context chips) */
	inputPrefix?: React.ReactNode;
	/** Called when a new chat is started (to clear external state like inline contexts) */
	onNewChat?: () => void;
	/** List of files available for @ mention autocomplete (e.g. PR diff files) */
	mentionableFiles?: MentionableFile[];
	/** Callback when a file is selected from @ mention dropdown */
	onAddFileContext?: (file: MentionableFile) => void;
	/** Current attached contexts (for snapshotting on send) */
	attachedContexts?: AttachedContext[];
	/** Called after a message is sent to clear attached contexts */
	onContextsConsumed?: () => void;
	/** Search repo files for # mention (returns file paths) */
	onSearchRepoFiles?: (query: string) => Promise<{ path: string }[]>;
	/** Fetch full file content for # mention selection */
	onFetchFileContent?: (
		path: string,
	) => Promise<{ filename: string; content: string } | null>;
	/** PR diff files shown in the "PR Files" section of # dropdown */
	hashMentionPrFiles?: MentionableFile[];
	/** Auto-focus the input on mount */
	autoFocus?: boolean;
	/** Recent ghost conversations to show above input when empty */
	historyItems?: HistoryItem[];
	/** Callback when a history item is clicked */
	onLoadHistory?: (contextKey: string, title: string) => void;
	/** Navigate to a file (and optionally a line) in the PR diff viewer */
	onNavigateToFile?: (filename: string, line?: number) => void;
}

export function AIChat({
	apiEndpoint,
	contextBody,
	contextKey,
	persistKey,
	chatType,
	placeholder = "Ask a question...",
	emptyTitle = "Ghost",
	emptyDescription = "Your haunted assistant for all things here.",
	suggestions = [],
	inputPrefix,
	onNewChat,
	mentionableFiles,
	onAddFileContext,
	attachedContexts,
	onContextsConsumed,
	onSearchRepoFiles,
	onFetchFileContent,
	hashMentionPrFiles,
	autoFocus,
	historyItems,
	onLoadHistory,
	onNavigateToFile,
}: AIChatProps) {
	const { data: session } = useSession();
	const globalChat = useGlobalChatOptional();
	const [input, setInput] = useState("");
	const scrollRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [conversationId, setConversationId] = useState<string | null>(null);
	const [inputMinHeight, setInputMinHeight] = useState(38);
	const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
	const [historyLoaded, setHistoryLoaded] = useState(!persistKey);
	const initialMessageCountRef = useRef(0);
	// Context snapshots per user message (messageId → contexts at send time)
	const [messageContexts, setMessageContexts] = useState<Record<string, AttachedContext[]>>(
		{},
	);
	const pendingContextsRef = useRef<AttachedContext[] | null>(null);
	const [historyDismissed, setHistoryDismissed] = useState(false);

	// Build the set of known PR filenames for file-reference linking
	const knownFileSet = useMemo(() => {
		const files = new Set<string>();
		if (mentionableFiles) {
			for (const f of mentionableFiles) files.add(f.filename);
		}
		return files;
	}, [mentionableFiles]);

	// Build markdown components with file navigation support
	const mdComponents = useMemo(
		() => createGhostMarkdownComponents(onNavigateToFile, knownFileSet),
		[onNavigateToFile, knownFileSet],
	);

	// Auto-focus input when requested
	useEffect(() => {
		if (autoFocus) {
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [autoFocus]);

	// @ mention autocomplete state
	const [mentionQuery, setMentionQuery] = useState<string | null>(null);
	const [mentionIndex, setMentionIndex] = useState(0);
	const mentionContainerRef = useRef<HTMLDivElement>(null);

	const filteredMentionFiles = useMemo(() => {
		if (mentionQuery === null || !mentionableFiles?.length) return [];
		const q = mentionQuery.toLowerCase();
		return mentionableFiles.filter((f) => f.filename.toLowerCase().includes(q));
	}, [mentionQuery, mentionableFiles]);

	const showMentionDropdown = mentionQuery !== null && filteredMentionFiles.length > 0;

	// # mention autocomplete state
	const [hashQuery, setHashQuery] = useState<string | null>(null);
	const [hashIndex, setHashIndex] = useState(0);
	const [hashRepoResults, setHashRepoResults] = useState<{ path: string }[]>([]);
	const [hashSearching, setHashSearching] = useState(false);
	const hashContainerRef = useRef<HTMLDivElement>(null);
	const hashDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	// Filtered PR files for # mention
	const filteredHashPrFiles = useMemo(() => {
		if (hashQuery === null || !hashMentionPrFiles?.length) return [];
		const q = hashQuery.toLowerCase();
		return hashMentionPrFiles.filter((f) => f.filename.toLowerCase().includes(q));
	}, [hashQuery, hashMentionPrFiles]);

	const hashTotalItems = filteredHashPrFiles.length + hashRepoResults.length;
	const showHashDropdown = hashQuery !== null && (hashTotalItems > 0 || hashSearching);

	// Detect @ and # triggers in input
	const handleInputChange = useCallback(
		(value: string) => {
			setInput(value);

			const cursorPos = inputRef.current?.selectionStart ?? value.length;
			const textBeforeCursor = value.slice(0, cursorPos);

			// Check for @ trigger
			const atMatch = mentionableFiles?.length
				? textBeforeCursor.match(/(^|[^a-zA-Z0-9])@([^\s]*)$/)
				: null;

			// Check for # trigger
			const hashMatch = onSearchRepoFiles
				? textBeforeCursor.match(/(^|[^a-zA-Z0-9])#([^\s]*)$/)
				: null;

			// @ and # are mutually exclusive — @ takes priority
			if (atMatch) {
				setMentionQuery(atMatch[2]);
				setMentionIndex(0);
				setHashQuery(null);
			} else if (hashMatch) {
				setMentionQuery(null);
				const q = hashMatch[2];
				setHashQuery(q);
				setHashIndex(0);

				// Debounce repo file search
				if (hashDebounceRef.current) clearTimeout(hashDebounceRef.current);
				if (onSearchRepoFiles && q.length > 0) {
					setHashSearching(true);
					hashDebounceRef.current = setTimeout(() => {
						onSearchRepoFiles(q)
							.then((results) => {
								setHashRepoResults(results);
								setHashSearching(false);
							})
							.catch(() => {
								setHashRepoResults([]);
								setHashSearching(false);
							});
					}, 200);
				} else {
					setHashRepoResults([]);
					setHashSearching(false);
				}
			} else {
				setMentionQuery(null);
				setHashQuery(null);
			}
		},
		[mentionableFiles, onSearchRepoFiles],
	);

	const selectMentionFile = useCallback(
		(file: MentionableFile) => {
			// Remove the @query from input
			const cursorPos = inputRef.current?.selectionStart ?? input.length;
			const textBeforeCursor = input.slice(0, cursorPos);
			const atMatch = textBeforeCursor.match(/(^|[^a-zA-Z0-9])@([^\s]*)$/);
			if (atMatch && atMatch.index !== undefined) {
				// atMatch[1] is the char before @, so the @ starts at index + length of that prefix
				const startIdx = atMatch.index + atMatch[1].length;
				const newInput = input.slice(0, startIdx) + input.slice(cursorPos);
				setInput(newInput);
			}
			setMentionQuery(null);
			onAddFileContext?.(file);
			inputRef.current?.focus();
		},
		[input, onAddFileContext],
	);

	// Select a file from # mention dropdown
	const selectHashFile = useCallback(
		async (path: string, isPrFile: boolean) => {
			// Remove the #query from input
			const cursorPos = inputRef.current?.selectionStart ?? input.length;
			const textBeforeCursor = input.slice(0, cursorPos);
			const hashMatch = textBeforeCursor.match(/(^|[^a-zA-Z0-9])#([^\s]*)$/);
			if (hashMatch && hashMatch.index !== undefined) {
				const startIdx = hashMatch.index + hashMatch[1].length;
				const newInput = input.slice(0, startIdx) + input.slice(cursorPos);
				setInput(newInput);
			}
			setHashQuery(null);
			setHashRepoResults([]);

			if (isPrFile) {
				// Find the PR file and add its patch as context
				const prFile = hashMentionPrFiles?.find((f) => f.filename === path);
				if (prFile) onAddFileContext?.(prFile);
			} else if (onFetchFileContent) {
				// Fetch full file content from repo
				const result = await onFetchFileContent(path);
				if (result) {
					onAddFileContext?.({
						filename: result.filename,
						patch: result.content,
					});
				}
			}
			inputRef.current?.focus();
		},
		[input, hashMentionPrFiles, onAddFileContext, onFetchFileContent],
	);

	// Close mention dropdown on click outside
	useEffect(() => {
		if (!showMentionDropdown) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				mentionContainerRef.current &&
				!mentionContainerRef.current.contains(e.target as Node)
			) {
				setMentionQuery(null);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showMentionDropdown]);

	// Close # mention dropdown on click outside
	useEffect(() => {
		if (!showHashDropdown) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (
				hashContainerRef.current &&
				!hashContainerRef.current.contains(e.target as Node)
			) {
				setHashQuery(null);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showHashDropdown]);

	// Use a ref so the transport body function always returns the latest contextBody.
	// This avoids stale closure issues where the transport might send an outdated body
	// (e.g. missing inlineContexts that were just added).
	const contextBodyRef = useRef(contextBody);
	contextBodyRef.current = contextBody;

	// Keep refs for persistKey/chatType so the transport callbacks always read latest values
	const persistKeyRef = useRef(persistKey);
	persistKeyRef.current = persistKey;
	const chatTypeRef = useRef(chatType);
	chatTypeRef.current = chatType;

	// Only recreate transport when the API endpoint or persistKey changes.
	// The body function reads from contextBodyRef, so it always returns the latest
	// value without needing to recreate the transport. Recreating mid-stream
	// (e.g. when contexts are cleared after send, or pathname changes during
	// navigation tool calls) would abort the in-flight request and leave status stuck.
	const transport = useMemo(
		() =>
			new DefaultChatTransport({
				api: apiEndpoint,
				body: () => contextBodyRef.current,
				prepareSendMessagesRequest: ({
					id,
					messages,
					body,
					trigger,
					messageId,
				}) => {
					return {
						body: {
							...body,
							id,
							messages,
							trigger,
							messageId,
							persistKey: persistKeyRef.current,
							chatType: chatTypeRef.current,
						},
					};
				},
				...(persistKey
					? {
							prepareReconnectToStreamRequest: ({
								id,
							}) => ({
								api: `/api/ai/ghost/${id}/stream`,
							}),
						}
					: {}),
			}),
		[apiEndpoint, persistKey],
	);

	const { messages, sendMessage, setMessages, status, stop, error, clearError, regenerate } =
		useChat({
			...(persistKey ? { id: persistKey, resume: true } : {}),
			transport,
		});

	// Load chat history on mount / context change (including tab switches)
	useEffect(() => {
		if (!persistKey) {
			setHistoryLoaded(true);
			return;
		}

		let cancelled = false;
		setHistoryLoaded(false);
		// Clear immediately so stale messages from a previous tab don't flash
		setMessages([]);
		clearError();
		setConversationId(null);
		setMessageContexts({});
		pendingContextsRef.current = null;
		initialMessageCountRef.current = 0;
		lastSavedCountRef.current = 0;

		fetch(`/api/ai/chat-history?contextKey=${encodeURIComponent(persistKey)}`)
			.then((res) => res.json())
			.then((data) => {
				if (cancelled) return;
				if (
					data.conversation &&
					data.messages &&
					data.messages.length > 0
				) {
					setConversationId(data.conversation.id);
					const uiMessages: UIMessage[] = data.messages.map(
						(m: {
							id: string;
							role: "user" | "assistant" | "system";
							content: string;
							partsJson?: string | null;
						}) => {
							if (m.partsJson) {
								try {
									const parts = JSON.parse(
										m.partsJson,
									);
									return {
										id: m.id,
										role: m.role,
										content: m.content,
										parts,
									};
								} catch {
									// fall through to text-only
								}
							}
							return {
								id: m.id,
								role: m.role,
								content: m.content,
								parts: [
									{
										type: "text" as const,
										text: m.content,
									},
								],
							};
						},
					);
					setMessages(uiMessages);
					initialMessageCountRef.current = uiMessages.length;
					lastSavedCountRef.current = uiMessages.length;
				} else {
					setConversationId(null);
					initialMessageCountRef.current = 0;
					lastSavedCountRef.current = 0;
				}
				setHistoryLoaded(true);
			})
			.catch(() => {
				if (!cancelled) setHistoryLoaded(true);
			});

		return () => {
			cancelled = true;
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [persistKey]);

	// Persist messages as they arrive
	const lastSavedCountRef = useRef(0);
	useEffect(() => {
		if (!persistKey || !chatType || !historyLoaded) return;
		if (messages.length === 0) return;
		const newMessages = messages.slice(lastSavedCountRef.current);
		if (newMessages.length === 0) return;
		if (status === "streaming" || status === "submitted") return;

		for (const msg of newMessages) {
			const text =
				msg.parts
					?.filter((p) => p.type === "text")
					.map((p) => (p as { type: "text"; text: string }).text)
					.join("") || "";

			fetch("/api/ai/chat-history", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					contextKey: persistKey,
					chatType,
					message: {
						id: msg.id,
						role: msg.role,
						content: text,
						partsJson: JSON.stringify(msg.parts),
					},
				}),
			})
				.then((res) => res.json())
				.then((data) => {
					if (data.conversation) {
						setConversationId(data.conversation.id);
					}
				})
				.catch(() => {});
		}
		lastSavedCountRef.current = messages.length;
	}, [messages, status, persistKey, chatType, historyLoaded]);

	// Track whether user has scrolled away from the bottom
	const isUserScrolledUp = useRef(false);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const handleScroll = () => {
			const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
			isUserScrolledUp.current = distanceFromBottom > 40;
		};
		el.addEventListener("scroll", handleScroll, { passive: true });
		return () => el.removeEventListener("scroll", handleScroll);
	}, []);

	useEffect(() => {
		if (scrollRef.current && !isUserScrolledUp.current) {
			scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
		}
	}, [messages]);

	const [welcomeLoading, setWelcomeLoading] = useState(false);
	const isStreaming = status === "streaming";
	const isLoading = status === "submitted" || isStreaming || welcomeLoading;
	const isLimitReached = !!error?.message?.includes("MESSAGE_LIMIT_REACHED");
	const router = useRouter();

	// Report working status to global context (only from the active tab)
	useEffect(() => {
		if (!autoFocus) return;
		globalChat?.setIsWorking(isLoading);
		return () => globalChat?.setIsWorking(false);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [isLoading, autoFocus]);

	// ─── Client-Side Action Executor ──────────────────────────────────
	const executedActionsRef = useRef<Set<string>>(new Set());

	// Tools that mutate state — a successful call should refresh server data
	const MUTATION_TOOLS = new Set([
		"starRepo",
		"unstarRepo",
		"forkRepo",
		"watchRepo",
		"unwatchRepo",
		"createIssue",
		"closeIssue",
		"mergePullRequest",
		"followUser",
		"unfollowUser",
		"markNotificationsRead",
		"createGist",
		"comment",
		"addLabels",
		"removeLabels",
		"requestReviewers",
		"createBranch",
		"assignIssue",
		"unassignIssue",
		"editFile",
		"createFile",
		"amendCommit",
		"createPullRequest",
		"sandboxCommitAndPush",
		"sandboxCreatePR",
	]);

	useEffect(() => {
		if (!messages.length) {
			executedActionsRef.current.clear();
			return;
		}

		let needsRefresh = false;

		for (const msg of messages) {
			if (msg.role !== "assistant") continue;
			for (const part of msg.parts) {
				if (!part.type.startsWith("tool-")) continue;
				const toolPart = part as {
					type: string;
					output?: unknown;
					toolCallId?: string;
					state?: string;
				};
				if (toolPart.state !== "output-available") continue;

				const actionKey = `${msg.id}-${toolPart.toolCallId || part.type}`;
				if (executedActionsRef.current.has(actionKey)) continue;

				const output = toolPart.output as
					| Record<string, unknown>
					| undefined;
				if (!output) continue;

				const toolName = part.type.replace("tool-", "");

				// Client-side navigation actions
				if (output._clientAction) {
					executedActionsRef.current.add(actionKey);
					const action = output._clientAction as string;
					// Also refresh if this is a mutation tool with navigation
					if (MUTATION_TOOLS.has(toolName) && output.success) {
						needsRefresh = true;
					}

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
								notifications: "/notifications",
								settings: "/settings",
								search: "/search",
								trending: "/trending",
								orgs: "/orgs",
							};
							const page = output.page as string;
							router.push(pageMap[page] ?? "/dashboard");
						} else if (action === "openRepo") {
							router.push(
								`/${output.owner}/${output.repo}`,
							);
						} else if (action === "openRepoTab") {
							router.push(
								`/${output.owner}/${output.repo}/${output.tab}`,
							);
						} else if (action === "openWorkflowRun") {
							router.push(
								`/${output.owner}/${output.repo}/actions/${output.runId}`,
							);
						} else if (action === "openCommit") {
							router.push(
								`/${output.owner}/${output.repo}/commits/${output.sha}`,
							);
						} else if (action === "openIssue") {
							router.push(
								`/${output.owner}/${output.repo}/issues/${output.issueNumber}`,
							);
						} else if (action === "openPullRequest") {
							router.push(
								`/${output.owner}/${output.repo}/pulls/${output.pullNumber}`,
							);
						} else if (action === "openUser") {
							router.push(`/users/${output.username}`);
						} else if (action === "openUrl") {
							const url = output.url as string;
							if (url) window.open(url, "_blank");
						}
					}, 600);
					continue;
				}

				// Refresh page after successful mutations
				if (MUTATION_TOOLS.has(toolName) && output.success) {
					executedActionsRef.current.add(actionKey);
					needsRefresh = true;
				}
			}
		}

		if (needsRefresh) {
			setTimeout(() => router.refresh(), 800);
		}
	}, [messages, router]);

	const handleSend = (text?: string) => {
		const msg = (text || input).trim();
		if (!msg || isLoading || isLimitReached) return;
		// Re-enable auto-scroll when user sends a message
		isUserScrolledUp.current = false;
		// Snapshot attached contexts before sending
		if (attachedContexts && attachedContexts.length > 0) {
			pendingContextsRef.current = attachedContexts.map((c) => ({
				filename: c.filename,
				startLine: c.startLine,
				endLine: c.endLine,
			}));
		}
		sendMessage({ text: msg });
		setInput("");
		// Clear contexts after sending
		onContextsConsumed?.();
		if (inputRef.current) {
			inputRef.current.style.height = "auto";
		}
	};

	// Listen for auto-send event (used by other features to send a Ghost message)
	const handleSendRef = useRef(handleSend);
	handleSendRef.current = handleSend;
	useEffect(() => {
		if (!autoFocus) return;
		const handler = (e: Event) => {
			const msg = (e as CustomEvent).detail?.message;
			if (msg) handleSendRef.current(msg);
		};
		window.addEventListener("ghost-auto-send", handler);
		return () => window.removeEventListener("ghost-auto-send", handler);
	}, [autoFocus]);

	// Listen for welcome inject event (onboarding) — injects a pre-written
	// welcome with a brief simulated loading delay so it feels processed.
	const setMessagesRef = useRef(setMessages);
	setMessagesRef.current = setMessages;
	useEffect(() => {
		if (!autoFocus) return;
		const handler = (e: Event) => {
			const {
				userMessage,
				assistantMessage,
				simulateDelay = 0,
			} = (e as CustomEvent).detail ?? {};
			if (!userMessage || !assistantMessage) return;
			const mkMsg = (role: "user" | "assistant", text: string) =>
				({
					id: `welcome-${role}-${Date.now()}`,
					role,
					content: text,
					parts: [{ type: "text" as const, text }],
				}) as unknown as UIMessage;
			// Show user message immediately
			setMessagesRef.current([mkMsg("user", userMessage)]);
			// Then reveal the assistant response after the simulated delay
			if (simulateDelay > 0) {
				setWelcomeLoading(true);
				setTimeout(() => {
					setWelcomeLoading(false);
					setMessagesRef.current([
						mkMsg("user", userMessage),
						mkMsg("assistant", assistantMessage),
					]);
				}, simulateDelay);
			} else {
				setMessagesRef.current([
					mkMsg("user", userMessage),
					mkMsg("assistant", assistantMessage),
				]);
			}
		};
		window.addEventListener("ghost-welcome-inject", handler);
		return () => window.removeEventListener("ghost-welcome-inject", handler);
	}, [autoFocus]);

	// Associate pending context snapshot with the newly created user message
	useEffect(() => {
		if (!pendingContextsRef.current) return;
		const pending = pendingContextsRef.current;
		for (let i = messages.length - 1; i >= 0; i--) {
			const m = messages[i];
			if (m.role === "user") {
				setMessageContexts((prev) => {
					if (prev[m.id]) return prev; // already associated
					return { ...prev, [m.id]: pending };
				});
				pendingContextsRef.current = null;
				break;
			}
		}
	}, [messages]);

	// Auto-resize textarea when input changes
	useEffect(() => {
		const el = inputRef.current;
		if (!el) return;
		el.style.height = "auto";
		const autoHeight = el.scrollHeight;
		el.style.height = Math.max(inputMinHeight, Math.min(autoHeight, 400)) + "px";
	}, [input, inputMinHeight]);

	const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
		// Handle # mention keyboard navigation
		if (showHashDropdown && hashTotalItems > 0) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setHashIndex((i) => Math.min(i + 1, hashTotalItems - 1));
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setHashIndex((i) => Math.max(i - 1, 0));
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				const prLen = filteredHashPrFiles.length;
				if (hashIndex < prLen) {
					selectHashFile(
						filteredHashPrFiles[hashIndex].filename,
						true,
					);
				} else {
					selectHashFile(
						hashRepoResults[hashIndex - prLen].path,
						false,
					);
				}
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setHashQuery(null);
				return;
			}
		}
		// Handle @ mention keyboard navigation
		if (showMentionDropdown) {
			if (e.key === "ArrowDown") {
				e.preventDefault();
				setMentionIndex((i) =>
					Math.min(i + 1, filteredMentionFiles.length - 1),
				);
				return;
			}
			if (e.key === "ArrowUp") {
				e.preventDefault();
				setMentionIndex((i) => Math.max(i - 1, 0));
				return;
			}
			if (e.key === "Enter" || e.key === "Tab") {
				e.preventDefault();
				selectMentionFile(filteredMentionFiles[mentionIndex]);
				return;
			}
			if (e.key === "Escape") {
				e.preventDefault();
				setMentionQuery(null);
				return;
			}
		}
		if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
			e.preventDefault();
			handleSend();
		}
	};

	const handleDragStart = useCallback(
		(e: React.MouseEvent) => {
			e.preventDefault();
			dragRef.current = { startY: e.clientY, startHeight: inputMinHeight };
			const onMove = (ev: MouseEvent) => {
				if (!dragRef.current) return;
				const delta = dragRef.current.startY - ev.clientY;
				setInputMinHeight(
					Math.max(
						38,
						Math.min(400, dragRef.current.startHeight + delta),
					),
				);
			};
			const onUp = () => {
				dragRef.current = null;
				document.removeEventListener("mousemove", onMove);
				document.removeEventListener("mouseup", onUp);
				document.body.style.userSelect = "";
				document.body.style.cursor = "";
			};
			document.addEventListener("mousemove", onMove);
			document.addEventListener("mouseup", onUp);
			document.body.style.userSelect = "none";
			document.body.style.cursor = "row-resize";
		},
		[inputMinHeight],
	);

	const getMessageText = (message: (typeof messages)[number]) =>
		message.parts
			?.filter((p) => p.type === "text")
			.map((p) => p.text)
			.join("") || "";

	// Track scroll position for fade shadows
	const [canScrollUp, setCanScrollUp] = useState(false);
	const [canScrollDown, setCanScrollDown] = useState(false);

	useEffect(() => {
		const el = scrollRef.current;
		if (!el) return;
		const updateScrollState = () => {
			setCanScrollUp(el.scrollTop > 8);
			setCanScrollDown(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
		};
		updateScrollState();
		el.addEventListener("scroll", updateScrollState, { passive: true });
		const ro = new ResizeObserver(updateScrollState);
		ro.observe(el);
		return () => {
			el.removeEventListener("scroll", updateScrollState);
			ro.disconnect();
		};
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [messages.length]);

	return (
		<div className="flex flex-col h-full">
			{/* Messages area */}
			<div className="relative flex-1 min-h-0">
				{/* Top fade shadow */}
				<div
					className={cn(
						"absolute top-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
						"bg-gradient-to-b from-background to-transparent",
						canScrollUp ? "opacity-100" : "opacity-0",
					)}
				/>
				{/* Bottom fade shadow */}
				<div
					className={cn(
						"absolute bottom-0 left-0 right-0 h-6 z-10 pointer-events-none transition-opacity duration-200",
						"bg-gradient-to-t from-background to-transparent",
						canScrollDown ? "opacity-100" : "opacity-0",
					)}
				/>
				<div ref={scrollRef} className="h-full overflow-y-auto px-3 py-3">
					{messages.length === 0 && !isLoading && historyLoaded ? (
						<div className="flex flex-col items-center justify-center h-full text-center gap-3">
							<Ghost className="size-6 text-muted-foreground/40" />
							<div>
								<p
									className="text-xs font-medium text-foreground/70 mb-0.5"
									suppressHydrationWarning
								>
									{emptyTitle}
								</p>
								<p
									className="text-[11px] text-muted-foreground/50 max-w-[220px]"
									suppressHydrationWarning
								>
									{emptyDescription}
								</p>
							</div>
							{suggestions.length > 0 && (
								<div className="flex flex-wrap items-center justify-center gap-1.5 mt-2 max-w-[300px]">
									{suggestions.map((s) => (
										<button
											key={s}
											type="button"
											onClick={() =>
												handleSend(
													s,
												)
											}
											className="text-[11px] px-3 py-1.5 rounded-lg border border-border/40 dark:border-white/6 bg-muted/20 dark:bg-white/[0.02] text-muted-foreground/60 hover:text-foreground hover:border-foreground/15 hover:bg-muted/40 dark:hover:bg-white/4 transition-all duration-150 cursor-pointer"
										>
											{s}
										</button>
									))}
								</div>
							)}
						</div>
					) : (
						<div className="space-y-3">
							{messages.map((message) => (
								<div key={message.id}>
									{message.role === "user" ? (
										<div className="mb-1">
											<div className="flex items-center gap-2 mb-1">
												{session
													?.user
													?.image ? (
													<img
														src={
															session
																.user
																.image
														}
														alt={
															session
																.user
																.name ||
															""
														}
														className="size-5 rounded-full shrink-0"
													/>
												) : (
													<div className="size-5 rounded-full bg-foreground/10 shrink-0" />
												)}
												<span className="text-[12px] font-semibold text-foreground/80">
													{session
														?.user
														?.name ||
														"You"}
												</span>
												{/* Context chips — right side of name row */}
												{messageContexts[
													message
														.id
												] &&
													messageContexts[
														message
															.id
													]
														.length >
														0 && (
														<div className="flex items-center gap-1 ml-auto">
															{messageContexts[
																message
																	.id
															]
																.length ===
															1 ? (
																<span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground/60">
																	<Code2 className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
																	<span className="truncate max-w-[140px]">
																		{messageContexts[
																			message
																				.id
																		][0].filename
																			.split(
																				"/",
																			)
																			.pop()}
																		<span className="text-muted-foreground/50">
																			:
																			{
																				messageContexts[
																					message
																						.id
																				][0]
																					.startLine
																			}
																			{messageContexts[
																				message
																					.id
																			][0]
																				.endLine !==
																				messageContexts[
																					message
																						.id
																				][0]
																					.startLine &&
																				`\u2013${messageContexts[message.id][0].endLine}`}
																		</span>
																	</span>
																</span>
															) : (
																<span className="inline-flex items-center gap-1.5 px-1.5 py-0.5 rounded bg-muted/60 text-[10px] font-mono text-muted-foreground/60">
																	<Code2 className="w-2.5 h-2.5 text-muted-foreground/40 shrink-0" />
																	<span className="size-4 rounded-full bg-foreground/10 flex items-center justify-center text-[9px] font-semibold text-muted-foreground/80 tabular-nums">
																		{
																			messageContexts[
																				message
																					.id
																			]
																				.length
																		}
																	</span>
																	<span className="text-muted-foreground/50">
																		files
																	</span>
																</span>
															)}
														</div>
													)}
											</div>
											<div className="text-[13px] text-foreground/70 whitespace-pre-wrap break-words">
												{getMessageText(
													message,
												)}
											</div>
										</div>
									) : (
										<div className="space-y-2">
											{message.parts?.map(
												(
													part,
													i,
												) => {
													if (
														part.type ===
															"text" &&
														part.text
													) {
														return (
															<div
																key={
																	i
																}
																className="ghmd ghmd-ai"
															>
																<ReactMarkdown
																	remarkPlugins={[
																		remarkGfm,
																	]}
																	components={
																		mdComponents as Parameters<
																			typeof ReactMarkdown
																		>[0]["components"]
																	}
																>
																	{
																		part.text
																	}
																</ReactMarkdown>
															</div>
														);
													}
													if (
														part.type.startsWith(
															"tool-",
														) ||
														part.type ===
															"dynamic-tool"
													) {
														const p =
															part as {
																type: string;
																toolName?: string;
																state?: string;
																input?: Record<
																	string,
																	unknown
																>;
																output?: unknown;
															};
														const toolName =
															part.type ===
															"dynamic-tool"
																? p.toolName
																: part.type.replace(
																		"tool-",
																		"",
																	);
														// Hide background tools from UI
														if (
															toolName ===
															"refreshPage"
														)
															return null;
														return (
															<ToolInvocationDisplay
																key={
																	i
																}
																toolName={
																	toolName
																}
																state={
																	p.state
																}
																args={
																	p.input
																}
																result={
																	p.output as
																		| ToolPayload
																		| undefined
																}
																onStop={
																	stop
																}
															/>
														);
													}
													return null;
												},
											)}
										</div>
									)}
								</div>
							))}

							{/* Ghost thinking indicator */}
							{isLoading && !error && (
								<GhostThinkingIndicator
									status={status}
								/>
							)}

							{/* Error state — stream died, timed out, etc. */}
							{error && historyLoaded && (
								<div className="flex flex-col items-center gap-2 py-4">
									<Ghost className="w-5 h-5 text-muted-foreground/20" />
									{error.message?.includes(
										"MESSAGE_LIMIT_REACHED",
									) ? (
										<>
											<span className="text-[11px] text-muted-foreground/50 text-center max-w-[260px]">
												You&apos;ve
												used
												all
												20
												free
												AI
												messages.
												Billing
												is
												coming
												soon.
											</span>
											<span className="text-[10px] text-muted-foreground/35 text-center max-w-[240px]">
												You
												can
												add
												your
												own
												OpenRouter
												API
												key
												in
												Settings
												to
												continue
												using
												AI
												features.
											</span>
										</>
									) : (
										<>
											<span className="text-[11px] text-muted-foreground/50">
												Ghost
												got
												lost
												in
												the
												void
											</span>
											<button
												type="button"
												onClick={() => {
													clearError();
													regenerate();
												}}
												className="mt-1 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[11px] font-medium bg-foreground text-background hover:bg-foreground/85 transition-colors cursor-pointer"
											>
												<RotateCcw className="w-3 h-3" />
												Summon
												again
											</button>
										</>
									)}
								</div>
							)}
						</div>
					)}
				</div>
			</div>

			{/* Recent conversations — shown above input when chat is empty */}
			{messages.length === 0 &&
				!isLoading &&
				!historyDismissed &&
				historyItems &&
				historyItems.length > 0 && (
					<div className="shrink-0 border-t border-border/30 px-3 py-2">
						<div className="flex items-center mb-1">
							<span className="text-[10px] font-medium text-muted-foreground/30 uppercase tracking-wider">
								Recent
							</span>
							<button
								type="button"
								onClick={() =>
									setHistoryDismissed(true)
								}
								className="ml-auto p-0.5 rounded text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors cursor-pointer"
								title="Dismiss"
							>
								<X className="w-3 h-3" />
							</button>
						</div>
						<div className="flex flex-col gap-0.5">
							{historyItems.slice(0, 5).map((item) => (
								<button
									key={item.contextKey}
									type="button"
									onClick={() =>
										onLoadHistory?.(
											item.contextKey,
											item.title,
										)
									}
									className="w-full flex items-center gap-2 px-2 py-1 rounded text-left text-[11px] text-muted-foreground/50 hover:text-foreground hover:bg-muted/30 transition-colors cursor-pointer group"
								>
									<MessageSquare className="w-3 h-3 shrink-0 text-muted-foreground/25 group-hover:text-muted-foreground/50" />
									<span className="truncate flex-1">
										{item.title}
									</span>
									<span className="text-[10px] text-muted-foreground/20 shrink-0">
										{formatRelativeTime(
											item.updatedAt,
										)}
									</span>
								</button>
							))}
						</div>
					</div>
				)}

			{/* Input area */}
			<div className="shrink-0 px-3 pb-3 pt-1">
				{/* New chat button */}
				{messages.length > 0 && !isLoading && (
					<div className="flex justify-end mb-1.5">
						<button
							type="button"
							onClick={() => {
								setMessages([]);
								lastSavedCountRef.current = 0;
								setMessageContexts({});
								onNewChat?.();
								if (persistKey && conversationId) {
									fetch(
										`/api/ai/chat-history?conversationId=${encodeURIComponent(conversationId)}`,
										{
											method: "DELETE",
										},
									).catch(() => {});
									setConversationId(null);
								}
							}}
							className="flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors cursor-pointer"
						>
							<RotateCcw className="w-2.5 h-2.5" />
							New chat
						</button>
					</div>
				)}
				<div className="relative">
					{/* Drag handle to resize input */}
					<div
						onMouseDown={handleDragStart}
						className="absolute -top-1.5 left-1/2 -translate-x-1/2 z-10 flex items-center justify-center w-8 h-3 cursor-row-resize group/drag"
					>
						<div className="w-5 h-[3px] rounded-full bg-border/60 dark:bg-white/8 group-hover/drag:bg-foreground/20 transition-colors" />
					</div>
					<div
						className={cn(
							"rounded-xl border transition-all duration-200",
							"border-border/60 dark:border-white/8",
							"bg-card/50 dark:bg-white/[0.02]",
							"focus-within:border-foreground/15 dark:focus-within:border-white/12",
							"focus-within:bg-background dark:focus-within:bg-white/[0.03]",
							"focus-within:shadow-[0_0_0_1px_rgba(0,0,0,0.04)] dark:focus-within:shadow-[0_0_0_1px_rgba(255,255,255,0.03)]",
						)}
					>
						{/* @ mention dropdown */}
						{showMentionDropdown && (
							<div
								ref={mentionContainerRef}
								className="border-b border-border/40 max-h-[200px] overflow-y-auto"
							>
								{filteredMentionFiles.map(
									(file, i) => {
										const basename =
											file.filename
												.split(
													"/",
												)
												.pop() ||
											file.filename;
										const dir =
											file.filename.includes(
												"/",
											)
												? file.filename.slice(
														0,
														file.filename.lastIndexOf(
															"/",
														),
													)
												: "";
										return (
											<button
												key={
													file.filename
												}
												type="button"
												onMouseDown={(
													e,
												) => {
													e.preventDefault();
													selectMentionFile(
														file,
													);
												}}
												className={cn(
													"w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
													i ===
														mentionIndex
														? "bg-muted/60"
														: "hover:bg-muted/50",
												)}
											>
												<Code2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
												<span className="text-[12px] font-mono truncate">
													<span className="text-foreground/80">
														{
															basename
														}
													</span>
													{dir && (
														<span className="text-muted-foreground/40 ml-1">
															{
																dir
															}
														</span>
													)}
												</span>
											</button>
										);
									},
								)}
							</div>
						)}
						{/* # file mention dropdown */}
						{showHashDropdown && (
							<div
								ref={hashContainerRef}
								className="border-b border-border/40 max-h-[200px] overflow-y-auto"
							>
								{filteredHashPrFiles.length > 0 && (
									<>
										<div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
											PR Files
										</div>
										{filteredHashPrFiles.map(
											(
												file,
												i,
											) => {
												const basename =
													file.filename
														.split(
															"/",
														)
														.pop() ||
													file.filename;
												const dir =
													file.filename.includes(
														"/",
													)
														? file.filename.slice(
																0,
																file.filename.lastIndexOf(
																	"/",
																),
															)
														: "";
												return (
													<button
														key={`pr-${file.filename}`}
														type="button"
														onMouseDown={(
															e,
														) => {
															e.preventDefault();
															selectHashFile(
																file.filename,
																true,
															);
														}}
														className={cn(
															"w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
															i ===
																hashIndex
																? "bg-muted/60"
																: "hover:bg-muted/50",
														)}
													>
														<Code2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
														<span className="text-[12px] font-mono truncate">
															<span className="text-foreground/80">
																{
																	basename
																}
															</span>
															{dir && (
																<span className="text-muted-foreground/40 ml-1">
																	{
																		dir
																	}
																</span>
															)}
														</span>
													</button>
												);
											},
										)}
									</>
								)}
								{(hashRepoResults.length > 0 ||
									hashSearching) && (
									<>
										<div className="px-3 py-1 text-[10px] font-medium text-muted-foreground/40 uppercase tracking-wider">
											Repository
										</div>
										{hashRepoResults.map(
											(
												file,
												i,
											) => {
												const globalIdx =
													filteredHashPrFiles.length +
													i;
												const basename =
													file.path
														.split(
															"/",
														)
														.pop() ||
													file.path;
												const dir =
													file.path.includes(
														"/",
													)
														? file.path.slice(
																0,
																file.path.lastIndexOf(
																	"/",
																),
															)
														: "";
												return (
													<button
														key={`repo-${file.path}`}
														type="button"
														onMouseDown={(
															e,
														) => {
															e.preventDefault();
															selectHashFile(
																file.path,
																false,
															);
														}}
														className={cn(
															"w-full flex items-center gap-2 px-3 py-1.5 text-left transition-colors cursor-pointer",
															globalIdx ===
																hashIndex
																? "bg-muted/60"
																: "hover:bg-muted/50",
														)}
													>
														<Code2 className="w-3 h-3 text-muted-foreground/40 shrink-0" />
														<span className="text-[12px] font-mono truncate">
															<span className="text-foreground/80">
																{
																	basename
																}
															</span>
															{dir && (
																<span className="text-muted-foreground/40 ml-1">
																	{
																		dir
																	}
																</span>
															)}
														</span>
													</button>
												);
											},
										)}
										{hashSearching && (
											<div className="flex items-center gap-2 px-3 py-1.5 text-[11px] text-muted-foreground/40">
												<Loader2 className="w-3 h-3 animate-spin" />
												Searching...
											</div>
										)}
									</>
								)}
							</div>
						)}
						{inputPrefix}
						<div className="flex items-end">
							<textarea
								ref={inputRef}
								data-ghost-input
								value={input}
								onChange={(e) =>
									handleInputChange(
										e.target.value,
									)
								}
								onKeyDown={onKeyDown}
								placeholder={
									isLimitReached
										? "Message limit reached"
										: placeholder
								}
								disabled={isLimitReached}
								suppressHydrationWarning
								rows={1}
								className={cn(
									"flex-1 resize-none text-[13px] bg-transparent pl-3.5 pr-1.5 py-2.5",
									"placeholder:text-muted-foreground/35",
									"focus:outline-none",
									"min-h-[38px] overflow-y-auto",
								)}
							/>
							<div className="shrink-0 pb-1.5 pr-1.5">
								{isLoading ? (
									<button
										type="button"
										onClick={() =>
											stop()
										}
										className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all duration-150 cursor-pointer"
										title="Stop generating"
									>
										<Square className="size-2.5 fill-current" />
									</button>
								) : (
									<button
										type="button"
										onClick={() =>
											handleSend()
										}
										disabled={
											!input.trim() ||
											isLimitReached
										}
										className={cn(
											"inline-flex h-7 w-7 items-center justify-center rounded-full transition-all duration-150",
											input.trim() &&
												!isLimitReached
												? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
												: "bg-muted/50 dark:bg-white/5 text-muted-foreground/25 cursor-default",
										)}
										title="Send (Enter)"
									>
										<ArrowUp className="size-3.5" />
									</button>
								)}
							</div>
						</div>
					</div>
				</div>
				<p className="text-[10px] text-muted-foreground/25 mt-1.5 text-center">
					AI can make mistakes. Verify important information.
				</p>
			</div>
		</div>
	);
}

/* eslint-disable @typescript-eslint/no-explicit-any -- tool invocation payloads have dynamic runtime shapes */
type ToolPayload = Record<string, any>;
/* eslint-enable @typescript-eslint/no-explicit-any */

export function ToolInvocationDisplay({
	toolName,
	state,
	args,
	result,
	onStop,
}: {
	toolName?: string;
	state?: string;
	args?: ToolPayload;
	result?: ToolPayload;
	onStop?: () => void;
}) {
	const isLoading = state === "input-streaming" || state === "input-available";
	const isDone = state === "output-available";
	const elapsed = useElapsed(isLoading);
	const hasError = isDone && result?.error;
	const hasSuccess = isDone && result?.success;

	const config: Record<
		string,
		{
			icon: React.ComponentType<{ className?: string }>;
			loadingText: string;
			doneText: string;
		}
	> = {
		// PR/Issue tools
		getFileContent: {
			icon: FileSearch,
			loadingText: `Reading ${args?.path || "file"}...`,
			doneText: `Read ${result?.path || args?.path || "file"}`,
		},
		editFile: {
			icon: FileEdit,
			loadingText: `Editing ${args?.path || "file"}...`,
			doneText: hasError
				? `Failed to edit ${args?.path || "file"}`
				: `Committed to ${result?.branch || "branch"}: ${result?.commitMessage || args?.commitMessage || ""}`,
		},
		createFile: {
			icon: FilePlus2,
			loadingText: `Creating ${args?.path || "file"}...`,
			doneText: hasError
				? `Failed to create ${args?.path || "file"}`
				: `Created ${result?.path || args?.path || "file"} on ${result?.branch || "branch"}`,
		},
		amendCommit: {
			icon: FileEdit,
			loadingText: "Amending last commit...",
			doneText: hasError
				? "Failed to amend commit"
				: `Amended ${result?.amendedSha || ""} → ${result?.newSha || ""}: ${result?.commitMessage || ""}`,
		},
		createPullRequest: {
			icon: GitPullRequest,
			loadingText: "Creating pull request...",
			doneText: hasError
				? "Failed to create pull request"
				: `Created PR #${result?.number || ""}: ${result?.title || args?.title || ""}`,
		},
		// General tools
		searchRepos: {
			icon: Search,
			loadingText: `Searching repos for "${args?.query || "..."}"`,
			doneText: `Found ${result?.total_count ?? 0} repos`,
		},
		searchUsers: {
			icon: Search,
			loadingText: `Searching users for "${args?.query || "..."}"`,
			doneText: `Found ${result?.total_count ?? 0} users`,
		},
		getRepoInfo: {
			icon: FileSearch,
			loadingText: `Getting info for ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: `Loaded ${result?.full_name || `${args?.owner}/${args?.repo}`}`,
		},
		starRepo: {
			icon: Star,
			loadingText: `Starring ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: hasError
				? "Failed to star"
				: `Starred ${result?.repo || `${args?.owner}/${args?.repo}`}`,
		},
		unstarRepo: {
			icon: Star,
			loadingText: `Unstarring ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: hasError
				? "Failed to unstar"
				: `Unstarred ${result?.repo || `${args?.owner}/${args?.repo}`}`,
		},
		forkRepo: {
			icon: GitFork,
			loadingText: `Forking ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: hasError
				? "Failed to fork"
				: `Forked to ${result?.full_name || ""}`,
		},
		watchRepo: {
			icon: Eye,
			loadingText: `Watching ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: hasError
				? "Failed to watch"
				: `Watching ${result?.repo || `${args?.owner}/${args?.repo}`}`,
		},
		unwatchRepo: {
			icon: EyeOff,
			loadingText: `Unwatching ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: hasError
				? "Failed to unwatch"
				: `Unwatched ${result?.repo || `${args?.owner}/${args?.repo}`}`,
		},
		createIssue: {
			icon: CirclePlus,
			loadingText: "Creating issue...",
			doneText: hasError
				? "Failed to create issue"
				: `Created issue #${result?.number || ""}`,
		},
		closeIssue: {
			icon: CircleX,
			loadingText: `Closing issue #${args?.issueNumber || ""}...`,
			doneText: hasError
				? "Failed to close issue"
				: `Closed issue #${result?.number || args?.issueNumber || ""}`,
		},
		listIssues: {
			icon: List,
			loadingText: `Listing issues for ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: `Found ${result?.issues?.length ?? 0} issues`,
		},
		listPullRequests: {
			icon: GitPullRequest,
			loadingText: `Listing PRs for ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: `Found ${result?.pull_requests?.length ?? 0} PRs`,
		},
		mergePullRequest: {
			icon: GitMerge,
			loadingText: `Merging PR #${args?.pullNumber || ""}...`,
			doneText: hasError
				? "Failed to merge"
				: `Merged PR #${args?.pullNumber || ""}`,
		},
		getUserProfile: {
			icon: User,
			loadingText: `Loading profile for ${args?.username || ""}...`,
			doneText: `Loaded ${result?.login || args?.username || "user"}`,
		},
		followUser: {
			icon: UserPlus,
			loadingText: `Following ${args?.username || ""}...`,
			doneText: hasError
				? "Failed to follow"
				: `Followed ${result?.username || args?.username || ""}`,
		},
		unfollowUser: {
			icon: UserMinus,
			loadingText: `Unfollowing ${args?.username || ""}...`,
			doneText: hasError
				? "Failed to unfollow"
				: `Unfollowed ${result?.username || args?.username || ""}`,
		},
		listNotifications: {
			icon: Bell,
			loadingText: "Loading notifications...",
			doneText: `Found ${result?.notifications?.length ?? 0} notifications`,
		},
		markNotificationsRead: {
			icon: BellOff,
			loadingText: "Marking notifications as read...",
			doneText: "Marked all as read",
		},
		createGist: {
			icon: Code2,
			loadingText: `Creating gist ${args?.filename || ""}...`,
			doneText: hasError ? "Failed to create gist" : "Created gist",
		},
		refreshPage: {
			icon: RotateCcw,
			loadingText: "Refreshing page...",
			doneText: "Page refreshed",
		},
		navigateTo: {
			icon: Navigation,
			loadingText: `Navigating to ${args?.page || ""}...`,
			doneText: `Navigate to ${args?.page || "page"}`,
		},
		openRepo: {
			icon: Navigation,
			loadingText: `Opening ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: `Open ${args?.owner || ""}/${args?.repo || ""}`,
		},
		openRepoTab: {
			icon: Navigation,
			loadingText: `Opening ${args?.tab || "page"} for ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: `Open ${args?.owner || ""}/${args?.repo || ""} → ${args?.tab || "page"}`,
		},
		openWorkflowRun: {
			icon: Play,
			loadingText: `Opening workflow run #${args?.runId || ""}...`,
			doneText: `Open run #${args?.runId || ""} in ${args?.owner || ""}/${args?.repo || ""}`,
		},
		openCommit: {
			icon: GitCommitHorizontal,
			loadingText: `Opening commit ${(args?.sha || "").slice(0, 7)}...`,
			doneText: `Open commit ${(args?.sha || "").slice(0, 7)} in ${args?.owner || ""}/${args?.repo || ""}`,
		},
		openIssue: {
			icon: Navigation,
			loadingText: `Opening issue #${args?.issueNumber || ""}...`,
			doneText: `Open ${args?.owner || ""}/${args?.repo || ""}#${args?.issueNumber || ""}`,
		},
		openPullRequest: {
			icon: Navigation,
			loadingText: `Opening PR #${args?.pullNumber || ""}...`,
			doneText: `Open ${args?.owner || ""}/${args?.repo || ""}#${args?.pullNumber || ""}`,
		},
		openUser: {
			icon: Navigation,
			loadingText: `Opening profile ${args?.username || ""}...`,
			doneText: `Open ${args?.username || "user"}'s profile`,
		},
		openUrl: {
			icon: ExternalLink,
			loadingText: "Opening link...",
			doneText: args?.description || "Opened link",
		},
		// Flexible API
		queryGitHub: {
			icon: GithubIcon,
			loadingText: `Querying GitHub API...`,
			doneText: hasError ? "API query failed" : "Queried GitHub API",
		},
		// Comment tools
		comment: {
			icon: MessageSquare,
			loadingText: `Commenting on #${args?.issueNumber || ""}...`,
			doneText: hasError ? "Failed to comment" : "Commented",
		},
		// Label tools
		addLabels: {
			icon: Tag,
			loadingText: "Adding labels...",
			doneText: hasError
				? "Failed to add labels"
				: `Added labels: ${result?.labels?.join(", ") || ""}`,
		},
		removeLabels: {
			icon: Tag,
			loadingText: `Removing label "${args?.label || ""}"...`,
			doneText: hasError
				? "Failed to remove label"
				: `Removed ${result?.removed || args?.label || "label"}`,
		},
		// Review tools
		requestReviewers: {
			icon: UserPlus,
			loadingText: "Requesting reviewers...",
			doneText: hasError
				? "Failed to request reviewers"
				: `Requested review from ${result?.requested_reviewers?.join(", ") || ""}`,
		},
		// Branch tools
		createBranch: {
			icon: GitBranch,
			loadingText: `Creating branch ${args?.branchName || ""}...`,
			doneText: hasError
				? "Failed to create branch"
				: `Created branch ${result?.branch || args?.branchName || ""}`,
		},
		// Assign tools
		assignIssue: {
			icon: UserPlus,
			loadingText: "Assigning users...",
			doneText: hasError
				? "Failed to assign"
				: `Assigned: ${result?.assignees?.join(", ") || ""}`,
		},
		unassignIssue: {
			icon: UserMinus,
			loadingText: "Unassigning users...",
			doneText: hasError ? "Failed to unassign" : "Unassigned users",
		},
		// Sandbox tools
		startSandbox: {
			icon: Container,
			loadingText: `Starting sandbox for ${args?.owner || ""}/${args?.repo || ""}...`,
			doneText: hasError
				? `Sandbox failed: ${result?.error || "unknown error"}`
				: `Sandbox ready — ${result?.packageManager || "npm"}${result?.isMonorepo ? " monorepo" : ""} • ${result?.branch || ""}`,
		},
		sandboxRun: {
			icon: Terminal,
			loadingText: `Running: ${(args?.command || "").slice(0, 60)}${(args?.command || "").length > 60 ? "..." : ""}`,
			doneText: hasError
				? `Failed (exit ${result?.exitCode ?? "?"}): ${(result?.error || "").slice(0, 80)}`
				: `Ran command (exit 0)`,
		},
		sandboxReadFile: {
			icon: FileDown,
			loadingText: `Reading ${args?.path || "file"}...`,
			doneText: hasError
				? `Failed to read ${args?.path || "file"}`
				: `Read ${args?.path || "file"}`,
		},
		sandboxWriteFile: {
			icon: FileUp,
			loadingText: `Writing ${args?.path || "file"}...`,
			doneText: hasError
				? `Failed to write ${args?.path || "file"}`
				: `Wrote ${args?.path || "file"}`,
		},
		sandboxCommitAndPush: {
			icon: GitCommitHorizontal,
			loadingText: `Committing and pushing to ${args?.branch || "branch"}...`,
			doneText: hasError
				? `Push failed: ${result?.error || ""}`
				: `Pushed to ${result?.branch || args?.branch || "branch"}`,
		},
		sandboxCreatePR: {
			icon: GitPullRequest,
			loadingText: "Creating pull request...",
			doneText: hasError
				? "Failed to create PR"
				: `Created PR #${result?.number || ""}: ${result?.title || args?.title || ""}`,
		},
		killSandbox: {
			icon: Power,
			loadingText: "Shutting down sandbox...",
			doneText: "Sandbox terminated",
		},
	};

	const c = (toolName && config[toolName]) || {
		icon: FileSearch,
		loadingText: `Running ${toolName ?? "tool"}...`,
		doneText: `Completed ${toolName ?? "tool"}`,
	};

	const Icon = c.icon;

	return (
		<div
			className={cn(
				"flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[11px] font-mono",
				hasError
					? "bg-destructive/[0.06] text-destructive/80"
					: hasSuccess
						? "bg-success/[0.06] text-success"
						: "bg-muted/60 text-muted-foreground/70",
			)}
		>
			{isLoading ? (
				<Loader2 className="w-3 h-3 animate-spin shrink-0" />
			) : hasError ? (
				<Icon className="w-3 h-3 shrink-0" />
			) : hasSuccess ? (
				<Check className="w-3 h-3 shrink-0" />
			) : (
				<Icon className="w-3 h-3 shrink-0" />
			)}
			<span className="truncate">
				{isLoading ? c.loadingText : hasError ? result.error : c.doneText}
			</span>
			{elapsed !== null && elapsed >= 500 && (
				<span
					className={cn(
						"shrink-0 text-[10px] tabular-nums",
						isLoading ? "opacity-60" : "opacity-40",
					)}
				>
					{formatElapsed(elapsed)}
				</span>
			)}
			{isLoading && onStop && (
				<button
					onClick={onStop}
					className="ml-auto shrink-0 p-0.5 rounded hover:bg-black/10 dark:hover:bg-white/10 transition-colors cursor-pointer"
					title="Cancel"
				>
					<Square className="w-2.5 h-2.5 fill-current" />
				</button>
			)}
		</div>
	);
}
