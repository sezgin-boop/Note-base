import { ThemePicker } from './ThemePicker';
import {
  Share,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
  FolderInput,
  Plus,
  Search,
  Smartphone,
  Trash2,
  Upload,
  Zap,
} from 'lucide-react';
import { cloudConfigured } from '../cloud';
import { useCloud } from '../sync';
import { SyncLabel, useCanInstall } from './Dialogs';
import { useState } from 'react';
import { BOARD_DRAG } from './dropTargets';
import { exportWorkspace, importWorkspace } from '../db';
import { isPhone, useStore, type Panel } from '../store';
import type { BoardMeta } from '../types';
import { TEMPLATES, type TemplateId } from '../templates';

const EMOJIS = [
  '📁',
  '🏠',
  '🎬',
  '🎥',
  '✂️',
  '🎨',
  '💡',
  '🗓️',
  '💼',
  '📸',
  '🎵',
  '🚀',
  '📝',
  '⭐',
  '🔥',
  '🌙',
  '🧠',
  '📦',
  '🎯',
  '💰',
  '📣',
  '🛠️',
  '🌈',
  '🍿',
];

export function EmojiPicker({ onPick, onClose }: { onPick: (e: string) => void; onClose: () => void }) {
  return (
    <>
      <div className="backdrop-clear" onClick={onClose} />
      <div className="emoji-pop">
        {EMOJIS.map((e) => (
          <button key={e} onClick={() => (onPick(e), onClose())}>
            {e}
          </button>
        ))}
      </div>
    </>
  );
}

/** The board being dragged in the sidebar (dataTransfer can't be read while hovering). */
let draggingBoard: string | null = null;

/** Drag-and-drop props that put the dragged board inside `parentId` (null: the top level). */
function useBoardDrop(parentId: string | null, onDrop?: () => void) {
  const [over, setOver] = useState(false);
  const fits = () => !!draggingBoard && draggingBoard !== parentId && useStore.getState().canMoveBoard(draggingBoard, parentId);
  return {
    over,
    props: {
      onDragOver: (e: React.DragEvent) => {
        if (!e.dataTransfer.types.includes(BOARD_DRAG) || !fits()) return;
        e.preventDefault();
        e.stopPropagation();
        e.dataTransfer.dropEffect = 'move';
        setOver(true);
      },
      onDragLeave: (e: React.DragEvent) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(false);
      },
      onDrop: (e: React.DragEvent) => {
        setOver(false);
        const id = e.dataTransfer.getData(BOARD_DRAG);
        if (!id) return;
        e.preventDefault();
        e.stopPropagation();
        draggingBoard = null;
        useStore.getState().moveBoard(id, parentId);
        onDrop?.();
      },
    },
  };
}

/** "Move to…": every board this one may go into, as an indented list, plus the top level. */
function MovePicker({ board, onClose }: { board: BoardMeta; onClose: () => void }) {
  const { boards, canMoveBoard, moveBoard } = useStore();
  const rows: { b: BoardMeta; depth: number }[] = [];
  const walk = (parent: string | null, depth: number) =>
    boards
      .filter((b) => (b.parentId ?? null) === parent)
      .forEach((b) => {
        rows.push({ b, depth });
        walk(b.id, depth + 1);
      });
  walk(null, 0);
  const pick = (parentId: string | null) => {
    onClose();
    moveBoard(board.id, parentId);
  };
  return (
    <>
      <div className="backdrop-clear" onClick={(e) => (e.stopPropagation(), onClose())} />
      <div className="move-picker" onClick={(e) => e.stopPropagation()}>
        <div className="menu-head">Move “{board.name}” into…</div>
        {board.parentId && (
          <button onClick={() => pick(null)}>
            <span className="t-icon">⬆️</span> Top level
          </button>
        )}
        {rows.map(({ b, depth }) => {
          const ok = b.id !== board.parentId && canMoveBoard(board.id, b.id);
          return (
            <button key={b.id} disabled={!ok} style={{ paddingLeft: 10 + depth * 14 }} onClick={() => pick(b.id)}>
              <span className="t-icon">{b.icon}</span> {b.name}
              {b.id === board.parentId && <small> · here now</small>}
            </button>
          );
        })}
      </div>
    </>
  );
}

