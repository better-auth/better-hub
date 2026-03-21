import { Command } from "commander";
import pc from "picocolors";
import { clearAuth, getBaseUrl, getToken, setAuth } from "../lib/config.js";
import { getAuthClient } from "../lib/auth-client.js";
import { deviceAuthFlow } from "../lib/device-auth.js";
import { spinner } from "../lib/spinner.js";

export const authCommand = new Command("auth").description("Manage authentication");

authCommand
	.command("login")
	.description("Sign in to Better Hub via device authorization")
	.option("-t, --token <token>", "Authenticate with a token directly (skips device flow)")
	.action(async (opts: { token?: string }) => {
		let token: string;

		if (opts.token) {
			token = opts.token;
		} else {
			try {
				token = await deviceAuthFlow();
			} catch (err) {
				console.log(
					`    ${pc.dim(err instanceof Error ? err.message : String(err))}`,
				);
				console.log();
				process.exit(1);
			}
		}

		setAuth(token);

		const s = spinner("Verifying session...");
		try {
			const client = getAuthClient();
			const { data } = await client.getSession();
			if (!data?.user) throw new Error("No session");

			s.stop(`  ${pc.green("✓")} Logged in as ${pc.bold(data.user.name)}`);
			console.log();
		} catch {
			s.stop(
				`  ${pc.red("✗")} Token is invalid or session could not be verified.`,
			);
			clearAuth();
			console.log();
			process.exit(1);
		}
	});

authCommand
	.command("logout")
	.description("Sign out and remove stored credentials")
	.action(() => {
		const had = !!getToken();
		clearAuth();

		console.log();
		if (had) {
			console.log(`  ${pc.green("✓")} Logged out. Credentials removed.`);
		} else {
			console.log(`  ${pc.dim("○")} Already logged out.`);
		}
		console.log();
	});

authCommand
	.command("whoami")
	.description("Show the current authenticated user")
	.action(async () => {
		const token = getToken();
		if (!token) {
			console.log();
			console.log(`  ${pc.yellow("○")} Not logged in`);
			console.log(
				`  ${pc.dim("Run")} ${pc.bold("better-hub auth login")} ${pc.dim("to sign in.")}`,
			);
			console.log();
			return;
		}

		const s = spinner("Fetching session...");
		try {
			const client = getAuthClient();
			const { data } = await client.getSession();
			if (!data?.user) throw new Error("No session");

			s.stop();
			console.log();
			console.log(`  ${pc.bold(data.user.name)}`);
			console.log(`  ${pc.dim(getBaseUrl())}`);
			console.log();
		} catch {
			s.stop();
			console.log();
			console.log(`  ${pc.red("✗")} Session expired or invalid`);
			console.log(
				`  ${pc.dim("Run")} ${pc.bold("better-hub auth login")} ${pc.dim("to sign in again.")}`,
			);
			console.log();
		}
	});

authCommand
	.command("status")
	.description("Check authentication status")
	.action(async () => {
		const token = getToken();
		const base = getBaseUrl();

		console.log();
		console.log(`  ${pc.bold("Auth Status")}`);
		console.log();
		console.log(`  Server   ${pc.cyan(base)}`);

		if (!token) {
			console.log(`  Status   ${pc.yellow("not authenticated")}`);
			console.log();
			return;
		}

		const s = spinner("Checking session...");
		try {
			const client = getAuthClient();
			const { data } = await client.getSession();
			if (!data?.user) throw new Error("No session");

			s.stop(`  Session  ${pc.green("active")}`);
			console.log(`  User     ${pc.bold(data.user.name)}`);
			console.log();
		} catch {
			s.stop(`  Session  ${pc.red("expired")}`);
			console.log();
		}
	});
