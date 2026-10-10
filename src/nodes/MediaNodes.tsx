import type { NodeProps } from '@xyflow/react';
import { ExternalLink, Image as ImageIcon, Link2, Maximize2, Upload } from 'lucide-react';
import { useState } from 'react';
import { hostname, saveMedia, useMediaUrl, youtubeId } from '../db';
import { useStore } from '../store';
import type { CardNode } from '../types';
import { Shell } from './Shell';

export function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files?.[0] ?? null);
    input.click();
  });
}

export function EmptyMedia({ id, kind }: { id: string; kind: 'image' | 'video' }) {
  const updateData = useStore((s) => s.updateData);
  const [url, setUrl] = useState('');
  const upload = async () => {
    const file = await pickFile(`${kind}/*`);
    if (file) updateData(id, { mediaId: await saveMedia(file), caption: file.name });
  };
  return (
    <div className="media-empty">
      <button className="nodrag btn" onClick={upload}>
        <Upload size={14} /> {kind === 'image' ? 'Görsel yükle' : 'Video yükle'}
      </button>
      <span className="muted">ya da bağlantı yapıştır</span>
      <input
        className="nodrag url-input"
        placeholder={kind === 'image' ? 'https://…/gorsel.jpg' : 'YouTube, Vimeo ya da .mp4'}
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && url.trim() && updateData(id, { url: url.trim() })}
      />
    </div>
  );
}

export function Caption({ id, value }: { id: string; value?: string }) {
  const updateData = useStore((s) => s.updateData);
  return (
    <input
      className="nodrag caption"
      value={value ?? ''}
      placeholder="Açıklama ekle"
      onChange={(e) => updateData(id, { caption: e.target.value })}
    />
  );
}

export function ImageNode({ id, data, selected }: NodeProps<CardNode>) {
  const src = useMediaUrl(data.mediaId, data.url);
  const setLightbox = useStore((s) => s.setLightbox);
  const has = data.mediaId || data.url;
  return (
    <Shell
      icon={<ImageIcon size={12} />}
      label="Görsel"
      selected={selected}
      resizable
      minWidth={120}
      minHeight={90}
      className="media-card"
      actions={
        src && (
          <button className="nodrag icon-btn" title="Büyüt" onClick={() => setLightbox({ src, kind: 'image' })}>
            <Maximize2 size={12} />
          </button>
        )
      }
    >
      {has ? (
        <>
          <div className="media-frame" onDoubleClick={() => src && setLightbox({ src, kind: 'image' })}>
            {src && <img src={src} alt={data.caption ?? ''} draggable={false} />}
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
    <Shell icon={<Link2 size={12} />} label="Bağlantı" selected={selected} resizable="width" minWidth={180}>
      {!url ? (
        <input
          autoFocus
          className="nodrag url-input"
          placeholder="Bağlantı yapıştır ve Enter"
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
            <a className="nodrag icon-btn" href={url} target="_blank" rel="noreferrer" title="Aç">
              <ExternalLink size={13} />
            </a>
          </div>
        </>
      )}
    </Shell>
  );
}
