"use client";

import { signIn } from "@/lib/auth-client";
import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { SCOPE_GROUPS } from "@/lib/github-scopes";

/* ── Icons ── */

function GithubIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<path
				fill="currentColor"
				d="M12 2C6.477 2 2 6.477 2 12c0 4.42 2.865 8.166 6.839 9.489c.5.092.682-.217.682-.482c0-.237-.008-.866-.013-1.7c-2.782.603-3.369-1.342-3.369-1.342c-.454-1.155-1.11-1.462-1.11-1.462c-.908-.62.069-.608.069-.608c1.003.07 1.531 1.03 1.531 1.03c.892 1.529 2.341 1.087 2.91.832c.092-.647.35-1.088.636-1.338c-2.22-.253-4.555-1.11-4.555-4.943c0-1.091.39-1.984 1.029-2.683c-.103-.253-.446-1.27.098-2.647c0 0 .84-.269 2.75 1.025A9.578 9.578 0 0 1 12 6.836a9.59 9.59 0 0 1 2.504.337c1.909-1.294 2.747-1.025 2.747-1.025c.546 1.377.203 2.394.1 2.647c.64.699 1.028 1.592 1.028 2.683c0 3.842-2.339 4.687-4.566 4.935c.359.309.678.919.678 1.852c0 1.336-.012 2.415-.012 2.743c0 .267.18.578.688.48C19.138 20.163 22 16.418 22 12c0-5.523-4.477-10-10-10"
			/>
		</svg>
	);
}

function ArrowRightIcon({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<path
				fill="none"
				stroke="currentColor"
				strokeLinecap="round"
				strokeLinejoin="round"
				strokeWidth="2"
				d="M5 12h14m-7-7l7 7l-7 7"
			/>
		</svg>
	);
}

function LoadingSpinner({ className }: { className?: string }) {
	return (
		<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" className={className}>
			<g fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2">
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
	);
}

function CheckIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<polyline points="20 6 9 17 4 12" />
		</svg>
	);
}

function LockIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
			<path d="M7 11V7a5 5 0 0 1 10 0v4" />
		</svg>
	);
}

function InfoIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<circle cx="12" cy="12" r="10" />
			<path d="M12 16v-4" />
			<path d="M12 8h.01" />
		</svg>
	);
}

function KeyIcon({ className }: { className?: string }) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
		>
			<path d="m21 2-2 2m-7.61 7.61a5.5 5.5 0 1 1-7.778 7.778 5.5 5.5 0 0 1 7.777-7.777zm0 0L15.5 7.5m0 0 3 3L22 7l-3-3m-3.5 3.5L19 4" />
		</svg>
	);
}

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
			callbackURL: redirectTo || "/dashboard",
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
			router.push(redirectTo || "/dashboard");
		} catch {
			setPatError("Network error. Please try again.");
			setLoading(false);
		}
	}

	return (
		<div className="space-y-4">
			{mode === "oauth" ? (
				<>
					{/* Scope picker — compact wrapped pills */}
					<div>
						<p className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-1.5">
							Permissions
						</p>
						<p className="text-[11px] text-foreground/30 mb-2.5">
							Click to toggle optional permissions. Hover the{" "}
							<InfoIcon className="inline w-3 h-3 -mt-px" /> to learn why
							each is needed.
						</p>
						<div className="flex flex-wrap gap-1.5">
							{SCOPE_GROUPS.map((group) => {
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
												toggle(group.id)
											}
											disabled={group.required}
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
											{group.label}
										</button>
										<InfoPopover text={group.reason}>
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
							})}
						</div>
					</div>

					{/* OAuth sign in button */}
					<button
						onClick={handleOAuthSignIn}
						disabled={loading}
						className="w-full flex items-center justify-center gap-3 bg-foreground text-background font-medium py-3 px-6 rounded-md text-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed"
					>
						{loading ? (
							<LoadingSpinner className="w-4 h-4" />
						) : (
							<GithubIcon className="w-4 h-4" />
						)}
						{loading ? "Redirecting..." : "Continue with GitHub"}
						{!loading && <ArrowRightIcon className="w-3.5 h-3.5 ml-auto" />}
					</button>
				</>
			) : (
				<>
					{/* PAT input */}
					<div>
						<p className="text-[11px] font-mono uppercase tracking-wider text-foreground/40 mb-1.5">
							Personal Access Token
						</p>
						<p className="text-[11px] text-foreground/30 mb-2.5">
							Paste a GitHub PAT with at least <code className="font-mono text-foreground/50">read:user</code> and{" "}
							<code className="font-mono text-foreground/50">user:email</code> scopes.
						</p>
						<input
							type="password"
							value={patValue}
							onChange={(e) => {
								setPatValue(e.target.value);
								setPatError("");
							}}
							onKeyDown={(e) => {
								if (e.key === "Enter" && !loading) handlePatSignIn();
							}}
							placeholder="ghp_..."
							className="w-full bg-transparent border border-foreground/15 rounded-md px-3 py-2.5 text-sm text-foreground placeholder:text-foreground/25 focus:outline-none focus:border-foreground/30 transition-colors font-mono"
						/>
						{patError && (
							<p className="text-[11px] text-red-400 mt-1.5">{patError}</p>
						)}
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
						{!loading && <ArrowRightIcon className="w-3.5 h-3.5 ml-auto" />}
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
