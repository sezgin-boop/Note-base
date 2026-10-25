import {
  Handle,
  NodeResizeControl,
  NodeResizer,
  NodeToolbar,
  Position,
  ResizeControlVariant,
  useUpdateNodeInternals,
} from '@xyflow/react';
import type { ReactNode } from 'react';
import { AArrowDown, AArrowUp, Heading, Highlighter, List } from 'lucide-react';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { usePreviewUrl } from '../db';
import { renderRich, TEXT_COLORS, toggleLinePrefix, wrapSelection } from '../richtext';
import { skinLook } from '../skins';
import { useStore } from '../store';
import { stepTextSize, textScale } from '../types';
import { useEditingCard } from './editing';
import { CardMeta, useCardNode } from './meta';

const HANDLES: [string, Position][] = [
  ['l', Position.Left],
  ['r', Position.Right],
  ['t', Position.Top],
  ['b', Position.Bottom],
];

export function Handles() {
  return (
    <>
      {HANDLES.map(([id, pos]) => (
        <Handle key={id} id={id} type="source" position={pos} className="handle" />
      ))}
    </>
  );
}

interface ShellProps {
  icon: ReactNode;
  label: string;
  selected?: boolean;
  color?: string;
  /** true: free · 'width': sideways only · 'grow': free, but the card never gets shorter than its text */
  resizable?: boolean | 'width' | 'grow';
  minWidth?: number;
  minHeight?: number;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
}

/** Common card chrome: small header label (like node editors), accent stripe, handles, resizer. */
export function Shell({
  icon,
  label,
  selected,
  color,
  resizable,
  minWidth = 140,
  minHeight = 60,
  actions,
  className = '',
  children,
}: ShellProps) {
  const node = useCardNode();
  const skin = node?.data.skin;
  const skinImage = usePreviewUrl(skin?.kind === 'image' ? skin.mediaId : undefined);
  const look = skin ? skinLook(skin, skinImage) : null;
  const textSize = node?.data.textSize;
  const style = {
    ...(color ? { '--accent': color } : {}),
    ...(textSize ? { '--ts': textScale(textSize) } : {}),
    ...(resizable === 'grow' && node?.data.minH ? { minHeight: node.data.minH } : {}),
  } as React.CSSProperties;
  return (
    <div
      className={`card ${className} ${selected ? 'is-selected' : ''} ${color ? 'has-accent' : ''} ${look ? `skinned ink-${look.ink}` : ''}`}
      data-ts={textSize}
      data-resize={resizable === 'grow' ? 'grow' : undefined}
      data-min-w={resizable ? minWidth : undefined}
      data-min-h={resizable ? minHeight : undefined}
      style={style}
    >
      {look && (
        <span className="card-skin" aria-hidden>
          <span className="card-skin-bg" style={{ background: look.background, filter: look.filter }} />
          {look.dim && <span className="card-skin-dim" style={{ background: look.dim }} />}
        </span>
      )}
      {resizable === 'width' &&
        selected &&
        (['left', 'right'] as const).map((side) => (
          <NodeResizeControl
            key={side}
            position={side}
            variant={ResizeControlVariant.Line}
            resizeDirection="horizontal"
            minWidth={minWidth}
            className="width-resizer"
          />
        ))}
      {resizable === true && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={minWidth}
          minHeight={minHeight}
          lineClassName="resize-line"
          handleClassName="resize-handle"
        />
      )}
      <div className="card-label">
        <span className="card-label-icon">{icon}</span>
        <CardLabel fallback={label} />
        <span className="card-actions">{actions}</span>
      </div>
      <div className="card-body">
        {children}
        {node && node.type !== 'frame' && <CardMeta node={node} />}
      </div>
      {/* after the body, so its handles sit on top of the text */}
      {resizable === 'grow' && node && <GrowResizer id={node.id} selected={!!selected} minWidth={minWidth} />}
      <Handles />
    </div>
  );
}

/**
 * Corner and edge handles for text cards. Dragging sets the width and a minimum height: the card
 * keeps sizing itself to its text, so it never cuts text off and still grows as you type.
 */
