"use client";

import { signIn } from "@/lib/auth-client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn, safeRedirect } from "@/lib/utils";
import { SCOPE_GROUPS } from "@/lib/github-scopes";
import { PlusIcon, ChevronDown } from "lucide-react";
import { ArrowRightIcon } from "@/components/shared/icons/arrow-right-icon";
import { CheckIcon } from "@/components/shared/icons/check-icon";
import { GithubIcon } from "@/components/shared/icons/github-icon";
import { InfoIcon } from "@/components/shared/icons/info-icon";
import { KeyIcon } from "@/components/shared/icons/key-icon";
import { LoadingSpinner } from "@/components/shared/icons/loading-spinner";
import { LockIcon } from "@/components/shared/icons/lock-icon";

/* ── Component ── */

function InfoPopover({ text, children }: { text: string; children: React.ReactNode }) {
	const [visible, setVisible] = useState(false);
	const timeout = useRef<ReturnType<typeof setTimeout>>(undefined);

	const show = useCallback(() => {
		clearTimeout(timeout.current);
		timeout.current = setTimeout(() => setVisible(true), 400);
	}, []);

	const hide = useCallback(() => {
		clearTimeout(timeout.current);
		setVisible(false);
	}, []);

	useEffect(() => () => clearTimeout(timeout.current), []);

	return (
		<div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
			{children}
			<div
				className={cn(
					"absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 px-3 py-2 rounded-md bg-foreground text-background text-[11px] leading-relaxed shadow-lg z-50 pointer-events-none transition-all duration-200 ease-out",
					visible
						? "opacity-100 translate-y-0"
						: "opacity-0 translate-y-1 pointer-events-none",
				)}
			>
				{text}
				<div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px border-4 border-transparent border-t-foreground" />
			</div>
		</div>
	);
}

/* ── Component ── */

