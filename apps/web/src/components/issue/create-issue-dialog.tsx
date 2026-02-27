"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
import { cn, getErrorMessage } from "@/lib/utils";
import ReactMarkdown from "react-markdown";
import type { IssueTemplate } from "@/app/(app)/repos/[owner]/[repo]/issues/actions";
import {
	createIssue,
	ensureForkForIssueImageUpload,
	triggerForkCreation,
	type IssueImageUploadContext,
	getIssueImageUploadContext,
	getIssueTemplates,
	getRepoLabels,
	type IssueImageUploadMode,
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
const uploadContextCache = new Map<string, IssueImageUploadContext>();

export function CreateIssueDialog({ owner, repo }: { owner: string; repo: string }) {
	const router = useRouter();
	const pathname = usePathname();
	const searchParams = useSearchParams();
	const cacheKey = `${owner}/${repo}`;
	const cached = cache.get(cacheKey);
	const cachedUploadContext = uploadContextCache.get(cacheKey);

	const [open, setOpen] = useState(false);
	const [step, setStep] = useState<"templates" | "form">("form");
	const [isDialogInitializing, setIsDialogInitializing] = useState(false);
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
	const [isForking, setIsForking] = useState(false);
	const [showForkChoice, setShowForkChoice] = useState(false);
	const [isUploadContextLoading, setIsUploadContextLoading] = useState(!cachedUploadContext);
	const [isUploadContextReady, setIsUploadContextReady] = useState(
		cachedUploadContext?.success ?? false,
	);
	const [uploadMode, setUploadMode] = useState<IssueImageUploadMode>(
		cachedUploadContext?.mode ?? "repo",
	);
	const [uploadOwner, setUploadOwner] = useState(cachedUploadContext?.uploadOwner ?? owner);
	const [uploadRepo, setUploadRepo] = useState(cachedUploadContext?.uploadRepo ?? repo);
	const [viewerLogin, setViewerLogin] = useState<string | null>(
		cachedUploadContext?.viewerLogin ?? null,
	);
	const { emit } = useMutationEvents();

	// Track whether user has touched the form (to avoid yanking them to templates)
	const userTouchedForm = useRef(false);
	const openId = useRef(0);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const dropZoneRef = useRef<HTMLDivElement>(null);

	const handleOpen = useCallback(() => {
		// Reset everything fresh
		userTouchedForm.current = false;
		setTitle("");
		setBody("");
		setSelectedLabels([]);
		setShowLabelPicker(false);
		setLabelSearch("");
		setError(null);
		setBodyTab("write");
		setUploadingImages(false);
		setIsForking(false);
		setShowForkChoice(false);
		setIsUploadContextLoading(!cachedUploadContext);
		setIsUploadContextReady(cachedUploadContext?.success ?? false);
		setUploadMode(cachedUploadContext?.mode ?? "repo");
		setUploadOwner(cachedUploadContext?.uploadOwner ?? owner);
		setUploadRepo(cachedUploadContext?.uploadRepo ?? repo);
		setViewerLogin(cachedUploadContext?.viewerLogin ?? null);

		// Hold body on first load to avoid form flash before template decision.
		const hasCachedData = Boolean(cached);
		setIsDialogInitializing(!hasCachedData);

		// Cached templates can open directly to the picker.
		if (cached && cached.templates.length > 0) {
			setTemplates(cached.templates);
			setRepoLabels(cached.labels);
			setStep("templates");
		} else {
			setStep("form");
		}

		setOpen(true);
	}, [cached, cachedUploadContext, owner, repo]);

	// Fetch templates, labels, and upload context in parallel.
	useEffect(() => {
		if (!open) return;

		const id = ++openId.current;
		const templatesPromise = getIssueTemplates(owner, repo);
		const labelsPromise = getRepoLabels(owner, repo);
		const uploadContextPromise = cachedUploadContext
			? Promise.resolve(cachedUploadContext)
			: getIssueImageUploadContext(owner, repo);

		templatesPromise
			.then((t) => {
				if (id !== openId.current) return;
				cache.set(cacheKey, {
					templates: t,
					labels: cache.get(cacheKey)?.labels ?? [],
				});
				setTemplates(t);
				if (t.length > 0 && !userTouchedForm.current) {
					setStep("templates");
					setIsDialogInitializing(false);
				}
			})
			.catch((err: unknown) => {
				if (id !== openId.current) return;
				setError(getErrorMessage(err));
				setStep("form");
			});

		labelsPromise
			.then((l) => {
				if (id !== openId.current) return;
				cache.set(cacheKey, {
					templates: cache.get(cacheKey)?.templates ?? [],
					labels: l,
				});
				setRepoLabels(l);
			})
			.catch(() => {
				if (id !== openId.current) return;
				setRepoLabels([]);
			});

		uploadContextPromise
			.then((uploadContext) => {
				if (id !== openId.current) return;
				uploadContextCache.set(cacheKey, uploadContext);
				if (uploadContext.success) {
					setIsUploadContextReady(true);
					setUploadMode(uploadContext.mode ?? "repo");
					setUploadOwner(uploadContext.uploadOwner ?? owner);
					setUploadRepo(uploadContext.uploadRepo ?? repo);
					setViewerLogin(uploadContext.viewerLogin ?? null);
					if (uploadContext.mode !== "needs_fork") {
						setShowForkChoice(false);
					}
				} else if (uploadContext.error) {
					setIsUploadContextReady(false);
					setError(uploadContext.error);
				}
			})
			.catch((err: unknown) => {
				if (id !== openId.current) return;
				setIsUploadContextReady(false);
				setError(getErrorMessage(err));
			})
			.finally(() => {
				if (id !== openId.current) return;
				setIsUploadContextLoading(false);
			});

		Promise.allSettled([templatesPromise]).finally(() => {
			if (id !== openId.current) return;
			setIsDialogInitializing(false);
			if (!userTouchedForm.current) {
				const currentTemplates = cache.get(cacheKey)?.templates ?? [];
				setStep(currentTemplates.length > 0 ? "templates" : "form");
			}
		});
	}, [open, owner, repo, cacheKey, cachedUploadContext]);

	useEffect(() => {
		const shouldOpen = searchParams.get("new");
		if (!open && (shouldOpen === "1" || shouldOpen === "true")) {
			handleOpen();
		}
	}, [searchParams, open, handleOpen]);

	const handleForkForUploads = async (openPickerAfter = false) => {
		if (isForking) return;
		setShowForkChoice(false);
		setIsForking(true);
		setError(null);
		try {
			// Kick off fork creation and return immediately — GitHub provisions it async.
			// We open the file picker right away so the user can browse while the fork provisions.
			// uploadImage will retry on 404 until the fork is ready.
			const result = await triggerForkCreation(owner, repo);
			if (result.success) {
				const forkOwner = result.viewerLogin ?? owner;
				const forkRepo = result.uploadRepo ?? repo;
				const ctx: IssueImageUploadContext = {
					success: true,
					mode: "fork",
					viewerLogin: result.viewerLogin,
					uploadOwner: forkOwner,
					uploadRepo: forkRepo,
				};
				uploadContextCache.set(cacheKey, ctx);
				setUploadMode("fork");
				setUploadOwner(forkOwner);
				setUploadRepo(forkRepo);
				setViewerLogin(result.viewerLogin ?? null);
				// Open the picker immediately — fork will finish provisioning while user browses.
				if (openPickerAfter) {
					requestAnimationFrame(() => fileInputRef.current?.click());
				}
			} else {
				setError(
					result.error ||
						"Failed to fork repository for image uploads",
				);
			}
		} finally {
			setIsForking(false);
		}
	};

	const startForkChoice = useCallback(() => {
		if (isForking || showForkChoice) return;
		setShowForkChoice(true);
	}, [isForking, showForkChoice]);

	const cancelForkChoice = useCallback(() => {
		setShowForkChoice(false);
	}, []);

	const chooseEnterImageUrl = useCallback(() => {
		cancelForkChoice();
		textareaRef.current?.focus();
	}, [cancelForkChoice]);

	const onImageButtonClick = useCallback(() => {
		if (isUploadContextLoading) {
			setError("Preparing image uploads. Please wait a moment.");
			return;
		}
		if (!isUploadContextReady) {
			setError(
				"Unable to verify image upload access right now. Please try again.",
			);
			return;
		}
		if (uploadMode === "needs_fork" || uploadMode === "name_taken") {
			setError(null);
			startForkChoice();
			return;
		}
		fileInputRef.current?.click();
	}, [isUploadContextLoading, isUploadContextReady, startForkChoice, uploadMode]);

	const handleClose = useCallback(() => {
		cancelForkChoice();
		setIsDialogInitializing(false);
		const params = new URLSearchParams(searchParams.toString());
		if (params.has("new")) {
			params.delete("new");
			router.replace(params.size ? `${pathname}?${params.toString()}` : pathname);
		}
		setOpen(false);
	}, [cancelForkChoice, pathname, router, searchParams]);

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
		if (isUploadContextLoading) {
			setError("Preparing image uploads. Please wait a moment.");
			return;
		}

		if (!isUploadContextReady) {
			setError(
				"Unable to verify image upload access right now. Please try again.",
			);
			return;
		}

		if (uploadMode === "needs_fork" || uploadMode === "name_taken") {
			setError(
				uploadMode === "name_taken"
					? "Fork name is already taken by another repository."
					: "Upload images with Better Hub by forking this repository or entering an image URL.",
			);
			startForkChoice();
			return;
		}

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
			const result = await uploadImage(uploadOwner, uploadRepo, file);
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
		[body, uploadMode, uploadOwner, uploadRepo, startForkChoice],
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
		[body, uploadMode, uploadOwner, uploadRepo, startForkChoice],
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
				className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-foreground hover:bg-foreground/90 text-background transition-colors cursor-pointer rounded-md"
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

					{isDialogInitializing ? (
						<div className="flex-1 min-h-0 flex items-center justify-center px-4 py-8">
							<div className="flex items-center gap-2 text-xs text-muted-foreground/70">
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
								Loading issue options...
							</div>
						</div>
					) : step === "templates" ? (
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
									className="w-full flex items-start gap-3 px-3 py-2.5 border border-border/50 dark:border-white/6 hover:border-foreground/15 hover:bg-muted/30 dark:hover:bg-white/2 transition-colors cursor-pointer text-left rounded-lg group"
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
								className="w-full flex items-center gap-3 px-3 py-2.5 border border-dashed border-border/60 dark:border-white/8 hover:border-foreground/15 hover:bg-muted/30 dark:hover:bg-white/2 transition-colors cursor-pointer rounded-lg"
							>
								<Plus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
								<span className="text-[13px] text-muted-foreground/60">
									Blank issue
								</span>
							</button>
						</div>
					) : (
						<div className="flex flex-col flex-1 min-h-0 relative">
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
							<div className="flex-1 min-h-0 flex flex-col px-4 pt-2 pb-0 relative">
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
												onClick={
													onImageButtonClick
												}
												className="p-1 text-muted-foreground/35 hover:text-muted-foreground transition-colors cursor-pointer rounded"
												title={
													uploadMode ===
													"needs_fork"
														? "Fork repository to enable image upload"
														: uploadMode ===
															  "name_taken"
															? "Fork name is not available"
															: uploadMode ===
																  "fork"
																? `Upload image to ${uploadOwner}/${uploadRepo}`
																: "Upload image"
												}
												type="button"
												disabled={
													uploadingImages ||
													isForking ||
													isUploadContextLoading ||
													!isUploadContextReady
												}
											>
												{uploadingImages ||
												isForking ||
												isUploadContextLoading ? (
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
										"flex-1 min-h-0 rounded-lg border border-border/50 dark:border-white/6 overflow-hidden bg-muted/15 dark:bg-white/1 focus-within:border-foreground/15 transition-colors",
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
									{!isUploadContextLoading &&
										uploadMode ===
											"repo" && (
											<span className="text-[10px] text-muted-foreground/40">
												Drag
												&
												drop,
												paste,
												or
												click
												the
												image
												button
												to
												upload
												images
											</span>
										)}
									{isUploadContextLoading && (
										<span className="text-[10px] text-muted-foreground/40 flex items-center gap-1.5">
											<Loader2 className="w-3 h-3 animate-spin" />
											Preparing
											image
											uploads...
										</span>
									)}
									{!isUploadContextLoading &&
										uploadMode ===
											"fork" && (
											<span className="text-[10px] text-muted-foreground/40">
												Images
												upload
												to{" "}
												{
													uploadOwner
												}
												/
												{
													uploadRepo
												}
												.
												Issue
												will
												still
												be
												created
												in{" "}
												{
													owner
												}
												/
												{
													repo
												}
												.
											</span>
										)}
									{!isUploadContextLoading &&
										uploadMode ===
											"needs_fork" && (
											<div className="flex items-center gap-2">
												<span className="text-[10px] text-muted-foreground/40">
													Click
													the
													image
													button
													to
													fork
													this
													repo
													or
													enter
													an
													image
													URL.
												</span>
											</div>
										)}
									{!isUploadContextLoading &&
										uploadMode ===
											"name_taken" && (
											<div className="flex items-center gap-2">
												<span className="text-[10px] text-destructive/60">
													Fork
													name
													is
													not
													available.
												</span>
											</div>
										)}
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

							{bodyTab === "write" &&
								(uploadMode === "needs_fork" ||
									uploadMode ===
										"name_taken") &&
								showForkChoice &&
								!isForking && (
									<div className="absolute inset-0 z-20 bg-background/55 flex items-center justify-center p-4">
										<div className="w-full max-w-sm rounded-lg border border-border/50 bg-background shadow-lg overflow-hidden">
											<div className="px-4 py-3 flex items-start justify-between gap-3 border-b border-border/40">
												<p className="text-xs font-medium text-balance leading-relaxed">
													To
													upload
													images
													with
													Better
													Hub
													fork
													this
													repository
													or
													enter
													an
													image
													URL.
												</p>
												<button
													type="button"
													onClick={
														cancelForkChoice
													}
													className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-muted/40"
												>
													<X className="w-3.5 h-3.5" />
												</button>
											</div>

											<div className="px-4 py-3">
												{uploadMode ===
												"name_taken" ? (
													<div className="space-y-2">
														<div className="flex items-center gap-2 text-destructive">
															<AlertCircle className="w-3.5 h-3.5 shrink-0" />
															<p className="text-[11px] leading-normal font-medium">
																A
																repository
																named{" "}
																<span className="font-mono">
																	{viewerLogin ??
																		"your account"}
																	/
																	{
																		repo
																	}
																</span>{" "}
																already
																exists
																but
																is
																not
																a
																fork
																of
																this
																repository.
															</p>
														</div>
														<p className="text-[10px] text-muted-foreground leading-relaxed">
															Please
															rename
															or
															delete
															the
															existing
															repository
															on
															GitHub
															to
															enable
															image
															uploads
															via
															forking.
														</p>
													</div>
												) : (
													<>
														<p className="text-[10px] text-muted-foreground/70 mb-2 font-medium">
															Fork
															will
															be
															created
															at
														</p>
														<div className="inline-flex items-center px-2 py-1 rounded-md bg-muted/30 border border-border/50 text-[11px] font-mono text-foreground">
															{viewerLogin ??
																"your account"}
															/
															{
																repo
															}
														</div>
													</>
												)}
											</div>

											<div className="flex justify-end gap-2 px-4 pb-3">
												<button
													type="button"
													onClick={
														chooseEnterImageUrl
													}
													className="px-3 py-1.5 text-[11px] rounded-md border border-border/50 hover:border-foreground/20 hover:bg-muted/40 transition-colors text-muted-foreground hover:text-foreground"
												>
													Enter
													image
													URL
												</button>
												<button
													type="button"
													onClick={() =>
														void handleForkForUploads(
															true,
														)
													}
													disabled={
														uploadMode ===
														"name_taken"
													}
													className={cn(
														"px-3 py-1.5 text-[11px] font-medium rounded-md transition-colors",
														uploadMode ===
															"name_taken"
															? "bg-muted text-muted-foreground/30 cursor-not-allowed border border-border/30"
															: "bg-foreground text-background hover:bg-foreground/90",
													)}
												>
													Fork
													repo
												</button>
											</div>
										</div>
									</div>
								)}
						</div>
					)}
				</DialogContent>
			</Dialog>
		</>
	);
}
