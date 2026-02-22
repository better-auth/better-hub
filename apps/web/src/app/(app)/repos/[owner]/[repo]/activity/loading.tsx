export default function ActivityLoading() {
	return (
		<div className="animate-pulse">
			{/* Commit activity graph */}
			<div className="border border-border/40 rounded-md p-4 mb-6">
				<div className="h-4 w-32 rounded bg-muted/40 mb-4" />
				<div className="flex items-end gap-1 h-24">
					{Array.from({ length: 24 }).map((_, i) => (
						<div
							key={i}
							className="flex-1 rounded-sm bg-muted/30"
							style={{
								height: `${15 + Math.random() * 70}%`,
							}}
						/>
					))}
				</div>
			</div>

			{/* Activity feed */}
			<div className="space-y-0 border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 12 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-6 w-6 rounded-full bg-muted/40 shrink-0" />
						<div className="flex-1 space-y-1">
							<div className="flex items-center gap-2">
								<div className="h-3 w-20 rounded bg-muted/35" />
								<div
									className="h-3 rounded bg-muted/25"
									style={{
										width: `${100 + Math.random() * 200}px`,
									}}
								/>
							</div>
							<div className="h-2.5 w-16 rounded bg-muted/15" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
