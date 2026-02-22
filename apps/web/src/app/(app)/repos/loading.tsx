export default function ReposLoading() {
	return (
		<div className="animate-pulse">
			{/* Search bar + controls */}
			<div className="flex items-center gap-2 mb-4">
				<div className="h-7 flex-1 max-w-sm rounded border border-border/40 bg-muted/20" />
				<div className="h-7 w-20 rounded bg-muted/30" />
				<div className="h-7 w-20 rounded bg-muted/30" />
			</div>

			{/* Repo card list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 10 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-5 w-5 rounded bg-muted/30 shrink-0 mt-0.5" />
						<div className="flex-1 space-y-1.5">
							<div className="flex items-center gap-2">
								<div
									className="h-3.5 rounded bg-muted/40"
									style={{
										width: `${130 + (i % 5) * 30}px`,
									}}
								/>
								{i % 4 === 0 && (
									<div className="h-4 w-14 rounded-full bg-muted/25" />
								)}
							</div>
							<div
								className="h-2.5 rounded bg-muted/20"
								style={{
									width: `${200 + (i % 3) * 50}px`,
								}}
							/>
							<div className="flex items-center gap-3">
								<div className="flex items-center gap-1">
									<div className="h-2.5 w-2.5 rounded-full bg-muted/30" />
									<div className="h-2.5 w-14 rounded bg-muted/20" />
								</div>
								<div className="flex items-center gap-1">
									<div className="h-2.5 w-3 rounded bg-muted/15" />
									<div className="h-2.5 w-8 rounded bg-muted/15" />
								</div>
								<div className="h-2.5 w-16 rounded bg-muted/15" />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
