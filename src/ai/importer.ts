// "Paste from AI": an AI assistant answers with a ```notebase block (format described in
// AI_GUIDE, which is appended to every board exported as text). This turns that block into
// cards, arrows and an optional section on the open board.

import type { XYPosition } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { makeCard, SIZES } from '../cards';
import type { CardData, CardEdge, CardNode, CardType, ProjectStatus } from '../types';
import { STATUS_LABELS } from '../types';

export const AI_GUIDE = `## For AI assistants: sending cards back to Notebase

The user can paste your reply into Notebase and it will turn into cards on their board. When you create or
rework content for the board (a storyboard, ideas, a shot list…), write your normal answer and then add ONE
fenced code block tagged \`notebase\` containing JSON in this shape:

\`\`\`notebase
{
  "section": "Storyboard v2",
  "cards": [
    { "id": "s1", "type": "scene", "number": 1, "shot": "Close-up", "duration": "3s",
      "text": "What happens in the shot", "audio": "VO / music / SFX", "prompt": "Image-generator prompt for this frame" },
    { "id": "s2", "type": "scene", "number": 2, "shot": "Wide", "duration": "6s", "text": "…", "audio": "…" },
    { "id": "n1", "type": "note", "title": "Hook ideas", "text": "Line one\\nLine two", "color": "#f59e0b", "tags": ["hook"] },
    { "type": "todo", "title": "Shot list", "items": ["Gimbal", "ND filters"] },
    { "type": "heading", "text": "Act 2" },
    { "type": "link", "url": "https://example.com", "title": "Reference" },
    { "type": "color", "hex": "#0f172a", "title": "Night blue" },
    { "type": "project", "title": "Brand film", "client": "Acme", "deadline": "2026-11-01", "fee": "$2,000", "status": "edit" }
  ],
  "links": [["s1", "s2"], { "from": "n1", "to": "s1", "label": "opens with" }]
}
\`\`\`

Rules: "type" is one of scene, note, todo, heading, link, video, image, color, project. Scene "shot" is usually one of
Wide, Medium, Close-up, Extreme close-up, Insert, POV, Drone, B-roll. Any card may also have "tags" (array),
"publishDate" (YYYY-MM-DD) and "platform" (YouTube, Shorts, Instagram, Reels, TikTok, X, LinkedIn, Podcast, Client, Other).
Job "status" is one of ${Object.keys(STATUS_LABELS).join(', ')}. "id" is only needed for cards used in "links".
"section" is optional and groups the new cards in a titled section. Cards are always added as new cards; nothing
on the board is changed or removed. Keep the JSON valid (double quotes, no comments).`;

const TYPES = new Set<CardType>(['scene', 'note', 'todo', 'heading', 'link', 'video', 'image', 'color', 'project']);
const STATUSES = new Set(Object.keys(STATUS_LABELS));
const str = (v: unknown, max = 4000) => (typeof v === 'string' ? v.slice(0, max) : typeof v === 'number' ? String(v) : undefined);

interface RawCard extends Record<string, unknown> {
  id?: string;
  type?: string;
}

export interface ParsedImport {
  section?: string;
  cards: { ref?: string; type: CardType; data: CardData }[];
  links: { from: string; to: string; label?: string }[];
}

/** The JSON inside a ```notebase block (or a bare JSON object that has "cards"). */
function extractJson(text: string): string | null {
  const fenced = text.match(/```\s*notebase\s*\n([\s\S]*?)```/i);
  if (fenced) return fenced[1];
  for (const m of text.matchAll(/```(?:json)?\s*\n([\s\S]*?)```/gi)) if (/"cards"\s*:/.test(m[1])) return m[1];
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && /"cards"\s*:/.test(trimmed)) return trimmed;
  return null;
}

/** Forgive the usual hand-written JSON slips: comments, trailing commas, smart quotes. */
function lenientParse(json: string): unknown {
  try {
    return JSON.parse(json);
  } catch {
    const cleaned = json
      .replace(/[“”]/g, '"')
      .replace(/^\s*\/\/.*$/gm, '')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/,\s*([}\]])/g, '$1');
    return JSON.parse(cleaned);
  }
}

export const hasNotebaseBlock = (text: string) => extractJson(text) !== null;

