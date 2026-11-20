import { useRef } from "react";
interface ResizeHandleProps {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}
export function ResizeHandle({ value, min, max, onChange }: ResizeHandleProps) {
  const origin = useRef({ x: 0, value });
  return (
    <div
      role="separator"
      aria-label="Redimensionar navegação"
      aria-orientation="vertical"
      aria-controls="room-navigation"
      aria-valuemin={min}
      aria-valuemax={max}
      aria-valuenow={Math.round(value)}
      tabIndex={0}
      className="workspace-resizer"
      onPointerDown={(event) => {
        if (event.button !== 0) return;
        event.preventDefault();
        origin.current = { x: event.clientX, value };
        event.currentTarget.setPointerCapture(event.pointerId);
      }}
      onPointerMove={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          onChange(origin.current.value + event.clientX - origin.current.x);
      }}
      onPointerUp={(event) => {
        if (event.currentTarget.hasPointerCapture(event.pointerId))
          event.currentTarget.releasePointerCapture(event.pointerId);
      }}
      onKeyDown={(event) => {
        const next =
          event.key === "ArrowLeft"
            ? value - 16
            : event.key === "ArrowRight"
              ? value + 16
              : event.key === "Home"
                ? min
                : event.key === "End"
                  ? max
                  : null;
        if (next !== null) {
          event.preventDefault();
          onChange(next);
        }
      }}
    >
      <span />
    </div>
  );
}
