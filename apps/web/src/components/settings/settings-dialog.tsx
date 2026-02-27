"use client";

import { useCallback, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import * as VisuallyHidden from "@radix-ui/react-visually-hidden";
import { SettingsContent } from "./settings-content";
import type { UserSettings } from "@/lib/user-settings-store";

export interface GitHubProfile {
	login: string;
	avatar_url: string;
	bio: string | null;
	company: string | null;
	location: string | null;
	blog: string | null;
	twitter_username: string | null;
	public_repos: number;
	followers: number;
	following: number;
	created_at: string;
}

interface SettingsDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	user: { name: string; email: string; image: string | null };
	githubProfile: GitHubProfile;
}

async function fetchUserSettings(): Promise<UserSettings> {
	const response = await fetch("/api/user-settings");
	if (!response.ok) {
		throw new Error("Failed to fetch user settings");
	}
	const data: unknown = await response.json();
	if (!data || typeof data !== "object") {
		throw new Error("Invalid settings response");
	}
	return data as UserSettings;
}

export function SettingsDialog({ open, onOpenChange, user, githubProfile }: SettingsDialogProps) {
	const {
		data: settings,
		isPending,
		isError,
		refetch,
	} = useQuery({
		queryKey: ["user-settings"],
		queryFn: fetchUserSettings,
		enabled: open,
		staleTime: 5 * 60 * 1000,
		gcTime: 15 * 60 * 1000,
	});

	const [isThemeTransitioning, setIsThemeTransitioning] = useState(false);
	const transitionTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

	const onThemeTransition = useCallback(() => {
		if (transitionTimeoutRef.current) {
			clearTimeout(transitionTimeoutRef.current);
		}
		setIsThemeTransitioning(true);
		transitionTimeoutRef.current = setTimeout(() => {
			setIsThemeTransitioning(false);
		}, 1000);
	}, []);

	const handleInteractOutside = useCallback(
		(e: Event) => {
			if (isThemeTransitioning) {
				e.preventDefault();
			}
		},
		[isThemeTransitioning],
	);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[85vh] outline-none"
				showCloseButton={false}
				onPointerDownOutside={handleInteractOutside}
				onInteractOutside={handleInteractOutside}
			>
				<VisuallyHidden.Root>
					<DialogTitle>Settings</DialogTitle>
				</VisuallyHidden.Root>
				<div className="flex flex-col max-h-[85vh] min-h-[26rem]">
					{settings && !isError ? (
						<SettingsContent
							initialSettings={settings}
							user={user}
							githubProfile={githubProfile}
							onThemeTransition={onThemeTransition}
						/>
					) : (
						<div className="flex-1 flex items-center justify-center px-6">
							{isError ? (
								<div className="text-center space-y-3">
									<p className="text-xs font-mono text-muted-foreground">
										Failed to load
										settings.
									</p>
									<button
										type="button"
										onClick={() =>
											void refetch()
										}
										className="border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
									>
										Retry
									</button>
								</div>
							) : (
								<p className="text-xs font-mono text-muted-foreground">
									{isPending
										? "Loading settings..."
										: "Preparing settings..."}
								</p>
							)}
						</div>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
