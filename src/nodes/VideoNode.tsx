import type { NodeProps } from '@xyflow/react';
import { BadgeCheck, Camera, Check, Clock, Maximize2, MessageSquare, Play, Plus, Trash2, Video } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useRef, useState } from 'react';
import { addSharedComment, type RemoteComment } from '../cloud';
import { embedUrl, saveMedia, useMediaUrl } from '../db';
import { fmtTime } from '../share/outline';
import { useStore } from '../store';
import { updateClientComment } from '../sync';
import type { CardData, CardNode, VideoComment, VideoVersion } from '../types';
import { toast } from '../ui';
import { Caption, EmptyMedia, pickFile } from './MediaNodes';
import { Shell } from './Shell';

type Kind = 'file' | 'youtube' | 'vimeo';

/** Reads the playhead of a <video> or a YouTube/Vimeo embed (via their postMessage APIs) and seeks it. */
function usePlayer(kind: Kind | null, live: boolean) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const clock = useRef({ time: 0, duration: 0 });
  const [duration, setDuration] = useState(0);
  /** Called when a YouTube/Vimeo player isn't loaded yet (it loads on demand). */
  const onIdleSeek = useRef<((t: number) => void) | null>(null);

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
  }, [kind, live]);

  const time = () => (kind === 'file' ? (videoRef.current?.currentTime ?? 0) : clock.current.time);
  const seek = (t: number) => {
    if (kind !== 'file' && !frameRef.current) return onIdleSeek.current?.(t);
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
  return { videoRef, frameRef, time, seek, duration, setDuration, onIdleSeek };
}

const poster = (embed: string) => {
  const yt = embed.match(/youtube\.com\/embed\/([\w-]{11})/);
  return yt ? `https://img.youtube.com/vi/${yt[1]}/hqdefault.jpg` : null;
};

const embedSrc = (embed: string, kind: Kind | null, start: number) => {
  const sep = embed.includes('?') ? '&' : '?';
  const t = Math.floor(start);
  return kind === 'youtube'
    ? `${embed}${sep}enablejsapi=1&playsinline=1&autoplay=1${t ? `&start=${t}` : ''}`
    : `${embed}${sep}playsinline=1&autoplay=1${t ? `#t=${t}s` : ''}`;
};

interface Row {
  id: string;
  t: number | null;
  text: string;
  author: string;
  done: boolean;
  remote: boolean;
}

/** Versions of a video card. Cards made before versions existed have one implicit "V1". */
export function videoVersions(d: CardData): VideoVersion[] {
  if (d.versions?.length) return d.versions;
  return [{ id: 'v1', label: 'V1', mediaId: d.mediaId, url: d.url, aspect: d.aspect, at: 0 }];
}

/** Ask for a new file or link and make it the next version of the video. */
async function addVersion(id: string, d: CardData) {
  const versions = videoVersions(d);
  const file = await pickFile('video/*');
  let media: Partial<VideoVersion> | null = null;
  if (file) media = { mediaId: await saveMedia(file) };
  else {
    const url = prompt('No file chosen. Paste a link for the new version instead (YouTube, Vimeo or .mp4):');
    if (url?.trim()) media = { url: url.trim() };
  }
  if (!media) return;
  const n = versions.length + 1;
  const v: VideoVersion = { id: `v${n}-${nanoid(4)}`, label: `V${n}`, at: Date.now(), ...media };
  useStore.getState().updateData(id, {
    versions: [...versions, v],
    versionId: v.id,
    mediaId: v.mediaId,
    url: v.url,
    aspect: undefined,
  });
  toast(`${v.label} added — new comments go to this version`);
}

