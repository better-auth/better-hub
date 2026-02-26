import { withSentryConfig } from "@sentry/nextjs";
import type { NextConfig } from "next";

/**
 * Known first-segment routes that should NOT be rewritten to /repos/...
 * Includes all top-level app routes, API routes, and Next.js internals.
 */
const KNOWN_ROUTES = [
	"api",
	"dashboard",
	"debug",
	"extension",
	"issues",
	"notifications",
	"orgs",
	"prompt",
	"repos",
	"search",
	"trending",
	"users",
	"_next",
];

const nextConfig: NextConfig = {
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
				hostname: "**",
			},
		],
	},
	async rewrites() {
		return {
			beforeFiles: [
				// Rewrite /:owner/:repo(/:path*) → /repos/:owner/:repo(/:path*)
				// Only when the first segment is NOT a known app route.
				// The negative lookahead excludes all known routes so only
				// owner/repo patterns get rewritten.
				{
					source: `/:owner((?!${KNOWN_ROUTES.join("|")})\\w[\\w.\\-]*)/:repo/:path*`,
					destination: "/repos/:owner/:repo/:path*",
				},
				{
					source: `/:owner((?!${KNOWN_ROUTES.join("|")})\\w[\\w.\\-]*)/:repo`,
					destination: "/repos/:owner/:repo",
				},
			],
		};
	},
};

export default withSentryConfig(nextConfig, {
	// For all available options, see:
	// https://www.npmjs.com/package/@sentry/webpack-plugin#options

	org: "better-hub",

	project: "javascript-nextjs",

	// Only print logs for uploading source maps in CI
	silent: !process.env.CI,

	// For all available options, see:
	// https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup/

	// Upload a larger set of source maps for prettier stack traces (increases build time)
	widenClientFileUpload: true,

	// Route browser requests to Sentry through a Next.js rewrite to circumvent ad-blockers.
	// This can increase your server load as well as your hosting bill.
	// Note: Check that the configured route will not match with your Next.js middleware, otherwise reporting of client-
	// side errors will fail.
	tunnelRoute: "/monitoring",

	webpack: {
		// Enables automatic instrumentation of Vercel Cron Monitors. (Does not yet work with App Router route handlers.)
		// See the following for more information:
		// https://docs.sentry.io/product/crons/
		// https://vercel.com/docs/cron-jobs
		automaticVercelMonitors: true,

		// Tree-shaking options for reducing bundle size
		treeshake: {
			// Automatically tree-shake Sentry logger statements to reduce bundle size
			removeDebugLogging: true,
		},
	},
});
