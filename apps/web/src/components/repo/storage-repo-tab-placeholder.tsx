export function StorageRepoTabPlaceholder({ label }: { label: string }) {
	return (
		<div className="border border-dashed border-border/60 rounded-md py-20 mx-4 text-center">
			<p className="text-xs text-muted-foreground font-mono">{label}</p>
			<p className="text-[10px] text-muted-foreground/60 font-mono mt-1">
				Not available for git storage yet.
			</p>
		</div>
	);
}
