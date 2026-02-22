export default function ActionsLoading() {
	return (
		<div className="animate-pulse">
			{/* Header with workflow filter */}
			<div className="flex items-center gap-3 mb-4">
				<div className="h-8 w-44 rounded border border-border/40 bg-muted/30" />
				<div className="h-8 w-24 rounded bg-muted/30" />
			</div>

			{/* Workflow runs list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 10 }).map((_, i) => (
					<div key={i} className="flex items-center gap-3 px-4 py-3">
						<div
							className={`h-4 w-4 rounded-full shrink-0 ${
								i < 2
									? "bg-green-500/30"
									: i === 2
										? "bg-yellow-500/30"
										: i === 3
											? "bg-red-500/30"
											: "bg-muted/30"
							}`}
						/>
						<div className="flex-1 space-y-1">
							<div
								className="h-3.5 rounded bg-muted/40"
								style={{
									width: `${140 + Math.random() * 180}px`,
								}}
							/>
							<div className="flex items-center gap-2">
								<div className="h-2.5 w-16 rounded bg-muted/20" />
								<div className="h-2.5 w-24 rounded bg-muted/15" />
							</div>
						</div>
						<div className="h-3 w-14 rounded bg-muted/20 shrink-0" />
					</div>
				))}
			</div>
		</div>
	);
}
