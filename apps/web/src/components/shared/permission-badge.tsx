"use client";

import { Tooltip, TooltipContent, TooltipPortal, TooltipTrigger } from "@/components/ui/tooltip";
import type { ScopeGroup } from "@/lib/github-scopes";
import { cn } from "@/lib/utils";
import { Check, Info, Lock } from "lucide-react";

interface PermissionBadgeProps {
	group: ScopeGroup;
	isSelected: boolean;
	isGranted?: boolean;
	onToggle: (id: string) => void;
}

export function PermissionBadge({ group, isSelected, isGranted, onToggle }: PermissionBadgeProps) {
	return (
		<span
			className={cn(
				"inline-flex items-stretch rounded-full border text-[12px] transition-colors",
				isSelected
					? "border-foreground/30 bg-foreground/10 text-foreground"
					: "border-foreground/10 text-foreground/40",
			)}
		>
			<button
				type="button"
				onClick={() => onToggle(group.id)}
				disabled={group.required}
				className={cn(
					"inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 transition-colors",
					!isSelected && "line-through decoration-foreground/20",
					group.required
						? "cursor-default"
						: "cursor-pointer hover:text-foreground/70",
				)}
			>
				{isSelected &&
					(group.required ? (
						<Lock className="w-2.5 h-2.5 shrink-0" />
					) : (
						<Check className="w-2.5 h-2.5 shrink-0" />
					))}
				{group.label}
				{isGranted && isSelected && (
					<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
				)}
			</button>
			<Tooltip>
				<TooltipTrigger asChild>
					<span
						className={cn(
							"inline-flex items-center pr-2 pl-1 border-l transition-colors cursor-help",
							isSelected
								? "border-foreground/15 text-foreground/30 hover:text-foreground/60"
								: "border-foreground/10 text-foreground/20 hover:text-foreground/50",
						)}
					>
						<Info className="w-3 h-3" />
					</span>
				</TooltipTrigger>
				<TooltipPortal>
					<TooltipContent side="top" className="max-w-xs">
						<p className="text-[11px]">{group.reason}</p>
					</TooltipContent>
				</TooltipPortal>
			</Tooltip>
		</span>
	);
}
