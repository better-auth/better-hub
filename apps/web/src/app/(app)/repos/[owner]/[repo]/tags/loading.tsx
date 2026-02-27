export default function TagsLoading() {
	return (
		<div className="animate-pulse px-4 py-4">
			<div className="flex items-center justify-between mb-4">
				<div className="h-4 w-20 rounded bg-muted/40" />
				<div className="h-7 w-48 rounded border border-border/30 bg-muted/20" />
			</div>

			<div className="border border-border/40 rounded-md overflow-hidden divide-y divide-border/30">
				{Array.from({ length: 10 }).map((_, i) => (
					<div key={i} className="flex items-center gap-3 px-4 py-3">
						<div className="h-4 w-4 rounded bg-muted/30 shrink-0" />
						<div className="flex-1 space-y-1">
							<div className="h-3.5 w-32 rounded bg-muted/40" />
							<div className="h-2.5 w-20 rounded bg-muted/20" />
						</div>
						<div className="flex items-center gap-2">
							<div className="h-6 w-16 rounded border border-border/30 bg-muted/20" />
							<div className="h-6 w-16 rounded border border-border/30 bg-muted/20" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
