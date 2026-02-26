import { highlightCode } from "@/lib/shiki";
import { renderMarkdownToHtml } from "@/components/shared/markdown-renderer";
import { NotebookViewerClient } from "./notebook-viewer-client";

interface NotebookCell {
	cell_type: "code" | "markdown" | "raw";
	source: string[] | string;
	outputs?: NotebookOutput[];
	execution_count?: number | null;
	metadata?: Record<string, unknown>;
}

interface NotebookOutput {
	output_type: string;
	text?: string[] | string;
	data?: Record<string, string[] | string>;
	ename?: string;
	evalue?: string;
	traceback?: string[];
	name?: string;
}

interface Notebook {
	cells: NotebookCell[];
	metadata?: {
		kernelspec?: { language?: string; display_name?: string };
		language_info?: { name?: string };
	};
}

function joinSource(source: string[] | string): string {
	return Array.isArray(source) ? source.join("") : source;
}

function getOutputText(output: NotebookOutput): string {
	if (output.text) return joinSource(output.text);
	if (output.data) {
		if (output.data["text/plain"]) return joinSource(output.data["text/plain"]);
	}
	if (output.traceback) return output.traceback.join("\n");
	if (output.ename) return `${output.ename}: ${output.evalue || ""}`;
	return "";
}

function getOutputHtml(output: NotebookOutput): string | null {
	if (output.data?.["text/html"]) return joinSource(output.data["text/html"]);
	return null;
}

function getOutputImage(output: NotebookOutput): { src: string; mime: string } | null {
	const data = output.data;
	if (!data) return null;
	for (const mime of ["image/png", "image/jpeg", "image/gif", "image/svg+xml"]) {
		if (data[mime]) {
			const raw = joinSource(data[mime]);
			if (mime === "image/svg+xml") {
				return {
					src: `data:${mime};utf8,${encodeURIComponent(raw)}`,
					mime,
				};
			}
			return { src: `data:${mime};base64,${raw.trim()}`, mime };
		}
	}
	return null;
}

// Strip ANSI escape codes from terminal output
function stripAnsi(str: string): string {
	// eslint-disable-next-line no-control-regex
	return str.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

export interface RenderedCell {
	type: "code" | "markdown" | "raw";
	executionCount: number | null;
	sourceHtml: string;
	source: string;
	outputs: RenderedOutput[];
	markdownHtml?: string;
}

export interface RenderedOutput {
	type: "text" | "html" | "image" | "error";
	content: string;
	mime?: string;
}

export async function NotebookViewer({
	content,
	repoContext,
}: {
	content: string;
	repoContext?: { owner: string; repo: string; branch: string; dir: string };
}) {
	let notebook: Notebook;
	try {
		notebook = JSON.parse(content);
	} catch {
		return (
			<div className="border border-border py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					Invalid notebook format
				</p>
			</div>
		);
	}

	if (!notebook.cells || !Array.isArray(notebook.cells)) {
		return (
			<div className="border border-border py-16 text-center">
				<p className="text-xs text-muted-foreground font-mono">
					No cells found in notebook
				</p>
			</div>
		);
	}

	const kernelLang =
		notebook.metadata?.language_info?.name ||
		notebook.metadata?.kernelspec?.language ||
		"python";

	const renderedCells: RenderedCell[] = await Promise.all(
		notebook.cells.map(async (cell) => {
			const source = joinSource(cell.source);

			if (cell.cell_type === "markdown") {
				const mdHtml = await renderMarkdownToHtml(source, repoContext);
				return {
					type: "markdown" as const,
					executionCount: null,
					sourceHtml: "",
					source,
					outputs: [],
					markdownHtml: mdHtml,
				};
			}

			// Code or raw cell — highlight source
			const lang = cell.cell_type === "code" ? kernelLang : "text";
			const sourceHtml = source.trim() ? await highlightCode(source, lang) : "";

			// Process outputs
			const outputs: RenderedOutput[] = [];
			for (const output of cell.outputs || []) {
				const img = getOutputImage(output);
				if (img) {
					outputs.push({
						type: "image",
						content: img.src,
						mime: img.mime,
					});
					continue;
				}

				const html = getOutputHtml(output);
				if (html) {
					outputs.push({ type: "html", content: html });
					continue;
				}

				if (output.output_type === "error" && output.traceback) {
					outputs.push({
						type: "error",
						content: stripAnsi(output.traceback.join("\n")),
					});
					continue;
				}

				const text = getOutputText(output);
				if (text) {
					outputs.push({ type: "text", content: stripAnsi(text) });
				}
			}

			return {
				type: cell.cell_type as "code" | "raw",
				executionCount: cell.execution_count ?? null,
				sourceHtml,
				source,
				outputs,
			};
		}),
	);

	const kernelName = notebook.metadata?.kernelspec?.display_name || kernelLang;

	return (
		<NotebookViewerClient
			cells={renderedCells}
			kernelName={kernelName}
			cellCount={renderedCells.length}
		/>
	);
}
