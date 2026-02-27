"use client";

import { cn } from "@/lib/utils";
import type { RenderedCell, RenderedOutput } from "./notebook-viewer";

function CellBadge({ count }: { count: number | null }) {
	return (
		<div className="w-[52px] shrink-0 text-right pr-3 select-none">
			{count != null && (
				<span className="text-[11px] font-mono text-muted-foreground/50">
					[{count}]
				</span>
			)}
		</div>
	);
}

function OutputBlock({ output }: { output: RenderedOutput }) {
	if (output.type === "image") {
		return (
			<div className="py-2">
				{/* eslint-disable-next-line @next/next/no-img-element */}
				<img
					src={output.content}
					alt="Cell output"
					className="max-w-full max-h-[600px] object-contain"
				/>
			</div>
		);
	}

	if (output.type === "html") {
		return (
			<div
				className="py-2 overflow-x-auto text-[13px] [&_table]:border-collapse [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:bg-muted/40"
				dangerouslySetInnerHTML={{ __html: output.content }}
			/>
		);
	}

	if (output.type === "error") {
		return (
			<pre className="py-2 text-[12px] leading-relaxed font-mono whitespace-pre-wrap text-red-400 overflow-x-auto">
				{output.content}
			</pre>
		);
	}

	// text
	return (
		<pre className="py-2 text-[12px] leading-relaxed font-mono whitespace-pre-wrap text-foreground/80 overflow-x-auto">
			{output.content}
		</pre>
	);
}

function CodeCell({ cell }: { cell: RenderedCell }) {
	return (
		<div className="flex border-b border-border/50 last:border-b-0">
			<CellBadge count={cell.executionCount} />
			<div className="flex-1 min-w-0 py-1">
				{cell.sourceHtml && (
					<div
						className="notebook-code-cell text-[13px] leading-relaxed [&_pre]:!bg-transparent [&_pre]:!m-0 [&_pre]:!p-0 [&_code]:!bg-transparent overflow-x-auto"
						dangerouslySetInnerHTML={{
							__html: cell.sourceHtml,
						}}
					/>
				)}
				{cell.outputs.length > 0 && (
					<div className="border-t border-border/30 mt-1 pt-1 px-1">
						{cell.outputs.map((output, i) => (
							<OutputBlock key={i} output={output} />
						))}
					</div>
				)}
			</div>
		</div>
	);
}

function MarkdownCell({ cell }: { cell: RenderedCell }) {
	return (
		<div className="flex border-b border-border/50 last:border-b-0">
			<div className="w-[52px] shrink-0" />
			<div className="flex-1 min-w-0 py-3 px-1">
				<div
					className="prose-invert prose-sm max-w-none text-foreground/90 [&_h1]:text-lg [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-1.5 [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:mt-2 [&_h3]:mb-1 [&_p]:text-[13px] [&_p]:leading-relaxed [&_p]:my-1.5 [&_ul]:text-[13px] [&_ol]:text-[13px] [&_li]:my-0.5 [&_code]:text-[12px] [&_code]:bg-muted/60 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded [&_pre]:bg-muted/40 [&_pre]:p-3 [&_pre]:rounded [&_pre]:text-[12px] [&_a]:text-link [&_a]:underline [&_img]:max-w-full [&_blockquote]:border-l-2 [&_blockquote]:border-border [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_table]:text-xs [&_td]:border [&_td]:border-border [&_td]:px-2 [&_td]:py-1 [&_th]:border [&_th]:border-border [&_th]:px-2 [&_th]:py-1 [&_th]:text-left [&_th]:bg-muted/40 [&_hr]:border-border"
					dangerouslySetInnerHTML={{
						__html: cell.markdownHtml || "",
					}}
				/>
			</div>
		</div>
	);
}

export function NotebookViewerClient({
	cells,
	kernelName,
	cellCount,
}: {
	cells: RenderedCell[];
	kernelName: string;
	cellCount: number;
}) {
	return (
		<div className="border border-border rounded-md overflow-hidden">
			{/* Header */}
			<div className="flex items-center gap-3 px-3 py-2 border-b border-border bg-muted/20">
				<span className="text-[11px] font-mono text-muted-foreground/60">
					{cellCount} cells
				</span>
				<span className="text-[11px] font-mono text-muted-foreground/60">
					{kernelName}
				</span>
			</div>

			{/* Cells */}
			<div className={cn("divide-y-0")}>
				{cells.map((cell, i) =>
					cell.type === "markdown" ? (
						<MarkdownCell key={i} cell={cell} />
					) : (
						<CodeCell key={i} cell={cell} />
					),
				)}
			</div>
		</div>
	);
}
