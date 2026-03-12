"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, AlertCircle, Check, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import type { ThemeStoreExtensionDetail } from "@/lib/theme-store-types";
import { ThemePreview } from "./theme-preview";
import { ExtensionIcon } from "./default-extension-icon";

type Step = "input" | "scanning" | "preview" | "error";

export function PublishForm() {
	const [step, setStep] = useState<Step>("input");
	const [repoUrl, setRepoUrl] = useState("");
	const [error, setError] = useState("");
	const [result, setResult] = useState<ThemeStoreExtensionDetail | null>(null);

	function parseRepoUrl(input: string): { owner: string; repo: string } | null {
		const trimmed = input.trim().replace(/\/+$/, "");

		const ghRegex = /(?:https?:\/\/)?(?:www\.)?github\.com\/([^/]+)\/([^/]+)/;
		const match = trimmed.match(ghRegex);
		if (match) return { owner: match[1], repo: match[2] };

		const slashParts = trimmed.split("/");
		if (
			slashParts.length === 2 &&
			slashParts[0].length > 0 &&
			slashParts[1].length > 0
		) {
			return { owner: slashParts[0], repo: slashParts[1] };
		}

		return null;
	}

	async function handleScan() {
		const parsed = parseRepoUrl(repoUrl);
		if (!parsed) {
			setError("Enter a valid GitHub repository URL or owner/repo format");
			return;
		}

		setStep("scanning");
		setError("");

		try {
			const res = await fetch("/api/theme-store/publish", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify(parsed),
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
					Enter a GitHub repository URL that contains a{" "}
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
							<input
								type="text"
								placeholder="owner/repo or https://github.com/owner/repo"
								value={repoUrl}
								onChange={(e) => {
									setRepoUrl(e.target.value);
									setError("");
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter")
										handleScan();
								}}
								className="w-full h-9 px-3 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-ring placeholder:text-muted-foreground/40"
							/>
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
							disabled={!repoUrl.trim()}
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
									setRepoUrl("");
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
