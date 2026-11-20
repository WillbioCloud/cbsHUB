import { useLayoutEffect, useRef, useState } from "react";
export function useElementSize() {
  const ref = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ width: 0, height: 0, gap: 0 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      const next = {
        width: Math.floor(entry.contentRect.width),
        height: Math.floor(entry.contentRect.height),
        gap: parseFloat(getComputedStyle(element).rowGap) || 0,
      };
      setSize((old) =>
        old.width === next.width &&
        old.height === next.height &&
        old.gap === next.gap
          ? old
          : next,
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  });
  return { ref, ...size };
}
