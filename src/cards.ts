import type { XYPosition } from '@xyflow/react';
import { nanoid } from 'nanoid';
import type { CardData, CardNode, CardType } from './types';

export const SIZES: Partial<Record<CardType, { width: number; height?: number }>> = {
  note: { width: 260 },
  heading: { width: 420 },
  todo: { width: 260 },
  image: { width: 280, height: 200 },
  video: { width: 360 },
  link: { width: 280 },
  board: { width: 150 },
  frame: { width: 560, height: 380 },
  scene: { width: 260 },
  project: { width: 290 },
  color: { width: 140 },
};

const DEFAULTS: Record<CardType, () => CardData> = {
  note: () => ({ text: '' }),
  heading: () => ({ text: 'Heading' }),
  todo: () => ({ title: 'To do', items: [{ id: nanoid(6), text: '', done: false }] }),
  image: () => ({}),
  video: () => ({}),
  link: () => ({ url: '' }),
  board: () => ({}),
  frame: () => ({ title: 'Section' }),
  scene: () => ({ number: 1, shot: 'Medium', duration: '3s', text: '', audio: '' }),
  project: () => ({ title: 'New job', client: '', deadline: '', fee: '', status: 'brief', text: '' }),
  color: () => ({ hex: '#a78bfa', title: 'Color' }),
  draw: () => ({ shape: 'pen', points: [], stroke: 'ink', size: 4 }),
};

/** Cards whose height follows their content; only their width is user-resizable. */
export const AUTO_HEIGHT = new Set<CardType>(['note', 'heading', 'todo', 'video', 'link', 'board', 'scene', 'project', 'color']);

export function makeCard(type: CardType, position: XYPosition, data?: CardData): CardNode {
  return {
    id: nanoid(10),
    type,
    position,
    data: { ...DEFAULTS[type](), ...data },
    ...SIZES[type],
    ...(type === 'frame' ? { zIndex: -1 } : {}),
  };
}
