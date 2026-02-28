"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
	Plus,
	Loader2,
	FileText,
	ChevronLeft,
	Tag,
	X,
	AlertCircle,
	Check,
	Bold,
	Italic,
	Code,
	Link,
	List,
	ListOrdered,
	Quote,
	CornerDownLeft,
	Eye,
	Pencil,
	Image,
} from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import type { IssueTemplate } from "@/app/(app)/repos/[owner]/[repo]/issues/actions";
import {
	createIssue,
	getIssueTemplates,
	getRepoLabels,
	uploadImage,
} from "@/app/(app)/repos/[owner]/[repo]/issues/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface RepoLabel {
	name: string;
	color: string;
	description: string | null;
}

// Cache templates & labels per repo so reopening is instant
const cache = new Map<string, { templates: IssueTemplate[]; labels: RepoLabel[] }>();

const DRAFT_PREFIX = "better-hub:draft:issue:";

export function CreateIssueDialog({ owner, repo }: { owner: string; repo: string }) {
	const router = useRouter();
	const cacheKey = `${owner}/${repo}`;
	const draftKey = `${DRAFT_PREFIX}${cacheKey}`;
	const cached = cache.get(cacheKey);

	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<"templates" | "form">("form");
	const [templates, setTemplates] = useState<IssueTemplate[]>(cached?.templates ?? []);
	const [repoLabels, setRepoLabels] = useState<RepoLabel[]>(cached?.labels ?? []);

	// Form state
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
	const [showLabelPicker, setShowLabelPicker] = useState(false);
	const [labelSearch, setLabelSearch] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const [bodyTab, setBodyTab] = useState<"write" | "preview">("write");
	const [uploadingImages, setUploadingImages] = useState(false);
	const { emit } = useMutationEvents();

	// Track whether user has touched the form (to avoid yanking them to templates)
	const userTouchedForm = useRef(false);
	const openId = useRef(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dropZoneRef = useRef<HTMLDivElement>(null);

	const handleOpen = useCallback(() => {
		// Restore draft from localStorage if present
		let draft: { title: string; body: string } | null = null;
		try {
			const raw =
				typeof window !== "undefined"
					? localStorage.getItem(draftKey)
					: null;
			if (raw) draft = JSON.parse(raw) as { title: string; body: string };
		} catch {
			/* ignore */
		}

		if (draft?.title || draft?.body) {
			userTouchedForm.current = true;
			setTitle(draft.title ?? "");
			setBody(draft.body ?? "");
			setStep("form");
		} else {
			userTouchedForm.current = false;
			setTitle("");
			setBody("");
		}
		setSelectedLabels([]);
		setShowLabelPicker(false);
		setLabelSearch("");
		setError(null);
		setBodyTab("write");
		setUploadingImages(false);

		if (!draft?.title && !draft?.body && cached && cached.templates.length > 0) {
			setTemplates(cached.templates);
			setRepoLabels(cached.labels);
			setStep("templates");
		} else if (!draft?.title && !draft?.body) {
			setStep("form");
		}

		setOpen(true);
	}, [cached, draftKey]);

	// Fetch templates + labels in background
	useEffect(() => {
		if (!open) return;

		const id = ++openId.current;

		Promise.all([getIssueTemplates(owner, repo), getRepoLabels(owner, repo)]).then(
			([t, l]) => {
				// Stale check — dialog was closed or reopened since
				if (id !== openId.current) return;

				cache.set(cacheKey, { templates: t, labels: l });
				setTemplates(t);
				setRepoLabels(l);

				// Only switch to template picker if user hasn't started typing
				if (t.length > 0 && !userTouchedForm.current) {
					setStep("templates");
				}
			},
		);
	}, [open, owner, repo, cacheKey]);

	// Persist draft to localStorage when title/body change (debounced)
	useEffect(() => {
		if (!open || (!title && !body)) return;
		const t = setTimeout(() => {
			try {
				localStorage.setItem(draftKey, JSON.stringify({ title, body }));
			} catch {
				/* ignore */
			}
		}, 500);
		return () => clearTimeout(t);
	}, [open, title, body, draftKey]);

	const handleClose = useCallback(() => {
		setOpen(false);
	}, []);

	const selectTemplate = (template: IssueTemplate) => {
		setTitle(template.title);
		setBody(template.body);
		setSelectedLabels(template.labels);
		userTouchedForm.current = true;
		setStep("form");
	};

	const selectBlank = () => {
		setTitle("");
		setBody("");
		setSelectedLabels([]);
		userTouchedForm.current = true;
		setStep("form");
	};

	const toggleLabel = (name: string) => {
		setSelectedLabels((prev) =>
			prev.includes(name) ? prev.filter((l) => l !== name) : [...prev, name],
		);
	};

	const filteredLabels = repoLabels.filter((l) =>
		labelSearch ? l.name.toLowerCase().includes(labelSearch.toLowerCase()) : true,
	);

	const handleSubmit = () => {
		if (!title.trim()) {
			setError("Title is required");
			return;
		}
		setError(null);
		startTransition(async () => {
			const result = await createIssue(
				owner,
				repo,
				title.trim(),
				body.trim(),
				selectedLabels,
				[],
			);
			if (result.success && result.number) {
				try {
					localStorage.removeItem(draftKey);
				} catch {
					/* ignore */
				}
				emit({ type: "issue:created", owner, repo, number: result.number });
				setOpen(false);
				router.push(`/${owner}/${repo}/issues/${result.number}`);
			} else {
				setError(result.error || "Failed to create issue");
			}
		});
	};

	// Handle image upload and insert markdown
	const handleImageUpload = async (file: File) => {
		if (!file.type.startsWith("image/")) {
			setError("Only image files are allowed");
			return;
		}

		// Check file size (GitHub has a 100MB limit but we'll use 10MB for issues)
		if (file.size > 10 * 1024 * 1024) {
			setError("Image file is too large (max 10MB)");
			return;
		}

		setUploadingImages(true);
		setError(null);

		try {
			const result = await uploadImage(owner, repo, file);
			if (result.success && result.url) {
				// Insert markdown image at cursor position
				const ta = textareaRef.current;
				if (ta) {
					const start = ta.selectionStart;
					const end = ta.selectionEnd;
					const imageMarkdown = `\n![${file.name}](${result.url})\n`;
					const newBody =
						body.slice(0, start) +
						imageMarkdown +
						body.slice(end);
					setBody(newBody);
					userTouchedForm.current = true;

					// Restore cursor position after the image
					requestAnimationFrame(() => {
						ta.focus();
						const cursorPos = start + imageMarkdown.length;
						ta.setSelectionRange(cursorPos, cursorPos);
					});
				} else {
					// Fallback: append to end
					setBody(
						(prev) =>
							prev + `\n![${file.name}](${result.url})\n`,
					);
				}
			} else {
				setError(result.error || "Failed to upload image");
			}
		} catch (err) {
			setError("Failed to upload image");
		} finally {
			setUploadingImages(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	// Handle file input change
	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			handleImageUpload(files[0]);
		}
	};

	// Handle drag and drop events
	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		e.stopPropagation();
	}, []);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			e.stopPropagation();

			const files = e.dataTransfer.files;
			if (files && files.length > 0) {
				// Upload the first image file
				for (const file of files) {
					if (file.type.startsWith("image/")) {
						handleImageUpload(file);
						break;
					}
				}
			}
		},
		[body],
	);

	// Handle paste events
	const handlePaste = useCallback(
		async (e: React.ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;

			for (const item of items) {
				if (item.type.startsWith("image/")) {
					e.preventDefault();
					const file = item.getAsFile();
					if (file) {
						await handleImageUpload(file);
					}
					break;
				}
			}
		},
		[body],
	);

	// Insert markdown formatting around selection or at cursor
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
		userTouchedForm.current = true;
		// Restore cursor position
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
		// Find start of current line
		const lineStart = body.lastIndexOf("\n", start - 1) + 1;
		const newBody = body.slice(0, lineStart) + prefix + body.slice(lineStart);
		setBody(newBody);
		userTouchedForm.current = true;
		requestAnimationFrame(() => {
			ta.focus();
			ta.setSelectionRange(start + prefix.length, start + prefix.length);
		});
	};

	const toolbarActions = [
		{ icon: Bold, action: () => insertMarkdown("**"), title: "Bold" },
		{ icon: Italic, action: () => insertMarkdown("_"), title: "Italic" },
		{ icon: Code, action: () => insertMarkdown("`"), title: "Code" },
		{ icon: Link, action: () => insertMarkdown("[", "](url)"), title: "Link" },
		{ icon: Quote, action: () => insertLinePrefix("> "), title: "Quote" },
		{ icon: List, action: () => insertLinePrefix("- "), title: "Bullet list" },
		{
			icon: ListOrdered,
			action: () => insertLinePrefix("1. "),
			title: "Numbered list",
		},
	];

	return (
		<>
			<button
				onClick={handleOpen}
				className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-background transition-colors cursor-pointer rounded-sm"
			>
				<Plus className="w-3 h-3" />
				New issue
			</button>

			<Dialog
				open={open}
				onOpenChange={(v) => {
					if (!v) handleClose();
				}}
			>
				<DialogContent
					className={cn(
						"sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col",
						step === "form" && "sm:h-[min(80vh,720px)]",
					)}
					showCloseButton={false}
				>
					{/* Header */}
					<DialogHeader className="px-4 py-3 border-b border-border/50 dark:border-white/6 shrink-0">
						<div className="flex items-center gap-3">
							{step === "form" &&
								templates.length > 0 && (
									<button
										onClick={() =>
											setStep(
												"templates",
											)
										}
										className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
									>
										<ChevronLeft className="w-4 h-4" />
									</button>
								)}
							<div className="flex-1 min-w-0">
								<DialogTitle className="text-sm font-medium">
									{step === "templates"
										? "New issue"
										: "Create issue"}
								</DialogTitle>
								<DialogDescription className="text-[11px] text-muted-foreground/50 font-mono">
									{owner}/{repo}
								</DialogDescription>
							</div>
							<button
								onClick={handleClose}
								className="text-muted-foreground hover:text-foreground transition-colors cursor-pointer p-1 rounded-md hover:bg-muted/50"
							>
								<X className="w-3.5 h-3.5" />
							</button>
						</div>
					</DialogHeader>

					{step === "templates" ? (
						<div className="p-4 space-y-1.5 flex-1 overflow-y-auto">
							<p className="text-[11px] text-muted-foreground/50 mb-2">
								Choose a template or start from
								scratch
							</p>

							{templates.map((t, i) => (
								<button
									key={i}
									onClick={() =>
										selectTemplate(t)
									}
									className="w-full flex items-start gap-3 px-3 py-2.5 border border-border/50 dark:border-white/6 hover:border-foreground/15 hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors cursor-pointer text-left rounded-lg group"
								>
									<FileText className="w-3.5 h-3.5 text-muted-foreground group-hover:text-muted-foreground/60 shrink-0 mt-0.5 transition-colors" />
									<div className="min-w-0 flex-1">
										<span className="text-[13px] font-medium block">
											{t.name}
										</span>
										{t.about && (
											<span className="text-[11px] text-muted-foreground/50 block mt-0.5 line-clamp-2">
												{
													t.about
												}
											</span>
										)}
										{t.labels.length >
											0 && (
											<div className="flex items-center gap-1 mt-1.5">
												{t.labels.map(
													(
														label,
													) => {
														const repoLabel =
															repoLabels.find(
																(
																	l,
																) =>
																	l.name ===
																	label,
															);
														return (
															<span
																key={
																	label
																}
																className="text-[9px] px-1.5 py-px rounded-full"
																style={
																	repoLabel
																		? {
																				backgroundColor: `#${repoLabel.color}18`,
																				color: `#${repoLabel.color}`,
																			}
																		: undefined
																}
															>
																{
																	label
																}
															</span>
														);
													},
												)}
											</div>
										)}
									</div>
								</button>
							))}

							<button
								onClick={selectBlank}
								className="w-full flex items-center gap-3 px-3 py-2.5 border border-dashed border-border/60 dark:border-white/8 hover:border-foreground/15 hover:bg-muted/30 dark:hover:bg-white/[0.02] transition-colors cursor-pointer rounded-lg"
							>
								<Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
								<span className="text-[13px] text-muted-foreground/60">
									Blank issue
								</span>
							</button>
						</div>
					) : (
						<div className="flex flex-col flex-1 min-h-0">
							{/* Title input — clean, borderless, prominent */}
							<div className="px-4 pt-3 pb-0 shrink-0">
								<input
									type="text"
									value={title}
									onChange={(e) => {
										setTitle(
											e.target
												.value,
										);
										userTouchedForm.current = true;
									}}
									placeholder="Issue title"
									autoFocus
									className="w-full bg-transparent text-base font-medium placeholder:text-muted-foreground/30 focus:outline-none"
									onKeyDown={(e) => {
										if (
											e.key ===
											"Enter"
										) {
											e.preventDefault();
											textareaRef.current?.focus();
										}
									}}
								/>
								<div className="h-px bg-border/40 dark:bg-white/6 mt-2" />
							</div>

							{/* Body editor area */}
							<div className="flex-1 min-h-0 flex flex-col px-4 pt-2 pb-0">
								{/* Tabs + toolbar row */}
								<div className="flex items-center gap-0 mb-1.5 shrink-0">
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

									{/* Markdown toolbar — only visible in write mode */}
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
											{/* Image upload button */}
											<button
												onClick={() =>
													fileInputRef.current?.click()
												}
												className="p-1 text-muted-foreground/35 hover:text-muted-foreground transition-colors cursor-pointer rounded"
												title="Upload image"
												type="button"
												disabled={
													uploadingImages
												}
											>
												{uploadingImages ? (
													<Loader2 className="w-3.5 h-3.5 animate-spin" />
												) : (
													<Image className="w-3.5 h-3.5" />
												)}
											</button>
										</div>
									)}
								</div>

								{/* Write / Preview */}
								<div
									ref={dropZoneRef}
									onDragOver={handleDragOver}
									onDrop={handleDrop}
									className={cn(
										"flex-1 min-h-0 rounded-lg border border-border/50 dark:border-white/6 overflow-hidden bg-muted/15 dark:bg-white/[0.01] focus-within:border-foreground/15 transition-colors",
										bodyTab ===
											"write" &&
											"relative",
									)}
								>
									{/* Hidden file input for image upload */}
									<input
										type="file"
										ref={fileInputRef}
										onChange={
											handleFileInputChange
										}
										accept="image/*"
										className="hidden"
									/>
									{bodyTab === "write" ? (
										<>
											<textarea
												ref={
													textareaRef
												}
												value={
													body
												}
												onChange={(
													e,
												) => {
													setBody(
														e
															.target
															.value,
													);
													userTouchedForm.current = true;
												}}
												placeholder="Describe the issue... (Markdown supported)"
												className="w-full h-full bg-transparent px-3 py-2.5 text-[13px] leading-relaxed placeholder:text-muted-foreground/25 focus:outline-none resize-none font-mono"
												onKeyDown={(
													e,
												) => {
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
												onPaste={
													handlePaste
												}
											/>
											{/* Drag overlay hint */}
											{uploadingImages && (
												<div className="absolute inset-0 bg-background/80 flex items-center justify-center">
													<div className="flex items-center gap-2 text-sm text-muted-foreground">
														<Loader2 className="w-4 h-4 animate-spin" />
														Uploading
														image...
													</div>
												</div>
											)}
										</>
									) : (
										<div className="h-full overflow-y-auto px-3 py-2.5">
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

								{/* Upload hint */}
								<div className="flex items-center justify-between mt-1">
									<span className="text-[10px] text-muted-foreground/40">
										Drag & drop, paste,
										or click the image
										button to upload
										images
									</span>
								</div>
							</div>

							{/* Labels row — compact, inline */}
							<div className="px-4 py-2 shrink-0">
								{!showLabelPicker ? (
									<div className="flex items-center gap-1.5 min-h-[28px]">
										<Tag className="w-3 h-3 text-muted-foreground/30 shrink-0" />
										{selectedLabels.length >
										0 ? (
											<div className="flex items-center gap-1 flex-wrap flex-1 min-w-0">
												{selectedLabels.map(
													(
														name,
													) => {
														const l =
															repoLabels.find(
																(
																	rl,
																) =>
																	rl.name ===
																	name,
															);
														return (
															<span
																key={
																	name
																}
																className="flex items-center gap-1 text-[10px] px-1.5 py-px rounded-full"
																style={
																	l
																		? {
																				backgroundColor: `#${l.color}20`,
																				color: `#${l.color}`,
																			}
																		: {
																				backgroundColor:
																					"var(--muted)",
																				color: "var(--muted-foreground)",
																			}
																}
															>
																<span
																	className="w-1.5 h-1.5 rounded-full"
																	style={
																		l
																			? {
																					backgroundColor: `#${l.color}`,
																				}
																			: undefined
																	}
																/>
																{
																	name
																}
																<button
																	onClick={() =>
																		toggleLabel(
																			name,
																		)
																	}
																	className="hover:opacity-60 cursor-pointer"
																>
																	<X className="w-2.5 h-2.5" />
																</button>
															</span>
														);
													},
												)}
											</div>
										) : (
											<span className="text-[11px] text-muted-foreground/25 flex-1">
												No
												labels
											</span>
										)}
										{repoLabels.length >
											0 && (
											<button
												onClick={() =>
													setShowLabelPicker(
														true,
													)
												}
												className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer shrink-0"
											>
												{selectedLabels.length >
												0
													? "Edit"
													: "Add"}
											</button>
										)}
									</div>
								) : (
									<div className="border border-border/50 dark:border-white/6 rounded-lg overflow-hidden">
										{/* Search */}
										<div className="px-3 py-1.5 border-b border-border/40 dark:border-white/5 bg-muted/20 dark:bg-white/[0.01]">
											<input
												type="text"
												value={
													labelSearch
												}
												onChange={(
													e,
												) =>
													setLabelSearch(
														e
															.target
															.value,
													)
												}
												placeholder="Filter labels..."
												autoFocus
												className="w-full bg-transparent text-[11px] placeholder:text-muted-foreground/30 focus:outline-none"
											/>
										</div>

										{/* Label list */}
										<div className="max-h-40 overflow-y-auto">
											{filteredLabels.length >
											0 ? (
												filteredLabels.map(
													(
														l,
													) => {
														const isSelected =
															selectedLabels.includes(
																l.name,
															);
														return (
															<button
																key={
																	l.name
																}
																onClick={() =>
																	toggleLabel(
																		l.name,
																	)
																}
																className={cn(
																	"flex items-center gap-2 w-full px-3 py-1.5 text-left transition-colors cursor-pointer",
																	isSelected
																		? "bg-muted/40 dark:bg-white/[0.03]"
																		: "hover:bg-muted/20 dark:hover:bg-white/[0.015]",
																)}
															>
																<span
																	className="w-2.5 h-2.5 rounded-full shrink-0"
																	style={{
																		backgroundColor: `#${l.color}`,
																	}}
																/>
																<span className="text-[11px] flex-1 min-w-0 truncate">
																	{
																		l.name
																	}
																</span>
																{isSelected && (
																	<Check className="w-3 h-3 text-success shrink-0" />
																)}
															</button>
														);
													},
												)
											) : (
												<p className="px-3 py-3 text-[11px] text-muted-foreground/30 text-center">
													No
													labels
													match
												</p>
											)}
										</div>

										{/* Footer */}
										<div className="px-3 py-1.5 border-t border-border/40 dark:border-white/5 bg-muted/20 dark:bg-white/[0.01] flex items-center justify-between">
											<span className="text-[10px] text-muted-foreground/35">
												{selectedLabels.length >
												0
													? `${selectedLabels.length} selected`
													: "None"}
											</span>
											<button
												onClick={() => {
													setShowLabelPicker(
														false,
													);
													setLabelSearch(
														"",
													);
												}}
												className="text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer"
											>
												Done
											</button>
										</div>
									</div>
								)}
							</div>

							{/* Footer */}
							<div className="px-4 py-2.5 border-t border-border/40 dark:border-white/5 shrink-0">
								{error && (
									<div className="flex items-center gap-2 mb-2 text-[11px] text-destructive">
										<AlertCircle className="w-3 h-3 shrink-0" />
										{error}
									</div>
								)}
								<div className="flex items-center justify-between">
									<span className="text-[10px] text-muted-foreground/25">
										{typeof navigator !==
											"undefined" &&
										/Mac|iPhone|iPad/.test(
											navigator.userAgent,
										)
											? "⌘"
											: "Ctrl"}
										+Enter to submit
									</span>
									<div className="flex items-center gap-2">
										<button
											onClick={
												handleClose
											}
											className="px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-md"
										>
											Cancel
										</button>
										<button
											onClick={
												handleSubmit
											}
											disabled={
												isPending ||
												!title.trim()
											}
											className={cn(
												"flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer",
												title.trim()
													? "bg-foreground text-background hover:bg-foreground/90"
													: "bg-muted dark:bg-white/5 text-muted-foreground/30 cursor-not-allowed",
												"disabled:opacity-50 disabled:cursor-not-allowed",
											)}
										>
											{isPending ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<CornerDownLeft className="w-3 h-3 opacity-50" />
											)}
											Submit
										</button>
									</div>
								</div>
							</div>
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
