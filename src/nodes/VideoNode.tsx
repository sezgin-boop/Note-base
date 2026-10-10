import type { NodeProps } from '@xyflow/react';
import { Check, Clock, Maximize2, MessageSquare, Trash2, Video } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';
import { addSharedComment, type RemoteComment } from '../cloud';
import { embedUrl, useMediaUrl } from '../db';
import { fmtTime } from '../share/outline';
import { useStore } from '../store';
import { updateClientComment } from '../sync';
import type { CardNode, VideoComment } from '../types';
import { toast } from '../ui';
import { Caption, EmptyMedia } from './MediaNodes';
import { Shell } from './Shell';

type Kind = 'file' | 'youtube' | 'vimeo';

/** Reads the playhead of a <video> or a YouTube/Vimeo embed (via their postMessage APIs) and seeks it. */
function usePlayer(kind: Kind | null) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const clock = useRef({ time: 0, duration: 0 });
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    if (kind !== 'youtube' && kind !== 'vimeo') return;
    const frame = frameRef.current;
    const post = (msg: object) => frame?.contentWindow?.postMessage(JSON.stringify(msg), '*');
    const hello = () =>
      kind === 'youtube'
        ? post({ event: 'listening', id: 1, channel: 'widget' })
        : post({ method: 'addEventListener', value: 'timeupdate' });
    const onMessage = (e: MessageEvent) => {
      if (e.source !== frame?.contentWindow) return;
      let data: any = e.data;
      try {
        if (typeof data === 'string') data = JSON.parse(data);
      } catch {
        return;
      }
      if (kind === 'youtube' && data?.info) {
        if (typeof data.info.currentTime === 'number') clock.current.time = data.info.currentTime;
        if (data.info.duration) setDuration((clock.current.duration = data.info.duration));
      }
      if (kind === 'vimeo') {
        if (data?.event === 'ready') hello();
        if (data?.event === 'timeupdate' && data.data) {
          clock.current.time = data.data.seconds;
          if (data.data.duration) setDuration((clock.current.duration = data.data.duration));
        }
      }
    };
    window.addEventListener('message', onMessage);
    frame?.addEventListener('load', hello);
    const t = setTimeout(hello, 1500);
    return () => {
      window.removeEventListener('message', onMessage);
      frame?.removeEventListener('load', hello);
      clearTimeout(t);
    };
  }, [kind]);

  const time = () => (kind === 'file' ? (videoRef.current?.currentTime ?? 0) : clock.current.time);
  const seek = (t: number) => {
    if (kind === 'file' && videoRef.current) {
      videoRef.current.currentTime = t;
      videoRef.current.play().catch(() => {});
      return;
    }
    const post = (msg: object) => frameRef.current?.contentWindow?.postMessage(JSON.stringify(msg), '*');
    if (kind === 'youtube') {
      post({ event: 'command', func: 'seekTo', args: [t, true], id: 1, channel: 'widget' });
      post({ event: 'command', func: 'playVideo', args: [], id: 1, channel: 'widget' });
    }
    if (kind === 'vimeo') {
      post({ method: 'setCurrentTime', value: t });
      post({ method: 'play' });
    }
  };
  return { videoRef, frameRef, time, seek, duration, setDuration };
}

interface Row {
  id: string;
  t: number | null;
  text: string;
  author: string;
  done: boolean;
  remote: boolean;
}

