export default function RunDetailLoading() {
	return (
		<div className="animate-pulse">
			{/* Run header */}
			<div className="border border-border rounded-md p-4 mb-4">
				<div className="flex items-center gap-3 mb-3">
					<div className="h-5 w-5 rounded-full bg-muted/40" />
					<div className="h-5 w-56 rounded bg-muted/50" />
				</div>
				<div className="flex items-center gap-3">
					<div className="h-3 w-20 rounded bg-muted/25" />
					<div className="h-3 w-16 rounded bg-muted/20" />
					<div className="h-3 w-24 rounded bg-muted/20" />
				</div>
			</div>

			{/* Jobs */}
			<div className="space-y-3">
				{Array.from({ length: 3 }).map((_, j) => (
					<div
						key={j}
						className="border border-border rounded-md overflow-hidden"
					>
						<div className="flex items-center gap-2 px-4 py-3 bg-muted/10">
							<div className="h-4 w-4 rounded-full bg-muted/40" />
							<div className="h-3.5 w-32 rounded bg-muted/35" />
							<div className="h-3 w-12 rounded bg-muted/20 ml-auto" />
						</div>
						<div className="divide-y divide-border/30">
							{Array.from({ length: 4 }).map((_, s) => (
								<div
									key={s}
									className="flex items-center gap-2 px-6 py-2"
								>
									<div className="h-3 w-3 rounded-full bg-muted/25" />
									<div
										className="h-3 rounded bg-muted/20"
										style={{
											width: `${80 + Math.random() * 120}px`,
										}}
									/>
									<div className="h-2.5 w-8 rounded bg-muted/15 ml-auto" />
								</div>
							))}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
