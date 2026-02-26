"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, Star } from "lucide-react";
import { formatHotkeyForDisplay } from "@/lib/format-hotkey";
import { cn } from "@/lib/utils";
import { useGlobalChatOptional } from "@/components/shared/global-chat-provider";
import { authClient } from "@/lib/auth-client";
import { starRepo } from "@/app/(app)/repos/actions";

interface OnboardingOverlayProps {
	userName: string;
	userAvatar: string;
	bio: string;
	company: string;
	location: string;
	publicRepos: number;
	followers: number;
	createdAt: string;
	onboardingDone: boolean;
	initialStarredAuth?: boolean;
	initialStarredHub?: boolean;
}

const GHOST_WELCOME_USER = "Hey Ghost! I just got here. What can you help me with?";

function getGhostWelcomeResponse() {
	const modK = formatHotkeyForDisplay("Mod+K");
	const modI = formatHotkeyForDisplay("Mod+I");
	const modSlash = formatHotkeyForDisplay("Mod+/");

	return `Hey! Welcome to Better Hub. I'm Ghost, your AI assistant. Here's what I can help with:

- **Review PRs and code** — I can summarize changes, spot issues, and help you understand diffs
- **Navigate repos** — ask me about any file, function, or piece of code
- **Triage issues** — I'll help you understand context and suggest next steps
- **Write and refine** — commit messages, PR descriptions, comments

**Three shortcuts to know:**
- **${modK}** — Command Center. Search repos, switch themes, navigate anywhere
- **${modI}** — Toggle me (Ghost) open or closed
- **${modSlash}** — Quick search across repos

**Things to try first:**
1. Open a repo and ask me about the code
2. Hit ${modK} and explore the Command Center
3. Hit ${modI} and try chatting with Ghost about any repo`;
}

