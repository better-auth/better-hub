export default function InsightsLoading() {
	return (
		<div className="animate-pulse space-y-6">
			{/* Commit activity chart */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-32 rounded bg-muted/40 mb-4" />
				<div className="h-40 rounded bg-muted/15" />
			</div>

			{/* Two-column grid */}
			<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
				{/* Code frequency */}
				<div className="border border-border/40 rounded-md p-4">
					<div className="h-4 w-28 rounded bg-muted/40 mb-4" />
					<div className="h-32 rounded bg-muted/15" />
				</div>

				{/* Participation */}
				<div className="border border-border/40 rounded-md p-4">
					<div className="h-4 w-24 rounded bg-muted/40 mb-4" />
					<div className="h-32 rounded bg-muted/15" />
				</div>
			</div>

			{/* Languages */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-24 rounded bg-muted/40 mb-4" />
				<div className="h-3 w-full rounded-full bg-muted/20 mb-4" />
				<div className="flex flex-wrap gap-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<div key={i} className="flex items-center gap-1.5">
							<div className="h-2.5 w-2.5 rounded-full bg-muted/40" />
							<div className="h-3 w-14 rounded bg-muted/25" />
							<div className="h-3 w-8 rounded bg-muted/15" />
						</div>
					))}
				</div>
			</div>

			{/* Top contributors */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-32 rounded bg-muted/40 mb-4" />
				<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
					{Array.from({ length: 6 }).map((_, i) => (
						<div
							key={i}
							className="flex items-center gap-2 p-2 rounded border border-border/30"
						>
							<div className="h-8 w-8 rounded-full bg-muted/30 shrink-0" />
							<div className="space-y-1">
								<div className="h-3 w-20 rounded bg-muted/30" />
								<div className="h-2.5 w-14 rounded bg-muted/15" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
