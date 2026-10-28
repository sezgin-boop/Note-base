// Lightweight formatting for card text. Text is stored as plain text with a few markers, so it
// stays readable in exports and for AI tools:
//
//   **bold**  *italic*  ~~strike~~  ==highlight==  :red[colored text]
//   # Big line      - bullet line      - [ ] / - [x] checkbox line
//
// It is shown formatted when the field isn't being edited.

export const TEXT_COLORS: Record<string, string> = {
  red: '#f87171',
  orange: '#fb923c',
  yellow: '#facc15',
  green: '#34d399',
  blue: '#60a5fa',
  purple: '#a78bfa',
  pink: '#f472b6',
  gray: '#9ca3af',
};

const COLOR_RE = new RegExp(`:(${Object.keys(TEXT_COLORS).join('|')})\\[([^\\]\\n]*)\\]`, 'g');

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function inline(s: string) {
  return esc(s)
    .replace(COLOR_RE, (_, c: string, t: string) => `<span class="rt-c" style="--rt:${TEXT_COLORS[c]}">${t}</span>`)
    .replace(/\*\*(?=\S)([^*]*?\S)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*\w])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1<em>$2</em>')
    .replace(/~~(?=\S)([^~]*?\S)~~/g, '<s>$1</s>')
    .replace(/==(?=\S)([^=]*?\S)==/g, '<mark>$1</mark>')
    .replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, '$1<a href="$2" target="_blank" rel="noreferrer">$2</a>')
    .replace(/(^|\s)#([\p{L}\p{N}_-]+)/gu, '$1<span class="rt-tag">#$2</span>');
}

/** Formatted HTML for display (input is escaped first, so it's safe to inject). */
export function renderRich(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const h = line.match(/^(#{1,2})\s+(.*)$/);
      if (h) return `<div class="rt-h${h[1].length}">${inline(h[2])}</div>`;
      const todo = line.match(/^\s*[-*]\s+\[( |x)\]\s+(.*)$/i);
      if (todo)
        return `<div class="rt-li rt-todo ${todo[1] !== ' ' ? 'done' : ''}"><span class="rt-box"></span>${inline(todo[2])}</div>`;
      const li = line.match(/^\s*[-*•]\s+(.*)$/);
      if (li) return `<div class="rt-li"><span class="rt-dot"></span>${inline(li[1])}</div>`;
      return line.trim() ? `<div>${inline(line)}</div>` : '<div class="rt-gap"></div>';
    })
    .join('');
}

/** Plain text without color markers (bold/italic markdown is kept — most tools read it). */
export const stripColors = (text: string) => text.replace(COLOR_RE, '$2');

/** Wrap the selection of a textarea in markers (or remove them if already wrapped). */
export function wrapSelection(el: HTMLTextAreaElement, before: string, after = before) {
  const { selectionStart: a, selectionEnd: b, value } = el;
  const sel = value.slice(a, b);
  let next: string;
  let start: number;
  let end: number;
  if (value.slice(a - before.length, a) === before && value.slice(b, b + after.length) === after) {
    next = value.slice(0, a - before.length) + sel + value.slice(b + after.length);
    start = a - before.length;
    end = start + sel.length;
  } else {
    next = value.slice(0, a) + before + sel + after + value.slice(b);
    start = a + before.length;
    end = start + sel.length;
  }
  return { next, start, end };
}

