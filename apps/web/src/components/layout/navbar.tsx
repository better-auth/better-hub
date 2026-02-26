"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import {
	LogOut,
	ExternalLink,
	Search,
	Sun,
	Moon,
	User,
	Command,
	Settings,
	Bell,
	GitPullRequest,
	CircleDot,
	CheckCircle2,
	Clock,
	Check,
	Loader2,
} from "lucide-react";
import dynamic from "next/dynamic";

const CommandMenu = dynamic(() => import("@/components/command-menu").then((m) => m.CommandMenu));
import { useColorTheme } from "@/components/theme/theme-provider";
import { signOut } from "@/lib/auth-client";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuSeparator,
	DropdownMenuShortcut,
	DropdownMenuGroup,
	DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { TimeAgo } from "@/components/ui/time-ago";
import { markNotificationDone, markAllNotificationsRead } from "@/app/(app)/repos/actions";
import { SettingsDialog } from "@/components/settings/settings-dialog";
import { $Session } from "@/lib/auth";
import type { NotificationItem } from "@/lib/github-types";

interface AppNavbarProps {
	session: $Session;
	notifications: NotificationItem[];
}

const reasonLabels: Record<string, string> = {
	assign: "Assigned",
	author: "Author",
	comment: "Comment",
	ci_activity: "CI",
	invitation: "Invited",
	manual: "Subscribed",
	mention: "Mentioned",
	review_requested: "Review requested",
	security_alert: "Security",
	state_change: "State change",
	subscribed: "Watching",
	team_mention: "Team mention",
};

function getNotifHref(notif: NotificationItem): string {
	const repo = notif.repository.full_name;
	if (!notif.subject.url) return `/${repo}`;
	const match = notif.subject.url.match(/repos\/[^/]+\/[^/]+\/(pulls|issues)\/(\d+)/);
	if (match) {
		const type = match[1] === "pulls" ? "pulls" : "issues";
		return `/${repo}/${type}/${match[2]}`;
	}
	return `/${repo}`;
}

