// Card styles ("skins"): a card's whole background can be a designed preset, a color or gradient of
// your own, or a picture. The text switches between light and dark ink to stay readable.

export type Ink = 'light' | 'dark';

export type Skin =
  | { kind: 'preset'; id: string }
  | { kind: 'color'; from: string; to?: string; angle?: number; ink?: Ink }
  | { kind: 'image'; mediaId: string; dim?: number; blur?: number; ink?: Ink };

export interface Preset {
  id: string;
  name: string;
  /** CSS `background` value. */
  bg: string;
  ink: Ink;
}

const dots = (c: string, size = 4) => `radial-gradient(${c} 1px, transparent 1.2px) 0 0 / ${size}px ${size}px`;
const grid = (c: string, size = 18) =>
  `linear-gradient(${c} 1px, transparent 1px) 0 0 / ${size}px ${size}px, linear-gradient(90deg, ${c} 1px, transparent 1px) 0 0 / ${size}px ${size}px`;

export const PRESETS: Preset[] = [
  { id: 'paper', name: 'Paper', bg: '#f6f1e7', ink: 'dark' },
  {
    id: 'notebook',
    name: 'Notebook',
    bg:
      'linear-gradient(90deg, transparent 20px, rgba(239, 68, 68, 0.38) 20px 21.5px, transparent 21.5px), ' +
      'repeating-linear-gradient(180deg, transparent 0 23px, rgba(59, 130, 246, 0.2) 23px 24px), #fbf8ef',
    ink: 'dark',
  },
  {
    id: 'kraft',
    name: 'Kraft',
    bg: `${dots('rgba(60, 30, 0, 0.09)', 5)}, linear-gradient(160deg, #d2ab84, #bf9468)`,
    ink: 'dark',
  },
  { id: 'lemon', name: 'Lemon', bg: 'linear-gradient(160deg, #fef08a, #fde047)', ink: 'dark' },
  { id: 'peach', name: 'Peach', bg: 'linear-gradient(135deg, #fed7aa, #fecaca)', ink: 'dark' },
  { id: 'blush', name: 'Blush', bg: 'linear-gradient(160deg, #fce7f3, #fbcfe8)', ink: 'dark' },
  { id: 'mint', name: 'Mint', bg: 'linear-gradient(160deg, #d1fae5, #a7f3d0)', ink: 'dark' },
  { id: 'sky', name: 'Sky', bg: 'linear-gradient(180deg, #e0f2fe, #bae6fd)', ink: 'dark' },
  {
    id: 'holo',
    name: 'Holo',
    bg: 'conic-gradient(from 210deg at 30% 20%, #fbcfe8, #c7d2fe, #a5f3fc, #bbf7d0, #fef08a, #fbcfe8)',
    ink: 'dark',
  },
  { id: 'sunset', name: 'Sunset', bg: 'linear-gradient(135deg, #f97316, #db2777)', ink: 'light' },
  { id: 'aurora', name: 'Aurora', bg: 'linear-gradient(135deg, #0891b2, #7c3aed 55%, #db2777)', ink: 'light' },
  { id: 'grape', name: 'Grape', bg: 'linear-gradient(160deg, #3b0764, #7c3aed)', ink: 'light' },
  { id: 'ocean', name: 'Ocean', bg: 'linear-gradient(160deg, #0c4a6e, #0284c7)', ink: 'light' },
  { id: 'forest', name: 'Forest', bg: 'linear-gradient(160deg, #052e16, #166534)', ink: 'light' },
  { id: 'ember', name: 'Ember', bg: 'radial-gradient(120% 90% at 0% 0%, #f59e0b, #b91c1c 55%, #450a0a)', ink: 'light' },
  { id: 'midnight', name: 'Midnight', bg: 'linear-gradient(160deg, #0f172a, #1e293b)', ink: 'light' },
  {
    id: 'blueprint',
    name: 'Blueprint',
    bg: `${grid('rgba(255, 255, 255, 0.09)')}, linear-gradient(160deg, #1e3a8a, #1d4ed8)`,
    ink: 'light',
  },
  {
    id: 'film',
    name: 'Film grain',
    bg: `${dots('rgba(255, 255, 255, 0.06)', 3)}, linear-gradient(160deg, #292524, #0c0a09)`,
    ink: 'light',
  },
  { id: 'noir', name: 'Noir', bg: '#050505', ink: 'light' },
];

export const GRADIENT_ANGLES = [90, 135, 180, 225];

/** Relative luminance (0 = black, 1 = white) of a #rgb / #rrggbb color. */
export function luminance(hex: string): number {
  let h = hex.replace('#', '');
  if (h.length === 3) h = [...h].map((c) => c + c).join('');
  const [r, g, b] = [0, 2, 4].map((i) => {
    const v = parseInt(h.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Ink that reads best on a background color. */
export const inkFor = (...colors: string[]): Ink =>
  colors.reduce((s, c) => s + luminance(c), 0) / colors.length > 0.32 ? 'dark' : 'light';

/** The background layer and text ink of a skin. `imageUrl` is the picture's address for image skins. */
export function skinLook(
  skin: Skin,
  imageUrl?: string | null,
): { background: string; filter?: string; dim?: string; ink: Ink } | null {
  if (skin.kind === 'preset') {
    const p = PRESETS.find((x) => x.id === skin.id);
    return p ? { background: p.bg, ink: p.ink } : null;
  }
  if (skin.kind === 'color') {
    const background = skin.to ? `linear-gradient(${skin.angle ?? 135}deg, ${skin.from}, ${skin.to})` : skin.from;
    return { background, ink: skin.ink ?? inkFor(skin.from, skin.to ?? skin.from) };
  }
  const ink = skin.ink ?? 'light';
  const dim = skin.dim ?? 0.4;
  return {
    background: imageUrl ? `center / cover no-repeat url("${imageUrl}")` : '#222',
    filter: skin.blur ? `blur(${skin.blur}px)` : undefined,
    // A wash over the picture so the text stays readable: dark under light ink, light under dark ink.
    dim: ink === 'light' ? `rgba(0, 0, 0, ${dim})` : `rgba(255, 255, 255, ${dim})`,
    ink,
  };
}

/** Accepts a skin from untrusted input (AI / connector): a preset id, or a skin object. */
export function parseSkin(v: unknown): Skin | undefined {
  if (typeof v === 'string') return PRESETS.some((p) => p.id === v) ? { kind: 'preset', id: v } : undefined;
  if (!v || typeof v !== 'object') return undefined;
  const o = v as Record<string, unknown>;
  const hex = (x: unknown) => (typeof x === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(x) ? x : undefined);
  if (o.kind === 'preset' && typeof o.id === 'string') return parseSkin(o.id);
  if (o.kind === 'color' && hex(o.from))
    return {
      kind: 'color',
      from: hex(o.from)!,
      ...(hex(o.to) ? { to: hex(o.to) } : {}),
      ...(typeof o.angle === 'number' ? { angle: o.angle } : {}),
      ...(o.ink === 'light' || o.ink === 'dark' ? { ink: o.ink } : {}),
    };
  return undefined;
}
