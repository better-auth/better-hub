import { Octokit } from "@octokit/rest";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import type {
	CustomThemeManifest,
	CustomThemeScanResult,
	CustomThemeData,
	IconMapping,
	CustomThemeType,
} from "./theme-store-types";

const MANIFEST_FILENAME = "better-hub-extension.json";
const VALID_TYPES: CustomThemeType[] = ["theme", "icon-theme"];

const ALLOWED_GITHUB_HOSTNAMES = new Set([
	"raw.githubusercontent.com",
	"github.com",
	"www.github.com",
]);

function isGitHubUrl(url: string): boolean {
	try {
		const parsed = new URL(url);
		if (parsed.protocol !== "https:") return false;
		if (ALLOWED_GITHUB_HOSTNAMES.has(parsed.hostname)) return true;
		if (parsed.hostname.endsWith(".github.io")) return true;
		return false;
	} catch {
		return false;
	}
}

class ScanError extends Error {
	constructor(
		message: string,
		public statusCode: number = 400,
	) {
		super(message);
		this.name = "ScanError";
	}
}

async function fetchFileContent(
	octokit: Octokit,
	owner: string,
	repo: string,
	path: string,
): Promise<string> {
	const { data } = await octokit.repos.getContent({ owner, repo, path });
	if (Array.isArray(data) || data.type !== "file" || !("content" in data)) {
		throw new ScanError(
			`Expected a file at ${path}, got ${Array.isArray(data) ? "directory" : data.type}`,
		);
	}
	return Buffer.from(data.content, "base64").toString("utf-8");
}

function validateManifest(raw: unknown): CustomThemeManifest {
	if (!raw || typeof raw !== "object") {
		throw new ScanError("Manifest must be a JSON object");
	}
	const obj = raw as Record<string, unknown>;

	if (typeof obj.name !== "string" || obj.name.trim().length === 0) {
		throw new ScanError("Manifest must include a non-empty 'name' string");
	}
	if (typeof obj.description !== "string" || obj.description.trim().length === 0) {
		throw new ScanError("Manifest must include a non-empty 'description' string");
	}
	if (typeof obj.type !== "string" || !VALID_TYPES.includes(obj.type as CustomThemeType)) {
		throw new ScanError(`Manifest 'type' must be one of: ${VALID_TYPES.join(", ")}`);
	}
	if (typeof obj.main !== "string" || obj.main.trim().length === 0) {
		throw new ScanError(
			"Manifest must include a non-empty 'main' path to the data file",
		);
	}

	return {
		name: obj.name.trim(),
		description: obj.description.trim(),
		version: typeof obj.version === "string" ? obj.version.trim() : "1.0.0",
		type: obj.type as CustomThemeType,
		main: obj.main.trim(),
		icon: typeof obj.icon === "string" ? obj.icon.trim() : undefined,
		license: typeof obj.license === "string" ? obj.license.trim() : undefined,
	};
}

function validateThemeData(raw: unknown): CustomThemeData {
	if (!raw || typeof raw !== "object") {
		throw new ScanError("Theme data must be a JSON object");
	}
	const obj = raw as Record<string, unknown>;

	if (!obj.dark || typeof obj.dark !== "object") {
		throw new ScanError("Theme data must include a 'dark' variant object");
	}
	if (!obj.light || typeof obj.light !== "object") {
		throw new ScanError("Theme data must include a 'light' variant object");
	}

	const dark = obj.dark as Record<string, unknown>;
	const light = obj.light as Record<string, unknown>;

	for (const [label, variant] of [
		["dark", dark],
		["light", light],
	] as const) {
		if (!variant.colors || typeof variant.colors !== "object") {
			throw new ScanError(
				`Theme '${label}' variant must include a 'colors' object`,
			);
		}
		if (typeof variant.accentPreview !== "string") {
			throw new ScanError(
				`Theme '${label}' variant must include an 'accentPreview' color string`,
			);
		}
		if (typeof variant.bgPreview !== "string") {
			throw new ScanError(
				`Theme '${label}' variant must include a 'bgPreview' color string`,
			);
		}
	}

	return raw as CustomThemeData;
}

