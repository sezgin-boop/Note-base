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
import { useCallback, useEffect, useRef } from 'react';
import { addTyped } from '../actions';
import { isImageUrl, isVideoUrl, saveMedia } from '../db';
import { ImageNode, LinkNode, VideoNode } from '../nodes/MediaNodes';
import { HeadingNode, NoteNode, TodoNode } from '../nodes/TextNodes';
import { BoardNode, ColorNode, FrameNode, ProjectNode, SceneNode } from '../nodes/WorkNodes';
import { useStore } from '../store';
import type { CardNode, CardType } from '../types';

const nodeTypes: NodeTypes = {
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
};

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

export function Canvas() {
  const { nodes, edges, viewport, currentId, onNodesChange, onEdgesChange, onConnect, addCard, setNodes, setViewport, checkpoint } =
    useStore();
  const rf = useReactFlow();
  const { fromFiles, fromText } = useCreateFrom();
  const mouse = useRef<XYPosition>({ x: 0, y: 0 });
  const frameChildren = useRef(new Map<string, { start: XYPosition; kids: { id: string; start: XYPosition }[] }>());

  // Jump to a card picked from search or the jobs panel.
  const focusId = useStore((s) => s.focusId);
  useEffect(() => {
    if (!focusId) return;
    const t = setTimeout(() => {
      setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === focusId })));
      rf.fitView({ nodes: [{ id: focusId }], maxZoom: 1.1, duration: 500, padding: 0.4 });
      useStore.setState({ focusId: null });
    }, 60);
    return () => clearTimeout(t);
  }, [focusId, currentId, rf, setNodes]);

  // Paste images, files, links or text straight onto the board.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return;
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

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    const type = e.dataTransfer.getData('application/notebase') as CardType;
    if (type) {
      addTyped(type, at);
      return;
    }
    const files = [...e.dataTransfer.files];
    if (files.length) return void fromFiles(files, at);
    const uri = e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain');
    if (uri) fromText(uri.split('\n')[0], at);
  };

  const onNodeDragStart: OnNodeDrag<CardNode> = (_, __, dragged) => {
    checkpoint();
    frameChildren.current.clear();
    const draggedIds = new Set(dragged.map((n) => n.id));
    for (const frame of dragged.filter((n) => n.type === 'frame')) {
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

  const onNodeDrag: OnNodeDrag<CardNode> = (_, __, dragged) => {
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

  return (
    <div
      className="canvas"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
      onMouseMove={(e) => (mouse.current = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY }))}
      onDoubleClick={(e) => {
        if (!(e.target as HTMLElement).classList.contains('react-flow__pane')) return;
        const at = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
        addCard('note', { x: at.x - 130, y: at.y - 30 });
      }}
    >
      <ReactFlow
        key={currentId}
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeDragStart={onNodeDragStart}
        onNodeDrag={onNodeDrag}
        onNodeDragStop={() => frameChildren.current.clear()}
        onMoveEnd={(_, v) => setViewport(v)}
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
        minZoom={0.1}
        maxZoom={3}
        defaultEdgeOptions={{ type: 'default', interactionWidth: 20 }}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={24} size={1.2} color="var(--dots)" />
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
    </div>
  );
}
