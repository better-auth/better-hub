"use client";

import { useState } from "react";
import { BookOpen, Palette, FolderTree, Copy, Check, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogDescription,
	DialogTrigger,
} from "@/components/ui/dialog";
import { HighlightedCodeBlock } from "@/components/shared/highlighted-code-block";

type DocType = "theme" | "icon-theme";

const COLOR_THEME_MANIFEST = `{
  "$schema": "https://better-hub.com/schemas/theme-manifest.schema.json",
  "name": "My Theme",
  "description": "A beautiful color theme",
  "version": "1.0.0",
  "type": "theme",
  "main": "theme.json",
  "icon": "icon.png",
  "license": "MIT"
}`;

const COLOR_THEME_DATA = `{
  "$schema": "https://better-hub.com/schemas/theme-data.schema.json",
  "dark": {
    "accentPreview": "#7c3aed",
    "bgPreview": "#09090b",
    "colors": {
      "--background": "0 0% 3.9%",
      "--foreground": "0 0% 98%",
      "--primary": "263.4 70% 50.4%",
      "--primary-foreground": "0 0% 100%"
    }
  },
  "light": {
    "accentPreview": "#7c3aed",
    "bgPreview": "#ffffff",
    "colors": {
      "--background": "0 0% 100%",
      "--foreground": "0 0% 3.9%",
      "--primary": "263.4 70% 50.4%",
      "--primary-foreground": "0 0% 100%"
    }
  }
}`;

const ICON_THEME_MANIFEST = `{
  "$schema": "https://better-hub.com/schemas/icon-theme-manifest.schema.json",
  "name": "My Icon Theme",
  "description": "A file icon theme",
  "version": "1.0.0",
  "type": "icon-theme",
  "main": "icons/icon-theme.json",
  "icon": "icon.png",
  "license": "MIT"
}`;

const ICON_THEME_DATA = `{
  "$schema": "https://better-hub.com/schemas/icon-theme-data.schema.json",
  "baseURL": "https://raw.githubusercontent.com/you/repo/HEAD/icons/",
  "defaultFile": "file",
  "defaultFolder": "folder",
  "fileIcons": [
    {
      "name": "typescript",
      "fileExtensions": ["ts", "tsx"]
    },
    {
      "name": "docker",
      "fileNames": ["Dockerfile"]
    }
  ],
  "folderIcons": [
    {
      "name": "folder-src",
      "folderNames": ["src", "lib"]
    }
  ]
}`;

const COLOR_THEME_PROMPT = `Create a Better Hub color theme in this repo. Generate the following files:

1. \`better-hub-extension.json\` (at repo root) — the manifest:
{
  "$schema": "https://better-hub.com/schemas/theme-manifest.schema.json",
  "name": "<theme name>",
  "description": "<short description>",
  "version": "1.0.0",
  "type": "theme",
  "main": "theme.json",
  "icon": "icon.png",
  "license": "MIT"
}

2. \`theme.json\` — the theme data file with a "dark" and "light" variant. Each variant needs:
- "accentPreview": a hex color string for the accent preview dot (e.g. "#7c3aed")
- "bgPreview": a hex color string for the background preview dot (e.g. "#09090b")
- "colors": an object mapping CSS custom property names to HSL values (without the hsl() wrapper, e.g. "0 0% 3.9%")

The "colors" object MUST include ALL of these keys:
--background, --foreground, --card, --card-foreground, --primary, --primary-foreground, --secondary, --secondary-foreground, --muted, --muted-foreground, --accent, --accent-foreground, --border, --input, --ring, --destructive, --success, --warning, --scrollbar-thumb, --scrollbar-thumb-hover, --shader-bg, --shader-filter, --hero-border, --diff-add-bar, --diff-del-bar, --diff-mod-bar, --link, --info, --code-bg, --code-block-bg, --inline-code-bg, --line-gutter, --line-highlight, --search-highlight, --search-highlight-active, --selection-bg, --table-row-alt, --diff-add-bg, --diff-del-bg, --diff-add-text, --diff-del-text, --diff-add-gutter, --diff-del-gutter, --diff-word-add, --diff-word-del, --alert-note, --alert-tip, --alert-important, --alert-warning, --alert-caution, --contrib-0, --contrib-1, --contrib-2, --contrib-3, --contrib-4

Use "$schema": "https://better-hub.com/schemas/theme-data.schema.json" at the top of theme.json for validation.

Design a cohesive, visually appealing theme with good contrast and readability. Make sure the dark and light variants feel related but are properly tuned for their respective modes.`;

