// The signed-in user's boards in Supabase, accessed with the secret key. Every query is limited to
// `user_id = uid` here, because the secret key bypasses the row-level security the app relies on.

import type { BoardContent } from '../src/types';
import { keyHeaders, SUPABASE_ANON_KEY, SUPABASE_SECRET_KEY, SUPABASE_URL } from './env';

export interface BoardRow {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
  updatedAt: number;
  inbox: boolean;
  content?: BoardContent;
}

const rest = async (path: string, init: RequestInit = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    ...init,
    headers: { ...keyHeaders(SUPABASE_SECRET_KEY), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`Database error ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const text = await res.text();
  return text ? JSON.parse(text) : null;
};

const toRow = (r: any): BoardRow => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  parentId: r.parent_id,
  updatedAt: Number(r.updated_at),
  inbox: !!r.inbox,
  ...(r.content ? { content: { nodes: r.content.nodes ?? [], edges: r.content.edges ?? [], viewport: r.content.viewport } } : {}),
});

const enc = encodeURIComponent;
const META = 'id,name,icon,parent_id,updated_at,inbox';

export async function listBoards(uid: string, withContent = false): Promise<BoardRow[]> {
  const rows = await rest(`boards?user_id=eq.${enc(uid)}&select=${META}${withContent ? ',content' : ''}&order=updated_at.desc`);
  return rows.map(toRow);
}

export async function getBoard(uid: string, id: string): Promise<BoardRow | null> {
  const rows = await rest(`boards?user_id=eq.${enc(uid)}&id=eq.${enc(id)}&select=${META},content`);
  return rows[0] ? toRow(rows[0]) : null;
}

/**
 * Change a board's content. Only succeeds if nobody saved the board in between (otherwise it
 * re-reads and tries again), and stamps a newer `updated_at` so the apps pull the change.
 */
export async function changeBoard<T>(
  uid: string,
  id: string,
  fn: (content: BoardContent, board: BoardRow) => T,
): Promise<{ result: T; board: BoardRow }> {
  for (let attempt = 0; attempt < 3; attempt++) {
    const board = await getBoard(uid, id);
    if (!board) throw new Error('Board not found.');
    const content = structuredClone(board.content!);
    const result = fn(content, board);
    const updatedAt = Math.max(Date.now(), board.updatedAt + 1);
    const rows = await rest(`boards?user_id=eq.${enc(uid)}&id=eq.${enc(id)}&updated_at=eq.${board.updatedAt}`, {
      method: 'PATCH',
      headers: { prefer: 'return=representation' },
      body: JSON.stringify({ content, updated_at: updatedAt }),
    });
    if (rows.length) return { result, board: { ...board, content, updatedAt } };
  }
  throw new Error('The board is being edited right now; please try again.');
}

export async function insertBoard(
  uid: string,
  b: { id: string; name: string; icon: string; parentId: string | null; content: BoardContent; inbox?: boolean },
) {
  await rest('boards', {
    method: 'POST',
    headers: { prefer: 'return=minimal' },
    body: JSON.stringify({
      id: b.id,
      user_id: uid,
      name: b.name,
      icon: b.icon,
      parent_id: b.parentId,
      content: b.content,
      updated_at: Date.now(),
      ...(b.inbox ? { inbox: true } : {}),
    }),
  });
}

export interface CommentRow {
  boardId: string;
  nodeId: string;
  t: number | null;
  author: string;
  body: string;
  done: boolean;
  version: string | null;
  kind: string;
}

/** Comments and approvals clients left through share links. */
export async function boardComments(boardIds: string[]): Promise<CommentRow[]> {
  if (!boardIds.length) return [];
  const rows = await rest(
    `comments?board_id=in.(${boardIds.map((id) => `"${id}"`).join(',')})&select=board_id,node_id,t,author,body,done,version,kind&order=created_at`,
  );
  return rows.map((r: any) => ({
    boardId: r.board_id,
    nodeId: r.node_id,
    t: r.t,
    author: r.author,
    body: r.body,
    done: r.done,
    version: r.version,
    kind: r.kind,
  }));
}

/** Upload a file to the public media bucket under a new id (what cards reference as `mediaId`). */
export async function uploadMedia(id: string, data: ArrayBuffer, type: string) {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/media/${id}`, {
    method: 'POST',
    headers: { ...keyHeaders(SUPABASE_SECRET_KEY), 'content-type': type },
    body: data,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 160)}`);
}

/**
 * A one-time address the browser can upload a file to directly (no size limit of our own functions;
 * the bucket's limit applies). Returns the absolute URL to PUT the file to.
 */
export async function signedUploadUrl(id: string): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/upload/sign/media/${id}`, {
    method: 'POST',
    headers: { ...keyHeaders(SUPABASE_SECRET_KEY), 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error(`Couldn't prepare the upload (${res.status}): ${(await res.text()).slice(0, 160)}`);
  const { url } = await res.json();
  return `${SUPABASE_URL}/storage/v1${url}`;
}

/** Whether an uploaded file is really there (before a card points at it). */
export async function mediaExists(id: string): Promise<boolean> {
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/public/media/${id}`, { method: 'HEAD' });
  return res.ok;
}

export const mediaUrl = (id: string) => `${SUPABASE_URL}/storage/v1/object/public/media/${id}`;

// ---------- Auth (for the phone capture link) ----------

export interface AuthUser {
  id: string;
  email?: string;
  app_metadata?: Record<string, unknown>;
}

/** The signed-in user behind an app session token (null if the token isn't valid). */
export async function userFromSession(accessToken: string): Promise<AuthUser | null> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY || SUPABASE_SECRET_KEY, authorization: `Bearer ${accessToken}` },
  });
  return res.ok ? ((await res.json()) as AuthUser) : null;
}

const admin = (uid: string, init: RequestInit = {}) =>
  fetch(`${SUPABASE_URL}/auth/v1/admin/users/${enc(uid)}`, {
    ...init,
    headers: { ...keyHeaders(SUPABASE_SECRET_KEY), 'content-type': 'application/json', ...(init.headers ?? {}) },
  });

export async function adminUser(uid: string): Promise<AuthUser | null> {
  const res = await admin(uid);
  return res.ok ? ((await res.json()) as AuthUser) : null;
}

/** Merge values into the user's app_metadata (which only the server can change). */
export async function setAppMetadata(uid: string, values: Record<string, unknown>) {
  const res = await admin(uid, { method: 'PUT', body: JSON.stringify({ app_metadata: values }) });
  if (!res.ok) throw new Error(`Couldn't update the account (${res.status})`);
}
