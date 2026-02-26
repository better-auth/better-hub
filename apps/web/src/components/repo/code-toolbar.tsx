"use client";

import { useState, useTransition } from "react";
import { Copy, Check, Download, GitBranch, Search, Trash2, X, Loader2 } from "lucide-react";

interface EnrichedBranch {
	name: string;
	pr?: {
		number: number;
		state: "open" | "merged" | "closed";
		user: { login: string; avatarUrl: string };
	};
}

interface CodeToolbarProps {
	owner: string;
	repo: string;
	currentRef: string;
	branches: EnrichedBranch[];
	defaultBranch: string;
	onDeleteBranch?: (
		owner: string,
		repo: string,
		branch: string,
	) => Promise<{ success: boolean }>;
}

export function CodeToolbar({
	owner,
	repo,
	currentRef,
	branches,
	defaultBranch,
	onDeleteBranch,
}: CodeToolbarProps) {
	const [showClone, setShowClone] = useState(false);
	const [copied, setCopied] = useState(false);
	const [showBranches, setShowBranches] = useState(false);
	const [branchSearch, setBranchSearch] = useState("");
	const [deletingBranch, setDeletingBranch] = useState<string | null>(null);
	const [localBranches, setLocalBranches] = useState(branches);
	const [isPending, startTransition] = useTransition();
	const [cloneProtocol, setCloneProtocol] = useState<"https" | "ssh">("https");

	const cloneUrl =
		cloneProtocol === "https"
			? `https://github.com/${owner}/${repo}.git`
			: `git@github.com:${owner}/${repo}.git`;

	const zipUrl = `https://github.com/${owner}/${repo}/archive/refs/heads/${currentRef}.zip`;

	const filteredBranches = localBranches.filter((b) =>
		b.name.toLowerCase().includes(branchSearch.toLowerCase()),
	);

	function handleCopy() {
		navigator.clipboard.writeText(cloneUrl);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	function handleProtocolChange(protocol: "https" | "ssh") {
		setCloneProtocol(protocol);
	}

	function handleDeleteBranch(branch: string) {
		if (!onDeleteBranch) return;
		startTransition(async () => {
			const result = await onDeleteBranch(owner, repo, branch);
			if (result.success) {
				setLocalBranches((prev) => prev.filter((b) => b.name !== branch));
			}
			setDeletingBranch(null);
		});
	}

	return (
		<>
			<div className="flex items-center gap-2">
				{/* Branch count */}
				<div className="relative">
					<button
						onClick={() => {
							setShowBranches(!showBranches);
							setShowClone(false);
							setBranchSearch("");
							setDeletingBranch(null);
						}}
						className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/60 hover:text-muted-foreground cursor-pointer transition-colors"
					>
						<GitBranch className="w-2.5 h-2.5" />
						{localBranches.length}
					</button>

					{showBranches && (
						<>
							<div
								className="fixed inset-0 z-40"
								onClick={() =>
									setShowBranches(false)
								}
							/>
							<div className="absolute left-0 top-full mt-2 w-72 z-50 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-xl animate-in fade-in slide-in-from-top-1 duration-150">
								<div className="p-3 border-b border-border">
									<p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2">
										Branches
									</p>
									<div className="relative">
										<Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground/50" />
										<input
											type="text"
											placeholder="Filter branches..."
											value={
												branchSearch
											}
											onChange={(
												e,
											) =>
												setBranchSearch(
													e
														.target
														.value,
												)
											}
											className="w-full bg-muted/30 dark:bg-white/5 text-xs font-mono pl-7 pr-2.5 py-1.5 rounded-md border border-border text-muted-foreground focus:outline-none placeholder:text-muted-foreground/50"
										/>
									</div>
								</div>
								<div className="relative max-h-60 overflow-y-auto">
									{isPending && (
										<div className="absolute inset-0 bg-card/60 backdrop-blur-[1px] z-10 flex items-center justify-center">
											<Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />
										</div>
									)}
									{filteredBranches.length ===
									0 ? (
										<p className="px-3 py-4 text-xs font-mono text-muted-foreground/60 text-center">
											No branches
											found
										</p>
									) : (
										<ul className="py-1">
											{filteredBranches.map(
												(
													branch,
												) => (
													<li
														key={
															branch.name
														}
														className="group flex items-center gap-2 px-3 py-1.5 hover:bg-muted/40 dark:hover:bg-white/5"
													>
														{deletingBranch ===
														branch.name ? (
															<div className="flex items-center gap-2 flex-1 min-w-0">
																<span className="text-xs font-mono text-destructive shrink-0">
																	Delete?
																</span>
																<div className="ml-auto flex items-center gap-1">
																	<button
																		onClick={() =>
																			handleDeleteBranch(
																				branch.name,
																			)
																		}
																		className="p-0.5 rounded text-destructive hover:text-destructive/80 hover:bg-destructive/10 cursor-pointer transition-colors"
																	>
																		<Check className="w-3.5 h-3.5" />
																	</button>
																	<button
																		onClick={() =>
																			setDeletingBranch(
																				null,
																			)
																		}
																		className="p-0.5 rounded text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/60 cursor-pointer transition-colors"
																	>
																		<X className="w-3.5 h-3.5" />
																	</button>
																</div>
															</div>
														) : (
															<>
																<span className="text-xs font-mono text-muted-foreground truncate flex-1 min-w-0">
																	{
																		branch.name
																	}
																</span>
																{branch.pr && (
																	<span className="shrink-0 flex items-center gap-1.5">
																		{/* eslint-disable-next-line @next/next/no-img-element */}
																		<img
																			src={
																				branch
																					.pr
																					.user
																					.avatarUrl
																			}
																			alt={
																				branch
																					.pr
																					.user
																					.login
																			}
																			className="w-4 h-4 rounded-full"
																		/>
																		<span className="text-[10px] font-mono text-muted-foreground/60">
																			#
																			{
																				branch
																					.pr
																					.number
																			}
																		</span>
																		<span
																			className={`w-2 h-2 rounded-full ${
																				branch
																					.pr
																					.state ===
																				"open"
																					? "bg-success"
																					: branch
																								.pr
																								.state ===
																						  "merged"
																						? "bg-alert-important"
																						: "bg-muted-foreground"
																			}`}
																		/>
																	</span>
																)}
																{branch.name ===
																	defaultBranch && (
																	<span className="shrink-0 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 border border-border px-1.5 py-0.5 rounded">
																		default
																	</span>
																)}
																{branch.name !==
																	defaultBranch &&
																	onDeleteBranch && (
																		<button
																			onClick={() =>
																				setDeletingBranch(
																					branch.name,
																				)
																			}
																			className="shrink-0 p-0.5 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 cursor-pointer transition-all"
																		>
																			<Trash2 className="w-3 h-3" />
																		</button>
																	)}
															</>
														)}
													</li>
												),
											)}
										</ul>
									)}
								</div>
							</div>
						</>
					)}
				</div>

				<div className="ml-auto flex items-center">
					<div className="flex items-center rounded-md border border-border overflow-hidden divide-x divide-border">
						<button
							onClick={() => {
								setShowClone(!showClone);
								setShowBranches(false);
							}}
							className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
						>
							<Copy className="w-3 h-3" />
							Clone
						</button>
						<a
							href={zipUrl}
							className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 transition-colors"
						>
							<Download className="w-3 h-3" />
							ZIP
						</a>
					</div>
				</div>
			</div>

			{/* Clone dropdown */}
			{showClone && (
				<>
					<div
						className="fixed inset-0 z-40"
						onClick={() => setShowClone(false)}
					/>
					<div className="relative z-50">
						<div className="absolute right-0 top-2 w-80 rounded-lg border border-border bg-card/95 backdrop-blur-sm shadow-xl p-3.5 animate-in fade-in slide-in-from-top-1 duration-150">
							{/* Protocol toggle */}
							<div className="flex items-center gap-1 mb-3">
								<button
									onClick={() =>
										handleProtocolChange(
											"https",
										)
									}
									className={`flex-1 py-1.5 text-[10px] font-mono rounded-md border transition-colors cursor-pointer ${
										cloneProtocol ===
										"https"
											? "bg-muted/60 dark:bg-white/10 border-border text-foreground"
											: "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
									}`}
								>
									HTTPS
								</button>
								<button
									onClick={() =>
										handleProtocolChange(
											"ssh",
										)
									}
									className={`flex-1 py-1.5 text-[10px] font-mono rounded-md border transition-colors cursor-pointer ${
										cloneProtocol ===
										"ssh"
											? "bg-muted/60 dark:bg-white/10 border-border text-foreground"
											: "border-transparent text-muted-foreground/60 hover:text-muted-foreground"
									}`}
								>
									SSH
								</button>
							</div>
							<p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70 mb-2.5">
								Clone with{" "}
								{cloneProtocol.toUpperCase()}
							</p>
							<div className="flex items-center gap-1.5">
								<input
									readOnly
									value={cloneUrl}
									className="flex-1 bg-muted/30 dark:bg-white/5 text-xs font-mono px-2.5 py-2 rounded-md border border-border text-muted-foreground focus:outline-none select-all"
								/>
								<button
									onClick={handleCopy}
									className="shrink-0 px-2.5 py-2 rounded-md border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60 dark:hover:bg-white/5 transition-colors cursor-pointer"
								>
									{copied ? (
										<Check className="w-3.5 h-3.5 text-success" />
									) : (
										<Copy className="w-3.5 h-3.5" />
									)}
								</button>
							</div>
						</div>
					</div>
				</>
			)}
		</>
	);
}
