"use client";

import {
	ArrowRight,
	Check,
	Chrome,
	Download,
	Puzzle,
	RefreshCw,
	Settings,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { cn } from "@/lib/utils";

const STEPS = [
	{
		number: "01",
		title: "Download the extension",
		description:
			'Click the download button above to get the .zip file. Save it anywhere on your computer — your Downloads folder works fine.',
		icon: Download,
	},
	{
		number: "02",
		title: "Unzip the file",
		description:
			"Extract the downloaded .zip file. You should see a folder containing the extension files (manifest.json, background.js, icons, etc).",
		icon: RefreshCw,
	},
	{
		number: "03",
		title: "Open Chrome extensions",
		description:
			'Navigate to chrome://extensions in your browser. Or click the puzzle icon in your toolbar and select "Manage Extensions" at the bottom.',
		code: "chrome://extensions",
		icon: Puzzle,
	},
	{
		number: "04",
		title: "Enable Developer Mode",
		description:
			'Toggle the "Developer mode" switch in the top-right corner of the extensions page. This is required to load unpacked extensions.',
		icon: Settings,
	},
	{
		number: "05",
		title: "Load the extension",
		description:
			'Click "Load unpacked" in the top-left area, then select the unzipped folder. The Better Hub extension will appear in your extensions list.',
		icon: Chrome,
	},
	{
		number: "06",
		title: "Pin it & go",
		description:
			"Click the puzzle icon in your toolbar and pin Better Hub for easy access. Visit any GitHub page — it will automatically redirect to Better Hub.",
		icon: Zap,
	},
];

const ROUTE_MAPPINGS = [
	{ from: "github.com", to: "/dashboard" },
	{ from: "/:owner/:repo", to: "/:owner/:repo" },
	{ from: "/pull/:n", to: "/pull/:n" },
	{ from: "/commit/:sha", to: "/commit/:sha" },
	{ from: "/notifications", to: "/notifications" },
	{ from: "/trending", to: "/trending" },
	{ from: "/issues", to: "/issues" },
	{ from: "/pulls", to: "/prs" },
];

export function ExtensionPageContent() {
	const [downloaded, setDownloaded] = useState(false);

	return (
		<div className="flex-1 max-w-3xl mx-auto w-full flex flex-col min-h-0">
			{/* Hero — sticky */}
			<div className="shrink-0 sticky top-0 z-10 bg-background pt-6 pb-6 relative">
				{/* Decorative background dots */}
				<div className="absolute inset-0 -z-10 opacity-[0.03]">
					<div
						className="w-full h-full"
						style={{
							backgroundImage:
								"radial-gradient(circle, currentColor 1px, transparent 1px)",
							backgroundSize: "24px 24px",
						}}
					/>
				</div>

				<div className="flex items-start gap-5">
					{/* Extension icon */}
					<div className="shrink-0 w-16 h-16 rounded-xl bg-gradient-to-br from-card to-muted border border-border flex items-center justify-center">
						<Chrome className="w-7 h-7 text-foreground/80" />
					</div>

					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<h1 className="text-xl font-medium tracking-tight">
								Better Hub Extension
							</h1>
							<span className="text-[9px] font-mono px-1.5 py-0.5 border border-border text-muted-foreground/60 rounded-sm uppercase tracking-wider">
								v1.0.0
							</span>
						</div>
						<p className="text-sm text-muted-foreground mt-1">
							Automatically redirects GitHub links to
							your Better Hub instance.
						</p>

					</div>
				</div>

				{/* Download button */}
				<div className="mt-6 flex items-center gap-3">
					<a
						href="/extension/better-hub-chrome.zip"
						download
						onClick={() => setDownloaded(true)}
						className={cn(
							"inline-flex items-center gap-2 px-5 py-2.5 text-sm font-mono rounded-md transition-all",
							downloaded
								? "bg-[var(--contrib-1)] border border-[var(--contrib-3)]/30 text-[var(--contrib-4)]"
								: "bg-foreground text-background hover:bg-foreground/90",
						)}
					>
						{downloaded ? (
							<>
								<Check className="w-4 h-4" />
								Downloaded — follow
								steps below
							</>
						) : (
							<>
								<Download className="w-4 h-4" />
								Download for Chrome
							</>
						)}
					</a>
					<span className="text-[10px] text-muted-foreground/40 font-mono">
						Manual install required (unpacked extension)
					</span>
				</div>
				{/* Bottom fade edge */}
				<div className="absolute bottom-0 left-0 right-0 h-px bg-border" />
			</div>

			{/* Scrollable content */}
			<div className="flex-1 min-h-0 overflow-y-auto pt-6">

			{/* Installation steps */}
			<div className="mb-10">
				<h2 className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-5">
					Installation Guide
				</h2>

				<div className="relative">
					{/* Vertical connector line */}
					<div className="absolute left-[19px] top-6 bottom-6 w-px bg-border" />

					<div className="flex flex-col gap-0">
						{STEPS.map((step, i) => (
							<div
								key={step.number}
								className="relative flex gap-4 group"
							>
								{/* Step number circle */}
								<div className="relative z-10 shrink-0 w-10 h-10 rounded-full border border-border bg-background flex items-center justify-center group-hover:border-foreground/20 transition-colors">
									<span className="text-[11px] font-mono text-muted-foreground group-hover:text-foreground transition-colors">
										{step.number}
									</span>
								</div>

								{/* Content */}
								<div
									className={cn(
										"flex-1 pb-6",
										i ===
											STEPS.length -
												1 &&
											"pb-0",
									)}
								>
									<div className="flex items-center gap-2 mt-2">
										<h3 className="text-sm font-medium">
											{
												step.title
											}
										</h3>
									</div>
									<p className="text-xs text-muted-foreground mt-1.5 max-w-lg leading-relaxed">
										{
											step.description
										}
									</p>
									{step.code && (
										<div className="mt-2 inline-flex items-center gap-2 px-3 py-1.5 bg-card border border-border rounded-md">
											<code className="text-[11px] font-mono text-foreground/80">
												{
													step.code
												}
											</code>
											<button
												onClick={() =>
													navigator.clipboard.writeText(
														step.code!,
													)
												}
												className="text-[10px] font-mono text-muted-foreground/40 hover:text-foreground transition-colors cursor-pointer"
											>
												copy
											</button>
										</div>
									)}
								</div>
							</div>
						))}
					</div>
				</div>
			</div>

			{/* Route mappings */}
			<div className="mb-10">
				<h2 className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-4">
					Route Mappings
				</h2>
				<div className="border border-border rounded-md divide-y divide-border overflow-hidden">
					{ROUTE_MAPPINGS.map((r) => (
						<div
							key={r.from}
							className="flex items-center px-4 py-2.5 text-[11px] font-mono"
						>
							<span className="text-muted-foreground/60 flex-1">
								{r.from}
							</span>
							<ArrowRight className="w-3 h-3 text-muted-foreground/20 mx-4 shrink-0" />
							<span className="text-muted-foreground flex-1 text-right">
								{r.to}
							</span>
						</div>
					))}
				</div>
				<p className="text-[10px] text-muted-foreground/30 font-mono mt-2">
					GitHub-only pages (settings, marketplace, login, etc.)
					are excluded and open normally.
				</p>
			</div>

			{/* After install note */}
			<div className="border border-border rounded-md p-4 bg-card/30">
				<div className="flex items-start gap-3">
					<div className="shrink-0 w-8 h-8 rounded-lg bg-[var(--contrib-1)]/30 flex items-center justify-center mt-0.5">
						<Zap className="w-4 h-4 text-[var(--contrib-3)]" />
					</div>
					<div>
						<h3 className="text-sm font-medium">
							After installation
						</h3>
						<p className="text-xs text-muted-foreground mt-1 leading-relaxed max-w-lg">
							The extension defaults to{" "}
							<code className="text-[11px] font-mono px-1 py-0.5 bg-muted rounded text-foreground/70">
								https://beta.better-hub.com
							</code>
							. You can change this anytime by clicking the
							extension icon in your toolbar and updating the
							Instance URL. Use the toggle to pause/resume
							redirects without uninstalling.
						</p>
					</div>
				</div>
			</div>
			</div>
		</div>
	);
}
