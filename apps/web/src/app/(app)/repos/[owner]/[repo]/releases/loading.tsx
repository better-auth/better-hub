export default function ReleasesLoading() {
	return (
		<div className="animate-pulse px-4 py-6">
			{Array.from({ length: 4 }).map((_, i) => (
				<div
					key={i}
					className="mb-8 pb-8 border-b border-border/40 last:border-0"
				>
					<div className="flex items-center gap-2 mb-3">
						<div className="h-5 w-20 rounded-full bg-muted/40" />
						<div className="h-5 w-16 rounded-full bg-muted/30" />
					</div>
					<div className="h-5 w-64 rounded bg-muted/40 mb-2" />
					<div className="flex items-center gap-2 mb-4">
						<div className="h-4 w-4 rounded-full bg-muted/30" />
						<div className="h-3 w-32 rounded bg-muted/20" />
						<div className="h-3 w-20 rounded bg-muted/20" />
					</div>
					<div className="space-y-2 pl-4 border-l-2 border-border/30">
						<div className="h-3 w-full rounded bg-muted/20" />
						<div className="h-3 w-5/6 rounded bg-muted/20" />
						<div className="h-3 w-4/6 rounded bg-muted/20" />
					</div>
					<div className="mt-4 flex gap-2">
						<div className="h-7 w-28 rounded border border-border/30 bg-muted/20" />
						<div className="h-7 w-24 rounded border border-border/30 bg-muted/20" />
					</div>
				</div>
			))}
		</div>
	);
}
