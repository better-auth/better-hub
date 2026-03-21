"use client";

import { useState, useEffect, useCallback } from "react";
import { ArrowLeft, Loader2, AlertCircle, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
	Combobox,
	ComboboxInput,
	ComboboxContent,
	ComboboxList,
	ComboboxItem,
	ComboboxEmpty,
} from "@/components/ui/combobox";
import Link from "next/link";
import type { ThemeStoreDetail } from "@/lib/theme-store-types";
import { ThemePreview } from "./theme-preview";
import { ExtensionIcon } from "./default-theme-icon";

interface RepoEntry {
	name: string;
	fullName: string;
	description: string | null;
}

type Step = "input" | "scanning" | "preview" | "error";

export function PublishForm() {
	const [step, setStep] = useState<Step>("input");
	const [selectedRepo, setSelectedRepo] = useState<string | null>(null);
	const [error, setError] = useState("");
	const [result, setResult] = useState<ThemeStoreDetail | null>(null);

	const [repos, setRepos] = useState<RepoEntry[]>([]);
	const [reposLoading, setReposLoading] = useState(true);
	const [ghLogin, setGhLogin] = useState<string | null>(null);

	const fetchRepos = useCallback(async () => {
		setReposLoading(true);
		try {
			const res = await fetch("/api/theme-store/repos");
			if (!res.ok) return;
			const data = await res.json();
			setRepos(data.repos ?? []);
			setGhLogin(data.login ?? null);
		} catch {
			// non-fatal
		} finally {
			setReposLoading(false);
		}
	}, []);

	useEffect(() => {
		fetchRepos();
	}, [fetchRepos]);

	async function handleScan() {
		if (!selectedRepo) {
			setError("Select a repository to publish");
			return;
		}

		setStep("scanning");
		setError("");

		try {
			const res = await fetch("/api/theme-store/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ repo: selectedRepo }),
			});
			const data = await res.json();
			if (!res.ok) {
				setError(data.error || "Failed to scan repository");
				setStep("error");
				return;
			}
			setResult(data);
			setStep("preview");
		} catch {
			setError("Network error. Please try again.");
			setStep("error");
		}
	}

	return (
		<div className="flex flex-col h-full overflow-y-auto">
			<div className="px-4 sm:px-6 py-3">
				<Link
					href="/theme-store"
					className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
				>
					<ArrowLeft className="size-3" />
					Theme Store
				</Link>
			</div>

			<div className="flex-1 px-4 sm:px-6 py-6 max-w-2xl mx-auto w-full">
				<h1 className="text-lg font-semibold text-foreground mb-1">
					Publish Extension
				</h1>
				<p className="text-xs text-muted-foreground mb-6">
					Select one of your public GitHub repositories that contains
					a{" "}
					<code className="text-[11px] bg-muted px-1 py-0.5 rounded">
						better-hub-extension.json
					</code>{" "}
					manifest file.
				</p>

				{(step === "input" || step === "error") && (
					<div className="space-y-4">
						<div>
							<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-2 block">
								Repository
							</label>
							{reposLoading ? (
								<div className="flex items-center gap-2 h-9 px-3 text-sm text-muted-foreground border border-border rounded-md">
									<Loader2 className="size-3.5 animate-spin" />
									Loading repositories...
								</div>
							) : (
								<Combobox
									value={selectedRepo}
									onValueChange={(val) => {
										setSelectedRepo(
											val as
												| string
												| null,
										);
										setError("");
									}}
								>
									<ComboboxInput
										placeholder={
											repos.length >
											0
												? "Search your repositories..."
												: "No public repositories found"
										}
										disabled={
											repos.length ===
											0
										}
										className="w-full"
									/>
									<ComboboxContent>
										<ComboboxList>
											{repos.map(
												(
													repo,
												) => (
													<ComboboxItem
														key={
															repo.name
														}
														value={
															repo.name
														}
													>
														<div className="flex flex-col min-w-0">
															<span className="text-sm truncate">
																{ghLogin && (
																	<span className="text-muted-foreground">
																		{
																			ghLogin
																		}
																		/
																	</span>
																)}
																{
																	repo.name
																}
															</span>
															{repo.description && (
																<span className="text-[11px] text-muted-foreground/60 truncate">
																	{
																		repo.description
																	}
																</span>
															)}
														</div>
													</ComboboxItem>
												),
											)}
											<ComboboxEmpty>
												No
												matching
												repositories
											</ComboboxEmpty>
										</ComboboxList>
									</ComboboxContent>
								</Combobox>
							)}
							{selectedRepo && ghLogin && (
								<p className="text-[11px] text-muted-foreground/60 mt-1.5">
									Will publish from{" "}
									<span className="text-muted-foreground">
										{ghLogin}/
										{selectedRepo}
									</span>
								</p>
							)}
						</div>

						{error && (
							<div className="flex items-start gap-2 px-3 py-2 rounded-md bg-destructive/5 border border-destructive/20">
								<AlertCircle className="size-3.5 text-destructive shrink-0 mt-0.5" />
								<p className="text-xs text-destructive">
									{error}
								</p>
							</div>
						)}

						<Button
							onClick={handleScan}
							disabled={!selectedRepo}
							className="w-full"
						>
							Scan Repository
						</Button>

						<div className="border border-border rounded-md p-4 mt-6">
							<h3 className="text-xs font-medium text-foreground mb-2">
								Manifest format
							</h3>
							<pre className="text-[11px] text-muted-foreground bg-muted/40 p-3 rounded-md overflow-x-auto">
								{`{
  "name": "My Extension",
  "description": "A brief description",
  "version": "1.0.0",
  "type": "theme",
  "main": "theme.json",
  "icon": "icon.png",
  "license": "MIT"
}`}
							</pre>
							<p className="text-[10px] text-muted-foreground/60 mt-2">
								Supported types: <code>theme</code>,{" "}
								<code>icon-theme</code>
							</p>
						</div>
					</div>
				)}

				{step === "scanning" && (
					<div className="flex flex-col items-center justify-center py-16">
						<Loader2 className="size-6 animate-spin text-muted-foreground mb-3" />
						<p className="text-sm text-muted-foreground">
							Scanning repository...
						</p>
						<p className="text-xs text-muted-foreground/60 mt-1">
							Checking manifest, validating data, fetching
							README
						</p>
					</div>
				)}

				{step === "preview" && result && (
					<div className="space-y-6">
						<div className="flex items-center gap-2 px-3 py-2 rounded-md bg-success/5 border border-success/20">
							<Check className="size-3.5 text-success" />
							<p className="text-xs text-success">
								Extension published successfully
							</p>
						</div>

						<div className="border border-border rounded-md p-4">
							<div className="flex items-start gap-3">
								<ExtensionIcon
									iconUrl={result.iconUrl}
									type={result.type}
									className="size-10 rounded-md"
									iconClassName="size-5"
								/>
								<div className="min-w-0 flex-1">
									<div className="text-sm font-medium text-foreground">
										{result.name}
									</div>
									<p className="text-xs text-muted-foreground mt-0.5">
										{result.description}
									</p>
									<div className="flex items-center gap-2 mt-2">
										<Badge
											variant="outline"
											className="text-[10px]"
										>
											{result.type ===
											"theme"
												? "Theme"
												: "Icon Theme"}
										</Badge>
										<span className="text-[10px] text-muted-foreground/60">
											v
											{
												result.version
											}
										</span>
									</div>
								</div>
							</div>
						</div>

						{result.type === "theme" && result.dataJson && (
							<ThemePreview dataJson={result.dataJson} />
						)}

						<div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
							<Link
								href={`/theme-store/${result.slug}`}
								className="flex-1"
							>
								<Button className="w-full">
									View Extension
									<ExternalLink className="size-3.5 ml-1" />
								</Button>
							</Link>
							<Button
								variant="outline"
								className="w-full sm:w-auto"
								onClick={() => {
									setStep("input");
									setSelectedRepo(null);
									setResult(null);
								}}
							>
								Publish Another
							</Button>
						</div>
					</div>
				)}
			</div>
		</div>
	);
}
