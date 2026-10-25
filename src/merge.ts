import type { BoardContent, BoardMeta, CardEdge, CardNode } from './types';

/*
 * Three-way merge of a board edited on two devices. `base` is the version both last agreed on
 * (what this device last uploaded or downloaded); `local` and `remote` are the two edited copies.
 * Each card and arrow is merged on its own, and inside a card each field: whatever one side
 * changed since the base wins, so a note written on the phone and a card moved on the computer
 * both survive. Only when both sides changed the very same field does this device's edit win.
 */

type Item = CardNode | CardEdge;

/** Fields that only describe this device's view (selection, measured size), never edits. */
const VIEW_ONLY = new Set(['selected', 'dragging', 'resizing', 'measured']);

/** JSON with object keys sorted, so the same card compares equal whatever order its fields are in. */
const stable = (v: unknown): string =>
  Array.isArray(v)
    ? `[${v.map(stable).join(',')}]`
    : v && typeof v === 'object'
      ? `{${Object.keys(v)
          .filter((k) => (v as Record<string, unknown>)[k] !== undefined)
          .sort()
          .map((k) => `${JSON.stringify(k)}:${stable((v as Record<string, unknown>)[k])}`)
          .join(',')}}`
      : JSON.stringify(v ?? null);
const same = (a: unknown, b: unknown) => stable(a) === stable(b);
const clean = <T extends Item>(x: T): T => {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(x)) if (!VIEW_ONLY.has(k) && v !== undefined) out[k] = v;
  return out as T;
};

/** Field-by-field: take what each side changed; on a true clash keep the local value. */
function mergeFields<T extends Record<string, unknown>>(base: T | undefined, local: T, remote: T): T {
  const out: Record<string, unknown> = {};
  for (const k of new Set([...Object.keys(local), ...Object.keys(remote)])) {
    const b = base?.[k];
    const l = local[k];
    const r = remote[k];
    let v: unknown;
    if (same(l, r)) v = l;
    else if (base && same(l, b)) v = r;
    else if (base && same(r, b)) v = l;
    else if (k === 'data' && l && r && typeof l === 'object' && typeof r === 'object')
      v = mergeFields(b as Record<string, unknown> | undefined, l as Record<string, unknown>, r as Record<string, unknown>);
    else v = l === undefined ? r : l;
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

function mergeList<T extends Item>(base: T[] | undefined, local: T[], remote: T[]): T[] {
  const b = new Map((base ?? []).map((x) => [x.id, clean(x)]));
  const l = new Map(local.map((x) => [x.id, clean(x)]));
  const r = new Map(remote.map((x) => [x.id, clean(x)]));
  // Remote order first (it is what other devices see), then cards only this device has.
  const ids = [...r.keys(), ...[...l.keys()].filter((id) => !r.has(id))];
  const out: T[] = [];
  for (const id of ids) {
    const bi = b.get(id);
    const li = l.get(id);
    const ri = r.get(id);
    if (li && ri) out.push(mergeFields(bi as Record<string, unknown> | undefined, li as never, ri as never) as T);
    else if (li) {
      // Gone remotely: deleted there unless this device changed it since.
      if (!bi || !same(li, bi)) out.push(li);
    } else if (ri) {
      // Gone here: deleted on this device unless the other one changed it since.
      if (!bi || !same(ri, bi)) out.push(ri);
    }
  }
  return out;
}

export function mergeBoards(base: BoardContent | null | undefined, local: BoardContent, remote: BoardContent): BoardContent {
  const nodes = mergeList(base?.nodes, local.nodes, remote.nodes);
  const ids = new Set(nodes.map((n) => n.id));
  // An arrow needs both of its cards.
  const edges = mergeList(base?.edges, local.edges, remote.edges).filter((e) => ids.has(e.source) && ids.has(e.target));
  return { nodes, edges, ...(local.viewport ? { viewport: local.viewport } : {}) };
}

const META_FIELDS = ['name', 'icon', 'parentId', 'shareId', 'shareComments', 'inbox'] as const;

/** Board name, icon, parent…: the same field-by-field rule. */
export function mergeMeta(base: BoardMeta | null | undefined, local: BoardMeta, remote: BoardMeta): BoardMeta {
  const pick = <T>(o: T) => Object.fromEntries(META_FIELDS.map((k) => [k, (o as Record<string, unknown>)[k] ?? null]));
  const merged = mergeFields(base ? pick(base) : undefined, pick(local), pick(remote));
  // Unset optional flags stay as this device has them.
  const set = Object.entries(merged).filter(([k, v]) => v !== null || k === 'parentId' || k === 'shareId');
  return { ...local, ...Object.fromEntries(set) } as BoardMeta;
}

/** Whether two board contents hold the same cards and arrows (view-only fields aside). */
export const sameContent = (a: BoardContent, b: BoardContent) =>
  same(a.nodes.map(clean), b.nodes.map(clean)) && same(a.edges.map(clean), b.edges.map(clean));
