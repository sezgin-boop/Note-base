import { useReactFlow, ViewportPortal } from '@xyflow/react';
import {
  ArrowUpRight,
  Check,
  Circle,
  Eraser,
  Highlighter,
  Minus,
  MousePointer2,
  Pencil,
  Send,
  Square,
  Trash2,
  Type,
  Undo2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { addSharedComment, type RemoteComment } from '../cloud';
import {
  constrain,
  DRAW_COLORS,
  DRAW_SIZES,
  fontSize,
  MARKUP_NODE,
  markupBodies,
  splitShapes,
  meaningful,
  paint,
  parseMarkup,
  shapePath,
  shapeToCard,
  simplify,
  strokeWidth,
  useDraw,
  type DrawTool,
  type Shape,
} from '../draw';
import { useStore } from '../store';
import { updateClientComment } from '../sync';
import { toast } from '../ui';

const TOOLS: { id: DrawTool; label: string; key: string; icon: React.ReactNode }[] = [
  { id: 'pen', label: 'Pen', key: 'P', icon: <Pencil size={16} /> },
  { id: 'marker', label: 'Highlighter', key: 'M', icon: <Highlighter size={16} /> },
  { id: 'line', label: 'Line', key: 'L', icon: <Minus size={16} style={{ transform: 'rotate(-45deg)' }} /> },
  { id: 'arrow', label: 'Arrow', key: 'A', icon: <ArrowUpRight size={16} /> },
  { id: 'rect', label: 'Rectangle', key: 'R', icon: <Square size={15} /> },
  { id: 'ellipse', label: 'Ellipse', key: 'O', icon: <Circle size={15} /> },
  { id: 'text', label: 'Text', key: 'T', icon: <Type size={16} /> },
  { id: 'eraser', label: 'Eraser', key: 'E', icon: <Eraser size={16} /> },
];

const OLD_DATABASE = /unknown kind|function .* does not exist|too long|could not find the function/i;

/** Markup comments on the open board, with their shapes. */
function useMarkups() {
  const list = useStore((s) => s.clientComments[MARKUP_NODE]);
  const currentId = useStore((s) => s.currentId);
  return useMemo(
    () =>
      (list ?? [])
        .filter((c) => c.kind === 'markup' && c.boardId === currentId)
        .map((c) => ({ comment: c, shapes: parseMarkup(c.body) })),
    [list, currentId],
  );
}

function ShapeSvg({ s, dataAttr }: { s: Shape; dataAttr?: Record<string, string> }) {
  if (s.shape === 'text') {
    const fs = fontSize(s.size);
    return (
      <text
        x={s.points[0]}
        y={s.points[1]}
        className="draw-svg-text"
        style={{ fill: paint(s.stroke), fontSize: fs }}
        {...dataAttr}
      >
        {(s.text ?? '').split('\n').map((line, i) => (
          <tspan key={i} x={s.points[0]} dy={i ? fs * 1.3 : fs}>
            {line || ' '}
          </tspan>
        ))}
      </text>
    );
  }
  const d = shapePath(s);
  return (
    <g {...dataAttr}>
      <path
        d={d}
        className={`draw-stroke ${s.shape === 'marker' ? 'marker' : ''}`}
        style={{ stroke: paint(s.stroke), strokeWidth: strokeWidth(s) }}
      />
      <path d={d} className="draw-hit" style={{ strokeWidth: strokeWidth(s) + 14 }} />
    </g>
  );
}

/** Inside React Flow: the shape being drawn, a client's unsent shapes and clients' sent markup. */
export function DrawOverlay() {
  const live = useDraw((s) => s.live);
  const pending = useDraw((s) => s.pending);
  const markups = useMarkups();
  return (
    <ViewportPortal>
      <svg className="draw-overlay" width="1" height="1">
        {markups.map(({ comment, shapes }) => (
          <g key={comment.id} className="markup-remote">
            {shapes.map((s, i) => (
              <ShapeSvg key={i} s={s} />
            ))}
          </g>
        ))}
        {pending.map((s, i) => (
          <ShapeSvg key={i} s={s} dataAttr={{ 'data-pending': String(i) }} />
        ))}
        {live && <ShapeSvg s={live} />}
      </svg>
      {markups.map(({ comment, shapes }) =>
        shapes[0] ? (
          <span
            key={comment.id}
            className="markup-tag"
            style={{ transform: `translate(${shapes[0].points[0]}px, ${shapes[0].points[1] - 28}px)` }}
          >
            ✏️ {comment.author}
          </span>
        ) : null,
      )}
    </ViewportPortal>
  );
}

/**
 * Turns pointer input on the canvas into shapes while a draw tool is on. Listens in the capture phase,
 * so drawing works over cards too; two fingers still pinch-zoom (the stroke is dropped).
 */
export function useDrawInput(ref: React.RefObject<HTMLDivElement | null>) {
  const rf = useReactFlow();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let active: { id: number; shape: Shape; erasing?: boolean; erased?: boolean } | null = null;
    const down = new Set<number>();
    const flow = (e: PointerEvent) => rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });

    const erase = (e: PointerEvent) => {
      for (const hit of document.elementsFromPoint(e.clientX, e.clientY)) {
        const card = (hit as HTMLElement).closest?.('[data-draw-id]') as HTMLElement | null;
        const s = useStore.getState();
        if (card && !s.readOnly) {
          if (!active?.erased) s.checkpoint();
          if (active) active.erased = true;
          s.setNodes((ns) => ns.filter((n) => n.id !== card.dataset.drawId));
          return;
        }
        const pend = (hit as Element).closest?.('[data-pending]') as HTMLElement | null;
        if (pend) {
          const i = Number(pend.dataset.pending);
          useDraw.setState((d) => ({ pending: d.pending.filter((_, k) => k !== i) }));
          return;
        }
      }
    };

    const finish = () => {
      if (!active) return;
      const { shape, erasing } = active;
      active = null;
      useDraw.setState({ live: null });
      if (erasing) return;
      const s = { ...shape, points: shape.shape === 'pen' || shape.shape === 'marker' ? simplify(shape.points) : shape.points };
      if (!meaningful(s)) return;
      commitShape(s);
    };

    const onDown = (e: PointerEvent) => {
      const d = useDraw.getState();
      if (!d.tool) return;
      down.add(e.pointerId);
      if (down.size > 1) {
        // A second finger: it's a pinch, not a stroke.
        active = null;
        useDraw.setState({ live: null });
        return;
      }
      if (e.button !== 0) return;
      const t = e.target as HTMLElement;
      if (t.closest('.react-flow__minimap, .react-flow__node-toolbar, .draw-text, .markup-text-input')) return;
      e.preventDefault();
      e.stopPropagation();
      const p = flow(e);
      if (d.tool === 'text') return placeText(p, e.clientX, e.clientY);
      el.setPointerCapture(e.pointerId);
      if (d.tool === 'eraser') {
        active = { id: e.pointerId, shape: { shape: 'pen', points: [], stroke: '', size: 0 }, erasing: true };
        return erase(e);
      }
      const two = d.tool !== 'pen' && d.tool !== 'marker';
      const shape: Shape = { shape: d.tool, points: two ? [p.x, p.y, p.x, p.y] : [p.x, p.y], stroke: d.color, size: d.size };
      active = { id: e.pointerId, shape };
      useDraw.setState({ live: shape });
    };

    const onMove = (e: PointerEvent) => {
      if (!active || e.pointerId !== active.id) return;
      e.preventDefault();
      e.stopPropagation();
      if (active.erasing) return erase(e);
      const sh = active.shape;
      if (sh.shape === 'pen' || sh.shape === 'marker') {
        const zoom = rf.getViewport().zoom;
        const pts = [...sh.points];
        // Pen / stylus hardware reports extra in-between samples: use them for smooth curves.
        for (const ev of e.getCoalescedEvents?.() ?? [e]) {
          const p = flow(ev);
          const lx = pts[pts.length - 2];
          const ly = pts[pts.length - 1];
          if (Math.hypot(p.x - lx, p.y - ly) * zoom >= 1.5) pts.push(p.x, p.y);
        }
        active.shape = { ...sh, points: pts };
      } else {
        const p = flow(e);
        const [x2, y2] = e.shiftKey ? constrain(sh.shape, sh.points[0], sh.points[1], p.x, p.y) : [p.x, p.y];
        active.shape = { ...sh, points: [sh.points[0], sh.points[1], x2, y2] };
      }
      useDraw.setState({ live: active.shape });
    };

    const onUp = (e: PointerEvent) => {
      down.delete(e.pointerId);
      if (active && e.pointerId === active.id) {
        e.stopPropagation();
        finish();
      }
    };
    const onCancel = (e: PointerEvent) => {
      down.delete(e.pointerId);
      if (active && e.pointerId === active.id) {
        active = null;
        useDraw.setState({ live: null });
      }
    };
    const opts = { capture: true, passive: false };
    el.addEventListener('pointerdown', onDown, opts);
    el.addEventListener('pointermove', onMove, opts);
    el.addEventListener('pointerup', onUp, opts);
    el.addEventListener('pointercancel', onCancel, opts);
    return () => {
      el.removeEventListener('pointerdown', onDown, opts);
      el.removeEventListener('pointermove', onMove, opts);
      el.removeEventListener('pointerup', onUp, opts);
      el.removeEventListener('pointercancel', onCancel, opts);
    };
  }, [ref, rf]);
}

