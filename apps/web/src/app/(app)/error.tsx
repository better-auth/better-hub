"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
	Gauge,
	RefreshCw,
	Github,
	Clock,
	Zap,
	ShieldAlert,
	ExternalLink,
	Key,
	LogOut,
	Loader2,
	Check,
	ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "@/lib/auth-client";

function parseRateLimitFromDigest(message: string) {
	// The error message is serialized by Next.js, try to detect rate limit
	if (
		message.toLowerCase().includes("rate limit") ||
		message.toLowerCase().includes("ratelimit")
	) {
		return true;
	}
	return false;
}

function parseOAuthRestriction(error: Error & { digest?: string }): string | null {
	// Check digest first (works in production where error.message is stripped)
	const digest = error.digest ?? "";
	if (digest.startsWith("GITHUB_OAUTH_RESTRICTED:")) {
		return digest.split(":")[1] || "this organization";
	}
	// Fallback: check message (works in development)
	if (error.message.includes("OAuth App access restrictions")) {
		const match = error.message.match(/The (\S+) organization/i);
		return match?.[1] ?? "this organization";
	}
	return null;
}

function useCountdown(resetAt: number) {
	const [remaining, setRemaining] = useState(() =>
		Math.max(0, resetAt - Math.floor(Date.now() / 1000)),
	);

	useEffect(() => {
		if (remaining <= 0) return;
		const interval = setInterval(() => {
			const next = Math.max(0, resetAt - Math.floor(Date.now() / 1000));
			setRemaining(next);
			if (next <= 0) clearInterval(interval);
		}, 1000);
		return () => clearInterval(interval);
	}, [resetAt, remaining]);

	return remaining;
}

