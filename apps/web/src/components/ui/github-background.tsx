"use client";

import { useMemo } from "react";

function createRng(seed: number) {
	let s = seed;
	return () => {
		s = (s * 16807) % 2147483647;
		return (s - 1) / 2147483646;
	};
}

const LEVELS = [
	"rgba(255,255,255,0.02)",
	"rgba(255,255,255,0.10)",
	"rgba(255,255,255,0.18)",
	"rgba(255,255,255,0.28)",
	"rgba(255,255,255,0.40)",
];

const CELL = 15;

export function GitHubBackground() {
	const grid = useMemo(() => {
		const rng = createRng(42);
		const cells: { w: number; d: number; level: number }[] = [];
		for (let w = 0; w < 52; w++) {
			for (let d = 0; d < 7; d++) {
				const r = rng();
				const level =
					r < 0.3 ? 0 : r < 0.5 ? 1 : r < 0.7 ? 2 : r < 0.85 ? 3 : 4;
				cells.push({ w, d, level });
			}
		}
		return cells;
	}, []);

	return (
		<div
			className="absolute inset-0 pointer-events-none overflow-hidden"
			style={{ zIndex: 2 }}
		>
			{/* Radial mask — fades edges into the shader */}
			<div
				className="absolute inset-0"
				style={{
					maskImage: "radial-gradient(ellipse 85% 75% at 45% 35%, black 15%, transparent 60%)",
					WebkitMaskImage:
						"radial-gradient(ellipse 85% 75% at 45% 35%, black 15%, transparent 60%)",
				}}
			>
				{/* ── Contribution Graph ── */}
				<div
					className="absolute"
					style={{
						top: "8%",
						left: "50%",
						transform: "translate(-50%, 0) perspective(500px) rotateX(30deg) rotateZ(-2deg) scale(1.3)",
						transformOrigin: "center top",
						opacity: 0.4,
					}}
				>
					<svg
						width={52 * CELL}
						height={7 * CELL}
						viewBox={`0 0 ${52 * CELL} ${7 * CELL}`}
					>
						{grid.map(({ w, d, level }, i) => (
							<rect
								key={i}
								x={w * CELL}
								y={d * CELL}
								width={12}
								height={12}
								rx={2}
								fill={LEVELS[level]}
								opacity={0}
							>
								<animate
									attributeName="opacity"
									from="0"
									to="1"
									dur="0.5s"
									begin={`${w * 0.04 + d * 0.015}s`}
									fill="freeze"
								/>
							</rect>
						))}
					</svg>
				</div>

				{/* ── Git Network Graph ── */}
				<svg
					className="absolute inset-0 w-full h-full"
					viewBox="0 0 400 900"
					preserveAspectRatio="xMidYMid slice"
					style={{ opacity: 0.45 }}
				>
					{/* Main branch */}
					<line
						x1="200"
						y1="0"
						x2="200"
						y2="900"
						stroke="rgba(255,255,255,0.15)"
						strokeWidth="2"
						pathLength={1}
						className="git-line-anim"
						style={{ animationDelay: "0.3s" }}
					/>

					{/* Feature branch 1 — forks right */}
					<path
						d="M 200 150 C 200 180, 280 200, 280 230 L 280 350 C 280 380, 200 395, 200 400"
						stroke="rgba(255,255,255,0.12)"
						strokeWidth="2"
						fill="none"
						pathLength={1}
						className="git-line-anim"
						style={{ animationDelay: "0.8s" }}
					/>

					{/* Feature branch 2 — forks left */}
					<path
						d="M 200 300 C 200 325, 130 340, 130 360 L 130 500 C 130 525, 200 540, 200 550"
						stroke="rgba(255,255,255,0.10)"
						strokeWidth="2"
						fill="none"
						pathLength={1}
						className="git-line-anim"
						style={{ animationDelay: "1.3s" }}
					/>

					{/* Hotfix branch — short fork right */}
					<path
						d="M 200 550 C 200 570, 260 580, 260 600 L 260 650 C 260 670, 200 680, 200 690"
						stroke="rgba(255,255,255,0.08)"
						strokeWidth="2"
						fill="none"
						pathLength={1}
						className="git-line-anim"
						style={{ animationDelay: "1.8s" }}
					/>

					{/* Feature branch 3 — wide fork left */}
					<path
						d="M 200 620 C 200 640, 110 660, 110 680 L 110 800 C 110 820, 200 835, 200 850"
						stroke="rgba(255,255,255,0.07)"
						strokeWidth="2"
						fill="none"
						pathLength={1}
						className="git-line-anim"
						style={{ animationDelay: "2.2s" }}
					/>

					{/* Commit nodes — main branch */}
					{[80, 150, 230, 300, 400, 480, 550, 620, 690, 770, 850].map(
						(y, i) => (
							<circle
								key={`m${i}`}
								cx={200}
								cy={y}
								r={4}
								fill="rgba(255,255,255,0.25)"
								opacity={0}
							>
								<animate
									attributeName="opacity"
									from="0"
									to="1"
									dur="0.3s"
									begin={`${0.5 + i * 0.15}s`}
									fill="freeze"
								/>
							</circle>
						),
					)}

					{/* Commit nodes — feature 1 */}
					{[230, 280, 330].map((y, i) => (
						<circle
							key={`f1${i}`}
							cx={280}
							cy={y}
							r={3.5}
							fill="rgba(255,255,255,0.20)"
							opacity={0}
						>
							<animate
								attributeName="opacity"
								from="0"
								to="1"
								dur="0.3s"
								begin={`${1.0 + i * 0.2}s`}
								fill="freeze"
							/>
						</circle>
					))}

					{/* Commit nodes — feature 2 */}
					{[360, 420, 470].map((y, i) => (
						<circle
							key={`f2${i}`}
							cx={130}
							cy={y}
							r={3.5}
							fill="rgba(255,255,255,0.18)"
							opacity={0}
						>
							<animate
								attributeName="opacity"
								from="0"
								to="1"
								dur="0.3s"
								begin={`${1.5 + i * 0.2}s`}
								fill="freeze"
							/>
						</circle>
					))}

					{/* Commit nodes — hotfix */}
					{[600, 630, 660].map((y, i) => (
						<circle
							key={`hf${i}`}
							cx={260}
							cy={y}
							r={3}
							fill="rgba(255,255,255,0.15)"
							opacity={0}
						>
							<animate
								attributeName="opacity"
								from="0"
								to="1"
								dur="0.3s"
								begin={`${2.0 + i * 0.2}s`}
								fill="freeze"
							/>
						</circle>
					))}

					{/* Commit nodes — feature 3 */}
					{[680, 730, 780].map((y, i) => (
						<circle
							key={`f3${i}`}
							cx={110}
							cy={y}
							r={3}
							fill="rgba(255,255,255,0.12)"
							opacity={0}
						>
							<animate
								attributeName="opacity"
								from="0"
								to="1"
								dur="0.3s"
								begin={`${2.4 + i * 0.2}s`}
								fill="freeze"
							/>
						</circle>
					))}
				</svg>
			</div>

			{/* CSS for stroke-dash draw animation */}
			<style>{`
				.git-line-anim {
					stroke-dasharray: 1;
					stroke-dashoffset: 1;
					animation: gitDraw 2.5s ease-out forwards;
				}
				@keyframes gitDraw {
					to { stroke-dashoffset: 0; }
				}
			`}</style>
		</div>
	);
}
