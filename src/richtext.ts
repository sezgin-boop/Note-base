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
