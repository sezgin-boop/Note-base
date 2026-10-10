import { Check, Copy, ExternalLink, Sparkles, TriangleAlert } from 'lucide-react';
import { useMemo, useState } from 'react';
import { importFromAi } from '../ai/apply';
import { parseImport, summarize } from '../ai/importer';
import { useStore } from '../store';
import { toast } from '../ui';
import { boardMarkdown, Modal } from './Dialogs';

const PRESETS = [
  'Turn this idea into a 6–8 shot storyboard',
  'Give me 5 hook options for the first 3 seconds',
  'Write a script outline with timestamps',
  'Make a shot list for the shoot day',
  'Suggest B-roll ideas and image prompts for each scene',
];

/** Where imported cards go: to the right of what's already on the board. */
function freeSpot() {
  const nodes = useStore.getState().nodes;
  if (!nodes.length) return { x: 0, y: 0 };
  const right = Math.max(...nodes.map((n) => n.position.x + (n.measured?.width ?? n.width ?? 260)));
  const top = Math.min(...nodes.map((n) => n.position.y));
  return { x: right + 160, y: top };
}

export function AiDialog() {
  const { setPanel, boards, currentId } = useStore();
  const board = boards.find((b) => b.id === currentId);
  const [request, setRequest] = useState('');
  const [reply, setReply] = useState('');
  const [section, setSection] = useState<boolean | null>(null);

  const parsed = useMemo(() => {
    if (!reply.trim()) return null;
    try {
      return { ok: true as const, value: parseImport(reply) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  }, [reply]);
  const defaultSection = parsed?.ok ? !!parsed.value.section || parsed.value.cards.length > 3 : true;

  const copyBoard = async () => {
    const viewUrl = board?.shareId ? `${location.origin}/?share=${board.shareId}` : undefined;
    const text = await boardMarkdown(viewUrl, request);
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied — paste it into Claude or ChatGPT');
    } catch {
      prompt('Copy this and paste it into your AI:', text);
    }
  };

  const add = () => {
    if (!parsed?.ok) return;
    if (importFromAi(reply, freeSpot(), { section: section ?? defaultSection, parsed: parsed.value })) setPanel(null);
  };

  return (
    <Modal title="Work with AI" onClose={() => setPanel(null)}>
      <div className="stack">
        <div className="share-block">
          <div className="share-title">
            <span className="step">1</span> Send this board to your AI
          </div>
          <textarea
            className="field-input ai-request"
            rows={2}
            placeholder="What should the AI do? (optional)"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
          />
          <div className="preset-list">
            {PRESETS.map((p) => (
              <button key={p} className={`tag-chip big ${request === p ? 'on' : ''}`} onClick={() => setRequest(p)}>
                {p}
              </button>
            ))}
          </div>
          <div className="row">
            <button className="btn" onClick={copyBoard}>
              <Copy size={14} /> Copy board{request.trim() ? ' + request' : ''}
            </button>
            <span className="row ai-links">
              <a className="btn-ghost" href="https://claude.ai/new" target="_blank" rel="noreferrer">
                Claude <ExternalLink size={12} />
              </a>
              <a className="btn-ghost" href="https://chatgpt.com/" target="_blank" rel="noreferrer">
                ChatGPT <ExternalLink size={12} />
              </a>
            </span>
          </div>
          <small className="muted">
            The copied text also tells the AI how to answer with a <code>notebase</code> block, so its reply can become cards.
          </small>
        </div>

        <div className="share-block">
          <div className="share-title">
            <span className="step">2</span> Paste the AI’s reply
          </div>
          <textarea
            className="field-input ai-reply"
            rows={5}
            placeholder="Paste the whole answer here — Notebase finds the cards in it."
            value={reply}
            onChange={(e) => setReply(e.target.value)}
          />
          {parsed &&
            (parsed.ok ? (
              <div className="ai-found ok">
                <Check size={14} /> Found {summarize(parsed.value)}
                {parsed.value.section && <span className="muted"> · section “{parsed.value.section}”</span>}
              </div>
            ) : (
              <div className="ai-found bad">
                <TriangleAlert size={14} /> {parsed.error} Ask your AI: “Please add the notebase block.”
              </div>
            ))}
          <div className="row">
            <label className="check-row">
              <input type="checkbox" checked={section ?? defaultSection} onChange={(e) => setSection(e.target.checked)} />
              Group in a section
            </label>
            <button className="btn" disabled={!parsed?.ok} onClick={add}>
              <Sparkles size={14} /> Add to board
            </button>
          </div>
          <small className="muted">Tip: you can also just paste the AI’s reply onto the canvas with ⌘V / Ctrl+V.</small>
        </div>
      </div>
    </Modal>
  );
}
