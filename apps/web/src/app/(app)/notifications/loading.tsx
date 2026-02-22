export default function NotificationsLoading() {
	return (
		<div className="animate-pulse">
			{/* Header */}
			<div className="flex items-center justify-between mb-4">
				<div className="h-5 w-28 rounded bg-muted/40" />
				<div className="flex items-center gap-2">
					<div className="h-7 w-20 rounded bg-muted/30" />
					<div className="h-7 w-24 rounded bg-muted/30" />
				</div>
			</div>

			{/* Notification list */}
			<div className="border border-border rounded-md overflow-hidden divide-y divide-border/40">
				{Array.from({ length: 10 }).map((_, i) => (
					<div key={i} className="flex items-start gap-3 px-4 py-3">
						<div className="h-4 w-4 rounded-full bg-muted/40 mt-0.5 shrink-0" />
						<div className="flex-1 space-y-1.5">
							<div className="flex items-center gap-2">
								<div
									className="h-3.5 rounded bg-muted/35"
									style={{
										width: `${150 + (i % 5) * 40}px`,
									}}
								/>
							</div>
							<div className="flex items-center gap-2">
								<div className="h-2.5 w-24 rounded bg-muted/20" />
								<div className="h-2.5 w-16 rounded bg-muted/15" />
							</div>
						</div>
						{i % 3 === 0 && (
							<div className="h-2 w-2 rounded-full bg-muted/50 shrink-0 mt-2" />
						)}
					</div>
				))}
			</div>
		</div>
	);
}
