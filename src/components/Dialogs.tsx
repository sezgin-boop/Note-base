import { Bot, Check, Cloud, Copy, Download, ExternalLink, Link2, LogOut, RefreshCw, Smartphone, X } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useEffect, useState, type ReactNode } from 'react';
import { cloudConfigured, mediaPublicUrl } from '../cloud';
import * as db from '../db';
import { boardsToMarkdown, type OutlineBoard } from '../share/outline';
import { useStore } from '../store';
import { signIn, signOut, syncNow, useCloud } from '../sync';
import { toast, useToasts } from '../ui';

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="overlay center" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <b>{title}</b>
          <button className="icon-btn" onClick={onClose}>
            <X size={15} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const copy = async (text: string, msg = 'Copied') => {
  try {
    await navigator.clipboard.writeText(text);
    toast(msg);
  } catch {
    prompt('Copy:', text);
  }
};

function CopyField({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="copy-field">
      <span className="copy-label">{label}</span>
      <div className="copy-row">
        <input readOnly value={value} onFocus={(e) => e.target.select()} />
        <button className="btn-ghost" onClick={() => copy(value)}>
          <Copy size={13} /> Copy
        </button>
        <a className="btn-ghost" href={value} target="_blank" rel="noreferrer">
          <ExternalLink size={13} />
        </a>
      </div>
      {hint && <small className="muted">{hint}</small>}
    </div>
  );
}

// ---------- Account / cloud ----------

