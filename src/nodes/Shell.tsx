import { Handle, NodeResizeControl, NodeResizer, Position, ResizeControlVariant, useUpdateNodeInternals } from '@xyflow/react';
import type { ReactNode } from 'react';
import { AArrowDown, AArrowUp, Heading, Highlighter, List } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { usePreviewUrl } from '../db';
import { renderRich, TEXT_COLORS, toggleLinePrefix, wrapSelection } from '../richtext';
import { skinLook } from '../skins';
import { useStore } from '../store';
import { stepTextSize, textScale } from '../types';
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
        else el.setSelectionRange(el.value.length, el.value.length);
        return;
      }
      if (++tries < 20) raf = requestAnimationFrame(attempt);
    };
    attempt();
    return () => cancelAnimationFrame(raf);
  }, [enabled, ref, selectAll]);
}

interface AutoTextProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  autoFocus?: boolean;
  selectAll?: boolean;
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
  textareaRef,
  onBlur,
  onKeyDown,
  onPaste,
  id,
  style,
}: AutoTextProps) {
  const own = useRef<HTMLTextAreaElement>(null);
  const ref = textareaRef ?? own;
  useAutoFocus(ref, autoFocus, selectAll);
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

/** Formatting bar shown above a text field while it's being edited. */
function FormatBar({ target, onChange }: { target: React.RefObject<HTMLTextAreaElement | null>; onChange: (v: string) => void }) {
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
  return (
    <div className="format-bar nodrag nopan" onMouseDown={(e) => e.preventDefault()}>
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
  const ref = useRef<HTMLTextAreaElement>(null);
  const html = useMemo(() => (value ? renderRich(value) : ''), [value]);

  if (!editing || readOnly) {
    return (
      <div
        className={`rich-view ${readOnly ? '' : 'nodrag'} ${className} ${value ? '' : 'empty'}`}
        data-placeholder={placeholder}
        onClick={(e) => {
          if (readOnly || (e.target as HTMLElement).closest('a')) return;
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
        onChange={onChange}
        onBlur={() => {
          // Switching to another app (a dictation tool like Wispr Flow, the keyboard's voice input…)
          // also blurs the field: stay in editing mode so the text can still land here when it returns.
          if (!document.hasFocus()) {
            const back = () =>
              setTimeout(() => {
                if (document.activeElement !== ref.current) setEditing(false);
              }, 200);
            window.addEventListener('focus', back, { once: true });
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
