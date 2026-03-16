import pc from "picocolors";
import { getBaseUrl } from "./config.js";
import { openUrl } from "./open-url.js";
import { getAuthClient, CLIENT_ID } from "./auth-client.js";
import { spinner } from "./spinner.js";

const GRANT_TYPE = "urn:ietf:params:oauth:grant-type:device_code";

function sleep(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

function extractErrorDetail(error: unknown): string {
	if (!error || typeof error !== "object") return String(error);
	const e = error as Record<string, unknown>;
	if (e["message"] && typeof e["message"] === "string") return e["message"];
	if (e["error_description"] && typeof e["error_description"] === "string")
		return e["error_description"];
	if (e["statusText"] && typeof e["statusText"] === "string")
		return `${e["status"] ?? ""} ${e["statusText"]}`.trim();
	return JSON.stringify(error);
}

export async function deviceAuthFlow(): Promise<string> {
	const s = spinner("Requesting device code...");
	const baseUrl = getBaseUrl();

	let data: Awaited<ReturnType<ReturnType<typeof getAuthClient>["device"]["code"]>>["data"];
	try {
		const client = getAuthClient();
		const res = await client.device.code({ client_id: CLIENT_ID });
		if (res.error || !res.data) {
			const detail = extractErrorDetail(res.error);
			s.stop(`  ${pc.red("✗")} Device code request failed`);
			throw new Error(`Server ${pc.dim(`(${baseUrl})`)} responded: ${detail}`);
		}
		data = res.data;
	} catch (err) {
		if (err instanceof Error && err.message.startsWith("Server ")) throw err;
		s.stop(`  ${pc.red("✗")} Could not reach server`);
		throw new Error(
			`Could not connect to ${pc.dim(baseUrl)} — ${err instanceof Error ? err.message : "network error"}`,
		);
	}

	const {
		device_code,
		user_code,
		verification_uri,
		verification_uri_complete,
		interval = 5,
	} = data;

	s.stop(`  ${pc.green("✓")} Device code received`);

	const code = formatUserCode(user_code);
	const fullUrl = verification_uri_complete || verification_uri;
	const displayUrl = fullUrl.startsWith("http") ? fullUrl : `${baseUrl}${fullUrl}`;

	console.log();
	console.log(`  ${pc.bold("Your one-time code")}`);
	console.log();
	console.log(`    ${pc.bold(pc.cyan(code))}`);
	console.log();
	console.log(`  ${pc.dim("Opening")} ${pc.underline(displayUrl)}`);
	console.log();

	await openUrl(displayUrl);

	const accessToken = await pollForToken(getAuthClient(), device_code, interval);
	return accessToken;
}

async function pollForToken(
	client: ReturnType<typeof getAuthClient>,
	deviceCode: string,
	interval: number,
): Promise<string> {
	let pollInterval = interval;
	const s = spinner("Waiting for authorization in browser...");

	while (true) {
		await sleep(pollInterval * 1000);

		const { data, error } = await client.device.token({
			grant_type: GRANT_TYPE,
			device_code: deviceCode,
			client_id: CLIENT_ID,
		});

		if (data?.access_token) {
			s.stop(`  ${pc.green("✓")} Authorization received`);
			return data.access_token;
		}

		if (error) {
			const err = error as {
				error?: string;
				error_description?: string;
			};
			switch (err.error) {
				case "authorization_pending":
					break;
				case "slow_down":
					pollInterval += 5;
					s.update(
						`Waiting for authorization... (slowed to ${pollInterval}s)`,
					);
					break;
				case "access_denied":
					s.stop(`  ${pc.red("✗")} Authorization denied by user`);
					throw new Error("You denied the authorization request.");
				case "expired_token":
					s.stop(`  ${pc.red("✗")} Code expired`);
					throw new Error(
						"The device code expired before it was approved. Run login again.",
					);
				default:
					s.stop(`  ${pc.red("✗")} Unexpected error`);
					throw new Error(
						err.error_description ??
							err.error ??
							"Unknown error from server",
					);
			}
		}
	}
}

function formatUserCode(code: string): string {
	if (code.length === 8 && !code.includes("-")) {
		return `${code.slice(0, 4)}-${code.slice(4)}`;
	}
	return code;
}
