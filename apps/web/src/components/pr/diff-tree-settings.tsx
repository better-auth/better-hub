"use client";

import { useState } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Settings2, FolderTree, List } from "lucide-react";
import { cn } from "@/lib/utils";
import {
	type DiffPreferences,
	type DiffViewMode,
	type DiffFontSize,
	getDiffPreferences,
	setDiffPreferences,
} from "@/lib/diff-preferences";

interface DiffTreeSettingsPopoverProps {
	onSettingsChange: (prefs: DiffPreferences) => void;
}

function SegmentedToggle<T extends string>({
	value,
	options,
	onChange,
}: {
	value: T;
	options: { value: T; label: React.ReactNode }[];
	onChange: (value: T) => void;
}) {
	return (
		<div className="flex items-center rounded-md border border-border bg-muted/30 p-0.5">
			{options.map((opt) => (
				<button
					key={opt.value}
					onClick={() => onChange(opt.value)}
					className={cn(
						"px-2.5 py-1 text-[11px] font-mono rounded-sm transition-colors cursor-pointer",
						value === opt.value
							? "bg-background text-foreground shadow-sm"
							: "text-muted-foreground hover:text-foreground",
					)}
				>
					{opt.label}
				</button>
			))}
		</div>
	);
}

export function DiffTreeSettingsPopover({ onSettingsChange }: DiffTreeSettingsPopoverProps) {
	const [prefs, setPrefs] = useState<DiffPreferences>(getDiffPreferences);

	function update(patch: Partial<DiffPreferences>) {
		const updated = setDiffPreferences(patch);
		setPrefs(updated);
		onSettingsChange(updated);
	}

	return (
		<PopoverPrimitive.Root>
			<PopoverPrimitive.Trigger asChild>
				<button
					className={cn(
						"p-1 rounded transition-colors cursor-pointer",
						"text-muted-foreground/60 hover:text-muted-foreground",
					)}
					title="Tree settings"
				>
					<Settings2 className="w-3.5 h-3.5" />
				</button>
			</PopoverPrimitive.Trigger>
			<PopoverPrimitive.Portal>
				<PopoverPrimitive.Content
					side="bottom"
					align="end"
					sideOffset={8}
					className="z-50 w-56 rounded-lg border border-border bg-background p-3 shadow-lg animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95"
				>
					<p className="text-[11px] font-semibold text-foreground mb-3">
						File tree settings
					</p>

					<div className="space-y-3">
						<div className="space-y-1.5">
							<label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
								Default view
							</label>
							<SegmentedToggle<DiffViewMode>
								value={prefs.defaultViewMode}
								options={[
									{
										value: "tree",
										label: (
											<span className="flex items-center gap-1">
												<FolderTree className="w-3 h-3" />
												Tree
											</span>
										),
									},
									{
										value: "flat",
										label: (
											<span className="flex items-center gap-1">
												<List className="w-3 h-3" />
												Flat
											</span>
										),
									},
								]}
								onChange={(v) =>
									update({
										defaultViewMode: v,
									})
								}
							/>
						</div>

						<div className="space-y-1.5">
							<label className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
								Font size
							</label>
							<SegmentedToggle<DiffFontSize>
								value={prefs.fontSize}
								options={[
									{
										value: "sm",
										label: "sm",
									},
									{
										value: "md",
										label: "md",
									},
									{
										value: "lg",
										label: "lg",
									},
								]}
								onChange={(v) =>
									update({ fontSize: v })
								}
							/>
						</div>

						<label className="flex items-center justify-between gap-2 cursor-pointer group">
							<span className="text-[10px] font-mono text-muted-foreground uppercase tracking-wider">
								Folder diff counts
							</span>
							<button
								role="switch"
								aria-checked={
									prefs.showFolderDiffCount
								}
								onClick={() =>
									update({
										showFolderDiffCount:
											!prefs.showFolderDiffCount,
									})
								}
								className={cn(
									"relative inline-flex h-4 w-7 shrink-0 items-center rounded-full transition-colors cursor-pointer",
									prefs.showFolderDiffCount
										? "bg-primary"
										: "bg-muted-foreground/30",
								)}
							>
								<span
									className={cn(
										"inline-block h-3 w-3 rounded-full bg-background shadow-sm transition-transform",
										prefs.showFolderDiffCount
											? "translate-x-3.5"
											: "translate-x-0.5",
									)}
								/>
							</button>
						</label>
					</div>
				</PopoverPrimitive.Content>
			</PopoverPrimitive.Portal>
		</PopoverPrimitive.Root>
	);
}