/** A finished shape: a card on the owner's board, or an unsent markup shape in a share view. */
function commitShape(s: Shape) {
  const store = useStore.getState();
  if (store.readOnly) {
    useDraw.setState((d) => ({ pending: [...d.pending, s] }));
    return;
  }
  store.checkpoint();
  store.setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), shapeToCard(s)]);
}

function placeText(p: { x: number; y: number }, sx: number, sy: number) {
  const store = useStore.getState();
  const d = useDraw.getState();
  if (store.readOnly) {
    useDraw.setState({ textAt: { x: sx, y: sy, flow: p } });
    return;
  }
  store.checkpoint();
  const node = shapeToCard({
    shape: 'text',
    points: [p.x, p.y - fontSize(d.size) * 0.7],
    stroke: d.color,
    size: d.size,
    text: '',
  });
  store.setNodes((ns) => [...ns.map((n) => (n.selected ? { ...n, selected: false } : n)), node]);
}

/** The floating toolbar of draw mode (and, in a share view, the button to send the markup). */
export function DrawToolbar() {
  const { tool, color, size, pending, setTool } = useDraw();
  const textAt = useDraw((s) => s.textAt);
  const readOnly = useStore((s) => s.readOnly);
  const shared = useStore((s) => s.shared);
  const canMarkUp = !readOnly || !!shared?.allowComments;
  const [sending, setSending] = useState(false);

  // Shortcuts while drawing: tool letters, Esc to stop, ⌘Z for the client's unsent shapes.
  useEffect(() => {
    if (!tool) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest('input, textarea, [contenteditable="true"]')) return;
      if (e.key === 'Escape') return setTool(null);
      if (readOnly && (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        return useDraw.setState((d) => ({ pending: d.pending.slice(0, -1) }));
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const next = TOOLS.find((x) => x.key.toLowerCase() === e.key.toLowerCase());
      if (next) {
        e.preventDefault();
        e.stopImmediatePropagation();
        setTool(next.id);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tool, readOnly, setTool]);

  if (!canMarkUp) return null;

  const send = async () => {
    if (!shared || !pending.length) return;
    const author = localStorage.getItem('notebase:guestName') || prompt('Your name (shown with your markup):')?.trim() || 'Guest';
    localStorage.setItem('notebase:guestName', author);
    setSending(true);
    const s = useStore.getState();
    try {
      const sent: RemoteComment[] = [];
      // Databases set up before markup existed only take comments (up to 2000 characters): then the
      // drawing goes as several small comments on the markup node, which read back as markup.
      let legacy = false;
      const post = (body: string) =>
        addSharedComment(shared.shareId, {
          boardId: s.currentId,
          nodeId: MARKUP_NODE,
          t: null,
          author,
          body,
          kind: legacy ? 'comment' : 'markup',
        });
      let bodies = markupBodies(pending);
      for (let i = 0; i < bodies.length; i++) {
        const body = bodies[i];
        let id: string;
        try {
          id = await post(body);
        } catch (e) {
          if (legacy || i > 0 || !OLD_DATABASE.test((e as Error).message)) throw e;
          legacy = true;
          bodies = markupBodies(splitShapes(pending, 1800), 1900);
          i = -1;
          continue;
        }
        sent.push({
          id,
          boardId: s.currentId,
          nodeId: MARKUP_NODE,
          t: null,
          author,
          body,
          createdAt: new Date().toISOString(),
          done: false,
          version: null,
          kind: 'markup',
        });
      }
      useStore.setState((st) => ({
        clientComments: { ...st.clientComments, [MARKUP_NODE]: [...(st.clientComments[MARKUP_NODE] ?? []), ...sent] },
      }));
      useDraw.setState({ pending: [] });
      setTool(null);
      toast('Markup sent — thank you!');
    } catch (e) {
      const msg = (e as Error).message;
      toast(`Couldn't send: ${msg}`, 8000);
    } finally {
      setSending(false);
    }
  };

  if (!tool) {
    // Clients get their own button (the owner has one in the bottom toolbar).
    return readOnly ? (
      <button className="markup-start" onClick={() => setTool('pen')}>
        <Pencil size={15} /> Mark up
        {pending.length > 0 && <span className="markup-count">{pending.length}</span>}
      </button>
    ) : null;
  }

  return (
    <>
      <div className="draw-toolbar" onPointerDown={(e) => e.stopPropagation()} onMouseDown={(e) => e.preventDefault()}>
        {!readOnly && (
          <button className="draw-btn" title="Select (Esc)" onClick={() => setTool(null)}>
            <MousePointer2 size={16} />
          </button>
        )}
        {TOOLS.map((t) => (
          <button
            key={t.id}
            className={`draw-btn ${tool === t.id ? 'on' : ''}`}
            title={`${t.label} (${t.key})`}
            onClick={() => setTool(t.id)}
          >
            {t.icon}
          </button>
        ))}
        <span className="draw-sep" />
        {DRAW_COLORS.map((c) => (
          <button
            key={c}
            className={`draw-color ${color === c ? 'on' : ''}`}
            style={{ background: paint(c) }}
            title={c === 'ink' ? 'Ink' : c}
            onClick={() => useDraw.setState({ color: c })}
          />
        ))}
        <span className="draw-sep" />
        {DRAW_SIZES.map((sz) => (
          <button
            key={sz}
            className={`draw-btn size ${size === sz ? 'on' : ''}`}
            title={`Thickness ${sz}`}
            onClick={() => useDraw.setState({ size: sz })}
          >
            <span style={{ width: sz + 3, height: sz + 3 }} />
          </button>
        ))}
        <span className="draw-sep" />
        {readOnly ? (
          <>
            <button
              className="draw-btn"
              title="Undo (⌘Z)"
              disabled={!pending.length}
              onClick={() => useDraw.setState((d) => ({ pending: d.pending.slice(0, -1) }))}
            >
              <Undo2 size={16} />
            </button>
            <button
              className="draw-btn"
              title="Clear"
              disabled={!pending.length}
              onClick={() => useDraw.setState({ pending: [] })}
            >
              <Trash2 size={16} />
            </button>
            <button className="draw-send" disabled={!pending.length || sending} onClick={send}>
              <Send size={14} /> {sending ? 'Sending…' : `Send${pending.length ? ` (${pending.length})` : ''}`}
            </button>
            <button className="draw-btn" title="Close (Esc)" onClick={() => setTool(null)}>
              <X size={16} />
            </button>
          </>
        ) : (
          <button className="draw-done" title="Done (Esc)" onClick={() => setTool(null)}>
            <Check size={15} /> Done
          </button>
        )}
      </div>
      {textAt && <MarkupTextInput at={textAt} />}
    </>
  );
}

/** Share view: typing a text note at the clicked spot. */
function MarkupTextInput({ at }: { at: { x: number; y: number; flow: { x: number; y: number } } }) {
  const [text, setText] = useState('');
  const { color, size } = useDraw();
  const close = (keep: boolean) => {
    const t = text.trim();
    useDraw.setState({ textAt: undefined });
    if (keep && t)
      useDraw.setState((d) => ({
        pending: [...d.pending, { shape: 'text', points: [at.flow.x, at.flow.y], stroke: color, size, text: t }],
      }));
  };
  return (
    <textarea
      autoFocus
      className="markup-text-input"
      style={{ left: at.x, top: at.y - 12, color: paint(color), fontSize: fontSize(size) }}
      value={text}
      placeholder="Type a note…"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => close(true)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close(false);
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          close(true);
        }
      }}
    />
  );
}

