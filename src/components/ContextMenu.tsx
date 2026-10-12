import { NodeToolbar, Position, useReactFlow, useViewport, type NodeProps } from '@xyflow/react';
import {
  Move,
  LayoutTemplate,
  ArrowDownToLine,
  CalendarDays,
  Pipette,
  ArrowUpToLine,
  Copy,
  ExternalLink,
  FoldVertical,
  ClipboardPaste,
  Paintbrush,
  Image as ImageIcon,
  UnfoldVertical,
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
import { DRAW_COLORS, DRAW_SIZES, paint, useDraw } from '../draw';
import { SECTION_LOOKS } from '../sections';
import { copiedSkin, copySkin, SKIN_TYPES } from './StylePanel';
import { cardLabel } from '../share/outline';
import { useStore, type Background } from '../store';
import type { CardNode, CardType } from '../types';
import { ACCENTS, TEXT_SIZES } from '../types';
import { CardContext, CardMeta } from '../nodes/meta';

const OUTSIDE_META = new Set<CardType>(['heading', 'color', 'board']);
import { toast } from '../ui';
import { TOOLS } from './Toolbar';

const SECTION_ICONS = ['🎬', '🎞️', '📱', '🎥', '✍️', '💡', '🎯', '📌', '🔥', '⭐', '💼', '🗂️', '🎨', '🎵', '📅', '✅'];

const ACCENT_TYPES = new Set<CardType>(['note', 'todo', 'frame', 'scene', 'heading']);
/** Cards with the standard header, whose header text can be renamed. */
const LABEL_TYPES = new Set<CardType>(['note', 'todo', 'image', 'video', 'link', 'scene', 'project']);
const TEXT_TYPES = new Set<CardType>(['note', 'heading', 'todo', 'scene', 'project', 'link']);

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
    const frames = (selected.length ? selected : [node]).filter((n) => n.type === 'frame');
    const folded = frames.some((f) => f.data.collapsed);
    const drawings = (selected.length ? selected : [node]).every((n) => n.type === 'draw');
    const onlyFrames = frames.length > 0 && frames.length === (selected.length || 1);
    const scenes = (selected.length ? selected : [node]).filter((n) => n.type === 'scene');
    const framesHidden = scenes.length > 0 && scenes.every((n) => n.data.hideFrame);
    const allScenes = s.nodes.filter((n) => n.type === 'scene');
    const styleable = (selected.length ? selected : [node]).every((n) => SKIN_TYPES.has(n.type as CardType));
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
        {frames.length > 0 && (
          <Item
            icon={folded ? UnfoldVertical : FoldVertical}
            label={`${folded ? 'Expand' : 'Collapse'} section${frames.length > 1 ? 's' : ''}`}
            kbd="↵"
            onClick={() =>
              s.toggleSections(
                frames.map((f) => f.id),
                folded,
              )
            }
          />
        )}
        {!ro && styleable && <Item icon={Paintbrush} label="Card style…" onClick={() => s.setPanel('style')} />}
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
        {!ro && scenes.length > 0 && (
          <Item
            icon={ImageIcon}
            label={`${framesHidden ? 'Show' : 'Hide'} frame${scenes.length > 1 ? 's' : ''}`}
            onClick={() =>
              s.patchSelected((n) =>
                n.type === 'scene' ? { ...n, data: { ...n.data, hideFrame: !framesHidden || undefined } } : n,
              )
            }
          />
        )}
        {!ro && scenes.length > 0 && allScenes.length > scenes.length && (
          <Item
            icon={ImageIcon}
            label={`${framesHidden ? 'Show' : 'Hide'} frames on all ${allScenes.length} scenes`}
            onClick={() => {
              s.checkpoint();
              s.setNodes((ns) =>
                ns.map((n) => (n.type === 'scene' ? { ...n, data: { ...n.data, hideFrame: !framesHidden || undefined } } : n)),
              );
            }}
          />
        )}
        {!ro && !many && (node.type === 'image' || node.type === 'scene') && (node.data.mediaId || node.data.url) && (
          <Item icon={Pipette} label="Extract color palette" onClick={() => addPaletteFor(node)} />
        )}
        {!ro && styleable && !many && node.data.skin && (
          <Item icon={Paintbrush} label="Copy style" onClick={() => copySkin(node)} />
        )}
        {!ro && styleable && copiedSkin() && (
          <Item
            icon={ClipboardPaste}
            label="Paste style"
            onClick={() =>
              s.patchSelected((n) => (SKIN_TYPES.has(n.type as CardType) ? { ...n, data: { ...n.data, skin: copiedSkin() } } : n))
            }
          />
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
        {!ro && drawings && (
          <>
            <div className="menu-colors">
              {DRAW_COLORS.map((c) => (
                <button
                  key={c}
                  className="accent-dot"
                  style={{ background: paint(c) }}
                  title={c === 'ink' ? 'Ink' : c}
                  onClick={() => {
                    s.patchSelected((n) => (n.type === 'draw' ? { ...n, data: { ...n.data, stroke: c } } : n));
                    s.setMenu(null);
                  }}
                />
              ))}
            </div>
            <div className="menu-row">
              <span>{node.data.shape === 'text' ? 'Text size' : 'Thickness'}</span>
              <div className="seg menu-seg">
                {DRAW_SIZES.map((sz, i) => (
                  <button
                    key={sz}
                    className={node.data.size === sz ? 'on' : ''}
                    onClick={() => s.patchSelected((n) => (n.type === 'draw' ? { ...n, data: { ...n.data, size: sz } } : n))}
                  >
                    {['S', 'M', 'L'][i]}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {!ro && onlyFrames && (
          <>
            <div className="menu-head">Section icon</div>
            <div className="menu-emoji">
              {SECTION_ICONS.map((e) => (
                <button
                  key={e}
                  className={node.data.icon === e ? 'on' : ''}
                  onClick={() => {
                    s.patchSelected((n) => (n.type === 'frame' ? { ...n, data: { ...n.data, icon: e } } : n));
                    s.setMenu(null);
                  }}
                >
                  {e}
                </button>
              ))}
              {node.data.icon && (
                <button
                  className="none"
                  title="No icon"
                  onClick={() => {
                    s.patchSelected((n) => {
                      const { icon, ...data } = n.data;
                      return n.type === 'frame' ? { ...n, data } : n;
                    });
                    s.setMenu(null);
                  }}
                >
                  ✕
                </button>
              )}
            </div>
            <div className="menu-row">
              <span>Style</span>
              <div className="seg menu-seg">
                {SECTION_LOOKS.map((l) => (
                  <button
                    key={l.id}
                    className={(node.data.look ?? 'tint') === l.id ? 'on' : ''}
                    onClick={() => s.patchSelected((n) => (n.type === 'frame' ? { ...n, data: { ...n.data, look: l.id } } : n))}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </>
        )}
        {!ro && selected.every((n) => TEXT_TYPES.has(n.type as CardType)) && (
          <div className="menu-row">
            <span>Text size</span>
            <div className="seg menu-seg">
              {TEXT_SIZES.map(([v, , l]) => (
                <button
                  key={l}
                  className={node.data.textSize === v && !node.data.fontSize ? 'on' : ''}
                  onClick={() => s.patchSelected((n) => ({ ...n, data: { ...n.data, textSize: v, fontSize: undefined } }))}
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
            <Item icon={LayoutTemplate} label="Template…" onClick={() => s.setPanel('templates')} />
            <Item
              icon={MousePointerSquareDashed}
              label="Select all"
              kbd="⌘A"
              onClick={() => s.setNodes((ns) => ns.map((n) => ({ ...n, selected: !n.hidden })))}
            />
          </>
        )}
        <Item icon={Maximize} label="Fit to screen" onClick={() => rf.fitView({ padding: 0.2, duration: 400, maxZoom: 1 })} />
        {s.nodes.some((n) => n.type === 'frame' && !n.data.collapsed && !n.hidden) && (
          <Item icon={FoldVertical} label="Collapse all sections" onClick={() => s.setAllSections(false)} />
        )}
        {s.nodes.some((n) => n.type === 'frame' && n.data.collapsed) && (
          <Item icon={UnfoldVertical} label="Expand all sections" onClick={() => s.setAllSections(true)} />
        )}
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
    // The toolbar takes its layer from the card (+1); sections sit at the back (-1), which would put
    // it under the canvas where it can't be clicked. Keep it on top of everything.
    <NodeToolbar position={Position.Top} offset={10} className="card-toolbar" isVisible style={{ zIndex: 2000 }}>
      <button title="Duplicate" onClick={s.duplicateSelected}>
        <Copy size={14} />
      </button>
      {SKIN_TYPES.has(s.nodes.find((n) => n.id === id)?.type as CardType) && (
        <button
          title="Card style"
          className={s.panel === 'style' ? 'on' : ''}
          onClick={() => s.setPanel(s.panel === 'style' ? null : 'style')}
        >
          <Paintbrush size={14} />
        </button>
      )}
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

/**
 * A handle under a selected card: grab it to move the card right away (on phones there's no need
 * to press and hold, and no risk of scrolling the board or starting to type instead).
 */
function MoveGrip() {
  const readOnly = useStore((s) => s.readOnly);
  const drawing = useDraw((s) => !!s.tool);
  // Stays finger-sized when the board is zoomed out.
  const zoom = useViewport().zoom;
  if (readOnly || drawing) return null;
  return (
    <div className="move-grip" title="Drag to move" style={zoom < 1 ? { scale: String(1 / zoom) } : undefined}>
      <Move size={14} />
      <span>Move</span>
    </div>
  );
}

export function withCardActions<P extends NodeProps<CardNode>>(Comp: ComponentType<P>) {
  return function WithActions(flowProps: P) {
    // The card's data straight from the app's store. React Flow hands nodes their props one render
    // later; with those, a text field would briefly get its old text back while you type, which
    // throws the caret to the end (e.g. after deleting a selected word in the middle of a note).
    const live = useStore((s) => s.nodes.find((n) => n.id === flowProps.id)?.data);
    const props = live && live !== flowProps.data ? { ...flowProps, data: live } : flowProps;
    return (
      <>
        {props.selected && <CardActions id={props.id} />}
        {props.selected && <MoveGrip />}
        <CardContext.Provider value={props as unknown as CardNode}>
          <Comp {...props} />
        </CardContext.Provider>
        {/* Cards without the standard frame show their schedule/tags underneath. */}
        {OUTSIDE_META.has(props.type as CardType) && <CardMeta node={props as unknown as CardNode} outside />}
      </>
    );
  };
}
