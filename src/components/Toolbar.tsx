import { useReactFlow } from '@xyflow/react';
import {
  Briefcase,
  Clapperboard,
  Heading1,
  Image,
  LayoutDashboard,
  Link2,
  ListTodo,
  Palette,
  Redo2,
  Square,
  StickyNote,
  Undo2,
  Video,
} from 'lucide-react';
import { addTyped } from '../actions';
import { useStore } from '../store';
import type { CardType } from '../types';

export const TOOLS: { type: CardType; label: string; key: string; icon: React.ReactNode }[] = [
  { type: 'note', label: 'Not', key: 'N', icon: <StickyNote size={17} /> },
  { type: 'todo', label: 'Liste', key: 'L', icon: <ListTodo size={17} /> },
  { type: 'heading', label: 'Başlık', key: 'H', icon: <Heading1 size={17} /> },
  { type: 'image', label: 'Görsel', key: 'I', icon: <Image size={17} /> },
  { type: 'video', label: 'Video', key: 'V', icon: <Video size={17} /> },
  { type: 'link', label: 'Bağlantı', key: 'K', icon: <Link2 size={17} /> },
  { type: 'scene', label: 'Sahne (storyboard)', key: 'S', icon: <Clapperboard size={17} /> },
  { type: 'project', label: 'İş / müşteri', key: 'J', icon: <Briefcase size={17} /> },
  { type: 'color', label: 'Renk', key: 'C', icon: <Palette size={17} /> },
  { type: 'frame', label: 'Bölüm', key: 'F', icon: <Square size={17} /> },
  { type: 'board', label: 'Pano', key: 'B', icon: <LayoutDashboard size={17} /> },
];

export function useAddAtCenter() {
  const rf = useReactFlow();
  return (type: CardType) => {
    const el = document.querySelector('.canvas')!.getBoundingClientRect();
    const jitter = () => (Math.random() - 0.5) * 60;
    const at = rf.screenToFlowPosition({ x: el.left + el.width / 2 + jitter(), y: el.top + el.height / 2 + jitter() });
    return addTyped(type, at);
  };
}

export function Toolbar() {
  const addAtCenter = useAddAtCenter();
  const { undo, redo, past, future } = useStore();
  return (
    <div className="toolbar">
      {TOOLS.map((t, i) => (
        <span key={t.type} className="tool-wrap">
          {(i === 3 || i === 6 || i === 9) && <span className="tool-sep" />}
          <button
            className="tool"
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('application/notebase', t.type);
              e.dataTransfer.effectAllowed = 'copy';
            }}
            onClick={() => addAtCenter(t.type)}
          >
            {t.icon}
            <span className="tip">
              {t.label} <kbd>{t.key}</kbd>
            </span>
          </button>
        </span>
      ))}
      <span className="tool-sep" />
      <button className="tool" disabled={!past.length} onClick={undo}>
        <Undo2 size={17} />
        <span className="tip">
          Geri al <kbd>⌘Z</kbd>
        </span>
      </button>
      <button className="tool" disabled={!future.length} onClick={redo}>
        <Redo2 size={17} />
        <span className="tip">
          Yinele <kbd>⇧⌘Z</kbd>
        </span>
      </button>
    </div>
  );
}
