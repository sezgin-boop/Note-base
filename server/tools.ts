// What Claude (or any MCP client) can do with the user's Notebase through the connector.

import { nanoid } from 'nanoid';
import { buildImport, parseImport, summarize } from '../src/ai/importer';
import { makeCard, SIZES } from '../src/cards';
import { applyHidden, collapseFrame, expandFrame, SECTION_LOOKS } from '../src/sections';
import { parseSkin, PRESETS } from '../src/skins';
import { boardsToMarkdown } from '../src/share/outline';
import type { BoardContent, CardData, CardEdge, CardNode, CardType, ProjectStatus } from '../src/types';
import { STATUS_LABELS } from '../src/types';
import { boardComments, changeBoard, getBoard, insertBoard, listBoards, mediaUrl, type BoardRow } from './db';
import { fetchMedia, type Fetched } from './media';
import { seal } from './seal';
import {
  afterManualMove,
  arrangeFrame,
  boxOf,
  descendants,
  findFrame,
  LAYOUTS,
  moveTo,
  owners,
  placeInFrame,
  takeOut,
  type Layout,
} from './layout';

export interface ToolContext {
  uid: string;
  origin: string;
}

interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  run: (args: any, ctx: ToolContext) => Promise<string>;
}

const BOARD_ARG = {
  type: 'string',
  description: 'Board id (from list_boards) or its exact name. "inbox" means the Inbox board.',
};

const CARD_TYPES = ['scene', 'note', 'todo', 'heading', 'link', 'video', 'image', 'color', 'project'];

const boardLink = (ctx: ToolContext, id: string) => `${ctx.origin}/?board=${id}`;

// ---------- Helpers ----------

async function resolveBoard(ctx: ToolContext, ref: string): Promise<BoardRow> {
  const wanted = String(ref ?? '').trim();
  if (!wanted) throw new Error('Say which board (id or name). Use list_boards to see them.');
  const boards = await listBoards(ctx.uid);
  if (wanted.toLowerCase() === 'inbox') {
    const inbox = boards.find((b) => b.inbox);
    if (inbox) return inbox;
    const id = nanoid(10);
    await insertBoard(ctx.uid, { id, name: 'Inbox', icon: '📥', parentId: null, content: { nodes: [], edges: [] }, inbox: true });
    return { id, name: 'Inbox', icon: '📥', parentId: null, updatedAt: Date.now(), inbox: true };
  }
  const byId = boards.find((b) => b.id === wanted);
  if (byId) return byId;
  const lower = wanted.toLowerCase();
  const exact = boards.filter((b) => b.name.trim().toLowerCase() === lower);
  if (exact.length === 1) return exact[0];
  const partial = exact.length ? exact : boards.filter((b) => b.name.toLowerCase().includes(lower));
  if (partial.length === 1) return partial[0];
  if (!partial.length) throw new Error(`No board called "${wanted}". Use list_boards to see the boards.`);
  throw new Error(`Several boards match "${wanted}": ${partial.map((b) => `${b.name} (id: ${b.id})`).join(', ')}. Use the id.`);
}

const sizeOf = (n: CardNode) => ({
  w: n.measured?.width ?? n.width ?? SIZES[n.type as CardType]?.width ?? 260,
  h: n.measured?.height ?? n.height ?? SIZES[n.type as CardType]?.height ?? 200,
});

/** Where new cards go: to the right of everything on the board, top-aligned. */
export function freeSpot(content: BoardContent) {
  const nodes = content.nodes ?? [];
  if (!nodes.length) return { x: 0, y: 0 };
  const right = Math.max(...nodes.map((n) => n.position.x + sizeOf(n).w));
  const top = Math.min(...nodes.map((n) => n.position.y));
  return { x: Math.round(right + 160), y: Math.round(top) };
}

function edgeBetween(a: CardNode, b: CardNode, label?: string): CardEdge {
  const dx = b.position.x - a.position.x;
  const dy = b.position.y - a.position.y;
  const vertical = Math.abs(dy) > 150 || Math.abs(dy) > Math.abs(dx);
  return {
    id: nanoid(10),
    source: a.id,
    target: b.id,
    sourceHandle: vertical ? (dy > 0 ? 'b' : 't') : dx >= 0 ? 'r' : 'l',
    targetHandle: vertical ? (dy > 0 ? 't' : 'b') : dx >= 0 ? 'l' : 'r',
    ...(label ? { label } : {}),
  };
}

const describe = (n: CardNode) => {
  const d = n.data;
  const name =
    n.type === 'scene'
      ? d.label || `Scene ${String(d.number ?? 1).padStart(2, '0')}`
      : String(d.title || d.text?.split('\n')[0] || d.caption || d.url || n.type).slice(0, 60);
  return `${n.type} "${name}" (id: ${n.id})`;
};

