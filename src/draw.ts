// Drawing on the board: pen / highlighter strokes, lines, arrows, rectangles, ellipses and text.
// A finished shape becomes a "draw" card (so it moves, resizes, syncs and undoes like any card);
// clients on a share link send theirs as "markup" for the owner to keep or clear.

import { create } from 'zustand';
import type { CardData, CardNode } from './types';
import { nanoid } from 'nanoid';

export type DrawShape = 'pen' | 'marker' | 'line' | 'arrow' | 'rect' | 'ellipse' | 'text';
export type DrawTool = DrawShape | 'eraser';

/** A shape in board coordinates (points are x, y pairs). */
export interface Shape {
  shape: DrawShape;
  points: number[];
  stroke: string;
  size: number;
  text?: string;
}

export const DRAW_COLORS = ['ink', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#a855f7', '#ec4899'];
export const DRAW_SIZES = [2, 4, 8];

/** "ink" follows the theme's text color, so it reads in dark and light mode. */
export const paint = (stroke: string) => (stroke === 'ink' ? 'var(--text)' : stroke);

/** Marker strokes are wide and see-through, like a highlighter. */
export const strokeWidth = (s: Pick<Shape, 'shape' | 'size'>) => (s.shape === 'marker' ? 10 + s.size * 2 : s.size);
export const fontSize = (size: number) => (size <= 2 ? 16 : size <= 4 ? 22 : 32);

// ---------- Geometry ----------

/** Drop points that add nothing (Ramer–Douglas–Peucker), keeping strokes light to store and sync. */
export function simplify(pts: number[], tolerance = 0.8): number[] {
  if (pts.length <= 4) return pts;
  const n = pts.length / 2;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay, bx, by] = [pts[a * 2], pts[a * 2 + 1], pts[b * 2], pts[b * 2 + 1]];
    const len = Math.hypot(bx - ax, by - ay) || 1;
    let max = 0;
    let idx = -1;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i * 2 + 1]) - (ax - pts[i * 2]) * (by - ay)) / len;
      if (d > max) [max, idx] = [d, i];
    }
    if (max > tolerance && idx > 0) {
      keep[idx] = 1;
      stack.push([a, idx], [idx, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(Math.round(pts[i * 2] * 10) / 10, Math.round(pts[i * 2 + 1] * 10) / 10);
  return out;
}

const f = (v: number) => Math.round(v * 10) / 10;

/** SVG path of a shape (pen strokes are smoothed through the midpoints between samples). */
export function shapePath(s: Pick<Shape, 'shape' | 'points' | 'size'>): string {
  const p = s.points;
  if (s.shape === 'pen' || s.shape === 'marker') {
    if (p.length < 4) return p.length ? `M${f(p[0])} ${f(p[1])}l0.01 0` : '';
    let d = `M${f(p[0])} ${f(p[1])}`;
    for (let i = 2; i < p.length - 2; i += 2) {
      const mx = (p[i] + p[i + 2]) / 2;
      const my = (p[i + 1] + p[i + 3]) / 2;
      d += `Q${f(p[i])} ${f(p[i + 1])} ${f(mx)} ${f(my)}`;
    }
    return `${d}L${f(p[p.length - 2])} ${f(p[p.length - 1])}`;
  }
  const [x1, y1, x2, y2] = p;
  if (s.shape === 'line') return `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}`;
  if (s.shape === 'arrow') {
    const ang = Math.atan2(y2 - y1, x2 - x1);
    const head = 10 + s.size * 3;
    const a1 = ang + Math.PI - 0.5;
    const a2 = ang + Math.PI + 0.5;
    return (
      `M${f(x1)} ${f(y1)}L${f(x2)} ${f(y2)}` +
      `M${f(x2 + head * Math.cos(a1))} ${f(y2 + head * Math.sin(a1))}L${f(x2)} ${f(y2)}L${f(x2 + head * Math.cos(a2))} ${f(y2 + head * Math.sin(a2))}`
    );
  }
  const [l, t, r, b] = [Math.min(x1, x2), Math.min(y1, y2), Math.max(x1, x2), Math.max(y1, y2)];
  if (s.shape === 'rect') return `M${f(l)} ${f(t)}H${f(r)}V${f(b)}H${f(l)}Z`;
  if (s.shape === 'ellipse') {
    const rx = (r - l) / 2;
    const ry = (b - t) / 2;
    return `M${f(l)} ${f(t + ry)}a${f(rx)} ${f(ry)} 0 1 0 ${f(rx * 2)} 0a${f(rx)} ${f(ry)} 0 1 0 ${f(-rx * 2)} 0`;
  }
  return '';
}

/** Lines snap to 15° steps and rectangles / ellipses to squares / circles while Shift is held. */
export function constrain(shape: DrawShape, x1: number, y1: number, x2: number, y2: number): [number, number] {
  if (shape === 'line' || shape === 'arrow') {
    const ang = Math.round(Math.atan2(y2 - y1, x2 - x1) / (Math.PI / 12)) * (Math.PI / 12);
    const len = Math.hypot(x2 - x1, y2 - y1);
    return [x1 + len * Math.cos(ang), y1 + len * Math.sin(ang)];
  }
  const side = Math.max(Math.abs(x2 - x1), Math.abs(y2 - y1));
  return [x1 + Math.sign(x2 - x1 || 1) * side, y1 + Math.sign(y2 - y1 || 1) * side];
}

/** Is the shape big enough to keep (not a stray click)? */
export const meaningful = (s: Shape) => {
  if (s.shape === 'text') return !!s.text?.trim();
  if (s.shape === 'pen' || s.shape === 'marker') return s.points.length >= 2;
  return Math.hypot(s.points[2] - s.points[0], s.points[3] - s.points[1]) > 4;
};

/** A board shape → a "draw" card positioned at its bounding box. */
export function shapeToCard(s: Shape): CardNode {
  const pad = strokeWidth(s) + (s.shape === 'arrow' ? 12 + s.size * 3 : 6);
  if (s.shape === 'text') {
    return {
      id: nanoid(10),
      type: 'draw',
      position: { x: s.points[0], y: s.points[1] },
      data: { shape: 'text', text: s.text ?? '', stroke: s.stroke, size: s.size },
      width: 280,
    };
  }
  const xs = s.points.filter((_, i) => i % 2 === 0);
  const ys = s.points.filter((_, i) => i % 2 === 1);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const w = Math.max(Math.max(...xs) - minX + pad, 12);
  const h = Math.max(Math.max(...ys) - minY + pad, 12);
  const points = s.points.map((v, i) => f(v - (i % 2 === 0 ? minX : minY)));
  const data: CardData = { shape: s.shape, points, stroke: s.stroke, size: s.size, w: f(w), h: f(h) };
  return { id: nanoid(10), type: 'draw', position: { x: f(minX), y: f(minY) }, data, width: f(w), height: f(h) };
}

/** A draw card → board shape (inverse of shapeToCard, used when keeping a client's markup or copying). */
export function cardToShape(n: CardNode): Shape {
  const d = n.data;
  if (d.shape === 'text')
    return { shape: 'text', points: [n.position.x, n.position.y], stroke: d.stroke ?? 'ink', size: d.size ?? 4, text: d.text };
  const sx = (n.width ?? d.w ?? 1) / (d.w ?? 1);
  const sy = (n.height ?? d.h ?? 1) / (d.h ?? 1);
  return {
    shape: d.shape as DrawShape,
    points: (d.points ?? []).map((v, i) => (i % 2 === 0 ? n.position.x + v * sx : n.position.y + v * sy)),
    stroke: d.stroke ?? 'ink',
    size: d.size ?? 4,
  };
}

// ---------- Client markup (sent as share-link comments) ----------

export const MARKUP_NODE = '__markup__';

/** Markup comments carry {"v":1,"shapes":[…]}; split so each stays under the database's size limit. */
export function markupBodies(shapes: Shape[], max = 45000): string[] {
  const bodies: string[] = [];
  let batch: Shape[] = [];
  for (const s of shapes) {
    const next = JSON.stringify({ v: 1, shapes: [...batch, s] });
    if (next.length > max && batch.length) {
      bodies.push(JSON.stringify({ v: 1, shapes: batch }));
      batch = [s];
    } else batch.push(s);
  }
  if (batch.length) bodies.push(JSON.stringify({ v: 1, shapes: batch }));
  return bodies;
}

export function parseMarkup(body: string): Shape[] {
  try {
    const o = JSON.parse(body);
    return (Array.isArray(o?.shapes) ? o.shapes : []).filter(
      (s: Shape) => s && typeof s.shape === 'string' && Array.isArray(s.points) && s.points.every((v) => typeof v === 'number'),
    );
  } catch {
    return [];
  }
}

// ---------- Draw mode state ----------

interface DrawState {
  /** The active tool; null = draw mode off. */
  tool: DrawTool | null;
  color: string;
  size: number;
  /** The shape being drawn right now. */
  live: Shape | null;
  /** Share view: shapes drawn but not sent yet. */
  pending: Shape[];
  /** Share view: where a text note is being typed (screen point, and the same point on the board). */
  textAt?: { x: number; y: number; flow: { x: number; y: number } };
  setTool: (tool: DrawTool | null) => void;
}

export const useDraw = create<DrawState>((set) => ({
  tool: null,
  color: localStorage.getItem('notebase:drawColor') ?? 'ink',
  size: Number(localStorage.getItem('notebase:drawSize')) || 4,
  live: null,
  pending: [],
  setTool: (tool) => set({ tool, live: null, textAt: undefined }),
}));
useDraw.subscribe((s, prev) => {
  if (s.color !== prev.color) localStorage.setItem('notebase:drawColor', s.color);
  if (s.size !== prev.size) localStorage.setItem('notebase:drawSize', String(s.size));
});
