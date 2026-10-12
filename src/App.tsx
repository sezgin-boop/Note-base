import { DrawToolbar, MarkupBar } from './components/DrawLayer';
import { useDraw } from './draw';
import { applyTheme } from './components/ThemePicker';
import { StylePanel } from './components/StylePanel';
import { ReactFlowProvider } from '@xyflow/react';
import { useEffect, useState } from 'react';
import { fetchShared } from './cloud';
import { hostname, isVideoUrl, loadBoard } from './db';
import { makeCard } from './cards';
import { Zap } from 'lucide-react';
import { AiDialog } from './components/AiDialog';
import { CaptureDialog } from './components/Capture';
import { CalendarView, DetailsDialog } from './components/Planning';
import { toast } from './ui';
import { AccountDialog, InstallDialog, InstallHint, ShareDialog, Toasts } from './components/Dialogs';
import { startSync } from './sync';
import { Canvas } from './components/Canvas';
import { JobsPanel, Lightbox, SearchPalette, Topbar } from './components/Panels';
import { Sidebar } from './components/Sidebar';
import { TOOLS, Toolbar, useAddAtCenter } from './components/Toolbar';
import { TemplatesDialog } from './components/Templates';
import { PhoneCaptureDialog } from './components/PhoneCapture';
import { justCreated, useStore } from './store';

const isTyping = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName));

/**
 * Dictation apps (Wispr Flow…) may put text into the focused field while the browser is in the
 * background, without the usual typing events. When the page is back, nudge that field so the app
 * picks up what's in it (an "input" event is ignored when nothing changed).
 */
function useCatchDictation() {
  useEffect(() => {
    const nudge = () =>
      [0, 150, 600].forEach((ms) =>
        setTimeout(() => {
          const el = document.activeElement;
          if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement)
            el.dispatchEvent(new Event('input', { bubbles: true }));
        }, ms),
      );
    const onVisible = () => document.visibilityState === 'visible' && nudge();
    window.addEventListener('focus', nudge);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', nudge);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
}

function Shortcuts() {
  useCatchDictation();
  const addAtCenter = useAddAtCenter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const s = useStore.getState();
      const mod = e.metaKey || e.ctrlKey;
      const key = e.key.toLowerCase();
      if (mod && key === 'k') return (e.preventDefault(), s.setPanel(s.panel === 'search' ? null : 'search'));
      if (mod && key === 'j') return (e.preventDefault(), s.setPanel(s.panel === 'jobs' ? null : 'jobs'));
      if (mod && e.shiftKey && key === 'c') return (e.preventDefault(), s.setPanel(s.panel === 'calendar' ? null : 'calendar'));
      if (e.key === 'Escape') {
        if (s.lightbox) return s.setLightbox(null);
        if (s.menu) return s.setMenu(null);
        // Inside a dialog, Esc closes it; on the canvas it first leaves the text field.
        if (s.panel && s.panel !== 'jobs') return s.setPanel(null);
        if (isTyping(e.target)) return (e.target as HTMLElement).blur();
        return s.setPanel(null);
      }
      // The jobs list and the card-style inspector sit beside the canvas, so its shortcuts keep working.
      if (isTyping(e.target) || (s.panel && s.panel !== 'jobs' && s.panel !== 'style')) return;
      if (mod && key === 'z') return (e.preventDefault(), e.shiftKey ? s.redo() : s.undo());
      if (mod && key === 'y') return (e.preventDefault(), s.redo());
      if (mod && key === 'd') return (e.preventDefault(), s.duplicateSelected());
      if (mod && key === 'a') return (e.preventDefault(), s.setNodes((ns) => ns.map((n) => ({ ...n, selected: !n.hidden }))));
      if (e.key === 'Delete' || e.key === 'Backspace') return s.deleteSelected();
      if (mod || e.altKey || justCreated()) return;
      // Enter folds / unfolds the selected sections (a focused button handles Enter itself).
      if (e.key === 'Enter' && !(e.target instanceof HTMLButtonElement)) {
        const frames = s.nodes.filter((n) => n.selected && n.type === 'frame');
        if (frames.length) return (e.preventDefault(), s.toggleSections(frames.map((f) => f.id)));
      }
      if (key === 'q') return (e.preventDefault(), s.setPanel('capture'));
      if (key === 'p' && !useDraw.getState().tool) return (e.preventDefault(), useDraw.getState().setTool('pen'));
      if (key === 'a') return (e.preventDefault(), s.setPanel('ai'));
      const tool = TOOLS.find((t) => t.key.toLowerCase() === key);
      if (tool) {
        e.preventDefault();
        addAtCenter(tool.type);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addAtCenter]);
  return null;
}

