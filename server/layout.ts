// Moving and arranging cards on a board for the connector, without recreating them: a card keeps
// its id, so its comments, video review notes and arrows stay attached.
//
// Sections are geometric, as in the app: a card belongs to the smallest section whose (open) box
// holds the card's center. A collapsed section also lists the cards it hides in `members`.

import { SIZES } from '../src/cards';
import { estimateHeight } from '../src/ai/importer';
import { applyHidden } from '../src/sections';
import type { BoardContent, CardNode, CardType } from '../src/types';

export const PAD = 32; // inside a section, left / right / bottom
export const HEAD = 56; // room for the section's title
export const GAP = 24; // between cards

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The size a card takes on the canvas (what the app measured, else its set size, else an estimate). */
export function sizeOf(n: CardNode): { w: number; h: number } {
  if (n.type === 'frame' && n.data.collapsed && n.data.openSize) return { w: n.data.openSize.width, h: n.data.openSize.height };
  const t = n.type as CardType;
  return {
    w: Math.round(n.measured?.width ?? n.width ?? SIZES[t]?.width ?? 260),
    h: Math.round(n.measured?.height ?? n.height ?? SIZES[t]?.height ?? estimateHeight(t, n.data)),
  };
}

export const boxOf = (n: CardNode): Box => ({ x: Math.round(n.position.x), y: Math.round(n.position.y), ...sizeOf(n) });

const inside = (b: Box, x: number, y: number) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h;

/** For every card, the section it sits in (smallest section holding its center), or null. */
export function owners(nodes: CardNode[]): Map<string, string | null> {
  const frames = nodes.filter((n) => n.type === 'frame');
  const out = new Map<string, string | null>();
  for (const n of nodes) {
    const b = boxOf(n);
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    let best: { id: string; area: number } | null = null;
    for (const f of frames) {
      if (f.id === n.id) continue;
      const fb = boxOf(f);
      // A section can't sit inside a smaller one.
      if (n.type === 'frame' && fb.w * fb.h <= b.w * b.h) continue;
      if (inside(fb, cx, cy) && (!best || fb.w * fb.h < best.area)) best = { id: f.id, area: fb.w * fb.h };
    }
    out.set(n.id, best?.id ?? null);
  }
  return out;
}

/** The cards directly in a section (not those in sections nested inside it). */
export function children(content: BoardContent, frameId: string): CardNode[] {
  const own = owners(content.nodes);
  return content.nodes.filter((n) => own.get(n.id) === frameId);
}

/** Everything inside a section, nested sections' cards included. */
export function descendants(content: BoardContent, frameId: string): CardNode[] {
  const own = owners(content.nodes);
  const holds = (id: string): boolean => {
    const o = own.get(id);
    return !!o && (o === frameId || holds(o));
  };
  const frame = content.nodes.find((n) => n.id === frameId);
  const hidden = new Set(frame?.data.collapsed ? (frame.data.members ?? []) : []);
  return content.nodes.filter((n) => n.id !== frameId && (holds(n.id) || hidden.has(n.id)));
}

/** A section by id or by its title (case-insensitive). */
export function findFrame(content: BoardContent, ref: string): CardNode {
  const want = String(ref ?? '').trim();
  const byId = content.nodes.find((n) => n.id === want);
  if (byId) {
    if (byId.type !== 'frame') throw new Error(`Card ${want} is a ${byId.type}, not a section.`);
    return byId;
  }
  const frames = content.nodes.filter((n) => n.type === 'frame');
  const named = frames.filter((f) => (f.data.title ?? '').trim().toLowerCase() === want.toLowerCase());
  if (named.length === 1) return named[0];
  if (named.length > 1)
    throw new Error(`Several sections are called "${want}": ${named.map((f) => f.id).join(', ')}. Use the id.`);
  throw new Error(
    `No section "${want}". Sections: ${frames.map((f) => `"${f.data.title || 'Section'}" (id: ${f.id})`).join(', ') || 'none'}.`,
  );
}

