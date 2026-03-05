"use client";

import { useRef, useEffect, useState } from "react";
import { Play, X } from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal, DialogTitle } from "@/components/ui/dialog";
import * as DialogPrimitive from "@radix-ui/react-dialog";

export function DemoVideoDialog() {
	const [open, setOpen] = useState(false);
	const videoRef = useRef<HTMLVideoElement>(null);

	useEffect(() => {
		if (open && videoRef.current) {
			videoRef.current.currentTime = 0;
			videoRef.current.play();
		}
		if (!open && videoRef.current) {
			videoRef.current.pause();
		}
	}, [open]);

	return (
		<>
			<button
				onClick={() => setOpen(true)}
				className="group inline-flex items-center gap-2 text-[12px] text-foreground/40 hover:text-foreground/70 transition-colors cursor-pointer"
			>
				<span className="flex items-center justify-center w-6 h-6 rounded-full border border-foreground/15 group-hover:border-foreground/30 transition-colors">
					<Play className="w-3 h-3 ml-0.5" />
				</span>
				Watch demo
			</button>

			<Dialog open={open} onOpenChange={setOpen}>
				<DialogPortal>
					<DialogOverlay className="bg-black/80 backdrop-blur-sm" />
					<DialogPrimitive.Content className="fixed top-1/2 left-1/2 z-50 w-full max-w-4xl -translate-x-1/2 -translate-y-1/2 px-6 sm:px-10 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 duration-200">
						<DialogTitle className="sr-only">
							Demo Video
						</DialogTitle>
						<DialogPrimitive.Close className="absolute -top-10 right-6 sm:right-10 p-1.5 rounded-md text-white/50 hover:text-white transition-colors cursor-pointer">
							<X className="w-5 h-5" />
							<span className="sr-only">Close</span>
						</DialogPrimitive.Close>
						<div className="rounded-xl overflow-hidden shadow-2xl shadow-black/50">
							<video
								ref={videoRef}
								className="w-full h-auto"
								autoPlay
								loop
								muted
								playsInline
								controls
							>
								<source
									src="/demo.mp4"
									type="video/mp4"
								/>
							</video>
						</div>
					</DialogPrimitive.Content>
				</DialogPortal>
			</Dialog>
		</>
	);
}
