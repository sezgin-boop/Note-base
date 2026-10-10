// Turns boards into a reading-order document (Markdown or HTML) so people and AI tools
// can understand a canvas without running the app. Used by the "copy for AI" button and
// by the server-rendered share page (api/share.ts), so keep it free of browser APIs.

import { SIZES } from '../cards';
import type { BoardContent, CardNode, CardType, ProjectStatus } from '../types';
import { STATUS_LABELS } from '../types';

export interface OutlineBoard {
  id: string;
  name: string;
  icon: string;
  parentId: string | null;
  content: BoardContent;
}

export interface OutlineComment {
  nodeId: string;
  t: number | null;
  author: string;
  body: string;
  done?: boolean;
  version?: string | null;
  kind?: string;
}

export interface OutlineOptions {
  rootId: string;
  /** Public URL for an uploaded media id, or null when it only exists on a device. */
  mediaUrl: (id: string) => string | null;
  /** Link to the interactive board. */
  viewUrl?: string;
  markdownUrl?: string;
  comments?: OutlineComment[];
}

interface Item {
  icon: string;
  kind: string;
  title?: string;
  meta?: string[];
  lines?: string[];
  checklist?: { text: string; done: boolean }[];
  image?: { url: string; alt: string };
  link?: { url: string; text: string };
  comments?: string[];
}

interface Section {
  title: string | null;
  items: Item[];
}

interface BoardDoc {
  id: string;
  name: string;
  icon: string;
  path: string[];
  sections: Section[];
  connections: string[];
}

export const fmtTime = (t: number) => {
  const s = Math.max(0, Math.floor(t));
  const h = Math.floor(s / 3600);
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0');
  return `${h ? `${h}:` : ''}${mm}:${String(s % 60).padStart(2, '0')}`;
};

const size = (n: CardNode) => ({
  w: n.width ?? n.measured?.width ?? SIZES[n.type as CardType]?.width ?? 200,
  h: n.height ?? n.measured?.height ?? SIZES[n.type as CardType]?.height ?? 120,
});

/** Top-to-bottom, left-to-right, treating cards whose tops are close as one row. */
function readingOrder(nodes: CardNode[]) {
  const sorted = [...nodes].sort((a, b) => a.position.y - b.position.y);
  const rows: CardNode[][] = [];
  for (const n of sorted) {
    const row = rows.at(-1);
    if (row && n.position.y - row[0].position.y < 80) row.push(n);
    else rows.push([n]);
  }
  return rows.flatMap((r) => r.sort((a, b) => a.position.x - b.position.x));
}

const firstLine = (s?: string) =>
  (s ?? '')
    .split('\n')
    .find((l) => l.trim())
    ?.trim() ?? '';
const clip = (s: string, n = 60) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

