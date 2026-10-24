// Dropping a picture onto a card's picture slot (a scene's "Add frame", an empty image card) fills
// that slot instead of making a new card. Slots carry data-drop-target="<card id>" and
// data-drop-kind="image" | "video".

let hovered: HTMLElement | null = null;

/** The picture slot under a screen point (ignoring the card being dragged). */
export function dropTargetAt(x: number, y: number, skipId?: string): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const slot = (el as HTMLElement).closest?.('[data-drop-target]') as HTMLElement | null;
    if (slot && slot.dataset.dropTarget !== skipId && !slot.closest('.scene-thumb-fold.off')) return slot;
  }
  return null;
}

/** Light up the slot a drop would go into (null clears it). */
export function highlightSlot(el: HTMLElement | null) {
  if (hovered === el) return;
  hovered?.classList.remove('drop-hover');
  hovered = el;
  el?.classList.add('drop-hover');
}

/** A little "settled in" bounce on the slot that just got its picture. */
export function settleSlot(cardId: string) {
  setTimeout(() => {
    const el =
      document.querySelector<HTMLElement>(`[data-drop-target="${cardId}"]`) ??
      document.querySelector(`[data-id="${cardId}"] .scene-thumb`);
    if (!el) return;
    el.classList.remove('drop-pop');
    void el.offsetWidth;
    el.classList.add('drop-pop');
    setTimeout(() => el.classList.remove('drop-pop'), 700);
  }, 30);
}

export const pointOf = (e: MouseEvent | TouchEvent | React.MouseEvent) => {
  const t = 'changedTouches' in e ? e.changedTouches[0] : null;
  return t ? { x: t.clientX, y: t.clientY } : { x: (e as MouseEvent).clientX, y: (e as MouseEvent).clientY };
};

export const BOARD_DRAG = 'application/notebase-board';

/** The board card under a screen point (not the one being dragged), which a board can be put into. */
export function boardCardAt(x: number, y: number, skipId?: string): HTMLElement | null {
  for (const el of document.elementsFromPoint(x, y)) {
    const card = (el as HTMLElement).closest?.('.react-flow__node-board') as HTMLElement | null;
    if (card && card.dataset.id !== skipId) return card;
  }
  return null;
}