export function LoginButton({ redirectTo }: { redirectTo?: string }) {
	const router = useRouter();
	const [mode, setMode] = useState<"oauth" | "pat">("oauth");
	const [loading, setLoading] = useState(false);
	const [patValue, setPatValue] = useState("");
	const [patError, setPatError] = useState("");
	const [selected, setSelected] = useState<Set<string>>(() => {
		const initial = new Set<string>();
		for (const g of SCOPE_GROUPS) {
			if (g.required || g.defaultOn) initial.add(g.id);
		}
		return initial;
	});
	const [permsExpanded, setPermsExpanded] = useState(false);
	const requiredCount = SCOPE_GROUPS.filter((group) => group.required).length;
	const selectedCount = selected.size;
	const optionalSelectedCount = Math.max(0, selectedCount - requiredCount);

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

	function handleOAuthSignIn() {
		setLoading(true);
		const scopes: string[] = [];
		for (const g of SCOPE_GROUPS) {
			if (selected.has(g.id)) scopes.push(...g.scopes);
		}
		signIn.social({
			provider: "github",
			callbackURL: safeRedirect(redirectTo),
			scopes,
		});
	}

	async function handlePatSignIn() {
		const trimmed = patValue.trim();
		if (!trimmed) {
			setPatError("Please enter a token");
			return;
		}
		setLoading(true);
		setPatError("");
		try {
			const res = await fetch("/api/auth/pat-signin", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ pat: trimmed }),
			});
			const data = await res.json();
			if (!res.ok || !data.success) {
				setPatError(data.message || data.error || "Sign-in failed");
				setLoading(false);
				return;
			}
			router.push(safeRedirect(redirectTo));
		} catch {
			setPatError("Network error. Please try again.");
			setLoading(false);
		}
	}

	return (
		<div className="space-y-4">
			{mode === "oauth" ? (
				<>
					{/* OAuth sign in button */}
					<button
						onClick={handleOAuthSignIn}
						disabled={loading}
						className="w-full flex items-center justify-center gap-3 bg-foreground text-background font-medium py-3 px-6 rounded-[2px] text-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
					>
						{loading ? (
							<LoadingSpinner className="w-4 h-4" />
						) : (
							<GithubIcon className="w-4 h-4" />
						)}
						{loading
							? "Redirecting..."
							: "Continue with GitHub"}
						{!loading && (
							<ArrowRightIcon className="w-3.5 h-3.5 ml-auto" />
						)}
					</button>

					{/* Permissions — collapsed by default */}
					<div>
						<button
							type="button"
							onClick={() => setPermsExpanded((v) => !v)}
							className="w-full flex items-center justify-between text-[11px] text-foreground/40 hover:text-foreground/60 transition-colors cursor-pointer py-1"
						>
							<span>
								{requiredCount} required +{" "}
								{optionalSelectedCount} optional
								permissions
							</span>
							<ChevronDown
								className={cn(
									"w-3.5 h-3.5 transition-transform duration-200",
									permsExpanded &&
										"rotate-180",
								)}
							/>
						</button>

						{permsExpanded && (
							<div className="mt-2 space-y-2.5">
								<p className="text-[11px] text-foreground/45">
									Click any permission to
									include or remove it. Hover
									the{" "}
									<InfoIcon className="inline w-3 h-3 -mt-px" />{" "}
									to learn why each is needed.
								</p>
								<div className="flex flex-wrap gap-1.5">
									{SCOPE_GROUPS.map(
										(group) => {
											const isOn =
												selected.has(
													group.id,
												);
											return (
												<span
													key={
														group.id
													}
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
																<LockIcon className="w-2.5 h-2.5 shrink-0" />
															) : (
																<CheckIcon className="w-2.5 h-2.5 shrink-0" />
															))}
														{
															group.label
														}
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
															<InfoIcon className="w-3 h-3" />
														</span>
													</InfoPopover>
												</span>
											);
										},
									)}
								</div>
								<div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-foreground/40">
									<span className="inline-flex items-center gap-1">
										<LockIcon className="w-2.5 h-2.5" />
										Required
									</span>
									<span className="inline-flex items-center gap-1">
										<CheckIcon className="w-2.5 h-2.5" />
										Selected optional
									</span>
								</div>
								<p className="text-[11px] text-foreground/50">
									Only selected permissions
									are requested on the next
									screen.
								</p>
							</div>
						)}
					</div>
				</>
			) : (
				<>
					{/* PAT input */}
					<div>
						<p className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-1.5">
							Personal Access Token
						</p>
						<p className="text-[11px] text-foreground/30 mb-2.5">
							Paste a GitHub PAT with at least{" "}
							<code className="font-mono text-foreground/50">
								read:user
							</code>{" "}
							and{" "}
							<code className="font-mono text-foreground/50">
								user:email
							</code>{" "}
							scopes.
						</p>
						<div className="flex flex-col gap-1.5">
							<input
								type="password"
								value={patValue}
								onChange={(e) => {
									setPatValue(e.target.value);
									setPatError("");
								}}
								onKeyDown={(e) => {
									if (
										e.key === "Enter" &&
										!loading
									)
										handlePatSignIn();
								}}
								placeholder="ghp_..."
								className="w-full bg-transparent border border-foreground/15 rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/25 focus:outline-none focus:border-foreground/30 transition-colors font-mono"
							/>
							<a
								href="https://github.com/settings/tokens/new"
								target="_blank"
								className="ms-auto text-xs text-foreground/30 hover:text-muted-foreground focus-visible:text-foreground inline-flex items-center gap-1 transition-colors cursor-pointer"
							>
								<PlusIcon className="size-3.5" />
								Generate Token
							</a>
							{patError && (
								<p className="text-[11px] text-red-400 mt-1.5">
									{patError}
								</p>
							)}
						</div>
					</div>

					{/* PAT sign in button */}
					<button
						onClick={handlePatSignIn}
						disabled={loading || !patValue.trim()}
						className="w-full flex items-center justify-center gap-3 bg-foreground text-background font-medium py-3 px-6 rounded-md text-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
					>
						{loading ? (
							<LoadingSpinner className="w-4 h-4" />
						) : (
							<KeyIcon className="w-4 h-4" />
						)}
						{loading ? "Signing in..." : "Sign in with token"}
						{!loading && (
							<ArrowRightIcon className="w-3.5 h-3.5 ml-auto" />
						)}
					</button>
				</>
			)}

			{/* Mode toggle */}
			<button
				type="button"
				onClick={() => {
					setMode(mode === "oauth" ? "pat" : "oauth");
					setPatError("");
					setLoading(false);
				}}
				className="w-full text-center text-[11px] text-foreground/30 hover:text-foreground/50 transition-colors cursor-pointer"
			>
				{mode === "oauth"
					? "Or use a personal access token"
					: "Or continue with GitHub OAuth"}
			</button>
		</div>
	);
}
