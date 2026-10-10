import type { NodeProps } from '@xyflow/react';
import { Briefcase, Clapperboard, Copy, ImagePlus, LayoutDashboard, Palette, Sparkles, Volume2 } from 'lucide-react';
import { saveMedia, useMediaUrl } from '../db';
import { useRef, useState } from 'react';
import { toast } from '../ui';
import { takeFocus, useStore } from '../store';
import type { CardNode, ProjectStatus } from '../types';
import { SHOT_TYPES, STATUS_COLORS, STATUS_LABELS } from '../types';
import { AccentPicker } from './TextNodes';
import { pickFile } from './MediaNodes';
import { AutoText, Handles, Shell, useAutoFocus } from './Shell';

export function daysLeft(deadline?: string) {
  if (!deadline) return null;
  const d = new Date(`${deadline}T23:59:59`);
  return Math.ceil((d.getTime() - Date.now()) / 864e5);
}

export function DeadlineBadge({ deadline, status }: { deadline?: string; status?: ProjectStatus }) {
  const left = daysLeft(deadline);
  if (left === null || status === 'delivered' || status === 'paid') return null;
  const tone = left < 0 ? 'late' : left <= 3 ? 'soon' : 'ok';
  const text = left < 0 ? `${-left}d overdue` : left === 0 ? 'Due today' : `${left}d left`;
  return <span className={`deadline ${tone}`}>{text}</span>;
}

export function SceneNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const setLightbox = useStore((s) => s.setLightbox);
  const src = useMediaUrl(data.mediaId);
  const upload = async () => {
    const file = await pickFile('image/*');
    if (file) updateData(id, { mediaId: await saveMedia(file) });
  };
  return (
    <Shell
      icon={<Clapperboard size={12} />}
      label={`Scene ${String(data.number ?? 1).padStart(2, '0')}`}
      selected={selected}
      color={data.color || '#34d399'}
      resizable="width"
      minWidth={200}
    >
      <div className="scene-thumb nodrag" onClick={() => (src ? setLightbox({ src, kind: 'image' }) : upload())}>
        {src ? (
          <img src={src} alt="" draggable={false} />
        ) : (
          <span>
            <ImagePlus size={16} /> Add frame
          </span>
        )}
      </div>
      <div className="scene-meta">
        <input
          className="nodrag mini"
          type="number"
          min={1}
          value={data.number ?? 1}
          title="Scene number"
          onChange={(e) => updateData(id, { number: Number(e.target.value) })}
        />
        <select className="nodrag mini" value={data.shot} onChange={(e) => updateData(id, { shot: e.target.value })}>
          {/* Keep shot names typed on older boards selectable. */}
          {[...SHOT_TYPES, ...(data.shot && !SHOT_TYPES.includes(data.shot) ? [data.shot] : [])].map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input
          className="nodrag mini"
          value={data.duration ?? ''}
          placeholder="Length"
          onChange={(e) => updateData(id, { duration: e.target.value })}
        />
      </div>
      <AutoText value={data.text ?? ''} placeholder="What happens?" onChange={(text) => updateData(id, { text })} />
      <div className="scene-audio">
        <Volume2 size={13} />
        <AutoText value={data.audio ?? ''} placeholder="Sound / music / VO" onChange={(audio) => updateData(id, { audio })} />
      </div>
      {data.prompt !== undefined ? (
        <div className="scene-prompt">
          <div className="scene-prompt-head">
            <Sparkles size={11} /> Image prompt
            <button
              className="nodrag allow icon-btn"
              title="Copy prompt"
              onClick={() => {
                navigator.clipboard?.writeText(data.prompt ?? '');
                toast('Prompt copied');
              }}
            >
              <Copy size={11} />
            </button>
          </div>
          <AutoText
            value={data.prompt}
            placeholder="Describe the frame for an image generator…"
            onChange={(prompt) => updateData(id, { prompt })}
          />
        </div>
      ) : (
        selected && (
          <button className="nodrag add-row" onClick={() => updateData(id, { prompt: '' })}>
            <Sparkles size={12} /> Add image prompt
          </button>
        )
      )}
    </Shell>
  );
}

