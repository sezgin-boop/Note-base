import { create } from 'zustand';
import { cloudConfigured, supabase, toRemoteComment, type RemoteComment } from './cloud';
import * as db from './db';
import { mergeBoards, mergeMeta } from './merge';
import { flushSave, useStore } from './store';
import type { BoardContent, BoardMeta } from './types';
import { toast } from './ui';

/*
 * Offline-first sync. IndexedDB stays the source the app reads from; this module mirrors
 * it to Supabase. Each board is one row. A board changed only here is uploaded, one changed only
 * elsewhere is downloaded, and one changed on both sides is merged card by card (merge.ts) against
 * the version both last agreed on (`synced:<id>` in IndexedDB), so neither device's edits are lost.
 * Uploads only overwrite the row if nobody else wrote it in between; otherwise the board is merged again.
 *
 *   pushed[id]  updatedAt we last uploaded/downloaded (the agreed version);
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
  inbox?: boolean;
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
  inbox: !!r.inbox,
});

// Databases set up before the inbox column existed still sync; only the inbox flag is skipped.
let hasInboxColumn = true;
const missingInbox = (e: { message?: string } | null) => !!e && /inbox/.test(e.message ?? '');

/**
 * Upload boards. `expected` holds the remote updated_at each one was based on: such a row is only
 * overwritten if it still has that value; a board someone changed meanwhile is left for the next
 * round (which merges it). Returns whether any board has to wait for that.
 */
