export default function PromptsLoading() {
	return (
		<div className="animate-pulse">
			{/* Header */}
			<div className="flex items-center gap-3 mb-4">
				<div className="h-4 w-32 rounded bg-muted/40" />
				<div className="h-7 w-28 rounded bg-muted/30 ml-auto" />
			</div>

			{/* Prompt list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 6 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-4 w-4 rounded bg-muted/30 mt-0.5 shrink-0" />
						<div className="flex-1 space-y-1.5">
							<div
								className="h-3.5 rounded bg-muted/40"
								style={{
									width: `${120 + Math.random() * 180}px`,
								}}
							/>
							<div className="flex items-center gap-2">
								<div className="h-5 w-14 rounded-full bg-muted/25" />
								<div className="h-2.5 w-20 rounded bg-muted/15" />
							</div>
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
