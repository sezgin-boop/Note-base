import { NodeResizer, type NodeProps } from '@xyflow/react';
import { useRef, useState } from 'react';
import { fontSize, paint, shapePath, strokeWidth } from '../draw';
import { useStore } from '../store';
import type { CardNode } from '../types';
import { AutoText, useAutoFocus } from './Shell';

/**
 * A drawing on the board: a pen / highlighter stroke, line, arrow, rectangle, ellipse or free text.
 * Only the stroke itself catches the pointer, so drawing over cards doesn't block them.
 */
export function DrawNode({ id, data, selected }: NodeProps<CardNode>) {
  const readOnly = useStore((s) => s.readOnly);

  if (data.shape === 'text') return <DrawText id={id} data={data} selected={selected} />;

  const s = { shape: data.shape ?? 'pen', points: data.points ?? [], size: data.size ?? 4 };
  const d = shapePath(s);
  const sw = strokeWidth(s);
  return (
    <div className={`draw-card ${selected ? 'is-selected' : ''}`} data-draw-id={id}>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={12}
          minHeight={12}
          lineClassName="resize-line"
          handleClassName="resize-handle"
        />
      )}
      <svg viewBox={`0 0 ${data.w ?? 100} ${data.h ?? 100}`} preserveAspectRatio="none" width="100%" height="100%">
        <path
          d={d}
          className={`draw-stroke ${s.shape === 'marker' ? 'marker' : ''}`}
          style={{ stroke: paint(data.stroke ?? 'ink'), strokeWidth: sw }}
          vectorEffect="non-scaling-stroke"
        />
        {/* a wider invisible copy makes thin lines easy to grab */}
        <path d={d} className="draw-hit" style={{ strokeWidth: sw + 14 }} vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

function DrawText({ id, data, selected }: { id: string; data: CardNode['data']; selected?: boolean }) {
  const updateData = useStore((s) => s.updateData);
  const readOnly = useStore((s) => s.readOnly);
  const ref = useRef<HTMLTextAreaElement>(null);
  // A text that was just placed starts in typing mode (retrying until the card is on screen);
  // an empty one disappears when left.
  const [fresh] = useState(() => !data.text);
  useAutoFocus(ref, fresh, false);
  return (
    <div className={`draw-card draw-text ${selected ? 'is-selected' : ''}`} data-draw-id={id}>
      {!readOnly && (
        <NodeResizer
          isVisible={!!selected}
          minWidth={60}
          minHeight={20}
          lineClassName="resize-line"
          handleClassName="resize-handle"
        />
      )}
      {readOnly ? (
        <div className="draw-text-view" style={{ color: paint(data.stroke ?? 'ink'), fontSize: fontSize(data.size ?? 4) }}>
          {data.text}
        </div>
      ) : (
        <AutoText
          textareaRef={ref}
          className="draw-text-input"
          value={data.text ?? ''}
          placeholder="Type…"
          onChange={(text) => updateData(id, { text })}
          onBlur={() => {
            if (!(data.text ?? '').trim()) {
              const s = useStore.getState();
              s.setNodes((ns) => ns.filter((n) => n.id !== id));
            }
          }}
          style={{ color: paint(data.stroke ?? 'ink'), fontSize: fontSize(data.size ?? 4) }}
        />
      )}
    </div>
  );
}
