export default function TrendingLoading() {
	return (
		<div className="animate-pulse">
			{/* Tab bar */}
			<div className="flex items-center gap-1 mb-4">
				<div className="h-7 w-16 rounded bg-muted/40" />
				<div className="h-7 w-16 rounded bg-muted/25" />
				<div className="h-7 w-20 rounded bg-muted/25" />
			</div>

			{/* Repo card list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 12 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-5 w-5 rounded bg-muted/30 shrink-0 mt-0.5" />
						<div className="flex-1 space-y-1.5">
							<div className="flex items-center gap-2">
								<div
									className="h-3.5 rounded bg-muted/40"
									style={{
										width: `${120 + (i % 6) * 25}px`,
									}}
								/>
							</div>
							<div
								className="h-2.5 rounded bg-muted/20"
								style={{
									width: `${180 + (i % 4) * 40}px`,
								}}
							/>
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-1">
									<div className="h-2.5 w-2.5 rounded-full bg-muted/30" />
									<div className="h-2.5 w-14 rounded bg-muted/20" />
								</div>
								<div className="flex items-center gap-1">
									<div className="h-2.5 w-3 rounded bg-muted/15" />
									<div className="h-2.5 w-10 rounded bg-muted/15" />
								</div>
								<div className="flex items-center gap-1">
									<div className="h-2.5 w-3 rounded bg-muted/15" />
									<div className="h-2.5 w-10 rounded bg-muted/15" />
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