const ICON_THEME_PROMPT = `Create a Better Hub file icon theme in this repo. Generate the following files:

1. \`better-hub-extension.json\` (at repo root) — the manifest:
{
  "$schema": "https://better-hub.com/schemas/icon-theme-manifest.schema.json",
  "name": "<theme name>",
  "description": "<short description>",
  "version": "1.0.0",
  "type": "icon-theme",
  "main": "icons/icon-theme.json",
  "icon": "icon.png",
  "license": "MIT"
}

2. \`icons/icon-theme.json\` — the icon mapping file:
{
  "$schema": "https://better-hub.com/schemas/icon-theme-data.schema.json",
  "baseURL": "https://raw.githubusercontent.com/<owner>/<repo>/HEAD/icons/",
  "defaultFile": "file",
  "defaultFolder": "folder",
  "fileIcons": [
    { "name": "typescript", "fileExtensions": ["ts", "tsx", "mts", "cts"] },
    { "name": "javascript", "fileExtensions": ["js", "jsx", "mjs", "cjs"] },
    { "name": "json", "fileExtensions": ["json", "jsonc", "json5"] },
    { "name": "markdown", "fileExtensions": ["md", "mdx"] },
    { "name": "docker", "fileNames": ["Dockerfile", "docker-compose.yml"] },
    { "name": "git", "fileNames": [".gitignore", ".gitattributes"] },
    { "name": "package", "fileNames": ["package.json"] }
  ],
  "folderIcons": [
    { "name": "folder-src", "folderNames": ["src", "source", "lib"] },
    { "name": "folder-test", "folderNames": ["test", "tests", "__tests__"] },
    { "name": "folder-config", "folderNames": ["config", "configs", ".config"] },
    { "name": "folder-public", "folderNames": ["public", "static", "assets"] },
    { "name": "folder-component", "folderNames": ["components", "ui"] }
  ]
}

3. SVG icon files in the \`icons/\` folder — one \`.svg\` file for each icon name referenced above (e.g. \`typescript.svg\`, \`folder-src.svg\`, \`file.svg\`, \`folder.svg\`).

Each icon should be a clean, minimal SVG at 24x24 or 16x16 viewBox. Use a consistent visual style across all icons. The "baseURL" + icon name + ".svg" forms the final URL, so filenames must match exactly.

Update the baseURL to point to the actual GitHub raw URL for this repo.`;

function CopyButton({ text }: { text: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<button
			onClick={() => {
				navigator.clipboard.writeText(text);
				setCopied(true);
				setTimeout(() => setCopied(false), 1500);
			}}
			className="absolute top-2 right-2 p-1 rounded-sm bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
		>
			{copied ? <Check className="size-3" /> : <Copy className="size-3" />}
		</button>
	);
}