/** Toggle a prefix ("# ", "- ") on every line touched by the selection. */
export function toggleLinePrefix(el: HTMLTextAreaElement, prefix: string) {
  const { selectionStart: a, selectionEnd: b, value } = el;
  const lineStart = value.lastIndexOf('\n', a - 1) + 1;
  const lineEnd = value.indexOf('\n', b) === -1 ? value.length : value.indexOf('\n', b);
  const lines = value.slice(lineStart, lineEnd).split('\n');
  const all = lines.every((l) => l.startsWith(prefix));
  const changed = lines.map((l) => (all ? l.slice(prefix.length) : prefix + l.replace(/^(#{1,2} |- )/, ''))).join('\n');
  const next = value.slice(0, lineStart) + changed + value.slice(lineEnd);
  return { next, start: lineStart, end: lineStart + changed.length };
}

// ---------- Editing the formatted text directly ----------
//
// While a card's text is edited it shows formatted (no ** or == visible): the editor is the same
// HTML as the view, made editable. After each change it is turned back into the plain-text form
// above, which is what gets stored.

/** HTML for the editor: like the view, with empty lines that can hold the caret. */
export function richToEditorHtml(text: string): string {
  const html = renderRich(text).replace(/<div class="rt-gap"><\/div>/g, '<div><br></div>');
  return html || '<div><br></div>';
}

const hex = (v: string) => {
  const m = v.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (m) return '#' + [m[1], m[2], m[3]].map((n) => Number(n).toString(16).padStart(2, '0')).join('');
  return v.trim().toLowerCase();
};
/** The named text color closest to a CSS color the browser wrote (exact for the ones we apply). */
function colorName(v: string | null | undefined): string | null {
  if (!v) return null;
  const want = hex(v);
  for (const [name, c] of Object.entries(TEXT_COLORS)) if (c.toLowerCase() === want) return name;
  return null;
}

interface Ctx {
  bold?: boolean;
  italic?: boolean;
  strike?: boolean;
  mark?: boolean;
  color?: boolean;
}

/** Put markers around text, keeping spaces at the edges outside them (`** x**` isn't bold). */
function wrapMarks(inner: string, open: string, close = open) {
  const m = inner.match(/^(\s*)([\s\S]*?)(\s*)$/)!;
  return m[2] ? `${m[1]}${open}${m[2]}${close}${m[3]}` : inner;
}

function inlineOf(node: Node, ctx: Ctx): string {
  if (node.nodeType === Node.TEXT_NODE) return (node.textContent ?? '').replace(/ /g, ' ').replace(/​/g, '');
  if (!(node instanceof HTMLElement)) return '';
  const tag = node.tagName;
  if (tag === 'BR') return '\n';
  if (node.classList.contains('rt-dot') || node.classList.contains('rt-box')) return '';
  const st = node.style;
  const next = { ...ctx };
  const marks: [string, string][] = [];
  const color =
    tag === 'FONT'
      ? colorName(node.getAttribute('color'))
      : node.classList.contains('rt-c')
        ? colorName(st.getPropertyValue('--rt'))
        : colorName(st.color);
  if (color && !ctx.color) {
    marks.push([`:${color}[`, ']']);
    next.color = true;
  }
  const bold = tag === 'STRONG' || tag === 'B' || /^(bold|[6-9]00)$/.test(st.fontWeight);
  if (bold && !ctx.bold) (marks.push(['**', '**']), (next.bold = true));
  const italic = tag === 'EM' || tag === 'I' || st.fontStyle === 'italic';
  if (italic && !ctx.italic) (marks.push(['*', '*']), (next.italic = true));
  const strike = tag === 'S' || tag === 'STRIKE' || tag === 'DEL' || /line-through/.test(st.textDecoration);
  if (strike && !ctx.strike) (marks.push(['~~', '~~']), (next.strike = true));
  const bg = st.backgroundColor;
  const mark = tag === 'MARK' || (!!bg && bg !== 'transparent' && !/rgba\(0, 0, 0, 0\)/.test(bg));
  if (mark && !ctx.mark) (marks.push(['==', '==']), (next.mark = true));
  let inner = Array.from(node.childNodes)
    .map((c) => inlineOf(c, next))
    .join('');
  // Markers stop at line breaks: each line is formatted on its own.
  for (const [open, close] of marks.reverse())
    inner = inner
      .split('\n')
      .map((part) => wrapMarks(part, open, close))
      .join('\n');
  return inner;
}

const BLOCK = new Set(['DIV', 'P', 'LI', 'H1', 'H2', 'H3', 'UL', 'OL', 'BLOCKQUOTE']);
const isBlock = (n: Node): n is HTMLElement => n instanceof HTMLElement && BLOCK.has(n.tagName);

function prefixOf(el: HTMLElement): string {
  const c = el.classList;
  if (c.contains('rt-h1') || el.tagName === 'H1') return '# ';
  if (c.contains('rt-h2') || el.tagName === 'H2' || el.tagName === 'H3') return '## ';
  if (c.contains('rt-todo')) return c.contains('done') ? '- [x] ' : '- [ ] ';
  if (c.contains('rt-li') || el.tagName === 'LI') return '- ';
  return '';
}

/** The lines of one block (a block can hold line breaks or, after some edits, nested blocks). */
function blockLines(el: HTMLElement): string[] {
  const prefix = prefixOf(el);
  const out: string[] = [];
  let cur = '';
  let open = false;
  const flush = () => {
    out.push(...cur.split('\n').map((l, i) => (i === 0 ? prefix + l : l)));
    cur = '';
    open = false;
  };
  const kids = Array.from(el.childNodes);
  kids.forEach((k, i) => {
    if (isBlock(k)) {
      if (open) flush();
      out.push(...blockLines(k));
      return;
    }
    // A <br> that only keeps an empty line open (or ends the line) isn't a line of its own.
    if (k instanceof HTMLElement && k.tagName === 'BR' && i === kids.length - 1) {
      open = true;
      return;
    }
    cur += inlineOf(k, {});
    open = true;
  });
  if (open || !out.length) flush();
  return out;
}

/** The stored text for what's in the editor. */
export function editorToRich(root: HTMLElement): string {
  const lines: string[] = [];
  let loose: Node[] = [];
  const flushLoose = () => {
    if (!loose.length) return;
    const div = document.createElement('div');
    loose.forEach((n) => div.appendChild(n.cloneNode(true)));
    lines.push(...blockLines(div));
    loose = [];
  };
  for (const n of Array.from(root.childNodes)) {
    if (isBlock(n)) {
      flushLoose();
      lines.push(...blockLines(n));
    } else loose.push(n);
  }
  flushLoose();
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop();
  return lines.join('\n');
}