function validateIconMapping(raw: unknown): IconMapping {
	if (!raw || typeof raw !== "object") {
		throw new ScanError("Icon theme data must be a JSON object");
	}
	const obj = raw as Record<string, unknown>;

	if (typeof obj.baseURL !== "string" || obj.baseURL.trim().length === 0) {
		throw new ScanError("Icon theme data must include a non-empty 'baseURL' string");
	}
	if (!isGitHubUrl(obj.baseURL.trim())) {
		throw new ScanError(
			"Icon theme 'baseURL' must be an HTTPS URL on a GitHub domain (e.g. raw.githubusercontent.com)",
		);
	}

	if (
		!obj.fileIcons &&
		!obj.folderIcons &&
		!obj.defaultFile &&
		!obj.defaultFolder &&
		!obj.defaultFolderOpen
	) {
		throw new ScanError(
			"Icon theme data must include at least one of 'fileIcons', 'folderIcons', 'defaultFile', 'defaultFolder', or 'defaultFolderOpen'",
		);
	}

	if (obj.fileIcons) {
		if (!Array.isArray(obj.fileIcons)) {
			throw new ScanError("'fileIcons' must be an array");
		}
		for (const entry of obj.fileIcons) {
			if (
				!entry ||
				typeof entry !== "object" ||
				typeof (entry as Record<string, unknown>).name !== "string"
			) {
				throw new ScanError(
					"Each fileIcons entry must have a 'name' string",
				);
			}
			const e = entry as Record<string, unknown>;
			if (!e.fileExtensions && !e.fileNames) {
				throw new ScanError(
					`fileIcons entry '${e.name}' must have at least one of 'fileExtensions' or 'fileNames'`,
				);
			}
		}
	}

	if (obj.folderIcons) {
		if (!Array.isArray(obj.folderIcons)) {
			throw new ScanError("'folderIcons' must be an array");
		}
		for (const entry of obj.folderIcons) {
			if (
				!entry ||
				typeof entry !== "object" ||
				typeof (entry as Record<string, unknown>).name !== "string"
			) {
				throw new ScanError(
					"Each folderIcons entry must have a 'name' string",
				);
			}
			const e = entry as Record<string, unknown>;
			if (!Array.isArray(e.folderNames) || e.folderNames.length === 0) {
				throw new ScanError(
					`folderIcons entry '${e.name}' must have a non-empty 'folderNames' array`,
				);
			}
		}
	}

	return raw as IconMapping;
}

function resolveIconUrl(owner: string, repo: string, iconPath: string): string {
	return `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${iconPath}`;
}

export async function scanCustomThemeRepo(
	octokit: Octokit,
	owner: string,
	repo: string,
): Promise<CustomThemeScanResult> {
	let manifestRaw: string;
	try {
		manifestRaw = await fetchFileContent(octokit, owner, repo, MANIFEST_FILENAME);
	} catch (err) {
		if (err instanceof ScanError) throw err;
		throw new ScanError(
			`Could not find ${MANIFEST_FILENAME} in ${owner}/${repo}. Make sure the file exists at the repo root.`,
			404,
		);
	}

	let manifestJson: unknown;
	try {
		manifestJson = JSON.parse(manifestRaw);
	} catch {
		throw new ScanError(`${MANIFEST_FILENAME} is not valid JSON`);
	}

	const manifest = validateManifest(manifestJson);

	let dataRaw: string;
	try {
		dataRaw = await fetchFileContent(octokit, owner, repo, manifest.main);
	} catch (err) {
		if (err instanceof ScanError) throw err;
		throw new ScanError(`Could not fetch main data file at '${manifest.main}'`, 404);
	}

	let dataJson: unknown;
	try {
		dataJson = JSON.parse(dataRaw);
	} catch {
		throw new ScanError(`Main data file '${manifest.main}' is not valid JSON`);
	}

	const data =
		manifest.type === "theme"
			? validateThemeData(dataJson)
			: validateIconMapping(dataJson);

	if (manifest.type === "icon-theme") {
		const iconData = data as IconMapping;
		const expectedPrefix = `https://raw.githubusercontent.com/${owner}/${repo}/`;
		if (!iconData.baseURL.startsWith(expectedPrefix)) {
			throw new ScanError(
				`Icon theme 'baseURL' must point to this repository (expected prefix: ${expectedPrefix})`,
			);
		}
	}

	let readmeHtml: string | null = null;
	const readmeCandidates = ["README.md", "readme.md", "README", "readme"];
	for (const candidate of readmeCandidates) {
		try {
			const readmeContent = await fetchFileContent(
				octokit,
				owner,
				repo,
				candidate,
			);
			readmeHtml = await renderMarkdownToHtml(readmeContent, {
				owner,
				repo,
				branch: "HEAD",
			});
			break;
		} catch {
			// try next candidate
		}
	}

	const iconUrl = manifest.icon ? resolveIconUrl(owner, repo, manifest.icon) : null;

	return { manifest, data, readmeHtml, iconUrl, owner, repo };
}

export { ScanError };
