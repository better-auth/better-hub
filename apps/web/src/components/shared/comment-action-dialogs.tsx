"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, Check, ExternalLink, Flag, Loader2 } from "lucide-react";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "@/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { MarkdownEditor } from "@/components/shared/markdown-editor";
import { createIssue } from "@/app/(app)/repos/[owner]/[repo]/issues/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import {
	buildReferenceIssueDraft,
	mergeReferenceIssueRepositories,
	parseReferenceIssueRepositoryQuery,
} from "@/lib/comment-actions";
import { cn, getErrorMessage } from "@/lib/utils";

export function ReportContentDialog({
	open,
	onOpenChange,
	reportUrl,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	reportUrl: string;
}) {
	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						<Flag className="h-4 w-4" />
						Report content
					</DialogTitle>
					<DialogDescription>
						This opens GitHub&apos;s report flow in a new tab so
						you can file the report without losing your place in
						Better Hub.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<button
						type="button"
						onClick={() => onOpenChange(false)}
						className="px-3 py-2 text-sm text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer rounded-md"
					>
						Cancel
					</button>
					<button
						type="button"
						onClick={() => {
							window.open(
								reportUrl,
								"_blank",
								"noopener,noreferrer",
							);
							onOpenChange(false);
						}}
						className="inline-flex items-center justify-center gap-2 rounded-md bg-foreground px-3 py-2 text-sm font-medium text-background transition-colors hover:bg-foreground/90 cursor-pointer"
					>
						<ExternalLink className="h-4 w-4" />
						Open report flow
					</button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function ReferenceIssueDialog({
	open,
	onOpenChange,
	owner,
	repo,
	sourceBody,
	sourceUrl,
	authorLogin,
	label,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	owner: string;
	repo: string;
	sourceBody: string;
	sourceUrl: string;
	authorLogin?: string | null;
	label?: string;
}) {
	const router = useRouter();
	const { emit } = useMutationEvents();
	const [title, setTitle] = useState("");
	const [body, setBody] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [repoQuery, setRepoQuery] = useState("");
	const [selectedRepo, setSelectedRepo] = useState({ owner, repo });
	const [repoResults, setRepoResults] = useState<Array<{ owner: string; repo: string }>>([]);
	const [repoSearchError, setRepoSearchError] = useState<string | null>(null);
	const [isLoadingRepos, setIsLoadingRepos] = useState(false);
	const [isPending, startTransition] = useTransition();
	const queryKey = repoQuery.trim();
	const normalizedCurrentRepo = `${owner}/${repo}`;
	const normalizedSelectedRepo = `${selectedRepo.owner}/${selectedRepo.repo}`;
	const typedRepo = useMemo(() => parseReferenceIssueRepositoryQuery(repoQuery), [repoQuery]);
	const targetRepo = typedRepo ?? selectedRepo;
	const normalizedTargetRepo = `${targetRepo.owner}/${targetRepo.repo}`;

	const visibleRepos = useMemo(() => {
		return mergeReferenceIssueRepositories({ owner, repo }, repoResults, typedRepo);
	}, [owner, repo, repoResults, typedRepo]);

	useEffect(() => {
		if (!open) return;
		const draft = buildReferenceIssueDraft({
			body: sourceBody,
			authorLogin,
			commentUrl: sourceUrl,
		});
		setTitle(draft.title);
		setBody(draft.body);
		setError(null);
		setSelectedRepo({ owner, repo });
		setRepoQuery(`${owner}/${repo}`);
		setRepoResults([]);
		setRepoSearchError(null);
	}, [open, owner, repo, sourceBody, authorLogin, sourceUrl]);

	useEffect(() => {
		if (!open) return;
		const trimmed = queryKey;
		if (!trimmed || trimmed.toLowerCase() === normalizedSelectedRepo.toLowerCase()) {
			setRepoResults([]);
			setRepoSearchError(null);
			setIsLoadingRepos(false);
			return;
		}

		const controller = new AbortController();
		const timeout = window.setTimeout(async () => {
			try {
				setIsLoadingRepos(true);
				setRepoSearchError(null);
				const res = await fetch(
					`/api/search-repos?q=${encodeURIComponent(trimmed)}&per_page=8`,
					{ signal: controller.signal },
				);
				if (!res.ok) {
					throw new Error("Failed to search repositories");
				}
				const data = (await res.json()) as {
					items?: Array<{
						full_name?: string;
						owner?: { login?: string };
						name?: string;
					}>;
				};
				const items = (data.items ?? [])
					.map((item) => ({
						owner:
							item.owner?.login ??
							item.full_name?.split("/")[0] ??
							"",
						repo:
							item.name ??
							item.full_name?.split("/")[1] ??
							"",
					}))
					.filter((item) => item.owner && item.repo);
				setRepoResults(items);
			} catch (err) {
				if ((err as Error).name === "AbortError") return;
				setRepoResults([]);
				setRepoSearchError(getErrorMessage(err));
			} finally {
				setIsLoadingRepos(false);
			}
		}, 200);

		return () => {
			controller.abort();
			window.clearTimeout(timeout);
		};
	}, [open, queryKey, normalizedSelectedRepo]);

	const handleSubmit = () => {
		if (!title.trim()) {
			setError("Title is required");
			return;
		}

		setError(null);
		startTransition(async () => {
			try {
				const result = await createIssue(
					targetRepo.owner,
					targetRepo.repo,
					title.trim(),
					body.trim(),
					[],
					[],
				);
				if (result.error || !result.number) {
					setError(result.error ?? "Failed to create issue");
					return;
				}

				emit({
					type: "issue:created",
					owner: targetRepo.owner,
					repo: targetRepo.repo,
					number: result.number,
				});
				onOpenChange(false);
				router.push(
					`/repos/${targetRepo.owner}/${targetRepo.repo}/issues/${result.number}`,
				);
				router.refresh();
			} catch (err) {
				setError(getErrorMessage(err));
			}
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Reference in new issue</DialogTitle>
					<DialogDescription>
						Create a new issue in{" "}
						{label ?? "the selected repository"} with the
						referenced content prefilled.
					</DialogDescription>
				</DialogHeader>
				<div className="space-y-4">
					<div className="space-y-1.5">
						<label className="text-xs font-medium text-muted-foreground/70">
							Repository
						</label>
						<div className="rounded-md border border-border/60 bg-muted/10">
							<Command
								shouldFilter={false}
								className="h-auto"
							>
								<CommandInput
									value={repoQuery}
									onValueChange={setRepoQuery}
									placeholder="Search repositories or type owner/repo..."
								/>
								<CommandList className="max-h-44">
									<CommandGroup heading="Available repositories">
										{visibleRepos.map(
											(item) => {
												const value = `${item.owner}/${item.repo}`;
												const isSelected =
													value.toLowerCase() ===
													normalizedSelectedRepo.toLowerCase();
												return (
													<CommandItem
														key={
															value
														}
														value={
															value
														}
														onSelect={() => {
															setSelectedRepo(
																item,
															);
															setRepoQuery(
																value,
															);
															setRepoSearchError(
																null,
															);
														}}
														className="cursor-pointer justify-between gap-2"
													>
														<div className="min-w-0 flex-1">
															<div className="truncate">
																{
																	value
																}
															</div>
															{value.toLowerCase() ===
																normalizedCurrentRepo.toLowerCase() && (
																<div className="text-xs text-muted-foreground/60">
																	Current
																	repository
																</div>
															)}
														</div>
														{isSelected && (
															<Check className="h-4 w-4" />
														)}
													</CommandItem>
												);
											},
										)}
									</CommandGroup>
									{isLoadingRepos && (
										<div className="px-3 py-2 text-sm text-muted-foreground/70">
											Searching
											repositories...
										</div>
									)}
									{!isLoadingRepos &&
										queryKey &&
										repoResults.length ===
											0 && (
											<CommandEmpty>
												No
												matching
												repositories.
											</CommandEmpty>
										)}
								</CommandList>
							</Command>
						</div>
						<div className="text-xs text-muted-foreground/60">
							Creating issue in {normalizedTargetRepo}
						</div>
						{repoSearchError && (
							<div className="flex items-center gap-2 text-sm text-destructive">
								<AlertCircle className="h-4 w-4 shrink-0" />
								{repoSearchError}
							</div>
						)}
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-medium text-muted-foreground/70">
							Issue title
						</label>
						<input
							type="text"
							value={title}
							onChange={(e) => setTitle(e.target.value)}
							placeholder="Issue title"
							className="w-full rounded-md border border-border/60 bg-muted/10 px-3 py-2 text-sm outline-hidden transition-colors focus:border-foreground/20"
						/>
					</div>
					<div className="space-y-1.5">
						<label className="text-xs font-medium text-muted-foreground/70">
							Issue body
						</label>
						<MarkdownEditor
							value={body}
							onChange={setBody}
							placeholder="Describe the issue..."
							rows={10}
							owner={targetRepo.owner}
							onKeyDown={(e) => {
								if (e.key === "Escape")
									onOpenChange(false);
								if (
									e.key === "Enter" &&
									(e.metaKey || e.ctrlKey)
								) {
									e.preventDefault();
									handleSubmit();
								}
							}}
						/>
					</div>
					<div className="rounded-md border border-border/50 bg-muted/20 px-3 py-2 text-xs text-muted-foreground/70">
						Source:{" "}
						<a
							href={sourceUrl}
							target="_blank"
							rel="noopener noreferrer"
							className="text-foreground/80 underline underline-offset-2"
						>
							{sourceUrl}
						</a>
					</div>
					{error && (
						<div className="flex items-center gap-2 text-sm text-destructive">
							<AlertCircle className="h-4 w-4 shrink-0" />
							{error}
						</div>
					)}
				</div>
				<DialogFooter className="items-center justify-between">
					<span className="text-xs text-muted-foreground/50">
						{typeof navigator !== "undefined" &&
						/Mac|iPhone|iPad/.test(navigator.userAgent)
							? "Cmd"
							: "Ctrl"}
						+Enter to create
					</span>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={() => onOpenChange(false)}
							disabled={isPending}
							className="px-3 py-2 text-sm text-muted-foreground/80 hover:text-foreground transition-colors cursor-pointer rounded-md"
						>
							Cancel
						</button>
						<button
							type="button"
							onClick={handleSubmit}
							disabled={isPending || !title.trim()}
							className={cn(
								"inline-flex items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
								title.trim()
									? "bg-foreground text-background hover:bg-foreground/90 cursor-pointer"
									: "bg-muted text-muted-foreground/40 cursor-not-allowed",
								isPending && "opacity-50",
							)}
						>
							{isPending && (
								<Loader2 className="h-4 w-4 animate-spin" />
							)}
							Create issue
						</button>
					</div>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
