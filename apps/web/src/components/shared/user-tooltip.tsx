"use client";

import { useState } from "react";
import Image from "next/image";
import { useQuery } from "@tanstack/react-query";
import {
	Users,
	BookMarked,
	Building2,
	MapPin,
	Link as LinkIcon,
	Calendar,
	Bot,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { UserProfile } from "@/app/api/user-profile/route";

interface UserTooltipProps {
	username: string;
	children: React.ReactNode;
	side?: "top" | "right" | "bottom" | "left";
	align?: "start" | "center" | "end";
}

async function fetchUserProfile(username: string): Promise<UserProfile> {
	const res = await fetch(`/api/user-profile?username=${encodeURIComponent(username)}`);
	if (!res.ok) {
		throw new Error("Failed to fetch user profile");
	}
	return res.json();
}

function formatNumber(num: number): string {
	if (num >= 1000000) {
		return `${(num / 1000000).toFixed(1)}M`;
	}
	if (num >= 1000) {
		return `${(num / 1000).toFixed(1)}K`;
	}
	return num.toString();
}

function formatJoinDate(dateString: string): string {
	const date = new Date(dateString);
	return date.toLocaleDateString("en-US", {
		month: "short",
		year: "numeric",
	});
}

function UserTooltipSkeleton() {
	return (
		<div className="w-72 animate-pulse">
			<div className="flex items-start gap-3">
				<div className="w-16 h-16 rounded-full bg-muted shrink-0" />
				<div className="flex-1 min-w-0 space-y-2 pt-1">
					<div className="h-4 bg-muted rounded w-28" />
					<div className="h-3 bg-muted rounded w-20" />
				</div>
			</div>
			<div className="mt-3 space-y-2">
				<div className="h-3 bg-muted rounded w-full" />
				<div className="h-3 bg-muted rounded w-3/4" />
			</div>
			<div className="flex gap-4 mt-3 pt-3 border-t border-border/50">
				<div className="h-4 bg-muted rounded w-20" />
				<div className="h-4 bg-muted rounded w-20" />
				<div className="h-4 bg-muted rounded w-16" />
			</div>
		</div>
	);
}

function UserTooltipContent({ profile }: { profile: UserProfile }) {
	const isBot = profile.type === "Bot";
	const isOrg = profile.type === "Organization";

	return (
		<div className="w-72">
			<div className="flex items-start gap-3">
				<div className="relative shrink-0">
					<Image
						src={profile.avatar_url}
						alt={profile.login}
						width={64}
						height={64}
						className={cn(
							"w-16 h-16 ring-2 ring-border/50",
							isOrg ? "rounded-md" : "rounded-full",
						)}
					/>
					{isBot && (
						<div className="absolute -bottom-1 -right-1 bg-muted border border-border rounded-full p-0.5">
							<Bot className="w-3 h-3 text-muted-foreground" />
						</div>
					)}
				</div>
				<div className="flex-1 min-w-0 pt-0.5">
					<div className="font-semibold text-foreground truncate text-sm">
						{profile.name || profile.login}
					</div>
					<a
						href={profile.html_url}
						target="_blank"
						rel="noopener noreferrer"
						className="text-xs text-muted-foreground hover:text-primary hover:underline"
					>
						@{profile.login}
					</a>
					{(isBot || isOrg) && (
						<span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground font-medium">
							{isBot ? "Bot" : "Organization"}
						</span>
					)}
				</div>
			</div>

			{profile.bio && (
				<p className="text-xs text-muted-foreground mt-3 line-clamp-2 leading-relaxed">
					{profile.bio}
				</p>
			)}

			{(profile.company ||
				profile.location ||
				profile.blog ||
				profile.twitter_username) && (
				<div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 mt-3 text-xs text-muted-foreground">
					{profile.company && (
						<span className="flex items-center gap-1">
							<Building2 className="w-3 h-3 shrink-0 opacity-60" />
							<span className="truncate max-w-[120px]">
								{profile.company.replace(/^@/, "")}
							</span>
						</span>
					)}
					{profile.location && (
						<span className="flex items-center gap-1">
							<MapPin className="w-3 h-3 shrink-0 opacity-60" />
							<span className="truncate max-w-[120px]">
								{profile.location}
							</span>
						</span>
					)}
					{profile.blog && (
						<a
							href={
								profile.blog.startsWith("http")
									? profile.blog
									: `https://${profile.blog}`
							}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 hover:text-primary"
							onClick={(e) => e.stopPropagation()}
						>
							<LinkIcon className="w-3 h-3 shrink-0 opacity-60" />
							<span className="truncate max-w-[100px]">
								{profile.blog
									.replace(/^https?:\/\//, "")
									.replace(/\/$/, "")}
							</span>
						</a>
					)}
					{profile.twitter_username && (
						<a
							href={`https://twitter.com/${profile.twitter_username}`}
							target="_blank"
							rel="noopener noreferrer"
							className="flex items-center gap-1 hover:text-primary"
							onClick={(e) => e.stopPropagation()}
						>
							<svg
								viewBox="0 0 24 24"
								className="w-3 h-3 shrink-0 opacity-60 fill-current"
							>
								<path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
							</svg>
							<span>@{profile.twitter_username}</span>
						</a>
					)}
				</div>
			)}

			<div className="flex items-center gap-4 mt-3 pt-3 border-t border-border/50 text-xs">
				<span className="flex items-center gap-1.5 text-muted-foreground">
					<Users className="w-3.5 h-3.5 opacity-60" />
					<span className="font-semibold text-foreground">
						{formatNumber(profile.followers)}
					</span>
					<span>followers</span>
				</span>
				<span className="flex items-center gap-1.5 text-muted-foreground">
					<span className="font-semibold text-foreground">
						{formatNumber(profile.following)}
					</span>
					<span>following</span>
				</span>
				<span className="flex items-center gap-1.5 text-muted-foreground">
					<BookMarked className="w-3.5 h-3.5 opacity-60" />
					<span className="font-semibold text-foreground">
						{formatNumber(profile.public_repos)}
					</span>
				</span>
			</div>

			{profile.created_at && (
				<div className="flex items-center gap-1.5 mt-2 text-[10px] text-muted-foreground/70">
					<Calendar className="w-3 h-3 opacity-60" />
					<span>Joined {formatJoinDate(profile.created_at)}</span>
				</div>
			)}
		</div>
	);
}

export function UserTooltip({
	username,
	children,
	side = "top",
	align = "center",
}: UserTooltipProps) {
	const [isHovered, setIsHovered] = useState(false);

	const {
		data: profile,
		isLoading,
		isError,
	} = useQuery({
		queryKey: ["user-profile", username],
		queryFn: () => fetchUserProfile(username),
		enabled: isHovered,
		staleTime: 5 * 60 * 1000,
		gcTime: 10 * 60 * 1000,
	});

	return (
		<Tooltip
			onOpenChange={(open) => {
				if (open) setIsHovered(true);
			}}
		>
			<TooltipTrigger asChild>{children}</TooltipTrigger>
			<TooltipContent
				side={side}
				align={align}
				className={cn("p-4", isError && "p-3")}
			>
				{isLoading && <UserTooltipSkeleton />}
				{isError && (
					<span className="text-xs text-destructive">
						Failed to load user
					</span>
				)}
				{profile && <UserTooltipContent profile={profile} />}
			</TooltipContent>
		</Tooltip>
	);
}
