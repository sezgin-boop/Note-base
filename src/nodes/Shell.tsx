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
import { editorToRich, renderRich, richToEditorHtml, TEXT_COLORS } from '../richtext';
import { applyColor, applyEdit, endListOnEnter, placeCaret, tidyNewLine, type EditKind } from './richEdit';
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

const FORMATS: { label: ReactNode; title: string; kind: EditKind }[] = [
  { label: <b>B</b>, title: 'Bold (⌘B)', kind: 'bold' },
  { label: <i>I</i>, title: 'Italic (⌘I)', kind: 'italic' },
  { label: <s>S</s>, title: 'Strikethrough', kind: 'strike' },
  { label: <Highlighter size={13} />, title: 'Highlight (⌘⇧H)', kind: 'mark' },
  { label: <Heading size={13} />, title: 'Big line', kind: 'h1' },
  { label: <List size={13} />, title: 'Bullet list', kind: 'li' },
];

/** Room the bar needs beside a card: its height plus a margin. */
const BAR_ROOM = 64;

/**
 * Where the formatting bar goes: outside the card, above it when there's room on screen (under the
 * top bar), else below it (above the bottom dock / the phone's keyboard), so it never covers the
 * text. A card taller than the screen keeps it pinned over the text field instead.
 */
function useBarPlace(cardId: string | undefined) {
  const [place, setPlace] = useState<'top' | 'bottom' | 'inline'>('top');
  // It starts at the card's left edge: on a narrow screen it wraps instead of running off the side.
  const [maxWidth, setMaxWidth] = useState<number>();
  useLayoutEffect(() => {
    if (!cardId) return setPlace('inline');
    let raf = 0;
    let tries = 0;
    const measure = () => {
      const card = document.querySelector(`.react-flow__node[data-id="${CSS.escape(cardId)}"]`);
      const r = card?.getBoundingClientRect();
      // Not laid out yet (just opened, still measuring): look again next frame.
      if (!r || !r.height) {
        if (++tries < 30) raf = requestAnimationFrame(measure);
        return;
      }
      setMaxWidth(Math.max(220, window.innerWidth - Math.max(r.left, 0) - 8));
      const top = (document.querySelector('.topbar')?.getBoundingClientRect().bottom ?? 0) + 8;
      const screen = window.visualViewport?.height ?? window.innerHeight;
      const dock = document.querySelector('.main > .toolbar')?.getBoundingClientRect();
      const bottom = dock && dock.height && dock.top > screen / 2 ? Math.min(screen, dock.top) : screen;
      if (r.top - BAR_ROOM >= top) setPlace('top');
      else if (r.bottom + BAR_ROOM <= bottom) setPlace('bottom');
      // Not much room either way: still outside the card if it fits on screen at all; only a card
      // taller than the screen keeps the bar over its text.
      else setPlace(r.top - BAR_ROOM >= 0 ? 'top' : r.bottom + BAR_ROOM <= screen ? 'bottom' : 'inline');
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [cardId]);
  return { place, maxWidth };
}

/** Formatting bar shown beside a card while its text is being edited. */
function FormatBar({ target, onChange }: { target: React.RefObject<HTMLDivElement | null>; onChange: (v: string) => void }) {
  const node = useCardNode();
  const { place, maxWidth } = useBarPlace(node?.id);
  // Stand in for the card's own toolbar (and move handle) while typing.
  useEffect(() => {
    if (!node) return;
    useEditingCard.setState({ id: node.id });
    return () => {
      if (useEditingCard.getState().id === node.id) useEditingCard.setState({ id: null });
    };
  }, [node?.id]);
  // Format the text in place, then store it (the editor keeps its focus and selection).
  const run = (fn: (el: HTMLDivElement) => void) => {
    const el = target.current;
    if (!el) return;
    fn(el);
    onChange(editorToRich(el));
  };
  // mousedown + preventDefault keeps the text selection and focus in the field.
  const btn = (key: string, title: string, label: ReactNode, fn: (el: HTMLDivElement) => void) => (
    <button key={key} className="fmt-btn" title={title} onMouseDown={(e) => (e.preventDefault(), run(fn))}>
      {label}
    </button>
  );
  const bar = (
    <div
      className={`format-bar nodrag nopan ${place}`}
      style={place === 'inline' ? undefined : { maxWidth }}
      onMouseDown={(e) => e.preventDefault()}
    >
      {FORMATS.map((f) => btn(f.kind, f.title, f.label, (el) => applyEdit(el, f.kind)))}
      <span className="fmt-sep" />
      {Object.entries(TEXT_COLORS).map(([name, c]) =>
        btn(name, `${name[0].toUpperCase()}${name.slice(1)} text`, <span className="fmt-dot" style={{ background: c }} />, (el) =>
          applyColor(el, name),
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
 * Text with light formatting (bold, italic, highlight, colors, big lines, bullets). Shows the
 * formatted result; click to edit it in place, still formatted (no ** or == marks), with a
 * formatting bar. What's stored is the plain-text form (see richtext.ts).
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
  // Where the formatted text was clicked: the caret goes there.
  const [clickAt, setClickAt] = useState<{ x: number; y: number }>();
  const html = useMemo(() => (value ? renderRich(value) : ''), [value]);

  if (!editing || readOnly) {
    return (
      <div
        className={`rich-view ${readOnly ? '' : 'nodrag'} ${className} ${value ? '' : 'empty'}`}
        data-placeholder={placeholder}
        onClick={(e) => {
          if (readOnly || (e.target as HTMLElement).closest('a')) return;
          setClickAt({ x: e.clientX, y: e.clientY });
          setEditing(true);
        }}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    );
  }
  return (
    <RichEditor
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      clickAt={clickAt}
      onDone={() => setEditing(false)}
    />
  );
}

/** The editable, formatted text. It is filled once and then left to the browser while typing. */
function RichEditor({
  value,
  onChange,
  placeholder,
  className,
  clickAt,
  onDone,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className: string;
  clickAt?: { x: number; y: number };
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [empty, setEmpty] = useState(!value);
  const last = useRef(value);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.innerHTML = richToEditorHtml(value);
    document.execCommand('defaultParagraphSeparator', false, 'div');
    // React Flow keeps a new card hidden until it's measured, and hidden elements can't take focus.
    let tries = 0;
    let raf = 0;
    const focus = () => {
      el.focus({ preventScroll: true });
      if (document.activeElement === el) return placeCaret(el, clickAt);
      if (++tries < 20) raf = requestAnimationFrame(focus);
    };
    focus();
    return () => cancelAnimationFrame(raf);
    // Filled once: afterwards the editor is the source of the text until editing ends.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const commit = () => {
    const el = ref.current;
    if (!el) return;
    const text = editorToRich(el);
    setEmpty(!text.trim());
    if (text === last.current) return;
    last.current = text;
    onChange(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === 'h') {
      e.preventDefault();
      applyEdit(el, 'mark');
      return commit();
    }
    if (mod && e.key.toLowerCase() === 'b') return (e.preventDefault(), applyEdit(el, 'bold'), commit());
    if (mod && e.key.toLowerCase() === 'i') return (e.preventDefault(), applyEdit(el, 'italic'), commit());
    if (e.key === 'Enter' && !e.shiftKey) {
      if (endListOnEnter(el)) return (e.preventDefault(), commit());
      setTimeout(() => (tidyNewLine(el), commit()), 0);
    }
  };

  return (
    <div className="rich-edit">
      <FormatBar target={ref} onChange={(t) => ((last.current = t), setEmpty(!t.trim()), onChange(t))} />
      <div
        ref={ref}
        className={`rich-view rich-editor nodrag ${className} ${empty ? 'empty' : ''}`}
        data-placeholder={placeholder}
        contentEditable
        suppressContentEditableWarning
        spellCheck
        onInput={commit}
        onKeyDown={onKeyDown}
        // Pasted text comes in plain (no outside styles); it can still be formatted afterwards.
        onPaste={(e) => {
          const text = e.clipboardData.getData('text/plain');
          if (!text) return;
          e.preventDefault();
          document.execCommand('insertText', false, text);
        }}
        onBlur={() => {
          commit();
          // Switching to another app (a dictation tool like Wispr Flow, the keyboard's voice input…)
          // also blurs the field. Stay in editing mode and take the focus back on return, so the
          // dictated text lands here; leave only when something else on the page is picked.
          if (!document.hasFocus() || document.visibilityState === 'hidden') {
            const back = () =>
              setTimeout(() => {
                const el = ref.current;
                const now = document.activeElement;
                if (!el) return;
                if (now && now !== document.body && now !== el) onDone();
                else el.focus({ preventScroll: true });
              }, 60);
            window.addEventListener('focus', back, { once: true });
            // If the focus can't be taken back (iOS), the next tap outside the field closes it.
            const outside = (e: PointerEvent) => {
              if (ref.current && ref.current.contains(e.target as Node)) return;
              window.removeEventListener('pointerdown', outside, true);
              if (document.activeElement !== ref.current) onDone();
            };
            window.addEventListener('pointerdown', outside, true);
            return;
          }
          onDone();
        }}
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
