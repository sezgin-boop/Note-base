import { Camera, Inbox, Mic, MicOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { makeCard, SIZES } from '../cards';
import { hostname, isImageUrl, isVideoUrl, loadBoard, saveMedia } from '../db';
import { useStore } from '../store';
import type { CardData, CardType } from '../types';
import { toast } from '../ui';
import { Modal } from './Dialogs';
import { pickFile } from '../nodes/MediaNodes';

const LANGS: [string, string][] = [
  ['en-US', 'English'],
  ['tr-TR', 'Türkçe'],
  ['de-DE', 'Deutsch'],
  ['es-ES', 'Español'],
  ['fr-FR', 'Français'],
];

const Recognition: any = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

/** Next free slot on a board, filling a 4-wide grid below what's there. */
async function nextSlot(boardId: string) {
  const s = useStore.getState();
  const nodes = boardId === s.currentId ? s.nodes : (await loadBoard(boardId)).nodes;
  const i = nodes.length;
  return { x: (i % 4) * 300, y: Math.floor(i / 4) * 260 };
}

export function CaptureDialog() {
  const { setPanel, currentId, boards, ensureInbox, appendCard } = useStore();
  const [text, setText] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [toInbox, setToInbox] = useState(true);
  const [listening, setListening] = useState(false);
  const [lang, setLang] = useState(
    () => localStorage.getItem('notebase:dictation') || (navigator.language.startsWith('tr') ? 'tr-TR' : 'en-US'),
  );
  const rec = useRef<any>(null);
  const base = useRef('');
  const current = boards.find((b) => b.id === currentId);

  useEffect(() => () => rec.current?.stop(), []);

  const toggleMic = () => {
    if (listening) return rec.current?.stop();
    const r = new Recognition();
    r.lang = lang;
    r.continuous = true;
    r.interimResults = true;
    base.current = text ? `${text.trimEnd()} ` : '';
    r.onresult = (e: any) => {
      let finalText = '';
      let interim = '';
      for (let i = 0; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += t;
        else interim += t;
      }
      setText(base.current + finalText + interim);
    };
    r.onerror = (e: any) => {
      if (e.error === 'not-allowed') toast('Microphone access was blocked');
      setListening(false);
    };
    r.onend = () => setListening(false);
    rec.current = r;
    r.start();
    setListening(true);
  };

  const save = async () => {
    rec.current?.stop();
    const t = text.trim();
    if (!t && !photo) return;
    const boardId = toInbox ? await ensureInbox() : currentId;
    let at = await nextSlot(boardId);
    const add = async (type: CardType, data: CardData) => {
      const card = makeCard(type, at, data);
      await appendCard(boardId, card);
      at = { x: at.x + (SIZES[type]?.width ?? 260) + 40, y: at.y };
    };
    const url = t.match(/^https?:\/\/\S+$/)?.[0];
    if (photo) await add('image', { mediaId: await saveMedia(photo), caption: url ? '' : t });
    if (url) {
      if (isImageUrl(url)) await add('image', { url });
      else if (isVideoUrl(url)) await add('video', { url });
      else await add('link', { url, title: hostname(url) });
    } else if (t && !photo) await add('note', { text: t });
    toast(toInbox ? 'Saved to Inbox' : 'Added to this board');
    setPanel(null);
  };

  return (
    <Modal title="Quick capture" onClose={() => setPanel(null)}>
      <div className="stack">
        <textarea
          className="field-input capture-text"
          autoFocus
          rows={4}
          placeholder="An idea, a link, a shot you saw…"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) save();
          }}
        />
        {photo && (
          <div className="capture-photo">
            <img src={URL.createObjectURL(photo)} alt="" />
            <button className="btn-ghost" onClick={() => setPhoto(null)}>
              Remove photo
            </button>
          </div>
        )}
        <div className="row">
          <div className="capture-tools">
            {Recognition && (
              <>
                <button className={`btn-ghost ${listening ? 'recording' : ''}`} onClick={toggleMic}>
                  {listening ? <MicOff size={14} /> : <Mic size={14} />} {listening ? 'Stop' : 'Dictate'}
                </button>
                <select
                  className="mini"
                  value={lang}
                  title="Dictation language"
                  onChange={(e) => {
                    setLang(e.target.value);
                    localStorage.setItem('notebase:dictation', e.target.value);
                  }}
                >
                  {LANGS.map(([v, l]) => (
                    <option key={v} value={v}>
                      {l}
                    </option>
                  ))}
                </select>
              </>
            )}
            <button className="btn-ghost" onClick={async () => setPhoto(await pickFile('image/*'))}>
              <Camera size={14} /> Photo
            </button>
          </div>
        </div>
        <div className="row">
          <label className="check-row">
            <input type="checkbox" checked={toInbox} onChange={(e) => setToInbox(e.target.checked)} />
            <Inbox size={14} /> Save to Inbox {!toInbox && current && <span className="muted">(adding to {current.name})</span>}
          </label>
          <button className="btn" onClick={save} disabled={!text.trim() && !photo}>
            Save <kbd>⌘↵</kbd>
          </button>
        </div>
      </div>
    </Modal>
  );
}