// ---------- Tools ----------

const listBoardsTool: Tool = {
  name: 'list_boards',
  title: 'List boards',
  description: "List all of the user's Notebase boards (name, id, parent board, last change).",
  inputSchema: { type: 'object', properties: {} },
  annotations: { readOnlyHint: true },
  async run(_args, ctx) {
    const boards = await listBoards(ctx.uid);
    if (!boards.length) return 'There are no boards yet. Use create_board to make one.';
    const byId = new Map(boards.map((b) => [b.id, b]));
    const path = (b: BoardRow): string => {
      const p = b.parentId ? byId.get(b.parentId) : undefined;
      return p ? `${path(p)} / ${b.name}` : b.name;
    };
    const lines = boards
      .map((b) => ({ b, p: path(b) }))
      .sort((x, y) => x.p.localeCompare(y.p))
      .map(
        ({ b, p }) =>
          `- ${b.icon} ${p} — id: ${b.id}${b.inbox ? ' (Inbox)' : ''} · changed ${new Date(b.updatedAt).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
      );
    return `${boards.length} boards:\n${lines.join('\n')}`;
  },
};

const readBoardTool: Tool = {
  name: 'read_board',
  title: 'Read a board',
  description:
    'Read everything on a board as text, in reading order: notes, lists, storyboard scenes, jobs, links, images ' +
    '(with their URLs), videos with their timestamped review comments, sections and the arrows between cards. ' +
    'Each card shows its id (used by update_card, move_cards, delete_cards and add_cards links) and where it is: ' +
    'x, y, w, h on the canvas and the id of the section it sits in; each section shows its bounds.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      include_sub_boards: { type: 'boolean', description: 'Also include the boards inside this board. Default false.' },
    },
    required: ['board'],
  },
  annotations: { readOnlyHint: true },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const all = await listBoards(ctx.uid, !!args.include_sub_boards);
    const board = await getBoard(ctx.uid, meta.id);
    if (!board) throw new Error('Board not found.');
    const subtree: BoardRow[] = [board];
    if (args.include_sub_boards) {
      const add = (id: string) => all.filter((b) => b.parentId === id).forEach((b) => (subtree.push(b), add(b.id)));
      add(board.id);
    }
    const comments = await boardComments(subtree.map((b) => b.id));
    const md = boardsToMarkdown(
      subtree.map((b) => ({ ...b, content: b.content ?? { nodes: [], edges: [] } })),
      {
        rootId: board.id,
        mediaUrl,
        comments,
        viewUrl: boardLink(ctx, board.id),
        withIds: true,
        boxOf,
        otherBoards: new Map(all.map((b) => [b.id, { name: b.name, icon: b.icon }])),
      },
    );
    return `Board id: ${board.id}\n\n${md}`;
  },
};

const addCardsTool: Tool = {
  name: 'add_cards',
  title: 'Add cards',
  description:
    'Add new cards to a board: storyboard scenes, notes, lists, headings, links, colors and jobs, optionally connected ' +
    'with arrows and grouped in a titled section. They are laid out automatically next to what is already there; ' +
    'existing cards are not changed. Text fields may use **bold**, *italic*, ==highlight==, ~~strike~~, ' +
    ':red[colored text] (red, orange, yellow, green, blue, purple, pink, gray), "# " big lines and "- " bullets. ' +
    'For photos or videos from the web use add_media instead.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      section: { type: 'string', description: 'Title of a section (frame) to group the new cards in.' },
      group: {
        type: 'boolean',
        description: 'Group the cards in a section. Default: yes when there are more than 3 cards or a section title.',
      },
      cards: {
        type: 'array',
        description: 'The cards to add.',
        items: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: CARD_TYPES, description: 'todo = checklist, project = client job.' },
            id: { type: 'string', description: 'Your own short reference (e.g. "s1"), only needed to connect cards in "links".' },
            label: { type: 'string', description: 'Small header above the card, e.g. "Hook" instead of "Scene 01".' },
            title: { type: 'string' },
            text: { type: 'string', description: 'Main text (note body, scene description, heading text, job notes).' },
            number: { type: 'number', description: 'Scene number.' },
            shot: {
              type: 'string',
              description: 'Scene shot type: Wide, Medium, Close-up, Extreme close-up, Insert, POV, Drone, B-roll.',
            },
            duration: { type: 'string', description: 'Scene length, e.g. "3s".' },
            audio: { type: 'string', description: 'Scene sound: voice-over, music, SFX.' },
            prompt: { type: 'string', description: 'Image-generator prompt for the scene frame.' },
            items: { type: 'array', items: { type: 'string' }, description: 'Checklist items (todo).' },
            url: { type: 'string', description: 'Link / video URL.' },
            hex: { type: 'string', description: 'Color card value, e.g. "#0f172a".' },
            color: { type: 'string', description: 'Accent color of a note, list, scene or heading (hex).' },
            client: { type: 'string' },
            deadline: { type: 'string', description: 'YYYY-MM-DD' },
            fee: { type: 'string' },
            status: { type: 'string', enum: Object.keys(STATUS_LABELS) },
            tags: { type: 'array', items: { type: 'string' } },
            publishDate: { type: 'string', description: 'YYYY-MM-DD — shows the card on the content calendar.' },
            platform: {
              type: 'string',
              description: 'YouTube, Shorts, Instagram, Reels, TikTok, X, LinkedIn, Podcast, Client, Other',
            },
          },
          required: ['type'],
        },
      },
      links: {
        type: 'array',
        description:
          'Arrows: {"from","to","label"?}. from/to are your card refs ("id" above) or ids of cards already on the board ' +
          '(cards may then be empty, to only connect existing cards).',
        items: {
          type: 'object',
          properties: { from: { type: 'string' }, to: { type: 'string' }, label: { type: 'string' } },
          required: ['from', 'to'],
        },
      },
    },
    required: ['board'],
  },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const links: { from: string; to: string; label?: string }[] = (Array.isArray(args.links) ? args.links : [])
      .filter((l: any) => l && l.from != null && l.to != null)
      .map((l: any) => ({ from: String(l.from).trim(), to: String(l.to).trim(), label: l.label ? String(l.label) : undefined }));
    const rawCards = Array.isArray(args.cards) ? args.cards : [];
    if (!rawCards.length && !links.length) throw new Error('Give "cards" to add, or "links" between cards.');
    const refs = new Set<string>(rawCards.map((c: any) => (c?.id != null ? String(c.id).trim() : '')).filter(Boolean));
    // Arrows between new cards are laid out with them; every other arrow is resolved below.
    const parsed = rawCards.length
      ? parseImport(
          JSON.stringify({
            section: args.section,
            cards: rawCards,
            links: links.filter((l) => refs.has(l.from) && refs.has(l.to)),
          }),
        )
      : null;
    const { result } = await changeBoard(ctx.uid, meta.id, (content) => {
      const withSection = args.group ?? (!!args.section || (parsed?.cards.length ?? 0) > 3);
      const built = parsed
        ? buildImport(parsed, freeSpot(content), withSection)
        : { nodes: [] as CardNode[], edges: [] as CardEdge[], byRef: new Map<string, CardNode>() };
      const { nodes, edges, byRef: newByRef } = built;
      // Arrows to or from cards that were already on the board (a new card's ref wins over an id).
      const existing = new Map(content.nodes.map((n) => [n.id, n]));
      const skipped: string[] = [];
      let linked = edges.length;
      for (const l of links) {
        if (refs.has(l.from) && refs.has(l.to)) continue;
        const a = newByRef.get(l.from) ?? existing.get(l.from);
        const b = newByRef.get(l.to) ?? existing.get(l.to);
        if (!a || !b) {
          skipped.push(`${l.from} → ${l.to} (no card ${!a ? l.from : l.to})`);
          continue;
        }
        if (a === b) {
          skipped.push(`${l.from} → ${l.to} (same card)`);
          continue;
        }
        if (content.edges.some((e) => e.source === a.id && e.target === b.id)) {
          skipped.push(`${l.from} → ${l.to} (already connected)`);
          continue;
        }
        edges.push(edgeBetween(a, b, l.label?.slice(0, 80)));
        linked++;
      }
      content.nodes.push(...nodes);
      content.edges.push(...edges);
      const frame = nodes.find((n) => n.type === 'frame');
      if (args.collapsed && frame) content.nodes = applyHidden(collapseFrame(content.nodes, frame.id));
      return { nodes, linked, skipped };
    });
    return [
      parsed ? `Added to "${meta.name}": ${summarize(parsed)}.` : `Updated "${meta.name}".`,
      result.nodes.length ? `New cards: ${result.nodes.map(describe).join(', ')}` : '',
      links.length || result.linked ? `Arrows added: ${result.linked}.` : '',
      result.skipped.length ? `Arrows not added: ${result.skipped.join('; ')}.` : '',
      `Open: ${boardLink(ctx, meta.id)}`,
    ]
      .filter(Boolean)
      .join('\n');
  },
};

const addMediaTool: Tool = {
  name: 'add_media',
  title: 'Add photos, videos and links',
  description:
    'Add images, videos or web pages to a board from their URLs. Image and video files (jpg, png, webp, gif, mp4, mov…) are ' +
    'downloaded and stored in Notebase; YouTube and Vimeo links become playable video cards; other pages become link cards ' +
    'with their title. Good for moodboards and reference boards. Up to 20 at a time.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string', description: 'Direct link to the image/video file, or a YouTube/Vimeo/web page.' },
            caption: { type: 'string', description: 'Caption shown under the card.' },
          },
          required: ['url'],
        },
      },
      section: { type: 'string', description: 'Group them in a section with this title.' },
      collapsed: { type: 'boolean', description: 'Add that section folded into a compact bar.' },
    },
    required: ['board', 'items'],
  },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const items: { url: string; caption?: string }[] = (Array.isArray(args.items) ? args.items : []).slice(0, 20);
    if (!items.length) throw new Error('Give at least one URL in "items".');
    const fetched = await Promise.all(
      items.map((it) =>
        fetchMedia(String(it.url ?? '')).then(
          (f): { ok: true; f: Fetched; caption?: string } => ({ ok: true, f, caption: it.caption }),
          (e): { ok: false; error: string } => ({ ok: false, error: (e as Error).message }),
        ),
      ),
    );
    const good = fetched.filter((x) => x.ok) as { ok: true; f: Fetched; caption?: string }[];
    const failed = fetched.filter((x) => !x.ok) as { ok: false; error: string }[];
    if (!good.length) throw new Error(`Nothing could be added:\n${failed.map((f) => `- ${f.error}`).join('\n')}`);

    const { result } = await changeBoard(ctx.uid, meta.id, (content) => {
      const origin = freeSpot(content);
      const withSection = !!args.section || good.length > 3;
      const pad = withSection ? 32 : 0;
      const GAP = 40;
      const cols = Math.min(4, good.length);
      const colW = 280 + GAP;
      const heights = new Array(cols).fill(origin.y + pad);
      const nodes: CardNode[] = [];
      for (const { f, caption } of good) {
        const col = heights.indexOf(Math.min(...heights));
        const at = { x: origin.x + pad + col * colW, y: heights[col] };
        let node: CardNode;
        if (f.kind === 'image') {
          node = makeCard('image', at, { mediaId: f.mediaId, caption: caption ?? f.title });
          // Keep the photo's proportions (plus room for the caption).
          if (f.aspect) node.height = Math.round(Math.min(560, Math.max(120, 280 / f.aspect)) + 44);
        } else if (f.kind === 'video') node = makeCard('video', at, { mediaId: f.mediaId, caption: caption ?? f.title });
        else if (f.kind === 'embed') node = makeCard('video', at, { url: f.url, caption });
        else node = makeCard('link', at, { url: f.url, title: f.title, caption });
        node.width = 280; // one column width for every kind (videos are wider by default)
        nodes.push(node);
        const h = node.height ?? (node.type === 'video' ? 300 : node.type === 'link' ? 120 : 240);
        heights[col] += h + GAP;
      }
      if (withSection) {
        const frame = makeCard('frame', origin, { title: args.section || 'References', color: '#a78bfa' });
        frame.width = cols * colW - GAP + pad * 2;
        frame.height = Math.max(...heights) - origin.y + pad;
        nodes.unshift(frame);
      }
      content.nodes.push(...nodes);
      if (args.collapsed && withSection) content.nodes = applyHidden(collapseFrame(content.nodes, nodes[0].id));
      return nodes;
    });
    const added = result.filter((n) => n.type !== 'frame');
    return (
      `Added ${added.length} card${added.length > 1 ? 's' : ''} to "${meta.name}": ${added.map(describe).join(', ')}` +
      (failed.length ? `\nNot added:\n${failed.map((f) => `- ${f.error}`).join('\n')}` : '') +
      `\nOpen: ${boardLink(ctx, meta.id)}`
    );
  },
};

const EDITABLE: Record<string, 'string' | 'number' | 'tags' | 'items' | 'boolean'> = {
  hideFrame: 'boolean',
  text: 'string',
  title: 'string',
  label: 'string',
  shot: 'string',
  duration: 'string',
  audio: 'string',
  prompt: 'string',
  number: 'number',
  caption: 'string',
  url: 'string',
  hex: 'string',
  color: 'string',
  client: 'string',
  deadline: 'string',
  fee: 'string',
  status: 'string',
  publishDate: 'string',
  platform: 'string',
  tags: 'tags',
  items: 'items',
  icon: 'string',
  look: 'string',
};

const updateCardTool: Tool = {
  name: 'update_card',
  title: 'Edit a card',
  description:
    'Change fields of one card (ids come from read_board): text, title, label (the small header), scene shot / duration / ' +
    'audio / prompt / number, job client / deadline / fee / status, color, caption, url, tags, publishDate, platform, or a ' +
    `list's items, or style (the card's whole look: one of ${PRESETS.map((p) => p.id).join(', ')}, a color ` +
    '{"kind":"color","from":"#hex","to":"#hex"} or "default"). Scenes also take hideFrame (true hides the picture area). ' +
    'Sections also take collapsed (true folds the section into a compact bar, false opens it), icon (an ' +
    'emoji) and look (tint, solid, outline, dashed). Only the given fields change; an empty string clears a field. ' +
    'To move the card (it keeps its id, comments and arrows): "section" puts it in that section (id or title; without ' +
    'x / y it takes the next free spot inside and the section grows to fit; null takes it out), "x" / "y" set its ' +
    'position on the canvas (same coordinates as read_board), "w" / "h" its size. Moving a section moves its cards too.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      card: { type: 'string', description: 'Card id.' },
      section: { type: ['string', 'null'], description: 'Move into this section (id or title); null = take it out.' },
      x: { type: 'number', description: 'New x on the canvas.' },
      y: { type: 'number', description: 'New y on the canvas.' },
      w: { type: 'number', description: 'New width.' },
      h: { type: 'number', description: 'New height.' },
      changes: {
        type: 'object',
        description:
          'Fields to set. "items" (lists) replaces all items: an array of strings or {"text","done"}. ' +
          `Job "status" is one of ${Object.keys(STATUS_LABELS).join(', ')}.`,
        additionalProperties: true,
      },
    },
    required: ['board', 'card'],
  },
  annotations: { idempotentHint: true },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const {
      collapsed,
      section: sectionIn,
      x: xIn,
      y: yIn,
      w: wIn,
      h: hIn,
      ...changes
    } = args.changes && typeof args.changes === 'object' ? args.changes : ({} as any);
    // Position fields may come at the top level or inside "changes".
    const section = args.section !== undefined ? args.section : sectionIn;
    const num = (v: unknown) =>
      v === undefined || v === null || v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v);
    const move = { x: num(args.x ?? xIn), y: num(args.y ?? yIn), w: num(args.w ?? wIn), h: num(args.h ?? hIn) };
    const { result } = await changeBoard(ctx.uid, meta.id, (content) => {
      let node = content.nodes.find((n) => n.id === args.card);
      if (!node) throw new Error(`No card with id ${args.card} on "${meta.name}". Use read_board to see card ids.`);
      const moved = relocate(content, node, section, move);
      node = content.nodes.find((n) => n.id === args.card)!;
      if (typeof collapsed === 'boolean') {
        if (node.type !== 'frame') throw new Error('Only sections can be collapsed.');
        content.nodes = applyHidden((collapsed ? collapseFrame : expandFrame)(content.nodes, node.id));
        node = content.nodes.find((n) => n.id === args.card)!;
      }
      const patch: CardData = {};
      const skipped: string[] = [];
      if ('style' in changes) {
        const v = (changes as any).style;
        const skin = v === 'default' || v === null || v === '' ? undefined : parseSkin(v);
        if (skin || v === 'default' || v === null || v === '') {
          const { skin: _, ...data } = node.data;
          node.data = skin ? { ...data, skin } : data;
        } else skipped.push(`style ${JSON.stringify(v)}`);
        delete (changes as any).style;
      }
      for (const [k, v] of Object.entries(changes)) {
        const kind = EDITABLE[k];
        if (!kind) {
          skipped.push(k);
          continue;
        }
        if (kind === 'number') patch[k] = Number(v) || undefined;
        else if (kind === 'boolean') patch[k] = v === true || v === 'true' || undefined;
        else if (kind === 'tags') patch.tags = Array.isArray(v) ? v.map((t) => String(t).replace(/^#/, '').toLowerCase()) : [];
        else if (kind === 'items')
          patch.items = (Array.isArray(v) ? v : []).map((i: any) =>
            typeof i === 'string'
              ? { id: nanoid(6), text: i, done: false }
              : { id: nanoid(6), text: String(i?.text ?? ''), done: !!i?.done },
          );
        else patch[k] = v === '' || v === null ? undefined : String(v).slice(0, 8000);
      }
      if (patch.url && !/^https?:\/\//i.test(patch.url)) {
        skipped.push(`url "${patch.url}" (only http/https links)`);
        delete patch.url;
      }
      if (patch.look !== undefined && !SECTION_LOOKS.some((l) => l.id === patch.look)) {
        skipped.push(`look "${patch.look}"`);
        delete patch.look;
      }
      if (patch.status !== undefined && !(patch.status in STATUS_LABELS)) {
        skipped.push(`status "${patch.status}"`);
        delete patch.status;
      }
      if (patch.status) patch.status = patch.status as ProjectStatus;
      node.data = { ...node.data, ...patch };
      for (const k of Object.keys(node.data)) if (node.data[k] === undefined) delete node.data[k];
      return { node, skipped, moved };
    });
    return (
      `Updated ${describe(result.node)} on "${meta.name}".` +
      (result.moved ? ` ${result.moved}` : '') +
      (result.skipped.length ? ` Ignored: ${result.skipped.join(', ')}.` : '') +
      `\nOpen: ${boardLink(ctx, meta.id)}`
    );
  },
};

/** Where a card is, for tool results: "now at x 10, y 20 (280×200) in section abc". */
function whereText(content: BoardContent, id: string) {
  const n = content.nodes.find((c) => c.id === id)!;
  const b = boxOf(n);
  const sec = owners(content.nodes).get(id);
  return `now at x ${b.x}, y ${b.y} (${b.w}×${b.h})${sec ? ` in section ${sec}` : ', outside sections'}`;
}

/**
 * Move / resize a card in place (update_card): `section` (id or title, null = out), x / y, w / h.
 * Returns a sentence about what happened, or '' when nothing was asked.
 */
function relocate(
  content: BoardContent,
  node: CardNode,
  section: unknown,
  move: { x?: number; y?: number; w?: number; h?: number },
): string {
  const hasXY = move.x !== undefined || move.y !== undefined;
  if (section === undefined && !hasXY && move.w === undefined && move.h === undefined) return '';
  if (move.w !== undefined || move.h !== undefined) {
    const w = move.w !== undefined ? Math.max(40, Math.round(move.w)) : undefined;
    const h = move.h !== undefined ? Math.max(30, Math.round(move.h)) : undefined;
    if (node.type === 'frame' && node.data.collapsed) {
      const open = node.data.openSize ?? { width: 560, height: 380 };
      node.data.openSize = { width: w ?? open.width, height: h ?? open.height };
    } else {
      if (w !== undefined) node.width = w;
      // Notes and lists grow with their text: a height is the least they take.
      if (h !== undefined) {
        if (node.type === 'note' || node.type === 'todo') node.data.minH = h;
        else node.height = h;
      }
      delete node.measured; // the app measures it again
    }
  }
  if (hasXY) moveTo(content, node, move.x ?? node.position.x, move.y ?? node.position.y);

  if (section === null || section === '') {
    if (!hasXY) takeOut(content, [node]);
    else afterManualMove(content, node, null);
  } else if (section !== undefined) {
    const frame = findFrame(content, String(section));
    if (frame.id === node.id || (node.type === 'frame' && descendants(content, node.id).some((d) => d.id === frame.id)))
      throw new Error("A section can't go inside itself.");
    if (hasXY) {
      const f = boxOf(frame);
      const b = boxOf(node);
      if (!(b.x + b.w / 2 >= f.x && b.y + b.h / 2 >= f.y))
        throw new Error(
          `x / y put the card outside section ${frame.id} (it starts at x ${f.x}, y ${f.y}). Leave x / y out to place it automatically.`,
        );
      afterManualMove(content, node, frame);
    } else if (owners(content.nodes).get(node.id) !== frame.id) placeInFrame(content, frame, [node], 'free');
  } else afterManualMove(content, node, null);
  return `Moved: ${whereText(content, node.id)}.`;
}

const moveCardsTool: Tool = {
  name: 'move_cards',
  title: 'Move cards into a section',
  description:
    'Move existing cards into one section in a single call, without recreating them (ids, comments, video review ' +
    'notes and arrows stay). They are laid out inside the section in the given order, left to right in rows under ' +
    'what is already there, without overlaps, and the section grows to fit. Moving a section moves its cards too. ' +
    'To re-lay out a whole section afterwards use arrange_section.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      cards: { type: 'array', items: { type: 'string' }, description: 'Ids of the cards to move.' },
      section: { type: 'string', description: 'Id or title of the section to move them into.' },
      order: {
        type: 'array',
        items: { type: 'string' },
        description: 'Optional order to lay them out in (ids); cards not listed follow in the "cards" order.',
      },
    },
    required: ['board', 'cards', 'section'],
  },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const ids: string[] = [...new Set<string>((Array.isArray(args.cards) ? args.cards : []).map(String))];
    if (!ids.length) throw new Error('Give the ids of the cards to move in "cards".');
    const order: string[] = (Array.isArray(args.order) ? args.order : []).map(String).filter((id: string) => ids.includes(id));
    const sequence = [...new Set([...order, ...ids])];
    const { result } = await changeBoard(ctx.uid, meta.id, (content) => {
      const frame = findFrame(content, String(args.section ?? ''));
      const missing = sequence.filter((id) => !content.nodes.some((n) => n.id === id));
      const cards = sequence.map((id) => content.nodes.find((n) => n.id === id)).filter(Boolean) as CardNode[];
      for (const c of cards)
        if (c.id === frame.id || (c.type === 'frame' && descendants(content, c.id).some((d) => d.id === frame.id)))
          throw new Error(`Section ${c.id} can't go inside itself.`);
      // Cards inside a section that is moving along go with it, not separately.
      const carried = new Set(
        cards.filter((c) => c.type === 'frame').flatMap((c) => descendants(content, c.id).map((d) => d.id)),
      );
      const list = cards.filter((c) => !carried.has(c.id));
      if (list.length) placeInFrame(content, frame, list, 'flow');
      const f = boxOf(content.nodes.find((n) => n.id === frame.id)!);
      return { moved: list.map((c) => c.id), missing, frame: frame.id, size: `${f.w}×${f.h}` };
    });
    return (
      `Moved ${result.moved.length} card${result.moved.length === 1 ? '' : 's'} into section ${result.frame} on "${meta.name}" ` +
      `(section now ${result.size}).` +
      (result.missing.length ? ` Not found: ${result.missing.join(', ')}.` : '') +
      `\nOpen: ${boardLink(ctx, meta.id)}`
    );
  },
};

