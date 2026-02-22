export default function AdvisoryDetailLoading() {
	return (
		<div className="animate-pulse">
			{/* Advisory header */}
			<div className="mb-6">
				<div className="flex items-center gap-2 mb-2">
					<div className="h-5 w-5 rounded bg-muted/40" />
					<div className="h-5 w-80 max-w-full rounded bg-muted/50" />
				</div>
				<div className="flex items-center gap-3">
					<div className="h-5 w-16 rounded-full bg-muted/35" />
					<div className="h-3 w-24 rounded bg-muted/20" />
					<div className="h-3 w-20 rounded bg-muted/15" />
				</div>
			</div>

			{/* Description */}
			<div className="border border-border/40 rounded-md p-4 mb-4">
				<div className="h-4 w-24 rounded bg-muted/35 mb-3" />
				<div className="space-y-2.5">
					<div className="h-3 w-full rounded bg-muted/25" />
					<div className="h-3 w-5/6 rounded bg-muted/25" />
					<div className="h-3 w-4/6 rounded bg-muted/25" />
				</div>
			</div>

			{/* Affected packages */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-32 rounded bg-muted/35 mb-3" />
				<div className="space-y-2">
					{Array.from({ length: 3 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center gap-3 p-2 rounded border border-border/30"
						>
							<div className="h-3 w-24 rounded bg-muted/25" />
							<div className="h-3 w-16 rounded bg-muted/15" />
							<div className="h-3 w-20 rounded bg-muted/15 ml-auto" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
