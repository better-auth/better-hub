"use client";

import { useRef, useState } from "react";

export function DemoVideo() {
	const videoRef = useRef<HTMLVideoElement>(null);
	const [isPlaying, setIsPlaying] = useState(true);

	const togglePlayPause = () => {
		if (videoRef.current) {
			if (videoRef.current.paused) {
				videoRef.current.play();
				setIsPlaying(true);
			} else {
				videoRef.current.pause();
				setIsPlaying(false);
			}
		}
	};

	return (
		<div
			className="relative rounded-xl overflow-hidden border border-[var(--hero-border)] bg-black/50 backdrop-blur-sm shadow-2xl shadow-black/50 cursor-pointer group"
			onClick={togglePlayPause}
		>
			<div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
			<video
				ref={videoRef}
				className="w-full h-auto"
				autoPlay
				loop
				muted
				playsInline
			>
				<source src="/demo.mp4" type="video/mp4" />
			</video>
			{!isPlaying && (
				<div className="absolute inset-0 flex items-center justify-center bg-black/30">
					<div className="w-16 h-16 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center">
						<svg
							className="w-8 h-8 text-white ml-1"
							fill="currentColor"
							viewBox="0 0 24 24"
						>
							<path d="M8 5v14l11-7z" />
						</svg>
					</div>
				</div>
			)}
		</div>
	);
}
