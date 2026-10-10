import type { XYPosition } from '@xyflow/react';
import { applyHidden, collapseFrame } from '../sections';
import { useStore } from '../store';
import { toast } from '../ui';
import { buildImport, parseImport, summarize, type ParsedImport } from './importer';

/** Add an AI reply's cards to the open board at `at`. Returns false (and says why) if nothing was added. */
export function importFromAi(text: string, at: XYPosition, opts: { section?: boolean; parsed?: ParsedImport } = {}) {
  if (useStore.getState().readOnly) return false;
  let parsed: ParsedImport;
  try {
    parsed = opts.parsed ?? parseImport(text);
  } catch (e) {
    toast((e as Error).message, 6000);
    return false;
  }
  const withSection = opts.section ?? (!!parsed.section || parsed.cards.length > 3);
  const built = buildImport(parsed, at, withSection);
  const frame = built.nodes.find((n) => n.type === 'frame');
  const nodes = parsed.collapsed && frame ? applyHidden(collapseFrame(built.nodes, frame.id)) : built.nodes;
  useStore.getState().insertCards(nodes, built.edges);
  toast(`Added from AI: ${summarize(parsed)}`, 5000);
  return true;
}