function GrowResizer({ id, selected, minWidth }: { id: string; selected: boolean; minWidth: number }) {
  const readOnly = useStore((s) => s.readOnly);
  const updateInternals = useUpdateNodeInternals();
  if (readOnly) return null;
  return (
    <NodeResizer
      isVisible={selected}
      minWidth={minWidth}
      minHeight={60}
      lineClassName="resize-line"
      handleClassName="resize-handle"
      onResize={(_, p) => useStore.getState().updateData(id, { minH: Math.round(p.height) })}
      // The card may have stopped at its text rather than where the handle was let go: measure it again.
      onResizeEnd={() => requestAnimationFrame(() => updateInternals(id))}
    />
  );
}

/**
 * Focus a field of a freshly created card. React Flow keeps new nodes hidden until they
 * are measured, and hidden elements can't take focus, so retry for a few frames.
 * `selectAll` selects the existing text (new cards); otherwise the caret goes to the end.
 */
export function useAutoFocus(
  ref: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>,
  enabled?: boolean,
  selectAll = true,
  /** Where to put the caret (defaults to the end). */
  caret?: number,
) {
  useEffect(() => {
    if (!enabled) return;
    let tries = 0;
    let raf = 0;
    const attempt = () => {
      const el = ref.current;
      el?.focus({ preventScroll: true });
      if (el && document.activeElement === el) {
        if (selectAll) el.select();
        else {
          const at = Math.min(caret ?? el.value.length, el.value.length);
          el.setSelectionRange(at, at);
        }
        return;
      }
      if (++tries < 20) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [enabled, ref, selectAll, caret]);
}

interface AutoTextProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  selectAll?: boolean;
  caret?: number;
  textareaRef?: React.RefObject<HTMLTextAreaElement | null>;
  onBlur?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLTextAreaElement>) => void;
  id?: string;
  style?: React.CSSProperties;
}

/**
 * Auto-growing textarea that doesn't hijack canvas dragging. It never scrolls itself, so the mouse
 * wheel keeps panning the canvas while the pointer is over text.
 */