/** Move a card to (x, y); a section takes everything inside it along. */
export function moveTo(content: BoardContent, node: CardNode, x: number, y: number) {
  const dx = Math.round(x) - node.position.x;
  const dy = Math.round(y) - node.position.y;
  if (!dx && !dy) return;
  const carried = node.type === 'frame' ? descendants(content, node.id) : [];
  for (const n of [node, ...carried]) n.position = { x: n.position.x + dx, y: n.position.y + dy };
}

/**
 * Set a section's (open) size. When it grows, cards around it that it would now cover (but that
 * aren't in it) move out of the way by as much as it grew, so they don't fall into the section.
 */
function resizeFrame(content: BoardContent, frame: CardNode, w: number, h: number, members: CardNode[] = []) {
  const before = boxOf(frame);
  const inFrame = new Set([frame.id, ...descendants(content, frame.id).map((d) => d.id)]);
  // Cards just placed in the section may still lie outside its old bounds.
  for (const m of members) {
    inFrame.add(m.id);
    if (m.type === 'frame') for (const d of descendants(content, m.id)) inFrame.add(d.id);
  }
  // Sections that hold this one grow with it rather than move away.
  const holders = new Set<string>();
  const own = owners(content.nodes);
  for (let o = own.get(frame.id); o; o = own.get(o)) holders.add(o);
  setFrameSize(frame, w, h);
  const after = boxOf(frame);
  const dw = after.w - before.w;
  const dh = after.h - before.h;
  if (dw <= 0 && dh <= 0) return;
  const outside = content.nodes.filter((n) => !inFrame.has(n.id) && !holders.has(n.id) && !n.hidden);
  const pushed = new Set<string>();
  for (const n of outside) {
    if (pushed.has(n.id)) continue;
    const b = boxOf(n);
    if (!overlaps(b, after, 0) || overlaps(b, before, 0)) continue;
    // Right of the old section → move right; below it → move down.
    const right = b.x >= before.x + before.w;
    moveTo(content, n, b.x + (right ? Math.max(0, dw) : 0), b.y + (right ? 0 : Math.max(0, dh)));
    pushed.add(n.id);
    if (n.type === 'frame') for (const d of descendants(content, n.id)) pushed.add(d.id);
  }
}

/** Set a section's (open) size. */
function setFrameSize(frame: CardNode, w: number, h: number) {
  if (frame.data.collapsed) frame.data.openSize = { width: Math.round(w), height: Math.round(h) };
  else {
    frame.width = Math.round(w);
    frame.height = Math.round(h);
    if (frame.measured) frame.measured = { width: frame.width, height: frame.height };
  }
}

/** Grow a section so every card directly in it fits (with padding). Never shrinks it. */
export function growToFit(content: BoardContent, frame: CardNode, extra: CardNode[] = []) {
  const kids = [...children(content, frame.id), ...extra.filter((e) => !children(content, frame.id).includes(e))];
  if (!kids.length) return;
  const f = boxOf(frame);
  const right = Math.max(...kids.map((k) => boxOf(k).x + boxOf(k).w));
  const bottom = Math.max(...kids.map((k) => boxOf(k).y + boxOf(k).h));
  resizeFrame(content, frame, Math.max(f.w, right - f.x + PAD), Math.max(f.h, bottom - f.y + PAD), kids);
}

const overlaps = (a: Box, b: Box, gap = GAP) =>
  a.x < b.x + b.w + gap && a.x + a.w + gap > b.x && a.y < b.y + b.h + gap && a.y + a.h + gap > b.y;

/** Keep collapsed sections' member lists right after cards moved in or out of them. */
function syncCollapsed(content: BoardContent, moved: CardNode[], target: CardNode | null) {
  const ids = new Set(moved.map((m) => m.id));
  for (const f of content.nodes)
    if (f.type === 'frame' && f.data.collapsed && f !== target && f.data.members?.some((m) => ids.has(m)))
      f.data.members = f.data.members.filter((m) => !ids.has(m));
  if (target?.data.collapsed) target.data.members = [...new Set([...(target.data.members ?? []), ...ids])];
  content.nodes = applyHidden(content.nodes);
}

/**
 * Put cards into a section without overlapping what's there, and grow the section to fit.
 * "free": each card takes the first free spot (top-left first). "flow": the cards go in the given
 * order, left to right in rows, under what's already in the section.
 */
