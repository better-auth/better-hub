import { Octokit } from "@octokit/rest";
import { createAppAuth } from "@octokit/auth-app";
import { redis } from "@/lib/redis";

// ── GitHub App Configuration ─────────────────────────────────

function getAppConfig() {
	const appId = process.env.GITHUB_APP_ID;
	const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;
	const webhookSecret = process.env.GITHUB_APP_WEBHOOK_SECRET;

	if (!appId || !privateKey) {
		return null;
	}

	return {
		appId,
		// Private key may be base64-encoded in env vars (common for multi-line PEM)
		privateKey: privateKey.includes("BEGIN")
			? privateKey
			: Buffer.from(privateKey, "base64").toString("utf-8"),
		webhookSecret,
	};
}

/**
 * Check if the GitHub App is configured.
 */
export function isGitHubAppConfigured(): boolean {
	return getAppConfig() !== null;
}

/**
 * Get the webhook secret for verifying GitHub App webhook signatures.
 */
export function getWebhookSecret(): string | undefined {
	return getAppConfig()?.webhookSecret;
}

// ── Installation Token Management ────────────────────────────

const TOKEN_CACHE_PREFIX = "github_app_token:";
const TOKEN_TTL_SECONDS = 55 * 60; // 55 min (tokens last 60 min)

/**
 * Get an Octokit instance authenticated as a specific installation.
 * Tokens are cached in Redis for reuse.
 */
export async function getInstallationOctokit(
	installationId: number,
): Promise<Octokit | null> {
	const config = getAppConfig();
	if (!config) return null;

	// Check cached token first
	const cacheKey = `${TOKEN_CACHE_PREFIX}${installationId}`;
	const cachedToken = await redis.get<string>(cacheKey);

	if (cachedToken) {
		return new Octokit({ auth: cachedToken });
	}

	// Generate new installation token
	try {
		const auth = createAppAuth({
			appId: config.appId,
			privateKey: config.privateKey,
		});

		const { token, expiresAt } = await auth({
			type: "installation",
			installationId,
		});

		// Cache the token (expire slightly before actual expiry)
		const expiresIn = expiresAt
			? Math.max(
					Math.floor(
						(new Date(expiresAt).getTime() - Date.now()) / 1000 - 300,
					),
					60,
				)
			: TOKEN_TTL_SECONDS;

		await redis.set(cacheKey, token, { ex: expiresIn });

		return new Octokit({ auth: token });
	} catch (error) {
		console.error(
			`[github-app] Failed to get installation token for ${installationId}:`,
			error,
		);
		return null;
	}
}

/**
 * Invalidate a cached installation token.
 */
export async function invalidateInstallationToken(
	installationId: number,
): Promise<void> {
	await redis.del(`${TOKEN_CACHE_PREFIX}${installationId}`);
}
