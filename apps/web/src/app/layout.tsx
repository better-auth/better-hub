import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { JetBrains_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
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

export const metadata: Metadata = {
	title: {
		default: "Better Hub",
		template: "%s | Better Hub",
	},
	description: "Re-imagining code collaboration for humans and agents.",
	themeColor: "#000000",
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

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" suppressHydrationWarning>
			<head>
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
