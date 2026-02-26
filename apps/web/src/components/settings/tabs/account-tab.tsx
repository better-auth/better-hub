"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
	LogOut,
	Trash2,
	Github,
	Users,
	Shield,
	Check,
	Lock,
	Info,
	ExternalLink,
	MapPin,
	Building2,
	Link as LinkIcon,
	Calendar,
} from "lucide-react";
import { formatForDisplay } from "@tanstack/react-hotkeys";
import { cn } from "@/lib/utils";
import { signIn, signOut } from "@/lib/auth-client";
import { SCOPE_GROUPS, scopesToGroupIds } from "@/lib/github-scopes";
import type { UserSettings } from "@/lib/user-settings-store";
import type { GitHubProfile } from "../settings-dialog";

interface AccountTabProps {
	user: {
		name: string;
		email: string;
		image: string | null;
	};
	settings: UserSettings;
	onUpdate: (updates: Partial<UserSettings>) => Promise<void>;
	githubProfile: GitHubProfile;
}

function InfoPopover({ text, children }: { text: string; children: React.ReactNode }) {
	const [open, setOpen] = useState(false);
	const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

	const show = useCallback(() => {
		clearTimeout(timeout.current);
		setOpen(true);
	}, []);

	const hide = useCallback(() => {
		timeout.current = setTimeout(() => setOpen(false), 150);
	}, []);

	useEffect(() => () => clearTimeout(timeout.current), []);

	return (
		<div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
			{children}
			{open && (
				<div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-md bg-foreground text-background text-[11px] leading-relaxed shadow-lg z-50 pointer-events-none">
					{text}
					<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-foreground" />
				</div>
			)}
		</div>
	);
}

