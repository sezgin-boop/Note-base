import { nanoid } from 'nanoid';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  useConnection,
  useReactFlow,
  useStoreApi,
  useUpdateNodeInternals,
  type NodeTypes,
  type FinalConnectionState,
  type OnNodeDrag,
  type XYPosition,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { cardTags } from '../tags';
import { haptic, toast } from '../ui';
import { addTyped } from '../actions';
import { importFromAi } from '../ai/apply';
import { hasNotebaseBlock } from '../ai/importer';
import { isImageUrl, isVideoUrl, saveMedia } from '../db';
import { addMediaFiles, ImageNode, LinkNode, openPhotoViewer, savePhotos } from '../nodes/MediaNodes';
import { appendPhotos, clean, galleryOf } from '../gallery';
import { VideoNode } from '../nodes/VideoNode';
import { HeadingNode, NoteNode, TodoNode } from '../nodes/TextNodes';
import { BoardNode, ColorNode, FrameNode, ProjectNode, SceneNode } from '../nodes/WorkNodes';
import { BIG_BOARD, SELECTION, useStore } from '../store';
import { SectionDrawLayer } from './SectionDraw';
import { BOARD_DRAG, boardCardAt, dropTargetAt, highlightSlot, pointOf, settleSlot } from './dropTargets';
import { useDraw } from '../draw';
import { DrawNode } from '../nodes/DrawNode';
import { DrawOverlay, useDrawInput } from './DrawLayer';
import { create } from 'zustand';
import { sectionMembers } from '../sections';
import { ContextMenu, withCardActions } from './ContextMenu';
import type { CardEdge, CardNode, CardType, MediaRef } from '../types';

const nodeTypes = Object.fromEntries(
  Object.entries({
    note: NoteNode,
    heading: HeadingNode,
    todo: TodoNode,
    image: ImageNode,
    video: VideoNode,
    link: LinkNode,
    board: BoardNode,
    frame: FrameNode,
    scene: SceneNode,
    project: ProjectNode,
    color: ColorNode,
    draw: DrawNode,
  }).map(([k, C]) => [k, withCardActions(C)]),
) as NodeTypes;

// Props for React Flow that never change: new objects or functions on every render would make it
// redraw every card and arrow each time anything on the board changes.
const FIT_VIEW = { padding: 0.2, maxZoom: 1 };
const MOD_KEYS = ['Meta', 'Control'];
const EDGE_OPTIONS = { type: 'default', interactionWidth: 20 };
const PRO_OPTIONS = { hideAttribution: true };
const MINIMAP_SIZE = { width: 180, height: 120 };
const minimapColor = (n: { data: unknown }) => ((n.data as CardNode['data'])?.color as string) || 'var(--minimap-node)';

/** A callback that keeps the same identity across renders but always runs the latest code. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function useStable<T extends (...args: any[]) => any>(fn: T): T {
  const ref = useRef(fn);
  ref.current = fn;
  return useCallback(((...args) => ref.current(...args)) as T, []);
}

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Turn dropped / pasted things into cards. */
export function useCreateFrom() {
  const addCard = useStore((s) => s.addCard);
  const fromFiles = useCallback(
    async (files: File[], at: XYPosition) => {
      if (files.length === 1) {
        const [file] = files;
        const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
        if (kind) addCard(kind, at, { mediaId: await saveMedia(file), caption: file.name.replace(/\.[^.]+$/, '') });
        return;
      }
      // Several at once land in a grid instead of a pile.
      await addMediaFiles(files, at);
    },
    [addCard],
  );
  const fromText = useCallback(
    (text: string, at: XYPosition) => {
      const t = text.trim();
      if (!t) return;
      // A reply from an AI assistant with a ```notebase block becomes real cards.
      if (hasNotebaseBlock(t)) return importFromAi(t, at);
      if (/^https?:\/\/\S+$/.test(t)) {
        if (isImageUrl(t)) return addCard('image', at, { url: t });
        if (isVideoUrl(t)) return addCard('video', at, { url: t });
        return addCard('link', at, { url: t, title: new URL(t).hostname.replace(/^www\./, '') });
      }
      addCard('note', at, { text: t });
    },
    [addCard],
  );
  return { fromFiles, fromText };
}

type Flow = ReturnType<typeof useReactFlow<CardNode, CardEdge>>;

/**
 * The card an arrow being drawn should attach to at flow point `p` (magnetic): the card under it,
 * or the nearest one within `reach`. Sections only count near their edge, so an arrow dropped on
 * empty space inside a section doesn't grab the whole section. The arrow lands on the side facing
 * the card it comes from.
 */