/** Android "share to Notebase" (manifest share_target) lands here as ?url=&text=&title= and goes to the Inbox. */
async function acceptSharedIntent() {
  const p = new URLSearchParams(location.search);
  // Home-screen shortcut "Quick capture".
  if (p.has('capture')) {
    history.replaceState(null, '', '/');
    return useStore.getState().setPanel('capture');
  }
  const url = p.get('url') || p.get('text')?.match(/https?:\/\/\S+/)?.[0];
  const text = p.get('text') || p.get('title');
  if (!url && !text) return;
  history.replaceState(null, '', '/');
  const s = useStore.getState();
  const inbox = await s.ensureInbox();
  const count = inbox === s.currentId ? s.nodes.length : (await loadBoard(inbox)).nodes.length;
  const at = { x: (count % 4) * 300, y: Math.floor(count / 4) * 260 };
  const card =
    url && isVideoUrl(url)
      ? makeCard('video', at, { url, caption: p.get('title') ?? undefined })
      : url
        ? makeCard('link', at, { url, title: p.get('title') || hostname(url) })
        : makeCard('note', at, { text: text ?? '' });
  await s.appendCard(inbox, card);
  toast('Saved to Inbox');
}

/**
 * ?board=<id> (links from the Claude connector) opens that board. A board made elsewhere may only
 * arrive with the first cloud sync, so wait a little for it.
 */
function openLinkedBoard() {
  const id = new URLSearchParams(location.search).get('board');
  if (!id) return;
  history.replaceState(null, '', '/');
  const open = () => {
    const s = useStore.getState();
    if (!s.boards.some((b) => b.id === id)) return false;
    if (s.currentId !== id) s.openBoard(id);
    return true;
  };
  if (open()) return;
  const stop = useStore.subscribe(() => open() && (stop(), clearTimeout(timer)));
  const timer = setTimeout(stop, 20000);
}

/** Follow the system theme unless the user picked one. */
function useTheme() {
  const theme = useStore((s) => s.theme);
  const palette = useStore((s) => s.palette);
  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const apply = () => applyTheme(theme, palette);
    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [theme, palette]);
}

const shareId = new URLSearchParams(location.search).get('share');

export default function App() {
  const { ready, init, initShared, panel, sidebar, toggleSidebar, setPanel, readOnly } = useStore();
  const [failed, setFailed] = useState<string | null>(null);
  useTheme();
  useEffect(() => {
    if (!shareId) {
      init().then(() => {
        startSync();
        acceptSharedIntent();
        openLinkedBoard();
      });
      return;
    }
    fetchShared(shareId)
      .then((bundle) => (bundle ? initShared(bundle, shareId) : setFailed('This link was turned off or is incorrect.')))
      .catch((e) => setFailed(`Couldn't load the board: ${e.message}`));
  }, [init, initShared]);

  if (failed)
    return (
      <div className="loading">
        <div className="fail">
          <b>Can't open this board</b>
          <span>{failed}</span>
          <a href="/">Go to Notebase</a>
        </div>
      </div>
    );
  if (!ready) return <div className="loading">Notebase</div>;

  return (
    <ReactFlowProvider>
      <div className={`app ${sidebar ? '' : 'no-sidebar'} ${readOnly ? 'read-only' : ''}`}>
        {sidebar && <Sidebar />}
        {(sidebar || panel === 'jobs') && (
          <div className="side-backdrop" onClick={() => (panel === 'jobs' ? setPanel(null) : toggleSidebar())} />
        )}
        <main className="main">
          <Topbar />
          <Canvas />
          {!readOnly && <Toolbar />}
          <DrawToolbar />
          <MarkupBar />
          {!readOnly && (
            <button className="fab" title="Quick capture" onClick={() => setPanel('capture')}>
              <Zap size={20} />
            </button>
          )}
          {panel === 'calendar' && <CalendarView />}
        </main>
        {panel === 'jobs' && <JobsPanel />}
      </div>
      {panel === 'search' && <SearchPalette />}
      {panel === 'share' && <ShareDialog />}
      {panel === 'account' && <AccountDialog />}
      {panel === 'install' && <InstallDialog />}
      {panel === 'capture' && <CaptureDialog />}
      {panel === 'details' && <DetailsDialog />}
      {panel === 'ai' && <AiDialog />}
      {panel === 'style' && <StylePanel />}
      {panel === 'templates' && <TemplatesDialog />}
      {panel === 'phone' && <PhoneCaptureDialog />}
      <InstallHint />
      <Lightbox />
      <Toasts />
      {!readOnly && <Shortcuts />}
    </ReactFlowProvider>
  );
}
