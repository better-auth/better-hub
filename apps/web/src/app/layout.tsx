import type { Metadata, Viewport } from "next";
import Script from "next/script";
import { Geist, Geist_Mono } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { cookies } from "next/headers";
import "./globals.css";
import { generateThemeScript } from "@/lib/theme-script";
import { listThemes } from "@/lib/themes";
import { QueryProvider } from "@/components/providers/query-provider";
import { SWRegister } from "@/components/pwa/sw-register";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
	variable: "--font-code",
	subsets: ["latin"],
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://better-hub.com";

export const viewport: Viewport = {
	themeColor: "#000000",
};

export const metadata: Metadata = {
	title: {
		default: "Better Hub",
		template: "%s | Better Hub",
	},
	description: "Re-imagining code collaboration for humans and agents.",
	metadataBase: new URL(siteUrl),
	openGraph: {
		title: "Better Hub",
		description: "Re-imagining code collaboration for humans and agents.",
		siteName: "Better Hub",
		url: siteUrl,
		images: [
			{
				url: "/og.png",
				width: 1200,
				height: 630,
				alt: "Better Hub",
			},
		],
		type: "website",
	},
	twitter: {
		card: "summary_large_image",
		title: "Better Hub",
		description: "Re-imagining code collaboration for humans and agents.",
		images: ["/og.png"],
	},
};

function getMpThemeSSRStyle(cookieStore: Awaited<ReturnType<typeof cookies>>): string {
	const themeId = cookieStore.get("color-theme")?.value;
	const mode = cookieStore.get("color-mode")?.value as "dark" | "light" | undefined;
	const mpData = cookieStore.get("mp-theme-data")?.value;

	if (!themeId?.startsWith("mp:") || !mpData) return "";

	try {
		const parsed = JSON.parse(decodeURIComponent(mpData)) as {
			dark?: { colors: Record<string, string> };
			light?: { colors: Record<string, string> };
		};
		const variant = parsed[mode ?? "dark"] ?? parsed.dark;
		if (!variant?.colors) return "";

		return Object.entries(variant.colors)
			.map(([k, v]) => `${k}:${v}`)
			.join(";");
	} catch {
		return "";
	}
}

export default async function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	const cookieStore = await cookies();
	const mpStyle = getMpThemeSSRStyle(cookieStore);
	const ssrMode = cookieStore.get("color-mode")?.value;
	const ssrClass = mpStyle && ssrMode === "light" ? "light" : mpStyle ? "dark" : undefined;

	return (
		<html
			lang="en"
			suppressHydrationWarning
			{...(ssrClass ? { className: ssrClass } : {})}
			{...(mpStyle
				? {
						style: {
							colorScheme:
								ssrMode === "light"
									? "light"
									: "dark",
						} as React.CSSProperties,
					}
				: {})}
		>
			<head>
				{mpStyle && (
					<style
						dangerouslySetInnerHTML={{
							__html: `:root{${mpStyle}}`,
						}}
					/>
				)}
				{process.env.NODE_ENV === "development" && (
					<Script
						src="//unpkg.com/react-grab/dist/index.global.js"
						crossOrigin="anonymous"
						strategy="beforeInteractive"
					/>
				)}
				<script
					dangerouslySetInnerHTML={{
						__html: generateThemeScript(listThemes()),
					}}
				/>
			</head>
			<body
				className={`${geistSans.variable} ${geistMono.variable} ${jetbrainsMono.variable} antialiased bg-background text-foreground overflow-x-hidden`}
				suppressHydrationWarning
			>
				<QueryProvider>
					<ThemeProvider
						attribute="class"
						defaultTheme="system"
						enableSystem
						enableColorScheme={false}
					>
						{children}
					</ThemeProvider>
				</QueryProvider>
				<Analytics />
				<SWRegister />
			</body>
		</html>
	);
}
