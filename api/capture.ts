// "Save to Notebase" from a phone's share sheet (an iOS Shortcut, or any app that can send a web
// request), with a personal link made in the app:
//   POST /api/capture?step=link              → the user's link (Authorization: Bearer <app session>);
//                                               {"renew": true} makes a new one and switches the old off
//   POST /api/capture?k=<link key>           → saves what's sent into the Inbox: a form (any fields;
//                                               files become image / video cards), JSON {text, url,
//                                               title}, plain text, or a photo / video as the body
// Links become link cards (videos: video cards, pictures: image cards), other text becomes a note.

import { nanoid } from 'nanoid';
import { makeCard } from '../src/cards';
import type { CardNode } from '../src/types';
import { connectorReady, originOf } from '../server/env';
import { adminUser, changeBoard, insertBoard, listBoards, setAppMetadata, uploadMedia, userFromSession } from '../server/db';
import { imageAspect } from '../server/media';
import { seal, unseal } from '../server/seal';
import { MAX_DIRECT, uploadKind } from '../server/uploads';

export const config = { runtime: 'edge' };

const text = (body: string, status = 200) =>
  new Response(body, { status, headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' } });
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

export default async function handler(req: Request): Promise<Response> {
  if (!connectorReady()) return text('Saving from the phone is not set up on this site.', 503);
  const url = new URL(req.url);
  if (req.method !== 'POST') return text('Send things here with POST (see "Save from your phone" in Notebase).', 405);

  if (url.searchParams.get('step') === 'link') {
    const session = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
    const user = session ? await userFromSession(session) : null;
    if (!user) return json({ error: 'Sign in to Notebase cloud first.' }, 401);
    const { renew } = (await req.json().catch(() => ({}))) as { renew?: boolean };
    let v = Number(user.app_metadata?.capture_v) || 0;
    if (renew || !v) {
      v += 1;
      await setAppMetadata(user.id, { capture_v: v });
    }
    return json({ url: `${originOf(req)}/api/capture?k=${await seal({ t: 'capture', uid: user.id, v })}` });
  }

  const key = await unseal(url.searchParams.get('k'), 'capture');
  const owner = key && (await adminUser(key.uid));
  if (!key || !owner || Number(owner.app_metadata?.capture_v) !== key.v)
    return text('This Notebase link no longer works. Make a new one in Notebase → Save from your phone.', 401);

  try {
    const items = await readItems(req);
    if (!items.length) return text('Nothing to save — share a link, some text or a photo.', 400);
    const inbox = await inboxOf(key.uid);
    const cards: CardNode[] = [];
    for (const item of items) cards.push(await toCard(item));
    await changeBoard(key.uid, inbox, (content) => {
      for (const card of cards) {
        const n = content.nodes.length;
        card.position = { x: (n % 4) * 320, y: Math.floor(n / 4) * 340 };
        content.nodes.push(card);
      }
    });
    const what =
      cards.length === 1
        ? cards[0].type === 'note'
          ? 'Note'
          : cards[0].type[0].toUpperCase() + cards[0].type.slice(1)
        : `${cards.length} items`;
    return text(`✓ ${what} saved to your Notebase Inbox`);
  } catch (e) {
    return text((e as Error).message, 400);
  }
}

type Item = { text: string } | { file: Blob; name: string };

async function readItems(req: Request): Promise<Item[]> {
  const type = (req.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
  if (type === 'multipart/form-data' || type === 'application/x-www-form-urlencoded') {
    const form = await req.formData();
    const items: Item[] = [];
    const texts: string[] = [];
    for (const value of form.values()) {
      if (typeof value === 'string') value.trim() && texts.push(value.trim());
      else if (value.size) items.push({ file: value, name: (value as File).name ?? '' });
    }
    // Several text fields (e.g. a title and a link) describe one thing.
    if (texts.length) items.unshift({ text: [...new Set(texts)].join('\n') });
    return items;
  }
  if (type === 'application/json') {
    const j = (await req.json().catch(() => null)) as Record<string, unknown> | null;
    const parts = ['title', 'text', 'url']
      .map((k) => (typeof j?.[k] === 'string' ? (j[k] as string).trim() : ''))
      .filter(Boolean);
    return parts.length ? [{ text: [...new Set(parts)].join('\n') }] : [];
  }
  if (uploadKind(type)) return [{ file: new Blob([await req.arrayBuffer()], { type }), name: '' }];
  const raw = new TextDecoder().decode(await req.arrayBuffer());
  if (!type || type.startsWith('text/')) return raw.trim() ? [{ text: raw.trim() }] : [];
  // Anything else (a shared web page arrives as a .webloc / .url file): keep the link in it.
  const link = raw.match(/https?:\/\/[^\s<>"'\u0000-\u001f]+/)?.[0];
  if (link) return [{ text: link }];
  throw new Error("Couldn't read that. Share a link, some text or a photo.");
}

const IMAGE_URL = /\.(png|jpe?g|gif|webp|avif)(\?.*)?$/i;
const VIDEO_URL = /\.(mp4|webm|mov|m4v)(\?.*)?$|youtube\.com\/(watch|shorts)|youtu\.be\/|vimeo\.com\/\d/i;
const host = (u: string) => {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u;
  }
};

async function toCard(item: Item): Promise<CardNode> {
  const at = { x: 0, y: 0 };
  if ('file' in item) {
    const type = item.file.type || 'application/octet-stream';
    const kind = uploadKind(type);
    if (!kind) throw new Error('Only photos and videos can be saved as files.');
    if (item.file.size > MAX_DIRECT)
      throw new Error('That file is over 4 MB. Add a "Resize Image" step to the Shortcut, or use an upload link.');
    const data = await item.file.arrayBuffer();
    const mediaId = nanoid(21);
    await uploadMedia(mediaId, data, type);
    const caption = item.name.replace(/\.[a-z0-9]+$/i, '').slice(0, 120) || undefined;
    const card = makeCard(kind, at, { mediaId, caption });
    card.width = 280;
    const aspect = kind === 'image' ? imageAspect(new Uint8Array(data, 0, Math.min(data.byteLength, 65536))) : null;
    if (aspect) card.height = Math.round(Math.min(560, Math.max(120, 280 / aspect)) + 44);
    return card;
  }
  const t = item.text.slice(0, 20000);
  const link = t.match(/https?:\/\/\S+/)?.[0];
  const rest = (link ? t.replace(link, '') : t).replace(/\s+\n/g, '\n').trim();
  if (!link) return makeCard('note', at, { text: t });
  if (IMAGE_URL.test(link)) return makeCard('image', at, { url: link, caption: rest.slice(0, 200) || undefined });
  if (VIDEO_URL.test(link)) return makeCard('video', at, { url: link, caption: rest.slice(0, 200) || undefined });
  return makeCard('link', at, { url: link, title: rest.split('\n')[0].slice(0, 140) || host(link) });
}

/** The user's Inbox board (made if there isn't one yet). */
async function inboxOf(uid: string): Promise<string> {
  const boards = await listBoards(uid);
  const inbox = boards.find((b) => b.inbox);
  if (inbox) return inbox.id;
  const id = nanoid(10);
  await insertBoard(uid, { id, name: 'Inbox', icon: '📥', parentId: null, content: { nodes: [], edges: [] }, inbox: true });
  return id;
}
