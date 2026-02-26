"use client";

import { useState, useRef, useTransition, useEffect } from "react";
import { Pencil, Check, X, Loader2 } from "lucide-react";
import { renamePullRequest } from "@/app/(app)/repos/[owner]/[repo]/pulls/pr-actions";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";

interface EditablePRTitleProps {
	title: string;
	number: number;
	owner: string;
	repo: string;
	canEdit: boolean;
}

export function EditablePRTitle({ title, number, owner, repo, canEdit }: EditablePRTitleProps) {
	const [editing, setEditing] = useState(false);
	const [value, setValue] = useState(title);
	const [isPending, startTransition] = useTransition();
	const inputRef = useRef<HTMLInputElement>(null);
	const router = useRouter();
	const { emit } = useMutationEvents();

	useEffect(() => {
		if (editing) {
			inputRef.current?.focus();
			inputRef.current?.select();
		}
	}, [editing]);

	// Track the optimistic title so we can show it immediately after save
	const [optimisticTitle, setOptimisticTitle] = useState(title);

	// Sync if the server prop changes (e.g. after router.refresh)
	useEffect(() => {
		setOptimisticTitle(title);
	}, [title]);

	const save = () => {
		const trimmed = value.trim();
		if (!trimmed || trimmed === title) {
			setValue(optimisticTitle);
			setEditing(false);
			return;
		}
		// Show the new title immediately
		setOptimisticTitle(trimmed);
		setEditing(false);
		startTransition(async () => {
			const res = await renamePullRequest(owner, repo, number, trimmed);
			if (res.error) {
				// Revert on failure
				setOptimisticTitle(title);
				setValue(title);
			} else {
				emit({ type: "pr:renamed", owner, repo, number });
			}
			router.refresh();
		});
	};

	const cancel = () => {
		setValue(optimisticTitle);
		setEditing(false);
	};

	if (!canEdit) {
		return (
			<h1 className="text-base font-medium tracking-tight leading-snug flex-1 min-w-0">
				{optimisticTitle}{" "}
				<span className="text-muted-foreground/50 font-normal">
					#{number}
				</span>
			</h1>
		);
	}

	if (editing) {
		return (
			<div className="flex items-center gap-1.5 flex-1 min-w-0">
				<input
					ref={inputRef}
					value={value}
					onChange={(e) => setValue(e.target.value)}
					onKeyDown={(e) => {
						if (e.key === "Enter") save();
						if (e.key === "Escape") cancel();
					}}
					disabled={isPending}
					className={cn(
						"flex-1 min-w-0 text-base font-medium tracking-tight leading-snug",
						"bg-transparent border border-border/60 rounded-md px-2 py-0.5",
						"focus:outline-none focus:border-foreground/20",
						isPending && "opacity-50",
					)}
				/>
				<span className="text-muted-foreground/50 font-normal text-base shrink-0">
					#{number}
				</span>
				{isPending ? (
					<Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground/50 shrink-0" />
				) : (
					<>
						<button
							type="button"
							onClick={save}
							className="p-0.5 rounded hover:bg-success/10 text-success transition-colors cursor-pointer"
							title="Save"
						>
							<Check className="w-3.5 h-3.5" />
						</button>
						<button
							type="button"
							onClick={cancel}
							className="p-0.5 rounded hover:bg-destructive/10 text-destructive transition-colors cursor-pointer"
							title="Cancel"
						>
							<X className="w-3.5 h-3.5" />
						</button>
					</>
				)}
			</div>
		);
	}

	return (
		<h1 className="text-base font-medium tracking-tight leading-snug flex-1 min-w-0 group/title">
			{optimisticTitle}{" "}
			<span className="text-muted-foreground/50 font-normal">#{number}</span>
			<button
				type="button"
				onClick={() => setEditing(true)}
				className="inline-flex ml-1.5 p-0.5 rounded opacity-0 group-hover/title:opacity-100 hover:bg-muted/50 text-muted-foreground hover:text-muted-foreground transition-all cursor-pointer align-middle"
				title="Edit title"
			>
				<Pencil className="w-3 h-3" />
			</button>
		</h1>
	);
}