function TreeItem({ board, depth }: { board: BoardMeta; depth: number }) {
  const { boards, currentId, openBoard, renameBoard, removeBoard, readOnly } = useStore();
  const children = boards.filter((b) => b.parentId === board.id);
  const [open, setOpen] = useState(depth === 0);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const [moving, setMoving] = useState(false);
  // Dropping a board here opens this one, so the board just put inside shows.
  const drop = useBoardDrop(board.id, () => setOpen(true));
  const active = board.id === currentId;
  return (
    <>
      <div
        className={`tree-item ${active ? 'active' : ''} ${drop.over ? 'drop-into' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
        draggable={!readOnly && !editing}
        onDragStart={(e) => {
          draggingBoard = board.id;
          e.dataTransfer.setData(BOARD_DRAG, board.id);
          e.dataTransfer.effectAllowed = 'move';
        }}
        onDragEnd={() => (draggingBoard = null)}
        {...(readOnly ? {} : drop.props)}
        onClick={() => {
          openBoard(board.id);
          if (isPhone()) useStore.getState().toggleSidebar();
        }}
        onDoubleClick={() => !readOnly && setEditing(true)}
      >
        <button
          className={`chev ${open ? 'open' : ''} ${children.length ? '' : 'hidden'}`}
          onClick={(e) => (e.stopPropagation(), setOpen(!open))}
        >
          <ChevronRight size={12} />
        </button>
        <span className="tree-icon-wrap">
          <button className="tree-icon" onClick={(e) => (e.stopPropagation(), !readOnly && setPicker(true))}>
            {board.icon}
          </button>
          {picker && <EmojiPicker onPick={(icon) => renameBoard(board.id, { icon })} onClose={() => setPicker(false)} />}
        </span>
        {editing ? (
          <input
            autoFocus
            className="tree-input"
            defaultValue={board.name}
            onClick={(e) => e.stopPropagation()}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name && name !== board.name) renameBoard(board.id, { name });
              setEditing(false);
            }}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span className="tree-name">{board.name}</span>
        )}
        {!readOnly && (
          <button
            className="tree-del tree-move"
            title="Move into another board"
            onClick={(e) => (e.stopPropagation(), setMoving(true))}
          >
            <FolderInput size={12} />
          </button>
        )}
        {moving && <MovePicker board={board} onClose={() => setMoving(false)} />}
        {!readOnly && (
          <button
            className="tree-del"
            title="Delete board"
            onClick={(e) => {
              e.stopPropagation();
              const sub = children.length ? ' and all its sub-boards' : '';
              if (confirm(`Delete "${board.name}"${sub}? This can't be undone.`)) removeBoard(board.id);
            }}
          >
            <Trash2 size={12} />
          </button>
        )}
      </div>
      {open && children.map((c) => <TreeItem key={c.id} board={c} depth={depth + 1} />)}
    </>
  );
}

