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
  Square,
  StickyNote,
  Video,
} from 'lucide-react';
import { addTyped } from '../actions';
import type { CardType } from '../types';

export const TOOLS: { type: CardType; label: string; key: string; icon: React.ReactNode }[] = [
  { type: 'note', label: 'Note', key: 'N', icon: <StickyNote size={17} /> },
  { type: 'todo', label: 'List', key: 'L', icon: <ListTodo size={17} /> },
  { type: 'heading', label: 'Heading', key: 'H', icon: <Heading1 size={17} /> },
  { type: 'image', label: 'Image', key: 'I', icon: <Image size={17} /> },
  { type: 'video', label: 'Video', key: 'V', icon: <Video size={17} /> },
  { type: 'link', label: 'Link', key: 'K', icon: <Link2 size={17} /> },
  { type: 'scene', label: 'Scene (storyboard)', key: 'S', icon: <Clapperboard size={17} /> },
  { type: 'project', label: 'Client job', key: 'J', icon: <Briefcase size={17} /> },
  { type: 'color', label: 'Color', key: 'C', icon: <Palette size={17} /> },
  { type: 'frame', label: 'Section', key: 'F', icon: <Square size={17} /> },
  { type: 'board', label: 'Board', key: 'B', icon: <LayoutDashboard size={17} /> },
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
    </div>
  );
}
