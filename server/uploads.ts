// Upload links: the Claude connector can't receive files from a chat, so it hands out a link that
// accepts photos and videos for one board for a while — used by the user (a small upload page) or
// by Claude's own code sandbox (a plain POST).

import { makeCard } from '../src/cards';
import type { CardNode } from '../src/types';
import { changeBoard } from './db';
import { sha256b64url } from './seal';
import { freeSpot } from './tools';

export const UPLOAD_TTL = 60 * 60;
export const MAX_DIRECT = 4 * 1024 * 1024; // what a function request may carry
export const MAX_FILE = 50 * 1024 * 1024; // Supabase free plan file limit

export const uploadKind = (type: string) => (type.startsWith('image/') ? 'image' : type.startsWith('video/') ? 'video' : null);

/**
 * Put an uploaded file on the board as an image / video card. Files from the same link line up in a
 * grid of four next to the first one.
 */
export async function placeUpload(
  uid: string,
  boardId: string,
  token: string,
  f: { mediaId: string; type: string; caption?: string; aspect?: number | null },
) {
  const batch = (await sha256b64url(token)).slice(0, 10);
  const { result, board } = await changeBoard(uid, boardId, (content) => {
    const siblings = content.nodes.filter((n) => n.data.batch === batch);
    const first = siblings[0];
    const anchor = first ? first.position : freeSpot(content);
    const i = siblings.length;
    const col = i % 4;
    const row = Math.floor(i / 4);
    // Row height: the tallest card in the rows above.
    const rowTop = (r: number) =>
      anchor.y +
      Array.from({ length: r }, (_, k) =>
        Math.max(...siblings.slice(k * 4, k * 4 + 4).map((n) => (n.height ?? 300) + 40)),
      ).reduce((a, b) => a + b, 0);
    const at = { x: anchor.x + col * 320, y: rowTop(row) };
    const kind = uploadKind(f.type)!;
    const node: CardNode = makeCard(kind, at, { mediaId: f.mediaId, caption: f.caption, batch });
    node.width = 280;
    if (kind === 'image' && f.aspect && f.aspect > 0) node.height = Math.round(Math.min(560, Math.max(120, 280 / f.aspect)) + 44);
    content.nodes.push(node);
    return node;
  });
  return { node: result, boardName: board.name };
}
