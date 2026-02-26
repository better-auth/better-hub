import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	if (typeof error === "string") return error;
	return "An unknown error occurred";
}

export function getErrorStatus(error: unknown): number | undefined {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		typeof (error as { status: unknown }).status === "number"
	) {
		return (error as { status: number }).status;
	}
	return undefined;
}

export function formatNumber(num: number): string {
	if (num >= 1000000) return `${(num / 1000000).toFixed(1)}m`;
	if (num >= 1000) return `${(num / 1000).toFixed(1)}k`;
	return num.toString();
}

export function timeAgo(date: string | Date): string {
	const now = new Date();
	const then = new Date(date);
	const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

	if (seconds < 60) return "just now";
	if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
	if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
	if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
	if (seconds < 2592000) return `${Math.floor(seconds / 604800)}w ago`;

	const months = Math.floor(seconds / 2592000);
	if (months < 12) return `${months}mo ago`;

	const sameYear = then.getFullYear() === now.getFullYear();
	if (sameYear) {
		return then.toLocaleDateString("en-US", { month: "short", day: "numeric" });
	}
	return then.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
	});
}

export function formatDuration(startedAt: string | null, completedAt: string | null): string {
	if (!startedAt) return "";
	const start = new Date(startedAt);
	const end = completedAt ? new Date(completedAt) : new Date();
	const totalSeconds = Math.max(0, Math.floor((end.getTime() - start.getTime()) / 1000));
	const hours = Math.floor(totalSeconds / 3600);
	const minutes = Math.floor((totalSeconds % 3600) / 60);
	const seconds = totalSeconds % 60;
	if (hours > 0) return `${hours}h ${minutes}m`;
	if (minutes > 0) return `${minutes}m ${seconds}s`;
	return `${seconds}s`;
}

export function calculateDuration(
	startedAt: string | null | undefined,
	completedAt: string | null | undefined,
): number {
	if (!startedAt || !completedAt) return 0;
	return Math.max(
		0,
		Math.floor(
			(new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000,
		),
	);
}

/**
 * Validates a redirect URL to prevent open redirect attacks.
 * Only allows relative paths on the same origin. Returns the
 * fallback for any absolute URL, protocol-relative URL, or
 * path that doesn't start with "/".
 */
export function safeRedirect(url: string | undefined, fallback = "/dashboard"): string {
	if (!url) return fallback;
	const trimmed = url.trim();
	if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) {
		return fallback;
	}
	return trimmed;
}

export function formatDurationDelta(deltaSeconds: number): { text: string; className: string } {
	if (deltaSeconds === 0) return { text: "", className: "" };
	const abs = Math.abs(deltaSeconds);
	const hours = Math.floor(abs / 3600);
	const minutes = Math.floor((abs % 3600) / 60);
	const seconds = abs % 60;
	let formatted: string;
	if (hours > 0) formatted = `${hours}h ${minutes}m`;
	else if (minutes > 0) formatted = `${minutes}m ${seconds}s`;
	else formatted = `${seconds}s`;

	if (deltaSeconds < 0) {
		return { text: `(-${formatted})`, className: "text-success" };
	}
	return { text: `(+${formatted})`, className: "text-destructive" };
}
