"use client";

import { useState, useTransition, useRef, useMemo, useEffect } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import {
	Loader2,
	ChevronDown,
	AlertCircle,
	Bold,
	Italic,
	Code,
	Link as LinkIcon,
	List,
	ListOrdered,
	Quote,
	CornerDownLeft,
	Eye,
	Pencil,
	GitBranch,
	ArrowLeft,
	Search,
	FileText,
	Plus,
	Minus,
	GitCommitHorizontal,
	GitCommit,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import { TimeAgo } from "@/components/ui/time-ago";
import {
	createPullRequest,
	compareBranches,
	fetchBranches,
	type CompareResult,
	type BranchInfo,
} from "./actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { PRDiffList } from "@/components/pr/pr-diff-list";

function branchKey(b: BranchInfo, repoOwner: string) {
	return b.owner === repoOwner ? b.name : `${b.owner}:${b.name}`;
}

function BranchPicker({
	branches,
	selected,
	onSelect,
	label,
	repoOwner,
}: {
	branches: BranchInfo[];
	selected: string;
	onSelect: (value: string) => void;
	label: string;
	repoOwner: string;
}) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const ref = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!open) return;
		const handler = (e: MouseEvent) => {
			if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
		};
		document.addEventListener("mousedown", handler);
		return () => document.removeEventListener("mousedown", handler);
	}, [open]);

	useEffect(() => {
		if (open) {
			setSearch("");
			requestAnimationFrame(() => inputRef.current?.focus());
		}
	}, [open]);

	const filtered = useMemo(() => {
		const lc = search.toLowerCase();
		return branches.filter((b) =>
			search
				? b.name.toLowerCase().includes(lc) ||
					b.owner.toLowerCase().includes(lc)
				: true,
		);
	}, [branches, search]);

	return (
		<div className="relative" ref={ref}>
			<span className="text-[10px] text-muted-foreground/50 block mb-1">
				{label}
			</span>
			<button
				type="button"
				onClick={() => setOpen((v) => !v)}
				className="flex items-center gap-1.5 w-full px-2.5 py-1.5 text-[12px] border border-border/50 dark:border-white/6 rounded-md hover:border-foreground/15 transition-colors cursor-pointer bg-muted/15 dark:bg-white/[0.01]"
			>
				<GitBranch className="w-3 h-3 text-muted-foreground/50 shrink-0" />
				<span className="truncate flex-1 text-left font-mono">
					{selected || "Select..."}
				</span>
				<ChevronDown className="w-3 h-3 text-muted-foreground/40 shrink-0" />
			</button>

			{open && (
				<div className="absolute top-full left-0 right-0 mt-1 z-50 border border-border/50 dark:border-white/6 rounded-lg bg-background shadow-lg overflow-hidden min-w-[280px]">
					<div className="px-2.5 py-1.5 border-b border-border/40 dark:border-white/5">
						<div className="flex items-center gap-1.5">
							<Search className="w-3 h-3 text-muted-foreground/30" />
							<input
								ref={inputRef}
								type="text"
								value={search}
								onChange={(e) =>
									setSearch(e.target.value)
								}
								spellCheck={false}
								placeholder="Filter branches..."
								className="w-full bg-transparent text-[11px] placeholder:text-muted-foreground/30 focus:outline-none"
							/>
						</div>
					</div>
					<div className="max-h-64 overflow-y-auto">
						{filtered.length > 0 ? (
							filtered.map((b) => {
								const key = branchKey(b, repoOwner);
								const isFork =
									b.owner !== repoOwner;
								return (
									<button
										key={key}
										type="button"
										onClick={() => {
											onSelect(
												key,
											);
											setOpen(
												false,
											);
										}}
										className={cn(
											"flex items-center gap-2 w-full px-2.5 py-1.5 text-left transition-colors cursor-pointer text-[11px] font-mono",
											key ===
												selected
												? "bg-muted/40 dark:bg-white/[0.03] text-foreground"
												: "hover:bg-muted/20 dark:hover:bg-white/[0.015] text-muted-foreground",
										)}
									>
										{isFork && (
											<span className="text-muted-foreground/40 shrink-0">
												{
													b.owner
												}
												:
											</span>
										)}
										<span className="truncate">
											{b.name}
										</span>
										{b.isDefault && (
											<span className="text-[9px] px-1 py-px rounded bg-muted/60 dark:bg-white/5 text-muted-foreground/50 shrink-0">
												default
											</span>
										)}
									</button>
								);
							})
						) : (
							<p className="px-2.5 py-3 text-[11px] text-muted-foreground/30 text-center">
								No branches match
							</p>
						)}
					</div>
				</div>
			)}
		</div>
	);
}

