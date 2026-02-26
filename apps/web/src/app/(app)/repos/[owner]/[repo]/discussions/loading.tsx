export default function DiscussionsLoading() {
	return (
		<div className="animate-pulse">
			{/* Category filter pills */}
			<div className="flex items-center gap-2 mb-4">
				<div className="h-7 w-16 rounded-full bg-muted/40" />
				<div className="h-7 w-20 rounded-full bg-muted/30" />
				<div className="h-7 w-24 rounded-full bg-muted/30" />
				<div className="h-7 w-18 rounded-full bg-muted/30" />
			</div>

			{/* Tabs */}
			<div className="flex items-center gap-2 mb-4">
				<div className="h-7 w-14 rounded bg-muted/40" />
				<div className="h-7 w-20 rounded bg-muted/30" />
				<div className="h-7 w-24 rounded bg-muted/30" />
			</div>

			{/* Discussion list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-4 w-4 rounded-full bg-muted/50 mt-0.5 shrink-0" />
						<div className="flex-1 space-y-1.5">
							<div className="flex items-center gap-2">
								<div
									className="h-3.5 rounded bg-muted/40"
									style={{
										width: `${150 + Math.random() * 200}px`,
									}}
								/>
								{i % 2 === 0 && (
									<div className="h-4 w-20 rounded-full bg-muted/30" />
								)}
							</div>
							<div className="flex items-center gap-2">
								<div className="h-4 w-4 rounded-full bg-muted/20" />
								<div className="h-2.5 w-16 rounded bg-muted/20" />
								<div className="flex items-center gap-1 ml-auto">
									<div className="h-3 w-3 rounded bg-muted/20" />
									<div className="h-2.5 w-4 rounded bg-muted/20" />
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
