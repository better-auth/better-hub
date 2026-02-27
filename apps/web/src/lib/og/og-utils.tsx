import { readFile } from "node:fs/promises";
import { join } from "node:path";

// ── Brand constants (matching globals.css dark theme) ──

export const OG = {
	bg: "#030304",
	fg: "#fafafa",
	muted: "#a1a1aa",
	border: "#27272a",
	card: "#111113",
	link: "#58a6ff",
	green: "#3fb950",
	red: "#f85149",
	purple: "#a371f7",
	amber: "#d29922",
	width: 1200,
	height: 630,
} as const;

export function stateColor(state: string): string {
	switch (state) {
		case "open":
			return OG.green;
		case "closed":
			return OG.red;
		case "merged":
			return OG.purple;
		default:
			return OG.muted;
	}
}

// ── Font loading (cached at module level) ──

let _geistSans: ArrayBuffer | null = null;
let _geistMono: ArrayBuffer | null = null;

async function loadFont(name: string): Promise<ArrayBuffer> {
	const path = join(process.cwd(), "public", "fonts", name);
	const buf = await readFile(path);
	return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}

export async function getGeistSans(): Promise<ArrayBuffer> {
	if (!_geistSans) _geistSans = await loadFont("GeistSans-Regular.ttf");
	return _geistSans;
}

export async function getGeistMono(): Promise<ArrayBuffer> {
	if (!_geistMono) _geistMono = await loadFont("GeistMono-Regular.ttf");
	return _geistMono;
}

export async function ogFonts() {
	const [sans, mono] = await Promise.all([getGeistSans(), getGeistMono()]);
	return [
		{ name: "Geist Sans", data: sans, style: "normal" as const, weight: 400 as const },
		{ name: "Geist Mono", data: mono, style: "normal" as const, weight: 400 as const },
	];
}

// ── Reusable JSX helpers (Satori-compatible, flexbox only) ──

export function OGFrame({ children }: { children: React.ReactNode }) {
	return (
		<div
			style={{
				display: "flex",
				flexDirection: "column",
				width: `${OG.width}px`,
				height: `${OG.height}px`,
				backgroundColor: OG.bg,
				padding: "60px",
				fontFamily: "Geist Sans",
				position: "relative",
			}}
		>
			{children}
			<BrandWatermark />
		</div>
	);
}

export function BrandWatermark() {
	return (
		<div
			style={{
				display: "flex",
				position: "absolute",
				bottom: "40px",
				left: "60px",
				fontFamily: "Geist Mono",
				fontSize: "16px",
				color: "#3f3f46",
				letterSpacing: "0.05em",
			}}
		>
			BETTER-HUB.
		</div>
	);
}

export function StatBadge({ label, value }: { label: string; value: string | number }) {
	return (
		<div
			style={{
				display: "flex",
				alignItems: "center",
				gap: "6px",
				fontSize: "20px",
				color: OG.muted,
			}}
		>
			<span style={{ fontFamily: "Geist Mono", color: OG.fg }}>{value}</span>
			<span>{label}</span>
		</div>
	);
}

export function StateIndicator({ state, size = 16 }: { state: string; size?: number }) {
	return (
		<div
			style={{
				display: "flex",
				width: `${size}px`,
				height: `${size}px`,
				borderRadius: "50%",
				backgroundColor: stateColor(state),
				flexShrink: 0,
			}}
		/>
	);
}

export function Avatar({ src, size = 80 }: { src: string; size?: number }) {
	return (
		<img
			src={src}
			width={size}
			height={size}
			style={{
				borderRadius: "50%",
				border: `2px solid ${OG.border}`,
			}}
		/>
	);
}

export function truncate(text: string, max: number): string {
	if (text.length <= max) return text;
	return text.slice(0, max - 1) + "\u2026";
}

// ── OG image URL builder (for generateMetadata) ──

export function ogImageUrl(params: Record<string, string | number>): string {
	const search = new URLSearchParams();
	for (const [k, v] of Object.entries(params)) {
		search.set(k, String(v));
	}
	return `/api/og?${search.toString()}`;
}

export function ogImages(url: string) {
	return {
		images: [{ url, width: OG.width, height: OG.height, alt: "Better Hub" }],
	};
}
