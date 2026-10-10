import {
  addEdge,
  applyEdgeChanges,
  applyNodeChanges,
  type Connection,
  type EdgeChange,
  type NodeChange,
  type XYPosition,
} from '@xyflow/react';
import { nanoid } from 'nanoid';
import { create } from 'zustand';
import { AUTO_HEIGHT, makeCard } from './cards';
import type { RemoteComment, SharedBundle } from './cloud';
import * as db from './db';
import { buildTemplate, type TemplateId } from './templates';
import type { BoardContent, BoardMeta, CardData, CardEdge, CardNode, CardType } from './types';

interface Snapshot {
  nodes: CardNode[];
  edges: CardEdge[];
}

export type Panel = 'jobs' | 'search' | 'share' | 'account' | 'install' | 'calendar' | 'capture' | 'details' | 'export' | null;
export type Theme = 'system' | 'dark' | 'light';
export type Background = 'dots' | 'grid' | 'none';

export interface MenuState {
  x: number;
  y: number;
  kind: 'node' | 'pane' | 'edge';
  id?: string;
  /** Flow position under the cursor (used to place new cards from the pane menu). */
  at?: XYPosition;
}

/** A read-only board tree opened from a share link. */
export interface SharedView {
  shareId: string;
  allowComments: boolean;
  contents: Record<string, BoardContent>;
}

interface State {
  ready: boolean;
  boards: BoardMeta[];
  currentId: string;
  nodes: CardNode[];
  edges: CardEdge[];
  viewport?: BoardContent['viewport'];
  past: Snapshot[];
  future: Snapshot[];
  lightbox: { src: string; kind: 'image' | 'video' } | null;
  panel: Panel;
  sidebar: boolean;
  focusId: string | null;
  menu: MenuState | null;
  background: Background;
  readOnly: boolean;
  shared: SharedView | null;
  /** Comments clients left through share links, for the open board, by card id. */
  clientComments: Record<string, RemoteComment[]>;
  /** Card whose details (schedule, tags) are being edited. */
  detailsId: string | null;
  /** Only cards with this tag are highlighted. */
  tagFilter: string | null;
  theme: Theme;

  init: () => Promise<void>;
  initShared: (bundle: SharedBundle, shareId: string) => Promise<void>;
  openBoard: (id: string) => Promise<void>;
  reloadBoard: (id: string) => Promise<void>;
  createBoard: (opts: { name: string; parentId: string | null; icon?: string; template?: TemplateId }) => Promise<string>;
  renameBoard: (id: string, patch: Partial<Pick<BoardMeta, 'name' | 'icon' | 'shareId' | 'shareComments'>>) => void;
  removeBoard: (id: string) => Promise<void>;

  onNodesChange: (changes: NodeChange<CardNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CardEdge>[]) => void;
  onConnect: (c: Connection) => void;
  setNodes: (fn: (nodes: CardNode[]) => CardNode[]) => void;
  setEdges: (fn: (edges: CardEdge[]) => CardEdge[]) => void;
  setViewport: (v: BoardContent['viewport']) => void;

  addCard: (type: CardType, position: XYPosition, data?: CardData) => CardNode;
  updateData: (id: string, patch: Partial<CardData>) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  selectOnly: (id: string) => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;
  patchSelected: (fn: (n: CardNode) => CardNode) => void;

  setLightbox: (l: State['lightbox']) => void;
  setPanel: (p: Panel) => void;
  setMenu: (m: MenuState | null) => void;
  setBackground: (b: Background) => void;
  setClientComments: (c: RemoteComment[]) => void;
  toggleSidebar: () => void;
  openDetails: (id: string) => void;
  setTagFilter: (t: string | null) => void;
  setTheme: (t: Theme) => void;
  /** Update a card that may live on a board that isn't open. */
  patchCard: (boardId: string, cardId: string, patch: Partial<CardData>) => Promise<void>;
  /** Add a card to any board (the open one or one stored on this device). */
  appendCard: (boardId: string, card: CardNode) => Promise<void>;
  ensureInbox: () => Promise<string>;
  focusCard: (boardId: string, cardId: string | null) => Promise<void>;
}

export const isPhone = () => window.matchMedia('(max-width: 720px)').matches;

let pendingFocus: string | null = null;
/** True for a freshly added card, so its main field can grab keyboard focus. */
export const takeFocus = (id: string) => pendingFocus === id;
let createdAt = 0;
/** Keystrokes right after adding a card belong to that card, not to the single-key shortcuts. */
export const justCreated = () => Date.now() - createdAt < 600;

