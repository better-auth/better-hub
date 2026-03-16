"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSearchParams } from "next/navigation";
import { authClient, useSession } from "@/lib/auth-client";
import { LoadingSpinner } from "@/components/shared/icons/loading-spinner";
import { cn } from "@/lib/utils";
import { CheckCircle2, Monitor, ShieldAlert, XCircle } from "lucide-react";

type Phase = "enter-code" | "approve" | "success" | "denied" | "error";

const LOGO_SVG_PATH =
	"M25.3906 16.25C25.3908 14.8872 24.9992 13.5531 24.2627 12.4066C23.5261 11.26 22.4755 10.3494 21.236 9.78298C19.9965 9.21661 18.6203 9.01841 17.2714 9.21199C15.9224 9.40557 14.6576 9.98277 13.6274 10.8749C12.5972 11.7669 11.8451 12.9363 11.4606 14.2437C11.0762 15.5512 11.0756 16.9415 11.459 18.2492C11.8424 19.557 12.5935 20.727 13.623 21.6199C14.6524 22.5128 15.9169 23.091 17.2656 23.2857V41.7142C15.4867 41.971 13.871 42.8921 12.7438 44.2921C11.6165 45.6921 11.0614 47.467 11.1901 49.2598C11.3189 51.0526 12.1218 52.7301 13.4375 53.9547C14.7532 55.1793 16.4839 55.8601 18.2813 55.8601C20.0787 55.8601 21.8093 55.1793 23.125 53.9547C24.4407 52.7301 25.2437 51.0526 25.3724 49.2598C25.5011 47.467 24.946 45.6921 23.8188 44.2921C22.6915 42.8921 21.0758 41.971 19.2969 41.7142V23.2857C20.9888 23.0415 22.5361 22.1959 23.6552 20.9037C24.7744 19.6116 25.3905 17.9594 25.3906 16.25ZM13.2031 16.25C13.2031 15.2456 13.501 14.2638 14.059 13.4287C14.6169 12.5936 15.41 11.9428 16.3379 11.5584C17.2659 11.1741 18.2869 11.0735 19.272 11.2694C20.257 11.4654 21.1619 11.949 21.872 12.6592C22.5822 13.3694 23.0659 14.2742 23.2618 15.2593C23.4578 16.2444 23.3572 17.2654 22.9728 18.1933C22.5885 19.1212 21.9376 19.9143 21.1025 20.4723C20.2674 21.0303 19.2856 21.3281 18.2813 21.3281C16.9345 21.3281 15.6428 20.7931 14.6905 19.8408C13.7382 18.8884 13.2031 17.5968 13.2031 16.25ZM23.3594 48.75C23.3594 49.7543 23.0616 50.7362 22.5036 51.5712C21.9456 52.4063 21.1525 53.0572 20.2246 53.4416C19.2967 53.8259 18.2756 53.9265 17.2906 53.7305C16.3055 53.5346 15.4007 53.051 14.6905 52.3408C13.9803 51.6306 13.4967 50.7257 13.3007 49.7407C13.1048 48.7556 13.2053 47.7346 13.5897 46.8067C13.974 45.8788 14.6249 45.0857 15.46 44.5277C16.2951 43.9697 17.2769 43.6719 18.2813 43.6719C18.9481 43.6719 19.6085 43.8032 20.2246 44.0584C20.8407 44.3136 21.4005 44.6877 21.872 45.1592C22.3436 45.6308 22.7176 46.1906 22.9728 46.8067C23.228 47.4228 23.3594 48.0831 23.3594 48.75ZM51.7969 41.7142V28.0896C51.7985 27.4222 51.6678 26.761 51.4124 26.1444C51.157 25.5277 50.782 24.9678 50.309 24.4969L39.0152 13.2031H48.75C49.0194 13.2031 49.2777 13.0961 49.4682 12.9056C49.6586 12.7152 49.7656 12.4568 49.7656 12.1875C49.7656 11.9181 49.6586 11.6598 49.4682 11.4693C49.2777 11.2789 49.0194 11.1719 48.75 11.1719H36.5625C36.2932 11.1719 36.0348 11.2789 35.8444 11.4693C35.6539 11.6598 35.5469 11.9181 35.5469 12.1875V24.375C35.5469 24.6443 35.6539 24.9027 35.8444 25.0931C36.0348 25.2836 36.2932 25.3906 36.5625 25.3906C36.8319 25.3906 37.0902 25.2836 37.2807 25.0931C37.4711 24.9027 37.5781 24.6443 37.5781 24.375V14.6402L48.8744 25.934C49.1573 26.2171 49.3816 26.5533 49.5345 26.9231C49.6874 27.293 49.766 27.6894 49.7656 28.0896V41.7142C47.9867 41.971 46.371 42.8921 45.2438 44.2921C44.1165 45.6921 43.5614 47.467 43.6901 49.2598C43.8189 51.0526 44.6219 52.7301 45.9375 53.9547C47.2532 55.1793 48.9839 55.8601 50.7813 55.8601C52.5787 55.8601 54.3093 55.1793 55.625 53.9547C56.9407 52.7301 57.7437 51.0526 57.8724 49.2598C58.0011 47.467 57.446 45.6921 56.3187 44.2921C55.1915 42.8921 53.5758 41.971 51.7969 41.7142ZM50.7813 53.8281C49.7769 53.8281 48.7951 53.5303 47.96 52.9723C47.1249 52.4143 46.474 51.6212 46.0897 50.6933C45.7053 49.7654 45.6048 48.7444 45.8007 47.7593C45.9967 46.7742 46.4803 45.8694 47.1905 45.1592C47.9007 44.449 48.8055 43.9654 49.7906 43.7694C50.7756 43.5735 51.7967 43.6741 52.7246 44.0584C53.6525 44.4428 54.4456 45.0936 55.0036 45.9287C55.5616 46.7638 55.8594 47.7456 55.8594 48.75C55.8594 50.0968 55.3244 51.3884 54.372 52.3408C53.4197 53.2931 52.1281 53.8281 50.7813 53.8281Z";

