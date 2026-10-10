import { Bot, ChevronRight, Eye, Hash, PanelLeft, Search, Share2, Sparkles, X } from 'lucide-react';
import { boardTags } from '../tags';
import { ExportMenu } from './Export';
import { cloudConfigured } from '../cloud';
import { useCloud } from '../sync';
import { toast } from '../ui';
import { boardMarkdown, SyncLabel } from './Dialogs';
import { useEffect, useMemo, useState } from 'react';
import { loadBoard } from '../db';
import { DeadlineBadge, daysLeft } from '../nodes/WorkNodes';
import { boardPath, useStore } from '../store';
import type { BoardMeta, CardNode, ProjectStatus } from '../types';
import { STATUS_COLORS, STATUS_LABELS } from '../types';
import { EmojiPicker } from './Sidebar';

export function Topbar() {
  const { boards, currentId, openBoard, renameBoard, toggleSidebar, nodes, readOnly, setPanel } = useStore();
  const user = useCloud((c) => c.user);
  const path = boardPath(boards, currentId);
  const current = path.at(-1);
  const [picker, setPicker] = useState(false);
  return (
    <header className="topbar">
      <button className="icon-btn" title="Sidebar" onClick={toggleSidebar}>
        <PanelLeft size={16} />
      </button>
      <nav className="crumbs">
        {path.slice(0, -1).map((b) => (
          <span key={b.id} className="crumb" onClick={() => openBoard(b.id)}>
            {b.icon} {b.name}
            <ChevronRight size={12} />
          </span>
        ))}
        {current && (
          <span className="crumb current">
            <span className="tree-icon-wrap">
              <button className="tree-icon" onClick={() => setPicker(true)}>
                {current.icon}
              </button>
              {picker && !readOnly && (
                <EmojiPicker onPick={(icon) => renameBoard(current.id, { icon })} onClose={() => setPicker(false)} />
              )}
            </span>
            <input
              key={current.id}
              className="title-input"
              defaultValue={current.name}
              readOnly={readOnly}
              size={Math.max(current.name.length, 6)}
              onBlur={(e) => {
                const name = e.target.value.trim();
                if (name && name !== current.name) renameBoard(current.id, { name });
              }}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            />
          </span>
        )}
      </nav>
      {readOnly ? (
        <>
          <span className="badge">
            <Eye size={12} /> View only
          </span>
          <button
            className="top-btn"
            title="Copy the board as text for an AI"
            onClick={async () => {
              await navigator.clipboard.writeText(await boardMarkdown(location.href));
              toast('Board copied as text');
            }}
          >
            <Bot size={14} /> <span className="hide-sm">Copy as text</span>
          </button>
        </>
      ) : (
        <>
          <span className="muted small status-text">
            {nodes.length} cards · {cloudConfigured && user ? <SyncLabel /> : 'saved on this device'}
          </span>
          <TagFilter />
          <ExportMenu />
          <button className="top-btn" onClick={() => setPanel('ai')} title="Work with AI (A)">
            <Sparkles size={14} /> <span className="hide-sm">AI</span>
          </button>
          <button className="top-btn primary" onClick={() => setPanel('share')}>
            <Share2 size={14} /> <span className="hide-sm">Share</span>
          </button>
        </>
      )}
    </header>
  );
}

