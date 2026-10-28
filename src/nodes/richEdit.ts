import { TEXT_COLORS } from '../richtext';

/*
 * Formatting commands for the card text editor (an editable copy of the formatted view). Bold,
 * italic and strikethrough use the browser's own editing commands (they handle toggling and
 * partial selections); highlight, colors, big lines and bullets are applied here so they map
 * cleanly onto the stored text form (see editorToRich in richtext.ts).
 */

export type EditKind = 'bold' | 'italic' | 'strike' | 'mark' | 'h1' | 'li';

const inside = (root: HTMLElement) => {
  const sel = window.getSelection();
  if (!sel || !sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  return root.contains(range.commonAncestorContainer) ? { sel, range } : null;
};

/** The nearest element (inside the editor) around the selection start that matches. */
function around(root: HTMLElement, test: (el: HTMLElement) => boolean): HTMLElement | null {
  const at = inside(root);
  let n: Node | null = at ? at.range.startContainer : null;
  while (n && n !== root) {
    if (n instanceof HTMLElement && test(n)) return n;
    n = n.parentNode;
  }
  return null;
}

/** Replace an element by its contents (removes one formatting layer). */
function unwrap(el: HTMLElement) {
  const parent = el.parentNode;
  if (!parent) return;
  while (el.firstChild) parent.insertBefore(el.firstChild, el);
  parent.removeChild(el);
}

const highlighted = (el: HTMLElement) =>
  el.tagName === 'MARK' || (!!el.style.backgroundColor && !/transparent|rgba\(0, 0, 0, 0\)/.test(el.style.backgroundColor));
const colored = (el: HTMLElement) => el.tagName === 'FONT' || el.classList.contains('rt-c') || !!el.style.color;

/** Lines (top-level blocks) touched by the selection; loose text at the top level is wrapped first. */
function blocksInSelection(root: HTMLElement): HTMLElement[] {
  let loose: Node[] = [];
  const wrap = () => {
    if (!loose.length) return;
    const div = document.createElement('div');
    root.insertBefore(div, loose[0]);
    loose.forEach((n) => div.appendChild(n));
    loose = [];
  };
  for (const n of Array.from(root.childNodes)) {
    if (n instanceof HTMLElement && n.tagName === 'DIV') wrap();
    else loose.push(n);
  }
  wrap();
  const at = inside(root);
  if (!at) return [];
  return Array.from(root.children).filter((b): b is HTMLElement => b instanceof HTMLElement && at.range.intersectsNode(b));
}

const LINE_KINDS = ['rt-h1', 'rt-h2', 'rt-li', 'rt-todo', 'done'];

export function applyEdit(root: HTMLElement, kind: EditKind) {
  if (!inside(root)) return;
  document.execCommand('styleWithCSS', false, 'false');
  if (kind === 'bold') return void document.execCommand('bold');
  if (kind === 'italic') return void document.execCommand('italic');
  if (kind === 'strike') return void document.execCommand('strikeThrough');
  if (kind === 'mark') {
    const on = around(root, highlighted);
    if (on) return unwrap(on);
    return void document.execCommand('hiliteColor', false, '#fde68a');
  }
  const cls = kind === 'h1' ? 'rt-h1' : 'rt-li';
  const blocks = blocksInSelection(root);
  const all = blocks.length > 0 && blocks.every((b) => b.classList.contains(cls) && !b.classList.contains('rt-todo'));
  for (const b of blocks) {
    b.classList.remove(...LINE_KINDS);
    if (!all) b.classList.add(cls);
  }
}

/** Color the selection with a named text color (the same color again removes it). */
export function applyColor(root: HTMLElement, name: string) {
  if (!inside(root)) return;
  const on = around(root, colored);
  if (on) {
    const was =
      on.tagName === 'FONT'
        ? on.getAttribute('color')
        : on.classList.contains('rt-c')
          ? on.style.getPropertyValue('--rt')
          : on.style.color;
    unwrap(on);
    if ((was ?? '').toLowerCase() === TEXT_COLORS[name].toLowerCase()) return;
  }
  document.execCommand('styleWithCSS', false, 'false');
  document.execCommand('foreColor', false, TEXT_COLORS[name]);
}

/** After Enter: a new line after a heading is plain text, and a new checklist line isn't ticked. */
export function tidyNewLine(root: HTMLElement) {
  const block = around(root, (el) => el.parentElement === root);
  if (!block || block.textContent?.trim()) return;
  if (block.classList.contains('rt-h1') || block.classList.contains('rt-h2')) block.classList.remove('rt-h1', 'rt-h2');
  block.classList.remove('done');
}

/** Enter on an empty bullet line ends the list instead of adding another bullet. Returns true if handled. */
export function endListOnEnter(root: HTMLElement): boolean {
  const block = around(root, (el) => el.parentElement === root);
  if (!block || block.textContent?.trim() || !(block.classList.contains('rt-li') || block.classList.contains('rt-todo')))
    return false;
  block.classList.remove(...LINE_KINDS);
  return true;
}

/** Put the caret at a screen point (where the formatted text was clicked), or at the end. */
export function placeCaret(root: HTMLElement, at?: { x: number; y: number }) {
  const sel = window.getSelection();
  if (!sel) return;
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let range: Range | null = null;
  if (at) {
    if (doc.caretPositionFromPoint) {
      const p = doc.caretPositionFromPoint(at.x, at.y);
      if (p && root.contains(p.offsetNode)) {
        range = document.createRange();
        range.setStart(p.offsetNode, p.offset);
      }
    } else if (document.caretRangeFromPoint) {
      const r = document.caretRangeFromPoint(at.x, at.y);
      if (r && root.contains(r.startContainer)) range = r;
    }
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(root);
    range.collapse(false);
  }
  range.collapse(true);
  sel.removeAllRanges();
  sel.addRange(range);
}
