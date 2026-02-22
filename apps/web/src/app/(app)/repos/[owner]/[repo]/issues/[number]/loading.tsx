export default function IssueDetailLoading() {
	return (
		<div className="animate-pulse">
			{/* Issue header */}
			<div className="mb-6">
				<div className="flex items-center gap-2 mb-2">
					<div className="h-5 w-64 rounded bg-muted/50" />
					<div className="h-5 w-12 rounded bg-muted/30" />
				</div>
				<div className="flex items-center gap-2">
					<div className="h-5 w-14 rounded-full bg-muted/40" />
					<div className="h-4 w-4 rounded-full bg-muted/30" />
					<div className="h-3 w-32 rounded bg-muted/20" />
				</div>
			</div>

			{/* Desktop: two-column layout */}
			<div className="flex gap-6">
				{/* Left: description + sidebar */}
				<div className="flex-1 space-y-4">
					{/* Description card */}
					<div className="border border-border/40 rounded-md p-4">
						<div className="flex items-center gap-2 mb-3">
							<div className="h-6 w-6 rounded-full bg-muted/40" />
							<div className="h-3 w-24 rounded bg-muted/30" />
							<div className="h-3 w-16 rounded bg-muted/20" />
						</div>
						<div className="space-y-2.5">
							<div className="h-3 w-full rounded bg-muted/30" />
							<div className="h-3 w-5/6 rounded bg-muted/30" />
							<div className="h-3 w-4/6 rounded bg-muted/30" />
							<div className="h-3 w-3/4 rounded bg-muted/30" />
						</div>
					</div>

					{/* Sidebar (labels, assignees) */}
					<div className="border border-border/40 rounded-md p-4 space-y-4">
						<div>
							<div className="h-3 w-12 rounded bg-muted/30 mb-2" />
							<div className="flex gap-1.5">
								<div className="h-5 w-16 rounded-full bg-muted/30" />
								<div className="h-5 w-20 rounded-full bg-muted/30" />
							</div>
						</div>
						<div>
							<div className="h-3 w-16 rounded bg-muted/30 mb-2" />
							<div className="flex gap-1.5">
								<div className="h-5 w-5 rounded-full bg-muted/30" />
							</div>
						</div>
					</div>
				</div>

				{/* Right: conversation panel */}
				<div className="hidden lg:block w-[380px] shrink-0 space-y-3">
					<div className="h-4 w-28 rounded bg-muted/30 mb-4" />
					{Array.from({ length: 3 }).map((_, i) => (
						<div
							key={i}
							className="border border-border/40 rounded-md p-3 space-y-2"
						>
							<div className="flex items-center gap-2">
								<div className="h-5 w-5 rounded-full bg-muted/40" />
								<div className="h-3 w-20 rounded bg-muted/30" />
								<div className="h-2.5 w-12 rounded bg-muted/20 ml-auto" />
							</div>
							<div className="space-y-1.5">
								<div className="h-3 w-full rounded bg-muted/25" />
								<div className="h-3 w-3/4 rounded bg-muted/25" />
							</div>
						</div>
					))}
				</div>
			</div>
		</div>
	);
}
