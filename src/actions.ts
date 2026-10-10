import type { XYPosition } from '@xyflow/react';
import { SIZES } from './cards';
import { useStore } from './store';
import type { CardType } from './types';

/** Add a card of the given type centered on `at`. Board cards also create the nested board. */
export async function addTyped(type: CardType, at: XYPosition) {
  const s = useStore.getState();
  const size = SIZES[type];
  const pos = { x: at.x - (size?.width ?? 200) / 2, y: at.y - (size?.height ?? 120) / 2 };
  if (type === 'board') {
    const boardId = await s.createBoard({ name: 'Yeni pano', parentId: s.currentId });
    return s.addCard('board', pos, { boardId });
  }
  if (type === 'scene') {
    const count = s.nodes.filter((n) => n.type === 'scene').length;
    return s.addCard('scene', pos, { number: count + 1 });
  }
  return s.addCard(type, pos);
}
