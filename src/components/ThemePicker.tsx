import { Monitor, Moon, Sun } from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';
import { useStore, type Palette, type Theme } from '../store';

/** Color themes: [id, name, dark-mode preview background, accent, second accent]. */
export const PALETTES: { id: Palette; name: string; bg: string; a: string; b: string }[] = [
  { id: 'violet', name: 'Violet', bg: '#0d0b14', a: '#8b5cf6', b: '#4f6bff' },
  { id: 'fire', name: 'Fire', bg: '#140906', a: '#ff5a1f', b: '#ef4444' },
  { id: 'ocean', name: 'Ocean', bg: '#06101a', a: '#0ea5e9', b: '#3b82f6' },
  { id: 'forest', name: 'Forest', bg: '#07120b', a: '#22c55e', b: '#14b8a6' },
  { id: 'rose', name: 'Rose', bg: '#14070f', a: '#ec4899', b: '#e11d48' },
  { id: 'gold', name: 'Gold', bg: '#141005', a: '#f59e0b', b: '#eab308' },
  { id: 'aurora', name: 'Aurora', bg: '#061312', a: '#14b8a6', b: '#a855f7' },
  { id: 'mono', name: 'Mono', bg: '#0c0c0d', a: '#a3a3a3', b: '#525252' },
];

/** Put the theme on the page (data attributes read by the stylesheet) and color the browser bar to match. */
export function applyTheme(theme: Theme, palette: Palette) {
  const root = document.documentElement;
  const light = theme === 'light' || (theme === 'system' && matchMedia('(prefers-color-scheme: light)').matches);
  root.dataset.theme = light ? 'light' : 'dark';
  root.dataset.palette = palette;
  // Mixed colors compute as color(srgb r g b); the browser bar wants a plain rgb().
  const bg = getComputedStyle(root).backgroundColor;
  const m = bg.match(/color\(srgb ([\d.]+) ([\d.]+) ([\d.]+)/);
  const rgb = m ? `rgb(${m.slice(1, 4).map((v) => Math.round(Number(v) * 255)).join(', ')})` : bg;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', rgb);
}

/**
 * Change theme with the new colors spreading in a circle from where the user clicked
 * (View Transitions where the browser has them; an instant switch elsewhere).
 */
function switchTheme(change: () => void, at?: { x: number; y: number }) {
  const doc = document as Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } };
  const run = () => {
    flushSync(change);
    const s = useStore.getState();
    applyTheme(s.theme, s.palette);
  };
  if (!doc.startViewTransition || matchMedia('(prefers-reduced-motion: reduce)').matches) return run();
  const t = doc.startViewTransition(run);
  const x = at?.x ?? innerWidth / 2;
  const y = at?.y ?? 0;
  const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
  t.ready
    .then(() =>
      document.documentElement.animate(
        { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: 700, easing: 'cubic-bezier(0.22, 1, 0.36, 1)', pseudoElement: '::view-transition-new(root)' },
      ),
    )
    .catch(() => {});
}

/** Button + popover to pick the color theme and dark / light mode. */
export function ThemePicker({ variant }: { variant: 'top' | 'side' }) {
  const { palette, theme, setPalette, setTheme } = useStore();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({});

  // Open below the button when there's room (top bar), otherwise above it (sidebar).
  useLayoutEffect(() => {
    if (!open || !btn.current || !pop.current) return;
    const r = btn.current.getBoundingClientRect();
    const w = pop.current.offsetWidth;
    const h = pop.current.offsetHeight;
    const clampX = (x: number) => Math.max(8, Math.min(x, innerWidth - w - 8));
    setPos(
      r.bottom + h + 8 < innerHeight
        ? { top: r.bottom + 8, left: clampX(r.right - w) }
        : { bottom: innerHeight - r.top + 8, left: clampX(r.left) },
    );
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const current = PALETTES.find((p) => p.id === palette) ?? PALETTES[0];
  return (
    <>
      <button
        ref={btn}
        className={variant === 'top' ? 'top-btn hide-sm theme-top' : 'side-btn theme-btn'}
        title={`Color theme: ${current.name}`}
        onClick={() => setOpen(!open)}
      >
        <span className="palette-dot" />
        {variant === 'top' && <span>{current.name}</span>}
      </button>
      {open && (
        <>
          <div className="backdrop-clear" onClick={() => setOpen(false)} />
          <div ref={pop} className="theme-pop" style={pos}>
            <div className="menu-head">Color theme</div>
            <div className="palette-grid">
              {PALETTES.map((p) => (
                <button
                  key={p.id}
                  className={`palette-card ${palette === p.id ? 'on' : ''}`}
                  onClick={(e) => switchTheme(() => setPalette(p.id), { x: e.clientX, y: e.clientY })}
                >
                  <span
                    className="palette-preview"
                    style={{ background: p.bg, ['--pv-accent' as string]: p.a } as React.CSSProperties}
                  >
                    <span
                      className="pv-glow"
                      style={{ background: `radial-gradient(90% 70% at 30% 10%, ${p.a}55, transparent 70%)` }}
                    />
                    <span className="pv-card" style={{ background: `color-mix(in srgb, ${p.a} 10%, #1a1a1f)` }} />
                    <span className="pv-pill" style={{ background: `linear-gradient(90deg, ${p.a}, ${p.b})` }} />
                  </span>
                  {p.name}
                </button>
              ))}
            </div>
            <div className="seg theme-modes">
              {(
                [
                  ['system', Monitor, 'Auto'],
                  ['dark', Moon, 'Dark'],
                  ['light', Sun, 'Light'],
                ] as const
              ).map(([t, Icon, l]) => (
                <button
                  key={t}
                  className={theme === t ? 'on' : ''}
                  onClick={(e) => switchTheme(() => setTheme(t), { x: e.clientX, y: e.clientY })}
                >
                  <Icon size={13} /> {l}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  );
}
