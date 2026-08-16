"use client";

import { useEffect, useId, useState, useRef } from "react";
import { createRoot } from "react-dom/client";
import {
	ChevronUp,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	ZoomIn,
	ZoomOut,
	RotateCcw,
	Maximize2,
	Copy,
	X,
	Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

async function getMermaid() {
	const m = (await import("mermaid")).default;
	const dark = document.documentElement.classList.contains("dark");
	m.initialize({ startOnLoad: false, theme: dark ? "dark" : "default" });
	return m;
}

async function renderMermaid(code: string, id: string): Promise<string> {
	const m = await getMermaid();
	const { svg } = await m.render(id, code);
	return svg;
}

function CtrlBtn({
	onClick,
	title,
	children,
	className,
}: {
	onClick: () => void;
	title?: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<button
			type="button"
			title={title}
			onClick={onClick}
			className={cn(
				"w-7 h-7 flex items-center justify-center rounded",
				"bg-background/80 border border-border/60",
				"hover:bg-muted/80 transition-colors text-muted-foreground hover:text-foreground",
				className,
			)}
		>
			{children}
		</button>
	);
}

interface DiagramControlsProps {
	onPan: (dx: number, dy: number) => void;
	onZoom: (delta: number) => void;
	onReset: () => void;
}

function DiagramControls({ onPan, onZoom, onReset }: DiagramControlsProps) {
	return (
		<div className="flex flex-col gap-0.5">
			<div className="flex gap-0.5 justify-center">
				<CtrlBtn onClick={() => onPan(0, 80)} title="Pan up">
					<ChevronUp className="w-3.5 h-3.5" />
				</CtrlBtn>
				<CtrlBtn onClick={() => onZoom(0.25)} title="Zoom in">
					<ZoomIn className="w-3.5 h-3.5" />
				</CtrlBtn>
			</div>
			<div className="flex gap-0.5">
				<CtrlBtn onClick={() => onPan(80, 0)} title="Pan left">
					<ChevronLeft className="w-3.5 h-3.5" />
				</CtrlBtn>
				<CtrlBtn onClick={onReset} title="Reset">
					<RotateCcw className="w-3.5 h-3.5" />
				</CtrlBtn>
				<CtrlBtn onClick={() => onPan(-80, 0)} title="Pan right">
					<ChevronRight className="w-3.5 h-3.5" />
				</CtrlBtn>
			</div>
			<div className="flex gap-0.5 justify-center">
				<CtrlBtn onClick={() => onPan(0, -80)} title="Pan down">
					<ChevronDown className="w-3.5 h-3.5" />
				</CtrlBtn>
				<CtrlBtn onClick={() => onZoom(-0.25)} title="Zoom out">
					<ZoomOut className="w-3.5 h-3.5" />
				</CtrlBtn>
			</div>
		</div>
	);
}

function MermaidViewer({ svg, code }: { svg: string; code: string }) {
	const [open, setOpen] = useState(false);
	const [copied, setCopied] = useState(false);
	const [pos, setPos] = useState({ x: 0, y: 0 });
	const [scale, setScale] = useState(1);
	const modalRef = useRef<HTMLDivElement>(null);
	const svgWrapRef = useRef<HTMLDivElement>(null);

	function pan(dx: number, dy: number) {
		setPos((p) => ({ x: p.x + dx, y: p.y + dy }));
	}

	function zoom(delta: number) {
		setScale((s) => Math.max(0.2, Math.min(6, s + delta)));
	}

	function fitToContainer() {
		setPos({ x: 0, y: 0 });
		const container = modalRef.current;
		const svgEl = svgWrapRef.current?.querySelector("svg");
		if (!container || !svgEl) {
			setScale(1);
			return;
		}
		const sw =
			svgEl.getBoundingClientRect().width || svgEl.viewBox?.baseVal?.width || 800;
		const sh =
			svgEl.getBoundingClientRect().height ||
			svgEl.viewBox?.baseVal?.height ||
			600;
		const fit =
			Math.min(container.clientWidth / sw, container.clientHeight / sh) * 0.88;
		setScale(Math.max(0.2, Math.min(6, fit)));
	}

	async function copy() {
		await navigator.clipboard.writeText(code);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	}

	// Auto-fit after the modal paints for the first time
	useEffect(() => {
		if (!open) return;
		const frame = requestAnimationFrame(() => fitToContainer());
		return () => cancelAnimationFrame(frame);
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [open]);

	useEffect(() => {
		if (!open) return;
		const el = modalRef.current;
		if (!el) return;
		function onWheel(e: WheelEvent) {
			e.preventDefault();
			zoom(e.deltaY < 0 ? 0.15 : -0.15);
		}
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => el.removeEventListener("wheel", onWheel);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === "Escape") setOpen(false);
		}
		document.addEventListener("keydown", onKey);
		return () => document.removeEventListener("keydown", onKey);
	}, [open]);

	return (
		<>
			<div className="relative group my-3 rounded-md border border-border/40 bg-muted/10 overflow-hidden">
				<div
					className="overflow-auto flex justify-center p-4 cursor-zoom-in [&_svg]:max-w-full [&_svg]:h-auto"
					onClick={() => {
						setPos({ x: 0, y: 0 });
						setScale(1);
						setOpen(true);
					}}
					dangerouslySetInnerHTML={{ __html: svg }}
				/>
				<div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
					<CtrlBtn
						onClick={copy}
						title={copied ? "Copied!" : "Copy source"}
					>
						{copied ? (
							<Check className="w-3.5 h-3.5 text-green-500" />
						) : (
							<Copy className="w-3.5 h-3.5" />
						)}
					</CtrlBtn>
					<CtrlBtn
						onClick={() => {
							setPos({ x: 0, y: 0 });
							setScale(1);
							setOpen(true);
						}}
						title="Open fullscreen"
					>
						<Maximize2 className="w-3.5 h-3.5" />
					</CtrlBtn>
				</div>
			</div>

			{open && (
				<div
					className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
					onClick={() => setOpen(false)}
				>
					<div
						ref={modalRef}
						className="relative w-full max-w-6xl h-[88vh] bg-background border border-border rounded-lg overflow-hidden"
						onClick={(e) => e.stopPropagation()}
					>
						<button
							type="button"
							onClick={() => setOpen(false)}
							className="absolute top-3 right-3 z-10 w-7 h-7 flex items-center justify-center rounded bg-muted/60 hover:bg-muted transition-colors"
						>
							<X className="w-4 h-4" />
						</button>

						<div className="absolute top-3 left-3 z-10">
							<CtrlBtn
								onClick={copy}
								title={
									copied
										? "Copied!"
										: "Copy source"
								}
							>
								{copied ? (
									<Check className="w-3.5 h-3.5 text-green-500" />
								) : (
									<Copy className="w-3.5 h-3.5" />
								)}
							</CtrlBtn>
						</div>

						<div className="w-full h-full overflow-hidden flex items-center justify-center select-none">
							<div
								ref={svgWrapRef}
								style={{
									transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})`,
									transformOrigin: "center",
									transition: "transform 0.08s ease-out",
								}}
								dangerouslySetInnerHTML={{
									__html: svg,
								}}
							/>
						</div>

						<div className="absolute bottom-4 right-4">
							<DiagramControls
								onPan={pan}
								onZoom={zoom}
								onReset={fitToContainer}
							/>
						</div>
					</div>
				</div>
			)}
		</>
	);
}

export function MermaidDiagram({ code }: { code: string }) {
	const uid = useId().replace(/:/g, "");
	const [svg, setSvg] = useState<string | null>(null);
	const [error, setError] = useState(false);

	useEffect(() => {
		let cancelled = false;
		renderMermaid(code, `mermaid-${uid}`)
			.then((result) => {
				if (!cancelled) setSvg(result);
			})
			.catch(() => {
				if (!cancelled) setError(true);
			});
		return () => {
			cancelled = true;
		};
	}, [code, uid]);

	if (error) {
		return (
			<pre className="text-xs text-muted-foreground p-3 bg-muted rounded overflow-auto">
				<code>{code}</code>
			</pre>
		);
	}

	if (!svg) {
		return <div className="h-12 bg-muted/30 rounded animate-pulse my-2" />;
	}

	return <MermaidViewer svg={svg} code={code} />;
}

interface MermaidBlocksProps {
	children: React.ReactNode;
}

export function MermaidBlocks({ children }: MermaidBlocksProps) {
	const containerRef = useRef<HTMLDivElement>(null);
	const rootsRef = useRef<ReturnType<typeof createRoot>[]>([]);

	useEffect(() => {
		if (!containerRef.current) return;

		const diagrams =
			containerRef.current.querySelectorAll<HTMLElement>(".ghmd-mermaid");
		if (!diagrams.length) return;

		let cancelled = false;

		(async () => {
			for (const el of diagrams) {
				if (cancelled) break;
				const raw = el.getAttribute("data-code");
				if (!raw) continue;

				const code = raw
					.replace(/&#10;/g, "\n")
					.replace(/&quot;/g, '"')
					.replace(/&lt;/g, "<")
					.replace(/&gt;/g, ">")
					.replace(/&amp;/g, "&");

				const id = `ghmd-mermaid-${Math.random().toString(36).slice(2)}`;

				try {
					const svg = await renderMermaid(code, id);
					if (cancelled) break;
					el.innerHTML = "";
					const root = createRoot(el);
					rootsRef.current.push(root);
					root.render(<MermaidViewer svg={svg} code={code} />);
				} catch {
					// Leave the raw placeholder visible on error
				}
			}
		})();

		return () => {
			cancelled = true;
			for (const root of rootsRef.current) root.unmount();
			rootsRef.current = [];
		};
	}, []);

	return <div ref={containerRef}>{children}</div>;
}
