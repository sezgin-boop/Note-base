import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { galleryOf } from '../gallery';
import type { CardData } from '../types';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * The photos of an image card / scene frame and which one is showing. Newly added photos come
 * into view; ← / → flip through them while the card is selected.
 */
export function useGallery(data: CardData, selected?: boolean) {
  const { mediaId, url, caption, more } = data;
  const list = useMemo(() => galleryOf({ mediaId, url, caption, more }), [mediaId, url, caption, more]);
  const [state, setState] = useState({ index: 0, dir: 0 });
  const count = list.length;
  const index = Math.min(state.index, Math.max(0, count - 1));
  const go = (step: number) => setState({ index: (index + step + count) % count, dir: step });

  const seen = useRef(count);
  useEffect(() => {
    if (count > seen.current) setState({ index: seen.current, dir: 1 });
    seen.current = count;
  }, [count]);

  const goRef = useRef(go);
  goRef.current = go;
  useEffect(() => {
    if (!selected || count < 2) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') || e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      // Captured before React Flow, which would otherwise nudge the selected card.
      e.preventDefault();
      e.stopPropagation();
      goRef.current(e.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [selected, count]);

  return { list, count, index, current: list[index], dir: state.dir, go };
}

/** Arrows on the sides of a photo and a dot (or 2 / 7) indicator at the bottom. */
export function GalleryNav({ count, index, go }: { count: number; index: number; go: (step: number) => void }) {
  if (count < 2) return null;
  const btn = (step: number) => (
    <button
      className={`gal-arrow ${step < 0 ? 'prev' : 'next'} nodrag allow`}
      title={step < 0 ? 'Previous photo (←)' : 'Next photo (→)'}
      onClick={(e) => (e.stopPropagation(), go(step))}
      onDoubleClick={(e) => e.stopPropagation()}
    >
      {step < 0 ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
    </button>
  );
  return (
    <>
      {btn(-1)}
      {btn(1)}
      <span className="gal-count" aria-label={`Photo ${index + 1} of ${count}`}>
        {count <= 8
          ? Array.from({ length: count }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)
          : `${index + 1} / ${count}`}
      </span>
    </>
  );
}
