"use client";

import { useMemo } from "react";
import { ClientMarkdown } from "@/components/shared/client-markdown";
import { HighlightedCodeBlock } from "@/components/shared/highlighted-code-block";
import { cn } from "@/lib/utils";

// Standard Jupyter Notebook JSON structure
interface Output {
	output_type: string;
	text?: string | string[];
	data?: Record<string, string | string[]>;
	execution_count?: number | null;
	ename?: string;
	evalue?: string;
	traceback?: string[];
}

interface Cell {
	cell_type: "markdown" | "code" | "raw";
	execution_count?: number | null;
	source: string | string[];
	outputs?: Output[];
}

interface Notebook {
	cells: Cell[];
	metadata?: {
		language_info?: { name: string };
	};
}

/**
 * Jupyter MathJax is very forgiving, but standard remark-math is strict.
 * This preprocessor cleans up common Jupyter math quirks before rendering.
 */
function preprocessJupyterMarkdown(source: string) {
	let text = source;

	// 1. Upgrade inline math ($...$) containing \tag{} to block math ($$...$$).
	// KaTeX strictly forbids \tag{} in inline mode and will crash/fail to style it.
	text = text.replace(
		/(^|[^$])\$([^$]+?\\tag\{[^}]+\}[^$]*?)\$([^$]|$)/g,
		"$1$$$$$2$$$$$3",
	);

	// 2. Wrap naked LaTeX environments (like \begin{equation}...\end{equation}) in $$...$$
	// remark-math completely ignores these otherwise.
	text = text.replace(
		/(^|\n)(\\begin\{[a-zA-Z*]+\}[\s\S]*?\\end\{[a-zA-Z*]+\})(\n|$)/g,
		"$1$$$$\n$2\n$$$$$3",
	);

	return text;
}

export function NotebookViewer({ content }: { content: string }) {
	const notebook = useMemo<Notebook | null>(() => {
		try {
			return JSON.parse(content);
		} catch (e) {
			console.error("Failed to parse Jupyter Notebook", e);
			return null;
		}
	}, [content]);

	if (!notebook) {
		return (
			<div className="p-8 text-center text-muted-foreground font-mono text-sm border border-border rounded-md">
				Failed to parse Jupyter Notebook. The file might be corrupted.
			</div>
		);
	}

	const language = notebook.metadata?.language_info?.name || "python";

	return (
		<div
			className={cn(
				"flex flex-col w-full text-base py-6 bg-background",
				// 1. Force Shiki's inner <pre> to be transparent and NOT establish a scroll context
				"[&_.notebook-code_pre.shiki]:!p-0 [&_.notebook-code_pre.shiki]:!m-0 [&_.notebook-code_pre.shiki]:!bg-transparent [&_.notebook-code_pre.shiki]:!overflow-visible",
				// 2. Syntax Highlighting map
				"[&_.notebook-code_.shiki_span]:!text-[var(--shiki-light)] dark:[&_.notebook-code_.shiki_span]:!text-[var(--shiki-dark)]",
			)}
		>
			{notebook.cells.map((cell, idx) => (
				<NotebookCell key={idx} cell={cell} language={language} />
			))}
		</div>
	);
}