async function pushBoards(metas: BoardMeta[], expected: Map<string, number> = new Map()): Promise<boolean> {
  if (!metas.length) return false;
  let raced = false;
  for (const m of metas) {
    const { viewport, ...content } = await db.loadBoard(m.id);
    const row: Record<string, unknown> = {
      id: m.id,
      name: m.name,
      icon: m.icon,
      parent_id: m.parentId,
      updated_at: m.updatedAt,
      share_id: m.shareId ?? null,
      share_comments: m.shareComments ?? true,
      ...(hasInboxColumn ? { inbox: !!m.inbox } : {}),
      content,
    };
    const was = expected.get(m.id);
    const write = (r: Record<string, unknown>) =>
      was === undefined
        ? supabase!.from('boards').upsert(r).select('id')
        : supabase!.from('boards').update(r).eq('id', m.id).eq('updated_at', was).select('id');
    let { data, error } = await write(row);
    if (missingInbox(error) && hasInboxColumn) {
      hasInboxColumn = false;
      delete row.inbox;
      ({ data, error } = await write(row));
    }
    if (error) throw error;
    if (was !== undefined && !data?.length) {
      raced = true; // written by another device a moment ago: merge it next round
      continue;
    }
    setPushed(m.id, m.updatedAt);
    await db.saveSynced(m.id, { meta: m, content });
  }
  return raced;
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
      // Another device writing at the same moment can need one more round (bounded, just in case).
      let rounds = 0;
      do {
        again = false;
        await syncOnce();
      } while (again && ++rounds < 4);
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
  // Edits still waiting to be saved go along in this round.
  await flushSave();
  const open = useStore.getState().currentId;
  // The open board as this round starts: whatever is typed while it runs is merged back in later.
  const openAtStart = open ? await db.loadBoard(open) : undefined;
  await flushDeletes();

  const columns = 'id,name,icon,parent_id,updated_at,share_id,share_comments';
  let { data, error } = await supabase!.from('boards').select(hasInboxColumn ? `${columns},inbox` : columns);
  if (missingInbox(error) && hasInboxColumn) {
    hasInboxColumn = false;
    ({ data, error } = await supabase!.from('boards').select(columns));
  }
  if (error) throw error;
  const remote = new Map((data as unknown as Row[]).map((r) => [r.id, r]));
  const local = useStore.getState().boards;
  const known = pushed();

  const toPush: BoardMeta[] = [];
  const toPull: string[] = [];
  const toMerge: string[] = [];
  const goneRemotely: string[] = [];

  for (const l of local) {
    const r = remote.get(l.id);
    if (!r) {
      if (known[l.id] !== undefined) goneRemotely.push(l.id);
      else toPush.push(l);
      continue;
    }
    const at = Number(r.updated_at);
    const base = known[l.id];
    if (base === undefined) {
      // Never synced on this device: same version → just remember it; otherwise merge both.
      if (at === l.updatedAt) setPushed(l.id, at);
      else toMerge.push(l.id);
      continue;
    }
    const changedHere = l.updatedAt !== base;
    const changedThere = at !== base;
    if (changedHere && changedThere) toMerge.push(l.id);
    // Changed elsewhere: take it — unless this device never kept the agreed version (synced before
    // merging existed). Then combine instead, so cards that only this device has are not lost.
    else if (changedThere) ((await db.loadSynced(l.id)) ? toPull : toMerge).push(l.id);
    else if (changedHere) toPush.push(l);
  }
  const pending = new Set(ls.get<string[]>('deleted', []));
  for (const id of remote.keys()) if (!local.some((l) => l.id === id) && !pending.has(id)) toPull.push(id);

  const expected = new Map(
    [...toPush, ...toMerge.map((id) => ({ id }))].flatMap((b) => {
      const r = remote.get(b.id);
      return r ? [[b.id, Number(r.updated_at)] as const] : [];
    }),
  );
  if (await pushBoards(toPush, expected)) again = true;

  const wanted = [...toPull, ...toMerge];
  if (wanted.length) {
    const { data: full, error: e2 } = await supabase!.from('boards').select('*').in('id', wanted);
    if (e2) throw e2;
    const pulled = new Map<string, BoardMeta>();
    const merged: BoardMeta[] = [];
    for (const r of full as Row[]) {
      const theirs = { ...(r.content ?? { nodes: [], edges: [] }) };
      const meta = toMeta(r);
      if (!toMerge.includes(r.id)) {
        // The open board may have been saved again since this round started: keep those edits.
        const keep = r.id === open && openAtStart ? mergeBoards(openAtStart, await db.loadBoard(r.id), theirs) : theirs;
        await db.saveBoard(r.id, keep);
        await db.saveSynced(r.id, { meta, content: theirs });
        pulled.set(r.id, meta);
        continue;
      }
      // Changed on both sides: combine them, then upload the result.
      const base = await db.loadSynced(r.id);
      const mine = await db.loadBoard(r.id);
      const mineMeta = useStore.getState().boards.find((b) => b.id === r.id) ?? meta;
      const content = mergeBoards(base?.content, mine, theirs);
      const both = mergeMeta(base?.meta, mineMeta, meta);
      await db.saveBoard(r.id, content);
      merged.push({ ...both, updatedAt: Math.max(Date.now(), meta.updatedAt + 1, mineMeta.updatedAt + 1) });
    }
    const changed = new Map([...pulled, ...merged.map((m) => [m.id, m] as const)]);
    mergeIndex((boards) => [
      ...boards.map((b) => changed.get(b.id) ?? b),
      ...[...pulled.values()].filter((m) => !boards.some((b) => b.id === m.id)),
    ]);
    for (const m of pulled.values()) setPushed(m.id, m.updatedAt);
    const mergedExpected = new Map(merged.map((m) => [m.id, Number(remote.get(m.id)!.updated_at)]));
    if (await pushBoards(merged, mergedExpected)) again = true;
    if (changed.has(open)) await useStore.getState().reloadBoard(open, openAtStart);
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
  if (error || useStore.getState().currentId !== s.currentId) return;
  const list = data.map(toRemoteComment);
  s.setClientComments(list);
  applyApprovals(list);
}

const OPEN_STATUSES = new Set(['brief', 'shoot', 'edit', 'revision']);

/**
 * A client approved a video version: record it on the video card and move the job it belongs to
 * (a connected job card, or the board's only job card) to Delivered. Each approval is applied once.
 */
function applyApprovals(list: RemoteComment[]) {
  for (const a of list.filter((c) => c.kind === 'approval')) {
    const s = useStore.getState();
    const video = s.nodes.find((n) => n.id === a.nodeId);
    if (!video || video.data.approvals?.some((x) => x.id === a.id)) continue;
    const version = a.version ?? 'v1';
    const label = video.data.versions?.find((v) => v.id === version)?.label ?? 'V1';
    s.updateData(video.id, {
      approvals: [
        ...(video.data.approvals ?? []),
        { id: a.id, version, by: a.author, at: Date.parse(a.createdAt) || Date.now() },
      ],
    });
    const linked = new Set(
      s.edges
        .filter((e) => e.source === video.id || e.target === video.id)
        .map((e) => (e.source === video.id ? e.target : e.source)),
    );
    let jobs = s.nodes.filter((n) => n.type === 'project' && linked.has(n.id));
    if (!jobs.length) {
      const all = s.nodes.filter((n) => n.type === 'project');
      if (all.length === 1) jobs = all;
    }
    for (const j of jobs) if (OPEN_STATUSES.has(j.data.status ?? 'brief')) s.updateData(j.id, { status: 'delivered' });
    toast(`${a.author} approved ${label}${jobs.length ? ' — job marked Delivered' : ''}`, 6000);
  }
}

export async function updateClientComment(id: string, patch: { done?: boolean } | null) {
  if (!supabase) return;
  const q = patch ? supabase.from('comments').update(patch).eq('id', id) : supabase.from('comments').delete().eq('id', id);
  const { error } = await q;
  if (error) toast(`Couldn't update the comment: ${error.message}`);
  await loadClientComments();
}

// ---------- Media ----------

let uploading = false;
let uploadAgain = false;
let uploadRetry = 0;
const MAX_FREE_UPLOAD = 50 * 1024 * 1024;

/**
 * Sends photos and videos that are only on this device to the cloud, so other devices and share
 * links can show them. Files added while a round is running get their own round right after; a
 * file that fails doesn't hold up the rest and is tried again a little later.
 */
export async function uploadPendingMedia() {
  if (!supabase || !useCloud.getState().user) return;
  if (uploading) {
    uploadAgain = true;
    return;
  }
  uploading = true;
  clearTimeout(uploadRetry);
  let retry = false;
  try {
    const done = new Set(ls.get<string[]>('uploaded', []));
    const failed = new Set(ls.get<string[]>('uploadFailed', []));
    const todo = (await db.mediaKeys()).filter((id) => !done.has(id) && !failed.has(id));
    useCloud.setState({ uploads: todo.length });
    for (const id of todo) {
      const blob = await db.getMediaBlob(id);
      if (!blob) {
        // Lost by the browser: nothing left to send.
        failed.add(id);
        ls.set('uploadFailed', [...failed]);
        toast('A photo on this device could not be read anymore. Add it again to put it in the cloud.');
      } else {
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
          toast(`A file (${Math.round(blob.size / 1048576)} MB) is over the cloud size limit. It stays on this device only.`);
        } else {
          retry = true;
          useCloud.setState({ error: `Upload failed: ${error.message}` });
        }
      }
      useCloud.setState({ uploads: Math.max(0, useCloud.getState().uploads - 1) });
    }
  } catch (e) {
    retry = true;
    useCloud.setState({ error: (e as Error).message });
  } finally {
    uploading = false;
    useCloud.setState({ uploads: 0 });
  }
  if (uploadAgain) {
    uploadAgain = false;
    return uploadPendingMedia();
  }
  if (retry) uploadRetry = window.setTimeout(uploadPendingMedia, 20_000);
}

// ---------- Auth ----------

export async function signIn(email: string, password: string, create: boolean) {
  if (!supabase) throw new Error('Cloud is not set up');
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
      `Your cloud already has ${count} boards.\n\n` +
        `Add the ${local.length} boards on this device to it as well?\n\n` +
        'OK: merge both · Cancel: remove this device’s boards and use the cloud ones',
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
  window.addEventListener('online', () => uploadPendingMedia());
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && uploadPendingMedia());

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
  // Leaving the app (switching apps, locking the phone): send the last edits right away, before
  // the phone puts the page to sleep, instead of after the usual short delay.
  const leaving = () => {
    clearTimeout(pushTimer);
    void flushSave().then(() => syncNow());
  };
  document.addEventListener('visibilitychange', () => document.visibilityState === 'hidden' && leaving());
  window.addEventListener('pagehide', leaving);
  window.addEventListener('online', () => syncNow());
  setInterval(() => document.visibilityState === 'visible' && syncNow(), 30_000);
}

export { cloudConfigured };
