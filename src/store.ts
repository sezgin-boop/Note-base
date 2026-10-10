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
import * as db from './db';
import { buildTemplate, type TemplateId } from './templates';
import { makeCard } from './cards';
import type { BoardContent, BoardMeta, CardData, CardEdge, CardNode, CardType } from './types';

interface Snapshot {
  nodes: CardNode[];
  edges: CardEdge[];
}

export type Panel = 'jobs' | 'search' | null;

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

  init: () => Promise<void>;
  openBoard: (id: string) => Promise<void>;
  createBoard: (opts: { name: string; parentId: string | null; icon?: string; template?: TemplateId }) => Promise<string>;
  renameBoard: (id: string, patch: Partial<Pick<BoardMeta, 'name' | 'icon'>>) => void;
  removeBoard: (id: string) => Promise<void>;

  onNodesChange: (changes: NodeChange<CardNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<CardEdge>[]) => void;
  onConnect: (c: Connection) => void;
  setNodes: (fn: (nodes: CardNode[]) => CardNode[]) => void;
  setViewport: (v: BoardContent['viewport']) => void;

  addCard: (type: CardType, position: XYPosition, data?: CardData) => CardNode;
  updateData: (id: string, patch: Partial<CardData>) => void;
  checkpoint: () => void;
  undo: () => void;
  redo: () => void;
  duplicateSelected: () => void;
  deleteSelected: () => void;

  setLightbox: (l: State['lightbox']) => void;
  setPanel: (p: Panel) => void;
  toggleSidebar: () => void;
  focusCard: (boardId: string, cardId: string | null) => Promise<void>;
}

let pendingFocus: string | null = null;
/** True once for a freshly added card, so its main field can grab keyboard focus. */
export const takeFocus = (id: string) => pendingFocus === id;

let initPromise: Promise<void> | undefined;
let lastDataCheckpoint = { id: '', at: 0 };

export const useStore = create<State>((set, get) => {
  const snapshot = (): Snapshot => ({ nodes: get().nodes, edges: get().edges });

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
    sidebar: localStorage.getItem('notebase:sidebar') !== '0',
    focusId: null,

    init: () => (initPromise ??= (async () => {
      let boards = await db.loadIndex();
      set({ boards });
      if (!boards.length) {
        // First run: a home board with a sample video project inside it.
        const home = await get().createBoard({ name: 'Ana Pano', parentId: null, icon: '🏠', template: 'welcome' });
        const sample = await get().createBoard({
          name: 'Örnek: YouTube videosu',
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

    openBoard: async (id) => {
      const content = await db.loadBoard(id);
      localStorage.setItem('notebase:last', id);
      pendingFocus = null;
      set({
        currentId: id,
        nodes: content.nodes,
        edges: content.edges,
        viewport: content.viewport,
        past: [],
        future: [],
      });
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
      const boards = get().boards.map((b) => (b.id === id ? { ...b, ...patch } : b));
      set({ boards });
      db.saveIndex(boards);
    },

    removeBoard: async (id) => {
      const ids = new Set(collectDescendants(id));
      const parent = get().boards.find((b) => b.id === id)?.parentId ?? null;
      const boards = get().boards.filter((b) => !ids.has(b.id));
      await Promise.all([...ids].map(db.deleteBoard));
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
      if (changes.some((c) => c.type === 'remove')) get().checkpoint();
      set({ nodes: applyNodeChanges(changes, get().nodes) });
    },
    onEdgesChange: (changes) => {
      if (changes.some((c) => c.type === 'remove')) get().checkpoint();
      set({ edges: applyEdgeChanges(changes, get().edges) });
    },
    onConnect: (c) => {
      get().checkpoint();
      set({ edges: addEdge({ ...c, id: nanoid(10) }, get().edges) });
    },
    setNodes: (fn) => set({ nodes: fn(get().nodes) }),
    setViewport: (viewport) => set({ viewport }),

    addCard: (type, position, data) => {
      get().checkpoint();
      const node = { ...makeCard(type, position, data), selected: true };
      pendingFocus = node.id;
      set({ nodes: [...get().nodes.map((n) => ({ ...n, selected: false })), node] });
      return node;
    },

    updateData: (id, patch) => {
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
      if (!prev) return;
      set({ ...prev, past: past.slice(0, -1), future: [snapshot(), ...future] });
    },
    redo: () => {
      const { past, future } = get();
      const next = future[0];
      if (!next) return;
      set({ ...next, past: [...past, snapshot()], future: future.slice(1) });
    },

    duplicateSelected: () => {
      const selected = get().nodes.filter((n) => n.selected);
      if (!selected.length) return;
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
      const ids = new Set(get().nodes.filter((n) => n.selected).map((n) => n.id));
      if (!ids.size && !get().edges.some((e) => e.selected)) return;
      get().checkpoint();
      set({
        nodes: get().nodes.filter((n) => !ids.has(n.id)),
        edges: get().edges.filter((e) => !e.selected && !ids.has(e.source) && !ids.has(e.target)),
      });
    },

    setLightbox: (lightbox) => set({ lightbox }),
    setPanel: (panel) => set({ panel }),
    toggleSidebar: () => {
      localStorage.setItem('notebase:sidebar', get().sidebar ? '0' : '1');
      set({ sidebar: !get().sidebar });
    },
    focusCard: async (boardId, cardId) => {
      if (boardId !== get().currentId) await get().openBoard(boardId);
      set({ focusId: cardId, panel: null });
    },
  };
});

// Persist the open board shortly after any change.
const saveTimers = new Map<string, ReturnType<typeof setTimeout>>();
useStore.subscribe((s, prev) => {
  if (!s.ready || !s.currentId) return;
  if (s.currentId !== prev.currentId) return;
  if (s.nodes === prev.nodes && s.edges === prev.edges && s.viewport === prev.viewport) return;
  const { currentId, nodes, edges, viewport } = s;
  clearTimeout(saveTimers.get(currentId));
  saveTimers.set(currentId, setTimeout(() => {
    saveTimers.delete(currentId);
    const clean = nodes.map(({ selected, dragging, ...n }) => n as CardNode);
    db.saveBoard(currentId, { nodes: clean, edges: edges.map(({ selected, ...e }) => e), viewport });
    if (s.nodes !== prev.nodes || s.edges !== prev.edges) {
      const boards = useStore.getState().boards.map((b) => (b.id === currentId ? { ...b, updatedAt: Date.now() } : b));
      useStore.setState({ boards });
      db.saveIndex(boards);
    }
  }, 400));
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
