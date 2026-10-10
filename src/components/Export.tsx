import { getNodesBounds, getViewportForBounds, useReactFlow } from '@xyflow/react';
import { toPng } from 'html-to-image';
import { ClipboardList, Download, FileText, Film, Image as ImageIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getMediaUrl } from '../db';
import { useStore } from '../store';
import type { CardNode } from '../types';
import { toast } from '../ui';
import { boardMarkdown } from './Dialogs';

const esc = (s = '') => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const fileName = (name: string, ext: string) => `${name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'board'}.${ext}`;

function download(href: string, name: string) {
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  a.click();
}

/** Print an HTML document through a hidden iframe (the browser's dialog offers "Save as PDF"). */
function printHtml(title: string, body: string) {
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  doc.open();
  doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
    * { box-sizing: border-box; }
    body { font: 12px/1.45 Inter, system-ui, sans-serif; color: #111; margin: 24px; }
    h1 { font-size: 20px; margin: 0 0 2px; } .sub { color: #666; margin: 0 0 16px; }
    .scenes { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
    .scene { border: 1px solid #ddd; border-radius: 8px; padding: 8px; break-inside: avoid; }
    .frame { aspect-ratio: 16/9; background: #f2f2f2; border-radius: 5px; overflow: hidden; display: grid; place-items: center; color: #aaa; }
    .frame img { width: 100%; height: 100%; object-fit: cover; }
    .meta { display: flex; gap: 8px; font-weight: 600; margin: 6px 0 2px; } .meta span:last-child { margin-left: auto; color: #666; font-weight: 500; }
    .audio { color: #555; margin-top: 3px; }
    h2 { font-size: 14px; margin: 18px 0 6px; border-bottom: 1px solid #ddd; padding-bottom: 4px; }
    table { width: 100%; border-collapse: collapse; } td, th { border-bottom: 1px solid #eee; padding: 6px 4px; text-align: left; vertical-align: top; }
    th { font-size: 11px; color: #666; text-transform: uppercase; } .box { width: 14px; height: 14px; border: 1.5px solid #333; border-radius: 3px; display: inline-block; }
    @page { margin: 14mm; }
  </style></head><body>${body}</body></html>`);
  doc.close();
  const imgs = [...doc.images];
  Promise.all(imgs.map((i) => (i.complete ? null : new Promise((r) => (i.onload = i.onerror = r))))).then(() => {
    frame.contentWindow!.focus();
    frame.contentWindow!.print();
    setTimeout(() => frame.remove(), 60_000);
  });
}

const scenesOf = (nodes: CardNode[]) =>
  nodes.filter((n) => n.type === 'scene').sort((a, b) => (a.data.number ?? 0) - (b.data.number ?? 0));

async function storyboardPdf() {
  const { nodes, boards, currentId } = useStore.getState();
  const board = boards.find((b) => b.id === currentId)!;
  const scenes = scenesOf(nodes);
  if (!scenes.length) return toast('This board has no scene cards yet');
  const cells = await Promise.all(
    scenes.map(async (s) => {
      const src = s.data.mediaId && !s.data.hideFrame ? await getMediaUrl(s.data.mediaId) : null;
      return `<div class="scene">
        ${s.data.hideFrame ? '' : `<div class="frame">${src ? `<img src="${src}">` : 'No frame'}</div>`}
        <div class="meta"><span>Scene ${String(s.data.number ?? 1).padStart(2, '0')}</span><span>${esc(s.data.shot)}</span><span>${esc(s.data.duration)}</span></div>
        <div>${esc(s.data.text).replace(/\n/g, '<br>')}</div>
        ${s.data.audio ? `<div class="audio">Sound: ${esc(s.data.audio)}</div>` : ''}
      </div>`;
    }),
  );
  printHtml(
    `${board.name} — storyboard`,
    `<h1>${esc(board.name)}</h1><p class="sub">Storyboard · ${scenes.length} scenes</p><div class="scenes">${cells.join('')}</div>`,
  );
}

function shotListPrint() {
  const { nodes, boards, currentId } = useStore.getState();
  const board = boards.find((b) => b.id === currentId)!;
  const scenes = scenesOf(nodes);
  const lists = nodes.filter((n) => n.type === 'todo');
  if (!scenes.length && !lists.length) return toast('This board has no scenes or lists yet');
  const sceneTable = scenes.length
    ? `<h2>Shots</h2><table><tr><th></th><th>#</th><th>Shot</th><th>Length</th><th>Description</th><th>Sound</th></tr>${scenes
        .map(
          (s) =>
            `<tr><td><span class="box"></span></td><td>${s.data.number ?? ''}</td><td>${esc(s.data.shot)}</td><td>${esc(s.data.duration)}</td><td>${esc(s.data.text)}</td><td>${esc(s.data.audio)}</td></tr>`,
        )
        .join('')}</table>`
    : '';
  const listHtml = lists
    .map(
      (l) =>
        `<h2>${esc(l.data.title || 'List')}</h2><table>${(l.data.items ?? [])
          .filter((i) => i.text.trim())
          .map((i) => `<tr><td style="width:24px"><span class="box">${i.done ? '✓' : ''}</span></td><td>${esc(i.text)}</td></tr>`)
          .join('')}</table>`,
    )
    .join('');
  printHtml(`${board.name} — shot list`, `<h1>${esc(board.name)}</h1><p class="sub">Shot list</p>${sceneTable}${listHtml}`);
}

export function ExportMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const rf = useReactFlow();
  const { boards, currentId } = useStore();
  const board = boards.find((b) => b.id === currentId);

  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    window.addEventListener('pointerdown', close);
    return () => window.removeEventListener('pointerdown', close);
  }, [open]);

  const png = async () => {
    const nodes = rf.getNodes();
    if (!nodes.length) return toast('The board is empty');
    const bounds = getNodesBounds(nodes);
    const pad = 60;
    const scale = Math.min(2, 4000 / Math.max(bounds.width, bounds.height));
    const width = Math.round((bounds.width + pad * 2) * scale);
    const height = Math.round((bounds.height + pad * 2) * scale);
    const vp = getViewportForBounds(bounds, width, height, 0.05, 4, pad * scale);
    const el = document.querySelector('.react-flow__viewport') as HTMLElement;
    try {
      const url = await toPng(el, {
        backgroundColor: getComputedStyle(document.body).getPropertyValue('--bg').trim() || '#060607',
        width,
        height,
        pixelRatio: 1,
        style: { width: `${width}px`, height: `${height}px`, transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})` },
        filter: (n) => !(n as HTMLElement).classList?.contains('react-flow__handle'),
      });
      download(url, fileName(board?.name ?? 'board', 'png'));
    } catch (e) {
      toast(`Couldn't export the image: ${(e as Error).message}`);
    }
  };

  const md = async () => {
    const text = await boardMarkdown();
    download(URL.createObjectURL(new Blob([text], { type: 'text/markdown' })), fileName(board?.name ?? 'board', 'md'));
  };

  const item = (icon: React.ReactNode, label: string, hint: string, fn: () => void) => (
    <button
      className="menu-item"
      onClick={() => {
        setOpen(false);
        fn();
      }}
    >
      {icon}
      <span className="menu-text">
        {label}
        <small>{hint}</small>
      </span>
    </button>
  );

  return (
    <div className="export" ref={ref}>
      <button className="top-btn" onClick={() => setOpen(!open)} title="Export">
        <Download size={14} /> <span className="hide-sm">Export</span>
      </button>
      {open && (
        <div className="context-menu export-menu">
          {item(<ImageIcon size={14} />, 'Image (PNG)', 'The whole board as a picture', png)}
          {item(<Film size={14} />, 'Storyboard (PDF)', 'Scene cards with frames, ready to send', storyboardPdf)}
          {item(<ClipboardList size={14} />, 'Shot list (print)', 'Scenes and checklists for the set', shotListPrint)}
          {item(<FileText size={14} />, 'Markdown (.md)', 'Text version for docs and AI tools', md)}
        </div>
      )}
    </div>
  );
}