function formatTime(seconds: number) {
	const m = Math.floor(seconds / 60);
	const s = seconds % 60;
	return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function OAuthRestrictedUI({ org, reset }: { org: string; reset: () => void }) {
	return (
		<div className="flex flex-col items-center justify-center flex-1 px-4">
			<div className="w-full max-w-md space-y-6 text-center">
				<div className="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mx-auto">
					<ShieldAlert className="w-6 h-6 text-amber-400" />
				</div>
				<div className="space-y-2">
					<h1 className="text-lg font-medium tracking-tight">
						Access Restricted
					</h1>
					<p className="text-sm text-muted-foreground/60 leading-relaxed">
						The{" "}
						<span className="font-medium text-foreground">
							{org}
						</span>{" "}
						organization has enabled OAuth App access
						restrictions. To view this content, an organization
						admin needs to approve this app, or you can view it
						directly on GitHub.
					</p>
				</div>
				<div className="flex items-center justify-center gap-3">
					<button
						onClick={reset}
						className="flex items-center gap-2 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/40 dark:hover:bg-white/3 transition-colors cursor-pointer"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						Try again
					</button>
					<a
						href="https://docs.github.com/en/organizations/managing-oauth-access-to-your-organizations-data/approving-oauth-apps-for-your-organization"
						target="_blank"
						rel="noopener noreferrer"
						className="flex items-center gap-2 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/40 dark:hover:bg-white/3 transition-colors"
					>
						<ExternalLink className="w-3.5 h-3.5" />
						Learn more
					</a>
				</div>
			</div>
		</div>
	);
}

function RateLimitUI({ reset }: { reset: () => void }) {
	const router = useRouter();
	const [resetAt, setResetAt] = useState(() => Math.floor(Date.now() / 1000) + 3600);
	const [totalWait, setTotalWait] = useState(3600);
	const [rateLimitInfo, setRateLimitInfo] = useState<{ limit: number; used: number } | null>(
		null,
	);
	const [patValue, setPatValue] = useState("");
	const [patLoading, setPatLoading] = useState(false);
	const [patError, setPatError] = useState("");
	const [patSuccess, setPatSuccess] = useState(false);
	const [signingOut, setSigningOut] = useState(false);

	useEffect(() => {
		fetch("/api/rate-limit")
			.then((res) => (res.ok ? res.json() : null))
			.then((data) => {
				if (data?.resetAt) {
					const now = Math.floor(Date.now() / 1000);
					setResetAt(data.resetAt);
					setTotalWait(Math.max(1, data.resetAt - now));
					setRateLimitInfo({ limit: data.limit, used: data.used });
				}
			})
			.catch(() => {});
	}, []);

	const remaining = useCountdown(resetAt);
	const progress = Math.max(0, Math.min(100, ((totalWait - remaining) / totalWait) * 100));

	const totalSegments = 30;
	const filledSegments = Math.round((progress / 100) * totalSegments);

	const handlePatSignIn = async () => {
		const trimmed = patValue.trim();
		if (!trimmed) {
			setPatError("Please enter a token");
			return;
		}
		setPatLoading(true);
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
				setPatLoading(false);
				return;
			}
			setPatSuccess(true);
			setTimeout(() => {
				router.refresh();
				reset();
			}, 500);
		} catch {
			setPatError("Network error. Please try again.");
			setPatLoading(false);
		}
	};

	const handleSignOut = async () => {
		setSigningOut(true);
		await signOut({ fetchOptions: { onSuccess: () => router.push("/") } });
	};

	return (
		<div className="flex flex-col items-center justify-center flex-1 px-4">
			<div className="w-full max-w-md space-y-8">
				{/* Icon */}
				<div className="flex justify-center">
					<div className="relative">
						<div className="w-16 h-16 rounded-2xl bg-amber-500/10 flex items-center justify-center">
							<Gauge className="w-8 h-8 text-amber-400" />
						</div>
						<div className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center">
							<Zap className="w-3 h-3 text-red-400" />
						</div>
					</div>
				</div>

				{/* Title */}
				<div className="text-center space-y-2">
					<h1 className="text-lg font-medium tracking-tight">
						Rate limit reached
					</h1>
					<p className="text-sm text-muted-foreground/60">
						GitHub API requests exhausted. The limit resets
						automatically, or you can sign in with a Personal
						Access Token for a higher limit.
					</p>
				</div>

				{/* Progress bar */}
				<div className="space-y-3">
					<div className="flex items-center justify-between text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
						<span>Recovering</span>
						<span>{Math.round(progress)}%</span>
					</div>
					<div className="flex gap-[2px]">
						{Array.from({ length: totalSegments }).map(
							(_, i) => (
								<div
									key={i}
									className={cn(
										"h-2 flex-1 rounded-[1px] transition-colors duration-500",
										i < filledSegments
											? "bg-amber-400/60"
											: "bg-muted-foreground/10",
									)}
								/>
							),
						)}
					</div>
				</div>

				{/* Countdown */}
				<div className="flex items-center justify-center gap-6">
					<div className="text-center">
						<div className="flex items-center gap-1.5 text-muted-foreground mb-1">
							<Clock className="w-3 h-3" />
							<span className="text-[10px] font-mono uppercase tracking-wider">
								Resets in
							</span>
						</div>
						<span className="text-2xl font-mono tabular-nums text-foreground/80">
							{formatTime(remaining)}
						</span>
					</div>
				</div>

				{/* Info card */}
				<div className="border border-border/40 rounded-lg p-4 space-y-3">
					<div className="flex items-center gap-2">
						<Github className="w-3.5 h-3.5 text-muted-foreground" />
						<span className="text-[11px] font-mono text-muted-foreground/60">
							GitHub API &middot;{" "}
							{rateLimitInfo
								? `${rateLimitInfo.used.toLocaleString()} / ${rateLimitInfo.limit.toLocaleString()} used`
								: "5,000 requests/hour"}
						</span>
					</div>
					<p className="text-xs text-muted-foreground leading-relaxed">
						Cached data may still be available. Try navigating
						to a page you&apos;ve visited before, or wait for
						the limit to reset.
					</p>
				</div>

				{/* PAT sign-in card */}
				<div className="border border-border/40 rounded-lg p-4 space-y-3">
					<div className="flex items-center gap-2">
						<Key className="w-3.5 h-3.5 text-muted-foreground" />
						<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
							Sign in with a PAT
						</span>
					</div>
					<p className="text-xs text-muted-foreground/60 leading-relaxed">
						A Personal Access Token gives you a separate rate
						limit of 5,000 requests/hour. Paste one below to
						continue immediately.
					</p>
					<div className="space-y-2">
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
									!patLoading
								)
									handlePatSignIn();
							}}
							placeholder="ghp_..."
							disabled={patSuccess}
							className="w-full bg-transparent border border-border px-3 py-2 text-sm font-mono placeholder:text-muted-foreground/30 focus:outline-none focus:border-foreground/20 focus:ring-[3px] focus:ring-ring/50 transition-colors rounded-md disabled:opacity-50"
						/>
						{patError && (
							<p className="text-[11px] text-red-400">
								{patError}
							</p>
						)}
						<div className="flex items-center gap-2">
							<button
								onClick={handlePatSignIn}
								disabled={
									patLoading ||
									patSuccess ||
									!patValue.trim()
								}
								className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium bg-foreground text-background rounded-md hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
							>
								{patSuccess ? (
									<Check className="w-3.5 h-3.5" />
								) : patLoading ? (
									<Loader2 className="w-3.5 h-3.5 animate-spin" />
								) : (
									<ArrowRight className="w-3.5 h-3.5" />
								)}
								{patSuccess
									? "Signed in"
									: patLoading
										? "Signing in..."
										: "Sign in"}
							</button>
							<a
								href="https://github.com/settings/tokens/new?scopes=repo,read:user,user:email,read:org,notifications&description=Better+GitHub"
								target="_blank"
								rel="noopener noreferrer"
								className="text-[11px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
							>
								Generate a token
							</a>
						</div>
					</div>
				</div>

				{/* Actions row */}
				<div className="flex items-center justify-center gap-3">
					<button
						onClick={reset}
						className="flex items-center gap-2 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/40 dark:hover:bg-white/3 transition-colors cursor-pointer"
					>
						<RefreshCw className="w-3.5 h-3.5" />
						Try again
					</button>
					<button
						onClick={handleSignOut}
						disabled={signingOut}
						className="flex items-center gap-2 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/40 dark:hover:bg-white/3 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{signingOut ? (
							<Loader2 className="w-3.5 h-3.5 animate-spin" />
						) : (
							<LogOut className="w-3.5 h-3.5" />
						)}
						Sign out
					</button>
				</div>
			</div>
		</div>
	);
}

