import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import SkillCard from "@/components/SkillCard";
import type { Skill, ViewMode } from "@/store/skillStore";

interface VirtualSkillListProps {
  skills: Skill[];
  viewMode: ViewMode;
  onScrollReset?: (reset: () => void) => void;
}

function getColumnCount(width: number): number {
  if (width >= 1280) return 4;
  if (width >= 1024) return 3;
  if (width >= 640) return 2;
  return 1;
}

export default function VirtualSkillList({ skills, viewMode, onScrollReset }: VirtualSkillListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const columns = viewMode === "grid" ? getColumnCount(width) : 1;
  const rows = useMemo(() => {
    if (viewMode === "list") return skills.map((skill) => [skill]);
    const result: Skill[][] = [];
    for (let index = 0; index < skills.length; index += columns) {
      result.push(skills.slice(index, index + columns));
    }
    return result;
  }, [columns, skills, viewMode]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(element);
    setWidth(element.clientWidth);
    return () => observer.disconnect();
  }, []);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (viewMode === "grid" ? 250 : 112),
    overscan: 4,
    useFlushSync: false,
  });

  // The first render can happen before ResizeObserver knows the container width.
  // Grid rows then change from one card to several cards, so force a fresh
  // measurement after the column count settles instead of keeping stale row heights.
  useEffect(() => {
    if (viewMode !== "grid" || width === 0) return;
    const frame = requestAnimationFrame(() => {
      virtualizer.measure();
      scrollRef.current?.scrollTo({ top: 0 });
    });
    return () => cancelAnimationFrame(frame);
  }, [columns, viewMode, width, virtualizer]);

  useEffect(() => {
    onScrollReset?.(() => {
      scrollRef.current?.scrollTo({ top: 0 });
      virtualizer.scrollToIndex(0);
    });
  }, [onScrollReset, virtualizer]);

  return (
    <div ref={scrollRef} className="h-[calc(100vh-13rem)] min-h-[24rem] overflow-auto overscroll-contain">
      <div className="relative w-full" style={{ height: virtualizer.getTotalSize() }}>
        {virtualizer.getVirtualItems().map((row) => (
          <div
            key={row.key}
            ref={virtualizer.measureElement}
            data-index={row.index}
            className={viewMode === "grid" ? "absolute left-0 top-0 grid w-full gap-3" : "absolute left-0 top-0 flex w-full flex-col gap-2"}
            style={{
              transform: `translateY(${row.start}px)`,
              gridTemplateColumns: viewMode === "grid" ? `repeat(${columns}, minmax(0, 1fr))` : undefined,
            }}
          >
            {rows[row.index].map((skill) => <SkillCard key={skill.id} skill={skill} />)}
          </div>
        ))}
      </div>
    </div>
  );
}
