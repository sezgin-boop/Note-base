// Turning a URL into a card: images and video files are copied into Notebase's storage,
// YouTube / Vimeo stay links to their players, and web pages become link cards.

import { nanoid } from 'nanoid';
import { embedUrl } from '../src/share/embed';
import { uploadMedia } from './db';

const MAX_IMAGE = 20 * 1024 * 1024;
// Supabase's free plan accepts files up to 50 MB.
const MAX_VIDEO = 50 * 1024 * 1024;

export type Fetched =
  | { kind: 'image'; mediaId: string; aspect: number | null; title?: string }
  | { kind: 'video'; mediaId: string; title?: string }
  | { kind: 'embed'; url: string }
  | { kind: 'link'; url: string; title?: string };

function checkUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`Not a valid link: ${raw}`);
  }
  if (!/^https?:$/.test(url.protocol)) throw new Error(`Only http(s) links are supported: ${raw}`);
  const h = url.hostname;
  if (
    /^(localhost|0\.0\.0\.0|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.|\[?::1\]?$|\[?f[cd])/i.test(h) ||
    h.endsWith('.internal')
  )
    throw new Error(`That address isn't reachable from the internet: ${raw}`);
  return url;
}

const fileName = (url: URL) => decodeURIComponent(url.pathname.split('/').pop() ?? '').replace(/\.[a-z0-9]+$/i, '') || undefined;

/** Width / height from the first bytes of a PNG, GIF, WebP or JPEG. */
export function imageAspect(b: Uint8Array): number | null {
  const u16 = (i: number, le = false) => (le ? b[i] | (b[i + 1] << 8) : (b[i] << 8) | b[i + 1]);
  const u32 = (i: number) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0;
  let w = 0;
  let h = 0;
  if (b[0] === 0x89 && b[1] === 0x50) [w, h] = [u32(16), u32(20)];
  else if (b[0] === 0x47 && b[1] === 0x49) [w, h] = [u16(6, true), u16(8, true)];
  else if (b[8] === 0x57 && b[9] === 0x45 && b[12] === 0x56) {
    const chunk = String.fromCharCode(b[12], b[13], b[14], b[15]);
    if (chunk === 'VP8X') [w, h] = [1 + (b[24] | (b[25] << 8) | (b[26] << 16)), 1 + (b[27] | (b[28] << 8) | (b[29] << 16))];
    else if (chunk === 'VP8 ') [w, h] = [u16(26, true) & 0x3fff, u16(28, true) & 0x3fff];
    else if (chunk === 'VP8L') {
      const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
      [w, h] = [(bits & 0x3fff) + 1, ((bits >> 14) & 0x3fff) + 1];
    }
  } else if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) return null;
      const marker = b[i + 1];
      const len = u16(i + 2);
      // Start-of-frame markers carry the size (C0–CF except C4, C8, CC).
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        [h, w] = [u16(i + 5), u16(i + 7)];
        break;
      }
      i += 2 + len;
    }
  }
  return w > 0 && h > 0 ? w / h : null;
}

const pageTitle = (html: string) => {
  const og = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)?.[1];
  const title = og ?? html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
  return title
    ?.replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim()
    .slice(0, 200);
};

export async function fetchMedia(raw: string): Promise<Fetched> {
  const url = checkUrl(raw.trim());
  if (embedUrl(url.href)) return { kind: 'embed', url: url.href };

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(new Error('timed out')), 45000);
  const res = await fetch(url.href, {
    redirect: 'follow',
    headers: {
      'user-agent':
        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36 Notebase/1.0',
      accept: '*/*',
    },
    signal: abort.signal,
  })
    .catch((e) => {
      throw new Error(`Couldn't download ${url.href} (${(e as Error).message})`);
    })
    .finally(() => clearTimeout(timer));
  if (!res.ok) throw new Error(`Couldn't download ${url.href} (HTTP ${res.status})`);
  const type = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  const size = Number(res.headers.get('content-length') ?? 0);

  if (type.startsWith('image/')) {
    if (size > MAX_IMAGE) throw new Error(`Image is too large (${Math.round(size / 1e6)} MB, max 20 MB): ${url.href}`);
    const data = await res.arrayBuffer();
    if (data.byteLength > MAX_IMAGE) throw new Error(`Image is too large (max 20 MB): ${url.href}`);
    const mediaId = nanoid(21);
    await uploadMedia(mediaId, data, type);
    return {
      kind: 'image',
      mediaId,
      aspect: imageAspect(new Uint8Array(data, 0, Math.min(data.byteLength, 65536))),
      title: fileName(url),
    };
  }
  if (type.startsWith('video/')) {
    if (size > MAX_VIDEO) throw new Error(`Video is too large (${Math.round(size / 1e6)} MB, max 50 MB): ${url.href}`);
    const data = await res.arrayBuffer();
    if (data.byteLength > MAX_VIDEO) throw new Error(`Video is too large (max 50 MB): ${url.href}`);
    const mediaId = nanoid(21);
    await uploadMedia(mediaId, data, type);
    return { kind: 'video', mediaId, title: fileName(url) };
  }
  // Anything else (usually a web page) becomes a link card; read just enough for its title.
  let title: string | undefined;
  if (type.includes('html') && res.body) {
    const reader = res.body.getReader();
    let html = '';
    const dec = new TextDecoder();
    while (html.length < 200_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += dec.decode(value, { stream: true });
      if (/<\/head>/i.test(html)) break;
    }
    reader.cancel().catch(() => {});
    title = pageTitle(html);
  } else res.body?.cancel().catch(() => {});
  return { kind: 'link', url: url.href, title };
}