const arrangeSectionTool: Tool = {
  name: 'arrange_section',
  title: 'Arrange a section',
  description:
    'Lay out the cards of one section again, tightly and without overlaps, and fit the section around them. Cards keep ' +
    'their ids, comments and arrows. Layouts: "reference" — videos then images in the top row, scenes in number order ' +
    'left to right (wrapping), notes labelled "3D", "3D tricks" or "Build" in a column on the right, then the reference ' +
    'note followed by the other notes and cards, and color cards in a bottom row. "grid" — every card in reading order, ' +
    'left to right, wrapping at the section width.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      section: { type: 'string', description: 'Id or title of the section.' },
      layout: { type: 'string', enum: [...LAYOUTS], description: 'Default "reference".' },
    },
    required: ['board', 'section'],
  },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const layout = (LAYOUTS as readonly string[]).includes(args.layout) ? (args.layout as Layout) : 'reference';
    const { result } = await changeBoard(ctx.uid, meta.id, (content) => {
      const frame = findFrame(content, String(args.section ?? ''));
      const { moved } = arrangeFrame(content, frame, layout);
      const f = boxOf(content.nodes.find((n) => n.id === frame.id)!);
      return { moved, frame: frame.id, box: f };
    });
    return (
      `Arranged ${result.moved} card${result.moved === 1 ? '' : 's'} in section ${result.frame} ("${layout}" layout). ` +
      `The section is now at x ${result.box.x}, y ${result.box.y}, ${result.box.w}×${result.box.h}.` +
      `\nOpen: ${boardLink(ctx, meta.id)}`
    );
  },
};

