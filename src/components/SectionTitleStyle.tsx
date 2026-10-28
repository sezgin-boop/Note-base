import { AArrowDown, AArrowUp, Bold, Italic } from 'lucide-react';
import { useStore } from '../store';
import { TITLE_COLORS, TITLE_FONTS, TITLE_SIZE, TITLE_SIZES, type CardData, type CardNode } from '../types';

const clampSize = (n: number) => Math.max(12, Math.min(160, Math.round(n)));

/**
 * Controls for the look of the selected sections' titles: size, color, typeface, bold, italic.
 * Shown under the section's toolbar (the "Aa" button) and in its right-click menu.
 */
export function SectionTitleStyle({ compact, id }: { compact?: boolean; id?: string }) {
  const s = useStore();
  // One section (the one whose title is being edited), or every selected one.
  const first = id ? s.nodes.find((n) => n.id === id) : s.nodes.find((n) => n.selected && n.type === 'frame');
  if (!first) return null;
  const d = first.data;
  const size = d.titleSize ?? TITLE_SIZE;
  const set = (patch: Partial<CardData>) => {
    const apply = (n: CardNode) => {
      if (n.type !== 'frame') return n;
      const data = { ...n.data, ...patch };
      for (const k of Object.keys(patch)) if (data[k] === undefined || data[k] === '' || data[k] === false) delete data[k];
      return { ...n, data };
    };
    if (!id) return s.patchSelected(apply);
    s.checkpoint();
    s.setNodes((ns) => ns.map((n) => (n.id === id ? apply(n) : n)));
    // Keep typing in the title right after picking a style.
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLInputElement>(`.react-flow__node[data-id="${CSS.escape(id)}"] .frame-title`);
      if (!el || document.activeElement === el || document.activeElement?.matches('.title-pop input')) return;
      el.focus({ preventScroll: true });
      el.setSelectionRange(el.value.length, el.value.length);
    });
  };
  return (
    <div
      className={`title-style ${compact ? 'compact' : ''}`}
      onPointerDown={(e) => e.stopPropagation()}
      // Buttons don't take the focus, so the title being typed in stays in editing.
      onMouseDown={(e) => !(e.target as HTMLElement).matches('input') && e.preventDefault()}
    >
      <div className="title-style-row">
        <span className="title-style-label">Size</span>
        <div className="seg menu-seg">
          <button title="Smaller" onClick={() => set({ titleSize: clampSize(size - 4) })}>
            <AArrowDown size={14} />
          </button>
          {TITLE_SIZES.map(([label, px]) => (
            <button
              key={label}
              className={size === px ? 'on' : ''}
              onClick={() => set({ titleSize: px === TITLE_SIZE ? undefined : px })}
            >
              {label}
            </button>
          ))}
          <button title="Bigger" onClick={() => set({ titleSize: clampSize(size + 4) })}>
            <AArrowUp size={14} />
          </button>
        </div>
      </div>
      <div className="title-style-row">
        <span className="title-style-label">Color</span>
        <div className="title-colors">
          {TITLE_COLORS.map((c) => (
            <button
              key={c || 'auto'}
              title={c || 'Default'}
              className={`title-color ${(d.titleColor ?? '') === c ? 'on' : ''} ${c ? '' : 'auto'}`}
              style={c ? { background: c } : undefined}
              onClick={() => set({ titleColor: c || undefined })}
            />
          ))}
          <label className="title-color custom" title="Any color">
            <input type="color" value={d.titleColor || '#a78bfa'} onChange={(e) => set({ titleColor: e.target.value })} />
          </label>
        </div>
      </div>
      <div className="title-style-row">
        <span className="title-style-label">Font</span>
        <div className="seg menu-seg">
          {TITLE_FONTS.map(([f, label]) => (
            <button
              key={f}
              className={(d.titleFont ?? 'serif') === f ? 'on' : ''}
              onClick={() => set({ titleFont: f === 'serif' ? undefined : f })}
            >
              {label}
            </button>
          ))}
          <button title="Bold" className={d.titleBold ? 'on' : ''} onClick={() => set({ titleBold: !d.titleBold })}>
            <Bold size={13} />
          </button>
          <button title="Italic" className={d.titleItalic ? 'on' : ''} onClick={() => set({ titleItalic: !d.titleItalic })}>
            <Italic size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}