export function ProjectNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const status = data.status ?? 'brief';
  const [focus] = useState(() => takeFocus(id));
  const titleRef = useRef<HTMLInputElement>(null);
  useAutoFocus(titleRef, focus);
  return (
    <Shell
      icon={<Briefcase size={12} />}
      label="Job"
      selected={selected}
      color={STATUS_COLORS[status]}
      resizable="width"
      minWidth={220}
      actions={<DeadlineBadge deadline={data.deadline} status={status} />}
    >
      <input
        ref={titleRef}
        className="nodrag card-title-input"
        value={data.title ?? ''}
        placeholder="Job name"
        onChange={(e) => updateData(id, { title: e.target.value })}
      />
      <div className="status-row nodrag">
        {(Object.keys(STATUS_LABELS) as ProjectStatus[]).map((s) => (
          <button
            key={s}
            className={`status-pill ${s === status ? 'on' : ''}`}
            style={{ '--c': STATUS_COLORS[s] } as React.CSSProperties}
            onClick={() => updateData(id, { status: s })}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>
      <div className="field">
        <span>Client</span>
        <input
          className="nodrag"
          value={data.client ?? ''}
          placeholder="—"
          onChange={(e) => updateData(id, { client: e.target.value })}
        />
      </div>
      <div className="field">
        <span>Due</span>
        <input
          className="nodrag"
          type="date"
          value={data.deadline ?? ''}
          onChange={(e) => updateData(id, { deadline: e.target.value })}
        />
      </div>
      <div className="field">
        <span>Fee</span>
        <input
          className="nodrag"
          value={data.fee ?? ''}
          placeholder="—"
          onChange={(e) => updateData(id, { fee: e.target.value })}
        />
      </div>
      <AutoText value={data.text ?? ''} placeholder="Notes" onChange={(text) => updateData(id, { text })} />
    </Shell>
  );
}

export function ColorNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const hex = data.hex ?? '#888888';
  return (
    <div className={`color-card ${selected ? 'is-selected' : ''}`}>
      <label className="swatch nodrag" style={{ background: hex }}>
        <input type="color" value={hex} onChange={(e) => updateData(id, { hex: e.target.value })} />
      </label>
      <input className="nodrag color-name" value={data.title ?? ''} onChange={(e) => updateData(id, { title: e.target.value })} />
      <button className="nodrag color-hex" title="Copy" onClick={() => navigator.clipboard?.writeText(hex)}>
        <Palette size={11} /> {hex.toUpperCase()}
      </button>
      <Handles />
    </div>
  );
}

export function BoardNode({ data, selected }: NodeProps<CardNode>) {
  const board = useStore((s) => s.boards.find((b) => b.id === data.boardId));
  const openBoard = useStore((s) => s.openBoard);
  const childCount = useStore((s) => s.boards.filter((b) => b.parentId === data.boardId).length);
  return (
    <div
      className={`board-card ${selected ? 'is-selected' : ''} ${board ? '' : 'missing'}`}
      onDoubleClick={() => board && openBoard(board.id)}
      title="Double-click to open"
    >
      <div className="board-tile">{board ? board.icon : <LayoutDashboard size={28} />}</div>
      <div className="board-name">{board?.name ?? 'Deleted board'}</div>
      {board && <div className="muted small">{childCount ? `${childCount} sub-board${childCount > 1 ? 's' : ''}` : 'Board'}</div>}
      <Handles />
    </div>
  );
}

export function FrameNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  return (
    <Shell
      icon={<LayoutDashboard size={12} />}
      label="Section"
      selected={selected}
      color={data.color}
      resizable
      minWidth={200}
      minHeight={120}
      className="frame-card"
      actions={selected && <AccentPicker id={id} value={data.color} />}
    >
      <input
        className="nodrag frame-title"
        size={Math.max(6, (data.title ?? '').length + 1)}
        value={data.title ?? ''}
        placeholder="Section name"
        onChange={(e) => updateData(id, { title: e.target.value })}
      />
    </Shell>
  );
}
