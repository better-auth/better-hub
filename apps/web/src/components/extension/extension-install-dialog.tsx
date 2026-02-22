"use client";

import {
	ArrowRight,
	Check,
	Chrome,
	Download,
	ExternalLink,
	Puzzle,
	RefreshCw,
	Settings,
	Zap,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

const QUICK_STEPS = [
	{
		icon: Download,
		label: "Download .zip",
		detail: "Save the extension file",
	},
	{
		icon: RefreshCw,
		label: "Unzip the file",
		detail: "Extract the folder",
	},
	{
		icon: Puzzle,
		label: "chrome://extensions",
		detail: "Open extensions page",
	},
	{
		icon: Settings,
		label: "Developer Mode → on",
		detail: "Toggle in top-right",
	},
	{
		icon: Chrome,
		label: '"Load unpacked"',
		detail: "Select the unzipped folder",
	},
];

interface ExtensionInstallDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

export function ExtensionInstallDialog({ open, onOpenChange }: ExtensionInstallDialogProps) {
	const [downloaded, setDownloaded] = useState(false);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="sm:max-w-md gap-0 p-0 overflow-hidden">
				{/* Header */}
				<div className="px-5 pt-5 pb-4">
					<DialogHeader className="gap-1">
						<div className="flex items-center gap-3">
							<div className="w-9 h-9 rounded-lg bg-gradient-to-br from-card to-muted border border-border flex items-center justify-center shrink-0">
								<Chrome className="w-4 h-4 text-foreground/80" />
							</div>
							<div>
								<DialogTitle className="text-base">
									Install Extension
								</DialogTitle>
								<DialogDescription className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">
									Redirect GitHub to Better
									Hub automatically
								</DialogDescription>
							</div>
						</div>
					</DialogHeader>
				</div>

				{/* Download section */}
				<div className="px-5 pb-4">
					<a
						href="/extension/better-hub-chrome.zip"
						download
						onClick={() => setDownloaded(true)}
						className={cn(
							"w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-mono rounded-md transition-all",
							downloaded
								? "bg-[var(--contrib-1)] border border-[var(--contrib-3)]/30 text-[var(--contrib-4)]"
								: "bg-foreground text-background hover:bg-foreground/90",
						)}
					>
						{downloaded ? (
							<>
								<Check className="w-4 h-4" />
								Downloaded
							</>
						) : (
							<>
								<Download className="w-4 h-4" />
								Download for Chrome
							</>
						)}
					</a>
				</div>

				{/* Quick steps */}
				<div className="border-t border-border bg-card/30 px-5 py-4">
					<h3 className="text-[10px] font-mono text-muted-foreground/40 uppercase tracking-widest mb-3">
						Quick Setup
					</h3>
					<ol className="flex flex-col gap-2.5">
						{QUICK_STEPS.map((step, i) => (
							<li
								key={i}
								className="flex items-center gap-3"
							>
								<div className="shrink-0 w-6 h-6 rounded-full border border-border bg-background flex items-center justify-center">
									<span className="text-[9px] font-mono text-muted-foreground/60">
										{i + 1}
									</span>
								</div>
								<div className="flex-1 min-w-0">
									<span className="text-xs font-medium">
										{step.label}
									</span>
									<span className="text-[11px] text-muted-foreground/40 ml-2">
										{step.detail}
									</span>
								</div>
							</li>
						))}
					</ol>
				</div>

				{/* Footer */}
				<div className="border-t border-border px-5 py-3 flex items-center justify-between">
					<p className="text-[10px] text-muted-foreground/30 font-mono">
						Defaults to beta.better-hub.com
					</p>
					<Link
						href="/extension"
						onClick={() => onOpenChange(false)}
						className="inline-flex items-center gap-1 text-[11px] font-mono text-muted-foreground/50 hover:text-foreground transition-colors"
					>
						Full guide
						<ArrowRight className="w-3 h-3" />
					</Link>
				</div>
			</DialogContent>
		</Dialog>
	);
}