export function AppNavbar({ session, notifications }: AppNavbarProps) {
	const { mode, toggleMode } = useColorTheme();
	const gh = session.githubUser;
	const [settingsOpen, setSettingsOpen] = useState(false);
	const [notifOpen, setNotifOpen] = useState(false);
	const [doneIds, setDoneIds] = useState<Set<string>>(new Set());
	const [markingAll, startMarkAll] = useTransition();
	const [markingId, setMarkingId] = useState<string | null>(null);

	const visibleNotifs = notifications.filter((n) => !doneIds.has(n.id));
	const unreadCount = visibleNotifs.filter((n) => n.unread).length;

	async function handleMarkDone(notifId: string) {
		setMarkingId(notifId);
		const res = await markNotificationDone(notifId);
		if (res.success) {
			setDoneIds((prev) => new Set([...prev, notifId]));
		}
		setMarkingId(null);
	}

	return (
		<header className="fixed top-0 h-10 flex w-full flex-col bg-background backdrop-blur-lg z-10">
			<nav className="top-0 flex h-full items-center justify-between border-border px-2 sm:px-4 border-b">
				<div className="flex items-center gap-0" id="navbar-breadcrumb">
					<Link
						className="shrink-0 flex items-center text-foreground gap-1.5 transition-colors text-xs tracking-tight"
						href="/dashboard"
					>
						<svg
							width="16"
							height="16"
							viewBox="0 0 65 65"
							fill="none"
							xmlns="http://www.w3.org/2000/svg"
						>
							<path
								d="M25.3906 16.25C25.3908 14.8872 24.9992 13.5531 24.2627 12.4066C23.5261 11.26 22.4755 10.3494 21.236 9.78298C19.9965 9.21661 18.6203 9.01841 17.2714 9.21199C15.9224 9.40557 14.6576 9.98277 13.6274 10.8749C12.5972 11.7669 11.8451 12.9363 11.4606 14.2437C11.0762 15.5512 11.0756 16.9415 11.459 18.2492C11.8424 19.557 12.5935 20.727 13.623 21.6199C14.6524 22.5128 15.9169 23.091 17.2656 23.2857V41.7142C15.4867 41.971 13.871 42.8921 12.7438 44.2921C11.6165 45.6921 11.0614 47.467 11.1901 49.2598C11.3189 51.0526 12.1218 52.7301 13.4375 53.9547C14.7532 55.1793 16.4839 55.8601 18.2813 55.8601C20.0787 55.8601 21.8093 55.1793 23.125 53.9547C24.4407 52.7301 25.2437 51.0526 25.3724 49.2598C25.5011 47.467 24.946 45.6921 23.8188 44.2921C22.6915 42.8921 21.0758 41.971 19.2969 41.7142V23.2857C20.9888 23.0415 22.5361 22.1959 23.6552 20.9037C24.7744 19.6116 25.3905 17.9594 25.3906 16.25ZM13.2031 16.25C13.2031 15.2456 13.501 14.2638 14.059 13.4287C14.6169 12.5936 15.41 11.9428 16.3379 11.5584C17.2659 11.1741 18.2869 11.0735 19.272 11.2694C20.257 11.4654 21.1619 11.949 21.872 12.6592C22.5822 13.3694 23.0659 14.2742 23.2618 15.2593C23.4578 16.2444 23.3572 17.2654 22.9728 18.1933C22.5885 19.1212 21.9376 19.9143 21.1025 20.4723C20.2674 21.0303 19.2856 21.3281 18.2813 21.3281C16.9345 21.3281 15.6428 20.7931 14.6905 19.8408C13.7382 18.8884 13.2031 17.5968 13.2031 16.25ZM23.3594 48.75C23.3594 49.7543 23.0616 50.7362 22.5036 51.5712C21.9456 52.4063 21.1525 53.0572 20.2246 53.4416C19.2967 53.8259 18.2756 53.9265 17.2906 53.7305C16.3055 53.5346 15.4007 53.051 14.6905 52.3408C13.9803 51.6306 13.4967 50.7257 13.3007 49.7407C13.1048 48.7556 13.2053 47.7346 13.5897 46.8067C13.974 45.8788 14.6249 45.0857 15.46 44.5277C16.2951 43.9697 17.2769 43.6719 18.2813 43.6719C18.9481 43.6719 19.6085 43.8032 20.2246 44.0584C20.8407 44.3136 21.4005 44.6877 21.872 45.1592C22.3436 45.6308 22.7176 46.1906 22.9728 46.8067C23.228 47.4228 23.3594 48.0831 23.3594 48.75ZM51.7969 41.7142V28.0896C51.7985 27.4222 51.6678 26.761 51.4124 26.1444C51.157 25.5277 50.782 24.9678 50.309 24.4969L39.0152 13.2031H48.75C49.0194 13.2031 49.2777 13.0961 49.4682 12.9056C49.6586 12.7152 49.7656 12.4568 49.7656 12.1875C49.7656 11.9181 49.6586 11.6598 49.4682 11.4693C49.2777 11.2789 49.0194 11.1719 48.75 11.1719H36.5625C36.2932 11.1719 36.0348 11.2789 35.8444 11.4693C35.6539 11.6598 35.5469 11.9181 35.5469 12.1875V24.375C35.5469 24.6443 35.6539 24.9027 35.8444 25.0931C36.0348 25.2836 36.2932 25.3906 36.5625 25.3906C36.8319 25.3906 37.0902 25.2836 37.2807 25.0931C37.4711 24.9027 37.5781 24.6443 37.5781 24.375V14.6402L48.8744 25.934C49.1573 26.2171 49.3816 26.5533 49.5345 26.9231C49.6874 27.293 49.766 27.6894 49.7656 28.0896V41.7142C47.9867 41.971 46.371 42.8921 45.2438 44.2921C44.1165 45.6921 43.5614 47.467 43.6901 49.2598C43.8189 51.0526 44.6219 52.7301 45.9375 53.9547C47.2532 55.1793 48.9839 55.8601 50.7813 55.8601C52.5787 55.8601 54.3093 55.1793 55.625 53.9547C56.9407 52.7301 57.7437 51.0526 57.8724 49.2598C58.0011 47.467 57.446 45.6921 56.3187 44.2921C55.1915 42.8921 53.5758 41.971 51.7969 41.7142ZM50.7813 53.8281C49.7769 53.8281 48.7951 53.5303 47.96 52.9723C47.1249 52.4143 46.474 51.6212 46.0897 50.6933C45.7053 49.7654 45.6048 48.7444 45.8007 47.7593C45.9967 46.7742 46.4803 45.8694 47.1905 45.1592C47.9007 44.449 48.8055 43.9654 49.7906 43.7694C50.2756 43.5735 51.7967 43.6741 52.7246 44.0584C53.6525 44.4428 54.4456 45.0936 55.0036 45.9287C55.5616 46.7638 55.8594 47.7456 55.8594 48.75C55.8594 50.0968 55.3244 51.3884 54.372 52.3408C53.4197 53.2931 52.1281 53.8281 50.7813 53.8281Z"
								fill="currentColor"
								stroke="currentColor"
								strokeWidth="3"
								strokeLinejoin="round"
							/>
						</svg>

						<span className="text-sm tracking-tight text-foreground">
							BETTER-HUB.
						</span>
					</Link>
				</div>
				<div className="flex items-center gap-1.5">
					<CommandMenu />

					{/* Notifications bell */}
					<button
						onClick={() => setNotifOpen(true)}
						className="relative shrink-0 p-1.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer outline-none"
						title="Notifications"
					>
						<Bell className="w-4 h-4" />
						{unreadCount > 0 && (
							<span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-foreground" />
						)}
					</button>

					{/* User menu */}
					{session.user.image && (
						<DropdownMenu>
							<DropdownMenuTrigger
								id={`user-${session.user.id}`}
								asChild
							>
								<button
									className="relative shrink-0 cursor-pointer group p-1.5 outline-none"
									title={
										session.user.name
											? `Signed in as ${session.user.name}`
											: "Account"
									}
								>
									<img
										src={
											session.user
												.image
										}
										alt={
											session.user
												.name ||
											"User avatar"
										}
										className="w-6 h-6 rounded-full border border-border/60 dark:border-white/8 group-hover:border-foreground/20 transition-colors"
									/>
								</button>
							</DropdownMenuTrigger>
							<DropdownMenuContent
								align="end"
								className="w-64 p-0"
							>
								{/* Profile card */}
								<div className="px-3 py-3 bg-muted/30 dark:bg-white/[0.02]">
									<div className="flex items-start gap-3">
										<img
											src={
												session
													.user
													.image
											}
											alt=""
											className="w-9 h-9 rounded-full shrink-0 border border-border/40"
										/>
										<div className="flex flex-col min-w-0 gap-0.5">
											<span className="text-[12px] font-medium truncate leading-tight">
												{
													session
														.user
														.name
												}
											</span>
											{gh?.login && (
												<span className="text-[11px] font-mono text-muted-foreground truncate leading-tight">
													{
														gh.login
													}
												</span>
											)}
											{gh?.email && (
												<span className="text-[10px] text-muted-foreground/50 truncate leading-tight">
													{
														gh.email
													}
												</span>
											)}
										</div>
									</div>
									{gh && (
										<div className="flex items-center gap-3 mt-2.5 pt-2 border-t border-border/40">
											<span className="text-[10px] text-muted-foreground font-mono">
												<span className="text-foreground/80 font-medium">
													{gh.followers ??
														0}
												</span>{" "}
												followers
											</span>
											<span className="text-[10px] text-muted-foreground font-mono">
												<span className="text-foreground/80 font-medium">
													{gh.following ??
														0}
												</span>{" "}
												following
											</span>
											<span className="text-[10px] text-muted-foreground font-mono">
												<span className="text-foreground/80 font-medium">
													{gh.public_repos ??
														0}
												</span>{" "}
												repos
											</span>
										</div>
									)}
								</div>

								<DropdownMenuSeparator className="my-0" />

								{/* Navigation */}
								<DropdownMenuGroup className="p-1">
									<DropdownMenuLabel className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 px-2 py-1">
										Navigation
									</DropdownMenuLabel>
									{gh?.login && (
										<DropdownMenuItem
											asChild
											className="text-[11px] gap-2 h-7"
										>
											<Link
												href={`/${gh.login}`}
											>
												<User className="w-3.5 h-3.5" />
												Your
												profile
											</Link>
										</DropdownMenuItem>
									)}
									<DropdownMenuItem
										onClick={() =>
											window.dispatchEvent(
												new CustomEvent(
													"open-cmdk-mode",
													{
														detail: "search",
													},
												),
											)
										}
										className="text-[11px] gap-2 h-7"
									>
										<Search className="w-3.5 h-3.5" />
										Search repos
										<DropdownMenuShortcut className="flex items-center gap-0.5 text-[10px] font-mono">
											<Command className="w-2 h-2" />
											/
										</DropdownMenuShortcut>
									</DropdownMenuItem>
								</DropdownMenuGroup>

								<DropdownMenuSeparator className="my-0" />

								{/* Preferences */}
								<DropdownMenuGroup className="p-1">
									<DropdownMenuLabel className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground/50 px-2 py-1">
										Preferences
									</DropdownMenuLabel>
									<DropdownMenuItem
										onClick={() =>
											setSettingsOpen(
												true,
											)
										}
										className="text-[11px] gap-2 h-7"
									>
										<Settings className="w-3.5 h-3.5" />
										Settings
									</DropdownMenuItem>
									<DropdownMenuItem
										onClick={(e) =>
											toggleMode(
												e,
											)
										}
										className="text-[11px] gap-2 h-7"
									>
										{mode === "dark" ? (
											<Sun className="w-3.5 h-3.5" />
										) : (
											<Moon className="w-3.5 h-3.5" />
										)}
										{mode === "dark"
											? "Light mode"
											: "Dark mode"}
									</DropdownMenuItem>
									{gh?.login && (
										<DropdownMenuItem
											onClick={() =>
												window.open(
													`https://github.com/${gh.login}`,
													"_blank",
												)
											}
											className="text-[11px] gap-2 h-7"
										>
											<ExternalLink className="w-3.5 h-3.5" />
											GitHub
											profile
										</DropdownMenuItem>
									)}
								</DropdownMenuGroup>

								<DropdownMenuSeparator className="my-0" />

								{/* Sign out */}
								<div className="p-1">
									<DropdownMenuItem
										onClick={() =>
											signOut({
												fetchOptions:
													{
														onSuccess: () => {
															window.location.href =
																"/";
														},
													},
											})
										}
										className="text-[11px] gap-2 h-7 text-destructive focus:text-destructive"
									>
										<LogOut className="w-3.5 h-3.5" />
										Sign out
									</DropdownMenuItem>
								</div>
							</DropdownMenuContent>
						</DropdownMenu>
					)}
				</div>
			</nav>

			{/* Notifications bottom sheet */}
			<Sheet open={notifOpen} onOpenChange={setNotifOpen}>
				<SheetContent
					side="bottom"
					showCloseButton={false}
					className="p-0 rounded-t-xl max-h-[70vh] flex flex-col border-t border-border"
					title="Notifications"
				>
					{/* Header */}
					<div className="shrink-0 flex items-center justify-between px-4 py-3 border-b border-border">
						<div className="flex items-center gap-2">
							<Bell className="w-3.5 h-3.5 text-muted-foreground" />
							<span className="text-[12px] font-medium">
								Notifications
							</span>
							{unreadCount > 0 && (
								<span className="text-[9px] font-mono px-1.5 py-0.5 bg-foreground text-background rounded-full tabular-nums">
									{unreadCount}
								</span>
							)}
						</div>
						<div className="flex items-center gap-2">
							{unreadCount > 0 && (
								<button
									disabled={markingAll}
									onClick={() => {
										startMarkAll(
											async () => {
												const res =
													await markAllNotificationsRead();
												if (
													res.success
												) {
													setDoneIds(
														new Set(
															notifications.map(
																(
																	n,
																) =>
																	n.id,
															),
														),
													);
												}
											},
										);
									}}
									className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50"
								>
									{markingAll ? (
										<Loader2 className="w-3 h-3 animate-spin" />
									) : (
										<CheckCircle2 className="w-3 h-3" />
									)}
									Clear all
								</button>
							)}
							<Link
								href="/notifications"
								onClick={() => setNotifOpen(false)}
								className="text-[10px] font-mono text-muted-foreground hover:text-foreground transition-colors"
							>
								View all
							</Link>
						</div>
					</div>

					{/* Notification list */}
					<div className="flex-1 overflow-y-auto min-h-0">
						{visibleNotifs.length > 0 ? (
							visibleNotifs.map((notif) => {
								const href = getNotifHref(notif);
								const isMarking =
									markingId === notif.id;
								const icon =
									notif.subject.type ===
									"PullRequest" ? (
										<GitPullRequest className="w-3.5 h-3.5" />
									) : notif.subject.type ===
									  "Issue" ? (
										<CircleDot className="w-3.5 h-3.5" />
									) : (
										<Bell className="w-3.5 h-3.5" />
									);

								return (
									<div
										key={notif.id}
										className="group flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors border-b border-border/50 last:border-b-0"
									>
										<span className="mt-0.5 text-muted-foreground/60 shrink-0">
											{icon}
										</span>
										<Link
											href={href}
											onClick={() =>
												setNotifOpen(
													false,
												)
											}
											className="flex-1 min-w-0"
										>
											<div className="flex items-center gap-1.5">
												{notif.unread && (
													<span className="w-1.5 h-1.5 rounded-full bg-foreground shrink-0" />
												)}
												<span className="text-[12px] text-foreground/90 truncate leading-tight">
													{
														notif
															.subject
															.title
													}
												</span>
											</div>
											<div className="flex items-center gap-2 mt-1">
												<span className="text-[10px] font-mono text-muted-foreground/50 truncate">
													{
														notif
															.repository
															.full_name
													}
												</span>
												<span
													className={cn(
														"text-[9px] font-mono px-1 py-px border shrink-0",
														notif.reason ===
															"review_requested"
															? "border-warning/30 text-warning"
															: notif.reason ===
																		"mention" ||
																  notif.reason ===
																		"team_mention"
																? "border-foreground/20 text-foreground/60"
																: "border-border text-muted-foreground/60",
													)}
												>
													{reasonLabels[
														notif
															.reason
													] ||
														notif.reason}
												</span>
												<span className="flex items-center gap-0.5 text-[10px] text-muted-foreground shrink-0">
													<Clock className="w-2.5 h-2.5" />
													<TimeAgo
														date={
															notif.updated_at
														}
													/>
												</span>
											</div>
										</Link>
										<button
											disabled={
												isMarking
											}
											onClick={() =>
												handleMarkDone(
													notif.id,
												)
											}
											className="shrink-0 mt-0.5 p-0.5 text-muted-foreground/30 opacity-0 group-hover:opacity-100 hover:text-foreground/70 transition-all cursor-pointer disabled:opacity-100"
											title="Dismiss"
										>
											{isMarking ? (
												<Loader2 className="w-3 h-3 animate-spin" />
											) : (
												<Check className="w-3 h-3" />
											)}
										</button>
									</div>
								);
							})
						) : (
							<div className="py-12 text-center">
								<Bell className="w-5 h-5 text-muted-foreground/20 mx-auto mb-2" />
								<p className="text-[11px] text-muted-foreground/50 font-mono">
									All caught up
								</p>
							</div>
						)}
					</div>
				</SheetContent>
			</Sheet>

			<SettingsDialog
				open={settingsOpen}
				onOpenChange={setSettingsOpen}
				user={{
					name: session.user.name || "",
					email: session.user.email,
					image: session.user.image ?? null,
				}}
				githubProfile={{
					login: gh.login,
					avatar_url: gh.avatar_url,
					bio: gh.bio ?? null,
					company: gh.company ?? null,
					location: gh.location ?? null,
					blog: gh.blog ?? null,
					twitter_username: gh.twitter_username ?? null,
					public_repos: gh.public_repos ?? 0,
					followers: gh.followers ?? 0,
					following: gh.following ?? 0,
					created_at: gh.created_at ?? "",
				}}
			/>
		</header>
	);
}