/** Older boards stored fixed heights on auto-sizing cards; let them follow their content. */
const normalize = (nodes: CardNode[]) =>
  nodes.map((n) => (AUTO_HEIGHT.has(n.type as CardType) && n.height !== undefined ? { ...n, height: undefined } : n));

let initPromise: Promise<void> | undefined;
let lastDataCheckpoint = { id: '', at: 0 };

export const useStore = create<State>((set, get) => {
  const snapshot = (): Snapshot => ({ nodes: get().nodes, edges: get().edges });
  const editable = () => !get().readOnly;

  const collectDescendants = (id: string): string[] => {
    const kids = get().boards.filter((b) => b.parentId === id);
    return [id, ...kids.flatMap((k) => collectDescendants(k.id))];
  };

  return {
    ready: false,
    boards: [],
    currentId: '',
    nodes: [],
    edges: [],
    past: [],
    future: [],
    lightbox: null,
    panel: null,
    // Phones start with the sidebar closed; desktop remembers the last choice.
    sidebar: isPhone() ? false : localStorage.getItem('notebase:sidebar') !== '0',
    focusId: null,
    menu: null,
    background: (localStorage.getItem('notebase:bg') as Background) || 'dots',
    readOnly: false,
    shared: null,
    clientComments: {},
    detailsId: null,
    tagFilter: null,
    theme: (localStorage.getItem('notebase:theme') as Theme) || 'system',

    init: () =>
      (initPromise ??= (async () => {
        let boards = await db.loadIndex();
        set({ boards });
        if (!boards.length) {
          // First run: a home board with a sample video project inside it.
          const home = await get().createBoard({ name: 'Home', parentId: null, icon: '🏠', template: 'welcome' });
          const sample = await get().createBoard({
            name: 'Sample: YouTube video',
            parentId: home,
            icon: '🎬',
            template: 'video',
          });
          const content = await db.loadBoard(home);
          content.nodes = content.nodes.map((n) => (n.type === 'board' ? { ...n, data: { ...n.data, boardId: sample } } : n));
          await db.saveBoard(home, content);
          boards = get().boards;
        }
        const last = localStorage.getItem('notebase:last');
        const start = boards.find((b) => b.id === last) ?? boards.find((b) => !b.parentId) ?? boards[0];
        await get().openBoard(start.id);
        set({ ready: true });
      })()),

    initShared: async (bundle, shareId) => {
      const contents = Object.fromEntries(bundle.boards.map((b) => [b.id, b.content ?? { nodes: [], edges: [] }]));
      const boards: BoardMeta[] = bundle.boards.map(({ content, ...meta }) => ({
        ...meta,
        // The shared board is the root of what the viewer sees.
        parentId: meta.id === bundle.root ? null : meta.parentId,
      }));
      const clientComments: Record<string, RemoteComment[]> = {};
      for (const c of bundle.comments) (clientComments[c.nodeId] ??= []).push(c);
      set({ readOnly: true, shared: { shareId, allowComments: bundle.allowComments, contents }, boards, clientComments });
      await get().openBoard(bundle.root);
      set({ ready: true });
    },

    openBoard: async (id) => {
      const shared = get().shared;
      const content = shared ? (shared.contents[id] ?? { nodes: [], edges: [] }) : await db.loadBoard(id);
      if (!shared) localStorage.setItem('notebase:last', id);
      pendingFocus = null;
      set({
        currentId: id,
        nodes: normalize(content.nodes),
        edges: content.edges,
        viewport: shared ? undefined : content.viewport,
        past: [],
        future: [],
        menu: null,
        ...(shared ? {} : { clientComments: {} }),
      });
    },

    reloadBoard: async (id) => {
      if (id !== get().currentId) return;
      const content = await db.loadBoard(id);
      const selected = new Set(
        get()
          .nodes.filter((n) => n.selected)
          .map((n) => n.id),
      );
      set({
        nodes: normalize(content.nodes).map((n) => (selected.has(n.id) ? { ...n, selected: true } : n)),
        edges: content.edges,
      });
      markSaved(id, get().nodes, get().edges);
    },

    createBoard: async ({ name, parentId, icon = '📁', template }) => {
      const id = nanoid(10);
      const meta: BoardMeta = { id, name, icon, parentId, updatedAt: Date.now() };
      await db.saveBoard(id, template ? buildTemplate(template) : { nodes: [], edges: [] });
      const boards = [...get().boards, meta];
      set({ boards });
      await db.saveIndex(boards);
      return id;
    },

    renameBoard: (id, patch) => {
      if (!editable()) return;
      const boards = get().boards.map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b));
      set({ boards });
      db.saveIndex(boards);
    },

    removeBoard: async (id) => {
      const ids = new Set(collectDescendants(id));
      const parent = get().boards.find((b) => b.id === id)?.parentId ?? null;
      const boards = get().boards.filter((b) => !ids.has(b.id));
      await Promise.all([...ids].map((i) => db.deleteBoard(i)));
      await db.saveIndex(boards);
      set({ boards });
      if (ids.has(get().currentId)) {
        const next = parent ?? boards[0]?.id;
        if (next) await get().openBoard(next);
        else {
          initPromise = undefined;
          await get().init();
        }
      }
    },

    onNodesChange: (changes) => {
      // Viewers may select and measure cards, nothing else.
      if (!editable()) changes = changes.filter((c) => c.type === 'select' || c.type === 'dimensions');
      if (changes.some((c) => c.type === 'remove')) get().checkpoint();
      let nodes = applyNodeChanges(changes, get().nodes);
      if (changes.some((c) => c.type === 'dimensions')) nodes = normalize(nodes);
      set({ nodes });
    },
    onEdgesChange: (changes) => {
      if (!editable()) changes = changes.filter((c) => c.type === 'select');
      if (changes.some((c) => c.type === 'remove')) get().checkpoint();
      set({ edges: applyEdgeChanges(changes, get().edges) });
    },
    onConnect: (c) => {
      if (!editable()) return;
      get().checkpoint();
      set({ edges: addEdge({ ...c, id: nanoid(10) }, get().edges) });
    },
    setNodes: (fn) => set({ nodes: fn(get().nodes) }),
    setEdges: (fn) => editable() && set({ edges: fn(get().edges) }),
    setViewport: (viewport) => set({ viewport }),

    addCard: (type, position, data) => {
      const node = { ...makeCard(type, position, data), selected: true };
      if (!editable()) return node;
      get().checkpoint();
      pendingFocus = node.id;
      createdAt = Date.now();
      set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node] });
      return node;
    },

    updateData: (id, patch) => {
      if (!editable()) return;
      // Group rapid edits (typing) on the same card into a single undo step.
      const now = Date.now();
      if (lastDataCheckpoint.id !== id || now - lastDataCheckpoint.at > 1500) get().checkpoint();
      lastDataCheckpoint = { id, at: now };
      set({ nodes: get().nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) });
    },

    checkpoint: () => set({ past: [...get().past.slice(-60), snapshot()], future: [] }),
    undo: () => {
      const { past, future } = get();
      const prev = past.at(-1);
      if (!prev || !editable()) return;
      set({ ...prev, past: past.slice(0, -1), future: [snapshot(), ...future] });
    },
    redo: () => {
      const { past, future } = get();
      const next = future[0];
      if (!next || !editable()) return;
      set({ ...next, past: [...past, snapshot()], future: future.slice(1) });
    },

    selectOnly: (id) =>
      set({
        nodes: get().nodes.map((n) => (n.selected === (n.id === id) ? n : { ...n, selected: n.id === id })),
        edges: get().edges.map((e) => (e.selected ? { ...e, selected: false } : e)),
      }),
    duplicateSelected: () => {
      const selected = get().nodes.filter((n) => n.selected);
      if (!selected.length || !editable()) return;
      get().checkpoint();
      const copies = selected.map((n) => ({
        ...structuredClone(n),
        id: nanoid(10),
        position: { x: n.position.x + 30, y: n.position.y + 30 },
        selected: true,
      }));
      set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), ...copies] });
    },
    deleteSelected: () => {
      if (!editable()) return;
      const ids = new Set(
        get()
          .nodes.filter((n) => n.selected)
          .map((n) => n.id),
      );
      if (!ids.size && !get().edges.some((e) => e.selected)) return;
      get().checkpoint();
      set({
        nodes: get().nodes.filter((n) => !ids.has(n.id)),
        edges: get().edges.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)),
        menu: null,
      });
    },
    patchSelected: (fn) => {
      if (!editable()) return;
      get().checkpoint();
      set({ nodes: get().nodes.map((n) => (n.selected ? fn(n) : n)) });
    },

    setLightbox: (lightbox) => set({ lightbox }),
    setPanel: (panel) => set({ panel }),
    setMenu: (menu) => set({ menu }),
    setBackground: (background) => {
      localStorage.setItem('notebase:bg', background);
      set({ background });
    },
    setClientComments: (list) => {
      const clientComments: Record<string, RemoteComment[]> = {};
      for (const c of list) (clientComments[c.nodeId] ??= []).push(c);
      set({ clientComments });
    },
    toggleSidebar: () => {
      if (!isPhone()) localStorage.setItem('notebase:sidebar', get().sidebar ? '0' : '1');
      set({ sidebar: !get().sidebar });
    },
    openDetails: (detailsId) => set({ detailsId, panel: 'details', menu: null }),
    setTagFilter: (tagFilter) => set({ tagFilter }),
    setTheme: (theme) => {
      localStorage.setItem('notebase:theme', theme);
      set({ theme });
    },

    patchCard: async (boardId, cardId, patch) => {
      if (!editable()) return;
      if (boardId === get().currentId) return get().updateData(cardId, patch);
      const content = await db.loadBoard(boardId);
      content.nodes = content.nodes.map((n) => (n.id === cardId ? { ...n, data: { ...n.data, ...patch } } : n));
      await db.saveBoard(boardId, content);
      touchBoard(boardId);
    },

    appendCard: async (boardId, card) => {
      if (boardId === get().currentId) {
        get().checkpoint();
        set({ nodes: [...get().nodes, card] });
        return;
      }
      const content = await db.loadBoard(boardId);
      content.nodes = [...content.nodes, card];
      await db.saveBoard(boardId, content);
      touchBoard(boardId);
    },

    ensureInbox: async () => {
      const existing = get().boards.find((b) => b.inbox);
      if (existing) return existing.id;
      const id = await get().createBoard({ name: 'Inbox', parentId: null, icon: '📥' });
      const boards = get().boards.map((b) => (b.id === id ? { ...b, inbox: true } : b));
      set({ boards });
      await db.saveIndex(boards);
      return id;
    },

    focusCard: async (boardId, cardId) => {
      if (boardId !== get().currentId) await get().openBoard(boardId);
      set({ focusId: cardId, panel: null });
    },
  };
});

