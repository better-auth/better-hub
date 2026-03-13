"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";
import { GITHUB_WEB_URL } from "@/lib/github-config";

interface CopyLinkButtonProps {
	owner: string;
	repo: string;
	number: number;
	type: "issues" | "pulls";
	iconOnly?: boolean;
}

export function CopyLinkButton({ owner, repo, number, type, iconOnly }: CopyLinkButtonProps) {
	const [copied, setCopied] = useState(false);

	function handleCopy(e: React.MouseEvent) {
		e.preventDefault();
		e.stopPropagation();
		const githubType = type === "pulls" ? "pull" : "issues";
		navigator.clipboard.writeText(
			`${GITHUB_WEB_URL}/${owner}/${repo}/${githubType}/${number}`,
		);
		setCopied(true);
		setTimeout(() => setCopied(false), 1200);
	}

	if (iconOnly) {
		return (
			<button
				onClick={handleCopy}
				className="p-1 text-foreground/15 hover:text-foreground/60 opacity-0 group-hover:opacity-100 transition-all cursor-pointer shrink-0"
				title="Copy GitHub link"
			>
				{copied ? (
					<Check className="w-3.5 h-3.5 text-success" />
				) : (
					<Copy className="w-3.5 h-3.5" />
				)}
			</button>
		);
	}

	return (
		<button
			onClick={handleCopy}
			className="inline-flex items-center gap-1 text-[11px] text-muted-foreground/50 hover:text-foreground transition-colors cursor-pointer shrink-0"
		>
			{copied ? (
				<>
					<Check className="w-3 h-3 text-success" />
					Copied
				</>
			) : (
				"Copy link"
			)}
		</button>
	);
}
