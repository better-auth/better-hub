"use client";

import { Ghost } from "lucide-react";
import { cn } from "@/lib/utils";
import { useGlobalChat } from "@/components/shared/global-chat-provider";

function GhostIcon({ isWorking }: { isWorking: boolean }) {
	return (
		<div className="relative w-4 h-4">
			<Ghost
				className={cn(
					"w-4 h-4 absolute inset-0 transition-opacity duration-300",
					isWorking ? "opacity-30" : "opacity-100",
				)}
				strokeWidth={2}
			/>

			{!isWorking && (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					className="absolute inset-0 pointer-events-none"
				>
					<defs>
						<clipPath id="ghost-shimmer-clip">
							<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
						</clipPath>
						<linearGradient
							id="ghost-shimmer-grad"
							x1="0"
							y1="0"
							x2="1"
							y2="1"
						>
							<stop
								offset="0%"
								stopColor="currentColor"
								stopOpacity="0"
							/>
							<stop
								offset="42%"
								stopColor="currentColor"
								stopOpacity="0"
							/>
							<stop
								offset="50%"
								stopColor="currentColor"
								stopOpacity="0.35"
							/>
							<stop
								offset="58%"
								stopColor="currentColor"
								stopOpacity="0"
							/>
							<stop
								offset="100%"
								stopColor="currentColor"
								stopOpacity="0"
							/>
						</linearGradient>
					</defs>
					<g clipPath="url(#ghost-shimmer-clip)">
						<rect
							x="0"
							y="0"
							width="24"
							height="24"
							fill="url(#ghost-shimmer-grad)"
							className="ghost-shimmer"
						/>
					</g>
				</svg>
			)}

			{isWorking && (
				<svg
					xmlns="http://www.w3.org/2000/svg"
					width="16"
					height="16"
					viewBox="0 0 24 24"
					className="absolute inset-0"
				>
					<defs>
						<clipPath id="ghost-fill-clip">
							<path d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z" />
						</clipPath>
					</defs>
					<g clipPath="url(#ghost-fill-clip)">
						<rect
							x="0"
							y="0"
							width="24"
							height="24"
							className="fill-foreground ghost-fill-animation"
						/>
					</g>
					<path
						d="M9 10h.01M15 10h.01M12 2a8 8 0 0 0-8 8v12l3-3 2.5 2.5L12 19l2.5 2.5L17 19l3 3V10a8 8 0 0 0-8-8z"
						fill="none"
						stroke="currentColor"
						strokeWidth="2"
						strokeLinecap="round"
						strokeLinejoin="round"
						className="text-foreground"
					/>
				</svg>
			)}
		</div>
	);
}

export function NavbarGhostButton() {
	const { state, toggleChat } = useGlobalChat();

	return (
		<button
			type="button"
			onClick={toggleChat}
			className={cn(
				"relative flex items-center justify-center",
				"w-7 h-7 rounded-md",
				"text-muted-foreground/60 hover:text-foreground",
				"cursor-pointer transition-all duration-200",
				state.isOpen && "text-foreground",
			)}
			title="Ghost (⌘I)"
		>
			<GhostIcon isWorking={state.isWorking} />
		</button>
	);
}

export function FloatingGhostButton() {
	const { state, toggleChat } = useGlobalChat();

	return (
		<button
			type="button"
			onClick={toggleChat}
			className={cn(
				"fixed top-12 right-4 z-30",
				"flex items-center justify-center",
				"w-8 h-8 rounded-full",
				"border border-border/60 dark:border-white/8",
				"bg-background/80 backdrop-blur-sm",
				"shadow-sm hover:shadow-md",
				"text-muted-foreground/60 hover:text-foreground",
				"cursor-pointer transition-all duration-200",
				"hover:scale-105 active:scale-95",
				state.isOpen && "opacity-0 pointer-events-none",
			)}
			title="Ghost (⌘I)"
		>
			<GhostIcon isWorking={state.isWorking} />
			{state.isWorking && (
				<span className="absolute inset-0 rounded-full border border-foreground/20 animate-ping" />
			)}
		</button>
	);
}
