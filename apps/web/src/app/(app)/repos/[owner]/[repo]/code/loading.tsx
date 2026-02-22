export default function CodeLoading() {
	return (
		<div className="animate-pulse">
			{/* Branch selector + toolbar */}
			<div className="flex items-center gap-3 mb-3">
				<div className="h-8 w-36 rounded border border-border/40 bg-muted/30" />
				<div className="flex-1 flex items-center gap-2">
					<div className="h-8 w-24 rounded bg-muted/30" />
					<div className="h-8 w-8 rounded bg-muted/30 ml-auto" />
				</div>
			</div>

			{/* File list */}
			<div className="border border-border rounded-md overflow-hidden">
				{Array.from({ length: 12 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center gap-3 px-3 py-2 border-b border-border/40 last:border-b-0"
					>
						<div
							className={`h-4 w-4 rounded ${i < 4 ? "bg-muted/50" : "bg-muted/30"}`}
						/>
						<div
							className="h-3 rounded bg-muted/40"
							style={{
								width: `${60 + Math.random() * 120}px`,
							}}
						/>
						{i >= 4 && (
							<div className="h-3 w-12 rounded bg-muted/20 ml-auto" />
						)}
					</div>
				))}
			</div>

			{/* README */}
			<div className="mt-6 border border-border rounded-md overflow-hidden">
				<div className="px-4 py-2 border-b border-border bg-muted/30">
					<div className="h-3 w-20 rounded bg-muted/50" />
				</div>
				<div className="px-6 py-5 space-y-3">
					<div className="h-5 w-48 rounded bg-muted/40" />
					<div className="h-3 w-full rounded bg-muted/30" />
					<div className="h-3 w-5/6 rounded bg-muted/30" />
					<div className="h-3 w-4/6 rounded bg-muted/30" />
				</div>
			</div>
		</div>
	);
}
