import type { CardNode } from './types';

const HASHTAG = /#([\p{L}\p{N}_-]+)/gu;

/** Tags of a card: the ones set explicitly plus any #hashtags written in its text. */
export function cardTags(n: CardNode): string[] {
  const d = n.data;
  const text = [d.title, d.text, d.caption, ...(d.items ?? []).map((i) => i.text)].filter(Boolean).join(' ');
  const found = [...text.matchAll(HASHTAG)].map((m) => m[1].toLocaleLowerCase());
  return [...new Set([...(d.tags ?? []).map((t) => t.toLocaleLowerCase()), ...found])];
}

/** All tags on a board, most used first. */
export function boardTags(nodes: CardNode[]): { tag: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const n of nodes) for (const t of cardTags(n)) counts.set(t, (counts.get(t) ?? 0) + 1);
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/** "broll, #Hook  client-a" → ["broll", "hook", "client-a"] */
export const parseTags = (s: string) => [
  ...new Set(
    s
      .split(/[\s,]+/)
      .map((t) => t.replace(/^#/, '').trim().toLocaleLowerCase())
      .filter(Boolean),
  ),
];