export function VideoNode({ id, data, selected, positionAbsoluteX, positionAbsoluteY, width }: NodeProps<CardNode>) {
  const src = useMediaUrl(data.mediaId, data.url);
  // Only what this card needs (the whole store would re-render every video on every change).
  const setLightbox = useStore((s) => s.setLightbox);
  const updateData = useStore((s) => s.updateData);
  const readOnly = useStore((s) => s.readOnly);
  const shared = useStore((s) => s.shared);
  const currentId = useStore((s) => s.currentId);
  const clientComments = useStore((s) => s.clientComments[id]);
  const embed = data.url ? embedUrl(data.url) : null;
  const kind: Kind | null = embed ? (embed.includes('vimeo') ? 'vimeo' : 'youtube') : src ? 'file' : null;
  // YouTube / Vimeo players are whole web pages: load one only when it's played. A board full of
  // them would otherwise use enough memory to crash a phone's browser.
  const [live, setLive] = useState<{ start: number } | null>(null);
  const player = usePlayer(kind, !!live);
  player.onIdleSeek.current = (t) => setLive({ start: t });

  const versions = videoVersions(data);
  const current = versions.find((v) => v.id === data.versionId) ?? versions.at(-1)!;
  // In a shared view the viewer can flip between versions without changing the board.
  const [viewVersion, setViewVersion] = useState<string | null>(null);
  const shown = readOnly ? (versions.find((v) => v.id === viewVersion) ?? current) : current;
  const showVersion = (v: VideoVersion) => {
    if (readOnly) return setViewVersion(v.id);
    updateData(id, { versionId: v.id, mediaId: v.mediaId, url: v.url, aspect: v.aspect });
  };
  const viewSrc = useMediaUrl(shown.mediaId, shown.url);
  const playSrc = readOnly ? viewSrc : src;
  const playEmbed = readOnly ? (shown.url ? embedUrl(shown.url) : null) : embed;

  useEffect(() => setLive(null), [playEmbed]);

  const inVersion = (v?: string | null) => (v ?? 'v1') === shown.id;
  const own = data.comments ?? [];
  const rows: Row[] = [
    ...own
      .filter((c) => inVersion(c.v))
      .map((c) => ({ id: c.id, t: c.t, text: c.text, author: c.author || 'Me', done: !!c.done, remote: false })),
    ...(clientComments ?? [])
      .filter((c) => c.kind !== 'approval' && inVersion(c.version))
      .map((c) => ({ id: c.id, t: c.t, text: c.body, author: c.author, done: c.done, remote: true })),
  ].sort((a, b) => (a.t ?? -1) - (b.t ?? -1));
  const resolved = rows.filter((r) => r.done).length;

  const approvals = [
    ...(data.approvals ?? []).map((a) => ({ version: a.version, by: a.by })),
    ...(readOnly
      ? (clientComments ?? []).filter((c) => c.kind === 'approval').map((c) => ({ version: c.version ?? 'v1', by: c.author }))
      : []),
  ];
  const approved = approvals.find((a) => a.version === shown.id);

  const canComment = !readOnly || !!shared?.allowComments;
  const [open, setOpen] = useState(rows.length > 0);
  const commentsRef = useRef<HTMLDivElement>(null);
  const [commentsScroll, setCommentsScroll] = useState(false);
  useEffect(() => {
    const el = commentsRef.current;
    setCommentsScroll(!!el && el.scrollHeight > el.clientHeight + 1);
  });
  const [draft, setDraft] = useState('');
  const [stamp, setStamp] = useState<number | null>(null);
  const [name, setName] = useState(() => localStorage.getItem('notebase:guestName') ?? '');
  const has = data.mediaId || data.url;

  const sendShared = async (body: string, kind: 'comment' | 'approval', t: number | null) => {
    if (!shared) return false;
    const author = name.trim() || prompt('Your name (shown with your feedback):')?.trim() || 'Guest';
    localStorage.setItem('notebase:guestName', author);
    setName(author);
    try {
      const newId = await addSharedComment(shared.shareId, {
        boardId: currentId,
        nodeId: id,
        t,
        author,
        body,
        version: shown.id,
        kind,
      });
      const c: RemoteComment = {
        id: newId,
        boardId: currentId,
        nodeId: id,
        t,
        author,
        body,
        createdAt: new Date().toISOString(),
        done: false,
        version: shown.id,
        kind,
      };
      useStore.setState((s) => ({ clientComments: { ...s.clientComments, [id]: [...(s.clientComments[id] ?? []), c] } }));
      return true;
    } catch (e) {
      toast(`Couldn't send: ${(e as Error).message}`);
      return false;
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text) return;
    if (!readOnly) {
      const c: VideoComment = { id: nanoid(8), t: stamp, text, at: Date.now(), v: current.id };
      updateData(id, { comments: [...own, c] });
    } else if (!(await sendShared(text, 'comment', stamp))) return;
    else toast('Comment sent');
    setDraft('');
    setStamp(null);
  };

  const approve = async () => {
    if (!confirm(`Approve ${shown.label} as final?`)) return;
    if (await sendShared(`Approved ${shown.label}`, 'approval', null)) toast(`${shown.label} approved — thank you!`);
  };

  const toggleDone = (r: Row) => {
    if (r.remote) return updateClientComment(r.id, { done: !r.done });
    updateData(id, { comments: own.map((c) => (c.id === r.id ? { ...c, done: !c.done } : c)) });
  };
  const remove = (r: Row) => {
    if (r.remote) return updateClientComment(r.id, null);
    updateData(id, { comments: own.filter((c) => c.id !== r.id) });
  };

  /** Save the paused frame as an image card next to the video. */
  const grabFrame = async () => {
    const v = player.videoRef.current;
    if (!v || !v.videoWidth) return toast('Play or pause the video at the frame you want first');
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    try {
      canvas.getContext('2d')!.drawImage(v, 0, 0);
      const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
      if (!blob) throw new Error('empty frame');
      const mediaId = await saveMedia(blob);
      const s = useStore.getState();
      const at = { x: positionAbsoluteX + (width ?? 360) + 40, y: positionAbsoluteY };
      s.addCard('image', at, { mediaId, caption: `${data.caption || 'Frame'} @ ${fmtTime(v.currentTime)}` });
      toast('Frame saved as an image card');
    } catch {
      toast("This video doesn't allow grabbing frames (it's hosted elsewhere)");
    }
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
            <button className={`nodrag chip allow ${open ? 'on' : ''}`} title="Comments" onClick={() => setOpen(!open)}>
              <MessageSquare size={11} /> {rows.length ? `${resolved}/${rows.length}` : ''}
            </button>
          )}
          {kind === 'file' && !readOnly && (
            <button className="nodrag icon-btn" title="Grab this frame as an image" onClick={grabFrame}>
              <Camera size={12} />
            </button>
          )}
          {playSrc && kind === 'file' && (
            <button
              className="nodrag icon-btn allow"
              title="Full screen"
              onClick={() => setLightbox({ src: playSrc, kind: 'video' })}
            >
              <Maximize2 size={12} />
            </button>
          )}
        </>
      }
    >
      {has ? (
        <>
          {(versions.length > 1 || !readOnly) && (
            <div className="versions nodrag">
              {versions.map((v) => (
                <button
                  key={v.id}
                  className={`version allow ${v.id === shown.id ? 'on' : ''} ${approvals.some((a) => a.version === v.id) ? 'approved' : ''}`}
                  onClick={() => showVersion(v)}
                  title={approvals.some((a) => a.version === v.id) ? `${v.label} — approved` : v.label}
                >
                  {v.label}
                  {approvals.some((a) => a.version === v.id) && <BadgeCheck size={11} />}
                </button>
              ))}
              {!readOnly && (
                <button className="version add" title="Upload a new version" onClick={() => addVersion(id, data)}>
                  <Plus size={11} /> Version
                </button>
              )}
            </div>
          )}
          <div className="media-frame nodrag" style={{ aspectRatio: String(shown.aspect ?? data.aspect ?? 16 / 9) }}>
            {playEmbed && !live ? (
              <button className="embed-poster" title="Play" onClick={() => setLive({ start: 0 })}>
                {poster(playEmbed) && <img src={poster(playEmbed)!} alt="" draggable={false} loading="lazy" />}
                <span className="embed-play">
                  <Play size={20} fill="currentColor" />
                </span>
              </button>
            ) : playEmbed && live ? (
              <iframe
                key={playEmbed}
                ref={player.frameRef}
                src={embedSrc(playEmbed, kind, live.start)}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
              />
            ) : (
              playSrc && (
                <video
                  key={playSrc}
                  ref={player.videoRef}
                  src={playSrc}
                  // Cloud copies need CORS so frames can be grabbed; local blobs don't.
                  crossOrigin={playSrc.startsWith('http') ? 'anonymous' : undefined}
                  controls
                  playsInline
                  preload="metadata"
                  onLoadedMetadata={(e) => {
                    const v = e.currentTarget;
                    player.setDuration(v.duration);
                    const aspect = Math.round((v.videoWidth / v.videoHeight) * 1000) / 1000;
                    if (!aspect || readOnly || aspect === current.aspect) return;
                    updateData(id, {
                      aspect,
                      ...(data.versions
                        ? { versions: data.versions.map((x) => (x.id === current.id ? { ...x, aspect } : x)) }
                        : {}),
                    });
                  }}
                />
              )
            )}
          </div>
          {approved && (
            <div className="approved-banner">
              <BadgeCheck size={13} /> {shown.label} approved by {approved.by}
            </div>
          )}
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
            <div
              ref={commentsRef}
              // Only capture the wheel when the list actually scrolls; otherwise the canvas pans.
              className={`comments nodrag ${commentsScroll ? 'nowheel' : ''}`}
            >
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
                      <button className="allow" title={r.done ? 'Reopen' : 'Resolve'} onClick={() => toggleDone(r)}>
                        <Check size={12} />
                      </button>
                      <button className="allow" title="Delete" onClick={() => remove(r)}>
                        <Trash2 size={12} />
                      </button>
                    </span>
                  )}
                </div>
              ))}
              {!rows.length && (
                <div className="muted small">
                  No comments on {shown.label} yet. Pause the video and leave a note at that moment.
                </div>
              )}
              {canComment && (
                <div className="comment-input">
                  <button
                    className={`stamp allow ${stamp !== null ? 'on' : ''}`}
                    title={stamp !== null ? 'Remove timestamp' : 'Attach the current time of the video'}
                    onClick={() => setStamp(stamp !== null ? null : player.time())}
                  >
                    <Clock size={11} /> {stamp !== null ? fmtTime(stamp) : 'now'}
                  </button>
                  <input
                    className="allow"
                    value={draft}
                    placeholder={`Comment on ${shown.label}, Enter`}
                    onFocus={() => stamp === null && player.time() > 0 && setStamp(player.time())}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') submit();
                    }}
                  />
                </div>
              )}
              {readOnly && shared?.allowComments && !approved && (
                <button className="approve-btn allow" onClick={approve}>
                  <BadgeCheck size={14} /> Approve {shown.label}
                </button>
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
