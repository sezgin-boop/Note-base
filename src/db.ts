import { del, get, keys, set } from 'idb-keyval';
import { nanoid } from 'nanoid';
import { useEffect, useState } from 'react';
import type { BoardContent, BoardMeta } from './types';

// Everything lives in the browser's IndexedDB: board index, board contents and media blobs.

export const loadIndex = async () => (await get<BoardMeta[]>('boards')) ?? [];
export const saveIndex = (boards: BoardMeta[]) => set('boards', boards);

export const loadBoard = async (id: string): Promise<BoardContent> =>
  (await get<BoardContent>(`board:${id}`)) ?? { nodes: [], edges: [] };
export const saveBoard = (id: string, content: BoardContent) => set(`board:${id}`, content);
export const deleteBoard = (id: string) => del(`board:${id}`);

export async function saveMedia(file: Blob): Promise<string> {
  const id = nanoid(12);
  await set(`media:${id}`, file);
  return id;
}

const urlCache = new Map<string, string>();

export async function getMediaUrl(id: string): Promise<string | null> {
  const cached = urlCache.get(id);
  if (cached) return cached;
  const blob = await get<Blob>(`media:${id}`);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(id, url);
  return url;
}

export function useMediaUrl(mediaId?: string, url?: string) {
  const [src, setSrc] = useState<string | null>(url ?? (mediaId ? urlCache.get(mediaId) ?? null : null));
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
    const value = await get(key);
    data[key] = value instanceof Blob ? { __blob: await blobToDataUrl(value) } : value;
  }
  return new Blob([JSON.stringify({ app: 'notebase', version: 1, data })], { type: 'application/json' });
}

export async function importWorkspace(file: File) {
  const parsed = JSON.parse(await file.text());
  if (parsed?.app !== 'notebase') throw new Error('Geçersiz dosya');
  for (const [key, value] of Object.entries<any>(parsed.data)) {
    if (value && typeof value === 'object' && '__blob' in value) {
      await set(key, await (await fetch(value.__blob)).blob());
    } else {
      await set(key, value);
    }
  }
}

// --- URL helpers ---

export function youtubeId(url: string): string | null {
  const m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/)|youtu\.be\/)([\w-]{11})/);
  return m ? m[1] : null;
}

export function embedUrl(url: string): string | null {
  const yt = youtubeId(url);
  if (yt) return `https://www.youtube.com/embed/${yt}`;
  const vimeo = url.match(/vimeo\.com\/(\d+)/);
  if (vimeo) return `https://player.vimeo.com/video/${vimeo[1]}`;
  return null;
}

export const isImageUrl = (url: string) => /\.(png|jpe?g|gif|webp|avif|svg)(\?.*)?$/i.test(url);
export const isVideoUrl = (url: string) => /\.(mp4|webm|mov|m4v)(\?.*)?$/i.test(url) || !!embedUrl(url);

export function hostname(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}
