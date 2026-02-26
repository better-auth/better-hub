export default function PersonDetailLoading() {
	return (
		<div className="animate-pulse">
			{/* Profile header */}
			<div className="flex items-start gap-4 my-6">
				<div className="h-16 w-16 rounded-full bg-muted/40 shrink-0" />
				<div className="space-y-2 flex-1">
					<div className="h-5 w-36 rounded bg-muted/50" />
					<div className="h-3 w-24 rounded bg-muted/25" />
					<div className="h-3 w-48 rounded bg-muted/20" />
				</div>
			</div>

			{/* Activity chart */}
			<div className="border border-border/40 rounded-md p-4 mb-4">
				<div className="h-4 w-28 rounded bg-muted/35 mb-4" />
				<div className="h-24 rounded bg-muted/15" />
			</div>

			{/* Recent activity */}
			<div className="border border-border/40 rounded-md p-4">
				<div className="h-4 w-24 rounded bg-muted/35 mb-4" />
				<div className="space-y-3">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-2">
							<div className="h-4 w-4 rounded bg-muted/25 shrink-0" />
							<div
								className="h-3 rounded bg-muted/25"
								style={{
									width: `${120 + Math.random() * 200}px`,
								}}
							/>
							<div className="h-2.5 w-14 rounded bg-muted/15 ml-auto shrink-0" />
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
