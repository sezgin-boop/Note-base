import type { NodeProps } from '@xyflow/react';
import { nanoid } from 'nanoid';
import { ListTodo, Plus, StickyNote, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { takeFocus, useStore } from '../store';
import type { CardNode, TodoItem } from '../types';
import { ACCENTS } from '../types';
import { AutoText, Handles, Shell, useAutoFocus } from './Shell';

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
      resizable="width"
      actions={selected && <AccentPicker id={id} value={data.color} />}
      className="note-card"
    >
      <input
        className="nodrag card-title-input"
        value={data.title ?? ''}
        placeholder="Title"
        onChange={(e) => updateData(id, { title: e.target.value })}
      />
      <AutoText
        autoFocus={focus}
        value={data.text ?? ''}
        placeholder="Write something…"
        onChange={(text) => updateData(id, { text })}
      />
    </Shell>
  );
}

export function HeadingNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const [focus] = useState(() => takeFocus(id));
  return (
    <div className={`heading-card ${selected ? 'is-selected' : ''}`}>
      <AutoText
        autoFocus={focus}
        className="heading-text"
        value={data.text ?? ''}
        placeholder="Title"
        onChange={(text) => updateData(id, { text })}
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
      resizable="width"
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
            <input
              id={`todo-${item.id}`}
              className="nodrag"
              value={item.text}
              placeholder="Task"
              onChange={(e) => patch(item.id, { text: e.target.value })}
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
