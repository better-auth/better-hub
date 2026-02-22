export default function PromptDetailLoading() {
	return (
		<div className="animate-pulse">
			{/* Header */}
			<div className="mb-6">
				<div className="h-5 w-72 max-w-full rounded bg-muted/50 mb-2" />
				<div className="flex items-center gap-2">
					<div className="h-5 w-16 rounded-full bg-muted/35" />
					<div className="h-4 w-4 rounded-full bg-muted/25" />
					<div className="h-3 w-28 rounded bg-muted/20" />
				</div>
			</div>

			{/* Body */}
			<div className="border border-border/40 rounded-md p-4 mb-4">
				<div className="space-y-2.5">
					<div className="h-3 w-full rounded bg-muted/30" />
					<div className="h-3 w-5/6 rounded bg-muted/30" />
					<div className="h-3 w-4/6 rounded bg-muted/30" />
					<div className="h-3 w-3/4 rounded bg-muted/30" />
				</div>
			</div>

			{/* Comments */}
			<div className="space-y-3">
				<div className="h-4 w-20 rounded bg-muted/30" />
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={i}
						className="border border-border/40 rounded-md p-3 space-y-2"
					>
						<div className="flex items-center gap-2">
							<div className="h-5 w-5 rounded-full bg-muted/35" />
							<div className="h-3 w-20 rounded bg-muted/25" />
							<div className="h-2.5 w-14 rounded bg-muted/15 ml-auto" />
						</div>
						<div className="space-y-1.5">
							<div className="h-3 w-full rounded bg-muted/20" />
							<div className="h-3 w-2/3 rounded bg-muted/20" />
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
