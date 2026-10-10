import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant } from '@xyflow/react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';
import { CardMeta, useCardNode } from './meta';

const HANDLES: [string, Position][] = [
  ['l', Position.Left],
  ['r', Position.Right],
  ['t', Position.Top],
  ['b', Position.Bottom],
];

export function Handles() {
  return (
    <>
      {HANDLES.map(([id, pos]) => (
        <Handle key={id} id={id} type="source" position={pos} className="handle" />
      ))}
    </>
  );
}

interface ShellProps {
  icon: ReactNode;
  label: string;
  selected?: boolean;
  color?: string;
  resizable?: boolean | 'width';
  minWidth?: number;
  minHeight?: number;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Common card chrome: small header label (like node editors), accent stripe, handles, resizer. */
export function Shell({
  icon,
  label,
  selected,
  color,
  resizable,
  minWidth = 140,
  minHeight = 60,
  actions,
  className = '',
  children,
}: ShellProps) {
  const node = useCardNode();
  return (
    <div
      className={`card ${className} ${selected ? 'is-selected' : ''}`}
      style={color ? ({ '--accent': color } as React.CSSProperties) : undefined}
    >
      {resizable === 'width' &&
        selected &&
        (['left', 'right'] as const).map((side) => (
          <NodeResizeControl
            key={side}
            position={side}
            variant={ResizeControlVariant.Line}
            resizeDirection="horizontal"
            minWidth={minWidth}
            className="width-resizer"
          />
        ))}
      {resizable === true && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={minWidth}
          minHeight={minHeight}
          lineClassName="resize-line"
          handleClassName="resize-handle"
        />
      )}
      <div className="card-label">
        <span className="card-label-icon">{icon}</span>
        <span className="card-label-text">{label}</span>
        <span className="card-actions">{actions}</span>
      </div>
      <div className="card-body">
        {children}
        {node && node.type !== 'frame' && <CardMeta node={node} />}
      </div>
      <Handles />
    </div>
  );
}

/**
 * Focus a field of a freshly created card. React Flow keeps new nodes hidden until they
 * are measured, and hidden elements can't take focus, so retry for a few frames.
 */
export function useAutoFocus(ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>, enabled?: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let tries = 0;
    let raf = 0;
    const attempt = () => {
      const el = ref.current;
      el?.focus({ preventScroll: true });
      if (el && document.activeElement === el) return el.select();
      if (++tries < 20) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [enabled, ref]);
}

/**
 * Auto-growing textarea that doesn't hijack canvas dragging. It never scrolls itself, so the mouse
 * wheel keeps panning the canvas while the pointer is over text.
 */
export function AutoText({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutoFocus(ref, autoFocus);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      className={`nodrag autotext ${className}`}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}
