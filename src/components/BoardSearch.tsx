import { ChevronDown, ChevronUp, Search, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { create } from 'zustand';
import { useStore } from '../store';
import type { CardNode } from '../types';

/** Whether the "find on this board" bar is open (⌘F / the magnifier in the top bar). */
export const useFind = create<{ open: boolean; setOpen: (open: boolean) => void }>((set) => ({
  open: false,
  setOpen: (open) => set({ open }),
}));

/** Lower case, no accents, Turkish ı / İ folded to i — so "kod", "KOD" and "Kôd" all match. */
const fold = (s: string) => s.replace(/İ/g, 'i').replace(/ı/g, 'i').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const plain = (s: string) =>
  s
    .replace(/<br\s*\/?>|<\/(p|div|li|h\d)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    // Markdown marks around words (**bold**, ==highlight==, ~~strike~~, `code`) and list / checkbox starts.
    .replace(/\*\*|__|==|~~|`/g, '')
    .replace(/(^|\n)\s*(?:#{1,6}\s+|[-*]\s+(?:\[[ xX]\]\s+)?|\d+\.\s+|>\s+)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();

/** Every piece of text written on a card, including list items, comments, captions and tags. */
function cardFields(n: CardNode): string[] {
  const d = n.data;
  return [
    d.title,
    d.label,
    d.text,
    d.caption,
    d.audio,
    d.prompt,
    d.shot,
    d.duration,
    d.client,
    d.fee,
    d.platform,
    d.hex,
    d.url,
    ...(d.items ?? []).map((i) => i.text),
    ...(d.more ?? []).map((m) => m.caption),
    ...(d.comments ?? []).map((c) => c.text),
    ...(d.versions ?? []).map((v) => v.label),
    ...(d.tags ?? []).map((t) => `#${t}`),
  ]
    .filter((s): s is string => typeof s === 'string' && !!s.trim())
    .map(plain);
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
  draw: 'Text',
};

interface Hit {
  node: CardNode;
  score: number;
  /** The field the term was found in, and where. */
  text: string;
  at: number;
}

/** Best match of `term` on a card: a whole field or word equal to it (a code) beats a word starting with it, which beats anywhere. */
function matchCard(node: CardNode, term: string): Hit | null {
  let best: Hit | null = null;
  for (const text of cardFields(node)) {
    const f = fold(text);
    const at = f.indexOf(term);
    if (at < 0) continue;
    const before = at === 0 || !/[\p{L}\p{N}]/u.test(f[at - 1]);
    const after = at + term.length >= f.length || !/[\p{L}\p{N}]/u.test(f[at + term.length]);
    const score = f.trim() === term ? 4 : before && after ? 3 : before ? 2 : 1;
    if (!best || score > best.score) best = { node, score, text, at };
  }
  return best;
}

/** Absolute position of a card (cards inside a section are stored relative to it). */
function absPos(n: CardNode, byId: Map<string, CardNode>) {
  let x = n.position.x;
  let y = n.position.y;
  for (let p = n.parentId ? byId.get(n.parentId) : undefined; p; p = p.parentId ? byId.get(p.parentId) : undefined) {
    x += p.position.x;
    y += p.position.y;
  }
  return { x, y };
}

function Snippet({ hit, len }: { hit: Hit; len: number }) {
  const { text, at } = hit;
  // fold() keeps lengths for almost all text, so the match lines up with the original.
  const start = Math.max(0, at - 28);
  const end = Math.min(text.length, at + len + 48);
  return (
    <>
      {start > 0 && '…'}
      {text.slice(start, at)}
      <mark>{text.slice(at, at + len)}</mark>
      {text.slice(at + len, end)}
      {end < text.length && '…'}
    </>
  );
}

export function BoardSearch() {
  const { open, setOpen } = useFind();
  const currentId = useStore((s) => s.currentId);
  const nodes = useStore((s) => s.nodes);
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [list, setList] = useState(true);
  const input = useRef<HTMLInputElement>(null);
  const jumped = useRef<string | null>(null);

  // ⌘F / Ctrl+F opens it (also on shared, view-only boards); pressing it again selects the text.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        setOpen(true);
        setTimeout(() => input.current?.select());
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [setOpen]);

  // A new board starts a new search.
  useEffect(() => {
    setQ('');
    setSel(0);
    jumped.current = null;
  }, [currentId]);

  const term = fold(q.trim());
  const hits = useMemo(() => {
    if (!term) return [];
    const byId = new Map(nodes.map((n) => [n.id, n]));
    return nodes
      .map((n) => matchCard(n, term))
      .filter((h): h is Hit => !!h)
      .map((h) => ({ ...h, pos: absPos(h.node, byId) }))
      .sort((a, b) => b.score - a.score || a.pos.y - b.pos.y || a.pos.x - b.pos.x);
  }, [nodes, term]);

  const go = (i: number) => {
    const hit = hits[i];
    if (!hit || !currentId) return;
    setSel(i);
    jumped.current = hit.node.id;
    useStore.getState().focusCard(currentId, hit.node.id);
  };

  // Typing jumps straight to the best match once you pause — a code takes you right to its card.
  useEffect(() => {
    if (!open || !term) return;
    const t = setTimeout(() => {
      const first = hits[0];
      if (first && jumped.current !== first.node.id) go(0);
    }, 380);
    return () => clearTimeout(t);
  }, [term, open]);

  if (!open) return null;
  const close = () => {
    setOpen(false);
    setQ('');
    jumped.current = null;
  };
  const step = (by: number) => hits.length && go((sel + by + hits.length) % hits.length);

  return (
    <div className="find" role="search">
      <div className="find-bar">
        <Search size={15} className="find-icon" />
        <input
          ref={input}
          autoFocus
          value={q}
          placeholder="Find on this board…"
          enterKeyHint="search"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          onChange={(e) => {
            setQ(e.target.value);
            setSel(0);
            setList(true);
            jumped.current = null;
          }}
          onKeyDown={(e) => {
            e.stopPropagation();
            if (e.key === 'Enter')
              (e.preventDefault(), jumped.current === hits[sel]?.node.id ? step(e.shiftKey ? -1 : 1) : go(sel));
            else if (e.key === 'ArrowDown') (e.preventDefault(), step(1));
            else if (e.key === 'ArrowUp') (e.preventDefault(), step(-1));
            else if (e.key === 'Escape') (e.preventDefault(), close());
          }}
        />
        {term && <span className="find-count">{hits.length ? `${sel + 1}/${hits.length}` : '0'}</span>}
        <button className="icon-btn" title="Previous (Shift+Enter)" disabled={!hits.length} onClick={() => step(-1)}>
          <ChevronUp size={15} />
        </button>
        <button className="icon-btn" title="Next (Enter)" disabled={!hits.length} onClick={() => step(1)}>
          <ChevronDown size={15} />
        </button>
        <button className="icon-btn" title="Close (Esc)" onClick={close}>
          <X size={15} />
        </button>
      </div>
      {term && list && (
        <div className="find-results">
          {hits.slice(0, 60).map((h, i) => (
            <button
              key={h.node.id}
              className={i === sel ? 'sel' : ''}
              onClick={() => {
                go(i);
                // On a phone the list covers the board: fold it away once a card is picked.
                if (matchMedia('(max-width: 700px)').matches) setList(false);
              }}
            >
              <span className="r-kind">{h.node.data.label || KIND[h.node.type ?? 'note']}</span>
              <span className="r-text">
                <Snippet hit={h} len={term.length} />
              </span>
            </button>
          ))}
          {!hits.length && <div className="muted empty">Nothing on this board matches “{q.trim()}”</div>}
        </div>
      )}
      {term && !list && !!hits.length && (
        <button className="find-more" onClick={() => setList(true)}>
          Show all {hits.length} results
        </button>
      )}
    </div>
  );
}
