"use client";

import * as DialogPrimitive from "@radix-ui/react-dialog";
import { XIcon } from "lucide-react";
import type * as React from "react";
import { cn } from "@/lib/utils";

function Sheet({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="sheet" {...props} />;
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="sheet-trigger" {...props} />;
}

function SheetPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
	return <DialogPrimitive.Portal data-slot="sheet-portal" {...props} />;
}

function SheetClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="sheet-close" {...props} />;
}

function SheetOverlay({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
	return (
		<DialogPrimitive.Overlay
			data-slot="sheet-overlay"
			className={cn(
				"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 fixed inset-0 z-50 bg-black/25 dark:bg-black/70 backdrop-blur-[2px]",
				className,
			)}
			{...props}
		/>
	);
}

interface SheetContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
	side?: "left" | "right" | "top" | "bottom";
	showCloseButton?: boolean;
	/** Merged into `SheetOverlay` (backdrop behind the sheet). */
	overlayClassName?: string;
}

function SheetContent({
	className,
	children,
	side = "right",
	showCloseButton = true,
	overlayClassName,
	...props
}: SheetContentProps) {
	const sideStyles = {
		right: "inset-y-0 right-0 h-full w-3/4 sm:max-w-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right",
		left: "inset-y-0 left-0 h-full w-3/4 sm:max-w-xl data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left",
		top: "inset-x-0 top-0 w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-top data-[state=open]:slide-in-from-top",
		bottom: "inset-x-0 bottom-0 w-full data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
	};

	return (
		<SheetPortal>
			<SheetOverlay className={overlayClassName} />
			<DialogPrimitive.Content
				data-slot="sheet-content"
				className={cn(
					"fixed z-50 flex flex-col bg-background border-l border-border shadow-lg duration-300",
					sideStyles[side],
					className,
				)}
				{...props}
			>
				<DialogPrimitive.Title className="hidden sr-only">
					{props.title}
				</DialogPrimitive.Title>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close className="absolute top-4 right-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none data-[state=open]:bg-secondary cursor-pointer">
						<XIcon className="h-4 w-4" />
						<span className="sr-only">Close</span>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</SheetPortal>
	);
}

function SheetHeader({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-header"
			className={cn(
				"flex flex-col gap-2 px-6 py-4 border-b border-border",
				className,
			)}
			{...props}
		/>
	);
}

function SheetFooter({ className, ...props }: React.ComponentProps<"div">) {
	return (
		<div
			data-slot="sheet-footer"
			className={cn(
				"flex flex-col-reverse gap-2 px-6 py-4 border-t border-border sm:flex-row sm:justify-end",
				className,
			)}
			{...props}
		/>
	);
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			data-slot="sheet-title"
			className={cn("text-lg font-semibold text-foreground", className)}
			{...props}
		/>
	);
}

function SheetDescription({
	className,
	...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			data-slot="sheet-description"
			className={cn("text-sm text-muted-foreground", className)}
			{...props}
		/>
	);
}

export {
	Sheet,
	SheetClose,
	SheetContent,
	SheetDescription,
	SheetFooter,
	SheetHeader,
	SheetOverlay,
	SheetPortal,
	SheetTitle,
	SheetTrigger,
};
