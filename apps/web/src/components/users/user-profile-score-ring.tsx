"use client";

import { useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProfileScoreResult } from "@/lib/user-profile-score";

function scoreColor(total: number): string {
	if (total >= 80) return "text-emerald-400";
	if (total >= 60) return "text-green-400";
	if (total >= 35) return "text-amber-400";
	return "text-muted-foreground/50";
}

function scoreRingColor(total: number): string {
	if (total >= 80) return "stroke-emerald-400";
	if (total >= 60) return "stroke-green-400";
	if (total >= 35) return "stroke-amber-400";
	return "stroke-muted-foreground/30";
}

function scoreLabel(total: number): string {
	if (total >= 80) return "Exceptional";
	if (total >= 60) return "Strong";
	if (total >= 35) return "Growing";
	return "Getting started";
}

function scoreDescription(total: number): string {
	if (total >= 80)
		return "A highly established developer with strong community presence and significant open-source contributions.";
	if (total >= 60)
		return "An active developer with solid contributions and good community standing.";
	if (total >= 35)
		return "A developing presence on GitHub with growing contributions and engagement.";
	return "A newer GitHub user building their profile and contribution history.";
}

const CATEGORIES = [
	{
		key: "communityPresence" as const,
		label: "Community",
		max: 25,
		color: "bg-emerald-400/70",
	},
	{ key: "ossImpact" as const, label: "OSS Impact", max: 25, color: "bg-blue-400/70" },
	{ key: "activity" as const, label: "Activity", max: 30, color: "bg-green-400/70" },
	{ key: "ecosystem" as const, label: "Ecosystem", max: 20, color: "bg-amber-400/70" },
];

export function UserProfileScoreRing({ score }: { score: ProfileScoreResult }) {
	const radius = 20;
	const circumference = 2 * Math.PI * radius;
	const progress = (score.total / 100) * circumference;
	const triggerRef = useRef<HTMLDivElement>(null);
	const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);

	const handleMouseEnter = useCallback(() => {
		if (triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			setTooltipPos({
				top: rect.bottom + 8,
				left: rect.left + rect.width / 2,
			});
		}
	}, []);

	const animateIn = useCallback((el: HTMLDivElement | null) => {
		el?.animate(
			[
				{ opacity: 0, transform: "translateX(-50%) translateY(4px)" },
				{ opacity: 1, transform: "translateX(-50%) translateY(0)" },
			],
			{ duration: 150, easing: "ease-out", fill: "forwards" },
		);
	}, []);

	return (
		<div
			ref={triggerRef}
			className="flex items-center gap-3 cursor-default"
			onMouseEnter={handleMouseEnter}
			onMouseLeave={() => setTooltipPos(null)}
		>
			<div className="relative w-12 h-12 flex items-center justify-center shrink-0">
				<svg className="w-12 h-12 -rotate-90" viewBox="0 0 48 48">
					<circle
						cx="24"
						cy="24"
						r={radius}
						fill="none"
						strokeWidth="2.5"
						className="stroke-muted/40"
					/>
					<circle
						cx="24"
						cy="24"
						r={radius}
						fill="none"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeDasharray={circumference}
						strokeDashoffset={circumference - progress}
						className={cn(
							"transition-all duration-500",
							scoreRingColor(score.total),
						)}
					/>
				</svg>
				<span
					className={cn(
						"absolute inset-0 flex items-center justify-center text-xs font-semibold font-mono",
						scoreColor(score.total),
					)}
				>
					{score.total}
				</span>
			</div>

			<div className="min-w-0">
				<div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
					Profile Score
				</div>
				<div
					className={cn(
						"text-[11px] font-medium",
						scoreColor(score.total),
					)}
				>
					{scoreLabel(score.total)}
				</div>
			</div>

			{tooltipPos &&
				createPortal(
					<div
						ref={animateIn}
						className="fixed z-[9999] w-56 px-3 py-2.5 rounded-lg border border-border/60 shadow-xl text-left pointer-events-none"
						style={{
							top: tooltipPos.top,
							left: tooltipPos.left,
							opacity: 0,
							backgroundColor: "var(--card)",
						}}
					>
						<div
							className="absolute bottom-full left-1/2 -translate-x-1/2 w-2 h-2 rotate-45 border-l border-t border-border/60 mb-[-5px]"
							style={{ backgroundColor: "var(--card)" }}
						/>
						<div className="flex items-center gap-1.5 mb-1.5">
							<ShieldCheck className="w-3 h-3 text-muted-foreground" />
							<span
								className={cn(
									"text-[11px] font-semibold",
									scoreColor(score.total),
								)}
							>
								{scoreLabel(score.total)}
							</span>
						</div>
						<p className="text-[10px] leading-relaxed text-muted-foreground">
							{scoreDescription(score.total)}
						</p>
						{/* Category bar */}
						<div className="mt-2 flex gap-0.5 h-1 rounded-full overflow-hidden">
							{CATEGORIES.map((cat) => (
								<div
									key={cat.key}
									className={cn(
										"rounded-full",
										cat.color,
									)}
									style={{
										width: `${(score[cat.key] / 100) * 100}%`,
									}}
									title={cat.label}
								/>
							))}
						</div>
						{/* Category breakdown */}
						<div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1">
							{CATEGORIES.map((cat) => (
								<div
									key={cat.key}
									className="flex items-center justify-between text-[10px] font-mono"
								>
									<span className="text-muted-foreground/60">
										{cat.label}
									</span>
									<span className="text-muted-foreground">
										{score[cat.key]}/
										{cat.max}
									</span>
								</div>
							))}
						</div>
					</div>,
					document.body,
				)}
		</div>
	);
}
