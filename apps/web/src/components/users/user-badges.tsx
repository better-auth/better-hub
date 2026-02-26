"use client";

import { Award, Code2, Heart, Shield, Star, Zap, type LucideIcon } from "lucide-react";

export interface UserBadge {
	name: string;
	description: string;
	icon: string;
}

interface BadgeInfo {
	name: string;
	description: string;
	icon: LucideIcon;
	color: string;
}

const BADGE_MAP: Record<string, BadgeInfo> = {
	"Developer Program Member": {
		name: "Developer Program Member",
		description: "Member of the GitHub Developer Program",
		icon: Code2,
		color: "#7c3aed", // violet
	},
	Pro: {
		name: "Pro",
		description: "GitHub Pro subscriber",
		icon: Star,
		color: "#f59e0b", // amber
	},
	"Campus Expert": {
		name: "Campus Expert",
		description: "GitHub Campus Expert",
		icon: Zap,
		color: "#10b981", // emerald
	},
	"Security Researcher": {
		name: "Security Researcher",
		description: "GitHub Security Researcher",
		icon: Shield,
		color: "#ef4444", // red
	},
	Sponsor: {
		name: "Sponsor",
		description: "GitHub Sponsor",
		icon: Heart,
		color: "#ec4899", // pink
	},
	"Arctic Code Vault Contributor": {
		name: "Arctic Code Vault",
		description: "Arctic Code Vault Contributor",
		icon: Award,
		color: "#06b6d4", // cyan
	},
	"GitHub Star": {
		name: "GitHub Star",
		description: "GitHub Stars Program Member",
		icon: Star,
		color: "#f59e0b", // amber
	},
	"Community Sponsor": {
		name: "Community Sponsor",
		description: "Community Sponsor",
		icon: Heart,
		color: "#a855f7", // purple
	},
	Expert: {
		name: "Expert",
		description: "GitHub Expert",
		icon: Award,
		color: "#3b82f6", // blue
	},
};

export interface UserBadgesProps {
	badges: UserBadge[];
}

export function UserBadges({ badges }: UserBadgesProps) {
	if (!badges || badges.length === 0) return null;

	return (
		<div className="flex flex-wrap gap-1.5">
			{badges.map((badge, index) => {
				const badgeInfo = BADGE_MAP[badge.name] || {
					name: badge.name,
					description: badge.description,
					icon: Award,
					color: "#6b7280",
				};
				const Icon = badgeInfo.icon;

				return (
					<span
						key={`${badge.name}-${index}`}
						title={badgeInfo.description}
						className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium border border-border rounded-full hover:bg-muted/50 transition-colors cursor-help"
						style={{
							color: badgeInfo.color,
							borderColor: `${badgeInfo.color}33`,
							backgroundColor: `${badgeInfo.color}0d`,
						}}
					>
						<Icon className="w-2.5 h-2.5" />
						{badgeInfo.name}
					</span>
				);
			})}
		</div>
	);
}
