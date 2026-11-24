import { useRef, type ReactNode } from 'react';
import type { ExportTarget } from '../bridge';
import { inPlugin } from '../engine/native';

/**
 * Drag-or-click export button.
 *  - browser: HTML5 drag (DownloadURL) or click to download
 *  - plugin:  press-and-drag starts a native file drag into the DAW; click saves + shows the file
 */
export function ExportButton({
  onExport,
  disabled,
  title,
  className,
  children,
}: {
  onExport: (t?: ExportTarget) => void;
  disabled?: boolean;
  title?: string;
  className?: string;
  children: ReactNode;
}) {
  const press = useRef<{ x: number; y: number; dragging: boolean } | null>(null);
  if (inPlugin)
    return (
      <button
        disabled={disabled}
        title={title}
        className={className}
        onPointerDown={(e) => (press.current = { x: e.clientX, y: e.clientY, dragging: false })}
        onPointerMove={(e) => {
          const p = press.current;
          if (!p || p.dragging || e.buttons === 0) return;
          if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > 6) {
            p.dragging = true;
            onExport('drag');
          }
        }}
        onPointerUp={() => {
          if (press.current && !press.current.dragging) onExport();
          press.current = null;
        }}
      >
        {children}
      </button>
    );
  return (
    <button
      draggable={!disabled}
      disabled={disabled}
      title={title}
      className={className}
      onDragStart={(e) => onExport(e.dataTransfer)}
      onClick={() => onExport()}
    >
      {children}
    </button>
  );
}
