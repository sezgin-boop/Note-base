import { Briefcase, ChevronRight, Download, Plus, Search, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { exportWorkspace, importWorkspace } from '../db';
import { useStore } from '../store';
import { TEMPLATES, type TemplateId } from '../templates';
import type { BoardMeta } from '../types';

const EMOJIS = ['📁', '🏠', '🎬', '🎥', '✂️', '🎨', '💡', '🗓️', '💼', '📸', '🎵', '🚀', '📝', '⭐', '🔥', '🌙', '🧠', '📦', '🎯', '💰', '📣', '🛠️', '🌈', '🍿'];

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
  const { boards, currentId, openBoard, renameBoard, removeBoard } = useStore();
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
        onClick={() => openBoard(board.id)}
        onDoubleClick={() => setEditing(true)}
      >
        <button
          className={`chev ${open ? 'open' : ''} ${children.length ? '' : 'hidden'}`}
          onClick={(e) => (e.stopPropagation(), setOpen(!open))}
        >
          <ChevronRight size={12} />
        </button>
        <span className="tree-icon-wrap">
          <button className="tree-icon" onClick={(e) => (e.stopPropagation(), setPicker(true))}>
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
            onBlur={(e) => (renameBoard(board.id, { name: e.target.value || board.name }), setEditing(false))}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
          />
        ) : (
          <span className="tree-name">{board.name}</span>
        )}
        <button
          className="tree-del"
          title="Panoyu sil"
          onClick={(e) => {
            e.stopPropagation();
            const sub = children.length ? ' ve tüm alt panoları' : '';
            if (confirm(`"${board.name}"${sub} silinsin mi? Bu geri alınamaz.`)) removeBoard(board.id);
          }}
        >
          <Trash2 size={12} />
        </button>
      </div>
      {open && children.map((c) => <TreeItem key={c.id} board={c} depth={depth + 1} />)}
    </>
  );
}

export function Sidebar() {
  const { boards, createBoard, openBoard, setPanel, panel } = useStore();
  const [menu, setMenu] = useState(false);
  const roots = boards.filter((b) => !b.parentId);

  const newBoard = async (template?: TemplateId, name = 'Yeni pano', icon = '📁') => {
    setMenu(false);
    const id = await createBoard({ name, parentId: null, icon, template });
    await openBoard(id);
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
        alert(`İçe aktarılamadı: ${(err as Error).message}`);
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

      <button className="side-btn" onClick={() => setPanel(panel === 'search' ? null : 'search')}>
        <Search size={15} /> Ara <kbd>⌘K</kbd>
      </button>
      <button className={`side-btn ${panel === 'jobs' ? 'on' : ''}`} onClick={() => setPanel(panel === 'jobs' ? null : 'jobs')}>
        <Briefcase size={15} /> İşlerim <kbd>⌘J</kbd>
      </button>

      <div className="side-section">
        <span>Panolar</span>
        <button className="icon-btn" title="Yeni pano" onClick={() => setMenu(!menu)}>
          <Plus size={14} />
        </button>
      </div>
      {menu && (
        <div className="template-menu">
          <button onClick={() => newBoard()}>
            <span className="t-icon">📄</span>
            <span>
              <b>Boş pano</b>
              <small>Sıfırdan başla</small>
            </span>
          </button>
          {TEMPLATES.map((t) => (
            <button key={t.id} onClick={() => newBoard(t.id, t.name, t.icon)}>
              <span className="t-icon">{t.icon}</span>
              <span>
                <b>{t.name}</b>
                <small>{t.desc}</small>
              </span>
            </button>
          ))}
        </div>
      )}
      <div className="tree">
        {roots.map((b) => (
          <TreeItem key={b.id} board={b} depth={0} />
        ))}
      </div>

      <div className="side-footer">
        <button className="side-btn" onClick={doExport} title="Tüm panoları ve medyayı tek dosyaya yedekle">
          <Download size={14} /> Yedekle
        </button>
        <button className="side-btn" onClick={doImport} title="Yedek dosyasını geri yükle">
          <Upload size={14} /> Geri yükle
        </button>
      </div>
    </aside>
  );
}
