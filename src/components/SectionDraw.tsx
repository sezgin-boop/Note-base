import { useReactFlow } from '@xyflow/react';
import { useEffect, useRef, useState } from 'react';
import { create } from 'zustand';
import { SIZES } from '../cards';
import { useDraw } from '../draw';
import { useStore } from '../store';

/** "Draw a section" mode: picking Section in the toolbar lets you drag out where it goes and how big. */
export const useSectionDraw = create<{ on: boolean; toggle: (on?: boolean) => void }>((set, get) => ({
  on: false,
  toggle: (on) => {
    const next = on ?? !get().on;
    if (next) useDraw.getState().setTool(null);
    set({ on: next });
  },
}));

/** A drag shorter than this is a tap: the section gets its usual size where it was tapped. */
const TAP = 12;
const MIN = { w: 200, h: 120 };

/** The layer over the board while drawing a section: drag a rectangle, the section fills it. */
export function SectionDrawLayer() {
  const on = useSectionDraw((s) => s.on);
  const rf = useReactFlow();
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState<{ x0: number; y0: number; x1: number; y1: number } | null>(null);

  useEffect(() => {
    if (!on) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (e.stopPropagation(), useSectionDraw.getState().toggle(false));
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [on]);
  useEffect(() => {
    if (!on) setBox(null);
  }, [on]);
  if (!on) return null;

  const local = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  const finish = (b: NonNullable<typeof box>) => {
    const r = ref.current!.getBoundingClientRect();
    const toFlow = (x: number, y: number) => rf.screenToFlowPosition({ x: x + r.left, y: y + r.top });
    const s = useStore.getState();
    const dragged = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) >= TAP;
    let pos;
    let size;
    if (dragged) {
      const a = toFlow(Math.min(b.x0, b.x1), Math.min(b.y0, b.y1));
      const z = toFlow(Math.max(b.x0, b.x1), Math.max(b.y0, b.y1));
      pos = a;
      size = { width: Math.max(MIN.w, Math.round(z.x - a.x)), height: Math.max(MIN.h, Math.round(z.y - a.y)) };
    } else {
      const d = SIZES.frame!;
      const c = toFlow(b.x0, b.y0);
      size = { width: d.width, height: d.height ?? 380 };
      pos = { x: c.x - size.width / 2, y: c.y - size.height / 2 };
    }
    const card = s.addCard('frame', pos);
    // addCard saved the undo step already; the size belongs to the same step.
    s.setNodes((ns) => ns.map((n) => (n.id === card.id ? { ...n, ...size } : n)));
    useSectionDraw.getState().toggle(false);
  };

  const flow = box && {
    left: Math.min(box.x0, box.x1),
    top: Math.min(box.y0, box.y1),
    width: Math.abs(box.x1 - box.x0),
    height: Math.abs(box.y1 - box.y0),
  };
  const zoom = rf.getViewport().zoom;

  return (
    <div
      ref={ref}
      className="section-draw"
      onPointerDown={(e) => {
        if (e.button !== 0 || !e.isPrimary) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        const p = local(e);
        setBox({ x0: p.x, y0: p.y, x1: p.x, y1: p.y });
      }}
      onPointerMove={(e) => {
        if (!box || !e.isPrimary) return;
        const p = local(e);
        setBox({ ...box, x1: p.x, y1: p.y });
      }}
      onPointerUp={(e) => {
        if (!box || !e.isPrimary) return;
        const p = local(e);
        finish({ ...box, x1: p.x, y1: p.y });
        setBox(null);
      }}
      onPointerCancel={() => setBox(null)}
    >
      <div className="section-draw-hint">
        Drag to draw the section · tap for the usual size
        <button onPointerDown={(e) => e.stopPropagation()} onClick={() => useSectionDraw.getState().toggle(false)}>
          Cancel
        </button>
      </div>
      {flow && flow.width + flow.height > 4 && (
        <div className="section-draw-box" style={flow}>
          <span>
            {Math.round(flow.width / zoom)} × {Math.round(flow.height / zoom)}
          </span>
        </div>
      )}
    </div>
  );
}
