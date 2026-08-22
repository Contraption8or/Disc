import { useEffect, useRef, useState } from "react";

// A dependency-free virtual list: given a scroll container, a fixed row
// height, and an item count, returns the [start, end) index range that
// should actually be rendered. This is what keeps a 400-track library from
// mounting 400 rows (and thousands of waveform bar elements) at once.
export function useVirtualRows(containerRef, itemCount, rowHeight, overscan = 10) {
  const [range, setRange] = useState({ start: 0, end: Math.min(itemCount, 40) });
  const tickingRef = useRef(false);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    function compute() {
      const scrollTop = el.scrollTop;
      const viewportHeight = el.clientHeight;
      const start = Math.max(0, Math.floor(scrollTop / rowHeight) - overscan);
      const visibleCount = Math.ceil(viewportHeight / rowHeight) + overscan * 2;
      const end = Math.min(itemCount, start + visibleCount);
      setRange((prev) =>
        prev.start === start && prev.end === end ? prev : { start, end }
      );
    }

    function onScroll() {
      if (tickingRef.current) return;
      tickingRef.current = true;
      requestAnimationFrame(() => {
        compute();
        tickingRef.current = false;
      });
    }

    compute();
    el.addEventListener("scroll", onScroll);
    window.addEventListener("resize", onScroll);
    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [containerRef, itemCount, rowHeight, overscan]);

  // Keep the range in bounds when the list itself shrinks (e.g. a search
  // narrows the results) so we don't render a stale out-of-range slice.
  useEffect(() => {
    setRange((r) => {
      const start = Math.min(r.start, itemCount);
      const end = Math.min(r.end, itemCount);
      return r.start === start && r.end === end ? r : { start, end };
    });
  }, [itemCount]);

  return range;
}
