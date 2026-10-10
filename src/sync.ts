import { create } from 'zustand';
import { cloudConfigured, supabase, toRemoteComment } from './cloud';
import * as db from './db';
import { hasPendingSave, useStore } from './store';
import type { BoardContent, BoardMeta } from './types';
import { toast } from './ui';

/*
 * Offline-first sync. IndexedDB stays the source the app reads from; this module mirrors
 * it to Supabase. Each board is one row and the newest `updated_at` wins.
 *
 *   pushed[id]  updatedAt we last uploaded/downloaded — local edits newer than it get pushed;
 *               a board we had synced that disappears remotely was deleted on another device.
 *   deleted     board ids deleted here but not yet deleted remotely (e.g. while offline).
 *   uploaded    media ids already in storage.
 */

type Status = 'off' | 'syncing' | 'synced' | 'offline' | 'error';

interface CloudState {
  user: { id: string; email: string } | null;
  status: Status;
  lastSync: number | null;
  error: string | null;
  uploads: number;
}

export const useCloud = create<CloudState>(() => ({
  user: null,
  status: 'off',
  lastSync: null,
  error: null,
  uploads: 0,
}));

const ls = {
  get: <T>(k: string, d: T): T => {
    try {
      return JSON.parse(localStorage.getItem(`notebase:${k}`) ?? '') as T;
    } catch {
      return d;
    }
  },
  set: (k: string, v: unknown) => localStorage.setItem(`notebase:${k}`, JSON.stringify(v)),
};

const pushed = () => ls.get<Record<string, number>>('pushed', {});
const setPushed = (id: string, at: number | null) => {
  const p = pushed();
  if (at === null) delete p[id];
  else p[id] = at;
  ls.set('pushed', p);
};

interface Row {
  id: string;
  name: string;
  icon: string;
  parent_id: string | null;
  updated_at: number;
  share_id: string | null;
  share_comments: boolean;
  content?: BoardContent;
}

const toMeta = (r: Row): BoardMeta => ({
  id: r.id,
  name: r.name,
  icon: r.icon,
  parentId: r.parent_id,
  updatedAt: Number(r.updated_at),
  shareId: r.share_id,
  shareComments: r.share_comments,
});

async function pushBoards(metas: BoardMeta[]) {
  if (!metas.length) return;
  const rows = await Promise.all(
    metas.map(async (m) => {
      const { viewport, ...content } = await db.loadBoard(m.id);
      return {
        id: m.id,
        name: m.name,
        icon: m.icon,
        parent_id: m.parentId,
        updated_at: m.updatedAt,
        share_id: m.shareId ?? null,
        share_comments: m.shareComments ?? true,
        content,
      };
    }),
  );
  const { error } = await supabase!.from('boards').upsert(rows);
  if (error) throw error;
  for (const m of metas) setPushed(m.id, m.updatedAt);
}

async function flushDeletes() {
  const ids = ls.get<string[]>('deleted', []);
  if (!ids.length) return;
  const { error } = await supabase!.from('boards').delete().in('id', ids);
  if (error) throw error;
  ls.set(
    'deleted',
    ls.get<string[]>('deleted', []).filter((i) => !ids.includes(i)),
  );
  for (const id of ids) setPushed(id, null);
}

let running: Promise<void> | null = null;
let again = false;

/** Two-way sync of the whole workspace. Calls made while one runs are coalesced. */
export function syncNow(): Promise<void> {
  if (!supabase || !useCloud.getState().user) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    try {
      do {
        again = false;
        await syncOnce();
      } while (again);
      useCloud.setState({ status: 'synced', lastSync: Date.now(), error: null });
    } catch (e) {
      const offline = !navigator.onLine || (e as Error).message?.includes('fetch');
      useCloud.setState({ status: offline ? 'offline' : 'error', error: (e as Error).message });
    } finally {
      running = null;
    }
  })();
  return running;
}

