import { del, get, keys, set } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import { cloudConfigured, mediaPublicUrl } from './cloud';
import { embedUrl } from './share/embed';
import type { BoardContent, BoardMeta } from './types';

// The browser's IndexedDB is the primary store (works offline): board index, board
// contents and media blobs. The cloud sync listens to `dbEvents` and mirrors changes.

export const dbEvents = new EventTarget();
const emit = (type: string, id?: string) => dbEvents.dispatchEvent(new CustomEvent(type, { detail: id }));

export const loadIndex = async () => (await get<BoardMeta[]>('boards')) ?? [];
export const saveIndex = async (boards: BoardMeta[], silent = false) => {
  await set('boards', boards);
  if (!silent) emit('index');
};

export const loadBoard = async (id: string): Promise<BoardContent> =>
  (await get<BoardContent>(`board:${id}`)) ?? { nodes: [], edges: [] };
export const hasBoard = async (id: string) => (await get(`board:${id}`)) !== undefined;
export const saveBoard = (id: string, content: BoardContent) => set(`board:${id}`, content);
export const deleteBoard = async (id: string, silent = false) => {
  await del(`board:${id}`);
  if (!silent) emit('delete', id);
};

export async function saveMedia(file: Blob): Promise<string> {
  const id = nanoid(21);
  await set(`media:${id}`, file);
  emit('media', id);
  return id;
}

export const getMediaBlob = (id: string) => get<Blob>(`media:${id}`);
export const mediaKeys = async () =>
  (await keys())
    .map(String)
    .filter((k) => k.startsWith('media:'))
    .map((k) => k.slice(6));

const urlCache = new Map<string, string>();

export async function getMediaUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await get<Blob>(`media:${id}`);
  // Not on this device (added elsewhere or in a shared board): use the cloud copy.
  if (!blob) return cloudConfigured ? mediaPublicUrl(id) : null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function useMediaUrl(mediaId?: string, url?: string) {
  const [src, setSrc] = useState<string | null>(url ?? (mediaId ? (urlCache.get(mediaId) ?? null) : null));
  useEffect(() => {
    if (url) return setSrc(url);
    if (!mediaId) return setSrc(null);
    let alive = true;
    getMediaUrl(mediaId).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [mediaId, url]);
  return src;
}

// ---------- Image previews ----------
// Cards show a downscaled copy of each photo. A 12-megapixel phone photo takes ~48 MB of memory
// once decoded; a few of those on a board are enough for a phone's browser to crash while panning.

const PREVIEW_MAX = 1400;
const previewCache = new Map<string, string>();
const previewJobs = new Map<string, Promise<string | null>>();
let previewQueue: Promise<unknown> = Promise.resolve();

async function downscale(blob: Blob): Promise<Blob | null> {
  if (!blob.type.startsWith('image/') || /gif|svg/.test(blob.type) || blob.size < 350_000) return null;
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    const scale = Math.min(1, PREVIEW_MAX / Math.max(img.naturalWidth, img.naturalHeight));
    if (scale === 1 && blob.size < 1_500_000) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const type = blob.type === 'image/png' || blob.type === 'image/webp' ? 'image/png' : 'image/jpeg';
    const out = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, 0.85));
    canvas.width = canvas.height = 0; // free the bitmap right away (Safari keeps it otherwise)
    return out && out.size < blob.size ? out : null;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function makePreview(id: string): Promise<string | null> {
  const saved = await get<Blob | 'original'>(`thumb:${id}`);
  if (saved === 'original') return getMediaUrl(id);
  if (saved instanceof Blob) return URL.createObjectURL(saved);
  let blob = await get<Blob>(`media:${id}`);
  if (!blob && cloudConfigured) {
    const res = await fetch(mediaPublicUrl(id)).catch(() => null);
    if (res?.ok) blob = await res.blob();
  }
  if (!blob) return getMediaUrl(id);
  // One at a time, so several big photos are never decoded at once.
  const job = previewQueue.then(() => downscale(blob!));
  previewQueue = job;
  const small = await job;
  await set(`thumb:${id}`, small ?? 'original').catch(() => {});
  return small ? URL.createObjectURL(small) : getMediaUrl(id);
}

/** URL of a light copy of an image, for showing it on a card (the original is used full screen). */
export async function getPreviewUrl(id: string): Promise<string | null> {
  const cached = previewCache.get(id);
  if (cached) return cached;
  let job = previewJobs.get(id);
  if (!job) {
    job = makePreview(id).then((u) => {
      if (u) previewCache.set(id, u);
      previewJobs.delete(id);
      return u;
    });
    previewJobs.set(id, job);
  }
  return job;
}

export function usePreviewUrl(mediaId?: string, url?: string) {
  const [src, setSrc] = useState<string | null>(url ?? (mediaId ? (previewCache.get(mediaId) ?? null) : null));
  useEffect(() => {
    if (url) return setSrc(url);
    if (!mediaId) return setSrc(null);
    let alive = true;
    getPreviewUrl(mediaId).then((u) => alive && setSrc(u));
    return () => {
      alive = false;
    };
  }, [mediaId, url]);
  return src;
}

const blobToDataUrl = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });

export async function exportWorkspace(): Promise<Blob> {
  const all = await keys();
  const data: Record<string, unknown> = {};
  for (const k of all) {
    const key = String(k);
    if (key.startsWith('thumb:')) continue; // rebuilt on demand
    const value = await get(key);
    data[key] = value instanceof Blob ? { __blob: await blobToDataUrl(value) } : value;
  }
  return new Blob([JSON.stringify({ app: 'notebase', version: 1, data })], { type: 'application/json' });
}

export async function importWorkspace(file: File) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'notebase') throw new Error('Not a Notebase backup file');
  for (const [key, value] of Object.entries<any>(parsed.data)) {
    if (value && typeof value === 'object' && '__blob' in value) {
      await set(key, await (await fetch(value.__blob)).blob());
    } else {
      await set(key, value);
    }
  }
}

// --- URL helpers ---

export { embedUrl, youtubeId } from './share/embed';

export const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(url);
export const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || !!embedUrl(url);

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