export function OnboardingOverlay({
	userName,
	userAvatar,
	onboardingDone,
	initialStarredAuth = false,
	initialStarredHub = false,
}: OnboardingOverlayProps) {
	const [mounted, setMounted] = useState(false);
	const [visible, setVisible] = useState(false);
	const [exiting, setExiting] = useState(false);
	const [starredAuth, setStarredAuth] = useState(initialStarredAuth);
	const [starredHub, setStarredHub] = useState(initialStarredHub);
	const [isPending, startTransition] = useTransition();
	const globalChat = useGlobalChatOptional();
	const ghostOpenedRef = useRef(false);

	useEffect(() => {
		setMounted(true);
		if (typeof window !== "undefined") {
			const params = new URLSearchParams(window.location.search);
			const force = params.has("onboarding");
			if (!force && onboardingDone) return;
			const t = setTimeout(() => setVisible(true), 400);
			return () => clearTimeout(t);
		}
	}, [onboardingDone]);

	const markDone = useCallback(() => {
		authClient.updateUser({
			onboardingDone: true,
		});
	}, []);

	const dismiss = useCallback(() => {
		if (globalChat && !ghostOpenedRef.current) {
			ghostOpenedRef.current = true;
			globalChat.toggleChat();
			setTimeout(() => {
				window.dispatchEvent(
					new CustomEvent("ghost-welcome-inject", {
						detail: {
							userMessage: GHOST_WELCOME_USER,
							assistantMessage: getGhostWelcomeResponse(),
							simulateDelay: 1200,
						},
					}),
				);
			}, 500);
		}
		markDone();
		setExiting(true);
		setTimeout(() => {
			setVisible(false);
		}, 500);
	}, [globalChat, markDone]);

	const handleStarAuth = useCallback(() => {
		setStarredAuth(true);
		startTransition(async () => {
			await starRepo("better-auth", "better-auth");
		});
	}, []);

	const handleStarHub = useCallback(() => {
		setStarredHub(true);
		startTransition(async () => {
			await starRepo("better-auth", "better-hub");
		});
	}, []);

	// Enter/Escape to dismiss
	useEffect(() => {
		if (!visible) return;
		const handler = (e: KeyboardEvent) => {
			if (e.key === "Escape" || e.key === "Enter") {
				e.preventDefault();
				dismiss();
			}
		};
		document.addEventListener("keydown", handler);
		return () => document.removeEventListener("keydown", handler);
	}, [visible, dismiss]);

	if (!mounted || !visible) return null;

	const firstName = userName.split(" ")[0] || userName;

	return createPortal(
		<div
			className={cn(
				"fixed inset-0 z-[60] transition-all duration-500",
				exiting && "opacity-0 scale-[1.02] pointer-events-none",
			)}
		>
			<div className="absolute inset-0 bg-black overflow-hidden">
				{/* ── Gradient orbs ── */}
				<div className="absolute inset-0 overflow-hidden pointer-events-none">
					<div
						className="absolute rounded-full blur-[140px]"
						style={{
							width: 700,
							height: 700,
							background: "radial-gradient(circle, rgba(99,102,241,0.35), transparent 70%)",
							top: "-10%",
							left: "-15%",
							animation: "onboarding-orb-float-1 28s ease-in-out infinite",
							opacity: 0.045,
						}}
					/>
					<div
						className="absolute rounded-full blur-[120px]"
						style={{
							width: 550,
							height: 550,
							background: "radial-gradient(circle, rgba(168,85,247,0.3), transparent 70%)",
							bottom: "-5%",
							right: "-10%",
							animation: "onboarding-orb-float-2 34s ease-in-out infinite",
							opacity: 0.035,
						}}
					/>
					<div
						className="absolute rounded-full blur-[100px]"
						style={{
							width: 400,
							height: 400,
							background: "radial-gradient(circle, rgba(236,72,153,0.2), transparent 70%)",
							top: "40%",
							left: "50%",
							animation: "onboarding-orb-float-3 22s ease-in-out infinite",
							opacity: 0.03,
						}}
					/>
				</div>

				{/* ── Background video ── */}
				<video
					autoPlay
					muted
					loop
					playsInline
					className="absolute inset-0 w-full h-full object-cover opacity-[0.2] blur-sm"
					style={{ minWidth: "100%", minHeight: "100%" }}
				>
					<source src="/onboarding.mp4" type="video/mp4" />
				</video>

				{/* ── Halftone ── */}
				<div
					className="absolute inset-0 pointer-events-none opacity-[0.35]"
					style={{
						backgroundImage:
							"radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px), radial-gradient(circle, rgba(255,255,255,0.035) 0.5px, transparent 0.5px)",
						backgroundSize: "24px 24px, 12px 12px",
						backgroundPosition: "0 0, 6px 6px",
					}}
				/>

				{/* ── Film grain ── */}
				<div
					className="absolute pointer-events-none opacity-[0.025]"
					style={{
						inset: "-50%",
						width: "200%",
						height: "200%",
						backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.75' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
						animation: "onboarding-grain 8s steps(10) infinite",
					}}
				/>

				{/* ── Gradient overlays (darken edges, keep center visible) ── */}
				<div className="absolute inset-0 bg-black/40 pointer-events-none" />
				<div className="absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_30%,black_90%)] pointer-events-none" />

				{/* ── Content ── */}
				<div className="relative z-10 flex items-center justify-center w-full h-full px-6 sm:px-10">
					<div className="w-full max-w-md text-left ob-fade-up">
						<span>B.</span>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85]">
							Hey{firstName ? ` ${firstName}` : ""},
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d1">
							Welcome to Better Hub. At {""}
							<a
								href="https://better-auth.com"
								target="_blank"
								rel="noopener noreferrer"
								className="text-white/70 underline underline-offset-2 decoration-white/20 hover:text-white/90 transition-colors"
							>
								Better Auth
							</a>
							, we spend a lot of our time on GitHub, so
							we wanted to improve our own experience.
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/50 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d2">
							We&apos;re trying to improve everything from
							the home page experience to repo overview,
							PR reviews, and AI integration. Faster and
							more pleasant overall.
							<br />
							<br />
							On desktop, most things are accessible
							through keyboard shortcuts.{" "}
							<kbd className="text-[11px] px-1 py-0.5 rounded-sm font-mono text-white/40">
								{formatHotkeyForDisplay("Mod+K")}
							</kbd>{" "}
							opens the command center,{" "}
							<kbd className="text-[11px] px-1 py-0.5 rounded-sm font-mono text-white/40">
								{formatHotkeyForDisplay("Mod+I")}
							</kbd>{" "}
							opens Ghost, a super helpful AI assistant.
						</p>

						<p className="text-[13px] sm:text-[14px] text-white/40 leading-[1.8] sm:leading-[1.85] mt-4 ob-fade-up-d3">
							Hope you like it!
						</p>

						<div className="flex items-center gap-2.5 mt-4 ob-fade-up-d5">
							<button
								onClick={handleStarAuth}
								disabled={starredAuth || isPending}
								className={cn(
									"inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm text-[12px] font-medium transition-all duration-300 cursor-pointer",
									starredAuth
										? "bg-warning/20 text-warning border border-warning/30"
										: "bg-white/10 text-white/70 border border-white/15 hover:bg-white/15 hover:text-white",
									isPending &&
										!starredAuth &&
										"opacity-60 pointer-events-none",
								)}
							>
								<Star
									className={cn(
										"w-3.5 h-3.5",
										starredAuth &&
											"fill-current",
									)}
								/>
								{starredAuth
									? "Starred!"
									: "better-auth"}
							</button>
							<button
								onClick={handleStarHub}
								disabled={starredHub || isPending}
								className={cn(
									"inline-flex items-center gap-2 px-3.5 py-1.5 rounded-sm text-[12px] font-medium transition-all duration-300 cursor-pointer",
									starredHub
										? "bg-warning/20 text-warning border border-warning/30"
										: "bg-white/10 text-white/70 border border-white/15 hover:bg-white/15 hover:text-white",
									isPending &&
										!starredHub &&
										"opacity-60 pointer-events-none",
								)}
							>
								<Star
									className={cn(
										"w-3.5 h-3.5",
										starredHub &&
											"fill-current",
									)}
								/>
								{starredHub
									? "Starred!"
									: "better-hub"}
							</button>
						</div>

						<p className="text-[13px] sm:text-[14px] text-white/40 mt-5 ob-fade-up-d5">
							— Bereket
						</p>

						<button
							onClick={dismiss}
							className="group mt-7 inline-flex items-center gap-2.5 px-5 py-2 rounded-sm bg-white text-black text-[13px] font-medium hover:bg-white/90 transition-all duration-300 cursor-pointer ob-fade-up-d6"
						>
							Get started
							<ArrowRight className="w-3.5 h-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />
						</button>
					</div>
				</div>
			</div>
		</div>,
		document.body,
	);
}