async function syncOnce() {
  useCloud.setState({ status: 'syncing' });
  await flushDeletes();

  const { data, error } = await supabase!.from('boards').select('id,name,icon,parent_id,updated_at,share_id,share_comments');
  if (error) throw error;
  const remote = new Map((data as Row[]).map((r) => [r.id, r]));
  const local = useStore.getState().boards;
  const known = pushed();

  const toPush: BoardMeta[] = [];
  const toPull: string[] = [];
  const goneRemotely: string[] = [];

  for (const l of local) {
    const r = remote.get(l.id);
    if (!r) {
      if (known[l.id] !== undefined) goneRemotely.push(l.id);
      else toPush.push(l);
    } else if (Number(r.updated_at) > l.updatedAt) toPull.push(l.id);
    else if (l.updatedAt > Number(r.updated_at) || known[l.id] === undefined) {
      if (l.updatedAt > Number(r.updated_at)) toPush.push(l);
      else setPushed(l.id, l.updatedAt);
    }
  }
  const pending = new Set(ls.get<string[]>('deleted', []));
  for (const id of remote.keys()) if (!local.some((l) => l.id === id) && !pending.has(id)) toPull.push(id);

  await pushBoards(toPush);

  if (toPull.length) {
    const { data: full, error: e2 } = await supabase!.from('boards').select('*').in('id', toPull);
    if (e2) throw e2;
    for (const r of full as Row[]) await db.saveBoard(r.id, { ...(r.content ?? { nodes: [], edges: [] }) });
    const pulled = new Map((full as Row[]).map((r) => [r.id, toMeta(r)]));
    mergeIndex((boards) => [
      ...boards.map((b) => pulled.get(b.id) ?? b),
      ...[...pulled.values()].filter((m) => !boards.some((b) => b.id === m.id)),
    ]);
    for (const m of pulled.values()) setPushed(m.id, m.updatedAt);
    const open = useStore.getState().currentId;
    if (pulled.has(open) && !hasPendingSave(open)) await useStore.getState().reloadBoard(open);
  }

  if (goneRemotely.length) {
    for (const id of goneRemotely) {
      await db.deleteBoard(id, true);
      setPushed(id, null);
    }
    mergeIndex((boards) => boards.filter((b) => !goneRemotely.includes(b.id)));
    const s = useStore.getState();
    if (goneRemotely.includes(s.currentId)) await s.openBoard(s.boards[0]?.id);
  }

  const s = useStore.getState();
  if (!s.boards.some((b) => b.id === s.currentId) && s.boards.length) {
    await s.openBoard((s.boards.find((b) => !b.parentId) ?? s.boards[0]).id);
  }

  await loadClientComments();
  uploadPendingMedia();
}

function mergeIndex(fn: (boards: BoardMeta[]) => BoardMeta[]) {
  const boards = fn(useStore.getState().boards);
  useStore.setState({ boards });
  db.saveIndex(boards, true);
}

// ---------- Client comments ----------

export async function loadClientComments() {
  const s = useStore.getState();
  if (!supabase || !useCloud.getState().user || s.readOnly || !s.currentId) return;
  const { data, error } = await supabase.from('comments').select('*').eq('board_id', s.currentId).order('created_at');
  if (!error && useStore.getState().currentId === s.currentId) s.setClientComments(data.map(toRemoteComment));
}

export async function updateClientComment(id: string, patch: { done?: boolean } | null) {
  if (!supabase) return;
  const q = patch ? supabase.from('comments').update(patch).eq('id', id) : supabase.from('comments').delete().eq('id', id);
  const { error } = await q;
  if (error) toast(`Yorum güncellenemedi: ${error.message}`);
  await loadClientComments();
}

// ---------- Media ----------

let uploading = false;
const MAX_FREE_UPLOAD = 50 * 1024 * 1024;