export function AutoText({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus,
  selectAll,
  caret,
  textareaRef,
  onBlur,
  onKeyDown,
  onPaste,
  id,
  style,
}: AutoTextProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? own;
  useAutoFocus(ref, autoFocus, selectAll, caret);
  // Text size changes re-fit the height too.
  const textSize = useCardNode()?.data.textSize;
  const fontSize = style?.fontSize;
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${el.scrollHeight}px`;
  }, [value, ref, textSize, fontSize]);
  // Re-fit when the card gets narrower or wider (text wraps onto more or fewer lines).
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let width = el.clientWidth;
    const ro = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      el.style.height = '0px';
      el.style.height = `${el.scrollHeight}px`;
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return (
    <textarea
      ref={ref}
      id={id}
      style={style}
      className={`nodrag autotext ${className}`}
      value={value}
      placeholder={placeholder}
      rows={1}
      onChange={(e) => onChange(e.target.value)}
      onBlur={onBlur}
      onKeyDown={onKeyDown}
      onPaste={onPaste}
    />
  );
}

const FORMATS: { label: ReactNode; title: string; apply: (el: HTMLTextAreaElement) => ReturnType<typeof wrapSelection> }[] = [
  { label: <b>B</b>, title: 'Bold (⌘B)', apply: (el) => wrapSelection(el, '**') },
  { label: <i>I</i>, title: 'Italic (⌘I)', apply: (el) => wrapSelection(el, '*') },
  { label: <s>S</s>, title: 'Strikethrough', apply: (el) => wrapSelection(el, '~~') },
  { label: <Highlighter size={13} />, title: 'Highlight (⌘⇧H)', apply: (el) => wrapSelection(el, '==') },
  { label: <Heading size={13} />, title: 'Big line', apply: (el) => toggleLinePrefix(el, '# ') },
  { label: <List size={13} />, title: 'Bullet list', apply: (el) => toggleLinePrefix(el, '- ') },
];

/** Room the bar needs beside a card: its height plus a margin. */
const BAR_ROOM = 64;

/**
 * Where the formatting bar goes: outside the card, above it when there's room on screen (under the
 * top bar), else below it (above the bottom dock / the phone's keyboard), so it never covers the
 * text. A card taller than the screen keeps it pinned over the text field instead.
 */
function useBarPlace(target: React.RefObject<HTMLTextAreaElement | null>) {
  const [place, setPlace] = useState<'top' | 'bottom' | 'inline'>('top');
  // It starts at the card's left edge: on a narrow screen it wraps instead of running off the side.
  const [maxWidth, setMaxWidth] = useState<number>();
  useLayoutEffect(() => {
    const card = target.current?.closest('.react-flow__node');
    if (!card) return setPlace('inline');
    const r = card.getBoundingClientRect();
    setMaxWidth(Math.max(220, window.innerWidth - Math.max(r.left, 0) - 8));
    const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
    const bottom = window.visualViewport?.height ?? window.innerHeight;
    const dock = document.querySelector('.toolbar')?.getBoundingClientRect().top ?? bottom;
    if (r.top - BAR_ROOM >= top) setPlace('top');
    else if (r.bottom + BAR_ROOM <= Math.min(bottom, dock)) setPlace('bottom');
    else setPlace('inline');
  }, [target]);
  return { place, maxWidth };
}

/** Formatting bar shown beside a card while its text is being edited. */
function FormatBar({ target, onChange }: { target: React.RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) {
  const node = useCardNode();
  const { place, maxWidth } = useBarPlace(target);
  // Stand in for the card's own toolbar (and move handle) while typing.
  useEffect(() => {
    if (!node) return;
    useEditingCard.setState({ id: node.id });
    return () => {
      if (useEditingCard.getState().id === node.id) useEditingCard.setState({ id: null });
    };
  }, [node?.id]);
  const run = (fn: (el: HTMLTextAreaElement) => { next: string; start: number; end: number }) => {
    const el = target.current;
    if (!el) return;
    const { next, start, end } = fn(el);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start, end);
    });
  };
  // mousedown + preventDefault keeps the text selection and focus in the field.
  const btn = (key: string, title: string, label: ReactNode, fn: Parameters<typeof run>[0], extra?: React.CSSProperties) => (
    <button key={key} className="fmt-btn" title={title} style={extra} onMouseDown={(e) => (e.preventDefault(), run(fn))}>
      {label}
    </button>
  );
  const bar = (
    <div
      className={`format-bar nodrag nopan ${place}`}
      style={place === 'inline' ? undefined : { maxWidth }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {FORMATS.map((f, i) => btn(String(i), f.title, f.label, f.apply))}
      <span className="fmt-sep" />
      {Object.entries(TEXT_COLORS).map(([name, c]) =>
        btn(name, `${name[0].toUpperCase()}${name.slice(1)} text`, <span className="fmt-dot" style={{ background: c }} />, (el) =>
          wrapSelection(el, `:${name}[`, ']'),
        ),
      )}
      <TextSizeButtons />
    </div>
  );
  if (!node || place === 'inline') return bar;
  return (
    // Outside the card, at a steady size whatever the zoom; on top of neighbouring cards.
    <NodeToolbar
      isVisible
      position={place === 'top' ? Position.Top : Position.Bottom}
      offset={10}
      align="start"
      style={{ zIndex: 2001 }}
    >
      {bar}
    </NodeToolbar>
  );
}

/** Smaller / bigger text for the whole card. */
function TextSizeButtons() {
  const node = useCardNode();
  const updateData = useStore((s) => s.updateData);
  if (!node) return null;
  const size = node.data.textSize;
  const step = (dir: 1 | -1) => updateData(node.id, { textSize: stepTextSize(size, dir) });
  return (
    <>
      <span className="fmt-sep" />
      <button
        className="fmt-btn"
        title="Smaller text"
        disabled={stepTextSize(size, -1) === size}
        onMouseDown={(e) => (e.preventDefault(), step(-1))}
      >
        <AArrowDown size={15} />
      </button>
      <button
        className="fmt-btn"
        title="Bigger text"
        disabled={stepTextSize(size, 1) === size}
        onMouseDown={(e) => (e.preventDefault(), step(1))}
      >
        <AArrowUp size={15} />
      </button>
    </>
  );
}

/**
 * The position in the plain text (with its **, ==, # … marks) of the point clicked in its formatted
 * view. The shown text is the plain text minus the marks, so its characters are found in order.
 */
function caretFromClick(view: HTMLElement, raw: string, x: number, y: number): number | undefined {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
  };
  let node: Node | null = null;
  let offset = 0;
  if (doc.caretPositionFromPoint) {
    const p = doc.caretPositionFromPoint(x, y);
    if (p) [node, offset] = [p.offsetNode, p.offset];
  } else if (document.caretRangeFromPoint) {
    const r = document.caretRangeFromPoint(x, y);
    if (r) [node, offset] = [r.startContainer, r.startOffset];
  }
  if (!node || !view.contains(node)) return undefined;
  const range = document.createRange();
  range.setStart(view, 0);
  range.setEnd(node, offset);
  const before = range.toString();
  const shown = view.textContent ?? '';
  let v = 0;
  for (let i = 0; i < raw.length; i++) {
    if (v >= before.length) return i;
    if (raw[i] === shown[v]) v++;
  }
  return raw.length;
}

/**
 * Text with light formatting (bold, italic, highlight, colors, big lines, bullets). Shows the
 * formatted result; click to edit the plain text with a formatting bar.
 */
export function RichText({
  value,
  onChange,
  placeholder,
  className = '',
  autoFocus,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
}) {
  const readOnly = useStore((s) => s.readOnly);
  const [editing, setEditing] = useState(!!autoFocus);
  const [caret, setCaret] = useState<number | undefined>();
  const ref = useRef<HTMLTextAreaElement>(null);
  const html = useMemo(() => (value ? renderRich(value) : ''), [value]);

  if (!editing || readOnly) {
    return (
      <div
        className={`rich-view ${readOnly ? '' : 'nodrag'} ${className} ${value ? '' : 'empty'}`}
        data-placeholder={placeholder}
        onClick={(e) => {
          if (readOnly || (e.target as HTMLElement).closest('a')) return;
          // Start typing where the text was clicked, not at the end.
          setCaret(caretFromClick(e.currentTarget, value, e.clientX, e.clientY));
          setEditing(true);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }

  const shortcut = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const mod = e.metaKey || e.ctrlKey;
    const el = e.currentTarget;
    const fn = !mod
      ? null
      : e.key.toLowerCase() === 'b'
        ? () => wrapSelection(el, '**')
        : e.key.toLowerCase() === 'i'
          ? () => wrapSelection(el, '*')
          : e.shiftKey && e.key.toLowerCase() === 'h'
            ? () => wrapSelection(el, '==')
            : null;
    if (!fn) return;
    e.preventDefault();
    const { next, start, end } = fn();
    onChange(next);
    requestAnimationFrame(() => el.setSelectionRange(start, end));
  };

  return (
    <div className="rich-edit">
      <FormatBar target={ref} onChange={onChange} />
      <AutoText
        textareaRef={ref}
        className={className}
        value={value}
        placeholder={placeholder}
        autoFocus
        selectAll={false}
        caret={caret}
        onChange={onChange}
        onBlur={() => {
          // Switching to another app (a dictation tool like Wispr Flow, the keyboard's voice input…)
          // also blurs the field. Stay in editing mode and take the focus back on return, so the
          // dictated text lands here; leave only when something else on the page is picked.
          if (!document.hasFocus() || document.visibilityState === 'hidden') {
            const back = () =>
              setTimeout(() => {
                const el = ref.current;
                const now = document.activeElement;
                if (!el) return;
                if (now && now !== document.body && now !== el) setEditing(false);
                else el.focus({ preventScroll: true });
              }, 60);
            window.addEventListener('focus', back, { once: true });
            // If the focus can't be taken back (iOS), the next tap outside the field closes it.
            const outside = (e: PointerEvent) => {
              if (ref.current && ref.current.contains(e.target as Node)) return;
              window.removeEventListener('pointerdown', outside, true);
              if (document.activeElement !== ref.current) setEditing(false);
            };
            window.addEventListener('pointerdown', outside, true);
            return;
          }
          setEditing(false);
        }}
        onKeyDown={shortcut}
      />
    </div>
  );
}

/** Card header text: the card type by default, renamable with a double-click (e.g. "Scene 01" → "Hook"). */
function CardLabel({ fallback }: { fallback: string }) {
  const node = useCardNode();
  const readOnly = useStore((s) => s.readOnly);
  const updateData = useStore((s) => s.updateData);
  const [editing, setEditing] = useState(false);
  const label = node?.data.label || fallback;
  if (editing && node) {
    return (
      <input
        autoFocus
        className="nodrag card-label-input"
        defaultValue={node.data.label ?? ''}
        placeholder={fallback}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => {
          updateData(node.id, { label: e.target.value.trim() || undefined });
          setEditing(false);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') setEditing(false);
        }}
      />
    );
  }
  return (
    <span
      className={`card-label-text ${node?.data.label ? 'custom' : ''}`}
      title={readOnly ? undefined : 'Double-click to rename'}
      onDoubleClick={(e) => {
        if (readOnly || !node) return;
        e.stopPropagation();
        setEditing(true);
      }}
    >
      {label}
    </span>
  );
}