function magnetTarget(rf: Flow, p: XYPosition, fromId: string, reach: number) {
  let best: { id: string; dist: number; area: number; frame: boolean } | null = null;
  for (const n of rf.getNodes()) {
    if (n.id === fromId || n.hidden) continue;
    const inner = rf.getInternalNode(n.id);
    const w = inner?.measured.width ?? n.width ?? 0;
    const h = inner?.measured.height ?? n.height ?? 0;
    if (!inner || !w || !h) continue;
    const { x, y } = inner.internals.positionAbsolute;
    const dx = Math.max(x - p.x, 0, p.x - (x + w));
    const dy = Math.max(y - p.y, 0, p.y - (y + h));
    const frame = n.type === 'frame';
    // Inside a section: how far from its border.
    const dist = frame && !dx && !dy ? Math.min(p.x - x, x + w - p.x, p.y - y, y + h - p.y) : Math.hypot(dx, dy);
    if (dist > reach) continue;
    const cand = { id: n.id, dist, area: w * h, frame };
    const better =
      !best ||
      (best.frame && !frame) ||
      (best.frame === frame && (dist < best.dist || (dist === best.dist && cand.area < best.area)));
    if (better) best = cand;
  }
  if (!best) return null;
  const to = rf.getInternalNode(best.id)!;
  const from = rf.getInternalNode(fromId);
  const tw = to.measured.width ?? 1;
  const th = to.measured.height ?? 1;
  const tc = { x: to.internals.positionAbsolute.x + tw / 2, y: to.internals.positionAbsolute.y + th / 2 };
  const fc = from
    ? {
        x: from.internals.positionAbsolute.x + (from.measured.width ?? 0) / 2,
        y: from.internals.positionAbsolute.y + (from.measured.height ?? 0) / 2,
      }
    : p;
  const vx = (fc.x - tc.x) / tw;
  const vy = (fc.y - tc.y) / th;
  const handle = Math.abs(vx) > Math.abs(vy) ? (vx > 0 ? 'r' : 'l') : vy > 0 ? 'b' : 't';
  return { id: best.id, handle };
}

/** How far (on screen) an arrow reaches for a card to snap to. */
const MAGNET_PX = 48;

/** While an arrow is drawn, light up the card it would attach to when let go. */
function ConnectMagnet() {
  const c = useConnection();
  const rf = useReactFlow<CardNode, CardEdge>();
  const lit = useRef<Element | null>(null);
  const px = c.inProgress ? c.pointer.x : null;
  const py = c.inProgress ? c.pointer.y : null;
  const fromId = c.inProgress ? c.fromNode.id : null;
  const snapped = c.inProgress && !!c.toHandle;
  useEffect(() => {
    let el: Element | null = null;
    if (px !== null && py !== null && fromId && !snapped) {
      const { x, y, zoom } = rf.getViewport();
      const t = magnetTarget(rf, { x: (px - x) / zoom, y: (py - y) / zoom }, fromId, MAGNET_PX / zoom);
      el = t ? document.querySelector(`.react-flow__node[data-id="${CSS.escape(t.id)}"]`) : null;
    }
    if (lit.current !== el) {
      lit.current?.classList.remove('magnet-target');
      el?.classList.add('magnet-target');
      lit.current = el;
    }
  }, [px, py, fromId, snapped, rf]);
  useEffect(() => () => lit.current?.classList.remove('magnet-target'), []);
  return null;
}

/** A board card dragged onto another board card: its board goes inside that one. */
async function dropBoardInto(cardId: string, targetCardId: string) {
  const s = useStore.getState();
  const card = s.nodes.find((n) => n.id === cardId);
  const target = s.nodes.find((n) => n.id === targetCardId);
  const id = card?.data.boardId;
  const into = target?.data.boardId;
  if (!id || !into || !s.canMoveBoard(id, into)) return false;
  await s.moveBoard(id, into);
  // The card may sit on a board that isn't the board's parent (a shortcut): it goes too.
  s.setNodes((ns) => ns.filter((n) => n.id !== cardId));
  s.setEdges((es) => es.filter((e) => e.source !== cardId && e.target !== cardId));
  return true;
}

/** What lights up on a board card (the node itself carries React Flow's position transform). */
const cardFace = (el: HTMLElement | null) => el?.querySelector<HTMLElement>('.board-card') ?? null;

/** The board card a dragged board card would go into, if any (lit up while hovering). */
function boardDropTarget(dragged: CardNode, x: number, y: number) {
  const s = useStore.getState();
  const el = boardCardAt(x, y, dragged.id);
  const into = el ? s.nodes.find((n) => n.id === el.dataset.id)?.data.boardId : undefined;
  const id = dragged.data.boardId;
  return el && id && into && s.canMoveBoard(id, into) ? el : null;
}

/**
 * Touch navigation that works wherever the fingers land. React Flow only pans and zooms when a
 * gesture starts on empty canvas: over a card the card's drag handler swallows the touches, and
 * text inside cards is excluded from panning. Here two fingers always pinch-zoom, and one finger
 * dragging over card text pans (a tap still edits the text; dragging the card elsewhere moves it).
 */