export function parseImport(text: string): ParsedImport {
  const json = extractJson(text);
  if (!json) throw new Error('No ```notebase block found in the text.');
  let raw: any;
  try {
    raw = lenientParse(json);
  } catch (e) {
    throw new Error(`The notebase block isn't valid JSON (${(e as Error).message}).`);
  }
  const list: RawCard[] = Array.isArray(raw) ? raw : Array.isArray(raw?.cards) ? raw.cards : [];
  if (!list.length) throw new Error('The notebase block has no cards.');

  const cards: ParsedImport['cards'] = [];
  for (const c of list.slice(0, 300)) {
    const type = (str(c.type) ?? 'note').toLowerCase().replace('job', 'project').replace('list', 'todo') as CardType;
    if (!TYPES.has(type)) continue;
    const data: CardData = {};
    const set = (key: keyof CardData, max?: number) => {
      const v = str(c[key as string], max);
      if (v !== undefined && v !== '') (data as any)[key] = v;
    };
    switch (type) {
      case 'scene':
        data.number = Number(c.number) || cards.filter((x) => x.type === 'scene').length + 1;
        set('shot', 60);
        set('duration', 30);
        set('audio', 500);
        set('prompt', 2000);
        data.text = str(c.text ?? c.description) ?? '';
        break;
      case 'note':
        set('title', 200);
        data.text = str(c.text ?? c.body) ?? '';
        break;
      case 'heading':
        data.text = str(c.text ?? c.title, 200) ?? 'Heading';
        break;
      case 'todo':
        set('title', 200);
        data.items = (Array.isArray(c.items) ? c.items : [])
          .slice(0, 100)
          .map((i: unknown) =>
            typeof i === 'string'
              ? { id: nanoid(6), text: i.slice(0, 500), done: false }
              : { id: nanoid(6), text: str((i as any)?.text, 500) ?? '', done: !!(i as any)?.done },
          );
        if (!data.items.length) data.items = [{ id: nanoid(6), text: '', done: false }];
        break;
      case 'link':
      case 'video':
      case 'image':
        set('url', 2000);
        set('title', 200);
        set('caption', 300);
        if (data.url && !/^https?:\/\//i.test(data.url)) delete data.url;
        if (type === 'link' && !data.url) continue;
        break;
      case 'color': {
        const hex = str(c.hex, 9);
        data.hex = hex && /^#[0-9a-f]{3,8}$/i.test(hex) ? hex : '#888888';
        set('title', 80);
        break;
      }
      case 'project':
        set('title', 200);
        set('client', 200);
        set('fee', 60);
        set('text', 2000);
        if (/^\d{4}-\d{2}-\d{2}$/.test(str(c.deadline) ?? '')) data.deadline = str(c.deadline);
        data.status = (STATUSES.has(str(c.status) ?? '') ? str(c.status) : 'brief') as ProjectStatus;
        break;
    }
    const color = str(c.color, 9);
    if (color && /^#[0-9a-f]{3,8}$/i.test(color) && (type === 'note' || type === 'todo' || type === 'scene')) data.color = color;
    if (Array.isArray(c.tags))
      data.tags = c.tags
        .filter((t) => typeof t === 'string')
        .map((t) => t.replace(/^#/, '').toLowerCase())
        .slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(str(c.publishDate) ?? '')) data.publishDate = str(c.publishDate);
    if (str(c.platform)) data.platform = str(c.platform, 30);
    cards.push({ ref: str(c.id, 60), type, data });
  }
  if (!cards.length) throw new Error('None of the cards had a type Notebase knows.');

  const links: ParsedImport['links'] = [];
  for (const l of Array.isArray(raw?.links) ? raw.links.slice(0, 500) : []) {
    const [from, to, label] = Array.isArray(l) ? l : [l?.from, l?.to, l?.label];
    if (typeof from === 'string' && typeof to === 'string') links.push({ from, to, label: str(label, 80) });
  }
  return { section: str(raw?.section ?? raw?.title, 120), cards, links };
}

export function summarize(p: ParsedImport) {
  const counts = new Map<string, number>();
  for (const c of p.cards) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  const names: Record<string, string> = {
    scene: 'scene',
    note: 'note',
    todo: 'list',
    heading: 'heading',
    link: 'link',
    video: 'video',
    image: 'image',
    color: 'color',
    project: 'job',
  };
  const parts = [...counts.entries()].map(([t, n]) => `${n} ${names[t]}${n > 1 ? 's' : ''}`);
  if (p.links.length) parts.push(`${p.links.length} connection${p.links.length > 1 ? 's' : ''}`);
  return parts.join(', ');
}

// ---------- Layout ----------

/** Rough rendered height, good enough to keep imported cards from overlapping. */
function estimateHeight(type: CardType, d: CardData) {
  const textLines = (s?: string, perLine = 34) =>
    (s ?? '').split('\n').reduce((n, l) => n + Math.max(1, Math.ceil(l.length / perLine)), 0);
  switch (type) {
    case 'scene':
      return 300 + textLines(d.text, 30) * 22 + (d.prompt ? 40 + textLines(d.prompt, 30) * 22 : 0);
    case 'note':
      return 80 + textLines(d.text) * 22 + (d.title ? 24 : 0);
    case 'todo':
      return 110 + (d.items?.length ?? 1) * 30;
    case 'heading':
      return 80;
    case 'color':
      return 170;
    case 'link':
      return d.url && /youtu\.?be/.test(d.url) ? 300 : 110;
    case 'video':
      return 300;
    case 'image':
      return 240;
    case 'project':
      return 320;
    default:
      return 160;
  }
}

/**
 * Lay the cards out from `origin`: a heading row first, scenes in storyboard order (4 per row), then
 * everything else in masonry columns underneath. Returns the cards, arrows and an optional section.
 */
export function buildImport(p: ParsedImport, origin: XYPosition, withSection: boolean) {
  const GAP = 40;
  const pad = withSection ? 32 : 0;
  const x0 = origin.x + pad;
  let y = origin.y + pad;
  const nodes: CardNode[] = [];
  const byRef = new Map<string, CardNode>();
  const place = (c: ParsedImport['cards'][number], pos: XYPosition) => {
    const node = makeCard(c.type, pos, c.data);
    nodes.push(node);
    if (c.ref) byRef.set(c.ref, node);
    return node;
  };
  let right = x0;

  const headings = p.cards.filter((c) => c.type === 'heading');
  for (const h of headings) {
    place(h, { x: x0, y });
    y += 90;
  }

  const scenes = p.cards.filter((c) => c.type === 'scene').sort((a, b) => (a.data.number ?? 0) - (b.data.number ?? 0));
  const sceneW = SIZES.scene!.width + GAP;
  for (let row = 0; row * 4 < scenes.length; row++) {
    const chunk = scenes.slice(row * 4, row * 4 + 4);
    chunk.forEach((s, i) => place(s, { x: x0 + i * sceneW, y }));
    right = Math.max(right, x0 + chunk.length * sceneW - GAP);
    y += Math.max(...chunk.map((s) => estimateHeight('scene', s.data))) + GAP;
  }

  const rest = p.cards.filter((c) => c.type !== 'heading' && c.type !== 'scene');
  if (rest.length) {
    const cols = Math.min(4, rest.length);
    const colW = 300 + GAP;
    const heights = new Array(cols).fill(y);
    for (const c of rest) {
      const col = heights.indexOf(Math.min(...heights));
      place(c, { x: x0 + col * colW, y: heights[col] });
      heights[col] += estimateHeight(c.type, c.data) + GAP;
    }
    right = Math.max(right, x0 + cols * colW - GAP);
    y = Math.max(...heights);
  } else y -= GAP;

  const edges: CardEdge[] = [];
  for (const l of p.links) {
    const a = byRef.get(l.from);
    const b = byRef.get(l.to);
    if (!a || !b || a === b) continue;
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    // Cards on another row connect top/bottom (e.g. a storyboard wrapping to the next line).
    const vertical = Math.abs(dy) > 150 || Math.abs(dy) > Math.abs(dx);
    edges.push({
      id: nanoid(10),
      source: a.id,
      target: b.id,
      sourceHandle: vertical ? (dy > 0 ? 'b' : 't') : dx >= 0 ? 'r' : 'l',
      targetHandle: vertical ? (dy > 0 ? 't' : 'b') : dx >= 0 ? 'l' : 'r',
      ...(l.label ? { label: l.label } : {}),
    });
  }

  if (withSection) {
    const frame = makeCard('frame', origin, { title: p.section || 'From AI', color: '#a78bfa' });
    frame.width = Math.max(320, right - origin.x + pad);
    // Heights are estimates, so leave some air at the bottom.
    frame.height = Math.max(200, y - origin.y + pad + 60);
    nodes.unshift(frame);
  }
  return { nodes, edges };
}
