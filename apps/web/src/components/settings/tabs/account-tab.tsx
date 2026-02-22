"use client";

import { useState } from "react";
import { LogOut, Trash2, Github, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";
import type { UserSettings } from "@/lib/user-settings-store";

interface AccountTabProps {
	user: {
		name: string;
		email: string;
		image: string | null;
	};
	settings: UserSettings;
	onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
}

export function AccountTab({ user, settings, onUpdate }: AccountTabProps) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	async function handleDeleteAccount() {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		await signOut();
		window.location.href = "/";
	}

	return (
		<div className="divide-y divide-border">
			{/* Profile */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Profile
				</label>
				<div className="flex items-center gap-3 mt-2">
					{user.image && (
						<img
							src={user.image}
							alt={user.name}
							className="w-8 h-8 rounded-full"
						/>
					)}
					<div>
						<p className="text-xs font-mono font-medium">
							{user.name}
						</p>
						<p className="text-[10px] font-mono text-muted-foreground/50">
							{user.email}
						</p>
					</div>
				</div>
				<p className="mt-2 text-[10px] text-muted-foreground/50 font-mono">
					Profile info is synced from GitHub.
				</p>
			</div>

			{/* Connected Accounts */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Connected Accounts
				</label>
				<div className="mt-2 space-y-1">
					{/* GitHub */}
					<div className="flex items-center justify-between py-2">
						<div className="flex items-center gap-2">
							<Github className="w-3.5 h-3.5 text-muted-foreground" />
							<span className="text-xs font-mono">
								GitHub
							</span>
							<span className="text-[10px] font-mono text-muted-foreground/40">
								connected
							</span>
						</div>
						<span className="text-[10px] font-mono text-muted-foreground/40 bg-muted/50 dark:bg-white/[0.04] px-1.5 py-0.5">
							primary
						</span>
					</div>
				</div>
			</div>

			{/* GitHub Accounts */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					GitHub Accounts
				</label>
				<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
					Add extra GitHub accounts via PAT and switch between them.
				</p>
				<div className="mt-2 flex items-center gap-2">
					<Users className="w-3.5 h-3.5 text-muted-foreground" />
					<span className="text-[10px] font-mono text-muted-foreground/50">
						Use the command menu (
						<kbd className="border border-border/60 px-1 py-0.5 rounded-sm text-[9px] font-mono">
							&#x2318;K
						</kbd>{" "}
						&rarr; Switch Account) to manage accounts.
					</span>
				</div>
			</div>

			{/* Sign Out */}
			<div className="px-4 py-4">
				<button
					onClick={() => {
						signOut();
						window.location.href = "/";
					}}
					className="flex items-center gap-1.5 border border-border px-3 py-1.5 text-xs font-mono text-muted-foreground hover:text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer"
				>
					<LogOut className="w-3 h-3" />
					Sign out
				</button>
			</div>

			{/* Danger Zone */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-destructive/70">
					Danger Zone
				</label>
				<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
					Deletes local data and signs you out. Your GitHub account is
					unaffected.
				</p>
				<div className="flex items-center gap-2 mt-2">
					<button
						onClick={handleDeleteAccount}
						className={cn(
							"flex items-center gap-1.5 border px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer",
							confirmDelete
								? "border-destructive bg-destructive text-white hover:bg-destructive/90"
								: "border-destructive/30 text-destructive/70 hover:text-destructive hover:bg-destructive/5",
						)}
					>
						<Trash2 className="w-3 h-3" />
						{confirmDelete
							? "Confirm deletion"
							: "Delete account data"}
					</button>
					{confirmDelete && (
						<button
							onClick={() => setConfirmDelete(false)}
							className="text-[10px] font-mono text-muted-foreground underline cursor-pointer"
						>
							cancel
						</button>
					)}
				</div>
			</div>
		</div>
	);
}