function NotebookCell({ cell, language }: { cell: Cell; language: string }) {
	const rawSource = Array.isArray(cell.source) ? cell.source.join("") : cell.source;

	if (cell.cell_type === "markdown") {
		const processedSource = preprocessJupyterMarkdown(rawSource);
		return (
			<div className="flex w-full mb-4">
				<div className="w-[80px] shrink-0"></div>
				{/* overflow-x-auto placed on the WRAPPER instead of the math element so tags don't break */}
				<div className="flex-1 min-w-0 pr-6 overflow-x-auto no-scrollbar">
					<ClientMarkdown
						content={processedSource}
						className="!max-w-none"
					/>
				</div>
			</div>
		);
	}

	if (cell.cell_type === "code") {
		return (
			<div className="flex flex-col w-full mb-6 group">
				<div className="flex w-full items-start">
					<div className="w-[80px] shrink-0 text-right pr-4 font-mono text-[12px] pt-3 text-link/80 select-none">
						{cell.execution_count
							? `In [${cell.execution_count}]:`
							: "In [ ]:"}
					</div>
					<div className="flex-1 min-w-0 pr-6">
						{/* Strictly clamp down on scrollbars here */}
						<div className="border border-border rounded-md bg-code-block-bg min-w-0 w-full overflow-hidden">
							<HighlightedCodeBlock
								code={rawSource}
								lang={language}
								className="p-3 text-[13px] m-0 notebook-code overflow-x-auto overflow-y-hidden no-scrollbar"
							/>
						</div>
					</div>
				</div>

				{cell.outputs && cell.outputs.length > 0 && (
					<div className="flex flex-col w-full mt-2 space-y-2">
						{cell.outputs.map((output, idx) => (
							<NotebookOutput key={idx} output={output} />
						))}
					</div>
				)}
			</div>
		);
	}

	return null;
}

function NotebookOutput({ output }: { output: Output }) {
	const isStream = output.output_type === "stream";
	const isError = output.output_type === "error";
	const isData =
		output.output_type === "display_data" || output.output_type === "execute_result";

	if (isStream) {
		const text = Array.isArray(output.text) ? output.text.join("") : output.text;
		return (
			<div className="flex w-full items-start">
				<div className="w-[80px] shrink-0"></div>
				<div className="flex-1 min-w-0 pr-6 overflow-x-auto no-scrollbar">
					<pre className="text-[12px] text-foreground font-mono whitespace-pre-wrap leading-relaxed">
						{text}
					</pre>
				</div>
			</div>
		);
	}

	if (isError) {
		const traceback =
			output.traceback?.join("\n") || `${output.ename}: ${output.evalue}`;
		const cleanTraceback = traceback.replace(/\u001B\[[0-9;]*[a-zA-Z]/g, "");
		return (
			<div className="flex w-full items-start">
				<div className="w-[80px] shrink-0"></div>
				<div className="flex-1 min-w-0 pr-6 overflow-x-auto no-scrollbar">
					<pre className="text-[12px] text-destructive font-mono whitespace-pre-wrap leading-relaxed p-4 bg-destructive/10 border border-destructive/20 rounded-md">
						{cleanTraceback}
					</pre>
				</div>
			</div>
		);
	}

	if (isData && output.data) {
		const data = output.data;
		const prompt = output.execution_count ? `Out[${output.execution_count}]:` : "";

		return (
			<div className="flex w-full items-start mt-1">
				<div className="w-[80px] shrink-0 text-right pr-4 font-mono text-[12px] pt-1 text-destructive/80 select-none">
					{prompt}
				</div>
				<div className="flex-1 min-w-0 pr-6 overflow-x-auto no-scrollbar">
					{data["image/png"] ? (
						<img
							src={`data:image/png;base64,${
								Array.isArray(data["image/png"])
									? data["image/png"].join("")
									: data["image/png"]
							}`}
							alt="Cell output"
							className="max-w-full bg-white rounded-sm p-2 border border-border"
						/>
					) : data["image/jpeg"] ? (
						<img
							src={`data:image/jpeg;base64,${
								Array.isArray(data["image/jpeg"])
									? data["image/jpeg"].join(
											"",
										)
									: data["image/jpeg"]
							}`}
							alt="Cell output"
							className="max-w-full bg-white rounded-sm p-2 border border-border"
						/>
					) : data["text/html"] ? (
						<div
							className="prose prose-sm dark:prose-invert max-w-none"
							dangerouslySetInnerHTML={{
								__html: Array.isArray(
									data["text/html"],
								)
									? data["text/html"].join("")
									: data["text/html"],
							}}
						/>
					) : data["text/plain"] ? (
						<pre className="text-[12px] text-muted-foreground font-mono whitespace-pre-wrap">
							{Array.isArray(data["text/plain"])
								? data["text/plain"].join("")
								: data["text/plain"]}
						</pre>
					) : null}
				</div>
			</div>
		);
	}

	return null;
}