/** Owner: clients' markup on this board, to keep (as drawings) or clear. */
export function MarkupBar() {
  const markups = useMarkups();
  const readOnly = useStore((s) => s.readOnly);
  const [busy, setBusy] = useState(false);
  if (readOnly || !markups.length) return null;
  const authors = [...new Set(markups.map((m) => m.comment.author))];
  const count = markups.reduce((n, m) => n + m.shapes.length, 0);
  const done = async (keep: boolean) => {
    setBusy(true);
    if (keep) {
      const s = useStore.getState();
      s.checkpoint();
      const cards = markups.flatMap((m) => m.shapes.map(shapeToCard));
      s.setNodes((ns) => [...ns, ...cards]);
    }
    for (const m of markups) await updateClientComment(m.comment.id, null);
    setBusy(false);
    toast(keep ? `Kept ${count} mark${count > 1 ? 's' : ''} as drawings` : 'Markup cleared');
  };
  return (
    <div className="markup-bar">
      <Pencil size={14} />
      <span>
        <b>{authors.join(', ')}</b> marked up this board · {count} mark{count > 1 ? 's' : ''}
      </span>
      <button className="btn-ghost" disabled={busy} onClick={() => done(true)}>
        <Check size={13} /> Keep
      </button>
      <button className="btn-ghost" disabled={busy} onClick={() => done(false)}>
        <Trash2 size={13} /> Clear
      </button>
    </div>
  );
}
