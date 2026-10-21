// Collapsible sections. A collapsed section shrinks to a compact bar and hides the cards that were
// inside it; the frame remembers which cards those were (`members`) and its open size (`openSize`),
// so it unfolds exactly as it was. Plain functions with no browser APIs: the server uses them too.

import { SIZES } from './cards';
import type { CardData, CardNode, CardType } from './types';

export const COLLAPSED_HEIGHT = 84;
export const COLLAPSED_MAX_WIDTH = 400;

export type SectionLook = 'tint' | 'solid' | 'outline' | 'dashed';
export const SECTION_LOOKS: { id: SectionLook; label: string }[] = [
  { id: 'tint', label: 'Tint' },
  { id: 'solid', label: 'Solid' },
  { id: 'outline', label: 'Outline' },
  { id: 'dashed', label: 'Dashed' },
];

const sizeOf = (n: CardNode) => ({
  w: n.measured?.width ?? n.width ?? SIZES[n.type as CardType]?.width ?? 200,
  h: n.measured?.height ?? n.height ?? SIZES[n.type as CardType]?.height ?? 120,
});

/** The section's area when open (also while it is collapsed). */
export function openBox(frame: CardNode) {
  const open = frame.data.collapsed ? frame.data.openSize : undefined;
  const { w, h } = open ? { w: open.width, h: open.height } : sizeOf(frame);
  return { x: frame.position.x, y: frame.position.y, w, h };
}

/** Cards whose center lies inside the open section (sections inside it included). */
export function sectionMembers(frame: CardNode, nodes: CardNode[]): string[] {
  const box = openBox(frame);
  return nodes
    .filter((n) => n.id !== frame.id)
    .filter((n) => {
      const { w, h } = n.type === 'frame' ? openBox(n) : sizeOf(n);
      const cx = n.position.x + w / 2;
      const cy = n.position.y + h / 2;
      return cx >= box.x && cx <= box.x + box.w && cy >= box.y && cy <= box.y + box.h;
    })
    .map((n) => n.id);
}

/** Every card inside the given sections, folded ones and sections within sections included. */
export function sectionContents(nodes: CardNode[], frameIds: string[]): Set<string> {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const found = new Set<string>();
  const queue = [...frameIds];
  for (let id = queue.pop(); id; id = queue.pop()) {
    const f = byId.get(id);
    if (!f || f.type !== 'frame') continue;
    const inner = f.data.collapsed ? (f.data.members ?? []) : sectionMembers(f, nodes);
    for (const m of inner)
      if (byId.has(m) && !found.has(m) && !frameIds.includes(m)) {
        found.add(m);
        queue.push(m);
      }
  }
  return found;
}

/**
 * A card is hidden exactly when a collapsed section that still exists holds it. Run after anything
 * that collapses, expands or deletes sections, so no card is ever left hidden without a way back.
 */
export function applyHidden(nodes: CardNode[]): CardNode[] {
  const ids = new Set(nodes.map((n) => n.id));
  const hidden = new Set<string>();
  for (const f of nodes)
    if (f.type === 'frame' && f.data.collapsed) for (const m of f.data.members ?? []) if (ids.has(m) && m !== f.id) hidden.add(m);
  return nodes.map((n) => {
    const h = hidden.has(n.id);
    if (!!n.hidden === h) return n;
    return h ? { ...n, hidden: true, selected: false } : { ...n, hidden: false };
  });
}

const frameData = (d: CardData, patch: Partial<CardData>): CardData => {
  const next = { ...d, ...patch };
  for (const k of Object.keys(next)) if (next[k] === undefined) delete next[k];
  return next;
};

/** Collapse a section (the cards are hidden by `applyHidden`). */
export function collapseFrame(nodes: CardNode[], frameId: string): CardNode[] {
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame || frame.type !== 'frame' || frame.data.collapsed) return nodes;
  const { w, h } = sizeOf(frame);
  const members = sectionMembers(frame, nodes);
  return nodes.map((n) =>
    n.id === frameId
      ? {
          ...n,
          width: Math.min(w, COLLAPSED_MAX_WIDTH),
          height: COLLAPSED_HEIGHT,
          zIndex: 1,
          data: frameData(n.data, { collapsed: true, members, openSize: { width: w, height: h } }),
        }
      : members.includes(n.id) && n.selected
        ? { ...n, selected: false }
        : n,
  );
}

/** Open a collapsed section to its previous size. */
export function expandFrame(nodes: CardNode[], frameId: string): CardNode[] {
  const frame = nodes.find((n) => n.id === frameId);
  if (!frame || !frame.data.collapsed) return nodes;
  const open = frame.data.openSize ?? { width: SIZES.frame!.width, height: SIZES.frame!.height ?? 380 };
  return nodes.map((n) =>
    n.id === frameId
      ? {
          ...n,
          width: open.width,
          height: open.height,
          zIndex: -1,
          data: frameData(n.data, { collapsed: undefined, members: undefined, openSize: undefined }),
        }
      : n,
  );
}

/** Collapsed sections that hold a card, outermost first (the order to open them in). */
export function sectionsHolding(nodes: CardNode[], cardId: string): string[] {
  const area = (f: CardNode) => openBox(f).w * openBox(f).h;
  return nodes
    .filter((f) => f.type === 'frame' && f.data.collapsed && f.data.members?.includes(cardId))
    .sort((a, b) => area(b) - area(a))
    .map((f) => f.id);
}

/** Short summary of a section's cards, e.g. "6 scenes · 2 notes". */
export function memberSummary(nodes: CardNode[]): string {
  const names: Partial<Record<CardType, [string, string]>> = {
    scene: ['scene', 'scenes'],
    note: ['note', 'notes'],
    todo: ['list', 'lists'],
    heading: ['heading', 'headings'],
    image: ['image', 'images'],
    video: ['video', 'videos'],
    link: ['link', 'links'],
    project: ['job', 'jobs'],
    color: ['color', 'colors'],
    board: ['board', 'boards'],
    frame: ['section', 'sections'],
  };
  const counts = new Map<CardType, number>();
  for (const n of nodes) counts.set(n.type as CardType, (counts.get(n.type as CardType) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([t, c]) => `${c} ${names[t]?.[c === 1 ? 0 : 1] ?? t}`)
    .join(' · ');
}
