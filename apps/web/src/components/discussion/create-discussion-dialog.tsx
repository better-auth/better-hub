"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
	Plus,
	Loader2,
	X,
	AlertCircle,
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
	ChevronDown,
	Check,
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
import { createDiscussion } from "@/app/(app)/repos/[owner]/[repo]/discussions/actions";
import { uploadImage } from "@/app/(app)/repos/[owner]/[repo]/issues/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import { GitHubEmoji } from "@/components/shared/github-emoji";
import type { DiscussionCategory } from "@/lib/github";

interface CreateDiscussionDialogProps {
	owner: string;
	repo: string;
	categories: DiscussionCategory[];
	repositoryId: string;
}

export function CreateDiscussionDialog({
	owner,
	repo,
	categories,
	repositoryId,
}: CreateDiscussionDialogProps) {
	const router = useRouter();

	const [open, setOpen] = useState(false);
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [selectedCategory, setSelectedCategory] = useState<DiscussionCategory | null>(null);
	const [showCategoryPicker, setShowCategoryPicker] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const [bodyTab, setBodyTab] = useState<"write" | "preview">("write");
	const [uploadingImages, setUploadingImages] = useState(false);
	const { emit } = useMutationEvents();

	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const categoryPickerRef = useRef<HTMLDivElement>(null);

	const handleOpen = useCallback(() => {
		setTitle("");
		setBody("");
		setSelectedCategory(null);
		setShowCategoryPicker(false);
		setError(null);
		setBodyTab("write");
		setUploadingImages(false);
		setOpen(true);
	}, []);

	const handleClose = useCallback(() => {
		setOpen(false);
	}, []);

	const handleSubmit = () => {
		if (!title.trim()) {
			setError("Title is required");
			return;
		}
		if (!selectedCategory) {
			setError("Category is required");
			return;
		}
		setError(null);
		startTransition(async () => {
			const result = await createDiscussion(
				owner,
				repo,
				repositoryId,
				selectedCategory.id,
				title.trim(),
				body.trim(),
			);
			if (result.success && result.number) {
				emit({
					type: "discussion:created",
					owner,
					repo,
					number: result.number,
				});
				setOpen(false);
				router.push(`/${owner}/${repo}/discussions/${result.number}`);
			} else {
				setError(result.error || "Failed to create discussion");
			}
		});
	};

	const handleImageUpload = async (file: File) => {
		if (!file.type.startsWith("image/")) {
			setError("Only image files are allowed");
			return;
		}
		if (file.size > 10 * 1024 * 1024) {
			setError("Image file is too large (max 10MB)");
			return;
		}

		setUploadingImages(true);
		setError(null);

		try {
			const result = await uploadImage(owner, repo, file);
			if (result.success && result.url) {
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
					requestAnimationFrame(() => {
						ta.focus();
						const cursorPos = start + imageMarkdown.length;
						ta.setSelectionRange(cursorPos, cursorPos);
					});
				} else {
					setBody(
						(prev) =>
							prev + `\n![${file.name}](${result.url})\n`,
					);
				}
			} else {
				setError(result.error || "Failed to upload image");
			}
		} catch {
			setError("Failed to upload image");
		} finally {
			setUploadingImages(false);
			if (fileInputRef.current) {
				fileInputRef.current.value = "";
			}
		}
	};

	const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const files = e.target.files;
		if (files && files.length > 0) {
			handleImageUpload(files[0]);
		}
	};

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
				className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary hover:bg-primary/90 text-background transition-colors cursor-pointer rounded-md"
			>
				<Plus className="w-3 h-3" />
				New discussion
			</button>

			<Dialog
				open={open}
				onOpenChange={(v) => {
					if (!v) handleClose();
				}}
			>
				<DialogContent
					className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col sm:h-[min(80vh,720px)]"
					showCloseButton={false}
				>
					{/* Header */}
					<DialogHeader className="px-4 py-3 border-b border-border/50 dark:border-white/6 shrink-0">
						<div className="flex items-center gap-3">
							<div className="flex-1 min-w-0">
								<DialogTitle className="text-sm font-medium">
									Create discussion
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

					<div className="flex flex-col flex-1 min-h-0">
						{/* Category picker */}
						<div className="px-4 pt-3 pb-0 shrink-0">
							<div
								className="relative"
								ref={categoryPickerRef}
							>
								<button
									type="button"
									onClick={() =>
										setShowCategoryPicker(
											!showCategoryPicker,
										)
									}
									className={cn(
										"flex items-center gap-2 w-full px-3 py-1.5 text-xs border rounded-md transition-colors cursor-pointer text-left",
										selectedCategory
											? "border-border/50 dark:border-white/6 text-foreground"
											: "border-border/40 dark:border-white/5 text-muted-foreground/50",
									)}
								>
									{selectedCategory ? (
										<>
											<GitHubEmoji
												emojiHTML={
													selectedCategory.emojiHTML
												}
											/>
											<span className="flex-1 min-w-0 truncate">
												{
													selectedCategory.name
												}
											</span>
										</>
									) : (
										<span className="flex-1">
											Select a
											category
										</span>
									)}
									<ChevronDown className="w-3 h-3 shrink-0 opacity-50" />
								</button>

								{showCategoryPicker && (
									<div className="absolute z-10 top-full left-0 right-0 mt-1 border border-border/50 dark:border-white/6 rounded-lg bg-popover shadow-lg overflow-hidden">
										<div className="max-h-52 overflow-y-auto">
											{categories.map(
												(
													cat,
												) => {
													const isSelected =
														selectedCategory?.id ===
														cat.id;
													return (
														<button
															key={
																cat.id
															}
															onClick={() => {
																setSelectedCategory(
																	cat,
																);
																setShowCategoryPicker(
																	false,
																);
															}}
															className={cn(
																"flex items-center gap-2.5 w-full px-3 py-2 text-left transition-colors cursor-pointer",
																isSelected
																	? "bg-muted/40 dark:bg-white/[0.03]"
																	: "hover:bg-muted/20 dark:hover:bg-white/[0.015]",
															)}
														>
															<span className="text-sm shrink-0">
																<GitHubEmoji
																	emojiHTML={
																		cat.emojiHTML
																	}
																/>
															</span>
															<div className="flex-1 min-w-0">
																<span className="text-[12px] font-medium block truncate">
																	{
																		cat.name
																	}
																</span>
																{cat.description && (
																	<span className="text-[10px] text-muted-foreground/50 block truncate">
																		{
																			cat.description
																		}
																	</span>
																)}
															</div>
															{isSelected && (
																<Check className="w-3 h-3 text-success shrink-0" />
															)}
														</button>
													);
												},
											)}
										</div>
									</div>
								)}
							</div>
						</div>

						{/* Title input */}
						<div className="px-4 pt-3 pb-0 shrink-0">
							<input
								type="text"
								value={title}
								onChange={(e) =>
									setTitle(e.target.value)
								}
								placeholder="Discussion title"
								autoFocus
								className="w-full bg-transparent text-base font-medium placeholder:text-muted-foreground/30 focus:outline-none"
								onKeyDown={(e) => {
									if (e.key === "Enter") {
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
								onDragOver={handleDragOver}
								onDrop={handleDrop}
								className={cn(
									"flex-1 min-h-0 rounded-lg border border-border/50 dark:border-white/6 overflow-hidden bg-muted/15 dark:bg-white/[0.01] focus-within:border-foreground/15 transition-colors",
									bodyTab === "write" &&
										"relative",
								)}
							>
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
											value={body}
											onChange={(
												e,
											) =>
												setBody(
													e
														.target
														.value,
												)
											}
											placeholder="Describe the discussion... (Markdown supported)"
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
									Drag & drop, paste, or click
									the image button to upload
									images
								</span>
							</div>
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
										? "\u2318"
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
											!title.trim() ||
											!selectedCategory
										}
										className={cn(
											"flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer",
											title.trim() &&
												selectedCategory
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
				</DialogContent>
			</Dialog>
		</>
	);
}