const deleteCardsTool: Tool = {
  name: 'delete_cards',
  title: 'Delete cards',
  description:
    'Delete cards (and their arrows) from a board by id. Deleting a section deletes only the frame, not the cards in it. ' +
    'The user can undo in the app only while the board is open, so confirm with the user before deleting.',
  inputSchema: {
    type: 'object',
    properties: { board: BOARD_ARG, cards: { type: 'array', items: { type: 'string' }, description: 'Card ids.' } },
    required: ['board', 'cards'],
  },
  annotations: { destructiveHint: true },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    const ids = new Set<string>((Array.isArray(args.cards) ? args.cards : []).map(String));
    const { result } = await changeBoard(ctx.uid, meta.id, (content) => {
      const gone = content.nodes.filter((n) => ids.has(n.id));
      // Deleting a folded section brings its cards back.
      content.nodes = applyHidden(content.nodes.filter((n) => !ids.has(n.id)));
      content.edges = content.edges.filter((e) => !ids.has(e.source) && !ids.has(e.target));
      return gone;
    });
    const missing = [...ids].filter((id) => !result.some((n) => n.id === id));
    return (
      `Deleted ${result.length} card${result.length === 1 ? '' : 's'} from "${meta.name}"` +
      (result.length ? `: ${result.map(describe).join(', ')}` : '') +
      (missing.length ? `. Not found: ${missing.join(', ')}` : '')
    );
  },
};