// ---------- Persistence ----------

/** Mark a board edited (so it syncs) after changing it directly in IndexedDB. */
function touchBoard(id: string) {
  const boards = useStore.getState().boards.map((b) => (b.id === id ? { ...b, updatedAt: Date.now() } : b));
  useStore.setState({ boards });
  db.saveIndex(boards);
}

const cleanNodes = (nodes: CardNode[]) => nodes.map(({ selected, dragging, resizing, ...n }) => n as CardNode);
const cleanEdges = (edges: CardEdge[]) => edges.map(({ selected, ...e }) => e);
// Measured sizes differ slightly between devices, so they don't count as edits.
const contentKey = (nodes: CardNode[], edges: CardEdge[]) =>
  JSON.stringify([cleanNodes(nodes).map(({ measured, ...n }) => n), cleanEdges(edges)]);
const lastSaved = new Map<string, string>();
const markSaved = (id: string, nodes: CardNode[], edges: CardEdge[]) => lastSaved.set(id, contentKey(nodes, edges));

const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
/** Whether the given board has edits that haven't been written to IndexedDB yet. */
export const hasPendingSave = (id: string) => saveTimers.has(id);

useStore.subscribe((s, prev) => {
  if (s.currentId !== prev.currentId) return markSaved(s.currentId, s.nodes, s.edges);
  if (!s.ready || !s.currentId || s.readOnly) return;
  if (s.nodes === prev.nodes && s.edges === prev.edges && s.viewport === prev.viewport) return;
  const { currentId } = s;
  clearTimeout(saveTimers.get(currentId));
  saveTimers.set(
    currentId,
    setTimeout(async () => {
      saveTimers.delete(currentId);
      const { nodes, edges, viewport, currentId: open } = useStore.getState();
      if (open !== currentId) return;
      const clean = { nodes: cleanNodes(nodes), edges: cleanEdges(edges) };
      await db.saveBoard(currentId, { ...clean, viewport });
      // Only real content changes (not selection or panning) count as an edit.
      const json = contentKey(nodes, edges);
      if (lastSaved.get(currentId) === json) return;
      lastSaved.set(currentId, json);
      const boards = useStore.getState().boards.map((b) => (b.id === currentId ? { ...b, updatedAt: Date.now() } : b));
      useStore.setState({ boards });
      db.saveIndex(boards);
    }, 400),
  );
});

export const boardPath = (boards: BoardMeta[], id: string): BoardMeta[] => {
  const path: BoardMeta[] = [];
  let cur = boards.find((b) => b.id === id);
  while (cur) {
    path.unshift(cur);
    cur = cur.parentId ? boards.find((b) => b.id === cur!.parentId) : undefined;
  }
  return path;
};
