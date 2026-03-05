import {
	File,
	FileCode,
	FileJson,
	FileText,
	FileImage,
	FileCog,
	FileType,
	Folder,
	FolderOpen,
} from "lucide-react";

const langColors: Record<string, string> = {
	ts: "#3178c6",
	tsx: "#3178c6",
	mts: "#3178c6",
	cts: "#3178c6",
	js: "#f1e05a",
	jsx: "#f1e05a",
	mjs: "#f1e05a",
	cjs: "#f1e05a",
	py: "#3572a5",
	rs: "#dea584",
	go: "#00add8",
	java: "#b07219",
	kt: "#a97bff",
	swift: "#f05138",
	dart: "#00b4ab",
	scala: "#c22d40",
	rb: "#701516",
	ex: "#6e4a7e",
	exs: "#6e4a7e",
	erl: "#b83998",
	hs: "#5e5086",
	lua: "#000080",
	r: "#198ce7",
	zig: "#ec915c",
	c: "#555555",
	cpp: "#f34b7d",
	h: "#555555",
	hpp: "#f34b7d",
	cs: "#178600",
	fs: "#b845fc",
	vue: "#41b883",
	svelte: "#ff3e00",
	astro: "#ff5d01",
	css: "#563d7c",
	scss: "#c6538c",
	sass: "#c6538c",
	less: "#1d365d",
	html: "#e34c26",
	htm: "#e34c26",
	md: "#083fa1",
	mdx: "#083fa1",
	json: "#a87c32",
	ipynb: "#DA5B0B",
	yaml: "#cb171e",
	yml: "#cb171e",
	toml: "#9c4221",
	xml: "#0060ac",
	sql: "#e38c00",
	graphql: "#e10098",
	gql: "#e10098",
	sh: "#89e051",
	bash: "#89e051",
	zsh: "#89e051",
	prisma: "#2d3748",
	proto: "#4a7b9d",
	dockerfile: "#384d54",
	php: "#4f5d95",
	clj: "#db5855",
	nim: "#ffc200",
	nix: "#7e7eff",
	v: "#4f87c4",
	env: "#ecd53f",
	lock: "#555555",
};

type LucideIcon = typeof File;

function getFileIcon(name: string): { Icon: LucideIcon; color?: string } {
	const lower = name.toLowerCase();
	const ext = lower.split(".").pop() || "";

	// Config files
	if (
		lower.endsWith(".config.js") ||
		lower.endsWith(".config.ts") ||
		lower.endsWith(".config.mjs") ||
		lower.endsWith(".config.cjs") ||
		lower.endsWith(".config.mts") ||
		lower === ".editorconfig" ||
		lower === ".eslintrc" ||
		lower === ".eslintrc.js" ||
		lower === ".eslintrc.json" ||
		lower === ".prettierrc" ||
		lower === ".prettierrc.js" ||
		lower === ".prettierrc.json" ||
		lower === "tsconfig.json" ||
		lower === ".babelrc" ||
		lower === ".npmrc"
	) {
		return { Icon: FileCog, color: langColors[ext] };
	}

	// Images
	if (["png", "jpg", "jpeg", "gif", "webp", "svg", "ico", "bmp", "avif"].includes(ext)) {
		return { Icon: FileImage };
	}

	// Text/docs
	if (["md", "mdx", "txt", "rst", "adoc"].includes(ext)) {
		return { Icon: FileText, color: langColors[ext] };
	}

	// JSON/data
	if (["json", "jsonc", "json5", "ipynb"].includes(ext)) {
		return { Icon: FileJson, color: langColors[ext] };
	}

	// Font files
	if (["woff", "woff2", "ttf", "otf", "eot"].includes(ext)) {
		return { Icon: FileType };
	}

	// Code files
	if (langColors[ext]) {
		return { Icon: FileCode, color: langColors[ext] };
	}

	// Special filenames
	if (lower === "dockerfile" || lower === "makefile" || lower === "jenkinsfile") {
		return { Icon: FileCode, color: "#555555" };
	}
	if (lower === "license" || lower === "licence") {
		return { Icon: FileText };
	}

	return { Icon: File };
}

export function FileTypeIcon({
	name,
	type,
	className,
	isOpen,
}: {
	name: string;
	type: "file" | "dir";
	className?: string;
	isOpen?: boolean;
}) {
	if (type === "dir") {
		const Icon = isOpen ? FolderOpen : Folder;
		return <Icon className={`${className} text-muted-foreground/60`} />;
	}

	const { Icon, color } = getFileIcon(name);

	return (
		<span className={`${className} relative inline-flex items-center justify-center`}>
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
