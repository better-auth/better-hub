"use client";

import { useState, useMemo, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { cn, formatNumber } from "@/lib/utils";
import { ListSearchInput, SortCycleButton } from "@/components/shared/list-controls";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
} from "@/components/ui/dialog";
import { Shield, MapPin, Building2, Users, BookOpen, UserPlus, Loader2 } from "lucide-react";

interface Person {
	login: string;
	avatar_url: string;
	name: string | null;
	bio: string | null;
	company: string | null;
	location: string | null;
	publicRepos: number;
	followers: number;
	role: "admin" | "member";
}

interface PeopleListProps {
	owner: string;
	repo: string;
	people: Person[];
	onInvite?: (
		username: string,
		role: "member" | "admin",
	) => Promise<{ success: boolean; error?: string }>;
}

type SortMode = "alpha" | "followers" | "repos";

const SORT_CYCLE: SortMode[] = ["alpha", "followers", "repos"];
const SORT_LABELS: Record<SortMode, string> = {
	alpha: "A → Z",
	followers: "Followers",
	repos: "Repositories",
};

export function PeopleList({ owner, repo, people, onInvite }: PeopleListProps) {
	const router = useRouter();
	const [search, setSearch] = useState("");
	const [sort, setSort] = useState<SortMode>("alpha");
	const [roleFilter, setRoleFilter] = useState<"all" | "admin" | "member">("all");
	const [inviteOpen, setInviteOpen] = useState(false);
	const [inviteUsername, setInviteUsername] = useState("");
	const [inviteRole, setInviteRole] = useState<"member" | "admin">("member");
	const [inviteError, setInviteError] = useState("");
	const [inviteSubmitting, setInviteSubmitting] = useState(false);

	const adminCount = useMemo(() => people.filter((p) => p.role === "admin").length, [people]);

	const filtered = useMemo(() => {
		let list = [...people];

		if (roleFilter !== "all") {
			list = list.filter((p) => p.role === roleFilter);
		}

		if (search.trim()) {
			const q = search.toLowerCase();
			list = list.filter(
				(p) =>
					p.login.toLowerCase().includes(q) ||
					(p.name && p.name.toLowerCase().includes(q)) ||
					(p.company && p.company.toLowerCase().includes(q)),
			);
		}

		if (sort === "followers") {
			list.sort((a, b) => b.followers - a.followers);
		} else if (sort === "repos") {
			list.sort((a, b) => b.publicRepos - a.publicRepos);
		} else {
			list.sort((a, b) =>
				a.login.toLowerCase().localeCompare(b.login.toLowerCase()),
			);
		}

		return list;
	}, [people, search, sort, roleFilter]);

	const handleInvite = useCallback(async () => {
		if (!inviteUsername.trim() || inviteSubmitting || !onInvite) return;
		setInviteSubmitting(true);
		setInviteError("");
		const result = await onInvite(inviteUsername.trim(), inviteRole);
		if (result.success) {
			setInviteUsername("");
			setInviteOpen(false);
			router.refresh();
		} else {
			setInviteError(result.error ?? "Failed to invite member");
		}
		setInviteSubmitting(false);
	}, [inviteUsername, inviteRole, inviteSubmitting, onInvite, router]);

	return (
		<div className="p-4 space-y-3">
			{/* Controls */}
			<div className="flex items-center gap-2 flex-wrap">
				<ListSearchInput
					placeholder="Filter members..."
					value={search}
					onChange={setSearch}
				/>
				<div className="flex items-center gap-0.5 text-[10px] font-mono">
					{(["all", "admin", "member"] as const).map((r) => (
						<button
							key={r}
							onClick={() => setRoleFilter(r)}
							className={cn(
								"px-2 py-1 transition-colors cursor-pointer rounded-md",
								roleFilter === r
									? "bg-muted text-foreground"
									: "text-muted-foreground/50 hover:text-muted-foreground",
							)}
						>
							{r === "all"
								? "All"
								: r === "admin"
									? `Admins (${adminCount})`
									: "Members"}
						</button>
					))}
				</div>
				<SortCycleButton
					sort={sort}
					cycle={SORT_CYCLE}
					labels={SORT_LABELS}
					onSort={setSort}
				/>
				{onInvite && (
					<button
						onClick={() => {
							setInviteOpen(true);
							setInviteUsername("");
							setInviteError("");
							setInviteRole("member");
						}}
						className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-mono bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors cursor-pointer"
					>
						<UserPlus className="w-3 h-3" />
						Add member
					</button>
				)}
			</div>

			{/* Count */}
			<p className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground/60">
				{filtered.length} member{filtered.length !== 1 ? "s" : ""}
			</p>

			{filtered.length === 0 ? (
				<div className="flex items-center justify-center py-12 border border-border/50 rounded-md">
					<p className="text-xs text-muted-foreground/60 font-mono">
						No members found
					</p>
				</div>
			) : (
				<div className="border border-border/50 rounded-md overflow-hidden divide-y divide-border/40">
					{filtered.map((person) => (
						<Link
							key={person.login}
							href={`/${owner}/${repo}/people/${person.login}`}
							className="group flex items-start gap-3.5 px-4 py-3 hover:bg-muted/50 dark:hover:bg-white/[0.02] transition-colors"
						>
							<Image
								src={person.avatar_url}
								alt={person.login}
								width={40}
								height={40}
								className="rounded-full shrink-0 mt-0.5"
							/>

							{/* Name + meta */}
							<div className="flex-1 min-w-0">
								<div className="flex items-center gap-2">
									<span className="text-[13px] font-medium truncate">
										{person.name ??
											person.login}
									</span>
									{person.name && (
										<span className="text-[11px] font-mono text-muted-foreground/50 truncate">
											{
												person.login
											}
										</span>
									)}
									{person.role ===
										"admin" && (
										<span className="flex items-center gap-0.5 text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 shrink-0">
											<Shield className="w-2.5 h-2.5" />
											Admin
										</span>
									)}
								</div>

								{person.bio && (
									<p className="text-[11px] text-muted-foreground/60 truncate mt-0.5 max-w-lg">
										{person.bio}
									</p>
								)}

								<div className="flex items-center gap-3 mt-1.5 flex-wrap">
									{person.company && (
										<span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
											<Building2 className="w-3 h-3 shrink-0" />
											<span className="truncate max-w-[140px]">
												{
													person.company
												}
											</span>
										</span>
									)}
									{person.location && (
										<span className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50">
											<MapPin className="w-3 h-3 shrink-0" />
											<span className="truncate max-w-[140px]">
												{
													person.location
												}
											</span>
										</span>
									)}
								</div>
							</div>

							{/* Stats */}
							<div className="hidden sm:flex items-center gap-4 shrink-0 mt-1">
								<span
									className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 tabular-nums"
									title="Followers"
								>
									<Users className="w-3 h-3" />
									{formatNumber(
										person.followers,
									)}
								</span>
								<span
									className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground/50 tabular-nums"
									title="Public repos"
								>
									<BookOpen className="w-3 h-3" />
									{formatNumber(
										person.publicRepos,
									)}
								</span>
							</div>
						</Link>
					))}
				</div>
			)}

			{/* Invite dialog */}
			<Dialog
				open={inviteOpen}
				onOpenChange={(open) => {
					setInviteOpen(open);
					if (!open) {
						setInviteUsername("");
						setInviteError("");
					}
				}}
			>
				<DialogContent className="sm:max-w-sm gap-0">
					<DialogHeader>
						<DialogTitle className="text-sm">
							Add member
						</DialogTitle>
						<DialogDescription className="text-xs text-muted-foreground/70">
							Invite a GitHub user to{" "}
							<span className="font-mono">{owner}</span>.
						</DialogDescription>
					</DialogHeader>

					<div className="mt-4 flex flex-col gap-3">
						<div className="flex flex-col gap-1.5">
							<label className="text-[11px] font-medium text-muted-foreground/70">
								GitHub username
							</label>
							<input
								type="text"
								value={inviteUsername}
								onChange={(e) => {
									setInviteUsername(
										e.target.value,
									);
									setInviteError("");
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleInvite();
									}
								}}
								placeholder="username"
								autoFocus
								className="w-full border border-border bg-transparent px-2.5 py-2 text-xs font-mono placeholder:text-muted-foreground/25 focus:outline-none focus:border-foreground/30 rounded-md transition-colors"
							/>
						</div>

						<div className="flex flex-col gap-1.5">
							<label className="text-[11px] font-medium text-muted-foreground/70">
								Role
							</label>
							<div className="flex items-center gap-1 text-[11px] font-mono">
								{(["member", "admin"] as const).map(
									(r) => (
										<button
											key={r}
											onClick={() =>
												setInviteRole(
													r,
												)
											}
											className={cn(
												"px-3 py-1.5 rounded-md transition-colors cursor-pointer border",
												inviteRole ===
													r
													? "border-foreground/20 bg-muted text-foreground"
													: "border-border text-muted-foreground/50 hover:text-muted-foreground",
											)}
										>
											{r ===
											"admin"
												? "Admin"
												: "Member"}
										</button>
									),
								)}
							</div>
						</div>

						{inviteError && (
							<p className="text-[10px] font-mono text-destructive">
								{inviteError}
							</p>
						)}

						<button
							onClick={handleInvite}
							disabled={
								inviteSubmitting ||
								!inviteUsername.trim()
							}
							className="w-full flex items-center justify-center gap-2 py-2 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors disabled:opacity-40 cursor-pointer"
						>
							{inviteSubmitting ? (
								<Loader2 className="w-3.5 h-3.5 animate-spin" />
							) : (
								<UserPlus className="w-3.5 h-3.5" />
							)}
							{inviteSubmitting
								? "Inviting..."
								: "Send invitation"}
						</button>
					</div>
				</DialogContent>
			</Dialog>
		</div>
	);
}