function useTouchNavigation(
  ref: React.RefObject<HTMLDivElement | null>,
  onEnd: (v: { x: number; y: number; zoom: number }) => void,
  onLiftDrop: (id: string, x: number, y: number) => void,
) {
  const rf = useReactFlow();
  const updateInternals = useUpdateNodeInternals();
  const flow = useStoreApi();
  // The zoom as a CSS variable, so resize handles can stay finger-sized when zoomed out.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let last = 0;
    const put = (z: number) => z !== last && el.style.setProperty('--z', String((last = z)));
    put(flow.getState().transform[2]);
    return flow.subscribe((s) => put(s.transform[2]));
  }, [ref, flow]);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Resize handles under a finger: React Flow's own resizer is fiddly with touch (the board pans or
    // the handle slips), so a finger on a handle resizes the card here, and nothing else moves.
    let sizing: {
      id: string;
      kind: 'heading' | 'grow' | 'free';
      x: number;
      y: number;
      zoom: number;
      left: boolean;
      right: boolean;
      top: boolean;
      bottom: boolean;
      w0: number;
      h0: number;
      pos0: XYPosition;
      minW: number;
      minH: number;
      font0: number;
    } | null = null;
    const startSizing = (ctl: HTMLElement, cardEl: HTMLElement, t: Touch) => {
      const s = useStore.getState();
      const node = s.nodes.find((n) => n.id === cardEl.dataset.id);
      if (!node || node.type === 'draw' || s.readOnly) return false;
      const box = cardEl.getBoundingClientRect();
      const zoom = rf.getViewport().zoom;
      const shell = cardEl.querySelector<HTMLElement>('.card');
      const text = cardEl.querySelector<HTMLElement>('.heading-text');
      const has = (c: string) => ctl.classList.contains(c);
      sizing = {
        id: node.id,
        kind: node.type === 'heading' ? 'heading' : shell?.dataset.resize === 'grow' ? 'grow' : 'free',
        x: t.clientX,
        y: t.clientY,
        zoom,
        left: has('left'),
        right: has('right'),
        top: has('top'),
        bottom: has('bottom'),
        w0: box.width / zoom,
        h0: box.height / zoom,
        pos0: node.position,
        minW: Number(shell?.dataset.minW) || (node.type === 'heading' ? 60 : 140),
        minH: Number(shell?.dataset.minH) || (node.type === 'heading' ? 20 : 60),
        font0: text ? parseFloat(getComputedStyle(text).fontSize) : 52,
      };
      s.checkpoint();
      (document.activeElement as HTMLElement | null)?.blur?.();
      document.body.classList.add('touch-sizing');
      cardEl.classList.add('sizing');
      haptic();
      return true;
    };
    const moveSizing = (t: Touch) => {
      if (!sizing) return;
      const z = sizing;
      const dx = (t.clientX - z.x) / z.zoom;
      const dy = (t.clientY - z.y) / z.zoom;
      const w = Math.round(Math.max(z.minW, z.right ? z.w0 + dx : z.left ? z.w0 - dx : z.w0));
      const h = Math.round(Math.max(z.minH, z.bottom ? z.h0 + dy : z.top ? z.h0 - dy : z.h0));
      const position = { x: z.left ? z.pos0.x + z.w0 - w : z.pos0.x, y: z.top ? z.pos0.y + z.h0 - h : z.pos0.y };
      const sized = z.left || z.right;
      useStore.getState().setNodes((ns) =>
        ns.map((n) => {
          if (n.id !== z.id) return n;
          const next = { ...n, position, ...(sized ? { width: w } : {}) };
          if (z.kind === 'heading') {
            if (z.top || z.bottom)
              next.data = { ...n.data, fontSize: Math.round(Math.min(260, Math.max(12, (z.font0 * h) / Math.max(z.h0, 1)))) };
          } else if (z.kind === 'grow') {
            if (z.top || z.bottom) next.data = { ...n.data, minH: h };
          } else if (z.top || z.bottom) next.height = h;
          return next;
        }),
      );
    };
    const endSizing = () => {
      if (!sizing) return;
      const id = sizing.id;
      sizing = null;
      document.body.classList.remove('touch-sizing');
      el.querySelector(`.react-flow__node[data-id="${CSS.escape(id)}"]`)?.classList.remove('sizing');
      // The card may have stopped at its text rather than at the finger: measure it again.
      requestAnimationFrame(() => updateInternals(id));
    };
    // Press and hold a card (anywhere on it, text too) to lift it and move it with one finger.
    let hold: {
      id: string;
      x: number;
      y: number;
      timer: ReturnType<typeof setTimeout>;
      lifted: boolean;
      grab?: XYPosition;
      moving?: { id: string; start: XYPosition }[];
      finger?: { x: number; y: number };
      raf?: number;
    } | null = null;
    const HOLD_FROM_NOT = 'button, a, select, .react-flow__handle, .react-flow__resize-control, input[type="range"], .format-bar';
    const cancelHold = () => {
      if (!hold) return;
      clearTimeout(hold.timer);
      if (hold.raf) cancelAnimationFrame(hold.raf);
      hold = null;
    };
    const flowAt = (x: number, y: number) => rf.screenToFlowPosition({ x, y });
    const placeLifted = () => {
      if (!hold?.lifted || !hold.finger || !hold.grab || !hold.moving) return;
      const p = flowAt(hold.finger.x, hold.finger.y);
      const dx = p.x - hold.grab.x;
      const dy = p.y - hold.grab.y;
      const moves = new Map(hold.moving.map((m) => [m.id, { x: m.start.x + dx, y: m.start.y + dy }]));
      useStore.getState().setNodes((ns) => ns.map((n) => (moves.has(n.id) ? { ...n, position: moves.get(n.id)! } : n)));
      const node = useStore.getState().nodes.find((n) => n.id === hold!.id);
      if (node?.type === 'image') highlightSlot(dropTargetAt(hold.finger.x, hold.finger.y, node.id));
      if (node?.type === 'board') highlightSlot(cardFace(boardDropTarget(node, hold.finger.x, hold.finger.y)));
    };
    // Near the screen edge, the board scrolls along so a card can travel far.
    const edgeScroll = () => {
      if (!hold?.lifted || !hold.finger) return;
      const r = el.getBoundingClientRect();
      const EDGE = 48;
      const speed = (d: number) => (d < EDGE ? ((EDGE - d) / EDGE) * 14 : 0);
      const vx = speed(hold.finger.x - r.left) - speed(r.right - hold.finger.x);
      const vy = speed(hold.finger.y - r.top) - speed(r.bottom - hold.finger.y);
      if (vx || vy) {
        const vp = rf.getViewport();
        rf.setViewport({ ...vp, x: vp.x + vx, y: vp.y + vy });
        placeLifted();
      }
      hold.raf = requestAnimationFrame(edgeScroll);
    };
    const lift = () => {
      if (!hold) return;
      const s = useStore.getState();
      const node = s.nodes.find((n) => n.id === hold!.id);
      if (!node) return cancelHold();
      hold.lifted = true;
      haptic();
      (document.activeElement as HTMLElement | null)?.blur?.();
      s.checkpoint();
      // A section carries the cards inside it.
      const kids = node.type === 'frame' ? (node.data.collapsed ? (node.data.members ?? []) : sectionMembers(node, s.nodes)) : [];
      const ids = new Set([node.id, ...kids]);
      hold.moving = s.nodes.filter((n) => ids.has(n.id)).map((n) => ({ id: n.id, start: n.position }));
      hold.grab = flowAt(hold.x, hold.y);
      hold.finger = { x: hold.x, y: hold.y };
      useLift.setState({ id: node.id, phase: 'lifted' });
      hold.raf = requestAnimationFrame(edgeScroll);
    };
    let start: { dist: number; mid: XYPosition; vp: { x: number; y: number; zoom: number } } | null = null;
    // Stays on until every finger is lifted, so the finger left behind doesn't drag a card.
    let active = false;
    const measure = (t: TouchList) => {
      const r = el.getBoundingClientRect();
      const [a, b] = [t[0], t[1]];
      return {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY) || 1,
        mid: { x: (a.clientX + b.clientX) / 2 - r.left, y: (a.clientY + b.clientY) / 2 - r.top },
      };
    };
    // One-finger pan over text, which the canvas would otherwise ignore.
    let pan: { x: number; y: number; vp: { x: number; y: number; zoom: number }; moving: boolean } | null = null;
    const PAN_FROM = '.react-flow__node .nodrag';
    // Cards themselves carry "nopan"; only "nopan" parts inside a card (format bar…) opt out.
    const NOT_FROM =
      'button, a, select, .card .nopan, .nowheel, .react-flow__handle, .react-flow__resize-control, input[type="range"]';
    const onStart = (e: TouchEvent) => {
      const target = e.target as HTMLElement;
      cancelHold();
      if (sizing) {
        // A second finger while resizing: stop resizing and let the fingers pinch.
        endSizing();
      } else if (e.touches.length === 1 && !active) {
        const ctl = target.closest('.react-flow__resize-control') as HTMLElement | null;
        const cardEl = ctl?.closest('.react-flow__node') as HTMLElement | null;
        if (ctl && cardEl && startSizing(ctl, cardEl, e.touches[0])) {
          e.preventDefault();
          e.stopPropagation();
          pan = null;
          return;
        }
      }
      if (e.touches.length === 1 && !active) {
        const editing =
          (target === document.activeElement && target.matches('input, textarea')) ||
          !!target.closest('[contenteditable="true"]');
        const card = target.closest('.react-flow__node') as HTMLElement | null;
        const st = useStore.getState();
        // The move handle under a selected card lifts it at once, no holding needed.
        if (card && target.closest('.move-grip')) {
          e.preventDefault();
          e.stopPropagation();
          const t = e.touches[0];
          hold = { id: card.dataset.id!, x: t.clientX, y: t.clientY, timer: setTimeout(() => {}, 0), lifted: false };
          lift();
          pan = null;
          return;
        }
        if (card && !editing && !st.readOnly && !useDraw.getState().tool && !target.closest(HOLD_FROM_NOT)) {
          const t = e.touches[0];
          hold = { id: card.dataset.id!, x: t.clientX, y: t.clientY, timer: setTimeout(lift, 350), lifted: false };
        }
        pan =
          !editing && !useDraw.getState().tool && target.closest(PAN_FROM) && !target.closest(NOT_FROM)
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY, vp: rf.getViewport(), moving: false }
            : null;
        return;
      }
      pan = null;
      if (e.touches.length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      // Two fingers on a photo: open it full screen to zoom the photo, not the board.
      const photoOf = (t: Touch) =>
        (document.elementFromPoint(t.clientX, t.clientY)?.closest('[data-photo-of]') as HTMLElement | null) ?? null;
      const [p1, p2] = [photoOf(e.touches[0]), photoOf(e.touches[1])];
      if (p1 && p1 === p2 && !useDraw.getState().tool) {
        cancelHold();
        start = null;
        openPhotoViewer(p1.dataset.photoOf!, Number(p1.dataset.photoIndex) || 0);
        return;
      }
      start = { ...measure(e.touches), vp: rf.getViewport() };
    };
    const onMove = (e: TouchEvent) => {
      if (sizing && e.touches.length === 1) {
        e.preventDefault();
        e.stopPropagation();
        moveSizing(e.touches[0]);
        return;
      }
      if (hold) {
        const t = e.touches[0];
        if (hold.lifted && e.touches.length === 1) {
          e.preventDefault();
          e.stopPropagation();
          hold.finger = { x: t.clientX, y: t.clientY };
          placeLifted();
          return;
        }
        // Moved before the hold completed: it's a pan / drag after all.
        if (e.touches.length > 1 || Math.hypot(t.clientX - hold.x, t.clientY - hold.y) > 8) cancelHold();
      }
      if (pan && e.touches.length === 1) {
        const dx = e.touches[0].clientX - pan.x;
        const dy = e.touches[0].clientY - pan.y;
        if (!pan.moving && Math.hypot(dx, dy) < 8) return;
        pan.moving = true;
        e.preventDefault();
        e.stopPropagation();
        rf.setViewport({ ...pan.vp, x: pan.vp.x + dx, y: pan.vp.y + dy });
        return;
      }
      if (!active) return;
      e.preventDefault();
      e.stopPropagation();
      if (!start || e.touches.length < 2) return;
      const { dist, mid } = measure(e.touches);
      const zoom = Math.min(3, Math.max(0.1, start.vp.zoom * (dist / start.dist)));
      // Keep the point that was under the fingers under the fingers (and follow them as they move).
      const fx = (start.mid.x - start.vp.x) / start.vp.zoom;
      const fy = (start.mid.y - start.vp.y) / start.vp.zoom;
      rf.setViewport({ x: mid.x - fx * zoom, y: mid.y - fy * zoom, zoom });
    };
    const onEndTouch = (e: TouchEvent) => {
      if (sizing) {
        e.preventDefault(); // no tap → no edit mode after a resize
        e.stopPropagation();
        endSizing();
        return;
      }
      if (hold) {
        const lifted = hold.lifted ? hold : null;
        cancelHold();
        if (lifted) {
          e.preventDefault(); // no tap → no edit mode after a move
          highlightSlot(null);
          useLift.setState({ phase: 'dropped' });
          setTimeout(() => useLift.getState().phase === 'dropped' && useLift.setState({ id: null, phase: null }), 450);
          onLiftDrop(lifted.id, lifted.finger?.x ?? lifted.x, lifted.finger?.y ?? lifted.y);
          pan = null;
          return;
        }
      }
      if (pan) {
        if (pan.moving) {
          e.preventDefault(); // no tap → no edit mode after a pan
          onEnd(rf.getViewport());
        }
        pan = null;
      }
      if (!active) return;
      if (e.touches.length >= 2) {
        start = { ...measure(e.touches), vp: rf.getViewport() };
        return;
      }
      start = null;
      if (e.touches.length === 0) {
        active = false;
        onEnd(rf.getViewport());
      }
    };
    // Safari's own page zoom gesture.
    const noGesture = (e: Event) => e.preventDefault();
    // A long press shows the browser's menu on Android; while holding a card it means "move" instead.
    const noMenu = (e: Event) => {
      if (hold) {
        e.preventDefault();
        e.stopPropagation();
      }
    };
    el.addEventListener('contextmenu', noMenu, true);
    const opts = { capture: true, passive: false };
    el.addEventListener('touchstart', onStart, opts);
    el.addEventListener('touchmove', onMove, opts);
    el.addEventListener('touchend', onEndTouch, opts);
    el.addEventListener('touchcancel', onEndTouch, opts);
    el.addEventListener('gesturestart', noGesture);
    return () => {
      el.removeEventListener('touchstart', onStart, opts);
      el.removeEventListener('touchmove', onMove, opts);
      el.removeEventListener('touchend', onEndTouch, opts);
      el.removeEventListener('touchcancel', onEndTouch, opts);
      el.removeEventListener('gesturestart', noGesture);
      el.removeEventListener('contextmenu', noMenu, true);
      cancelHold();
    };
  }, [ref, rf, onEnd, onLiftDrop, updateInternals]);
}

