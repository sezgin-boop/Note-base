import { Clipboard, ClipboardPaste, ImagePlus, RotateCcw, Upload, Wand2, X } from 'lucide-react';
import { useState } from 'react';
import { saveMedia, usePreviewUrl } from '../db';
import { pickFile } from '../nodes/MediaNodes';
import { GRADIENT_ANGLES, inkFor, PRESETS, type Ink, type Skin } from '../skins';
import { useStore } from '../store';
import type { CardNode, CardType } from '../types';
import { toast } from '../ui';

/** Cards drawn with the standard card frame, which can take a style. */
export const SKIN_TYPES = new Set<CardType>(['note', 'todo', 'scene', 'project', 'link', 'video', 'image', 'frame']);

const TYPE_NAMES: Partial<Record<CardType, string>> = {
  note: 'notes',
  todo: 'lists',
  scene: 'scenes',
  project: 'jobs',
  link: 'links',
  video: 'videos',
  image: 'images',
  frame: 'sections',
};

const QUICK_COLORS = [
  '#0f172a',
  '#1f2937',
  '#7f1d1d',
  '#9a3412',
  '#a16207',
  '#166534',
  '#0e7490',
  '#1d4ed8',
  '#6d28d9',
  '#be185d',
  '#f5f5f4',
  '#fde68a',
];

let copied: Skin | undefined;
let lastChange = 0;

/** Set (or clear) the style of some cards. Quick successive changes (dragging a slider) are one undo step. */
export function applySkin(ids: Set<string>, skin: Skin | undefined) {
  const s = useStore.getState();
  if (s.readOnly) return;
  if (Date.now() - lastChange > 1500) s.checkpoint();
  lastChange = Date.now();
  s.setNodes((ns) =>
    ns.map((n) => {
      if (!ids.has(n.id)) return n;
      const { skin: _, ...data } = n.data;
      return { ...n, data: skin ? { ...data, skin } : data };
    }),
  );
}

export const copySkin = (n: CardNode) => {
  copied = n.data.skin;
  toast(copied ? 'Style copied — right-click another card → Paste style' : 'This card has the default style');
};
export const copiedSkin = () => copied;

/** The "Card style" inspector: presets, your own colors / gradient, or a picture as the card's background. */
export function StylePanel() {
  const nodes = useStore((s) => s.nodes);
  const setPanel = useStore((s) => s.setPanel);
  const targets = nodes.filter((n) => n.selected && SKIN_TYPES.has(n.type as CardType));
  const skin = targets[0]?.data.skin;
  const [tab, setTab] = useState<'presets' | 'color' | 'image'>(
    skin?.kind === 'color' ? 'color' : skin?.kind === 'image' ? 'image' : 'presets',
  );
  const ids = new Set(targets.map((n) => n.id));
  const set = (next: Skin | undefined) => applySkin(ids, next);

  const type = targets[0]?.type as CardType | undefined;
  const sameType = !!type && targets.every((n) => n.type === type);
  const allOfType = sameType ? nodes.filter((n) => n.type === type) : [];

  return (
    <aside className="style-panel" onKeyDown={(e) => e.stopPropagation()}>
      <div className="style-head">
        <Wand2 size={15} />
        <b>Card style</b>
        <span className="muted small">{targets.length ? `${targets.length} card${targets.length > 1 ? 's' : ''}` : ''}</span>
        <button className="icon-btn" title="Close (Esc)" onClick={() => setPanel(null)}>
          <X size={15} />
        </button>
      </div>

      {!targets.length ? (
        <p className="style-empty">Select a card (or several) to style it.</p>
      ) : (
        <>
          <div className="seg style-tabs">
            {(
              [
                ['presets', 'Styles'],
                ['color', 'Color'],
                ['image', 'Picture'],
              ] as const
            ).map(([k, l]) => (
              <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>
                {l}
              </button>
            ))}
          </div>

          {tab === 'presets' && (
            <div className="skin-grid">
              <button className={`skin-tile default ${!skin ? 'on' : ''}`} onClick={() => set(undefined)} title="Default">
                <span>Aa</span>
                <i>Default</i>
              </button>
              {PRESETS.map((p) => (
                <button
                  key={p.id}
                  className={`skin-tile ink-${p.ink} ${skin?.kind === 'preset' && skin.id === p.id ? 'on' : ''}`}
                  style={{ background: p.bg }}
                  title={p.name}
                  onClick={() => set({ kind: 'preset', id: p.id })}
                >
                  <span>Aa</span>
                  <i>{p.name}</i>
                </button>
              ))}
            </div>
          )}

          {tab === 'color' && <ColorTab skin={skin} set={set} />}
          {tab === 'image' && <ImageTab skin={skin} set={set} nodes={nodes} />}

          <div className="style-foot">
            {sameType && allOfType.length > targets.length && (
              <button
                className="btn apply-all"
                onClick={() => {
                  applySkin(new Set(allOfType.map((n) => n.id)), skin);
                  toast(`Style applied to all ${allOfType.length} ${TYPE_NAMES[type!]}`);
                }}
              >
                Apply to all {allOfType.length} {TYPE_NAMES[type!]}
              </button>
            )}
            <div className="style-foot-row">
              <button className="btn-ghost" title="Copy style" onClick={() => copySkin(targets[0])}>
                <Clipboard size={13} /> Copy
              </button>
              <button className="btn-ghost" title="Paste style" disabled={!copied} onClick={() => set(copied)}>
                <ClipboardPaste size={13} /> Paste
              </button>
              <button className="btn-ghost" title="Back to the default look" disabled={!skin} onClick={() => set(undefined)}>
                <RotateCcw size={13} /> Reset
              </button>
            </div>
          </div>
        </>
      )}
    </aside>
  );
}

