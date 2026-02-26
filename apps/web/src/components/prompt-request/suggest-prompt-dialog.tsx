"use client";

import { useState, useTransition, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X, AlertCircle, CornerDownLeft, Sparkles, ImagePlus } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createPromptRequestAction } from "@/app/(app)/repos/[owner]/[repo]/prompts/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface SuggestPromptDialogProps {
	owner: string;
	repo: string;
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function SuggestPromptDialog({ owner, repo, open, onOpenChange }: SuggestPromptDialogProps) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();
	const [isRewriting, setIsRewriting] = useState(false);
	const [isUploading, setIsUploading] = useState(false);
	const [isDragOver, setIsDragOver] = useState(false);
	const textareaRef = useRef<HTMLTextAreaElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleClose = () => {
		onOpenChange(false);
	};

	const reset = () => {
		setBody("");
		setError(null);
	};

	const uploadFile = useCallback(
		async (file: File) => {
			if (!file.type.startsWith("image/")) {
				setError("Only image files are supported");
				return;
			}
			if (file.size > 5 * 1024 * 1024) {
				setError("Image must be under 5 MB");
				return;
			}

			setIsUploading(true);
			setError(null);

			try {
				const formData = new FormData();
				formData.append("file", file);

				const res = await fetch("/api/upload", {
					method: "POST",
					body: formData,
				});
				const data = await res.json();

				if (!res.ok) {
					setError(data.error || "Upload failed");
					return;
				}

				// Insert markdown image at cursor position
				const ta = textareaRef.current;
				const markdown = `![${file.name}](${data.url})`;
				if (ta) {
					const start = ta.selectionStart;
					const end = ta.selectionEnd;
					const before = body.slice(0, start);
					const after = body.slice(end);
					const needsNewline =
						before.length > 0 && !before.endsWith("\n")
							? "\n"
							: "";
					const newBody =
						before + needsNewline + markdown + "\n" + after;
					setBody(newBody);
					requestAnimationFrame(() => {
						ta.focus();
						const cursor = (
							before +
							needsNewline +
							markdown +
							"\n"
						).length;
						ta.setSelectionRange(cursor, cursor);
					});
				} else {
					setBody((prev) =>
						prev ? prev + "\n" + markdown : markdown,
					);
				}
			} catch {
				setError("Failed to upload image");
			} finally {
				setIsUploading(false);
			}
		},
		[body],
	);

	const handlePaste = useCallback(
		(e: React.ClipboardEvent) => {
			const items = e.clipboardData?.items;
			if (!items) return;

			for (const item of items) {
				if (item.type.startsWith("image/")) {
					e.preventDefault();
					const file = item.getAsFile();
					if (file) uploadFile(file);
					return;
				}
			}
		},
		[uploadFile],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			const file = e.dataTransfer.files[0];
			if (file?.type.startsWith("image/")) {
				uploadFile(file);
			}
		},
		[uploadFile],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	}, []);

	const handleRewrite = async () => {
		if (!body.trim() || isRewriting) return;
		setIsRewriting(true);
		setError(null);
		try {
			const res = await fetch("/api/ai/rewrite-prompt", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: body.trim(), owner, repo }),
			});
			const data = await res.json();
			if (!res.ok) {
				if (data.error === "MESSAGE_LIMIT_REACHED") {
					setError("AI message limit reached");
				} else {
					setError(data.error || "Failed to rewrite");
				}
				return;
			}
			setBody(data.text);
			requestAnimationFrame(() => textareaRef.current?.focus());
		} catch {
			setError("Failed to rewrite prompt");
		} finally {
			setIsRewriting(false);
		}
	};

	const handleSubmit = () => {
		if (!body.trim()) {
			setError("Describe the change you want");
			return;
		}
		setError(null);
		startTransition(async () => {
			try {
				const pr = await createPromptRequestAction(
					owner,
					repo,
					body.trim(),
				);
				reset();
				onOpenChange(false);
				emit({ type: "prompt:created", owner, repo });
				router.push(`/${owner}/${repo}/prompts/${pr.id}`);
			} catch {
				setError("Failed to create prompt request");
			}
		});
	};

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				if (!v) {
					handleClose();
				}
			}}
		>
			<DialogContent
				className="sm:max-w-xl p-0 gap-0 overflow-hidden flex flex-col sm:h-[min(70vh,560px)]"
				showCloseButton={false}
				onDragOver={(e) => e.preventDefault()}
				onDrop={(e) => e.preventDefault()}
			>
				{/* Header */}
				<DialogHeader className="px-4 py-3 border-b border-border/50 dark:border-white/6 shrink-0">
					<div className="flex items-center gap-3">
						<div className="flex-1 min-w-0">
							<DialogTitle className="text-sm font-medium">
								Suggest a prompt
							</DialogTitle>
							<DialogDescription className="text-[11px] text-muted-foreground/50 font-mono">
								{owner}/{repo}
							</DialogDescription>
						</div>
						<button
							onClick={handleClose}
							className="text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer p-1 rounded-md hover:bg-muted/50"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					</div>
				</DialogHeader>

				<div className="flex flex-col flex-1 min-h-0">
					{/* Body editor */}
					<div className="flex-1 min-h-0 flex flex-col px-4 pt-3 pb-3">
						<div
							className={cn(
								"flex-1 min-h-0 rounded-lg border overflow-hidden bg-muted/15 dark:bg-white/[0.01] focus-within:border-foreground/15 transition-colors flex flex-col relative",
								isDragOver
									? "border-foreground/30 bg-foreground/5"
									: "border-border/50 dark:border-white/6",
							)}
							onDrop={handleDrop}
							onDragOver={handleDragOver}
							onDragLeave={handleDragLeave}
						>
							{isDragOver && (
								<div className="absolute inset-0 flex items-center justify-center bg-background/80 z-10 pointer-events-none">
									<div className="flex items-center gap-2 text-xs text-muted-foreground">
										<ImagePlus className="w-4 h-4" />
										Drop image to upload
									</div>
								</div>
							)}
							<textarea
								ref={textareaRef}
								value={body}
								onChange={(e) =>
									setBody(e.target.value)
								}
								onPaste={handlePaste}
								onDrop={handleDrop}
								onDragOver={handleDragOver}
								onDragLeave={handleDragLeave}
								placeholder="Describe the change in detail... What files, what behavior, what the end result should look like."
								autoFocus
								className="w-full flex-1 min-h-0 bg-transparent px-3 py-2.5 text-[13px] leading-relaxed placeholder:text-muted-foreground/25 focus:outline-none resize-none font-mono"
								onKeyDown={(e) => {
									if (
										e.key === "Enter" &&
										(e.metaKey ||
											e.ctrlKey)
									) {
										e.preventDefault();
										handleSubmit();
									}
								}}
							/>
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
							<div className="flex items-center gap-1">
								<button
									onClick={handleRewrite}
									disabled={
										!body.trim() ||
										isRewriting
									}
									title="Rewrite with AI"
									className={cn(
										"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md transition-all cursor-pointer",
										body.trim() &&
											!isRewriting
											? "text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5"
											: "text-muted-foreground/20 cursor-not-allowed",
									)}
								>
									{isRewriting ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<Sparkles className="w-3 h-3" />
									)}
									Rewrite
								</button>
								<button
									onClick={() =>
										fileInputRef.current?.click()
									}
									disabled={isUploading}
									title="Upload image"
									className={cn(
										"flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-md transition-all cursor-pointer",
										isUploading
											? "text-muted-foreground/20 cursor-not-allowed"
											: "text-muted-foreground/60 hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5",
									)}
								>
									{isUploading ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<ImagePlus className="w-3 h-3" />
									)}
								</button>
								<input
									ref={fileInputRef}
									type="file"
									accept="image/*"
									className="hidden"
									onChange={(e) => {
										const file =
											e.target
												.files?.[0];
										if (file)
											uploadFile(
												file,
											);
										e.target.value = "";
									}}
								/>
							</div>
							<div className="flex items-center gap-2">
								<button
									onClick={handleClose}
									className="px-3 py-1.5 text-[11px] text-muted-foreground/60 hover:text-foreground transition-colors cursor-pointer rounded-md"
								>
									Cancel
								</button>
								<button
									onClick={handleSubmit}
									disabled={
										isPending ||
										!body.trim() ||
										isUploading
									}
									className={cn(
										"flex items-center gap-1.5 px-4 py-1.5 text-[11px] font-medium rounded-md transition-all cursor-pointer",
										body.trim() &&
											!isUploading
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
									Suggest
								</button>
							</div>
						</div>
					</div>
				</div>
			</DialogContent>
		</Dialog>
	);
}