export default function DeviceAuthorizationPage() {
	const searchParams = useSearchParams();
	const { data: session, isPending: sessionLoading } = useSession();

	const [phase, setPhase] = useState<Phase>("enter-code");
	const [userCode, setUserCode] = useState("");
	const [verifying, setVerifying] = useState(false);
	const [processing, setProcessing] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const inputRef = useRef<HTMLInputElement>(null);

	const urlCode = searchParams.get("user_code");

	useEffect(() => {
		if (urlCode) {
			setUserCode(urlCode.trim().replace(/-/g, "").toUpperCase());
		}
	}, [urlCode]);

	useEffect(() => {
		if (phase === "enter-code" && !urlCode) {
			inputRef.current?.focus();
		}
	}, [phase, urlCode]);

	const verifyCode = useCallback(async (code: string) => {
		setVerifying(true);
		setError(null);
		try {
			const formatted = code.trim().replace(/-/g, "").toUpperCase();
			const response = await authClient.device({
				query: { user_code: formatted },
			});
			if (response.data) {
				setUserCode(formatted);
				setPhase("approve");
			} else {
				setError("Invalid or expired code. Please check and try again.");
			}
		} catch {
			setError("Invalid or expired code. Please check and try again.");
		} finally {
			setVerifying(false);
		}
	}, []);

	// Auto-verify if code comes from URL and user is authenticated
	const autoVerified = useRef(false);
	useEffect(() => {
		if (urlCode && session && !autoVerified.current && phase === "enter-code") {
			autoVerified.current = true;
			verifyCode(urlCode);
		}
	}, [urlCode, session, phase, verifyCode]);

	function handleSubmitCode(e: React.FormEvent) {
		e.preventDefault();
		if (!userCode.trim() || verifying) return;
		verifyCode(userCode);
	}

	async function handleApprove() {
		setProcessing(true);
		setError(null);
		try {
			await authClient.device.approve({ userCode });
			setPhase("success");
		} catch {
			setError("Failed to approve. The code may have expired.");
			setProcessing(false);
		}
	}

	async function handleDeny() {
		setProcessing(true);
		setError(null);
		try {
			await authClient.device.deny({ userCode });
			setPhase("denied");
		} catch {
			setError("Failed to deny. The code may have expired.");
			setProcessing(false);
		}
	}

	function formatDisplayCode(code: string): string {
		const clean = code.replace(/-/g, "").toUpperCase();
		if (clean.length === 8) return `${clean.slice(0, 4)}-${clean.slice(4)}`;
		return clean;
	}

	if (sessionLoading) {
		return (
			<Shell>
				<LoadingSpinner className="w-6 h-6 text-foreground/40" />
			</Shell>
		);
	}

	if (!session) {
		const returnUrl = urlCode
			? `/device?user_code=${encodeURIComponent(urlCode)}`
			: "/device";
		return (
			<Shell>
				<div className="flex flex-col items-center gap-4">
					<div className="size-12 rounded-xl bg-foreground/5 border border-foreground/10 flex items-center justify-center">
						<Monitor className="size-6 text-foreground/60" />
					</div>
					<div className="text-center">
						<h1 className="text-xl font-medium text-foreground tracking-tight">
							Device Authorization
						</h1>
						<p className="text-sm text-foreground/50 mt-2 max-w-xs">
							Sign in to your account to authorize a
							device.
						</p>
					</div>
					<a
						href={`/?redirect=${encodeURIComponent(returnUrl)}`}
						className="mt-2 w-full flex items-center justify-center gap-2 bg-foreground text-black dark:text-black font-medium py-2.5 px-6 rounded-md text-sm hover:bg-foreground/90 transition-colors"
					>
						Sign in to continue
					</a>
				</div>
			</Shell>
		);
	}

	return (
		<Shell>
			{phase === "enter-code" && (
				<form
					onSubmit={handleSubmitCode}
					className="flex flex-col items-center gap-5"
				>
					<div className="size-12 rounded-xl bg-foreground/5 border border-foreground/10 flex items-center justify-center">
						<Monitor className="size-6 text-foreground/60" />
					</div>
					<div className="text-center">
						<h1 className="text-xl font-medium text-foreground tracking-tight">
							Authorize Device
						</h1>
						<p className="text-sm text-foreground/50 mt-2 max-w-xs">
							Enter the code shown on your device to grant
							access.
						</p>
					</div>
					<input
						ref={inputRef}
						type="text"
						value={userCode}
						onChange={(e) => {
							setUserCode(
								e.target.value
									.toUpperCase()
									.replace(/[^A-Z0-9]/g, ""),
							);
							setError(null);
						}}
						placeholder="ABCD1234"
						maxLength={8}
						spellCheck={false}
						autoComplete="off"
						className="w-full max-w-[220px] text-center tracking-[0.3em] font-mono text-2xl font-semibold bg-transparent border border-foreground/15 rounded-lg px-4 py-3 text-foreground placeholder:text-foreground/20 focus:outline-none focus:border-foreground/40 focus:ring-1 focus:ring-foreground/20 transition-all"
					/>
					{error && <p className="text-sm text-red-400">{error}</p>}
					<button
						type="submit"
						disabled={userCode.length < 8 || verifying}
						className="w-full flex items-center justify-center gap-2 bg-foreground text-black dark:text-black font-medium py-2.5 px-6 rounded-md text-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
					>
						{verifying ? (
							<>
								<LoadingSpinner className="w-4 h-4" />
								Verifying...
							</>
						) : (
							"Continue"
						)}
					</button>
				</form>
			)}

			{phase === "approve" && (
				<div className="flex flex-col items-center gap-5">
					<div className="size-12 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
						<ShieldAlert className="size-6 text-amber-400" />
					</div>
					<div className="text-center">
						<h1 className="text-xl font-medium text-foreground tracking-tight">
							Confirm Authorization
						</h1>
						<p className="text-sm text-foreground/50 mt-2 max-w-xs">
							A device is requesting access to your
							account.
						</p>
					</div>
					<div className="w-full rounded-lg border border-foreground/10 bg-foreground/[0.03] px-4 py-3">
						<div className="flex items-center justify-between">
							<span className="text-xs text-foreground/40 uppercase tracking-wider">
								Device Code
							</span>
							<span className="font-mono text-lg font-semibold tracking-widest text-foreground">
								{formatDisplayCode(userCode)}
							</span>
						</div>
						<div className="mt-2 flex items-center justify-between">
							<span className="text-xs text-foreground/40 uppercase tracking-wider">
								Account
							</span>
							<span className="text-sm text-foreground/70">
								{session.user.name ||
									session.user.email}
							</span>
						</div>
					</div>
					{error && <p className="text-sm text-red-400">{error}</p>}
					<div className="w-full flex gap-3">
						<button
							type="button"
							onClick={handleDeny}
							disabled={processing}
							className="flex-1 flex items-center justify-center gap-2 border border-foreground/15 bg-transparent text-foreground/70 font-medium py-2.5 px-4 rounded-md text-sm hover:bg-foreground/5 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
						>
							Deny
						</button>
						<button
							type="button"
							onClick={handleApprove}
							disabled={processing}
							className="flex-1 flex items-center justify-center gap-2 bg-foreground text-black dark:text-black font-medium py-2.5 px-4 rounded-md text-sm hover:bg-foreground/90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
						>
							{processing ? (
								<>
									<LoadingSpinner className="w-4 h-4" />
									Processing...
								</>
							) : (
								"Approve"
							)}
						</button>
					</div>
				</div>
			)}

			{phase === "success" && (
				<div className="flex flex-col items-center gap-4 text-center">
					<div className="size-12 rounded-xl bg-green-500/10 border border-green-500/20 flex items-center justify-center">
						<CheckCircle2 className="size-6 text-green-400" />
					</div>
					<div>
						<h1 className="text-xl font-medium text-foreground tracking-tight">
							Device Authorized
						</h1>
						<p className="text-sm text-foreground/50 mt-2 max-w-xs">
							The device has been granted access. You can
							close this tab and return to your terminal.
						</p>
					</div>
				</div>
			)}

			{phase === "denied" && (
				<div className="flex flex-col items-center gap-4 text-center">
					<div className="size-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
						<XCircle className="size-6 text-red-400" />
					</div>
					<div>
						<h1 className="text-xl font-medium text-foreground tracking-tight">
							Authorization Denied
						</h1>
						<p className="text-sm text-foreground/50 mt-2 max-w-xs">
							The device was not granted access. You can
							close this tab.
						</p>
					</div>
				</div>
			)}

			{phase === "error" && (
				<div className="flex flex-col items-center gap-4 text-center">
					<div className="size-12 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
						<XCircle className="size-6 text-red-400" />
					</div>
					<div>
						<h1 className="text-xl font-medium text-foreground tracking-tight">
							Something went wrong
						</h1>
						<p className="text-sm text-foreground/50 mt-2 max-w-xs">
							{error ?? "An unexpected error occurred."}
						</p>
					</div>
					<button
						type="button"
						onClick={() => {
							setPhase("enter-code");
							setError(null);
							setUserCode("");
						}}
						className="text-sm text-foreground/50 hover:text-foreground transition-colors cursor-pointer underline underline-offset-4"
					>
						Try again
					</button>
				</div>
			)}
		</Shell>
	);
}

function Shell({ children }: { children: React.ReactNode }) {
	return (
		<div
			className="min-h-screen bg-background flex flex-col items-center justify-center px-4"
			style={
				{
					"--background": "var(--background, #030304)",
				} as React.CSSProperties
			}
		>
			{/* Logo */}
			<div className="absolute top-6 left-4 flex items-center gap-1">
				<svg
					className="size-5"
					viewBox="0 0 65 65"
					fill="none"
					xmlns="http://www.w3.org/2000/svg"
				>
					<path
						d={LOGO_SVG_PATH}
						fill="currentColor"
						className="text-foreground/80"
					/>
				</svg>
				<span className="text-sm tracking-tight text-foreground/80">
					BETTER-HUB.
				</span>
			</div>

			<div className={cn("w-full max-w-sm")}>{children}</div>
		</div>
	);
}
