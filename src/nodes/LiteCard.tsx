import { estimateHeight } from '../ai/importer';
import { SIZES } from '../cards';
import { usePreviewUrl, youtubeId } from '../db';
import type { CardNode, CardType } from '../types';
import { Handles } from './Shell';

/** Zoomed out this far on a big board, cards are drawn as light placeholders (text is unreadable anyway). */
export const LITE_ZOOM = 0.32;
/** Cards that get a light version (headings, sections and drawings are cheap enough as they are). */
export const LITE_TYPES = new Set<CardType>(['note', 'todo', 'scene', 'image', 'video', 'link', 'project', 'color', 'board']);

const ICONS: Partial<Record<CardType, string>> = {
  note: '📝',
  todo: '✅',
  scene: '🎞️',
  image: '🖼️',
  video: '🎬',
  link: '🔗',
  project: '💼',
  color: '🎨',
  board: '📁',
};

/**
 * A card drawn cheaply: its title, picture or color, at exactly the size the full card had, with
 * the connection points so arrows stay attached. Hundreds of these zoom and pan smoothly.
 */
export function LiteCard({ node, bare }: { node: CardNode; bare?: boolean }) {
  const d = node.data;
  const t = node.type as CardType;
  const { w, h } = liteSize(node);
  const yt = !bare && t === 'video' && d.url ? youtubeId(d.url) : null;
  const preview = usePreviewUrl(
    !bare && (t === 'image' || t === 'scene') ? d.mediaId : undefined,
    !bare && t === 'image' ? d.url : undefined,
  );
  const picture = yt ? `https://i.ytimg.com/vi/${yt}/mqdefault.jpg` : preview;
  const title =
    t === 'scene'
      ? `${d.label || `Scene ${String(d.number ?? 1).padStart(2, '0')}`}${d.title ? ` · ${d.title}` : ''}`
      : t === 'color'
        ? (d.title ?? d.hex)
        : d.title || d.label || d.caption || d.text?.split('\n')[0]?.replace(/[#*=~_>[\]]/g, '') || d.url || '';
  return (
    <div
      className={`card-lite lite-${t}`}
      style={
        {
          width: w,
          height: h,
          ...(t === 'color' && d.hex ? { background: d.hex } : {}),
          ...(d.color ? { '--accent': d.color } : {}),
        } as React.CSSProperties
      }
    >
      {picture && <img src={picture} alt="" draggable={false} decoding="async" loading="lazy" />}
      {title && (
        <b>
          <span aria-hidden>{ICONS[t]}</span> {String(title).slice(0, 80)}
        </b>
      )}
      <Handles />
    </div>
  );
}

/** The size a card takes (as last measured, else its set size, else an estimate). */
export function liteSize(node: CardNode) {
  const t = node.type as CardType;
  return {
    w: node.measured?.width ?? node.width ?? SIZES[t]?.width ?? 260,
    h: node.measured?.height ?? node.height ?? SIZES[t]?.height ?? estimateHeight(t, node.data),
  };
}
