import { createContext, useContext } from 'react';
import { useStore } from '../store';
import { cardTags } from '../tags';
import type { CardNode } from '../types';
import { PLATFORMS } from '../types';

/** The node being rendered, so the shared card frame can show its schedule and tags. */
export const CardContext = createContext<CardNode | null>(null);
export const useCardNode = () => useContext(CardContext);

/** Publish date / platform and tag chips. */
export function CardMeta({ node, outside }: { node: CardNode; outside?: boolean }) {
  const tagFilter = useStore((s) => s.tagFilter);
  const data = node.data;
  const tags = cardTags(node);
  if (!data.publishDate && !data.platform && !tags.length) return null;
  const date = data.publishDate ? new Date(`${data.publishDate}T12:00:00`) : null;
  return (
    <div className={`card-meta ${outside ? 'outside' : ''}`}>
      {(date || data.platform) && (
        <span className="meta-chip" style={{ '--c': PLATFORMS[data.platform ?? ''] ?? 'var(--text-3)' } as React.CSSProperties}>
          {date && date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {date && data.platform && ' · '}
          {data.platform}
        </span>
      )}
      {tags.slice(0, 4).map((t) => (
        <span key={t} className={`tag-chip ${tagFilter === t ? 'on' : ''}`}>
          #{t}
        </span>
      ))}
    </div>
  );
}
