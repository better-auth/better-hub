"use client";

import { useEffect, useState } from "react";
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

export function SettingsDialog({ open, onOpenChange, user, githubProfile }: SettingsDialogProps) {
	const [settings, setSettings] = useState<UserSettings | null>(null);

	useEffect(() => {
		if (!open) return;
		if (settings) return;
		fetch("/api/user-settings")
			.then((res) => res.json())
			.then((data) => setSettings(data));
	}, [open, settings]);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent
				className="sm:max-w-2xl p-0 gap-0 overflow-hidden max-h-[85vh] outline-none"
				showCloseButton={false}
			>
				<VisuallyHidden.Root>
					<DialogTitle>Settings</DialogTitle>
				</VisuallyHidden.Root>
				<div className="flex flex-col max-h-[85vh]">
					{settings && (
						<SettingsContent
							initialSettings={settings}
							user={user}
							githubProfile={githubProfile}
						/>
					)}
				</div>
			</DialogContent>
		</Dialog>
	);
}
