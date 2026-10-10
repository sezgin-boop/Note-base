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
  heading: () => ({ text: 'Başlık' }),
  todo: () => ({ title: 'Yapılacaklar', items: [{ id: nanoid(6), text: '', done: false }] }),
  image: () => ({}),
  video: () => ({}),
  link: () => ({ url: '' }),
  board: () => ({}),
  frame: () => ({ title: 'Bölüm' }),
  scene: () => ({ number: 1, shot: 'Orta', duration: '3s', text: '', audio: '' }),
  project: () => ({ title: 'Yeni iş', client: '', deadline: '', fee: '', status: 'brief', text: '' }),
  color: () => ({ hex: '#a78bfa', title: 'Renk' }),
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
