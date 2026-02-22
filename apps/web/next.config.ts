import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	productionBrowserSourceMaps: process.env.NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL === 'beta.better-hub.com',
	devIndicators: false,
	serverExternalPackages: ["@prisma/client"],
	experimental: {
		staleTimes: {
			dynamic: 300,
			static: 180,
		},
	},
	images: {
		...(process.env.NODE_ENV === "development" && {
			dangerouslyAllowLocalIP: true,
		}),
		remotePatterns: [
			{
				protocol: "https",
				hostname: "avatars.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "github.com",
			},
			{
				protocol: "https",
				hostname: "raw.githubusercontent.com",
			},
			{
				protocol: "https",
				hostname: "user-images.githubusercontent.com",
			},
		],
	},
};

export default nextConfig;