function GenericErrorUI({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	return (
		<div className="flex flex-col items-center justify-center flex-1 px-4">
			<div className="w-full max-w-md space-y-6 text-center">
				<div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mx-auto">
					<Zap className="w-6 h-6 text-red-400" />
				</div>
				<div className="space-y-2">
					<h1 className="text-lg font-medium tracking-tight">
						Something went wrong
					</h1>
					<p className="text-sm text-muted-foreground/60">
						{error.message || "An unexpected error occurred."}
					</p>
				</div>
				{error.digest && (
					<p className="text-[10px] font-mono text-muted-foreground/30">
						Digest: {error.digest}
					</p>
				)}
				<button
					onClick={reset}
					className="flex items-center gap-2 px-4 py-2 text-xs font-medium border border-border rounded-lg hover:bg-muted/40 dark:hover:bg-white/3 transition-colors cursor-pointer mx-auto"
				>
					<RefreshCw className="w-3.5 h-3.5" />
					Try again
				</button>
			</div>
		</div>
	);
}

export default function ErrorPage({
	error,
	reset,
}: {
	error: Error & { digest?: string };
	reset: () => void;
}) {
	const isRateLimit =
		error.name === "GitHubRateLimitError" ||
		parseRateLimitFromDigest(error.message) ||
		parseRateLimitFromDigest(error.digest ?? "");

	if (isRateLimit) {
		return <RateLimitUI reset={reset} />;
	}

	const oauthOrg = parseOAuthRestriction(error);
	if (oauthOrg) {
		return <OAuthRestrictedUI org={oauthOrg} reset={reset} />;
	}

	return <GenericErrorUI error={error} reset={reset} />;
}
