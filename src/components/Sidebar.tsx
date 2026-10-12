import { ThemePicker } from './ThemePicker';
import {
  Share,
  Briefcase,
  CalendarDays,
  ChevronRight,
  Cloud,
  CloudOff,
  Download,
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
import { exportWorkspace, importWorkspace } from '../db';
import { isPhone, useStore, type Panel } from '../store';
import { TEMPLATES, type TemplateId } from '../templates';
import type { BoardMeta } from '../types';

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

function TreeItem({ board, depth }: { board: BoardMeta; depth: number }) {
  const { boards, currentId, openBoard, renameBoard, removeBoard, readOnly } = useStore();
  const children = boards.filter((b) => b.parentId === board.id);
  const [open, setOpen] = useState(depth === 0);
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState(false);
  const active = board.id === currentId;
  return (
    <>
      <div
        className={`tree-item ${active ? 'active' : ''}`}
        style={{ paddingLeft: 8 + depth * 14 }}
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
      <div className="tree">
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