function InkPicker({ value, auto, onChange }: { value?: Ink; auto?: boolean; onChange: (v: Ink | undefined) => void }) {
  return (
    <div className="style-row">
      <span>Text</span>
      <div className="seg menu-seg">
        {auto && (
          <button className={!value ? 'on' : ''} onClick={() => onChange(undefined)}>
            Auto
          </button>
        )}
        <button className={value === 'light' ? 'on' : ''} onClick={() => onChange('light')}>
          Light
        </button>
        <button className={value === 'dark' ? 'on' : ''} onClick={() => onChange('dark')}>
          Dark
        </button>
      </div>
    </div>
  );
}

function ColorTab({ skin, set }: { skin?: Skin; set: (s: Skin | undefined) => void }) {
  const cur = skin?.kind === 'color' ? skin : { kind: 'color' as const, from: '#1d4ed8' };
  const update = (patch: Partial<typeof cur>) => {
    const next = { ...cur, ...patch };
    for (const k of Object.keys(next) as (keyof typeof next)[]) if (next[k] === undefined) delete next[k];
    set(next);
  };
  const preview = cur.to ? `linear-gradient(${cur.angle ?? 135}deg, ${cur.from}, ${cur.to})` : cur.from;
  return (
    <div className="style-section">
      <div className={`style-preview ink-${cur.ink ?? inkFor(cur.from, cur.to ?? cur.from)}`} style={{ background: preview }}>
        <b>Your color</b>
        <span>Text stays readable</span>
      </div>
      <div className="quick-colors">
        {QUICK_COLORS.map((c) => (
          <button key={c} style={{ background: c }} className={cur.from === c ? 'on' : ''} onClick={() => update({ from: c })} />
        ))}
      </div>
      <div className="style-row">
        <span>Color</span>
        <label className="color-well" style={{ background: cur.from }}>
          <input type="color" value={cur.from} onChange={(e) => update({ from: e.target.value })} />
        </label>
        <span className="muted small">→</span>
        <label
          className={`color-well ${cur.to ? '' : 'empty'}`}
          style={{ background: cur.to ?? 'transparent' }}
          title="Second color (gradient)"
        >
          <input type="color" value={cur.to ?? '#db2777'} onChange={(e) => update({ to: e.target.value })} />
        </label>
        {cur.to && (
          <button className="icon-btn" title="No gradient" onClick={() => update({ to: undefined, angle: undefined })}>
            <X size={13} />
          </button>
        )}
      </div>
      {cur.to && (
        <div className="style-row">
          <span>Direction</span>
          <div className="seg menu-seg">
            {GRADIENT_ANGLES.map((a) => (
              <button key={a} className={(cur.angle ?? 135) === a ? 'on' : ''} onClick={() => update({ angle: a })}>
                <span style={{ display: 'inline-block', transform: `rotate(${a - 90}deg)` }}>→</span>
              </button>
            ))}
          </div>
        </div>
      )}
      <InkPicker value={cur.ink} auto onChange={(ink) => update({ ink })} />
    </div>
  );
}

function ImageTab({ skin, set, nodes }: { skin?: Skin; set: (s: Skin | undefined) => void; nodes: CardNode[] }) {
  const cur = skin?.kind === 'image' ? skin : null;
  const pictures = [
    ...new Set(nodes.filter((n) => (n.type === 'image' || n.type === 'scene') && n.data.mediaId).map((n) => n.data.mediaId!)),
  ].slice(0, 12);
  const use = (mediaId: string) => set({ kind: 'image', mediaId, dim: cur?.dim ?? 0.4, blur: cur?.blur, ink: cur?.ink });
  const update = (patch: Partial<NonNullable<typeof cur>>) => cur && set({ ...cur, ...patch });
  return (
    <div className="style-section">
      <button
        className="btn-ghost upload-btn"
        onClick={async () => {
          const file = await pickFile('image/*');
          if (file) use(await saveMedia(file));
        }}
      >
        <Upload size={14} /> Upload a picture
      </button>
      {pictures.length > 0 && (
        <>
          <div className="style-label">From this board</div>
          <div className="pic-grid">
            {pictures.map((id) => (
              <PicChoice key={id} mediaId={id} on={cur?.mediaId === id} onPick={() => use(id)} />
            ))}
          </div>
        </>
      )}
      {!pictures.length && !cur && (
        <p className="style-empty">
          <ImagePlus size={14} /> Upload one, or put a picture on the board to reuse it here.
        </p>
      )}
      {cur && (
        <>
          <div className="style-row">
            <span>Shade</span>
            <input
              type="range"
              min={0}
              max={0.85}
              step={0.05}
              value={cur.dim ?? 0.4}
              onChange={(e) => update({ dim: Number(e.target.value) })}
            />
          </div>
          <div className="style-row">
            <span>Blur</span>
            <input
              type="range"
              min={0}
              max={16}
              step={1}
              value={cur.blur ?? 0}
              onChange={(e) => update({ blur: Number(e.target.value) || undefined })}
            />
          </div>
          <InkPicker value={cur.ink ?? 'light'} onChange={(ink) => update({ ink })} />
        </>
      )}
    </div>
  );
}

function PicChoice({ mediaId, on, onPick }: { mediaId: string; on: boolean; onPick: () => void }) {
  const src = usePreviewUrl(mediaId);
  return (
    <button className={`pic-choice ${on ? 'on' : ''}`} onClick={onPick}>
      {src && <img src={src} alt="" draggable={false} />}
    </button>
  );
}
