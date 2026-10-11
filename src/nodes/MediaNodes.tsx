import type { NodeProps, XYPosition } from '@xyflow/react';
import { makeCard, SIZES } from '../cards';
import { CloudUpload, ExternalLink, Image as ImageIcon, Link2, Maximize2, Upload } from 'lucide-react';
import { useEffect, useState } from 'react';
import { hostname, saveMedia, useMediaUrl, usePreview, youtubeId } from '../db';
import { useStore } from '../store';
import type { CardNode } from '../types';
import { Shell } from './Shell';

export function pickFile(accept: string): Promise<File | null> {
  return pickFiles(accept, false).then((files) => files[0] ?? null);
}

export function pickFiles(accept: string, multiple = true): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.click();
  });
}

const GAP = 24;

/**
 * Photos and videos → cards, laid out in a grid (up to 4 across) starting at `at`. With `intoId`
 * the first file fills that (empty) card and the rest line up beside it. One undo step for all.
 */
export async function addMediaFiles(files: File[], at: XYPosition, intoId?: string) {
  const media = files
    .map((file) => ({ file, kind: file.type.startsWith('image/') ? 'image' : file.type.startsWith('video/') ? 'video' : null }))
    .filter((m): m is { file: File; kind: 'image' | 'video' } => !!m.kind);
  if (!media.length) return;
  const saved = [];
  for (const m of media) saved.push({ ...m, mediaId: await saveMedia(m.file), caption: m.file.name.replace(/\.[^.]+$/, '') });
  const s = useStore.getState();
  const into = intoId ? s.nodes.find((n) => n.id === intoId) : undefined;
  const cellW = Math.max(...saved.map((m) => SIZES[m.kind]?.width ?? 280), into?.width ?? 0) + GAP;
  const cellH = Math.max(...saved.map((m) => SIZES[m.kind]?.height ?? 240), into?.height ?? into?.measured?.height ?? 0) + GAP;
  const cols = Math.min(4, Math.ceil(Math.sqrt(saved.length)));
  const origin = into?.position ?? at;
  const cards = saved.map((m, i) =>
    makeCard(
      m.kind,
      { x: origin.x + (i % cols) * cellW, y: origin.y + Math.floor(i / cols) * cellH },
      { mediaId: m.mediaId, caption: m.caption },
    ),
  );
  if (into && saved[0].kind === into.type) {
    s.updateData(into.id, { mediaId: saved[0].mediaId, caption: saved[0].caption, url: undefined });
    cards.shift();
  }
  if (cards.length) s.insertCards(cards, []);
}

export function EmptyMedia({ id, kind }: { id: string; kind: 'image' | 'video' }) {
  const updateData = useStore((s) => s.updateData);
  const [url, setUrl] = useState('');
  const upload = async () => {
    if (kind === 'image') return addMediaFiles(await pickFiles('image/*'), { x: 0, y: 0 }, id);
    const file = await pickFile(`${kind}/*`);
    if (file) updateData(id, { mediaId: await saveMedia(file), caption: file.name });
  };
  return (
    <div className="media-empty" data-drop-target={id} data-drop-kind={kind}>
      <button className="nodrag btn" onClick={upload}>
        <Upload size={14} /> {kind === 'image' ? 'Upload images' : 'Upload video'}
      </button>
      <span className="muted">or paste a link</span>
      <input
        className="nodrag url-input"
        placeholder={kind === 'image' ? 'https://…/image.jpg' : 'YouTube, Vimeo or .mp4'}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && url.trim() && updateData(id, { url: url.trim() })}
      />
    </div>
  );
}

/** The photo isn't on this device or in the cloud yet: usually the device it was added on is still uploading it. */
function MissingMedia({ id }: { id: string }) {
  const updateData = useStore((s) => s.updateData);
  const replace = async () => {
    const file = await pickFile('image/*');
    if (file) updateData(id, { mediaId: await saveMedia(file), url: undefined });
  };
  return (
    <div className="media-missing">
      <CloudUpload size={22} />
      <b>Photo not here yet</b>
      <span>
        It's still uploading from the device it was added on. Open Notebase there for a moment — it will appear here by itself.
      </span>
      <button className="nodrag btn" onClick={replace}>
        <Upload size={13} /> Choose the photo again
      </button>
    </div>
  );
}