function CompareStats({ data }: { data: CompareResult }) {
	const totalAdditions = data.files.reduce((s, f) => s + f.additions, 0);
	const totalDeletions = data.files.reduce((s, f) => s + f.deletions, 0);

	return (
		<div className="flex items-center gap-4 text-[11px] text-muted-foreground/60">
			<span className="flex items-center gap-1">
				<GitCommitHorizontal className="w-3.5 h-3.5" />
				{data.total_commits} commit{data.total_commits !== 1 ? "s" : ""}
			</span>
			<span className="flex items-center gap-1">
				<FileText className="w-3.5 h-3.5" />
				{data.files.length} file{data.files.length !== 1 ? "s" : ""} changed
			</span>
			<span className="text-green-600 dark:text-green-400 flex items-center gap-0.5">
				<Plus className="w-3 h-3" />
				{totalAdditions}
			</span>
			<span className="text-red-600 dark:text-red-400 flex items-center gap-0.5">
				<Minus className="w-3 h-3" />
				{totalDeletions}
			</span>
		</div>
	);
}

export default function NewPullRequestPage() {
	const { owner, repo } = useParams<{ owner: string; repo: string }>();
	const router = useRouter();

	const [branches, setBranches] = useState<BranchInfo[]>([]);
	const [loadingBranches, setLoadingBranches] = useState(true);
	const [base, setBase] = useState("");
	const [head, setHead] = useState("");

	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [bodyTab, setBodyTab] = useState<"write" | "preview">("write");
	const textareaRef = useRef<HTMLTextAreaElement>(null);

	const [compare, setCompare] = useState<CompareResult | null>(null);
	const [compareLoading, setCompareLoading] = useState(false);
	const [compareError, setCompareError] = useState<string | null>(null);

	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const { emit } = useMutationEvents();

	useEffect(() => {
		fetchBranches(owner, repo).then((b) => {
			setBranches(b);
			const def = b.find((br) => br.isDefault && br.owner === owner);
			if (def) setBase(branchKey(def, owner));
			setLoadingBranches(false);
		});
	}, [owner, repo]);

	useEffect(() => {
		if (!base || !head || base === head) {
			setCompare(null);
			setCompareError(null);
			return;
		}

		setCompareLoading(true);
		setCompareError(null);
		const controller = new AbortController();

		compareBranches(owner, repo, base, head).then((result) => {
			if (controller.signal.aborted) return;
			setCompareLoading(false);
			if (result.success && result.data) {
				setCompare(result.data);
			} else {
				setCompare(null);
				setCompareError(result.error || "Failed to compare branches");
			}
		});

		return () => controller.abort();
	}, [owner, repo, base, head]);

	const handleSubmit = () => {
		if (!title.trim()) {
			setError("Title is required");
			return;
		}
		if (!base) {
			setError("Base branch is required");
			return;
		}
		if (!head) {
			setError("Head branch is required");
			return;
		}
		if (base === head) {
			setError("Head and base branches must be different");
			return;
		}
		setError(null);
		startTransition(async () => {
			const result = await createPullRequest(
				owner,
				repo,
				title.trim(),
				body.trim(),
				head,
				base,
			);
			if (result.success && result.number) {
				emit({
					type: "pr:created",
					owner,
					repo,
					number: result.number,
				});
				router.push(`/${owner}/${repo}/pull/${result.number}`);
			} else {
				setError(result.error || "Failed to create pull request");
			}
		});
	};

	const insertMarkdown = (prefix: string, suffix: string = prefix) => {
		const ta = textareaRef.current;
		if (!ta) return;
		const start = ta.selectionStart;
		const end = ta.selectionEnd;
		const selected = body.slice(start, end);
		const replacement = selected
			? `${prefix}${selected}${suffix}`
			: `${prefix}${suffix}`;
		const newBody = body.slice(0, start) + replacement + body.slice(end);
		setBody(newBody);
		requestAnimationFrame(() => {
			ta.focus();
			const cursorPos = selected
				? start + replacement.length
				: start + prefix.length;
			ta.setSelectionRange(cursorPos, cursorPos);
		});
	};

	const insertLinePrefix = (prefix: string) => {
		const ta = textareaRef.current;
		if (!ta) return;
		const start = ta.selectionStart;
		const lineStart = body.lastIndexOf("\n", start - 1) + 1;
		const newBody = body.slice(0, lineStart) + prefix + body.slice(lineStart);
		setBody(newBody);
		requestAnimationFrame(() => {
			ta.focus();
			ta.setSelectionRange(start + prefix.length, start + prefix.length);
		});
	};

	const toolbarActions = [
		{ icon: Bold, action: () => insertMarkdown("**"), title: "Bold" },
		{ icon: Italic, action: () => insertMarkdown("_"), title: "Italic" },
		{ icon: Code, action: () => insertMarkdown("`"), title: "Code" },
		{
			icon: LinkIcon,
			action: () => insertMarkdown("[", "](url)"),
			title: "Link",
		},
		{ icon: Quote, action: () => insertLinePrefix("> "), title: "Quote" },
		{ icon: List, action: () => insertLinePrefix("- "), title: "Bullet list" },
		{
			icon: ListOrdered,
			action: () => insertLinePrefix("1. "),
			title: "Numbered list",
		},
	];

	const canSubmit = title.trim() && base && head && base !== head;

	return (
		<div className="max-w-5xl mx-auto px-4 py-6">
			<div className="flex items-center gap-3 mb-6">
				<Link
					href={`/repos/${owner}/${repo}/pulls`}
					className="flex items-center gap-1.5 text-[12px] text-muted-foreground/50 hover:text-foreground transition-colors"
				>
					<ArrowLeft className="w-3.5 h-3.5" />
					Pull Requests
				</Link>
				<span className="text-muted-foreground/20">/</span>
				<h1 className="text-lg font-medium">New Pull Request</h1>
			</div>

			<div className="flex items-end gap-3 mb-6 p-4 rounded-lg border border-border/50 dark:border-white/6 bg-muted/10 dark:bg-white/[0.01]">
				{loadingBranches ? (
					<div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 py-2">
						<Loader2 className="w-3.5 h-3.5 animate-spin" />
						Loading branches...
					</div>
				) : (
					<>
						<div className="flex-1 min-w-0 max-w-[240px]">
							<BranchPicker
								branches={branches}
								selected={base}
								onSelect={setBase}
								label="base"
								repoOwner={owner}
							/>
						</div>
						<ArrowLeft className="w-4 h-4 text-muted-foreground/25 mb-2 shrink-0" />
						<div className="flex-1 min-w-0 max-w-[240px]">
							<BranchPicker
								branches={branches}
								selected={head}
								onSelect={setHead}
								label="compare"
								repoOwner={owner}
							/>
						</div>
					</>
				)}
			</div>

			{compareLoading && (
				<div className="flex items-center gap-2 text-[11px] text-muted-foreground/50 mb-4">
					<Loader2 className="w-3.5 h-3.5 animate-spin" />
					Comparing branches...
				</div>
			)}

			{compareError && (
				<div className="flex items-center gap-2 mb-4 px-3 py-2 text-[11px] text-destructive bg-destructive/5 rounded-md border border-destructive/10">
					<AlertCircle className="w-3.5 h-3.5 shrink-0" />
					{compareError}
				</div>
			)}

			{compare && !compareLoading && (
				<div className="mb-4">
					<CompareStats data={compare} />
				</div>
			)}

			{compare && compare.total_commits > 0 && !compareLoading && (
				<>
					<div className="rounded-lg border border-border/50 dark:border-white/6 overflow-hidden mb-6">
						<div className="px-4 pt-4 pb-2">
							<input
								spellCheck={false}
								type="text"
								value={title}
								onChange={(e) =>
									setTitle(e.target.value)
								}
								placeholder="Pull request title"
								autoFocus
								className="w-full bg-transparent text-base font-medium placeholder:text-muted-foreground/30 focus:outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										textareaRef.current?.focus();
									}
								}}
							/>
							<div className="h-px bg-border/40 dark:bg-white/6 mt-3" />
						</div>

						<div className="px-4 pt-1 pb-4">
							<div className="flex items-center gap-0 mb-1.5">
								<div className="flex items-center gap-0 mr-3">
									<button
										onClick={() =>
											setBodyTab(
												"write",
											)
										}
										className={cn(
											"flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer",
											bodyTab ===
												"write"
												? "text-foreground bg-muted/60 dark:bg-white/5 font-medium"
												: "text-muted-foreground/50 hover:text-muted-foreground",
										)}
									>
										<Pencil className="w-3 h-3" />
										Write
									</button>
									<button
										onClick={() =>
											setBodyTab(
												"preview",
											)
										}
										className={cn(
											"flex items-center gap-1 px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer",
											bodyTab ===
												"preview"
												? "text-foreground bg-muted/60 dark:bg-white/5 font-medium"
												: "text-muted-foreground/50 hover:text-muted-foreground",
										)}
									>
										<Eye className="w-3 h-3" />
										Preview
									</button>
								</div>

								{bodyTab === "write" && (
									<div className="flex items-center gap-0 border-l border-border/30 dark:border-white/5 pl-2">
										{toolbarActions.map(
											({
												icon: Icon,
												action,
												title: t,
											}) => (
												<button
													key={
														t
													}
													onClick={
														action
													}
													className="p-1 text-muted-foreground/35 hover:text-muted-foreground transition-colors cursor-pointer rounded"
													title={
														t
													}
													type="button"
												>
													<Icon className="w-3.5 h-3.5" />
												</button>
											),
										)}
									</div>
								)}
							</div>

							<div className="rounded-lg border border-border/50 dark:border-white/6 overflow-hidden bg-muted/15 dark:bg-white/[0.01] focus-within:border-foreground/15 transition-colors">
								{bodyTab === "write" ? (
									<textarea
										ref={textareaRef}
										value={body}
										onChange={(e) =>
											setBody(
												e
													.target
													.value,
											)
										}
										placeholder="Describe your changes... (Markdown supported)"
										className="w-full min-h-[160px] bg-transparent px-3 py-2.5 text-[13px] leading-relaxed placeholder:text-muted-foreground/25 focus:outline-none resize-y font-mono"
										onKeyDown={(e) => {
											if (
												e.key ===
													"Enter" &&
												(e.metaKey ||
													e.ctrlKey)
											) {
												e.preventDefault();
												handleSubmit();
											}
										}}
									/>
								) : (
									<div className="min-h-[160px] px-3 py-2.5">
										{body.trim() ? (
											<div className="ghmd text-[13px]">
												<ReactMarkdown>
													{
														body
													}
												</ReactMarkdown>
											</div>
										) : (
											<p className="text-[13px] text-muted-foreground/25 italic">
												Nothing
												to
												preview
											</p>
										)}
									</div>
								)}
							</div>
						</div>
					</div>

					<div className="flex items-center justify-between mb-8">
						{error && (
							<div className="flex items-center gap-2 text-[11px] text-destructive">
								<AlertCircle className="w-3 h-3 shrink-0" />
								{error}
							</div>
						)}
						<div className="flex-1" />
						<div className="flex items-center gap-3">
							<span className="text-[10px] text-muted-foreground/25">
								{typeof navigator !== "undefined" &&
								/Mac|iPhone|iPad/.test(
									navigator.userAgent,
								)
									? "\u2318"
									: "Ctrl"}
								+Enter to submit
							</span>
							<button
								onClick={handleSubmit}
								disabled={isPending || !canSubmit}
								className={cn(
									"flex items-center gap-1.5 px-5 py-2 text-[12px] font-medium rounded-md transition-all cursor-pointer",
									canSubmit
										? "bg-green-600 hover:bg-green-700 text-white"
										: "bg-muted dark:bg-white/5 text-muted-foreground/30 cursor-not-allowed",
									"disabled:opacity-50 disabled:cursor-not-allowed",
								)}
							>
								{isPending ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<CornerDownLeft className="w-3.5 h-3.5 opacity-60" />
								)}
								Create pull request
							</button>
						</div>
					</div>

					<div className="mb-6 rounded-lg border border-border/50 dark:border-white/6 overflow-hidden">
						<div className="px-3 py-2 bg-muted/30 dark:bg-white/[0.02] border-b border-border/30 dark:border-white/5">
							<span className="text-[11px] font-medium text-muted-foreground/60 flex items-center gap-1.5">
								<GitCommit className="w-3.5 h-3.5" />
								Commits
							</span>
						</div>
						<div className="divide-y divide-border/30 dark:divide-white/5">
							{compare.commits.map((commit) => (
								<div
									key={commit.sha}
									className="flex items-center gap-3 px-3 py-2"
								>
									{commit.author ? (
										<Image
											src={
												commit
													.author
													.avatar_url
											}
											alt={
												commit
													.author
													.login
											}
											width={20}
											height={20}
											className="rounded-full shrink-0"
										/>
									) : (
										<div className="w-5 h-5 rounded-full bg-muted/50 shrink-0" />
									)}
									<span className="text-[12px] truncate flex-1 min-w-0">
										{
											commit.message.split(
												"\n",
											)[0]
										}
									</span>
									<code className="text-[10px] text-muted-foreground/40 font-mono shrink-0">
										{commit.sha.slice(
											0,
											7,
										)}
									</code>
									{commit.date && (
										<span className="text-[10px] text-muted-foreground/30 shrink-0">
											<TimeAgo
												date={
													commit.date
												}
											/>
										</span>
									)}
								</div>
							))}
						</div>
					</div>

					{compare.files.length > 0 && (
						<PRDiffList files={compare.files} />
					)}
				</>
			)}

			{!compareLoading &&
				!compare &&
				!compareError &&
				head &&
				base &&
				base === head && (
					<div className="text-center py-12">
						<GitBranch className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
						<p className="text-sm text-muted-foreground/40">
							Choose different branches to compare
						</p>
					</div>
				)}

			{!compareLoading &&
				!compare &&
				!compareError &&
				(!head || !base) &&
				!loadingBranches && (
					<div className="text-center py-12">
						<GitBranch className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
						<p className="text-sm text-muted-foreground/40">
							Select branches to compare
						</p>
					</div>
				)}

			{compare && compare.total_commits === 0 && !compareLoading && (
				<div className="text-center py-12">
					<GitBranch className="w-8 h-8 text-muted-foreground/20 mx-auto mb-3" />
					<p className="text-sm text-muted-foreground/40">
						These branches are identical - there&apos;s nothing
						to compare
					</p>
				</div>
			)}
		</div>
	);
}
