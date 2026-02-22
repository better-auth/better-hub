export default function CommitsLoading() {
	return (
		<div className="animate-pulse">
			{/* Branch picker */}
			<div className="flex items-center gap-3 mb-4">
				<div className="h-8 w-40 rounded border border-border/40 bg-muted/30" />
			</div>

			{/* Commits grouped by date */}
			{Array.from({ length: 3 }).map((_, g) => (
				<div key={g} className="mb-6">
					<div className="h-3 w-28 rounded bg-muted/30 mb-3" />
					<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
						{Array.from({ length: g === 0 ? 5 : 3 }).map(
							(_, i) => (
								<div
									key={i}
									className="flex items-center gap-3 px-4 py-3"
								>
									<div className="h-4 w-4 rounded bg-muted/30 shrink-0" />
									<div className="flex-1 space-y-1">
										<div
											className="h-3.5 rounded bg-muted/40"
											style={{
												width: `${200 + Math.random() * 200}px`,
											}}
										/>
										<div className="flex items-center gap-2">
											<div className="h-4 w-4 rounded-full bg-muted/25" />
											<div className="h-2.5 w-20 rounded bg-muted/20" />
										</div>
									</div>
									<div className="h-3 w-16 rounded bg-muted/20 font-mono shrink-0" />
								</div>
							),
						)}
					</div>
				</div>
			))}
		</div>
	);
}
