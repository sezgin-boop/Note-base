import { LayoutTemplate, Plus, SquarePlus } from 'lucide-react';
import { useState } from 'react';
import { isPhone, useStore } from '../store';
import { TEMPLATES, templateCards, type TemplateInfo } from '../templates';
import { toast } from '../ui';
import { Modal } from './Dialogs';

const GROUPS: TemplateInfo['group'][] = ['Create', 'Work', 'Plan'];

/** The template gallery: start a new board from a template, or drop its cards onto the open board. */
export function TemplatesDialog() {
  const setPanel = useStore((s) => s.setPanel);
  const currentId = useStore((s) => s.currentId);
  const [open, setOpen] = useState<string | null>(null);
  const close = () => setPanel(null);

  const newBoard = async (t: TemplateInfo) => {
    const s = useStore.getState();
    const id = await s.createBoard({ name: t.name, parentId: null, icon: t.icon, template: t.id });
    await s.openBoard(id);
    close();
    if (isPhone() && useStore.getState().sidebar) useStore.getState().toggleSidebar();
  };

  const addHere = (t: TemplateInfo) => {
    const s = useStore.getState();
    const shown = s.nodes.filter((n) => !n.hidden);
    // To the right of what's already on the board, so nothing gets covered.
    const at = shown.length
      ? {
          x: Math.max(...shown.map((n) => n.position.x + (n.width ?? n.measured?.width ?? 260))) + 160,
          y: Math.min(...shown.map((n) => n.position.y)),
        }
      : { x: 0, y: 0 };
    const { nodes, edges } = templateCards(t.id, at);
    s.insertCards(nodes, edges);
    close();
    toast(`${t.name} added — undo with ⌘Z`);
  };

  return (
    <Modal title="Templates" onClose={close}>
      <div className="tpl-gallery">
        {GROUPS.map((g) => (
          <section key={g}>
            <h4>{g}</h4>
            <div className="tpl-grid">
              {TEMPLATES.filter((t) => t.group === g).map((t) => (
                <div key={t.id} className={`tpl-card ${open === t.id ? 'open' : ''}`}>
                  <button className="tpl-main" onClick={() => setOpen(open === t.id ? null : t.id)}>
                    <span className="tpl-icon">{t.icon}</span>
                    <span className="tpl-text">
                      <b>{t.name}</b>
                      <small>{t.desc}</small>
                    </span>
                  </button>
                  {open === t.id && (
                    <div className="tpl-more">
                      <ul>
                        {t.inside.map((x) => (
                          <li key={x}>{x}</li>
                        ))}
                      </ul>
                      <div className="tpl-actions">
                        <button className="btn" onClick={() => newBoard(t)}>
                          <Plus size={14} /> New board
                        </button>
                        {currentId && (
                          <button className="btn-ghost" onClick={() => addHere(t)}>
                            <SquarePlus size={14} /> Add to this board
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>
        ))}
        <p className="muted small tpl-foot">
          <LayoutTemplate size={12} /> Everything in a template is a normal card — change, move or delete whatever you like.
        </p>
      </div>
    </Modal>
  );
}
