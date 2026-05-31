"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

interface KeyboardShortcutsModalProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}

const SHORTCUT_SECTIONS = [
	{
		title: "Board Navigation",
		shortcuts: [
			{ keys: ["1", "2", "3", "4", "5"], description: "Jump to column" },
			{ keys: ["h", "←"], description: "Previous column" },
			{ keys: ["l", "→"], description: "Next column" },
			{ keys: ["j", "↓"], description: "Next card" },
			{ keys: ["k", "↑"], description: "Previous card" },
			{ keys: ["g", "g"], description: "First card" },
			{ keys: ["G"], description: "Last card" },
		],
	},
	{
		title: "Card Actions",
		shortcuts: [
			{ keys: ["Enter", "o"], description: "Open card" },
			{ keys: ["⇧1-5"], description: "Move to column" },
			{ keys: ["a"], description: "Assign to self" },
			{ keys: ["d"], description: "Delete card" },
			{ keys: ["e"], description: "Open on GitHub" },
		],
	},
	{
		title: "Board Actions",
		shortcuts: [
			{ keys: ["n"], description: "Add new issue" },
			{ keys: ["⇧R"], description: "Refresh all" },
			{ keys: ["F1"], description: "Show shortcuts" },
		],
	},
	{
		title: "Detail View",
		shortcuts: [
			{ keys: ["c"], description: "Focus comment" },
			{ keys: ["⌘Enter"], description: "Submit comment" },
			{ keys: ["Esc"], description: "Close" },
			{ keys: ["[", "]"], description: "Prev/next card" },
		],
	},
];

export function KeyboardShortcutsModal({ open, onOpenChange }: KeyboardShortcutsModalProps) {
	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			<Dialog.Portal>
				<Dialog.Overlay className="fixed inset-0 bg-black/50 z-50 animate-in fade-in-0" />
				<Dialog.Content
					className={cn(
						"fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
						"z-50 w-full max-w-lg max-h-[85vh] overflow-y-auto",
						"bg-background border border-border rounded-lg shadow-lg",
						"animate-in fade-in-0 zoom-in-95",
					)}
				>
					<div className="flex items-center justify-between p-4 border-b border-border">
						<Dialog.Title className="text-sm font-semibold">
							Keyboard Shortcuts
						</Dialog.Title>
						<Dialog.Close asChild>
							<button className="p-1 rounded-md hover:bg-muted transition-colors">
								<X className="w-4 h-4 text-muted-foreground" />
							</button>
						</Dialog.Close>
					</div>

					<div className="p-4 space-y-6">
						{SHORTCUT_SECTIONS.map((section) => (
							<div key={section.title}>
								<h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-3">
									{section.title}
								</h3>
								<div className="space-y-2">
									{section.shortcuts.map(
										(
											shortcut,
											index,
										) => (
											<div
												key={
													index
												}
												className="flex items-center justify-between"
											>
												<span className="text-sm text-foreground/80">
													{
														shortcut.description
													}
												</span>
												<div className="flex items-center gap-1">
													{shortcut.keys.map(
														(
															key,
															keyIndex,
														) => (
															<span
																key={
																	keyIndex
																}
															>
																{keyIndex >
																	0 && (
																	<span className="text-xs text-muted-foreground/40 mx-1">
																		/
																	</span>
																)}
																<kbd
																	className={cn(
																		"px-1.5 py-0.5 text-xs font-mono",
																		"bg-muted border border-border rounded",
																		"text-muted-foreground",
																	)}
																>
																	{
																		key
																	}
																</kbd>
															</span>
														),
													)}
												</div>
											</div>
										),
									)}
								</div>
							</div>
						))}
					</div>

					<div className="p-4 border-t border-border">
						<p className="text-xs text-muted-foreground/60 text-center">
							Press{" "}
							<kbd className="px-1 py-0.5 text-xs font-mono bg-muted border border-border rounded">
								Esc
							</kbd>{" "}
							to close
						</p>
					</div>
				</Dialog.Content>
			</Dialog.Portal>
		</Dialog.Root>
	);
}