const createBoardTool: Tool = {
  name: 'create_board',
  title: 'Create a board',
  description: 'Create a new empty board, optionally inside another board (it then appears there as a board card).',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      icon: { type: 'string', description: 'One emoji, e.g. "🎬". Default 📁.' },
      parent: { type: 'string', description: 'Id or name of the board to put it in. Leave out for a top-level board.' },
    },
    required: ['name'],
  },
  async run(args, ctx) {
    const name =
      String(args.name ?? '')
        .trim()
        .slice(0, 120) || 'New board';
    const icon =
      String(args.icon ?? '')
        .trim()
        .slice(0, 8) || '📁';
    const parent = args.parent ? await resolveBoard(ctx, args.parent) : null;
    const id = nanoid(10);
    await insertBoard(ctx.uid, { id, name, icon, parentId: parent?.id ?? null, content: { nodes: [], edges: [] } });
    if (parent)
      await changeBoard(ctx.uid, parent.id, (content) => {
        content.nodes.push(makeCard('board', freeSpot(content), { boardId: id }));
      });
    return `Created ${icon} "${name}" (id: ${id})${parent ? ` inside "${parent.name}"` : ''}.\nOpen: ${boardLink(ctx, id)}`;
  },
};

const searchTool: Tool = {
  name: 'search',
  title: 'Search all boards',
  description: 'Find cards across all boards whose text, title, captions, links, list items or tags contain the words.',
  inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
  annotations: { readOnlyHint: true },
  async run(args, ctx) {
    const words = String(args.query ?? '')
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    if (!words.length) throw new Error('Give some words to search for.');
    const boards = await listBoards(ctx.uid, true);
    const hits: string[] = [];
    for (const b of boards)
      for (const n of b.content?.nodes ?? []) {
        const d = n.data;
        const hay = [
          d.title,
          d.text,
          d.label,
          d.audio,
          d.prompt,
          d.caption,
          d.url,
          d.client,
          ...(d.items ?? []).map((i) => i.text),
          ...(d.tags ?? []),
        ]
          .filter(Boolean)
          .join('\n');
        const low = hay.toLowerCase();
        if (!words.every((w) => low.includes(w))) continue;
        const at = low.indexOf(words[0]);
        const snippet = hay.slice(Math.max(0, at - 60), at + 100).replace(/\s+/g, ' ');
        hits.push(`- ${b.icon} ${b.name} (board id: ${b.id}) › ${describe(n)}: …${snippet}…`);
        if (hits.length >= 40) break;
      }
    return hits.length ? `${hits.length} match${hits.length > 1 ? 'es' : ''}:\n${hits.join('\n')}` : 'No cards match.';
  },
};

