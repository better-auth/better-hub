export function StorageRepoNoBranchesState({ defaultBranch }: { defaultBranch: string }) {
	return (
		<div className="border border-border rounded-md py-16 text-center px-6 w-full max-w-md flex flex-col items-center">
			<p className="text-sm text-muted-foreground mb-2">
				This repository has no branches yet.
			</p>
			<p className="text-[11px] text-muted-foreground/80 font-mono max-w-sm">
				There is no{" "}
				<span className="text-foreground/90">{defaultBranch}</span> (or any)
				branch until you push an initial commit.
			</p>
		</div>
	);
}

export function StorageRepoRefNotFoundState({ ref }: { ref: string }) {
	return (
		<div className="border border-border rounded-md py-16 text-center px-6 w-full max-w-md flex flex-col items-center">
			<p className="text-sm text-muted-foreground mb-2">
				Branch or ref not found.
			</p>
			<p className="text-[11px] text-muted-foreground/80 font-mono max-w-sm">
				<span className="text-foreground/90">{ref}</span> does not exist in
				this repository.
			</p>
		</div>
	);
}
