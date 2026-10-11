// An image card or a scene frame can hold several photos, flipped through with arrows. The first
// photo stays in mediaId / url / caption (what older boards, share links and Claude read); the
// others are in `more`.

import type { CardData, MediaRef } from './types';

const has = (m: MediaRef) => !!(m.mediaId || m.url);

/** Every photo of a card, in order. */
export function galleryOf(d: CardData): MediaRef[] {
  const first: MediaRef = { mediaId: d.mediaId, url: d.url, caption: d.caption };
  return [...(has(first) ? [first] : []), ...(d.more ?? []).filter(has)];
}

/** The data fields that store `list` as the card's photos (the card's caption is left alone). */
export function galleryData(list: MediaRef[]): Partial<CardData> {
  const [first, ...rest] = list.filter(has);
  return {
    mediaId: first?.mediaId,
    url: first?.mediaId ? undefined : first?.url,
    more: rest.length
      ? rest.map(({ mediaId, url, caption }) => clean({ mediaId, url: mediaId ? undefined : url, caption }))
      : undefined,
  };
}

/** Add photos after the ones a card already has (an empty card takes the first one's name as caption). */
export function appendPhotos(d: CardData, add: MediaRef[]): Partial<CardData> {
  const patch = galleryData([...galleryOf(d), ...add]);
  return !d.caption && add[0]?.caption ? { ...patch, caption: add[0].caption } : patch;
}

/** Take one photo out (by position). */
export const removePhoto = (d: CardData, index: number) => galleryData(galleryOf(d).filter((_, i) => i !== index));

/** Drop undefined keys so the stored card stays clean. */
export function clean<T extends object>(o: T): T {
  for (const k of Object.keys(o) as (keyof T)[]) if (o[k] === undefined) delete o[k];
  return o;
}