const uploadLinkTool: Tool = {
  name: 'get_upload_link',
  title: 'Get an upload link for photos / videos',
  description:
    'Photos and videos the user attaches in the chat cannot be passed to this connector directly. This makes a link ' +
    '(valid 60 minutes) that puts uploaded images and videos onto a board as cards. If you have a code sandbox that holds ' +
    'the files and can reach the internet, upload each one yourself with the curl command from the result. Otherwise ' +
    'give the user the page link: they open it, pick the files from their phone or computer, and the cards appear.',
  inputSchema: {
    type: 'object',
    properties: {
      board: BOARD_ARG,
      section: { type: 'string', description: 'Optional: id or title of a section the files should go into.' },
    },
    required: ['board'],
  },
  async run(args, ctx) {
    const meta = await resolveBoard(ctx, args.board);
    if (args.section) {
      const board = await getBoard(ctx.uid, meta.id);
      findFrame(board?.content ?? { nodes: [], edges: [] }, String(args.section)); // fails early if there is no such section
    }
    const token = await seal({ t: 'upload', uid: ctx.uid, board: meta.id, exp: Math.floor(Date.now() / 1000) + 3600 });
    const link =
      `${ctx.origin}/api/upload?t=${encodeURIComponent(token)}` +
      (args.section ? `&section=${encodeURIComponent(String(args.section))}` : '');
    return [
      `Upload link for "${meta.name}" (valid 60 minutes).`,
      '',
      `For the user (open on phone or computer, pick photos / videos, up to 50 MB each):`,
      link,
      '',
      'From a code sandbox, one request per file (max 4 MB each — shrink bigger photos first, e.g. to 2560 px JPEG):',
      `curl -sS -X POST --data-binary @"/path/to/photo.jpg" -H "content-type: image/jpeg" "${link}&name=photo.jpg"`,
      'Optional: &caption=… . Each file becomes an image / video card; files from this link are laid out together' +
        (args.section ? ', inside the section.' : '. Add &section=<section id or title> to put them in a section.'),
      `Open the board: ${boardLink(ctx, meta.id)}`,
    ].join('\n');
  },
};

export const TOOLS: Tool[] = [
  listBoardsTool,
  readBoardTool,
  searchTool,
  addCardsTool,
  addMediaTool,
  updateCardTool,
  moveCardsTool,
  arrangeSectionTool,
  deleteCardsTool,
  createBoardTool,
  uploadLinkTool,
];

export const INSTRUCTIONS =
  "Notebase is the user's visual canvas for notes, plans, storyboards, moodboards, client jobs and video reviews. " +
  'Start with list_boards (or search), read_board before editing, then add_cards / add_media / update_card. ' +
  'To reorganise, move cards (update_card with section / x / y, move_cards, arrange_section) instead of deleting and ' +
  're-adding them: moving keeps their comments, review notes and arrows. ' +
  "Lay out storyboards as scene cards connected with arrows in order. Changes appear in the user's app within " +
  'about 30 seconds; share the "Open" link from the result so they can jump to the board. Photos or videos the user ' +
  'attaches in the chat: call get_upload_link and upload them from your code sandbox, or give the user the link.';
