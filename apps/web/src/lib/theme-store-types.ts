import type { ThemeColors, ShikiTheme } from "./themes/types";

export type ExtensionType = "theme" | "icon-theme";

export interface ExtensionManifest {
	name: string;
	description: string;
	version: string;
	type: ExtensionType;
	/** Relative path to the main data file (theme JSON or icon-theme JSON) */
	main: string;
	/** Relative path to an icon image */
	icon?: string;
	license?: string;
}

export interface ExtensionThemeVariant {
	accentPreview: string;
	bgPreview: string;
	colors: ThemeColors;
	syntax?: ShikiTheme;
}

export interface ExtensionThemeData {
	dark: ExtensionThemeVariant;
	light: ExtensionThemeVariant;
}

export interface FileIconDefinition {
	/** Icon name — joined with baseURL to form the SVG URL (e.g. "typescript" → baseURL + "typescript.svg") */
	name: string;
	/** File extensions this icon applies to (e.g. ["ts", "tsx", "mts"]) */
	fileExtensions?: string[];
	/** Exact filenames this icon applies to (e.g. ["Dockerfile", ".gitignore"]) */
	fileNames?: string[];
}

export interface FolderIconDefinition {
	/** Icon name — joined with baseURL to form the SVG URL (e.g. "folder-src" → baseURL + "folder-src.svg") */
	name: string;
	/** Folder names this icon applies to (e.g. ["src", "source"]) */
	folderNames: string[];
}

export interface IconMapping {
	/** Full base URL that icon names are resolved against (name + ".svg" is appended) */
	baseURL: string;
	fileIcons?: FileIconDefinition[];
	folderIcons?: FolderIconDefinition[];
	/** Icon name used as the default file icon */
	defaultFile?: string;
	/** Icon name used as the default folder icon */
	defaultFolder?: string;
	/** Icon name used as the default open folder icon */
	defaultFolderOpen?: string;
}

export interface ExtensionScanResult {
	manifest: ExtensionManifest;
	data: ExtensionThemeData | IconMapping;
	readmeHtml: string | null;
	iconUrl: string | null;
	owner: string;
	repo: string;
}

export interface ThemeStoreExtensionListItem {
	id: string;
	slug: string;
	name: string;
	description: string;
	type: ExtensionType;
	version: string;
	iconUrl: string | null;
	authorName: string;
	authorAvatarUrl: string | null;
	downloads: number;
	verified: boolean;
	featured: boolean;
	publishedAt: string;
}

export interface ThemeStoreExtensionDetail extends ThemeStoreExtensionListItem {
	owner: string;
	repo: string;
	license: string | null;
	readmeHtml: string | null;
	dataJson: string | null;
	authorGithubId: string;
	updatedAt: string;
	installed?: boolean;
	isAuthor?: boolean;
}
