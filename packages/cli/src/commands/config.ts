import { Command } from "commander";
import pc from "picocolors";
import open from "open";
import { cancel, confirm, isCancel, log, outro, select } from "@clack/prompts";
import { homedir } from "node:os";
import { join } from "node:path";
import { betterHubIntro } from "../lib/intro.js";
import {
	type Preferences,
	getPreferences,
	preferenceDefaults,
	resetPreferences,
	setPreference,
} from "../lib/preferences.js";

interface PreferenceEntry {
	key: keyof Preferences;
	label: string;
	description: string;
	type: "boolean";
}

const PREFERENCE_ENTRIES: PreferenceEntry[] = [
	{
		key: "showRecentCommits",
		label: "Show recent commits",
		description: "Display the last 3 commits in bh status output",
		type: "boolean",
	},
];

function findEntry(key: string): PreferenceEntry | undefined {
	return PREFERENCE_ENTRIES.find(
		(e) => e.key === key || e.key.toLowerCase() === key.toLowerCase(),
	);
}

function parseBooleanValue(raw: string): boolean | null {
	const v = raw.toLowerCase();
	if (["true", "on", "1", "yes"].includes(v)) return true;
	if (["false", "off", "0", "no"].includes(v)) return false;
	return null;
}

function formatValue(value: unknown, type: "boolean"): string {
	if (type === "boolean") {
		return value ? pc.green("on") : pc.red("off");
	}
	return String(value);
}

function printAllPreferences() {
	const prefs = getPreferences();
	const defaults = preferenceDefaults();
	const maxKey = Math.max(...PREFERENCE_ENTRIES.map((e) => e.key.length));

	console.log();
	for (const entry of PREFERENCE_ENTRIES) {
		const val = prefs[entry.key];
		const isDefault = val === defaults[entry.key];
		const pad = " ".repeat(maxKey - entry.key.length + 2);
		console.log(
			`  ${pc.bold(entry.key)}${pad}${formatValue(val, entry.type)}${isDefault ? pc.dim("  (default)") : ""}  ${pc.dim(entry.description)}`,
		);
	}
	console.log();
}

function preferencesMenu(prefs: Preferences) {
	const options = PREFERENCE_ENTRIES.map((entry) => ({
		value: entry.key as string,
		label: `${entry.label}  ${pc.dim("·")}  ${formatValue(prefs[entry.key], entry.type)}`,
		hint: entry.description,
	}));

	options.push(
		{
			value: "_reset",
			label: pc.yellow("Reset all to defaults"),
			hint: "Restore factory settings",
		},
		{
			value: "_done",
			label: pc.dim("Done"),
			hint: "Exit settings",
		},
	);

	return options;
}

function availableKeysHelp(): string {
	const maxKey = Math.max(...PREFERENCE_ENTRIES.map((e) => e.key.length));
	const lines = PREFERENCE_ENTRIES.map((e) => {
		const pad = " ".repeat(maxKey - e.key.length + 2);
		const typeTag = e.type === "boolean" ? pc.yellow("boolean") : pc.yellow("string");
		return `  ${pc.cyan(e.key)}${pad}${typeTag}  ${pc.dim(e.description)}`;
	});
	return `\n${pc.bold("Available keys:")}\n${lines.join("\n")}\n\n${pc.bold("Commands:")}\n  ${pc.cyan("explore")}  ${pc.dim("Open the config directory (~/.better-hub) in your file explorer")}\n`;
}

export const configCommand = new Command("config")
	.alias("settings")
	.description("Configure Better Hub CLI preferences")
	.argument("[key]", "Preference key to get or set")
	.argument("[value]", "Value to set (booleans: true/false/on/off)")
	.option("-l, --list", "List all preferences and their current values")
	.addHelpText("after", availableKeysHelp())
	.action(async (key?: string, value?: string, opts?: { list?: boolean }) => {
		if (key === "explore") {
			const configDir = join(homedir(), ".better-hub");
			console.log();
			console.log(`  ${pc.dim("Opening")} ${pc.cyan(configDir)}`);
			console.log();
			await open(configDir);
			return;
		}

		if (opts?.list) {
			printAllPreferences();
			return;
		}

		if (key && value !== undefined) {
			const entry = findEntry(key);
			if (!entry) {
				console.log();
				console.log(`  ${pc.red("✗")} Unknown preference ${pc.bold(key)}`);
				console.log(
					`  ${pc.dim("Available keys:")} ${PREFERENCE_ENTRIES.map((e) => pc.cyan(e.key)).join(", ")}`,
				);
				console.log();
				process.exit(1);
			}

			if (entry.type === "boolean") {
				const parsed = parseBooleanValue(value);
				if (parsed === null) {
					console.log();
					console.log(
						`  ${pc.red("✗")} Invalid boolean value ${pc.bold(value)}`,
					);
					console.log(
						`  ${pc.dim("Use:")} true, false, on, off, 1, 0, yes, no`,
					);
					console.log();
					process.exit(1);
				}
				setPreference(entry.key, parsed);
				console.log();
				console.log(
					`  ${pc.green("✓")} ${pc.bold(entry.key)} set to ${formatValue(parsed, "boolean")}`,
				);
				console.log();
			}
			return;
		}

		if (key) {
			const entry = findEntry(key);
			if (!entry) {
				console.log();
				console.log(`  ${pc.red("✗")} Unknown preference ${pc.bold(key)}`);
				console.log(
					`  ${pc.dim("Available keys:")} ${PREFERENCE_ENTRIES.map((e) => pc.cyan(e.key)).join(", ")}`,
				);
				console.log();
				process.exit(1);
			}

			const prefs = getPreferences();
			const defaults = preferenceDefaults();
			const val = prefs[entry.key];
			const isDefault = val === defaults[entry.key];
			console.log();
			console.log(
				`  ${pc.bold(entry.key)}  ${formatValue(val, entry.type)}${isDefault ? pc.dim("  (default)") : ""}`,
			);
			console.log(`  ${pc.dim(entry.description)}`);
			console.log();
			return;
		}

		betterHubIntro("Settings");

		let prefs = getPreferences();

		while (true) {
			const choice = await select({
				message: "Configure a setting",
				options: preferencesMenu(prefs),
			});

			if (isCancel(choice)) {
				cancel("Settings closed.");
				return;
			}

			if (choice === "_done") {
				break;
			}

			if (choice === "_reset") {
				const sure = await confirm({
					message: "Reset all preferences to defaults?",
					initialValue: false,
				});

				if (isCancel(sure)) {
					cancel("Settings closed.");
					return;
				}

				if (sure) {
					resetPreferences();
					prefs = getPreferences();
					log.success("All preferences reset to defaults.");
				}
				continue;
			}

			const entry = PREFERENCE_ENTRIES.find((e) => e.key === choice);
			if (!entry) continue;

			if (entry.type === "boolean") {
				const current = prefs[entry.key] as boolean;
				const result = await confirm({
					message: entry.label,
					active: "on",
					inactive: "off",
					initialValue: current,
				});

				if (isCancel(result)) {
					cancel("Settings closed.");
					return;
				}

				setPreference(entry.key, result);
				prefs = getPreferences();

				const defaults = preferenceDefaults();
				const isDefault = prefs[entry.key] === defaults[entry.key];
				log.success(
					`${pc.bold(entry.label)} set to ${formatValue(result, "boolean")}${isDefault ? pc.dim(" (default)") : ""}`,
				);
			}
		}

		outro(pc.dim("Settings saved."));
	});
