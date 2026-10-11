import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  useReactFlow,
  type NodeTypes,
  type OnNodeDrag,
  type XYPosition,
} from '@xyflow/react';
import { useCallback, useEffect, useMemo, useRef } from 'react';
import { cardTags } from '../tags';
import { addTyped } from '../actions';
import { importFromAi } from '../ai/apply';
import { hasNotebaseBlock } from '../ai/importer';
import { isImageUrl, isVideoUrl, saveMedia } from '../db';
import { ImageNode, LinkNode } from '../nodes/MediaNodes';
import { VideoNode } from '../nodes/VideoNode';
import { HeadingNode, NoteNode, TodoNode } from '../nodes/TextNodes';
import { BoardNode, ColorNode, FrameNode, ProjectNode, SceneNode } from '../nodes/WorkNodes';
import { SELECTION, useStore } from '../store';
import { dropTargetAt, highlightSlot, pointOf, settleSlot } from './dropTargets';
import { ContextMenu, withCardActions } from './ContextMenu';
import type { CardNode, CardType } from '../types';

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
  }).map(([k, C]) => [k, withCardActions(C)]),
) as NodeTypes;

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/** Turn dropped / pasted things into cards. */
export function useCreateFrom() {
  const addCard = useStore((s) => s.addCard);
  const fromFiles = useCallback(
    async (files: File[], at: XYPosition) => {
      let offset = 0;
      for (const file of files) {
        const kind = file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null;
        if (!kind) continue;
        const mediaId = await saveMedia(file);
        addCard(kind, { x: at.x + offset, y: at.y + offset }, { mediaId, caption: file.name.replace(/\.[^.]+$/, '') });
        offset += 30;
      }
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

/**
 * Touch navigation that works wherever the fingers land. React Flow only pans and zooms when a
 * gesture starts on empty canvas: over a card the card's drag handler swallows the touches, and
 * text inside cards is excluded from panning. Here two fingers always pinch-zoom, and one finger
 * dragging over card text pans (a tap still edits the text; dragging the card elsewhere moves it).
 */
function useTouchNavigation(
  ref: React.RefObject<HTMLDivElement | null>,
  onEnd: (v: { x: number; y: number; zoom: number }) => void,
) {
  const rf = useReactFlow();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
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
      if (e.touches.length === 1 && !active) {
        const editing = target === document.activeElement && target.matches('input, textarea');
        pan =
          !editing && target.closest(PAN_FROM) && !target.closest(NOT_FROM)
            ? { x: e.touches[0].clientX, y: e.touches[0].clientY, vp: rf.getViewport(), moving: false }
            : null;
        return;
      }
      pan = null;
      if (e.touches.length < 2) return;
      e.preventDefault();
      e.stopPropagation();
      active = true;
      start = { ...measure(e.touches), vp: rf.getViewport() };
    };
    const onMove = (e: TouchEvent) => {
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
    };
  }, [ref, rf, onEnd]);
}

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
  const shownNodes = useMemo(
    () =>
      nodes.map((n) => {
        const dim = tagFilter && n.type !== 'frame' && !cardTags(n).includes(tagFilter);
        const f = fx[n.id];
        if (!dim && !f) return n;
        return {
          ...n,
          className: [dim && 'dimmed', f && `nb-${f.k}`].filter(Boolean).join(' '),
          ...(f
            ? { style: { ...n.style, '--d': `${f.d}ms`, '--tx': `${f.tx}px`, '--ty': `${f.ty}px` } as React.CSSProperties }
            : {}),
        };
      }),
    [nodes, tagFilter, fx],
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
      if (text) {
        e.preventDefault();
        fromText(text, at);
      }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
  }, [fromFiles, fromText]);

  /** Give a card's picture slot (scene frame, empty image / video card) a picture. */
  const fillSlot = (cardId: string, media: { mediaId?: string; url?: string; caption?: string }, removeId?: string) => {
    setNodes((ns) =>
      ns
        .filter((n) => n.id !== removeId)
        .map((n) => {
          if (n.id !== cardId) return n;
          const data = { ...n.data, mediaId: media.mediaId, url: media.url };
          if (n.type !== 'scene' && media.caption && !n.data.caption) data.caption = media.caption;
          for (const k of ['mediaId', 'url'] as const) if (data[k] === undefined) delete data[k];
          return { ...n, data };
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
      const fits = files.find((f) => f.type.startsWith(`${kind}/`));
      const uri = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0].trim();
      if (fits) {
        checkpoint();
        fillSlot(slot.dataset.dropTarget!, { mediaId: await saveMedia(fits), caption: fits.name.replace(/\.[^.]+$/, '') });
        const rest = files.filter((f) => f !== fits);
        if (rest.length) fromFiles(rest, at);
        return;
      }
      if (!files.length && /^https?:\/\//.test(uri)) {
        // A picture dragged from another website: keep a copy when the site allows it, else link to it.
        checkpoint();
        const blob = await fetch(uri)
          .then((r) => (r.ok ? r.blob() : null))
          .catch(() => null);
        if (blob?.type.startsWith(`${kind}/`)) fillSlot(slot.dataset.dropTarget!, { mediaId: await saveMedia(blob) });
        else fillSlot(slot.dataset.dropTarget!, { url: uri });
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
  useTouchNavigation(canvasRef, setViewport);

  return (
    <div
      ref={canvasRef}
      className={`canvas ${readOnly ? 'read-only' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
        // Files or web pictures (not toolbar cards) light up the picture slot under the pointer.
        const types = [...e.dataTransfer.types];
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
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={(e, _, dragged) => {
          frameChildren.current.clear();
          const img = imageBeingDropped(dragged);
          highlightSlot(null);
          document.querySelectorAll('.react-flow__node.dropping').forEach((el) => el.classList.remove('dropping'));
          if (!img) return;
          const { x, y } = pointOf(e as unknown as MouseEvent);
          const slot = dropTargetAt(x, y, img.id);
          if (!slot || (slot.dataset.dropKind ?? 'image') !== 'image') return;
          // The image moves into the slot (one undo step: the drag already saved a checkpoint).
          fillSlot(slot.dataset.dropTarget!, { mediaId: img.data.mediaId, url: img.data.url, caption: img.data.caption }, img.id);
        }}
        onMoveEnd={(_, v) => setViewport(v)}
        onNodeContextMenu={(e, node) => {
          e.preventDefault();
          if (!node.selected) selectOnly(node.id);
          setMenu({ x: e.clientX, y: e.clientY, kind: 'node', id: node.id });
        }}
        onSelectionContextMenu={(e, sel) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'node', id: sel[0]?.id });
        }}
        onEdgeContextMenu={(e, edge) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'edge', id: edge.id });
        }}
        onPaneContextMenu={(e) => {
          e.preventDefault();
          setMenu({ x: e.clientX, y: e.clientY, kind: 'pane', at: rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }) });
        }}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        edgesReconnectable={!readOnly}
        defaultViewport={viewport}
        fitView={!viewport}
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        connectionMode={ConnectionMode.Loose}
        elevateNodesOnSelect={false}
        zoomOnDoubleClick={false}
        deleteKeyCode={null}
        selectionKeyCode="Shift"
        multiSelectionKeyCode={['Meta', 'Control']}
        panOnScroll
        zoomActivationKeyCode={['Meta', 'Control']}
        // Phones: keep only the cards on screen in the page, so big boards stay within memory.
        onlyRenderVisibleElements={phone}
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{ type: 'default', interactionWidth: 20 }}
        proOptions={{ hideAttribution: true }}
      >
        {background === 'dots' && <Background variant={BackgroundVariant.Dots} gap={22} size={1.7} color="var(--dots)" />}
        {background === 'grid' && <Background variant={BackgroundVariant.Lines} gap={32} lineWidth={1} color="var(--grid)" />}
        <MiniMap
          pannable
          zoomable
          className="minimap"
          style={{ width: 180, height: 120 }}
          maskColor="var(--minimap-mask)"
          nodeColor={(n) => ((n.data as any)?.color as string) || 'var(--minimap-node)'}
          nodeBorderRadius={6}
        />
      </ReactFlow>
      <ContextMenu />
    </div>
  );
}