export async function uploadPendingMedia() {
  if (!supabase || !useCloud.getState().user || uploading) return;
  uploading = true;
  try {
    const done = new Set(ls.get<string[]>('uploaded', []));
    const failed = new Set(ls.get<string[]>('uploadFailed', []));
    const todo = (await db.mediaKeys()).filter((id) => !done.has(id) && !failed.has(id));
    useCloud.setState({ uploads: todo.length });
    for (const id of todo) {
      const blob = await db.getMediaBlob(id);
      if (!blob) continue;
      const { error } = await supabase.storage
        .from('media')
        .upload(id, blob, { contentType: blob.type || undefined, upsert: false, cacheControl: '31536000' });
      const exists = error && /exists|duplicate/i.test(error.message);
      if (!error || exists) {
        done.add(id);
        ls.set('uploaded', [...done]);
      } else if (blob.size > MAX_FREE_UPLOAD || /size|too large|413/i.test(error.message)) {
        failed.add(id);
        ls.set('uploadFailed', [...failed]);
        toast(`Bir dosya (${Math.round(blob.size / 1048576)} MB) buluta yüklenemedi: boyut sınırı. Sadece bu cihazda duracak.`);
      } else {
        throw error;
      }
      useCloud.setState({ uploads: useCloud.getState().uploads - 1 });
    }
  } catch (e) {
    useCloud.setState({ error: (e as Error).message });
  } finally {
    uploading = false;
    useCloud.setState({ uploads: 0 });
  }
}

// ---------- Auth ----------

export async function signIn(email: string, password: string, create: boolean) {
  if (!supabase) throw new Error('Bulut ayarlanmamış');
  const { data, error } = create
    ? await supabase.auth.signUp({ email, password })
    : await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  if (create && !data.session) return 'confirm' as const;
  return 'ok' as const;
}

export async function signOut() {
  await supabase?.auth.signOut();
  ls.set('pushed', {});
  localStorage.removeItem('notebase:syncUser');
}

/** First sync of a device (or a different account) decides how local boards are merged. */
async function firstSyncForUser(userId: string) {
  if (localStorage.getItem('notebase:syncUser') === userId) return;
  ls.set('pushed', {});
  const { count } = await supabase!.from('boards').select('id', { count: 'exact', head: true });
  const local = useStore.getState().boards;
  if (count && local.length) {
    const keep = confirm(
      `Bulutta zaten ${count} pano var.\n\n` +
        `Bu cihazdaki ${local.length} pano da buluta eklensin mi?\n\n` +
        'Tamam: ikisini birleştir · İptal: bu cihazdakileri sil, buluttakileri kullan',
    );
    if (!keep) {
      for (const b of local) await db.deleteBoard(b.id, true);
      mergeIndex(() => []);
    }
  }
  localStorage.setItem('notebase:syncUser', userId);
}

// ---------- Wiring ----------

let pushTimer: ReturnType<typeof setTimeout> | undefined;
const schedule = (ms = 1500) => {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(syncNow, ms);
};

export function startSync() {
  if (!supabase || useStore.getState().readOnly) return;

  db.dbEvents.addEventListener('index', () => schedule());
  db.dbEvents.addEventListener('delete', (e) => {
    const id = (e as CustomEvent<string>).detail;
    if (pushed()[id] === undefined) return;
    ls.set('deleted', [...new Set([...ls.get<string[]>('deleted', []), id])]);
    schedule(300);
  });
  db.dbEvents.addEventListener('media', () => setTimeout(uploadPendingMedia, 500));

  // Opening a board shows the latest client comments for it.
  useStore.subscribe((s, p) => s.currentId !== p.currentId && loadClientComments());

  const onSession = async (session: { user: { id: string; email?: string } } | null) => {
    const prev = useCloud.getState().user;
    if (!session) {
      useCloud.setState({ user: null, status: 'off' });
      return;
    }
    if (prev?.id === session.user.id) return;
    useCloud.setState({ user: { id: session.user.id, email: session.user.email ?? '' }, status: 'syncing' });
    try {
      await firstSyncForUser(session.user.id);
    } catch (e) {
      useCloud.setState({ status: 'error', error: (e as Error).message });
    }
    syncNow();
  };
  supabase.auth.getSession().then(({ data }) => onSession(data.session));
  supabase.auth.onAuthStateChange((_event, session) => {
    // Supabase warns against awaiting other calls inside this callback.
    setTimeout(() => onSession(session), 0);
  });

  // Pick up changes from other devices.
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && syncNow());
  window.addEventListener('online', () => syncNow());
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 30_000);
}

export { cloudConfigured };