export function Caption({ id, value }: { id: string; value?: string }) {
  const updateData = useStore((s) => s.updateData);
  return (
    <input
      className="nodrag caption"
      value={value ?? ''}
      placeholder="Add a caption"
      onChange={(e) => updateData(id, { caption: e.target.value })}
    />
  );
}

export function ImageNode({ id, data, selected }: NodeProps<CardNode>) {
  const src = useMediaUrl(data.mediaId, data.url);
  const { src: preview, missing } = usePreview(data.mediaId, data.url);
  const [broken, setBroken] = useState(false);
  const [attempt, setAttempt] = useState(0);
  // A cloud copy that failed to load (not there yet, or the connection dropped) is tried again.
  useEffect(() => {
    setBroken(false);
    setAttempt(0);
  }, [preview]);
  useEffect(() => {
    if (!broken || !preview?.startsWith('http') || attempt > 8) return;
    const t = setTimeout(() => (setAttempt((a) => a + 1), setBroken(false)), 5000 * (attempt + 1));
    return () => clearTimeout(t);
  }, [broken, preview, attempt]);
  const shown =
    preview && attempt && preview.startsWith('http') ? `${preview}${preview.includes('?') ? '&' : '?'}r=${attempt}` : preview;
  const setLightbox = useStore((s) => s.setLightbox);
  const has = data.mediaId || data.url;
  return (
    <Shell
      icon={<ImageIcon size={12} />}
      label="Image"
      selected={selected}
      resizable
      minWidth={120}
      minHeight={90}
      className="media-card"
      actions={
        src && (
          <button className="nodrag icon-btn" title="Enlarge" onClick={() => setLightbox({ src, kind: 'image' })}>
            <Maximize2 size={12} />
          </button>
        )
      }
    >
      {has ? (
        <>
          <div className="media-frame" onDoubleClick={() => src && setLightbox({ src, kind: 'image' })}>
            {missing || broken ? (
              <MissingMedia id={id} />
            ) : (
              shown && (
                <img src={shown} alt={data.caption ?? ''} draggable={false} decoding="async" onError={() => setBroken(true)} />
              )
            )}
          </div>
          <Caption id={id} value={data.caption} />
        </>
      ) : (
        <EmptyMedia id={id} kind="image" />
      )}
    </Shell>
  );
}

export function LinkNode({ id, data, selected }: NodeProps<CardNode>) {
  const updateData = useStore((s) => s.updateData);
  const [draft, setDraft] = useState('');
  const url = data.url ?? '';
  const yt = url ? youtubeId(url) : null;
  return (
    <Shell icon={<Link2 size={12} />} label="Link" selected={selected} resizable="width" minWidth={180}>
      {!url ? (
        <input
          autoFocus
          className="nodrag url-input"
          placeholder="Paste a link and press Enter"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== 'Enter' || !draft.trim()) return;
            const u = /^https?:\/\//.test(draft.trim()) ? draft.trim() : `https://${draft.trim()}`;
            updateData(id, { url: u, title: hostname(u) });
          }}
        />
      ) : (
        <>
          {yt && <img className="link-thumb" src={`https://img.youtube.com/vi/${yt}/hqdefault.jpg`} alt="" draggable={false} />}
          <div className="link-row">
            <img className="favicon" src={`https://www.google.com/s2/favicons?domain=${hostname(url)}&sz=64`} alt="" />
            <div className="link-meta">
              <input
                className="nodrag link-title"
                value={data.title ?? ''}
                onChange={(e) => updateData(id, { title: e.target.value })}
              />
              <span className="muted">{hostname(url)}</span>
            </div>
            <a className="nodrag icon-btn" href={url} target="_blank" rel="noreferrer" title="Open">
              <ExternalLink size={13} />
            </a>
          </div>
        </>
      )}
    </Shell>
  );
}