/** Highlight only the cards with one tag (explicit tags or #hashtags in their text). */
function TagFilter() {
  const { nodes, tagFilter, setTagFilter } = useStore();
  const [open, setOpen] = useState(false);
  const tags = useMemo(() => boardTags(nodes), [nodes]);
  if (!tags.length && !tagFilter) return null;
  return (
    <div className="export">
      <button className={`top-btn ${tagFilter ? 'active' : ''}`} onClick={() => setOpen(!open)} title="Filter by tag">
        <Hash size={14} /> <span className="hide-sm">{tagFilter ?? 'Tags'}</span>
        {tagFilter && (
          <X
            size={13}
            onClick={(e) => {
              e.stopPropagation();
              setTagFilter(null);
            }}
          />
        )}
      </button>
      {open && (
        <>
          <div className="backdrop-clear" onClick={() => setOpen(false)} />
          <div className="context-menu export-menu tag-menu">
            <div className="menu-head">Show only cards tagged</div>
            <div className="tag-list">
              {tags.map(({ tag, count }) => (
                <button
                  key={tag}
                  className={`tag-chip big ${tagFilter === tag ? 'on' : ''}`}
                  onClick={() => {
                    setTagFilter(tagFilter === tag ? null : tag);
                    setOpen(false);
                  }}
                >
                  #{tag} <span className="muted">{count}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/** Load every board (the open one from live state) for cross-board views. */
export function useAllCards() {
  const { boards, currentId, nodes } = useStore();
  const [stored, setStored] = useState<Record<string, CardNode[]>>({});
  useEffect(() => {
    Promise.all(boards.map(async (b) => [b.id, (await loadBoard(b.id)).nodes] as const)).then((e) =>
      setStored(Object.fromEntries(e)),
    );
  }, [boards]);
  return useMemo(
    () => boards.flatMap((b) => (b.id === currentId ? nodes : (stored[b.id] ?? [])).map((node) => ({ board: b, node }))),
    [boards, currentId, nodes, stored],
  );
}

const cardText = (n: CardNode) =>
  [
    n.data.title,
    n.data.text,
    n.data.caption,
    n.data.client,
    n.data.url,
    n.data.audio,
    ...(n.data.items ?? []).map((i) => i.text),
    ...(n.data.tags ?? []).map((t) => `#${t}`),
  ]
    .filter(Boolean)
    .join(' · ');

export function SearchPalette() {
  const { boards, setPanel, focusCard } = useStore();
  const all = useAllCards();
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);

  const results = useMemo(() => {
    const term = q.trim().toLocaleLowerCase();
    const boardHits = boards
      .filter((b) => !term || b.name.toLocaleLowerCase().includes(term))
      .map((b) => ({ key: b.id, board: b, node: null as CardNode | null, text: b.name }));
    if (!term) return boardHits.slice(0, 12);
    const cardHits = all
      .map(({ board, node }) => ({ key: node.id, board, node, text: cardText(node) }))
      .filter((r) => r.text.toLocaleLowerCase().includes(term));
    return [...boardHits, ...cardHits].slice(0, 40);
  }, [q, all, boards]);

  const go = (r: (typeof results)[number]) => focusCard(r.board.id, r.node?.id ?? null);

  return (
    <div className="overlay" onClick={() => setPanel(null)}>
      <div className="palette" onClick={(e) => e.stopPropagation()}>
        <div className="palette-input">
          <Search size={16} />
          <input
            autoFocus
            placeholder="Search boards, cards and #tags…"
            value={q}
            onChange={(e) => (setQ(e.target.value), setSel(0))}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') e.preventDefault(), setSel((s) => Math.min(s + 1, results.length - 1));
              if (e.key === 'ArrowUp') e.preventDefault(), setSel((s) => Math.max(s - 1, 0));
              if (e.key === 'Enter' && results[sel]) go(results[sel]);
              if (e.key === 'Escape') setPanel(null);
            }}
          />
        </div>
        <div className="palette-results">
          {results.map((r, i) => (
            <button key={r.key} className={i === sel ? 'sel' : ''} onMouseEnter={() => setSel(i)} onClick={() => go(r)}>
              <span className="r-kind">{r.node ? kindLabel(r.node) : r.board.icon}</span>
              <span className="r-text">{r.text || '(empty card)'}</span>
              <span className="r-board">{r.node ? `${r.board.icon} ${r.board.name}` : 'Board'}</span>
            </button>
          ))}
          {!results.length && <div className="muted empty">No results</div>}
        </div>
      </div>
    </div>
  );
}

const KIND: Record<string, string> = {
  note: 'Note',
  heading: 'Heading',
  todo: 'List',
  image: 'Image',
  video: 'Video',
  link: 'Link',
  board: 'Board',
  frame: 'Section',
  scene: 'Scene',
  project: 'Job',
  color: 'Color',
};
const kindLabel = (n: CardNode) => KIND[n.type ?? 'note'];

const parseFee = (fee?: string) => Number((fee ?? '').replace(/[^\d]/g, '')) || 0;
/** Total with the currency symbol the fees are written in (₺, $, €, £), if any. */
const money = (n: number, fees: (string | undefined)[]) => {
  const symbol = fees.join(' ').match(/[₺$€£]/)?.[0] ?? '';
  return `${symbol}${n.toLocaleString()}`;
};

export function JobsPanel() {
  const { setPanel, focusCard } = useStore();
  const all = useAllCards();
  const [filter, setFilter] = useState<'active' | 'all'>('active');

  const jobs = all
    .filter(({ node }) => node.type === 'project')
    .filter(({ node }) => filter === 'all' || !['delivered', 'paid'].includes(node.data.status ?? ''))
    .sort((a, b) => (a.node.data.deadline || '9999').localeCompare(b.node.data.deadline || '9999'));

  const projects = all.filter(({ node }) => node.type === 'project').map(({ node }) => node.data);
  const active = projects.filter((p) => !['delivered', 'paid'].includes(p.status ?? '')).length;
  const late = projects.filter((p) => !['delivered', 'paid'].includes(p.status ?? '') && (daysLeft(p.deadline) ?? 1) < 0).length;
  const pending = projects.filter((p) => p.status === 'delivered').reduce((s, p) => s + parseFee(p.fee), 0);
  const earned = projects.filter((p) => p.status === 'paid').reduce((s, p) => s + parseFee(p.fee), 0);

  return (
    <aside className="jobs">
      <div className="jobs-head">
        <b>Jobs</b>
        <button className="icon-btn" onClick={() => setPanel(null)}>
          <X size={15} />
        </button>
      </div>
      <div className="stats">
        <div>
          <b>{active}</b>
          <span>Active</span>
        </div>
        <div className={late ? 'bad' : ''}>
          <b>{late}</b>
          <span>Overdue</span>
        </div>
        <div>
          <b>
            {money(
              pending,
              projects.map((p) => p.fee),
            )}
          </b>
          <span>Awaiting payment</span>
        </div>
        <div>
          <b>
            {money(
              earned,
              projects.map((p) => p.fee),
            )}
          </b>
          <span>Paid</span>
        </div>
      </div>
      <div className="seg">
        <button className={filter === 'active' ? 'on' : ''} onClick={() => setFilter('active')}>
          Active
        </button>
        <button className={filter === 'all' ? 'on' : ''} onClick={() => setFilter('all')}>
          All
        </button>
      </div>
      <div className="job-list">
        {jobs.map(({ board, node }) => (
          <JobRow key={node.id} board={board} node={node} onClick={() => focusCard(board.id, node.id)} />
        ))}
        {!jobs.length && (
          <div className="muted empty">
            No jobs yet. Add client work with the <b>Job</b> card in the toolbar — it shows up here, sorted by due date.
          </div>
        )}
      </div>
    </aside>
  );
}

function JobRow({ board, node, onClick }: { board: BoardMeta; node: CardNode; onClick: () => void }) {
  const status = (node.data.status ?? 'brief') as ProjectStatus;
  return (
    <button className="job" onClick={onClick} style={{ '--c': STATUS_COLORS[status] } as React.CSSProperties}>
      <div className="job-top">
        <b>{node.data.title || 'Untitled job'}</b>
        <DeadlineBadge deadline={node.data.deadline} status={status} />
      </div>
      <div className="job-sub">
        <span className="dot-status">{STATUS_LABELS[status]}</span>
        {node.data.client && <span>{node.data.client}</span>}
        {node.data.fee && <span>{node.data.fee}</span>}
      </div>
      <div className="muted small">
        {board.icon} {board.name}
        {node.data.deadline &&
          ` · ${new Date(node.data.deadline).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })}`}
      </div>
    </button>
  );
}

export function Lightbox() {
  const { lightbox, setLightbox } = useStore();
  if (!lightbox) return null;
  return (
    <div className="overlay lightbox" onClick={() => setLightbox(null)}>
      {lightbox.kind === 'image' ? (
        <img src={lightbox.src} alt="" />
      ) : (
        <video src={lightbox.src} controls autoPlay onClick={(e) => e.stopPropagation()} />
      )}
    </div>
  );
}
