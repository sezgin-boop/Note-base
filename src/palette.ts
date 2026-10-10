import { makeCard } from './cards';
import { getMediaUrl } from './db';
import { useStore } from './store';
import type { CardNode } from './types';
import { toast } from './ui';

const hex = (r: number, g: number, b: number) => `#${[r, g, b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('')}`;

/** The main colors of an image, most dominant first (k-means on a downscaled copy). */
export async function extractPalette(src: string, k = 5): Promise<string[]> {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.src = src;
  await img.decode();
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, size, size);
  const data = ctx.getImageData(0, 0, size, size).data;
  const px: [number, number, number][] = [];
  for (let i = 0; i < data.length; i += 4) if (data[i + 3] > 128) px.push([data[i], data[i + 1], data[i + 2]]);
  if (!px.length) return [];

  // Spread the starting centers across the brightness range so results are stable.
  const byLuma = [...px].sort((a, b) => a[0] * 0.3 + a[1] * 0.59 + a[2] * 0.11 - (b[0] * 0.3 + b[1] * 0.59 + b[2] * 0.11));
  let centers = Array.from({ length: k }, (_, i) => [...byLuma[Math.floor(((i + 0.5) / k) * byLuma.length)]]);
  let counts = new Array(k).fill(0);
  for (let iter = 0; iter < 12; iter++) {
    const sums = centers.map(() => [0, 0, 0]);
    counts = new Array(k).fill(0);
    for (const p of px) {
      let best = 0;
      let bestD = Infinity;
      centers.forEach((c, i) => {
        const d = (p[0] - c[0]) ** 2 + (p[1] - c[1]) ** 2 + (p[2] - c[2]) ** 2;
        if (d < bestD) (bestD = d), (best = i);
      });
      sums[best][0] += p[0];
      sums[best][1] += p[1];
      sums[best][2] += p[2];
      counts[best]++;
    }
    centers = centers.map((c, i) => (counts[i] ? sums[i].map((s) => s / counts[i]) : c));
  }
  const ranked = centers
    .map((c, i) => ({ c, n: counts[i] }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n);
  // Drop near-duplicates.
  const out: number[][] = [];
  for (const { c } of ranked) if (!out.some((o) => Math.hypot(o[0] - c[0], o[1] - c[1], o[2] - c[2]) < 24)) out.push(c);
  return out.map((c) => hex(c[0], c[1], c[2]));
}

/** Add the palette of an image (or scene frame) card as color cards underneath it. */
export async function addPaletteFor(node: CardNode) {
  const src = node.data.mediaId ? await getMediaUrl(node.data.mediaId) : node.data.url;
  if (!src) return toast('This card has no image yet');
  try {
    const colors = await extractPalette(src);
    const s = useStore.getState();
    const y = node.position.y + (node.measured?.height ?? node.height ?? 200) + 30;
    s.checkpoint();
    const cards = colors.map((hexColor, i) =>
      makeCard('color', { x: node.position.x + i * 150, y }, { hex: hexColor, title: hexColor.toUpperCase() }),
    );
    useStore.setState({ nodes: [...s.nodes, ...cards] });
    toast(`Added ${cards.length} colors`);
  } catch {
    toast("Couldn't read this image's colors (it's hosted on a site that blocks it)");
  }
}