function formatCount(n: number): string {
	if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}m`;
	if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
	return n.toString();
}

function formatJoinDate(dateStr: string): string {
	if (!dateStr) return "";
	const d = new Date(dateStr);
	return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

export function AccountTab({ user, settings, onUpdate, githubProfile }: AccountTabProps) {
	const [confirmDelete, setConfirmDelete] = useState(false);
	const [grantedGroupIds, setGrantedGroupIds] = useState<Set<string>>(new Set());
	const [selected, setSelected] = useState<Set<string>>(new Set());
	const [scopesLoading, setScopesLoading] = useState(true);
	const [updating, setUpdating] = useState(false);

	useEffect(() => {
		fetch("/api/user-scopes")
			.then((res) => res.json())
			.then((data: { scopes: string[] }) => {
				const ids = scopesToGroupIds(data.scopes);
				setGrantedGroupIds(ids);
				setSelected(new Set(ids));
			})
			.finally(() => setScopesLoading(false));
	}, []);

	function toggle(id: string) {
		const group = SCOPE_GROUPS.find((g) => g.id === id);
		if (group?.required) return;
		setSelected((prev) => {
			const next = new Set(prev);
			if (next.has(id)) next.delete(id);
			else next.add(id);
			return next;
		});
	}

	const hasChanges = (() => {
		for (const id of selected) {
			if (!grantedGroupIds.has(id)) return true;
		}
		for (const id of grantedGroupIds) {
			if (!selected.has(id)) return true;
		}
		return false;
	})();

	function handleUpdatePermissions() {
		setUpdating(true);
		const scopes: string[] = [];
		for (const g of SCOPE_GROUPS) {
			if (selected.has(g.id)) scopes.push(...g.scopes);
		}
		signIn.social({
			provider: "github",
			callbackURL: "/dashboard",
			scopes,
		});
	}

	async function handleDeleteAccount() {
		if (!confirmDelete) {
			setConfirmDelete(true);
			return;
		}
		await signOut();
		window.location.href = "/";
	}

	const stats = [
		{ label: "repos", value: githubProfile.public_repos },
		{ label: "followers", value: githubProfile.followers },
		{ label: "following", value: githubProfile.following },
	];

	const meta = [
		githubProfile.company && { icon: Building2, text: githubProfile.company },
		githubProfile.location && { icon: MapPin, text: githubProfile.location },
		githubProfile.blog && {
			icon: LinkIcon,
			text: githubProfile.blog.replace(/^https?:\/\//, ""),
		},
		githubProfile.created_at && {
			icon: Calendar,
			text: `Joined ${formatJoinDate(githubProfile.created_at)}`,
		},
	].filter(Boolean) as { icon: typeof MapPin; text: string }[];

	return (
		<div className="divide-y divide-border">
			{/* Profile Header */}
			<div className="px-4 py-5">
				<div className="flex items-start gap-5">
					{/* Avatar */}
					<div className="relative shrink-0">
						{user.image ? (
							<img
								src={user.image}
								alt={user.name}
								className="w-[72px] h-[72px] rounded-full object-cover"
							/>
						) : (
							<div className="w-[72px] h-[72px] rounded-full bg-muted flex items-center justify-center">
								<Github className="w-6 h-6 text-muted-foreground" />
							</div>
						)}
					</div>

					{/* Info + Stats */}
					<div className="flex-1 min-w-0">
						<div className="flex items-center gap-2">
							<span className="text-sm font-medium truncate">
								{user.name}
							</span>
							<a
								href={`https://github.com/${githubProfile.login}`}
								target="_blank"
								rel="noopener noreferrer"
								className="text-muted-foreground hover:text-muted-foreground transition-colors"
							>
								<ExternalLink className="w-3 h-3" />
							</a>
						</div>
						<div className="text-[11px] font-mono text-muted-foreground/50 mt-0.5">
							@{githubProfile.login}
						</div>

						{/* Stats row */}
						<div className="flex items-center gap-5 mt-3">
							{stats.map((s) => (
								<div
									key={s.label}
									className="text-center"
								>
									<div className="text-sm font-semibold font-mono">
										{formatCount(
											s.value,
										)}
									</div>
									<div className="text-[10px] text-muted-foreground/50">
										{s.label}
									</div>
								</div>
							))}
						</div>
					</div>
				</div>

				{/* Bio */}
				{githubProfile.bio && (
					<p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
						{githubProfile.bio}
					</p>
				)}

				{/* Meta details */}
				{meta.length > 0 && (
					<div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2">
						{meta.map((m) => (
							<span
								key={m.text}
								className="inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground"
							>
								<m.icon className="w-2.5 h-2.5" />
								{m.text}
							</span>
						))}
					</div>
				)}

				<p className="mt-3 text-[10px] text-muted-foreground/30 font-mono">
					Profile synced from GitHub
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
							<span className="text-[10px] font-mono text-muted-foreground">
								connected
							</span>
						</div>
						<span className="text-[10px] font-mono text-muted-foreground bg-muted/50 dark:bg-white/[0.04] px-1.5 py-0.5">
							primary
						</span>
					</div>
				</div>
			</div>

			{/* GitHub Permissions */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
					<Shield className="w-3 h-3" />
					GitHub Permissions
				</label>
				<p className="mt-1 text-[10px] text-muted-foreground/50 font-mono">
					Manage which GitHub permissions are granted to Better Hub.
					Toggle scopes and click update to re-authorize.
				</p>

				{scopesLoading ? (
					<div className="mt-3 flex items-center gap-2 text-muted-foreground text-[10px] font-mono">
						<svg
							xmlns="http://www.w3.org/2000/svg"
							viewBox="0 0 24 24"
							className="w-3.5 h-3.5 animate-spin"
						>
							<g
								fill="none"
								stroke="currentColor"
								strokeLinecap="round"
								strokeWidth="2"
							>
								<path
									strokeDasharray="60"
									strokeDashoffset="60"
									strokeOpacity=".3"
									d="M12 3C16.9706 3 21 7.02944 21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3Z"
								>
									<animate
										fill="freeze"
										attributeName="stroke-dashoffset"
										dur="1.3s"
										values="60;0"
									/>
								</path>
								<path
									strokeDasharray="15"
									strokeDashoffset="15"
									d="M12 3C16.9706 3 21 7.02944 21 12"
								>
									<animate
										fill="freeze"
										attributeName="stroke-dashoffset"
										dur="0.3s"
										values="15;0"
									/>
									<animateTransform
										attributeName="transform"
										dur="1.5s"
										repeatCount="indefinite"
										type="rotate"
										values="0 12 12;360 12 12"
									/>
								</path>
							</g>
						</svg>
						Loading permissions...
					</div>
				) : (
					<>
						<div className="flex flex-wrap gap-1.5 mt-3">
							{SCOPE_GROUPS.map((group) => {
								const isGranted =
									grantedGroupIds.has(
										group.id,
									);
								const isOn = selected.has(group.id);
								return (
									<span
										key={group.id}
										className={cn(
											"inline-flex items-stretch rounded-full border text-[12px] transition-colors",
											isOn
												? "border-foreground/30 bg-foreground/10 text-foreground"
												: "border-foreground/10 text-foreground/40",
										)}
									>
										<button
											type="button"
											onClick={() =>
												toggle(
													group.id,
												)
											}
											disabled={
												group.required
											}
											className={cn(
												"inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 transition-colors",
												!isOn &&
													"line-through decoration-foreground/20",
												group.required
													? "cursor-default"
													: "cursor-pointer hover:text-foreground/70",
											)}
										>
											{isOn &&
												(group.required ? (
													<Lock className="w-2.5 h-2.5 shrink-0" />
												) : (
													<Check className="w-2.5 h-2.5 shrink-0" />
												))}
											{
												group.label
											}
											{isGranted &&
												isOn && (
													<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
												)}
										</button>
										<InfoPopover
											text={
												group.reason
											}
										>
											<span
												className={cn(
													"inline-flex items-center pr-2 pl-1 border-l transition-colors",
													isOn
														? "border-foreground/15 text-foreground/30 hover:text-foreground/60"
														: "border-foreground/10 text-foreground/20 hover:text-foreground/50",
												)}
											>
												<Info className="w-3 h-3" />
											</span>
										</InfoPopover>
									</span>
								);
							})}
						</div>

						<div className="flex items-center gap-3 mt-3">
							<button
								onClick={handleUpdatePermissions}
								disabled={!hasChanges || updating}
								className={cn(
									"flex items-center gap-1.5 border px-3 py-1.5 text-xs font-mono transition-colors cursor-pointer",
									hasChanges
										? "border-foreground/30 text-foreground hover:bg-muted/50 dark:hover:bg-white/[0.04]"
										: "border-border text-muted-foreground cursor-not-allowed",
								)}
							>
								<ExternalLink className="w-3 h-3" />
								{updating
									? "Redirecting..."
									: "Update permissions"}
							</button>
							{hasChanges && (
								<span className="text-[10px] font-mono text-muted-foreground/50">
									Redirects to GitHub to
									re-authorize
								</span>
							)}
						</div>

						<div className="flex items-center gap-1.5 mt-2">
							<span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
							<span className="text-[10px] font-mono text-muted-foreground">
								= currently granted
							</span>
						</div>
					</>
				)}
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
							{formatForDisplay("Mod+K")}
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