export function placeInFrame(content: BoardContent, frame: CardNode, cards: CardNode[], mode: 'free' | 'flow' = 'free') {
  const moving = new Set(cards.map((c) => c.id));
  for (const c of cards) if (c.type === 'frame') for (const d of descendants(content, c.id)) moving.add(d.id);
  const f = boxOf(frame);
  const x0 = f.x + PAD;
  const y0 = f.y + HEAD;
  const width = Math.max(f.w - PAD * 2, ...cards.map((c) => sizeOf(c).w));
  const taken = children(content, frame.id)
    .filter((n) => !moving.has(n.id))
    .map(boxOf);
  const bottom = () => (taken.length ? Math.max(...taken.map((b) => b.y + b.h)) + GAP : y0);

  if (mode === 'flow') {
    let x = x0;
    let y = bottom();
    let rowH = 0;
    for (const c of cards) {
      const { w, h } = sizeOf(c);
      if (x > x0 && x + w > x0 + width) {
        x = x0;
        y += rowH + GAP;
        rowH = 0;
      }
      moveTo(content, c, x, y);
      taken.push({ x, y, w, h });
      x += w + GAP;
      rowH = Math.max(rowH, h);
    }
  } else {
    const STEP = 16;
    for (const c of cards) {
      const { w, h } = sizeOf(c);
      let spot: { x: number; y: number } | null = null;
      const limit = bottom();
      for (let y = y0; y <= limit && !spot; y += STEP)
        for (let x = x0; x + w <= x0 + width && !spot; x += STEP)
          if (!taken.some((t) => overlaps({ x, y, w, h }, t))) spot = { x, y };
      spot ??= { x: x0, y: limit };
      moveTo(content, c, spot.x, spot.y);
      taken.push({ ...spot, w, h });
    }
  }
  growToFit(content, frame, cards);
  syncCollapsed(content, cards, frame);
}

/** Take cards out of their sections: they go to free space right of everything on the board. */
export function takeOut(content: BoardContent, cards: CardNode[]) {
  for (const c of cards) {
    const others = content.nodes.filter((n) => n !== c);
    const right = others.length ? Math.max(...others.map((n) => boxOf(n).x + boxOf(n).w)) : 0;
    const top = others.length ? Math.min(...others.map((n) => n.position.y)) : 0;
    moveTo(content, c, right + 160, top);
  }
  syncCollapsed(content, cards, null);
}

/** After a card was moved by hand (x / y), keep membership and section sizes consistent. */
export function afterManualMove(content: BoardContent, card: CardNode, section: CardNode | null) {
  if (section) {
    growToFit(content, section, [card]);
    syncCollapsed(content, [card], section);
  } else {
    // A hidden card dragged out of its collapsed section's area leaves it.
    const own = owners(content.nodes).get(card.id);
    const holder = content.nodes.find((f) => f.type === 'frame' && f.data.collapsed && f.data.members?.includes(card.id));
    if (holder && own !== holder.id) syncCollapsed(content, [card], null);
  }
}

// ---------- Arranging a whole section ----------

export const LAYOUTS = ['reference', 'grid'] as const;
export type Layout = (typeof LAYOUTS)[number];

const RIGHT_COLUMN = /^(3d|3d tricks|build)$/i;
const isRef = (n: CardNode) => /\breference|\brefs?\b/i.test(`${n.data.label ?? ''} ${n.data.title ?? ''}`);

/**
 * Lay out the cards of one section again (tight, no big gaps) and fit the section around them.
 * reference: videos then images in the top row · scenes in number order, wrapping · a right column
 * for notes labelled "3D", "3D tricks" or "Build" · the reference note, then the other notes ·
 * color cards in a bottom row.
 * grid: everything in reading order, left to right, wrapping.
 */
