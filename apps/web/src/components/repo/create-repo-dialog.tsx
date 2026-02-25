"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Lock, Globe, Plus } from "lucide-react";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { createRepo } from "@/app/(app)/repos/actions";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

const GITIGNORE_OPTIONS = [
	"",
	"Node",
	"Python",
	"Java",
	"Go",
	"Rust",
	"Ruby",
	"C",
	"C++",
	"Swift",
	"Kotlin",
	"Dart",
	"Haskell",
	"Elixir",
	"Scala",
	"VisualStudio",
	"JetBrains",
	"macOS",
	"Windows",
	"Linux",
];

const LICENSE_OPTIONS = [
	{ value: "", label: "None" },
	{ value: "mit", label: "MIT License" },
	{ value: "apache-2.0", label: "Apache License 2.0" },
	{ value: "gpl-3.0", label: "GNU GPLv3" },
	{ value: "bsd-2-clause", label: "BSD 2-Clause" },
	{ value: "bsd-3-clause", label: "BSD 3-Clause" },
	{ value: "mpl-2.0", label: "Mozilla Public License 2.0" },
	{ value: "unlicense", label: "The Unlicense" },
];

export function CreateRepoDialog({ org }: { org?: string } = {}) {
	const router = useRouter();
	const { emit } = useMutationEvents();

	const [open, setOpen] = useState(false);
	const [name, setName] = useState("");
	const [description, setDescription] = useState("");
	const [isPrivate, setIsPrivate] = useState(false);
	const [autoInit, setAutoInit] = useState(true);
	const [gitignoreTemplate, setGitignoreTemplate] = useState("");
	const [licenseTemplate, setLicenseTemplate] = useState("");
	const [error, setError] = useState<string | null>(null);
	const [isPending, startTransition] = useTransition();

	function reset() {
		setName("");
		setDescription("");
		setIsPrivate(false);
		setAutoInit(true);
		setGitignoreTemplate("");
		setLicenseTemplate("");
		setError(null);
	}

	function handleSubmit(e: React.FormEvent) {
		e.preventDefault();
		if (!name.trim() || isPending) return;

		startTransition(async () => {
			const result = await createRepo(
				name.trim(),
				description.trim(),
				isPrivate,
				autoInit,
				gitignoreTemplate,
				licenseTemplate,
				org,
			);

			if (result.success && result.full_name) {
				const [repoOwner, repoName] = result.full_name.split("/");
				emit({ type: "repo:created", owner: repoOwner, repo: repoName });
				setOpen(false);
				reset();
				router.push(`/${result.full_name}`);
			} else {
				setError(result.error || "Failed to create repository");
			}
		});
	}

	return (
		<Dialog
			open={open}
			onOpenChange={(v) => {
				setOpen(v);
				if (!v) reset();
			}}
		>
			<button
				onClick={() => setOpen(true)}
				className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-mono hover:bg-accent transition-colors cursor-pointer"
			>
				<Plus className="w-3 h-3" />
				New
			</button>

			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle className="text-sm font-mono">
						Create a new repository{org ? ` in ${org}` : ""}
					</DialogTitle>
					<DialogDescription className="text-xs text-muted-foreground">
						A repository contains all project files, including
						the revision history.
					</DialogDescription>
				</DialogHeader>

				<form onSubmit={handleSubmit} className="space-y-4">
					{/* Name */}
					<div>
						<label className="block text-[11px] font-mono text-muted-foreground mb-1">
							Repository name *
						</label>
						<input
							type="text"
							value={name}
							onChange={(e) => {
								setName(e.target.value);
								setError(null);
							}}
							placeholder="my-awesome-project"
							className="w-full px-3 py-1.5 text-sm bg-background border border-border focus:border-foreground/30 focus:outline-none font-mono placeholder:text-muted-foreground"
							autoFocus
							required
						/>
					</div>

					{/* Description */}
					<div>
						<label className="block text-[11px] font-mono text-muted-foreground mb-1">
							Description
						</label>
						<input
							type="text"
							value={description}
							onChange={(e) =>
								setDescription(e.target.value)
							}
							placeholder="Short description (optional)"
							className="w-full px-3 py-1.5 text-sm bg-background border border-border focus:border-foreground/30 focus:outline-none font-mono placeholder:text-muted-foreground"
						/>
					</div>

					{/* Visibility */}
					<div>
						<label className="block text-[11px] font-mono text-muted-foreground mb-1.5">
							Visibility
						</label>
						<div className="flex gap-0">
							<button
								type="button"
								onClick={() => setIsPrivate(false)}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border transition-colors cursor-pointer",
									!isPrivate
										? "bg-foreground text-background border-foreground"
										: "border-border text-muted-foreground hover:text-foreground",
								)}
							>
								<Globe className="w-3 h-3" />
								Public
							</button>
							<button
								type="button"
								onClick={() => setIsPrivate(true)}
								className={cn(
									"flex items-center gap-1.5 px-3 py-1.5 text-xs font-mono border border-l-0 transition-colors cursor-pointer",
									isPrivate
										? "bg-foreground text-background border-foreground"
										: "border-border text-muted-foreground hover:text-foreground",
								)}
							>
								<Lock className="w-3 h-3" />
								Private
							</button>
						</div>
					</div>

					{/* Initialize with README */}
					<label className="flex items-center gap-2 cursor-pointer">
						<input
							type="checkbox"
							checked={autoInit}
							onChange={(e) =>
								setAutoInit(e.target.checked)
							}
							className="accent-foreground"
						/>
						<span className="text-xs font-mono text-muted-foreground">
							Initialize with a README
						</span>
					</label>

					{/* .gitignore */}
					<div>
						<label className="block text-[11px] font-mono text-muted-foreground mb-1">
							.gitignore template
						</label>
						<select
							value={gitignoreTemplate}
							onChange={(e) =>
								setGitignoreTemplate(e.target.value)
							}
							className="w-full px-3 py-1.5 text-sm bg-background border border-border focus:border-foreground/30 focus:outline-none font-mono text-foreground"
						>
							<option value="">None</option>
							{GITIGNORE_OPTIONS.filter(Boolean).map(
								(t) => (
									<option key={t} value={t}>
										{t}
									</option>
								),
							)}
						</select>
					</div>

					{/* License */}
					<div>
						<label className="block text-[11px] font-mono text-muted-foreground mb-1">
							License
						</label>
						<select
							value={licenseTemplate}
							onChange={(e) =>
								setLicenseTemplate(e.target.value)
							}
							className="w-full px-3 py-1.5 text-sm bg-background border border-border focus:border-foreground/30 focus:outline-none font-mono text-foreground"
						>
							{LICENSE_OPTIONS.map((l) => (
								<option
									key={l.value}
									value={l.value}
								>
									{l.label}
								</option>
							))}
						</select>
					</div>

					{/* Error */}
					{error && (
						<p className="text-xs text-destructive font-mono">
							{error}
						</p>
					)}

					{/* Submit */}
					<button
						type="submit"
						disabled={!name.trim() || isPending}
						className={cn(
							"w-full flex items-center justify-center gap-2 px-4 py-2 text-xs font-mono border transition-colors cursor-pointer",
							name.trim() && !isPending
								? "bg-foreground text-background border-foreground hover:bg-foreground/90"
								: "bg-muted text-muted-foreground border-border cursor-not-allowed",
						)}
					>
						{isPending ? (
							<>
								<Loader2 className="w-3 h-3 animate-spin" />
								Creating…
							</>
						) : (
							"Create repository"
						)}
					</button>
				</form>
			</DialogContent>
		</Dialog>
	);
}
