import { ChevronLeft, ChevronRight, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useMediaUrl } from '../db';
import { useStore } from '../store';

/**
 * Full-screen photo / video. Photos zoom inside the viewer (pinch, double-tap, mouse wheel, the
 * buttons) and pan with a finger or the mouse; the page itself never zooms, so the app's bars stay
 * where they are. Opened from a gallery it flips through the card's photos (arrows, ← / →, swipe).
 */
export function Lightbox() {
  const lightbox = useStore((s) => s.lightbox);
  const setLightbox = useStore((s) => s.setLightbox);
  if (!lightbox) return null;
  return <Viewer key={lightbox.src} lb={lightbox} close={() => setLightbox(null)} />;
}

type View = { s: number; x: number; y: number };
const FIT: View = { s: 1, x: 0, y: 0 };
const MAX = 6;

function Viewer({ lb, close }: { lb: NonNullable<ReturnType<typeof useStore.getState>['lightbox']>; close: () => void }) {
  const photos = lb.photos;
  const [index, setIndex] = useState(lb.index ?? 0);
  const cur = photos?.[index];
  const resolved = useMediaUrl(cur?.mediaId, cur?.url);
  const src = photos ? resolved : lb.src;
  const count = photos?.length ?? 1;

  const [view, setViewState] = useState<View>(FIT);
  const viewRef = useRef(view);
  const setView = (v: View) => {
    viewRef.current = v;
    setViewState(v);
  };
  const imgRef = useRef<HTMLImageElement>(null);
  const go = (step: number) => {
    if (count < 2) return;
    setIndex((i) => (i + step + count) % count);
    setView(FIT);
  };

  // Screen position of the photo's center when not moved (zoom scales around the center).
  const center = () => {
    const r = imgRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    return { x: r.left + r.width / 2 - v.x, y: r.top + r.height / 2 - v.y };
  };
  /** Zoom to scale `s`, keeping the photo point under screen point `p` where it is. */
  const zoomAt = (s: number, p: { x: number; y: number }, from = viewRef.current) => {
    if (!imgRef.current) return;
    const c = center();
    const ns = Math.min(MAX, Math.max(1, s));
    if (ns === 1) return setView(FIT);
    const ux = (p.x - c.x - from.x) / from.s;
    const uy = (p.y - c.y - from.y) / from.s;
    setView({ s: ns, x: p.x - c.x - ux * ns, y: p.y - c.y - uy * ns });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === '+' || e.key === '=') zoomAt(viewRef.current.s * 1.5, center());
      else if (e.key === '-') zoomAt(viewRef.current.s / 1.5, center());
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  // Touch and mouse: one pointer pans (or swipes to the next photo when not zoomed), two pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{
    start: View;
    dist: number;
    mid: { x: number; y: number };
    moved: boolean;
    at: number;
    origin: { x: number; y: number };
  } | null>(null);
  const lastTap = useRef(0);
  const begin = () => {
    const pts = [...pointers.current.values()];
    const mid = pts.length > 1 ? { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 } : pts[0];
    const dist = pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1 : 1;
    gesture.current = { start: viewRef.current, dist, mid, moved: gesture.current?.moved ?? false, at: Date.now(), origin: mid };
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest('button, video')) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 1) gesture.current = null;
    begin();
  };
  const onMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    const pts = [...pointers.current.values()];
    if (pts.length > 1) {
      g.moved = true;
      const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
      if (!imgRef.current) return;
      const c = center();
      const s = Math.min(MAX, Math.max(0.6, (g.start.s * dist) / g.dist));
      const ux = (g.mid.x - c.x - g.start.x) / g.start.s;
      const uy = (g.mid.y - c.y - g.start.y) / g.start.s;
      setView({ s, x: mid.x - c.x - ux * s, y: mid.y - c.y - uy * s });
      return;
    }
    const dx = pts[0].x - g.mid.x;
    const dy = pts[0].y - g.mid.y;
    if (Math.hypot(dx, dy) > 6) g.moved = true;
    // Zoomed in: pan. Not zoomed: the photo follows the finger sideways (a swipe flips photos).
    if (g.start.s > 1) setView({ s: g.start.s, x: g.start.x + dx, y: g.start.y + dy });
    else if (count > 1) setView({ s: 1, x: dx, y: 0 });
  };
  const onUp = (e: React.PointerEvent) => {
    if (!pointers.current.delete(e.pointerId)) return;
    const g = gesture.current;
    if (pointers.current.size) return begin(); // one finger of a pinch lifted: keep going with the other
    gesture.current = null;
    if (!g) return;
    const v = viewRef.current;
    if (v.s < 1.02) {
      // Swipe → next / previous photo.
      if (count > 1 && Math.abs(v.x) > 70) return go(v.x < 0 ? 1 : -1);
      setView(FIT);
    }
    if (g.moved) return;
    // A tap: double tap zooms in / out; a tap on the dark backdrop closes.
    const now = Date.now();
    if (now - lastTap.current < 300 && imgRef.current) {
      lastTap.current = 0;
      return viewRef.current.s > 1 ? setView(FIT) : zoomAt(2.5, { x: e.clientX, y: e.clientY });
    }
    lastTap.current = now;
    if (e.target === e.currentTarget && v.s <= 1) setTimeout(() => lastTap.current === now && close(), 300);
  };

  const zoomed = view.s > 1;
  return (
    <div
      className={`overlay lightbox ${zoomed ? 'zoomed' : ''}`}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onWheel={(e) =>
        lb.kind === 'image' && zoomAt(viewRef.current.s * Math.exp(-e.deltaY * 0.002), { x: e.clientX, y: e.clientY })
      }
    >
      {lb.kind === 'image' ? (
        src && (
          <img
            ref={imgRef}
            src={src}
            alt=""
            draggable={false}
            className={gesture.current ? 'live' : ''}
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})` }}
          />
        )
      ) : (
        <video src={lb.src} controls autoPlay />
      )}
      <div className="lb-bar">
        {lb.kind === 'image' && (
          <>
            <button title="Zoom out (−)" disabled={!zoomed} onClick={() => imgRef.current && zoomAt(view.s / 1.6, center())}>
              <ZoomOut size={18} />
            </button>
            <button title="Zoom in (+)" disabled={view.s >= MAX} onClick={() => imgRef.current && zoomAt(view.s * 1.6, center())}>
              <ZoomIn size={18} />
            </button>
          </>
        )}
        {count > 1 && (
          <span className="lb-count">
            {index + 1} / {count}
          </span>
        )}
        <button title="Close (Esc)" onClick={close}>
          <X size={18} />
        </button>
      </div>
      {count > 1 && (
        <>
          <button className="lb-arrow prev" title="Previous (←)" onClick={() => go(-1)}>
            <ChevronLeft size={22} />
          </button>
          <button className="lb-arrow next" title="Next (→)" onClick={() => go(1)}>
            <ChevronRight size={22} />
          </button>
        </>
      )}
    </div>
  );
}
