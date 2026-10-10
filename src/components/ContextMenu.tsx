import { NodeToolbar, Position, useReactFlow, type NodeProps } from '@xyflow/react';
import {
  ArrowDownToLine,
  CalendarDays,
  Pipette,
  ArrowUpToLine,
  Copy,
  ExternalLink,
  Maximize,
  MoreHorizontal,
  MousePointerSquareDashed,
  Pencil,
  Sparkles,
  Spline,
  Tag,
  Trash2,
  Unlink,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState, type ComponentType } from 'react';
import { addTyped } from '../actions';
import { addPaletteFor } from '../palette';
import { cardLabel } from '../share/outline';
import { useStore, type Background } from '../store';
import type { CardNode, CardType } from '../types';
import { ACCENTS } from '../types';
import { CardContext, CardMeta } from '../nodes/meta';

const OUTSIDE_META = new Set<CardType>(['heading', 'color', 'board']);
import { toast } from '../ui';
import { TOOLS } from './Toolbar';

const ACCENT_TYPES = new Set<CardType>(['note', 'todo', 'frame', 'scene', 'heading']);
/** Cards with the standard header, whose header text can be renamed. */
const LABEL_TYPES = new Set<CardType>(['note', 'todo', 'image', 'video', 'link', 'scene', 'project']);
const TEXT_TYPES = new Set<CardType>(['note', 'todo', 'scene', 'project', 'link']);

function Item({
  icon: Icon,
  label,
  onClick,
  danger,
  kbd,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  danger?: boolean;
  kbd?: string;
}) {
  const setMenu = useStore((s) => s.setMenu);
  return (
    <button
      className={`menu-item ${danger ? 'danger' : ''}`}
      onClick={() => {
        setMenu(null);
        onClick();
      }}
    >
      <Icon size={14} />
      <span>{label}</span>
      {kbd && <kbd>{kbd}</kbd>}
    </button>
  );
}

const nodeText = (n: CardNode) =>
  [
    n.data.title,
    n.data.text,
    n.data.caption,
    n.data.url,
    n.data.hex,
    ...(n.data.items ?? []).map((i) => `${i.done ? '☑' : '☐'} ${i.text}`),
  ]
    .filter(Boolean)
    .join('\n');