export function arrangeFrame(content: BoardContent, frame: CardNode, layout: Layout) {
  const kids = children(content, frame.id);
  if (!kids.length) return { moved: 0 };
  // Cards inside nested sections travel with them (moveTo); remember them before anything moves.
  const carried = kids.filter((k) => k.type === 'frame').flatMap((k) => descendants(content, k.id));
  const f = boxOf(frame);
  const x0 = f.x + PAD;
  const y0 = f.y + HEAD;
  const sizes = new Map(kids.map((k) => [k.id, sizeOf(k)]));
  const w = (n: CardNode) => sizes.get(n.id)!.w;
  const h = (n: CardNode) => sizes.get(n.id)!.h;
  const label = (n: CardNode) => (n.data.label ?? n.data.title ?? '').trim();
  const reading = (a: CardNode, b: CardNode) => a.position.y - b.position.y || a.position.x - b.position.x;

  // Rows that wrap at `limit` px; returns the bottom and the widest row.
  const flow = (list: CardNode[], x: number, y: number, limit: number) => {
    let cx = x;
    let rowH = 0;
    let top = y;
    let right = x;
    for (const n of list) {
      if (cx > x && cx + w(n) > x + limit) {
        cx = x;
        top += rowH + GAP;
        rowH = 0;
      }
      moveTo(content, n, cx, top);
      right = Math.max(right, cx + w(n));
      cx += w(n) + GAP;
      rowH = Math.max(rowH, h(n));
    }
    return { bottom: list.length ? top + rowH : y - GAP, right };
  };

  let right = x0;
  let bottom: number;
  if (layout === 'grid') {
    const limit = Math.max(f.w - PAD * 2, ...kids.map(w));
    const r = flow([...kids].sort(reading), x0, y0, limit);
    right = r.right;
    bottom = r.bottom;
  } else {
    const media = kids
      .filter((n) => n.type === 'video' || n.type === 'image')
      .sort((a, b) => (a.type === b.type ? reading(a, b) : a.type === 'video' ? -1 : 1));
    const scenes = kids
      .filter((n) => n.type === 'scene')
      .sort((a, b) => (a.data.number ?? 0) - (b.data.number ?? 0) || reading(a, b));
    const column = kids.filter((n) => n.type === 'note' && RIGHT_COLUMN.test(label(n))).sort(reading);
    const colors = kids.filter((n) => n.type === 'color').sort(reading);
    const used = new Set([...media, ...scenes, ...column, ...colors].map((n) => n.id));
    const rest = kids.filter((n) => !used.has(n.id)).sort((a, b) => Number(isRef(b)) - Number(isRef(a)) || reading(a, b));

    // The main area is as wide as a row of four scenes (or the widest card), the right column sits beside it.
    const sceneW = scenes.length ? w(scenes[0]) : SIZES.scene!.width;
    const main = Math.max(Math.min(4, Math.max(scenes.length, 1)) * (sceneW + GAP) - GAP, ...media.map(w), ...scenes.map(w));
    let y = y0;
    const top = flow(media, x0, y, main);
    if (media.length) y = top.bottom + GAP;
    const mid = flow(scenes, x0, y, main);
    if (scenes.length) y = mid.bottom + GAP;
    const mainRight = Math.max(top.right, mid.right, media.length || scenes.length ? x0 : x0);
    right = mainRight;
    let colBottom = y0 - GAP;
    if (column.length) {
      const cx = media.length || scenes.length ? mainRight + GAP : x0;
      let cy = y0;
      for (const n of column) {
        moveTo(content, n, cx, cy);
        cy += h(n) + GAP;
        right = Math.max(right, cx + w(n));
      }
      colBottom = cy - GAP;
    }
    y = Math.max(y, colBottom + GAP);
    const below = flow(rest, x0, y, Math.max(right - x0, ...rest.map(w)));
    if (rest.length) y = below.bottom + GAP;
    right = Math.max(right, below.right);
    const last = flow(colors, x0, y, Math.max(right - x0, ...colors.map(w)));
    right = Math.max(right, last.right);
    bottom = colors.length ? last.bottom : y - GAP;
  }
  // Fit the section snugly around its cards (it may shrink here: the cards were just laid out).
  resizeFrame(content, frame, Math.max(right - f.x + PAD, 240), Math.max(bottom - f.y + PAD, HEAD + PAD), [...kids, ...carried]);
  content.nodes = applyHidden(content.nodes);
  return { moved: kids.length };
}