function CopyPromptButton({ prompt }: { prompt: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<button
			onClick={() => {
				navigator.clipboard.writeText(prompt);
				setCopied(true);
				setTimeout(() => setCopied(false), 2000);
			}}
			className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-md border transition-colors shrink-0 ${
				copied
					? "border-success/30 bg-success/5 text-success"
					: "border-border bg-muted/40 text-muted-foreground hover:text-foreground hover:bg-muted"
			}`}
		>
			{copied ? <Check className="size-3" /> : <Sparkles className="size-3" />}
			{copied ? "Copied!" : "Copy Prompt"}
		</button>
	);
}

function CodeBlock({ code, filename }: { code: string; filename: string }) {
	return (
		<div className="group">
			<div className="text-[10px] font-mono text-muted-foreground/60 mb-1">
				{filename}
			</div>
			<div
				className="relative border border-border rounded-md overflow-hidden text-[11px] [&_.codeblock-preview]:!text-[11px]"
				style={{ backgroundColor: "var(--code-bg)" }}
			>
				<HighlightedCodeBlock code={code} lang="json" />
				<CopyButton text={code} />
			</div>
		</div>
	);
}

function Step({
	number,
	title,
	children,
	isLast = false,
}: {
	number: number;
	title: React.ReactNode;
	children: React.ReactNode;
	isLast?: boolean;
}) {
	return (
		<div className="flex gap-3">
			<div className="flex flex-col items-center shrink-0">
				<div className="flex items-center justify-center size-5 rounded-full bg-primary/10 text-primary text-[10px] font-bold">
					{number}
				</div>
				{!isLast && <div className="w-px flex-1 bg-border mt-1.5" />}
			</div>
			<div className={`min-w-0 flex-1 space-y-2 ${isLast ? "" : "pb-5"}`}>
				<h4 className="text-xs font-medium text-foreground">{title}</h4>
				{children}
			</div>
		</div>
	);
}

function ColorThemeDocs() {
	return (
		<div>
			<Step number={1} title="Create a public GitHub repo">
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Create a new public repository on GitHub. This is where your
					theme files will live.
				</p>
			</Step>

			<Step
				number={2}
				title={
					<>
						Add{" "}
						<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
							better-hub-extension.json
						</code>
					</>
				}
			>
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Create this manifest file at the root of your repo.
				</p>
				<CodeBlock
					code={COLOR_THEME_MANIFEST}
					filename="better-hub-extension.json"
				/>
			</Step>

			<Step number={3} title="Create your theme data file">
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Create the JSON file referenced by{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						main
					</code>{" "}
					in the manifest. It needs a{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						dark
					</code>{" "}
					and{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						light
					</code>{" "}
					variant, each with{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						colors
					</code>
					,{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						accentPreview
					</code>
					, and{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						bgPreview
					</code>
					. Colors use HSL format without the{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						hsl()
					</code>{" "}
					wrapper.
				</p>
				<CodeBlock code={COLOR_THEME_DATA} filename="theme.json" />
			</Step>

			<Step number={4} title="Publish" isLast>
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Click the{" "}
					<span className="font-medium text-foreground">Publish</span>{" "}
					button, paste your repo URL, and you&apos;re done.
				</p>
			</Step>
		</div>
	);
}

function IconThemeDocs() {
	return (
		<div>
			<Step number={1} title="Create a public GitHub repo">
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Create a new public repository on GitHub. Add an{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						icons/
					</code>{" "}
					folder for your SVG icon files.
				</p>
			</Step>

			<Step
				number={2}
				title={
					<>
						Add{" "}
						<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
							better-hub-extension.json
						</code>
					</>
				}
			>
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Create this manifest file at the root of your repo. Set{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						type
					</code>{" "}
					to{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						&quot;icon-theme&quot;
					</code>{" "}
					and{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						main
					</code>{" "}
					to the path of your icon mapping file.
				</p>
				<CodeBlock
					code={ICON_THEME_MANIFEST}
					filename="better-hub-extension.json"
				/>
			</Step>

			<Step number={3} title="Create the icon mapping file">
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					This JSON maps file extensions and filenames to icon names.{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						baseURL
					</code>{" "}
					is the raw GitHub URL to your icons folder — each icon name
					gets{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						.svg
					</code>{" "}
					appended automatically.
				</p>
				<CodeBlock
					code={ICON_THEME_DATA}
					filename="icons/icon-theme.json"
				/>
			</Step>

			<Step number={4} title="Add your SVG icons">
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Place SVG files in your icons folder matching the names you
					defined. For example,{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						typescript.svg
					</code>
					,{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						folder-src.svg
					</code>
					,{" "}
					<code className="text-[10px] bg-muted px-1 py-0.5 rounded font-mono">
						file.svg
					</code>{" "}
					(default).
				</p>
			</Step>

			<Step number={5} title="Publish" isLast>
				<p className="text-[11px] text-muted-foreground leading-relaxed">
					Click the{" "}
					<span className="font-medium text-foreground">Publish</span>{" "}
					button, paste your repo URL, and you&apos;re done.
				</p>
			</Step>
		</div>
	);
}

export function DocsDialog() {
	const [docType, setDocType] = useState<DocType>("theme");

	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button size="sm" variant="outline" className="gap-1.5">
					<BookOpen className="size-3.5" />
					<span className="hidden sm:inline">Docs</span>
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
				<DialogHeader>
					<DialogTitle className="text-base">
						Create a Custom Theme
					</DialogTitle>
					<DialogDescription>
						Follow these steps to create and publish your own
						custom theme.
					</DialogDescription>
				</DialogHeader>

				<div className="flex items-center justify-between gap-2">
					<div className="flex items-center gap-1 bg-muted/40 border border-border rounded-md p-0.5">
						<button
							onClick={() => setDocType("theme")}
							className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
								docType === "theme"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<Palette className="size-3" />
							Color Theme
						</button>
						<button
							onClick={() => setDocType("icon-theme")}
							className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-sm transition-colors ${
								docType === "icon-theme"
									? "bg-background text-foreground shadow-sm"
									: "text-muted-foreground hover:text-foreground"
							}`}
						>
							<FolderTree className="size-3" />
							File Icon Theme
						</button>
					</div>
					<CopyPromptButton
						prompt={
							docType === "theme"
								? COLOR_THEME_PROMPT
								: ICON_THEME_PROMPT
						}
					/>
				</div>

				{docType === "theme" ? <ColorThemeDocs /> : <IconThemeDocs />}
			</DialogContent>
		</Dialog>
	);
}
