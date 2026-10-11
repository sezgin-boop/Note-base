import type { NodeProps } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { ListTodo, Plus, StickyNote, X } from 'lucide-react';
import { NodeResizer } from '@xyflow/react';
import { useRef, useState } from 'react';
import { takeFocus, useStore } from '../store';
import type { CardNode, TodoItem } from '../types';
import { ACCENTS, textScale } from '../types';
import { AutoText, Handles, RichText, Shell, useAutoFocus } from './Shell';

export function AccentPicker({ id, value }: { id: string; value?: string }) {
  const updateData = useStore((s) => s.updateData);
  return (
    <span className="accent-picker nodrag">
      {ACCENTS.map((c) => (
        <button
          key={c || 'none'}
          className={`accent-dot ${(value ?? '') === c ? 'on' : ''}`}
          style={{ background: c || 'transparent' }}
          title={c || 'No color'}
          onClick={() => updateData(id, { color: c })}
        />
      ))}
    </span>
  );
}

export function NoteNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const [focus] = useState(() => takeFocus(id));
  return (
    <Shell
      icon={<StickyNote size={12} />}
      label="Note"
      selected={selected}
      color={data.color}
      resizable="grow"
      actions={selected && <AccentPicker id={id} value={data.color} />}
      className="note-card"
    >
      <input
        className="nodrag card-title-input"
        value={data.title ?? ''}
        placeholder="Title"
        onChange={(e) => updateData(id, { title: e.target.value })}
      />
      <RichText
        autoFocus={focus}
        value={data.text ?? ''}
        placeholder="Write something…"
        onChange={(text) => updateData(id, { text })}
      />
    </Shell>
  );
}

const HEADING_SIZE = 52;

export function HeadingNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const readOnly = useStore((s) => s.readOnly);
  const [focus] = useState(() => takeFocus(id));
  const textRef = useRef<HTMLTextAreaElement>(null);
  const start = useRef({ font: HEADING_SIZE, h: 1 });
  // Dragging a corner scales the text with the box; a size from the menu (S, L, XL…) also works.
  const size = data.fontSize ?? (data.textSize ? Math.round(HEADING_SIZE * textScale(data.textSize)) : undefined);
  return (
    <div className={`heading-card ${selected ? 'is-selected' : ''}`} style={data.color ? { color: data.color } : undefined}>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={60}
          minHeight={20}
          lineClassName="resize-line"
          handleClassName="resize-handle"
          onResizeStart={(_, p) => {
            const el = textRef.current;
            start.current = { font: el ? parseFloat(getComputedStyle(el).fontSize) : HEADING_SIZE, h: Math.max(p.height, 1) };
          }}
          onResize={(_, p) => {
            const font = Math.round(Math.min(260, Math.max(12, (start.current.font * p.height) / start.current.h)));
            if (font !== data.fontSize) updateData(id, { fontSize: font });
          }}
        />
      )}
      <AutoText
        autoFocus={focus}
        textareaRef={textRef}
        className="heading-text"
        value={data.text ?? ''}
        placeholder="Title"
        onChange={(text) => updateData(id, { text })}
        style={size ? { fontSize: size } : undefined}
      />
      <Handles />
    </div>
  );
}

export function TodoNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const [focus] = useState(() => takeFocus(id));
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocus(titleRef, focus);
  const items = data.items ?? [];
  const done = items.filter((i) => i.done).length;
  const setItems = (next: TodoItem[]) => updateData(id, { items: next });
  const patch = (itemId: string, p: Partial<TodoItem>) => setItems(items.map((i) => (i.id === itemId ? { ...i, ...p } : i)));

  const add = (afterIndex = items.length - 1) => {
    const item = { id: nanoid(6), text: '', done: false };
    setItems([...items.slice(0, afterIndex + 1), item, ...items.slice(afterIndex + 1)]);
    requestAnimationFrame(() => document.getElementById(`todo-${item.id}`)?.focus());
  };

  return (
    <Shell
      icon={<ListTodo size={12} />}
      label="List"
      selected={selected}
      color={data.color}
      resizable="grow"
      actions={
        selected ? (
          <AccentPicker id={id} value={data.color} />
        ) : (
          <span className="muted">
            {done}/{items.length}
          </span>
        )
      }
    >
      <input
        ref={titleRef}
        className="nodrag card-title-input"
        value={data.title ?? ''}
        placeholder="List name"
        onChange={(e) => updateData(id, { title: e.target.value })}
      />
      {items.length > 0 && (
        <div className="progress">
          <div style={{ width: `${(done / items.length) * 100}%` }} />
        </div>
      )}
      <ul className="todo-list">
        {items.map((item, idx) => (
          <li key={item.id} className={item.done ? 'done' : ''}>
            <button className="nodrag check" onClick={() => patch(item.id, { done: !item.done })}>
              {item.done && '✓'}
            </button>
            {/* Wraps and grows, so long tasks stay readable. Enter adds the next task. */}
            <AutoText
              id={`todo-${item.id}`}
              className="todo-text"
              value={item.text}
              placeholder="Task"
              onChange={(text) => patch(item.id, { text: text.replace(/\n/g, ' ') })}
              onPaste={(e) => {
                // Pasting several lines makes one task per line.
                const lines = e.clipboardData
                  .getData('text')
                  .split(/\r?\n/)
                  .map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|\[[ x]\])\s*/i, '').trim())
                  .filter(Boolean);
                if (lines.length < 2) return;
                e.preventDefault();
                const extra = lines.slice(item.text ? 0 : 1).map((text) => ({ id: nanoid(6), text, done: false }));
                const first = item.text ? item : { ...item, text: lines[0] };
                setItems([...items.slice(0, idx), first, ...extra, ...items.slice(idx + 1)]);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  add(idx);
                } else if (e.key === 'Backspace' && !item.text && items.length > 1) {
                  e.preventDefault();
                  setItems(items.filter((i) => i.id !== item.id));
                  const prev = items[idx - 1] ?? items[idx + 1];
                  requestAnimationFrame(() => document.getElementById(`todo-${prev.id}`)?.focus());
                }
              }}
            />
            <button className="nodrag ghost-x" onClick={() => setItems(items.filter((i) => i.id !== item.id))}>
              <X size={12} />
            </button>
          </li>
        ))}
      </ul>
      <button className="nodrag add-row" onClick={() => add()}>
        <Plus size={12} /> Add task
      </button>
    </Shell>
  );
}
