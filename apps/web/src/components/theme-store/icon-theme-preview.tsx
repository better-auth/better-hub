"use client";

import { useMemo } from "react";
import { Folder } from "lucide-react";
import type { IconMapping } from "@/lib/theme-store-types";
import { getFileIcon } from "@/components/shared/file-icon";

interface PreviewFile {
	label: string;
	ext?: string;
	fileName?: string;
}

interface PreviewFolder {
	label: string;
	folderName: string;
}

const PREVIEW_FILES: PreviewFile[] = [
	{ label: "index.ts", ext: "ts" },
	{ label: "app.tsx", ext: "tsx" },
	{ label: "index.js", ext: "js" },
	{ label: "page.jsx", ext: "jsx" },
	{ label: "utils.py", ext: "py" },
	{ label: "main.go", ext: "go" },
	{ label: "lib.rs", ext: "rs" },
	{ label: "Main.java", ext: "java" },
	{ label: "style.css", ext: "css" },
	{ label: "page.html", ext: "html" },
	{ label: "style.scss", ext: "scss" },
	{ label: "README.md", ext: "md" },
	{ label: "data.json", ext: "json" },
	{ label: "config.yml", ext: "yml" },
	{ label: "config.toml", ext: "toml" },
	{ label: "logo.svg", ext: "svg" },
	{ label: "photo.png", ext: "png" },
	{ label: "icon.ico", ext: "ico" },
	{ label: "schema.graphql", ext: "graphql" },
	{ label: "query.sql", ext: "sql" },
	{ label: "setup.sh", ext: "sh" },
	{ label: "app.vue", ext: "vue" },
	{ label: "page.svelte", ext: "svelte" },
	{ label: "schema.prisma", ext: "prisma" },
	{ label: "package.json", fileName: "package.json" },
	{ label: "tsconfig.json", fileName: "tsconfig.json" },
	{ label: ".gitignore", fileName: ".gitignore" },
	{ label: ".env", fileName: ".env" },
	{ label: "Dockerfile", fileName: "Dockerfile" },
	{ label: "Makefile", fileName: "Makefile" },
	{ label: "LICENSE", fileName: "LICENSE" },
	{ label: ".eslintrc", fileName: ".eslintrc" },
];

const PREVIEW_FOLDERS: PreviewFolder[] = [
	{ label: "src", folderName: "src" },
	{ label: "components", folderName: "components" },
	{ label: "lib", folderName: "lib" },
	{ label: "node_modules", folderName: "node_modules" },
	{ label: ".git", folderName: ".git" },
	{ label: "public", folderName: "public" },
	{ label: "assets", folderName: "assets" },
	{ label: "test", folderName: "test" },
	{ label: "config", folderName: "config" },
	{ label: "hooks", folderName: "hooks" },
	{ label: "api", folderName: "api" },
	{ label: "dist", folderName: "dist" },
	{ label: ".github", folderName: ".github" },
	{ label: ".vscode", folderName: ".vscode" },
	{ label: "docs", folderName: "docs" },
	{ label: "utils", folderName: "utils" },
];

function normalizeBaseURL(url: string): string {
	return url.endsWith("/") ? url : `${url}/`;
}

function resolveFileIcon(base: string, mapping: IconMapping, file: PreviewFile): string | null {
	if (!mapping.fileIcons) return null;

	if (file.fileName) {
		const lower = file.fileName.toLowerCase();
		for (const def of mapping.fileIcons) {
			if (def.fileNames?.some((fn) => fn.toLowerCase() === lower)) {
				return `${base}${def.name}.svg`;
			}
		}
	}

	if (file.ext) {
		const lower = file.ext.toLowerCase();
		for (const def of mapping.fileIcons) {
			if (def.fileExtensions?.some((fe) => fe.toLowerCase() === lower)) {
				return `${base}${def.name}.svg`;
			}
		}
	}

	if (mapping.defaultFile) {
		return `${base}${mapping.defaultFile}.svg`;
	}

	return null;
}

function resolveFolderIcon(
	base: string,
	mapping: IconMapping,
	folder: PreviewFolder,
): string | null {
	if (mapping.folderIcons) {
		const lower = folder.folderName.toLowerCase();
		for (const def of mapping.folderIcons) {
			if (def.folderNames.some((fn) => fn.toLowerCase() === lower)) {
				return `${base}${def.name}.svg`;
			}
		}
	}

	if (mapping.defaultFolder) {
		return `${base}${mapping.defaultFolder}.svg`;
	}

	return null;
}

function DefaultFileIcon({ name }: { name: string }) {
	const { Icon, color } = getFileIcon(name);
	return (
		<span className="size-4 shrink-0 relative inline-flex items-center justify-center">
			<Icon className="w-full h-full text-muted-foreground" />
			{color && (
				<span
					className="absolute -bottom-px -right-px w-1.5 h-1.5 rounded-full ring-1 ring-background"
					style={{ backgroundColor: color }}
				/>
			)}
		</span>
	);
}

function FileIconCell({ iconUrl, label }: { iconUrl: string | null; label: string }) {
	return (
		<div className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted/40 transition-colors min-w-0">
			{iconUrl ? (
				<img
					src={iconUrl}
					alt=""
					className="size-4 shrink-0 object-contain"
					loading="lazy"
				/>
			) : (
				<DefaultFileIcon name={label} />
			)}
			<span className="text-[11px] text-foreground/80 truncate font-mono">
				{label}
			</span>
		</div>
	);
}

function FolderIconCell({ iconUrl, label }: { iconUrl: string | null; label: string }) {
	return (
		<div className="flex items-center gap-2 px-2 py-1.5 rounded-sm hover:bg-muted/40 transition-colors min-w-0">
			{iconUrl ? (
				<img
					src={iconUrl}
					alt=""
					className="size-4 shrink-0 object-contain"
					loading="lazy"
				/>
			) : (
				<Folder className="size-4 shrink-0 text-muted-foreground/60" />
			)}
			<span className="text-[11px] text-foreground/80 truncate font-mono">
				{label}
			</span>
		</div>
	);
}

export function IconThemePreview({ dataJson }: { dataJson: string }) {
	const mapping = useMemo<IconMapping | null>(() => {
		try {
			return JSON.parse(dataJson);
		} catch {
			return null;
		}
	}, [dataJson]);

	if (!mapping?.baseURL) return null;

	const base = normalizeBaseURL(mapping.baseURL);

	const fileEntries = PREVIEW_FILES.map((f) => ({
		...f,
		iconUrl: resolveFileIcon(base, mapping, f),
	}));

	const folderEntries = PREVIEW_FOLDERS.map((f) => ({
		...f,
		iconUrl: resolveFolderIcon(base, mapping, f),
	}));

	return (
		<div className="border border-border rounded-md overflow-hidden">
			<div className="flex items-center px-3 py-2 border-b border-border bg-muted/30">
				<span className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Icon Preview
				</span>
			</div>

			<div className="p-3 space-y-4">
				<div>
					<h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-2 px-2">
						Files
					</h4>
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5">
						{fileEntries.map((f) => (
							<FileIconCell
								key={f.label}
								iconUrl={f.iconUrl}
								label={f.label}
							/>
						))}
					</div>
				</div>

				<div>
					<h4 className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 mb-2 px-2">
						Folders
					</h4>
					<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-x-1 gap-y-0.5">
						{folderEntries.map((f) => (
							<FolderIconCell
								key={f.label}
								iconUrl={f.iconUrl}
								label={f.label}
							/>
						))}
					</div>
				</div>
			</div>
		</div>
	);
}