export function VideoNode({ id, data, selected }: NodeProps<CardNode>) {
  const src = useMediaUrl(data.mediaId, data.url);
  const { setLightbox, updateData, readOnly, shared, currentId } = useStore();
  const clientComments = useStore((s) => s.clientComments[id]);
  const embed = data.url ? embedUrl(data.url) : null;
  const kind: Kind | null = embed ? (embed.includes('vimeo') ? 'vimeo' : 'youtube') : src ? 'file' : null;
  const player = usePlayer(kind);
  const own = data.comments ?? [];

  const rows: Row[] = [
    ...own.map((c) => ({ id: c.id, t: c.t, text: c.text, author: c.author || 'Ben', done: !!c.done, remote: false })),
    ...(clientComments ?? []).map((c) => ({ id: c.id, t: c.t, text: c.body, author: c.author, done: c.done, remote: true })),
  ].sort((a, b) => (a.t ?? -1) - (b.t ?? -1));

  const canComment = !readOnly || !!shared?.allowComments;
  const [open, setOpen] = useState(rows.length > 0);
  const [draft, setDraft] = useState('');
  const [stamp, setStamp] = useState<number | null>(null);
  const [name, setName] = useState(() => localStorage.getItem('notebase:guestName') ?? '');
  const has = data.mediaId || data.url;

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!readOnly) {
      const c: VideoComment = { id: nanoid(8), t: stamp, text, at: Date.now() };
      updateData(id, { comments: [...own, c] });
    } else if (shared) {
      const author = name.trim() || 'Misafir';
      localStorage.setItem('notebase:guestName', author);
      try {
        const newId = await addSharedComment(shared.shareId, { boardId: currentId, nodeId: id, t: stamp, author, body: text });
        const c: RemoteComment = {
          id: newId,
          boardId: currentId,
          nodeId: id,
          t: stamp,
          author,
          body: text,
          createdAt: new Date().toISOString(),
          done: false,
        };
        useStore.setState((s) => ({ clientComments: { ...s.clientComments, [id]: [...(s.clientComments[id] ?? []), c] } }));
        toast('Yorumun gönderildi');
      } catch (e) {
        toast(`Yorum gönderilemedi: ${(e as Error).message}`);
        return;
      }
    }
    setDraft('');
    setStamp(null);
  };

  const toggleDone = (r: Row) => {
    if (r.remote) return updateClientComment(r.id, { done: !r.done });
    updateData(id, { comments: own.map((c) => (c.id === r.id ? { ...c, done: !c.done } : c)) });
  };
  const remove = (r: Row) => {
    if (r.remote) return updateClientComment(r.id, null);
    updateData(id, { comments: own.filter((c) => c.id !== r.id) });
  };

  return (
    <Shell
      icon={<Video size={12} />}
      label="Video"
      selected={selected}
      resizable="width"
      minWidth={200}
      className="media-card video-card"
      actions={
        <>
          {has && (
            <button className={`nodrag chip allow ${open ? 'on' : ''}`} title="Yorumlar" onClick={() => setOpen(!open)}>
              <MessageSquare size={11} /> {rows.length || ''}
            </button>
          )}
          {src && kind === 'file' && (
            <button className="nodrag icon-btn allow" title="Büyüt" onClick={() => setLightbox({ src, kind: 'video' })}>
              <Maximize2 size={12} />
            </button>
          )}
        </>
      }
    >
      {has ? (
        <>
          <div className="media-frame nodrag" style={{ aspectRatio: String(data.aspect ?? 16 / 9) }}>
            {embed ? (
              <iframe
                ref={player.frameRef}
                src={`${embed}${embed.includes('?') ? '&' : '?'}${kind === 'youtube' ? 'enablejsapi=1&playsinline=1' : 'playsinline=1'}`}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              src && (
                <video
                  ref={player.videoRef}
                  src={src}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    player.setDuration(v.duration);
                    const aspect = Math.round((v.videoWidth / v.videoHeight) * 1000) / 1000;
                    if (aspect && aspect !== data.aspect && !readOnly) updateData(id, { aspect });
                  }}
                />
              )
            )}
          </div>
          {player.duration > 0 && rows.some((r) => r.t !== null) && (
            <div className="timeline nodrag">
              {rows
                .filter((r) => r.t !== null)
                .map((r) => (
                  <button
                    key={r.id}
                    className={`marker allow ${r.remote ? 'remote' : ''} ${r.done ? 'done' : ''}`}
                    style={{ left: `${Math.min(100, (r.t! / player.duration) * 100)}%` }}
                    title={`${fmtTime(r.t!)} — ${r.text}`}
                    onClick={() => player.seek(r.t!)}
                  />
                ))}
            </div>
          )}
          <Caption id={id} value={data.caption} />
          {open && (
            <div className="comments nodrag nowheel">
              {rows.map((r) => (
                <div key={r.id} className={`comment ${r.done ? 'done' : ''}`}>
                  {r.t !== null ? (
                    <button className="time allow" onClick={() => player.seek(r.t!)}>
                      {fmtTime(r.t)}
                    </button>
                  ) : (
                    <span className="time muted">—</span>
                  )}
                  <div className="comment-body">
                    <span className={`author ${r.remote ? 'remote' : ''}`}>{r.author}</span> {r.text}
                  </div>
                  {!readOnly && (
                    <span className="comment-actions">
                      <button className="allow" title={r.done ? 'Açık yap' : 'Çözüldü'} onClick={() => toggleDone(r)}>
                        <Check size={12} />
                      </button>
                      <button className="allow" title="Sil" onClick={() => remove(r)}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {!rows.length && <div className="muted small">Henüz yorum yok. Videoyu durdur ve o ana not bırak.</div>}
              {canComment && (
                <div className="comment-input">
                  {readOnly && !localStorage.getItem('notebase:guestName') && (
                    <input className="allow name" placeholder="Adın" value={name} onChange={(e) => setName(e.target.value)} />
                  )}
                  <button
                    className={`stamp allow ${stamp !== null ? 'on' : ''}`}
                    title={stamp !== null ? 'Zaman damgasını kaldır' : 'Videonun şu anki saniyesini ekle'}
                    onClick={() => setStamp(stamp !== null ? null : player.time())}
                  >
                    <Clock size={11} /> {stamp !== null ? fmtTime(stamp) : 'an'}
                  </button>
                  <input
                    className="allow"
                    value={draft}
                    placeholder="Yorum yaz, Enter"
                    onFocus={() => stamp === null && player.time() > 0 && setStamp(player.time())}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') submit();
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        <EmptyMedia id={id} kind="video" />
      )}
    </Shell>
  );
}
