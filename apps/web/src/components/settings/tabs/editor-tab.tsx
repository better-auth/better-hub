"use client";

import { HighlightedCodeBlock } from "@/components/shared/highlighted-code-block";

const SAMPLE_CODE = `function fibonacci(n: number): number {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

const result = fibonacci(10);
console.log("Result:", result);`;

export function EditorTab() {
	return (
		<div className="divide-y divide-border overflow-y-auto max-h-[calc(100dvh-220px)]">
			{/* Info */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Syntax Highlighting
				</label>
				<p className="text-[11px] text-muted-foreground/60 mt-0.5 mb-3">
					Code syntax highlighting is automatically derived from your
					selected app theme. Themes with custom syntax colors will
					use those; others fall back to Vitesse.
				</p>
			</div>

			{/* Live Preview */}
			<div className="px-4 py-4">
				<label className="text-[11px] font-mono uppercase tracking-wider text-muted-foreground">
					Preview
				</label>
				<div
					className="mt-2 border border-border overflow-hidden"
					style={{
						backgroundColor: "var(--code-bg)",
					}}
				>
					<div
						className="code-content p-3 overflow-x-auto [&_pre]:!m-0 [&_pre]:!p-0 [&_pre]:!bg-transparent [&_code]:!bg-transparent"
						style={{
							fontFamily: "var(--font-code), ui-monospace, monospace",
							fontSize: "13px",
							lineHeight: "20px",
						}}
					>
						<HighlightedCodeBlock
							code={SAMPLE_CODE}
							lang="typescript"
						/>
					</div>
				</div>
			</div>
		</div>
	);
}
