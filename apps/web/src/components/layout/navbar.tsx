"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogOut, ExternalLink, Search, Puzzle } from "lucide-react";
import dynamic from "next/dynamic";
import { ExtensionInstallDialog } from "@/components/extension/extension-install-dialog";

const CommandMenu = dynamic(() => import("@/components/command-menu").then((m) => m.CommandMenu));
import { signOut } from "@/lib/auth-client";
import { useMutationEvents } from "@/components/shared/mutation-event-provider";
import {
	DropdownMenu,
	DropdownMenuTrigger,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { $Session } from "@/lib/auth";

interface AccountInfo {
	id: string;
	login: string;
	avatarUrl: string;
	label: string;
	active: boolean;
}

interface AccountsData {
	accounts: AccountInfo[];
	oauthLogin: string;
	oauthAvatar: string;
	oauthActive: boolean;
}

interface AppNavbarProps {
	session: $Session;
}

export function AppNavbar({ session }: AppNavbarProps) {
	const [extensionOpen, setExtensionOpen] = useState(false);

	return (
		<>
			<header className="fixed top-0 h-10 flex w-full flex-col bg-background backdrop-blur-lg z-10">
				<nav className="top-0 flex h-full items-center justify-between border-border px-2 sm:px-4 border-b">
					<div className="flex items-center gap-0" id="navbar-breadcrumb">
						<Link
							className="shrink-0 text-foreground transition-colors text-xs tracking-tight"
							href="/dashboard"
						>
							<span className="text-sm tracking-tight text-foreground">
								BETTER-HUB.
							</span>
						</Link>
					</div>
					<div className="flex items-center gap-2">
						<CommandMenu />
						{session.user.image && (
							<DropdownMenu>
								<DropdownMenuTrigger asChild>
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
									className="w-52"
								>
									{/* Current user */}
									<div className="px-2 py-1.5 flex items-center gap-2">
										<img
											src={
												session.user
													.image
											}
											alt=""
											className="w-6 h-6 rounded-full shrink-0"
										/>
										<div className="flex flex-col min-w-0">
											<span className="text-[11px] font-medium truncate">
												{
													session
														.user
														.name
												}{" "}
												(@
												{
													session
														.githubUser
														.login
												}
												)
											</span>
											<span className="text-[11px] font-medium truncate">
												{
													session
														.user
														.email
												}
											</span>
										</div>
									</div>
									<DropdownMenuSeparator />

									<DropdownMenuItem
										onClick={() =>
											setExtensionOpen(
												true,
											)
										}
										className="text-[11px] gap-2 h-7"
									>
										<Puzzle className="w-3.5 h-3.5" />
										Install
										extension
									</DropdownMenuItem>

									<DropdownMenuSeparator />

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
										className="text-[11px] gap-2 h-7 "
									>
										<LogOut className="w-3.5 h-3.5" />
										Sign out
									</DropdownMenuItem>
								</DropdownMenuContent>
							</DropdownMenu>
						)}
					</div>
				</nav>
			</header>

			<ExtensionInstallDialog
				open={extensionOpen}
				onOpenChange={setExtensionOpen}
			/>
		</>
	);
}