export function cardLabel(n: CardNode, boardName?: (id: string) => string | undefined): string {
  const d = n.data;
  if (n.type === 'board') return clip(`Board: ${(d.boardId && boardName?.(d.boardId)) || 'board'}`);
  if (n.type === 'scene') {
    const desc = firstLine(d.text);
    return clip(`Scene ${String(d.number ?? 1).padStart(2, '0')}${desc ? `: ${desc}` : ''}`);
  }
  const raw = d.title || firstLine(d.text) || d.caption || d.hex || d.url || KIND[n.type ?? 'note'];
  return clip(String(raw));
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

function toItem(n: CardNode, boardsById: Map<string, OutlineBoard>, opts: OutlineOptions): Item | null {
  const d = n.data;
  const lines = (s?: string) =>
    (s ?? '')
      .split('\n')
      .map((l) => l.trimEnd())
      .filter((l, i, a) => l || (i > 0 && a[i - 1]));
  const media = d.mediaId ? opts.mediaUrl(d.mediaId) : (d.url ?? null);
  const versions = d.versions?.length ? d.versions : null;
  const versionLabel = (v?: string | null) => (versions ? `${versions.find((x) => x.id === (v ?? 'v1'))?.label ?? 'V1'} ` : '');
  const clientRows = (opts.comments ?? []).filter((c) => c.nodeId === n.id);
  const comments = [
    ...(d.comments ?? []).map((c) => ({ t: c.t, author: c.author || 'Owner', body: c.text, done: c.done, version: c.v })),
    ...clientRows.filter((c) => c.kind !== 'approval'),
  ]
    .sort((a, b) => (a.version ?? 'v1').localeCompare(b.version ?? 'v1') || (a.t ?? -1) - (b.t ?? -1))
    .map(
      (c) =>
        `${versionLabel(c.version)}${c.t !== null && c.t !== undefined ? `[${fmtTime(c.t)}] ` : ''}${c.author}: ${c.body}${c.done ? ' (resolved)' : ''}`,
    );
  const approvals = [
    ...(d.approvals ?? []).map((a) => ({ version: a.version, by: a.by })),
    ...clientRows.filter((c) => c.kind === 'approval').map((c) => ({ version: c.version ?? 'v1', by: c.author })),
  ];

  switch (n.type) {
    case 'heading':
      return d.text?.trim() ? { icon: '🔠', kind: 'Heading', title: d.text.trim() } : null;
    case 'note':
      if (!d.title && !d.text?.trim()) return null;
      return { icon: '📝', kind: 'Note', title: d.title, lines: lines(d.text) };
    case 'todo': {
      const items = (d.items ?? []).filter((i) => i.text.trim());
      const done = items.filter((i) => i.done).length;
      return {
        icon: '✅',
        kind: 'List',
        title: d.title || 'List',
        meta: [`${done}/${items.length} done`],
        checklist: items,
      };
    }
    case 'image':
      return {
        icon: '🖼️',
        kind: 'Image',
        title: d.caption,
        image: media ? { url: media, alt: d.caption || 'Image' } : undefined,
        lines: media ? undefined : ['(image only on the owner’s device, not uploaded to the cloud)'],
      };
    case 'video':
      return {
        icon: '🎬',
        kind: 'Video',
        title: d.caption,
        meta: versions
          ? [
              `Versions: ${versions.map((v) => v.label).join(', ')} (showing ${versions.find((v) => v.id === d.versionId)?.label ?? versions.at(-1)!.label})`,
              ...[...new Map(approvals.map((a) => [a.version, a])).values()].map(
                (a) => `${versionLabel(a.version).trim() || 'V1'} approved by ${a.by}`,
              ),
            ]
          : approvals.map((a) => `Approved by ${a.by}`),
        link: media ? { url: media, text: d.url ? d.url : 'Open video' } : undefined,
        lines: media ? undefined : ['(video only on the owner’s device, not uploaded to the cloud)'],
        comments,
      };
    case 'link':
      return d.url ? { icon: '🔗', kind: 'Link', link: { url: d.url, text: d.title || d.url } } : null;
    case 'board': {
      const b = d.boardId ? boardsById.get(d.boardId) : undefined;
      return {
        icon: b?.icon ?? '📁',
        kind: 'Sub-board',
        title: b ? b.name : '(board not shared)',
        lines: b ? ['Its content follows below under its own heading.'] : undefined,
      };
    }
    case 'scene':
      return {
        icon: '🎞️',
        kind: 'Scene',
        title: `Scene ${String(d.number ?? 1).padStart(2, '0')}`,
        meta: [d.shot, d.duration].filter(Boolean) as string[],
        lines: [...lines(d.text), ...(d.audio ? [`Sound: ${d.audio}`] : [])],
        image: d.mediaId && opts.mediaUrl(d.mediaId) ? { url: opts.mediaUrl(d.mediaId)!, alt: 'Scene frame' } : undefined,
      };
    case 'project':
      return {
        icon: '💼',
        kind: 'Job',
        title: d.title,
        meta: [
          `Status: ${STATUS_LABELS[(d.status ?? 'brief') as ProjectStatus]}`,
          d.client && `Client: ${d.client}`,
          d.deadline && `Due: ${d.deadline}`,
          d.fee && `Fee: ${d.fee}`,
        ].filter(Boolean) as string[],
        lines: lines(d.text),
      };
    case 'color':
      return { icon: '🎨', kind: 'Color', title: d.title, meta: [d.hex ?? ''] };
    default:
      return null;
  }
}

/** Publish date, platform and tags apply to any card. */
function withPlanning(it: Item | null, n: CardNode): Item | null {
  if (!it) return it;
  const d = n.data;
  const extra = [
    d.publishDate && `Publish: ${d.publishDate}${d.platform ? ` on ${d.platform}` : ''}`,
    !d.publishDate && d.platform && `Platform: ${d.platform}`,
    d.tags?.length && d.tags.map((t) => `#${t}`).join(' '),
  ].filter(Boolean) as string[];
  return extra.length ? { ...it, meta: [...(it.meta ?? []), ...extra] } : it;
}

function buildDoc(board: OutlineBoard, boardsById: Map<string, OutlineBoard>, opts: OutlineOptions): BoardDoc {
  const nodes = board.content.nodes ?? [];
  const frames = nodes.filter((n) => n.type === 'frame');
  const cards = nodes.filter((n) => n.type !== 'frame');

  // A card belongs to the smallest section whose box contains its center.
  const owner = new Map<string, string | null>();
  for (const c of cards) {
    const { w, h } = size(c);
    const cx = c.position.x + w / 2;
    const cy = c.position.y + h / 2;
    let best: { id: string; area: number } | null = null;
    for (const f of frames) {
      const fs = size(f);
      if (cx >= f.position.x && cx <= f.position.x + fs.w && cy >= f.position.y && cy <= f.position.y + fs.h) {
        const area = fs.w * fs.h;
        if (!best || area < best.area) best = { id: f.id, area };
      }
    }
    owner.set(c.id, best?.id ?? null);
  }

  const itemsOf = (list: CardNode[]) =>
    readingOrder(list)
      .map((n) => withPlanning(toItem(n, boardsById, opts), n))
      .filter(Boolean) as Item[];

  const sections: Section[] = [];
  const loose = cards.filter((c) => !owner.get(c.id));
  if (loose.length) sections.push({ title: frames.length ? 'Cards outside sections' : null, items: itemsOf(loose) });
  for (const f of readingOrder(frames)) {
    sections.push({ title: f.data.title || 'Section', items: itemsOf(cards.filter((c) => owner.get(c.id) === f.id)) });
  }
  // Loose cards usually frame the board (titles, intro), but keep sections in canvas order otherwise.
  if (loose.length && frames.length) {
    const top = Math.min(...frames.map((f) => f.position.y));
    if (Math.min(...loose.map((c) => c.position.y)) > top) sections.push(sections.shift()!);
  }

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const connections = (board.content.edges ?? [])
    .filter((e) => byId.has(e.source) && byId.has(e.target))
    .map((e) => {
      const label = typeof e.label === 'string' && e.label ? ` (${e.label})` : '';
      const name = (id: string) => boardsById.get(id)?.name;
      return `"${cardLabel(byId.get(e.source)!, name)}" → "${cardLabel(byId.get(e.target)!, name)}"${label}`;
    });

  const path: string[] = [];
  let cur = boardsById.get(board.parentId ?? '');
  while (cur) {
    path.unshift(cur.name);
    cur = boardsById.get(cur.parentId ?? '');
  }
  return { id: board.id, name: board.name, icon: board.icon, path, sections, connections };
}

function docs(boards: OutlineBoard[], opts: OutlineOptions): BoardDoc[] {
  const byId = new Map(boards.map((b) => [b.id, b]));
  const out: BoardDoc[] = [];
  const visit = (id: string) => {
    const b = byId.get(id);
    if (!b) return;
    out.push(buildDoc(b, byId, opts));
    // Sub-boards in the order their cards appear on the parent.
    const order = readingOrder((b.content.nodes ?? []).filter((n) => n.type === 'board')).map((n) => n.data.boardId);
    const kids = boards.filter((k) => k.parentId === id).sort((x, y) => idx(order, x.id) - idx(order, y.id));
    kids.forEach((k) => visit(k.id));
  };
  visit(opts.rootId);
  return out;
}
const idx = (arr: unknown[], v: unknown) => (arr.indexOf(v) === -1 ? 1e9 : arr.indexOf(v));

const INTRO =
  'This is the text version of a visual Notebase board (an infinite canvas). ' +
  'Cards are listed in reading order on the canvas (top to bottom, left to right). ' +
  '"Sections" are frames that group cards. "Connections" are the arrows drawn between cards — the flow of ideas. ' +
  'Sub-boards follow under their own headings.';

// ---------- Markdown ----------

export function boardsToMarkdown(boards: OutlineBoard[], opts: OutlineOptions): string {
  const ds = docs(boards, opts);
  const root = ds[0];
  const out: string[] = [];
  out.push(`# ${root ? `${root.icon} ${root.name}` : 'Notebase board'}`, '', `> ${INTRO}`);
  if (opts.viewUrl) out.push('>', `> Interactive board: ${opts.viewUrl}`);
  out.push('');
  ds.forEach((d, i) => {
    if (i > 0) out.push('---', '', `# ${d.icon} ${d.name}`, '');
    if (d.path.length) out.push(`_Location: ${d.path.join(' / ')} / ${d.name}_`, '');
    for (const s of d.sections) {
      if (s.title) out.push(`## ${s.title}`, '');
      if (!s.items.length) out.push('_(empty)_', '');
      for (const it of s.items) out.push(...itemMd(it));
      if (s.items.length) out.push('');
    }
    if (d.connections.length) {
      out.push('## Connections (flow of ideas)', '', ...d.connections.map((c) => `- ${c}`), '');
    }
  });
  return (
    out
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim() + '\n'
  );
}

function itemMd(it: Item): string[] {
  const head = [`${it.icon} ${it.kind}`];
  if (it.title) head.push(`**${it.title.replace(/\n/g, ' ')}**`);
  if (it.meta?.length) head.push(it.meta.filter(Boolean).join(' · '));
  if (it.link) head.push(`[${it.link.text}](${it.link.url})`);
  const out = [`- ${head.join(' — ')}`];
  for (const l of it.lines ?? []) out.push(`  ${l}`.trimEnd() || '  ');
  for (const c of it.checklist ?? []) out.push(`  - [${c.done ? 'x' : ' '}] ${c.text}`);
  if (it.image) out.push(`  ![${it.image.alt}](${it.image.url})`);
  if (it.comments?.length) out.push('  Comments:', ...it.comments.map((c) => `  - ${c}`));
  return out;
}

// ---------- HTML (share page) ----------

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const safeUrl = (u: string) => (/^(https?:|data:image\/)/i.test(u) ? u : '#');

export function boardsToHtml(boards: OutlineBoard[], opts: OutlineOptions): string {
  const ds = docs(boards, opts);
  const root = ds[0];
  const title = root ? `${root.icon} ${root.name}` : 'Notebase board';
  const firstImage = ds.flatMap((d) => d.sections.flatMap((s) => s.items)).find((i) => i.image)?.image?.url;
  const body = ds
    .map(
      (d, i) => `<section class="board" id="${esc(d.id)}">
  ${i === 0 ? `<h1>${esc(title)}</h1>` : `<h1 class="sub">${esc(`${d.icon} ${d.name}`)}</h1>`}
  ${d.path.length ? `<p class="path">Location: ${esc([...d.path, d.name].join(' / '))}</p>` : ''}
  ${d.sections
    .map(
      (s) => `<div class="section">${s.title ? `<h2>${esc(s.title)}</h2>` : ''}
    ${s.items.length ? `<ul class="cards">${s.items.map(itemHtml).join('')}</ul>` : '<p class="muted">(empty)</p>'}</div>`,
    )
    .join('\n')}
  ${d.connections.length ? `<div class="section"><h2>Connections (flow of ideas)</h2><ul class="links">${d.connections.map((c) => `<li>${esc(c)}</li>`).join('')}</ul></div>` : ''}
</section>`,
    )
    .join('\n');

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(title)} · Notebase</title>
<meta name="description" content="${esc(INTRO)}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="Notebase board" />
${firstImage ? `<meta property="og:image" content="${esc(firstImage)}" />` : ''}
${opts.markdownUrl ? `<link rel="alternate" type="text/markdown" href="${esc(opts.markdownUrl)}" />` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet" />
<style>
  :root { color-scheme: dark; --bg:#0b0b0d; --card:#17171b; --border:#2a2a31; --text:#ececf1; --muted:#8b8b96; --brand:#a78bfa; }
  @media (prefers-color-scheme: light) { :root { color-scheme: light; --bg:#f7f7f8; --card:#fff; --border:#e4e4e7; --text:#18181b; --muted:#71717a; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--text); font:15px/1.6 Geist, Inter, ui-sans-serif, system-ui, -apple-system, sans-serif; }
  main { max-width: 860px; margin: 0 auto; padding: 32px 16px 80px; }
  .top { display:flex; flex-wrap:wrap; gap:10px; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .brand { color:var(--muted); font-size:13px; font-weight:600; letter-spacing:.04em; }
  .btn { display:inline-block; padding:8px 14px; border-radius:9px; background:var(--text); color:var(--bg); text-decoration:none; font-weight:600; font-size:13px; }
  .intro { color:var(--muted); font-size:13px; border-left:2px solid var(--border); padding-left:12px; }
  h1 { font-family: 'Instrument Serif', Georgia, serif; font-weight: 400; font-size: 44px; line-height: 1.05; margin: 18px 0 6px; }
  h1.sub { font-size: 32px; margin-top: 48px; padding-top: 24px; border-top: 1px solid var(--border); }
  h2 { font-size: 16px; margin: 26px 0 10px; color: var(--brand); }
  .path, .muted { color: var(--muted); font-size: 13px; margin: 0; }
  ul.cards { list-style:none; padding:0; margin:0; display:grid; gap:10px; }
  .card { background:var(--card); border:1px solid var(--border); border-radius:16px; padding:13px 16px; }
  .kind { font-size:11px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  .title { font-weight:600; font-size:15.5px; }
  .meta { color:var(--muted); font-size:13px; }
  .text { white-space:pre-wrap; margin:6px 0 0; }
  .card img { display:block; max-width:100%; max-height:520px; border-radius:8px; margin-top:8px; }
  .check { list-style:none; padding:0; margin:6px 0 0; }
  .check li.done { color:var(--muted); text-decoration: line-through; }
  .comments { margin:8px 0 0; padding-left:18px; font-size:13.5px; }
  a { color: var(--brand); word-break: break-word; }
  ul.links { padding-left: 18px; }
</style>
</head>
<body>
<main>
  <div class="top"><span class="brand">NOTEBASE · SHARED BOARD</span>${opts.viewUrl ? `<a class="btn" href="${esc(opts.viewUrl)}">Open interactive board →</a>` : ''}</div>
  <p class="intro">${esc(INTRO)}${opts.markdownUrl ? ` Plain text (Markdown): <a href="${esc(opts.markdownUrl)}">${esc(opts.markdownUrl)}</a>` : ''}</p>
  ${body}
</main>
</body>
</html>`;
}

function itemHtml(it: Item): string {
  return `<li class="card">
  <div class="kind">${esc(`${it.icon} ${it.kind}`)}</div>
  ${it.title ? `<div class="title">${esc(it.title)}</div>` : ''}
  ${it.meta?.length ? `<div class="meta">${esc(it.meta.filter(Boolean).join(' · '))}</div>` : ''}
  ${it.link ? `<div><a href="${esc(safeUrl(it.link.url))}">${esc(it.link.text)}</a></div>` : ''}
  ${it.lines?.length ? `<p class="text">${esc(it.lines.join('\n'))}</p>` : ''}
  ${it.checklist?.length ? `<ul class="check">${it.checklist.map((c) => `<li class="${c.done ? 'done' : ''}">${c.done ? '☑' : '☐'} ${esc(c.text)}</li>`).join('')}</ul>` : ''}
  ${it.image ? `<img src="${esc(safeUrl(it.image.url))}" alt="${esc(it.image.alt)}" loading="lazy" />` : ''}
  ${it.comments?.length ? `<div class="meta">Comments</div><ul class="comments">${it.comments.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : ''}
</li>`;
}