export function AccountDialog() {
  const setPanel = useStore((s) => s.setPanel);
  const cloud = useCloud();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const submit = async (create: boolean) => {
    setBusy(true);
    setMsg(null);
    try {
      const r = await signIn(email.trim(), password, create);
      if (r === 'confirm') setMsg('Account created. Click the confirmation link in your email, then sign in here.');
    } catch (e) {
      setMsg(trError((e as Error).message));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="Cloud sync" onClose={() => setPanel(null)}>
      {!cloudConfigured ? (
        <div className="stack">
          <p>
            The cloud isn't connected yet. Once it is, your boards, images and videos are the same on every device (phone,
            computer) and you can share boards with a link.
          </p>
          <p className="muted small">
            One-time setup (about 5 minutes): create a free Supabase project, run <code>supabase/schema.sql</code>, and add two
            keys to Vercel. The steps are in the project README.
          </p>
        </div>
      ) : cloud.user ? (
        <div className="stack">
          <div className="account-row">
            <Cloud size={16} />
            <div>
              <b>{cloud.user.email}</b>
              <div className="muted small">
                <SyncLabel />
              </div>
            </div>
          </div>
          {cloud.error && cloud.status === 'error' && <p className="error small">{cloud.error}</p>}
          <div className="row">
            <button className="btn" onClick={() => syncNow()}>
              <RefreshCw size={14} /> Sync now
            </button>
            <button
              className="btn-ghost"
              onClick={async () => {
                await signOut();
                toast('Signed out. Your boards stay on this device.');
              }}
            >
              <LogOut size={14} /> Sign out
            </button>
          </div>
          <p className="muted small">
            Changes go to the cloud automatically; other devices pick them up when the app opens and every 30 seconds. You can
            keep working offline — changes are sent when you're back online.
          </p>
        </div>
      ) : (
        <form
          className="stack"
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
        >
          <p className="muted small">Sign in to keep your boards in sync across devices.</p>
          <input
            className="field-input"
            type="email"
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            className="field-input"
            type="password"
            autoComplete="current-password"
            placeholder="Password (at least 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
          />
          {msg && <p className="small notice">{msg}</p>}
          <div className="row">
            <button className="btn" disabled={busy} type="submit">
              Sign in
            </button>
            <button className="btn-ghost" disabled={busy} type="button" onClick={() => submit(true)}>
              Create account
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

const trError = (m: string) =>
  /invalid login/i.test(m)
    ? 'Wrong email or password. No account yet? Press "Create account".'
    : /already registered/i.test(m)
      ? 'There is already an account with this email. Sign in instead.'
      : /not confirmed/i.test(m)
        ? 'Email not confirmed yet. Click the link in your inbox.'
        : /signups not allowed/i.test(m)
          ? 'Creating new accounts is turned off.'
          : m;

export function SyncLabel() {
  const { status, lastSync, uploads } = useCloud();
  const text: Record<string, string> = {
    off: 'Cloud off',
    syncing: 'Syncing…',
    synced: lastSync ? `Synced · ${new Date(lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : 'Synced',
    offline: 'Offline — will sync when back online',
    error: 'Sync error',
  };
  return (
    <>
      {text[status]}
      {uploads > 0 && ` · uploading ${uploads} file${uploads > 1 ? 's' : ''}`}
    </>
  );
}

// ---------- Share ----------

/** The current board and its sub-boards, ready for the outline renderer. */
async function collectTree(): Promise<OutlineBoard[]> {
  const { boards, currentId, nodes, edges, shared } = useStore.getState();
  const ids: string[] = [];
  const walk = (id: string) => {
    ids.push(id);
    boards.filter((b) => b.parentId === id).forEach((b) => walk(b.id));
  };
  walk(currentId);
  return Promise.all(
    ids.map(async (id) => {
      const meta = boards.find((b) => b.id === id)!;
      const content =
        id === currentId ? { nodes, edges } : shared ? (shared.contents[id] ?? { nodes: [], edges: [] }) : await db.loadBoard(id);
      return { id, name: meta.name, icon: meta.icon, parentId: id === currentId ? null : meta.parentId, content };
    }),
  );
}

export async function boardMarkdown(viewUrl?: string) {
  const tree = await collectTree();
  const uploaded = new Set<string>(JSON.parse(localStorage.getItem('notebase:uploaded') ?? '[]'));
  const shared = useStore.getState().shared;
  return boardsToMarkdown(tree, {
    rootId: tree[0].id,
    viewUrl,
    mediaUrl: (id) => (cloudConfigured && (uploaded.has(id) || shared) ? mediaPublicUrl(id) : null),
    comments: Object.values(useStore.getState().clientComments).flat(),
  });
}

export function ShareDialog() {
  const { setPanel, boards, currentId, renameBoard } = useStore();
  const cloud = useCloud();
  const board = boards.find((b) => b.id === currentId)!;
  const origin = location.origin;
  const subCount = (function count(id: string): number {
    return boards.filter((b) => b.parentId === id).reduce((n, b) => n + 1 + count(b.id), 0);
  })(currentId);

  const enable = () => {
    renameBoard(board.id, { shareId: nanoid(16), shareComments: true });
    setTimeout(() => syncNow(), 600);
  };

  const downloadMd = async () => {
    const md = await boardMarkdown(board.shareId ? `${origin}/?share=${board.shareId}` : undefined);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([md], { type: 'text/markdown' }));
    a.download = `${board.name.replace(/[^\p{L}\p{N} _-]/gu, '').trim() || 'board'}.md`;
    a.click();
  };

  return (
    <Modal title={`Share · ${board.icon} ${board.name}`} onClose={() => setPanel(null)}>
      <div className="stack">
        <div className="share-block">
          <div className="share-title">
            <Bot size={15} /> Give it to an AI
          </div>
          <p className="muted small">
            Turns the board {subCount ? `(and its ${subCount} sub-board${subCount > 1 ? 's' : ''}) ` : ''}into structured text —
            sections, cards and the arrows between them. Paste it into Claude or ChatGPT and talk through your idea.
          </p>
          <div className="row">
            <button
              className="btn"
              onClick={async () =>
                copy(
                  await boardMarkdown(board.shareId ? `${origin}/?share=${board.shareId}` : undefined),
                  'Board copied as text — paste it into your AI',
                )
              }
            >
              <Copy size={14} /> Copy as text
            </button>
            <button className="btn-ghost" onClick={downloadMd}>
              <Download size={14} /> Download .md
            </button>
          </div>
        </div>

        <div className="share-block">
          <div className="share-title">
            <Link2 size={15} /> Share with a link
          </div>
          {!cloudConfigured || !cloud.user ? (
            <>
              <p className="muted small">
                Turn on cloud sync to share with a link — the board has to be in the cloud for the link to work.
              </p>
              <button className="btn-ghost" onClick={() => setPanel('account')}>
                <Cloud size={14} /> {cloudConfigured ? 'Sign in' : 'Connect the cloud'}
              </button>
            </>
          ) : !board.shareId ? (
            <>
              <p className="muted small">
                Anyone with the link can view this board{subCount ? ' and its sub-boards' : ''} but not change it. You can turn it
                off any time.
              </p>
              <button className="btn" onClick={enable}>
                <Link2 size={14} /> Create share link
              </button>
            </>
          ) : (
            <>
              <CopyField
                label="Client link"
                value={`${origin}/?share=${board.shareId}`}
                hint="Opens the board as a canvas. Clients can leave timestamped video comments and approve versions."
              />
              <CopyField
                label="AI / reading link"
                value={`${origin}/s/${board.shareId}`}
                hint="Everything as a plain page. Give this link to Claude, ChatGPT and similar tools."
              />
              <label className="check-row">
                <input
                  type="checkbox"
                  checked={board.shareComments ?? true}
                  onChange={(e) => {
                    renameBoard(board.id, { shareComments: e.target.checked });
                    setTimeout(() => syncNow(), 300);
                  }}
                />
                Viewers can comment on and approve videos
              </label>
              <div className="row">
                <span className="muted small">
                  <SyncLabel />
                </span>
                <button
                  className="btn-ghost danger"
                  onClick={() => {
                    if (!confirm('Turn off sharing? Existing links will stop working.')) return;
                    renameBoard(board.id, { shareId: null });
                    setTimeout(() => syncNow(), 300);
                  }}
                >
                  Stop sharing
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ---------- Install (PWA) ----------

let deferredPrompt: any = null;
const installListeners = new Set<() => void>();
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installListeners.forEach((l) => l());
});

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;

export function useCanInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    installListeners.add(l);
    return () => void installListeners.delete(l);
  }, []);
  return !isStandalone();
}

export function InstallDialog() {
  const setPanel = useStore((s) => s.setPanel);
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return (
    <Modal title="Install as an app" onClose={() => setPanel(null)}>
      <div className="stack">
        <p className="muted small">
          Add Notebase to your home screen or desktop: it gets its own icon, opens full screen and works offline.
        </p>
        {deferredPrompt ? (
          <button
            className="btn"
            onClick={async () => {
              deferredPrompt.prompt();
              const choice = await deferredPrompt.userChoice;
              deferredPrompt = null;
              if (choice?.outcome === 'accepted') {
                toast('Installed');
                setPanel(null);
              }
            }}
          >
            <Smartphone size={14} /> Install now
          </button>
        ) : ios ? (
          <ol className="steps">
            <li>
              In Safari, tap the <b>Share</b> button (square with an arrow).
            </li>
            <li>
              Choose <b>Add to Home Screen</b>.
            </li>
            <li>
              Tap <b>Add</b> — Notebase is on your home screen.
            </li>
          </ol>
        ) : (
          <ol className="steps">
            <li>
              <b>Chrome / Edge (computer):</b> click the install icon (⊕) at the right of the address bar.
            </li>
            <li>
              <b>Android:</b> browser menu (⋮) → <b>Install app</b> or <b>Add to Home screen</b>.
            </li>
          </ol>
        )}
      </div>
    </Modal>
  );
}

export function Toasts() {
  const toasts = useToasts((s) => s.toasts);
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className="toast">
          <Check size={14} /> {t.text}
        </div>
      ))}
    </div>
  );
}