export function Sidebar() {
  const { boards, createBoard, openBoard, setPanel, panel, readOnly } = useStore();
  const [menu, setMenu] = useState(false);
  // On phones the sidebar covers the screen, so close it when opening a view from it.
  const go = (p: Panel) => {
    setPanel(p);
    if (isPhone() && useStore.getState().sidebar) useStore.getState().toggleSidebar();
  };
  const user = useCloud((c) => c.user);
  const canInstall = useCanInstall();
  const roots = boards.filter((b) => !b.parentId);
  // Dropped on the list itself (not on a board): back to the top level.
  const rootDrop = useBoardDrop(null);

  const newBoard = async (template?: TemplateId, name = 'New board', icon = '📁') => {
    setMenu(false);
    const id = await createBoard({ name, parentId: null, icon, template });
    await openBoard(id);
    if (isPhone()) useStore.getState().toggleSidebar();
  };

  const doExport = async () => {
    const blob = await exportWorkspace();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `notebase-yedek-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
  };

  const doImport = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'application/json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        await importWorkspace(file);
        location.reload();
      } catch (err) {
        alert(`Couldn't restore: ${(err as Error).message}`);
      }
    };
    input.click();
  };

  return (
    <aside className="sidebar">
      <div className="brand">
        <span className="logo">
          <svg viewBox="0 0 32 32" width="22" height="22">
            <circle cx="9" cy="16" r="3.2" fill="currentColor" />
            <circle cx="23" cy="9" r="3.2" fill="#a78bfa" />
            <circle cx="23" cy="23" r="3.2" fill="#34d399" />
            <path d="M12 16C17 16 16 9 20 9M12 16C17 16 16 23 20 23" stroke="currentColor" strokeWidth="1.6" fill="none" />
          </svg>
        </span>
        Notebase
      </div>

      {!readOnly && (
        <>
          <button className="side-btn" onClick={() => go('capture')}>
            <Zap size={15} /> Quick capture <kbd>Q</kbd>
          </button>
          <button className="side-btn" onClick={() => go(panel === 'search' ? null : 'search')}>
            <Search size={15} /> Search <kbd>⌘K</kbd>
          </button>
          <button
            className={`side-btn ${panel === 'calendar' ? 'on' : ''}`}
            onClick={() => go(panel === 'calendar' ? null : 'calendar')}
          >
            <CalendarDays size={15} /> Calendar <kbd>⌘⇧C</kbd>
          </button>
          <button className={`side-btn ${panel === 'jobs' ? 'on' : ''}`} onClick={() => go(panel === 'jobs' ? null : 'jobs')}>
            <Briefcase size={15} /> Jobs <kbd>⌘J</kbd>
          </button>
        </>
      )}

      <div className="side-section">
        <span>Boards</span>
        {!readOnly && (
          <button className="icon-btn" title="New board" onClick={() => setMenu(!menu)}>
            <Plus size={14} />
          </button>
        )}
      </div>
      {menu && (
        <div className="template-menu">
          <button onClick={() => newBoard()}>
            <span className="t-icon">📄</span>
            <span>
              <b>Blank board</b>
              <small>Start from scratch</small>
            </span>
          </button>
          {TEMPLATES.filter((t) => ['reels', 'youtube', 'brand'].includes(t.id)).map((t) => (
            <button key={t.id} onClick={() => newBoard(t.id, t.name, t.icon)}>
              <span className="t-icon">{t.icon}</span>
              <span>
                <b>{t.name}</b>
                <small>{t.desc}</small>
              </span>
            </button>
          ))}
          <button
            onClick={() => {
              setMenu(false);
              setPanel('templates');
            }}
          >
            <span className="t-icon">🗂️</span>
            <span>
              <b>All templates…</b>
              <small>{TEMPLATES.length} templates — or add one to the open board</small>
            </span>
          </button>
        </div>
      )}
      <div className={`tree ${rootDrop.over ? 'drop-root' : ''}`} {...(readOnly ? {} : rootDrop.props)}>
        {roots.map((b) => (
          <TreeItem key={b.id} board={b} depth={0} />
        ))}
      </div>

      {readOnly ? (
        <a className="side-btn" href="/" target="_blank" rel="noreferrer">
          ✨ Make your own board
        </a>
      ) : (
        <>
          <button className="side-btn cloud-btn" onClick={() => setPanel('account')}>
            {user ? <Cloud size={15} /> : <CloudOff size={15} />}
            <span className="cloud-text">
              {user ? user.email : 'Cloud sync'}
              <small>{user ? <SyncLabel /> : cloudConfigured ? 'Sign in — same boards everywhere' : 'Off'}</small>
            </span>
          </button>
          <button className="side-btn" onClick={() => setPanel('phone')}>
            <Share size={15} /> Save from your phone
          </button>
          {canInstall && (
            <button className="side-btn" onClick={() => setPanel('install')}>
              <Smartphone size={15} /> Install as app
            </button>
          )}
          <div className="side-footer">
            <ThemePicker variant="side" />
            <button className="side-btn" onClick={doExport} title="Back up all boards and media to one file">
              <Download size={14} /> Back up
            </button>
            <button className="side-btn" onClick={doImport} title="Restore from a backup file">
              <Upload size={14} /> Restore
            </button>
          </div>
        </>
      )}
    </aside>
  );
}
