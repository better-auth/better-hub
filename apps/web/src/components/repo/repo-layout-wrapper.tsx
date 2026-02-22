"use client";

import { useState, useCallback, useRef } from "react";
import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";

interface RepoLayoutWrapperProps {
  sidebar: React.ReactNode;
  children: React.ReactNode;
  owner: string;
  repo: string;
}

const DEFAULT_WIDTH = 260;
const SNAP_THRESHOLD = 120;
const SPRING = { type: "spring" as const, stiffness: 500, damping: 35 };

export function RepoLayoutWrapper({ sidebar, children, owner, repo }: RepoLayoutWrapperProps) {
  const [sidebarWidth, setSidebarWidth] = useState(DEFAULT_WIDTH);
  const lastOpenWidthRef = useRef(DEFAULT_WIDTH);
  const dragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const isDraggingRef = useRef(false);
  const [isDragging, setIsDragging] = useState(false);
  const collapsed = sidebarWidth === 0;

  const handleExpand = useCallback(() => {
    setSidebarWidth(lastOpenWidthRef.current || DEFAULT_WIDTH);
  }, []);

  const handleCollapse = useCallback(() => {
    if (sidebarWidth > 0) lastOpenWidthRef.current = sidebarWidth;
    setSidebarWidth(0);
  }, [sidebarWidth]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    dragRef.current = { startX: e.clientX, startWidth: sidebarWidth || lastOpenWidthRef.current };
    isDraggingRef.current = false;
    setIsDragging(true);
    const onMove = (ev: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = ev.clientX - dragRef.current.startX;
      if (!isDraggingRef.current && Math.abs(delta) > 3) {
        isDraggingRef.current = true;
      }
      if (!isDraggingRef.current) return;
      const raw = dragRef.current.startWidth + delta;
      if (raw < SNAP_THRESHOLD) {
        setSidebarWidth(0);
      } else {
        const clamped = Math.max(180, Math.min(DEFAULT_WIDTH, raw));
        setSidebarWidth(clamped);
        lastOpenWidthRef.current = clamped;
      }
    };
    const onUp = () => {
      const didDrag = isDraggingRef.current;
      dragRef.current = null;
      isDraggingRef.current = false;
      setIsDragging(false);
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      if (!didDrag) {
        handleCollapse();
      }
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
  }, [sidebarWidth, handleCollapse]);

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0">
      {/* Sidebar */}
      <motion.div
        className="hidden lg:flex shrink-0 overflow-hidden min-h-0"
        animate={{ width: sidebarWidth }}
        transition={isDragging ? { duration: 0 } : SPRING}
      >
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              className="overflow-y-auto min-h-0"
              style={{ width: lastOpenWidthRef.current || DEFAULT_WIDTH, minWidth: lastOpenWidthRef.current || DEFAULT_WIDTH }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
            >
              {sidebar}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Floating expand button (collapsed state) */}
      <AnimatePresence>
        {collapsed && !isDragging && (
          <motion.div
            className="hidden lg:block fixed left-0 top-0 bottom-0 w-8 z-50 group/expand"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: 0.1 }}
          >
            <button
              type="button"
              onClick={handleExpand}
              className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-md border bg-background shadow-sm cursor-pointer opacity-0 group-hover/expand:opacity-100 text-muted-foreground/60 hover:!text-foreground hover:!bg-muted transition-all duration-200"
              title="Show sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Resize handle + collapse button (expanded state) */}
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            className="hidden lg:flex shrink-0 flex-col items-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
          >
            <div
              onMouseDown={handleDragStart}
              className="flex-1 w-1 cursor-col-resize flex items-center justify-center hover:bg-foreground/10 active:bg-foreground/15 transition-colors group/resize"
            >
              <div className="w-[2px] h-8 rounded-full bg-border group-hover/resize:bg-foreground/20 group-active/resize:bg-foreground/30 transition-colors" />
            </div>
            <button
              type="button"
              onClick={handleCollapse}
              className="flex items-center justify-center w-5 h-5 shrink-0 mb-1 rounded text-muted-foreground/0 hover:text-muted-foreground hover:bg-muted/50 cursor-pointer transition-all duration-150"
              title="Hide sidebar"
            >
              <PanelLeft className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main content */}
      <div
        className="flex-1 min-w-0 flex flex-col min-h-0"
        style={{ '--repo-pr': collapsed ? '0.5rem' : '1rem' } as React.CSSProperties}
      >
        <div className={`hidden lg:flex items-center gap-1 text-xs px-2 pt-3 pb-1 ${collapsed ? "visible" : "invisible"}`}>
          <Link
            href={`/${owner}`}
            className="text-muted-foreground/60 hover:text-foreground transition-colors tracking-tight"
          >
            {owner}
          </Link>
          <span className="text-muted-foreground/30">/</span>
          <Link
            href={`/${owner}/${repo}`}
            className="font-medium text-foreground hover:text-foreground/80 transition-colors tracking-tight"
          >
            {repo}
          </Link>
        </div>
        {children}
      </div>
    </div>
  );
}
