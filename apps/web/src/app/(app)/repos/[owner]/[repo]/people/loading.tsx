export default function PeopleLoading() {
	return (
		<div className="animate-pulse">
			{/* Header */}
			<div className="flex items-center gap-3 mb-4">
				<div className="h-4 w-20 rounded bg-muted/40" />
				<div className="h-7 w-24 rounded bg-muted/30 ml-auto" />
			</div>

			{/* People grid */}
			<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
				{Array.from({ length: 12 }).map((_, i) => (
					<div
						key={i}
						className="border border-border/40 rounded-md p-4 space-y-3"
					>
						<div className="flex items-center gap-3">
							<div className="h-10 w-10 rounded-full bg-muted/40 shrink-0" />
							<div className="space-y-1">
								<div className="h-3.5 w-24 rounded bg-muted/35" />
								<div className="h-2.5 w-16 rounded bg-muted/20" />
							</div>
							<div className="h-4 w-12 rounded-full bg-muted/20 ml-auto" />
						</div>
						<div className="h-3 w-full rounded bg-muted/15" />
						<div className="flex items-center gap-3">
							<div className="h-2.5 w-14 rounded bg-muted/15" />
							<div className="h-2.5 w-14 rounded bg-muted/15" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
