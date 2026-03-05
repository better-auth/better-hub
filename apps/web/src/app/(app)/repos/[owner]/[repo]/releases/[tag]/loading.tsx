export default function ReleaseDetailLoading() {
	return (
		<div className="animate-pulse px-4 py-6 max-w-3xl">
			<div className="h-3 w-24 rounded bg-muted/30 mb-6" />

			<div className="flex items-center gap-2 mb-3">
				<div className="h-5 w-16 rounded-full bg-muted/40" />
				<div className="h-5 w-20 rounded-full bg-muted/30" />
			</div>

			<div className="h-7 w-72 rounded bg-muted/50 mb-3" />

			<div className="flex items-center gap-2 mb-8">
				<div className="h-6 w-6 rounded-full bg-muted/40" />
				<div className="h-3 w-48 rounded bg-muted/25" />
			</div>

			<div className="space-y-2.5 mb-8">
				{Array.from({ length: 12 }).map((_, i) => (
					<div
						key={i}
						className="h-3 rounded bg-muted/20"
						style={{ width: `${60 + Math.random() * 40}%` }}
					/>
				))}
			</div>

			<div className="h-4 w-24 rounded bg-muted/30 mb-3" />
			<div className="border border-border/30 rounded-md overflow-hidden divide-y divide-border/20">
				{Array.from({ length: 3 }).map((_, i) => (
					<div
						key={i}
						className="flex items-center gap-3 px-3 py-2.5"
					>
						<div className="h-3.5 w-3.5 rounded bg-muted/30 shrink-0" />
						<div className="flex-1 h-3 rounded bg-muted/25" />
						<div className="h-3 w-14 rounded bg-muted/20" />
					</div>
				))}
			</div>
		</div>
	);
}
