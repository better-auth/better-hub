export default function PullsLoading() {
	return (
		<div className="animate-pulse">
			{/* Toolbar */}
			<div className="flex items-center gap-2 mb-4">
				<div className="flex items-center gap-1">
					<div className="h-7 w-20 rounded bg-muted/40" />
					<div className="h-7 w-20 rounded bg-muted/30" />
					<div className="h-7 w-16 rounded bg-muted/30" />
				</div>
				<div className="h-7 flex-1 max-w-xs rounded border border-border/40 bg-muted/20" />
				<div className="h-7 w-20 rounded bg-muted/30" />
				<div className="h-7 w-20 rounded bg-muted/30" />
			</div>

			{/* PR list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 8 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-4 w-4 rounded-full bg-muted/50 mt-0.5 shrink-0" />
						<div className="flex-1 space-y-1.5">
							<div className="flex items-center gap-2">
								<div className="h-3 w-8 rounded bg-muted/30" />
								<div
									className="h-3.5 rounded bg-muted/40"
									style={{
										width: `${150 + Math.random() * 200}px`,
									}}
								/>
								{i % 4 === 0 && (
									<div className="h-4 w-14 rounded-full bg-muted/30" />
								)}
							</div>
							<div className="flex items-center gap-2">
								<div className="h-4 w-4 rounded-full bg-muted/20" />
								<div className="h-2.5 w-16 rounded bg-muted/20" />
								<div className="flex items-center gap-1 ml-auto">
									<div className="h-3 w-12 rounded bg-muted/15 font-mono" />
									<div className="h-2.5 w-2 rounded bg-muted/10" />
									<div className="h-3 w-10 rounded bg-muted/15" />
								</div>
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