/** The card being moved by press-and-hold (for its lifted / dropped look). */
const useLift = create<{ id: string | null; phase: 'lifted' | 'dropped' | null }>(() => ({ id: null, phase: null }));

export function Canvas() {
  const {
    nodes,
    edges,
    viewport,
    currentId,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addCard,
    setNodes,
    setEdges,
    setViewport,
    checkpoint,
    readOnly,
    background,
    setMenu,
    selectOnly,
    tagFilter,
    fx,
  } = useStore();
  // Tag filter (matching cards stay, the rest fade back) and section fold / unfold animations.
  const lift = useLift();
  const shownNodes = useMemo(
    () =>
      nodes.map((n) => {
        const dim = tagFilter && n.type !== 'frame' && !cardTags(n).includes(tagFilter);
        const f = fx[n.id];
        const lifted = lift.id === n.id ? lift.phase : null;
        if (!dim && !f && !lifted) return n;
        return {
          ...n,
          className: [dim && 'dimmed', f && `nb-${f.k}`, lifted && `touch-${lifted}`].filter(Boolean).join(' '),
          ...(f
            ? { style: { ...n.style, '--d': `${f.d}ms`, '--tx': `${f.tx}px`, '--ty': `${f.ty}px` } as React.CSSProperties }
            : {}),
        };
      }),
    [nodes, tagFilter, fx, lift],
  );
  // Arrows of cards inside folded sections are hidden too (React Flow misses some when it only
  // renders what's on screen, as on phones).
  const shownEdges = useMemo(() => {
    const hidden = new Set(nodes.filter((n) => n.hidden).map((n) => n.id));
    if (!hidden.size && !Object.keys(fx).length) return edges;
    return edges.map((e) => {
      if (hidden.has(e.source) || hidden.has(e.target)) return e.hidden ? e : { ...e, hidden: true };
      const k =
        fx[e.source]?.k === 'out' || fx[e.target]?.k === 'out'
          ? 'out'
          : fx[e.source]?.k === 'in' || fx[e.target]?.k === 'in'
            ? 'in'
            : null;
      return k ? { ...e, className: `nb-edge-${k}` } : e;
    });
  }, [nodes, edges, fx]);
  const rf = useReactFlow();
  const { fromFiles, fromText } = useCreateFrom();
  const mouse = useRef<XYPosition>({ x: 0, y: 0 });
  const frameChildren = useRef(new Map<string, { start: XYPosition; kids: { id: string; start: XYPosition }[] }>());

  // Jump to a card picked from search or the jobs panel.
  const focusId = useStore((s) => s.focusId);
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      if (focusId === SELECTION) {
        // Freshly inserted cards are already selected: bring all of them into view.
        const ids = useStore
          .getState()
          .nodes.filter((n) => n.selected)
          .map((n) => ({ id: n.id }));
        rf.fitView({ nodes: ids, maxZoom: 1, duration: 500, padding: 0.15 });
      } else {
        setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === focusId })));
        rf.fitView({ nodes: [{ id: focusId }], maxZoom: 1.1, duration: 500, padding: 0.4 });
      }
      useStore.setState({ focusId: null });
    }, 150);
    return () => clearTimeout(t);
  }, [focusId, currentId, rf, setNodes]);

  // Paste images, files, links or text straight onto the board.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target) || useStore.getState().readOnly) return;
      const files = [...(e.clipboardData?.files ?? [])];
      const at = mouse.current;
      if (files.length) {
        e.preventDefault();
        fromFiles(files, at);
        return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      // With one note, heading, scene or list selected, the text goes into it, like typing would.
      // That's also where dictation apps such as Wispr Flow paste what you said.
      const s = useStore.getState();
      const sel = s.nodes.filter((n) => n.selected);
      const target = sel.length === 1 && ['note', 'heading', 'scene', 'todo'].includes(sel[0].type!) ? sel[0] : null;
      if (target && !/^https?:\/\/\S+$/.test(text.trim())) {
        s.checkpoint();
        if (target.type === 'todo') {
          const items = text
            .split(/\r?\n/)
            .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim())
            .filter(Boolean)
            .map((t) => ({ id: nanoid(6), text: t, done: false }));
          s.updateData(target.id, { items: [...(target.data.items ?? []).filter((i) => i.text.trim()), ...items] });
        } else {
          const prev = target.data.text ?? '';
          const sep = target.type === 'heading' ? ' ' : '\n';
          s.updateData(target.id, { text: prev.trim() ? `${prev.replace(/\s+$/, '')}${sep}${text.trim()}` : text.trim() });
        }
        return;
      }
      fromText(text, at);
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [fromFiles, fromText]);

  /** Give a card's picture slot (scene frame, empty image / video card) a picture. */
  /** Photos dropped on a picture slot join that card's photos (an empty slot takes them as its first). */
  const fillSlot = (cardId: string, media: MediaRef[], removeId?: string) => {
    setNodes((ns) =>
      ns
        .filter((n) => n.id !== removeId)
        .map((n) => {
          if (n.id !== cardId) return n;
          const patch = appendPhotos(n.data, media);
          if (n.type === 'scene') delete patch.caption;
          return { ...n, data: clean({ ...n.data, ...patch }) };
        }),
    );
    if (removeId) setEdges((es) => es.filter((e) => e.source !== removeId && e.target !== removeId));
    settleSlot(cardId);
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    highlightSlot(null);
    if (readOnly) return;
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    // A board dragged from the sidebar: it goes inside the open board (or the board card it lands on).
    const boardId = e.dataTransfer.getData(BOARD_DRAG);
    if (boardId) {
      const s = useStore.getState();
      const card = boardCardAt(e.clientX, e.clientY);
      const into = card ? s.nodes.find((n) => n.id === card.dataset.id)?.data.boardId : undefined;
      if (into && into !== boardId && s.canMoveBoard(boardId, into)) return s.moveBoard(boardId, into);
      if (s.canMoveBoard(boardId, s.currentId)) return s.moveBoard(boardId, s.currentId, { x: at.x - 110, y: at.y - 60 });
      return toast('A board can’t go inside itself or its own sub-boards');
    }
    const type = e.dataTransfer.getData('application/notebase') as CardType;
    if (type) {
      addTyped(type, at);
      return;
    }
    const files = [...e.dataTransfer.files];
    // Onto a picture slot: the first fitting file fills it, any others become cards as usual.
    const slot = dropTargetAt(e.clientX, e.clientY);
    if (slot) {
      const kind = slot.dataset.dropKind ?? 'image';
      const fits = files.filter((f) => f.type.startsWith(`${kind}/`));
      const uri = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0].trim();
      if (fits.length) {
        checkpoint();
        // Every photo joins the card; a video slot takes one video.
        const used = kind === 'image' ? fits : fits.slice(0, 1);
        if (kind === 'image') fillSlot(slot.dataset.dropTarget!, await savePhotos(used));
        else {
          const target = slot.dataset.dropTarget!;
          useStore
            .getState()
            .updateData(target, { mediaId: await saveMedia(used[0]), caption: used[0].name.replace(/\.[^.]+$/, '') });
          settleSlot(target);
        }
        const rest = files.filter((f) => !used.includes(f));
        if (rest.length) fromFiles(rest, at);
        return;
      }
      if (!files.length && /^https?:\/\//.test(uri)) {
        // A picture dragged from another website: keep a copy when the site allows it, else link to it.
        checkpoint();
        const blob = await fetch(uri)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
        if (blob?.type.startsWith(`${kind}/`)) fillSlot(slot.dataset.dropTarget!, [{ mediaId: await saveMedia(blob) }]);
        else fillSlot(slot.dataset.dropTarget!, [{ url: uri }]);
        return;
      }
    }
    if (files.length) return void fromFiles(files, at);
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri) fromText(uri.split('\n')[0], at);
  };

  const onNodeDragStart: OnNodeDrag<CardNode> = (_, __, dragged) => {
    checkpoint();
    frameChildren.current.clear();
    const draggedIds = new Set(dragged.map((n) => n.id));
    for (const frame of dragged.filter((n) => n.type === 'frame')) {
      // A folded section carries the cards it holds (they are hidden, so geometry can't tell).
      if (frame.data.collapsed) {
        const members = new Set(frame.data.members ?? []);
        const kids = nodes
          .filter((n) => members.has(n.id) && !draggedIds.has(n.id))
          .map((n) => ({ id: n.id, start: n.position }));
        frameChildren.current.set(frame.id, { start: frame.position, kids });
        continue;
      }
      const fw = frame.measured?.width ?? frame.width ?? 0;
      const fh = frame.measured?.height ?? frame.height ?? 0;
      const kids = nodes
        .filter((n) => !draggedIds.has(n.id) && n.id !== frame.id)
        .filter((n) => {
          const w = n.measured?.width ?? n.width ?? 0;
          const h = n.measured?.height ?? n.height ?? 0;
          return (
            n.position.x >= frame.position.x &&
            n.position.y >= frame.position.y &&
            n.position.x + w <= frame.position.x + fw &&
            n.position.y + h <= frame.position.y + fh
          );
        })
        .map((n) => ({ id: n.id, start: n.position }));
      frameChildren.current.set(frame.id, { start: frame.position, kids });
    }
  };

  /** A single image card with a picture, which can be dropped into a picture slot. */
  const imageBeingDropped = (dragged: CardNode[]) =>
    dragged.length === 1 && dragged[0].type === 'image' && (dragged[0].data.mediaId || dragged[0].data.url) ? dragged[0] : null;

  const onNodeDrag: OnNodeDrag<CardNode> = (e, __, dragged) => {
    if (dragged.length === 1 && dragged[0].type === 'board') {
      const { x, y } = pointOf(e as unknown as MouseEvent);
      highlightSlot(cardFace(boardDropTarget(dragged[0], x, y)));
    }
    const img = imageBeingDropped(dragged);
    if (img) {
      const { x, y } = pointOf(e as unknown as MouseEvent);
      const slot = dropTargetAt(x, y, img.id);
      const fits = slot && (slot.dataset.dropKind ?? 'image') === 'image' ? slot : null;
      highlightSlot(fits);
      document.querySelector(`.react-flow__node[data-id="${img.id}"]`)?.classList.toggle('dropping', !!fits);
    }
    if (!frameChildren.current.size) return;
    const moves = new Map<string, XYPosition>();
    for (const frame of dragged) {
      const info = frameChildren.current.get(frame.id);
      if (!info) continue;
      const dx = frame.position.x - info.start.x;
      const dy = frame.position.y - info.start.y;
      for (const k of info.kids) moves.set(k.id, { x: k.start.x + dx, y: k.start.y + dy });
    }
    setNodes((ns) => ns.map((n) => (moves.has(n.id) ? { ...n, position: moves.get(n.id)! } : n)));
  };

  const canvasRef = useRef<HTMLDivElement>(null);
  const phone = useMemo(() => matchMedia('(max-width: 720px), (pointer: coarse)').matches, []);
  // Big boards (hundreds of cards) only draw what's on screen, on every device.
  const bigBoard = useStore((s) => s.nodes.length > BIG_BOARD);
  const onLiftDrop = useCallback(
    (id: string, x: number, y: number) => {
      const s = useStore.getState();
      const node = s.nodes.find((n) => n.id === id);
      if (!node) return;
      // An image card held over a picture slot goes into it; otherwise it just lands (and is selected).
      const slot = node.type === 'image' && (node.data.mediaId || node.data.url) ? dropTargetAt(x, y, id) : null;
      if (slot && (slot.dataset.dropKind ?? 'image') === 'image')
        return fillSlot(slot.dataset.dropTarget!, galleryOf(node.data), id);
      const into = node.type === 'board' ? boardDropTarget(node, x, y) : null;
      if (into) return void dropBoardInto(id, into.dataset.id!);
      s.selectOnly(id);
    },
    // fillSlot only uses the store's setters, which never change
    [],
  );
  useTouchNavigation(canvasRef, setViewport, onLiftDrop);
  useDrawInput(canvasRef);
  const drawTool = useDraw((s) => s.tool);

  return (
    <div
      ref={canvasRef}
      className={`canvas ${readOnly ? 'read-only' : ''} ${drawTool ? `drawing tool-${drawTool}` : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // Files or web pictures (not toolbar cards) light up the picture slot under the pointer.
        const types = [...e.dataTransfer.types];
        if (types.includes(BOARD_DRAG)) {
          e.dataTransfer.dropEffect = 'move';
          return highlightSlot(cardFace(boardCardAt(e.clientX, e.clientY)));
        }
        if (!readOnly && !types.includes('application/notebase') && (types.includes('Files') || types.includes('text/uri-list')))
          highlightSlot(dropTargetAt(e.clientX, e.clientY));
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) highlightSlot(null);
      }}
      onDrop={onDrop}
      onMouseMove={(e) => (mouse.current = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))}
      onDoubleClick={(e) => {
        if (readOnly || !(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
        const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addCard('note', { x: at.x - 130, y: at.y - 30 });
      }}
    >
      <ReactFlow
        key={currentId}
        nodes={shownNodes}
        edges={shownEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        connectionRadius={36}
        // Let go over a card (or close to it) and the arrow attaches itself, no need to hit the dot.
        onConnectEnd={useStable((e: MouseEvent | TouchEvent, state: FinalConnectionState) => {
          document.querySelectorAll('.magnet-target').forEach((el) => el.classList.remove('magnet-target'));
          if (state.isValid || !state.fromNode || !state.fromHandle) return;
          const { x, y } = pointOf(e);
          const zoom = rf.getViewport().zoom;
          const t = magnetTarget(rf as unknown as Flow, rf.screenToFlowPosition({ x, y }), state.fromNode.id, MAGNET_PX / zoom);
          if (!t) return;
          const source = state.fromNode.id;
          const exists = useStore
            .getState()
            .edges.some((ed) => (ed.source === source && ed.target === t.id) || (ed.source === t.id && ed.target === source));
          if (exists) return;
          onConnect({ source, sourceHandle: state.fromHandle.id ?? null, target: t.id, targetHandle: t.handle });
        })}
        onNodeDragStart={useStable(onNodeDragStart)}
        onNodeDrag={useStable(onNodeDrag)}
        onNodeDragStop={useStable<OnNodeDrag<CardNode>>((e, _, dragged) => {
          frameChildren.current.clear();
          const img = imageBeingDropped(dragged);
          highlightSlot(null);
          document.querySelectorAll('.react-flow__node.dropping').forEach((el) => el.classList.remove('dropping'));
          if (dragged.length === 1 && dragged[0].type === 'board') {
            const { x, y } = pointOf(e as unknown as MouseEvent);
            const into = boardDropTarget(dragged[0], x, y);
            if (into) void dropBoardInto(dragged[0].id, into.dataset.id!);
            return;
          }
          if (!img) return;
          const { x, y } = pointOf(e as unknown as MouseEvent);
          const slot = dropTargetAt(x, y, img.id);
          if (!slot || (slot.dataset.dropKind ?? 'image') !== 'image') return;
          // The image moves into the slot (one undo step: the drag already saved a checkpoint).
          fillSlot(slot.dataset.dropTarget!, galleryOf(img.data), img.id);
        })}
        onMoveEnd={useStable((_: unknown, v: { x: number; y: number; zoom: number }) => setViewport(v))}
        onNodeContextMenu={useStable((e: React.MouseEvent, node: CardNode) => {
          e.preventDefault();
          if (!node.selected) selectOnly(node.id);
          setMenu({ x: e.clientX, y: e.clientY, kind: 'node', id: node.id });
        })}
        onSelectionContextMenu={useStable((e: React.MouseEvent, sel: CardNode[]) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'node', id: sel[0]?.id });
        })}
        onEdgeContextMenu={useStable((e: React.MouseEvent, edge: CardEdge) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'edge', id: edge.id });
        })}
        onPaneContextMenu={useStable((e: React.MouseEvent | MouseEvent) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'pane', at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
        })}
        nodesDraggable={!readOnly && !drawTool}
        nodesConnectable={!readOnly && !drawTool}
        elementsSelectable={!drawTool}
        panOnDrag={!drawTool}
        edgesReconnectable={!readOnly}
        defaultViewport={viewport}
        fitView={!viewport}
        fitViewOptions={FIT_VIEW}
        connectionMode={ConnectionMode.Loose}
        elevateNodesOnSelect={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={MOD_KEYS}
        panOnScroll
        zoomActivationKeyCode={MOD_KEYS}
        // Phones: keep only the cards on screen in the page, so big boards stay within memory.
        onlyRenderVisibleElements={phone || bigBoard}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={EDGE_OPTIONS}
        proOptions={PRO_OPTIONS}
      >
        <DrawOverlay />
        {background === 'dots' && <Background variant={BackgroundVariant.Dots} gap={22} size={1.7} color="var(--dots)" />}
        {background === 'grid' && <Background variant={BackgroundVariant.Lines} gap={32} lineWidth={1} color="var(--grid)" />}
        <MiniMap
          pannable
          zoomable
          className="minimap"
          style={MINIMAP_SIZE}
          maskColor="var(--minimap-mask)"
          nodeColor={minimapColor}
          nodeBorderRadius={6}
        />
        <ConnectMagnet />
      </ReactFlow>
      {!readOnly && <SectionDrawLayer />}
      <ContextMenu />
    </div>
  );
}