export function ContextMenu() {
  const s = useStore();
  const rf = useReactFlow();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const menu = s.menu;

  // Keep the menu on screen.
  useLayoutEffect(() => {
    if (!menu || !ref.current) return setPos(null);
    const r = ref.current.getBoundingClientRect();
    setPos({
      left: Math.max(8, Math.min(menu.x, window.innerWidth - r.width - 8)),
      top: Math.max(8, Math.min(menu.y, window.innerHeight - r.height - 8)),
    });
  }, [menu]);

  useEffect(() => {
    if (!menu) return;
    const close = (e: Event) => {
      if (ref.current?.contains(e.target as Node)) return;
      s.setMenu(null);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && s.setMenu(null);
    window.addEventListener('pointerdown', close, true);
    window.addEventListener('wheel', close, true);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', close, true);
      window.removeEventListener('wheel', close, true);
      window.removeEventListener('keydown', onKey);
    };
  }, [menu, s]);

  if (!menu) return null;

  const selected = s.nodes.filter((n) => n.selected);
  const node = menu.kind === 'node' ? s.nodes.find((n) => n.id === menu.id) : undefined;
  const edge = menu.kind === 'edge' ? s.edges.find((e) => e.id === menu.id) : undefined;
  const many = selected.length > 1;
  const ro = s.readOnly;

  let content: React.ReactNode = null;

  if (menu.kind === 'node' && node) {
    const board = node.type === 'board' ? s.boards.find((b) => b.id === node.data.boardId) : undefined;
    const showAccent = selected.every((n) => ACCENT_TYPES.has(n.type as CardType));
    content = (
      <>
        <div className="menu-head">
          {many ? `${selected.length} cards selected` : cardLabel(node, (id) => s.boards.find((b) => b.id === id)?.name)}
        </div>
        {board && <Item icon={ExternalLink} label="Open board" onClick={() => s.openBoard(board.id)} />}
        {board && !ro && (
          <Item
            icon={Pencil}
            label="Rename board"
            onClick={() => {
              const name = prompt('Board name', board.name);
              if (name?.trim()) s.renameBoard(board.id, { name: name.trim() });
            }}
          />
        )}
        {!ro && <Item icon={Copy} label="Duplicate" kbd="⌘D" onClick={s.duplicateSelected} />}
        {!ro && !many && <Item icon={CalendarDays} label="Schedule & tags…" onClick={() => s.openDetails(node.id)} />}
        {!ro && !many && LABEL_TYPES.has(node.type as CardType) && (
          <Item
            icon={Pencil}
            label="Rename header…"
            onClick={() => {
              const label = prompt('Card header (leave empty for the default)', node.data.label ?? '');
              if (label !== null) s.updateData(node.id, { label: label.trim() || undefined });
            }}
          />
        )}
        {!ro && !many && (node.type === 'image' || node.type === 'scene') && (node.data.mediaId || node.data.url) && (
          <Item icon={Pipette} label="Extract color palette" onClick={() => addPaletteFor(node)} />
        )}
        <Item
          icon={Copy}
          label="Copy text"
          onClick={() => {
            navigator.clipboard?.writeText(selected.map(nodeText).filter(Boolean).join('\n\n'));
            toast('Copied');
          }}
        />
        {!ro && showAccent && (
          <div className="menu-colors">
            {ACCENTS.map((c) => (
              <button
                key={c || 'none'}
                className="accent-dot"
                style={{ background: c || 'transparent' }}
                title={c || 'No color'}
                onClick={() => {
                  s.patchSelected((n) => ({ ...n, data: { ...n.data, color: c } }));
                  s.setMenu(null);
                }}
              />
            ))}
          </div>
        )}
        {!ro && selected.every((n) => TEXT_TYPES.has(n.type as CardType)) && (
          <div className="menu-row">
            <span>Text size</span>
            <div className="seg menu-seg">
              {(
                [
                  ['sm', 'S'],
                  [undefined, 'M'],
                  ['lg', 'L'],
                ] as const
              ).map(([v, l]) => (
                <button
                  key={l}
                  className={node.data.textSize === v ? 'on' : ''}
                  onClick={() => s.patchSelected((n) => ({ ...n, data: { ...n.data, textSize: v } }))}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
        )}
        {!ro && (
          <>
            <div className="menu-sep" />
            <Item
              icon={ArrowUpToLine}
              label="Bring to front"
              onClick={() => {
                const top = Math.max(0, ...s.nodes.map((n) => n.zIndex ?? 0));
                s.patchSelected((n) => ({ ...n, zIndex: n.type === 'frame' ? -1 : top + 1 }));
              }}
            />
            <Item
              icon={ArrowDownToLine}
              label="Send to back"
              onClick={() => {
                const bottom = Math.min(0, ...s.nodes.map((n) => n.zIndex ?? 0));
                s.patchSelected((n) => ({ ...n, zIndex: bottom - 1 }));
              }}
            />
            <Item
              icon={Unlink}
              label="Remove connections"
              onClick={() => {
                const ids = new Set(selected.map((n) => n.id));
                s.checkpoint();
                s.setEdges((es) => es.filter((e) => !ids.has(e.source) && !ids.has(e.target)));
              }}
            />
            <div className="menu-sep" />
            <Item
              icon={Trash2}
              label={many ? `Delete ${selected.length} cards` : 'Delete'}
              kbd="⌫"
              danger
              onClick={s.deleteSelected}
            />
          </>
        )}
      </>
    );
  } else if (menu.kind === 'edge' && edge && !ro) {
    content = (
      <>
        <div className="menu-head">Connection</div>
        <Item
          icon={Tag}
          label={edge.label ? 'Edit label' : 'Add label'}
          onClick={() => {
            const label = prompt('Connection label', String(edge.label ?? ''));
            if (label === null) return;
            s.checkpoint();
            s.setEdges((es) => es.map((e) => (e.id === edge.id ? { ...e, label: label.trim() || undefined } : e)));
          }}
        />
        <Item
          icon={Spline}
          label={edge.markerEnd ? 'Remove arrow' : 'Add arrow'}
          onClick={() => {
            s.checkpoint();
            s.setEdges((es) =>
              es.map((e) =>
                e.id === edge.id
                  ? { ...e, markerEnd: e.markerEnd ? undefined : { type: 'arrowclosed' as any, color: '#a1a1aa' } }
                  : e,
              ),
            );
          }}
        />
        <div className="menu-sep" />
        <Item
          icon={Trash2}
          label="Delete connection"
          danger
          onClick={() => {
            s.checkpoint();
            s.setEdges((es) => es.filter((e) => e.id !== edge.id));
          }}
        />
      </>
    );
  } else if (menu.kind === 'pane') {
    const at = menu.at ?? { x: 0, y: 0 };
    content = (
      <>
        {!ro && (
          <>
            <div className="menu-head">Add here</div>
            <div className="menu-grid">
              {TOOLS.map((t) => (
                <button
                  key={t.type}
                  className="menu-tile"
                  title={t.label}
                  onClick={() => {
                    s.setMenu(null);
                    addTyped(t.type, at);
                  }}
                >
                  {t.icon}
                  <span>{t.label.split(' ')[0]}</span>
                </button>
              ))}
            </div>
            <div className="menu-sep" />
            <Item icon={Sparkles} label="Paste from AI…" kbd="A" onClick={() => s.setPanel('ai')} />
            <Item
              icon={MousePointerSquareDashed}
              label="Select all"
              kbd="⌘A"
              onClick={() => s.setNodes((ns) => ns.map((n) => ({ ...n, selected: true })))}
            />
          </>
        )}
        <Item icon={Maximize} label="Fit to screen" onClick={() => rf.fitView({ padding: 0.2, duration: 400, maxZoom: 1 })} />
        <div className="menu-sep" />
        <div className="menu-head">Background</div>
        <div className="seg menu-seg">
          {(
            [
              ['dots', 'Dots'],
              ['grid', 'Grid'],
              ['none', 'Plain'],
            ] as [Background, string][]
          ).map(([v, l]) => (
            <button key={v} className={s.background === v ? 'on' : ''} onClick={() => s.setBackground(v)}>
              {l}
            </button>
          ))}
        </div>
      </>
    );
  }

  if (!content) return null;
  return (
    <div
      ref={ref}
      className="context-menu"
      style={pos ?? { left: menu.x, top: menu.y, visibility: 'hidden' }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {content}
    </div>
  );
}

/** Small floating actions above a single selected card — the touch-friendly way to delete or copy. */
function CardActions({ id }: { id: string }) {
  const s = useStore();
  const count = s.nodes.filter((n) => n.selected).length;
  if (s.readOnly || count !== 1) return null;
  return (
    <NodeToolbar position={Position.Top} offset={10} className="card-toolbar" isVisible>
      <button title="Duplicate" onClick={s.duplicateSelected}>
        <Copy size={14} />
      </button>
      <button title="Delete" className="danger" onClick={s.deleteSelected}>
        <Trash2 size={14} />
      </button>
      <button
        title="More"
        onClick={(e) => {
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          s.setMenu({ x: r.left, y: r.bottom + 6, kind: 'node', id });
        }}
      >
        <MoreHorizontal size={14} />
      </button>
    </NodeToolbar>
  );
}

export function withCardActions<P extends NodeProps<CardNode>>(Comp: ComponentType<P>) {
  return function WithActions(props: P) {
    return (
      <>
        {props.selected && <CardActions id={props.id} />}
        <CardContext.Provider value={props as unknown as CardNode}>
          <Comp {...props} />
        </CardContext.Provider>
        {/* Cards without the standard frame show their schedule/tags underneath. */}
        {OUTSIDE_META.has(props.type as CardType) && <CardMeta node={props as unknown as CardNode} outside />}
      </>
    );
  };
}
